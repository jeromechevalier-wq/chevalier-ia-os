// Fiche organisation : plusieurs emails et téléphones (avec type) dans le Résumé, comme la fiche personne.
// Captures (format ordinateur) dans tests/e2e/captures/contacts/.
import { fileURLToPath } from 'node:url';
import { test, expect, attendreCalme, connecter, creerOrganisation, lireDocument } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/contacts/', import.meta.url));
async function capturer(page, info, nom) {
  if (info.project.name !== 'ordinateur') return;
  await page.screenshot({ path: `${DOSSIER}${nom}.png`, fullPage: true });
}
async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }
const ligne = (page, genre) => page.locator(`[data-section="organisation-resume"] [data-contacts="${genre}"]`);

test('C1 le Résumé de l\'organisation propose « Téléphone » et « Email » (cas vide : « + Ajouter »), qui s\'enregistrent en listes et deviennent des liens tel: et mailto:', async ({ page }, info) => {
  await creerOrganisation('o1', { nom: 'Boutique Exemple' });
  await connecter(page);
  await aller(page, '#/crm/organisations/o1');
  await expect(ligne(page, 'tel').locator('[data-action="ajouter-contact"]')).toBeVisible();
  await expect(ligne(page, 'email').locator('[data-action="ajouter-contact"]')).toBeVisible();
  await ligne(page, 'tel').locator('[data-action="ajouter-contact"]').click();
  await page.getByRole('textbox', { name: 'Nouveau : téléphone' }).fill('04 92 00 00 00');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await lireDocument('crm_organisations/o1')).telephones).toEqual([{ valeur: '04 92 00 00 00', type: 'travail' }]);
  await ligne(page, 'email').locator('[data-action="ajouter-contact"]').click();
  await page.getByRole('textbox', { name: 'Nouveau : email' }).fill('Contact@Exemple.test');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await lireDocument('crm_organisations/o1')).emails).toEqual([{ valeur: 'Contact@Exemple.test', type: 'travail' }]);
  await expect(ligne(page, 'tel').locator('a')).toHaveAttribute('href', 'tel:0492000000');
  await expect(ligne(page, 'email').locator('a')).toHaveAttribute('href', 'mailto:contact@exemple.test');
  await capturer(page, info, 'organisation-1-un-email');
});

test('C2 un email invalide est refusé avec un message qui dit quoi faire, et rien n\'est enregistré', async ({ page }) => {
  await creerOrganisation('o1', { nom: 'Boutique Exemple' });
  await connecter(page);
  await aller(page, '#/crm/organisations/o1');
  await ligne(page, 'email').locator('[data-action="ajouter-contact"]').click();
  await page.getByRole('textbox', { name: 'Nouveau : email' }).fill('pas-un-email');
  await page.keyboard.press('Enter');
  await expect(page.locator('body')).toContainText('Cette adresse email n’est pas valide');
  expect((await lireDocument('crm_organisations/o1')).emails ?? []).toEqual([]);
});

test('7a plusieurs emails et plusieurs téléphones avec leur type sur une organisation', async ({ page }, info) => {
  await creerOrganisation('o1', { nom: 'Boutique Exemple', emails: [{ valeur: 'un@exemple.test', type: 'travail' }], telephones: [{ valeur: '04 00 00 00 01', type: 'travail' }] });
  await connecter(page);
  await aller(page, '#/crm/organisations/o1');
  await ligne(page, 'email').locator('[data-action="ajouter-contact"]').click();
  await page.getByRole('textbox', { name: 'Nouveau : email' }).fill('deux@exemple.test');
  await ligne(page, 'email').getByLabel('Type de email').selectOption('autre');
  await page.keyboard.press('Enter');
  await ligne(page, 'tel').locator('[data-action="ajouter-contact"]').click();
  await page.getByRole('textbox', { name: 'Nouveau : téléphone' }).fill('04 00 00 00 02');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await lireDocument('crm_organisations/o1')).emails.map((e) => `${e.valeur}|${e.type}`)).toEqual(['un@exemple.test|travail', 'deux@exemple.test|autre']);
  await expect.poll(async () => (await lireDocument('crm_organisations/o1')).telephones.length).toBe(2);
  await expect(ligne(page, 'email').locator('.contact-valeur')).toHaveCount(2);
  await capturer(page, info, 'organisation-2-plusieurs');
});

test('7b une organisation non convertie (ancien champ email et telephone) les affiche comme première valeur', async ({ page }, info) => {
  await creerOrganisation('o1', { nom: 'Boutique Exemple', email: 'ancien@exemple.test', telephone: '04 99 99 99 99' });
  await connecter(page);
  await aller(page, '#/crm/organisations/o1');
  await expect(ligne(page, 'email').locator('.contact-valeur')).toHaveCount(1);
  await expect(ligne(page, 'email')).toContainText('ancien@exemple.test');
  await expect(ligne(page, 'tel')).toContainText('04 99 99 99 99');
  await capturer(page, info, 'organisation-3-ancien-champ');
});

test('7c la première modification écrit la liste (avec l\'ancienne valeur) et vide l\'ancien champ', async ({ page }) => {
  await creerOrganisation('o1', { nom: 'Boutique Exemple', email: 'ancien@exemple.test' });
  await connecter(page);
  await aller(page, '#/crm/organisations/o1');
  await ligne(page, 'email').locator('[data-action="ajouter-contact"]').click();
  await page.getByRole('textbox', { name: 'Nouveau : email' }).fill('nouveau@exemple.test');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await lireDocument('crm_organisations/o1')).emails?.map((e) => e.valeur)).toEqual(['ancien@exemple.test', 'nouveau@exemple.test']);
  expect((await lireDocument('crm_organisations/o1')).email).toBe('');
});
