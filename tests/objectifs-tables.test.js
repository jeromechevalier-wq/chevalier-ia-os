// Noms des tables des objectifs de l'Accueil : interrupteur éteint = noms d'avant ; allumé = nouvelles tables, repli, écriture seulement dans la nouvelle.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test, describe } from 'node:test';
import { TABLE_KPI_ACTIVE, TABLES_ANCIENNES, TABLES_KPI, nomCollection, faut_repli } from '../js/os/objectifs-tables.js';

const SOURCE = readFileSync(new URL('../js/os/objectifs.js', import.meta.url), 'utf8');

describe('tables des objectifs : interrupteur', () => {
  test("l'interrupteur livré est éteint (le passage à true est une PR à part, après la copie des données)", () => {
    assert.equal(TABLE_KPI_ACTIVE, false);
  });

  test('interrupteur éteint : lecture et écriture dans les anciens noms, repli ignoré', () => {
    for (const cle of ['definitions', 'saisies']) {
      assert.equal(nomCollection(cle, { actif: false }), TABLES_ANCIENNES[cle]);
      assert.equal(nomCollection(cle, { actif: false, ecriture: true }), TABLES_ANCIENNES[cle]);
      assert.equal(nomCollection(cle, { actif: false, repli: { [cle]: true } }), TABLES_ANCIENNES[cle]);
    }
    assert.deepEqual(TABLES_ANCIENNES, { definitions: 'os_objectifs', saisies: 'os_objectifs_saisies' });
    assert.equal(nomCollection('definitions'), 'os_objectifs'); // défaut = interrupteur du module
  });

  test('interrupteur allumé : nouveaux noms en lecture et en écriture', () => {
    assert.deepEqual(TABLES_KPI, { definitions: 'os_kpi', saisies: 'os_kpi_saisies' });
    assert.equal(nomCollection('definitions', { actif: true }), 'os_kpi');
    assert.equal(nomCollection('saisies', { actif: true }), 'os_kpi_saisies');
    assert.equal(nomCollection('definitions', { actif: true, ecriture: true }), 'os_kpi');
  });

  test("allumé + nouvelle table vide : lecture dans l'ancienne, mais écriture UNIQUEMENT dans la nouvelle", () => {
    const repli = { definitions: true, saisies: false };
    assert.equal(nomCollection('definitions', { actif: true, repli }), 'os_objectifs');
    assert.equal(nomCollection('saisies', { actif: true, repli }), 'os_kpi_saisies');
    assert.equal(nomCollection('definitions', { actif: true, repli, ecriture: true }), 'os_kpi');
    assert.equal(nomCollection('saisies', { actif: true, repli, ecriture: true }), 'os_kpi_saisies');
  });

  test("le repli ne se décide qu'une fois, interrupteur allumé et nouvelle table vide", () => {
    assert.equal(faut_repli({ actif: true, nouvelleVide: true }), true);
    assert.equal(faut_repli({ actif: true, nouvelleVide: false }), false);
    assert.equal(faut_repli({ actif: true, nouvelleVide: true, deja: true }), false);
    assert.equal(faut_repli({ actif: false, nouvelleVide: true }), false);
  });

  test('table inconnue : erreur', () => {
    assert.throws(() => nomCollection('autre'), /Table inconnue/);
  });

  test("objectifs.js n'écrit aucun nom de collection en dur : tout passe par nomCollection", () => {
    assert.doesNotMatch(SOURCE, /['"`]os_(objectifs|kpi)/);
    assert.match(SOURCE, /from '\.\/objectifs-tables\.js'/);
    assert.equal((SOURCE.match(/collection\(db, /g) || []).length, 1);
    for (const m of SOURCE.matchAll(/\b(?:doc|collection)\(db, ([^,)]+)/g)) assert.match(m[1], /^nom(Lecture|Ecriture)\(/, `nom en dur : ${m[1]}`);
  });
});
