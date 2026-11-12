// Relevé hebdomadaire des chiffres des posts (module Réseaux sociaux) : semaine ISO à Paris, pagination, idempotence, métrique absente, accès. Buffer et la base sont simulés. Données fictives uniquement.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { semaineIsoParis, idMesure, construireMesure, releverMesures, COLLECTION_MESURES } from '../functions/src/reseauxsociaux/mesures.js';
import { creerServiceBuffer, ErreurBuffer, TAILLE_PAGE, PAGES_MAX } from '../functions/src/reseauxsociaux/service.js';
import { creerAppelReleve } from '../functions/src/reseauxsociaux/appel.js';

const lire = (chemin) => readFileSync(new URL(`../${chemin}`, import.meta.url), 'utf8');
const COMPTE = 'jerome.chevalier@gmail.com';
const mesure = (type, value) => ({ type, name: type, value, unit: 'count' });
const publie = (id, metrics, extra = {}) => ({ id, status: 'sent', sentAt: '2026-11-05T06:00:09Z', metricsUpdatedAt: '2026-11-10T08:00:00Z', metrics, ...extra });

/** Faux Buffer : sert `pages` (liste de pages { noeuds, pageInfo }) l'une après l'autre selon le curseur `after`, et garde ce qu'il reçoit. */
function fauxBuffer({ pages }) {
  const recus = [];
  const fetchImpl = async (url, options) => {
    const q = JSON.parse(options.body).query;
    recus.push(q);
    let data;
    if (q.includes('account')) data = { account: { organizations: [{ id: 'org1' }] } };
    else if (q.includes('channels')) data = { channels: [{ id: 'canal1', name: 'canal-fictif', service: 'linkedin' }] };
    else {
      const apres = /after:"([^"]+)"/.exec(q)?.[1];
      const i = apres ? Number(apres.replace('c', '')) : 0;
      const page = typeof pages === 'function' ? pages(i) : pages[i];
      data = { posts: { edges: page.noeuds.map((node) => ({ node })), ...(page.pageInfo === undefined ? {} : { pageInfo: page.pageInfo }) } };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify({ data }) };
  };
  return { recus, fetchImpl };
}
const serviceAvec = (faux) => creerServiceBuffer({ fetchImpl: faux.fetchImpl, lireCle: async () => 'cle-fictive-pour-les-tests-0123456789' });
const fauxeBase = () => {
  const docs = new Map();
  let appels = 0;
  return { docs, get appels() { return appels; }, async ecrire(collection, documents, { ecraser }) {
    appels += 1;
    let ecrits = 0;
    let ignores = 0;
    for (const d of documents) {
      const cle = `${collection}/${d.id}`;
      if (!ecraser && docs.has(cle)) { ignores += 1; continue; } // comme `create` : un document existant n'est pas touché
      docs.set(cle, structuredClone(d.donnees));
      ecrits += 1;
    }
    return { ecrits, ignores };
  } };
};

describe('M1 semaine ISO à Paris', () => {
  test('M1 cas connus (le lundi 06:00 de Paris ouvre la semaine)', () => {
    assert.equal(semaineIsoParis(new Date('2026-11-09T05:00:00Z')), '2026-S46'); // lundi 06:00 Paris (hiver, UTC+1)
    assert.equal(semaineIsoParis(new Date('2026-11-08T22:00:00Z')), '2026-S45'); // dimanche 23:00 Paris
    assert.equal(semaineIsoParis(new Date('2026-06-15T04:00:00Z')), '2026-S25'); // lundi 06:00 Paris (été, UTC+2)
  });
  test('M1 la nuit du dimanche au lundi se juge à l\'heure de Paris, pas à l\'heure UTC (hiver et été)', () => {
    assert.equal(semaineIsoParis(new Date('2026-11-08T23:30:00Z')), '2026-S46'); // lundi 00:30 à Paris, dimanche en UTC
    assert.equal(semaineIsoParis(new Date('2026-06-14T21:30:00Z')), '2026-S24'); // dimanche 23:30 à Paris
    assert.equal(semaineIsoParis(new Date('2026-06-14T22:30:00Z')), '2026-S25'); // lundi 00:30 à Paris
  });
  test('M1 changements d\'heure : les lundis 06:00 se suivent de semaine en semaine, avant et après', () => {
    // Passage à l'heure d'été le 29/03/2026 et à l'heure d'hiver le 25/10/2026.
    const lundisEte = ['2026-03-23T05:00:00Z', '2026-03-30T04:00:00Z', '2026-04-06T04:00:00Z'].map((t) => semaineIsoParis(new Date(t)));
    assert.deepEqual(lundisEte, ['2026-S13', '2026-S14', '2026-S15']);
    const lundisHiver = ['2026-10-19T04:00:00Z', '2026-10-26T05:00:00Z', '2026-11-02T05:00:00Z'].map((t) => semaineIsoParis(new Date(t)));
    assert.deepEqual(lundisHiver, ['2026-S43', '2026-S44', '2026-S45']);
    assert.equal(semaineIsoParis(new Date('2026-03-29T21:30:00Z')), '2026-S13'); // dimanche 23:30 Paris, jour du changement
    assert.equal(semaineIsoParis(new Date('2026-03-29T22:30:00Z')), '2026-S14'); // lundi 00:30 Paris
  });
  test('M1 semaine 53 et passage d\'année (2026 a 53 semaines)', () => {
    assert.equal(semaineIsoParis(new Date('2026-12-28T05:00:00Z')), '2026-S53');
    assert.equal(semaineIsoParis(new Date('2027-01-01T11:00:00Z')), '2026-S53'); // 1er janvier 2027 : encore la semaine 53 de 2026
    assert.equal(semaineIsoParis(new Date('2027-01-03T23:30:00Z')), '2027-S01'); // lundi 04/01, 00:30 à Paris
    assert.equal(semaineIsoParis(new Date('2027-01-03T22:30:00Z')), '2026-S53'); // dimanche 23:30 à Paris
    assert.equal(semaineIsoParis(new Date('2024-12-30T05:00:00Z')), '2025-S01'); // décembre qui appartient à l'année suivante
    assert.equal(semaineIsoParis(new Date('2021-01-03T12:00:00Z')), '2020-S53');
  });
  test('M1 date invalide -> erreur claire ; entier (millisecondes) accepté', () => {
    assert.throws(() => semaineIsoParis(new Date('n\'importe quoi')), RangeError);
    assert.equal(semaineIsoParis(Date.UTC(2026, 10, 9, 5)), '2026-S46');
  });
  test('M1 identifiant du document : <idPostBuffer>_<AAAA-Sss>', () => {
    assert.equal(idMesure('abc123', '2026-S46'), 'abc123_2026-S46');
  });
});

describe('M2 construireMesure : une métrique absente n\'est jamais écrite', () => {
  const releveLe = new Date('2026-11-09T05:00:00Z');
  test('M2 seules les métriques présentes sont écrites ; un vrai 0 reste un 0 ; rien d\'autre n\'est inventé', () => {
    const doc = construireMesure({ id: 'p1', publieLe: '2026-11-05T06:00:09.000Z', metricsUpdatedAt: '2026-11-08T08:00:00.000Z', mesures: { impressions: 120, reactions: 0, engagementRate: 3.45 } }, { semaine: '2026-S46', releveLe });
    assert.deepEqual(Object.keys(doc).sort(), ['engagementRate', 'impressions', 'metricsUpdatedAt', 'postId', 'publieLe', 'reactions', 'releveLe', 'semaine']);
    assert.equal(doc.reactions, 0);
    assert.equal(doc.postId, 'p1');
    assert.equal(doc.semaine, '2026-S46');
    assert.equal(doc.releveLe.toISOString(), '2026-11-09T05:00:00.000Z');
    assert.equal(doc.metricsUpdatedAt.toISOString(), '2026-11-08T08:00:00.000Z');
    for (const absent of ['reach', 'comments', 'views', 'viewers', 'totalTimeWatched']) assert.equal(Object.hasOwn(doc, absent), false, absent);
  });
  test('M2 sans date de mise à jour chez Buffer, le champ n\'existe pas ; valeurs non numériques et types inconnus ignorés', () => {
    const doc = construireMesure({ id: 'p2', publieLe: null, metricsUpdatedAt: null, mesures: { reach: 80, views: '9', comments: NaN, clics: 4 } }, { semaine: '2026-S46', releveLe });
    assert.deepEqual(Object.keys(doc).sort(), ['postId', 'reach', 'releveLe', 'semaine']);
  });
  test('M2 un post sans aucun chiffre ne produit pas de document', () => {
    assert.equal(construireMesure({ id: 'p3', mesures: {} }, { semaine: '2026-S46', releveLe }), null);
  });
  test('M2 les huit métriques suivies sont reprises', () => {
    const toutes = { impressions: 1, reach: 2, reactions: 3, comments: 4, engagementRate: 5, views: 6, viewers: 7, totalTimeWatched: 8 };
    const doc = construireMesure({ id: 'p4', mesures: toutes }, { semaine: '2026-S46', releveLe });
    for (const [k, v] of Object.entries(toutes)) assert.equal(doc[k], v);
  });
});

describe('M3 lecture de tous les posts publiés (pagination)', () => {
  const noeuds = (prefixe, n, etat = 'sent') => Array.from({ length: n }, (_, i) => publie(`${prefixe}${i}`, [mesure('impressions', i + 1)], { status: etat }));

  test('M3 trois pages : tout est lu, rien n\'est tronqué, les brouillons et programmés sont écartés mais comptés', async () => {
    const faux = fauxBuffer({ pages: [
      { noeuds: [...noeuds('a', 2), { id: 'brouillon', status: 'draft', metrics: [] }], pageInfo: { hasNextPage: true, endCursor: 'c1' } },
      { noeuds: [...noeuds('b', 2), { id: 'prog', status: 'scheduled', metrics: [] }], pageInfo: { hasNextPage: true, endCursor: 'c2' } },
      { noeuds: noeuds('c', 1), pageInfo: { hasNextPage: false, endCursor: 'c3' } },
    ] });
    const r = await serviceAvec(faux).lirePostsPublies();
    assert.equal(r.pages, 3);
    assert.equal(r.lus, 7);
    assert.deepEqual(r.posts.map((p) => p.id), ['a0', 'a1', 'b0', 'b1', 'c0']);
    assert.equal(r.tronque, false);
    const requetesPosts = faux.recus.filter((q) => q.includes('posts('));
    assert.equal(requetesPosts.length, 3);
    assert.ok(!requetesPosts[0].includes('after:'));
    assert.ok(requetesPosts[1].includes('after:"c1"') && requetesPosts[2].includes('after:"c2"'));
    assert.ok(faux.recus.every((q) => q.startsWith('{') && !/mutation/i.test(q)), 'lecture seule');
  });
  test('M3 plafond de pages atteint : on le DIT (tronque, raison pages_max), on ne coupe pas en silence', async () => {
    const faux = fauxBuffer({ pages: (i) => ({ noeuds: noeuds(`p${i}-`, 1), pageInfo: { hasNextPage: true, endCursor: `c${i + 1}` } }) });
    const r = await serviceAvec(faux).lirePostsPublies();
    assert.equal(r.pages, PAGES_MAX);
    assert.equal(r.posts.length, PAGES_MAX);
    assert.equal(r.tronque, true);
    assert.equal(r.raisonTronque, 'pages_max');
  });
  test('M3 curseur répété ou inutilisable : arrêt signalé (pas de boucle infinie, pas d\'injection dans la requête)', async () => {
    const boucle = fauxBuffer({ pages: () => ({ noeuds: noeuds('x', 1), pageInfo: { hasNextPage: true, endCursor: 'c1' } }) });
    const r1 = await serviceAvec(boucle).lirePostsPublies();
    assert.equal(r1.tronque, true);
    assert.equal(r1.raisonTronque, 'curseur_inutilisable');
    assert.equal(r1.pages, 2);
    const piege = fauxBuffer({ pages: [{ noeuds: noeuds('y', 1), pageInfo: { hasNextPage: true, endCursor: 'x" } mutation { ' } }] });
    const r2 = await serviceAvec(piege).lirePostsPublies();
    assert.equal(r2.tronque, true);
    assert.equal(r2.pages, 1);
    assert.ok(piege.recus.every((q) => !/mutation/i.test(q)));
  });
  test('M3 page pleine sans indication de suite : signalé ; page courte sans indication : pas de faux signal', async () => {
    const pleine = await serviceAvec(fauxBuffer({ pages: [{ noeuds: noeuds('z', TAILLE_PAGE) }] })).lirePostsPublies();
    assert.equal(pleine.tronque, true);
    assert.equal(pleine.raisonTronque, 'suite_inconnue');
    const courte = await serviceAvec(fauxBuffer({ pages: [{ noeuds: noeuds('z', 3) }] })).lirePostsPublies();
    assert.equal(courte.tronque, false);
    assert.equal(courte.posts.length, 3);
  });
  test('M3 clé refusée -> ErreurBuffer (jamais de relevé à moitié)', async () => {
    const service = creerServiceBuffer({ fetchImpl: async () => ({ ok: false, status: 401, text: async () => 'secret' }), lireCle: async () => 'cle-fictive-pour-les-tests-0123456789' });
    await assert.rejects(service.lirePostsPublies(), (e) => e instanceof ErreurBuffer && e.code === 'buffer_refuse');
  });
});

describe('M4 relevé de la semaine : écriture, idempotence', () => {
  const lundi = Date.UTC(2026, 10, 9, 5, 0, 0);
  const pages = () => [{ noeuds: [
    publie('p1', [mesure('impressions', 120), mesure('reach', 80), mesure('reactions', 0), mesure('comments', 2), mesure('engagementRate', 3.45)]),
    publie('p2', [mesure('views', 9), mesure('viewers', 7), mesure('totalTimeWatched', 40)]),
    publie('p3', []),
    publie('a/b', [mesure('impressions', 1)]),
    { id: 'brouillon', status: 'draft', metrics: [mesure('impressions', 5)] },
  ], pageInfo: { hasNextPage: false, endCursor: null } }];

  test('M4 un document par post publié avec chiffres, sous l\'id <post>_<semaine>, et un compte rendu complet', async () => {
    const base = fauxeBase();
    const journal = [];
    const r = await releverMesures({ service: serviceAvec(fauxBuffer({ pages: pages() })), donnees: base, maintenant: () => lundi, journal: (e) => journal.push(e) });
    assert.deepEqual([...base.docs.keys()].sort(), [`${COLLECTION_MESURES}/p1_2026-S46`, `${COLLECTION_MESURES}/p2_2026-S46`]);
    assert.equal(COLLECTION_MESURES, 'reseauxsociaux_mesures');
    const p1 = base.docs.get('reseauxsociaux_mesures/p1_2026-S46');
    assert.equal(p1.postId, 'p1');
    assert.equal(p1.reactions, 0);
    assert.equal(Object.hasOwn(p1, 'views'), false);
    const p2 = base.docs.get('reseauxsociaux_mesures/p2_2026-S46');
    assert.equal(Object.hasOwn(p2, 'impressions'), false);
    assert.equal(p2.totalTimeWatched, 40);
    assert.deepEqual({ ok: r.ok, semaine: r.semaine, lus: r.lus, publies: r.publies, ecrits: r.ecrits, sansChiffres: r.sansChiffres, ignores: r.ignores, tronque: r.tronque },
      { ok: true, semaine: '2026-S46', lus: 5, publies: 4, ecrits: 2, sansChiffres: 1, ignores: 1, tronque: false });
    assert.equal(journal.length, 1);
    assert.equal(journal[0].statut, 'ok');
  });
  test('M4 idempotent : relancer la même semaine met à jour les mêmes documents, sans doublon ; la semaine suivante crée de nouveaux documents', async () => {
    const base = fauxeBase();
    const service = () => serviceAvec(fauxBuffer({ pages: pages() }));
    await releverMesures({ service: service(), donnees: base, maintenant: () => lundi });
    const apres1 = structuredClone([...base.docs.entries()]);
    await releverMesures({ service: service(), donnees: base, maintenant: () => lundi + 3_600_000 }); // même semaine, une heure plus tard
    assert.equal(base.docs.size, 2);
    assert.equal(base.docs.get('reseauxsociaux_mesures/p1_2026-S46').impressions, 120);
    assert.equal(base.docs.get('reseauxsociaux_mesures/p1_2026-S46').releveLe.toISOString(), '2026-11-09T06:00:00.000Z'); // la dernière lecture de la semaine l'emporte
    assert.deepEqual(apres1.map(([k]) => k), [...base.docs.keys()]);
    await releverMesures({ service: service(), donnees: base, maintenant: () => lundi + 7 * 86_400_000 });
    assert.equal(base.docs.size, 4);
    assert.ok(base.docs.has('reseauxsociaux_mesures/p1_2026-S47'));
  });
  test('M4 une métrique qui disparaît de Buffer disparaît du document de la semaine (remplacement, pas de fusion qui garderait un ancien chiffre)', async () => {
    const base = fauxeBase();
    await releverMesures({ service: serviceAvec(fauxBuffer({ pages: pages() })), donnees: base, maintenant: () => lundi });
    const moins = [{ noeuds: [publie('p1', [mesure('impressions', 130)])], pageInfo: { hasNextPage: false } }];
    // Le faux de la base remplace le document comme `set` sans fusion.
    await releverMesures({ service: serviceAvec(fauxBuffer({ pages: moins })), donnees: base, maintenant: () => lundi + 60_000 });
    const p1 = base.docs.get('reseauxsociaux_mesures/p1_2026-S46');
    assert.equal(p1.impressions, 130);
    assert.equal(Object.hasOwn(p1, 'reach'), false);
  });
  test('M4 relevé à la main (ecraser: false) : un document déjà relevé cette semaine n\'est pas touché, et le compte rendu dit combien ont été ignorés', async () => {
    const base = fauxeBase();
    const service = (p) => serviceAvec(fauxBuffer({ pages: p }));
    await releverMesures({ service: service(pages()), donnees: base, maintenant: () => lundi }); // le relevé planifié du lundi
    const avant = structuredClone(base.docs.get('reseauxsociaux_mesures/p1_2026-S46'));
    const change = [{ noeuds: [publie('p1', [mesure('impressions', 999)]), publie('p9', [mesure('impressions', 3)])], pageInfo: { hasNextPage: false } }];
    const r = await releverMesures({ service: service(change), donnees: base, maintenant: () => lundi + 86_400_000, ecraser: false });
    assert.deepEqual(base.docs.get('reseauxsociaux_mesures/p1_2026-S46'), avant);
    assert.ok(base.docs.has('reseauxsociaux_mesures/p9_2026-S46'));
    assert.equal(r.ecrits, 1);
    assert.equal(r.dejaReleves, 1);
  });
  test('M4 lecture tronquée : ce qui a été lu est écrit ET le compte rendu le dit', async () => {
    const base = fauxeBase();
    const faux = fauxBuffer({ pages: (i) => ({ noeuds: [publie(`q${i}`, [mesure('impressions', 1)])], pageInfo: { hasNextPage: true, endCursor: `c${i + 1}` } }) });
    const journal = [];
    const r = await releverMesures({ service: serviceAvec(faux), donnees: base, maintenant: () => lundi, journal: (e) => journal.push(e) });
    assert.equal(r.tronque, true);
    assert.equal(r.ecrits, PAGES_MAX);
    assert.equal(base.docs.size, PAGES_MAX);
    assert.equal(journal[0].statut, 'tronque');
  });
  test('M4 rien à écrire : aucune écriture dans la base', async () => {
    const base = fauxeBase();
    const r = await releverMesures({ service: serviceAvec(fauxBuffer({ pages: [{ noeuds: [], pageInfo: { hasNextPage: false } }] })), donnees: base, maintenant: () => lundi });
    assert.equal(base.appels, 0);
    assert.equal(r.ecrits, 0);
  });
});

describe('M5 appel à la main : mêmes contrôles d\'accès que la lecture', () => {
  const requete = (data, auth = { token: { email: COMPTE, email_verified: true } }) => ({ data, auth });
  const appelAvec = (relever = async () => ({ ok: true })) => ({ appel: creerAppelReleve({ relever }), relever });

  test('M5 non connecté -> unauthenticated ; compte inconnu ou adresse non vérifiée -> permission-denied ; rien n\'est lancé', async () => {
    let lances = 0;
    const appel = creerAppelReleve({ relever: async () => { lances += 1; return { ok: true }; } });
    await assert.rejects(appel({ data: { action: 'relever' } }), (e) => e.code === 'unauthenticated');
    await assert.rejects(appel(requete({ action: 'relever' }, { token: { email: 'alice@exemple.test', email_verified: true } })), (e) => e.code === 'permission-denied');
    await assert.rejects(appel(requete({ action: 'relever' }, { token: { email: COMPTE, email_verified: false } })), (e) => e.code === 'permission-denied');
    assert.equal(lances, 0);
  });
  test('M5 demande inconnue -> invalid-argument', async () => {
    const { appel, relever } = appelAvec();
    for (const d of [undefined, null, 'relever', [], {}, { action: 'lirePosts' }, { action: 'supprimer' }]) {
      await assert.rejects(appel(requete(d)), (e) => e.code === 'invalid-argument', JSON.stringify(d));
    }
    assert.ok(relever);
  });
  test('M5 compte autorisé : le compte rendu du relevé est rendu tel quel', async () => {
    const { appel } = appelAvec(async () => ({ ok: true, semaine: '2026-S46', ecrits: 2 }));
    assert.deepEqual(await appel(requete({ action: 'relever' })), { ok: true, semaine: '2026-S46', ecrits: 2 });
    const charles = await appel(requete({ action: 'relever' }, { token: { email: 'jeromebot.chevalierbot@gmail.com', email_verified: true } }));
    assert.equal(charles.ok, true);
  });
  test('M5 Buffer refuse -> failed-precondition avec le message lisible ; autre panne -> internal sans détail', async () => {
    const refus = creerAppelReleve({ relever: async () => { throw new ErreurBuffer('buffer_refuse', 'La clé Buffer est refusée.'); } });
    await assert.rejects(refus(requete({ action: 'relever' })), (e) => e.code === 'failed-precondition' && e.message === 'La clé Buffer est refusée.');
    const panne = creerAppelReleve({ relever: async () => { throw new Error('détail secret de la base'); } });
    await assert.rejects(panne(requete({ action: 'relever' })), (e) => e.code === 'internal' && !e.message.includes('secret'));
  });
});

describe('M6 branchement du serveur', () => {
  const index = lire('functions/src/index.js');
  test('M6 deux fonctions : planifiée le lundi 06:00 Europe/Paris et appelable, avec la clé Buffer déjà existante', () => {
    assert.match(index, /export const reseauxsociauxMesuresHebdo = onSchedule\(\s*\{[^}]*schedule: '0 6 \* \* 1', timeZone: 'Europe\/Paris', secrets: \[CLE_BUFFER\]/);
    assert.match(index, /export const reseauxsociauxMesuresHebdo = onSchedule\([^]*?retryCount: 3/);
    assert.match(index, /relever: \(\) => releverMaintenant\(\{ ecraser: false \}\)/, 'le relevé à la main ne remplace rien');
    assert.match(index, /releverMaintenant\(\{ ecraser: true \}\)/, 'le relevé planifié remplace la semaine');
    assert.match(index, /export const reseauxsociauxReleverMesures = onCall\(\s*\{[^}]*secrets: \[CLE_BUFFER\]/);
    assert.equal((index.match(/defineSecret\('BUFFER_API_KEY'\)/g) ?? []).length, 1, 'un seul secret, déjà créé');
  });
  test('M6 règles Firestore : reseauxsociaux_mesures lecture seule et sortie du joker', () => {
    const regles = lire('firestore.rules');
    assert.match(regles, /match \/reseauxsociaux_mesures\/\{id\} \{\s*allow read: if compteAutorise\(\);\s*allow write: if false;/);
    assert.match(regles, /collection in \[[^\]]*'reseauxsociaux_mesures'\]/);
  });
  test('M6 aucune mutation Buffer dans le relevé', () => {
    for (const f of ['functions/src/reseauxsociaux/mesures.js', 'functions/src/reseauxsociaux/service.js']) {
      const sansCommentaires = lire(f).split('\n').filter((l) => !l.trim().startsWith('//')).join('\n');
      assert.ok(!/mutation\s*[({]|createPost|editPost|deletePost/i.test(sansCommentaires), f);
    }
  });
});
