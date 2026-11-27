// Photos du métier du client sur la page de connexion d'une maison (27/11/2026) : /maison/connexion-1.jpg à -3.jpg, copiées avant le déploiement
// par scripts/copier-photos-maison.js, jamais dans le dépôt. Les images de ces tests sont fabriquées ici (aplats de couleur avec « Photo d'essai N »),
// jamais les vraies photos d'un client. Captures dans tests/e2e/captures/connexion-photos/ (nommées avec le projet : ordinateur ou téléphone).
// Logique sans navigateur : tests/connexion-photos.test.js ; script de copie : tests/connexion-photos-copie.test.js.
import { fileURLToPath } from 'node:url';
import { test, expect, URL_APP, PROJET, FIRESTORE } from './outils.js';
import { semerFicheEmulateur } from '../_fiche-emulateur.js';

const DOSSIER = fileURLToPath(new URL('./captures/connexion-photos/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
const HOTE = new URL(FIRESTORE).host;
const semer = (document, fiche) => semerFicheEmulateur({ projet: PROJET, hote: HOTE, document, fiche });
const NOM = 'Maison d’essai';
const bouton = (page) => page.getByRole('button', { name: 'Se connecter avec Google' });
const COULEURS = ['#8a6d3b', '#4f6d7a', '#6b8f71'];

/**
 * Fabrique 3 images JPEG neutres dans le navigateur (canvas) et sert /maison/connexion-N.jpg avec (ETag "essai-N"). Renvoie la liste des demandes.
 * `attente` = délai (ms) avant la réponse, par numéro de photo (ex. { 2: 1500 }).
 */
async function servirPhotosEssai(page, nombre = 3, { attente = {} } = {}) {
  await page.goto('about:blank');
  const images = await page.evaluate((couleurs) => couleurs.map((c, i) => {
    const t = document.createElement('canvas'); t.width = 1024; t.height = 768;
    const g = t.getContext('2d');
    g.fillStyle = c; g.fillRect(0, 0, 1024, 768);
    g.fillStyle = 'rgba(255,255,255,.35)'; for (let x = 0; x < 1024; x += 128) g.fillRect(x, 0, 4, 768);
    g.fillStyle = '#fff'; g.font = 'bold 64px sans-serif'; g.fillText(`Photo d’essai ${i + 1}`, 220, 400);
    return t.toDataURL('image/jpeg', 0.8).split(',')[1];
  }), COULEURS);
  const demandes = [];
  await page.route(/\/maison\/connexion-(\d+)\.jpg(\?.*)?$/, async (route) => {
    const n = Number(/connexion-(\d+)\.jpg/.exec(route.request().url())[1]);
    demandes.push(`${route.request().method()} ${n}`);
    if (n > nombre) return route.fallback(); // route par défaut des tests : 404, comme une maison qui n'a pas cette photo
    if (attente[n]) await new Promise((ok) => setTimeout(ok, attente[n]));
    return route.fulfill({ status: 200, contentType: 'image/jpeg', headers: { ETag: `"essai-${n}"` }, body: Buffer.from(images[n - 1], 'base64') });
  });
  return demandes;
}
/** Grand écran (3 photos demandées et montrées) ou téléphone (une seule). */
const grandEcran = (info) => info.project.name === 'ordinateur';
/** Centre horizontal du titre (le formulaire). */
const centreTitre = (page) => page.getByRole('heading', { level: 1 }).evaluate((el) => { const r = el.getBoundingClientRect(); return r.x + r.width / 2; });

test('1 maison sans photos : page de connexion neutre comme avant, aucune image (ni cassée), une seule demande, aucune erreur dans la console', async ({ page }, info) => {
  await semer('public', { mode_crm: true, nom_espace: NOM });
  const demandes = [];
  const statuts = [];
  page.on('request', (r) => { if (r.url().includes('/maison/')) demandes.push(r.url()); });
  page.on('response', (r) => { if (r.url().includes('/maison/')) statuts.push(r.status()); });
  await page.goto(`${URL_APP}#/crm/accueil`);
  await expect(bouton(page)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(NOM);
  // C8 : la route par défaut des tests répond le vrai 404 (plus de faux 200) ; la console ne l'excepte que pour cette adresse (C20).
  await expect.poll(() => statuts).toEqual([404]);
  await expect.poll(() => demandes.length).toBe(1);
  await page.waitForTimeout(300);
  await expect(page.locator('.connexion-photos')).toHaveCount(0);
  await expect(page.locator('.connexion-ecran')).not.toHaveClass(/avec-photos/);
  await expect(page.locator('.connexion img')).toHaveCount(1); // la seule image : la baguette de la marque
  expect(demandes).toEqual([expect.stringMatching(/\/maison\/connexion-1\.jpg$/)]);
  await capturer(page, info, '1-maison-sans-photos');
});

test('1 maison avec 3 photos : photos à côté du formulaire (fondu), formulaire et bouton Google inchangés ; téléphone : une seule demandée (C6)', async ({ page }, info) => {
  await semer('public', { mode_crm: true, nom_espace: NOM });
  const demandes = await servirPhotosEssai(page);
  await page.goto(`${URL_APP}#/crm/accueil`);
  await expect(bouton(page)).toBeVisible();
  const panneau = page.locator('.connexion-photos');
  await expect(panneau).toBeVisible();
  await expect(panneau).toHaveAttribute('aria-hidden', 'true');
  const nombre = grandEcran(info) ? 3 : 1;
  await expect(panneau.locator('img.connexion-photo')).toHaveCount(nombre);
  await expect(panneau.locator('img.connexion-photo.visible')).toHaveCount(1);
  // C2 : l'image est demandée avec sa version (ETag de la réponse HEAD), pour ne pas ressortir une ancienne photo du cache d'un an.
  await expect(panneau.locator('img.connexion-photo').first()).toHaveAttribute('src', '/maison/connexion-1.jpg?v=essai-1');
  await expect(panneau.locator('img.connexion-photo').first()).toHaveAttribute('alt', '');
  await expect.poll(() => panneau.locator('img.connexion-photo').first().evaluate((im) => im.complete && im.naturalWidth)).toBe(1024);
  expect(demandes.filter((d) => d.startsWith('HEAD')).sort()).toEqual(grandEcran(info) ? ['HEAD 1', 'HEAD 2', 'HEAD 3'] : ['HEAD 1']);
  expect(demandes.filter((d) => d.startsWith('GET')).sort()).toEqual(grandEcran(info) ? ['GET 1', 'GET 2', 'GET 3'] : ['GET 1']);
  await expect(page.locator('.connexion-ecran')).toHaveClass(/avec-photos/);
  if (grandEcran(info)) {
    // Grand écran : formulaire à gauche, photos à droite, sans se chevaucher (après l'ouverture douce).
    await expect.poll(async () => (await panneau.boundingBox()).width).toBeGreaterThan(600);
    // Le formulaire glisse vers la gauche : attendre la fin du glissement avant de comparer.
    await expect.poll(async () => {
      const form = await page.locator('.connexion').boundingBox();
      const photos = await panneau.boundingBox();
      return photos.x - (form.x + form.width);
    }).toBeGreaterThanOrEqual(-1);
  }
  await page.waitForTimeout(1400); // fin du fondu d'apparition
  await capturer(page, info, '1-maison-avec-photos');
});

test('1 maison avec une seule photo : une photo, pas de fondu ; maison de Jérôme : aucune photo demandée', async ({ page }, info) => {
  await semer('public', { mode_crm: true, nom_espace: NOM });
  await servirPhotosEssai(page, 1);
  await page.goto(`${URL_APP}#/crm/accueil`);
  await expect(page.locator('.connexion-photos img.connexion-photo')).toHaveCount(1);
  // Maison de Jérôme (champs absents) : la page d'avant, aucune demande vers /maison/.
  await semer('public', { mode_crm: true });
  const demandes = [];
  page.on('request', (r) => { if (r.url().includes('/maison/')) demandes.push(r.url()); });
  await page.goto('about:blank');
  await page.goto(`${URL_APP}#/crm/accueil`);
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Chevalier IA OS');
  await expect(page.locator('img[src*="charles-portrait"]')).toHaveCount(1);
  await page.waitForTimeout(500);
  await expect(page.locator('.connexion-photos')).toHaveCount(0);
  expect(demandes).toEqual([]);
  await capturer(page, info, '1-jerome-sans-photos');
});

test('3 téléphone : une seule photo derrière un voile sombre, formulaire lisible ; très petit écran : pas de photo', async ({ page }, info) => {
  await semer('public', { mode_crm: true, nom_espace: NOM });
  await servirPhotosEssai(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${URL_APP}#/crm/accueil`);
  const panneau = page.locator('.connexion-photos');
  await expect(panneau).toBeVisible();
  await expect(bouton(page)).toBeInViewport();
  await expect(page.getByRole('heading', { level: 1 })).toBeInViewport();
  // Le formulaire passe devant la photo, qui couvre tout l'écran derrière un voile opaque à 84 % (texte blanc lisible même sur une photo claire).
  const zForm = await page.locator('.connexion').evaluate((el) => getComputedStyle(el).zIndex);
  const zPhotos = await panneau.evaluate((el) => getComputedStyle(el).zIndex);
  expect(Number(zForm)).toBeGreaterThan(Number(zPhotos));
  const voile = await page.locator('.connexion-photos-voile').evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(voile).toMatch(/rgba\(34, 26, 43, 0\.84\)/);
  const boite = await panneau.boundingBox();
  expect(boite.width).toBeGreaterThanOrEqual(389);
  // Sur téléphone, la photo ne tourne pas : la première reste seule visible.
  await expect(panneau.locator('img.connexion-photo')).toHaveCount(1); // C6 : une seule photo créée sur téléphone
  await expect(panneau.locator('img.connexion-photo.visible')).toHaveAttribute('src', '/maison/connexion-1.jpg?v=essai-1');
  const debordement = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(debordement).toBe(false);
  await page.waitForTimeout(1400);
  await capturer(page, info, '3-telephone-avec-photo');
  await page.setViewportSize({ width: 340, height: 700 });
  await expect(panneau).toBeHidden();
  await expect(bouton(page)).toBeVisible();
  await capturer(page, info, '3-tres-petit-ecran-sans-photo');
});

test('C6 très petit écran (moins de 360 px) : aucune photo demandée, page sobre', async ({ page }, info) => {
  await semer('public', { mode_crm: true, nom_espace: NOM });
  const demandes = await servirPhotosEssai(page);
  await page.setViewportSize({ width: 340, height: 700 });
  await page.goto(`${URL_APP}#/crm/accueil`);
  await expect(bouton(page)).toBeVisible();
  await page.waitForTimeout(500);
  expect(demandes).toEqual([]);
  await expect(page.locator('.connexion-photos')).toHaveCount(0);
  await capturer(page, info, 'C6-tres-petit-ecran-aucune-demande');
});

test('C7 le panneau apparaît dès la première photo, sans attendre les autres, et s’ouvre en douceur (le formulaire glisse au lieu de sauter)', async ({ page }, info) => {
  await semer('public', { mode_crm: true, nom_espace: NOM });
  // La 1re photo répond après 600 ms, les deux autres après 2,5 s.
  await servirPhotosEssai(page, 3, { attente: { 1: 600, 2: 2500, 3: 2500 } });
  await page.goto(`${URL_APP}#/crm/accueil`);
  await expect(bouton(page)).toBeVisible();
  const avant = await centreTitre(page);
  // Position du formulaire à la première image affichée après l'arrivée du panneau (mesurée dans la page, sans délai d'attente de Playwright).
  const juste = await page.evaluate(() => new Promise((ok) => {
    const lire = () => { const r = document.querySelector('h1').getBoundingClientRect(); return r.x + r.width / 2; };
    const voir = () => (document.querySelector('.connexion-photos') ? (requestAnimationFrame(() => ok(lire())), true) : false);
    if (!voir()) new MutationObserver((_, o) => { if (voir()) o.disconnect(); }).observe(document.body, { childList: true, subtree: true });
  }));
  const panneau = page.locator('.connexion-photos');
  await expect(panneau).toBeAttached();
  // Monté avec la 1re photo seule, pendant que les autres sont encore attendues.
  await expect(panneau.locator('img.connexion-photo')).toHaveCount(1);
  const animation = await panneau.evaluate((el) => getComputedStyle(el).animationName);
  expect(animation).toBe('connexion-photos-apparition');
  if (grandEcran(info)) {
    const ecran = page.locator('.connexion-ecran');
    expect(await ecran.evaluate((el) => getComputedStyle(el).transitionProperty)).toContain('grid-template-columns');
    // Juste après l'apparition, le formulaire est encore presque au centre : il glisse vers la gauche, il ne saute pas.
    expect(Math.abs(juste - avant)).toBeLessThan(150);
    await expect.poll(() => centreTitre(page)).toBeLessThan(avant - 250);
    await expect(panneau.locator('img.connexion-photo')).toHaveCount(3, { timeout: 5000 });
  }
  await page.waitForTimeout(800);
  await capturer(page, info, 'C7-panneau-ouvert');
});

test('C7 moins d’animations demandé (prefers-reduced-motion) : ni glissement ni fondu', async ({ page }) => {
  await semer('public', { mode_crm: true, nom_espace: NOM });
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await servirPhotosEssai(page);
  await page.goto(`${URL_APP}#/crm/accueil`);
  const panneau = page.locator('.connexion-photos');
  await expect(panneau).toBeAttached();
  expect(await panneau.evaluate((el) => getComputedStyle(el).animationName)).toBe('none');
  // css/os.css réduit déjà toutes les durées à 0,001 ms dans ce cas ; la règle des photos coupe aussi la transition (0 s).
  expect(parseFloat(await page.locator('.connexion-ecran').evaluate((el) => getComputedStyle(el).transitionDuration))).toBeLessThan(0.01);
});
