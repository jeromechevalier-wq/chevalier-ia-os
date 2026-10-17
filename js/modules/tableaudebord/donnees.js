// Données du module Tableau de bord : lecture en temps réel de la collection `tableaudebord_indicateurs` (un document par indicateur).
// Ce module ne fait que LIRE : les relevés sont écrits par la porte des scripts de surveillance (les règles interdisent toute écriture depuis l'écran).
// Le chemin de base vient de la coque ('' à la racine, clients/<client> côté plateforme) ; le champ `proprietaire` ne sert jamais de filtre : le chemin fait foi.
// Les dates (Timestamp) sont converties en millisecondes ici, pour que logique.js reste pur.
import { collection, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db } from '../../os/firebase.js';
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
