// Module Réseaux sociaux, écran « Fréquentation du site » (14/11/2026), chez Jérôme. Un test par critère, nom commençant par son numéro (Q7 à Q12),
// UNE capture chacun dans tests/e2e/captures/reseauxsociaux-frequentation/ (« -telephone » sur téléphone ; jamais commitée). Données fictives uniquement ;
// Plausible est simulé dans le navigateur (aucun accès au vrai site, aucun vrai lien de partage). Les règles pures : tests/reseauxsociaux-frequentation.test.js.
import { test, expect, connecter, attendreCalme, estTelephone, ecrireDocument, lireDocument } from './outils.js';

const CAPTURES = 'e2e/captures/reseauxsociaux-frequentation';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
const LIEN = 'https://plausible.io/share/site-exemple?auth=jeton-exemple';
const REGLAGE = 'crm_parametres/frequentation_site';

test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});

/** Plausible simulé : une page de tableau de bord fictive (ou une page qui ne répond jamais si `lente`). Note les adresses demandées. */
async function simulerPlausible(page, { lente = false } = {}) {
  const demandees = [];
  await page.route('https://plausible.io/**', async (route) => {
    demandees.push(route.request().url());
    if (lente) return; // jamais de réponse : le cadre ne finit pas de charger
    return route.fulfill({ status: 200, contentType: 'text/html; charset=utf-8', body: '<!doctype html><html lang="fr"><body style="font-family:sans-serif"><h1>Tableau fictif</h1><p>Visiteurs : 42</p><h2>Objectifs</h2><ul><li>Contact formulaire</li><li>Contact téléphone</li><li>Contact WhatsApp</li></ul></body></html>' });
  });
  return demandees;
}
const ouvrir = async (page) => {
  await connecter(page);
  await page.evaluate(() => { location.hash = '#/reseauxsociaux/frequentation'; });
  await expect(page.getByRole('heading', { name: 'Fréquentation du site', level: 1 })).toBeVisible();
  await attendreCalme(page);
};

test('Q7 sans lien enregistré : l’écran dit qu’il n’y a rien et propose de coller le lien (bouton grisé tant que le champ est vide)', async ({ page }) => {
  await simulerPlausible(page);
  await ouvrir(page);
  await expect(page.locator('[data-role="vide-frequentation"]')).toContainText('Aucun tableau de bord relié');
  const enregistrer = page.locator('[data-action="enregistrer-lien"]');
  await expect(enregistrer).toBeDisabled();
  await expect(page.locator('iframe')).toHaveCount(0);
  await expect(page.locator('[data-action="ouvrir-plausible"]')).toHaveCount(0);
  await capture(page, 'Q7-vide');
});

test('Q8 un lien d’un autre site est refusé avec une phrase qui dit quoi faire ; un lien de partage Plausible est enregistré dans les réglages et le tableau s’affiche', async ({ page }) => {
  const demandees = await simulerPlausible(page);
  await ouvrir(page);
  const champ = page.locator('[data-champ="lien-plausible"]');
  await champ.fill('https://exemple.test/share/x?auth=y');
  await page.locator('[data-action="enregistrer-lien"]').click();
  await expect(page.locator('[data-role="erreur-lien"]')).toContainText('Ce lien n’est pas un lien de partage Plausible');
  expect(await lireDocument(REGLAGE)).toBeNull();
  await champ.fill(LIEN);
  await expect(page.locator('[data-role="erreur-lien"]')).toBeHidden();
  await page.locator('[data-action="enregistrer-lien"]').click();
  await expect(page.locator('iframe[data-role="cadre-plausible"]')).toBeVisible();
  expect((await lireDocument(REGLAGE)).lien).toBe(LIEN);
  await expect.poll(() => demandees.length).toBeGreaterThan(0);
  const u = new URL(demandees[0]);
  expect([u.pathname, u.searchParams.get('embed'), u.searchParams.get('auth')]).toEqual(['/share/site-exemple', 'true', 'jeton-exemple']);
});

test('Q9 avec un lien enregistré : le tableau de bord de Plausible est dans le cadre, les trois objectifs de contact y sont, le bouton jaune ouvre Plausible dans un nouvel onglet', async ({ page }) => {
  await simulerPlausible(page);
  await ecrireDocument(REGLAGE, { lien: LIEN });
  await ouvrir(page);
  const cadre = page.frameLocator('iframe[data-role="cadre-plausible"]');
  await expect(cadre.getByText('Visiteurs : 42')).toBeVisible();
  for (const objectif of ['Contact formulaire', 'Contact téléphone', 'Contact WhatsApp']) await expect(cadre.getByText(objectif)).toBeVisible();
  await expect(page.locator('[data-role="intro-frequentation"]')).toContainText('Contact formulaire, Contact téléphone, Contact WhatsApp');
  const ouvrirPlausible = page.locator('[data-action="ouvrir-plausible"]');
  await expect(ouvrirPlausible).toHaveAttribute('href', LIEN);
  await expect(ouvrirPlausible).toHaveAttribute('target', '_blank');
  await expect(ouvrirPlausible).toHaveAttribute('rel', /noopener/);
  await expect(page.locator('[data-role="cadre-bloque"]')).toBeHidden();
  await capture(page, 'Q9-cadre');
});

test('Q10 cadre qui ne répond pas : après dix secondes, un message propose d’ouvrir le tableau dans un nouvel onglet', async ({ page }) => {
  await simulerPlausible(page, { lente: true });
  await ecrireDocument(REGLAGE, { lien: LIEN });
  await ouvrir(page);
  await expect(page.locator('[data-role="cadre-bloque"]')).toBeHidden();
  await expect(page.locator('[data-role="cadre-bloque"]')).toBeVisible({ timeout: 15000 });
  await expect(page.locator('[data-role="cadre-bloque"] a')).toHaveAttribute('href', LIEN);
  await capture(page, 'Q10-cadre-bloque');
});

test('Q11 lecture du lien impossible : message « Connexion impossible » et bouton Réessayer, qui relit et montre le cadre', async ({ page, context }) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'réseau coupé exprès' });
  await simulerPlausible(page);
  await connecter(page);
  // L'écran est ouvert une première fois sans lien (le module est alors chargé), puis le réseau est coupé AVANT que le lien existe en base : la lecture du lien échoue.
  await page.evaluate(() => { location.hash = '#/reseauxsociaux/frequentation'; });
  await expect(page.locator('[data-role="vide-frequentation"]')).toBeVisible();
  await page.evaluate(() => { location.hash = '#/reseauxsociaux/aujourdhui'; });
  await ecrireDocument(REGLAGE, { lien: LIEN });
  await context.setOffline(true);
  await page.evaluate(() => { location.hash = '#/reseauxsociaux/frequentation'; });
  await expect(page.locator('[data-role="erreur-lecture"]')).toContainText('Connexion impossible pour le moment', { timeout: 20000 });
  await capture(page, 'Q11-erreur');
  await context.setOffline(false);
  await page.locator('[data-action="reessayer-lien"]').click();
  await expect(page.locator('iframe[data-role="cadre-plausible"]')).toBeVisible({ timeout: 20000 });
});

test('Q12 changer le lien puis le retirer : le retrait demande confirmation, vide le réglage et ramène à l’écran « aucun lien »', async ({ page }) => {
  await simulerPlausible(page);
  await ecrireDocument(REGLAGE, { lien: LIEN });
  await ouvrir(page);
  await page.locator('[data-action="changer-lien"]').click();
  const champ = page.locator('[data-champ="lien-plausible"]');
  await expect(champ).toHaveValue(LIEN);
  await champ.fill('https://plausible.io/share/autre-site?auth=autre-jeton');
  await page.locator('[data-action="enregistrer-lien"]').click();
  await expect(page.locator('iframe[data-role="cadre-plausible"]')).toBeVisible();
  expect((await lireDocument(REGLAGE)).lien).toBe('https://plausible.io/share/autre-site?auth=autre-jeton');
  await page.locator('[data-action="retirer-lien"]').click();
  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect(page.locator('iframe')).toBeVisible();
  await page.locator('[data-action="retirer-lien"]').click();
  await page.getByLabel('Retirer le lien ?').getByRole('button', { name: 'Retirer le lien' }).click();
  await expect(page.locator('[data-role="vide-frequentation"]')).toBeVisible();
  expect((await lireDocument(REGLAGE)).lien).toBe('');
  await capture(page, 'Q12-retire');
});
