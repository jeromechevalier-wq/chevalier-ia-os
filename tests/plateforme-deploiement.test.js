// Chantier 12 : déploiement paramétré. Le CRM garde exactement sa configuration, la plateforme prend la sienne, aucun secret.
// Sans réseau, sans émulateur : lit les fichiers et construit le paquet dans un dossier temporaire.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, mkdtempSync, rmSync, readdirSync, statSync, writeFileSync, mkdirSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import {
  RACINE, ELEMENTS_PUBLIES, PROJETS, lireConfigProjet, contenuConfigFirebase, construire, listerFichiers,
} from '../scripts/hebergement.js';

const lire = (f) => readFileSync(join(RACINE, f), 'utf8');
const json = (f) => JSON.parse(lire(f));
const sansCommentaires = (t) => t.replace(/^\s*\/\/.*$/gm, '');

const CONFIG_CRM = {
  apiKey: 'AIzaSyAa04eaHNaBJwGAUwMrDampugAn1aralXc',
  authDomain: 'chevalier-ia-os.web.app',
  projectId: 'chevalier-ia-os',
  storageBucket: 'chevalier-ia-os.firebasestorage.app',
  messagingSenderId: '96526036520',
  appId: '1:96526036520:web:d09f8ac76597dffaad0f1d',
};
const CONFIG_PLATEFORME = {
  apiKey: 'AIzaSyBozQGcRbt3sOUr3K2pygTUFdCZKcvxTtI',
  authDomain: 'chevalier-ia-app.web.app',
  projectId: 'chevalier-ia-app',
  storageBucket: 'chevalier-ia-app.firebasestorage.app',
  messagingSenderId: '192468914925',
  appId: '1:192468914925:web:4f459f0606689e22c572e4',
};
const COMPTES_CRM = ['jerome.chevalier@gmail.com', 'jeromebot.chevalierbot@gmail.com'];

let dossierTemp;
let paquet;
before(() => {
  dossierTemp = mkdtempSync(join(tmpdir(), 'plateforme-'));
  paquet = construire('plateforme', { sortie: join(dossierTemp, 'dist') });
});
after(() => rmSync(dossierTemp, { recursive: true, force: true }));

/** Charge un fichier de configuration (module ES) depuis un chemin, sans le copier dans le dépôt. */
async function charger(chemin) {
  return import(`${pathToFileURL(chemin).href}?t=${Math.random()}`);
}

describe('Le CRM garde exactement sa configuration', () => {
  test('js/os/firebase-config.js du dépôt = les six valeurs du CRM, ses deux comptes', async () => {
    const m = await charger(join(RACINE, 'js/os/firebase-config.js'));
    assert.deepEqual(m.firebaseConfig, CONFIG_CRM);
    assert.deepEqual(Object.keys(m.COMPTES_AUTORISES), COMPTES_CRM);
  });
  test('la construction de la plateforme ne modifie aucun fichier du dépôt', () => {
    assert.ok(!existsSync(join(RACINE, 'js/os/firebase-config.js.bak')));
    assert.match(lire('js/os/firebase-config.js'), /chevalier-ia-os/);
    assert.ok(!lire('js/os/firebase-config.js').includes('chevalier-ia-app'));
  });
  test('firebase.json (CRM) : public ".", fonctions, réécritures MCP et OAuth, règles Firestore du CRM, dist/ non publié', () => {
    const fb = json('firebase.json');
    assert.equal(fb.hosting.public, '.');
    assert.equal(fb.firestore.rules, 'firestore.rules');
    assert.equal(fb.functions[0].source, 'functions');
    const sources = fb.hosting.rewrites.map((r) => r.source);
    for (const s of ['/mcp', '/.well-known/oauth-authorization-server', '/oauth/**', '/espace/**']) assert.ok(sources.includes(s), s);
    assert.ok(fb.hosting.ignore.includes('dist/**'));
    assert.equal(json('.firebaserc').projects.default, 'chevalier-ia-os');
  });
  test('workflow du CRM : toujours à chaque fusion dans main, vers chevalier-ia-os, avec son secret et ses fonctions', () => {
    const yml = lire('.github/workflows/firebase-hosting.yml');
    assert.match(yml, /branches:\s*\n\s*- main/);
    assert.match(yml, /projectId: chevalier-ia-os/);
    assert.match(yml, /secrets\.FIREBASE_SERVICE_ACCOUNT_CHEVALIER_IA_OS/);
    assert.match(yml, /deploy --only functions --project chevalier-ia-os/);
    assert.ok(!/chevalier-ia-app|plateforme/i.test(yml), 'le workflow du CRM ne parle pas de la plateforme');
  });
  test('tout ce que le CRM publie à la racine est repris par le paquet (rien d\'oublié)', () => {
    const ignores = json('firebase.json').hosting.ignore;
    const motif = (g) => new RegExp('^' + g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*\/?/g, '').replace(/\*/g, '.*') + '$');
    const regles = ignores.map((g) => g.replace(/\/\*\*$/, '')).filter((g) => !g.startsWith('**'));
    const publies = readdirSync(RACINE).filter((n) => !n.startsWith('.') && n !== 'node_modules'
      && !regles.some((g) => (g.includes('*') ? motif(g).test(n) : g === n)));
    assert.deepEqual(publies.sort(), [...ELEMENTS_PUBLIES].sort());
  });
});

describe('La plateforme prend sa propre configuration', () => {
  test('le fichier de configuration du projet contient les six valeurs de chevalier-ia-app', () => {
    const { firebaseConfig, comptesAutorises } = lireConfigProjet('plateforme');
    assert.deepEqual(firebaseConfig, CONFIG_PLATEFORME);
    assert.deepEqual(comptesAutorises, {});
  });
  test('le paquet contient firebase-config.js généré : config de la plateforme, liste de comptes vide', async () => {
    const m = await charger(join(paquet, 'js/os/firebase-config.js'));
    assert.deepEqual(m.firebaseConfig, CONFIG_PLATEFORME);
    assert.deepEqual(m.COMPTES_AUTORISES, {});
    assert.match(readFileSync(join(paquet, 'js/os/firebase-config.js'), 'utf8'), /FICHIER GÉNÉRÉ/);
  });
  test('le paquet ne contient ni l\'adresse de Jérôme ou de Charles dans la configuration, ni le projet du CRM', () => {
    const t = readFileSync(join(paquet, 'js/os/firebase-config.js'), 'utf8');
    for (const e of COMPTES_CRM) assert.ok(!t.includes(e), e);
    for (const v of Object.values(CONFIG_CRM)) assert.ok(!t.includes(v), v);
    assert.ok(!t.includes('chevalier-ia-os'));
    assert.ok(!/portrait/.test(t));
  });
  test('un compte de Jérôme n\'est pas reconnu : la liste fixe du CRM est vide sur la plateforme (compteAutorise refuse tout)', async () => {
    const m = await charger(join(paquet, 'js/os/firebase-config.js'));
    for (const e of COMPTES_CRM) assert.equal(m.COMPTES_AUTORISES[e], undefined);
  });
  test('tous les autres fichiers du paquet sont des copies exactes du dépôt (même code)', () => {
    const fichiers = listerFichiers(paquet);
    assert.ok(fichiers.length > 50);
    for (const f of fichiers) {
      if (f === 'js/os/firebase-config.js') continue;
      assert.ok(readFileSync(join(paquet, f)).equals(readFileSync(join(RACINE, f))), f);
    }
    const attendus = ELEMENTS_PUBLIES.flatMap((e) => (statSync(join(RACINE, e)).isDirectory() ? listerFichiers(join(RACINE, e)).map((f) => `${e}/${f}`) : [e])).sort();
    assert.deepEqual(fichiers, attendus);
  });
  test('rien de privé dans le paquet : ni tests, ni docs, ni règles, ni fonctions, ni outils', () => {
    const fichiers = listerFichiers(paquet);
    assert.ok(!fichiers.some((f) => /^(tests|docs|functions|outils|scripts|ressources|dist)\//.test(f) || /rules$|^firebase|^\.|CLAUDE|README/.test(f)));
  });
  test('le point d\'entrée de la plateforme est un projet connu, vérifié (mauvaise config refusée)', () => {
    assert.throws(() => lireConfigProjet('inconnu'), /Projet inconnu/);
    assert.throws(() => construire('inconnu', { sortie: join(dossierTemp, 'x') }), /Projet inconnu/);
    const faux = mkdtempSync(join(tmpdir(), 'faux-'));
    try {
      mkdirSync(join(faux, 'scripts/projets'), { recursive: true });
      const bon = json('scripts/projets/plateforme.json');
      const essai = (modif) => {
        const c = structuredClone(bon);
        modif(c);
        writeFileSync(join(faux, PROJETS.plateforme.fichier), JSON.stringify(c));
        return () => lireConfigProjet('plateforme', faux);
      };
      assert.doesNotThrow(essai(() => {}));
      assert.throws(essai((c) => { c.firebaseConfig.projectId = 'chevalier-ia-os'; }), /projectId/);
      assert.throws(essai((c) => { delete c.firebaseConfig.appId; }), /appId/);
      assert.throws(essai((c) => { c.firebaseConfig.appId = '1:111:web:abc'; }), /appId/);
      assert.throws(essai((c) => { c.firebaseConfig.apiKey = 'pas-une-cle'; }), /apiKey/);
      assert.throws(essai((c) => { c.firebaseConfig.secret = 'x'; }), /inattendue/);
      assert.throws(essai((c) => { c.firebaseConfig.authDomain = 'chevalier-ia-os.web.app'; }), /authDomain/);
      assert.throws(essai((c) => { c.private_key = '-----' + 'BEGIN PRIVATE' + ' KEY' + '-----'; }), /compte de service/);
      assert.throws(essai((c) => { c.comptesAutorises = []; }), /objet/);
    } finally {
      rmSync(faux, { recursive: true, force: true });
    }
  });
  test('contenuConfigFirebase est déterministe (deux constructions donnent le même fichier)', () => {
    assert.equal(contenuConfigFirebase('plateforme'), contenuConfigFirebase('plateforme'));
  });
});

describe('Une seule source de version pour les deux déploiements', () => {
  test('version.json et js/os/version.js du paquet sont ceux du dépôt, et concordent', () => {
    const v = json('version.json').version;
    assert.equal(JSON.parse(readFileSync(join(paquet, 'version.json'), 'utf8')).version, v);
    assert.equal(/VERSION = '([^']+)'/.exec(readFileSync(join(paquet, 'js/os/version.js'), 'utf8'))[1], v);
    assert.equal(/VERSION = '([^']+)'/.exec(lire('js/os/version.js'))[1], v);
  });
  test('aucun numéro de version écrit dans le workflow ni dans le script de construction', () => {
    for (const f of ['.github/workflows/deploiement-plateforme.yml', 'scripts/hebergement.js', 'scripts/preparer-hebergement.js', 'scripts/projets/plateforme.json']) {
      assert.ok(!/\b\d+\.\d+\.\d+\b/.test(lire(f).replace(/firebase-tools@\d+\.\d+\.\d+/g, '')), f);
    }
  });
});

describe('firebase.plateforme.json : ce qui est publié sur chevalier-ia-app', () => {
  const fb = json('firebase.plateforme.json');
  test('Hosting publie le paquet dist/plateforme ; règles Firestore et Storage de la plateforme', () => {
    assert.equal(fb.hosting.public, 'dist/plateforme');
    assert.equal(fb.firestore.rules, 'firestore.plateforme.rules');
    assert.equal(fb.storage.rules, 'storage.plateforme.rules');
  });
  test('une seule série de fonctions : celles de la plateforme (functions-plateforme, codebase « plateforme »), jamais celles du CRM ; seul le lien /espace/** est réécrit', () => {
    assert.deepEqual(fb.functions, [{ source: 'functions-plateforme', codebase: 'plateforme', runtime: 'nodejs22', predeploy: ['node "$PROJECT_DIR/scripts/preparer-fonctions.js"'] }]);
    assert.ok(!json('firebase.json').functions.some((f) => f.source === 'functions-plateforme'), 'le CRM ne déploie jamais les fonctions de la plateforme');
    assert.ok(json('firebase.json').hosting.ignore.includes('functions-plateforme/**'), 'le site du CRM ne publie pas ce dossier');
    // Le MCP des clients (module « mcp ») : cinq réécritures, toutes vers le service « mcpclients » de Paris et vers aucun autre.
    assert.deepEqual(fb.hosting.rewrites.map((r) => r.source), ['/espace/**', '/mcp/**', '/.well-known/oauth-protected-resource/mcp/**', '/.well-known/oauth-authorization-server/mcp/**', '/oauth/**']);
    for (const r of fb.hosting.rewrites.slice(1)) assert.deepEqual(r.run, { serviceId: 'mcpclients', region: 'europe-west9' }, r.source);
    assert.ok(!JSON.stringify(fb.hosting.rewrites[0]).includes('"run"'));
    assert.deepEqual(fb.hosting.rewrites[0], json('firebase.json').hosting.rewrites.find((r) => r.source === '/espace/**'));
  });
  test('mêmes en-têtes de sécurité et de cache que le CRM', () => {
    assert.deepEqual(fb.hosting.headers, json('firebase.json').hosting.headers);
  });
});

describe('Workflow « Déploiement plateforme clients »', () => {
  const yml = lire('.github/workflows/deploiement-plateforme.yml');
  const actif = yml.replace(/^\s*#.*$/gm, '');
  test('déclenché seulement à la main (workflow_dispatch), jamais par une fusion ni un calendrier', () => {
    assert.match(actif, /^on:\s*\n\s+workflow_dispatch:/m);
    assert.ok(!/^\s+(push|pull_request|pull_request_target|schedule|workflow_run|release):/m.test(actif));
  });
  test('cible chevalier-ia-app avec firebase.plateforme.json, outil figé, son propre secret', () => {
    assert.match(actif, /firebase-tools@15\.32\.0 deploy --only "\$cible" --config firebase\.plateforme\.json --project chevalier-ia-app --non-interactive/);
    assert.match(actif, /secrets\.FIREBASE_SERVICE_ACCOUNT_CHEVALIER_IA_APP/);
    assert.ok(!/FIREBASE_SERVICE_ACCOUNT_CHEVALIER_IA_OS/.test(actif), 'jamais le secret du CRM');
    assert.ok(!/chevalier-ia-os/.test(actif), 'jamais le projet du CRM');
  });
  test('publie Hosting et les règles Firestore et Storage, jamais les fonctions du CRM', () => {
    assert.match(actif, /hosting\) cible="hosting"/);
    assert.match(actif, /regles\)\s+cible="firestore:rules,storage"/);
    assert.match(actif, /tout\)\s+cible="hosting,firestore:rules,storage"/);
    // Les fonctions de la plateforme ne partent que par le choix « fonctions » et seulement vers le codebase « plateforme » ; « tout » ne les contient pas.
    assert.match(actif, /fonctions\) cible="functions:plateforme"/);
    assert.match(actif, /mcp\)\s+cible="functions:plateforme:mcpclients"/); // le MCP des clients seul : aucun secret n'est nécessaire
    assert.ok(!/functions(?!:plateforme|-plateforme)/.test(actif.replace(/inputs\.elements == '(fonctions|mcp)'/g, '')), 'aucune autre mention de functions');
    assert.ok(!/tout\)[^\n]*functions/.test(actif));
  });
  test('construit le paquet avant de publier ; choix « hosting » par défaut ; droits minimaux ; pas d\'injection', () => {
    assert.ok(actif.indexOf('preparer-hebergement.js plateforme') < actif.indexOf('firebase-tools'));
    assert.ok(actif.indexOf('plateforme-deploiement.test.js') < actif.indexOf('firebase-tools'));
    assert.match(actif, /default: hosting/);
    assert.match(actif, /permissions:\s*\n\s+contents: read/);
    assert.ok(!/\$\{\{\s*inputs\./.test(actif.replace(/ELEMENTS: \$\{\{ inputs\.elements \}\}/, '').replace(/if: \$\{\{ inputs\.elements == 'fonctions' \|\| inputs\.elements == 'mcp' \}\}/, '')), 'le choix passe par une variable d\'environnement (seul un « if » de comparaison fait exception)');
  });
  test('le secret n\'est écrit que dans un fichier temporaire protégé, supprimé à la fin, et jamais affiché', () => {
    assert.match(actif, /umask 077/);
    assert.match(actif, /trap 'rm -f "\$fichier"' EXIT/);
    assert.ok(!/echo\s+"?\$COMPTE_DE_SERVICE/.test(actif));
  });
});

describe('Aucun secret dans le dépôt (fichiers de ce chantier)', () => {
  const fichiers = [
    'scripts/hebergement.js', 'scripts/preparer-hebergement.js', 'scripts/projets/plateforme.json', 'firebase.plateforme.json',
    '.github/workflows/deploiement-plateforme.yml', 'docs/deploiement-plateforme.md',
  ];
  test('pas de clé privée, de jeton, de secret client ni de clé de compte de service', () => {
    for (const f of fichiers) {
      assert.ok(!/-----BEGIN [A-Z ]*PRIVATE KEY|"private_key"\s*:|"private_key_id"|"type"\s*:\s*"service_account"|ghp_[A-Za-z0-9]{20,}|github_pat_|GOCSPX-|ya29\./.test(lire(f)), f);
    }
  });
  test('la seule clé de type AIza... du chantier est l\'apiKey web publique de la plateforme', () => {
    const toutes = fichiers.flatMap((f) => lire(f).match(/AIza[0-9A-Za-z_-]{35}/g) ?? []);
    assert.ok(toutes.every((k) => k === CONFIG_PLATEFORME.apiKey), toutes.join(','));
  });
  test('les secrets passent uniquement par ${{ secrets.… }} dans les workflows', () => {
    for (const f of readdirSync(join(RACINE, '.github/workflows'))) {
      const t = lire(`.github/workflows/${f}`);
      assert.ok(!/client_email"\s*:\s*"[^"]+@/.test(t) && !/private_key/.test(t.replace(/#.*$/gm, '')), f);
    }
  });
});
