// Qui est Jérôme, pour CACHER ce qui lui est réservé dans l'écran (24/11/2026 : Réglages > « Connexion à la base »).
// Même principe que js/modules/console/acces.js : ce fichier ne fait que montrer ou cacher ; la vraie barrière est ailleurs
// (règles Firestore de `base_parametres` : écriture réservée à son compte ; fonction `baseAccorderAcces` : identité contrôlée côté serveur à chaque appel).
// Chantier 0 (26/11/2026) : la liste vient de reglages_maison/ecran (comptes_jerome_seul), lue à la connexion (js/os/comptes-maison.js, sans Firebase). Vide = personne.
import { estCompteTitulaire } from './comptes-maison.js';
import { maisonNeutre } from './identite-maison.js';

/** Ce compte est-il celui de Jérôme ? `compte` vient de js/os/auth.js : { email, … } ou null. */
export function compteReserve(compte) {
  return estCompteTitulaire(compte?.email);
}

/**
 * Pages techniques cachées (27/11/2026) : Réglages > Modules actifs, Déploiement, Mes tests, Connexion à la base, et le Journal des modifications.
 * Vrai seulement dans la MAISON D'UN CLIENT (maison neutre : nom_espace, connexion_neutre ou configuration_crm 'neutre', js/os/identite-maison.js)
 * pour un compte qui n'est PAS titulaire (comptes_jerome_seul), la même liste que pour la Console. Chez Jérôme (maison sans ces champs) : faux, rien ne change.
 * Sur la plateforme des clients, l'appelant ne pose pas la question (ces pages y suivent leurs propres règles). Ce n'est qu'un affichage : les règles et le serveur restent les barrières.
 */
export function pagesTechniquesCachees(compte) {
  return maisonNeutre() && !compteReserve(compte);
}
