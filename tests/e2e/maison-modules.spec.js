// Modules allumés dans une maison (27/11/2026) : champ facultatif `modules` de reglages_maison/ecran (js/os/maison-modules.js, js/main.js).
// Un test par critère (le nom commence par son numéro), une capture par critère dans tests/e2e/captures/maison-modules/ (nommée avec le projet : ordinateur ou téléphone).
// Comptes des parcours (outils.js) : JEROME est le titulaire (comptes_jerome_seul) ; CHARLES est un autre compte autorisé de la maison (non titulaire).
// Logique sans navigateur : tests/maison-modules.test.js.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, estTelephone, JEROME, CHARLES, PROJET, FIRESTORE, ECRAN_PARCOURS } from './outils.js';
import { semerFicheEmulateur } from '../_fiche-emulateur.js';

const DOSSIER = fileURLToPath(new URL('./captures/maison-modules/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' });
const HOTE = new URL(FIRESTORE).host;
const ACHATS_SCAB = ['achatsfactures', 'tableauachats', 'achatschantiers', 'achatsfournisseurs', 'achatsarticles'];
const TITRES_ACHATS = ['Fournisseurs', 'Chantiers', 'Articles', 'Factures', 'Tableau de bord 2']; // ordre du bloc « Achats » du menu
const semerModules = (modules) => semerFicheEmulateur({ projet: PROJET, hote: HOTE, document: 'ecran', fiche: { ...ECRAN_PARCOURS, modules } });

const blocs = (page) => page.locator('.menu .menu-groupe').evaluateAll((els) => els.map((e) => e.dataset.bloc));
async function ouvrirMenu(page) {
  if (estTelephone(page) && !(await page.locator('.coquille.menu-ouvert').count())) await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
}
/** Connexion sur une adresse vide (#/) : la maison choisit elle-même le premier écran. */
async function ouvrir(page, email) {
  await connecter(page, email, { attendreAccueil: false, route: '' });
  await expect(page.locator('.coquille')).toBeVisible();
}

test('1a sans réglage (maison de Jérôme) : inchangé — le titulaire a tout, Console et Achats compris, et arrive sur l’accueil d’avant', async ({ page }, info) => {
  await connecter(page); // ECRAN_PARCOURS : sans champ `modules`
  await expect(page).toHaveURL(/#\/crm\/accueil$/);
  await ouvrirMenu(page);
  const b = await blocs(page);
  for (const id of ['crm', 'achats', 'console']) expect(b).toContain(id);
  await capturer(page, info, '1a-sans-reglage-titulaire');
});

test('1b sans réglage : un autre compte de la maison n’a ni Console ni Achats (comme avant)', async ({ page }, info) => {
  await connecter(page, CHARLES, { attendreAccueil: false });
  await expect(page.locator('.coquille')).toBeVisible();
  await expect(page).toHaveURL(/#\/crm\/accueil$/);
  await ouvrirMenu(page);
  const b = await blocs(page);
  expect(b).toContain('crm');
  expect(b).not.toContain('achats');
  expect(b).not.toContain('console');
  await capturer(page, info, '1b-sans-reglage-autre-compte');
});

test('2 réglage = 5 modules Achats, compte NON titulaire : menu = les 5 modules, arrivée sur Factures, pas de Console, la route crm/accueil est introuvable', async ({ page }, info) => {
  await semerModules(ACHATS_SCAB);
  await ouvrir(page, CHARLES);
  await expect(page).toHaveURL(/#\/achatsfactures\/liste$/);
  await expect(page.getByRole('heading', { name: 'Factures', level: 1 })).toBeVisible();
  await ouvrirMenu(page);
  expect(await blocs(page)).toEqual(['achats']);
  await expect(page.locator('.menu .menu-groupe[data-bloc="achats"] .menu-entree')).toHaveText(TITRES_ACHATS);
  await expect(page.locator('.menu .menu-entree[data-chemin^="console"]')).toHaveCount(0);
  await capturer(page, info, '2-achats-autre-compte-factures');
  if (estTelephone(page)) await page.keyboard.press('Escape'); // referme le menu du téléphone
  await page.goto(`${new URL(page.url()).pathname}${new URL(page.url()).search}#/crm/accueil`);
  await expect(page.locator('[data-role="page-introuvable"] h1')).toHaveText('Page introuvable');
  await expect(page.locator('.grille-objectifs')).toHaveCount(0);
  await capturer(page, info, '2-crm-introuvable');
  await page.locator('[data-role="page-introuvable"] a', { hasText: 'Retour à l' }).click();
  await expect(page).toHaveURL(/#\/achatsfactures\/liste$/);
  await page.goto(`${new URL(page.url()).pathname}${new URL(page.url()).search}#/console/vue`);
  await expect(page.locator('[data-role="page-introuvable"]')).toBeVisible(); // la Console : introuvable pour un autre compte, même par son adresse
});

test('3 même réglage, compte titulaire : les 5 modules Achats ET la Console ; arrivée sur Factures', async ({ page }, info) => {
  await semerModules(ACHATS_SCAB);
  await ouvrir(page, JEROME);
  await expect(page).toHaveURL(/#\/achatsfactures\/liste$/);
  await ouvrirMenu(page);
  expect(await blocs(page)).toEqual(['achats', 'console']);
  await expect(page.locator('.menu .menu-groupe[data-bloc="achats"] .menu-entree')).toHaveText(TITRES_ACHATS);
  await capturer(page, info, '3-achats-titulaire-console');
});

test('4 un identifiant inconnu est ignoré (avertissement dans la console), les modules connus restent allumés', async ({ page }, info) => {
  const avertissements = [];
  page.on('console', (m) => { if (m.type() === 'warning') avertissements.push(m.text()); });
  await semerModules(['achatsfactures', 'module-inconnu']);
  await ouvrir(page, CHARLES);
  await expect(page).toHaveURL(/#\/achatsfactures\/liste$/);
  await ouvrirMenu(page);
  await expect(page.locator('.menu .menu-groupe a.menu-entree[data-chemin]')).toHaveText(['Factures']);
  await attendreCalme(page);
  expect(avertissements.some((t) => t.includes('module inconnu ignoré : « module-inconnu »'))).toBe(true);
  await capturer(page, info, '4-identifiant-inconnu');
});
