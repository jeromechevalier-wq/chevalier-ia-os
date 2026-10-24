// Données du module Devis : un écouteur sur le bordereau (devis_articles) et un sur les réglages du module (devis_parametres/reglages) pour toute la session.
// Les règles (quoi écrire) sont dans articles.js (plans, partagés avec l'assistant) ; ici : lire, puis exécuter le plan avec le même journal que le CRM
// (`executer` de crm/donnees.js : chaque écriture laisse sa trace dans le même lot que la donnée). Les réglages s'écrivent sans journal (comme les paramètres du CRM).
// Le module lit le CRM (étapes des affaires) par crm/donnees.js ; le CRM démarre avant lui.
import { collection, doc, onSnapshot, setDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db } from '../../os/firebase.js';
import * as CRM from '../crm/donnees.js';
import * as A from './articles.js';

export const etat = { articles: [], reglages: A.reglagesDevis(null), pret: false, reglagesPrets: false, erreurLecture: false };

let desabonnements = [];
let signature = '';
let signatureReglages = '';
const abonnes = new Set();

const chemin = CRM.chemin;
export const estPret = () => etat.pret && etat.reglagesPrets;
export const article = (id) => etat.articles.find((a) => a.id === id) || null;

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
}

export function arreter() {
  desabonnements.forEach((f) => f());
  desabonnements = [];
  etat.articles = [];
  etat.reglages = A.reglagesDevis(null);
  etat.pret = false;
  etat.reglagesPrets = false;
  etat.erreurLecture = false;
  signature = '';
  signatureReglages = '';
}

// ---------------------------------------------------------------- écritures

/** Crée un article. Renvoie `{ erreurs, id }` : des erreurs de saisie (messages à montrer) ne lèvent pas d'exception ; une écriture refusée lève. */
export async function creerArticle(valeurs) {
  const plan = A.planCreerArticle(valeurs, CRM.ctx(), { articles: etat.articles });
  if (Object.keys(plan.erreurs).length) return { erreurs: plan.erreurs, id: null };
  await CRM.executer(plan.ecritures, 'creerArticle');
  return { erreurs: {}, id: plan.id };
}

/** Modifie des champs d'un article : `{ erreurs, patch }`. */
export async function majArticle(id, patch) {
  const plan = A.planMajArticle(id, patch, { articles: etat.articles });
  if (Object.keys(plan.erreurs).length) return { erreurs: plan.erreurs, patch: {} };
  await CRM.executer(plan.ecritures, 'majArticle');
  return { erreurs: {}, patch: plan.patch };
}

/** Désactive (actif = false) ou réactive (actif = true) : `{ erreurs }`. */
export async function activerArticle(id, actif) {
  const plan = A.planActiverArticle(id, actif, { articles: etat.articles });
  if (Object.keys(plan.erreurs).length) return { erreurs: plan.erreurs };
  await CRM.executer(plan.ecritures, actif ? 'reactiverArticle' : 'desactiverArticle');
  return { erreurs: {} };
}

/** Enregistre les réglages du module (document complet). `saisie` : les champs saisis ; renvoie `{ erreurs, reglages }`. */
export async function enregistrerReglages(saisie) {
  const etapesIds = CRM.etat.config.etapes.filter((e) => e.actif).map((e) => e.id);
  const r = A.validerReglagesDevis(saisie, { actuels: etat.reglages, etapesIds });
  if (Object.keys(r.erreurs).length) return { erreurs: r.erreurs, reglages: null };
  await setDoc(doc(db, chemin(A.COLLECTION_PARAMETRES), A.ID_REGLAGES), r.reglages);
  return { erreurs: {}, reglages: r.reglages };
}
