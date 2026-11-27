// Maison d'un client (26/11/2026) : reglages_maison/public peut porter nom_espace et connexion_neutre (facultatifs, lus AVANT la connexion).
// Page de connexion neutre (ni portrait de Charles, ni « Jérôme et Charles », ni « Chevalier IA OS ») et nom de l'espace = nom_espace partout après la connexion.
// Champs absents (maison de Jérôme) : tout comme avant. Un test par critère, une capture par critère dans tests/e2e/captures/maison-connexion-neutre/
// (nommée avec le projet : ordinateur ou téléphone). Logique sans navigateur : tests/maison-connexion-neutre.test.js.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, URL_APP, JEROME, PROJET, FIRESTORE } from './outils.js';
import { semerFicheEmulateur } from '../_fiche-emulateur.js';

const DOSSIER = fileURLToPath(new URL('./captures/maison-connexion-neutre/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: true, animations: 'disabled' });
const HOTE = new URL(FIRESTORE).host;
const semer = (document, fiche) => semerFicheEmulateur({ projet: PROJET, hote: HOTE, document, fiche });
const bouton = (page) => page.getByRole('button', { name: 'Se connecter avec Google' });
const NOM = 'Chevalier IA - SCAB 04';
const ECRAN_NEUTRE = { personnes: [{ email: JEROME, nom: 'Alice Martin', portrait: '' }], comptes_jerome_seul: [], configuration_crm: 'neutre' };

/** Aucune trace de Jérôme, de Charles ni de « Chevalier IA OS » dans la page. */
async function sansTraceDeJerome(page) {
  for (const trace of ['Jérôme', 'Charles', 'Chevalier IA OS']) await expect(page.locator('body')).not.toContainText(trace);
  await expect(page.locator('img[src*="charles-portrait"]')).toHaveCount(0);
}

/** Connexion dans la maison neutre (3 objectifs neutres, pas les 5 de Jérôme). */
async function ouvrirMaison(page, route = 'crm/accueil') {
  await connecter(page, JEROME, { attendreAccueil: false, route });
  await expect(page.locator('.coquille')).toBeVisible();
}

test('1 page de connexion d’une maison avec nom_espace : titre = nom de la maison, sous-titre neutre, sans Charles ni Jérôme ; bouton Google inchangé', async ({ page }, info) => {
  await semer('public', { mode_crm: true, nom_espace: NOM });
  await page.goto(`${URL_APP}#/crm/accueil`);
  await expect(bouton(page)).toBeVisible();
  await expect(page.locator('.connexion[data-connexion="neutre"]')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(NOM);
  await expect(page.locator('.connexion-lead')).toHaveText('Accès réservé aux comptes autorisés.');
  await expect(page).toHaveTitle(NOM);
  await sansTraceDeJerome(page);
  await capturer(page, info, '1-connexion-maison-nommee');
});

test('2 connexion_neutre seul (sans nom) : page neutre titrée « Votre espace »', async ({ page }, info) => {
  await semer('public', { mode_crm: true, connexion_neutre: true });
  await page.goto(`${URL_APP}#/crm/accueil`);
  await expect(bouton(page)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Votre espace');
  await expect(page).toHaveTitle('Votre espace');
  await sansTraceDeJerome(page);
  await capturer(page, info, '2-connexion-votre-espace');
});

test('3 maison de Jérôme (champs absents) : page de connexion exactement comme avant (Charles, « Jérôme et Charles », « Chevalier IA OS »)', async ({ page }, info) => {
  await page.goto(`${URL_APP}#/crm/accueil`); // reglages_maison/public des parcours : { mode_crm: true } seulement
  await expect(bouton(page)).toBeVisible();
  await expect(page.locator('.connexion[data-connexion="neutre"]')).toHaveCount(0);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chevalier IA OS');
  await expect(page.locator('.connexion-lead')).toHaveText('L’espace de travail de Jérôme et Charles.');
  await expect(page.locator('.connexion-pied')).toHaveText('Accès réservé aux comptes autorisés.');
  await expect(page.locator('img[src*="charles-portrait"]')).toHaveCount(1);
  await expect(page).toHaveTitle('Chevalier IA OS');
  await capturer(page, info, '3-connexion-jerome-inchangee');
});

test('4 après la connexion dans la maison : onglet, menu, barre du haut et Réglages > Mon espace portent le nom de la maison, jamais « Chevalier IA OS »', async ({ page }, info) => {
  await semer('public', { mode_crm: true, nom_espace: NOM });
  await semer('ecran', ECRAN_NEUTRE);
  await ouvrirMaison(page);
  await expect(page).toHaveTitle(NOM);
  await expect(page.locator('.menu-marque-nom .menu-texte')).toHaveText(NOM);
  await expect(page.locator('.barre-haut-marque')).toHaveText(NOM);
  await sansTraceDeJerome(page);
  await page.goto(`${URL_APP}#/reglages/espace`);
  // Depuis le 27/11/2026 (accord de Jérôme), tout compte de la maison peut changer le nom : le champ du formulaire porte le nom de la maison.
  await expect(page.locator('[data-role="mon-espace-maison"] [data-champ="nom"]')).toHaveValue(NOM);
  await expect(page.locator('.page-tete-reglages .etiquette')).toHaveText(NOM);
  await sansTraceDeJerome(page);
  await capturer(page, info, '4-reglages-mon-espace-maison');
});

test('5 maison de Jérôme après la connexion : « Chevalier IA OS » partout, comme avant', async ({ page }, info) => {
  await connecter(page, JEROME);
  await expect(page).toHaveTitle('Chevalier IA OS');
  await expect(page.locator('.menu-marque-nom .menu-texte')).toHaveText('Chevalier IA OS');
  await page.goto(`${URL_APP}#/reglages/espace`);
  await expect(page.locator('[data-info="nom"] .reglages-info-valeur')).toHaveText('Chevalier IA OS');
  await page.goto(`${URL_APP}#/mcp/infos`);
  await expect(page.locator('[data-role="comptes-racine"]')).toHaveText('Les comptes autorisés sont fixés par Jérôme.');
  await page.goto(`${URL_APP}#/journal`);
  await expect(page.locator('.page-journal > .aide')).toContainText('Claude Code');
  await capturer(page, info, '5-jerome-inchange-apres-connexion');
});

test('6 maison neutre : Journal et page « Connecter mon ChatGPT » sans Jérôme ni Claude Code', async ({ page }, info) => {
  await semer('public', { mode_crm: true, nom_espace: NOM });
  await semer('ecran', { ...ECRAN_NEUTRE, comptes_jerome_seul: [JEROME] }); // le Journal d'une maison neutre est réservé au titulaire (tests/e2e/maison-pages-techniques.spec.js)
  await ouvrirMaison(page, 'mcp/infos');
  await expect(page.locator('[data-role="comptes-racine"]')).toHaveText('Les comptes autorisés sont fixés par l’administrateur.');
  await sansTraceDeJerome(page);
  await page.goto(`${URL_APP}#/journal`);
  await expect(page.locator('.page-journal > .aide')).toContainText('ChatGPT');
  await expect(page.locator('.page-journal > .aide')).not.toContainText('Claude Code');
  await sansTraceDeJerome(page);
  await capturer(page, info, '6-journal-maison-neutre');
});

test('7 cas d’erreur : un compte inconnu est refusé sur la page neutre, avec le message de refus et sans trace de Jérôme', async ({ page }, info) => {
  await semer('public', { mode_crm: true, nom_espace: NOM });
  await connecter(page, 'intrus@exemple.test', { attendreAccueil: false });
  await expect(page.getByText("Accès refusé : ce compte n'est pas autorisé")).toBeVisible();
  await expect(bouton(page)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(NOM);
  await sansTraceDeJerome(page);
  await capturer(page, info, '7-compte-refuse-maison');
});
