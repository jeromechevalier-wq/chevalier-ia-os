// Compositeur d'activité : les raccourcis, la date (qui ouvre le calendrier) et l'heure sont sur une seule ligne.
import { test, expect, attendreCalme, connecter, creerAffaire } from './outils.js';

test('L1 Demain, +3 jours, +1 semaine, +2 semaines, la date et l\'heure sont sur la même ligne du compositeur d\'activité', async ({ page }, info) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await connecter(page);
  await page.evaluate(() => { location.hash = '#/crm/affaires/a1'; });
  await attendreCalme(page);
  const ligne = page.locator('.compositeur-corps:visible .ligne-date');
  await expect(ligne.locator('[data-date-rapide]')).toHaveCount(4);
  const tops = await ligne.evaluate((el) => [...el.querySelectorAll('[data-date-rapide], input[type="date"], input[type="time"]')].map((e) => Math.round(e.getBoundingClientRect().top + e.getBoundingClientRect().height / 2)));
  expect(tops).toHaveLength(6);
  if (info.project.name === 'ordinateur') expect(Math.max(...tops) - Math.min(...tops)).toBeLessThan(6);
  await page.screenshot({ path: `test-results/activite-ligne-date-${info.project.name}.png`, fullPage: true });
});
