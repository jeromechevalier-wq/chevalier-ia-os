// Écran « Vocabulaire », plusieurs articles au choix (PR C5b de docs/cadrage-vocabulaire-cibles.md) : les plans PURS de js/modules/devis/vocabulaire-plans.js.
// Un test par point, le nom commence par C5b.x. Catalogue, mots et phrases INVENTÉS. Les familles viennent avec la PR suivante (C6b).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../js/modules/devis/vocabulaire-plans.js';

const art = (id, libelle, extra = {}) => ({ id, libelle, prixAchat: 10, unite: 'u', actif: true, ...extra });
const CATALOGUE = [art('p1', 'Prise simple 16 A'), art('p2', 'Prise double 16 A'), art('p3', 'Prise étanche 16 A'), art('i1', 'Interrupteur étanche'), art('off', 'Prise ancienne', { actif: false }), art('txt', 'Texte libre', { type: 'texte' })];
const CTX = { aujourdhui: '2026-10-31' };
const unique = (extra = {}) => ({ id: 'prise', cle: 'prise', expression: 'prise', articleId: 'p1', articleLibelle: 'Prise simple 16 A', statut: 'active', origine: 'manuelle', confirmations: 0, contradictions: 0, conflit: false, exemples: [], ...extra });
const multiple = (ids = ['p1', 'p2', 'p3'], extra = {}) => ({ ...unique({ articleId: '', articleLibelle: '' }), cibles: ids.map((id) => ({ genre: 'article', id, libelle: CATALOGUE.find((a) => a.id === id)?.libelle ?? '' })), ...extra });
const donneesDe = (plan) => plan.ecritures[0].donnees;

describe('C5b.1 créer un mot : un article ou plusieurs au choix', () => {
  test('C5b.1 un seul article : `articleId` comme avant, aucune `cibles`', () => {
    const plan = P.planCreerMot({ expression: 'prises', articleIds: ['p2'] }, CTX, { articles: CATALOGUE });
    assert.deepEqual(plan.erreurs, {});
    const d = donneesDe(plan);
    assert.deepEqual([d.articleId, d.articleLibelle, 'cibles' in d], ['p2', 'Prise double 16 A', false]);
    assert.deepEqual(donneesDe(P.planCreerMot({ expression: 'prises', articleId: 'p2' }, CTX, { articles: CATALOGUE })), d, 'l’ancienne forme (articleId) donne le même mot');
  });
  test('C5b.1 plusieurs articles : `cibles` (dans l’ordre choisi, sans doublon) et AUCUN article ; validé par toi comme tout mot ajouté ici', () => {
    const plan = P.planCreerMot({ expression: 'prise', articleIds: ['p3', 'p1', 'p3', 'p2'] }, CTX, { articles: CATALOGUE });
    assert.deepEqual(plan.erreurs, {});
    const d = donneesDe(plan);
    assert.deepEqual([d.articleId, d.articleLibelle], ['', '']);
    assert.deepEqual(d.cibles, [{ genre: 'article', id: 'p3', libelle: 'Prise étanche 16 A' }, { genre: 'article', id: 'p1', libelle: 'Prise simple 16 A' }, { genre: 'article', id: 'p2', libelle: 'Prise double 16 A' }]);
    assert.deepEqual([d.statut, d.origine, d.validePar, d.valideLe, d.confirmations], ['active', 'manuelle', 'humain', '2026-10-31', 0]);
  });
  test('C5b.1 le libellé copié d’une cible fait 120 caractères au plus (la limite des règles Firestore)', () => {
    const long = art('long', 'x'.repeat(200));
    const d = donneesDe(P.planCreerMot({ expression: 'x', articleIds: ['long', 'p1'] }, CTX, { articles: [long, ...CATALOGUE] }));
    assert.equal(d.cibles[0].libelle.length, 120);
  });
  test('C5b.1 erreurs : aucun article, plus de 8, un article désactivé ou un texte libre dans le lot : rien n’est écrit, un message qui dit quoi faire', () => {
    for (const ids of [[], undefined, ['off'], ['p1', 'txt'], ['p1', 'inconnu']]) {
      const plan = P.planCreerMot({ expression: 'prise', articleIds: ids }, CTX, { articles: CATALOGUE });
      assert.equal(plan.erreurs.articleId, P.MESSAGE_ARTICLE_INTROUVABLE, JSON.stringify(ids));
      assert.deepEqual(plan.ecritures, []);
    }
    const neuf = Array.from({ length: 9 }, (_, i) => art(`n${i}`, `Article ${i}`));
    const trop = P.planCreerMot({ expression: 'prise', articleIds: neuf.map((a) => a.id) }, CTX, { articles: neuf });
    assert.equal(trop.erreurs.articleId, P.MESSAGE_TROP_DE_CIBLES);
    assert.match(P.MESSAGE_TROP_DE_CIBLES, /8 articles au plus/);
    assert.equal(P.planCreerMot({ expression: 'prise', articleIds: neuf.slice(0, 8).map((a) => a.id) }, CTX, { articles: neuf }).erreurs.articleId, undefined, '8 articles : permis');
  });
});

describe('C5b.2 changer ce que désigne un mot', () => {
  test('C5b.2 un article -> plusieurs : `cibles` posée, `articleId` et son libellé vidés ; plusieurs -> un seul : `articleId` posé, `cibles` vidée (jamais un mot à double sens)', () => {
    const vers = P.planChangerCibles('prise', ['p1', 'p2'], { regles: [unique()], articles: CATALOGUE, aujourdhui: '2026-10-31' });
    assert.deepEqual(vers.patch.articleId, '');
    assert.deepEqual(vers.patch.articleLibelle, '');
    assert.deepEqual(vers.patch.cibles.map((c) => c.id), ['p1', 'p2']);
    const retour = P.planChangerCibles('prise', ['p3'], { regles: [multiple()], articles: CATALOGUE, aujourdhui: '2026-10-31' });
    assert.deepEqual([retour.patch.articleId, retour.patch.articleLibelle, retour.patch.cibles], ['p3', 'Prise étanche 16 A', []]);
    for (const plan of [vers, retour]) { // la règle Firestore : des cibles non vides n'ont pas d'article
      const apres = { ...(plan === vers ? unique() : multiple()), ...plan.patch };
      assert.ok(!(apres.cibles?.length && apres.articleId), JSON.stringify(plan.patch));
    }
  });
  test('C5b.2 les mêmes articles ne changent rien (sauf la validation humaine) ; un conflit est tranché ; un libellé renommé suit', () => {
    const rien = P.planChangerCibles('prise', ['p1', 'p2', 'p3'], { regles: [multiple(['p1', 'p2', 'p3'], { validePar: 'humain', valideLe: '2026-10-01' })], articles: CATALOGUE, aujourdhui: '2026-10-31' });
    assert.deepEqual(rien.ecritures, []);
    const tranche = P.planChangerCibles('prise', ['p1', 'p2'], { regles: [multiple(['p1', 'p2'], { conflit: true })], articles: CATALOGUE, aujourdhui: '2026-10-31' });
    assert.equal(tranche.patch.conflit, false);
    const renomme = [art('p1', 'Prise simple 10 A'), CATALOGUE[1]];
    const suit = P.planChangerCibles('prise', ['p1', 'p2'], { regles: [multiple(['p1', 'p2'], { validePar: 'humain', valideLe: '2026-10-01' })], articles: renomme, aujourdhui: '2026-10-31' });
    assert.equal(suit.patch.cibles[0].libelle, 'Prise simple 10 A');
  });
  test('C5b.2 `planChangerArticle` reste valable (un seul article) et vide les `cibles` d’un mot à plusieurs articles', () => {
    const plan = P.planChangerArticle('prise', 'p2', { regles: [multiple()], articles: CATALOGUE, aujourdhui: '2026-10-31' });
    assert.deepEqual([plan.patch.articleId, plan.patch.cibles], ['p2', []]);
    assert.equal(P.planChangerArticle('prise', 'off', { regles: [unique()], articles: CATALOGUE }).erreurs.articleId, P.MESSAGE_ARTICLE_INTROUVABLE);
  });
  test('C5b.2 erreurs : mot introuvable, aucun article, plus de 8, un article mort : rien n’est écrit', () => {
    assert.ok(P.planChangerCibles('absent', ['p1'], { regles: [unique()], articles: CATALOGUE }).erreurs.general);
    for (const ids of [[], ['off'], ['p1', 'txt']]) assert.equal(P.planChangerCibles('prise', ids, { regles: [unique()], articles: CATALOGUE }).erreurs.articleId, P.MESSAGE_ARTICLE_INTROUVABLE);
    const neuf = Array.from({ length: 9 }, (_, i) => art(`n${i}`, `Article ${i}`));
    assert.equal(P.planChangerCibles('prise', neuf.map((a) => a.id), { regles: [unique()], articles: neuf }).erreurs.articleId, P.MESSAGE_TROP_DE_CIBLES);
  });
});

describe('C5b.3 activer, désigner, filtrer, exporter', () => {
  test('C5b.3 activer un mot à plusieurs articles : permis si un article au moins est vivant ; refusé (message qui dit quoi faire) si tous sont morts', () => {
    const mortUn = multiple(['p1', 'off'], { statut: 'desactivee' });
    assert.deepEqual(P.planChangerStatut('prise', 'active', { regles: [mortUn], articles: CATALOGUE, aujourdhui: '2026-10-31' }).erreurs, {});
    const tousMorts = multiple(['off', 'txt'], { statut: 'desactivee' });
    assert.equal(P.planChangerStatut('prise', 'active', { regles: [tousMorts], articles: CATALOGUE }).erreurs.general, P.MESSAGE_CIBLES_INDISPONIBLES);
    assert.match(P.planChangerStatut('prise', 'active', { regles: [unique({ articleId: 'off', statut: 'desactivee' })], articles: CATALOGUE }).erreurs.general, /L’article de ce mot est désactivé/);
    assert.deepEqual(P.planChangerStatut('prise', 'active', { regles: [tousMorts], articles: CATALOGUE, restaurer: true }).erreurs, {}, 'Annuler une désactivation remet l’état d’avant sans revérifier');
  });
  test('C5b.3 designation : un article, plusieurs, vivants ou non ; « mort » = aucun article vivant ; un mot sans article ni cibles est mort', () => {
    assert.deepEqual(P.designation(unique(), CATALOGUE), { articles: [{ id: 'p1', libelle: 'Prise simple 16 A', vivant: true }], nombre: 1, multiple: false, mort: false });
    const d = P.designation(multiple(['p1', 'off', 'fantome']), CATALOGUE);
    assert.deepEqual([d.nombre, d.multiple, d.mort, d.articles.map((a) => a.vivant)], [3, true, false, [true, false, false]]);
    assert.equal(P.designation(multiple(['off', 'txt']), CATALOGUE).mort, true);
    assert.equal(P.designation(unique({ articleId: '' }), CATALOGUE).mort, true);
    assert.equal(P.designation(null, CATALOGUE).mort, true);
  });
  test('C5b.3 la recherche trouve un mot par le libellé d’un de ses articles', () => {
    const mots = [multiple(['p1', 'p3']), unique({ id: 'interrupteur', cle: 'interrupteur', expression: 'interrupteur', articleId: 'i1', articleLibelle: 'Interrupteur étanche' })];
    assert.deepEqual(P.filtrerMots(mots, {}, 'étanche').map((r) => r.id), ['prise', 'interrupteur']);
    assert.deepEqual(P.filtrerMots(mots, {}, 'prise simple').map((r) => r.id), ['prise']);
    assert.deepEqual(P.filtrerMots(mots, {}, 'gaine'), []);
  });
  test('C5b.3 l’export CSV met les articles d’un mot à plusieurs articles dans la colonne « Article », séparés par « / » ; un mot à un article ne change pas', () => {
    const csv = P.construireCsv([multiple(['p1', 'p3'], { expression: 'prise' }), unique({ id: 'gaine', cle: 'gaine', expression: 'gaine', articleId: 'g', articleLibelle: 'Gaine ICTA 20 mm' })]);
    const lignes = csv.replace('﻿', '').trim().split('\r\n');
    assert.equal(lignes[0], P.ENTETE_CSV.join(','));
    assert.equal(lignes[1], 'gaine,Gaine ICTA 20 mm,Actif,Ajouté ici,0,');
    assert.equal(lignes[2], 'prise,Prise simple 16 A / Prise étanche 16 A,Actif,Ajouté ici,0,');
  });
  test('C5b.3 E11 : `cibles` est le seul champ ajouté à ceux qu’un navigateur change ; jamais `suggestion`, jamais un compteur', () => {
    assert.ok(P.CHAMPS_MODIFIABLES.includes('cibles'));
    assert.ok(!P.CHAMPS_MODIFIABLES.includes('suggestion') && !P.CHAMPS_MODIFIABLES.includes('confirmations'));
  });
});
