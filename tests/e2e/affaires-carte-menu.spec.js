// Menu « … » d'une carte d'affaire du tableau de suivi : déplacements, puis Archiver, puis Supprimer définitivement….
// Les captures vont dans tests/e2e/captures/affaires-carte-menu/ (aucune donnée réelle).
import {
  test, expect, attendreCalme, connecter, allerA, creerAffaire, lireDocument, estTelephone,
} from './outils.js';

const CAPTURES = 'e2e/captures/affaires-carte-menu';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
const dialogue = (page) => page.getByRole('dialog');

test.beforeEach(async ({ page }) => {
  await page.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
});

async function ouvrirMenuCarte(page, id) {
  await page.locator('.bascule-vue[data-vue="kanban"]').click();
  await page.locator(`.carte-affaire[data-affaire="${id}"] .carte-menu`).click();
}

test('1 le menu d’une carte d’affaire : déplacements, Perdue…, Archiver, Supprimer définitivement… ; ni « Ouvrir la fiche » ni « Rouvrir »', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas', etape: 'rdv_fixe' });
  await connecter(page);
  await allerA(page, 'Affaires');
  await ouvrirMenuCarte(page, 'a1');
  const noms = (await page.locator('.menu-pop').getByRole('menuitem').allTextContents()).map((t) => t.trim());
  const iPerdue = noms.indexOf('Perdue…');
  expect(iPerdue).toBeGreaterThan(0);
  expect(noms.slice(0, iPerdue).every((n) => n.startsWith('Déplacer vers :'))).toBe(true);
  expect(noms.slice(iPerdue)).toEqual(['Perdue…', 'Archiver', 'Supprimer définitivement…']);
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: /Ouvrir la fiche|Rouvrir/ })).toHaveCount(0);
  await capture(page, '1-menu-carte');
});

test('2 « Archiver » retire la carte du tableau ; l’affaire est dans la vue Archives', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas', etape: 'rdv_fixe' });
  await connecter(page);
  await allerA(page, 'Affaires');
  await ouvrirMenuCarte(page, 'a1');
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Archiver', exact: true }).click();
  await expect(page.locator('.carte-affaire[data-affaire="a1"]')).toHaveCount(0);
  await expect.poll(async () => (await lireDocument('crm_affaires/a1')).archive).toBe(true);
  await page.locator('.bascule-vue[data-vue="archives"]').click();
  await expect(page.locator('tr.ligne-liste[data-id="a1"]')).toBeVisible();
});

test('3 « Supprimer définitivement… » : un titre faux ne supprime rien, le bon titre supprime la carte', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas', etape: 'rdv_fixe' });
  await connecter(page);
  await allerA(page, 'Affaires');
  await ouvrirMenuCarte(page, 'a1');
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Supprimer définitivement…' }).click();
  await expect(dialogue(page)).toContainText('Supprimer définitivement ?');
  await dialogue(page).getByLabel(/pour confirmer/).fill('Autre titre');
  await dialogue(page).getByRole('button', { name: 'Supprimer', exact: true }).click();
  await expect(dialogue(page)).toBeVisible();
  expect(await lireDocument('crm_affaires/a1')).toBeTruthy();
  await dialogue(page).getByLabel(/pour confirmer/).fill('Audit des Lilas');
  await dialogue(page).getByRole('button', { name: 'Supprimer', exact: true }).click();
  await expect(dialogue(page)).toHaveCount(0);
  await expect(page.locator('.carte-affaire[data-affaire="a1"]')).toHaveCount(0);
  await expect(page.getByText('Affaire supprimée')).toBeVisible();
});

test('4 le menu de la vue liste est inchangé : Ouvrir la fiche, Archiver, Supprimer définitivement…', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas', etape: 'rdv_fixe' });
  await connecter(page);
  await allerA(page, 'Affaires');
  await page.locator('.bascule-vue[data-vue="liste"]').click();
  await page.locator('tr.ligne-liste[data-id="a1"]').getByRole('button', { name: /^Actions/ }).click();
  await expect(page.locator('.menu-pop').getByRole('menuitem')).toHaveText(['Ouvrir la fiche', 'Archiver', 'Supprimer définitivement…']);
});
