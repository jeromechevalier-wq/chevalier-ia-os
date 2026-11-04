// Champs numériques sans flèches haut/bas (04/11/2026, docs/consignes-ui.md). Captures : tests/e2e/captures/champs-nombre-sans-fleches/.
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, lireDocument, creerAffaire } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/champs-nombre-sans-fleches/', import.meta.url));

test.beforeEach(async ({ page }) => {
  await page.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
});

async function ouvrirSaisie(page) {
  await creerAffaire('a1', { titre: 'Rénovation cuisine', montant: 1500 });
  await connecter(page, undefined, { route: 'crm/affaires/a1' });
  await expect(page.locator('.fiche-tete')).toBeVisible();
  await attendreCalme(page);
  await page.locator('.fiche-tete .fiche-montant .prop-modifier').click();
  return page.getByLabel('Montant estimé', { exact: true });
}

test('1 le champ « Montant estimé » en saisie n’a pas de flèches : cliquer à leur place ne change pas la valeur', { tag: '@sans-telephone' }, async ({ page }, info) => {
  const champ = await ouvrirSaisie(page);
  await champ.fill('340.01');
  expect(await champ.evaluate((el) => getComputedStyle(el).appearance)).toBe('textfield');
  const box = await champ.boundingBox();
  await page.mouse.click(box.x + box.width - 6, box.y + box.height * 0.25);
  await expect(champ).toHaveValue('340.01');
  await mkdir(DOSSIER, { recursive: true });
  await page.locator('.fiche-tete').screenshot({ path: `${DOSSIER}1-saisie-${info.project.name}.png`, animations: 'disabled' });
});

test('2 on tape le montant au clavier et il s’enregistre : 340,01 €', async ({ page }, info) => {
  const champ = await ouvrirSaisie(page);
  await champ.fill('340.01');
  await champ.press('Enter');
  await expect.poll(async () => (await lireDocument('crm_affaires/a1')).montant).toBe(340.01);
  await expect(page.locator('.fiche-tete .fiche-montant')).toContainText(/340,01\s€/);
  await mkdir(DOSSIER, { recursive: true });
  await page.locator('.fiche-tete').screenshot({ path: `${DOSSIER}2-enregistre-${info.project.name}.png`, animations: 'disabled' });
});
