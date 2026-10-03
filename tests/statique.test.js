// Tests D : contrôles statiques (manifeste, icônes, service worker, versions, domaines, firebase.json).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const RACINE = fileURLToPath(new URL('../', import.meta.url));
const lire = (chemin) => readFileSync(join(RACINE, chemin), 'utf8');
const json = (chemin) => JSON.parse(lire(chemin));

/** Fichiers de l'appli publiée (hors tests, docs, ressources, dépôt). */
function fichiersAppli(dossier = '', liste = []) {
  for (const nom of readdirSync(join(RACINE, dossier))) {
    const rel = join(dossier, nom);
    if (/^(\.|node_modules$|tests$|docs$|ressources$|outils$|scripts$|functions$)/.test(nom)) continue;
    if (statSync(join(RACINE, rel)).isDirectory()) fichiersAppli(rel, liste);
    else liste.push(rel);
  }
  return liste;
}

function taillePng(chemin) {
  const b = readFileSync(join(RACINE, chemin));
  assert.equal(b.toString('ascii', 1, 4), 'PNG', `${chemin} n'est pas un PNG`);
  return { largeur: b.readUInt32BE(16), hauteur: b.readUInt32BE(20) };
}

describe('D1 Manifeste, icônes, service worker, versions', () => {
  test('D1 manifest.webmanifest valide (nom, nom court, standalone, couleurs du thème sombre)', () => {
    const m = json('manifest.webmanifest');
    assert.equal(m.name, 'Chevalier IA OS');
    assert.equal(m.short_name, 'Chevalier OS');
    assert.equal(m.display, 'standalone');
    assert.equal(m.theme_color, '#1b1a1e');
    assert.equal(m.background_color, '#1b1a1e');
    assert.ok(m.start_url);
  });
  test('D1 icônes 192, 512, maskable et apple touch présentes aux bonnes tailles', () => {
    const m = json('manifest.webmanifest');
    const tailles = m.icons.map((i) => i.sizes);
    assert.ok(tailles.includes('192x192'));
    assert.ok(tailles.includes('512x512'));
    assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
    for (const i of m.icons) {
      assert.ok(existsSync(join(RACINE, i.src)), i.src);
      const { largeur, hauteur } = taillePng(i.src);
      assert.equal(`${largeur}x${hauteur}`, i.sizes, i.src);
    }
    assert.deepEqual(taillePng('assets/icons/apple-touch-icon.png'), { largeur: 180, hauteur: 180 });
    const html = lire('index.html');
    assert.match(html, /<link rel="apple-touch-icon" href="assets\/icons\/apple-touch-icon.png">/);
    assert.match(html, /<meta name="apple-mobile-web-app-capable" content="yes">/);
    assert.match(html, /<link rel="manifest" href="manifest.webmanifest">/);
  });
  test('D1 aucun service worker enregistré ni mise en cache de fichiers par l’appli', () => {
    for (const f of fichiersAppli().filter((x) => /\.(js|html)$/.test(x))) {
      const t = lire(f);
      assert.doesNotMatch(t, /serviceWorker\s*\.\s*register|caches\s*\.\s*open|importScripts/, f);
    }
    assert.ok(!existsSync(join(RACINE, 'sw.js')) && !existsSync(join(RACINE, 'service-worker.js')));
  });
  test('D1 versions identiques dans version.json et js/os/version.js (2.0.0)', () => {
    const v = json('version.json').version;
    const m = /VERSION = '([^']+)'/.exec(lire('js/os/version.js'));
    assert.equal(v, '2.0.0');
    assert.equal(m[1], v);
  });
  test('D1 portraits réduits (512 px de large au plus)', () => {
    for (const p of ['assets/charles-portrait.png', 'assets/jerome-portrait.png']) {
      assert.ok(taillePng(p).largeur <= 512, p);
    }
  });
});

describe('D2 Aucune ressource externe hors Google', () => {
  test('D2 seules les adresses gstatic.com (SDK Firebase 12.19.0) sont chargées par le code', () => {
    const autorise = /^https:\/\/(www\.gstatic\.com\/firebasejs\/12\.19\.0\/|[a-z0-9.-]*googleapis\.com|apis\.google\.com|accounts\.google\.com|lucide\.dev)/;
    for (const f of fichiersAppli().filter((x) => /\.(js|html|css|webmanifest)$/.test(x))) {
      const t = lire(f);
      for (const [url] of t.matchAll(/https?:\/\/[^\s'"`)<>]+/g)) {
        // Espaces de noms SVG, émulateurs locaux, liens saisis par l'utilisateur (modèle ${url}) : pas des ressources.
        if (url.startsWith('http://www.w3.org/') || url.startsWith('http://127.0.0.1') || url.includes('${')) continue;
        assert.match(url, autorise, `${f} : ${url}`);
      }
      assert.doesNotMatch(t, /fonts\.googleapis\.com|cdn\.jsdelivr|unpkg\.com|cdnjs/, f);
    }
  });
  test('D2 le SDK Firebase est figé en 12.19.0 partout', () => {
    for (const f of fichiersAppli().filter((x) => x.endsWith('.js'))) {
      for (const [, v] of lire(f).matchAll(/firebasejs\/([\d.]+)\//g)) assert.equal(v, '12.19.0', f);
    }
  });
  test('D2 polices servies localement', () => {
    const css = lire('css/tokens.css');
    for (const p of ['poppins-500', 'poppins-700', 'be-vietnam-pro-400', 'be-vietnam-pro-500', 'be-vietnam-pro-600', 'be-vietnam-pro-700']) {
      assert.ok(css.includes(`../assets/fonts/${p}.woff2`), p);
      assert.ok(existsSync(join(RACINE, `assets/fonts/${p}.woff2`)), p);
    }
  });
});

describe('D3 firebase.json, en têtes, indexation', () => {
  const fb = json('firebase.json');
  test('D3 tests/, docs/, outils/, scripts/, functions/, README.md (et ressources/) non publiés', () => {
    const ignore = fb.hosting.ignore;
    for (const x of ['tests/**', 'docs/**', 'README.md', 'ressources/**', 'outils/**', 'scripts/**', 'functions/**', '**/node_modules/**', '**/.*']) assert.ok(ignore.includes(x), x);
  });
  test('D3 en têtes de sécurité présents', () => {
    const tous = fb.hosting.headers.find((h) => h.source === '**').headers;
    const cle = (k) => tous.find((h) => h.key === k)?.value;
    assert.equal(cle('X-Robots-Tag'), 'noindex, nofollow');
    assert.equal(cle('X-Content-Type-Options'), 'nosniff');
    assert.equal(cle('Referrer-Policy'), 'strict-origin-when-cross-origin');
    assert.match(cle('Permissions-Policy'), /camera=\(\).*geolocation=\(\)/);
  });
  test('D3 Cache-Control : no-cache pour html, js, css, json, manifeste ; cache long pour polices et images', () => {
    const noCache = fb.hosting.headers.find((h) => /html\|js\|css\|json\|webmanifest/.test(h.source));
    assert.equal(noCache.headers.find((h) => h.key === 'Cache-Control').value, 'no-cache');
    const long = fb.hosting.headers.find((h) => /woff2/.test(h.source));
    assert.match(long.source, /png/);
    assert.match(long.headers.find((h) => h.key === 'Cache-Control').value, /max-age=31536000/);
  });
  test('D3 émulateurs Auth 9099 et Firestore 8080, règles déclarées', () => {
    assert.equal(fb.emulators.auth.port, 9099);
    assert.equal(fb.emulators.firestore.port, 8080);
    assert.equal(fb.firestore.rules, 'firestore.rules');
    assert.equal(json('.firebaserc').projects.default, 'chevalier-ia-os');
  });
  test('D3 robots.txt interdit tout et meta robots noindex', () => {
    assert.match(lire('robots.txt'), /User-agent: \*\s+Disallow: \//);
    assert.match(lire('index.html'), /<meta name="robots" content="noindex">/);
  });
  test('D3 firestore.rules identiques à la section 11.4 du cahier des charges 2.0 (étendues à l’étape 4 du serveur MCP)', () => {
    const cahier = lire('docs/cahier-des-charges-v2.0.md');
    const bloc = /\*\*Règles Firestore\*\*[\s\S]*?```\n([\s\S]*?)```/.exec(cahier)[1];
    const norm = (t) => t.replace(/\s+/g, ' ').trim();
    assert.equal(norm(lire('firestore.rules')), norm(bloc));
    assert.match(lire('firestore.rules'), /match \/\{collection\}\/\{document=\*\*\}/); // joker : couvre les collections de l'appli, hors celles du serveur
  });
  test('D3 configuration Firebase et comptes autorisés conformes à la section 11.3', () => {
    const cahier = lire('docs/cahier-des-charges-v2.0.md');
    const bloc = /\(`js\/os\/firebase-config\.js`\) :\n\s*```js\n([\s\S]*?)```/.exec(cahier)[1];
    const norm = (t) => t.replace(/\s+/g, ' ').trim();
    assert.equal(norm(lire('js/os/firebase-config.js')), norm(bloc));
  });
  test('D3 arborescence de la section 13 respectée ; fichiers du module CRM de la version 1.0.0 retirés', () => {
    const attendus = [
      'index.html', 'manifest.webmanifest', 'version.json', 'robots.txt', 'firebase.json', '.firebaserc', 'firestore.rules', '.gitignore', 'README.md',
      'css/tokens.css', 'css/os.css', 'css/crm.css', 'js/main.js',
      ...['firebase-config', 'firebase', 'auth', 'router', 'shell', 'modules', 'objectifs', 'celebrations', 'version', 'pwa', 'ui'].map((f) => `js/os/${f}.js`),
      ...['index', 'donnees', 'logique', 'accueil', 'personnes', 'organisations', 'affaires', 'fiche-personne', 'fiche-organisation', 'fiche-affaire', 'activites', 'reglages', 'export'].map((f) => `js/modules/crm/${f}.js`),
      'assets/charles-portrait.png', 'assets/jerome-portrait.png', 'docs/cahier-des-charges-v2.0.md', 'docs/pipedrive-reference.md',
      'tests/package.json', 'tests/regles.test.js', 'tests/logique.test.js', '.github/workflows/firebase-hosting.yml',
    ];
    for (const f of attendus) assert.ok(existsSync(join(RACINE, f)), f);
    for (const f of ['fiche', 'kanban', 'liste']) assert.ok(!existsSync(join(RACINE, `js/modules/crm/${f}.js`)), `js/modules/crm/${f}.js (version 1.0.0) doit avoir disparu`);
    assert.ok(readdirSync(join(RACINE, 'assets/fonts')).length >= 6);
    assert.ok(readdirSync(join(RACINE, 'tests/e2e')).some((f) => f.endsWith('.spec.js')));
  });
  test('D3 déploiement GitHub : action officielle, canal live, projet et secret attendus', () => {
    const yml = lire('.github/workflows/firebase-hosting.yml');
    assert.match(yml, /FirebaseExtended\/action-hosting-deploy@v0/);
    assert.match(yml, /channelId: live/);
    assert.match(yml, /projectId: chevalier-ia-os/);
    assert.match(yml, /secrets\.FIREBASE_SERVICE_ACCOUNT_CHEVALIER_IA_OS/);
    assert.match(yml, /branches:\s*\n\s*- main/);
  });
  test('D3 package.json uniquement dans tests/ et functions/ (aucun à la racine)', () => {
    assert.ok(!existsSync(join(RACINE, 'package.json')));
    assert.ok(existsSync(join(RACINE, 'functions/package.json')));
  });
});

describe('D4 Requêtes Firestore, ancienne collection, règles', () => {
  const sources = () => fichiersAppli().filter((x) => /^js\/.*\.js$/.test(x));

  test('D4 aucune requête composite : pas de orderBy, une seule condition where par requête, jamais de plage', () => {
    for (const f of sources()) {
      const t = lire(f);
      assert.doesNotMatch(t, /\borderBy\s*\(/, `${f} : orderBy`);
      assert.doesNotMatch(t, /\blimit\s*\(/, `${f} : limit`);
      for (const [requete] of t.matchAll(/query\s*\([^;]*?\)\s*,/gs)) {
        const nombre = (requete.match(/\bwhere\s*\(/g) || []).length;
        assert.ok(nombre <= 1, `${f} : requête avec ${nombre} conditions : ${requete.slice(0, 80)}`);
      }
      for (const [, op] of t.matchAll(/where\s*\([^,]+,\s*['"]([^'"]+)['"]/g)) assert.equal(op, '==', `${f} : opérateur ${op}`);
    }
  });

  test('D4 aucun appel à la collection crm_prospects de la version 1.0.0 dans le code publié', () => {
    for (const f of sources()) assert.doesNotMatch(lire(f), /crm_prospects/, f);
  });

  test('D4 les collections lues ou écrites sont celles du cahier', () => {
    const attendues = new Set(['crm_personnes', 'crm_organisations', 'crm_affaires', 'crm_activites', 'crm_notes', 'crm_evenements', 'crm_parametres', 'os_objectifs', 'os_objectifs_saisies']);
    const trouvees = new Set();
    for (const f of sources()) for (const [, nom] of lire(f).matchAll(/['"`]((?:crm|os)_[a-z_]+)['"`]/g)) trouvees.add(nom);
    for (const nom of trouvees) assert.ok(attendues.has(nom), `collection inattendue : ${nom}`);
    for (const nom of attendues) assert.ok(trouvees.has(nom), `collection jamais utilisée : ${nom}`);
  });

  test('D4 firestore.rules : un seul joker, réservé aux deux comptes vérifiés, qui exclut explicitement les trois collections du serveur (le journal est lisible, jamais modifiable)', () => {
    const r = lire('firestore.rules');
    assert.equal((r.match(/match \/\{collection\}\/\{document=\*\*\}/g) || []).length, 1);
    assert.doesNotMatch(r, /match \/\{document=\*\*\}/, 'plus de joker nu : il couvrirait aussi les collections du serveur');
    assert.equal((r.match(/function compteAutorise/g) || []).length, 1);
    assert.match(r, /email_verified == true/);
    assert.match(r, /jerome\.chevalier@gmail\.com/);
    assert.match(r, /jeromebot\.chevalierbot@gmail\.com/);
    assert.match(r, /!\(collection in \['crm_audit', 'crm_audit_avant', 'mcp_limites'\]\)/);
    assert.match(r, /match \/crm_audit\/\{id\} \{\s+allow read: if compteAutorise\(\);\s+allow write: if false;/);
    assert.match(r, /match \/crm_audit_avant\/\{id\} \{\s+allow read, write: if false;/);
    assert.match(r, /match \/mcp_limites\/\{id\} \{\s+allow read, write: if false;/);
  });

  test('D4 aucun secret dans le dépôt (secret OAuth Google, jeton de rafraîchissement ou d’accès, jeton MCP, clé privée)', () => {
    const motifs = [/GOCSPX-[A-Za-z0-9_-]{20,}/, /\b1\/\/0[A-Za-z0-9_-]{30,}/, /ya29\.[A-Za-z0-9_-]{20,}/, /\bcia_[A-Za-z0-9_-]{40,}/, /-----BEGIN (RSA |EC )?PRIVATE KEY-----/];
    const parcourir = (dossier = '', liste = []) => {
      for (const nom of readdirSync(join(RACINE, dossier))) {
        if (nom === 'node_modules' || nom === '.git') continue;
        const rel = join(dossier, nom);
        if (statSync(join(RACINE, rel)).isDirectory()) parcourir(rel, liste);
        else if (/\.(js|html|css|json|md|yml|yaml|rules|webmanifest|txt)$/.test(nom)) liste.push(rel);
      }
      return liste;
    };
    for (const f of parcourir()) {
      const t = lire(f);
      for (const m of motifs) assert.doesNotMatch(t, m, `${f} contient un secret (${m})`);
    }
  });

  test('D4 le code publié (appli) n’utilise ni Cloud Function ni Cloud Storage : le serveur MCP vit dans functions/, jamais publié', () => {
    for (const f of fichiersAppli().filter((x) => /\.js$/.test(x))) assert.doesNotMatch(lire(f), /firebase-functions|firebase-storage|getStorage|httpsCallable/, f);
  });
});

describe('D5 Serveur MCP (étape 2) : déploiement, versions figées, sécurité', () => {
  const fb = json('firebase.json');
  const pkg = json('functions/package.json');
  const fichiersFonctions = (dossier = 'functions/src', liste = []) => {
    for (const nom of readdirSync(join(RACINE, dossier))) {
      const rel = join(dossier, nom);
      if (statSync(join(RACINE, rel)).isDirectory()) fichiersFonctions(rel, liste);
      else if (nom.endsWith('.js')) liste.push(rel);
    }
    return liste;
  };

  test('D5 Node 22, modules ES, dépendances figées (aucun ^ ni ~) et package-lock.json présent', () => {
    assert.equal(pkg.engines.node, '22');
    assert.equal(pkg.type, 'module');
    assert.ok(existsSync(join(RACINE, 'functions/package-lock.json')));
    for (const [nom, v] of Object.entries(pkg.dependencies)) assert.match(v, /^\d+\.\d+\.\d+$/, `${nom} : ${v}`);
    assert.equal(fb.functions[0].runtime, 'nodejs22');
    assert.equal(fb.functions[0].source, 'functions');
  });
  test('D5 la fonction mcp : Paris, 3 instances au plus, invocation publique, pas de CORS', () => {
    const t = lire('functions/src/index.js');
    assert.match(t, /export const mcp = onRequest/);
    assert.match(t, /region: 'europe-west9'/);
    assert.match(t, /maxInstances: 3/);
    assert.match(t, /invoker: 'public'/);
    assert.match(t, /cors: false/);
  });
  test('D5 la fonction tourne avec un compte de service dédié, jamais avec le compte par défaut du projet', () => {
    const t = lire('functions/src/index.js');
    assert.match(t, /serviceAccount: 'mcp-serveur@chevalier-ia-os\.iam\.gserviceaccount\.com'/);
    assert.doesNotMatch(t, /compute@developer|appspot\.gserviceaccount/);
  });
  test('D5 /mcp est réécrit vers le service Cloud Run « mcp » de Paris, et functions/ n’est pas publié', () => {
    assert.deepEqual(fb.hosting.rewrites, [{ source: '/mcp', run: { serviceId: 'mcp', region: 'europe-west9' } }]);
    assert.ok(fb.hosting.ignore.includes('functions/**'));
    assert.equal(fb.emulators.functions.port, 5001);
  });
  test('D5 workflow : Node 22, dépendances installées avec npm ci, fonctions déployées AVANT Hosting, identifiants dans un fichier temporaire supprimé', () => {
    const yml = lire('.github/workflows/firebase-hosting.yml');
    assert.match(yml, /node-version: 22/);
    assert.match(yml, /npm ci --prefix functions/);
    assert.match(yml, /firebase-tools@15\.32\.0 deploy --only functions --project chevalier-ia-os --non-interactive --force/);
    assert.ok(yml.indexOf('deploy --only functions') < yml.indexOf('FirebaseExtended/action-hosting-deploy@v0'), 'fonctions avant Hosting');
    assert.match(yml, /GOOGLE_APPLICATION_CREDENTIALS/);
    assert.match(yml, /trap 'rm -f "\$fichier"' EXIT/);
    assert.match(yml, /umask 077/);
  });
  test('D5 workflow : le secret du compte de service n’est jamais affiché ; seule l’adresse du compte l’est (diagnostic)', () => {
    const yml = lire('.github/workflows/firebase-hosting.yml');
    assert.match(yml, /JSON\.parse\(process\.env\.COMPTE_DE_SERVICE\)\.client_email/);
    assert.doesNotMatch(yml, /(echo|cat|printenv|console\.log\([^)]*)\s*[^\n]*\$\{\{\s*secrets\./);
    assert.doesNotMatch(yml, /private_key/);
  });
  test('D5 le jeton n’est jamais lu ailleurs que dans l’en-tête Authorization (ni adresse, ni corps) et seules des empreintes sont comparées', () => {
    const g = lire('functions/src/mcp/gestionnaire.js');
    assert.match(g, /req\.headers\.authorization/);
    assert.doesNotMatch(g, /req\.query|req\.url|searchParams/);
    assert.match(lire('functions/src/securite/jetons.js'), /timingSafeEqual/);
  });
  test('D5 le code des fonctions n’enregistre jamais de jeton, d’en-tête ni de paramètre (aucun console.log direct, journal à liste blanche)', () => {
    for (const f of fichiersFonctions()) {
      if (f.endsWith('journaux.js')) continue;
      assert.doesNotMatch(lire(f), /console\.(log|info|error|warn|debug)|logger\./, f);
    }
  });
  test('D5 le code des fonctions ne référence pas l’ancienne collection crm_prospects', () => {
    for (const f of fichiersFonctions()) assert.doesNotMatch(lire(f), /crm_prospects/, f);
  });
  test('D5 le guide sécurité et pannes existe et couvre les interrupteurs d’urgence, les secrets et les versions figées', () => {
    const t = lire('docs/securite-et-pannes.md');
    for (const mot of ["Interrupteurs d'urgence", 'Où sont les secrets', 'Versions figées', 'MCP_JETONS', 'porte dérobée', 'Contrôle trimestriel']) assert.ok(t.includes(mot), mot);
  });
  test('D5 le playbook de déploiement d’un serveur MCP existe et liste API, rôles et erreurs rencontrées', () => {
    const t = lire('docs/playbook-mcp-firebase.md');
    for (const mot of ['eventarc.googleapis.com', 'cloudbilling.googleapis.com', 'Administrateur Cloud Functions', 'Utilisateur du compte de service', '--force', 'Default compute service account', 'Liste de contrôle']) assert.ok(t.includes(mot), mot);
  });
  test('D5 étape 3 : la copie de logique.js est préparée avant chaque déploiement (predeploy), ignorée par git, et le script ne dépend de rien', () => {
    assert.deepEqual(fb.functions[0].predeploy, ['node "$PROJECT_DIR/scripts/preparer-fonctions.js"']);
    assert.match(lire('.gitignore'), /^functions\/partage\/$/m);
    assert.equal(fb.functions[0].ignore, undefined, 'liste d’exclusion par défaut de l’outil (node_modules, .git) : functions/partage/ est bien envoyé au déploiement');
    assert.doesNotMatch(lire('scripts/preparer-fonctions.js'), /^import .* from '(?!node:)/m);
  });
  test('D5 étapes 3 et 4 : les tests des fonctions préparent la copie, puis lancent jetons, protocole, lecture, écriture avec audit et Firestore (émulateur)', () => {
    const scripts = json('tests/package.json').scripts;
    assert.match(scripts['test:fonctions'], /^npm run preparer && node --test .*jetons\.test\.js.*mcp\.test\.js.*lecture\.test\.js.*lecture-firestore\.test\.js.*ecriture\.test\.js.*ecriture-firestore\.test\.js.*ecriture-outils\.test\.js/);
    assert.match(scripts.tous, /test:fonctions/);
  });
  test('D5 outils/creer-jeton.js existe et ne contient aucun jeton', () => {
    assert.ok(existsSync(join(RACINE, 'outils/creer-jeton.js')));
    assert.doesNotMatch(lire('outils/creer-jeton.js'), /cia_[A-Za-z0-9_-]{40,}/);
  });
  test('D6 étape 4 : la fonction branche les plafonds de débit (sans eux, aucun frein) et passe par le moteur d’écriture avec audit', () => {
    const index = lire('functions/src/index.js');
    assert.match(index, /creerLimiteur\(\{ donnees \}\)/);
    assert.match(index, /creerGestionnaire\(\{ magasin, donnees, limiteur \}\)/);
    const g = lire('functions/src/mcp/gestionnaire.js');
    assert.match(g, /executerEcritures/);
    assert.match(g, /limiteur\?\.requete/);
    assert.match(g, /limiteur\?\.reserver/);
  });
  test('D6 étape 4 : les outils de suppression et de restauration sont réservés au profil claude-code, tous les outils d’écriture à bibliothécaire et claude-code', () => {
    const suppr = lire('functions/src/mcp/outils/suppression.js');
    assert.match(suppr, /const PROFILS = \['claude-code'\];/);
    const ecr = lire('functions/src/mcp/outils/ecriture.js');
    assert.match(ecr, /const PROFILS = \['bibliothecaire', 'claude-code'\];/);
    assert.doesNotMatch(ecr, /lecteur/);
    assert.doesNotMatch(lire('functions/src/mcp/outils/lecture.js'), /creer_|modifier_|supprimer_|restaurer/);
  });
  test('D6 étape 4 : les outils et les actions métier n’accèdent jamais directement à Firestore (ni SDK d’administration, ni écriture hors moteur)', () => {
    for (const f of ['functions/src/mcp/outils/ecriture.js', 'functions/src/mcp/outils/suppression.js', 'functions/src/coeur/metier.js']) {
      assert.doesNotMatch(lire(f), /firebase-admin|getFirestore|\.collection\(|\.batch\(|runTransaction|FieldValue|serverTimestamp/, f);
    }
    assert.doesNotMatch(lire('functions/src/coeur/metier.js'), /\.appliquer\(|\.mettreAJour\(/);
  });
  test('D6 étape 4 : les collections du serveur ne sont jamais lues ni écrites par le code publié de l’appli (sauf le journal, en lecture)', () => {
    for (const f of fichiersAppli().filter((x) => /^js\/.*\.js$/.test(x))) assert.doesNotMatch(lire(f), /crm_audit_avant|mcp_limites/, f);
  });
});
