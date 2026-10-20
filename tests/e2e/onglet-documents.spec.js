// Onglet « Documents » à côté d'Activité et Notes (affaire et projet) : liste, boutons d'ajout, dossier de travail, compteur, trace dans l'Historique.
import { test, expect, attendreCalme, connecter, creerAffaire, creerProjet, lireDocument, listerDocuments, ecrireDocument, JEROME } from './outils.js';

async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }
const FICHES = [
  { nom: 'affaire', hash: '#/crm/affaires/a1', section: 'affaire-documents', collection: 'crm_affaires', id: 'a1', creer: () => creerAffaire('a1', { titre: 'Audit des Lilas' }) },
  { nom: 'projet', hash: '#/projets/projets/pr1', section: 'projet-documents', collection: 'projets_projets', id: 'pr1', creer: () => creerProjet('pr1', { titre: 'Refonte site' }) },
];

for (const f of FICHES) {
  test(`D1 ${f.nom} : l'onglet « Documents » vient après Notes, affiche un compteur à 0 (cas vide), et la colonne de gauche n'a plus « Liens et documents »`, async ({ page }, info) => {
    await f.creer();
    await connecter(page);
    await aller(page, f.hash);
    const onglets = page.locator('.compositeur [role="tab"]');
    await expect(onglets).toHaveCount(3);
    await expect(onglets.last()).toContainText('Documents');
    await expect(onglets.last().locator('[data-role="compteur-documents"]')).toHaveText('0');
    await expect(page.locator('.section', { hasText: 'Liens et documents' })).toHaveCount(0); // plus de section dans la colonne de gauche
    await expect(page.locator(`[data-section="${f.section}"]`)).toBeHidden(); // l'onglet n'est pas ouvert
    await onglets.last().click();
    const zone = page.locator(`[data-section="${f.section}"]`);
    await expect(zone).toBeVisible();
    await expect(zone.locator('[data-action="ajouter-lien"]')).toBeVisible();
    await expect(zone.locator('[data-prop="dossier"]')).toBeVisible(); // le dossier de travail est dans l'onglet
    await expect(page.locator('[data-section$="-details"] [data-prop="dossier"]')).toHaveCount(0);
    await page.screenshot({ path: `test-results/onglet-documents-${f.nom}-${info.project.name}.png`, fullPage: true });
  });

  test(`D2 ${f.nom} : ajouter un lien web dans l'onglet met le compteur à jour et laisse « Document joint » dans l'Historique (filtre « Documents »)`, async ({ page }) => {
    await f.creer();
    await connecter(page);
    await aller(page, f.hash);
    await page.locator('.compositeur [data-onglet="documents"]').click();
    const zone = page.locator(`[data-section="${f.section}"]`);
    await zone.locator('[data-action="ajouter-lien"]').click();
    await zone.getByLabel('Lien web', { exact: true }).fill('https://exemple.fr/devis');
    await zone.getByLabel('Nom (facultatif)').fill('Devis signé');
    await zone.locator('[data-action="valider-lien"]').click();
    await expect.poll(async () => ((await lireDocument(`${f.collection}/${f.id}`)).documents || []).length).toBe(1);
    await expect(page.locator('[data-role="compteur-documents"]')).toHaveText('1');
    await expect(zone).toContainText('Devis signé');
    await page.locator('[data-filtre="documents"]').click();
    await expect(page.locator('.fil [data-genre="evenement"]')).toContainText('Document joint : Devis signé');
    await page.locator('[data-filtre="notes"]').click();
    await expect(page.locator('.fil [data-genre="evenement"]')).toHaveCount(0);
  });
}
