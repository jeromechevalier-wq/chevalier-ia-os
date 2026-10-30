// Réglage « Étape des affaires créées depuis un devis » (Réglages > Devis). Un test par point (le nom commence par E1 à E4), une capture par point dans captures/devis-etape-affaire-creee/.
import { fileURLToPath } from 'node:url';
import {
  test, expect, connecter, allerA, ouvrirSectionReglages, ecrireDocument, lireDocument,
} from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-etape-affaire-creee/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name === 'telephone' ? 'tel' : 'ordi'}.png`, fullPage: true, animations: 'disabled' });
}
async function ouvrirReglagesDevis(page) {
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Devis');
  await expect(page.locator('#reglages-devis')).toBeVisible();
}
const champ = (page) => page.locator('#devis-etapeAffaireCreee');
const enregistrer = (page) => page.locator('[data-action="enregistrer-reglages-devis"]');

test('E1 la liste propose « Non réglée » en premier puis les étapes actives ; par défaut rien n\'est choisi', async ({ page }, info) => {
  await connecter(page);
  await ouvrirReglagesDevis(page);
  await expect(page.locator('#reglages-devis')).toContainText('Étape des affaires créées depuis un devis');
  await expect(champ(page)).toHaveValue('');
  const options = await champ(page).locator('option').allTextContents();
  expect(options[0]).toBe('Non réglée (je choisis à chaque fois)');
  expect(options.length).toBeGreaterThan(1);
  await expect(enregistrer(page)).toBeDisabled(); // rien n'est écrit tant qu'on n'enregistre pas
  await capturer(page, info, 'E1-liste');
});

test('E2 choisir une étape l\'enregistre et la relit, sans perdre les autres réglages ; changer un autre réglage ne perd pas l\'étape', async ({ page }, info) => {
  await connecter(page);
  await ouvrirReglagesDevis(page);
  const second = (await champ(page).locator('option').nth(1).getAttribute('value'));
  await page.locator('#devis-dureeValiditeJours').fill('45');
  await champ(page).selectOption(second);
  await enregistrer(page).click();
  await expect.poll(async () => (await lireDocument('devis_parametres/reglages'))?.etapeAffaireCreee).toBe(second);
  expect(await lireDocument('devis_parametres/reglages')).toMatchObject({ dureeValiditeJours: 45, etapeAffaireCreee: second });
  await page.reload();
  await ouvrirReglagesDevis(page);
  await expect(champ(page)).toHaveValue(second);
  await page.locator('#devis-dureeValiditeJours').fill('30');
  await enregistrer(page).click();
  await expect.poll(async () => (await lireDocument('devis_parametres/reglages'))?.dureeValiditeJours).toBe(30);
  expect((await lireDocument('devis_parametres/reglages')).etapeAffaireCreee).toBe(second);
  await capturer(page, info, 'E2-etape-choisie');
});

test('E3 une étape enregistrée mais disparue reste visible « (étape disparue) », sans erreur, et n\'est pas effacée de la base', async ({ page }, info) => {
  await connecter(page);
  await ouvrirReglagesDevis(page);
  await champ(page).selectOption('');
  await page.locator('#devis-dureeValiditeJours').fill('50');
  await enregistrer(page).click();
  await expect.poll(async () => (await lireDocument('devis_parametres/reglages'))?.dureeValiditeJours).toBe(50);
  const r = await lireDocument('devis_parametres/reglages');
  await ecrireDocument('devis_parametres/reglages', { ...r, etapeAffaireCreee: 'etape_supprimee' });
  await page.reload();
  await ouvrirReglagesDevis(page);
  await expect(champ(page)).toHaveValue('etape_supprimee');
  await expect(champ(page).locator('option:checked')).toHaveText('etape_supprimee (étape disparue)');
  await page.locator('#devis-dureeValiditeJours').fill('55');
  await enregistrer(page).click();
  await expect.poll(async () => (await lireDocument('devis_parametres/reglages'))?.dureeValiditeJours).toBe(55);
  expect((await lireDocument('devis_parametres/reglages')).etapeAffaireCreee).toBe('etape_supprimee');
  await expect(page.locator('[data-erreur="general"]')).toHaveText('');
  await capturer(page, info, 'E3-etape-disparue');
});

test('E4 cas vide : aucune étape active, la liste ne montre que « Non réglée » et la phrase « Aucune étape dans le pipeline »', async ({ page }, info) => {
  await connecter(page);
  // les six emplacements de départ de Jérôme, tous éteints
  const item = (id) => ({ id, libelle: id, description: '', couleur: '#999999', actif: false, action: null });
  await ecrireDocument('crm_parametres/etapes', { items: ['premier_contact', 'rdv_fixe', 'proposition_envoyee', 'gagne', 'etape_5', 'etape_6'].map(item), roleGagnee: 'gagne' });
  await ouvrirReglagesDevis(page);
  await expect(champ(page).locator('option')).toHaveText(['Non réglée (je choisis à chaque fois)']);
  await expect(page.locator('[data-zone="etape-affaire-creee-vide"]')).toHaveText('Aucune étape dans le pipeline');
  await capturer(page, info, 'E4-aucune-etape');
});
