// Copie du PDF d'un devis dans le dossier de travail Google Drive de l'affaire (sous-dossier « Devis »).
// Cloud Storage reste la référence : le serveur fabrique et range le PDF. Ici, c'est le NAVIGATEUR (jeton Google de l'utilisateur, portée drive.file)
// qui en dépose un exemplaire dans Drive. Le serveur n'a pas accès à Drive.
// Ce fichier ne touche ni au DOM ni à Firebase : les accès (jeton, téléchargement du PDF, `fetch`) sont donnés par l'appelant, donc tout se teste seul.
//
// Choix :
// - un fichier du même nom déjà dans le dossier « Devis » est IGNORÉ (jamais de doublon, jamais d'écrasement) ;
// - une fois le PDF copié, le navigateur s'en souvient (préférence locale, voir cleMemoire) : on ne redemande pas Drive à chaque ouverture de l'écran.
//   Le serveur n'écrit pas ce détail sur le devis et les règles Firestore ne laissent au navigateur que `devisBrouillonModifie` : rien n'est écrit dans la base.
//   (Ce fichier-ci n'écrit rien. Les liens des PDF joints aux Documents de l'affaire, après la création ou la liaison du dossier, passent par la logique du CRM dans dossier-travail.js.)
import { idDossierDrive, trouverDossierDeMemeNom, creerDossier, trouverFichierDeMemeNom, envoyerFichier } from '../../os/google-drive.js';
import { etatPdfDevis, lienStablePdfNavigateur } from './pdf.js';

export const NOM_SOUS_DOSSIER = 'Devis';

export const MESSAGE_COPIE_FAITE = 'PDF copié dans le dossier Devis de l’affaire';
export const MESSAGE_DEJA_COPIE = 'Ce PDF est déjà dans le dossier Devis de l’affaire.';
export const MESSAGE_SANS_DOSSIER = 'Cette affaire n’a pas de dossier de travail : le PDF est gardé avec le devis.';
export const MESSAGE_SANS_DOSSIER_NON_CREABLE = MESSAGE_SANS_DOSSIER;
export const MESSAGE_SANS_DOSSIER_ECRAN = 'Cette affaire n’a pas encore de dossier de travail.';
export const MESSAGE_SANS_AFFAIRE = 'Ce devis n’a pas d’affaire : le PDF est rangé avec le devis seulement.';
export const MESSAGE_DOSSIER_PAS_DRIVE = 'Le dossier de travail de cette affaire n’est pas un dossier Google Drive : le PDF n’y est pas copié (il est dans les Documents de l’affaire).';
export const MESSAGE_GOOGLE_ABSENT = 'Google Drive n’est pas branché sur cet espace : le PDF n’est pas copié dans Drive (il est gardé dans les Documents de l’affaire).';
export const MESSAGE_PDF_PAS_PRET = 'Le PDF n’est pas encore prêt : la copie dans Drive se fera quand il le sera.';
export const MESSAGE_LECTURE_PDF = 'Le PDF n’a pas pu être lu pour la copie dans Drive. Réessaie ; si ça continue, il faut autoriser ce site dans le stockage (réglage à faire une fois).';
export const MESSAGE_AUTORISATION_DRIVE = 'Pour copier ce PDF dans Drive, appuie sur « Copier dans Drive ».';
export const MESSAGE_CHARGEMENT_AFFAIRE = 'Chargement de l’affaire…';
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

/**
 * Faut-il attendre un vrai clic ? La copie démarre toute seule à l'ouverture de l'écran (donc sans clic) : sans jeton Google déjà en mémoire, la fenêtre
 * d'autorisation serait bloquée par le navigateur. Dans ce cas on montre un message neutre et un bouton « Copier dans Drive ».
 */
export const attendreUnClic = ({ automatique = false, jetonEnMemoire = false } = {}) => Boolean(automatique && !jetonEnMemoire);

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

// ---------------------------------------------------------------- tous les PDF d'une affaire (quand le dossier de travail est créé ou lié)

/** Les devis dont le PDF part dans le dossier : ceux de CETTE affaire, finalisés (pas brouillon) et au PDF prêt, toutes versions (comme le serveur les joint à l'affaire). Triés par numéro puis version. */
export function devisAvecPdfDeAffaire(devisListe, affaireId) {
  return (Array.isArray(devisListe) ? devisListe : [])
    .filter((d) => d && affaireId && d.affaireId === affaireId && d.statut !== 'brouillon' && d.pdf?.statut === 'ok')
    .sort((a, b) => String(a.numero ?? '').localeCompare(String(b.numero ?? '')) || (a.version ?? 1) - (b.version ?? 1));
}

const pluriel = (n, un, plusieurs) => (n > 1 ? plusieurs : un);

/** Compte rendu simple d'une copie en lot. `copies` : nouveaux fichiers ; `deja` : déjà présents ; `echecs` : à réessayer. Texte vide s'il n'y avait rien à copier. */
export function messageCopieLot({ total = 0, copies = 0, deja = 0, echecs = 0, message = '' } = {}) {
  if (!total) return { texte: '', type: 'info' };
  if (echecs) return { texte: `${copies + deja} sur ${total} copiés : réessaie.${message ? ` ${message}` : ''}`, type: 'erreur' };
  if (!copies) return { texte: total > 1 ? 'Les PDF des devis sont déjà dans le dossier.' : 'Le PDF du devis est déjà dans le dossier.', type: 'info' };
  const reste = deja ? ` (${deja} ${pluriel(deja, 'était déjà présent', 'étaient déjà présents')})` : '';
  return { texte: `${copies} ${pluriel(copies, 'PDF copié', 'PDF copiés')} dans le dossier${reste}.`, type: 'info' };
}

/**
 * Copie dans « Devis » le PDF de chaque devis finalisé de l'affaire, un par un (jamais deux en même temps : le sous-dossier n'est créé qu'une fois).
 * `outils` : { obtenirJeton(), lirePdf(devis) → Blob, appelFetch? }. Le jeton est demandé UNE fois. Ne lève jamais.
 * Rend { total, copies, deja, echecs, resultats, message, type, texte }.
 */
export async function copierPdfsAffaire({ affaire, devisListe, outils, maintenant = Date.now() }) {
  const liste = devisAvecPdfDeAffaire(devisListe, affaire?.id);
  const bilan = { total: liste.length, copies: 0, deja: 0, echecs: 0, resultats: [], message: '' };
  if (!liste.length) return { ...bilan, ...messageCopieLot(bilan) };
  let jeton;
  try { jeton = await outils.obtenirJeton(); } catch (e) {
    const resume = { ...bilan, echecs: liste.length, message: messagePourErreur(e), erreur: e };
    return { ...resume, ...messageCopieLot(resume) };
  }
  for (const devis of liste) {
    const r = await copierPdfDevis({ devis, affaire, maintenant, outils: { appelFetch: outils.appelFetch, obtenirJeton: async () => jeton, lirePdf: () => outils.lirePdf(devis) } });
    bilan.resultats.push({ devisId: devis.id, ...r });
    if (r.etat === 'copie') bilan.copies += 1;
    else if (r.etat === 'deja') bilan.deja += 1;
    else { bilan.echecs += 1; bilan.message = bilan.message || r.message; if (r.erreur?.statut === 401) { bilan.erreur = r.erreur; break; } }
  }
  bilan.echecs += liste.length - bilan.resultats.length; // les devis non tentés après un jeton refusé restent « à réessayer »
  return { ...bilan, ...messageCopieLot(bilan) };
}

/** Mémoire locale d'une copie déjà faite (voir cleMemoire) : sans elle, rien ne casse, Drive est simplement redemandé. */
export const memoireCopie = {
  lire: (cle) => { try { return localStorage.getItem(cle) === '1'; } catch { return false; } },
  ecrire: (cle) => { try { localStorage.setItem(cle, '1'); } catch { /* préférence locale seulement */ } },
};

// ---------------------------------------------------------------- liens stables dans les Documents de l'affaire

/**
 * Documents à AJOUTER à l'affaire pour les devis donnés. Un document est reconnu par son adresse (celle du serveur, voir lienStablePdfNavigateur) : jamais de doublon avec celui que le serveur a déjà ajouté.
 * Libellé = nom du PDF écrit par le serveur (`pdf.nom`), sinon le nom calculé. Rend les documents { libelle, url, ajouteLe } nouveaux.
 */
export function documentsAAjouter({ devisListe, documents, client = '', maintenant = new Date() }) {
  const existants = new Set((Array.isArray(documents) ? documents : []).map((d) => String(d?.url ?? '')));
  return (devisListe || []).filter((d) => d && d.id).map((d) => ({ d, url: lienStablePdfNavigateur(d.id, { client }) }))
    .filter(({ url }) => !existants.has(url))
    .map(({ d, url }) => ({ libelle: d.pdf?.nom || nomFichierDrive(d), url, ajouteLe: maintenant.toISOString() }));
}
