// Module Pilotage (23/11/2026) : règles pures (injection des lignes, habillage non destructif, lecture de la réponse, messages d'erreur) et contrôles statiques du module.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import * as L from '../js/modules/pilotage/logique.js';
import { MODULES_DECLARES } from '../js/os/registre.js';

const RACINE = fileURLToPath(new URL('../', import.meta.url));
const lire = (c) => readFileSync(`${RACINE}${c}`, 'utf8');
const LIGNES = [{ mois: 'jan', total: 100 }, { mois: 'fev', total: 200 }];

describe('P10 injection des lignes dans option.dataset', () => {
  test('P10 dataset objet : source = lignes, les autres champs du dataset sont gardés', () => {
    const o = L.injecterLignes({ dataset: { dimensions: ['mois', 'total'] }, series: [{ type: 'bar', encode: { x: 'mois', y: 'total' } }] }, LIGNES);
    assert.deepEqual(o.dataset.source, LIGNES);
    assert.deepEqual(o.dataset.dimensions, ['mois', 'total']);
    assert.deepEqual(o.series, [{ type: 'bar', encode: { x: 'mois', y: 'total' } }]);
  });
  test('P10 dataset tableau : seul le premier reçoit les lignes ; le transform (fromDatasetIndex) est intact', () => {
    const o = L.injecterLignes({ dataset: [{ id: 'brut' }, { fromDatasetId: 'brut', transform: { type: 'filter', config: { dimension: 'total', gte: 150 } } }] }, LIGNES);
    assert.deepEqual(o.dataset[0], { id: 'brut', source: LIGNES });
    assert.equal(o.dataset[1].source, undefined);
    assert.equal(o.dataset[1].transform.type, 'filter');
    assert.equal(o.dataset.length, 2);
  });
  test('P10 sans dataset (ou option absente) : dataset { source } ajouté', () => {
    assert.deepEqual(L.injecterLignes({ series: [] }, LIGNES).dataset, { source: LIGNES });
    assert.deepEqual(L.injecterLignes(undefined, LIGNES), { dataset: { source: LIGNES } });
    assert.deepEqual(L.injecterLignes({ dataset: [] }, LIGNES).dataset, { source: LIGNES });
  });
  test('P10 l\'option reçue et les lignes ne sont jamais modifiées ni partagées avec la sortie', () => {
    const option = { dataset: [{ id: 'a' }], series: [{ type: 'bar' }] };
    const avant = JSON.stringify(option);
    const lignes = [{ x: 1 }];
    const sortie = L.injecterLignes(option, lignes);
    assert.equal(JSON.stringify(option), avant);
    sortie.dataset[0].source[0].x = 99;
    assert.equal(lignes[0].x, 1);
    const objet = { dataset: { source: [] } };
    L.injecterLignes(objet, LIGNES);
    assert.deepEqual(objet.dataset.source, []);
  });
});

describe('habillage non destructif', () => {
  test('l\'option du réglage gagne ; l\'habillage ne fournit que les valeurs absentes', () => {
    const o = L.optionFinale({ animationDuration: 1000, tooltip: { confine: false, trigger: 'axis' }, series: [] }, LIGNES);
    assert.equal(o.animationDuration, 1000);
    assert.equal(o.animationDurationUpdate, 200);
    assert.equal(o.tooltip.confine, false);
    assert.equal(o.tooltip.trigger, 'axis');
    assert.deepEqual(o.aria, { enabled: true });
  });
  test('l\'infobulle est toujours en mode texte, même si le réglage demande autre chose (jamais de HTML venu des données)', () => {
    assert.equal(L.optionFinale({ tooltip: { renderMode: 'html' } }, LIGNES).tooltip.renderMode, 'richText');
    assert.deepEqual(L.optionFinale({ tooltip: [{ renderMode: 'html' }, {}] }, LIGNES).tooltip.map((t) => t.renderMode), ['richText', 'richText']);
    assert.equal(L.optionFinale({}, LIGNES).tooltip.renderMode, 'richText');
  });
  test('un tableau du réglage remplace celui de la base ; rien n\'est modifié (base figée, entrée intacte)', () => {
    const base = { a: [1, 2], b: { c: 1 } };
    const surcharge = { a: [3], b: { d: 2 } };
    const f = L.fusionner(base, surcharge);
    assert.deepEqual(f, { a: [3], b: { c: 1, d: 2 } });
    assert.deepEqual(base, { a: [1, 2], b: { c: 1 } });
    assert.deepEqual(surcharge, { a: [3], b: { d: 2 } });
    assert.throws(() => { 'use strict'; L.BASE_HABILLAGE.animationDuration = 1; }, TypeError);
    const entree = { tooltip: { trigger: 'item' } };
    L.optionFinale(entree, LIGNES);
    assert.deepEqual(entree, { tooltip: { trigger: 'item' } });
  });
  test('le thème est construit des valeurs lues (jamais de couleur écrite en dur)', () => {
    const t = L.construireTheme({ texte: '#111', texte2: '#222', trait: '#333', traitFort: '#444', palette: ['#a', '#b'], police: 'Test', taille: 12 });
    assert.deepEqual(t.color, ['#a', '#b']);
    assert.equal(t.textStyle.color, '#111');
    assert.equal(t.valueAxis.splitLine.lineStyle.color, '#333');
    assert.equal(t.categoryAxis.axisLabel.color, '#222');
    assert.equal(t.backgroundColor, 'transparent');
    const source = lire('js/modules/pilotage/logique.js');
    assert.doesNotMatch(source, /#[0-9a-f]{3,8}\b/i, 'aucune couleur en dur dans logique.js');
  });
});

describe('réponse du serveur', () => {
  test('cas vide : aucun tableau réglé', () => {
    assert.deepEqual(L.lireReponse({ titre: '', tuiles: [], erreurs: [] }), { titre: '', tuiles: [], erreurs: [], vide: true });
    assert.equal(L.lireReponse(undefined).vide, true);
    assert.equal(L.lireReponse('n\'importe quoi').vide, true);
  });
  test('une réponse partielle est tolérée (champs manquants ou de mauvais type)', () => {
    const r = L.lireReponse({ titre: 3, tuiles: [{ titre: 'T', lignes: 'x', option: [] }, 'bof', null], erreurs: [{ id: 'z', message: 5 }] });
    assert.equal(r.titre, '');
    assert.deepEqual(r.tuiles, [{ id: 'tuile-1', titre: 'T', option: {}, lignes: [], lignesInvalides: true }]);
    assert.deepEqual(r.erreurs, [{ id: 'z', message: '' }]);
    assert.equal(r.vide, false);
  });
  test('cartes : une tuile sans ligne est « vide », une erreur prend la place de sa tuile, une erreur seule garde son identifiant comme titre', () => {
    const r = L.lireReponse({ titre: 'Chiffres', tuiles: [{ id: 'a', titre: 'A', lignes: LIGNES }, { id: 'b', titre: 'B', lignes: [] }, { id: 'c', titre: 'C', lignes: LIGNES }], erreurs: [{ id: 'c', message: 'x' }, { id: 'd', message: 'y' }] });
    assert.deepEqual(L.cartes(r).map((c) => [c.id, c.titre, c.genre]), [['a', 'A', 'graphique'], ['b', 'B', 'vide'], ['c', 'C', 'erreur'], ['d', 'd', 'erreur']]);
    assert.equal(L.titreDePage(r), 'Chiffres');
    assert.equal(L.titreDePage({ titre: '' }), 'Pilotage');
  });
});

describe('messages d\'erreur d\'appel', () => {
  test('fonction absente (seulement not-found et unimplemented, avec ou sans préfixe) : « pas encore branché »', () => {
    for (const e of [{ code: 'functions/not-found', message: 'NOT_FOUND' }, { code: 'not-found' }, { code: 'unimplemented', message: 'x' }, { code: 'functions/unimplemented' }]) {
      assert.deepEqual(L.classerErreurAppel(e), { nonBranche: true, message: 'Le Pilotage n\'est pas encore branché sur cet espace.' }, JSON.stringify(e));
    }
  });
  test('une vraie panne n\'est JAMAIS dite « pas encore branché » : le vrai INTERNAL du SDK, unavailable, deadline-exceeded, réseau', () => {
    for (const e of [{ code: 'functions/internal', message: 'INTERNAL' }, { code: 'functions/internal', message: 'internal' }, { code: 'functions/internal', message: '' }, { code: 'functions/unavailable', message: 'x' }, { code: 'functions/deadline-exceeded', message: 'x' }, { message: 'Failed to fetch' }, {}, undefined]) {
      assert.deepEqual(L.classerErreurAppel(e), { nonBranche: false, message: 'Ça n\'a pas abouti. Réessaie dans un instant.' }, JSON.stringify(e));
    }
    assert.doesNotMatch(L.messageErreurExport({ code: 'functions/internal', message: 'INTERNAL' }), /branché/);
  });
  test('compte refusé et panne du serveur : messages lisibles, jamais le détail technique', () => {
    const refus = L.classerErreurAppel({ code: 'functions/permission-denied', message: 'detail secret' });
    assert.equal(refus.nonBranche, false);
    assert.match(refus.message, /n'a pas accès/);
    const panne = L.classerErreurAppel({ code: 'functions/internal', message: 'La base a plante : mot de passe x' });
    assert.doesNotMatch(JSON.stringify(panne), /mot de passe/);
  });
  test('export refusé : message pour un compte non administrateur ; fonction absente : pas encore branché ; panne : réessaie', () => {
    assert.match(L.messageErreurExport({ code: 'functions/permission-denied', message: 'x' }), /administrateur/);
    assert.match(L.messageErreurExport({ code: 'functions/not-found' }), /pas encore branché/);
    assert.match(L.messageErreurExport({ code: 'functions/unavailable', message: 'x' }), /réessaie/);
  });
});

describe('défense en profondeur sur l\'option reçue', () => {
  test('retire récursivement link, sublink, toolbox, graphic de type image, backgroundColor et symbol qui sont des adresses', () => {
    const option = {
      title: { text: 'T', link: 'https://exemple.test/x', sublink: 'https://exemple.test/y', backgroundColor: 'image://data:abc' },
      toolbox: { feature: { saveAsImage: {} } },
      graphic: { elements: [{ type: 'image', style: { image: 'https://exemple.test/i.png' } }, { type: 'text', style: { text: 'ok' } }] },
      series: [{ type: 'scatter', symbol: 'image://x.png', data: [{ symbol: 'https://exemple.test/s.png', value: 1, label: { link: 'x' } }, { symbol: 'circle', value: 2 }] }, { type: 'bar', symbol: 'circle', backgroundColor: '#fff' }],
    };
    const avant = JSON.stringify(option);
    const n = L.nettoyerOption(option);
    assert.equal(JSON.stringify(option), avant, 'l\'entrée n\'est pas modifiée');
    assert.deepEqual(n.title, { text: 'T' });
    assert.equal(n.toolbox, undefined);
    assert.deepEqual(n.graphic.elements, [{ type: 'text', style: { text: 'ok' } }]);
    assert.equal(n.series[0].symbol, undefined);
    assert.deepEqual(n.series[0].data, [{ value: 1, label: {} }, { symbol: 'circle', value: 2 }]);
    assert.deepEqual(n.series[1], { type: 'bar', symbol: 'circle', backgroundColor: '#fff' });
    assert.equal(L.optionFinale(option, []).title.link, undefined);
  });
});

describe('nettoyage : lignes intactes, cas supplémentaires', () => {
  test('une colonne nommée link (valeur https://…) ou symbol reste dans les lignes : seul l\'option est nettoyée', () => {
    const lignes = [{ mois: 'Janv.', link: 'https://exemple.test/a', symbol: 'image://x', toolbox: 1, montant: 100 }];
    const o = L.optionFinale({ title: { link: 'https://exemple.test/b' }, series: [{ type: 'bar' }] }, lignes);
    assert.deepEqual(o.dataset.source, lignes);
    assert.equal(o.title.link, undefined);
  });
  test('graphic en objet seul de type image, motifs d\'image en backgroundColor ou color, icônes image://, axisPointer.link conservé', () => {
    const n = L.nettoyerOption({
      graphic: { type: 'image', style: { image: 'x' } },
      backgroundColor: { image: 'https://exemple.test/p.png', repeat: 'repeat' },
      color: ['#111', { image: 'https://exemple.test/p.png' }, '#222'],
      legend: { icon: 'image://x.png', selectorIcon: 'circle' },
      dataZoom: [{ handleIcon: 'image://h.png' }],
      axisPointer: { link: [{ xAxisIndex: 'all' }] },
      title: { link: 'https://exemple.test/b' },
    });
    assert.equal(n.graphic, undefined);
    assert.equal(n.backgroundColor, undefined);
    assert.deepEqual(n.color, ['#111', '#222']);
    assert.deepEqual(n.legend, { selectorIcon: 'circle' });
    assert.deepEqual(n.dataZoom, [{}]);
    assert.deepEqual(n.axisPointer, { link: [{ xAxisIndex: 'all' }] });
    assert.deepEqual(n.title, {});
    assert.equal(L.nettoyerOption({ legend: { selectorIcon: 'image://z.png' } }).legend.selectorIcon, undefined);
  });
});

describe('lignes qui ne sont pas des objets', () => {
  test('la tuile est « invalide » (jamais jetée en silence) ; les lignes valides restent « graphique »', () => {
    const r = L.lireReponse({ tuiles: [{ id: 'a', lignes: [{ x: 1 }, 5] }, { id: 'b', lignes: 'oups' }, { id: 'c', lignes: [{ x: 1 }] }, { id: 'd' }] });
    assert.deepEqual(L.cartes(r).map((c) => [c.id, c.genre]), [['a', 'invalide'], ['b', 'invalide'], ['c', 'graphique'], ['d', 'vide']]);
  });
});

describe('Réglages > Déploiement', () => {
  test('le module déclare une étape « absent chez les clients » qui n\'existe que si le module est actif', async () => {
    const { ETAPES_DEPLOIEMENT_PILOTAGE: e } = await import('../js/modules/pilotage/deploiement.js');
    assert.equal(e.length, 1);
    assert.equal(e[0].module, 'pilotage');
    assert.match(e[0].reparation, /Absent chez les clients/);
    assert.match(lire('js/modules/pilotage/index.js'), /export function controlesDeploiement/);
  });
});

describe('contrôles statiques du module', () => {
  test('le registre déclare Pilotage : un écran, autonome, sans outil MCP, icône connue', () => {
    const m = MODULES_DECLARES.find((x) => x.id === 'pilotage');
    assert.equal(m.libelleMenu, 'Pilotage');
    assert.equal(m.entreeMenu, 'pilotage/pilotage');
    assert.equal(m.ecrans.length, 1);
    assert.deepEqual(m.dependances, []);
    assert.deepEqual(m.outilsMcp, []);
    assert.ok(!m.socle);
    assert.match(lire('js/os/ui.js'), /"chart-column":/);
  });
  test('ECharts n\'est jamais importé statiquement (ni dans index.js ni ailleurs) : seulement par import() dans l\'écran', () => {
    for (const f of ['index.js', 'donnees.js', 'logique.js', 'habillage.js', 'export.js']) assert.doesNotMatch(lire(`js/modules/pilotage/${f}`), /echarts\.esm|vendor\/echarts/, f);
    assert.match(lire('js/modules/pilotage/ecran.js'), /=> import\('\.\.\/\.\.\/\.\.\/assets\/vendor\/echarts\/echarts\.esm\.min\.js'\)/);
    assert.doesNotMatch(lire('js/modules/pilotage/ecran.js'), /^import .*echarts/m);
  });
  test('le navigateur ne lit ni n\'écrit Firestore pour ce module (aucun onSnapshot, getDocs, setDoc, executer)', () => {
    for (const f of ['index.js', 'donnees.js', 'ecran.js', 'export.js', 'habillage.js']) assert.doesNotMatch(lire(`js/modules/pilotage/${f}`), /firebase-firestore|onSnapshot|getDocs|setDoc|updateDoc|executer\(/, f);
  });
  test('l\'option reçue n\'est jamais exécutée comme du code', () => {
    for (const f of ['ecran.js', 'logique.js', 'habillage.js', 'donnees.js']) assert.doesNotMatch(lire(`js/modules/pilotage/${f}`), /\beval\s*\(|new Function|innerHTML/, f);
  });
  test('css/pilotage.css : aucune taille de texte ni poids en dur', () => {
    assert.doesNotMatch(lire('css/pilotage.css'), /font-size:\s*\d|font-weight:\s*\d/);
  });
});
