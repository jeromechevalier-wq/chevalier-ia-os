// Écran Automatisations (historique) : bouton « Filtres » commun, fenêtre à cases à cocher, pastille, « Tout effacer », mémoire jusqu'au rechargement.
// Tests AF1 à AF5 (une capture chacun dans tests/e2e/captures/filtres-automatisations/). Les fonctions du serveur sont simulées, comme dans automatisations.spec.js.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, ecrireDocument, estTelephone, PROJET, FIRESTORE, URL_APP } from './outils.js';

const ALICE = 'alice@exemple.test';
const CAPTURES = 'e2e/captures/filtres-automatisations';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });

async function chargerRegles(fichier) {
  const contenu = await readFile(fileURLToPath(new URL(`../../${fichier}`, import.meta.url)), 'utf8');
  const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: fichier, content: contenu }] } }),
  });
  if (!r.ok) throw new Error(`Règles non chargées (${fichier}) : ${await r.text()}`);
}
test.beforeAll(() => chargerRegles('firestore.plateforme.rules'));
test.afterAll(() => chargerRegles('firestore.rules'));

const MIN = 60000;
const il_y_a = (ms) => new Date(Date.now() - ms);
const exe = (id, workflowId, status, ago, extra = {}) => ({
  executionId: String(id), workflowId, workflowLabel: workflowId === 'wf1' ? 'Lire une fiche' : 'Mon mois', status, stale: false, mode: 'webhook',
  startedAt: il_y_a(ago), stoppedAt: status === 'running' ? null : il_y_a(ago - 1500), durationMs: status === 'running' ? null : 1500,
  retryOf: null, errorMessage: null, failedStep: null, runGroupId: null, source: 'sync', lastSyncedAt: new Date(), expireAt: null, ...extra,
});

test.beforeEach(async ({ page, context }) => {
  // Cet écran n'utilise pas Google : le script de l'API est remplacé par un fichier vide (sans réseau, il ne produit pas d'erreur de console).
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/json' };
  await page.route('**/automatisationsRafraichir', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { resultat: 'mis-a-jour', lastSyncedAt: Date.now() } }) });
  });
  for (const [id, nom] of [['cabinet', 'Cabinet Martin'], ['vide', 'Cabinet Vide']]) {
    await ecrireDocument(`marques/${id}`, { actif: true, nom, couleur: '#336699', accueil: 'Bienvenue.' });
    await ecrireDocument(`clients/${id}`, { modules: { automatisations: true } });
    await ecrireDocument(`clients/${id}/membres/${ALICE}`, { role: 'editeur' });
  }
  await ecrireDocument('clients/cabinet/workflows/wf1', { workflowId: 'wf1', nom: 'Lire une fiche', active: true, stepsPlan: [] });
  await ecrireDocument('clients/cabinet/workflows/wf2', { workflowId: 'wf2', nom: 'Mon mois', libelle: 'Bilan du mois', active: true, stepsPlan: [] });
  await ecrireDocument('clients/cabinet/executions/101', exe(101, 'wf1', 'success', 50 * MIN));
  await ecrireDocument('clients/cabinet/executions/102', exe(102, 'wf1', 'error', 40 * MIN, { errorMessage: 'Trop de demandes', failedStep: 'Lire Presences' }));
  await ecrireDocument('clients/cabinet/executions/103', exe(103, 'wf2', 'running', 20 * MIN)); // bloquée : à vérifier
  await ecrireDocument('clients/cabinet/executions/104', exe(104, 'wf2', 'running', 2 * MIN)); // en cours
  await ecrireDocument('clients/cabinet/executions/105', exe(105, 'wf2', 'success', 3 * MIN));
  await ecrireDocument('clients/cabinet/sync/state', { n8nOk: true, lastSyncedAt: new Date(), lastSuccessAt: new Date() });
  await ecrireDocument('clients/vide/sync/state', { n8nOk: true, lastSyncedAt: new Date(), lastSuccessAt: new Date() });
});

async function ouvrir(page, client) {
  await page.goto('about:blank');
  await page.goto(`${URL_APP}#/espace/${client}`);
  await page.waitForFunction(() => !!window.__chevalierTest);
  await page.evaluate((e) => window.__chevalierTest.connecter(e, true), ALICE);
  await expect(page.locator('.coquille')).toBeVisible();
  if (client === 'cabinet') await expect(page.locator('.autom-ligne')).toHaveCount(5);
}
const lignes = (page) => page.locator('.autom-ligne');
const bouton = (page) => page.locator('[data-action="filtres"]');
const compte = (page) => bouton(page).locator('.compteur-filtres');
const dialogue = (page) => page.getByRole('dialog');
const caseA = (page, cle, valeur) => dialogue(page).locator(`input[data-cle="${cle}"][data-valeur="${valeur}"]`);
const appliquer = (page) => dialogue(page).getByRole('button', { name: 'Appliquer' }).click();

test('AF1 le bouton commun « Filtres » remplace les listes déroulantes ; la fenêtre propose Automatisation et État en cases à cocher (sans « Tous les états »), et rien d\'impossible', async ({ page, erreursConsole }) => {
  await ouvrir(page, 'cabinet');
  await expect(lignes(page)).toHaveCount(5);
  await expect(bouton(page)).toBeVisible();
  await expect(bouton(page)).toContainText('Filtres');
  await expect(page.getByLabel('Filtrer par automatisation')).toHaveCount(0);
  await expect(page.getByLabel('Filtrer par état')).toHaveCount(0);
  await bouton(page).click();
  await expect(dialogue(page).locator('legend')).toHaveText(['Automatisation', 'État']);
  await expect(dialogue(page).locator('input[data-cle="workflowIds"]')).toHaveCount(2);
  await expect(dialogue(page).getByText('Bilan du mois')).toBeVisible();
  await expect(dialogue(page).locator('input[data-cle="etats"]')).toHaveCount(4); // en cours, terminées, en erreur, à vérifier
  await expect(dialogue(page)).not.toContainText('Tous les états');
  await capture(page, 'AF1-fenetre');
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  await expect(lignes(page)).toHaveCount(5); // rien coché : rien ne change
  expect(erreursConsole).toEqual([]);
});

test('AF1b cas vide : sans aucune exécution, le bouton « Filtres » ne s\'affiche pas ; avec des filtres qui ne laissent rien, le message et « Réinitialiser les filtres » apparaissent', async ({ page }) => {
  await ouvrir(page, 'vide');
  await expect(page.locator('.autom-vide')).toBeVisible();
  await expect(bouton(page)).toBeHidden();
  await ouvrir(page, 'cabinet');
  await bouton(page).click();
  await caseA(page, 'workflowIds', 'wf1').check();
  await caseA(page, 'etats', 'running').check();
  await appliquer(page);
  await expect(lignes(page)).toHaveCount(0);
  await expect(page.locator('.autom-aucun-resultat')).toContainText('Rien à afficher avec ces filtres. Décoche un filtre.');
  await capture(page, 'AF1-vide');
  await page.getByRole('button', { name: 'Réinitialiser les filtres' }).click();
  await expect(lignes(page)).toHaveCount(5);
  await expect(compte(page)).toHaveCount(0);
});

test('AF2 plusieurs cases : « OU » dans un groupe (En erreur + Terminées = 3), « ET » entre groupes (+ Lire une fiche = 2)', async ({ page }) => {
  await ouvrir(page, 'cabinet');
  await bouton(page).click();
  await caseA(page, 'etats', 'error').check();
  await caseA(page, 'etats', 'success').check();
  await appliquer(page);
  await expect(lignes(page)).toHaveCount(3);
  await bouton(page).click();
  await caseA(page, 'workflowIds', 'wf1').check();
  await capture(page, 'AF2-cases');
  await appliquer(page);
  await expect(lignes(page)).toHaveCount(2);
  await expect(page.locator('.autom-ligne[data-etat="error"]')).toHaveCount(1);
  await expect(page.locator('.autom-ligne[data-etat="success"]')).toHaveCount(1);
});

test('AF3 la pastille compte les cases cochées ; « Tout effacer » remet tout à zéro ; le clavier ramène sur le bouton', async ({ page }) => {
  await ouvrir(page, 'cabinet');
  await expect(compte(page)).toHaveCount(0);
  await bouton(page).click();
  await caseA(page, 'workflowIds', 'wf2').check();
  await caseA(page, 'etats', 'running').check();
  await caseA(page, 'etats', 'stale').check();
  await appliquer(page);
  await expect(compte(page)).toHaveText('3');
  await expect(lignes(page)).toHaveCount(2);
  await capture(page, 'AF3-pastille');
  await bouton(page).click();
  await dialogue(page).getByRole('button', { name: 'Tout effacer' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  await expect(compte(page)).toHaveCount(0);
  await expect(lignes(page)).toHaveCount(5);
  await expect(bouton(page)).toBeFocused();
});

test('AF4 les cases cochées restent quand on change d\'écran et qu\'on revient ; elles disparaissent au rechargement de la page', async ({ page }) => {
  await ouvrir(page, 'cabinet');
  await bouton(page).click();
  await caseA(page, 'etats', 'error').check();
  await appliquer(page);
  await expect(lignes(page)).toHaveCount(1);
  await page.evaluate(() => { location.hash = '#/espace/cabinet/zz-introuvable'; });
  await expect(lignes(page)).toHaveCount(0);
  await page.evaluate(() => { location.hash = '#/espace/cabinet/automatisations/historique'; });
  await expect(lignes(page)).toHaveCount(1);
  await expect(compte(page)).toHaveText('1');
  await capture(page, 'AF4-memorise');
  await page.reload();
  await page.waitForFunction(() => !!window.__chevalierTest);
  await page.evaluate((e) => window.__chevalierTest.connecter(e, true), ALICE);
  await expect(lignes(page)).toHaveCount(5);
  await expect(compte(page)).toHaveCount(0);
});

test('AF5 téléphone et ordinateur : le bouton « Filtres » et la fenêtre tiennent dans l\'écran, sans défilement horizontal', async ({ page }) => {
  await ouvrir(page, 'cabinet');
  const largeur = page.viewportSize().width;
  await expect(bouton(page)).toBeVisible();
  const boite = await bouton(page).boundingBox();
  expect(boite.x).toBeGreaterThanOrEqual(0);
  expect(boite.x + boite.width).toBeLessThanOrEqual(largeur);
  await bouton(page).click();
  const fenetre = await dialogue(page).boundingBox();
  expect(fenetre.x).toBeGreaterThanOrEqual(0);
  expect(fenetre.x + fenetre.width).toBeLessThanOrEqual(largeur);
  await caseA(page, 'etats', 'error').check();
  await capture(page, 'AF5-fenetre');
  await appliquer(page);
  await expect(compte(page)).toHaveText('1');
  await capture(page, 'AF5-liste');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
