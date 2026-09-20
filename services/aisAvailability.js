const pool = require('../db');

const SEUIL_SILENCE_MS = 10000; // 10 secondes = 2 ticks sans signal

// ── Sauvegarder le dernier signal reçu (upsert) ──────────
async function sauvegarderSignal(navire) {
  await pool.query(
    `INSERT INTO signaux_ais (navire_id, latitude, longitude, vitesse, cap, recu_a)
     VALUES ($1, $2, $3, $4, $5, NOW())
     ON CONFLICT (navire_id) DO UPDATE
       SET latitude  = EXCLUDED.latitude,
           longitude = EXCLUDED.longitude,
           vitesse   = EXCLUDED.vitesse,
           cap       = EXCLUDED.cap,
           recu_a    = NOW()`,
    [navire.id, navire.latitude, navire.longitude, navire.vitesse, navire.cap]
  );
}

// ── Estimer la position à partir du dernier signal ───────
// On estime seulement sur 5s (1 tick) pour éviter la dérive
function estimerPosition(signal) {
  const secondesUnTick = 5;
  const vitesseKmS = (signal.vitesse * 1.852) / 3600;
  const capRad     = (signal.cap * Math.PI) / 180;

  const deltaLat = (vitesseKmS * Math.cos(capRad) * secondesUnTick) / 111;
  const deltaLon = (vitesseKmS * Math.sin(capRad) * secondesUnTick) /
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
    `SELECT s.*, n.nom, n.type, n.etat_navigation, n.vitesse AS nav_vitesse, n.cap AS nav_cap
     FROM signaux_ais s
     JOIN navires n ON s.navire_id = n.id
     WHERE n.id NOT IN (
       SELECT navire_id FROM attributions WHERE statut = 'CONFIRME'
     )`
  );

  const naviresEstimes = [];

  for (const signal of signaux) {
    const silenceMs = maintenant - new Date(signal.recu_a).getTime();

    if (silenceMs > SEUIL_SILENCE_MS) {

      // ── Estimer la nouvelle position (avance d'un tick de 5s) ──
      const posEstimee = estimerPosition(signal);

      // ── Mettre à jour navires avec position estimée ───────────
      await pool.query(
        `UPDATE navires 
         SET latitude        = $1,
             longitude       = $2,
             etat_navigation = 'AIS_PERDU'
         WHERE id = $3`,
        [posEstimee.latitude, posEstimee.longitude, signal.navire_id]
      );

      // ── Avancer signaux_ais pour que le prochain tick parte
      //    de la nouvelle position estimée (recu_a reste figé) ──
      await pool.query(
        `UPDATE signaux_ais
         SET latitude  = $1,
             longitude = $2
         WHERE navire_id = $3`,
        [posEstimee.latitude, posEstimee.longitude, signal.navire_id]
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

      console.log(
        `⚠ AIS PERDU — ${signal.nom} — silence: ${(silenceMs/1000).toFixed(0)}s` +
        ` — pos estimée: ${posEstimee.latitude.toFixed(4)} / ${posEstimee.longitude.toFixed(4)}`
      );

      // ── KUBERNETES RESTART ────────────────────────────────────
      // TODO (camarade) : si silenceMs > 60000ms (1 minute)
      // déclencher le redémarrage du pod AIS :
      // kubectl rollout restart deployment/service-ais
      // ou via @kubernetes/client-node
      // ─────────────────────────────────────────────────────────

    } else {
    // Signal frais — si le navire était AIS_PERDU, le rétablir
    if (signal.etat_navigation === 'AIS_PERDU') {
      await pool.query(
        `UPDATE navires SET etat_navigation = 'EN_MER_RETOUR' WHERE id = $1`,
        [signal.navire_id]
      );
      console.log(`✅ AIS RÉTABLI — ${signal.nom}`);
    }
    }
  }

  return naviresEstimes;
}

module.exports = { sauvegarderSignal, estimerPosition, traiterNaviresSilencieux };