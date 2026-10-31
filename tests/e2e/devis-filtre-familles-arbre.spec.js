// Catalogue > Filtres : les familles en arbre lisible (1 retrait et libellés courts, 2 même filtre qu'avant, 3 « Sans famille », 4 défilement avec en-tête et boutons visibles).
// Captures dans tests/e2e/captures/devis-filtre-familles-arbre/ (ordinateur et téléphone).
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-filtre-familles-arbre/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
const dialogue = (page) => page.getByRole('dialog').last();

async function article(id, valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument(`devis_articles/${id}`, {
    code: '', libelle: 'Article test', unite: 'u', prixAchat: 10, tauxTva: null, actif: true, proprietaire: 'jerome.chevalier@gmail.com',
    creeLe: maintenant, modifieLe: maintenant, creePar: 'jerome.chevalier@gmail.com', modifiePar: 'jerome.chevalier@gmail.com', ...valeurs,
  });
}
async function ouvrirFiltres(page) {
  await connecter(page, undefined, { route: 'devis/bordereau' });
  await expect(page.locator('.page-devis')).toBeVisible();
  await attendreCalme(page);
  await page.locator('[data-action="filtres"]').click();
  await expect(dialogue(page)).toContainText('Filtres');
}

test('1 les familles du filtre sont en arbre : une famille par ligne, sous-familles en retrait avec leur nom court', async ({ page }, info) => {
  await ecrireDocument('devis_parametres/familles', { liste: [{ id: 'sous-1', nom: 'Carrelage', actif: true, parentId: 'famille-1' }] });
  await ouvrirFiltres(page);
  const sous = dialogue(page).locator('label:has([data-cle="familles"][data-valeur="sous-1"])');
  await expect(sous).toHaveText('Carrelage'); // nom seul, sans « Fournitures › »
  await expect(sous).toHaveAttribute('data-niveau', '1');
  await expect(dialogue(page).getByText('›')).toHaveCount(0);
  const parent = dialogue(page).locator('label:has([data-cle="familles"][data-valeur="famille-1"])');
  await expect(parent).toContainText('inclut ses sous-familles');
  const [bp, bs] = [await parent.boundingBox(), await sous.boundingBox()];
  expect(bs.x).toBeGreaterThan(bp.x + 10); // retrait
  expect(bs.y).toBeGreaterThan(bp.y); // en dessous
  await capturer(page, info, '1-arbre');
});

test('2 cocher une famille de premier niveau garde les articles de ses sous-familles ; une sous-famille seule ne garde qu’elle', async ({ page }) => {
  await ecrireDocument('devis_parametres/familles', { liste: [{ id: 'sous-1', nom: 'Carrelage', actif: true, parentId: 'famille-1' }] });
  await article('a2', { libelle: 'Carreau', type: 'fourniture', familleId: 'sous-1' });
  await article('a3', { libelle: 'Colle', type: 'fourniture' });
  await article('a4', { libelle: 'Pose', type: 'main_oeuvre', familleId: 'famille-2' });
  await ouvrirFiltres(page);
  await dialogue(page).locator('[data-cle="familles"][data-valeur="famille-1"]').check();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('.ligne-article')).toHaveCount(2);
  await page.locator('[data-action="filtres"]').click();
  await dialogue(page).locator('[data-cle="familles"][data-valeur="famille-1"]').uncheck();
  await dialogue(page).locator('[data-cle="familles"][data-valeur="sous-1"]').check();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('.ligne-article[data-id="a2"]')).toHaveCount(1);
  await expect(page.locator('.ligne-article')).toHaveCount(1);
});

test('3 « Sans famille » est la dernière ligne de l’arbre (le cas sans aucune famille est dans tests/devis-familles.test.js)', async ({ page }, info) => {
  await ouvrirFiltres(page);
  const cases = dialogue(page).locator('input[data-cle="familles"]');
  await expect(cases.last()).toHaveAttribute('data-valeur', 'sans_famille');
  await capturer(page, info, '3-sans-famille');
});

test('4 une longue liste défile dans la fenêtre : l’en-tête « Filtres » et les boutons « Tout effacer » et « Appliquer » restent visibles', async ({ page }, info) => {
  const liste = Array.from({ length: 40 }, (_, i) => ({ id: `s${i}`, nom: `Sous-famille ${i + 1}`, actif: true, parentId: 'famille-1' }));
  await ecrireDocument('devis_parametres/familles', { liste });
  await ouvrirFiltres(page);
  const corps = dialogue(page).locator('.dialogue-corps');
  expect(await corps.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true);
  await corps.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await expect(dialogue(page).getByRole('heading', { name: 'Filtres' })).toBeInViewport();
  await expect(dialogue(page).getByRole('button', { name: 'Appliquer' })).toBeInViewport();
  await expect(dialogue(page).getByRole('button', { name: 'Tout effacer' })).toBeInViewport();
  await expect(dialogue(page).locator('[data-cle="familles"][data-valeur="sans_famille"]')).toBeInViewport();
  await capturer(page, info, '4-defilement');
});
