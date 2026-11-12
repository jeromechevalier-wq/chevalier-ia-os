// Module Réseaux sociaux : la barre d'onglets reste EXACTEMENT au même endroit sur les 6 écrans (12/11/2026, captures de Jérôme : la barre sautait d'un écran à l'autre).
// Cause : largeurs de page différentes (Import 920 px, Relations pleine largeur) et hauteurs d'en-tête différentes (sous-titre « 34 posts » présent ou non, boutons de hauteurs inégales).
// Le test mesure la position (x, y) et la largeur de la barre sur chaque écran et exige l'égalité à 1 px près. Données fictives uniquement ; Buffer est simulé dans le navigateur.
import { test, expect, connecter, creerPersonne, attendreCalme } from './outils.js';

test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
const ECRANS = [['aujourdhui', 'Aujourd’hui'], ['posts', 'Posts'], ['idees', 'Idées'], ['inspirations', 'Inspirations'], ['relations', 'Relations'], ['import', 'Import']];

test('Les 6 écrans du module gardent la barre d’onglets à la même position et à la même largeur', async ({ page }) => {
  await page.route(/cloudfunctions\.net\/reseauxsociauxBuffer$/, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ result: { ok: true, lueLe: new Date().toISOString(), canal: { id: 'canal-fictif', nom: 'Canal fictif', service: 'linkedin' }, posts: [] } }) });
  });
  await creerPersonne('ong-1', { nom: 'Alice Exemple' });
  await creerPersonne('ong-2', { nom: 'Bastien Exemple' });
  await connecter(page);
  const mesures = [];
  for (const [route, titre] of ECRANS) {
    await page.evaluate((r) => { location.hash = `#/reseauxsociaux/${r}`; }, route);
    await expect(page.getByRole('heading', { name: titre, level: 1 })).toBeVisible();
    await attendreCalme(page);
    const barre = page.locator('main nav.onglets[aria-label="Écrans des réseaux sociaux"], nav.onglets[aria-label="Écrans des réseaux sociaux"]').first();
    await expect(barre).toBeVisible();
    const boite = await barre.boundingBox();
    expect(boite, `barre introuvable sur ${route}`).not.toBeNull();
    mesures.push({ route, x: boite.x, y: boite.y, largeur: boite.width, hauteur: boite.height });
    // Pas de défilement horizontal de la page : un tableau large défile dans son propre conteneur.
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), `débordement horizontal sur ${route}`).toBe(true);
  }
  const ref = mesures[0];
  for (const m of mesures) {
    expect(Math.abs(m.x - ref.x), `x de ${m.route} : ${JSON.stringify(mesures)}`).toBeLessThanOrEqual(1);
    expect(Math.abs(m.y - ref.y), `y de ${m.route} : ${JSON.stringify(mesures)}`).toBeLessThanOrEqual(1);
    expect(Math.abs(m.largeur - ref.largeur), `largeur de ${m.route} : ${JSON.stringify(mesures)}`).toBeLessThanOrEqual(1);
  }
});
