/**
 * AISSubject — Subject du patron Observer
 *
 * Reçoit les signaux AIS (position des navires) à chaque tick +update position 
 * et notifie les observers enregistrés quand un navire entre dans la zone portuaire
 * 
 *
 * Pattern : Observable / Subject
 *   - subscribe(observer)   → enregistrer un observer
 *   - unsubscribe(observer) → retirer un observer
 *   - traiterSignal(...)    → calcule distance et notifie si dans zone
 */
class AISSubject {

  constructor() {
    this._observers = [];
    this.PORT_LAT   = 36.7667;
    this.PORT_LON   = 3.0500;
    this.SEUIL_KM   = 50;
  }

  // ── Gestion des observers ──────────────────────────────
  subscribe(observer) {
    this._observers.push(observer);
    console.log(`[AISSubject] ${observer.constructor.name} abonné`);
  }

  unsubscribe(observer) {
    this._observers = this._observers.filter(o => o !== observer);
    console.log(`[AISSubject] ${observer.constructor.name} désabonné`);
  }

  // ── Notification de tous les observers ────────────────
  async _notify(navire, distance) {
    for (const observer of this._observers) {
      await observer.onNavireDetecte(navire, distance);
    }
  }

  // ── Traitement d'un signal AIS ─────────────────────────
  // Appelé par le cron à chaque tick pour chaque navire
  async traiterSignal(navire, nouvLat, nouvLon) {
    const distance = this._calculerDistance(nouvLat, nouvLon);

    // Si le navire entre dans la zone → notifier les observers
    if (distance < this.SEUIL_KM) {
      await this._notify(navire, distance);
    }

    return distance;
  }

  // ── Formule Haversine ──────────────────────────────────
  _calculerDistance(lat, lon) {
    const R    = 6371;
    const dLat = (this.PORT_LAT - lat) * Math.PI / 180;
    const dLon = (this.PORT_LON - lon) * Math.PI / 180;
    const a    = Math.sin(dLat/2)**2 +
                 Math.cos(lat * Math.PI/180) *
                 Math.cos(this.PORT_LAT * Math.PI/180) *
                 Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  }
}

module.exports = AISSubject;