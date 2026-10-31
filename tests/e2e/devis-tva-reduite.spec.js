// Mention de TVA réduite (31/10/2026) : réglage Réglages > Devis > Général. Un test par point (le nom commence par son numéro).
// Captures : tests/e2e/captures/devis-tva-reduite/ (ordinateur ET téléphone). Données fictives.
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { test, expect, connecter, allerA, ouvrirSectionReglages, attendreCalme, lireDocument, ecrireDocument } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-tva-reduite/', import.meta.url));
async function capturer(page, info, nom, cible = page) {
  await mkdir(DOSSIER, { recursive: true });
  await cible.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
}
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});
const zone = (page) => page.locator('#devis-mentionTvaReduite');
const enregistrer = (page) => page.locator('[data-action="enregistrer-reglages-devis"]');
async function ouvrirReglages(page) {
  await connecter(page);
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Devis');
  await attendreCalme(page);
}

test('3 cas vide : le champ « Mention de TVA réduite » est vide, montre le texte standard en exemple et explique quand il s\'imprime', async ({ page }, info) => {
  await ecrireDocument('devis_parametres/reglages', { regimeTva: 'assujetti', entreprise: { nom: 'Entreprise Exemple' } });
  await ouvrirReglages(page);
  await expect(page.locator('label[for="devis-mentionTvaReduite"]')).toContainText('Mention de TVA réduite');
  await expect(zone(page)).toHaveValue('');
  await expect(zone(page)).toHaveAttribute('placeholder', /articles 278-0 bis A et 279-0 bis/);
  await expect(zone(page)).toHaveAttribute('maxlength', '600');
  await expect(page.locator('[data-reglage="mentionTvaReduite"]')).toContainText('Imprimée automatiquement sur les devis qui ont une ligne à 5,5 % ou 10 %. Laissé vide, le texte standard s’imprime.');
  await expect(page.locator('[data-reglage="mentionEmetteur"]')).not.toContainText('l’attestation de TVA réduite du client');
  await expect(page.locator('[data-reglage="mentionEmetteur"]')).toContainText('La mention de TVA réduite se règle juste au-dessus');
  await zone(page).scrollIntoViewIfNeeded();
  await capturer(page, info, '3-mention-tva-reduite-vide', page.locator('[data-reglage="mentionTvaReduite"]'));
});

test('3 le texte personnalisé s\'enregistre sans rien perdre d\'autre ; le vider remet le texte standard (champ vidé en base)', async ({ page }, info) => {
  await ecrireDocument('devis_parametres/reglages', { regimeTva: 'assujetti', mentionEmetteur: 'Qualif', entreprise: { nom: 'Entreprise Exemple' } });
  await ouvrirReglages(page);
  await zone(page).fill('Taux réduit appliqué\nLe client atteste les conditions.');
  await enregistrer(page).click();
  await expect.poll(async () => (await lireDocument('devis_parametres/reglages'))?.mentionTvaReduite).toBe('Taux réduit appliqué\nLe client atteste les conditions.');
  const doc = await lireDocument('devis_parametres/reglages');
  expect(doc.mentionEmetteur).toBe('Qualif');
  expect(doc.entreprise.nom).toBe('Entreprise Exemple');
  await attendreCalme(page);
  await zone(page).scrollIntoViewIfNeeded();
  await capturer(page, info, '3-mention-tva-reduite-personnalisee', page.locator('[data-reglage="mentionTvaReduite"]'));
  await zone(page).fill('');
  await enregistrer(page).click();
  await expect.poll(async () => (await lireDocument('devis_parametres/reglages'))?.mentionTvaReduite).toBe('');
});

test('3 cas d\'erreur : la saisie est limitée à 600 caractères (le champ ne laisse pas taper plus)', async ({ page }) => {
  await ecrireDocument('devis_parametres/reglages', { regimeTva: 'assujetti', entreprise: { nom: 'Entreprise Exemple' } });
  await ouvrirReglages(page);
  await zone(page).fill('x'.repeat(700));
  expect((await zone(page).inputValue()).length).toBe(600);
});
