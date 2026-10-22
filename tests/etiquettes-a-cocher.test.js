// Étiquettes à cocher (nuit du 23/10/2026) : logique pure de N5 (couleur automatique, doublon).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as L from '../js/modules/crm/logique.js';

const P = L.COULEURS_ETIQUETTES;

describe('N5 couleur automatique d\'une nouvelle étiquette', () => {
  test('N5 : sans étiquette, la première couleur de la palette', () => {
    assert.equal(L.couleurEtiquetteSuivante([]), P[0]);
    assert.equal(L.couleurEtiquetteSuivante(undefined), P[0]);
  });
  test('N5 : la première couleur pas encore utilisée, même si elle n\'est pas la suivante dans l\'ordre', () => {
    assert.equal(L.couleurEtiquetteSuivante([{ couleur: P[0] }]), P[1]);
    assert.equal(L.couleurEtiquetteSuivante([{ couleur: P[1] }, { couleur: P[2] }]), P[0]);
    assert.equal(L.couleurEtiquetteSuivante([{ couleur: P[0].toUpperCase() }]), P[1]);
    assert.equal(L.couleurEtiquetteSuivante([{ couleur: '#123456' }]), P[0]);
  });
  test('N5 : palette épuisée, on repart du début (rang = nombre d\'étiquettes modulo la longueur)', () => {
    const toutes = P.map((couleur) => ({ couleur }));
    assert.equal(L.couleurEtiquetteSuivante(toutes), P[0]);
    assert.equal(L.couleurEtiquetteSuivante([...toutes, { couleur: '#123456' }]), P[1]);
  });
});

describe('N5 doublon d\'étiquette', () => {
  const liste = [{ id: 'partenaire', nom: 'Partenaire' }, { id: 'a_relancer', nom: 'À relancer' }];
  test('N5 : même nom à la casse, aux accents et aux espaces près = doublon', () => {
    assert.equal(L.etiquetteEnDoublon('partenaire', liste).id, 'partenaire');
    assert.equal(L.etiquetteEnDoublon('  A RELANCER ', liste).id, 'a_relancer');
    assert.equal(L.etiquetteEnDoublon('à  relancer', liste).id, 'a_relancer');
  });
  test('N5 : nom différent ou vide = pas de doublon', () => {
    assert.equal(L.etiquetteEnDoublon('Partenaires', liste), undefined);
    assert.equal(L.etiquetteEnDoublon('', liste), undefined);
    assert.equal(L.etiquetteEnDoublon('   ', liste), undefined);
    assert.equal(L.etiquetteEnDoublon('Nouveau', []), undefined);
    assert.equal(L.etiquetteEnDoublon('Nouveau', undefined), undefined);
  });
});
