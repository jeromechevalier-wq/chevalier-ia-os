// Réglages > Maintenance > « Sauvegarde » : le bouton « Exporter mes données » télécharge un JSON des données du module Maintenance (id technique tableaudebord) et de lui seul.
// Un test par critère (le nom commence par son numéro). Captures dans tests/e2e/captures/tableaudebord-export/.
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { test, expect, connecter, allerA, ouvrirSectionReglages, attendreCalme, ecrireDocument } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/tableaudebord-export/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' });
}
const bouton = (page) => page.locator('#reglages-export-maintenance [data-action="exporter-maintenance"]');

async function ouvrirReglages(page) {
  await connecter(page);
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Maintenance');
  await expect(page.locator('#reglages-export-maintenance')).toBeAttached();
  await attendreCalme(page);
}
async function donnees() {
  await ecrireDocument('tableaudebord_indicateurs/cle-test', { tableau: 'technique', famille: 'Clés', nom: 'Clé de test', type: 'etat', niveau: 'vert', releveLe: new Date() });
  await ecrireDocument('tableaudebord_releves/r1', { indicateurId: 'cle-test', avant: { valeur: 1 }, apres: { valeur: 2 }, creeLe: new Date() });
  await ecrireDocument('tableaudebord_demandes/d1', { indicateurId: 'cle-test', etat: 'en_attente', creeLe: new Date() });
}
async function telecharger(page) {
  const [dl] = await Promise.all([page.waitForEvent('download'), bouton(page).click()]);
  return { nom: dl.suggestedFilename(), json: JSON.parse(await readFile(await dl.path(), 'utf8')) };
}

test('EXP-maintenance-a le bouton « Exporter mes données » est dans Réglages > Maintenance, section « Sauvegarde », secondaire (jamais jaune)', async ({ page }, info) => {
  await ouvrirReglages(page);
  await bouton(page).scrollIntoViewIfNeeded();
  await expect(bouton(page)).toHaveText('Exporter mes données');
  await expect(bouton(page)).toHaveClass(/bouton-secondaire/);
  await expect(bouton(page)).not.toHaveClass(/bouton-principal/);
  await expect(page.locator('#reglages-export-maintenance h2')).toContainText('Sauvegarde');
  await expect(page.locator('#reglages-export-maintenance')).not.toContainText(/CRM/);
  await capturer(page, info, 'EXP-maintenance-a-bouton');
});

test('EXP-maintenance-b le fichier est un JSON daté avec indicateurs, relevés et demandes ; toast « Sauvegarde téléchargée »', async ({ page }) => {
  await donnees();
  await ouvrirReglages(page);
  const { nom, json } = await telecharger(page);
  expect(nom).toMatch(/^chevalier-ia-maintenance-\d{4}-\d{2}-\d{2}\.json$/);
  expect(Object.keys(json.collections).sort()).toEqual(['tableaudebord_demandes', 'tableaudebord_indicateurs', 'tableaudebord_releves']);
  expect(json.collections.tableaudebord_indicateurs.map((i) => i.nom)).toEqual(['Clé de test']);
  expect(json.collections.tableaudebord_releves.map((r) => r.id)).toEqual(['r1']);
  expect(json.collections.tableaudebord_demandes.map((d) => d.id)).toEqual(['d1']);
  await expect(page.locator('.toast')).toContainText('Sauvegarde téléchargée');
});

test('EXP-maintenance-c cas vide : sans donnée, le fichier contient trois listes vides et aucune erreur n’apparaît', async ({ page }) => {
  await ouvrirReglages(page);
  const { json } = await telecharger(page);
  for (const nom of ['tableaudebord_indicateurs', 'tableaudebord_releves', 'tableaudebord_demandes']) expect(json.collections[nom], nom).toEqual([]);
  await expect(page.locator('.toast')).toContainText('Sauvegarde téléchargée');
});

test('EXP-maintenance-d cas d’erreur : si la lecture échoue, toast « Export impossible » et aucun fichier', async ({ page }) => {
  await ouvrirReglages(page);
  let telechargements = 0;
  page.on('download', () => { telechargements += 1; });
  const ok = await page.evaluate(async () => {
    const { exporterMaintenance } = await import('/js/modules/tableaudebord/export.js');
    return exporterMaintenance({ lire: async () => { throw new Error('permission-denied'); } });
  });
  expect(ok).toBe(false);
  await expect(page.locator('.toast')).toContainText('Export impossible');
  expect(telechargements).toBe(0);
});
