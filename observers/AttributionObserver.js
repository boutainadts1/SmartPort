const IObserver = require('./IObserver');
const BlackboardScheduler = require('../blackboard/BlackboardScheduler');
const { sendEvent } = require('../kafka/producer');
const { TOPIC_NAVIRE_DETECTED, TOPIC_QUAI_LIBERER } = require('../kafka/topics');
const { isKafkaEnabled } = require('../kafka/utils');

/**
 * AttributionObserver — Observer principal (inchangé côté interface)
 * ──────────────────────────────────────────────────────────────────
 * S'abonne au AISSubject comme avant.
 * Délègue maintenant au BlackboardScheduler au lieu d'appeler
 * directement attributionService.
 *
 * Le scheduler et ses 4 experts sont complètement transparents ici.
 */
class AttributionObserver extends IObserver {

  constructor() {
    super();
    // Le scheduler est la seule dépendance — il contient les 4 experts
    this.scheduler = new BlackboardScheduler();
  }

  async onNavireDetecte(navire, distance) {
    if (isKafkaEnabled()) {
      try {
        await sendEvent(TOPIC_NAVIRE_DETECTED, {
          event_id: `${navire.id}-${Date.now()}`,
          ts: new Date().toISOString(),
          navire_id: navire.id,
          distance_km: Number(distance.toFixed(2)),
          navire,
        });
        console.log(`[AttributionObserver] Published navire.detected for ${navire.nom}`);
        return;
      } catch (err) {
        console.error('[AttributionObserver] Kafka publish failed, fallback to local:', err.message);
      }
    }

    console.log(`[AttributionObserver] ${navire.nom} a ${distance.toFixed(1)} km -> local Blackboard cycle`);

    try {
      const resultat = await this.scheduler.lancerCycle(navire);
      console.log(`[AttributionObserver] Resultat: ${JSON.stringify(resultat)}`);
    } catch (err) {
      console.error(`[AttributionObserver] Erreur ${navire.nom}:`, err.message);
    }
  }

  /**
   * Appelé par le cron quand une escale se termine
   * Déclenche le traitement de la file d'attente pour le quai libéré
   */
  async liberer(navireId, quaiId) {
    if (isKafkaEnabled()) {
      try {
        await sendEvent(TOPIC_QUAI_LIBERER, {
          event_id: `${quaiId || 'quai'}-${Date.now()}`,
          ts: new Date().toISOString(),
          navire_id: navireId || null,
          quai_id: quaiId,
          source: 'cron',
        });
        console.log(`[AttributionObserver] Published quai.liberer for quai ${quaiId}`);
        return;
      } catch (err) {
        console.error('[AttributionObserver] Kafka publish failed, fallback to local:', err.message);
      }
    }

    await this.scheduler.traiterApresLiberation(quaiId, navireId);
    console.log(`[AttributionObserver] Liberation traitee - navire ${navireId}, quai ${quaiId}`);
  }
}

module.exports = AttributionObserver;