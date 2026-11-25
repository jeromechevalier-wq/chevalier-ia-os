// Chantier 0 (25/11/2026) : la fiche reglages_maison/maison (comptes, n8n, projet lié) et l'identité de la maison (projet lu auprès de Google).
// RM1-RM6 : lecture de la fiche (présente, absente = refus, mal formée = refus, cache de 60 s, échec jamais gardé). RM7 : Firestore (émulateur).
// RM8-RM10 : non-régression : avec GCLOUD_PROJECT = chevalier-ia-os puis chevalier-ia-app, chaque adresse calculée est égale, caractère pour caractère, à l'ancienne valeur écrite en dur.
// RM11-RM13 : contrôles d'accès du serveur branchés sur la fiche (Console, base, ClickSend, super admins) ; le bot reste refusé partout où il l'était.
import { test, describe, beforeEach, after } from 'node:test';
import assert from 'node:assert/strict';
import {
  creerLecteurReglagesMaison, validerReglagesMaison, ReglagesMaisonIndisponibles, emailDans, listeDeComptes, comptesDe, estJeromeSeul, texteDe, lireFicheFirestore, remplacerSourcePourEssais,
} from '../functions/src/securite/reglages-maison.js';
import { projetCourant, adresseSite, originesSite, adresseFonction, reserveParDefaut } from '../functions/src/securite/maison.js';
import { FICHE_INVENTEE, FICHE_ESSAI, COMPTE_JEROME, COMPTE_BOT, brancherFicheEssai, semerFicheEmulateur } from './_reglages-maison-essai.js';

const PROJET_AVANT = process.env.GCLOUD_PROJECT;
const CONFIG_AVANT = process.env.FIREBASE_CONFIG;
const remettre = () => {
  if (PROJET_AVANT === undefined) delete process.env.GCLOUD_PROJECT; else process.env.GCLOUD_PROJECT = PROJET_AVANT;
  if (CONFIG_AVANT === undefined) delete process.env.FIREBASE_CONFIG; else process.env.FIREBASE_CONFIG = CONFIG_AVANT;
};
after(() => { remettre(); remplacerSourcePourEssais(); });

describe('Fiche reglages_maison/maison : lecture', () => {
  test('RM1 fiche présente : listes normalisées (minuscules, espaces), textes lus, n8n_url réduite à https://hôte', async () => {
    const lire = creerLecteurReglagesMaison({ lireDocument: async () => ({ ...FICHE_INVENTEE, comptes_autorises: [' Admin@Exemple.test ', 'bot@exemple.test'], n8n_url: 'https://n8n.exemple.test/' }), journal: () => {} });
    const f = await lire();
    assert.deepEqual([...f.comptes_autorises], ['admin@exemple.test', 'bot@exemple.test']);
    assert.equal(f.n8n_url, 'https://n8n.exemple.test');
    assert.equal(f.proprietaire_par_defaut, 'admin@exemple.test');
    assert.ok(Object.isFrozen(f) && Object.isFrozen(f.comptes_autorises), 'fiche gelée : aucun appelant ne peut la modifier');
  });
  test('RM2 fiche absente = refus (ReglagesMaisonIndisponibles), message clair dans le journal du serveur, jamais de valeur', async () => {
    const lignes = [];
    const lire = creerLecteurReglagesMaison({ lireDocument: async () => null, journal: (e) => lignes.push(e) });
    await assert.rejects(lire(), ReglagesMaisonIndisponibles);
    assert.equal(lignes.length, 1);
    assert.match(lignes[0].raison, /absente/);
  });
  test('RM3 fiche mal formée = refus : liste qui n\'est pas une liste, adresse invalide, n8n en http ou avec un chemin, projet lié invalide', async () => {
    for (const mauvais of [
      { comptes_autorises: 'admin@exemple.test' },
      { comptes_autorises: ['pas-une-adresse'] },
      { super_admins: [42] },
      { n8n_url: 'http://n8n.exemple.test' },
      { n8n_url: 'https://n8n.exemple.test/webhook/x' },
      { n8n_url: 'https://cle@n8n.exemple.test' },
      { proprietaire_par_defaut: 'personne' },
      { projet_plateforme_lie: 'Projet Avec Espaces' },
      { n8n_url: 12 },
    ]) assert.throws(() => validerReglagesMaison({ ...FICHE_INVENTEE, ...mauvais }), ReglagesMaisonIndisponibles, JSON.stringify(mauvais));
    assert.throws(() => validerReglagesMaison(['liste']), ReglagesMaisonIndisponibles);
  });
  test('RM4 listes absentes = vides (personne), textes absents = vides', () => {
    const f = validerReglagesMaison({});
    for (const l of ['comptes_autorises', 'comptes_jerome_seul', 'super_admins', 'comptes_oauth_autorises']) assert.deepEqual([...f[l]], []);
    for (const t of ['proprietaire_par_defaut', 'n8n_url', 'projet_plateforme_lie']) assert.equal(f[t], '');
  });
  test('RM5 cache de 60 s : une seule lecture pendant 60 s, une nouvelle ensuite', async () => {
    let t = 0;
    let lectures = 0;
    const lire = creerLecteurReglagesMaison({ lireDocument: async () => { lectures += 1; return FICHE_INVENTEE; }, maintenant: () => t, journal: () => {} });
    await lire(); await lire(); t = 59_999; await lire();
    assert.equal(lectures, 1);
    t = 60_000; await lire();
    assert.equal(lectures, 2);
  });
  test('RM6 un échec n\'est jamais gardé : la fiche réparée est lue au coup suivant ; erreur de lecture = refus', async () => {
    let panne = true;
    const lire = creerLecteurReglagesMaison({ lireDocument: async () => { if (panne) throw new Error('Firestore en panne : détail interne'); return FICHE_INVENTEE; }, journal: () => {} });
    await assert.rejects(lire(), (e) => e instanceof ReglagesMaisonIndisponibles && !/détail interne/.test(e.message));
    panne = false;
    assert.equal((await lire()).n8n_url, 'https://n8n.exemple.test');
    // Les contrôles d'accès transforment toute panne en liste vide (refus), jamais en ouverture.
    const enPanne = comptesDe('comptes_autorises', async () => { throw new ReglagesMaisonIndisponibles('x'); });
    assert.deepEqual(await enPanne(), []);
    assert.equal(await emailDans(enPanne, 'admin@exemple.test'), false);
    assert.equal(await emailDans(async () => { throw new Error('x'); }, 'admin@exemple.test'), false);
    assert.deepEqual(await listeDeComptes(undefined), []);
  });
  test('RM6b la comparaison de l\'e-mail reste celle de chaque contrôle d\'avant : exacte (fonctions de l\'écran), minuscules (OAuth, Console, base), normalisée (super admins, Jérôme seul)', async () => {
    const liste = ['admin@exemple.test'];
    assert.equal(await emailDans(liste, 'admin@exemple.test'), true);
    assert.equal(await emailDans(liste, 'Admin@Exemple.test'), false, 'exacte par défaut');
    assert.equal(await emailDans(liste, ' admin@exemple.test'), false);
    assert.equal(await emailDans(liste, 'Admin@Exemple.test', 'minuscules'), true);
    assert.equal(await emailDans(liste, ' admin@exemple.test', 'minuscules'), false, 'minuscules : les espaces comptent');
    assert.equal(await emailDans(liste, ' Admin@Exemple.test ', 'normalisee'), true);
    assert.equal(await emailDans(liste, 'admin@exemple.test.evil.test', 'normalisee'), false, 'jamais de correspondance partielle');
    await assert.rejects(emailDans(liste, 'admin@exemple.test', 'inconnue'), /forme inconnue/);
    assert.equal(await estJeromeSeul(' Admin@Exemple.test ', true, liste), true, 'Jérôme seul : comme js/os/administrateur.js (casse et espaces ignorés)');
    assert.equal(await estJeromeSeul('admin@exemple.test', false, liste), false, 'e-mail non vérifié : refus');
  });
  test('RM7 Firestore (émulateur) : fiche écrite par le SDK d\'administration lue par le serveur ; supprimée = absente', { skip: !process.env.FIRESTORE_EMULATOR_HOST && 'émulateur Firestore absent' }, async () => {
    process.env.GCLOUD_PROJECT = PROJET_AVANT || 'demo-chevalier-ia-os';
    await semerFicheEmulateur({ fiche: FICHE_INVENTEE });
    const lu = validerReglagesMaison(await lireFicheFirestore());
    assert.deepEqual([...lu.comptes_jerome_seul], ['admin@exemple.test']);
    await semerFicheEmulateur({ fiche: null });
    assert.equal(await lireFicheFirestore(), null);
    await semerFicheEmulateur({ fiche: FICHE_ESSAI }); // les autres essais de la série retrouvent la fiche d'avant
    remettre();
  });
});

describe('Identité de la maison : rien n\'est écrit en dur, tout est égal à avant', () => {
  beforeEach(() => remettre());
  test('RM8 projet inconnu = refus (jamais de projet par défaut)', () => {
    delete process.env.GCLOUD_PROJECT;
    assert.throws(() => projetCourant(), /Projet Google inconnu/);
    assert.throws(() => adresseSite(), /Projet Google inconnu/);
    process.env.GCLOUD_PROJECT = 'Pas Un Projet';
    assert.throws(() => projetCourant(), /Projet Google inconnu/);
  });
  test('RM9 CRM de Jérôme (chevalier-ia-os) : émetteur OAuth, ressource, métadonnées, origines, liens, adresse SMS, réserve : identiques à l\'ancien code', async () => {
    process.env.GCLOUD_PROJECT = 'chevalier-ia-os';
    delete process.env.FIREBASE_CONFIG;
    const O = await import('../functions/src/oauth/config.js');
    const R = await import('../functions/src/oauth/routeur.js');
    const G = await import('../functions/src/mcp/gestionnaire.js');
    assert.equal(O.emetteur(), 'https://chevalier-ia-os.web.app'); // l'émetteur OAuth ne change pas d'un caractère
    assert.equal(O.ressource(), 'https://chevalier-ia-os.web.app/mcp');
    assert.equal(O.urlMetadonneesRessource(), 'https://chevalier-ia-os.web.app/.well-known/oauth-protected-resource/mcp');
    assert.deepEqual(O.originesAutorisees(), ['https://chevalier-ia-os.web.app', 'https://chevalier-ia-os.firebaseapp.com']);
    assert.deepEqual(R.metadonneesServeur(), {
      issuer: 'https://chevalier-ia-os.web.app',
      authorization_endpoint: 'https://chevalier-ia-os.web.app/oauth/authorize',
      token_endpoint: 'https://chevalier-ia-os.web.app/oauth/token',
      registration_endpoint: 'https://chevalier-ia-os.web.app/oauth/register',
      response_types_supported: ['code'], response_modes_supported: ['query'], grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256'], token_endpoint_auth_methods_supported: ['none'], scopes_supported: ['offline_access'],
    });
    assert.deepEqual(R.metadonneesRessource(), { resource: 'https://chevalier-ia-os.web.app/mcp', authorization_servers: ['https://chevalier-ia-os.web.app'], bearer_methods_supported: ['header'] });
    assert.equal(G.baseLienMaison(), 'https://chevalier-ia-os.web.app');
    assert.deepEqual(G.ORIGINES_AUTORISEES(), ['https://chevalier-ia-os.web.app', 'https://chevalier-ia-os.firebaseapp.com']);
    assert.equal(`${adresseFonction('rdvReponseSms')}/jeton`, 'https://europe-west9-chevalier-ia-os.cloudfunctions.net/rdvReponseSms/jeton');
    assert.equal(reserveParDefaut(), 'chevalier-ia-os.firebasestorage.app');
    process.env.FIREBASE_CONFIG = JSON.stringify({ projectId: 'chevalier-ia-os', storageBucket: 'chevalier-ia-os.firebasestorage.app' });
    assert.equal(reserveParDefaut(), 'chevalier-ia-os.firebasestorage.app', 'réserve lue dans FIREBASE_CONFIG (posée par Google sur chaque fonction)');
  });
  test('RM10 plateforme des clients (chevalier-ia-app) : émetteur, origines, adresses d\'un client, liens, adresse SMS, réserve : identiques à l\'ancien code', async () => {
    process.env.GCLOUD_PROJECT = 'chevalier-ia-app';
    delete process.env.FIREBASE_CONFIG;
    const C = await import('../functions/src/clients/config.js');
    assert.equal(C.emetteurPlateforme(), 'https://chevalier-ia-app.web.app');
    assert.deepEqual(C.originesPlateforme(), ['https://chevalier-ia-app.web.app', 'https://chevalier-ia-app.firebaseapp.com']);
    assert.deepEqual(C.adressesClient('client-a'), {
      ressource: 'https://chevalier-ia-app.web.app/mcp/client-a',
      metadonneesRessource: 'https://chevalier-ia-app.web.app/.well-known/oauth-protected-resource/mcp/client-a',
      metadonneesServeur: 'https://chevalier-ia-app.web.app/.well-known/oauth-authorization-server/mcp/client-a',
      emetteur: 'https://chevalier-ia-app.web.app/mcp/client-a',
      autoriser: 'https://chevalier-ia-app.web.app/oauth/client-a/authorize',
      jeton: 'https://chevalier-ia-app.web.app/oauth/client-a/token',
      enregistrer: 'https://chevalier-ia-app.web.app/oauth/client-a/register',
      approuver: '/oauth/client-a/approve',
    });
    assert.equal(`${adresseFonction('rdvReponseSms')}/client-a/jeton`, 'https://europe-west9-chevalier-ia-app.cloudfunctions.net/rdvReponseSms/client-a/jeton');
    assert.equal(reserveParDefaut(), 'chevalier-ia-app.firebasestorage.app');
    assert.deepEqual(originesSite(), ['https://chevalier-ia-app.web.app', 'https://chevalier-ia-app.firebaseapp.com']);
  });
});

describe('Contrôles d\'accès du serveur branchés sur la fiche', () => {
  beforeEach(() => remettre());
  test('RM11 « Jérôme seul » (Console, base, ClickSend, réglages du Pilotage) : seul comptes_jerome_seul passe ; le bot, un client et un e-mail non vérifié sont refusés ; fiche absente = refus', async () => {
    await brancherFicheEssai(FICHE_INVENTEE);
    assert.equal(await estJeromeSeul('admin@exemple.test', true), true);
    assert.equal(await estJeromeSeul(' ADMIN@exemple.test ', true), true);
    assert.equal(await estJeromeSeul('admin@exemple.test', false), false, 'e-mail non vérifié');
    assert.equal(await estJeromeSeul('bot@exemple.test', true), false, 'le bot n\'est jamais « Jérôme seul »');
    assert.equal(await estJeromeSeul('client@exemple.test', true), false);
    assert.equal(await estJeromeSeul(undefined, true), false);
    const { creerAppelConsole } = await import('../functions/src/console/appel.js');
    process.env.GCLOUD_PROJECT = 'demo-maison-essai';
    const appel = creerAppelConsole({ version: '0.0.0' });
    assert.deepEqual(await appel({ auth: { token: { email: 'admin@exemple.test', email_verified: true } } }), { version: '0.0.0', serveur: 'ok', plateforme: 'demo-maison-essai' });
    await assert.rejects(appel({ auth: { token: { email: 'bot@exemple.test', email_verified: true } } }), { code: 'permission-denied' });
    await brancherFicheEssai(null);
    await assert.rejects(appel({ auth: { token: { email: 'admin@exemple.test', email_verified: true } } }), { code: 'permission-denied' }, 'fiche absente : même Jérôme est refusé');
  });
  test('RM12 super admins (outils MCP réservés) : lus dans super_admins ; fiche absente = personne', async () => {
    await brancherFicheEssai(FICHE_INVENTEE);
    const { estSuperAdmin } = await import('../functions/src/mcp/gestionnaire.js');
    assert.equal(await estSuperAdmin({ jeton: { profil: 'complet', email: 'admin@exemple.test' } }), true);
    assert.equal(await estSuperAdmin({ jeton: { profil: 'complet', email: 'bot@exemple.test' } }), false, 'bot absent de super_admins dans cette fiche');
    assert.equal(await estSuperAdmin({ jeton: { profil: 'complet' } }), false, 'jeton statique sans e-mail');
    await brancherFicheEssai(null);
    assert.equal(await estSuperAdmin({ jeton: { profil: 'complet', email: 'admin@exemple.test' } }), false);
  });
  test('RM13 fiche d\'avant le chantier 0 : le bot reste refusé partout où il l\'était (Console, base, Jérôme seul) et accepté là où il l\'était (comptes du CRM, OAuth, super admins)', async () => {
    await brancherFicheEssai(FICHE_ESSAI);
    const { comptesAutorises, comptesOauthAutorises, superAdmins } = await import('../functions/src/securite/reglages-maison.js');
    for (const liste of [comptesAutorises, comptesOauthAutorises, superAdmins]) {
      assert.equal(await emailDans(liste, COMPTE_JEROME), true);
      assert.equal(await emailDans(liste, COMPTE_BOT), true);
    }
    assert.equal(await estJeromeSeul(COMPTE_JEROME, true), true);
    assert.equal(await estJeromeSeul(COMPTE_BOT, true), false);
    const { creerAppelAccorderAcces } = await import('../functions/src/base/acces-appel.js');
    const auth = { getUserByEmail: async () => { throw new Error('ne doit pas être appelé'); }, setCustomUserClaims: async () => {} };
    await assert.rejects(creerAppelAccorderAcces({ auth })({ auth: { token: { email: COMPTE_BOT, email_verified: true } }, data: { email: 'x@exemple.test', espace: 'essai' } }), { code: 'permission-denied' });
    assert.equal(await texteDe('proprietaire_par_defaut'), COMPTE_JEROME);
  });
});
