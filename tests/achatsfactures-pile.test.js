// Module Achats « Factures » : vue « Valider à la suite » (pile.js, 26/11/2026). Logique pure de la pile (ordre, « Passer », compteur) et lecture des factures à valider avec un FAUX client (aucun réseau).
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { expect } from './_expect-achatsfactures.js';
import { ordonnerPile, passerFacture, texteRestantes, TEXTE_PILE_FINIE } from '../js/modules/achatsfactures/logique.js';
import { creerDonnees, COLONNES_PILE, TABLE_FACTURES } from '../js/modules/achatsfactures/donnees.js';

describe('ordre de la pile', () => {
  test('P1 la plus ancienne d’abord ; une facture passée va à la fin, dans l’ordre où elle a été passée', () => {
    expect(ordonnerPile(['a', 'b', 'c'], [])).toEqual(['a', 'b', 'c']);
    expect(ordonnerPile(['a', 'b', 'c'], ['a'])).toEqual(['b', 'c', 'a']);
    expect(ordonnerPile(['a', 'b', 'c'], ['b', 'a'])).toEqual(['c', 'b', 'a']);
    expect(ordonnerPile(['a', 'c'], ['b', 'a'])).toEqual(['c', 'a']); // « b » n'est plus à valider : elle disparaît
    expect(ordonnerPile([], ['a'])).toEqual([]);
  });

  test('P1 « Passer » remet la facture en fin de pile, sans doublon', () => {
    expect(passerFacture([], 'a')).toEqual(['a']);
    expect(passerFacture(['a', 'b'], 'a')).toEqual(['b', 'a']);
    let passees = [];
    const ids = ['a', 'b'];
    passees = passerFacture(passees, ordonnerPile(ids, passees)[0]); // passe « a »
    passees = passerFacture(passees, ordonnerPile(ids, passees)[0]); // passe « b »
    expect(ordonnerPile(ids, passees)).toEqual(['a', 'b']); // la pile tourne en rond, rien n'est perdu
  });

  test('P2 compteur discret : singulier, pluriel, « au moins » si la lecture est incomplète', () => {
    expect(texteRestantes(1)).toBe('1 restante');
    expect(texteRestantes(3)).toBe('3 restantes');
    expect(texteRestantes(500, false)).toBe('Au moins 500 restantes');
    expect(TEXTE_PILE_FINIE).toBe('Toutes les factures sont traitées');
  });
});

describe('lecture des factures à valider', () => {
  test('P1 une seule lecture, colonnes nommées, filtre « à valider », tri par date d’arrivée croissante ; les archivées sont écartées', async () => {
    const appels = [];
    const client = { lire: async (table, opts) => { appels.push({ table, ...opts }); return { lignes: [{ id: 'x', statut: 'a_valider', archivee_le: null }, { id: 'y', statut: 'a_valider', archivee_le: '2026-11-20' }, { id: 'z', statut: 'acceptee', archivee_le: null }], tronque: false }; } };
    const r = await creerDonnees({ client, actions: {} }).listerAValider();
    expect(r).toEqual({ ids: ['x'], complete: true });
    expect(appels).toHaveLength(1);
    expect(appels[0].table).toBe(TABLE_FACTURES);
    expect(appels[0].colonnes).toEqual(COLONNES_PILE);
    expect(appels[0].filtres).toEqual([['statut', 'eq', 'a_valider'], ['archivee_le', 'is', null]]); // P5 les archivées sont écartées par la requête elle-même (comme compterFacturesAValider)
    expect(appels[0].tri).toEqual([{ col: 'created_at', asc: true }, 'id']);
  });

  test('P3 la pile ne décide rien elle-même : pas d’appel aux actions métier ni de fetch dans pile.js ; sa seule écriture est « Annuler » (27/11/2026 : action `rouvrir`, par donnees-examiner.js)', () => {
    const code = readFileSync(new URL('../js/modules/achatsfactures/pile.js', import.meta.url), 'utf8');
    expect(/appelerActionMetier|fetch\(|validerFacture|\.decider\(/.test(code)).toBe(false);
    expect([...code.matchAll(/\.(rouvrir|archiver|desarchiver|relier|creerAgence)\(/g)].map((m) => m[1])).toEqual(['rouvrir']);
  });
});
