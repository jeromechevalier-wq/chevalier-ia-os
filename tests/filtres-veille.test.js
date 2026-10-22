// Veille : logique des filtres à cases à cocher (OU dans un groupe, ET entre groupes), sans Firebase ni DOM.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import * as L from '../js/modules/veille/logique.js';

const contenus = [
  { id: 'a', sourceId: 's1', titre: 'Premier épisode', type: 'Podcast', etat: 'résumée', datePublication: 1000 },
  { id: 'b', sourceId: 's2', titre: 'Une vidéo sur l\'IA', type: '', etat: 'nouveau', datePublication: 5000 },
  { id: 'c', sourceId: 's1', titre: 'Épisode échoué', type: 'Podcast', etat: 'échec', datePublication: 3000 },
  { id: 'd', sourceId: 's3', titre: 'Une lettre', type: 'Newsletter', etat: 'en cours', datePublication: 4000 },
];
const ids = (liste) => liste.map((x) => x.id);

describe('veille : filtres à cases à cocher', () => {
  test('OU dans un groupe', () => {
    assert.deepEqual(ids(L.filtrer(contenus, { sources: ['s1', 's3'] })), ['d', 'c', 'a']);
    assert.deepEqual(ids(L.filtrer(contenus, { types: ['Podcast', 'Newsletter'] })), ['d', 'c', 'a']);
    assert.deepEqual(ids(L.filtrer(contenus, { etats: ['nouveau', 'echec'] })), ['b', 'c']);
  });
  test('ET entre groupes, et avec la recherche', () => {
    assert.deepEqual(ids(L.filtrer(contenus, { sources: ['s1'], etats: ['echec', 'nouveau'] })), ['c']);
    assert.deepEqual(ids(L.filtrer(contenus, { types: ['Podcast'], texte: 'ÉPISODE' })), ['c', 'a']);
    assert.deepEqual(ids(L.filtrer(contenus, { sources: ['s2'], types: ['Podcast'] })), []);
  });
  test('tableaux vides = pas de filtre ; l\'ancienne forme à valeur unique marche encore', () => {
    assert.deepEqual(ids(L.filtrer(contenus, { sources: [], types: [], etats: [] })), ['b', 'd', 'c', 'a']);
    assert.deepEqual(ids(L.filtrer(contenus, { sourceId: 's1', etat: 'resume' })), ['a']);
  });
  test('nombre de cases cochées', () => {
    assert.equal(L.nombreFiltres(L.criteresVides()), 0);
    assert.equal(L.nombreFiltres({ sources: ['s1'], types: ['Podcast', 'Newsletter'], etats: ['echec'] }), 4);
    assert.equal(L.nombreFiltres(), 0);
  });
  test('seules les valeurs qui existent sont proposées', () => {
    assert.deepEqual(L.typesPresents(contenus), ['YouTube', 'Podcast', 'Newsletter']); // le type vide vaut YouTube
    assert.deepEqual(L.typesPresents([contenus[0]]), ['Podcast']);
    assert.deepEqual(L.etatsPresents(contenus).map((o) => o.valeur), ['nouveau', 'en_cours', 'resume', 'echec']);
    assert.deepEqual(L.etatsPresents([contenus[1]]).map((o) => o.valeur), ['nouveau']);
    assert.deepEqual(L.etatsPresents([]), []);
    assert.ok(!L.OPTIONS_ETAT_CASES.some((o) => o.valeur === ''));
  });
});
