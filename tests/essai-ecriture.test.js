// Le script de recette outils/essai-ecriture.mjs, rejoué contre une copie locale du serveur (données fictives en mémoire) : il doit réussir, ne laisser
// aucune trace dans les fiches, ne jamais afficher le jeton, et refuser de s'exécuter avec un mauvais jeton ou sur une organisation existante.
import { test, describe, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { creerGestionnaire } from '../functions/src/mcp/gestionnaire.js';
import { empreinte, creerMagasin } from '../functions/src/securite/jetons.js';
import { creerLimiteur } from '../functions/src/securite/limites.js';
import { creerAccesMemoire } from '../functions/src/coeur/donnees.js';
import { collections as base, MAINTENANT } from './_donnees-essai.js';

const SCRIPT = fileURLToPath(new URL('../outils/essai-ecriture.mjs', import.meta.url));
const JETONS = { biblio: `cia_${'H'.repeat(43)}`, code: `cia_${'C'.repeat(43)}` };
const arrets = [];
afterEach(async () => { while (arrets.length) await arrets.pop()(); });

async function demarrer(extra = (c) => c) {
  const collections = extra(structuredClone(base));
  const donnees = creerAccesMemoire(collections);
  const secret = JSON.stringify([
    { jeton: 'hermes-bibliothecaire', acteur: 'hermes-bibliothecaire', profil: 'bibliothecaire', empreinte: empreinte(JETONS.biblio), actif: true },
    { jeton: 'claude-code-jerome', acteur: 'claude-code-jerome', profil: 'claude-code', empreinte: empreinte(JETONS.code), actif: true },
  ]);
  const gestionnaire = creerGestionnaire({ magasin: creerMagasin({ lire: async () => secret, dureeCacheMs: 0 }), donnees, limiteur: creerLimiteur({ donnees }), maintenant: () => MAINTENANT.getTime(), journal: () => {} });
  const serveur = createServer((req, res) => {
    const m = [];
    req.on('data', (x) => m.push(x));
    req.on('end', () => { try { req.body = JSON.parse(Buffer.concat(m).toString('utf8')); } catch { req.body = undefined; } gestionnaire(req, res); });
  });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  arrets.push(() => new Promise((ok) => serveur.close(ok)));
  const url = `http://127.0.0.1:${serveur.address().port}/mcp`;
  const lancer = (jeton) => new Promise((ok) => {
    const env = { PATH: process.env.PATH, CHEVALIER_MCP_URL: url, ...(jeton ? { CHEVALIER_MCP_TOKEN: jeton } : {}) };
    execFile(process.execPath, [SCRIPT], { env }, (erreur, stdout, stderr) => ok({ code: erreur ? erreur.code : 0, stdout, stderr }));
  });
  const vue = () => Object.fromEntries(Object.entries(collections).filter(([k]) => !['crm_audit', 'crm_audit_avant', 'mcp_limites'].includes(k)).map(([k, v]) => [k, structuredClone(v).sort((a, b) => a.id.localeCompare(b.id))]));
  return { collections, lancer, vue };
}

describe('Script de recette de l’étape 4', () => {
  test('avec le jeton Claude Code : toutes les vérifications passent, les fiches reviennent à leur état de départ, le jeton n’est jamais affiché', async () => {
    const s = await demarrer();
    const avant = s.vue();
    const r = await s.lancer(JETONS.code);
    assert.equal(r.code, 0, r.stdout + r.stderr);
    assert.match(r.stdout, /ESSAI RÉUSSI/);
    assert.doesNotMatch(r.stdout, /✗/);
    assert.equal((r.stdout.match(/✓/g) || []).length >= 14, true);
    assert.equal((r.stdout + r.stderr).includes(JETONS.code), false);
    assert.deepEqual(s.vue(), avant, 'aucune fiche ne reste après le nettoyage');
    assert.ok(s.collections.crm_audit.length > 3 && s.collections.crm_audit_avant.length > 0, 'le journal et les copies existent');
  });

  test('avec le jeton bibliothécaire : arrêt net dès la première étape (il faut le jeton Claude Code), rien n’est écrit', async () => {
    const s = await demarrer();
    const avant = s.vue();
    const lignes = s.collections.crm_audit.length;
    const r = await s.lancer(JETONS.biblio);
    assert.equal(r.code, 1);
    assert.match(r.stdout, /il faut le jeton Claude Code/);
    assert.deepEqual(s.vue(), avant);
    assert.equal(s.collections.crm_audit.length, lignes);
  });

  test('sans jeton, ou avec un jeton faux : message clair, code 1, rien d’écrit', async () => {
    const s = await demarrer();
    const sans = await s.lancer(undefined);
    assert.equal(sans.code, 1);
    assert.match(sans.stderr, /CHEVALIER_MCP_TOKEN absente/);
    const faux = await s.lancer(`cia_${'Z'.repeat(43)}`);
    assert.equal(faux.code, 1);
    assert.match(faux.stdout, /jeton refusé \(401\)/);
    assert.equal(s.collections.crm_audit.length, 3);
  });

  test('une organisation « ZZ Essai MCP » déjà présente n’est jamais touchée : le script s’arrête avant toute écriture', async () => {
    const s = await demarrer((c) => { c.crm_organisations.push({ id: 'zz', nom: 'ZZ Essai MCP', archive: false }); return c; });
    const avant = s.vue();
    const r = await s.lancer(JETONS.code);
    assert.equal(r.code, 1);
    assert.match(r.stdout, /existe déjà \(id zz\)/);
    assert.deepEqual(s.vue(), avant);
  });
});
