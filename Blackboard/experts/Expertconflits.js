/**
 * ExpertConflits
 * ───────────────
 * Condition : blackboard.phase === 'DISPONIBILITE'
 *             ET le quai candidat est déjà verrouillé par un autre cycle concurrent
 * Action    : détecte les doubles attributions (2 navires qui arrivent au même tick),
 *             le premier ayant posé un verrou gagne, le second est redirigé en file.
 *
 * Mécanisme : verrou en mémoire (Map) + vérification base avant INSERT.
 *             L'expert s'intercale AVANT l'écriture finale dans ExpertDisponibilite.
 */
class ExpertConflits {

  constructor() {
    // Verrous en mémoire : quaiId → navireId (premier arrivé)
    this._verrous = new Map();
  }

  /**
   * Tente de poser un verrou sur le quai pour ce navire.
   * Retourne true si le verrou est accordé (pas de conflit).
   * Retourne false si un autre navire a déjà le verrou (conflit détecté).
   */
  poserVerrou(quaiId, navireId) {
    if (this._verrous.has(quaiId)) {
      const detenteur = this._verrous.get(quaiId);
      if (detenteur !== navireId) {
        console.log(`[ExpertConflits] ⚠️  CONFLIT détecté sur Quai ${quaiId} — navire ${navireId} bloqué (verrou par ${detenteur})`);
        return false; // conflit
      }
      return true; // même navire, pas de conflit
    }
    this._verrous.set(quaiId, navireId);
    console.log(`[ExpertConflits] Verrou posé Quai ${quaiId} → navire ${navireId}`);
    return true;
  }

  /**
   * Libère le verrou après attribution confirmée ou abandon
   */
  libererVerrou(quaiId) {
    if (this._verrous.has(quaiId)) {
      console.log(`[ExpertConflits] Verrou libéré Quai ${quaiId}`);
      this._verrous.delete(quaiId);
    }
  }

  /**
   * Résout un conflit sur le blackboard :
   * marque le blackboard comme conflictuel et renvoie en file d'attente
   */
  resoudre(blackboard) {
    blackboard.conflit       = true;
    blackboard.quaiAttribue  = null;
    blackboard.phase         = 'FILE_ATTENTE';
    console.log(`[ExpertConflits] Navire ${blackboard.navire.nom} renvoyé en file suite à conflit`);
  }
}

module.exports = ExpertConflits;