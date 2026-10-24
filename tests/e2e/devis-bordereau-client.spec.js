// Module Devis chez un client de la plateforme (règles de la plateforme chargées le temps du fichier) : le menu suit les modules actifs, les données sont sous
// clients/<client>/, un lecteur ne peut pas écrire (cas d'erreur du bordereau). Captures (format ordinateur) dans tests/e2e/captures/bordereau/.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  test, expect, ecrireDocument, lireDocument, listerDocuments, estTelephone, ouvrirSectionReglages, choisirDansMenuUtilisateur, attendreCalme, PROJET, FIRESTORE, URL_APP,
} from './outils.js';

const ALICE = 'alice@exemple.test';
const LEA = 'lea@exemple.test';
const BOB = 'bob@exemple.test';
const DOSSIER = fileURLToPath(new URL('./captures/bordereau/', import.meta.url));
async function capturer(page, info, nom) {
  if (info.project.name !== 'ordinateur') return;
  await page.screenshot({ path: `${DOSSIER}${nom}.png`, fullPage: true, animations: 'disabled' });
}

async function chargerRegles(fichier) {
  const contenu = await readFile(fileURLToPath(new URL(`../../${fichier}`, import.meta.url)), 'utf8');
  const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: fichier, content: contenu }] } }),
  });
  if (!r.ok) throw new Error(`Règles non chargées (${fichier}) : ${await r.text()}`);
}
test.beforeAll(() => chargerRegles('firestore.plateforme.rules'));
test.afterAll(() => chargerRegles('firestore.rules'));

test.beforeEach(async () => {
  for (const [id, nom, modules] of [
    ['avecdevis', 'Cabinet Devis', { affaires: true, devis: true }],
    ['sansdevis', 'Cabinet Sans', { affaires: true }],
    ['devissolo', 'Cabinet Solo', { devis: true }], // Devis sans Affaires : refusé
    ['autre', 'Cabinet Autre', { affaires: true, devis: true }],
  ]) {
    await ecrireDocument(`marques/${id}`, { actif: true, nom, couleur: '#336699', accueil: 'Bienvenue.' });
    await ecrireDocument(`clients/${id}`, { modules, equipe: [{ email: ALICE, role: 'editeur' }] });
  }
  for (const c of ['avecdevis', 'sansdevis', 'devissolo']) await ecrireDocument(`clients/${c}/membres/${ALICE}`, { role: 'editeur' });
  await ecrireDocument(`clients/avecdevis/membres/${LEA}`, { role: 'lecteur' });
  await ecrireDocument(`clients/autre/membres/${BOB}`, { role: 'editeur' });
});

async function ouvrir(page, client, email = ALICE, reste = '') {
  await page.goto('about:blank');
  await page.goto(`${URL_APP}#/espace/${client}${reste ? `/${reste}` : ''}`);
  await page.waitForFunction(() => !!window.__chevalierTest);
  await page.evaluate((e) => window.__chevalierTest.connecter(e, true), email);
}
const dialogue = (page) => page.getByRole('dialog');
async function article(chemin, valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument(chemin, { code: '', libelle: 'Article test', unite: 'u', prixAchat: 10, tauxTva: null, actif: true, proprietaire: ALICE, creeLe: maintenant, modifieLe: maintenant, creePar: ALICE, modifiePar: ALICE, ...valeurs });
}
const ligne = (page, libelle) => page.locator('.ligne-article', { hasText: libelle });

test('B1 chez un client, « Devis » est au menu quand le module est actif avec Affaires, et n\'y est pas sans Affaires ni sans le module', { tag: '@sans-telephone' }, async ({ page }, info) => {
  await ouvrir(page, 'avecdevis');
  await expect(page.locator('.coquille')).toBeVisible();
  const elargir = page.getByRole('button', { name: 'Élargir le menu' });
  if (await elargir.count()) await elargir.click();
  await expect(page.locator('.menu .menu-entree')).toHaveText(['Accueil', 'Personnes', 'Organisations', 'Affaires', 'Devis']);
  await page.locator('.menu').getByRole('link', { name: 'Devis', exact: true }).click();
  await expect(page).toHaveURL(/#\/espace\/avecdevis\/devis\/liste$/);
  await page.locator('[data-action="ouvrir-bordereau"]').click();
  await expect(page).toHaveURL(/#\/espace\/avecdevis\/devis\/bordereau$/);
  await expect(page.getByRole('heading', { name: 'Bordereau de prix unitaires', level: 1 })).toBeVisible();
  await expect(page.locator('.etat-vide')).toContainText('Aucun article');
  await capturer(page, info, 'B1-client-menu-devis');
  // sans le module : pas d'entrée, et l'adresse directe est introuvable
  await ouvrir(page, 'sansdevis');
  await expect(page.locator('.coquille')).toBeVisible();
  await expect(page.locator('.menu').getByRole('link', { name: 'Devis', exact: true })).toHaveCount(0);
  await page.evaluate(() => { location.hash = '#/espace/sansdevis/devis/bordereau'; });
  await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
  // Devis sans Affaires : refusé, aucun écran
  await ouvrir(page, 'devissolo');
  await expect(page.getByText("Aucun écran n'est encore activé dans cet espace.")).toBeVisible();
  await expect(page.locator('.coquille')).toHaveCount(0);
  await capturer(page, info, 'B1-client-devis-sans-affaires');
});

test('B2 chez un client, l\'article se crée sous clients/<client>/devis_articles (jamais à la racine), avec sa trace, et un autre client ne le voit pas', { tag: '@sans-telephone' }, async ({ page }) => {
  await ouvrir(page, 'avecdevis', ALICE, 'devis/bordereau');
  await expect(page.locator('.page-devis')).toBeVisible();
  await page.locator('[data-action="nouvel-article"]').click();
  await dialogue(page).getByRole('textbox', { name: 'Libellé' }).fill('Peinture blanche');
  await dialogue(page).getByRole('textbox', { name: /Prix d’achat/ }).fill('8,9');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(ligne(page, 'Peinture blanche')).toBeVisible();
  await expect.poll(async () => (await listerDocuments('clients/avecdevis/devis_articles')).length).toBe(1);
  expect((await listerDocuments('clients/avecdevis/devis_articles'))[0].prixAchat).toBe(8.9);
  expect(await listerDocuments('devis_articles')).toHaveLength(0);
  expect((await listerDocuments('clients/avecdevis/crm_audit')).filter((a) => a.collection === 'devis_articles').map((a) => a.action)).toEqual(['creer']);
  // un autre client (Bob) ne voit aucun article
  await ouvrir(page, 'autre', BOB, 'devis/bordereau');
  await expect(page.locator('.etat-vide')).toContainText('Aucun article');
  await expect(page.locator('.ligne-article')).toHaveCount(0);
});

test('B7 chez un client, les réglages du module s\'enregistrent sous clients/<client>/devis_parametres et le titre suit', { tag: '@sans-telephone' }, async ({ page }, info) => {
  await ouvrir(page, 'avecdevis', ALICE, 'reglages');
  await expect(page.locator('.page-reglages')).toBeVisible();
  await ouvrirSectionReglages(page, 'Devis');
  await expect(page.locator('#reglages-devis')).toBeVisible();
  await page.locator('#devis-nomBordereau').selectOption('Grille tarifaire');
  await page.locator('#devis-modeMarge').selectOption('marge_vente');
  await page.locator('#devis-marge').fill('30');
  await page.locator('#devis-dureeValiditeJours').fill('45');
  await page.locator('[data-action="enregistrer-reglages-devis"]').click();
  await expect(page.locator('.toast')).toContainText('Réglages des devis enregistrés');
  await expect.poll(async () => (await lireDocument('clients/avecdevis/devis_parametres/reglages'))?.dureeValiditeJours).toBe(45);
  expect(await lireDocument('devis_parametres/reglages')).toBeNull();
  await capturer(page, info, 'B7-client-reglages');
  await page.evaluate(() => { location.hash = '#/espace/avecdevis/devis/bordereau'; });
  await expect(page.getByRole('heading', { name: 'Grille tarifaire', level: 1 })).toBeVisible();
});

test('B10 cas d\'erreur : un lecteur ne peut pas écrire ; le message dit quoi faire, la liste précédente reste, les réglages sont en lecture seule', { tag: '@sans-telephone' }, async ({ page }, info) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues' }); // le SDK note dans la console une écriture refusée par les règles
  await article('clients/avecdevis/devis_articles/a1', { libelle: 'Carrelage', prixAchat: 10 });
  await ouvrir(page, 'avecdevis', LEA, 'devis/bordereau');
  await expect(ligne(page, 'Carrelage')).toBeVisible();
  // création refusée : la fenêtre reste ouverte avec le message
  await page.locator('[data-action="nouvel-article"]').click();
  await dialogue(page).getByRole('textbox', { name: 'Libellé' }).fill('Peinture');
  await dialogue(page).getByRole('textbox', { name: /Prix d’achat/ }).fill('5');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialogue(page).locator('[data-erreur="general"]')).toContainText('Enregistrement impossible : ton compte n’a peut-être que le droit de lire cet espace');
  await expect(dialogue(page).locator('[data-erreur="general"]')).toContainText('demande à un éditeur');
  await capturer(page, info, 'B10-erreur-ecriture-refusee');
  await page.keyboard.press('Escape');
  await expect(ligne(page, 'Peinture')).toHaveCount(0);
  expect(await listerDocuments('clients/avecdevis/devis_articles')).toHaveLength(1);
  // modification sur place refusée : le message est sous le champ, Échap rend la valeur d'avant
  const cellule = page.locator('.ligne-article[data-id="a1"] [data-colonne="prixAchat"]');
  await cellule.locator('button').click();
  await cellule.locator('input').fill('99');
  await cellule.locator('input').press('Enter');
  await expect(cellule.locator('[data-erreur="prixAchat"]')).toContainText('Enregistrement impossible');
  await cellule.locator('input').press('Escape');
  await expect(cellule).toHaveText('10,00 €');
  expect((await lireDocument('clients/avecdevis/devis_articles/a1')).prixAchat).toBe(10);
  // désactivation refusée : message d'erreur, l'article reste
  await ligne(page, 'Carrelage').locator('[data-action="desactiver"]').click();
  await dialogue(page).getByRole('button', { name: 'Désactiver' }).click();
  await expect(page.locator('.toast')).toContainText('Désactivation impossible');
  await expect(ligne(page, 'Carrelage')).toBeVisible();
  expect((await lireDocument('clients/avecdevis/devis_articles/a1')).actif).toBe(true);
  // réglages : lecture seule
  await choisirDansMenuUtilisateur(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Devis');
  await expect(page.locator('#devis-marge')).toBeDisabled();
  await attendreCalme(page);
  if (estTelephone(page)) await page.keyboard.press('Escape');
});
