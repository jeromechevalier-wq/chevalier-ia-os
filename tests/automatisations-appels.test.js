// Fonctions appelables du module Automatisations (chantier 14) : « Rafraîchir » (client déduit de l'identité) et « Renommer » (éditeurs du bon client).
// FAUX n8n + ÉMULATEUR Firestore. Les fonctions sont appelées directement (functions-plateforme/src/appels.js) avec une identité simulée.
import assert from 'node:assert/strict';
import { test, describe, before, after, beforeEach } from 'node:test';
import { createRequire } from 'node:module';
import { creerFauxN8n, CLE_ESSAI } from './_faux-n8n.js';

process.env.GCLOUD_PROJECT = 'demo-chevalier-ia-os';
const requireFn = createRequire(new URL('../functions-plateforme/package.json', import.meta.url));
const { initializeApp, getApps } = requireFn('firebase-admin/app');
const { getFirestore } = requireFn('firebase-admin/firestore');
const { creerLecteurN8n } = await import('../functions-plateforme/src/n8n.js');
const { copieHoraire, rafraichir, renommer, Refus } = await import('../functions-plateforme/src/appels.js');

if (!getApps().length) initializeApp({ projectId: 'demo-chevalier-ia-os' });
const db = getFirestore();
const faux = creerFauxN8n();
let url;
const n8n = () => creerLecteurN8n({ cle: CLE_ESSAI, url, delaiMs: 3000 });
const T0 = Date.parse('2026-10-11T10:00:00Z');
const MIN = 60000;
const il_y_a = (ms) => new Date(T0 - ms).toISOString();

const ALICE = 'alice@exemple.test'; // éditrice chez audrey
const LEA = 'lea@exemple.test'; // lectrice chez audrey
const BOB = 'bob@exemple.test'; // éditeur chez boris
const CLARA = 'clara@exemple.test'; // éditrice chez audrey, lectrice chez boris
const ZOE = 'zoe@exemple.test'; // membre d'un client sans le module
const id = (email, verifie = true) => ({ uid: `uid-${email}`, token: { email, email_verified: verifie } });

before(async () => { url = await faux.demarrer(); });
after(async () => { await faux.arreter(); });

const lire = async (chemin) => { const s = await db.doc(chemin).get(); return s.exists ? s.data() : null; };
const liste = async (chemin) => (await db.collection(chemin).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
const refus = async (promesse) => { try { await promesse; } catch (e) { assert.ok(e instanceof Refus, String(e)); return e; } assert.fail('un refus était attendu'); };

beforeEach(async () => {
  const r = await fetch(`http://${process.env.FIRESTORE_EMULATOR_HOST}/emulator/v1/projects/demo-chevalier-ia-os/databases/(default)/documents`, { method: 'DELETE' });
  assert.ok(r.ok);
  faux.vider();
  Object.assign(faux.etat, { panne: false, coupe: false, latenceMs: 0, taillePage: 100 });
  await db.doc('clients/audrey').set({ modules: { automatisations: true } });
  await db.doc('clients/boris').set({ modules: { automatisations: true } });
  await db.doc('clients/dora').set({ modules: { affaires: true } }); // sans le module
  for (const [c, e, role] of [['audrey', ALICE, 'editeur'], ['audrey', LEA, 'lecteur'], ['audrey', CLARA, 'editeur'], ['boris', BOB, 'editeur'], ['boris', CLARA, 'lecteur'], ['dora', ZOE, 'editeur']]) {
    await db.doc(`clients/${c}/membres/${e}`).set({ role });
  }
  faux.etat.workflows = [
    { id: 'wfA1', name: 'client-audrey-lire-une-fiche', active: true, tags: ['client-audrey'] },
    { id: 'wfB1', name: 'client-boris-rapport', active: true, tags: ['client-boris'] },
    { id: 'wfDouble', name: 'Deux clients', active: true, tags: ['client-audrey', 'client-boris'] },
  ];
  faux.etat.executions = [
    { id: '101', workflowId: 'wfA1', status: 'success', startedAt: il_y_a(50 * MIN), stoppedAt: il_y_a(50 * MIN - 2000) },
    { id: '201', workflowId: 'wfB1', status: 'success', startedAt: il_y_a(30 * MIN), stoppedAt: il_y_a(30 * MIN - 1000) },
    { id: '301', workflowId: 'wfDouble', status: 'success', startedAt: il_y_a(30 * MIN), stoppedAt: il_y_a(30 * MIN - 1000) },
  ];
});

describe('R. Rafraîchir : le client vient de l\'identité', () => {
  test('R1 alice (membre d\'audrey) rafraîchit : audrey est copié, boris ne l\'est pas', async () => {
    const r = await rafraichir({ db, n8n: n8n(), auth: id(ALICE), maintenant: T0 });
    assert.equal(r.resultat, 'mis-a-jour');
    assert.deepEqual((await liste('clients/audrey/executions')).map((e) => e.id), ['101']);
    assert.deepEqual(await liste('clients/boris/executions'), []);
    assert.equal(await lire('clients/boris/sync/state'), null);
  });
  test('R2 la fonction n\'accepte AUCUN paramètre « client » : même si un appelant en glisse un, il est ignoré', async () => {
    const r = await rafraichir({ db, n8n: n8n(), auth: id(ALICE), maintenant: T0, client: 'boris', donnees: { client: 'boris' } });
    assert.equal(r.resultat, 'mis-a-jour');
    assert.deepEqual(await liste('clients/boris/executions'), []);
  });
  test('R3 refusés : sans connexion, e-mail non vérifié, membre d\'aucun client avec le module, membre d\'un client sans module (même message)', async () => {
    const e1 = await refus(rafraichir({ db, n8n: n8n(), auth: null, maintenant: T0 }));
    assert.equal(e1.code, 'unauthenticated');
    assert.equal((await refus(rafraichir({ db, n8n: n8n(), auth: id(ALICE, false), maintenant: T0 }))).code, 'unauthenticated');
    const e3 = await refus(rafraichir({ db, n8n: n8n(), auth: id('inconnu@exemple.test'), maintenant: T0 }));
    const e4 = await refus(rafraichir({ db, n8n: n8n(), auth: id(ZOE), maintenant: T0 }));
    assert.equal(e3.code, 'permission-denied');
    assert.equal(e3.message, e4.message);
    assert.equal(faux.etat.requetes.length, 0, 'aucun refus n\'atteint n8n');
  });
  test('R4 casse de l\'e-mail ignorée', async () => {
    assert.equal((await rafraichir({ db, n8n: n8n(), auth: id('Alice@Exemple.TEST'), maintenant: T0 })).resultat, 'mis-a-jour');
  });
  test('R5 un lecteur peut rafraîchir ; clara (deux clients) rafraîchit les deux', async () => {
    assert.equal((await rafraichir({ db, n8n: n8n(), auth: id(LEA), maintenant: T0 })).resultat, 'mis-a-jour');
    await rafraichir({ db, n8n: n8n(), auth: id(CLARA), maintenant: T0 + 5 * MIN });
    assert.ok(await lire('clients/boris/executions/201'));
  });
  test('R6 délai minimal de 10 s : le 2e rafraîchissement trop proche est refusé SANS appeler n8n, puis accepté après 10 s', async () => {
    await rafraichir({ db, n8n: n8n(), auth: id(ALICE), maintenant: T0 });
    faux.vider();
    const trop = await rafraichir({ db, n8n: n8n(), auth: id(ALICE), maintenant: T0 + 9000 });
    assert.equal(trop.resultat, 'trop-tot');
    assert.equal(faux.etat.requetes.length, 0);
    // Le délai est par client : un autre membre du même client est aussi limité.
    assert.equal((await rafraichir({ db, n8n: n8n(), auth: id(LEA), maintenant: T0 + 9500 })).resultat, 'trop-tot');
    assert.equal((await rafraichir({ db, n8n: n8n(), auth: id(ALICE), maintenant: T0 + 10001 })).resultat, 'mis-a-jour');
  });
  test('R7 la copie horaire n\'est pas bloquée par le délai des rafraîchissements', async () => {
    await rafraichir({ db, n8n: n8n(), auth: id(ALICE), maintenant: T0 });
    const r = await copieHoraire({ db, n8n: n8n(), maintenant: T0 + 2000 });
    assert.equal(r.clients.audrey.resultat, 'mis-a-jour');
  });
  test('R8 le rafraîchissement ne demande à n8n que les workflows de CE client (étiquette) et refuse un workflow à deux clients', async () => {
    await rafraichir({ db, n8n: n8n(), auth: id(ALICE), maintenant: T0 });
    const demandes = faux.etat.requetes.filter((r) => r.chemin === '/api/v1/workflows');
    assert.equal(demandes.length, 1);
    assert.equal(demandes[0].params.tags, 'client-audrey');
    assert.equal(await lire('clients/audrey/executions/301'), null);
    assert.equal(await lire('clients/audrey/workflows/wfDouble'), null);
  });
  test('R9 n8n injoignable : réponse « n8n-injoignable », données conservées', async () => {
    await rafraichir({ db, n8n: n8n(), auth: id(ALICE), maintenant: T0 });
    faux.etat.panne = true;
    const r = await rafraichir({ db, n8n: n8n(), auth: id(ALICE), maintenant: T0 + MIN });
    assert.equal(r.resultat, 'n8n-injoignable');
    assert.equal(r.lastSyncedAt, T0);
    assert.ok(await lire('clients/audrey/executions/101'));
    assert.equal((await lire('clients/audrey/sync/state')).n8nOk, false);
  });
});

describe('N. Renommer : éditeurs du bon client, un seul champ', () => {
  const copier = () => copieHoraire({ db, n8n: n8n(), maintenant: T0 });
  const demande = (extra = {}) => ({ client: 'audrey', workflowId: 'wfA1', libelle: 'Présences du matin', ...extra });

  test('N1 un éditeur renomme : seul le champ « libelle » change, n8n n\'est pas touché', async () => {
    await copier();
    const avant = await lire('clients/audrey/workflows/wfA1');
    faux.vider();
    assert.deepEqual(await renommer({ db, auth: id(ALICE), donnees: demande() }), { ok: true, libelle: 'Présences du matin' });
    const apres = await lire('clients/audrey/workflows/wfA1');
    assert.deepEqual(Object.keys(apres).sort(), [...Object.keys(avant), 'libelle'].sort());
    for (const k of Object.keys(avant)) assert.deepEqual(apres[k], avant[k], k);
    assert.equal(faux.etat.requetes.length, 0, 'aucune requête vers n8n');
  });
  test('N2 refusés : lecteur du client, éditeur d\'un AUTRE client, non-membre, e-mail non vérifié, sans connexion', async () => {
    await copier();
    await refus(renommer({ db, auth: id(LEA), donnees: demande() }));
    await refus(renommer({ db, auth: id(BOB), donnees: demande() }));
    await refus(renommer({ db, auth: id('inconnu@exemple.test'), donnees: demande() }));
    assert.equal((await refus(renommer({ db, auth: id(ALICE, false), donnees: demande() }))).code, 'unauthenticated');
    assert.equal((await refus(renommer({ db, auth: null, donnees: demande() }))).code, 'unauthenticated');
    assert.equal((await lire('clients/audrey/workflows/wfA1')).libelle, undefined);
  });
  test('N3 clara est éditrice chez audrey mais seulement lectrice chez boris : refusée chez boris', async () => {
    await copier();
    await refus(renommer({ db, auth: id(CLARA), donnees: demande({ client: 'boris', workflowId: 'wfB1' }) }));
    assert.equal((await lire('clients/boris/workflows/wfB1')).libelle, undefined);
    assert.equal((await renommer({ db, auth: id(CLARA), donnees: demande() })).ok, true);
  });
  test('N4 un éditeur ne peut pas viser le workflow d\'un autre client en changeant l\'identifiant de client', async () => {
    await copier();
    await refus(renommer({ db, auth: id(ALICE), donnees: demande({ client: 'boris', workflowId: 'wfB1' }) }));
    const e = await refus(renommer({ db, auth: id(ALICE), donnees: demande({ workflowId: 'wfB1' }) }));
    assert.equal(e.code, 'not-found');
    assert.equal((await lire('clients/boris/workflows/wfB1')).libelle, undefined);
  });
  test('N5 mêmes mots pour : client inexistant, non-membre, module automatisations inactif (on ne devine rien)', async () => {
    await copier();
    const a = await refus(renommer({ db, auth: id(ALICE), donnees: demande({ client: 'fantome' }) }));
    const b = await refus(renommer({ db, auth: id(BOB), donnees: demande() }));
    await db.doc('clients/dora/workflows/w1').set({ workflowId: 'w1', nom: 'x' });
    const c = await refus(renommer({ db, auth: id(ZOE), donnees: demande({ client: 'dora', workflowId: 'w1' }) }));
    assert.equal(a.message, b.message);
    assert.equal(b.message, c.message);
    assert.equal((await lire('clients/dora/workflows/w1')).libelle, undefined);
  });
  test('N6 données invalides refusées : identifiants douteux, nom trop long, type faux', async () => {
    await copier();
    for (const d of [demande({ client: '../x' }), demande({ client: 'A B' }), demande({ workflowId: 'a/b' }), demande({ workflowId: '' }), demande({ libelle: 5 }), demande({ libelle: 'x'.repeat(81) }), null, undefined, {}]) {
      assert.equal((await refus(renommer({ db, auth: id(ALICE), donnees: d }))).code, 'invalid-argument', JSON.stringify(d));
    }
  });
  test('N7 le nom est nettoyé (espaces, retours à la ligne) ; un nom vide revient au nom d\'origine', async () => {
    await copier();
    assert.equal((await renommer({ db, auth: id(ALICE), donnees: demande({ libelle: '  Mon\n  nom   <b>x</b> ' }) })).libelle, 'Mon nom <b>x</b>'); // l'écran l'affiche en texte simple
    assert.equal((await lire('clients/audrey/workflows/wfA1')).libelle, 'Mon nom <b>x</b>');
    await renommer({ db, auth: id(ALICE), donnees: demande({ libelle: '   ' }) });
    assert.equal((await lire('clients/audrey/workflows/wfA1')).libelle, undefined);
    assert.equal((await lire('clients/audrey/workflows/wfA1')).nom, 'client-audrey-lire-une-fiche');
  });
  test('N8 un workflow inconnu n\'est pas créé par un renommage', async () => {
    await copier();
    assert.equal((await refus(renommer({ db, auth: id(ALICE), donnees: demande({ workflowId: 'inconnu' }) }))).code, 'not-found');
    assert.equal(await lire('clients/audrey/workflows/inconnu'), null);
  });
  test('N9 la copie horaire n\'écrase JAMAIS le nom choisi, et les nouvelles exécutions l\'utilisent', async () => {
    await copier();
    await renommer({ db, auth: id(ALICE), donnees: demande() });
    faux.etat.workflows[0].name = 'client-audrey-nom-change';
    faux.etat.executions.push({ id: '102', workflowId: 'wfA1', status: 'success', startedAt: il_y_a(MIN), stoppedAt: il_y_a(MIN - 500) });
    await copieHoraire({ db, n8n: n8n(), maintenant: T0 + 60 * MIN });
    const w = await lire('clients/audrey/workflows/wfA1');
    assert.equal(w.libelle, 'Présences du matin');
    assert.equal(w.nom, 'client-audrey-nom-change', 'le nom d\'origine suit n8n');
    assert.equal((await lire('clients/audrey/executions/102')).workflowLabel, 'Présences du matin');
  });
});

describe('C. Compatibilité : les clients activés avec l\'ancien identifiant « journal » continuent de marcher', () => {
  const copier = () => copieHoraire({ db, n8n: n8n(), maintenant: T0 });
  test('C1 une fiche qui porte seulement « journal: true » est copiée, peut rafraîchir et renommer', async () => {
    await db.doc('clients/audrey').set({ modules: { journal: true } });
    const r = await copier();
    assert.equal(r.clients.audrey.resultat, 'mis-a-jour');
    assert.deepEqual((await liste('clients/audrey/executions')).map((e) => e.id), ['101']);
    assert.equal((await rafraichir({ db, n8n: n8n(), auth: id(ALICE), maintenant: T0 + 20000 })).resultat, 'mis-a-jour');
    assert.equal((await renommer({ db, auth: id(ALICE), donnees: { client: 'audrey', workflowId: 'wfA1', libelle: 'Ancien nom de module' } })).ok, true);
  });
  test('C2 la nouvelle clé gagne : « automatisations: false » éteint le module même si « journal: true » traîne encore', async () => {
    await db.doc('clients/audrey').set({ modules: { journal: true, automatisations: false } });
    const r = await copier();
    assert.equal(r.clients.audrey, undefined, 'audrey n\'est plus copié');
    assert.deepEqual(await liste('clients/audrey/executions'), []);
    await refus(rafraichir({ db, n8n: n8n(), auth: id(ALICE), maintenant: T0 }));
    await db.doc('clients/audrey/workflows/wfA1').set({ workflowId: 'wfA1', nom: 'x' });
    await refus(renommer({ db, auth: id(ALICE), donnees: { client: 'audrey', workflowId: 'wfA1', libelle: 'Non' } }));
  });
  test('C3 les deux clés à true : le client est copié une seule fois', async () => {
    await db.doc('clients/audrey').set({ modules: { journal: true, automatisations: true } });
    const r = await copier();
    assert.equal(r.clients.audrey.resultat, 'mis-a-jour');
    assert.deepEqual((await liste('clients/audrey/executions')).map((e) => e.id), ['101']);
  });
});
