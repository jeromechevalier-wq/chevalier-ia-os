// Données du module Projets (version 2.1) : un écouteur Firestore sur les projets et un sur les tâches pour toute la session, écritures par plans.
// Les règles (quoi écrire) sont dans logique.js ; ici : lire ce qu'il faut et exécuter le plan avec le même audit que le CRM
// (`executer` de crm/donnees.js : chaque écriture laisse sa trace dans le même lot que la donnée).
// Le module lit le CRM (personnes, organisations, affaires) par crm/donnees.js ; il n'y écrit qu'à la suppression d'un projet
// (le lien `projetId` de l'affaire est vidé, voir planSupprimerProjet).
import { collection, doc, onSnapshot, query, where, getDoc, getDocs, writeBatch, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db } from '../../os/firebase.js';
import * as CRM from '../crm/donnees.js';
import * as P from './logique.js';

export const etat = { projets: [], taches: [], modeles: [], pret: false, tachesPretes: false, modelesPrets: false };

let desabonnements = [];
let signature = '';
let signatureTaches = '';
let signatureModeles = '';
let initialisationModeles = false;
const abonnes = new Set();

export const estPret = () => etat.pret && etat.tachesPretes && etat.modelesPrets;
export const ctx = CRM.ctx;
export const projet = (id) => etat.projets.find((p) => p.id === id) || null;
export const modele = (id) => etat.modeles.find((m) => m.id === id) || null;
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
  desabonnements.push(onSnapshot(collection(db, 'projets_modeles'), (snap) => {
    const docs = snap.docs.map((d) => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id }));
    const sig = empreinte(docs);
    const inchange = etat.modelesPrets && sig === signatureModeles;
    etat.modeles = docs;
    signatureModeles = sig;
    etat.modelesPrets = true;
    if (!inchange) notifier();
    if (!snap.metadata.fromCache && snap.empty) initialiserModeles();
  }, (e) => console.warn('projets_modeles indisponible', e.code)));
}

/**
 * Premier lancement : crée les modèles de départ (Audit, Accompagnement, Extraction) et un repère dans crm_parametres, dans un seul lot, sans
 * ligne de journal (comme les paramètres de départ du CRM : ce n'est pas une action de Jérôme). Le repère évite de les recréer si Jérôme les
 * supprime tous un jour ; les identifiants sont fixes, donc deux onglets qui démarrent ensemble n'en font jamais six.
 */
async function initialiserModeles() {
  if (initialisationModeles) return;
  initialisationModeles = true;
  try {
    // Tout premier lancement : le CRM écrit ses propres paramètres de départ au même moment (dans la même collection) ; on attend qu'il ait fini
    // (le dernier créé est « reglages ») pour ne pas écrire en même temps que lui. Ensuite (usage normal), ce document existe déjà : aucune attente.
    for (let i = 0; i < 30 && !(await getDoc(doc(db, 'crm_parametres', 'reglages'))).exists(); i++) await new Promise((r) => setTimeout(r, 400));
    if ((await getDoc(doc(db, 'crm_parametres', 'modeles_projet'))).exists()) return;
    const email = CRM.compteCourant()?.email || '';
    const lot = writeBatch(db);
    for (const e of P.planInitialiserModeles().ecritures) {
      lot.set(doc(db, e.collection, e.id), { ...e.donnees, creeLe: serverTimestamp(), modifieLe: serverTimestamp(), creePar: email, modifiePar: email });
    }
    lot.set(doc(db, 'crm_parametres', 'modeles_projet'), { depart: true });
    await lot.commit();
  } catch (e) {
    console.warn('Initialisation des modèles de projet', e.code || e.message);
    initialisationModeles = false;
  }
}

export function arreter() {
  desabonnements.forEach((f) => f());
  desabonnements = [];
  etat.projets = [];
  etat.taches = [];
  etat.modeles = [];
  etat.pret = false;
  etat.tachesPretes = false;
  etat.modelesPrets = false;
  signature = '';
  signatureTaches = '';
  signatureModeles = '';
  initialisationModeles = false;
}

// ---------------------------------------------------------------- écritures

async function appliquer(plan, outil) {
  await CRM.executer(plan.ecritures, outil);
  return plan;
}

/** Valeurs : titre (obligatoire) et, facultatif, personneId, organisationId, affaireId, offreId, dateDebut, dateFin. `modeleId` : le projet part avec les tâches du modèle. Renvoie l'identifiant du projet. */
export async function creerProjet(valeurs, { modeleId = null } = {}) {
  const plan = P.planCreerProjet(valeurs, ctx(), { modele: modeleId ? modele(modeleId) : null });
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
/** Terminer un projet crée aussi son projet d'extraction de valeur (sauf pour une extraction) : le plan renvoyé a `extraction` ({ id, titre } ou null). */
/** `impaye` : { raison } pour clôturer malgré des factures non payées (elles passent à « Abandonnée »). Sans lui, une facture à payer bloque : le plan rend `erreurs.factures`. */
export const terminer = (id, { impaye = null } = {}) => regle(id, (p) => P.planTerminerProjetAvecExtraction({ projet: p, projets: etat.projets, modeles: etat.modeles, impaye }, ctx()), 'terminerProjet');
/** Extraction déclenchée à la main : { extraction: { id, titre }, dejaExistante } (si elle existe déjà, rien n'est créé). Erreur si le projet est lui-même une extraction. */
export async function extraire(id) {
  const plan = await regle(id, (p) => P.planExtraireProjet({ projet: p, projets: etat.projets, modeles: etat.modeles }, ctx()), 'extraireProjet');
  if (Object.keys(plan.erreurs || {}).length) throw Object.assign(new Error(Object.values(plan.erreurs)[0]), { saisie: true });
  return plan;
}
// Factures du projet (2.2) : chaque fonction rend le plan { erreurs, facture?, ... } ; sans erreur, c'est écrit.
export const ajouterFacture = (id, valeurs) => regle(id, (p) => P.planAjouterFacture(p, valeurs, ctx()), 'ajouterFacture');
export const modifierFacture = (id, factureId, valeurs) => regle(id, (p) => P.planModifierFacture(p, factureId, valeurs, ctx()), 'modifierFacture');
export const marquerFacturePayee = (id, factureId, options = {}) => regle(id, (p) => P.planMarquerFacturePayee(p, factureId, options, ctx()), 'marquerFacturePayee');
export const remettreFactureAPayer = (id, factureId) => regle(id, (p) => P.planRemettreFactureAPayer(p, factureId, ctx()), 'remettreFactureAPayer');
export const abandonnerFacture = (id, factureId, raison) => regle(id, (p) => P.planAbandonnerFacture(p, factureId, raison, ctx()), 'abandonnerFacture');
export const supprimerFacture = (id, factureId) => regle(id, (p) => P.planSupprimerFacture(p, factureId, ctx()), 'supprimerFacture');
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
export async function creerProjetDepuisAffaire(affaireId, valeurs = {}, { modeleId = null } = {}) {
  const plan = P.planCreerProjetDepuisAffaire({ affaire: affaireOuErreur(affaireId), projets: etat.projets, taches: etat.taches, valeurs, modele: modeleId ? modele(modeleId) : null }, ctx());
  await appliquerLien(plan, 'creerProjetDepuisAffaire');
  return plan.id;
}

export async function lierProjet(affaireId, projetId) {
  const p = projet(projetId);
  if (!p) throw new Error('Projet introuvable');
  await appliquerLien(P.planLierProjet({ affaire: affaireOuErreur(affaireId), projet: p, projets: etat.projets, taches: etat.taches }, ctx()), 'lierProjet');
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

// ---------------------------------------------------------------- modèles

export async function creerModele(valeurs) {
  const plan = await appliquerTache(P.planCreerModele({ valeurs, modeles: etat.modeles }, ctx()), 'creerModele');
  return plan.id;
}

const modeleOuErreur = (id) => modele(id) ?? (() => { throw new Error('Modèle introuvable'); })();

export const majModele = (id, patch) => appliquerTache(P.planMajModele({ modele: modeleOuErreur(id), patch }), 'majModele');
export const supprimerModele = (id) => appliquer(P.planSupprimerModele(id), 'supprimerModele');
export const ajouterTacheModele = (id, valeurs) => appliquerTache(P.planAjouterTacheModele({ modele: modeleOuErreur(id), valeurs }, ctx()), 'ajouterTacheModele');
export const majTacheModele = (id, tacheId, patch) => appliquerTache(P.planMajTacheModele({ modele: modeleOuErreur(id), tacheId, patch }), 'majTacheModele');
export const supprimerTacheModele = (id, tacheId) => appliquer(P.planSupprimerTacheModele({ modele: modeleOuErreur(id), tacheId }), 'supprimerTacheModele');
export const deplacerTacheModele = (id, tacheId, sens) => appliquer(P.planDeplacerTacheModele({ modele: modeleOuErreur(id), tacheId, sens }), 'deplacerTacheModele');

// ---------------------------------------------------------------- étape d'une affaire et perte : avec l'extraction de valeur qu'elles déclenchent
// (les deux écritures de l'affaire passent ici, et non plus par crm/donnees.js, parce que l'extraction est un projet : même règle pour l'écran et le serveur MCP)

/** Changement d'étape ; renvoie { erreurs, patch, evenements, suggestion, extraction } (`extraction` : { id, titre } si un projet d'extraction vient d'être créé). */
export async function changerEtapeAffaire(id, etape, options = {}) {
  const a = CRM.affaire(id);
  if (!a) throw new Error('Affaire introuvable');
  return appliquer(P.planChangerEtapeAvecExtraction({ affaire: a, etape, options, projets: etat.projets, modeles: etat.modeles }, ctx()), 'changerEtape');
}

/** Affaire perdue ; renvoie { erreurs, patch, evenements, extraction }. */
export async function marquerAffairePerdue(id, saisie) {
  const a = CRM.affaire(id);
  if (!a) throw new Error('Affaire introuvable');
  return appliquer(P.planMarquerPerdueAvecExtraction({ affaire: a, saisie, projets: etat.projets, modeles: etat.modeles }, ctx()), 'marquerAffairePerdue');
}

// ---------------------------------------------------------------- migration 2.2 (étapes « Facture envoyée / payée » retirées)

/** Aperçu de la migration : { migrees, aTraiterAMain } sans rien écrire. */
export function apercuMigrationEtapes() {
  const plan = P.planMigrerEtapesRetirees({ affaires: CRM.etat.affaires, projets: etat.projets }, ctx());
  return { migrees: plan.migrees, aTraiterAMain: plan.aTraiterAMain };
}

/** Exécute la migration (une seule opération d'audit, donc restaurable d'un coup) ; rend { migrees, aTraiterAMain }. */
export async function migrerEtapesRetirees() {
  const plan = P.planMigrerEtapesRetirees({ affaires: CRM.etat.affaires, projets: etat.projets }, ctx());
  await appliquer(plan, 'migrerEtapesRetirees');
  return { migrees: plan.migrees, aTraiterAMain: plan.aTraiterAMain };
}
