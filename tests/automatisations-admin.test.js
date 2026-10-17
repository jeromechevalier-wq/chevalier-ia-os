// Automatisations de Jérôme et vue administrateur (2.7.0) : reconnaissance par trois signes, copie vers SA base, lecture seule des clients.
// FAUX n8n + ÉMULATEUR Firestore. Chevalier IA OS = projet « demo-chevalier-ia-os », Chevalier IA APP = projet « demo-chevalier-ia-app » (deux bases bien séparées).
// Lancé par « npm run test:automatisations » (après « npm run preparer », qui copie le code partagé dans functions/partage/).
import assert from 'node:assert/strict';
import { test, describe, before, after, beforeEach } from 'node:test';
import { createRequire } from 'node:module';
import { creerFauxN8n, CLE_ESSAI, CONTENU_SECRET, SECRET_DANS_WORKFLOW } from './_faux-n8n.js';

process.env.GCLOUD_PROJECT = 'demo-chevalier-ia-os';
const requireOs = createRequire(new URL('../functions/package.json', import.meta.url));
const { initializeApp, getApps } = requireOs('firebase-admin/app');
const { getFirestore } = requireOs('firebase-admin/firestore');
const { creerLecteurN8n } = await import('../functions/partage/automatisations/n8n.js');
const E = await import('../functions/partage/automatisations/etiquettes.js');
const { copieInterne, administrateur, lireVueAdministrateur, Refus } = await import('../functions/src/automatisations/appels.js');
const { copieHoraire } = await import('../functions-plateforme/src/appels.js');
const { estAdministrateur, ADMINISTRATEURS } = await import('../js/os/administrateur.js');

const appOs = getApps().find((a) => a.name === '[DEFAULT]') ?? initializeApp({ projectId: 'demo-chevalier-ia-os' });
const appApp = initializeApp({ projectId: 'demo-chevalier-ia-app' }, 'plateforme-essai');
const dbOs = getFirestore(appOs);
const dbApp = getFirestore(appApp);

const faux = creerFauxN8n();
let url;
const n8n = () => creerLecteurN8n({ cle: CLE_ESSAI, url, delaiMs: 3000 });
const T0 = Date.parse('2026-10-17T10:00:00Z');
const MIN = 60000;
const il_y_a = (ms) => new Date(T0 - ms).toISOString();
const CLE_INTERNE = 'Clé n8n - interne';
const JEROME = { uid: 'u1', token: { email: 'jerome.chevalier@gmail.com', email_verified: true } };

before(async () => { url = await faux.demarrer(); });
after(async () => { await faux.arreter(); });

const vider = async (projet) => { const r = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/${projet}/databases/(default)/documents`, { method: 'DELETE' }); assert.ok(r.ok); };
const lire = async (db, chemin) => { const s = await db.doc(chemin).get(); return s.exists ? s.data() : null; };
const liste = async (db, chemin) => (await db.collection(chemin).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const refus = async (p) => { try { await p; } catch (e) { assert.ok(e instanceof Refus, String(e)); return e; } assert.fail('un refus était attendu'); };
const wf = (id, name, tags, cles = []) => ({ id, name, active: true, tags, cles });

describe('R. Reconnaissance du propriétaire : trois signes', () => {
  const connus = new Set(['audrey', 'cabinet-martin']);
  test('R1 le nom du credential est reconnu malgré la casse, les accents, les espaces et les tirets', () => {
    for (const nom of ['Clé n8n - interne', 'cle n8n - Interne', 'CLÉ N8N – INTERNE', 'Clé n8n-interne', 'Clé  n8n : interne', 'Clé n8n - Interne ']) assert.equal(E.proprietaireDeLaCle(nom), 'interne', nom);
    assert.equal(E.proprietaireDeLaCle('Clé n8n - Cabinet Martin'), 'cabinetmartin');
    assert.equal(E.proprietaireDeLaCle('Google Sheets'), null);
    assert.equal(E.proprietaireDeLaCle('Clé OpenAI'), null);
  });
  test('R2 les trois signes concordent : le workflow est retenu', () => {
    const r = E.classerInterne([wf('1', 'interne-veille-collecte', ['interne', 'veille'], [CLE_INTERNE, 'Google'])], { connus });
    assert.deepEqual(r.retenus.map((w) => w.id), ['1']);
    assert.deepEqual(r.signalements, []);
  });
  test('R3 un signe manque : jamais retenu, signalé avec la raison en français', () => {
    const cas = [
      [wf('a', 'interne-x', [], [CLE_INTERNE]), 'étiquette'],
      [wf('b', 'veille-x', ['interne'], [CLE_INTERNE]), 'interne-'],
      [wf('c', 'interne-x', ['interne'], ['Google']), 'Clé n8n - interne'],
      [wf('d', 'interne-x', ['interne'], []), 'Clé n8n - interne'],
    ];
    for (const [w, mot] of cas) {
      const r = E.classerInterne([w], { connus });
      assert.deepEqual(r.retenus, [], w.id);
      assert.equal(r.signalements.length, 1, w.id);
      assert.equal(r.signalements[0].raison, 'signe-manquant');
      assert.ok(r.signalements[0].message.includes(mot), `${w.id} : ${r.signalements[0].message}`);
    }
  });
  test('R4 un signe désigne quelqu\'un d\'autre : refusé et signalé', () => {
    const cas = [
      wf('a', 'interne-x', ['interne', 'client-audrey'], [CLE_INTERNE]),
      wf('b', 'audrey-x', ['interne'], [CLE_INTERNE]),
      wf('c', 'interne-x', ['interne'], [CLE_INTERNE, 'Clé n8n - Audrey']),
    ];
    for (const w of cas) {
      const r = E.classerInterne([w], { connus });
      assert.deepEqual(r.retenus, [], w.id);
      assert.equal(r.signalements[0]?.raison, 'signes-differents', w.id);
    }
  });
  test('R5 le dossier d\'une cliente (étiquette, nom et clé d\'Audrey) n\'est JAMAIS copié chez Jérôme et ne le dérange pas', () => {
    const w = wf('x', 'Audrey - Rapport mensuel', ['client-audrey'], ['Clé n8n - Audrey']);
    const r = E.classerInterne([w], { connus });
    assert.deepEqual(r, { retenus: [], signalements: [] });
    const c = E.classer([w], { connus, actifs: new Set(['audrey']) });
    assert.deepEqual(c.parClient.get('audrey').map((x) => x.id), ['x']);
  });
  test('R6 client : l\'étiquette suffit (compatibilité), mais un nom ou une clé d\'un autre est refusé', () => {
    const ctx = { connus, actifs: new Set(['audrey', 'cabinet-martin']) };
    assert.equal(E.classer([wf('1', 'Lire une fiche', ['client-audrey'])], ctx).parClient.get('audrey').length, 1);
    assert.equal(E.classer([wf('2', 'audrey-lire', ['client-audrey'], ['Clé n8n - Audrey'])], ctx).parClient.get('audrey').length, 1);
    assert.equal(E.classer([wf('3', 'cabinet-martin-x', ['client-cabinet-martin'], ['Clé n8n - Cabinet Martin'])], ctx).parClient.get('cabinet-martin').length, 1);
    assert.equal(E.classer([wf('8', 'client-audrey-lire', ['client-audrey'])], ctx).parClient.get('audrey').length, 1);
    assert.equal(E.classer([wf('9', 'client-boris-lire', ['client-audrey'])], { connus: new Set(['audrey', 'boris']), actifs: new Set(['audrey', 'boris']) }).signalements[0].raison, 'signes-differents');
    for (const w of [wf('4', 'interne-x', ['client-audrey']), wf('5', 'x', ['client-audrey'], [CLE_INTERNE]), wf('6', 'x', ['client-audrey', 'interne']), wf('7', 'x', ['client-audrey'], ['Clé n8n - Zoé'])]) {
      const r = E.classer([w], ctx);
      assert.equal(r.parClient.size, 0, w.id);
      assert.equal(r.signalements[0].raison, 'signes-differents', w.id);
    }
  });
  test('R7 un nom ou une clé de client SANS étiquette : pas copié, signalé « étiquette manquante »', () => {
    const ctx = { connus, actifs: new Set(['audrey']) };
    for (const w of [wf('1', 'audrey-x', []), wf('2', 'x', [], ['Clé n8n - Audrey'])]) {
      const r = E.classer([w], ctx);
      assert.equal(r.parClient.size, 0);
      assert.equal(r.signalements[0].raison, 'etiquette-manquante', w.id);
      assert.match(r.signalements[0].message, /client-audrey/);
    }
    // et un workflow sans aucun signe reste silencieux
    assert.deepEqual(E.classer([wf('3', 'Brouillon', [])], ctx).signalements, []);
    assert.deepEqual(E.classerInterne([wf('3', 'Brouillon', [])], { connus }).signalements, []);
  });
});

describe('I. Copie de tes workflows vers Chevalier IA OS', () => {
  beforeEach(async () => {
    await vider('demo-chevalier-ia-os'); await vider('demo-chevalier-ia-app');
    faux.vider();
    Object.assign(faux.etat, { panne: false, coupe: false, latenceMs: 0, taillePage: 100 });
    faux.etat.workflows = [
      wf('wfV1', 'interne-veille-collecte', ['interne', 'veille'], [CLE_INTERNE]),
      wf('wfV2', 'interne-veille-resume', ['interne'], ['Clé n8n - Interne']),
      wf('wfBad', 'interne-sans-etiquette', [], [CLE_INTERNE]), // étiquette oubliée
      wf('wfAud', 'Audrey - Rapport', ['client-audrey'], ['Clé n8n - Audrey']), // dossier Audrey
      wf('wfLibre', 'Brouillon perso', ['perso']),
    ];
    faux.etat.executions = [
      { id: '10', workflowId: 'wfV1', status: 'success', startedAt: il_y_a(50 * MIN), stoppedAt: il_y_a(50 * MIN - 2000) },
      { id: '11', workflowId: 'wfV2', status: 'error', startedAt: il_y_a(40 * MIN), stoppedAt: il_y_a(40 * MIN - 800), erreur: { message: 'Boom', etape: 'Enregistrer le résumé via la porte' } },
      { id: '12', workflowId: 'wfBad', status: 'success', startedAt: il_y_a(30 * MIN), stoppedAt: il_y_a(30 * MIN - 800) },
      { id: '13', workflowId: 'wfAud', status: 'success', startedAt: il_y_a(30 * MIN), stoppedAt: il_y_a(30 * MIN - 800) },
      { id: '14', workflowId: 'wfLibre', status: 'success', startedAt: il_y_a(30 * MIN), stoppedAt: il_y_a(30 * MIN - 800) },
    ];
    await dbApp.doc('clients/audrey').set({ modules: { automatisations: true } });
  });

  test('I1 seuls les workflows aux trois signes sont copiés, À LA RACINE de ta base ; rien sous clients/', async () => {
    const r = await copieInterne({ db: dbOs, dbPlateforme: dbApp, n8n: n8n(), maintenant: T0 });
    assert.equal(r.resultat, 'mis-a-jour');
    assert.deepEqual((await liste(dbOs, 'workflows')).map((w) => w.id).sort(), ['wfV1', 'wfV2']);
    assert.deepEqual((await liste(dbOs, 'executions')).map((e) => e.id).sort(), ['10', '11']);
    const err = await lire(dbOs, 'executions/11');
    assert.equal(err.failedStep, 'Enregistrer le résumé via la porte');
    assert.equal((await lire(dbOs, 'sync/state')).n8nOk, true);
    assert.deepEqual(await liste(dbOs, 'clients'), []);
    assert.deepEqual(await liste(dbApp, 'executions'), []);
    assert.deepEqual(await liste(dbApp, 'workflows'), []); // ni dans l'autre base
  });
  test('I2 le workflow mal étiqueté est SIGNALÉ (À vérifier) avec la raison ; celui d\'Audrey et le brouillon ne le sont pas', async () => {
    await copieInterne({ db: dbOs, dbPlateforme: dbApp, n8n: n8n(), maintenant: T0 });
    const items = (await lire(dbOs, 'plateforme_journal/signalements')).items;
    assert.deepEqual(items.map((i) => i.workflowId), ['wfBad']);
    assert.equal(items[0].raison, 'signe-manquant');
    assert.match(items[0].message, /étiquette « interne »/);
  });
  test('I3 deuxième copie : aucun doublon ; rafraîchissement manuel : seulement les workflows étiquetés interne, et il ne touche pas aux signalements', async () => {
    await copieInterne({ db: dbOs, dbPlateforme: dbApp, n8n: n8n(), maintenant: T0 });
    faux.etat.executions.push({ id: '15', workflowId: 'wfV1', status: 'success', startedAt: il_y_a(MIN), stoppedAt: il_y_a(MIN - 500) });
    faux.vider();
    const r = await copieInterne({ db: dbOs, dbPlateforme: dbApp, n8n: n8n(), raison: 'manuel', maintenant: T0 + 5 * MIN });
    assert.equal(r.resultat, 'mis-a-jour');
    assert.deepEqual((await liste(dbOs, 'executions')).map((e) => e.id).sort(), ['10', '11', '15']);
    assert.equal(faux.etat.requetes.find((q) => q.chemin === '/api/v1/workflows').params.tags, 'interne');
    assert.equal((await lire(dbOs, 'plateforme_journal/signalements')).items.length, 1);
  });
  test('I4 lecture seule vers n8n, et aucun contenu ni secret n\'arrive dans ta base', async () => {
    await copieInterne({ db: dbOs, dbPlateforme: dbApp, n8n: n8n(), maintenant: T0 });
    assert.deepEqual(faux.verbes(), ['GET']);
    const tout = JSON.stringify([await liste(dbOs, 'workflows'), await liste(dbOs, 'executions'), await lire(dbOs, 'sync/state'), await lire(dbOs, 'plateforme_journal/signalements')]);
    for (const interdit of [CONTENU_SECRET, SECRET_DANS_WORKFLOW, CLE_ESSAI, 'httpHeaderAuth', CLE_INTERNE]) assert.ok(!tout.includes(interdit), `« ${interdit} » ne doit pas être dans la base`);
  });
  test('I5 n8n en panne : rien n\'est effacé, l\'état le dit (bandeau jaune)', async () => {
    await copieInterne({ db: dbOs, dbPlateforme: dbApp, n8n: n8n(), maintenant: T0 });
    faux.etat.panne = true;
    const r = await copieInterne({ db: dbOs, dbPlateforme: dbApp, n8n: n8n(), maintenant: T0 + 60 * MIN });
    assert.equal(r.resultat, 'n8n-injoignable');
    assert.equal((await lire(dbOs, 'sync/state')).n8nOk, false);
    assert.equal((await liste(dbOs, 'executions')).length, 2);
  });
  test('I6 si Chevalier IA APP est illisible (droits pas encore donnés), la copie de tes workflows marche quand même', async () => {
    const casse = { collection: () => ({ listDocuments: async () => { throw Object.assign(new Error('refus'), { code: 7 }); } }) };
    const r = await copieInterne({ db: dbOs, dbPlateforme: casse, n8n: n8n(), maintenant: T0 });
    assert.equal(r.resultat, 'mis-a-jour');
    assert.equal((await liste(dbOs, 'executions')).length, 2);
  });
  test('I7 la copie des CLIENTS ne change pas : Audrey reçoit son workflow ; les signes d\'un autre client le font refuser', async () => {
    faux.etat.workflows.push(wf('wfMix', 'interne-intrus', ['client-audrey'], [CLE_INTERNE]));
    faux.etat.executions.push({ id: '16', workflowId: 'wfMix', status: 'success', startedAt: il_y_a(MIN), stoppedAt: il_y_a(MIN - 500) });
    await copieHoraire({ db: dbApp, n8n: n8n(), maintenant: T0 });
    assert.deepEqual((await liste(dbApp, 'clients/audrey/executions')).map((e) => e.id), ['13']);
    const items = (await lire(dbApp, 'plateforme_journal/signalements')).items;
    assert.ok(items.some((i) => i.workflowId === 'wfMix' && i.raison === 'signes-differents'));
    assert.deepEqual(await liste(dbApp, 'executions'), []); // jamais à la racine de la base des clients
  });
});

describe('A. Vue administrateur : accès réservé, lecture seule', () => {
  beforeEach(async () => {
    await vider('demo-chevalier-ia-os'); await vider('demo-chevalier-ia-app');
    faux.vider();
    for (const [c, nom] of [['audrey', 'Audrey Conseil'], ['boris', 'Boris SARL']]) {
      await dbApp.doc(`clients/${c}`).set({ modules: { automatisations: true } });
      await dbApp.doc(`marques/${c}`).set({ nom });
      await dbApp.doc(`clients/${c}/workflows/wf-${c}`).set({ workflowId: `wf-${c}`, nom: `Flux ${c}`, active: true, stepsPlan: [] });
      await dbApp.doc(`clients/${c}/sync/state`).set({ n8nOk: c === 'audrey', lastSyncedAt: new Date(T0), lastSuccessAt: new Date(T0), curseurs: { x: '1' } });
    }
    await dbApp.doc('clients/dora').set({ modules: { affaires: true } }); // sans le module : n'apparaît pas
    await dbApp.doc('clients/audrey/executions/1').set({ executionId: '1', workflowId: 'wf-audrey', workflowLabel: 'Flux audrey', status: 'error', stale: false, startedAt: new Date(T0 - 5 * MIN), stoppedAt: new Date(T0 - 5 * MIN + 900), durationMs: 900, errorMessage: 'Boom', failedStep: 'Étape 3', runGroupId: null, lastSyncedAt: new Date(T0) });
    await dbApp.doc('clients/boris/executions/2').set({ executionId: '2', workflowId: 'wf-boris', workflowLabel: 'Flux boris', status: 'success', stale: false, startedAt: new Date(T0 - 2 * MIN), stoppedAt: new Date(T0 - 2 * MIN + 500), durationMs: 500, lastSyncedAt: new Date(T0) });
    await dbApp.doc('plateforme_journal/signalements').set({ lastRunAt: new Date(T0), items: [{ workflowId: 'wfA', nom: 'Audrey sans étiquette', raison: 'etiquette-manquante', etiquettes: [], message: 'Il manque l’étiquette.' }, { workflowId: 'wfD', nom: 'Doublon', raison: 'signes-differents', etiquettes: [], message: 'App.' }] });
    await dbOs.doc('plateforme_journal/signalements').set({ lastRunAt: new Date(T0), items: [{ workflowId: 'wfD', nom: 'Doublon', raison: 'signe-manquant', etiquettes: [], message: 'OS.' }] });
  });
  const appel = (auth, donnees) => administrateur({ db: dbOs, dbPlateforme: dbApp, n8n, auth, donnees, maintenant: T0 });

  test('A1 le compte de Jérôme est le seul administrateur (e-mail vérifié obligatoire) ; son compte d\'assistant ne l\'est pas', () => {
    assert.deepEqual([...ADMINISTRATEURS], ['jerome.chevalier@gmail.com']);
    assert.equal(estAdministrateur('Jerome.Chevalier@gmail.com', true), true);
    assert.equal(estAdministrateur('jerome.chevalier@gmail.com', false), false);
    assert.equal(estAdministrateur('jeromebot.chevalierbot@gmail.com', true), false);
    assert.equal(estAdministrateur(undefined, true), false);
  });
  test('A2 refusés : sans connexion, e-mail non vérifié, autre compte, assistant ; aucune donnée ne sort', async () => {
    assert.equal((await refus(appel(null, {}))).code, 'unauthenticated');
    for (const auth of [
      { uid: 'u', token: { email: 'jerome.chevalier@gmail.com', email_verified: false } },
      { uid: 'u', token: { email: 'jeromebot.chevalierbot@gmail.com', email_verified: true } },
      { uid: 'u', token: { email: 'audrey@exemple.test', email_verified: true } },
    ]) {
      const e = await refus(appel(auth, { action: 'lire' }));
      assert.equal(e.code, 'permission-denied');
      assert.equal(e.message, 'Action non autorisée.');
    }
    assert.equal((await refus(appel(JEROME, { action: 'effacer' }))).code, 'invalid-argument');
    assert.equal((await refus(appel(JEROME, { proprietaire: '../x' }))).code, 'invalid-argument');
  });
  test('A3 « lire » : les propriétaires, les workflows, les exécutions des clients et les « À vérifier » des deux bases (sans doublon)', async () => {
    const r = await appel(JEROME, { action: 'lire' });
    assert.deepEqual(r.proprietaires.map((p) => [p.id, p.nom, p.workflows]).sort(), [['audrey', 'Audrey Conseil', 1], ['boris', 'Boris SARL', 1]]);
    assert.equal(r.proprietaires.find((p) => p.id === 'boris').synchro.n8nOk, false);
    assert.deepEqual(r.executions.map((e) => [e.id, e.proprietaire]), [['2', 'boris'], ['1', 'audrey']]);
    assert.equal(r.executions[1].errorMessage, 'Boom');
    assert.equal(r.executions[1].startedAt, T0 - 5 * MIN);
    assert.deepEqual(r.workflows.map((w) => w.id).sort(), ['wf-audrey', 'wf-boris']);
    assert.deepEqual(r.aVerifier.map((i) => [i.workflowId, i.source]).sort(), [['wfA', 'app'], ['wfD', 'os']]);
    assert.equal(r.lecturePossible, true);
    assert.ok(!JSON.stringify(r).includes('curseurs'), 'rien de technique ne sort');
  });
  test('A4 le filtre par propriétaire ne renvoie que ses données ; la liste des propriétaires reste complète', async () => {
    const r = await appel(JEROME, { action: 'lire', proprietaire: 'audrey' });
    assert.deepEqual(r.executions.map((e) => e.id), ['1']);
    assert.deepEqual(r.workflows.map((w) => w.id), ['wf-audrey']);
    assert.equal(r.proprietaires.length, 2);
  });
  test('A5 LECTURE SEULE : la base de Chevalier IA APP est strictement identique avant et après (lire)', async () => {
    const photo = async () => JSON.stringify(await Promise.all(['clients/audrey/executions', 'clients/audrey/workflows', 'clients/audrey/sync', 'clients/boris/executions', 'clients/boris/sync', 'marques', 'clients'].map((c) => liste(dbApp, c))).then((x) => [x, null]));
    const avant = await photo();
    await appel(JEROME, { action: 'lire' });
    await appel(JEROME, { action: 'lire', proprietaire: 'boris' });
    assert.equal(await photo(), avant);
    assert.equal(JSON.stringify(await lire(dbApp, 'plateforme_journal/signalements')).includes('OS.'), false);
  });
  test('A6 si Chevalier IA APP n\'est pas lisible : réponse propre (lecturePossible = false), tes « À vérifier » sont quand même rendus', async () => {
    const casse = { collection: () => ({ listDocuments: async () => { throw new Error('refus'); } }), doc: () => ({}), getAll: async () => [] };
    const r = await lireVueAdministrateur({ db: dbOs, dbPlateforme: casse });
    assert.equal(r.lecturePossible, false);
    assert.deepEqual(r.executions, []);
    assert.deepEqual(r.aVerifier.map((i) => i.workflowId), ['wfD']);
    assert.equal((await lireVueAdministrateur({ db: dbOs, dbPlateforme: null })).lecturePossible, false);
  });
  test('A7 « rafraichir » recopie tes workflows maintenant (administrateur seulement)', async () => {
    faux.etat.workflows = [wf('wfV1', 'interne-veille', ['interne'], [CLE_INTERNE])];
    faux.etat.executions = [{ id: '10', workflowId: 'wfV1', status: 'success', startedAt: il_y_a(5 * MIN), stoppedAt: il_y_a(5 * MIN - 500) }];
    await refus(appel({ uid: 'u', token: { email: 'audrey@exemple.test', email_verified: true } }, { action: 'rafraichir' }));
    assert.equal(faux.etat.requetes.length, 0, 'un refus n\'appelle pas n8n');
    const r = await appel(JEROME, { action: 'rafraichir' });
    assert.equal(r.resultat, 'mis-a-jour');
    assert.deepEqual((await liste(dbOs, 'executions')).map((e) => e.id), ['10']);
    assert.deepEqual(faux.verbes(), ['GET']);
  });
});
