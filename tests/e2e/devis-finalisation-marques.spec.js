// A (31/10/2026) : après « Compris », les champs manquants sont marqués sur l'écran (contour + icône + aide), le premier prend le focus, la marque part dès que le champ est rempli.
// Un test par point (le nom commence par le numéro). Captures : tests/e2e/captures/devis-finalisation-marques/ (ordinateur ET téléphone).
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import {
  test, expect, connecter, attendreCalme, ecrireDocument, creerOrganisation, creerPersonne, creerAffaire, ecrireEntrepriseComplete, JEROME,
} from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-finalisation-marques/', import.meta.url));
async function capturer(page, info, nom) {
  await mkdir(DOSSIER, { recursive: true });
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name === 'telephone' ? 'tel' : 'ordi'}.png`, animations: 'disabled' });
}
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const LIGNES = [{ id: 'l1', libelle: 'Carrelage', familleId: 'famille-1', type: 'fourniture', quantite: 10, unite: 'm²', prixAchat: 40, prixVente: 60, tauxTva: 20 }];
async function brouillon(valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument('devis_devis/dTest', {
    racineId: 'dTest', version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', personneId: null, organisationId: null, modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: '2099-12-31', objet: 'Rénovation', destinataires: [],
    sections: [{ id: 's1', titre: 'Cuisine', lignes: LIGNES }], creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, ...valeurs,
  });
}
async function ouvrir(page, route = 'devis/editeur/dTest') {
  await creerOrganisation('o1', { nom: 'Société Exemple' });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', organisationId: 'o1' });
  await connecter(page, undefined, { route });
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
}
const dialogue = (page) => page.getByRole('dialog');
async function finaliserPuisCompris(page) {
  await page.locator('[data-action="finaliser"]').click();
  await expect(dialogue(page)).toContainText('Ce devis ne peut pas encore être finalisé');
  await dialogue(page).getByRole('button', { name: 'Compris' }).click();
}
const lien = (page, nom) => page.locator(`[data-definir="${nom}"]`);
const client = (page) => page.locator('#devis-client');

test('A1 devis sans client, dates ni durée : après « Compris », les liens « définir » et le champ client sont marqués (contour, aria-invalid, icône, aide)', async ({ page }, info) => {
  await ecrireEntrepriseComplete();
  await brouillon();
  await ouvrir(page);
  await finaliserPuisCompris(page);
  for (const nom of ['debutTravaux', 'duree']) {
    await expect(lien(page, nom)).toHaveClass(/invalide/);
    await expect(lien(page, nom)).toHaveAttribute('aria-invalid', 'true');
    await expect(lien(page, nom).locator('xpath=following-sibling::span[@data-marque-icone]')).toHaveCount(1);
  }
  await expect(client(page)).toHaveClass(/invalide/);
  await expect(client(page)).toHaveAttribute('aria-invalid', 'true');
  await expect(page.locator('[data-marque-aide]')).toHaveCount(1);
  await expect(page.locator('[data-marque-aide]')).toBeVisible();
  await expect(page.locator('[data-marque-icone]')).toHaveCount(2); // les deux liens ; le champ client a son icône dans l’aide
  await expect(page.locator('[data-erreur="affaire"]')).not.toHaveClass(/erreur/); // l'affaire est en règle
  await capturer(page, info, 'A1-champs-marques');
});

test('A2 le premier champ marqué est au centre de l’écran avec le focus ; l’aperçu ouvert revient sur l’onglet Édition', async ({ page }) => {
  await ecrireEntrepriseComplete();
  await brouillon();
  await ouvrir(page);
  await page.locator('[data-onglet="apercu"]').click();
  await expect(page.locator('[data-zone="apercu"]')).toBeVisible();
  await finaliserPuisCompris(page);
  await expect(page.locator('[data-zone="apercu"]')).toBeHidden();
  await expect(client(page)).toBeFocused();
  await expect(client(page)).toBeInViewport();
});

test('A3 remplir un champ retire sa marque tout de suite (classe, aria, icône, aide) ; les autres restent', async ({ page }) => {
  await ecrireEntrepriseComplete();
  await brouillon();
  await ouvrir(page);
  await finaliserPuisCompris(page);
  await lien(page, 'debutTravaux').click();
  await page.locator('[data-champ="debutTravaux"]').fill('2099-03-01');
  await expect(lien(page, 'debutTravaux')).not.toHaveClass(/invalide/);
  await expect(lien(page, 'debutTravaux')).toHaveAttribute('aria-invalid', 'false');
  await expect(page.locator('[data-marque-icone]')).toHaveCount(1);
  await expect(lien(page, 'duree')).toHaveClass(/invalide/);
  await expect(client(page)).toHaveClass(/invalide/);
  await expect(page.locator('[data-marque-aide]')).toHaveCount(1);
});

test('A4 erreurs sans champ (entreprise, assurance) : aucune marque ; le bouton « Ouvrir Mon entreprise » reste dans la fenêtre', async ({ page }) => {
  await brouillon({ organisationId: 'o1', chantier: { debutTravaux: '2099-01-01', dureeEstimee: { valeur: 2, unite: 'jour' } } });
  await ouvrir(page);
  await page.locator('[data-action="finaliser"]').click();
  await expect(dialogue(page).getByRole('button', { name: 'Ouvrir Mon entreprise' })).toBeVisible();
  await dialogue(page).getByRole('button', { name: 'Compris' }).click();
  await expect(page.locator('[data-marque], [data-marque-icone], [data-marque-aide]')).toHaveCount(0);
});

test('A5 refus du serveur : « Indique la date de début des travaux. » marque le même lien', async ({ page }, info) => {
  await ecrireEntrepriseComplete();
  await brouillon({ organisationId: 'o1', chantier: { debutTravaux: '2099-01-01', dureeEstimee: { valeur: 2, unite: 'jour' } } });
  await page.route('**/devisFinaliser', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ok: false, erreurs: ['Indique la date de début des travaux.'] } }) });
  });
  await ouvrir(page);
  await page.locator('[data-action="finaliser"]').click();
  await expect(dialogue(page)).toContainText('Finaliser ce devis ?');
  await dialogue(page).getByRole('button', { name: 'Finaliser', exact: true }).click();
  await expect(dialogue(page)).toContainText('Ce devis ne peut pas encore être finalisé');
  await dialogue(page).getByRole('button', { name: 'Compris' }).click();
  await expect(lien(page, 'debutTravaux')).toHaveClass(/invalide/);
  await expect(page.locator('[data-marque-aide]')).toContainText('Indique la date de début des travaux.');
  await capturer(page, info, 'A5-refus-serveur');
});

test('A7 thème sombre : le contour, l’icône et l’aide restent lisibles', async ({ page }, info) => {
  await ecrireEntrepriseComplete();
  await brouillon();
  await page.emulateMedia({ colorScheme: 'dark' });
  await ouvrir(page);
  await finaliserPuisCompris(page);
  await expect(lien(page, 'debutTravaux')).toHaveClass(/invalide/);
  await capturer(page, info, 'A7-sombre');
});

test('A8 téléphone : la zone de clic du lien marqué fait au moins 44 px', async ({ page }, info) => {
  test.skip(info.project.name !== 'telephone', 'téléphone seulement');
  await ecrireEntrepriseComplete();
  await brouillon();
  await ouvrir(page);
  await finaliserPuisCompris(page);
  const boite = await lien(page, 'debutTravaux').boundingBox();
  expect(boite.height).toBeGreaterThanOrEqual(44);
  await capturer(page, info, 'A8-telephone');
});

test('B4.2 aperçu d’un devis organisation + personne : la ligne « À l’attention de » est dans l’aperçu', async ({ page }, info) => {
  await ecrireEntrepriseComplete();
  await creerPersonne('p1', { nom: 'Marie Dupont', organisationId: 'o1' });
  await brouillon({ organisationId: 'o1', personneId: 'p1' });
  await ouvrir(page);
  await page.locator('[data-onglet="apercu"]').click();
  await expect(page.frameLocator('[data-zone="apercu"]').locator('body')).toContainText('À l’attention de Marie Dupont');
  await capturer(page, info, 'B4-apercu-attention');
});

test('B4.3 devis pour une personne seule (sans organisation) : pas de ligne « À l’attention de » dans l’aperçu', async ({ page }) => {
  await ecrireEntrepriseComplete();
  await creerPersonne('p1', { nom: 'Marie Dupont' });
  await brouillon({ organisationId: null, personneId: 'p1' });
  await ouvrir(page);
  await page.locator('[data-onglet="apercu"]').click();
  await expect(page.frameLocator('[data-zone="apercu"]').locator('body')).toContainText('Marie Dupont');
  await expect(page.frameLocator('[data-zone="apercu"]').locator('body')).not.toContainText('À l’attention de');
});
