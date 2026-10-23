// Données du module Automatisations (n8n) : lecture en temps réel de ce que le serveur a copié depuis n8n (clients/<client>/executions, workflows, sync/state).
// L'écran n'ÉCRIT RIEN dans Firestore (les règles l'interdisent). Seules ces fonctions du serveur sont appelées :
//  - automatisationsRafraichir : lance une copie pour le client de l'utilisateur (le serveur le déduit de l'identité, on n'envoie aucun client) ;
//  - automatisationsRenommer : change le nom affiché d'une automatisation (éditeurs seulement, vérifié côté serveur) ;
//  - automatisationsAdmin (Chevalier IA OS, compte de Jérôme seulement, revérifié par le serveur) : « lire » = la vue de tous les propriétaires, en lecture seule
//    (les clients sont dans l'autre base) ; « rafraichir » = recopier tes propres workflows maintenant. Tes workflows « interne » se lisent en direct dans ta base.
import { collection, doc, onSnapshot, query, orderBy, limit, where } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js';
import { db, app } from '../../os/firebase.js';
import { cheminCollection } from '../../os/chemins.js';
import { estAdministrateur } from '../../os/administrateur.js';
import { fusionnerVues, compterAValider } from './logique.js';

const NB_MAX_EXECUTIONS = 300; // les plus récentes
export const etat = {
  executions: [], workflows: new Map(), synchro: null, pret: false,
  // Vue administrateur (Chevalier IA OS, compte de Jérôme) : ce que la fonction serveur a lu chez les clients, en lecture seule.
  admin: { proprietaires: [], executions: [], workflows: [], aVerifier: [], lecturePossible: true, charge: false, erreur: false },
};
let desabonnements = [];
let base = '';
let compte = null;
const abonnes = new Set();
const prets = { executions: false, workflows: false, synchro: false };

export const chemin = (nom) => cheminCollection(base, nom);
export const compteCourant = () => compte;
/** Seuls les éditeurs peuvent renommer (le serveur le revérifie : ceci ne sert qu'à montrer ou cacher le geste). */
export const peutRenommer = () => base !== '' && compte?.role === 'editeur';
/** Administrateur : le compte de Jérôme, chez lui (racine) seulement. Le serveur le revérifie à chaque appel : ceci ne sert qu'à montrer ou cacher la vue. */
export const estAdmin = () => base === '' && estAdministrateur(compte?.email);
/** Chez un client : les fonctions de la plateforme. Chez Jérôme : seulement pour l'administrateur (fonction automatisationsAdmin, projet chevalier-ia-os). */
export const peutRafraichir = () => base !== '' || estAdmin();

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
  Object.assign(etat, { executions: [], workflows: new Map(), synchro: null, pret: false, admin: { proprietaires: [], executions: [], workflows: [], aVerifier: [], lecturePossible: true, charge: false, erreur: false } });
  Object.assign(prets, { executions: false, workflows: false, synchro: false });
  compte = null;
  base = '';
}

const fonctions = () => getFunctions(app, 'europe-west9');

/** Demande une copie au serveur. Renvoie { resultat, lastSyncedAt } ; lève une erreur si le serveur est injoignable ou refuse. */
export async function rafraichir() {
  const r = estAdmin()
    ? await httpsCallable(fonctions(), 'automatisationsAdmin')({ action: 'rafraichir' })
    : await httpsCallable(fonctions(), 'automatisationsRafraichir')();
  return r.data;
}

/**
 * Vue administrateur : lit chez les clients (lecture seule, côté serveur). `proprietaire` : 'tous' ou l'identifiant d'un client.
 * Un échec ne casse rien : tes propres workflows restent affichés, l'écran le dit.
 */
export async function chargerClients(proprietaire = 'tous') {
  if (!estAdmin()) return;
  try {
    const r = await httpsCallable(fonctions(), 'automatisationsAdmin')({ action: 'lire', proprietaire });
    const d = r.data ?? {};
    etat.admin = {
      proprietaires: Array.isArray(d.proprietaires) ? d.proprietaires : [], executions: Array.isArray(d.executions) ? d.executions : [],
      workflows: Array.isArray(d.workflows) ? d.workflows : [], aVerifier: Array.isArray(d.aVerifier) ? d.aVerifier : [],
      lecturePossible: d.lecturePossible !== false, charge: true, erreur: false,
    };
  } catch (e) {
    console.warn('Vue administrateur indisponible', e?.code);
    etat.admin = { ...etat.admin, charge: true, erreur: true };
  }
  notifier();
}

/** Ce que l'écran affiche selon le filtre de propriétaire : tes données (live) et/ou celles des clients (fonction). */
export const vue = (filtre = 'tous') => fusionnerVues({ executions: etat.executions, workflows: etat.workflows }, etat.admin, estAdmin() ? filtre : 'interne-seul');

/** Renomme l'affichage d'une automatisation (libellé vide = revenir au nom d'origine). Le client est celui de la session, vérifié par le serveur. */
export async function renommer(workflowId, libelle) {
  const client = base.split('/')[1];
  const r = await httpsCallable(fonctions(), 'automatisationsRenommer')({ client, workflowId, libelle });
  return r.data;
}

// ---------------------------------------------------------------- pastille « à valider » du menu
/**
 * Pastille du menu : écoute permanente des seules propositions `a_valider` (UN where, jamais de requête composée) ; `rappel(n)` reçoit le nombre de celles qui ne sont pas périmées.
 * Lecture refusée ou en échec : `rappel(0)` (pas de pastille, pas d'erreur montrée). Une proposition qui devient périmée est décomptée au plus une minute plus tard. Renvoie la fonction qui arrête tout.
 */
export function ecouterNombreAValider(rappel) {
  let liste = [];
  const envoyer = () => { try { rappel(compterAValider(liste, Date.now())); } catch (e) { console.warn(e); } };
  let arret = () => {};
  try {
    arret = onSnapshot(query(collection(db, chemin('automatisations_propositions')), where('etat', '==', 'a_valider')), (snap) => {
      liste = snap.docs.map((d) => d.data());
      envoyer();
    }, (e) => {
      console.warn('pastille à valider indisponible', e.code);
      liste = []; envoyer();
    });
  } catch (e) {
    console.warn('pastille à valider indisponible', e?.code);
    return () => {};
  }
  const minuterie = setInterval(envoyer, 60000);
  return () => { clearInterval(minuterie); arret(); liste = []; };
}

// ---------------------------------------------------------------- file « À valider » (propositions déposées par les workflows)
// Lecture en direct de la collection, ouverte seulement quand l'écran « À valider » est affiché (rien ne change pour l'Historique).
// Pas de where ni d'orderBy : le tri se fait côté client (logique.js). L'écran n'ÉCRIT rien dans Firestore : valider, refuser et relancer passent par la fonction
// appelable automatisationsDecider, qui revérifie le compte, l'état et les champs.
export const propositions = { liste: [], pret: false, erreur: false };

/** Ouvre l'écoute en direct ; `rappel` est appelé à chaque changement. Renvoie la fonction qui arrête l'écoute. */
export function ecouterPropositions(rappel) {
  propositions.liste = []; propositions.pret = false; propositions.erreur = false;
  let arret = () => {};
  try {
    arret = onSnapshot(collection(db, chemin('automatisations_propositions')), (snap) => {
      propositions.liste = snap.docs.map((d) => ({ ...d.data(), id: d.id }));
      propositions.pret = true; propositions.erreur = false; rappel();
    }, (e) => {
      console.warn('propositions indisponibles', e.code);
      propositions.liste = []; propositions.pret = true; propositions.erreur = true; rappel();
    });
  } catch (e) {
    console.warn('propositions indisponibles', e?.code);
    propositions.pret = true; propositions.erreur = true; rappel();
  }
  return () => { arret(); propositions.liste = []; propositions.pret = false; propositions.erreur = false; };
}

/**
 * Valide, refuse ou relance une proposition (le serveur revérifie tout). decision : 'valider' | 'refuser' | 'relancer'.
 * `champs` (valider, facultatif) : valeurs corrigées [{ nom, valeur }] ; `raison` (refuser, facultative).
 * Renvoie { ok: true } ou { ok: false, message } : le message du serveur (« Déjà décidée par … ») est repris tel quel.
 */
export async function decider(id, decision, { champs, raison } = {}) {
  const corps = { id, decision };
  if (champs) corps.champs = champs;
  if (raison) corps.raison = raison;
  try {
    await httpsCallable(fonctions(), 'automatisationsDecider')(corps);
    return { ok: true };
  } catch (e) {
    console.warn('Décision impossible', e?.code);
    const precise = ['functions/failed-precondition', 'functions/invalid-argument', 'functions/not-found', 'functions/permission-denied', 'functions/aborted'].includes(e?.code);
    // Le SDK ajoute le code HTTP au bout du message du serveur (« … [400] ») : on le retire pour afficher exactement le texte du serveur.
    const texte = typeof e?.message === 'string' ? e.message.replace(/\s*\[\d{3}\]\s*$/, '').trim() : '';
    const message = precise && texte ? texte : 'Impossible de joindre le serveur pour le moment. Rien n’a été changé : réessaie dans un instant.';
    return { ok: false, message };
  }
}
