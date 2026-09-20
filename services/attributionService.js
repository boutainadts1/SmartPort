const pool = require('../db');

/**
 * AttributionService
 * Contient l'algorithme de scoring et d'attribution des quais
 * Appelé par AttributionObserver après détection du navire dans la zone
 */
async function lancerAttribution(navire) {
  const debut = Date.now();

  const criteres = await pool.query(
    'SELECT * FROM criteres_attribution WHERE type_navire = $1',
    [navire.type]
  );

  const quais = await pool.query(
    "SELECT * FROM quais WHERE etat = 'DISPONIBLE' AND longueur >= $1 AND tirant_eau_max >= $2",
    [navire.longueur, navire.tirant_eau]
  );

  if (quais.rows.length === 0) {
    await _ajouterFileAttente(navire, criteres.rows[0]);

    // Notifier dashboard (structure vide)
    const dash = require('./dashboardService');
    await dash.notifierFileAttente({ navire, priorite: _calculerPriorite(navire).valeur });

    return { statut: 'EN_ATTENTE', navire: navire.nom };
  }

  // Algorithme de scoring
  let meilleurQuai = null, meilleurScore = 0;

  for (const quai of quais.rows) {
    let score = 0;
    score += (1 - Math.abs(quai.tirant_eau_max - navire.tirant_eau) / quai.tirant_eau_max) * 40;
    score += (1 - Math.abs(quai.longueur - navire.longueur) / quai.longueur) * 30;
    if (quai.equipements?.includes(navire.type_cargaison)) score += 30;
    if (score > meilleurScore) { meilleurScore = score; meilleurQuai = quai; }
  }

  const dureeSimulation = Math.floor(Math.random() * 60 + 30);
  const tempsTraitement = Date.now() - debut;

  await pool.query(
    `INSERT INTO attributions (navire_id, quai_id, statut, score, temps_traitement, duree_simulation)
     VALUES ($1, $2, 'CONFIRME', $3, $4, $5)`,
    [navire.id, meilleurQuai.id, meilleurScore, tempsTraitement, dureeSimulation]
  );

  await pool.query(
    "UPDATE quais SET etat = 'OCCUPE', est_dispo = false WHERE id = $1",
    [meilleurQuai.id]
  );

  // ── Appel Dashboard (structure vide) ──────────────────
  const dash = require('./dashboardService');
  await dash.notifierAttribution({ navire, quai: meilleurQuai, score: meilleurScore });

  // ── Appel Pipe & Filter (structure vide) ──────────────
  const pipe = require('../pipes/pipeFilterService');
  await pipe.traiterEscale({ navire, quai: meilleurQuai });

  // Notification console
  _notifier(navire, meilleurQuai, meilleurScore);

  console.log(`⏱ Durée escale simulée : ${dureeSimulation}s`);

  return {
    statut:       'CONFIRME',
    quai:         meilleurQuai.numero,
    score:        meilleurScore,
    temps:        tempsTraitement,
    duree_escale: dureeSimulation
  };
}

async function _ajouterFileAttente(navire, critere) {
  const priorite = _calculerPriorite(navire);
  await pool.query(
    `INSERT INTO file_attente (navire_id, priorite, raison_priorite)
     VALUES ($1, $2, $3)
     ON CONFLICT (navire_id) DO NOTHING`,
    [navire.id, priorite.valeur, priorite.raison]
  );
  console.log(`📋 ${navire.nom} → File d'attente (P${priorite.valeur} — ${priorite.raison})`);
}

function _calculerPriorite(navire) {
  if (navire.type === 'Ferry')                    return { valeur: 1, raison: 'Transport passagers' };
  if (navire.type_cargaison === 'hydrocarbures')  return { valeur: 1, raison: 'Cargaison critique' };
  if (navire.type === 'PorteConteneurs')          return { valeur: 2, raison: 'Commerce prioritaire' };
  return { valeur: 3, raison: 'Standard' };
}

function _notifier(navire, quai, score) {
  console.log(`NOTIFICATION → Pilote   : ${navire.nom} → Quai ${quai.numero} (score ${score.toFixed(1)})`);
  console.log(`NOTIFICATION → Lamanage : Préparer quai ${quai.numero} pour ${navire.nom}`);
}

module.exports = { lancerAttribution };