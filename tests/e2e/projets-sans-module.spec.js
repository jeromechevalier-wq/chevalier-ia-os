// Pas de module Projets actif = pas de section « Projet » sur l'affaire (01/11/2026, même code chez Jérôme et chez les clients).
// Chaque test porte le numéro d'un point du brief ; captures dans tests/e2e/captures/projets-sans-module/ (ordinateur et téléphone).
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, PROJET, FIRESTORE, URL_APP } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/projets-sans-module/', import.meta.url));
const ALICE = 'alice@exemple.test';
const section = (page) => page.locator('[data-section="affaire-projet"]');

async function chargerRegles(fichier) {
  const contenu = await readFile(fileURLToPath(new URL(`../../${fichier}`, import.meta.url)), 'utf8');
  const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: fichier, content: contenu }] } }) });
  if (!r.ok) throw new Error(`Règles non chargées (${fichier}) : ${await r.text()}`);
}

async function preparer(page, modules, avecProjet = false) {
  const t = new Date();
  const b = { proprietaire: ALICE, creeLe: t, modifieLe: t, creePar: ALICE, modifiePar: ALICE };
  await ecrireDocument('marques/studio', { actif: true, nom: 'Studio Lune', couleur: '#336699', accueil: 'Bienvenue.' });
  await ecrireDocument('clients/studio', { modules, equipe: [{ email: ALICE, role: 'editeur' }] });
  await ecrireDocument(`clients/studio/membres/${ALICE}`, { role: 'editeur' });
  await ecrireDocument('clients/studio/crm_affaires/a1', { titre: 'Audit du lac', personneId: null, organisationId: null, etape: 'gagne', statut: 'gagnee', priorite: 'tiede', montant: 1200, offreId: null, dureeJours: null, source: '', besoin: '', dateEntreeEtape: t, datesEtapes: {}, raisonPerdue: '', raisonPerdueDetail: '', dateReveil: null, encaissements: [], documents: [], projetId: avecProjet ? 'x' : null, archive: false, ...b });
  if (avecProjet) await ecrireDocument('clients/studio/projets_projets/x', { titre: 'Chantier fantôme', phase: 'lancement', statut: 'actif', affaireId: 'a1', personneId: null, organisationId: null, documents: [], archive: false, ...b });
  await page.goto('about:blank');
  await page.goto(`${URL_APP}#/espace/studio/crm/affaires/a1`);
  await page.waitForFunction(() => !!window.__chevalierTest);
  await page.evaluate((e) => window.__chevalierTest.connecter(e, true), ALICE);
  await expect(page.locator('.fiche-tete')).toBeVisible();
  await attendreCalme(page);
  await expect(page.locator('[data-section="affaire-details"]')).toBeVisible();
}
async function capturer(page, info, nom) {
  await mkdir(DOSSIER, { recursive: true });
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled', fullPage: true });
}

test.beforeEach(async ({ page }) => {
  await page.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
});
test.beforeAll(() => chargerRegles('firestore.plateforme.rules'));
test.afterAll(() => chargerRegles('firestore.rules'));

test('1 sans le module Projets, une affaire gagnée n’a pas de section « Projet » ni de boutons pour en créer ou en lier un', async ({ page }, info) => {
  await preparer(page, { affaires: true });
  await expect(section(page)).toHaveCount(0);
  await expect(page.locator('[data-action="creer-projet"], [data-action="lier-projet"]')).toHaveCount(0);
  await capturer(page, info, '1-gagnee-sans-module');
});

test('2 sans le module Projets, même une affaire liée à un projet existant n’affiche rien (ni projet, ni « Détacher »)', async ({ page }) => {
  await preparer(page, { affaires: true }, true);
  await expect(section(page)).toHaveCount(0);
  await expect(page.locator('[data-action="detacher-projet"]')).toHaveCount(0);
});

test('3 avec le module Projets, la section et ses deux boutons sont là', async ({ page }, info) => {
  await preparer(page, { affaires: true, projets: true });
  await expect(section(page).locator('[data-action="creer-projet"]')).toBeVisible();
  await expect(section(page).locator('[data-action="lier-projet"]')).toBeVisible();
  await capturer(page, info, '3-gagnee-avec-module');
});
