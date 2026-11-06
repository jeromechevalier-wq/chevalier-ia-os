// Relances, étape 1 : le réglage « Relancer un devis envoyé sans réponse après (jours) » dans Réglages > Devis. Le nom d'un test commence par le numéro du critère.
// Captures dans tests/e2e/captures/devis-relances-reglage/ (ordinateur ET téléphone).
import { fileURLToPath } from 'node:url';
import { test, expect, allerA, connecter, ouvrirSectionReglages, attendreCalme, lireDocument } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-relances-reglage/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: true, animations: 'disabled' });

async function ouvrirReglagesDevis(page) {
  await connecter(page);
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Devis');
  await expect(page.locator('#reglages-devis')).toBeVisible();
}

test('8 Réglages > Devis montre le délai de relance à 10, juste après la durée de validité, avec son libellé et son aide', async ({ page }, info) => {
  await ouvrirReglagesDevis(page);
  await expect(page.locator('#devis-delaiRelanceJours')).toHaveValue('10');
  await expect(page.locator('[data-reglage="delaiRelanceJours"] label')).toContainText('Relancer un devis envoyé sans réponse après (jours)');
  const ordre = await page.locator('[data-reglage]').evaluateAll((els) => els.map((e) => e.dataset.reglage));
  expect(ordre.indexOf('delaiRelanceJours')).toBe(ordre.indexOf('dureeValiditeJours') + 1);
  await capturer(page, info, '8-champ');
});

test('9 taper 15 puis « Enregistrer » écrit delaiRelanceJours = 15 ; après rechargement le champ dit 15', async ({ page }, info) => {
  await ouvrirReglagesDevis(page);
  await page.locator('#devis-delaiRelanceJours').fill('15');
  const enregistrer = page.locator('[data-action="enregistrer-reglages-devis"]');
  await expect(enregistrer).toBeEnabled();
  await enregistrer.click();
  await expect(page.locator('.toast', { hasText: 'Réglages des devis enregistrés' })).toBeVisible();
  expect((await lireDocument('devis_parametres/reglages')).delaiRelanceJours).toBe(15);
  await page.reload();
  await attendreCalme(page);
  await expect(page.locator('#reglages-devis')).toBeVisible();
  await expect(page.locator('#devis-delaiRelanceJours')).toHaveValue('15');
  await capturer(page, info, '9-enregistre');
});

test('10 cas d’erreur : 90 avec une validité de 90 est refusé sous le champ, rien n’est écrit ; corrigé en 15 l’enregistrement passe', async ({ page }, info) => {
  await ouvrirReglagesDevis(page);
  await page.locator('#devis-delaiRelanceJours').fill('90');
  const enregistrer = page.locator('[data-action="enregistrer-reglages-devis"]');
  await enregistrer.click();
  await expect(page.locator('[data-erreur="delaiRelanceJours"]')).toHaveText('Le délai de relance doit être plus court que la durée de validité du devis (ici 90 jours).');
  expect(await lireDocument('devis_parametres/reglages')).toBeNull();
  await capturer(page, info, '10-erreur');
  await page.locator('#devis-delaiRelanceJours').fill('15');
  await enregistrer.click();
  await expect(page.locator('.toast', { hasText: 'Réglages des devis enregistrés' })).toBeVisible();
  await expect(page.locator('[data-erreur="delaiRelanceJours"]')).toHaveText('');
  expect((await lireDocument('devis_parametres/reglages')).delaiRelanceJours).toBe(15);
});
