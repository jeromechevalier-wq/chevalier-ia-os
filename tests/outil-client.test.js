// Tests des outils d'administration de la plateforme (chantier 13) : scripts/plateforme/nouveau-client.js et donnees-client.js.
// ÉMULATEURS Firestore + Storage seulement (projet demo-chevalier-ia-os) : jamais la vraie base. Lancé par « npm run test:outil-client ».
// Les lectures « comme un utilisateur » passent par les VRAIES règles (firestore.plateforme.rules, storage.plateforme.rules).
import assert from 'node:assert/strict';
import { test, describe, before, after, beforeEach } from 'node:test';
import { mkdtempSync, writeFileSync, existsSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, getDocs, collection, setLogLevel } from 'firebase/firestore';
import { ref, getBytes } from 'firebase/storage';
import { createRequire } from 'node:module';
import { executerNouveauClient } from '../scripts/plateforme/nouveau-client.js';
import { executerDonneesClient } from '../scripts/plateforme/donnees-client.js';
import { cible, ouvrir } from '../scripts/plateforme/commun.js';

setLogLevel('error');

// Même exemplaire de firebase-admin que les outils (installé dans scripts/plateforme).
const { Timestamp } = createRequire(new URL('../scripts/plateforme/package.json', import.meta.url))('firebase-admin/firestore');

const PROJET = 'demo-chevalier-ia-os';
const racine = fileURLToPath(new URL('..', import.meta.url));
const lire = (f) => readFileSync(join(racine, f), 'utf8');
const [hoteF, portF] = (process.env.FIRESTORE_EMULATOR_HOST || '127.0.0.1:8080').split(':');
const [hoteS, portS] = (process.env.FIREBASE_STORAGE_EMULATOR_HOST || '127.0.0.1:9199').split(':');
const ALICE = 'alice@exemple.test';
const BOB = 'bob@exemple.test';
const ZOE = 'zoe@exemple.test';

let env;
let admin;
let dossier;

const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.from('image-fictive')]);
const JPG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.from('autre-image-fictive')]);
function fichier(nom, contenu) { const p = join(dossier, nom); writeFileSync(p, contenu); return p; }

/** Lance un outil en mémoire : renvoie { code, texte }. */
async function lancer(outil, argv, extra = {}) {
  const lignes = [];
  const ctx = { out: (l = '') => lignes.push(l), env: process.env, ...extra };
  const code = await (outil === 'nc' ? executerNouveauClient : executerDonneesClient)(argv, ctx);
  return { code, texte: lignes.join('\n') };
}
// Le dossier de stockage par défaut des tests de règles est « <projet>.appspot.com » : on l'indique aux outils avec --bucket.
const BUCKET = `${PROJET}.appspot.com`;
const nc = (...argv) => lancer('nc', [...argv, '--bucket', BUCKET]);
const dc = (argv, extra) => lancer('dc', [...argv, '--bucket', BUCKET], extra);

const lireDoc = async (chemin) => { const s = await admin.db.doc(chemin).get(); return s.exists ? s.data() : null; };
const nombreSous = async (client) => (await admin.db.collection('clients').doc(client).listCollections()).length;
async function tout() {
  // Photographie de tout ce que l'émulateur contient (pour prouver qu'une commande n'a rien écrit).
  const docs = [];
  for (const racineCol of ['clients', 'marques']) {
    for (const r of await admin.db.collection(racineCol).listDocuments()) {
      const marcher = async (d) => {
        const s = await d.get();
        if (s.exists) docs.push([d.path, JSON.stringify(s.data())]);
        for (const c of await d.listCollections()) for (const x of await c.listDocuments()) await marcher(x);
      };
      await marcher(r);
    }
  }
  const [fichiers] = await admin.bucket.getFiles();
  return JSON.stringify({ docs: docs.sort(), fichiers: fichiers.map((f) => f.name).sort() });
}

const CREATION = (id, ...plus) => ['nc', id, '--nom', 'Client fictif', '--couleur', '#336699', '--accueil', 'Bienvenue chez nous', '--membre', `${ALICE}:editeur`, '--membre', `${BOB}:lecteur`, '--modules', 'affaires,projets', ...plus].slice(1);

before(async () => {
  dossier = mkdtempSync(join(tmpdir(), 'outil-client-'));
  assert.ok(process.env.FIRESTORE_EMULATOR_HOST, "FIRESTORE_EMULATOR_HOST absent : ces tests ne se lancent que sur l'émulateur");
  assert.ok(process.env.FIREBASE_STORAGE_EMULATOR_HOST, 'FIREBASE_STORAGE_EMULATOR_HOST absent');
  assert.equal(cible({}, process.env).emulateur, true);
  admin = ouvrir(cible({ bucket: BUCKET }, process.env));
  env = await initializeTestEnvironment({
    projectId: PROJET,
    firestore: { rules: lire('firestore.plateforme.rules'), host: hoteF, port: Number(portF) },
    storage: { rules: lire('storage.plateforme.rules'), host: hoteS, port: Number(portS) },
  });
});
after(async () => { await env?.cleanup(); rmSync(dossier, { recursive: true, force: true }); });
beforeEach(async () => {
  await env.clearFirestore();
  await admin.bucket.deleteFiles({ prefix: 'marques/', force: true }); // clearStorage() ne vide que le dossier par défaut
});

describe('nouveau client : création et lecture par les vraies règles', () => {
  test('N1 création complète, puis un membre lit sa marque et ses données, un non-membre est refusé', async () => {
    const logo = fichier('logo.png', PNG);
    const i1 = fichier('a.jpg', JPG);
    const r = await nc(...CREATION('demo1', '--logo', logo, '--images', i1, '--ecrire'));
    assert.equal(r.code, 0, r.texte);
    assert.match(r.texte, /✔ créé marques\/demo1/);

    const marque = await lireDoc('marques/demo1');
    assert.equal(marque.actif, true);
    assert.equal(marque.nom, 'Client fictif');
    assert.equal(marque.couleur, '#336699');
    assert.match(marque.logo, /^https:\/\/firebasestorage\.googleapis\.com\/v0\/b\/.+\/o\/marques%2Fdemo1%2Flogo\.png\?alt=media$/);
    assert.equal(marque.images.length, 1);
    assert.deepEqual(await lireDoc('clients/demo1'), { nom: 'Client fictif', modules: { affaires: true, projets: true, automatisations: false, veille: false, tableaudebord: false, devis: false, mcp: false }, equipe: [{ email: ALICE, role: 'editeur' }, { email: BOB, role: 'lecteur' }] });
    assert.deepEqual(await lireDoc(`clients/demo1/membres/${ALICE}`), { role: 'editeur' });
    assert.deepEqual(await lireDoc(`clients/demo1/membres/${BOB}`), { role: 'lecteur' });
    await admin.db.doc('clients/demo1/crm_personnes/p1').set({ nom: 'Personne inventée' });

    const alice = env.authenticatedContext('u-alice', { email: ALICE, email_verified: true }).firestore();
    const zoe = env.authenticatedContext('u-zoe', { email: ZOE, email_verified: true }).firestore();
    const anonyme = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anonyme, 'marques/demo1'))); // la page de connexion se lit sans compte
    await assertSucceeds(getDoc(doc(alice, 'clients/demo1')));
    await assertSucceeds(getDoc(doc(alice, `clients/demo1/membres/${ALICE}`)));
    await assertSucceeds(getDocs(collection(alice, 'clients/demo1/crm_personnes')));
    await assertFails(getDoc(doc(zoe, 'clients/demo1')));
    await assertFails(getDocs(collection(zoe, 'clients/demo1/crm_personnes')));
    await assertFails(getDoc(doc(zoe, `clients/demo1/membres/${ALICE}`)));
    const bob = env.authenticatedContext('u-bob', { email: BOB, email_verified: true }).firestore();
    await assertSucceeds(getDocs(collection(bob, 'clients/demo1/crm_personnes'))); // lecteur : lit
    // les images sont lisibles sans connexion (règles Storage)
    await assertSucceeds(getBytes(ref(env.unauthenticatedContext().storage(`gs://${BUCKET}`), 'marques/demo1/logo.png')));
    await assertSucceeds(getBytes(ref(env.unauthenticatedContext().storage(`gs://${BUCKET}`), 'marques/demo1/image-1.jpg')));
  });

  test("N2 la simulation (par défaut) n'écrit rien et le dit", async () => {
    const avant = await tout();
    const r = await nc(...CREATION('demo2', '--logo', fichier('l.png', PNG)));
    assert.equal(r.code, 0, r.texte);
    assert.match(r.texte, /SIMULATION/);
    assert.match(r.texte, /CRÉER +marques\/demo2/);
    assert.match(r.texte, /ENVOYER +marques\/demo2\/logo\.png/);
    assert.match(r.texte, new RegExp(`CRÉER +clients/demo2/membres/${ALICE}`));
    assert.equal(await tout(), avant);
    const hors = await nc(...CREATION('demo2'), '--hors-ligne');
    assert.equal(hors.code, 0, hors.texte);
    assert.equal(await tout(), avant);
  });

  test('N3 entrées invalides : tout est refusé avant la moindre écriture', async () => {
    const avant = await tout();
    const gros = fichier('gros.png', Buffer.concat([PNG, Buffer.alloc(2 * 1024 * 1024)]));
    const faux = fichier('faux.png', Buffer.from('ce nest pas une image'));
    const svg = fichier('d.svg', Buffer.from('<svg/>'));
    const ok = fichier('ok.png', PNG);
    const base = ['--nom', 'N', '--membre', `${ALICE}:editeur`];
    const cas = [
      [['', ...base], /vide/],
      [['Mauvais', ...base], /pas valide/],
      [['a b', ...base], /pas valide/],
      [['../x', ...base], /pas valide/],
      [['a/b', ...base], /pas valide/],
      [['*', ...base], /pas valide/],
      [['-debut', ...base], /pas valide/],
      [['x'.repeat(41), ...base], /pas valide/],
      [['marques', ...base], /réservé/],
      [['clients', ...base], /réservé/],
      [['c1', '--nom', 'N', '--membre', `${ALICE}:editeur`, '--couleur', 'rouge'], /Couleur/],
      [['c1', '--nom', 'N', '--membre', `${ALICE}:editeur`, '--couleur', '#12345'], /Couleur/],
      [['c1', '--nom', 'N', '--membre', 'Alice@exemple.test:editeur'], /minuscules/],
      [['c1', '--nom', 'N', '--membre', 'pas-un-mail:editeur'], /adresse e-mail/],
      [['c1', '--nom', 'N', '--membre', `${ALICE}:patron`], /Rôle/],
      [['c1', '--nom', 'N', '--membre', ALICE], /adresse:rôle/],
      [['c1', '--nom', 'N', '--membre', `${ALICE}:editeur`, '--membre', `${ALICE}:lecteur`], /deux fois/],
      [['c1', '--nom', 'N'], /Au moins un --membre/],
      [['c1', '--membre', `${ALICE}:editeur`], /--nom est obligatoire/],
      [['c1', ...base, '--modules', 'compta'], /Module inconnu/],
      [['c1', ...base, '--modules', 'projets'], /ne peut pas être activé sans/],
      [['c1', ...base, '--images', 'a,b,c,d,e'], /4 images au plus/],
      [['c1', ...base, '--logo', join(dossier, 'absent.png')], /introuvable/],
      [['c1', ...base, '--logo', gros], /Mo/],
      [['c1', ...base, '--logo', faux], /ne correspond pas/],
      [['c1', ...base, '--logo', svg], /pas une image acceptée/],
      [['c1', ...base, '--images', `${ok},${gros}`], /--images n° 2/],
      [['c1', ...base, '--accueil', 'x'.repeat(501)], /500 caractères/],
      [['c1', ...base, '--inconnue', 'x'], /Option inconnue/],
      [['c1', ...base, 'en-trop'], /Argument en trop/],
      [['c1', ...base, '--projet', 'chevalier-ia-os'], /CRM de Jérôme/],
    ];
    for (const [argv, motif] of cas) {
      const r = await nc(...argv, '--ecrire');
      assert.equal(r.code, 1, `devait être refusé : ${argv.join(' ')}\n${r.texte}`);
      assert.match(r.texte, motif, argv.join(' '));
      assert.match(r.texte, /Rien n'a été écrit/);
    }
    assert.equal(await tout(), avant);
  });

  test('N4 idempotence : un client existant est refusé, --mettre-a-jour ne change que ce qui est demandé', async () => {
    assert.equal((await nc(...CREATION('demo4', '--ecrire'))).code, 0);
    const apres = await tout();

    const deux = await nc(...CREATION('demo4', '--ecrire'));
    assert.equal(deux.code, 1);
    assert.match(deux.texte, /existe déjà/);
    assert.equal(await tout(), apres);

    const pareil = await nc(...CREATION('demo4', '--mettre-a-jour', '--ecrire'));
    assert.equal(pareil.code, 0, pareil.texte);
    assert.match(pareil.texte, /Rien à changer/);
    assert.equal(await tout(), apres);

    const maj = await nc('demo4', '--mettre-a-jour', '--couleur', '#112233', '--ecrire');
    assert.equal(maj.code, 0, maj.texte);
    const marque = await lireDoc('marques/demo4');
    assert.equal(marque.couleur, '#112233');
    assert.equal(marque.nom, 'Client fictif');
    assert.equal(marque.accueil, 'Bienvenue chez nous');
    assert.deepEqual(await lireDoc(`clients/demo4/membres/${BOB}`), { role: 'lecteur' });

    const absent = await nc('inconnu1', '--mettre-a-jour', '--couleur', '#112233', '--ecrire');
    assert.equal(absent.code, 1);
    assert.match(absent.texte, /n'existe pas/);
    assert.equal(await lireDoc('marques/inconnu1'), null);
  });

  test("N5 un client qui n'a que des données (sans fiche de marque) compte comme existant", async () => {
    await admin.db.doc('clients/demo5/crm_personnes/p').set({ nom: 'x' });
    const r = await nc(...CREATION('demo5', '--ecrire'));
    assert.equal(r.code, 1);
    assert.match(r.texte, /existe déjà/);
    assert.equal(await lireDoc('marques/demo5'), null);
  });

  test("N6 remplacer le logo retire l'ancien fichier, les autres clients ne bougent pas", async () => {
    assert.equal((await nc(...CREATION('demo6', '--logo', fichier('l1.png', PNG), '--ecrire'))).code, 0);
    assert.equal((await nc(...CREATION('demo6bis', '--logo', fichier('l2.png', PNG), '--ecrire'))).code, 0);
    const r = await nc('demo6', '--mettre-a-jour', '--logo', fichier('l3.jpg', JPG), '--ecrire');
    assert.equal(r.code, 0, r.texte);
    const [fichiers] = await admin.bucket.getFiles({ prefix: 'marques/' });
    assert.deepEqual(fichiers.map((f) => f.name).sort(), ['marques/demo6/logo.jpg', 'marques/demo6bis/logo.png']);
    assert.match((await lireDoc('marques/demo6')).logo, /logo\.jpg/);
  });
});

describe('nouveau client : commandes annexes', () => {
  beforeEach(async () => { assert.equal((await nc(...CREATION('annexe', '--ecrire'))).code, 0); });

  test('A1 ajouter, changer le rôle, retirer un membre', async () => {
    const ajout = await nc('ajouter-membre', 'annexe', `${ZOE}:lecteur`);
    assert.match(ajout.texte, /SIMULATION/);
    assert.equal(await lireDoc(`clients/annexe/membres/${ZOE}`), null);
    assert.equal((await nc('ajouter-membre', 'annexe', `${ZOE}:lecteur`, '--ecrire')).code, 0);
    assert.deepEqual(await lireDoc(`clients/annexe/membres/${ZOE}`), { role: 'lecteur' });
    const doublon = await nc('ajouter-membre', 'annexe', `${ZOE}:editeur`, '--ecrire');
    assert.equal(doublon.code, 1);
    assert.match(doublon.texte, /changer-role/);
    assert.equal((await nc('ajouter-membre', 'annexe', `${ZOE}:lecteur`, '--ecrire')).code, 0); // même rôle : rien à changer
    assert.equal((await nc('changer-role', 'annexe', `${ZOE}:editeur`, '--ecrire')).code, 0);
    assert.deepEqual(await lireDoc(`clients/annexe/membres/${ZOE}`), { role: 'editeur' });
    assert.equal((await nc('changer-role', 'annexe', 'inconnu@exemple.test:editeur', '--ecrire')).code, 1);
    assert.equal((await nc('retirer-membre', 'annexe', ZOE, '--ecrire')).code, 0);
    assert.equal(await lireDoc(`clients/annexe/membres/${ZOE}`), null);
    assert.equal((await nc('retirer-membre', 'annexe', ZOE, '--ecrire')).code, 1);
    // il reste Alice et Bob
    assert.deepEqual(await lireDoc(`clients/annexe/membres/${ALICE}`), { role: 'editeur' });
    // Règle : le dernier éditeur ne peut jamais être retiré, ni rétrogradé en lecteur (même avec --ecrire : rien n'est écrit)
    const dernier = await nc('retirer-membre', 'annexe', ALICE, '--ecrire');
    assert.equal(dernier.code, 1);
    assert.match(dernier.texte, /dernier éditeur/);
    assert.deepEqual(await lireDoc(`clients/annexe/membres/${ALICE}`), { role: 'editeur' });
    const retrograde = await nc('changer-role', 'annexe', `${ALICE}:lecteur`, '--ecrire');
    assert.equal(retrograde.code, 1);
    assert.match(retrograde.texte, /dernier éditeur/);
    assert.deepEqual(await lireDoc(`clients/annexe/membres/${ALICE}`), { role: 'editeur' });
    // avec un autre éditeur, on peut retirer le premier
    assert.equal((await nc('ajouter-membre', 'annexe', `${BOB}:editeur`, '--ecrire')).code, 1, 'Bob est déjà lecteur : changer-role');
    assert.equal((await nc('changer-role', 'annexe', `${BOB}:editeur`, '--ecrire')).code, 0);
    assert.equal((await nc('retirer-membre', 'annexe', ALICE, '--ecrire')).code, 0);
    assert.equal(await lireDoc(`clients/annexe/membres/${ALICE}`), null);
  });

  test('A1b la liste des membres (équipe) est recopiée dans la fiche du client : adresse et rôle seulement, pour « Confiée à »', async () => {
    const equipe = (await lireDoc('clients/annexe')).equipe;
    assert.deepEqual(equipe, [{ email: ALICE, role: 'editeur' }, { email: BOB, role: 'lecteur' }]);
    assert.equal((await nc('ajouter-membre', 'annexe', `${ZOE}:editeur`, '--ecrire')).code, 0);
    assert.deepEqual((await lireDoc('clients/annexe')).equipe.map((m) => [m.email, m.role]), [[ALICE, 'editeur'], [BOB, 'lecteur'], [ZOE, 'editeur']]);
    assert.equal((await nc('retirer-membre', 'annexe', ZOE, '--ecrire')).code, 0);
    assert.deepEqual((await lireDoc('clients/annexe')).equipe.map((m) => m.email), [ALICE, BOB], 'un membre retiré sort de la liste');
  });

  test('A2 activer et désactiver un module (projets exige affaires)', async () => {
    assert.equal((await nc('desactiver-module', 'annexe', 'projets', '--ecrire')).code, 0);
    assert.deepEqual((await lireDoc('clients/annexe')).modules, { affaires: true, projets: false, automatisations: false, veille: false, tableaudebord: false, devis: false, mcp: false });
    const refus = await nc('desactiver-module', 'annexe', 'affaires', '--ecrire'); // projets est déjà off : permis
    assert.equal(refus.code, 0);
    assert.deepEqual((await lireDoc('clients/annexe')).modules, { affaires: false, projets: false, automatisations: false, veille: false, tableaudebord: false, devis: false, mcp: false });
    const sans = await nc('activer-module', 'annexe', 'projets', '--ecrire');
    assert.equal(sans.code, 1);
    assert.match(sans.texte, /sans : Affaires/);
    assert.equal((await nc('activer-module', 'annexe', 'affaires', '--ecrire')).code, 0);
    assert.equal((await nc('activer-module', 'annexe', 'projets', '--ecrire')).code, 0);
    const casse = await nc('desactiver-module', 'annexe', 'affaires', '--ecrire');
    assert.equal(casse.code, 1);
    assert.deepEqual((await lireDoc('clients/annexe')).modules, { affaires: true, projets: true, automatisations: false, veille: false, tableaudebord: false, devis: false, mcp: false });
    assert.equal((await nc('activer-module', 'annexe', 'compta', '--ecrire')).code, 1);
  });

  test('A2d interrupteur unique « crm » : allume et éteint affaires ET projets d\'un coup, accepté partout où un module se nomme', async () => {
    const cree = await nc('uncrm', '--nom', 'Un CRM', '--membre', `${ALICE}:editeur`, '--modules', 'crm,mcp', '--ecrire');
    assert.equal(cree.code, 0, cree.texte);
    assert.deepEqual((await lireDoc('clients/uncrm')).modules, { affaires: true, projets: true, automatisations: false, veille: false, tableaudebord: false, devis: false, mcp: true });
    assert.equal((await nc('desactiver-module', 'uncrm', 'crm', '--ecrire')).code, 0);
    assert.deepEqual((await lireDoc('clients/uncrm')).modules, { affaires: false, projets: false, automatisations: false, veille: false, tableaudebord: false, devis: false, mcp: true });
    assert.equal((await nc('activer-module', 'uncrm', 'crm', '--ecrire')).code, 0);
    assert.deepEqual((await lireDoc('clients/uncrm')).modules, { affaires: true, projets: true, automatisations: false, veille: false, tableaudebord: false, devis: false, mcp: true });
    // Un client réglé avant la 2.6.0 avec « affaires » seul : rallumé avec « crm », il gagne les projets.
    assert.equal((await nc('desactiver-module', 'uncrm', 'projets', '--ecrire')).code, 0);
    assert.equal((await lireDoc('clients/uncrm')).modules.projets, false);
    assert.equal((await nc('activer-module', 'uncrm', 'crm', '--ecrire')).code, 0);
    assert.equal((await lireDoc('clients/uncrm')).modules.projets, true);
  });

  test('A2c module « mcp » (accès d\'un assistant) : éteint par défaut, activable seul, sans dépendance ; le lien ne dépend que de cet interrupteur', async () => {
    assert.equal((await nc('activer-module', 'annexe', 'mcp', '--ecrire')).code, 0);
    assert.equal((await lireDoc('clients/annexe')).modules.mcp, true);
    assert.equal((await nc('desactiver-module', 'annexe', 'mcp', '--ecrire')).code, 0);
    assert.equal((await lireDoc('clients/annexe')).modules.mcp, false);
    const seul = await nc('seulmcp', '--nom', 'Seul MCP', '--membre', `${ALICE}:editeur`, '--modules', 'mcp', '--ecrire');
    assert.equal(seul.code, 0, seul.texte);
    assert.deepEqual((await lireDoc('clients/seulmcp')).modules, { affaires: false, projets: false, automatisations: false, veille: false, tableaudebord: false, devis: false, mcp: true });
  });

  test('A2b module « automatisations » (chantier 14, ancien nom « journal » encore accepté) : activable à la création et après coup, refusé si l\'identifiant dépasse 17 caractères (étiquette n8n de 24 au plus)', async () => {
    const court = await nc('autocourt', '--nom', 'Auto', '--membre', `${ALICE}:editeur`, '--modules', 'automatisations', '--ecrire');
    assert.equal(court.code, 0, court.texte);
    assert.deepEqual((await lireDoc('clients/autocourt')).modules, { affaires: false, projets: false, automatisations: true, veille: false, tableaudebord: false, devis: false, mcp: false });
    assert.equal((await nc('desactiver-module', 'autocourt', 'automatisations', '--ecrire')).code, 0);
    assert.equal((await nc('activer-module', 'autocourt', 'automatisations', '--ecrire')).code, 0);
    assert.equal((await lireDoc('clients/autocourt')).modules.automatisations, true);
    const dixSept = 'a'.repeat(17);
    assert.equal((await nc(dixSept, '--nom', 'Limite', '--membre', `${ALICE}:editeur`, '--modules', 'automatisations', '--ecrire')).code, 0);
    const long = 'cabinet-de-conseil-martin-et-associes';
    const refus = await nc(long, '--nom', 'Long', '--membre', `${ALICE}:editeur`, '--modules', 'automatisations', '--ecrire');
    assert.equal(refus.code, 1);
    assert.match(refus.texte, /17 caractères au plus/);
    assert.match(refus.texte, /24 caractères/);
    assert.equal(await lireDoc(`clients/${long}`), null, 'rien n\'est écrit');
    // Un client à nom long peut exister sans ce module, mais ne peut pas l'activer ensuite.
    assert.equal((await nc(long, '--nom', 'Long', '--membre', `${ALICE}:editeur`, '--modules', 'affaires', '--ecrire')).code, 0);
    const apres = await nc('activer-module', long, 'automatisations', '--ecrire');
    assert.equal(apres.code, 1);
    assert.match(apres.texte, /17 caractères au plus/);
    assert.equal((await lireDoc(`clients/${long}`)).modules.automatisations, false);
  });

  test('A2d ancien nom « journal » : accepté par l\'outil et traduit en « automatisations » ; une fiche ancienne (journal: true) est comprise et migrée à l\'écriture', async () => {
    const ancien = await nc('ancien', '--nom', 'Ancien', '--membre', `${ALICE}:editeur`, '--modules', 'journal', '--ecrire');
    assert.equal(ancien.code, 0, ancien.texte);
    assert.deepEqual((await lireDoc('clients/ancien')).modules, { affaires: false, projets: false, automatisations: true, veille: false, tableaudebord: false, devis: false, mcp: false });
    // Fiche écrite avant le renommage : seulement « journal: true ». L'outil la lit comme « automatisations actif » et ne la perd pas en activant autre chose.
    await admin.db.doc('clients/avant').set({ nom: 'Avant', modules: { affaires: true, projets: false, journal: true } });
    const afficher = await nc('afficher', 'avant');
    assert.match(afficher.texte, /automatisations/, afficher.texte);
    assert.equal((await nc('activer-module', 'avant', 'projets', '--ecrire')).code, 0);
    const apres = (await lireDoc('clients/avant')).modules;
    assert.equal(apres.automatisations, true, 'le module reste actif sous son nouveau nom');
    assert.equal(apres.projets, true);
    // Désactiver (avec l'ancien nom) : la nouvelle clé gagne sur l'ancienne qui traîne.
    assert.equal((await nc('desactiver-module', 'avant', 'journal', '--ecrire')).code, 0);
    assert.equal((await lireDoc('clients/avant')).modules.automatisations, false);
    assert.match((await nc('afficher', 'avant')).texte, /Modules actifs : (affaires, )?projets/, 'automatisations n\'est plus actif');
    assert.doesNotMatch((await nc('afficher', 'avant')).texte, /Modules actifs :.*automatisations/);
  });

  test('A3 désactiver le client rend sa page indisponible (règles réelles), le réactiver la rend', async () => {
    const anonyme = env.unauthenticatedContext().firestore();
    await assertSucceeds(getDoc(doc(anonyme, 'marques/annexe')));
    assert.equal((await nc('desactiver-client', 'annexe', '--ecrire')).code, 0);
    await assertFails(getDoc(doc(anonyme, 'marques/annexe')));
    assert.deepEqual(await lireDoc(`clients/annexe/membres/${ALICE}`), { role: 'editeur' }); // rien d'autre n'est effacé
    assert.equal((await nc('reactiver-client', 'annexe', '--ecrire')).code, 0);
    await assertSucceeds(getDoc(doc(anonyme, 'marques/annexe')));
    assert.equal((await nc('desactiver-client', 'absent9', '--ecrire')).code, 1);
  });

  test('A4 afficher ne change rien', async () => {
    const avant = await tout();
    const r = await nc('afficher', 'annexe');
    assert.equal(r.code, 0);
    assert.match(r.texte, /Modules actifs : affaires, projets/);
    assert.match(r.texte, new RegExp(`${ALICE} — editeur`));
    assert.equal(await tout(), avant);
  });

  test('A5 les commandes annexes refusent les options de création et les clients inconnus', async () => {
    assert.equal((await nc('afficher', 'annexe', '--nom', 'x')).code, 1);
    assert.equal((await nc('afficher', 'jamais-cree')).code, 1);
    assert.equal((await nc('afficher', 'marques')).code, 1);
    assert.equal((await nc('ajouter-membre', 'annexe')).code, 1);
  });
});

async function creerAvecDonnees(id, images = true) {
  const args = CREATION(id, '--ecrire');
  if (images) args.push('--logo', fichier(`${id}.png`, PNG));
  assert.equal((await nc(...args)).code, 0);
  await admin.db.doc(`clients/${id}/crm_personnes/p1`).set({ nom: 'Personne inventée', cree: Timestamp.fromDate(new Date('2026-01-02T03:04:05Z')), liste: [1, { a: 'b' }] });
  await admin.db.doc(`clients/${id}/crm_affaires/a1/notes/n1`).set({ texte: `note de ${id}` }); // sous-collection imbriquée
  await admin.db.doc(`clients/${id}/crm_affaires/a1`).set({ titre: `affaire de ${id}`, personne: admin.db.doc(`clients/${id}/crm_personnes/p1`) });
}

describe('données d\'un client : export', () => {
  test("E1 l'export ne contient que le client demandé (sous-collections et dates comprises)", async () => {
    await creerAvecDonnees('ex1');
    await creerAvecDonnees('ex10'); // même début d'identifiant : ne doit pas être pris
    await admin.db.doc('clients/ex2/crm_personnes/p9').set({ nom: 'AUTRE-CLIENT' });
    const sortie = join(dossier, 'e1.json');
    const r = await dc(['exporter', 'ex1', '--sortie', sortie, '--avec-images']);
    assert.equal(r.code, 0, r.texte);
    const texte = readFileSync(sortie, 'utf8');
    const e = JSON.parse(texte);
    assert.equal(e.client, 'ex1');
    assert.ok(e.documents.every((d) => d.chemin === 'clients/ex1' || d.chemin.startsWith('clients/ex1/')), 'un chemin hors du client');
    assert.ok(!texte.includes('ex10') && !texte.includes('AUTRE-CLIENT') && !texte.includes('ex2/'));
    const chemins = e.documents.map((d) => d.chemin);
    for (const c of ['clients/ex1', `clients/ex1/membres/${ALICE}`, `clients/ex1/membres/${BOB}`, 'clients/ex1/crm_personnes/p1', 'clients/ex1/crm_affaires/a1', 'clients/ex1/crm_affaires/a1/notes/n1']) {
      assert.ok(chemins.includes(c), `manque ${c}`);
    }
    assert.equal(e.nombreDocuments, e.documents.length);
    const p1 = e.documents.find((d) => d.chemin === 'clients/ex1/crm_personnes/p1').donnees;
    assert.deepEqual(p1.cree, { __type: 'date', secondes: Math.floor(Date.parse('2026-01-02T03:04:05Z') / 1000), nanos: 0 });
    assert.deepEqual(p1.liste, [1, { a: 'b' }]);
    assert.deepEqual(e.documents.find((d) => d.chemin === 'clients/ex1/crm_affaires/a1').donnees.personne, { __type: 'reference', chemin: 'clients/ex1/crm_personnes/p1' });
    assert.equal(e.marque.chemin, 'marques/ex1');
    assert.deepEqual(e.fichiers.map((f) => f.nom), ['marques/ex1/logo.png']);
    assert.ok(existsSync(join(dossier, 'e1-images', 'logo.png')));
  });

  test("E2 l'export refuse d'écraser un fichier, d'écrire dans le dépôt, et un client inconnu", async () => {
    await creerAvecDonnees('ex3', false);
    const sortie = join(dossier, 'e3.json');
    assert.equal((await dc(['exporter', 'ex3', '--sortie', sortie])).code, 0);
    const encore = await dc(['exporter', 'ex3', '--sortie', sortie]);
    assert.equal(encore.code, 1);
    assert.match(encore.texte, /existe déjà/);
    const dansDepot = await dc(['exporter', 'ex3', '--sortie', join(racine, 'sauvegarde-test.json')]);
    assert.equal(dansDepot.code, 1);
    assert.match(dansDepot.texte, /dossier du projet/);
    assert.ok(!existsSync(join(racine, 'sauvegarde-test.json')));
    const inconnu = await dc(['exporter', 'personne', '--sortie', join(dossier, 'p.json')]);
    assert.equal(inconnu.code, 1);
    assert.ok(!existsSync(join(dossier, 'p.json')));
  });
});

describe('données d\'un client : suppression', () => {
  async function preparer() {
    await creerAvecDonnees('sup1');
    await creerAvecDonnees('sup2');
    await admin.db.doc('crm_personnes/racine').set({ nom: 'ne doit pas bouger' });
    const sortie = join(dossier, `sup1-${Math.random().toString(36).slice(2)}.json`);
    assert.equal((await dc(['exporter', 'sup1', '--sortie', sortie, '--avec-images'])).code, 0);
    return sortie;
  }

  test('S1 garde-fous sur l\'identifiant, sans toucher à rien', async () => {
    await creerAvecDonnees('sup3');
    const avant = await tout();
    for (const id of ['', 'marques', 'clients', '*', 'sup*', 'sup3/crm_personnes', '..', 'SUP3', 'tous']) {
      const r = await dc(['supprimer', id, '--export', join(dossier, 'x.json'), '--ecrire', '--confirmer', id]);
      assert.equal(r.code, 1, `devait être refusé : « ${id} »`);
      assert.match(r.texte, /✖/);
    }
    const deux = await dc(['supprimer', 'sup3', 'sup1', '--export', join(dossier, 'x.json')]);
    assert.equal(deux.code, 1);
    assert.match(deux.texte, /Un seul client/);
    assert.equal((await dc(['supprimer', 'sup3', '--export', 'x.json', '--projet', 'chevalier-ia-os'])).code, 1);
    assert.equal(await tout(), avant);
  });

  test("S2 refus sans sauvegarde, avec la sauvegarde d'un autre client, ou périmée", async () => {
    const sortie = await preparer();
    const avant = await tout();
    const sans = await dc(['supprimer', 'sup1', '--ecrire', '--confirmer', 'sup1']);
    assert.equal(sans.code, 1);
    assert.match(sans.texte, /Sauvegarde obligatoire/);
    assert.equal((await dc(['supprimer', 'sup1', '--export', join(dossier, 'introuvable.json'), '--ecrire', '--confirmer', 'sup1'])).code, 1);
    const autre = join(dossier, 'sup2.json');
    assert.equal((await dc(['exporter', 'sup2', '--sortie', autre])).code, 0);
    const mauvais = await dc(['supprimer', 'sup1', '--export', autre, '--ecrire', '--confirmer', 'sup1']);
    assert.equal(mauvais.code, 1);
    assert.match(mauvais.texte, /celle du client « sup2 »/);
    writeFileSync(join(dossier, 'pasjson.json'), 'pas du json');
    assert.equal((await dc(['supprimer', 'sup1', '--export', join(dossier, 'pasjson.json'), '--ecrire', '--confirmer', 'sup1'])).code, 1);
    // périmée : un document créé après la sauvegarde
    await admin.db.doc('clients/sup1/crm_personnes/nouveau').set({ nom: 'après la sauvegarde' });
    const perimee = await dc(['supprimer', 'sup1', '--export', sortie, '--ecrire', '--confirmer', 'sup1']);
    assert.equal(perimee.code, 1);
    assert.match(perimee.texte, /créé depuis/);
    // … ou modifié
    await admin.db.doc('clients/sup1/crm_personnes/nouveau').delete();
    await admin.db.doc('clients/sup1/crm_personnes/p1').update({ nom: 'modifié après' });
    const modifiee = await dc(['supprimer', 'sup1', '--export', sortie, '--ecrire', '--confirmer', 'sup1']);
    assert.equal(modifiee.code, 1);
    assert.match(modifiee.texte, /modifié depuis/);
    assert.ok((await tout()).includes('modifié après'));
    assert.ok(avant.length > 0);
  });

  test("S3 la simulation compte et ne supprime rien ; sans confirmation rien n'est supprimé", async () => {
    const sortie = await preparer();
    const avant = await tout();
    const sim = await dc(['supprimer', 'sup1', '--export', sortie]);
    assert.equal(sim.code, 0, sim.texte);
    assert.match(sim.texte, /SIMULATION/);
    assert.match(sim.texte, /Documents sous clients\/sup1\/ : \d+/);
    assert.match(sim.texte, new RegExp(ALICE));
    assert.equal(await tout(), avant);

    const sansClavier = await dc(['supprimer', 'sup1', '--export', sortie, '--ecrire']);
    assert.equal(sansClavier.code, 1);
    assert.match(sansClavier.texte, /--confirmer sup1/);
    const faux = await dc(['supprimer', 'sup1', '--export', sortie, '--ecrire', '--confirmer', 'sup2']);
    assert.equal(faux.code, 1);
    assert.match(faux.texte, /rien n'est supprimé/);
    const tape = await dc(['supprimer', 'sup1', '--export', sortie, '--ecrire'], { lireLigne: async () => 'oui' });
    assert.equal(tape.code, 1);
    assert.equal(await tout(), avant);
  });

  test("S4 suppression réelle : tout le client part (sous-collections, marque, images), rien d'autre", async () => {
    const sortie = await preparer();
    const autreAvant = JSON.parse(await tout());
    const tape = await dc(['supprimer', 'sup1', '--export', sortie, '--ecrire'], { lireLigne: async (q) => { assert.match(q, /sup1/); return 'sup1'; } });
    assert.equal(tape.code, 0, tape.texte);
    assert.match(tape.texte, /✔ supprimé marques\/sup1/);
    assert.match(tape.texte, /clients\/sup1\/crm_affaires\/a1\/notes\/n1/);
    assert.match(tape.texte, /✔ supprimé fichier marques\/sup1\/logo\.png/);
    assert.match(tape.texte, /plus rien pour « sup1 »/);
    assert.ok(existsSync(`${sortie}.suppression.txt`));

    const apres = JSON.parse(await tout());
    assert.ok(!apres.docs.some(([c]) => c.includes('sup1/') || c === 'clients/sup1' || c === 'marques/sup1'));
    assert.equal(await nombreSous('sup1'), 0);
    assert.ok(!apres.fichiers.some((f) => f.includes('sup1')));
    const intacts = autreAvant.docs.filter(([c]) => !c.includes('sup1'));
    assert.deepEqual(apres.docs, intacts);
    assert.ok(apres.docs.some(([c]) => c === 'clients/sup2/crm_affaires/a1/notes/n1'));
    assert.deepEqual(apres.fichiers, ['marques/sup2/logo.png']);
    assert.deepEqual(await lireDoc('crm_personnes/racine'), { nom: 'ne doit pas bouger' });

    // Le client est parti : une seconde suppression est refusée proprement.
    const encore = await dc(['supprimer', 'sup1', '--export', sortie, '--ecrire', '--confirmer', 'sup1']);
    assert.equal(encore.code, 1);
    assert.match(encore.texte, /n'existe pas/);
  });
});

describe('lancement en ligne de commande', () => {
  test('C1 le vrai programme : aide, simulation hors ligne, refus du CRM, installation manquante', () => {
    const env2 = { ...process.env };
    const lancerCli = (...a) => spawnSync(process.execPath, [join(racine, 'scripts', 'nouveau-client.js'), ...a], { encoding: 'utf8', env: env2 });
    const aide = lancerCli('--aide');
    assert.equal(aide.status, 0);
    assert.match(aide.stdout, /Outil « nouveau client »/);
    const sim = lancerCli('cli1', '--nom', 'N', '--membre', `${ALICE}:editeur`, '--modules', 'affaires', '--hors-ligne');
    assert.equal(sim.status, 0, sim.stdout + sim.stderr);
    assert.match(sim.stdout, /SIMULATION/);
    const crm = lancerCli('cli1', '--nom', 'N', '--membre', `${ALICE}:editeur`, '--projet', 'chevalier-ia-os', '--hors-ligne');
    assert.equal(crm.status, 1);
    assert.match(crm.stdout, /CRM de Jérôme/);
    const donnees = spawnSync(process.execPath, [join(racine, 'scripts', 'donnees-client.js'), 'supprimer', 'marques'], { encoding: 'utf8', env: env2 });
    assert.equal(donnees.status, 1);
    assert.match(donnees.stdout, /réservé/);
  });
});
