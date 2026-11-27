// Accueil « village », étape 2 de docs/accueil-village.md (27/11/2026) : chaque utilisateur range SON village sur un damier 8 x 8
// (js/os/village-damier.js, village-donnees.js, village-glisser.js, village-liste.js, village-reglages.js, village-ecran.js ; règles : firestore.rules).
// Un test par critère (le nom commence par son numéro), une capture par critère dans tests/e2e/captures/maison-village-damier/ (nommée avec le projet).
// Même méthode que tests/e2e/maison-village.spec.js : la fiche `ecran` est réécrite dans l'émulateur avant la connexion. Données d'exemple neutres.
// Comptes des parcours (outils.js) : JEROME est le titulaire ; CHARLES est un autre compte autorisé de la maison. Logique sans navigateur : tests/maison-village.test.js.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, ecrireDocument, listerDocuments, estTelephone, choisirDansMenuUtilisateur, JEROME, CHARLES, PROJET, FIRESTORE, ECRAN_PARCOURS, connecterCompte } from './outils.js';
import { semerFicheEmulateur } from '../_fiche-emulateur.js';

const DOSSIER = fileURLToPath(new URL('./captures/maison-village-damier/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' });
const HOTE = new URL(FIRESTORE).host;
const ACHATS = ['achatsfactures', 'tableauachats', 'achatschantiers', 'achatsfournisseurs', 'achatsarticles'];
const FACTURES = { nom: 'Factures', phrase: 'Valider mes factures fournisseurs', batiment: 'banque', cible: '#/achatsfactures/liste' };
const ACHATS_B = { nom: 'Achats', phrase: 'Payer moins cher mes articles', batiment: 'marche', cible: '#/tableauachats/tableau' };
const CHANTIERS = { nom: 'Chantiers', phrase: 'Suivre les dépenses de mes chantiers', batiment: 'grue', cible: '#/achatschantiers/liste' };
const FOURNISSEURS = { nom: 'Fournisseurs', phrase: 'Retrouver mes fournisseurs', batiment: 'entrepot', cible: '#/achatsfournisseurs/liste' };
const QUATRE = [FACTURES, ACHATS_B, CHANTIERS, FOURNISSEURS];
const semer = (champs) => semerFicheEmulateur({ projet: PROJET, hote: HOTE, document: 'ecran', fiche: { ...ECRAN_PARCOURS, configuration_crm: 'neutre', modules: ACHATS, ...champs } });

/** Connexion sur une adresse vide (#/) : la maison choisit elle-même son accueil (le village). */
async function ouvrir(page, email = CHARLES) {
  await connecter(page, email, { attendreAccueil: false, route: '' });
  await expect(page.locator('.coquille')).toBeVisible();
  await expect(page.locator('[data-role="village"]')).toBeVisible();
}
/** Connexion sur une autre page (Réglages), `avant(uid)` (semer, poser une panne), puis le village : il lit son rangement une seule fois, à l'ouverture. */
async function ouvrirApres(page, avant, email = CHARLES) {
  await connecter(page, email, { attendreAccueil: false, route: 'reglages' });
  await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible();
  const uid = await page.evaluate(async () => (await import(new URL('js/os/firebase.js', document.baseURI).href)).auth.currentUser.uid);
  await avant(uid);
  await page.evaluate(() => { location.hash = '#/accueil'; });
  await expect(page.locator('[data-role="village"]')).toBeVisible();
  return uid;
}
const uidDe = (page) => page.evaluate(async () => (await import(new URL('js/os/firebase.js', document.baseURI).href)).auth.currentUser.uid);
const batiments = (page) => page.locator('[data-role="village"] [data-role="batiment"]');
const maison = (page, nom) => page.locator(`[data-role="village"] [data-role="batiment"][aria-label^="${nom} :"], [data-role="village"] [data-role="batiment"][aria-label="${nom}"]`);
const noms = (page) => page.locator('[data-role="village"] [data-role="batiment-nom"]');
const bulle = (page) => page.locator('[data-role="bulle"]');
const roue = (page) => page.getByRole('button', { name: 'Réglages de l’accueil' });
const fenetreMaison = (page) => page.getByRole('dialog', { name: 'Réglages de la maison' });
const fenetreRoue = (page) => page.getByRole('dialog', { name: 'Réglages de l’accueil' });
const cases = (page) => batiments(page).evaluateAll((els) => Object.fromEntries(els.map((e) => [e.dataset.maison, e.dataset.case])));
const seChevauchent = (a, b) => !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);

/** Point de l'écran (px) du centre d'un bloc du damier, relevé de `dz` unités du dessin (pour viser les murs d'une maison). */
async function pointBloc(page, c, l, taille = 2, dz = 0) {
  return page.evaluate(async ([c0, l0, t, z]) => {
    const { centreBloc } = await import(new URL('js/os/village-damier.js', document.baseURI).href);
    const { iso } = await import(new URL('js/os/village-batiments.js', document.baseURI).href);
    const svg = document.querySelector('[data-role="village"]');
    const [x, y] = iso(...centreBloc(c0, l0, t), z);
    const p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
    return { x: p.x, y: p.y };
  }, [c, l, taille, dz]);
}
/** Point d'une maison où l'appuyer (ses murs, au-dessus du centre de son bloc). */
async function pointMaison(page, nom) {
  const [c, l] = (await maison(page, nom).getAttribute('data-case')).split('-').map(Number);
  return pointBloc(page, c, l, 2, 24);
}
/** Glisser à la souris une maison vers le bloc (c, l), ou vers un point de l'écran `{ x, y }`. */
async function glisser(page, nom, vers, { relacher = true } = {}) {
  const depart = await pointMaison(page, nom);
  const arrivee = vers.x !== undefined ? vers : await pointBloc(page, vers.c, vers.l, 2, 24);
  await page.mouse.move(depart.x, depart.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(depart.x + ((arrivee.x - depart.x) * i) / 8, depart.y + ((arrivee.y - depart.y) * i) / 8);
  if (relacher) await page.mouse.up();
}
/** Le même glisser au doigt (projet téléphone), par de vrais événements tactiles. `appui` : ms d'attente avant de bouger. */
async function glisserAuDoigt(page, depart, arrivee, { pas = 10, appui = 0 } = {}) {
  const cdp = await page.context().newCDPSession(page);
  const point = (p) => [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(depart) });
  if (appui) await page.waitForTimeout(appui);
  for (let i = 1; i <= pas; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point({ x: depart.x + ((arrivee.x - depart.x) * i) / pas, y: depart.y + ((arrivee.y - depart.y) * i) / pas }) });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
async function appuiLong(page, p) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }] });
  await page.waitForTimeout(700);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
/** Ouvre la fenêtre d'une maison : double clic (ordinateur) ou appui long (téléphone). */
async function ouvrirFenetreMaison(page, nom) {
  if (estTelephone(page)) await appuiLong(page, await pointMaison(page, nom));
  else await maison(page, nom).dblclick({ position: await positionDans(page, nom) });
  await expect(fenetreMaison(page)).toBeVisible();
}
/** Position (relative à la boîte de la maison) de ses murs, pour un clic précis. */
async function positionDans(page, nom) {
  const p = await pointMaison(page, nom);
  const b = await maison(page, nom).boundingBox();
  return { x: p.x - b.x, y: p.y - b.y };
}

test.describe('accueil village : damier rangé par chaque utilisateur', () => {
  test('2.1 une maison par besoin visible ; le damier 8 x 8 n’apparaît que pendant le rangement', async ({ page }, info) => {
    test.skip(estTelephone(page), 'glisser à la souris : parcours de l’ordinateur (le doigt : 2.3 téléphone)');
    await semer({ besoins: QUATRE });
    await ouvrir(page);
    await expect(batiments(page)).toHaveCount(4);
    expect(await cases(page)).toEqual({ 'b-achatsfactures-liste': '1-1', 'b-tableauachats-tableau': '1-5', 'b-achatschantiers-liste': '5-1', 'b-achatsfournisseurs-liste': '5-5' });
    const damier = page.locator('[data-role="damier"]');
    await expect(damier).toHaveAttribute('data-colonnes', '8');
    await expect(damier).toHaveAttribute('data-lignes', '8');
    expect(await damier.evaluate((e) => getComputedStyle(e).opacity)).toBe('0');
    await glisser(page, 'Factures', { c: 3, l: 3 }, { relacher: false });
    await expect(page.locator('[data-role="page-village"]')).toHaveAttribute('data-rangement', 'oui');
    await expect.poll(() => damier.evaluate((e) => getComputedStyle(e).opacity)).toBe('1');
    await expect(page.locator('[data-role="cible-rangement"]')).toHaveAttribute('data-libre', 'oui');
    await capturer(page, info, '2.1-quadrillage-pendant-le-rangement');
    await page.keyboard.press('Escape'); // la maison revient, sans message
    await expect(page.locator('[data-role="page-village"]')).toHaveAttribute('data-rangement', 'non');
    await page.mouse.up();
    expect((await cases(page))['b-achatsfactures-liste']).toBe('1-1');
    await expect(page).toHaveURL(/#\/accueil$/);
  });

  test('2.3 glisser une maison sur des cases libres ; une case prise ou hors du terrain la renvoie ; un simple clic ouvre toujours le besoin', async ({ page }, info) => {
    test.skip(estTelephone(page), 'souris : parcours de l’ordinateur (le doigt : test suivant)');
    await semer({ besoins: [FACTURES, ACHATS_B] });
    await ouvrir(page);
    await expect(page.locator('[data-role="village-phrase"]')).toHaveText('Glisse les maisons pour ranger ton village.');
    await glisser(page, 'Factures', { c: 3, l: 3 });
    await expect(maison(page, 'Factures')).toHaveAttribute('data-case', '3-3');
    await expect(page).toHaveURL(/#\/accueil$/); // le clic qui suit un glisser est avalé
    await expect(page.locator('[data-role="village-phrase"]')).toBeHidden(); // un document existe : la phrase d'aide part
    await capturer(page, info, '2.3-maison-deplacee');
    // sur la maison « Achats » (bloc 1-5) : refusé, elle revient
    await glisser(page, 'Factures', { c: 1, l: 5 });
    await expect(maison(page, 'Factures')).toHaveAttribute('data-case', '3-3');
    // hors du terrain (coin haut gauche de l'écran) : elle revient
    const vide = await page.locator('.village-defile').boundingBox();
    await glisser(page, 'Factures', { x: vide.x + 30, y: vide.y + 30 });
    await expect(maison(page, 'Factures')).toHaveAttribute('data-case', '3-3');
    await page.waitForTimeout(400);
    await expect(page).toHaveURL(/#\/accueil$/);
    // un simple clic ouvre le besoin (après 280 ms)
    await maison(page, 'Factures').click({ position: await positionDans(page, 'Factures') });
    await expect(page).toHaveURL(/#\/achatsfactures\/pile$/); // PR 730 : la cible « liste » de Factures ouvre son application
  });

  test('2.3 téléphone : le même glisser au doigt', async ({ page }, info) => {
    test.skip(!estTelephone(page), 'parcours propre au téléphone');
    await semer({ besoins: [FACTURES, ACHATS_B] });
    await ouvrir(page);
    await glisserAuDoigt(page, await pointMaison(page, 'Factures'), await pointBloc(page, 3, 3, 2, 24));
    await expect(maison(page, 'Factures')).toHaveAttribute('data-case', '3-3');
    await page.waitForTimeout(400);
    await expect(page).toHaveURL(/#\/accueil$/);
    await capturer(page, info, '2.3-maison-deplacee-au-doigt');
    await glisserAuDoigt(page, await pointMaison(page, 'Factures'), await pointBloc(page, 1, 5, 2, 24));
    await expect(maison(page, 'Factures')).toHaveAttribute('data-case', '3-3');
  });

  test('2.3 deux glisser rapprochés pendant une écriture lente : l’écran et la base restent d’accord ; un redessin pendant un glisser sort du rangement', async ({ page }, info) => {
    test.skip(estTelephone(page), 'souris : parcours de l’ordinateur');
    await semer({ besoins: [FACTURES, ACHATS_B] });
    const uid = await ouvrirApres(page, async () => { await page.evaluate(() => { window.__chevalierTest.pannesVillage = { lenteur: 1500 }; }); });
    const village = page.locator('[data-role="page-village"]');
    await glisser(page, 'Factures', { c: 3, l: 3 });
    await expect(maison(page, 'Factures')).toHaveAttribute('data-case', '3-3'); // tout de suite (optimiste)
    await glisser(page, 'Achats', { c: 6, l: 6 }); // la première écriture est encore en route
    await expect(maison(page, 'Achats')).toHaveAttribute('data-case', '6-6');
    await expect(village).toHaveAttribute('data-rangement', 'non');
    // les deux écritures arrivent, dans l'ordre : la base a les deux places, l'écran n'a pas bougé
    await expect.poll(async () => Object.fromEntries((await listerDocuments(`village_utilisateurs/${uid}/batiments`)).map((d) => [d.id, `${d.c}-${d.l}`])), { timeout: 10000 })
      .toEqual({ 'b-achatsfactures-liste': '3-3', 'b-tableauachats-tableau': '6-6' });
    expect(await cases(page)).toEqual({ 'b-achatsfactures-liste': '3-3', 'b-tableauachats-tableau': '6-6' });
    await capturer(page, info, '2.3-deux-glisser-rapproches');
    // une écriture qui échoue pendant qu'on glisse une autre maison : l'écran revient en arrière et sort du rangement
    await page.evaluate(() => { window.__chevalierTest.pannesVillage = { lenteur: 800, ecriture: 1 }; });
    await glisser(page, 'Factures', { c: 0, l: 0 });
    await glisser(page, 'Achats', { c: 3, l: 6 }, { relacher: false });
    await expect(village).toHaveAttribute('data-rangement', 'oui');
    await expect(page.locator('#toasts .toast-erreur')).toContainText('Le déplacement n’a pas été enregistré. Réessaie.');
    await expect(village).toHaveAttribute('data-rangement', 'non');
    await expect(maison(page, 'Factures')).toHaveAttribute('data-case', '3-3');
    await page.mouse.up();
    await expect(maison(page, 'Achats')).toHaveAttribute('data-case', '6-6');
    await page.reload();
    await expect(batiments(page)).toHaveCount(2);
    expect(await cases(page)).toEqual({ 'b-achatsfactures-liste': '3-3', 'b-tableauachats-tableau': '6-6' });
  });

  test('2.4 un double clic (téléphone : un appui long) ouvre la fenêtre de la maison, sans quitter l’accueil ; Échap la ferme', async ({ page }, info) => {
    await semer({ besoins: [FACTURES, ACHATS_B] });
    await ouvrir(page);
    await ouvrirFenetreMaison(page, 'Factures');
    const f = fenetreMaison(page);
    await expect(f.getByRole('textbox', { name: 'Nom' })).toHaveValue('Factures');
    await expect(f.getByRole('button', { name: 'Cacher cette maison' })).toBeVisible();
    await expect(f.getByRole('button', { name: 'Enregistrer' })).toBeVisible();
    await expect(f).not.toContainText(/petite maison|image/i);
    await expect(f.locator('input[type="file"]')).toHaveCount(0);
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/#\/accueil$/);
    await capturer(page, info, '2.4-fenetre-maison');
    await page.keyboard.press('Escape');
    await expect(f).toHaveCount(0);
    await expect(page).toHaveURL(/#\/accueil$/);
  });

  test('2.5 après rechargement, chaque maison est où on l’a laissée ; un document par maison visible', async ({ page }, info) => {
    test.skip(estTelephone(page), 'souris : parcours de l’ordinateur');
    await semer({ besoins: QUATRE });
    await ouvrir(page);
    await glisser(page, 'Factures', { c: 3, l: 3 });
    await expect(maison(page, 'Factures')).toHaveAttribute('data-case', '3-3');
    const avant = await cases(page);
    const uid = await uidDe(page);
    // l'écran se met à jour tout de suite (optimiste) : attendre que le lot soit écrit avant de recharger
    await expect.poll(async () => (await listerDocuments(`village_utilisateurs/${uid}/batiments`)).length).toBe(4);
    await page.reload();
    await expect(batiments(page)).toHaveCount(4);
    await expect(maison(page, 'Factures')).toHaveAttribute('data-case', '3-3');
    expect(await cases(page)).toEqual(avant);
    const docs = await listerDocuments(`village_utilisateurs/${uid}/batiments`);
    expect(docs.map((d) => d.id).sort()).toEqual(Object.keys(avant).sort());
    for (const d of docs) expect(`${d.c}-${d.l}`).toBe(avant[d.id]);
    await capturer(page, info, '2.5-apres-rechargement');
  });

  test('2.6 deux comptes de la même maison ont chacun leur village', async ({ page }, info) => {
    test.skip(estTelephone(page), 'souris : parcours de l’ordinateur');
    await semer({ besoins: [FACTURES, ACHATS_B] });
    await ouvrir(page, JEROME);
    await glisser(page, 'Factures', { c: 3, l: 3 });
    await expect(maison(page, 'Factures')).toHaveAttribute('data-case', '3-3');
    await ouvrirFenetreMaison(page, 'Factures');
    await fenetreMaison(page).getByRole('textbox', { name: 'Nom' }).fill('Ma banque');
    await fenetreMaison(page).getByRole('button', { name: 'Enregistrer' }).click();
    await expect(fenetreMaison(page)).toHaveCount(0);
    await expect(noms(page)).toContainText(['Ma banque']);
    await capturer(page, info, '2.6-village-du-titulaire');
    await choisirDansMenuUtilisateur(page, 'Se déconnecter');
    await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
    await page.evaluate(() => { location.hash = ''; });
    await connecterCompte(page, CHARLES);
    await expect(batiments(page)).toHaveCount(2);
    expect(await cases(page)).toEqual({ 'b-achatsfactures-liste': '1-1', 'b-tableauachats-tableau': '1-5' });
    await expect(noms(page)).toHaveText(['Factures', 'Achats']);
    await capturer(page, info, '2.6-village-autre-compte');
  });

  test('2.7 « Cacher » retire la maison (le module reste au menu) ; la roue la fait revenir ; un besoin hors du départ s’ajoute par la roue', async ({ page }, info) => {
    await semer({ besoins: [FACTURES, ACHATS_B, { ...CHANTIERS, depart: false }] });
    await ouvrir(page);
    await expect(batiments(page)).toHaveCount(2);
    await ouvrirFenetreMaison(page, 'Factures');
    await fenetreMaison(page).getByRole('button', { name: 'Cacher cette maison' }).click();
    await expect(fenetreMaison(page)).toHaveCount(0);
    await expect(batiments(page)).toHaveCount(1);
    const message = page.locator('#toasts .toast', { hasText: 'Maison cachée' });
    await expect(message).toBeVisible();
    await expect(message.locator('[data-action="toast-action"]')).toHaveText('Annuler');
    await capturer(page, info, '2.7-maison-cachee');
    // « Annuler » la remet, puis on la cache de nouveau
    await message.locator('[data-action="toast-action"]').click();
    await expect(batiments(page)).toHaveCount(2);
    await ouvrirFenetreMaison(page, 'Factures');
    await fenetreMaison(page).getByRole('button', { name: 'Cacher cette maison' }).click();
    await expect(batiments(page)).toHaveCount(1);
    // le module reste au menu
    expect(await page.locator('a[href="#/achatsfactures/liste"], a[href^="#/achatsfactures"]').count()).toBeGreaterThan(0);
    // la roue : « Afficher » pour Factures, « Ajouter » pour Chantiers
    await roue(page).click();
    const partie = fenetreRoue(page).locator('[data-role="maisons-a-ajouter"]');
    await expect(partie).toContainText('Afficher ou ajouter une maison');
    await expect(partie.getByRole('button', { name: 'Afficher Factures' })).toBeVisible();
    await expect(partie.getByRole('button', { name: 'Ajouter Chantiers' })).toBeVisible();
    await expect(partie).toContainText(estTelephone(page) ? 'Appui long sur une maison : ses réglages.' : 'Glisse une maison pour la déplacer. Double clic sur une maison : ses réglages.');
    await capturer(page, info, '2.7-roue-afficher-ajouter');
    await partie.getByRole('button', { name: 'Afficher Factures' }).click();
    await expect(partie.getByRole('button', { name: 'Afficher Factures' })).toHaveCount(0);
    await partie.getByRole('button', { name: 'Ajouter Chantiers' }).click();
    await expect(partie).toContainText('Toutes les maisons de ton entreprise sont déjà dans ton village.');
    await page.keyboard.press('Escape');
    await expect(batiments(page)).toHaveCount(3);
    await page.reload();
    await expect(batiments(page)).toHaveCount(3);
    await expect(fenetreRoue(page).getByRole('switch')).toHaveCount(0);
  });

  test('2.7 toutes les maisons cachées : la Mairie seule et une phrase d’aide', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    await ouvrir(page);
    await ouvrirFenetreMaison(page, 'Factures');
    await fenetreMaison(page).getByRole('button', { name: 'Cacher cette maison' }).click();
    await expect(batiments(page)).toHaveCount(0);
    await expect(page.locator('[data-role="village-phrase"]')).toHaveText('Affiche tes maisons avec la roue dentée.');
    await expect(page.locator('[data-role="batiment-fixe"][data-batiment-fixe="mairie-reglages"]')).toBeVisible();
    await capturer(page, info, '2.7-toutes-cachees');
  });

  test('2.8 « Renommer » change le nom sous la maison, dans la bulle et pour les lecteurs d’écran, pour moi seul ; vide : le nom d’origine revient', async ({ page }, info) => {
    await semer({ besoins: [FACTURES, ACHATS_B] });
    await ouvrir(page);
    await ouvrirFenetreMaison(page, 'Factures');
    await fenetreMaison(page).getByRole('textbox', { name: 'Nom' }).fill('Ma banque');
    await fenetreMaison(page).getByRole('button', { name: 'Enregistrer' }).click();
    await expect(fenetreMaison(page)).toHaveCount(0);
    await expect(noms(page)).toHaveText(['Ma banque', 'Achats']);
    await expect(maison(page, 'Ma banque')).toHaveAttribute('aria-label', 'Ma banque : Valider mes factures fournisseurs');
    if (estTelephone(page)) await maison(page, 'Ma banque').click({ position: await positionDans(page, 'Ma banque') });
    else await maison(page, 'Ma banque').hover({ position: await positionDans(page, 'Ma banque') });
    await expect(bulle(page).locator('[data-role="bulle-nom"]')).toHaveText('Ma banque');
    await capturer(page, info, '2.8-maison-renommee');
    // le menu garde le nom du module
    expect(await page.locator('.menu').innerText()).not.toContain('Ma banque');
    await page.mouse.click(5, 300);
    await ouvrirFenetreMaison(page, 'Ma banque');
    await fenetreMaison(page).getByRole('textbox', { name: 'Nom' }).fill('');
    await fenetreMaison(page).getByRole('button', { name: 'Enregistrer' }).click();
    await expect(noms(page)).toHaveText(['Factures', 'Achats']);
  });

  test('2.9 un besoin retiré, ou dont le module n’est pas allumé, n’a jamais de maison, même rangé avant', async ({ page }, info) => {
    await semer({ besoins: [FACTURES, { nom: 'Devis', phrase: 'Faire un devis', batiment: 'atelier', cible: '#/devis/liste' }] });
    await ouvrirApres(page, async (uid) => {
      await ecrireDocument(`village_utilisateurs/${uid}/batiments/b-inconnu`, { sorte: 'besoin', c: 3, l: 3 });
      await ecrireDocument(`village_utilisateurs/${uid}/batiments/b-devis-liste`, { sorte: 'besoin', c: 5, l: 5 });
    });
    await expect(batiments(page)).toHaveCount(1);
    await expect(noms(page)).toHaveText(['Factures']);
    await expect(page.locator('[data-role="page-village"]')).not.toContainText('Devis');
    await capturer(page, info, '2.9-besoin-hors-module');
  });

  test('2.10 téléphone : le village glisse au doigt ; « Liste » le change en liste de maisons cliquables ; le choix tient après rechargement', async ({ page }, info) => {
    if (!estTelephone(page)) {
      await semer({ besoins: QUATRE });
      await ouvrir(page);
      await expect(page.locator('[data-role="vue-liste"]')).toHaveCount(0); // ordinateur : pas de bouton « Liste »
      return;
    }
    await semer({ besoins: QUATRE });
    await ouvrir(page);
    await expect(batiments(page)).toHaveCount(4); // 3c : le rangement est lu (les maisons sont posées) avant de mesurer le défilement
    const defile = page.locator('.village-defile');
    expect(await defile.evaluate((d) => d.scrollWidth > d.clientWidth)).toBe(true);
    const avant = await defile.evaluate((d) => d.scrollLeft);
    // une case d'herbe libre, loin de toute maison (la lueur d'une maison déborde sur l'herbe voisine et prend le doigt)
    const herbe = await page.evaluate(async () => {
      const { centreBloc } = await import(new URL('js/os/village-damier.js', document.baseURI).href);
      const { iso } = await import(new URL('js/os/village-batiments.js', document.baseURI).href);
      const svg = document.querySelector('[data-role="village"]');
      const cadre = document.querySelector('.village-defile').getBoundingClientRect();
      for (let c = 0; c < 8; c++) {
        for (let l = 0; l < 8; l++) {
          const p = new DOMPoint(...iso(...centreBloc(c, l, 1))).matrixTransform(svg.getScreenCTM());
          if (p.x < cadre.left + 20 || p.x > cadre.right - 140 || p.y < cadre.top + 20 || p.y > cadre.bottom - 20) continue;
          const cible = document.elementFromPoint(p.x, p.y);
          if (cible?.closest('.village-terrain')) return { x: p.x, y: p.y };
        }
      }
      return null;
    });
    expect(herbe).not.toBeNull();
    await glisserAuDoigt(page, herbe, { x: herbe.x + 120, y: herbe.y });
    await expect.poll(() => defile.evaluate((d) => d.scrollLeft)).not.toBe(avant);
    // la lueur (halo) d'une maison, qui déborde sur l'herbe : le doigt y fait aussi glisser le village (Fable 5)
    const halo = await page.evaluate(() => {
      const cadre = document.querySelector('.village-defile').getBoundingClientRect();
      for (const e of document.querySelectorAll('[data-role="village"] .village-halo')) {
        const r = e.getBoundingClientRect();
        for (let fy = 0.15; fy < 0.9; fy += 0.05) {
          for (let fx = 0.1; fx < 0.9; fx += 0.05) {
            const x = r.left + r.width * fx;
            const y = r.top + r.height * fy;
            if (x < cadre.left + 20 || x > cadre.right - 140 || y < cadre.top + 20 || y > cadre.bottom - 20) continue;
            if (document.elementFromPoint(x, y) === e) return { x, y };
          }
        }
      }
      return null;
    });
    expect(halo).not.toBeNull();
    await defile.evaluate((d) => { d.scrollLeft = (d.scrollWidth - d.clientWidth) / 2; }); // 3c : le village n'est plus recentré après un glisser (le rangement lu ne le ramène plus au milieu) ; on le recentre pour pouvoir glisser encore vers la droite
    const avantHalo = await defile.evaluate((d) => d.scrollLeft);
    await glisserAuDoigt(page, halo, { x: halo.x + 120, y: halo.y });
    await expect.poll(() => defile.evaluate((d) => d.scrollLeft)).not.toBe(avantHalo);
    expect(Object.values(await cases(page)).sort()).toEqual(['1-1', '1-5', '5-1', '5-5']); // aucune maison n'a bougé
    const pageDefile = await page.evaluate(() => ({ x: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, y: window.scrollY }));
    expect(pageDefile).toEqual({ x: false, y: 0 });
    await capturer(page, info, '2.10-village-glisse');
    await page.locator('[data-role="vue-liste"]').click();
    const liste = page.locator('[data-role="liste-maisons"]');
    await expect(liste).toBeVisible();
    await expect(liste.locator('[data-role="liste-fixe"]')).toHaveCount(1);
    await expect(liste.locator('[data-role="liste-fixe"]')).toContainText('Mairie');
    await expect(liste.locator('[data-role="liste-maison"] [data-role="liste-nom"]')).toHaveText(['Factures', 'Achats', 'Chantiers', 'Fournisseurs']);
    await expect(page.locator('[data-role="vue-liste"]')).toHaveText('Village');
    await capturer(page, info, '2.10-vue-liste');
    await page.reload();
    await expect(page.locator('[data-role="liste-maisons"]')).toBeVisible();
    await page.locator('[data-role="liste-maison"]', { hasText: 'Chantiers' }).click();
    await expect(page).toHaveURL(/#\/achatschantiers\/liste$/);
    await page.evaluate(() => { location.hash = '#/accueil'; });
    await expect(page.locator('[data-role="liste-maisons"]')).toBeVisible();
    await page.locator('[data-role="vue-liste"]').click();
    await expect(page.locator('[data-role="liste-maisons"]')).toBeHidden();
    await expect(page.locator('[data-role="village"]')).toBeVisible();
    await expect(page.locator('[data-role="vue-liste"]')).toHaveText('Liste');
  });

  test('2.11 au clavier : Tab atteint chaque maison, Entrée l’ouvre tout de suite', async ({ page }, info) => {
    test.skip(estTelephone(page), 'clavier : parcours de l’ordinateur');
    await semer({ besoins: QUATRE });
    await ouvrir(page);
    await expect(batiments(page)).toHaveCount(4);
    await batiments(page).first().focus();
    const vus = new Set();
    for (let i = 0; i < 4; i++) {
      vus.add(await page.evaluate(() => document.activeElement?.dataset?.maison));
      await page.keyboard.press('Tab');
    }
    expect([...vus].sort()).toEqual(['b-achatschantiers-liste', 'b-achatsfactures-liste', 'b-achatsfournisseurs-liste', 'b-tableauachats-tableau']);
    await maison(page, 'Achats').focus();
    await capturer(page, info, '2.11-focus-clavier');
    await page.keyboard.press('Enter');
    await expect(page).toHaveURL(/#\/tableauachats\/tableau$/, { timeout: 250 });
  });

  test('2.12 aucun texte de l’accueil ne contient « CRM » (village, roue, fenêtre d’une maison, liste)', async ({ page }, info) => {
    await semer({ besoins: [FACTURES, ACHATS_B, { ...CHANTIERS, depart: false }] });
    await ouvrir(page);
    expect(await page.locator('[data-role="page-village"]').innerText()).not.toContain('CRM');
    await roue(page).click();
    expect(await fenetreRoue(page).innerText()).not.toContain('CRM');
    await page.keyboard.press('Escape');
    await ouvrirFenetreMaison(page, 'Factures');
    expect(await fenetreMaison(page).innerText()).not.toContain('CRM');
    await capturer(page, info, '2.12-sans-crm');
    await page.keyboard.press('Escape');
    if (estTelephone(page)) {
      await page.locator('[data-role="vue-liste"]').click();
      expect(await page.locator('[data-role="liste-maisons"]').innerText()).not.toContain('CRM');
    }
  });

  test('pannes lecture en panne : bandeau, village d’office, rien ne s’écrit ; « Réessayer » rend le rangement', async ({ page }, info) => {
    test.skip(estTelephone(page), 'souris : parcours de l’ordinateur');
    await semer({ besoins: [FACTURES, ACHATS_B] });
    const uid = await ouvrirApres(page, async (id) => {
      await ecrireDocument(`village_utilisateurs/${id}/batiments/b-achatsfactures-liste`, { sorte: 'besoin', c: 3, l: 3 });
      await page.evaluate(() => { window.__chevalierTest.pannesVillage = { lecture: 1 }; });
    });
    const bandeau = page.locator('[data-role="village-bandeau"]');
    await expect(bandeau).toContainText('Ton rangement n’a pas pu être lu. Réessaie.');
    await expect(bandeau.getByRole('button', { name: 'Réessayer' })).toBeVisible();
    await expect(maison(page, 'Factures')).toHaveAttribute('data-case', '1-1'); // village d'office
    await capturer(page, info, 'pannes-lecture');
    await glisser(page, 'Factures', { c: 5, l: 5 });
    await expect(page.locator('[data-role="page-village"]')).toHaveAttribute('data-rangement', 'non');
    expect((await cases(page))['b-achatsfactures-liste']).toBe('1-1');
    expect((await listerDocuments(`village_utilisateurs/${uid}/batiments`)).length).toBe(1);
    await bandeau.getByRole('button', { name: 'Réessayer' }).click();
    await expect(bandeau).toBeHidden();
    await expect(maison(page, 'Factures')).toHaveAttribute('data-case', '3-3');
  });

  test('pannes écriture en panne : la maison revient et un message le dit ; lecture refusée : pas de bandeau, ni glisser ni double clic', async ({ page }, info) => {
    test.skip(estTelephone(page), 'souris : parcours de l’ordinateur');
    await semer({ besoins: [FACTURES, ACHATS_B] });
    await ouvrirApres(page, async () => { await page.evaluate(() => { window.__chevalierTest.pannesVillage = { ecriture: 1 }; }); });
    await glisser(page, 'Factures', { c: 3, l: 3 });
    await expect(page.locator('#toasts .toast-erreur')).toContainText('Le déplacement n’a pas été enregistré. Réessaie.');
    await expect(maison(page, 'Factures')).toHaveAttribute('data-case', '1-1');
    await capturer(page, info, 'pannes-ecriture');
    // lecture refusée (règles pas encore publiées) : village d'office, sans bandeau ni rangement
    await page.evaluate(() => { window.__chevalierTest.pannesVillage = { refus: 1 }; location.hash = '#/reglages'; });
    await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible();
    await page.evaluate(() => { location.hash = '#/accueil'; });
    await expect(batiments(page)).toHaveCount(2);
    await expect(page.locator('[data-role="village-bandeau"]')).toBeHidden();
    await roue(page).click();
    await expect(fenetreRoue(page)).toBeVisible();
    await expect(fenetreRoue(page).locator('[data-role="maisons-a-ajouter"]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    // sans rangement, un clic ouvre tout de suite (comme à l'étape 1) : le double clic entre dans le module, jamais la fenêtre de la maison
    await maison(page, 'Factures').dblclick({ position: await positionDans(page, 'Factures') });
    await expect(page).toHaveURL(/#\/achatsfactures\/pile$/); // PR 730 : la cible « liste » de Factures ouvre son application
    await expect(fenetreMaison(page)).toHaveCount(0);
  });

  for (const n of [5, 8, 12]) {
    test(`captures rangement d’office avec ${n} besoins : rien ne cache la roue ni les îlots, les étiquettes ne se recouvrent pas`, async ({ page }, info) => {
      const modeles = ['banque', 'marche', 'grue', 'entrepot', 'atelier', 'bureau', 'poste', 'phare', 'radio', 'beffroi', 'clients', 'garage'];
      const nomsLongs = ['Factures', 'Payer moins cher', 'Chantiers en cours', 'Fournisseurs', 'Atelier', 'Bureau', 'Courrier client', 'Veille du métier', 'Réseaux sociaux', 'Tableau de bord', 'Mes clients', 'Maintenance'];
      const besoins = Array.from({ length: n }, (_, i) => ({ nom: nomsLongs[i], phrase: 'Un besoin', batiment: modeles[i], cible: `#/achatsfactures/vue${i + 1}` }));
      await semer({ besoins });
      await ouvrir(page, JEROME);
      await expect(batiments(page)).toHaveCount(n);
      await capturer(page, info, `captures-${n}-besoins`);
      const etiquettes = await page.locator('[data-role="etiquette"] rect').evaluateAll((els) => els.map((e) => e.getBoundingClientRect().toJSON()));
      for (let i = 0; i < etiquettes.length; i++) {
        for (let j = i + 1; j < etiquettes.length; j++) expect(seChevauchent(etiquettes[i], etiquettes[j]), `étiquettes ${i} et ${j}`).toBe(false);
      }
      if (estTelephone(page)) return; // téléphone : le dessin glisse sous les îlots (ils restent au-dessus, cliquables)
      const fixes = [await roue(page).boundingBox(), ...(await Promise.all((await page.locator('[data-role="batiment-fixe"]').all()).map((e) => e.boundingBox())))];
      for (const f of fixes) for (const e of etiquettes) expect(seChevauchent(f, e)).toBe(false);
    });
  }
});
