// Console, phase 2 (28/11/2026) : chaque bâtiment se tamponne sa version (functions/src/coeur/tampon-version.js) et la Console la lit (`consoleVersions`, Jérôme seul).
// Un test par critère, le nom commence par son numéro (V1…). Les écrans sont vus dans un navigateur : tests/e2e/console.spec.js (V10 à V13).
// Les tests V2 à V5 et V8 tournent sur l'ÉMULATEUR Firestore (SDK d'administration réel : vraies transactions) ; ignorés si l'émulateur n'est pas démarré.
// Projets de démonstration propres à ce fichier, jamais de données réelles ; adresses en exemple.test.
import './_fiche-essai.js';
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, deleteApp } from '../functions/node_modules/firebase-admin/lib/esm/app/index.js';
import { getFirestore, Timestamp } from '../functions/node_modules/firebase-admin/lib/esm/firestore/index.js';
import { tamponnerVersion, versionApplication, ligneDeJournalTampon } from '../functions/src/coeur/tampon-version.js';
import { STRUCTURE_DONNEES } from '../functions/src/coeur/structure-donnees.js';
import { lireVersionsBatiments, lireBatiment, etatsBatiment, MOTIFS, NB_HISTORIQUE } from '../functions/src/console/versions.js';
import { creerAppelConsoleVersions, COMPTES_CONSOLE as LIRE_COMPTES } from '../functions/src/console/appel.js';
import { COMPTE_BOT } from './_reglages-maison-essai.js';

const racine = fileURLToPath(new URL('../', import.meta.url));
const lire = (chemin) => readFileSync(`${racine}${chemin}`, 'utf8');
const VERSION_APPLI = JSON.parse(lire('version.json')).version;
const JEROME = (await LIRE_COMPTES())[0];
const T0 = Date.parse('2026-11-28T09:00:00Z');
const HEURE = 3_600_000;

describe('V1 la version tamponnée est celle de version.json', () => {
  test('V1 versionApplication() lit la copie de version.json (functions/partage, et celle de l\'immeuble) : même valeur que version.json', (t) => {
    if (!existsSync(`${racine}functions/partage/version.json`)) { t.skip('copie absente : lancer `npm run preparer` (test:fonctions le fait)'); return; }
    assert.match(VERSION_APPLI, /^\d+\.\d+\.\d+$/);
    assert.equal(versionApplication(), VERSION_APPLI);
    assert.notEqual(versionApplication(), JSON.parse(lire('functions/package.json')).version, 'jamais la version du package des fonctions');
    if (existsSync(`${racine}functions-plateforme/serveur/partage/version.json`)) {
      assert.equal(versionApplication(new URL('../functions-plateforme/serveur/partage/version.json', import.meta.url)), VERSION_APPLI);
    }
    assert.match(lire('scripts/preparer-fonctions.js'), /copyFileSync\(join\(racine, 'version\.json'\), join\(destination, 'version\.json'\)\)/);
    assert.match(lire('scripts/preparer-fonctions.js'), /'version\.json', 'propositions\.js'\]\) \{/);
  });

  test('V1 fichier illisible ou mal formé : null (le tampon n\'écrit rien)', () => {
    assert.equal(versionApplication(new URL('./nexiste-pas.json', import.meta.url)), null);
    assert.equal(versionApplication(new URL('./package.json', import.meta.url)), '2.0.0'); // un vrai numéro est accepté (format seul)
    assert.equal(STRUCTURE_DONNEES, 1);
    assert.match(lire('functions/src/coeur/structure-donnees.js'), /À augmenter à chaque changement de la forme des données ; le script de migration du bâtiment écrit ensuite structure_base/);
  });
});

describe('V6 déclenchement : seulement la fonction planifiée horaire, des deux côtés', () => {
  for (const [fichier, appel] of [['functions/src/index.js', "from './coeur/tampon-version.js'"], ['functions-plateforme/src/index.js', "from '../serveur/src/coeur/tampon-version.js'"]]) {
    test(`V6 ${fichier} : « export const tamponVersion = onSchedule( » toutes les heures, et tamponnerVersion n'est appelé qu'à l'intérieur`, () => {
      const s = lire(fichier);
      assert.ok(s.includes(appel), 'importé depuis coeur/');
      assert.match(s, /^export const tamponVersion = onSchedule\(\n {2}\{ region: [^\n]*schedule: '0 \* \* \* \*'/m);
      assert.equal((s.match(/tamponnerVersion\(/g) || []).length, 1, 'un seul appel, dans la fonction planifiée (jamais au chargement du module)');
      const bloc = s.slice(s.indexOf('export const tamponVersion = onSchedule('));
      assert.ok(bloc.slice(0, bloc.indexOf('\n);')).includes('tamponnerVersion('));
    });
  }
  test('V6 le tampon n\'écrit jamais structure_base et ne touche qu\'à reglages_maison/version', () => {
    const s = lire('functions/src/coeur/tampon-version.js').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    assert.doesNotMatch(s, /structure_base/);
    assert.doesNotMatch(s, /firebase-admin|firebase-functions/);
    assert.equal((s.match(/db\.collection\(/g) || []).length, 1);
  });
});

describe('V5 une erreur est avalée et notée en une ligne, sans e-mail ni valeur', () => {
  test('V5 base en panne : « erreur », rien n\'est levé, une ligne de journal sans valeur', async () => {
    const lignes = [];
    const enPanne = { collection: () => { throw Object.assign(new Error(`panne ${JEROME} SECRET-123`), { name: 'FirebaseError' }); } };
    const r = await tamponnerVersion({ db: enPanne, horodatage: () => 1, version: '1.2.3', journal: (e) => lignes.push(ligneDeJournalTampon(e)) });
    assert.equal(r, 'erreur');
    assert.equal(lignes.length, 1);
    assert.ok(!/@|SECRET|panne|1\.2\.3/.test(lignes[0]), lignes[0]);
    assert.match(lignes[0], /tampon de version erreur/);
  });
  test('V5 version.json illisible : rien n\'est écrit', async () => {
    let touche = false;
    const db = { collection: () => { touche = true; throw new Error('ne doit pas être appelé'); } };
    assert.equal(await tamponnerVersion({ db, horodatage: () => 1, version: null, journal: () => {} }), 'erreur');
    assert.equal(touche, false);
  });
});

describe('V7 consoleVersions : Jérôme seul (même contrôle que consoleEtat)', () => {
  const demande = (token) => ({ auth: token === undefined ? undefined : { token }, data: {} });
  let lu = 0;
  const appel = creerAppelConsoleVersions({ lireVersions: async () => { lu += 1; return { version_reference: '9.9.9', batiments: [] }; } });
  const refus = (requete, code) => assert.rejects(() => appel(requete), (e) => e.code === code, `attendu ${code}`);

  test('V7 sans connexion, e-mail non vérifié, compte non autorisé, bot, jeton sans e-mail : refusés, sans rien lire', async () => {
    lu = 0;
    await refus(demande(undefined), 'unauthenticated');
    await refus(demande({ email: JEROME, email_verified: false }), 'permission-denied');
    await refus(demande({ email: JEROME }), 'permission-denied');
    for (const email of [COMPTE_BOT, 'editeur@client-fictif.example', 'intrus@exemple.test']) await refus(demande({ email, email_verified: true }), 'permission-denied');
    await refus(demande({ sub: 'bot', role: 'complet', email_verified: true }), 'permission-denied');
    assert.equal(lu, 0, 'aucune lecture avant le contrôle d\'identité');
  });
  test('V7 le compte de Jérôme (e-mail vérifié) est accepté', async () => {
    assert.deepEqual(await appel(demande({ email: JEROME, email_verified: true })), { version_reference: '9.9.9', batiments: [] });
    assert.deepEqual(await appel(demande({ email: JEROME.toUpperCase(), email_verified: true })), { version_reference: '9.9.9', batiments: [] });
  });
  test('V7 une panne inattendue devient un message lisible, jamais un détail technique', async () => {
    const a = creerAppelConsoleVersions({ lireVersions: async () => { throw new Error('détail technique'); } });
    await assert.rejects(() => a(demande({ email: JEROME, email_verified: true })), (e) => e.code === 'internal' && !/technique/.test(e.message));
  });
  test('V7 index.js : consoleVersions tourne avec le compte des automatisations (constante), réservée à Jérôme', () => {
    const s = lire('functions/src/index.js');
    assert.match(s, /^export const consoleVersions = onCall\(\n {2}\{ region: 'europe-west9', [^\n]*serviceAccount: COMPTE_AUTOMATISATIONS \}/m);
    assert.ok(!lire('functions-plateforme/src/index.js').includes('consoleVersions'), 'absente de l\'immeuble');
    assert.match(lire('tests/ecarts-fonctions.test.js'), /consoleVersions: 'normal/);
    assert.match(lire('.github/A-FAIRE.md'), /consoleVersions/);
  });
});

describe('V8 états d\'un bâtiment (sans base)', () => {
  test('V8 version : à jour, en retard, inconnue ; structure : inconnue tant que structure_base manque', () => {
    const frais = { vu_le: new Date(T0 - HEURE).toISOString() };
    const o = { maintenant: T0 };
    assert.deepEqual(etatsBatiment({ version: '2.0.0', structure_code: 1, structure_base: null, ...frais }, '2.0.0', o), { etat_version: 'a_jour', etat_structure: 'inconnu', motif: null });
    assert.deepEqual(etatsBatiment({ version: '1.9.0', structure_code: 1, structure_base: 1, ...frais }, '2.0.0', o), { etat_version: 'en_retard', etat_structure: 'a_jour', motif: null });
    assert.deepEqual(etatsBatiment({ version: null, structure_code: 2, structure_base: 1, ...frais }, '2.0.0', o), { etat_version: 'inconnu', etat_structure: 'en_retard', motif: null });
  });
  test('V8 version de référence absente (version.json illisible sur le serveur qui répond) : « inconnu », jamais « en retard »', () => {
    assert.equal(etatsBatiment({ version: '2.0.0', structure_code: 1, structure_base: null, vu_le: new Date(T0).toISOString() }, null, { maintenant: T0 }).etat_version, 'inconnu');
    assert.equal(etatsBatiment({ version: '2.0.0', structure_code: 1, structure_base: null, vu_le: new Date(T0).toISOString() }, undefined, { maintenant: T0 }).etat_version, 'inconnu');
  });
  test('V8b tampon muet : vu_le vieux de plus de 3 heures donne « inconnu » avec « le tampon ne répond plus depuis le … » ; 3 heures pile : encore à jour', () => {
    const vu = new Date(T0).toISOString(); // 28/11/2026 à 10:00 (Paris)
    const muet = etatsBatiment({ version: '2.0.0', structure_code: 1, structure_base: null, vu_le: vu }, '2.0.0', { maintenant: T0 + 3 * HEURE + 1 });
    assert.deepEqual(muet, { etat_version: 'inconnu', etat_structure: 'inconnu', motif: 'le tampon ne répond plus depuis le 28/11/2026 à 10:00' });
    assert.equal(etatsBatiment({ version: '2.0.0', structure_code: 1, structure_base: null, vu_le: vu }, '2.0.0', { maintenant: T0 + 3 * HEURE }).etat_version, 'a_jour');
  });
  test('V8c juste après une fusion : le CRM (bâtiment courant) tamponné avant le démarrage de l\'instance est « en attente », pas « en retard » ; l\'immeuble reste « en retard »', () => {
    const b = { version: '1.9.0', structure_code: 1, structure_base: null, vu_le: new Date(T0 - 10 * 60_000).toISOString() };
    assert.equal(etatsBatiment(b, '2.0.0', { maintenant: T0, demarrage: T0 - 60_000, courant: true }).etat_version, 'en_attente');
    assert.equal(etatsBatiment(b, '2.0.0', { maintenant: T0, demarrage: T0 - 60_000, courant: false }).etat_version, 'en_retard');
    assert.equal(etatsBatiment(b, '2.0.0', { maintenant: T0, demarrage: T0 - 20 * 60_000, courant: true }).etat_version, 'en_retard', 'tamponné APRÈS le démarrage : vraiment en retard');
    assert.equal(etatsBatiment(b, '2.0.0', { maintenant: T0, courant: true }).etat_version, 'en_retard', 'démarrage inconnu : en retard');
  });
  test('V8 immeuble non relié (null) et lecture qui échoue : « inconnu » avec un motif lisible, jamais une erreur pour tout l\'écran', async () => {
    const enPanne = { collection: () => { throw new Error('refusé'); } };
    const r = await lireVersionsBatiments({ dbOs: () => enPanne, dbApp: async () => null, reference: '2.0.0' });
    assert.deepEqual(r.batiments.map((b) => [b.cle, b.etat_version, b.etat_structure, b.motif]), [['os', 'inconnu', 'inconnu', MOTIFS.illisible], ['immeuble', 'inconnu', 'inconnu', MOTIFS.non_relie]]);
    const r2 = await lireVersionsBatiments({ dbOs: () => { throw new Error('x'); }, dbApp: async () => { throw new Error('y'); }, reference: null });
    assert.deepEqual(r2.batiments.map((b) => b.motif), [MOTIFS.illisible, MOTIFS.illisible]);
    assert.equal((await lireBatiment('os', null, '2.0.0')).etat_version, 'inconnu');
  });
});

const emulateur = process.env.FIRESTORE_EMULATOR_HOST;
describe('V2 à V4, V8 tampon et lecture sur Firestore (émulateur)', { skip: emulateur ? false : 'émulateur Firestore non démarré (lancer npm run test:module console)' }, () => {
  const PROJET_OS = 'demo-console-versions-os';
  const PROJET_APP = 'demo-console-versions-app';
  let appOs; let appApp; let dbOs; let dbApp;
  let t = T0;
  const horodatage = () => Timestamp.fromMillis(t);
  const tamponner = (db, extra = {}) => tamponnerVersion({ db, horodatage, journal: () => {}, ...extra });
  const fiche = async (db) => (await db.doc('reglages_maison/version').get()).data();
  const historique = async (db) => (await db.collection('reglages_maison/version/historique').orderBy('le').get()).docs.map((d) => d.data());

  before(() => {
    appOs = initializeApp({ projectId: PROJET_OS }, 'test-versions-os');
    appApp = initializeApp({ projectId: PROJET_APP }, 'test-versions-app');
    dbOs = getFirestore(appOs); dbApp = getFirestore(appApp);
  });
  after(async () => { await deleteApp(appOs); await deleteApp(appApp); });
  beforeEach(async () => {
    t = T0;
    for (const db of [dbOs, dbApp]) await db.recursiveDelete(db.collection('reglages_maison'));
  });

  test('V2 premier tampon : la fiche reçoit version, version_depuis, structure_code, vu_le (jamais structure_base) et une ligne d\'historique', async () => {
    assert.equal(await tampon(dbOs, '2.59.0'), 'change');
    const f = await fiche(dbOs);
    assert.deepEqual(Object.keys(f).sort(), ['structure_code', 'version', 'version_depuis', 'vu_le']);
    assert.equal(f.version, '2.59.0');
    assert.equal(f.structure_code, STRUCTURE_DONNEES);
    assert.equal(f.version_depuis.toMillis(), T0);
    assert.deepEqual((await historique(dbOs)).map((h) => [h.version, h.de_version, h.le.toMillis()]), [['2.59.0', null, T0]]);
    assert.deepEqual((await dbOs.collection('reglages_maison').listDocuments()).map((d) => d.id), ['version'], 'aucune autre fiche touchée');
  });

  test('V3 même version et même structure : seulement vu_le (pas de ligne d\'historique, structure_base gardé)', async () => {
    await tampon(dbOs, '2.59.0');
    await dbOs.doc('reglages_maison/version').update({ structure_base: 1 }); // posé par un futur script de migration
    t = T0 + HEURE;
    assert.equal(await tampon(dbOs, '2.59.0'), 'vu');
    const f = await fiche(dbOs);
    assert.equal(f.vu_le.toMillis(), T0 + HEURE);
    assert.equal(f.version_depuis.toMillis(), T0);
    assert.equal(f.structure_base, 1);
    assert.equal((await historique(dbOs)).length, 1);
  });

  test('V4 nouvelle version ou nouvelle structure : la fiche change et une ligne { version, de_version, le } s\'ajoute (transaction)', async () => {
    await tampon(dbOs, '2.58.0');
    await dbOs.doc('reglages_maison/version').update({ structure_base: 1 });
    t = T0 + HEURE;
    assert.equal(await tampon(dbOs, '2.59.0'), 'change');
    let f = await fiche(dbOs);
    assert.equal(f.version, '2.59.0');
    assert.equal(f.version_depuis.toMillis(), T0 + HEURE);
    assert.equal(f.structure_base, 1, 'structure_base jamais écrit par le tampon');
    t = T0 + 2 * HEURE;
    assert.equal(await tamponnerVersion({ db: dbOs, horodatage, journal: () => {}, version: '2.59.0', structure: 2 }), 'change');
    f = await fiche(dbOs);
    assert.equal(f.structure_code, 2);
    assert.equal(f.version_depuis.toMillis(), T0 + HEURE, 'même version : « depuis » ne bouge pas');
    assert.deepEqual((await historique(dbOs)).map((h) => [h.version, h.de_version, h.structure_code, h.de_structure]), [['2.58.0', null, 1, null], ['2.59.0', '2.58.0', 1, 1], ['2.59.0', '2.59.0', 2, 1]], 'structure seule : la ligne porte structure_code et de_structure');
  });

  test('V8 consoleVersions lit le CRM et l\'immeuble : états, 10 derniers changements, aucun nom de projet', async () => {
    for (let i = 0; i < 12; i += 1) { t = T0 + i * HEURE; await tampon(dbOs, `2.${40 + i}.0`); }
    t = T0 + 10 * HEURE; await tampon(dbApp, '2.50.0'); // tamponné il y a 1 h : pas muet
    const r = await lireVersionsBatiments({ dbOs: () => dbOs, dbApp: async () => dbApp, reference: '2.51.0', maintenant: T0 + 11 * HEURE });
    assert.equal(r.version_reference, '2.51.0');
    const [os, immeuble] = r.batiments;
    assert.deepEqual(Object.keys(os).sort(), ['cle', 'depuis', 'etat_structure', 'etat_version', 'historique', 'motif', 'structure_base', 'structure_code', 'version', 'vu_le']);
    assert.deepEqual([os.cle, os.version, os.etat_version, os.etat_structure, os.motif], ['os', '2.51.0', 'a_jour', 'inconnu', null]);
    assert.equal(os.depuis, new Date(T0 + 11 * HEURE).toISOString());
    assert.equal(os.historique.length, NB_HISTORIQUE);
    assert.deepEqual(os.historique[0], { version: '2.51.0', de_version: '2.50.0', structure_code: 1, de_structure: 1, le: new Date(T0 + 11 * HEURE).toISOString() }, 'le plus récent en premier');
    assert.deepEqual([immeuble.cle, immeuble.version, immeuble.etat_version], ['immeuble', '2.50.0', 'en_retard']);
    assert.ok(!/demo-console|chevalier-ia-/.test(JSON.stringify(r)), 'jamais de nom de projet');
    await dbApp.recursiveDelete(dbApp.collection('reglages_maison'));
    const vide = (await lireVersionsBatiments({ dbOs: () => dbOs, dbApp: async () => dbApp, reference: '2.51.0', maintenant: T0 + 11 * HEURE })).batiments[1];
    assert.deepEqual([vide.version, vide.etat_version, vide.motif, vide.historique], [null, 'inconnu', MOTIFS.sans_tampon, []]);
  });

  async function tampon(db, version) { return tamponner(db, { version }); }
});
