/**
 * DashboardService — structure vide
 * Sera implémenté dans une prochaine itération
 *
 * Responsabilité : recevoir les événements du système et mettre à jour
 * le dashboard en temps réel (WebSocket push vers les clients)
 */

async function notifierAttribution({ navire, quai, score }) {
  // TODO: WebSocket push → dashboard opérateur
  // TODO: WebSocket push → portail armateur
  console.log(`[DashboardService] TODO → attribution ${navire.nom} → ${quai.numero} (score ${score.toFixed(1)})`);
}

async function notifierDepart({ navire, quai }) {
  // TODO: WebSocket push → quai libéré sur dashboard
  console.log(`[DashboardService] TODO → départ ${navire.nom} depuis ${quai.numero}`);
}

async function notifierFileAttente({ navire, priorite }) {
  // TODO: WebSocket push → file d'attente mise à jour
  console.log(`[DashboardService] TODO → file attente ${navire.nom} (priorité ${priorite})`);
}

module.exports = { notifierAttribution, notifierDepart, notifierFileAttente };