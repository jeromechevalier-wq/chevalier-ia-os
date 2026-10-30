// Compteur d'usage des articles (cadrage vocabulaire-cibles, section 2.9 ; PR C3, 30/10/2026) : K17 à K20. Accès aux données EN MÉMOIRE (comme devis-montant-affaire.test.js).
// Les noms des tests commencent par le numéro du cas.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { creerAccesMemoire, COLLECTIONS as C } from '../functions/src/coeur/donnees.js';
import * as S from '../functions/src/coeur/devis.js';
import * as U from '../functions/src/coeur/usage-articles.js';
import { nouveauDevis } from '../functions/partage/devis.js';

const ACTEUR = 'jerome.chevalier@gmail.com';
const T1 = new Date('2026-10-29T10:00:00Z');
const T2 = new Date('2026-10-30T10:00:00Z');
const ctx = (maintenant = T1) => ({ acteur: ACTEUR, via: 'ecran', maintenant });

function monde(devis = []) {
  const collections = { [C.devis]: devis, [C.affaires]: [{ id: 'aff1', titre: 'Rénovation' }], [C.devisCompteurs]: [], [C.devisUsageArticles]: [], [C.devisParametres]: [{ id: 'reglages', regimeTva: 'assujetti' }], [C.audit]: [], [C.auditAvant]: [] };
  return { collections, donnees: creerAccesMemoire(collections) };
}
const ligne = (id, articleId, extra = {}) => ({ genre: 'ligne', id, articleId, libelle: `Article ${articleId}`, unite: 'u', quantite: 1, prixAchat: 10, ...extra });
/** Brouillon dont les lignes pointent vers `articles` (une ligne par identifiant donné, doublons compris). */
function brouillon(id, articles, extra = {}) {
  const d = nouveauDevis({ destinataires: [{ email: 'client@exemple.test' }], affaireId: 'aff1' }, { id, maintenant: T1, auteur: ACTEUR }, { marge: 20, margeDevis: 20 });
  return { ...d, sections: [{ id: `s-${id}`, titre: 'Travaux', lignes: articles.map((a, i) => ligne(`${id}-l${i}`, a)) }], ...extra };
}
const usage = (m) => Object.fromEntries(m.collections[C.devisUsageArticles].map((u) => [u.id, u.nombre]));
const usageDoc = (m, id) => m.collections[C.devisUsageArticles].find((u) => u.id === id);
const finaliser = (m, devisId, maintenant = T1) => S.finaliser({ donnees: m.donnees, ctx: ctx(maintenant), devisId });
const statut = (m, devisId, action) => S.changerStatut({ donnees: m.donnees, ctx: ctx(), devisId, action });
/** Une version suivante : copie du devis source, ses lignes remplacées par `articles`, puis finalisée. */
async function versionSuivante(m, sourceId, articles, maintenant = T2) {
  const r = await S.nouvelleVersion({ donnees: m.donnees, ctx: ctx(maintenant), devisId: sourceId });
  const brouillonNeuf = m.collections[C.devis].find((d) => d.id === r.devis.id);
  brouillonNeuf.sections = [{ id: `s-${r.devis.id}`, titre: 'Travaux', lignes: articles.map((a, i) => ligne(`${r.devis.id}-l${i}`, a)) }];
  await finaliser(m, r.devis.id, maintenant);
  return r.devis.id;
}

describe('K17 un devis finalisé compte une fois chaque article distinct', () => {
  test('K17 finaliser ajoute 1 à chaque article DISTINCT (deux lignes du même article = +1) et pose la date de la finalisation', async () => {
    const m = monde([brouillon('d1', ['a1', 'a1', 'a2'])]);
    await finaliser(m, 'd1');
    assert.deepEqual(usage(m), { a1: 1, a2: 1 });
    assert.deepEqual(usageDoc(m, 'a1'), { id: 'a1', articleId: 'a1', nombre: 1, derniereUtilisationLe: T1 });
  });
  test('K17 un brouillon, une modification de brouillon, un changement de statut ou une archive ne comptent rien', async () => {
    const m = monde([brouillon('d1', ['a1'])]);
    m.collections[C.devis][0].sections[0].lignes.push(ligne('x', 'a9')); // modification de brouillon (écrite par le navigateur)
    assert.deepEqual(usage(m), {});
    await finaliser(m, 'd1');
    const apres = JSON.stringify(m.collections[C.devisUsageArticles]);
    await statut(m, 'd1', 'marquer_envoye');
    await statut(m, 'd1', 'accepter');
    await S.archiver({ donnees: m.donnees, ctx: ctx(), devisId: 'd1', archive: true });
    assert.equal(JSON.stringify(m.collections[C.devisUsageArticles]), apres, 'envoi, signature et archive ne touchent pas le compteur');
    assert.deepEqual(usage(m), { a1: 1, a9: 1 });
  });
  test('K17 deux devis différents qui contiennent le même article : 2 ; la date est celle de la dernière finalisation', async () => {
    const m = monde([brouillon('d1', ['a1']), brouillon('d2', ['a1', 'a2'])]);
    await finaliser(m, 'd1', T1);
    await finaliser(m, 'd2', T2);
    assert.deepEqual(usage(m), { a1: 2, a2: 1 });
    assert.deepEqual(usageDoc(m, 'a1').derniereUtilisationLe, T2);
  });
  test('K17 les composants d’un ouvrage, les sauts de page et les lignes sans article ne comptent pas', async () => {
    const d = brouillon('d1', ['ouvrage1']);
    d.sections[0].lignes[0].composants = [{ articleId: 'composant1', quantite: 2 }];
    d.sections[0].lignes.push({ genre: 'ligne', type: 'saut', id: 'saut1', articleId: 'a-saut' }, ligne('libre', undefined), ligne('piege', 'a/b'));
    const m = monde([d]);
    const r = await finaliser(m, 'd1');
    assert.equal(r.ok, true, JSON.stringify(r.erreurs));
    assert.deepEqual(usage(m), { ouvrage1: 1 });
  });
});

describe('K18 un même numéro de devis ne compte qu’une fois par article', () => {
  test('K18 v1 finalisée puis REFUSÉE, v2 finalisée : les articles communs restent à 1, l’article retiré -1, le nouveau +1', async () => {
    const m = monde([brouillon('d1', ['a1', 'a2'])]);
    await finaliser(m, 'd1');
    await statut(m, 'd1', 'marquer_envoye');
    await statut(m, 'd1', 'refuser');
    assert.deepEqual(usage(m), { a1: 1, a2: 1 });
    await versionSuivante(m, 'd1', ['a1', 'a3']);
    assert.deepEqual(usage(m), { a1: 1, a2: 0, a3: 1 });
    assert.deepEqual(usageDoc(m, 'a1').derniereUtilisationLe, T2, 'un article resté garde son nombre mais prend la date de la nouvelle finalisation');
    assert.deepEqual(usageDoc(m, 'a3').derniereUtilisationLe, T2);
    assert.deepEqual(usageDoc(m, 'a2').derniereUtilisationLe, T1, 'un retrait ne change pas la date');
  });
  test('K18 v1 finalisée (en attente), v2 finalisée puis v3 : la différence se calcule contre la version précédente non brouillon, jamais négatif', async () => {
    const m = monde([brouillon('d1', ['a1', 'a2'])]);
    await finaliser(m, 'd1');
    const v2 = await versionSuivante(m, 'd1', ['a1']);
    assert.deepEqual(usage(m), { a1: 1, a2: 0 });
    await versionSuivante(m, v2, ['a2', 'a4']);
    assert.deepEqual(usage(m), { a1: 0, a2: 1, a4: 1 });
    assert.ok(Object.values(usage(m)).every((n) => n >= 0));
  });
  test('K18 differenceUsage / versionDeReference : la référence est la version non brouillon de plus haut numéro AVANT la version finalisée', () => {
    const v = (id, version, statutV, articles) => ({ id, version, statut: statutV, sections: [{ lignes: articles.map((a, i) => ligne(`${id}${i}`, a)) }] });
    const versions = [v('v1', 1, 'remplace', ['a']), v('v2', 2, 'refuse', ['a', 'b']), v('v3', 3, 'brouillon', ['z'])];
    assert.equal(U.versionDeReference(v('v4', 4, 'brouillon', ['c']), versions).id, 'v2');
    assert.equal(U.versionDeReference(v('v1', 1, 'brouillon', []), versions), null);
    assert.deepEqual(U.differenceUsage(v('v4', 4, 'brouillon', ['b', 'c']), versions[1]), { ajoutes: ['c'], retires: ['a'] });
  });
});

describe('K19 le compteur suit la transaction de finalisation', () => {
  test('K19 si la finalisation échoue (erreurs de finalisation), aucun compteur n’est écrit', async () => {
    const sansDestinataire = brouillon('d1', ['a1'], { affaireId: null });
    const m = monde([sansDestinataire]);
    const r = await finaliser(m, 'd1');
    assert.equal(r.ok, false);
    assert.deepEqual(usage(m), {});
    assert.equal(m.collections[C.devis][0].statut, 'brouillon');
  });
  test('K19 un devis de 300 articles distincts passe ; un document d’usage absent est créé (set, jamais update)', async () => {
    const articles = Array.from({ length: 300 }, (_, i) => `art${i}`);
    const m = monde([brouillon('d1', articles)]);
    const r = await finaliser(m, 'd1');
    assert.equal(r.ok, true);
    assert.equal(m.collections[C.devisUsageArticles].length, 300);
    assert.ok(m.collections[C.devisUsageArticles].every((u) => u.nombre === 1));
  });
  test('K19 le compteur n’écrit aucune ligne de journal et ne casse pas le journal de la finalisation', async () => {
    const m = monde([brouillon('d1', ['a1'])]);
    await finaliser(m, 'd1');
    assert.ok(m.collections[C.audit].length >= 1);
    assert.ok(m.collections[C.audit].every((l) => l.collection !== C.devisUsageArticles && !String(l.cible ?? '').includes('usage')));
  });
});

describe('K20 recalcul du compteur', () => {
  /** Un monde déjà finalisé « à la main » : trois racines (une refaite en v2) dont un brouillon qui ne compte pas. */
  const devisExistants = () => [
    { ...brouillon('d1', ['a1', 'a2']), statut: 'en_attente_envoi', numero: 'DEV-1', finaliseLe: T1, racineId: 'd1', version: 1 },
    { ...brouillon('d2', ['a1']), statut: 'refuse', numero: 'DEV-2', finaliseLe: T1, racineId: 'd2', version: 1 },
    { ...brouillon('d2b', ['a1', 'a3']), statut: 'en_attente_envoi', numero: 'DEV-2', finaliseLe: T2, racineId: 'd2', version: 2 },
    { ...brouillon('d3', ['a9']), statut: 'brouillon' },
  ];
  test('K20 l’aperçu ne modifie rien ; l’application écrit seulement la collection d’usage', async () => {
    const m = monde(devisExistants());
    const avantDevis = JSON.stringify(m.collections[C.devis]);
    const apercu = await S.recalculerUsageArticles({ donnees: m.donnees, ctx: ctx(), appliquer: false });
    assert.equal(apercu.total, 3);
    assert.deepEqual(apercu.lignes.map((l) => [l.articleId, l.avant, l.apres]), [['a1', 0, 2], ['a2', 0, 1], ['a3', 0, 1]]);
    assert.deepEqual(m.collections[C.devisUsageArticles], []);
    const r = await S.recalculerUsageArticles({ donnees: m.donnees, ctx: ctx(), appliquer: true });
    assert.equal(r.ecrits, 3);
    assert.deepEqual(usage(m), { a1: 2, a2: 1, a3: 1 }); // d2 v1 refusée + v2 : UN seul numéro de devis ; le brouillon ne compte pas
    assert.equal(JSON.stringify(m.collections[C.devis]), avantDevis, 'aucun devis n’est touché');
    assert.deepEqual(usageDoc(m, 'a3').derniereUtilisationLe, T2);
  });
  test('K20 l’application donne le même résultat que les finalisations successives', async () => {
    const successif = monde([brouillon('d1', ['a1', 'a2']), brouillon('d2', ['a1'])]);
    await finaliser(successif, 'd1', T1);
    await finaliser(successif, 'd2', T1);
    await statut(successif, 'd2', 'marquer_envoye');
    await statut(successif, 'd2', 'refuser');
    await versionSuivante(successif, 'd2', ['a1', 'a3']);
    const recalcule = monde(structuredClone(successif.collections[C.devis]));
    await S.recalculerUsageArticles({ donnees: recalcule.donnees, ctx: ctx(), appliquer: true });
    assert.deepEqual(usage(recalcule), usage(successif));
    const dates = (x) => Object.fromEntries(x.collections[C.devisUsageArticles].map((u) => [u.id, u.derniereUtilisationLe?.toISOString() ?? null]));
    assert.deepEqual(dates(recalcule), dates(successif), 'les dates aussi sont les mêmes');
  });
  test('K20 idempotent ; un compteur qui ne correspond plus à aucun devis repasse à 0 ; les composants ne comptent pas', async () => {
    const m = monde(devisExistants());
    m.collections[C.devis][0].sections[0].lignes[0].composants = [{ articleId: 'composant1', quantite: 1 }];
    m.collections[C.devisUsageArticles].push({ id: 'fantome', articleId: 'fantome', nombre: 4, derniereUtilisationLe: T1 });
    await S.recalculerUsageArticles({ donnees: m.donnees, ctx: ctx(), appliquer: true });
    assert.deepEqual(usage(m), { a1: 2, a2: 1, a3: 1, fantome: 0 });
    const encore = await S.recalculerUsageArticles({ donnees: m.donnees, ctx: ctx(), appliquer: true });
    assert.deepEqual([encore.total, encore.ecrits], [0, 0]);
  });
  test('K20 le recalcul ne touche pas un compteur qui a bougé depuis l’aperçu (une finalisation est passée) et le dit', async () => {
    const m = monde(devisExistants());
    const vrai = m.donnees.transaction.bind(m.donnees);
    let passe = false;
    m.donnees.transaction = async (fn) => { // une finalisation concurrente s'insère juste avant l'écriture du premier lot
      if (!passe) { passe = true; m.collections[C.devisUsageArticles].push({ id: 'a1', articleId: 'a1', nombre: 7, derniereUtilisationLe: T2 }); }
      return vrai(fn);
    };
    const r = await S.recalculerUsageArticles({ donnees: m.donnees, ctx: ctx(), appliquer: true });
    assert.deepEqual([r.ecrits, r.ignores], [2, 1]);
    assert.equal(usage(m).a1, 7, 'la valeur concurrente est intacte');
    assert.deepEqual([usage(m).a2, usage(m).a3], [1, 1]);
  });
  test('K20 un compteur passé à 0 garde sa dernière date', async () => {
    const m = monde([]);
    m.collections[C.devisUsageArticles].push({ id: 'vieux', articleId: 'vieux', nombre: 2, derniereUtilisationLe: T1 });
    await S.recalculerUsageArticles({ donnees: m.donnees, ctx: ctx(), appliquer: true });
    assert.deepEqual([usageDoc(m, 'vieux').nombre, usageDoc(m, 'vieux').derniereUtilisationLe], [0, T1]);
  });
  test('K20 cas vide : sans devis, rien à corriger et rien n’est écrit', async () => {
    const m = monde([]);
    const r = await S.recalculerUsageArticles({ donnees: m.donnees, ctx: ctx(), appliquer: true });
    assert.deepEqual([r.total, r.ecrits, r.lignes], [0, 0, []]);
  });
  test('K20 plus de LOT_RECALCUL documents : écrits par lots, tous passent', async () => {
    const devis = Array.from({ length: 3 }, (_, i) => ({ ...brouillon(`d${i}`, Array.from({ length: 120 }, (_x, k) => `art${k}`)), statut: 'en_attente_envoi', numero: `DEV-${i}`, finaliseLe: T1, racineId: `d${i}`, version: 1 }));
    const m = monde(devis);
    const r = await S.recalculerUsageArticles({ donnees: m.donnees, ctx: ctx(), appliquer: true });
    assert.equal(r.ecrits, 120);
    assert.ok(m.collections[C.devisUsageArticles].every((u) => u.nombre === 3));
    assert.equal(r.lignes.length, S.MAX_APERCU);
  });
});
