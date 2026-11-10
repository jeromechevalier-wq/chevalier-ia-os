// Raccourci « Exporter mes données » dans le menu du portail Devis seul (règle de Jérôme du 27/10/2026 : chaque module a son bouton d'export).
// Emplacement : bas du menu, au-dessus de « Espace complet » (il est dans le tiroir sur téléphone) ; même fonction que Réglages > Devis (exporterDevis).
// Un test par critère (le nom commence par son numéro). Captures : tests/e2e/captures/raccourci-export/.
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, allerA, ecrireDocument, estTelephone, attendreCalme, ouvrirSectionReglages, JEROME, PROJET, FIRESTORE, URL_APP } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/raccourci-export/', import.meta.url));
const capturer = async (page, info, nom) => { mkdirSync(DOSSIER, { recursive: true }); await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' }); };
const ALICE = 'alice@exemple.test';
const LECTEUR = 'lecteur@exemple.test';
async function chargerRegles(fichier) {
  const contenu = await readFile(fileURLToPath(new URL(`../../${fichier}`, import.meta.url)), 'utf8');
  const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: fichier, content: contenu }] } }) });
  if (!r.ok) throw new Error(`Règles non chargées (${fichier}) : ${await r.text()}`);
}
const raccourci = (page) => page.locator('.menu [data-action="exporter-devis"]');
const ouvrirMenu = async (page) => { if (estTelephone(page) && !(await page.locator('.coquille.menu-ouvert').count())) await page.getByRole('button', { name: 'Ouvrir le menu' }).click(); };

test.beforeEach(async ({ page }) => {
  await page.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
});

async function donnees() {
  const t = new Date();
  await ecrireDocument('crm_personnes/p1', { nom: 'Marie Durand', prenom: 'Marie', nomFamille: 'Durand', organisationId: null, telephones: [], emails: [], emailsNormalises: [], etiquettes: [], ville: '', archive: false });
  await ecrireDocument('devis_devis/d1', { racineId: 'd1', version: 1, numero: 'DEV-2026-11-10-001', statut: 'envoye', archive: false, sections: [], envois: [], creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: t, modifieLe: t });
}
async function ouvrirPortail(page) {
  await connecter(page, JEROME, { route: 'portail-devis' });
  await expect(page.locator('.page-liste-devis')).toBeVisible();
  await attendreCalme(page);
}
async function telecharger(page, declencher) {
  const [dl] = await Promise.all([page.waitForEvent('download'), declencher()]);
  return { nom: dl.suggestedFilename(), json: JSON.parse(await readFile(await dl.path(), 'utf8')) };
}

test('1 le raccourci « Exporter mes données » est visible dans le menu du portail sur ordinateur, au-dessus de « Espace complet »', async ({ page }, info) => {
  test.skip(estTelephone(page), 'ordinateur seulement');
  await ouvrirPortail(page);
  await expect(raccourci(page)).toBeVisible();
  await expect(raccourci(page)).toHaveText('Exporter mes données');
  const ordre = await page.locator('.menu-groupe[data-bloc="retour"] > .menu-section > *').evaluateAll((e) => e.map((x) => x.dataset.action ?? x.dataset.role));
  expect(ordre).toEqual(['exporter-devis', 'retour-espace']);
  await expect(raccourci(page).locator('svg')).toHaveCount(1); // l'icône (download) est rendue, comme celle de « Espace complet »
  await expect(page.locator('.menu [data-role="retour-espace"] svg')).toHaveCount(1);
  await expect(page.locator('.menu .menu-entree')).toHaveCount(6); // les cinq entrées + « Espace complet » : le raccourci n'est pas une entrée de menu
  await capturer(page, info, '1-ordinateur-replie');
  await page.locator('[data-role="bascule-menu"]').click(); // menu déplié
  await expect(page.locator('.coquille[data-menu="elargi"]')).toHaveCount(1);
  await expect(raccourci(page)).toBeVisible();
  await expect(raccourci(page)).toContainText('Exporter mes données');
  await capturer(page, info, '1-ordinateur-deplie');
});

test('2 le raccourci est visible dans le tiroir du téléphone, qui se referme avec Échap', async ({ page }, info) => {
  test.skip(!estTelephone(page), 'téléphone seulement');
  await ouvrirPortail(page);
  await ouvrirMenu(page);
  await expect(raccourci(page)).toBeVisible();
  await capturer(page, info, '2-telephone');
  await page.keyboard.press('Escape');
  await expect(page.locator('.coquille.menu-ouvert')).toHaveCount(0);
});

test('3 un clic télécharge le même fichier que Réglages > Devis (un client et un numéro de devis créés dans le test)', async ({ page }, info) => {
  await donnees();
  await ouvrirPortail(page);
  await ouvrirMenu(page);
  const depuisMenu = await telecharger(page, () => raccourci(page).click());
  expect(JSON.stringify(depuisMenu.json)).toContain('Marie Durand');
  expect(JSON.stringify(depuisMenu.json)).toContain('DEV-2026-11-10-001');
  await expect(page.getByText('Sauvegarde téléchargée')).toBeVisible();
  await capturer(page, info, '3-telechargement');
  if (estTelephone(page)) { await page.keyboard.press('Escape'); await expect(page.locator('.coquille.menu-ouvert')).toHaveCount(0); }
  await page.evaluate(() => { location.hash = '#/portail-devis/reglages'; });
  await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible();
  await attendreCalme(page);
  await ouvrirSectionReglages(page, 'Devis');
  const depuisReglages = await telecharger(page, () => page.locator('#reglages-export-devis [data-action="exporter-devis"]').click());
  expect(Object.keys(depuisMenu.json).sort()).toEqual(Object.keys(depuisReglages.json).sort());
  expect(JSON.stringify(depuisMenu.json.collections ?? depuisMenu.json)).toBe(JSON.stringify(depuisReglages.json.collections ?? depuisReglages.json));
  expect(depuisMenu.nom.replace(/\d/g, '0')).toBe(depuisReglages.nom.replace(/\d/g, '0'));
});

test('3b cas d\'erreur : l\'export échoue après un clic sur le vrai bouton -> message clair « Export impossible », rien n\'est téléchargé', async ({ page }) => {
  await ouvrirPortail(page);
  await ouvrirMenu(page);
  await page.evaluate(() => { URL.createObjectURL = () => { throw new Error('refus simulé'); }; }); // le fichier ne peut pas être fabriqué
  let telechargement = false;
  page.on('download', () => { telechargement = true; });
  await raccourci(page).click();
  await expect(page.getByText('Export impossible')).toBeVisible();
  expect(telechargement).toBe(false);
});

test.describe('chez un client (règles de la plateforme)', () => {
  const CLIENT = 'devisseul';
  test.beforeAll(() => chargerRegles('firestore.plateforme.rules'));
  test.afterAll(() => chargerRegles('firestore.rules'));
  test.beforeEach(async () => {
    for (const [id, nom] of [['devisseul', 'Devis Seul'], ['cabinet', 'Cabinet Martin']]) await ecrireDocument(`marques/${id}`, { actif: true, nom, couleur: '#336699', accueil: 'Bienvenue.' });
    await ecrireDocument('clients/devisseul', { modules: { devis: true } });
    await ecrireDocument('clients/cabinet', { modules: { affaires: true } });
    await ecrireDocument(`clients/devisseul/membres/${ALICE}`, { role: 'editeur' });
    await ecrireDocument(`clients/cabinet/membres/${ALICE}`, { role: 'editeur' });
    await ecrireDocument(`clients/devisseul/membres/${LECTEUR}`, { role: 'lecteur' });
    const t = new Date();
    await ecrireDocument('clients/devisseul/crm_personnes/p1', { nom: 'Marie Durand', prenom: 'Marie', nomFamille: 'Durand', organisationId: null, telephones: [], emails: [], emailsNormalises: [], etiquettes: [], ville: '', archive: false, proprietaire: ALICE, creeLe: t, modifieLe: t });
    await ecrireDocument('clients/devisseul/devis_devis/d1', { racineId: 'd1', version: 1, numero: 'DEV-2026-11-10-001', statut: 'envoye', archive: false, sections: [], envois: [], creePar: ALICE, modifiePar: ALICE, proprietaire: ALICE, creeLe: t, modifieLe: t });
  });
  async function ouvrirClient(page, client, reste, compte = ALICE) {
    await page.goto('about:blank');
    await page.goto(`${URL_APP}#/espace/${client}${reste ? `/${reste}` : ''}`);
    await page.waitForFunction(() => !!window.__chevalierTest);
    await page.evaluate((e) => window.__chevalierTest.connecter(e, true), compte);
    await expect(page.locator('.coquille')).toBeVisible();
    await attendreCalme(page);
  }

  test('4 chez un client Devis seul : le raccourci est dans le menu du portail et télécharge ses données (éditeur)', async ({ page }, info) => {
    await ouvrirClient(page, CLIENT, 'portail-devis');
    await ouvrirMenu(page);
    await expect(raccourci(page)).toBeVisible();
    await capturer(page, info, '4-client');
    const f = await telecharger(page, () => raccourci(page).click());
    expect(JSON.stringify(f.json)).toContain('Marie Durand');
    expect(JSON.stringify(f.json)).toContain('DEV-2026-11-10-001');
  });

  test('5 chez un client, rôle lecteur : le raccourci est là et le fichier part (le lecteur lit ses données)', async ({ page }) => {
    await ouvrirClient(page, CLIENT, 'portail-devis', LECTEUR);
    await ouvrirMenu(page);
    await expect(raccourci(page)).toBeVisible();
    const f = await telecharger(page, () => raccourci(page).click());
    expect(JSON.stringify(f.json)).toContain('DEV-2026-11-10-001');
  });

  test('6 le raccourci n\'existe pas hors du portail (espace du client, espace de Jérôme) ni quand Devis n\'est pas actif', async ({ page }) => {
    await ouvrirClient(page, CLIENT, '');
    await ouvrirMenu(page);
    await expect(page.locator('.menu [data-action="exporter-devis"]')).toHaveCount(0);
    await ouvrirClient(page, 'cabinet', 'portail-devis'); // client sans Devis : « Page introuvable », menu vide
    await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
    await expect(page.locator('.menu [data-action="exporter-devis"]')).toHaveCount(0);
  });
});

test('6b chez Jérôme hors portail (#/) le raccourci n\'existe pas', async ({ page }) => {
  await connecter(page, JEROME);
  await ouvrirMenu(page);
  await expect(page.locator('.menu [data-action="exporter-devis"]')).toHaveCount(0);
});
