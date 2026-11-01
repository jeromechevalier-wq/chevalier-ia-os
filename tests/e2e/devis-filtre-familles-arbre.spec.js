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

const casesFamille = (page, valeur) => dialogue(page).locator(`[data-cle="familles"][data-valeur="${valeur}"]`);
async function arbreDeux() {
  await ecrireDocument('devis_parametres/familles', { liste: [{ id: 'sous-1', nom: 'Carrelage', actif: true, parentId: 'famille-1' }, { id: 'sous-2', nom: 'Peinture', actif: true, parentId: 'famille-1' }] });
  await article('a2', { libelle: 'Carreau', type: 'fourniture', familleId: 'sous-1' });
  await article('a3', { libelle: 'Colle', type: 'fourniture' });
  await article('a4', { libelle: 'Pose', type: 'main_oeuvre', familleId: 'famille-2' });
}

test('2 cocher une famille garde les articles de ses sous-familles ; une sous-famille seule ne garde qu’elle', async ({ page }) => {
  await arbreDeux();
  await ouvrirFiltres(page);
  await casesFamille(page, 'famille-1').check();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('.ligne-article')).toHaveCount(2);
  await page.locator('[data-action="filtres"]').click();
  await casesFamille(page, 'famille-1').uncheck();
  await casesFamille(page, 'sous-1').check();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('.ligne-article[data-id="a2"]')).toHaveCount(1);
  await expect(page.locator('.ligne-article')).toHaveCount(1);
});

test('5.1 cocher une famille coche aussitôt ses sous-familles, grisées et non modifiables', async ({ page }, info) => {
  await arbreDeux();
  await ouvrirFiltres(page);
  await casesFamille(page, 'famille-1').check();
  for (const id of ['sous-1', 'sous-2']) {
    await expect(casesFamille(page, id)).toBeChecked();
    await expect(casesFamille(page, id)).toBeDisabled();
    await expect(casesFamille(page, id)).toHaveAttribute('aria-disabled', 'true');
  }
  await expect(casesFamille(page, 'famille-2')).not.toBeChecked();
  await capturer(page, info, '5-1-famille-cochee');
});

test('5.2 décocher la famille dégrise et décoche ses sous-familles', async ({ page }) => {
  await arbreDeux();
  await ouvrirFiltres(page);
  await casesFamille(page, 'famille-1').check();
  await casesFamille(page, 'famille-1').uncheck();
  for (const id of ['sous-1', 'sous-2']) {
    await expect(casesFamille(page, id)).not.toBeChecked();
    await expect(casesFamille(page, id)).toBeEnabled();
  }
});

test('5.3 tant que la famille n’est pas cochée, chaque sous-famille se coche et se décoche seule', async ({ page }, info) => {
  await arbreDeux();
  await ouvrirFiltres(page);
  await casesFamille(page, 'sous-1').check();
  await expect(casesFamille(page, 'sous-2')).not.toBeChecked();
  await expect(casesFamille(page, 'famille-1')).not.toBeChecked();
  await capturer(page, info, '5-3-sous-famille-seule');
  await casesFamille(page, 'sous-1').uncheck();
  await expect(casesFamille(page, 'sous-1')).not.toBeChecked();
});

test('5.4 sous-familles déjà cochées puis famille cochée : la famille prend tout ; décochée, tout est décoché', async ({ page }) => {
  await arbreDeux();
  await ouvrirFiltres(page);
  await casesFamille(page, 'sous-1').check();
  await casesFamille(page, 'famille-1').check();
  await expect(casesFamille(page, 'sous-1')).toBeDisabled();
  await expect(casesFamille(page, 'sous-2')).toBeChecked();
  await casesFamille(page, 'famille-1').uncheck();
  await expect(casesFamille(page, 'sous-1')).not.toBeChecked();
  await expect(casesFamille(page, 'sous-2')).not.toBeChecked();
});

test('5.5 le filtre appliqué, la pastille de compte et la réouverture restent cohérents ; « Sans famille » ne change pas', async ({ page }) => {
  await arbreDeux();
  await ouvrirFiltres(page);
  await casesFamille(page, 'sous-1').check();
  await casesFamille(page, 'famille-1').check();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('.ligne-article')).toHaveCount(2); // « Carreau » (sous-famille) et « Colle » (famille de départ de son type)
  await expect(page.locator('[data-action="filtres"] .compteur-filtres')).toHaveText('1'); // une famille = 1, pas 3
  await page.locator('[data-action="filtres"]').click();
  await expect(casesFamille(page, 'famille-1')).toBeChecked();
  await expect(casesFamille(page, 'sous-2')).toBeDisabled();
  await casesFamille(page, 'sans_famille').check();
  await expect(casesFamille(page, 'sans_famille')).toBeEnabled();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('.ligne-article')).toHaveCount(2); // « Sans famille » n'ajoute ici aucun article
  await page.locator('[data-action="filtres"]').click();
  await dialogue(page).getByRole('button', { name: 'Tout effacer' }).click();
  await expect(page.locator('.ligne-article')).toHaveCount(3);
});

test('5.6 clavier : Espace sur la famille coche et décoche ; une sous-famille grisée est désactivée', async ({ page }) => {
  await arbreDeux();
  await ouvrirFiltres(page);
  await casesFamille(page, 'famille-1').focus();
  await page.keyboard.press('Space');
  await expect(casesFamille(page, 'sous-1')).toBeDisabled();
  await page.keyboard.press('Space');
  await expect(casesFamille(page, 'sous-1')).toBeEnabled();
});

test('5.7 cas vide : aucune famille, « Sans famille » seul et aucune case grisée', async ({ page }, info) => {
  await ecrireDocument('devis_parametres/familles', { liste: [] });
  await ouvrirFiltres(page);
  await expect(dialogue(page).locator('input[data-cle="familles"]:disabled')).toHaveCount(0);
  await capturer(page, info, '5-7-vide');
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

test('6 sous-famille inactive : absente du filtre si aucun article n’y est rangé, proposée « (désactivée) » sinon ; les grandes familles restent', async ({ page }, info) => {
  await ecrireDocument('devis_parametres/familles', { liste: [
    { id: 'famille-1-1', nom: 'Gros œuvre et maçonnerie', actif: false, parentId: 'famille-1' },
    { id: 'famille-1-2', nom: 'Carrelage et revêtements', actif: false, parentId: 'famille-1' },
    { id: 'agence-sites', nom: 'Sites internet', actif: true, parentId: 'famille-2' },
  ] });
  await article('a5', { libelle: 'Carreau ancien', type: 'fourniture', familleId: 'famille-1-2' });
  await ouvrirFiltres(page);
  await expect(casesFamille(page, 'famille-1-1')).toHaveCount(0);
  await expect(dialogue(page).locator('label:has([data-cle="familles"][data-valeur="famille-1-2"])')).toHaveText('Carrelage et revêtements (désactivée)');
  await expect(casesFamille(page, 'agence-sites')).toHaveCount(1);
  await expect(casesFamille(page, 'famille-1')).toHaveCount(1);
  await casesFamille(page, 'famille-1-2').check();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('.ligne-article[data-id="a5"]')).toHaveCount(1);
  await page.locator('[data-action="filtres"]').click();
  await capturer(page, info, '6-inactives');
});

test('7 jeu « agence » chargé : le filtre ne montre que les familles de l’agence (aucune Sous-traitance, Matériels, Fournitures, Divers, Textes), une famille désactivée avec un article reste « désactivée »', async ({ page }, info) => {
  // Document tel que l'écrit `--metier agence` (premier niveau renommé ou désactivé, sous-familles de l'agence, sous-familles du bâtiment masquées).
  const liste = [
    { id: 'famille-1', nom: 'Panneaux d’affichage', actif: true }, { id: 'famille-2', nom: 'Services numériques', actif: true }, { id: 'famille-3', nom: 'Prestations complètes', actif: true }, { id: 'famille-5', nom: 'Écrans en location', actif: true },
    { id: 'famille-4', nom: 'Sous-traitance', actif: false }, { id: 'famille-6', nom: 'Textes', actif: false }, { id: 'famille-7', nom: 'Divers', actif: false },
    { id: 'agence-sites', nom: 'Sites internet', actif: true, parentId: 'famille-2' }, { id: 'agence-affichage', nom: 'Panneaux', actif: true, parentId: 'famille-1' },
    { id: 'agence-ecrans', nom: 'Téléviseurs et supports', actif: true, parentId: 'famille-5' }, { id: 'agence-complet', nom: 'Packs clés en main', actif: true, parentId: 'famille-3' },
    // Toutes les sous-familles de départ (famille-N-M) sont écrites inactives, avec un nom (les 7 familles ont 9, 9, 5, 5, 2, 2 et 3 sous-familles).
    ...[9, 9, 5, 5, 2, 2, 3].flatMap((n, i) => Array.from({ length: n }, (_, j) => ({ id: `famille-${i + 1}-${j + 1}`, nom: `Départ ${i + 1}-${j + 1}`, actif: false, parentId: `famille-${i + 1}` }))),
  ];
  await ecrireDocument('devis_parametres/familles', { liste });
  await article('ag-p01', { libelle: 'Panneau 120 x 80', type: 'fourniture', familleId: 'agence-affichage' });
  await article('ag-s01', { libelle: 'Site vitrine', type: 'main_oeuvre', familleId: 'agence-sites' });
  await article('ag-t01', { libelle: 'Location téléviseur', type: 'materiel', familleId: 'agence-ecrans' });
  await article('ag-o01', { libelle: 'Site complet', type: 'ouvrage', familleId: 'agence-complet' });
  await ouvrirFiltres(page);
  const libelles = await dialogue(page).locator('label:has([data-cle="familles"])').allInnerTexts();
  for (const interdit of ['Sous-traitance', 'Matériels', 'Fournitures', 'Divers', 'Textes', 'Main d’œuvre', 'Ouvrages', 'Départ']) expect(libelles.join(' | '), interdit).not.toContain(interdit);
  for (const attendu of ['Panneaux d’affichage', 'Services numériques', 'Prestations complètes', 'Écrans en location', 'Panneaux', 'Téléviseurs et supports', 'Packs clés en main', 'Sites internet']) expect(libelles.join(' | '), attendu).toContain(attendu);
  await capturer(page, info, '7-agence');
  // Cas d’erreur : un article ancien dans une famille désactivée la fait réapparaître, avec la mention.
  await article('a-vieux', { libelle: 'Ancienne sous-traitance', type: 'sous_traitance', familleId: 'famille-4' });
  await page.reload();
  await attendreCalme(page);
  await page.locator('[data-action="filtres"]').click();
  await expect(dialogue(page).locator('label:has([data-cle="familles"][data-valeur="famille-4"])')).toContainText('désactivée');
});
