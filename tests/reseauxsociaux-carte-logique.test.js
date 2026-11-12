// Carte mentale d'une source : règles pures (positions, regroupement par pilier, repli). Aucun navigateur, aucun Firebase.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as R from '../js/modules/reseauxsociaux/logique.js';
import * as C from '../js/modules/reseauxsociaux/carte-logique.js';

const source = { id: 's1', type: 'site', nom: 'Site fictif' };
const piste = (id, extra = {}) => ({ id, sourceId: 's1', angle: `Angle ${id}`, pilier: null, etat: 'nouvelle', ideeId: null, creeLe: '2026-11-10T10:00:00Z', ...extra });
const nombreDe = (n, f) => Array.from({ length: n }, (_, k) => piste(`p${k}`, f(k)));
const recouvre = (a, b) => a.x < b.x + b.largeur && b.x < a.x + a.largeur && a.y < b.y + b.hauteur && b.y < a.y + a.hauteur;
const tousLesCadres = (carte) => [{ ...carte.centre, id: 'centre' }, ...carte.branches.flatMap((b) => [{ ...b.tete, id: `tete-${b.cle}` }, ...b.pistes])];

describe('regroupement par pilier', () => {
  const pistes = [piste('a', { pilier: 'pedagogie' }), piste('b', { pilier: 'cas_concrets' }), piste('c', { pilier: 'cas_concrets' }), piste('d'), piste('e', { pilier: 'pilier-inconnu' })];
  const carte = C.construireCarte({ source, pistes });
  test('une branche par pilier utilisé, dans l’ordre du module, puis « Sans pilier » ; une branche sans piste n’existe pas', () => {
    assert.deepEqual(carte.branches.map((b) => b.cle), [...R.PILIERS.map((p) => p.id).filter((id) => ['cas_concrets', 'pedagogie'].includes(id)), 'sans_pilier']);
    assert.deepEqual(carte.branches.map((b) => b.nombre), carte.branches.map((b) => ({ cas_concrets: 2, pedagogie: 1, sans_pilier: 2 })[b.cle]));
  });
  test('un pilier inconnu et une piste sans pilier vont dans « Sans pilier »', () => {
    const b = carte.branches.find((x) => x.cle === 'sans_pilier');
    assert.equal(b.libelle, 'Sans pilier');
    assert.deepEqual(b.pistes.map((p) => p.id).sort(), ['d', 'e']);
    assert.equal(b.pilier, null);
  });
  test('un ancien identifiant de pilier est converti (même branche que le nouveau)', () => {
    const [ancien] = Object.keys(R.ANCIENS_PILIERS);
    const c = C.construireCarte({ source, pistes: [piste('x', { pilier: ancien })] });
    assert.equal(c.branches[0].cle, R.ANCIENS_PILIERS[ancien]);
  });
  test('source sans piste : le centre seul, « vide »', () => {
    const c = C.construireCarte({ source, pistes: [] });
    assert.deepEqual([c.vide, c.total, c.branches.length, c.liens.length], [true, 0, 0, 0]);
    assert.equal(c.centre.texte, 'Site fictif');
  });
  test('toutes les pistes comptent, écartées comprises (marque « écartée »)', () => {
    const c = C.construireCarte({ source, pistes: [piste('a', { pilier: 'pedagogie' }), piste('b', { pilier: 'pedagogie', etat: 'ecartee' })] });
    assert.deepEqual(c.branches[0].pistes.map((p) => p.etat).sort(), ['ecartee', 'stock']);
  });
});

describe('marque d’état (la même que la liste)', () => {
  test('stock, retenue, en rédaction, postée, écartée, et une marque dessinée pour chacune', () => {
    const idees = [{ id: 'i1', etat: 'dans_buffer' }, { id: 'i2', etat: 'en_redaction' }];
    const pistes = [piste('a'), piste('b', { etat: 'retenue' }), piste('c', { etat: 'retenue', ideeId: 'i2' }), piste('d', { etat: 'retenue', ideeId: 'i1' }), piste('e', { etat: 'ecartee' })];
    const etats = Object.fromEntries(C.construireCarte({ source, pistes, idees }).branches[0].pistes.map((p) => [p.id, p.etat]));
    assert.deepEqual(etats, { a: 'stock', b: 'retenue', c: 'redaction', d: 'postee', e: 'ecartee' });
    assert.deepEqual(Object.keys(C.MARQUES_SVG).sort(), ['ecartee', 'postee', 'redaction', 'retenue', 'stock']);
    for (const marque of Object.values(C.MARQUES_SVG)) assert.ok(marque.length >= 1);
  });
});

describe('positions : stables, sans superposition', () => {
  const varie = nombreDe(25, (k) => ({ pilier: [...R.PILIERS.map((p) => p.id), null][k % (R.PILIERS.length + 1)] }));
  test('aucun cadre (centre, têtes, pistes) n’en recouvre un autre, tout est dans le dessin', () => {
    for (const pistes of [varie, nombreDe(1, () => ({})), nombreDe(30, () => ({ pilier: 'pedagogie' }))]) {
      const carte = C.construireCarte({ source, pistes });
      const cadres = tousLesCadres(carte);
      for (let i = 0; i < cadres.length; i++) {
        const c = cadres[i];
        assert.ok(c.x >= 0 && c.y >= 0 && c.x + c.largeur <= carte.largeur && c.y + c.hauteur <= carte.hauteur, `${c.id} sort du dessin`);
        for (let j = i + 1; j < cadres.length; j++) assert.ok(!recouvre(c, cadres[j]), `${c.id} recouvre ${cadres[j].id}`);
      }
    }
  });
  test('les mêmes données donnent les mêmes positions, quel que soit l’ordre d’arrivée des pistes', () => {
    const a = C.construireCarte({ source, pistes: varie });
    const b = C.construireCarte({ source, pistes: [...varie].reverse() });
    assert.deepEqual(a, b);
  });
  test('la branche se répartit des deux côtés du centre (équilibre), les pistes s’éloignent de la tête', () => {
    const carte = C.construireCarte({ source, pistes: varie });
    const cotes = new Set(carte.branches.map((b) => b.cote));
    assert.deepEqual([...cotes].sort(), ['droite', 'gauche']);
    for (const b of carte.branches) for (const p of b.pistes) {
      if (b.cote === 'gauche') assert.ok(p.x + p.largeur < b.tete.x && b.tete.x + b.tete.largeur < carte.centre.x);
      else assert.ok(p.x > b.tete.x + b.tete.largeur && b.tete.x > carte.centre.x + carte.centre.largeur);
    }
  });
  test('le centre est centré verticalement ; chaque piste a un lien, chaque branche un lien du centre', () => {
    const carte = C.construireCarte({ source, pistes: varie });
    assert.equal(carte.centre.y, Math.round((carte.hauteur - carte.centre.hauteur) / 2));
    assert.equal(carte.liens.length, carte.branches.length + carte.branches.reduce((n, b) => n + b.pistes.length, 0));
    for (const l of carte.liens) assert.match(l.d, /^M-?\d+ -?\d+ C/);
  });
  test('texte de la piste coupé à 40 caractères réels (jamais au milieu d’un emoji) ; l’angle complet reste disponible', () => {
    const long = `${'é'.repeat(38)}😀😀😀😀😀`;
    const [p] = C.construireCarte({ source, pistes: [piste('a', { angle: long })] }).branches[0].pistes;
    assert.equal(Array.from(p.texte).length, C.LONGUEUR_TEXTE);
    assert.ok(p.texte.endsWith('…'));
    assert.equal(p.angle, long);
    assert.doesNotMatch(p.texte, /[\uD800-\uDBFF]$/);
  });
});

describe('repli par branche', () => {
  const pistes = (n) => nombreDe(n, (k) => ({ pilier: k % 2 ? 'pedagogie' : 'cas_concrets' }));
  test('jusqu’à 30 pistes : branches ouvertes ; au-delà de 30 : toutes repliées avec leur nombre', () => {
    const ouvert = C.construireCarte({ source, pistes: pistes(30) });
    assert.ok(ouvert.branches.every((b) => !b.replie && b.pistes.length === b.nombre));
    const replie = C.construireCarte({ source, pistes: pistes(31) });
    assert.ok(replie.branches.every((b) => b.replie && b.pistes.length === 0));
    assert.deepEqual(replie.branches.map((b) => b.texte), replie.branches.map((b) => `${b.libelle} (${b.nombre})`));
  });
  test('300 pistes = branches repliées, une carte courte ; déplier une branche montre ses pistes seulement', () => {
    const toutes = pistes(300);
    const replie = C.construireCarte({ source, pistes: toutes });
    assert.equal(replie.total, 300);
    assert.ok(replie.branches.every((b) => b.replie));
    assert.ok(replie.hauteur < 400);
    const deplie = C.construireCarte({ source, pistes: toutes, inversees: new Set(['pedagogie']) });
    const parCle = Object.fromEntries(deplie.branches.map((b) => [b.cle, [b.replie, b.pistes.length]]));
    assert.deepEqual(parCle, { cas_concrets: [true, 0], pedagogie: [false, 150] });
    const cadres = tousLesCadres(deplie);
    for (let i = 0; i < cadres.length; i++) for (let j = i + 1; j < cadres.length; j++) assert.ok(!recouvre(cadres[i], cadres[j]));
  });
  test('cliquer une branche ouverte la replie (et inversement)', () => {
    const p = pistes(4);
    assert.equal(C.estReplie('pedagogie', 4, new Set()), false);
    assert.equal(C.estReplie('pedagogie', 4, new Set(['pedagogie'])), true);
    const c = C.construireCarte({ source, pistes: p, inversees: new Set(['pedagogie']) });
    const b = c.branches.find((x) => x.cle === 'pedagogie');
    assert.deepEqual([b.replie, b.pistes.length, b.texte], [true, 0, `${R.libellePilier('pedagogie')} (2)`]);
  });
});

describe('la carte ne modifie rien et reste sans bibliothèque', () => {
  test('les pistes passées ne sont pas modifiées', () => {
    const pistes = nombreDe(5, () => ({ pilier: 'pedagogie' }));
    const copie = JSON.stringify(pistes);
    C.construireCarte({ source, pistes, inversees: new Set(['pedagogie']) });
    assert.equal(JSON.stringify(pistes), copie);
  });
  test('aucune bibliothèque externe, aucun HTML injecté, aucun test de taille en dur dans le CSS', () => {
    const lire = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const f of ['js/modules/reseauxsociaux/carte-ecran.js', 'js/modules/reseauxsociaux/carte-logique.js']) {
      const code = lire(f);
      assert.doesNotMatch(code, /from\s+['"](?!\.)/, `${f} importe une bibliothèque`);
      assert.doesNotMatch(code, /innerHTML|insertAdjacentHTML|outerHTML/, `${f} pose du HTML`);
    }
    const css = lire('css/reseauxsociaux-carte.css');
    assert.doesNotMatch(css, /font-size:\s*\d|font-weight:\s*\d|font-weight:\s*(bold|bolder)/);
  });
});
