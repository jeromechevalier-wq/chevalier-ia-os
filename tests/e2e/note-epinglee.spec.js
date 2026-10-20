// Note épinglée (carte jaune en haut des Points clés) et « Développer tout ».
import { test, expect, attendreCalme, connecter, creerAffaire, ecrireDocument, lireDocument, JEROME } from './outils.js';

const LONG = 'Première ligne importante.\nDeuxième ligne.\nTroisième ligne.\nQuatrième ligne cachée au départ.\nCinquième ligne.';
async function note(id, texte, valeurs = {}) {
  await ecrireDocument(`crm_notes/${id}`, { texte, personneId: null, organisationId: null, affaireId: 'a1', auteur: JEROME, creeLe: new Date(), modifieLe: new Date(), ...valeurs });
}
async function ouvrir(page) { await page.evaluate(() => { location.hash = '#/crm/affaires/a1'; }); await attendreCalme(page); }

test('E1 cas vide : sans note épinglée, les Points clés n\'ont ni carte jaune ni bouton « Développer tout »', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await note('n1', 'Une note simple');
  await connecter(page);
  await ouvrir(page);
  await expect(page.locator('.points-cles')).toContainText('Aucune activité à faire.');
  await expect(page.locator('.note-epinglee')).toHaveCount(0);
  await expect(page.locator('[data-action="developper-tout"]')).toHaveCount(0);
});

test('E2 « Épingler » dans le fil place la note en carte jaune dans les Points clés ; « Désépingler » la retire', async ({ page }, info) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await note('n1', 'Rappeler après le 27 octobre');
  await connecter(page);
  await ouvrir(page);
  await page.locator('.fil-note [data-action="epingler-note"]').click();
  await expect.poll(async () => (await lireDocument('crm_notes/n1')).epinglee).toBe(true);
  await expect(page.locator('.points-cles .note-epinglee')).toContainText('Rappeler après le 27 octobre');
  await expect(page.locator('.fil-note [data-action="desepingler-note"]')).toBeVisible();
  await page.screenshot({ path: `test-results/note-epinglee-${info.project.name}.png`, fullPage: true });
  await page.locator('.points-cles [data-action="desepingler-note"]').click();
  await expect.poll(async () => (await lireDocument('crm_notes/n1')).epinglee).toBe(false);
  await expect(page.locator('.note-epinglee')).toHaveCount(0);
});

test('E3 « Développer tout » : le texte d\'une note épinglée est coupé à 3 lignes, puis entier ; le bouton devient « Réduire tout »', async ({ page }, info) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await note('n1', LONG, { epinglee: true });
  await connecter(page);
  await ouvrir(page);
  const texte = page.locator('.points-cles .note-epinglee .note-texte');
  const hauteur = () => texte.evaluate((el) => Math.round(el.getBoundingClientRect().height));
  const replie = await hauteur();
  await page.locator('[data-action="developper-tout"]').click();
  await expect(page.locator('[data-action="developper-tout"]')).toHaveText('Réduire tout');
  expect(await hauteur()).toBeGreaterThan(replie + 10);
  await page.screenshot({ path: `test-results/note-epinglee-developpee-${info.project.name}.png`, fullPage: true });
  await page.locator('[data-action="developper-tout"]').click();
  await expect(page.locator('[data-action="developper-tout"]')).toHaveText('Développer tout');
  expect(await hauteur()).toBe(replie);
});

test('E4 le message « Aucune activité à faire. » reste affiché sous une note épinglée ; le bouton du fil redevient « Épingler » après la croix', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await note('n1', 'Note importante', { epinglee: true });
  await connecter(page);
  await ouvrir(page);
  await expect(page.locator('.points-cles .note-epinglee')).toHaveCount(1);
  await expect(page.locator('.points-cles')).toContainText('Aucune activité à faire.');
  await page.locator('.points-cles [data-action="desepingler-note"]').click();
  await expect(page.locator('.fil-note [data-action="epingler-note"]')).toHaveText('Épingler');
});

test('E5 note épinglée d\'une affaire vue depuis le projet lié : « note de l\'affaire », sans croix', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await ecrireDocument('projets_projets/pr1', { titre: 'Projet lié', affaireId: 'a1', phase: 'lancement', statut: 'en_cours', personneId: null, organisationId: null, archive: false, etiquettes: [], proprietaire: JEROME, creeLe: new Date(), modifieLe: new Date() });
  await note('n1', 'Épinglée côté affaire', { epinglee: true });
  await connecter(page);
  await page.evaluate(() => { location.hash = '#/projets/projets/pr1'; });
  await attendreCalme(page);
  const carte = page.locator('.points-cles .note-epinglee');
  await expect(carte).toContainText('Épinglée côté affaire');
  await expect(carte).toContainText('note de l’affaire');
  await expect(carte.locator('[data-action="desepingler-note"]')).toHaveCount(0);
});
