#!/usr/bin/env node
// Joue la VRAIE porte de la base (functions/src/base/porte-base.js) devant un PostgreSQL 17 JETABLE où le plan (outils/base/migrations) est installé
// (relecture Fable du 26/11/2026 : les tests de tests/base-porte*.test.js simulent `pg` ; ici, le catalogue, `set local role`, set_config(…, true) et la
// réutilisation d'une connexion du pool sont vérifiés contre la vraie base). Lancé à part, comme tester.js (pas dans la suite de tests) :
//   node outils/base/tester-porte.mjs
// Prérequis : Postgres.app (PostgreSQL 17) ou PG_BIN ; `npm ci` dans functions/ (paquet `pg`). Même prudence que tester.js : refuse PGHOST / DATABASE_URL,
// prise locale seulement (listen_addresses vide), arrêt par « pg_ctl stop -D » et effacement du seul dossier temporaire créé.
// Pool d'UNE connexion : chaque requête réutilise la même, ce qui prouve qu'aucun réglage (espace, personne, rôle) ne reste d'un appel à l'autre.
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';

if (process.env.PGHOST || process.env.PGHOSTADDR || process.env.DATABASE_URL) {
  console.error('Refus : PGHOST, PGHOSTADDR ou DATABASE_URL est défini. Ce script ne joue que sur une base jetable : retire ces variables.');
  process.exit(2);
}
const RACINE_DEPOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const BIN = process.env.PG_BIN || path.join(os.homedir(), 'Applications/Postgres.app/Contents/Versions/17/bin');
for (const n of ['initdb', 'pg_ctl', 'psql']) if (!fs.existsSync(path.join(BIN, n))) { console.error(`Introuvable : ${path.join(BIN, n)}`); process.exit(2); }
const ENV = { PATH: process.env.PATH || '/usr/bin:/bin', HOME: os.homedir(), TMPDIR: os.tmpdir(), LC_ALL: 'C' };
const lancer = (n, a) => spawnSync(path.join(BIN, n), a, { encoding: 'utf8', env: ENV });

const racine = fs.mkdtempSync(path.join(os.tmpdir(), 'pp-'));
const D = path.join(racine, 'd');
const port = 55001 + Math.floor(Math.random() * 4900);
let demarre = false;
let echecs = 0;

function verifier(nom, fn) {
  return Promise.resolve().then(fn).then(() => console.log(`ok   ${nom}`), (e) => { echecs += 1; console.log(`ÉCHEC ${nom} : ${e.message}`); });
}

try {
  let r = lancer('initdb', ['-D', D, '-U', 'plan_admin', '--auth=trust', '-E', 'UTF8', '--locale=C', '--no-instructions']);
  if (r.status) throw new Error(r.stderr);
  r = lancer('pg_ctl', ['start', '-D', D, '-w', '-l', path.join(racine, 'log'), '-o', `-k "${racine}" -p ${port} -c listen_addresses='' -c fsync=off`]);
  if (r.status) throw new Error(r.stderr);
  demarre = true;
  const psql = (base, args) => lancer('psql', ['-X', '-q', '-v', 'ON_ERROR_STOP=1', '-h', racine, '-p', String(port), '-U', 'plan_admin', '-d', base, ...args]);
  r = psql('postgres', ['-c', 'create database plan']);
  if (r.status) throw new Error(r.stderr);
  const dossier = path.join(RACINE_DEPOT, 'outils/base/migrations');
  for (const f of fs.readdirSync(dossier).filter((x) => x.endsWith('.sql')).sort()) {
    r = psql('plan', ['-f', path.join(dossier, f)]);
    if (r.status) throw new Error(`${f} : ${r.stderr}`);
  }
  // Comme le plan C de Cloud SQL : un compte de connexion sans droit propre, membre des rôles porte et robot_reflets.
  r = psql('plan', ['-c', 'create role porte_fn login noinherit in role porte, robot_reflets']);
  if (r.status) throw new Error(r.stderr);

  const require = createRequire(path.join(RACINE_DEPOT, 'functions/package.json'));
  const pg = require('pg');
  const { creerTypes } = await import(pathToFileURL(path.join(RACINE_DEPOT, 'functions/src/pilotage/postgres.js')));
  const pb = await import(pathToFileURL(path.join(RACINE_DEPOT, 'functions/src/base/porte-base.js')));
  const pool = new pg.Pool({ host: racine, port, user: 'porte_fn', database: 'plan', max: 1, types: creerTypes(pg.types) });
  const ouvrir = async () => { const c = await pool.connect(); return { interroger: (s, v) => (v?.length ? c.query(s, v) : c.query(s)), liberer: (x) => c.release(x ? true : undefined) }; };
  let espace = 'esp-a';
  const cleN8n = 'n'.repeat(64);
  const g = pb.creerGestionnaireBasePorte({
    lireConfiguration: async () => pb.validerConfiguration(JSON.stringify({ instance: 'projet-essai:europe-west9:base', base: 'plan', utilisateur: 'porte_fn', mot_de_passe: 'x', espace, bucket: 'reserve-essai', cle_liens: 'k'.repeat(48), origines: [] })),
    lireCleN8n: async () => cleN8n,
    verifierJeton: async (j) => ({ email: `${j}@exemple.fr`, email_verified: true, role: 'authenticated', espace_base: espace }),
    estCompteAutorise: async () => true,
    ouvrirConnexion: ouvrir,
    stockage: {},
    originesParDefaut: () => [],
  });
  const appel = async (methode, url, entetes = {}, corps) => {
    const h = Object.fromEntries(Object.entries(entetes).map(([k, v]) => [k.toLowerCase(), v]));
    const res = { statut: 0, e: {}, corps: '', status(s) { this.statut = s; return this; }, set(k, v) { if (typeof k === 'object') Object.assign(this.e, k); else this.e[k] = v; return this; }, send(b) { this.corps = b; }, end() {} };
    await g({ method: methode, originalUrl: url, headers: h, body: corps, get: (n) => h[n.toLowerCase()] }, res);
    let json = null;
    try { json = res.corps ? JSON.parse(res.corps) : null; } catch { json = null; }
    return { statut: res.statut, json, entetes: res.e };
  };
  const N = { 'X-Porte-Cle': cleN8n };
  const NAV = (u) => ({ Authorization: `Bearer ${u}` });
  const etat = async () => {
    const c = await pool.connect();
    try { return (await c.query("select current_user as u, coalesce(current_setting('app.espace_id', true), '') as e, coalesce(current_setting('app.utilisateur', true), '') as q")).rows[0]; } finally { c.release(); }
  };
  const propre = async () => { const x = await etat(); assert.equal(x.u, 'porte_fn'); assert.equal(x.e, ''); assert.equal(x.q, ''); };

  let idA = null;
  await verifier('1 n8n écrit deux chantiers (rôle robot_reflets, espace de la configuration), valeur piégée stockée telle quelle', async () => {
    const r1 = await appel('POST', '/rest/v1/chantiers?select=id,nom,code,espace_id', { ...N, Prefer: 'return=representation' }, [{ nom: 'Chantier A', code: 'A1' }, { nom: "O'Brien; drop table chantiers;--", code: 'A2' }]);
    assert.equal(r1.statut, 201, JSON.stringify(r1.json));
    assert.equal(r1.json.length, 2);
    assert.ok(r1.json.every((l) => l.espace_id === 'esp-a'));
    idA = r1.json[0].id;
  });
  await verifier('2 après la transaction, la connexion réutilisée ne garde ni rôle, ni espace, ni personne', propre);
  await verifier('3 doublon ignoré (SAVEPOINT) avec resolution=ignore-duplicates ; sans elle → 409', async () => {
    const r1 = await appel('POST', '/rest/v1/chantiers?on_conflict=code&select=id', { ...N, Prefer: 'resolution=ignore-duplicates,return=representation' }, [{ nom: 'x', code: 'A1' }, { nom: 'Chantier A3', code: 'A3' }]);
    assert.equal(r1.statut, 201, JSON.stringify(r1.json));
    assert.equal(r1.json.length, 1);
    assert.equal((await appel('POST', '/rest/v1/chantiers', N, { nom: 'x', code: 'A1' })).statut, 409);
  });
  await verifier('4 un espace_id forcé dans le corps est ignoré : la base range la ligne dans l\'espace de la configuration', async () => {
    const r1 = await appel('POST', '/rest/v1/chantiers?select=espace_id', { ...N, Prefer: 'return=representation' }, { nom: 'pirate', code: 'P1', espace_id: 'esp-b' });
    assert.equal(r1.statut, 201, JSON.stringify(r1.json));
    assert.deepEqual(r1.json, [{ espace_id: 'esp-a' }]);
  });
  await verifier('5 navigateur : lecture avec count=exact → Content-Range ; filtres in / ilike / is', async () => {
    const r1 = await appel('GET', '/rest/v1/chantiers?select=id,nom,code&order=code.asc&limit=2&offset=0', { ...NAV('lea'), Prefer: 'count=exact' });
    assert.equal(r1.statut, 200, JSON.stringify(r1.json));
    assert.equal(r1.entetes['Content-Range'], '0-1/4');
    const r2 = await appel('GET', '/rest/v1/chantiers?select=code&code=in.(A1,"A3")&nom=ilike.*chantier*&order=code.desc', NAV('lea'));
    assert.deepEqual(r2.json, [{ code: 'A3' }, { code: 'A1' }]);
  });
  await verifier('6 navigateur : favoris_os, tickets_n8n, journal_modifications refusés (liste blanche) ; table inconnue 404 ; colonne inconnue 400', async () => {
    for (const t of ['favoris_os', 'tickets_n8n', 'journal_modifications']) assert.equal((await appel('GET', `/rest/v1/${t}?limit=1`, NAV('lea'))).statut, 403, t);
    assert.equal((await appel('GET', '/rest/v1/pg_authid', N)).statut, 404);
    assert.equal((await appel('GET', '/rest/v1/chantiers?select=mot_de_passe', NAV('lea'))).statut, 400);
  });
  await verifier('7 navigateur : les 3 fonctions permises répondent (catalogue des fonctions réel), une autre est refusée', async () => {
    assert.equal((await appel('POST', '/rest/v1/rpc/lister_favoris_os', NAV('lea'), {})).statut, 200);
    const t = await appel('POST', '/rest/v1/rpc/demander_ticket_n8n', NAV('lea'), { p_usage: 'actions' });
    assert.equal(t.statut, 200, JSON.stringify(t.json));
    assert.ok(t.json !== null && t.json !== '', 'un ticket est rendu');
    assert.equal((await appel('POST', '/rest/v1/rpc/consommer_ticket', NAV('lea'), { p_ticket: 'x', p_usage: 'actions' })).statut, 403);
  });
  await verifier('8 n8n : fonction d\'installation refusée ; PATCH puis lecture en objet unique ; par où = n8n posé par la base', async () => {
    assert.equal((await appel('POST', '/rest/v1/rpc/poser_socle', N, {})).statut, 403);
    // « par_ou » envoyé par la requête : ignoré ; la base écrit la voie posée par la porte (app.par_ou = n8n, migration 012).
    const p = await appel('PATCH', `/rest/v1/chantiers?id=eq.${idA}&select=nom`, { ...N, Prefer: 'return=representation' }, { nom: 'Chantier A bis', par_ou: 'ecran' });
    assert.equal(p.statut, 200, JSON.stringify(p.json));
    const o = await appel('GET', `/rest/v1/chantiers?select=nom,par_ou&id=eq.${idA}`, { ...N, Accept: 'application/vnd.pgrst.object+json' });
    assert.deepEqual(o.json, { nom: 'Chantier A bis', par_ou: 'n8n' });
  });
  await verifier('9 navigateur : POST d\'une table refusé', async () => {
    assert.equal((await appel('POST', '/rest/v1/chantiers', NAV('lea'), { nom: 'x', code: 'Z' })).statut, 403);
  });
  await verifier('10 autre espace : ne voit rien de A, même avec un filtre espace_id ; ne peut pas modifier un chantier de A', async () => {
    espace = 'esp-b';
    const r1 = await appel('GET', '/rest/v1/chantiers?select=code', { ...NAV('lea'), Prefer: 'count=exact' });
    assert.deepEqual(r1.json, []);
    assert.deepEqual((await appel('GET', '/rest/v1/chantiers?select=code&espace_id=eq.esp-a', NAV('lea'))).json, []);
    const p = await appel('PATCH', `/rest/v1/chantiers?id=eq.${idA}&select=nom`, { ...N, Prefer: 'return=representation' }, { nom: 'vol' });
    assert.deepEqual(p.json, []);
  });
  await verifier('11 fin : connexion toujours propre', propre);
  await pool.end();
} catch (e) {
  echecs += 1;
  console.error(`ÉCHEC de préparation : ${e.message}`);
} finally {
  if (demarre) lancer('pg_ctl', ['stop', '-D', D, '-m', 'fast', '-w']);
  fs.rmSync(racine, { recursive: true, force: true }); // seulement le dossier temporaire créé ci-dessus
}
console.log(echecs ? `\n${echecs} échec(s).` : '\nTout est vert.');
process.exit(echecs ? 1 : 0);
