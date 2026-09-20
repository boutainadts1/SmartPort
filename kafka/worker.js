require('dotenv').config();

const kafka = require('./client');
const { TOPIC_NAVIRE_DETECTED, TOPIC_QUAI_LIBERER, TOPIC_AIS_SIMULE } = require('./topics');
const { isKafkaEnabled } = require('./utils');
const BlackboardScheduler = require('../blackboard/BlackboardScheduler');
const pool = require('../db');

const groupId = process.env.KAFKA_GROUP_ID || 'alog-workers';
const consumer = kafka.consumer({ groupId });
const scheduler = new BlackboardScheduler();

async function navireAlreadyProcessed(navireId) {
  const attrib = await pool.query(
    "SELECT 1 FROM attributions WHERE navire_id = $1 AND statut = 'CONFIRME' LIMIT 1",
    [navireId]
  );
  if (attrib.rows.length > 0) return true;

  const waiting = await pool.query(
    "SELECT 1 FROM file_attente WHERE navire_id = $1 AND statut = 'EN_ATTENTE' LIMIT 1",
    [navireId]
  );
  return waiting.rows.length > 0;
}

async function getNavireFromPayload(payload) {
  if (payload.navire) return payload.navire;
  const result = await pool.query('SELECT * FROM navires WHERE id = $1', [payload.navire_id]);
  return result.rows[0];
}

async function handleNavireDetected(payload) {
  if (!payload || !payload.navire_id) {
    console.warn('[worker] navire.detected missing navire_id');
    return;
  }

  const already = await navireAlreadyProcessed(payload.navire_id);
  if (already) {
    console.log(`[worker] navire ${payload.navire_id} already processed, skip`);
    return;
  }

  const navire = await getNavireFromPayload(payload);
  if (!navire) {
    console.warn(`[worker] navire ${payload.navire_id} not found`);
    return;
  }

  await scheduler.lancerCycle(navire);
}

async function handleQuaiLiberer(payload) {
  if (!payload || !payload.quai_id) {
    console.warn('[worker] quai.liberer missing quai_id');
    return;
  }
  await scheduler.traiterApresLiberation(payload.quai_id, payload.navire_id || null);
}

// ── CAS retour de panne : position simulée reçue depuis Kafka ──
async function handleAisSimule(payload) {
  if (!payload || !payload.navire_id) {
    console.warn('[worker] ais.simule missing navire_id');
    return;
  }

  // Mettre à jour la position du navire en BDD
  await pool.query(
    `UPDATE navires 
     SET latitude=$1, longitude=$2, etat_navigation='AIS_PERDU'
     WHERE id=$3`,
    [payload.latitude, payload.longitude, payload.navire_id]
  );

  // Mettre à jour signaux_ais avec la position estimée
  // → au retour de panne, on repart de la dernière position simulée et non de 1h en arrière
  await pool.query(
    `UPDATE signaux_ais 
     SET latitude=$1, longitude=$2, recu_a=to_timestamp($3/1000.0), est_estime=TRUE
     WHERE navire_id=$4`,
    [payload.latitude, payload.longitude, payload.timestamp, payload.navire_id]
  );

  console.log(`[worker] AIS simulé appliqué — ${payload.navire_id} → ${payload.latitude.toFixed(4)} / ${payload.longitude.toFixed(4)}`);
}

async function start() {
  if (!isKafkaEnabled()) {
    console.warn('[worker] KAFKA_ENABLED is not true. Worker will still run.');
  }

  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC_NAVIRE_DETECTED, fromBeginning: false });
  await consumer.subscribe({ topic: TOPIC_QUAI_LIBERER,     fromBeginning: false });
  await consumer.subscribe({ topic: TOPIC_AIS_SIMULE,       fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, message }) => {
      try {
        const value   = message.value ? message.value.toString() : '{}';
        const payload = JSON.parse(value);

        if (topic === TOPIC_NAVIRE_DETECTED) {
          await handleNavireDetected(payload);
        } else if (topic === TOPIC_QUAI_LIBERER) {
          await handleQuaiLiberer(payload);
        } else if (topic === TOPIC_AIS_SIMULE) {
          await handleAisSimule(payload);
        } else {
          console.log(`[worker] Unknown topic ${topic}`);
        }
      } catch (err) {
        console.error('[worker] Error handling message:', err.message);
      }
    },
  });
}

async function shutdown() {
  try {
    await consumer.disconnect();
  } finally {
    process.exit(0);
  }
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

start().catch((err) => {
  console.error('[worker] Fatal error:', err.message);
  process.exit(1);
});
