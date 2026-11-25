// Qui est Jérôme, pour CACHER ce qui lui est réservé dans l'écran (24/11/2026 : Réglages > « Connexion à la base »).
// Même principe que js/modules/console/acces.js : ce fichier ne fait que montrer ou cacher ; la vraie barrière est ailleurs
// (règles Firestore de `base_parametres` : écriture réservée à son compte ; fonction `baseAccorderAcces` : identité contrôlée côté serveur à chaque appel).
// Chantier 0 (26/11/2026) : la liste vient de reglages_maison/ecran (comptes_jerome_seul), lue à la connexion (js/os/comptes-maison.js, sans Firebase). Vide = personne.
import { estCompteTitulaire } from './comptes-maison.js';

/** Ce compte est-il celui de Jérôme ? `compte` vient de js/os/auth.js : { email, … } ou null. */
export function compteReserve(compte) {
  return estCompteTitulaire(compte?.email);
}
