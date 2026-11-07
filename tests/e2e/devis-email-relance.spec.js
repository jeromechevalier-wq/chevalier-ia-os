// Portail devis seul, étape 2b : le texte de RELANCE dans la fenêtre « Préparer l'e-mail » (même fenêtre, même bouton ; seul le texte change). Le serveur est SIMULÉ (page.route).
// Captures dans tests/e2e/captures/devis-email-relance/ (ordinateur ET téléphone).
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, ecrireDocument, JEROME, attendreCalme } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-email-relance/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: true, animations: 'disabled' });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' };
const jourDansLe = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const ilYA = (jours) => new Date(Date.now() - jours * 86400000 - 3600000);

test.beforeEach(async ({ page }) => {
  await page.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
});

const VALEURS = (id, valeurs) => ({
  racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: null, personneId: null, organisationId: null, modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
  regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: jourDansLe(60), objet: 'Rénovation cuisine', destinataires: ['marie@exemple.fr'], copie: [],
  sections: [{ id: 's1', titre: 'Cuisine', lignes: [{ id: 'l1', libelle: 'Carrelage', quantite: 1, unite: 'u', prixAchat: 80, prixVente: 100 }] }],
  totaux: { ht: 100, tva: 20, ttc: 120 }, pdf: { statut: 'ok', chemin: `devis/${id}/d.pdf`, nom: 'Devis.pdf', tentatives: 1 },
  creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: new Date(), modifieLe: new Date(), ...valeurs,
});
const devis = (id, valeurs = {}, base = '') => ecrireDocument(`${base}devis_devis/${id}`, VALEURS(id, valeurs));
const ligne = (page, id) => page.locator(`.ligne-relance[data-id="${id}"]`);

/** Faux serveur. `etat.appels` : devisEnregistrerEnvoi reçus ; `etat.refus` : message de refus ; `etat.ecrire(appel)` : écrit la ligne dans la base (comme le vrai serveur). */
async function simulerServeur(page, etat = {}) {
  etat.appels = []; etat.email = [];
  await page.route('**/devisPreparerEmailEtat', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { branche: true } }) });
  });
  await page.route('**/devisPreparerEmail', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    etat.email.push(JSON.parse(route.request().postData()).data);
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ok: true, demandeId: 'dem_essai' } }) });
  });
  await page.route('**/devisEnregistrerEnvoi', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const donnees = JSON.parse(route.request().postData()).data;
    etat.appels.push(donnees);
    if (etat.delaiMs) await new Promise((r) => setTimeout(r, etat.delaiMs));
    if (etat.refus) return route.fulfill({ status: 400, headers: cors, body: JSON.stringify({ error: { message: etat.refus, status: 'FAILED_PRECONDITION' } }) });
    await etat.ecrire?.(donnees);
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ok: true } }) });
  });
  return etat;
}
const OBJET_RELANCE = 'Relance – Devis DEV-2026-10-01-001 – Rénovation cuisine';
const boite = (page) => page.locator('.dialogue-preparer-email');
async function ouvrirRelances(page) {
  await connecter(page, JEROME, { route: 'portail-devis/devis/relances' });
  await expect(page.locator('.page-relances')).toBeVisible();
  await attendreCalme(page);
}

test('2b-1 depuis Relances, « Préparer l’e-mail » ouvre la fenêtre préremplie du texte de relance, et SANS rien modifier l’appel porte { devisId, objet, message } de relance', async ({ page }, info) => {
  await devis('r12', { numero: 'DEV-2026-10-01-001', statut: 'envoye', finaliseLe: ilYA(12), envoyeLe: ilYA(12), envois: [{ date: ilYA(12) }] });
  const etat = await simulerServeur(page);
  await ouvrirRelances(page);
  await ligne(page, 'r12').locator('[data-action="preparer-email"]').click();
  await expect(boite(page)).toBeVisible();
  await expect(boite(page).locator('[data-champ="objet-preparer-email"]')).toHaveValue(OBJET_RELANCE);
  const message = await boite(page).locator('[data-champ="message-preparer-email"]').inputValue();
  expect(message).toBe('Bonjour,\n\nJe me permets de revenir vers vous au sujet de notre devis DEV-2026-10-01-001 – Rénovation cuisine, envoyé il y a quelques jours.\n\nAvez-vous pu en prendre connaissance ? Je reste à votre disposition pour toute question ou pour l’adapter.\n\nBien cordialement,');
  await capturer(page, info, '2b-1-fenetre-relance');
  await boite(page).locator('[data-action="confirmer-preparer-email"]').click();
  await expect.poll(() => etat.email.length).toBe(1);
  expect(etat.email[0]).toEqual({ devisId: 'r12', objet: OBJET_RELANCE, message });
  expect(etat.appels).toHaveLength(0); // « Relancé » reste un clic séparé : rien n'est enregistré à l'ouverture
});

test('2b-2 depuis le menu « … » de la liste, « Préparer l’e-mail » garde le texte STANDARD et l’appel ne porte que { devisId }', async ({ page }, info) => {
  await devis('r12', { numero: 'DEV-2026-10-01-001', statut: 'envoye', finaliseLe: ilYA(12), envoyeLe: ilYA(12), envois: [{ date: ilYA(12) }] });
  const etat = await simulerServeur(page);
  await connecter(page, JEROME, { route: 'devis/liste' });
  await expect(page.locator('.page-liste-devis')).toBeVisible();
  await attendreCalme(page);
  await page.locator('[data-action="menu-devis"]').first().click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Préparer l’e-mail' }).click();
  await expect(boite(page)).toBeVisible();
  await expect(boite(page).locator('[data-champ="objet-preparer-email"]')).toHaveValue('Devis DEV-2026-10-01-001 – Rénovation cuisine');
  expect(await boite(page).locator('[data-champ="message-preparer-email"]').inputValue()).toContain('Veuillez trouver ci-joint notre devis');
  await capturer(page, info, '2b-2-fenetre-standard');
  await boite(page).locator('[data-action="confirmer-preparer-email"]').click();
  await expect.poll(() => etat.email.length).toBe(1);
  expect(etat.email[0]).toEqual({ devisId: 'r12' });
});
