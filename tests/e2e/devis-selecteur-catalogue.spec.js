// Module Devis, sélecteur du catalogue (PR C1 de docs/cadrage-vocabulaire-cibles.md) : recherche + arbre famille › sous-famille › articles, dans la création d'un mot et « Changer l'article ».
// Un test par point (le nom commence par C1.x), une capture par état clé dans tests/e2e/captures/devis-selecteur-catalogue/ (le nom de la capture dit le format). Articles INVENTÉS.
import { fileURLToPath } from 'node:url';
import {
  test, expect, connecter, attendreCalme, ecrireDocument, lireDocument,
} from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-selecteur-catalogue/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name === 'telephone' ? 'tel' : 'ordi'}.png`, fullPage: true, animations: 'disabled' });
}
const dialogue = (page) => page.getByRole('dialog');
const maintenant = new Date();
const ELECTRICITE = 'famille-1-8'; // Fournitures › Électricité (sous-famille de départ)

async function article(id, valeurs = {}) {
  await ecrireDocument(`devis_articles/${id}`, {
    code: '', libelle: 'Article test', unite: 'u', prixAchat: 10, tauxTva: null, actif: true, proprietaire: 'jerome.chevalier@gmail.com',
    creeLe: maintenant, modifieLe: maintenant, creePar: 'jerome.chevalier@gmail.com', modifiePar: 'jerome.chevalier@gmail.com', ...valeurs,
  });
}
async function catalogue() {
  await article('a02', { libelle: 'Prise double 16 A', type: 'fourniture', familleId: ELECTRICITE });
  await article('a03', { libelle: 'Interrupteur simple', type: 'fourniture', familleId: ELECTRICITE });
  await article('a08', { libelle: 'Gaine ICTA 20 mm', type: 'fourniture', unite: 'm' }); // sans familleId : la famille de départ de son type
}
async function ouvrirCreation(page) {
  await connecter(page, undefined, { route: 'devis/vocabulaire' });
  await expect(page.locator('.page-vocabulaire')).toBeVisible();
  await attendreCalme(page);
  await page.locator('[data-action="ajouter-mot"]').click();
  await expect(dialogue(page)).toContainText('Ajouter un mot appris');
}
const famille = (page, id) => dialogue(page).locator(`[data-arbre-famille="${id}"]`);
const champ = (page) => dialogue(page).getByRole('searchbox', { name: 'Chercher un article du catalogue' });

test('C1.1 l’arbre montre les familles ; déplier « Fournitures » puis « Électricité » montre les articles, et en choisir un le met dans « Article choisi »', async ({ page }, info) => {
  await catalogue();
  await ouvrirCreation(page);
  await expect(dialogue(page).locator('[data-role="article-choisi"]')).toContainText('Rien de choisi.'); // C6b : la fenêtre de création est en mode mixte (articles ET familles)
  await expect(famille(page, 'famille-1')).toHaveAttribute('aria-expanded', 'false');
  await expect(dialogue(page).locator('[data-arbre-article]')).toHaveCount(0); // rien n'est déployé au départ
  await capturer(page, info, 'C1.1-arbre-ferme');
  await famille(page, 'famille-1').click();
  await expect(famille(page, 'famille-1')).toHaveAttribute('aria-expanded', 'true');
  await expect(dialogue(page).locator('[data-arbre-article="a08"]')).toBeVisible(); // directement dans Fournitures
  await famille(page, ELECTRICITE).click();
  await expect(dialogue(page).locator('[data-arbre-article]')).toHaveCount(3);
  await capturer(page, info, 'C1.1-arbre-deplie');
  await dialogue(page).locator('[data-arbre-article="a02"]').click();
  await expect(dialogue(page).locator('[data-role="article-choisi"]')).toContainText('Prise double 16 A');
  await expect(dialogue(page).locator('[data-arbre-article="a02"] input')).toBeChecked();
  await dialogue(page).getByRole('textbox', { name: 'Expression' }).fill('prises doubles');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  expect(await lireDocument('devis_vocabulaire/prise_double')).toMatchObject({ articleId: 'a02', articleLibelle: 'Prise double 16 A' });
});

test('C1.2 la recherche garde son nom « Chercher un article du catalogue », trouve dès la première lettre, cache l’arbre pendant la saisie, et un choix rend l’arbre', async ({ page }, info) => {
  await catalogue();
  await ouvrirCreation(page);
  await champ(page).fill('p');
  await expect(dialogue(page).locator('[data-article-id="a02"]')).toBeVisible();
  await expect(dialogue(page).locator('[data-role="arbre-catalogue"]')).toBeHidden();
  await champ(page).fill('prise');
  await expect(dialogue(page).locator('[data-article-id]')).toHaveCount(1);
  await capturer(page, info, 'C1.2-recherche');
  await dialogue(page).locator('[data-article-id="a02"]').click();
  await expect(dialogue(page).locator('[data-role="article-choisi"]')).toContainText('Prise double 16 A');
  await expect(champ(page)).toHaveValue('');
  await expect(dialogue(page).locator('[data-role="arbre-catalogue"]')).toBeVisible();
});

test('C1.3 « Changer l’article » ouvre l’arbre déjà déplié sur l’article actuel, Enregistrer reste grisé jusqu’à un autre choix', async ({ page }, info) => {
  await catalogue();
  await ecrireDocument('devis_vocabulaire/prise_double', {
    cle: 'prise double', expression: 'prises doubles', articleId: 'a02', articleLibelle: 'Prise double 16 A', statut: 'active', origine: 'manuelle', confirmations: 0, contradictions: 0, conflit: false, exemples: [], creeLe: maintenant, modifieLe: maintenant,
  });
  await connecter(page, undefined, { route: 'devis/vocabulaire' });
  await expect(page.locator('.page-vocabulaire')).toBeVisible();
  await attendreCalme(page);
  await page.locator('tr[data-id="prise_double"] [data-action="menu-mot"]').click();
  await page.getByRole('menuitem', { name: 'Changer l’article', exact: true }).click();
  await expect(dialogue(page)).toContainText('Changer l’article');
  await expect(dialogue(page).locator('[data-arbre-article="a02"]')).toBeInViewport(); // ouvert sur le chemin de l'article actuel, et visible dans le cadre
  await expect(dialogue(page).locator('[data-arbre-article="a02"]')).toHaveAttribute('aria-pressed', 'true');
  const enregistrer = dialogue(page).getByRole('button', { name: 'Enregistrer' });
  await expect(enregistrer).toHaveAttribute('aria-disabled', 'true');
  await capturer(page, info, 'C1.3-changer-article');
  await dialogue(page).locator('[data-arbre-article="a03"]').click();
  await expect(enregistrer).toHaveAttribute('aria-disabled', 'false');
  await enregistrer.click();
  await expect(dialogue(page)).toHaveCount(0);
  expect(await lireDocument('devis_vocabulaire/prise_double')).toMatchObject({ articleId: 'a03', articleLibelle: 'Interrupteur simple' });
});

test('C1.4 cas vide : un catalogue sans article dit quoi faire, avec le lien vers le catalogue', async ({ page }, info) => {
  await ouvrirCreation(page);
  await expect(dialogue(page).locator('[data-vide="catalogue"]')).toContainText('Ton catalogue est vide : crée tes articles dans le catalogue.');
  await expect(dialogue(page).locator('[data-vide="catalogue"] a')).toHaveAttribute('href', '#/devis/bordereau');
  await capturer(page, info, 'C1.4-catalogue-vide');
});

test('C1.5 cas vide : une famille sans article le dit ; une recherche sans résultat aussi', async ({ page }, info) => {
  await catalogue();
  await ouvrirCreation(page);
  await famille(page, 'famille-5').click(); // Matériels : aucun article
  await expect(dialogue(page).locator('[data-vide="famille"]')).toContainText('Aucun article dans cette famille.');
  await capturer(page, info, 'C1.5-famille-vide');
  await champ(page).fill('zzzz');
  await expect(dialogue(page)).toContainText('Aucun article ni famille ne correspond.'); // C6b : la fenêtre de création cherche aussi les familles
  await capturer(page, info, 'C1.5-aucun-resultat');
});

test('C1.6 le catalogue arrive après l’ouverture : l’arbre se met à jour sans perdre la famille dépliée ni la saisie, et au clavier le focus reste sur la famille', async ({ page }, info) => {
  await ouvrirCreation(page);
  await expect(dialogue(page).locator('[data-vide="catalogue"]')).toBeVisible();
  await dialogue(page).getByRole('textbox', { name: 'Expression' }).fill('prises');
  await catalogue(); // les articles arrivent pendant que la fenêtre est ouverte
  await expect(famille(page, 'famille-1')).toBeVisible();
  await famille(page, 'famille-1').focus();
  await page.keyboard.press('Enter'); // au clavier : Entrée déplie
  await expect(famille(page, 'famille-1')).toHaveAttribute('aria-expanded', 'true');
  await expect(famille(page, 'famille-1')).toBeFocused();
  await famille(page, ELECTRICITE).focus();
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab'); // la case de la famille est AVANT son en-tête : après l'en-tête vient la case du premier article (Interrupteur simple)
  await page.keyboard.press('Space'); // Espace coche
  await expect(dialogue(page).locator('[data-role="article-choisi"]')).toContainText('Interrupteur simple');
  await article('a09', { libelle: 'Prise étanche', type: 'fourniture', familleId: ELECTRICITE }); // un autre article arrive : l'arbre reste déplié, la saisie reste
  await expect(dialogue(page).locator('[data-arbre-article="a09"]')).toBeVisible();
  await expect(dialogue(page).getByRole('textbox', { name: 'Expression' })).toHaveValue('prises');
  await capturer(page, info, 'C1.6-arrivee-tardive');
});

test('C1.7 « Changer l’article » : quand le catalogue s’agrandit après l’ouverture, l’article actuel reste visible dans le cadre', async ({ page }, info) => {
  await article('m01', { libelle: 'Exemple – Aide de chantier (taux horaire)', type: 'main_oeuvre', unite: 'h', familleId: 'famille-2-9' });
  await ecrireDocument('devis_vocabulaire/arpete', {
    cle: 'arpete', expression: 'arpète', articleId: 'm01', articleLibelle: 'Exemple – Aide de chantier (taux horaire)', statut: 'active', origine: 'manuelle', confirmations: 0, contradictions: 0, conflit: false, exemples: [], creeLe: maintenant, modifieLe: maintenant,
  });
  await connecter(page, undefined, { route: 'devis/vocabulaire' });
  await expect(page.locator('.page-vocabulaire')).toBeVisible();
  await attendreCalme(page);
  await page.locator('tr[data-id="arpete"] [data-action="menu-mot"]').click();
  await page.getByRole('menuitem', { name: 'Changer l’article', exact: true }).click();
  await expect(dialogue(page).locator('[data-arbre-article="m01"]')).toBeInViewport();
  for (let i = 1; i <= 12; i += 1) await article(`a-${i}`, { libelle: `Aide ${String(i).padStart(2, '0')}`, type: 'main_oeuvre', unite: 'h', familleId: 'famille-2-9' }); // arrivent après l'ouverture, rangés avant « Exemple »
  await expect(dialogue(page).locator('[data-arbre-article="a-12"]')).toBeAttached();
  await expect(dialogue(page).locator('[data-arbre-article="m01"]')).toBeInViewport();
  await capturer(page, info, 'C1.7-catalogue-agrandi');
});
