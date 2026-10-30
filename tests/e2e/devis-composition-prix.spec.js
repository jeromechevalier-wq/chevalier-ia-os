// Module Devis, fenêtre « Composition » du Catalogue (30/10/2026) : référence de chaque composant et prix d'achat modifiable sur place.
// Le prix est celui de l'ARTICLE : l'enregistrer passe par la modification d'un article (même validation, même journal), et seulement à « Enregistrer ».
// Captures dans tests/e2e/captures/devis-composition-prix/ (format ordinateur).
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, listerDocuments } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-composition-prix/', import.meta.url));
async function capturer(page, info, nom) {
  if (info.project.name !== 'ordinateur') return;
  await page.screenshot({ path: `${DOSSIER}${nom}.png`, fullPage: true, animations: 'disabled' });
}
const dialogue = (page) => page.getByRole('dialog');

async function article(id, valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument(`devis_articles/${id}`, {
    code: '', libelle: 'Article test', unite: 'u', prixAchat: 10, tauxTva: null, actif: true, proprietaire: 'jerome.chevalier@gmail.com',
    creeLe: maintenant, modifieLe: maintenant, creePar: 'jerome.chevalier@gmail.com', modifiePar: 'jerome.chevalier@gmail.com', ...valeurs,
  });
}
async function composition({ autreOuvrage = false } = {}) {
  await article('a1', { libelle: 'BA13 standard', unite: 'm²', prixAchat: 5.75, marge: 16.5, type: 'fourniture', reference: 'REF-BA13' });
  await article('a2', { libelle: 'Rail R48', unite: 'ml', prixAchat: 1.9, marge: 31.6, type: 'fourniture', code: 'RAIL-48' });
  await article('a3', { libelle: 'Isolant laine de verre', unite: 'm²', prixAchat: 1.39, marge: 54, type: 'fourniture' });
  const composants = [{ articleId: 'a1', quantite: 1 }, { articleId: 'a2', quantite: 1 }, { articleId: 'a3', quantite: 1 }];
  await article('o1', { libelle: 'Cloisons de séparation', type: 'ouvrage', prixAchat: null, composants });
  if (autreOuvrage) await article('o2', { libelle: 'Doublage mural', type: 'ouvrage', prixAchat: null, composants: [{ articleId: 'a1', quantite: 2 }] });
}
async function ouvrirComposition(page) {
  await connecter(page, undefined, { route: 'devis/bordereau' });
  await expect(page.locator('.page-devis')).toBeVisible();
  await attendreCalme(page);
  await page.locator('.ligne-article[data-id="o1"] [data-action="composer"]').click();
  await expect(dialogue(page)).toBeVisible();
}
const prixChamp = (page, libelle) => dialogue(page).getByRole('textbox', { name: `Prix d’achat HT : ${libelle}` });
const prixEnBase = async (libelle) => (await listerDocuments('devis_articles')).find((d) => d.libelle === libelle)?.prixAchat;
const sansDebordement = async (page) => {
  const d = await dialogue(page).evaluate((el) => [el.scrollWidth, el.clientWidth]);
  expect(d[0]).toBeLessThanOrEqual(d[1]);
};

test('P1 changer le prix d’un composant met le résumé à jour en direct, puis l’écrit sur l’article à « Enregistrer »', { tag: '@smoke' }, async ({ page }, info) => {
  await composition();
  await ouvrirComposition(page);
  // Référence sous le nom (la référence de l'article) ; le prix d'achat unitaire est le champ à côté de la quantité.
  await expect(dialogue(page).locator('[data-reference="a1"]')).toHaveText('Réf. REF-BA13');
  await expect(prixChamp(page, 'BA13 standard')).toHaveValue('5,75');
  await expect(dialogue(page).locator('[data-resume="prix-vente"]')).toHaveText('11,34 €');
  await prixChamp(page, 'BA13 standard').fill('10');
  await expect(dialogue(page).locator('[data-resume="prix-vente"]')).toHaveText('16,29 €');
  await expect(dialogue(page).locator('[data-resume="debours"]')).toHaveText('13,29 €');
  await expect(dialogue(page).locator('.composant[data-article-id="a1"] .total-composant')).toHaveText('11,65 €');
  await expect(dialogue(page).locator('[data-note="prix-composant"]')).toContainText('le change partout dans ton catalogue');
  expect(await prixEnBase('BA13 standard')).toBe(5.75); // rien n'est écrit au fil de la saisie
  await sansDebordement(page);
  await capturer(page, info, 'P1-prix-modifie');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialogue(page)).toBeHidden();
  expect(await prixEnBase('BA13 standard')).toBe(10);
  await expect(page.locator('.ligne-article[data-id="o1"] [data-colonne="prixVente"]')).toContainText('16,29 €');
  // Une ligne de journal d'audit est laissée, comme pour une modification d'article du catalogue.
  const audit = (await listerDocuments('crm_audit')).filter((d) => d.docId === 'a1' && d.outil === 'majArticle' && d.champsModifies?.includes('prixAchat'));
  expect(audit).toHaveLength(1);
});

test('P2 un prix vide ou qui n’est pas un nombre est refusé avec un message sous le champ, et rien n’est écrit', async ({ page }, info) => {
  await composition();
  await ouvrirComposition(page);
  for (const saisie of ['', 'abc']) {
    await prixChamp(page, 'BA13 standard').fill(saisie);
    await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
    await expect(dialogue(page)).toBeVisible();
    await expect(dialogue(page).locator('[data-erreur-prix="a1"]')).toContainText('prix d’achat');
    await expect(prixChamp(page, 'BA13 standard')).toHaveClass(/invalide/);
  }
  await sansDebordement(page);
  await capturer(page, info, 'P2-prix-invalide');
  expect(await prixEnBase('BA13 standard')).toBe(5.75);
  // Corriger le champ efface le message.
  await prixChamp(page, 'BA13 standard').fill('6');
  await expect(dialogue(page).locator('[data-erreur-prix="a1"]')).toHaveText('');
});

test('P3 un composant désactivé ou supprimé n’a pas de champ de prix et son état est dit', async ({ page }, info) => {
  await composition();
  await article('a2', { libelle: 'Rail R48', unite: 'ml', prixAchat: 1.9, marge: 31.6, type: 'fourniture', actif: false });
  await article('o3', { libelle: 'Ouvrage cassé', type: 'ouvrage', prixAchat: null, composants: [{ articleId: 'a1', quantite: 1 }, { articleId: 'disparu', quantite: 1 }] });
  await connecter(page, undefined, { route: 'devis/bordereau' });
  await attendreCalme(page);
  await page.locator('.ligne-article[data-id="o1"] [data-action="composer"]').click();
  await expect(dialogue(page).locator('.composant[data-article-id="a2"]')).toContainText('article désactivé');
  await expect(dialogue(page).locator('.composant[data-article-id="a2"] [data-champ="prix-composant"]')).toHaveCount(0);
  await expect(dialogue(page).locator('.composant[data-article-id="a1"] [data-champ="prix-composant"]')).toHaveCount(1);
  await sansDebordement(page);
  await capturer(page, info, 'P3-article-desactive');
  await dialogue(page).getByRole('button', { name: 'Annuler' }).click();
  await page.locator('.ligne-article[data-id="o3"] [data-action="composer"]').click();
  await expect(dialogue(page).locator('.composant[data-article-id="disparu"]')).toContainText('(article supprimé)');
  await expect(dialogue(page).locator('.composant[data-article-id="disparu"] [data-champ="prix-composant"]')).toHaveCount(0);
});

test('P4 « Annuler » n’écrit aucun prix, même après une saisie', async ({ page }, info) => {
  await composition();
  await ouvrirComposition(page);
  await prixChamp(page, 'Rail R48').fill('99');
  await expect(dialogue(page).locator('[data-resume="debours"]')).toHaveText('106,14 €');
  await capturer(page, info, 'P4-avant-annulation');
  await dialogue(page).getByRole('button', { name: 'Annuler' }).click();
  await expect(dialogue(page)).toBeHidden();
  expect(await prixEnBase('Rail R48')).toBe(1.9);
  // Rouvrir montre le prix du catalogue, pas la saisie abandonnée.
  await page.locator('.ligne-article[data-id="o1"] [data-action="composer"]').click();
  await expect(prixChamp(page, 'Rail R48')).toHaveValue('1,90');
});

test('P5 sans référence (ni code), rien n’est affiché sous le nom : jamais « undefined »', async ({ page }, info) => {
  await composition();
  await ouvrirComposition(page);
  await expect(dialogue(page).locator('[data-reference="a3"]')).toHaveCount(0);
  await expect(dialogue(page).locator('.composant[data-article-id="a3"]')).not.toContainText(/undefined|null/);
  // Sans référence mais avec un code article, c'est le code qui s'affiche.
  await expect(dialogue(page).locator('[data-reference="a2"]')).toHaveText('Réf. RAIL-48');
  await sansDebordement(page);
  await capturer(page, info, 'P5-references');
});

test('P6 un article aussi présent dans une autre composition demande une confirmation avant d’être changé', async ({ page }, info) => {
  await composition({ autreOuvrage: true });
  await ouvrirComposition(page);
  await prixChamp(page, 'BA13 standard').fill('100');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  const confirmation = page.getByRole('dialog', { name: 'Changer le prix partout ?' });
  await expect(confirmation).toContainText('1 autre composition');
  await expect(confirmation).toContainText('Doublage mural');
  await expect(confirmation).toContainText('devis déjà finalisés gardent leurs prix');
  await capturer(page, info, 'P6-confirmation');
  await confirmation.getByRole('button', { name: 'Annuler' }).click();
  expect(await prixEnBase('BA13 standard')).toBe(5.75);
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await page.getByRole('dialog', { name: 'Changer le prix partout ?' }).getByRole('button', { name: 'Changer le prix' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(await prixEnBase('BA13 standard')).toBe(100);
  await expect(page.locator('.ligne-article[data-id="o2"] [data-colonne="prixVente"]')).toContainText('233,00 €');
});

test('P7 un prix tapé puis un composant retiré et rajouté : le prix du catalogue revient, rien n’est écrit pour lui', async ({ page }) => {
  await composition();
  await ouvrirComposition(page);
  await prixChamp(page, 'Rail R48').fill('50');
  await dialogue(page).getByRole('button', { name: 'Retirer de l’ouvrage : Rail R48' }).click();
  await dialogue(page).getByRole('searchbox', { name: 'Ajouter un composant' }).fill('Rail');
  await dialogue(page).locator('.resultat-composant').first().click();
  await expect(prixChamp(page, 'Rail R48')).toHaveValue('1,90');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialogue(page)).toBeHidden();
  expect(await prixEnBase('Rail R48')).toBe(1.9);
});

test('P8 « 5.75 » écrit avec un point ou « 5,750 » n’est pas une modification : aucune confirmation ni écriture', async ({ page }) => {
  await composition({ autreOuvrage: true });
  await ouvrirComposition(page);
  await prixChamp(page, 'BA13 standard').fill('5.75');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('dialog', { name: 'Changer le prix partout ?' })).toHaveCount(0);
  await expect(dialogue(page)).toBeHidden();
  expect(await prixEnBase('BA13 standard')).toBe(5.75);
});
