// Module Réseaux sociaux (11/11/2026) chez un client de la plateforme (règles de la plateforme chargées le temps du fichier).
// D2 : le module apparaît seulement si la fiche du client le dit, sans aucun autre module ; Buffer n'est pas branché chez un client (message dit) ; les relations marchent
// sans Affaires (le module écoute lui-même les activités LinkedIn) ; `creerCategories` ne touche jamais aux étiquettes existantes quand Affaires est éteint.
// Un test par critère, UNE capture chacun dans tests/e2e/captures/reseauxsociaux-socle/ (« -client », « -telephone »). Données fictives uniquement.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, ecrireDocument, estTelephone, listerDocuments, PROJET, FIRESTORE, URL_APP } from './outils.js';

const ALICE = 'alice@exemple.test';
const CAPTURES = 'e2e/captures/reseauxsociaux-socle';
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
const personne = (nom) => {
  const maintenant = new Date();
  return {
    nom, prenom: nom.split(' ')[0], nomFamille: nom.split(' ').slice(1).join(' '), organisationId: null, telephones: [], emails: [], emailsNormalises: [], etiquettes: [],
    ville: '', linkedin: '', siteWeb: '', source: '', oppositionProspection: false, dateOpposition: null, archive: false,
    proprietaire: ALICE, creeLe: maintenant, modifieLe: maintenant, creePar: ALICE, modifiePar: ALICE,
  };
};

test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
  for (const [id, nom, modules] of [
    ['reseaux', 'Atelier Réseaux', { reseauxsociaux: true }],
    ['veilleseule', 'Veille Seule', { veille: true }],
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
const ouvrirMenu = async (page) => { if (estTelephone(page)) await page.getByRole('button', { name: 'Ouvrir le menu' }).click(); };
/** Fonction `reseauxsociauxBuffer` absente (comme chez un client) : le navigateur reçoit une erreur technique, pas un refus écrit par le serveur. */
async function bufferAbsent(page, statut) {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'la fonction est absente chez un client : le navigateur note l’erreur HTTP dans sa console' });
  const recues = [];
  await page.route(/cloudfunctions\.net\/reseauxsociauxBuffer$/, async (route) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    recues.push(1);
    return route.fulfill({ status: statut, headers: cors, contentType: 'application/json', body: JSON.stringify({ error: { status: statut === 404 ? 'NOT_FOUND' : 'INTERNAL', message: 'x' } }) });
  });
  return recues;
}
const appelerDonnees = (page, fonction, ...args) => page.evaluate(async ([f, a]) => (await import('/js/modules/reseauxsociaux/donnees.js'))[f](...a), [fonction, args]);

test('D2 un client dont la fiche dit modules: { reseauxsociaux: true } voit le module et lui seul (aucun autre module exigé) ; sans le champ, rien ; l’adresse directe est introuvable', async ({ page }) => {
  await bufferAbsent(page, 500);
  await ouvrir(page, 'reseaux');
  await expect(page).toHaveURL(/#\/espace\/reseaux\/reseauxsociaux\/aujourdhui$/);
  await ouvrirMenu(page);
  await expect(page.locator('.menu .menu-entree')).toHaveText(['Réseaux sociaux']);
  if (estTelephone(page)) await page.keyboard.press('Escape');
  await expect(page.getByRole('heading', { name: 'Aujourd’hui', level: 1 })).toBeVisible();
  await expect(page.getByRole('navigation', { name: 'Écrans des réseaux sociaux' }).getByRole('link')).toHaveText(['Aujourd’hui', 'Posts', 'Idées', 'Inspirations', 'Relations', 'Import']);
  await capture(page, 'D2-menu-client');
  // Un autre client (module Veille seul) : pas d'entrée, et l'adresse du module est introuvable.
  await ouvrir(page, 'veilleseule');
  await ouvrirMenu(page);
  await expect(page.locator('.menu').getByRole('link', { name: 'Réseaux sociaux', exact: true })).toHaveCount(0);
  if (estTelephone(page)) await page.keyboard.press('Escape');
  await page.evaluate(() => { location.hash = '#/espace/veilleseule/reseauxsociaux/aujourdhui'; });
  await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
});

for (const statut of [500, 404]) {
  test(`D2 chez un client Buffer n’est pas branché (fonction absente, erreur technique ${statut}) : « Buffer n’est pas branché sur cet espace. » et « Réessayer »`, async ({ page }) => {
    const recues = await bufferAbsent(page, statut);
    await ouvrir(page, 'reseaux', 'reseauxsociaux/aujourdhui');
    await expect(page.locator('[data-carte="creneaux"] [data-role="erreur-buffer"]')).toHaveText('Buffer n’est pas branché sur cet espace.');
    await expect(page.locator('[data-carte="creneaux"] [data-action="reessayer-buffer"]')).toBeVisible();
    await expect(page.locator('[data-carte="relations"] h2')).toBeVisible(); // les relations ne dépendent pas de Buffer
    expect(recues.length).toBeGreaterThan(0);
    if (statut === 500) await capture(page, 'D2-buffer-absent');
  });
}

test('D2 sans Affaires, les relations à traiter se lisent quand même (le module écoute lui-même les activités LinkedIn) ; le nom n’est pas un lien (la fiche n’est pas servie sans Affaires)', async ({ page }) => {
  await bufferAbsent(page, 500);
  await ecrireDocument('clients/reseaux/crm_personnes/p1', personne('Alice Exemple'));
  await ecrireDocument('clients/reseaux/crm_personnes/p2', personne('Bob Exemple'));
  await ecrireDocument('clients/reseaux/crm_activites/a1', { type: 'linkedin', titre: 'Échange LinkedIn', fait: true, date: jourIlYa(10), dateFait: new Date(), personneId: 'p1', sens: 'envoye', voix: 1, auteur: ALICE });
  await ecrireDocument('clients/reseaux/crm_activites/a2', { type: 'linkedin', titre: 'Échange LinkedIn', fait: true, date: jourIlYa(1), dateFait: new Date(), personneId: 'p2', sens: 'recu', voix: 1, auteur: ALICE });
  await ouvrir(page, 'reseaux', 'reseauxsociaux/aujourdhui');
  const lignes = page.locator('[data-role="relations"] .rs-ligne');
  await expect(lignes).toHaveCount(2);
  await expect(lignes.nth(0)).toContainText('Bob Exemple');
  await expect(lignes.nth(0)).toContainText('À répondre');
  await expect(lignes.nth(1)).toContainText('Alice Exemple');
  await expect(lignes.nth(1)).toContainText('À relancer · 10 j');
  await expect(page.locator('[data-role="relations"] a')).toHaveCount(0);
  await capture(page, 'D2-relations-sans-affaires');
});

test('Catégories sans Affaires : le document des étiquettes est relu frais, les étiquettes existantes restent intactes, un seul lot du Journal (au chemin du client)', async ({ page }) => {
  await bufferAbsent(page, 500);
  const existantes = [{ id: 'partenaire', nom: 'Partenaire', couleur: '#b98ee0', ordre: 1 }, { id: 'etiquette_a_moi', nom: 'Ma propre étiquette', couleur: '#3fbf7f', ordre: 2 }];
  await ecrireDocument('clients/reseaux/crm_parametres/etiquettes', { items: existantes });
  await ouvrir(page, 'reseaux', 'reseauxsociaux/aujourdhui');
  const r = await appelerDonnees(page, 'creerCategories');
  expect(r.creees).toEqual(['Cible', 'Relais', 'Hors cible', 'À classer']);
  expect(r.existantes).toEqual(['Partenaire']);
  const doc = (await listerDocuments('clients/reseaux/crm_parametres')).find((d) => d.id === 'etiquettes');
  expect(doc.items.slice(0, 2)).toEqual(existantes); // intactes
  expect(doc.items.map((e) => e.id)).toEqual(['partenaire', 'etiquette_a_moi', 'cible', 'relais', 'hors_cible', 'a_classer']);
  const journal = (await listerDocuments('clients/reseaux/crm_audit')).filter((d) => d.docId === 'etiquettes');
  expect(journal.length).toBe(1);
  expect((await listerDocuments('crm_audit')).length, 'rien n’est écrit à la racine').toBe(0);
  expect((await appelerDonnees(page, 'creerCategories')).creees, 'second appel : rien à ajouter').toEqual([]);
  expect((await listerDocuments('clients/reseaux/crm_audit')).filter((d) => d.docId === 'etiquettes').length).toBe(1);
  await capture(page, 'D2-categories');
});

test('Catégories sans document d’étiquettes (Affaires jamais ouvert) : refus « Ouvre une fois Affaires… », rien n’est écrit', async ({ page }) => {
  await bufferAbsent(page, 500);
  await ouvrir(page, 'reseaux', 'reseauxsociaux/aujourdhui');
  const message = await page.evaluate(async () => {
    try { await (await import('/js/modules/reseauxsociaux/donnees.js')).creerCategories(); return 'aucune erreur'; } catch (e) { return e.message; }
  });
  expect(message).toBe('Ouvre une fois Affaires pour préparer les catégories.');
  expect((await listerDocuments('clients/reseaux/crm_parametres')).length).toBe(0);
  expect((await listerDocuments('clients/reseaux/crm_audit')).length).toBe(0);
  expect(await appelerDonnees(page, 'chargerEtiquettes')).toBeUndefined();
  expect(await page.evaluate(async () => (await import('/js/modules/reseauxsociaux/donnees.js')).etat.etiquettesDisponibles)).toBe(false);
  await capture(page, 'D2-categories-refus');
});
