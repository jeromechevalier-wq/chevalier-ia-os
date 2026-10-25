// Réglages > Déploiement (25/10/2026) : la liste des étapes d'un déploiement et leur état dans l'espace, chez Jérôme (racine) et chez un client.
// La fonction du serveur (deploiementVerifier) et le stockage (essai CORS) sont SIMULÉS par page.route : aucun appel réseau réel. Le vrai serveur est essayé à part
// (tests/deploiement-fonction.test.js). Un test par critère d'acceptation (le nom commence par son numéro) ; captures dans tests/e2e/captures/deploiement/.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, lireDocument, estTelephone, PROJET, FIRESTORE, URL_APP, JEROME } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/deploiement/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: true, animations: 'disabled' });
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' };
const OK = { ok: true, version: '2.4.1', controles: { fonctions: 'ok', membres: 'ok' } };
const ENTREPRISE = {
  nom: 'Entreprise Essai', siret: '12345678900011', adresse: { ligne1: '1 rue de l’Essai', codePostal: '75001', ville: 'Paris' }, telephone: '0100000000',
  assurance: { garantie: 'Décennale', assureur: 'Assureur Essai' }, mediateur: { nom: 'Médiateur Essai', site: 'https://mediateur.exemple' },
};

/** Faux serveur : `reponses` = réponses successives de deploiementVerifier (la dernière se répète) ; `null` = panne (réseau coupé). `cors` : 'ok' ou 'bloque'. */
async function simuler(page, { reponses = [OK], cors = 'ok' } = {}) {
  const etat = { appels: [], corps: [] };
  await page.route('**/deploiementVerifier', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    etat.corps.push(JSON.parse(route.request().postData() || '{}').data);
    const r = reponses[Math.min(etat.appels.length, reponses.length - 1)];
    etat.appels.push(r);
    if (r === null) return route.abort('connectionfailed');
    return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify({ result: r }) });
  });
  await page.context().route('https://storage.googleapis.com/**', (route) => (cors === 'ok'
    ? route.fulfill({ status: 200, headers: { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'text/plain' }, body: '' })
    : route.abort('failed')));
  return etat;
}
const ligne = (page, id) => page.locator(`.deploiement-ligne[data-etape="${id}"]`);
const resume = (page) => page.locator('[data-role="resume"]');
async function ouvrirRacine(page) {
  await connecter(page, JEROME, { route: 'reglages/deploiement' });
  await expect(page.locator('#reglages-deploiement')).toBeVisible();
  await expect(resume(page)).not.toContainText('Vérification');
  await attendreCalme(page);
}
async function toutRegler() {
  await ecrireDocument('crm_parametres/reglages', { dossierParentDrive: { id: 'dossier-essai', nom: 'Projets essai' } });
  await ecrireDocument('devis_parametres/reglages', { entreprise: ENTREPRISE, etapeDevis: 'proposition_envoyee' });
  const maintenant = new Date();
  await ecrireDocument('devis_articles/a1', { code: '', libelle: 'Article essai', unite: 'u', prixAchat: 10, tauxTva: null, actif: true, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, creePar: JEROME, modifiePar: JEROME });
}

test('1 Réglages > Déploiement chez Jérôme : une ligne par étape avec pastille ET texte, regroupées Avant / Pendant / Réglages Google / Après, résumé en tête', async ({ page }, info) => {
  const serveur = await simuler(page);
  await toutRegler();
  await ouvrirRacine(page);
  await expect(page.locator('.reglages-menu-lien[data-reglage="deploiement"]')).toHaveText('Déploiement');
  await expect(page.locator('.deploiement-groupe h3')).toHaveText(['Avant la séance', 'Pendant la séance', 'Réglages Google du projet', 'Après la séance']);
  // Toutes les lignes automatiques sont vertes, les manuelles grises « À vérifier à la main » : 7 sur 23 (2 du serveur, 1 des Affaires, 4 du Devis ; 16 manuelles)
  await expect(page.locator('.deploiement-ligne')).toHaveCount(23);
  await expect(page.locator('.deploiement-ligne[data-type="auto"][data-couleur="vert"]')).toHaveCount(7);
  await expect(resume(page)).toHaveText('7 sur 23 vertes');
  await expect(ligne(page, 'devis-entreprise').locator('[data-role="etat"]')).toHaveText('Vérifié');
  await expect(ligne(page, 'bienvenue').locator('[data-role="etat"]')).toHaveText('À vérifier à la main');
  for (const l of await page.locator('.deploiement-ligne').all()) await expect(l.locator('.deploiement-pastille')).toBeVisible();
  // La fonction est appelée sans paramètre à la racine ; rien de secret ni de nom de dossier à l'écran
  expect(serveur.corps[0]).toEqual({});
  await expect(page.locator('#reglages-deploiement')).not.toContainText('Projets essai');
  await expect(page.locator('#reglages-deploiement')).not.toContainText('CRM');
  await capturer(page, info, '1-racine-tout-regle');
});

test('3 une case rouge dit comment réparer, avec le lien exact (réglage de l’appli, mode d’emploi ou console Google)', async ({ page }, info) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'essai CORS bloqué exprès : le navigateur note la lecture refusée dans sa console' });
  await simuler(page, { cors: 'bloque' });
  await ouvrirRacine(page);
  for (const id of ['dossier-drive', 'devis-entreprise', 'devis-etape', 'devis-catalogue', 'devis-cors']) {
    await expect(ligne(page, id)).toHaveAttribute('data-couleur', 'rouge');
    await expect(ligne(page, id).locator('[data-role="etat"]')).toHaveText('À réparer');
    await expect(ligne(page, id).locator('[data-role="reparation"]')).toBeVisible();
  }
  await expect(ligne(page, 'dossier-drive').locator('[data-role="lien-reparation"]')).toHaveAttribute('href', /#\/reglages\/crm\/reglages-options$/);
  await expect(ligne(page, 'devis-entreprise').locator('[data-role="lien-reparation"]')).toHaveAttribute('href', /#\/reglages\/devis\/reglages-entreprise$/);
  await expect(ligne(page, 'devis-cors').locator('[data-role="lien-reparation"]')).toHaveAttribute('href', 'https://github.com/jeromechevalier-wq/chevalier-ia-os/blob/main/docs/cors-stockage-pdf.md');
  await expect(ligne(page, 'devis-gmail-api').locator('[data-role="lien-reparation"]')).toHaveAttribute('href', 'https://console.cloud.google.com/apis/library/gmail.googleapis.com?project=chevalier-ia-os'); // le projet Google de l'espace (firebase-config), pas celui des émulateurs
  await expect(resume(page)).toHaveAttribute('data-global', 'rouge');
  await ligne(page, 'devis-cors').scrollIntoViewIfNeeded();
  await capturer(page, info, '3-racine-rouge');
  // Le lien « Ouvrir le réglage » mène bien au réglage
  await ligne(page, 'devis-entreprise').locator('[data-role="lien-reparation"]').click();
  await expect(page).toHaveURL(/#\/reglages\/devis\/reglages-entreprise$/);
});

test('4 « C’est fait » : la case manuelle devient verte avec la date, compte dans le résumé, reste après rechargement ; seul { fait, le } est enregistré', async ({ page }) => {
  await simuler(page);
  await toutRegler();
  await ouvrirRacine(page);
  const caseBienvenue = ligne(page, 'bienvenue').getByRole('checkbox', { name: 'C’est fait : E-mail de bienvenue envoyé' });
  await caseBienvenue.check();
  const date = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris' }).format(new Date());
  await expect(ligne(page, 'bienvenue')).toHaveAttribute('data-couleur', 'vert');
  await expect(ligne(page, 'bienvenue').locator('[data-role="etat"]')).toHaveText(`Fait le ${date}`);
  await expect(resume(page)).toHaveText('8 sur 23 vertes');
  await expect.poll(async () => (await lireDocument('crm_parametres/deploiement'))?.bienvenue?.fait).toBe(true);
  expect(Object.keys((await lireDocument('crm_parametres/deploiement')).bienvenue).sort()).toEqual(['fait', 'le']);
  await page.reload();
  await expect(ligne(page, 'bienvenue')).toHaveAttribute('data-couleur', 'vert');
  await ligne(page, 'bienvenue').getByRole('checkbox').uncheck();
  await expect(ligne(page, 'bienvenue')).toHaveAttribute('data-couleur', 'gris');
  await expect.poll(async () => (await lireDocument('crm_parametres/deploiement'))?.bienvenue).toBeUndefined();
});

test('5 « Revérifier » relance les contrôles : une case rouge devient verte une fois réparée', async ({ page }) => {
  const serveur = await simuler(page, { reponses: [{ ...OK, controles: { fonctions: 'ok', membres: 'manque' } }, OK] });
  await toutRegler();
  await ouvrirRacine(page);
  await expect(ligne(page, 'membres')).toHaveAttribute('data-couleur', 'rouge');
  await page.locator('[data-action="reverifier"]').click();
  await expect(ligne(page, 'membres')).toHaveAttribute('data-couleur', 'vert');
  expect(serveur.appels.length).toBe(2);
});

test('6 cas d’erreur : serveur injoignable = « Impossible de vérifier pour le moment » et « Réessayer » ; ses lignes en orange, les autres contrôles et les cases restent utilisables', async ({ page }, info) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'fonction du serveur coupée exprès' });
  const serveur = await simuler(page, { reponses: [null, OK] });
  await toutRegler();
  await ouvrirRacine(page);
  await expect(page.locator('[data-etat="erreur-serveur"]')).toContainText('Impossible de vérifier pour le moment');
  await expect(ligne(page, 'fonctions-serveur')).toHaveAttribute('data-couleur', 'orange');
  await expect(ligne(page, 'fonctions-serveur').locator('[data-role="etat"]')).toHaveText('Impossible de vérifier');
  await expect(ligne(page, 'devis-entreprise')).toHaveAttribute('data-couleur', 'vert'); // un contrôle en panne ne casse pas les autres
  await ligne(page, 'raccourci').getByRole('checkbox').check();
  await expect(ligne(page, 'raccourci')).toHaveAttribute('data-couleur', 'vert');
  await capturer(page, info, '6-erreur-serveur');
  await page.locator('[data-action="reessayer"]').click();
  await expect(page.locator('[data-etat="erreur-serveur"]')).toHaveCount(0);
  await expect(ligne(page, 'fonctions-serveur')).toHaveAttribute('data-couleur', 'vert');
  expect(serveur.appels.length).toBe(2);
});

// ---------------------------------------------------------------- chez un client (règles de la plateforme le temps de ces tests)
test.describe('chez un client', () => {
  const ALICE = 'alice@exemple.test';
  const LEA = 'lea@exemple.test';
  async function chargerRegles(fichier) {
    const contenu = await readFile(fileURLToPath(new URL(`../../${fichier}`, import.meta.url)), 'utf8');
    const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: fichier, content: contenu }] } }) });
    if (!r.ok) throw new Error(`Règles non chargées (${fichier}) : ${await r.text()}`);
  }
  test.beforeAll(() => chargerRegles('firestore.plateforme.rules'));
  test.afterAll(() => chargerRegles('firestore.rules'));
  async function ouvrirClient(page, email) {
    await ecrireDocument('marques/veilleur', { actif: true, nom: 'Atelier Veilleur', couleur: '#336699', accueil: 'Bienvenue.' });
    await ecrireDocument('clients/veilleur', { modules: { veille: true }, equipe: [{ email: ALICE, role: 'editeur' }, { email: LEA, role: 'lecteur' }] });
    await ecrireDocument(`clients/veilleur/membres/${ALICE}`, { role: 'editeur' });
    await ecrireDocument(`clients/veilleur/membres/${LEA}`, { role: 'lecteur' });
    await page.goto('about:blank');
    await page.goto(`${URL_APP}#/espace/veilleur/reglages/deploiement`);
    await page.waitForFunction(() => !!window.__chevalierTest);
    await page.evaluate((e) => window.__chevalierTest.connecter(e, true), email);
    await expect(page.locator('.coquille')).toBeVisible();
  }

  test('7 cas vide : un client sans module à contrôler voit le message clair et les seules étapes communes ; sa case cochée s’enregistre dans SON espace', async ({ page }, info) => {
    const serveur = await simuler(page);
    await ouvrirClient(page, ALICE);
    await expect(page.locator('#reglages-deploiement')).toBeVisible();
    await expect(resume(page)).not.toContainText('Vérification');
    await expect(page.locator('[data-role="vide"]')).toContainText('Aucun module de cet espace n’ajoute de contrôle');
    await expect(page.locator('.deploiement-ligne')).toHaveCount(11);
    await expect(ligne(page, 'devis-cors')).toHaveCount(0);
    await expect(resume(page)).toHaveText('2 sur 11 vertes');
    expect(serveur.corps[0]).toEqual({ client: 'veilleur' });
    await ligne(page, 'connexion').getByRole('checkbox').check();
    await expect.poll(async () => (await lireDocument('clients/veilleur/crm_parametres/deploiement'))?.connexion?.fait).toBe(true);
    await attendreCalme(page);
    await capturer(page, info, '7-client-vide');
  });

  test('8 un lecteur n’a pas la page Déploiement (les contrôles du serveur sont réservés aux éditeurs)', async ({ page }) => {
    await simuler(page);
    await ouvrirClient(page, LEA);
    if (estTelephone(page)) await page.locator('.reglages-menu-bouton').click();
    await expect(page.locator('.reglages-menu-lien[data-reglage="deploiement"]')).toHaveCount(0);
    await expect(page).toHaveURL(/#\/espace\/veilleur\/reglages$/);
  });
});
