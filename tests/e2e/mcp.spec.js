// Module « Accès MCP » dans le navigateur, sur les émulateurs et avec les RÈGLES DE LA PLATEFORME : page d'information en lecture seule
// (lien de connexion, mode d'emploi, membres et rôles, lien vers le Journal des modifications). Un module éteint n'est pas accessible.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, ecrireDocument, PROJET, FIRESTORE, URL_APP } from './outils.js';

const ALICE = 'alice@exemple.test'; // éditrice chez « cabinet »
const LEA = 'lea@exemple.test'; // lectrice chez « cabinet »
const BOB = 'bob@exemple.test'; // éditeur chez « studio » seulement

async function chargerRegles(fichier) {
  const contenu = await readFile(fileURLToPath(new URL(`../../${fichier}`, import.meta.url)), 'utf8');
  const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: fichier, content: contenu }] } }),
  });
  if (!r.ok) throw new Error(`Règles non chargées (${fichier}) : ${await r.text()}`);
}
test.beforeAll(() => chargerRegles('firestore.plateforme.rules'));
test.afterAll(() => chargerRegles('firestore.rules'));

test.beforeEach(async () => {
  for (const [id, nom] of [['cabinet', 'Cabinet Martin'], ['studio', 'Studio Lune'], ['sansmcp', 'Sans MCP'], ['seulmcp', 'Seul MCP']]) {
    await ecrireDocument(`marques/${id}`, { actif: true, nom, couleur: '#336699', accueil: 'Bienvenue.' });
  }
  await ecrireDocument('clients/cabinet', { modules: { affaires: true, mcp: true } });
  await ecrireDocument('clients/studio', { modules: { affaires: true, mcp: true } });
  await ecrireDocument('clients/sansmcp', { modules: { affaires: true, mcp: false } });
  await ecrireDocument('clients/seulmcp', { modules: { mcp: true } });
  await ecrireDocument(`clients/cabinet/membres/${ALICE}`, { role: 'editeur', nom: 'Alice Martin' });
  await ecrireDocument(`clients/cabinet/membres/${LEA}`, { role: 'lecteur' });
  await ecrireDocument(`clients/studio/membres/${BOB}`, { role: 'editeur' });
  await ecrireDocument(`clients/sansmcp/membres/${ALICE}`, { role: 'editeur' });
  await ecrireDocument(`clients/seulmcp/membres/${ALICE}`, { role: 'editeur' });
});

async function ouvrir(page, client, route, email = ALICE) {
  await page.goto('about:blank');
  await page.goto(`${URL_APP}#/espace/${client}${route ? `/${route}` : ''}`);
  await page.waitForFunction(() => !!window.__chevalierTest);
  await page.evaluate((e) => window.__chevalierTest.connecter(e, true), email);
  await expect(page.locator('.coquille')).toBeVisible();
}

test('MCP1 la page montre le lien du client, le mode d\'emploi en trois lignes, les membres avec leur rôle, et rien d\'un autre client', async ({ page }) => {
  await ouvrir(page, 'cabinet', 'mcp/infos');
  await expect(page.locator('h1')).toHaveText('Connecter ton assistant');
  const lien = page.locator('input.mcp-lien');
  await expect(lien).toHaveValue(/\/mcp\/cabinet$/);
  expect(await lien.inputValue()).toBe(`${new URL(page.url()).origin}/mcp/cabinet`);
  await expect(page.locator('.mcp-etapes li')).toHaveCount(3);
  const membres = page.locator('.mcp-membre');
  await expect(membres).toHaveCount(2);
  await expect(membres.filter({ hasText: 'Alice Martin' })).toContainText('(toi)');
  await expect(membres.filter({ hasText: 'Alice Martin' })).toContainText('Éditeur : consulte et modifie');
  await expect(membres.filter({ hasText: LEA })).toContainText('Lecteur : consulte seulement');
  await expect(page.locator('.page-mcp')).not.toContainText(BOB);
  await expect(page.locator('.page-mcp a', { hasText: 'Journal des modifications' })).toHaveAttribute('href', /#\/espace\/cabinet\/crm\/journal$/);
});

test('MCP2 un lecteur voit la même page ; la page n\'a aucun champ à modifier à part le lien copiable', async ({ page }) => {
  await ouvrir(page, 'cabinet', 'mcp/infos', LEA);
  await expect(page.locator('.mcp-membre').filter({ hasText: LEA })).toContainText('(toi)');
  await expect(page.locator('.page-mcp input:not([readonly]), .page-mcp textarea, .page-mcp select')).toHaveCount(0);
  await expect(page.locator('.page-mcp button')).toHaveCount(1); // « Copier le lien »
});

test('MCP3 module éteint : la page est introuvable, même par son adresse ; module seul : il est l\'accueil du client', async ({ page }) => {
  await ouvrir(page, 'sansmcp', 'mcp/infos');
  await expect(page.locator('.page-introuvable')).toBeVisible();
  await expect(page.locator('.page-mcp')).toHaveCount(0);
  await ouvrir(page, 'seulmcp', '');
  await expect(page).toHaveURL(/#\/espace\/seulmcp\/mcp\/infos$/);
  await expect(page.locator('.page-mcp a', { hasText: 'Journal des modifications' })).toHaveCount(0);
  await expect(page.locator('.page-mcp')).toContainText("Le Journal des modifications n'est pas activé");
});

test('MCP4 un compte d\'un autre client ne voit pas la page de celui-ci', async ({ page }) => {
  await ouvrir(page, 'cabinet', 'mcp/infos', BOB).catch(() => {});
  await expect(page.locator('.page-mcp')).toHaveCount(0);
});
