// Interrupteurs « Mon accueil » de chaque personne (27/11/2026, docs/accueil-village.md « Interrupteurs par personne ») : la partie sans réseau, testée seule
// (tests/village-preferences.test.js). La lecture et l'écriture du document sont dans js/os/village-preferences.js.
//  - jeu : pièces d'or, boutique, champs, enclos et décorations achetées (éteint : rien de tout cela à l'écran ; l'or se gagne quand même, en silence) ;
//  - accueil : 'village' (le dessin) ou 'classique' (le menu habituel de l'application).
// Défauts (document absent ou mal formé) : maison de Jérôme = jeu allumé ; maison d'un client (maison neutre) = jeu éteint ; accueil village dans les deux cas.

export const ACCUEILS = Object.freeze(['village', 'classique']);

/** Les réglages par défaut : `neutre` = maison d'un client (maisonNeutre() de js/os/identite-maison.js). */
export function defauts({ neutre = false } = {}) {
  return { jeu: !neutre, accueil: 'village' };
}

/** Vrai si `d` a la forme écrite par l'écran (jeu booléen, accueil connu). Les autres champs (modifieLe) ne comptent pas ici. */
export function preferencesValables(d) {
  return Boolean(d) && typeof d === 'object' && typeof d.jeu === 'boolean' && ACCUEILS.includes(d.accueil);
}

/** Les réglages à appliquer : ceux du document s'il est bien formé, sinon les défauts. */
export function preferencesAppliquees(d, { neutre = false } = {}) {
  return preferencesValables(d) ? { jeu: d.jeu, accueil: d.accueil } : defauts({ neutre });
}
