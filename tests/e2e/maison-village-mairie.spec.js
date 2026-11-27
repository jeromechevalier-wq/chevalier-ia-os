// Accueil « village », étape 1 de docs/accueil-village.md (27/11/2026) : roue dentée des réglages de l'ACCUEIL (haut droite, « Animations » seulement),
// bâtiment fixe « Mairie » (bas gauche, ouvre la page Réglages de l'application) et bâtiment fixe « Console » (bas droite, titulaire seul).
// Un test par critère (le nom commence par son numéro), une capture par critère dans tests/e2e/captures/maison-village-mairie/ (nommée avec le projet).
// Même méthode que tests/e2e/maison-village.spec.js : la fiche `ecran` est réécrite dans l'émulateur avant la connexion. Données d'exemple neutres.
// Comptes des parcours (outils.js) : JEROME est le titulaire ; CHARLES est un autre compte autorisé de la maison. Logique sans navigateur : tests/maison-village.test.js.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, estTelephone, ouvrirMenuUtilisateur, choisirDansMenuUtilisateur, JEROME, CHARLES, PROJET, FIRESTORE, ECRAN_PARCOURS, connecterCompte } from './outils.js';
import { semerFicheEmulateur } from '../_fiche-emulateur.js';

const DOSSIER = fileURLToPath(new URL('./captures/maison-village-mairie/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' });
const HOTE = new URL(FIRESTORE).host;
const ACHATS = ['achatsfactures', 'tableauachats', 'achatschantiers', 'achatsfournisseurs', 'achatsarticles'];
const FACTURES = { nom: 'Factures', phrase: 'Valider mes factures fournisseurs', batiment: 'banque', cible: '#/achatsfactures/liste' };
const ACHATS_B = { nom: 'Achats', phrase: 'Payer moins cher mes articles', batiment: 'marche', cible: '#/tableauachats/tableau' };
const CHANTIERS = { nom: 'Chantiers', phrase: 'Suivre les dépenses de mes chantiers', batiment: 'grue', cible: '#/achatschantiers/liste' };
const FOURNISSEURS = { nom: 'Fournisseurs', phrase: 'Retrouver mes fournisseurs', batiment: 'entrepot', cible: '#/achatsfournisseurs/liste' };
const QUATRE = [FACTURES, ACHATS_B, CHANTIERS, FOURNISSEURS];
const semer = (champs) => semerFicheEmulateur({ projet: PROJET, hote: HOTE, document: 'ecran', fiche: { ...ECRAN_PARCOURS, configuration_crm: 'neutre', modules: ACHATS, ...champs } });

/** Connexion sur une adresse vide (#/) : la maison choisit elle-même son accueil. */
async function ouvrir(page, email = CHARLES) {
  await connecter(page, email, { attendreAccueil: false, route: '' });
  await expect(page.locator('.coquille')).toBeVisible();
  await expect(page.locator('[data-role="village"]')).toBeVisible();
}
const roue = (page) => page.getByRole('button', { name: 'Réglages de l’accueil' });
const mairie = (page) => page.locator('[data-role="batiment-fixe"][data-batiment-fixe="mairie-reglages"]');
const consoleIlot = (page) => page.locator('[data-role="batiment-fixe"][data-batiment-fixe="console"]');
const fenetre = (page) => page.getByRole('dialog', { name: 'Réglages de l’accueil' });
const seChevauchent = (a, b) => !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);

test.describe('accueil village : roue dentée, Mairie et Console', () => {
  test('1.1 une roue dentée est visible en haut à droite de l’accueil village, sans infobulle grise', async ({ page }, info) => {
    await semer({ besoins: QUATRE });
    await ouvrir(page);
    await expect(roue(page)).toBeVisible();
    const [r, c] = [await roue(page).boundingBox(), await page.locator('#contenu').boundingBox()];
    expect(c.x + c.width - (r.x + r.width)).toBeLessThan(80);
    expect(r.y - c.y).toBeLessThan(c.height / 4);
    expect(await page.locator('[data-role="page-village"] [title]').count()).toBe(0);
    // la roue ne cache pas le toit du bâtiment du haut
    expect(seChevauchent(r, await page.locator('[data-role="batiment"][data-case="3-3"] .village-lever').boundingBox())).toBe(false);
    await capturer(page, info, '1.1-roue-dentee');
  });

  test('1.2 la roue ouvre « Réglages de l’accueil », qui ne contient que l’interrupteur « Animations » ; Échap ferme et rend la main à la roue', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    await ouvrir(page);
    await roue(page).click();
    await expect(fenetre(page)).toBeVisible();
    await expect(fenetre(page).getByRole('switch')).toHaveCount(1);
    await expect(fenetre(page).getByRole('switch', { name: 'Animations' })).toBeChecked();
    // un seul lien vers les Réglages : « Mon accueil » (interrupteurs par personne, 27/11/2026), vers Réglages > Mon espace ; aucun autre
    await expect(fenetre(page).locator('a[href*="#/reglages"]')).toHaveCount(1);
    await expect(fenetre(page).getByRole('link', { name: 'Mon accueil' })).toHaveAttribute('href', '#/reglages/espace');
    await expect(fenetre(page)).toContainText('Décoche pour couper les animations du village. Ton choix est gardé sur cet appareil.');
    expect(await fenetre(page).innerText()).not.toContain('CRM');
    expect(await page.locator('#contenu').innerText()).not.toContain('CRM');
    await capturer(page, info, '1.2-fenetre-reglages-accueil');
    await page.keyboard.press('Escape');
    await expect(fenetre(page)).toHaveCount(0);
    await expect(roue(page)).toBeFocused();
  });

  test('1.3 couper « Animations » arrête les animations ; le choix est retrouvé après rechargement ; le rallumer les remet', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    await ouvrir(page);
    const village = page.locator('[data-role="page-village"]');
    await expect(village).toHaveAttribute('data-animations', 'oui');
    const duree = () => page.locator('[data-role="batiment"] .village-lever').evaluate((e) => getComputedStyle(e).transitionDuration);
    expect(await duree()).not.toBe('0s');
    await roue(page).click();
    await fenetre(page).getByRole('switch', { name: 'Animations' }).uncheck();
    await expect(village).toHaveAttribute('data-animations', 'non');
    expect(await duree()).toBe('0s');
    await capturer(page, info, '1.3-animations-coupees');
    await fenetre(page).getByRole('button', { name: 'Fermer' }).last().click();
    await page.reload();
    await expect(page.locator('[data-role="village"]')).toBeVisible();
    await expect(page.locator('[data-role="page-village"]')).toHaveAttribute('data-animations', 'non');
    expect(await duree()).toBe('0s');
    await roue(page).click();
    const interrupteur = fenetre(page).getByRole('switch', { name: 'Animations' });
    await expect(interrupteur).not.toBeChecked();
    await interrupteur.check();
    await expect(page.locator('[data-role="page-village"]')).toHaveAttribute('data-animations', 'oui');
  });

  for (const [nombre, besoins] of [[1, [FACTURES]], [4, QUATRE]]) {
    test(`1.4 le village contient la Mairie (avec ${nombre} besoin${nombre > 1 ? 's' : ''}), sans chevaucher une étiquette ni la roue ; un clic ouvre la page Réglages`, async ({ page }, info) => {
      await semer({ besoins });
      await ouvrir(page);
      await expect(mairie(page)).toBeVisible();
      await expect(mairie(page).locator('[data-role="batiment-fixe-nom"]')).toHaveText('Mairie');
      await expect(mairie(page)).toHaveAttribute('aria-label', 'Mairie : Réglages de l’application');
      await expect(page.locator('[data-role="village"] [data-role="batiment"]')).toHaveCount(nombre);
      const m = await mairie(page).boundingBox();
      expect(seChevauchent(m, await roue(page).boundingBox())).toBe(false);
      for (const e of await page.locator('[data-role="etiquette"]').all()) expect(seChevauchent(m, await e.boundingBox())).toBe(false);
      for (const b of await page.locator('[data-role="batiment"] .village-lever').all()) expect(seChevauchent(m, await b.boundingBox())).toBe(false);
      await capturer(page, info, `1.4-mairie-${nombre}-besoin${nombre > 1 ? 's' : ''}`);
      await mairie(page).click();
      await expect(page).toHaveURL(/#\/reglages$/);
      await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible();
    });
  }

  test('1.4 planche des bâtiments fixes à côté de la Maison commune (capture assemblée par le test)', async ({ page }, info) => {
    test.skip(estTelephone(page), 'planche : format ordinateur');
    await semer({ besoins: [FACTURES] });
    await ouvrir(page);
    const ids = await page.evaluate(async () => {
      const { dessinBatiment, dessinBatimentFixe, BATIMENTS_FIXES, CATALOGUE } = await import(new URL('js/os/village-batiments.js', document.baseURI).href);
      const NS = 'http://www.w3.org/2000/svg';
      const el = (n, a = {}) => { const e = document.createElementNS(NS, n); for (const [k, v] of Object.entries(a)) if (v !== undefined) e.setAttribute(k, String(v)); return e; };
      const liste = [['mairie', CATALOGUE.mairie.nom, dessinBatiment('mairie')], ['mairie-reglages', BATIMENTS_FIXES['mairie-reglages'].nom, dessinBatimentFixe('mairie-reglages')], ['console', BATIMENTS_FIXES.console.nom, dessinBatimentFixe('console')]];
      const svg = el('svg', { viewBox: '0 0 660 260', width: '100%', height: '100%', 'data-role': 'planche' });
      svg.append(el('rect', { x: 0, y: 0, width: '100%', height: '100%', fill: '#DCE7BC' }));
      liste.forEach(([id, nom, formes], k) => {
        const g = el('g', { transform: `translate(${k * 220 + 110} 170)`, 'data-batiment': id });
        g.append(el('polygon', { points: '0,-36 72,0 0,36 -72,0', fill: '#A9C46E' }));
        for (const f of formes) {
          if (f.cercle) g.append(el('circle', { cx: f.cercle[0], cy: f.cercle[1], r: f.cercle[2], fill: f.fill, stroke: f.trait, opacity: f.opacite }));
          else if (f.ellipse) g.append(el('ellipse', { cx: f.ellipse[0], cy: f.ellipse[1], rx: f.ellipse[2], ry: f.ellipse[3], fill: f.fill, opacity: f.opacite }));
          else if (f.ligne) g.append(el('line', { x1: f.ligne[0][0], y1: f.ligne[0][1], x2: f.ligne[1][0], y2: f.ligne[1][1], stroke: f.trait, 'stroke-width': f.epaisseur, 'stroke-linecap': 'round' }));
          else g.append(el('polygon', { points: f.poly.map((p) => p.join(',')).join(' '), fill: f.fill, opacity: f.opacite }));
        }
        const t = el('text', { x: 0, y: 66, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 800, fill: '#2A1A2C' });
        t.textContent = `${id} · ${nom}`;
        g.append(t);
        svg.append(g);
      });
      const planche = document.createElement('div');
      planche.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#DCE7BC';
      planche.append(svg);
      document.body.append(planche);
      return liste.map((l) => l[0]);
    });
    for (const id of ids) expect((await page.locator(`[data-role="planche"] [data-batiment="${id}"]`).boundingBox()).width, id).toBeGreaterThan(40);
    await capturer(page, info, '1.4-batiments-fixes');
  });

  test('1.5 l’entrée « Réglages » du menu du compte ouvre la même page que la Mairie', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    await ouvrir(page);
    await mairie(page).click();
    await expect(page).toHaveURL(/#\/reglages$/);
    const parMairie = await page.locator('[data-reglages]').getAttribute('data-reglages');
    await page.evaluate(() => { location.hash = '#/accueil'; });
    await expect(mairie(page)).toBeVisible();
    await ouvrirMenuUtilisateur(page);
    await page.locator('.menu-pop').getByRole('menuitem', { name: 'Réglages', exact: true }).click();
    await expect(page).toHaveURL(/#\/reglages$/);
    if (estTelephone(page)) await page.keyboard.press('Escape');
    await expect(page.locator('[data-reglages]')).toHaveAttribute('data-reglages', parMairie);
    await capturer(page, info, '1.5-reglages-par-le-menu');
  });

  test('1.6 « Retour au village » en haut des Réglages (et d’une autre section) ramène à l’accueil', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    await ouvrir(page);
    await mairie(page).click();
    const retour = page.getByRole('link', { name: 'Retour au village' });
    await expect(retour).toBeVisible();
    await capturer(page, info, '1.6-retour-au-village');
    // une autre section : le premier module de la liste (Achats dans cette maison)
    const autre = await page.locator('.reglages-menu-lien[data-type="module"]').first().getAttribute('href');
    await page.evaluate((h) => { location.hash = h; }, autre);
    await expect(page.locator('[data-reglages]')).toHaveAttribute('data-reglages', /^module:/);
    await expect(retour).toBeVisible();
    await retour.click();
    await expect(page).toHaveURL(/#\/accueil$/);
    await expect(page.locator('[data-role="village"]')).toBeVisible();
  });

  test('1.6 sans `besoins` (maison des parcours, comme chez Jérôme) : pas de « Retour au village » dans les Réglages', async ({ page }) => {
    await connecter(page, undefined, { route: 'reglages' }); // ECRAN_PARCOURS : sans besoins
    await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible();
    await expect(page.locator('[data-action="retour-village"]')).toHaveCount(0);
    await expect(page.locator('[data-role="village"]')).toHaveCount(0);
  });

  test('1.7 même écran pour le titulaire et pour un autre compte : la roue et la Mairie aux mêmes endroits', async ({ page }, info) => {
    await semer({ besoins: QUATRE });
    const places = [];
    const relever = async () => {
      await expect(roue(page)).toBeVisible();
      await expect(mairie(page)).toBeVisible();
      places.push({ roue: await roue(page).boundingBox(), mairie: await mairie(page).boundingBox() });
    };
    await ouvrir(page, JEROME);
    await relever();
    await capturer(page, info, '1.7-titulaire');
    // changement de compte dans le même onglet (comme tests/e2e/filtres-commun.spec.js J1)
    await choisirDansMenuUtilisateur(page, 'Se déconnecter');
    await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
    await page.evaluate(() => { location.hash = ''; });
    await connecterCompte(page, CHARLES);
    await expect(page.locator('[data-role="village"]')).toBeVisible();
    await relever();
    await expect(consoleIlot(page)).toHaveCount(0);
    await capturer(page, info, '1.7-autre-compte');
    for (const cle of ['roue', 'mairie']) {
      expect(Math.abs(places[0][cle].x - places[1][cle].x), cle).toBeLessThan(2);
      expect(Math.abs(places[0][cle].y - places[1][cle].y), cle).toBeLessThan(2);
    }
  });

  test('2.13 le bâtiment Console apparaît pour le titulaire seul et ouvre la Console', async ({ page }, info) => {
    await semer({ besoins: QUATRE });
    await ouvrir(page, JEROME);
    await expect(consoleIlot(page)).toBeVisible();
    await expect(consoleIlot(page).locator('[data-role="batiment-fixe-nom"]')).toHaveText('Console');
    const [c, m] = [await consoleIlot(page).boundingBox(), await mairie(page).boundingBox()];
    expect(seChevauchent(c, m)).toBe(false);
    for (const e of await page.locator('[data-role="etiquette"]').all()) expect(seChevauchent(c, await e.boundingBox())).toBe(false);
    for (const b of await page.locator('[data-role="batiment"] .village-lever').all()) expect(seChevauchent(c, await b.boundingBox())).toBe(false);
    await capturer(page, info, '2.13-console-titulaire');
    await consoleIlot(page).click();
    await expect(page).toHaveURL(/#\/console\/vue$/);
    await expect(page.locator('h1')).toHaveText('Console');
  });

  test('2.13 un autre compte de la maison ne voit pas la Console ; son adresse tapée à la main donne « Page introuvable »', async ({ page }, info) => {
    await semer({ besoins: QUATRE });
    await ouvrir(page, CHARLES);
    await expect(mairie(page)).toBeVisible();
    await expect(consoleIlot(page)).toHaveCount(0);
    await capturer(page, info, '2.13-sans-console-autre-compte');
    await page.evaluate(() => { location.hash = '#/console/vue'; });
    await expect(page.locator('[data-role="page-introuvable"]')).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
  });
});
