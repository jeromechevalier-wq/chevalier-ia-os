// Nom et logo de l'espace en haut à gauche = lien vers l'accueil (bug signalé par Jérôme le 28/11/2026 : le clic ne faisait rien, chez lui comme dans une maison).
// Un test par point (le nom commence par le numéro du point), UNE capture par point dans ~/chantiers-crm/captures-marque-accueil/ (« -tel » pour le format téléphone).
// 1 : clic (ou toucher) sur la marque depuis une autre page -> accueil ; 2 : touche Entrée sur la marque -> accueil ; 3 : téléphone (barre du haut ET tiroir du menu).
// Pas de cas vide ni de cas d'erreur propres : la marque est toujours là (nom de l'espace, au pire « Espace ») et ne lit rien.
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { test, expect, connecter, estTelephone, JEROME } from './outils.js';

test.describe.configure({ mode: 'parallel' });

const DOSSIER = join(homedir(), 'chantiers-crm', 'captures-marque-accueil');
async function capture(page, nom, options = {}) {
  await mkdir(DOSSIER, { recursive: true });
  await page.screenshot({ path: join(DOSSIER, `${nom}${estTelephone(page) ? '-tel' : ''}.png`), animations: 'disabled', ...options });
}
/** La marque visible : menu de gauche sur ordinateur, barre du haut sur téléphone. */
const marque = (page) => page.locator(estTelephone(page) ? '.barre-haut-marque' : '.menu-marque-nom');

test('1 clic sur le nom de l’espace (menu replié puis élargi) depuis une autre page : retour à l’accueil', async ({ page }) => {
  await connecter(page, JEROME, { route: 'crm/personnes' });
  await expect(page).toHaveURL(/#\/crm\/personnes$/);
  const lienMarque = marque(page);
  await expect(lienMarque).toHaveAttribute('href', '#/crm/accueil');
  await expect(lienMarque).toHaveAccessibleName("Chevalier IA OS : aller à l'accueil");
  if (!estTelephone(page)) await expect(lienMarque).toHaveCSS('cursor', 'pointer');
  await lienMarque.click(); // ordinateur : menu replié au premier lancement, seul le logo est visible
  await expect(page).toHaveURL(/#\/crm\/accueil$/);
  await expect(page.locator('.grille-objectifs .objectif')).toHaveCount(5);
  if (!estTelephone(page)) {
    // menu élargi : le nom entier est cliquable, et le bouton de repli à côté garde son rôle
    await page.evaluate(() => { location.hash = '#/crm/organisations'; });
    await expect(page).toHaveURL(/#\/crm\/organisations$/);
    await page.getByRole('button', { name: 'Élargir le menu' }).click();
    await expect(page.locator('.coquille')).toHaveAttribute('data-menu', 'elargi');
    await page.locator('.menu-marque-nom .menu-texte').click();
    await expect(page).toHaveURL(/#\/crm\/accueil$/);
    await expect(page.locator('.coquille')).toHaveAttribute('data-menu', 'elargi'); // le clic sur le nom ne replie pas le menu
    await expect(page.locator('.grille-objectifs .objectif')).toHaveCount(5);
    await expect(page.locator('.menu-entree.actif')).toHaveText('Accueil');
  }
  await capture(page, '1-clic-marque-accueil');
});

test('2 touche Entrée sur le nom de l’espace : retour à l’accueil @sans-telephone', async ({ page }) => {
  await connecter(page, JEROME, { route: 'crm/personnes' });
  const lienMarque = page.locator('.menu-marque-nom');
  await lienMarque.focus();
  await expect(lienMarque).toBeFocused();
  await capture(page, '2-marque-au-clavier', { clip: { x: 0, y: 0, width: 400, height: 200 } });
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/crm\/accueil$/);
  await expect(page.locator('.grille-objectifs .objectif')).toHaveCount(5);
});

test('3 téléphone : la marque de la barre du haut et celle du tiroir ramènent à l’accueil, le tiroir se referme', async ({ page }) => {
  test.skip(!estTelephone(page), 'format téléphone seulement');
  await connecter(page, JEROME, { route: 'crm/personnes' });
  await page.locator('.barre-haut-marque').tap();
  await expect(page).toHaveURL(/#\/crm\/accueil$/);
  await page.evaluate(() => { location.hash = '#/crm/organisations'; });
  await expect(page).toHaveURL(/#\/crm\/organisations$/);
  await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await expect(page.locator('.coquille')).toHaveClass(/menu-ouvert/);
  await page.locator('.menu .menu-marque-nom').tap();
  await expect(page).toHaveURL(/#\/crm\/accueil$/);
  await expect(page.locator('.coquille')).not.toHaveClass(/menu-ouvert/);
  await expect(page.locator('.grille-objectifs .objectif')).toHaveCount(5);
  await capture(page, '3-telephone-accueil');
});
