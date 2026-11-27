// Accueil « village », étape 3b de docs/accueil-village.md (27/11/2026) : la maison « lien externe » (roue dentée > « Ajouter un lien externe »).
// Un test par critère (3.1 à 3.6, le nom commence par son numéro), une capture par critère dans tests/e2e/captures/maison-village-lien/ (nommée avec le projet).
// Même méthode que tests/e2e/maison-village-damier.spec.js. Le site ouvert est factice (context.route sur https://exemple.test/**) : aucun accès à Internet.
// Logique sans navigateur (adresseExterne, docLien, rangerVillage avec des liens) : fin de tests/maison-village.test.js.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, ecrireDocument, listerDocuments, estTelephone, CHARLES, PROJET, FIRESTORE, ECRAN_PARCOURS } from './outils.js';
import { semerFicheEmulateur } from '../_fiche-emulateur.js';

const DOSSIER = fileURLToPath(new URL('./captures/maison-village-lien/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' });
const HOTE = new URL(FIRESTORE).host;
const ACHATS = ['achatsfactures', 'tableauachats', 'achatschantiers', 'achatsfournisseurs', 'achatsarticles'];
const FACTURES = { nom: 'Factures', phrase: 'Valider mes factures fournisseurs', batiment: 'banque', cible: '#/achatsfactures/liste' };
const semer = (champs) => semerFicheEmulateur({ projet: PROJET, hote: HOTE, document: 'ecran', fiche: { ...ECRAN_PARCOURS, configuration_crm: 'neutre', modules: ACHATS, ...champs } });
const SITE = 'https://exemple.test/site';
const LIEN = { sorte: 'lien', nom: 'Mon site', url: SITE, batiment: 'phare', c: 7, l: 7 };

/** Connexion sur Réglages, `avant(uid)` (semer des maisons), puis le village : il lit son rangement une seule fois, à l'ouverture. */
async function ouvrirApres(page, avant = async () => {}, email = CHARLES) {
  await connecter(page, email, { attendreAccueil: false, route: 'reglages' });
  await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible();
  const uid = await page.evaluate(async () => (await import(new URL('js/os/firebase.js', document.baseURI).href)).auth.currentUser.uid);
  await avant(uid);
  await page.evaluate(() => { location.hash = '#/accueil'; });
  await expect(page.locator('[data-role="village"]')).toBeVisible();
  // 3c (relecture Fable) : le rangement lu (la roue n'a « Ajouter un lien externe » qu'après), petites maisons comprises
  await expect(page.locator('[data-role="page-village"]')).toHaveAttribute('data-petites-lues', 'oui');
  return uid;
}
const semerLien = (uid, id, champs = {}) => ecrireDocument(`village_utilisateurs/${uid}/batiments/${id}`, { ...LIEN, ...champs });
const batiments = (page) => page.locator('[data-role="village"] [data-role="batiment"]');
const maison = (page, nom) => page.locator(`[data-role="village"] [data-role="batiment"][aria-label^="${nom.replace(/["\\]/g, '\\$&')} :"]`);
const bulle = (page) => page.locator('[data-role="bulle"]');
const roue = (page) => page.getByRole('button', { name: 'Réglages de l’accueil' });
const fenetreAjout = (page) => page.getByRole('dialog', { name: 'Ajouter un lien externe' });
const fenetreLien = (page) => page.getByRole('dialog', { name: 'Réglages du lien' });
/** Site factice : une petite page, servie sans réseau. */
const siteFactice = (context) => context.route('https://exemple.test/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Site</title><h1>Site factice</h1>' }));

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
async function pointMaison(page, nom) {
  const [c, l] = (await maison(page, nom).getAttribute('data-case')).split('-').map(Number);
  return pointBloc(page, c, l, 2, 24);
}
async function positionDans(page, nom) {
  const p = await pointMaison(page, nom);
  const b = await maison(page, nom).boundingBox();
  return { x: p.x - b.x, y: p.y - b.y };
}
async function appuiLong(page, p) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }] });
  await page.waitForTimeout(700);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
/** Ouvre la fenêtre d'un lien : double clic (ordinateur) ou appui long (téléphone). */
async function ouvrirFenetreLien(page, nom) {
  if (estTelephone(page)) {
    // sur téléphone, le village est plus large que l'écran : amener la maison au milieu avant l'appui long
    await maison(page, nom).evaluate((m) => m.scrollIntoView({ block: 'center', inline: 'center' }));
    await appuiLong(page, await pointMaison(page, nom));
  } else await maison(page, nom).dblclick({ position: await positionDans(page, nom) });
  await expect(fenetreLien(page)).toBeVisible();
}
/** Remplit et valide la fenêtre « Ajouter un lien externe ». */
async function remplirAjout(page, { nom, adresse, image }) {
  const f = fenetreAjout(page);
  await f.getByRole('textbox', { name: 'Nom' }).fill(nom);
  await f.getByRole('textbox', { name: 'Adresse du site' }).fill(adresse);
  if (image) await f.locator(`[data-role="images-lien"] input[value="${image}"]`).check();
  await f.getByRole('button', { name: 'Ajouter' }).click();
}

test.describe('accueil village : maison « lien externe »', () => {
  test('3.1 la roue dentée > « Ajouter un lien externe » crée une maison (nom, adresse, image du catalogue) qui tient après rechargement', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    const uid = await ouvrirApres(page);
    await expect(batiments(page)).toHaveCount(1);
    await roue(page).click();
    const bouton = page.getByRole('button', { name: 'Ajouter un lien externe' });
    await expect(bouton).toBeEnabled();
    await bouton.click();
    await expect(fenetreAjout(page)).toBeVisible();
    await fenetreAjout(page).getByRole('textbox', { name: 'Nom' }).fill('Mon site');
    await fenetreAjout(page).getByRole('textbox', { name: 'Adresse du site' }).fill('exemple.test/accueil');
    await fenetreAjout(page).locator('[data-role="images-lien"] input[value="phare"]').check();
    await capturer(page, info, '3.1-fenetre-ajout');
    await fenetreAjout(page).getByRole('button', { name: 'Ajouter' }).click();
    await expect(fenetreAjout(page)).toHaveCount(0);
    await expect(page.getByRole('dialog', { name: 'Réglages de l’accueil' })).toHaveCount(0); // la roue se ferme pour montrer la nouvelle maison
    await expect(batiments(page)).toHaveCount(2);
    const lien = maison(page, 'Mon site');
    await expect(lien).toHaveAttribute('data-sorte', 'lien');
    await expect(lien).toHaveAttribute('data-batiment', 'phare');
    await expect(lien).toHaveAttribute('href', 'https://exemple.test/accueil'); // « exemple.test/… » a reçu https:// tout seul
    await expect(page.locator('[data-role="etiquette"] [data-role="marque-externe"]')).toHaveCount(1);
    await expect.poll(async () => (await listerDocuments(`village_utilisateurs/${uid}/batiments`)).filter((d) => d.sorte === 'lien').length).toBe(1);
    const [doc] = (await listerDocuments(`village_utilisateurs/${uid}/batiments`)).filter((d) => d.sorte === 'lien');
    expect(doc).toMatchObject({ nom: 'Mon site', url: 'https://exemple.test/accueil', batiment: 'phare' });
    expect(doc.id).toMatch(/^l-[a-z0-9-]+$/);
    if (estTelephone(page)) await lien.evaluate((m) => m.scrollIntoView({ block: 'center', inline: 'center' }));
    await capturer(page, info, '3.1-maison-lien');
    await page.reload();
    await expect(batiments(page)).toHaveCount(2);
    await expect(maison(page, 'Mon site')).toHaveAttribute('href', 'https://exemple.test/accueil');
  });

  test('3.2 une adresse qui n’est pas en https:// (http, javascript, ftp) ou qui contient des identifiants est refusée avec un message clair', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    const uid = await ouvrirApres(page);
    await roue(page).click();
    await page.getByRole('button', { name: 'Ajouter un lien externe' }).click();
    const f = fenetreAjout(page);
    const erreur = f.locator('[data-role="erreur-adresse-lien"]');
    for (const [adresse, message] of [
      ['http://exemple.test', 'L’adresse doit commencer par https://'],
      ['javascript:alert(1)', 'L’adresse doit commencer par https://'],
      ['ftp://exemple.test', 'L’adresse doit commencer par https://'],
      ['https://moi:secret@exemple.test', 'L’adresse ne doit contenir ni nom d’utilisateur ni mot de passe.'],
    ]) {
      await remplirAjout(page, { nom: 'Piège', adresse });
      await expect(erreur).toBeVisible();
      await expect(erreur).toHaveText(message);
      await expect(f).toBeVisible(); // la fenêtre reste ouverte
      if (adresse.startsWith('javascript')) await capturer(page, info, '3.2-adresse-refusee');
    }
    // nom vide : un message aussi
    await f.getByRole('textbox', { name: 'Nom' }).fill('');
    await f.getByRole('textbox', { name: 'Adresse du site' }).fill('https://exemple.test');
    await f.getByRole('button', { name: 'Ajouter' }).click();
    await expect(f.locator('[data-role="erreur-nom-lien"]')).toBeVisible();
    await page.keyboard.press('Escape');
    expect((await listerDocuments(`village_utilisateurs/${uid}/batiments`)).filter((d) => d.sorte === 'lien')).toHaveLength(0);
    await expect(page.locator('[data-role="village"] [data-sorte="lien"]')).toHaveCount(0);
  });

  test('3.3 un clic sur la maison ouvre le site dans un NOUVEL onglet, sans lien avec l’appli ; l’appli reste ouverte sur l’accueil', async ({ page, context }, info) => {
    await siteFactice(context);
    await semer({ besoins: [FACTURES] });
    await ouvrirApres(page, (uid) => semerLien(uid, 'l-a'));
    const lien = maison(page, 'Mon site');
    await expect(lien).toBeVisible();
    if (estTelephone(page)) {
      await lien.evaluate((m) => m.scrollIntoView({ block: 'center', inline: 'center' }));
      await lien.click({ position: await positionDans(page, 'Mon site') }); // premier toucher : la bulle
      await expect(bulle(page)).toBeVisible();
    }
    const [onglet] = await Promise.all([context.waitForEvent('page'), lien.click({ position: await positionDans(page, 'Mon site') })]);
    await onglet.waitForLoadState();
    expect(onglet.url()).toBe(SITE);
    await expect(onglet.getByRole('heading', { name: 'Site factice' })).toBeVisible();
    expect(await onglet.evaluate(() => window.opener)).toBeNull();
    expect(await onglet.evaluate(() => document.referrer)).toBe('');
    await page.waitForTimeout(400);
    await expect(page).toHaveURL(/#\/accueil$/);
    expect(context.pages()).toHaveLength(2);
    await capturer(onglet, info, '3.3-nouvel-onglet');
    await onglet.close();
    // au clavier aussi (ordinateur) : Entrée ouvre un nouvel onglet, l'appli ne bouge pas
    if (!estTelephone(page)) {
      await lien.focus();
      const [autre] = await Promise.all([context.waitForEvent('page'), page.keyboard.press('Enter')]);
      expect(autre.url()).toBe(SITE);
      await page.waitForTimeout(400);
      expect(context.pages()).toHaveLength(2); // un seul nouvel onglet : Entrée n'ouvre pas deux fois
      await autre.close();
      await expect(page).toHaveURL(/#\/accueil$/);
    }
    await capturer(page, info, '3.3-appli-reste');
  });

  test('3.4 le lien porte rel="noopener noreferrer" et target="_blank", dans le dessin et dans la vue Liste', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    await ouvrirApres(page, (uid) => semerLien(uid, 'l-a'));
    const lien = maison(page, 'Mon site');
    await expect(lien).toHaveAttribute('rel', 'noopener noreferrer');
    await expect(lien).toHaveAttribute('target', '_blank');
    await expect(lien).toHaveAttribute('href', SITE);
    expect(await lien.evaluate((a) => a.tagName.toLowerCase())).toBe('a');
    if (estTelephone(page)) {
      await page.locator('[data-role="vue-liste"]').click();
      const ligne = page.locator('[data-role="liste-maisons"] a[data-sorte="lien"]');
      await expect(ligne).toHaveCount(1);
      await expect(ligne).toHaveAttribute('href', SITE);
      await expect(ligne).toHaveAttribute('rel', 'noopener noreferrer');
      await expect(ligne).toHaveAttribute('target', '_blank');
      await expect(ligne).toContainText('Mon site');
      await capturer(page, info, '3.4-liste-lien');
      await page.locator('[data-role="vue-liste"]').click(); // remet la vue « Village » pour les autres tests
    } else {
      await capturer(page, info, '3.4-lien-dessin');
    }
  });

  test('3.5 la bulle de la maison montre l’adresse entière du site', async ({ page }, info) => {
    const longue = `https://exemple.test/un/chemin/assez/long?avec=des&parametres=1#fin`;
    await semer({ besoins: [FACTURES] });
    await ouvrirApres(page, (uid) => semerLien(uid, 'l-a', { url: longue }));
    const lien = maison(page, 'Mon site');
    if (estTelephone(page)) {
      await lien.evaluate((m) => m.scrollIntoView({ block: 'center', inline: 'center' }));
      await lien.click({ position: await positionDans(page, 'Mon site') });
    } else await lien.hover({ position: await positionDans(page, 'Mon site') });
    await expect(bulle(page)).toBeVisible();
    await expect(bulle(page).locator('[data-role="bulle-nom"]')).toHaveText('Mon site');
    await expect(bulle(page).locator('[data-role="bulle-adresse"]')).toHaveText(longue);
    await expect(bulle(page)).toContainText(estTelephone(page) ? 'Touche encore pour ouvrir le site dans un nouvel onglet' : 'Clique pour ouvrir le site dans un nouvel onglet');
    await capturer(page, info, '3.5-bulle-adresse');
    await expect(page).toHaveURL(/#\/accueil$/);
  });

  test('3.6 l’image se choisit seulement dans le catalogue, aucun envoi de fichier ; la fenêtre du lien change nom, adresse et image', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    const uid = await ouvrirApres(page, (u) => semerLien(u, 'l-a'));
    // fenêtre d'ajout
    await roue(page).click();
    await page.getByRole('button', { name: 'Ajouter un lien externe' }).click();
    await expect(fenetreAjout(page).locator('input[type="file"]')).toHaveCount(0);
    const valeurs = await fenetreAjout(page).locator('[data-role="images-lien"] input[type="radio"]').evaluateAll((els) => els.map((e) => e.value));
    const catalogue = await page.evaluate(async () => [...(await import(new URL('js/os/village-batiments.js', document.baseURI).href)).BATIMENTS]);
    expect(catalogue.length).toBeGreaterThan(10);
    expect(valeurs).toEqual(catalogue);
    await expect(fenetreAjout(page).locator('[data-role="images-lien"] input:checked')).toHaveValue('bureau');
    await fenetreAjout(page).getByRole('button', { name: 'Annuler' }).click();
    await page.keyboard.press('Escape');
    // fenêtre d'un lien (double clic ou appui long) : nom, adresse, image, « Retirer du village », « Enregistrer »
    await ouvrirFenetreLien(page, 'Mon site');
    const f = fenetreLien(page);
    await expect(f.locator('input[type="file"]')).toHaveCount(0);
    await expect(f.getByRole('textbox', { name: 'Nom' })).toHaveValue('Mon site');
    await expect(f.getByRole('textbox', { name: 'Adresse du site' })).toHaveValue(SITE);
    await expect(f.locator('[data-role="images-lien"] input:checked')).toHaveValue('phare');
    await expect(f.getByRole('button', { name: 'Retirer du village' })).toBeVisible();
    await capturer(page, info, '3.6-fenetre-lien');
    await f.getByRole('textbox', { name: 'Nom' }).fill('Fournisseur');
    await f.getByRole('textbox', { name: 'Adresse du site' }).fill('exemple.test/catalogue');
    await f.locator('[data-role="images-lien"] input[value="entrepot"]').check();
    await f.getByRole('button', { name: 'Enregistrer' }).click();
    await expect(f).toHaveCount(0);
    const lien = maison(page, 'Fournisseur');
    await expect(lien).toHaveAttribute('href', 'https://exemple.test/catalogue');
    await expect(lien).toHaveAttribute('data-batiment', 'entrepot');
    await expect(page).toHaveURL(/#\/accueil$/);
    await expect.poll(async () => (await listerDocuments(`village_utilisateurs/${uid}/batiments`)).find((d) => d.id === 'l-a')?.nom).toBe('Fournisseur');
  });

  test('3.2 un lien dont l’adresse ne passe plus le contrôle : maison grisée, sans lien, bulle « Adresse refusée »', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    await ouvrirApres(page, (uid) => semerLien(uid, 'l-a', { url: 'https://localhost/' }));
    const lien = maison(page, 'Mon site');
    await expect(lien).toHaveClass(/village-batiment-invalide/);
    expect(await lien.getAttribute('href')).toBeNull();
    if (estTelephone(page)) {
      await lien.evaluate((m) => m.scrollIntoView({ block: 'center', inline: 'center' }));
      await lien.click({ position: await positionDans(page, 'Mon site') });
    } else await lien.hover({ position: await positionDans(page, 'Mon site') });
    await expect(bulle(page).locator('[data-role="bulle-adresse"]')).toHaveText('Adresse refusée : modifie ou retire cette maison.');
    // un clic n'ouvre rien
    await lien.click({ position: await positionDans(page, 'Mon site') });
    await page.waitForTimeout(500);
    expect(page.context().pages()).toHaveLength(1);
    await expect(page).toHaveURL(/#\/accueil$/);
    await capturer(page, info, '3.2-lien-invalide');
  });

  test('3.1 glisser un lien le déplace ; « Retirer du village » le retire après confirmation, « Annuler » le recrée', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    const uid = await ouvrirApres(page, (u) => semerLien(u, 'l-a'));
    const docs = () => listerDocuments(`village_utilisateurs/${uid}/batiments`);
    if (!estTelephone(page)) {
      const depart = await pointMaison(page, 'Mon site');
      const arrivee = await pointBloc(page, 5, 7, 2, 24);
      await page.mouse.move(depart.x, depart.y);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) await page.mouse.move(depart.x + ((arrivee.x - depart.x) * i) / 8, depart.y + ((arrivee.y - depart.y) * i) / 8);
      await page.mouse.up();
      await expect(maison(page, 'Mon site')).toHaveAttribute('data-case', '5-7');
      await expect.poll(async () => { const d = (await docs()).find((x) => x.id === 'l-a'); return d && `${d.c}-${d.l}`; }).toBe('5-7');
      expect(page.context().pages()).toHaveLength(1); // un glisser n'ouvre jamais le site
    }
    await ouvrirFenetreLien(page, 'Mon site');
    await fenetreLien(page).getByRole('button', { name: 'Retirer du village' }).click();
    const confirmation = page.getByRole('dialog', { name: 'Retirer ce lien ?' });
    await expect(confirmation).toBeVisible();
    await confirmation.getByRole('button', { name: 'Retirer' }).click();
    await expect(fenetreLien(page)).toHaveCount(0);
    await expect(maison(page, 'Mon site')).toHaveCount(0);
    await expect.poll(async () => (await docs()).some((d) => d.id === 'l-a')).toBe(false);
    const message = page.locator('#toasts .toast', { hasText: 'Lien retiré' });
    await expect(message).toBeVisible();
    await capturer(page, info, '3.1-lien-retire');
    await message.locator('[data-action="toast-action"]').click();
    await expect(maison(page, 'Mon site')).toHaveCount(1);
    await expect.poll(async () => (await docs()).find((d) => d.id === 'l-a')?.url).toBe(SITE);
  });

  test('3.5 un nom piégé et une adresse très longue : rien n’est exécuté, tout est affiché en texte, rien ne déborde de l’écran', async ({ page }, info) => {
    const piege = '<img src=x onerror=alert(1)> "q" \'z\'';
    const longue = `https://exemple.test/${'a'.repeat(269)}`;
    expect(longue.length).toBe(290);
    const alertes = [];
    page.on('dialog', (d) => { alertes.push(d.message()); d.dismiss(); });
    await semer({ besoins: [FACTURES] });
    await ouvrirApres(page, (uid) => semerLien(uid, 'l-a', { nom: piege, url: longue }));
    const lien = page.locator('[data-role="village"] [data-sorte="lien"]');
    await expect(lien).toHaveCount(1);
    await expect(lien).toHaveAttribute('href', longue);
    await expect(page.locator('[data-role="etiquette"] [data-role="batiment-nom"]').last()).toHaveText(piege);
    expect(await page.locator('img[src="x"]').count()).toBe(0);
    if (estTelephone(page)) {
      await lien.evaluate((m) => m.scrollIntoView({ block: 'center', inline: 'center' }));
      await lien.click({ position: await positionDans(page, piege) });
    } else await lien.hover({ position: await positionDans(page, piege) });
    await expect(bulle(page).locator('[data-role="bulle-nom"]')).toHaveText(piege);
    await expect(bulle(page).locator('[data-role="bulle-adresse"]')).toHaveText(longue);
    const largeur = page.viewportSize().width;
    const boite = await bulle(page).boundingBox();
    expect(boite.x).toBeGreaterThanOrEqual(0);
    expect(boite.x + boite.width).toBeLessThanOrEqual(largeur);
    expect(await bulle(page).evaluate((b) => b.scrollWidth <= b.clientWidth)).toBe(true);
    await capturer(page, info, '3.5-piege-bulle');
    if (estTelephone(page)) {
      await page.locator('[data-role="vue-liste"]').click();
      const ligne = page.locator('[data-role="liste-maisons"] a[data-sorte="lien"]');
      await expect(ligne).toContainText(piege);
      await expect(ligne).toContainText(longue);
      expect(await ligne.evaluate((a) => a.scrollWidth <= a.clientWidth)).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
      expect(await page.locator('img[src="x"]').count()).toBe(0);
      await capturer(page, info, '3.5-piege-liste');
      await page.locator('[data-role="vue-liste"]').click();
    }
    await page.waitForTimeout(300);
    expect(alertes).toEqual([]);
  });

  test('3.1 six liens au plus : le bouton est grisé et le dit', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    await ouvrirApres(page, async (uid) => {
      const places = [[3, 3], [5, 5], [0, 5], [5, 0], [3, 6], [6, 3]];
      for (let i = 0; i < 6; i++) await semerLien(uid, `l-${i}`, { nom: `Site ${i}`, url: `https://exemple.test/${i}`, c: places[i][0], l: places[i][1] });
    });
    await expect(page.locator('[data-role="village"] [data-sorte="lien"]')).toHaveCount(6);
    await roue(page).click();
    await expect(page.getByRole('button', { name: 'Ajouter un lien externe' })).toBeDisabled();
    await expect(page.locator('[data-role="liens-raison"]')).toHaveText('6 liens au plus.');
    await capturer(page, info, '3.1-six-liens');
  });
});
