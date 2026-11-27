// Or du village côté écran (27/11/2026, étape 6a de docs/accueil-village.md) : le SEUL fichier de l'écran qui parle de l'or au réseau.
//  - activerOr({ base, uid }) : appelé par js/main.js seulement quand le village est allumé (besoins réglés). Sans lui, une bonne nouvelle annoncée par un module ne fait rien.
//  - à chaque bonne nouvelle (js/os/bonnes-nouvelles.js), la fonction du serveur `villageOr` est appelée avec « regarde telle facture » : le serveur vérifie lui-même et crédite.
//    Réponse « gagné » : le solde connu change, les abonnés sont prévenus, la fête (js/os/village-fete.js). Toute erreur ou « rien gagné » : SILENCE pour l'utilisateur
//    (un console.warn avec le code seulement), jamais de nouvel essai : le module, lui, a déjà réussi.
//  - lireOr() : le portefeuille village_utilisateurs/{uid} (lu par son propriétaire, jamais écrit par le navigateur) ; document absent = 0 (une vraie valeur), panne = « illisible ».
// Pannes simulées (émulateurs seulement) : window.__chevalierTest.pannesOr = { lecture: n } fait échouer les n prochaines lectures.
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js';
import { db, app, MODE_EMULATEURS } from './firebase.js';
import { cheminCollection } from './chemins.js';
import { ecouter } from './bonnes-nouvelles.js';
import { feterOr } from './village-fete.js';

const SOURCES = ['facture-validee', 'facture-payee', 'devis-signe'];
let actif = null; // { base, uid, arret }
let solde = null; // dernier solde connu (nombre) ou null
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
      if (Number.isInteger(d.or) && d.or >= 0) { solde = d.or; prevenir(); }
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
    if (actif === moi) { actif = null; solde = null; }
  };
  actif = moi;
  solde = null;
  return moi.arret;
}

/** Lit le solde de l'utilisateur actif : { etat: 'ok', or, parcelles } ou { etat: 'illisible' }. Jamais d'exception. */
export async function lireOr() {
  const moi = actif;
  if (!moi?.uid) return { etat: 'illisible' };
  try {
    if (pannePosee('lecture')) throw new Error('panne simulée');
    const instantane = await getDoc(doc(db, ...cheminCollection(moi.base, 'village_utilisateurs').split('/'), String(moi.uid)));
    const d = instantane.exists() ? instantane.data() : {};
    const or = Number.isInteger(d.or) && d.or >= 0 ? d.or : 0;
    const parcelles = Number.isInteger(d.parcelles) && d.parcelles >= 0 ? d.parcelles : 0;
    if (actif === moi) solde = or;
    return { etat: 'ok', or, parcelles };
  } catch {
    return { etat: 'illisible' };
  }
}

/** Abonnement au solde connu (après un gain) : `fn(or)` ; rend la fonction qui désabonne. */
export function surOr(fn) {
  abonnes.add(fn);
  return () => abonnes.delete(fn);
}
