// Réglages > Affaires et projets > « Sauvegarde des projets » : le bouton « Exporter mes données » télécharge un JSON des données du module Projets (et de lui seul).
// Un test par critère (le nom commence par son numéro). Captures dans tests/e2e/captures/projets-export/.
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { test, expect, connecter, allerA, ouvrirSectionReglages, attendreCalme, ecrireDocument, JEROME } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/projets-export/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' });
}
const bouton = (page) => page.locator('#reglages-export-projets [data-action="exporter-projets"]');

async function ouvrirReglages(page) {
  await connecter(page);
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Affaires et projets');
  await expect(page.locator('#reglages-export-projets')).toBeAttached();
  await attendreCalme(page);
}
async function donnees() {
  const maintenant = new Date();
  const base = { creePar: JEROME, modifiePar: JEROME, creeLe: maintenant, modifieLe: maintenant };
  await ecrireDocument('projets_projets/p1', { ...base, titre: 'Rénovation cuisine', phase: 'en-cours', archive: false });
  await ecrireDocument('projets_projets/p2', { ...base, titre: 'Projet archivé', archive: true });
  await ecrireDocument('projets_taches/t1', { ...base, projetId: 'p1', titre: 'Poser la faïence' });
  await ecrireDocument('projets_modeles/m1', { ...base, nom: 'Modèle exemple' });
}
async function telecharger(page) {
  const [dl] = await Promise.all([page.waitForEvent('download'), bouton(page).click()]);
  return { nom: dl.suggestedFilename(), json: JSON.parse(await readFile(await dl.path(), 'utf8')) };
}

test('EXP-projets-a le bouton « Exporter mes données » est dans Réglages, section « Sauvegarde des projets », secondaire (jamais jaune)', async ({ page }, info) => {
  await ouvrirReglages(page);
  await bouton(page).scrollIntoViewIfNeeded();
  await expect(bouton(page)).toHaveText('Exporter mes données');
  await expect(bouton(page)).toHaveClass(/bouton-secondaire/);
  await expect(bouton(page)).not.toHaveClass(/bouton-principal/);
  await expect(page.locator('#reglages-export-projets h2')).toContainText('Sauvegarde des projets');
  await expect(page.locator('#reglages-export-projets')).not.toContainText(/CRM/);
  await capturer(page, info, 'EXP-projets-a-bouton');
});

test('EXP-projets-b le fichier est un JSON daté avec projets (archivés compris), livrables et modèles ; toast « Sauvegarde téléchargée »', async ({ page }) => {
  await donnees();
  await ouvrirReglages(page);
  const { nom, json } = await telecharger(page);
  expect(nom).toMatch(/^chevalier-ia-projets-\d{4}-\d{2}-\d{2}\.json$/);
  expect(Object.keys(json.collections).sort()).toEqual(['projets_modeles', 'projets_projets', 'projets_taches']);
  expect(json.collections.projets_projets.map((p) => p.id).sort()).toEqual(['p1', 'p2']);
  expect(json.collections.projets_projets.find((p) => p.id === 'p2').archive).toBe(true);
  expect(json.collections.projets_taches.map((t) => t.titre)).toEqual(['Poser la faïence']);
  expect(json.collections.projets_modeles.some((m) => m.id === 'm1')).toBe(true);
  await expect(page.locator('.toast')).toContainText('Sauvegarde téléchargée');
});

test('EXP-projets-c cas vide : sans projet ni livrable, le fichier contient des listes vides (les modèles de départ peuvent y être) et aucune erreur n’apparaît', async ({ page }) => {
  await ouvrirReglages(page);
  const { json } = await telecharger(page);
  expect(json.collections.projets_projets).toEqual([]);
  expect(json.collections.projets_taches).toEqual([]);
  expect(Array.isArray(json.collections.projets_modeles)).toBe(true);
  await expect(page.locator('.toast')).toContainText('Sauvegarde téléchargée');
});

test('EXP-projets-d cas d’erreur : si la lecture échoue, toast « Export impossible » et aucun fichier', async ({ page }) => {
  await ouvrirReglages(page);
  let telechargements = 0;
  page.on('download', () => { telechargements += 1; });
  const ok = await page.evaluate(async () => {
    const { exporterProjets } = await import('/js/modules/projets/export.js');
    return exporterProjets({ lire: async () => { throw new Error('permission-denied'); } });
  });
  expect(ok).toBe(false);
  await expect(page.locator('.toast')).toContainText('Export impossible');
  expect(telechargements).toBe(0);
});
