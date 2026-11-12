// Liens sûrs : une adresse qui n'est pas http(s) s'affiche en texte (jamais en lien), la saisie est contrôlée, un e-mail piégé ne fait pas de mailto:.
import { test, expect, attendreCalme, connecter, creerPersonne, creerOrganisation, lireDocument } from './outils.js';

async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }

test('1 une valeur javascript: déjà en base s\'affiche en texte, sans lien, et reste en base', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Alice Test', siteWeb: 'javascript:alert(1)' });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  const zone = page.locator('.prop', { hasText: 'Site web' });
  await expect(zone).toContainText('javascript:alert(1)');
  await expect(zone.locator('a')).toHaveCount(0);
  expect((await lireDocument('crm_personnes/p1')).siteWeb).toBe('javascript:alert(1)');
});

test('2 une ancienne valeur sans https (www.monsite.fr) redevient un vrai lien', async ({ page }) => {
  await creerOrganisation('o1', { nom: 'Chez Test', siteWeb: 'www.monsite.fr' });
  await connecter(page);
  await aller(page, '#/crm/organisations/o1');
  const lien = page.locator('.prop', { hasText: 'Site web' }).locator('a');
  await expect(lien).toHaveAttribute('href', 'https://www.monsite.fr');
});

test('3 saisir javascript: est refusé avec un message, monsite.fr est enregistré en https', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Alice Test' });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  const zone = page.locator('.prop', { hasText: 'Site web' });
  await zone.getByRole('button').first().click();
  await zone.getByRole('textbox').fill('javascript:alert(1)');
  await page.keyboard.press('Enter');
  await expect(page.getByText('Adresse invalide : elle doit commencer par http:// ou https://')).toBeVisible();
  expect((await lireDocument('crm_personnes/p1')).siteWeb).toBe('');
  await zone.getByRole('button').first().click();
  await zone.getByRole('textbox').fill('monsite.fr');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await lireDocument('crm_personnes/p1')).siteWeb).toBe('https://monsite.fr');
});

test('4 un e-mail piégé : pas de mailto: dans la liste ni sur le bouton « Écrire un email »', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Alice Test', emails: [{ valeur: 'alice@exemple.test?subject=Bonjour', type: 'travail' }] });
  await connecter(page);
  await aller(page, '#/crm/personnes');
  await expect(page.getByText('alice@exemple.test?subject=Bonjour').first()).toBeVisible();
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
  await aller(page, '#/crm/personnes/p1');
  const bouton = page.locator('button[data-action="ecrire-email"]');
  await expect(bouton).toBeDisabled();
  await expect(bouton).toHaveAttribute('title', 'Adresse email à corriger');
  await expect(page.locator('a[href^="mailto:"]')).toHaveCount(0);
});
