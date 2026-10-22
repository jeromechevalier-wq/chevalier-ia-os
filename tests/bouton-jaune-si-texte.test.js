// Q4 (nuit 4) : à la saisie depuis l'écran, une activité exige un titre ; les autres appelants (modèles, serveur MCP) gardent leur titre par défaut.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validerActivite, validerSaisieActivite, nouvelleActivite } from '../js/modules/crm/logique.js';

const base = { type: 'appel', date: '2026-10-22' };

describe('Q4 : activité saisie à la main', () => {
  test('Q4 : un titre vide ou fait d’espaces est refusé avec le message demandé', () => {
    for (const titre of ['', '   ', '\n\t', undefined, null]) {
      assert.equal(validerSaisieActivite({ ...base, titre }).titre, 'Écris au moins un mot pour l\'activité.');
    }
  });
  test('Q4 : une seule lettre suffit', () => {
    assert.deepEqual(validerSaisieActivite({ ...base, titre: 'a' }), {});
  });
  test('Q4 : la date et le type restent contrôlés', () => {
    assert.ok(validerSaisieActivite({ ...base, titre: 'a', date: '' }).date);
    assert.ok(validerSaisieActivite({ ...base, titre: 'a', type: 'inconnu' }).type);
  });
  test('Q4 : validerActivite et nouvelleActivite (serveur MCP, modèles) gardent le titre par défaut', () => {
    assert.deepEqual(validerActivite({ ...base, titre: '' }), {});
    assert.equal(nouvelleActivite({ ...base, titre: '' }, { maintenant: new Date('2026-10-22T10:00:00Z') }).titre, 'Appel');
  });
});
