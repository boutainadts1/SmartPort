const cron                = require('node-cron');
const pool                = require('../db');
const AISSubject          = require('../subjects/AISSubject');
const AttributionObserver = require('../observers/AttributionObserver');
const { traiterNaviresSilencieux } = require('../services/aisWatchdog');
const { sendEvent } = require('../kafka/producer');
const { TOPIC_NAVIRE_DETECTED } = require('../kafka/topics');
const { TOPIC_QUAI_LIBERER } = require('../kafka/topics');
// ════════════════════════════════════════════════════════
//  Instanciation du patron Observer + Blackboard
//  Subject  : AISSubject
//  Observer : AttributionObserver  (délègue au BlackboardScheduler)
// ════════════════════════════════════════════════════════
const aisSubject          = new AISSubject();
const attributionObserver = new AttributionObserver(); // plus besoin de passer attributionService

// L'observer s'abonne au subject
aisSubject.subscribe(attributionObserver);

const PORT_LAT = 36.7667;
const PORT_LON = 3.0500;

let tickEnCours = false;

// ── Gérer les départs (escales terminées) ────────────────
async function gererDeparts() {
  const { rows } = await pool.query(
    `SELECT a.id AS attr_id, a.navire_id, a.quai_id, n.nom, q.numero, q.id AS quai_id_reel
     FROM attributions a
     JOIN navires n ON a.navire_id = n.id
     JOIN quais   q ON a.quai_id   = q.id
     WHERE a.statut = 'CONFIRME'
       AND NOW() > a.date_heure + (a.duree_simulation || ' seconds')::interval`
  );

  for (const e of rows) {
    console.log(`\n🏁 ${e.nom} quitte le Quai ${e.numero}`);

    await pool.query("UPDATE quais SET etat='DISPONIBLE', est_dispo=true WHERE id=$1", [e.quai_id]);
    await pool.query("UPDATE attributions SET statut='LIBERE' WHERE id=$1", [e.attr_id]);

    const distanceMax = 150 + Math.random() * 200;

    await pool.query(
      `UPDATE navires 
       SET etat_navigation = 'EN_MER_DEPART',
           distance_max    = $1,
           vitesse         = $2
       WHERE id = $3`,
      [distanceMax, 12 + Math.random() * 8, e.navire_id]
    );

    console.log(` ${e.nom} repart en mer — distance max : ${distanceMax.toFixed(0)} km`);

    const dash = require('../services/dashboardService');
    await dash.notifierDepart({ navire: { nom: e.nom }, quai: { numero: e.numero } });

    // ── Notifier l'observer avec navireId ET quaiId ──────
    // L'observer déclenche le Blackboard pour la file d'attente
    await sendEvent(TOPIC_QUAI_LIBERER, {
  navire_id: e.navire_id,
  quai_id:   e.quai_id
});
  }
}

// ════════════════════════════════════════════════════════
//  TICK PRINCIPAL — toutes les 5 secondes
// ════════════════════════════════════════════════════════
cron.schedule('*/5 * * * * *', async () => {
  if (tickEnCours) { console.log('⏭ Tick ignoré'); return; }
  tickEnCours = true;

  try {
    console.log('\n=== Tick AIS ===', new Date().toLocaleTimeString());

    // 1 — Gérer les escales terminées
    await gererDeparts();

    // 2 — Récupérer navires libres (ni en escale, ni en file)
    const { rows: navires } = await pool.query(
      `SELECT * FROM navires
       WHERE id NOT IN (SELECT navire_id FROM attributions WHERE statut = 'CONFIRME')
         AND id NOT IN (SELECT navire_id FROM file_attente  WHERE statut = 'EN_ATTENTE')`
    );

    if (navires.length === 0) {
      console.log('Aucun navire libre en approche');
      return;
    }

    // 3 — Mettre à jour positions et traiter les signaux AIS
    for (const navire of navires) {

      const distActuelle = aisSubject._calculerDistance(navire.latitude, navire.longitude);

      let nouvLat, nouvLon, nouvelEtat;

      if (navire.etat_navigation === 'EN_MER_DEPART') {
        nouvLat    = navire.latitude  - (PORT_LAT - navire.latitude)  * 0.05;
        nouvLon    = navire.longitude - (PORT_LON - navire.longitude) * 0.05;
        nouvelEtat = 'EN_MER_DEPART';

        const nouvDist = aisSubject._calculerDistance(nouvLat, nouvLon);
        if (nouvDist >= navire.distance_max) {
          nouvelEtat = 'EN_MER_RETOUR';
          console.log(`🔄 ${navire.nom} fait demi-tour à ${nouvDist.toFixed(0)} km — retour vers port`);
        }
      } else {
        nouvLat    = navire.latitude  + (PORT_LAT - navire.latitude)  * 0.05;
        nouvLon    = navire.longitude + (PORT_LON - navire.longitude) * 0.05;
        nouvelEtat = 'EN_MER_RETOUR';
      }
if (navire.etat_navigation !== 'AIS_PERDU') {
  await pool.query(
    'UPDATE navires SET latitude=$1, longitude=$2, etat_navigation=$3 WHERE id=$4',
    [nouvLat, nouvLon, nouvelEtat, navire.id]
  );
}
      // Enregistrer le signal AIS réel reçu
// Enregistrer le signal AIS réel reçu
/*if (navire.etat_navigation !== 'AIS_PERDU') {
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
    [navire.id, nouvLat, nouvLon, navire.vitesse, navire.cap]
  );
}*/
 if (navire.id !== 'IMO2001') {  // ← ajoute juste cette condition
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
      [navire.id, nouvLat, nouvLon, navire.vitesse, navire.cap]
    );
  }
  // ← ferme ici

      const distance = aisSubject._calculerDistance(nouvLat, nouvLon);

      const emoji = navire.etat_navigation === 'EN_MER_DEPART' ? '🔵 En départ' :
                    distance < 50                              ? '🔴 DANS LA ZONE' : '🟢 En retour';

      console.log(`${navire.nom} (${navire.type}) — ${distance.toFixed(1)} km — ${emoji}`);

      // Ne déclencher l'attribution que si le navire revient (pas pendant le départ)
      if (distance < aisSubject.SEUIL_KM && navire.etat_navigation === 'EN_MER_RETOUR') {
       await sendEvent(TOPIC_NAVIRE_DETECTED, {
  navire_id: navire.id,
  navire: { ...navire, latitude: nouvLat, longitude: nouvLon }
});
      }
    }
await traiterNaviresSilencieux();

  } 
  finally {
    tickEnCours = false;
  }
});