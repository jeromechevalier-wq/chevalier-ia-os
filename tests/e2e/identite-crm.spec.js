// Chantier 6 : le CRM de Jérôme (racine, règles du CRM) reste STRICTEMENT identique : identité, jaune, bandeau de sauvegarde, célébrations.
import { test, expect, connecter, allerA, allerAuxReglagesCrm, ouvrirSectionReglages, basculerThemeParMenu, creerAffaire, creerPersonne, estTelephone, JEROME } from './outils.js';

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
  // PR B : l'en-tête est le même chez Jérôme et chez un client (nom + logo + initiale du compte), plus de photo dans le menu
  await expect(page.locator('.menu .menu-compte .avatar-initiale')).toHaveText('J');
  await expect(page.locator('.menu img.avatar')).toHaveCount(0);
  await expect(page.locator('.menu-marque b')).toHaveText('OS'); // le « OS » jaune de la marque est resté
  await expect(page.locator('.menu-marque .baguette')).toHaveCount(1);
});

for (const theme of ['sombre', 'clair']) {
  test(`K2 couleurs de l'interface du CRM identiques (jaune de Jérôme), thème ${theme}`, async ({ page }) => {
    await connecter(page, JEROME);
    if (theme === 'clair') {
      await basculerThemeParMenu(page);
      if (estTelephone(page)) await page.locator('.voile-menu').click({ position: { x: 380, y: 400 } });
    }
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    expect(await couleurDe(page, '.bouton-plus')).toBe(JAUNE);
    expect(await couleurDe(page, '.menu-entree.actif', 'backgroundColor')).toBe('rgba(236, 188, 6, 0.15)');
    expect(await couleurDe(page, '.menu-entree.actif', 'backgroundColor', '::before')).toBe(JAUNE);
    expect(await couleurDe(page, '.menu-entree.actif .icone', 'color')).toBe(theme === 'sombre' ? JAUNE : 'rgb(122, 95, 0)');
    expect(await couleurDe(page, '.section-tete h2 .icone', 'color')).toBe(theme === 'sombre' ? JAUNE : 'rgb(122, 95, 0)');
    // I18 (21/10/2026) : l'Accueil n'a plus de bouton « + Personne » ; le bouton principal se lit sur la page Personnes.
    await allerA(page, 'Personnes');
    expect(await couleurDe(page, '.page-actions .bouton-principal')).toBe(JAUNE);
    expect(await couleurDe(page, '.page-actions .bouton-principal', 'color')).toBe('rgb(41, 41, 44)');
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
  await allerAuxReglagesCrm(page);
  await expect(page.locator('#reglages-objectifs')).toBeVisible();
  await page.evaluate(() => { location.hash = '#/crm/affaires/a1'; });
  await expect(page.locator('input.titre-editable')).toHaveValue('Audit du lac');
  await page.locator('[data-prop="proprietaire"] .prop-modifier').click();
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
  await page.locator('[data-action="choisir-etape"]').selectOption({ label: 'Gagné' }); // J9 : plus de bouton « Gagnée », on passe par la liste « Étape »
  await expect(page.locator('.celebration')).toContainText('Bravo Jérôme !');
});

test('K5 Réglages à menu latéral chez Jérôme : l\'espace d\'abord, puis les modules ; le CRM garde tous ses réglages ; menu CRM en un seul bloc', async ({ page }) => {
  await connecter(page, JEROME);
  // menu principal : un seul bloc « CRM » avec ses sept écrans dans l'ordre (Modèles est dans les Réglages)
  await expect(page.locator('.menu .menu-groupe[data-bloc="crm"] .menu-entree')).toHaveText(['Accueil', 'Personnes', 'Organisations', 'Affaires', 'Projets']);
  await expect(page.locator('.menu .menu-groupe[data-bloc="projets"]')).toHaveCount(0);
  await allerA(page, 'Réglages');
  await expect(page).toHaveURL(/#\/reglages$/);
  await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible();
  await expect(page.locator('.reglages-menu-lien')).toHaveText(['Mon espace', 'Modules actifs', 'Affaires et projets', 'Devis', 'Veille', 'Automatisations', 'Maintenance', 'Connecter mon assistant']); // pas de « Membres et rôles » à la racine (les comptes sont dans les règles)
  await expect(page.locator('.reglages-menu-lien[aria-current="page"]')).toHaveText('Mon espace');
  await expect(page.locator('[data-info="nom"]')).toContainText('Chevalier IA OS');
  await expect(page.locator('#reglages-theme')).toBeVisible();
  if (!estTelephone(page)) await expect(page.locator('.reglages-menu-bouton')).toBeHidden(); // sur ordinateur le menu reste déplié
  await ouvrirSectionReglages(page, 'Modules actifs');
  await expect(page.locator('[data-interrupteur="crm"]')).toBeChecked();
  await expect(page.locator('[data-interrupteur="mcp"]')).toBeChecked(); // « Connecter mon assistant » existe aussi chez Jérôme (PR B)
  await ouvrirSectionReglages(page, 'Affaires et projets');
  await expect(page).toHaveURL(/#\/reglages\/crm$/);
  for (const id of ['etapes', 'phases', 'options', 'modeles-affaire', 'modeles-projets', 'objectifs', 'offres', 'secteurs', 'sources', 'etiquettes', 'filtres', 'debut', 'export']) await expect(page.locator(`#reglages-${id}`), id).toBeVisible();
  await expect(page.locator('.reglages-raccourcis .reglages-raccourci').first()).toBeVisible();
  await page.locator('.reglages-raccourci[data-vers="reglages-export"]').click();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'pas de défilement horizontal').toBe(true);
  // une section d'espace ne s'affiche pas deux fois et le thème n'est plus dans le CRM
  await expect(page.locator('#reglages-theme')).toHaveCount(0);
  await ouvrirSectionReglages(page, 'Veille');
  await expect(page.locator('[data-role="aucun-reglage"]')).toContainText('Aucun réglage');
  await page.evaluate(() => { location.hash = '#/reglages/membres'; }); // pas de membres à la racine : retour à l'arrivée
  await expect(page).toHaveURL(/#\/reglages$/);
});
