// « Exporter mes données » et « Espace complet » dans le MENU DU COMPTE du portail Devis seul (règle du 27/10/2026 : chaque module a son bouton d'export ; déplacés du menu latéral le 10/11/2026).
// Menu du compte = clic sur le nom en bas du menu (au-dessus de « Se déconnecter ») ; même fonction que Réglages > Devis (exporterDevis).
// Un test par critère (le nom commence par son numéro). Captures : tests/e2e/captures/raccourci-export/.
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, allerA, ecrireDocument, estTelephone, ouvrirMenuUtilisateur, attendreCalme, ouvrirSectionReglages, JEROME, PROJET, FIRESTORE, URL_APP } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/raccourci-export/', import.meta.url));
const capturer = async (page, info, nom) => { mkdirSync(DOSSIER, { recursive: true }); await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' }); };
const ALICE = 'alice@exemple.test';
const LECTEUR = 'lecteur@exemple.test';
async function chargerRegles(fichier) {
  const contenu = await readFile(fileURLToPath(new URL(`../../${fichier}`, import.meta.url)), 'utf8');
  const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: fichier, content: contenu }] } }) });
  if (!r.ok) throw new Error(`Règles non chargées (${fichier}) : ${await r.text()}`);
}
const entree = (page, nom) => page.locator('.menu-pop').getByRole('menuitem', { name: nom, exact: true });
const raccourci = (page) => entree(page, 'Exporter mes données');
// Ouvre le menu du compte, puis déclenche l'entrée `nom` (menu fermé automatiquement par l'entrée).
const depuisCompte = async (page, nom) => { await ouvrirMenuUtilisateur(page); await entree(page, nom).click(); };
const exporter = (page) => depuisCompte(page, 'Exporter mes données');
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

test('1 portail ordinateur : le menu latéral n\'a plus « Espace complet » ni « Exporter mes données » ; le menu du compte contient les deux avant « Se déconnecter »', async ({ page }, info) => {
  test.skip(estTelephone(page), 'ordinateur seulement');
  await ouvrirPortail(page);
  await expect(page.locator('.menu [data-action="exporter-devis"], .menu [data-role="retour-espace"], .menu-action')).toHaveCount(0);
  await expect(page.locator('.menu .menu-entree')).toHaveCount(5); // les cinq entrées seulement
  await ouvrirMenuUtilisateur(page);
  await expect(page.locator('.menu-pop').getByRole('menuitem')).toHaveText(['Réglages', 'Exporter mes données', 'Espace complet', 'Voir le journal des modifications', /Thème (clair|sombre)/, 'Se déconnecter']);
  await expect(raccourci(page).locator('svg :is(path, rect, circle, line, polyline)').first()).toBeAttached(); // les icônes sont réellement dessinées
  await expect(entree(page, 'Espace complet').locator('svg :is(path, rect, circle, line, polyline)').first()).toBeAttached();
  await capturer(page, info, '1-ordinateur');
});

test('2 téléphone : ni l\'export ni « Espace complet » dans le tiroir ; le menu du compte contient les deux', async ({ page }, info) => {
  test.skip(!estTelephone(page), 'téléphone seulement');
  await ouvrirPortail(page);
  await ouvrirMenu(page);
  await expect(page.locator('.menu [data-action="exporter-devis"], .menu [data-role="retour-espace"]')).toHaveCount(0);
  await ouvrirMenuUtilisateur(page);
  await expect(raccourci(page)).toBeVisible();
  await expect(entree(page, 'Espace complet')).toBeVisible();
  await capturer(page, info, '2-telephone');
  await page.keyboard.press('Escape'); // ferme le menu du compte
  await page.keyboard.press('Escape'); // ferme le tiroir
  await expect(page.locator('.coquille.menu-ouvert')).toHaveCount(0);
});

test('3 un clic sur « Exporter mes données » du menu du compte télécharge le même fichier que Réglages > Devis (un client et un numéro de devis créés dans le test)', async ({ page }, info) => {
  await donnees();
  await ouvrirPortail(page);
  const depuisMenu = await telecharger(page, () => exporter(page));
  expect(JSON.stringify(depuisMenu.json)).toContain('Marie Durand');
  expect(JSON.stringify(depuisMenu.json)).toContain('DEV-2026-11-10-001');
  await expect(page.getByText('Sauvegarde téléchargée')).toBeVisible();
  await capturer(page, info, '3-telechargement');
  if (estTelephone(page) && await page.locator('.coquille.menu-ouvert').count()) { await page.keyboard.press('Escape'); await expect(page.locator('.coquille.menu-ouvert')).toHaveCount(0); }
  await page.evaluate(() => { location.hash = '#/portail-devis/reglages'; });
  await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible();
  await attendreCalme(page);
  await ouvrirSectionReglages(page, 'Devis');
  const depuisReglages = await telecharger(page, () => page.locator('#reglages-export-devis [data-action="exporter-devis"]').click());
  expect(Object.keys(depuisMenu.json).sort()).toEqual(Object.keys(depuisReglages.json).sort());
  expect(JSON.stringify(depuisMenu.json.collections ?? depuisMenu.json)).toBe(JSON.stringify(depuisReglages.json.collections ?? depuisReglages.json));
  expect(depuisMenu.nom.replace(/\d/g, '0')).toBe(depuisReglages.nom.replace(/\d/g, '0'));
});

test('3b cas d\'erreur : l\'export échoue après un clic dans le menu du compte -> message clair « Export impossible », rien n\'est téléchargé', async ({ page }) => {
  await ouvrirPortail(page);
  await page.evaluate(() => { URL.createObjectURL = () => { throw new Error('refus simulé'); }; }); // le fichier ne peut pas être fabriqué
  let telechargement = false;
  page.on('download', () => { telechargement = true; });
  await exporter(page);
  await expect(page.getByText('Export impossible')).toBeVisible();
  expect(telechargement).toBe(false);
});

test('4 chez Jérôme : « Espace complet » du menu du compte mène à l\'espace complet (#/devis/liste), page rechargée', async ({ page }) => {
  await ouvrirPortail(page);
  await depuisCompte(page, 'Espace complet');
  await expect(page).toHaveURL(/#\/devis\/liste$/);
  await expect(page.locator('.page-liste-devis')).toBeVisible();
  await expect.poll(() => page.locator('.menu .menu-entree').count()).toBe(10); // menu complet (10 entrées, dont Réseaux sociaux) : la page a bien rechargé
  await attendreCalme(page);
  await ouvrirMenuUtilisateur(page); // hors portail : plus aucune des deux entrées
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: /Exporter mes données|Espace complet/ })).toHaveCount(0);
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

  test('4 chez un client Devis seul : l\'export et « Espace complet » sont dans le menu du compte (éditeur) ; l\'export télécharge ses données ; « Espace complet » mène à son espace complet', async ({ page }, info) => {
    await ouvrirClient(page, CLIENT, 'portail-devis');
    await expect(page.locator('.menu [data-action="exporter-devis"], .menu [data-role="retour-espace"]')).toHaveCount(0);
    await ouvrirMenuUtilisateur(page);
    await expect(raccourci(page)).toBeVisible();
    await expect(entree(page, 'Espace complet')).toBeVisible();
    await capturer(page, info, '4-client');
    await page.keyboard.press('Escape');
    const f = await telecharger(page, () => exporter(page));
    expect(JSON.stringify(f.json)).toContain('Marie Durand');
    expect(JSON.stringify(f.json)).toContain('DEV-2026-11-10-001');
    await depuisCompte(page, 'Espace complet');
    await expect(page).toHaveURL(/#\/espace\/devisseul\/devis\/liste$/);
    await expect(page.locator('.page-liste-devis')).toBeVisible();
  });

  test('5 chez un client, rôle lecteur : les deux entrées sont là, le fichier part et « Espace complet » fonctionne', async ({ page }) => {
    await ouvrirClient(page, CLIENT, 'portail-devis', LECTEUR);
    const f = await telecharger(page, () => exporter(page));
    expect(JSON.stringify(f.json)).toContain('DEV-2026-11-10-001');
    await depuisCompte(page, 'Espace complet');
    await expect(page).toHaveURL(/#\/espace\/devisseul\/devis\/liste$/);
  });

  test('5c hors portail (espace du client) et client sans Devis : aucune de ces deux entrées dans le menu du compte', async ({ page }) => {
    await ouvrirClient(page, CLIENT, '');
    await ouvrirMenuUtilisateur(page);
    await expect(page.locator('.menu-pop').getByRole('menuitem', { name: /Exporter mes données|Espace complet/ })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await ouvrirClient(page, 'cabinet', 'portail-devis'); // client sans Devis : « Page introuvable », menu vide
    await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
    await ouvrirMenuUtilisateur(page);
    await expect(page.locator('.menu-pop').getByRole('menuitem', { name: /Exporter mes données/ })).toHaveCount(0);
  });
  test('7 espace d\'un client avec Devis (éditeur ET lecteur) : « Portail devis » juste après « Réglages » mène au portail DU CLIENT', async ({ page }, info) => {
    for (const compte of [ALICE, LECTEUR]) {
      await ouvrirClient(page, CLIENT, 'devis/liste', compte);
      await ouvrirMenuUtilisateur(page);
      const noms = (await page.locator('.menu-pop').getByRole('menuitem').allTextContents()).map((t) => t.trim());
      expect(noms.slice(0, 2), compte).toEqual(['Réglages', 'Portail devis']);
      if (compte === ALICE) await capturer(page, info, '7-client-portail');
      await entree(page, 'Portail devis').click();
      await expect(page).toHaveURL(/#\/espace\/devisseul\/portail-devis(\/devis\/liste)?$/);
      await expect(page.locator('.page-liste-devis')).toBeVisible();
      await expect.poll(() => page.locator('.menu .menu-entree').count()).toBe(5); // le portail a rechargé la page
      await attendreCalme(page);
      await ouvrirMenuUtilisateur(page); // dans le portail lui-même : pas de « Portail devis »
      await expect(entree(page, 'Portail devis')).toHaveCount(0);
      await expect(entree(page, 'Espace complet')).toBeVisible();
      await page.keyboard.press('Escape');
    }
  });

  test('8 espace d\'un client sans le module Devis : pas d\'entrée « Portail devis »', async ({ page }) => {
    await ouvrirClient(page, 'cabinet', '');
    await ouvrirMenuUtilisateur(page);
    await expect(page.locator('.menu-pop').getByRole('menuitem', { name: 'Réglages' })).toBeVisible();
    await expect(entree(page, 'Portail devis')).toHaveCount(0);
  });
});

test('5b hors portail chez Jérôme (#/) : aucune de ces deux entrées dans le menu du compte', async ({ page }) => {
  await connecter(page, JEROME);
  await ouvrirMenuUtilisateur(page);
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: /Exporter mes données|Espace complet/ })).toHaveCount(0);
});

test('10 verrou : les icônes de « Espace complet » (layout-dashboard), de l\'export (download) et de « Portail devis » (file-text) existent dans ICONES', async () => {
  const src = await readFile(fileURLToPath(new URL('../../js/os/ui.js', import.meta.url)), 'utf8');
  for (const nom of ['layout-dashboard', 'download', 'file-text']) expect(src, nom).toMatch(new RegExp(`['"]?${nom}['"]?\\s*:`));
});

test('6 espace complet de Jérôme : « Portail devis » juste après « Réglages » mène à #/portail-devis ; téléphone : présente dans le menu du compte (9)', async ({ page }, info) => {
  await connecter(page, JEROME);
  await ouvrirMenuUtilisateur(page);
  const noms = (await page.locator('.menu-pop').getByRole('menuitem').allTextContents()).map((t) => t.trim());
  expect(noms.slice(0, 2)).toEqual(['Réglages', 'Portail devis']);
  await expect(entree(page, 'Portail devis').locator('svg :is(path, rect, circle, line, polyline)').first()).toBeAttached();
  await capturer(page, info, '6-espace-complet'); // ordinateur ; en projet téléphone, c'est la capture du critère 9
  await entree(page, 'Portail devis').click();
  await expect(page).toHaveURL(/#\/portail-devis(\/devis\/liste)?$/);
  await expect(page.locator('.page-liste-devis')).toBeVisible();
});
