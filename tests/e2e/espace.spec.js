// Page d'un client de la plateforme (#/espace/<client>, chantier 5), sur les émulateurs, avec les RÈGLES DE LA PLATEFORME
// (chargées le temps de ce fichier, puis les règles du CRM sont remises pour les parcours suivants).
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, ecrireDocument, listerDocuments, estTelephone, PROJET, FIRESTORE, URL_APP } from './outils.js';

const ALICE = 'alice@exemple.test';
const ZOE = 'zoe@exemple.test';
const BOB = 'bob@exemple.test';
const REFUS = "Ce compte n'a pas accès à cet espace.";
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');

async function chargerRegles(fichier) {
  const contenu = await readFile(fileURLToPath(new URL(`../../${fichier}`, import.meta.url)), 'utf8');
  const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: fichier, content: contenu }] } }),
  });
  if (!r.ok) throw new Error(`Règles non chargées (${fichier}) : ${await r.text()}`);
}

test.beforeAll(() => chargerRegles('firestore.plateforme.rules'));
test.afterAll(() => chargerRegles('firestore.rules'));

test.beforeEach(async ({ context }) => {
  await context.route('https://images.exemple.test/**', (route) => route.fulfill({ status: 200, body: PNG, headers: { 'Content-Type': 'image/png' } }));
  await ecrireDocument('marques/atelier', {
    actif: true, nom: 'Atelier Dupont', couleur: '#ffe56c', logo: 'https://images.exemple.test/logo.png',
    images: [{ url: 'https://images.exemple.test/batiment.png', alt: "Façade de l'atelier" }, 'https://images.exemple.test/2.png'], accueil: 'Bienvenue dans votre espace.',
  });
  await ecrireDocument('marques/ferme', { actif: true, nom: 'Ferme Martin', couleur: '#224466', accueil: 'Bonjour.' });
  await ecrireDocument('marques/dormant', { actif: false, nom: 'Client dormant' });
  await ecrireDocument(`clients/atelier/membres/${ALICE}`, { role: 'editeur' });
  await ecrireDocument(`clients/ferme/membres/${BOB}`, { role: 'lecteur' });
});

const aller = (page, client) => page.goto(`${URL_APP}#/espace/${client}`);

test('E1 client inconnu, fiche inactive ou adresse mal formée : même page neutre, aucun bouton de connexion', { tag: '@sans-telephone' }, async ({ page }) => {
  for (const client of ['inconnu', 'dormant', 'a%20b']) {
    await page.goto('about:blank');
    await aller(page, client);
    await expect(page.getByRole('heading', { name: 'Espace indisponible' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('Dormant');
  }
});

test('E2 la page prend le nom, le texte, le logo et les images de la fiche ; la couleur claire reste lisible', async ({ page }) => {
  await aller(page, 'Atelier'); // majuscules acceptées
  await expect(page.getByRole('heading', { name: 'Atelier Dupont' })).toBeVisible();
  await expect(page.getByText('Bienvenue dans votre espace.')).toBeVisible();
  await expect(page).toHaveTitle('Atelier Dupont');
  await expect(page.locator('img.espace-fond')).toHaveAttribute('src', 'https://images.exemple.test/batiment.png');
  await expect(page.locator('img.espace-logo')).toBeVisible();
  const bouton = page.getByRole('button', { name: 'Se connecter avec Google' });
  await expect(bouton).toBeVisible();
  const [fond, texte] = await bouton.evaluate((b) => { const s = getComputedStyle(b); return [s.backgroundColor, s.color]; });
  expect(fond).toBe('rgb(255, 229, 108)'); // la couleur de la marque
  expect(texte).toBe('rgb(0, 0, 0)'); // texte noir sur jaune clair : lisible
  const taille = await bouton.boundingBox();
  expect(taille.height).toBeGreaterThanOrEqual(44);
  // Téléphone : rien ne dépasse à droite
  const debordement = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(debordement).toBeLessThanOrEqual(0);
  if (estTelephone(page)) expect(taille.width).toBeLessThanOrEqual(390);
});

test('E3 un membre du client se connecte et arrive sur son accueil ; il peut se déconnecter', async ({ page }) => {
  await aller(page, 'atelier');
  await page.waitForFunction(() => !!window.__chevalierTest);
  await page.evaluate((e) => window.__chevalierTest.connecter(e, true), ALICE);
  await expect(page.getByText('Bonjour', { exact: false })).toBeVisible();
  await expect(page.getByText(`${ALICE} · éditeur`)).toBeVisible();
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
});

test("KPI4 chez un client (base 2) : pas de section « Indicateurs », aucune table d'objectifs lue ni créée", async ({ page }) => {
  await aller(page, 'atelier');
  await page.waitForFunction(() => !!window.__chevalierTest);
  await page.evaluate((e) => window.__chevalierTest.connecter(e, true), ALICE);
  await expect(page.getByText(`${ALICE} · éditeur`)).toBeVisible();
  await expect(page.locator('.grille-objectifs, #reglages-objectifs')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('Indicateurs');
  for (const table of ['os_kpi', 'os_kpi_saisies', 'os_objectifs', 'os_objectifs_saisies']) expect(await listerDocuments(table)).toHaveLength(0);
});

test("E4 refus IDENTIQUE pour un compte inconnu et pour un membre d'un autre client, sans rien révéler", { tag: '@sans-telephone' }, async ({ page }) => {
  const messages = [];
  for (const email of [ZOE, BOB]) {
    await page.goto('about:blank');
    await aller(page, 'atelier');
    await page.waitForFunction(() => !!window.__chevalierTest);
    await page.evaluate((e) => window.__chevalierTest.connecter(e, true), email);
    const alerte = page.getByRole('alert');
    await expect(alerte).toBeVisible();
    messages.push((await alerte.innerText()).trim());
    await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible(); // déconnecté, toujours sur la page de ce client
    await expect(page).toHaveURL(/#\/espace\/atelier$/);
    await expect(page.locator('body')).not.toContainText('Ferme Martin');
  }
  expect(messages[0]).toBe(messages[1]);
  expect(messages[0]).toBe(REFUS);
});

test("E5 le CRM de Jérôme à la racine n'est pas touché : sans lien /espace/, l'écran de connexion habituel s'affiche", { tag: '@sans-telephone' }, async ({ page }) => {
  await page.goto(`${URL_APP}#/crm/accueil`);
  await expect(page.getByRole('heading', { name: 'Chevalier IA OS' })).toBeVisible();
  await expect(page.locator('img.espace-fond')).toHaveCount(0);
});
