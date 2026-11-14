// Données du module Rendez-vous : lecture en temps réel de rdv_rendezvous, rdv_participants, rdv_messages et rdv_parametres (document `reglages`).
// Écritures par `executer` (journal commun), jamais de setDoc direct. Aucun orderBy, aucun limit : le tri se fait dans le navigateur (règle D4).
// Les participants sont des fiches Personnes du socle (lues et créées par js/modules/crm/donnees.js, démarré par la coque avec ou sans Affaires).
import { collection, getDocs, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db } from '../../os/firebase.js';
import { cheminCollection } from '../../os/chemins.js';
import { executer } from '../../os/journal-donnees.js';
import { avecModeTest } from '../../os/mode-test.js';
import * as CRM from '../crm/donnees.js';
import * as L from '../crm/logique.js';
import * as R from './logique.js';

export const COLLECTIONS = ['rdv_rendezvous', 'rdv_participants', 'rdv_messages', 'rdv_parametres'];
export const DOC_REGLAGES = 'reglages';

const vierge = () => ({ rendezVous: [], participants: [], messages: [], parametresDoc: null, pret: false });
export const etat = vierge();
let desabonnements = [];
let base = '';
const abonnes = new Set();
const prets = { rendezVous: false, participants: false, messages: false, parametres: false };

export const chemin = (nom) => cheminCollection(base, nom);
export const rendezVous = (id) => etat.rendezVous.find((r) => r.id === id) || null;
export const participantsDe = (rdvId) => etat.participants.filter((p) => p.rendezVousId === rdvId);
export const messagesDe = (rdvId) => etat.messages.filter((m) => m.rendezVousId === rdvId);
/** Réglages lus (valeurs par défaut pour tout ce qui manque). */
export const parametres = () => ({ ...R.PARAMETRES_DEFAUT, ...(etat.parametresDoc || {}) });
export const estPret = () => etat.pret;

export function surChangement(rappel) {
  abonnes.add(rappel);
  return () => abonnes.delete(rappel);
}
const notifier = () => abonnes.forEach((f) => { try { f(); } catch (e) { console.warn(e); } });
const verifierPret = () => { etat.pret = Object.values(prets).every(Boolean); };

function suivre(nom, cle) {
  desabonnements.push(onSnapshot(collection(db, chemin(nom)), (snap) => {
    if (cle === 'parametres') {
      const d = snap.docs.find((x) => x.id === DOC_REGLAGES);
      etat.parametresDoc = d ? d.data({ serverTimestamps: 'estimate' }) : null;
    } else {
      etat[cle] = snap.docs.map((d) => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id }));
    }
    prets[cle] = true; verifierPret(); notifier();
  }, (e) => {
    // Table absente ou illisible : l'écran affiche « vide » (la table n'existe qu'à la première écriture).
    console.warn(`${nom} indisponible`, e.code);
    prets[cle] = true; verifierPret(); notifier();
  }));
}

/** Chez Jérôme, cheminBase est '' (racine de la base 1) ; chez un client, clients/<client>. */
export function demarrer(_compte, cheminBase = '') {
  base = cheminBase;
  suivre('rdv_rendezvous', 'rendezVous');
  suivre('rdv_participants', 'participants');
  suivre('rdv_messages', 'messages');
  suivre('rdv_parametres', 'parametres');
}

export function arreter() {
  desabonnements.forEach((f) => f());
  desabonnements = [];
  Object.assign(etat, vierge());
  Object.assign(prets, { rendezVous: false, participants: false, messages: false, parametres: false });
  base = '';
}

/** Les données du module pour l'export : une entrée par table, lues au chemin du module. Lecture seule. */
export async function lireToutPourExport() {
  const sortie = {};
  for (const nom of COLLECTIONS) {
    const snap = await getDocs(collection(db, chemin(nom)));
    sortie[nom] = snap.docs.map((d) => ({ ...d.data({ serverTimestamps: 'estimate' }), id: d.id }));
  }
  return sortie;
}

// ---------------------------------------------------------------- écritures

const MARQUES = L.MARQUES_CREATION;
// Même adresse à la casse, aux accents et aux retours à la ligne près = un doublon (même règle que les fiches).
const cleAdresse = (a) => L.nettoyerEspaces(a).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

/**
 * Crée un rendez-vous avec ses participants, en UN seul lot (le journal garde chaque écriture) :
 *  - une fiche Personne est créée pour chaque participant qui n'en a pas (téléphone sur la fiche) ;
 *  - l'adresse du rendez-vous est proposée sur la fiche de la première personne de la liste (libellé « Chantier »), sans doublon exact.
 * `participants` : [{ personneId?, nom, telephone (+33…), role }] déjà validés (R.validerNouveauRdv). Renvoie l'identifiant du rendez-vous.
 * `envoyer` reste faux tant que l'envoi des SMS n'est pas branché (PR 4) : le rendez-vous est alors enregistré sans partir.
 */
export async function creerRendezVous({ objet = '', adresse = '', creneaux, participants, ajouterAdresseFiche = true }) {
  const ctx = CRM.ctx();
  const ecritures = [];
  const lignes = [];
  for (const x of participants) {
    let personneId = x.personneId || null;
    const personne = personneId ? CRM.personne(personneId) : null;
    const affichage = R.afficherTelephone(x.telephone);
    if (!personneId) {
      const plan = L.planCreerPersonne(L.heriterTest(avecModeTest({ nom: x.nom, telephones: [{ valeur: affichage, type: 'perso' }] }), {}), ctx);
      ecritures.push(...plan.ecritures);
      personneId = plan.id;
    } else if (personne && !(personne.telephones || []).some((t) => R.normaliserTelephone(t.valeur).telephone === x.telephone)) {
      ecritures.push(...L.planMajPersonne(personneId, { telephones: L.sansDoublonsContacts('telephones', [...(personne.telephones || []), { valeur: affichage, type: 'perso' }]) }).ecritures);
    }
    lignes.push({ ...x, personneId, nom: x.nom || personne?.nom || '' });
  }
  // Adresse sur la fiche de la première personne de la liste (déjà existante seulement : une fiche créée à l'instant la reçoit à la création).
  const adresseNette = L.nettoyerAdresse(adresse);
  if (ajouterAdresseFiche && adresseNette && lignes[0]) {
    const premiere = CRM.personne(lignes[0].personneId);
    const existantes = premiere ? L.adressesDe(premiere) : [];
    if (premiere && !existantes.some((a) => cleAdresse(a.adresse) === cleAdresse(adresseNette))) {
      const r = L.patchAdresses([...existantes, { id: L.nouvelIdAdresse(), libelle: 'Chantier', adresse: adresseNette, parDefaut: !existantes.length }]);
      if (!r.erreur) ecritures.push(...L.planMajPersonne(premiere.id, r.patch).ecritures);
    }
  }
  const id = ctx.nouvelId('rdv_rendezvous');
  ecritures.push(L.ecritureCreer('rdv_rendezvous', id, avecModeTest({
    client: R.clientDe(lignes), objet: L.nettoyerEspaces(objet), adresse: adresseNette, commune: R.communeDe(adresseNette),
    creneaux: creneaux.map((c) => R.versISO(R.enMs(c))), etat: 'en_attente', creneauChoisi: null, archive: false, tour: 1,
    relancesFaites: 0, envoiDemandeLe: null, confirmeLe: null, annule: false,
  }), MARQUES));
  for (const x of lignes) {
    ecritures.push(L.ecritureCreer('rdv_participants', ctx.nouvelId('rdv_participants'), {
      rendezVousId: id, personneId: x.personneId, nom: x.nom, role: x.role || '', telephone: x.telephone,
      reponse: '', etatReponse: 'attente', creneauxOk: [],
    }, MARQUES));
  }
  await executer(ecritures, 'creerRendezVous');
  return id;
}

export async function archiver(id, archive = true) {
  await executer([L.ecritureModifier('rdv_rendezvous', id, { archive: !!archive }, L.MARQUES_MODIFICATION)], archive ? 'archiverRendezVous' : 'desarchiverRendezVous');
}

/**
 * Enregistre des réglages (clés de premier niveau : relances, rappel, plage, numerosAlerte, numeroAffiche, nomDansLesSms, roles, modeles).
 * Le document existe-t-il ? Oui : on change seulement ces clés. Non : on le crée avec les valeurs par défaut en dessous.
 */
export async function majParametres(patch) {
  const e = etat.parametresDoc
    ? L.ecritureModifier('rdv_parametres', DOC_REGLAGES, patch, L.MARQUES_MODIFICATION)
    : L.ecritureCreer('rdv_parametres', DOC_REGLAGES, { ...R.PARAMETRES_DEFAUT, ...patch }, MARQUES);
  await executer([e], 'majParametresRendezVous');
}
