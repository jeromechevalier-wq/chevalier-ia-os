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
    if (/^(\.|node_modules$|tests$|docs$|ressources$)/.test(nom)) continue;
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
  test('D3 tests/, docs/, README.md (et ressources/) non publiés', () => {
    const ignore = fb.hosting.ignore;
    for (const x of ['tests/**', 'docs/**', 'README.md', 'ressources/**', '**/node_modules/**', '**/.*']) assert.ok(ignore.includes(x), x);
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
  test('D3 firestore.rules identiques à la section 11.4 du cahier des charges 2.0 (et inchangées depuis la version 1.0.0)', () => {
    const cahier = lire('docs/cahier-des-charges-v2.0.md');
    const bloc = /\*\*Règles Firestore\*\*[\s\S]*?```\n([\s\S]*?)```/.exec(cahier)[1];
    const norm = (t) => t.replace(/\s+/g, ' ').trim();
    assert.equal(norm(lire('firestore.rules')), norm(bloc));
    assert.match(lire('firestore.rules'), /match \/\{document=\*\*\}/); // jokers : couvrent les nouvelles collections
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
  test('D3 package.json uniquement dans tests/', () => {
    assert.ok(!existsSync(join(RACINE, 'package.json')));
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

  test('D4 firestore.rules : un seul bloc joker réservé aux deux comptes vérifiés (aucune modification en 2.0)', () => {
    const r = lire('firestore.rules');
    assert.equal((r.match(/match /g) || []).length, 2);
    assert.match(r, /email_verified == true/);
    assert.match(r, /jerome\.chevalier@gmail\.com/);
    assert.match(r, /jeromebot\.chevalierbot@gmail\.com/);
  });

  test('D4 pas de Cloud Function ni de Cloud Storage', () => {
    for (const f of fichiersAppli().filter((x) => /\.js$/.test(x))) assert.doesNotMatch(lire(f), /firebase-functions|firebase-storage|getStorage|httpsCallable/, f);
    assert.ok(!existsSync(join(RACINE, 'functions')));
  });
});
