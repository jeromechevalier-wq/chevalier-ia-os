// Module Devis, ouvrages composés dans le Bordereau (critère O10 du brief). Chez Jérôme (racine). Capture dans tests/e2e/captures/devis-ouvrages/ (format ordinateur).
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, listerDocuments } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-ouvrages/', import.meta.url));
async function capturer(page, info, nom) {
  if (info.project.name !== 'ordinateur') return;
  await page.screenshot({ path: `${DOSSIER}${nom}.png`, fullPage: true, animations: 'disabled' });
}
const dialogue = (page) => page.getByRole('dialog');

/** Un article déjà dans la base (contourne l'écran). */
async function article(id, valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument(`devis_articles/${id}`, {
    code: '', libelle: 'Article test', unite: 'u', prixAchat: 10, tauxTva: null, actif: true, proprietaire: 'jerome.chevalier@gmail.com',
    creeLe: maintenant, modifieLe: maintenant, creePar: 'jerome.chevalier@gmail.com', modifiePar: 'jerome.chevalier@gmail.com', ...valeurs,
  });
}
async function troisComposants() {
  await article('a1', { libelle: 'BA13 standard', unite: 'm²', prixAchat: 5.75, marge: 16.5, type: 'fourniture' });
  await article('a2', { libelle: 'Rail R48', unite: 'ml', prixAchat: 1.9, marge: 31.6, type: 'fourniture' });
  await article('a3', { libelle: 'Isolant laine de verre', unite: 'm²', prixAchat: 1.39, marge: 54 });
}
async function ouvrirBordereau(page) {
  await connecter(page, undefined, { route: 'devis/bordereau' });
  await expect(page.locator('.page-devis')).toBeVisible();
  await attendreCalme(page);
}

test('O10 créer un ouvrage de 3 composants montre 11,34 € en direct, puis dans la liste ; les cas d’erreur et le cas vide parlent', { tag: '@smoke' }, async ({ page }, info) => {
  await troisComposants();
  await ouvrirBordereau(page);
  await page.locator('[data-action="nouvel-article"]').click();
  await dialogue(page).getByRole('textbox', { name: 'Libellé' }).fill('Cloisons de séparation');
  // La famille « Ouvrages » donne le type ouvrage (il n'y a plus de champ « Type »).
  await dialogue(page).locator('#article-familleId').fill('Ouvrages');
  await dialogue(page).getByRole('option', { name: /^Ouvrages$/ }).click();
  // Le prix d'achat disparaît, l'éditeur apparaît avec son cas vide.
  await expect(dialogue(page).locator('#article-prixAchat')).toBeHidden();
  await expect(dialogue(page).locator('[data-vide="composants"]')).toContainText('Aucun composant');
  // Enregistrer sans composant : message qui dit quoi faire.
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialogue(page).locator('[data-erreur="composants"]')).toContainText('au moins un composant');
  // Ajouter les trois composants par la recherche.
  const recherche = dialogue(page).getByRole('searchbox', { name: 'Ajouter un composant' });
  for (const mot of ['BA13', 'Rail', 'Isolant']) {
    await recherche.fill(mot);
    await dialogue(page).locator('.resultat-composant').first().click();
  }
  await expect(dialogue(page).locator('.composant')).toHaveCount(3);
  await expect(dialogue(page).locator('[data-resume="prix-vente"]')).toHaveText('11,34 €');
  await expect(dialogue(page).locator('[data-resume="debours"]')).toHaveText('9,04 €');
  await expect(dialogue(page).locator('[data-resume="marge"]')).toHaveText('2,30 €');
  await expect(dialogue(page).locator('[data-resume="taux"]')).toHaveText('25,44 %');
  // Un doublon n'est plus proposé ; une quantité fausse est refusée avec un message.
  await recherche.fill('BA13');
  await expect(dialogue(page).locator('.resultats-composants')).toContainText('Aucun article actif');
  await recherche.fill('');
  const quantite = dialogue(page).getByRole('textbox', { name: 'Quantité : Rail R48' });
  await quantite.fill('abc');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialogue(page).locator('[data-erreur="composants"]')).toContainText('quantité doit être');
  await quantite.fill('1');
  await capturer(page, info, 'O10-ouvrage-en-direct');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialogue(page)).toBeHidden();
  const ligne = page.locator('.ligne-article', { hasText: 'Cloisons de séparation' });
  await expect(ligne.locator('[data-colonne="prixVente"]')).toContainText('11,34 €');
  await expect(ligne.locator('[data-colonne="prixAchat"]')).toContainText('9,04 €');
  await expect(ligne.locator('[data-colonne="famille"]')).toHaveText('Ouvrages');
  const docs = (await listerDocuments('devis_articles')).filter((d) => d.libelle === 'Cloisons de séparation');
  expect(docs).toHaveLength(1);
  expect(docs[0].type).toBe('ouvrage');
  expect(docs[0].familleId).toBe('famille-3');
  expect(docs[0].composants).toHaveLength(3);
  await capturer(page, info, 'O10-liste-avec-ouvrage');
});

test('O10 le prix de vente forcé et le filtre par famille', async ({ page }, info) => {
  await troisComposants();
  await article('o1', { libelle: 'Ouvrage existant', type: 'ouvrage', prixAchat: null, composants: [{ articleId: 'a1', quantite: 1 }, { articleId: 'a2', quantite: 1 }, { articleId: 'a3', quantite: 1 }] });
  await ouvrirBordereau(page);
  await expect(page.locator('.ligne-article[data-id="o1"] [data-colonne="prixVente"]')).toContainText('11,34 €');
  await page.locator('.ligne-article[data-id="o1"] [data-action="composer"]').click();
  await dialogue(page).locator('#article-prixVenteForce').fill('12');
  await expect(dialogue(page).locator('[data-resume="prix-vente"]')).toHaveText('12,00 €');
  await expect(dialogue(page).locator('[data-resume="marge"]')).toHaveText('2,96 €');
  await capturer(page, info, 'O10-prix-force');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialogue(page)).toBeHidden();
  await expect(page.locator('.ligne-article[data-id="o1"] [data-colonne="prixVente"]')).toContainText('12,00 €');
  // Filtre « Famille » : Ouvrages seulement, puis une famille sans article (cas vide).
  await page.locator('[data-action="filtres"]').click();
  await dialogue(page).locator('[data-cle="familles"][data-valeur="famille-3"]').check();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('.ligne-article')).toHaveCount(1);
  await page.locator('[data-action="filtres"]').click();
  await dialogue(page).locator('[data-cle="familles"][data-valeur="famille-3"]').uncheck();
  await dialogue(page).locator('[data-cle="familles"][data-valeur="famille-7"]').check();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('.etat-vide')).toContainText('Aucun article dans cette famille');
});
