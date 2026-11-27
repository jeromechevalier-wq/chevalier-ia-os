// Fiche Organisation, section Détails : cases « SIRET » et « N° de TVA », ligne « SIREN » calculée en lecture seule (décision de Jérôme du 26/11/2026).
// Le nom de chaque test commence par le numéro du critère. Captures (ordinateur et téléphone) dans tests/e2e/captures/organisation-siret/.
// Valeurs inventées : SIRET 123 456 789 00012, TVA FR12123456789.
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import {
  test, expect, attendreCalme, connecter, allerA, ouvrirSectionReglages, creerOrganisation, creerAffaire, ecrireDocument, lireDocument, JEROME, PROJET, FIRESTORE, URL_APP, connecterDansEspace
} from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/organisation-siret/', import.meta.url));
async function capturer(page, info, nom, { pleine = true } = {}) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: pleine, animations: 'disabled' });
}
async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }
const details = (page) => page.locator('[data-section="organisation-details"]');
const prop = (page, libelle) => details(page).locator(`.prop:has(.prop-libelle:text-is("${libelle}"))`);
const siren = (page) => details(page).locator('[data-prop="siren"] [data-valeur="siren"]');

/** Saisit `valeur` dans la case `libelle` (bouton « Ajouter » si elle est vide, sinon le crayon), puis Entrée. */
async function saisir(page, libelle, valeur) {
  const ligne = prop(page, libelle);
  const ajouter = ligne.getByRole('button', { name: `Ajouter : ${libelle}` });
  if (await ajouter.count()) await ajouter.click(); else await ligne.getByRole('button', { name: `Modifier : ${libelle}` }).click();
  const champ = ligne.getByRole('textbox', { name: libelle });
  await champ.fill(valeur);
  await champ.press('Enter');
}
async function ouvrirFiche(page) {
  await connecter(page);
  await aller(page, '#/crm/organisations/o1');
  await expect(details(page)).toBeVisible();
}

test('1 et 5 Détails : cases SIRET et N° de TVA, ligne SIREN en lecture seule ; une fiche existante sans ces champs s’affiche comme avant (cases vides)', async ({ page }, info) => {
  await creerOrganisation('o1', { nom: 'Atelier Exemple', ville: 'Manosque' }); // fiche d'avant : ni siret, ni siren, ni numeroTva
  await ouvrirFiche(page);
  await expect(prop(page, 'SIRET').getByRole('button', { name: 'Ajouter : SIRET' })).toBeVisible();
  await expect(prop(page, 'N° de TVA').getByRole('button', { name: 'Ajouter : N° de TVA' })).toBeVisible();
  await expect(siren(page)).toHaveText('—');
  await expect(details(page).locator('[data-prop="siren"] input, [data-prop="siren"] button')).toHaveCount(0); // SIREN : rien à saisir
  // Ordre : après « Ville ».
  await expect(details(page).locator('.prop-libelle')).toHaveText(['Secteur', 'Taille', 'Ville', 'SIRET', 'SIREN', 'N° de TVA']);
  await capturer(page, info, '1-cas-vide');
  const doc = await lireDocument('crm_organisations/o1');
  expect([doc.siret, doc.siren, doc.numeroTva]).toEqual([undefined, undefined, undefined]); // aucune migration
});

test('2 « 123 456 789 00012 » est enregistré sans espaces, SIREN calculé ; affichage avec espaces ; SIRET vidé efface aussi le SIREN', async ({ page }, info) => {
  await creerOrganisation('o1', { nom: 'Atelier Exemple' });
  await ouvrirFiche(page);
  await saisir(page, 'SIRET', '123 456 789 00012');
  await expect.poll(async () => { const d = await lireDocument('crm_organisations/o1'); return [d.siret, d.siren]; }).toEqual(['12345678900012', '123456789']);
  await expect(prop(page, 'SIRET').locator('.prop-valeur span').first()).toHaveText('123 456 789 00012');
  await expect(siren(page)).toHaveText('123 456 789');
  await saisir(page, 'N° de TVA', 'fr 12 123456789');
  await expect.poll(async () => (await lireDocument('crm_organisations/o1')).numeroTva).toBe('FR12123456789');
  await expect(prop(page, 'N° de TVA').locator('.prop-valeur span').first()).toHaveText('FR12123456789');
  await capturer(page, info, '2-siret-siren-tva');
  await saisir(page, 'SIRET', '');
  await expect.poll(async () => { const d = await lireDocument('crm_organisations/o1'); return [d.siret, d.siren, d.numeroTva]; }).toEqual(['', '', 'FR12123456789']);
  await expect(siren(page)).toHaveText('—');
});

test('3 SIRET de 13 chiffres, SIRET avec lettres, TVA « 12345 » ou « FR123 » : message, rien d’enregistré', async ({ page }, info) => {
  await creerOrganisation('o1', { nom: 'Atelier Exemple', siret: '12345678900012', siren: '123456789', numeroTva: 'FR12123456789' });
  await ouvrirFiche(page);
  const avant = await lireDocument('crm_organisations/o1');
  await saisir(page, 'SIRET', '123 456 789 0001');
  await expect(page.locator('.toast').filter({ hasText: 'Le SIRET doit faire 14 chiffres.' })).toBeVisible();
  await expect(prop(page, 'SIRET').locator('.prop-valeur span').first()).toHaveText('123 456 789 00012'); // valeur inchangée
  await capturer(page, info, '3-siret-refuse', { pleine: false });
  // Le message identique remplacerait le premier : on attend qu'il parte pour prouver le 2e refus.
  await expect(page.locator('.toast').filter({ hasText: 'Le SIRET doit faire 14 chiffres.' })).toHaveCount(0, { timeout: 10000 });
  await saisir(page, 'SIRET', '1234567890001A');
  await expect(page.locator('.toast').filter({ hasText: 'Le SIRET doit faire 14 chiffres.' })).toBeVisible();
  await saisir(page, 'N° de TVA', '12345');
  await expect(page.locator('.toast').filter({ hasText: 'Le numéro de TVA commence par 2 lettres (le pays)' })).toBeVisible();
  await saisir(page, 'N° de TVA', 'FR123');
  await expect(page.locator('.toast').filter({ hasText: /numéro de TVA français fait 13 caractères/ })).toBeVisible();
  await expect(prop(page, 'N° de TVA').locator('.prop-valeur span').first()).toHaveText('FR12123456789');
  const apres = await lireDocument('crm_organisations/o1');
  expect([apres.siret, apres.siren, apres.numeroTva]).toEqual([avant.siret, avant.siren, avant.numeroTva]);
  expect(apres.modifieLe).toEqual(avant.modifieLe); // aucune écriture
});

test('6 l’export du module Devis sort siret, siren et numeroTva des organisations (aucun code d’export changé)', async ({ page }) => {
  await creerOrganisation('o1', { nom: 'Atelier Exemple', siret: '12345678900012', siren: '123456789', numeroTva: 'FR12123456789' });
  await connecter(page);
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Devis');
  await expect(page.locator('#reglages-devis')).toBeVisible();
  await attendreCalme(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), page.locator('#reglages-export-devis [data-action="exporter-devis"]').click()]);
  const json = JSON.parse(await readFile(await dl.path(), 'utf8'));
  const o = json.collections.crm_organisations.find((x) => x.id === 'o1');
  expect([o.siret, o.siren, o.numeroTva]).toEqual(['12345678900012', '123456789', 'FR12123456789']);
});

test('7 devis avec « Afficher le SIREN » et « Afficher le numéro de TVA » : l’aperçu imprime le SIREN et le n° de TVA saisis sur la fiche', async ({ page }, info) => {
  await creerOrganisation('o1', {
    nom: 'Société Exemple', adresses: [{ id: 'p1', libelle: 'Principale', adresse: '12 rue des Lilas\n75000 Paris', parDefaut: true }], emails: [{ valeur: 'contact@exemple.fr', type: 'travail' }],
    siret: '12345678900012', siren: '123456789', numeroTva: 'FR12123456789',
  });
  await creerAffaire('a1', { titre: 'Rénovation restaurant', organisationId: 'o1' });
  const maintenant = new Date();
  await ecrireDocument('devis_devis/d1', {
    racineId: 'd1', version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', organisationId: 'o1', personneId: null, modeMarge: 'majoration', marge: 0, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, expireLe: '2026-12-23', destinataires: ['contact@exemple.fr'], objet: 'Rénovation restaurant',
    sections: [{ id: 's1', titre: 'Cuisine', lignes: [{ id: 'l1', libelle: 'Carrelage', quantite: 1, unite: 'u', prixAchat: 100, marge: 0 }] }],
    affichage: { afficherSiren: true, afficherNumeroTva: true },
    adresses: { commanditaire: { texte: '12 rue des Lilas\n75000 Paris' }, facturation: { texte: '12 rue des Lilas\n75000 Paris' }, chantier: { texte: '12 rue des Lilas\n75000 Paris' } },
    creePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant,
  });
  await connecter(page, undefined, { route: 'devis/editeur/d1' });
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
  await page.locator('[data-onglet="apercu"]').click();
  const apercu = page.locator('iframe[data-zone="apercu"]').contentFrame().locator('body');
  await expect(apercu).toContainText('SIREN 123456789');
  await expect(apercu).toContainText('TVA FR12123456789');
  await capturer(page, info, '7-devis-siren-tva');
});

async function chargerRegles(fichier) {
  const contenu = await readFile(fileURLToPath(new URL(`../../${fichier}`, import.meta.url)), 'utf8');
  const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: fichier, content: contenu }] } }) });
  if (!r.ok) throw new Error(`Règles non chargées (${fichier}) : ${await r.text()}`);
}

test.describe('8 chez un client Devis seul', () => {
  const ALICE = 'alice@exemple.test';
  test.beforeAll(() => chargerRegles('firestore.plateforme.rules'));
  test.afterAll(() => chargerRegles('firestore.rules'));
  test.beforeEach(async ({ page }) => {
    await page.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
    await ecrireDocument('marques/devisseul', { actif: true, nom: 'Devis Seul', couleur: '#336699', accueil: 'Bienvenue.' });
    await ecrireDocument('clients/devisseul', { modules: { devis: true } });
    await ecrireDocument(`clients/devisseul/membres/${ALICE}`, { role: 'editeur' });
  });

  test('8 Devis seul : la fiche Organisation a les mêmes cases SIRET, SIREN et N° de TVA, qui s’enregistrent', async ({ page }, info) => {
    await ecrireDocument('clients/devisseul/crm_organisations/o1', { nom: 'Atelier Martin', telephones: [], emails: [], emailsNormalises: [], etiquettes: [], archive: false, proprietaire: ALICE, creeLe: new Date(), modifieLe: new Date(), creePar: ALICE, modifiePar: ALICE });
    await page.goto('about:blank');
    await page.goto(`${URL_APP}#/espace/devisseul/portail-devis/crm/organisations/o1`);
    await connecterDansEspace(page, ALICE);
    await expect(page.locator('.coquille')).toBeVisible();
    await expect(page.getByRole('textbox', { name: 'Nom' })).toHaveValue('Atelier Martin');
    await attendreCalme(page);
    await saisir(page, 'SIRET', '123 456 789 00012');
    await expect.poll(async () => { const d = await lireDocument('clients/devisseul/crm_organisations/o1'); return [d?.siret, d?.siren]; }).toEqual(['12345678900012', '123456789']);
    await saisir(page, 'N° de TVA', 'FR12123456789');
    await expect.poll(async () => (await lireDocument('clients/devisseul/crm_organisations/o1'))?.numeroTva).toBe('FR12123456789');
    await expect(siren(page)).toHaveText('123 456 789');
    await capturer(page, info, '8-devis-seul');
  });
});
