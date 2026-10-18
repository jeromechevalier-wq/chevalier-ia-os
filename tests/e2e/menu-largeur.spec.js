// PR C « poignée de redimensionnement du menu » (18/10/2026), chez Jérôme (racine). Un test par point du brief (le nom commence par le numéro du point),
// UNE capture par point dans ~/chantiers-crm/captures-menu-C/ (« -tel » pour le format téléphone). Le point 5 chez un client est dans menu-coque-client.spec.js.
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { test, expect, connecter, estTelephone, ouvrirMenuUtilisateur, JEROME } from './outils.js';

test.describe.configure({ mode: 'parallel' });

const DOSSIER = join(homedir(), 'chantiers-crm', 'captures-menu-C');
async function capture(page, nom, options = {}) {
  await mkdir(DOSSIER, { recursive: true });
  await page.screenshot({ path: join(DOSSIER, `${nom}${estTelephone(page) ? '-tel' : ''}.png`), animations: 'disabled', ...options });
}
const largeurMenu = (page) => page.locator('.menu').evaluate((m) => Math.round(m.getBoundingClientRect().width));
const margeZone = (page) => page.locator('.zone').evaluate((z) => Math.round(parseFloat(getComputedStyle(z).marginLeft)));
const memorisee = (page) => page.evaluate(() => localStorage.getItem('chevalier-os.menu-largeur'));
async function deplier(page) {
  const elargir = page.getByRole('button', { name: 'Élargir le menu' });
  if (await elargir.count()) await elargir.click();
  await expect(page.locator('.coquille[data-menu="elargi"]')).toHaveCount(1);
  await attendreStable(page);
}
/** Attend la fin de l'animation de largeur (le menu et la zone ont une transition). */
async function attendreStable(page) {
  let avant = -1;
  await expect.poll(async () => { const l = await largeurMenu(page); const stable = l === avant; avant = l; return stable; }, { intervals: [120] }).toBe(true);
}
/** Tire la poignée jusqu'à la largeur voulue (souris). */
async function tirer(page, vers) {
  await attendreStable(page);
  const b = await page.locator('.menu-poignee').boundingBox();
  const y = b.y + 300;
  await page.mouse.move(b.x + b.width / 2, y);
  await page.mouse.down();
  await page.mouse.move(vers - 3, y, { steps: 6 });
  await page.mouse.move(vers, y);
  await page.mouse.up();
}
const sansTelephone = '@sans-telephone';

test(`1 poignée sur le bord droit : tirer à la souris change la largeur en continu entre 200 et 420 px, la zone suit, et le clavier la règle par pas de 16 ${sansTelephone}`, async ({ page }) => {
  await connecter(page, JEROME);
  await deplier(page);
  const poignee = page.getByRole('separator', { name: 'Largeur du menu' });
  await expect(poignee).toHaveAttribute('aria-orientation', 'vertical');
  await expect(poignee).toHaveAttribute('aria-valuemin', '200');
  await expect(poignee).toHaveAttribute('aria-valuemax', '420');
  await expect(poignee).toHaveAttribute('aria-valuenow', '240');
  expect(await poignee.evaluate((p) => getComputedStyle(p).cursor)).toBe('col-resize');
  expect((await poignee.boundingBox()).width).toBe(6);
  await tirer(page, 330);
  await expect.poll(() => largeurMenu(page)).toBe(330);
  await expect.poll(() => margeZone(page)).toBe(330);
  await expect(poignee).toHaveAttribute('aria-valuenow', '330');
  await tirer(page, 50);
  await expect.poll(() => largeurMenu(page)).toBe(200);
  await tirer(page, 900);
  await expect.poll(() => largeurMenu(page)).toBe(420);
  // clavier
  await poignee.focus();
  await page.keyboard.press('ArrowLeft');
  await expect.poll(() => largeurMenu(page)).toBe(404);
  await page.keyboard.press('Home');
  await expect.poll(() => largeurMenu(page)).toBe(200);
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => largeurMenu(page)).toBe(216);
  await page.keyboard.press('End');
  await expect.poll(() => largeurMenu(page)).toBe(420);
  await page.keyboard.press('Home');
  await page.keyboard.press('ArrowLeft'); // déjà au minimum : reste à 200
  await expect.poll(() => largeurMenu(page)).toBe(200);
  await tirer(page, 300);
  await capture(page, '1-etroit-200', { clip: { x: 0, y: 0, width: 700, height: 600 } });
  await tirer(page, 380);
  await expect.poll(() => largeurMenu(page)).toBe(380);
  await capture(page, '1-large-380');
});

test(`1 au clavier la poignée prend le focus et montre son trait ${sansTelephone}`, async ({ page }) => {
  await connecter(page, JEROME);
  await deplier(page);
  await page.locator('.menu-poignee').focus();
  await page.keyboard.press('ArrowRight'); // une vraie touche : le navigateur passe en « focus au clavier »
  await expect.poll(() => page.locator('.menu-poignee').evaluate((p) => getComputedStyle(p, '::after').backgroundColor)).not.toBe('rgba(0, 0, 0, 0)');
});

test(`2 la largeur est mémorisée (clé à part), appliquée dès le chargement sans saut, et un double-clic remet 240 px ${sansTelephone}`, async ({ page }) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'le rechargement coupe le flux Firestore en cours' });
  await connecter(page, JEROME);
  await deplier(page);
  await tirer(page, 310);
  expect(await memorisee(page)).toBe('310');
  await page.reload();
  await page.waitForFunction(() => !!document.querySelector('.coquille'));
  // la variable est posée par le script de index.html avant tout rendu : elle existe déjà quand le DOM est prêt
  expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--menu-largeur'))).toBe('310px');
  await expect.poll(() => largeurMenu(page)).toBe(310);
  await expect.poll(() => margeZone(page)).toBe(310);
  await page.locator('.menu-poignee').dblclick();
  await expect.poll(() => largeurMenu(page)).toBe(240);
  expect(await memorisee(page)).toBe('240');
  await tirer(page, 290);
  await capture(page, '2-largeur-memorisee-290');
});

test(`3 replier (bouton et Ctrl+B) mène à 64 px puis rouvre à la largeur choisie ; pas de poignée replié ; pendant un glissement rien ne se sélectionne ${sansTelephone}`, async ({ page }) => {
  await connecter(page, JEROME);
  await deplier(page);
  await tirer(page, 350);
  await page.getByRole('button', { name: 'Replier le menu' }).click();
  await expect(page.locator('.coquille[data-menu="replie"]')).toHaveCount(1);
  await expect(page.locator('.menu-poignee')).toHaveCount(0);
  await expect.poll(() => largeurMenu(page)).toBe(64);
  await expect.poll(() => margeZone(page)).toBe(64);
  await capture(page, '3-replie-64');
  await page.keyboard.press('Control+b');
  await expect(page.locator('.coquille[data-menu="elargi"]')).toHaveCount(1);
  await expect.poll(() => largeurMenu(page)).toBe(350);
  await page.keyboard.press('Control+b');
  await expect.poll(() => largeurMenu(page)).toBe(64);
  await page.getByRole('button', { name: 'Élargir le menu' }).click();
  await expect.poll(() => largeurMenu(page)).toBe(350);
  await capture(page, '3-rouvert-350');
  // glissement : curseur et sélection de texte cohérents, même loin de la poignée
  const b = await page.locator('.menu-poignee').boundingBox();
  await page.mouse.move(b.x + 3, b.y + 300);
  await page.mouse.down();
  await page.mouse.move(700, b.y + 300, { steps: 4 });
  const pendant = await page.evaluate(() => ({ glisse: !!document.querySelector('.coquille.menu-glisse'), sel: getComputedStyle(document.querySelector('.contenu')).userSelect, curseur: getComputedStyle(document.querySelector('.contenu')).cursor }));
  expect(pendant).toEqual({ glisse: true, sel: 'none', curseur: 'col-resize' });
  await page.mouse.up();
  await expect(page.locator('.coquille.menu-glisse')).toHaveCount(0);
  await expect.poll(() => largeurMenu(page)).toBe(420);
  // le menu utilisateur reste bien placé à la largeur choisie
  await ouvrirMenuUtilisateur(page);
  const pop = await page.locator('.menu-pop').boundingBox();
  const compte = await page.locator('.menu-compte').boundingBox();
  expect(pop.y + pop.height).toBeLessThanOrEqual(compte.y + 1);
  expect(pop.x).toBeGreaterThanOrEqual(0);
});

test('4 téléphone : aucune poignée, le menu glisse comme avant (largeur 82 % au plus, quelle que soit la préférence)', async ({ page }) => {
  test.skip(!estTelephone(page), 'format téléphone seulement');
  await page.addInitScript(() => localStorage.setItem('chevalier-os.menu-largeur', '400'));
  await connecter(page, JEROME);
  await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await expect(page.locator('.coquille.menu-ouvert')).toHaveCount(1);
  await expect(page.locator('.menu-poignee')).toHaveCount(0);
  await expect.poll(() => largeurMenu(page)).toBe(240); // largeur historique du tiroir, la préférence ne s'applique pas
  await expect.poll(() => margeZone(page)).toBe(0);
  await ouvrirMenuUtilisateur(page);
  const pop = await page.locator('.menu-pop').boundingBox();
  expect(pop.x).toBeGreaterThanOrEqual(0);
  expect(pop.x + pop.width).toBeLessThanOrEqual(390);
  await capture(page, '4-telephone-menu');
});

test(`5 chez Jérôme (racine) : même poignée, même clé, aucune branche racine/client ${sansTelephone}`, async ({ page }) => {
  await connecter(page, JEROME);
  await deplier(page);
  await tirer(page, 300);
  expect(await memorisee(page)).toBe('300');
  await capture(page, '5-racine-300');
});

test(`6 préférence absurde (illisible, hors bornes) : largeur par défaut ${sansTelephone}`, async ({ page }) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'le rechargement coupe le flux Firestore en cours' });
  // valeurs absurdes -> défaut 240
  await connecter(page, JEROME);
  for (const mauvaise of ['abc', '9999', '50', '-300', '300px', '']) {
    await page.evaluate((v) => localStorage.setItem('chevalier-os.menu-largeur', v), mauvaise);
    await page.reload();
    await expect(page.locator('.coquille')).toBeVisible();
    await deplier(page);
    await expect.poll(() => largeurMenu(page), `valeur « ${mauvaise} »`).toBe(240);
    expect(await page.evaluate(() => document.documentElement.style.getPropertyValue('--menu-largeur'))).toBe('240px');
  }
  await capture(page, '6-valeur-absurde-defaut-240', { clip: { x: 0, y: 0, width: 700, height: 600 } });
});

test(`6 stockage bloqué : la largeur par défaut s'applique et tirer la poignée marche quand même pour la session ${sansTelephone}`, async ({ page }) => {
  await page.addInitScript(() => {
    const lire = Storage.prototype.getItem; const ecrire = Storage.prototype.setItem;
    Storage.prototype.getItem = function (k) { if (String(k).includes('menu-largeur')) throw new Error('bloqué'); return lire.call(this, k); };
    Storage.prototype.setItem = function (k, v) { if (String(k).includes('menu-largeur')) throw new Error('bloqué'); return ecrire.call(this, k, v); };
  });
  await connecter(page, JEROME);
  await deplier(page);
  await expect.poll(() => largeurMenu(page)).toBe(240);
  await tirer(page, 320);
  await expect.poll(() => largeurMenu(page)).toBe(320);
});

test(`6 fenêtre étroite : le maximum ne dépasse jamais la moitié de la fenêtre, et rétrécir la fenêtre rogne le menu large ${sansTelephone}`, async ({ page }) => {
  await page.setViewportSize({ width: 1000, height: 800 });
  await connecter(page, JEROME);
  await deplier(page);
  await tirer(page, 420);
  await expect.poll(() => largeurMenu(page)).toBe(420);
  await page.setViewportSize({ width: 800, height: 800 }); // moitié = 400
  await expect.poll(() => largeurMenu(page)).toBe(400);
  await expect.poll(() => margeZone(page)).toBe(400);
  await expect(page.locator('.menu-poignee')).toHaveAttribute('aria-valuemax', '400');
  await expect(page.locator('.menu-poignee')).toHaveAttribute('aria-valuenow', '400');
  await tirer(page, 700);
  await expect.poll(() => largeurMenu(page)).toBe(400);
  await page.setViewportSize({ width: 1000, height: 800 }); // la fenêtre regrandit : la valeur mémorisée (400, rognée au glissement) reste
  await expect.poll(() => largeurMenu(page)).toBe(400);
  await capture(page, '6-fenetre-800-max-400', { clip: { x: 0, y: 0, width: 800, height: 600 } });
});
