// Filtres (nuit du 21/10/2026) : I9 (bouton « Filtres » de l'Historique des fiches, le même que celui des listes) et I15 (même bouton partout où c'est petit et sûr).
// Un test par critère (nom commençant par le numéro) et UNE capture par critère dans tests/e2e/captures/filtres/.
import { test, expect, attendreCalme, connecter, allerA, creerPersonne, creerProjet, creerActivite, ecrireDocument, estTelephone, JEROME } from './outils.js';

const CAPTURES = 'e2e/captures/filtres';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
// Ces écrans n'utilisent pas Google : le script de l'API est remplacé par un fichier vide (sans réseau, il ne produit pas d'erreur de console).
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});
const dialogue = (page) => page.getByRole('dialog');
async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }

/** Une fiche personne avec une activité faite, une note et un événement : de quoi filtrer. */
async function fichePleine() {
  await creerPersonne('p1', { nom: 'Marie Durand' });
  await creerActivite('act1', { personneId: 'p1', titre: 'Appeler Marie', fait: true, dateFait: new Date() });
  await ecrireDocument('crm_notes/n1', { texte: 'Une note de test', personneId: 'p1', organisationId: null, affaireId: null, auteur: JEROME, creeLe: new Date(), modifieLe: new Date() });
  await ecrireDocument('crm_evenements/e1', { type: 'email_envoye', texte: 'Email envoyé à Marie', personneId: 'p1', organisationId: null, affaireId: null, auteur: JEROME, date: new Date() });
}
const lignes = (page) => page.locator('.historique .fil-ligne');
const boutonHistorique = (page) => page.locator('.historique [data-action="filtres"]');

test('I9 le bouton « Filtres » est à côté du titre « Historique », avec le même entonnoir que la liste des Personnes ; les pastilles sont cachées au repos', async ({ page }) => {
  await fichePleine();
  await connecter(page);
  await allerA(page, 'Personnes');
  const entonnoirListe = await page.locator('[data-action="filtres"] svg').first().innerHTML();
  await aller(page, '#/crm/personnes/p1');
  await expect(boutonHistorique(page)).toContainText('Filtres');
  await expect(page.locator('.historique h3.sous-titre')).toHaveText('Historique');
  expect(await boutonHistorique(page).locator('svg').first().innerHTML()).toBe(entonnoirListe); // même icône
  await expect(page.locator('.historique [data-filtre]')).toHaveCount(0); // pastilles cachées au repos
  await expect(page.locator('.historique .compteur-filtres')).toHaveCount(0); // « Tous » : pas de pastille de compte
  await boutonHistorique(page).click();
  await expect(dialogue(page)).toBeVisible();
  await expect(dialogue(page).locator('[data-filtre]')).toHaveText(['Tous', 'Activités', 'Notes', 'Documents', 'Affaires', 'Événements']);
  await capture(page, 'I9-ouvert');
  await page.keyboard.press('Escape'); // fermeture comme la liste : rien ne change
  await expect(dialogue(page)).toHaveCount(0);
  await expect(lignes(page)).toHaveCount(3);
});

test('I9 choisir un filtre puis « Appliquer » filtre l’historique et montre la pastille de compte ; « Tout effacer » et la croix reviennent sur « Tous »', async ({ page }) => {
  await fichePleine();
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  await expect(lignes(page)).toHaveCount(3);
  await boutonHistorique(page).click();
  await dialogue(page).locator('[data-filtre="notes"]').click();
  await expect(dialogue(page).locator('[data-filtre="notes"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(lignes(page)).toHaveCount(3); // rien n'est appliqué avant « Appliquer »
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  await expect(lignes(page)).toHaveCount(1);
  await expect(lignes(page)).toContainText('Une note de test');
  await expect(boutonHistorique(page).locator('.compteur-filtres')).toHaveText('1');
  await expect(page.locator('.historique .pastille-filtre')).toContainText('Notes');
  await capture(page, 'I9-actif');
  await boutonHistorique(page).click();
  await dialogue(page).getByRole('button', { name: 'Tout effacer' }).click();
  await expect(lignes(page)).toHaveCount(3);
  await expect(page.locator('.historique .compteur-filtres')).toHaveCount(0);
  // la croix de la pastille retire aussi le filtre
  await boutonHistorique(page).click();
  await dialogue(page).locator('[data-filtre="activites"]').click();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(lignes(page)).toHaveCount(1);
  await page.getByRole('button', { name: 'Retirer le filtre : Activités' }).click();
  await expect(lignes(page)).toHaveCount(3);
});

test('I9 cas vide : un filtre sans résultat dit « Rien à afficher avec ce filtre. » ; le filtre revient sur « Tous » en quittant la fiche', async ({ page }) => {
  await fichePleine();
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  await boutonHistorique(page).click();
  await dialogue(page).locator('[data-filtre="documents"]').click();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(lignes(page)).toHaveCount(0);
  await expect(page.locator('.historique')).toContainText('Rien à afficher avec ce filtre.');
  await expect(boutonHistorique(page).locator('.compteur-filtres')).toHaveText('1');
  await aller(page, '#/crm/personnes');
  await aller(page, '#/crm/personnes/p1');
  await expect(lignes(page)).toHaveCount(3);
  await expect(page.locator('.historique .compteur-filtres')).toHaveCount(0);
});

test('I9 téléphone et ordinateur : la fenêtre des filtres de l’historique tient dans l’écran, comme celle des Personnes', async ({ page }) => {
  await fichePleine();
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  await boutonHistorique(page).click();
  await expect(dialogue(page)).toBeVisible();
  const boite = await dialogue(page).boundingBox();
  const vue = page.viewportSize();
  expect(boite.x).toBeGreaterThanOrEqual(0);
  expect(boite.x + boite.width).toBeLessThanOrEqual(vue.width + 1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const b of await dialogue(page).locator('[data-filtre]').all()) expect((await b.boundingBox()).height).toBeGreaterThanOrEqual(estTelephone(page) ? 43 : 31); // 44 et 32 px nominaux, moins l’arrondi du navigateur
  await expect(dialogue(page).getByRole('button', { name: 'Appliquer' })).toBeVisible();
  await expect(dialogue(page).getByRole('button', { name: 'Tout effacer' })).toBeVisible();
  await capture(page, 'I9-fenetre');
});

test('I15 le bouton « Filtres » des Projets est le même que celui des Personnes (entonnoir, pastille de compte) et ouvre la même fenêtre', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Marie Durand' });
  await creerProjet('pr1', { titre: 'Refonte du site' });
  await connecter(page);
  await allerA(page, 'Personnes');
  const bouton = page.locator('[data-action="filtres"]');
  const classes = await bouton.getAttribute('class');
  const entonnoir = await bouton.locator('svg').innerHTML();
  await aller(page, '#/projets/projets');
  const boutonProjets = page.locator('[data-action="filtres"]');
  expect(await boutonProjets.getAttribute('class')).toBe(classes);
  expect(await boutonProjets.locator('svg').innerHTML()).toBe(entonnoir);
  await expect(page.locator('.compteur-filtres')).toHaveCount(0);
  await boutonProjets.click();
  await expect(dialogue(page).getByRole('button', { name: 'Tout effacer' })).toBeVisible();
  await dialogue(page).locator('input[data-cle="enRetard"]').check();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(boutonProjets.locator('.compteur-filtres')).toHaveText('1');
  await capture(page, 'I15-projets');
});

test('I9 clavier : après « Appliquer », le focus revient sur le bouton « Filtres » de l\'Historique (comme sur les Personnes)', async ({ page }) => {
  await fichePleine();
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  await boutonHistorique(page).click();
  await dialogue(page).locator('[data-filtre="notes"]').click();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  await expect(boutonHistorique(page)).toBeFocused();
});
