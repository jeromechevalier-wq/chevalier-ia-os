// Module « Accès MCP » : déclaration au registre, logique de la page d'information, réglages de la plateforme (réécritures, fonction, configuration
// Firebase, règles) et garde-fous (le MCP de Jérôme ne change pas). Sans réseau, sans émulateur.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MODULES_DECLARES, IDS_MODULES, modulesActifsDuClient, verifierActivation, ecransActifs, moduleAccessible } from '../js/os/registre.js';
import { MODULES, MODULES_CLIENT } from '../js/os/modules.js';
import * as L from '../js/modules/mcp/logique.js';
import { CONFIG_FIREBASE_PLATEFORME, PROFIL_PAR_ROLE, FORMAT_CLIENT, EMETTEUR_PLATEFORME, adressesClient } from '../functions/src/clients/config.js';
import { ROLES } from '../js/os/membres.js';
import { normaliserMarque } from '../js/os/marque.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');
const json = (f) => JSON.parse(lire(f));

describe('registre : le module « mcp »', () => {
  const mcp = MODULES_DECLARES.find((m) => m.id === 'mcp');
  test('déclaré une fois, hors du menu principal, une page d\'information, aucune donnée ni outil à lui, aucune dépendance', () => {
    assert.ok(mcp);
    assert.equal(mcp.reserveAuxClients, undefined, 'plus réservé aux clients (18/10/2026)');
    assert.equal(mcp.horsMenu, true);
    assert.equal(mcp.libelleMenu, 'Connecter mon assistant');
    assert.deepEqual(mcp.ecrans.map((e) => e.route), ['mcp/infos']);
    assert.deepEqual([mcp.collections, mcp.outilsMcp, mcp.dependances], [[], [], []]);
    assert.ok(IDS_MODULES.includes('mcp'));
  });
  test('interrupteur par client : lu dans clients/<client>.modules comme les autres', () => {
    assert.deepEqual(modulesActifsDuClient({ modules: { affaires: true, mcp: true } }).actifs, ['affaires', 'mcp']);
    assert.deepEqual(modulesActifsDuClient({ modules: { affaires: true, mcp: false } }).actifs, ['affaires']);
    assert.deepEqual(modulesActifsDuClient({ modules: { affaires: true } }).actifs, ['affaires'], 'absent = éteint');
    assert.deepEqual(modulesActifsDuClient({ modules: { mcp: 'oui' } }).actifs, [], 'seulement « true » allume');
    assert.deepEqual(verifierActivation(['mcp']).actifs, ['mcp']);
    assert.ok(ecransActifs(['mcp']).some((e) => e.route === 'mcp/infos'));
    assert.equal(moduleAccessible('mcp', ['affaires']), false);
    assert.equal(moduleAccessible('mcp', ['mcp']), true);
  });
  test('le CRM de Jérôme (racine) monte ce module aussi (18/10/2026) ; l\'espace d\'un client aussi', () => {
    assert.ok(MODULES.some((m) => m.id === 'mcp'));
    const m = MODULES_CLIENT.find((x) => x.id === 'mcp');
    assert.equal(typeof m?.monter, 'function');
    assert.equal(m.prefixe, 'mcp');
  });
});

describe('page d\'information : logique', () => {
  test('lien de connexion : <origine>/mcp/<client>, identifiant validé', () => {
    assert.equal(L.lienConnexion('https://chevalier-ia-app.web.app', 'cabinet-martin'), 'https://chevalier-ia-app.web.app/mcp/cabinet-martin');
    assert.equal(L.lienConnexion('https://chevalier-ia-app.web.app/', 'a'), 'https://chevalier-ia-app.web.app/mcp/a');
    for (const mauvais of ['A', '../x', 'a/b', '', 'x'.repeat(41)]) assert.throws(() => L.lienConnexion('https://x.test', mauvais));
    assert.equal(L.lienConnexion('https://chevalier-ia-app.web.app', 'abc'), adressesClient('abc').ressource, 'même adresse que celle du serveur');
  });
  test('sans client (espace de Jérôme) : <origine>/mcp, sans adresse écrite en dur', () => {
    assert.equal(L.lienConnexion('https://exemple.test'), 'https://exemple.test/mcp');
    assert.equal(L.lienConnexion('https://exemple.test/', null), 'https://exemple.test/mcp');
    assert.ok(!/https?:\/\//.test(lire('js/modules/mcp/logique.js').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '')), 'aucune adresse en dur');
  });
  test('mode d\'emploi de la racine : trois lignes, connexion Google, ni jeton ni secret', () => {
    assert.equal(L.MODE_EMPLOI_RACINE.length, 3);
    const t = L.MODE_EMPLOI_RACINE.map((e) => e.texte).join(' ');
    assert.match(t, /Google/); assert.match(t, /Autoriser/);
    assert.doesNotMatch(t, /cia_|jeton|claude-code/i);
    assert.equal(L.PHRASE_COMPTES_RACINE, 'Les comptes autorisés sont fixés par Jérôme.');
  });
  test('client du chemin de base', () => {
    assert.equal(L.clientDuChemin('clients/acme'), 'acme');
    for (const mauvais of ['', null, 'clients/Acme', 'clients/a/b', 'autre/a']) assert.equal(L.clientDuChemin(mauvais), null);
  });
  test('mode d\'emploi : trois lignes, Google et l\'autorisation nommés', () => {
    assert.equal(L.MODE_EMPLOI.length, 3);
    const t = L.MODE_EMPLOI.map((e) => e.texte).join(' ');
    assert.match(t, /Claude/); assert.match(t, /ChatGPT/); assert.match(t, /Google/); assert.match(t, /Autoriser/);
  });
  test('membres : rangés par adresse, libellé du rôle, « toi » repéré ; rôle inconnu écarté', () => {
    const l = L.lignesMembres([{ id: 'zoe@x.test', role: 'lecteur' }, { id: 'Alice@x.test', role: 'editeur', nom: 'Alice' }, { id: 'x@x.test', role: 'admin' }, { id: 'y@x.test' }], 'alice@x.test');
    assert.deepEqual(l.map((m) => m.email), ['Alice@x.test', 'zoe@x.test']);
    assert.equal(l[0].moi, true);
    assert.equal(l[0].libelle, 'Éditeur : consulte et modifie');
    assert.equal(l[1].libelle, 'Lecteur : consulte seulement');
    assert.deepEqual(L.lignesMembres(undefined), []);
  });
  test('un libellé par rôle de la plateforme, et seulement ceux-là', () => {
    assert.deepEqual(Object.keys(L.LIBELLES_ROLE).sort(), Object.keys(ROLES).sort());
    assert.deepEqual(Object.keys(PROFIL_PAR_ROLE).sort(), Object.keys(ROLES).sort());
  });
  test('la page ne règle rien : aucune écriture Firestore dans le module', () => {
    for (const f of ['donnees.js', 'ecran.js', 'index.js', 'logique.js']) assert.doesNotMatch(lire(`js/modules/mcp/${f}`), /\b(setDoc|updateDoc|deleteDoc|addDoc|writeBatch|runTransaction|httpsCallable)\b/, f);
  });
});

describe('plateforme : fonction, adresses, configuration, règles', () => {
  test('la fonction « mcpclients » est exportée par les fonctions de la plateforme (Paris, publique, sans CORS) et jamais par celles du CRM', () => {
    const idx = lire('functions-plateforme/src/index.js');
    assert.match(idx, /export const mcpclients = onRequest\(/);
    assert.match(idx, /region: REGION, maxInstances: 3, memory: '256MiB', timeoutSeconds: 120, invoker: 'public', cors: false, serviceAccount: 'mcp-clients@chevalier-ia-app\.iam\.gserviceaccount\.com'/);
    assert.doesNotMatch(idx, /compute@developer|appspot\.gserviceaccount/); // jamais le compte par défaut du projet (rôle « Éditeur »)
    assert.match(lire('functions-plateforme/src/mcp-clients.js'), /creerGestionnaireClients/);
    assert.doesNotMatch(lire('functions/src/index.js'), /clients|mcpclients/);
    assert.doesNotMatch(lire('firebase.json'), /mcpclients|\/mcp\/\*\*/);
  });
  test('mêmes versions de bibliothèques que le serveur de Jérôme (une seule façon de faire tourner le même code)', () => {
    const a = json('functions/package.json').dependencies;
    const b = json('functions-plateforme/package.json').dependencies;
    for (const dep of ['@modelcontextprotocol/sdk', 'firebase-admin', 'firebase-functions', 'zod', 'puppeteer-core', '@sparticuz/chromium']) assert.equal(b[dep], a[dep], dep);
    const verrou = json('functions-plateforme/package-lock.json');
    for (const dep of ['@modelcontextprotocol/sdk', 'zod', 'puppeteer-core', '@sparticuz/chromium']) assert.equal(verrou.packages[`node_modules/${dep}`]?.version, a[dep], dep);
  });
  test('la copie du serveur pour la plateforme est faite avant chaque déploiement, et ignorée par git', () => {
    assert.match(lire('scripts/preparer-fonctions.js'), /functions-plateforme', 'serveur'/);
    assert.match(lire('.gitignore'), /^functions-plateforme\/serveur\/$/m);
    assert.deepEqual(json('firebase.plateforme.json').functions[0].predeploy, ['node "$PROJECT_DIR/scripts/preparer-fonctions.js"']);
    if (existsSync(join(RACINE, 'functions-plateforme/serveur'))) { // présente après « npm run preparer »
      for (const f of ['src/clients/gestionnaire.js', 'src/mcp/gestionnaire.js', 'src/oauth/magasin.js', 'src/coeur/donnees.js', 'src/version.js', 'src/devis/pdf-service.js', 'src/devis/pdf-declencheur.js', 'src/devis/chromium.js', 'src/devis/stockage.js', 'partage/devis-document.js', 'partage/registre.js', 'partage/logique.js', 'partage/marque.js', 'package.json']) {
        assert.ok(existsSync(join(RACINE, 'functions-plateforme/serveur', f)), f);
      }
    }
  });
  test('la configuration Firebase de l\'écran d\'autorisation est celle de la plateforme (scripts/projets/plateforme.json), pas celle de Jérôme', () => {
    const p = json('scripts/projets/plateforme.json').firebaseConfig;
    for (const cle of Object.keys(CONFIG_FIREBASE_PLATEFORME)) assert.equal(CONFIG_FIREBASE_PLATEFORME[cle], p[cle], cle);
    assert.equal(CONFIG_FIREBASE_PLATEFORME.projectId, 'chevalier-ia-app');
    assert.equal(EMETTEUR_PLATEFORME, `https://${p.authDomain}`);
    assert.doesNotMatch(lire('functions/src/clients/config.js').replace(/\/\/.*$/gm, ''), /chevalier-ia-os/);
  });
  test('le format d\'identifiant de client est celui de la plateforme (marque.js), en minuscules', () => {
    const marque = (id) => normaliserMarque({ actif: true, nom: id });
    assert.ok(marque('a'));
    for (const ok of ['a', 'cabinet-martin', 'a_b', '0abc', 'x'.repeat(40)]) assert.ok(FORMAT_CLIENT.test(ok), ok);
    for (const ko of ['A', '-a', '_a', 'a/b', '', 'x'.repeat(41), 'a b', 'é']) assert.ok(!FORMAT_CLIENT.test(ko), ko);
  });
  test('règles : un membre lit les membres de SON client, aucune écriture ; tout le reste de la plateforme est inchangé', () => {
    const r = lire('firestore.plateforme.rules');
    const bloc = /match \/clients\/\{client\}\/membres\/\{email\} \{([\s\S]*?)\n    \}/.exec(r)[1];
    assert.match(bloc, /allow get: if connecte\(\) && \(email == request\.auth\.token\.email\.lower\(\) \|\| roleDe\(client\) in \['editeur', 'lecteur'\]\);/);
    assert.match(bloc, /allow list: if roleDe\(client\) in \['editeur', 'lecteur'\];/);
    assert.match(bloc, /allow write: if false;/);
    assert.match(r, /allow read: if collection != 'membres' && collection != 'devis_compteurs' && collection != 'crm_actions_lancements' && roleDe\(client\)/); // le compteur des numéros de devis (24/10/2026) et le journal des demandes d'e-mail (25/10/2026) sont réservés au serveur
    assert.match(r, /allow write: if collection != 'membres' && !collectionDuJournal\(collection\) && !collectionDuTableauDeBord\(collection\) && !collectionSansSuppression\(collection\) && !collectionDesDevis\(collection\) && roleDe\(client\) == 'editeur';/);
    assert.match(r, /match \/\{document=\*\*\} \{\s+allow read, write: if false;/);
  });
  test('les compteurs et les connexions du MCP des clients sont à la racine de la base de la plateforme (fermée par défaut), pas sous clients/<client>/', () => {
    const g = lire('functions/src/clients/gestionnaire.js') + lire('functions/src/clients/routeur-oauth.js');
    assert.match(g, /jeton: `\$\{client\}__\$\{acteur\}`/);
    assert.match(lire('functions/src/clients/gestionnaire.js'), /avecBase\(donnees, cheminBaseClient\(client\)\)/);
    assert.doesNotMatch(lire('functions/src/clients/routeur-oauth.js'), /avecBase/);
    assert.doesNotMatch(lire('firestore.plateforme.rules'), /mcp_oauth|mcp_limites/, 'aucune règle ouverte pour eux : tout le reste est refusé');
  });
  test('aucun code du MCP des clients ne lit un client ailleurs que dans l\'adresse du lien ou la connexion', () => {
    for (const f of ['gestionnaire.js', 'routeur-oauth.js', 'espaces.js', 'page.js']) {
      const t = lire(`functions/src/clients/${f}`).replace(/\/\/.*$/gm, '');
      assert.doesNotMatch(t, /req\.body\??\.(client|clientId|base)|searchParams\.get\(['"]client['"]\)|headers\[['"]x-client/i, f);
    }
  });
});
