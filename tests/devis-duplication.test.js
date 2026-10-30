// « Dupliquer aux prix du jour » : fonction pure repriserSections (editeur-logique.js) et message des lignes disparues (actions-devis.js, numéros du nouveau brouillon).
// Chaque test commence par le numéro du critère (1 à 8, brief PR A5).
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import * as Ed from '../js/modules/devis/editeur-logique.js';

const articles = [
  { id: 'c1', libelle: 'BA13', unite: 'm²', prixAchat: 5, actif: true },
  { id: 'c2', libelle: 'Rail', unite: 'u', prixAchat: 10, actif: true },
  { id: 'f1', libelle: 'Carrelage 2026', unite: 'm²', prixAchat: 60, marge: 30, tauxTva: 10, actif: true },
  { id: 'off', libelle: 'Plinthe chêne', unite: 'ml', prixAchat: 8, actif: false },
  { id: 'o1', libelle: 'Cloison', unite: 'm²', type: 'ouvrage', composants: [{ articleId: 'c1', quantite: 2 }, { articleId: 'c2', quantite: 1 }], actif: true },
];
const devis = { marge: 20, modeMarge: 'majoration' };
const vieille = (id, articleId, extra = {}) => ({ genre: 'ligne', id, articleId, type: null, libelle: 'Ancien libellé', unite: 'm²', quantite: 4, prixAchat: 40, marge: 10, tauxTva: 20, prixVente: 99, ...extra });
const sections = () => [
  { id: 's1', titre: 'Cuisine', lignes: [vieille('l1', 'f1'), vieille('l2', 'off', { libelle: 'Plinthe chêne' }), vieille('l3', 'effacé', { libelle: 'Transport' })] },
  { id: 's2', titre: 'Salon', lignes: [Ed.ligneLibre('l4'), { id: 'saut', type: 'saut' }, Ed.ligneTexte('t1')] },
];

describe('1 repriserSections', () => {
  test('1 une ligne d’un article actif est refaite depuis l’article du jour, avec son identifiant et sa quantité ; plus de « genre » ni de prix de vente tapé', () => {
    const { sections: s } = Ed.repriserSections(sections(), articles, devis);
    const l = s[0].lignes[0];
    assert.equal(l.id, 'l1'); assert.equal(l.quantite, 4); assert.equal(l.articleId, 'f1');
    assert.equal(l.libelle, 'Carrelage 2026'); assert.equal(l.prixAchat, 60); assert.equal(l.marge, 30); assert.equal(l.tauxTva, 10);
    assert.equal('genre' in l, false);
    assert.equal(l.prixVente, undefined);
  });
  test('2 un ouvrage est re-figé avec sa composition du jour, et sa description suit la quantité reprise', () => {
    const s0 = [{ id: 's', titre: 'X', lignes: [vieille('lo', 'o1', { type: 'ouvrage', quantite: 3 })] }];
    const l = Ed.repriserSections(s0, articles, devis).sections[0].lignes[0];
    assert.equal(l.quantite, 3);
    assert.equal(l.ouvrage.composants.length, 2);
    assert.equal(l.description, '- BA13 (6 m²)\n- Rail (3 u)');
    assert.equal('genre' in l, false);
  });
  test('3 disparues : article désactivé, article supprimé et ligne libre sont gardés tels quels et listés avec section et ligne', () => {
    const r = Ed.repriserSections(sections(), articles, devis);
    assert.deepEqual(r.disparues.map((x) => [x.sectionId, x.ligneId]), [['s1', 'l2'], ['s1', 'l3'], ['s2', 'l4']]);
    assert.deepEqual(r.sections[0].lignes[1], sections()[0].lignes[1]);
    assert.deepEqual(r.sections[0].lignes[2], sections()[0].lignes[2]);
  });
  test('4 sauts de page et lignes de texte : gardés tels quels, jamais comptés comme disparus', () => {
    const r = Ed.repriserSections(sections(), articles, devis);
    assert.deepEqual(r.sections[1].lignes.slice(1), sections()[1].lignes.slice(1));
    assert.ok(!r.disparues.some((x) => ['saut', 't1'].includes(x.ligneId)));
  });
  test('5 la source n’est pas modifiée ; sans lignes, rien à recalculer', () => {
    const avant = JSON.stringify(sections());
    const src = sections();
    Ed.repriserSections(src, articles, devis);
    assert.equal(JSON.stringify(src), avant);
    assert.deepEqual(Ed.repriserSections([], articles, devis), { sections: [], disparues: [] });
    assert.deepEqual(Ed.repriserSections([{ id: 's', titre: 'V', lignes: [] }], articles, devis).disparues, []);
  });
});

describe('6 flux de duplication', () => {
  test('6 copieDeDevis garde la remise du devis ; repriserSections ensuite ne touche qu’aux lignes', () => {
    const source = { id: 'd', statut: 'brouillon', marge: 20, modeMarge: 'majoration', remise: { type: 'pourcentage', valeur: 5 }, sections: sections() };
    let n = 0;
    const c = Ed.copieDeDevis(source, () => `n${++n}`);
    assert.deepEqual(c.remise, source.remise);
    const r = Ed.repriserSections(c.sections, articles, devis);
    assert.equal(r.disparues.length, 3);
    assert.ok(r.sections[0].lignes[0].id.startsWith('n'), 'identifiants renouvelés par copieDeDevis, gardés par repriserSections');
  });
  test('7 numéros du message : ceux du NOUVEAU brouillon (numerotation)', () => {
    const r = Ed.repriserSections(sections(), articles, devis);
    const n = Ed.numerotation(r.sections);
    assert.deepEqual(r.disparues.map((x) => `${n[x.ligneId]} ${x.libelle}`), ['1.2 Plinthe chêne', '1.3 Transport', '2.1 ']);
  });
});
