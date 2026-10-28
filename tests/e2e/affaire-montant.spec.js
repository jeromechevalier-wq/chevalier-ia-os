// Montant de l'en-tête de la fiche d'une affaire (nuit du 28/10/2026) : des libellés honnêtes. Un test par cas (le nom commence par le numéro du cas).
// Sans devis : « Montant estimé » + la valeur saisie, sinon un tiret. Avec des devis : « Montant du devis » (TTC) ou « Total des devis (n) ». Captures dans tests/e2e/captures/affaire-montant/.
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, lireDocument, creerAffaire, PROJET, FIRESTORE, URL_APP, JEROME } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/affaire-montant/', import.meta.url));
async function capturer(page, info, nom) {
  await mkdir(DOSSIER, { recursive: true });
  await page.locator('.fiche-tete').screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
}
const IL_Y_A = (jours) => new Date(Date.now() - jours * 86400000);
const LIGNES = [{ id: 'l1', libelle: 'Carrelage', familleId: 'famille-1', type: 'fourniture', quantite: 10, unite: 'm²', prixAchat: 40, prixVente: 60, tauxTva: 20 }];

async function devis(id, valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument(`devis_devis/${id}`, {
    racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', personneId: null, organisationId: null, modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: '2099-12-31', objet: 'Rénovation restaurant',
    destinataires: ['contact@exemple.fr'], sections: [{ id: 's1', titre: 'Cuisine', lignes: LIGNES }],
    creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, ...valeurs,
  });
}
const FINALISE = (ttc, plus = {}) => ({ numero: `DEV-${ttc}`, statut: 'envoye', finaliseLe: IL_Y_A(5), dateEmission: '2026-10-02', totaux: { ht: ttc / 1.2, ttc }, ...plus });

async function ouvrirAffaire(page, id = 'a1') {
  await connecter(page, undefined, { route: `crm/affaires/${id}` });
  await expect(page.locator('.fiche-tete')).toBeVisible();
  await attendreCalme(page);
}
const montant = (page) => page.locator('.fiche-tete .fiche-montant');
const libelle = (page) => page.locator('.fiche-tete [data-role="libelle-montant"]');

// Dans ce bac à sable, le script de Google est inaccessible : on le remplace par un fichier vide.
test.beforeEach(async ({ page }) => {
  await page.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
});

test('1 sans devis et sans montant saisi : « Montant estimé » et un tiret, jamais un chiffre inventé ni rien d’enregistré', async ({ page }, info) => {
  await creerAffaire('a1', { titre: 'Rénovation cuisine' });
  await ouvrirAffaire(page);
  await expect(libelle(page)).toHaveText('Montant estimé');
  await expect(montant(page).locator('.prop-fantome')).toHaveText('—');
  await expect(montant(page)).not.toContainText('999');
  expect((await lireDocument('crm_affaires/a1')).montant ?? null).toBeNull();
  await capturer(page, info, '1-sans-devis-tiret');
});

test('2 sans devis avec un montant saisi : « Montant estimé » et la valeur, modifiable', async ({ page }, info) => {
  await creerAffaire('a1', { titre: 'Rénovation cuisine', montant: 1500 });
  await ouvrirAffaire(page);
  await expect(libelle(page)).toHaveText('Montant estimé');
  await expect(montant(page)).toContainText(/1\s?500\s€/);
  await capturer(page, info, '2-sans-devis-valeur');
  await montant(page).locator('.prop-modifier').click();
  await page.getByLabel('Montant estimé', { exact: true }).fill('1800');
  await page.getByLabel('Montant estimé', { exact: true }).press('Enter');
  await expect.poll(async () => (await lireDocument('crm_affaires/a1')).montant).toBe(1800);
});

test('3 un seul devis, même brouillon : « Montant du devis » = son total TTC, le montant estimé reste en base', async ({ page }, info) => {
  await creerAffaire('a1', { titre: 'Rénovation cuisine', montant: 1500 });
  await devis('d1', {}); // brouillon calculé (10 x 60 €, TVA lue comme dans l'onglet Devis) : même total que l'onglet
  await ouvrirAffaire(page);
  await expect(libelle(page)).toHaveText('Montant du devis');
  await expect(montant(page)).toContainText(/600\s€/);
  await expect(montant(page)).toContainText('TTC');
  await expect(montant(page)).not.toContainText(/1\s?500/);
  expect((await lireDocument('crm_affaires/a1')).montant).toBe(1500); // remplacé à l'affichage seulement
  await capturer(page, info, '3-un-brouillon');
});

test('4 deux devis : « Total des devis (2) » = la somme, le détail dans l’infobulle', async ({ page }, info) => {
  await creerAffaire('a1', { titre: 'Rénovation cuisine' });
  await devis('d1', FINALISE(720, { creeLe: IL_Y_A(3) }));
  await devis('d2', FINALISE(1200, { creeLe: IL_Y_A(2) }));
  await ouvrirAffaire(page);
  await expect(libelle(page)).toHaveText('Total des devis (2)');
  await expect(montant(page)).toContainText(/1\s?920\s€/);
  const bulle = montant(page).locator('[data-role="bulle-info"]');
  await expect(bulle).toContainText(/DEV-720[^;]*720\s€/);
  await expect(bulle).toContainText(/DEV-1200[^;]*1\s?200\s€/);
  await montant(page).locator('[data-role="info"]').hover();
  await capturer(page, info, '4-deux-devis');
});

test('5 ne comptent pas : devis archivé, refusé ou ancienne version ; si plus aucun ne compte, on revient au montant estimé', async ({ page }, info) => {
  await creerAffaire('a1', { titre: 'Rénovation cuisine', montant: 900 });
  await devis('d1', FINALISE(720));
  await devis('dArchive', FINALISE(5000, { archive: true }));
  await devis('dRefuse', FINALISE(7000, { statut: 'refuse' }));
  await devis('dVieux', FINALISE(9000, { statut: 'remplace' }));
  await ouvrirAffaire(page);
  await expect(libelle(page)).toHaveText('Montant du devis');
  await expect(montant(page)).toContainText(/720\s€/);
  await capturer(page, info, '5-devis-ecartes');
  // Le seul devis vivant est refusé : le montant estimé revient, sans recharger la page.
  await ecrireDocument('devis_devis/d1', { ...(await lireDocument('devis_devis/d1')), statut: 'refuse' });
  await expect(libelle(page)).toHaveText('Montant estimé');
  await expect(montant(page)).toContainText(/900\s€/);
});

test('6 le montant suit le devis en direct (un devis ajouté change le libellé et le total)', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Rénovation cuisine' });
  await devis('d1', FINALISE(720));
  await ouvrirAffaire(page);
  await expect(libelle(page)).toHaveText('Montant du devis');
  await devis('d2', FINALISE(80));
  await expect(libelle(page)).toHaveText('Total des devis (2)');
  await expect(montant(page)).toContainText(/800\s€/);
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
    await expect(page.locator('[data-onglet="devis"]')).toHaveCount(0);
    await expect(libelle(page)).toHaveText('Montant estimé');
    await expect(montant(page)).toContainText(/1\s?200\s€/);
    await capturer(page, info, '7-module-eteint');
  });
});
