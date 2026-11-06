// En-têtes de colonne des Kanbans (Affaires et Devis) : « 3 affaires · 2 000 € » puis « 1 affaire [TEST] · 100 € ». Un test par critère, le nom commence par son numéro.
// Captures dans tests/e2e/captures/kanban-entetes-colonnes/ (ordinateur ET téléphone).
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, allerA, creerAffaire, ecrireDocument, attendreCalme, JEROME } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/kanban-entetes-colonnes/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
const dialogue = (page) => page.getByRole('dialog');
const nbsp = (s) => s.replace(/[  ]/g, ' ');
const jourDansLe = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

test.beforeEach(async ({ page }) => {
  await page.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
});

async function poserTests(page, valeur) {
  await page.locator('[data-action="filtres"]').click();
  await dialogue(page).locator('select[data-cle="tests"]').selectOption(valeur);
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(dialogue(page)).toHaveCount(0);
}
async function devis(id, valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument(`devis_devis/${id}`, {
    racineId: id, version: 1, numero: null, statut: 'envoye', affaireId: null, personneId: null, organisationId: null, modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: jourDansLe(60), finaliseLe: maintenant,
    sections: [{ id: 's1', titre: 'Cuisine', lignes: [{ id: 'l1', libelle: 'Carrelage', quantite: 2, unite: 'm²', prixAchat: 50 }] }],
    creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, ...valeurs,
  });
}
const ht = (n) => ({ totaux: { ht: n, tva: n * 0.2, ttc: n * 1.2 } });
async function jeuDevis() {
  await devis('d1', { numero: 'DEV-2026-11-01-001', ...ht(100) });
  await devis('d2', { numero: 'DEV-2026-11-02-002', ...ht(120) });
  await devis('dT', { numero: 'DEV-2026-11-03-003', test: true, ...ht(100) });
  await devis('dA', { numero: 'DEV-2026-11-04-004', archive: true, ...ht(999) });
}
async function versTableauDevis(page, dejaConnecte = false) {
  if (dejaConnecte) await allerA(page, 'Devis');
  else await connecter(page, undefined, { route: 'devis/liste' });
  await expect(page.locator('.page-liste-devis')).toBeVisible();
  await attendreCalme(page);
  await page.locator('[data-vue="tableau"]').click();
  await expect(page.locator('.colonne')).not.toHaveCount(0);
}
async function jeuAffaires() {
  await creerAffaire('a1', { titre: 'Audit un', etape: 'rdv_fixe', montant: 1000 });
  await creerAffaire('a2', { titre: 'Audit deux', etape: 'rdv_fixe', montant: 1000 });
  await creerAffaire('aT', { titre: 'Audit test', etape: 'rdv_fixe', montant: 100, test: true });
}
const texte = async (loc) => nbsp((await loc.textContent()) ?? '').replace(/\s+/g, ' ').trim();

test('1 Kanban des Affaires : l’en-tête dit « 3 affaires · 2 000 € » (le nombre d’abord) puis « 1 affaire [TEST] · 100 € » avec le badge [TEST] ; le montant réel exclut le test', async ({ page }, info) => {
  await jeuAffaires();
  await connecter(page);
  await allerA(page, 'Affaires');
  const colonne = page.locator('.colonne[data-colonne="rdv_fixe"]');
  await expect(colonne.locator('.colonne-totaux')).toHaveText(/^3 affaires · 2[\s  ]000 €$/);
  const tests = colonne.locator('.colonne-totaux-tests');
  expect(await texte(tests)).toBe('1 affaire [TEST] · 100 €');
  await expect(tests.locator('.badge-test')).toHaveCount(1);
  await capturer(page, info, '1-affaires-entetes');
});

test('2 sans affaire de test : pas de seconde ligne ; colonne vide : « 0 affaire » sans montant ; une seule affaire : « 1 affaire · 100 € »', async ({ page }, info) => {
  await creerAffaire('a1', { titre: 'Audit un', etape: 'rdv_fixe', montant: 100 });
  await connecter(page);
  await allerA(page, 'Affaires');
  const colonne = page.locator('.colonne[data-colonne="rdv_fixe"]');
  expect(await texte(colonne.locator('.colonne-totaux'))).toBe('1 affaire · 100 €');
  await expect(colonne.locator('.colonne-totaux-tests')).toHaveCount(0);
  const vide = page.locator('.colonne:not([data-colonne="rdv_fixe"])').first();
  expect(await texte(vide.locator('.colonne-totaux'))).toBe('0 affaire');
  await expect(vide.locator('.colonne-totaux-tests')).toHaveCount(0);
  await capturer(page, info, '2-sans-test-et-vide');
});

test('3 Kanban des Devis (vue Tableau) : « 2 devis · 220 € » (HT) puis « 1 devis [TEST] · 100 € » ; un devis archivé n’y compte pas ; une colonne sans devis dit « 0 devis »', async ({ page }, info) => {
  await jeuDevis();
  await versTableauDevis(page);
  const colonne = page.locator('.tableau-devis-colonnes .colonne[data-colonne="envoye"]');
  expect(await texte(colonne.locator('.colonne-totaux'))).toBe('3 devis · 220 €');
  expect(await texte(colonne.locator('.colonne-totaux-tests'))).toBe('1 devis [TEST] · 100 €');
  await expect(colonne.locator('.colonne-totaux-tests .badge-test')).toHaveCount(1);
  const vide = page.locator('.tableau-devis-colonnes .colonne[data-colonne="refuse"]');
  expect(await texte(vide.locator('.colonne-totaux'))).toBe('0 devis');
  await expect(vide.locator('.colonne-totaux-tests')).toHaveCount(0);
  await capturer(page, info, '3-devis-entetes');
});

test('3c colonne Brouillon : « 2 devis » sans montant, et « 1 devis [TEST] » sans montant ; la colonne « Envoyé » garde « 2 devis · 220 € »', async ({ page }, info) => {
  await jeuDevis();
  await devis('b1', { numero: null, statut: 'brouillon', finaliseLe: null, expireLe: null });
  await devis('b2', { numero: null, statut: 'brouillon', finaliseLe: null, expireLe: null });
  await devis('bT', { numero: null, statut: 'brouillon', finaliseLe: null, expireLe: null, test: true });
  await versTableauDevis(page);
  await poserTests(page, 'exclure');
  await expect(page.locator('.tableau-devis-colonnes .colonne[data-colonne="brouillon"] .colonne-totaux')).toHaveText(/^2 devis$/);
  expect(await texte(page.locator('.tableau-devis-colonnes .colonne[data-colonne="envoye"] .colonne-totaux'))).toBe('2 devis · 220 €');
  await poserTests(page, 'inclure');
  const colonne = page.locator('.tableau-devis-colonnes .colonne[data-colonne="brouillon"]');
  expect(await texte(colonne.locator('.colonne-totaux'))).toBe('3 devis');
  expect(await texte(colonne.locator('.colonne-totaux-tests'))).toBe('1 devis [TEST]');
  expect(await texte(page.locator('.tableau-devis-colonnes .colonne[data-colonne="envoye"] .colonne-totaux'))).toBe('3 devis · 220 €');
  await capturer(page, info, '3c-brouillon-sans-montant');
});

test('4 filtre « Seulement les tests » : Affaires « 1 affaire » (sans montant réel) + « 1 affaire [TEST] · 100 € » ; Devis pareil ; « Sans les tests » : plus de seconde ligne', async ({ page }, info) => {
  await jeuAffaires();
  await jeuDevis();
  await connecter(page);
  await allerA(page, 'Affaires');
  const colonne = page.locator('.colonne[data-colonne="rdv_fixe"]');
  await poserTests(page, 'seulement');
  expect(await texte(colonne.locator('.colonne-totaux'))).toBe('1 affaire');
  expect(await texte(colonne.locator('.colonne-totaux-tests'))).toBe('1 affaire [TEST] · 100 €');
  await capturer(page, info, '4-seulement-affaires');
  await poserTests(page, 'exclure');
  expect(await texte(colonne.locator('.colonne-totaux'))).toBe('2 affaires · 2 000 €');
  await expect(colonne.locator('.colonne-totaux-tests')).toHaveCount(0);
  await versTableauDevis(page, true);
  const cd = page.locator('.tableau-devis-colonnes .colonne[data-colonne="envoye"]');
  await poserTests(page, 'seulement');
  expect(await texte(cd.locator('.colonne-totaux'))).toBe('1 devis');
  expect(await texte(cd.locator('.colonne-totaux-tests'))).toBe('1 devis [TEST] · 100 €');
  await capturer(page, info, '4-seulement-devis');
  await poserTests(page, 'exclure');
  expect(await texte(cd.locator('.colonne-totaux'))).toBe('2 devis · 220 €');
  await expect(cd.locator('.colonne-totaux-tests')).toHaveCount(0);
});

test('5 les deux lignes tiennent dans l’en-tête, sans débordement (Affaires et Devis)', async ({ page }, info) => {
  await jeuAffaires();
  await jeuDevis();
  await connecter(page);
  await allerA(page, 'Affaires');
  const tete = page.locator('.colonne[data-colonne="rdv_fixe"] .colonne-tete');
  await expect(tete.locator('.colonne-totaux-tests')).toBeVisible();
  expect(await tete.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  await capturer(page, info, '5-debordement-affaires');
  await versTableauDevis(page, true);
  const teteD = page.locator('.tableau-devis-colonnes .colonne[data-colonne="envoye"] .colonne-tete');
  await expect(teteD.locator('.colonne-totaux-tests')).toBeVisible();
  expect(await teteD.evaluate((e) => e.scrollWidth <= e.clientWidth)).toBe(true);
  await capturer(page, info, '5-debordement-devis');
});
