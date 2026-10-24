// La recherche du haut et le gros bouton « + » ne s'affichent que sur l'Accueil, Personnes, Organisations, Affaires et Projets (demande de Jérôme, 24/10/2026).
// Un test par point (le nom commence par le numéro). Captures dans tests/e2e/captures/barre-outils-pages/.
// Cas vide : aucun (rien n'est lu). Cas d'erreur : une adresse inconnue n'affiche pas la barre non plus.
import { test, expect, connecter, estTelephone, JEROME } from './outils.js';

const aller = (page, hash) => page.evaluate((h) => { location.hash = h; }, hash);
const DOSSIER = 'e2e/captures/barre-outils-pages';
const capture = (page, nom) => page.screenshot({ path: `${DOSSIER}/${nom}${estTelephone(page) ? '-telephone' : '-ordinateur'}.png`, animations: 'disabled' });
const AVEC = ['#/crm/accueil', '#/crm/personnes', '#/crm/organisations', '#/crm/affaires', '#/projets/projets'];
const SANS = ['#/devis/liste', '#/devis/bordereau', '#/veille/contenus', '#/automatisations/historique', '#/tableaudebord/general', '#/crm/journal', '#/mcp/infos', '#/reglages'];

/** Sur ordinateur la recherche et le « + » sont dans la barre ; sur téléphone ce sont deux petits boutons de la barre du haut. */
async function barreVisible(page) {
  const tel = estTelephone(page);
  const recherche = tel ? page.locator('[data-role="ouvrir-recherche"]') : page.locator('[data-role="recherche-globale"]');
  const plus = tel ? page.locator('.bouton-plus-mobile') : page.locator('[data-role="bouton-plus"]');
  return { recherche, plus };
}

test('1 les cinq pages du CRM gardent la recherche et le bouton « + »', async ({ page }) => {
  await connecter(page, JEROME);
  for (const hash of AVEC) {
    await aller(page, hash);
    const { recherche, plus } = await barreVisible(page);
    await expect(recherche, hash).toBeVisible();
    await expect(plus, hash).toBeVisible();
  }
  await aller(page, '#/crm/accueil');
  await capture(page, '1-accueil-avec-barre');
});

test('2 Devis, Veille, Automatisations, Maintenance, journal et connexion de l’assistant n’ont ni recherche ni bouton « + »', async ({ page }) => {
  await connecter(page, JEROME);
  for (const hash of SANS) {
    await aller(page, hash);
    const { recherche, plus } = await barreVisible(page);
    await expect(recherche, hash).toBeHidden();
    await expect(plus, hash).toBeHidden();
  }
  await aller(page, '#/devis/liste');
  await capture(page, '2-devis-sans-barre');
});

test('3 les touches « / » et « n » ne font rien là où la barre est cachée, et fonctionnent sur Affaires', async ({ page }) => {
  await connecter(page, JEROME);
  // Un écouteur lit si l'application a pris la touche (preventDefault) : c'est ce qui prouve que le raccourci est actif ou non.
  await page.evaluate(() => { window.__prises = []; window.addEventListener('keydown', (e) => window.__prises.push([e.key, e.defaultPrevented])); });
  const prise = async (touche) => {
    await page.evaluate(() => { window.__prises = []; });
    await page.keyboard.press(touche);
    return page.evaluate(() => window.__prises.at(-1)?.[1] ?? null);
  };
  await aller(page, '#/devis/liste');
  expect(await prise('/')).toBe(false);
  expect(await prise('n')).toBe(false);
  await aller(page, '#/crm/affaires');
  const { recherche, plus } = await barreVisible(page);
  await expect(recherche).toBeVisible();
  await expect(plus).toBeVisible();
  if (!estTelephone(page)) {
    expect(await prise('/')).toBe(true);
    await page.keyboard.press('Escape');
  }
});
