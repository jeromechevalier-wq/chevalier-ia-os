// Accueil « village » d'une maison (26/11/2026) : champ facultatif `besoins` de reglages_maison/ecran (js/os/maison-village.js, js/os/village-ecran.js, js/os/village-compteurs.js, js/main.js).
// Le village est toujours un terrain de 4 parcelles (losange 2 x 2) : les besoins (1 à 4) occupent les parcelles haut, gauche, droite, bas ; les autres sont décorées, non cliquables.
// Un test par critère (le nom commence par son numéro), une capture par critère dans tests/e2e/captures/maison-village/ (nommée avec le projet : ordinateur ou téléphone).
// Même méthode que tests/e2e/maison-modules.spec.js : la fiche `ecran` est réécrite dans l'émulateur avant la connexion. Données d'exemple neutres.
// Le compteur de la bulle lit la base de l'espace par le faux réseau du crochet de test `window.__accesBase` (émulateurs seulement, voir js/os/acces-base.js).
// Comptes des parcours (outils.js) : JEROME est le titulaire ; CHARLES est un autre compte autorisé de la maison. Logique sans navigateur : tests/maison-village.test.js.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, ecrireDocument, estTelephone, CHARLES, PROJET, FIRESTORE, ECRAN_PARCOURS } from './outils.js';
import { semerFicheEmulateur } from '../_fiche-emulateur.js';

const DOSSIER = fileURLToPath(new URL('./captures/maison-village/', import.meta.url));
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
const batiments = (page) => page.locator('[data-role="village"] [data-role="batiment"]');
const batiment = (page, nom) => page.locator(`[data-role="village"] [data-role="batiment"][data-parcelle="${nom}"]`);
const noms = (page) => page.locator('[data-role="village"] [data-role="batiment-nom"]');
const bulle = (page) => page.locator('[data-role="bulle"]');
/** Taille réelle à l'écran (px) d'un texte du dessin : sa taille dans le dessin multipliée par l'agrandissement du dessin. */
const tailleEcran = (loc) => loc.evaluate((t) => t.getScreenCTM().a * parseFloat(t.getAttribute('font-size')));
/** Défilement horizontal ou vertical de la page ou de la zone du contenu. */
const defilements = (page) => page.evaluate(() => {
  const d = document.documentElement;
  const c = document.querySelector('#contenu');
  return { horizontal: d.scrollWidth > d.clientWidth + 1, vertical: d.scrollHeight > d.clientHeight + 1 || (c ? c.scrollHeight > c.clientHeight + 1 : false) };
});
/** Survol (ordinateur) ou premier toucher (téléphone) d'un bâtiment : la bulle s'ouvre. */
async function ouvrirBulle(page, nom) {
  if (estTelephone(page)) await batiment(page, nom).click();
  else await batiment(page, nom).hover();
  await expect(bulle(page)).toBeVisible();
}

// ---------------------------------------------------------------- faux réseau de la base de l'espace (compteur `factures_a_valider`)
const https = (hote, chemin = '') => `${['https', ''].join(':')}//${hote}${chemin}`;
const CONNEXION = () => ({ adresseBase: https('base.exemple.test'), clePublique: 'cle-publique-fictive', espace: 'espace-essai', webhooks: { actions: https('hooks.exemple.test', '/actions') } });
/** `mode` : 'ok' (12 factures à valider non archivées), 'panne' (erreur 500) ou 'lente' (réponse après 5 s, comme une base qui se réveille). Les adresses lues sont gardées dans window.__lectures. */
async function poserBase(page, mode = 'ok') {
  await ecrireDocument('base_parametres/connexion', CONNEXION());
  await page.addInitScript((m) => {
    window.__lectures = [];
    const rep = (corps, statut = 200, entetes = {}) => new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json', ...entetes } });
    const fetchImpl = async (url) => {
      const u = new URL(url);
      window.__lectures.push(`${u.pathname}${u.search}`);
      if (u.pathname !== '/rest/v1/factures') return rep({ message: 'inconnu' }, 404);
      if (m === 'panne') return rep({ message: 'panne' }, 500);
      if (m === 'lente') await new Promise((r) => { setTimeout(r, 5000); });
      // seules les factures « à valider » non archivées sont comptées : la lecture doit porter les deux filtres
      if (u.searchParams.get('statut') !== 'eq.a_valider' || u.searchParams.get('archivee_le') !== 'is.null') return rep({ message: 'filtre attendu' }, 400);
      const lignes = Array.from({ length: 12 }, (_, i) => ({ id: `f${i + 1}` }));
      return rep(lignes, 200, { 'Content-Range': '0-11/12' });
    };
    window.__accesBase = { fetchImpl, jeton: 'jeton-fictif', claims: { role: 'authenticated', espace_base: 'espace-essai' } };
  }, mode);
}
const AVEC_COMPTEUR = [{ ...FACTURES, compteur: 'factures_a_valider' }, ACHATS_B];

test.describe('accueil village d’une maison', () => {
  test('V11 un seul besoin : l’adresse vide ouvre le village (#/accueil), le terrain a 4 parcelles et le bâtiment n’en occupe qu’une (celle du haut), avec son nom', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    await ouvrir(page);
    await expect(page).toHaveURL(/#\/accueil$/);
    await expect(batiments(page)).toHaveCount(1);
    const b = batiments(page).first();
    await expect(b).toHaveAttribute('aria-label', 'Factures : Valider mes factures fournisseurs');
    await expect(b).toHaveAttribute('data-parcelle', 'haut');
    await expect(noms(page)).toHaveText(['Factures']); // étiquette permanente : le nom seul (la phrase est dans la bulle)
    await expect(page.locator('[data-role="village"] [data-role="parcelle"]')).toHaveCount(4);
    const enfants = await page.locator('#contenu > *').evaluateAll((els) => els.map((e) => e.dataset.role));
    expect(enfants).toEqual(['page-village']);
    await expect(page.locator('.grille-objectifs, .journal, [data-role="page-introuvable"]')).toHaveCount(0);
    await expect(page.locator('.barre-outils')).toBeHidden(); // ni recherche ni « + » sur l'accueil
    // taille : le bâtiment fait environ un quart du terrain (moins de 35 % de sa largeur), pas tout l'écran
    const part = await page.evaluate(() => document.querySelector('[data-role="batiment"] .village-lever').getBoundingClientRect().width / document.querySelector('.village-terrain').getBoundingClientRect().width);
    expect(part).toBeLessThan(0.35);
    expect(part).toBeGreaterThan(0.12);
    // nom lisible : 20 à 28 px sur ordinateur, au moins 13 px sur téléphone
    const taille = await tailleEcran(noms(page).first());
    if (estTelephone(page)) expect(taille).toBeGreaterThanOrEqual(13);
    else { expect(taille).toBeGreaterThanOrEqual(20); expect(taille).toBeLessThanOrEqual(28); }
    await capturer(page, info, 'V11-un-besoin');
  });

  test('V12 un clic sur le bâtiment ouvre sa cible (sur téléphone : le premier toucher montre la bulle, le second ouvre) ; le logo ramène au village', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    await ouvrir(page);
    if (estTelephone(page)) {
      await batiments(page).first().click();
      await expect(bulle(page)).toBeVisible();
      await expect(page).toHaveURL(/#\/accueil$/);
    }
    await batiments(page).first().click();
    await expect(page).toHaveURL(/#\/achatsfactures\/pile$/); // un bâtiment = une application (27/11/2026) : la cible « liste » du module Factures ouvre son application
    await expect(page.locator('[data-role="appli-factures"]')).toBeVisible();
    await capturer(page, info, 'V12-clic-factures');
    if (estTelephone(page)) await page.locator('[data-role="appli-entete"] [data-action="accueil"]').click(); // dans l'appli, la barre de la coque est cachée : la maison de l'appli ramène au village
    else await page.evaluate(() => { location.hash = '#/accueil'; });
    await expect(page).toHaveURL(/#\/accueil$/);
    await expect(batiments(page)).toHaveCount(1);
  });

  test('V13 au clavier : Tab amène sur le bâtiment, Entrée ouvre sa cible', async ({ page }, info) => {
    test.skip(estTelephone(page), 'clavier : parcours de l’ordinateur');
    await semer({ besoins: QUATRE });
    await ouvrir(page);
    const deuxieme = batiment(page, 'gauche');
    await deuxieme.focus();
    await expect(deuxieme).toBeFocused();
    await capturer(page, info, 'V13-focus-clavier');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/tableauachats\/tableau$/);
  });

  test('V14 deux besoins : les parcelles du haut et de gauche sont occupées, les deux autres décorées ; même taille de bâtiment qu’avec un seul besoin', async ({ page }, info) => {
    await semer({ besoins: [FACTURES, ACHATS_B] });
    await ouvrir(page);
    await expect(batiments(page)).toHaveCount(2);
    await expect(batiment(page, 'haut')).toHaveAttribute('data-cible', '#/achatsfactures/liste');
    await expect(batiment(page, 'gauche')).toHaveAttribute('data-cible', '#/tableauachats/tableau');
    await expect(page.locator('[data-role="parcelle"][data-occupee="non"]')).toHaveCount(2);
    await expect(page.locator('[data-role="parcelle"][data-parcelle="droite"]')).toHaveAttribute('data-decor', 'lavande');
    await expect(page.locator('[data-role="parcelle"][data-parcelle="bas"]')).toHaveAttribute('data-decor', 'bosquet');
    const part = await page.evaluate(() => document.querySelector('[data-role="batiment"] .village-lever').getBoundingClientRect().width / document.querySelector('.village-terrain').getBoundingClientRect().width);
    expect(part).toBeLessThan(0.35);
    expect((await defilements(page)).horizontal).toBe(false);
    await capturer(page, info, 'V14-deux-besoins');
  });

  test('V15a sans `besoins` (maison des parcours, comme chez Jérôme) : l’accueil d’avant ne change pas', async ({ page }, info) => {
    await connecter(page, undefined, { attendreAccueil: false, route: '' }); // ECRAN_PARCOURS : sans besoins
    await expect(page).not.toHaveURL(/#\/accueil$/); // adresse vide : l'accueil d'avant (crm/accueil), comme avant cette PR
    await expect(page.locator('.grille-objectifs .objectif')).toHaveCount(5);
    await expect(page.locator('[data-role="village"]')).toHaveCount(0);
    await capturer(page, info, 'V15a-sans-besoins-accueil-davant');
  });

  test('V15b besoins tous refusés (liens externes) : pas de village, l’accueil d’avant de la maison reste', async ({ page }, info) => {
    await semer({ besoins: [{ nom: 'Piège', phrase: 'lien externe', cible: 'https://exemple.test' }, { nom: 'Piège 2', cible: '//exemple.test' }] });
    await connecter(page, CHARLES, { attendreAccueil: false, route: '' });
    await expect(page.locator('.coquille')).toBeVisible();
    await expect(page).toHaveURL(/#\/achatsfactures\/liste$/); // réglage `modules` : son premier écran, comme avant
    await expect(page.locator('[data-role="village"]')).toHaveCount(0);
    await expect(page.getByText('Piège')).toHaveCount(0);
    await capturer(page, info, 'V15b-besoins-refuses-accueil-davant');
  });

  test('V16 téléphone : le même terrain 2 x 2 réduit à la largeur de l’écran, noms lisibles (13 px au moins), sans défilement horizontal ; deux touchers ouvrent la cible', async ({ page }, info) => {
    test.skip(!estTelephone(page), 'parcours propre au format téléphone');
    await semer({ besoins: QUATRE });
    await ouvrir(page);
    await expect(page.locator('[data-role="village"]')).toHaveAttribute('data-disposition', 'terrain-telephone');
    await expect(page.locator('[data-role="parcelle"]')).toHaveCount(4);
    const larg = await page.evaluate(() => window.innerWidth);
    const terrain = await page.locator('.village-terrain').boundingBox();
    expect(terrain.x).toBeGreaterThanOrEqual(-1);
    expect(terrain.x + terrain.width).toBeLessThanOrEqual(larg + 1);
    expect(terrain.width).toBeGreaterThan(larg * 0.8); // réduit à la largeur de l'écran, pas plus petit
    for (const t of await noms(page).all()) expect(await tailleEcran(t)).toBeGreaterThanOrEqual(13);
    expect((await defilements(page)).horizontal).toBe(false);
    await capturer(page, info, 'V16-telephone-terrain');
    await batiment(page, 'droite').click();
    await expect(bulle(page)).toContainText('Chantiers');
    await expect(page).toHaveURL(/#\/accueil$/);
    await batiment(page, 'droite').click();
    await expect(page).toHaveURL(/#\/achatschantiers\/liste$/);
  });

  test('V17 quatre besoins (plus un cinquième et des entrées mal formées, ignorés) : les 4 parcelles sont occupées dans l’ordre haut, gauche, droite, bas', async ({ page }, info) => {
    await semer({ besoins: [{ nom: 'Piège', cible: 'javascript:alert(1)' }, 'texte seul', ...QUATRE, { nom: 'Cinquième', phrase: 'En trop', cible: '#/achatsarticles/liste' }] });
    await ouvrir(page);
    await expect(batiments(page)).toHaveCount(4);
    await expect(noms(page)).toHaveText(['Factures', 'Achats', 'Chantiers', 'Fournisseurs']);
    const parcelles = await page.locator('[data-role="etiquette"]').evaluateAll((els) => els.map((e) => e.dataset.parcelle));
    expect(parcelles).toEqual(['haut', 'gauche', 'droite', 'bas']);
    await expect(page.locator('[data-role="parcelle"][data-occupee="non"]')).toHaveCount(0);
    await expect(page.getByText('Piège')).toHaveCount(0);
    await expect(page.getByText('Cinquième')).toHaveCount(0);
    // les étiquettes ne se chevauchent pas
    const boites = await page.locator('[data-role="etiquette"] rect').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
    for (let i = 0; i < boites.length; i++) {
      for (let j = i + 1; j < boites.length; j++) {
        const [a, b] = [boites[i], boites[j]];
        expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top, `étiquettes ${i} et ${j}`).toBe(true);
      }
    }
    await capturer(page, info, 'V17-quatre-besoins');
  });

  test('V20 les parcelles libres sont décorées mais ni cliquables ni atteignables au clavier (aria-hidden, aucun focus)', async ({ page }) => {
    await semer({ besoins: [FACTURES] });
    await ouvrir(page);
    const libres = page.locator('[data-role="parcelle"][data-occupee="non"]');
    await expect(libres).toHaveCount(3);
    for (const l of await libres.all()) {
      await expect(l).toHaveAttribute('aria-hidden', 'true');
      expect(await l.getAttribute('tabindex')).toBeNull();
    }
    await expect(page.locator('[data-role="parcelle"][data-decor]')).toHaveCount(3);
    expect(await page.locator('[data-role="village"] [tabindex]').count()).toBe(1); // seul le bâtiment est atteignable au clavier
    // un clic au milieu d'une parcelle libre ne change pas d'écran
    const bas = await page.locator('[data-role="parcelle"][data-parcelle="bas"]').boundingBox();
    await page.mouse.click(bas.x + bas.width / 2, bas.y + bas.height / 2);
    await expect(page).toHaveURL(/#\/accueil$/);
    await expect(bulle(page)).toBeHidden();
  });

  for (const [nombre, besoins] of [[1, [FACTURES]], [4, QUATRE]]) {
    test(`V21 le terrain entier tient dans l’écran sans défilement (ordinateur 1440 x 900 et téléphone), avec ${nombre} besoin${nombre > 1 ? 's' : ''}`, async ({ page }) => {
      await semer({ besoins });
      await ouvrir(page);
      const d = await defilements(page);
      expect(d.horizontal).toBe(false);
      expect(d.vertical).toBe(false);
      const h = await page.evaluate(() => window.innerHeight);
      const terrain = await page.locator('.village-terrain').boundingBox();
      expect(terrain.y).toBeGreaterThanOrEqual(0);
      expect(terrain.y + terrain.height).toBeLessThanOrEqual(h);
      if (!estTelephone(page)) expect(terrain.height).toBeGreaterThan(h * 0.5); // coins rognés : le losange occupe l'écran, pas de grand vide
    });
  }

  test('V22 au survol d’un bâtiment (premier toucher sur téléphone), une bulle montre le nom, la phrase, la pastille du compteur et « Cliquez pour entrer »', async ({ page }, info) => {
    await semer({ besoins: AVEC_COMPTEUR });
    await poserBase(page, 'ok');
    await ouvrir(page);
    await expect(bulle(page)).toBeHidden();
    await ouvrirBulle(page, 'haut');
    await expect(bulle(page).locator('[data-role="bulle-nom"]')).toHaveText('Factures');
    await expect(bulle(page).locator('[data-role="bulle-phrase"]')).toHaveText('Valider mes factures fournisseurs');
    await expect(bulle(page).locator('[data-role="bulle-pastille"]')).toHaveText('12 à valider');
    await expect(bulle(page).locator('small')).toHaveText(estTelephone(page) ? 'Touchez encore pour entrer' : 'Cliquez pour entrer');
    // la bulle est au-dessus du bâtiment, dans l'écran
    const [bb, bt] = [await bulle(page).boundingBox(), await batiment(page, 'haut').locator('.village-lever').boundingBox()];
    expect(bb.x).toBeGreaterThanOrEqual(0);
    expect(bb.x + bb.width).toBeLessThanOrEqual(await page.evaluate(() => window.innerWidth));
    expect(Math.abs(bb.x + bb.width / 2 - (bt.x + bt.width / 2))).toBeLessThan(bb.width / 2);
    await capturer(page, info, 'V22-bulle-survol');
    // un bâtiment sans compteur : bulle sans pastille
    if (estTelephone(page)) await batiment(page, 'gauche').click();
    else await batiment(page, 'gauche').hover();
    await expect(bulle(page).locator('[data-role="bulle-nom"]')).toHaveText('Achats');
    await expect(bulle(page).locator('[data-role="bulle-pastille"]')).toHaveCount(0);
    await expect(page).toHaveURL(/#\/accueil$/);
    if (!estTelephone(page)) { // la souris quitte le dessin : la bulle se ferme
      await page.mouse.move(2, 2);
      await expect(bulle(page)).toBeHidden();
    }
  });

  test('V23 au focus clavier d’un bâtiment, la même bulle apparaît ; elle disparaît quand le focus part', async ({ page }, info) => {
    test.skip(estTelephone(page), 'clavier : parcours de l’ordinateur');
    await semer({ besoins: AVEC_COMPTEUR });
    await ouvrir(page);
    await batiment(page, 'gauche').focus();
    await expect(bulle(page)).toBeVisible();
    await expect(bulle(page).locator('[data-role="bulle-nom"]')).toHaveText('Achats');
    await expect(bulle(page).locator('[data-role="bulle-phrase"]')).toHaveText('Payer moins cher mes articles');
    await capturer(page, info, 'V23-bulle-focus');
    await page.evaluate(() => document.activeElement.blur());
    await expect(bulle(page)).toBeHidden();
  });

  test('V24 la pastille compte les factures « à valider » non archivées, lues dans la base de l’espace (aucune route nouvelle)', async ({ page }) => {
    await semer({ besoins: AVEC_COMPTEUR });
    await poserBase(page, 'ok');
    await ouvrir(page);
    await ouvrirBulle(page, 'haut');
    await expect(bulle(page).locator('[data-role="bulle-pastille"]')).toHaveText('12 à valider');
    const lectures = await page.evaluate(() => window.__lectures);
    expect(lectures.length).toBeGreaterThanOrEqual(1);
    for (const l of lectures) {
      expect(l).toMatch(/^\/rest\/v1\/factures\?/);
      expect(l).toContain('statut=eq.a_valider');
      expect(l).toContain('archivee_le=is.null');
    }
  });

  test('V25 lecture en panne : l’indicateur d’attente disparaît, la bulle s’affiche sans pastille (jamais de chiffre inventé, jamais « 0 »)', async ({ page }) => {
    await semer({ besoins: AVEC_COMPTEUR });
    await poserBase(page, 'panne');
    await ouvrir(page);
    await expect.poll(() => page.evaluate(() => window.__lectures.length)).toBeGreaterThanOrEqual(1);
    await ouvrirBulle(page, 'haut');
    await expect(bulle(page).locator('[data-role="bulle-nom"]')).toHaveText('Factures');
    await expect(bulle(page).locator('[data-role="bulle-attente"]')).toHaveCount(0);
    await expect(bulle(page).locator('[data-role="bulle-pastille"]')).toHaveCount(0);
    await expect(bulle(page)).not.toContainText(/\d/);
  });

  test('V27 catalogue : chaque bâtiment se dessine dans le navigateur sans erreur, même empreinte et même lumière (capture assemblée par le test)', async ({ page }, info) => {
    test.skip(estTelephone(page), 'capture du catalogue : format ordinateur');
    await semer({ besoins: [FACTURES] });
    await ouvrir(page);
    // Planche assemblée par le test (rien dans l'appli) : chaque bâtiment du catalogue sur sa parcelle, avec son identifiant.
    const ids = await page.evaluate(async () => {
      const { CATALOGUE, BATIMENTS, dessinBatiment } = await import(new URL('js/os/village-batiments.js', document.baseURI).href);
      const NS = 'http://www.w3.org/2000/svg';
      const el = (n, a = {}) => { const e = document.createElementNS(NS, n); for (const [k, v] of Object.entries(a)) if (v !== undefined) e.setAttribute(k, String(v)); return e; };
      const COL = 6;
      const svg = el('svg', { viewBox: `0 0 ${COL * 220} ${Math.ceil(BATIMENTS.length / COL) * 250}`, width: '100%', height: '100%', 'data-role': 'catalogue' });
      svg.append(el('rect', { x: 0, y: 0, width: '100%', height: '100%', fill: '#DCE7BC' }));
      BATIMENTS.forEach((id, k) => {
        const g = el('g', { transform: `translate(${(k % COL) * 220 + 110} ${Math.floor(k / COL) * 250 + 170})`, 'data-batiment': id });
        g.append(el('polygon', { points: '0,-36 72,0 0,36 -72,0', fill: '#A9C46E' }));
        for (const f of dessinBatiment(id)) {
          if (f.cercle) g.append(el('circle', { cx: f.cercle[0], cy: f.cercle[1], r: f.cercle[2], fill: f.fill, stroke: f.trait, opacity: f.opacite }));
          else if (f.ellipse) g.append(el('ellipse', { cx: f.ellipse[0], cy: f.ellipse[1], rx: f.ellipse[2], ry: f.ellipse[3], fill: f.fill, opacity: f.opacite }));
          else if (f.ligne) g.append(el('line', { x1: f.ligne[0][0], y1: f.ligne[0][1], x2: f.ligne[1][0], y2: f.ligne[1][1], stroke: f.trait, 'stroke-width': f.epaisseur, 'stroke-linecap': 'round' }));
          else g.append(el('polygon', { points: f.poly.map((p) => p.join(',')).join(' '), fill: f.fill, opacity: f.opacite }));
        }
        const t = el('text', { x: 0, y: 66, 'text-anchor': 'middle', 'font-size': 15, 'font-weight': 800, fill: '#2A1A2C' });
        t.textContent = `${id} · ${CATALOGUE[id].nom}`;
        g.append(t);
        svg.append(g);
      });
      const planche = document.createElement('div');
      planche.style.cssText = 'position:fixed;inset:0;z-index:9999;background:#DCE7BC';
      planche.append(svg);
      document.body.append(planche);
      return BATIMENTS;
    });
    expect(ids.length).toBeGreaterThanOrEqual(15);
    for (const id of ids) {
      const b = await page.locator(`[data-role="catalogue"] [data-batiment="${id}"]`).boundingBox();
      expect(b.width, id).toBeGreaterThan(40);
    }
    await capturer(page, info, 'V27-catalogue');
  });
  test('V28 V29 base lente (réponse après 5 s) : la bulle s’ouvre tout de suite avec « Compte en cours », puis la pastille arrive dans la bulle ouverte', async ({ page }, info) => {
    test.skip(estTelephone(page), 'captures de la bulle : format ordinateur');
    await semer({ besoins: AVEC_COMPTEUR });
    await poserBase(page, 'lente');
    await ouvrir(page);
    // la lecture démarre dès l'affichage du village, avant tout survol
    await expect.poll(() => page.evaluate(() => window.__lectures.length)).toBe(1);
    await ouvrirBulle(page, 'haut');
    const attente = bulle(page).locator('[data-role="bulle-attente"]');
    await expect(attente).toBeVisible();
    await expect(attente).toHaveText('Compte en cours');
    await expect(bulle(page).locator('[data-role="bulle-pastille"]')).toHaveCount(0);
    await expect(bulle(page)).not.toContainText(/\d/);
    await capturer(page, info, 'V29-bulle-compte-en-cours');
    // plus de 3 s (l'ancien délai) puis la réponse de 5 s : la pastille apparaît sans rien toucher
    await expect(bulle(page).locator('[data-role="bulle-pastille"]')).toHaveText('12 à valider', { timeout: 10000 });
    await expect(attente).toHaveCount(0);
    await capturer(page, info, 'V28-bulle-pastille-arrivee');
    // le nombre reste connu pour les survols suivants
    await batiment(page, 'gauche').hover();
    await expect(bulle(page).locator('[data-role="bulle-nom"]')).toHaveText('Achats');
    await batiment(page, 'haut').hover();
    await expect(bulle(page).locator('[data-role="bulle-pastille"]')).toHaveText('12 à valider');
    await expect(bulle(page).locator('[data-role="bulle-attente"]')).toHaveCount(0);
  });

  test('V30 une seule lecture du compteur par affichage du village, même après plusieurs survols', async ({ page }) => {
    await semer({ besoins: AVEC_COMPTEUR });
    await poserBase(page, 'ok');
    await ouvrir(page);
    await expect.poll(() => page.evaluate(() => window.__lectures.length)).toBe(1);
    for (const nom of ['haut', 'gauche', 'haut', 'gauche', 'haut']) {
      if (estTelephone(page)) { await page.mouse.click(2, 2); await batiment(page, nom).click(); } else await batiment(page, nom).hover();
      await expect(bulle(page)).toBeVisible();
    }
    await expect(bulle(page).locator('[data-role="bulle-pastille"]')).toHaveText('12 à valider');
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => window.__lectures.length)).toBe(1);
  });

  test('V31 aucun title ni <title> SVG sur les bâtiments et les étiquettes (pas d’infobulle grise en double) ; chaque bâtiment garde son aria-label', async ({ page }) => {
    await semer({ besoins: QUATRE });
    await ouvrir(page);
    await expect(batiments(page)).toHaveCount(4);
    expect(await page.locator('[data-role="village"] title, [data-role="village"] [title], [data-role="page-village"] [title]').count()).toBe(0);
    const etiquettes = await batiments(page).evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
    expect(etiquettes).toEqual(QUATRE.map((b) => `${b.nom} : ${b.phrase}`));
    await expect(page.getByRole('link', { name: 'Factures : Valider mes factures fournisseurs' })).toHaveCount(1);
  });
});
