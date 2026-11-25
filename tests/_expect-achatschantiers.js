// Petit « expect » de compatibilité : les tests de logique de l'appli d'origine (écrits pour un autre lanceur) sont recopiés dans tests/achatschantiers-logique.test.js
// avec LES MÊMES cas et LES MÊMES valeurs ; ce fichier traduit leurs vérifications (toBe, toEqual, toMatch…) en vérifications de node:assert. Aucun réseau, aucune donnée.
import assert from 'node:assert/strict';

function verifs(valeur, nie) {
  const ok = (cond, message) => { if (nie ? cond : !cond) assert.fail(message); };
  const m = {
    toBe: (v) => ok(Object.is(valeur, v), `${nie ? 'ne devait pas être' : 'devait être'} ${JSON.stringify(v)}, reçu ${JSON.stringify(valeur)}`),
    toEqual: (v) => { if (nie) assert.notDeepEqual(valeur, v); else assert.deepEqual(valeur, v); },
    toMatch: (re) => { if (nie) assert.doesNotMatch(String(valeur), re); else assert.match(String(valeur), re); },
    toBeNull: () => ok(valeur === null, `${nie ? 'ne devait pas être' : 'devait être'} null, reçu ${JSON.stringify(valeur)}`),
    toContain: (v) => ok(Array.isArray(valeur) || typeof valeur === 'string' ? valeur.includes(v) : false, `${nie ? 'ne devait pas contenir' : 'devait contenir'} ${JSON.stringify(v)}`),
    toHaveLength: (n) => ok(valeur.length === n, `longueur attendue ${n}, reçue ${valeur.length}`),
    toBeTruthy: () => ok(Boolean(valeur), 'devait être vrai'),
    toBeUndefined: () => ok(valeur === undefined, 'devait être indéfini'),
    toHaveBeenCalledTimes: (n) => ok(valeur.appels.length === n, `appels attendus ${n}, reçus ${valeur.appels.length}`),
    toHaveBeenCalledWith: (...a) => ok(valeur.appels.some((x) => JSON.stringify(x) === JSON.stringify(a)), `appel attendu avec ${JSON.stringify(a)}`),
  };
  return m;
}

export function expect(valeur) {
  const m = verifs(valeur, false);
  m.not = verifs(valeur, true);
  return m;
}

/** Espion minimal : enregistre les appels et rend ce qu'on lui a demandé. */
export function espion(reponse) {
  const f = (...a) => { f.appels.push(a); return typeof reponse === 'function' ? reponse(...a) : reponse; };
  f.appels = [];
  return f;
}
