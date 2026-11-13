// M7 : une erreur d'outil dont le message est écrit par nous reste lisible ; une erreur interne (Firestore, réseau, bug) devient un message général,
// le détail va au journal d'erreur du serveur (sans argument reçu ni jeton). Vrai client MCP sur un serveur local, outils factices.
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { Client } from '../functions/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js';
import { StreamableHTTPClientTransport } from '../functions/node_modules/@modelcontextprotocol/sdk/dist/esm/client/streamableHttp.js';
import { creerGestionnaire, erreurLisible } from '../functions/src/mcp/gestionnaire.js';
import { ErreurMetier } from '../functions/src/coeur/metier.js';
import { ErreurLimite } from '../functions/src/securite/limites.js';
import { empreinte, creerMagasin } from '../functions/src/securite/jetons.js';
import { creerAccesMemoire } from '../functions/src/coeur/donnees.js';

const JETON = `cia_${'C'.repeat(43)}`;
const SECRET = JSON.stringify([{ jeton: 'essai', acteur: 'essai', profil: 'complet', empreinte: empreinte(JETON), actif: true }]);
const erreur = (nom, fabrique) => ({ nom, profils: ['complet'], description: `Essai ${nom}.`, async executer() { throw fabrique(); } });
const avecCode = (code) => Object.assign(new Error('Firestore : détail interne secret'), { code });
const OUTILS_ESSAI = [
  erreur('e_metier', () => new ErreurMetier('introuvable', 'Fiche introuvable.')),
  erreur('e_limite', () => new ErreurLimite('requetes_minute', 120, 5)),
  erreur('e_simple', () => new Error('Stockage : PDF vide.')),
  erreur('e_firestore', () => avecCode(14)),
  erreur('e_firestore_texte', () => avecCode('permission-denied')),
  erreur('e_reseau', () => Object.assign(new Error('connect ECONNRESET 10.0.0.1:443'), { code: 'ECONNRESET', syscall: 'connect' })),
  erreur('e_type', () => new TypeError("Cannot read properties of undefined (reading 'x')")),
  erreur('e_ecriture', () => Object.assign(new Error('Écriture refusée (opération xyz).'), { lisible: true })),
  erreur('e_texte', () => 'chaîne jetée'),
];

let serveur, base, sortie;
const ecritureOrigine = process.stderr.write.bind(process.stderr);
before(async () => {
  const magasin = creerMagasin({ lire: async () => SECRET, dureeCacheMs: 0 });
  const gestionnaire = creerGestionnaire({ magasin, donnees: creerAccesMemoire({}), outils: OUTILS_ESSAI, maintenant: () => Date.parse('2026-11-13T10:00:00Z'), journal: () => {} });
  serveur = createServer((req, res) => {
    const m = [];
    req.on('data', (x) => m.push(x));
    req.on('end', () => { try { req.body = JSON.parse(Buffer.concat(m).toString('utf8')); } catch { req.body = undefined; } gestionnaire(req, res); });
  });
  await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
  base = `http://127.0.0.1:${serveur.address().port}/mcp`;
});
after(() => { process.stderr.write = ecritureOrigine; serveur.close(); });

async function appeler(nom, args = {}) {
  sortie = [];
  process.stderr.write = (t) => { sortie.push(String(t).trim()); return true; };
  const c = new Client({ name: 'essai', version: '1.0.0' });
  await c.connect(new StreamableHTTPClientTransport(new URL(base), { requestInit: { headers: { Authorization: `Bearer ${JETON}` } } }));
  try { return await c.callTool({ name: nom, arguments: args }); } finally { process.stderr.write = ecritureOrigine; await c.close(); }
}
const texte = (r) => r.content[0].text;

describe('M7 erreurs d’outils', () => {
  test('M7-1 les messages écrits par nous restent lisibles (erreur métier, plafond, throw simple, erreur d’écriture marquée)', async () => {
    const attendus = { e_metier: /Fiche introuvable\./, e_limite: /Plafond atteint pour ce jeton/, e_simple: /^Stockage : PDF vide\.$/, e_ecriture: /Écriture refusée \(opération xyz\)\./ };
    for (const [nom, motif] of Object.entries(attendus)) {
      const r = await appeler(nom);
      assert.equal(r.isError, true, nom);
      assert.match(texte(r), motif, nom);
      assert.equal(sortie.length, 0, `${nom} : rien au journal d'erreur`);
    }
  });
  test('M7-2 Firestore, réseau, TypeError, valeur jetée : message général avec le nom de l’outil et l’heure, aucun détail', async () => {
    for (const nom of ['e_firestore', 'e_firestore_texte', 'e_reseau', 'e_type', 'e_texte']) {
      const r = await appeler(nom, { secret: 'argument-secret' });
      assert.equal(r.isError, true, nom);
      assert.match(texte(r), new RegExp(`^Erreur interne pendant « ${nom} » \\(2026-11-13T10:00:00\\.000Z\\)`), nom);
      assert.doesNotMatch(texte(r), /Firestore|ECONNRESET|10\.0\.0\.1|Cannot read|chaîne jetée/, nom);
    }
  });
  test('M7-3 le détail va au journal d’erreur : outil, nom, code, message coupé à 300 caractères ; jamais l’argument ni le jeton', async () => {
    await appeler('e_firestore', { secret: 'argument-secret' });
    assert.equal(sortie.length, 1);
    const l = JSON.parse(sortie[0]);
    assert.equal(l.outil, 'e_firestore');
    assert.equal(l.nom, 'Error');
    assert.equal(l.code, '14');
    assert.match(l.message, /détail interne secret/);
    assert.ok(!sortie[0].includes('argument-secret') && !sortie[0].includes(JETON));
    await appeler('e_type');
    assert.equal(JSON.parse(sortie[0]).nom, 'TypeError');
  });
  test('M7-4 erreurLisible : règle de tri', () => {
    assert.equal(erreurLisible(new ErreurMetier('x', 'm')), true);
    assert.equal(erreurLisible(new Error('simple')), true);
    assert.equal(erreurLisible(new TypeError('t')), false);
    assert.equal(erreurLisible(avecCode('unavailable')), false);
    assert.equal(erreurLisible('texte'), false);
    assert.equal(erreurLisible(null), false);
  });
});
