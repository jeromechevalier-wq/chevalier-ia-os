// PR B (18/10/2026), chez un client de la plateforme (règles de la plateforme chargées le temps du fichier). Points 1, 3, 5 et 6 vus chez un client.
// Captures dans ~/chantiers-crm/captures-menu-B/ (« -tel » pour le format téléphone).
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { test, expect, ecrireDocument, estTelephone, ouvrirMenuUtilisateur, PROJET, FIRESTORE, URL_APP } from './outils.js';

const ALICE = 'alice@exemple.test';
const DOSSIER = join(homedir(), 'chantiers-crm', 'captures-menu-B');

async function chargerRegles(fichier) {
  const contenu = await readFile(fileURLToPath(new URL(`../../${fichier}`, import.meta.url)), 'utf8');
  const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: fichier, content: contenu }] } }),
  });
  if (!r.ok) throw new Error(`Règles non chargées (${fichier}) : ${await r.text()}`);
}
test.beforeAll(() => chargerRegles('firestore.plateforme.rules'));
test.afterAll(() => chargerRegles('firestore.rules'));

async function capture(page, nom, options = {}) {
  await mkdir(DOSSIER, { recursive: true });
  await page.screenshot({ path: join(DOSSIER, `${nom}${estTelephone(page) ? '-tel' : ''}.png`), animations: 'disabled', ...options });
}

test.beforeEach(async () => {
  for (const [id, nom, modules] of [
    ['seul', 'Cabinet Seul', { affaires: true, projets: false }],
    ['assistant', 'Studio Assistant', { affaires: true, projets: true, mcp: true }],
    ['soloassistant', 'Atelier Assistant', { mcp: true }],
  ]) {
    await ecrireDocument(`marques/${id}`, { actif: true, nom, couleur: '#336699', accueil: 'Bienvenue.' });
    await ecrireDocument(`clients/${id}/membres/${ALICE}`, { role: 'editeur' });
    await ecrireDocument(`clients/${id}`, { modules, equipe: [{ email: ALICE, role: 'editeur' }] });
  }
});

async function ouvrir(page, client, reste = '') {
  await page.goto('about:blank');
  await page.goto(`${URL_APP}#/espace/${client}${reste ? `/${reste}` : ''}`);
  await page.waitForFunction(() => !!window.__chevalierTest);
  await page.evaluate((e) => window.__chevalierTest.connecter(e, true), ALICE);
  await expect(page.locator('.coquille')).toBeVisible();
}
async function deplier(page) {
  if (estTelephone(page)) { if (!(await page.locator('.coquille.menu-ouvert').count())) await page.getByRole('button', { name: 'Ouvrir le menu' }).click(); return; }
  const elargir = page.getByRole('button', { name: 'Élargir le menu' });
  if (await elargir.count()) await elargir.click();
}

test('1 client « affaires seules » : pas de titre de groupe, deux lignes de séparation seulement (Projets éteint), Journal et Réglages hors du menu', async ({ page }) => {
  await ouvrir(page, 'seul');
  await deplier(page);
  await expect(page.locator('.menu .menu-groupe-titre')).toHaveCount(0);
  await expect(page.locator('.menu .menu-entree')).toHaveText(['Accueil', 'Personnes', 'Organisations', 'Affaires']);
  await expect(page.locator('.menu .menu-section')).toHaveCount(3);
  await expect(page.locator('.menu').getByRole('link', { name: /Journal|Réglages|assistant/i })).toHaveCount(0);
  await capture(page, '1-client-affaires-seules');
});

test('1 cas limite : un client qui n’a que l’assistant n’a aucune entrée ni séparation dans le menu principal, et son menu utilisateur marche', async ({ page }) => {
  await ouvrir(page, 'soloassistant');
  await deplier(page);
  await expect(page).toHaveURL(/#\/espace\/soloassistant\/mcp\/infos$/); // premier écran = la page de l'assistant
  await expect(page.locator('.menu .menu-entree')).toHaveCount(0);
  await expect(page.locator('.menu .menu-section, .menu .menu-groupe')).toHaveCount(0);
  await ouvrirMenuUtilisateur(page);
  await expect(page.locator('.menu-pop').getByRole('menuitem')).toHaveText(['Réglages', 'Connecter mon assistant', /Thème/, 'Se déconnecter']);
});

test('3 menu utilisateur chez un client : Réglages, Journal et « Connecter mon assistant » (si le module est allumé) mènent aux pages de l’espace', async ({ page }) => {
  await ouvrir(page, 'assistant');
  await deplier(page);
  await ouvrirMenuUtilisateur(page);
  await expect(page.locator('.menu-pop-texte')).toHaveCount(0); // chez un client le nom du compte est son e-mail : pas de ligne en double
  await expect(page.locator('.menu-pop > *').first()).toHaveText('Réglages');
  await expect(page.locator('.menu-pop').getByRole('menuitem')).toHaveText(['Réglages', 'Voir le journal des modifications', 'Connecter mon assistant', /Thème/, 'Se déconnecter']);
  await capture(page, '3-client-menu-utilisateur');
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Voir le journal des modifications' }).click();
  await expect(page).toHaveURL(/#\/espace\/assistant\/crm\/journal$/);
  await ouvrirMenuUtilisateur(page);
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Connecter mon assistant' }).click();
  await expect(page).toHaveURL(/#\/espace\/assistant\/mcp\/infos$/);
  await expect(page.locator('input.mcp-lien')).toHaveValue(`${new URL(page.url()).origin}/mcp/assistant`); // chez un client : la page reste comme avant
  await expect(page.locator('.mcp-membre')).toHaveCount(1);
  await ouvrirMenuUtilisateur(page);
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Réglages' }).click();
  await expect(page).toHaveURL(/#\/espace\/assistant\/reglages$/);
});

test('3 sans le module « mcp », le menu utilisateur n’a pas « Connecter mon assistant »', async ({ page }) => {
  await ouvrir(page, 'seul');
  await ouvrirMenuUtilisateur(page);
  await expect(page.locator('.menu-pop').getByRole('menuitem')).toHaveText(['Réglages', 'Voir le journal des modifications', /Thème/, 'Se déconnecter']);
});

test('6 chez un client, l’en-tête a la même forme que chez Jérôme : nom, bouton de repli, avatar = initiale du compte', async ({ page }) => {
  await ouvrir(page, 'seul');
  await deplier(page);
  await expect(page.locator('.menu-marque > .menu-marque-nom + .menu-repli')).toHaveCount(1);
  await expect(page.locator('.menu-marque')).toContainText('Cabinet Seul');
  await expect(page.locator('.menu .menu-compte .avatar-initiale')).toHaveText('A');
  await expect(page.locator('img.avatar')).toHaveCount(0);
  await capture(page, '6-en-tete-client', estTelephone(page) ? {} : { clip: { x: 0, y: 0, width: 260, height: 900 } });
});

test('C5 chez un client : la même poignée de largeur du menu, la largeur choisie est mémorisée et le repli la respecte @sans-telephone', async ({ page }) => {
  await ouvrir(page, 'assistant');
  await deplier(page);
  const poignee = page.getByRole('separator', { name: 'Largeur du menu' });
  await expect(poignee).toHaveAttribute('aria-valuenow', '240');
  await expect.poll(async () => (await poignee.boundingBox()).x, { intervals: [200, 200, 300] }).toBe(233); // fin de l'animation d'ouverture
  const b = await poignee.boundingBox();
  await page.mouse.move(b.x + 3, b.y + 300);
  await page.mouse.down();
  await page.mouse.move(340, b.y + 300, { steps: 5 });
  await page.mouse.up();
  await expect.poll(() => page.locator('.menu').evaluate((m) => Math.round(m.getBoundingClientRect().width))).toBe(340);
  await expect.poll(() => page.evaluate(() => localStorage.getItem('chevalier-os.menu-largeur'))).toBe('340');
  await page.getByRole('button', { name: 'Replier le menu' }).click();
  await expect(page.locator('.menu-poignee')).toHaveCount(0);
  await page.getByRole('button', { name: 'Élargir le menu' }).click();
  await expect.poll(() => page.locator('.menu').evaluate((m) => Math.round(m.getBoundingClientRect().width))).toBe(340);
  await mkdir(join(homedir(), 'chantiers-crm', 'captures-menu-C'), { recursive: true });
  await page.screenshot({ path: join(homedir(), 'chantiers-crm', 'captures-menu-C', '5-client-340.png'), animations: 'disabled', clip: { x: 0, y: 0, width: 700, height: 600 } });
});

test('C1 chez un client, au minimum de 200 px, un long nom d’espace est tronqué sans rien faire déborder @sans-telephone', async ({ page }) => {
  await ecrireDocument('marques/long', { actif: true, nom: 'Cabinet d’Avocats Associés Dupont-Martin et Fils', couleur: '#336699', accueil: 'Bienvenue.' });
  await ecrireDocument(`clients/long/membres/${ALICE}`, { role: 'editeur' });
  await ecrireDocument('clients/long', { modules: { affaires: true, projets: true, mcp: true }, equipe: [{ email: ALICE, role: 'editeur' }] });
  await ouvrir(page, 'long');
  await deplier(page);
  const poignee = page.getByRole('separator', { name: 'Largeur du menu' });
  await poignee.focus();
  await page.keyboard.press('Home');
  await expect.poll(() => page.locator('.menu').evaluate((m) => Math.round(m.getBoundingClientRect().width))).toBe(200);
  await page.waitForTimeout(400);
  expect(await page.locator('.menu').evaluate((m) => m.scrollWidth <= m.clientWidth)).toBe(true);
  expect(await page.locator('.menu-repli').evaluate((r) => r.getBoundingClientRect().right <= document.querySelector('.menu').getBoundingClientRect().right)).toBe(true);
  await mkdir(join(homedir(), 'chantiers-crm', 'captures-menu-C'), { recursive: true });
  await page.screenshot({ path: join(homedir(), 'chantiers-crm', 'captures-menu-C', 'C1-client-nom-long-minimum-200.png'), animations: 'disabled', clip: { x: 0, y: 0, width: 700, height: 600 } });
});
