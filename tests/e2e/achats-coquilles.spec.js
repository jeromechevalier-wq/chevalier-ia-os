// Modules Achats, étape « coquilles » (24/11/2026, PR 4) : un test par critère (le nom commence par son numéro).
//  A1 le bloc « Achats » du menu (cinq entrées, un seul bloc) existe pour Jérôme seul ; A2 « Connexion à la base non réglée » (cas vide) avec le lien vers le réglage ;
//  A3 « Accès prêt (badge à jour) » (faux réseau et badge simulés, émulateurs seulement : aucun appel réseau réel) ; A4 « Reconnecte-toi » (badge sans la mention d'accès) ;
//  A5 cas d'erreur : réglages illisibles + « Réessayer » ; A6 chaque module affiche son titre ; A7 pas de défilement horizontal ; A8 Réglages > « Achats » (section Sauvegarde des chantiers).
// Captures dans tests/e2e/captures/achats-coquilles/ (non commitées), une par état, nommée avec le projet : ordinateur ou telephone.
// Adresses : construites dans le test (aucune adresse d'exemple n'est écrite dans le code de l'appli).
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, allerA, attendreCalme, ecrireDocument, estTelephone, ouvrirSectionReglages, CHARLES } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/achats-coquilles/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' });
}
const sansDefilementHorizontal = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const https = (hote, chemin = '') => `${['https', ''].join(':')}//${hote}${chemin}`;
const FICHE = () => ({ adresseBase: https('base.exemple.test'), clePublique: 'cle-publique-fictive', espace: 'espace-essai', webhooks: {} });
const MODULES = [
  { id: 'achatsfournisseurs', route: 'achatsfournisseurs/liste', titre: 'Fournisseurs' },
  { id: 'achatschantiers', route: 'achatschantiers/liste', titre: 'Chantiers' },
  { id: 'achatsarticles', route: 'achatsarticles/liste', titre: 'Articles' },
  { id: 'achatsfactures', route: 'achatsfactures/liste', titre: 'Factures' },
  { id: 'tableauachats', route: 'tableauachats/tableau', titre: 'Tableau de bord 2' },
];
// Plus aucune coquille : chaque module Achats a son écran et son propre fichier de tests ; ce fichier ne garde que ce que les modules ont en commun (menu, accès, Réglages).
const etat = (page) => page.locator('[data-role="achats-etat"]');

// Badge simulé (crochet d'émulateurs, voir js/os/acces-base.js) : portant, ou non, la mention d'accès. Aucun appel réseau réel.
async function simulerBadge(page, claims = { role: 'authenticated', espace_base: 'espace-essai' }) {
  await page.addInitScript((c) => { window.__accesBase = { jeton: 'jeton-fictif', claims: c }; }, claims);
}

test('A1 le menu de Jérôme a UN bloc « Achats » avec cinq entrées, dans l\'ordre ; chacune ouvre son écran (ordinateur et téléphone)', async ({ page }, info) => {
  await connecter(page);
  if (estTelephone(page)) await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  const bloc = page.locator('.menu .menu-groupe[data-bloc="achats"]');
  await expect(bloc).toHaveCount(1);
  await expect(bloc.locator('.menu-entree')).toHaveText(MODULES.map((m) => m.titre));
  await expect(page.locator('.menu .menu-groupe[data-bloc^="achats"], .menu .menu-groupe[data-bloc="tableauachats"]')).toHaveCount(1); // pas un bloc par module
  await capturer(page, info, 'A1-menu');
  for (const m of MODULES) {
    await allerA(page, m.titre);
    await expect(page).toHaveURL(new RegExp(`#/${m.route}$`));
    await expect(page.getByRole('heading', { name: m.titre, level: 1 })).toBeVisible();
    await expect(page.locator(`.menu .menu-entree[data-chemin="${m.route}"]`)).toHaveAttribute('aria-current', 'page');
  }
});

test('A1 le compte du bot ne voit pas le bloc « Achats », et l\'adresse d\'un module Achats ne montre rien', async ({ page }) => {
  await connecter(page, CHARLES, { route: 'achatsfournisseurs/liste' });
  await attendreCalme(page);
  await expect(page.locator('.menu .menu-groupe[data-bloc="achats"]')).toHaveCount(0);
  await expect(page.locator('[data-module="achats"]')).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Fournisseurs', level: 1 })).toHaveCount(0);
});

test('A2 cas vide : connexion non réglée : le texte exact et le lien vers Réglages > Connexion à la base', async ({ page }, info) => {
  await connecter(page, undefined, { route: 'achatsfournisseurs/liste' });
  await expect(etat(page)).toHaveAttribute('data-etat', 'non-regle');
  await expect(page.locator('[data-role="achats-etat-texte"]')).toHaveText('Connexion à la base non réglée : Réglages > Connexion à la base');
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, 'A2-non-regle');
  await page.getByRole('link', { name: 'Ouvrir la connexion à la base' }).click();
  await expect(page).toHaveURL(/#\/reglages\/base$/);
});

test('A4 « Reconnecte-toi » : le badge n\'a pas la mention d\'accès (ou celle d\'un autre espace) ', async ({ page }, info) => {
  await ecrireDocument('base_parametres/connexion', FICHE());
  await simulerBadge(page, { role: 'authenticated', espace_base: 'autre-espace' });
  await connecter(page, undefined, { route: 'achatsfournisseurs/liste' });
  await expect(etat(page)).toHaveAttribute('data-etat', 'reconnexion');
  await expect(page.locator('[data-role="achats-etat-texte"]')).toContainText('Reconnecte-toi');
  await expect(etat(page)).toHaveAttribute('role', 'alert');
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, 'A4-reconnexion');
});

// A5 (lecture des réglages impossible) : chaque écran a ses propres tests d'accès et d'erreur (T9 et T12 du Tableau de bord 2, etc.) ; les textes fixes sont verrouillés par A3 de tests/achats-coquilles.test.js.
test('A6 une adresse inconnue d\'un module renvoie vers son écran', async ({ page }) => {
  await connecter(page, undefined, { route: 'achatschantiers/inconnu' });
  await expect(page).toHaveURL(/#\/achatschantiers\/liste$/);
  await expect(page.getByRole('heading', { name: 'Chantiers', level: 1 })).toBeVisible();
});

test('A8 Réglages : l\'élément « Achats » réunit les sections des modules du groupe (Fournisseurs et Chantiers : sauvegarde)', async ({ page }, info) => {
  await connecter(page, undefined, { route: 'reglages' });
  await attendreCalme(page);
  await ouvrirSectionReglages(page, 'Achats');
  await expect(page.locator('[data-role="aucun-reglage"]')).toHaveCount(0);
  await expect(page.locator('#reglages-export-achatsfournisseurs')).toBeVisible();
  await expect(page.locator('#reglages-export-achatsfactures')).toBeVisible(); // PR 8a
  await expect(page.locator('#reglages-export-achatschantiers')).toBeVisible();
  await expect(page.locator('#reglages-export-achatsarticles')).toBeVisible();
  await capturer(page, info, 'A8-reglages');
});
