// N3 (23/10/2026) : chaque ligne de l'historique appartient à UN seul type de filtre (plus de recoupement Documents / Affaires / Événements).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/modules/crm/logique.js';

const date = (j) => new Date(`2026-10-${j}T10:00:00Z`);
const donnees = {
  activites: [{ id: 'a', fait: true, dateFait: date(10), type: 'appel', titre: 'Appel' }],
  notes: [{ id: 'n', texte: 'Une note', creeLe: date(11) }],
  evenements: [
    { id: 'doc', type: 'document', texte: 'Document joint : Devis', date: date(12) },
    { id: 'etape', type: 'etape_changee', texte: 'Étape changée', date: date(13) },
    { id: 'projet', type: 'projet_cree', texte: 'Projet créé', date: date(14) },
    { id: 'livrable', type: 'livrable_fait', texte: 'Livrable fait', date: date(15) },
  ],
};
const ids = (filtre) => L.entreesHistorique(donnees, filtre).map((e) => e.element.id).sort();

describe('N3 les types de filtre ne se recoupent plus', () => {
  test('N3 une entrée « document » n’est pas dans « Événements » mais dans « Documents »', () => {
    assert.ok(!ids('evenements').includes('doc'));
    assert.deepEqual(ids('documents'), ['doc']);
  });
  test('N3 une entrée « étape changée » n’est pas dans « Événements » mais dans « Affaires »', () => {
    assert.ok(!ids('evenements').includes('etape'));
    assert.deepEqual(ids('affaires'), ['etape']);
  });
  test('N3 un autre événement (projet créé, livrable fait) est dans « Événements »', () => {
    assert.deepEqual(ids('evenements'), ['livrable', 'projet']);
  });
  test('N3 toutes les cases ensemble = tout, et chaque ligne n’apparaît que dans un seul type', () => {
    const types = L.TYPES_FILTRE_HISTORIQUE.map((f) => f.id);
    const tous = ids('tous');
    for (const id of tous) assert.equal(types.filter((t) => ids(t).includes(id)).length, 1, id);
    assert.deepEqual(ids(types), tous);
  });
});
