// Fin du menu du portail devis seul (09/11/2026) : Devis · Clients · Catalogue · Relances · Statistiques. Captures dans tests/e2e/captures/portail-menu/.
// Le nom d'un test commence par le numéro du critère (E1 à E6). Exemples chiffrés : 100 €.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, ecrireDocument, estTelephone, attendreCalme, JEROME, PROJET, FIRESTORE, URL_APP } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/portail-menu/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: true, animations: 'disabled' });
const ALICE = 'alice@exemple.test';
const ilYA = (jours) => new Date(Date.now() - jours * 86400000 - 3600000);
const jourDansLe = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

test.beforeEach(async ({ page }) => {
  await page.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
});
async function chargerRegles(fichier) {
  const contenu = await readFile(fileURLToPath(new URL(`../../${fichier}`, import.meta.url)), 'utf8');
  const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: fichier, content: contenu }] } }) });
  if (!r.ok) throw new Error(`Règles non chargées (${fichier}) : ${await r.text()}`);
}
const devis = (id, valeurs = {}, base = '') => ecrireDocument(`${base}devis_devis/${id}`, {
  racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: null, personneId: null, organisationId: null, modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
  regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: jourDansLe(60),
  sections: [{ id: 's1', titre: 'Cuisine', lignes: [{ id: 'l1', libelle: 'Carrelage', quantite: 1, unite: 'u', prixAchat: 80, prixVente: 100 }] }],
  totaux: { ht: 100, tva: 20, ttc: 120 }, creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: new Date(), modifieLe: new Date(), ...valeurs,
});
/** Le jeu de 100 € : un signé, un signé archivé, un refusé, un envoyé, un brouillon, un signé de test (exclu). */
async function jeu(base = '') {
  await devis('s1', { numero: 'DEV-2026-11-01-001', statut: 'accepte', finaliseLe: ilYA(5), envoyeLe: ilYA(5), accepteLe: ilYA(2) }, base);
  await devis('s2', { numero: 'DEV-2026-11-01-002', statut: 'accepte', archive: true, finaliseLe: ilYA(4), envoyeLe: ilYA(4), accepteLe: ilYA(1) }, base);
  await devis('r1', { numero: 'DEV-2026-11-01-003', statut: 'refuse', finaliseLe: ilYA(4), envoyeLe: ilYA(4), refuseLe: ilYA(1) }, base);
  await devis('e1', { numero: 'DEV-2026-11-01-004', statut: 'envoye', finaliseLe: ilYA(3), envoyeLe: ilYA(3) }, base);
  await devis('b1', { statut: 'brouillon' }, base);
  await devis('t1', { numero: 'DEV-2026-11-01-006', statut: 'accepte', finaliseLe: ilYA(3), envoyeLe: ilYA(3), accepteLe: ilYA(1), test: true }, base);
}
const ouvrirMenu = async (page) => { if (estTelephone(page) && !(await page.locator('.coquille.menu-ouvert').count())) await page.getByRole('button', { name: 'Ouvrir le menu' }).click(); };
const entreesMenu = (page) => page.locator('.menu .menu-entree').allInnerTexts().then((t) => t.map((x) => x.trim()));
const cliquerMenu = async (page, chemin) => { await ouvrirMenu(page); await page.locator(`.menu .menu-entree[data-chemin="${chemin}"]`).click(); };

test.describe('chez Jérôme', () => {
  test('E1 le menu du portail montre cinq entrées visibles + « Espace complet » ; chacune ouvre son écran DANS le portail', async ({ page }, info) => {
    await connecter(page, JEROME, { route: 'portail-devis' });
    await expect(page.locator('.page-liste-devis')).toBeVisible();
    await attendreCalme(page);
    await ouvrirMenu(page);
    expect(await entreesMenu(page)).toEqual(['Devis', 'Clients', 'Catalogue', 'Relances', 'Statistiques', 'Espace complet']);
    if (!estTelephone(page) && (await page.locator('.coquille[data-menu="replie"]').count())) await page.locator('[data-role="bascule-menu"]').click(); // menu déplié pour que la capture montre les mots
    await expect(page.locator('.menu .menu-entree[data-chemin="devis/statistiques"] .menu-texte')).toBeVisible();
    await capturer(page, info, 'E1-menu-cinq-entrees');
    for (const [chemin, url, visible] of [
      ['crm/personnes', /#\/portail-devis\/crm\/personnes$/, '.page-liste'],
      ['devis/bordereau', /#\/portail-devis\/devis\/bordereau$/, '.page-liste'],
      ['devis/relances', /#\/portail-devis\/devis\/relances$/, '.page-relances'],
      ['devis/statistiques', /#\/portail-devis\/devis\/statistiques$/, '.page-statistiques'],
      ['devis/liste', /#\/portail-devis\/devis\/liste$/, '.page-liste-devis'],
    ]) {
      await cliquerMenu(page, chemin);
      await expect(page).toHaveURL(url);
      await expect(page.locator(visible).first()).toBeVisible();
      await ouvrirMenu(page);
      await expect(page.locator('.menu [aria-current="page"]')).toHaveCount(1);
      await expect(page.locator('.menu [aria-current="page"]')).toHaveAttribute('data-chemin', chemin);
      if (estTelephone(page)) await page.keyboard.press('Escape');
    }
  });

  test('E2 Statistiques avec données : CA signé 200 € HT (archivé compris, test exclu), 2 signés sur 4 envoyés = 50 %, détail par mois', async ({ page }, info) => {
    await jeu();
    await connecter(page, JEROME, { route: 'portail-devis/devis/statistiques' });
    await expect(page.locator('.page-statistiques')).toBeVisible();
    await attendreCalme(page);
    await expect(page.getByRole('heading', { name: 'Statistiques', level: 1 })).toBeVisible();
    await expect(page.locator('[data-chiffre="ca-signe"] .chiffre-valeur')).toContainText('200');
    await expect(page.locator('[data-chiffre="signes"] .chiffre-valeur')).toHaveText('2');
    await expect(page.locator('[data-chiffre="envoyes"] .chiffre-valeur')).toHaveText('4');
    await expect(page.locator('[data-chiffre="taux"] .chiffre-valeur')).toHaveText('50 %');
    await expect(page.locator('[data-statut="accepte"] strong')).toHaveText('2');
    await expect(page.locator('[data-statut="brouillon"] strong')).toHaveText('1');
    await expect(page.locator('.liste-mois-stat li')).toHaveCount(12);
    await capturer(page, info, 'E2-statistiques-donnees');
    await page.locator('[data-champ="periode"]').selectOption('3-mois');
    await expect(page.locator('.liste-mois-stat li')).toHaveCount(3);
    await expect(page.locator('[data-chiffre="ca-signe"] .chiffre-valeur')).toContainText('200');
  });

  test('E3 Statistiques cas vide : « Pas encore de devis sur cette période. »', async ({ page }, info) => {
    await connecter(page, JEROME, { route: 'portail-devis/devis/statistiques' });
    await expect(page.locator('.page-statistiques')).toBeVisible();
    await expect(page.getByText('Pas encore de devis sur cette période.')).toBeVisible();
    await capturer(page, info, 'E3-statistiques-vide');
  });

  test('E4 Statistiques cas d\'erreur : lecture refusée -> « Impossible de lire tes devis pour le moment. Réessaie. »', async ({ page }, info) => {
    await jeu();
    await connecter(page, JEROME, { route: 'portail-devis/devis/statistiques' });
    await expect(page.locator('[data-chiffre="ca-signe"]')).toBeVisible();
    await page.evaluate(async () => { const D = await import('/js/modules/devis/donnees.js'); D.etat.erreurLectureDevis = true; D.etat.devis = [...D.etat.devis]; });
    await page.locator('[data-champ="periode"]').selectOption('6-mois');
    await expect(page.locator('[data-erreur="lecture"]')).toHaveText('Impossible de lire tes devis pour le moment. Réessaie.');
    await capturer(page, info, 'E4-statistiques-erreur');
  });

  test('E5 « Clients » ouvre la liste des personnes dans le portail et une fiche s\'ouvre sous l\'adresse du portail ; une adresse bidon est refusée', async ({ page }, info) => {
    await ecrireDocument('crm_personnes/p1', { nom: 'Marie Durand', prenom: 'Marie', nomFamille: 'Durand', telephones: [], emails: [], emailsNormalises: [], etiquettes: [], archive: false, proprietaire: JEROME, creeLe: new Date(), modifieLe: new Date(), creePar: JEROME, modifiePar: JEROME });
    await connecter(page, JEROME, { route: 'portail-devis/crm/personnes' });
    await expect(page.getByText('Marie Durand')).toBeVisible();
    await capturer(page, info, 'E5-clients');
    await page.getByText('Marie Durand').first().click();
    await expect(page).toHaveURL(/#\/portail-devis\/crm\/personnes\/p1$/);
    await expect(page.getByRole('textbox', { name: 'Nom' })).toHaveValue('Marie Durand');
    await page.evaluate(() => { location.hash = '#/portail-devis/crm/personnes/a%20b%3Cx%3E'; });
    await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
  });
});

test.describe('chez un client Devis seul (sans Affaires)', () => {
  test.beforeAll(() => chargerRegles('firestore.plateforme.rules'));
  test.afterAll(() => chargerRegles('firestore.rules'));
  test.beforeEach(async () => {
    await ecrireDocument('marques/devisseul', { actif: true, nom: 'Devis Seul', couleur: '#336699', accueil: 'Bienvenue.' });
    await ecrireDocument('clients/devisseul', { modules: { devis: true } });
    await ecrireDocument(`clients/devisseul/membres/${ALICE}`, { role: 'editeur' });
    await ecrireDocument('clients/devisseul/devis_parametres/reglages', { regimeTva: 'assujetti', entreprise: { nom: 'Atelier Exemple', siret: '123 456 789 00012', adresse: { ligne1: '3 rue de l’Atelier', codePostal: '75001', ville: 'Paris' } } });
  });
  async function ouvrir(page, reste) {
    await page.goto('about:blank');
    await page.goto(`${URL_APP}#/espace/devisseul/${reste}`);
    await page.waitForFunction(() => !!window.__chevalierTest);
    await page.evaluate((e) => window.__chevalierTest.connecter(e, true), ALICE);
    await expect(page.locator('.coquille')).toBeVisible();
  }

  test('E6 le client Devis seul a les cinq entrées ; Clients et Statistiques s\'ouvrent sous son adresse, sans le module Affaires', async ({ page }, info) => {
    await jeu('clients/devisseul/');
    await ecrireDocument('clients/devisseul/crm_personnes/pc', { nom: 'Camille Martin', prenom: 'Camille', nomFamille: 'Martin', telephones: [], emails: [], emailsNormalises: [], etiquettes: [], archive: false, proprietaire: ALICE, creeLe: new Date(), modifieLe: new Date(), creePar: ALICE, modifiePar: ALICE });
    await ouvrir(page, 'portail-devis');
    await expect(page.locator('.page-liste-devis')).toBeVisible();
    await ouvrirMenu(page);
    expect(await entreesMenu(page)).toEqual(['Devis', 'Clients', 'Catalogue', 'Relances', 'Statistiques', 'Espace complet']);
    await cliquerMenu(page, 'crm/personnes');
    await expect(page).toHaveURL(/#\/espace\/devisseul\/portail-devis\/crm\/personnes$/);
    await expect(page.getByText('Camille Martin')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Page introuvable' })).toHaveCount(0);
    await capturer(page, info, 'E6-client-clients');
    await page.getByText('Camille Martin').first().click();
    await expect(page).toHaveURL(/#\/espace\/devisseul\/portail-devis\/crm\/personnes\/pc$/);
    await expect(page.getByRole('textbox', { name: 'Nom' })).toHaveValue('Camille Martin');
    await expect(page.locator('[data-action="nouvelle-affaire"]')).toHaveCount(0); // Devis seul : ni « + Affaire », ni section Affaires, ni activités
    await expect(page.getByText('Affaires en cours')).toHaveCount(0);
    await expect(page.locator('.fiche-droite')).toHaveCount(0);
    await capturer(page, info, 'E6b-client-fiche');
    await cliquerMenu(page, 'devis/statistiques');
    await expect(page).toHaveURL(/#\/espace\/devisseul\/portail-devis\/devis\/statistiques$/);
    await expect(page.locator('[data-chiffre="ca-signe"] .chiffre-valeur')).toContainText('200');
    await page.evaluate(() => { location.hash = '#/espace/devisseul/portail-devis/crm/affaires'; });
    await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible(); // Affaires n'existe toujours pas dans ce portail
  });
});
