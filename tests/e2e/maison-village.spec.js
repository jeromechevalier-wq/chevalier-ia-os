// Accueil « village » d'une maison (26/11/2026) : champ facultatif `besoins` de reglages_maison/ecran (js/os/maison-village.js, js/os/village-ecran.js, js/os/village-compteurs.js, js/main.js).
// Étape 2 (27/11/2026) : le terrain est un damier 8 x 8 rangé par chaque utilisateur ; rangement d'office jusqu'à 4 besoins : cases 1-1 (haut), 1-5 (gauche), 5-1 (droite),
// 5-5 (bas), les places d'avant. Le décor (arbres, fleurs) n'est posé que sur des cases libres, ni cliquable ni atteignable au clavier. Parcours du rangement : maison-village-damier.spec.js.
// Un test par critère (le nom commence par son numéro), une capture par critère dans tests/e2e/captures/maison-village/ (nommée avec le projet : ordinateur ou téléphone).
// Même méthode que tests/e2e/maison-modules.spec.js : la fiche `ecran` est réécrite dans l'émulateur avant la connexion. Données d'exemple neutres.
// Le compteur de la bulle lit la base de l'espace par le faux réseau du crochet de test `window.__accesBase` (émulateurs seulement, voir js/os/acces-base.js).
// Comptes des parcours (outils.js) : JEROME est le titulaire ; CHARLES est un autre compte autorisé de la maison. Logique sans navigateur : tests/maison-village.test.js.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, ecrireDocument, estTelephone, CHARLES, PROJET, FIRESTORE, ECRAN_PARCOURS, villageParDefaut } from './outils.js';
import { semerFicheEmulateur } from '../_fiche-emulateur.js';

// Depuis le 28/11/2026 l'accueil par défaut est le menu classique : ces parcours du village remettent le village par défaut (crochet de test, docs/accueil-village.md).
test.beforeEach(async ({ page }) => { await villageParDefaut(page); });

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
// Les 4 places d'office (haut, gauche, droite, bas) sont les cases 3-3, 3-7, 7-3, 7-7 : celles d'avant le damier 12 x 12 (1-1, 1-5, 5-1, 5-5) décalées de 2 (27/11/2026).
const CASES = Object.freeze({ haut: '3-3', gauche: '3-7', droite: '7-3', bas: '7-7' });
const batiment = (page, nom) => page.locator(`[data-role="village"] [data-role="batiment"][data-case="${CASES[nom]}"]`);
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
  test('V11 un seul besoin : l’adresse vide ouvre le village (#/accueil), le damier 8 x 8 est là et la maison est à la place du haut (case 1-1), avec son nom', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    await ouvrir(page);
    await expect(page).toHaveURL(/#\/accueil$/);
    await expect(batiments(page)).toHaveCount(1);
    const b = batiments(page).first();
    await expect(b).toHaveAttribute('aria-label', 'Factures : Valider mes factures fournisseurs');
    await expect(b).toHaveAttribute('data-case', '3-3');
    await expect(noms(page)).toHaveText(['Factures']); // étiquette permanente : le nom seul (la phrase est dans la bulle)
    const damier = page.locator('[data-role="village"] [data-role="damier"]');
    await expect(damier).toHaveAttribute('data-colonnes', '12');
    await expect(damier).toHaveAttribute('data-lignes', '12');
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

  test('V14 deux besoins : les cases 1-1 (haut) et 1-5 (gauche) sont occupées ; du décor sur des cases libres seulement ; même taille de bâtiment qu’avec un seul besoin', async ({ page }, info) => {
    await semer({ besoins: [FACTURES, ACHATS_B] });
    await ouvrir(page);
    await expect(batiments(page)).toHaveCount(2);
    await expect(batiment(page, 'haut')).toHaveAttribute('data-cible', '#/achatsfactures/liste');
    await expect(batiment(page, 'gauche')).toHaveAttribute('data-cible', '#/tableauachats/tableau');
    const decor = await page.locator('[data-role="decor"]').evaluateAll((els) => els.map((e) => e.dataset.case));
    expect(decor.length).toBeGreaterThan(0);
    const occupees = new Set(['3-3', '3-4', '4-3', '4-4', '3-7', '3-8', '4-7', '4-8']);
    for (const c of decor) expect(occupees.has(c), `décor sur ${c}`).toBe(false);
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

  test('V16 téléphone : le village est plus grand que l’écran et glisse au doigt (la page, elle, ne défile pas) ; noms lisibles (13 px au moins) ; deux touchers ouvrent la cible', async ({ page }, info) => {
    test.skip(!estTelephone(page), 'parcours propre au format téléphone');
    await semer({ besoins: QUATRE });
    await ouvrir(page);
    await expect(page.locator('[data-role="village"]')).toHaveAttribute('data-disposition', 'terrain-telephone');
    await expect(batiments(page)).toHaveCount(4);
    const large = await page.locator('.village-defile').evaluate((d) => d.scrollWidth > d.clientWidth + 1);
    expect(large).toBe(true);
    for (const t of await noms(page).all()) expect(await tailleEcran(t)).toBeGreaterThanOrEqual(13);
    expect((await defilements(page)).horizontal).toBe(false);
    await capturer(page, info, 'V16-telephone-terrain');
    await batiment(page, 'droite').click();
    await expect(bulle(page)).toContainText('Chantiers');
    await expect(page).toHaveURL(/#\/accueil$/);
    await batiment(page, 'droite').click();
    await expect(page).toHaveURL(/#\/achatschantiers\/liste$/);
  });


  test('V17 cinq besoins (et des entrées mal formées, ignorées) : les 5 sont montrés ; les étiquettes ne se recouvrent pas', async ({ page }, info) => {
    await semer({ besoins: [{ nom: 'Piège', cible: 'javascript:alert(1)' }, 'texte seul', ...QUATRE, { nom: 'Cinquième', phrase: 'En plus', cible: '#/achatsarticles/liste' }] });
    await ouvrir(page);
    await expect(batiments(page)).toHaveCount(5);
    await expect(noms(page)).toHaveText(['Factures', 'Achats', 'Chantiers', 'Fournisseurs', 'Cinquième']);
    await expect(page.getByText('Piège')).toHaveCount(0);
    // les étiquettes ne se chevauchent pas
    const boites = await page.locator('[data-role="etiquette"] rect').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
    for (let i = 0; i < boites.length; i++) {
      for (let j = i + 1; j < boites.length; j++) {
        const [a, b] = [boites[i], boites[j]];
        expect(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top, `étiquettes ${i} et ${j}`).toBe(true);
      }
    }
    await capturer(page, info, 'V17-cinq-besoins');
  });


  test('V20 le décor et le quadrillage ne sont ni cliquables ni atteignables au clavier (aria-hidden, aucun focus) ; un clic sur une case libre ne change pas d’écran', async ({ page }) => {
    await semer({ besoins: [FACTURES] });
    await ouvrir(page);
    const caches = page.locator('[data-role="decor"], [data-role="damier"]');
    expect(await caches.count()).toBeGreaterThan(1);
    for (const l of await caches.all()) {
      await expect(l).toHaveAttribute('aria-hidden', 'true');
      expect(await l.getAttribute('tabindex')).toBeNull();
    }
    expect(await page.locator('[data-role="village"] [tabindex]').count()).toBe(1); // seule la maison est atteignable au clavier
    // un clic au milieu d'une case libre (bloc 9-9, devant ; 5-5 avec l'ancien damier 8 x 8) ne change pas d'écran
    const point = await page.evaluate(async () => {
      const { centreBloc } = await import(new URL('js/os/village-damier.js', document.baseURI).href);
      const { iso } = await import(new URL('js/os/village-batiments.js', document.baseURI).href);
      const svg = document.querySelector('[data-role="village"]');
      const [x, y] = iso(...centreBloc(9, 9, 2));
      const p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
      return { x: p.x, y: p.y };
    });
    await page.mouse.click(point.x, point.y);
    await page.waitForTimeout(400);
    await expect(page).toHaveURL(/#\/accueil$/);
    await expect(bulle(page)).toBeHidden();
  });


  for (const [nombre, besoins] of [[1, [FACTURES]], [4, QUATRE]]) {
    test(`V21 sans défilement de la page (ordinateur 1440 x 900 et téléphone) ; sur ordinateur le terrain entier tient dans l’écran, avec ${nombre} besoin${nombre > 1 ? 's' : ''}`, async ({ page }) => {
      await semer({ besoins });
      await ouvrir(page);
      const d = await defilements(page);
      expect(d.horizontal).toBe(false);
      expect(d.vertical).toBe(false);
      const h = await page.evaluate(() => window.innerHeight);
      const cadre = await page.locator('.village-cadre').boundingBox();
      expect(cadre.y + cadre.height).toBeLessThanOrEqual(h + 1); // le cadre tient dans l'écran
      if (estTelephone(page)) return; // téléphone : le dessin est plus large que l'écran et glisse au doigt (étape 2, D9) ; seul le cadre compte
      const terrain = await page.locator('.village-terrain').boundingBox();
      expect(terrain.y).toBeGreaterThanOrEqual(0);
      expect(terrain.y + terrain.height).toBeLessThanOrEqual(h);
      expect(terrain.height).toBeGreaterThan(h * 0.5); // coins rognés : le losange occupe l'écran, pas de grand vide
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

  test('D12 damier de départ 12 x 12 avec 4 maisons : ordinateur, tout le terrain visible sans défiler, noms de 20 à 28 px ; téléphone, le dessin glisse et s’ouvre centré ; les îlots ne couvrent ni maison ni nom', async ({ page }, info) => {
    await semer({ besoins: QUATRE });
    await ouvrir(page);
    await expect(batiments(page)).toHaveCount(4);
    await expect(page.locator('[data-role="village"] [data-role="damier"]')).toHaveAttribute('data-colonnes', '12');
    const h = await page.evaluate(() => window.innerHeight);
    const w = await page.evaluate(() => window.innerWidth);
    const defile = page.locator('.village-defile');
    if (estTelephone(page)) {
      expect(await defile.evaluate((d) => d.scrollWidth > d.clientWidth + 1)).toBe(true);
      const centre = await defile.evaluate((d) => Math.abs(d.scrollLeft - (d.scrollWidth - d.clientWidth) / 2));
      expect(centre).toBeLessThanOrEqual(2); // le village s'ouvre centré
      for (const t of await noms(page).all()) expect(await tailleEcran(t)).toBeGreaterThanOrEqual(13);
    } else {
      const terrain = await page.locator('.village-terrain').boundingBox();
      expect(terrain.x).toBeGreaterThanOrEqual(0);
      expect(terrain.y).toBeGreaterThanOrEqual(0);
      expect(terrain.x + terrain.width).toBeLessThanOrEqual(w);
      expect(terrain.y + terrain.height).toBeLessThanOrEqual(h);
      for (const t of await noms(page).all()) { const taille = await tailleEcran(t); expect(taille).toBeGreaterThanOrEqual(20); expect(taille).toBeLessThanOrEqual(28); }
      // Mairie et Console (coins bas) ne couvrent ni une maison ni un nom
      const fixes = await Promise.all((await page.locator('[data-role="batiment-fixe"]').all()).map((e) => e.boundingBox()));
      const zones = [
        ...(await Promise.all((await page.locator('[data-role="village"] [data-role="batiment"] .village-lever').all()).map((e) => e.boundingBox()))),
        ...(await Promise.all((await page.locator('[data-role="village"] [data-role="etiquette"] rect').all()).map((e) => e.boundingBox()))),
      ];
      const chevauche = (a, b) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
      for (const f of fixes) for (const z of zones) expect(chevauche(f, z)).toBe(false);
    }
    expect((await defilements(page)).horizontal).toBe(false);
    await capturer(page, info, 'D12-damier-12');
  });
});
