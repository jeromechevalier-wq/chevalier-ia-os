// Module Réseaux sociaux, écran « Relations » chez un client de la plateforme SANS le module Affaires (règles de la plateforme chargées le temps du fichier).
// Le module lit lui-même les activités LinkedIn et les étiquettes : il marche quand Affaires est éteint. Le nom d'une personne n'est alors pas un lien (la fiche n'est pas servie).
// F1 et F5 chez un client : un test chacun, UNE capture dans tests/e2e/captures/reseauxsociaux-relations/ (« -client », « -telephone »). Données fictives uniquement.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, ecrireDocument, estTelephone, listerDocuments, PROJET, FIRESTORE, URL_APP } from './outils.js';

const ALICE = 'alice@exemple.test';
const CAPTURES = 'e2e/captures/reseauxsociaux-relations';
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

// Jour de Paris (le module compte en jour de Paris : un calcul en UTC se trompe d'un jour entre minuit et 1 h ou 2 h à Paris).
const jourIlYa = (n) => new Date(Date.now() - n * 86400000).toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
const personne = (nom, extra = {}) => {
  const maintenant = new Date();
  return {
    nom, prenom: nom.split(' ')[0], nomFamille: nom.split(' ').slice(1).join(' '), organisationId: null, telephones: [], emails: [], emailsNormalises: [], etiquettes: [],
    ville: '', linkedin: '', siteWeb: '', source: '', oppositionProspection: false, dateOpposition: null, archive: false,
    proprietaire: ALICE, creeLe: maintenant, modifieLe: maintenant, creePar: ALICE, modifiePar: ALICE, ...extra,
  };
};
const echange = (id, personneId, n, extra = {}) => ecrireDocument(`clients/reseaux/crm_activites/${id}`, { type: 'linkedin', titre: 'Échange LinkedIn', fait: true, date: jourIlYa(n), dateFait: new Date(), personneId, sens: 'envoye', voix: 1, auteur: ALICE, ...extra });

test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
  await ecrireDocument('marques/reseaux', { actif: true, nom: 'Atelier Réseaux', couleur: '#336699', accueil: 'Bienvenue.' });
  await ecrireDocument(`clients/reseaux/membres/${ALICE}`, { role: 'editeur' });
  await ecrireDocument('clients/reseaux', { modules: { reseauxsociaux: true }, equipe: [{ email: ALICE, role: 'editeur' }] });
});

async function ouvrir(page) {
  await page.goto('about:blank');
  await page.goto(`${URL_APP}#/espace/reseaux/reseauxsociaux/relations`);
  await page.waitForFunction(() => !!window.__chevalierTest);
  await page.evaluate((e) => window.__chevalierTest.connecter(e, true), ALICE);
  await expect(page.locator('.coquille')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Relations', level: 1 })).toBeVisible();
}
async function jeu() {
  await ecrireDocument('clients/reseaux/crm_personnes/p1', personne('Alice Exemple'));
  await ecrireDocument('clients/reseaux/crm_personnes/p2', personne('Bastien Exemple'));
  await ecrireDocument('clients/reseaux/crm_personnes/p3', personne('Chloé Exemple', { etiquettes: ['partenaire'] }));
  await echange('a1', 'p1', 9);
  await echange('a2', 'p2', 2, { sens: 'recu' });
}

test('F1 sans Affaires, les relations se lisent quand même : bonne colonne, badges, et le nom n’est pas un lien (la fiche n’est pas servie)', async ({ page }) => {
  await jeu();
  await ouvrir(page);
  await expect(page.locator('[data-colonne="en_attente"] [data-personne="p1"] [data-badge="relancer"]')).toHaveText('À relancer · 9 j');
  await expect(page.locator('[data-colonne="a_ecrire"] [data-personne="p2"] [data-badge="repondre"]')).toHaveText('À répondre');
  await expect(page.locator('[data-colonne="a_ecrire"] [data-personne="p3"]')).toBeVisible(); // Partenaire, sans activité
  await expect(page.locator('.carte-relation a')).toHaveCount(0);
  await expect(page.locator('.carte-relation .carte-nom').first()).toBeVisible();
  await capture(page, 'F1-sans-affaires');
});

test('F5 sans Affaires : « Créer les catégories » relit le document frais, laisse les étiquettes existantes intactes, un seul lot du Journal au chemin du client', async ({ page }) => {
  await jeu();
  const existantes = [{ id: 'partenaire', nom: 'Partenaire', couleur: '#b98ee0', ordre: 1 }, { id: 'etiquette_a_moi', nom: 'Ma propre étiquette', couleur: '#3fbf7f', ordre: 2 }];
  await ecrireDocument('clients/reseaux/crm_parametres/etiquettes', { items: existantes });
  await ouvrir(page);
  const bandeau = page.locator('[data-role="bandeau-categories"]');
  await expect(bandeau).toContainText('Les catégories ne sont pas encore créées.');
  await capture(page, 'F5-bandeau');
  await bandeau.locator('[data-action="creer-categories"]').click();
  await page.locator('.voile-dialogue').getByRole('button', { name: 'Créer les catégories' }).click();
  await expect(bandeau).toHaveCount(0);
  const doc = (await listerDocuments('clients/reseaux/crm_parametres')).find((d) => d.id === 'etiquettes');
  expect(doc.items.slice(0, 2)).toEqual(existantes); // intactes
  expect(doc.items.map((e) => e.id)).toEqual(['partenaire', 'etiquette_a_moi', 'cible', 'relais', 'hors_cible', 'a_classer']);
  expect((await listerDocuments('clients/reseaux/crm_audit')).filter((d) => d.docId === 'etiquettes').length).toBe(1);
  expect((await listerDocuments('crm_audit')).length, 'rien n’est écrit à la racine').toBe(0);
  await expect(page.locator('[data-personne="p3"] [data-categorie="partenaire"]')).toHaveText('Partenaire'); // la vraie étiquette lue
});

test('F5 sans document d’étiquettes (Affaires jamais ouvert) : le bandeau dit que les catégories ne sont pas disponibles, sans bouton, et rien n’est écrit', async ({ page }) => {
  await jeu();
  await ouvrir(page);
  await expect(page.locator('[data-role="categories-indisponibles"]')).toHaveText('Les catégories ne sont pas disponibles pour le moment.');
  await expect(page.locator('[data-action="creer-categories"]')).toHaveCount(0);
  await expect(page.locator('.carte-relation')).toHaveCount(3); // les relations marchent quand même
  expect((await listerDocuments('clients/reseaux/crm_parametres')).length).toBe(0);
  expect((await listerDocuments('clients/reseaux/crm_audit')).length).toBe(0);
  await capture(page, 'F5-indisponible');
});
