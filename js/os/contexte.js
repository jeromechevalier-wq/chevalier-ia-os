// Contexte d'affichage de la coquille : « chez un client » (plateforme, #/espace/<client>) ou « chez Jérôme » (CRM à la racine).
// Chez un client, tout ce qui est PERSONNEL à Jérôme (Charles et ses célébrations, rappel de sauvegarde, boutons GitHub / Claude Code,
// comptes Jérôme et Charles dans les listes) n'est pas montré. Le CRM de Jérôme ne passe jamais par ici : le drapeau y reste faux.
// Le chantier 8 sortira objectifs et célébrations dans un module optionnel ; ce drapeau sert d'ici là de « interrupteur ».
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
