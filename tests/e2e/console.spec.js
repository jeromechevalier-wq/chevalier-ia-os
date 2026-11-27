// Module Console (phase 0, 16/11/2026) : accès réservé à Jérôme, Filet de sécurité, sélecteur de plateforme. Un test par critère (le nom commence par son numéro).
// Captures dans tests/e2e/captures/console/ (une par état, nommée avec le projet : bureau ou téléphone).
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { test, expect, connecter, allerA, attendreCalme, ecrireDocument, lireDocument, listerDocuments, ouvrirSectionReglages, CHARLES } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/console/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' });
}
// Pas d'émulateur de fonctions dans ces parcours : la réponse de `consoleEtat` est simulée (protocole « callable »), préparation CORS comprise.
async function simulerServeur(page, { refuser = false } = {}) {
  await page.route('**/consoleEtat', (route) => {
    const entetes = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: entetes });
    if (refuser) return route.fulfill({ status: 403, headers: entetes, contentType: 'application/json', body: JSON.stringify({ error: { status: 'PERMISSION_DENIED', message: 'x' } }) });
    return route.fulfill({ status: 200, headers: entetes, contentType: 'application/json', body: JSON.stringify({ result: { version: '9.9.9', serveur: 'ok', plateforme: 'chevalier-ia-os' } }) });
  });
}
const sansDefilementHorizontal = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

test('C4 le menu « Console » est visible pour Jérôme et mène au filet', async ({ page }) => {
  await simulerServeur(page);
  await connecter(page);
  await allerA(page, 'Console');
  await expect(page.locator('h1')).toHaveText('Console');
  await expect(page.locator('.onglets').getByRole('link', { name: 'Filet de sécurité' })).toBeVisible();
});

test('C4 le compte du bot ne voit pas le menu « Console » et l\'adresse du filet reste introuvable', async ({ page }) => {
  await connecter(page, CHARLES, { route: 'console/filet' });
  await attendreCalme(page);
  await expect(page.locator('.menu').getByRole('link', { name: 'Console', exact: true })).toHaveCount(0);
  await expect(page.locator('h1', { hasText: 'Filet de sécurité' })).toHaveCount(0);
});

test('C5 le filet liste toutes les vérifications ; une ligne jamais faite est « Jamais fait », une ligne datée est « À jour »', async ({ page }, info) => {
  await ecrireDocument('console_filet/budget', { verifieLe: new Date(), note: 'Alerte à 50 %' });
  await connecter(page, undefined, { route: 'console/filet' });
  await attendreCalme(page);
  await expect(page.locator('section[data-ligne]')).toHaveCount(7);
  await expect(page.locator('section[data-ligne="budget"]')).toContainText('À jour');
  await expect(page.locator('section[data-ligne="budget"]')).toContainText('Vérifié aujourd\'hui');
  await expect(page.locator('section[data-ligne="restauration"]')).toContainText('Jamais fait');
  await expect(page.locator('section[data-ligne="restauration"]')).toHaveAttribute('data-etat', 'jamais');
  await capturer(page, info, 'C5-filet');
});

test('C5 « Vérifié aujourd\'hui » date la ligne, la passe à jour et laisse une trace dans le journal', async ({ page }) => {
  await connecter(page, undefined, { route: 'console/filet' });
  await attendreCalme(page);
  await page.locator('section[data-ligne="restauration"] [data-action="verifier"]').click();
  await expect(page.locator('section[data-ligne="restauration"]')).toHaveAttribute('data-etat', 'ok');
  await expect.poll(() => lireDocument('console_filet/restauration'), { timeout: 10_000 }).toBeTruthy(); // l'écran se met à jour avant la fin de l'écriture : on attend le document
  await expect.poll(async () => (await listerDocuments('crm_audit')).some((d) => d.collection === 'console_filet' && d.docId === 'restauration' && d.outil === 'consoleVerifierLigne'), { timeout: 10_000 }).toBe(true); // la trace du journal
});

test('C6 cas vide : sans aucune fiche, l\'écran dit « Aucune vérification enregistrée » et propose chaque ligne', async ({ page }, info) => {
  await connecter(page, undefined, { route: 'console/filet' });
  await attendreCalme(page);
  await expect(page.locator('[data-vide]')).toHaveText('Aucune vérification enregistrée.');
  await expect(page.locator('section[data-ligne]')).toHaveCount(7);
  await capturer(page, info, 'C6-vide');
});

test('C8 le sélecteur de plateforme met la plateforme dans l\'adresse et garde « Toutes les plateformes » en premier', async ({ page }, info) => {
  await simulerServeur(page);
  await connecter(page, undefined, { route: 'console/vue' });
  await attendreCalme(page);
  const options = page.locator('select[data-action="plateforme"] option');
  await expect(options.first()).toHaveText('Toutes les plateformes');
  await page.locator('select[data-action="plateforme"]').selectOption('clients');
  await expect(page).toHaveURL(/#\/console\/vue\/clients$/);
  await expect(page.locator('select[data-action="plateforme"]')).toHaveValue('clients');
  await capturer(page, info, 'C8-selecteur');
});

test('C10 les deux écrans tiennent sans défilement horizontal de la page', async ({ page }) => {
  await simulerServeur(page);
  await connecter(page, undefined, { route: 'console/vue' });
  await attendreCalme(page);
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await page.goto('/?emulateurs=1#/console/filet');
  await attendreCalme(page);
  expect(await sansDefilementHorizontal(page)).toBe(true);
});

test('C5 une 2e vérification MODIFIE la fiche (le journal garde l\'ancienne date) et ne supprime pas la note', async ({ page }) => {
  await ecrireDocument('console_filet/budget', { verifieLe: new Date(Date.now() - 100 * 86_400_000), note: 'Alerte à 50 %' });
  await connecter(page, undefined, { route: 'console/filet' });
  await attendreCalme(page);
  await expect(page.locator('section[data-ligne="budget"]')).toHaveAttribute('data-etat', 'ancien');
  await page.locator('section[data-ligne="budget"] [data-action="verifier"]').click();
  await expect(page.locator('section[data-ligne="budget"]')).toHaveAttribute('data-etat', 'ok');
  await expect.poll(async () => (await listerDocuments('crm_audit')).some((d) => d.collection === 'console_filet' && d.docId === 'budget' && d.action === 'modifier'), { timeout: 10_000 }).toBe(true);
  expect((await lireDocument('console_filet/budget')).note).toBe('Alerte à 50 %');
});

test('C9 le bouton « Exporter mes données » (Réglages > Console) télécharge un JSON des vérifications du filet', async ({ page }) => {
  await ecrireDocument('console_filet/budget', { verifieLe: new Date(), note: 'Alerte à 50 %' });
  await simulerServeur(page);
  await connecter(page);
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Console');
  const bouton = page.locator('#reglages-export-console [data-action="exporter-console"]');
  await expect(bouton).toHaveText('Exporter mes données');
  const [dl] = await Promise.all([page.waitForEvent('download'), bouton.click()]);
  expect(dl.suggestedFilename()).toMatch(/^chevalier-ia-console-\d{4}-\d{2}-\d{2}\.json$/);
  const json = JSON.parse(await readFile(await dl.path(), 'utf8'));
  expect(Object.keys(json.collections)).toEqual(['console_filet']);
  expect(json.collections.console_filet.map((f) => f.id)).toEqual(['budget']);
});

test('A1 Vue d\'ensemble : le schéma d\'architecture s\'affiche', async ({ page }, info) => {
  await simulerServeur(page);
  await connecter(page, undefined, { route: 'console/vue' });
  await attendreCalme(page);
  const bloc = page.locator('[data-bloc="architecture"]');
  await expect(bloc).toBeVisible();
  const dessin = bloc.locator('svg[role="img"]:visible');
  await expect(dessin).toHaveCount(1); // un seul des deux dessins (large ou étroit) est montré
  expect((await dessin.getAttribute('aria-label')).trim().length).toBeGreaterThan(20);
  for (const t of ['Chevalier IA OS', 'Chevalier IA App', 'Appartement 1', 'Maison client 1', 'n8n']) await expect(bloc).toContainText(t);
  // Textes du dessin visible lisibles : 12 px rendus au moins (téléphone 390 px compris).
  const plusPetit = await dessin.evaluate((svg) => Math.min(...[...svg.querySelectorAll('text')].map((t) => parseFloat(t.getAttribute('font-size')) * svg.getScreenCTM().a)));
  expect(plusPetit).toBeGreaterThanOrEqual(12);
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await bloc.scrollIntoViewIfNeeded();
  await capturer(page, info, 'A1-schema');
});

test('A2 Le schéma ne dépend pas des données', async ({ page }) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'le faux serveur de la Console refuse exprès (erreur 403)' });
  await simulerServeur(page, { refuser: true });
  await connecter(page, undefined, { route: 'console/vue' });
  await attendreCalme(page);
  await expect(page.locator('.page > [data-bloc="architecture"]')).toBeVisible();
  await expect(page.locator('.console-zone [data-bloc="architecture"]')).toHaveCount(0);
});
