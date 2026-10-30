// Lot D (27/10/2026) : l'onglet « Documents » des fiches affaire et projet s'appelle « G-Drive » (son id technique reste « documents »).
import { brancherGoogle } from './google-simule.js';
import { test, expect, attendreCalme, connecter, creerAffaire, creerProjet, ouvrirDocuments } from './outils.js';

async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }
const FICHES = [
  { nom: 'affaire', lettre: 'a', hash: '#/crm/affaires/a1', creer: () => creerAffaire('a1', { titre: 'Audit des Lilas' }) },
  { nom: 'projet', lettre: 'b', hash: '#/projets/projets/pr1', creer: () => creerProjet('pr1', { titre: 'Refonte site' }) },
];

for (const f of FICHES) {
  test(`8${f.lettre} sur ${f.nom}, l'onglet vers le Drive s'appelle « G-Drive » (cas vide : aucun lien) et son panneau porte le même nom`, async ({ page, context }, info) => {
    await f.creer();
    await brancherGoogle(context); // le navigateur de test n'atteint pas apis.google.com : Google est simulé
    await connecter(page);
    await aller(page, f.hash);
    const onglet = page.locator('.compositeur [data-onglet="documents"]');
    await expect(onglet).toContainText('G-Drive');
    await onglet.click();
    await expect(page.locator('.compositeur [role="tabpanel"][aria-label="G-Drive"]')).toBeVisible();
    await expect(page.locator('[data-role="aucun-document"]')).toBeVisible(); // cas vide
    await page.screenshot({ path: `e2e/captures/gdrive/8${f.lettre}-gdrive-${f.nom}-${info.project.name}.png` });
  });
  test(`8c sur ${f.nom}, l'onglet « G-Drive » garde l'identifiant « documents » ; « Documents » est l'onglet des fichiers chez nous (identifiant « fichiers »), pas l'ancien`, async ({ page, context }) => {
    await f.creer();
    await brancherGoogle(context); // le navigateur de test n'atteint pas apis.google.com : Google est simulé
    await connecter(page);
    await aller(page, f.hash);
    await expect(page.locator('.compositeur [data-onglet="documents"]')).toContainText('G-Drive');
    await expect(page.locator('.compositeur [role="tab"]', { hasText: 'Documents' })).toHaveCount(1);
    await expect(page.locator('.compositeur [data-onglet="fichiers"]')).toContainText('Documents');
    await ouvrirDocuments(page); // l'aide de test vise bien le nouveau nom
  });
  test(`8d sur ${f.nom}, la barre d'onglets ne déborde pas à l'horizontale (téléphone compris)`, async ({ page, context }, info) => {
    await f.creer();
    await brancherGoogle(context); // le navigateur de test n'atteint pas apis.google.com : Google est simulé
    await connecter(page);
    await aller(page, f.hash);
    const mesure = await page.locator('.compositeur [role="tablist"]').evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
    expect(mesure.sw).toBeLessThanOrEqual(mesure.cw + 1);
    const pageEnTrop = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(pageEnTrop).toBeLessThanOrEqual(1);
    await page.screenshot({ path: `e2e/captures/gdrive/8d-barre-${f.nom}-${info.project.name}.png` });
  });
}
