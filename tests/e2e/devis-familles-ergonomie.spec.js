// Module Devis, familles d'articles : le champ intelligent à la place de la fenêtre « Sélection de la famille », la gestion des familles dans les Réglages,
// et le retour vers les devis depuis le Bordereau (brief 19). Chez Jérôme (racine).
// Captures dans tests/e2e/captures/devis-familles-ergonomie/ (ordinateur et téléphone, un fichier par format).
// Le test de refus d'écriture des Réglages est dans devis-bordereau-client.spec.js (il a besoin des règles de la plateforme : un lecteur).
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, lireDocument, listerDocuments } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-familles-ergonomie/', import.meta.url));
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
async function ouvrirReglagesFamilles(page) {
  await connecter(page, undefined, { route: 'reglages/devis' });
  await expect(page.locator('#reglages-familles')).toBeVisible();
  await attendreCalme(page);
}
const groupe = (page, id) => page.locator(`#reglages-familles [data-groupe="${id}"]`);

test('P2 le champ « Famille » propose les familles avec leur chemin par groupe, filtre en tapant, se choisit au clavier ; un nom inconnu donne un message avec un lien', { tag: '@smoke' }, async ({ page }, info) => {
  await ouvrirBordereau(page);
  await page.locator('[data-action="nouvel-article"]').click();
  const champ = dialogue(page).locator('#article-familleId');
  await expect(champ).toHaveValue('Fournitures'); // proposée par défaut
  // Un clic ouvre toute la liste : sept groupes (une famille de premier niveau chacun), les sous-familles avec leur chemin.
  await champ.click();
  await expect(dialogue(page).locator('.suggestion-groupe')).toHaveCount(7);
  await expect(page.getByRole('option', { name: 'Fournitures › Carrelage et revêtements' })).toBeVisible();
  await expect(page.getByRole('option', { name: 'Ouvrages › Toiture et étanchéité' })).toHaveCount(1);
  // Taper filtre (accents et casse ignorés).
  await champ.fill('carre');
  await expect(page.locator('.suggestions [role="option"]')).toHaveCount(2);
  await expect(page.getByRole('option', { name: /Fournitures › Carrelage et revêtements/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /Main d’œuvre › Carreleur/ })).toBeVisible();
  await capturer(page, info, 'P2-champ-famille-liste');
  // Flèches et Entrée.
  await champ.press('ArrowDown');
  await champ.press('ArrowDown');
  await champ.press('Enter');
  await expect(champ).toHaveValue('Main d’œuvre › Carreleur');
  // Le type suit la famille (main d'œuvre) : le prix d'achat reste demandé, l'article s'enregistre rangé dans la sous-famille.
  await dialogue(page).getByRole('textbox', { name: 'Libellé' }).fill('Pose de carrelage');
  await dialogue(page).getByRole('textbox', { name: /Prix d’achat/ }).fill('35');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  const doc = (await listerDocuments('devis_articles')).find((d) => d.libelle === 'Pose de carrelage');
  expect(doc).toMatchObject({ familleId: 'famille-2-2', type: 'main_oeuvre' });
  await expect(page.locator('.ligne-article', { hasText: 'Pose de carrelage' }).locator('[data-colonne="famille"]')).toHaveText('Main d’œuvre › Carreleur');
  // Aucune création depuis le champ : un nom inconnu dit où gérer les familles, avec un lien.
  await page.locator('[data-action="nouvel-article"]').click();
  await dialogue(page).locator('#article-familleId').fill('Zinguerie');
  await expect(page.locator('.suggestions [role="option"]')).toHaveCount(0);
  await expect(dialogue(page).locator('.suggestion-vide')).toContainText('Aucune famille de ce nom. Les familles se gèrent dans Réglages > Familles d’articles.');
  await expect(dialogue(page).locator('.suggestion-vide a')).toHaveAttribute('href', /#\/reglages\/devis\/reglages-familles$/);
  await expect(dialogue(page).locator('.suggestion-creer')).toHaveCount(0);
  await capturer(page, info, 'P2-aucune-famille');
  // Le lien mène aux Réglages et ferme la fenêtre.
  await dialogue(page).locator('.suggestion-vide a').click();
  await expect(page.locator('#reglages-familles')).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await listerDocuments('devis_parametres')).find((d) => d.id === 'familles')).toBeUndefined(); // rien n'a été créé
});

test('P2 la même liste dans la modification sur place du tableau ; Échap ou un texte inconnu laissent la famille d’avant', async ({ page }, info) => {
  await article('a1', { libelle: 'Tube PVC', type: 'fourniture', familleId: 'famille-1-7' });
  await ouvrirBordereau(page);
  const cellule = page.locator('.ligne-article[data-id="a1"] [data-colonne="famille"]');
  await expect(cellule).toHaveText('Fournitures › Plomberie et sanitaire');
  await cellule.locator('button').click();
  const champ = cellule.locator('.champ-intelligent input');
  await expect(champ).toBeFocused();
  await expect(page.locator('.suggestion-groupe')).toHaveCount(7); // toute la liste, même avec une famille déjà choisie
  await champ.fill('peint');
  await expect(page.getByRole('option', { name: /Fournitures › Peinture/ })).toBeVisible();
  await expect(page.getByRole('option', { name: /Main d’œuvre › Peintre/ })).toBeVisible();
  await capturer(page, info, 'P2-champ-famille-tableau');
  await champ.press('Escape');
  await expect(cellule).toHaveText('Fournitures › Plomberie et sanitaire');
  await cellule.locator('button').click();
  await cellule.locator('.champ-intelligent input').fill('peint');
  await page.getByRole('option', { name: /Main d’œuvre › Peintre/ }).click();
  await expect(cellule).toHaveText('Main d’œuvre › Peintre');
  expect((await listerDocuments('devis_articles')).find((d) => d.id === 'a1')).toMatchObject({ familleId: 'famille-2-5', type: 'main_oeuvre' });
});

test('P3 Réglages > Familles d’articles : les sept familles sans bouton, leurs sous-familles de départ ; ajouter, doublon refusé, renommer', { tag: '@smoke' }, async ({ page }, info) => {
  await ouvrirReglagesFamilles(page);
  await expect(page.locator('#reglages-familles [data-niveau="1"]')).toHaveCount(7);
  await expect(page.locator('#reglages-familles .ligne-famille-depart button')).toHaveCount(0); // verrouillées : ni renommer ni désactiver
  await expect(page.locator('#reglages-familles [data-niveau="2"]')).toHaveCount(35);
  await capturer(page, info, 'P3-reglages-familles');
  const fournitures = groupe(page, 'famille-1');
  // Ajouter une sous-famille.
  await fournitures.locator('[data-champ="nouvelle-sous-famille"]').fill('Zinguerie');
  await fournitures.locator('[data-action="ajouter-sous-famille"]').click();
  await expect(fournitures.locator('[data-niveau="2"] input').last()).toHaveValue('Zinguerie');
  await expect.poll(async () => (await lireDocument('devis_parametres/familles'))?.liste.find((f) => f.nom === 'Zinguerie')).toMatchObject({ parentId: 'famille-1', actif: true }); // M6 : attendre l'écriture
  // Doublon (sans accents ni casse) : message sous la famille, rien d'écrit.
  await fournitures.locator('[data-champ="nouvelle-sous-famille"]').fill('ELECTRICITE');
  await fournitures.locator('[data-action="ajouter-sous-famille"]').click();
  await expect(fournitures.locator('[data-erreur="famille-famille-1"]')).toContainText('existe déjà');
  await capturer(page, info, 'P3-doublon-refuse');
  // Nom trop long.
  await fournitures.locator('[data-champ="nouvelle-sous-famille"]').fill('x'.repeat(61));
  await fournitures.locator('[data-action="ajouter-sous-famille"]').click();
  await expect(fournitures.locator('[data-erreur="famille-famille-1"]')).toContainText('trop long');
  // Renommer une sous-famille de départ : son choix est gardé en base, l'identifiant reste.
  const peinture = fournitures.locator('[data-famille="famille-1-5"] input');
  await peinture.fill('Peinture et enduits');
  await peinture.press('Enter');
  await expect(page.locator('.toast', { hasText: 'Sous-famille renommée' })).toBeVisible();
  await expect.poll(async () => (await lireDocument('devis_parametres/familles'))?.liste.find((f) => f.id === 'famille-1-5')?.nom).toBe('Peinture et enduits');
  // Renommer avec le nom d'une voisine : refusé, le champ reprend l'ancien nom.
  await peinture.fill('Menuiserie');
  await peinture.press('Enter');
  await expect(fournitures.locator('[data-erreur="famille-famille-1"]')).toContainText('existe déjà');
  await expect(peinture).toHaveValue('Peinture et enduits');
});

test('P3 désactiver une sous-famille : confirmation, puis « … · Annuler » ; réactiver ; le champ de l’article ne la propose plus', async ({ page }, info) => {
  await ouvrirReglagesFamilles(page);
  const ligne = page.locator('#reglages-familles [data-famille="famille-1-9"]');
  await ligne.locator('[data-action="desactiver-famille"]').click();
  await expect(dialogue(page)).toContainText('Désactiver cette sous-famille ?');
  await dialogue(page).getByRole('button', { name: 'Désactiver' }).click();
  await expect(page.locator('.toast')).toContainText('désactivée');
  await expect(page.locator('.toast').getByRole('button', { name: 'Annuler' })).toBeVisible();
  await expect(ligne).toContainText('Désactivée');
  await capturer(page, info, 'P3-desactivee-annuler');
  // Annuler remet la sous-famille.
  await page.locator('.toast').getByRole('button', { name: 'Annuler' }).click();
  await expect(ligne.locator('[data-action="desactiver-famille"]')).toBeVisible();
  // Désactiver pour de bon, puis réactiver.
  await ligne.locator('[data-action="desactiver-famille"]').click();
  await dialogue(page).getByRole('button', { name: 'Désactiver' }).click();
  await expect(ligne.locator('[data-action="reactiver-famille"]')).toBeVisible();
  await expect.poll(async () => (await lireDocument('devis_parametres/familles'))?.liste.find((f) => f.id === 'famille-1-9')?.actif).toBe(false);
  // Le champ de l'article ne la propose plus.
  await page.evaluate(() => { location.hash = '#/devis/bordereau'; });
  await expect(page.locator('.page-devis')).toBeVisible();
  await page.locator('[data-action="nouvel-article"]').click();
  await dialogue(page).locator('#article-familleId').fill('quincaillerie');
  await expect(page.locator('.suggestions [role="option"]')).toHaveCount(0);
  await expect(dialogue(page).locator('.suggestion-vide')).toContainText('Aucune famille de ce nom');
  await page.keyboard.press('Escape');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { location.hash = '#/reglages/devis'; });
  await expect(page.locator('#reglages-familles')).toBeVisible();
  await ligne.locator('[data-action="reactiver-famille"]').click();
  await expect(ligne.locator('[data-action="desactiver-famille"]')).toBeVisible();
  await expect.poll(async () => (await lireDocument('devis_parametres/familles'))?.liste.find((f) => f.id === 'famille-1-9')?.actif).toBe(true);
});

test('P4 « ← Devis » ramène à la liste ; « Reprendre le devis en cours » n’existe qu’après l’ouverture d’un devis dans l’éditeur et le rouvre', { tag: '@smoke' }, async ({ page }, info) => {
  const maintenant = new Date();
  await ecrireDocument('devis_devis/d1', {
    racineId: 'd1', version: 1, numero: null, statut: 'brouillon', affaireId: null, organisationId: null, personneId: null, modeMarge: 'majoration', marge: 20, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, expireLe: '2027-01-01', destinataires: [], sections: [], creePar: 'jerome.chevalier@gmail.com', proprietaire: 'jerome.chevalier@gmail.com', creeLe: maintenant, modifieLe: maintenant,
  });
  await connecter(page, undefined, { route: 'devis/liste' });
  await expect(page.locator('.page-devis')).toBeVisible();
  // Depuis la liste > Bordereau > la flèche « ‹ Devis » (en haut à gauche) : retour à la liste. Aucun devis n'a été ouvert : pas de second bouton.
  await page.evaluate(() => { location.hash = '#/devis/bordereau'; });
  await expect(page.locator('[data-action="retour-devis"]')).toBeVisible();
  await expect(page.locator('[data-action="reprendre-devis"]')).toHaveCount(0);
  await capturer(page, info, 'P4-bordereau-retour');
  await page.locator('[data-action="retour-devis"]').click();
  await expect(page).toHaveURL(/#\/devis\/liste$/);
  // Après l'ouverture d'un devis dans l'éditeur, le Bordereau propose de le reprendre.
  await page.evaluate(() => { location.hash = '#/devis/editeur/d1'; });
  await expect(page).toHaveURL(/#\/devis\/editeur\/d1$/);
  await page.evaluate(() => { location.hash = '#/devis/bordereau'; });
  await expect(page.locator('[data-action="reprendre-devis"]')).toBeVisible();
  await capturer(page, info, 'P4-bordereau-reprendre');
  await page.locator('[data-action="reprendre-devis"]').click();
  await expect(page).toHaveURL(/#\/devis\/editeur\/d1$/);
});
