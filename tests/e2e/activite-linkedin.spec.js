// Type d'activité « LinkedIn » (nuit du 11/11/2026) : B2 (cinq pastilles, icône, Appel d'office, aucun débordement) et B5 (saisie libre à l'écran).
// Un test par critère (nom commençant par B2 / B5), une capture par critère dans tests/e2e/captures/activite-linkedin/. Données fictives.
import { test, expect, attendreCalme, connecter, creerAffaire, listerDocuments, estTelephone } from './outils.js';

const CAPTURES = 'e2e/captures/activite-linkedin';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
// Ces écrans n'utilisent pas Google : le script de l'API est remplacé par un fichier vide.
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});
async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }
const groupe = (page) => page.locator('.panneau-activite').getByRole('group', { name: 'Type d’activité' });

test('B2 la fiche propose cinq pastilles dont LinkedIn (icône poignée de main) ; Appel reste choisi d’office ; rien ne déborde', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  await expect(groupe(page).getByRole('button')).toHaveText(['Appel', 'Rendez vous', 'Email', 'Tâche', 'LinkedIn']);
  await expect(groupe(page).locator('.pastille-type.actif')).toHaveText('Appel');
  await expect(groupe(page).getByRole('button', { name: 'LinkedIn' }).locator('svg')).toBeVisible();
  const trace = await groupe(page).getByRole('button', { name: 'LinkedIn' }).locator('svg').innerHTML();
  expect(trace).toContain('m11 17 2 2a1 1 0 1 0 3-3'); // le dessin « handshake »
  // Aucun débordement horizontal : la page ne défile pas de côté et chaque pastille reste dans la largeur de l'écran.
  const largeur = page.viewportSize().width;
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  for (const b of await groupe(page).getByRole('button').all()) {
    const boite = await b.boundingBox();
    expect(boite.x + boite.width).toBeLessThanOrEqual(largeur);
  }
  await capture(page, 'B2-pastilles');
});

test('B5 une activité LinkedIn de 250 caractères saisie à la main est acceptée, sans limite imposée à l’écran', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  const long = 'a'.repeat(250);
  await groupe(page).getByRole('button', { name: 'LinkedIn' }).click();
  await page.locator('.panneau-activite').getByLabel('Titre de l’activité').fill(long);
  await capture(page, 'B5-saisie');
  await page.locator('[data-action="enregistrer-activite"]').click();
  await expect.poll(async () => (await listerDocuments('crm_activites')).map((d) => [d.type, d.titre.length, d.fait])).toEqual([['linkedin', 250, false]]);
});
