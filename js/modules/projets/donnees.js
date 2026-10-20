// Données du module Projets (version 2.1) : un écouteur Firestore sur les projets et un sur les tâches pour toute la session, écritures par plans.
// Les règles (quoi écrire) sont dans logique.js ; ici : lire ce qu'il faut et exécuter le plan avec le même audit que le CRM
// (`executer` de crm/donnees.js : chaque écriture laisse sa trace dans le même lot que la donnée).
// Le module lit le CRM (personnes, organisations, affaires) par crm/donnees.js ; il n'y écrit qu'à la suppression d'un projet
// (le lien `projetId` de l'affaire est vidé, voir planSupprimerProjet).
import { collection, doc, onSnapshot, query, where, getDoc, getDocs, writeBatch, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db } from '../../os/firebase.js';
import * as CRM from '../crm/donnees.js';
import * as CL from '../crm/logique.js';
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
// Même chemin de base que le CRM (un seul espace de données par session) : racine pour Jérôme, clients/<client> chez un client.
const chemin = CRM.chemin;
export const projet = (id) => etat.projets.find((p) => p.id === id) || null;
export const modele = (id) => etat.modeles.find((m) => m.id === id) || null;
export const tache = (id) => etat.taches.find((t) => t.id === id) || null;
/** Les tâches d'un projet, par phase puis par ordre. */
export const tachesDe = (projetId) => P.tachesDuProjet(etat.taches, projetId, CRM.etat.config);

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

export function demarrer(base = '') {
  // Le CRM démarre d'abord (ordre de MODULES) et fixe le chemin ; on refuse un désaccord plutôt que d'écrire à deux endroits.
  if (base !== CRM.cheminDeBase()) throw new Error('Le module Projets doit utiliser le même chemin de base que les affaires');
  // Un écouteur par collection pour toute la session (comme les activités du CRM) : les tâches servent à l'avancement, au retard et à l'Accueil.
  desabonnements.push(onSnapshot(collection(db, chemin('projets_projets')), (snap) => {
    const docs = snap.docs.map((d) => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id }));
    const sig = empreinte(docs);
    const inchange = etat.pret && sig === signature;
    etat.projets = docs;
    signature = sig;
    etat.pret = true;
    if (!inchange) notifier();
  }, (e) => console.warn('projets_projets indisponible', e.code)));
  desabonnements.push(onSnapshot(collection(db, chemin('projets_taches')), (snap) => {
    const docs = snap.docs.map((d) => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id }));
    const sig = empreinte(docs);
    const inchange = etat.tachesPretes && sig === signatureTaches;
    etat.taches = docs;
    signatureTaches = sig;
    etat.tachesPretes = true;
    if (!inchange) notifier();
  }, (e) => console.warn('projets_taches indisponible', e.code)));
  desabonnements.push(onSnapshot(collection(db, chemin('projets_modeles')), (snap) => {
    const docs = snap.docs.map((d) => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id }));
    const sig = empreinte(docs);
    const inchange = etat.modelesPrets && sig === signatureModeles;
    etat.modeles = docs;
    signatureModeles = sig;
    etat.modelesPrets = true;
    if (!inchange) notifier();
    if (!snap.metadata.fromCache && snap.empty && CRM.compteCourant()?.ecrit !== false) initialiserModeles(); // pas pour un lecteur d'un client (chantier 7)
  }, (e) => console.warn('projets_modeles indisponible', e.code)));
}

/**
 * Premier lancement : crée les modèles de départ (Audit, Accompagnement) et un repère dans crm_parametres, dans un seul lot, sans
 * ligne de journal (comme les paramètres de départ du CRM : ce n'est pas une action de Jérôme). Le repère évite de les recréer si Jérôme les
 * supprime tous un jour ; les identifiants sont fixes, donc deux onglets qui démarrent ensemble n'en font jamais six.
 */
async function initialiserModeles() {
  if (initialisationModeles) return;
  initialisationModeles = true;
  try {
    // Tout premier lancement : le CRM écrit ses propres paramètres de départ au même moment (dans la même collection) ; on attend qu'il ait fini
    // (le dernier créé est « reglages ») pour ne pas écrire en même temps que lui. Ensuite (usage normal), ce document existe déjà : aucune attente.
    for (let i = 0; i < 30 && !(await getDoc(doc(db, chemin('crm_parametres'), 'reglages'))).exists(); i++) await new Promise((r) => setTimeout(r, 400));
    if ((await getDoc(doc(db, chemin('crm_parametres'), 'modeles_projet'))).exists()) return;
    const email = CRM.compteCourant()?.email || '';
    const lot = writeBatch(db);
    for (const e of P.planInitialiserModeles({ racine: CRM.cheminDeBase() === '' }).ecritures) {
      lot.set(doc(db, chemin(e.collection), e.id), { ...e.donnees, creeLe: serverTimestamp(), modifieLe: serverTimestamp(), creePar: email, modifiePar: email });
    }
    lot.set(doc(db, chemin('crm_parametres'), 'modeles_projet'), { depart: true });
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
  await appliquer(P.planMajProjet(id, patch, { avant: projet(id), ctx: ctx() }), 'majProjet');
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
/** `impaye` : { raison } pour clôturer malgré des factures non payées (elles passent à « Abandonnée »). Sans lui, une facture à payer bloque : le plan rend `erreurs.factures`. */
export const terminer = (id, { impaye = null } = {}) => regle(id, (p) => P.planTerminerProjet(p, ctx(), impaye ? { impaye } : {}), 'terminerProjet');
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
  const reponses = await Promise.all(noms.map((nom) => getDocs(query(collection(db, chemin(nom)), where('projetId', '==', id)))));
  return reponses.flatMap((r, i) => r.docs.map((d) => ({ collection: noms[i], id: d.id, projetId: id })));
}

/** Suppression définitive : le projet, ses tâches et son fil ; l'affaire est détachée. */
export async function supprimerProjet(id) {
  const p = projet(id);
  if (!p) throw new Error('Projet introuvable');
  const [liens, taches] = await Promise.all([
    liensDuProjet(id),
    getDocs(query(collection(db, chemin('projets_taches')), where('projetId', '==', id))),
  ]);
  const plan = P.planSupprimerProjet({
    projet: p,
    liens,
    taches: taches.docs.map((d) => ({ id: d.id, projetId: id })),
    affaire: p.affaireId ? CRM.affaire(p.affaireId) : null,
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
  const plan = P.planCreerProjetDepuisAffaire({ affaire: affaireOuErreur(affaireId), projets: etat.projets, valeurs, modele: modeleId ? modele(modeleId) : null }, ctx());
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

export const majTache = (id, patch) => appliquerTache(P.planMajTache({ tache: tacheOuErreur(id), patch, taches: etat.taches, config: CRM.etat.config }), 'majTache');
export const faireTache = (id) => appliquerTache(P.planTacheFaite({ tache: tacheOuErreur(id), projet: projet(tacheOuErreur(id).projetId) }, ctx()), 'faireTache');
export const defaireTache = (id) => appliquerTache(P.planTacheNonFaite({ tache: tacheOuErreur(id) }), 'defaireTache');
/** « Annuler » après une suppression confirmée : le modèle, ses tâches types ou les factures reviennent tels qu'ils étaient. */
export const restaurerModele = (m) => appliquer(CL.planRestaurerDocument(CL.COLLECTIONS_PLAN.projetsModeles, m), 'restaurerModele');
export const restaurerTachesModele = (id, taches) => appliquer({ ecritures: [CL.ecritureModifier(CL.COLLECTIONS_PLAN.projetsModeles, id, { taches })] }, 'restaurerTachesModele');
export const restaurerFactures = (projetId, factures) => appliquer({ ecritures: [CL.ecritureModifier(CL.COLLECTIONS_PLAN.projets, projetId, { factures })] }, 'restaurerFactures');
export const restaurerTache = (t) => appliquer(CL.planRestaurerDocument(CL.COLLECTIONS_PLAN.projetsTaches, t), 'restaurerTache');
export const supprimerTache = (id) => appliquer(P.planSupprimerTache(id), 'supprimerTache');
/** `sens` : -1 pour monter, +1 pour descendre dans la phase. */
export const deplacerTache = (id, sens) => appliquer(P.planDeplacerTache({ tache: tacheOuErreur(id), taches: etat.taches, sens, config: CRM.etat.config }), 'deplacerTache');

// ---------------------------------------------------------------- modèles

export async function creerModele(valeurs) {
  const plan = await appliquerTache(P.planCreerModele({ valeurs, modeles: etat.modeles }, ctx()), 'creerModele');
  return plan.id;
}

const modeleOuErreur = (id) => modele(id) ?? (() => { throw new Error('Modèle introuvable'); })();

export const majModele = (id, patch) => appliquerTache(P.planMajModele({ modele: modeleOuErreur(id), patch }), 'majModele');
export const supprimerModele = (id) => appliquer(P.planSupprimerModele(id), 'supprimerModele');
export const ajouterTacheModele = (id, valeurs) => appliquerTache(P.planAjouterTacheModele({ modele: modeleOuErreur(id), valeurs }, ctx()), 'ajouterTacheModele');
export const majTacheModele = (id, tacheId, patch) => appliquerTache(P.planMajTacheModele({ modele: modeleOuErreur(id), tacheId, patch, config: CRM.etat.config }), 'majTacheModele');
export const supprimerTacheModele = (id, tacheId) => appliquer(P.planSupprimerTacheModele({ modele: modeleOuErreur(id), tacheId }), 'supprimerTacheModele');
export const deplacerTacheModele = (id, tacheId, sens) => appliquer(P.planDeplacerTacheModele({ modele: modeleOuErreur(id), tacheId, sens, config: CRM.etat.config }), 'deplacerTacheModele');
