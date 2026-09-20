const pool = require('../db');

const SEUIL_SILENCE_MS = 15000; // 15 secondes = 3 ticks sans signal

// ── Sauvegarder le dernier signal reçu (upsert) ──────────
async function sauvegarderSignal(navire) {
  await pool.query(
    `INSERT INTO signaux_ais (navire_id, latitude, longitude, vitesse, cap, recu_a, est_estime)
     VALUES ($1, $2, $3, $4, $5, NOW(), FALSE)
     ON CONFLICT (navire_id) DO UPDATE
       SET latitude   = EXCLUDED.latitude,
           longitude  = EXCLUDED.longitude,
           vitesse    = EXCLUDED.vitesse,
           cap        = EXCLUDED.cap,
           recu_a     = NOW(),
           est_estime = FALSE`,
    [navire.id, navire.latitude, navire.longitude, navire.vitesse, navire.cap]
  );
}

// ── Estimer la position à partir du dernier signal ───────
function estimerPosition(signal, secondesEcoulees) {
  const vitesseKmS = (signal.vitesse * 1.852) / 3600;
  const capRad = (signal.cap * Math.PI) / 180;

  const deltaLat = (vitesseKmS * Math.cos(capRad) * secondesEcoulees) / 111;
  const deltaLon = (vitesseKmS * Math.sin(capRad) * secondesEcoulees) /
                   (111 * Math.cos(signal.latitude * Math.PI / 180));

  return {
    latitude:  signal.latitude  + deltaLat,
    longitude: signal.longitude + deltaLon,
    estime:    true,
  };
}

// ── Détecter les navires silencieux et générer positions estimées ──
async function traiterNaviresSilencieux() {
  const maintenant = Date.now();

  const { rows: signaux } = await pool.query(
    `SELECT s.recu_a, s.est_estime,
            n.id AS navire_id, n.nom, n.type, n.etat_navigation,
            n.latitude, n.longitude, n.vitesse, n.cap
     FROM signaux_ais s
     JOIN navires n ON s.navire_id = n.id
     WHERE n.id NOT IN (
       SELECT navire_id FROM attributions WHERE statut = 'CONFIRME'
     )`
  );

  const naviresEstimes = [];

  for (const signal of signaux) {
    const derniereReception = new Date(signal.recu_a).getTime();
    const silenceMs = maintenant - derniereReception;

    // ── CAS 1 : Signal revenu — navire était en AIS_PERDU ────
    if (silenceMs <= SEUIL_SILENCE_MS && signal.est_estime) {
      await pool.query(
        `UPDATE navires 
         SET latitude = $1, longitude = $2, etat_navigation = 'EN_MER_RETOUR'
         WHERE id = $3 AND etat_navigation = 'AIS_PERDU'`,
        [signal.latitude, signal.longitude, signal.navire_id]
      );
      await pool.query(
        `UPDATE signaux_ais SET est_estime = FALSE WHERE navire_id = $1`,
        [signal.navire_id]
      );
      console.log(`✅ Signal AIS rétabli — ${signal.nom} — retour position réelle`);
      continue; // pas besoin d'extrapoler
    }

    // ── CAS 2 : Silence trop long — extrapolation ────────────
    if (silenceMs > SEUIL_SILENCE_MS) {
      const secondesEcoulees = silenceMs / 1000;
      const posEstimee = estimerPosition(signal, secondesEcoulees);

      await pool.query(
        `UPDATE navires 
         SET latitude = $1, longitude = $2, etat_navigation = 'AIS_PERDU'
         WHERE id = $3`,
        [posEstimee.latitude, posEstimee.longitude, signal.navire_id]
      );

      await pool.query(
        `UPDATE signaux_ais SET est_estime = TRUE WHERE navire_id = $1`,
        [signal.navire_id]
      );

      console.log(
        `⚠ AIS PERDU — ${signal.nom} — silence: ${(silenceMs/1000).toFixed(0)}s` +
        ` — position estimée: ${posEstimee.latitude.toFixed(4)} / ${posEstimee.longitude.toFixed(4)}`
      );

      naviresEstimes.push({
        id:        signal.navire_id,
        nom:       signal.nom,
        type:      signal.type,
        latitude:  posEstimee.latitude,
        longitude: posEstimee.longitude,
        estime:    true,
        silenceMs,
      });
    }
  }

  return naviresEstimes;
}

module.exports = { sauvegarderSignal, estimerPosition, traiterNaviresSilencieux };