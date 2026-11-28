// Console, phase 2, PR 2 (28/11/2026) : registre privé des bâtiments, relevé horaire chez Jérôme (`consoleReleve`), lecture pour l'écran (`consoleBatiments`).
// Un test par critère, le nom commence par son numéro (R1…). Les écrans sont vus dans un navigateur : tests/e2e/console.spec.js (R11 à R14).
// Les tests R5 et R7 tournent sur l'ÉMULATEUR Firestore (SDK d'administration réel : vraies transactions) ; ignorés si l'émulateur n'est pas démarré.
// Dépôt public : noms inventés génériques seulement (« Espace essai A », « projet-essai-1 »), jamais de données réelles.
import './_fiche-essai.js';
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, deleteApp } from '../functions/node_modules/firebase-admin/lib/esm/app/index.js';
import { getFirestore, Timestamp } from '../functions/node_modules/firebase-admin/lib/esm/firestore/index.js';
import { validerRegistre, MOTIF_PROJET, MAX_BATIMENTS, texteBorne } from '../functions/src/console/registre.js';
import { releverBatiments, lireFicheVersion, ligneDeJournalReleve, ecrireReleve } from '../functions/src/console/releve.js';
import { lireBatimentsConsole, MOTIFS_BATIMENTS, MAX_APPARTEMENTS } from '../functions/src/console/batiments.js';
import { creerAppelConsoleBatiments, COMPTES_CONSOLE as LIRE_COMPTES } from '../functions/src/console/appel.js';
import { MOTIF_PROJET as MOTIF_PROJET_SCRIPT } from '../scripts/donner-or-village.js';
import { lireArguments, versValeurFirestore, ficheAEcrire, resume } from '../scripts/console-registre.js';
import { modeleSchema, etagesImmeuble, boutonsBatiments, detailBatiment, tronquer, reponseBatiments, lignesReleve, projetGoogle, TEXTE_REGISTRE_VIDE, MAX_NOM_ETAGE } from '../js/modules/console/logique.js';
import { TEXTES_SCHEMA } from '../js/modules/console/schema-textes.js';
import { COMPTE_BOT } from './_reglages-maison-essai.js';

const racine = fileURLToPath(new URL('../', import.meta.url));
const lire = (chemin) => readFileSync(`${racine}${chemin}`, 'utf8');
const JEROME = (await LIRE_COMPTES())[0];

const MAISON_A = { cle: 'maison-a', nom: 'Espace essai A', genre: 'maison', etat: 'en_construction', projets: [{ role: 'Firebase', libelle: 'projet-essai-1' }, { role: 'Cloud SQL', libelle: 'Base essai' }], lecture_projet: 'projet-essai-1' };
const MAISON_B = { cle: 'maison-b', nom: 'Espace essai B', genre: 'maison', etat: 'a_venir', projets: [] };

describe('R1 validateur du registre (strict, une entrée invalide est ignorée avec un motif sans valeur)', () => {
  test('R1 fiche absente ou vide : registre vide sans motif ; forme correcte : gardée telle quelle', () => {
    assert.deepEqual(validerRegistre(null), { batiments: [], projets_os: [], projets_immeuble: [], motifs: [] });
    assert.deepEqual(validerRegistre({}), { batiments: [], projets_os: [], projets_immeuble: [], motifs: [] });
    const r = validerRegistre({ batiments: [MAISON_A, MAISON_B], projets_os: [{ role: 'Firebase', libelle: 'projet-essai-os' }] }, { projetCourant: 'projet-essai-os' });
    assert.deepEqual(r.motifs, []);
    assert.deepEqual(r.batiments.map((b) => [b.cle, b.nom, b.etat, b.projets.length, b.lecture_projet]), [['maison-a', 'Espace essai A', 'en_construction', 2, 'projet-essai-1'], ['maison-b', 'Espace essai B', 'a_venir', 0, null]]);
    assert.deepEqual(r.projets_os, [{ role: 'Firebase', libelle: 'projet-essai-os' }]);
  });

  test('R1 refusés : clés os et immeuble, doublons, clé, nom, genre, état invalides, projet à lire invalide ou égal au projet courant', () => {
    const r = validerRegistre({ batiments: [
      { ...MAISON_B, cle: 'os' }, { ...MAISON_B, cle: 'immeuble' }, MAISON_B, { ...MAISON_B, nom: 'Autre' },
      { ...MAISON_B, cle: 'Majuscule' }, { ...MAISON_B, cle: 'x'.repeat(41) }, { ...MAISON_B, cle: 'n1', nom: '' }, { ...MAISON_B, cle: 'n2', nom: 'x'.repeat(81) },
      { ...MAISON_B, cle: 'g', genre: 'immeuble' }, { ...MAISON_B, cle: 'e', etat: 'demoli' },
      { ...MAISON_B, cle: 'p1', lecture_projet: 'Projet_Invalide' }, { ...MAISON_B, cle: 'p2', lecture_projet: 'abc' }, { ...MAISON_B, cle: 'p3', lecture_projet: 'projet-essai-os' },
      'pas un objet', null,
    ] }, { projetCourant: 'projet-essai-os' });
    assert.deepEqual(r.batiments.map((b) => b.cle), ['maison-b']);
    assert.equal(r.motifs.length, 14);
    for (const raison of ['clé réservée', 'clé en double', 'clé invalide', 'nom invalide', 'genre invalide', 'état invalide', 'projet à lire invalide', 'le projet à lire est celui de Chevalier IA OS', 'forme invalide']) {
      assert.ok(r.motifs.some((m) => m.includes(raison)), raison);
    }
    assert.ok(!r.motifs.some((m) => /Espace essai|Autre|projet-essai|Majuscule|demoli/.test(m)), 'jamais une valeur lue dans un motif');
  });

  test('R1 projets invalides retirés (le bâtiment reste), bornes : 20 bâtiments, 10 projets, textes de 80 et rôles de 40 caractères', () => {
    const r = validerRegistre({ batiments: [{ ...MAISON_A, projets: [{ role: 'x'.repeat(41), libelle: 'ok' }, { role: 'ok' }, 'x', { role: 'Firebase', libelle: 'ok' }] }] });
    assert.deepEqual(r.batiments[0].projets, [{ role: 'Firebase', libelle: 'ok' }]);
    assert.equal(r.motifs.length, 3);
    const beaucoup = validerRegistre({ batiments: Array.from({ length: 25 }, (_, i) => ({ ...MAISON_B, cle: `m${i}` })) });
    assert.equal(beaucoup.batiments.length, MAX_BATIMENTS);
    assert.equal(beaucoup.motifs.length, 5);
    assert.equal(texteBorne('  Espace  '), 'Espace');
    assert.equal(texteBorne('x'.repeat(81)), null);
    assert.deepEqual(validerRegistre('texte').batiments, []);
    assert.deepEqual(validerRegistre({ batiments: 'x' }).motifs, ['bâtiments ignorés (ce n\'est pas une liste)']);
  });

  test('R1 le motif du projet à lire est celui de scripts/donner-or-village.js, et le validateur n\'importe rien (le script du Mac l\'utilise tel quel)', () => {
    assert.equal(String(MOTIF_PROJET), String(MOTIF_PROJET_SCRIPT));
    assert.doesNotMatch(lire('functions/src/console/registre.js'), /^import /m);
  });
});

describe('R2 consoleBatiments : Jérôme seul (même contrôle que consoleEtat)', () => {
  const demande = (token) => ({ auth: token === undefined ? undefined : { token }, data: {} });
  let lu = 0;
  const appel = creerAppelConsoleBatiments({ lireBatiments: async () => { lu += 1; return { maisons: [] }; } });
  const refus = (requete, code) => assert.rejects(() => appel(requete), (e) => e.code === code, `attendu ${code}`);

  test('R2 sans connexion, e-mail non vérifié, compte non autorisé, bot, jeton sans e-mail : refusés, sans rien lire', async () => {
    lu = 0;
    await refus(demande(undefined), 'unauthenticated');
    await refus(demande({ email: JEROME, email_verified: false }), 'permission-denied');
    await refus(demande({ email: JEROME }), 'permission-denied');
    for (const email of [COMPTE_BOT, 'editeur@client-fictif.example', 'intrus@exemple.test']) await refus(demande({ email, email_verified: true }), 'permission-denied');
    await refus(demande({ sub: 'bot', role: 'complet', email_verified: true }), 'permission-denied');
    assert.equal(lu, 0, 'aucune lecture avant le contrôle d\'identité');
  });
  test('R2 le compte de Jérôme (e-mail vérifié) est accepté ; une panne inattendue devient un message lisible', async () => {
    assert.deepEqual(await appel(demande({ email: JEROME, email_verified: true })), { maisons: [] });
    const a = creerAppelConsoleBatiments({ lireBatiments: async () => { throw new Error('détail technique'); } });
    await assert.rejects(() => a(demande({ email: JEROME, email_verified: true })), (e) => e.code === 'internal' && !/technique/.test(e.message));
  });
});

describe('R3 déclarations : fonctions de Jérôme seul, compte des automatisations, aucun déclenchement au chargement', () => {
  const s = lire('functions/src/index.js');
  test('R3 « export const consoleBatiments = onCall( » et « export const consoleReleve = onSchedule( » en début de ligne, compte des automatisations, absentes de l\'immeuble', () => {
    assert.match(s, /^export const consoleBatiments = onCall\(\n {2}\{ region: 'europe-west9', [^\n]*serviceAccount: COMPTE_AUTOMATISATIONS \}/m);
    assert.match(s, /^export const consoleReleve = onSchedule\(\n {2}\{ region: 'europe-west9', schedule: '15 \* \* \* \*'[^\n]*serviceAccount: COMPTE_AUTOMATISATIONS \}/m);
    const plateforme = lire('functions-plateforme/src/index.js');
    assert.ok(!plateforme.includes('consoleBatiments') && !plateforme.includes('consoleReleve'), 'absentes de l\'immeuble');
    for (const f of ['consoleBatiments', 'consoleReleve']) {
      assert.match(lire('tests/ecarts-fonctions.test.js'), new RegExp(`${f}: 'normal`), f);
      assert.match(lire('tests/maison-comptes-de-service.test.js'), new RegExp(`${f}: "automatisations-serveur@`), f);
      assert.match(lire('.github/A-FAIRE.md'), new RegExp(f), f);
    }
  });
  test('R3 releverBatiments n\'est appelé qu\'à l\'intérieur de la fonction planifiée ; le relevé n\'écrit que par la base du CRM', () => {
    assert.equal((s.match(/releverBatiments\(/g) || []).length, 1);
    const bloc = s.slice(s.indexOf('export const consoleReleve = onSchedule('));
    assert.ok(bloc.slice(0, bloc.indexOf('\n);')).includes('releverBatiments('));
    const releve = lire('functions/src/console/releve.js').replace(/\/\/.*$/gm, '');
    assert.equal((releve.match(/tx\.set\(/g) || []).length, 4, 'écritures : seulement dans la transaction sur la base du CRM');
    assert.doesNotMatch(releve, /\.delete\(|recursiveDelete|e\.message|console\.|logger\./);
    assert.doesNotMatch(lire('functions/src/console/batiments.js').replace(/\/\/.*$/gm, ''), /\.set\(|\.update\(|\.delete\(|\.create\(|e\.message/);
  });
});

describe('R4 relevé : cas sans base (sans émulateur)', () => {
  test('R4 sans immeuble relié (dbApp rend null, cas d\'une maison) : sortie sans rien écrire, sans même ouvrir la base du CRM', async () => {
    let ouvert = 0;
    const lignes = [];
    const r = await releverBatiments({ dbOs: () => { ouvert += 1; throw new Error('ne doit pas être ouvert'); }, dbApp: async () => null, ouvrirBase: () => null, horodatage: () => 1, journal: (e) => lignes.push(ligneDeJournalReleve(e)) });
    assert.equal(r.statut, 'sans_immeuble');
    assert.equal(ouvert, 0);
    assert.deepEqual(lignes, [ligneDeJournalReleve({ statut: 'sans_immeuble' })]);
  });
  test('R4 une base qui lève, rend null ou ne répond pas dans le délai : « illisible », jamais une erreur', async () => {
    assert.deepEqual(await lireFicheVersion(() => { throw new Error('refusé projet-essai-1'); }), { ok: false });
    assert.deepEqual(await lireFicheVersion(async () => null), { ok: false });
    const lente = { collection: () => ({ doc: () => ({ get: () => new Promise(() => {}) }) }) };
    assert.deepEqual(await lireFicheVersion(() => lente, 30), { ok: false });
  });
  test('R4 une panne générale est avalée : statut « erreur », une ligne de journal sans nom ni message', async () => {
    const lignes = [];
    const r = await releverBatiments({ dbOs: () => ({}), dbApp: async () => { throw Object.assign(new Error('panne projet-essai-1 maison-a'), { name: 'FirebaseError' }); }, ouvrirBase: () => null, horodatage: () => 1, journal: (e) => lignes.push(ligneDeJournalReleve(e)) });
    assert.equal(r.statut, 'erreur');
    assert.equal(lignes.length, 1);
    assert.doesNotMatch(lignes[0], /projet-essai|maison-a|panne/);
    assert.match(lignes[0], /console releve erreur/);
  });
});

describe('R6 journal : des nombres seulement, jamais une clé ni un nom', () => {
  test('R6 ligneDeJournalReleve garde statut, nombres et nom d\'erreur ; rien d\'autre', () => {
    const l = JSON.parse(ligneDeJournalReleve({ statut: 'ok', batiments: 3, injoignables: 1, cle: 'maison-a', nom: undefined, extra: 'Espace essai A' }));
    assert.deepEqual(l, { severity: 'INFO', message: 'console releve ok', batiments: 3, injoignables: 1 });
  });
});

describe('R8 script du registre (méthode de donner-or-village : REST, gcloud, essai à blanc par défaut)', () => {
  test('R8 arguments : --projet et --fichier obligatoires, --oui facultatif (sans lui : rien n\'est écrit)', () => {
    assert.deepEqual(lireArguments(['--projet', 'projet-essai-os', '--fichier', '/tmp/registre.json']), { oui: false, forcer: false, projet: 'projet-essai-os', fichier: '/tmp/registre.json' });
    assert.equal(lireArguments(['--projet', 'projet-essai-os', '--fichier', 'x', '--oui']).oui, true);
    assert.throws(() => lireArguments(['--fichier', 'x']), /--projet/);
    assert.throws(() => lireArguments(['--projet', 'projet-essai-os']), /--fichier/);
    assert.throws(() => lireArguments(['--projet', 'projet-essai-os', '--fichier', 'x', '--ecraser']), /argument inconnu/);
    const s = lire('scripts/console-registre.js');
    assert.match(s, /if \(!a\.oui\) \{ afficher\('Essai à blanc/);
    assert.match(s, /gcloud', \['auth', 'print-access-token'\]/);
    assert.doesNotMatch(s, /firebase-admin|iam\.gserviceaccount/);
  });
  test('R8 la fiche écrite est la version validée (entrées refusées retirées) ; le résumé ne contient aucune valeur', () => {
    const v = validerRegistre({ batiments: [MAISON_A, { ...MAISON_B, cle: 'os' }] }, { projetCourant: 'projet-essai-os' });
    const f = ficheAEcrire(v);
    assert.deepEqual(f.batiments.map((b) => b.cle), ['maison-a']);
    assert.equal(f.batiments[0].lecture_projet, 'projet-essai-1');
    const texte = resume(v);
    assert.match(texte, /Bâtiments valides : 1 \(en service : 0, en construction : 1, à venir : 0\)/);
    assert.match(texte, /Entrées retirées \(1\)/);
    assert.doesNotMatch(texte, /Espace essai|projet-essai|Firebase/);
    assert.deepEqual(versValeurFirestore({ a: 'x', b: [1, null], c: true }), { mapValue: { fields: { a: { stringValue: 'x' }, b: { arrayValue: { values: [{ integerValue: '1' }, { nullValue: null }] } }, c: { booleanValue: true } } } });
  });
});

describe('R9 écran : schéma, boutons et détail calculés depuis la réponse (sans navigateur)', () => {
  const apparts = (n) => Array.from({ length: n }, (_, i) => ({ id: `essai-${i + 1}`, nom: `Espace essai ${i + 1}`, modules: ['veille'] }));
  const reponse = (extra = {}) => ({ os: { projets: [] }, immeuble: { projets: [], appartements: apparts(5), total_appartements: 5 }, maisons: [MAISON_A, MAISON_B].map(({ lecture_projet, genre, ...m }) => m), releves: {}, motifs: [], ...extra });

  test('R9 réponse vide (0 appartement, registre vide) : modèle null, le schéma figé reste inchangé', () => {
    assert.equal(modeleSchema({ os: { projets: [] }, immeuble: { projets: [], appartements: [], total_appartements: 0 }, maisons: [], releves: {}, motifs: [] }), null);
    assert.equal(modeleSchema(null), null);
  });
  test('R9 immeuble : « À venir » puis tous les appartements (identifiants), le premier en bas ; noms coupés proprement', () => {
    assert.deepEqual(etagesImmeuble(apparts(2)), ['À venir', 'essai-2', 'essai-1']);
    assert.equal(etagesImmeuble([]), null);
    assert.equal(tronquer('Un nom vraiment beaucoup trop long', MAX_NOM_ETAGE), 'Un nom vraime…');
    assert.equal(tronquer('Un nom vraiment beaucoup trop long', MAX_NOM_ETAGE).length, MAX_NOM_ETAGE);
  });
  test('R9 maisons du registre à la place de « Maison client 1 » (grue si en construction, pointillés si à venir), « Maison à venir » en dernier', () => {
    const m = modeleSchema(reponse());
    assert.deepEqual(m.batiments.map((b) => [b.nom, b.genre]), [['Chevalier IA OS', 'maison'], ['Chevalier IA App', 'immeuble'], ['Espace essai A', 'chantier'], ['Espace essai B', 'avenir'], ['Maison à venir', 'avenir']]);
    assert.deepEqual(m.batiments[2].nuage, ['Cloud SQL', 'les données']);
    assert.deepEqual(m.batiments[3].legende, ['À venir']);
    const sansMaison = modeleSchema(reponse({ maisons: [] }));
    assert.deepEqual(sansMaison.batiments.map((b) => b.nom), ['Chevalier IA OS', 'Chevalier IA App', 'Maison client 1', 'Maison à venir']);
  });
  test('R9 boutons : Chevalier IA OS, Chevalier IA App, chaque appartement, chaque maison', () => {
    assert.deepEqual(boutonsBatiments(reponse()).map((b) => `${b.type}:${b.libelle}`), ['os:Chevalier IA OS', 'immeuble:Chevalier IA App',
      ...apparts(5).map((a) => `appartement:${a.id}`), 'maison:Espace essai A', 'maison:Espace essai B']);
    assert.deepEqual(boutonsBatiments(null).map((b) => b.type), ['os', 'immeuble']);
    assert.equal(reponseBatiments({ immeuble: { appartements: apparts(40) } }).immeuble.appartements.length, 30);
  });
  test('R9 détail : nom, état, projets, modules (appartement), version, depuis, dernier contact, motif, historique (10 lignes) ; un appartement montre la version de l\'immeuble', () => {
    const releves = {
      immeuble: { version: '2.59.0', structure_code: 1, version_depuis: '2026-11-28T09:00:00.000Z', dernier_contact_ok: '2026-11-28T10:15:00.000Z', dernier_essai: '2026-11-28T10:15:00.000Z', motif: null,
        historique: Array.from({ length: 12 }, () => ({ version: '2.59.0', de_version: '2.58.0', le: '2026-11-28T09:15:00.000Z' })) },
      'maison-a': { version: null, structure_code: null, dernier_contact_ok: null, dernier_essai: '2026-11-28T10:15:00.000Z', motif: 'injoignable', historique: [] },
    };
    const r = reponse({ releves });
    const a = detailBatiment(r, 'appartement', 'essai-1');
    assert.equal(a.titre, 'Espace essai 1');
    assert.deepEqual(a.modules, ['Veille']);
    assert.equal(a.releve.lignes[0], 'Version : 2.59.0, depuis le 28/11/2026');
    assert.equal(a.releve.lignes[2], 'Vu le 28/11/2026 à 11:15 (dernier contact)');
    assert.equal(a.releve.historique.length, 10);
    const m = detailBatiment(r, 'maison', 'maison-a');
    assert.deepEqual([m.titre, m.etat, m.projets], ['Espace essai A', 'État : en construction', ['Firebase : projet-essai-1', 'Cloud SQL : Base essai']]);
    assert.equal(m.releve.motif, 'injoignable (droit de lecture absent ou bâtiment hors ligne)');
    assert.ok(m.releve.lignes.includes('Dernier essai le 28/11/2026 à 11:15'));
    assert.equal(detailBatiment(r, 'maison', 'maison-b').releve.vide, true);
    assert.equal(detailBatiment(r, 'os', 'os').titre, 'Chevalier IA OS');
    assert.equal(detailBatiment(r, 'maison', 'inconnue'), null);
    assert.deepEqual(lignesReleve(undefined), { vide: true, lignes: [], motif: null, historique: [] });
    assert.equal(TEXTE_REGISTRE_VIDE, 'Registre vide : les maisons s\'afficheront quand la fiche privée sera remplie.');
  });
  test('R9 le panneau de détail et ses textes ne sont pas dans schema.js ; le détail s\'ouvre par de vrais boutons', () => {
    assert.doesNotMatch(lire('js/modules/console/schema.js'), /Fermer|detailBatiment|Registre vide/);
    const d = lire('js/modules/console/detail.js');
    assert.match(d, /h\('button', \{\s*type: 'button'/);
    assert.match(d, /dataset: \{ action: 'fermer-detail' \}/);
    assert.match(d, /dataset: \{ action: 'reessayer-batiments' \}, onclick: reessayer \}, 'Réessayer'/);
  });
  test('R10 l\'export ajoute le registre et les relevés (une lecture en échec n\'empêche pas l\'export), jamais le projet à lire', () => {
    const exp = lire('js/modules/console/export.js');
    assert.match(exp, /lireBatiments = D\.lireBatiments/);
    assert.match(exp, /collections\.console_registre = /);
    assert.match(exp, /collections\.console_releves = /);
    assert.doesNotMatch(exp, /lecture_projet/);
  });
});

const emulateur = process.env.FIRESTORE_EMULATOR_HOST;
describe('R5 et R7 relevé et lecture sur Firestore (émulateur)', { skip: emulateur ? false : 'émulateur Firestore non démarré (lancer npm run test:module console)' }, () => {
  const T0 = Date.parse('2026-11-28T09:15:00Z');
  const HEURE = 3_600_000;
  let appOs; let appApp; let appMaison; let dbOs; let dbApp; let dbMaison;
  let t = T0;
  const horodatage = () => Timestamp.fromMillis(t);
  const tamponner = (db, version, structure = 1) => db.doc('reglages_maison/version').set({ version, structure_code: structure, version_depuis: Timestamp.fromMillis(t), vu_le: Timestamp.fromMillis(t) });
  const releve = async (cle) => (await dbOs.doc(`reglages_maison/registre_console/releves/${cle}`).get()).data();
  const historique = async (cle) => (await dbOs.collection(`reglages_maison/registre_console/releves/${cle}/historique`).orderBy('le').get()).docs.map((d) => d.data());
  const relever = (extra = {}) => releverBatiments({ dbOs: () => dbOs, dbApp: async () => dbApp, ouvrirBase: () => dbMaison, projetCourant: 'demo-console-registre-os', horodatage, ...extra });

  before(() => {
    appOs = initializeApp({ projectId: 'demo-console-registre-os' }, 'test-registre-os');
    appApp = initializeApp({ projectId: 'demo-console-registre-app' }, 'test-registre-app');
    appMaison = initializeApp({ projectId: 'demo-console-registre-maison' }, 'test-registre-maison');
    dbOs = getFirestore(appOs); dbApp = getFirestore(appApp); dbMaison = getFirestore(appMaison);
  });
  after(async () => { await deleteApp(appOs); await deleteApp(appApp); await deleteApp(appMaison); });
  beforeEach(async () => {
    t = T0;
    for (const db of [dbOs, dbApp, dbMaison]) { await db.recursiveDelete(db.collection('reglages_maison')); await db.recursiveDelete(db.collection('clients')); }
  });

  test('R5 premier relevé : la copie reçoit version, structure, depuis, dernier contact et une ligne d\'historique avec de_version null', async () => {
    await tamponner(dbOs, '2.59.0'); await tamponner(dbApp, '2.58.0');
    const r = await relever();
    assert.deepEqual(r.resultats, { os: 'change', immeuble: 'change' });
    const os = await releve('os');
    assert.deepEqual([os.version, os.structure_code, os.motif, os.dernier_contact_ok.toMillis(), os.dernier_essai.toMillis(), os.version_depuis.toMillis()], ['2.59.0', 1, null, T0, T0, T0]);
    assert.deepEqual((await historique('immeuble')).map((h) => [h.version, h.de_version, h.structure_code, h.de_structure, h.le.toMillis()]), [['2.58.0', null, 1, null, T0]]);
  });

  test('R5 pas de changement : seulement les dates du relevé, aucune ligne d\'historique ; changement de version ou de structure : une ligne', async () => {
    await tamponner(dbOs, '2.59.0'); await tamponner(dbApp, '2.59.0');
    await relever();
    t = T0 + HEURE;
    assert.deepEqual((await relever()).resultats, { os: 'vu', immeuble: 'vu' });
    assert.equal((await releve('os')).dernier_contact_ok.toMillis(), T0 + HEURE);
    assert.equal((await historique('os')).length, 1);
    t = T0 + 2 * HEURE;
    await tamponner(dbOs, '2.60.0'); await tamponner(dbApp, '2.59.0', 2);
    assert.deepEqual((await relever()).resultats, { os: 'change', immeuble: 'change' });
    assert.deepEqual((await historique('os')).map((h) => [h.version, h.de_version]), [['2.59.0', null], ['2.60.0', '2.59.0']]);
    assert.deepEqual((await historique('immeuble')).map((h) => [h.structure_code, h.de_structure]), [[1, null], [2, 1]]);
  });

  test('R5 maison du registre : relevée par son projet à lire ; injoignable = dernier_essai et motif, dernier contact inchangé, aucune erreur', async () => {
    await tamponner(dbOs, '2.59.0'); await tamponner(dbApp, '2.59.0'); await tamponner(dbMaison, '2.57.0');
    await dbOs.doc('reglages_maison/registre_console').set({ batiments: [MAISON_A, MAISON_B] });
    assert.deepEqual((await relever()).resultats, { os: 'change', immeuble: 'change', 'maison-a': 'change' }, 'la maison B n\'a pas de projet à lire');
    assert.equal((await releve('maison-a')).version, '2.57.0');
    t = T0 + HEURE;
    const lignes = [];
    const r = await relever({ ouvrirBase: () => { throw new Error('PERMISSION_DENIED projet-essai-1'); }, journal: (e) => lignes.push(ligneDeJournalReleve(e)) });
    assert.equal(r.resultats['maison-a'], 'injoignable');
    const m = await releve('maison-a');
    assert.deepEqual([m.motif, m.version, m.dernier_contact_ok.toMillis(), m.dernier_essai.toMillis()], ['injoignable', '2.57.0', T0, T0 + HEURE]);
    assert.equal((await historique('maison-a')).length, 1);
    assert.deepEqual(lignes.map((l) => JSON.parse(l)), [{ severity: 'INFO', message: 'console releve ok', batiments: 3, injoignables: 1 }]);
    assert.ok(!lignes.some((l) => /maison-a|projet-essai|Espace/.test(l)));
    assert.equal((await dbMaison.collection('reglages_maison').listDocuments()).map((d) => d.id).join(), 'version', 'rien n\'est écrit dans la maison');
    assert.equal((await dbApp.collection('reglages_maison').listDocuments()).map((d) => d.id).join(), 'version', 'rien n\'est écrit dans l\'immeuble');
  });

  test('R5 bâtiment sans tampon : contact noté, motif « sans_tampon », pas d\'historique', async () => {
    await tamponner(dbOs, '2.59.0');
    assert.equal((await relever()).resultats.immeuble, 'sans_tampon');
    const i = await releve('immeuble');
    assert.deepEqual([i.motif, i.version, i.dernier_contact_ok.toMillis()], ['sans_tampon', undefined, T0]);
    assert.equal((await historique('immeuble')).length, 0);
    assert.equal(await ecrireReleve({ dbOs, cle: 'os', lecture: { ok: false }, horodatage }), 'injoignable');
  });

  test('R7 consoleBatiments : registre, appartements (nom ou identifiant, modules actifs, identifiants invalides ignorés, 30 au plus), relevés avec 10 lignes', async () => {
    await dbOs.doc('reglages_maison/registre_console').set({ batiments: [MAISON_A, { ...MAISON_B, cle: 'os' }], projets_os: [{ role: 'Firebase', libelle: 'projet-essai-os' }] });
    await dbApp.doc('clients/essai-a').set({ nom: 'Espace essai A', modules: { veille: true, console: true } });
    await dbApp.doc('clients/essai-b').set({ modules: {} });
    await dbApp.doc('clients/Invalide_Majuscule').set({ nom: 'Refusé' });
    await dbApp.doc('clients/essai-c').set({ nom: 'x'.repeat(200) });
    for (let i = 0; i < 12; i += 1) { t = T0 + i * HEURE; await tamponner(dbOs, `2.${40 + i}.0`); await relever(); }
    const r = await lireBatimentsConsole({ dbOs: () => dbOs, dbApp: async () => dbApp, projetCourant: 'demo-console-registre-os' });
    assert.deepEqual(r.maisons, [{ cle: 'maison-a', nom: 'Espace essai A', etat: 'en_construction', projets: MAISON_A.projets }]);
    assert.ok(!JSON.stringify(r).includes('lecture_projet'), 'jamais le projet à lire dans la réponse');
    assert.equal(r.motifs.length, 1);
    assert.deepEqual(r.os.projets, [{ role: 'Firebase', libelle: 'projet-essai-os' }]);
    assert.deepEqual(r.immeuble.appartements.map((a) => [a.id, a.nom, a.modules]), [['essai-a', 'Espace essai A', ['veille']], ['essai-b', 'essai-b', []], ['essai-c', 'essai-c', []]]);
    assert.equal(r.immeuble.total_appartements, 3);
    assert.equal(r.releves.os.version, '2.51.0');
    assert.equal(r.releves.os.historique.length, 10);
    assert.equal(r.releves.os.historique[0].version, '2.51.0', 'le plus récent en premier');
    assert.equal(r.releves.os.dernier_contact_ok, new Date(T0 + 11 * HEURE).toISOString());
    assert.ok(r.releves['maison-a']); // relevée (injoignable ou non) : la maison a un projet à lire
  });

  test('R7 bornes et parties illisibles : 30 appartements au plus ; immeuble non relié ou en panne = vide + motif, jamais une erreur globale', async () => {
    for (let i = 0; i < 35; i += 1) await dbApp.doc(`clients/essai-${String(i).padStart(2, '0')}`).set({ nom: `Espace essai ${i}` });
    const r = await lireBatimentsConsole({ dbOs: () => dbOs, dbApp: async () => dbApp });
    assert.equal(r.immeuble.appartements.length, MAX_APPARTEMENTS);
    assert.equal(r.immeuble.total_appartements, 35);
    assert.deepEqual(r.maisons, []);
    const nonRelie = await lireBatimentsConsole({ dbOs: () => dbOs, dbApp: async () => null });
    assert.deepEqual([nonRelie.immeuble.appartements, nonRelie.motifs], [[], [MOTIFS_BATIMENTS.immeuble_non_relie]]);
    const enPanne = await lireBatimentsConsole({ dbOs: () => { throw new Error('x'); }, dbApp: async () => { throw new Error('y'); } });
    assert.deepEqual(enPanne.motifs, [MOTIFS_BATIMENTS.registre, MOTIFS_BATIMENTS.appartements]);
    assert.deepEqual([enPanne.maisons, enPanne.releves], [[], {}]);
  });
});

// Retouche du schéma « Architecture » (28/11/2026, demandes de Jérôme AR1 à AR7) : textes, projets Google, tous les appartements, identifiants d'espace.
describe('AR retouche du schéma « Architecture » (sans navigateur)', () => {
  const apparts = (n) => Array.from({ length: n }, (_, i) => ({ id: `essai-${i + 1}`, nom: `Espace essai ${i + 1}`, modules: [] }));
  const pleine = () => ({
    os: { projets: [{ role: 'Firebase', libelle: 'projet-essai-os' }] },
    immeuble: { projets: [{ role: 'Firebase', libelle: 'projet-essai-app' }], appartements: apparts(7), total_appartements: 7 },
    maisons: [{ cle: 'maison-a', nom: 'Maison essai A', etat: 'en_construction', projets: [{ role: 'Firebase', libelle: 'projet-essai-1' }, { role: 'Cloud SQL', libelle: 'Base essai' }] }],
    releves: {}, motifs: [],
  });
  test('AR1 nuage de Chevalier IA OS : « Firestore », « tes données », « et tes réglages »', () => {
    assert.deepEqual(TEXTES_SCHEMA.batiments[0].nuage, ['Firestore', 'tes données', 'et tes réglages']);
  });
  test('AR2 le schéma ne change pas pour la question du Firestore partagé : deux projets distincts dans .firebaserc', () => {
    const rc = JSON.parse(lire('.firebaserc'));
    assert.notEqual(rc.projects.default, rc.projects.plateforme);
    assert.equal(TEXTES_SCHEMA.batiments[1].nuage[0], 'Firestore');
  });
  test('AR3 nuage de la maison client : « Cloud SQL », « les données » (figé et registre)', () => {
    assert.deepEqual(TEXTES_SCHEMA.batiments[2].nuage, ['Cloud SQL', 'les données']);
    assert.deepEqual(modeleSchema(pleine()).batiments[2].nuage, ['Cloud SQL', 'les données']);
    assert.doesNotMatch(JSON.stringify(TEXTES_SCHEMA), /factures/);
  });
  test('AR4 boîte n8n : « n8n : automatisations », « sur VPS Hostinger » (décision de Jérôme du 28/11/2026)', () => {
    assert.deepEqual(TEXTES_SCHEMA.n8n, ['n8n : automatisations', 'sur VPS Hostinger']);
    assert.doesNotMatch(JSON.stringify(TEXTES_SCHEMA), /serveur à part/);
  });
  test('AR5 nom du projet Google sous chaque bâtiment : lu dans le registre (premier projet), jamais écrit dans le code ; absent : rien', () => {
    const m = modeleSchema(pleine());
    assert.deepEqual(m.batiments.map((b) => b.projet ?? null), ['projet-essai-os', 'projet-essai-app', 'projet-essai-1', null]);
    assert.equal(projetGoogle([]), null);
    assert.equal(projetGoogle(undefined), null);
    // Seuls les projets du CRM et de l'immeuble notés (aucun appartement, aucune maison) : le schéma les montre quand même.
    const seuls = modeleSchema({ os: { projets: [{ role: 'Firebase', libelle: 'projet-essai-os' }] }, immeuble: { projets: [], appartements: [] }, maisons: [] });
    assert.equal(seuls.batiments[0].projet, 'projet-essai-os');
    assert.equal(TEXTES_SCHEMA.batiments.some((b) => 'projet' in b), false);
    assert.doesNotMatch(lire('js/modules/console/schema.js'), /chevalier-ia-(os|app)/);
  });
  test('AR6 l\'immeuble montre TOUS les appartements (sans « et N autres ») et se rehausse autant qu\'il faut', async () => {
    const m = modeleSchema(pleine());
    assert.deepEqual(m.etages, ['À venir', ...apparts(7).map((a) => a.id).reverse()]);
    assert.equal(m.etages.some((e) => /autres/.test(e)), false);
    const { hauteurImmeuble } = await import('../js/modules/console/schema.js').catch(() => ({}));
    if (hauteurImmeuble) {
      assert.equal(hauteurImmeuble(TEXTES_SCHEMA.etages), 140);
      assert.ok(hauteurImmeuble(m.etages) >= 8 + m.etages.length * 26.5);
    }
    assert.equal(modeleSchema({ ...pleine(), immeuble: { projets: [], appartements: apparts(30), total_appartements: 30 } }).etages.length, 31);
  });
  test('AR7 appartements et boutons : l\'identifiant de l\'espace, le nom d\'affichage en infobulle', () => {
    const b = boutonsBatiments(pleine()).filter((x) => x.type === 'appartement');
    assert.deepEqual(b.map((x) => [x.libelle, x.infobulle]), apparts(7).map((a) => [a.id, a.nom]));
    assert.ok(modeleSchema(pleine()).etages.includes('essai-1'));
    assert.equal(modeleSchema(pleine()).etages.includes('Espace essai 1'), false);
    assert.match(lire('js/modules/console/detail.js'), /title: b\.infobulle \?\? b\.libelle/);
  });
});

// Deuxième retouche du schéma (28/11/2026, AR8 à AR10) : nuage Cloud SQL commun à venir, Firestore de l'immeuble, Firestore de la maison client.
describe('AR nuages du schéma « Architecture » (sans navigateur)', () => {
  test('AR8 nuage commun grisé au-dessus du CRM et de l\'immeuble : « Cloud SQL — à venir », « les données à venir »', () => {
    assert.deepEqual(TEXTES_SCHEMA.nuageCommun, ['Cloud SQL — à venir', 'les données à venir']);
    const s = lire('js/modules/console/schema.js');
    assert.match(s, /nuageCommun\(places\[0\]\.x, places\[1\]\.x, \d+, T\.nuageCommun\)/);
    assert.match(s, /const nuageCommun = [\s\S]*?el\('g', \{ class: 'console-schema-avenir' \}/);
  });
  test('AR9 nuage de Chevalier IA App : « Firestore », « les données », « et les réglages »', () => {
    assert.deepEqual(TEXTES_SCHEMA.batiments[1].nuage, ['Firestore', 'les données', 'et les réglages']);
    assert.doesNotMatch(JSON.stringify(TEXTES_SCHEMA), /tiroir/);
  });
  test('AR10 maison client : un 2e nuage « Firestore », « les réglages » (figé et registre, sauf maison à venir)', () => {
    assert.deepEqual(TEXTES_SCHEMA.batiments[2].nuage2, ['Firestore', 'les réglages']);
    assert.equal(TEXTES_SCHEMA.batiments[3].nuage2, undefined);
    const m = modeleSchema({ os: { projets: [] }, immeuble: { projets: [], appartements: [] }, maisons: [
      { cle: 'maison-a', nom: 'Maison essai A', etat: 'en_construction', projets: [{ role: 'Cloud SQL', libelle: 'Base essai' }] },
      { cle: 'maison-b', nom: 'Maison essai B', etat: 'a_venir', projets: [] },
    ] });
    assert.deepEqual(m.batiments[2].nuage2, ['Firestore', 'les réglages']);
    assert.deepEqual(m.batiments[2].nuage, ['Cloud SQL', 'les données']);
    assert.equal(m.batiments[3].nuage2, undefined);
  });
});
