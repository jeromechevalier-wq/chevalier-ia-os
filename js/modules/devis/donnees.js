// Données du module Devis : un écouteur sur le bordereau (devis_articles), un sur les réglages du module (devis_parametres/reglages) et un sur les devis (devis_devis) pour toute la session.
// Les devis : le navigateur crée un brouillon et modifie un brouillon (plans de brouillon.js, mêmes règles que les règles Firestore). Finaliser, marquer envoyé, signer, refuser,
// créer la version suivante et archiver passent par les quatre fonctions du serveur (devisFinaliser, devisChangerStatut, devisNouvelleVersion, devisArchiver), qui revérifient tout.
// Les règles (quoi écrire) sont dans articles.js (plans, partagés avec l'assistant) ; ici : lire, puis exécuter le plan avec le même journal que le CRM
// (`executer` de crm/donnees.js : chaque écriture laisse sa trace dans le même lot que la donnée). Les réglages s'écrivent sans journal (comme les paramètres du CRM).
// Le module lit le CRM (étapes des affaires) par crm/donnees.js ; le CRM démarre avant lui.
import { collection, doc, onSnapshot, setDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js';
import { db, app } from '../../os/firebase.js';
import * as CRM from '../crm/donnees.js';
import * as A from './articles.js';
import * as B from './brouillon.js';
import * as F from './familles.js';
import * as V from './vocabulaire-plans.js';
import * as U from './usage.js';

export const etat = {
  articles: [], familles: F.famillesDe(null), reglages: A.reglagesDevis(null), pret: false, reglagesPrets: false, erreurLecture: false,
  devis: [], devisPrets: false, erreurLectureDevis: false,
  vocabulaire: [], vocabulairePret: false, erreurLectureVocabulaire: false,
  usages: new Map(), usagesPrets: false, erreurLectureUsages: false, // compteur d'usage des articles (C4) : lu seulement, écrit par le serveur
};

let desabonnements = [];
let signature = '';
let signatureReglages = '';
let signatureFamilles = '';
let signatureDevis = '';
let signatureVocabulaire = '';
let arretVocabulaire = null;
let arretUsages = null;
let signatureUsages = '';
const abonnes = new Set();

const chemin = CRM.chemin;
export const estPret = () => etat.pret && etat.reglagesPrets;
export const estPretDevis = () => etat.devisPrets;
export const estPretVocabulaire = () => etat.vocabulairePret;
export const article = (id) => etat.articles.find((a) => a.id === id) || null;
export const devisParId = (id) => etat.devis.find((d) => d.id === id) || null;
/** Toutes les versions d'un même devis (même racine), de la plus ancienne à la plus récente. */
export const versionsDe = (racineId) => etat.devis.filter((d) => (d.racineId ?? d.id) === racineId).sort((a, b) => (a.version ?? 1) - (b.version ?? 1));

export function surChangement(rappel) {
  abonnes.add(rappel);
  return () => abonnes.delete(rappel);
}
const notifier = () => abonnes.forEach((f) => { try { f(); } catch (e) { console.warn(e); } });

// Quand seul un horodatage serveur se précise, on ne prévient pas les écrans (même règle que le CRM).
const CHAMPS_VOLATILS = new Set(['modifieLe', 'modifiePar', 'creeLe']);
const empreinte = (docs) => JSON.stringify(docs, (cle, valeur) => (CHAMPS_VOLATILS.has(cle) ? undefined : valeur));

/** Écouteur des mots appris (`devis_vocabulaire`). À part des autres : « Réessayer » le relance seul (un écouteur refusé ou coupé ne repart pas tout seul). */
function ecouterVocabulaire() {
  arretVocabulaire?.();
  arretVocabulaire = onSnapshot(collection(db, chemin(V.COLLECTION_VOCABULAIRE)), (snap) => {
    const docs = snap.docs.map((d) => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id }));
    const sig = empreinte(docs);
    const inchange = etat.vocabulairePret && sig === signatureVocabulaire && !etat.erreurLectureVocabulaire;
    etat.vocabulaire = docs;
    signatureVocabulaire = sig;
    etat.vocabulairePret = true;
    etat.erreurLectureVocabulaire = false;
    if (!inchange) notifier();
  }, (e) => {
    // La liste précédente reste affichée ; l'écran dit quoi faire et propose « Réessayer ».
    console.warn('devis_vocabulaire indisponible', e.code);
    etat.erreurLectureVocabulaire = true;
    etat.vocabulairePret = true;
    notifier();
  });
}

/**
 * Écouteur du compteur d'usage (`devis_usage_articles`). À part des autres et TOLÉRANT : si la lecture est refusée ou coupée, le catalogue reste utilisable
 * (la colonne « Utilisation » montre un tiret) ; jamais d'erreur bloquante ni de déconnexion.
 */
function ecouterUsages() {
  arretUsages?.();
  arretUsages = onSnapshot(collection(db, chemin(U.COLLECTION_USAGE)), (snap) => {
    const docs = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    const sig = JSON.stringify(docs.map((d) => [d.id, d.nombre]));
    const inchange = etat.usagesPrets && sig === signatureUsages && !etat.erreurLectureUsages;
    etat.usages = U.usageParArticle(docs);
    signatureUsages = sig;
    etat.usagesPrets = true;
    etat.erreurLectureUsages = false;
    if (!inchange) notifier();
  }, (e) => {
    console.warn('devis_usage_articles indisponible', e.code);
    etat.erreurLectureUsages = true;
    etat.usagesPrets = true;
    notifier();
  });
}

/** « Réessayer » de l'écran Vocabulaire : relance la lecture des mots appris. */
export function relancerVocabulaire() {
  etat.erreurLectureVocabulaire = false;
  etat.vocabulairePret = false;
  notifier();
  ecouterVocabulaire();
}

export function demarrer(base = '') {
  // Le CRM démarre d'abord (ordre du registre) et fixe le chemin : on refuse un désaccord plutôt que d'écrire à deux endroits.
  if (base !== CRM.cheminDeBase()) throw new Error('Le module Devis doit utiliser le même chemin de base que les affaires');
  desabonnements.push(onSnapshot(collection(db, chemin(A.COLLECTION_ARTICLES)), (snap) => {
    const docs = snap.docs.map((d) => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id }));
    const sig = empreinte(docs);
    const inchange = etat.pret && sig === signature && !etat.erreurLecture;
    etat.articles = docs;
    signature = sig;
    etat.pret = true;
    etat.erreurLecture = false;
    if (!inchange) notifier();
  }, (e) => {
    // La liste précédente reste affichée ; l'écran dit quoi faire.
    console.warn('devis_articles indisponible', e.code);
    etat.erreurLecture = true;
    etat.pret = true;
    notifier();
  }));
  desabonnements.push(onSnapshot(collection(db, chemin(B.COLLECTION_DEVIS)), (snap) => {
    const docs = snap.docs.map((d) => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id }));
    const sig = empreinte(docs);
    const inchange = etat.devisPrets && sig === signatureDevis && !etat.erreurLectureDevis;
    etat.devis = docs;
    signatureDevis = sig;
    etat.devisPrets = true;
    etat.erreurLectureDevis = false;
    if (!inchange) notifier();
  }, (e) => {
    // La liste précédente reste affichée ; l'écran dit quoi faire.
    console.warn('devis_devis indisponible', e.code);
    etat.erreurLectureDevis = true;
    etat.devisPrets = true;
    notifier();
  }));
  ecouterVocabulaire();
  ecouterUsages();
  desabonnements.push(onSnapshot(doc(db, chemin(A.COLLECTION_PARAMETRES), A.ID_REGLAGES), (snap) => {
    const brut = snap.exists() ? snap.data({ serverTimestamps: 'estimate' }) : null;
    const sig = JSON.stringify(brut);
    const inchange = etat.reglagesPrets && sig === signatureReglages;
    etat.reglages = A.reglagesDevis(brut);
    signatureReglages = sig;
    etat.reglagesPrets = true;
    if (!inchange) notifier();
  }, (e) => {
    console.warn('devis_parametres indisponible', e.code);
    etat.reglagesPrets = true;
    notifier();
  }));
  // Familles d'articles : document `devis_parametres/familles` (absent = les sept familles par défaut). Une lecture refusée garde la liste affichée.
  desabonnements.push(onSnapshot(doc(db, chemin(A.COLLECTION_PARAMETRES), F.ID_DOCUMENT_FAMILLES), (snap) => {
    const brut = snap.exists() ? snap.data({ serverTimestamps: 'estimate' }) : null;
    const sig = JSON.stringify(brut);
    if (sig === signatureFamilles) return;
    signatureFamilles = sig;
    etat.familles = F.famillesDe(brut);
    notifier();
  }, (e) => { console.warn('devis_parametres/familles indisponible', e.code); }));
}

export function arreter() {
  desabonnements.forEach((f) => f());
  desabonnements = [];
  arretVocabulaire?.();
  arretVocabulaire = null;
  arretUsages?.();
  arretUsages = null;
  etat.usages = new Map();
  etat.usagesPrets = false;
  etat.erreurLectureUsages = false;
  signatureUsages = '';
  etat.vocabulaire = [];
  etat.vocabulairePret = false;
  etat.erreurLectureVocabulaire = false;
  signatureVocabulaire = '';
  etat.articles = [];
  etat.familles = F.famillesDe(null);
  signatureFamilles = '';
  etat.reglages = A.reglagesDevis(null);
  etat.pret = false;
  etat.reglagesPrets = false;
  etat.erreurLecture = false;
  etat.devis = [];
  etat.devisPrets = false;
  etat.erreurLectureDevis = false;
  signature = '';
  signatureReglages = '';
  signatureDevis = '';
}

// ---------------------------------------------------------------- écritures

/** Crée un article. Renvoie `{ erreurs, id }` : des erreurs de saisie (messages à montrer) ne lèvent pas d'exception ; une écriture refusée lève. */
export async function creerArticle(valeurs) {
  const plan = A.planCreerArticle(valeurs, CRM.ctx(), { articles: etat.articles, familles: etat.familles });
  if (Object.keys(plan.erreurs).length) return { erreurs: plan.erreurs, id: null };
  await CRM.executer(plan.ecritures, 'creerArticle');
  return { erreurs: {}, id: plan.id };
}

/** Modifie des champs d'un article : `{ erreurs, patch }`. */
export async function majArticle(id, patch) {
  const plan = A.planMajArticle(id, patch, { articles: etat.articles, familles: etat.familles });
  if (Object.keys(plan.erreurs).length) return { erreurs: plan.erreurs, patch: {} };
  await CRM.executer(plan.ecritures, 'majArticle');
  return { erreurs: {}, patch: plan.patch };
}

/** Modifie plusieurs articles en UN lot (une seule opération dans le journal) : `lots` = [{ id, patch }] ; rien n'est écrit si un plan a une erreur. `{ erreurs }` (clé = identifiant de l'article, valeur = les erreurs de son plan par champ). */
export async function majArticles(lots) {
  const plans = lots.map(({ id, patch }) => ({ id, plan: A.planMajArticle(id, patch, { articles: etat.articles, familles: etat.familles }) }));
  const erreurs = {};
  for (const { id, plan } of plans) { if (Object.keys(plan.erreurs).length) erreurs[id] = plan.erreurs; }
  if (Object.keys(erreurs).length) return { erreurs };
  await CRM.executer(plans.flatMap(({ plan }) => plan.ecritures), 'majArticle');
  return { erreurs: {} };
}

/** Désactive (actif = false) ou réactive (actif = true) : `{ erreurs }`. */
export async function activerArticle(id, actif) {
  const plan = A.planActiverArticle(id, actif, { articles: etat.articles, familles: etat.familles });
  if (Object.keys(plan.erreurs).length) return { erreurs: plan.erreurs };
  await CRM.executer(plan.ecritures, actif ? 'reactiverArticle' : 'desactiverArticle');
  return { erreurs: {} };
}

// ---------------------------------------------------------------- mots appris (vocabulaire) : plans de vocabulaire-plans.js, journal « vocabulaire »
/** Crée un mot à la main : `{ erreurs, id, existante }`. Un mot qui existe déjà n'est jamais écrasé : `existante` le désigne. */
export async function creerMotVocabulaire(valeurs) {
  // Liste pas lue ou en erreur : un mot existant resterait invisible et « creer » (un set) l'écraserait en silence.
  if (etat.erreurLectureVocabulaire || !etat.vocabulairePret) return { erreurs: { general: V.MESSAGE_LISTE_INDISPONIBLE }, id: null, existante: null };
  const plan = V.planCreerMot(valeurs, CRM.ctx(), { regles: etat.vocabulaire, articles: etat.articles, familles: etat.familles });
  if (Object.keys(plan.erreurs).length) return { erreurs: plan.erreurs, id: plan.id, existante: plan.existante };
  await CRM.executer(plan.ecritures, V.OUTIL_VOCABULAIRE);
  return { erreurs: {}, id: plan.id, existante: null };
}
/** Active ou désactive un mot : `{ erreurs }`. */
export async function changerStatutMot(id, statut, { restaurer = false } = {}) {
  const plan = V.planChangerStatut(id, statut, { regles: etat.vocabulaire, articles: etat.articles, familles: etat.familles, restaurer, aujourdhui: CRM.ctx().aujourdhui });
  if (Object.keys(plan.erreurs).length) return { erreurs: plan.erreurs };
  await CRM.executer(plan.ecritures, V.OUTIL_VOCABULAIRE);
  return { erreurs: {} };
}
/** Change l'article d'un mot : `{ erreurs }`. */
export async function changerArticleMot(id, articleId) {
  const plan = V.planChangerArticle(id, articleId, { regles: etat.vocabulaire, articles: etat.articles, familles: etat.familles, aujourdhui: CRM.ctx().aujourdhui });
  if (Object.keys(plan.erreurs).length) return { erreurs: plan.erreurs };
  await CRM.executer(plan.ecritures, V.OUTIL_VOCABULAIRE);
  return { erreurs: {} };
}
/** Change ce que désigne un mot (1 à 8 choix : articles `{ genre, id }` ou identifiants, familles `{ genre: 'famille', id }`) : `{ erreurs }`. Un seul article = `articleId` ; plusieurs ou une famille = `cibles`, sans article (voir vocabulaire-plans.js). */
export async function changerCiblesMot(id, articleIds) {
  const plan = V.planChangerCibles(id, articleIds, { regles: etat.vocabulaire, articles: etat.articles, familles: etat.familles, aujourdhui: CRM.ctx().aujourdhui });
  if (Object.keys(plan.erreurs).length) return { erreurs: plan.erreurs };
  await CRM.executer(plan.ecritures, V.OUTIL_VOCABULAIRE);
  return { erreurs: {} };
}
/** Écrit la note d'un mot : `{ erreurs }`. */
export async function noterMot(id, note) {
  const plan = V.planNote(id, note, { regles: etat.vocabulaire });
  if (Object.keys(plan.erreurs).length) return { erreurs: plan.erreurs };
  await CRM.executer(plan.ecritures, V.OUTIL_VOCABULAIRE);
  return { erreurs: {} };
}

// ---------------------------------------------------------------- familles (liste complète réécrite à chaque changement, sans journal : comme les réglages)
async function ecrireFamilles(plan) {
  if (plan.erreur) return { erreur: plan.erreur, famille: null };
  await setDoc(doc(db, chemin(A.COLLECTION_PARAMETRES), F.ID_DOCUMENT_FAMILLES), { liste: plan.familles });
  etat.familles = plan.familles; // l'écran voit tout de suite le changement (l'écouteur confirme ensuite)
  notifier();
  return { erreur: null, famille: plan.famille };
}
/** Crée une sous-famille sous `parentId` (une famille de premier niveau) : `{ erreur, famille }` (l'erreur est un message à montrer). */
export const creerFamille = (nom, parentId) => ecrireFamilles(F.planCreationFamille(nom, etat.familles, { parentId, nouvelId: () => CRM.ctx().nouvelId(A.COLLECTION_PARAMETRES) }));
export const renommerFamille = (id, nom) => ecrireFamilles(F.planRenommerFamille(id, nom, etat.familles));
export const activerFamille = (id, actif) => ecrireFamilles(F.planDesactiverFamille(id, etat.familles, actif));

/** Les données du module pour l'export : { devis_articles, devis_parametres, devis_devis, devis_vocabulaire, devis_usage_articles } (toutes versions, tous statuts, archivés compris). Jamais le compteur de numéros (réservé au serveur). */
export const lireToutPourExport = () => CRM.collectionsParNoms(['devis_articles', 'devis_parametres', 'devis_devis', 'devis_vocabulaire', 'devis_usage_articles']);

/** Enregistre les réglages du module (document complet). `saisie` : les champs saisis ; renvoie `{ erreurs, reglages }`. */
export async function enregistrerReglages(saisie) {
  const r = A.validerReglagesDevis(saisie, { actuels: etat.reglages });
  if (Object.keys(r.erreurs).length) return { erreurs: r.erreurs, reglages: null };
  await setDoc(doc(db, chemin(A.COLLECTION_PARAMETRES), A.ID_REGLAGES), r.reglages);
  return { erreurs: {}, reglages: r.reglages };
}

// ---------------------------------------------------------------- devis : brouillons (écriture directe, plans de brouillon.js)

/** Crée un brouillon de devis (version 1, sans numéro) : `{ erreurs, id }`. Les réglages du module donnent la marge, la TVA et la durée de validité de départ. */
export async function creerBrouillon(valeurs) {
  const c = CRM.ctx();
  const plan = B.planCreerBrouillon(valeurs, { ...c, proprietaire: c.auteur }, etat.reglages);
  if (Object.keys(plan.erreurs).length) return { erreurs: plan.erreurs, id: null };
  await CRM.executer(plan.ecritures, 'creerBrouillonDevis');
  return { erreurs: {}, id: plan.id };
}

/** Modifie des champs d'un brouillon : `{ erreurs, patch }`. Refusé côté navigateur si le devis n'est plus un brouillon (les règles Firestore le refusent aussi). */
export async function modifierBrouillon(id, patch) {
  const plan = B.planModifierBrouillon(devisParId(id), patch);
  if (Object.keys(plan.erreurs).length) return { erreurs: plan.erreurs, patch: {} };
  await CRM.executer(plan.ecritures, 'modifierBrouillonDevis');
  return { erreurs: {}, patch: plan.patch };
}

// ---------------------------------------------------------------- devis : transitions (fonctions du serveur)
// Chez un client, la demande porte le nom de son espace (déduit de la session, vérifié par le serveur : éditeur de cet espace, module « devis » actif).
// Chez Jérôme, aucun espace : le serveur vérifie que le compte est l'un des deux comptes autorisés.
const fonctions = () => getFunctions(app, 'europe-west9');
const FONCTIONS = Object.freeze({ finaliser: 'devisFinaliser', changerStatut: 'devisChangerStatut', nouvelleVersion: 'devisNouvelleVersion', archiver: 'devisArchiver', supprimer: 'devisSupprimer', enregistrerEnvoi: 'devisEnregistrerEnvoi', modifierDestinataires: 'devisModifierDestinataires', pdf: 'devisPdf', pdfLien: 'devisPdfLien', preparerEmail: 'devisPreparerEmail', preparerEmailEtat: 'devisPreparerEmailEtat' });
const CODES_LISIBLES = ['permission-denied', 'invalid-argument', 'failed-precondition', 'not-found', 'unauthenticated'];
export const MESSAGE_RESEAU_DEVIS = 'Ça n’a pas abouti. Vérifie ta connexion internet, puis réessaie : rien n’a été perdu.';

/** Erreur d'appel -> message à afficher (le SDK ajoute « [403] » en fin de message : on l'enlève). */
export function messageDErreurDevis(e) {
  const code = String(e?.code ?? '').replace('functions/', '');
  const message = String(e?.message ?? '').replace(/\s*\[\d{3}\]$/, '').trim();
  return CODES_LISIBLES.includes(code) && message && message !== code ? message : MESSAGE_RESEAU_DEVIS;
}

async function appeler(operation, demande) {
  const base = CRM.cheminDeBase();
  const client = base ? base.split('/')[1] : undefined;
  try {
    const r = await httpsCallable(fonctions(), FONCTIONS[operation])(client ? { client, ...demande } : demande);
    return r.data;
  } catch (e) {
    console.warn('Devis : appel refusé', operation, e?.code);
    throw Object.assign(new Error(messageDErreurDevis(e)), { code: e?.code });
  }
}

/** Finalise un brouillon : `{ ok: true, devisId, statut, numero, nouveauNumero }` ou `{ ok: false, erreurs: [messages à corriger] }` (rien n'est écrit). Lève une Error lisible si refusé. */
export const finaliser = async (devisId) => {
  const r = await appeler('finaliser', { devisId });
  // La copie locale suit tout de suite (le prochain instantané du serveur la remplace) : l'écran qui s'ouvre ensuite sur ce devis le voit déjà finalisé, jamais un instant modifiable.
  const d = r?.ok === false ? null : devisParId(devisId);
  if (d && d.statut === 'brouillon') { d.statut = r?.statut ?? 'en_attente_envoi'; if (r?.numero) d.numero = r.numero; }
  return r;
};
/** `action` : marquer_envoye | accepter (Signé) | refuser. */
export const changerStatut = (devisId, action) => appeler('changerStatut', { devisId, action });
/** Crée le brouillon suivant d'un devis finalisé, envoyé ou refusé. */
export const nouvelleVersion = (devisId) => appeler('nouvelleVersion', { devisId });
/** Archive (true) ou désarchive (false) un devis finalisé, signé ou refusé. */
export const archiver = (devisId, archive) => appeler('archiver', { devisId, archive });
/** Supprime un brouillon (le serveur refuse tout autre statut ; la copie reste dans le journal). */
export const supprimer = (devisId) => appeler('supprimer', { devisId });
/** Ajoute un envoi par e-mail à l'historique d'un devis « Envoyé » (le statut ne change pas) : `destinataires` et `copie` sont des listes d'adresses. */
export const enregistrerEnvoi = (devisId, { destinataires, copie = [] }) => appeler('enregistrerEnvoi', { devisId, destinataires, copie });
/** Change le destinataire (la copie reste telle quelle si elle n'est pas donnée) d'un devis finalisé ou envoyé : le serveur n'écrit que ces deux champs, jamais le contenu du devis. */
export const modifierDestinataires = async (devisId, { destinataires, copie }) => {
  const r = await appeler('modifierDestinataires', { devisId, destinataires, ...(copie === undefined ? {} : { copie }) });
  const d = devisParId(devisId); // sans attendre l'instantané Firestore : un second clic ne redemande pas l'adresse
  if (d) d.destinataires = destinataires;
  return r;
};
/** Relance la fabrication du PDF d'un devis finalisé (Chromium dans la fonction, rangé dans Cloud Storage) : `{ statut, lien, nom }`. Le serveur écrit seul le champ `pdf` du devis. Lève une Error lisible si refusé (brouillon, PDF non configuré…). */
export const pdfDevis = (devisId) => appeler('pdf', { devisId });
/** Fabrique le PDF « BROUILLON » filigrané d'un devis encore brouillon (il remplace le précédent) : `{ statut, lien, nom }`. Refusé par le serveur si le devis n'est plus brouillon. */
export const pdfBrouillon = (devisId) => appeler('pdf', { devisId, brouillon: true });
/** Lien de lecture signé (5 minutes) vers le PDF rangé : `{ url, expireDans, nom }`. Erreur « pas prêt » si le PDF n'existe pas encore. */
export const pdfLien = (devisId, brouillon = false, { telecharger = false } = {}) => appeler('pdfLien', { devisId, ...(brouillon ? { brouillon: true } : {}), ...(telecharger ? { telecharger: true } : {}) });

// ---------------------------------------------------------------- « Préparer l'e-mail » (un workflow n8n crée un brouillon dans le Gmail du compte ; rien n'est envoyé)
/** Demande la préparation : `{ ok, demandeId }`. Le brouillon arrive dans Gmail quelques instants plus tard ; le devis reçoit `emailPrepare` quand le serveur l'écrit. Lève une Error lisible si refusé. */
export const preparerEmailDevis = (devisId) => appeler('preparerEmail', { devisId });
let brancheEmail = null; // null = pas encore su ; true / false = réponse du serveur (gardée pour la session)
let brancheEnCours = null;
/** Le bouton « Préparer l'e-mail » doit-il être montré ? Valeur déjà connue (true / false) ou null tant que le serveur n'a pas répondu. Lance la question au premier appel. */
export function emailPreparable() {
  if (brancheEmail === null && !brancheEnCours) {
    brancheEnCours = appeler('preparerEmailEtat', {})
      .then((r) => { brancheEmail = r?.branche === true; })
      .catch((e) => { if (['permission-denied', 'not-found', 'unauthenticated', 'failed-precondition'].includes(String(e?.code ?? '').replace('functions/', ''))) brancheEmail = false; }) // fonction absente (espace pas encore déployé) ou refusée : on cache le bouton
      .finally(() => { brancheEnCours = null; });
  }
  return brancheEmail;
}
/** Réinitialise ce qui est su (essais). */
export function oublierEtatEmail() { brancheEmail = null; brancheEnCours = null; }
