// Pilotage : lignes pointillées de plafond et arbre des coûts, côté navigateur (fonctions pures). Données fictives, 100 € de base.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { appliquerReperes } from '../js/modules/pilotage/reperes.js';
import { construireArbre, optionArbre, ENFANTS_MAX, VIDE } from '../js/modules/pilotage/arbre.js';
import { lireReponse, cartes, optionFinale } from '../js/modules/pilotage/logique.js';

const COULEURS = { bon: '#0a0', attention: '#fa0', mauvais: '#d00', neutre: '#888' };

describe('P1 repères : lignes pointillées', () => {
  const option = () => ({ xAxis: { type: 'category' }, yAxis: { type: 'value' }, series: [{ type: 'bar', encode: { x: 'cle', y: 'part' } }] });
  test('P1.1 chaque repère devient une ligne pointillée horizontale (axe y par défaut) sur la première série', () => {
    const o = appliquerReperes(option(), [{ valeur: 80, libelle: '80 %', couleur: 'attention' }, { valeur: 100, libelle: 'Plafond', couleur: 'mauvais' }]);
    const m = o.series[0].markLine;
    assert.equal(m.data.length, 2);
    assert.deepEqual(m.data.map((d) => d.yAxis), [80, 100]);
    assert.ok(m.data.every((d) => d.lineStyle.type === 'dashed'));
    assert.equal(m.data[0].lineStyle.color, '@attention');
    assert.equal(m.data[1].label.formatter, 'Plafond');
    assert.equal(m.silent, true);
  });
  test('P1.2 axe « x » = ligne verticale ; sans couleur ni libellé : gris neutre et pas d\'étiquette', () => {
    const d = appliquerReperes(option(), [{ valeur: 50, axe: 'x' }]).series[0].markLine.data[0];
    assert.equal(d.xAxis, 50);
    assert.equal(d.yAxis, undefined);
    assert.equal(d.lineStyle.color, '@neutre');
    assert.equal(d.label.show, false);
  });
  test('P1.3 l\'option reçue n\'est pas modifiée ; une ligne existante est conservée ; rien à faire sans série ou sans repère valide', () => {
    const base = option();
    base.series[0].markLine = { data: [{ yAxis: 10 }] };
    const copie = JSON.stringify(base);
    const o = appliquerReperes(base, [{ valeur: 90 }]);
    assert.equal(JSON.stringify(base), copie);
    assert.equal(o.series[0].markLine.data.length, 2);
    assert.deepEqual(appliquerReperes({ xAxis: {} }, [{ valeur: 1 }]), { xAxis: {} });
    assert.equal(appliquerReperes(option(), [{ valeur: 'x' }, null]).series[0].markLine, undefined);
  });
  test('P1.4 après l\'habillage : les couleurs nommées sont résolues et les lignes restent pointillées', () => {
    const final = optionFinale(appliquerReperes(option(), [{ valeur: 100, couleur: 'mauvais' }]), [{ cle: 'a', part: 50 }], { couleurs: COULEURS });
    const d = final.series[0].markLine.data[0];
    assert.equal(d.lineStyle.color, '#d00');
    assert.equal(d.lineStyle.type, 'dashed');
    assert.deepEqual(final.dataset.source, [{ cle: 'a', part: 50 }]);
  });
  test('P1.5 la réponse du serveur : les repères sont lus (objets seulement) ; absents = comme avant', () => {
    const r = lireReponse({ tuiles: [{ id: 'g', titre: 'G', option: {}, lignes: [{ a: 1 }], reperes: [{ valeur: 100 }, 'x'] }, { id: 'h', titre: 'H', option: {}, lignes: [{ a: 1 }] }] });
    assert.deepEqual(r.tuiles[0].reperes, [{ valeur: 100 }]);
    assert.equal('reperes' in r.tuiles[1], false);
  });
});

describe('P2 arbre : à qui, puis où, puis module', () => {
  const LIGNES = [
    { a_qui: 'interne', ou: 'os', module: 'devis', cout: 40 },
    { a_qui: 'interne', ou: 'os', module: 'projets', cout: 10 },
    { a_qui: 'interne', ou: 'app', module: 'devis', cout: 20 },
    { a_qui: 'client-a', ou: 'plateforme', module: 'devis', cout: '100' },
    { a_qui: 'client-a', ou: 'plateforme', module: 'devis', cout: 5 },
    { a_qui: null, ou: 'os', module: '', cout: 1 },
  ];
  test('P2.1 la hiérarchie est bâtie niveau par niveau ; la valeur d\'un nœud est la somme de ses enfants ; les plus chers d\'abord', () => {
    const { total, racines } = construireArbre(LIGNES, ['a_qui', 'ou', 'module'], 'cout');
    assert.equal(total, 176);
    assert.deepEqual(racines.map((n) => [n.name, n.value]), [['client-a', 105], ['interne', 70], [VIDE, 1]]);
    const interne = racines.find((n) => n.name === 'interne');
    assert.deepEqual(interne.children.map((n) => [n.name, n.value]), [['os', 50], ['app', 20]]);
    assert.deepEqual(interne.children[0].children.map((n) => [n.name, n.value]), [['devis', 40], ['projets', 10]]);
    assert.equal(interne.children[0].children[0].children, undefined);
  });
  test('P2.2 pas de vue inverse : il n\'y a qu\'une seule hiérarchie, dans l\'ordre donné', () => {
    const { racines } = construireArbre(LIGNES, ['module', 'a_qui'], 'cout');
    assert.deepEqual(racines.map((n) => n.name).sort(), [VIDE, 'devis', 'projets']);
  });
  test('P2.3 valeurs illisibles = 0 ; lignes absentes ou mal formées ignorées ; au-delà de 30 enfants, « Autres (n) » garde la somme', () => {
    assert.deepEqual(construireArbre(null, ['a'], 'v'), { total: 0, racines: [] });
    assert.equal(construireArbre([{ a: 'x', v: 'abc' }, null, 5, { a: 'y', v: NaN }], ['a'], 'v').total, 0);
    const beaucoup = Array.from({ length: 40 }, (_, i) => ({ a: `n${String(i).padStart(2, '0')}`, v: 100 - i }));
    const { total, racines } = construireArbre(beaucoup, ['a'], 'v');
    assert.equal(racines.length, ENFANTS_MAX);
    assert.equal(racines.at(-1).name, 'Autres (11)');
    assert.equal(racines.reduce((s, n) => s + n.value, 0), total);
  });
  test('P2.4 l\'option ECharts : une série « tree », premier niveau ouvert, clic pour ouvrir ; textes fabriqués en texte ; l\'entrée n\'est pas modifiée', () => {
    const tuile = { valeur: { colonne: 'cout', format: 'euros2' }, niveaux: ['a_qui', 'ou', 'module'], racine: 'Tout', lignes: LIGNES };
    const copie = JSON.stringify(tuile);
    const o = optionArbre(tuile, { couleurs: COULEURS });
    assert.equal(JSON.stringify(tuile), copie);
    const s = o.series[0];
    assert.equal(s.type, 'tree');
    assert.equal(s.initialTreeDepth, 1);
    assert.equal(s.expandAndCollapse, true);
    assert.equal(s.data.length, 1);
    assert.equal(s.data[0].name, 'Tout');
    assert.match(s.data[0].texteValeur, /^176,00\s€$/);
    assert.equal(s.data[0].children[0].name, 'client-a');
    assert.equal(s.lineStyle.color, '#888');
    assert.equal(s.label.formatter({ data: s.data[0].children[0] }), `client-a · ${s.data[0].children[0].texteValeur}`);
    assert.equal(o.tooltip.formatter({ data: { name: '<b>x</b>', texteValeur: '1' } }), '<b>x</b> : 1'); // texte brut : renderMode richText, jamais interprété comme HTML
  });
  test('P2.5 racine par défaut « Total » ; arbre vide = une racine à 0', () => {
    const o = optionArbre({ valeur: { colonne: 'c' }, niveaux: ['a'], lignes: [] });
    assert.equal(o.series[0].data[0].name, 'Total');
    assert.equal(o.series[0].data[0].value, 0);
    assert.equal(o.series[0].data[0].children, undefined);
  });
  test('P2.6 la réponse du serveur : le type « arbre » est reconnu (niveaux, racine) ; une tuile sans ligne est « vide »', () => {
    const r = lireReponse({ tuiles: [
      { id: 'a', type: 'arbre', titre: 'A', valeur: { colonne: 'cout', format: 'euros2' }, niveaux: ['a_qui', 7, 'ou'], racine: 'Tout', limite: 500, lignes: LIGNES },
      { id: 'b', type: 'arbre', titre: 'B', valeur: { colonne: 'cout' }, niveaux: ['a_qui'], lignes: [] },
    ] });
    assert.equal(r.tuiles[0].type, 'arbre');
    assert.deepEqual(r.tuiles[0].niveaux, ['a_qui', 'ou']);
    assert.equal(r.tuiles[0].largeur, 'pleine');
    assert.deepEqual(cartes(r).map((c) => c.genre), ['arbre', 'vide']);
  });
});
