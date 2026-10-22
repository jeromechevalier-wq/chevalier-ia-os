// En-tête de la fiche affaire (J2, J9) : le montant est aligné sur les boutons de droite, et le bouton « Gagnée » n'existe plus.
// Les captures vont dans tests/e2e/captures/entete-affaire/ (ordinateur ; téléphone en plus pour J2, la mise en page y change).
import { fileURLToPath } from 'node:url';
import { test, expect, attendreCalme, connecter, creerAffaire, lireDocument, listerDocuments } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/entete-affaire/', import.meta.url));
async function capturer(page, info, nom) {
  const suffixe = info.project.name === 'ordinateur' ? '' : `-${info.project.name}`;
  await page.locator('.fiche-tete').screenshot({ path: `${DOSSIER}${nom}${suffixe}.png` });
}
async function ouvrir(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }

// Dans ce bac à sable, le script de Google est inaccessible : on le remplace par un fichier vide.
test.beforeEach(async ({ page }) => {
  await page.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
});

const centreY = (b) => b.y + b.height / 2;
const intersecte = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

async function verifierAlignement(page, info, texteMontant) {
  await expect(texteMontant).toBeVisible();
  const montant = await texteMontant.boundingBox();
  const boutons = page.locator('.fiche-actions > *');
  const premier = await boutons.nth(0).boundingBox();
  const second = await boutons.nth(1).boundingBox();
  const titre = await page.locator('.fiche-titre').boundingBox();
  expect(montant.width, 'le montant reste lisible (non écrasé)').toBeGreaterThan(30);
  expect(intersecte(montant, premier), 'le montant ne chevauche pas le premier bouton').toBe(false);
  expect(intersecte(montant, titre), 'le montant ne chevauche pas le titre').toBe(false);
  const surLaMemeLigne = Math.abs(centreY(montant) - centreY(premier)) < premier.height;
  if (surLaMemeLigne) {
    expect(Math.abs(centreY(montant) - centreY(premier)), 'centre du montant = centre des boutons (2 px)').toBeLessThanOrEqual(2);
    const ecartMontant = premier.x - (montant.x + montant.width);
    const ecartBoutons = second.x - (premier.x + premier.width);
    expect(Math.abs(ecartMontant - ecartBoutons), `espace montant/bouton (${ecartMontant}) = espace entre boutons (${ecartBoutons}), 4 px`).toBeLessThanOrEqual(4);
  } else {
    // Téléphone : la ligne ne tient pas, le montant passe au-dessus des boutons, sans rien recouvrir.
    expect(info.project.name, 'le passage à la ligne n\'est admis que sur téléphone').toBe('telephone');
    expect(montant.y + montant.height).toBeLessThanOrEqual(premier.y + 1);
  }
  const fenetre = page.viewportSize();
  expect(montant.x).toBeGreaterThanOrEqual(0);
  expect(montant.x + montant.width).toBeLessThanOrEqual(fenetre.width);
}

test('J2 le montant fantôme « 999 € » est sur l’axe des boutons de droite, à la même distance du premier bouton que les boutons entre eux', async ({ page }, info) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas', etape: 'proposition_envoyee' });
  await connecter(page);
  await ouvrir(page, '#/crm/affaires/a1');
  const fantome = page.locator('.fiche-montant .prop-fantome');
  await expect(fantome).toHaveText(/999\s€/);
  await verifierAlignement(page, info, fantome);
  await capturer(page, info, 'J2-montant-fantome');
});

test('J2 (montant réel) un montant enregistré suit les mêmes règles d’alignement et d’espacement', async ({ page }, info) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas', etape: 'proposition_envoyee', montant: 1500 });
  await connecter(page);
  await ouvrir(page, '#/crm/affaires/a1');
  const texte = page.locator('.fiche-montant .prop-valeur > span').first();
  await expect(texte).toContainText(/1\s?500\s€/);
  await verifierAlignement(page, info, texte);
  await capturer(page, info, 'J2-montant-reel');
  // le crayon de modification est visible, entièrement dans la fenêtre, ne recouvre pas le titre, ne décale pas le montant, et s'ouvre au clic
  const avant = await texte.boundingBox();
  await page.locator('.fiche-montant').hover();
  const crayon = page.locator('.fiche-montant .prop-modifier');
  await expect.poll(() => crayon.evaluate((el) => getComputedStyle(el).opacity)).toBe('1');
  const c = await crayon.boundingBox();
  const fenetre = page.viewportSize();
  expect(c.x).toBeGreaterThanOrEqual(0);
  expect(c.x + c.width).toBeLessThanOrEqual(fenetre.width);
  expect(intersecte(c, await page.locator('input.titre-editable').boundingBox()), 'le crayon ne recouvre pas le titre').toBe(false);
  expect(intersecte(c, await page.locator('.fiche-titre').boundingBox()), 'ni la zone du titre').toBe(false);
  const apres = await texte.boundingBox();
  expect(Math.abs(apres.x - avant.x)).toBeLessThanOrEqual(1);
  await crayon.click();
  await expect(page.getByLabel('Montant', { exact: true })).toBeVisible();
});

test('J9 l’en-tête d’une affaire ouverte montre « Perdue » et « … », plus de « Gagnée » ni de « En pause » ; la liste « Étape » gagne l’affaire et propose le projet', async ({ page }, info) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas', etape: 'proposition_envoyee' });
  await connecter(page);
  await ouvrir(page, '#/crm/affaires/a1');
  const actions = page.locator('.fiche-tete .fiche-actions');
  await expect(actions.getByRole('button', { name: 'Perdue' })).toBeVisible();
  await expect(actions.getByRole('button', { name: 'En pause' })).toHaveCount(0); // la pause est supprimée (22/10/2026)
  await expect(actions.getByRole('button', { name: 'Plus d’actions' })).toBeVisible();
  await expect(actions.getByRole('button', { name: 'Gagnée' })).toHaveCount(0);
  await expect(page.locator('[data-action="gagnee"]')).toHaveCount(0);
  await expect(actions.locator('> *')).toHaveCount(2);
  await capturer(page, info, 'J9-sans-gagnee');
  // Gagner par la liste « Étape » du Résumé : même chemin qu'avant (célébration, statut, création du projet proposée)
  await page.locator('[data-action="choisir-etape"]').selectOption('gagne');
  await expect(page.locator('.celebration')).toBeVisible();
  await page.locator('.celebration').click();
  await expect.poll(async () => (await lireDocument('crm_affaires/a1'))?.statut).toBe('gagnee');
  await expect(page.locator('[data-section="affaire-projet"] [data-action="creer-projet"]')).toBeVisible();
  expect(await listerDocuments('projets_projets')).toHaveLength(0); // proposé, pas créé tout seul
  await expect(page.locator('[data-action="gagnee"]')).toHaveCount(0);
});

test('J9 (menu et état) le menu « … » garde ses actions et la liste « Étape » montre l’étape réelle', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas', etape: 'proposition_envoyee' });
  await connecter(page);
  await ouvrir(page, '#/crm/affaires/a1');
  await page.locator('[data-action="menu-fiche"]').click();
  await expect(page.getByRole('menuitem', { name: /Archiver/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-action="choisir-etape"]')).toHaveValue('proposition_envoyee');
});
