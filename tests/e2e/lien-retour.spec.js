// Le lien « < Affaires » (retour à la liste, en haut d'une fiche) ne réagit que sur son texte : il ne s'étire pas sur toute la largeur de la page
// (21/11/2026 : cliquer dans le vide au-dessus de « Voir le devis » ramenait à la liste). Le lien est dans une colonne flex (.page et .fiche-tete) : sans `align-self`, il était étiré.
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, creerAffaire, URL_APP } from './outils.js';
import { brancherGoogle } from './google-simule.js';

// L'onglet G-Drive de la fiche charge Google à l'avance : simulé (le navigateur de test n'y accède pas).
test.beforeEach(async ({ context }) => { await brancherGoogle(context); });

test('1 le lien de retour d’une fiche affaire est aussi large que son texte, pas que la page ; le vide à sa droite ne le déclenche pas', async ({ page }, info) => {
  await creerAffaire('a1', { titre: 'Rénovation cuisine' });
  await connecter(page);
  await page.goto(`${URL_APP}#/crm/affaires/a1`);
  await expect(page.locator('.compositeur')).toBeVisible();
  await attendreCalme(page);
  const lien = page.locator('.fiche-tete > .lien-retour').first();
  await expect(lien).toContainText('Affaires');
  const boite = await lien.boundingBox();
  const pageLargeur = (await page.locator('.fiche-tete').first().boundingBox()).width;
  expect(boite.width).toBeLessThan(160); // « < Affaires » : environ 90 px
  expect(boite.width).toBeLessThan(pageLargeur / 4);
  const dossier = fileURLToPath(new URL('./captures/lien-retour/', import.meta.url));
  await mkdir(dossier, { recursive: true });
  await page.screenshot({ path: `${dossier}1-lien-etroit-${info.project.name}.png`, animations: 'disabled' });
  // un clic dans le vide, à droite du mot, ne ramène pas à la liste
  await page.mouse.click(boite.x + boite.width + 200, boite.y + boite.height / 2);
  await expect(page).toHaveURL(/#\/crm\/affaires\/a1$/);
  // un clic sur le mot y ramène
  await lien.click();
  await expect(page).toHaveURL(/#\/crm\/affaires$/);
});
