// Barre de recherche compacte (demande de Jérôme, 25/10/2026) : sur Personnes, Organisations, Affaires et Projets, le champ a la largeur de celui de Devis
// et les boutons sont collés à sa droite. Un test par point (le nom commence par le numéro). Captures dans tests/e2e/captures/recherche-compacte/.
// Cas vide : la barre reste la même sans aucune fiche. Cas d'erreur : aucun (rien n'est écrit).
import { test, expect, connecter, attendreCalme, estTelephone, JEROME } from './outils.js';

const DOSSIER = 'e2e/captures/recherche-compacte';
const capture = (page, nom) => page.screenshot({ path: `${DOSSIER}/${nom}${estTelephone(page) ? '-telephone' : '-ordinateur'}.png`, animations: 'disabled' });
const PAGES = { personnes: 'crm/personnes', organisations: 'crm/organisations', affaires: 'crm/affaires', projets: 'projets/projets' };

async function aller(page, route) {
  await page.evaluate((r) => { location.hash = `#/${r}`; }, route);
  await expect(page.locator('.barre-affaires input[type="search"]').first()).toBeVisible();
  await attendreCalme(page);
}
const boite = (page) => page.locator('.barre-affaires input[type="search"]').first().boundingBox();
async function largeurDevis(page) { await aller(page, 'devis/liste'); return (await boite(page)).width; }

async function verifierLargeur(page, route, nom) {
  const devis = await largeurDevis(page);
  await aller(page, route);
  const champ = await boite(page);
  if (!estTelephone(page)) {
    expect(champ.width).toBeLessThanOrEqual(devis * 1.05);
    expect(champ.width).toBeGreaterThan(devis * 0.7);
  } else {
    expect(champ.width).toBeGreaterThan(300); // pleine largeur sur téléphone
  }
  await capture(page, nom);
}

test('1 Personnes : le champ de recherche a la largeur de celui de Devis', async ({ page }) => {
  await connecter(page, JEROME);
  await verifierLargeur(page, PAGES.personnes, '1-personnes');
});
test('2 Organisations : le champ de recherche a la largeur de celui de Devis', async ({ page }) => {
  await connecter(page, JEROME);
  await verifierLargeur(page, PAGES.organisations, '2-organisations');
});
test('3 Affaires : le champ de recherche a la largeur de celui de Devis (kanban et liste)', async ({ page }) => {
  await connecter(page, JEROME);
  await verifierLargeur(page, PAGES.affaires, '3-affaires-kanban');
  await page.locator('[data-vue="liste"]').click();
  await attendreCalme(page);
  const devis = await largeurDevis(page);
  await aller(page, PAGES.affaires);
  const champ = await boite(page);
  if (!estTelephone(page)) expect(champ.width).toBeLessThanOrEqual(devis * 1.05);
  await expect(page.locator('[data-vue="liste"]')).toHaveAttribute('aria-pressed', 'true'); // la vue Liste est bien celle qui est affichée
  await expect(page.locator('[data-vue="kanban"]')).toBeVisible();
  await expect(page.locator('[data-vue="archives"]')).toBeVisible();
  await capture(page, '3-affaires-liste');
});
test('4 Projets : le champ de recherche a la largeur de celui de Devis', async ({ page }) => {
  await connecter(page, JEROME);
  await verifierLargeur(page, PAGES.projets, '4-projets');
});
test('5 les boutons sont collés au bord droit du champ, sur la même ligne', async ({ page }) => {
  test.skip(estTelephone(page), 'sur téléphone les boutons passent à la ligne');
  await connecter(page, JEROME);
  for (const [nom, route] of Object.entries(PAGES)) {
    await aller(page, route);
    const champ = await boite(page);
    const bouton = await page.locator('.barre-affaires .barre-filtres-ligne button').first().boundingBox();
    expect(bouton.x - (champ.x + champ.width), nom).toBeLessThan(24);
    expect(bouton.x, nom).toBeGreaterThanOrEqual(champ.x + champ.width - 1);
    expect(Math.abs(bouton.y + bouton.height / 2 - (champ.y + champ.height / 2)), nom).toBeLessThan(20); // même ligne
    const tri = await page.locator('.barre-affaires .selecteur-tri').first().boundingBox();
    expect(tri.y, nom).toBeLessThan(champ.y + champ.height + 10);
    if (nom === 'affaires') await page.screenshot({ path: `${DOSSIER}/5-boutons-colles-ordinateur.png`, clip: { x: 64, y: 140, width: 900, height: 60 }, animations: 'disabled' }); // la barre en gros plan
  }
});
test('6 aucune page ne déborde en largeur', async ({ page }) => {
  await connecter(page, JEROME);
  for (const [nom, route] of Object.entries(PAGES)) {
    await aller(page, route);
    const deborde = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
    expect(deborde, nom).toBe(false);
  }
  await capture(page, '6-sans-debordement-projets');
});

/** Ouvre la fenêtre « Filtres » et coche les premières cases (autant que demandé) : donne des pastilles actives. */
async function activerFiltres(page, combien) {
  await page.locator('[data-action="filtres"]').click();
  const cases = page.getByRole('dialog').locator('input[type="checkbox"]');
  for (let i = 0; i < combien; i++) await cases.nth(i).check();
  await page.getByRole('dialog').getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
}
test('7 avec plusieurs filtres actifs, « Trier par » reste sur la ligne du champ', async ({ page }) => {
  test.skip(estTelephone(page), 'sur téléphone « Trier par » est sur sa propre ligne');
  await connecter(page, JEROME);
  await aller(page, PAGES.affaires);
  await activerFiltres(page, 6);
  await expect(page.locator('.pastille-filtre').nth(2)).toBeVisible();
  const champ = await boite(page);
  const tri = await page.locator('.barre-affaires .selecteur-tri').first().boundingBox();
  expect(tri.y).toBeLessThan(champ.y + champ.height);
  expect(tri.x).toBeGreaterThan(champ.x + champ.width);
  await capture(page, '7-filtres-actifs');
});
test('8 à 820 px de large, le champ garde une largeur utile et rien ne déborde', async ({ page }) => {
  test.skip(estTelephone(page), 'largeur d’ordinateur seulement');
  await page.setViewportSize({ width: 820, height: 900 });
  await connecter(page, JEROME);
  for (const [nom, route] of Object.entries(PAGES)) {
    await aller(page, route);
    const champ = await boite(page);
    expect(champ.width, nom).toBeGreaterThanOrEqual(190);
    expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1), nom).toBe(false);
  }
  await capture(page, '8-largeur-820');
});
