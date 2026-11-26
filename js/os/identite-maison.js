// Identité d'une « maison » de client (26/11/2026) : ce que la page montre AVANT et APRÈS la connexion, sans jamais parler de Jérôme ni de Charles.
// Source : reglages_maison/public, lu avant la connexion (lisible par tous, aucun e-mail). Deux champs FACULTATIFS, non sensibles :
//  - nom_espace : texte (ex. « Chevalier IA - SCAB 04 ») : titre de la page de connexion, de l'onglet, du menu et de Réglages > Mon espace ;
//  - connexion_neutre : true : page de connexion neutre même sans nom (titre « Votre espace »).
// Après la connexion, reglages_maison/ecran.configuration_crm === 'neutre' rend aussi la maison neutre (comptes-maison.js).
// Champs ABSENTS (maison de Jérôme) : rien ne change, ni avant ni après la connexion.
// Ce fichier n'importe ni Firebase ni le DOM : il se teste seul. Il ne fait que choisir des textes.
import { configurationNeutre } from './comptes-maison.js';

export const NOM_ESPACE_DEFAUT = 'Votre espace';
export const LONGUEUR_NOM_MAX = 80;

let nom = '';
let neutre = false;

/** Range les champs utiles du document `public` (appelé par auth.js à chaque lecture). Valeur mal formée = ignorée. */
export function retenirPublic(donnees) {
  const brut = typeof donnees?.nom_espace === 'string' ? donnees.nom_espace.replace(/\s+/g, ' ').trim() : '';
  nom = [...brut].slice(0, LONGUEUR_NOM_MAX).join('');
  neutre = donnees?.connexion_neutre === true;
}

/** Oublie ce qui a été lu (essais). */
export function oublierPublic() {
  nom = '';
  neutre = false;
}

/** Le nom de l'espace écrit dans `public` ('' s'il n'y en a pas). */
export const nomEspaceMaison = () => nom;

/** Page de connexion neutre ? Vrai si `public` porte connexion_neutre: true ou un nom_espace. */
export const connexionNeutre = () => neutre || nom !== '';

/** Maison neutre après la connexion ? Page de connexion neutre, ou configuration_crm: 'neutre' dans `ecran`. */
export const maisonNeutre = () => connexionNeutre() || configurationNeutre();

/** Nom affiché d'une maison neutre : nom_espace, sinon « Votre espace ». */
export const nomAfficheMaison = () => nom || NOM_ESPACE_DEFAUT;

/** Nom de l'espace racine à afficher : `defaut` (« Chevalier IA OS » chez Jérôme) sauf dans une maison neutre. */
export const nomEspaceRacine = (defaut) => (maisonNeutre() ? nomAfficheMaison() : defaut);
