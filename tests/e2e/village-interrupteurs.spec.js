// Interrupteurs « Mon accueil » par personne (27/11/2026, docs/accueil-village.md « Interrupteurs par personne ») : « Accueil en village » et « Pièces d'or et boutique »,
// rangés dans village_utilisateurs/{uid}/preferences/accueil (js/os/village-preferences.js), réglés dans Réglages > Mon espace (carte « Mon accueil », js/os/reglages.js).
// L'or se compte toujours (js/os/village-or.js), en silence quand le jeu est éteint ou l'accueil classique. Ces parcours lisent le VRAI document (jamais le crochet de test
// preferencesAccueil, réservé aux parcours de l'or). La fonction `villageOr` est simulée dans le navigateur (aucune fonction ne tourne dans les tests).
// Un test par critère (le nom commence par son numéro), captures dans tests/e2e/captures/village-interrupteurs/ (non commitées), nommées avec le projet. Données neutres.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, ecrireDocument, lireDocument, estTelephone, poserCrochetsDeTest, CHARLES, PROJET, FIRESTORE, ECRAN_PARCOURS } from './outils.js';
import { semerFicheEmulateur } from '../_fiche-emulateur.js';

const DOSSIER = fileURLToPath(new URL('./captures/village-interrupteurs/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' });
const HOTE = new URL(FIRESTORE).host;
const ACHATS = ['achatsfactures', 'tableauachats', 'achatschantiers', 'achatsfournisseurs', 'achatsarticles'];
const FACTURES = { nom: 'Factures', phrase: 'Valider mes factures fournisseurs', batiment: 'banque', cible: '#/achatsfactures/liste' };
const ACHATS_B = { nom: 'Achats', phrase: 'Payer moins cher mes articles', batiment: 'marche', cible: '#/tableauachats/tableau' };
// Maison sans configuration neutre (comme celle de Jérôme : jeu allumé par défaut) ; `neutre: true` = maison d'un client (jeu éteint par défaut).
const semer = ({ neutre = false, ...champs } = {}) => semerFicheEmulateur({ projet: PROJET, hote: HOTE, document: 'ecran', fiche: { ...ECRAN_PARCOURS, ...(neutre ? { configuration_crm: 'neutre' } : {}), modules: ACHATS, ...champs } });
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
const or = (page) => page.locator('[data-role="or"]');
const fete = (page) => page.locator('[data-role="fete-or"]');
const village = (page) => page.locator('[data-role="village"]');
const carte = (page) => page.locator('#reglages-accueil');
const interVillage = (page) => page.locator('[data-role="interrupteur-village"]');
const interJeu = (page) => page.locator('[data-role="interrupteur-jeu"]');
const prefsDe = (uid) => `village_utilisateurs/${uid}/preferences/accueil`;
const uidDe = (page) => page.evaluate(async () => (await import(new URL('js/os/firebase.js', document.baseURI).href)).auth.currentUser.uid);

/** Simule `villageOr` : chaque gain crédite `total` dans le portefeuille (comme le ferait le serveur). Rend la liste des demandes reçues. */
async function simulerOr(page, total, uid) {
  const demandes = [];
  await page.route(/cloudfunctions\.net\/villageOr$/, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const demande = JSON.parse(route.request().postData() ?? '{}').data;
    demandes.push(demande);
    await ecrireDocument(`village_utilisateurs/${uid()}`, { or: total, gagne: total, parcelles: 0, version: demandes.length + 1 });
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ result: { ok: true, gagne: 10, or: total, version: demandes.length + 1 } }) });
  });
  return demandes;
}

/**
 * Connexion sur Réglages (aucune préférence lue encore pour ce compte), `avant(uid)` (écrire les préférences, le portefeuille, un objet), puis la page est RECHARGÉE
 * sur `route` : la session relit les interrupteurs, comme à une vraie ouverture.
 */
async function ouvrir(page, route, avant = async () => {}) {
  await connecter(page, CHARLES, { attendreAccueil: false, route: 'reglages' });
  await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible();
  const uid = await uidDe(page);
  await avant(uid);
  await page.evaluate((r) => { location.hash = `#/${r}`; }, route);
  await page.reload();
  await expect(page.locator('.coquille')).toBeVisible();
  return uid;
}
const annoncer = (page, source, detail) => page.evaluate(async ([s, d]) => { (await import(new URL('js/os/bonnes-nouvelles.js', document.baseURI).href)).annoncer(s, d); }, [source, detail]);

/** Point de l'écran (px) du centre d'un bloc du damier, relevé de `dz` unités du dessin (même calcul que maison-village-damier.spec.js). */
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
const maison = (page, nom) => page.locator(`[data-role="village"] [data-role="batiment"][aria-label^="${nom} :"], [data-role="village"] [data-role="batiment"][aria-label="${nom}"]`);
async function pointMaison(page, nom) {
  const [c, l] = (await maison(page, nom).getAttribute('data-case')).split('-').map(Number);
  return pointBloc(page, c, l, 2, 24);
}
/** Glisse une maison vers le bloc (c, l) : à la souris sur ordinateur, au doigt (vrais événements tactiles) sur téléphone. */
async function glisser(page, nom, c, l) {
  const depart = await pointMaison(page, nom);
  const arrivee = await pointBloc(page, c, l, 2, 24);
  if (!estTelephone(page)) {
    await page.mouse.move(depart.x, depart.y);
    await page.mouse.down();
    for (let i = 1; i <= 8; i++) await page.mouse.move(depart.x + ((arrivee.x - depart.x) * i) / 8, depart.y + ((arrivee.y - depart.y) * i) / 8);
    await page.mouse.up();
    return;
  }
  const cdp = await page.context().newCDPSession(page);
  const point = (p) => [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(depart) });
  for (let i = 1; i <= 10; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point({ x: depart.x + ((arrivee.x - depart.x) * i) / 10, y: depart.y + ((arrivee.y - depart.y) * i) / 10 }) });
    await page.waitForTimeout(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}

test.describe('Mon accueil : interrupteurs par personne', () => {
  test('I3 jeu éteint : le village s’affiche sans compteur d’or, sans « Boutique », sans objet acheté ; une maison se glisse toujours', async ({ page }, info) => {
    await semer({ besoins: [FACTURES, ACHATS_B] });
    await ouvrir(page, 'accueil', async (uid) => {
      await ecrireDocument(prefsDe(uid), { jeu: false, accueil: 'village', modifieLe: new Date() });
      await ecrireDocument(`village_utilisateurs/${uid}`, { or: 500, gagne: 500, parcelles: 0, version: 1 });
      const quand = new Date();
      await ecrireDocument(`village_utilisateurs/${uid}/batiments/o-deco1`, { sorte: 'decoration', modele: 'arbre', c: 10, l: 10, acheteLe: quand, depuis: quand, modifieLe: quand });
    });
    await expect(village(page)).toBeVisible();
    await expect(maison(page, 'Factures')).toBeVisible();
    await expect(or(page)).toHaveCount(0);
    await expect(page.locator('[data-role="boutique"]')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Boutique' })).toHaveCount(0);
    await expect(page.locator('[data-role="objet"]')).toHaveCount(0);
    await expect(page.locator('.page-village')).not.toHaveAttribute('data-or', 'oui');
    await capturer(page, info, 'I3-jeu-eteint');
    // une maison se glisse vers une case vraiment libre (les cases de l'objet caché restent prises)
    await glisser(page, 'Factures', 5, 5);
    await expect(maison(page, 'Factures')).toHaveAttribute('data-case', '5-5');
    await expect(page.locator('[data-role="objet"]')).toHaveCount(0);
    // lâchée sur la case de l'objet caché (bloc 9-9 : il couvre 10-10) : refusée, avec le message qui dit pourquoi
    await glisser(page, 'Factures', 9, 9);
    await expect(page.getByText('Cette place est occupée par un objet caché (pièces d’or éteintes).')).toBeVisible();
    await expect(maison(page, 'Factures')).toHaveAttribute('data-case', '5-5');
  });

  test('I4 accueil classique : l’adresse vide, l’adresse du village et le logo mènent à l’écran classique ; pas de « Retour au village » dans les Réglages', async ({ page }, info) => {
    await semer({ besoins: [FACTURES, ACHATS_B] });
    await ouvrir(page, '', (uid) => ecrireDocument(prefsDe(uid), { jeu: true, accueil: 'classique', modifieLe: new Date() }));
    // on attend un état positif : l'écran d'un module (jamais l'adresse vide ni celle du village)
    await expect.poll(() => new URL(page.url()).hash).toMatch(/^#\/[a-z]+\/[a-z]/);
    const classique = new URL(page.url()).hash;
    await expect(village(page)).toHaveCount(0);
    await expect(page.locator('[data-role="page-introuvable"]')).toHaveCount(0);
    await capturer(page, info, 'I4-accueil-classique');
    // l'adresse du village (favori, retour arrière) : le premier écran classique, jamais « Page introuvable »
    await page.evaluate(() => { location.hash = '#/accueil'; });
    await expect.poll(() => new URL(page.url()).hash).toBe(classique);
    await expect(village(page)).toHaveCount(0);
    await expect(page.locator('[data-role="page-introuvable"]')).toHaveCount(0);
    // le logo (barre du haut) mène au même écran
    await page.evaluate(() => { location.hash = '#/reglages'; });
    await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible();
    // le logo de la barre du haut (visible sur téléphone ; sur ordinateur la barre est cachée : clic par le DOM sur le même lien)
    if (estTelephone(page)) await page.locator('.barre-haut-marque').click();
    else await page.locator('.barre-haut-marque').evaluate((a) => a.click());
    await expect.poll(() => new URL(page.url()).hash).toBe(classique);
    await expect(village(page)).toHaveCount(0);
    // retour arrière : les Réglages, puis encore arrière : jamais le village ni « Page introuvable »
    await page.goBack();
    await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible();
    await page.goBack();
    await expect(village(page)).toHaveCount(0);
    await expect(page.locator('[data-role="page-introuvable"]')).toHaveCount(0);
    await page.goForward();
    // Réglages : pas de « Retour au village »
    await page.evaluate(() => { location.hash = '#/reglages'; });
    await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible();
    await expect(page.locator('[data-action="retour-village"]')).toHaveCount(0);
  });

  for (const cas of [{ nom: 'accueil classique', prefs: { jeu: true, accueil: 'classique' }, route: 'reglages' }, { nom: 'jeu éteint', prefs: { jeu: false, accueil: 'village' }, route: 'accueil' }]) {
    test(`I5 or en silence (${cas.nom}) : une bonne nouvelle envoie UNE demande de gain, aucune fête ; jeu rallumé, le compteur montre l’or gagné`, async ({ page }, info) => {
      await semer({ besoins: [FACTURES] });
      let uid = '';
      const demandes = await simulerOr(page, 130, () => uid);
      uid = await ouvrir(page, cas.route, async (u) => {
        await ecrireDocument(prefsDe(u), { ...cas.prefs, modifieLe: new Date() });
        await ecrireDocument(`village_utilisateurs/${u}`, { or: 120, gagne: 120, parcelles: 0, version: 1 });
      });
      if (cas.route === 'accueil') await expect(village(page)).toBeVisible();
      else await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible();
      await annoncer(page, 'facture-validee', { id: 'a1' });
      await expect.poll(() => demandes.length).toBe(1);
      expect(demandes).toEqual([{ action: 'gain', source: 'facture-validee', id: 'a1' }]);
      await page.waitForTimeout(400);
      await expect(fete(page)).toHaveCount(0);
      await expect(or(page)).toHaveCount(0);
      await capturer(page, info, `I5-silence-${cas.prefs.accueil}-${cas.prefs.jeu ? 'jeu' : 'sans-jeu'}`);
      // on rallume le jeu (accueil village) : le compteur montre l'or gagné en silence
      await ecrireDocument(prefsDe(uid), { jeu: true, accueil: 'village', modifieLe: new Date() });
      await page.reload(); // en accueil classique, l'adresse du village redirige : on recharge d'abord, puis on va au village
      await expect(page.locator('.coquille')).toBeVisible();
      await page.evaluate(() => { location.hash = '#/accueil'; });
      await expect(village(page)).toBeVisible();
      await expect(or(page)).toHaveText('130 pièces d’or');
      await capturer(page, info, `I5-rallume-${cas.prefs.accueil}`);
      expect(demandes).toHaveLength(1);
    });
  }

  test('I6 Réglages > Mon espace > Mon accueil : les deux interrupteurs changent, l’écriture part, la page se recharge dans le bon mode ; écriture refusée : message et interrupteur revenu', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    const uid = await ouvrir(page, 'reglages/espace');
    await expect(carte(page)).toBeVisible();
    await expect(carte(page).getByRole('heading', { name: 'Mon accueil' })).toBeVisible();
    await expect(page.locator('[data-role="village-absent"]')).toHaveCount(0);
    await expect(interVillage(page)).toHaveAttribute('aria-checked', 'true');
    await expect(interJeu(page)).toHaveAttribute('aria-checked', 'true'); // maison comme celle de Jérôme : jeu allumé par défaut
    await expect(interVillage(page)).toBeEnabled();
    await carte(page).scrollIntoViewIfNeeded();
    await capturer(page, info, 'I6-carte-mon-accueil');
    await expect(page.locator('[data-action="retour-village"]')).toHaveCount(1);
    // « Accueil en village » éteint : écriture, rechargement, accueil classique
    await Promise.all([page.waitForEvent('load'), interVillage(page).click()]);
    await expect(page.locator('.coquille')).toBeVisible();
    await expect(carte(page)).toBeVisible();
    await expect(interVillage(page)).toHaveAttribute('aria-checked', 'false');
    await expect(page.locator('[data-action="retour-village"]')).toHaveCount(0);
    await expect(page.locator('[data-role="jeu-sans-effet"]')).toHaveText('Sans effet tant que l’accueil est le menu classique.');
    const lu = await lireDocument(prefsDe(uid));
    expect([lu.jeu, lu.accueil]).toEqual([true, 'classique']);
    // « Pièces d'or et boutique » éteint : écriture, rechargement
    await Promise.all([page.waitForEvent('load'), interJeu(page).click()]);
    await expect(carte(page)).toBeVisible();
    await expect(interJeu(page)).toHaveAttribute('aria-checked', 'false');
    const lu2 = await lireDocument(prefsDe(uid));
    expect([lu2.jeu, lu2.accueil]).toEqual([false, 'classique']);
    // écriture refusée (panne simulée) : message, l'interrupteur revient, pas de rechargement
    await page.evaluate(() => { window.__chevalierTest.pannesPreferences = { ecriture: 1 }; window.__pasRecharge = true; });
    await interJeu(page).click();
    await expect(page.getByText('Le réglage n’a pas été enregistré. Réessaie.')).toBeVisible();
    await expect(interJeu(page)).toHaveAttribute('aria-checked', 'false');
    await expect(interJeu(page)).toBeEnabled();
    await expect(interJeu(page)).toBeFocused(); // le focus revient sur l'interrupteur touché
    expect(await page.evaluate(() => window.__pasRecharge)).toBe(true);
    await capturer(page, info, 'I6-erreur-ecriture');
  });

  test('I7 maison d’un client (configuration neutre) : jeu éteint par défaut, pas de compteur ; la carte le montre', async ({ page }, info) => {
    await semer({ neutre: true, besoins: [FACTURES] });
    await ouvrir(page, 'accueil', (uid) => ecrireDocument(`village_utilisateurs/${uid}`, { or: 300, gagne: 300, parcelles: 0, version: 1 }));
    await expect(village(page)).toBeVisible();
    await expect(maison(page, 'Factures')).toBeVisible();
    await expect(or(page)).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Boutique' })).toHaveCount(0);
    await capturer(page, info, 'I7-maison-client-sans-jeu');
    await page.evaluate(() => { location.hash = '#/reglages/espace'; });
    await expect(carte(page)).toBeVisible();
    await expect(interVillage(page)).toHaveAttribute('aria-checked', 'true');
    await expect(interJeu(page)).toHaveAttribute('aria-checked', 'false');
  });

  test('I8 lecture en panne à l’ouverture : le dernier réglage mémorisé sur l’appareil s’applique ; un clic relit le document et ne change que l’interrupteur touché', async ({ page }) => {
    await semer({ besoins: [FACTURES] });
    // 1. une ouverture normale mémorise « classique, jeu éteint » sur l'appareil
    const uid = await ouvrir(page, 'reglages/espace', (u) => ecrireDocument(prefsDe(u), { jeu: false, accueil: 'classique', modifieLe: new Date() }));
    await expect(interVillage(page)).toHaveAttribute('aria-checked', 'false');
    // 2. ailleurs, le jeu a été rallumé ; ici, la prochaine lecture à l'ouverture tombe en panne
    await ecrireDocument(prefsDe(uid), { jeu: true, accueil: 'classique', modifieLe: new Date() });
    await poserCrochetsDeTest(page, { pannesPreferences: { lecture: 1 } });
    await page.reload();
    await expect(carte(page)).toBeVisible();
    await expect(interVillage(page)).toHaveAttribute('aria-checked', 'false'); // le mémorisé (classique), jamais le village par défaut
    await expect(interJeu(page)).toHaveAttribute('aria-checked', 'false'); // le mémorisé
    // 3. on rallume le village : le document est relu (jeu allumé) et seul l'accueil change
    await Promise.all([page.waitForEvent('load'), interVillage(page).click()]);
    await expect.poll(async () => { const d = await lireDocument(prefsDe(uid)); return d && [d.jeu, d.accueil]; }).toEqual([true, 'village']);
  });

  test('I-bis maison sans village : la carte « Mon accueil » s’affiche, interrupteurs désactivés, avec « Le village n’est pas activé pour cet espace. »', async ({ page }) => {
    await semer({});
    await ouvrir(page, 'reglages/espace');
    await expect(carte(page)).toBeVisible();
    await expect(page.locator('[data-role="village-absent"]')).toHaveText('Le village n’est pas activé pour cet espace.');
    await expect(interVillage(page)).toBeDisabled();
    await expect(interJeu(page)).toBeDisabled();
  });
});
