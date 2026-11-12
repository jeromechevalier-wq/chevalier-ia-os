// Module Réseaux sociaux, écran Posts, chez un client de la plateforme (11/11/2026 ; règles de la plateforme chargées le temps du fichier).
// E9 : Buffer n'est pas branché chez un client (la fonction n'existe pas) : message dit, aucun plantage, la barre reste utilisable. E3 chez un client : le classement s'écrit sous clients/<client>/.
// Un test par critère, UNE capture chacun dans tests/e2e/captures/reseauxsociaux-posts/ (« -client », « -telephone »). Données fictives uniquement.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, ecrireDocument, estTelephone, listerDocuments, PROJET, FIRESTORE, URL_APP } from './outils.js';

const ALICE = 'alice@exemple.test';
const CAPTURES = 'e2e/captures/reseauxsociaux-posts';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}-client${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });

async function chargerRegles(fichier) {
  const contenu = await readFile(fileURLToPath(new URL(`../../${fichier}`, import.meta.url)), 'utf8');
  const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: fichier, content: contenu }] } }),
  });
  if (!r.ok) throw new Error(`Règles non chargées (${fichier}) : ${await r.text()}`);
}
test.beforeAll(() => chargerRegles('firestore.plateforme.rules'));
test.afterAll(() => chargerRegles('firestore.rules'));

test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
  await ecrireDocument('marques/reseaux', { actif: true, nom: 'Atelier Réseaux', couleur: '#336699', accueil: 'Bienvenue.' });
  await ecrireDocument(`clients/reseaux/membres/${ALICE}`, { role: 'editeur' });
  await ecrireDocument('clients/reseaux', { modules: { reseauxsociaux: true }, equipe: [{ email: ALICE, role: 'editeur' }] });
});

async function ouvrir(page, reste) {
  await page.goto('about:blank');
  await page.goto(`${URL_APP}#/espace/reseaux/${reste}`);
  await page.waitForFunction(() => !!window.__chevalierTest);
  await page.evaluate((e) => window.__chevalierTest.connecter(e, true), ALICE);
  await expect(page.locator('.coquille')).toBeVisible();
}
/** Fonction `reseauxsociauxBuffer` absente (comme chez un client) : le navigateur reçoit une erreur technique, pas un refus écrit par le serveur. */
async function bufferAbsent(page, statut) {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'la fonction est absente chez un client : le navigateur note l’erreur HTTP dans sa console' });
  const recues = [];
  await page.route(/cloudfunctions\.net\/reseauxsociauxBuffer$/, async (route) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    recues.push(1);
    return route.fulfill({ status: statut, headers: cors, contentType: 'application/json', body: JSON.stringify({ error: { status: statut === 404 ? 'NOT_FOUND' : 'INTERNAL', message: 'x' } }) });
  });
  return recues;
}

for (const statut of [404, 500]) {
  test(`E9 chez un client Buffer n’est pas branché (fonction absente, erreur technique ${statut}) : « Buffer n’est pas branché sur cet espace. », « Réessayer », aucun plantage ; la barre reste utilisable`, async ({ page }) => {
    const recues = await bufferAbsent(page, statut);
    await ouvrir(page, 'reseauxsociaux/posts');
    await expect(page.getByRole('heading', { name: 'Posts', level: 1 })).toBeVisible();
    await expect(page.locator('[data-role="erreur-buffer"]')).toHaveText('Buffer n’est pas branché sur cet espace.');
    await expect(page.locator('[data-action="reessayer-buffer"]')).toBeVisible();
    await expect(page.locator('.carte-post')).toHaveCount(0);
    // La vue reste utilisable : on bascule sur les Statistiques et on ouvre les filtres sans erreur.
    await page.locator('[data-vue="stats"]').click();
    await expect(page.locator('[data-vue="stats"]')).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('[data-role="erreur-buffer"]')).toBeVisible();
    await page.locator('[data-action="filtres"]').click();
    await expect(page.getByRole('dialog', { name: 'Filtres' })).toBeVisible();
    await page.getByRole('dialog', { name: 'Filtres' }).getByRole('button', { name: 'Appliquer' }).click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(recues.length).toBeGreaterThan(0);
    if (statut === 500) await capture(page, 'E9-buffer-absent');
    // « Réessayer » rappelle la fonction.
    const avant = recues.length;
    await page.locator('[data-action="reessayer-buffer"]').click();
    await expect.poll(() => recues.length).toBe(avant + 1);
    await expect(page.locator('[data-role="erreur-buffer"]')).toHaveText('Buffer n’est pas branché sur cet espace.');
  });
}

test('E3 chez un client, le classement d’un post s’écrit sous clients/<client>/, avec sa ligne de Journal au même endroit, rien à la racine', async ({ page }) => {
  await bufferAbsent(page, 500);
  await ouvrir(page, 'reseauxsociaux/posts');
  await page.evaluate(async () => (await import('/js/modules/reseauxsociaux/posts-actions.js')).classerPost('post-fictif-1', { pilier: 'pme', format: 'video', services: ['production'] }));
  await page.evaluate(async () => (await import('/js/modules/reseauxsociaux/posts-actions.js')).classerPost('post-fictif-1', { pilier: 'claude', format: 'video', services: ['production'] }));
  const docs = await listerDocuments('clients/reseaux/reseauxsociaux_posts');
  expect(docs.map((d) => d.id)).toEqual(['post-fictif-1']);
  expect(docs[0]).toMatchObject({ pilier: 'pedagogie', format: 'video', services: ['production'] });
  expect((await listerDocuments('clients/reseaux/crm_audit')).filter((d) => d.collection === 'reseauxsociaux_posts').map((d) => d.action).sort()).toEqual(['creer', 'modifier']);
  expect(await listerDocuments('reseauxsociaux_posts')).toEqual([]);
  expect(await listerDocuments('crm_audit')).toEqual([]);
  await capture(page, 'E3-chemin-client');
});
