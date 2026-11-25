// Petit « expect » pour les tests de logique du module Articles : les tests de l'appli d'origine sont écrits avec expect(...).toBe(...) ;
// pour les garder IDENTIQUES (mêmes cas, mêmes valeurs : c'est le filet du portage), ce fichier les relie à node:assert. Réservé aux tests (tests/ n'est pas publié).
import assert from 'node:assert/strict';

/** Comparaison « toEqual » : les propriétés égales à undefined comptent comme absentes, le type d'objet est ignoré (comme l'outil d'origine). */
function normaliser(v) {
  if (Array.isArray(v)) return v.map(normaliser);
  if (v instanceof Map) return new Map([...v].map(([k, x]) => [k, normaliser(x)]));
  if (v instanceof Set) return new Set([...v].map(normaliser));
  if (v && typeof v === 'object') {
    if (v instanceof Error) return { name: v.name, message: v.message };
    return Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).map(([k, x]) => [k, normaliser(x)]));
  }
  return v;
}
const motif = (m) => (m instanceof RegExp ? m : new RegExp(String(m).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
const tel = (v) => { try { return JSON.stringify(v); } catch { return String(v); } };

function sous(valeur, negation = false) {
  const ok = (cond, msg) => assert.ok(negation ? !cond : cond, `${negation ? 'attendu : NON ' : 'attendu : '}${msg}`);
  const m = {
    toBe: (x) => ok(Object.is(valeur, x), `${tel(valeur)} est ${tel(x)}`),
    toEqual: (x) => { if (negation) assert.notDeepStrictEqual(normaliser(valeur), normaliser(x)); else assert.deepStrictEqual(normaliser(valeur), normaliser(x)); },
    toMatch: (x) => ok(motif(x).test(String(valeur)), `${tel(valeur)} correspond à ${String(x)}`),
    toContain: (x) => ok(typeof valeur === 'string' ? valeur.includes(String(x)) : Array.from(valeur).includes(x), `${tel(valeur)} contient ${tel(x)}`),
    toBeNull: () => ok(valeur === null, `${tel(valeur)} est null`),
    toBeUndefined: () => ok(valeur === undefined, `${tel(valeur)} est undefined`),
    toBeDefined: () => ok(valeur !== undefined, `${tel(valeur)} est défini`),
    toBeTruthy: () => ok(Boolean(valeur), `${tel(valeur)} est vrai`),
    toBeFalsy: () => ok(!valeur, `${tel(valeur)} est faux`),
    toBeNaN: () => ok(Number.isNaN(valeur), `${tel(valeur)} est NaN`),
    toHaveLength: (n) => ok(valeur != null && valeur.length === n, `${tel(valeur)} a ${n} éléments`),
    toBeGreaterThan: (n) => ok(valeur > n, `${valeur} > ${n}`),
    toBeLessThan: (n) => ok(valeur < n, `${valeur} < ${n}`),
    toBeCloseTo: (n, chiffres = 2) => ok(Math.abs(valeur - n) < (10 ** -chiffres) / 2, `${valeur} proche de ${n} (${chiffres} décimales)`),
    toMatchObject: (x) => { const v = normaliser(valeur); for (const [k, e] of Object.entries(normaliser(x))) assert.deepStrictEqual(v[k], e, `propriété « ${k} »`); },
    toHaveBeenCalledTimes: (n) => ok(valeur.mock.calls.length === n, `appelé ${valeur.mock.calls.length} fois, attendu ${n}`),
    toBeInstanceOf: (c) => ok(valeur instanceof c, `${tel(valeur)} est une instance de ${c.name}`),
  };
  return m;
}

export function expect(valeur) {
  const base = sous(valeur);
  return {
    ...base,
    not: sous(valeur, true),
    rejects: { toThrow: async (msg) => { await assert.rejects(Promise.resolve(valeur), msg === undefined ? undefined : (e) => (e instanceof Error ? e.message : String(e)).includes(String(msg))); } },
    resolves: { toEqual: async (x) => { assert.deepStrictEqual(normaliser(await valeur), normaliser(x)); }, toBe: async (x) => { assert.ok(Object.is(await valeur, x)); } },
  };
}

/** Espion : vi.fn(implémentation) enregistre ses appels dans .mock.calls. */
export const vi = {
  fn(impl = () => undefined) {
    const f = (...a) => { f.mock.calls.push(a); return impl(...a); };
    f.mock = { calls: [] };
    return f;
  },
};
