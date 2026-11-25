// Rôle « administrateur » : réservé au compte de Jérôme (pas à son compte d'assistant, qui reste autorisé dans le CRM mais ne voit pas les clients).
// Il débloque, dans l'écran Automatisations de Chevalier IA OS, la vue de TOUS les propriétaires (lecture seule). Ce fichier ne fait que montrer :
// le serveur (fonction `automatisationsAdmin`) contrôle l'identité avec la fiche reglages_maison/maison.
// Chantier 0 (26/11/2026) : la liste vient de reglages_maison/ecran (comptes_jerome_seul), lue à la connexion (js/os/comptes-maison.js, sans Firebase). Vide = personne.
import { estCompteTitulaire } from './comptes-maison.js';

/** Vrai pour le compte de Jérôme, e-mail VÉRIFIÉ. `email` : tel que Firebase le donne (la casse est ignorée). */
export function estAdministrateur(email, emailVerifie = true) {
  return emailVerifie === true && typeof email === 'string' && estCompteTitulaire(email);
}
