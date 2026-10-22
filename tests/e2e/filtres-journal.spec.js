// Écran Journal des modifications : même bouton « Filtres » et même fenêtre à cases que les autres listes (nuit du 22 au 23/10/2026, sujet filtres-journal).
// Un test par critère (H1 à H5, nom commençant par le numéro), UNE capture par critère dans tests/e2e/captures/filtres-journal/.
import { test, expect, attendreCalme, connecter, allerA, ecrireDocument, estTelephone } from './outils.js';

const CAPTURES = 'e2e/captures/filtres-journal';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
// Ces écrans n'utilisent pas Google : le script de l'API est remplacé par un fichier vide (sans réseau, il ne produit pas d'erreur de console).
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});
const dialogue = (page) => page.getByRole('dialog');
const bouton = (page) => page.locator('[data-action="filtres"]');
const compte = (page) => bouton(page).locator('.compteur-filtres');
const lignes = (page) => page.locator('.tableau-journal tbody tr');
const MIN = 60000;

/** Quatre opérations : Appli réussie, Appli à vérifier, MCP réussie, MCP à vérifier. */
async function semer() {
  const modeles = [
    ['journal-a', 'opA', 'ecran', 'succes', 'jerome.chevalier@gmail.com', 10],
    ['journal-b', 'opB', 'ecran', 'en_cours', 'jerome.chevalier@gmail.com', 20],
    ['journal-c', 'opC', 'mcp', 'succes', 'claude-code-jerome', 30],
    ['journal-d', 'opD', 'mcp', 'en_cours', 'claude-code-jerome', 40],
  ];
  for (const [id, operationId, via, statut, acteur, minutes] of modeles) {
    await ecrireDocument(`crm_audit/${id}`, { operationId, ordre: 1, acteur, jeton: acteur, via, outil: 'creerPersonne', collection: 'crm_personnes', docId: `p-${id}`, action: 'creer', statut, champsModifies: ['nom'], parametresRecus: ['nom'], date: new Date(Date.now() - minutes * MIN) });
  }
}
async function ouvrirJournal(page) {
  await connecter(page);
  await allerA(page, 'Journal des modifications');
  await expect(page.getByRole('heading', { name: 'Journal des modifications' })).toBeVisible();
  await expect(lignes(page)).toHaveCount(4);
}
async function cocherEtAppliquer(page, ...cases) {
  await bouton(page).click();
  for (const [cle, valeur] of cases) {
    const c = valeur ? dialogue(page).locator(`input[data-cle="${cle}"][data-valeur="${valeur}"]`) : dialogue(page).locator(`input[data-cle="${cle}"]`);
    await c.check();
  }
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(dialogue(page)).toHaveCount(0);
}

test('H1 le Journal a le bouton commun « Filtres » (plus de liste déroulante) avec le Canal et « À vérifier seulement » en cases à cocher', async ({ page }) => {
  await semer();
  await ouvrirJournal(page);
  await expect(page.locator('[data-role="filtre-canal"]')).toHaveCount(0);
  await expect(page.locator('[data-role="filtre-a-verifier"]')).toHaveCount(0);
  await expect(bouton(page)).toHaveCount(1);
  await expect(compte(page)).toHaveCount(0);
  await expect(page.getByLabel('Depuis le')).toBeVisible(); // la date et la recherche restent dans la barre
  await expect(page.getByLabel('Rechercher dans le journal')).toBeVisible();
  await bouton(page).click();
  await expect(dialogue(page).locator('input[data-cle="canaux"]')).toHaveCount(2);
  await expect(dialogue(page).locator('input[data-cle="canaux"][data-valeur="ecran"]')).toBeVisible();
  await expect(dialogue(page).locator('input[data-cle="canaux"][data-valeur="mcp"]')).toBeVisible();
  await expect(dialogue(page).locator('input[data-cle="aVerifier"]')).toBeVisible();
  await capture(page, 'H1-fenetre');
});

test('H2 plusieurs cases : OU dans le groupe Canal (Appli + MCP = tout), ET avec « À vérifier seulement » ; cas vide avec message', async ({ page }) => {
  await semer();
  await ouvrirJournal(page);
  await cocherEtAppliquer(page, ['canaux', 'mcp']);
  await expect(lignes(page)).toHaveCount(2);
  await cocherEtAppliquer(page, ['canaux', 'ecran']);
  await expect(lignes(page)).toHaveCount(4); // OU dans un même groupe
  await cocherEtAppliquer(page, ['aVerifier']);
  await expect(lignes(page)).toHaveCount(2); // ET entre groupes : (Appli ou MCP) et à vérifier
  await bouton(page).click();
  await dialogue(page).locator('input[data-cle="canaux"][data-valeur="ecran"]').uncheck();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(lignes(page)).toHaveCount(1); // MCP et à vérifier
  await expect(lignes(page).first()).toContainText('MCP');
  await capture(page, 'H2-resultat');
  // cas vide : rien ne correspond, le message le dit ; le bouton « lignes plus anciennes » / le pied reste visible
  await page.getByLabel('Rechercher dans le journal').fill('zzz-introuvable');
  await expect(page.getByText('Rien à afficher avec ces filtres. Décoche un filtre.')).toBeVisible();
  await expect(page.locator('.journal-pied')).toContainText('Tout le journal est chargé');
});

test('H3 la pastille vaut le nombre de cases cochées ; « Tout effacer » remet à zéro mais garde la recherche', async ({ page }) => {
  await semer();
  await ouvrirJournal(page);
  await page.getByLabel('Rechercher dans le journal').fill('claude');
  await expect(lignes(page)).toHaveCount(2);
  await cocherEtAppliquer(page, ['canaux', 'mcp'], ['aVerifier']);
  await expect(compte(page)).toHaveText('2');
  await expect(lignes(page)).toHaveCount(1);
  await capture(page, 'H3-pastille');
  await bouton(page).click();
  await dialogue(page).getByRole('button', { name: 'Tout effacer' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  await expect(compte(page)).toHaveCount(0);
  await expect(page.getByLabel('Rechercher dans le journal')).toHaveValue('claude');
  await expect(lignes(page)).toHaveCount(2);
});

test('H4 les filtres sont gardés quand on change d’écran et revient, et disparaissent au rechargement de la page', async ({ page }) => {
  await semer();
  await ouvrirJournal(page);
  await cocherEtAppliquer(page, ['canaux', 'ecran']);
  await expect(lignes(page)).toHaveCount(2);
  await allerA(page, 'Personnes');
  await allerA(page, 'Journal des modifications');
  await expect(lignes(page)).toHaveCount(2);
  await expect(compte(page)).toHaveText('1');
  await capture(page, 'H4-memorise');
  await page.reload();
  await attendreCalme(page);
  await allerA(page, 'Journal des modifications');
  await expect(lignes(page)).toHaveCount(4);
  await expect(compte(page)).toHaveCount(0);
});

test('H5 la même fenêtre s’ouvre dans l’écran (téléphone comme ordinateur), se coche et filtre', async ({ page }) => {
  await semer();
  await ouvrirJournal(page);
  await bouton(page).click();
  const boite = await dialogue(page).boundingBox();
  const vue = page.viewportSize();
  expect(boite.x).toBeGreaterThanOrEqual(0);
  expect(boite.x + boite.width).toBeLessThanOrEqual(vue.width + 1);
  await dialogue(page).locator('input[data-cle="canaux"][data-valeur="mcp"]').check();
  await capture(page, 'H5-fenetre');
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(lignes(page)).toHaveCount(2);
  await expect(compte(page)).toHaveText('1');
  const debordement = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(debordement).toBeLessThanOrEqual(1); // pas de défilement horizontal de la page
  await capture(page, 'H5-liste');
});
