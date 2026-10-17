// Ports décalés par session (ports.js), lanceur, et appli inchangée en production (A6 : js/os/firebase.js).
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import net from 'node:net';
import { readFileSync, existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { BASES, RANGS, decalage, ports, portOccupe, portsPris } from './ports.js';

const RACINE = fileURLToPath(new URL('../', import.meta.url));
const lire = (f) => readFileSync(`${RACINE}${f}`, 'utf8');

describe('Ports des tests (TESTS_DECALAGE)', () => {
  test('sans variable : les ports d\'avant pour la série e2e (rang 0)', () => {
    const p = ports(0, {});
    assert.equal(p.auth, 9099);
    assert.equal(p.firestore, 8080);
    assert.equal(p.serveur, 5050);
    assert.equal(p.storage, 9199);
    assert.equal(p.hub, 4400);
    assert.equal(p.logging, 4500);
  });
  test('TESTS_DECALAGE=1 décale tout de 1000 ; chaque série a son rang ; aucun port n\'est partagé', () => {
    const env = { TESTS_DECALAGE: '1' };
    assert.equal(ports(0, env).firestore, 9080);
    const tous = new Set();
    for (const d of [0, 1, 2, 40]) for (const rang of Object.values(RANGS)) for (const [nom, port] of Object.entries(ports(rang, { TESTS_DECALAGE: String(d) }))) {
      const cle = `${port}`;
      assert.ok(!tous.has(cle), `port ${port} (${nom}) utilisé deux fois`);
      tous.add(cle);
    }
    assert.equal(tous.size, 4 * Object.keys(RANGS).length * Object.keys(BASES).length);
  });
  test('un décalage invalide est refusé avec un message clair', () => {
    assert.throws(() => decalage({ TESTS_DECALAGE: 'abc' }), /entier entre 0 et 40/);
    assert.throws(() => decalage({ TESTS_DECALAGE: '-1' }), /entier entre 0 et 40/);
    assert.equal(decalage({}), 0);
  });
  test('un port occupé est détecté tout de suite, un port libre non', async () => {
    const serveur = net.createServer().listen(0, '127.0.0.1');
    await new Promise((ok) => serveur.once('listening', ok));
    const { port } = serveur.address();
    assert.equal(await portOccupe(port), true);
    assert.deepEqual((await portsPris([['essai', port]])).map((p) => p.port), [port]);
    await new Promise((ok) => serveur.close(ok));
    assert.equal(await portOccupe(port), false);
  });
  test('lancement sur des ports occupés : arrêt en moins de 10 s avec le message « relance avec TESTS_DECALAGE=<n+1> »', async () => {
    const serveur = net.createServer().listen(Number(BASES.firestore) + 7000 + RANGS.noyau, '127.0.0.1');
    await new Promise((ok) => serveur.once('listening', ok));
    const debut = Date.now();
    const r = spawnSync('node', ['lancer-tout.js'], { cwd: fileURLToPath(new URL('.', import.meta.url)), env: { ...process.env, TESTS_DECALAGE: '7' }, encoding: 'utf8', timeout: 10_000 });
    await new Promise((ok) => serveur.close(ok));
    assert.equal(r.status, 2, r.stdout + r.stderr);
    assert.match(r.stderr, new RegExp(`Port ${BASES.firestore + 7000 + RANGS.noyau} pris .*relance avec TESTS_DECALAGE=8`));
    assert.ok(Date.now() - debut < 10_000);
  });
});

describe('A6 production inchangée : js/os/firebase.js', () => {
  const src = lire('js/os/firebase.js');
  test('sans window.__emulateurs, le projet et les ports restent ceux d\'avant (demo-chevalier-ia-os, 127.0.0.1, 9099, 8080)', () => {
    assert.match(src, /EMU\.projet \|\| 'demo-chevalier-ia-os'/);
    assert.match(src, /EMU\.auth\?\.hote \|\| '127\.0\.0\.1'/);
    assert.match(src, /EMU\.auth\?\.port \|\| 9099/);
    assert.match(src, /EMU\.firestore\?\.hote \|\| '127\.0\.0\.1'/);
    assert.match(src, /EMU\.firestore\?\.port \|\| 8080/);
  });
  test('window.__emulateurs n\'est lu que dans la branche du mode test (localhost + ?emulateurs=1) ; jamais en production', () => {
    assert.match(src, /const EMU = \(MODE_EMULATEURS && window\.__emulateurs\) \|\| \{\};/);
    assert.equal((src.split('\n').filter((l) => !l.trim().startsWith('//')).join('\n').match(/window\.__emulateurs/g) || []).length, 1);
    assert.match(src, /if \(MODE_EMULATEURS\) \{\s*connectAuthEmulator/);
    assert.match(src, /MODE_EMULATEURS \? \{ \.\.\.firebaseConfig, projectId: EMU\.projet \|\| 'demo-chevalier-ia-os' \} : firebaseConfig/);
  });
  test('aucun autre fichier de l\'appli ne connaît window.__emulateurs', () => {
    const r = spawnSync('git', ['grep', '-l', '__emulateurs', '--', 'js', 'index.html', 'espace'], { cwd: RACINE, encoding: 'utf8' });
    assert.equal(r.stdout.trim(), 'js/os/firebase.js');
  });
  test('par rapport à origin/main, le seul fichier de js/ modifié est js/os/firebase.js', { skip: !existsSync(`${RACINE}.git`) ? 'pas de dépôt git' : false }, (t) => {
    const r = spawnSync('git', ['diff', '--name-only', 'origin/main...HEAD', '--', 'js'], { cwd: RACINE, encoding: 'utf8' });
    if (r.status !== 0) return t.skip('origin/main introuvable ici');
    assert.deepEqual(r.stdout.split('\n').filter(Boolean), r.stdout.trim() ? ['js/os/firebase.js'] : []);
  });
});
