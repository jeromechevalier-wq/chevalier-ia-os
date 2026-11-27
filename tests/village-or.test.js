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
    assert.equal(R.cleDeGain('facture-validee', { id: uuid }), `fv.${uuid.toLowerCase()}`);
    assert.equal(R.cleDeGain('facture-payee', { id: 'f1', projetId: 'p1' }), 'fp.p1.f1');
    assert.equal(R.cleDeGain('devis-signe', { id: 'd1' }), 'ds.d1');
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

  test('6.0f clés sans collision : séparateur « . » hors de l’alphabet des identifiants ; (« a-b », « c ») et (« a », « b-c ») donnent deux clés', () => {
    assert.notEqual(R.cleDeGain('facture-payee', { projetId: 'a-b', id: 'c' }), R.cleDeGain('facture-payee', { projetId: 'a', id: 'b-c' }));
    assert.notEqual(R.cleDeGain('facture-payee', { projetId: 'a_b', id: 'c' }), R.cleDeGain('facture-payee', { projetId: 'a', id: 'b_c' }));
    const ids = ['a', 'b', 'a-b', 'b-c', 'c', 'a_b', 'b_c', 'ds', 'fp', 'fv', 'd1', 'p1-f1', 'p1', 'f1'];
    const vues = new Map();
    for (const projetId of ids) for (const id of ids) {
      const cle = R.cleDeGain('facture-payee', { projetId, id });
      assert.ok(!vues.has(cle), `${cle} : ${vues.get(cle)} et ${projetId}/${id}`);
      vues.set(cle, `${projetId}/${id}`);
    }
    for (const id of ids) {
      const cle = R.cleDeGain('devis-signe', { id });
      assert.ok(!vues.has(cle), cle);
      vues.set(cle, id);
    }
    for (const cle of vues.keys()) assert.equal(cle.split('.').length - 1, cle.startsWith('fp.') ? 2 : 1, cle); // jamais de « . » dans un identifiant
    assert.equal(R.cleDeGain('devis-signe', { id: 'a.b' }), null);
    assert.equal(R.cleDeGain('facture-payee', { projetId: 'a.b', id: 'c' }), null);
  });

  test('6.0e modèles de décoration = DECORATIONS des dessins', () => {
    assert.deepEqual([...R.MODELES_DECORATION], [...DECORATIONS]);
  });

  test('6.0g casesEnregistrees : maisons 2 x 2 (même cachées), liens, objets selon leur taille ; petites maisons et valeurs douteuses ignorées', () => {
    const cases = R.casesEnregistrees([
      { sorte: 'besoin', c: 0, l: 0 }, { sorte: 'besoin', c: 4, l: 4, cache: true }, { sorte: 'lien', c: 6, l: 0 },
      { sorte: 'decoration', c: 3, l: 0 }, { sorte: 'champ', c: 0, l: 6 }, { sorte: 'petite', parent: 'b-x' },
      { sorte: 'besoin' }, { sorte: 'decoration', c: 1.5, l: 0 }, { sorte: 'inconnue', c: 7, l: 7 }, null, 'x',
    ]);
    assert.deepEqual([...cases].sort(), ['0-0', '0-1', '1-0', '1-1', '4-4', '4-5', '5-4', '5-5', '6-0', '6-1', '7-0', '7-1', '3-0', '0-6', '0-7', '1-6', '1-7'].sort());
    assert.equal(R.casesEnregistrees(undefined).size, 0);
    assert.equal(R.TAILLE_MAISON, 2);
    assert.deepEqual([...R.ARTICLES_EN_VENTE], ['decoration', 'parcelle']);
  });
});

const emulateur = process.env.FIRESTORE_EMULATOR_HOST;
describe('6.1 à 6.3 cœur de l’or sur Firestore (émulateur)', { skip: emulateur ? false : 'émulateur Firestore non démarré (lancer npm run test:module village-or)' }, () => {
  const PROJET = 'demo-chevalier-village-or';
  let app;
  let db;
  const COLLECTIONS = ['village_utilisateurs', 'village_gains', 'devis_devis', 'projets_projets', 'crm_audit'];
  const LEA = 'lea@exemple.test';
  const ALICE = 'alice@exemple.test';
  /** Le service, avec l'e-mail de l'appelant (Léa par défaut). */
  const service = (extra = {}, acteur = LEA) => {
    const s = creerVillageOr({ db, horodatage, maintenant: () => MAINTENANT, ...extra });
    return { gain: (d) => s.gain({ acteur, ...d }) };
  };
  /** Une ligne du journal (crm_audit), comme l'écrivent le serveur (devis) et l'écran (projets). */
  let rang = 0;
  const trace = (docId, ligne, base = '') => db.collection(`${base}crm_audit`).add({
    docId, acteur: LEA, via: 'ecran', statut: 'succes', date: Timestamp.fromMillis(MAINTENANT - HEURE + (rang += 1) * 1000), ...ligne,
  });
  /** Devis signé ; `auteur` : la ligne de journal du passage à « Signé » (Léa, à l'écran, par défaut ; null : aucune ligne). */
  const devis = async (id, extra = {}, base = '', auteur = {}) => {
    await db.doc(`${base}devis_devis/${id}`).set({ statut: 'accepte', racineId: id, accepteLe: Timestamp.fromMillis(MAINTENANT - HEURE), test: false, ...extra });
    if (auteur) await trace(id, { outil: 'devisChangerStatut', collection: 'devis_devis', champsModifies: ['statut', 'accepteLe'], ...auteur }, base);
  };
  /** Projet et ses factures ; `auteur` : la ligne de journal du dernier « marquer payée » (Léa, à l'écran, par défaut ; null : aucune ligne). */
  const projet = async (id, factures, extra = {}, base = '', auteur = {}) => {
    await db.doc(`${base}projets_projets/${id}`).set({ nom: 'Projet essai', factures, ...extra });
    if (auteur) await trace(id, { outil: 'marquerFacturePayee', collection: 'projets_projets', champsModifies: ['factures'], ...auteur }, base);
  };
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
    // 6b : les objets achetés vivent dans les sous-collections batiments (un document parent absent ne les efface pas)
    for (const base of ['', 'clients/a/', 'clients/b/']) await db.recursiveDelete(db.collection(`${base}${C_VILLAGE}`));
  });

  test('6.1 devis signé frais : 50 pièces, portefeuille à 50, registre ds.<racine>', async () => {
    await devis('d1', { racineId: 'r1' });
    const r = await service().gain({ uid: 'u1', source: 'devis-signe', id: 'd1' });
    assert.deepEqual(r, { ok: true, gagne: 50, or: 50, version: 1 });
    const p = await portefeuille('u1');
    assert.equal(p.or, 50);
    assert.equal(p.gagne, 50);
    assert.equal(p.parcelles, 0);
    assert.ok(p.modifieLe instanceof Timestamp);
    assert.deepEqual(await gains(), ['ds.r1']);
    const g = (await db.doc(`${C_GAINS}/ds.r1`).get()).data();
    assert.deepEqual({ uid: g.uid, source: g.source, pieces: g.pieces }, { uid: 'u1', source: 'devis-signe', pieces: 50 });
    assert.deepEqual(await lirePortefeuille({ db, uid: 'u1' }), { or: 50, gagne: 50, parcelles: 0, version: 1 });
    assert.equal(p.version, 1);
  });

  test('6.2a facture de projet payée aujourd’hui : 20 ; à payer, abandonnée, inconnue, projet inconnu : 0 ; trop ancienne : trop_ancien', async () => {
    await projet('p1', [
      { id: 'f1', statut: 'payee', datePaiement: AUJOURDHUI }, { id: 'f2', statut: 'a_payer', datePaiement: null },
      { id: 'f3', statut: 'abandonnee' }, { id: 'f4', statut: 'payee', datePaiement: jourDecale(-40) },
    ]);
    const s = service();
    assert.deepEqual(await s.gain({ uid: 'u1', source: 'facture-payee', projetId: 'p1', id: 'f1' }), { ok: true, gagne: 20, or: 20, version: 1 });
    for (const [projetId, id] of [['p1', 'f2'], ['p1', 'f3'], ['p1', 'f9'], ['p9', 'f1']]) {
      assert.deepEqual(await s.gain({ uid: 'u1', source: 'facture-payee', projetId, id }), { ok: true, gagne: 0, raison: 'pas_valide' }, `${projetId}/${id}`);
    }
    assert.deepEqual(await s.gain({ uid: 'u1', source: 'facture-payee', projetId: 'p1', id: 'f4' }), { ok: true, gagne: 0, raison: 'trop_ancien' });
    assert.equal((await portefeuille('u1')).or, 20);
    assert.deepEqual(await gains(), ['fp.p1.f1']);
  });

  test('6.2b facture d’achat : le vérificateur décide (acceptee 10, autre 0, indisponible ou absent : 0 et rien d’écrit)', async () => {
    const uuid = '00000000-0000-4000-8000-000000000001';
    const demandes = [];
    const avec = (etat) => service({ verifierAchat: async (id) => { demandes.push(id); return etat; } });
    assert.deepEqual(await avec('acceptee').gain({ uid: 'u1', source: 'facture-validee', id: uuid }), { ok: true, gagne: 10, or: 10, version: 1 });
    assert.deepEqual(demandes, [uuid]);
    const autre = '00000000-0000-4000-8000-000000000002';
    assert.deepEqual(await avec('autre').gain({ uid: 'u1', source: 'facture-validee', id: autre }), { ok: true, gagne: 0, raison: 'pas_valide' });
    assert.deepEqual(await avec('indisponible').gain({ uid: 'u1', source: 'facture-validee', id: autre }), { ok: true, gagne: 0, raison: 'indisponible' });
    assert.deepEqual(await avec('trop_ancien').gain({ uid: 'u1', source: 'facture-validee', id: autre }), { ok: true, gagne: 0, raison: 'trop_ancien' });
    assert.deepEqual(await service().gain({ uid: 'u1', source: 'facture-validee', id: autre }), { ok: true, gagne: 0, raison: 'indisponible' });
    assert.deepEqual(await service({ verifierAchat: async () => { throw new Error('panne'); } }).gain({ uid: 'u1', source: 'facture-validee', id: autre }), { ok: true, gagne: 0, raison: 'indisponible' });
    assert.equal((await portefeuille('u1')).or, 10);
    assert.deepEqual(await gains(), [`fv.${uuid}`]);
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
    assert.deepEqual(await gains(), ['ds.d1']);
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
    assert.deepEqual(await gains(), ['ds.r1']);
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
    assert.deepEqual(await gains('clients/a/'), ['ds.d1']);
    assert.throws(() => creerVillageOr({ db, racine: 'clients/../', horodatage }), /racine invalide/);
  });

  test('6.4a pas d’or pour l’assistant ni pour un collègue : la dernière ligne du journal doit être celle de l’appelant, à l’écran', async () => {
    const s = service();
    // Devis signé par l'assistant (via « mcp ») : 0.
    await devis('m1', {}, '', { via: 'mcp', jeton: 'jeton-mcp' });
    assert.deepEqual(await s.gain({ uid: 'u1', source: 'devis-signe', id: 'm1' }), { ok: true, gagne: 0, raison: 'pas_valide' });
    // Signé à l'écran par Alice : Léa n'a rien, Alice a 50.
    await devis('a1', {}, '', { acteur: ALICE });
    assert.deepEqual(await s.gain({ uid: 'u1', source: 'devis-signe', id: 'a1' }), { ok: true, gagne: 0, raison: 'pas_valide' });
    assert.equal((await service({}, ALICE).gain({ uid: 'u2', source: 'devis-signe', id: 'a1' })).gagne, 50);
    // Aucune ligne de journal : 0. Une ligne qui n'a pas posé accepteLe (envoyé) ne compte pas.
    await devis('n1', {}, '', null);
    await trace('n1', { outil: 'devisChangerStatut', champsModifies: ['statut', 'envoyeLe'] });
    assert.deepEqual(await s.gain({ uid: 'u1', source: 'devis-signe', id: 'n1' }), { ok: true, gagne: 0, raison: 'pas_valide' });
    // La plus RÉCENTE compte : Léa à l'écran, puis l'assistant : 0 ; l'assistant, puis Léa à l'écran : 50.
    await devis('r1', {}, '');
    await trace('r1', { outil: 'devisChangerStatut', champsModifies: ['statut', 'accepteLe'], via: 'mcp' });
    assert.deepEqual(await s.gain({ uid: 'u1', source: 'devis-signe', id: 'r1' }), { ok: true, gagne: 0, raison: 'pas_valide' });
    await devis('r2', {}, '', { via: 'mcp' });
    await trace('r2', { outil: 'devisChangerStatut', champsModifies: ['statut', 'accepteLe'] });
    assert.equal((await s.gain({ uid: 'u1', source: 'devis-signe', id: 'r2' })).gagne, 50);
    // Facture de projet payée par l'assistant (outil MCP, via « mcp ») ou par Alice : 0 pour Léa ; sans ligne : 0.
    await projet('p1', [{ id: 'f1', statut: 'payee', datePaiement: AUJOURDHUI }], {}, '', { outil: 'marquer_facture_payee', via: 'mcp' });
    assert.deepEqual(await s.gain({ uid: 'u1', source: 'facture-payee', projetId: 'p1', id: 'f1' }), { ok: true, gagne: 0, raison: 'pas_valide' });
    await projet('p2', [{ id: 'f1', statut: 'payee', datePaiement: AUJOURDHUI }], {}, '', { acteur: ALICE });
    assert.deepEqual(await s.gain({ uid: 'u1', source: 'facture-payee', projetId: 'p2', id: 'f1' }), { ok: true, gagne: 0, raison: 'pas_valide' });
    await projet('p3', [{ id: 'f1', statut: 'payee', datePaiement: AUJOURDHUI }], {}, '', null);
    assert.deepEqual(await s.gain({ uid: 'u1', source: 'facture-payee', projetId: 'p3', id: 'f1' }), { ok: true, gagne: 0, raison: 'pas_valide' });
    // Une ligne d'un AUTRE espace (clients/a/) ne compte pas à la racine.
    await devis('x1', {}, '', null);
    await trace('x1', { outil: 'devisChangerStatut', champsModifies: ['statut', 'accepteLe'] }, 'clients/a/');
    assert.deepEqual(await s.gain({ uid: 'u1', source: 'devis-signe', id: 'x1' }), { ok: true, gagne: 0, raison: 'pas_valide' });
    // E-mail de l'appelant absent ou mal formé : demande refusée.
    const brut = creerVillageOr({ db, horodatage, maintenant: () => MAINTENANT });
    for (const acteur of [undefined, '', 'pas-un-email', 'a b@c']) assert.deepEqual(await brut.gain({ uid: 'u1', acteur, source: 'devis-signe', id: 'r2' }), { ok: false, raison: 'demande' }, String(acteur));
    assert.equal((await portefeuille('u1'))?.or, 50);
    assert.equal((await portefeuille('u2'))?.or, 50);
  });

  test('6.4b deux comptes différents en même temps sur le même devis : un seul gain, somme des soldes 50 ; même chose pour une facture d’achat (10)', async () => {
    await devis('d1');
    const [r1, r2] = await Promise.all([service({}, LEA).gain({ uid: 'u1', source: 'devis-signe', id: 'd1' }), service({}, ALICE).gain({ uid: 'u2', source: 'devis-signe', id: 'd1' })]);
    assert.equal([r1, r2].filter((r) => r.gagne === 50).length, 1);
    const solde = async (uid) => (await portefeuille(uid))?.or ?? 0;
    assert.equal((await solde('u1')) + (await solde('u2')), 50);
    // Sans contrôle d'auteur (facture d'achat, D14), la course passe par le registre seul : un des deux gagne, jamais les deux.
    const uuid = '00000000-0000-4000-8000-000000000003';
    const achat = { verifierAchat: async () => 'acceptee' };
    const course = await Promise.all([service(achat, LEA).gain({ uid: 'u3', source: 'facture-validee', id: uuid }), service(achat, ALICE).gain({ uid: 'u4', source: 'facture-validee', id: uuid })]);
    assert.equal(course.filter((r) => r.gagne === 10).length, 1);
    assert.equal(course.filter((r) => r.raison === 'deja').length, 1);
    assert.equal((await solde('u3')) + (await solde('u4')), 10);
    assert.deepEqual(await gains(), ['ds.d1', `fv.${uuid}`]);
  });

  test('6.4c version du portefeuille : +1 à chaque gain (l’écran garde la plus haute)', async () => {
    await devis('d1');
    await devis('d2');
    const s = service();
    assert.equal((await s.gain({ uid: 'u1', source: 'devis-signe', id: 'd1' })).version, 1);
    assert.deepEqual(await s.gain({ uid: 'u1', source: 'devis-signe', id: 'd2' }), { ok: true, gagne: 50, or: 100, version: 2 });
    assert.equal((await portefeuille('u1')).version, 2);
  });

  // ---------------------------------------------------------------- 6b : la boutique (achats)
  const acheteur = (extra = {}) => creerVillageOr({ db, horodatage, maintenant: () => MAINTENANT, ...extra });
  const porte = (uid, donnees, base = '') => db.doc(`${base}${C_VILLAGE}/${uid}`).set({ or: 0, gagne: 0, parcelles: 0, version: 3, ...donnees });
  const batiments = async (uid, base = '') => (await db.collection(`${base}${C_VILLAGE}/${uid}/batiments`).get()).docs.map((d) => ({ id: d.id, ...d.data() }));
  const poserDoc = (uid, id, donnees, base = '') => db.doc(`${base}${C_VILLAGE}/${uid}/batiments/${id}`).set(donnees);
  const sansDate = (p) => (p ? { or: p.or, gagne: p.gagne, parcelles: p.parcelles, version: p.version } : null);
  const ecrireLot = async (n, fabrique) => { const lot = db.batch(); for (let i = 0; i < n; i++) { const [ref, d] = fabrique(i); lot.set(ref, d); } await lot.commit(); };

  test('6.4d parcelle : 500 retirés, une parcelle de plus, version + 1, gagné inchangé, damier 10 x 10 ; à 8 parcelles : maximum, rien d’écrit', async () => {
    await porte('u1', { or: 600, gagne: 900 });
    const r = await acheteur().acheter({ uid: 'u1', article: 'parcelle' });
    assert.deepEqual(r, { ok: true, achete: true, or: 100, parcelles: 1, version: 4 });
    const p = await portefeuille('u1');
    assert.deepEqual(sansDate(p), { or: 100, gagne: 900, parcelles: 1, version: 4 });
    assert.ok(p.modifieLe instanceof Timestamp);
    assert.deepEqual(R.damierDe(p.parcelles), { colonnes: 10, lignes: 10 });
    await porte('u2', { or: 5000, parcelles: 8 });
    assert.deepEqual(await acheteur().acheter({ uid: 'u2', article: 'parcelle' }), { ok: true, achete: false, raison: 'maximum', or: 5000, parcelles: 8, version: 3 });
    assert.deepEqual(sansDate(await portefeuille('u2')), { or: 5000, gagne: 0, parcelles: 8, version: 3 });
  });

  test('6.4e pas assez d’or : pas_assez, manque 30, portefeuille identique', async () => {
    await porte('u1', { or: 470 });
    assert.deepEqual(await acheteur().acheter({ uid: 'u1', article: 'parcelle' }), { ok: true, achete: false, raison: 'pas_assez', manque: 30, or: 470, parcelles: 0, version: 3 });
    assert.deepEqual(sansDate(await portefeuille('u1')), { or: 470, gagne: 0, parcelles: 0, version: 3 });
    await porte('u2', { or: 5 });
    const r = await acheteur().acheter({ uid: 'u2', article: 'decoration', modele: 'arbre', c: 0, l: 0 });
    assert.equal(r.raison, 'pas_assez');
    assert.equal(r.manque, 15);
    assert.deepEqual(await batiments('u2'), []);
    // sans portefeuille du tout : 0 pièce, rien d'écrit
    assert.equal((await acheteur().acheter({ uid: 'u3', article: 'parcelle' })).manque, 500);
    assert.equal(await portefeuille('u3'), null);
  });

  test('6.4f course : deux parcelles pour 500 = une seule ; deux décorations pour 30 = une seule ; dix décorations pour 500 : jamais de solde négatif', async () => {
    await porte('u1', { or: 500 });
    const s = acheteur();
    const deux = await Promise.all([s.acheter({ uid: 'u1', article: 'parcelle' }), s.acheter({ uid: 'u1', article: 'parcelle' })]);
    assert.equal(deux.filter((r) => r.achete).length, 1);
    assert.deepEqual(sansDate(await portefeuille('u1')), { or: 0, gagne: 0, parcelles: 1, version: 4 });
    await porte('u2', { or: 30 });
    const deco = await Promise.all([s.acheter({ uid: 'u2', article: 'decoration', modele: 'arbre', c: 0, l: 0 }), s.acheter({ uid: 'u2', article: 'decoration', modele: 'banc', c: 3, l: 3 })]);
    assert.equal(deco.filter((r) => r.achete).length, 1);
    assert.equal((await portefeuille('u2')).or, 10);
    assert.equal((await batiments('u2')).length, 1);
    await porte('u3', { or: 500 });
    const dix = await Promise.all(Array.from({ length: 10 }, (_, i) => s.acheter({ uid: 'u3', article: 'decoration', modele: 'fleurs', c: i % 8, l: Math.floor(i / 8) })));
    const solde = (await portefeuille('u3')).or;
    assert.ok(solde >= 0);
    const crees = (await batiments('u3')).length;
    assert.equal(crees, (500 - solde) / 20);
    assert.equal(dix.filter((r) => r.achete).length, crees);
  });

  test('6.6a décoration : document créé avec ses champs EXACTS, identifiant o-…, or − 20, réponse avec l’objet', async () => {
    await porte('u1', { or: 120 });
    const r = await acheteur({ fabriquerId: () => 'o-essai1' }).acheter({ uid: 'u1', article: 'decoration', modele: 'arbre', c: 2, l: 5 });
    assert.deepEqual(r, { ok: true, achete: true, or: 100, parcelles: 0, version: 4, objet: { id: 'o-essai1', sorte: 'decoration', modele: 'arbre', c: 2, l: 5 } });
    const [b] = await batiments('u1');
    assert.deepEqual(Object.keys(b).sort(), ['acheteLe', 'c', 'depuis', 'id', 'l', 'modele', 'modifieLe', 'sorte']);
    assert.deepEqual({ id: b.id, sorte: b.sorte, modele: b.modele, c: b.c, l: b.l }, { id: 'o-essai1', sorte: 'decoration', modele: 'arbre', c: 2, l: 5 });
    for (const k of ['acheteLe', 'depuis', 'modifieLe']) assert.equal(b[k].toMillis(), MAINTENANT, k);
    // identifiant par défaut : o- + 20 caractères
    const r2 = await acheteur().acheter({ uid: 'u1', article: 'decoration', modele: 'banc', c: 0, l: 0 });
    assert.match(r2.objet.id, /^o-[a-z0-9-]{1,60}$/);
    assert.equal(r2.objet.id.length, 22);
    assert.equal((await portefeuille('u1')).or, 80);
    // un identifiant déjà pris fait échouer la transaction, sans rien écraser ni retirer d'or
    await assert.rejects(acheteur({ fabriquerId: () => 'o-essai1' }).acheter({ uid: 'u1', article: 'decoration', modele: 'fleurs', c: 7, l: 7 }));
    assert.equal((await portefeuille('u1')).or, 80);
    assert.equal((await db.doc(`${C_VILLAGE}/u1/batiments/o-essai1`).get()).data().modele, 'arbre');
  });

  test('6.6b cases : hors damier : case ; sur une maison 2 x 2, un lien, un objet, une maison cachée : case_prise ; une petite maison ne gêne pas ; rien d’écrit', async () => {
    await porte('u1', { or: 1000 });
    await poserDoc('u1', 'b-devis', { sorte: 'besoin', c: 0, l: 0 });
    await poserDoc('u1', 'b-cache', { sorte: 'besoin', c: 4, l: 4, cache: true });
    await poserDoc('u1', 'l-site', { sorte: 'lien', nom: 'Site', url: 'https://exemple.test', batiment: 'bureau', c: 0, l: 4 });
    await poserDoc('u1', 'o-deja', { sorte: 'decoration', modele: 'banc', c: 6, l: 0 });
    await poserDoc('u1', 'p-x', { sorte: 'petite', parent: 'b-devis', nom: 'Chantier', cible: '#/projets/x' });
    const s = acheteur();
    const achat = (c, l) => s.acheter({ uid: 'u1', article: 'decoration', modele: 'arbre', c, l });
    assert.equal((await achat(8, 0)).raison, 'case');
    assert.equal((await achat(0, 8)).raison, 'case');
    for (const [c, l] of [[1, 1], [0, 5], [6, 0], [5, 5]]) assert.equal((await achat(c, l)).raison, 'case_prise', `${c}-${l}`);
    assert.equal((await portefeuille('u1')).or, 1000);
    assert.equal((await batiments('u1')).length, 5);
    assert.equal((await achat(2, 2)).achete, true); // la petite maison (sans place) ne prend aucune case
    // une parcelle de plus : la case 9 entre dans le damier (10 x 10)
    await porte('u2', { or: 100, parcelles: 1 });
    assert.equal((await s.acheter({ uid: 'u2', article: 'decoration', modele: 'arbre', c: 9, l: 9 })).achete, true);
  });

  test('6.6c limite d’objets : 40 objets, la 41e décoration est refusée (trop_objets) ; 250 documents lus : refusé aussi', async () => {
    await porte('u1', { or: 1000 });
    await ecrireLot(40, (i) => [db.doc(`${C_VILLAGE}/u1/batiments/o-x${i}`), { sorte: 'decoration', modele: 'arbre', c: i % 24, l: 20 + Math.floor(i / 24) }]);
    assert.equal((await acheteur().acheter({ uid: 'u1', article: 'decoration', modele: 'arbre', c: 0, l: 0 })).raison, 'trop_objets');
    assert.equal((await portefeuille('u1')).or, 1000);
    await porte('u2', { or: 1000 });
    await ecrireLot(250, (i) => [db.doc(`${C_VILLAGE}/u2/batiments/p-x${i}`), { sorte: 'petite', parent: 'b-x', nom: 'x', cible: '#/projets/x' }]);
    assert.equal((await acheteur().acheter({ uid: 'u2', article: 'decoration', modele: 'arbre', c: 0, l: 0 })).raison, 'trop_objets');
    assert.equal((await portefeuille('u2')).or, 1000);
  });

  test('6.6d demandes : modèle inconnu, c 1,5, article inconnu, uid douteux : demande ; champ et enclos : pas_encore, rien d’écrit', async () => {
    await porte('u1', { or: 1000 });
    const s = acheteur();
    for (const d of [{ article: 'decoration', modele: 'statue', c: 0, l: 0 }, { article: 'decoration', modele: 'arbre', c: 1.5, l: 0 }, { article: 'decoration', modele: 'arbre', c: 0, l: 24 },
      { article: 'decoration', modele: 'arbre' }, { article: 'chateau' }, {}]) {
      assert.deepEqual(await s.acheter({ uid: 'u1', ...d }), { ok: false, raison: 'demande' }, JSON.stringify(d));
    }
    assert.deepEqual(await s.acheter({ uid: 'a/b', article: 'parcelle' }), { ok: false, raison: 'demande' });
    for (const article of ['champ', 'enclos']) assert.deepEqual(await s.acheter({ uid: 'u1', article }), { ok: true, achete: false, raison: 'pas_encore' });
    assert.deepEqual(sansDate(await portefeuille('u1')), { or: 1000, gagne: 0, parcelles: 0, version: 3 });
    assert.deepEqual(await batiments('u1'), []);
  });

  test('6.6e clients : tout sous clients/a/ ; lectrice : lecture_seule, rien d’écrit ; villageOrClient « acheter » marche pour l’éditrice', async () => {
    await porte('u1', { or: 600 }, 'clients/a/');
    const s = acheteur({ racine: 'clients/a/' });
    assert.equal((await s.acheter({ uid: 'u1', article: 'decoration', modele: 'banc', c: 1, l: 1 })).achete, true);
    assert.equal((await batiments('u1', 'clients/a/')).length, 1);
    assert.deepEqual(await batiments('u1'), []);
    assert.equal(await portefeuille('u1'), null);
    let lus = 0;
    const espion = { doc: () => { lus += 1; throw new Error('aucune lecture attendue'); }, collection: () => { lus += 1; throw new Error('aucune lecture attendue'); }, runTransaction: () => { throw new Error('aucune écriture attendue'); } };
    assert.deepEqual(await creerVillageOr({ db: espion, horodatage }).acheter({ uid: 'u1', article: 'parcelle', lectureSeule: true }), { ok: true, achete: false, raison: 'lecture_seule' });
    assert.equal(lus, 0);
    await db.doc(`clients/a/membres/${ALICE}`).set({ role: 'editeur' });
    await db.doc(`clients/a/membres/${LEA}`).set({ role: 'lecteur' });
    const auth = (email) => ({ uid: `u-${email.split('@')[0]}`, token: { email, email_verified: true } });
    await porte('u-alice', { or: 600 }, 'clients/a/');
    await porte('u-lea', { or: 600 }, 'clients/a/');
    const appel = (email, donnees) => villageOrClient({ db, auth: auth(email), donnees: { client: 'a', ...donnees }, horodatage, maintenant: () => MAINTENANT });
    assert.deepEqual(await appel(ALICE, { action: 'acheter', article: 'parcelle', uid: 'u-lea' }), { ok: true, achete: true, or: 100, parcelles: 1, version: 4 });
    assert.deepEqual(await appel(LEA, { action: 'acheter', article: 'decoration', modele: 'arbre', c: 0, l: 0 }), { ok: true, achete: false, raison: 'lecture_seule' });
    assert.deepEqual(sansDate(await portefeuille('u-lea', 'clients/a/')), { or: 600, gagne: 0, parcelles: 0, version: 3 });
    assert.deepEqual(await batiments('u-lea', 'clients/a/'), []);
    await assert.rejects(appel('inconnu@exemple.test', { action: 'acheter', article: 'parcelle' }), (e) => e instanceof Refus && e.code === 'permission-denied');
  });

  test('6.A2 plateforme : éditrice gagne ; lectrice 0 lecture_seule ; non-membre, autre client, interne, client mal formé : refus neutre ; facture validée : indisponible', async () => {
    await db.doc(`clients/a/membres/${ALICE}`).set({ role: 'editeur' });
    await db.doc(`clients/a/membres/${LEA}`).set({ role: 'lecteur' });
    await devis('d1', {}, 'clients/a/', { acteur: ALICE });
    const auth = (email, verifie = true) => ({ uid: `u-${email.split('@')[0]}`, token: { email, email_verified: verifie } });
    const appel = (email, donnees, verifie) => villageOrClient({ db, auth: auth(email, verifie), donnees, horodatage, maintenant: () => MAINTENANT });
    assert.deepEqual(await appel(ALICE, { client: 'a', action: 'gain', source: 'devis-signe', id: 'd1' }), { ok: true, gagne: 50, or: 50, version: 1 });
    assert.equal((await portefeuille('u-alice', 'clients/a/')).or, 50);
    assert.deepEqual(await appel(LEA, { client: 'a', action: 'gain', source: 'devis-signe', id: 'd1' }), { ok: true, gagne: 0, raison: 'lecture_seule' });
    assert.deepEqual(await appel(ALICE, { client: 'a', action: 'gain', source: 'facture-validee', id: '00000000-0000-4000-8000-000000000001' }), { ok: true, gagne: 0, raison: 'indisponible' });
    for (const [email, donnees] of [['inconnu@exemple.test', { client: 'a' }], [ALICE, { client: 'b' }], [ALICE, { client: 'interne' }]]) {
      await assert.rejects(appel(email, { action: 'gain', source: 'devis-signe', id: 'd1', ...donnees }), (e) => e instanceof Refus && e.code === 'permission-denied' && e.message === 'Action non autorisée.', JSON.stringify(donnees));
    }
    for (const client of ['../a', '', undefined, 'A B']) await assert.rejects(appel(ALICE, { client, action: 'gain', source: 'devis-signe', id: 'd1' }), (e) => e instanceof Refus && e.code === 'invalid-argument');
    await assert.rejects(appel(ALICE, { client: 'a', action: 'ramasser' }), (e) => e instanceof Refus && e.code === 'invalid-argument');
    // 6b : Alice n'est pas membre du client b : elle n'y achète rien (refus neutre, rien n'est écrit)
    await assert.rejects(appel(ALICE, { client: 'b', action: 'acheter', article: 'parcelle' }), (e) => e instanceof Refus && e.code === 'permission-denied' && e.message === 'Action non autorisée.');
    assert.equal(await portefeuille('u-alice', 'clients/b/'), null);
    await assert.rejects(appel(ALICE, { client: 'a', action: 'gain' }, false), (e) => e instanceof Refus && e.code === 'unauthenticated');
    assert.equal(await portefeuille('u-lea', 'clients/a/'), null);
  });
});

describe('6.A appels et vérificateur (sans émulateur)', () => {
  const requete = ({ email = 'lea@exemple.test', verifie = true, uid = 'u1', data = { action: 'gain', source: 'devis-signe', id: 'd1' } } = {}) => ({ auth: email === null ? null : { uid, token: { email, email_verified: verifie } }, data });

  test('6.A1 appel de la maison : connexion, compte autorisé, action connue ; journal sans uid, e-mail ni identifiant', async () => {
    const journal = [];
    const appels = [];
    const service = (email) => ({
      gain: async (d) => { appels.push({ email, ...d }); return { ok: true, gagne: 50, or: 50, version: 1 }; },
      acheter: async (d) => { appels.push({ email, achat: true, ...d }); return { ok: true, achete: true, or: 0, parcelles: 1, version: 2 }; },
    });
    const appel = creerAppelVillage({ service, comptes: ['lea@exemple.test'], journal: (e) => journal.push(e) });
    await assert.rejects(appel(requete({ email: null })), (e) => e.code === 'unauthenticated');
    await assert.rejects(appel(requete({ email: 'intrus@exemple.test' })), (e) => e.code === 'permission-denied');
    await assert.rejects(appel(requete({ verifie: false })), (e) => e.code === 'permission-denied');
    await assert.rejects(appel(requete({ data: { action: 'ramasser' } })), (e) => e.code === 'invalid-argument');
    await assert.rejects(appel(requete({ data: null })), (e) => e.code === 'invalid-argument');
    assert.equal(appels.length, 0);
    assert.deepEqual(await appel(requete({ data: { action: 'gain', source: 'devis-signe', id: 'd1', uid: 'quelquun-dautre' } })), { ok: true, gagne: 50, or: 50, version: 1 });
    assert.deepEqual(appels, [{ email: 'lea@exemple.test', uid: 'u1', acteur: 'lea@exemple.test', source: 'devis-signe', id: 'd1', projetId: undefined }]); // l'uid vient de la connexion, jamais de la demande
    // 6b : « acheter » passe au service avec l'uid de la connexion, jamais celui de la demande
    appels.length = 0;
    assert.deepEqual(await appel(requete({ data: { action: 'acheter', article: 'parcelle', uid: 'quelquun-dautre' } })), { ok: true, achete: true, or: 0, parcelles: 1, version: 2 });
    assert.deepEqual(appels, [{ email: 'lea@exemple.test', achat: true, uid: 'u1', article: 'parcelle', modele: undefined, c: undefined, l: undefined }]);
    const enPanne = creerAppelVillage({ service: () => ({ gain: async () => { throw new TypeError('boum'); }, acheter: async () => { throw new TypeError('boum'); } }), comptes: ['lea@exemple.test'], journal: (e) => journal.push(e) });
    await assert.rejects(enPanne(requete()), (e) => e.code === 'internal' && e.message === 'Une erreur est survenue. Réessaie.');
    await assert.rejects(enPanne(requete({ data: { action: 'acheter', article: 'parcelle' } })), (e) => e.code === 'internal' && e.message === 'Une erreur est survenue. Réessaie.');
    assert.ok(journal.length >= 2);
    for (const e of journal) {
      const ligne = JSON.parse(ligneDeJournalVillage({ ...e, uid: 'u1', email: 'lea@exemple.test', id: 'd1', projetId: 'p1' }));
      assert.deepEqual(Object.keys(ligne).filter((k) => !['severity', 'message', 'action', 'statut', 'code', 'dureeMs'].includes(k)), []);
      assert.doesNotMatch(JSON.stringify(ligne), /lea@|u1|d1|p1/);
    }
  });

  test('6.A3 vérificateur des achats : acceptée fraîche oui ; à valider, refusée, archivée, ancienne : trop_ancien ; sans base ou en panne : indisponible ; lecture seule', async () => {
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
    assert.equal(await verifier(vieille.id, EMAIL), 'trop_ancien'); // acceptée il y a 3 jours (S5)
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
    for (const f of ['js/os/village-or.js', 'js/os/village-fete.js', 'js/os/bonnes-nouvelles.js', 'js/os/village-boutique.js']) {
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
