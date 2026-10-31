// Mentions légales du devis, PR A (31/10/2026) : Réglages > Devis > Mon entreprise (texte d'assurance, coordonnées bancaires) et Général (« Attestation et mentions »).
// Un test par point (le nom commence par son numéro). Captures : tests/e2e/captures/devis-mentions-legales/ (ordinateur ET téléphone). Données fictives.
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { test, expect, connecter, allerA, ouvrirSectionReglages, attendreCalme, lireDocument, ecrireDocument } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-mentions-legales/', import.meta.url));
async function capturer(page, info, nom, cible = page) {
  await mkdir(DOSSIER, { recursive: true });
  await cible.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
}

// Ces écrans n'utilisent pas Google : le script de l'API est remplacé par un fichier vide.
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});

async function ouvrirReglages(page) {
  await connecter(page);
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Devis');
  await attendreCalme(page);
}
const assurance = (page) => page.locator('[data-champ="entreprise.assuranceTexte"]');
const banque = (page) => page.locator('[data-champ="entreprise.coordonneesBancaires"]');
const enregistrer = (page) => page.locator('[data-action="enregistrer-reglages-devis"]');
const alerte = (page) => page.locator('[data-zone="mentions-manquantes"]');
const base = async () => (await lireDocument('devis_parametres/reglages'))?.entreprise;

test('A1 cas vide : sans rien d\'enregistré, un seul texte d\'assurance multiligne (plus de quatre champs) avec le texte par défaut en exemple ; les crochets restent signalés', async ({ page }, info) => {
  await ouvrirReglages(page);
  await expect(assurance(page)).toBeVisible();
  await expect(assurance(page)).toHaveJSProperty('tagName', 'TEXTAREA');
  await expect(assurance(page)).toHaveValue('');
  await expect(assurance(page)).toHaveAttribute('placeholder', 'Assurance décennale : [Assureur], contrat numéro : [numéro], territorialité : France métropolitaine.');
  for (const ancien of ['garantie', 'assureur', 'adresse', 'zone']) await expect(page.locator(`[data-champ="entreprise.assurance.${ancien}"]`)).toHaveCount(0);
  await expect(alerte(page)).toContainText('Complète le texte d\'assurance : il reste des crochets.');
  await assurance(page).scrollIntoViewIfNeeded();
  await capturer(page, info, 'A1-assurance-vide', page.locator('#reglages-entreprise'));
});

test('A1 un texte sans crochet retire l\'alerte, s\'enregistre avec ses retours à la ligne et se relit ; un crochet rallume l\'alerte', async ({ page }, info) => {
  await ouvrirReglages(page);
  await assurance(page).fill('Assurance décennale : Assureur Exemple\ncontrat numéro : 123');
  await expect(alerte(page)).not.toContainText('crochets');
  await enregistrer(page).click();
  await expect.poll(async () => (await base())?.assuranceTexte).toBe('Assurance décennale : Assureur Exemple\ncontrat numéro : 123');
  await page.reload();
  await attendreCalme(page);
  await expect(assurance(page)).toHaveValue('Assurance décennale : Assureur Exemple\ncontrat numéro : 123');
  await assurance(page).fill('Assurance décennale : [Assureur]');
  await expect(alerte(page)).toContainText('il reste des crochets');
  await assurance(page).fill('');
  await enregistrer(page).click();
  await expect.poll(async () => (await base())?.assuranceTexte).toBeUndefined(); // vide : rien n'est enregistré (le devis imprime le texte par défaut)
});

test('A1 compatibilité : un espace qui avait les quatre anciens champs voit son texte reconstruit, sans alerte, sans rien écrire en base tant qu\'on n\'enregistre pas', async ({ page }, info) => {
  await ecrireDocument('devis_parametres/reglages', { regimeTva: 'assujetti', entreprise: { nom: 'Entreprise Exemple', assurance: { garantie: 'Décennale', assureur: 'Assureur Exemple', zone: 'France' } } });
  await ouvrirReglages(page);
  await expect(assurance(page)).toHaveValue('Assurance professionnelle : Décennale, souscrite auprès de Assureur Exemple, couverture géographique : France.');
  await expect(alerte(page)).not.toContainText('crochets');
  expect((await base()).assuranceTexte).toBeUndefined();
  expect((await base()).assurance).toEqual({ garantie: 'Décennale', assureur: 'Assureur Exemple', zone: 'France' });
  await assurance(page).scrollIntoViewIfNeeded();
  await capturer(page, info, 'A1-assurance-reconstruite', page.locator('#reglages-entreprise'));
});

test('A2 coordonnées bancaires : un texte de trois lignes (banque, IBAN, BIC), enregistré avec ses lignes, relu ; vide, rien n\'est enregistré ; l\'ancien IBAN en base n\'est pas perdu', async ({ page }, info) => {
  await ecrireDocument('devis_parametres/reglages', { regimeTva: 'assujetti', entreprise: { nom: 'Entreprise Exemple', paiement: { iban: 'FR00 0000 0000', modes: ['Chèque'] } } });
  await ouvrirReglages(page);
  await expect(banque(page)).toHaveValue('');
  await expect(banque(page)).toHaveAttribute('maxlength', '300');
  await banque(page).fill('Banque Exemple\nFR76 0000 0000 0000\nBIC EXEMPLEXXX');
  await enregistrer(page).click();
  await expect.poll(async () => (await base())?.coordonneesBancaires).toBe('Banque Exemple\nFR76 0000 0000 0000\nBIC EXEMPLEXXX');
  expect((await base()).paiement.iban).toBe('FR00 0000 0000');
  await page.reload();
  await attendreCalme(page);
  await expect(banque(page)).toHaveValue('Banque Exemple\nFR76 0000 0000 0000\nBIC EXEMPLEXXX');
  await banque(page).scrollIntoViewIfNeeded();
  await capturer(page, info, 'A2-coordonnees-bancaires', page.locator('#reglages-entreprise'));
  await banque(page).fill('');
  await enregistrer(page).click();
  await expect.poll(async () => (await base())?.coordonneesBancaires).toBeUndefined();
});

test('A3 « Attestation et mentions » remplace « Mention d\'émetteur » : même réglage, 2000 caractères, lignes gardées, ancienne valeur relue', async ({ page }, info) => {
  await ecrireDocument('devis_parametres/reglages', { regimeTva: 'assujetti', mentionEmetteur: 'Ancienne mention', entreprise: { nom: 'Entreprise Exemple' } });
  await ouvrirReglages(page);
  const zone = page.locator('#devis-mentionEmetteur');
  await expect(page.locator('label[for="devis-mentionEmetteur"]')).toContainText('Attestation et mentions');
  await expect(page.locator('body')).not.toContainText('Mention d’émetteur');
  await expect(zone).toHaveValue('Ancienne mention');
  await expect(zone).toHaveAttribute('maxlength', '2000');
  await zone.fill('Attestation de TVA réduite\nQualification RGE n° 123');
  await enregistrer(page).click();
  await expect.poll(async () => (await lireDocument('devis_parametres/reglages'))?.mentionEmetteur).toBe('Attestation de TVA réduite\nQualification RGE n° 123');
  expect((await base()).nom).toBe('Entreprise Exemple'); // enregistrer ne perd rien d'autre
  await attendreCalme(page); // l'enregistrement redessine l'écran : on attend avant de faire défiler (sinon « element is not stable »)
  await expect(zone).toHaveValue('Attestation de TVA réduite\nQualification RGE n° 123');
  await zone.scrollIntoViewIfNeeded();
  await capturer(page, info, 'A3-attestation-et-mentions', page.locator('[data-reglage="mentionEmetteur"]'));
});

// Le document imprimé (le même HTML que le PDF) : page statique chargée directement, pas d'application ni d'émulateur.
const ESSAI = fileURLToPath(new URL('./devis-mentions-document.mjs', import.meta.url));
const fabriquer = (...args) => JSON.parse(execFileSync(process.execPath, [ESSAI, ...args], { encoding: 'utf8', maxBuffer: 10_000_000 })).html;

test('A4 le document imprimé : coordonnées bancaires sous leur titre, mention avant « Bon pour accord », assurance en pied ; cas vide : assurance par défaut avec crochets, rien d\'autre', async ({ page }, info) => {
  await mkdir(DOSSIER, { recursive: true });
  await page.setViewportSize({ width: 794, height: 1123 });
  await page.setContent(fabriquer(), { waitUntil: 'load' });
  const texte = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  expect(texte).toContain('Coordonnées bancaires : Banque Exemple FR76 0000 0000 0000 BIC EXEMPLEXXX');
  expect(texte.indexOf('Qualification RGE')).toBeGreaterThan(-1);
  expect(texte.indexOf('Qualification RGE')).toBeLessThan(texte.indexOf('bon pour accord'));
  expect(texte).toContain('Assurance décennale : [Assureur], contrat numéro : [numéro], territorialité : France métropolitaine.');
  expect(texte).not.toContain('Attestation du client (preneur de la prestation)'); // plus de texte codé en dur
  expect(texte.indexOf('taux réduit de TVA')).toBeGreaterThan(-1); // la ligne du devis d'essai est à 10 % : la mention de TVA réduite s'imprime toute seule (31/10/2026)
  expect(texte.indexOf('taux réduit de TVA')).toBeLessThan(texte.indexOf('Qualification RGE')); // et passe avant « Attestation et mentions »
  await page.screenshot({ path: `${DOSSIER}A4-document-imprime-${info.project.name}.png`, fullPage: true, animations: 'disabled' });
  await page.setContent(fabriquer('sans'), { waitUntil: 'load' });
  const vide = (await page.locator('body').innerText()).replace(/\s+/g, ' ');
  expect(vide).not.toContain('Coordonnées bancaires');
  expect(vide).not.toContain('Qualification RGE');
  expect(vide).toContain('[Assureur]');
  expect(vide).toContain('taux réduit de TVA'); // sans réglage : le texte standard de la mention de TVA réduite (ligne à 10 %)
  await page.screenshot({ path: `${DOSSIER}A4-document-imprime-vide-${info.project.name}.png`, fullPage: true, animations: 'disabled' });
});
