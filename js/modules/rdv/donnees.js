// Données du module Rendez-vous : lecture en temps réel de rdv_rendezvous, rdv_participants, rdv_messages et rdv_parametres (document `reglages`).
// Écritures par `executer` (journal commun), jamais de setDoc direct. Aucun orderBy, aucun limit : le tri se fait dans le navigateur (règle D4).
// Les participants sont des fiches Personnes du socle (lues et créées par js/modules/crm/donnees.js, démarré par la coque avec ou sans Affaires).
import { collection, doc, getDoc, getDocs, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js';
import { db, app } from '../../os/firebase.js';
import { cheminCollection } from '../../os/chemins.js';
import { executer } from '../../os/journal-donnees.js';
import { avecModeTest } from '../../os/mode-test.js';
import * as CRM from '../crm/donnees.js';
import * as L from '../crm/logique.js';
import * as R from './logique.js';

export const COLLECTIONS = ['rdv_rendezvous', 'rdv_participants', 'rdv_messages', 'rdv_parametres'];
export const DOC_REGLAGES = 'reglages';

const vierge = () => ({ rendezVous: [], participants: [], messages: [], parametresDoc: null, parametresLus: false, pret: false });
export const etat = vierge();
let desabonnements = [];
let base = '';
const abonnes = new Set();
const prets = { rendezVous: false, participants: false, messages: false, parametres: false };

export const chemin = (nom) => cheminCollection(base, nom);
/** Identifiant du client dont on lit les données (« clients/<client> »), vide chez Jérôme : sert à montrer la vraie adresse d'un rendez-vous dans l'aperçu des alertes. */
export const clientCourant = () => /^clients\/([^/]+)/.exec(base)?.[1] ?? '';
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
      etat.parametresLus = true; // lus avec succès : seulement alors on peut écrire un réglage (voir majParametres)
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
  oublierEtatEnvoi();
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

export const MESSAGE_LECTURE = 'Ton compte est en lecture seule : tu ne peux pas modifier les rendez-vous.';
/** Un lecteur d'un client ne modifie rien : message clair plutôt qu'un refus technique (l'erreur porte `lecture: true`). */
function exigerEcriture() {
  if (CRM.compteCourant()?.ecrit === false) { const e = new Error(MESSAGE_LECTURE); e.lecture = true; throw e; }
}
/** Ce compte peut-il écrire ? (faux pour un lecteur d'un client : les boutons qui écrivent sont alors cachés). */
export const peutEcrire = () => CRM.compteCourant()?.ecrit !== false;
/** Erreur « métier » dont le message est écrit pour être lu tel quel (jamais un message technique de Firebase). */
export class ErreurRdv extends Error {
  constructor(message) { super(message); this.name = 'ErreurRdv'; this.lisible = true; }
}
/** Message à montrer pour une erreur d'écriture : la phrase du lecteur ou de la règle métier, sinon `parDefaut` (jamais un message technique). */
export const messageErreur = (e, parDefaut) => (e?.lecture || e?.lisible ? e.message : parDefaut);

/**
 * Crée un rendez-vous avec ses participants, en UN seul lot (le journal garde chaque écriture) :
 *  - une fiche Personne est créée pour chaque participant qui n'en a pas (téléphone sur la fiche) ;
 *  - l'adresse du rendez-vous est proposée sur la fiche de la première personne de la liste (libellé « Chantier »), sans doublon exact ;
 *  - une fiche existante change UNE seule fois dans le lot (téléphone et adresse dans le même patch : la copie « avant » du journal reste juste).
 * `participants` : [{ personneId?, nom, telephone (+33…), role }] déjà validés (R.validerNouveauRdv). Renvoie l'identifiant du rendez-vous.
 * Le rendez-vous et ses participants portent le repère « test » si le mode test est allumé ou si la première personne est une fiche de test.
 */
export async function creerRendezVous({ objet = '', adresse = '', creneaux, participants, ajouterAdresseFiche = true }) {
  exigerEcriture();
  const ctx = CRM.ctx();
  const ecritures = [];
  const patchs = new Map(); // personneId -> patch unique
  const ajouterPatch = (id, patch) => patchs.set(id, { ...(patchs.get(id) || {}), ...patch });
  const adresseNette = L.nettoyerAdresse(adresse);
  const lignes = [];
  for (const [i, x] of participants.entries()) {
    let personneId = x.personneId || null;
    const personne = personneId ? CRM.personne(personneId) : null;
    const affichage = R.afficherTelephone(x.telephone);
    const avecAdresse = ajouterAdresseFiche && adresseNette && i === 0;
    if (!personneId) {
      const valeurs = { nom: x.nom, telephones: [{ valeur: affichage, type: 'perso' }], ...(avecAdresse ? { adresses: [{ libelle: 'Chantier', adresse: adresseNette, parDefaut: true }] } : {}) };
      const plan = L.planCreerPersonne(L.heriterTest(avecModeTest(valeurs), {}), ctx);
      ecritures.push(...plan.ecritures);
      personneId = plan.id;
    } else if (personne) {
      if (!(personne.telephones || []).some((t) => R.normaliserTelephone(t.valeur).telephone === x.telephone)) {
        ajouterPatch(personneId, { telephones: L.sansDoublonsContacts('telephones', [...(personne.telephones || []), { valeur: affichage, type: 'perso' }]) });
      }
      if (avecAdresse) {
        const existantes = L.adressesDe(personne);
        if (!existantes.some((a) => cleAdresse(a.adresse) === cleAdresse(adresseNette))) {
          const r = L.patchAdresses([...existantes, { id: L.nouvelIdAdresse(), libelle: 'Chantier', adresse: adresseNette, parDefaut: !existantes.length }]);
          if (!r.erreur) ajouterPatch(personneId, r.patch);
        }
      }
    }
    lignes.push({ ...x, personneId, nom: x.nom || personne?.nom || '' });
  }
  for (const [id, patch] of patchs) ecritures.push(...L.planMajPersonne(id, patch).ecritures);
  const parents = { personne: lignes[0] ? CRM.personne(lignes[0].personneId) : null };
  const id = ctx.nouvelId('rdv_rendezvous');
  const repere = L.heriterTest(avecModeTest({}), parents).test === true ? { test: true } : {};
  ecritures.push(L.ecritureCreer('rdv_rendezvous', id, {
    client: R.clientDe(lignes), objet: L.nettoyerEspaces(objet), adresse: adresseNette, commune: R.communeDe(adresseNette),
    creneaux: creneaux.map((c) => R.versISO(R.enMs(c))), etat: 'en_attente', creneauChoisi: null, archive: false, tour: 1,
    relancesFaites: 0, envoiDemandeLe: null, confirmeLe: null, annule: false, ...repere,
  }, MARQUES));
  for (const x of lignes) {
    ecritures.push(L.ecritureCreer('rdv_participants', ctx.nouvelId('rdv_participants'), {
      rendezVousId: id, personneId: x.personneId, nom: x.nom, role: x.role || '', telephone: x.telephone,
      reponse: '', etatReponse: 'attente', creneauxOk: [], ...repere,
    }, MARQUES));
  }
  await executer(ecritures, 'creerRendezVous');
  return id;
}

export async function archiver(id, archive = true) {
  exigerEcriture();
  await executer([L.ecritureModifier('rdv_rendezvous', id, { archive: !!archive }, L.MARQUES_MODIFICATION)], archive ? 'archiverRendezVous' : 'desarchiverRendezVous');
}

/**
 * Enregistre des réglages (clés de premier niveau : relances, rappel, plage, numerosAlerte, numeroAffiche, nomDansLesSms, roles, modeles, prixSms, tarifsAu).
 * Refus tant que les réglages n'ont pas été lus avec succès (sinon on écraserait ce qui existe avec les valeurs par défaut).
 * Le document est relu à l'instant de l'écriture : présent -> on change seulement ces clés ; absent -> on le crée avec les valeurs par défaut en dessous.
 */
export async function majParametres(patch) {
  exigerEcriture();
  if (!etat.parametresLus) throw new ErreurRdv('Les réglages ne sont pas encore chargés : réessaie dans un instant.');
  const existe = (await getDoc(doc(db, chemin('rdv_parametres'), DOC_REGLAGES))).exists();
  const e = existe
    ? L.ecritureModifier('rdv_parametres', DOC_REGLAGES, patch, L.MARQUES_MODIFICATION)
    : L.ecritureCreer('rdv_parametres', DOC_REGLAGES, { ...R.PARAMETRES_DEFAUT, ...patch }, MARQUES);
  await executer([e], 'majParametresRendezVous');
}

// ---------------------------------------------------------------- fiche d'un rendez-vous

const MARQUES_MAJ = L.MARQUES_MODIFICATION;

/**
 * La professionnelle saisit ou corrige la réponse d'un participant à sa place (consigne 13) : la réponse exacte reçue est gardée telle quelle.
 * Seulement sur un rendez-vous ouvert. L'état du rendez-vous (à valider, à reprendre…) est recalculé et écrit dans le même lot.
 */
export async function saisirReponseParticipant(participantId, creneauxOk) {
  exigerEcriture();
  const p = etat.participants.find((x) => x.id === participantId);
  if (!p) throw new ErreurRdv('Ce participant n’existe plus.');
  const rdv = rendezVous(p.rendezVousId);
  if (!R.estOuvert(rdv)) throw new ErreurRdv('Ce rendez-vous n’est plus ouvert : on ne peut plus saisir de réponse.');
  const patch = { ...R.saisirReponse(p, creneauxOk, (rdv.creneaux || []).length || R.MAX_CRENEAUX), reponseLe: R.versISO(Date.now()) };
  const apres = participantsDe(rdv.id).map((x) => (x.id === participantId ? { ...x, ...patch } : x));
  const etatCalcule = R.etatCalcule(rdv, apres);
  const ecritures = [L.ecritureModifier('rdv_participants', participantId, patch, MARQUES_MAJ)];
  if (etatCalcule !== (rdv.etat || 'en_attente')) ecritures.push(L.ecritureModifier('rdv_rendezvous', rdv.id, { etat: etatCalcule }, MARQUES_MAJ));
  await executer(ecritures, 'saisirReponseRendezVous');
}

/** Confirme le créneau `numero` (1 à 3) : seule la professionnelle le fait. Le SMS de confirmation est tiré par le serveur (PR 4). Lève une erreur au message lisible si refusé. */
export async function confirmerCreneau(rdvId, numero, maintenant = new Date()) {
  exigerEcriture();
  const plan = R.planConfirmer(rendezVous(rdvId), numero, maintenant);
  if (plan.erreur) throw new ErreurRdv(plan.erreur);
  await executer([L.ecritureModifier('rdv_rendezvous', rdvId, plan.patch, MARQUES_MAJ)], 'confirmerRendezVous');
}

/** Nouvelle série de créneaux : le rendez-vous et ses participants repartent à zéro, l'historique des SMS est gardé, en UN seul lot. */
export async function nouvelleSerie(rdvId, creneaux, maintenant = new Date()) {
  exigerEcriture();
  const plan = R.planNouvelleSerie(rendezVous(rdvId), creneaux, maintenant);
  if (plan.erreur) throw new ErreurRdv(plan.erreur);
  const ecritures = [L.ecritureModifier('rdv_rendezvous', rdvId, plan.patchRdv, MARQUES_MAJ)];
  for (const p of participantsDe(rdvId)) ecritures.push(L.ecritureModifier('rdv_participants', p.id, plan.patchParticipant, MARQUES_MAJ));
  await executer(ecritures, 'nouvelleSerieRendezVous');
}

/**
 * « Modifier le rendez-vous » (C1) : la liste voulue (objet, adresse, créneaux, participants) devient l'état du rendez-vous, en UN seul lot (le journal garde chaque écriture).
 * Les règles sont dans R.planModifierRendezVous (tout avant le premier envoi ; objet et adresse seulement après). Un participant ajouté reçoit une fiche Personne (téléphone dessus) si besoin ;
 * un participant retiré disparaît du rendez-vous (sa fiche Personne reste). Rend rien ; lève une ErreurRdv lisible si refusé.
 */
export async function modifierRendezVous(rdvId, cible, maintenant = new Date()) {
  exigerEcriture();
  const rdv = rendezVous(rdvId);
  const parts = participantsDe(rdvId);
  const plan = R.planModifierRendezVous({ rdv, participants: parts, cible, maintenant });
  if (plan.erreur) throw new ErreurRdv(plan.erreur);
  const ctx = CRM.ctx();
  const ecritures = [];
  const patchsFiches = new Map(); // personneId -> téléphones à ajouter (une seule écriture par fiche)
  const ajouterTelephone = (personneId, telephone) => {
    const personne = personneId ? CRM.personne(personneId) : null;
    if (!personne) return;
    const deja = patchsFiches.get(personneId) ?? (personne.telephones || []);
    if (deja.some((t) => R.normaliserTelephone(t.valeur).telephone === telephone)) return;
    patchsFiches.set(personneId, L.sansDoublonsContacts('telephones', [...deja, { valeur: R.afficherTelephone(telephone), type: 'perso' }]));
  };
  for (const m of plan.majs) {
    if (m.patch.telephone) ajouterTelephone(parts.find((x) => x.id === m.id)?.personneId, m.patch.telephone);
    ecritures.push(L.ecritureModifier('rdv_participants', m.id, plan.remiseAZero ? { ...m.patch, ...PATCH_REPART_A_ZERO } : m.patch, MARQUES_MAJ));
  }
  if (plan.remiseAZero) {
    const modifies = new Set(plan.majs.map((m) => m.id));
    for (const p of parts) if (!plan.retraits.includes(p.id) && !modifies.has(p.id)) ecritures.push(L.ecritureModifier('rdv_participants', p.id, PATCH_REPART_A_ZERO, MARQUES_MAJ));
  }
  for (const id of plan.retraits) ecritures.push(L.ecritureSupprimer('rdv_participants', id));
  const repere = rdv.test === true ? { test: true } : {};
  for (const a of plan.ajouts) {
    let personneId = a.personneId;
    if (personneId && CRM.personne(personneId)) ajouterTelephone(personneId, a.telephone);
    else {
      const valeurs = { nom: a.nom, telephones: [{ valeur: R.afficherTelephone(a.telephone), type: 'perso' }] };
      const creation = L.planCreerPersonne(L.heriterTest(avecModeTest(valeurs), repere), ctx);
      ecritures.push(...creation.ecritures);
      personneId = creation.id;
    }
    ecritures.push(L.ecritureCreer('rdv_participants', ctx.nouvelId('rdv_participants'), { rendezVousId: rdvId, personneId, nom: a.nom, role: a.role || '', telephone: a.telephone, reponse: '', etatReponse: 'attente', creneauxOk: [], ...repere }, MARQUES));
  }
  for (const [personneId, telephones] of patchsFiches) ecritures.push(...L.planMajPersonne(personneId, { telephones }).ecritures);
  ecritures.push(L.ecritureModifier('rdv_rendezvous', rdvId, plan.patchRdv, MARQUES_MAJ));
  await executer(ecritures, 'modifierRendezVous');
}
const PATCH_REPART_A_ZERO = { etatReponse: 'attente', creneauxOk: [], reponse: '', reponseLe: null, idReponse: null };

/** Annule le rendez-vous (il passe dans les Archives, marqué « annulé »). Le SMS d'annulation éventuel est une autre action, écrite à la main. */
export async function annulerRendezVous(rdvId) {
  exigerEcriture();
  await executer([L.ecritureModifier('rdv_rendezvous', rdvId, { annule: true, archive: true }, MARQUES_MAJ)], 'annulerRendezVous');
}

// ---------------------------------------------------------------- envoi des SMS (fonctions du serveur, voir functions/src/rdv-appel.js)
// L'écran ne parle jamais à n8n ni au fournisseur de SMS (ClickSend) : il demande au serveur, qui note la demande puis demande l'envoi (« tire maintenant »). Rien ne part sans un clic explicite.

const fonctions = () => getFunctions(app, 'europe-west9');
const FONCTIONS = Object.freeze({ etat: 'rdvEtat', envoyer: 'rdvEnvoyer', connexion: 'rdvConnexionSms' });
const CODES_LISIBLES = ['permission-denied', 'invalid-argument', 'failed-precondition', 'not-found', 'unauthenticated'];
export const MESSAGE_RESEAU = 'Ça n’a pas abouti. Vérifie ta connexion internet, puis réessaie : rien n’a été perdu.';

/** Erreur d'appel -> message à afficher (le SDK ajoute « [403] » en fin de message : on l'enlève). */
export function messageDErreurAppel(e) {
  const code = String(e?.code ?? '').replace('functions/', '');
  const message = String(e?.message ?? '').replace(/\s*\[\d{3}\]$/, '').trim();
  return CODES_LISIBLES.includes(code) && message && message !== code ? message : MESSAGE_RESEAU;
}

async function appeler(operation, demande) {
  const base = CRM.cheminDeBase();
  const client = base ? base.split('/')[1] : undefined;
  try {
    const r = await httpsCallable(fonctions(), FONCTIONS[operation])(client ? { client, ...demande } : demande);
    return r.data;
  } catch (e) {
    console.warn('Rendez-vous : appel refusé', operation, e?.code);
    throw new ErreurRdv(messageDErreurAppel(e));
  }
}

let brancheSms = null; // null = pas encore su ; true / false = réponse du serveur (gardée pour la session)
let reverifier = null; // nouvelle question au serveur, 65 secondes après l'enregistrement de la connexion
let peutConfigurerSms = false; // le serveur dit si CE compte peut saisir la connexion SMS (Jérôme seul) ; faux tant qu'on ne sait pas
let brancheEnCours = null;
/** « Envoyer » doit-il être actif ? Valeur connue (true / false) ou null tant que le serveur n'a pas répondu (le bouton reste grisé). Lance la question au premier appel et prévient les écrans à la réponse. */
export function envoiBranche() {
  if (brancheSms === null && !brancheEnCours) {
    brancheEnCours = appeler('etat', {})
      .then((r) => { brancheSms = r?.branche === true; peutConfigurerSms = r?.peutConfigurer === true; })
      .catch(() => { brancheSms = false; }) // fonction absente (espace pas encore déployé), compte sans droit : le bouton reste grisé
      .finally(() => { brancheEnCours = null; notifier(); });
  }
  return brancheSms;
}
/** Réinitialise ce qui est su (changement de compte ou d'espace). */
export function oublierEtatEnvoi() { brancheSms = null; peutConfigurerSms = false; brancheEnCours = null; clearTimeout(reverifier); }

/** Ce compte peut-il saisir la connexion SMS (clé ClickSend) ? null tant que le serveur n'a pas répondu. Le serveur refuse de toute façon tout autre compte que celui de Jérôme. */
export function peutConfigurerConnexion() { envoiBranche(); return brancheSms === null && !peutConfigurerSms ? null : peutConfigurerSms; }

/**
 * Connexion ClickSend (réservée à Jérôme, voir functions/src/rdv-connexion-appel.js) :
 *  - 'etat'                                                  -> { enregistre, expediteur } (jamais la clé) ;
 *  - 'adresse'                                               -> { adresse } (l'adresse des réponses avec son jeton, sur demande seulement) ;
 *  - 'enregistrer', { identifiant, cle, expediteur?, regenererAdresse? } -> { ok, adresse, adresseChangee } ;
 *  - 'regenerer'                                             -> { ok, adresse, adresseChangee }.
 * La clé part vers le serveur et nulle part ailleurs : l'écran ne la garde pas. Lève une ErreurRdv lisible si refusé.
 */
export async function connexionSms(action, donnees = {}) {
  const r = await appeler('connexion', { action, ...donnees });
  if (action === 'enregistrer' || action === 'regenerer') {
    // L'état « branché » est redemandé tout de suite, puis encore une fois après 65 secondes : le serveur garde la connexion en mémoire 60 secondes au plus par instance, donc « Envoyer » peut
    // mettre jusqu'à une minute à s'activer. « peutConfigurer » est gardé : le formulaire ne clignote pas.
    brancheSms = null; brancheEnCours = null;
    clearTimeout(reverifier);
    // Une panne passagère à ce moment-là ne change rien à ce qu'on savait (« branché » n'est jamais écrasé par un échec de cette vérification).
    reverifier = setTimeout(() => { appeler('etat', {}).then((r) => { brancheSms = r?.branche === true; peutConfigurerSms = r?.peutConfigurer === true; notifier(); }).catch(() => {}); }, 65_000);
  }
  return r;
}

/** Envoie les premières propositions d'un rendez-vous (ou d'une nouvelle série). Rend { ok, declenche }. Lève une ErreurRdv lisible si refusé. */
export async function envoyerPropositions(rendezVousId) {
  exigerEcriture();
  return appeler('envoyer', { action: 'propositions', rendezVousId });
}
/** « Renvoyer le SMS » (C2) : refait partir le SMS abandonné d'un participant. Rend { ok, declenche }. Lève une ErreurRdv lisible si refusé. */
export async function renvoyerSmsParticipant(rendezVousId, participantId) {
  exigerEcriture();
  return appeler('envoyer', { action: 'renvoyer', rendezVousId, participantId });
}
/** Envoie un SMS écrit à la main (pluie ou annulation) à tous les participants. Rend { ok, nombre, declenche, caracteres, segments }. */
export async function envoyerSmsManuel(rendezVousId, type, texte) {
  exigerEcriture();
  return appeler('envoyer', { action: 'sms', rendezVousId, type, texte });
}
