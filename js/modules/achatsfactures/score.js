// Score de confiance d'une facture (module Achats « Factures », 25/11/2026, PR 8a), calculé à partir des contrôles existants (calcul PUR, sans réseau).
// Ce n'est PAS une garantie : il résume ce que l'outil a pu vérifier. Il ne dit jamais « facture sûre ».
// Règles : un contrôle non fait ne compte ni comme réussi ni comme raté, mais il baisse la couverture ; une anomalie plafonne le score ; un contrôle important non fait plafonne aussi.
// Le score s'affiche sur l'écran Examiner (PR 8b) ; il est porté ici avec ses tests parce qu'il est calculé à partir des mêmes contrôles.

/** Poids de chaque contrôle (somme = 100). Les plus protecteurs pèsent le plus. */
export const POIDS_CONTROLES = Object.freeze({
  siret: 20, totaux: 15, destinataire: 15, doublon: 15,
  iban: 8, 'iban-historique': 10, 'iban-partage': 7, 'adresse-envoi': 5, lignes: 5,
});
const VALEUR = { ok: 1, alerte: 0.4, anomalie: 0 };

/** Ce que la barre de score affiche : couleur par seuil (vert 85+, orange 60-84, rouge en dessous, gris si non calculé), valeur et phrase avec la raison. */
export function presentationScore(r, alertesSupplementaires = 0) {
  if (r.score === null) return { couleur: 'gris', pourcentage: 0, valeur: '— / 100', phrase: 'Non calculé : trop peu de contrôles faits' };
  const pourcentage = Math.max(0, Math.min(100, r.score));
  const valeur = `${r.score} / 100`;
  if (r.niveau === 'eleve') return { couleur: 'vert', pourcentage, valeur, phrase: 'Élevée : aucun point d’attention' };
  if (r.niveau === 'moyen') {
    const raisons = [];
    if (r.nonFaits.length) raisons.push(`${r.nonFaits.length} contrôle${r.nonFaits.length > 1 ? 's' : ''} non fait${r.nonFaits.length > 1 ? 's' : ''} (${r.nonFaits.join(', ')})`);
    const nbAlertes = r.alertes.length + alertesSupplementaires;
    if (nbAlertes) raisons.push(`${nbAlertes} alerte${nbAlertes > 1 ? 's' : ''}${r.alertes.length ? ` (${r.alertes.join(', ')})` : ''}`);
    return { couleur: 'orange', pourcentage, valeur, phrase: `Moyenne : ${raisons.join(' et ') || 'quelques points à regarder'}` };
  }
  return { couleur: 'rouge', pourcentage, valeur, phrase: r.anomalie ? 'Faible : une anomalie à regarder' : 'Faible : plusieurs points à regarder' };
}

/** `alertesSupplementaires` : alertes de l'écran hors contrôles (ex. nom du fournisseur différent) ; une seule suffit à empêcher le vert. */
export function scoreConfiance(controles, alertesSupplementaires = 0) {
  const actifs = controles.filter((c) => !c.bientot && POIDS_CONTROLES[c.id] != null);
  const total = actifs.reduce((n, c) => n + POIDS_CONTROLES[c.id], 0);
  const faits = actifs.filter((c) => c.etat !== 'indisponible');
  const nonFaits = actifs.filter((c) => c.etat === 'indisponible');
  const poidsFaits = faits.reduce((n, c) => n + POIDS_CONTROLES[c.id], 0);
  const couverture = total > 0 ? Math.round((poidsFaits / total) * 100) : 0;
  const noms = nonFaits.map((c) => c.titre);
  if (total === 0 || couverture < 60) {
    return { score: null, niveau: 'non_evalue', couverture, nonFaits: noms, alertes: [], anomalie: false, texte: 'Score non calculé : trop peu de contrôles ont pu être faits. Regarde la facture à la main.' };
  }
  const gagne = faits.reduce((n, c) => n + POIDS_CONTROLES[c.id] * (VALEUR[c.etat] ?? 0), 0);
  let score = Math.round((gagne / poidsFaits) * 100);
  score = Math.round(score * (0.5 + 0.5 * (couverture / 100))); // un contrôle non fait pèse sur le score
  if (faits.some((c) => c.etat === 'anomalie')) score = Math.min(score, 40);
  if (nonFaits.some((c) => c.aConfirmer)) score = Math.min(score, 70);
  // Jamais rassurant à tort : une alerte, un contrôle non fait ou une alerte de l'écran interdit le vert ; un SIRET pas « ok » plafonne à 70.
  const alertesControles = actifs.filter((c) => c.etat === 'alerte' || c.etat === 'anomalie' || (c.etat === 'indisponible' && c.aConfirmer));
  if (alertesControles.length > 0 || nonFaits.length > 0 || alertesSupplementaires > 0) score = Math.min(score, 84);
  if (actifs.some((c) => c.id === 'siret' && c.etat !== 'ok')) score = Math.min(score, 70);
  const niveau = score >= 85 ? 'eleve' : score >= 60 ? 'moyen' : 'faible';
  const base = `Confiance ${score} / 100 d’après les contrôles de l’outil`;
  const reserve = noms.length ? ` (non faits : ${noms.join(', ')})` : '';
  const alertes = faits.filter((c) => c.etat === 'alerte' || c.etat === 'anomalie').map((c) => c.titre);
  return { score, niveau, couverture, nonFaits: noms, alertes, anomalie: faits.some((c) => c.etat === 'anomalie'), texte: `${base}${reserve}. Ce n’est pas une garantie.` };
}
