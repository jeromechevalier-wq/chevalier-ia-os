// Maison d'un client (27/11/2026) : les pages techniques (Réglages > Déploiement, Mes tests, Connexion à la base, et le Journal des modifications ;
// « Modules actifs » n'en fait plus partie : un compte client y voit ses seuls modules allumés, tests/e2e/applications-coque.spec.js)
// sont réservées au titulaire (comptes_jerome_seul de reglages_maison/ecran). Chez Jérôme (maison sans champ neutre) et sur la plateforme des clients : rien ne change.
// Un test par critère (le nom commence par son numéro), une capture par critère dans tests/e2e/captures/maison-pages-techniques/ (nommée avec le projet).
// Comptes des parcours (outils.js) : JEROME est le titulaire ; CHARLES est un autre compte autorisé (ici : le compte du client). Logique : tests/maison-pages-techniques.test.js.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, estTelephone, ouvrirMenuUtilisateur, ecrireDocument, JEROME, CHARLES, PROJET, FIRESTORE, URL_APP, ECRAN_PARCOURS } from './outils.js';
import { semerFicheEmulateur } from '../_fiche-emulateur.js';

const DOSSIER = fileURLToPath(new URL('./captures/maison-pages-techniques/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' });
const HOTE = new URL(FIRESTORE).host;
const semerMaisonClient = () => semerFicheEmulateur({ projet: PROJET, hote: HOTE, document: 'ecran', fiche: { ...ECRAN_PARCOURS, configuration_crm: 'neutre' } });
const TECHNIQUES = ['deploiement', 'tests', 'base'];

const sectionsEspace = (page) => page.locator('.reglages-menu-lien[data-type="espace"]').evaluateAll((els) => els.map((e) => e.dataset.reglage));
const sectionsModules = (page) => page.locator('.reglages-menu-lien[data-type="module"]').evaluateAll((els) => els.map((e) => e.dataset.reglage));
async function ouvrirReglages(page, email) {
  await connecter(page, email, { attendreAccueil: false, route: 'reglages' });
  await expect(page.locator('.page-reglages-menu')).toBeVisible();
}
/** Adresse tapée à la main dans la même page (seul le # change : pas de rechargement, la session reste ouverte). */
const taper = (page, route) => page.evaluate((r) => { location.hash = `#/${r}`; }, route);
async function ouvrirMenuReglagesTelephone(page) {
  if (estTelephone(page)) await page.locator('.reglages-menu-bouton').click();
}
async function entreesMenuCompte(page) {
  await ouvrirMenuUtilisateur(page);
  const t = await page.locator('.menu-pop [role="menuitem"]').allTextContents();
  return t.map((x) => x.trim());
}

test.describe('maison et racine (règles de Jérôme)', () => {
  test('1 maison d’un client, compte client : Réglages limités à « Mon espace » et « Modules actifs » (et aux réglages des modules), pas de Journal dans le menu du compte', async ({ page }, info) => {
    await semerMaisonClient();
    await ouvrirReglages(page, CHARLES);
    await expect(page.locator('[data-reglages="espace:espace"]')).toBeVisible();
    expect(await sectionsEspace(page)).toEqual(['espace', 'modules']);
    expect((await sectionsModules(page)).length).toBeGreaterThan(0); // réglages des modules (sauvegardes, etc.) : inchangés
    await ouvrirMenuReglagesTelephone(page);
    await capturer(page, info, '1-client-reglages-mon-espace');
    if (estTelephone(page)) await page.locator('.reglages-menu-bouton').click();
    const entrees = await entreesMenuCompte(page);
    expect(entrees).toContain('Réglages');
    expect(entrees).not.toContain('Voir le journal des modifications');
  });

  test('2 maison d’un client, compte client : les adresses des pages techniques tapées à la main ne montrent pas la page', async ({ page }, info) => {
    await semerMaisonClient();
    await ouvrirReglages(page, CHARLES);
    for (const id of TECHNIQUES) {
      await taper(page, `reglages/${id}`);
      await expect(page).toHaveURL(/#\/reglages$/); // section cachée : retour à la page d'arrivée, « Mon espace »
      await expect(page.locator('[data-reglages="espace:espace"]')).toBeVisible();
      await expect(page.locator(`[data-reglages="espace:${id}"]`)).toHaveCount(0);
    }
    await taper(page, 'journal');
    await expect(page.locator('[data-role="page-introuvable"] h1')).toHaveText('Page introuvable');
    await expect(page.getByRole('heading', { name: 'Journal des modifications' })).toHaveCount(0);
    await capturer(page, info, '2-client-journal-introuvable');
    await page.locator('[data-role="page-introuvable"] a', { hasText: 'Retour à l' }).click();
    await expect(page).toHaveURL(/#\/crm\/accueil$/);
    await taper(page, 'crm/journal'); // ancienne adresse du Journal (module Affaires) : cachée aussi
    await expect(page.locator('[data-role="page-introuvable"] h1')).toHaveText('Page introuvable');
    await expect(page.getByRole('heading', { name: 'Journal des modifications' })).toHaveCount(0);
  });

  test('3 maison d’un client, compte titulaire : tout reste visible (sections techniques et Journal)', async ({ page }, info) => {
    await semerMaisonClient();
    await ouvrirReglages(page, JEROME);
    expect(await sectionsEspace(page)).toEqual(['espace', 'modules', ...TECHNIQUES]);
    await taper(page, 'reglages/modules'); // « Modules actifs » (Déploiement et Mes tests appellent des fonctions du serveur, absentes des émulateurs)
    await expect(page.locator('[data-reglages="espace:modules"]')).toBeVisible();
    await ouvrirMenuReglagesTelephone(page);
    await capturer(page, info, '3-titulaire-reglages-complets');
    if (estTelephone(page)) await page.locator('.reglages-menu-bouton').click();
    expect(await entreesMenuCompte(page)).toContain('Voir le journal des modifications');
    await page.keyboard.press('Escape');
    await taper(page, 'journal');
    await expect(page.getByRole('heading', { name: 'Journal des modifications', level: 1 })).toBeVisible();
    await taper(page, 'crm/journal');
    await expect(page).toHaveURL(/#\/crm\/journal$/);
    await expect(page.getByRole('heading', { name: 'Journal des modifications', level: 1 })).toBeVisible();
  });

  test('4a chez Jérôme (maison sans champ neutre) : inchangé — un autre compte voit encore Modules actifs, Déploiement, Mes tests et le Journal', async ({ page }, info) => {
    await ouvrirReglages(page, CHARLES); // ECRAN_PARCOURS : sans configuration_crm
    expect(await sectionsEspace(page)).toEqual(['espace', 'modules', 'deploiement', 'tests']);
    await taper(page, 'reglages/modules'); // « Modules actifs » (Déploiement et Mes tests appellent des fonctions du serveur, absentes des émulateurs)
    await expect(page.locator('[data-reglages="espace:modules"]')).toBeVisible();
    await taper(page, 'journal');
    await expect(page.getByRole('heading', { name: 'Journal des modifications', level: 1 })).toBeVisible();
    await capturer(page, info, '4a-chez-jerome-journal');
    await taper(page, 'crm/journal');
    await expect(page).toHaveURL(/#\/crm\/journal$/);
    await expect(page.getByRole('heading', { name: 'Journal des modifications', level: 1 })).toBeVisible();
    expect(await entreesMenuCompte(page)).toContain('Voir le journal des modifications');
  });

  test('4b chez Jérôme, titulaire : inchangé — les cinq sections, Connexion à la base comprise', async ({ page }) => {
    await ouvrirReglages(page, JEROME);
    expect(await sectionsEspace(page)).toEqual(['espace', 'modules', ...TECHNIQUES]);
  });

  test('5 téléphone : compte client d’une maison, le menu des Réglages ne propose que « Mon espace » et « Modules actifs », le Journal est introuvable', async ({ page }, info) => {
    test.skip(!estTelephone(page), 'parcours propre au format téléphone');
    await semerMaisonClient();
    await ouvrirReglages(page, CHARLES);
    await page.locator('.reglages-menu-bouton').click();
    await expect(page.locator('.reglages-menu-lien[data-type="espace"]')).toHaveText(['Mon espace', 'Modules actifs']);
    await capturer(page, info, '5-telephone-menu-reglages');
    await taper(page, 'reglages/tests');
    await expect(page).toHaveURL(/#\/reglages$/);
    await taper(page, 'journal');
    await expect(page.locator('[data-role="page-introuvable"]')).toBeVisible();
  });
});

// Plateforme des clients : règles de la plateforme chargées le temps de ce groupe (comme tests/e2e/journal-coque-client.spec.js).
async function chargerRegles(fichier) {
  const contenu = await readFile(fileURLToPath(new URL(`../../${fichier}`, import.meta.url)), 'utf8');
  const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: fichier, content: contenu }] } }),
  });
  if (!r.ok) throw new Error(`Règles non chargées (${fichier}) : ${await r.text()}`);
}

test.describe('plateforme des clients', () => {
  const ALICE = 'alice@exemple.test';
  test.beforeAll(() => chargerRegles('firestore.plateforme.rules'));
  test.afterAll(() => chargerRegles('firestore.rules'));
  test.beforeEach(async ({ context }) => {
    await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
    await ecrireDocument('marques/cabinet', { actif: true, nom: 'Cabinet Exemple', couleur: '#336699', accueil: 'Bienvenue.' });
    await ecrireDocument(`clients/cabinet/membres/${ALICE}`, { role: 'editeur' });
    await ecrireDocument('clients/cabinet', { modules: { affaires: true }, equipe: [{ email: ALICE, role: 'editeur' }] });
  });

  test('4c plateforme des clients : inchangé — un éditeur voit Membres, Modules actifs, Déploiement, Mes tests et le Journal', async ({ page }, info) => {
    await page.goto('about:blank');
    await page.goto(`${URL_APP}#/espace/cabinet/reglages`);
    await page.waitForFunction(() => !!window.__chevalierTest);
    await page.evaluate((e) => window.__chevalierTest.connecter(e, true), ALICE);
    await expect(page.locator('.page-reglages-menu')).toBeVisible();
    expect(await sectionsEspace(page)).toEqual(['espace', 'membres', 'modules', 'deploiement', 'tests']);
    await capturer(page, info, '4c-plateforme-inchangee');
    expect(await entreesMenuCompte(page)).toContain('Voir le journal des modifications');
  });
});
