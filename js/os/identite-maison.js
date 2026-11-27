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

// ---------------------------------------------------------------- qui peut changer le nom et le logo, et la trace dans le journal (27/11/2026)

/**
 * Réglages > Mon espace d'une maison de client : le formulaire est-il proposé à ce compte ? Tout compte connecté de la maison qui peut écrire (`editeur` vrai),
 * plus seulement le titulaire (accord de Jérôme du 27/11/2026). Un compte en lecture seule (`editeur` faux) voit le nom et le logo sans pouvoir les changer.
 * Jamais sur la plateforme des clients (`chezClient`), jamais chez Jérôme (ni nom_espace ni connexion_neutre). Ce n'est qu'un affichage : les règles Firestore décident.
 */
export function identiteMaisonModifiable({ chezClient, editeur, compte } = {}) {
  return !chezClient && connexionNeutre() && editeur === true && typeof compte?.email === 'string' && compte.email.trim() !== '';
}

export const OUTIL_JOURNAL_IDENTITE = 'mon_espace_maison';
export const JOURS_COPIE_JOURNAL = 90; // date exigée par les règles des copies du journal, inerte (aucune règle d'effacement : décision de Jérôme du 04/10/2026)

/**
 * Ce qu'écrit « Enregistrer » dans le MÊME lot (les règles refusent la modification de `public` sans sa ligne de journal) :
 *  - `patch` : les champs de reglages_maison/public (nom_espace, logo si demandé, ligne_journal = identifiant de la ligne) ;
 *  - `ligne` : la ligne du journal (qui, quel outil, quels champs) ; `copie` : sa copie « avant / après » (ancien et nouveau nom).
 * Le logo n'entre JAMAIS dans le journal : seulement « logo changé » ou « logo retiré ». Rend null si rien ne change (aucune écriture, aucune ligne).
 * `avant` : le document `public` lu juste avant ; `nom` : nom rangé ; `logo` : texte (nouveau logo), null (retrait) ou undefined (inchangé) ;
 * `acteur` : e-mail du compte ; `idLigne` : identifiant de la nouvelle ligne ; `maintenant` : Date.
 */
export function planIdentiteMaison({ avant, nom, logo, acteur, idLigne, maintenant }) {
  const ancienNom = typeof avant?.nom_espace === 'string' ? avant.nom_espace : '';
  const ancienLogo = typeof avant?.logo === 'string' ? avant.logo : '';
  const logoChange = logo === null ? ancienLogo !== '' : typeof logo === 'string' && logo !== ancienLogo;
  if (nom === ancienNom && !logoChange) return null;
  const patch = { nom_espace: nom, ligne_journal: idLigne };
  if (logoChange) patch.logo = logo; // null = retrait (l'appelant le traduit en suppression du champ)
  const champsModifies = [...(nom !== ancienNom ? ['nom_espace'] : []), ...(logoChange ? ['logo'] : [])];
  const copieAvant = { nom_espace: ancienNom }; // '' si l'espace n'avait pas de nom (maison neutre) : les règles comparent à l'ancien nom exact
  const copieApres = { nom_espace: nom };
  if (logoChange) {
    copieAvant.logo = ancienLogo ? 'ancien logo' : 'pas de logo';
    copieApres.logo = logo ? 'logo changé' : 'logo retiré';
  }
  return {
    patch,
    ligne: {
      operationId: idLigne, ordre: 1, acteur, jeton: 'ecran', via: 'ecran', outil: OUTIL_JOURNAL_IDENTITE, collection: 'reglages_maison', docId: 'public',
      action: 'modifier', statut: 'succes', champsModifies, parametresRecus: [],
    },
    copie: {
      operationId: idLigne, collection: 'reglages_maison', docId: 'public', avant: copieAvant, apres: copieApres,
      expireAt: new Date(maintenant.getTime() + JOURS_COPIE_JOURNAL * 86_400_000),
    },
  };
}
