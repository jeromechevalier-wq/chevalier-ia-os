// Modules actifs par client (chantier 7), sur les émulateurs, avec les RÈGLES DE LA PLATEFORME (chargées le temps de ce fichier,
// puis les règles du CRM remises). Un client voit le menu et les écrans de ses seuls modules actifs, sous clients/<client>/…
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, ecrireDocument, estTelephone, PROJET, FIRESTORE, URL_APP } from './outils.js';

const ALICE = 'alice@exemple.test';
const LEA = 'lea@exemple.test';
const BOB = 'bob@exemple.test';

async function chargerRegles(fichier) {
  const contenu = await readFile(fileURLToPath(new URL(`../../${fichier}`, import.meta.url)), 'utf8');
  const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: fichier, content: contenu }] } }),
  });
  if (!r.ok) throw new Error(`Règles non chargées (${fichier}) : ${await r.text()}`);
}

test.beforeAll(() => chargerRegles('firestore.plateforme.rules'));
test.afterAll(() => chargerRegles('firestore.rules'));

function personne(nom) {
  const maintenant = new Date();
  const [prenom, ...reste] = nom.split(' ');
  return {
    nom, prenom, nomFamille: reste.join(' '), organisationId: null, telephones: [], emails: [], emailsNormalises: [], etiquettes: [], roles: ['prospect'],
    dateInterviewJtbd: null, ville: '', linkedin: '', siteWeb: '', source: '', oppositionProspection: false, dateOpposition: null, archive: false,
    proprietaire: ALICE, creeLe: maintenant, modifieLe: maintenant, creePar: ALICE, modifiePar: ALICE,
  };
}

test.beforeEach(async () => {
  for (const [id, nom] of [['cabinet', 'Cabinet Martin'], ['studio', 'Studio Lune'], ['vide', 'Maison Vide'], ['faux', 'Atelier Faux']]) {
    await ecrireDocument(`marques/${id}`, { actif: true, nom, couleur: '#336699', accueil: 'Bienvenue.' });
  }
  await ecrireDocument('clients/cabinet', { modules: { affaires: true, projets: false } });
  await ecrireDocument('clients/studio', { modules: { affaires: true, projets: true } });
  await ecrireDocument('clients/faux', { modules: { projets: true } }); // projets sans affaires : refusé
  // « vide » n'a pas de document clients/vide : aucun module actif
  for (const c of ['cabinet', 'studio', 'vide', 'faux']) await ecrireDocument(`clients/${c}/membres/${ALICE}`, { role: 'editeur' });
  await ecrireDocument(`clients/cabinet/membres/${LEA}`, { role: 'lecteur' });
  await ecrireDocument('clients/studio/membres/' + BOB, { role: 'editeur' });
  await ecrireDocument('clients/cabinet/crm_personnes/p1', personne('Camille Dubois'));
  await ecrireDocument('clients/studio/crm_personnes/p2', personne('Samuel Lefort'));
  await ecrireDocument('crm_personnes/racine1', personne('Racine Secrète')); // CRM de Jérôme : ne doit jamais apparaître chez un client
});

async function ouvrir(page, client, email = ALICE, reste = '') {
  await page.goto('about:blank');
  await page.goto(`${URL_APP}#/espace/${client}${reste ? `/${reste}` : ''}`);
  await page.waitForFunction(() => !!window.__chevalierTest);
  await page.evaluate((e) => window.__chevalierTest.connecter(e, true), email);
}
const menu = (page) => page.locator('.menu');
async function ouvrirMenu(page) {
  if (estTelephone(page)) await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
}

test('R1 un client avec « affaires » seul : menu et écrans du CRM, aucun écran Projets, nom du client', async ({ page }) => {
  await ouvrir(page, 'cabinet');
  await expect(page.locator('.coquille')).toBeVisible();
  await expect(page).toHaveURL(/#\/espace\/cabinet\/crm\/accueil$/);
  await expect(page).toHaveTitle('Cabinet Martin');
  await ouvrirMenu(page);
  for (const lib of ['Accueil', 'Personnes', 'Organisations', 'Affaires', 'Journal']) await expect(menu(page).getByRole('link', { name: lib, exact: true })).toHaveCount(1);
  for (const lib of ['Projets', 'Archives', 'Modèles', 'Réglages']) await expect(menu(page).getByRole('link', { name: lib, exact: true })).toHaveCount(0);
  await expect(menu(page)).toContainText('Cabinet Martin');
  await expect(menu(page)).not.toContainText('Chevalier IA');
  await expect(page.locator('.section-objectifs')).toHaveCount(0); // les objectifs de Jérôme n'existent pas chez un client
});

test('R2 les données sont sous clients/<client> : on voit les personnes du client, jamais celles de la racine ni d\'un autre client', async ({ page }) => {
  await ouvrir(page, 'cabinet');
  await expect(page.locator('.coquille')).toBeVisible();
  await ouvrirMenu(page);
  await menu(page).getByRole('link', { name: 'Personnes', exact: true }).click();
  await expect(page).toHaveURL(/#\/espace\/cabinet\/crm\/personnes$/);
  await expect(page.getByText('Camille Dubois').first()).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Racine Secrète');
  await expect(page.locator('body')).not.toContainText('Samuel Lefort');
  // Un clic sur une fiche reste dans l'espace du client
  await page.getByText('Camille Dubois').first().click();
  await expect(page).toHaveURL(/#\/espace\/cabinet\/crm\/personnes\/p1$/);
});

test('R3 un module non activé est introuvable, même par son adresse directe (avant et après la connexion)', async ({ page }) => {
  await ouvrir(page, 'cabinet', ALICE, 'projets/projets');
  await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
  await expect(page.locator('.liste-projets, .kanban-projets')).toHaveCount(0);
  // changement d'adresse à la main, sans recharger la page
  await page.getByRole('link', { name: "Retour à l'accueil" }).click();
  await expect(page.locator('.coquille')).toBeVisible();
  await page.evaluate(() => { location.hash = '#/espace/cabinet/projets/modeles'; });
  await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
  await page.evaluate(() => { location.hash = '#/espace/cabinet/reglages'; });
  await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
  await page.evaluate(() => { location.hash = '#/espace/cabinet/n-importe-quoi'; });
  await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
});

test('R4 un client avec « affaires » et « projets » : les deux groupes, et les écrans Projets s\'ouvrent', async ({ page }) => {
  await ouvrir(page, 'studio');
  await expect(page.locator('.coquille')).toBeVisible();
  await ouvrirMenu(page);
  for (const lib of ['Personnes', 'Projets', 'Archives', 'Modèles']) await expect(menu(page).getByRole('link', { name: lib, exact: true })).toHaveCount(1);
  await menu(page).getByRole('link', { name: 'Modèles', exact: true }).click();
  await expect(page).toHaveURL(/#\/espace\/studio\/projets\/modeles$/);
  await expect(page.getByRole('heading', { name: 'Page introuvable' })).toHaveCount(0);
  await expect(page.locator('.coquille')).toContainText('Modèles');
  await expect(page.locator('body')).not.toContainText('Camille Dubois');
});

test('R5 « projets » sans « affaires » est refusé : aucun écran, accueil provisoire, rien ne casse', async ({ page }) => {
  await ouvrir(page, 'faux');
  await expect(page.getByText("Aucun écran n'est encore activé dans cet espace.")).toBeVisible();
  await expect(page.locator('.coquille')).toHaveCount(0);
  await page.evaluate(() => { location.hash = '#/espace/faux/projets/projets'; });
  await expect(page.getByText("Aucun écran n'est encore activé dans cet espace.")).toBeVisible();
});

test('R6 un client sans fiche de modules : accueil provisoire actuel (nom, e-mail, rôle, déconnexion)', async ({ page }) => {
  await ouvrir(page, 'vide');
  await expect(page.getByText(`${ALICE} · éditeur`)).toBeVisible();
  await expect(page.getByText("Aucun écran n'est encore activé dans cet espace.")).toBeVisible();
  await expect(page.locator('.coquille')).toHaveCount(0);
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
});

test('R7 un lecteur lit les modules de son client ; un membre d\'un autre client est refusé comme avant', async ({ page }) => {
  await ouvrir(page, 'cabinet', LEA);
  await expect(page.locator('.coquille')).toBeVisible();
  await ouvrirMenu(page);
  await expect(menu(page).getByRole('link', { name: 'Personnes', exact: true })).toHaveCount(1);
  await page.goto('about:blank');
  await ouvrir(page, 'cabinet', BOB); // membre de « studio » seulement
  await expect(page.getByRole('alert')).toHaveText("Ce compte n'a pas accès à cet espace.");
  await expect(page.locator('.coquille')).toHaveCount(0);
});

test('R8 déconnexion depuis le menu : retour à la page de connexion du client, sans fuite d\'écrans', async ({ page }) => {
  await ouvrir(page, 'cabinet');
  await expect(page.locator('.coquille')).toBeVisible();
  await ouvrirMenu(page);
  await menu(page).getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
  await expect(page.locator('.coquille')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('Camille Dubois');
});
