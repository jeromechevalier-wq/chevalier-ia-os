// Veille : même bouton « Filtres » et même fenêtre à cases à cocher que les autres listes (nuit du 22 au 23/10/2026, sujet filtres-veille).
// Un test par critère (nom commençant par le numéro), UNE capture par critère dans tests/e2e/captures/veille-filtres/ (suffixe -telephone sur téléphone).
import { test, expect, attendreCalme, connecter, choisirDansMenuUtilisateur, ecrireDocument, estTelephone, JEROME } from './outils.js';

const CAPTURES = 'e2e/captures/veille-filtres';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
// Cet écran n'utilise pas Google : le script de l'API est remplacé par un fichier vide (sans réseau, il ne produit pas d'erreur de console).
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});

const MIN = 60000;
const il_y_a = (ms) => new Date(Date.now() - ms);
const dialogue = (page) => page.getByRole('dialog');
const bouton = (page) => page.locator('[data-action="filtres"]');
const compte = (page) => bouton(page).locator('.compteur-filtres');
const lignes = (page) => page.locator('.veille-ligne');
const case_ = (page, cle, valeur) => dialogue(page).locator(`input[data-cle="${cle}"][data-valeur="${valeur}"]`);
async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }
async function appliquer(page) { await dialogue(page).getByRole('button', { name: 'Appliquer' }).click(); await expect(dialogue(page)).toHaveCount(0); }

/** Cinq contenus : 2 YouTube, 2 Podcast, 1 Newsletter, dans trois sources et quatre états. */
async function donnees() {
  await ecrireDocument('veille_sources/s-alpha', { nom: 'Chaîne Alpha', url: 'https://exemple.test/alpha', type: 'YouTube', actif: true });
  await ecrireDocument('veille_sources/s-pme', { nom: 'Podcast PME', url: 'https://exemple.test/pme', type: 'Podcast', actif: true });
  await ecrireDocument('veille_sources/s-lettre', { nom: 'Lettre du lundi', url: 'https://exemple.test/lettre', type: 'Newsletter', actif: true });
  await ecrireDocument('veille_sources/s-vide', { nom: 'Source sans contenu', url: 'https://exemple.test/vide', type: 'YouTube', actif: true });
  const c = (id, sourceId, sourceNom, titre, type, etat, minutes) => ecrireDocument(`veille_contenus/${id}`, { sourceId, sourceNom, titre, url: `https://exemple.test/${id}`, type, etat, datePublication: il_y_a(minutes * MIN) });
  await c('c1', 's-alpha', 'Chaîne Alpha', 'Une vidéo résumée', 'YouTube', 'resume', 3000);
  await c('c2', 's-pme', 'Podcast PME', 'Un épisode nouveau', 'Podcast', 'nouveau', 1000);
  await c('c3', 's-pme', 'Podcast PME', 'Un épisode en échec', 'Podcast', 'echec', 2000);
  await c('c4', 's-alpha', 'Chaîne Alpha', 'Une vidéo en cours', 'YouTube', 'en_cours', 500);
  await c('c5', 's-lettre', 'Lettre du lundi', 'Une lettre nouvelle', 'Newsletter', 'nouveau', 100);
}

test('I1 la Veille a le bouton commun « Filtres » : trois groupes de cases (Source, Type, État) à la place des anciennes listes ; la recherche reste dans la barre', async ({ page }) => {
  await donnees();
  await connecter(page);
  await aller(page, '#/veille/contenus');
  await expect(lignes(page)).toHaveCount(5);
  await expect(page.locator('.veille-filtres select')).toHaveCount(0);
  await expect(bouton(page)).toBeVisible();
  await expect(bouton(page)).toContainText('Filtres');
  await expect(page.getByLabel('Chercher dans les titres')).toBeVisible();
  await bouton(page).click();
  await expect(dialogue(page).locator('legend')).toHaveText(['Source', 'Type', 'État']);
  // Seulement ce qui existe : la source sans contenu n'a pas de case.
  await expect(dialogue(page).locator('input[data-cle="sources"]')).toHaveCount(3);
  await expect(case_(page, 'sources', 's-vide')).toHaveCount(0);
  await expect(dialogue(page).locator('input[data-cle="types"]')).toHaveCount(3);
  await expect(dialogue(page).locator('input[data-cle="etats"]')).toHaveCount(4);
  await capture(page, 'I1-fenetre');
});

test('I2 plusieurs cases combinées : OU dans un groupe, ET entre groupes', async ({ page }) => {
  await donnees();
  await connecter(page);
  await aller(page, '#/veille/contenus');
  await bouton(page).click();
  await case_(page, 'types', 'Podcast').check();
  await case_(page, 'types', 'Newsletter').check();
  await expect(lignes(page)).toHaveCount(5); // rien n'est appliqué avant « Appliquer »
  await appliquer(page);
  await expect(lignes(page)).toHaveCount(3); // c2, c3 (Podcast) et c5 (Newsletter)
  await bouton(page).click();
  await case_(page, 'etats', 'nouveau').check();
  await case_(page, 'etats', 'echec').check();
  await appliquer(page);
  await expect(lignes(page)).toHaveCount(3); // les 3 sont « nouveau » ou « échec »
  await bouton(page).click();
  await case_(page, 'etats', 'nouveau').uncheck();
  await case_(page, 'sources', 's-pme').check();
  await appliquer(page);
  await expect(lignes(page)).toHaveCount(1); // Podcast ou Newsletter, ET échec, ET source Podcast PME : c3
  await expect(lignes(page).first()).toHaveAttribute('data-id', 'c3');
  await capture(page, 'I2-filtre-actif');
});

test('I3 la pastille compte les cases cochées ; « Tout effacer » remet tout à zéro et garde la recherche', async ({ page }) => {
  await donnees();
  await connecter(page);
  await aller(page, '#/veille/contenus');
  await page.getByLabel('Chercher dans les titres').fill('un');
  await expect(lignes(page)).toHaveCount(5);
  await expect(compte(page)).toHaveCount(0);
  await bouton(page).click();
  await case_(page, 'types', 'YouTube').check();
  await case_(page, 'types', 'Podcast').check();
  await case_(page, 'etats', 'nouveau').check();
  await appliquer(page);
  await expect(compte(page)).toHaveText('3');
  await expect(lignes(page)).toHaveCount(1); // « Un épisode nouveau »
  await capture(page, 'I3-pastille');
  await bouton(page).click();
  await dialogue(page).getByRole('button', { name: 'Tout effacer' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  await expect(compte(page)).toHaveCount(0);
  await expect(page.getByLabel('Chercher dans les titres')).toHaveValue('un');
  await expect(lignes(page)).toHaveCount(5);
  await expect(bouton(page)).toBeFocused();
  await bouton(page).click();
  await expect(dialogue(page).locator('input:checked')).toHaveCount(0);
});

test('I4 les filtres restent quand on change d\'écran et revient, disparaissent au rechargement et à la déconnexion', async ({ page }) => {
  await donnees();
  await connecter(page);
  await aller(page, '#/veille/contenus');
  await bouton(page).click();
  await case_(page, 'types', 'Podcast').check();
  await case_(page, 'etats', 'echec').check();
  await appliquer(page);
  await expect(lignes(page)).toHaveCount(1);
  await page.getByLabel('Chercher dans les titres').fill('épisode'); // la recherche est mémorisée avec les filtres
  await aller(page, '#/veille/sources');
  await aller(page, '#/veille/contenus');
  await expect(page.getByLabel('Chercher dans les titres')).toHaveValue('épisode');
  await expect(lignes(page)).toHaveCount(1);
  await expect(compte(page)).toHaveText('2');
  await bouton(page).click();
  await expect(case_(page, 'types', 'Podcast')).toBeChecked();
  await expect(case_(page, 'etats', 'echec')).toBeChecked();
  await capture(page, 'I4-memorise');
  await page.keyboard.press('Escape');
  await page.reload();
  await attendreCalme(page);
  await expect(lignes(page)).toHaveCount(5);
  await expect(compte(page)).toHaveCount(0);
  // Déconnexion puis connexion dans le même onglet : le filtre ne passe pas d'une session à l'autre.
  await bouton(page).click();
  await case_(page, 'types', 'Podcast').check();
  await appliquer(page);
  await expect(lignes(page)).toHaveCount(2);
  await choisirDansMenuUtilisateur(page, 'Se déconnecter');
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
  await page.evaluate((e) => window.__chevalierTest.connecter(e, true), JEROME);
  await expect(page.locator('.coquille')).toBeVisible();
  await aller(page, '#/veille/contenus');
  await expect(lignes(page)).toHaveCount(5);
  await expect(compte(page)).toHaveCount(0);
});

test('I5 sur téléphone comme sur ordinateur : bouton, fenêtre, pastille et « Tout effacer » fonctionnent, sans défilement horizontal', async ({ page }) => {
  await donnees();
  await connecter(page);
  await aller(page, '#/veille/contenus');
  await expect(bouton(page)).toBeVisible();
  const boite = await bouton(page).boundingBox();
  const largeur = page.viewportSize().width;
  expect(boite.x + boite.width).toBeLessThanOrEqual(largeur);
  await bouton(page).click();
  await case_(page, 'sources', 's-alpha').check();
  await case_(page, 'etats', 'nouveau').check();
  await case_(page, 'etats', 'en_cours').check();
  await capture(page, 'I5-fenetre');
  await appliquer(page);
  await expect(compte(page)).toHaveText('3');
  await expect(lignes(page)).toHaveCount(1); // Chaîne Alpha ET (nouveau OU en cours) : c4
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await capture(page, 'I5-liste');
  await bouton(page).click();
  await dialogue(page).getByRole('button', { name: 'Tout effacer' }).click();
  await expect(lignes(page)).toHaveCount(5);
  await expect(compte(page)).toHaveCount(0);
});

test('I1 cas vide : des filtres sans résultat disent « Rien à afficher avec ces filtres. Décoche un filtre. » ; cas d\'erreur : sans aucun contenu, le bouton « Filtres » est grisé', async ({ page }) => {
  await donnees();
  await connecter(page);
  await aller(page, '#/veille/contenus');
  await bouton(page).click();
  await case_(page, 'sources', 's-pme').check();
  await case_(page, 'etats', 'resume').check();
  await appliquer(page);
  await expect(lignes(page)).toHaveCount(0);
  await expect(page.locator('.veille-vide')).toHaveText('Rien à afficher avec ces filtres. Décoche un filtre.');
  await capture(page, 'I1-vide');
  await bouton(page).click();
  await dialogue(page).getByRole('button', { name: 'Tout effacer' }).click();
  await expect(lignes(page)).toHaveCount(5);
});

test('I1 cas d\'erreur : sans aucun contenu (tables absentes ou illisibles), le bouton « Filtres » est grisé et le message de départ s\'affiche', async ({ page }) => {
  await connecter(page);
  await aller(page, '#/veille/contenus');
  await expect(page.locator('.veille-vide')).toContainText('Aucun contenu pour le moment');
  await expect(bouton(page)).toBeDisabled();
  await capture(page, 'I1-sans-contenu');
});

/** C20 : aucune erreur dans la console du navigateur pendant le parcours. */
test.afterEach(async ({ erreursConsole }) => {
  expect(erreursConsole, 'Erreurs dans la console du navigateur').toEqual([]);
});
