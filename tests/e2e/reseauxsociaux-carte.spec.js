// Module Réseaux sociaux, carte mentale d'une source (13/11/2026), chez Jérôme (racine, règles du CRM). Un test par point du brief (H1 à H3), nom commençant par son numéro,
// UNE capture dans tests/e2e/captures/reseauxsociaux-carte/ (« -telephone » sur téléphone ; jamais commitée). Données fictives uniquement ; Buffer est simulé (aucun serveur réel).
import { test, expect, connecter, ecrireDocument, estTelephone } from './outils.js';

const CAPTURES = 'e2e/captures/reseauxsociaux-carte';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
async function ouvrir(page) {
  await page.route(/cloudfunctions\.net\/reseauxsociauxBuffer$/, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ result: { ok: true, lueLe: new Date().toISOString(), canal: { id: 'canal-fictif', nom: 'Canal fictif', service: 'linkedin' }, posts: [] } }) });
  });
  await connecter(page);
  await page.evaluate(() => { location.hash = '#/reseauxsociaux/inspirations'; });
  await expect(page.getByRole('heading', { name: 'Inspirations', level: 1 })).toBeVisible();
}
const sansDebordement = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const fenetre = (page) => page.getByRole('dialog', { name: 'Carte : Site Exemple' });
const base = { sourceId: 's1', sourceTitre: 'Site Exemple', sourceType: 'site', note: '', ancre: '', url: '', exempleId: null, format: null, service: null, etat: 'nouvelle', ideeId: null, lot: '2026-11-13-collage', auteur: 'claude' };
const source = () => ecrireDocument('reseauxsociaux_inspirations/s1', { type: 'site', nom: 'Site Exemple', url: 'https://site-exemple.test/', pourquoi: '', piliers: [], formats: [], ordre: 0 });

test('H1 de bout en bout : la source au centre, deux branches, trois pistes avec la bonne marque d’état ; replier une branche cache ses pistes ; un clic sur une piste ferme la carte et l’ouvre dans la liste', async ({ page }) => {
  await source();
  await ecrireDocument('reseauxsociaux_pistes/a', { ...base, angle: 'Premier angle en stock', pilier: 'pedagogie' });
  await ecrireDocument('reseauxsociaux_pistes/b', { ...base, angle: 'Un angle retenu', pilier: 'cas_concrets', etat: 'retenue' });
  await ecrireDocument('reseauxsociaux_pistes/c', { ...base, angle: 'Un angle écarté', pilier: 'cas_concrets', etat: 'ecartee' });
  await ouvrir(page);
  const ligne = page.locator('[data-inspiration="s1"]');
  await expect(ligne.locator('[data-role="compteurs-source"]')).toHaveText('3 pistes · 1 retenue · 0 postée');
  await ligne.locator('[data-action="carte-source"]').click();
  const f = fenetre(page);
  await expect(f).toBeVisible();
  // la source est au centre, deux branches (un pilier chacune), trois pistes
  const centre = f.locator('[data-role="centre-carte"]');
  await expect(centre).toContainText('Site Exemple');
  await expect(f.locator('[data-role="branche-carte"]')).toHaveCount(2);
  await expect(f.locator('[data-role="piste-carte"]')).toHaveCount(3);
  const cx = await centre.evaluate((el) => { const r = el.getBoundingClientRect(); const s = el.ownerSVGElement.getBoundingClientRect(); return Math.abs((r.left + r.width / 2) - (s.left + s.width / 2)); });
  expect(cx).toBeLessThan(2);
  // chaque piste porte la marque de son état (la même que la liste), et la couleur de son pilier
  for (const [id, etat] of [['a', 'stock'], ['b', 'retenue'], ['c', 'ecartee']]) {
    const p = f.locator(`[data-role="piste-carte"][data-piste="${id}"]`);
    await expect(p).toHaveAttribute('data-etat', etat);
    await expect(p.locator('[data-role="marque-carte"]')).toHaveAttribute('data-etat', etat);
  }
  await expect(f.locator('[data-role="branche-carte"][data-branche="pedagogie"]')).toContainText('Pédagogie et méthodes');
  await capture(page, 'H1-carte');
  // replier une branche : ses pistes disparaissent, son nombre apparaît ; la déplier les ramène
  const concrets = f.locator('[data-role="branche-carte"][data-branche="cas_concrets"]');
  await expect(concrets).toHaveAttribute('aria-expanded', 'true');
  await concrets.click();
  await expect(f.locator('[data-role="branche-carte"][data-branche="cas_concrets"]')).toHaveAttribute('aria-expanded', 'false');
  await expect(f.locator('[data-role="branche-carte"][data-branche="cas_concrets"]')).toContainText('Cas concrets (2)');
  await expect(f.locator('[data-role="piste-carte"]')).toHaveCount(1);
  await f.locator('[data-role="branche-carte"][data-branche="cas_concrets"]').press('Enter');
  await expect(f.locator('[data-role="piste-carte"]')).toHaveCount(3);
  // un clic sur une piste : la carte se ferme, la source est dépliée et la piste est dans la liste (en relief)
  await f.locator('[data-role="piste-carte"][data-piste="b"]').click();
  await expect(f).toHaveCount(0);
  await expect(ligne.locator('[data-action="deplier-source"]')).toHaveAttribute('aria-expanded', 'true');
  await expect(ligne.locator('[data-piste="b"]')).toBeVisible();
  await expect(ligne.locator('[data-piste="b"]')).toHaveClass(/rs-piste-ouverte/);
  expect(await sansDebordement(page)).toBe(true);
  // la carte ne modifie rien
  await expect(ligne.locator('[data-role="compteurs-source"]')).toHaveText('3 pistes · 1 retenue · 0 postée');
});

test('H2 au-delà de 30 pistes toutes les branches s’ouvrent repliées avec leur nombre ; on en déplie une ; la page ne déborde pas (aussi en format téléphone)', async ({ page }) => {
  test.setTimeout(90_000);
  await source();
  for (let k = 0; k < 31; k++) await ecrireDocument(`reseauxsociaux_pistes/p${k}`, { ...base, angle: `Angle numéro ${k}`, pilier: k % 2 ? 'pedagogie' : 'cas_concrets' });
  await ouvrir(page);
  await page.locator('[data-inspiration="s1"] [data-action="carte-source"]').click();
  const f = fenetre(page);
  await expect(f.locator('[data-role="branche-carte"]')).toHaveCount(2);
  await expect(f.locator('[data-role="piste-carte"]')).toHaveCount(0);
  await expect(f.locator('[data-role="branche-carte"][data-branche="cas_concrets"]')).toContainText('Cas concrets (16)');
  await expect(f.locator('[data-role="branche-carte"][data-branche="pedagogie"]')).toContainText('Pédagogie et méthodes (15)');
  await f.locator('[data-role="branche-carte"][data-branche="pedagogie"]').click();
  await expect(f.locator('[data-role="piste-carte"]')).toHaveCount(15);
  expect(await sansDebordement(page)).toBe(true);
  // le dessin défile DANS son cadre (jamais la page)
  const cadre = f.locator('[data-role="cadre-carte"]');
  const { client, defile } = await cadre.evaluate((el) => ({ client: el.clientWidth, defile: el.scrollWidth }));
  expect(defile).toBeGreaterThanOrEqual(client);
  if (estTelephone(page)) expect(defile).toBeGreaterThan(client);
  await capture(page, 'H2-carte-repliee');
});

test('H3 une source sans piste : la carte dit clairement qu’il n’y a rien à montrer ; Échap la ferme', async ({ page }) => {
  await source();
  await ouvrir(page);
  await page.locator('[data-inspiration="s1"] [data-action="carte-source"]').click();
  const f = fenetre(page);
  await expect(f.locator('[data-role="resume-carte"]')).toContainText('Aucune piste pour le moment');
  await expect(f.locator('[data-role="centre-carte"]')).toContainText('Site Exemple');
  await expect(f.locator('[data-role="branche-carte"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await expect(f).toHaveCount(0);
});
