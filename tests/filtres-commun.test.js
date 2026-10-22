// J1 (22/10/2026) : filtre de l'historique d'une fiche à cases à cocher, logique « OU » ; l'ancien appel par une chaîne reste valable (serveur MCP).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/modules/crm/logique.js';

const donnees = {
  activites: [{ id: 'a', fait: true, dateFait: new Date('2026-10-12T10:00:00Z'), type: 'appel', titre: 'Appel' }],
  notes: [{ id: 'n', texte: 'Une note', creeLe: new Date('2026-10-14T10:00:00Z') }],
  evenements: [
    { id: 'd', type: 'document', texte: 'Document joint : Devis', date: new Date('2026-10-13T10:00:00Z') },
    { id: 'e', type: 'email_envoye', texte: 'Email', date: new Date('2026-10-15T10:00:00Z') },
  ],
};
const ids = (filtre) => L.entreesHistorique(donnees, filtre).map((e) => e.element.id);

describe('J1 filtre de l’historique à cases à cocher', () => {
  test('J1 rien de coché ([], « tous », absent) = tout l’historique', () => {
    assert.deepEqual(ids([]), ['e', 'n', 'd', 'a']);
    assert.deepEqual(ids('tous'), ['e', 'n', 'd', 'a']);
    assert.deepEqual(ids(undefined), ['e', 'n', 'd', 'a']);
  });
  test('J1 plusieurs types cochés : au moins un type (logique OU)', () => {
    assert.deepEqual(ids(['notes', 'documents']), ['n', 'd']);
    assert.deepEqual(ids(['activites', 'evenements']), ['e', 'd', 'a']);
    assert.deepEqual(ids(['notes']), ['n']);
  });
  test('J1 une chaîne seule marche toujours (compatibilité du serveur MCP)', () => {
    assert.deepEqual(ids('notes'), ['n']);
    assert.deepEqual(ids('documents'), ['d']);
  });
  test('J1 un type inconnu seul ne cache rien ; un type inconnu parmi d’autres est ignoré', () => {
    assert.deepEqual(ids(['n’importe quoi']), ['e', 'n', 'd', 'a']);
    assert.deepEqual(ids(['n’importe quoi', 'notes']), ['n']);
  });
  test('J1 les types proposés dans la fenêtre n’ont plus « Tous »', () => {
    assert.deepEqual(L.TYPES_FILTRE_HISTORIQUE.map((f) => f.id), ['activites', 'notes', 'documents', 'affaires', 'evenements']);
    assert.deepEqual(L.typesHistoriqueValides(['notes', 'tous', 'x', 'activites']), ['activites', 'notes']);
  });
});
