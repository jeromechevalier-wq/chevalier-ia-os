// Mode test, PR 1c : filtre « Tests » des listes (Personnes, Organisations, Affaires, Projets, Devis). Chaque test commence par son numéro (U1 à U7, 13).
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as L from '../js/modules/crm/logique.js';
import * as P from '../js/modules/projets/logique.js';
import * as Li from '../js/modules/devis/liste.js';

const RACINE = fileURLToPath(new URL('../', import.meta.url));
const lire = (chemin) => readFileSync(join(RACINE, chemin), 'utf8');
const ids = (l) => l.map((x) => x.id);
const jeu = [{ id: 'r' }, { id: 't', test: true }, { id: 'f', test: false }];

describe('U1 testsCorrespond / selonTests', () => {
  test('U1 inclure garde tout, exclure garde les réels, seulement garde les essais', () => {
    assert.deepEqual(ids(L.selonTests(jeu, 'inclure')), ['r', 't', 'f']);
    assert.deepEqual(ids(L.selonTests(jeu, 'exclure')), ['r', 'f']);
    assert.deepEqual(ids(L.selonTests(jeu, 'seulement')), ['t']);
    assert.deepEqual(L.selonTests(undefined, 'seulement'), []);
    assert.equal(L.testsCorrespond('exclure', { test: null }), true);
  });
});

describe('U2 critères complets', () => {
  test('U2 « tests » vaut inclure par défaut, une valeur inconnue se lit Tout', () => {
    for (const liste of ['affaires', 'personnes', 'organisations']) {
      assert.equal(L.criteresComplets(liste, {}).tests, 'inclure');
      assert.equal(L.criteresComplets(liste, { tests: 'nimporte' }).tests, 'inclure');
      assert.equal(L.criteresComplets(liste, { tests: 'seulement' }).tests, 'seulement');
    }
  });
});

describe('U3 critères actifs', () => {
  test('U3 Tout n’est pas un filtre actif, Sans les tests l’est', () => {
    assert.equal(L.criteresActifs('affaires', { tests: 'inclure' }), false);
    assert.equal(L.criteresActifs('affaires', { tests: 'exclure' }), true);
    assert.equal(L.criteresActifs('affaires', { recherche: 'x' }), true);
    assert.equal(L.criteresActifs('affaires', {}), false);
    assert.equal(L.criteresActifs('personnes', { archives: true }), true);
  });
});

describe('U4 filtrer', () => {
  test('U4 Personnes, Organisations, Affaires selon exclure / seulement, avec les archives', () => {
    const f = { Personnes: L.filtrerPersonnes, Organisations: L.filtrerOrganisations, Affaires: L.filtrerAffaires };
    for (const [nom, fn] of Object.entries(f)) {
      assert.deepEqual(ids(fn(jeu, { tests: 'exclure' })), ['r', 'f'], nom);
      assert.deepEqual(ids(fn(jeu, { tests: 'seulement' })), ['t'], nom);
      assert.deepEqual(ids(fn(jeu, {})), ['r', 't', 'f'], nom);
      const arch = [...jeu, { id: 'at', test: true, archive: true }, { id: 'ar', archive: true }];
      assert.deepEqual(ids(fn(arch, { tests: 'seulement', archives: true })), ['at'], nom);
      assert.deepEqual(ids(fn(arch, { tests: 'exclure', archives: true })), ['ar'], nom);
    }
  });
});

describe('U5 pastilles', () => {
  test('U5 une pastille « Sans les tests », que retirerCritere remet à Tout', () => {
    assert.deepEqual(L.pastillesFiltres('affaires', { tests: 'exclure' }), [{ cle: 'tests', valeur: 'exclure', libelle: 'Sans les tests' }]);
    assert.equal(L.pastillesFiltres('personnes', { tests: 'seulement' })[0].libelle, 'Seulement les tests');
    assert.deepEqual(L.pastillesFiltres('affaires', {}), []);
    assert.equal(L.retirerCritere('affaires', { tests: 'exclure' }, 'tests').tests, 'inclure');
  });
});

describe('U6 Projets', () => {
  test('U6 critères, compte, filtre et filtre enregistré', () => {
    assert.equal(P.criteresProjetsComplets({}).tests, 'inclure');
    assert.equal(P.criteresProjetsComplets({ tests: 'x' }).tests, 'inclure');
    assert.equal(P.filtresProjetsActifs({ tests: 'seulement' }), 1);
    assert.equal(P.filtresProjetsActifs({}), 0);
    assert.equal(P.criteresProjetsActifs({ tests: 'exclure' }), true);
    assert.deepEqual(ids(P.filtrerProjets(jeu, { tests: 'exclure' })), ['r', 'f']);
    assert.deepEqual(ids(P.filtrerProjets(jeu, { tests: 'seulement' })), ['t']);
    assert.equal(P.nouveauFiltreProjets('Mes essais', { tests: 'seulement' }, [], 'ab12').filtre.criteres.tests, 'seulement');
  });
});

describe('U7 Devis', () => {
  const d = (id, extra = {}) => ({ id, racineId: id, version: 1, statut: 'brouillon', creeLe: new Date('2026-10-01T09:00:00Z'), modifieLe: new Date('2026-10-01T09:00:00Z'), expireLe: '2026-12-30', sections: [], ...extra });
  const liste = [d('a'), d('b', { test: true }), d('c'), d('d', { test: true })];
  test('U7 exclure, seulement, et sans « tests » comme avant', () => {
    assert.deepEqual(ids(Li.filtrer(liste, { tests: 'exclure', aujourdhui: '2026-10-24' })), ['a', 'c']);
    assert.deepEqual(ids(Li.filtrer(liste, { tests: 'seulement', aujourdhui: '2026-10-24' })), ['b', 'd']);
    assert.equal(Li.filtrer(liste, { aujourdhui: '2026-10-24' }).length, 4);
  });
});

describe('13 verrouillage', () => {
  test('13 le filtre Tests est sur les cinq listes qui portent le repère, et nulle part ailleurs', () => {
    assert.equal(lire('js/modules/crm/filtres.js').split('controleTests()').length - 1, 3, '2 listes dans controles() + la définition = 3 occurrences de « controleTests() »');
    for (const f of ['js/modules/projets/projets.js', 'js/modules/devis/liste-ecran.js']) assert.ok(lire(f).includes('controleTests('), f);
    for (const f of ['js/modules/devis/bordereau.js', 'js/modules/devis/vocabulaire-ecran.js', 'js/os/journal.js', 'js/modules/veille/ecran.js', 'js/modules/automatisations/ecran.js', 'js/modules/tableaudebord/ecran.js', 'js/modules/projets/modeles.js']) {
      const s = lire(f);
      assert.ok(!s.includes('controleTests') && !s.includes("cle: 'tests'"), `${f} : ce module n'a pas de repère test : pas de filtre Tests`);
    }
  });
});
