// Chemin de base des modules (chantier 2 de la plateforme clients) : le CRM garde la racine, un client écrit sous clients/<client>.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { normaliserBase, cheminBaseClient, cheminCollection } from '../js/os/chemins.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');

describe('chemins : base, racine par défaut', () => {
  test('sans base (ou base vide), les chemins sont ceux du CRM, inchangés', () => {
    for (const base of [undefined, null, '', '/', '//']) {
      assert.equal(normaliserBase(base), '');
      assert.equal(cheminCollection(base, 'crm_personnes'), 'crm_personnes');
    }
    for (const nom of ['crm_personnes', 'crm_organisations', 'crm_affaires', 'crm_activites', 'crm_notes', 'crm_evenements', 'crm_parametres',
      'crm_audit', 'crm_audit_avant', 'projets_projets', 'projets_taches', 'projets_modeles']) {
      assert.equal(cheminCollection('', nom), nom);
    }
  });
  test('préfixe clients/<client>', () => {
    assert.equal(cheminBaseClient('acme'), 'clients/acme');
    assert.equal(cheminCollection('clients/acme', 'crm_personnes'), 'clients/acme/crm_personnes');
    assert.equal(cheminCollection('/clients/acme/', 'projets_taches'), 'clients/acme/projets_taches');
    assert.equal(cheminCollection(cheminBaseClient('mon-client_2'), 'crm_audit'), 'clients/mon-client_2/crm_audit');
  });
  test('deux clients ne partagent jamais un chemin', () => {
    assert.notEqual(cheminCollection(cheminBaseClient('a'), 'crm_notes'), cheminCollection(cheminBaseClient('b'), 'crm_notes'));
    assert.notEqual(cheminCollection(cheminBaseClient('a'), 'crm_notes'), cheminCollection('', 'crm_notes'));
  });
  test('bases invalides refusées (nombre impair de segments, caractères interdits, évasion)', () => {
    for (const base of ['clients', 'clients/a/b', 'clients/..', '../clients/a', 'clients/a b', 'clients/a.b', 'clients/']) {
      assert.throws(() => normaliserBase(base), /Chemin de base invalide/, base);
    }
    for (const client of ['', 'a/b', '..', '.', ' a', undefined, 42, '-a']) {
      assert.throws(() => cheminBaseClient(client), /client invalide/, String(client));
    }
  });
});

describe('chemins : les modules passent tous par le chemin de base', () => {
  test('aucun accès Firestore avec un nom de collection en dur dans les données des modules', () => {
    for (const f of ['js/modules/crm/donnees.js', 'js/modules/projets/donnees.js']) {
      const src = lire(f);
      assert.doesNotMatch(src, /\bcollection\(db,\s*(?!chemin\()\S/, `${f} : collection(db, …) sans chemin()`);
      assert.doesNotMatch(src, /\bdoc\(db,\s*(?!chemin\()\S/, `${f} : doc(db, …) sans chemin()`);
      assert.doesNotMatch(src, /\bcollectionGroup\(/, f);
    }
  });
  test('la coque démarre les modules à la racine par défaut (CRM inchangé)', () => {
    assert.match(lire('js/main.js'), /api\.demarrer\(\{ compte, cheminBase: '' \}\)/);
    assert.match(lire('js/modules/crm/donnees.js'), /export function demarrer\(compteConnecte, base = ''\)/);
  });
});
