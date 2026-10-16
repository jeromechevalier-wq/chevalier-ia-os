// Chantier 6 : le CRM de Jérôme (racine, règles du CRM) reste STRICTEMENT identique : identité, jaune, bandeau de sauvegarde, célébrations.
import { test, expect, connecter, allerA, creerAffaire, creerPersonne, estTelephone, JEROME } from './outils.js';

const JAUNE = 'rgb(236, 188, 6)';
const couleurDe = (page, selecteur, propriete = 'backgroundColor', pseudo = null) =>
  page.locator(selecteur).first().evaluate((el, [p, ps]) => getComputedStyle(el, ps)[p], [propriete, pseudo]);

test('K1 identité du CRM inchangée : titre, icône, manifeste, baguette, nom dans le menu, aucune marque de client', async ({ page }) => {
  await connecter(page, JEROME);
  await expect(page).toHaveTitle('Chevalier IA OS');
  const t = await page.evaluate(() => ({
    icone: document.head.querySelector('link[rel="icon"]').getAttribute('href'),
    manifeste: document.head.querySelector('link[rel="manifest"]').getAttribute('href'),
    touch: document.head.querySelector('link[rel="apple-touch-icon"]').getAttribute('href'),
    description: document.head.querySelector('meta[name="description"]').content,
    appleTitre: document.head.querySelector('meta[name="apple-mobile-web-app-title"]').content,
    marque: document.documentElement.hasAttribute('data-marque'), feuille: !!document.getElementById('accent-marque'),
  }));
  expect(t).toEqual({ icone: 'assets/logo/favicon.svg', manifeste: 'manifest.webmanifest', touch: 'assets/icons/apple-touch-icon.png', description: 'Espace de travail de Chevalier IA.', appleTitre: 'Chevalier OS', marque: false, feuille: false });
  await expect(page.locator('.menu-marque')).toContainText('Chevalier IA OS');
  await expect(page.locator('.menu-marque .baguette')).toHaveCount(1);
});

for (const theme of ['sombre', 'clair']) {
  test(`K2 couleurs de l'interface du CRM identiques (jaune de Jérôme), thème ${theme}`, async ({ page }) => {
    await connecter(page, JEROME);
    if (theme === 'clair') {
      if (estTelephone(page)) await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
      await page.locator('[data-role="bascule-theme"]').first().click();
      if (estTelephone(page)) await page.locator('.voile-menu').click({ position: { x: 380, y: 400 } });
    }
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await couleurDe(page, '.page-accueil .bouton-principal')).toBe(JAUNE);
    expect(await couleurDe(page, '.page-accueil .bouton-principal', 'color')).toBe('rgb(41, 41, 44)');
    expect(await couleurDe(page, '.bouton-plus')).toBe(JAUNE);
    expect(await couleurDe(page, '.menu-entree.actif', 'backgroundColor')).toBe('rgba(236, 188, 6, 0.15)');
    expect(await couleurDe(page, '.menu-entree.actif', 'backgroundColor', '::before')).toBe(JAUNE);
    expect(await couleurDe(page, '.menu-entree.actif .icone', 'color')).toBe(theme === 'sombre' ? JAUNE : 'rgb(122, 95, 0)');
    expect(await couleurDe(page, '.section-tete h2 .icone', 'color')).toBe(theme === 'sombre' ? JAUNE : 'rgb(122, 95, 0)');
    const jetons = await page.evaluate(() => {
      const s = getComputedStyle(document.documentElement);
      return Object.fromEntries(['--accent', '--sur-accent', '--accent-survol', '--accent-trait', '--lien', '--accent-a1f', '--accent-a26', '--accent-a33', '--accent-a99'].map((j) => [j, s.getPropertyValue(j).trim()]));
    });
    expect(jetons).toEqual({
      '--accent': '#ecbc06', '--sur-accent': '#29292c', '--accent-survol': '#ffe56c', '--accent-trait': '#ecbc06', '--lien': theme === 'sombre' ? '#ecbc06' : '#7a5f00',
      '--accent-a1f': '#ecbc061f', '--accent-a26': '#ecbc0626', '--accent-a33': '#ecbc0633', '--accent-a99': '#ecbc0699',
    });
  });
}

test('K3 bandeau « Pense à ta sauvegarde mensuelle », objectifs, Charles dans les écrans vides : toujours là au CRM de Jérôme', async ({ page }) => {
  await connecter(page, JEROME);
  await expect(page.locator('.rappel-export')).toContainText('Pense à ta sauvegarde mensuelle');
  await expect(page.locator('.section-objectifs')).toBeVisible();
  await allerA(page, 'Personnes');
  await expect(page.locator('.charles-vide').first()).toBeVisible();
});

test('K4 réglages, comptes Jérôme / Charles dans les listes, dossier de travail : toujours là au CRM de Jérôme', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Camille Dubois' });
  await creerAffaire('a1', { titre: 'Audit du lac', personneId: 'p1', etape: 'proposition_envoyee' });
  await connecter(page, JEROME);
  await allerA(page, 'Réglages');
  await expect(page.locator('#reglages-objectifs')).toBeVisible();
  await page.evaluate(() => { location.hash = '#/crm/affaires/a1'; });
  await expect(page.locator('input.titre-editable')).toHaveValue('Audit du lac');
  await expect(page.locator('select[aria-label="Propriétaire"] option')).toHaveText(['Jérôme', 'Charles']);
  await expect(page.locator('[data-prop="dossier"]')).toHaveCount(1);
  await expect(page.locator('[data-prop="github"]')).toHaveCount(0); // plus de champ GitHub (une ancienne adresse serait reprise comme lien)
});

test('K5 célébration « Bravo Jérôme ! » toujours montrée quand une affaire est gagnée au CRM de Jérôme', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Camille Dubois' });
  await creerAffaire('a1', { titre: 'Audit du lac', personneId: 'p1', etape: 'proposition_envoyee' });
  await connecter(page, JEROME);
  await page.evaluate(() => { location.hash = '#/crm/affaires/a1'; });
  await expect(page.locator('input.titre-editable')).toHaveValue('Audit du lac');
  await page.locator('[data-action="gagnee"]').click();
  await expect(page.locator('.celebration')).toContainText('Bravo Jérôme !');
});
