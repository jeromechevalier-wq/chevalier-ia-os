// Code partagé des modules Achats (24/11/2026) : textes de l'état de l'accès à la base. LOGIQUE PURE (aucun import, aucun réseau).
// Ce dossier n'est PAS un module : il n'est ni déclaré dans js/os/registre.js ni monté ; aucun module Achats n'en exige un autre (chacun reste vendable seul) :
// ce dossier ne contient que du code commun, jamais de donnée.

/** Les quatre états possibles de l'accès (voir js/os/base-reglages.js > evaluerAcces) et ce que l'écran en dit. */
export const TEXTES_ACCES = Object.freeze({
  connecte: 'Connecté à la base',
  'non-regle': 'Connexion à la base non réglée : Réglages > Connexion à la base',
  reconnexion: 'Reconnecte-toi : ton accès à la base n’est pas à jour. Déconnecte-toi puis reconnecte-toi ; si cela ne suffit pas, ton compte n’a pas encore reçu l’accès.',
  illisible: 'Lecture des réglages impossible, réessaie',
});

export const TEXTE_CHARGEMENT = 'Vérification de l’accès à la base…';
export const TEXTE_PAS_DE_DONNEE = 'Cet écran n’affiche pas encore de donnée : elle arrive dans une prochaine étape.';

/** Texte d'un état ; un état inconnu est traité comme « illisible » (jamais un écran muet). */
export function texteAcces(etat) {
  return Object.hasOwn(TEXTES_ACCES, etat) ? TEXTES_ACCES[etat] : TEXTES_ACCES.illisible;
}
