// Clés de la porte (scripts/porte/cles.js) : format, empreinte, vérification, durée de vie, cas d'attaque. Sans réseau ni Firebase.
import assert from 'node:assert/strict';
import { test, describe } from 'node:test';
import { randomBytes } from 'node:crypto';
import {
  PREFIXE, TABLE_CLES, MAX_CLES_ACTIVES, genererCle, analyserCle, extraireBearer, empreinte, enregistrementDe, verifierCle,
  doitNoterUsage, enService, peutCreer, resumeCle, DELAI_EN_SERVICE_MS, DELAI_NOTE_USAGE_MS,
} from '../scripts/porte/cles.js';

const OCTETS = Buffer.alloc(32, 7);
const base = (id, d) => new Map([[id, d]]);
const lecteur = (m) => async (e) => m.get(e) ?? null;

describe('porte : format des clés', () => {
  test('cle-n8n.<propriétaire>.<43 caractères>, et le nom de la table suit la règle de nommage', () => {
    const c = genererCle('audrey', OCTETS);
    assert.match(c, /^cle-n8n\.audrey\.[A-Za-z0-9_-]{43}$/);
    assert.equal(PREFIXE, 'cle-n8n');
    assert.equal(TABLE_CLES, 'plateforme_cles');
    assert.deepEqual(analyserCle(c), { proprietaire: 'audrey' });
  });
  test('des clés aléatoires ne se répètent pas', () => {
    const vues = new Set();
    for (let i = 0; i < 2000; i++) vues.add(genererCle('audrey'));
    assert.equal(vues.size, 2000);
  });
  test('un identifiant de client avec tirets et tirets bas fonctionne (le point sépare sans ambiguïté)', () => {
    const c = genererCle('cabinet-martin_2', OCTETS);
    assert.deepEqual(analyserCle(c), { proprietaire: 'cabinet-martin_2' });
  });
  test('propriétaire invalide refusé à la fabrication', () => {
    for (const p of ['', 'Audrey', 'a.b', 'a b', '-x', 'é', 'x'.repeat(41), null, undefined]) assert.throws(() => genererCle(p, OCTETS), /invalide/, String(p));
    assert.throws(() => genererCle('audrey', Buffer.alloc(31)), /32 octets/);
  });
  test('l\'analyse est stricte : rien ne passe « à peu près »', () => {
    const bonne = genererCle('audrey', OCTETS);
    const secret = bonne.split('.')[2];
    const refuses = [
      '', null, undefined, 42, `${bonne} `, ` ${bonne}`, `${bonne}\n`, bonne.toUpperCase(), bonne.slice(0, -1), `${bonne}x`,
      `cle-n8n.Audrey.${secret}`, `cle-n8n..${secret}`, `cle-n8n.audrey.${secret}.autre`, `cle_n8n.audrey.${secret}`, `cia_${secret}`,
      `cle-n8n.audrey.${secret.slice(0, 42)}!`, `cle-n8n.${'a'.repeat(41)}.${secret}`, 'Bearer ' + bonne,
    ];
    for (const r of refuses) assert.equal(analyserCle(r), null, JSON.stringify(r));
  });
  test('en-tête Authorization : seulement « Bearer <un seul mot> »', () => {
    assert.equal(extraireBearer('Bearer abc'), 'abc');
    assert.equal(extraireBearer(' Bearer abc '), 'abc'); // espaces autour de l'en-tête : ignorés
    assert.equal(extraireBearer('Bearer  abc'), null); // deux espaces au milieu : refusé (strict, comme le serveur MCP)
    assert.equal(extraireBearer('Bearer a b'), null);
    assert.equal(extraireBearer('Basic abc'), null);
    assert.equal(extraireBearer(undefined), null);
  });
});

describe('porte : enregistrement (la clé n\'est jamais gardée)', () => {
  test('le document ne contient que l\'empreinte et des informations sans danger', () => {
    const c = genererCle('audrey', OCTETS);
    const e = enregistrementDe(c, 'audrey', new Date('2026-10-14T10:00:00Z'));
    assert.equal(e.id, empreinte(c));
    assert.match(e.id, /^[0-9a-f]{64}$/);
    assert.deepEqual(Object.keys(e.donnees).sort(), ['actif', 'creeLe', 'dernierUsage', 'idCourt', 'proprietaire', 'revoqueLe']);
    assert.equal(e.donnees.idCourt, e.id.slice(0, 8));
    const secret = c.split('.')[2];
    assert.ok(!JSON.stringify(e).includes(secret), 'la partie aléatoire ne doit apparaître nulle part');
    assert.ok(!JSON.stringify(e).includes(secret.slice(0, 12)));
  });
});

describe('porte : vérification d\'une clé présentée', () => {
  const c = genererCle('audrey', OCTETS);
  const e = enregistrementDe(c, 'audrey');
  test('clé valide : acceptée, avec son propriétaire et son identifiant court', async () => {
    const r = await verifierCle(c, lecteur(base(e.id, e.donnees)));
    assert.deepEqual(r, { ok: true, proprietaire: 'audrey', idCourt: e.donnees.idCourt, empreinte: e.id, dernierUsage: null });
  });
  test('clé inconnue, mal formée ou révoquée : refusée, pour des raisons différentes dans le journal seulement', async () => {
    assert.deepEqual(await verifierCle(c, lecteur(new Map())), { ok: false, raison: 'inconnue' });
    assert.deepEqual(await verifierCle('n_importe_quoi', lecteur(base(e.id, e.donnees))), { ok: false, raison: 'format' });
    assert.deepEqual(await verifierCle(c, lecteur(base(e.id, { ...e.donnees, actif: false, revoqueLe: new Date() }))), { ok: false, raison: 'revoquee' });
  });
  test('le format est vérifié AVANT toute lecture dans la base (une entrée absurde ne coûte rien)', async () => {
    let lectures = 0;
    await verifierCle('x'.repeat(100000), async () => { lectures++; return null; });
    await verifierCle(undefined, async () => { lectures++; return null; });
    assert.equal(lectures, 0);
  });
  test('étiquette changée : « cle-n8n.martin.<secret d\'Audrey> » n\'ouvre rien (l\'empreinte ne correspond à aucun document)', async () => {
    const secret = c.split('.')[2];
    const truquee = `cle-n8n.martin.${secret}`;
    assert.deepEqual(await verifierCle(truquee, lecteur(base(e.id, e.donnees))), { ok: false, raison: 'inconnue' });
  });
  test('document incohérent (propriétaire enregistré ≠ étiquette de la clé) : refusé', async () => {
    const r = await verifierCle(c, lecteur(base(e.id, { ...e.donnees, proprietaire: 'martin' })));
    assert.deepEqual(r, { ok: false, raison: 'proprietaire_different' });
  });
  test('un document sans « actif: true » explicite est refusé (jamais « actif par défaut »)', async () => {
    for (const actif of [undefined, null, 'true', 1, 'oui']) assert.equal((await verifierCle(c, lecteur(base(e.id, { ...e.donnees, actif })))).ok, false, String(actif));
  });
  test('deux clés du même propriétaire sont valables en même temps (changement de clé sans coupure)', async () => {
    const c2 = genererCle('audrey');
    const e2 = enregistrementDe(c2, 'audrey');
    const m = new Map([[e.id, e.donnees], [e2.id, e2.donnees]]);
    assert.equal((await verifierCle(c, lecteur(m))).ok, true);
    assert.equal((await verifierCle(c2, lecteur(m))).ok, true);
    m.set(e.id, { ...e.donnees, actif: false }); // l'ancienne est révoquée : seule la nouvelle marche
    assert.equal((await verifierCle(c, lecteur(m))).ok, false);
    assert.equal((await verifierCle(c2, lecteur(m))).ok, true);
  });
});

describe('porte : durée de vie, révocation, plafond', () => {
  const t0 = Date.parse('2026-10-14T10:00:00Z');
  test('le dernier usage n\'est réécrit qu\'après 5 minutes (ou s\'il est absent)', () => {
    assert.equal(doitNoterUsage({ dernierUsage: null }, t0), true);
    assert.equal(doitNoterUsage({}, t0), true);
    assert.equal(doitNoterUsage({ dernierUsage: new Date(t0 - DELAI_NOTE_USAGE_MS + 1000) }, t0), false);
    assert.equal(doitNoterUsage({ dernierUsage: new Date(t0 - DELAI_NOTE_USAGE_MS) }, t0), true);
  });
  test('« en service » : active et utilisée dans les dernières 24 h ; la révoquer demande une confirmation', () => {
    assert.equal(enService({ actif: true, dernierUsage: new Date(t0 - 3600_000) }, t0), true);
    assert.equal(enService({ actif: true, dernierUsage: new Date(t0 - DELAI_EN_SERVICE_MS - 1) }, t0), false);
    assert.equal(enService({ actif: true, dernierUsage: null }, t0), false);
    assert.equal(enService({ actif: false, dernierUsage: new Date(t0 - 1000) }, t0), false);
  });
  test(`au plus ${MAX_CLES_ACTIVES} clés actives par propriétaire (les révoquées ne comptent pas)`, () => {
    const a = { actif: true }; const r = { actif: false };
    assert.deepEqual(peutCreer([a, a]), { ok: true, actives: 2 });
    assert.deepEqual(peutCreer([a, a, a, r, r]), { ok: false, actives: 3 });
    assert.deepEqual(peutCreer([]), { ok: true, actives: 0 });
  });
  test('résumé lisible : identifiant court, état, dernier usage, « EN SERVICE »', () => {
    const l = resumeCle({ idCourt: 'ab12cd34', actif: true, dernierUsage: new Date(t0 - 2 * 3600_000) }, t0);
    assert.match(l, /^ab12cd34 +active +utilisée aujourd'hui +\(EN SERVICE\)$/);
    assert.match(resumeCle({ idCourt: 'ab12cd34', actif: false, dernierUsage: new Date(t0 - 3 * 86_400_000) }, t0), /révoquée +dernier usage il y a 3 jours$/);
    assert.match(resumeCle({ idCourt: 'ab12cd34', actif: true, dernierUsage: null }, t0), /jamais utilisée/);
  });
  test('la bibliothèque ne dépend que de node:crypto (aucune écriture, aucun réseau, aucun secret en dur)', async () => {
    const { readFileSync } = await import('node:fs');
    const src = readFileSync(new URL('../scripts/porte/cles.js', import.meta.url), 'utf8').replace(/^\s*\/\/.*$/gm, '');
    assert.deepEqual([...src.matchAll(/from '([^']+)'/g)].map((m) => m[1]), ['node:crypto']);
    assert.doesNotMatch(src, /fetch\(|process\.env|writeFile|console\./);
  });
  test('fuzz : aucune chaîne aléatoire n\'est jamais acceptée comme clé', () => {
    for (let i = 0; i < 2000; i++) assert.equal(analyserCle(randomBytes(1 + (i % 80)).toString(i % 2 ? 'base64url' : 'latin1')), null);
  });
});
