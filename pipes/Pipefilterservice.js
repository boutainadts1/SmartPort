/**
 * PipeFilterService — structure vide
 * Sera implémenté dans une prochaine itération
 *
 * Représente le sous-système Pipe & Filter de gestion des escales (pré-arrivée)
 *
 * Pipeline séquentiel (Data Driven) :
 *   Source     → NOR reçu (navire détecté dans zone)
 *   Filtre 1   → Réception NOR
 *   Filtre 2   → Vérification documentaire
 *   Filtre 3   → Vérification listes de surveillance
 *   Filtre 4   → Alerte parties prenantes
 *   Data Sink  → Escale validée
 */

async function traiterEscale({ navire, quai }) {
  console.log(`[PipeFilter] TODO → pipeline escale pour ${navire.nom} → ${quai.numero}`);

  const dossier = { navire, quai, statut: 'EN_COURS' };

  await filtre1_receptionNOR(dossier);
  await filtre2_verificationDocs(dossier);
  await filtre3_listesNoires(dossier);
  await filtre4_alerteParties(dossier);

  return dossier;
}

async function filtre1_receptionNOR(dossier) {
  // TODO: INSERT escale en base avec statut 'NOR_RECU'
  // TODO: parser et valider le format du NOR
  console.log(`[PipeFilter][F1] TODO → Réception NOR — ${dossier.navire.nom}`);
}

async function filtre2_verificationDocs(dossier) {
  // TODO: vérifier certificat sanitaire, jaugeage, liste équipage, manifeste
  // TODO: si NOK → rejeter et notifier agent maritime
  console.log(`[PipeFilter][F2] TODO → Vérification docs — ${dossier.navire.nom}`);
}

async function filtre3_listesNoires(dossier) {
  // TODO: consulter API listes sanctions internationales
  // TODO: cache Redis pour éviter appels répétés
  // TODO: si NOK → rejeter et alerter autorités
  console.log(`[PipeFilter][F3] TODO → Listes noires — ${dossier.navire.nom}`);
}

async function filtre4_alerteParties(dossier) {
  // TODO: notifier pilotage et lamanage
  // TODO: mettre à jour statut escale → 'VALIDE'
  console.log(`[PipeFilter][F4] TODO → Alerte parties — ${dossier.navire.nom} → ${dossier.quai.numero}`);
}

module.exports = { traiterEscale };