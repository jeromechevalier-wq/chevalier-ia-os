// Réglages > Devis > « Sauvegarde » : le bouton « Exporter mes données » télécharge un fichier JSON des données du module Devis (et de lui seul).
// Un test par critère (le nom commence par son numéro). Captures dans tests/e2e/captures/devis-export/ (ordinateur et téléphone).
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { test, expect, connecter, allerA, ouvrirSectionReglages, attendreCalme, ecrireDocument, JEROME } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-export/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' });
}
const bouton = (page) => page.locator('#reglages-export-devis [data-action="exporter-devis"]');

async function ouvrirReglagesDevis(page) {
  await connecter(page);
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Devis');
  await expect(page.locator('#reglages-devis')).toBeVisible();
  await attendreCalme(page);
}
async function donnees() {
  const maintenant = new Date();
  await ecrireDocument('devis_articles/art1', { libelle: 'Carrelage 60 x 60', unite: 'm²', prixAchat: 12.5, actif: true });
  await ecrireDocument('devis_parametres/reglages', { nomBordereau: 'Bordereau', marge: 25, entreprise: { nom: 'Atelier Exemple', siret: '123 456 789 00012' } });
  await ecrireDocument('devis_vocabulaire/tableau', { cle: 'tableau', expression: 'tableau', articleId: 'a1', statut: 'a_confirmer', confirmations: 1 });
  await ecrireDocument('devis_parametres/familles',{ liste: [{ id: 'sous-1', nom: 'Faïence', actif: true, parentId: 'famille-1' }] });
  for (const [id, extra] of [['d1', { numero: 'DEV-2026-10-02-001', statut: 'envoye' }], ['d2', { statut: 'brouillon' }], ['d3', { statut: 'brouillon', archive: true }]]) {
    await ecrireDocument(`devis_devis/${id}`, {
      racineId: id, version: 1, numero: null, statut: 'brouillon', archive: false, sections: [], envois: [], creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME,
      creeLe: maintenant, modifieLe: maintenant, ...extra,
    });
  }
}
async function telecharger(page) {
  const [dl] = await Promise.all([page.waitForEvent('download'), bouton(page).click()]);
  return { nom: dl.suggestedFilename(), json: JSON.parse(await readFile(await dl.path(), 'utf8')) };
}

test('2a le bouton « Exporter mes données » est dans Réglages > Devis, section Sauvegarde, secondaire, et « Enregistrer » reste le seul bouton jaune', async ({ page }, info) => {
  await ouvrirReglagesDevis(page);
  await bouton(page).scrollIntoViewIfNeeded();
  await expect(bouton(page)).toHaveText('Exporter mes données');
  await expect(bouton(page)).toHaveClass(/bouton-secondaire/);
  await expect(page.locator('.reglages-raccourcis .reglages-raccourci[data-vers="reglages-export-devis"]')).toContainText('Sauvegarde');
  await expect(page.locator('.bouton-principal')).toHaveCount(1); // le seul bouton jaune de l'écran : « Enregistrer »
  await expect(page.locator('.bouton-principal')).toHaveAttribute('data-action', 'enregistrer-reglages-devis');
  await capturer(page, info, '2a-bouton');
});

test('2b le fichier téléchargé est un JSON daté avec devis (archivés compris), catalogue, familles et réglages ; toast « Sauvegarde téléchargée »', async ({ page }, info) => {
  await donnees();
  await ouvrirReglagesDevis(page);
  const { nom, json } = await telecharger(page);
  expect(nom).toMatch(/^chevalier-ia-devis-\d{4}-\d{2}-\d{2}\.json$/);
  expect(Object.keys(json.collections).sort()).toEqual(['devis_articles', 'devis_devis', 'devis_parametres', 'devis_usage_articles', 'devis_vocabulaire']);
  expect(json.collections.devis_vocabulaire.map((r) => r.id)).toEqual(['tableau']);
  expect(json.collections.devis_devis.map((d) => d.id).sort()).toEqual(['d1', 'd2', 'd3']);
  expect(json.collections.devis_devis.find((d) => d.id === 'd3').archive).toBe(true);
  expect(json.collections.devis_articles.map((a) => a.libelle)).toEqual(['Carrelage 60 x 60']);
  const reglages = json.collections.devis_parametres.find((p) => p.id === 'reglages');
  expect(reglages.entreprise.siret).toBe('123 456 789 00012');
  expect(json.collections.devis_parametres.some((p) => p.id === 'familles')).toBe(true);
  await expect(page.locator('.toast')).toContainText('Sauvegarde téléchargée');
  await capturer(page, info, '2b-telecharge');
});

test('2c cas vide : sans aucune donnée, le fichier contient des listes vides et aucune erreur n’apparaît', async ({ page }) => {
  await ouvrirReglagesDevis(page);
  const { json } = await telecharger(page);
  expect(json.collections).toEqual({ devis_articles: [], devis_parametres: [], devis_devis: [], devis_vocabulaire: [], devis_usage_articles: [] });
  await expect(page.locator('.toast')).toContainText('Sauvegarde téléchargée');
});

test('2d cas d’erreur : si la lecture échoue, toast « Export impossible » et aucun fichier', async ({ page }) => {
  await ouvrirReglagesDevis(page);
  let telechargements = 0;
  page.on('download', () => { telechargements += 1; });
  const ok = await page.evaluate(async () => {
    const { exporterDevis } = await import('/js/modules/devis/export.js');
    return exporterDevis({ lire: async () => { throw new Error('permission-denied'); } });
  });
  expect(ok).toBe(false);
  await expect(page.locator('.toast')).toContainText('Export impossible');
  expect(telechargements).toBe(0);
});

test('2e aucun secret dans le fichier : ni jeton, ni clé, ni compteur de numéros', async ({ page }) => {
  await donnees();
  await ouvrirReglagesDevis(page);
  const { json } = await telecharger(page);
  expect(JSON.stringify(json)).not.toMatch(/token|jeton|secret|apikey|api_key|password|mot_de_passe/i);
  expect(json.collections.devis_compteurs).toBeUndefined();
});
