// Or du village côté écran (27/11/2026, étape 6a de docs/accueil-village.md) : le SEUL fichier de l'écran qui parle de l'or au réseau.
//  - activerOr({ base, uid }) : appelé par js/main.js seulement quand le village est allumé (besoins réglés). Sans lui, une bonne nouvelle annoncée par un module ne fait rien.
//  - à chaque bonne nouvelle (js/os/bonnes-nouvelles.js), la fonction du serveur `villageOr` est appelée avec « regarde telle facture » : le serveur vérifie lui-même et crédite.
//    Réponse « gagné » : le solde connu change, les abonnés sont prévenus, la fête (js/os/village-fete.js). Toute erreur ou « rien gagné » : SILENCE pour l'utilisateur
//    (un console.warn avec le code seulement), jamais de nouvel essai : le module, lui, a déjà réussi.
//  - lireOr() : le portefeuille village_utilisateurs/{uid} (lu par son propriétaire, jamais écrit par le navigateur) ; document absent = 0 (une vraie valeur), panne = « illisible ».
//  - le solde connu porte la `version` du portefeuille (+1 à chaque gain, écrite par le serveur) : une lecture partie AVANT un gain (version plus basse) n'écrase jamais
//    le solde plus récent rendu par le gain ; orConnu() le rend tout de suite (l'accueil l'affiche au montage, sans attendre la lecture).
// Pannes simulées (émulateurs seulement) : window.__chevalierTest.pannesOr = { lecture: n } fait échouer les n prochaines lectures ; { lenteur: ms } retarde chaque lecture de ms millisecondes.
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js';
import { db, app, MODE_EMULATEURS } from './firebase.js';
import { cheminCollection } from './chemins.js';
import { ecouter } from './bonnes-nouvelles.js';
import { feterOr } from './village-fete.js';

const SOURCES = ['facture-validee', 'facture-payee', 'devis-signe'];
let actif = null; // { base, uid, arret }
let solde = null; // dernier solde connu (nombre) ou null
let version = -1; // version du portefeuille de ce solde (-1 : rien de connu)
const abonnes = new Set();

function pannePosee(sorte) {
  if (!MODE_EMULATEURS) return false;
  const p = window.__chevalierTest?.pannesOr;
  if (!p || !(p[sorte] > 0)) return false;
  p[sorte] -= 1;
  return true;
}

function prevenir() {
  for (const fn of abonnes) { try { fn(solde); } catch { /* rien */ } }
}

const texteSimple = (v) => (typeof v === 'string' && v ? v : undefined);
const entier = (v) => (Number.isInteger(v) && v >= 0 ? v : null);

/** Retient `or` s'il n'est pas plus ancien que le solde connu (version égale ou plus haute). Rend vrai s'il a été retenu. */
function retenir(or, v) {
  if (v < version) return false;
  solde = or;
  version = v;
  return true;
}

async function recevoir(detail, moi) {
  const source = detail?.source;
  if (!SOURCES.includes(source)) return;
  const demande = { action: 'gain', source };
  const id = texteSimple(detail.id);
  const projetId = texteSimple(detail.projetId);
  if (id) demande.id = id;
  if (projetId) demande.projetId = projetId;
  const client = moi.base ? moi.base.split('/')[1] : undefined;
  try {
    const r = await httpsCallable(getFunctions(app, 'europe-west9'), 'villageOr')(client ? { client, ...demande } : demande);
    if (actif !== moi) return; // session fermée ou changée pendant l'appel
    const d = r?.data ?? {};
    if (Number.isInteger(d.gagne) && d.gagne > 0) {
      // Un serveur qui ne rend pas encore de version : le gain est de toute façon plus récent que ce qui est connu.
      if (entier(d.or) !== null && retenir(d.or, entier(d.version) ?? version + 1)) prevenir();
      feterOr(d.gagne);
    } else {
      console.warn('Village : pas d’or pour cette bonne nouvelle', d.raison ?? '');
    }
  } catch (e) {
    console.warn('Village : or non compté', String(e?.code ?? 'inconnu'));
  }
}

/** Branche l'écoute des bonnes nouvelles (une seule fois par session). Rend la fonction qui l'arrête. */
export function activerOr({ base = '', uid }) {
  if (actif && actif.base === base && actif.uid === uid) return actif.arret;
  actif?.arret();
  const moi = { base, uid, arret: null };
  const arreterEcoute = ecouter((detail) => { void recevoir(detail, moi); });
  moi.arret = () => {
    arreterEcoute();
    if (actif === moi) { actif = null; solde = null; version = -1; }
  };
  actif = moi;
  solde = null;
  version = -1;
  return moi.arret;
}

/** Lit le solde de l'utilisateur actif : { etat: 'ok', or, parcelles } ou { etat: 'illisible' }. Jamais d'exception. Une lecture plus ancienne qu'un gain déjà reçu rend le solde du gain. */
export async function lireOr() {
  const moi = actif;
  if (!moi?.uid) return { etat: 'illisible' };
  try {
    const lenteur = MODE_EMULATEURS ? Number(window.__chevalierTest?.pannesOr?.lenteur) : 0;
    if (lenteur > 0) await new Promise((fin) => { setTimeout(fin, Math.min(lenteur, 10000)); });
    if (pannePosee('lecture')) throw new Error('panne simulée');
    const instantane = await getDoc(doc(db, ...cheminCollection(moi.base, 'village_utilisateurs').split('/'), String(moi.uid)));
    const d = instantane.exists() ? instantane.data() : {};
    const or = entier(d.or) ?? 0;
    const parcelles = entier(d.parcelles) ?? 0;
    if (actif !== moi) return { etat: 'ok', or, parcelles };
    retenir(or, entier(d.version) ?? 0);
    return { etat: 'ok', or: solde, parcelles };
  } catch {
    return { etat: 'illisible' };
  }
}

/** Le dernier solde connu de la session (nombre), ou null : l'accueil l'affiche dès son montage. */
export function orConnu() {
  return actif ? solde : null;
}

/** Abonnement au solde connu (après un gain) : `fn(or)` ; rend la fonction qui désabonne. */
export function surOr(fn) {
  abonnes.add(fn);
  return () => abonnes.delete(fn);
}
