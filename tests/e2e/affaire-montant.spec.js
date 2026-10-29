// Montant de l'affaire (29/10/2026, règle D17) : UNE seule vérité, lue dans l'affaire (`montantDevisHt` écrit par le serveur, sinon le montant estimé saisi à la main).
// Chaque test porte le numéro d'un point du brief ; captures dans tests/e2e/captures/affaire-montant/ (ordinateur et téléphone).
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, lireDocument, creerAffaire, PROJET, FIRESTORE, URL_APP } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/affaire-montant/', import.meta.url));
async function capturer(page, info, nom, zone = page.locator('.fiche-tete')) {
  await mkdir(DOSSIER, { recursive: true });
  await zone.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
}

async function ouvrirAffaire(page, id = 'a1') {
  await connecter(page, undefined, { route: `crm/affaires/${id}` });
  await expect(page.locator('.fiche-tete')).toBeVisible();
  await attendreCalme(page);
}
const montant = (page) => page.locator('.fiche-tete .fiche-montant');
const libelle = (page) => page.locator('.fiche-tete [data-role="libelle-montant"]');
const ligneEstime = (page) => page.locator('[data-section="affaire-resume"] .prop', { hasText: 'Montant estimé' });

// Dans ce bac à sable, le script de Google est inaccessible : on le remplace par un fichier vide.
test.beforeEach(async ({ page }) => {
  await page.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
});

test('1 sans devis accepté et sans montant saisi : « Montant estimé » et un tiret gris, jamais un chiffre inventé ni rien d’enregistré', async ({ page }, info) => {
  await creerAffaire('a1', { titre: 'Rénovation cuisine' });
  await ouvrirAffaire(page);
  await expect(libelle(page)).toHaveText('Montant estimé');
  await expect(montant(page).locator('.prop-fantome')).toHaveText('—');
  await expect(montant(page)).not.toContainText('999');
  await expect(ligneEstime(page)).toHaveCount(0); // un seul endroit pour le montant estimé : l'en-tête
  expect((await lireDocument('crm_affaires/a1')).montant ?? null).toBeNull();
  await capturer(page, info, '1-tiret');
});

test('2 sans devis accepté, un montant estimé saisi : « Montant estimé » et sa valeur, modifiable au crayon', async ({ page }, info) => {
  await creerAffaire('a1', { titre: 'Rénovation cuisine', montant: 1500 });
  await ouvrirAffaire(page);
  await expect(libelle(page)).toHaveText('Montant estimé');
  await expect(montant(page)).toContainText(/1\s?500\s€/);
  await capturer(page, info, '2-montant-estime');
  await montant(page).locator('.prop-modifier').click();
  await page.getByLabel('Montant estimé', { exact: true }).fill('1800');
  await page.getByLabel('Montant estimé', { exact: true }).press('Enter');
  await expect.poll(async () => (await lireDocument('crm_affaires/a1')).montant).toBe(1800);
});

test('3 devis accepté : la fiche montre « Montant accepté HT » ; le montant estimé reste dans le Résumé, avec son crayon', async ({ page }, info) => {
  await creerAffaire('a1', { titre: 'Rénovation cuisine', montant: 1500, montantDevisHt: 1200 });
  await ouvrirAffaire(page);
  await expect(libelle(page)).toHaveText('Montant accepté HT');
  await expect(montant(page)).toContainText(/1\s?200\s€/);
  await expect(montant(page)).toContainText('HT');
  await expect(montant(page).locator('.fiche-montant-valeur')).not.toContainText(/1\s?500/);
  await expect(ligneEstime(page)).toContainText(/1\s?500\s€/);
  await capturer(page, info, '3-montant-accepte');
  await capturer(page, info, '3-resume-montant-estime', page.locator('[data-section="affaire-resume"]'));
  // le crayon corrige le montant estimé ; l'en-tête ne bouge pas
  await ligneEstime(page).locator('.prop-modifier').click();
  await page.getByLabel('Montant estimé', { exact: true }).fill('1600');
  await page.getByLabel('Montant estimé', { exact: true }).press('Enter');
  await expect.poll(async () => (await lireDocument('crm_affaires/a1')).montant).toBe(1600);
  expect((await lireDocument('crm_affaires/a1')).montantDevisHt).toBe(1200);
  await expect(montant(page)).toContainText(/1\s?200\s€/);
});

test('3b cas vide : devis accepté et montant estimé jamais saisi : l’en-tête montre le montant accepté, le Résumé garde « Montant estimé » avec un tiret et son crayon', async ({ page }, info) => {
  await creerAffaire('a1', { titre: 'Rénovation cuisine', montantDevisHt: 1200 });
  await ouvrirAffaire(page);
  await expect(libelle(page)).toHaveText('Montant accepté HT');
  await expect(montant(page)).toContainText(/1\s?200\s€/);
  await expect(ligneEstime(page).locator('.prop-fantome')).toHaveText('—');
  await capturer(page, info, '3b-resume-estime-vide', page.locator('[data-section="affaire-resume"]'));
  await ligneEstime(page).locator('.prop-fantome').click();
  await page.getByLabel('Montant estimé', { exact: true }).fill('2000');
  await page.getByLabel('Montant estimé', { exact: true }).press('Enter');
  await expect.poll(async () => (await lireDocument('crm_affaires/a1')).montant).toBe(2000);
  await expect(montant(page)).toContainText(/1\s?200\s€/);
});

test('4 le montant suit l’affaire en direct : devis acceptés retirés (archivés), le montant estimé revient sans recharger la page', async ({ page }, info) => {
  await creerAffaire('a1', { titre: 'Rénovation cuisine', montant: 900, montantDevisHt: 720 });
  await ouvrirAffaire(page);
  await expect(libelle(page)).toHaveText('Montant accepté HT');
  await ecrireDocument('crm_affaires/a1', { ...(await lireDocument('crm_affaires/a1')), montantDevisHt: null }); // ce que fait le serveur quand le dernier devis accepté est archivé
  await expect(libelle(page)).toHaveText('Montant estimé');
  await expect(montant(page)).toContainText(/900\s€/);
  await expect(ligneEstime(page)).toHaveCount(0);
  await capturer(page, info, '4-estime-revenu');
});

test('5 la fiche, le Kanban (carte et total de colonne), la Liste et la carte de l’affaire montrent le même chiffre', async ({ page }, info) => {
  await creerAffaire('a1', { titre: 'Rénovation cuisine', montant: 1500, montantDevisHt: 1200 });
  await creerAffaire('a2', { titre: 'Autre affaire', montant: 300 });
  await connecter(page, undefined, { route: 'crm/affaires' });
  await attendreCalme(page);
  const colonne = page.locator('.colonne[data-colonne="premier_contact"]');
  await expect(colonne.locator('.carte-affaire', { hasText: 'Rénovation cuisine' }).locator('.carte-montant')).toHaveText(/1\s?200\s€/);
  await expect(colonne.locator('.carte-affaire', { hasText: 'Autre affaire' }).locator('.carte-montant')).toHaveText(/300\s€/);
  await expect(colonne.locator('.colonne-totaux')).toContainText(/1\s?500\s€/); // 1 200 + 300, jamais 1 500 + 300
  await capturer(page, info, '5-kanban', colonne);
  await page.locator('.bascule-vue[data-vue="liste"]').click();
  await expect(page.locator('tbody tr', { hasText: 'Rénovation cuisine' }).locator('td[data-libelle="Montant"]')).toHaveText(/1\s?200\s€/);
});

test('6 le tri par montant utilise le montant affiché (devis acceptés d’abord)', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Petite estimation', montant: 5000, montantDevisHt: 100 });
  await creerAffaire('a2', { titre: 'Moyenne', montant: 400 });
  await connecter(page, undefined, { route: 'crm/affaires' });
  await attendreCalme(page);
  await page.getByRole('combobox', { name: 'Trier par', exact: true }).selectOption('montant');
  await expect(page.locator('.colonne[data-colonne="premier_contact"] .carte-titre')).toHaveText(['Moyenne', 'Petite estimation']); // 400 avant 100 : le montant affiché, pas 5 000
});

// ------------------------------------------------------------------ module Devis éteint (chez un client)

test.describe('7 module Devis éteint', () => {
  async function chargerRegles(fichier) {
    const contenu = await readFile(fileURLToPath(new URL(`../../${fichier}`, import.meta.url)), 'utf8');
    const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: fichier, content: contenu }] } }) });
    if (!r.ok) throw new Error(`Règles non chargées (${fichier}) : ${await r.text()}`);
  }
  test.beforeAll(() => chargerRegles('firestore.plateforme.rules'));
  test.afterAll(() => chargerRegles('firestore.rules'));

  test('7 chez un client sans le module Devis, la fiche montre « Montant estimé » et la valeur saisie', async ({ page }, info) => {
    const ALICE = 'alice@exemple.test';
    const maintenant = new Date();
    const b = { proprietaire: ALICE, creeLe: maintenant, modifieLe: maintenant, creePar: ALICE, modifiePar: ALICE };
    await ecrireDocument('marques/studio', { actif: true, nom: 'Studio Lune', couleur: '#336699', accueil: 'Bienvenue.' });
    await ecrireDocument('clients/studio', { modules: { affaires: true }, equipe: [{ email: ALICE, role: 'editeur' }] });
    await ecrireDocument(`clients/studio/membres/${ALICE}`, { role: 'editeur' });
    await ecrireDocument('clients/studio/crm_affaires/a1', { titre: 'Audit du lac', personneId: null, organisationId: null, etape: 'etape_3', statut: 'ouverte', priorite: 'tiede', montant: 1200, offreId: null, dureeJours: null, source: '', besoin: '', dateEntreeEtape: maintenant, datesEtapes: {}, raisonPerdue: '', raisonPerdueDetail: '', dateReveil: null, encaissements: [], documents: [], projetId: null, archive: false, ...b });
    await page.goto('about:blank');
    await page.goto(`${URL_APP}#/espace/studio/crm/affaires/a1`);
    await page.waitForFunction(() => !!window.__chevalierTest);
    await page.evaluate((e) => window.__chevalierTest.connecter(e, true), ALICE);
    await expect(page.locator('.fiche-tete')).toBeVisible();
    await attendreCalme(page);
    await expect(libelle(page)).toHaveText('Montant estimé');
    await expect(montant(page)).toContainText(/1\s?200\s€/);
    await capturer(page, info, '7-module-eteint');
  });
});
