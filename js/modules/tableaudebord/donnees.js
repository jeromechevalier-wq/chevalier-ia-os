// Données du module Tableau de bord : lecture en temps réel de la collection `tableaudebord_indicateurs` (un document par indicateur).
// Ce module n'ÉCRIT JAMAIS dans la base : les relevés sont écrits par la porte des scripts de surveillance, et une saisie faite à l'écran passe par la fonction
// appelable `tableaudebordSaisir` du serveur, qui contrôle, écrit et journalise (les règles interdisent toute écriture depuis l'écran).
// Le chemin de base vient de la coque ('' à la racine, clients/<client> côté plateforme) ; le champ `proprietaire` ne sert jamais de filtre : le chemin fait foi.
// Les dates (Timestamp) sont converties en millisecondes ici, pour que logique.js reste pur.
import { collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js';
import { db, app } from '../../os/firebase.js';
import { cheminCollection } from '../../os/chemins.js';

export const etat = { indicateurs: [], pret: false, erreur: false };
let desabonnement = null;
let base = '';
const abonnes = new Set();

export const chemin = () => cheminCollection(base, 'tableaudebord_indicateurs');

export function surChangement(rappel) {
  abonnes.add(rappel);
  return () => abonnes.delete(rappel);
}
const notifier = () => abonnes.forEach((f) => { try { f(); } catch (e) { console.warn(e); } });

const enMs = (v) => {
  if (v && typeof v.toMillis === 'function') return v.toMillis();
  if (v instanceof Date) return v.getTime();
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
};
const texteOuNull = (v) => (typeof v === 'string' && v.trim() ? v : null);

/** Document Firestore -> indicateur prêt pour la logique (dates en millisecondes, champs absents à null). */
export function versIndicateur(id, d = {}) {
  return {
    id,
    tableau: texteOuNull(d.tableau) ?? 'technique',
    famille: texteOuNull(d.famille),
    nom: texteOuNull(d.nom) ?? id,
    type: d.type === 'mesure' ? 'mesure' : 'etat',
    niveau: d.niveau ?? null,
    message: texteOuNull(d.message),
    valeur: d.valeur ?? null,
    unite: texteOuNull(d.unite),
    objectif: d.objectif ?? null,
    echeanceMs: enMs(d.echeance),
    releveMs: enMs(d.releveLe),
    perimeApresMinutes: typeof d.perimeApresMinutes === 'number' ? d.perimeApresMinutes : null,
    methode: d.methode ?? null,
    source: texteOuNull(d.source),
    procedure: texteOuNull(d.procedure),
  };
}

/** Démarre la lecture. Un second appel sans `arreter()` repart de zéro (c'est le « Réessayer » de l'écran). */
function ecouter() {
  desabonnement?.();
  etat.pret = false;
  etat.erreur = false;
  desabonnement = onSnapshot(collection(db, chemin()), (snap) => {
    etat.indicateurs = snap.docs.map((d) => versIndicateur(d.id, d.data()));
    etat.pret = true;
    etat.erreur = false;
    notifier();
  }, (e) => {
    console.warn('tableau de bord indisponible', e.code);
    etat.indicateurs = [];
    etat.pret = false;
    etat.erreur = true;
    notifier();
  });
}

export function demarrer(_compte, cheminBase = '') {
  base = cheminBase;
  ecouter();
}

/** « Réessayer » après une erreur de lecture. */
export function reessayer() {
  ecouter();
  notifier();
}

export function arreter() {
  desabonnement?.();
  desabonnement = null;
  Object.assign(etat, { indicateurs: [], pret: false, erreur: false });
  base = '';
}

const fonctions = () => getFunctions(app, 'europe-west9');

/**
 * Saisit une date d'échéance ({ indicateurId, echeance: 'AAAA-MM-JJ', commentaire? }) ou une valeur ({ indicateurId, valeur, commentaire? }) par la fonction `tableaudebordSaisir`.
 * Renvoie { niveau, message, rappel }. Lève une erreur au message lisible tel quel (jamais de détail technique).
 */
export async function saisir(demande) {
  try {
    const r = await httpsCallable(fonctions(), 'tableaudebordSaisir')(demande);
    return r.data;
  } catch (e) {
    const code = String(e?.code ?? '');
    const message = String(e?.message ?? '').replace(/\s*\[\d{3}\]\s*$/, '').trim();
    if (code.endsWith('failed-precondition') && message) throw new Error(message);
    if (code.endsWith('permission-denied') || code.endsWith('unauthenticated')) throw new Error('Ce compte n\'a pas accès à cette action. Reconnecte-toi si besoin.');
    if (code.endsWith('internal') && message === 'Une erreur est survenue. Réessaie.') throw new Error(message);
    throw new Error('Le serveur ne répond pas pour le moment. Réessaie dans un instant.');
  }
}
