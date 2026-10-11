// Journal d'activité des workflows (chantier 14), dans le navigateur, sur les émulateurs et avec les RÈGLES DE LA PLATEFORME.
// Les deux fonctions du serveur (rafraîchir, renommer) sont SIMULÉES par le navigateur de test : aucun appel réel, aucun n8n.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, ecrireDocument, estTelephone, PROJET, FIRESTORE, URL_APP } from './outils.js';

const ALICE = 'alice@exemple.test'; // éditrice
const LEA = 'lea@exemple.test'; // lectrice

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

let appelsRafraichir;
let appelsRenommer;

test.beforeEach(async ({ page }) => {
  appelsRafraichir = 0;
  appelsRenommer = [];
  // Fonctions du serveur simulées (le SDK les appelle en HTTPS : on répond à la place du serveur).
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/json' };
  await page.route('**/journalRafraichir', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    appelsRafraichir++;
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { resultat: 'mis-a-jour', lastSyncedAt: Date.now() } }) });
  });
  await page.route('**/journalRenommer', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    appelsRenommer.push(JSON.parse(route.request().postData()).data);
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ok: true } }) });
  });
  for (const [id, nom] of [['cabinet', 'Cabinet Martin'], ['studio', 'Studio Lune'], ['sansjournal', 'Sans Journal']]) {
    await ecrireDocument(`marques/${id}`, { actif: true, nom, couleur: '#336699', accueil: 'Bienvenue.' });
  }
  await ecrireDocument('clients/cabinet', { modules: { journal: true } });
  await ecrireDocument('clients/studio', { modules: { journal: true } });
  await ecrireDocument('clients/sansjournal', { modules: { affaires: true } });
  for (const c of ['cabinet', 'studio', 'sansjournal']) await ecrireDocument(`clients/${c}/membres/${ALICE}`, { role: 'editeur' });
  await ecrireDocument(`clients/cabinet/membres/${LEA}`, { role: 'lecteur' });
  await ecrireDocument('clients/cabinet/workflows/wf1', { workflowId: 'wf1', nom: 'Lire une fiche', active: true, stepsPlan: [] });
  await ecrireDocument('clients/cabinet/workflows/wf2', { workflowId: 'wf2', nom: 'Mon mois', libelle: 'Bilan du mois', active: true, stepsPlan: [] });
  await ecrireDocument('clients/cabinet/executions/101', exe(101, 'wf1', 'success', 50 * MIN));
  await ecrireDocument('clients/cabinet/executions/102', exe(102, 'wf1', 'error', 40 * MIN, { errorMessage: 'The service is receiving too many requests from you', failedStep: 'Lire Presences' }));
  await ecrireDocument('clients/cabinet/executions/103', exe(103, 'wf2', 'running', 20 * MIN)); // bloquée : à vérifier
  await ecrireDocument('clients/cabinet/executions/104', exe(104, 'wf2', 'running', 2 * MIN)); // en cours
  await ecrireDocument('clients/cabinet/executions/105', exe(105, 'wf2', 'success', 3 * MIN));
  await ecrireDocument('clients/cabinet/sync/state', { n8nOk: true, lastSyncedAt: new Date(), lastSuccessAt: new Date() });
  // Un autre client avec ses propres exécutions : on ne doit jamais les voir chez « cabinet ».
  await ecrireDocument('clients/studio/workflows/wfS', { workflowId: 'wfS', nom: 'Secret du studio', active: true });
  await ecrireDocument('clients/studio/executions/900', exe(900, 'wfS', 'success', MIN, { workflowLabel: 'Secret du studio' }));
});

async function ouvrir(page, client, email = ALICE) {
  await page.goto('about:blank');
  await page.goto(`${URL_APP}#/espace/${client}`);
  await page.waitForFunction(() => !!window.__chevalierTest);
  await page.evaluate((e) => window.__chevalierTest.connecter(e, true), email);
  await expect(page.locator('.coquille')).toBeVisible();
}
const lignes = (page) => page.locator('.journal-ligne');

test('J1 écran : quatre compteurs, liste, état « à vérifier » avec son explication, ligne d\'erreur avec étape et message', async ({ page }) => {
  await ouvrir(page, 'cabinet');
  await expect(page).toHaveURL(/#\/espace\/cabinet\/journal\/historique$/);
  await expect(page.locator('.journal-resume')).toHaveText(/1\s*en cours\s*1\s*en erreur\s*1\s*à vérifier\s*2\s*terminées/);
  await expect(lignes(page)).toHaveCount(5);
  const erreur = page.locator('.journal-ligne[data-etat="error"]');
  await expect(erreur).toContainText('Étape en échec : Lire Presences');
  await expect(erreur).toContainText('The service is receiving too many requests from you');
  await expect(erreur.locator('.journal-pastille')).toHaveText('En erreur');
  const stale = page.locator('.journal-ligne[data-etat="stale"]');
  await expect(stale).toContainText('Cette exécution est en cours depuis plus de 10 minutes. Elle est peut-être restée bloquée.');
  await expect(stale.locator('.journal-pastille')).toHaveText('À vérifier');
  await expect(page.locator('.journal-ligne[data-etat="running"] .journal-pastille')).toHaveText('En cours');
  await expect(page.locator('.journal-ligne[data-etat="running"]')).toContainText('depuis 2 min');
  await expect(page.locator('.journal-bandeau')).toBeHidden();
  // Le nom choisi par le client remplace celui de n8n.
  await expect(page.locator('.journal-liste')).toContainText('Bilan du mois');
  await expect(page.locator('.journal-liste')).not.toContainText('Mon mois');
});

test('J2 filtres par automatisation et par état', async ({ page }) => {
  await ouvrir(page, 'cabinet');
  await expect(lignes(page)).toHaveCount(5);
  await page.getByLabel('Filtrer par état').selectOption('error');
  await expect(lignes(page)).toHaveCount(1);
  await page.getByLabel('Filtrer par état').selectOption('stale');
  await expect(lignes(page)).toHaveCount(1);
  await page.getByLabel('Filtrer par état').selectOption('');
  await page.getByLabel('Filtrer par automatisation').selectOption('wf1');
  await expect(lignes(page)).toHaveCount(2);
  await page.getByLabel('Filtrer par état').selectOption('running');
  await expect(page.locator('.journal-vide')).toHaveText('Aucune exécution ne correspond à ce filtre.');
});

test('J3 isolation : le journal d\'un autre client n\'apparaît jamais ; un autre client voit le sien seul', async ({ page }) => {
  await ouvrir(page, 'cabinet');
  await expect(lignes(page)).toHaveCount(5);
  await expect(page.locator('body')).not.toContainText('Secret du studio');
  await ouvrir(page, 'studio');
  await expect(lignes(page)).toHaveCount(1);
  await expect(page.locator('.journal-liste')).toContainText('Secret du studio');
  await expect(page.locator('body')).not.toContainText('Lire une fiche');
});

test('J4 bandeau jaune quand n8n ne répond pas, avec l\'heure des dernières données ; les données restent affichées', async ({ page }) => {
  await ecrireDocument('clients/cabinet/sync/state', { n8nOk: false, lastSuccessAt: new Date(2026, 9, 11, 9, 5, 7), lastSyncedAt: new Date(2026, 9, 11, 9, 5, 7), lastError: 'n8n ne répond pas' });
  await ouvrir(page, 'cabinet');
  await expect(page.locator('.journal-bandeau')).toHaveText('n8n ne répond pas pour le moment. Vous voyez les données de 09:05:07.');
  await expect(lignes(page)).toHaveCount(5);
});

test('J5 mise à jour en direct : une exécution écrite par le serveur apparaît sans recharger, et « en cours » devient « terminée »', async ({ page }) => {
  await ouvrir(page, 'cabinet');
  await expect(lignes(page)).toHaveCount(5);
  await ecrireDocument('clients/cabinet/executions/106', exe(106, 'wf1', 'running', 1000));
  await expect(lignes(page)).toHaveCount(6);
  await ecrireDocument('clients/cabinet/executions/106', exe(106, 'wf1', 'success', 1000, { durationMs: 900 }));
  await expect(page.locator('.journal-ligne[data-id="106"]')).toHaveAttribute('data-etat', 'success');
});

test('J6 mise à jour automatique : une demande à l\'ouverture, la case la coupe, le bouton a un délai de 10 s', async ({ page }) => {
  await ouvrir(page, 'cabinet');
  await expect.poll(() => appelsRafraichir).toBeGreaterThanOrEqual(1);
  await expect(page.getByLabel('Mise à jour automatique (10 s)')).toBeChecked();
  await page.getByLabel('Mise à jour automatique (10 s)').uncheck();
  const bouton = page.getByRole('button', { name: /Rafraîchir/ });
  await expect(bouton).toHaveText('Rafraîchir l’historique');
  const avant = appelsRafraichir;
  await bouton.click();
  await expect.poll(() => appelsRafraichir).toBe(avant + 1);
  await expect(bouton).toBeDisabled();
  await expect(bouton).toHaveText(/Rafraîchir \(\d+ s\)/);
  await page.waitForTimeout(2500);
  expect(appelsRafraichir).toBe(avant + 1); // case décochée : plus de demande automatique
});

test('J7 aucune demande envoyée au serveur ne porte un identifiant de client (le serveur le déduit de l\'identité)', async ({ page }) => {
  let corps = null;
  await page.route('**/journalRafraichir', async (route) => {
    if (route.request().method() === 'POST') corps = route.request().postData();
    await route.fallback();
  });
  await ouvrir(page, 'cabinet');
  await expect.poll(() => appelsRafraichir).toBeGreaterThanOrEqual(1);
  expect(JSON.parse(corps).data ?? null).toBeNull();
});

test('J8 renommer : proposé aux éditeurs seulement (clic sur le nom) ; le lecteur voit le nom sans pouvoir le changer', async ({ page }) => {
  await ouvrir(page, 'cabinet', ALICE);
  const nom = page.locator('.journal-ligne[data-id="101"] .journal-nom');
  await expect(nom).toHaveJSProperty('tagName', 'BUTTON');
  await nom.click();
  await page.getByRole('dialog').locator('input').fill('Fiches du matin');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect.poll(() => appelsRenommer.length).toBe(1);
  expect(appelsRenommer[0]).toEqual({ client: 'cabinet', workflowId: 'wf1', libelle: 'Fiches du matin' });
  await ouvrir(page, 'cabinet', LEA);
  await expect(page.locator('.journal-ligne[data-id="101"] .journal-nom')).toHaveJSProperty('tagName', 'SPAN');
});

test('J9 animation : la pastille « en cours » pulse, et cesse de pulser si l\'appareil demande de réduire les animations', async ({ page }) => {
  await ouvrir(page, 'cabinet');
  const point = page.locator('.journal-ligne[data-etat="running"] .journal-point');
  await expect(point).toHaveCSS('animation-name', 'journal-pulse');
  await expect(page.locator('.journal-ligne[data-etat="stale"] .journal-point')).toHaveCSS('animation-name', 'none');
  await expect(page.locator('.journal-ligne[data-etat="success"] .journal-point').first()).toHaveCSS('animation-name', 'none');
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await expect(point).toHaveCSS('animation-name', 'none');
});

test('J10 un client sans le module n\'a ni menu ni écran du journal (page introuvable)', async ({ page }) => {
  await ouvrir(page, 'sansjournal');
  if (estTelephone(page)) await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await expect(page.locator('.menu').getByRole('link', { name: 'Historique', exact: true })).toHaveCount(0);
  await page.goto(`${URL_APP}#/espace/sansjournal/journal/historique`);
  await expect(page.getByText('Page introuvable')).toBeVisible();
});

test('J11 le navigateur ne peut écrire dans aucune collection du journal (règles)', async ({ page }) => {
  await ouvrir(page, 'cabinet');
  const resultat = await page.evaluate(async () => {
    const m = await import('https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js');
    const { db } = await import('/js/os/firebase.js');
    const essai = async (f) => { try { await f(); return 'écrit'; } catch (e) { return e.code; } };
    return {
      libelle: await essai(() => m.updateDoc(m.doc(db, 'clients/cabinet/workflows/wf1'), { libelle: 'Piraté' })),
      execution: await essai(() => m.setDoc(m.doc(db, 'clients/cabinet/executions/999'), { status: 'success' })),
      suppression: await essai(() => m.deleteDoc(m.doc(db, 'clients/cabinet/executions/101'))),
      synchro: await essai(() => m.setDoc(m.doc(db, 'clients/cabinet/sync/state'), { n8nOk: false })),
    };
  });
  expect(resultat).toEqual({ libelle: 'permission-denied', execution: 'permission-denied', suppression: 'permission-denied', synchro: 'permission-denied' });
});
