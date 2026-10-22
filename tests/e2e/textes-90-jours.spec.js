// M1 : l'écran Journal ne parle plus de « 90 jours » ni d'« expiré » (les copies sont gardées sans limite de durée).
// Captures dans tests/e2e/captures/textes-90-jours/.
import { mkdirSync } from 'node:fs';
import { test, expect, connecter, ecrireDocument, allerA } from './outils.js';

test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
});

const DOSSIER = new URL('./captures/textes-90-jours/', import.meta.url).pathname;
mkdirSync(DOSSIER, { recursive: true });

const sansDuree = (texte) => {
  expect(texte).not.toMatch(/90\s*jours/i);
  expect(texte).not.toMatch(/expir/i);
};

test('M1 : le Journal vide dit que les copies sont gardées sans limite de durée, sans « 90 jours » ni « expiré »', async ({ page }) => {
  await connecter(page);
  await allerA(page, 'Journal des modifications');
  await expect(page.getByRole('heading', { name: 'Journal des modifications' })).toBeVisible();
  await expect(page.locator('.tableau-journal tbody tr')).toHaveCount(0); // cas vide : aucune ligne
  await expect(page.locator('.page-journal > .aide').first()).toContainText('gardée sans limite de durée');
  sansDuree(await page.locator('.page-journal').innerText());
  await page.screenshot({ path: `${DOSSIER}M1-journal-vide.png`, animations: 'disabled' });
});

test('M1 : le Journal avec une ligne sans copie « avant / après » ne parle ni de « 90 jours » ni d’« expiré »', async ({ page }) => {
  await ecrireDocument('crm_audit/mcp2', { operationId: 'opsanscopie', ordre: 1, acteur: 'claude-code-jerome', jeton: 'claude-code-jerome', via: 'mcp', outil: 'supprimer_affaire', collection: 'crm_affaires', docId: 'a9', action: 'supprimer', statut: 'succes', champsModifies: [], parametresRecus: [], date: new Date(Date.now() - 3_600_000) });
  await connecter(page);
  await allerA(page, 'Journal des modifications');
  const ligne = page.locator('tr[data-operation="opsanscopie"]');
  await expect(ligne).toHaveCount(1);
  sansDuree(await page.locator('.page-journal').innerText());
  await ligne.click();
  const fenetre = page.getByRole('dialog');
  await expect(fenetre).toContainText('Pas de copie');
  sansDuree(await fenetre.innerText());
  await page.screenshot({ path: `${DOSSIER}M1-journal-sans-copie.png`, animations: 'disabled' });
});
