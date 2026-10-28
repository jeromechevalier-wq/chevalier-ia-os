// Méthodes de paiement acceptées (point 15) : Réglages > Devis > Mon entreprise, phrase de l'éditeur, ajustement par devis, aperçu (même document que le PDF).
// Un test par point (le nom commence par le numéro). Captures : tests/e2e/captures/devis-methodes-paiement/ (ordinateur ET téléphone). Données fictives.
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import {
  test, expect, connecter, allerA, ouvrirSectionReglages, attendreCalme, lireDocument, ecrireDocument, creerOrganisation, creerAffaire, JEROME,
} from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-methodes-paiement/', import.meta.url));
async function capturer(page, info, nom, cible = page) {
  await mkdir(DOSSIER, { recursive: true });
  await cible.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
}

// Ces écrans n'utilisent pas Google : le script de l'API est remplacé par un fichier vide.
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});

const zoneReglage = (page) => page.locator('[data-zone="methodes-paiement"]');
const caseReglage = (page, mode) => zoneReglage(page).locator(`input[data-mode="${mode}"]`);
const phrase = (page) => page.locator('[data-valeur="methodes-paiement"]');
const blocMethodes = (page) => page.locator('[data-zone="methodes"]');
const reglagesEnBase = () => lireDocument('devis_parametres/reglages');

async function ouvrirReglages(page) {
  await connecter(page);
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Devis');
  await attendreCalme(page);
}

async function semerReglages(modes) {
  await ecrireDocument('devis_parametres/reglages', { regimeTva: 'assujetti', entreprise: { nom: 'Entreprise Exemple', ...(modes ? { paiement: { modes } } : {}) } });
}
async function devis(id, extra = {}) {
  await creerOrganisation('o1', { nom: 'Société Exemple', emails: [{ valeur: 'contact@exemple.fr', type: 'travail' }] });
  await creerAffaire('a1', { titre: 'Rénovation restaurant', organisationId: 'o1' });
  const maintenant = new Date();
  await ecrireDocument(`devis_devis/${id}`, {
    racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', organisationId: 'o1', personneId: null, modeMarge: 'majoration', marge: 0, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, expireLe: '2026-11-23', destinataires: ['contact@exemple.fr'], objet: 'Rénovation restaurant',
    sections: [{ id: 's1', titre: 'Salle', lignes: [{ id: 'l1', libelle: 'Dépose', quantite: 10, unite: 'm²', prixAchat: 100, marge: 0 }] }],
    notesBasDePage: '', creePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, ...extra,
  });
  return id;
}
async function ouvrirEditeur(page, id) {
  await connecter(page, undefined, { route: `devis/editeur/${id}` });
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
}
const sauve = (page) => expect(page.locator('[data-valeur="enregistrement"]')).toHaveText('Enregistré');
const montrer = (page) => blocMethodes(page).scrollIntoViewIfNeeded();

test('15a cocher des méthodes dans Réglages > Devis > Mon entreprise les enregistre (entreprise.paiement.modes) et les relit après rafraîchissement', async ({ page }, info) => {
  await ouvrirReglages(page);
  for (const m of ['Carte bancaire', 'Virement', 'Chèque', 'Espèces', 'Prélèvement']) await expect(caseReglage(page, m)).not.toBeChecked(); // cas vide : rien de coché d'office
  expect(await reglagesEnBase()).toBeNull();
  await caseReglage(page, 'Virement').check();
  await caseReglage(page, 'Chèque').check();
  await zoneReglage(page).locator('[data-champ="entreprise.paiement.autre"]').fill('Paiement en trois fois');
  await page.locator('[data-action="enregistrer-reglages-devis"]').click();
  await expect.poll(async () => (await reglagesEnBase())?.entreprise?.paiement?.modes).toEqual(['Virement', 'Chèque', 'Paiement en trois fois']);
  expect(JSON.stringify(await reglagesEnBase())).not.toMatch(/iban/i); // aucune coordonnée bancaire
  await page.reload();
  await ouvrirSectionReglages(page, 'Devis');
  await expect(caseReglage(page, 'Virement')).toBeChecked();
  await expect(caseReglage(page, 'Chèque')).toBeChecked();
  await expect(caseReglage(page, 'Espèces')).not.toBeChecked();
  await expect(zoneReglage(page).locator('[data-champ="entreprise.paiement.autre"]')).toHaveValue('Paiement en trois fois');
  await zoneReglage(page).scrollIntoViewIfNeeded();
  await capturer(page, info, '15a-reglages-methodes', zoneReglage(page));
});

test('15a bis une ancienne valeur (IBAN, délai) déjà en base n\'est pas perdue quand on coche une méthode', async ({ page }) => {
  await ecrireDocument('devis_parametres/reglages', { regimeTva: 'assujetti', entreprise: { nom: 'Entreprise Exemple', paiement: { iban: 'FR00 0000 0000', delaiJours: 30, modes: ['Chèque'] } } });
  await ouvrirReglages(page);
  await expect(caseReglage(page, 'Chèque')).toBeChecked();
  await caseReglage(page, 'Espèces').check();
  await page.locator('[data-action="enregistrer-reglages-devis"]').click();
  await expect.poll(async () => (await reglagesEnBase())?.entreprise?.paiement?.modes).toEqual(['Chèque', 'Espèces']);
  const p = (await reglagesEnBase()).entreprise.paiement;
  expect(p.iban).toBe('FR00 0000 0000');
  expect(p.delaiJours).toBe(30);
});

test('15b l\'éditeur affiche la liste réelle : « Méthodes de paiement acceptées : Carte bancaire, Virement. »', async ({ page }, info) => {
  await semerReglages(['Carte bancaire', 'Virement']);
  await ouvrirEditeur(page, await devis('d1'));
  await expect(phrase(page)).toHaveText('Méthodes de paiement acceptées : Carte bancaire, Virement.');
  await montrer(page);
  await capturer(page, info, '15b-editeur-liste', blocMethodes(page));
});

test('15c aucune méthode réglée : une phrase claire et un lien vers le réglage, qui ouvre Réglages', async ({ page }, info) => {
  await semerReglages(null);
  await ouvrirEditeur(page, await devis('d1'));
  await expect(phrase(page)).toContainText('Méthodes de paiement acceptées : aucune.');
  const lien = phrase(page).locator('a[data-lien="reglages-paiement"]');
  await expect(lien).toHaveAttribute('href', /reglages\/devis\/reglages-entreprise$/);
  await montrer(page);
  await capturer(page, info, '15c-editeur-aucune-methode', blocMethodes(page));
  await lien.click();
  await expect(page.locator('#reglages-entreprise')).toBeVisible();
  await expect(zoneReglage(page)).toBeVisible();
});

test('15d ajuster les méthodes pour un devis l\'enregistre sur le devis seulement ; « Revenir aux réglages » le retire', async ({ page }, info) => {
  await semerReglages(['Carte bancaire', 'Virement']);
  const avantReglages = JSON.stringify(await reglagesEnBase());
  await ouvrirEditeur(page, await devis('d1'));
  await expect(blocMethodes(page).locator('[data-action="revenir-methodes"]')).toHaveCount(0); // fermé : pas de contrôle superflu
  await blocMethodes(page).locator('[data-action="modifier-methodes"]').click();
  await expect(blocMethodes(page).locator('input[data-mode="Carte bancaire"]')).toBeChecked();
  await expect(blocMethodes(page).locator('[data-action="revenir-methodes"]')).toBeHidden(); // pas encore d'ajustement
  await blocMethodes(page).locator('input[data-mode="Carte bancaire"]').uncheck();
  await blocMethodes(page).locator('input[data-mode="Chèque"]').check();
  await expect(phrase(page)).toHaveText('Méthodes de paiement acceptées : Virement, Chèque.');
  await sauve(page);
  await expect.poll(async () => (await lireDocument('devis_devis/d1'))?.modesPaiement).toEqual(['Virement', 'Chèque']);
  expect(JSON.stringify(await reglagesEnBase())).toBe(avantReglages); // le réglage global ne bouge pas
  await montrer(page);
  await capturer(page, info, '15d-editeur-ajustement', blocMethodes(page));
  await blocMethodes(page).locator('[data-action="revenir-methodes"]').click();
  await expect(phrase(page)).toHaveText('Méthodes de paiement acceptées : Carte bancaire, Virement.');
  await sauve(page);
  await expect.poll(async () => (await lireDocument('devis_devis/d1'))?.modesPaiement).toEqual([]);
  expect(JSON.stringify(await reglagesEnBase())).toBe(avantReglages);
});

test('15e l\'aperçu (même document que le PDF) imprime la liste des réglages, puis celle du devis quand elle est ajustée', async ({ page }) => {
  await semerReglages(['Carte bancaire', 'Virement']);
  await ouvrirEditeur(page, await devis('d1'));
  await page.locator('[data-onglet="apercu"]').click();
  await expect(page.locator('iframe[data-zone="apercu"]').contentFrame().locator('.paiement li')).toHaveText(['Carte bancaire', 'Virement']);
  await page.locator('[data-onglet="edition"]').click();
  await blocMethodes(page).locator('[data-action="modifier-methodes"]').click();
  await blocMethodes(page).locator('input[data-mode="Carte bancaire"]').uncheck();
  await page.locator('[data-onglet="apercu"]').click();
  await expect(page.locator('iframe[data-zone="apercu"]').contentFrame().locator('.paiement li')).toHaveText(['Virement']);
});

test('15f un ancien devis et une entreprise sans le champ restent inchangés : rien n\'est écrit à l\'ouverture', async ({ page }) => {
  await ecrireDocument('devis_parametres/reglages', { regimeTva: 'assujetti', entreprise: { nom: 'Entreprise Exemple' } });
  await ouvrirEditeur(page, await devis('d1'));
  await expect(phrase(page)).toContainText('aucune');
  await page.locator('[data-onglet="apercu"]').click();
  await expect(page.locator('iframe[data-zone="apercu"]').contentFrame().locator('.paiement li')).toHaveCount(0);
  const d = await lireDocument('devis_devis/d1');
  expect(d.modesPaiement).toBeUndefined();
  expect((await reglagesEnBase()).entreprise.paiement).toBeUndefined();
});
