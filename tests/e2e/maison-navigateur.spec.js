// Chantier 0, partie navigateur (26/11/2026) : le CRM lit reglages_maison/public avant la connexion et reglages_maison/ecran après (aucun compte écrit dans js/).
// Les cas de lecture (plateforme, document absent, panne) sont aussi testés sans navigateur : tests/comptes-maison.test.js.
// Captures dans tests/e2e/captures/maison-navigateur/ (une par état, nommée avec le projet : ordinateur ou téléphone). Adresses des comptes : celles des parcours (outils.js).
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, URL_APP, PROJET, FIRESTORE, JEROME, CHARLES, ouvrirMenuUtilisateur, allerA, connecterCompte } from './outils.js';
import { semerFicheEmulateur } from '../_fiche-emulateur.js';

const DOSSIER = fileURLToPath(new URL('./captures/maison-navigateur/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: true, animations: 'disabled' });
const HOTE = new URL(FIRESTORE).host;
const semer = (document, fiche) => semerFicheEmulateur({ projet: PROJET, hote: HOTE, document, fiche });
const bouton = (page) => page.getByRole('button', { name: 'Se connecter avec Google' });

async function chargerRegles(fichier) {
  const contenu = await readFile(fileURLToPath(new URL(`../../${fichier}`, import.meta.url)), 'utf8');
  const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: fichier, content: contenu }] } }),
  });
  if (!r.ok) throw new Error(`Règles non chargées (${fichier}) : ${await r.text()}`);
}

test('MN1 Jérôme connecté : son nom vient de reglages_maison/ecran, la Console est à lui seul', async ({ page }, info) => {
  await connecter(page, JEROME);
  await expect(page.locator('.menu-compte .compte-nom')).toHaveText('Jérôme');
  await ouvrirMenuUtilisateur(page);
  await expect(page.locator('.menu-pop')).toContainText(JEROME);
  await page.keyboard.press('Escape');
  await allerA(page, 'Console');
  await expect(page).toHaveURL(/#\/console/);
  await capturer(page, info, 'MN1-jerome-console');
});

test('MN2 le compte du bot : connecté sous le nom « Charles », sans la Console', async ({ page }, info) => {
  await connecter(page, CHARLES);
  await expect(page.locator('.menu-compte .compte-nom')).toHaveText('Charles');
  await expect(page.locator('.menu').getByRole('link', { name: 'Console', exact: true })).toHaveCount(0);
  await capturer(page, info, 'MN2-charles-sans-console');
});

test('MN3 un compte inconnu est refusé et déconnecté, comme avant', async ({ page }, info) => {
  await connecter(page, 'intrus@exemple.test', { attendreAccueil: false });
  await expect(page.getByText("Accès refusé : ce compte n'est pas autorisé")).toBeVisible();
  await expect(bouton(page)).toBeVisible();
  await capturer(page, info, 'MN3-compte-inconnu-refuse');
});

test('MN4 « public » absent : message clair « Réglages de la maison absents », jamais la page de la plateforme', async ({ page }, info) => {
  await semer('public', null);
  await page.goto(`${URL_APP}#/crm/accueil`);
  const panne = page.locator('[data-role="panne-demarrage"]');
  await expect(panne).toContainText('Réglages de la maison absents (reglages_maison/public)');
  await expect(panne.getByRole('button', { name: 'Recharger' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Espace indisponible' })).toHaveCount(0);
  await expect(bouton(page)).toHaveCount(0);
  await capturer(page, info, 'MN4-public-absent');
});

test('MN5 panne de lecture de « public » : message et « Recharger », le CRM ne démarre pas', async ({ page }, info) => {
  await page.addInitScript(() => { window.__emulateurs = { ...window.__emulateurs, echecsPublic: 99, attentesPublic: [10, 10, 10] }; });
  await page.goto(`${URL_APP}#/crm/accueil`);
  const panne = page.locator('[data-role="panne-demarrage"]');
  await expect(panne).toContainText('Chargement impossible pour le moment');
  await expect(panne.getByRole('button', { name: 'Recharger' })).toBeVisible();
  await expect(bouton(page)).toHaveCount(0);
  await capturer(page, info, 'MN5-public-panne');
});

test('MN6 « ecran » absent après la connexion : message clair, le compte reste connecté (aucune déconnexion)', async ({ page }, info) => {
  await semer('ecran', null);
  await connecter(page, JEROME, { attendreAccueil: false });
  const panne = page.locator('[data-role="panne-demarrage"]');
  await expect(panne).toContainText('Réglages de la maison absents (reglages_maison/ecran)');
  await expect(bouton(page)).toHaveCount(0);
  expect(await page.evaluate(async () => (await import('/js/os/firebase.js')).auth.currentUser?.email)).toBe(JEROME);
  await capturer(page, info, 'MN6-ecran-absent');
});

test('MN7 panne de lecture de « ecran » : « Connexion impossible » et « Recharger », sans déconnexion', async ({ page }, info) => {
  await page.goto(`${URL_APP}#/crm/accueil`);
  await expect(bouton(page)).toBeVisible();
  await page.waitForFunction(() => !!window.__chevalierTest);
  await connecterCompte(page, JEROME, true, { echecsEcran: 99, attentesMembre: [10, 10, 10] });
  const panne = page.locator('[data-role="panne-demarrage"]');
  await expect(panne).toContainText('Connexion impossible pour le moment');
  await expect(panne.getByRole('button', { name: 'Recharger' })).toBeVisible();
  expect(await page.evaluate(async () => (await import('/js/os/firebase.js')).auth.currentUser?.email)).toBe(JEROME);
  await capturer(page, info, 'MN7-ecran-panne');
});

test.describe('MN8 sur les règles de la plateforme', () => {
  test.beforeAll(() => chargerRegles('firestore.plateforme.rules'));
  test.afterAll(() => chargerRegles('firestore.rules'));
  test('MN8 « public » illisible (plateforme des clients) : « Espace indisponible », comme avant', async ({ page }, info) => {
    await page.goto(`${URL_APP}#/`);
    await expect(page.getByRole('heading', { name: 'Espace indisponible' })).toBeVisible();
    await expect(page.locator('[data-role="panne-demarrage"]')).toHaveCount(0);
    await capturer(page, info, 'MN8-plateforme-sans-espace');
  });
});
