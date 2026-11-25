// Petit « expect » de compatibilité : les tests de logique de l'appli d'origine (écrits pour un autre lanceur) sont recopiés dans tests/achatsfactures-*.test.js
// avec LES MÊMES cas et LES MÊMES valeurs ; ce fichier traduit leurs vérifications (toBe, toEqual, toMatch…) en vérifications de node:assert. Aucun réseau, aucune donnée.
import assert from 'node:assert/strict';

function verifs(valeur, nie) {
  const ok = (cond, message) => { if (nie ? cond : !cond) assert.fail(message); };
  const montrer = (v) => { try { return JSON.stringify(v); } catch { return String(v); } };
  const contient = (obj, partiel) => Object.entries(partiel).every(([k, v]) => (v && typeof v === 'object' ? contient(obj?.[k] ?? {}, v) : Object.is(obj?.[k], v)));
  return {
    toBe: (v) => ok(Object.is(valeur, v), `${nie ? 'ne devait pas être' : 'devait être'} ${montrer(v)}, reçu ${montrer(valeur)}`),
    toEqual: (v) => { if (nie) assert.notDeepEqual(valeur, v); else assert.deepEqual(valeur, v); },
    toMatch: (re) => { if (nie) assert.doesNotMatch(String(valeur), re); else assert.match(String(valeur), re); },
    toMatchObject: (v) => ok(contient(valeur, v), `${nie ? 'ne devait pas contenir' : 'devait contenir'} ${montrer(v)}, reçu ${montrer(valeur)}`),
    toBeNull: () => ok(valeur === null, `${nie ? 'ne devait pas être' : 'devait être'} null, reçu ${montrer(valeur)}`),
    toContain: (v) => ok(Array.isArray(valeur) || typeof valeur === 'string' ? valeur.includes(v) : false, `${nie ? 'ne devait pas contenir' : 'devait contenir'} ${montrer(v)}, reçu ${montrer(valeur)}`),
    toHaveLength: (n) => ok(valeur.length === n, `longueur attendue ${n}, reçue ${valeur.length}`),
    toThrow: (m) => {
      let erreur = null;
      try { valeur(); } catch (e) { erreur = e; }
      const msg = erreur ? String(erreur.message ?? erreur) : '';
      const bon = erreur !== null && (m === undefined || (m instanceof RegExp ? m.test(msg) : msg.includes(m)));
      ok(bon, `${nie ? 'ne devait pas lever' : 'devait lever'} ${m === undefined ? 'une erreur' : String(m)}, reçu ${erreur ? montrer(msg) : 'aucune erreur'}`);
    },
    toBeFalsy: () => ok(!valeur, 'devait être faux'),
    toBeGreaterThanOrEqual: (n) => ok(valeur >= n, `${valeur} devait être >= ${n}`),
    toBeTruthy: () => ok(Boolean(valeur), 'devait être vrai'),
    toBeUndefined: () => ok(valeur === undefined, 'devait être indéfini'),
    toBeLessThan: (n) => ok(valeur < n, `${valeur} devait être < ${n}`),
    toBeLessThanOrEqual: (n) => ok(valeur <= n, `${valeur} devait être <= ${n}`),
    toBeGreaterThan: (n) => ok(valeur > n, `${valeur} devait être > ${n}`),
    toHaveBeenCalledTimes: (n) => ok(valeur.appels.length === n, `appels attendus ${n}, reçus ${valeur.appels.length}`),
    toHaveBeenCalledWith: (...a) => ok(valeur.appels.some((x) => JSON.stringify(x) === JSON.stringify(a)), `appel attendu avec ${JSON.stringify(a)}`),
  };
}

export function expect(valeur) {
  const m = verifs(valeur, false);
  m.not = verifs(valeur, true);
  return m;
}

/** Espion minimal : enregistre les appels et rend ce qu'on lui a demandé (une valeur, ou une fonction). */
export function espion(reponse) {
  const f = (...a) => { f.appels.push(a); return typeof reponse === 'function' ? reponse(...a) : reponse; };
  f.appels = [];
  return f;
}
