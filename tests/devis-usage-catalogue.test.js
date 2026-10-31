// Module Devis, catalogue : la logique pure du compteur d'usage côté écran (js/modules/devis/usage.js, PR C4). Un test par point, le nom commence par C4.x.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as U from '../js/modules/devis/usage.js';

const art = (id, libelle) => ({ id, libelle });
const LIGNES = [art('a1', 'Alpha'), art('a2', 'Bravo'), art('a3', 'Charlie'), art('a4', 'Delta'), art('a5', 'écho')];
const USAGES = U.usageParArticle([{ id: 'a2', articleId: 'a2', nombre: 3 }, { id: 'a3', articleId: 'a3', nombre: 3 }, { id: 'a4', articleId: 'a4', nombre: 12 }]);
const ids = (l) => l.map((a) => a.id);

describe('C4 usage du catalogue', () => {
  test('C4.1 usageParArticle ne garde que les nombres entiers positifs ; un document illisible est ignoré', () => {
    const m = U.usageParArticle([{ id: 'a', articleId: 'a', nombre: 2 }, { id: 'b', nombre: 4 }, { id: 'c', articleId: 'c', nombre: 0 }, { id: 'd', articleId: 'd', nombre: -1 }, { id: 'e', articleId: 'e', nombre: '5' }, null, { nombre: 3 }]);
    assert.deepEqual([...m], [['a', 2], ['b', 4]]);
    assert.deepEqual([...U.usageParArticle(undefined)], []);
  });
  test('C4.1 texteUsage : « Utilisé N fois » ou « Jamais utilisé » ; nombreUsage vaut 0 sans compteur', () => {
    assert.equal(U.texteUsage(12), 'Utilisé 12 fois');
    assert.equal(U.texteUsage(1), 'Utilisé 1 fois');
    assert.equal(U.texteUsage(0), 'Jamais utilisé');
    assert.equal(U.nombreUsage(USAGES, 'a4'), 12);
    assert.equal(U.nombreUsage(USAGES, 'inconnu'), 0);
    assert.equal(U.nombreUsage(undefined, 'a4'), 0);
  });
  test('C4.2 tri « usage » décroissant : le plus utilisé d’abord, égalité = alphabétique, jamais-utilisés TOUJOURS en dernier', () => {
    assert.deepEqual(ids(U.trierArticles(LIGNES, USAGES, { critere: 'usage', sens: 'desc' })), ['a4', 'a2', 'a3', 'a1', 'a5']);
  });
  test('C4.2 tri « usage » croissant : le moins utilisé d’abord, mais les jamais-utilisés restent en dernier', () => {
    assert.deepEqual(ids(U.trierArticles(LIGNES, USAGES, { critere: 'usage', sens: 'asc' })), ['a2', 'a3', 'a4', 'a1', 'a5']);
  });
  test('C4.2 tri « libellé » : ordre habituel (sans tenir compte de la casse ni des accents), sens inversé possible ; la liste donnée n’est pas modifiée', () => {
    const copie = [...LIGNES];
    assert.deepEqual(ids(U.trierArticles(LIGNES, USAGES)), ['a1', 'a2', 'a3', 'a4', 'a5']);
    assert.deepEqual(ids(U.trierArticles(LIGNES, USAGES, { critere: 'libelle', sens: 'desc' })), ['a5', 'a4', 'a3', 'a2', 'a1']);
    assert.deepEqual(LIGNES, copie);
  });
  test('C4.4 cas vide : sans compteur, tout est « jamais utilisé » et le tri « usage » donne l’ordre alphabétique ; une liste vide reste vide', () => {
    assert.deepEqual(ids(U.trierArticles(LIGNES, new Map(), { critere: 'usage', sens: 'desc' })), ['a1', 'a2', 'a3', 'a4', 'a5']);
    assert.deepEqual(U.trierArticles([], USAGES, { critere: 'usage' }), []);
    assert.deepEqual(U.trierArticles(undefined, undefined), []);
  });
});
