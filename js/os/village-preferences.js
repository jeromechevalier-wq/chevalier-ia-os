// Interrupteurs « Mon accueil » de chaque personne (27/11/2026, docs/accueil-village.md « Interrupteurs par personne ») : lecture et écriture du document
// village_utilisateurs/{uid}/preferences/accueil = { jeu, accueil, modifieLe } (firestore.rules : la personne elle-même seulement ; l'heure est celle du serveur).
//  - lirePreferences({ uid }) (maison neutre = maison d'un client, lue par maisonNeutre()) : UNE lecture à l'ouverture de la session, qui ne bloque jamais l'écran
//    plus de 2 s. Rend { jeu, accueil, sur }. Lue (ou absente) : sur = true, et le réglage est mémorisé sur l'appareil (clé par uid). Illisible ou trop lente :
//    le dernier réglage mémorisé sur cet appareil (sinon les défauts), sur = false, et un console.warn avec le code seulement. Un clic de la carte relit alors
//    le document avant d'écrire, pour ne jamais écraser l'autre interrupteur avec une valeur devinée.
//  - ecrirePreferences({ uid, jeu, accueil }) : le document entier, avec l'heure du serveur, 8 s au plus (hors ligne : false) ; réussie, le réglage est mémorisé.
// Crochets de test (émulateurs seulement) : window.__chevalierTest.preferencesAccueil = { jeu, accueil } remplace la lecture du document (parcours de l'or) ;
// window.__chevalierTest.pannesPreferences = { lecture: n, ecriture: n } fait échouer les n prochaines lectures ou écritures.
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db, MODE_EMULATEURS } from './firebase.js';
import { cheminCollection } from './chemins.js';
import { maisonNeutre } from './identite-maison.js';
import { lirePreference, ecrirePreference } from './ui.js';
import { defauts, preferencesAppliquees, preferencesValables, preferencesMemorisees } from './village-preferences-logique.js';

export const DELAI_LECTURE_MS = 2000;
export const DELAI_ECRITURE_MS = 8000;

const document_ = (uid) => doc(db, ...cheminCollection('', 'village_utilisateurs').split('/'), String(uid), 'preferences', 'accueil');
const cleAppareil = (uid) => `accueil-village.${uid}`;
const memoriser = (uid, p) => ecrirePreference(cleAppareil(uid), JSON.stringify({ jeu: p.jeu, accueil: p.accueil }));

function pannePosee(sorte) {
  const p = MODE_EMULATEURS ? window.__chevalierTest?.pannesPreferences : null;
  if (!p || !(p[sorte] > 0)) return false;
  p[sorte] -= 1;
  return true;
}

/** Une promesse, ou 'lent' au bout de `ms`. */
async function auPlus(promesse, ms) {
  let minuteur = null;
  const trop = new Promise((fin) => { minuteur = setTimeout(() => fin('lent'), ms); });
  try { return await Promise.race([promesse, trop]); } finally { clearTimeout(minuteur); }
}

/** Les défauts de la maison (sans lecture : maison sans village). */
export const preferencesParDefaut = () => ({ ...defauts({ neutre: maisonNeutre() }), sur: true });

/** Les préférences de la personne : { jeu, accueil, sur }. Jamais d'exception, jamais plus de DELAI_LECTURE_MS d'attente. */
export async function lirePreferences({ uid, neutre = maisonNeutre() } = {}) {
  if (MODE_EMULATEURS) {
    const essai = window.__chevalierTest?.preferencesAccueil;
    if (preferencesValables(essai)) return { jeu: essai.jeu, accueil: essai.accueil, sur: true };
  }
  if (!uid) return { ...defauts({ neutre }), sur: false };
  const repli = () => ({ ...(preferencesMemorisees(lirePreference(cleAppareil(uid))) ?? defauts({ neutre })), sur: false });
  try {
    if (pannePosee('lecture')) throw Object.assign(new Error('panne simulée'), { code: 'panne' });
    const r = await auPlus(getDoc(document_(uid)), DELAI_LECTURE_MS);
    if (r === 'lent') { console.warn('Mon accueil : lecture trop lente, dernier réglage connu', 'delai'); return repli(); }
    const p = preferencesAppliquees(r.exists() ? r.data() : null, { neutre });
    memoriser(uid, p);
    return { ...p, sur: true };
  } catch (e) {
    console.warn('Mon accueil : réglages illisibles, dernier réglage connu', String(e?.code ?? 'inconnu'));
    return repli();
  }
}

/** Écrit les deux interrupteurs de la personne. Rend vrai si l'écriture a réussi en DELAI_ECRITURE_MS au plus (jamais d'exception). */
export async function ecrirePreferences({ uid, jeu, accueil } = {}) {
  if (!uid || !preferencesValables({ jeu, accueil })) return false;
  try {
    if (pannePosee('ecriture')) throw Object.assign(new Error('panne simulée'), { code: 'panne' });
    const r = await auPlus(setDoc(document_(uid), { jeu, accueil, modifieLe: serverTimestamp() }), DELAI_ECRITURE_MS);
    if (r === 'lent') { console.warn('Mon accueil : réglage non enregistré', 'delai'); return false; }
    memoriser(uid, { jeu, accueil });
    return true;
  } catch (e) {
    console.warn('Mon accueil : réglage non enregistré', String(e?.code ?? 'inconnu'));
    return false;
  }
}
