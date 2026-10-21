// Correctifs de fiche (nuit du 21/10/2026) : I2 (liens du haut à jour tout de suite), I13 (ligne Organisation alignée), I18 (plus de « + Personne » sur l'Accueil).
// Un test par critère (nom commençant par le numéro) et UNE capture par critère dans tests/e2e/captures/correctifs-fiche/.
import { test, expect, attendreCalme, connecter, creerAffaire, creerProjet, creerPersonne, creerOrganisation, lireDocument, estTelephone } from './outils.js';

const CAPTURES = 'e2e/captures/correctifs-fiche';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
// Ces écrans n'utilisent pas Google : le script de l'API est remplacé par un fichier vide (sans réseau, il ne produit pas d'erreur de console).
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});
const dialogue = (page) => page.getByRole('dialog');

async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }

const cellule = (page, libelle) => page.locator('.prop', { has: page.locator('.prop-libelle', { hasText: new RegExp(`^${libelle}$`) }) });
/** Choisit une valeur dans la cellule « Personne » ou « Organisation » du Résumé (on tape, on clique la suggestion). */
async function choisirDansResume(page, libelle, saisie, nom) {
  await cellule(page, libelle).locator('input').fill(saisie);
  await cellule(page, libelle).locator('.suggestion', { hasText: nom }).first().click();
}
const croix = (page, libelle) => cellule(page, libelle).locator('.champ-intelligent-effacer');

/** Marque la page et l'en-tête : si l'un des deux est refait ou rechargé, la marque disparaît. */
async function marquer(page) {
  await page.evaluate(() => { window.__sansRechargement = true; document.querySelector('.fiche-tete').dataset.marque = 'meme-entete'; });
}
async function memeEntete(page) {
  return page.evaluate(() => window.__sansRechargement === true && document.querySelector('.fiche-tete')?.dataset.marque === 'meme-entete');
}

for (const [nomFiche, creer, hash, chemin] of [
  ['affaire', () => creerAffaire('a1', { titre: 'Audit des Lilas' }), '#/crm/affaires/a1', 'crm_affaires/a1'],
  ['projet', () => creerProjet('pr1', { titre: 'Refonte du site' }), '#/projets/projets/pr1', 'projets_projets/pr1'],
]) {
  test(`I2 ${nomFiche} : choisir puis retirer une personne et une organisation met les liens du haut à jour tout de suite, sans recharger ni refaire l'en-tête`, async ({ page }) => {
    await creerPersonne('p1', { nom: 'Sophie Martin' });
    await creerOrganisation('o1', { nom: 'Atelier Lumière' });
    await creer();
    await connecter(page);
    await aller(page, hash);
    const liens = page.locator('.fiche-tete .fiche-sous');
    // Cas vide : aucun lien en haut tant que rien n'est choisi.
    await expect(liens.locator('a[href^="#/crm/personnes/"], a[href^="#/crm/organisations/"]')).toHaveCount(0);
    await marquer(page);

    await choisirDansResume(page, 'Personne', 'Sophie', 'Sophie Martin');
    await expect(liens.getByRole('link', { name: 'Sophie Martin' })).toBeVisible();
    await choisirDansResume(page, 'Organisation', 'Atelier', 'Atelier Lumière');
    await expect(liens.getByRole('link', { name: 'Atelier Lumière' })).toBeVisible();
    expect(await memeEntete(page)).toBe(true);
    await expect.poll(async () => { const d = await lireDocument(chemin); return [d.personneId, d.organisationId]; }).toEqual(['p1', 'o1']);
    await capture(page, `I2-${nomFiche}-liens-affiches`);

    await croix(page, 'Personne').click();
    await expect(liens.getByRole('link', { name: 'Sophie Martin' })).toHaveCount(0);
    await croix(page, 'Organisation').click();
    await expect(liens.getByRole('link', { name: 'Atelier Lumière' })).toHaveCount(0);
    expect(await memeEntete(page)).toBe(true);
    await expect.poll(async () => { const d = await lireDocument(chemin); return [d.personneId, d.organisationId]; }).toEqual([null, null]);
  });
}

test('I13 fiche personne : le nom de l\'organisation, « Détacher » et « Changer » sont alignés sur la même ligne', async ({ page }) => {
  test.skip(estTelephone(page), 'critère mesuré en ordinateur');
  await creerOrganisation('o1', { nom: 'Atelier Lumière' });
  await creerPersonne('p1', { nom: 'Sophie Martin', organisationId: 'o1' });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  const ligne = page.locator('.ligne-organisation');
  await expect(ligne).toHaveCount(1);
  const centreY = async (loc) => { const b = await loc.boundingBox(); return b.y + b.height / 2; };
  const nom = ligne.getByRole('link', { name: 'Atelier Lumière' });
  const detacher = ligne.getByRole('button', { name: 'Détacher' });
  const changer = ligne.getByRole('button', { name: 'Changer' });
  const [yNom, yDetacher, yChanger] = [await centreY(nom), await centreY(detacher), await centreY(changer)];
  expect(Math.abs(yNom - yDetacher), 'nom / Détacher').toBeLessThanOrEqual(2);
  expect(Math.abs(yNom - yChanger), 'nom / Changer').toBeLessThanOrEqual(2);
  // Même ligne : les boutons sont à droite du nom, l'un après l'autre.
  const [bNom, bDetacher, bChanger] = [await nom.boundingBox(), await detacher.boundingBox(), await changer.boundingBox()];
  expect(bDetacher.x).toBeGreaterThan(bNom.x + bNom.width - 1);
  expect(bChanger.x).toBeGreaterThan(bDetacher.x + bDetacher.width - 1);
  await ligne.scrollIntoViewIfNeeded();
  await capture(page, 'I13-organisation-alignee');
});

test('I18 Accueil : plus de bouton « + Personne » dans l\'en-tête ni dans le cas vide ; le « + » du haut crée une personne', async ({ page }) => {
  // Cas vide : aucune donnée, le message renvoie au « + » du haut.
  await connecter(page);
  await expect(page.locator('.page-accueil [data-action="nouvelle-personne"]')).toHaveCount(0);
  await expect(page.locator('.page-accueil').getByRole('button', { name: /Personne/ })).toHaveCount(0);
  await expect(page.locator('.page-accueil')).toContainText('Ajoute ta première personne avec le bouton rond « + »');
  // Le « + » du haut propose « Personne » et ouvre la création d'une personne.
  await page.locator(estTelephone(page) ? '.bouton-plus-mobile' : '.bouton-plus:not(.bouton-plus-mobile)').click();
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: 'Personne' })).toBeVisible();
  await capture(page, 'I18-accueil-plus');
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Personne' }).click();
  await expect(dialogue(page)).toContainText('Ajouter une personne');
  await page.keyboard.press('Escape');
  await expect(dialogue(page)).toHaveCount(0);
});

test('I18 Accueil avec des données : toujours aucun bouton « Personne » dans la page', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Sophie Martin' });
  await connecter(page);
  await expect(page.locator('.page-accueil [data-action="nouvelle-personne"]')).toHaveCount(0);
  await expect(page.locator('.page-accueil .page-tete').getByRole('button')).toHaveCount(0);
});
