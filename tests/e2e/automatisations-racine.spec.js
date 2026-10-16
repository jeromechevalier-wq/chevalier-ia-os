// Module Automatisations chez Jérôme (racine, règles du CRM) : visible dans le menu depuis le 16/10/2026, avec un état vide propre tant qu'aucun
// workflow n'a été copié dans sa base. Aucune fonction de copie n'existe pour la racine : ni bouton « Rafraîchir », ni mise à jour automatique,
// ni appel au serveur. Les données déjà présentes (si un jour la copie est branchée) s'affichent comme chez un client.
import { test, expect, connecter, ecrireDocument, estTelephone } from './outils.js';

const MIN = 60000;
const il_y_a = (ms) => new Date(Date.now() - ms);

test('Automatisations chez Jérôme : menu visible, état vide propre, aucun bouton de copie, aucun appel au serveur, aucune erreur', async ({ page, erreursConsole }, info) => {
  const appels = [];
  page.on('request', (r) => { if (/automatisations(Rafraichir|Renommer)/.test(r.url())) appels.push(r.url()); });
  await connecter(page);
  await page.evaluate(() => { location.hash = '#/automatisations/historique'; });
  await expect(page.getByRole('heading', { name: 'Automatisations' })).toBeVisible();
  await expect(page.locator('.autom-vide')).toContainText('Aucune automatisation n’a encore été copiée dans cette base');
  await expect(page.locator('.autom-resume')).toHaveText(/0\s*en cours\s*0\s*en erreur\s*0\s*à vérifier\s*0\s*terminées/);
  await expect(page.getByRole('button', { name: /Rafraîchir/ })).toHaveCount(0);
  await expect(page.getByLabel(/Mise à jour automatique/)).toHaveCount(0);
  await page.screenshot({ path: `test-results/automatisations-racine-vide-${info.project.name}.png`, fullPage: true });
  // Menu : un groupe « Automatisations » avec « Historique », à côté du CRM et de son écran « Journal » qui garde son nom.
  if (estTelephone(page)) await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await expect(page.locator('.menu').getByRole('link', { name: 'Historique', exact: true })).toBeVisible();
  await expect(page.locator('.menu').getByRole('link', { name: 'Journal', exact: true })).toHaveCount(1);
  if (estTelephone(page)) await page.keyboard.press('Escape');
  await page.waitForTimeout(1500); // laisse passer au moins un « tic » : la mise à jour automatique ne doit rien demander
  expect(appels).toEqual([]);
  expect(erreursConsole).toEqual([]);
});

test('Automatisations chez Jérôme : si des workflows sont présents à la racine, ils s\'affichent (lecture seule, renommage absent)', async ({ page, erreursConsole }) => {
  await ecrireDocument('workflows/wf1', { workflowId: 'wf1', nom: 'Mon workflow', active: true, stepsPlan: [] });
  await ecrireDocument('executions/501', {
    executionId: '501', workflowId: 'wf1', workflowLabel: 'Mon workflow', status: 'success', stale: false, mode: 'webhook',
    startedAt: il_y_a(5 * MIN), stoppedAt: il_y_a(5 * MIN - 1500), durationMs: 1500, retryOf: null, errorMessage: null, failedStep: null,
    runGroupId: null, source: 'sync', lastSyncedAt: new Date(), expireAt: null,
  });
  await connecter(page);
  await page.evaluate(() => { location.hash = '#/automatisations/historique'; });
  await expect(page.locator('.autom-ligne')).toHaveCount(1);
  await expect(page.locator('.autom-ligne .autom-nom')).toHaveText('Mon workflow');
  await expect(page.locator('.autom-ligne button.autom-nom-editable')).toHaveCount(0);
  await expect(page.locator('.autom-resume')).toHaveText(/1\s*terminées/);
  expect(erreursConsole).toEqual([]);
});
