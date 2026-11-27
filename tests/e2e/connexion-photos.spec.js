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

/** Fabrique 3 images JPEG neutres dans le navigateur (canvas) et sert /maison/connexion-N.jpg avec. Renvoie la liste des adresses demandées. */
async function servirPhotosEssai(page, nombre = 3) {
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
  await page.route(/\/maison\/connexion-(\d+)\.jpg(\?.*)?$/, (route) => {
    const n = Number(/connexion-(\d+)\.jpg/.exec(route.request().url())[1]);
    demandes.push(`${route.request().method()} ${n}`);
    if (n > nombre) return route.fallback(); // route par défaut des tests : « pas une image »
    return route.fulfill({ status: 200, contentType: 'image/jpeg', body: Buffer.from(images[n - 1], 'base64') });
  });
  return demandes;
}

test('1 maison sans photos : page de connexion neutre comme avant, aucune image (ni cassée), une seule demande, aucune erreur dans la console', async ({ page }, info) => {
  await semer('public', { mode_crm: true, nom_espace: NOM });
  const demandes = [];
  page.on('request', (r) => { if (r.url().includes('/maison/')) demandes.push(r.url()); });
  await page.goto(`${URL_APP}#/crm/accueil`);
  await expect(bouton(page)).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toHaveText(NOM);
  await expect.poll(() => demandes.length).toBe(1);
  await page.waitForTimeout(300);
  await expect(page.locator('.connexion-photos')).toHaveCount(0);
  await expect(page.locator('.connexion-ecran')).not.toHaveClass(/avec-photos/);
  await expect(page.locator('.connexion img')).toHaveCount(1); // la seule image : la baguette de la marque
  expect(demandes).toEqual([expect.stringMatching(/\/maison\/connexion-1\.jpg$/)]);
  await capturer(page, info, '1-maison-sans-photos');
});

test('1 maison avec 3 photos : photos à côté du formulaire (fondu), formulaire et bouton Google inchangés', async ({ page }, info) => {
  await semer('public', { mode_crm: true, nom_espace: NOM });
  const demandes = await servirPhotosEssai(page);
  await page.goto(`${URL_APP}#/crm/accueil`);
  await expect(bouton(page)).toBeVisible();
  const panneau = page.locator('.connexion-photos');
  await expect(panneau).toBeVisible();
  await expect(panneau).toHaveAttribute('aria-hidden', 'true');
  await expect(panneau.locator('img.connexion-photo')).toHaveCount(3);
  await expect(panneau.locator('img.connexion-photo.visible')).toHaveCount(1);
  await expect(panneau.locator('img.connexion-photo').first()).toHaveAttribute('src', '/maison/connexion-1.jpg');
  await expect(panneau.locator('img.connexion-photo').first()).toHaveAttribute('alt', '');
  await expect.poll(() => panneau.locator('img.connexion-photo').first().evaluate((im) => im.complete && im.naturalWidth)).toBe(1024);
  expect(demandes.filter((d) => d.startsWith('HEAD')).sort()).toEqual(['HEAD 1', 'HEAD 2', 'HEAD 3']);
  await expect(page.locator('.connexion-ecran')).toHaveClass(/avec-photos/);
  if (info.project.name === 'ordinateur') {
    // Grand écran : formulaire à gauche, photos à droite, sans se chevaucher.
    const form = await page.locator('.connexion').boundingBox();
    const photos = await panneau.boundingBox();
    expect(photos.x).toBeGreaterThanOrEqual(form.x + form.width - 1);
    expect(photos.width).toBeGreaterThan(600);
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
  await expect(panneau.locator('img.connexion-photo.visible')).toHaveAttribute('src', '/maison/connexion-1.jpg');
  const debordement = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  expect(debordement).toBe(false);
  await page.waitForTimeout(1400);
  await capturer(page, info, '3-telephone-avec-photo');
  await page.setViewportSize({ width: 340, height: 700 });
  await expect(panneau).toBeHidden();
  await expect(bouton(page)).toBeVisible();
  await capturer(page, info, '3-tres-petit-ecran-sans-photo');
});
