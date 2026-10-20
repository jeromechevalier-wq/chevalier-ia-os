// Compositeur d'activité : les raccourcis, la date (qui ouvre le calendrier) et l'heure sont sur une seule ligne.
import { test, expect, attendreCalme, connecter, creerAffaire } from './outils.js';

test('L1 le formulaire est replié au départ et se déplie au clic ; Demain, +3 jours, +1 semaine, +2 semaines, la date et l\'heure sont sur la même ligne du compositeur d\'activité', async ({ page }, info) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await connecter(page);
  await page.evaluate(() => { location.hash = '#/crm/affaires/a1'; });
  await attendreCalme(page);
  const ligne = page.locator('.compositeur-corps:visible .ligne-date');
  await expect(ligne).toBeHidden(); // formulaire replié : seule la ligne « Clique ici… » est visible
  await expect(page.locator('[data-action="enregistrer-activite"]')).toBeHidden();
  await page.screenshot({ path: `test-results/activite-replie-${info.project.name}.png` });
  await page.getByLabel('Titre de l’activité').click();
  await expect(ligne).toBeVisible();
  await expect(ligne.locator('[data-date-rapide]')).toHaveCount(4);
  const tops = await ligne.evaluate((el) => [...el.querySelectorAll('[data-date-rapide], input[type="date"], input[type="time"]')].map((e) => Math.round(e.getBoundingClientRect().top + e.getBoundingClientRect().height / 2)));
  expect(tops).toHaveLength(6);
  if (info.project.name === 'ordinateur') expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(6);
  await page.screenshot({ path: `test-results/activite-ligne-date-${info.project.name}.png`, fullPage: true });
});

test('L2 le formulaire se replie après l\'enregistrement ; Échap le replie quand le titre est vide', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await connecter(page);
  await page.evaluate(() => { location.hash = '#/crm/affaires/a1'; });
  await attendreCalme(page);
  const titre = page.getByLabel('Titre de l’activité');
  const ligne = page.locator('.compositeur-corps:visible .ligne-date');
  await titre.click();
  await page.keyboard.press('Escape');
  await expect(ligne).toBeHidden();
  await titre.fill('Relancer');
  await expect(ligne).toBeVisible();
  await page.locator('[data-action="enregistrer-activite"]').click();
  await expect(page.locator('.points-cles')).toContainText('Relancer');
  await expect(ligne).toBeHidden();
});
