// Module Pilotage : le seul fichier qui parle à Postgres (functions/src/pilotage/postgres.js). Faux client `pg` injecté : aucun réseau, aucune vraie valeur de connexion.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { test, describe } from 'node:test';
import { creerConnecteurPostgres, lireConnexion, convertirType, creerTypes, ErreurPostgres, NOM_SECRET_PILOTAGE, DELAI_REQUETE_MS } from '../functions/src/pilotage/postgres.js';

const SECRET = { hote: 'hote-secret.example.test', port: '6543', base: 'base_secrete', utilisateur: 'utilisateur_secret', mot_de_passe: 'mdp-secret-0123', ca: '-----BEGIN CERTIFICATE-----\nFAUX\n-----END CERTIFICATE-----' };
const typesPg = { getTypeParser: (oid) => (x) => `defaut:${oid}:${x}` };

function fauxPg({ lignes = [{ a: 1 }], echecQuery = null } = {}) {
  const vus = { configs: [], requetes: [], fins: 0 };
  class Client {
    constructor(config) { vus.configs.push(config); }
    on() {}
    async connect() {}
    async query(sql, ...autres) { vus.requetes.push({ sql, autres }); if (echecQuery) throw echecQuery; return { rows: lignes }; }
    async end() { vus.fins += 1; }
  }
  return { vus, pg: { Client, types: typesPg } };
}

describe('1 connexion', () => {
  test('1.1 le secret est lu à l\'exécution sous son nom ; TLS vérifié avec le certificat du secret ; délai de 10 s', async () => {
    const { pg, vus } = fauxPg();
    const noms = [];
    const ouvrir = creerConnecteurPostgres({ lireSecret: async (n) => { noms.push(n); return JSON.stringify(SECRET); }, clientPg: pg });
    const c = await ouvrir();
    assert.deepEqual(noms, [NOM_SECRET_PILOTAGE]);
    const cfg = vus.configs[0];
    assert.deepEqual(cfg.ssl, { ca: SECRET.ca, rejectUnauthorized: true });
    assert.equal(cfg.statement_timeout, DELAI_REQUETE_MS);
    assert.equal(cfg.statement_timeout, 10_000);
    assert.equal(cfg.port, 6543);
    assert.equal(cfg.host, SECRET.hote);
    assert.equal(cfg.user, SECRET.utilisateur);
    assert.equal('ca' in cfg, false);
    await c.fermer();
    assert.equal(vus.fins, 1);
  });
  test('1.2 requête simple : le texte SQL seul, sans paramètre ni nom (pas de requête préparée : pooler en mode transaction)', async () => {
    const { pg, vus } = fauxPg({ lignes: [{ n: 1 }, { n: 2 }] });
    const c = await creerConnecteurPostgres({ lireSecret: async () => JSON.stringify(SECRET), clientPg: pg })();
    assert.deepEqual(await c.interroger('select * from "v_exemple" limit 5'), [{ n: 1 }, { n: 2 }]);
    assert.deepEqual(vus.requetes, [{ sql: 'select * from "v_exemple" limit 5', autres: [] }]);
    assert.equal(typeof vus.requetes[0].sql, 'string'); // jamais un objet { name, text }
  });
  test('1.3 jamais de repli sans vérification : sans certificat (ou secret incomplet, JSON invalide) : refus, aucune connexion', async () => {
    for (const secret of [{ ...SECRET, ca: '' }, { ...SECRET, ca: undefined }, { ...SECRET, hote: '' }, { ...SECRET, port: 'abc' }, { ...SECRET, mot_de_passe: undefined }, 'pas du json', 'null']) {
      const { pg, vus } = fauxPg();
      const ouvrir = creerConnecteurPostgres({ lireSecret: async () => (typeof secret === 'string' ? secret : JSON.stringify(secret)), clientPg: pg });
      await assert.rejects(ouvrir(), (e) => e instanceof ErreurPostgres && e.type === 'secret' && e.message === 'La base n\'a pas pu être lue.');
      assert.equal(vus.configs.length, 0);
    }
  });
  test('1.4 le code source ne désactive jamais la vérification TLS (pas de rejectUnauthorized à false) et la garde à true', () => {
    const src = readFileSync(new URL('../functions/src/pilotage/postgres.js', import.meta.url), 'utf8');
    assert.ok(!/rejectUnauthorized:\s*false/.test(src));
    assert.match(src, /rejectUnauthorized: true/);
  });
  test('1.5 l\'erreur de connexion ou de requête de pg (qui cite hôte et utilisateur) ne passe jamais dans l\'erreur rendue', async () => {
    const piege = Object.assign(new Error(`password authentication failed for user "${SECRET.utilisateur}" host ${SECRET.hote}`), { code: '28P01' });
    class Client { on() {} async connect() { throw piege; } async end() {} }
    await assert.rejects(creerConnecteurPostgres({ lireSecret: async () => JSON.stringify(SECRET), clientPg: { Client, types: typesPg } })(), (e) => {
      assert.ok(e instanceof ErreurPostgres);
      assert.equal(e.type, 'connexion');
      assert.equal(e.etat, '28P01');
      assert.ok(!JSON.stringify({ m: e.message, s: String(e.stack).split('\n')[0], c: e.cause ?? null, etat: e.etat }).includes(SECRET.hote));
      assert.equal(e.cause, undefined);
      return true;
    });
    const { pg } = fauxPg({ echecQuery: Object.assign(new Error(`relation "v_exemple" does not exist (user ${SECRET.utilisateur})`), { code: '42P01' }) });
    const c = await creerConnecteurPostgres({ lireSecret: async () => JSON.stringify(SECRET), clientPg: pg })();
    await assert.rejects(c.interroger('select 1'), (e) => e instanceof ErreurPostgres && e.type === 'requete' && !e.message.includes(SECRET.utilisateur) && e.cause === undefined);
  });
  test('1.6 lireConnexion rend la configuration attendue', () => {
    assert.deepEqual(lireConnexion(JSON.stringify(SECRET)), { host: SECRET.hote, port: 6543, database: SECRET.base, user: SECRET.utilisateur, password: SECRET.mot_de_passe, ca: SECRET.ca });
  });
});

describe('2 convertisseurs de types', () => {
  test('2.1 numeric et int8 deviennent des nombres', () => {
    assert.equal(convertirType(1700, '100.50'), 100.5);
    assert.equal(convertirType(1700, '100'), 100);
    assert.equal(convertirType(20, '9007199254740'), 9007199254740);
  });
  test('2.2 date reste « AAAA-MM-JJ » ; timestamp et timestamptz en ISO', () => {
    assert.equal(convertirType(1082, '2026-03-01'), '2026-03-01');
    assert.equal(convertirType(1114, '2026-03-01 10:20:30'), '2026-03-01T10:20:30');
    assert.equal(convertirType(1184, '2026-03-01 10:20:30+00'), '2026-03-01T10:20:30.000Z');
  });
  test('2.3 null reste null ; un autre type est laissé au convertisseur par défaut de pg', () => {
    assert.equal(convertirType(1700, null), null);
    assert.equal(convertirType(25, 'abc'), undefined);
    const types = creerTypes(typesPg);
    assert.equal(types.getTypeParser(1700, 'text')('42.5'), 42.5);
    assert.equal(types.getTypeParser(1082)('2026-03-01'), '2026-03-01');
    assert.equal(types.getTypeParser(25, 'text')('abc'), 'defaut:25:abc');
    assert.equal(types.getTypeParser(1700, 'binary')('x'), 'defaut:1700:x');
  });
  test('2.4 le client reçoit bien ces convertisseurs', async () => {
    const { pg, vus } = fauxPg();
    await creerConnecteurPostgres({ lireSecret: async () => JSON.stringify(SECRET), clientPg: pg })();
    assert.equal(vus.configs[0].types.getTypeParser(1700, 'text')('3'), 3);
  });
});

describe('4 une requête à la fois, délais bornés', () => {
  test('4.1 plusieurs lectures lancées ensemble passent en file : jamais deux requêtes en même temps sur la connexion', async () => {
    let enCours = 0;
    let maximum = 0;
    class Client {
      on() {}
      async connect() {}
      async query() { enCours += 1; maximum = Math.max(maximum, enCours); await new Promise((ok) => setTimeout(ok, 15)); enCours -= 1; return { rows: [{ a: 1 }] }; }
      async end() {}
    }
    const c = await creerConnecteurPostgres({ lireSecret: async () => JSON.stringify(SECRET), clientPg: { Client, types: typesPg } })();
    const r = await Promise.all([c.interroger('select 1'), c.interroger('select 2'), c.interroger('select 3')]);
    assert.equal(r.length, 3);
    assert.equal(maximum, 1);
  });
  test('4.2 fermer() ne bloque jamais plus que le délai, même si client.end() ne répond pas ; ensuite plus aucune requête', async () => {
    class Client { on() {} async connect() {} async query() { return { rows: [] }; } end() { return new Promise(() => {}); } }
    const c = await creerConnecteurPostgres({ lireSecret: async () => JSON.stringify(SECRET), clientPg: { Client, types: typesPg }, delaiFermetureMs: 40 })();
    const t0 = Date.now();
    await c.fermer();
    assert.ok(Date.now() - t0 < 1000);
    await assert.rejects(c.interroger('select 1'), (e) => e instanceof ErreurPostgres);
  });
  test('4.3 un connect() qui ne répond jamais : échec générique dans le délai, la fermeture du client à moitié ouvert est bornée elle aussi', async () => {
    class Client { on() {} connect() { return new Promise(() => {}); } end() { return new Promise(() => {}); } }
    const ouvrir = creerConnecteurPostgres({ lireSecret: async () => JSON.stringify(SECRET), clientPg: { Client, types: typesPg }, delaiConnexionMs: 40, delaiFermetureMs: 40 });
    const t0 = Date.now();
    await assert.rejects(ouvrir(), (e) => e instanceof ErreurPostgres && e.type === 'connexion');
    assert.ok(Date.now() - t0 < 1000);
  });
  test('4.4 un connect() qui échoue et un end() qui lève ne bloquent ni ne fuient', async () => {
    class Client { on() {} async connect() { throw new Error(`échec ${SECRET.hote}`); } end() { throw new Error('boum'); } }
    await assert.rejects(creerConnecteurPostgres({ lireSecret: async () => JSON.stringify(SECRET), clientPg: { Client, types: typesPg } })(), (e) => e instanceof ErreurPostgres && !e.message.includes(SECRET.hote));
  });
});

describe('3 le paquet pg n\'est importé qu\'à un seul endroit', () => {
  test('3.1 seuls functions/src/pilotage/postgres.js et functions/src/base/cloudsql.js (porte de la base, 26/11/2026) importent `pg` (code exécutable, hors tests, docs et copies générées)', () => {
    const racine = new URL('..', import.meta.url).pathname;
    const trouves = [];
    const parcourir = (dossier) => {
      for (const nom of readdirSync(dossier)) {
        if (['node_modules', '.git', 'tests', 'docs', 'wiki', 'partage', 'serveur'].includes(nom)) continue;
        const chemin = join(dossier, nom);
        if (statSync(chemin).isDirectory()) parcourir(chemin);
        else if (/\.(js|mjs|html)$/.test(nom) && /(from\s+|import\s*\(\s*|require\s*\(\s*)['"]pg['"]/.test(readFileSync(chemin, 'utf8'))) trouves.push(chemin.slice(racine.length));
      }
    };
    for (const d of ['functions', 'functions-plateforme', 'js', 'scripts']) parcourir(join(racine, d));
    assert.deepEqual(trouves, ['functions/src/base/cloudsql.js', 'functions/src/pilotage/postgres.js']);
  });
  test('3.2 `pg` est chargé à la demande (import dynamique), jamais en tête de fichier', () => {
    const src = readFileSync(new URL('../functions/src/pilotage/postgres.js', import.meta.url), 'utf8');
    assert.ok(!/^import .* from 'pg'/m.test(src));
    assert.match(src, /await import\('pg'\)/);
  });
  test('3.3 `pg` est une dépendance exacte (sans ^) de functions/package.json, et l\'index ne lie aucun secret au déploiement', () => {
    const pkg = JSON.parse(readFileSync(new URL('../functions/package.json', import.meta.url), 'utf8'));
    assert.match(pkg.dependencies.pg, /^\d+\.\d+\.\d+$/);
    const index = readFileSync(new URL('../functions/src/index.js', import.meta.url), 'utf8');
    assert.ok(!/defineSecret\([^)]*SUPABASE/.test(index));
    assert.ok(!/SUPABASE_INDICATEURS/.test(index.replace(/\/\/.*$/gm, '')), 'le nom du secret ne vit que dans postgres.js');
  });
});
