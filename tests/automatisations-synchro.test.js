// Copie de l'historique n8n vers Firestore (chantier 14), contre un FAUX n8n et l'ÉMULATEUR Firestore (projet demo-…). Aucun appel réel.
// Lancé par « npm run test:automatisations ». Les fonctions sont essayées directement (functions-plateforme/src), sans Cloud Functions.
import assert from 'node:assert/strict';
import { test, describe, before, after, beforeEach } from 'node:test';
import { createRequire } from 'node:module';
import { creerFauxN8n, CLE_ESSAI, CONTENU_SECRET, SECRET_DANS_WORKFLOW } from './_faux-n8n.js';

process.env.GCLOUD_PROJECT = 'demo-chevalier-ia-os';
const requireFn = createRequire(new URL('../functions-plateforme/package.json', import.meta.url));
const { initializeApp, getApps } = requireFn('firebase-admin/app');
const { getFirestore } = requireFn('firebase-admin/firestore');
const { creerLecteurN8n } = await import('../functions-plateforme/src/n8n.js');
const { copieHoraire, rafraichir } = await import('../functions-plateforme/src/appels.js');
const { synchroniserClient, estStale, DELAI_STALE_MS } = await import('../functions-plateforme/src/synchro.js');
const { classer } = await import('../functions-plateforme/src/etiquettes.js');

if (!getApps().length) initializeApp({ projectId: 'demo-chevalier-ia-os' });
const db = getFirestore();

const faux = creerFauxN8n();
let url;
const n8n = (extra = {}) => creerLecteurN8n({ cle: CLE_ESSAI, url, delaiMs: 3000, ...extra });
const T0 = Date.parse('2026-10-11T10:00:00Z');
const il_y_a = (ms) => new Date(T0 - ms).toISOString();
const MIN = 60000;

before(async () => { url = await faux.demarrer(); });
after(async () => { await faux.arreter(); });

async function viderFirestore() {
  const r = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-chevalier-ia-os/databases/(default)/documents`, { method: 'DELETE' });
  assert.ok(r.ok);
}
const lire = async (chemin) => { const s = await db.doc(chemin).get(); return s.exists ? s.data() : null; };
const liste = async (chemin) => (await db.collection(chemin).get()).docs.map((d) => ({ id: d.id, ...d.data() }));

async function installer() {
  await viderFirestore();
  faux.vider();
  Object.assign(faux.etat, { panne: false, coupe: false, latenceMs: 0, taillePage: 100 });
  // Deux clients avec le module, un client sans, un membre de chaque.
  await db.doc('clients/audrey').set({ modules: { automatisations: true } });
  await db.doc('clients/boris').set({ modules: { automatisations: true } });
  await db.doc('clients/carla').set({ modules: { affaires: true } }); // sans le module
  faux.etat.workflows = [
    { id: 'wfA1', name: 'client-audrey-lire-une-fiche', active: true, tags: ['client-audrey', 'prod'] },
    { id: 'wfA2', name: 'client-audrey-mon-mois', active: true, tags: ['client-audrey'] },
    { id: 'wfB1', name: 'client-boris-rapport', active: true, tags: ['client-boris'] },
    { id: 'wfJ', name: 'Workflow interne de Jérôme', active: true, tags: ['perso'] },
    { id: 'wfSans', name: 'Sans étiquette', active: true, tags: [] },
    { id: 'wfX', name: 'Client inconnu', active: true, tags: ['client-fantome'] },
    { id: 'wfC', name: 'client-carla-sans-module', active: true, tags: ['client-carla'] },
    { id: 'wfDouble', name: 'Deux clients', active: true, tags: ['client-audrey', 'client-boris'] },
  ];
  faux.etat.executions = [
    { id: '101', workflowId: 'wfA1', status: 'success', startedAt: il_y_a(50 * MIN), stoppedAt: il_y_a(50 * MIN - 2000) },
    { id: '102', workflowId: 'wfA1', status: 'error', startedAt: il_y_a(40 * MIN), stoppedAt: il_y_a(40 * MIN - 800), erreur: { message: 'The service is receiving too many requests from you', etape: 'Lire Presences' } },
    { id: '103', workflowId: 'wfA2', status: 'running', startedAt: il_y_a(20 * MIN) }, // bloquée : à vérifier
    { id: '104', workflowId: 'wfA2', status: 'running', startedAt: il_y_a(5 * MIN) }, // en cours normalement
    { id: '201', workflowId: 'wfB1', status: 'success', startedAt: il_y_a(30 * MIN), stoppedAt: il_y_a(30 * MIN - 1000) },
    { id: '301', workflowId: 'wfJ', status: 'success', startedAt: il_y_a(30 * MIN), stoppedAt: il_y_a(30 * MIN - 1000) },
    { id: '302', workflowId: 'wfX', status: 'success', startedAt: il_y_a(30 * MIN), stoppedAt: il_y_a(30 * MIN - 1000) },
    { id: '303', workflowId: 'wfC', status: 'success', startedAt: il_y_a(30 * MIN), stoppedAt: il_y_a(30 * MIN - 1000) },
    { id: '304', workflowId: 'wfDouble', status: 'success', startedAt: il_y_a(30 * MIN), stoppedAt: il_y_a(30 * MIN - 1000) },
    { id: '305', workflowId: 'wfSans', status: 'success', startedAt: il_y_a(30 * MIN), stoppedAt: il_y_a(30 * MIN - 1000) },
  ];
}
beforeEach(installer);

describe('A. Isolation entre clients et étiquettes', () => {
  test('A1 chaque client ne reçoit que SES workflows et SES exécutions', async () => {
    await copieHoraire({ db, n8n: n8n(), maintenant: T0 });
    assert.deepEqual((await liste('clients/audrey/executions')).map((e) => e.id).sort(), ['101', '102', '103', '104']);
    assert.deepEqual((await liste('clients/boris/executions')).map((e) => e.id), ['201']);
    assert.deepEqual((await liste('clients/audrey/workflows')).map((w) => w.id).sort(), ['wfA1', 'wfA2']);
    assert.deepEqual((await liste('clients/boris/workflows')).map((w) => w.id), ['wfB1']);
    for (const e of await liste('clients/audrey/executions')) assert.ok(['wfA1', 'wfA2'].includes(e.workflowId));
  });
  test('A2 jamais copiés : sans étiquette de client, client inconnu, client sans module, deux étiquettes de client', async () => {
    await copieHoraire({ db, n8n: n8n(), maintenant: T0 });
    for (const c of ['audrey', 'boris', 'carla']) {
      const ids = (await liste(`clients/${c}/executions`)).map((e) => e.id);
      for (const interdit of ['301', '302', '303', '304', '305']) assert.ok(!ids.includes(interdit), `${c} ne doit pas avoir ${interdit}`);
    }
    assert.deepEqual(await liste('clients/carla/executions'), []);
    assert.equal(await lire('clients/fantome/sync/state'), null);
  });
  test('A3 les workflows écartés sont SIGNALÉS (fiche du serveur, hors des clients) avec la raison', async () => {
    await copieHoraire({ db, n8n: n8n(), maintenant: T0 });
    const items = (await lire('plateforme_journal/signalements')).items;
    const raison = (id) => items.find((s) => s.workflowId === id)?.raison;
    assert.equal(raison('wfX'), 'client-inconnu');
    assert.equal(raison('wfC'), 'sans-module');
    assert.equal(raison('wfDouble'), 'deux-clients');
    assert.equal(raison('wfJ'), undefined, 'un workflow sans étiquette de client n\'est pas une anomalie');
    assert.equal(raison('wfSans'), undefined);
    // Rien de ce signalement n'est lisible par un client : il n'est pas sous clients/<client>/.
    for (const c of ['audrey', 'boris']) assert.ok(!JSON.stringify(await liste(`clients/${c}/sync`)).includes('fantome'));
  });
  test('A4 étiquette mal formée ou en majuscules', () => {
    const wf = (tags) => ({ id: 'w1', name: 'client-audrey-x', active: true, tags });
    const ctx = { connus: new Set(['audrey']), actifs: new Set(['audrey']) };
    assert.equal(classer([wf(['Client-Audrey'])], ctx).parClient.get('audrey').length, 1);
    assert.equal(classer([wf(['client-'])], ctx).signalements[0].raison, 'etiquette-invalide');
    assert.equal(classer([wf(['client-a b'])], ctx).signalements[0].raison, 'etiquette-invalide');
    assert.equal(classer([wf(['client-audrey', 'client-oups'])], ctx).signalements[0].raison, 'deux-clients');
    assert.equal(classer([{ id: '../x', name: 'client-audrey-x', active: true, tags: ['client-audrey'] }], ctx).signalements[0].raison, 'identifiant-invalide');
  });
  test('A5 changement d\'étiquette : l\'historique déjà copié reste chez l\'ancien client', async () => {
    await copieHoraire({ db, n8n: n8n(), maintenant: T0 });
    faux.etat.workflows.find((w) => w.id === 'wfA1').tags = ['client-boris']; // le workflow change de client
    faux.etat.executions.push({ id: '105', workflowId: 'wfA1', status: 'success', startedAt: il_y_a(MIN), stoppedAt: il_y_a(MIN - 1000) });
    await copieHoraire({ db, n8n: n8n(), maintenant: T0 + 5 * MIN });
    assert.ok((await lire('clients/audrey/executions/101')), 'l\'ancienne exécution reste chez Audrey');
    assert.equal(await lire('clients/audrey/executions/105'), null, 'la nouvelle ne va pas chez Audrey');
    assert.ok(await lire('clients/boris/executions/105'), 'la nouvelle va chez Boris');
  });
});

describe('B. Pas de doublon, idempotence, verrou', () => {
  test('B1 deux copies de suite : mêmes documents, aucun doublon, mêmes valeurs', async () => {
    await copieHoraire({ db, n8n: n8n(), maintenant: T0 });
    const avant = JSON.stringify((await liste('clients/audrey/executions')).map(({ lastSyncedAt, ...r }) => r));
    await copieHoraire({ db, n8n: n8n(), maintenant: T0 + 20 * MIN });
    const apres = JSON.stringify((await liste('clients/audrey/executions')).map(({ lastSyncedAt, ...r }) => r));
    assert.equal((await liste('clients/audrey/executions')).length, 4);
    assert.equal(apres.length > 0 && (await liste('clients/audrey/executions')).length, 4);
    // 103 et 104 « en cours » ont été relues et recalculées ; les autres sont identiques.
    const garde = (s) => JSON.parse(s).filter((e) => !['103', '104'].includes(e.id));
    assert.deepEqual(garde(apres), garde(avant));
  });
  test('B2 une copie en cours : une 2e demande est refusée (verrou) ; et deux copies lancées ensemble ne créent aucun doublon', async () => {
    faux.etat.latenceMs = 150;
    const ctx = { connus: new Set(['audrey']), actifs: new Set(['audrey']) };
    const mesWorkflows = async () => classer(await n8n().workflows({ etiquette: 'client-audrey' }), ctx).parClient.get('audrey') ?? [];
    const travail = (raison = 'horaire') => synchroniserClient({ db, n8n: n8n(), client: 'audrey', maintenant: T0, raison, obtenirWorkflows: mesWorkflows });
    // 1) la 1re copie tient le verrou (on attend de le voir dans la base) ; la 2e est refusée sans lancer de copie.
    const premiere = travail();
    for (let i = 0; i < 100 && !(await lire('clients/audrey/sync/state'))?.lockId; i++) await new Promise((r) => setTimeout(r, 20));
    const refusee = await travail();
    assert.equal(refusee.resultat, 'deja-en-cours');
    assert.equal((await premiere).resultat, 'mis-a-jour');
    assert.equal((await lire('clients/audrey/sync/state')).lockUntil, null, 'le verrou est libéré');
    // 2) deux copies vraiment simultanées : quoi qu'il arrive, un seul document par exécution.
    await installer();
    faux.etat.latenceMs = 20;
    const [r1, r2] = await Promise.all([travail(), travail()]);
    assert.ok([r1.resultat, r2.resultat].includes('mis-a-jour'));
    assert.equal((await liste('clients/audrey/executions')).length, 4);
  });
  test('B3 un verrou oublié (copie plantée) expire tout seul', async () => {
    await db.doc('clients/audrey/sync/state').set({ lockUntil: new Date(T0 - 1000), lockId: 'vieux' });
    const r = await synchroniserClient({ db, n8n: n8n(), client: 'audrey', maintenant: T0, raison: 'horaire', obtenirWorkflows: async () => (await n8n().workflows({ etiquette: 'client-audrey' })).filter((w) => w.id !== 'wfDouble') });
    assert.equal(r.resultat, 'mis-a-jour');
  });
  test('B4 un verrou encore valide refuse la copie SANS appeler n8n', async () => {
    await db.doc('clients/audrey/sync/state').set({ lockUntil: new Date(T0 + MIN), lockId: 'autre' });
    faux.vider();
    const r = await synchroniserClient({ db, n8n: n8n(), client: 'audrey', maintenant: T0, raison: 'manuel', obtenirWorkflows: async () => n8n().workflows() });
    assert.equal(r.resultat, 'deja-en-cours');
    assert.equal(faux.etat.requetes.length, 0);
  });
  test('B5 copie incrémentale : la 2e fois, seules les nouvelles exécutions sont demandées', async () => {
    await copieHoraire({ db, n8n: n8n(), maintenant: T0 });
    faux.etat.executions.push({ id: '105', workflowId: 'wfA1', status: 'success', startedAt: il_y_a(MIN), stoppedAt: il_y_a(MIN - 500) });
    faux.etat.taillePage = 2;
    faux.vider();
    await copieHoraire({ db, n8n: n8n(), maintenant: T0 + 10 * MIN });
    const listes = faux.etat.requetes.filter((r) => r.chemin === '/api/v1/executions' && r.params.workflowId === 'wfA1');
    assert.equal(listes.length, 1, 'une seule page suffit : on s\'arrête à la première exécution déjà copiée');
    assert.ok(await lire('clients/audrey/executions/105'));
  });
});

describe('C. États, « à vérifier », erreurs', () => {
  test('C1 états de n8n repris tels quels ; « en cours » depuis plus de 10 min = stale (à vérifier), pas avant', async () => {
    await copieHoraire({ db, n8n: n8n(), maintenant: T0 });
    const e = Object.fromEntries((await liste('clients/audrey/executions')).map((x) => [x.id, x]));
    assert.equal(e['101'].status, 'success');
    assert.equal(e['103'].status, 'running');
    assert.equal(e['103'].stale, true);
    assert.equal(e['104'].status, 'running');
    assert.equal(e['104'].stale, false);
    assert.equal(e['101'].stale, false);
    assert.ok(estStale('running', new Date(T0 - DELAI_STALE_MS - 1), T0) && !estStale('running', new Date(T0 - DELAI_STALE_MS + 1), T0));
    assert.ok(!estStale('waiting', new Date(T0 - 99 * MIN), T0), 'une exécution en attente (Wait) n\'est pas « bloquée »');
    assert.ok(!estStale('success', new Date(T0 - 99 * MIN), T0));
  });
  test('C2 une exécution « en cours » qui se termine est mise à jour à la copie suivante (et n\'est plus stale)', async () => {
    await copieHoraire({ db, n8n: n8n(), maintenant: T0 });
    const x = faux.etat.executions.find((e) => e.id === '103');
    Object.assign(x, { status: 'success', stoppedAt: il_y_a(2 * MIN) });
    await copieHoraire({ db, n8n: n8n(), maintenant: T0 + 6 * MIN });
    const apres = await lire('clients/audrey/executions/103');
    assert.equal(apres.status, 'success');
    assert.equal(apres.stale, false);
    assert.ok(apres.durationMs > 0);
    assert.equal((await liste('clients/audrey/executions')).length, 4);
  });
  test('C3 une exécution qui devient bloquée entre deux copies passe en stale', async () => {
    await copieHoraire({ db, n8n: n8n(), maintenant: T0 });
    assert.equal((await lire('clients/audrey/executions/104')).stale, false);
    await copieHoraire({ db, n8n: n8n(), maintenant: T0 + 8 * MIN }); // 13 minutes après son début
    assert.equal((await lire('clients/audrey/executions/104')).stale, true);
  });
  test('C4 erreur : message et étape en échec copiés (courts), lus une seule fois', async () => {
    await copieHoraire({ db, n8n: n8n(), maintenant: T0 });
    const e = await lire('clients/audrey/executions/102');
    assert.equal(e.status, 'error');
    assert.equal(e.errorMessage, 'The service is receiving too many requests from you');
    assert.equal(e.failedStep, 'Lire Presences');
    assert.equal((await lire('clients/audrey/executions/101')).errorMessage, null);
    faux.vider();
    await copieHoraire({ db, n8n: n8n(), maintenant: T0 + MIN });
    assert.equal(faux.etat.requetes.filter((r) => r.params.includeData === 'true').length, 0, 'le détail n\'est pas relu : la cause est déjà copiée');
  });
  test('C5 messages d\'erreur raccourcis ; « crashed » devient « error » ; état inconnu = unknown', async () => {
    faux.etat.executions.push(
      { id: '106', workflowId: 'wfA1', status: 'error', startedAt: il_y_a(MIN), stoppedAt: il_y_a(MIN), erreur: { message: 'x'.repeat(2000), etape: 'y'.repeat(500) } },
      { id: '107', workflowId: 'wfA1', status: 'crashed', startedAt: il_y_a(MIN), stoppedAt: il_y_a(MIN) },
      { id: '108', workflowId: 'wfA1', status: 'bizarre', startedAt: il_y_a(MIN), stoppedAt: il_y_a(MIN) },
      { id: '109', workflowId: 'wfA1', status: 'canceled', startedAt: il_y_a(MIN), stoppedAt: il_y_a(MIN) },
      { id: '110', workflowId: 'wfA1', status: 'waiting', startedAt: il_y_a(MIN) },
    );
    await copieHoraire({ db, n8n: n8n(), maintenant: T0 });
    const e = Object.fromEntries((await liste('clients/audrey/executions')).map((x) => [x.id, x]));
    assert.ok(e['106'].errorMessage.length <= 300 && e['106'].failedStep.length <= 120);
    assert.equal(e['107'].status, 'error');
    assert.equal(e['108'].status, 'unknown');
    assert.equal(e['109'].status, 'canceled');
    assert.equal(e['110'].status, 'waiting');
  });
  test('C6 champs copiés : exactement la liste du cahier des charges, runGroupId et expireAt vides', async () => {
    await copieHoraire({ db, n8n: n8n(), maintenant: T0 });
    const champs = Object.keys(await lire('clients/audrey/executions/102')).sort();
    assert.deepEqual(champs, ['durationMs', 'errorMessage', 'executionId', 'expireAt', 'failedStep', 'lastSyncedAt', 'mode', 'retryOf', 'runGroupId', 'source', 'startedAt', 'stale', 'status', 'stoppedAt', 'workflowId', 'workflowLabel'].sort());
    const e = await lire('clients/audrey/executions/102');
    assert.equal(e.runGroupId, null);
    assert.equal(e.expireAt, null);
    assert.equal(e.source, 'sync');
    assert.equal(e.workflowLabel, 'client-audrey-lire-une-fiche');
    assert.equal(e.durationMs, 800);
    assert.equal(e.mode, 'webhook');
  });
  test('C7 un champ réservé à la suite (runGroupId, steps) n\'est pas écrasé par la copie', async () => {
    await copieHoraire({ db, n8n: n8n(), maintenant: T0 });
    await db.doc('clients/audrey/executions/101').set({ runGroupId: 'groupe-7' }, { merge: true });
    await db.doc('clients/audrey/executions/101/steps/etape1').set({ stepKey: 'etape1', status: 'success' });
    await copieHoraire({ db, n8n: n8n(), maintenant: T0 + MIN });
    assert.equal((await lire('clients/audrey/executions/101')).runGroupId, 'groupe-7');
    assert.ok(await lire('clients/audrey/executions/101/steps/etape1'));
  });
});

describe('D. Aucun contenu, aucune définition, aucun secret dans Firebase', () => {
  test('D1 tout ce que la copie a écrit (tous les documents) est exempt de contenu, de définition de workflow et de clé', async () => {
    await copieHoraire({ db, n8n: n8n(), maintenant: T0 });
    await rafraichirUnClient();
    let texte = '';
    const parcourir = async (collections) => {
      for (const col of collections) for (const d of await col.listDocuments()) {
        const s = await d.get();
        if (s.exists) texte += `${d.path} ${JSON.stringify(s.data())}\n`;
        await parcourir(await d.listCollections());
      }
    };
    await parcourir(await db.listCollections()); // TOUTE la base de l'émulateur
    assert.ok(texte.length > 500, 'la copie a bien écrit quelque chose');
    for (const interdit of [CONTENU_SECRET, 'camille.dubois', SECRET_DANS_WORKFLOW, CLE_ESSAI, 'n8n-nodes-base', 'parameters', 'runData', 'staticData', 'nodes', 'customData']) {
      assert.ok(!texte.includes(interdit), `« ${interdit} » ne doit jamais être écrit dans Firebase`);
    }
  });
  async function rafraichirUnClient() {
    await db.doc('clients/audrey/membres/alice@exemple.test').set({ role: 'editeur' });
    await rafraichir({ db, n8n: n8n(), auth: { uid: 'u', token: { email: 'alice@exemple.test', email_verified: true } }, maintenant: T0 + 99 * MIN });
  }
  test('D2 le détail d\'erreur est demandé seulement pour les erreurs, jamais pour les autres exécutions', async () => {
    await copieHoraire({ db, n8n: n8n(), maintenant: T0 });
    const avecDonnees = faux.etat.requetes.filter((r) => r.params.includeData === 'true');
    assert.equal(avecDonnees.length, 1);
    assert.equal(avecDonnees[0].chemin, '/api/v1/executions/102');
  });
});

describe('E. n8n injoignable, clé refusée', () => {
  test('E1 n8n en panne : rien n\'est effacé, l\'état le dit (bandeau jaune), le verrou est libéré', async () => {
    await copieHoraire({ db, n8n: n8n(), maintenant: T0 });
    faux.etat.panne = true;
    const r = await copieHoraire({ db, n8n: n8n(), maintenant: T0 + 70 * MIN });
    assert.equal(r.clients.audrey.resultat, 'n8n-injoignable');
    const etat = await lire('clients/audrey/sync/state');
    assert.equal(etat.n8nOk, false);
    assert.equal(etat.lastSuccessAt.toMillis(), T0);
    assert.equal((await liste('clients/audrey/executions')).length, 4);
    faux.etat.panne = false;
    const apres = await copieHoraire({ db, n8n: n8n(), maintenant: T0 + 80 * MIN });
    assert.equal(apres.clients.audrey.resultat, 'mis-a-jour');
    assert.equal((await lire('clients/audrey/sync/state')).n8nOk, true);
  });
  test('E2 connexion coupée ou n8n qui ne répond pas : même traitement', async () => {
    faux.etat.coupe = true;
    assert.equal((await copieHoraire({ db, n8n: n8n(), maintenant: T0 })).clients.boris.resultat, 'n8n-injoignable');
    faux.etat.coupe = false;
    faux.etat.latenceMs = 600;
    assert.equal((await copieHoraire({ db, n8n: n8n({ delaiMs: 100 }), maintenant: T0 })).clients.boris.resultat, 'n8n-injoignable');
  });
  test('E3 clé refusée : message sans la clé, jamais la clé dans Firebase', async () => {
    const r = await copieHoraire({ db, n8n: n8n({ cle: 'mauvaise-cle-secrete-123' }), maintenant: T0 });
    assert.equal(r.clients.audrey.resultat, 'n8n-injoignable');
    const etat = await lire('clients/audrey/sync/state');
    assert.match(etat.lastError, /refusée/);
    assert.ok(!JSON.stringify(etat).includes('mauvaise-cle-secrete-123'));
  });
});

describe('F. Lecture seule vers n8n', () => {
  test('F1 pendant une copie complète (horaire, rafraîchissement, erreurs, restes ouverts), n8n ne reçoit QUE des GET', async () => {
    await db.doc('clients/audrey/membres/alice@exemple.test').set({ role: 'editeur' });
    await copieHoraire({ db, n8n: n8n(), maintenant: T0 });
    await rafraichir({ db, n8n: n8n(), auth: { uid: 'u', token: { email: 'alice@exemple.test', email_verified: true } }, maintenant: T0 + 30 * MIN });
    faux.etat.panne = true;
    await copieHoraire({ db, n8n: n8n(), maintenant: T0 + 90 * MIN });
    assert.ok(faux.etat.requetes.length > 10);
    assert.deepEqual(faux.verbes(), ['GET']);
  });
  test('F2 la clé voyage dans un en-tête, jamais dans l\'adresse', async () => {
    await copieHoraire({ db, n8n: n8n(), maintenant: T0 });
    for (const r of faux.etat.requetes) {
      assert.equal(r.cle, CLE_ESSAI);
      assert.ok(!JSON.stringify(r.params).includes(CLE_ESSAI) && !r.chemin.includes(CLE_ESSAI));
    }
  });
});
