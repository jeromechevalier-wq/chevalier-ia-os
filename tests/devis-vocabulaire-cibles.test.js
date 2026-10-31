// Dictionnaire de vocabulaire : un mot qui désigne PLUSIEURS articles au choix (PR C5a de docs/cadrage-vocabulaire-cibles.md) : le moteur pur js/modules/devis/vocabulaire.js.
// Un test par critère, le nom commence par K1 à K8 puis K22 (règle d'affichage et question de précision). Catalogue, mots et phrases INVENTÉS : aucune donnée de client.
// Les familles (cibles « famille », contexte d'une famille) viennent avec la PR suivante (C6a) : ici seules les cibles « article » comptent.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as V from '../js/modules/devis/vocabulaire.js';

const REGLAGES = { marge: 20, modeMarge: 'majoration' };
const art = (id, libelle, extra = {}) => ({ id, libelle, prixAchat: 10, unite: 'u', actif: true, ...extra });
const mot = (cle, cibles, extra = {}) => ({ id: V.identifiantDeRegle(cle), cle, expression: cle, articleId: '', articleLibelle: '', cibles: cibles.map((id) => ({ genre: 'article', id, libelle: id })), statut: 'active', conflit: false, ...extra });
const motUnique = (cle, articleId, extra = {}) => ({ id: V.identifiantDeRegle(cle), cle, expression: cle, articleId, articleLibelle: '', statut: 'active', conflit: false, ...extra });
const chercher = (phrase, regles, articles, extra = {}) => V.interpreter(phrase, { regles, articles, reglages: REGLAGES, ...extra });
const ids = (r) => r.candidats.map((c) => c.articleId);

const P1 = art('p1', 'Prise simple 16 A');
const P2 = art('p2', 'Prise double 16 A');
const P3 = art('p3', 'Prise étanche 16 A');
const I1 = art('i1', 'Interrupteur étanche');
const I2 = art('i2', 'Interrupteur simple');
const B1 = art('b1', 'Boîte étanche');
const BASE = [P1, P2, P3, I1, I2, B1];
const PRISE = mot('prise', ['p1', 'p2', 'p3']);

describe('K1 le contexte : « prise » dit de quoi on parle, « étanche » est cherché dedans', () => {
  test('K1 « une prise étanche » avec le marqueur « prise » : le bon article, UNE question à un seul choix, sans liste, jamais l’interrupteur étanche', () => {
    const r = chercher('une prise étanche', [PRISE], BASE);
    assert.equal(r.decision, 'proposer');
    assert.equal(r.etape, 'article');
    assert.deepEqual(ids(r), ['p3']);
    assert.equal(r.candidats[0].score, 0.8);
    assert.equal(r.candidats[0].pourquoi, 'contexte_unique');
    assert.equal(r.question, 'C’est bien « Prise étanche 16 A » ?');
    assert.equal(r.autres, 0);
    assert.deepEqual(r.portee, { marqueurs: ['prise'], cibles: PRISE.cibles, nombreArticles: 3, reste: ['etanche'] });
    assert.ok(!ids(r).includes('i1') && !ids(r).includes('b1'));
  });
  test('K1 l’ordre des autres mots est sans importance (« étanche prise » = « prise étanche »)', () => {
    assert.deepEqual(ids(chercher('étanche prise', [PRISE], BASE)), ['p3']);
  });
  test('K1 un candidat net n’est pas noyé par des libellés à 0,60 plus loin : « prise étanche » reste un oui/non (le groupe se mesure à premier − 0,15)', () => {
    const autres = [art('m1', 'Prise étanche murale'), art('m2', 'Prise étanche IP44'), art('m3', 'Prise étanche saillie'), art('m4', 'Prise étanche encastrée')];
    const r = chercher('prise étanche', [PRISE], [...BASE, ...autres]);
    assert.equal(r.candidats[0].articleId, 'p3');
    assert.equal(r.etape, 'article');
    assert.equal(r.question, 'C’est bien « Prise étanche 16 A » ?');
    assert.ok(r.candidats.length > 1, 'les libellés plus loin restent dans les candidats (rappel), mais ne sont pas cités');
  });
  test('K1 plusieurs articles de la portée contiennent le reste : 0,65 chacun, proposés (3 cités au plus) ; le reste vide : chaque article choisi à 0,70', () => {
    const catalogue = [...BASE, art('p4', 'Prise double étanche 20 A')];
    const r = chercher('prise étanche', [mot('prise', ['p1', 'p2', 'p3', 'p4'])], catalogue);
    assert.deepEqual(r.candidats.filter((c) => c.pourquoi === 'contexte_plusieurs').map((c) => [c.articleId, c.score]), [['p4', 0.65], ['p3', 0.65]]);
    assert.equal(r.decision, 'proposer');
    const vide = chercher('prise', [PRISE], BASE);
    assert.deepEqual(vide.candidats.map((c) => [c.articleId, c.score, c.pourquoi]), [['p2', 0.7, 'cible_au_choix'], ['p3', 0.7, 'cible_au_choix'], ['p1', 0.7, 'cible_au_choix']]);
    assert.equal(vide.decision, 'proposer');
    assert.match(vide.question, /Prise double 16 A.*Prise étanche 16 A.*Prise simple 16 A/);
  });
});

describe('K2 sans marqueur, « étanche » seul reste ambigu', () => {
  test('K2 « étanche » seul avec 3 candidats : proposer à 3 choix, sans question de précision', () => {
    const r = chercher('étanche', [], BASE);
    assert.deepEqual(ids(r), ['b1', 'i1', 'p3']);
    assert.equal(r.decision, 'proposer');
    assert.equal(r.etape, 'article');
    assert.equal(r.autres, 0);
    assert.equal(r.portee, null);
  });
  test('K2 avec 4 candidats : 3 cités et « autres : 1 » ; la question dit combien d’autres, jamais la liste', () => {
    const r = chercher('étanche', [], [...BASE, art('g1', 'Gaine étanche')]);
    assert.equal(r.etape, 'article');
    assert.equal(r.autres, 1);
    assert.match(r.question, /, ou un autre \?$/);
  });
  test('K2 avec 5 candidats ou plus : UNE question de précision (etape « precision »), aucun article cité', () => {
    const r = chercher('étanche', [], [...BASE, art('g1', 'Gaine étanche'), art('c1', 'Câble étanche')]);
    assert.equal(r.decision, 'proposer');
    assert.equal(r.etape, 'precision');
    assert.equal(r.precision.nombreArticles, 5);
    assert.deepEqual(r.precision.mots, ['boîte', 'câble', 'gaine']); // des MOTS avant le nombre « 16 » ; chacun sépare un article
    assert.equal(r.precision.autreChose, true, '2 articles sur 5 ne sont joignables par aucun des trois mots');
    assert.equal(r.autres, 0);
    assert.doesNotMatch(r.question, /«/);
    assert.equal(r.question, 'Il y a 5 articles qui correspondent : boîte, câble, gaine ou autre chose ?');
    assert.equal(r.candidats.length, 5, 'les 5 premiers restent dans candidats (le serveur s’en sert pour vérifier une confirmation)');
  });
});

describe('K3 plusieurs marqueurs dans une phrase', () => {
  const ETANCHE = mot('etanche', ['p3', 'i1']);
  test('K3 deux marqueurs : l’INTERSECTION des portées (« prise » et « étanche » -> la prise étanche)', () => {
    const r = chercher('prise étanche', [PRISE, ETANCHE], BASE);
    assert.deepEqual(r.portee.marqueurs.sort(), ['etanche', 'prise']);
    assert.equal(r.portee.nombreArticles, 1);
    assert.deepEqual(r.candidats.filter((c) => c.pourquoi === 'cible_au_choix').map((c) => c.articleId), ['p3']);
  });
  test('K3 intersection vide : on ignore les marqueurs et on retombe sur le moteur d’avant, sans rien inventer', () => {
    const r = chercher('prise étanche', [mot('prise', ['p1', 'p2']), mot('etanche', ['i1', 'i2'])], BASE);
    assert.equal(r.portee, null);
    assert.deepEqual(ids(r), ids(chercher('prise étanche', [], BASE)));
  });
  test('K3 un marqueur de plusieurs mots l’emporte sur un marqueur plus court (« prise double » avant « prise »)', () => {
    const r = chercher('prise double', [PRISE, mot('prise double', ['p2', 'p3'])], BASE);
    assert.deepEqual(r.portee.marqueurs, ['prise double']);
    assert.equal(r.portee.nombreArticles, 2);
  });
});

describe('K3b le reste ne trouve rien dans la portée', () => {
  test('K3b « chemin de câble » avec le marqueur « câble » : le résultat est celui d’avant, tout le catalogue est cherché', () => {
    const catalogue = [art('c1', 'Câble rigide 2,5 mm²'), art('c2', 'Câble souple'), art('c3', 'Chemin de câble galvanisé')];
    const regles = [mot('cable', ['c1', 'c2'])];
    const avec = chercher('chemin de câble', regles, catalogue);
    assert.deepEqual(ids(avec), ['c3']);
    assert.equal(avec.portee, null);
    assert.deepEqual(avec.candidats, chercher('chemin de câble', [], catalogue).candidats);
  });
});

describe('K4 cibles mortes', () => {
  test('K4 articles désactivés ou supprimés, ou marqueur sans article vivant : le mot est sauté, aucune exception, même réponse que sans le mot', () => {
    const catalogue = [art('p1', 'Prise simple 16 A', { actif: false }), art('p2', 'Prise double 16 A', { actif: false }), P3];
    for (const regle of [mot('prise', ['p1', 'p2']), mot('prise', ['p1', 'fantome']), mot('prise', ['fantome1', 'fantome2'])]) {
      const avec = chercher('prise étanche', [regle], catalogue);
      assert.deepEqual(avec.candidats, chercher('prise étanche', [], catalogue).candidats);
      assert.equal(avec.portee, null);
    }
  });
  test('K4 un article de la portée désactivé n’est plus trouvé ; les cibles « famille » (PR suivante) sont ignorées sans erreur', () => {
    const catalogue = [P1, P2, art('p3', 'Prise étanche 16 A', { actif: false })];
    const r = chercher('prise', [mot('prise', ['p1', 'p2', 'p3'], { cibles: [{ genre: 'article', id: 'p1', libelle: '' }, { genre: 'article', id: 'p2', libelle: '' }, { genre: 'article', id: 'p3', libelle: '' }, { genre: 'famille', id: 'fam1', libelle: '' }] })], catalogue);
    assert.deepEqual(r.candidats.filter((c) => c.pourquoi === 'cible_au_choix').map((c) => c.articleId), ['p2', 'p1']); // ordre alphabétique du libellé
  });
});

describe('K5 mots à plusieurs cibles : ni désactivés, ni en conflit, ni à confirmer ne servent de marqueur', () => {
  test('K5 un mot désactivé, à confirmer, en conflit ou avec suggestion en attente n’est jamais un marqueur', () => {
    for (const extra of [{ statut: 'desactivee' }, { statut: 'a_confirmer' }, { conflit: true }, { suggestion: { articleId: 'p1', le: '2026-10-30' } }]) {
      const r = chercher('prise étanche', [mot('prise', ['p1', 'p2', 'p3'], extra)], BASE);
      assert.equal(r.portee, null, JSON.stringify(extra));
    }
  });
});

describe('K6 un mot à plusieurs cibles ne donne jamais « utiliser » par lui-même', () => {
  test('K6 aucun candidat du contexte ne dépasse 0,80 : jamais « utiliser », même avec un seul article dans la portée', () => {
    const solos = [chercher('prise étanche', [PRISE], BASE), chercher('prise', [PRISE], BASE), chercher('prise', [mot('prise', ['p1', 'p2'])], [P1, P2])];
    for (const r of solos) {
      assert.equal(r.decision, 'proposer');
      assert.ok(r.candidats.filter((c) => ['contexte_unique', 'contexte_plusieurs', 'cible_au_choix'].includes(c.pourquoi)).every((c) => c.score <= 0.8));
    }
  });
  test('K6 un libellé ou un code exact garde son 0,95 d’avant, marqueur ou non', () => {
    const r = chercher('Prise étanche 16 A', [PRISE], BASE);
    assert.equal(r.decision, 'utiliser');
    assert.equal(r.candidats[0].articleId, 'p3');
    assert.equal(r.candidats[0].score, 0.95);
  });
  test('K6 les seuils du contexte sont dans SEUILS et en dessous de `utiliser`', () => {
    for (const k of ['contexteUnique', 'contextePlusieurs', 'cibleAuChoix']) assert.ok(V.SEUILS[k] < V.SEUILS.utiliser, k);
  });
});

describe('K8 ciblesDe', () => {
  test('K8 sans `cibles`, un mot désigne son `articleId` ; `cibles` vide, absente ou non-liste aussi', () => {
    for (const cibles of [undefined, [], null, 'x', {}]) assert.deepEqual(V.ciblesDe({ articleId: 'a1', articleLibelle: 'Prise', cibles }), [{ genre: 'article', id: 'a1', libelle: 'Prise' }]);
    assert.deepEqual(V.ciblesDe({ articleId: '', cibles: [] }), []);
    assert.deepEqual(V.ciblesDe(null), []);
    assert.deepEqual(V.ciblesDe({}), []);
  });
  test('K8 une cible mal formée est ignorée sans exception ; plus de 8 cibles valables : les 8 premières', () => {
    const r = V.ciblesDe({ articleId: '', cibles: [{ genre: 'article', id: 'a', libelle: 'A' }, null, 'texte', { genre: 'autre', id: 'b' }, { genre: 'famille', id: '' }, { genre: 'famille', id: 'f1', libelle: 5 }] });
    assert.deepEqual(r, [{ genre: 'article', id: 'a', libelle: 'A' }, { genre: 'famille', id: 'f1', libelle: '' }]);
    const beaucoup = Array.from({ length: 12 }, (_, i) => ({ genre: 'article', id: `a${i}`, libelle: '' }));
    assert.equal(V.ciblesDe({ cibles: beaucoup }).length, 8);
  });
  test('K8 un ancien moteur (simulé) saute un mot dont `articleId` vaut « » : même résultat que sans le mot', () => {
    // Le moteur d'avant lisait `parId.get(regle.articleId)` : un article introuvable = règle sautée. Un mot sans cible valable fait de même.
    const r = chercher('prise', [{ ...motUnique('prise', ''), cibles: [] }], BASE);
    assert.deepEqual(r.candidats, chercher('prise', [], BASE).candidats);
  });
  test('K8 un mot à UN seul article se comporte comme avant (règle active à 1,00, via `cibles` ou `articleId`)', () => {
    const viaArticleId = chercher('prise', [motUnique('prise', 'p2')], BASE);
    const viaCibles = chercher('prise', [mot('prise', ['p2'])], BASE);
    assert.equal(viaArticleId.decision, 'utiliser');
    assert.deepEqual(viaCibles.candidats, viaArticleId.candidats);
  });
});

describe('K22 règle d’affichage : jamais réciter une liste', () => {
  const douze = ['simple', 'double', 'étanche'].flatMap((t, i) => [16, 20, 32, 40, 63].map((a) => art(`x${i}${a}`, `Prise ${t} ${a} A`))); // 15 articles : 3 types × 5 intensités
  test('K22 1 candidat clair = utilisé ; 3 candidats = 3 cités', () => {
    assert.equal(chercher('Prise double 16 A', [], BASE).decision, 'utiliser');
    const trois = chercher('étanche', [], BASE);
    assert.equal(trois.question.match(/«/g).length, 3);
  });
  test('K22 15 candidats : UNE question de précision, 3 mots au plus, mots écrits comme dans le libellé (« étanche », jamais « etanche »)', () => {
    const r = chercher('prise', [], douze);
    assert.equal(r.etape, 'precision');
    assert.equal(r.precision.nombreArticles, 15);
    assert.deepEqual(r.precision.mots, ['double', 'étanche', 'simple']);
    assert.equal(r.precision.autreChose, false);
    assert.equal(r.question, 'Il y a 15 articles qui correspondent : double, étanche ou simple ?');
  });
  test('K22 chaque mot ajouté réduit le groupe : la phrase complétée redonne un groupe plus petit', () => {
    const r = chercher('prise étanche', [], douze);
    assert.equal(r.etape, 'precision');
    assert.equal(r.precision.nombreArticles, 5);
    assert.deepEqual(r.precision.mots, ['16', '20', '32']);
    assert.equal(r.question, 'Il y a 5 articles qui correspondent : 16, 20 ou 32 A, ou autre chose ?'); // les nombres se disent tels quels, avec l’unité lue dans le libellé ; 2 articles ne sont joignables par aucun des trois
    const encore = chercher('prise étanche 32', [], douze);
    assert.equal(encore.etape, 'article');
    assert.equal(encore.candidats[0].libelle, 'Prise étanche 32 A');
  });
  test('K22 des nombres : « 16, 20 ou 25 A » ; les jetons qui mêlent chiffres et lettres (« 2p », « dj20 ») ne sont jamais proposés', () => {
    const dj = [16, 20, 25, 32, 40, 63].map((a) => art(`d${a}`, `Disjoncteur ${a} A 2P`));
    const r = chercher('disjoncteur', [], dj);
    assert.equal(r.etape, 'precision');
    assert.deepEqual(r.precision.mots, ['16', '20', '25']);
    assert.equal(r.question, 'Il y a 6 articles qui correspondent : 16, 20 ou 25 A, ou autre chose ?');
    assert.ok(!r.precision.mots.some((m) => /2p/i.test(m)));
  });
  test('K22 des mots qui ne couvrent pas la moitié du groupe : repli « 3 cités + autres » (une question qui n’avance pas est pire qu’une courte liste)', () => {
    const vis = Array.from({ length: 8 }, (_, i) => art(`v${i}`, `Vis modèle ${i}`));
    const r = chercher('vis', [], vis);
    assert.equal(r.etape, 'article');
    assert.equal(r.precision, null);
    assert.equal(r.question.match(/«/g).length, 3);
    assert.equal(r.autres, 5);
    assert.match(r.question, /, ou l’un des 5 autres \?$/);
  });
  test('K22 un article sans mot restant est injoignable par les mots : la question ajoute « ou autre chose »', () => {
    const prises = [art('n0', 'Prise 16 A'), art('n1', 'Prise double 16 A'), art('n2', 'Prise simple 16 A'), art('n3', 'Prise étanche 16 A'), art('n4', 'Prise triple 16 A')];
    const r = chercher('prise', [], prises);
    assert.equal(r.etape, 'precision');
    assert.equal(r.precision.autreChose, true);
    assert.equal(r.question, 'Il y a 5 articles qui correspondent : double, étanche, simple ou autre chose ?');
  });
  test('K22 à égalité de séparation, le plus utilisé passe en premier ; l’usage ne change pas le groupe', () => {
    const sans = chercher('prise', [], douze).precision.mots;
    const avec = chercher('prise', [], douze, { usages: new Map(douze.filter((a) => /étanche/.test(a.libelle)).map((a) => [a.id, { nombre: 5 }])) }).precision.mots;
    assert.deepEqual(sans, ['double', 'étanche', 'simple']);
    assert.deepEqual(new Set(avec), new Set(sans));
    assert.equal(avec[0], 'étanche');
  });
  test('K22 avec un marqueur, ses mots ne sont jamais proposés dans la question de précision', () => {
    const r = chercher('prise', [mot('prise', douze.map((a) => a.id))], douze);
    assert.equal(r.etape, 'precision');
    assert.ok(!r.precision.mots.includes('prise'));
    assert.deepEqual(r.portee.marqueurs, ['prise']);
  });
});

describe('K1b un article que l’humain n’a pas choisi ne dilue pas son choix', () => {
  test('K1b « prise » (3 articles choisis) avec 4 autres prises au catalogue : 3 cités, jamais de question de précision, aucun article hors choix cité', () => {
    const autres = ['bleue', 'rouge', 'verte', 'grise'].map((c, i) => art(`h${i}`, `Prise ${c} 10 A`));
    const r = chercher('prise', [PRISE], [...BASE, ...autres]);
    assert.equal(r.etape, 'article');
    assert.equal(r.autres, 0);
    assert.deepEqual(r.question.match(/«[^»]*»/g), ['« Prise double 16 A »', '« Prise étanche 16 A »', '« Prise simple 16 A »']);
    assert.equal(r.precision, null);
  });
});

describe('K22d détails de la question de précision', () => {
  test('K22d les nombres se comparent comme des nombres (16, 20, 100 : pas 100 avant 16) et l’unité n’est jamais un mot vide (« de »)', () => {
    const dj = [16, 20, 100, 125, 160, 250].map((a) => art(`n${a}`, `Disjoncteur ${a} A`));
    assert.deepEqual(chercher('disjoncteur', [], dj).precision.mots, ['16', '20', '100']);
    const vis = [10, 12, 14, 16, 18].map((a) => art(`v${a}`, `Vis ${a} de 50`));
    const r = chercher('vis', [], vis);
    assert.equal(r.etape, 'precision');
    assert.doesNotMatch(r.question, / de \?|de,/);
  });
});
