// Onglet « Documents » à côté d'Activité et Notes (affaire et projet) : liste, boutons d'ajout, dossier de travail, compteur, trace dans l'Historique.
import { brancherGoogle, choisirDansGoogle } from './google-simule.js';
import { test, expect, attendreCalme, connecter, creerAffaire, creerProjet, lireDocument, listerDocuments, ecrireDocument, JEROME, filtrerHistorique } from './outils.js';

async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }
const FICHES = [
  { nom: 'affaire', hash: '#/crm/affaires/a1', section: 'affaire-documents', collection: 'crm_affaires', id: 'a1', creer: (extra = {}) => creerAffaire('a1', { titre: 'Audit des Lilas', ...extra }) },
  { nom: 'projet', hash: '#/projets/projets/pr1', section: 'projet-documents', collection: 'projets_projets', id: 'pr1', creer: (extra = {}) => creerProjet('pr1', { titre: 'Refonte site', ...extra }) },
];

for (const f of FICHES) {
  test(`D1 ${f.nom} : l'onglet « G-Drive » vient après Notes, affiche un compteur à 0 (cas vide), et la colonne de gauche n'a plus « Liens et documents »`, async ({ page }, info) => {
    await f.creer();
    await connecter(page);
    await aller(page, f.hash);
    const onglets = page.locator('.compositeur [role="tab"]');
    await expect(onglets).toHaveCount(f.nom === 'affaire' ? 4 : 3); // l'affaire a un onglet « Devis » de plus (module Devis), toujours en dernier
    const onglet = onglets.nth(2);
    await expect(onglet).toContainText('G-Drive');
    if (f.nom === 'affaire') await expect(onglets.last()).toContainText('Devis');
    await expect(onglet.locator('[data-role="compteur-documents"]')).toHaveText('0');
    await expect(page.locator('.section', { hasText: 'Liens et documents' })).toHaveCount(0); // plus de section dans la colonne de gauche
    await expect(page.locator(`[data-section="${f.section}"]`)).toBeHidden(); // l'onglet n'est pas ouvert
    await onglet.focus(); // clavier : l'onglet est un vrai bouton
    await page.keyboard.press('Enter');
    const zone = page.locator(`[data-section="${f.section}"]`);
    await expect(zone).toBeVisible();
    await expect(zone.locator('[data-role="aucun-document"]')).toHaveText('Aucun document ni lien pour le moment.'); // cas vide
    await expect(zone.locator('[data-action="ajouter-lien"]')).toHaveCount(0); // plus de « Ajouter un lien web »
    await expect(zone.locator('[data-prop="documents"] .prop-libelle')).toContainText('Documents');
    await expect(zone.locator('[data-prop="dossier"]')).toBeVisible(); // le dossier de travail est dans l'onglet
    await expect(page.locator('[data-section$="-details"] [data-prop="dossier"]')).toHaveCount(0);
    await page.screenshot({ path: `test-results/onglet-documents-${f.nom}-${info.project.name}.png`, fullPage: true });
  });

  test(`D2 ${f.nom} : ajouter un document dans l'onglet met le compteur à jour et laisse « Document joint » dans l'Historique (filtre « Documents »)`, async ({ page, context }) => {
    const drive = await brancherGoogle(context);
    await f.creer({ urlDossier: 'https://drive.google.com/drive/folders/1AbC_dEf-1234567' });
    await connecter(page);
    await aller(page, f.hash);
    await page.locator('.compositeur [data-onglet="documents"]').click();
    const zone = page.locator(`[data-section="${f.section}"]`);
    drive.fichiers.FICHIER_D2_0001 = { parents: ['1AbC_dEf-1234567'] };
    await choisirDansGoogle(page, [{ id: 'FICHIER_D2_0001', name: 'Devis signé', url: 'https://drive.google.com/file/d/FICHIER_D2_0001/view', mimeType: 'application/pdf', parentId: '1AbC_dEf-1234567' }]);
    await zone.locator('[data-action="ajouter-document-google"]').click();
    await zone.locator('[data-action="valider-lien"]').click();
    await expect.poll(async () => ((await lireDocument(`${f.collection}/${f.id}`)).documents || []).length).toBe(1);
    await expect(page.locator('[data-role="compteur-documents"]')).toHaveText('1');
    await expect(zone).toContainText('Devis signé');
    await filtrerHistorique(page, 'documents');
    await expect(page.locator('.fil [data-genre="evenement"]')).toContainText('Document joint : Devis signé');
    // Retirer : confirmation, puis « Document retiré » dans le fil
    await zone.getByRole('button', { name: 'Retirer Devis signé' }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Retirer', exact: true }).click();
    await expect.poll(async () => ((await lireDocument(`${f.collection}/${f.id}`)).documents || []).length).toBe(0);
    await expect(page.locator('[data-role="compteur-documents"]')).toHaveText('0');
    await expect(page.locator('.fil [data-genre="evenement"]').first()).toContainText('Document retiré : Devis signé');
    await filtrerHistorique(page, 'notes');
    await expect(page.locator('.fil [data-genre="evenement"]')).toHaveCount(0);
  });
}
