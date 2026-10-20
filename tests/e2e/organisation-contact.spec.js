// Fiche organisation : téléphone et email dans le Résumé, sous « Site web ».
import { test, expect, attendreCalme, connecter, creerOrganisation, lireDocument } from './outils.js';

async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }
const prop = (page, nom) => page.locator(`[data-section="organisation-resume"] .prop`, { has: page.locator('.prop-libelle', { hasText: new RegExp(`^${nom}$`) }) });

test('C1 le Résumé de l\'organisation propose « Téléphone » et « Email » (cas vide : bouton Ajouter), qui s\'enregistrent et deviennent des liens tel: et mailto:', async ({ page }, info) => {
  await creerOrganisation('o1', { nom: 'Orpi Bassanelli' });
  await connecter(page);
  await aller(page, '#/crm/organisations/o1');
  await expect(prop(page, 'Téléphone').locator('.prop-vide')).toBeVisible();
  await expect(prop(page, 'Email').locator('.prop-vide')).toBeVisible();
  await prop(page, 'Téléphone').locator('.prop-vide').click();
  await page.locator('[data-section="organisation-resume"] input[type="tel"]').fill('04 92 00 00 00');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await lireDocument('crm_organisations/o1')).telephone).toBe('04 92 00 00 00');
  await prop(page, 'Email').locator('.prop-vide').click();
  await page.locator('[data-section="organisation-resume"] input[type="email"]').fill('Contact@Orpi-Manosque.fr');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await lireDocument('crm_organisations/o1')).email).toBe('contact@orpi-manosque.fr');
  await expect(prop(page, 'Téléphone').locator('a')).toHaveAttribute('href', 'tel:0492000000');
  await expect(prop(page, 'Email').locator('a')).toHaveAttribute('href', 'mailto:contact@orpi-manosque.fr');
  await page.screenshot({ path: `test-results/organisation-contact-${info.project.name}.png`, fullPage: true });
});

test('C2 un email invalide est refusé avec un message qui dit quoi faire, et rien n\'est enregistré', async ({ page }) => {
  await creerOrganisation('o1', { nom: 'Orpi Bassanelli' });
  await connecter(page);
  await aller(page, '#/crm/organisations/o1');
  await prop(page, 'Email').locator('.prop-vide').click();
  await page.locator('[data-section="organisation-resume"] input[type="email"]').fill('pas-un-email');
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toContainText('Cette adresse email n’est pas valide');
  expect((await lireDocument('crm_organisations/o1')).email ?? '').toBe('');
});
