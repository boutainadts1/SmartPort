const pool = require('../../db');

/**
 * ExpertFileAttente
 * ──────────────────
 * Condition : blackboard.phase === 'FILE_ATTENTE'
 * Action 1  : insère le navire courant dans la file d'attente
 * Action 2  : (appelé explicitement après libération d'un quai)
 *             rejoue le cycle Conformité→Disponibilité pour les navires
 *             en attente, du plus prioritaire au moins prioritaire,
 *             en filtrant par les quais qui viennent d'être libérés
 */
class ExpertFileAttente {

  constructor(scheduler) {
    // Référence au scheduler pour pouvoir relancer un cycle complet
    this.scheduler = scheduler;
  }

  peutIntervenir(blackboard) {
    return blackboard.phase === 'FILE_ATTENTE';
  }

  async intervenir(blackboard) {
    const { navire } = blackboard;
    const priorite   = this._calculerPriorite(navire);

    await pool.query(
      `INSERT INTO file_attente (navire_id, priorite, raison_priorite)
       VALUES ($1, $2, $3)
       ON CONFLICT (navire_id) DO NOTHING`,
      [navire.id, priorite.valeur, priorite.raison]
    );

    console.log(`[ExpertFileAttente] ${navire.nom} → File d'attente P${priorite.valeur} (${priorite.raison})`);

    // Notifier le dashboard
    const dash = require('../services/dashboardService');
    await dash.notifierFileAttente({ navire, priorite: priorite.valeur });

    blackboard.statut = 'EN_ATTENTE';
    blackboard.phase  = 'TERMINE';
  }

  /**
   * Appelé par le cron après libération d'un quai
   * Rejoue le cycle pour chaque navire en file, du plus prioritaire au moins
   */
  async rejouerPourQuaiLibere(quaiLibereId) {
    console.log(`[ExpertFileAttente] Quai ${quaiLibereId} libéré → traitement file d'attente`);

    const { rows: enAttente } = await pool.query(
      `SELECT fa.id AS fa_id, fa.priorite,
              n.id AS navire_id, n.nom, n.type,
              n.longueur, n.tirant_eau, n.type_cargaison,
              n.latitude, n.longitude
       FROM file_attente fa
       JOIN navires n ON n.id = fa.navire_id
       WHERE fa.statut = 'EN_ATTENTE'
       ORDER BY fa.priorite ASC, fa.heure_entree ASC`
    );

    if (enAttente.length === 0) {
      console.log(`[ExpertFileAttente] File d'attente vide`);
      return;
    }

    for (const row of enAttente) {
      const navire = {
        id:             row.navire_id,
        nom:            row.nom,
        type:           row.type,
        longueur:       row.longueur,
        tirant_eau:     row.tirant_eau,
        type_cargaison: row.type_cargaison,
        latitude:       row.latitude,
        longitude:      row.longitude,
      };

      console.log(`[ExpertFileAttente] Tentative pour ${navire.nom} (P${row.priorite})`);

      // Lancer un cycle complet via le scheduler
      const resultat = await this.scheduler.lancerCycle(navire);

      if (resultat.statut === 'ATTRIBUE') {
        // Marquer comme traité dans la file
        await pool.query(
          "UPDATE file_attente SET statut = 'TRAITE' WHERE id = $1",
          [row.fa_id]
        );
        console.log(`[ExpertFileAttente] ${navire.nom} attribué depuis la file ✓`);
        // Un seul navire par quai libéré — s'arrêter
        break;
      }
      // Sinon le navire reste en file, passer au suivant
    }
  }

  _calculerPriorite(navire) {
    if (navire.type === 'Ferry')                    return { valeur: 1, raison: 'Transport passagers' };
    if (navire.type_cargaison === 'hydrocarbures')  return { valeur: 1, raison: 'Cargaison critique' };
    if (navire.type === 'PorteConteneurs')          return { valeur: 2, raison: 'Commerce prioritaire' };
    return { valeur: 3, raison: 'Standard' };
  }
}

module.exports = ExpertFileAttente;