// Montant de l'affaire (29/10/2026, règle D17, docs/montant-affaire.md) : UNE seule vérité, lue dans l'affaire (`montantDevisHt` + nature + détail écrits par le serveur, sinon le montant saisi à la main).
// Chaque test porte le numéro d'un point du brief ; captures dans tests/e2e/captures/affaire-montant/ (ordinateur et téléphone).
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, lireDocument, creerAffaire, PROJET, FIRESTORE, URL_APP } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/affaire-montant/', import.meta.url));
async function capturer(page, info, nom, zone = page.locator('.fiche-tete')) {
  await mkdir(DOSSIER, { recursive: true });
  await zone.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
}

/** Le haut de la page, infobulle ouverte comprise (la zone « en-tête » seule la couperait). */
async function capturerHaut(page, info, nom) {
  await mkdir(DOSSIER, { recursive: true });
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled', clip: { x: 0, y: 0, width: page.viewportSize().width, height: 420 } });
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

const ACCEPTE = { montantDevisHt: 2748.8, montantDevisNature: 'accepte', montantDevisDetail: [{ numero: 'DEV-2026-10-27-011', version: 1, ht: 2148.8, compte: true }, { numero: 'DEV-2026-10-28-012', version: 2, ht: 600, compte: true }] };
const PROPOSE = { montantDevisHt: 1200, montantDevisNature: 'propose', montantDevisDetail: [{ numero: 'DEV-2026-10-29-013', version: 2, ht: 1200, compte: true }, { numero: 'DEV-2026-10-26-010', version: 1, ht: 900, compte: false }] };
const bulle = (page) => montant(page).locator('[data-role="bulle-info"]');

test('3 devis acceptés : « Montant accepté HT » = la somme ; l’infobulle donne les vrais devis et l’addition ; plus de crayon (le chiffre est calculé)', async ({ page }, info) => {
  await creerAffaire('a1', { titre: 'Rénovation cuisine', montant: 1500, ...ACCEPTE });
  await ouvrirAffaire(page);
  await expect(libelle(page)).toHaveText('Montant accepté HT');
  await expect(montant(page).locator('.fiche-montant-valeur')).toContainText(/2\s?748,80\s€/);
  await expect(montant(page).locator('.fiche-montant-valeur')).toContainText('HT');
  await expect(montant(page).locator('.prop-modifier')).toHaveCount(0);
  await expect(ligneEstime(page)).toHaveCount(0);
  await expect(bulle(page)).toContainText(/Devis acceptés : DEV-2026-10-27-011 : 2\s?148,80\s€ HT \+ DEV-2026-10-28-012 v2 : 600\s€ HT = 2\s?748,80\s€ HT\./);
  await expect(bulle(page)).toContainText(/Ton montant estimé \(1\s?500\s€\) est gardé/);
  await montant(page).locator('[data-role="info"]').hover();
  await capturerHaut(page, info, '3-montant-accepte-infobulle');
  expect((await lireDocument('crm_affaires/a1')).montant).toBe(1500); // le montant saisi est intact
});

test('3b devis proposé seulement : « Montant proposé HT » = le devis le plus récent ; l’infobulle dit quel devis est compté et lequel ne l’est pas', async ({ page }, info) => {
  await creerAffaire('a1', { titre: 'Rénovation cuisine', ...PROPOSE });
  await ouvrirAffaire(page);
  await expect(libelle(page)).toHaveText('Montant proposé HT');
  await expect(montant(page).locator('.fiche-montant-valeur')).toContainText(/1\s?200\s€/);
  await expect(bulle(page)).toContainText(/Devis proposé le plus récent : DEV-2026-10-29-013 v2 : 1\s?200\s€ HT\./);
  await expect(bulle(page)).toContainText(/Non compté \(devis proposé plus ancien\) : DEV-2026-10-26-010 : 900\s€ HT\./);
  await expect(bulle(page)).toContainText('Aucun devis n’est encore accepté.');
  await montant(page).locator('[data-role="info"]').hover();
  await capturerHaut(page, info, '3b-montant-propose-infobulle');
});

test('4 le montant suit l’affaire en direct : proposé puis accepté, puis plus aucun devis (le montant saisi revient, avec son crayon), sans recharger la page', async ({ page }, info) => {
  await creerAffaire('a1', { titre: 'Rénovation cuisine', montant: 900, ...PROPOSE });
  await ouvrirAffaire(page);
  await expect(libelle(page)).toHaveText('Montant proposé HT');
  const base = await lireDocument('crm_affaires/a1');
  await ecrireDocument('crm_affaires/a1', { ...base, ...ACCEPTE }); // ce que fait le serveur quand le devis est accepté
  await expect(libelle(page)).toHaveText('Montant accepté HT');
  await ecrireDocument('crm_affaires/a1', { ...base, montantDevisHt: null, montantDevisNature: null, montantDevisDetail: null }); // plus aucun devis qui compte
  await expect(libelle(page)).toHaveText('Montant estimé');
  await expect(montant(page)).toContainText(/900\s€/);
  await expect(montant(page).locator('.prop-modifier')).toHaveCount(1);
  await capturer(page, info, '4-estime-revenu');
});

test('5 la fiche, le Kanban (carte, total de colonne) et la Liste montrent le même chiffre, avec « HT » quand il vient des devis', async ({ page }, info) => {
  await creerAffaire('a1', { titre: 'Rénovation cuisine', montant: 1500, ...ACCEPTE });
  await creerAffaire('a2', { titre: 'Autre affaire', montant: 300 });
  await creerAffaire('a3', { titre: 'Offre en cours', ...PROPOSE });
  await connecter(page, undefined, { route: 'crm/affaires' });
  await attendreCalme(page);
  const colonne = page.locator('.colonne[data-colonne="premier_contact"]');
  const montantCarte = (titre) => colonne.locator('.carte-affaire', { hasText: titre }).locator('.carte-montant');
  await expect(montantCarte('Rénovation cuisine')).toHaveText(/2\s?748,80\s€ HT/);
  await expect(montantCarte('Offre en cours')).toHaveText(/1\s?200\s€ HT/);
  await expect(montantCarte('Autre affaire')).toHaveText(/300\s€/);
  await expect(montantCarte('Autre affaire')).not.toContainText('HT'); // le montant saisi n'a pas de « HT »
  await expect(colonne.locator('.colonne-totaux')).toContainText(/4\s?248,80\s€/); // 2 748,80 + 1 200 + 300
  await capturer(page, info, '5-kanban', colonne);
  await page.locator('.bascule-vue[data-vue="liste"]').click();
  await expect(page.locator('tbody tr', { hasText: 'Rénovation cuisine' }).locator('td[data-libelle="Montant"]')).toHaveText(/2\s?748,80\s€ HT/);
});

test('6 le tri par montant utilise le montant affiché (celui des devis d’abord)', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Petite estimation', montant: 5000, montantDevisHt: 100, montantDevisNature: 'accepte' });
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
