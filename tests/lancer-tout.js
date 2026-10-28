// Lanceur des paliers de tests : complet (npm run test:complet, ordinateur), nuit (--nuit : ordinateur + téléphone, 3 passages par défaut, seulement en local ; sur GitHub, la nuit est découpée en 13 jobs qui lancent chacun une partie avec --e2e --shard), rapide (--rapide : sans navigateur), module (--module <nom>) ou navigateur seul (--e2e …, utilisé par test:smoke).
// Les séries (chacune avec ses propres émulateurs, donc ses propres ports) tournent en même temps ; le code de sortie est non nul si UNE échoue.
// Mêmes fichiers de test qu'avant : les listes viennent de package.json (scripts test:regles, test:logique, test:storage…).
import { spawn, spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync, rmSync, createWriteStream } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decalage, ports, RANGS, portsPris } from './ports.js';

const TESTS = fileURLToPath(new URL('.', import.meta.url));
const RACINE = resolve(TESTS, '..');
const DOSSIER = join(TESTS, '.config-ports');
const SCRIPTS = JSON.parse(readFileSync(join(TESTS, 'package.json'), 'utf8')).scripts;
const RAPIDE = process.argv.includes('--rapide');
// `--sans-navigateur` : le palier complet moins la série navigateur (noyau, storage, outil client, automatisations). GitHub le lance en parallèle des 6 parties navigateur (`--e2e … --shard=i/6`) ; à eux tous, ils couvrent exactement le palier complet.
const SANS_NAVIGATEUR = process.argv.includes('--sans-navigateur');
// `--module <nom>` : seulement les fichiers dont le nom commence par <nom> (tests/<nom>*.test.js et tests/e2e/<nom>*.spec.js), format ordinateur.
const POS_MODULE = process.argv.indexOf('--module');
const MODULE = POS_MODULE === -1 ? null : (process.argv[POS_MODULE + 1] || '');
// Palier « complet » = format ordinateur seulement (ce que GitHub lance sur chaque PR) ; `--nuit` = ordinateur et téléphone, chaque scénario TESTS_REPETER fois (3 par défaut ; usage local, GitHub lance les parties une à une).
const NUIT = process.argv.includes('--nuit');
// TESTS_REPETER : nombre de passages de la suite de nuit (3 par défaut, en local ; le workflow GitHub découpe la nuit et met 1).
const REPETER = `--repeat-each=${Number(process.env.TESTS_REPETER) || 3}`;
// `node lancer-tout.js --e2e <arguments de playwright>` : seulement la série navigateur (un fichier de spec, --repeat-each…), mêmes ports et mêmes émulateurs.
const POS_E2E = process.argv.indexOf('--e2e');
const ARGS_E2E = POS_E2E === -1 ? null : process.argv.slice(POS_E2E + 1).map((a) => `'${a.replace(/'/g, `'\\''`)}'`).join(' ');

// Java : le même que celui de la session de Jérôme s'il n'est pas déjà dans le PATH.
const JDK = join(homedir(), '.local/jdk-21/Contents/Home');
const env = { ...process.env };
if (spawnSync('java', ['-version'], { stdio: 'ignore', env }).status !== 0 && existsSync(join(JDK, 'bin/java'))) {
  env.JAVA_HOME = JDK;
  env.PATH = `${join(JDK, 'bin')}:${env.PATH}`;
}

const d = decalage();
const pad = (n) => String(Math.round(n)).padStart(2, '0');
const duree = (ms) => `${pad(ms / 60000 | 0)} min ${pad((ms / 1000) % 60)} s`;

/** Copie de firebase.json / firebase.plateforme.json avec les ports de la série (le fichier d'origine ne change pas). */
function genererConfig(source, serie) {
  const p = ports(RANGS[serie]);
  const c = JSON.parse(readFileSync(join(RACINE, source), 'utf8'));
  for (const k of ['firestore', 'storage']) if (c[k]?.rules) c[k].rules = join(RACINE, c[k].rules);
  if (Array.isArray(c.functions)) c.functions = c.functions.map((f) => ({ ...f, source: join(RACINE, f.source) }));
  const e = c.emulators ?? {};
  e.singleProjectMode = false; // un projet par worker
  e.auth = { host: '127.0.0.1', port: p.auth };
  e.firestore = { host: '127.0.0.1', port: p.firestore, websocketPort: p.websocket };
  if (e.storage) e.storage = { host: '127.0.0.1', port: p.storage };
  delete e.functions;
  e.hub = { host: '127.0.0.1', port: p.hub };
  e.logging = { host: '127.0.0.1', port: p.logging };
  e.ui = { enabled: false };
  c.emulators = e;
  mkdirSync(DOSSIER, { recursive: true });
  const fichier = join(DOSSIER, `${d}-${serie}.json`);
  writeFileSync(fichier, JSON.stringify(c, null, 2));
  return fichier;
}

/** La commande « node --test … » d'un script `firebase emulators:exec … --only X "commande"` de package.json. */
const interieur = (script) => SCRIPTS[script].match(/--only (\S+) "(.*)"$/s).slice(1, 3);
const sansPreparer = (script) => SCRIPTS[script].replace(/^npm run preparer && /, '');

const etape = (nom, commande) => `etape ${nom} ${commande}`;
const SCRIPT_ETAPES = `etape() { n=$1; shift; s=$(date +%s); "$@"; r=$?; echo "@@ETAPE $n $(( $(date +%s) - s )) s code=$r"; [ $r -ne 0 ] && echo "@@ECHEC $n"; return 0; }; `;

function serie({ nom, config, only, etapes, env: envPlus = {} }) {
  return { nom, config, only, etapes, envPlus, rang: RANGS[nom] ?? RANGS[nom.replace(/-rapide$/, '')] ?? 0 };
}

/** Palier « module » : les tests dont le nom commence par `nom`, rangés dans la série d'émulateurs qui leur convient. */
function seriesModule(nom, onlyStorage, cmdStorage, onlyOutil, cmdOutil, onlyAuto, cmdAuto) {
  if (!/^[a-z0-9-]+$/i.test(nom)) { console.error('Usage : npm run test:module <nom>  (ex. : projets, liens-documents, veille)'); process.exit(2); }
  const fichiers = readdirSync(TESTS).filter((f) => f.startsWith(nom) && f.endsWith('.test.js'));
  const specs = existsSync(join(TESTS, 'e2e')) ? readdirSync(join(TESTS, 'e2e')).filter((f) => f.startsWith(nom) && f.endsWith('.spec.js')) : [];
  if (!fichiers.length && !specs.length) { console.error(`Aucun fichier de test ne commence par « ${nom} » (tests/${nom}*.test.js, tests/e2e/${nom}*.spec.js).`); process.exit(2); }
  const dans = (cmd) => (f) => cmd.split(/\s+/).includes(f);
  const parPlateforme = [['storage', onlyStorage, cmdStorage], ['outil-client', onlyOutil, cmdOutil], ['automatisations', onlyAuto, cmdAuto]];
  const series = [];
  let restants = fichiers;
  for (const [serieNom, only, cmd] of parPlateforme) {
    const siens = restants.filter(dans(cmd));
    restants = restants.filter((f) => !siens.includes(f));
    if (siens.length) series.push(serie({ nom: serieNom, config: 'firebase.plateforme.json', only, etapes: [etape(serieNom, `node --test --test-concurrency=1 ${siens.join(' ')}`)] }));
  }
  const noyau = restants;
  if (noyau.length) series.push(serie({ nom: 'noyau', config: 'firebase.json', only: 'auth,firestore', etapes: [etape('noyau', `node --test --test-concurrency=1 ${noyau.join(' ')}`)] }));
  if (specs.length) series.push(serie({ nom: 'e2e', config: 'firebase.json', only: 'auth,firestore', etapes: [etape('e2e', `npx playwright test --project=ordinateur ${specs.map((f) => `e2e/${f}`).join(' ')}`)] }));
  return series;
}

function definirSeries() {
  if (ARGS_E2E !== null) return [serie({ nom: 'e2e', config: 'firebase.json', only: 'auth,firestore', etapes: [etape('e2e', `npx playwright test ${ARGS_E2E}`)] })];
  const [onlyStorage, cmdStorage] = interieur('test:storage');
  const [onlyOutil, cmdOutil] = interieur('test:outil-client');
  const [onlyAuto, cmdAuto] = interieur('test:automatisations');
  if (RAPIDE) {
    // Palier « rapide » : tout sauf le navigateur et les émulateurs de la plateforme clients.
    return [serie({ nom: 'noyau', config: 'firebase.json', only: 'auth,firestore', etapes: [
      etape('regles', 'npm run test:regles'), etape('logique', 'npm run test:logique'), etape('statique', 'npm run test:statique'),
      etape('fonctions', sansPreparer('test:fonctions')), etape('porte', 'npm run test:porte')] })];
  }
  if (MODULE !== null) return seriesModule(MODULE, onlyStorage, cmdStorage, onlyOutil, cmdOutil, onlyAuto, cmdAuto);
  const autres = [
    serie({ nom: 'noyau', config: 'firebase.json', only: 'auth,firestore', etapes: [
      etape('regles', 'npm run test:regles'), etape('logique', 'npm run test:logique'), etape('statique', 'npm run test:statique'),
      etape('fonctions', sansPreparer('test:fonctions')), etape('porte', 'npm run test:porte')] }),
    serie({ nom: 'storage', config: 'firebase.plateforme.json', only: onlyStorage, etapes: [etape('storage', cmdStorage)] }),
    serie({ nom: 'outil-client', config: 'firebase.plateforme.json', only: onlyOutil, etapes: [etape('outil-client', cmdOutil)] }),
    serie({ nom: 'automatisations', config: 'firebase.plateforme.json', only: onlyAuto, etapes: [etape('automatisations', cmdAuto)] }),
  ];
  if (SANS_NAVIGATEUR) return autres;
  return [
    // Nuit : un émulateur par format (ordinateur, téléphone). Une seule série de 33 min faisait caler l'émulateur Firestore en fin de course (19/10/2026).
    ...(NUIT ? [
      serie({ nom: 'e2e', config: 'firebase.json', only: 'auth,firestore', etapes: [etape('e2e', `npx playwright test --project=ordinateur ${REPETER}`)] }),
      serie({ nom: 'e2e-telephone', config: 'firebase.json', only: 'auth,firestore', etapes: [etape('e2e-telephone', `npx playwright test --project=telephone ${REPETER}`)] }),
    ] : [serie({ nom: 'e2e', config: 'firebase.json', only: 'auth,firestore', etapes: [etape('e2e', `npx playwright test --project=ordinateur`)] })]),
    ...autres,
  ];
}

function lancer(s) {
  const debut = Date.now();
  const rang = s.rang;
  const config = genererConfig(s.config, s.nom.replace(/-rapide$/, ''));
  const journal = join(DOSSIER, `${d}-${s.nom}.log`);
  const dossierSerie = join(DOSSIER, `${d}-${s.nom}`);
  mkdirSync(dossierSerie, { recursive: true });
  // Dossier temporaire propre à la série : l'émulateur Storage y range ses fichiers et le hub y pose son repère (sinon deux séries se marchent dessus).
  const tmp = join(tmpdir(), `chevalier-tests-${d}-${s.nom}`); // hors du dépôt (l'outil client refuse d'écrire dans le dépôt)
  rmSync(tmp, { recursive: true, force: true });
  mkdirSync(tmp, { recursive: true });
  const commande = `${SCRIPT_ETAPES}cd '${TESTS}'; ${s.etapes.join('; ')}`;
  const sortie = createWriteStream(journal);
  const fb = join(TESTS, 'node_modules/.bin/firebase');
  const enfant = spawn(fb, ['emulators:exec', '--config', config, '--project', 'demo-chevalier-ia-os', '--only', s.only, commande],
    { cwd: dossierSerie, env: { ...env, ...s.envPlus, TMPDIR: tmp, TESTS_RANG: String(rang), TESTS_DECALAGE: String(d) } });
  enfant.stdout.pipe(sortie, { end: false });
  enfant.stderr.pipe(sortie, { end: false });
  return new Promise((ok) => enfant.on('close', (code) => {
    sortie.end();
    const texte = readFileSync(journal, 'utf8');
    const etapes = [...texte.matchAll(/@@ETAPE (\S+) (\d+) s code=(\d+)/g)].map((m) => ({ nom: m[1], secondes: Number(m[2]), code: Number(m[3]) }));
    const echecs = etapes.filter((e) => e.code !== 0).map((e) => e.nom);
    const ok_ = code === 0 && echecs.length === 0 && etapes.length === s.etapes.length;
    ok({ nom: s.nom, ok: ok_, code, duree: Date.now() - debut, etapes, echecs, journal, texte });
  }));
}

async function principal() {
  const series = definirSeries();
  const tous = series.flatMap((s) => {
    const p = ports(s.rang);
    const liste = [['auth', p.auth], ['firestore', p.firestore], ['websocket Firestore', p.websocket], ['hub', p.hub], ['logging', p.logging]];
    if (s.config.includes('plateforme') && /storage/.test(s.only)) liste.push(['storage', p.storage]);
    if (s.nom.startsWith('e2e')) liste.push(['serveur de test', p.serveur]);
    return liste.map(([n, port]) => [`${n} (série ${s.nom})`, port]);
  });
  const pris = await portsPris(tous);
  if (pris.length) {
    for (const p of pris) console.error(`Port ${p.port} pris (${p.nom}) ; relance avec TESTS_DECALAGE=${d + 1}`);
    process.exit(2);
  }
  // On ne nettoie que les fichiers de CE décalage : une autre session peut utiliser le même dossier avec un autre décalage.
  if (existsSync(DOSSIER)) for (const f of readdirSync(DOSSIER)) if (f.startsWith(`${d}-`)) rmSync(join(DOSSIER, f), { recursive: true, force: true });

  // La copie des fonctions (nécessaire pour charger les tests) est faite une seule fois, avant le départ des séries.
  const prep = spawnSync('npm', ['run', '--silent', 'preparer'], { cwd: TESTS, env, encoding: 'utf8' });
  if (prep.status !== 0) { console.error(prep.stdout, prep.stderr); process.exit(1); }

  console.log(`${RAPIDE ? 'Palier rapide' : SANS_NAVIGATEUR ? 'Palier complet sans navigateur' : MODULE !== null ? `Module « ${MODULE} »` : ARGS_E2E !== null ? 'Navigateur seul' : NUIT ? 'Suite de nuit' : 'Palier complet'} : ${series.length} séries en même temps (TESTS_DECALAGE=${d}).`);
  const debut = Date.now();
  const resultats = await Promise.all(series.map(async (s) => {
    const r = await lancer(s);
    console.log(`${r.ok ? '✔' : '✖'} série ${r.nom} : ${duree(r.duree)}${r.echecs.length ? ` (échec : ${r.echecs.join(', ')})` : ''}`);
    return r;
  }));
  console.log('\nDétail par étape :');
  for (const r of resultats) {
    const somme = r.etapes.reduce((a, e) => a + e.secondes, 0);
    console.log(`  ${r.nom} (${duree(r.duree)}, démarrage des émulateurs ≈ ${Math.max(0, Math.round(r.duree / 1000 - somme))} s) : ${r.etapes.map((e) => `${e.nom} ${e.secondes} s${e.code ? ' ✖' : ''}`).join(', ')}`);
  }
  const echecs = resultats.filter((r) => !r.ok);
  for (const r of echecs) {
    console.log(`\n===== Sortie de la série en échec : ${r.nom} (journal complet : ${r.journal}) =====`);
    console.log(r.texte.split('\n').slice(-120).join('\n'));
  }
  console.log(`\n${echecs.length ? '✖ ÉCHEC' : '✔ Tout est vert'} : ${duree(Date.now() - debut)} au total.`);
  process.exit(echecs.length ? 1 : 0);
}

principal().catch((e) => { console.error(e.message); process.exit(1); });
