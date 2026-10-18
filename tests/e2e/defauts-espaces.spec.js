// Options par défaut des NOUVEAUX espaces (2.11.6) : « Créer un dossier dans Google Drive » et « Célébrations » allumés, « Extraction de valeur » éteinte ;
// la zone « Dossier Drive parent » est sous la case Drive, visible seulement quand elle est cochée. Un booléen déjà enregistré garde la priorité (espace d'Ingrid).
// Un test par critère (D1 à D5) et UNE capture par critère, dans ~/chantiers-crm/captures-defauts-espaces/ (« -tel » pour le format téléphone).
// Google est SIMULÉ (google-simule.js) : on vérifie ce que l'appli demande et enregistre, pas Google lui-même.
import { readFile, mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, ecrireDocument, lireDocument, estTelephone, PROJET, FIRESTORE, URL_APP } from './outils.js';
import { brancherGoogle, debrancherGoogle, choisirDansGoogle, PARENT } from './google-simule.js';

const ALICE = 'alice@exemple.test';
const DOSSIER_CAPTURES = join(homedir(), 'chantiers-crm', 'captures-defauts-espaces');

async function chargerRegles(fichier) {
  const contenu = await readFile(fileURLToPath(new URL(`../../${fichier}`, import.meta.url)), 'utf8');
  const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: fichier, content: contenu }] } }),
  });
  if (!r.ok) throw new Error(`Règles non chargées (${fichier}) : ${await r.text()}`);
}
test.beforeAll(async () => { await mkdir(DOSSIER_CAPTURES, { recursive: true }); await chargerRegles('firestore.plateforme.rules'); });
test.afterAll(() => chargerRegles('firestore.rules'));

test.beforeEach(async () => {
  for (const [client, nom] of [['neuf', 'Espace Neuf'], ['ingrid', 'Espace Ingrid']]) {
    await ecrireDocument(`marques/${client}`, { actif: true, nom, couleur: '#336699' });
    await ecrireDocument(`clients/${client}`, { nom, modules: { affaires: true, projets: true } });
    await ecrireDocument(`clients/${client}/membres/${ALICE}`, { role: 'editeur' });
  }
  // Ingrid : le réglage « boutonsDepot » est écrit à false, noir sur blanc ; « celebrations » est absent.
  await ecrireDocument('clients/ingrid/crm_parametres/reglages', { boutonsDepot: false, suiviPaiements: false, clotureBloquee: true, extractionValeur: false });
});

async function ouvrirReglages(page, client) {
  await page.goto('about:blank');
  await page.goto(`${URL_APP}#/espace/${client}/reglages/crm`);
  await page.waitForFunction(() => !!window.__chevalierTest);
  await page.evaluate((e) => window.__chevalierTest.connecter(e, true), ALICE);
  await expect(page.locator('.coquille')).toBeVisible();
  await expect(page.locator('#reglages-options')).toBeVisible();
}
const capturer = async (page, nom) => page.locator('#reglages-options').screenshot({ path: join(DOSSIER_CAPTURES, `${nom}${estTelephone(page) ? '-tel' : ''}.png`), animations: 'disabled' });
const ligneDrive = (page) => page.locator('[data-ligne="boutonsDepot"]');
const zone = (page) => page.locator('[data-role="zone-dossier-parent"]');

test('D1 un nouvel espace (rien d’enregistré) a « Créer un dossier dans Google Drive » et « Célébrations » cochés, « Extraction de valeur » décochée', async ({ page }) => {
  await ouvrirReglages(page, 'neuf');
  await expect(page.locator('[data-option="boutonsDepot"]')).toBeChecked();
  await expect(page.locator('[data-option="celebrations"]')).toBeChecked();
  await expect(page.locator('[data-option="extractionValeur"]')).not.toBeChecked();
  await expect(page.locator('[data-option="suiviPaiements"]')).not.toBeChecked();
  await expect.poll(async () => { const r = await lireDocument('clients/neuf/crm_parametres/reglages'); return [r?.boutonsDepot, r?.celebrations, r?.extractionValeur]; }).toEqual([true, true, false]);
  await capturer(page, 'D1-options-par-defaut');
});

test('D2 sous la case « Créer un dossier dans Google Drive » cochée, la zone « Dossier Drive parent » est là avec « Choisir dans Google Drive » et « Créé tout seul au premier dossier »', async ({ page, context }) => {
  await brancherGoogle(context);
  await ouvrirReglages(page, 'neuf');
  await expect(zone(page)).toBeVisible();
  await expect(ligneDrive(page).locator('[data-role="zone-dossier-parent"]')).toHaveCount(1); // dans la même ligne que la case : elle est « sous » la case
  await expect(zone(page).locator('[data-role="dossier-parent"]')).toHaveText('Créé tout seul au premier dossier');
  await expect(zone(page).locator('[data-action="choisir-dossier-parent"]')).toBeEnabled();
  await expect(zone(page).locator('[data-action="retirer-dossier-parent"]')).toBeHidden(); // cas vide : rien à retirer
  await capturer(page, 'D2-zone-dossier-parent');
});

test('D3 la zone du dossier parent disparaît quand on décoche la case, et revient quand on la recoche', async ({ page, context }) => {
  await brancherGoogle(context);
  await ouvrirReglages(page, 'neuf');
  await expect(zone(page)).toBeVisible();
  await page.locator('[data-option="boutonsDepot"]').uncheck();
  await expect(zone(page)).toHaveCount(0);
  await expect.poll(async () => (await lireDocument('clients/neuf/crm_parametres/reglages')).boutonsDepot).toBe(false);
  await capturer(page, 'D3-case-decochee');
  await page.locator('[data-option="boutonsDepot"]').check();
  await expect(zone(page)).toBeVisible();
});

test('D4 l’espace d’Ingrid (boutonsDepot=false écrit) reste inchangé : case décochée, pas de zone, le false toujours dans la base ; le champ absent « celebrations » prend la valeur par défaut', async ({ page }) => {
  await ouvrirReglages(page, 'ingrid');
  await expect(page.locator('[data-option="boutonsDepot"]')).not.toBeChecked();
  await expect(zone(page)).toHaveCount(0);
  await expect(page.locator('[data-option="celebrations"]')).toBeChecked(); // absent chez elle : valeur par défaut
  await expect.poll(async () => (await lireDocument('clients/ingrid/crm_parametres/reglages')).celebrations).toBe(true);
  const r = await lireDocument('clients/ingrid/crm_parametres/reglages');
  expect([r.boutonsDepot, r.suiviPaiements, r.extractionValeur, r.clotureBloquee]).toEqual([false, false, false, true]);
  await capturer(page, 'D4-espace-ingrid');
});

test('D5 « Choisir dans Google Drive » dans la zone ouvre la fenêtre Google (dossiers, départ Mon Drive), enregistre le dossier parent et affiche son nom ; « Retirer » le défait', async ({ page, context }) => {
  await brancherGoogle(context);
  await ouvrirReglages(page, 'neuf');
  await choisirDansGoogle(page, [{ id: PARENT, name: 'Clients 2026', url: `https://drive.google.com/drive/folders/${PARENT}`, mimeType: 'application/vnd.google-apps.folder' }]);
  await zone(page).locator('[data-action="choisir-dossier-parent"]').click();
  await expect.poll(async () => (await lireDocument('clients/neuf/crm_parametres/reglages'))?.dossierParentDrive).toEqual({ id: PARENT, nom: 'Clients 2026' });
  await expect(zone(page).locator('[data-role="dossier-parent"]')).toHaveText('Clients 2026');
  await capturer(page, 'D5-dossier-parent-choisi');
  await zone(page).locator('[data-action="retirer-dossier-parent"]').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Retirer' }).click();
  await expect.poll(async () => (await lireDocument('clients/neuf/crm_parametres/reglages'))?.dossierParentDrive).toBeNull();
});

test('D6 Google non branché : la zone reste visible, « Choisir » est grisé, aucune erreur (cas d’erreur)', async ({ page, context }) => {
  await debrancherGoogle(context);
  await ouvrirReglages(page, 'neuf');
  await expect(zone(page)).toBeVisible();
  await expect(zone(page).locator('[data-action="choisir-dossier-parent"]')).toBeDisabled();
  await capturer(page, 'D6-google-non-branche');
});
