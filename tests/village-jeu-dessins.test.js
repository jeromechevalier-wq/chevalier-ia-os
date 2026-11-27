// Dessins du futur jeu du village (js/os/village-jeu-dessins.js, 27/11/2026) : enclos à cochons, champ en 4 étapes, 5 décorations. Sans réseau ni navigateur.
// Planche dans le navigateur : tests/e2e/village-jeu-dessins.spec.js (capture dans tests/e2e/captures/village-jeu-dessins/).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SORTES_JEU, ETAPES_CHAMP, ETATS_ENCLOS, DECORATIONS, DESSINS_JEU, IDS_JEU, dessinJeu, svgDessinJeu } from '../js/os/village-jeu-dessins.js';
import { BOITE_BATIMENT, T } from '../js/os/maison-village.js';

const ATTENDUS = ['enclos-cochons', 'enclos-cochons-gras', 'champ-seme', 'champ-pousse', 'champ-mur', 'champ-pret', 'arbre', 'fleurs', 'banc', 'cloture', 'brouette'];
const ROSE = '#F2A9A0';
const lire = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
/** Points d'une forme (même calcul que le test V6 : cercles et ellipses par leurs bords gauche et droit, plus le haut et le bas). */
function points(x) {
  if (x.poly) return x.poly;
  if (x.ligne) return x.ligne;
  const [cx, cy, rx, ry] = x.cercle ? [x.cercle[0], x.cercle[1], x.cercle[2], x.cercle[2]] : x.ellipse;
  return [[cx - rx, cy], [cx + rx, cy], [cx, cy - ry], [cx, cy + ry]];
}
const type = (x) => ['poly', 'cercle', 'ellipse', 'ligne'].filter((k) => k in x);
const plusHaut = (id) => Math.min(...dessinJeu(id).flatMap(points).map(([, y]) => y));

test('D1 le catalogue contient les 11 dessins dans l’ordre, chacun avec un nom, une sorte connue et un dessin ; étapes, états et décorations redonnent le catalogue', () => {
  assert.deepEqual([...IDS_JEU], ATTENDUS);
  assert.deepEqual(Object.keys(DESSINS_JEU), ATTENDUS);
  for (const id of IDS_JEU) {
    assert.match(id, /^[a-z][a-z-]*$/);
    const e = DESSINS_JEU[id];
    assert.ok(typeof e.nom === 'string' && e.nom.length > 2, id);
    assert.ok(SORTES_JEU.includes(e.sorte), id);
    assert.equal(typeof e.dessin, 'function', id);
  }
  assert.deepEqual([...ETATS_ENCLOS, ...ETAPES_CHAMP, ...DECORATIONS], [...IDS_JEU]);
  for (const id of ETATS_ENCLOS) assert.equal(DESSINS_JEU[id].sorte, 'enclos');
  for (const id of ETAPES_CHAMP) assert.equal(DESSINS_JEU[id].sorte, 'champ');
  for (const id of DECORATIONS) assert.equal(DESSINS_JEU[id].sorte, 'decoration');
  assert.ok(Object.isFrozen(DESSINS_JEU) && Object.isFrozen(IDS_JEU));
});

test('D2 chaque dessin se dessine sans erreur, dans la boîte d’un bâtiment ; enclos et champs dans l’empreinte 4 x 4, décorations dans 2 x 2', () => {
  for (const id of IDS_JEU) {
    const f = dessinJeu(id);
    assert.ok(f.length > 3, id);
    const demi = DESSINS_JEU[id].sorte === 'decoration' ? 2 * T + 12 : 4 * T + 12;
    for (const x of f) {
      assert.equal(type(x).length, 1, `${id} : une forme d’un seul type`);
      for (const [px, py] of points(x)) {
        assert.ok(Number.isFinite(px) && Number.isFinite(py), id);
        assert.ok(px > BOITE_BATIMENT.gauche && px < BOITE_BATIMENT.droite && py > BOITE_BATIMENT.haut && py < BOITE_BATIMENT.bas, `${id} : ${px}, ${py}`);
        assert.ok(Math.abs(px) <= demi, `${id} déborde de son empreinte : ${px}`);
      }
    }
  }
});

test('D3 le SVG en texte : une balise par forme, le bon cadre, rien de dangereux ; identifiant inconnu : liste vide et texte vide', () => {
  for (const id of IDS_JEU) {
    const s = svgDessinJeu(id);
    assert.ok(s.startsWith('<svg '), id);
    assert.ok(s.endsWith('</svg>'), id);
    assert.ok(s.includes('viewBox="-100 -150 200 200"'), id);
    assert.ok(s.includes(`aria-label="${DESSINS_JEU[id].nom}"`), id);
    assert.equal((s.match(/<(polygon|circle|ellipse|line)\b/g) || []).length, dessinJeu(id).length, id);
    assert.ok(!/<script|<text|<foreignObject|href|style=|\son\w+=/i.test(s), id);
  }
  for (const inconnu of ['inconnu', 'toString', '__proto__', 'constructor', undefined, null, 42, '']) {
    assert.deepEqual(dessinJeu(inconnu), [], String(inconnu));
    assert.equal(svgDessinJeu(inconnu), '', String(inconnu));
  }
});

test('D4 style de la charte : couleurs #RRGGBB sans noir pur, une seule ombre par dessin, même dessin à chaque appel (nouvelle liste)', () => {
  for (const id of IDS_JEU) {
    const f = dessinJeu(id);
    for (const x of f) {
      for (const c of [x.fill, x.trait].filter((v) => v !== undefined)) {
        assert.ok(c === 'none' || /^#[0-9A-Fa-f]{6}$/.test(c), `${id} : ${c}`);
        assert.notEqual(c.toUpperCase(), '#000000', id);
      }
    }
    assert.equal(f.filter((x) => x.fill === '#3b2412' && x.opacite === 0.14).length, 1, `${id} : une seule ombre`);
    const g = dessinJeu(id);
    assert.deepEqual(g, f, id);
    assert.notEqual(g, f, id);
  }
});

test('D5 les états se distinguent : le champ pousse de semé à mûr (4 étapes différentes) ; les cochons bien gras sont nettement plus gros', () => {
  const svgs = ETAPES_CHAMP.map(svgDessinJeu);
  assert.equal(new Set(svgs).size, 4);
  const [seme, pousse, mur] = ETAPES_CHAMP.map(plusHaut);
  assert.ok(pousse < seme, `pousse ${pousse} / semé ${seme}`);
  assert.ok(mur < pousse, `mûr ${mur} / pousse ${pousse}`);
  assert.notDeepEqual(dessinJeu('enclos-cochons-gras'), dessinJeu('enclos-cochons'));
  const surfaceRose = (id) => dessinJeu(id).filter((x) => x.ellipse && x.fill === ROSE).reduce((s, x) => s + x.ellipse[2] * x.ellipse[3], 0);
  assert.ok(surfaceRose('enclos-cochons') > 0);
  assert.ok(surfaceRose('enclos-cochons-gras') >= 1.5 * surfaceRose('enclos-cochons'), `${surfaceRose('enclos-cochons-gras')} / ${surfaceRose('enclos-cochons')}`);
});

test('D6 rien n’est branché : le fichier n’utilise pas le DOM, et aucun autre fichier de js/ ne l’importe', () => {
  const code = lire('js/os/village-jeu-dessins.js').replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, ''); // sans les commentaires
  assert.ok(!/\bdocument\b|\bwindow\b|innerHTML/.test(code));
  const racine = fileURLToPath(new URL('../js/', import.meta.url));
  const fichiers = [];
  const parcourir = (d) => { for (const n of readdirSync(d)) { const p = join(d, n); if (statSync(p).isDirectory()) parcourir(p); else fichiers.push(p); } };
  parcourir(racine);
  assert.ok(fichiers.some((p) => p.endsWith('village-jeu-dessins.js')));
  for (const p of fichiers) {
    if (p.endsWith(join('os', 'village-jeu-dessins.js'))) continue;
    assert.ok(!readFileSync(p, 'utf8').includes('village-jeu-dessins'), p);
  }
});
