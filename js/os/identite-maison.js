// Identité d'une « maison » de client (26/11/2026) : ce que la page montre AVANT et APRÈS la connexion, sans jamais parler de Jérôme ni de Charles.
// Source : reglages_maison/public, lu avant la connexion (lisible par tous, aucun e-mail). Deux champs FACULTATIFS, non sensibles :
//  - nom_espace : texte (ex. « Chevalier IA - SCAB 04 ») : titre de la page de connexion, de l'onglet, du menu et de Réglages > Mon espace ;
//  - connexion_neutre : true : page de connexion neutre même sans nom (titre « Votre espace »).
//  - logo (27/11/2026) : petite image en adresse « data: », montrée à gauche du nom (menu, barre du haut) et sur la page de connexion ; absent = logo Chevalier IA.
// Après la connexion, reglages_maison/ecran.configuration_crm === 'neutre' rend aussi la maison neutre (comptes-maison.js).
// Champs ABSENTS (maison de Jérôme) : rien ne change, ni avant ni après la connexion.
// Ce fichier n'importe ni Firebase ni le DOM : il se teste seul. Il ne fait que choisir des textes.
import { configurationNeutre } from './comptes-maison.js';

export const NOM_ESPACE_DEFAUT = 'Votre espace';
export const LONGUEUR_NOM_MAX = 80;

// Logo de la maison (27/11/2026, Réglages > Mon espace) : champ FACULTATIF `logo` de `public`, une petite image écrite en adresse « data: » (PNG, JPEG ou SVG,
// 100 Ko au plus). Toute autre valeur (adresse http, autre type, trop longue) est ignorée : le logo Chevalier IA reste. Le logo n'est JAMAIS posé autrement que
// dans la source d'une balise <img> (un SVG n'y exécute aucun script). Les mêmes bornes sont dans firestore.rules (identiteMaisonValide).
export const LOGO_OCTETS_MAX = 100000; // `public` est lu à chaque ouverture de la page, avant la connexion : le logo doit rester léger
export const LOGO_LONGUEUR_MAX = 140000;
const LOGO = /^data:image\/(png|jpeg|svg\+xml);base64,[A-Za-z0-9+/]+=*$/;

/** Vrai si `v` est un logo acceptable (adresse « data: » d'une image PNG, JPEG ou SVG, assez courte). */
export function logoValide(v) {
  return typeof v === 'string' && v.length <= LOGO_LONGUEUR_MAX && LOGO.test(v);
}

/** Nom rangé comme il sera affiché : espaces simplifiés, 80 caractères au plus ('' si ce n'est pas un texte). */
export function nomRange(v) {
  const brut = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '';
  return [...brut].slice(0, LONGUEUR_NOM_MAX).join('');
}

let nom = '';
let neutre = false;
let logo = '';

/** Range les champs utiles du document `public` (appelé par auth.js à chaque lecture, et après un enregistrement de Mon espace). Valeur mal formée = ignorée. */
export function retenirPublic(donnees) {
  nom = nomRange(donnees?.nom_espace);
  neutre = donnees?.connexion_neutre === true;
  logo = logoValide(donnees?.logo) ? donnees.logo : '';
}

/** Oublie ce qui a été lu (essais). */
export function oublierPublic() {
  nom = '';
  neutre = false;
  logo = '';
}

/** Le logo de la maison écrit dans `public` ('' s'il n'y en a pas ou s'il est refusé). */
export const logoMaison = () => logo;

/** `public` porte-t-il connexion_neutre: true ? (Mon espace : garder ce signe en mémoire après un enregistrement.) */
export const connexionNeutreDemandee = () => neutre;

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
