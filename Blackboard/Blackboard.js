/**
 * Blackboard — État partagé central
 * Les 4 experts lisent et écrivent uniquement ici
 * Aucun expert ne connaît les autres
 */
class Blackboard {
  constructor(navire) {
    this.navire         = navire;
    this.phase          = 'DETECTION';      // phase courante
    this.quaisConformes = [];               // rempli par ExpertConformite
    this.quaiAttribue   = null;             // rempli par ExpertDisponibilite
    this.conflit        = false;            // levé par ExpertConflits
    this.statut         = null;             // 'ATTRIBUE' | 'EN_ATTENTE' | 'CONFLIT_RESOLU'
    this.score          = null;
    this.erreur         = null;
    this.dureeSimulation = null;
    this.tempsTraitement = Date.now();
  }
}

module.exports = Blackboard;