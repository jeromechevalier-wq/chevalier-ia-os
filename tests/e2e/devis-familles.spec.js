// Module Devis, familles d'articles et ligne de texte dans le Bordereau (critère F9). Chez Jérôme (racine).
// Capture dans tests/e2e/captures/devis-familles/ (format ordinateur seulement ; le test tourne aussi en format téléphone).
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, lireDocument, listerDocuments } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-familles/', import.meta.url));
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
async function fermerTiroir(page) { await page.keyboard.press('Escape').catch(() => {}); }

test('F9 choisir la famille d’un article avec le champ intelligent, puis la retrouver dans la colonne et le filtre ; le cas vide parle', { tag: '@smoke' }, async ({ page }, info) => {
  await article('a1', { libelle: 'Tube PVC' });
  await ouvrirBordereau(page);
  const ligne = page.locator('.ligne-article[data-id="a1"]');
  await expect(ligne.locator('[data-colonne="famille"]')).toHaveText('—');
  await ligne.locator('[data-champ="familleId"]').click();
  // Le champ intelligent remplace l'ancienne fenêtre : on tape, on choisit.
  const champ = ligne.locator('.champ-intelligent input');
  await champ.fill('plomb');
  await expect(page.getByRole('option', { name: /Fournitures › Plomberie et sanitaire/ })).toBeVisible();
  await champ.press('ArrowDown');
  await champ.press('Enter');
  await expect(ligne.locator('[data-colonne="famille"]')).toHaveText('Fournitures › Plomberie et sanitaire');
  const docs = await listerDocuments('devis_articles');
  expect(docs.find((d) => d.libelle === 'Tube PVC')).toMatchObject({ familleId: 'famille-1-7', type: 'fourniture' });
  // Filtre « Famille » : sans famille, puis une famille sans article (cas vide).
  await article('a2', { libelle: 'Vis' });
  await page.locator('[data-action="filtres"]').click();
  await dialogue(page).locator('[data-cle="familles"][data-valeur="sans_famille"]').check();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('.ligne-article')).toHaveCount(1);
  await expect(page.locator('.ligne-article')).toContainText('Vis');
  await page.locator('[data-action="filtres"]').click();
  await dialogue(page).locator('[data-cle="familles"][data-valeur="sans_famille"]').uncheck();
  await dialogue(page).locator('[data-cle="familles"][data-valeur="famille-7"]').check();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('.etat-vide')).toContainText('Aucun article dans cette famille');
  await capturer(page, info, 'F9-filtre-famille-vide');
});

test('F9 une famille désactivée n’est plus proposée par le champ, mais l’article qui l’a déjà la garde', async ({ page }) => {
  await ecrireDocument('devis_parametres/familles', { liste: [{ id: 'sous-1', nom: 'Faïence', actif: false, parentId: 'famille-1' }, { id: 'sous-2', nom: 'Faïence murale', actif: true, parentId: 'famille-1' }] });
  await article('a1', { libelle: 'Tube PVC', type: 'fourniture', familleId: 'sous-1' });
  await ouvrirBordereau(page);
  const ligne = page.locator('.ligne-article[data-id="a1"]');
  await expect(ligne.locator('[data-colonne="famille"]')).toHaveText('Fournitures › Faïence');
  await ligne.locator('[data-champ="familleId"]').click();
  await ligne.locator('.champ-intelligent input').fill('faïence');
  await expect(page.getByRole('option', { name: /Faïence murale/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /Fournitures › Faïence$/ })).toHaveCount(0);
  // Échap annule : l'article garde sa famille désactivée.
  await ligne.locator('.champ-intelligent input').press('Escape');
  await expect(ligne.locator('[data-colonne="famille"]')).toHaveText('Fournitures › Faïence');
  const docs = await listerDocuments('devis_articles');
  expect(docs.find((d) => d.libelle === 'Tube PVC')).toMatchObject({ familleId: 'sous-1' });
});

test('F9 créer un article de type texte sans prix, avec référence et marque derrière « Plus… »', async ({ page }, info) => {
  await ouvrirBordereau(page);
  await page.locator('[data-action="nouvel-article"]').click();
  await dialogue(page).getByRole('textbox', { name: 'Libellé' }).fill('Travaux préparatoires');
  await expect(dialogue(page).locator('#article-type')).toHaveCount(0);
  await dialogue(page).locator('#article-familleId').fill('textes');
  await dialogue(page).getByRole('option', { name: /^Textes$/ }).click();
  await expect(dialogue(page).locator('#article-prixAchat')).toBeHidden();
  await expect(dialogue(page).locator('#article-unite')).toBeHidden();
  // Référence et marque sont repliées ; « Plus… » les montre, « Moins… » les replie.
  await expect(dialogue(page).locator('[data-zone="rares"]')).toBeHidden();
  await dialogue(page).locator('[data-action="plus-moins"]').click();
  await expect(dialogue(page).locator('[data-zone="rares"]')).toBeVisible();
  await expect(dialogue(page).locator('[data-action="plus-moins"]')).toHaveText('Moins…');
  await dialogue(page).locator('#article-reference').fill('x'.repeat(121));
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialogue(page).locator('[data-erreur="reference"]')).toContainText('trop longue');
  await dialogue(page).locator('#article-reference').fill('TP-01');
  await dialogue(page).locator('#article-marque').fill('Maison');
  await capturer(page, info, 'F9-article-texte');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialogue(page)).toBeHidden();
  const ligne = page.locator('.ligne-article', { hasText: 'Travaux préparatoires' });
  await expect(ligne.locator('[data-colonne="famille"]')).toContainText('Textes');
  await expect(ligne.locator('[data-colonne="prixAchat"]')).toHaveText('—');
  await expect(ligne.locator('[data-colonne="prixVente"]')).toHaveText('—');
  const doc = (await listerDocuments('devis_articles')).find((d) => d.libelle === 'Travaux préparatoires');
  expect(doc).toMatchObject({ type: 'texte', familleId: 'famille-6', reference: 'TP-01', marque: 'Maison', prixAchat: null, unite: '' });
  // « Plus… » de l'écran montre les colonnes Référence et Marque.
  await expect(page.locator('th', { hasText: 'Référence' })).toHaveCount(0);
  await page.locator('[data-action="colonnes-rares"]').click();
  await expect(ligne.locator('[data-colonne="reference"]')).toContainText('TP-01');
  await expect(ligne.locator('[data-colonne="marque"]')).toContainText('Maison');
  await capturer(page, info, 'F9-colonnes-plus');
  await fermerTiroir(page);
});
