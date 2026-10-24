// Module Devis : le menu de TVA du Bordereau (critères T1 à T5). Chez Jérôme (racine).
// Captures dans tests/e2e/captures/devis-tva-combobox/ (ordinateur et téléphone, un fichier par format).
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, listerDocuments } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-tva-combobox/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: true, animations: 'disabled' });
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
async function ouvrirFenetre(page) {
  await ouvrirBordereau(page);
  await page.locator('[data-action="nouvel-article"]').click();
  await expect(dialogue(page)).toContainText('Ajouter un article');
}
async function remplirEtEnregistrer(page, libelle) {
  await dialogue(page).getByRole('textbox', { name: 'Libellé' }).fill(libelle);
  await dialogue(page).getByRole('textbox', { name: /Prix d’achat/ }).fill('10');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
}
const trouver = async (libelle) => (await listerDocuments('devis_articles')).find((d) => d.libelle === libelle);

test('T1 le menu de TVA montre toujours les 7 choix, quel que soit le contenu', { tag: '@smoke' }, async ({ page }, info) => {
  await ouvrirFenetre(page);
  const menu = dialogue(page).locator('#article-tauxTva');
  await expect(menu.locator('option')).toHaveText(['Sinon, le taux du devis (20 %)', '20 %', '10 %', '5,5 %', '2,1 %', '0 %', 'Autre…']);
  await expect(menu).toHaveValue('');
  // Après un choix, la liste reste complète.
  await menu.selectOption('10');
  await expect(menu.locator('option')).toHaveCount(7);
  // La liste native ne se dessine pas dans une capture : on l'ouvre en « liste affichée ».
  await menu.evaluate((el) => { el.size = el.options.length; });
  await capturer(page, info, 'T1-menu-tva');
});

test('T2 choisir 10 % enregistre tauxTva: 10', { tag: '@smoke' }, async ({ page }, info) => {
  await ouvrirFenetre(page);
  await dialogue(page).locator('#article-tauxTva').selectOption('10');
  await capturer(page, info, 'T2-choix-10');
  await remplirEtEnregistrer(page, 'Article dix');
  await expect(dialogue(page)).toHaveCount(0);
  expect((await trouver('Article dix')).tauxTva).toBe(10);
});

test('T3 « Sinon, le taux du devis » enregistre un article sans taux propre', { tag: '@smoke' }, async ({ page }, info) => {
  await ouvrirFenetre(page);
  await capturer(page, info, 'T3-sinon-taux-du-devis');
  await remplirEtEnregistrer(page, 'Article sans taux');
  await expect(dialogue(page)).toHaveCount(0);
  expect((await trouver('Article sans taux')).tauxTva ?? null).toBeNull();
});

test('T4 « Autre… » accepte 7,5 et refuse 150 avec un message', { tag: '@smoke' }, async ({ page }, info) => {
  await ouvrirFenetre(page);
  await dialogue(page).locator('#article-tauxTva').selectOption({ label: 'Autre…' });
  const libre = dialogue(page).locator('[data-champ="tauxTva-libre"]');
  await expect(libre).toBeVisible();
  await libre.fill('150');
  await dialogue(page).getByRole('textbox', { name: 'Libellé' }).fill('Article autre');
  await dialogue(page).getByRole('textbox', { name: /Prix d’achat/ }).fill('10');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialogue(page).locator('[data-erreur="tauxTva"]')).toContainText('entre 0 et 100');
  await capturer(page, info, 'T4-autre-refuse-150');
  await libre.fill('7,5');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  expect((await trouver('Article autre')).tauxTva).toBe(7.5);
});

test('T5 un taux hors liste déjà enregistré reste affiché et choisi (modification dans le tableau)', { tag: '@smoke' }, async ({ page }, info) => {
  await article('a1', { libelle: 'Article sept', tauxTva: 7 });
  await ouvrirBordereau(page);
  const ligne = page.locator('.ligne-article', { hasText: 'Article sept' });
  await expect(ligne.locator('[data-colonne="tauxTva"]')).toHaveText('7 %');
  await ligne.locator('[data-champ="tauxTva"]').click();
  const menu = ligne.locator('select[data-champ="tauxTva"]');
  await expect(menu).toHaveValue('7');
  await expect(menu.locator('option')).toHaveText(['Sinon, le taux du devis (20 %)', '20 %', '10 %', '5,5 %', '2,1 %', '0 %', '7 %', 'Autre…']);
  await capturer(page, info, 'T5-taux-hors-liste');
  // Choisir un taux de la liste l'enregistre tout de suite.
  await menu.selectOption('5,5');
  await expect(ligne.locator('[data-colonne="tauxTva"]')).toHaveText('5,5 %');
  expect((await trouver('Article sept')).tauxTva).toBe(5.5);
});
