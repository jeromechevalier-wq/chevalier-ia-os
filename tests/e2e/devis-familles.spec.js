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

test('F9 créer une famille, l’affecter à un article, puis la retrouver dans la colonne et le filtre ; les erreurs et le cas vide parlent', { tag: '@smoke' }, async ({ page }, info) => {
  await article('a1', { libelle: 'Tube PVC' });
  await ouvrirBordereau(page);
  const ligne = page.locator('.ligne-article[data-id="a1"]');
  await expect(ligne.locator('[data-colonne="famille"]')).toHaveText('—');
  await ligne.locator('[data-champ="familleId"]').click();
  await expect(dialogue(page).getByRole('heading', { name: 'Sélection de la famille' })).toBeVisible();
  // Les sept familles de départ sont proposées (premier niveau), sans « Aucune famille » : « Sélectionner » est grisé tant que rien n'est choisi.
  await expect(dialogue(page).locator('.famille-option')).toHaveCount(7);
  await expect(dialogue(page).getByRole('button', { name: 'Sélectionner' })).toBeDisabled();
  await dialogue(page).locator('.famille-option', { hasText: 'Fournitures' }).locator('input').check();
  await dialogue(page).locator('[data-action="menu-familles"]').click();
  await page.getByRole('menuitem', { name: 'Nouvelle sous-famille' }).click();
  // Erreurs : nom vide, puis création de « Plomberie » sous Fournitures.
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialogue(page).locator('[data-erreur="nomFamille"]')).toContainText('Écris le nom');
  await dialogue(page).getByRole('textbox', { name: 'Nom de la famille' }).fill('Plomberie');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  // La nouvelle sous-famille est cochée, en retrait sous Fournitures.
  await expect(dialogue(page).locator('.famille-option[data-niveau="2"]', { hasText: 'Plomberie' }).locator('input')).toBeChecked();
  // Un nom déjà pris sous le même parent est refusé (sans accents ni casse).
  await dialogue(page).locator('[data-action="menu-familles"]').click();
  await page.getByRole('menuitem', { name: 'Nouvelle sous-famille' }).click();
  await dialogue(page).getByRole('textbox', { name: 'Nom de la famille' }).fill('PLOMBERIE');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialogue(page).locator('[data-erreur="nomFamille"]')).toContainText('existe déjà');
  await dialogue(page).getByRole('button', { name: 'Annuler' }).click();
  await capturer(page, info, 'F9-selection-famille');
  await dialogue(page).getByRole('button', { name: 'Sélectionner' }).click();
  await expect(ligne.locator('[data-colonne="famille"]')).toHaveText('Fournitures › Plomberie');
  const familles = await lireDocument('devis_parametres/familles');
  expect(familles.liste.at(-1)).toMatchObject({ nom: 'Plomberie', parentId: 'famille-1', actif: true });
  const docs = await listerDocuments('devis_articles');
  expect(docs.find((d) => d.libelle === 'Tube PVC')).toMatchObject({ familleId: familles.liste.at(-1).id, type: 'fourniture' });
  // Filtre « Famille » : Plomberie seulement, puis une famille sans article (cas vide).
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

test('F9 renommer puis désactiver une sous-famille depuis le menu ; une famille désactivée ne se choisit plus ; les familles de départ n’ont ni Renommer ni Désactiver', async ({ page }) => {
  await ecrireDocument('devis_parametres/familles', { liste: [{ id: 'sous-1', nom: 'Carrelage', actif: true, parentId: 'famille-1' }] });
  await article('a1', { libelle: 'Tube PVC', type: 'fourniture', familleId: 'sous-1' });
  await ouvrirBordereau(page);
  await page.locator('.ligne-article[data-id="a1"] [data-champ="familleId"]').click();
  // « Carrelage » est déjà cochée (famille de l'article).
  await expect(dialogue(page).locator('.famille-option', { hasText: 'Carrelage' }).locator('input')).toBeChecked();
  await dialogue(page).locator('[data-action="menu-familles"]').click();
  await page.getByRole('menuitem', { name: 'Renommer' }).click();
  await dialogue(page).getByRole('textbox', { name: 'Nom de la famille' }).fill('Faïence');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialogue(page).locator('.famille-option', { hasText: 'Faïence' })).toBeVisible();
  await dialogue(page).locator('[data-action="menu-familles"]').click();
  await page.getByRole('menuitem', { name: 'Désactiver' }).click();
  await dialogue(page).getByRole('button', { name: 'Désactiver' }).click();
  await expect(dialogue(page).locator('.famille-option', { hasText: 'Faïence' })).toContainText('désactivée');
  // Elle reste cochée (c'est celle de l'article) : « Sélectionner » reste permis. Une famille de départ n'a ni « Renommer » ni « Désactiver ».
  await expect(dialogue(page).getByRole('button', { name: 'Sélectionner' })).toBeEnabled();
  await dialogue(page).locator('.famille-option', { hasText: 'Divers' }).locator('input').check();
  await dialogue(page).locator('[data-action="menu-familles"]').click();
  await expect(page.getByRole('menuitem', { name: 'Nouvelle sous-famille' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Renommer' })).toHaveCount(0);
  await expect(page.getByRole('menuitem', { name: 'Désactiver' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await dialogue(page).getByRole('button', { name: 'Annuler' }).click();
  const familles = await lireDocument('devis_parametres/familles');
  expect(familles.liste.find((f) => f.id === 'sous-1')).toMatchObject({ nom: 'Faïence', actif: false, parentId: 'famille-1' });
});

test('F9 créer un article de type texte sans prix, avec référence et marque derrière « Plus… »', async ({ page }, info) => {
  await ouvrirBordereau(page);
  await page.locator('[data-action="nouvel-article"]').click();
  await dialogue(page).getByRole('textbox', { name: 'Libellé' }).fill('Travaux préparatoires');
  await expect(dialogue(page).locator('#article-type')).toHaveCount(0);
  await dialogue(page).locator('#article-familleId').click();
  await dialogue(page).locator('.famille-option', { hasText: 'Textes' }).locator('input').check();
  await dialogue(page).getByRole('button', { name: 'Sélectionner' }).click();
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
