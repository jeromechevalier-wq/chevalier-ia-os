// Chantier 0, partie navigateur (26/11/2026) : plus aucun compte ni aucune configuration écrits dans js/. Sans réseau, sans émulateur, adresses inventées.
//  - js/os/comptes-maison.js : lecture de reglages_maison/public (avant la connexion) et /ecran (après), listes en mémoire, fonctions synchrones de l'écran ;
//  - js/os/firebase-init.js : configuration Firebase lue dans /__/firebase/init.json (CRM), fichier généré (plateforme), factice (émulateurs) ;
//  - tests/_fiche-emulateur.js : valeurs REST (booléens, objets, listes d'objets) pour semer ecran et public dans l'émulateur.
import { test, describe, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  lirePublic, lireEcran, remplirComptesMaison, viderComptesMaison, personneMaison, personnesMaison, estCompteTitulaire, crmOuvert, definirModeCrm,
  MESSAGE_PUBLIC_ABSENT, MESSAGE_ECRAN_ABSENT,
} from '../js/os/comptes-maison.js';
import { peutVoirConsole } from '../js/modules/console/acces.js';
import { compteReserve } from '../js/os/acces-reserve.js';
import { estAdministrateur } from '../js/os/administrateur.js';
import { configurationDeLaMaison, configDepuisInit, CONFIG_EMULATEURS, ADRESSE_CONFIG_HEBERGEMENT } from '../js/os/firebase-init.js';
import { valeur } from './_fiche-emulateur.js';
import { ECRAN_INVENTE } from './_reglages-maison-essai.js';

const ADMIN = 'admin@exemple.test';
const ROBOT = 'bot@exemple.test';
const user = (email, verifie = true) => ({ email, emailVerified: verifie, uid: `u-${email}` });
const erreur = (code) => Object.assign(new Error(code), { code });
const sansPause = { attentes: [1, 1, 1], pause: async () => {} };

/** `lire` qui rend tour à tour les réponses données (une erreur est lancée). Compte les appels. */
function lecteur(...reponses) {
  const l = async () => { l.appels++; const r = reponses[Math.min(l.appels - 1, reponses.length - 1)]; if (r instanceof Error) throw r; return r; };
  l.appels = 0;
  return l;
}

beforeEach(() => { viderComptesMaison(); definirModeCrm(false); });

describe('CM1 reglages_maison/public : trois cas (plateforme, document absent, panne) et le CRM', () => {
  test('CM1a document lu, mode_crm vrai : le CRM démarre', async () => {
    assert.deepEqual(await lirePublic({ lire: lecteur({ mode_crm: true }), ...sansPause }), { etat: 'crm' });
    assert.equal(crmOuvert(), true);
  });
  test('CM1b lecture refusée (plateforme des clients) : « Espace indisponible » comme avant, sans nouvel essai', async () => {
    const l = lecteur(erreur('permission-denied'));
    assert.deepEqual(await lirePublic({ lire: l, ...sansPause, journal: () => {} }), { etat: 'plateforme' });
    assert.equal(l.appels, 1);
    assert.equal(crmOuvert(), false);
  });
  test('CM1b\' document lu mais mode_crm faux ou absent : plateforme (jamais d\'ouverture par défaut)', async () => {
    for (const donnees of [{ mode_crm: false }, {}, { mode_crm: 'oui' }]) {
      assert.deepEqual(await lirePublic({ lire: lecteur(donnees), ...sansPause }), { etat: 'plateforme' });
      assert.equal(crmOuvert(), false);
    }
  });
  test('CM1c document absent (lecture permise) : message clair, jamais la page de la plateforme', async () => {
    assert.deepEqual(await lirePublic({ lire: lecteur(null), ...sansPause }), { etat: 'absent' });
    assert.equal(crmOuvert(), false);
    assert.match(MESSAGE_PUBLIC_ABSENT, /Réglages de la maison absents \(reglages_maison\/public\)/);
  });
  test('CM1d panne passagère : nouvel essai ; panne persistante : « erreur » (le message propose de recharger)', async () => {
    const l = lecteur(erreur('unavailable'), { mode_crm: true });
    assert.deepEqual(await lirePublic({ lire: l, ...sansPause, journal: () => {} }), { etat: 'crm' });
    assert.equal(l.appels, 2);
    const pauses = [];
    const p = lecteur(erreur('unavailable'));
    assert.deepEqual(await lirePublic({ lire: p, attentes: [10, 20, 30], pause: async (ms) => { pauses.push(ms); }, journal: () => {} }), { etat: 'erreur' });
    assert.equal(p.appels, 4);
    assert.deepEqual(pauses, [10, 20, 30]);
  });
});

describe('CM2 reglages_maison/ecran après la connexion : refus (déconnexion), absent et panne (sans déconnexion)', () => {
  test('CM2a compte de la fiche : nom et portrait lus dans « ecran » ; les listes de l\'écran sont remplies', async () => {
    const r = await lireEcran({ user: user('Admin@Exemple.test'), lire: lecteur(ECRAN_INVENTE), ...sansPause });
    assert.deepEqual(r, { etat: 'ok', compte: { email: ADMIN, uid: 'u-Admin@Exemple.test', nom: 'Admin', avatar: 'assets/admin.png' } });
    assert.deepEqual(personnesMaison().map((p) => p.email), [ADMIN, ROBOT]);
    assert.equal(estCompteTitulaire(ADMIN), true);
  });
  test('CM2b e-mail non vérifié : refus, sans aucune lecture', async () => {
    const l = lecteur(ECRAN_INVENTE);
    assert.deepEqual(await lireEcran({ user: user(ADMIN, false), lire: l, ...sansPause }), { etat: 'refus' });
    assert.deepEqual(await lireEcran({ user: null, lire: l, ...sansPause }), { etat: 'refus' });
    assert.equal(l.appels, 0);
  });
  test('CM2c lecture refusée par les règles (compte hors de la fiche) : refus, sans nouvel essai', async () => {
    const l = lecteur(erreur('permission-denied'));
    assert.deepEqual(await lireEcran({ user: user('intrus@exemple.test'), lire: l, ...sansPause, journal: () => {} }), { etat: 'refus' });
    assert.equal(l.appels, 1);
  });
  test('CM2d compte permis par les règles mais absent des personnes : refus', async () => {
    assert.deepEqual(await lireEcran({ user: user('autre@exemple.test'), lire: lecteur(ECRAN_INVENTE), ...sansPause }), { etat: 'refus' });
  });
  test('CM2e document absent : « absent » (message clair, pas de déconnexion)', async () => {
    assert.deepEqual(await lireEcran({ user: user(ADMIN), lire: lecteur(null), ...sansPause }), { etat: 'absent' });
    assert.match(MESSAGE_ECRAN_ABSENT, /reglages_maison\/ecran/);
  });
  test('CM2f panne persistante : « erreur » après 3 reprises (pas de déconnexion) ; le journal ne contient jamais d\'e-mail', async () => {
    const journal = [];
    const l = lecteur(erreur('unavailable'));
    assert.deepEqual(await lireEcran({ user: user(ADMIN), lire: l, ...sansPause, journal: (...a) => journal.push(a.join(' ')) }), { etat: 'erreur' });
    assert.equal(l.appels, 4);
    assert.ok(journal.length === 4 && journal.every((t) => !t.includes('@')), journal.join('\n'));
  });
});

describe('CM3 listes en mémoire : fonctions synchrones de l\'écran (vide = personne)', () => {
  test('CM3a avant toute lecture : personne ne voit la Console, la connexion à la base ni la vue administrateur ; aucun nom', () => {
    for (const email of [ADMIN, ROBOT, '', null, 42]) {
      assert.equal(peutVoirConsole({ email }), false);
      assert.equal(compteReserve({ email }), false);
      assert.equal(estAdministrateur(email, true), false);
    }
    assert.equal(personneMaison(ADMIN), null);
    assert.deepEqual(personnesMaison(), []);
  });
  test('CM3b après lecture : le titulaire seul (casse ignorée, e-mail vérifié pour l\'administrateur), jamais le robot', () => {
    remplirComptesMaison(ECRAN_INVENTE);
    assert.equal(peutVoirConsole({ email: 'ADMIN@exemple.test' }), true);
    assert.equal(compteReserve({ email: ADMIN }), true);
    assert.equal(estAdministrateur(` ${ADMIN} `, true), true);
    assert.equal(estAdministrateur(ADMIN, false), false);
    for (const c of [{ email: ROBOT }, { email: 'editeur@client-fictif.example' }, null, {}, { email: 42 }]) {
      assert.equal(peutVoirConsole(c), false);
      assert.equal(compteReserve(c), false);
    }
    viderComptesMaison();
    assert.equal(peutVoirConsole({ email: ADMIN }), false, 'déconnexion : listes oubliées');
  });
  test('CM3c entrées mal formées ignorées ; nom vide = adresse ; les copies rendues ne modifient pas la mémoire', () => {
    remplirComptesMaison({ personnes: [null, 'x', { nom: 'Sans e-mail' }, { email: ' Bot@Exemple.test ', nom: '  ' }], comptes_jerome_seul: 'pas une liste' });
    assert.deepEqual(personnesMaison(), [{ email: ROBOT, nom: ROBOT, avatar: '' }]);
    assert.equal(estCompteTitulaire(ROBOT), false);
    personnesMaison()[0].nom = 'modifié';
    assert.equal(personneMaison(ROBOT).nom, ROBOT);
    remplirComptesMaison(undefined);
    assert.deepEqual(personnesMaison(), []);
  });
});

describe('FI configuration Firebase du navigateur : init.json (CRM), fichier généré (plateforme), factice (émulateurs)', () => {
  const INIT = { apiKey: 'cle-essai', authDomain: 'maison-essai.firebaseapp.com', databaseURL: '', projectId: 'maison-essai', storageBucket: 'maison-essai.firebasestorage.app', messagingSenderId: '111', appId: '1:111:web:abc' };
  const ATTENDU = { apiKey: 'cle-essai', authDomain: 'maison-essai.web.app', projectId: 'maison-essai', storageBucket: 'maison-essai.firebasestorage.app', messagingSenderId: '111', appId: '1:111:web:abc' };
  test('FI1 CRM : lit /__/firebase/init.json sans cache, garde les six clés et force <projet>.web.app', async () => {
    const appels = [];
    const r = await configurationDeLaMaison({ modeEmulateurs: false, fichier: {}, charger: async (a, o) => { appels.push([a, o]); return { ok: true, json: async () => INIT }; } });
    assert.deepEqual(r, ATTENDU);
    assert.deepEqual(appels, [[ADRESSE_CONFIG_HEBERGEMENT, { cache: 'no-store' }]]);
  });
  test('FI2 émulateurs : configuration factice locale, aucun appel réseau, projet des tests', async () => {
    const charger = async () => { throw new Error('aucun appel attendu'); };
    assert.deepEqual(await configurationDeLaMaison({ modeEmulateurs: true, projetEmulateurs: 'demo-essai-w3', fichier: {}, charger }), { ...CONFIG_EMULATEURS, projectId: 'demo-essai-w3' });
    assert.equal((await configurationDeLaMaison({ modeEmulateurs: true, fichier: ATTENDU, charger })).projectId, 'demo-chevalier-ia-os');
    assert.doesNotMatch(JSON.stringify(CONFIG_EMULATEURS), /AIza|web\.app|firebaseapp/);
    // Recopiées dans tests/e2e/liens-documents.spec.js (Playwright ne peut pas importer js/) : elles doivent rester identiques.
    const spec = readFileSync(new URL('./e2e/liens-documents.spec.js', import.meta.url), 'utf8');
    assert.ok(spec.includes(`const CLE_CRM = '${CONFIG_EMULATEURS.apiKey}';`) && spec.includes(`const ID_APP_CRM = '${CONFIG_EMULATEURS.messagingSenderId}';`));
  });
  test('FI3 fichier déjà rempli (paquet de la plateforme) : pris tel quel, aucun appel réseau', async () => {
    const charger = async () => { throw new Error('aucun appel attendu'); };
    assert.deepEqual(await configurationDeLaMaison({ modeEmulateurs: false, fichier: ATTENDU, charger }), ATTENDU);
  });
  test('FI4 panne passagère : nouvel essai ; panne persistante : message « Recharger » dans la page, puis erreur', async () => {
    let n = 0;
    const charger = async () => { n++; if (n === 1) return { ok: false, status: 503 }; return { ok: true, json: async () => INIT }; };
    assert.deepEqual(await configurationDeLaMaison({ modeEmulateurs: false, fichier: {}, charger, attentes: [1], pause: async () => {} }), ATTENDU);
    // Document minimal : on vérifie que le message et le bouton sont posés dans #app.
    const poses = [];
    const element = () => ({ setAttribute() {}, addEventListener() {}, append(...e) { poses.push(...e); } });
    const doc = { getElementById: (id) => (id === 'app' ? { replaceChildren: (b) => poses.push(b) } : null), createElement: element };
    await assert.rejects(configurationDeLaMaison({ modeEmulateurs: false, fichier: {}, charger: async () => { throw new TypeError('Failed to fetch'); }, attentes: [1, 1], pause: async () => {}, doc }));
    assert.ok(poses.some((e) => e.textContent === 'Recharger'));
    assert.ok(poses.some((e) => /recharge la page/.test(e.textContent || '')));
  });
  test('FI5 réponse de forme inattendue : refusée (jamais une configuration à moitié)', () => {
    for (const mauvais of [null, {}, { projectId: 'maison-essai' }, { apiKey: 'x', projectId: 'Mauvais Projet' }]) assert.throws(() => configDepuisInit(mauvais), /illisible/);
  });
});

describe('VE valeurs REST de l\'émulateur (_fiche-emulateur.js)', () => {
  test('VE1 texte, booléen, nombres, null, listes de textes, objets et listes d\'objets', () => {
    assert.deepEqual(valeur('a'), { stringValue: 'a' });
    assert.deepEqual(valeur(true), { booleanValue: true });
    assert.deepEqual(valeur(3), { integerValue: '3' });
    assert.deepEqual(valeur(1.5), { doubleValue: 1.5 });
    assert.deepEqual(valeur(null), { nullValue: null });
    assert.deepEqual(valeur(['x']), { arrayValue: { values: [{ stringValue: 'x' }] } });
    assert.deepEqual(valeur([{ email: 'a@exemple.test', actif: false }]), { arrayValue: { values: [{ mapValue: { fields: { email: { stringValue: 'a@exemple.test' }, actif: { booleanValue: false } } } }] } });
  });
});
