// Tableau de bord, partie B1 : le navigateur LIT les nouveaux champs de la réponse (filtres, filtres appliqués, croisement, mention) sans rien changer à l'affichage actuel.
// Sans navigateur ni réseau. Le nom de chaque test commence par B1.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import * as L from '../js/modules/pilotage/logique.js';

const base = () => ({ titre: 'T', tuiles: [{ id: 'a', titre: 'A', type: 'graphique', lignes: [] }], erreurs: [], onglets: [{ id: 'o', titre: 'O', tuiles: ['a'] }], onglet: 'o' });

describe('B1.L lecture de la réponse du serveur', () => {
  test('B1.L1 une réponse SANS filtres donne exactement la même forme qu\'avant : aucune clé ajoutée', () => {
    const r = L.lireReponse(base());
    assert.equal('filtres' in r, false);
    assert.equal('filtres' in r.onglets[0], false);
    for (const k of ['filtresAppliques', 'croisement', 'mentionNonFiltre']) assert.equal(k in r.tuiles[0], false);
  });
  test('B1.L2 les filtres de l\'onglet lu sont lus : type, libellé, multiple, choix, valeurs, « tronquée », valeur appliquée', () => {
    const r = L.lireReponse({ ...base(), filtres: [
      { id: 'periode', libelle: 'Période', type: 'periode', applique: { raccourci: '12_mois', du: '2025-03-31', au: '2026-03-31', extra: 1 } },
      { id: 'lieu', libelle: 'Lieu', type: 'liste', multiple: true, valeurs: ['A', 7, null, { x: 1 }], tronquee: true, applique: ['A', {}] },
      { id: 'etat', type: 'liste', choix: [{ valeur: 'ouvert', libelle: 'Ouvert' }, { valeur: {} }, { valeur: 3 }] },
      { id: 'montant', libelle: 'Montant', type: 'intervalle', applique: { min: 5, max: 'x' } },
      { id: 'alerte', libelle: 'Alerte', type: 'oui_non', applique: false },
    ] });
    assert.deepEqual(r.filtres[0].applique, { raccourci: '12_mois', du: '2025-03-31', au: '2026-03-31' });
    assert.deepEqual(r.filtres[1], { id: 'lieu', libelle: 'Lieu', type: 'liste', multiple: true, choix: [], valeurs: ['A', 7], tronquee: true, applique: ['A'] });
    assert.deepEqual(r.filtres[2].choix, [{ valeur: 'ouvert', libelle: 'Ouvert' }, { valeur: 3, libelle: '3' }]);
    assert.equal(r.filtres[2].libelle, 'etat');
    assert.deepEqual(r.filtres[3].applique, { min: 5 });
    assert.equal(r.filtres[4].applique, false);
  });
  test('B1.L3 filtre de type ou d\'identifiant inconnu, ou réponse mal formée : ignoré, jamais d\'erreur', () => {
    assert.equal(L.lireFiltres([{ id: 'x', type: 'magique' }, { id: 'Mauvais Id', type: 'oui_non' }, null, 5]).length, 0);
    assert.deepEqual(L.lireFiltres('nimporte quoi'), []);
    assert.deepEqual(L.lireFiltres(undefined), []);
  });
  test('B1.L4 filtres d\'un onglet, filtres appliqués, croisement (filtre seul) et mention d\'une tuile sont lus', () => {
    const r = L.lireReponse({ ...base(), onglets: [{ id: 'o', titre: 'O', tuiles: ['a'], filtres: ['periode', 'Mauvais Id', 'lieu'] }],
      tuiles: [{ id: 'a', titre: 'A', type: 'graphique', lignes: [], filtresAppliques: ['periode'], croisement: { filtre: 'lieu', colonne: 'secret' }, mentionNonFiltre: 'Non filtré par la période.' }] });
    assert.deepEqual(r.onglets[0].filtres, ['periode', 'lieu']);
    assert.deepEqual(r.tuiles[0].filtresAppliques, ['periode']);
    assert.deepEqual(r.tuiles[0].croisement, { filtre: 'lieu' });
    assert.equal(r.tuiles[0].mentionNonFiltre, 'Non filtré par la période.');
  });
  test('B1.L5 une réponse « filtres » seule ne rend pas l\'écran « vide » à tort, et l\'ancien plan des onglets reste identique', () => {
    const r = L.lireReponse({ ...base(), filtres: [{ id: 'a', libelle: 'A', type: 'oui_non' }] });
    assert.equal(r.vide, false);
    assert.deepEqual(L.plan(r).blocs.map((b) => b.cartes.map((c) => c.id)), [['a']]);
  });
});
