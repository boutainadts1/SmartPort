const express = require('express');
const router = express.Router();
const pool = require('../db');
const attributionService = require('../services/attributionService');
const { sendEvent } = require('../kafka/producer');
const { TOPIC_QUAI_LIBERER } = require('../kafka/topics');
const { isKafkaEnabled } = require('../kafka/utils');

// ── Quais ──────────────────────────────────────────────
router.get('/quais', async (req, res) => {
  const result = await pool.query('SELECT * FROM quais ORDER BY numero');
  res.json(result.rows);
});

router.put('/quais/:id/liberer', async (req, res) => {
  await pool.query(
    "UPDATE quais SET etat = 'DISPONIBLE', est_dispo = true WHERE id = $1",
    [req.params.id]
  );
  const file = await pool.query(
    `SELECT fa.id AS fa_id, fa.priorite,
            n.id AS navire_id, n.nom, n.type,
            n.longueur, n.tirant_eau, n.type_cargaison
     FROM file_attente fa
     JOIN navires n ON n.id = fa.navire_id
     WHERE fa.statut = 'EN_ATTENTE'
     ORDER BY fa.priorite ASC, fa.heure_entree ASC
     LIMIT 1`
  );
  if (file.rows.length > 0) {
    const row = file.rows[0];
    await pool.query("UPDATE file_attente SET statut='TRAITE' WHERE id=$1", [row.fa_id]);
    await attributionService.lancerAttribution(row);
  }
  res.json({ message: 'Quai libéré' });
});

// ── Navires — route unique avec etat_navigation et estime ──
router.get('/navires/positions', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT n.id, n.nom, n.type, n.latitude, n.longitude,
              n.vitesse, n.cap, n.tirant_eau, n.type_cargaison,
              n.etat_navigation,
              COALESCE(s.est_estime, FALSE) AS est_estime
       FROM navires n
       LEFT JOIN signaux_ais s ON s.navire_id = n.id`
    );
    res.json(result.rows);
  } catch (err) {
    console.error('[navires/positions]', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ── Routes de test AIS ─────────────────────────────────
router.put('/ais/forcer-zone/:id', async (req, res) => {
  await pool.query(
    'UPDATE navires SET latitude = $1, longitude = $2 WHERE id = $3',
    [36.72, 3.02, req.params.id]
  );
  res.json({ message: `Navire ${req.params.id} forcé dans la zone` });
});

router.put('/ais/forcer-tous', async (req, res) => {
  const positions = [
    [36.72, 3.02], [36.71, 3.01], [36.73, 3.03],
    [36.70, 3.00], [36.74, 3.04]
  ];
  const navires = await pool.query('SELECT id FROM navires LIMIT 5');
  for (let i = 0; i < navires.rows.length; i++) {
    const pos = positions[i] || positions[0];
    await pool.query(
      'UPDATE navires SET latitude = $1, longitude = $2 WHERE id = $3',
      [pos[0], pos[1], navires.rows[i].id]
    );
  }
  res.json({ message: `${navires.rows.length} navires forcés dans la zone` });
});

router.get('/ais/status', async (req, res) => {
  const navires = await pool.query('SELECT * FROM navires');
  const PORT_LAT = 36.7667, PORT_LON = 3.0500;
  const status = navires.rows.map(n => {
    const R    = 6371;
    const dLat = (PORT_LAT - n.latitude)  * Math.PI / 180;
    const dLon = (PORT_LON - n.longitude) * Math.PI / 180;
    const a    = Math.sin(dLat/2)**2 +
                 Math.cos(n.latitude * Math.PI/180) *
                 Math.cos(PORT_LAT   * Math.PI/180) *
                 Math.sin(dLon/2)**2;
    const dist = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return { id: n.id, nom: n.nom, type: n.type, latitude: n.latitude,
             longitude: n.longitude, distance_km: dist.toFixed(2), dans_zone: dist < 50 };
  });
  res.json(status);
});

// ── Test perte AIS ─────────────────────────────────────
router.post('/test/couper-ais/:id', async (req, res) => {
  await pool.query(
    `UPDATE signaux_ais SET recu_a = NOW() - INTERVAL '20 seconds'
     WHERE navire_id = $1 AND est_estime = FALSE`,
    [req.params.id]
  );
  res.json({ message: `AIS coupé pour ${req.params.id}` });
});

router.post('/test/retablir-ais/:id', async (req, res) => {
  await pool.query(
    `UPDATE signaux_ais SET recu_a = NOW()
     WHERE navire_id = $1 AND est_estime = FALSE`,
    [req.params.id]
  );
  res.json({ message: `AIS rétabli pour ${req.params.id}` });
});
// ── File d'attente ─────────────────────────────────────
router.get('/file-attente', async (req, res) => {
  const result = await pool.query(
    `SELECT fa.*, n.nom, n.type, n.type_cargaison
     FROM file_attente fa
     JOIN navires n ON fa.navire_id = n.id
     WHERE fa.statut = 'EN_ATTENTE'
     ORDER BY fa.priorite, fa.heure_entree`
  );
  res.json(result.rows);
});

// ── Attributions ───────────────────────────────────────
router.get('/attributions', async (req, res) => {
  const result = await pool.query(
    `SELECT a.*, n.nom, n.type, q.numero
     FROM attributions a
     JOIN navires n ON a.navire_id = n.id
     JOIN quais   q ON a.quai_id   = q.id
     ORDER BY a.date_heure DESC`
  );
  res.json(result.rows);
});

// ── Notifications ──────────────────────────────────────
router.get('/notifications', async (req, res) => {
  const result = await pool.query(
    `SELECT a.date_heure, n.nom AS navire, q.numero AS quai,
            a.statut, a.score, a.temps_traitement
     FROM attributions a
     JOIN navires n ON a.navire_id = n.id
     JOIN quais   q ON a.quai_id   = q.id
     ORDER BY a.date_heure DESC
     LIMIT 50`
  );
  res.json(result.rows);
});


module.exports = router;