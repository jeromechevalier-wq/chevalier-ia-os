// PR A (18/10/2026), chez un client de la plateforme (règles de la plateforme chargées le temps du fichier). Points 4 et 5 à l'écran.
// Captures dans ~/chantiers-crm/captures-menu-A/ (« -tel » pour le format téléphone).
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { test, expect, ecrireDocument, estTelephone, PROJET, FIRESTORE, URL_APP } from './outils.js';

const ALICE = 'alice@exemple.test';
const DOSSIER = join(homedir(), 'chantiers-crm', 'captures-menu-A');

async function chargerRegles(fichier) {
  const contenu = await readFile(fileURLToPath(new URL(`../../${fichier}`, import.meta.url)), 'utf8');
  const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: fichier, content: contenu }] } }),
  });
  if (!r.ok) throw new Error(`Règles non chargées (${fichier}) : ${await r.text()}`);
}
test.beforeAll(() => chargerRegles('firestore.plateforme.rules'));
test.afterAll(() => chargerRegles('firestore.rules'));

async function capture(page, nom) {
  await mkdir(DOSSIER, { recursive: true });
  await page.screenshot({ path: join(DOSSIER, `${nom}${estTelephone(page) ? '-tel' : ''}.png`), animations: 'disabled' });
}

test.beforeEach(async () => {
  for (const [id, nom] of [['seul', 'Cabinet Seul'], ['duo', 'Studio Duo'], ['ancien', 'Maison Ancienne']]) {
    await ecrireDocument(`marques/${id}`, { actif: true, nom, couleur: '#336699', accueil: 'Bienvenue.' });
    await ecrireDocument(`clients/${id}/membres/${ALICE}`, { role: 'editeur' });
  }
  await ecrireDocument('clients/seul', { modules: { affaires: true, projets: false }, equipe: [{ email: ALICE, role: 'editeur' }] });
  await ecrireDocument('clients/duo', { modules: { affaires: true, projets: true }, equipe: [{ email: ALICE, role: 'editeur' }] });
  await ecrireDocument('clients/ancien', { modules: { crm: true }, equipe: [{ email: ALICE, role: 'editeur' }] }); // ancien raccourci : doit rester lu
});

async function ouvrir(page, client, reste = '') {
  await page.goto('about:blank');
  await page.goto(`${URL_APP}#/espace/${client}${reste ? `/${reste}` : ''}`);
  await page.waitForFunction(() => !!window.__chevalierTest);
  await page.evaluate((e) => window.__chevalierTest.connecter(e, true), ALICE);
}
async function reglagesAffaires(page, client) {
  await ouvrir(page, client, 'reglages/crm');
  await expect(page.locator('#reglages-options')).toBeVisible();
}

test('5 client « affaires seules » : Phases des projets, Dossiers Drive des projets, Suivi des paiements et Clôture bloquée sont cachés', async ({ page }) => {
  await reglagesAffaires(page, 'seul');
  await expect(page.locator('#reglages-etapes')).toBeVisible(); // les affaires, elles, restent
  await expect(page.locator('#reglages-phases')).toBeHidden();
  await expect(page.locator('#reglages-projets')).toBeHidden();
  await expect(page.locator('[data-option="suiviPaiements"]')).toHaveCount(0);
  await expect(page.locator('[data-option="clotureBloquee"]')).toHaveCount(0);
  await expect(page.locator('[data-option="celebrations"]')).toBeVisible(); // les autres options restent
  await expect(page.locator('.reglages-raccourcis')).not.toContainText('Phases des projets');
  await expect(page.locator('#reglages-modeles-projets')).toHaveCount(0);
  await expect(page.locator('.page-reglages')).not.toContainText('CRM');
  await page.locator('.reglages-raccourcis').scrollIntoViewIfNeeded(); // en haut de page : la barre de raccourcis montre qu'il n'y a plus « Phases des projets »
  await capture(page, '5-client-affaires-seules');
});

test('5 client « affaires + projets » : rien ne change, toutes les sections des projets sont là', async ({ page }) => {
  await reglagesAffaires(page, 'duo');
  await expect(page.locator('#reglages-phases')).toBeVisible();
  await expect(page.locator('[data-option="suiviPaiements"]')).toBeVisible();
  await expect(page.locator('[data-option="clotureBloquee"]')).toBeVisible();
  await expect(page.locator('#reglages-modeles-projets')).toBeVisible();
  await expect(page.locator('.page-reglages')).not.toContainText('CRM');
});

test('4 une fiche ancienne `crm: true` allume toujours affaires ET projets : écrans du menu et Réglages', async ({ page }) => {
  await ouvrir(page, 'ancien');
  await expect(page.locator('.coquille')).toBeVisible();
  if (estTelephone(page)) await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  else if (await page.getByRole('button', { name: 'Élargir le menu' }).count()) await page.getByRole('button', { name: 'Élargir le menu' }).click();
  await expect(page.locator('.menu .menu-groupe-titre .menu-texte')).toHaveText(['Affaires et projets']);
  await expect(page.locator('.menu .menu-groupe[data-bloc="crm"] .menu-entree')).toHaveText(['Accueil', 'Personnes', 'Organisations', 'Affaires', 'Projets', 'Journal des modifications']);
  await page.locator('.menu').getByRole('link', { name: 'Projets', exact: true }).click();
  await expect(page).toHaveURL(/#\/espace\/ancien\/projets\/projets$/);
  await expect(page.getByRole('heading', { name: 'Page introuvable' })).toHaveCount(0);
  await capture(page, '4-ancien-raccourci-crm');
});
