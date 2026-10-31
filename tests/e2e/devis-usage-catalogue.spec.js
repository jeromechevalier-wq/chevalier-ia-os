// Module Devis, catalogue : colonne « Utilisation » et tri (PR C4 de docs/cadrage-vocabulaire-cibles.md). Un test par point (le nom commence par C4.x),
// une capture par état clé dans tests/e2e/captures/devis-usage-catalogue/ (le nom de la capture dit le format). Articles INVENTÉS ; le compteur est écrit ici « comme le serveur ».
import { fileURLToPath } from 'node:url';
import {
  test, expect, connecter, attendreCalme, ecrireDocument,
} from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-usage-catalogue/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name === 'telephone' ? 'tel' : 'ordi'}.png`, fullPage: true, animations: 'disabled' });
}
const maintenant = new Date();
async function article(id, libelle) {
  await ecrireDocument(`devis_articles/${id}`, {
    code: '', libelle, unite: 'u', prixAchat: 10, tauxTva: null, actif: true, type: 'fourniture', proprietaire: 'jerome.chevalier@gmail.com',
    creeLe: maintenant, modifieLe: maintenant, creePar: 'jerome.chevalier@gmail.com', modifiePar: 'jerome.chevalier@gmail.com',
  });
}
const usage = (id, nombre) => ecrireDocument(`devis_usage_articles/${id}`, { articleId: id, nombre, derniereUtilisationLe: maintenant });
async function catalogue() {
  await article('a1', 'Alpha prise');
  await article('a2', 'Bravo interrupteur');
  await article('a3', 'Charlie gaine');
  await article('a4', 'Delta câble');
  await usage('a2', 3);
  await usage('a3', 1);
  await usage('a4', 12); // a1 : jamais utilisé
}
async function ouvrir(page, nombre = 4) {
  await connecter(page, undefined, { route: 'devis/bordereau' });
  await expect(page.locator('.page-devis')).toBeVisible();
  await expect(page.locator('.ligne-article')).toHaveCount(nombre); // les articles ET le compteur sont arrivés
  await expect(page.locator('.ligne-article td[data-colonne="usage"]').first()).toBeVisible();
  await attendreCalme(page);
}
const libelles = (page) => page.locator('.ligne-article td[data-colonne="libelle"]').allInnerTexts();
const usages = (page) => page.locator('.ligne-article td[data-colonne="usage"]').allInnerTexts();

test('C4.1 la colonne « Utilisation » dit « Utilisé 12 fois », « Utilisé 1 fois » ou « Jamais utilisé », sur chaque ligne ; l’ordre habituel (alphabétique) reste celui par défaut', async ({ page }, info) => {
  await catalogue();
  await ouvrir(page);
  expect(await libelles(page)).toEqual(['Alpha prise', 'Bravo interrupteur', 'Charlie gaine', 'Delta câble']);
  await expect(page.locator('.ligne-article td[data-colonne="usage"]')).toHaveText(['Jamais utilisé', 'Utilisé 3 fois', 'Utilisé 1 fois', 'Utilisé 12 fois']);
  await expect(page.locator('.ligne-article[data-id="a1"] .usage-vide')).toHaveText('Jamais utilisé');
  await capturer(page, info, 'C4-1-colonne-utilisation');
});

test('C4.2 « Trier par : Utilisation » met le plus utilisé d’abord et les jamais-utilisés en dernier, dans les deux sens ; la flèche inverse ; revenir à « Libellé » rend l’ordre habituel', async ({ page }, info) => {
  await catalogue();
  await ouvrir(page);
  await page.getByLabel('Trier par').selectOption('usage');
  expect(await libelles(page)).toEqual(['Delta câble', 'Bravo interrupteur', 'Charlie gaine', 'Alpha prise']);
  await expect(page.locator('[data-action="inverser-tri"]')).toHaveAttribute('data-sens', 'desc'); // la flèche dit le vrai sens
  await capturer(page, info, 'C4-2-tri-utilisation');
  await page.locator('[data-action="inverser-tri"]').click();
  expect(await libelles(page)).toEqual(['Charlie gaine', 'Bravo interrupteur', 'Delta câble', 'Alpha prise']); // jamais utilisé : toujours en dernier
  await page.getByLabel('Trier par').selectOption('libelle');
  expect(await libelles(page)).toEqual(['Alpha prise', 'Bravo interrupteur', 'Charlie gaine', 'Delta câble']);
});

test('C4.3 sur ordinateur, un clic sur l’en-tête « Utilisation » trie (le plus utilisé d’abord), un second clic inverse ; l’en-tête dit le sens', async ({ page }) => {
  test.skip(page.viewportSize().width < 768, 'Sur téléphone, les en-têtes sont masqués : le tri passe par le menu « Trier par » (C4.2).');
  await catalogue();
  await ouvrir(page);
  const entete = page.locator('th:has([data-action="trier-usage"])');
  await expect(entete).toHaveAttribute('aria-sort', 'none');
  await page.locator('[data-action="trier-usage"]').click();
  await expect(entete).toHaveAttribute('aria-sort', 'descending');
  expect(await libelles(page)).toEqual(['Delta câble', 'Bravo interrupteur', 'Charlie gaine', 'Alpha prise']);
  await page.locator('[data-action="trier-usage"]').click();
  await expect(entete).toHaveAttribute('aria-sort', 'ascending');
  expect(await libelles(page)).toEqual(['Charlie gaine', 'Bravo interrupteur', 'Delta câble', 'Alpha prise']);
});

test('C4.4 cas vide : un catalogue sans aucun compteur dit « Jamais utilisé » partout et le tri par utilisation garde l’ordre alphabétique', async ({ page }, info) => {
  await article('a1', 'Alpha prise');
  await article('a2', 'Bravo interrupteur');
  await ouvrir(page, 2);
  await expect(page.locator('.ligne-article td[data-colonne="usage"]')).toHaveText(['Jamais utilisé', 'Jamais utilisé']);
  await page.getByLabel('Trier par').selectOption('usage');
  expect(await libelles(page)).toEqual(['Alpha prise', 'Bravo interrupteur']);
  await capturer(page, info, 'C4-4-cas-vide');
});

test('C4.5 cas d’erreur : si le compteur ne peut pas être lu, les lignes montrent un tiret, le catalogue reste utilisable (recherche, tri) et aucune erreur bloquante n’apparaît', async ({ page }, info) => {
  await catalogue();
  await ouvrir(page);
  await page.evaluate(async () => {
    const D = await import('/js/modules/devis/donnees.js');
    D.etat.erreurLectureUsages = true;
  });
  await page.getByRole('searchbox', { name: 'Rechercher un article' }).fill('a'); // la saisie relance l'affichage
  expect((await usages(page)).every((t) => t.trim() === '—')).toBe(true);
  await expect(page.locator('[data-erreur="lecture"]')).toBeHidden();
  await page.getByLabel('Trier par').selectOption('usage');
  expect((await libelles(page)).length).toBeGreaterThan(0);
  await capturer(page, info, 'C4-5-compteur-illisible');
});
