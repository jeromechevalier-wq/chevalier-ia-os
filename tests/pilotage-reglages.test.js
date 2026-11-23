// Module Pilotage : validation du réglage, de l'option ECharts, visibilité des tuiles, texte SQL (functions/src/pilotage/reglages.js). Logique pure, aucun réseau.
// Noms fictifs partout (v_exemple, colonnes inventées, adresses @example.test).
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { validerReglages, analyserOption, tuileVisible, construireSql, ErreurPilotage, OPTION_MAX, TUILES_MAX } from '../functions/src/pilotage/reglages.js';

const OPTION = JSON.stringify({ xAxis: { type: 'category' }, yAxis: { type: 'value' }, series: [{ type: 'bar', encode: { x: 'mois', y: 'total' } }] });
const tuile = (en = {}) => ({ id: 't1', titre: 'Ventes', vue: 'v_exemple', option: OPTION, ...en });
const reglage = (tuiles = [tuile()], groupes = {}) => ({ groupes, tableau: { titre: 'Tableau', tuiles } });
const refus = (fn, motif) => assert.throws(fn, (e) => e instanceof ErreurPilotage && e.code === 'invalid-argument' && (!motif || motif.test(e.message)));

describe('1 validation du réglage', () => {
  test('1.1 un réglage correct est accepté et normalisé (adresses en minuscules, limite et tri gardés)', () => {
    const r = validerReglages(reglage([tuile({ tri: { colonne: 'mois', sens: 'asc' }, limite: 100, visiblePour: ['Chef@Example.test', 'equipe'] })], { equipe: ['A@Example.test'] }));
    assert.deepEqual(r.tableau.tuiles[0].visiblePour, ['chef@example.test', 'equipe']);
    assert.deepEqual(r.groupes, { equipe: ['a@example.test'] });
    assert.equal(r.tableau.tuiles[0].limite, 100);
    assert.equal(typeof r.tableau.tuiles[0].option, 'string'); // l'option reste une chaîne
  });
  test('1.2 motif de vue : injection, schéma système, majuscules, espaces, absence : refusés', () => {
    for (const vue of ['v_x; drop table x', 'pg_catalog.pg_user', 'V_Exemple', 'v exemple', 'v_', '', 'exemple', 'v_é', 'v_x"y', undefined, 12]) {
      refus(() => validerReglages(reglage([tuile({ vue })])), /nom de la vue/);
    }
  });
  test('1.3 colonne de tri : motif strict ; sens asc ou desc seulement', () => {
    for (const colonne of ['mois"; drop', '1mois', 'Mois', 'a b', 'x.y', '']) refus(() => validerReglages(reglage([tuile({ tri: { colonne, sens: 'asc' } })])), /colonne de tri/);
    refus(() => validerReglages(reglage([tuile({ tri: { colonne: 'mois', sens: 'ASC' } })])), /sens/);
    refus(() => validerReglages(reglage([tuile({ tri: 'mois' })])), /tri/);
  });
  test('1.4 identifiant : motif et unicité ; titre obligatoire', () => {
    refus(() => validerReglages(reglage([tuile({ id: 'Grand' })])), /identifiant/);
    refus(() => validerReglages(reglage([tuile({ id: 'a'.repeat(41) })])), /identifiant/);
    refus(() => validerReglages(reglage([tuile({ id: 'a' }), tuile({ id: 'a' })])), /déjà pris/);
    refus(() => validerReglages(reglage([tuile({ titre: '  ' })])), /titre/);
  });
  test('1.5 limite : entier de 1 à 500 ; trop de tuiles ; structure absente', () => {
    for (const limite of [0, 501, 1.5, '10']) refus(() => validerReglages(reglage([tuile({ limite })])), /limite/);
    refus(() => validerReglages(reglage(Array.from({ length: TUILES_MAX + 1 }, (_, i) => tuile({ id: `t${i}` })))), /Trop de tuiles/);
    refus(() => validerReglages(null), /vide/);
    refus(() => validerReglages({ groupes: {} }), /tableau/);
  });
  test('1.6 visiblePour : valeur ni adresse ni groupe refusée ; groupes : adresse invalide refusée', () => {
    refus(() => validerReglages(reglage([tuile({ visiblePour: ['Pas Valable!'] })])), /visiblePour/);
    refus(() => validerReglages(reglage([tuile({ visiblePour: 'tous' })])), /visiblePour/);
    refus(() => validerReglages(reglage([], { equipe: ['pas-une-adresse'] })), /adresse e-mail invalide/);
    refus(() => validerReglages(reglage([], { 'Grand Nom': [] })), /Nom de groupe/);
  });
});

describe('2 option ECharts', () => {
  test('2.1 une option correcte est rendue en objet', () => {
    assert.deepEqual(analyserOption(OPTION).series[0].type, 'bar');
  });
  test('2.2 adresses web, image externe, javascript: et data: refusés, même cachés profond ou en majuscules', () => {
    for (const s of ['http://exemple.test/x', 'HTTPS://exemple.test', 'image://exemple', 'javascript:alert(1)', 'data:text/html;base64,AAAA']) {
      refus(() => analyserOption(JSON.stringify({ series: [{ type: 'pie', label: { formatter: `a ${s} b` } }] })), /refusé/);
      refus(() => analyserOption(JSON.stringify({ title: { text: s } })), /refusé/);
    }
    refus(() => analyserOption(JSON.stringify({ series: [{ 'https://x': 1 }] })), /refusé/); // aussi dans une clé
  });
  test('2.3 trop gros, JSON invalide, pas un objet, vide : refusés', () => {
    refus(() => analyserOption(JSON.stringify({ title: { text: 'x'.repeat(OPTION_MAX) } })), /trop longue/);
    refus(() => analyserOption('{ pas du json'), /JSON valide/);
    refus(() => analyserOption('{"formatter": function(){}}'), /JSON valide/);
    refus(() => analyserOption('[1,2]'), /objet/);
    refus(() => analyserOption('"texte"'), /objet/);
    refus(() => analyserOption(''), /vide/);
    refus(() => analyserOption(undefined), /vide/);
  });
  test('2.4 clé de haut niveau inconnue refusée ; clé dangereuse refusée à tout niveau ; imbrication bornée', () => {
    refus(() => analyserOption('{"serie": []}'), /inconnue|connue/);
    refus(() => analyserOption('{"__proto__": {"x": 1}}'), /refusée/);
    refus(() => analyserOption('{"title": {"constructor": 1}}'), /refusée/);
    let profond = '1';
    for (let i = 0; i < 20; i += 1) profond = `{"a":${profond}}`;
    refus(() => analyserOption(`{"title": ${profond}}`), /niveaux/);
  });
  test('2.5 l\'option invalide d\'une tuile fait refuser tout le réglage, en nommant la tuile', () => {
    refus(() => validerReglages(reglage([tuile({ option: '{"title":{"text":"https://x.test"}}' })])), /Tuile « t1 »/);
  });
});

describe('3 visibilité des tuiles', () => {
  const groupes = { equipe: ['Alice@Example.test', 'bob@example.test'] };
  test('3.1 sans visiblePour : visible par tous', () => {
    assert.equal(tuileVisible({}, groupes, 'x@example.test'), true);
  });
  test('3.2 par adresse, sans tenir compte de la casse', () => {
    assert.equal(tuileVisible({ visiblePour: ['alice@example.test'] }, groupes, 'ALICE@example.TEST'), true);
    assert.equal(tuileVisible({ visiblePour: ['alice@example.test'] }, groupes, 'bob@example.test'), false);
  });
  test('3.3 par groupe ; groupe inconnu = personne ; liste vide = personne ; appelant sans adresse = personne', () => {
    assert.equal(tuileVisible({ visiblePour: ['equipe'] }, groupes, 'bob@example.test'), true);
    assert.equal(tuileVisible({ visiblePour: ['equipe'] }, groupes, 'carl@example.test'), false);
    assert.equal(tuileVisible({ visiblePour: ['inconnu'] }, groupes, 'bob@example.test'), false);
    assert.equal(tuileVisible({ visiblePour: [] }, groupes, 'bob@example.test'), false);
    assert.equal(tuileVisible({ visiblePour: ['equipe'] }, groupes, undefined), false);
    assert.equal(tuileVisible({ visiblePour: ['constructor'] }, groupes, 'bob@example.test'), false); // pas d'héritage d'objet
  });
});

describe('4 texte SQL', () => {
  test('4.1 sans tri : pas de order by ; limite par défaut 200', () => {
    assert.equal(construireSql({ vue: 'v_exemple' }), 'select * from "v_exemple" limit 200');
  });
  test('4.2 avec tri valide : order by entre guillemets doubles et limite donnée', () => {
    assert.equal(construireSql({ vue: 'v_exemple', tri: { colonne: 'mois', sens: 'desc' }, limite: 12 }), 'select * from "v_exemple" order by "mois" desc limit 12');
  });
  test('4.3 vue, colonne, sens ou limite invalides : jamais de SQL', () => {
    for (const t of [{ vue: 'v_x; drop table x' }, { vue: 'pg_catalog.pg_user' }, { vue: 'v_exemple', tri: { colonne: 'a"b', sens: 'asc' } }, { vue: 'v_exemple', tri: { colonne: 'a', sens: 'up' } },
      { vue: 'v_exemple', limite: 0 }, { vue: 'v_exemple', limite: 1000 }, { vue: 'v_exemple', limite: '5; drop' }, {}]) {
      assert.throws(() => construireSql(t), ErreurPilotage);
    }
  });
});
