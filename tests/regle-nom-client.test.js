// Règle de nom des workflows d'un client (18/10/2026) : « client-<identifiant>-… ». Test très léger : logique pure, sans Firebase, sans émulateur, sans réseau.
// Lancer : node --test tests/regle-nom-client.test.js
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { classer, classerSansEtiquette, nomClientOk } from '../functions-plateforme/src/etiquettes.js';

const ctx = { connus: new Set(['audrey-charras']), actifs: new Set(['audrey-charras']) };
const wf = (name, tags = ['client-audrey-charras']) => ({ id: 'w1', name, active: true, tags });

test('N1 un nom « client-<identifiant>-… » est copié chez le client', () => {
  assert.equal(nomClientOk('client-audrey-charras-lire-la-fiche', 'audrey-charras'), true);
  assert.equal(classer([wf('client-audrey-charras-lire-la-fiche')], ctx).parClient.get('audrey-charras').length, 1);
});

test('N2 un nom libre ou à l\'ancienne est signalé « nom-different » et n\'est pas copié', () => {
  for (const nom of ['PROD - Audrey suivi élève - Mon mois', 'audrey-charras-mon-mois', 'client-audrey-charrasx']) {
    const r = classer([wf(nom)], ctx);
    assert.equal(r.parClient.size, 0, nom);
    assert.equal(r.signalements[0].raison, 'nom-different', nom);
    assert.equal(r.signalements[0].categorie, 'non-reconnu', nom);
    assert.equal(r.signalements[0].lignes.find((l) => l.signe === 'Nom').ok, false, nom);
  }
});

test('N3 le nom d\'un AUTRE client reste « signes-differents »', () => {
  const r = classer([wf('client-boris-x')], { connus: new Set(['audrey-charras', 'boris']), actifs: new Set(['audrey-charras', 'boris']) });
  assert.equal(r.signalements[0].raison, 'signes-differents');
});

test('N5 le nom suit la porte à la lettre ; étiquette « audrey » + nom « audrey-charras » = signes différents, jamais « en règle »', () => {
  assert.equal(nomClientOk('CLIENT-Audrey-Charras-X', 'audrey-charras'), true);
  for (const nom of ['client-audrey-charras x', 'client_audrey-charras-x', '', undefined]) assert.equal(nomClientOk(nom, 'audrey-charras'), false, String(nom));
  const ctx2 = { connus: new Set(['audrey', 'audrey-charras']), actifs: new Set(['audrey', 'audrey-charras']) };
  const r = classer([wf('client-audrey-charras-x', ['client-audrey'])], ctx2);
  assert.equal(r.parClient.size, 0);
  assert.equal(r.signalements[0].raison, 'signes-differents');
  assert.equal(r.signalements[0].lignes.find((l) => l.signe === 'Nom').ok, false);
});

test('N4 un workflow sans étiquette de propriétaire est signalé ; interne, client et archivé ne le sont pas', () => {
  const w = (id, tags, archive = false) => ({ id, name: `x-${id}`, active: true, archive, tags });
  const { signalements } = classerSansEtiquette([w('a', []), w('b', ['domaine-marketing']), w('c', ['interne']), w('d', ['Client-Audrey']), w('e', [], true)]);
  assert.deepEqual(signalements.map((s) => s.workflowId), ['a', 'b']);
  assert.equal(signalements[0].raison, 'sans-etiquette');
  assert.equal(signalements[0].categorie, 'non-reconnu');
  assert.match(signalements[1].lignes[0].texte, /domaine-marketing/);
});
