// Portail devis seul, étape 1 : adresse, modules du portail, clé d'entrée (js/os/portail.js) et « À traiter » (devisATraiter). Aucun navigateur.
// Le nom d'un test commence par le numéro du critère.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { PORTAILS, portailDeRoute, modulesDuPortail, cleEntreeDe } from '../js/os/portail.js';
import { moduleDeclare, MODULES_DECLARES } from '../js/os/registre.js';
import { devisATraiter, devisARelancer } from '../js/modules/devis/relances.js';

describe('adresse du portail', () => {
  test('1 portailDeRoute reconnaît l\'id en tête de route, rien d\'autre', () => {
    assert.deepEqual(portailDeRoute('portail-devis'), { id: 'portail-devis', reste: '' });
    assert.deepEqual(portailDeRoute('portail-devis/devis/liste'), { id: 'portail-devis', reste: 'devis/liste' });
    for (const r of ['devis/liste', '', 'portail_devis', 'PORTAIL-DEVIS', undefined, 'constructor']) assert.equal(portailDeRoute(r), null, String(r));
  });
  test('2 modulesDuPortail : l\'intersection avec les modules actifs', () => {
    assert.deepEqual(modulesDuPortail('portail-devis', ['affaires', 'devis', 'projets']), ['devis']);
    assert.deepEqual(modulesDuPortail('portail-devis', ['affaires']), []);
    assert.deepEqual(modulesDuPortail('inconnu', ['devis']), []);
  });
  test('3 cleEntreeDe : quatre clés, et un même portail garde la même clé d\'un écran à l\'autre', () => {
    assert.equal(cleEntreeDe('crm/accueil'), '');
    assert.equal(cleEntreeDe('portail-devis'), 'portail-devis');
    assert.equal(cleEntreeDe('espace/Cabinet/crm/accueil'), 'espace/cabinet');
    assert.equal(cleEntreeDe('espace/cabinet/portail-devis'), 'espace/cabinet/portail-devis');
    assert.equal(cleEntreeDe('portail-devis/devis/liste'), cleEntreeDe('portail-devis/devis/bordereau'));
    assert.equal(cleEntreeDe('espace/cabinet/portail-devis/devis/liste'), cleEntreeDe('espace/cabinet/portail-devis/reglages'));
    assert.notEqual(cleEntreeDe('espace/cabinet/portail-devis'), cleEntreeDe('espace/cabinet/devis/liste'));
  });
  test('4 PORTAILS est gelé ; l\'accueil est un écran déclaré du module ; aucun id de portail n\'est un préfixe de module', () => {
    assert.ok(Object.isFrozen(PORTAILS));
    const prefixes = MODULES_DECLARES.map((m) => m.prefixe).filter(Boolean);
    for (const [id, p] of Object.entries(PORTAILS)) {
      assert.ok(Object.isFrozen(p) && Object.isFrozen(p.modules), id);
      const module = moduleDeclare(p.modules[0]);
      assert.ok(module.ecrans.some((e) => e.route === p.accueil), `${id} : accueil ${p.accueil}`);
      assert.ok(Object.isFrozen(p.menu), id);
      for (const route of p.menu) assert.ok(module.ecrans.some((e) => e.route === route), `${id} : menu ${route}`);
      assert.ok(!prefixes.includes(id), id);
    }
  });
});

const MAINTENANT = Date.parse('2026-11-06T10:00:00Z');
const AUJOURDHUI = '2026-11-06';
const ilYA = (j) => new Date(MAINTENANT - j * 86_400_000);
const envoye = (id, j, plus = {}) => ({ id, statut: 'envoye', expireLe: '2027-01-01', envoyeLe: ilYA(j), envois: [], ...plus });
const finalise = (id, j, plus = {}) => ({ id, statut: 'en_attente_envoi', expireLe: '2027-01-01', finaliseLe: ilYA(j), ...plus });
const traiter = (liste, plus = {}) => devisATraiter(liste, { aujourdhui: AUJOURDHUI, maintenant: MAINTENANT, ...plus });

describe('devisATraiter', () => {
  test('11 envoyé depuis 12 jours : à relancer ; finalisé depuis 8 jours : jamais envoyé ; les autres cas sont absents ; tri du plus ancien au plus récent', () => {
    const liste = [
      envoye('e12', 12), finalise('f8', 8), finalise('f6', 6), envoye('e9', 9),
      { id: 'b', statut: 'brouillon' }, envoye('s', 20, { statut: 'accepte' }), envoye('r', 20, { statut: 'refuse' }), envoye('rem', 20, { statut: 'remplace' }),
      envoye('arch', 20, { archive: true }), envoye('exp', 20, { expireLe: '2026-01-01' }), finalise('farch', 20, { archive: true }),
    ];
    const r = traiter(liste);
    assert.deepEqual(r.map((x) => [x.devis.id, x.motif, x.joursDepuis]), [['e12', 'a_relancer', 12], ['f8', 'jamais_envoye', 8]]);
    const plusAncien = traiter([envoye('e12', 12), finalise('f30', 30), envoye('e40', 40)]);
    assert.deepEqual(plusAncien.map((x) => x.devis.id), ['e40', 'f30', 'e12']);
    assert.deepEqual(traiter(undefined), []);
    assert.deepEqual(traiter(null), []);
  });
  test('12 les devis de test sont exclus (devisARelancer, lui, les garde) ; délai de 15 jours, { seconds } et date illisible', () => {
    const t = envoye('t', 12, { test: true });
    const tf = finalise('tf', 12, { test: true });
    assert.deepEqual(traiter([t, tf]), []);
    assert.equal(devisARelancer([t], { aujourdhui: AUJOURDHUI, maintenant: MAINTENANT }).length, 1, 'devisARelancer garde les tests');
    assert.deepEqual(traiter([envoye('e12', 12)], { delaiJours: 15 }), []);
    assert.equal(traiter([envoye('e16', 16)], { delaiJours: 15 }).length, 1);
    const secondes = Math.floor(ilYA(8).getTime() / 1000);
    assert.deepEqual(traiter([finalise('fs', 8, { finaliseLe: { seconds: secondes } })]).map((x) => x.devis.id), ['fs']);
    assert.deepEqual(traiter([finalise('fx', 8, { finaliseLe: 'n’importe quoi' }), finalise('fn', 8, { finaliseLe: null })]), []);
    assert.deepEqual(traiter([envoye('sans-date', 12, { envoyeLe: null })]), [], 'envoyé sans date d\'envoi : jamais « à relancer »');
  });
});

describe('bornes exactes', () => {
  test('13b 10 jours pile (envoyé) et 7 jours pile (finalisé) sont présents ; une milliseconde de moins : absent', () => {
    const pile = traiter([envoye('e10', 10), finalise('f7', 7)]);
    assert.deepEqual(pile.map((x) => [x.devis.id, x.motif, x.joursDepuis]), [['e10', 'a_relancer', 10], ['f7', 'jamais_envoye', 7]]);
    const presque = [envoye('e', 10, { envoyeLe: new Date(MAINTENANT - 10 * 86_400_000 + 1) }), finalise('f', 7, { finaliseLe: new Date(MAINTENANT - 7 * 86_400_000 + 1) })];
    assert.deepEqual(traiter(presque), []);
  });
});

describe('icônes du portail', () => {
  test('4b toute icône passée à icone() dans portail-introuvable.js et shell.js existe dans ICONES (sinon le SVG est vide)', async () => {
    const { ICONES } = await import('../js/os/ui.js');
    for (const f of ['../js/os/portail-introuvable.js', '../js/os/shell.js', '../js/modules/devis/relances-ecran.js']) {
      const src = readFileSync(new URL(f, import.meta.url), 'utf8');
      const noms = [...src.matchAll(/icone\(\s*'([a-z0-9-]+)'/g)].map((m) => m[1]);
      assert.ok(noms.length > 0, f);
      for (const n of noms) assert.ok(n in ICONES, `${f} : icône « ${n} » absente de ICONES`);
    }
  });
});
