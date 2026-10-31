// Dictionnaire de vocabulaire : un mot qui désigne une FAMILLE ou une sous-famille du catalogue (PR C6a de docs/cadrage-vocabulaire-cibles.md) : le moteur pur js/modules/devis/vocabulaire.js.
// Une famille est une cible VIVANTE : elle se résout à l'instant de la recherche en tous les articles actifs de la famille et de ses sous-familles. Un test par critère, le nom commence par K1f à K6f.
// Catalogue, familles, mots et phrases INVENTÉS : aucune donnée de client.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import * as V from '../js/modules/devis/vocabulaire.js';
import { famillesDe } from '../js/modules/devis/familles.js';

const REGLAGES = { marge: 20, modeMarge: 'majoration' };
const FOURNITURES = 'famille-1'; // la famille de premier niveau « Fournitures » ; la liste n'a que deux niveaux : les familles libres ci-dessous en sont des sous-familles
const ELEC = 'famille-1-8'; // Fournitures › Électricité (sous-famille de départ)
const FAMILLES = famillesDe({ liste: [
  { id: 'f-prises', nom: 'Prises', actif: true, parentId: FOURNITURES },
  { id: 'f-tab-elec', nom: 'Tableaux électriques', actif: true, parentId: FOURNITURES },
  { id: 'f-tab-com', nom: 'Tableaux de communication', actif: true, parentId: FOURNITURES },
  { id: 'f-vide', nom: 'Famille vide', actif: true, parentId: FOURNITURES },
  { id: 'f-off', nom: 'Famille désactivée', actif: false, parentId: FOURNITURES },
] });
const art = (id, libelle, familleId, extra = {}) => ({ id, libelle, prixAchat: 10, unite: 'u', actif: true, type: 'fourniture', ...(familleId ? { familleId } : {}), ...extra });
const PRISES = [art('p1', 'Prise simple 16 A', 'f-prises'), art('p2', 'Prise double 16 A', 'f-prises'), art('p3', 'Prise étanche 16 A', 'f-prises')];
const AUTRES = [art('i1', 'Interrupteur étanche', ELEC), art('t1', 'Tableau électrique 2 rangées', 'f-tab-elec'), art('t2', 'Tableau électrique 4 rangées', 'f-tab-elec'), art('c1', 'Tableau de communication 6 prises RJ45', 'f-tab-com'), art('c2', 'Tableau de communication 12 prises RJ45', 'f-tab-com')];
const CATALOGUE = [...PRISES, ...AUTRES];
const motFamille = (cle, familleIds, extra = {}) => ({ id: V.identifiantDeRegle(cle), cle, expression: cle, articleId: '', articleLibelle: '', cibles: familleIds.map((id) => ({ genre: 'famille', id, libelle: id })), statut: 'active', conflit: false, ...extra });
const chercher = (phrase, regles, articles = CATALOGUE, extra = {}) => V.interpreter(phrase, { regles, articles, reglages: REGLAGES, familles: FAMILLES, ...extra });
const ids = (r) => r.candidats.map((c) => c.articleId);
const PRISE = motFamille('prise', ['f-prises']);

describe('K1f un mot qui désigne une famille : le contexte', () => {
  test('K1f « une prise étanche » avec le mot « prise » = la famille « Prises » : la prise étanche, UNE question à un seul choix, jamais l’interrupteur étanche', () => {
    const r = chercher('une prise étanche', [PRISE]);
    assert.equal(r.decision, 'proposer');
    assert.deepEqual(ids(r), ['p3']);
    assert.equal(r.candidats[0].pourquoi, 'contexte_unique');
    assert.equal(r.question, 'C’est bien « Prise étanche 16 A » ?');
    assert.deepEqual(r.portee, { marqueurs: ['prise'], cibles: PRISE.cibles, nombreArticles: 3, reste: ['etanche'] });
  });
  test('K1f « prise » seul (reste vide) : les articles de la famille à 0,60, proposés ; jamais « utiliser »', () => {
    const r = chercher('prise', [PRISE]);
    assert.equal(r.decision, 'proposer');
    assert.deepEqual(r.candidats.slice(0, 3).map((c) => [c.articleId, c.score, c.pourquoi]), [['p2', 0.6, 'contexte_famille'], ['p3', 0.6, 'contexte_famille'], ['p1', 0.6, 'contexte_famille']]); // devant « Tableau de communication 6 prises », simple libellé à 0,60
    assert.equal(r.question.match(/«/g).length, 3, 'seul le groupe du contexte est cité');
    assert.ok(V.SEUILS.familleSansReste < V.SEUILS.utiliser);
  });
  test('K1f un article choisi un à un (0,70) passe devant un article qui ne vient que de la famille (0,60)', () => {
    const regle = { ...motFamille('prise', ['f-prises']), cibles: [{ genre: 'famille', id: 'f-prises', libelle: '' }, { genre: 'article', id: 'i1', libelle: '' }] };
    const r = chercher('prise', [regle]);
    assert.deepEqual(r.candidats.map((c) => [c.articleId, c.score, c.pourquoi]).slice(0, 2), [['i1', 0.7, 'cible_au_choix'], ['p2', 0.6, 'contexte_famille']]);
  });
  test('K1f une famille de premier niveau inclut les articles de ses sous-familles (« Fournitures » = Prises, Tableaux…, Électricité)', () => {
    const r = chercher('fourniture etanche', [motFamille('fourniture', [FOURNITURES])]);
    assert.deepEqual(new Set(ids(r)), new Set(['p3', 'i1']), 'étanche cherché dans toutes les fournitures : la prise ET l’interrupteur étanches');
    assert.ok(r.candidats.every((c) => c.pourquoi === 'contexte_plusieurs'));
  });
});

describe('K2f un mot qui désigne deux familles', () => {
  const TABLEAU = motFamille('tableau', ['f-tab-elec', 'f-tab-com']);
  test('K2f « tableau » sans rien d’autre : `demander`, etape « famille », aucun article, la question nomme les familles', () => {
    const r = chercher('un tableau', [TABLEAU]);
    assert.equal(r.decision, 'demander');
    assert.equal(r.etape, 'famille');
    assert.deepEqual(r.candidats, []);
    assert.deepEqual(r.choixFamilles, [{ id: 'f-tab-elec', chemin: 'Fournitures › Tableaux électriques' }, { id: 'f-tab-com', chemin: 'Fournitures › Tableaux de communication' }]);
    assert.equal(r.question, 'Tu parles de « Fournitures › Tableaux électriques » ou de « Fournitures › Tableaux de communication » ?');
    assert.equal(r.autres, 0);
    assert.deepEqual(r.portee.marqueurs, ['tableau']);
  });
  test('K2f la phrase complétée cherche dans l’union (« tableau rangées » trouve les deux tableaux électriques ; « tableau rj45 » ceux de communication)', () => {
    const r = chercher('tableau 2 rangées', [TABLEAU]);
    assert.equal(r.etape, 'article');
    assert.deepEqual(ids(r).filter((x) => r.candidats.find((c) => c.articleId === x).pourquoi.startsWith('contexte')), ['t1']);
    assert.deepEqual(chercher('tableau rj45', [TABLEAU]).candidats.map((c) => c.pourquoi), ['contexte_plusieurs', 'contexte_plusieurs']);
  });
  test('K2f la famille et sa sous-famille ne sont pas « deux familles » (pas de question de famille) ; un article exact l’emporte sur la question', () => {
    assert.notEqual(chercher('tableau', [motFamille('tableau', [FOURNITURES, 'f-tab-elec'])]).etape, 'famille'); // « Fournitures » contient « Tableaux électriques » : une seule famille racine
    assert.equal(chercher('Tableau électrique 2 rangées', [TABLEAU]).decision, 'utiliser');
  });
  test('K2f une famille vide ou désactivée ne compte pas parmi les familles à choisir', () => {
    assert.equal(chercher('tableau', [motFamille('tableau', ['f-tab-elec', 'f-vide'])]).etape, 'article');
    assert.equal(chercher('tableau', [motFamille('tableau', ['f-tab-elec', 'f-off'])]).etape, 'article');
  });
});

describe('K3f deux familles qui partagent un mot, deux marqueurs', () => {
  test('K3f deux familles dont un article en commun : union ; avec un deuxième marqueur, intersection', () => {
    const intersection = chercher('prise etanche', [PRISE, motFamille('etanche', ['f-prises', 'f-tab-com'])]);
    assert.equal(intersection.portee.nombreArticles, 3, 'prises ∩ (prises ∪ tableaux de communication) = les 3 prises');
    assert.deepEqual(intersection.portee.marqueurs.sort(), ['etanche', 'prise']);
  });
  test('K3f intersection vide : le moteur d’avant, rien d’inventé', () => {
    const r = chercher('prise etanche', [PRISE, motFamille('etanche', ['f-tab-com'])]);
    assert.equal(r.portee, null);
    assert.deepEqual(r.candidats, chercher('prise etanche', []).candidats);
  });
});

describe('K4f cibles mortes : famille vide, désactivée ou supprimée', () => {
  test('K4f famille vide, désactivée, supprimée : le mot est sauté, aucune exception, même réponse que sans le mot', () => {
    for (const cible of ['f-vide', 'f-off', 'f-supprimee']) {
      const avec = chercher('prise etanche', [motFamille('prise', [cible])]);
      assert.deepEqual(avec.candidats, chercher('prise etanche', []).candidats, cible);
      assert.equal(avec.portee, null, cible);
      assert.doesNotThrow(() => chercher('prise', [motFamille('prise', [cible])]));
    }
  });
  test('K4f une famille morte et un article vivant : seul l’article compte', () => {
    const regle = { ...motFamille('prise', ['f-off']), cibles: [{ genre: 'famille', id: 'f-off', libelle: '' }, { genre: 'article', id: 'p1', libelle: '' }] };
    assert.deepEqual(chercher('prise', [regle]).candidats.filter((c) => c.pourquoi === 'cible_au_choix' || c.pourquoi === 'contexte_famille').map((c) => c.articleId), ['p1']);
  });
});

describe('K5f une famille est vivante', () => {
  test('K5f un article ajouté APRÈS dans la famille est trouvé sans toucher au mot ; un article désactivé n’est plus trouvé ; un article déplacé en sort', () => {
    const apres = [...CATALOGUE, art('p4', 'Prise USB étanche 20 A', 'f-prises')];
    assert.deepEqual(chercher('prise etanche', [PRISE], apres).candidats.filter((c) => c.pourquoi.startsWith('contexte')).map((c) => c.articleId), ['p3', 'p4']); // ordre alphabétique des libellés
    const eteinte = apres.map((a) => (a.id === 'p3' ? { ...a, actif: false } : a));
    assert.deepEqual(chercher('prise etanche', [PRISE], eteinte).candidats.filter((c) => c.pourquoi.startsWith('contexte')).map((c) => c.articleId), ['p4']);
    const deplace = apres.map((a) => (a.id === 'p4' ? { ...a, familleId: 'f-tab-com' } : a));
    assert.deepEqual(chercher('prise etanche', [PRISE], deplace).candidats.filter((c) => c.pourquoi.startsWith('contexte')).map((c) => c.articleId), ['p3']);
  });
  test('K5f un ancien article sans `familleId` compte dans la famille de départ de son type (« Fournitures ») ; une ligne de texte libre jamais', () => {
    const anciens = [art('a1', 'Vis à bois', ''), art('a2', 'Cheville', ''), art('txt', 'Note libre', '', { type: 'texte' })];
    const r = chercher('fourniture', [motFamille('fourniture', ['famille-1'])], anciens);
    assert.deepEqual(ids(r).sort(), ['a1', 'a2']);
  });
});

describe('K6f les familles par défaut et les familles absentes', () => {
  test('K6f `familles` absent (ou liste vide) = les familles de départ : la sous-famille « Électricité » existe toujours ; jamais d’exception', () => {
    const regle = motFamille('electricite', [ELEC]);
    const catalogue = [art('x1', 'Prise murale', ELEC)];
    for (const familles of [undefined, null, []]) {
      const r = V.interpreter('electricite', { regles: [regle], articles: catalogue, reglages: REGLAGES, familles });
      assert.deepEqual(ids(r), ['x1'], JSON.stringify(familles));
    }
  });
  test('K6f un groupe de 5 articles ou plus derrière une famille : UNE question de précision, jamais la liste', () => {
    const beaucoup = ['simple', 'double', 'étanche', 'triple', 'murale', 'saillie'].map((t, i) => art(`b${i}`, `Prise ${t} 16 A`, 'f-prises'));
    const r = chercher('prise', [PRISE], beaucoup);
    assert.equal(r.etape, 'precision');
    assert.ok(!r.precision.mots.includes('prise'));
    assert.doesNotMatch(r.question, /«/);
  });
});

describe('K4g K2g marqueur mort parmi d’autres, article choisi à côté d’une famille', () => {
  test('K4g un marqueur MORT (famille vide) n’efface pas le contexte de l’autre : « prise » (vivante) + « etanche » (famille vide) trouve quand même la prise étanche dans « Prises »', () => {
    const r = chercher('prise etanche', [PRISE, motFamille('etanche', ['f-vide'])]);
    assert.deepEqual(r.candidats.filter((c) => c.pourquoi.startsWith('contexte')).map((c) => c.articleId), ['p3']);
    assert.equal(r.candidats[0].pourquoi, 'contexte_unique');
    assert.deepEqual(r.portee.marqueurs, ['prise']);
  });
  test('K2g un mot qui désigne deux familles ET un article choisi un à un : pas de question de famille (l’article reste proposable) ; la question habituelle propose l’article (0,70) puis les articles des familles (0,60)', () => {
    const regle = { ...motFamille('tableau', ['f-tab-elec', 'f-tab-com']), cibles: [{ genre: 'famille', id: 'f-tab-elec', libelle: '' }, { genre: 'famille', id: 'f-tab-com', libelle: '' }, { genre: 'article', id: 'p1', libelle: '' }] };
    const r = chercher('tableau', [regle], [PRISES[0], AUTRES[1], AUTRES[3]]); // 3 articles : un choisi, un par famille
    assert.equal(r.etape, 'article');
    assert.equal(r.candidats[0].articleId, 'p1');
    assert.equal(r.candidats[0].score, 0.7);
    assert.match(r.question, /Prise simple 16 A/);
  });
});
