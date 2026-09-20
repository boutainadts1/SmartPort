const pool = require('../../db');

/**
 * ExpertConformite
 * ─────────────────
 * Condition : blackboard.phase === 'DETECTION'
 * Action    : applique l'algorithme de scoring sur TOUS les quais physiquement
 *             compatibles (longueur + tirant d'eau), classe par score décroissant,
 *             écrit la liste ordonnée dans blackboard.quaisConformes
 * Transition: phase → 'DISPONIBILITE'
 */
class ExpertConformite {

  peutIntervenir(blackboard) {
    return blackboard.phase === 'DETECTION';
  }

  async intervenir(blackboard) {
    const { navire } = blackboard;
    console.log(`[ExpertConformite] Analyse conformité pour ${navire.nom}`);

    // Récupérer TOUS les quais physiquement compatibles (disponibles ou non)
    const { rows: quais } = await pool.query(
      `SELECT * FROM quais
       WHERE longueur       >= $1
         AND tirant_eau_max >= $2`,
      [navire.longueur, navire.tirant_eau]
    );

    if (quais.length === 0) {
      console.log(`[ExpertConformite] Aucun quai physiquement compatible pour ${navire.nom}`);
      blackboard.quaisConformes = [];
      blackboard.phase = 'DISPONIBILITE'; // ExpertDisponibilite constatera et mettra en file
      return;
    }

    // Algorithme de scoring (identique à l'ancien attributionService)
    const quaisScores = quais.map(quai => {
      let score = 0;
      score += (1 - Math.abs(quai.tirant_eau_max - navire.tirant_eau) / quai.tirant_eau_max) * 40;
      score += (1 - Math.abs(quai.longueur       - navire.longueur)   / quai.longueur)       * 30;
      if (quai.equipements?.includes(navire.type_cargaison)) score += 30;
      return { ...quai, score };
    });

    // Trier du meilleur score au moins bon
    quaisScores.sort((a, b) => b.score - a.score);

    blackboard.quaisConformes = quaisScores;
    blackboard.phase = 'DISPONIBILITE';

    console.log(`[ExpertConformite] ${quaisScores.length} quai(s) conforme(s) → [${quaisScores.map(q => `Q${q.numero}(${q.score.toFixed(1)})`).join(', ')}]`);
  }
}

module.exports = ExpertConformite;