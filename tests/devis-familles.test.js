// Module Devis, type d'article « texte », familles et champs référence / marque. Logique pure : js/modules/devis/familles.js et articles.js.
// Un test par critère (le nom commence par F1 à F8) ; l'écran (F9) est dans tests/e2e/devis-familles.spec.js.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as F from '../js/modules/devis/familles.js';
import * as A from '../js/modules/devis/articles.js';
import * as O from '../js/modules/devis/ouvrages.js';
import { totauxDevis } from '../js/modules/devis/logique.js';

const ctx = { proprietaire: 'jerome@example.org', auteur: 'jerome@example.org', nouvelId: () => 'id1' };

describe('F1 type texte', () => {
  test('F1 un article de type texte est valide sans prix, sans unité ni quantité', () => {
    const r = A.validerArticle({ libelle: 'Travaux préparatoires', type: 'texte' });
    assert.deepEqual(r.erreurs, {});
    assert.equal(r.valeurs.prixAchat, null);
    assert.equal(r.valeurs.unite, '');
    const plan = A.planCreerArticle({ libelle: 'Travaux préparatoires', type: 'texte' }, ctx);
    assert.deepEqual(plan.erreurs, {});
    assert.equal(plan.ecritures[0].donnees.type, 'texte');
    assert.ok(A.TYPES_ARTICLE.some((t) => t.id === 'texte' && t.libelle === 'Texte'));
    // Sans type « texte », le prix reste obligatoire.
    assert.ok(A.validerArticle({ libelle: 'Vis', type: 'fourniture' }).erreurs.prixAchat);
  });
  test('F1 une ligne de texte compte 0 dans les totaux d’un devis et ne peut pas composer un ouvrage', () => {
    const devis = { statut: 'brouillon', modeMarge: 'majoration', sections: [{ id: 's', lignes: [{ id: 'l1', type: 'texte', quantite: 5, prixAchat: null, tauxTva: 20 }, { id: 'l2', quantite: 1, prixAchat: 100, marge: 0, tauxTva: 20 }] }] };
    assert.equal(totauxDevis(devis).sections[0].sousTotalHT, 100);
    const base = O.articlesParId([{ id: 't', libelle: 'Texte', type: 'texte', actif: true }]);
    assert.ok(O.erreursOuvrage({ composants: [{ articleId: 't', quantite: 1 }] }, base).some((e) => e.includes('ligne de texte')));
  });
});

describe('F2 texte et composants', () => {
  test('F2 un article texte refuse des composants et un prix de vente forcé', () => {
    const r = A.validerArticle({ libelle: 'Note', type: 'texte', composants: [{ articleId: 'x', quantite: 1 }], prixVenteForce: 10 });
    assert.ok(r.erreurs.composants);
    assert.ok(r.erreurs.prixVenteForce);
  });
  test('F2 passer un ouvrage en texte efface ses composants', () => {
    const articles = [{ id: 'v', libelle: 'Vis', prixAchat: 1, actif: true }, { id: 'o', libelle: 'Ouvrage', type: 'ouvrage', composants: [{ articleId: 'v', quantite: 1 }], actif: true }];
    const plan = A.planMajArticle('o', { type: 'texte' }, { articles });
    assert.deepEqual(plan.erreurs, {});
    assert.equal(plan.patch.composants, null);
    assert.equal(plan.patch.type, 'texte');
  });
});

describe('F3 familles par défaut', () => {
  test('F3 sept familles par défaut, dans l’ordre, toutes actives ; document absent = défauts', () => {
    assert.deepEqual(F.FAMILLES_PAR_DEFAUT.map((f) => f.nom), ['Fournitures', 'Main d’œuvre', 'Ouvrages', 'Sous-traitance', 'Matériels', 'Textes', 'Divers']);
    assert.ok(F.FAMILLES_PAR_DEFAUT.every((f) => f.actif));
    assert.equal(new Set(F.FAMILLES_PAR_DEFAUT.map((f) => f.id)).size, 7);
    assert.deepEqual(F.famillesDe(null), F.FAMILLES_PAR_DEFAUT);
    assert.deepEqual(F.famillesDe({ liste: 'abîmé' }), F.FAMILLES_PAR_DEFAUT);
    // Les sept familles de départ sont toujours en tête (verrouillées) ; les familles libres de l'utilisateur suivent.
    assert.deepEqual(F.famillesDe({ liste: [{ id: 'a', nom: ' Plomberie ', actif: false }, { nom: 'sans id' }] }), [...F.FAMILLES_PAR_DEFAUT, { id: 'a', nom: 'Plomberie', actif: false }]);
  });
});

describe('F4 noms uniques', () => {
  const liste = () => F.famillesDe(null);
  test('F4 un nom en double est refusé sans accents ni casse ; vide et trop long aussi', () => {
    // Un nom pris par une famille de MÊME parent est refusé (le premier niveau n'a pas de création : on teste le nom sous une sous-famille déjà là).
    const avec = F.planCreationFamille('Carrelage', liste(), { nouvelId: () => 'c', parentId: 'famille-1' }).familles;
    assert.ok(F.planCreationFamille('  carrelAGE ', avec, { nouvelId: () => 'n', parentId: 'famille-1' }).erreur.includes('existe déjà'));
    assert.ok(F.erreursFamille('', liste()));
    assert.ok(F.erreursFamille('   ', liste()));
    assert.ok(F.erreursFamille('x'.repeat(61), liste()));
    assert.equal(F.erreursFamille('x'.repeat(60), liste()), null);
    const ok = F.planCreationFamille('  Plomberie  ', liste(), { nouvelId: () => 'n', parentId: 'famille-2' });
    assert.equal(ok.erreur, null);
    assert.equal(ok.familles.length, 8);
    assert.deepEqual(ok.famille, { id: 'n', nom: 'Plomberie', actif: true, parentId: 'famille-2' });
  });
  test('F4 le nom d’une famille désactivée reste pris', () => {
    const l = F.planDesactiverFamille('sous', [...liste(), { id: 'sous', nom: 'Divers', actif: true, parentId: 'famille-1' }]).familles;
    assert.match(F.erreursFamille('divers', l, { parentId: 'famille-1' }), /désactivée/);
  });
});

describe('F5 renommer, désactiver', () => {
  test('F5 renommer garde l’identifiant ; garder son propre nom (autre casse) est permis ; le nom d’une autre est refusé', () => {
    const l = [...F.famillesDe(null), { id: 'p', nom: 'Plomberie', actif: true, parentId: 'famille-1' }, { id: 'q', nom: 'Peinture', actif: true, parentId: 'famille-1' }];
    const r = F.planRenommerFamille('p', 'Tuyaux', l);
    assert.equal(r.erreur, null);
    assert.deepEqual(r.famille, { id: 'p', nom: 'Tuyaux', actif: true, parentId: 'famille-1' });
    assert.equal(r.familles.length, 9);
    assert.equal(F.planRenommerFamille('p', 'PLOMBERIE', l).erreur, null);
    assert.ok(F.planRenommerFamille('p', 'peinture', l).erreur);
    assert.ok(F.planRenommerFamille('absente', 'Autre', l).erreur);
    assert.equal(l.find((f) => f.id === 'p').nom, 'Plomberie', 'la liste d’origine n’est pas modifiée');
  });
  test('F5 désactiver puis réactiver ; jamais de suppression', () => {
    const l = [...F.famillesDe(null), { id: 'p', nom: 'Plomberie', actif: true, parentId: 'famille-2' }];
    const off = F.planDesactiverFamille('p', l);
    assert.equal(off.familles.length, 8);
    assert.equal(off.famille.actif, false);
    assert.equal(F.planDesactiverFamille('p', off.familles, true).famille.actif, true);
    assert.ok(F.planDesactiverFamille('absente', l).erreur);
  });
});

describe('F6 famille d’un article', () => {
  test('F6 un familleId inconnu est refusé ; connu, il est gardé ; vide = aucune', () => {
    const familles = F.famillesDe(null);
    assert.ok(A.validerArticle({ libelle: 'X', prixAchat: 1, familleId: 'inconnue' }, { familles }).erreurs.familleId);
    const bon = A.validerArticle({ libelle: 'X', prixAchat: 1, familleId: 'famille-1' }, { familles });
    assert.deepEqual(bon.erreurs, {});
    assert.equal(A.nouvelArticle(bon.valeurs, ctx).familleId, 'famille-1');
    assert.equal('familleId' in A.nouvelArticle(A.validerArticle({ libelle: 'X', prixAchat: 1 }).valeurs, ctx), false);
    assert.ok(A.planCreerArticle({ libelle: 'X', prixAchat: 1, familleId: 'inconnue' }, ctx, { familles }).erreurs.familleId);
  });
  test('F6 une famille désactivée est refusée pour un autre article, mais l’article qui l’a déjà la garde', () => {
    const familles = F.planDesactiverFamille('p', [...F.famillesDe(null), { id: 'p', nom: 'Plomberie', actif: true, parentId: 'famille-1' }]).familles;
    assert.ok(A.validerArticle({ libelle: 'X', prixAchat: 1, familleId: 'p' }, { familles }).erreurs.familleId);
    const articles = [{ id: 'a', libelle: 'X', prixAchat: 1, unite: 'u', type: 'fourniture', familleId: 'p', actif: true }];
    assert.deepEqual(A.planMajArticle('a', { libelle: 'Y', familleId: 'p' }, { articles, familles }).erreurs, {});
    assert.deepEqual(A.planMajArticle('a', { familleId: '' }, { articles, familles }).patch, { familleId: '' });
  });
  test('F6 le filtre par famille et la recherche (référence, marque)', () => {
    const articles = [
      { id: '1', libelle: 'Vis', familleId: 'famille-1', reference: 'REF-9', marque: 'Fischer' },
      { id: '2', libelle: 'Colle' },
    ];
    assert.deepEqual(A.filtrerArticles(articles, { familleId: 'famille-1' }).map((a) => a.id), ['1']);
    assert.deepEqual(A.filtrerArticles(articles, { familleId: 'sans_famille' }).map((a) => a.id), ['2']);
    assert.deepEqual(A.filtrerArticles(articles, { recherche: 'fischer' }).map((a) => a.id), ['1']);
    assert.deepEqual(A.filtrerArticles(articles, { recherche: 'ref-9' }).map((a) => a.id), ['1']);
  });
});

describe('F7 référence et marque', () => {
  test('F7 facultatives, nettoyées, bornées à 120 caractères ; modifiables', () => {
    const ok = A.validerArticle({ libelle: 'Vis', prixAchat: 1, reference: '  REF  1 ', marque: 'Fischer' });
    assert.deepEqual([ok.valeurs.reference, ok.valeurs.marque, ok.erreurs.reference, ok.erreurs.marque], ['REF 1', 'Fischer', undefined, undefined]);
    assert.equal(A.validerArticle({ libelle: 'Vis', prixAchat: 1, reference: 'x'.repeat(120) }).erreurs.reference, undefined);
    assert.ok(A.validerArticle({ libelle: 'Vis', prixAchat: 1, reference: 'x'.repeat(121) }).erreurs.reference);
    assert.ok(A.validerArticle({ libelle: 'Vis', prixAchat: 1, marque: 'x'.repeat(121) }).erreurs.marque);
    const nu = A.nouvelArticle(A.validerArticle({ libelle: 'Vis', prixAchat: 1 }).valeurs, ctx);
    assert.equal('reference' in nu || 'marque' in nu, false, 'un article sans référence garde sa forme');
    const articles = [{ id: 'a', libelle: 'Vis', prixAchat: 1, unite: 'u', actif: true }];
    assert.deepEqual(A.planMajArticle('a', { reference: 'R1', marque: 'M' }, { articles }).patch, { reference: 'R1', marque: 'M' });
    assert.ok(A.planMajArticle('a', { marque: 'x'.repeat(121) }, { articles }).erreurs.marque);
  });
});

describe('F8 assistant (MCP)', () => {
  test('F8 les outils creer_article et modifier_article acceptent le type texte, la référence, la marque et la famille', async () => {
    const { OUTILS_ECRITURE } = await import('../functions/src/mcp/outils/ecriture.js');
    const { z } = await import('zod');
    const creer = z.object(OUTILS_ECRITURE.find((o) => o.nom === 'creer_article').schema);
    assert.ok(creer.safeParse({ libelle: 'Note', type: 'texte' }).success);
    assert.ok(creer.safeParse({ libelle: 'Vis', prixAchat: 1, reference: 'R', marque: 'M', familleId: 'famille-1' }).success);
    assert.ok(!creer.safeParse({ libelle: 'Vis', prixAchat: 1, reference: 'x'.repeat(121) }).success);
    const modifier = z.object(OUTILS_ECRITURE.find((o) => o.nom === 'modifier_article').schema);
    assert.ok(modifier.safeParse({ id: 'a', type: 'texte', reference: 'R', marque: 'M', familleId: '' }).success);
  });
  test('F8 le serveur applique les mêmes règles : texte sans prix accepté, famille inconnue refusée, famille du document acceptée', async () => {
    const metier = await import('../functions/src/coeur/metier.js');
    const { creerAccesMemoire } = await import('../functions/src/coeur/donnees.js');
    const collections = { devis_articles: [], devis_parametres: [], crm_parametres: [], crm_utilisateurs: [] };
    const donnees = creerAccesMemoire(collections);
    const ecrites = [];
    const c = { donnees, acteur: 'essai', maintenant: new Date('2026-10-24T10:00:00Z'), ecrire: async ({ operations }) => { ecrites.push(...operations); return { operationId: 'op', ecritures: operations }; } };
    const texte = await metier.creerArticle(c, { libelle: 'Note', type: 'texte', reference: 'R1', marque: 'M', familleId: 'famille-6' });
    assert.ok(JSON.stringify(texte).includes('Note'));
    assert.equal(ecrites[0].donnees.type, 'texte');
    assert.equal(ecrites[0].donnees.familleId, 'famille-6');
    assert.equal(ecrites[0].donnees.reference, 'R1');
    await assert.rejects(() => metier.creerArticle(c, { libelle: 'Vis', prixAchat: 1, familleId: 'nulle-part' }), /famille/i);
    collections.devis_parametres.push({ id: 'familles', liste: [{ id: 'f-perso', nom: 'Plomberie', actif: true, parentId: 'famille-1' }] });
    await metier.creerArticle(c, { libelle: 'Tube', prixAchat: 2, familleId: 'f-perso' });
    assert.equal(ecrites.at(-1).donnees.familleId, 'f-perso');
    assert.equal(ecrites.at(-1).donnees.type, 'fourniture', 'le type se déduit de la famille de premier niveau');
    await assert.rejects(() => metier.creerArticle(c, { libelle: 'Vis2', prixAchat: 1, familleId: 'f-inconnue' }), /famille/i);
  });
});
