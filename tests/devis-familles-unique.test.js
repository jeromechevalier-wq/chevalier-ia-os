// Module Devis : une seule « Famille » à deux niveaux (le type d'article s'en déduit) et la liste d'unités. Logique pure : familles.js et articles.js.
// Un test par critère (le nom commence par F2 à F9 ; F1 et F8 sont aussi vérifiés à l'écran dans tests/e2e/devis-familles-unique.spec.js).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as F from '../js/modules/devis/familles.js';
import * as A from '../js/modules/devis/articles.js';

const ctx = { proprietaire: 'jerome@example.org', auteur: 'jerome@example.org', nouvelId: () => 'id1' };
const defauts = () => F.famillesDe(null);
const avecCarrelage = () => F.planCreationFamille('Carrelage', defauts(), { nouvelId: () => 'carrelage', parentId: 'famille-1' }).familles;

describe('F1 un seul champ Famille', () => {
  test('F1 la fenêtre d’ajout n’a plus de champ « Type » : un seul champ « Famille » (le test d’écran le vérifie aussi)', () => {
    const src = readFileSync(new URL('../js/modules/devis/bordereau.js', import.meta.url), 'utf8');
    assert.doesNotMatch(src, /Type \(facultatif\)/);
    assert.doesNotMatch(src, /id: 'article-type'|champ-type/);
    assert.match(src, /'Famille'/);
  });
});

describe('F2 le type se déduit de la famille', () => {
  test('F2 « Fournitures › Carrelage » enregistre un article de type fourniture', () => {
    const familles = avecCarrelage();
    const plan = A.planCreerArticle({ libelle: 'Carreau 60 x 60', prixAchat: 12.5, familleId: 'carrelage' }, ctx, { familles });
    assert.deepEqual(plan.erreurs, {});
    assert.equal(plan.ecritures[0].donnees.type, 'fourniture');
    assert.equal(plan.ecritures[0].donnees.familleId, 'carrelage');
    assert.equal(F.cheminFamille(familles, 'carrelage'), 'Fournitures › Carrelage');
    assert.equal(F.typeDeFamille(familles, 'carrelage'), 'fourniture');
    assert.equal(F.typeDeFamille(familles, 'famille-2'), 'main_oeuvre');
    assert.equal(F.typeDeFamille(familles, 'inconnue'), null);
  });
  test('F2 un type donné qui ne va pas avec la famille est refusé avec un message clair ; le même type passe', () => {
    const familles = avecCarrelage();
    const mauvais = A.validerArticle({ libelle: 'X', prixAchat: 1, familleId: 'carrelage', type: 'materiel' }, { familles });
    assert.match(mauvais.erreurs.type, /ne va pas avec la famille « Fournitures › Carrelage »/);
    assert.deepEqual(A.validerArticle({ libelle: 'X', prixAchat: 1, familleId: 'carrelage', type: 'fourniture' }, { familles }).erreurs, {});
  });
  test('F2 changer la famille d’un article change son type ; un ouvrage qui change de famille perd ses composants', () => {
    const familles = avecCarrelage();
    const articles = [
      { id: 'v', libelle: 'Vis', prixAchat: 1, unite: 'u', type: 'fourniture', actif: true },
      { id: 'w', libelle: 'Mélange', prixAchat: 4, unite: 'u', type: 'fourniture', actif: true },
      { id: 'a', libelle: 'Pose', prixAchat: 30, unite: 'h', type: 'fourniture', familleId: 'carrelage', actif: true },
      { id: 'o', libelle: 'Cloison', unite: 'm²', type: 'ouvrage', familleId: 'famille-3', composants: [{ articleId: 'v', quantite: 2 }], actif: true },
    ];
    const vers = A.planMajArticle('a', { familleId: 'famille-2' }, { articles, familles });
    assert.deepEqual(vers.erreurs, {});
    assert.deepEqual(vers.patch, { familleId: 'famille-2', type: 'main_oeuvre' });
    // Un patch qui ne touche pas la famille ne change pas le type (même si l'ancien article avait une famille d'un autre type).
    assert.deepEqual(A.planMajArticle('a', { libelle: 'Pose carrelage' }, { articles, familles }).patch, { libelle: 'Pose carrelage' });
    const ouvrageVersOuvrage = A.planMajArticle('w', { familleId: 'famille-3', composants: [{ articleId: 'a', quantite: 1 }] }, { articles, familles });
    assert.deepEqual(ouvrageVersOuvrage.erreurs, {});
    assert.equal(ouvrageVersOuvrage.patch.type, 'ouvrage');
    const quitte = A.planMajArticle('o', { familleId: 'famille-1', prixAchat: 5 }, { articles, familles });
    assert.deepEqual(quitte.erreurs, {});
    assert.equal(quitte.patch.type, 'fourniture');
    assert.equal(quitte.patch.composants, null);
  });
});

describe('F3 sous-familles', () => {
  test('F3 le même nom sous Fournitures puis sous Main d’œuvre passe ; un doublon sous le même parent est refusé', () => {
    let l = defauts();
    let r = F.planCreationFamille('Carrelage', l, { nouvelId: () => 'c1', parentId: 'famille-1' });
    assert.equal(r.erreur, null);
    assert.deepEqual(r.famille, { id: 'c1', nom: 'Carrelage', actif: true, parentId: 'famille-1' });
    l = r.familles;
    r = F.planCreationFamille('carrelage', l, { nouvelId: () => 'c2', parentId: 'famille-2' });
    assert.equal(r.erreur, null, 'même nom sous un autre parent');
    l = r.familles;
    r = F.planCreationFamille(' CARRELAGE ', l, { nouvelId: () => 'c3', parentId: 'famille-1' });
    assert.match(r.erreur, /existe déjà/);
    assert.equal(F.planRenommerFamille('c2', 'Carrelage', l).erreur, null, 'garder son nom est permis');
  });
  test('F3 l’arbre, le chemin et les familles lues dans la base', () => {
    const l = avecCarrelage();
    const arbre = F.arbreFamilles(l);
    assert.equal(arbre.length, 7);
    assert.deepEqual(arbre[0].enfants.map((f) => f.nom).at(-1), 'Carrelage', 'la sous-famille libre suit celles de départ');
    assert.equal(F.cheminFamille(l, 'famille-1'), 'Fournitures');
    const relues = F.famillesDe({ liste: l });
    assert.deepEqual(relues, l, 'le parentId survit à la lecture');
    // Un parent introuvable ramène la famille au premier niveau (et un ancien document sans parentId reste valable).
    const orpheline = F.famillesDe({ liste: [{ id: 'z', nom: 'Zinguerie', actif: true, parentId: 'disparue' }] }).at(-1);
    assert.deepEqual(orpheline, { id: 'z', nom: 'Zinguerie', actif: true });
  });
});

describe('F4 deux niveaux au plus', () => {
  test('F4 on ne crée pas de sous-sous-famille, ni de famille de premier niveau', () => {
    const l = avecCarrelage();
    const r = F.planCreationFamille('Grès', l, { nouvelId: () => 'g', parentId: 'carrelage' });
    assert.match(r.erreur, /deux niveaux au plus/);
    assert.equal(r.familles, null);
    assert.ok(F.planCreationFamille('Plomberie', l, { nouvelId: () => 'p' }).erreur, 'le premier niveau est fixe');
    assert.ok(F.planCreationFamille('Plomberie', l, { nouvelId: () => 'p', parentId: 'absente' }).erreur);
  });
});

describe('F5 familles de départ verrouillées', () => {
  test('F5 les sept familles de départ ne se renomment ni ne se désactivent ; leurs types sont fixes', () => {
    const l = avecCarrelage();
    for (let i = 1; i <= 7; i++) {
      assert.match(F.planRenommerFamille(`famille-${i}`, 'Autre nom', l).erreur, /famille de départ/);
      assert.match(F.planDesactiverFamille(`famille-${i}`, l).erreur, /famille de départ/);
    }
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7].map((i) => F.typeDeFamille(l, `famille-${i}`)), ['fourniture', 'main_oeuvre', 'ouvrage', 'sous_traitance', 'materiel', 'texte', 'divers']);
    assert.equal(F.familleDeType('materiel'), 'famille-5');
    assert.equal(F.familleDeType('inconnu'), null);
    // Une base où une famille de départ a été renommée ou désactivée avant : elle revient à son nom et reste active.
    const abimee = F.famillesDe({ liste: [{ id: 'famille-7', nom: 'Autres', actif: false }] });
    assert.deepEqual(abimee.find((f) => f.id === 'famille-7'), { id: 'famille-7', nom: 'Divers', actif: true });
    assert.equal(abimee.length, F.FAMILLES_PAR_DEFAUT.length);
  });
  test('F5 on peut renommer et désactiver une sous-famille', () => {
    const l = avecCarrelage();
    assert.equal(F.planRenommerFamille('carrelage', 'Faïence', l).famille.nom, 'Faïence');
    assert.equal(F.planDesactiverFamille('carrelage', l).famille.actif, false);
  });
});

describe('F6 articles existants sans famille', () => {
  test('F6 un article avec un type et sans famille est rattaché à la famille de départ de son type, sans migration', () => {
    const vieux = { id: 'v', libelle: 'Vis', type: 'materiel', actif: true };
    assert.equal(F.familleEffective(vieux), 'famille-5');
    assert.equal(F.cheminFamille(defauts(), F.familleEffective(vieux)), 'Matériels');
    assert.equal(F.familleEffective({ id: 'x', libelle: 'Sans rien' }), '');
    assert.equal(F.familleEffective({ id: 'y', type: 'fourniture', familleId: 'carrelage' }), 'carrelage');
    // Pas de migration : corriger son libellé ne lui ajoute ni famille ni type.
    const plan = A.planMajArticle('v', { libelle: 'Vis inox' }, { articles: [{ ...vieux, prixAchat: 1, unite: 'u' }] });
    assert.deepEqual(plan.patch, { libelle: 'Vis inox' });
  });
});

describe('F7 filtre par famille', () => {
  test('F7 le filtre sur « Fournitures » inclut « Carrelage » et les articles sans famille de type fourniture', () => {
    const familles = avecCarrelage();
    const articles = [
      { id: '1', libelle: 'Carreau', type: 'fourniture', familleId: 'carrelage' },
      { id: '2', libelle: 'Vis', type: 'fourniture', familleId: 'famille-1' },
      { id: '3', libelle: 'Peinture', type: 'fourniture' },
      { id: '4', libelle: 'Pose', type: 'main_oeuvre', familleId: 'famille-2' },
      { id: '5', libelle: 'Divers', type: null },
    ];
    assert.deepEqual(A.filtrerArticles(articles, { familleId: 'famille-1', familles }).map((a) => a.id), ['1', '3', '2']);
    assert.deepEqual(A.filtrerArticles(articles, { familleId: 'carrelage', familles }).map((a) => a.id), ['1'], 'une sous-famille ne montre qu’elle-même');
    assert.deepEqual(A.filtrerArticles(articles, { familleId: 'sans_famille', familles }).map((a) => a.id), ['5']);
  });
});

describe('F8 unités', () => {
  test('F8 la liste d’unités proposées est la nouvelle, sans doublon', () => {
    assert.deepEqual(A.UNITES_PROPOSEES, ['u', 'm', 'm²', 'm³', 'ml', 'h', 'jour', 'semaine', 'mois', 'forfait', 'lot', 'kg', 't', 'L', 'paire', 'ensemble']);
    assert.equal(new Set(A.UNITES_PROPOSEES).size, A.UNITES_PROPOSEES.length);
  });
  test('F8 le menu d’unités n’est plus un datalist (qui filtrait sur la valeur) : il montre tout et propose « Autre… »', () => {
    const src = readFileSync(new URL('../js/modules/devis/bordereau.js', import.meta.url), 'utf8');
    assert.doesNotMatch(src, /h\('datalist', \{ id: 'unites-bordereau'/);
    assert.match(src, /Autre…/);
  });
});

describe('F9 assistant (MCP)', () => {
  async function contexteMemoire(collections) {
    const { creerAccesMemoire } = await import('../functions/src/coeur/donnees.js');
    const ecrites = [];
    const c = { donnees: creerAccesMemoire(collections), acteur: 'essai', maintenant: new Date('2026-10-24T10:00:00Z'), ecrire: async ({ operations }) => { ecrites.push(...operations); return { operationId: 'op', ecritures: operations }; } };
    return { c, ecrites };
  }
  test('F9 familleId déduit le type ; un type en conflit est refusé ; modifier la famille change le type', async () => {
    const metier = await import('../functions/src/coeur/metier.js');
    const collections = {
      devis_articles: [{ id: 'a1', libelle: 'Tube', unite: 'u', prixAchat: 3, type: 'fourniture', familleId: 'famille-1', actif: true }],
      devis_parametres: [{ id: 'familles', liste: [{ id: 'sous', nom: 'Carrelage', actif: true, parentId: 'famille-1' }] }],
      crm_parametres: [], crm_utilisateurs: [],
    };
    const { c, ecrites } = await contexteMemoire(collections);
    await metier.creerArticle(c, { libelle: 'Carreau', prixAchat: 12, familleId: 'sous' });
    assert.equal(ecrites.at(-1).donnees.type, 'fourniture');
    await metier.creerArticle(c, { libelle: 'Pose', prixAchat: 40, unite: 'h', familleId: 'famille-2' });
    assert.equal(ecrites.at(-1).donnees.type, 'main_oeuvre');
    await assert.rejects(() => metier.creerArticle(c, { libelle: 'Faux', prixAchat: 1, type: 'materiel', familleId: 'sous' }), /ne va pas avec la famille/);
    await metier.modifierArticle(c, { id: 'a1', familleId: 'famille-5' });
    assert.deepEqual(ecrites.at(-1).patch, { familleId: 'famille-5', type: 'materiel' });
    await assert.rejects(() => metier.modifierArticle(c, { id: 'a1', type: 'divers' }), /ne va pas avec la famille/);
  });
});

describe('F10 le type ne s’efface pas tant que la famille en porte un', () => {
  test('F10 modifier un article rangé dans « Fournitures » avec type vide est refusé ; sans famille il reste permis', () => {
    const articles = [{ id: 'a1', libelle: 'Tube', unite: 'u', prixAchat: 3, type: 'fourniture', familleId: 'famille-1', actif: true }];
    const refus = A.planMajArticle('a1', { type: null }, { articles, familles: defauts() });
    assert.match(refus.erreurs.type ?? '', /se déduit de la famille/);
    assert.deepEqual(refus.ecritures, []);
  });
});
