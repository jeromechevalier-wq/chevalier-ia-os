// PR D, point 8 : l'écran de connexion et l'espace d'un client (marque Studio Lune) avant et après le look compact, dans ~/chantiers-crm/captures-look-compact/<LOOK>/.
// Mêmes données que identite-client.spec.js (règles de la plateforme chargées le temps de ce fichier).
import { mkdir, readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, ecrireDocument, estTelephone, PROJET, FIRESTORE, URL_APP, jour } from './outils.js';

const LOOK = process.env.LOOK === 'avant' ? 'avant' : 'apres';
const DOSSIER = join(homedir(), 'chantiers-crm', 'captures-look-compact', LOOK);
const ALICE = 'alice@exemple.test';
const maintenant = new Date();
const base = { proprietaire: ALICE, creeLe: maintenant, modifieLe: maintenant, creePar: ALICE, modifiePar: ALICE };

async function chargerRegles(fichier) {
  const contenu = await readFile(fileURLToPath(new URL(`../../${fichier}`, import.meta.url)), 'utf8');
  const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: fichier, content: contenu }] } }) });
  if (!r.ok) throw new Error(`Règles non chargées (${fichier}) : ${await r.text()}`);
}
test.beforeAll(() => chargerRegles('firestore.plateforme.rules'));
test.afterAll(() => chargerRegles('firestore.rules'));

async function capture(page, nom) {
  await mkdir(DOSSIER, { recursive: true });
  await page.waitForTimeout(350);
  await page.screenshot({ path: join(DOSSIER, `${estTelephone(page) ? 'tel' : 'ordi'}-sombre-${nom}.png`), animations: 'disabled' });
}
const sansDebordement = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test('8 écran de connexion de Jérôme et de l’espace client : lisibles, sans débordement (captures avant/après)', async ({ page }) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues' });
  await ecrireDocument('marques/studio', { actif: true, nom: 'Studio Lune', couleur: '#336699', accueil: 'Bienvenue.' });
  await ecrireDocument('clients/studio', { modules: { affaires: true } });
  await ecrireDocument(`clients/studio/membres/${ALICE}`, { role: 'editeur' });
  await ecrireDocument('clients/studio/crm_personnes/p1', { nom: 'Camille Dubois', prenom: 'Camille', nomFamille: 'Dubois', organisationId: null, telephones: [], emails: [], emailsNormalises: [], etiquettes: [], ville: '', linkedin: '', siteWeb: '', source: '', oppositionProspection: false, dateOpposition: null, archive: false, ...base });
  await ecrireDocument('clients/studio/crm_affaires/a1', { titre: 'Audit du lac', personneId: 'p1', organisationId: null, etape: 'etape_3', statut: 'ouverte', priorite: 'tiede', montant: 1200, offreId: null, dureeJours: null, source: '', besoin: '', dateEntreeEtape: maintenant, datesEtapes: { proposition_envoyee: maintenant }, raisonPerdue: '', raisonPerdueDetail: '', dateReveil: null, encaissements: [], documents: [], projetId: null, archive: false, ...base });
  // connexion de Jérôme (racine)
  await page.goto(`${URL_APP}#/crm/accueil`);
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
  expect(await sansDebordement(page)).toBe(true);
  await capture(page, '8-connexion-racine');
  // espace client : connexion puis liste des affaires
  await page.goto('about:blank');
  await page.goto(`${URL_APP}#/espace/studio/crm/affaires`);
  await page.waitForFunction(() => !!window.__chevalierTest);
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
  expect(await sansDebordement(page)).toBe(true);
  await capture(page, '8-connexion-client');
  await page.evaluate((e) => window.__chevalierTest.connecter(e, true), ALICE);
  await expect(page.locator('.coquille')).toBeVisible();
  await expect(page.locator('.carte-affaire').first()).toBeVisible();
  expect(await sansDebordement(page)).toBe(true);
  await capture(page, '8-espace-client-affaires');
});
