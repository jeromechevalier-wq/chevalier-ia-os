// Données du module Projets (version 2.1) : un écouteur Firestore sur les projets et un sur les tâches pour toute la session, écritures par plans.
// Les règles (quoi écrire) sont dans logique.js ; ici : lire ce qu'il faut et exécuter le plan avec le même audit que le CRM
// (`executer` de crm/donnees.js : chaque écriture laisse sa trace dans le même lot que la donnée).
// Le module lit le CRM (personnes, organisations, affaires) par crm/donnees.js ; il n'y écrit qu'à la suppression d'un projet
// (le lien `projetId` de l'affaire est vidé, voir planSupprimerProjet).
import { collection, onSnapshot, query, where, getDocs } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db } from '../../os/firebase.js';
import * as CRM from '../crm/donnees.js';
import * as P from './logique.js';

export const etat = { projets: [], taches: [], pret: false, tachesPretes: false };

let desabonnements = [];
let signature = '';
let signatureTaches = '';
const abonnes = new Set();

export const estPret = () => etat.pret && etat.tachesPretes;
export const ctx = CRM.ctx;
export const projet = (id) => etat.projets.find((p) => p.id === id) || null;
export const tache = (id) => etat.taches.find((t) => t.id === id) || null;
/** Les tâches d'un projet, par phase puis par ordre. */
export const tachesDe = (projetId) => P.tachesDuProjet(etat.taches, projetId);

export function surChangement(rappel) {
  abonnes.add(rappel);
  return () => abonnes.delete(rappel);
}

function notifier() {
  abonnes.forEach((f) => { try { f(); } catch (e) { console.warn(e); } });
}

// Même règle que le CRM : quand seul un horodatage serveur se précise, on ne prévient pas les écrans.
const CHAMPS_VOLATILS = new Set(['modifieLe', 'modifiePar', 'creeLe']);
const empreinte = (docs) => JSON.stringify(docs, (cle, valeur) => (CHAMPS_VOLATILS.has(cle) ? undefined : valeur));

export function demarrer() {
  // Un écouteur par collection pour toute la session (comme les activités du CRM) : les tâches servent à l'avancement, au retard et à l'Accueil.
  desabonnements.push(onSnapshot(collection(db, 'projets_projets'), (snap) => {
    const docs = snap.docs.map((d) => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id }));
    const sig = empreinte(docs);
    const inchange = etat.pret && sig === signature;
    etat.projets = docs;
    signature = sig;
    etat.pret = true;
    if (!inchange) notifier();
  }, (e) => console.warn('projets_projets indisponible', e.code)));
  desabonnements.push(onSnapshot(collection(db, 'projets_taches'), (snap) => {
    const docs = snap.docs.map((d) => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id }));
    const sig = empreinte(docs);
    const inchange = etat.tachesPretes && sig === signatureTaches;
    etat.taches = docs;
    signatureTaches = sig;
    etat.tachesPretes = true;
    if (!inchange) notifier();
  }, (e) => console.warn('projets_taches indisponible', e.code)));
}

export function arreter() {
  desabonnements.forEach((f) => f());
  desabonnements = [];
  etat.projets = [];
  etat.taches = [];
  etat.pret = false;
  etat.tachesPretes = false;
  signature = '';
  signatureTaches = '';
}

// ---------------------------------------------------------------- écritures

async function appliquer(plan, outil) {
  await CRM.executer(plan.ecritures, outil);
  return plan;
}

/** Valeurs : titre (obligatoire) et, facultatif, personneId, organisationId, affaireId, offreId, dateDebut, dateFin. Renvoie l'identifiant du projet. */
export async function creerProjet(valeurs) {
  const plan = P.planCreerProjet(valeurs, ctx());
  await appliquer(plan, 'creerProjet');
  return plan.id;
}

export async function majProjet(id, patch) {
  await appliquer(P.planMajProjet(id, patch), 'majProjet');
}

function regle(id, planFn, outil) {
  const p = projet(id);
  if (!p) throw new Error('Projet introuvable');
  return appliquer(planFn(p), outil);
}

/** Changement de phase ; renvoie { erreurs, patch, evenements }. */
export const changerPhase = (id, phase) => regle(id, (p) => P.planChangerPhase(p, phase, ctx()), 'changerPhase');
export const mettreEnPause = (id) => regle(id, (p) => P.planMettreProjetEnPause(p, ctx()), 'mettreProjetEnPause');
export const reprendre = (id) => regle(id, (p) => P.planReprendreProjet(p, ctx()), 'reprendreProjet');
export const terminer = (id) => regle(id, (p) => P.planTerminerProjet(p, ctx()), 'terminerProjet');
export const rouvrir = (id) => regle(id, (p) => P.planRouvrirProjet(p, ctx()), 'rouvrirProjet');
export const archiver = (id, archive = true) => regle(id, (p) => P.planArchiverProjet(p, archive, ctx()), 'archiverProjet');

/** Notes d'un projet : rattachées au projet et à tout ce qu'il relie (elles apparaissent aussi dans l'historique de l'affaire, de la personne, de l'organisation). */
export async function creerNote(id, texte) {
  const p = projet(id);
  if (!p) throw new Error('Projet introuvable');
  return CRM.creerNote(texte, P.liensProjet(p));
}

/** Éléments du fil (notes, événements, activités) et tâches qui portent le `projetId`. */
async function liensDuProjet(id) {
  const noms = ['crm_activites', 'crm_notes', 'crm_evenements'];
  const reponses = await Promise.all(noms.map((nom) => getDocs(query(collection(db, nom), where('projetId', '==', id)))));
  return reponses.flatMap((r, i) => r.docs.map((d) => ({ collection: noms[i], id: d.id, projetId: id })));
}

/** Suppression définitive : le projet, ses tâches et son fil ; l'affaire est détachée, les extractions perdent leur source. */
export async function supprimerProjet(id) {
  const p = projet(id);
  if (!p) throw new Error('Projet introuvable');
  const [liens, taches, extractions] = await Promise.all([
    liensDuProjet(id),
    getDocs(query(collection(db, 'projets_taches'), where('projetId', '==', id))),
    getDocs(query(collection(db, 'projets_projets'), where('projetSourceId', '==', id))),
  ]);
  const plan = P.planSupprimerProjet({
    projet: p,
    liens,
    taches: taches.docs.map((d) => ({ id: d.id, projetId: id })),
    affaire: p.affaireId ? CRM.affaire(p.affaireId) : null,
    extractions: extractions.docs.map((d) => ({ id: d.id, projetSourceId: id })),
  });
  await appliquer(plan, 'supprimerProjet');
}

// ---------------------------------------------------------------- lien avec une affaire gagnée

/** Un plan refusé par une règle (affaire pas gagnée, déjà un projet…) : le message de la règle est celui de l'erreur. */
async function appliquerLien(plan, outil) {
  if (Object.keys(plan.erreurs || {}).length) throw Object.assign(new Error(Object.values(plan.erreurs).join(' ')), { saisie: true });
  return appliquer(plan, outil);
}

const affaireOuErreur = (id) => CRM.affaire(id) ?? (() => { throw new Error('Affaire introuvable'); })();

/** Crée le projet d'une affaire gagnée (reprend l'affaire) ; renvoie l'identifiant du projet. */
export async function creerProjetDepuisAffaire(affaireId, valeurs = {}) {
  const plan = P.planCreerProjetDepuisAffaire({ affaire: affaireOuErreur(affaireId), projets: etat.projets, valeurs }, ctx());
  await appliquerLien(plan, 'creerProjetDepuisAffaire');
  return plan.id;
}

export async function lierProjet(affaireId, projetId) {
  const p = projet(projetId);
  if (!p) throw new Error('Projet introuvable');
  await appliquerLien(P.planLierProjet({ affaire: affaireOuErreur(affaireId), projet: p, projets: etat.projets }, ctx()), 'lierProjet');
}

/** Détache le projet de son affaire (rien n'est supprimé). */
export async function delierProjet(projetId) {
  const p = projet(projetId);
  if (!p) throw new Error('Projet introuvable');
  await appliquerLien(P.planDelierProjet({ projet: p, affaire: p.affaireId ? CRM.affaire(p.affaireId) : null }, ctx()), 'delierProjet');
}

// ---------------------------------------------------------------- tâches

/** Une règle qui refuse (titre vide, date invalide) : son message est celui de l'erreur. */
async function appliquerTache(plan, outil) {
  if (Object.keys(plan.erreurs || {}).length) throw Object.assign(new Error(Object.values(plan.erreurs).join(' ')), { saisie: true });
  await appliquer(plan, outil);
  return plan;
}

/** Valeurs : titre (obligatoire), phase (celle du projet par défaut), date, heure, assigneA. Renvoie l'identifiant de la tâche. */
export async function creerTache(projetId, valeurs) {
  const p = projet(projetId);
  if (!p) throw new Error('Projet introuvable');
  const plan = await appliquerTache(P.planCreerTache({ projet: p, taches: etat.taches, valeurs }, ctx()), 'creerTache');
  return plan.id;
}

const tacheOuErreur = (id) => tache(id) ?? (() => { throw new Error('Tâche introuvable'); })();

export const majTache = (id, patch) => appliquerTache(P.planMajTache({ tache: tacheOuErreur(id), patch, taches: etat.taches }), 'majTache');
export const faireTache = (id) => appliquerTache(P.planTacheFaite({ tache: tacheOuErreur(id), projet: projet(tacheOuErreur(id).projetId) }, ctx()), 'faireTache');
export const defaireTache = (id) => appliquerTache(P.planTacheNonFaite({ tache: tacheOuErreur(id) }), 'defaireTache');
export const supprimerTache = (id) => appliquer(P.planSupprimerTache(id), 'supprimerTache');
/** `sens` : -1 pour monter, +1 pour descendre dans la phase. */
export const deplacerTache = (id, sens) => appliquer(P.planDeplacerTache({ tache: tacheOuErreur(id), taches: etat.taches, sens }), 'deplacerTache');
