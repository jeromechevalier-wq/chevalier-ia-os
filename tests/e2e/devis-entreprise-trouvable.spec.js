// 31/10/2026 : « Mon entreprise » trouvable. A = bouton « Ouvrir Mon entreprise » dans les fenêtres de refus de finaliser ; B = bouton « Insérer le texte modèle » ; C = texte d'aide sous le champ d'assurance.
// Un test par point (le nom commence par son numéro). Captures : tests/e2e/captures/devis-entreprise-trouvable/ (ordinateur ET téléphone). Données fictives.
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { test, expect, connecter, allerA, ouvrirSectionReglages, attendreCalme, ecrireDocument, creerOrganisation, creerAffaire, JEROME } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-entreprise-trouvable/', import.meta.url));
async function capturer(page, info, nom) {
  await mkdir(DOSSIER, { recursive: true });
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name === 'telephone' ? 'tel' : 'ordi'}.png`, animations: 'disabled' });
}
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});
const MODELE = 'Assurance décennale : [Assureur], contrat numéro : [numéro], territorialité : France métropolitaine.';
const assurance = (page) => page.locator('[data-champ="entreprise.assuranceTexte"]');
const bouton = (page) => page.locator('[data-action="inserer-modele"]');
const dialogue = (page) => page.getByRole('dialog');

async function brouillon(valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument('devis_devis/dTest', {
    racineId: 'dTest', version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', personneId: null, organisationId: 'o1', modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: '2099-12-31', objet: 'Rénovation', destinataires: ['contact@exemple.fr'],
    sections: [{ id: 's1', titre: 'Cuisine', lignes: [{ id: 'l1', libelle: 'Carrelage', familleId: 'famille-1', type: 'fourniture', quantite: 10, unite: 'm²', prixAchat: 40, prixVente: 60, tauxTva: 20 }] }],
    creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, ...valeurs,
  });
}
async function ouvrirReglages(page) {
  await connecter(page);
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Devis');
  await attendreCalme(page);
}

test('A1 éditeur : le refus de finaliser pour « Mon entreprise » propose « Ouvrir Mon entreprise », qui ouvre ce bloc', async ({ page }, info) => {
  await brouillon();
  await creerOrganisation('o1', { nom: 'Société Exemple' });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', organisationId: 'o1' });
  await connecter(page, undefined, { route: 'devis/editeur/dTest' });
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
  await page.locator('[data-action="finaliser"]').click();
  await expect(dialogue(page)).toContainText('Réglages > Devis > Mon entreprise');
  await capturer(page, info, 'A1-editeur');
  await dialogue(page).getByRole('button', { name: 'Ouvrir Mon entreprise' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  await expect(page).toHaveURL(/#\/reglages\/devis\/reglages-entreprise/);
  await expect(page.locator('#mon-entreprise')).toBeVisible();
});

test('A2 sans erreur « entreprise » (devis sans client, entreprise complète) : pas de bouton « Ouvrir Mon entreprise »', async ({ page }, info) => {
  await ecrireDocument('devis_parametres/reglages', { entreprise: { nom: 'Atelier Exemple', siret: '12345678900011', adresse: { ligne1: '1 rue Exemple', codePostal: '75001', ville: 'Paris' }, email: 'contact@exemple.fr', assuranceTexte: 'Décennale chez Assureur Exemple, contrat 100' } });
  await brouillon({ organisationId: null, destinataires: [] });
  await creerAffaire('a1', { titre: 'Rénovation cuisine' });
  await connecter(page, undefined, { route: 'devis/editeur/dTest' });
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
  await page.locator('[data-action="finaliser"]').click();
  await expect(dialogue(page)).toContainText('Ce devis ne peut pas encore être finalisé');
  await expect(dialogue(page)).not.toContainText('Mon entreprise');
  await expect(dialogue(page).getByRole('button', { name: 'Ouvrir Mon entreprise' })).toHaveCount(0);
  await capturer(page, info, 'A2-sans-bouton');
});

test('B1 champ vide : « Insérer le texte modèle » écrit l\'exemple, sélectionne [Assureur], puis disparaît ; l\'alerte et « Enregistrer » réagissent', async ({ page }, info) => {
  await ouvrirReglages(page);
  await expect(assurance(page)).toHaveValue('');
  await expect(bouton(page)).toBeVisible();
  await capturer(page, info, 'B1-bouton');
  await bouton(page).click();
  await expect(assurance(page)).toHaveValue(MODELE);
  await expect(bouton(page)).toBeHidden();
  const selection = await assurance(page).evaluate((t) => t.value.slice(t.selectionStart, t.selectionEnd));
  expect(selection).toBe('[Assureur]');
  await expect(page.locator('[data-zone="mentions-manquantes"]')).toContainText('il reste des crochets');
  await expect(page.locator('[data-action="enregistrer-reglages-devis"]')).toBeEnabled();
  await capturer(page, info, 'B1-apres-clic');
  await assurance(page).fill('');
  await expect(bouton(page)).toBeVisible();
});

test('B2 champ déjà rempli : pas de bouton « Insérer le texte modèle »', async ({ page }) => {
  await ecrireDocument('devis_parametres/reglages', { entreprise: { assuranceTexte: 'Décennale chez Assureur Exemple, contrat 100' } });
  await ouvrirReglages(page);
  await expect(assurance(page)).toHaveValue(/Assureur Exemple/);
  await expect(bouton(page)).toBeHidden();
});

test('C1 un texte d\'aide sous le champ d\'assurance donne l\'exemple et dit que les crochets bloquent la finalisation', async ({ page }, info) => {
  await ouvrirReglages(page);
  const aide = page.locator('[data-zone="aide-entreprise.assuranceTexte"]');
  await expect(aide).toContainText(MODELE);
  await expect(aide).toContainText('Tant qu’il reste des crochets, le devis ne peut pas être finalisé.');
  await aide.scrollIntoViewIfNeeded();
  await capturer(page, info, 'C1-aide');
});

test('A3 liste : le refus du serveur pour « Mon entreprise » propose « Ouvrir Mon entreprise » ; un refus sans rapport avec l\'entreprise n\'en propose pas', async ({ page }, info) => {
  const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
  let erreurs = ['Complète le numéro SIRET dans Réglages > Devis > Mon entreprise.'];
  await page.route('**/devisFinaliser', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ok: false, erreurs } }) });
  });
  await brouillon();
  await creerOrganisation('o1', { nom: 'Société Exemple' });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', organisationId: 'o1' });
  await connecter(page, undefined, { route: 'devis/liste' });
  await expect(page.locator('.page-liste-devis')).toBeVisible();
  await attendreCalme(page);
  const lancer = async () => {
    await page.locator('tr.ligne-devis[data-id="dTest"] [data-action="menu-devis"]').click();
    await page.locator('.menu-pop').getByRole('menuitem', { name: /Finalisé/ }).click();
    await page.getByRole('dialog').getByRole('button', { name: 'Finaliser' }).click(); // confirmation
    await expect(dialogue(page)).toContainText('Ce devis ne peut pas encore être finalisé');
  };
  await lancer();
  await expect(dialogue(page).getByRole('button', { name: 'Ouvrir Mon entreprise' })).toBeVisible();
  await capturer(page, info, 'A3-liste');
  await dialogue(page).getByRole('button', { name: 'Compris' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  erreurs = ['Choisis le client de ce devis.'];
  await lancer();
  await expect(dialogue(page).getByRole('button', { name: 'Ouvrir Mon entreprise' })).toHaveCount(0);
  await dialogue(page).getByRole('button', { name: 'Compris' }).click();
  erreurs = ['Complète le nom de l\'entreprise dans Réglages > Devis > Mon entreprise.'];
  await lancer();
  await dialogue(page).getByRole('button', { name: 'Ouvrir Mon entreprise' }).click();
  await expect(page).toHaveURL(/#\/reglages\/devis\/reglages-entreprise/);
  await expect(page.locator('#mon-entreprise')).toBeVisible();
});
