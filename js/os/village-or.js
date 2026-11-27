// Or du village côté écran (27/11/2026, étape 6a de docs/accueil-village.md) : le SEUL fichier de l'écran qui parle de l'or au réseau.
//  - activerOr({ base, uid, visible }) : appelé par js/main.js à CHAQUE session (hors portail devis), village allumé ou non (interrupteurs « Mon accueil », 27/11/2026) :
//    l'or se compte toujours. `visible` faux (jeu éteint, accueil classique ou maison sans village) : aucune fête, rien à l'écran ; le serveur enregistre quand même le gain.
//  - à chaque bonne nouvelle (js/os/bonnes-nouvelles.js), la fonction du serveur `villageOr` est appelée avec « regarde telle facture » : le serveur vérifie lui-même et crédite.
//    Réponse « gagné » : le solde connu change, les abonnés sont prévenus, la fête (js/os/village-fete.js). Toute erreur ou « rien gagné » : SILENCE pour l'utilisateur
//    (un console.warn avec le code seulement), jamais de nouvel essai : le module, lui, a déjà réussi.
//  - lireOr() : le portefeuille village_utilisateurs/{uid} (lu par son propriétaire, jamais écrit par le navigateur) ; document absent = 0 (une vraie valeur), panne = « illisible ».
//  - le solde connu porte la `version` du portefeuille (+1 à chaque gain, écrite par le serveur) : une lecture partie AVANT un gain (version plus basse) n'écrase jamais
//    le solde plus récent rendu par le gain ; orConnu() le rend tout de suite (l'accueil l'affiche au montage, sans attendre la lecture).
//  - 6b, boutique : acheterOr({ article, modele, c, l }) demande l'achat au serveur (qui revérifie tout) ; le solde et les parcelles rendus deviennent les valeurs connues.
//    Les parcelles ne baissent jamais : on garde la plus grande valeur vue (lecture, gain ou achat), parcellesConnues() la rend (null si rien de connu).
//  - 7, récolte : ramasserOr({ objet }) demande au serveur de ramasser l'or d'un champ ou d'un enclos (il décide à SON heure) ; un gain fait la même fête qu'une bonne nouvelle.
//  - appelerVillageOr(demande) : la SEULE ligne qui appelle la fonction du serveur (verrou dans tests/statique.test.js).
// Pannes simulées (émulateurs seulement) : window.__chevalierTest.pannesOr = { lecture: n } fait échouer les n prochaines lectures ; { lenteur: ms } retarde chaque lecture de ms millisecondes ;
// { achat: n } fait échouer les n prochains achats ; { ramassage: n } fait échouer les n prochaines récoltes.
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
let parcelles = null; // parcelles achetées (la plus grande valeur vue), ou null
const abonnes = new Set();

function pannePosee(sorte) {
  if (!MODE_EMULATEURS) return false;
  const p = window.__chevalierTest?.pannesOr;
  if (!p || !(p[sorte] > 0)) return false;
  p[sorte] -= 1;
  return true;
}

function prevenir() {
  for (const fn of abonnes) { try { fn(solde, parcelles); } catch { /* rien */ } }
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

/** Garde le plus grand nombre de parcelles vu (elles ne baissent jamais, quelle que soit la version). */
function retenirParcelles(p) {
  const n = entier(p);
  if (n !== null && (parcelles === null || n > parcelles)) parcelles = n;
}

/** L'appel à la fonction du serveur `villageOr` (gain, achat ou récolte), avec l'espace du client sur la plateforme. */
function appelerVillageOr(demande, moi) {
  const client = moi.base ? moi.base.split('/')[1] : undefined;
  return httpsCallable(getFunctions(app, 'europe-west9'), 'villageOr')(client ? { client, ...demande } : demande);
}

async function recevoir(detail, moi) {
  const source = detail?.source;
  if (!SOURCES.includes(source)) return;
  const demande = { action: 'gain', source };
  const id = texteSimple(detail.id);
  const projetId = texteSimple(detail.projetId);
  if (id) demande.id = id;
  if (projetId) demande.projetId = projetId;
  try {
    const r = await appelerVillageOr(demande, moi);
    if (actif !== moi) return; // session fermée ou changée pendant l'appel
    const d = r?.data ?? {};
    if (Number.isInteger(d.gagne) && d.gagne > 0) {
      // Un serveur qui ne rend pas encore de version : le gain est de toute façon plus récent que ce qui est connu.
      if (entier(d.or) !== null && retenir(d.or, entier(d.version) ?? version + 1)) prevenir();
      if (moi.visible) feterOr(d.gagne); // or en silence (jeu éteint ou accueil classique) : le gain est compté, rien ne s'affiche
    } else {
      console.warn('Village : pas d’or pour cette bonne nouvelle', d.raison ?? '');
    }
  } catch (e) {
    console.warn('Village : or non compté', String(e?.code ?? 'inconnu'));
  }
}

/** Branche l'écoute des bonnes nouvelles (une seule fois par session). Rend la fonction qui l'arrête. */
export function activerOr({ base = '', uid, visible = true }) {
  if (actif && actif.base === base && actif.uid === uid) { actif.visible = visible; return actif.arret; }
  actif?.arret();
  const moi = { base, uid, visible, arret: null };
  const arreterEcoute = ecouter((detail) => { void recevoir(detail, moi); });
  moi.arret = () => {
    arreterEcoute();
    if (actif === moi) { actif = null; solde = null; version = -1; parcelles = null; }
  };
  actif = moi;
  solde = null;
  version = -1;
  parcelles = null;
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
    const lues = entier(d.parcelles) ?? 0;
    if (actif !== moi) return { etat: 'ok', or, parcelles: lues };
    retenir(or, entier(d.version) ?? 0);
    retenirParcelles(lues);
    return { etat: 'ok', or: solde, parcelles };
  } catch {
    return { etat: 'illisible' };
  }
}

/** Le dernier solde connu de la session (nombre), ou null : l'accueil l'affiche dès son montage. */
export function orConnu() {
  return actif ? solde : null;
}

/** Abonnement au solde connu (après un gain ou un achat) : `fn(or, parcelles)` ; rend la fonction qui désabonne. */
export function surOr(fn) {
  abonnes.add(fn);
  return () => abonnes.delete(fn);
}

/** Les parcelles achetées connues (la plus grande valeur vue), ou null si rien n'est encore connu. */
export function parcellesConnues() {
  return actif ? parcelles : null;
}

/**
 * Achat dans la boutique (6b) : { etat: 'ok', or, parcelles, objet? } | { etat: 'refus', raison, manque?, or, parcelles } (le solde connu) | { etat: 'erreur' }. Jamais d'exception.
 * Le serveur décide (solde, case, limites) ; quand il rend le portefeuille (même sur un refus), le solde connu suit et les abonnés sont prévenus.
 */
export async function acheterOr({ article, modele, c, l } = {}) {
  const moi = actif;
  if (!moi?.uid) return { etat: 'erreur' };
  const demande = { action: 'acheter', article };
  if (article === 'decoration') Object.assign(demande, { modele, c, l });
  else if (article === 'champ' || article === 'enclos') Object.assign(demande, { c, l });
  try {
    if (pannePosee('achat')) throw Object.assign(new Error('panne simulée'), { code: 'panne' });
    const r = await appelerVillageOr(demande, moi);
    if (actif !== moi) return { etat: 'erreur' };
    const d = r?.data ?? {};
    if (entier(d.or) !== null && entier(d.version) !== null) {
      retenir(d.or, d.version);
      retenirParcelles(d.parcelles);
      prevenir();
    }
    if (d.ok === true && d.achete === true) {
      const o = d.objet;
      const objet = o && typeof o.id === 'string' && Number.isInteger(o.c) && Number.isInteger(o.l) ? { id: o.id, sorte: o.sorte, modele: o.modele, c: o.c, l: o.l } : null;
      if (objet && entier(o.depuisMs) !== null) objet.depuisMs = o.depuisMs;
      return { etat: 'ok', or: solde, parcelles, objet };
    }
    const raison = typeof d.raison === 'string' ? d.raison : 'demande';
    console.warn('Village : achat refusé', raison);
    return { etat: 'refus', raison, manque: entier(d.manque) ?? undefined, or: solde, parcelles };
  } catch (e) {
    console.warn('Village : achat non abouti', String(e?.code ?? 'inconnu'));
    return { etat: 'erreur' };
  }
}

/**
 * Récolte d'un champ ou d'un enclos (7) : { etat: 'ok', ramasse, depuisMs } | { etat: 'refus', raison, depuisMs? } | { etat: 'erreur' }. Jamais d'exception, jamais de nouvel essai.
 * Le serveur décide à son heure ; quand il rend le portefeuille (même sur un refus), le solde connu suit. Un gain fait la fête (feterOr tient compte d'« Animations »).
 */
export async function ramasserOr({ objet } = {}) {
  const moi = actif;
  if (!moi?.uid) return { etat: 'erreur' };
  try {
    if (pannePosee('ramassage')) throw Object.assign(new Error('panne simulée'), { code: 'panne' });
    const r = await appelerVillageOr({ action: 'ramasser', objet }, moi);
    if (actif !== moi) return { etat: 'erreur' };
    const d = r?.data ?? {};
    if (entier(d.or) !== null && entier(d.version) !== null) {
      retenir(d.or, d.version);
      retenirParcelles(d.parcelles);
      prevenir();
    }
    const depuisMs = entier(d.depuisMs) ?? undefined;
    if (d.ok === true && Number.isInteger(d.ramasse) && d.ramasse > 0) {
      if (moi.visible) feterOr(d.ramasse);
      return { etat: 'ok', ramasse: d.ramasse, depuisMs };
    }
    const raison = typeof d.raison === 'string' ? d.raison : 'demande';
    console.warn('Village : rien ramassé', raison);
    return { etat: 'refus', raison, depuisMs };
  } catch (e) {
    console.warn('Village : récolte non aboutie', String(e?.code ?? 'inconnu'));
    return { etat: 'erreur' };
  }
}
