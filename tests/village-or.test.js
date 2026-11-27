// Or du village, étape 6a de docs/accueil-village.md (27/11/2026) : règles du jeu (js/os/village-jeu-regles.js), cœur commun (functions/src/coeur/village-or.js),
// appel de la maison (functions/src/village-appel.js), vérificateur de la base des achats (functions/src/base/village-achats.js), fonction des clients
// (functions-plateforme/src/village.js) et textes de l'écran. Un test par critère, le nom commence par son numéro.
// Les tests 6.1 à 6.3e et 6.A2 tournent sur l'ÉMULATEUR Firestore (SDK d'administration réel : vraies transactions) ; ignorés si l'émulateur n'est pas démarré.
// Projet de démonstration propre à ce fichier, jamais de données réelles ; adresses en exemple.test.
import './_fiche-essai.js';
import { test, describe, before, after, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initializeApp, deleteApp } from '../functions/node_modules/firebase-admin/lib/esm/app/index.js';
import { getFirestore, Timestamp } from '../functions/node_modules/firebase-admin/lib/esm/firestore/index.js';
import * as R from '../js/os/village-jeu-regles.js';
import { DECORATIONS } from '../js/os/village-jeu-dessins.js';
import { creerVillageOr, lirePortefeuille, C_VILLAGE, C_GAINS } from '../functions/src/coeur/village-or.js';
import { creerAppelVillage, ligneDeJournalVillage } from '../functions/src/village-appel.js';
import { creerVerificateurAchat } from '../functions/src/base/village-achats.js';
import { ConfigurationAbsente } from '../functions/src/base/porte-base.js';
import { fausseBase, donneesDeBase, CONFIG, F1, F2, F3, EMAIL } from './_achats-essai.js';

process.env.GCLOUD_PROJECT = process.env.GCLOUD_PROJECT || 'demo-chevalier-ia-os';
const { villageOrClient } = await import('../functions-plateforme/src/village.js');
const { Refus } = await import('../functions-plateforme/src/appels.js');

const racineDepot = fileURLToPath(new URL('../', import.meta.url));
const lire = (chemin) => readFileSync(`${racineDepot}${chemin}`, 'utf8');
const HEURE = 3600 * 1000;
const JOUR = 24 * HEURE;
const MAINTENANT = Date.parse('2026-11-27T10:00:00Z');
const AUJOURDHUI = '2026-11-27';
const jourDecale = (n) => new Date(MAINTENANT + n * JOUR).toISOString().slice(0, 10);
const horodatage = (ms) => Timestamp.fromMillis(ms);

describe('6.0 règles du jeu (fichier pur)', () => {
  test('6.0a montants validés par Jérôme : gains 10, 20, 50 ; prix 20, 100, 200, 500', () => {
    assert.deepEqual({ ...R.GAINS }, { 'facture-validee': 10, 'facture-payee': 20, 'devis-signe': 50 });
    assert.deepEqual({ ...R.PRIX }, { decoration: 20, champ: 100, enclos: 200, parcelle: 500 });
    assert.equal(Object.isFrozen(R.GAINS) && Object.isFrozen(R.PRIX), true);
  });

  test('6.0b damier selon les parcelles, textes du manque et du solde', () => {
    assert.deepEqual(R.damierDe(0), { colonnes: 8, lignes: 8 });
    assert.deepEqual(R.damierDe(1), { colonnes: 10, lignes: 10 });
    assert.deepEqual(R.damierDe(8), { colonnes: 24, lignes: 24 });
    assert.deepEqual(R.damierDe(9), { colonnes: 24, lignes: 24 });
    assert.deepEqual(R.damierDe(-1), { colonnes: 8, lignes: 8 });
    assert.deepEqual(R.damierDe('2'), { colonnes: 8, lignes: 8 });
    assert.deepEqual(R.damierDe(undefined), { colonnes: 8, lignes: 8 });
    assert.equal(R.manque(100, 70), 30);
    assert.equal(R.manque(100, 120), 0);
    assert.equal(R.texteManque(30), 'Encore 30 pièces.');
    assert.equal(R.texteManque(1), 'Encore 1 pièce.');
    assert.equal(R.texteOr(120), '120 pièces d’or');
    assert.equal(R.texteOr(1), '1 pièce d’or');
    assert.equal(R.texteOr(0), '0 pièce d’or');
    assert.equal(R.texteOr(-5), '0 pièce d’or');
  });

  test('6.0b enclos, champ et fraîcheur : valeurs rondes, aucune horloge cachée', () => {
    const d = MAINTENANT - 30 * HEURE;
    assert.deepEqual(R.etatEnclos(d, MAINTENANT), { pretes: 5, plein: false, prochaineMs: d + 2 * JOUR });
    assert.deepEqual(R.etatEnclos(MAINTENANT - 10 * JOUR, MAINTENANT), { pretes: 20, plein: true, prochaineMs: null });
    assert.equal(R.etatEnclos(MAINTENANT + HEURE, MAINTENANT).pretes, 0);
    assert.equal(R.apresRamassage(d, MAINTENANT), d + JOUR);
    assert.equal(R.apresRamassage(MAINTENANT - 10 * JOUR, MAINTENANT), MAINTENANT);
    assert.deepEqual(R.etatChamp(MAINTENANT - 10 * HEURE, MAINTENANT), { etape: 0, pret: false });
    assert.deepEqual(R.etatChamp(MAINTENANT - 20 * HEURE, MAINTENANT), { etape: 1, pret: false });
    assert.deepEqual(R.etatChamp(MAINTENANT - 40 * HEURE, MAINTENANT), { etape: 2, pret: false });
    assert.deepEqual(R.etatChamp(MAINTENANT - 48 * HEURE, MAINTENANT), { etape: 3, pret: true });
    assert.deepEqual(R.etatChamp(MAINTENANT + HEURE, MAINTENANT), { etape: 0, pret: false });
    assert.deepEqual(R.etatChamp(Number.NaN, MAINTENANT), { etape: 0, pret: false });
    assert.equal(R.fraisPourGain('devis-signe', MAINTENANT - 47 * HEURE, MAINTENANT), true);
    assert.equal(R.fraisPourGain('devis-signe', MAINTENANT - 49 * HEURE, MAINTENANT), false);
    assert.equal(R.fraisPourGain('facture-payee', MAINTENANT, MAINTENANT), false);
    assert.equal(R.paiementRecent(AUJOURDHUI, MAINTENANT), true);
    assert.equal(R.paiementRecent(jourDecale(-31), MAINTENANT), true);
    assert.equal(R.paiementRecent(jourDecale(-32), MAINTENANT), false);
    assert.equal(R.paiementRecent(jourDecale(1), MAINTENANT), true);
    assert.equal(R.paiementRecent(jourDecale(2), MAINTENANT), false);
    for (const mauvais of ['2026-02-30', '27/11/2026', '', null, 20261127]) assert.equal(R.paiementRecent(mauvais, MAINTENANT), false, String(mauvais));
  });

  test('6.0c clés du registre des gains : formes attendues, identifiants douteux refusés', () => {
    const uuid = '00000000-0000-4000-8000-00000000000A';
    assert.equal(R.cleDeGain('facture-validee', { id: uuid }), `fv-${uuid.toLowerCase()}`);
    assert.equal(R.cleDeGain('facture-payee', { id: 'f1', projetId: 'p1' }), 'fp-p1-f1');
    assert.equal(R.cleDeGain('devis-signe', { id: 'd1' }), 'ds-d1');
    assert.equal(R.cleDeGain('facture-validee', { id: 'a1' }), null); // facture d'achat : UUID exigé
    assert.equal(R.cleDeGain('devis-signe', { id: 'a/b' }), null);
    assert.equal(R.cleDeGain('devis-signe', { id: '' }), null);
    assert.equal(R.cleDeGain('devis-signe', { id: 'x'.repeat(81) }), null);
    assert.equal(R.cleDeGain('facture-payee', { id: 'f1' }), null);
    assert.equal(R.cleDeGain('facture-payee', { id: 'f1', projetId: '../x' }), null);
    assert.equal(R.cleDeGain('cadeau', { id: 'd1' }), null);
  });

  test('6.0d copies préparées identiques à la source (chez Jérôme et chez les clients) ; la source n’a aucun import', (t) => {
    const source = lire('js/os/village-jeu-regles.js');
    assert.doesNotMatch(source, /^\s*import\s/m);
    assert.doesNotMatch(source, /document\.|window\.|Date\.now\(|new Date\(\)|CRM/);
    for (const copie of ['functions/partage/village-jeu-regles.js', 'functions-plateforme/serveur/partage/village-jeu-regles.js']) {
      if (!existsSync(`${racineDepot}${copie}`)) { t.skip('copie absente : lancer `npm run preparer` (test:fonctions le fait)'); return; }
      assert.equal(lire(copie), source, copie);
    }
  });

  test('6.0e modèles de décoration = DECORATIONS des dessins', () => {
    assert.deepEqual([...R.MODELES_DECORATION], [...DECORATIONS]);
  });
});

const emulateur = process.env.FIRESTORE_EMULATOR_HOST;
describe('6.1 à 6.3 cœur de l’or sur Firestore (émulateur)', { skip: emulateur ? false : 'émulateur Firestore non démarré (lancer npm run test:module village-or)' }, () => {
  const PROJET = 'demo-chevalier-village-or';
  let app;
  let db;
  const COLLECTIONS = ['village_utilisateurs', 'village_gains', 'devis_devis', 'projets_projets'];
  const service = (extra = {}) => creerVillageOr({ db, horodatage, maintenant: () => MAINTENANT, ...extra });
  const devis = (id, extra = {}, base = '') => db.doc(`${base}devis_devis/${id}`).set({ statut: 'accepte', racineId: id, accepteLe: Timestamp.fromMillis(MAINTENANT - HEURE), test: false, ...extra });
  const projet = (id, factures, extra = {}, base = '') => db.doc(`${base}projets_projets/${id}`).set({ nom: 'Projet essai', factures, ...extra });
  const portefeuille = async (uid, base = '') => { const s = await db.doc(`${base}${C_VILLAGE}/${uid}`).get(); return s.exists ? s.data() : null; };
  const gains = async (base = '') => (await db.collection(`${base}${C_GAINS}`).get()).docs.map((d) => d.id).sort();

  before(() => {
    assert.ok(PROJET.startsWith('demo-'));
    app = initializeApp({ projectId: PROJET }, 'test-village-or');
    db = getFirestore(app);
  });
  after(async () => { await deleteApp(app); });
  beforeEach(async () => {
    for (const base of ['', 'clients/a/', 'clients/b/']) {
      for (const c of COLLECTIONS) for (const d of (await db.collection(`${base}${c}`).get()).docs) await d.ref.delete();
    }
    for (const d of (await db.collection('clients/a/membres').get()).docs) await d.ref.delete();
  });

  test('6.1 devis signé frais : 50 pièces, portefeuille à 50, registre ds-<racine>', async () => {
    await devis('d1', { racineId: 'r1' });
    const r = await service().gain({ uid: 'u1', source: 'devis-signe', id: 'd1' });
    assert.deepEqual(r, { ok: true, gagne: 50, or: 50 });
    const p = await portefeuille('u1');
    assert.equal(p.or, 50);
    assert.equal(p.gagne, 50);
    assert.equal(p.parcelles, 0);
    assert.ok(p.modifieLe instanceof Timestamp);
    assert.deepEqual(await gains(), ['ds-r1']);
    const g = (await db.doc(`${C_GAINS}/ds-r1`).get()).data();
    assert.deepEqual({ uid: g.uid, source: g.source, pieces: g.pieces }, { uid: 'u1', source: 'devis-signe', pieces: 50 });
    assert.deepEqual(await lirePortefeuille({ db, uid: 'u1' }), { or: 50, gagne: 50, parcelles: 0 });
  });

  test('6.2a facture de projet payée aujourd’hui : 20 ; à payer, abandonnée, inconnue, projet inconnu : 0 ; trop ancienne : trop_ancien', async () => {
    await projet('p1', [
      { id: 'f1', statut: 'payee', datePaiement: AUJOURDHUI }, { id: 'f2', statut: 'a_payer', datePaiement: null },
      { id: 'f3', statut: 'abandonnee' }, { id: 'f4', statut: 'payee', datePaiement: jourDecale(-40) },
    ]);
    const s = service();
    assert.deepEqual(await s.gain({ uid: 'u1', source: 'facture-payee', projetId: 'p1', id: 'f1' }), { ok: true, gagne: 20, or: 20 });
    for (const [projetId, id] of [['p1', 'f2'], ['p1', 'f3'], ['p1', 'f9'], ['p9', 'f1']]) {
      assert.deepEqual(await s.gain({ uid: 'u1', source: 'facture-payee', projetId, id }), { ok: true, gagne: 0, raison: 'pas_valide' }, `${projetId}/${id}`);
    }
    assert.deepEqual(await s.gain({ uid: 'u1', source: 'facture-payee', projetId: 'p1', id: 'f4' }), { ok: true, gagne: 0, raison: 'trop_ancien' });
    assert.equal((await portefeuille('u1')).or, 20);
    assert.deepEqual(await gains(), ['fp-p1-f1']);
  });

  test('6.2b facture d’achat : le vérificateur décide (acceptee 10, autre 0, indisponible ou absent : 0 et rien d’écrit)', async () => {
    const uuid = '00000000-0000-4000-8000-000000000001';
    const demandes = [];
    const avec = (etat) => service({ verifierAchat: async (id) => { demandes.push(id); return etat; } });
    assert.deepEqual(await avec('acceptee').gain({ uid: 'u1', source: 'facture-validee', id: uuid }), { ok: true, gagne: 10, or: 10 });
    assert.deepEqual(demandes, [uuid]);
    const autre = '00000000-0000-4000-8000-000000000002';
    assert.deepEqual(await avec('autre').gain({ uid: 'u1', source: 'facture-validee', id: autre }), { ok: true, gagne: 0, raison: 'pas_valide' });
    assert.deepEqual(await avec('indisponible').gain({ uid: 'u1', source: 'facture-validee', id: autre }), { ok: true, gagne: 0, raison: 'indisponible' });
    assert.deepEqual(await service().gain({ uid: 'u1', source: 'facture-validee', id: autre }), { ok: true, gagne: 0, raison: 'indisponible' });
    assert.deepEqual(await service({ verifierAchat: async () => { throw new Error('panne'); } }).gain({ uid: 'u1', source: 'facture-validee', id: autre }), { ok: true, gagne: 0, raison: 'indisponible' });
    assert.equal((await portefeuille('u1')).or, 10);
    assert.deepEqual(await gains(), [`fv-${uuid}`]);
  });

  test('6.3a le même devis deux fois : 50 puis 0 (deja) ; un autre compte : 0 ; une autre version du même devis : 0', async () => {
    await devis('d1', { racineId: 'r1' });
    await devis('d1-v2', { racineId: 'r1' });
    const s = service();
    assert.equal((await s.gain({ uid: 'u1', source: 'devis-signe', id: 'd1' })).gagne, 50);
    assert.deepEqual(await s.gain({ uid: 'u1', source: 'devis-signe', id: 'd1' }), { ok: true, gagne: 0, raison: 'deja' });
    assert.deepEqual(await s.gain({ uid: 'u2', source: 'devis-signe', id: 'd1' }), { ok: true, gagne: 0, raison: 'deja' });
    assert.deepEqual(await s.gain({ uid: 'u1', source: 'devis-signe', id: 'd1-v2' }), { ok: true, gagne: 0, raison: 'deja' });
    assert.equal((await portefeuille('u1')).or, 50);
    assert.equal(await portefeuille('u2'), null);
  });

  test('6.3b dix annonces du même devis en même temps : un seul gain, solde 50', async () => {
    await devis('d1');
    const s = service();
    const r = await Promise.all(Array.from({ length: 10 }, () => s.gain({ uid: 'u1', source: 'devis-signe', id: 'd1' })));
    assert.equal(r.filter((x) => x.gagne === 50).length, 1);
    assert.equal(r.filter((x) => x.raison === 'deja').length, 9);
    assert.equal((await portefeuille('u1')).or, 50);
    assert.deepEqual(await gains(), ['ds-d1']);
  });

  test('6.3c devis de test, devis envoyé, signé il y a 3 jours : 0 ; la clé vient du document, jamais de la demande', async () => {
    await devis('t1', { test: true });
    await devis('e1', { statut: 'envoye' });
    await devis('v1', { accepteLe: Timestamp.fromMillis(MAINTENANT - 3 * JOUR) });
    const s = service();
    assert.deepEqual(await s.gain({ uid: 'u1', source: 'devis-signe', id: 't1' }), { ok: true, gagne: 0, raison: 'test' });
    assert.deepEqual(await s.gain({ uid: 'u1', source: 'devis-signe', id: 'e1' }), { ok: true, gagne: 0, raison: 'pas_valide' });
    assert.deepEqual(await s.gain({ uid: 'u1', source: 'devis-signe', id: 'v1' }), { ok: true, gagne: 0, raison: 'trop_ancien' });
    assert.deepEqual(await s.gain({ uid: 'u1', source: 'devis-signe', id: 'absent' }), { ok: true, gagne: 0, raison: 'pas_valide' });
    await devis('d1', { racineId: 'r1' });
    assert.equal((await s.gain({ uid: 'u1', source: 'devis-signe', id: 'd1', racineId: 'invente' })).gagne, 50);
    assert.deepEqual(await gains(), ['ds-r1']);
    // projet de test : rien non plus
    await projet('pt', [{ id: 'f1', statut: 'payee', datePaiement: AUJOURDHUI }], { test: true });
    assert.deepEqual(await s.gain({ uid: 'u1', source: 'facture-payee', projetId: 'pt', id: 'f1' }), { ok: true, gagne: 0, raison: 'test' });
    // demandes mal formées
    assert.deepEqual(await s.gain({ uid: 'u1', source: 'cadeau', id: 'd1' }), { ok: false, raison: 'demande' });
    assert.deepEqual(await s.gain({ uid: 'u1', source: 'devis-signe', id: 'a/b' }), { ok: false, raison: 'demande' });
    assert.deepEqual(await s.gain({ uid: 'a/b', source: 'devis-signe', id: 'd1' }), { ok: false, raison: 'demande' });
  });

  test('6.3d lecture seule : 0, rien de lu ni d’écrit', async () => {
    let lus = 0;
    const espion = { doc: () => { lus += 1; throw new Error('aucune lecture attendue'); }, runTransaction: () => { throw new Error('aucune écriture attendue'); } };
    const r = await creerVillageOr({ db: espion, horodatage, maintenant: () => MAINTENANT }).gain({ uid: 'u1', source: 'devis-signe', id: 'd1', lectureSeule: true });
    assert.deepEqual(r, { ok: true, gagne: 0, raison: 'lecture_seule' });
    assert.equal(lus, 0);
  });

  test('6.3e racine clients/a/ : tout est écrit sous clients/a/, rien à la racine ; un devis de clients/b/ n’est pas vu', async () => {
    await devis('d1', {}, 'clients/a/');
    await devis('d2', {}, 'clients/b/');
    const s = service({ racine: 'clients/a/' });
    assert.equal((await s.gain({ uid: 'u1', source: 'devis-signe', id: 'd1' })).gagne, 50);
    assert.deepEqual(await s.gain({ uid: 'u1', source: 'devis-signe', id: 'd2' }), { ok: true, gagne: 0, raison: 'pas_valide' });
    assert.equal((await portefeuille('u1', 'clients/a/')).or, 50);
    assert.equal(await portefeuille('u1'), null);
    assert.deepEqual(await gains(), []);
    assert.deepEqual(await gains('clients/a/'), ['ds-d1']);
    assert.throws(() => creerVillageOr({ db, racine: 'clients/../', horodatage }), /racine invalide/);
  });

  test('6.A2 plateforme : éditrice gagne ; lectrice 0 lecture_seule ; non-membre, autre client, interne, client mal formé : refus neutre ; facture validée : indisponible', async () => {
    const ALICE = 'alice@exemple.test';
    const LEA = 'lea@exemple.test';
    await db.doc(`clients/a/membres/${ALICE}`).set({ role: 'editeur' });
    await db.doc(`clients/a/membres/${LEA}`).set({ role: 'lecteur' });
    await devis('d1', {}, 'clients/a/');
    const auth = (email, verifie = true) => ({ uid: `u-${email.split('@')[0]}`, token: { email, email_verified: verifie } });
    const appel = (email, donnees, verifie) => villageOrClient({ db, auth: auth(email, verifie), donnees, horodatage, maintenant: () => MAINTENANT });
    assert.deepEqual(await appel(ALICE, { client: 'a', action: 'gain', source: 'devis-signe', id: 'd1' }), { ok: true, gagne: 50, or: 50 });
    assert.equal((await portefeuille('u-alice', 'clients/a/')).or, 50);
    assert.deepEqual(await appel(LEA, { client: 'a', action: 'gain', source: 'devis-signe', id: 'd1' }), { ok: true, gagne: 0, raison: 'lecture_seule' });
    assert.deepEqual(await appel(ALICE, { client: 'a', action: 'gain', source: 'facture-validee', id: '00000000-0000-4000-8000-000000000001' }), { ok: true, gagne: 0, raison: 'indisponible' });
    for (const [email, donnees] of [['inconnu@exemple.test', { client: 'a' }], [ALICE, { client: 'b' }], [ALICE, { client: 'interne' }]]) {
      await assert.rejects(appel(email, { action: 'gain', source: 'devis-signe', id: 'd1', ...donnees }), (e) => e instanceof Refus && e.code === 'permission-denied' && e.message === 'Action non autorisée.', JSON.stringify(donnees));
    }
    for (const client of ['../a', '', undefined, 'A B']) await assert.rejects(appel(ALICE, { client, action: 'gain', source: 'devis-signe', id: 'd1' }), (e) => e instanceof Refus && e.code === 'invalid-argument');
    await assert.rejects(appel(ALICE, { client: 'a', action: 'acheter' }), (e) => e instanceof Refus && e.code === 'invalid-argument');
    await assert.rejects(appel(ALICE, { client: 'a', action: 'gain' }, false), (e) => e instanceof Refus && e.code === 'unauthenticated');
    assert.equal(await portefeuille('u-lea', 'clients/a/'), null);
  });
});

describe('6.A appels et vérificateur (sans émulateur)', () => {
  const requete = ({ email = 'lea@exemple.test', verifie = true, uid = 'u1', data = { action: 'gain', source: 'devis-signe', id: 'd1' } } = {}) => ({ auth: email === null ? null : { uid, token: { email, email_verified: verifie } }, data });

  test('6.A1 appel de la maison : connexion, compte autorisé, action connue ; journal sans uid, e-mail ni identifiant', async () => {
    const journal = [];
    const appels = [];
    const service = (email) => ({ gain: async (d) => { appels.push({ email, ...d }); return { ok: true, gagne: 50, or: 50 }; } });
    const appel = creerAppelVillage({ service, comptes: ['lea@exemple.test'], journal: (e) => journal.push(e) });
    await assert.rejects(appel(requete({ email: null })), (e) => e.code === 'unauthenticated');
    await assert.rejects(appel(requete({ email: 'intrus@exemple.test' })), (e) => e.code === 'permission-denied');
    await assert.rejects(appel(requete({ verifie: false })), (e) => e.code === 'permission-denied');
    await assert.rejects(appel(requete({ data: { action: 'acheter' } })), (e) => e.code === 'invalid-argument');
    await assert.rejects(appel(requete({ data: null })), (e) => e.code === 'invalid-argument');
    assert.equal(appels.length, 0);
    assert.deepEqual(await appel(requete({ data: { action: 'gain', source: 'devis-signe', id: 'd1', uid: 'quelquun-dautre' } })), { ok: true, gagne: 50, or: 50 });
    assert.deepEqual(appels, [{ email: 'lea@exemple.test', uid: 'u1', source: 'devis-signe', id: 'd1', projetId: undefined }]); // l'uid vient de la connexion, jamais de la demande
    const enPanne = creerAppelVillage({ service: () => ({ gain: async () => { throw new TypeError('boum'); } }), comptes: ['lea@exemple.test'], journal: (e) => journal.push(e) });
    await assert.rejects(enPanne(requete()), (e) => e.code === 'internal' && e.message === 'Une erreur est survenue. Réessaie.');
    assert.ok(journal.length >= 2);
    for (const e of journal) {
      const ligne = JSON.parse(ligneDeJournalVillage({ ...e, uid: 'u1', email: 'lea@exemple.test', id: 'd1', projetId: 'p1' }));
      assert.deepEqual(Object.keys(ligne).filter((k) => !['severity', 'message', 'action', 'statut', 'code', 'dureeMs'].includes(k)), []);
      assert.doesNotMatch(JSON.stringify(ligne), /lea@|u1|d1|p1/);
    }
  });

  test('6.A3 vérificateur des achats : acceptée fraîche oui ; à valider, refusée, archivée, ancienne : autre ; sans base ou en panne : indisponible ; lecture seule', async () => {
    const MAINT = Date.parse('2026-11-27T10:00:00Z');
    const donnees = donneesDeBase();
    const f1 = donnees.factures.find((f) => f.id === F1);
    const f2 = donnees.factures.find((f) => f.id === F2);
    f2.date_decision = new Date(MAINT - HEURE); // acceptée il y a une heure
    const vieille = { ...f2, id: '00000000-0000-4000-8000-000000000009', date_decision: new Date(MAINT - 3 * JOUR) };
    const archivee = { ...f2, id: '00000000-0000-4000-8000-000000000008', archivee_le: '2026-11-27T09:00:00Z' };
    const texte = { ...f2, id: '00000000-0000-4000-8000-000000000007', date_decision: new Date(MAINT - HEURE).toISOString() };
    donnees.factures.push(vieille, archivee, texte);
    const base = fausseBase({ donnees });
    const verifier = creerVerificateurAchat({ lireConfiguration: async () => CONFIG, ouvrirConnexion: base.ouvrir, maintenant: () => MAINT });
    assert.equal(await verifier(F2, EMAIL), 'acceptee');
    assert.equal(await verifier(texte.id, EMAIL), 'acceptee');
    assert.equal(await verifier(F1, EMAIL), 'autre'); // à valider
    assert.equal(await verifier(F3, EMAIL), 'autre'); // refusée et archivée
    assert.equal(await verifier(vieille.id, EMAIL), 'autre');
    assert.equal(await verifier(archivee.id, EMAIL), 'autre');
    assert.equal(await verifier('00000000-0000-4000-8000-0000000000ff', EMAIL), 'autre'); // inconnue
    assert.equal(await verifier('a1', EMAIL), 'autre'); // pas un UUID : la base n'est pas ouverte
    assert.ok(base.transactions.length > 0 && base.transactions.every((t) => t.lectureSeule), 'transactions en lecture seule');
    assert.ok(base.sqls().every((s) => !/^(insert|update|delete)/i.test(s)), 'aucune écriture');
    assert.deepEqual(base.tablesLues(), ['factures']);
    const sansBase = creerVerificateurAchat({ lireConfiguration: async () => { throw new ConfigurationAbsente(); }, ouvrirConnexion: base.ouvrir, maintenant: () => MAINT });
    assert.equal(await sansBase(F2, EMAIL), 'indisponible');
    const panne = fausseBase({ donnees, panne: (sql) => { if (sql.includes('"factures"')) throw new Error('pg : mot de passe refusé pour l’utilisateur porte'); return null; } });
    const enPanne = creerVerificateurAchat({ lireConfiguration: async () => CONFIG, ouvrirConnexion: panne.ouvrir, maintenant: () => MAINT });
    assert.equal(await enPanne(F2, EMAIL), 'indisponible');
    const ouvertureRatee = creerVerificateurAchat({ lireConfiguration: async () => CONFIG, ouvrirConnexion: async () => { throw new Error('connexion impossible'); }, maintenant: () => MAINT });
    assert.equal(await ouvertureRatee(F2, EMAIL), 'indisponible');
  });
});

describe('6.S textes du serveur et de l’écran', () => {
  test('6.S1 le cœur n’importe ni ../base/, ni firebase-functions, ni firebase-admin ; l’écran : ni innerHTML, ni Audio, ni « CRM », ni classement, série ou notification', () => {
    const coeur = lire('functions/src/coeur/village-or.js');
    assert.doesNotMatch(coeur, /from '\.\.\/base\//);
    assert.doesNotMatch(coeur, /from 'firebase-functions/);
    assert.doesNotMatch(coeur, /from 'firebase-admin/);
    // Le code seulement : les commentaires de tête disent justement ce qui est interdit (« jamais par innerHTML », « aucun classement »).
    const code = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/ \/\/ .*$/gm, '');
    for (const f of ['js/os/village-or.js', 'js/os/village-fete.js', 'js/os/bonnes-nouvelles.js']) {
      const t = code(lire(f));
      assert.doesNotMatch(t, /innerHTML|\bAudio\b|<audio|\bCRM\b/, f);
      assert.doesNotMatch(t, /classement|série|notification/i, f);
      assert.doesNotMatch(t, /setAttribute\('title'|\btitle:/, f);
    }
  });

  test('6.S2 les trois modules annoncent leur bonne nouvelle, une seule source par fichier ; examiner.js ne l’annonce qu’une fois', () => {
    const fichiers = { 'js/modules/achatsfactures/examiner.js': 'facture-validee', 'js/modules/projets/factures.js': 'facture-payee', 'js/modules/devis/actions-devis.js': 'devis-signe' };
    for (const [f, source] of Object.entries(fichiers)) {
      const t = lire(f);
      const sources = [...t.matchAll(/annoncer\('([a-z-]+)'/g)].map((m) => m[1]);
      assert.ok(sources.length >= 1, f);
      assert.deepEqual([...new Set(sources)], [source], f);
      assert.doesNotMatch(t, /village-or\.js|villageOr/, `${f} ne connaît pas l’or`);
    }
    assert.equal([...lire('js/modules/achatsfactures/examiner.js').matchAll(/annoncer\('facture-validee'/g)].length, 1);
    assert.equal([...lire('js/modules/devis/actions-devis.js').matchAll(/annoncer\('devis-signe'/g)].length, 2); // les deux chemins réussis de « Marquer signé »
  });
});
