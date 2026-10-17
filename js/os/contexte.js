// Contexte d'affichage de la coquille : « chez un client » (plateforme, #/espace/<client>) ou « chez Jérôme » (CRM à la racine).
// Chez un client, tout ce qui est PERSONNEL à Jérôme (Charles et ses célébrations, rappel de sauvegarde, boutons GitHub / Claude Code,
// comptes Jérôme et Charles dans les listes) n'est pas montré. Le CRM de Jérôme ne passe jamais par ici : le drapeau y reste faux.
// Les célébrations existent bien chez un client (option « Célébrations » des réglages du CRM de son espace, éteinte au départ) : l'image de Charles reste réservée à Jérôme,
// un client peut y mettre le LOGO de son espace (2.8.0), lu en direct ici (logoEspace) et jamais recopié.
// Sans dépendance (ni Firebase ni DOM) : se teste seul.
let chezClient = false;

/** Vrai tant qu'un espace client est monté (espace-modules.js). */
export function estChezClient() {
  return chezClient;
}

/** Appelé par espace-modules.js à l'ouverture (true) et à la fermeture (false) d'un espace client. */
export function definirChezClient(valeur) {
  chezClient = valeur === true;
}

let logo = null;

/** Logo de l'espace client monté (adresse https de la fiche de marque), ou null. Lu en direct par les célébrations. */
export function logoEspace() {
  return chezClient ? logo : null;
}

/** Appelé par espace-modules.js à l'ouverture, à la fermeture (null) et quand un éditeur change le logo. */
export function definirLogoEspace(url) {
  logo = typeof url === 'string' && url.startsWith('https://') ? url : null;
}
