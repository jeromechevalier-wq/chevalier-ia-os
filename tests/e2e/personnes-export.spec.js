// Liste Personnes : le bouton d'export ouvre une petite fenêtre « Exporter tout » / « Exporter seulement les modifications » ;
// plus de texte « Dernier export » sous le bouton. Captures (format ordinateur) dans tests/e2e/captures/personnes-export/.
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { test, expect, attendreCalme, connecter, creerPersonne, ecrireDocument, lireDocument } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/personnes-export/', import.meta.url));
async function capturer(page, info, nom) {
  if (info.project.name !== 'ordinateur') return;
  await page.waitForTimeout(500); // fin de l'animation d'ouverture de la fenêtre
  await page.screenshot({ path: `${DOSSIER}${nom}.png` });
}
async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }
const bouton = (page) => page.locator('[data-action="exporter-personnes"]');
const fenetre = (page) => page.getByRole('dialog', { name: 'Exporter les contacts' });
const choixTout = (page) => fenetre(page).getByRole('button', { name: 'Exporter tout', exact: true });
const choixModifs = (page) => fenetre(page).getByRole('button', { name: 'Exporter seulement les modifications', exact: true });
const ilYa = (jours) => new Date(Date.now() - jours * 86400000);
async function reglerDernierExport(date) {
  await ecrireDocument('crm_parametres/reglages', { delaiPaiementJours: 30, debutActivite: '2026-10', dernierExport: new Date(), dernierExportContacts: date });
}
async function ouvrir(page) {
  await connecter(page);
  await aller(page, '#/crm/personnes');
  await bouton(page).click();
  await expect(fenetre(page)).toBeVisible();
}

test('1 le texte « Dernier export » n\'est plus sous le bouton d\'export de la liste Personnes', async ({ page }, info) => {
  await creerPersonne('p1', { nom: 'Alice Test' });
  await reglerDernierExport(ilYa(17));
  await connecter(page);
  await aller(page, '#/crm/personnes');
  await expect(page.locator('.page-actions')).not.toContainText('Dernier export');
  await expect(page.locator('.page-actions')).not.toContainText('Aucun export');
  await expect(page.locator('[data-role="dernier-export-contacts"]')).toHaveCount(0);
  await expect(bouton(page)).toBeVisible();
  await capturer(page, info, '1-bouton-seul');
});

test('2 un clic sur le bouton ouvre la fenêtre avec les deux choix et la date du dernier export en phrase claire', async ({ page }, info) => {
  await creerPersonne('p1', { nom: 'Alice Test', creeLe: ilYa(30), modifieLe: ilYa(30) });
  await creerPersonne('p2', { nom: 'Bob Test', creeLe: ilYa(1) });
  await reglerDernierExport(ilYa(17));
  await ouvrir(page);
  await expect(fenetre(page).locator('[data-role="phrase-export"]')).toHaveText(/^Ton dernier export date du \d{1,2}(er)? \S+ à \d{1,2} h \d{2} \(il y a 1[67] jours\)\.$/);
  await expect(choixTout(page)).toBeEnabled();
  await expect(choixModifs(page)).toBeEnabled();
  await expect(fenetre(page).locator('[data-role="detail-export"]')).toContainText('1 nouveau');
  await capturer(page, info, '2-fenetre-deux-choix');
});

test('3 « Exporter tout » télécharge tous les contacts et note la date de l\'export', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Alice Test', creeLe: ilYa(30), modifieLe: ilYa(30) });
  await creerPersonne('p2', { nom: 'Bob Test', creeLe: ilYa(1) });
  await reglerDernierExport(ilYa(17));
  await ouvrir(page);
  const [vcf] = await Promise.all([page.waitForEvent('download'), choixTout(page).click()]);
  expect(vcf.suggestedFilename()).toMatch(/^chevalier-ia-contacts-\d{4}-\d{2}-\d{2}\.vcf$/);
  const texte = await readFile(await vcf.path(), 'utf8');
  expect(texte.match(/BEGIN:VCARD/g)).toHaveLength(2);
  await expect(fenetre(page)).toHaveCount(0);
  await expect.poll(async () => { const d = (await lireDocument('crm_parametres/reglages')).dernierExportContacts; return d && (Date.now() - new Date(d).getTime()) < 60000; }).toBeTruthy();
});

test('4 « Exporter seulement les modifications » ne télécharge que les contacts nouveaux ou modifiés depuis', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Alice Test', creeLe: ilYa(30), modifieLe: ilYa(30) });
  await creerPersonne('p2', { nom: 'Bob Test', creeLe: ilYa(1) });
  await reglerDernierExport(ilYa(17));
  await ouvrir(page);
  const [vcf] = await Promise.all([page.waitForEvent('download'), choixModifs(page).click()]);
  const texte = await readFile(await vcf.path(), 'utf8');
  expect(texte.match(/BEGIN:VCARD/g)).toHaveLength(1);
  expect(texte).toContain('FN:Bob Test');
});

test('5 cas vide : jamais exporté, phrase « Tu n\'as encore jamais exporté. » et « modifications seulement » grisé', async ({ page }, info) => {
  await creerPersonne('p1', { nom: 'Alice Test' });
  await ouvrir(page);
  await expect(fenetre(page).locator('[data-role="phrase-export"]')).toHaveText("Tu n'as encore jamais exporté.");
  await expect(choixModifs(page)).toBeDisabled();
  await expect(choixTout(page)).toBeEnabled();
  await capturer(page, info, '5-jamais-exporte');
  const [vcf] = await Promise.all([page.waitForEvent('download'), choixTout(page).click()]);
  expect((await readFile(await vcf.path(), 'utf8')).match(/BEGIN:VCARD/g)).toHaveLength(1);
});

test('6 rien n\'a changé depuis le dernier export : la fenêtre le dit, « modifications seulement » est grisé, aucun fichier vide', async ({ page }, info) => {
  await creerPersonne('p1', { nom: 'Alice Test', creeLe: ilYa(30), modifieLe: ilYa(30) });
  await reglerDernierExport(ilYa(2));
  await ouvrir(page);
  await expect(fenetre(page).locator('[data-role="phrase-export"]')).toHaveText(/^Rien n'a changé depuis ton dernier export du \d{1,2}(er)? \S+ à \d{1,2} h \d{2} \((il y a 2 jours|hier)\)\.$/);
  await expect(choixModifs(page)).toBeDisabled();
  await expect(choixTout(page)).toBeEnabled();
  let telecharge = false;
  page.on('download', () => { telecharge = true; });
  await choixModifs(page).click({ force: true }).catch(() => {});
  await page.waitForTimeout(300);
  expect(telecharge).toBe(false);
  await capturer(page, info, '6-rien-n-a-change');
});

test('7 aucun contact : la fenêtre le dit et les deux choix sont grisés', async ({ page }) => {
  await ouvrir(page);
  await expect(fenetre(page).locator('[data-role="detail-export"]')).toHaveText("Tu n'as aucun contact à exporter pour le moment.");
  await expect(choixTout(page)).toBeDisabled();
  await expect(choixModifs(page)).toBeDisabled();
});

test('8 erreur : si le fichier ne peut pas être fabriqué, « Export impossible » s\'affiche, la fenêtre se ferme et la date n\'est pas notée', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Alice Test' });
  await ouvrir(page);
  await page.evaluate(() => { URL.createObjectURL = () => { throw new Error('essai'); }; });
  await choixTout(page).click();
  await expect(page.getByText('Export impossible')).toBeVisible();
  await expect(fenetre(page)).toHaveCount(0);
  expect((await lireDocument('crm_parametres/reglages'))?.dernierExportContacts ?? null).toBeNull();
});

test('9 Échap ou « Annuler » ferme la fenêtre sans rien télécharger', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Alice Test' });
  await ouvrir(page);
  let telecharge = false;
  page.on('download', () => { telecharge = true; });
  await page.keyboard.press('Escape');
  await expect(fenetre(page)).toHaveCount(0);
  await bouton(page).click();
  await fenetre(page).getByRole('button', { name: 'Annuler' }).click();
  await expect(fenetre(page)).toHaveCount(0);
  expect(telecharge).toBe(false);
});
