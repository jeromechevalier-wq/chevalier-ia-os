// Statistiques des devis : la ligne grise « Les devis de test ne sont pas comptés. » est toujours visible (10/11/2026).
// Numéros des critères : N1 chez Jérôme, N2 portail Devis seul d'un client, N3 cas vide. Le format téléphone est le même fichier lancé avec --project=telephone (N4).
// Captures dans tests/e2e/captures/statistiques-note-tests/.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, ecrireDocument, attendreCalme, JEROME, PROJET, FIRESTORE, URL_APP } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/statistiques-note-tests/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: true, animations: 'disabled' });
const PHRASE = 'Les devis de test ne sont pas comptés.';
const ALICE = 'alice@exemple.test';

test.beforeEach(async ({ page }) => {
  await page.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
});
async function chargerRegles(fichier) {
  const contenu = await readFile(fileURLToPath(new URL(`../../${fichier}`, import.meta.url)), 'utf8');
  const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: fichier, content: contenu }] } }) });
  if (!r.ok) throw new Error(`Règles non chargées (${fichier}) : ${await r.text()}`);
}

const note = (page) => page.locator('[data-role="note-tests"]');

test('N1 Statistiques chez Jérôme : la ligne « Les devis de test ne sont pas comptés. » est visible sous les chiffres', async ({ page }, info) => {
  await connecter(page, JEROME, { route: 'devis/statistiques' });
  await expect(page.locator('.page-statistiques')).toBeVisible();
  await attendreCalme(page);
  await expect(note(page)).toHaveText(PHRASE);
  await expect(note(page)).toBeVisible();
  await capturer(page, info, 'N1-jerome');
});

test('N3 Statistiques sans aucun devis : le message de cas vide ET la ligne sur les tests sont visibles', async ({ page }, info) => {
  await connecter(page, JEROME, { route: 'portail-devis/devis/statistiques' });
  await expect(page.getByText('Pas encore de devis sur cette période.')).toBeVisible();
  await expect(note(page)).toBeVisible();
  await expect(note(page)).toHaveText(PHRASE);
  await capturer(page, info, 'N3-vide');
});

test.describe('chez un client Devis seul', () => {
  test.beforeAll(() => chargerRegles('firestore.plateforme.rules'));
  test.afterAll(() => chargerRegles('firestore.rules'));
  test('N2 portail Devis seul d\'un client : la ligne est visible sur l\'écran Statistiques', async ({ page }, info) => {
    await ecrireDocument('marques/devisseul', { actif: true, nom: 'Devis Seul', couleur: '#336699', accueil: 'Bienvenue.' });
    await ecrireDocument('clients/devisseul', { modules: { devis: true } });
    await ecrireDocument(`clients/devisseul/membres/${ALICE}`, { role: 'editeur' });
    await page.goto('about:blank');
    await page.goto(`${URL_APP}#/espace/devisseul/portail-devis/devis/statistiques`);
    await page.waitForFunction(() => !!window.__chevalierTest);
    await page.evaluate((e) => window.__chevalierTest.connecter(e, true), ALICE);
    await expect(page.locator('.page-statistiques')).toBeVisible();
    await expect(note(page)).toHaveText(PHRASE);
    await capturer(page, info, 'N2-client');
  });
});
