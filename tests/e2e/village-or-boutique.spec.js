// Boutique du village, étape 6b de docs/accueil-village.md (27/11/2026) : dépenser ses pièces d'or (décorations, parcelles de terrain).
// La fonction du serveur `villageOr` est SIMULÉE dans le navigateur (aucune fonction ne tourne dans les tests), comme dans village-or.spec.js : la simulation
// répond comme le serveur (coeur/village-or.js, testé à part sur l'émulateur dans tests/village-or.test.js) et écrit dans l'émulateur ce que le serveur écrirait
// (portefeuille, objet acheté). Un test par critère (le nom commence par son numéro) ; captures dans tests/e2e/captures/village-or-boutique/ (non commitées),
// nommées avec le projet. Données d'exemple neutres.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, ecrireDocument, lireDocument, listerDocuments, estTelephone, JEROME, PROJET, FIRESTORE, ECRAN_PARCOURS } from './outils.js';
import { semerFicheEmulateur } from '../_fiche-emulateur.js';

const DOSSIER = fileURLToPath(new URL('./captures/village-or-boutique/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' });
const HOTE = new URL(FIRESTORE).host;
const ACHATS = ['achatsfactures', 'tableauachats', 'achatschantiers', 'achatsfournisseurs', 'achatsarticles'];
const FACTURES = { nom: 'Factures', phrase: 'Valider mes factures fournisseurs', batiment: 'banque', cible: '#/achatsfactures/liste' };
const ACHATS_B = { nom: 'Achats', phrase: 'Payer moins cher mes articles', batiment: 'marche', cible: '#/tableauachats/tableau' };
const semer = (champs) => semerFicheEmulateur({ projet: PROJET, hote: HOTE, document: 'ecran', fiche: { ...ECRAN_PARCOURS, configuration_crm: 'neutre', modules: ACHATS, ...champs } });
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
const or = (page) => page.locator('[data-role="or"]');
const boutonBoutique = (page) => page.locator('[data-role="boutique"]');
const fenetre = (page) => page.getByRole('dialog', { name: 'Boutique' });
const ligne = (page, article, modele = '') => fenetre(page).locator(`li[data-article="${article}"][data-modele="${modele}"]`);
const objets = (page) => page.locator('[data-role="village"] [data-role="objet"]');
const PRIX = { decoration: 20, parcelle: 500 };

/** Simule `villageOr`. `reponse(demande)` rend { result } ou { status } (panne). Rend la liste des demandes reçues. */
async function simulerOr(page, reponse) {
  const demandes = [];
  await page.route(/cloudfunctions\.net\/villageOr$/, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const demande = JSON.parse(route.request().postData() ?? '{}').data;
    demandes.push(demande);
    const r = await reponse(demande);
    if (r.status) return route.fulfill({ status: r.status, headers: CORS, contentType: 'application/json', body: JSON.stringify({ error: { status: 'INTERNAL', message: 'panne' } }) });
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ result: r.result }) });
  });
  return demandes;
}

/**
 * Le serveur des achats, en petit (mêmes réponses que coeur/village-or.js) : `etat` = { uid, or, parcelles, version } ; il écrit le portefeuille et l'objet acheté
 * dans l'émulateur, comme le vrai serveur. Les cases ne sont pas revérifiées ici (le cœur l'est sur l'émulateur, tests 6.6b).
 */
function serveurBoutique(etat) {
  let n = 0;
  return async (d) => {
    const porte = () => ({ or: etat.or, parcelles: etat.parcelles, version: etat.version });
    if (d.action !== 'acheter') return { result: { ok: true, gagne: 0, raison: 'deja' } };
    if (d.article === 'parcelle' && etat.parcelles >= 6) return { result: { ok: true, achete: false, raison: 'maximum', ...porte() } };
    const prix = PRIX[d.article];
    if (etat.or < prix) return { result: { ok: true, achete: false, raison: 'pas_assez', manque: prix - etat.or, ...porte() } };
    etat.or -= prix;
    etat.version += 1;
    if (d.article === 'parcelle') etat.parcelles += 1;
    await ecrireDocument(`village_utilisateurs/${etat.uid}`, { or: etat.or, gagne: 0, parcelles: etat.parcelles, version: etat.version });
    if (d.article === 'parcelle') return { result: { ok: true, achete: true, ...porte() } };
    n += 1;
    const id = `o-essai${n}`;
    const quand = new Date();
    await ecrireDocument(`village_utilisateurs/${etat.uid}/batiments/${id}`, { sorte: 'decoration', modele: d.modele, c: d.c, l: d.l, acheteLe: quand, depuis: quand, modifieLe: quand });
    return { result: { ok: true, achete: true, ...porte(), objet: { id, sorte: 'decoration', modele: d.modele, c: d.c, l: d.l } } };
  };
}

/** Connexion sur Réglages, `avant(uid)` (semer le portefeuille, les maisons, poser une panne), puis l'accueil. */
async function ouvrirVillage(page, avant = async () => {}) {
  await connecter(page, JEROME, { attendreAccueil: false, route: 'reglages' });
  await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible();
  const uid = await page.evaluate(async () => (await import(new URL('js/os/firebase.js', document.baseURI).href)).auth.currentUser.uid);
  await avant(uid);
  await page.evaluate(() => { location.hash = '#/accueil'; });
  await expect(page.locator('[data-role="village"]')).toBeVisible();
  await expect(page.locator('.page-village')).toHaveAttribute('data-petites-lues', 'oui');
  return uid;
}
/** Quitte puis rouvre l'accueil (le village relit tout). */
async function rouvrir(page) {
  await page.evaluate(() => { location.hash = '#/reglages'; });
  await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible();
  await page.evaluate(() => { location.hash = '#/accueil'; });
  await expect(page.locator('[data-role="village"]')).toBeVisible();
  await expect(page.locator('.page-village')).toHaveAttribute('data-petites-lues', 'oui');
}
const porteMonnaie = (uid, or, parcelles = 0, version = 1) => ecrireDocument(`village_utilisateurs/${uid}`, { or, gagne: or, parcelles, version });
const damier = async (page) => Number(await page.locator('[data-role="damier"]').getAttribute('data-colonnes'));

/** Point de l'écran (px) du centre d'un bloc du damier montré, relevé de `dz` unités du dessin. */
async function pointBloc(page, c, l, taille = 1, dz = 0) {
  const cote = await damier(page);
  return page.evaluate(async ([c0, l0, t, z, n]) => {
    const { centreBloc } = await import(new URL('js/os/village-damier.js', document.baseURI).href);
    const { iso } = await import(new URL('js/os/village-batiments.js', document.baseURI).href);
    const svg = document.querySelector('[data-role="village"]');
    const [x, y] = iso(...centreBloc(c0, l0, t, { colonnes: n, lignes: n }), z);
    const p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
    return { x: p.x, y: p.y };
  }, [c, l, taille, dz, cote]);
}
/** Glisser à la souris (ordinateur) ou au doigt (téléphone) d'un point à un autre ; `relacher` faux : le bouton (ou le doigt) reste posé, `lacher` le lève. */
const doigtsEnCours = new WeakMap(); // page → session CDP du doigt encore posé (le toucher vit dans sa session)
async function glisser(page, depart, arrivee, { relacher = true } = {}) {
  if (estTelephone(page)) {
    const cdp = await page.context().newCDPSession(page);
    const point = (p) => [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(depart) });
    for (let i = 1; i <= 10; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point({ x: depart.x + ((arrivee.x - depart.x) * i) / 10, y: depart.y + ((arrivee.y - depart.y) * i) / 10 }) });
      await page.waitForTimeout(16);
    }
    if (!relacher) { doigtsEnCours.set(page, cdp); return; } // le doigt reste posé : la même session le lève (lacher)
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await cdp.detach();
    return;
  }
  await page.mouse.move(depart.x, depart.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(depart.x + ((arrivee.x - depart.x) * i) / 8, depart.y + ((arrivee.y - depart.y) * i) / 8);
  if (relacher) await page.mouse.up();
}
/** Relâche le bouton de la souris, ou lève le doigt (téléphone). */
async function lacher(page) {
  if (!estTelephone(page)) { await page.mouse.up(); return; }
  const cdp = doigtsEnCours.get(page);
  if (!cdp) return;
  doigtsEnCours.delete(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
/** Appui long au doigt (700 ms sans bouger). */
async function appuiLong(page, p) {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }] });
  await page.waitForTimeout(700);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
const caseDe = async (locator) => (await locator.getAttribute('data-case')).split('-').map(Number);
/** Un point de l'écran où l'objet est vraiment touché (aucune étiquette ni maison par-dessus), ou une erreur. */
async function pointSurObjet(locator) {
  await locator.scrollIntoViewIfNeeded();
  await locator.page().waitForTimeout(300); // un défilement doux peut encore courir : les coordonnées seraient fausses
  const p = await locator.evaluate((g) => {
    // les formes du dessus d'abord (le corps de l'objet, pas son ombre), le centre de chaque forme avant ses bords
    const essais = [[3, 3], [2, 3], [4, 3], [3, 2], [3, 4], [2, 2], [4, 4], [2, 4], [4, 2]];
    for (const f of [...g.children].reverse()) {
      if (f.tagName === 'ellipse') continue;
      const r = f.getBoundingClientRect();
      for (const [i, j] of essais) {
        const x = r.left + (r.width * i) / 6;
        const y = r.top + (r.height * j) / 6;
        if (document.elementFromPoint(x, y)?.closest('[data-role="objet"]') === g) return { x, y };
      }
    }
    return null;
  });
  if (!p) throw new Error('objet introuvable sous le pointeur');
  return p;
}
/** Glisse un objet de sa case [c, l] vers la case [c2, l2] : le pointeur le saisit sur son corps et se déplace de l'écart entre les deux cases (le dessin suit le pointeur). */
async function glisserObjet(page, locator, [c, l], [c2, l2], options) {
  const depart = await pointSurObjet(locator);
  const [a, b] = [await pointBloc(page, c, l, 1), await pointBloc(page, c2, l2, 1)];
  await glisser(page, depart, { x: depart.x + b.x - a.x, y: depart.y + b.y - a.y }, options);
}
const seChevauchent = (a, b) => !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
/** Une maison rangée (document `besoin` avec sa place) : la clé suit la cible du besoin (« #/achatsfactures/liste » → b-achatsfactures-liste). */
const maisonRangee = (uid, cle, c, l) => ecrireDocument(`village_utilisateurs/${uid}/batiments/b-${cle}`, { sorte: 'besoin', c, l });
const decoration = (uid, id, modele, c, l) => { const quand = new Date(); return ecrireDocument(`village_utilisateurs/${uid}/batiments/${id}`, { sorte: 'decoration', modele, c, l, acheteLe: quand, depuis: quand, modifieLe: quand }); };
/** Un champ ou un enclos (2 x 2 cases) déjà acheté, avec sa date `depuis`. */
const objetFerme = (uid, id, sorte, c, l) => { const quand = new Date(); return ecrireDocument(`village_utilisateurs/${uid}/batiments/${id}`, { sorte, c, l, acheteLe: quand, depuis: quand, modifieLe: quand }); };

test.describe('accueil village : la boutique (étape 6b)', () => {
  test('6.4 parcelle : 500 pièces, le damier passe à 14 x 14 (12 x 12 au départ depuis le 27/11/2026), une maison rangée garde sa case', async ({ page }, info) => {
    await semer({ besoins: [FACTURES, ACHATS_B] });
    const etat = { or: 600, parcelles: 0, version: 1 };
    const demandes = await simulerOr(page, serveurBoutique(etat));
    etat.uid = await ouvrirVillage(page, async (u) => { await porteMonnaie(u, 600); await maisonRangee(u, 'achatsfactures-liste', 2, 2); await maisonRangee(u, 'tableauachats-tableau', 4, 4); });
    await expect(or(page)).toHaveText('600 pièces d’or');
    await expect(page.locator('[data-role="damier"]')).toHaveAttribute('data-colonnes', '12');
    const factures = page.locator('[data-role="batiment"][data-maison="b-achatsfactures-liste"]');
    await expect(factures).toHaveAttribute('data-case', '2-2');
    await capturer(page, info, '6.4-avant');
    await boutonBoutique(page).click();
    await expect(fenetre(page)).toBeVisible();
    await expect(ligne(page, 'parcelle')).toContainText('Parcelle de terrain');
    await expect(ligne(page, 'parcelle')).toContainText('Ton terrain gagne 2 cases en largeur et en profondeur.');
    await expect(ligne(page, 'parcelle')).toContainText('500 pièces d’or');
    await capturer(page, info, '6.4-boutique');
    await ligne(page, 'parcelle').locator('[data-role="acheter"]').click();
    await expect(fenetre(page)).toHaveCount(0);
    expect(demandes).toEqual([{ action: 'acheter', article: 'parcelle' }]);
    await expect(page.locator('.toast')).toContainText('Ton terrain s’agrandit');
    await expect(page.locator('[data-role="damier"]')).toHaveAttribute('data-colonnes', '14');
    await expect(or(page)).toHaveText('100 pièces d’or');
    await expect(factures).toHaveAttribute('data-case', '2-2');
    await capturer(page, info, '6.4-apres');
    // rechargement : le damier reste à 14 x 14
    await rouvrir(page);
    await expect(page.locator('[data-role="damier"]')).toHaveAttribute('data-colonnes', '14');
  });

  test('6.4b terrain au plus grand : la ligne de la parcelle est grisée, « Ton terrain est au plus grand. », aucune demande', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    const demandes = await simulerOr(page, async () => ({ result: { ok: true, gagne: 0, raison: 'deja' } }));
    await ouvrirVillage(page, (u) => porteMonnaie(u, 5000, 6));
    await expect(page.locator('[data-role="damier"]')).toHaveAttribute('data-colonnes', '24');
    await boutonBoutique(page).click();
    const parcelle = ligne(page, 'parcelle');
    await expect(parcelle.locator('[data-role="acheter"]')).toBeDisabled();
    await expect(parcelle.locator('[data-role="manque"]')).toHaveText('Ton terrain est au plus grand.');
    await expect(parcelle.locator('[data-role="acheter"]')).toHaveAttribute('aria-describedby', await parcelle.locator('[data-role="manque"]').getAttribute('id'));
    await capturer(page, info, '6.4b-terrain-au-plus-grand');
    expect(demandes).toEqual([]);
  });

  test('6.5 pas assez d’or : « Encore 30 pièces. », bouton grisé, aucune demande ; refus du serveur : « Encore 10 pièces. »', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    let reponse = { result: { ok: true, gagne: 0, raison: 'deja' } };
    const demandes = await simulerOr(page, async () => reponse);
    await ouvrirVillage(page, (u) => porteMonnaie(u, 470));
    await expect(or(page)).toHaveText('470 pièces d’or');
    await boutonBoutique(page).click();
    const parcelle = ligne(page, 'parcelle');
    await expect(parcelle.locator('[data-role="acheter"]')).toBeDisabled();
    await expect(parcelle.locator('[data-role="manque"]')).toHaveText('Encore 30 pièces.');
    for (const modele of ['arbre', 'fleurs', 'banc', 'cloture', 'brouette']) await expect(ligne(page, 'decoration', modele).locator('[data-role="acheter"]')).toBeEnabled();
    await parcelle.locator('[data-role="acheter"]').click({ force: true });
    await page.waitForTimeout(300);
    expect(demandes).toEqual([]);
    await capturer(page, info, '6.5-encore-30');
    // course : l'or a été dépensé ailleurs, le serveur refuse
    reponse = { result: { ok: true, achete: false, raison: 'pas_assez', manque: 10, or: 10, parcelles: 0, version: 9 } };
    await ligne(page, 'decoration', 'arbre').locator('[data-role="acheter"]').click();
    await expect(ligne(page, 'decoration', 'arbre').locator('[data-role="manque"]')).toHaveText('Encore 10 pièces.');
    await expect(ligne(page, 'decoration', 'arbre').locator('[data-role="acheter"]')).toBeDisabled();
    await expect(fenetre(page)).toBeVisible();
    await expect(or(page)).toHaveText('10 pièces d’or');
    // toutes les lignes sont revues avec le solde du serveur (10) : les autres décorations grisées, la parcelle « Encore 490 pièces. »
    for (const modele of ['fleurs', 'banc', 'cloture', 'brouette']) {
      await expect(ligne(page, 'decoration', modele).locator('[data-role="acheter"]')).toBeDisabled();
      await expect(ligne(page, 'decoration', modele).locator('[data-role="manque"]')).toHaveText('Encore 10 pièces.');
    }
    await expect(parcelle.locator('[data-role="manque"]')).toHaveText('Encore 490 pièces.');
    expect(demandes.length).toBe(1);
    await capturer(page, info, '6.5-refus-serveur');
  });

  test('6.6 décoration : achetée, posée sur une case libre, glissée, gardée au rechargement ; refusée sur une maison ; un clic ne fait rien', async ({ page }, info) => {
    await semer({ besoins: [FACTURES, ACHATS_B] });
    const etat = { or: 120, parcelles: 0, version: 1 };
    const demandes = await simulerOr(page, serveurBoutique(etat));
    etat.uid = await ouvrirVillage(page, (u) => porteMonnaie(u, 120));
    await expect(page.locator('[data-role="village-phrase"]:visible')).toHaveText('Glisse les maisons pour ranger ton village.');
    await boutonBoutique(page).click();
    await expect(ligne(page, 'decoration', 'arbre')).toContainText('Arbre');
    await expect(ligne(page, 'decoration', 'arbre')).toContainText('20 pièces d’or');
    await ligne(page, 'decoration', 'arbre').locator('[data-role="acheter"]').click();
    await expect(fenetre(page)).toHaveCount(0);
    expect(demandes.length).toBe(1);
    const [d] = demandes;
    expect(d).toMatchObject({ action: 'acheter', article: 'decoration', modele: 'arbre' });
    expect([d.c, d.l]).toEqual([11, 11]); // damier 12 x 12 (27/11/2026, (7, 7) avant) : la case libre la plus devant : l'objet n'est jamais caché derrière une maison
    const arbre = page.locator('[data-role="objet"][data-modele="arbre"]');
    await expect(arbre).toHaveAttribute('data-case', `${d.c}-${d.l}`);
    await expect(arbre).toHaveAttribute('aria-label', 'Arbre');
    await expect(page.locator('.toast')).toContainText('Décoration achetée');
    await expect(or(page)).toHaveText('100 pièces d’or');
    // la case choisie était libre : aucune maison dessus
    const prises = await page.locator('[data-role="village"] [data-role="batiment"]').evaluateAll((els) => els.map((e) => e.dataset.case));
    for (const p of prises) {
      const [c, l] = p.split('-').map(Number);
      expect(d.c >= c && d.c < c + 2 && d.l >= l && d.l < l + 2).toBe(false);
    }
    // un objet acheté ne range pas les maisons : la phrase d'aide reste
    await expect(page.locator('[data-role="village-phrase"]:visible')).toHaveText('Glisse les maisons pour ranger ton village.');
    await capturer(page, info, '6.6-decoration-posee');
    // un clic sur l'objet : rien (ni navigation, ni bulle)
    const surObjet = await pointSurObjet(arbre);
    if (estTelephone(page)) await page.touchscreen.tap(surObjet.x, surObjet.y); else await page.mouse.click(surObjet.x, surObjet.y);
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => location.hash)).toBe('#/accueil');
    await expect(page.locator('[data-role="bulle"]')).toBeHidden();
    // double clic (ordinateur) ou appui long (téléphone) sur l'objet : aucune fenêtre ne s'ouvre
    if (estTelephone(page)) await appuiLong(page, await pointSurObjet(arbre)); else await page.mouse.dblclick(surObjet.x, surObjet.y);
    await page.waitForTimeout(800);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => location.hash)).toBe('#/accueil');
    // glisser sur une maison : repère rouge, il revient
    const [mc, ml] = await caseDe(page.locator('[data-role="batiment"]').first());
    await glisserObjet(page, arbre, [d.c, d.l], [mc, ml], { relacher: false });
    await expect(page.locator('[data-role="cible-rangement"]')).toHaveAttribute('data-libre', 'non');
    await capturer(page, info, '6.6-sur-une-maison');
    await lacher(page);
    await expect(arbre).toHaveAttribute('data-case', `${d.c}-${d.l}`);
    // glisser sur une case libre (le bord du devant ; (4, 7) avant le damier 12 x 12, prise aujourd'hui par Achats en 3-7)
    await page.waitForTimeout(600); // le retour de l'objet (animation) se termine
    const cible = { c: 6, l: 11 };
    await glisserObjet(page, arbre, [d.c, d.l], [cible.c, cible.l]);
    await expect(arbre).toHaveAttribute('data-case', '6-11');
    await expect.poll(async () => { const o = await lireDocument(`village_utilisateurs/${etat.uid}/batiments/o-essai1`); return o && `${o.c}-${o.l}-${o.modele}-${o.acheteLe instanceof Date}`; }).toBe('6-11-arbre-true');
    await capturer(page, info, '6.6-glisse');
    await rouvrir(page);
    await expect(page.locator('[data-role="objet"][data-modele="arbre"]')).toHaveAttribute('data-case', '6-11');
  });

  test('6.6e refus définitifs du serveur : « Ton terrain est au plus grand. » ; lecture seule : « Ton accès est en lecture seule : tu ne peux pas acheter. » (sans « Réessaie »)', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    let reponse = { result: { ok: true, achete: false, raison: 'maximum', or: 900, parcelles: 6, version: 5 } };
    const demandes = await simulerOr(page, async (d) => (d.action === 'acheter' ? reponse : { result: { ok: true, gagne: 0, raison: 'deja' } }));
    await ouvrirVillage(page, (u) => porteMonnaie(u, 900, 5));
    await boutonBoutique(page).click();
    await ligne(page, 'parcelle').locator('[data-role="acheter"]').click();
    const message = fenetre(page).locator('[data-role="boutique-message"]');
    await expect(message).toHaveText('Ton terrain est au plus grand.');
    await expect(fenetre(page)).toBeVisible();
    await expect(ligne(page, 'parcelle').locator('[data-role="manque"]')).toHaveText('Ton terrain est au plus grand.'); // les 6 parcelles du serveur (le maximum depuis le 27/11/2026) grisent la ligne
    reponse = { result: { ok: true, achete: false, raison: 'lecture_seule' } };
    await ligne(page, 'decoration', 'banc').locator('[data-role="acheter"]').click();
    await expect(message).toHaveText('Ton accès est en lecture seule : tu ne peux pas acheter.');
    await expect(message).not.toContainText('Réessaie');
    expect(demandes.filter((d) => d.action === 'acheter').length).toBe(2);
    await capturer(page, info, '6.6e-lecture-seule');
  });

  test('6.4c le portefeuille arrive après le rangement : le damier grandit, aucun document n’est réécrit', async ({ page }, info) => {
    await semer({ besoins: [FACTURES, ACHATS_B] });
    await simulerOr(page, async () => ({ result: { ok: true, gagne: 0, raison: 'deja' } }));
    const uid = await ouvrirVillage(page, async (u) => {
      await porteMonnaie(u, 50, 2);
      await maisonRangee(u, 'achatsfactures-liste', 2, 2);
      await decoration(u, 'o-tot', 'banc', 7, 7);
      await page.evaluate(() => { window.__chevalierTest.pannesOr = { lenteur: 2500 }; });
    });
    const avant = await listerDocuments(`village_utilisateurs/${uid}/batiments`);
    await expect(page.locator('[data-role="damier"]')).toHaveAttribute('data-colonnes', '12'); // damier 12 x 12 au départ (27/11/2026) ; le rangement est fait avant le portefeuille
    await expect(or(page)).toHaveText('50 pièces d’or', { timeout: 10000 });
    await expect(page.locator('[data-role="damier"]')).toHaveAttribute('data-colonnes', '16');
    await expect(page.locator('[data-role="batiment"][data-maison="b-achatsfactures-liste"]')).toHaveAttribute('data-case', '2-2');
    await expect(page.locator('[data-role="objet"][data-maison="o-tot"]')).toHaveAttribute('data-case', '7-7');
    await page.waitForTimeout(800);
    expect(await listerDocuments(`village_utilisateurs/${uid}/batiments`)).toEqual(avant);
    await capturer(page, info, '6.4c-portefeuille-en-retard');
  });

  test('6.6b double clic sur « Acheter » : une seule demande', async ({ page }) => {
    await semer({ besoins: [FACTURES] });
    const etat = { or: 120, parcelles: 0, version: 1 };
    const serveur = serveurBoutique(etat);
    const demandes = await simulerOr(page, async (d) => { await new Promise((fin) => { setTimeout(fin, 400); }); return serveur(d); });
    etat.uid = await ouvrirVillage(page, (u) => porteMonnaie(u, 120));
    await boutonBoutique(page).click();
    await ligne(page, 'decoration', 'banc').locator('[data-role="acheter"]').dblclick();
    await expect(fenetre(page)).toHaveCount(0);
    await page.waitForTimeout(300);
    expect(demandes.length).toBe(1);
    await expect(objets(page)).toHaveCount(1);
    await expect(or(page)).toHaveText('100 pièces d’or');
  });

  test('6.6c pannes : achat en panne (la fenêtre reste) ; solde illisible (pas de Boutique) ; déplacement d’un objet en panne (il revient)', async ({ page }, info) => {
    info.annotations.push({ type: 'erreurs-reseau-attendues', description: 'la panne simulée de villageOr (500) est notée par le navigateur' });
    await semer({ besoins: [FACTURES] });
    const demandes = await simulerOr(page, async () => ({ status: 500 }));
    // solde illisible au premier accueil (rien de connu) : pas de compteur, pas de bouton Boutique
    const uid = await ouvrirVillage(page, async (u) => { await porteMonnaie(u, 120); await decoration(u, 'o-deja', 'banc', 7, 7); await page.evaluate(() => { window.__chevalierTest.pannesOr = { lecture: 1 }; }); });
    await expect(page.locator('[data-role="batiment"]').first()).toBeVisible();
    await expect(or(page)).toHaveCount(0);
    await expect(boutonBoutique(page)).toHaveCount(0);
    await capturer(page, info, '6.6c-solde-illisible');
    await rouvrir(page);
    await expect(or(page)).toHaveText('120 pièces d’or');
    await boutonBoutique(page).click();
    await ligne(page, 'decoration', 'fleurs').locator('[data-role="acheter"]').click();
    await expect(fenetre(page).locator('[data-role="boutique-message"]')).toHaveText('L’achat n’a pas abouti. Réessaie.');
    await expect(fenetre(page)).toBeVisible();
    await expect(ligne(page, 'decoration', 'fleurs').locator('[data-role="acheter"]')).toBeEnabled();
    expect(demandes.length).toBe(1);
    await capturer(page, info, '6.6c-achat-en-panne');
    await fenetre(page).getByRole('button', { name: 'Fermer' }).last().click();
    await expect(or(page)).toHaveText('120 pièces d’or');
    await expect(objets(page)).toHaveCount(1);
    // déplacement d'un objet en panne : il revient, avec le message habituel
    const banc = page.locator('[data-role="objet"][data-maison="o-deja"]');
    await expect(banc).toHaveAttribute('data-case', '7-7');
    await page.evaluate(() => { window.__chevalierTest.pannesVillage = { ecriture: 1 }; });
    await glisserObjet(page, banc, [7, 7], [5, 7]);
    await expect(page.locator('.toast')).toContainText('Le déplacement n’a pas été enregistré. Réessaie.');
    await expect(banc).toHaveAttribute('data-case', '7-7');
    expect((await lireDocument(`village_utilisateurs/${uid}/batiments/o-deja`)).c).toBe(7);
  });

  test('6.6d village plein : décorations grisées, « Ton village est plein : achète une parcelle. »', async ({ page }, info) => {
    // Damier 12 x 12 depuis le 27/11/2026 : 7 maisons (28 cases) + 29 champs ou enclos 2 x 2 (116 cases) = les 144 cases (36 blocs 2 x 2).
    // 29 objets, moins que les 40 permis : c'est bien le manque de place qui bloque (avant : 7 maisons + 36 décorations sur le 8 x 8).
    const besoins = Array.from({ length: 7 }, (_, i) => ({ ...FACTURES, nom: `Factures ${i + 1}` }));
    await semer({ besoins });
    const demandes = await simulerOr(page, async () => ({ result: { ok: true, gagne: 0, raison: 'deja' } }));
    const blocs = [];
    for (let l = 0; l < 12; l += 2) for (let c = 0; c < 12; c += 2) blocs.push([c, l]);
    await ouvrirVillage(page, async (u) => {
      await porteMonnaie(u, 300);
      for (let i = 0; i < 7; i++) await maisonRangee(u, i ? `achatsfactures-liste-${i + 1}` : 'achatsfactures-liste', ...blocs[i]);
      for (let i = 7; i < blocs.length; i++) await objetFerme(u, `o-plein${i}`, i % 2 ? 'champ' : 'enclos', ...blocs[i]);
    });
    await expect(objets(page)).toHaveCount(29);
    await boutonBoutique(page).click();
    for (const modele of ['arbre', 'fleurs', 'banc', 'cloture', 'brouette']) {
      await expect(ligne(page, 'decoration', modele).locator('[data-role="acheter"]')).toBeDisabled();
      await expect(ligne(page, 'decoration', modele).locator('[data-role="manque"]')).toHaveText('Ton village est plein : achète une parcelle.');
    }
    await expect(ligne(page, 'parcelle').locator('[data-role="manque"]')).toHaveText('Encore 200 pièces.');
    await capturer(page, info, '6.6d-village-plein');
    expect(demandes).toEqual([]);
  });

  test('6.8 boutique : ni « CRM », ni classement, série ou notification ; aucun son', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    await simulerOr(page, async () => ({ result: { ok: true, gagne: 0, raison: 'deja' } }));
    await ouvrirVillage(page, (u) => porteMonnaie(u, 120));
    await boutonBoutique(page).click();
    await expect(fenetre(page)).toBeVisible();
    for (const texte of [await fenetre(page).innerText(), await page.locator('.page-village').innerText()]) {
      expect(texte).not.toMatch(/\bCRM\b/);
      expect(texte).not.toMatch(/classement|série|notification/i);
    }
    expect(await page.evaluate(() => document.querySelectorAll('audio').length)).toBe(0);
    expect(await page.evaluate(() => [...document.querySelectorAll('[role="dialog"] [title], [data-role="or-barre"] [title]')].length)).toBe(0);
    await capturer(page, info, '6.8-boutique');
  });

  test('téléphone : la barre d’or et la Boutique ne couvrent ni la roue, ni la Mairie, ni « Liste », ni la phrase ; bouton de 44 px ; un objet se glisse au doigt', async ({ page }, info) => {
    test.skip(!estTelephone(page), 'parcours propre au téléphone');
    await semer({ besoins: [FACTURES, ACHATS_B] });
    const uid = await ouvrirVillage(page, async (u) => { await porteMonnaie(u, 120); await decoration(u, 'o-doigt', 'brouette', 7, 0); });
    await expect(boutonBoutique(page)).toBeVisible();
    const barre = await page.locator('[data-role="or-barre"]').boundingBox();
    const bouton = await boutonBoutique(page).boundingBox();
    expect(bouton.height).toBeGreaterThanOrEqual(44);
    const autres = [page.getByRole('button', { name: 'Réglages de l’accueil' }), page.locator('[data-batiment-fixe="mairie-reglages"]'), page.locator('.village-bouton-vue'), page.locator('[data-role="village-phrase"]:visible')];
    for (const autre of autres) {
      if (await autre.count()) expect(seChevauchent(barre, await autre.first().boundingBox())).toBe(false);
    }
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
    await capturer(page, info, 'telephone-barre-or');
    const brouette = page.locator('[data-role="objet"][data-maison="o-doigt"]');
    await brouette.scrollIntoViewIfNeeded();
    await glisserObjet(page, brouette, [7, 0], [6, 1]);
    await expect(brouette).toHaveAttribute('data-case', '6-1');
    await expect.poll(async () => (await lireDocument(`village_utilisateurs/${uid}/batiments/o-doigt`))?.c).toBe(6);
  });

  test('recette 24 x 24 : 6 parcelles (le maximum depuis le 27/11/2026) et 5 décorations (capture pour Jérôme)', async ({ page }, info) => {
    await semer({ besoins: [FACTURES, ACHATS_B] });
    await ouvrirVillage(page, async (u) => {
      await porteMonnaie(u, 240, 6);
      for (const [i, modele] of ['arbre', 'fleurs', 'banc', 'cloture', 'brouette'].entries()) await decoration(u, `o-recette${i}`, modele, 10 + 2 * i, 12);
    });
    await expect(page.locator('[data-role="damier"]')).toHaveAttribute('data-colonnes', '24');
    await expect(objets(page)).toHaveCount(5);
    await capturer(page, info, 'recette-24x24');
  });
});
