// Interrupteurs « Mon accueil » de chaque personne (27/11/2026, docs/accueil-village.md « Interrupteurs par personne ») : lecture et écriture du document
// village_utilisateurs/{uid}/preferences/accueil = { jeu, accueil, modifieLe } (firestore.rules : la personne elle-même seulement ; l'heure est celle du serveur).
//  - lirePreferences({ uid }) (maison neutre = maison d'un client, lue par maisonNeutre()) : UNE lecture à l'ouverture de la session, qui ne bloque jamais l'écran plus de 2 s ; absent, mal formé, illisible
//    ou trop lent : les défauts (js/os/village-preferences-logique.js) et, pour une panne, un console.warn avec le code seulement.
//  - ecrirePreferences({ uid, jeu, accueil }) : le document entier, avec l'heure du serveur ; rend vrai si l'écriture a réussi.
// Crochets de test (émulateurs seulement) : window.__chevalierTest.preferencesAccueil = { jeu, accueil } remplace la lecture du document (parcours de l'or) ;
// window.__chevalierTest.pannesPreferences = { ecriture: n } fait échouer les n prochaines écritures.
import { doc, getDoc, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { db, MODE_EMULATEURS } from './firebase.js';
import { cheminCollection } from './chemins.js';
import { maisonNeutre } from './identite-maison.js';
import { defauts, preferencesAppliquees, preferencesValables } from './village-preferences-logique.js';

export const DELAI_LECTURE_MS = 2000;

const document_ = (uid) => doc(db, ...cheminCollection('', 'village_utilisateurs').split('/'), String(uid), 'preferences', 'accueil');

/** Les préférences de la personne : { jeu, accueil }. Jamais d'exception, jamais plus de DELAI_LECTURE_MS d'attente. */
export async function lirePreferences({ uid, neutre = maisonNeutre() } = {}) {
  const parDefaut = defauts({ neutre });
  if (MODE_EMULATEURS) {
    const essai = window.__chevalierTest?.preferencesAccueil;
    if (preferencesValables(essai)) return { jeu: essai.jeu, accueil: essai.accueil };
  }
  if (!uid) return parDefaut;
  let minuteur = null;
  const trop = new Promise((fin) => { minuteur = setTimeout(() => fin('lent'), DELAI_LECTURE_MS); });
  try {
    const r = await Promise.race([getDoc(document_(uid)), trop]);
    if (r === 'lent') { console.warn('Mon accueil : lecture trop lente, réglages par défaut', 'delai'); return parDefaut; }
    return preferencesAppliquees(r.exists() ? r.data() : null, { neutre });
  } catch (e) {
    console.warn('Mon accueil : réglages illisibles, réglages par défaut', String(e?.code ?? 'inconnu'));
    return parDefaut;
  } finally {
    clearTimeout(minuteur);
  }
}

/** Écrit les deux interrupteurs de la personne. Rend vrai si l'écriture a réussi (jamais d'exception). */
export async function ecrirePreferences({ uid, jeu, accueil } = {}) {
  if (!uid || !preferencesValables({ jeu, accueil })) return false;
  try {
    const p = MODE_EMULATEURS ? window.__chevalierTest?.pannesPreferences : null;
    if (p && p.ecriture > 0) { p.ecriture -= 1; throw Object.assign(new Error('panne simulée'), { code: 'panne' }); }
    await setDoc(document_(uid), { jeu, accueil, modifieLe: serverTimestamp() });
    return true;
  } catch (e) {
    console.warn('Mon accueil : réglage non enregistré', String(e?.code ?? 'inconnu'));
    return false;
  }
}
