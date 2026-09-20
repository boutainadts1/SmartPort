const pool = require('../../db');
/**
 * ExpertDisponibilite
 * ────────────────────
 * Condition : blackboard.phase === 'DISPONIBILITE'
 * Action    : parcourt blackboard.quaisConformes dans l'ordre de score,
 *             s'arrête au PREMIER quai disponible, attribue le quai.
 *             Si aucun disponible → phase 'FILE_ATTENTE'
 *             Si un disponible    → phase 'TERMINE'
 */
class ExpertDisponibilite {

  peutIntervenir(blackboard) {
    return blackboard.phase === 'DISPONIBILITE';
  }

  async intervenir(blackboard) {
    const { navire, quaisConformes } = blackboard;
    console.log(`[ExpertDisponibilite] Vérification disponibilité pour ${navire.nom}`);

    if (quaisConformes.length === 0) {
      console.log(`[ExpertDisponibilite] Aucun quai conforme → file d'attente`);
      blackboard.phase = 'FILE_ATTENTE';
      return;
    }

    // Parcourir dans l'ordre de score (meilleur en premier)
    for (const quai of quaisConformes) {
      // Re-vérifier la disponibilité en base (atomique pour éviter race condition)
      const { rows } = await pool.query(
        "SELECT * FROM quais WHERE id = $1 AND etat = 'DISPONIBLE' AND est_dispo = true",
        [quai.id]
      );

      if (rows.length > 0) {
        console.log(`[ExpertDisponibilite] Quai ${quai.numero} disponible (score ${quai.score.toFixed(1)}) ✓`);
        blackboard.quaiAttribue = { ...rows[0], score: quai.score };
        blackboard.score        = quai.score;
        blackboard.phase        = 'TERMINE';
        return; // ← s'arrête au premier disponible
      }

      console.log(`[ExpertDisponibilite] Quai ${quai.numero} occupé, suivant…`);
    }

    // Aucun quai disponible parmi les conformes
    console.log(`[ExpertDisponibilite] Aucun quai disponible → file d'attente`);
    blackboard.phase = 'FILE_ATTENTE';
  }
}

module.exports = ExpertDisponibilite;