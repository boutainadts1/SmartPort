/**
 * Interface Observer
 * Tout observer du système AIS doit implémenter cette méthode
 */
class IObserver {
  /**
   * @param {object} navire    - données du navire détecté
   * @param {number} distance  - distance au port en km
   */
  onNavireDetecte(navire, distance) {
    throw new Error(`${this.constructor.name} doit implémenter onNavireDetecte()`);
  }
}
 
module.exports = IObserver;
 