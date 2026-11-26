// Porte de la base (basePorte, 26/11/2026) : contrôles de l'appelant, transaction, écritures, stockage et liens signés (functions/src/base/porte-base.js),
// avec un faux `pg`, un faux stockage et un faux vérificateur de jeton Firebase. Aussi : le connecteur Cloud SQL (base/cloudsql.js) avec de faux paquets,
// et le branchement dans functions/src/index.js (aucun secret lié au déploiement).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  creerGestionnaireBasePorte, validerConfiguration, creerLecteurConfiguration, creerLecteurCleN8n, ConfigurationAbsente, jetonLien, jetonLienValide,
  egalTempsConstant, ligneDeJournalPorte, RPC_NAVIGATEUR, NOM_SECRET_PORTE, NOM_SECRET_N8N, LECTURES_NAVIGATEUR, DELAI_TRANSACTION_INACTIVE_MS,
} from '../functions/src/base/porte-base.js';
import { creerOuvreurCloudSql, ErreurConnexionBase } from '../functions/src/base/cloudsql.js';
import { SQL_CATALOGUE_RELATIONS, SQL_CATALOGUE_FONCTIONS } from '../functions/src/base/porte-requetes.js';

const ESPACE = 'espace-essai';
const ORIGINE = 'https://site-essai.web.app';
const CLE_N8N = 'n'.repeat(64);
const CONFIG = validerConfiguration(JSON.stringify({
  instance: 'projet-essai:europe-west9:base', base: 'achats', utilisateur: 'porte_fn', mot_de_passe: 'mdp-essai', espace: ESPACE,
  bucket: 'reserve-essai', cle_liens: 'k'.repeat(48), origines: [ORIGINE],
}));

const RELATIONS = [
  ...['id:uuid', 'numero:text', 'statut:text', 'email_message_id:text', 'donnees:jsonb', 'espace_id:text'].map((c) => ({ relation: 'factures', colonne: c.split(':')[0], type: c.split(':')[1] })),
  { relation: 'chantiers', colonne: 'id', type: 'uuid' }, { relation: 'chantiers', colonne: 'nom', type: 'text' },
  { relation: 'favoris_os', colonne: 'utilisateur', type: 'text' }, { relation: 'favoris_os', colonne: 'cle', type: 'text' },
];
const FONCTIONS = [
  { nom: 'lister_favoris_os', ensemble: true, composite: false, vide: false, noms: [], modes: [], types: [] },
  { nom: 'demander_ticket_n8n', ensemble: false, composite: false, vide: false, noms: ['p_usage'], modes: [], types: ['text'] },
  { nom: 'basculer_favori_os', ensemble: false, composite: false, vide: true, noms: ['p_cle'], modes: [], types: ['text'] },
  { nom: 'rouvrir_facture', ensemble: false, composite: false, vide: false, noms: ['p_id'], modes: [], types: ['uuid'] },
  { nom: 'poser_socle', ensemble: false, composite: false, vide: true, noms: [], modes: [], types: [] },
];

/** Faux `pg` : note chaque requête ; `repondre(sql, valeurs)` rend { rows } ou lève. */
function fausseBase(repondre = () => ({ rows: [] })) {
  const journal = [];
  const liberes = [];
  const ouvrir = async () => ({
    async interroger(sql, valeurs) {
      journal.push({ sql, valeurs });
      if (sql === SQL_CATALOGUE_RELATIONS) return { rows: RELATIONS };
      if (sql === SQL_CATALOGUE_FONCTIONS) return { rows: FONCTIONS };
      if (/^(begin|commit|rollback|set local role|savepoint|release savepoint|rollback to savepoint)/.test(sql) || sql.startsWith("select set_config('app.espace_id'")) return { rows: [] };
      return repondre(sql, valeurs);
    },
    liberer(casse) { liberes.push(casse); },
  });
  return { ouvrir, journal, liberes, sqls: () => journal.map((j) => j.sql) };
}

const JETONS = {
  bon: { email: 'Lea@Exemple.fr', email_verified: true, role: 'authenticated', espace_base: ESPACE },
  nonVerifie: { email: 'lea@exemple.fr', email_verified: false, role: 'authenticated', espace_base: ESPACE },
  autreEspace: { email: 'lea@exemple.fr', email_verified: true, role: 'authenticated', espace_base: 'autre-espace' },
  sansRole: { email: 'lea@exemple.fr', email_verified: true, espace_base: ESPACE },
  inconnu: { email: 'intrus@exemple.fr', email_verified: true, role: 'authenticated', espace_base: ESPACE },
};

function porte({ base = fausseBase(), stockage, config = async () => CONFIG, cle = async () => CLE_N8N, maintenant = () => 1_800_000_000_000, comptes = ['lea@exemple.fr'], originesParDefaut = () => [ORIGINE] } = {}) {
  const evenements = [];
  const fichiers = new Map();
  const stock = stockage ?? {
    async ecrire(bucket, nom, contenu, { contentType, remplacer }) {
      const cleF = `${bucket}/${nom}`;
      if (!remplacer && fichiers.has(cleF)) throw new Error('existe déjà');
      fichiers.set(cleF, { contenu, contentType });
    },
    async lire(bucket, nom) { return fichiers.get(`${bucket}/${nom}`) ?? null; },
  };
  const gestionnaire = creerGestionnaireBasePorte({
    lireConfiguration: config,
    lireCleN8n: cle,
    verifierJeton: async (j) => { if (!JETONS[j]) throw new Error('jeton invalide'); return JETONS[j]; },
    estCompteAutorise: async (email) => comptes.includes(email),
    ouvrirConnexion: base.ouvrir,
    originesParDefaut,
    stockage: stock,
    maintenant,
    journal: (e) => evenements.push(e),
  });
  return { gestionnaire, base, evenements, fichiers };
}

function requete(methode, url, { entetes = {}, corps, brut } = {}) {
  const h = Object.fromEntries(Object.entries(entetes).map(([k, v]) => [k.toLowerCase(), v]));
  return { method: methode, originalUrl: url, url, headers: h, body: corps, rawBody: brut, get: (n) => h[n.toLowerCase()] };
}

function reponse() {
  return {
    statut: null, entetes: {}, corps: undefined, fini: false,
    status(s) { this.statut = s; return this; },
    set(k, v) { if (typeof k === 'object') Object.assign(this.entetes, k); else this.entetes[k] = v; return this; },
    send(b) { this.corps = b; this.fini = true; return this; },
    end() { this.fini = true; return this; },
    json() { return JSON.parse(this.corps); },
  };
}

async function appeler(p, ...args) {
  const res = reponse();
  await p.gestionnaire(requete(...args), res);
  return res;
}

const NAV = { Authorization: 'Bearer bon', Origin: ORIGINE };
const N8N = { 'X-Porte-Cle': CLE_N8N };

describe('1 qui appelle (contrôlé côté serveur à chaque appel)', () => {
  test('1.1 sans jeton → 401, la base n\'est jamais ouverte', async () => {
    const p = porte();
    const r = await appeler(p, 'GET', '/rest/v1/factures?select=id');
    assert.equal(r.statut, 401);
    assert.equal(p.base.journal.length, 0);
  });
  test('1.2 jeton invalide → 401 ; e-mail non vérifié → 403', async () => {
    assert.equal((await appeler(porte(), 'GET', '/rest/v1/factures', { entetes: { Authorization: 'Bearer faux' } })).statut, 401);
    const r = await appeler(porte(), 'GET', '/rest/v1/factures', { entetes: { Authorization: 'Bearer nonVerifie' } });
    assert.equal(r.statut, 403);
    assert.equal(r.json().details, 'acces_base_refuse'); // le navigateur affiche alors « Reconnecte-toi »
  });
  test('1.3 mention espace_base d\'un AUTRE espace, ou sans mention role → 403', async () => {
    for (const j of ['autreEspace', 'sansRole']) {
      const p = porte();
      assert.equal((await appeler(p, 'GET', '/rest/v1/factures', { entetes: { Authorization: `Bearer ${j}` } })).statut, 403, j);
      assert.equal(p.base.journal.length, 0);
    }
  });
  test('1.4 compte absent de comptes_autorises (ou fiche illisible) → 403', async () => {
    assert.equal((await appeler(porte(), 'GET', '/rest/v1/factures', { entetes: { Authorization: 'Bearer inconnu' } })).statut, 403);
    const p = porte({ comptes: [] });
    assert.equal((await appeler(p, 'GET', '/rest/v1/factures', { entetes: NAV })).statut, 403);
  });
  test('1.5 mauvaise clé n8n → 401 (même longueur ou non) ; clé absente du secret → 401', async () => {
    for (const mauvaise of ['x'.repeat(64), 'court', '']) {
      const p = porte();
      assert.equal((await appeler(p, 'GET', '/rest/v1/factures', { entetes: { 'X-Porte-Cle': mauvaise } })).statut, 401);
      assert.equal(p.base.journal.length, 0);
    }
    const p = porte({ cle: async () => { throw new Error('absent'); } });
    assert.equal((await appeler(p, 'GET', '/rest/v1/factures', { entetes: N8N })).statut, 401);
    assert.equal(egalTempsConstant('abc', 'abc'), true);
    assert.equal(egalTempsConstant('abc', 'abd'), false);
  });
  test('1.6 l\'espace vient de la configuration, JAMAIS de la requête : un filtre espace_id n\'est qu\'un filtre, ni l\'en-tête ni le corps ne changent app.espace_id', async () => {
    const p = porte({ base: fausseBase(() => ({ rows: [] })) });
    const r = await appeler(p, 'GET', '/rest/v1/factures?select=id&espace_id=eq.autre', { entetes: { ...NAV, 'X-Espace': 'autre' } });
    assert.equal(r.statut, 200); // espace_id est une vraie colonne : le filtre passe, en paramètre, dans le WHERE…
    const lecture = p.base.journal.find((j) => j.sql.startsWith('select "id" from public."factures"'));
    assert.match(lecture.sql, /where "espace_id" = \$1/);
    assert.equal(lecture.valeurs[0], 'autre');
    const pose1 = p.base.journal.find((j) => j.sql.startsWith("select set_config('app.espace_id'"));
    assert.equal(pose1.valeurs[0], ESPACE); // …mais l'espace posé pour la sécurité par ligne reste celui de la configuration (le filtre ne rend donc rien de plus)
    const p2 = porte();
    await appeler(p2, 'POST', '/rest/v1/rpc/lister_favoris_os', { entetes: { ...NAV, 'X-Espace': 'autre' }, corps: { espace: 'autre' } });
    const pose = p2.base.journal.find((j) => j.sql.startsWith("select set_config('app.espace_id'"));
    assert.deepEqual(pose.valeurs.slice(0, 2), [ESPACE, 'lea@exemple.fr']);
  });
  test('1.7 /auth/v1/user → toujours 401 (les nœuds n8n prennent la voie du ticket), même avec la bonne clé', async () => {
    assert.equal((await appeler(porte(), 'GET', '/auth/v1/user', { entetes: N8N })).statut, 401);
    assert.equal((await appeler(porte(), 'GET', '/auth/v1/user', { entetes: NAV })).statut, 401);
  });
  test('1.7 bis /auth/v1/user → 401 quels que soient les en-têtes (vrai jeton Firebase simulé, bonne clé X-Porte-Cle, les deux, rien), AVANT toute ouverture de base ni contrôle de l’appelant', async () => {
    const appels = { jeton: 0, cle: 0, compte: 0 };
    const base = fausseBase();
    let ouvertures = 0;
    const gestionnaire = creerGestionnaireBasePorte({
      lireConfiguration: async () => CONFIG,
      lireCleN8n: async () => { appels.cle += 1; return CLE_N8N; },
      verifierJeton: async (j) => { appels.jeton += 1; if (!JETONS[j]) throw new Error('jeton invalide'); return JETONS[j]; },
      estCompteAutorise: async () => { appels.compte += 1; return true; },
      ouvrirConnexion: async (c) => { ouvertures += 1; return base.ouvrir(c); },
      originesParDefaut: () => [ORIGINE],
      stockage: { async ecrire() { throw new Error('jamais'); }, async lire() { throw new Error('jamais'); } },
      maintenant: () => 1_800_000_000_000,
      journal: () => {},
    });
    const jwtFirebase = ['eyJhbGciOiJSUzI1NiJ9', 'eyJlbWFpbCI6ImxlYUBleGVtcGxlLmZyIn0', 'c2lnbmF0dXJl'].join('.');
    const cas = {
      'jeton Firebase accepté par le vérificateur': { Authorization: 'Bearer bon', Origin: ORIGINE },
      'jeton au format JWT': { Authorization: `Bearer ${jwtFirebase}`, apikey: 'cle-publique' },
      'bonne clé X-Porte-Cle': { 'X-Porte-Cle': CLE_N8N },
      'clé ET jeton': { 'X-Porte-Cle': CLE_N8N, Authorization: 'Bearer bon', Origin: ORIGINE },
      'aucun en-tête': {},
    };
    for (const [nom, entetes] of Object.entries(cas)) {
      for (const [methode, url] of [['GET', '/auth/v1/user'], ['GET', '/auth/v1/user?select=*'], ['POST', '/auth/v1/user'], ['GET', '/auth/v1/user/'], ['GET', '/baseporte/auth/v1/user']]) {
        const res = reponse();
        await gestionnaire(requete(methode, url, { entetes }), res);
        assert.equal(res.statut, 401, `${nom} ${methode} ${url}`);
        assert.equal(res.json().code, 'non_authentifie', `${nom} ${methode} ${url}`);
      }
    }
    assert.equal(ouvertures, 0, 'aucune connexion à la base');
    assert.equal(base.journal.length, 0, 'aucune requête pg');
    assert.deepEqual(appels, { jeton: 0, cle: 0, compte: 0 }, 'ni jeton vérifié, ni clé lue, ni compte contrôlé');
  });
  test('1.7 ter /auth/v1/user sans configuration (porte pas branchée) : 503 « pas branchée », jamais 200, aucune requête pg', async () => {
    const p = porte({ config: async () => { throw new ConfigurationAbsente('secret introuvable'); } });
    for (const entetes of [N8N, NAV, {}]) {
      const r = await appeler(p, 'GET', '/auth/v1/user', { entetes });
      assert.equal(r.statut, 503);
      assert.equal(r.json().code, 'porte_non_branchee');
    }
    assert.equal(p.base.journal.length, 0);
  });
  test('1.8 secret BASE_PORTE absent ou mal formé → 503 « pas branchée », rien n\'est ouvert', async () => {
    const p = porte({ config: async () => { throw new ConfigurationAbsente('secret introuvable'); } });
    const r = await appeler(p, 'GET', '/rest/v1/factures', { entetes: NAV });
    assert.equal(r.statut, 503);
    assert.equal(r.json().code, 'porte_non_branchee');
    assert.equal(p.base.journal.length, 0);
  });
  test('1.9 « pas branchée » : 503 avec les en-têtes CORS du site, journalisé en WARNING une fois par période de 60 s au plus', async () => {
    let t = 1_800_000_000_000;
    const p = porte({ config: async () => { throw new ConfigurationAbsente('secret introuvable'); }, maintenant: () => t });
    const r = await appeler(p, 'GET', '/rest/v1/factures', { entetes: NAV });
    assert.equal(r.entetes['Access-Control-Allow-Origin'], ORIGINE);
    await appeler(p, 'GET', '/rest/v1/factures', { entetes: NAV });
    t += 59_000;
    await appeler(p, 'GET', '/rest/v1/factures', { entetes: NAV });
    assert.equal(p.evenements.length, 1);
    t += 2_000;
    await appeler(p, 'GET', '/rest/v1/factures', { entetes: NAV });
    assert.equal(p.evenements.length, 2);
    assert.equal(JSON.parse(ligneDeJournalPorte(p.evenements[0])).severity, 'WARNING');
    const autre = await appeler(p, 'GET', '/rest/v1/factures', { entetes: { ...NAV, Origin: 'https://pirate.example' } });
    assert.equal(autre.entetes['Access-Control-Allow-Origin'], undefined);
  });
});

describe('2 transaction', () => {
  test('2.1 begin → set local role → set_config(…, true) APRÈS begin → travail → commit ; connexion rendue', async () => {
    const base = fausseBase((sql) => (sql.startsWith('select "id"') ? { rows: [{ id: 'u1' }] } : { rows: [] }));
    const p = porte({ base });
    const r = await appeler(p, 'GET', '/rest/v1/factures?select=id&order=id.asc&limit=10', { entetes: NAV });
    assert.equal(r.statut, 200);
    assert.deepEqual(r.json(), [{ id: 'u1' }]);
    const s = base.sqls();
    assert.equal(s[0], 'begin read only');
    assert.equal(s[1], 'set local role porte');
    assert.match(s[2], /set_config\('app\.espace_id', \$1, true\), set_config\('app\.utilisateur', \$2, true\), set_config\('statement_timeout', \$3, true\), set_config\('idle_in_transaction_session_timeout', \$4, true\)/);
    assert.deepEqual(base.journal[2].valeurs.slice(2), ['10000', String(DELAI_TRANSACTION_INACTIVE_MS)]);
    assert.equal(s.at(-1), 'commit');
    assert.deepEqual(base.liberes, [false]);
  });
  test('2.2 n8n : rôle robot_reflets, utilisateur « n8n »', async () => {
    const base = fausseBase();
    await appeler(porte({ base }), 'GET', '/rest/v1/chantiers?select=id,nom', { entetes: N8N });
    assert.equal(base.sqls()[1], 'set local role robot_reflets');
    assert.deepEqual(base.journal[2].valeurs.slice(0, 2), [ESPACE, 'n8n']);
  });
  test('2.3 erreur pendant le travail → rollback, jamais commit', async () => {
    const base = fausseBase(() => { throw Object.assign(new Error('boom sur 10.0.0.1'), { code: 'XX000' }); });
    const r = await appeler(porte({ base }), 'GET', '/rest/v1/factures?select=id', { entetes: NAV });
    assert.equal(r.statut, 500);
    assert.ok(!r.corps.includes('10.0.0.1'));
    assert.ok(base.sqls().includes('rollback'));
    assert.ok(!base.sqls().includes('commit'));
  });
  test('2.3b le rollback lui-même échoue → la connexion est détruite (liberer(true)), jamais rendue au pool', async () => {
    const journal = [];
    const liberes = [];
    const base = { ouvrir: async () => ({
      async interroger(sql) {
        journal.push(sql);
        if (sql === 'rollback') throw new Error('connexion coupée');
        if (sql === SQL_CATALOGUE_RELATIONS) return { rows: RELATIONS };
        if (sql === SQL_CATALOGUE_FONCTIONS) return { rows: FONCTIONS };
        if (sql.startsWith('select "id"')) throw Object.assign(new Error('x'), { code: 'XX000' });
        return { rows: [] };
      },
      liberer(casse) { liberes.push(casse); },
    }) };
    const r = await appeler(porte({ base }), 'GET', '/rest/v1/factures?select=id', { entetes: NAV });
    assert.equal(r.statut, 500);
    assert.deepEqual(liberes, [true]);
  });
  test('2.4 base injoignable → 503 sans détail', async () => {
    const p = porte({ base: { ouvrir: async () => { throw new ErreurConnexionBase('08006'); } } });
    const r = await appeler(p, 'GET', '/rest/v1/factures', { entetes: NAV });
    assert.equal(r.statut, 503);
    assert.equal(r.json().code, 'base_injoignable');
  });
  test('2.5 Prefer: count=exact → Content-Range « 0-0/42 » ; objet unique (Accept PostgREST) ; 406 si 0 ou plusieurs lignes', async () => {
    const base = fausseBase((sql) => (sql.startsWith('select count') ? { rows: [{ total: 42 }] } : { rows: [{ id: 'u1' }] }));
    const r = await appeler(porte({ base }), 'GET', '/rest/v1/factures?select=id&limit=1', { entetes: { ...NAV, Prefer: 'count=exact' } });
    assert.equal(r.entetes['Content-Range'], '0-0/42');
    const o = await appeler(porte({ base }), 'GET', '/rest/v1/factures?select=id', { entetes: { ...N8N, Accept: 'application/vnd.pgrst.object+json' } });
    assert.deepEqual(o.json(), { id: 'u1' });
    const vide = await appeler(porte({ base: fausseBase(() => ({ rows: [] })) }), 'GET', '/rest/v1/factures?select=id', { entetes: { ...N8N, Accept: 'application/vnd.pgrst.object+json' } });
    assert.equal(vide.statut, 406);
  });
});

describe('3 ce que chaque voie peut faire', () => {
  test('3.1 navigateur qui POST ou PATCH une table → 403, la base n\'est jamais ouverte', async () => {
    for (const m of ['POST', 'PATCH']) {
      const p = porte();
      const r = await appeler(p, m, '/rest/v1/factures?id=eq.u1', { entetes: NAV, corps: { statut: 'acceptee' } });
      assert.equal(r.statut, 403, m);
      assert.equal(r.json().code, 'ecriture_refusee');
      assert.equal(p.base.journal.length, 0);
    }
  });
  test('3.1b navigateur : seulement les tables et vues lues par les écrans Achats ; favoris_os d\'un autre compte → 403 ; n8n inchangé', async () => {
    const p = porte();
    const r = await appeler(p, 'GET', '/rest/v1/favoris_os?select=utilisateur,cle', { entetes: NAV });
    assert.equal(r.statut, 403);
    assert.equal(r.json().code, 'lecture_refusee');
    assert.equal(p.base.journal.length, 0);
    assert.equal((await appeler(porte(), 'GET', '/rest/v1/chantiers?select=id,nom', { entetes: NAV })).statut, 200);
    assert.equal((await appeler(porte(), 'GET', '/rest/v1/favoris_os?select=cle', { entetes: N8N })).statut, 200);
    for (const interdit of ['tickets_n8n', 'tickets_n8n_demandes', 'journal_modifications', 'favoris', 'favoris_os']) assert.ok(!LECTURES_NAVIGATEUR.includes(interdit), interdit);
  });
  test('3.1c chaque table de la liste blanche est bien lue par un écran (nom écrit entre guillemets dans js/modules/achats… ou tableauachats)', async () => {
    const { readdirSync } = await import('node:fs');
    const racine = new URL('../js/modules/', import.meta.url);
    let texte = '';
    for (const d of readdirSync(racine).filter((n) => n.startsWith('achats') || n === 'tableauachats')) {
      for (const f of readdirSync(new URL(`${d}/`, racine)).filter((n) => n.endsWith('.js'))) texte += readFileSync(new URL(`${d}/${f}`, racine), 'utf8');
    }
    for (const nom of LECTURES_NAVIGATEUR) assert.match(texte, new RegExp(`['"]${nom}['"]|\\b${nom}:`), nom);
  });
  test('3.2 navigateur : seulement les 3 fonctions de la liste ; toute autre → 403', async () => {
    assert.deepEqual([...RPC_NAVIGATEUR].sort(), ['basculer_favori_os', 'demander_ticket_n8n', 'lister_favoris_os']);
    const p = porte();
    const r = await appeler(p, 'POST', '/rest/v1/rpc/rouvrir_facture', { entetes: NAV, corps: { p_id: 'u1' } });
    assert.equal(r.statut, 403);
    assert.equal(p.base.journal.length, 0);
    const base = fausseBase((sql) => (sql.includes('demander_ticket_n8n') ? { rows: [{ valeur: 'ticket-1' }] } : { rows: [] }));
    const t = await appeler(porte({ base }), 'POST', '/rest/v1/rpc/demander_ticket_n8n', { entetes: NAV, corps: { p_usage: 'validation' } });
    assert.equal(t.statut, 200);
    assert.equal(t.json(), 'ticket-1'); // valeur seule, comme PostgREST (js/os/supabase.js l'accepte)
  });
  test('3.3 n8n : fonctions métier permises, fonctions d\'installation (poser_socle, poser_reflet) refusées', async () => {
    const base = fausseBase(() => ({ rows: [{ valeur: true }] }));
    assert.equal((await appeler(porte({ base }), 'POST', '/rest/v1/rpc/rouvrir_facture', { entetes: N8N, corps: { p_id: 'u1' } })).statut, 200);
    assert.equal((await appeler(porte(), 'POST', '/rest/v1/rpc/poser_socle', { entetes: N8N, corps: {} })).statut, 403);
    assert.equal((await appeler(porte(), 'POST', '/rest/v1/rpc/poser_reflet', { entetes: N8N, corps: {} })).statut, 403);
  });
  test('3.4 méthodes inconnues (DELETE, PUT) → 405 ; route inconnue → 404', async () => {
    assert.equal((await appeler(porte(), 'DELETE', '/rest/v1/factures?id=eq.1', { entetes: N8N })).statut, 405);
    assert.equal((await appeler(porte(), 'GET', '/rest/v1/rpc/lister_favoris_os', { entetes: N8N })).statut, 405);
    assert.equal((await appeler(porte(), 'GET', '/admin', { entetes: N8N })).statut, 404);
  });
  test('3.5 P0001 (refus métier) → 400 avec details, forme PostgREST lue par n8n et actions-metier', async () => {
    const base = fausseBase(() => { throw Object.assign(new Error('Facture déjà décidée'), { code: 'P0001', detail: 'facture_deja_decidee' }); });
    const r = await appeler(porte({ base }), 'POST', '/rest/v1/rpc/rouvrir_facture', { entetes: N8N, corps: { p_id: 'u1' } });
    assert.equal(r.statut, 400);
    assert.deepEqual(r.json(), { code: 'P0001', message: 'Facture déjà décidée', details: 'facture_deja_decidee', hint: null });
  });
});

describe('4 écritures de n8n', () => {
  test('4.1 POST de plusieurs lignes : chaque ligne dans un SAVEPOINT ; doublon (23505) ignoré avec resolution=ignore-duplicates', async () => {
    let n = 0;
    const base = fausseBase((sql) => {
      if (!sql.startsWith('insert')) return { rows: [] };
      n += 1;
      if (n === 2) throw Object.assign(new Error('duplicate'), { code: '23505' });
      return { rows: [{ id: `u${n}` }] };
    });
    const r = await appeler(porte({ base }), 'POST', '/rest/v1/factures?on_conflict=email_message_id&select=id', {
      entetes: { ...N8N, Prefer: 'resolution=ignore-duplicates,return=representation' },
      corps: [{ numero: 'A', email_message_id: 'm1' }, { numero: 'B', email_message_id: 'm1' }, { numero: 'C', email_message_id: 'm3' }],
    });
    assert.equal(r.statut, 201);
    assert.deepEqual(r.json(), [{ id: 'u1' }, { id: 'u3' }]);
    const s = base.sqls();
    assert.equal(s.filter((x) => x === 'savepoint porte_ligne').length, 3);
    assert.equal(s.filter((x) => x === 'rollback to savepoint porte_ligne').length, 1);
    assert.ok(s.includes('commit'));
    assert.ok(!s.some((x) => /on conflict/i.test(x)), 'jamais de ON CONFLICT (impossible sur la vue factures)');
  });
  test('4.2 doublon SANS ignore-duplicates → 409 et rollback de tout l\'envoi', async () => {
    const base = fausseBase((sql) => { if (sql.startsWith('insert')) throw Object.assign(new Error('dup'), { code: '23505' }); return { rows: [] }; });
    const r = await appeler(porte({ base }), 'POST', '/rest/v1/factures', { entetes: N8N, corps: { numero: 'A' } });
    assert.equal(r.statut, 409);
    assert.ok(base.sqls().includes('rollback'));
  });
  test('4.3 return=minimal → 201 sans corps ; PATCH avec filtres → update … where ; PATCH sans filtre → 400', async () => {
    const base = fausseBase(() => ({ rows: [{ id: 'u1' }] }));
    const r = await appeler(porte({ base }), 'POST', '/rest/v1/factures', { entetes: { ...N8N, Prefer: 'return=minimal' }, corps: { numero: 'A' } });
    assert.equal(r.statut, 201);
    assert.equal(r.corps, undefined);
    const base2 = fausseBase(() => ({ rows: [{ id: 'u1' }] }));
    const m = await appeler(porte({ base: base2 }), 'PATCH', '/rest/v1/factures?id=eq.u1&statut=eq.a_valider&select=id', { entetes: { ...N8N, Prefer: 'return=representation' }, corps: { numero: 'B' } });
    assert.equal(m.statut, 200);
    assert.ok(base2.sqls().some((x) => x === 'update public."factures" set "numero" = $1 where "id" = $2 and "statut" = $3 returning "id"'));
    assert.equal((await appeler(porte(), 'PATCH', '/rest/v1/factures', { entetes: N8N, corps: { numero: 'B' } })).statut, 400);
  });
  test('4.4 colonne inconnue dans le corps → 400, rien n\'est écrit', async () => {
    const base = fausseBase();
    const r = await appeler(porte({ base }), 'POST', '/rest/v1/factures', { entetes: N8N, corps: { numero: 'A', 'numero") values (1); drop table x; --': 1 } });
    assert.equal(r.statut, 400);
    assert.ok(!base.sqls().some((x) => x.startsWith('insert')));
  });
});

describe('5 stockage et liens temporaires', () => {
  const T = 1_800_000_000; // secondes
  test('5.1 navigateur : lien RELATIF (même origine) valable 10 min au plus ; jeton signé pour CE chemin', async () => {
    const p = porte({ maintenant: () => T * 1000 });
    const r = await appeler(p, 'POST', '/storage/v1/object/sign/factures/2026/F%201.pdf', { entetes: NAV, corps: { expiresIn: 99999 } });
    assert.equal(r.statut, 200);
    const { signedURL } = r.json();
    assert.match(signedURL, /^\/storage\/v1\/object\/sign\/factures\/2026\/F%201\.pdf\?token=\d{10}\.[A-Za-z0-9_-]{43}$/);
    const jeton = new URL(signedURL, 'https://x').searchParams.get('token');
    assert.equal(Number(jeton.split('.')[0]), T + 600);
    assert.equal(jetonLienValide(CONFIG.cle_liens, 'factures/2026/F 1.pdf', jeton, T), true);
    assert.equal(jetonLienValide(CONFIG.cle_liens, 'factures/2026/AUTRE.pdf', jeton, T), false);
  });
  test('5.2 lien signé : la clé n8n ne peut PAS en demander (navigateur seulement) ; dossier inconnu → 404', async () => {
    assert.equal((await appeler(porte(), 'POST', '/storage/v1/object/sign/factures/a.pdf', { entetes: N8N, corps: {} })).statut, 403);
    assert.equal((await appeler(porte(), 'POST', '/storage/v1/object/sign/autre/a.pdf', { entetes: NAV, corps: {} })).statut, 404);
    assert.equal((await appeler(porte(), 'POST', '/storage/v1/object/sign/factures/a.pdf', {})).statut, 401);
  });
  test('5.3 n8n dépose un PDF (x-upsert) ; le navigateur ne peut pas déposer ; le lien rend le fichier', async () => {
    const p = porte({ maintenant: () => T * 1000 });
    const pdf = Buffer.from('%PDF-1.4 essai');
    assert.equal((await appeler(p, 'POST', '/storage/v1/object/factures/2026/a.pdf', { entetes: { ...NAV, 'Content-Type': 'application/pdf' }, brut: pdf })).statut, 403);
    const d = await appeler(p, 'POST', '/storage/v1/object/factures/2026/a.pdf', { entetes: { ...N8N, 'Content-Type': 'application/pdf', 'x-upsert': 'true' }, brut: pdf });
    assert.equal(d.statut, 200);
    assert.deepEqual(d.json(), { Key: 'factures/2026/a.pdf' });
    assert.ok(p.fichiers.has('reserve-essai/factures/2026/a.pdf'));
    const jeton = jetonLien(CONFIG.cle_liens, 'factures/2026/a.pdf', T + 300);
    const l = await appeler(p, 'GET', `/storage/v1/object/sign/factures/2026/a.pdf?token=${jeton}`, { entetes: { Origin: ORIGINE } });
    assert.equal(l.statut, 200);
    assert.equal(l.entetes['Content-Type'], 'application/pdf');
    assert.equal(l.entetes['Access-Control-Allow-Origin'], ORIGINE);
    assert.deepEqual(l.corps, pdf);
  });
  test('5.4 lien expiré, falsifié, trop lointain ou pour un autre fichier → refusé, le stockage n\'est pas lu', async () => {
    let lu = 0;
    const p = porte({ maintenant: () => T * 1000, stockage: { ecrire: async () => {}, lire: async () => { lu += 1; return { contenu: Buffer.from('x'), contentType: 'application/pdf' }; } } });
    const essais = [
      jetonLien(CONFIG.cle_liens, 'factures/a.pdf', T - 1), // expiré
      jetonLien('z'.repeat(48), 'factures/a.pdf', T + 100), // autre clé (falsifié)
      jetonLien(CONFIG.cle_liens, 'factures/a.pdf', T + 100_000), // trop lointain
      jetonLien(CONFIG.cle_liens, 'factures/b.pdf', T + 100), // autre fichier
      'abc', '',
    ];
    for (const j of essais) assert.equal((await appeler(p, 'GET', `/storage/v1/object/sign/factures/a.pdf?token=${j}`)).statut, 400, j);
    assert.equal(lu, 0);
  });
  test('5.5 dépôt : fichier vide, type refusé (HTML), chemin qui sort du dossier → refusés', async () => {
    assert.equal((await appeler(porte(), 'POST', '/storage/v1/object/factures/a.pdf', { entetes: { ...N8N, 'Content-Type': 'application/pdf' }, brut: Buffer.alloc(0) })).statut, 400);
    assert.equal((await appeler(porte(), 'POST', '/storage/v1/object/factures/a.html', { entetes: { ...N8N, 'Content-Type': 'text/html' }, brut: Buffer.from('<script>') })).statut, 415);
    // « .. » est résolu par l'analyse de l'adresse (on sort du dossier factures : 404) ; une barre oblique encodée est refusée (400)
    assert.equal((await appeler(porte(), 'POST', '/storage/v1/object/factures/../secret', { entetes: { ...N8N, 'Content-Type': 'application/pdf' }, brut: Buffer.from('x') })).statut, 404);
    assert.equal((await appeler(porte(), 'POST', '/storage/v1/object/factures/a%2F..%2F..%2Fsecret', { entetes: { ...N8N, 'Content-Type': 'application/pdf' }, brut: Buffer.from('x') })).statut, 400);
  });
});

describe('6 CORS', () => {
  test('6.1 pré-vol : origine de la configuration seulement ; jamais « * » ; x-porte-cle jamais permis au navigateur', async () => {
    const ok = await appeler(porte(), 'OPTIONS', '/rest/v1/factures', { entetes: { Origin: ORIGINE } });
    assert.equal(ok.statut, 204);
    assert.equal(ok.entetes['Access-Control-Allow-Origin'], ORIGINE);
    assert.ok(!/x-porte-cle/i.test(ok.entetes['Access-Control-Allow-Headers']));
    const non = await appeler(porte(), 'OPTIONS', '/rest/v1/factures', { entetes: { Origin: 'https://pirate.example' } });
    assert.equal(non.statut, 403);
    assert.equal(non.entetes['Access-Control-Allow-Origin'], undefined);
    const r = await appeler(porte(), 'GET', '/rest/v1/factures?select=id', { entetes: { ...NAV, Origin: 'https://pirate.example' } });
    assert.equal(r.entetes['Access-Control-Allow-Origin'], undefined);
  });
});

describe('7 configuration, journal, connecteur', () => {
  test('7.1 configuration : champs obligatoires, espace et instance bien formés, clé des liens longue, origines https', () => {
    const base = { instance: 'projet-essai:europe-west9:base', base: 'achats', utilisateur: 'porte_fn', mot_de_passe: 'm', espace: ESPACE, bucket: 'reserve-essai', cle_liens: 'k'.repeat(32), origines: [ORIGINE] };
    assert.equal(validerConfiguration(JSON.stringify(base)).espace, ESPACE);
    for (const mauvais of [{ espace: 'A B' }, { instance: 'x' }, { cle_liens: 'court' }, { origines: ['http://site'] }, { origines: ['https://site/chemin'] }, { mot_de_passe: '' }, { base: 'achats; drop' }]) {
      assert.throws(() => validerConfiguration(JSON.stringify({ ...base, ...mauvais })), ConfigurationAbsente, JSON.stringify(mauvais));
    }
    assert.throws(() => validerConfiguration('pas du json'), ConfigurationAbsente);
  });
  test('7.2 lecteurs de secrets : noms BASE_PORTE et BASE_PORTE_N8N ; succès ET échec gardés 60 s (cache négatif), relus ensuite', async () => {
    const lus = [];
    let fois = 0;
    let t = 0;
    const lire = creerLecteurConfiguration({ lireSecret: async (n) => { lus.push(n); fois += 1; if (fois === 1) throw new Error('absent'); return JSON.stringify({ instance: 'projet-essai:europe-west9:base', base: 'achats', utilisateur: 'porte_fn', mot_de_passe: 'm', espace: ESPACE, bucket: 'reserve-essai', cle_liens: 'k'.repeat(32) }); }, maintenant: () => t });
    await assert.rejects(lire(), ConfigurationAbsente);
    await assert.rejects(lire(), ConfigurationAbsente); // échec gardé : Secret Manager n'est pas relu
    assert.equal(lus.length, 1);
    t = 60_001;
    assert.equal((await lire()).espace, ESPACE);
    await lire();
    assert.deepEqual(lus, [NOM_SECRET_PORTE, NOM_SECRET_PORTE]);
    let lectures = 0;
    let tc = 0;
    const cle = creerLecteurCleN8n({ lireSecret: async (n) => { assert.equal(n, NOM_SECRET_N8N); lectures += 1; if (lectures === 1) throw new Error('absent'); return lectures === 2 ? 'court' : CLE_N8N; }, maintenant: () => tc });
    await assert.rejects(cle());
    await assert.rejects(cle());
    assert.equal(lectures, 1);
    tc = 60_001;
    await assert.rejects(cle()); // trop courte
    tc = 120_002;
    assert.equal(await cle(), CLE_N8N);
  });
  test('7.3 journal : ni e-mail, ni clé, ni valeur ; un refus est journalisé', async () => {
    const p = porte();
    await appeler(p, 'GET', '/rest/v1/factures', { entetes: { 'X-Porte-Cle': 'mauvaise' } });
    await appeler(p, 'GET', '/rest/v1/factures', { entetes: { Authorization: 'Bearer inconnu' } });
    const lignes = p.evenements.map(ligneDeJournalPorte).join('\n');
    assert.match(lignes, /basePorte - table 401/);
    assert.ok(!/exemple\.fr|mauvaise|nnnn/.test(lignes), lignes);
  });
  test('7.4 connecteur Cloud SQL : options du connecteur (IP publique), pool de 3, un échec n\'est pas gardé, changement de mot de passe = nouveau pool', async () => {
    const pools = [];
    let echec = true;
    class FauxConnecteur { async getOptions(o) { if (echec) { echec = false; throw new Error('refus'); } return { stream: () => null, instance: o.instanceConnectionName, ipType: o.ipType }; } close() {} }
    class FauxPool {
      constructor(o) { this.o = o; pools.push(this); }
      on() {}
      async connect() { return { query: async (sql, v) => ({ rows: [{ sql, v }] }), release: (casse) => { this.casse = casse; } }; }
      async end() { this.fini = true; }
    }
    const ouvrir = creerOuvreurCloudSql({ pg: async () => ({ Pool: FauxPool, types: { getTypeParser: () => (x) => x } }), connecteur: async () => FauxConnecteur });
    await assert.rejects(ouvrir(CONFIG), ErreurConnexionBase);
    const cx = await ouvrir(CONFIG);
    assert.equal(pools.length, 1);
    assert.equal(pools[0].o.max, 3);
    assert.equal(pools[0].o.ipType, 'PUBLIC');
    assert.equal(pools[0].o.instance, CONFIG.instance);
    assert.equal(pools[0].o.database, 'achats');
    assert.deepEqual((await cx.interroger('select 1', [])).rows[0].sql, 'select 1');
    cx.liberer(true);
    assert.equal(pools[0].casse, true);
    await ouvrir(CONFIG);
    assert.equal(pools.length, 1, 'même configuration : même pool');
    await ouvrir({ ...CONFIG, mot_de_passe: 'nouveau' });
    assert.equal(pools.length, 2);
  });
});

describe('8 branchement', () => {
  const index = readFileSync(new URL('../functions/src/index.js', import.meta.url), 'utf8');
  const code = index.replace(/\/\/.*$/gm, '');
  test('8.1 basePorte : Paris, 3 instances, invocation publique, compte porte-serveur ; aucun secret lié au déploiement (defineSecret)', () => {
    const bloc = code.slice(code.indexOf('export const basePorte = onRequest'));
    assert.match(bloc, /region: 'europe-west9'/);
    assert.match(bloc, /maxInstances: 3/);
    assert.match(bloc, /invoker: 'public'/);
    assert.match(bloc, /serviceAccount: compteDeService\('porte-serveur'\)/);
    assert.match(bloc, /verifyIdToken\(jeton, true\)/);
    assert.ok(!/defineSecret\([^)]*BASE_PORTE/.test(code));
    assert.ok(!/BASE_PORTE/.test(code), 'le nom des secrets ne vit que dans base/porte-base.js');
  });
  test('8.2 seul base/cloudsql.js charge le connecteur Cloud SQL, à la demande ; dépendance exacte', () => {
    const c = readFileSync(new URL('../functions/src/base/cloudsql.js', import.meta.url), 'utf8');
    assert.match(c, /await import\('@google-cloud\/cloud-sql-connector'\)/);
    assert.match(c, /await import\('pg'\)/);
    const pkg = JSON.parse(readFileSync(new URL('../functions/package.json', import.meta.url), 'utf8'));
    assert.match(pkg.dependencies['@google-cloud/cloud-sql-connector'], /^\d+\.\d+\.\d+$/);
    for (const f of ['porte-base.js', 'porte-requetes.js']) {
      const t = readFileSync(new URL(`../functions/src/base/${f}`, import.meta.url), 'utf8');
      assert.ok(!/cloud-sql-connector|['"]pg['"]/.test(t.replace(/\/\/.*$/gm, '')), f);
    }
  });
});
