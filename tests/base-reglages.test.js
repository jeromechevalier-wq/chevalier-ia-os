// Réglages de la connexion à la base (24/11/2026, modules Achats, PR 2) : contrôle des champs, contrat de `lireConnexion`, accès réservé à Jérôme, écran et règles verrouillés par le code.
// Les écrans sont aussi vus dans un navigateur : tests/e2e/base-reglages.spec.js ; les règles Firestore : tests/regles.test.js (B2).
import assert from 'node:assert/strict';
import { test, describe, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import {
  adresseHttpsValide, normaliserConnexion, controlerConnexion, definirConnexion, lireConnexion, controlerDemandeAcces, messageErreurAcces, hotesChanges, evaluerAcces,
  MESSAGE_NON_REGLEE, NOMS_WEBHOOKS, MESSAGE_ACCES_RESEAU, MESSAGE_ACCES_INTERNE,
} from '../js/os/base-reglages.js';
import { compteReserve, COMPTES_RESERVES } from '../js/os/acces-reserve.js';
import { COMPTES_CONSOLE } from '../js/modules/console/acces.js';

const lire = (f) => readFileSync(new URL(`../${f}`, import.meta.url), 'utf8');
// Valeurs fictives : construites ici pour que le test n'écrive aucune adresse « en dur » comme exemple.
const https = (hote, chemin = '') => `${['https', ''].join(':')}//${hote}${chemin}`;
const valides = () => ({
  adresseBase: https('base.exemple.test'),
  clePublique: 'cle-publique-fictive',
  espace: 'espace-essai',
  webhooks: { validation: https('auto.exemple.test', '/a'), actions: https('auto.exemple.test', '/b'), suggestions: https('auto.exemple.test', '/c'), ajoutFacture: https('auto.exemple.test', '/d') },
});

describe('B1 adresses : https seulement', () => {
  test('B1 une adresse https est acceptée ; http, sans protocole, autre protocole, identifiants intégrés, espaces, trop longue : refusées', () => {
    assert.equal(adresseHttpsValide(https('base.exemple.test')), true);
    assert.equal(adresseHttpsValide(https('auto.exemple.test', '/chemin?x=1')), true);
    for (const faux of ['', ' ', 'base.exemple.test', `http://base.exemple.test`, 'ftp://base.exemple.test', 'javascript:alert(1)', 'https://', `${https('base.exemple.test')} `, ` ${https('base.exemple.test')}`,
      'https://utilisateur:secret@base.exemple.test', `${https('x.exemple.test')}/${'a'.repeat(600)}`, null, undefined, 42, {}]) assert.equal(adresseHttpsValide(faux), false, String(faux));
  });
});

describe('B1 contrôle des réglages', () => {
  test('B1 des valeurs valables passent ; elles sont rognées', () => {
    const r = controlerConnexion({ ...valides(), espace: '  espace-essai  ' });
    assert.equal(r.ok, true);
    assert.deepEqual(r.erreurs, {});
    assert.equal(r.connexion.espace, 'espace-essai');
  });
  test('B1 cas vide : tout est signalé, sauf les quatre adresses d\'automatisations (facultatives)', () => {
    const r = controlerConnexion({});
    assert.equal(r.ok, false);
    assert.deepEqual(Object.keys(r.erreurs).sort(), ['adresseBase', 'clePublique', 'espace']);
    assert.deepEqual(controlerConnexion(null).ok, false);
  });
  test('B1 cas d\'erreur : adresse http, clé avec espace, nom d\'espace avec majuscule ou accent, adresse d\'automatisation en http', () => {
    const r = controlerConnexion({ ...valides(), adresseBase: 'http://base.exemple.test', clePublique: 'a b', espace: 'Espace', webhooks: { ...valides().webhooks, actions: 'http://auto.exemple.test' } });
    assert.deepEqual(Object.keys(r.erreurs).sort(), ['adresseBase', 'clePublique', 'espace', 'webhooks.actions']);
    for (const espace of ['Espace', 'espace_1', 'é', 'a'.repeat(41), 'a b']) assert.ok(controlerConnexion({ ...valides(), espace }).erreurs.espace, espace);
    for (const espace of ['a', 'espace-1', '123', 'a'.repeat(40)]) assert.equal(controlerConnexion({ ...valides(), espace }).erreurs.espace, undefined, espace);
  });
  test('B1 une adresse d\'automatisation vide est permise, remplie elle doit être en https', () => {
    assert.equal(controlerConnexion({ ...valides(), webhooks: {} }).ok, true);
    assert.equal(controlerConnexion({ ...valides(), webhooks: { validation: 'x' } }).erreurs['webhooks.validation'] !== undefined, true);
  });
  test('B1 normaliser : types inattendus ignorés, les quatre adresses toujours présentes', () => {
    const n = normaliserConnexion({ adresseBase: 42, clePublique: ['a'], espace: null, webhooks: 'x' });
    assert.deepEqual(n, { adresseBase: '', clePublique: '', espace: '', webhooks: Object.fromEntries(NOMS_WEBHOOKS.map((x) => [x, ''])) });
    assert.deepEqual([...NOMS_WEBHOOKS], ['validation', 'actions', 'suggestions', 'ajoutFacture']);
  });
});

describe('B2 contrat de lireConnexion', () => {
  beforeEach(() => definirConnexion(null));
  test('B2 non réglée : une erreur lisible', () => {
    assert.throws(() => lireConnexion(), { message: 'Connexion à la base non réglée' });
    assert.equal(MESSAGE_NON_REGLEE, 'Connexion à la base non réglée');
  });
  test('B2 réglée : la forme exacte du contrat, en copie', () => {
    assert.equal(definirConnexion({ ...valides(), modifiePar: 'x', modifieLe: 'y' }), true);
    const c = lireConnexion();
    assert.deepEqual(Object.keys(c).sort(), ['adresseBase', 'clePublique', 'espace', 'webhooks']);
    assert.deepEqual(Object.keys(c.webhooks).sort(), ['actions', 'ajoutFacture', 'suggestions', 'validation']);
    c.espace = 'modifie'; c.webhooks.actions = 'x';
    assert.equal(lireConnexion().espace, 'espace-essai', 'modifier la copie ne change pas la mémoire');
  });
  test('B2 un document incomplet ou invalide compte comme non réglé ; une adresse d\'automatisation fausse ne bloque pas les trois champs obligatoires', () => {
    assert.equal(definirConnexion({ adresseBase: https('base.exemple.test') }), false);
    assert.equal(definirConnexion({ ...valides(), adresseBase: 'http://base.exemple.test' }), false);
    assert.throws(() => lireConnexion());
    assert.equal(definirConnexion({ ...valides(), webhooks: { validation: 'x' } }), true);
  });
  test('B2 une adresse d\'automatisation invalide (pas en https) est VIDÉE en mémoire, jamais gardée ; les adresses valables restent', () => {
    assert.equal(definirConnexion({ ...valides(), webhooks: { ...valides().webhooks, validation: 'http://auto.exemple.test/a', actions: 'pas une adresse' } }), true);
    const c = lireConnexion();
    assert.equal(c.webhooks.validation, '');
    assert.equal(c.webhooks.actions, '');
    assert.equal(c.webhooks.suggestions, valides().webhooks.suggestions);
    assert.equal(c.webhooks.ajoutFacture, valides().webhooks.ajoutFacture);
  });
});

describe('B2 changement d\'hôte : tout hôte (nom et port) différent de celui enregistré est à confirmer', () => {
  test('B2 même hôte (autre chemin) : rien ; champ vidé : rien ; rien de saisi : rien', () => {
    assert.deepEqual(hotesChanges(valides(), { ...valides(), adresseBase: https('base.exemple.test', '/autre-chemin') }), []);
    assert.deepEqual(hotesChanges(valides(), { ...valides(), webhooks: { ...valides().webhooks, actions: '' } }), []);
    assert.deepEqual(hotesChanges({}, {}), []);
  });
  test('B2 premier enregistrement : la base et chaque adresse d\'automatisation saisies sont à confirmer (le badge et les tickets partent vers elles)', () => {
    assert.deepEqual(hotesChanges({}, valides()).map((x) => [x.champ, x.avant, x.apres]), [
      ['adresseBase', '', 'base.exemple.test'], ['webhooks.validation', '', 'auto.exemple.test'], ['webhooks.actions', '', 'auto.exemple.test'],
      ['webhooks.suggestions', '', 'auto.exemple.test'], ['webhooks.ajoutFacture', '', 'auto.exemple.test'],
    ]);
    assert.deepEqual(hotesChanges(null, { ...valides(), webhooks: {} }).map((x) => x.champ), ['adresseBase']);
  });
  test('B2 adresse d\'automatisation vidée puis remplie avec un autre hôte : à confirmer', () => {
    assert.deepEqual(hotesChanges({ ...valides(), webhooks: {} }, valides()).map((x) => x.champ), ['webhooks.validation', 'webhooks.actions', 'webhooks.suggestions', 'webhooks.ajoutFacture']);
  });
  test('B2 le port compte : même nom d\'hôte, autre port = autre hôte', () => {
    const r = hotesChanges(valides(), { ...valides(), adresseBase: https('base.exemple.test:8443') });
    assert.deepEqual(r.map((x) => [x.avant, x.apres]), [['base.exemple.test', 'base.exemple.test:8443']]);
  });
  test('B2 un hôte déjà réglé remplacé : la base et l\'automatisation concernée sont rendues, avec l\'ancien et le nouvel hôte', () => {
    const apres = { ...valides(), adresseBase: https('autre-base.exemple.test'), webhooks: { ...valides().webhooks, suggestions: https('autre-auto.exemple.test', '/c') } };
    assert.deepEqual(hotesChanges(valides(), apres).map((x) => [x.champ, x.avant, x.apres]), [
      ['adresseBase', 'base.exemple.test', 'autre-base.exemple.test'],
      ['webhooks.suggestions', 'auto.exemple.test', 'autre-auto.exemple.test'],
    ]);
  });
});

describe('B2 état de l\'accès (écrans des modules Achats)', () => {
  const bonBadge = { jeton: 'j', claims: { role: 'authenticated', espace_base: 'espace-essai' } };
  beforeEach(() => definirConnexion(null));
  test('B2 connecté : réglages lus, badge avec la mention et le bon espace', async () => {
    assert.deepEqual(await evaluerAcces({ charger: async () => definirConnexion(valides()), obtenirBadge: async () => bonBadge }), { etat: 'connecte' });
  });
  test('B2 non réglée : rien d\'enregistré (la lecture a réussi mais la connexion est vide)', async () => {
    assert.deepEqual(await evaluerAcces({ charger: async () => definirConnexion(null), obtenirBadge: async () => bonBadge }), { etat: 'non-regle' });
  });
  test('B2 « Reconnecte-toi » : badge sans la mention, ou avec un autre espace ; le badge n\'est rafraîchi (forcer) que sur demande : jamais à l\'ouverture d\'un écran', async () => {
    const demandes = [];
    const sans = async (forcer) => { demandes.push(Boolean(forcer)); return { jeton: 'j', claims: {} }; };
    assert.deepEqual(await evaluerAcces({ charger: async () => definirConnexion(valides()), obtenirBadge: sans }), { etat: 'reconnexion' });
    assert.deepEqual(demandes, [false], 'ouverture d\'un écran : aucun rafraîchissement forcé');
    demandes.length = 0;
    assert.deepEqual(await evaluerAcces({ charger: async () => definirConnexion(valides()), obtenirBadge: sans, forcer: true }), { etat: 'reconnexion' });
    assert.deepEqual(demandes, [false, true], '« Revérifier » : un badge neuf est demandé, une fois');
    const autre = async () => ({ jeton: 'j', claims: { role: 'authenticated', espace_base: 'autre-espace' } });
    assert.deepEqual(await evaluerAcces({ charger: async () => definirConnexion(valides()), obtenirBadge: autre }), { etat: 'reconnexion' });
    const apresRafraichissement = async (forcer) => (forcer ? bonBadge : { jeton: 'j', claims: {} });
    assert.deepEqual(await evaluerAcces({ charger: async () => definirConnexion(valides()), obtenirBadge: apresRafraichissement }), { etat: 'reconnexion' });
    assert.deepEqual(await evaluerAcces({ charger: async () => definirConnexion(valides()), obtenirBadge: apresRafraichissement, forcer: true }), { etat: 'connecte' });
    assert.deepEqual(await evaluerAcces({ charger: async () => definirConnexion(valides()), obtenirBadge: async () => { throw new Error('pas de session'); } }), { etat: 'reconnexion' });
  });
  test('B2 réglages illisibles : la lecture échoue', async () => {
    assert.deepEqual(await evaluerAcces({ charger: async () => { throw new Error('hors ligne'); }, obtenirBadge: async () => bonBadge }), { etat: 'illisible' });
  });
});

describe('B3 donner ou retirer l\'accès', () => {
  test('B3 contrôle de l\'e-mail et de l\'espace ; l\'e-mail est mis en minuscules', () => {
    const ok = controlerDemandeAcces({ email: '  Personne@Exemple.TEST ', espace: 'espace-essai' });
    assert.equal(ok.ok, true);
    assert.deepEqual(ok.demande, { email: 'personne@exemple.test', espace: 'espace-essai' });
    assert.deepEqual(Object.keys(controlerDemandeAcces({}).erreurs).sort(), ['email', 'espace']);
    for (const email of ['x', 'x@y', 'a b@c.d', '<a@b.c>']) assert.ok(controlerDemandeAcces({ email, espace: 'a' }).erreurs.email, email);
    assert.ok(controlerDemandeAcces({ email: 'a@b.c', espace: 'A B' }).erreurs.espace);
  });
  test('B3 les messages d\'erreur du serveur sont lisibles ; le reste reçoit le message générique', () => {
    assert.equal(messageErreurAcces({ code: 'functions/permission-denied', message: 'Ce compte ne peut pas faire cela. [403]' }), 'Ce compte ne peut pas faire cela.');
    assert.equal(messageErreurAcces({ code: 'functions/internal', message: 'Lecture du compte impossible. [500]' }), 'Lecture du compte impossible.', 'un message du serveur est montré, même en « internal »');
    assert.equal(messageErreurAcces({ code: 'functions/internal', message: 'INTERNAL' }), MESSAGE_ACCES_INTERNE, 'un message qui répète le code (sans tenir compte de la casse) ne dit rien : message français fixe');
    assert.equal(messageErreurAcces({ code: 'functions/Permission-Denied', message: 'PERMISSION-DENIED' }), MESSAGE_ACCES_RESEAU, 'la casse ne trompe pas la comparaison');
    assert.equal(messageErreurAcces({ code: 'functions/unavailable', message: 'boom' }), MESSAGE_ACCES_RESEAU);
    assert.equal(messageErreurAcces(null), MESSAGE_ACCES_RESEAU);
    assert.doesNotMatch(MESSAGE_ACCES_INTERNE, /AIza|https?:|@|token|jeton/i, 'aucun secret ni adresse dans le message');
  });
  test('B3 la liste de l\'écran est celle de la Console : Jérôme seul', () => {
    assert.deepEqual([...COMPTES_RESERVES], [...COMPTES_CONSOLE]);
    assert.equal(compteReserve({ email: COMPTES_RESERVES[0].toUpperCase() }), true);
    for (const c of [null, undefined, {}, { email: 'jeromebot.chevalierbot@gmail.com' }, { email: 'editeur@client-fictif.example' }, { email: 42 }]) assert.equal(compteReserve(c), false);
  });
});

describe('B4 verrous du code', () => {
  test('B4 aucun fichier n\'écrit une adresse https ni ne fait d\'appel réseau direct ; seul l\'écran atteint la couche d\'accès, par un seul chemin : acces-base.js (PR 4, remplace le verrou « pas branchée » de la PR 2)', () => {
    for (const f of ['js/os/base-reglages.js', 'js/os/base-reglages-ecran.js', 'js/os/base-reglages-donnees.js', 'js/os/acces-reserve.js']) {
      const t = lire(f).split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');
      assert.doesNotMatch(t, /https?:\/\/(?!www\.gstatic\.com\/firebasejs\/12\.19\.0\/)/, `${f} : adresse écrite en dur`);
      assert.doesNotMatch(t, /\bfetch\s*\(|XMLHttpRequest|sendBeacon|WebSocket|EventSource/, `${f} : appel réseau direct`);
      assert.doesNotMatch(t, /from '[^']*(supabase|actions-metier)/i, `${f} : la couche d'accès (supabase, actions-metier) ne s'importe que par acces-base.js`);
      const importeAcces = /from '\.\/acces-base\.js'/.test(t);
      assert.equal(importeAcces, f === 'js/os/base-reglages-ecran.js', `${f} : seul l'écran importe acces-base.js (sinon boucle d'imports)`);
    }
    assert.doesNotMatch(lire('js/os/base-reglages.js'), /^import /m, 'le fichier de contrôle reste pur');
    assert.deepEqual([...lire('js/os/base-reglages-ecran.js').matchAll(/import \{ ([^}]*) \} from '\.\/acces-base\.js'/g)].map((m) => m[1].trim()), ['testerAvec']);
  });
  test('B4 l\'écran ne parle à la fonction du serveur que par un seul nom, `baseAccorderAcces`, depuis un seul fichier', () => {
    const t = lire('js/os/base-reglages-donnees.js');
    assert.deepEqual([...t.matchAll(/httpsCallable\(fonctions\(\), '([A-Za-z]+)'\)/g)].map((m) => m[1]), ['baseAccorderAcces']);
    assert.doesNotMatch(lire('js/os/base-reglages-ecran.js'), /httpsCallable|firebase-firestore/);
  });
  test('B4 la section est déclarée à Jérôme seul dans le registre et filtrée dans la page Réglages', () => {
    assert.match(lire('js/os/registre.js'), /id: 'base', libelle: 'Connexion à la base'[^\n]*jeromeSeulement: true/);
    const r = lire('js/os/reglages.js');
    assert.match(r, /base: \(ctx, etat\) => \[sectionConnexionBase\(ctx, etat\)\]/);
    assert.match(r, /jerome: compteReserve\(c\.compte\)/);
  });
  test('B4 la règle Firestore : écriture réservée au compte de Jérôme, exclue du joker', () => {
    const r = lire('firestore.rules');
    assert.match(r, /match \/base_parametres\/\{id\} \{\s+allow read: if compteAutorise\(\);\s+allow write: if compteJeromeSeul\(\);\s+\}/);
    assert.match(r, /!\(collection in \[[^\]]*'base_parametres'[^\]]*\]\)/);
  });
});
