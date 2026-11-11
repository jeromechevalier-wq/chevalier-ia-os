// Fonction `reseauxsociauxBuffer` (lecture seule des posts LinkedIn dans Buffer), sans réseau : Buffer est simulé. Données fictives uniquement.
// Critères C1 à C6 du sujet C (cahier des charges du module Réseaux sociaux).
import assert from 'node:assert/strict';
import { test, describe, mock } from 'node:test';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { creerServiceBuffer, traduirePost, ADRESSE_BUFFER } from '../functions/src/reseauxsociaux/service.js';
import { creerAppelBuffer } from '../functions/src/reseauxsociaux/appel.js';

const CLE_FAUSSE = 'cle-fictive-pour-les-tests-0123456789';
const MAINTENANT = Date.UTC(2026, 10, 11, 22, 0, 0);
const COMPTE = 'jerome.chevalier@gmail.com';

const mesure = (type, value) => ({ type, name: type, value, unit: 'count' });
const POSTS_FICTIFS = [
  { id: 'post-brouillon', status: 'draft', dueAt: null, sentAt: null, text: 'Idée de post fictive', externalLink: null, assets: [], metricsUpdatedAt: null, metrics: [] },
  { id: 'post-programme', status: 'scheduled', dueAt: '2026-11-20T06:08:00.000Z', sentAt: null, text: 'Post programmé fictif', externalLink: null, assets: [{ __typename: 'VideoAsset' }], metricsUpdatedAt: null, metrics: [] },
  {
    id: 'post-publie', status: 'sent', dueAt: '2026-11-05T06:00:00.000Z', sentAt: '2026-11-05T06:00:09Z', text: 'Post publié fictif', externalLink: 'https://exemple.test/post-publie',
    assets: [{ __typename: 'ImageAsset' }], metricsUpdatedAt: '2026-11-10T08:00:00Z',
    metrics: [mesure('impressions', 120), mesure('reach', 80), mesure('reactions', 5), mesure('comments', 2), mesure('engagementRate', 3.45), mesure('views', 9)],
  },
];

/** Faux Buffer : répond selon la forme de la requête et garde un journal de tout ce qu'il reçoit. */
function fauxBuffer({ organisations = [{ id: 'org1' }], canaux = [{ id: 'canal-autre', name: 'Autre', service: 'instagram' }, { id: 'canal1', name: 'canal-fictif', service: 'linkedin' }], posts = POSTS_FICTIFS, statut = 200, corps, delai = false } = {}) {
  const recus = [];
  const fetchImpl = async (url, options) => {
    recus.push({ url: String(url), options, requete: JSON.parse(options.body).query });
    if (delai) return new Promise((_, rejeter) => options.signal.addEventListener('abort', () => rejeter(new Error('délai'))));
    if (statut !== 200) return { ok: false, status: statut, text: async () => 'corps secret de Buffer' };
    const q = JSON.parse(options.body).query;
    let data;
    if (corps !== undefined) return { ok: true, status: 200, text: async () => corps };
    if (q.includes('account')) data = { account: { organizations: organisations } };
    else if (q.includes('channels')) data = { channels: canaux };
    else if (q.includes('posts')) data = { posts: { edges: posts.map((node) => ({ node })) } };
    return { ok: true, status: 200, text: async () => JSON.stringify({ data }) };
  };
  return { recus, fetchImpl };
}
const serviceAvec = (faux, cle = CLE_FAUSSE) => creerServiceBuffer({ fetchImpl: faux.fetchImpl, lireCle: async () => cle, maintenant: () => MAINTENANT });
const appelAvec = (faux, journal = () => {}) => creerAppelBuffer({ service: serviceAvec(faux), journal });
const requete = (data, auth = { token: { email: COMPTE, email_verified: true } }) => ({ data, auth });

describe('C1 accès et validation de la demande', () => {
  test('C1 compte non connecté -> unauthenticated', async () => {
    await assert.rejects(appelAvec(fauxBuffer())({ data: { action: 'lirePosts' } }), (e) => e.code === 'unauthenticated');
  });
  test('C1 compte non autorisé, ou adresse non vérifiée -> permission-denied', async () => {
    const appel = appelAvec(fauxBuffer());
    await assert.rejects(appel(requete({ action: 'lirePosts' }, { token: { email: 'alice@exemple.test', email_verified: true } })), (e) => e.code === 'permission-denied');
    await assert.rejects(appel(requete({ action: 'lirePosts' }, { token: { email: COMPTE, email_verified: false } })), (e) => e.code === 'permission-denied');
  });
  test('C1 le compte de Charles (l\'assistant) est accepté', async () => {
    const r = await appelAvec(fauxBuffer())(requete({ action: 'lirePosts' }, { token: { email: 'jeromebot.chevalierbot@gmail.com', email_verified: true } }));
    assert.equal(r.ok, true);
  });
  test('C1 action inconnue ou absente, demande qui n\'est pas un objet -> invalid-argument', async () => {
    const appel = appelAvec(fauxBuffer());
    for (const d of [{ action: 'creerPost' }, { action: 'mutation' }, {}, null, 'lirePosts', ['lirePosts']]) {
      await assert.rejects(appel(requete(d)), (e) => e.code === 'invalid-argument', JSON.stringify(d));
    }
  });
  test('C1 limite hors 1..100 ou pas entière -> invalid-argument ; 1 et 100 passent', async () => {
    const appel = appelAvec(fauxBuffer());
    for (const limite of [0, 101, -3, 2.5, '10', null, NaN]) {
      await assert.rejects(appel(requete({ action: 'lirePosts', limite })), (e) => e.code === 'invalid-argument', String(limite));
    }
    for (const limite of [1, 100]) assert.equal((await appel(requete({ action: 'lirePosts', limite }))).ok, true);
  });
  test('C1 la limite demandée est celle envoyée à Buffer (60 par défaut)', async () => {
    const faux = fauxBuffer();
    await appelAvec(faux)(requete({ action: 'lirePosts' }));
    assert.match(faux.recus.at(-1).requete, /posts\(first:60,/);
    const faux2 = fauxBuffer();
    await appelAvec(faux2)(requete({ action: 'lirePosts', limite: 7 }));
    assert.match(faux2.recus.at(-1).requete, /posts\(first:7,/);
  });
});

describe('C2 réponse conforme au contrat', () => {
  test('C2 trois posts : statuts traduits, dates ISO, image/vidéo déduits, stats nulles sans métrique, tri décroissant', async () => {
    const r = await appelAvec(fauxBuffer())(requete({ action: 'lirePosts' }));
    assert.deepEqual(Object.keys(r).sort(), ['canal', 'lueLe', 'ok', 'posts']);
    assert.equal(r.ok, true);
    assert.equal(r.lueLe, '2026-11-11T22:00:00.000Z');
    assert.deepEqual(r.canal, { id: 'canal1', nom: 'canal-fictif', service: 'linkedin' });
    assert.deepEqual(r.posts.map((p) => p.id), ['post-programme', 'post-publie', 'post-brouillon']);
    const [programme, publie, brouillon] = r.posts;
    assert.equal(brouillon.statut, 'brouillon');
    assert.equal(brouillon.statutBuffer, 'draft');
    assert.equal(brouillon.prevuLe, null);
    assert.equal(brouillon.publieLe, null);
    assert.equal(brouillon.stats, null);
    assert.equal(brouillon.statsLuesLe, null);
    assert.equal(programme.statut, 'programme');
    assert.equal(programme.prevuLe, '2026-11-20T06:08:00.000Z');
    assert.equal(programme.video, true);
    assert.equal(programme.image, false);
    assert.equal(programme.stats, null);
    assert.equal(publie.statut, 'publie');
    assert.equal(publie.statutBuffer, 'sent');
    assert.equal(publie.publieLe, '2026-11-05T06:00:09.000Z');
    assert.equal(publie.image, true);
    assert.equal(publie.video, false);
    assert.equal(publie.lien, 'https://exemple.test/post-publie');
    assert.deepEqual(publie.stats, { impressions: 120, portee: 80, reactions: 5, commentaires: 2, tauxEngagement: 3.45 });
    assert.equal(publie.statsLuesLe, '2026-11-10T08:00:00.000Z');
    for (const p of r.posts) assert.deepEqual(Object.keys(p).sort(), ['id', 'image', 'lien', 'prevuLe', 'publieLe', 'stats', 'statsLuesLe', 'statut', 'statutBuffer', 'texte', 'video']);
  });
  test('C2 le filtre de canal et l\'organisation sont ceux lus chez Buffer (rien en dur)', async () => {
    const faux = fauxBuffer();
    await serviceAvec(faux).lirePosts({ limite: 10 });
    const requetePosts = faux.recus.at(-1).requete;
    assert.match(requetePosts, /organizationId:"org1"/);
    assert.match(requetePosts, /channelIds:\["canal1"\]/);
  });
  test('C2 un statut inconnu (erreur, validation...) tombe dans « autre » et garde sa valeur brute', () => {
    const p = traduirePost({ id: 'x', status: 'needs_approval' });
    assert.equal(p.statut, 'autre');
    assert.equal(p.statutBuffer, 'needs_approval');
  });
  test('C2 texte coupé à 5000 caractères ; lien non https ignoré ; métrique non numérique = null', () => {
    const p = traduirePost({ id: 'x', status: 'sent', text: 'a'.repeat(6000), externalLink: 'http://exemple.test/x', metrics: [mesure('impressions', 'beaucoup'), mesure('reach', 4)] });
    assert.equal(p.texte.length, 5000);
    assert.equal(p.lien, null);
    assert.deepEqual(p.stats, { impressions: null, portee: 4, reactions: null, commentaires: null, tauxEngagement: null });
  });
  test('C2 cas vide : zéro post -> { ok: true, posts: [] }', async () => {
    const r = await appelAvec(fauxBuffer({ posts: [] }))(requete({ action: 'lirePosts' }));
    assert.equal(r.ok, true);
    assert.deepEqual(r.posts, []);
  });
  test('C2 un post sans identifiant est écarté', async () => {
    const r = await appelAvec(fauxBuffer({ posts: [{ status: 'draft' }, POSTS_FICTIFS[0]] }))(requete({ action: 'lirePosts' }));
    assert.deepEqual(r.posts.map((p) => p.id), ['post-brouillon']);
  });
});

describe('C3 erreurs de Buffer traduites sans rien divulguer', () => {
  const code = (e) => e.code === 'failed-precondition' && e.details?.code;
  const attrape = async (faux) => { try { await appelAvec(faux)(requete({ action: 'lirePosts' })); } catch (e) { return e; } assert.fail('aucune erreur'); };

  test('C3 clé refusée (401 puis 403) -> buffer_refuse', async () => {
    for (const statut of [401, 403]) {
      const e = await attrape(fauxBuffer({ statut }));
      assert.equal(code(e), 'buffer_refuse');
      assert.equal(e.message, 'La clé Buffer est refusée.');
    }
  });
  test('C3 clé absente du coffre -> buffer_refuse (rien n\'est envoyé)', async () => {
    const faux = fauxBuffer();
    const appel = creerAppelBuffer({ service: creerServiceBuffer({ fetchImpl: faux.fetchImpl, lireCle: async () => '' }) });
    await assert.rejects(appel(requete({ action: 'lirePosts' })), (e) => code(e) === 'buffer_refuse');
    assert.equal(faux.recus.length, 0);
  });
  test('C3 réseau coupé, erreur 500 ou délai de 15 s -> buffer_indisponible', async () => {
    const reseau = { recus: [], fetchImpl: async () => { throw new TypeError('fetch failed : cle-fictive-pour-les-tests-0123456789'); } };
    assert.equal(code(await attrape(reseau)), 'buffer_indisponible');
    assert.equal(code(await attrape(fauxBuffer({ statut: 500 }))), 'buffer_indisponible');
    // Délai de 15 s : horloge simulée (setTimeout seulement), le faux Buffer ne répond jamais et se laisse annuler.
    mock.timers.enable({ apis: ['setTimeout'] });
    try {
      const attente = attrape(fauxBuffer({ delai: true }));
      for (let i = 0; i < 5; i += 1) await new Promise((r) => setImmediate(r));
      mock.timers.tick(15_000);
      assert.equal(code(await attente), 'buffer_indisponible');
    } finally { mock.timers.reset(); }
  });
  test('C3 aucun canal LinkedIn -> aucun_canal_linkedin ; aucune organisation ou réponse bancale -> reponse_inattendue', async () => {
    assert.equal(code(await attrape(fauxBuffer({ canaux: [{ id: 'c', name: 'x', service: 'instagram' }] }))), 'aucun_canal_linkedin');
    assert.equal(code(await attrape(fauxBuffer({ canaux: [] }))), 'aucun_canal_linkedin');
    assert.equal(code(await attrape(fauxBuffer({ organisations: [] }))), 'reponse_inattendue');
  });
  test('C3 corps GraphQL avec « errors », corps vide ou pas du JSON -> reponse_inattendue', async () => {
    for (const corps of [JSON.stringify({ errors: [{ message: 'secret interne de Buffer' }] }), JSON.stringify({ data: null }), '<html>502</html>', '']) {
      assert.equal(code(await attrape(fauxBuffer({ corps }))), 'reponse_inattendue', corps);
    }
  });
  test('C3 aucun message d\'erreur ne contient la clé ni un morceau de réponse Buffer ; une erreur inattendue devient « internal »', async () => {
    const cas = [fauxBuffer({ statut: 401 }), fauxBuffer({ statut: 500 }), fauxBuffer({ corps: JSON.stringify({ errors: [{ message: 'secret interne de Buffer' }] }) }), fauxBuffer({ corps: 'corps secret de Buffer' })];
    for (const faux of cas) {
      const e = await attrape(faux);
      const tout = JSON.stringify([e.message, e.details, e.code]);
      assert.doesNotMatch(tout, /secret|cle-fictive|Bearer/i);
    }
    const casse = creerAppelBuffer({ service: { lirePosts: async () => { throw new RangeError(`oups ${CLE_FAUSSE}`); } } });
    await assert.rejects(casse(requete({ action: 'lirePosts' })), (e) => e.code === 'internal' && e.message === 'Une erreur est survenue.' && !JSON.stringify(e.details ?? '').includes(CLE_FAUSSE));
  });
});

describe('C4 aucune écriture dans Buffer', () => {
  test('C4 toutes les requêtes commencent par « { », en POST vers api.buffer.com seulement, sans « mutation »', async () => {
    const faux = fauxBuffer();
    await appelAvec(faux)(requete({ action: 'lirePosts' }));
    assert.equal(faux.recus.length, 3);
    for (const r of faux.recus) {
      assert.ok(r.requete.startsWith('{'), r.requete);
      assert.doesNotMatch(r.requete, /mutation/i);
      assert.equal(r.options.method, 'POST');
      assert.equal(r.url, 'https://api.buffer.com');
    }
    assert.equal(ADRESSE_BUFFER, 'https://api.buffer.com');
  });
  test('C4 la clé part dans l\'en-tête Authorization, jamais dans l\'adresse ni dans le corps', async () => {
    const faux = fauxBuffer();
    await serviceAvec(faux).lirePosts({ limite: 5 });
    for (const r of faux.recus) {
      assert.equal(r.options.headers.Authorization, `Bearer ${CLE_FAUSSE}`);
      assert.ok(!r.url.includes(CLE_FAUSSE));
      assert.ok(!r.options.body.includes(CLE_FAUSSE));
    }
  });
  test('C4 le service n\'expose que la lecture, et le texte du code n\'écrit jamais « mutation » dans une requête', () => {
    assert.deepEqual(Object.keys(serviceAvec(fauxBuffer())), ['lirePosts']);
    const code = readFileSync(new URL('../functions/src/reseauxsociaux/service.js', import.meta.url), 'utf8');
    const requetes = code.split('\n').filter((l) => /^const (REQUETE_|requete)/.test(l));
    assert.ok(requetes.length >= 3);
    for (const l of requetes) assert.doesNotMatch(l, /mutation/i);
  });
});

describe('C5 aucun secret ni contenu dans le code ou le journal', () => {
  const racine = new URL('..', import.meta.url).pathname;
  const fichiers = (dossier, liste = []) => {
    for (const nom of readdirSync(join(racine, dossier))) {
      const rel = join(dossier, nom);
      if (statSync(join(racine, rel)).isDirectory()) fichiers(rel, liste); else if (nom.endsWith('.js')) liste.push(rel);
    }
    return liste;
  };
  test('C5 BUFFER_API_KEY n\'apparaît que comme nom de secret (defineSecret) et aucune clé en dur', () => {
    const index = readFileSync(join(racine, 'functions/src/index.js'), 'utf8');
    assert.match(index, /defineSecret\('BUFFER_API_KEY'\)/);
    assert.equal(index.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n').match(/BUFFER_API_KEY/g).length, 1, 'une seule déclaration du secret hors commentaires');
    assert.doesNotMatch(index, /BUFFER_CLE/);
    for (const f of fichiers('functions/src/reseauxsociaux')) {
      const t = readFileSync(join(racine, f), 'utf8');
      assert.doesNotMatch(t, /BUFFER_API_KEY/, f);
      assert.doesNotMatch(t, /Bearer [A-Za-z0-9_-]{20,}/, f);
      assert.doesNotMatch(t, /['"`][A-Za-z0-9_-]{40,}['"`]/, `${f} : longue chaîne qui ressemble à une clé`);
    }
  });
  test('C5 la fonction est branchée avec le secret, en lecture seule, dans la région des autres fonctions appelables', () => {
    const index = readFileSync(join(racine, 'functions/src/index.js'), 'utf8');
    const bloc = index.slice(index.indexOf('export const reseauxsociauxBuffer'), index.indexOf('// Automatisations (workflows n8n)'));
    assert.match(bloc, /region: 'europe-west9'/);
    assert.match(bloc, /secrets: \[CLE_BUFFER\]/);
    assert.match(bloc, /creerAppelBuffer/);
    assert.ok(index.indexOf('export const reseauxsociauxBuffer') > index.indexOf('export const veille'), 'après le bloc veille');
  });
  test('C5 le journal ne contient ni texte de post, ni identifiant d\'organisation, ni clé', async () => {
    const lignes = [];
    const faux = fauxBuffer();
    await appelAvec(faux, (e) => lignes.push(e))(requete({ action: 'lirePosts' }));
    await assert.rejects(appelAvec(fauxBuffer({ statut: 401 }), (e) => lignes.push(e))(requete({ action: 'lirePosts' })));
    assert.deepEqual(lignes, [{ action: 'lirePosts', statut: 'ok' }, { action: 'lirePosts', statut: 'refus', code: 'buffer_refuse' }]);
    const tout = JSON.stringify(lignes);
    assert.doesNotMatch(tout, /Post publié fictif|org1|canal1|cle-fictive/);
  });
});

describe('C6 déclarée dans le contrôle des écarts', () => {
  test('C6 reseauxsociauxBuffer est déclarée « seulement chez Jérôme » avec sa raison, et absente de functions-plateforme', () => {
    const ecarts = readFileSync(new URL('./ecarts-fonctions.test.js', import.meta.url), 'utf8');
    assert.match(ecarts, /reseauxsociauxBuffer: 'ÉCART connu : lecture Buffer/);
    const clients = readFileSync(new URL('../functions-plateforme/src/index.js', import.meta.url), 'utf8');
    assert.doesNotMatch(clients, /reseauxsociauxBuffer|BUFFER_API_KEY/);
  });
  test('C6 le fichier index.js de functions/ se charge sans erreur de syntaxe', async () => {
    const { spawnSync } = await import('node:child_process');
    const r = spawnSync(process.execPath, ['--check', new URL('../functions/src/index.js', import.meta.url).pathname]);
    assert.equal(r.status, 0, String(r.stderr));
  });
});
