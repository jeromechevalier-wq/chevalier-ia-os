// Module Devis, types d'article et ouvrages composés : logique pure de js/modules/devis/ouvrages.js et plans d'articles.js.
// Un test par critère (le nom commence par O1 à O8) ; les outils MCP (O9) sont dans ecriture-outils.test.js, l'écran (O10) dans tests/e2e/devis-ouvrages.spec.js.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as O from '../js/modules/devis/ouvrages.js';
import * as A from '../js/modules/devis/articles.js';

const REGLAGES = { marge: 20, modeMarge: 'majoration' };
/** Les trois composants de référence : achats 5,75 / 1,90 / 1,39 avec des marges propres de 16,5 / 31,6 / 54 % -> ventes 6,70 / 2,50 / 2,14. */
const base = () => O.articlesParId([
  { id: 'ba13', libelle: 'BA13 standard sur ossature métallique', unite: 'm²', prixAchat: 5.75, marge: 16.5, actif: true },
  { id: 'rail', libelle: 'Rail R48', unite: 'ml', prixAchat: 1.9, marge: 31.6, actif: true },
  { id: 'iso', libelle: 'Isolant laine de verre', unite: 'm²', prixAchat: 1.39, marge: 54, actif: true },
  { id: 'vis', libelle: 'Vis', unite: 'u', prixAchat: 0.1, actif: true },
]);
const cloison = (extra = {}) => ({ id: 'cloison', type: 'ouvrage', libelle: 'Cloisons', composants: [{ articleId: 'ba13', quantite: 1 }, { articleId: 'rail', quantite: 1 }, { articleId: 'iso', quantite: 1 }], ...extra });

describe('O1 exemple de référence', () => {
  test('O1 composants 6,70 / 2,50 / 2,14 : vente 11,34, déboursé sec 9,04, marge brute 2,30, taux 25,44 %', () => {
    const c = O.calculerOuvrage(cloison(), base(), REGLAGES);
    assert.deepEqual(c.composants.map((x) => x.prixVenteUnitaire), [6.7, 2.5, 2.14]);
    assert.equal(c.prixVenteHT, 11.34);
    assert.equal(c.deboursSecHT, 9.04);
    assert.equal(c.margeBruteHT, 2.3);
    assert.equal(c.tauxMarge, 25.44);
    assert.deepEqual(c.erreurs, []);
  });
  test('O1 sans marge propre, la marge des réglages s’applique ; les quantités multiplient', () => {
    const c = O.calculerOuvrage({ composants: [{ articleId: 'vis', quantite: 10 }] }, base(), { marge: 50, modeMarge: 'majoration' });
    assert.equal(c.prixVenteHT, 1.5);
    assert.equal(c.deboursSecHT, 1);
  });
});

describe('O2 prix forcé', () => {
  test('O2 le déboursé reste la somme des coûts, la marge se recalcule sur le prix forcé', () => {
    const c = O.calculerOuvrage(cloison({ prixVenteForce: 12 }), base(), REGLAGES);
    assert.equal(c.prixVenteHT, 12);
    assert.equal(c.deboursSecHT, 9.04);
    assert.equal(c.margeBruteHT, 2.96);
    assert.equal(c.tauxMarge, 32.74);
    assert.equal(c.prixForce, true);
    assert.equal(O.calculerOuvrage(cloison({ prixVenteForce: 0 }), base(), REGLAGES).prixVenteHT, 0, '0 est un vrai prix forcé');
  });
});

describe('O3 composant désactivé ou inconnu', () => {
  test('O3 signalé dans les erreurs et compté 0', () => {
    const articles = base();
    articles.rail = { ...articles.rail, actif: false };
    const c = O.calculerOuvrage(cloison({ composants: [...cloison().composants, { articleId: 'fantome', quantite: 1 }] }), articles, REGLAGES);
    assert.equal(c.erreurs.length, 2);
    assert.match(c.erreurs[0], /Rail R48.*désactivé/);
    assert.match(c.erreurs[1], /introuvable/);
    assert.equal(c.prixVenteHT, 8.84);
    assert.equal(c.composants.filter((x) => x.manquant).length, 2);
  });
});

describe('O4 boucle refusée', () => {
  test('O4 un ouvrage ne se contient pas lui-même, ni directement ni via un autre ouvrage', () => {
    const articles = base();
    articles.cloison = cloison();
    articles.autre = { id: 'autre', type: 'ouvrage', libelle: 'Autre', actif: true, composants: [{ articleId: 'cloison', quantite: 1 }] };
    assert.match(O.erreursOuvrage({ id: 'cloison', composants: [{ articleId: 'cloison', quantite: 1 }] }, articles).join(' '), /se contenir lui-même/);
    assert.match(O.erreursOuvrage({ id: 'cloison', composants: [{ articleId: 'autre', quantite: 1 }] }, articles).join(' '), /déjà un ouvrage/);
    assert.match(O.erreursOuvrage({ id: 'x', composants: [{ articleId: 'cloison', quantite: 1 }] }, articles).join(' '), /un ouvrage ne peut pas en contenir un autre/);
  });
});

describe('O5 doublon, quantité, taille', () => {
  test('O5 un composant en double, une quantité invalide, plus de 30 composants, un prix forcé négatif', () => {
    const e = (o) => O.erreursOuvrage(o, base()).join(' | ');
    assert.deepEqual(O.erreursOuvrage(cloison(), base()), []);
    assert.match(e({ composants: [{ articleId: 'vis', quantite: 1 }, { articleId: 'vis', quantite: 2 }] }), /déjà dans l’ouvrage/);
    for (const q of [0, -1, 'deux', NaN, null]) assert.match(e({ composants: [{ articleId: 'vis', quantite: q }] }), /quantité doit être/, String(q));
    assert.match(e({ composants: [{ articleId: 'vis', quantite: 1.2345 }] }), /3 décimales/);
    assert.deepEqual(O.erreursOuvrage({ composants: [{ articleId: 'vis', quantite: 1.234 }] }, base()), []);
    const beaucoup = Array.from({ length: 31 }, (_, i) => ({ articleId: `a${i}`, quantite: 1 }));
    assert.match(e({ composants: beaucoup }), /30 composants au plus/);
    assert.match(e({ composants: [{ articleId: 'vis', quantite: 1 }], prixVenteForce: -1 }), /ne peut pas être négatif/);
    assert.match(e({ composants: [] }), /au moins un composant/);
  });
});

describe('O6 description multi-lignes', () => {
  test('O6 « - libellé (quantité unité) » avec la quantité de la ligne multipliée', () => {
    const c = O.calculerOuvrage(cloison({ composants: [{ articleId: 'ba13', quantite: 1 }, { articleId: 'rail', quantite: 0.5 }] }), base(), REGLAGES);
    assert.equal(O.descriptionOuvrage(c, base()), '- BA13 standard sur ossature métallique (1 m²)\n- Rail R48 (0,5 ml)');
    assert.equal(O.descriptionOuvrage(c, base(), 2), '- BA13 standard sur ossature métallique (2 m²)\n- Rail R48 (1 ml)');
  });
});

describe('O7 copie figée', () => {
  test('O7 modifier l’article ou l’ouvrage ensuite ne change pas la copie', () => {
    const articles = base();
    const figee = O.figerOuvragePourLigne(cloison(), articles, REGLAGES);
    const avant = structuredClone(figee);
    assert.equal(figee.prixVenteHT, 11.34);
    assert.equal(figee.composants[0].libelle, 'BA13 standard sur ossature métallique');
    articles.ba13.prixAchat = 99;
    articles.ba13.libelle = 'Autre';
    assert.deepEqual(figee, avant);
    assert.notEqual(O.figerOuvragePourLigne(cloison(), articles, REGLAGES).prixVenteHT, 11.34, 'une nouvelle copie voit le nouveau prix');
  });
});

describe('O8 types d’article', () => {
  let n = 0;
  const ctx = () => ({ auteur: 'a@exemple.test', nouvelId: (nom) => `${nom}_${++n}` });
  test('O8 un article sans type reste valide ; un type inconnu est refusé ; sept types avec libellés', () => {
    assert.deepEqual(A.TYPES_ARTICLE.map((t) => t.id), ['fourniture', 'main_oeuvre', 'ouvrage', 'sous_traitance', 'materiel', 'divers', 'texte']);
    assert.deepEqual(A.TYPES_ARTICLE.map((t) => t.libelle), ['Fourniture', 'Main d’œuvre', 'Ouvrage', 'Sous-traitance', 'Matériel', 'Divers', 'Texte']);
    const p = A.planCreerArticle({ libelle: 'Vis', prixAchat: 1 }, ctx());
    assert.deepEqual(p.erreurs, {});
    assert.ok(!('type' in p.ecritures[0].donnees), 'pas de champ type écrit pour un article non classé');
    const q = A.planCreerArticle({ libelle: 'Vis', prixAchat: 1, type: 'bizarre' }, ctx());
    assert.match(q.erreurs.type, /n’existe pas/);
    assert.equal(A.planCreerArticle({ libelle: 'MO', prixAchat: 40, type: 'main_oeuvre' }, ctx()).ecritures[0].donnees.type, 'main_oeuvre');
  });
  test('O8 un ouvrage n’exige pas de prix d’achat et le refuse ; un autre type ne porte pas de composants', () => {
    const articles = Object.values(base());
    const p = A.planCreerArticle({ libelle: 'Cloisons', type: 'ouvrage', composants: cloison().composants, prixVenteForce: '12,5' }, ctx(), { articles });
    assert.deepEqual(p.erreurs, {});
    const doc = p.ecritures[0].donnees;
    assert.deepEqual([doc.prixAchat, doc.prixVenteForce, doc.composants.length], [null, 12.5, 3]);
    assert.ok(A.planCreerArticle({ libelle: 'C', type: 'ouvrage', composants: cloison().composants, prixAchat: 5 }, ctx(), { articles }).erreurs.prixAchat);
    assert.ok(A.planCreerArticle({ libelle: 'C', type: 'ouvrage' }, ctx(), { articles }).erreurs.composants);
    assert.ok(A.planCreerArticle({ libelle: 'C', type: 'divers', prixAchat: 1, composants: cloison().composants }, ctx(), { articles }).erreurs.composants);
    assert.ok(A.planCreerArticle({ libelle: 'C', type: 'divers', prixAchat: 1, prixVenteForce: 3 }, ctx(), { articles }).erreurs.prixVenteForce);
  });
  test('O8 changer le type : ouvrage -> autre efface composants et prix forcé (prix d’achat exigé) ; un composant ne devient pas ouvrage', () => {
    const articles = [...Object.values(base()), { ...cloison(), prixAchat: null, prixVenteForce: 12, actif: true }];
    const vers = A.planMajArticle('cloison', { type: 'divers', prixAchat: '3' }, { articles });
    assert.deepEqual(vers.erreurs, {});
    assert.deepEqual([vers.patch.type, vers.patch.prixAchat, vers.patch.composants, vers.patch.prixVenteForce], ['divers', 3, null, null]);
    assert.ok(A.planMajArticle('cloison', { type: 'divers' }, { articles }).erreurs.prixAchat);
    const dans = A.planMajArticle('ba13', { type: 'ouvrage', composants: [{ articleId: 'vis', quantite: 1 }] }, { articles });
    assert.match(dans.erreurs.type, /composant de l’ouvrage « Cloisons »/);
    const neuf = A.planMajArticle('vis', { type: 'ouvrage' }, { articles });
    assert.ok(neuf.erreurs.composants, 'un ouvrage sans composant est refusé');
    const ok = A.planMajArticle('vis', { type: 'ouvrage', composants: [{ articleId: 'ba13', quantite: 2 }] }, { articles });
    assert.deepEqual([ok.erreurs, ok.patch.prixAchat, ok.patch.type], [{}, null, 'ouvrage']);
  });
  test('O8 filtre par type et calcul joint aux ouvrages', () => {
    const articles = [...Object.values(base()), { ...cloison(), prixAchat: null, actif: true }];
    assert.deepEqual(A.filtrerArticles(articles, { type: 'ouvrage' }).map((a) => a.id), ['cloison']);
    assert.equal(A.filtrerArticles(articles, { type: 'non_classe' }).length, 4);
    const vue = A.avecCalculOuvrage(articles, articles, null);
    assert.equal(vue.find((a) => a.id === 'cloison').calcul.prixVenteHT, 11.34);
    assert.ok(!('calcul' in vue.find((a) => a.id === 'vis')));
  });
});

describe('O11 relecture : arrondi des quantités, composant d\'un ouvrage désactivé', () => {
  test('O11 quantité 2,675 × 1,00 € = 2,68 € (demi supérieur, comme une ligne de devis)', () => {
    const articles = O.articlesParId([{ id: 'x', libelle: 'X', unite: 'u', prixAchat: 1, marge: 0, actif: true }]);
    const c = O.calculerOuvrage({ composants: [{ articleId: 'x', quantite: 2.675 }] }, articles, REGLAGES);
    assert.equal(c.prixVenteHT, 2.68);
  });
  test('O11 un composant d\'un ouvrage désactivé ne peut pas devenir ouvrage', () => {
    const articles = [
      { id: 'o', type: 'ouvrage', actif: false, libelle: 'Ancien', composants: [{ articleId: 'c', quantite: 1 }] },
      { id: 'c', libelle: 'C', unite: 'u', prixAchat: 1, actif: true },
      { id: 'y', libelle: 'Y', unite: 'u', prixAchat: 1, actif: true },
    ];
    const plan = A.planMajArticle('c', { type: 'ouvrage', composants: [{ articleId: 'y', quantite: 1 }] }, { articles });
    assert.ok(plan.erreurs.type, 'refusé : il compose un ouvrage, même désactivé');
  });
});

// B2 (31/10/2026) : les messages de validation disent le mot du métier réglé (« prestation », « lot »…) ; sans réglage, les phrases d'avant ne changent pas (O1 à O8 les lisent).
describe('B2 le mot du métier dans les messages de validation', () => {
  const PRESTATION = { motOuvrage: 'prestation' };
  const articles = () => ({
    ...base(),
    ouv: { id: 'ouv', type: 'ouvrage', libelle: 'Salle de bain', composants: [{ articleId: 'ba13', quantite: 1 }], actif: true },
    txt: { id: 'txt', type: 'texte', libelle: 'Note', actif: true },
    off: { id: 'off', libelle: 'Ancien', unite: 'u', prixAchat: 1, actif: false },
  });
  const tous = (reglages) => [
    ...O.erreursOuvrage({ composants: [] }, articles(), reglages),
    ...O.erreursOuvrage({ id: 'x', composants: Array.from({ length: O.MAX_COMPOSANTS + 1 }, () => ({ articleId: 'ba13', quantite: 1 })) }, articles(), reglages),
    ...O.erreursOuvrage({ id: 'x', composants: [{ articleId: 'x', quantite: 1 }, { articleId: 'ba13', quantite: 1 }, { articleId: 'ba13', quantite: 1 }, { articleId: 'ouv', quantite: 1 }, { articleId: 'txt', quantite: 1 }, { articleId: 'off', quantite: 1 }] }, articles(), reglages),
    ...O.calculerOuvrage({ composants: [{ articleId: 'ouv', quantite: 1 }] }, articles(), reglages).erreurs,
    ...Object.values(A.validerArticle({ libelle: 'Y', type: 'ouvrage', prixAchat: 5, composants: [] }, { articles: Object.values(articles()), reglages }).erreurs),
    ...Object.values(A.validerArticle({ libelle: 'Y', unite: 'u', prixAchat: 5, type: 'fourniture', composants: [{ articleId: 'ba13', quantite: 1 }], prixVenteForce: 9 }, { articles: Object.values(articles()), reglages }).erreurs),
    ...Object.values(A.planMajArticle('ba13', { type: 'ouvrage' }, { articles: Object.values(articles()), reglages }).erreurs),
    ...Object.values(A.planMajArticle('ouv', { type: 'divers' }, { articles: Object.values(articles()), reglages }).erreurs),
  ];

  test('B2.1 avec le mot « prestation », aucun message de validation ne contient « ouvrage »', () => {
    const messages = tous(PRESTATION);
    assert.ok(messages.length >= 15, `messages attendus : ${messages.length}`);
    for (const m of messages) assert.doesNotMatch(m, /ouvrage/i, m);
  });

  test('B2.2 l’accord : « une prestation ne peut pas en contenir une autre » (féminin) et « un lot… un autre » (masculin)', () => {
    assert.match(O.erreursOuvrage({ composants: [{ articleId: 'ouv', quantite: 1 }] }, articles(), PRESTATION).join(' '), /c’est déjà une prestation, et une prestation ne peut pas en contenir une autre\./);
    assert.match(O.erreursOuvrage({ composants: [{ articleId: 'ouv', quantite: 1 }] }, articles(), { motOuvrage: 'lot' }).join(' '), /c’est déjà un lot, et un lot ne peut pas en contenir un autre\./);
    assert.match(O.erreursOuvrage({ composants: [] }, articles(), PRESTATION)[0], /^Une prestation a besoin d’au moins un composant/);
    assert.match(O.erreursOuvrage({ composants: [{ articleId: 'ba13', quantite: 1 }, { articleId: 'ba13', quantite: 1 }] }, articles(), { motOuvrage: 'ensemble' }).join(' '), /déjà dans l’ensemble\./);
    assert.match(O.calculerOuvrage({ composants: [{ articleId: 'ouv', quantite: 1 }] }, articles(), PRESTATION).erreurs[0], /une prestation ne peut pas contenir une autre prestation/);
    assert.equal(A.validerArticle({ libelle: 'Y', unite: 'u', prixAchat: 5, type: 'fourniture', prixVenteForce: 9 }, { reglages: PRESTATION }).erreurs.prixVenteForce, 'Seule une prestation peut avoir un prix de vente forcé.');
    assert.match(A.validerArticle({ libelle: 'Y', unite: 'u', type: 'ouvrage', prixAchat: 5, composants: [{ articleId: 'ba13', quantite: 1 }] }, { articles: Object.values(articles()), reglages: PRESTATION }).erreurs.prixAchat, /^Une prestation n’a pas de prix d’achat : elle se calcule/);
    assert.equal(A.libelleType('ouvrage', PRESTATION), 'Prestation');
  });

  test('B2.3 sans réglage (ou avec un mot invalide), les phrases sont celles d’avant et le libellé du type reste « Ouvrage »', () => {
    for (const r of [undefined, {}, { motOuvrage: 'ouvrage' }, { motOuvrage: 'nimportequoi' }, { motOuvrage: 'autre', motOuvrageAutre: {} }]) {
      assert.deepEqual(tous(r), tous({}));
    }
    const m = tous(undefined).join('\n');
    assert.match(m, /Un ouvrage a besoin d’au moins un composant : ajoute un article\./);
    assert.match(m, /c’est déjà un ouvrage, et un ouvrage ne peut pas en contenir un autre\./);
    assert.match(m, /un ouvrage ne peut pas contenir un autre ouvrage/);
    assert.equal(A.libelleType('ouvrage'), 'Ouvrage');
    assert.equal(A.libelleType('fourniture', PRESTATION), 'Fourniture');
  });
});
