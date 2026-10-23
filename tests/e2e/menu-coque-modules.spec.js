// Le menu de gauche aligne des MODULES (22/10/2026) : une entrée pour Veille, Automatisations et Maintenance ; leurs autres écrans sont des ONGLETS
// dans la page du module (js/os/onglets.js). Un test par point (le nom commence par le numéro), 3 captures dans tests/e2e/captures/menu-modules/.
// Les tests 3, 5 et 6 se connectent comme l'assistant (non administrateur) : l'écran Automatisations n'appelle pas la fonction serveur des clients.
// Cas vide : un module sans donnée garde ses onglets (ici Veille et À valider, vides). Cas d'erreur : une adresse hors du module n'allume aucune entrée à tort (test 5).
import { mkdir } from 'node:fs/promises';
import { test, expect, connecter, estTelephone, JEROME, CHARLES } from './outils.js';

test.describe.configure({ mode: 'parallel' });

const CAPTURES = 'e2e/captures/menu-modules';
async function capture(page, nom) {
  await mkdir(CAPTURES, { recursive: true });
  await page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
}
const aller = (page, hash) => page.evaluate((h) => { location.hash = h; }, hash);
const ouvrirMenu = async (page) => {
  if (estTelephone(page)) { if (!(await page.locator('.coquille.menu-ouvert').count())) await page.getByRole('button', { name: 'Ouvrir le menu' }).click(); return; }
  const elargir = page.getByRole('button', { name: 'Élargir le menu' });
  if (await elargir.count()) await elargir.click();
};
const onglets = (page, nom) => page.getByRole('navigation', { name: nom }).locator('.onglet');

test('1 le menu a une seule entrée par module (Veille, Automatisations, Maintenance), sans les écrans du module', async ({ page }) => {
  await connecter(page, JEROME);
  await ouvrirMenu(page);
  await expect(page.locator('.menu .menu-entree')).toHaveText(['Accueil', 'Personnes', 'Organisations', 'Affaires', 'Projets', 'Veille', 'Automatisations', 'Maintenance']);
  for (const ecran of ['Contenus', 'Sources', 'Historique', 'À valider', 'Général', 'Technique']) await expect(page.locator('.menu').getByRole('link', { name: ecran, exact: true })).toHaveCount(0);
  await expect(page.locator('.menu .menu-entree[data-chemin="veille/contenus"]')).toHaveText('Veille');
  await expect(page.locator('.menu .menu-entree[data-chemin="automatisations/historique"]')).toHaveText('Automatisations');
  await expect(page.locator('.menu .menu-entree[data-chemin="tableaudebord/general"]')).toHaveText('Maintenance');
  await capture(page, '1-menu-modules');
});

test('2 Veille : onglets Contenus | Sources en tête des deux écrans, l\'onglet actif suit l\'écran, le menu reste allumé sur « Veille »', async ({ page }) => {
  await connecter(page, JEROME);
  await aller(page, '#/veille/contenus');
  await expect(page.getByRole('heading', { name: 'Veille', level: 1 })).toBeVisible();
  await expect(onglets(page, 'Écrans de la veille')).toHaveText(['Contenus', 'Sources']);
  await expect(onglets(page, 'Écrans de la veille').nth(0)).toHaveAttribute('aria-current', 'page');
  await expect(onglets(page, 'Écrans de la veille').nth(1)).not.toHaveAttribute('aria-current', 'page');
  await capture(page, '2-veille-onglets');
  await onglets(page, 'Écrans de la veille').nth(1).click();
  await expect(page).toHaveURL(/#\/veille\/sources$/);
  await expect(page.getByRole('heading', { name: 'Sources suivies', level: 1 })).toBeVisible();
  await expect(onglets(page, 'Écrans de la veille')).toHaveText(['Contenus', 'Sources']);
  await expect(onglets(page, 'Écrans de la veille').nth(1)).toHaveAttribute('aria-current', 'page');
  await ouvrirMenu(page);
  await expect(page.locator('.menu .menu-entree[data-chemin="veille/contenus"]')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.menu .menu-entree[aria-current="page"]')).toHaveCount(1);
  if (estTelephone(page)) await page.keyboard.press('Escape');
  await onglets(page, 'Écrans de la veille').nth(0).click(); // retour : un onglet est un vrai lien
  await expect(page).toHaveURL(/#\/veille\/contenus$/);
});

test('3 Automatisations : onglets « À valider » puis « Historique », navigation entre les deux, le menu reste allumé sur « Automatisations »', async ({ page }) => {
  await connecter(page, CHARLES);
  await aller(page, '#/automatisations/historique');
  await expect(page.getByRole('heading', { name: 'Automatisations', level: 1 })).toBeVisible();
  const barre = onglets(page, 'Écrans des automatisations');
  await expect(barre).toHaveText(['À valider', 'Historique']); // « À valider » en premier
  await expect(barre.nth(1)).toHaveAttribute('aria-current', 'page');
  await ouvrirMenu(page);
  await expect(page.locator('.menu .menu-entree[data-chemin="automatisations/historique"]')).toHaveAttribute('aria-current', 'page');
  if (estTelephone(page)) await page.keyboard.press('Escape');
  await barre.nth(0).click();
  await expect(page).toHaveURL(/#\/automatisations\/a-valider$/);
  await expect(page.getByRole('heading', { name: 'À valider', level: 1 })).toBeVisible();
  await expect(onglets(page, 'Écrans des automatisations')).toHaveText(['À valider', 'Historique']);
  await expect(onglets(page, 'Écrans des automatisations').nth(0)).toHaveAttribute('aria-current', 'page');
  await capture(page, '3-automatisations-onglets');
  await ouvrirMenu(page);
  await expect(page.locator('.menu .menu-entree[data-chemin="automatisations/historique"]')).toHaveAttribute('aria-current', 'page'); // allumée aussi sur « À valider »
  await expect(page.locator('.menu .menu-entree[aria-current="page"]')).toHaveCount(1);
  if (estTelephone(page)) await page.keyboard.press('Escape');
  await onglets(page, 'Écrans des automatisations').nth(1).click();
  await expect(page).toHaveURL(/#\/automatisations\/historique$/);
});

test('4 Maintenance : l\'entrée unique s\'allume sur toutes les routes du module (general, technique, historique) ; il n\'y a plus d\'onglets (un seul écran)', async ({ page }) => {
  await connecter(page, JEROME);
  await aller(page, '#/tableaudebord/technique');
  await expect(page.getByRole('heading', { name: 'Maintenance', level: 1 })).toBeVisible();
  await expect(page.locator('.td-onglets, .td-onglet, .td-segment')).toHaveCount(0);
  await ouvrirMenu(page);
  await expect(page.locator('.menu .menu-entree[data-chemin="tableaudebord/general"]')).toHaveAttribute('aria-current', 'page');
  if (estTelephone(page)) await page.keyboard.press('Escape');
  await aller(page, '#/tableaudebord/historique');
  await ouvrirMenu(page);
  await expect(page.locator('.menu .menu-entree[data-chemin="tableaudebord/general"]')).toHaveAttribute('aria-current', 'page');
});

test('5 les anciennes adresses (signets) marchent toujours et l\'entrée du module les allume ; une autre page n\'allume rien', async ({ page }) => {
  await connecter(page, CHARLES);
  for (const [hash, entree] of [['#/veille/sources', 'veille/contenus'], ['#/automatisations/a-valider', 'automatisations/historique'], ['#/tableaudebord/technique', 'tableaudebord/general']]) {
    await aller(page, hash);
    await expect(page.getByText('Page introuvable')).toHaveCount(0);
    // Maintenance n'a plus d'onglets (un seul écran) : on attend son titre ; Veille et Automatisations gardent leur barre.
    if (hash.includes('tableaudebord')) await expect(page.getByRole('heading', { name: 'Maintenance', level: 1 })).toBeVisible();
    else await expect(page.locator('.page .onglets').first()).toBeVisible();
    await ouvrirMenu(page);
    await expect(page.locator(`.menu .menu-entree[data-chemin="${entree}"]`)).toHaveAttribute('aria-current', 'page');
    if (estTelephone(page)) await page.keyboard.press('Escape');
  }
  await aller(page, '#/crm/journal');
  await ouvrirMenu(page);
  await expect(page.locator('.menu .menu-entree[aria-current="page"]')).toHaveCount(0);
});

test('6 les onglets sont des liens focalisables au clavier (focus puis Entrée), la barre a un nom accessible et la page ne déborde pas', async ({ page }) => {
  await connecter(page, CHARLES);
  await aller(page, '#/automatisations/a-valider');
  const barre = page.getByRole('navigation', { name: 'Écrans des automatisations' });
  await expect(barre).toBeVisible();
  const historique = barre.getByRole('link', { name: 'Historique', exact: true });
  await historique.focus();
  await expect(historique).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/automatisations\/historique$/);
  const debord = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  expect(debord).toBe(false);
});

test('7 téléphone : Échap referme le tiroir du menu (il ne recouvre plus la page), toucher une entrée le referme aussi, et le clic sur un onglet de la page marche ensuite', async ({ page }) => {
  test.skip(!estTelephone(page), 'tiroir du menu : format téléphone seulement');
  await connecter(page, CHARLES);
  await aller(page, '#/automatisations/historique');
  const barre = onglets(page, 'Écrans des automatisations');
  await expect(barre).toHaveText(['À valider', 'Historique']);
  await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await expect(page.locator('.coquille.menu-ouvert')).toHaveCount(1);
  await mkdir('e2e/captures/menu-telephone', { recursive: true });
  await page.screenshot({ path: 'e2e/captures/menu-telephone/7-tiroir-ouvert-telephone.png', animations: 'disabled' });
  await page.keyboard.press('Escape');
  await expect(page.locator('.coquille.menu-ouvert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Ouvrir le menu' })).toHaveAttribute('aria-expanded', 'false');
  await barre.nth(0).click(); // le clic atteint l'onglet de la page, pas le menu
  await expect(page).toHaveURL(/#\/automatisations\/a-valider$/);
  await page.screenshot({ path: 'e2e/captures/menu-telephone/7-page-apres-navigation-telephone.png', animations: 'disabled' });
  // toucher une entrée du menu referme le tiroir
  await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await page.locator('.menu .menu-entree[data-chemin="veille/contenus"]').click();
  await expect(page).toHaveURL(/#\/veille\/contenus$/);
  await expect(page.locator('.coquille.menu-ouvert')).toHaveCount(0);
});
