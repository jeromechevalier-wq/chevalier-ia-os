// Portail devis seul : le bouton « Catalogue » de la page Devis doublait l'entrée « Catalogue » du menu. Captures dans tests/e2e/captures/doublon-catalogue/.
// Critères : 1 en portail, plus de bouton « Catalogue » sur la page Devis, le menu garde « Catalogue » et il ouvre le catalogue ;
// 2 hors portail le bouton est inchangé ; 3 « Vocabulaire » reste accessible comme avant (en portail et hors portail).
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, estTelephone, attendreCalme, JEROME } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/doublon-catalogue/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: true, animations: 'disabled' });

// Dans ce bac à sable, le script de Google est inaccessible : on le remplace par un fichier vide.
test.beforeEach(async ({ page }) => {
  await page.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
});
async function ouvrir(page, route) {
  await connecter(page, JEROME, { route });
  await expect(page.locator('.page-liste-devis')).toBeVisible();
  await attendreCalme(page);
}

test('1 en portail, la page Devis n\'a plus de bouton « Catalogue » ; le menu garde « Catalogue » et il ouvre le catalogue', async ({ page }, info) => {
  await ouvrir(page, 'portail-devis');
  await expect(page.locator('.page-liste-devis [data-action="ouvrir-bordereau"]')).toHaveCount(0);
  await expect(page.locator('.page-liste-devis').getByRole('link', { name: 'Catalogue', exact: true })).toHaveCount(0);
  await capturer(page, info, '1-portail-sans-bouton');
  if (estTelephone(page)) await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await page.locator('.menu').getByRole('link', { name: 'Catalogue', exact: true }).click();
  await expect(page).toHaveURL(/#\/portail-devis\/devis\/bordereau$/);
  await expect(page.locator('[data-action="retour-devis"]')).toBeVisible();
});

test('2 hors portail (espace complet), le bouton « Catalogue » de la page Devis est inchangé', async ({ page }, info) => {
  await ouvrir(page, 'devis/liste');
  await expect(page.locator('.page-liste-devis [data-action="ouvrir-bordereau"]')).toHaveCount(1);
  await expect(page.locator('.page-liste-devis [data-action="ouvrir-bordereau"]')).toHaveText('Catalogue');
  await capturer(page, info, '2-hors-portail-avec-bouton');
  await page.locator('[data-action="ouvrir-bordereau"]').click();
  await expect(page).toHaveURL(/#\/devis\/bordereau$/);
});

test('3 le bouton « Vocabulaire » reste accessible comme avant, en portail et hors portail', async ({ page }, info) => {
  await ouvrir(page, 'portail-devis');
  await expect(page.locator('.page-liste-devis [data-action="ouvrir-vocabulaire"]')).toHaveText('Vocabulaire');
  await capturer(page, info, '3-vocabulaire-portail');
  await page.locator('[data-action="ouvrir-vocabulaire"]').click();
  await expect(page).toHaveURL(/#\/portail-devis\/devis\/vocabulaire$/);
  await page.evaluate(() => { location.hash = '#/devis/liste'; }); // « Espace complet » : changer d'entrée recharge la page, la session reste
  await expect(page.locator('.page-liste-devis [data-action="ouvrir-vocabulaire"]')).toHaveCount(1);
  await expect(page.locator('.page-liste-devis [data-action="ouvrir-bordereau"]')).toHaveCount(1);
});
