// Copie du PDF d'un devis dans le dossier de travail Google Drive de l'affaire (sous-dossier « Devis »).
// Cloud Storage reste la référence : le serveur fabrique et range le PDF. Ici, c'est le NAVIGATEUR (jeton Google de l'utilisateur, portée drive.file)
// qui en dépose un exemplaire dans Drive. Le serveur n'a pas accès à Drive.
// Ce fichier ne touche ni au DOM ni à Firebase : les accès (jeton, téléchargement du PDF, `fetch`) sont donnés par l'appelant, donc tout se teste seul.
//
// Choix :
// - un fichier du même nom déjà dans le dossier « Devis » est IGNORÉ (jamais de doublon, jamais d'écrasement) ;
// - une fois le PDF copié, le navigateur s'en souvient (préférence locale, voir cleMemoire) : on ne redemande pas Drive à chaque ouverture de l'écran.
//   Le serveur n'écrit pas ce détail sur le devis et les règles Firestore ne laissent au navigateur que `devisBrouillonModifie` : rien n'est écrit dans la base.
import { idDossierDrive, trouverDossierDeMemeNom, creerDossier, trouverFichierDeMemeNom, envoyerFichier } from '../../os/google-drive.js';
import { etatPdfDevis } from './pdf.js';

export const NOM_SOUS_DOSSIER = 'Devis';

export const MESSAGE_COPIE_FAITE = 'PDF copié dans le dossier Devis de l’affaire';
export const MESSAGE_DEJA_COPIE = 'Ce PDF est déjà dans le dossier Devis de l’affaire.';
export const MESSAGE_SANS_DOSSIER = 'Cette affaire n’a pas de dossier de travail Drive : le PDF est rangé dans l’affaire seulement.';
export const MESSAGE_SANS_AFFAIRE = 'Ce devis n’a pas d’affaire : le PDF est rangé avec le devis seulement.';
export const MESSAGE_DOSSIER_PAS_DRIVE = 'Le dossier de travail de cette affaire n’est pas un dossier Google Drive : le PDF est rangé dans l’affaire seulement.';
export const MESSAGE_GOOGLE_ABSENT = 'Google Drive n’est pas branché sur cet espace : le PDF est rangé dans l’affaire seulement.';
export const MESSAGE_PDF_PAS_PRET = 'Le PDF n’est pas encore prêt : la copie dans Drive se fera quand il le sera.';
export const MESSAGE_LECTURE_PDF = 'Le PDF n’a pas pu être lu pour la copie dans Drive. Réessaie ; si cela continue, le navigateur n’a pas le droit de lire le fichier de stockage (réglage à faire une fois, voir la description de la PR).';
export const MESSAGE_REFUS = 'Drive n’est pas connecté ou l’autorisation a été refusée : le PDF n’a pas été copié dans le dossier Devis.';

const nettoyerNom = (s, max) => {
  const n = String(s ?? '').replace(/[\/\\\u0000-\u001f]/g, ' ').replace(/\s+/g, ' ').trim();
  if (n.length <= max) return n;
  const m = /\.[A-Za-z0-9]{1,5}$/.exec(n);
  const ext = m ? m[0] : '';
  return `${n.slice(0, max - ext.length).trim()}${ext}`;
};

/**
 * Nom du fichier dans Drive : « Devis DEV-… v2 – Objet.pdf ». MÊME règle que `libelleDocumentDevis` (functions/src/devis/stockage.js) : le fichier de Drive
 * porte le nom du document de l'affaire (un test compare les deux).
 */
export function nomFichierDrive({ numero, version, objet } = {}) {
  const tete = `Devis ${nettoyerNom(`${numero || 'DEVIS'} v${version || 1}`, 60)}`;
  const obj = nettoyerNom(objet || '', 50);
  return `${nettoyerNom(obj ? `${tete} – ${obj}` : tete, 116)}.pdf`;
}

/**
 * Où copier ? Renvoie { genre, dossierId?, message? } :
 * - 'pas-pret' : le PDF du devis n'est pas encore prêt ;
 * - 'sans-affaire' / 'sans-dossier' / 'pas-drive' : rien à faire, message d'information (ce n'est pas une erreur) ;
 * - 'ok' : `dossierId` = identifiant Drive du dossier de travail.
 * Un devis brouillon n'est jamais copié (son PDF est filigrané et remplacé à chaque fois).
 */
export function choisirDestination({ devis, affaire, maintenant = Date.now() } = {}) {
  if (!devis || etatPdfDevis(devis, maintenant) !== 'pret') return { genre: 'pas-pret', message: MESSAGE_PDF_PAS_PRET };
  if (!devis.affaireId || !affaire) return { genre: 'sans-affaire', message: MESSAGE_SANS_AFFAIRE };
  const url = String(affaire.urlDossier ?? '').trim();
  if (!url) return { genre: 'sans-dossier', message: MESSAGE_SANS_DOSSIER };
  const dossierId = idDossierDrive(url);
  if (!dossierId) return { genre: 'pas-drive', message: MESSAGE_DOSSIER_PAS_DRIVE };
  return { genre: 'ok', dossierId };
}

/** Clé de la préférence locale : un devis (une version) copié dans un dossier de travail donné. */
export const cleMemoire = (devisId, dossierId, nom) => `devis.copieDrive.${devisId}.${dossierId}.${nom}`;

/**
 * Message pour une erreur de la copie (Google, réseau, lecture du PDF). `reessayable` : l'écran montre « Réessayer ».
 * Un refus de l'utilisateur ou un jeton impossible à obtenir donne le message « pas connecté » ; une erreur Google garde son texte simple (google-drive.js).
 */
export function messagePourErreur(e) {
  if (e?.lecturePdf) return MESSAGE_LECTURE_PDF;
  if (e?.annule || e?.code === 'popup_failed_to_open' || e?.code === 'access_denied') return e?.message && !/rien n’a été fait/.test(e.message) ? e.message : MESSAGE_REFUS;
  return e?.message || 'La copie dans Drive a échoué. Réessaie dans un instant.';
}

/**
 * Copie le PDF. `outils` : { obtenirJeton(), lirePdf() → Blob, appelFetch? }. Renvoie { etat, message, fichier? } avec etat :
 * 'copie' | 'deja' (même nom déjà dans le dossier Devis) | 'rien' (pas de dossier, etc. : information) | 'erreur' (à réessayer).
 * Ne lève jamais : toute erreur devient { etat: 'erreur', message }.
 */
export async function copierPdfDevis({ devis, affaire, outils, maintenant = Date.now() }) {
  const dest = choisirDestination({ devis, affaire, maintenant });
  if (dest.genre !== 'ok') return { etat: 'rien', genre: dest.genre, message: dest.message };
  const nom = nomFichierDrive(devis);
  const appelFetch = outils.appelFetch || globalThis.fetch;
  try {
    const jeton = await outils.obtenirJeton();
    // Le sous-dossier « Devis » : retrouvé s'il existe (créé par l'appli), sinon créé une seule fois.
    const sous = (await trouverDossierDeMemeNom({ jeton, nom: NOM_SOUS_DOSSIER, parentId: dest.dossierId, appelFetch }))
      || await creerDossier({ jeton, nom: NOM_SOUS_DOSSIER, parentId: dest.dossierId, appelFetch });
    const existant = await trouverFichierDeMemeNom({ jeton, nom, parentId: sous.id, appelFetch });
    if (existant) return { etat: 'deja', message: MESSAGE_DEJA_COPIE, dossierId: dest.dossierId, nom, fichier: existant };
    let contenu;
    try { contenu = await outils.lirePdf(); } catch (e) { throw Object.assign(new Error(MESSAGE_LECTURE_PDF), { lecturePdf: true, cause: e }); }
    const fichier = await envoyerFichier({ jeton, nom, contenu, parentId: sous.id, appelFetch });
    return { etat: 'copie', message: MESSAGE_COPIE_FAITE, dossierId: dest.dossierId, nom, fichier };
  } catch (e) {
    return { etat: 'erreur', message: messagePourErreur(e), erreur: e, dossierId: dest.dossierId, nom };
  }
}
