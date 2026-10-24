// Module Devis : une seule « Famille » à deux niveaux (le type s'en déduit) et le menu d'unités (critères F1, F6, F7, F8). Chez Jérôme (racine).
// Captures dans tests/e2e/captures/devis-famille-unique/ (format ordinateur seulement ; les tests tournent aussi en format téléphone).
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, listerDocuments } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-famille-unique/', import.meta.url));
async function capturer(page, info, nom) {
  if (info.project.name !== 'ordinateur') return;
  await page.screenshot({ path: `${DOSSIER}${nom}.png`, fullPage: true, animations: 'disabled' });
}
const dialogue = (page) => page.getByRole('dialog').last();

async function article(id, valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument(`devis_articles/${id}`, {
    code: '', libelle: 'Article test', unite: 'u', prixAchat: 10, tauxTva: null, actif: true, proprietaire: 'jerome.chevalier@gmail.com',
    creeLe: maintenant, modifieLe: maintenant, creePar: 'jerome.chevalier@gmail.com', modifiePar: 'jerome.chevalier@gmail.com', ...valeurs,
  });
}
async function ouvrirBordereau(page) {
  await connecter(page, undefined, { route: 'devis/bordereau' });
  await expect(page.locator('.page-devis')).toBeVisible();
  await attendreCalme(page);
}

test('F1 la fenêtre « Ajouter un article » n’a plus de champ « Type » : un seul champ « Famille », proposé sur Fournitures', { tag: '@smoke' }, async ({ page }, info) => {
  await ouvrirBordereau(page);
  await page.locator('[data-action="nouvel-article"]').click();
  await expect(dialogue(page)).toContainText('Ajouter un article');
  await expect(dialogue(page).locator('#article-type')).toHaveCount(0);
  await expect(dialogue(page).getByText('Type (facultatif)')).toHaveCount(0);
  await expect(dialogue(page).locator('label', { hasText: /^Famille$/ })).toHaveCount(1);
  await expect(dialogue(page).locator('#article-familleId')).toHaveValue('Fournitures');
  await capturer(page, info, 'F1-fenetre-ajout');
  // F2 à l'écran : « Fournitures › Carrelage » enregistre un article de type fourniture.
  await dialogue(page).getByRole('textbox', { name: 'Libellé' }).fill('Carreau 60 x 60');
  await dialogue(page).getByRole('textbox', { name: /Prix d’achat/ }).fill('12,5');
  await dialogue(page).locator('#article-familleId').fill('carrelage');
  await dialogue(page).getByRole('option', { name: /Fournitures › Carrelage et revêtements/ }).click();
  await expect(dialogue(page).locator('#article-familleId')).toHaveValue('Fournitures › Carrelage et revêtements');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  await expect(page.locator('.ligne-article', { hasText: 'Carreau 60 x 60' }).locator('[data-colonne="famille"]')).toHaveText('Fournitures › Carrelage et revêtements');
  await expect(page.locator('th', { hasText: /^Type$/ })).toHaveCount(0);
  const doc = (await listerDocuments('devis_articles')).find((d) => d.libelle === 'Carreau 60 x 60');
  expect(doc).toMatchObject({ type: 'fourniture' });
  expect(doc.familleId).toBeTruthy();
});

test('F6 un article existant (un type, pas de famille) s’affiche dans la famille de départ de son type ; F7 le filtre sur Fournitures inclut Carrelage', { tag: '@smoke' }, async ({ page }, info) => {
  await ecrireDocument('devis_parametres/familles', { liste: [{ id: 'sous-1', nom: 'Carrelage', actif: true, parentId: 'famille-1' }] });
  await article('a1', { libelle: 'Ancienne vis', type: 'materiel' });
  await article('a2', { libelle: 'Carreau', type: 'fourniture', familleId: 'sous-1' });
  await article('a3', { libelle: 'Colle', type: 'fourniture' });
  await article('a4', { libelle: 'Pose', type: 'main_oeuvre', familleId: 'famille-2' });
  await ouvrirBordereau(page);
  await expect(page.locator('.ligne-article[data-id="a1"] [data-colonne="famille"]')).toHaveText('Matériels'); // F6 : pas de migration, rattaché par son type
  await expect(page.locator('.ligne-article[data-id="a2"] [data-colonne="famille"]')).toHaveText('Fournitures › Carrelage');
  await expect(page.locator('.ligne-article[data-id="a3"] [data-colonne="famille"]')).toHaveText('Fournitures');
  await capturer(page, info, 'F6-articles-existants-dans-leur-famille');
  // F7 : un seul filtre « Famille » (plus de filtre « Type »), en arbre ; « Fournitures » inclut « Carrelage ».
  await page.locator('[data-action="filtres"]').click();
  await expect(dialogue(page).locator('[data-cle="types"]')).toHaveCount(0);
  await expect(dialogue(page).locator('[data-cle="familles"][data-valeur="sous-1"]')).toBeVisible();
  await dialogue(page).locator('[data-cle="familles"][data-valeur="famille-1"]').check();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('.ligne-article')).toHaveCount(2);
  await expect(page.locator('.ligne-article[data-id="a2"]')).toBeVisible();
  await expect(page.locator('.ligne-article[data-id="a3"]')).toBeVisible();
  await capturer(page, info, 'F7-filtre-fournitures-avec-carrelage');
  // Filtrer sur la seule sous-famille.
  await page.locator('[data-action="filtres"]').click();
  await dialogue(page).locator('[data-cle="familles"][data-valeur="famille-1"]').uncheck();
  await dialogue(page).locator('[data-cle="familles"][data-valeur="sous-1"]').check();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('.ligne-article')).toHaveCount(1);
  await expect(page.locator('.ligne-article[data-id="a2"]')).toBeVisible();
});

test('F8 le menu d’unités montre toutes les unités même quand le champ contient « u » ; « Autre… » laisse écrire un texte libre', { tag: '@smoke' }, async ({ page }, info) => {
  await ouvrirBordereau(page);
  await page.locator('[data-action="nouvel-article"]').click();
  const menu = dialogue(page).locator('#article-unite');
  await expect(menu).toHaveValue('u'); // le champ contient déjà « u »
  const options = await menu.locator('option').allTextContents();
  expect(options).toEqual(['u', 'm', 'm²', 'm³', 'ml', 'h', 'jour', 'semaine', 'mois', 'forfait', 'lot', 'kg', 't', 'L', 'paire', 'ensemble', 'Autre…']);
  // La liste native ne se dessine pas dans une capture : on l'ouvre en « liste affichée » pour montrer toutes les entrées.
  await menu.evaluate((el) => { el.size = el.options.length; });
  await capturer(page, info, 'F8-menu-unites');
  await menu.evaluate((el) => { el.size = 0; el.removeAttribute('size'); });
  // « Autre… » : un champ de texte libre apparaît (20 caractères au plus).
  await menu.selectOption({ label: 'Autre…' });
  const libre = dialogue(page).locator('[data-champ="unite-libre"]');
  await expect(libre).toBeVisible();
  await expect(libre).toHaveAttribute('maxlength', '20');
  await libre.fill('rouleau');
  await dialogue(page).getByRole('textbox', { name: 'Libellé' }).fill('Papier peint');
  await dialogue(page).getByRole('textbox', { name: /Prix d’achat/ }).fill('9');
  await capturer(page, info, 'F8-unite-libre');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  await expect(page.locator('.ligne-article', { hasText: 'Papier peint' }).locator('[data-colonne="unite"]')).toHaveText('rouleau');
  expect((await listerDocuments('devis_articles'))[0].unite).toBe('rouleau');
  // Dans le tableau aussi : le menu montre toutes les unités, quelle que soit la valeur actuelle.
  await page.locator('.ligne-article', { hasText: 'Papier peint' }).locator('[data-champ="unite"]').click();
  const menuCellule = page.locator('.ligne-article', { hasText: 'Papier peint' }).locator('select[data-champ="unite"]');
  expect((await menuCellule.locator('option').allTextContents()).length).toBe(18); // 16 unités + « rouleau » + « Autre… »
  await menuCellule.selectOption('m²');
  await expect(page.locator('.ligne-article', { hasText: 'Papier peint' }).locator('[data-colonne="unite"]')).toHaveText('m²');
});
