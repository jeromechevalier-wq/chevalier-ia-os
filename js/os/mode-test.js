// Mode test (PR 1a-2a) : un interrupteur par navigateur. Allumé, tout ce que l'écran crée porte `test: true` (posé par les fonctions de création des
// couches `donnees.js`, au moment de l'appel). Éteint par défaut ; stockage absent, vide ou qui lève = éteint. Ne concerne jamais l'assistant.
import { lirePreference, ecrirePreference } from './ui.js';

const CLE = 'modeTest';
const abonnes = new Set();

/** Le mode est-il allumé ? Lu à chaque appel (la valeur au clic « Enregistrer » compte, pas celle de l'ouverture du dialogue). */
export function modeTestAllume() {
  try { return lirePreference(CLE) === '1'; } catch { return false; }
}

function poserAttribut(allume) {
  try {
    if (allume) document.documentElement.dataset.modeTest = '1'; else delete document.documentElement.dataset.modeTest;
  } catch { /* pas de document (tests en Node) */ }
}

function prevenir() {
  const v = modeTestAllume(); // source unique : le stockage (s'il est bloqué, le mode reste éteint, l'écran le dit)
  poserAttribut(v);
  for (const f of [...abonnes]) { try { f(v); } catch (e) { console.warn('Mode test : abonné en échec', e); } }
}

export function definirModeTest(allume) {
  ecrirePreference(CLE, allume === true ? '1' : '0');
  prevenir();
}

/** Appelle `fn(allume)` à chaque changement ; renvoie la fonction qui arrête l'abonnement. */
export function surModeTest(fn) {
  abonnes.add(fn);
  return () => abonnes.delete(fn);
}

/** Valeurs d'une création : le repère `test` est ajouté si le mode est allumé ; un `test: true` déjà posé par l'appelant n'est jamais retiré. */
export function avecModeTest(valeurs) {
  return modeTestAllume() ? { ...valeurs, test: true } : valeurs;
}

poserAttribut(modeTestAllume());
// Un autre onglet du même navigateur change le mode : l'écran de celui-ci le dit aussi (le repère est lu dans le même stockage).
try { window.addEventListener('storage', (e) => { if (e.key === null || e.key === `chevalier-os.${CLE}`) prevenir(); }); } catch { /* pas de fenêtre */ }
