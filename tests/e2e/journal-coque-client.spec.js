// Journal commun dans la coque (11/11/2026), chez un client de la plateforme (règles de la plateforme chargées le temps du fichier).
// A4 : un client SANS le module Affaires ouvre le Journal par le menu compte et par l'adresse #/espace/<client>/journal ; A5 : un client AVEC Affaires garde #/crm/journal.
// Un test par critère, UNE capture chacun dans tests/e2e/captures/journal-coque/ (« -client », « -telephone »).
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, ecrireDocument, estTelephone, ouvrirMenuUtilisateur, listerDocuments, PROJET, FIRESTORE, URL_APP } from './outils.js';

const ALICE = 'alice@exemple.test';
const CAPTURES = 'e2e/captures/journal-coque';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}-client${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });

async function chargerRegles(fichier) {
  const contenu = await readFile(fileURLToPath(new URL(`../../${fichier}`, import.meta.url)), 'utf8');
  const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: fichier, content: contenu }] } }),
  });
  if (!r.ok) throw new Error(`Règles non chargées (${fichier}) : ${await r.text()}`);
}
test.beforeAll(() => chargerRegles('firestore.plateforme.rules'));
test.afterAll(() => chargerRegles('firestore.rules'));

test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
  for (const [id, nom, modules] of [
    ['soloassistant', 'Atelier Assistant', { mcp: true }],
    ['cabinet', 'Cabinet Exemple', { affaires: true }],
  ]) {
    await ecrireDocument(`marques/${id}`, { actif: true, nom, couleur: '#336699', accueil: 'Bienvenue.' });
    await ecrireDocument(`clients/${id}/membres/${ALICE}`, { role: 'editeur' });
    await ecrireDocument(`clients/${id}`, { modules, equipe: [{ email: ALICE, role: 'editeur' }] });
  }
});

async function ouvrir(page, client, reste = '') {
  await page.goto('about:blank');
  await page.goto(`${URL_APP}#/espace/${client}${reste ? `/${reste}` : ''}`);
  await page.waitForFunction(() => !!window.__chevalierTest);
  await page.evaluate((e) => window.__chevalierTest.connecter(e, true), ALICE);
  await expect(page.locator('.coquille')).toBeVisible();
}
const lignes = (page) => page.locator('.tableau-journal tbody tr');

test('A4 client sans Affaires : « Voir le journal des modifications » est dans le menu compte et mène à #/espace/<client>/journal, qui affiche le Journal (ligne d’une opération, cas vide compris)', async ({ page }) => {
  await ouvrir(page, 'soloassistant');
  await ouvrirMenuUtilisateur(page);
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Voir le journal des modifications' }).click();
  await expect(page).toHaveURL(/#\/espace\/soloassistant\/journal$/);
  await expect(page.getByRole('heading', { name: 'Journal des modifications', level: 1 })).toBeVisible();
  await expect(page.getByText('Le journal est vide : rien n’a encore été écrit.')).toBeVisible();
  // une opération faite par cet espace (écrite par le journal de la coque, sous clients/<client>/) apparaît dans l'écran
  await page.evaluate(async () => (await import('/js/os/journal-donnees.js')).executer([{ type: 'creer', collection: 'crm_notes', id: 'n-client', donnees: { texte: 'Note exemple' } }], 'essai-client'));
  await page.locator('[data-action="actualiser-journal"]').click();
  await expect(lignes(page)).toHaveCount(1);
  expect((await listerDocuments('clients/soloassistant/crm_audit')).length).toBe(1);
  expect((await listerDocuments('clients/soloassistant/crm_audit_avant')).length).toBe(1);
  expect((await listerDocuments('crm_audit')).length, 'rien n’est écrit à la racine').toBe(0);
  await capture(page, 'A4-journal');
});

test('A5 client avec Affaires : l’ancienne adresse #/espace/<client>/crm/journal affiche toujours le Journal, et l’entrée du menu compte mène à #/espace/<client>/journal', async ({ page }) => {
  await ouvrir(page, 'cabinet', 'crm/journal');
  await expect(page.getByRole('heading', { name: 'Journal des modifications', level: 1 })).toBeVisible();
  await ouvrirMenuUtilisateur(page);
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Voir le journal des modifications' }).click();
  await expect(page).toHaveURL(/#\/espace\/cabinet\/journal$/);
  await expect(page.getByRole('heading', { name: 'Journal des modifications', level: 1 })).toBeVisible();
  await capture(page, 'A5-journal');
});
