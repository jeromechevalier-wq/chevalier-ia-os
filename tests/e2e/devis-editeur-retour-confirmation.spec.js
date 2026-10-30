// Éditeur du devis, deux points (nuit du 27/10/2026). Un test par point (le nom commence par son numéro) et une capture par point dans tests/e2e/captures/devis-editeur-retour-confirmation/ (ordinateur ET téléphone).
//   5 : « Devis signé » et « Devis refusé » demandent une confirmation (Annuler ne change rien).
//   4 : la flèche en haut à gauche s'appelle « Retour » et ramène à la page d'où l'on vient (fiche d'une affaire, même onglet), sinon à la liste des devis.
// La fonction du serveur devisChangerStatut n'existe pas dans l'émulateur du navigateur : elle est SIMULÉE par page.route.
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, creerOrganisation, creerAffaire, FIRESTORE, PROJET, URL_APP, JEROME } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-editeur-retour-confirmation/', import.meta.url));
async function capturer(page, info, nom) {
  await mkdir(DOSSIER, { recursive: true });
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
}
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const LIGNES = [{ id: 'l1', libelle: 'Carrelage', familleId: 'famille-1', type: 'fourniture', quantite: 10, unite: 'm²', prixAchat: 40, prixVente: 60, tauxTva: 20 }];
const FINALISE = { numero: 'DEV-2026-10-02-001', statut: 'en_attente_envoi', finaliseLe: new Date(Date.now() - 86400000), dateEmission: '2026-10-02', totaux: { ht: 600, ttc: 720 } };

function corpsDevis(valeurs = {}) {
  const maintenant = new Date();
  return {
    racineId: 'x', version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', personneId: null, organisationId: 'o1', modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: '2099-12-31', objet: 'Rénovation restaurant', destinataires: ['contact@exemple.fr'],
    sections: [{ id: 's1', titre: 'Cuisine', lignes: LIGNES }],
    creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, ...valeurs,
  };
}
async function donnees(prefixe = '') {
  await ecrireDocument(`${prefixe}crm_organisations/o1`, { nom: 'M. Paul Exemple', archive: false });
  await ecrireDocument(`${prefixe}crm_affaires/a1`, { titre: 'Rénovation cuisine', organisationId: 'o1', archive: false, ...(prefixe ? { etape: 'etape_3', statut: 'ouverte', proprietaire: 'alice@exemple.test' } : {}) });
  await ecrireDocument(`${prefixe}devis_devis/dEnvoye`, corpsDevis({ ...FINALISE, racineId: 'dEnvoye', numero: 'DEV-2026-10-02-002', statut: 'envoye', envoyeLe: new Date() }));
  await ecrireDocument(`${prefixe}devis_devis/dBrouillon`, corpsDevis({ racineId: 'dBrouillon', objet: 'Cuisine, variante basse' }));
}
async function donneesJerome() {
  await creerOrganisation('o1', { nom: 'M. Paul Exemple' });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', organisationId: 'o1' });
  await ecrireDocument('devis_devis/dEnvoye', corpsDevis({ ...FINALISE, racineId: 'dEnvoye', numero: 'DEV-2026-10-02-002', statut: 'envoye', envoyeLe: new Date() }));
  await ecrireDocument('devis_devis/dBrouillon', corpsDevis({ racineId: 'dBrouillon', objet: 'Cuisine, variante basse' }));
}
async function simulerStatut(page, appels) {
  await page.route('**/devisChangerStatut', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    appels.push(JSON.parse(route.request().postData()).data);
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ok: true } }) });
  });
}
async function ouvrir(page, route) {
  await connecter(page, undefined, { route });
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
}
const racine = (page) => page.locator('.page-editeur-devis');
const retour = (page) => page.locator('.entete-devis [data-action="fermer"]');
const fenetre = (page) => page.getByRole('dialog');
const hash = (page) => page.evaluate(() => location.hash);

async function ouvrirAffaire(page, id = 'a1') {
  await connecter(page, undefined, { route: `crm/affaires/${id}` });
  await expect(page.locator('.compositeur')).toBeVisible();
  await attendreCalme(page);
}
async function ouvrirOngletDevis(page) {
  const onglet = page.locator('.compositeur [data-onglet="devis"]');
  await expect(onglet).toBeVisible();
  if ((await onglet.getAttribute('aria-selected')) !== 'true') await onglet.click();
  await expect(page.locator('.compositeur [role="tabpanel"][aria-label="Devis"]')).toBeVisible();
}
async function ongletDevisActif(page) {
  await expect(page.locator('.compositeur')).toBeVisible();
  await attendreCalme(page);
  await expect(page.locator('.compositeur [data-onglet="devis"]')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.compositeur [role="tabpanel"][aria-label="Devis"]')).toBeVisible();
}

// ------------------------------------------------------------------ point 5 : confirmation

test('5a « Devis signé » demande une confirmation : Annuler ne change rien, « Marquer signé » passe le devis à Signé', async ({ page }, info) => {
  await donneesJerome();
  const appels = [];
  await simulerStatut(page, appels);
  await ouvrir(page, 'devis/voir/dEnvoye');
  await racine(page).locator('[data-action="marquer-signe"]').click();
  await expect(fenetre(page)).toBeVisible();
  await expect(fenetre(page)).toContainText('Marquer ce devis signé ?');
  await expect(fenetre(page)).toContainText('Le devis passe à « Devis signé ». Il ne pourra plus être modifié ni versionné ; les autres versions du même numéro encore en attente ou envoyées passent à Remplacé.');
  await capturer(page, info, '5a-confirmation-signe');
  await fenetre(page).getByRole('button', { name: 'Annuler' }).click();
  await expect(fenetre(page)).toHaveCount(0);
  expect(appels).toEqual([]);
  await racine(page).locator('[data-action="marquer-signe"]').click();
  await fenetre(page).getByRole('button', { name: 'Marquer signé' }).click();
  await expect(page.locator('.toast').filter({ hasText: 'Devis passé à « Devis signé »' })).toBeVisible();
  expect(appels).toEqual([{ devisId: 'dEnvoye', action: 'accepter' }]);
});

test('5b « Devis refusé » demande une confirmation : Annuler ne change rien, « Marquer refusé » (bouton rouge) passe le devis à Refusé', async ({ page }, info) => {
  await donneesJerome();
  const appels = [];
  await simulerStatut(page, appels);
  await ouvrir(page, 'devis/voir/dEnvoye');
  await racine(page).locator('[data-action="marquer-refuse"]').click();
  await expect(fenetre(page)).toContainText('Marquer ce devis refusé ?');
  await expect(fenetre(page)).toContainText('Le devis passe à « Devis refusé ». Tu pourras encore créer une nouvelle version.');
  await expect(fenetre(page).getByRole('button', { name: 'Marquer refusé' })).toHaveClass(/danger/);
  await capturer(page, info, '5b-confirmation-refuse');
  await fenetre(page).getByRole('button', { name: 'Annuler' }).click();
  expect(appels).toEqual([]);
  await racine(page).locator('[data-action="marquer-refuse"]').click();
  await fenetre(page).getByRole('button', { name: 'Marquer refusé' }).click();
  await expect(page.locator('.toast').filter({ hasText: 'Devis passé à « Devis refusé »' })).toBeVisible();
  expect(appels).toEqual([{ devisId: 'dEnvoye', action: 'refuser' }]);
});

test('5c le menu « … » de la liste demande la même confirmation (Passer à Signé)', async ({ page }) => {
  await donneesJerome();
  const appels = [];
  await simulerStatut(page, appels);
  await connecter(page, undefined, { route: 'devis/liste' });
  await attendreCalme(page);
  await page.locator('.ligne-devis[data-id="dEnvoye"] [aria-haspopup="menu"], .ligne-devis[data-id="dEnvoye"] [data-action="menu-devis"]').first().click();
  await page.getByRole('menuitem', { name: /Devis signé/ }).click();
  await expect(fenetre(page)).toContainText('Marquer ce devis signé ?');
  await fenetre(page).getByRole('button', { name: 'Annuler' }).click();
  expect(appels).toEqual([]);
});

// ------------------------------------------------------------------ point 4 : « Retour »

test('4a depuis l’onglet Devis d’une affaire, la flèche dit « Retour » et ramène à la fiche de l’affaire, sur l’onglet Devis, même après être passé de l’éditeur à la visualisation', async ({ page }, info) => {
  await donneesJerome();
  await ouvrirAffaire(page);
  await ouvrirOngletDevis(page);
  await page.locator('[data-devis="dEnvoye"] [data-action="voir-devis"]').click();
  await expect(racine(page)).toBeVisible();
  await attendreCalme(page);
  await expect(retour(page)).toHaveText('Retour');
  await capturer(page, info, '4a-retour-depuis-affaire');
  // Éditeur <-> visualisation (et ajout d'ouvrages) restent dans le module : l'origine ne bouge pas.
  await page.evaluate(() => { location.hash = '#/devis/editeur/dEnvoye'; });
  await expect(racine(page)).toBeVisible();
  await attendreCalme(page);
  await retour(page).click();
  await expect.poll(() => hash(page)).toBe('#/crm/affaires/a1');
  await ongletDevisActif(page);
});

test('4b depuis la liste des devis, la flèche revient à la liste des devis', async ({ page }) => {
  await donneesJerome();
  await connecter(page, undefined, { route: 'devis/liste' });
  await attendreCalme(page);
  await page.locator('.ligne-devis[data-id="dEnvoye"]').first().click();
  await expect(racine(page)).toBeVisible();
  await attendreCalme(page);
  await expect(retour(page)).toHaveText('Retour');
  await retour(page).click();
  await expect.poll(() => hash(page)).toBe('#/devis/liste');
});

test('4c depuis la pastille « Devis : … » de la fiche d’une affaire (onglet Activité), « Retour » revient à la fiche, sur l’onglet où l’on était', async ({ page }) => {
  await donneesJerome();
  await ouvrirAffaire(page);
  await page.locator('a.pastille-externe').first().click();
  await expect(racine(page)).toBeVisible();
  await attendreCalme(page);
  await retour(page).click();
  await expect.poll(() => hash(page)).toBe('#/crm/affaires/a1');
  await expect(page.locator('.compositeur')).toBeVisible();
  await attendreCalme(page);
  await expect(page.locator('.compositeur [role="tab"][aria-selected="true"]')).toHaveText(/Activité/);
});

test('4d ouverture directe par adresse (aucune origine) : « Retour » mène à la liste des devis', async ({ page }) => {
  await donneesJerome();
  await ouvrir(page, 'devis/editeur/dBrouillon');
  await expect(retour(page)).toHaveText('Retour');
  await retour(page).click();
  await expect.poll(() => hash(page)).toBe('#/devis/liste');
});

test.describe('4e chez un client', () => {
  const ALICE = 'alice@exemple.test';
  const chargerRegles = async (fichier) => {
    const contenu = await readFile(fileURLToPath(new URL(`../../${fichier}`, import.meta.url)), 'utf8');
    const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: fichier, content: contenu }] } }) });
    if (!r.ok) throw new Error(`Règles non chargées (${fichier}) : ${await r.text()}`);
  };
  test.beforeAll(() => chargerRegles('firestore.plateforme.rules'));
  test.afterAll(() => chargerRegles('firestore.rules'));

  test('4e sous #/espace/<client>, la flèche « Retour » garde le préfixe du client et rouvre l’onglet Devis', async ({ page }, info) => {
    await ecrireDocument('marques/studio', { actif: true, nom: 'Cabinet Studio', couleur: '#336699', accueil: 'Bienvenue.' });
    await ecrireDocument('clients/studio', { modules: { affaires: true, devis: true }, equipe: [{ email: ALICE, role: 'editeur' }] });
    await ecrireDocument(`clients/studio/membres/${ALICE}`, { role: 'editeur' });
    await donnees('clients/studio/');
    await page.goto('about:blank');
    await page.goto(`${URL_APP}#/espace/studio/crm/affaires/a1`);
    await page.waitForFunction(() => !!window.__chevalierTest);
    await page.evaluate((e) => window.__chevalierTest.connecter(e, true), ALICE);
    await expect(page.locator('.compositeur')).toBeVisible();
    await attendreCalme(page);
    await ouvrirOngletDevis(page);
    await page.locator('[data-devis="dEnvoye"] [data-action="voir-devis"]').click();
    await expect(racine(page)).toBeVisible();
    await attendreCalme(page);
    await expect(retour(page)).toHaveText('Retour');
    await expect(retour(page)).toHaveAttribute('href', '#/espace/studio/crm/affaires/a1');
    await capturer(page, info, '4e-retour-client');
    await retour(page).click();
    await expect.poll(() => hash(page)).toBe('#/espace/studio/crm/affaires/a1');
    await ongletDevisActif(page);
  });
});

test('4f « Retour » arrêté par « Quitter sans enregistrer ? » (Rester) ne garde aucun onglet en attente : la fiche ouverte plus tard par son adresse s’ouvre sur Activité', async ({ page }) => {
  await donneesJerome();
  await ouvrirAffaire(page);
  await ouvrirOngletDevis(page);
  await page.locator('[data-devis="dEnvoye"] [data-action="voir-devis"]').click();
  await expect(racine(page)).toBeVisible();
  await attendreCalme(page);
  await page.evaluate(async () => { const r = await import(new URL('js/os/router.js', location.href).href); window.__retirerGarde = r.ajouterGardeSortie(() => true, { message: 'Test.' }); });
  await retour(page).click();
  await expect(fenetre(page)).toContainText('Quitter sans enregistrer ?');
  await fenetre(page).getByRole('button', { name: 'Annuler' }).click();
  await page.evaluate(() => { window.__retirerGarde(); location.hash = '#/crm/affaires/a1'; });
  await expect(page.locator('.compositeur')).toBeVisible();
  await attendreCalme(page);
  await expect(page.locator('.compositeur [role="tab"][aria-selected="true"]')).toHaveText(/Activité/);
});
