// Écran « Vocabulaire », un mot qui désigne une FAMILLE (PR C6b de docs/cadrage-vocabulaire-cibles.md) : les plans et textes PURS de js/modules/devis/vocabulaire-plans.js et la logique du sélecteur.
// Un test par point, le nom commence par C6b.x. Catalogue, familles, mots et phrases INVENTÉS : aucune donnée de client.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as P from '../js/modules/devis/vocabulaire-plans.js';
import * as L from '../js/modules/devis/selecteur-catalogue-logique.js';
import { famillesDe } from '../js/modules/devis/familles.js';
import { interpreter } from '../js/modules/devis/vocabulaire.js';

const art = (id, libelle, familleId, extra = {}) => ({ id, libelle, prixAchat: 10, unite: 'u', actif: true, type: 'fourniture', ...(familleId ? { familleId } : {}), ...extra });
const FAMILLES = famillesDe({ liste: [
  { id: 'f-prises', nom: 'Prises', actif: true, parentId: 'famille-1' },
  { id: 'f-vide', nom: 'Rallonges', actif: true, parentId: 'famille-1' },
  { id: 'f-off', nom: 'Anciennes prises', actif: false, parentId: 'famille-1' },
] });
const CATALOGUE = [art('p1', 'Prise simple 16 A', 'f-prises'), art('p2', 'Prise double 16 A', 'f-prises'), art('p3', 'Prise étanche 16 A', 'f-prises'), art('i1', 'Interrupteur étanche', 'famille-1-8'),
  art('off', 'Prise ancienne', 'f-prises', { actif: false }), art('txt', 'Texte libre', 'f-prises', { type: 'texte' })];
const CTX = { aujourdhui: '2026-10-31' };
const OPTIONS = { articles: CATALOGUE, familles: FAMILLES };
const mot = (cibles, extra = {}) => ({ id: 'prise', cle: 'prise', expression: 'prise', articleId: '', articleLibelle: '', cibles, statut: 'active', origine: 'manuelle', confirmations: 0, contradictions: 0, conflit: false, exemples: [], ...extra });
const famille = (id, libelle = id) => ({ genre: 'famille', id, libelle });
const article = (id, libelle = id) => ({ genre: 'article', id, libelle });
const donneesDe = (plan) => plan.ecritures[0].donnees;

describe('C6b.1 créer un mot qui désigne une famille', () => {
  test('C6b.1 une famille seule : `cibles` avec son chemin, AUCUN article ; validé par toi comme tout mot ajouté ici', () => {
    const plan = P.planCreerMot({ expression: 'prise', cibles: [{ genre: 'famille', id: 'f-prises' }] }, CTX, { regles: [], ...OPTIONS });
    assert.deepEqual(plan.erreurs, {});
    const d = donneesDe(plan);
    assert.deepEqual([d.articleId, d.articleLibelle], ['', '']);
    assert.deepEqual(d.cibles, [{ genre: 'famille', id: 'f-prises', libelle: 'Fournitures › Prises' }]);
    assert.deepEqual([d.statut, d.origine, d.validePar, d.valideLe], ['active', 'manuelle', 'humain', '2026-10-31']);
  });
  test('C6b.1 une famille et deux articles : les trois cibles dans l’ordre choisi, sans doublon', () => {
    const plan = P.planCreerMot({ expression: 'prise', cibles: [{ genre: 'article', id: 'i1' }, { genre: 'famille', id: 'f-prises' }, { genre: 'article', id: 'i1' }, { genre: 'article', id: 'p1' }] }, CTX, { regles: [], ...OPTIONS });
    assert.deepEqual(plan.erreurs, {});
    assert.deepEqual(donneesDe(plan).cibles.map((c) => `${c.genre}:${c.id}`), ['article:i1', 'famille:f-prises', 'article:p1']);
  });
  test('C6b.1 une famille VIDE est permise (elle se remplira) ; une famille désactivée, supprimée ou un article désactivé est refusé avec son message', () => {
    assert.deepEqual(P.planCreerMot({ expression: 'rallonge', cibles: [{ genre: 'famille', id: 'f-vide' }] }, CTX, { regles: [], ...OPTIONS }).erreurs, {});
    for (const id of ['f-off', 'fantome']) assert.equal(P.planCreerMot({ expression: 'x', cibles: [{ genre: 'famille', id }] }, CTX, { regles: [], ...OPTIONS }).erreurs.articleId, P.MESSAGE_FAMILLE_INTROUVABLE);
    assert.equal(P.planCreerMot({ expression: 'x', cibles: [{ genre: 'article', id: 'off' }] }, CTX, { regles: [], ...OPTIONS }).erreurs.articleId, P.MESSAGE_ARTICLE_INTROUVABLE);
    assert.equal(P.planCreerMot({ expression: 'x', cibles: [] }, CTX, { regles: [], ...OPTIONS }).erreurs.articleId, P.MESSAGE_ARTICLE_INTROUVABLE, 'rien de choisi : cas d’erreur du formulaire');
  });
  test('C6b.1 neuf choix au plus 8 : refusé ; 8 choix mêlant articles et familles : accepté ; l’ancienne forme (articleIds, articleId) donne les mêmes mots', () => {
    const neuf = Array.from({ length: 9 }, (_, i) => ({ genre: 'article', id: `a${i}` }));
    assert.equal(P.planCreerMot({ expression: 'x', cibles: neuf }, CTX, { regles: [], ...OPTIONS }).erreurs.articleId, P.MESSAGE_TROP_DE_CIBLES);
    const huit = [{ genre: 'famille', id: 'f-prises' }, { genre: 'famille', id: 'f-vide' }, ...['p1', 'p2', 'p3', 'i1'].map((id) => ({ genre: 'article', id })), { genre: 'famille', id: 'famille-1-8' }, { genre: 'famille', id: 'famille-1-7' }];
    assert.deepEqual(P.planCreerMot({ expression: 'x', cibles: huit }, CTX, { regles: [], ...OPTIONS }).erreurs, {});
    assert.deepEqual(donneesDe(P.planCreerMot({ expression: 'p', articleIds: ['p1', 'p2'] }, CTX, { regles: [], ...OPTIONS })).cibles.map((c) => c.id), ['p1', 'p2']);
    assert.equal(donneesDe(P.planCreerMot({ expression: 'p', articleId: 'p1' }, CTX, { regles: [], ...OPTIONS })).articleId, 'p1');
  });
});

describe('C6b.2 changer ce que désigne un mot : une famille, ou un mélange', () => {
  test('C6b.2 un mot à un article devient « une famille » : `cibles` écrite, `articleId` vidé ; le conflit est tranché', () => {
    const regle = mot([], { articleId: 'p1', articleLibelle: 'Prise simple 16 A', conflit: true });
    const plan = P.planChangerCibles('prise', [{ genre: 'famille', id: 'f-prises' }], { regles: [regle], ...OPTIONS, aujourdhui: '2026-10-31' });
    assert.deepEqual(plan.erreurs, {});
    assert.deepEqual([plan.patch.articleId, plan.patch.articleLibelle, plan.patch.conflit], ['', '', false]);
    assert.deepEqual(plan.patch.cibles, [{ genre: 'famille', id: 'f-prises', libelle: 'Fournitures › Prises' }]);
  });
  test('C6b.2 une famille qui revient à un seul article : `articleId` remis et `cibles` vidée (jamais de double sens)', () => {
    const regle = mot([famille('f-prises')]);
    const plan = P.planChangerCibles('prise', ['p2'], { regles: [regle], ...OPTIONS, aujourdhui: '2026-10-31' });
    assert.deepEqual([plan.patch.articleId, plan.patch.articleLibelle, plan.patch.cibles], ['p2', 'Prise double 16 A', []]);
  });
  test('C6b.2 les mêmes choix ne changent rien (sauf le chemin d’une famille renommée depuis) ; une famille supprimée refuse l’écriture avec son message', () => {
    const memes = mot([famille('f-prises', 'Fournitures › Prises')], { validePar: 'humain', valideLe: '2026-10-01' });
    assert.deepEqual(P.planChangerCibles('prise', [{ genre: 'famille', id: 'f-prises' }], { regles: [memes], ...OPTIONS, aujourdhui: '2026-10-31' }).ecritures, []);
    const ancien = mot([famille('f-prises', 'Prises')], { validePar: 'humain', valideLe: '2026-10-01' });
    assert.deepEqual(P.planChangerCibles('prise', [{ genre: 'famille', id: 'f-prises' }], { regles: [ancien], ...OPTIONS, aujourdhui: '2026-10-31' }).patch.cibles, [famille('f-prises', 'Fournitures › Prises')]);
    assert.equal(P.planChangerCibles('prise', [{ genre: 'famille', id: 'fantome' }], { regles: [memes], ...OPTIONS }).erreurs.articleId, P.MESSAGE_FAMILLE_INTROUVABLE);
  });
});

describe('C6b.3 ce que montre l’écran : désignation, résumé, pastilles', () => {
  test('C6b.3 designation d’une famille : le nombre d’articles choisissables (sous-familles comprises), jamais un article désactivé ni un texte', () => {
    const d = P.designation(mot([famille('f-prises')]), CATALOGUE, FAMILLES);
    assert.deepEqual([d.nombre, d.multiple, d.mort, d.vide, d.disponibles, d.familles[0].nombreArticles, d.familles[0].libelle], [1, true, false, false, 3, 3, 'Fournitures › Prises']);
    const parente = P.designation(mot([famille('famille-1')]), CATALOGUE, FAMILLES); // la famille de premier niveau contient ses sous-familles
    assert.equal(parente.familles[0].nombreArticles, 4);
  });
  test('C6b.3 famille VIDE = pas morte mais « vide » ; famille désactivée ou supprimée = morte (« Aucun article disponible ») ; un article en plus la garde vivante', () => {
    const vide = P.designation(mot([famille('f-vide')]), CATALOGUE, FAMILLES);
    assert.deepEqual([vide.mort, vide.vide, vide.disponibles], [false, true, 0]);
    for (const id of ['f-off', 'fantome']) {
      const d = P.designation(mot([famille(id)]), CATALOGUE, FAMILLES);
      assert.deepEqual([d.mort, d.vide, d.familles[0].vivant], [true, false, false]);
    }
    const avecArticle = P.designation(mot([famille('f-vide'), article('p1')]), CATALOGUE, FAMILLES);
    assert.deepEqual([avecArticle.mort, avecArticle.vide, avecArticle.disponibles], [false, false, 1]);
    assert.equal(P.designation(mot([famille('f-prises'), article('p1')]), CATALOGUE, FAMILLES).disponibles, 3, 'un article déjà dans la famille ne compte qu’une fois');
    assert.deepEqual(P.designation(mot([article('p1')]), CATALOGUE).familles, [], 'sans liste de familles, un mot à articles est comme avant');
  });
  test('C6b.3 resumeDesigne : « 3 articles au choix », « Famille … (3 articles) », « Famille … (vide) », « Famille … + 2 articles », « 2 familles »', () => {
    const r = (cibles) => P.resumeDesigne(P.designation(mot(cibles), CATALOGUE, FAMILLES));
    assert.equal(r([article('p1'), article('p2'), article('p3')]), '3 articles au choix');
    assert.equal(r([famille('f-prises')]), 'Famille Fournitures › Prises (3 articles)');
    assert.equal(r([famille('f-vide')]), 'Famille Fournitures › Rallonges (vide)');
    assert.equal(r([famille('f-prises'), article('i1'), article('p1')]), 'Famille Fournitures › Prises + 2 articles');
    assert.equal(r([famille('f-prises'), famille('f-vide')]), '2 familles');
    assert.equal(r([famille('f-off')]), 'Famille Fournitures › Anciennes prises (désactivée)');
    assert.equal(r([famille('fantome')]), 'Famille fantome (désactivée)', 'une famille supprimée : le libellé copié, ou son identifiant');
  });
  test('C6b.3 activer un mot dont la famille est vide est permis (elle se remplira) ; activer un mot dont la famille est supprimée est refusé', () => {
    const vide = mot([famille('f-vide')], { statut: 'desactivee' });
    assert.deepEqual(P.planChangerStatut('prise', 'active', { regles: [vide], ...OPTIONS, aujourdhui: '2026-10-31' }).erreurs, {});
    const morte = mot([famille('fantome')], { statut: 'desactivee' });
    assert.equal(P.planChangerStatut('prise', 'active', { regles: [morte], ...OPTIONS }).erreurs.general, P.MESSAGE_CIBLES_INDISPONIBLES);
  });
  test('C6b.3 la recherche de mots trouve un mot par le nom de sa famille', () => {
    const mots = [mot([famille('f-prises', 'Fournitures › Prises')]), mot([article('i1', 'Interrupteur étanche')], { id: 'interrupteur', cle: 'interrupteur', expression: 'interrupteur' })];
    assert.deepEqual(P.filtrerMots(mots, {}, 'fournitures prises').map((r) => r.id), ['prise']);
  });
});

describe('C6b.4 « Essayer une phrase » : la portée dite avec une famille', () => {
  test('C6b.4 phrasePortee : sans famille, le texte d’avant, mot pour mot', () => {
    assert.equal(P.phrasePortee({ marqueurs: ['prise'], cibles: [article('p1'), article('p2'), article('p3')], nombreArticles: 3, reste: ['etanche'] }), 'Je comprends : « prise » désigne 3 articles au choix et je cherche « etanche » parmi eux.');
    assert.equal(P.phrasePortee({ marqueurs: ['prise'], cibles: [article('p1'), article('p2')], nombreArticles: 2, reste: [] }), 'Je comprends : « prise » désigne 2 articles au choix.');
  });
  test('C6b.4 phrasePortee : une famille, une famille et des articles, plusieurs familles, plusieurs marqueurs', () => {
    assert.equal(P.phrasePortee({ marqueurs: ['prise'], cibles: [famille('f-prises', 'Fournitures › Prises')], nombreArticles: 3, reste: ['etanche'] }), 'Je comprends : « prise » désigne la famille Fournitures › Prises et je cherche « etanche » dedans.');
    assert.equal(P.phrasePortee({ marqueurs: ['prise'], cibles: [famille('f-prises', 'Prises'), article('i1'), article('p1')], nombreArticles: 4, reste: [] }), 'Je comprends : « prise » désigne la famille Prises et 2 articles.');
    assert.equal(P.phrasePortee({ marqueurs: ['prise'], cibles: [famille('a', 'Prises'), famille('b', 'Tableaux')], nombreArticles: 5, reste: ['x'] }), 'Je comprends : « prise » désigne les familles Prises et Tableaux et je cherche « x » dedans.');
    assert.equal(P.phrasePortee({ marqueurs: ['prise', 'exterieur'], cibles: [famille('a', 'Prises')], nombreArticles: 1, reste: [] }), 'Je comprends : « prise » + « exterieur » désigne la famille Prises.');
  });
  test('C6b.4 phrasePortee avec la liste des familles : le nom d’aujourd’hui (chemin), même pour un mot écrit sans libellé ; une famille supprimée garde son libellé copié', () => {
    const portee = { marqueurs: ['prise'], cibles: [famille('f-prises', ''), famille('fantome', 'Ancien nom')], nombreArticles: 3, reste: [] };
    assert.equal(P.phrasePortee(portee, FAMILLES), 'Je comprends : « prise » désigne les familles Fournitures › Prises et Ancien nom.');
  });
  test('C6b.4 phrasePortee : un article désactivé ne compte pas (catalogue donné) ; la même famille visée deux fois est dite une fois', () => {
    const portee = { marqueurs: ['prise', 'x'], cibles: [famille('f-prises', 'Prises'), article('off'), article('p1'), famille('f-prises', 'Prises')], nombreArticles: 3, reste: [] };
    assert.equal(P.phrasePortee(portee, FAMILLES, CATALOGUE), 'Je comprends : « prise » + « x » désigne la famille Fournitures › Prises et 1 article.');
  });
  test('C6b.4 phrasePortee suit le moteur : la portée rendue par `interpreter` pour un mot-famille donne la phrase attendue', () => {
    const regles = [mot([famille('f-prises', 'Fournitures › Prises')])];
    const r = interpreter('une prise étanche', { regles, articles: CATALOGUE, reglages: { marge: 20, modeMarge: 'majoration' }, familles: FAMILLES });
    assert.equal(P.phrasePortee(r.portee), 'Je comprends : « prise » désigne la famille Fournitures › Prises et je cherche « etanche » dedans.');
  });
});

describe('C6b.5 export CSV : la colonne « Famille »', () => {
  test('C6b.5 l’en-tête gagne « Famille » après « Article » ; un mot à une famille la met là, ses articles dans « Article » ; plusieurs familles séparées par « / »', () => {
    assert.deepEqual([...P.ENTETE_CSV].slice(0, 3), ['Expression', 'Article', 'Famille']);
    const csv = P.construireCsv([
      mot([famille('f-prises', 'Fournitures › Prises')]),
      mot([famille('a', 'Prises'), famille('b', 'Tableaux'), article('i1', 'Interrupteur étanche')], { id: 'x', cle: 'x', expression: 'x' }),
    ]);
    const lignes = csv.replace('﻿', '').trim().split('\r\n');
    assert.equal(lignes[1], 'prise,,Fournitures › Prises,Actif,Ajouté ici,0,');
    assert.equal(lignes[2], 'x,Interrupteur étanche,Prises / Tableaux,Actif,Ajouté ici,0,');
  });
});

describe('C6b.6 le sélecteur : recherche de familles', () => {
  test('C6b.6 rechercherFamilles : sans accent ni casse, dans le chemin, jamais une famille désactivée, 8 au plus, vide si rien n’est tapé', () => {
    assert.deepEqual(L.rechercherFamilles(FAMILLES, 'prise').map((f) => f.id), ['f-prises']);
    assert.deepEqual(L.rechercherFamilles(FAMILLES, 'FOURNITURES rallonge').map((f) => [f.id, f.chemin]), [['f-vide', 'Fournitures › Rallonges']]);
    assert.deepEqual(L.rechercherFamilles(FAMILLES, 'anciennes'), [], 'une famille désactivée n’est jamais proposée');
    assert.deepEqual(L.rechercherFamilles(FAMILLES, 'electricite').length >= 1, true, 'sans accent');
    assert.equal(L.rechercherFamilles(FAMILLES, 'a', 3).length <= 3, true);
    assert.deepEqual(L.rechercherFamilles(FAMILLES, '   '), []);
    assert.deepEqual(L.rechercherFamilles(FAMILLES, 'zzz'), [], 'aucun résultat : cas vide');
  });
  test('C6b.6 familleChoisissable : existe et pas désactivée', () => {
    assert.equal(L.familleChoisissable({ id: 'x', actif: true }), true);
    assert.equal(L.familleChoisissable({ id: 'x' }), true);
    assert.equal(L.familleChoisissable({ id: 'x', actif: false }), false);
    assert.equal(L.familleChoisissable(undefined), false);
  });
});
