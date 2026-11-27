// Module Rendez-vous, brief E, chez un client : un LECTEUR voit le bilan « Prêt à passer en vrai ? » (règles de la plateforme chargées le temps du fichier). Il ne peut lire ni « branché » ni le solde :
// ses cases dépendantes du serveur sont grises « indisponible », les autres se lisent normalement, et il n'a aucun bouton d'écriture (pas d'« Actualiser », seuils grisés). Captures : tests/e2e/captures/rdv-bilan/.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, ecrireDocument, estTelephone, ouvrirSectionReglages, choisirDansMenuUtilisateur, PROJET, FIRESTORE, URL_APP, connecterDansEspace } from './outils.js';

const LEA = 'lea@exemple.test';
const ALICE = 'alice@exemple.test';
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
async function chargerRegles(fichier) {
  const contenu = await readFile(fileURLToPath(new URL(`../../${fichier}`, import.meta.url)), 'utf8');
  const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: fichier, content: contenu }] } }) });
  if (!r.ok) throw new Error(`Règles non chargées (${fichier}) : ${await r.text()}`);
}
test.beforeAll(() => chargerRegles('firestore.plateforme.rules'));
test.afterAll(() => chargerRegles('firestore.rules'));

test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
  await ecrireDocument('marques/atelier', { actif: true, nom: 'Atelier Test', couleur: '#336699', accueil: 'Bienvenue.' });
  await ecrireDocument('clients/atelier', { modules: { rdv: true }, equipe: [{ email: ALICE, role: 'editeur' }, { email: LEA, role: 'lecteur' }] });
  await ecrireDocument(`clients/atelier/membres/${ALICE}`, { role: 'editeur' });
  await ecrireDocument(`clients/atelier/membres/${LEA}`, { role: 'lecteur' });
  await ecrireDocument('clients/atelier/rdv_parametres/reglages', { numerosAlerte: [{ id: 'n1', libelle: 'Mobile', numero: '+33600000001', actif: true }], numeroTest: '+33600000002' });
});

test('E3-7 un lecteur voit le bilan : cases du serveur grises « indisponible », cases locales lisibles, aucun bouton d’écriture, seuils grisés', async ({ page }, info) => {
  info.annotations.push({ type: 'erreurs-reseau-attendues', description: 'rdvEtat refuse un lecteur (403)' });
  let demandesSolde = 0;
  await page.route(/cloudfunctions\.net\/rdvEtat$/, (route) => (route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS })
    : route.fulfill({ status: 403, headers: CORS, contentType: 'application/json', body: JSON.stringify({ error: { status: 'PERMISSION_DENIED', message: 'Action non autorisée.' } }) })));
  await page.route(/cloudfunctions\.net\/rdvEnvoyer$/, (route) => { demandesSolde += 1; return route.fulfill({ status: 403, headers: CORS, contentType: 'application/json', body: '{}' }); });
  await page.goto('about:blank');
  await page.goto(`${URL_APP}#/espace/atelier`);
  await connecterDansEspace(page, LEA);
  await expect(page.locator('.coquille')).toBeVisible();
  await choisirDansMenuUtilisateur(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Rendez-vous');
  const carte = page.locator('#reglages-rdv-bilan');
  for (const id of ['connexion', 'adresse', 'solde']) {
    await expect(carte.locator(`[data-role="bilan-${id}"]`)).toHaveAttribute('data-etat', 'gris');
    await expect(carte.locator(`[data-role="bilan-${id}"]`)).toContainText('Indisponible avec ton compte (lecture seule)');
  }
  for (const id of ['numero-test', 'mode-test', 'alertes']) await expect(carte.locator(`[data-role="bilan-${id}"]`)).toHaveAttribute('data-etat', 'vert');
  await expect(carte.getByRole('button')).toHaveCount(0); // aucun bouton, « Actualiser » compris
  await expect(page.locator('#reglages-rdv-solde [data-seuil]').first()).toBeDisabled();
  expect(demandesSolde).toBe(0); // le lecteur ne demande jamais le solde
  if (!estTelephone(page)) await page.screenshot({ path: 'e2e/captures/rdv-bilan/lecteur.png', animations: 'disabled' });
});

test('D2-1 un lecteur voit la liste des numéros désinscrits (masqués) mais aucun bouton « Réautoriser »', async ({ page }, info) => {
  info.annotations.push({ type: 'erreurs-reseau-attendues', description: 'rdvEtat refuse un lecteur (403)' });
  await ecrireDocument('clients/atelier/rdv_parametres/desinscrits', { numeros: ['+33600000009'] });
  await page.route(/cloudfunctions\.net\/rdvEtat$/, (route) => (route.request().method() === 'OPTIONS' ? route.fulfill({ status: 204, headers: CORS })
    : route.fulfill({ status: 403, headers: CORS, contentType: 'application/json', body: '{}' })));
  await page.goto('about:blank');
  await page.goto(`${URL_APP}#/espace/atelier`);
  await connecterDansEspace(page, LEA);
  await expect(page.locator('.coquille')).toBeVisible();
  await choisirDansMenuUtilisateur(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Rendez-vous');
  const carte = page.locator('#reglages-rdv-desinscrits');
  await expect(carte.locator('[data-role="desinscrit"]')).toHaveCount(1);
  await expect(carte).toContainText('06 •• •• •• 09');
  await expect(carte.getByRole('button')).toHaveCount(0);
});
