// Logique pure de la barre de séparation facture / vérifications de l'écran Examiner (PR 8b, portée de l'appli BTP). Sur téléphone la barre n'existe pas : une page à la fois.
export const PART_DEFAUT = 60;
export const PART_MIN = 30;
export const PART_MAX = 75;
export const PANNEAU_MIN_PX = 320;
export const POIGNEE_PX = 12;
export const PAS_CLAVIER = 2;
export const CLE_STOCKAGE = 'examiner.partFacture';

/** Borne la part de la facture (en %) : 30 à 75 %, et la colonne des vérifications garde au moins 320 px si la largeur le permet. */
export function bornerPart(part, largeurTotale) {
  if (!Number.isFinite(part)) return PART_DEFAUT;
  let max = PART_MAX;
  if (largeurTotale > 0) {
    const dispo = Math.max(0, largeurTotale - POIGNEE_PX);
    max = Math.min(max, ((dispo - PANNEAU_MIN_PX) / largeurTotale) * 100);
  }
  const bas = PART_MIN;
  const haut = Math.max(bas, max);
  return Math.round(Math.min(haut, Math.max(bas, part)) * 10) / 10;
}

/** Part (en %) correspondant à la position horizontale de la souris dans le conteneur. */
export function partDepuisPosition(clientX, gauche, largeurTotale) {
  if (largeurTotale <= 0) return PART_DEFAUT;
  return bornerPart(((clientX - gauche) / largeurTotale) * 100, largeurTotale);
}

/** Relit la valeur mémorisée (texte) ; valeur absente ou invalide : proportion par défaut. */
export function lirePartMemorisee(brut) {
  if (brut === null || brut === undefined || String(brut).trim() === '') return PART_DEFAUT;
  const n = Number(brut);
  return Number.isFinite(n) ? bornerPart(n, 0) : PART_DEFAUT;
}
