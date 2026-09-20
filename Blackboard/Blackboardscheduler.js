const pool               = require('../db');
const Blackboard         = require('./Blackboard');
const ExpertConformite   = require('./experts/ExpertConformite');
const ExpertDisponibilite = require('./experts/ExpertDisponibilite');
const ExpertFileAttente  = require('./experts/ExpertFileAttente');
const ExpertConflits     = require('./experts/ExpertConflits');

/**
 * BlackboardScheduler
 * ────────────────────
 * Orchestre les 4 experts en lisant la phase du blackboard à chaque étape.
 * Les experts ne se connaissent pas — seul le scheduler les appelle.
 *
 * Cycle normal :
 *   DETECTION → [ExpertConformite] → DISPONIBILITE
 *             → [ExpertConflits vérification verrou]
 *             → [ExpertDisponibilite] → TERMINE (attribué)
 *                                    → FILE_ATTENTE
 *             → [ExpertFileAttente] → TERMINE (en attente)
 *
 * Après libération quai :
 *   [ExpertFileAttente.rejouerPourQuaiLibere] → relance lancerCycle pour chaque navire en file
 */
class BlackboardScheduler {

  constructor() {
    this.expertConformite    = new ExpertConformite();
    this.expertDisponibilite = new ExpertDisponibilite();
    this.expertConflits      = new ExpertConflits();
    // ExpertFileAttente a besoin de `this` pour relancer des cycles
    this.expertFileAttente   = new ExpertFileAttente(this);

    // Navires dont le cycle est déjà en cours (anti-doublon)
    this._enTraitement = new Set();
  }

  /**
   * Point d'entrée principal — appelé par l'observer AIS quand un navire entre dans la zone
   */
  async lancerCycle(navire) {
    // Anti-doublon : si un cycle tourne déjà pour ce navire, on ignore
    if (this._enTraitement.has(navire.id)) {
      console.log(`[Scheduler] Cycle déjà en cours pour ${navire.nom} — ignoré`);
      return { statut: 'EN_COURS' };
    }
    this._enTraitement.add(navire.id);

    const bb = new Blackboard(navire);
    let verrouilleQuaiId = null;

    try {
      // ── Étape 1 : Conformité ───────────────────────────────────────
      if (this.expertConformite.peutIntervenir(bb)) {
        await this.expertConformite.intervenir(bb);
      }

      // ── Étape 2 : Conflit + Disponibilité ─────────────────────────
      if (this.expertDisponibilite.peutIntervenir(bb)) {

        // Pré-sélection du meilleur quai conforme disponible (lecture seule)
        // pour poser le verrou AVANT l'écriture en base
        const quaiCandidat = await this._trouverCandidatDisponible(bb.quaisConformes);

        if (quaiCandidat) {
          // Tenter de poser le verrou (ExpertConflits)
          const verrouOk = this.expertConflits.poserVerrou(quaiCandidat.id, navire.id);

          if (!verrouOk) {
            // Conflit → renvoyer en file
            this.expertConflits.resoudre(bb);
          } else {
            verrouilleQuaiId = quaiCandidat.id;
            // Laisser ExpertDisponibilite confirmer l'attribution
            await this.expertDisponibilite.intervenir(bb);
          }
        } else {
          // Aucun quai disponible, ExpertDisponibilite positionne en FILE_ATTENTE
          await this.expertDisponibilite.intervenir(bb);
        }
      }

      // ── Étape 3 : File d'attente ───────────────────────────────────
      if (this.expertFileAttente.peutIntervenir(bb)) {
        await this.expertFileAttente.intervenir(bb);
      }

      // ── Étape 4 : Persistance si attribution confirmée ────────────
      if (bb.phase === 'TERMINE' && bb.quaiAttribue) {
        await this._persisterAttribution(bb);
        bb.statut = 'ATTRIBUE';
      }

      console.log(`[Scheduler] Cycle terminé pour ${navire.nom} → ${bb.statut}`);
      return { statut: bb.statut, quai: bb.quaiAttribue?.numero, score: bb.score };

    } catch (err) {
      console.error(`[Scheduler] Erreur cycle ${navire.nom}:`, err.message);
      bb.erreur = err.message;
      return { statut: 'ERREUR', erreur: err.message };

    } finally {
      // Libérer le verrou si attribution confirmée (sinon il reste pour protéger)
      if (verrouilleQuaiId && bb.statut === 'ATTRIBUE') {
        this.expertConflits.libererVerrou(verrouilleQuaiId);
      }
      // Libérer le slot de traitement sauf si en attente (on doit pouvoir retenter)
      if (bb.statut !== 'EN_ATTENTE') {
        this._enTraitement.delete(navire.id);
      }
    }
  }

  /**
   * Appelé par le cron après libération d'un quai
   * Libère aussi le slot de traitement pour que le navire en file puisse être retraité
   */
  async traiterApresLiberation(quaiId, navireLibereId) {
    this._enTraitement.delete(navireLibereId);
    await this.expertFileAttente.rejouerPourQuaiLibere(quaiId);
  }

  /**
   * Libère le slot d'un navire (ex : après départ définitif)
   */
  liberer(navireId) {
    this._enTraitement.delete(navireId);
    console.log(`[Scheduler] Slot libéré pour navire ${navireId}`);
  }

  // ── Helpers privés ─────────────────────────────────────────────────

  /**
   * Lecture seule : trouve le premier quai disponible parmi la liste conformes
   * (utilisé pour poser le verrou avant écriture)
   */
  async _trouverCandidatDisponible(quaisConformes) {
    for (const quai of quaisConformes) {
      const { rows } = await pool.query(
        "SELECT id FROM quais WHERE id = $1 AND etat = 'DISPONIBLE' AND est_dispo = true",
        [quai.id]
      );
      if (rows.length > 0) return quai;
    }
    return null;
  }

  /**
   * Persiste l'attribution confirmée en base + notifications
   */
  async _persisterAttribution(bb) {
    const { navire, quaiAttribue, score } = bb;
    const dureeSimulation  = Math.floor(Math.random() * 60 + 30);
    const tempsTraitement  = Date.now() - bb.tempsTraitement;

    bb.dureeSimulation = dureeSimulation;

    await pool.query(
      `INSERT INTO attributions (navire_id, quai_id, statut, score, temps_traitement, duree_simulation)
       VALUES ($1, $2, 'CONFIRME', $3, $4, $5)`,
      [navire.id, quaiAttribue.id, score, tempsTraitement, dureeSimulation]
    );

    await pool.query(
      "UPDATE quais SET etat = 'OCCUPE', est_dispo = false WHERE id = $1",
      [quaiAttribue.id]
    );

    console.log(`NOTIFICATION → Pilote   : ${navire.nom} → Quai ${quaiAttribue.numero} (score ${score.toFixed(1)})`);
    console.log(`NOTIFICATION → Lamanage : Préparer quai ${quaiAttribue.numero} pour ${navire.nom}`);
    console.log(`⏱ Durée escale simulée : ${dureeSimulation}s`);

    // Dashboard
    const dash = require('../services/dashboardService');
    await dash.notifierAttribution({ navire, quai: quaiAttribue, score });

    // Pipe & Filter
    const pipe = require('../pipes/pipeFilterService');
    await pipe.traiterEscale({ navire, quai: quaiAttribue });
  }
}

module.exports = BlackboardScheduler;