// Données du CRM : un écouteur onSnapshot par collection pour toute la session, écritures Firestore.
import {
  collection, doc, onSnapshot, addDoc, updateDoc, deleteDoc, setDoc, runTransaction, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db } from '../../os/firebase.js';
import {
  OFFRES_DEPART, SECTEURS_DEPART, SOURCES_DEPART, FILTRES_DEPART, REGLAGES_DEPART,
  nouvelleFiche, aujourdhuiParis,
} from './logique.js';

const PARAMETRES_DEPART = {
  offres: { items: OFFRES_DEPART },
  listes: { secteurs: SECTEURS_DEPART, sources: SOURCES_DEPART },
  filtres: { items: FILTRES_DEPART },
  reglages: REGLAGES_DEPART,
};

export const etat = {
  fiches: [],
  offres: [],
  secteurs: [],
  sources: [],
  filtres: [],
  reglages: { ...REGLAGES_DEPART },
  pretFiches: false,
  pretParametres: false,
};

let compte = null;
let desabonnements = [];
const abonnes = new Set();
let initialisation = false;

export function estPret() {
  return etat.pretFiches && etat.pretParametres;
}

export function surChangement(rappel) {
  abonnes.add(rappel);
  return () => abonnes.delete(rappel);
}

function notifier() {
  abonnes.forEach((f) => { try { f(); } catch (e) { console.warn(e); } });
}

export function compteCourant() {
  return compte;
}

/** Contexte des patchs de la logique métier. */
export function ctx() {
  const maintenant = new Date();
  return { maintenant, auteur: compte?.email || '', aujourdhui: aujourdhuiParis(maintenant) };
}

export function fiche(id) {
  return etat.fiches.find((f) => f.id === id) || null;
}

export function demarrer(compteConnecte) {
  compte = compteConnecte;
  desabonnements.push(onSnapshot(collection(db, 'crm_prospects'), (snap) => {
    etat.fiches = snap.docs.map((d) => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id }));
    etat.pretFiches = true;
    notifier();
  }, (e) => console.warn('Prospects indisponibles', e.code)));
  desabonnements.push(onSnapshot(collection(db, 'crm_parametres'), (snap) => {
    const docs = Object.fromEntries(snap.docs.map((d) => [d.id, d.data({ serverTimestamps: 'estimate' })]));
    etat.offres = [...(docs.offres?.items || [])].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
    etat.secteurs = docs.listes?.secteurs || [];
    etat.sources = docs.listes?.sources || [];
    etat.filtres = [...(docs.filtres?.items || [])].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
    etat.reglages = { ...REGLAGES_DEPART, ...(docs.reglages || {}) };
    etat.pretParametres = true;
    if (!snap.metadata.fromCache) initialiserParametres(Object.keys(docs));
    notifier();
  }, (e) => console.warn('Paramètres indisponibles', e.code)));
}

export function arreter() {
  desabonnements.forEach((f) => f());
  desabonnements = [];
  etat.fiches = [];
  etat.pretFiches = false;
  etat.pretParametres = false;
  initialisation = false;
  compte = null;
}

/** Premier lancement : crée les documents de paramètres manquants avec les valeurs de départ. */
async function initialiserParametres(existants) {
  const manquants = Object.keys(PARAMETRES_DEPART).filter((id) => !existants.includes(id));
  if (!manquants.length || initialisation) return;
  initialisation = true;
  for (const id of manquants) {
    const ref = doc(db, 'crm_parametres', id);
    await runTransaction(db, async (t) => {
      const s = await t.get(ref);
      if (!s.exists()) t.set(ref, PARAMETRES_DEPART[id]);
    }).catch((e) => console.warn('Initialisation des paramètres', e.code));
  }
}

// ---------------------------------------------------------------- écritures des fiches

export async function creerFiche(valeurs) {
  const c = ctx();
  const document = {
    ...nouvelleFiche(valeurs, c),
    creeLe: serverTimestamp(),
    modifieLe: serverTimestamp(),
  };
  const ref = await addDoc(collection(db, 'crm_prospects'), document);
  return ref.id;
}

export async function majFiche(id, patch) {
  if (!patch) return;
  await updateDoc(doc(db, 'crm_prospects', id), {
    ...patch,
    modifieLe: serverTimestamp(),
    modifiePar: compte?.email || '',
  });
}

export async function supprimerFiche(id) {
  await deleteDoc(doc(db, 'crm_prospects', id));
}

// ---------------------------------------------------------------- écritures des paramètres

export async function majParametre(id, donnees) {
  await setDoc(doc(db, 'crm_parametres', id), donnees, { merge: true });
}

export async function enregistrerOffres(items) {
  await majParametre('offres', { items: items.map((o, i) => ({ ...o, ordre: i + 1 })) });
}

export async function enregistrerListes(listes) {
  await majParametre('listes', { secteurs: etat.secteurs, sources: etat.sources, ...listes });
}

export async function enregistrerFiltres(items) {
  await majParametre('filtres', { items });
}

export async function enregistrerReglages(patch) {
  await majParametre('reglages', patch);
}

export async function noterExportComplet() {
  await majParametre('reglages', { dernierExport: serverTimestamp() });
}
