// Aides « i » de Réglages > Devis (mode de calcul de la marge, étape des affaires créées). Un test par point (1 à 3), une capture par point dans captures/devis-reglages-aides/.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, allerA, ouvrirSectionReglages } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-reglages-aides/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name === 'telephone' ? 'tel' : 'ordi'}.png`, animations: 'disabled' });
}
async function ouvrirReglagesDevis(page) {
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Devis');
  await expect(page.locator('#reglages-devis')).toBeVisible();
}
const bulle = (page, cle) => page.locator(`[data-reglage="${cle}"] .bouton-info`);

test('1 l’infobulle de la marge détaille le calcul artisan puis le calcul comptable, sur deux lignes, avec l’exemple à 100 €', async ({ page }, info) => {
  await connecter(page);
  await ouvrirReglagesDevis(page);
  await bulle(page, 'modeMarge').click();
  const texte = bulle(page, 'modeMarge').locator('.bulle-info');
  await expect(texte).toBeVisible();
  await expect(texte).toContainText('100 € + 25 % de 100 € = 125 €');
  await expect(texte).toContainText('100 € ÷ 0,75 = 133,33 €');
  const lignes = (await texte.evaluate((n) => n.textContent)).split('\n');
  expect(lignes).toHaveLength(2);
  expect(lignes[0]).toMatch(/^Calcul artisan/);
  expect(lignes[1]).toMatch(/^Calcul comptable/);
  const boite = await texte.boundingBox();
  const vue = page.viewportSize();
  expect(boite.x).toBeGreaterThanOrEqual(0);
  expect(boite.x + boite.width).toBeLessThanOrEqual(vue.width);
  await capturer(page, info, '1-infobulle-marge');
  await page.keyboard.press('Escape');
  await expect(texte).toBeHidden();
});

test('2 l’aide de l’étape des affaires créées dit : « + Créer l’affaire » depuis un devis → elle arrive dans cette étape, sans réglage la liste demande', async ({ page }, info) => {
  await connecter(page);
  await ouvrirReglagesDevis(page);
  await bulle(page, 'etapeAffaireCreee').click();
  const texte = bulle(page, 'etapeAffaireCreee').locator('.bulle-info');
  await expect(texte).toHaveText('Quand tu crées une affaire depuis un devis (« + Créer l’affaire » dans la ligne Affaire), elle arrive dans cette étape. Sans réglage, la liste te demande l’étape.');
  await capturer(page, info, '2-infobulle-etape');
});

test('3 le premier choix de la liste des étapes est « Je choisis à chaque fois »', async ({ page }) => {
  await connecter(page);
  await ouvrirReglagesDevis(page);
  await expect(page.locator('#devis-etapeAffaireCreee option').first()).toHaveText('Je choisis à chaque fois');
});
