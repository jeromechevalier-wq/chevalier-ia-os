// Le champ du titre des fiches prend la taille de son texte (pas la moitié de l'écran).
// Les captures vont dans tests/e2e/captures/titre-editable-taille/.
import { fileURLToPath } from 'node:url';
import { test, expect, attendreCalme, connecter, creerAffaire, creerPersonne, creerOrganisation, creerProjet, lireDocument } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/titre-editable-taille/', import.meta.url));
const TITRE_LONG = 'Refonte complète du site web et de la boutique en ligne pour le client avec migration des anciennes données et formation des équipes';
const suffixe = (info) => (info.project.name === 'ordinateur' ? '' : `-${info.project.name}`);
async function ouvrir(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }
const largeurs = async (page) => ({
  champ: (await page.locator('input.titre-editable').boundingBox()).width,
  zone: (await page.locator('.fiche-titre').boundingBox()).width,
});

test.beforeEach(async ({ page }) => {
  await page.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
});

test('1 un titre court donne un champ nettement plus étroit que la zone, un titre long ne la dépasse pas, la largeur suit la frappe et reste juste après rechargement', async ({ page }, info) => {
  await creerAffaire('a1', { titre: 'Audit' });
  await creerAffaire('a2', { titre: TITRE_LONG });
  await connecter(page);
  await ouvrir(page, '#/crm/affaires/a1');
  const champ = page.locator('input.titre-editable');
  await expect.poll(async () => { const l = await largeurs(page); return l.champ < l.zone * 0.6; }).toBe(true);
  await champ.click();
  await page.screenshot({ path: `${DOSSIER}1-court${suffixe(info)}.png` });
  const avant = (await largeurs(page)).champ;
  await champ.fill(TITRE_LONG.slice(0, 40));
  const apres = (await largeurs(page)).champ;
  expect(apres, 'la largeur suit la frappe').toBeGreaterThan(avant + 20);
  await champ.press('Enter');
  await expect.poll(async () => (await lireDocument('crm_affaires/a1')).titre).toBe(TITRE_LONG.slice(0, 40));
  // rechargement : la mesure après montage donne le même résultat
  await page.reload();
  await attendreCalme(page);
  await expect.poll(async () => Math.abs((await largeurs(page)).champ - apres) <= 3).toBe(true);
  // titre long : jamais plus large que la zone, ni sous les boutons de droite
  await ouvrir(page, '#/crm/affaires/a2');
  await expect(champ).toHaveValue(TITRE_LONG);
  await champ.click();
  await expect.poll(async () => { const l = await largeurs(page); return l.champ <= l.zone + 1; }).toBe(true);
  const b = await champ.boundingBox();
  const actions = await page.locator('.fiche-actions').first().boundingBox();
  const chevauche = b.x < actions.x + actions.width && actions.x < b.x + b.width && b.y < actions.y + actions.height && actions.y < b.y + b.height;
  expect(chevauche, 'le champ ne passe pas sous les boutons').toBe(false);
  await page.screenshot({ path: `${DOSSIER}1-long${suffixe(info)}.png` });
});

test('2 au focus le champ garde sa taille ; titre vidé puis blur : la valeur précédente revient sans message', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await connecter(page);
  await ouvrir(page, '#/crm/affaires/a1');
  const champ = page.locator('input.titre-editable');
  await expect(champ).toBeVisible();
  await page.waitForTimeout(200);
  const avant = await champ.boundingBox();
  await champ.click();
  const apres = await champ.boundingBox();
  expect(Math.abs(apres.width - avant.width)).toBeLessThanOrEqual(1);
  expect(Math.abs(apres.height - avant.height)).toBeLessThanOrEqual(1);
  await champ.fill('');
  await champ.press('Enter');
  await expect(champ).toHaveValue('Audit des Lilas');
  await expect(page.locator('.toast')).toHaveCount(0);
  expect((await lireDocument('crm_affaires/a1')).titre).toBe('Audit des Lilas');
});

test('3 les fiches projet, personne et organisation ont aussi un champ à la taille du texte', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Alice Martin' });
  await creerOrganisation('o1', { nom: 'Atelier Lumière' });
  await creerProjet('pr1', { titre: 'Chantier' });
  await connecter(page);
  for (const hash of ['#/crm/personnes/p1', '#/crm/organisations/o1', '#/projets/projets/pr1']) {
    await ouvrir(page, hash);
    await expect(page.locator('input.titre-editable')).toBeVisible();
    await expect.poll(async () => { const l = await largeurs(page); return l.champ < l.zone * 0.6; }, hash).toBe(true);
  }
});

test('4 sur téléphone la zone cliquable fait au moins 44 px et la page ne défile pas à l\'horizontale', async ({ page }, info) => {
  test.skip(info.project.name !== 'telephone', 'téléphone seulement');
  await creerAffaire('a1', { titre: TITRE_LONG });
  await connecter(page);
  await ouvrir(page, '#/crm/affaires/a1');
  const champ = page.locator('input.titre-editable');
  await expect(champ).toBeVisible();
  expect((await champ.boundingBox()).height).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1)).toBe(false);
  await champ.click();
  await page.screenshot({ path: `${DOSSIER}4-telephone-long.png` });
});
