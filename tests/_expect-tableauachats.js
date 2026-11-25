// Petit « expect » pour les tests portés de l'appli d'achats (vitest) : mêmes assertions, exécutées par `node --test` (node:assert). Aucune dépendance.
import assert from 'node:assert/strict';

function sur(recu, nier) {
  const ok = (cond, message) => { if (nier ? cond : !cond) assert.fail(`${nier ? 'attendu : le contraire de ' : ''}${message}`); };
  const ressemble = (a, b) => {
    if (b === null || typeof b !== 'object') return Object.is(a, b);
    if (a === null || typeof a !== 'object') return false;
    if (Array.isArray(b)) return Array.isArray(a) && a.length === b.length && b.every((x, i) => ressemble(a[i], x));
    return Object.keys(b).every((k) => ressemble(a[k], b[k]));
  };
  const egal = (a, b) => { try { assert.deepStrictEqual(a, b); return true; } catch { return false; } };
  return {
    toBe: (v) => ok(Object.is(recu, v), `${JSON.stringify(recu)} devrait être ${JSON.stringify(v)}`),
    toEqual: (v) => ok(egal(recu, v), `${JSON.stringify(recu)} devrait égaler ${JSON.stringify(v)}`),
    toBeNull: () => ok(recu === null, `${JSON.stringify(recu)} devrait être null`),
    toBeDefined: () => ok(recu !== undefined, 'devrait être défini'),
    toBeUndefined: () => ok(recu === undefined, `${JSON.stringify(recu)} devrait être indéfini`),
    toMatchObject: (v) => ok(ressemble(recu, v), `${JSON.stringify(recu)} devrait contenir ${JSON.stringify(v)}`),
    toBeCloseTo: (v, chiffres = 2) => ok(Math.abs(recu - v) < 10 ** -chiffres / 2, `${recu} devrait être proche de ${v}`),
    toMatch: (re) => ok(re.test(String(recu)), `${JSON.stringify(recu)} devrait correspondre à ${re}`),
    toContain: (v) => ok(recu.includes(v), `${JSON.stringify(recu)} devrait contenir ${JSON.stringify(v)}`),
    toBeTruthy: () => ok(Boolean(recu), `${JSON.stringify(recu)} devrait être vrai`),
    toBeFalsy: () => ok(!recu, `${JSON.stringify(recu)} devrait être faux`),
    toHaveProperty: (k) => ok(recu !== null && typeof recu === 'object' && Object.hasOwn(recu, k), `devrait avoir la propriété ${k}`),
    toHaveLength: (n) => ok(recu.length === n, `longueur ${recu.length} au lieu de ${n}`),
  };
}

export function expect(recu) {
  const r = sur(recu, false);
  r.not = sur(recu, true);
  return r;
}
