// Tests de l'option --vider de scripts/donnees-demo.js (remise à zéro d'un client de démonstration, données marquées ou non).
// ÉMULATEUR Firestore + Storage seulement (projet demo-chevalier-ia-os) : jamais la vraie base. Série « outil-client » (npm run test:module donnees-demo).
import assert from 'node:assert/strict';
import { test, before } from 'node:test';
import { executerDonneesDemo } from '../scripts/plateforme/donnees-demo.js';
import { cible, ouvrir } from '../scripts/plateforme/commun.js';

const modules = { affaires: true, projets: true, devis: true };
const DEMO = 'vider-demo';
const AUTRE = 'vider-autre-demo';
const REEL = 'vider-reel';
let db; let bucket;

async function lancer(argv, extra = {}) {
  const lignes = [];
  const code = await executerDonneesDemo(argv, { out: (l = '') => lignes.push(l), env: process.env, maintenant: new Date('2026-10-26T10:00:00Z'), ...extra });
  return { code, texte: lignes.join('\n') };
}
async function photo(prefixe) {
  const docs = [];
  const marcher = async (ref) => {
    const s = await ref.get();
    if (s.exists) docs.push([ref.path, JSON.stringify(s.data())]);
    for (const c of await ref.listCollections()) for (const x of await c.listDocuments()) await marcher(x);
  };
  await marcher(db.doc(prefixe));
  return docs.sort();
}
const compter = async (client, c) => (await db.collection(`clients/${client}/${c}`).get()).size;
async function peupler(id, { demo = true, nom = id } = {}) {
  await db.doc(`clients/${id}`).set({ nom, modules, ...(demo ? { demo: true } : {}) });
  await db.doc(`clients/${id}/membres/alice@exemple.test`).set({ role: 'editeur' });
  const ecrire = (chemin, donnees) => db.doc(`clients/${id}/${chemin}`).set(donnees);
  await ecrire('devis_articles/a1', { libelle: 'Lampe Lampar', donneesDemo: true });
  await ecrire('devis_articles/a2', { libelle: 'Interrupteur double' }); // NON marqué : doit partir aussi
  await ecrire('devis_vocabulaire/prise', { expression: 'prise' });
  await ecrire('devis_devis/d1', { numero: 'D-2026-0001', objet: 'Ancien essai', statut: 'envoye' });
  await ecrire('devis_devis/d1/versions/v1', { note: 'sous-collection' });
  await ecrire('crm_organisations/o1', { nom: 'Orga à la main' });
  await ecrire('crm_personnes/p1', { nom: 'Personne à la main' });
  await ecrire('crm_affaires/af1', { titre: 'Affaire à la main' });
  await ecrire('projets_projets/pr1', { titre: 'Projet à la main' });
  await ecrire('crm_audit/au1', { acteur: 'alice@exemple.test', valeur: 'Dupont' });
  await ecrire('crm_audit_avant/ab1', { copie: 'avant' });
  await ecrire('crm_actions_lancements/l1', { contenu: 'e-mail' });
  await ecrire('devis_compteurs/global', { valeur: 7 });
  await ecrire('crm_parametres/etapes', { liste: [] });
  await ecrire('documents_stockes/ds1', { nom: 'Plan déposé' });
  await ecrire('projets_modeles/m1', { nom: 'Modèle chantier' });
  await ecrire('mcp_limites/l1', { n: 1 });
  await ecrire('collection_inconnue/x', { a: 1 });
  await bucket.file(`clients/${id}/devis/af1/devis-1.pdf`).save('pdf');
  await bucket.file(`clients/${id}/documents/plan.pdf`).save('doc');
  await bucket.file(`clients/${id}/autre/garde.txt`).save('garde');
  await bucket.file(`marques/${id}/logo.png`).save('logo');
}
const existe = async (f) => (await bucket.file(f).exists())[0];

before(async () => {
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST absent : ces tests ne se lancent que sur l'émulateur");
  ({ db, bucket } = ouvrir(cible({}, process.env)));
});

test('1. Un client non marqué demo est refusé, même en simulation, et rien ne bouge', async () => {
  await peupler(REEL, { demo: false });
  const avant = await photo(`clients/${REEL}`);
  for (const argv of [[REEL, '--vider'], [REEL, '--vider', '--ecrire', '--confirmer', REEL]]) {
    const r = await lancer(argv);
    assert.equal(r.code, 1, r.texte);
    assert.match(r.texte, /pas marqué comme client de démonstration/);
  }
  assert.deepEqual(await photo(`clients/${REEL}`), avant);
  assert.ok(await existe(`clients/${REEL}/devis/af1/devis-1.pdf`));
});

test('2. Un client protégé (audrey, par identifiant ou par nom) est refusé, même marqué demo', async () => {
  await peupler('audrey');
  await peupler('vider-nom-protege', { nom: 'Audrey' });
  for (const id of ['audrey', 'vider-nom-protege']) {
    const avant = await photo(`clients/${id}`);
    for (const argv of [[id, '--vider'], [id, '--vider', '--ecrire', '--confirmer', id]]) {
      const r = await lancer(argv);
      assert.equal(r.code, 1, r.texte);
      assert.match(r.texte, /est protégé/);
    }
    assert.deepEqual(await photo(`clients/${id}`), avant);
  }
});

test('3. --vider ne se combine avec aucune option de chargement', async () => {
  for (const o of [['--metier', 'etancheur'], ['--catalogue-exemple'], ['--catalogue-depuis', 'chevalier-ia-os'], ['--completer'], ['--pdf'], ['--retirer'], ['--masquer-prix-achat']]) {
    const r = await lancer([DEMO, '--vider', ...o]);
    assert.equal(r.code, 1);
    assert.match(r.texte, /ne se combine avec aucune autre option/);
    assert.doesNotMatch(r.texte, /Base visée/);
  }
  const r = await lancer([DEMO, '--confirmer', DEMO]);
  assert.equal(r.code, 1);
  assert.match(r.texte, /--confirmer ne sert qu'avec --vider/);
});

test('4. La simulation affiche les comptes, un aperçu et « Conservé », et n\'écrit rien', async () => {
  await peupler(DEMO);
  const avant = await photo(`clients/${DEMO}`);
  const r = await lancer([DEMO, '--vider']);
  assert.equal(r.code, 0, r.texte);
  assert.match(r.texte, /devis_articles : 2 \(.*Lampe Lampar/);
  assert.match(r.texte, /devis_devis : 2/);
  assert.match(r.texte, /documents_stockes : 1 \(Plan déposé\)/); // le devis et sa sous-collection
  assert.match(r.texte, /Storage clients\/vider-demo\/devis\/ : 1 fichier/);
  assert.match(r.texte, /Storage clients\/vider-demo\/documents\/ : 1 fichier/);
  assert.match(r.texte, /--ecrire --confirmer vider-demo/);
  for (const c of ['crm_audit', 'crm_audit_avant', 'crm_actions_lancements', 'devis_compteurs', 'membres', 'mcp_limites']) assert.match(r.texte, new RegExp(`Conservé : .*${c} \\(`), c);
  assert.match(r.texte, /collection_inconnue \(inconnue, laissée telle quelle\)/);
  assert.match(r.texte, /la numérotation continue/);
  assert.match(r.texte, /SIMULATION : rien n'a été supprimé/);
  assert.deepEqual(await photo(`clients/${DEMO}`), avant);
  assert.ok(await existe(`clients/${DEMO}/devis/af1/devis-1.pdf`));
});

test('5. Sans confirmation exacte, --ecrire ne supprime rien', async () => {
  const avant = await photo(`clients/${DEMO}`);
  for (const extra of [{ argv: ['--confirmer', 'autre-chose'] }, { argv: [], lireLigne: async () => 'non' }, { argv: [] }]) {
    const r = await lancer([DEMO, '--vider', '--ecrire', ...extra.argv], extra.lireLigne ? { lireLigne: extra.lireLigne } : {});
    assert.equal(r.code, 1, r.texte);
    assert.match(r.texte, /Confirmation différente|Pas de clavier/);
    assert.match(r.texte, /Rien n'a été supprimé/);
  }
  assert.deepEqual(await photo(`clients/${DEMO}`), avant);
});

test('6. Le vidage supprime les documents marqués ET non marqués, sous-collections et PDF compris, et garde le reste', async () => {
  await peupler(AUTRE); // un autre client de démonstration : jamais touché
  const autreAvant = await photo(`clients/${AUTRE}`);
  const gardes = ['membres/alice@exemple.test', 'crm_audit/au1', 'crm_audit_avant/ab1', 'crm_actions_lancements/l1', 'devis_compteurs/global', 'crm_parametres/etapes', 'mcp_limites/l1', 'collection_inconnue/x'];
  const gardesAvant = await Promise.all(gardes.map(async (g) => JSON.stringify((await db.doc(`clients/${DEMO}/${g}`).get()).data())));
  const ficheAvant = (await db.doc(`clients/${DEMO}`).get()).data();
  const r = await lancer([DEMO, '--vider', '--ecrire', '--confirmer', DEMO]);
  assert.equal(r.code, 0, r.texte);
  assert.match(r.texte, /✔ 11 documents supprimés et 2 fichier\(s\)/);
  for (const c of ['devis_articles', 'devis_vocabulaire', 'devis_devis', 'crm_organisations', 'crm_personnes', 'crm_affaires', 'projets_projets', 'documents_stockes', 'projets_modeles']) assert.equal(await compter(DEMO, c), 0, c);
  assert.equal(await existe(`clients/${DEMO}/documents/plan.pdf`), false);
  assert.ok(await existe(`marques/${DEMO}/logo.png`), 'le dossier de marque reste');
  assert.equal((await db.doc(`clients/${DEMO}/devis_devis/d1/versions/v1`).get()).exists, false);
  assert.equal(await existe(`clients/${DEMO}/devis/af1/devis-1.pdf`), false);
  assert.ok(await existe(`clients/${DEMO}/autre/garde.txt`), 'un fichier hors de devis/ reste');
  assert.deepEqual((await db.doc(`clients/${DEMO}`).get()).data(), ficheAvant, 'la fiche du client reste');
  assert.deepEqual(await Promise.all(gardes.map(async (g) => JSON.stringify((await db.doc(`clients/${DEMO}/${g}`).get()).data()))), gardesAvant);
  assert.equal((await db.doc(`clients/${DEMO}/devis_compteurs/global`).get()).data().valeur, 7, 'le compteur est intact');
  assert.deepEqual(await photo(`clients/${AUTRE}`), autreAvant, 'un autre client n\'est jamais touché');
  assert.ok(await existe(`clients/${AUTRE}/devis/af1/devis-1.pdf`));
});

test('7. Sur un client déjà vidé : « déjà vide », et la confirmation tapée à la main (ctx.lireLigne) est acceptée', async () => {
  const r = await lancer([DEMO, '--vider', '--ecrire']);
  assert.equal(r.code, 0, r.texte);
  assert.match(r.texte, /déjà vide/);
  await db.doc(`clients/${DEMO}/crm_notes/n1`).set({ texte: 'x' });
  const r2 = await lancer([DEMO, '--vider', '--ecrire'], { lireLigne: async () => DEMO });
  assert.equal(r2.code, 0, r2.texte);
  assert.equal(await compter(DEMO, 'crm_notes'), 0);
});

test('8. Après le vidage, un jeu de métier se charge normalement (--metier etancheur --ecrire)', async () => {
  const r = await lancer([DEMO, '--metier', 'etancheur', '--ecrire']);
  assert.equal(r.code, 0, r.texte);
  assert.ok((await compter(DEMO, 'devis_articles')) >= 20);
  assert.ok((await compter(DEMO, 'crm_affaires')) > 0);
  assert.ok((await db.doc(`clients/${DEMO}/devis_compteurs/global`).get()).data().valeur > 7, 'la numérotation a continué après 7');
});
