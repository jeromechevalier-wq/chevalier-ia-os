// Temps d'attente GitHub Actions (31/10/2026) : voie « Docs », décision du niveau, paths-ignore du déploiement, mesure. Tout hors réseau.
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { decider } from './niveau-de-test.js';

const RACINE = join(dirname(fileURLToPath(import.meta.url)), '..');
const lire = (f) => readFileSync(join(RACINE, f), 'utf8');
const PR = { evenement: 'pull_request' };

describe('1 déploiement Hosting : paths-ignore sûr', () => {
  const yml = lire('.github/workflows/firebase-hosting.yml');
  const ignores = [...yml.match(/paths-ignore:\n((?:\s+- '[^']+'\n)+)/)[1].matchAll(/- '([^']+)'/g)].map((m) => m[1]);
  const hosting = JSON.parse(lire('firebase.json')).hosting.ignore;
  test('1 paths-ignore présent, branches en liste « - main » conservées', () => {
    assert.ok(ignores.length >= 6, ignores.join(','));
    assert.match(yml, /branches:\s*\n\s*- main/);
    assert.ok(!ignores.some((x) => x.startsWith('tests')), 'tests/** n\'est pas ignoré');
  });
  test('1 chaque chemin ignoré est non servi (hosting.ignore) ou hors déploiement (.github/)', () => {
    for (const x of ignores) assert.ok(hosting.includes(x) || x.startsWith('.github/'), x);
  });
});

describe('2 decider : voie docs', () => {
  test('2 docs + wiki seuls => docs', () => {
    const r = decider({ ...PR, fichiers: ['docs/x.md', 'wiki/x.html'] });
    assert.deepEqual({ docs: r.docs, complet: r.complet, plateforme: r.plateforme }, { docs: true, complet: false, plateforme: '' });
  });
  test('2 docs + code => pas docs', () => assert.equal(decider({ ...PR, fichiers: ['docs/x.md', 'js/a.js'] }).docs, false));
  test('2 docs + firestore.rules => complet, pas docs', () => {
    const r = decider({ ...PR, fichiers: ['docs/x.md', 'firestore.rules'] });
    assert.equal(r.complet, true); assert.equal(r.docs, false);
  });
  test('2 étiquette tests-complets => complet', () => {
    const r = decider({ ...PR, etiquettes: 'a,tests-complets', fichiers: ['docs/x.md'] });
    assert.equal(r.complet, true); assert.equal(r.docs, false);
  });
  test('2 lancement manuel : coché => complet, décoché => rapide', () => {
    assert.equal(decider({ evenement: 'workflow_dispatch', completDemande: 'true' }).complet, true);
    assert.equal(decider({ evenement: 'workflow_dispatch', completDemande: 'false' }).complet, false);
    assert.equal(decider({ evenement: 'workflow_dispatch', completDemande: false }).docs, false);
  });
  test('2 aucun fichier => pas docs (rapide)', () => assert.equal(decider({ ...PR, fichiers: [] }).docs, false));
  test('2 le script de décision et le workflow sont des fichiers sensibles', () => {
    assert.equal(decider({ ...PR, fichiers: ['tests/niveau-de-test.js'] }).complet, true);
    assert.equal(decider({ ...PR, fichiers: ['.github/workflows/tests.yml'] }).complet, true);
  });
});

describe('3 decider : mêmes résultats que l\'ancien shell', () => {
  test('3 functions-plateforme seul => plateforme', () => assert.equal(decider({ ...PR, fichiers: ['functions-plateforme/x.js'] }).plateforme, 'true'));
  test('3 parcours ajouté => specs avec espace final', () => {
    const r = decider({ ...PR, fichiers: ['tests/e2e/a.spec.js'], fichiersAjoutesOuModifies: ['tests/e2e/a.spec.js', 'tests/x.test.js'] });
    assert.equal(r.specs, 'e2e/a.spec.js ');
    assert.equal(r.complet, false);
  });
  test('3 plateforme : pas en complet', () => assert.equal(decider({ ...PR, fichiers: ['functions-plateforme/x.js', 'firestore.rules'] }).plateforme, ''));
});

describe('4 tests.yml : la coche « Tests » et la voie Docs', () => {
  const yml = lire('.github/workflows/tests.yml');
  test('4 un job Docs, final dépend de docs, nom Tests unique et inchangé', () => {
    assert.match(yml, /\n    name: Docs\n/);
    assert.match(yml, /needs: \[niveau, rapide, docs, complet-navigateur, complet-sans-navigateur\]/);
    assert.equal(yml.match(/^\s+name: Tests$/gm).length, 1);
    assert.match(yml, /name: Tests\n    needs:[^\n]*\n    if: always\(\)\n/);
    assert.match(yml, /types: \[opened, synchronize, reopened, labeled\]/);
  });
  test('4 Rapide exclut docs ; Docs ne tourne que si docs=true', () => {
    assert.match(yml, /if: needs\.niveau\.outputs\.complet != 'true' && needs\.niveau\.outputs\.docs != 'true'/);
    assert.match(yml, /if: needs\.niveau\.outputs\.docs == 'true'/);
    assert.match(yml, /npm run test:docs/);
  });
  test('4 le job niveau appelle le script testé', () => assert.match(yml, /run: node tests\/niveau-de-test\.js/));
  test('4 tests-nuit.yml inchangé : cron, déclenchement manuel, aucun job nommé Tests', () => {
    const nuit = lire('.github/workflows/tests-nuit.yml');
    assert.ok(nuit.includes("cron: '17 0 * * *'"));
    assert.match(nuit, /workflow_dispatch/);
    assert.ok(!/^\s+name: Tests$/m.test(nuit));
    assert.ok(!/GITHUB_STEP_SUMMARY/.test(nuit), 'pas de mesure dans tests-nuit.yml');
  });
});

describe('5 mesure du temps', () => {
  test('5 jeton du workflow, jamais de secret, ne fait pas échouer la coche', () => {
    for (const f of ['tests.yml', 'firebase-hosting.yml']) {
      const yml = lire(`.github/workflows/${f}`);
      const etape = yml.slice(yml.indexOf('Mesurer'));
      assert.match(etape, /github\.token/, f);
      assert.match(etape, /continue-on-error: true/, f);
      assert.match(etape, /GITHUB_STEP_SUMMARY/, f);
      assert.match(etape, /actions\/runs\/\$GITHUB_RUN_ID\/jobs/, f);
      assert.ok(!/\$\{\{\s*secrets\./.test(etape), `${f} : la mesure n'utilise aucun secret`);
    }
    assert.match(lire('.github/workflows/tests.yml'), /permissions:\n      actions: read/);
  });
});
