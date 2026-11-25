#!/usr/bin/env node
// Joue le PLAN de la base (outils/base/migrations puis outils/base/tests) sur une base PostgreSQL 17 JETABLE, créée pour l'occasion
// dans un dossier temporaire, puis arrêtée. Ne touche JAMAIS une vraie base :
//   - refuse de démarrer si PGHOST ou DATABASE_URL est défini (signe qu'une vraie base est configurée dans le terminal) ;
//   - ne se connecte que par la prise locale (socket) du serveur qu'il vient de créer, jamais par le réseau (listen_addresses vide) ;
//   - arrête le serveur avec « pg_ctl stop -D <dossier> » (jamais de kill).
// Utilisation : node outils/base/tester.js            (migrations + tests)
//               node outils/base/tester.js --avec-a-activer   (en plus : une 2e base avec les fichiers de a-activer/ et leurs tests)
// Binaires : ~/Applications/Postgres.app/Contents/Versions/17/bin (PostgreSQL 17), ou le dossier donné par PG_BIN.
// S'arrête en erreur au premier échec.
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const net = require('net');
const { spawnSync } = require('child_process');

const ICI = __dirname;
const AVEC_A_ACTIVER = process.argv.includes('--avec-a-activer');

if (process.env.PGHOST || process.env.DATABASE_URL) {
  console.error('Refus : PGHOST ou DATABASE_URL est défini. Ce script ne joue que sur une base jetable : retire ces variables.');
  process.exit(2);
}
for (const v of ['PGPORT', 'PGUSER', 'PGDATABASE', 'PGPASSWORD', 'PGSERVICE', 'PGSERVICEFILE', 'PGPASSFILE']) delete process.env[v];

const BIN = process.env.PG_BIN || path.join(os.homedir(), 'Applications/Postgres.app/Contents/Versions/17/bin');
const outil = (nom) => path.join(BIN, nom);
for (const nom of ['initdb', 'pg_ctl', 'psql']) {
  if (!fs.existsSync(outil(nom))) {
    console.error(`Introuvable : ${outil(nom)}. Installe Postgres.app (PostgreSQL 17) ou donne le dossier des binaires dans PG_BIN.`);
    process.exit(2);
  }
}

function lancer(nom, args, options = {}) {
  const r = spawnSync(outil(nom), args, { encoding: 'utf8', ...options });
  if (r.error) throw r.error;
  return r;
}

function portLibre(port) {
  return new Promise((ok) => {
    const s = net.createServer();
    s.once('error', () => ok(false));
    s.once('listening', () => s.close(() => ok(true)));
    s.listen(port, '127.0.0.1');
  });
}

async function choisirPort(dossierPrise) {
  for (let i = 0; i < 200; i += 1) {
    const port = 55001 + Math.floor(Math.random() * 4900);   // toujours au-dessus de 55000
    if (fs.existsSync(path.join(dossierPrise, `.s.PGSQL.${port}`))) continue;
    if (await portLibre(port)) return port;
  }
  throw new Error('Aucun port libre trouvé au-dessus de 55000');
}

function fichiersSql(dossier) {
  if (!fs.existsSync(dossier)) return [];
  return fs.readdirSync(dossier).filter((f) => f.endsWith('.sql')).sort().map((f) => path.join(dossier, f));
}

async function principal() {
  const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'pb-'));   // chemin court : la prise locale ne dépasse pas 103 caractères
  const donnees = path.join(racine, 'd');
  const journal = path.join(racine, 'serveur.log');
  let demarre = false;
  let code = 0;
  try {
    const init = lancer('initdb', ['-D', donnees, '-U', 'plan_admin', '--auth=trust', '-E', 'UTF8', '--locale=C', '--no-instructions']);
    if (init.status !== 0) throw new Error(`initdb a échoué :\n${init.stderr}`);
    const port = await choisirPort(racine);
    const opts = `-k ${racine} -p ${port} -c listen_addresses='' -c fsync=off -c log_min_messages=warning`;
    const dem = lancer('pg_ctl', ['start', '-D', donnees, '-w', '-t', '60', '-l', journal, '-o', opts]);
    if (dem.status !== 0) throw new Error(`Démarrage refusé :\n${dem.stderr}\n${fs.existsSync(journal) ? fs.readFileSync(journal, 'utf8') : ''}`);
    demarre = true;
    console.log(`Base jetable démarrée (PostgreSQL ${BIN.includes('/17/') ? '17' : '?'}, prise locale ${racine}, port ${port}).`);

    const psql = (base, fichier) => lancer('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', racine, '-p', String(port),
      '-U', 'plan_admin', '-d', base, '-f', fichier], { env: { ...process.env, PGOPTIONS: '-c client_min_messages=warning' } });
    const commande = (base, sql) => lancer('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', racine, '-p', String(port),
      '-U', 'plan_admin', '-d', base, '-c', sql]);

    const jouer = (base, fichiers, etiquette) => {
      for (const f of fichiers) {
        const r = psql(base, f);
        if (r.status !== 0) {
          throw new Error(`ÉCHEC ${etiquette} ${path.relative(ICI, f)}\n${r.stderr}${r.stdout}`);
        }
        console.log(`  ok  ${etiquette} ${path.relative(ICI, f)}`);
      }
    };

    const migrations = fichiersSql(path.join(ICI, 'migrations'));
    const tests = fichiersSql(path.join(ICI, 'tests'));
    if (migrations.length === 0) throw new Error('Aucune migration trouvée');

    let r = commande('postgres', 'create database plan');
    if (r.status !== 0) throw new Error(r.stderr);
    jouer('plan', migrations, 'migration');
    // Les migrations se rejouent sans erreur (create or replace, if not exists).
    jouer('plan', migrations, 'migration (2e passage)');
    // Chaque fichier de test part d'une copie neuve de la base migrée (les données d'un test ne gênent pas le suivant).
    const testerChacun = (modele, fichiers, etiquette) => {
      fichiers.forEach((f, i) => {
        const base = `${modele}_t${i}`;
        const c = commande('postgres', `create database ${base} template ${modele}`);
        if (c.status !== 0) throw new Error(c.stderr);
        jouer(base, [f], etiquette);
      });
    };
    testerChacun('plan', tests, 'test');
    let total = tests.length;

    if (AVEC_A_ACTIVER) {
      r = commande('postgres', 'create database plan_a_activer');
      if (r.status !== 0) throw new Error(r.stderr);
      jouer('plan_a_activer', migrations, 'migration');
      jouer('plan_a_activer', fichiersSql(path.join(ICI, 'a-activer')), 'à activer');
      const testsA = fichiersSql(path.join(ICI, 'tests', 'a-activer'));
      testerChacun('plan_a_activer', testsA, 'test (à activer)');
      total += testsA.length;
    } else {
      console.log('  (fichiers de a-activer/ non testés : relancer avec --avec-a-activer)');
    }
    console.log(`\nTout est vert : ${migrations.length} migrations, ${total} fichiers de tests.`);
  } catch (e) {
    console.error(`\n${e.message}`);
    code = 1;
  } finally {
    let arrete = true;
    if (demarre) {
      const arret = lancer('pg_ctl', ['stop', '-D', donnees, '-m', 'fast', '-w']);
      if (arret.status !== 0) {
        console.error(`Arrêt difficile : ${arret.stderr}`);
        arrete = false;
        code = code || 1;
      }
    }
    if (process.argv.includes('--garder') || !arrete) {
      console.log(`Dossier gardé : ${racine}`);
    } else if (arrete) {
      fs.rmSync(racine, { recursive: true, force: true });   // seulement le dossier temporaire créé ci-dessus
    }
  }
  process.exit(code);
}

principal();
