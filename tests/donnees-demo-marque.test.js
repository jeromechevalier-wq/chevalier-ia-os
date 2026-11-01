// Tests du garde-fou « client de démonstration » (marque demo: true) : scripts/plateforme/donnees-demo.js, marquer-demo.js, nouveau-client.js --demo.
// ÉMULATEUR Firestore seulement (projet demo-chevalier-ia-os) : jamais la vraie base. Lancé avec la série « outil-client » (npm run test:module donnees-demo).
import assert from 'node:assert/strict';
import { test, before } from 'node:test';
import { executerDonneesDemo } from '../scripts/plateforme/donnees-demo.js';
import { executerMarquerDemo } from '../scripts/plateforme/marquer-demo.js';
import { executerNouveauClient } from '../scripts/plateforme/nouveau-client.js';
import { cible, ouvrir } from '../scripts/plateforme/commun.js';

const REEL = 'marque-reel';
const DEMO = 'marque-demo';
const A_MARQUER = 'marque-a-faire';
let db;

const collecte = () => { const lignes = []; return { lignes, out: (l = '') => lignes.push(l) }; };
async function demo(argv, extra = {}) {
  const s = collecte();
  const code = await executerDonneesDemo(argv, { out: s.out, env: process.env, maintenant: new Date('2026-10-26T10:00:00Z'), ...extra });
  return { code, texte: s.lignes.join('\n') };
}
async function marquer(argv, extra = {}) {
  const s = collecte();
  const code = await executerMarquerDemo(argv, { out: s.out, env: process.env, ...extra });
  return { code, texte: s.lignes.join('\n') };
}
async function photo() {
  const docs = [];
  const marcher = async (ref) => {
    const s = await ref.get();
    if (s.exists) docs.push([ref.path, JSON.stringify(s.data())]);
    for (const c of await ref.listCollections()) for (const x of await c.listDocuments()) await marcher(x);
  };
  for (const r of await db.collection('clients').listDocuments()) await marcher(r);
  return docs.sort();
}
const compter = async (client, c) => (await db.collection(`clients/${client}/${c}`).get()).size;

before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST absent : ces tests ne se lancent que sur l'émulateur");
  db = ouvrir(cible({}, process.env)).db;
  const modules = { affaires: true, projets: true, devis: true };
  await db.doc(`clients/${REEL}`).set({ nom: 'Vrai client', modules });
  await db.doc(`clients/${DEMO}`).set({ nom: 'Client démo', modules, demo: true });
  await db.doc(`clients/${A_MARQUER}`).set({ nom: 'À marquer', modules, equipe: [{ email: 'alice@exemple.test', role: 'editeur' }] });
  for (const c of [REEL, DEMO, A_MARQUER]) await db.doc(`clients/${c}/membres/alice@exemple.test`).set({ role: 'editeur' });
});

test('1. Un client sans marque est refusé, même avec --completer, en simulation comme en écriture', async () => {
  const avant = await photo();
  for (const argv of [['--catalogue-exemple'], ['--catalogue-exemple', '--ecrire'], ['--catalogue-exemple', '--ecrire', '--completer'], ['--catalogue-exemple', '--completer']]) {
    const r = await demo([REEL, ...argv]);
    assert.equal(r.code, 1, argv.join(' '));
    assert.match(r.texte, /Ce client n'est pas marqué comme client de démonstration : l'outil refuse d'écrire\. Rien n'a été modifié\./);
  }
  assert.deepEqual(await photo(), avant);
});

test('2. Le refus vaut aussi pour --retirer et --pdf', async () => {
  const avant = await photo();
  for (const argv of [['--retirer'], ['--retirer', '--ecrire'], ['--pdf'], ['--pdf', '--ecrire']]) {
    const r = await demo([REEL, ...argv]);
    assert.equal(r.code, 1, argv.join(' '));
    assert.match(r.texte, /n'est pas marqué comme client de démonstration/);
  }
  assert.deepEqual(await photo(), avant);
});

test('3. Un client marqué est accepté : simulation sans écriture, puis écriture', async () => {
  const avant = await photo();
  const s = await demo([DEMO, '--catalogue-exemple']);
  assert.equal(s.code, 0, s.texte);
  assert.match(s.texte, /SIMULATION/);
  assert.deepEqual(await photo(), avant);
  const r = await demo([DEMO, '--catalogue-exemple', '--ecrire']);
  assert.equal(r.code, 0, r.texte);
  assert.ok(await compter(DEMO, 'crm_affaires') > 0);
  assert.equal(await compter(REEL, 'crm_affaires'), 0);
  const retrait = await demo([DEMO, '--retirer', '--ecrire']);
  assert.equal(retrait.code, 0, retrait.texte);
  assert.equal(await compter(DEMO, 'crm_affaires'), 0);
});

test('4. marquer-demo : simulation sans écriture, puis pose de demo: true sans rien écraser', async () => {
  const avant = await photo();
  const s = await marquer(['--client', A_MARQUER]);
  assert.equal(s.code, 0, s.texte);
  assert.match(s.texte, /SIMULATION/);
  assert.deepEqual(await photo(), avant);
  const r = await marquer(['--client', A_MARQUER, '--ecrire']);
  assert.equal(r.code, 0, r.texte);
  assert.match(r.texte, /posée/);
  const fiche = (await db.doc(`clients/${A_MARQUER}`).get()).data();
  assert.deepEqual(fiche, { nom: 'À marquer', modules: { affaires: true, projets: true, devis: true }, equipe: [{ email: 'alice@exemple.test', role: 'editeur' }], demo: true });
  // Le client marqué est maintenant accepté par l'outil de démonstration.
  assert.equal((await demo([A_MARQUER, '--catalogue-exemple'])).code, 0);
  // Une seconde fois : rien à changer.
  const encore = await marquer(['--client', A_MARQUER, '--ecrire']);
  assert.equal(encore.code, 0);
  assert.match(encore.texte, /déjà marqué/);
});

test('5. marquer-demo refuse la base de Jérôme, un projet inconnu et un client qui n\'existe pas', async () => {
  const avant = await photo();
  const r1 = await marquer(['--client', REEL, '--ecrire'], { env: { ...process.env, GCLOUD_PROJECT: 'chevalier-ia-os' } });
  assert.equal(r1.code, 1);
  assert.match(r1.texte, /CRM de Jérôme|refusé/);
  const r2 = await marquer(['--client', REEL, '--ecrire'], { env: { GCLOUD_PROJECT: 'un-autre-projet' } });
  assert.equal(r2.code, 1);
  assert.match(r2.texte, /refusé/);
  const r3 = await marquer(['--client', 'inconnu', '--ecrire']);
  assert.equal(r3.code, 1);
  assert.match(r3.texte, /n'existe pas/);
  assert.equal((await db.doc('clients/inconnu').get()).exists, false);
  const r4 = await marquer([]);
  assert.equal(r4.code, 1);
  assert.deepEqual(await photo(), avant);
  assert.equal((await db.doc(`clients/${REEL}`).get()).data().demo, undefined);
});

test('6. nouveau-client --demo marque le client à la création ; sans --demo, pas de marque', async () => {
  const lancer = async (argv) => { const s = collecte(); const code = await executerNouveauClient(argv, { out: s.out, env: process.env }); return { code, texte: s.lignes.join('\n') }; };
  const base = ['--nom', 'Essai', '--membre', 'alice@exemple.test:editeur', '--modules', 'affaires'];
  const s = await lancer(['marque-cree-demo', ...base, '--demo']);
  assert.equal(s.code, 0, s.texte);
  assert.match(s.texte, /"demo": true/);
  assert.equal((await db.doc('clients/marque-cree-demo').get()).exists, false); // simulation
  assert.equal((await lancer(['marque-cree-demo', ...base, '--demo', '--ecrire'])).code, 0);
  assert.equal((await db.doc('clients/marque-cree-demo').get()).data().demo, true);
  assert.equal((await lancer(['marque-cree-reel', ...base, '--ecrire'])).code, 0);
  assert.equal((await db.doc('clients/marque-cree-reel').get()).data().demo, undefined);
  // Un client créé sans --demo reste refusé par l'outil de démonstration.
  assert.equal((await demo(['marque-cree-reel', '--catalogue-exemple', '--ecrire', '--completer'])).code, 1);
  assert.equal(await compter('marque-cree-reel', 'crm_affaires'), 0);
});
