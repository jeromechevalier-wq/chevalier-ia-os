// Données du module Automatisations (n8n) : lecture en temps réel de ce que le serveur a copié depuis n8n (clients/<client>/executions, workflows, sync/state).
// L'écran n'ÉCRIT RIEN dans Firestore (les règles l'interdisent). Seules deux fonctions du serveur sont appelées :
//  - automatisationsRafraichir : lance une copie pour le client de l'utilisateur (le serveur le déduit de l'identité, on n'envoie aucun client) ;
//  - automatisationsRenommer : change le nom affiché d'une automatisation (éditeurs seulement, vérifié côté serveur).
import { collection, doc, onSnapshot, query, orderBy, limit } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js';
import { db, app } from '../../os/firebase.js';
import { cheminCollection } from '../../os/chemins.js';

const NB_MAX_EXECUTIONS = 300; // les plus récentes
export const etat = { executions: [], workflows: new Map(), synchro: null, pret: false };
let desabonnements = [];
let base = '';
let compte = null;
const abonnes = new Set();
const prets = { executions: false, workflows: false, synchro: false };

export const chemin = (nom) => cheminCollection(base, nom);
export const compteCourant = () => compte;
/** Seuls les éditeurs peuvent renommer (le serveur le revérifie : ceci ne sert qu'à montrer ou cacher le geste). */
export const peutRenommer = () => base !== '' && compte?.role === 'editeur';
/** Les fonctions de copie et de renommage n'existent que pour les clients de la plateforme (projet chevalier-ia-app) : pas à la racine (Jérôme). */
export const peutRafraichir = () => base !== '';

export function surChangement(rappel) {
  abonnes.add(rappel);
  return () => abonnes.delete(rappel);
}
const notifier = () => abonnes.forEach((f) => { try { f(); } catch (e) { console.warn(e); } });
const verifierPret = () => { etat.pret = prets.executions && prets.workflows && prets.synchro; };

export function demarrer(compteConnecte, cheminBase) {
  compte = compteConnecte;
  base = cheminBase;
  desabonnements.push(onSnapshot(query(collection(db, chemin('executions')), orderBy('startedAt', 'desc'), limit(NB_MAX_EXECUTIONS)), (snap) => {
    etat.executions = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
    prets.executions = true; verifierPret(); notifier();
  }, (e) => console.warn('executions indisponible', e.code)));
  desabonnements.push(onSnapshot(collection(db, chemin('workflows')), (snap) => {
    etat.workflows = new Map(snap.docs.map((d) => [d.id, { ...d.data(), id: d.id }]));
    prets.workflows = true; verifierPret(); notifier();
  }, (e) => console.warn('workflows indisponible', e.code)));
  desabonnements.push(onSnapshot(doc(db, `${chemin('sync')}/state`), (snap) => {
    etat.synchro = snap.exists() ? snap.data() : null;
    prets.synchro = true; verifierPret(); notifier();
  }, (e) => console.warn('sync indisponible', e.code)));
}

export function arreter() {
  desabonnements.forEach((f) => f());
  desabonnements = [];
  Object.assign(etat, { executions: [], workflows: new Map(), synchro: null, pret: false });
  Object.assign(prets, { executions: false, workflows: false, synchro: false });
  compte = null;
  base = '';
}

const fonctions = () => getFunctions(app, 'europe-west9');

/** Demande une copie au serveur. Renvoie { resultat, lastSyncedAt } ; lève une erreur si le serveur est injoignable ou refuse. */
export async function rafraichir() {
  const r = await httpsCallable(fonctions(), 'automatisationsRafraichir')();
  return r.data;
}

/** Renomme l'affichage d'une automatisation (libellé vide = revenir au nom d'origine). Le client est celui de la session, vérifié par le serveur. */
export async function renommer(workflowId, libelle) {
  const client = base.split('/')[1];
  const r = await httpsCallable(fonctions(), 'automatisationsRenommer')({ client, workflowId, libelle });
  return r.data;
}
