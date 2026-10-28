// Réglages > Veille > « Sauvegarde » : le bouton « Exporter mes données » télécharge un JSON des données du module Veille (et de lui seul).
// Un test par critère (le nom commence par son numéro). Captures dans tests/e2e/captures/veille-export/.
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { test, expect, connecter, allerA, ouvrirSectionReglages, attendreCalme, ecrireDocument } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/veille-export/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' });
}
const bouton = (page) => page.locator('#reglages-export-veille [data-action="exporter-veille"]');

async function ouvrirReglages(page) {
  await connecter(page);
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Veille');
  await expect(page.locator('#reglages-export-veille')).toBeAttached();
  await attendreCalme(page);
}
async function donnees() {
  await ecrireDocument('veille_sources/s1', { nom: 'Chaîne Alpha', url: 'https://exemple.test/alpha', type: 'YouTube', actif: true });
  await ecrireDocument('veille_contenus/c1', { sourceId: 's1', sourceNom: 'Chaîne Alpha', titre: 'Une vidéo résumée', url: 'https://exemple.test/v1', type: 'YouTube', etat: 'resume', datePublication: new Date() });
  await ecrireDocument('veille_resumes/r1', { contenuId: 'c1', modele: 'modele-test', pageDisponible: true, creeLe: new Date() });
  await ecrireDocument('veille_pages/r1', { html: '<h1>Un joli résumé</h1>' });
}
async function telecharger(page) {
  const [dl] = await Promise.all([page.waitForEvent('download'), bouton(page).click()]);
  return { nom: dl.suggestedFilename(), json: JSON.parse(await readFile(await dl.path(), 'utf8')) };
}

test('EXP-veille-a le bouton « Exporter mes données » est dans Réglages > Veille, section « Sauvegarde », secondaire (jamais jaune)', async ({ page }, info) => {
  await ouvrirReglages(page);
  await bouton(page).scrollIntoViewIfNeeded();
  await expect(bouton(page)).toHaveText('Exporter mes données');
  await expect(bouton(page)).toHaveClass(/bouton-secondaire/);
  await expect(bouton(page)).not.toHaveClass(/bouton-principal/);
  await expect(page.locator('#reglages-export-veille h2')).toContainText('Sauvegarde');
  await expect(page.locator('#reglages-export-veille')).not.toContainText(/CRM/);
  await capturer(page, info, 'EXP-veille-a-bouton');
});

test('EXP-veille-b le fichier est un JSON daté avec sources, contenus, résumés et pages ; toast « Sauvegarde téléchargée »', async ({ page }) => {
  await donnees();
  await ouvrirReglages(page);
  const { nom, json } = await telecharger(page);
  expect(nom).toMatch(/^chevalier-ia-veille-\d{4}-\d{2}-\d{2}\.json$/);
  expect(Object.keys(json.collections).sort()).toEqual(['veille_contenus', 'veille_pages', 'veille_resumes', 'veille_sources']);
  expect(json.collections.veille_sources.map((s) => s.nom)).toEqual(['Chaîne Alpha']);
  expect(json.collections.veille_contenus.map((c) => c.id)).toEqual(['c1']);
  expect(json.collections.veille_resumes.map((r) => r.id)).toEqual(['r1']);
  expect(json.collections.veille_pages.map((p) => p.id)).toEqual(['r1']);
  await expect(page.locator('.toast')).toContainText('Sauvegarde téléchargée');
});

test('EXP-veille-c cas vide : sans donnée, le fichier contient quatre listes vides et aucune erreur n’apparaît', async ({ page }) => {
  await ouvrirReglages(page);
  const { json } = await telecharger(page);
  for (const nom of ['veille_sources', 'veille_contenus', 'veille_resumes', 'veille_pages']) expect(json.collections[nom], nom).toEqual([]);
  await expect(page.locator('.toast')).toContainText('Sauvegarde téléchargée');
});

test('EXP-veille-d cas d’erreur : si la lecture échoue, toast « Export impossible » et aucun fichier', async ({ page }) => {
  await ouvrirReglages(page);
  let telechargements = 0;
  page.on('download', () => { telechargements += 1; });
  const ok = await page.evaluate(async () => {
    const { exporterVeille } = await import('/js/modules/veille/export.js');
    return exporterVeille({ lire: async () => { throw new Error('permission-denied'); } });
  });
  expect(ok).toBe(false);
  await expect(page.locator('.toast')).toContainText('Export impossible');
  expect(telechargements).toBe(0);
});
