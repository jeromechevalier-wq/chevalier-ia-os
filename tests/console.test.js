// Module Console (phase 0, 16/11/2026) : accès réservé à Jérôme (C1 à C4), jamais de valeur de secret (C7), Filet de sécurité (C5, C6), sélecteur (C8), export (C9).
// Les écrans (C5, C6, C8, C10) sont aussi vus dans un navigateur : tests/e2e/console.spec.js. Ici : tout ce qui se vérifie sans navigateur.
import './_fiche-essai.js'; // chantier 0 : fiche reglages_maison des essais (comptes d'avant), branchée en mémoire sur le serveur
import { avecProjet, ECRAN_ESSAI } from './_reglages-maison-essai.js';
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { readFileSync } from 'node:fs';
import { creerAppelConsole, COMPTES_CONSOLE as LIRE_COMPTES_CONSOLE } from '../functions/src/console/appel.js';
const COMPTES_CONSOLE = await LIRE_COMPTES_CONSOLE(); // chantier 0 : liste lue dans la fiche reglages_maison/maison (celle des essais : _fiche-essai.js)
import { peutVoirConsole } from '../js/modules/console/acces.js';
import { remplirComptesMaison, viderComptesMaison } from '../js/os/comptes-maison.js';
import { LIGNES_FILET, etatLigne, lignesAvecEtat, resumeFilet, texteEtat, PLATEFORMES, plateformeValide } from '../js/modules/console/logique.js';
import { IDS_MODULES, MODULES_DECLARES, modulesActifsDuClient, verifierActivation, interrupteursDuClient, moduleDeRoute } from '../js/os/registre.js';
import { MODULES, MODULES_CLIENT } from '../js/os/modules.js';

const JEROME = COMPTES_CONSOLE[0];
const demande = (token) => ({ auth: token === undefined ? undefined : { token }, data: {} });
const appel = creerAppelConsole({ version: '9.9.9' });
const refus = async (requete, code) => assert.rejects(() => appel(requete), (e) => e.code === code, `attendu ${code}`);

describe('Console : accès côté serveur (C1 à C3, C7)', () => {
  test('C1 un appel sans connexion est refusé', async () => {
    await refus(demande(undefined), 'unauthenticated');
  });

  test('C2 le compte de Jérôme (e-mail vérifié) est accepté ; le même e-mail non vérifié est refusé', async () => {
    // Chantier 0 : « plateforme » = le projet Google où tourne la fonction (chez Jérôme : chevalier-ia-os, comme avant).
    assert.deepEqual(await avecProjet('chevalier-ia-os', () => appel(demande({ email: JEROME, email_verified: true }))), { version: '9.9.9', serveur: 'ok', plateforme: 'chevalier-ia-os' });
    await refus(demande({ email: JEROME, email_verified: false }), 'permission-denied');
    await refus(demande({ email: JEROME }), 'permission-denied');
  });

  test('C3 le bot, un éditeur client, un lecteur, un jeton d\'assistant sont refusés', async () => {
    for (const email of ['jeromebot.chevalierbot@gmail.com', 'editeur@client-fictif.example', 'lecteur@client-fictif.example', 'assistant@client-fictif.example']) {
      await refus(demande({ email, email_verified: true }), 'permission-denied');
    }
    await refus(demande({ email_verified: true }), 'permission-denied'); // jeton sans e-mail (assistant OAuth)
    await refus(demande({ sub: 'bot', role: 'complet', email_verified: true }), 'permission-denied'); // le profil ne suffit pas : seule l'identité compte
  });

  test('C3 la liste de l\'écran et celle du serveur ne contiennent que Jérôme', () => {
    assert.deepEqual([...COMPTES_CONSOLE], [JEROME]);
    assert.deepEqual([...ECRAN_ESSAI.comptes_jerome_seul], [JEROME]); // chantier 0, navigateur : la liste de l'écran vient de reglages_maison/ecran
  });

  test('C7 la réponse et le journal ne contiennent aucune valeur de secret ni d\'e-mail', async () => {
    const lignes = [];
    const a = creerAppelConsole({ version: '1.0.0', journal: (e) => lignes.push(JSON.stringify(e)) });
    const r = await a(demande({ email: JEROME, email_verified: true, secret: 'FAUSSE-VALEUR-DE-SECRET' }));
    await assert.rejects(() => a(demande({ email: 'intrus@client-fictif.example', email_verified: true })));
    assert.deepEqual(Object.keys(r).sort(), ['plateforme', 'serveur', 'version']);
    assert.ok(![JSON.stringify(r), ...lignes].some((t) => /FAUSSE-VALEUR|@/.test(t)));
  });
});

describe('Console : accès côté écran et registre (C4)', () => {
  test('C4 le menu n\'est montré qu\'au compte de Jérôme', () => {
    // Chantier 0, navigateur : la liste vient de reglages_maison/ecran, lue à la connexion. Pas encore lue = personne ne voit la Console.
    viderComptesMaison();
    assert.equal(peutVoirConsole({ email: JEROME }), false, 'liste pas encore lue : jamais d\'ouverture par défaut');
    remplirComptesMaison(ECRAN_ESSAI);
    assert.equal(peutVoirConsole({ email: JEROME }), true);
    assert.equal(peutVoirConsole({ email: JEROME.toUpperCase() }), true);
    for (const c of [null, undefined, {}, { email: 'jeromebot.chevalierbot@gmail.com' }, { email: 'editeur@client-fictif.example' }, { email: 42 }]) assert.equal(peutVoirConsole(c), false);
  });

  test('C4 la Console est déclarée réservée et n\'est jamais un module de client', () => {
    const c = MODULES_DECLARES.find((m) => m.id === 'console');
    assert.equal(c.seulJerome, true);
    assert.ok(!IDS_MODULES.includes('console'));
    assert.ok(MODULES.some((m) => m.id === 'console' && m.seulJerome === true));
    assert.ok(!MODULES_CLIENT.some((m) => m.id === 'console'));
    assert.ok(!interrupteursDuClient([]).some((l) => l.id === 'console'));
    assert.equal(moduleDeRoute('console')?.id, 'console');
    assert.deepEqual(c.outilsMcp, []); // aucun outil d'assistant : la Console n'est pas pilotable par un assistant
  });

  test('C4 « modules.console: true » chez un client est refusé et n\'active rien', () => {
    const r = modulesActifsDuClient({ modules: { console: true, veille: true } });
    assert.ok(!r.actifs.includes('console'));
    assert.ok(r.actifs.includes('veille'));
    assert.ok(r.erreurs.some((e) => e.includes('console')));
    const v = verifierActivation(['console']);
    assert.equal(v.ok, false);
    assert.deepEqual(v.actifs, []);
  });

  test('C4 la fonction n\'existe que chez Jérôme (déclarée réservée) et le navigateur n\'appelle que consoleEtat', () => {
    assert.match(readFileSync(new URL('./ecarts-fonctions.test.js', import.meta.url), 'utf8'), /consoleEtat: 'normal/);
    const donnees = readFileSync(new URL('../js/modules/console/donnees.js', import.meta.url), 'utf8');
    assert.deepEqual([...donnees.matchAll(/httpsCallable\(fonctions\(\), '([A-Za-z]+)'\)/g)].map((m) => m[1]), ['consoleEtat']);
  });

  test('C4 la coque ne monte la Console que pour le compte de Jérôme', () => {
    const main = readFileSync(new URL('../js/main.js', import.meta.url), 'utf8');
    assert.match(main, /modulesDeLaMaison\(MODULES_TOUS, \{ titulaire: peutVoirConsole\(compte\), brut: modulesEcranBrut\(\) \}\)/);
  });
});

describe('Console : Filet de sécurité (C5, C6, C8)', () => {
  const maintenant = new Date('2026-11-16T12:00:00Z');
  const il = (jours) => new Date(maintenant.getTime() - jours * 86_400_000).toISOString();

  test('C5 une ligne jamais vérifiée ou trop ancienne est rouge, une ligne dans le délai est à jour', () => {
    const l = { id: 'x', delai: 30 };
    assert.deepEqual(etatLigne(l, undefined, maintenant), { etat: 'jamais', jours: null });
    assert.deepEqual(etatLigne(l, { verifieLe: il(10) }, maintenant), { etat: 'ok', jours: 10 });
    assert.deepEqual(etatLigne(l, { verifieLe: il(30) }, maintenant), { etat: 'ok', jours: 30 });
    assert.deepEqual(etatLigne(l, { verifieLe: il(31) }, maintenant), { etat: 'ancien', jours: 31 });
    assert.deepEqual(etatLigne(l, { verifieLe: 'pas une date' }, maintenant), { etat: 'jamais', jours: null });
    assert.equal(etatLigne(l, { verifieLe: { toDate: () => new Date(maintenant) } }, maintenant).etat, 'ok'); // Timestamp Firestore
  });

  test('C5 toutes les lignes du filet sont listées, dans l\'ordre, avec leur état et leur note', () => {
    const lignes = lignesAvecEtat([{ id: 'budget', verifieLe: il(5), note: 'Alerte à 50 %' }], maintenant);
    assert.deepEqual(lignes.map((x) => x.id), LIGNES_FILET.map((x) => x.id));
    assert.equal(lignes.find((x) => x.id === 'budget').etat, 'ok');
    assert.equal(lignes.find((x) => x.id === 'budget').note, 'Alerte à 50 %');
    assert.equal(lignes.find((x) => x.id === 'restauration').etat, 'jamais');
    assert.deepEqual(resumeFilet(lignes), { total: LIGNES_FILET.length, ok: 1, aRefaire: LIGNES_FILET.length - 1 });
    assert.equal(texteEtat(lignes.find((x) => x.id === 'budget')), 'Vérifié il y a 5 jours');
    assert.equal(texteEtat(lignes.find((x) => x.id === 'restauration')), 'Jamais vérifié');
  });

  test('C6 cas vide : aucune fiche enregistrée donne « jamais » partout (l\'écran dit « Aucune vérification enregistrée »)', () => {
    assert.ok(lignesAvecEtat([], maintenant).every((x) => x.etat === 'jamais'));
    assert.ok(lignesAvecEtat(undefined, maintenant).every((x) => x.etat === 'jamais'));
    const ecran = readFileSync(new URL('../js/modules/console/ecran.js', import.meta.url), 'utf8');
    assert.match(ecran, /Aucune vérification enregistrée/);
    assert.match(ecran, /dataset: \{ action: 'reessayer' \}/); // cas d'erreur : bouton « Réessayer »
  });

  test('C8 « Toutes les plateformes » est en premier ; une plateforme inconnue retombe sur elle', () => {
    assert.equal(PLATEFORMES[0].id, 'toutes');
    assert.equal(PLATEFORMES[0].libelle, 'Toutes les plateformes');
    assert.equal(plateformeValide('clients'), 'clients');
    assert.equal(plateformeValide('nimporte'), 'toutes');
    assert.equal(plateformeValide(undefined), 'toutes');
  });

  test('le bouton « Réessayer » relance l\'écoute et une vérification déjà datée est modifiée (copie « avant » du journal), pas recréée', () => {
    const donnees = readFileSync(new URL('../js/modules/console/donnees.js', import.meta.url), 'utf8');
    assert.match(donnees, /export function reessayer\(\)/);
    assert.match(donnees, /existe \? ecritureModifier\('console_filet'/);
    const ecran = readFileSync(new URL('../js/modules/console/ecran.js', import.meta.url), 'utf8');
    assert.equal((ecran.match(/D\.reessayer\(\)/g) || []).length, 2);
  });

  test('C9 l\'export du module est déclaré (Réglages > Sauvegarde) et lit la table du filet', () => {
    const c = MODULES_DECLARES.find((m) => m.id === 'console');
    assert.ok(c.reglages.sections.some((s) => s.id === 'reglages-export-console'));
    assert.deepEqual(c.collections, ['console_filet']);
    const donnees = readFileSync(new URL('../js/modules/console/donnees.js', import.meta.url), 'utf8');
    assert.match(donnees, /lireToutPourExport/);
  });

  test('aucune description de l\'infrastructure dans le code ni dans les docs de la Console (dépôt public)', () => {
    for (const f of ['../docs/console.md', '../functions/src/index.js', '../.github/A-FAIRE.md']) {
      assert.doesNotMatch(readFileSync(new URL(f, import.meta.url), 'utf8'), /console-serveur|claude-lecture/, f);
    }
    for (const f of ['../js/modules/console/logique.js', '../js/modules/console/ecran.js', '../js/modules/console/donnees.js', '../functions/src/console/appel.js']) {
      const t = readFileSync(new URL(f, import.meta.url), 'utf8');
      assert.doesNotMatch(t, /iam\.gserviceaccount\.com|projects\/[a-z0-9-]+\/secrets|AIza[0-9A-Za-z_-]{20,}/, f);
    }
  });
});
