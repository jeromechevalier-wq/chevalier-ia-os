// Finaliser un devis sans affaire : nom proposé et étape de départ de l'affaire créée (js/modules/devis/affaire-depuis-devis.js). Fonctions pures.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { nomAffaireProposee, etapePourAffaireCreee, etapeAPasser } from '../js/modules/devis/affaire-depuis-devis.js';

const config = { etapes: [
  { id: 'e1', libelle: 'Premier contact', actif: true },
  { id: 'e2', libelle: 'Devis', actif: false },
  { id: 'e3', libelle: 'Négociation', actif: true },
] };
const sansEtapeActive = { etapes: [{ id: 'e1', libelle: 'Premier contact', actif: false }] };

describe('NA nom de l’affaire créée depuis un devis', () => {
  test('NA1 le nom du devis s’il existe (même avec un client)', () => {
    assert.equal(nomAffaireProposee({ nom: '  Variante   économique ' }, { organisation: { nom: 'Société' } }), 'Variante économique');
  });
  test('NA2 sinon l’organisation, puis la personne', () => {
    assert.equal(nomAffaireProposee({ nom: '' }, { organisation: { nom: 'Société' }, personne: { nom: 'Ana' } }), 'Société');
    assert.equal(nomAffaireProposee({}, { personne: { nom: 'Ana Martin' } }), 'Ana Martin');
  });
  test('NA3 ni nom ni client : vide (la fenêtre exige alors un nom)', () => {
    assert.equal(nomAffaireProposee({ nom: '   ' }), '');
    assert.equal(nomAffaireProposee(null, {}), '');
  });
});

describe('NE étape de départ de l’affaire créée', () => {
  test('NE1 réglage valide : l’étape est retenue, la fenêtre ne demande rien', () => {
    assert.equal(etapePourAffaireCreee('e3', config).retenue, 'e3');
    assert.equal(etapeAPasser('e3', '', config), 'e3');
  });
  test('NE2 réglage vide, inconnu ou désactivé : rien de retenu, jamais de repli sur la première étape ni sur « Devis »', () => {
    for (const reglage of ['', 'inconnue', 'e2', undefined]) {
      assert.equal(etapePourAffaireCreee(reglage, config).retenue, null);
      assert.equal(etapeAPasser(reglage, '', config), null);
    }
    assert.deepEqual(etapePourAffaireCreee('', config).actives.map((e) => e.id), ['e1', 'e3']);
  });
  test('NE3 l’étape passée à creerAffaire est toujours active (le choix de la fenêtre aussi)', () => {
    assert.equal(etapeAPasser('', 'e1', config), 'e1');
    assert.equal(etapeAPasser('', 'e2', config), null, 'étape désactivée refusée');
    assert.equal(etapeAPasser('', 'zzz', config), null, 'étape inconnue refusée');
    assert.equal(etapeAPasser('e2', 'e3', config), 'e3', 'réglage désactivé : seul le choix actif passe');
  });
  test('NE4 aucune étape active : signalé, rien à passer', () => {
    assert.equal(etapePourAffaireCreee('e1', sansEtapeActive).aucune, true);
    assert.equal(etapeAPasser('e1', 'e1', sansEtapeActive), null);
  });
});
