// Tests D exécutés dans le navigateur : aucun service worker, manifeste servi, domaines chargés.
import { test, expect, connecter, allerA, creerFiche } from './outils.js';

const HOTES_AUTORISES = [
  /^localhost$/, /^127\.0\.0\.1$/, // appli et émulateurs pendant les tests
  /^www\.gstatic\.com$/, /(^|\.)googleapis\.com$/, // SDK Firebase et API Google
  /^apis\.google\.com$/, /^accounts\.google\.com$/, /(^|\.)firebaseapp\.com$/, /^chevalier-ia-os\.web\.app$/, // connexion Google
];

test('D1 aucun service worker enregistré, manifeste valide et icônes servies', async ({ page, request }) => {
  await connecter(page);
  expect(await page.evaluate(async () => (navigator.serviceWorker ? (await navigator.serviceWorker.getRegistrations()).length : 0))).toBe(0);
  expect(await page.evaluate(() => !!navigator.serviceWorker?.controller)).toBe(false);
  const lien = await page.locator('link[rel="manifest"]').getAttribute('href');
  const manifeste = await (await request.get(`/${lien}`)).json();
  expect(manifeste).toMatchObject({ name: 'Chevalier IA OS', short_name: 'Chevalier OS', display: 'standalone' });
  for (const icone of manifeste.icons) {
    const r = await request.get(`/${icone.src}`);
    expect(r.status(), icone.src).toBe(200);
  }
  expect(await page.locator('meta[name="robots"]').getAttribute('content')).toBe('noindex');
  expect(await page.locator('meta[name="apple-mobile-web-app-capable"]').getAttribute('content')).toBe('yes');
  expect((await request.get('/assets/icons/apple-touch-icon.png')).status()).toBe(200);
});

test('D2 aucune ressource chargée hors de gstatic.com, googleapis.com et des domaines Google de connexion', async ({ page }) => {
  const hotes = new Set();
  page.on('request', (r) => {
    const u = new URL(r.url());
    if (u.protocol === 'data:' || u.protocol === 'blob:') return;
    hotes.add(u.hostname);
  });
  await creerFiche('d2', { nom: 'Contrôle Domaines' });
  await connecter(page);
  for (const vue of ['Kanban', 'Liste', 'Réglages', 'Accueil']) {
    await allerA(page, vue);
    await expect(page.locator('.page')).toBeVisible();
  }
  const interdits = [...hotes].filter((h) => !HOTES_AUTORISES.some((re) => re.test(h)));
  expect(interdits).toEqual([]);
  expect(hotes.has('www.gstatic.com')).toBe(true);
});
