// Module Pilotage (23/11/2026) : écran de graphiques ECharts. Aucun émulateur de fonctions : la réponse de `pilotageLire` est simulée (protocole « callable », préparation CORS comprise).
// Un test par critère (le nom commence par son numéro). Captures dans tests/e2e/captures/pilotage/ (une par état, nommée avec le projet : ordinateur ou telephone).
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { test, expect, connecter, allerA, attendreCalme, ouvrirSectionReglages } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/pilotage/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' });
}
const ENTETES = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
const ok = (donnees) => ({ status: 200, headers: ENTETES, contentType: 'application/json', body: JSON.stringify({ result: donnees }) });
const erreurServeur = (status, code, message) => ({ status, headers: ENTETES, contentType: 'application/json', body: JSON.stringify({ error: { status: code, message } }) });
/** `repondre(corps, numeroDAppel)` rend la réponse à donner ; renvoie la liste des corps reçus. */
async function simulerServeur(page, repondre) {
  const appels = [];
  await page.route('**/pilotageLire', (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: ENTETES });
    const corps = route.request().postDataJSON()?.data ?? {};
    appels.push(corps);
    return route.fulfill(repondre(corps, appels.length));
  });
  return appels;
}
const sansDefilementHorizontal = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

// Données fictives : 100 € de base.
const LIGNES = [{ mois: 'Janv.', montant: 100 }, { mois: 'Févr.', montant: 150 }, { mois: 'Mars', montant: 200 }, { mois: 'Avr.', montant: 120 }];
const OPTION_BARRES = { dataset: { dimensions: ['mois', 'montant'] }, xAxis: { type: 'category' }, yAxis: { type: 'value' }, tooltip: { trigger: 'axis' }, series: [{ type: 'bar', encode: { x: 'mois', y: 'montant' } }] };
const tuile = (id, titre, extra = {}) => ({ id, titre, option: OPTION_BARRES, lignes: LIGNES, ...extra });
const REPONSE = { titre: 'Mes chiffres', tuiles: [tuile('v_exemple_a', 'Ventes par mois'), tuile('v_exemple_b', 'Encaissements par mois')], erreurs: [] };

/** Nombre de pixels dessinés (non transparents) dans le canvas de la tuile : le graphique est vraiment dessiné. */
const pixelsDessines = (page, id) => page.evaluate((i) => {
  const c = document.querySelector(`[data-tuile="${i}"] canvas`);
  if (!c) return 0;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let k = 3; k < d.length; k += 4) if (d[k] > 0) n += 1;
  return n;
}, id);

async function ouvrir(page) {
  await connecter(page, undefined, { route: 'pilotage/pilotage' });
  await attendreCalme(page);
}

test('P1 un graphique de barres est dessiné avec des données fictives, sous le titre du réglage', async ({ page }, info) => {
  const appels = await simulerServeur(page, () => ok({ titre: 'Mes chiffres', tuiles: [tuile('v_exemple_a', 'Ventes par mois')], erreurs: [] }));
  await ouvrir(page);
  await expect(page.locator('h1')).toHaveText('Mes chiffres');
  await expect(page.locator('[data-tuile="v_exemple_a"] h2')).toHaveText('Ventes par mois');
  await expect.poll(() => pixelsDessines(page, 'v_exemple_a'), { timeout: 10_000 }).toBeGreaterThan(500);
  await expect(page.locator('.menu .menu-entree[aria-current="page"], .menu .menu-entree.actif').first()).toContainText('Pilotage');
  expect(appels).toEqual([{}]); // un seul appel au serveur par affichage
  await capturer(page, info, 'P1-barres');
});

test('P2 deux tuiles dont une en erreur : la bonne est dessinée, l\'autre dit « Cette tuile n\'a pas pu être lue. » et « Réessayer » relance un seul appel', async ({ page }, info) => {
  const appels = await simulerServeur(page, (_c, n) => ok(n === 1
    ? { titre: 'Mes chiffres', tuiles: [tuile('v_exemple_a', 'Ventes par mois')], erreurs: [{ id: 'v_exemple_b', message: 'detail technique a ne pas montrer' }] }
    : REPONSE));
  await ouvrir(page);
  await expect.poll(() => pixelsDessines(page, 'v_exemple_a'), { timeout: 10_000 }).toBeGreaterThan(500);
  const carteErreur = page.locator('[data-tuile="v_exemple_b"]');
  await expect(carteErreur).toHaveAttribute('data-genre', 'erreur');
  await expect(carteErreur).toContainText('Cette tuile n\'a pas pu être lue.');
  await expect(page.locator('.pilotage-grille')).not.toContainText('detail technique');
  await capturer(page, info, 'P2-tuile-en-erreur');
  await page.locator('.pilotage-bandeau [data-action="reessayer"]').click();
  await expect.poll(() => pixelsDessines(page, 'v_exemple_b'), { timeout: 10_000 }).toBeGreaterThan(500);
  expect(appels).toHaveLength(2);
});

test('P3 cas vide : aucun réglage, « Aucun tableau n\'est encore réglé pour cet espace. »', async ({ page }, info) => {
  await simulerServeur(page, () => ok({ titre: '', tuiles: [], erreurs: [] }));
  await ouvrir(page);
  await expect(page.locator('[data-etat="vide"]')).toHaveText('Aucun tableau n\'est encore réglé pour cet espace.');
  await expect(page.locator('h1')).toHaveText('Pilotage');
  await expect(page.locator('canvas')).toHaveCount(0);
  await capturer(page, info, 'P3-vide');
});

test('P4 erreur d\'appel : message lisible sans détail technique, puis « Réessayer » affiche le graphique', { annotation: { type: 'erreurs-reseau-attendues', description: 'le faux serveur répond 500 au premier appel' } }, async ({ page }, info) => {
  await simulerServeur(page, (_c, n) => (n === 1 ? erreurServeur(500, 'INTERNAL', 'Panne : mot de passe x') : ok(REPONSE)));
  await ouvrir(page);
  const zone = page.locator('[data-etat="erreur"]');
  await expect(zone).toContainText('Le tableau ne se charge pas pour l\'instant.');
  await expect(zone).not.toContainText('mot de passe');
  await capturer(page, info, 'P4-erreur');
  await zone.locator('[data-action="reessayer"]').click();
  await expect.poll(() => pixelsDessines(page, 'v_exemple_a'), { timeout: 10_000 }).toBeGreaterThan(500);
  await expect(page.locator('[data-etat="erreur"]')).toHaveCount(0);
});

test('P5 fonction absente (comme chez un client) : « Le Pilotage n\'est pas encore branché sur cet espace. », sans bouton « Réessayer »', { annotation: { type: 'erreurs-reseau-attendues', description: 'la fonction n\'existe pas : 404' } }, async ({ page }, info) => {
  await simulerServeur(page, () => erreurServeur(404, 'NOT_FOUND', 'Not Found'));
  await ouvrir(page);
  const zone = page.locator('[data-etat="non-branche"]');
  await expect(zone).toHaveText('Le Pilotage n\'est pas encore branché sur cet espace.');
  await expect(zone.locator('[data-action="reessayer"]')).toHaveCount(0);
  await capturer(page, info, 'P5-non-branche');
});

test('P6 téléphone : les cartes sont en une colonne et la page ne défile pas à l\'horizontale', async ({ page }, info) => {
  await simulerServeur(page, () => ok(REPONSE));
  await ouvrir(page);
  await expect.poll(() => pixelsDessines(page, 'v_exemple_b'), { timeout: 10_000 }).toBeGreaterThan(500);
  expect(await sansDefilementHorizontal(page)).toBe(true);
  const [a, b] = await Promise.all(['v_exemple_a', 'v_exemple_b'].map((i) => page.locator(`[data-tuile="${i}"]`).boundingBox()));
  if (info.project.name === 'telephone') expect(Math.abs(a.x - b.x)).toBeLessThan(2); // une colonne : même bord gauche
  else expect(b.x).toBeGreaterThan(a.x + a.width / 2); // deux colonnes sur ordinateur
  await capturer(page, info, 'P6-grille');
});

test('P7 l\'Accueil ne télécharge pas ECharts ; l\'ouverture de l\'écran Pilotage le télécharge une seule fois', async ({ page }) => {
  await simulerServeur(page, () => ok(REPONSE));
  const vus = [];
  page.on('request', (r) => { if (/echarts/i.test(r.url())) vus.push(r.url()); });
  await connecter(page); // arrive sur l'Accueil
  await attendreCalme(page);
  expect(vus).toEqual([]);
  await allerA(page, 'Pilotage');
  await expect.poll(() => pixelsDessines(page, 'v_exemple_a'), { timeout: 10_000 }).toBeGreaterThan(500);
  expect(vus).toHaveLength(1);
  expect(vus[0]).toMatch(/\/assets\/vendor\/echarts\/echarts\.esm\.min\.js$/);
  await allerA(page, 'Accueil');
  await attendreCalme(page);
  await allerA(page, 'Pilotage'); // on revient sur l'écran : le fichier est déjà en mémoire, pas de nouveau téléchargement
  await expect.poll(() => pixelsDessines(page, 'v_exemple_a'), { timeout: 10_000 }).toBeGreaterThan(500);
  await attendreCalme(page);
  expect(vus).toHaveLength(1);
});

test('P8 « Exporter mes données » (Réglages > Pilotage) télécharge le réglage ; un compte refusé reçoit un message lisible', { annotation: { type: 'erreurs-reseau-attendues', description: 'le 2e appel est refusé : 403' } }, async ({ page }) => {
  let refuser = false;
  const appels = await simulerServeur(page, (c) => (c.exporter
    ? (refuser ? erreurServeur(403, 'PERMISSION_DENIED', 'x') : ok({ reglages: { titre: 'Mes chiffres', tuiles: [{ id: 'v_exemple_a', vue: 'v_exemple' }] } }))
    : ok(REPONSE)));
  await connecter(page);
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Pilotage');
  const bouton = page.locator('#reglages-export-pilotage [data-action="exporter-pilotage"]');
  await expect(bouton).toHaveText('Exporter mes données');
  await expect(page.locator('#reglages-export-pilotage')).toContainText('se modifie par Claude');
  const [dl] = await Promise.all([page.waitForEvent('download'), bouton.click()]);
  expect(dl.suggestedFilename()).toMatch(/^chevalier-ia-pilotage-\d{4}-\d{2}-\d{2}\.json$/);
  const json = JSON.parse(await readFile(await dl.path(), 'utf8'));
  expect(Object.keys(json.collections)).toEqual(['pilotage_parametres']);
  expect(json.collections.pilotage_parametres[0].titre).toBe('Mes chiffres');
  expect(appels).toEqual([{ exporter: true }]);
  refuser = true;
  await bouton.click();
  await expect(page.locator('.toast-erreur').filter({ hasText: 'Seul l\'administrateur de cet espace peut exporter ces données.' })).toBeVisible();
});

test('P9 une option invalide : la tuile dit « Cette tuile n\'a pas pu être dessinée. » et les autres s\'affichent', async ({ page }, info) => {
  // Une option dont `series` n'est pas une liste fait lever `setOption` ; l'autre tuile est valide.
  const invalide = { id: 'v_exemple_b', titre: 'Encaissements par mois', option: { series: { type: 'bar', data: 'oups' }, xAxis: 'oups', yAxis: 5, dataset: 7, grid: 3 }, lignes: LIGNES };
  await simulerServeur(page, () => ok({ titre: 'Mes chiffres', tuiles: [tuile('v_exemple_a', 'Ventes par mois'), invalide], erreurs: [] }));
  await ouvrir(page);
  await expect.poll(() => pixelsDessines(page, 'v_exemple_a'), { timeout: 10_000 }).toBeGreaterThan(500);
  await expect(page.locator('[data-tuile="v_exemple_b"]')).toContainText('Cette tuile n\'a pas pu être dessinée.');
  await expect(page.locator('[data-tuile="v_exemple_b"] canvas')).toHaveCount(0);
  await capturer(page, info, 'P9-option-invalide');
});

test('P10 un dataset en tableau (avec transform) reçoit bien les lignes : seules les lignes filtrées sont dessinées', async ({ page }, info) => {
  const option = {
    dataset: [{ id: 'brut' }, { fromDatasetId: 'brut', transform: { type: 'filter', config: { dimension: 'montant', gte: 150 } } }],
    xAxis: { type: 'category' }, yAxis: { type: 'value' },
    series: [{ type: 'bar', datasetIndex: 1, encode: { x: 'mois', y: 'montant' }, label: { show: true } }],
  };
  await simulerServeur(page, () => ok({ titre: 'Mes chiffres', tuiles: [{ id: 'v_exemple_a', titre: 'Ventes filtrées', option, lignes: LIGNES }], erreurs: [] }));
  await ouvrir(page);
  await expect.poll(() => pixelsDessines(page, 'v_exemple_a'), { timeout: 10_000 }).toBeGreaterThan(500);
  await expect(page.locator('[data-tuile="v_exemple_a"] [data-genre]')).toHaveCount(0);
  await expect(page.locator('[data-tuile="v_exemple_a"]')).toHaveAttribute('data-genre', 'graphique');
  await capturer(page, info, 'P10-dataset-tableau');
});

test('P11 une tuile sans ligne dit « Pas encore de données. » et le bouton « Actualiser » relance l\'appel', async ({ page }) => {
  const appels = await simulerServeur(page, (_c, n) => ok(n === 1 ? { titre: 'Mes chiffres', tuiles: [tuile('v_exemple_a', 'Ventes par mois', { lignes: [] })], erreurs: [] } : REPONSE));
  await ouvrir(page);
  await expect(page.locator('[data-tuile="v_exemple_a"]')).toContainText('Pas encore de données.');
  await page.locator('[data-action="actualiser"]').click();
  await expect.poll(() => pixelsDessines(page, 'v_exemple_a'), { timeout: 10_000 }).toBeGreaterThan(500);
  expect(appels).toHaveLength(2);
  await expect(page.locator('[data-action="actualiser"]')).not.toHaveClass(/bouton-principal/);
});
