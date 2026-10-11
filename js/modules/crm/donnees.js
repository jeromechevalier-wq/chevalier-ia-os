// Données du CRM (version 2.0) : écouteurs Firestore, écritures, intégrité des liens.
// Un écouteur onSnapshot par collection de listes pour toute la session (personnes, organisations, affaires,
// activités, paramètres) ; notes et événements se chargent à l'ouverture d'une fiche, par une requête sur son lien.
// Aucune requête composite : une seule condition par requête (égalité), le reste est fait dans le navigateur.
import {
  collection, doc, onSnapshot, query, where, orderBy, limit, startAfter, getDoc, getDocs, setDoc, runTransaction, writeBatch, serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db } from '../../os/firebase.js';
import { normaliserBase, cheminCollection } from '../../os/chemins.js';
import * as L from './logique.js';

const PARAMETRES_DEPART = {
  offres: { items: L.OFFRES_DEPART },
  listes: { secteurs: L.SECTEURS_DEPART, sources: L.SOURCES_DEPART },
  etiquettes: { items: L.ETIQUETTES_DEPART },
  filtres: { items: L.FILTRES_DEPART, version: 2 },
  reglages: L.REGLAGES_DEPART,
};

// Les collections du module Projets sont dans la sauvegarde complète (l'export JSON), même si elles ne sont pas des collections du CRM.
export const COLLECTIONS_CRM = [
  'crm_personnes', 'crm_organisations', 'crm_affaires', 'crm_activites', 'crm_notes', 'crm_evenements', 'crm_parametres',
  'projets_projets', 'projets_taches', 'projets_modeles',
];

export const etat = {
  personnes: [],
  organisations: [],
  affaires: [],
  activites: [],
  offres: [],
  secteurs: [],
  sources: [],
  etiquettes: [],
  filtres: [],
  reglages: { ...L.REGLAGES_DEPART },
  pret: { personnes: false, organisations: false, affaires: false, activites: false, parametres: false },
};

let compte = null;
// Chemin de base des données : '' pour le CRM de Jérôme (la racine), clients/<client> chez un client. Donné par la coque à demarrer().
let cheminBase = '';
/** Chemin complet d'une collection du module (préfixe de base compris). */
export const chemin = (nom) => cheminCollection(cheminBase, nom);
let desabonnements = [];
const abonnes = new Set();
let initialisation = false;

export function estPret() {
  return Object.values(etat.pret).every(Boolean);
}

export function surChangement(rappel) {
  abonnes.add(rappel);
  return () => abonnes.delete(rappel);
}

function notifier() {
  abonnes.forEach((f) => { try { f(); } catch (e) { console.warn(e); } });
}

export function cheminDeBase() {
  return cheminBase;
}

export function compteCourant() {
  return compte;
}

/** Contexte des patchs de la logique métier. */
export function ctx() {
  const maintenant = new Date();
  return {
    maintenant,
    auteur: compte?.email || '',
    aujourdhui: L.aujourdhuiParis(maintenant),
    delaiPaiementJours: etat.reglages.delaiPaiementJours,
    nouvelId: (nom) => doc(collection(db, chemin(nom))).id,
  };
}

export const personne = (id) => etat.personnes.find((x) => x.id === id) || null;
export const organisation = (id) => etat.organisations.find((x) => x.id === id) || null;
export const affaire = (id) => etat.affaires.find((x) => x.id === id) || null;

/** Activités rattachées à une personne, une organisation ou une affaire ({ personneId } | { organisationId } | { affaireId }). */
export function activitesDe(lien) {
  const [cle, id] = Object.entries(lien)[0];
  return etat.activites.filter((a) => a[cle] === id);
}

const signatures = {};
const CHAMPS_VOLATILS = new Set(['modifieLe', 'modifiePar', 'creeLe']);

/** Empreinte des données affichables : sans les horodatages serveur qui se précisent après coup. */
function signature(docs) {
  return JSON.stringify(docs, (cle, valeur) => (CHAMPS_VOLATILS.has(cle) ? undefined : valeur));
}

function lireDocs(snap) {
  return snap.docs.map((d) => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id }));
}

export function demarrer(compteConnecte, base = '') {
  compte = compteConnecte;
  cheminBase = normaliserBase(base);
  // Quand seul un horodatage serveur se précise (modifieLe, creeLe), les données affichées ne changent pas :
  // on met l'état à jour sans prévenir les écrans (pas de nouveau rendu, donc pas de glisser déposer interrompu).
  const ecouter = (nom, cle) => desabonnements.push(onSnapshot(collection(db, chemin(nom)), (snap) => {
    const docs = lireDocs(snap);
    const sig = signature(docs);
    const inchange = etat.pret[cle] && signatures[cle] === sig;
    etat[cle] = docs;
    signatures[cle] = sig;
    etat.pret[cle] = true;
    if (!inchange) notifier();
  }, (e) => console.warn(`${nom} indisponible`, e.code)));
  ecouter('crm_personnes', 'personnes');
  ecouter('crm_organisations', 'organisations');
  ecouter('crm_affaires', 'affaires');
  ecouter('crm_activites', 'activites');
  desabonnements.push(onSnapshot(collection(db, chemin('crm_parametres')), (snap) => {
    const docs = Object.fromEntries(snap.docs.map((d) => [d.id, d.data({ serverTimestamps: 'estimate' })]));
    const tri = (items) => [...(items || [])].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0));
    etat.offres = tri(docs.offres?.items);
    etat.secteurs = docs.listes?.secteurs || [];
    etat.sources = docs.listes?.sources || [];
    etat.etiquettes = tri(docs.etiquettes?.items);
    // Les filtres enregistrés de la version 1.0.0 (sans "version: 2") ne servent plus : ignorés.
    etat.filtres = docs.filtres?.version === 2 ? tri(docs.filtres.items) : [];
    etat.reglages = { ...L.REGLAGES_DEPART, ...(docs.reglages || {}) };
    etat.pret.parametres = true;
    // Un lecteur d'un client (compte.ecrit === false, chantier 7) ne crée pas les paramètres de départ : les règles le refuseraient. Le CRM de Jérôme n'a pas ce champ.
    if (!snap.metadata.fromCache && compte?.ecrit !== false) initialiserParametres(docs);
    notifier();
  }, (e) => console.warn('Paramètres indisponibles', e.code)));
}

export function arreter() {
  desabonnements.forEach((f) => f());
  desabonnements = [];
  for (const cle of ['personnes', 'organisations', 'affaires', 'activites']) etat[cle] = [];
  for (const cle of Object.keys(etat.pret)) etat.pret[cle] = false;
  for (const cle of Object.keys(signatures)) delete signatures[cle];
  initialisation = false;
  compte = null;
  cheminBase = '';
}

/** Premier lancement : crée les documents de paramètres manquants (ou périmés) avec les valeurs de départ. */
async function initialiserParametres(existants) {
  const manquants = Object.keys(PARAMETRES_DEPART).filter((id) => {
    if (!existants[id]) return true;
    return id === 'filtres' && existants[id].version !== 2;
  });
  if (!manquants.length || initialisation) return;
  initialisation = true;
  for (const id of manquants) {
    const ref = doc(db, chemin('crm_parametres'), id);
    await runTransaction(db, async (t) => {
      const s = await t.get(ref);
      if (!s.exists() || (id === 'filtres' && s.data().version !== 2)) t.set(ref, PARAMETRES_DEPART[id]);
    }).catch((e) => console.warn('Initialisation des paramètres', e.code));
  }
}

// ---------------------------------------------------------------- outils d'écriture
// Les règles (quoi écrire) sont dans logique.js (plans, partagés avec le serveur MCP) ; ici : exécuter un plan et lire ce qu'il faut.

/** Applique une écriture d'un plan à un lot. `horodater` -> heure du serveur Firebase, `signer` -> compte connecté. */
function ecrireDansLot(lot, e) {
  const ref = doc(db, chemin(e.collection), e.id);
  const marques = {};
  for (const champ of e.horodater || []) marques[champ] = serverTimestamp();
  for (const champ of e.signer || []) marques[champ] = compte?.email || '';
  if (e.type === 'creer') lot.set(ref, { ...e.donnees, ...marques });
  else if (e.type === 'modifier') lot.update(ref, { ...e.patch, ...marques });
  else lot.delete(ref);
}

/** Les documents tels qu'ils sont AVANT une modification ou une suppression (pour la copie de l'audit). */
async function lireAvants(ecritures) {
  const concernees = ecritures.filter((e) => e.type !== 'creer');
  const lus = await Promise.all(concernees.map((e) => getDoc(doc(db, chemin(e.collection), e.id))));
  return Object.fromEntries(concernees.map((e, i) => [`${e.collection}/${e.id}`, lus[i].exists() ? lus[i].data() : null]));
}

// Trois écritures par action élémentaire (la donnée, sa ligne d'audit, sa copie) : 130 actions par lot, la limite de Firestore est 500.
const ACTIONS_PAR_LOT = 130;

/**
 * Exécute les écritures d'un plan. Chaque écriture laisse sa trace dans crm_audit (et sa copie dans crm_audit_avant) DANS LE MÊME LOT
 * que la donnée : jamais de modification sans trace, jamais de trace sans modification (un lot est atomique). `outil` nomme l'action.
 */
export async function executer(ecritures, outil = 'ecran') {
  if (!ecritures.length) return;
  const avants = await lireAvants(ecritures);
  const audit = L.construireAudit(ecritures, avants, {
    acteur: compte?.email || '', outil, operationId: doc(collection(db, chemin('crm_audit'))).id, maintenant: new Date(),
    horodatage: serverTimestamp(), nouvelId: (nom) => doc(collection(db, chemin(nom))).id,
  });
  for (let i = 0; i < ecritures.length; i += ACTIONS_PAR_LOT) {
    const lot = writeBatch(db);
    for (let k = i; k < Math.min(i + ACTIONS_PAR_LOT, ecritures.length); k++) {
      ecrireDansLot(lot, ecritures[k]);
      audit[k].forEach((a) => ecrireDansLot(lot, a));
    }
    await lot.commit();
  }
}

/** Activités, notes et événements qui portent un lien `champ` = id : [{ collection, id, personneId, organisationId, affaireId }]. */
async function liensDe(champ, id) {
  const noms = ['crm_activites', 'crm_notes', 'crm_evenements'];
  const reponses = await Promise.all(noms.map((nom) => getDocs(query(collection(db, chemin(nom)), where(champ, '==', id)))));
  return reponses.flatMap((r, i) => r.docs.map((d) => ({
    collection: noms[i], id: d.id, personneId: d.data().personneId ?? null, organisationId: d.data().organisationId ?? null, affaireId: d.data().affaireId ?? null,
    projetId: d.data().projetId ?? null,
  })));
}

/** Projets liés à une fiche (`champ` = personneId, organisationId ou affaireId) : gardés quand la fiche disparaît, seul leur lien est vidé. */
async function projetsLies(champ, id) {
  const r = await getDocs(query(collection(db, chemin('projets_projets')), where(champ, '==', id)));
  return r.docs.map((d) => ({ id: d.id, affaireId: d.data().affaireId ?? null, personneId: d.data().personneId ?? null, organisationId: d.data().organisationId ?? null }));
}

// ---------------------------------------------------------------- fil d'une fiche (notes et événements)

/**
 * Écoute les notes et les événements liés à une fiche. lien : { personneId } | { organisationId } | { affaireId }.
 * Une seule condition (égalité) par requête ; rappel({ notes, evenements }) à chaque changement.
 */
export function ecouterFil(lien, rappel) {
  const [cle, id] = Object.entries(lien)[0];
  const donnees = { notes: [], evenements: [] };
  const abonner = (nom, champ) => onSnapshot(query(collection(db, chemin(nom)), where(cle, '==', id)), (snap) => {
    donnees[champ] = lireDocs(snap);
    rappel({ ...donnees });
  }, (e) => console.warn(`${nom} indisponible`, e.code));
  const arrets = [abonner('crm_notes', 'notes'), abonner('crm_evenements', 'evenements')];
  return () => arrets.forEach((f) => f());
}

// ---------------------------------------------------------------- personnes

export async function creerPersonne(valeurs) {
  const plan = L.planCreerPersonne(valeurs, ctx());
  await executer(plan.ecritures, 'creerPersonne');
  return plan.id;
}

export async function majPersonne(id, patch) {
  await executer(L.planMajPersonne(id, patch).ecritures, 'majPersonne');
}

/** Change l'organisation d'une personne ; ses affaires gardent leur propre organisation. */
export async function lierPersonneOrganisation(personneId, organisationId) {
  await majPersonne(personneId, { organisationId: organisationId || null });
}

export async function emailEnvoye(personneId) {
  const p = personne(personneId);
  if (!p) return;
  await executer(L.planEmailEnvoye(p, ctx()).ecritures, 'emailEnvoye');
}

export async function marquerOppositionPersonne(personneId, coche) {
  const p = personne(personneId) || { id: personneId, organisationId: null };
  await executer(L.planOppositionPersonne(p, coche, ctx()).ecritures, 'marquerOppositionPersonne');
}

/**
 * Supprime définitivement une personne. choix : "affaires" (supprime aussi ses affaires) ou "conserver"
 * (ses affaires restent, rattachées à leur organisation seule). Ses activités, notes et événements suivent.
 */
export async function supprimerPersonne(id, choix) {
  const liens = await liensDe('personneId', id);
  const projets = await projetsLies('personneId', id);
  if (choix === 'affaires') {
    for (const a of etat.affaires.filter((x) => x.personneId === id)) {
      liens.push(...await liensDe('affaireId', a.id));
      projets.push(...await projetsLies('affaireId', a.id));
    }
  }
  await executer(L.planSupprimerPersonne({ personneId: id, choix, affaires: etat.affaires, liens, projets }).ecritures, 'supprimerPersonne');
}

// ---------------------------------------------------------------- organisations

export async function creerOrganisation(valeurs) {
  const plan = L.planCreerOrganisation(valeurs, ctx());
  await executer(plan.ecritures, 'creerOrganisation');
  return plan.id;
}

export async function majOrganisation(id, patch) {
  await executer(L.planMajOrganisation(id, patch).ecritures, 'majOrganisation');
}

/** Refus (Error) tant que l'organisation a des personnes ou des affaires. */
export async function supprimerOrganisation(id) {
  const plan = L.planSupprimerOrganisation({
    organisationId: id, personnes: etat.personnes, affaires: etat.affaires, liens: await liensDe('organisationId', id), projets: await projetsLies('organisationId', id),
  });
  if (plan.refus) throw new Error(plan.refus);
  await executer(plan.ecritures, 'supprimerOrganisation');
}

// ---------------------------------------------------------------- affaires

export async function creerAffaire(valeurs) {
  const plan = L.planCreerAffaire(valeurs, { personnes: etat.personnes, organisations: etat.organisations }, ctx());
  await executer(plan.ecritures, 'creerAffaire');
  return plan.id;
}

export async function majAffaire(id, patch) {
  await executer(L.planMajAffaire(id, patch).ecritures, 'majAffaire');
}

async function appliquer(plan, outil) {
  await executer(plan.ecritures, outil);
  return plan;
}

// Le changement d'étape et la perte d'une affaire sont dans projets/donnees.js (`changerEtapeAffaire`, `marquerAffairePerdue`) : ils créent aussi le
// projet d'extraction de valeur, avec la même règle pour l'écran et le serveur MCP.

export async function mettreAffaireEnPause(id, saisie) {
  return appliquer(L.planMettreEnPause(affaire(id), saisie, ctx()), 'mettreAffaireEnPause');
}

export async function rouvrir(id) {
  return appliquer(L.planRouvrirAffaire(affaire(id), ctx()), 'rouvrir');
}


export async function archiverAffaire(id, archive = true) {
  await majAffaire(id, { archive });
}

export async function supprimerAffaire(id) {
  await executer(L.planSupprimerAffaire({ affaireId: id, liens: await liensDe('affaireId', id), projets: await projetsLies('affaireId', id) }).ecritures, 'supprimerAffaire');
}

// ---------------------------------------------------------------- activités

export async function creerActivite(valeurs) {
  const plan = L.planCreerActivite(valeurs, ctx());
  await executer(plan.ecritures, 'creerActivite');
  return plan.id;
}

export async function marquerActiviteFaite(id) {
  const a = etat.activites.find((x) => x.id === id);
  if (!a) return null;
  await executer(L.planActiviteFaite(a, ctx()).ecritures, 'marquerActiviteFaite');
  return a;
}

export async function majActivite(id, patch) {
  await executer(L.planMajActivite(id, patch).ecritures, 'majActivite');
}

export async function supprimerActivite(id) {
  await executer(L.planSupprimerActivite(id).ecritures, 'supprimerActivite');
}

// ---------------------------------------------------------------- notes

export async function creerNote(texte, liens) {
  const plan = L.planCreerNote(texte, liens, ctx());
  await executer(plan.ecritures, 'creerNote');
  return plan.id;
}

export async function majNote(id, texte) {
  await executer(L.planMajNote(id, texte).ecritures, 'majNote');
}

export async function supprimerNote(id) {
  await executer(L.planSupprimerNote(id).ecritures, 'supprimerNote');
}

// ---------------------------------------------------------------- paramètres

export async function majParametre(id, donnees) {
  await setDoc(doc(db, chemin('crm_parametres'), id), donnees, { merge: true });
}

export async function enregistrerOffres(items) {
  await majParametre('offres', { items: items.map((o, i) => ({ ...o, ordre: i + 1 })) });
}

export async function enregistrerListes(listes) {
  await majParametre('listes', { secteurs: etat.secteurs, sources: etat.sources, ...listes });
}

/** Ajoute une valeur à la liste des secteurs ou des sources (création à la volée depuis un champ intelligent). */
export async function ajouterValeurListe(nomListe, valeur) {
  const v = L.nettoyerEspaces(valeur);
  const existante = etat[nomListe] || [];
  if (!v || existante.some((x) => L.normaliserNom(x) === L.normaliserNom(v))) return v;
  await enregistrerListes({ [nomListe]: [...existante, v] });
  return v;
}

export async function enregistrerEtiquettes(items) {
  await majParametre('etiquettes', { items: items.map((e, i) => ({ ...e, ordre: i + 1 })) });
}

const COULEURS_ETIQUETTES = ['#b98ee0', '#fd6455', '#ecbc06', '#3fbf7f', '#8a9bb4', '#e3cdee'];

/** Crée une étiquette à la volée ; renvoie son identifiant. */
export async function creerEtiquette(nom) {
  const n = L.nettoyerEspaces(nom);
  const existante = etat.etiquettes.find((e) => L.normaliserNom(e.nom) === L.normaliserNom(n));
  if (existante) return existante.id;
  const base = L.normaliser(n).replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'etiquette';
  let id = base;
  for (let i = 2; etat.etiquettes.some((e) => e.id === id); i++) id = `${base}_${i}`;
  await enregistrerEtiquettes([...etat.etiquettes, { id, nom: n, couleur: COULEURS_ETIQUETTES[etat.etiquettes.length % COULEURS_ETIQUETTES.length] }]);
  return id;
}

export async function enregistrerFiltres(items) {
  await majParametre('filtres', { items, version: 2 });
}

export async function enregistrerReglages(patch) {
  await majParametre('reglages', patch);
}

export async function noterExportComplet() {
  await majParametre('reglages', { dernierExport: serverTimestamp() });
}

/** Lit toutes les collections du CRM (sauvegarde complète) : { nom: [documents avec id] }. */
export async function toutesLesCollections() {
  const sortie = {};
  for (const nom of COLLECTIONS_CRM) {
    const snap = await getDocs(collection(db, chemin(nom)));
    sortie[nom] = snap.docs.map((d) => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id }));
  }
  return sortie;
}

// ---------------------------------------------------------------- journal (lecture seule)

/** Les `taille` lignes du journal les plus récentes (après le curseur `apres` pour la page suivante) : { lignes, curseur, fini }. */
export async function lireJournal({ taille = 200, apres = null } = {}) {
  const contraintes = [orderBy('date', 'desc'), ...(apres ? [startAfter(apres)] : []), limit(taille)];
  const snap = await getDocs(query(collection(db, chemin('crm_audit')), ...contraintes));
  return {
    lignes: snap.docs.map((d) => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id })),
    curseur: snap.docs.at(-1) ?? null,
    fini: snap.docs.length < taille,
  };
}

/** Copie « avant / après » d'une ligne du journal (même identifiant que la ligne) : { avant, apres } ou null si elle a expiré (90 jours). */
export async function lireCopieJournal(idLigne) {
  const d = await getDoc(doc(db, chemin('crm_audit_avant'), idLigne));
  if (!d.exists()) return null;
  const { avant = null, apres = null } = d.data({ serverTimestamps: 'estimate' });
  return { avant, apres };
}
