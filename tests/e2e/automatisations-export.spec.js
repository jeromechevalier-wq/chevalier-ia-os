// Réglages > Automatisations > « Sauvegarde » : le bouton « Exporter mes données » télécharge un JSON des données du module Automatisations (et de lui seul).
// Un test par critère (le nom commence par son numéro). Captures dans tests/e2e/captures/automatisations-export/.
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { test, expect, connecter, allerA, ouvrirSectionReglages, attendreCalme, ecrireDocument } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/automatisations-export/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' });
}
const bouton = (page) => page.locator('#reglages-export-automatisations [data-action="exporter-automatisations"]');

async function ouvrirReglages(page) {
  await connecter(page);
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Automatisations');
  await expect(page.locator('#reglages-export-automatisations')).toBeVisible();
  await attendreCalme(page);
}
async function donnees() {
  const maintenant = new Date();
  await ecrireDocument('workflows/w1', { name: 'Relance des devis', active: true, proprietaire: 'interne' });
  await ecrireDocument('executions/e1', { workflowId: 'w1', status: 'success', startedAt: maintenant, stoppedAt: maintenant });
  await ecrireDocument('executions/e2', { workflowId: 'w1', status: 'error', startedAt: maintenant, stoppedAt: maintenant });
  await ecrireDocument('sync/state', { lastSyncedAt: maintenant, resultat: 'ok' });
  await ecrireDocument('automatisations_propositions/pr1', { etat: 'a_valider', titre: 'Proposition exemple', creeLe: maintenant });
}
async function telecharger(page) {
  const [dl] = await Promise.all([page.waitForEvent('download'), bouton(page).click()]);
  return { nom: dl.suggestedFilename(), json: JSON.parse(await readFile(await dl.path(), 'utf8')) };
}

test('EXP-automatisations-a le bouton « Exporter mes données » est dans Réglages > Automatisations, section « Sauvegarde », secondaire (jamais jaune)', async ({ page }, info) => {
  await ouvrirReglages(page);
  await expect(bouton(page)).toHaveText('Exporter mes données');
  await expect(bouton(page)).toHaveClass(/bouton-secondaire/);
  await expect(bouton(page)).not.toHaveClass(/bouton-principal/);
  await expect(page.locator('#reglages-export-automatisations h2')).toContainText('Sauvegarde');
  await expect(page.locator('#reglages-export-automatisations')).not.toContainText(/CRM/);
  await capturer(page, info, 'EXP-automatisations-a-bouton');
});

test('EXP-automatisations-b le fichier est un JSON daté avec workflows, exécutions, état de la copie et propositions ; toast « Sauvegarde téléchargée »', async ({ page }) => {
  await donnees();
  await ouvrirReglages(page);
  const { nom, json } = await telecharger(page);
  expect(nom).toMatch(/^chevalier-ia-automatisations-\d{4}-\d{2}-\d{2}\.json$/);
  expect(Object.keys(json.collections).sort()).toEqual(['automatisations_propositions', 'executions', 'sync', 'workflows']);
  expect(json.collections.workflows.map((w) => w.id)).toEqual(['w1']);
  expect(json.collections.executions.map((e) => e.id).sort()).toEqual(['e1', 'e2']);
  expect(json.collections.sync.map((s) => s.id)).toEqual(['state']);
  expect(json.collections.automatisations_propositions.map((p) => p.id)).toEqual(['pr1']);
  await expect(page.locator('.toast')).toContainText('Sauvegarde téléchargée');
});

test('EXP-automatisations-c cas vide : sans aucune donnée, le fichier contient des listes vides et aucune erreur n’apparaît', async ({ page }) => {
  await ouvrirReglages(page);
  const { json } = await telecharger(page);
  expect(json.collections).toEqual({ workflows: [], executions: [], sync: [], automatisations_propositions: [] });
  await expect(page.locator('.toast')).toContainText('Sauvegarde téléchargée');
});

test('EXP-automatisations-d cas d’erreur : si la lecture échoue, toast « Export impossible » et aucun fichier', async ({ page }) => {
  await ouvrirReglages(page);
  let telechargements = 0;
  page.on('download', () => { telechargements += 1; });
  const ok = await page.evaluate(async () => {
    const { exporterAutomatisations } = await import('/js/modules/automatisations/export.js');
    return exporterAutomatisations({ lire: async () => { throw new Error('permission-denied'); } });
  });
  expect(ok).toBe(false);
  await expect(page.locator('.toast')).toContainText('Export impossible');
  expect(telechargements).toBe(0);
});
