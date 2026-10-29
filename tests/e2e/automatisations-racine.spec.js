// Module Automatisations chez Jérôme (racine, règles du CRM). Deux cas :
//  - le compte d'assistant (Charles), PAS administrateur : écran vide propre, ni bouton « Rafraîchir », ni mise à jour automatique, ni filtre, ni appel au serveur ;
//  - le compte de Jérôme, ADMINISTRATEUR (2.7.0) : ses workflows « interne » en direct + un filtre par propriétaire (clients lus par la fonction serveur, SIMULÉE ici)
//    et les catégories « Workflows non reconnus » et « Clients sans le module ».
import { test, expect, connecter, ecrireDocument, estTelephone, CHARLES } from './outils.js';

const MIN = 60000;
const il_y_a = (ms) => new Date(Date.now() - ms);

test('Automatisations chez l\'assistant (non administrateur) : menu visible, état vide propre, ni bouton, ni filtre, aucun appel au serveur, aucune erreur', async ({ page, erreursConsole }, info) => {
  const appels = [];
  page.on('request', (r) => { if (/automatisations(Rafraichir|Renommer|Admin)/.test(r.url())) appels.push(r.url()); });
  await connecter(page, CHARLES);
  await page.evaluate(() => { location.hash = '#/automatisations/historique'; });
  await expect(page.getByRole('heading', { name: 'Automatisations' })).toBeVisible();
  await expect(page.locator('.autom-vide')).toContainText('Aucune automatisation n’a encore été copiée dans cette base');
  await expect(page.locator('.autom-resume')).toHaveText(/0\s*en cours\s*0\s*en erreur\s*0\s*exécutions à vérifier\s*0\s*terminées/);
  await expect(page.getByRole('button', { name: /Rafraîchir/ })).toHaveCount(0);
  await expect(page.getByLabel(/Mise à jour automatique/)).toHaveCount(0);
  await expect(page.getByLabel('Filtrer par propriétaire')).toHaveCount(0);
  await page.screenshot({ path: `test-results/automatisations-racine-vide-${info.project.name}.png`, fullPage: true });
  // Menu : un groupe « Automatisations » avec « Historique », à côté du CRM ; le « Journal des modifications » est dans le menu utilisateur (PR B).
  if (estTelephone(page)) await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await expect(page.locator('.menu').getByRole('link', { name: 'Automatisations', exact: true })).toBeVisible();
  await expect(page.locator('.menu').getByRole('link', { name: 'Historique', exact: true })).toHaveCount(0); // un onglet, plus une entrée du menu
  await expect(page.locator('.menu').getByRole('link', { name: 'Journal des modifications', exact: true })).toHaveCount(0);
  if (estTelephone(page)) await page.keyboard.press('Escape');
  await page.waitForTimeout(1500); // laisse passer au moins un « tic » : la mise à jour automatique ne doit rien demander
  expect(appels).toEqual([]);
  expect(erreursConsole).toEqual([]);
});

test('Automatisations chez l\'assistant : si des workflows sont présents à la racine, ils s\'affichent (renommage proposé comme chez Jérôme : même code, la fonction revérifie le compte)', { tag: '@sans-telephone' }, async ({ page, erreursConsole }) => {
  await ecrireDocument('workflows/wf1', { workflowId: 'wf1', nom: 'Mon workflow', active: true, stepsPlan: [] });
  await ecrireDocument('executions/501', {
    executionId: '501', workflowId: 'wf1', workflowLabel: 'Mon workflow', status: 'success', stale: false, mode: 'webhook',
    startedAt: il_y_a(5 * MIN), stoppedAt: il_y_a(5 * MIN - 1500), durationMs: 1500, retryOf: null, errorMessage: null, failedStep: null,
    runGroupId: null, source: 'sync', lastSyncedAt: new Date(), expireAt: null,
  });
  await connecter(page, CHARLES);
  await page.evaluate(() => { location.hash = '#/automatisations/historique'; });
  await expect(page.locator('.autom-ligne')).toHaveCount(1);
  await expect(page.locator('.autom-ligne .autom-nom')).toHaveText('Mon workflow');
  await expect(page.locator('.autom-ligne button.autom-nom-editable')).toHaveCount(1);
  await expect(page.locator('.autom-resume')).toHaveText(/1\s*terminées/);
  expect(erreursConsole).toEqual([]);
});

// ---------------------------------------------------------------- administrateur (Jérôme)

const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/json' };
const exeClient = (id, proprietaire, workflowId, label, status, ago, extra = {}) => ({
  id: String(id), executionId: String(id), workflowId, workflowLabel: label, status, stale: false, mode: 'webhook',
  startedAt: Date.now() - ago, stoppedAt: status === 'running' ? null : Date.now() - ago + 1500, durationMs: 1500, errorMessage: null, failedStep: null, proprietaire, ...extra,
});
const DONNEES_CLIENTS = {
  proprietaires: [
    { id: 'audrey', nom: 'Audrey Conseil', workflows: 1, synchro: { n8nOk: true, lastSyncedAt: Date.now(), lastSuccessAt: Date.now() } },
    { id: 'boris', nom: 'Boris SARL', workflows: 1, synchro: { n8nOk: false, lastSyncedAt: Date.now(), lastSuccessAt: Date.now() - 3600000 } },
  ],
  workflows: [{ id: 'wfa', workflowId: 'wfa', nom: 'Rapport Audrey', libelle: null, active: true, proprietaire: 'audrey' }, { id: 'wfb', workflowId: 'wfb', nom: 'Relance Boris', libelle: null, active: true, proprietaire: 'boris' }],
  executions: [
    exeClient(7, 'audrey', 'wfa', 'Rapport Audrey', 'error', 8 * MIN, { errorMessage: 'Boom', failedStep: 'Envoyer' }),
    exeClient(8, 'boris', 'wfb', 'Relance Boris', 'success', 6 * MIN),
  ],
  aVerifier: [
    { workflowId: 'wfX', nom: 'interne-sans-etiquette', raison: 'signe-manquant', categorie: 'non-reconnu', proprietaire: 'interne', etiquettes: [], message: 'Pour être rangé chez toi, ce workflow doit avoir les trois signes. Il manque : l’étiquette « interne ». Il n’est pas copié.', source: 'os',
      lignes: [{ signe: 'Étiquette', ok: false, texte: 'Étiquette « interne » absente (étiquettes du workflow : aucune).' }, { signe: 'Nom', ok: true, texte: 'Le nom commence par « interne- ».' }, { signe: 'Clé de la porte', ok: false, texte: 'Les nœuds utilisent une autre clé de la porte (credentials lus : « Clé n8n - Jérôme » ; attendu : « Clé n8n - interne »).' }] },
    { workflowId: 'wfY', nom: 'audrey-rapport', raison: 'etiquette-manquante', categorie: 'non-reconnu', proprietaire: 'audrey', etiquettes: [], message: 'Ce workflow semble être celui du client « audrey », mais il n’a pas l’étiquette « client-audrey » dans n8n. Il n’est pas copié.', source: 'os', lignes: [] },
    { workflowId: 'wfZ', nom: 'Rapport de Zoé', raison: 'sans-module', categorie: 'sans-module', proprietaire: 'zoe', etiquettes: ['client-zoe'], message: 'Workflow en règle du client « zoe », qui n’a pas (encore) le module Automatisations : il n’est pas copié. Rien à corriger dans n8n.', source: 'os',
      lignes: [{ signe: 'Module', ok: false, texte: 'Le module Automatisations n’est pas activé chez « zoe ».' }] },
  ],
  lecturePossible: true,
};

test('Automatisations chez Jérôme administrateur : filtre par propriétaire, pastilles, lecture seule des clients, « À vérifier » avec la raison', async ({ page, erreursConsole }, info) => {
  const corps = [];
  await page.route('**/automatisationsAdmin', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const d = JSON.parse(route.request().postData()).data;
    corps.push(d);
    if (d.action === 'rafraichir') return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { resultat: 'mis-a-jour', lastSyncedAt: Date.now() } }) });
    const cible = d.proprietaire && d.proprietaire !== 'tous' ? d.proprietaire : null;
    const r = { ...DONNEES_CLIENTS, executions: DONNEES_CLIENTS.executions.filter((e) => !cible || e.proprietaire === cible) };
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: r }) });
  });
  const autres = [];
  page.on('request', (r) => { if (/automatisations(Rafraichir|Renommer)/.test(r.url())) autres.push(r.url()); });
  await ecrireDocument('workflows/wf1', { workflowId: 'wf1', nom: 'interne-veille-collecte', active: true, stepsPlan: [] });
  await ecrireDocument('executions/501', {
    executionId: '501', workflowId: 'wf1', workflowLabel: 'interne-veille-collecte', status: 'success', stale: false, mode: 'cron',
    startedAt: il_y_a(5 * MIN), stoppedAt: il_y_a(5 * MIN - 1500), durationMs: 1500, retryOf: null, errorMessage: null, failedStep: null,
    runGroupId: null, source: 'sync', lastSyncedAt: new Date(), expireAt: null,
  });
  await ecrireDocument('sync/state', { n8nOk: true, lastSyncedAt: new Date(), lastSuccessAt: new Date() });
  await connecter(page);
  await page.evaluate(() => { location.hash = '#/automatisations/historique'; });
  const filtre = page.getByLabel('Filtrer par propriétaire');
  await expect(filtre).toBeVisible();
  await expect(page.locator('.autom-ligne')).toHaveCount(3); // 1 à lui + 2 clients
  await expect(filtre.locator('option')).toHaveText(['Tous les propriétaires', 'Interne (toi)', 'Audrey Conseil', 'Boris SARL', 'Workflows non reconnus (2)', 'Clients sans le module (1)']);
  await expect(page.locator('.autom-proprio')).toHaveText(['Interne', 'Boris SARL', 'Audrey Conseil']);
  await expect(page.locator('.autom-bandeau')).toContainText('Boris SARL : n8n ne répond pas');
  await expect(page.locator('.autom-erreur')).toContainText('Boom');
  await expect(page.locator('.autom-alerte-verifier')).toContainText('2 workflows non reconnus');
  await page.screenshot({ path: `test-results/automatisations-admin-tous-${info.project.name}.png`, fullPage: true });
  // Interne : seulement ses workflows à lui, sans appel de plus.
  await filtre.selectOption('interne');
  await expect(page.locator('.autom-ligne')).toHaveCount(1);
  await expect(page.locator('.autom-nom')).toHaveText('interne-veille-collecte');
  await expect(page.locator('.autom-bandeau')).toBeHidden();
  // Un client : la fonction est rappelée pour CE client, et seulement ses exécutions s'affichent.
  await filtre.selectOption('audrey');
  await expect(page.locator('.autom-ligne')).toHaveCount(1);
  await expect(page.locator('.autom-nom')).toHaveText('Rapport Audrey');
  expect(corps.some((d) => d.action === 'lire' && d.proprietaire === 'audrey')).toBe(true);
  // À vérifier : une carte par workflow écarté, avec la raison en français simple.
  await filtre.selectOption('a-verifier');
  await expect(page.locator('.autom-averifier')).toHaveCount(2);
  await expect(page.locator('.autom-averifier').first().locator('.autom-nom')).toHaveText('interne-sans-etiquette');
  await expect(page.locator('.autom-averifier').first().locator('.autom-signes li')).toHaveText([/✘ Étiquette : Étiquette « interne » absente/, /✔ Nom/, /✘ Clé de la porte : .*Clé n8n - Jérôme.*attendu/]);
  await expect(page.locator('.autom-averifier').first()).toContainText('Il manque : l’étiquette « interne »');
  await expect(page.locator('.autom-averifier').nth(1)).toContainText('client-audrey');
  await page.screenshot({ path: `test-results/automatisations-admin-averifier-${info.project.name}.png`, fullPage: true });
  await filtre.selectOption('sans-module');
  await expect(page.locator('.autom-averifier')).toHaveCount(1);
  await expect(page.locator('.autom-averifier .autom-pastille')).toHaveText('Client sans le module');
  // Retour à « Tous » : tout revient.
  await filtre.selectOption('tous');
  await expect(page.locator('.autom-ligne')).toHaveCount(3);
  // Le bouton recopie TES workflows (fonction administrateur), jamais la fonction des clients ; renommage proposé sur TES workflows seulement (pas sur ceux d'un client).
  await page.getByRole('button', { name: /Rafraîchir/ }).click();
  await expect.poll(() => corps.some((d) => d.action === 'rafraichir')).toBe(true);
  await expect(page.locator('button.autom-nom-editable')).toHaveCount(1);
  await expect(page.locator('.autom-ligne', { hasText: 'Interne' }).locator('button.autom-nom-editable')).toHaveCount(1);
  await expect(page.locator('.autom-ligne', { hasText: 'Audrey Conseil' }).locator('button.autom-nom-editable')).toHaveCount(0);
  expect(autres).toEqual([]);
  expect(erreursConsole.filter((e) => !/automatisationsAdmin/.test(e))).toEqual([]);
});

test('3 renommer chez Jérôme : un clic sur le nom de son workflow ouvre la fenêtre, enregistre par la fonction (sans client) ; un échec du serveur est dit en clair', async ({ page, erreursConsole }, info) => {
  const appels = [];
  let echec = false;
  await page.route('**/automatisationsAdmin', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ...DONNEES_CLIENTS, proprietaires: [], executions: [], workflows: [], aVerifier: [] } }) });
  });
  await page.route('**/automatisationsRenommer', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    appels.push(JSON.parse(route.request().postData()).data);
    if (echec) return route.fulfill({ status: 500, headers: cors, body: JSON.stringify({ error: { message: 'INTERNAL', status: 'INTERNAL' } }) });
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ok: true, libelle: appels.at(-1).libelle } }) });
  });
  await ecrireDocument('workflows/wf1', { workflowId: 'wf1', nom: 'interne-veille-collecte', active: true, stepsPlan: [] });
  await ecrireDocument('executions/501', {
    executionId: '501', workflowId: 'wf1', workflowLabel: 'interne-veille-collecte', status: 'success', stale: false, mode: 'cron',
    startedAt: il_y_a(5 * MIN), stoppedAt: il_y_a(5 * MIN - 1500), durationMs: 1500, retryOf: null, errorMessage: null, failedStep: null,
    runGroupId: null, source: 'sync', lastSyncedAt: new Date(), expireAt: null,
  });
  await ecrireDocument('sync/state', { n8nOk: true, lastSyncedAt: new Date(), lastSuccessAt: new Date() });
  await connecter(page);
  await page.evaluate(() => { location.hash = '#/automatisations/historique'; });
  const nom = page.locator('.autom-ligne .autom-nom');
  await expect(nom).toHaveJSProperty('tagName', 'BUTTON');
  await nom.click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.waitForTimeout(500); // la fenêtre finit son apparition avant la capture
  await page.screenshot({ path: `e2e/captures/automatisations-renommer/renommer-chez-jerome-${info.project.name}.png`, fullPage: true });
  await page.getByRole('dialog').locator('input').fill('Veille du matin');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect.poll(() => appels.length).toBe(1);
  expect(appels[0]).toEqual({ workflowId: 'wf1', libelle: 'Veille du matin' }); // pas de « client » à la racine
  await expect(page.locator('.toast, [role="status"]').filter({ hasText: 'Nom enregistré' }).first()).toBeVisible();
  // Cas d'erreur : le serveur échoue, message clair, aucune plantage.
  echec = true;
  test.info().annotations.push({ type: 'erreurs-reseau-attendues' });
  await nom.click();
  await page.getByRole('dialog').locator('input').fill('Autre nom');
  await page.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.toast, [role="alert"], [role="status"]').filter({ hasText: 'Impossible de renommer pour le moment.' }).first()).toBeVisible();
  expect(erreursConsole.filter((e) => !/automatisationsRenommer|automatisationsAdmin|500/.test(e))).toEqual([]);
});

test('Automatisations chez Jérôme administrateur : si la fonction n\'est pas encore en service, ses propres workflows restent affichés avec une explication', { tag: '@sans-telephone' }, async ({ page }) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues' }); // la fonction répond 404 : le navigateur le note dans sa console
  await page.route('**/automatisationsAdmin', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    return route.fulfill({ status: 404, headers: cors, body: JSON.stringify({ error: { message: 'NOT_FOUND', status: 'NOT_FOUND' } }) });
  });
  await ecrireDocument('workflows/wf1', { workflowId: 'wf1', nom: 'interne-veille-collecte', active: true, stepsPlan: [] });
  await ecrireDocument('executions/501', {
    executionId: '501', workflowId: 'wf1', workflowLabel: 'interne-veille-collecte', status: 'success', stale: false, mode: 'cron',
    startedAt: il_y_a(5 * MIN), stoppedAt: il_y_a(5 * MIN - 1500), durationMs: 1500, retryOf: null, errorMessage: null, failedStep: null,
    runGroupId: null, source: 'sync', lastSyncedAt: new Date(), expireAt: null,
  });
  await connecter(page);
  await page.evaluate(() => { location.hash = '#/automatisations/historique'; });
  await expect(page.locator('.autom-ligne')).toHaveCount(1);
  await expect(page.locator('.autom-bandeau')).toContainText('Les clients ne sont pas lisibles pour le moment');
});

test('Automatisations chez Jérôme administrateur : les filtres se combinent, ne proposent que le possible, se vident au changement de propriétaire et ont un message « aucun résultat »', async ({ page }) => {
  await page.route('**/automatisationsAdmin', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const d = JSON.parse(route.request().postData()).data;
    const cible = d.proprietaire && d.proprietaire !== 'tous' ? d.proprietaire : null;
    const r = { ...DONNEES_CLIENTS, executions: DONNEES_CLIENTS.executions.filter((e) => !cible || e.proprietaire === cible), workflows: DONNEES_CLIENTS.workflows.filter((w) => !cible || w.proprietaire === cible) };
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: r }) });
  });
  await ecrireDocument('workflows/wf1', { workflowId: 'wf1', nom: 'interne-veille-collecte', active: true, stepsPlan: [] });
  await ecrireDocument('executions/501', {
    executionId: '501', workflowId: 'wf1', workflowLabel: 'interne-veille-collecte', status: 'success', stale: false, mode: 'cron',
    startedAt: il_y_a(5 * MIN), stoppedAt: il_y_a(5 * MIN - 1500), durationMs: 1500, retryOf: null, errorMessage: null, failedStep: null,
    runGroupId: null, source: 'sync', lastSyncedAt: new Date(), expireAt: null,
  });
  await ecrireDocument('sync/state', { n8nOk: true, lastSyncedAt: new Date(), lastSuccessAt: new Date() });
  await connecter(page);
  await page.evaluate(() => { location.hash = '#/automatisations/historique'; });
  const proprio = page.getByLabel('Filtrer par propriétaire');
  const dlg = page.getByRole('dialog');
  const ouvrirFenetre = () => page.locator('[data-action="filtres"]').click();
  const case_ = (cle, valeur) => dlg.locator(`input[data-cle="${cle}"][data-valeur="${valeur}"]`);
  const appliquer = () => dlg.getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('.autom-ligne')).toHaveCount(3);
  // (a) les filtres se combinent (ET) : automatisation d'Audrey + état « Terminées » = rien, avec message et bouton
  await ouvrirFenetre();
  await case_('workflowIds', 'wfa').check();
  await appliquer();
  await expect(page.locator('.autom-ligne')).toHaveCount(1);
  await ouvrirFenetre();
  await case_('etats', 'success').check();
  await appliquer();
  await expect(page.locator('.autom-ligne')).toHaveCount(0);
  await expect(page.locator('.autom-aucun-resultat')).toContainText('Rien à afficher avec ces filtres. Décoche un filtre.');
  await page.getByRole('button', { name: 'Réinitialiser les filtres' }).click();
  await expect(page.locator('.autom-ligne')).toHaveCount(3);
  await expect(page.locator('[data-action="filtres"] .compteur-filtres')).toHaveCount(0);
  // (b) changer de propriétaire vide les cases cochées, et la fenêtre ne propose que les valeurs de CE propriétaire
  await ouvrirFenetre();
  await case_('etats', 'success').check();
  await appliquer();
  await expect(page.locator('.autom-ligne')).toHaveCount(2);
  await proprio.selectOption('audrey');
  await expect(page.locator('[data-action="filtres"] .compteur-filtres')).toHaveCount(0);
  await ouvrirFenetre();
  await expect(dlg.locator('input[data-cle="workflowIds"]')).toHaveCount(1);
  await expect(dlg.getByText('Rapport Audrey')).toBeVisible();
  await expect(dlg.locator('input[data-cle="etats"]')).toHaveCount(1);
  await expect(dlg.locator('input[data-cle="etats"][data-valeur="error"]')).toHaveCount(1);
  await dlg.getByRole('button', { name: 'Tout effacer' }).click();
  await expect(page.locator('.autom-ligne')).toHaveCount(1);
  // vue « workflows non reconnus » : pas de liste d'exécutions, les filtres d'automatisation et d'état sont masqués
  await proprio.selectOption('a-verifier');
  await expect(page.locator('[data-action="filtres"]')).toBeHidden();
  await expect(page.locator('.autom-averifier')).toHaveCount(2);
  await proprio.selectOption('interne');
  await expect(page.locator('[data-action="filtres"]')).toBeVisible();
  await expect(page.locator('.autom-ligne')).toHaveCount(1);
});
