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

export const etat = {
  articles: [], familles: F.famillesDe(null), reglages: A.reglagesDevis(null), pret: false, reglagesPrets: false, erreurLecture: false,
  devis: [], devisPrets: false, erreurLectureDevis: false,
};

let desabonnements = [];
let signature = '';
let signatureReglages = '';
let signatureFamilles = '';
let signatureDevis = '';
const abonnes = new Set();

const chemin = CRM.chemin;
export const estPret = () => etat.pret && etat.reglagesPrets;
export const estPretDevis = () => etat.devisPrets;
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

/** Désactive (actif = false) ou réactive (actif = true) : `{ erreurs }`. */
export async function activerArticle(id, actif) {
  const plan = A.planActiverArticle(id, actif, { articles: etat.articles, familles: etat.familles });
  if (Object.keys(plan.erreurs).length) return { erreurs: plan.erreurs };
  await CRM.executer(plan.ecritures, actif ? 'reactiverArticle' : 'desactiverArticle');
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
/** Crée une famille : `{ erreur, famille }` (l'erreur est un message à montrer). */
export const creerFamille = (nom) => ecrireFamilles(F.planCreationFamille(nom, etat.familles, { nouvelId: () => CRM.ctx().nouvelId(A.COLLECTION_PARAMETRES) }));
export const renommerFamille = (id, nom) => ecrireFamilles(F.planRenommerFamille(id, nom, etat.familles));
export const activerFamille = (id, actif) => ecrireFamilles(F.planDesactiverFamille(id, etat.familles, actif));

/** Enregistre les réglages du module (document complet). `saisie` : les champs saisis ; renvoie `{ erreurs, reglages }`. */
export async function enregistrerReglages(saisie) {
  const etapesIds = CRM.etat.config.etapes.filter((e) => e.actif).map((e) => e.id);
  const r = A.validerReglagesDevis(saisie, { actuels: etat.reglages, etapesIds });
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
const FONCTIONS = Object.freeze({ finaliser: 'devisFinaliser', changerStatut: 'devisChangerStatut', nouvelleVersion: 'devisNouvelleVersion', archiver: 'devisArchiver', pdf: 'devisPdf' });
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
export const finaliser = (devisId) => appeler('finaliser', { devisId });
/** `action` : marquer_envoye | accepter (Signé) | refuser. */
export const changerStatut = (devisId, action) => appeler('changerStatut', { devisId, action });
/** Crée le brouillon suivant d'un devis finalisé, envoyé ou refusé. */
export const nouvelleVersion = (devisId) => appeler('nouvelleVersion', { devisId });
/** Archive (true) ou désarchive (false) un devis signé ou refusé. */
export const archiver = (devisId, archive) => appeler('archiver', { devisId, archive });
/** Fabrique le PDF d'un devis finalisé (Gotenberg puis Drive) : `{ lien, fileId }`. Le serveur écrit seul le champ `pdf` du devis. Lève une Error lisible si refusé (brouillon, PDF non configuré…). */
export const pdfDevis = (devisId) => appeler('pdf', { devisId });
