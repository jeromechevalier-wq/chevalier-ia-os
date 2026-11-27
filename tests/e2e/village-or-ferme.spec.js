// Champs et enclos à cochons, étape 7 de docs/accueil-village.md (27/11/2026) : acheter, poser, déplacer, récolter de l'or.
// La fonction du serveur `villageOr` est SIMULÉE dans le navigateur (aucune fonction ne tourne dans les tests), comme dans village-or-boutique.spec.js :
// la simulation décide avec LA MÊME règle pure que le serveur (js/os/village-jeu-regles.js, etatRecolte) et écrit dans l'émulateur ce que le serveur écrirait
// (portefeuille, objet acheté, nouveau `depuis`). Le cœur lui-même est testé sur l'émulateur dans tests/village-or.test.js (7.1a à 7.8b).
// Un test par critère (le nom commence par son numéro) ; captures dans tests/e2e/captures/village-or-ferme/ (non commitées), nommées avec le projet. Données d'exemple neutres.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, ecrireDocument, lireDocument, estTelephone, JEROME, PROJET, FIRESTORE, ECRAN_PARCOURS } from './outils.js';
import { semerFicheEmulateur } from '../_fiche-emulateur.js';
import { readFileSync } from 'node:fs';

// La MÊME règle pure que l'écran et le serveur : js/ n'est pas déclaré « module » pour Node (l'import direct échoue sous Playwright, M6 du brief) ;
// le fichier n'a aucun import, il est donc chargé tel quel depuis son texte (aucune copie des constantes).
const SOURCE_REGLES = readFileSync(new URL('../../js/os/village-jeu-regles.js', import.meta.url), 'utf8');
const { etatRecolte, departApresRecolte, PRIX } = await import(`data:text/javascript;charset=utf-8,${encodeURIComponent(SOURCE_REGLES)}`);

const DOSSIER = fileURLToPath(new URL('./captures/village-or-ferme/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' });
const HOTE = new URL(FIRESTORE).host;
const ACHATS = ['achatsfactures', 'tableauachats', 'achatschantiers', 'achatsfournisseurs', 'achatsarticles'];
const FACTURES = { nom: 'Factures', phrase: 'Valider mes factures fournisseurs', batiment: 'banque', cible: '#/achatsfactures/liste' };
const ACHATS_B = { nom: 'Achats', phrase: 'Payer moins cher mes articles', batiment: 'marche', cible: '#/tableauachats/tableau' };
const semer = (champs) => semerFicheEmulateur({ projet: PROJET, hote: HOTE, document: 'ecran', fiche: { ...ECRAN_PARCOURS, configuration_crm: 'neutre', modules: ACHATS, ...champs } });
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
const HEURE = 3600 * 1000;
const JOUR = 24 * HEURE;
const or = (page) => page.locator('[data-role="or"]');
const fete = (page) => page.locator('[data-role="fete-or"]');
const boutonBoutique = (page) => page.locator('[data-role="boutique"]');
const fenetre = (page) => page.getByRole('dialog', { name: 'Boutique' });
const ligne = (page, article, modele = '') => fenetre(page).locator(`li[data-article="${article}"][data-modele="${modele}"]`);
const objet = (page, id) => page.locator(`[data-role="village"] [data-role="objet"][data-maison="${id}"]`);
const ramassages = (demandes) => demandes.filter((d) => d.action === 'ramasser');

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
 * Le serveur de la ferme, en petit (mêmes réponses que coeur/village-or.js) : `etat` = { uid, or, gagne, parcelles, version, objets: Map(id → { sorte, c, l, depuisMs }) }.
 * `acheter` (champ, enclos, décoration, parcelle) et `ramasser` (règle pure etatRecolte, à l'heure de ce serveur) ; il écrit le portefeuille et l'objet dans l'émulateur.
 * `etat.lent` : millisecondes d'attente avant de répondre ; `etat.reponseRamasser` : une réponse imposée (une fois).
 */
function serveurFerme(etat) {
  let n = 0;
  const porte = () => ({ or: etat.or, parcelles: etat.parcelles, version: etat.version });
  const ecrirePorte = () => ecrireDocument(`village_utilisateurs/${etat.uid}`, { or: etat.or, gagne: etat.gagne, parcelles: etat.parcelles, version: etat.version });
  return async (d) => {
    if (etat.lent) await new Promise((fin) => { setTimeout(fin, etat.lent); });
    if (d.action === 'ramasser') {
      if (etat.reponseRamasser) { const r = etat.reponseRamasser; etat.reponseRamasser = null; return r; }
      const o = etat.objets.get(d.objet);
      if (!o) return { result: { ok: true, ramasse: 0, raison: 'objet', ...porte() } };
      const t = Date.now();
      const e = etatRecolte(o.sorte, o.depuisMs, t);
      if (!e.pret) return { result: { ok: true, ramasse: 0, raison: 'pas_pret', depuisMs: o.depuisMs, ...porte() } };
      o.depuisMs = departApresRecolte(o.sorte, o.depuisMs, t);
      etat.or += e.pieces;
      etat.gagne += e.pieces;
      etat.version += 1;
      await ecrirePorte();
      await ecrireDocument(`village_utilisateurs/${etat.uid}/batiments/${d.objet}`, { sorte: o.sorte, c: o.c, l: o.l, acheteLe: new Date(o.depuisMs), depuis: new Date(o.depuisMs), modifieLe: new Date(t) });
      return { result: { ok: true, ramasse: e.pieces, ...porte(), depuisMs: o.depuisMs } };
    }
    if (d.action !== 'acheter') return { result: { ok: true, gagne: 0, raison: 'deja' } };
    const prix = PRIX[d.article];
    if (etat.or < prix) return { result: { ok: true, achete: false, raison: 'pas_assez', manque: prix - etat.or, ...porte() } };
    etat.or -= prix;
    etat.version += 1;
    if (d.article === 'parcelle') { etat.parcelles += 1; await ecrirePorte(); return { result: { ok: true, achete: true, ...porte() } }; }
    await ecrirePorte();
    n += 1;
    const id = `o-achat${n}`;
    const t = Date.now();
    const doc = { sorte: d.article, c: d.c, l: d.l, acheteLe: new Date(t), depuis: new Date(t), modifieLe: new Date(t), ...(d.article === 'decoration' ? { modele: d.modele } : {}) };
    await ecrireDocument(`village_utilisateurs/${etat.uid}/batiments/${id}`, doc);
    if (d.article !== 'decoration') etat.objets.set(id, { sorte: d.article, c: d.c, l: d.l, depuisMs: t });
    const rendu = d.article === 'decoration' ? { id, sorte: 'decoration', modele: d.modele, c: d.c, l: d.l } : { id, sorte: d.article, c: d.c, l: d.l, depuisMs: t };
    return { result: { ok: true, achete: true, ...porte(), objet: rendu } };
  };
}

/** Connexion sur Réglages, `avant(uid)` (semer le portefeuille, les objets, poser une panne), puis l'accueil. */
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
const porteMonnaie = (uid, valeur, parcelles = 0, version = 1) => ecrireDocument(`village_utilisateurs/${uid}`, { or: valeur, gagne: valeur, parcelles, version });
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
const doigtsEnCours = new WeakMap();
async function glisser(page, depart, arrivee, { relacher = true } = {}) {
  if (estTelephone(page)) {
    const cdp = await page.context().newCDPSession(page);
    const point = (p) => [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }];
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(depart) });
    for (let i = 1; i <= 10; i++) {
      await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: point({ x: depart.x + ((arrivee.x - depart.x) * i) / 10, y: depart.y + ((arrivee.y - depart.y) * i) / 10 }) });
      await page.waitForTimeout(16);
    }
    if (!relacher) { doigtsEnCours.set(page, cdp); return; }
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
/** Un point de l'écran où l'objet est vraiment touché (aucune étiquette ni maison par-dessus), ou une erreur. */
async function pointSurObjet(locator) {
  await locator.scrollIntoViewIfNeeded();
  await locator.page().waitForTimeout(300); // un défilement doux peut encore courir : les coordonnées seraient fausses
  const p = await locator.evaluate((g) => {
    const essais = [[3, 3], [2, 3], [4, 3], [3, 2], [3, 4], [2, 2], [4, 4], [2, 4], [4, 2]];
    for (const f of [...g.children].reverse()) {
      if (f.tagName === 'ellipse' || f.getAttribute('data-role') === 'pret') continue;
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
/** Un clic (ordinateur) ou un toucher (téléphone) sur l'objet. */
async function toucherObjet(page, locator) {
  const p = await pointSurObjet(locator);
  if (estTelephone(page)) await page.touchscreen.tap(p.x, p.y); else await page.mouse.click(p.x, p.y);
}
/** Glisse un objet de sa case [c, l] vers la case [c2, l2] : le pointeur le saisit sur son corps et se déplace de l'écart entre les deux cases. */
async function glisserObjet(page, locator, [c, l], [c2, l2], options) {
  const depart = await pointSurObjet(locator);
  const [a, b] = [await pointBloc(page, c, l, 1), await pointBloc(page, c2, l2, 1)];
  await glisser(page, depart, { x: depart.x + b.x - a.x, y: depart.y + b.y - a.y }, options);
}
const seChevauchent = (a, b) => !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
const maisonRangee = (uid, cle, c, l) => ecrireDocument(`village_utilisateurs/${uid}/batiments/b-${cle}`, { sorte: 'besoin', c, l });
const decoration = (uid, id, modele, c, l) => { const quand = new Date(); return ecrireDocument(`village_utilisateurs/${uid}/batiments/${id}`, { sorte: 'decoration', modele, c, l, acheteLe: quand, depuis: quand, modifieLe: quand }); };

/** Un état de serveur neuf ; `semerObjet` écrit un champ ou un enclos semé il y a `ilYa` ms, dans l'émulateur ET dans l'état du serveur simulé. */
const nouvelEtat = (valeur = 100) => ({ or: valeur, gagne: valeur, parcelles: 0, version: 1, objets: new Map() });
async function semerObjet(etat, uid, id, sorte, ilYa, c, l) {
  const depuisMs = Date.now() - ilYa;
  etat.objets.set(id, { sorte, c, l, depuisMs });
  await ecrireDocument(`village_utilisateurs/${uid}/batiments/${id}`, { sorte, c, l, acheteLe: new Date(depuisMs), depuis: new Date(depuisMs), modifieLe: new Date(depuisMs) });
}

test.describe('accueil village : champs et enclos à cochons (étape 7)', () => {
  test('7.1 enclos prêt : dessin bien gras, pièce, nom ; un clic : une demande, la fête, le compteur, l’enclos vide', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    const etat = nouvelEtat(100);
    const demandes = await simulerOr(page, serveurFerme(etat));
    etat.uid = await ouvrirVillage(page, async (u) => { await porteMonnaie(u, 100); await semerObjet(etat, u, 'o-enclos1', 'enclos', 50 * HEURE, 4, 4); });
    const enclos = objet(page, 'o-enclos1');
    await expect(enclos).toHaveAttribute('data-dessin', 'enclos-cochons-gras');
    await expect(enclos).toHaveAttribute('data-etat', 'pret');
    await expect(enclos.locator('[data-role="pret"]')).toHaveCount(1);
    await expect(enclos).toHaveAttribute('aria-label', 'Enclos à cochons : 10 pièces d’or à ramasser');
    await expect(or(page)).toHaveText('100 pièces d’or');
    await capturer(page, info, '7.1-enclos-pret');
    await toucherObjet(page, enclos);
    await expect(fete(page)).toContainText('+ 10 pièces d’or');
    await expect(or(page)).toHaveText('110 pièces d’or');
    expect(ramassages(demandes)).toEqual([{ action: 'ramasser', objet: 'o-enclos1' }]);
    await expect(enclos).toHaveAttribute('data-dessin', 'enclos-cochons');
    await expect(enclos).toHaveAttribute('data-etat', 'attente');
    await expect(enclos.locator('[data-role="pret"]')).toHaveCount(0);
    await expect(enclos).toHaveAttribute('aria-label', 'Enclos à cochons');
    await capturer(page, info, '7.1-enclos-ramasse');
    expect(ramassages(demandes)).toHaveLength(1);
  });

  test('7.1b achat d’un enclos : 200 pièces, une demande sans modèle sur un bloc 2 x 2 libre, « Enclos acheté », l’enclos posé, compteur à 50', async ({ page }, info) => {
    await semer({ besoins: [FACTURES, ACHATS_B] });
    const etat = nouvelEtat(250);
    const demandes = await simulerOr(page, serveurFerme(etat));
    etat.uid = await ouvrirVillage(page, (u) => porteMonnaie(u, 250));
    await boutonBoutique(page).click();
    const enclosLigne = ligne(page, 'enclos');
    await expect(enclosLigne).toContainText('Enclos à cochons');
    await expect(enclosLigne).toContainText('200 pièces d’or');
    await expect(enclosLigne).toContainText('Tes cochons donnent 5 pièces d’or par jour, jusqu’à 20 en réserve.');
    await expect(ligne(page, 'champ')).toContainText('Champ cultivé');
    await expect(ligne(page, 'champ')).toContainText('100 pièces d’or');
    await expect(ligne(page, 'champ')).toContainText('Pousse en 2 jours, puis se récolte contre 20 pièces d’or.');
    await capturer(page, info, '7.1b-boutique');
    await enclosLigne.locator('[data-role="acheter"]').click();
    await expect(fenetre(page)).toHaveCount(0);
    expect(demandes).toHaveLength(1);
    const [d] = demandes;
    expect(Object.keys(d).sort()).toEqual(['action', 'article', 'c', 'l']);
    expect(d).toMatchObject({ action: 'acheter', article: 'enclos' });
    // le bloc 2 x 2 proposé ne touche aucune maison
    const maisons = await page.locator('[data-role="village"] [data-role="batiment"]').evaluateAll((els) => els.map((e) => e.dataset.case.split('-').map(Number)));
    for (const [c, l] of maisons) for (const [i, j] of [[0, 0], [0, 1], [1, 0], [1, 1]]) expect(d.c + i >= c && d.c + i < c + 2 && d.l + j >= l && d.l + j < l + 2).toBe(false);
    await expect(page.locator('.toast')).toContainText('Enclos acheté');
    const pose = page.locator('[data-role="village"] [data-role="objet"][data-sorte="enclos"]');
    await expect(pose).toHaveCount(1);
    await expect(pose).toHaveAttribute('data-case', `${d.c}-${d.l}`);
    await expect(pose).toHaveAttribute('data-dessin', 'enclos-cochons');
    await expect(pose).toHaveAttribute('data-etat', 'attente');
    await expect(or(page)).toHaveText('50 pièces d’or');
    await expect(fete(page)).toHaveCount(0); // pas de fête pour un achat
    await capturer(page, info, '7.1b-enclos-achete');
  });

  test('7.2 champ prêt : un clic, + 20, il redevient semé ; champ qui pousse et enclos vide : un message, aucune demande', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    const etat = nouvelEtat(0);
    const demandes = await simulerOr(page, serveurFerme(etat));
    etat.uid = await ouvrirVillage(page, async (u) => {
      await porteMonnaie(u, 0);
      await semerObjet(etat, u, 'o-champ1', 'champ', 49 * HEURE, 4, 4);
      await semerObjet(etat, u, 'o-champ2', 'champ', 20 * HEURE, 6, 2);
      await semerObjet(etat, u, 'o-enclos1', 'enclos', 2 * HEURE, 2, 6);
    });
    const pret = objet(page, 'o-champ1');
    await expect(pret).toHaveAttribute('data-dessin', 'champ-pret');
    await expect(pret).toHaveAttribute('aria-label', 'Champ prêt à récolter');
    await expect(objet(page, 'o-champ2')).toHaveAttribute('data-dessin', 'champ-pousse');
    await expect(objet(page, 'o-champ2')).toHaveAttribute('aria-label', 'Champ qui pousse');
    await expect(objet(page, 'o-enclos1')).toHaveAttribute('data-dessin', 'enclos-cochons');
    await capturer(page, info, '7.2-champs');
    await toucherObjet(page, pret);
    await expect(fete(page)).toContainText('+ 20 pièces d’or');
    await expect(or(page)).toHaveText('20 pièces d’or');
    await expect(pret).toHaveAttribute('data-dessin', 'champ-seme');
    await expect(pret).toHaveAttribute('aria-label', 'Champ semé');
    expect(ramassages(demandes)).toEqual([{ action: 'ramasser', objet: 'o-champ1' }]);
    await capturer(page, info, '7.2-champ-recolte');
    await toucherObjet(page, objet(page, 'o-champ2'));
    await expect(page.locator('#toasts')).toContainText('Ça pousse encore.');
    await toucherObjet(page, objet(page, 'o-enclos1'));
    await expect(page.locator('#toasts')).toContainText('Rien à ramasser pour l’instant.');
    await page.waitForTimeout(400);
    expect(ramassages(demandes)).toHaveLength(1);
  });

  test('7.2b achat d’un champ : grisé sans assez d’or (« Encore 50 pièces. ») ; acheté avec 120 : « Champ acheté », dessin semé', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    const etat = nouvelEtat(50);
    const demandes = await simulerOr(page, serveurFerme(etat));
    etat.uid = await ouvrirVillage(page, (u) => porteMonnaie(u, 50));
    await boutonBoutique(page).click();
    await expect(ligne(page, 'champ').locator('[data-role="acheter"]')).toBeDisabled();
    await expect(ligne(page, 'champ').locator('[data-role="manque"]')).toHaveText('Encore 50 pièces.');
    await expect(ligne(page, 'enclos').locator('[data-role="manque"]')).toHaveText('Encore 150 pièces.');
    await capturer(page, info, '7.2b-champ-grise');
    await fenetre(page).getByRole('button', { name: 'Fermer' }).last().click();
    expect(demandes).toEqual([]);
    Object.assign(etat, { or: 120, gagne: 120, version: 2 });
    await porteMonnaie(etat.uid, 120, 0, 2);
    await rouvrir(page);
    await expect(or(page)).toHaveText('120 pièces d’or');
    await boutonBoutique(page).click();
    await ligne(page, 'champ').locator('[data-role="acheter"]').click();
    await expect(fenetre(page)).toHaveCount(0);
    await expect(page.locator('.toast')).toContainText('Champ acheté');
    const champ = page.locator('[data-role="village"] [data-role="objet"][data-sorte="champ"]');
    await expect(champ).toHaveAttribute('data-dessin', 'champ-seme');
    await expect(or(page)).toHaveText('20 pièces d’or');
    expect(demandes).toHaveLength(1);
    expect(demandes[0]).toMatchObject({ action: 'acheter', article: 'champ' });
    expect(Object.hasOwn(demandes[0], 'modele')).toBe(false);
    await capturer(page, info, '7.2b-champ-achete');
  });

  test('7.3 déplacer un enclos prêt : sur un bloc libre (aucune récolte), gardé au rechargement ; sur une maison : il revient ; écriture en panne : il revient', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    const etat = nouvelEtat(0);
    const demandes = await simulerOr(page, serveurFerme(etat));
    etat.uid = await ouvrirVillage(page, async (u) => { await porteMonnaie(u, 0); await maisonRangee(u, 'achatsfactures-liste', 1, 1); await semerObjet(etat, u, 'o-enclos1', 'enclos', 50 * HEURE, 5, 5); });
    const enclos = objet(page, 'o-enclos1');
    await expect(enclos).toHaveAttribute('data-case', '5-5');
    await glisserObjet(page, enclos, [5, 5], [5, 2]);
    await expect(enclos).toHaveAttribute('data-case', '5-2');
    await expect.poll(async () => { const o = await lireDocument(`village_utilisateurs/${etat.uid}/batiments/o-enclos1`); return o && `${o.c}-${o.l}`; }).toBe('5-2');
    await page.waitForTimeout(500);
    expect(ramassages(demandes)).toEqual([]); // un glisser ne ramasse jamais
    await expect(enclos).toHaveAttribute('data-etat', 'pret');
    await capturer(page, info, '7.3-enclos-deplace');
    await rouvrir(page);
    await expect(enclos).toHaveAttribute('data-case', '5-2');
    await expect(enclos).toHaveAttribute('data-etat', 'pret');
    // sur la maison : repère rouge, il revient
    await glisserObjet(page, enclos, [5, 2], [1, 1], { relacher: false });
    await expect(page.locator('[data-role="cible-rangement"]')).toHaveAttribute('data-libre', 'non');
    await capturer(page, info, '7.3-sur-une-maison');
    await lacher(page);
    await expect(enclos).toHaveAttribute('data-case', '5-2');
    await page.waitForTimeout(600);
    // écriture en panne : il revient, avec le message habituel
    await page.evaluate(() => { window.__chevalierTest.pannesVillage = { ecriture: 1 }; });
    await glisserObjet(page, enclos, [5, 2], [5, 5]);
    await expect(page.locator('.toast')).toContainText('Le déplacement n’a pas été enregistré. Réessaie.');
    await expect(enclos).toHaveAttribute('data-case', '5-2');
    expect((await lireDocument(`village_utilisateurs/${etat.uid}/batiments/o-enclos1`)).c).toBe(5);
    expect(ramassages(demandes)).toEqual([]);
  });

  test('7.4 attente sans perte : un champ semé il y a un an rapporte 20 ; un enclos oublié 30 jours, 20 (plafond)', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    const etat = nouvelEtat(0);
    await simulerOr(page, serveurFerme(etat));
    etat.uid = await ouvrirVillage(page, async (u) => { await porteMonnaie(u, 0); await semerObjet(etat, u, 'o-champ1', 'champ', 365 * JOUR, 4, 4); await semerObjet(etat, u, 'o-enclos1', 'enclos', 30 * JOUR, 6, 2); });
    await expect(objet(page, 'o-champ1')).toHaveAttribute('data-etat', 'pret');
    await expect(objet(page, 'o-enclos1')).toHaveAttribute('aria-label', 'Enclos à cochons : 20 pièces d’or à ramasser');
    await capturer(page, info, '7.4-attente');
    await toucherObjet(page, objet(page, 'o-champ1'));
    await expect(or(page)).toHaveText('20 pièces d’or');
    await toucherObjet(page, objet(page, 'o-enclos1'));
    await expect(or(page)).toHaveText('40 pièces d’or');
  });

  test('7.5 « Animations » coupé, puis système en « moins d’animations » : pas de fête animée, un simple message, l’or s’ajoute', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    const etat = nouvelEtat(0);
    await simulerOr(page, serveurFerme(etat));
    etat.uid = await ouvrirVillage(page, async (u) => { await porteMonnaie(u, 0); await semerObjet(etat, u, 'o-champ1', 'champ', 49 * HEURE, 4, 4); await semerObjet(etat, u, 'o-enclos1', 'enclos', 50 * HEURE, 6, 2); });
    await page.getByRole('button', { name: 'Réglages de l’accueil' }).click();
    await page.getByRole('dialog', { name: 'Réglages de l’accueil' }).getByRole('switch', { name: 'Animations' }).uncheck();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    await toucherObjet(page, objet(page, 'o-champ1'));
    await expect(page.locator('#toasts')).toContainText('+ 20 pièces d’or');
    await expect(or(page)).toHaveText('20 pièces d’or');
    await expect(fete(page)).toHaveCount(0);
    await capturer(page, info, '7.5-sans-animation');
    // « Animations » remis, mais le système demande moins d'animations
    await page.getByRole('button', { name: 'Réglages de l’accueil' }).click();
    await page.getByRole('dialog', { name: 'Réglages de l’accueil' }).getByRole('switch', { name: 'Animations' }).check();
    await page.keyboard.press('Escape');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await toucherObjet(page, objet(page, 'o-enclos1'));
    await expect(page.locator('#toasts')).toContainText('+ 10 pièces d’or');
    await expect(or(page)).toHaveText('30 pièces d’or');
    await expect(fete(page)).toHaveCount(0);
  });

  test('7.6 jeu à part : une bonne nouvelle ne change ni les champs ni les enclos, et ne ramasse rien', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    const etat = nouvelEtat(100);
    const base = serveurFerme(etat);
    const demandes = await simulerOr(page, async (d) => {
      if (d.action !== 'gain') return base(d);
      etat.or += 50; etat.gagne += 50; etat.version += 1;
      await ecrireDocument(`village_utilisateurs/${etat.uid}`, { or: etat.or, gagne: etat.gagne, parcelles: 0, version: etat.version });
      return { result: { ok: true, gagne: 50, or: etat.or, version: etat.version } };
    });
    etat.uid = await ouvrirVillage(page, async (u) => {
      await porteMonnaie(u, 100);
      await semerObjet(etat, u, 'o-champ1', 'champ', 20 * HEURE, 4, 4);
      await semerObjet(etat, u, 'o-enclos1', 'enclos', 50 * HEURE, 6, 2);
    });
    const etats = () => page.locator('[data-role="village"] [data-role="objet"][data-etat]').evaluateAll((els) => els.map((e) => [e.dataset.maison, e.dataset.dessin, e.dataset.etat]));
    const avant = await etats();
    expect(avant).toHaveLength(2);
    await page.evaluate(async () => { (await import(new URL('js/os/bonnes-nouvelles.js', document.baseURI).href)).annoncer('devis-signe', { id: 'd1' }); });
    await expect(or(page)).toHaveText('150 pièces d’or');
    await page.waitForTimeout(500);
    expect(await etats()).toEqual(avant);
    expect(ramassages(demandes)).toEqual([]);
    await capturer(page, info, '7.6-jeu-a-part');
  });

  test('7.7 double clic ou deux touchers rapides sur un enclos prêt : exactement une demande, aucune fenêtre ; un 2e clic 400 ms plus tard pendant l’appel lent : toujours une', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    const etat = nouvelEtat(0);
    etat.lent = 600;
    const demandes = await simulerOr(page, serveurFerme(etat));
    etat.uid = await ouvrirVillage(page, async (u) => { await porteMonnaie(u, 0); await semerObjet(etat, u, 'o-enclos1', 'enclos', 50 * HEURE, 4, 4); await semerObjet(etat, u, 'o-enclos2', 'enclos', 50 * HEURE, 6, 1); });
    const enclos = objet(page, 'o-enclos1');
    const p = await pointSurObjet(enclos);
    if (estTelephone(page)) { await page.touchscreen.tap(p.x, p.y); await page.waitForTimeout(80); await page.touchscreen.tap(p.x, p.y); } else await page.mouse.dblclick(p.x, p.y);
    await page.waitForTimeout(1500);
    expect(ramassages(demandes)).toEqual([{ action: 'ramasser', objet: 'o-enclos1' }]);
    await expect(or(page)).toHaveText('10 pièces d’or');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => location.hash)).toBe('#/accueil');
    await capturer(page, info, '7.7-double-clic');
    // un second clic 400 ms après le premier, pendant un appel lent : le verrou garde une seule demande
    etat.lent = 1500;
    const enclos2 = objet(page, 'o-enclos2');
    await toucherObjet(page, enclos2);
    await page.waitForTimeout(400);
    await toucherObjet(page, enclos2);
    await expect(or(page)).toHaveText('20 pièces d’or', { timeout: 5000 });
    await page.waitForTimeout(800);
    expect(ramassages(demandes).filter((d) => d.objet === 'o-enclos2')).toHaveLength(1);
    await expect(enclos2).toHaveAttribute('data-etat', 'attente');
  });

  test('7.8 pannes et refus : réponse 500 ou panne simulée : « La récolte n’a pas abouti. Réessaie. », rien ne change ; refus pas_pret : message neutre, champ semé', async ({ page }, info) => {
    info.annotations.push({ type: 'erreurs-reseau-attendues', description: 'la panne simulée de villageOr (500) est notée par le navigateur' });
    await semer({ besoins: [FACTURES] });
    const etat = nouvelEtat(100);
    const base = serveurFerme(etat);
    let panne = true;
    const demandes = await simulerOr(page, async (d) => (d.action === 'ramasser' && panne ? { status: 500 } : base(d)));
    etat.uid = await ouvrirVillage(page, async (u) => { await porteMonnaie(u, 100); await semerObjet(etat, u, 'o-enclos1', 'enclos', 50 * HEURE, 4, 4); await semerObjet(etat, u, 'o-champ1', 'champ', 49 * HEURE, 6, 2); });
    const enclos = objet(page, 'o-enclos1');
    await toucherObjet(page, enclos);
    await expect(page.locator('#toasts')).toContainText('La récolte n’a pas abouti. Réessaie.');
    await expect(enclos).toHaveAttribute('data-dessin', 'enclos-cochons-gras');
    await expect(or(page)).toHaveText('100 pièces d’or');
    expect(ramassages(demandes)).toHaveLength(1);
    await capturer(page, info, '7.8-recolte-en-panne');
    // panne simulée dans l'écran : aucune demande
    panne = false;
    await page.evaluate(() => { window.__chevalierTest.pannesOr = { ramassage: 1 }; });
    await page.locator('#toasts').evaluate((z) => z.replaceChildren());
    await toucherObjet(page, enclos);
    await expect(page.locator('#toasts')).toContainText('La récolte n’a pas abouti. Réessaie.');
    expect(ramassages(demandes)).toHaveLength(1);
    await expect(enclos).toHaveAttribute('data-etat', 'pret');
    // le serveur dit « pas prêt » (son heure fait foi) : message neutre, le champ suit son `depuis`
    etat.reponseRamasser = { result: { ok: true, ramasse: 0, raison: 'pas_pret', depuisMs: Date.now(), or: 100, parcelles: 0, version: 1 } };
    const champ = objet(page, 'o-champ1');
    await expect(champ).toHaveAttribute('data-dessin', 'champ-pret');
    await toucherObjet(page, champ);
    await expect(page.locator('#toasts')).toContainText('Ça pousse encore.');
    await expect(champ).toHaveAttribute('data-dessin', 'champ-seme');
    await expect(or(page)).toHaveText('100 pièces d’or');
  });

  test('7.9 retour sur l’onglet : le champ mûr devient prêt sans minuterie, seulement au retour (visibilitychange)', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    const etat = nouvelEtat(0);
    await simulerOr(page, serveurFerme(etat));
    // deux objets : l'ordre des identifiants (o-a… puis o-champ1) n'est pas celui du dessin (le plus au fond d'abord)
    etat.uid = await ouvrirVillage(page, async (u) => { await porteMonnaie(u, 0); await semerObjet(etat, u, 'o-champ1', 'champ', 48 * HEURE - 10 * 60 * 1000, 4, 4); await semerObjet(etat, u, 'o-aenclos', 'enclos', HEURE, 6, 6); });
    const champ = objet(page, 'o-champ1');
    await expect(champ).toHaveAttribute('data-dessin', 'champ-mur');
    const ordre = await page.locator('[data-role="village"] [data-role="objet"][data-etat]').evaluateAll((els) => els.map((e) => e.dataset.maison));
    expect(ordre).toEqual(['o-champ1', 'o-aenclos']); // le dessin ne suit pas l'ordre des identifiants
    // retour sur l'onglet sans aucun changement : aucun redessin (le même dessin reste en place)
    await page.evaluate(() => { document.querySelector('[data-role="village"]').dataset.marque = 'avant'; document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(800);
    await expect(page.locator('[data-role="village"]')).toHaveAttribute('data-marque', 'avant');
    await page.evaluate(() => { const d = Date.now; Date.now = () => d() + 20 * 60 * 1000; });
    await page.waitForTimeout(1000);
    await expect(champ).toHaveAttribute('data-dessin', 'champ-mur'); // aucune minuterie : rien ne bouge tout seul
    await page.evaluate(() => { document.dispatchEvent(new Event('visibilitychange')); });
    await expect(champ).toHaveAttribute('data-dessin', 'champ-pret');
    await expect(champ).toHaveAttribute('data-etat', 'pret');
    await capturer(page, info, '7.9-retour-onglet');
  });

  test('7.10 clavier : un champ ou un enclos est un bouton (Entrée ou Espace : une demande s’il est prêt ; pas prêt : message neutre, aucune demande) ; décoration : pas de tabindex ; le focus reste sur l’objet ; aucune touche ne déplace', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    const etat = nouvelEtat(0);
    const demandes = await simulerOr(page, serveurFerme(etat));
    etat.uid = await ouvrirVillage(page, async (u) => {
      await porteMonnaie(u, 0);
      await semerObjet(etat, u, 'o-enclos1', 'enclos', 50 * HEURE, 4, 4);
      await semerObjet(etat, u, 'o-enclos2', 'enclos', HEURE, 6, 2);
      await semerObjet(etat, u, 'o-champ1', 'champ', 49 * HEURE, 1, 6);
      await decoration(u, 'o-arbre', 'arbre', 7, 7);
    });
    const pret = objet(page, 'o-enclos1');
    for (const id of ['o-enclos1', 'o-enclos2', 'o-champ1']) {
      await expect(objet(page, id)).toHaveAttribute('tabindex', '0');
      await expect(objet(page, id)).toHaveAttribute('role', 'button');
    }
    expect(await objet(page, 'o-arbre').getAttribute('tabindex')).toBeNull();
    await expect(objet(page, 'o-arbre')).toHaveAttribute('role', 'img');
    // pas prêt : Entrée donne le message neutre, sans aucune demande
    await objet(page, 'o-enclos2').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#toasts')).toContainText('Rien à ramasser pour l’instant.');
    expect(ramassages(demandes)).toEqual([]);
    await pret.focus();
    await capturer(page, info, '7.10-focus');
    for (const touche of ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) await page.keyboard.press(touche);
    await expect(pret).toHaveAttribute('data-case', '4-4');
    expect(ramassages(demandes)).toEqual([]);
    await page.keyboard.press('Enter');
    await expect(or(page)).toHaveText('10 pièces d’or');
    expect(ramassages(demandes)).toEqual([{ action: 'ramasser', objet: 'o-enclos1' }]);
    await expect(pret).toHaveAttribute('data-etat', 'attente');
    await expect(pret).toHaveAttribute('tabindex', '0');
    // le focus est toujours sur l'enclos après le redessin
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute?.('data-maison'))).toBe('o-enclos1');
    // Espace récolte aussi (le champ prêt) ; le focus reste sur le champ
    await objet(page, 'o-champ1').focus();
    await page.keyboard.press(' ');
    await expect(or(page)).toHaveText('30 pièces d’or');
    expect(ramassages(demandes)).toEqual([{ action: 'ramasser', objet: 'o-enclos1' }, { action: 'ramasser', objet: 'o-champ1' }]);
    await expect(objet(page, 'o-champ1')).toHaveAttribute('data-etat', 'attente');
    await expect.poll(() => page.evaluate(() => document.activeElement?.getAttribute?.('data-maison'))).toBe('o-champ1');
  });

  test('7.11 récolte finie pendant un glisser : l’objet déposé garde le nouveau `depuis` (pas prêt), jamais l’ancien', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    const etat = nouvelEtat(0);
    etat.lent = 1500;
    const demandes = await simulerOr(page, serveurFerme(etat));
    etat.uid = await ouvrirVillage(page, async (u) => { await porteMonnaie(u, 0); await maisonRangee(u, 'achatsfactures-liste', 1, 1); await semerObjet(etat, u, 'o-enclos1', 'enclos', 50 * HEURE, 5, 5); });
    const enclos = objet(page, 'o-enclos1');
    await expect(enclos).toHaveAttribute('data-etat', 'pret');
    await enclos.focus();
    await page.keyboard.press('Enter'); // la demande part tout de suite ; le serveur répond dans 1,5 s
    await glisserObjet(page, enclos, [5, 5], [5, 2], { relacher: false });
    await expect(or(page)).toHaveText('10 pièces d’or', { timeout: 5000 }); // la récolte finit pendant le glisser
    await lacher(page);
    await expect(enclos).toHaveAttribute('data-case', '5-2');
    await expect(enclos).toHaveAttribute('data-etat', 'attente');
    await page.waitForTimeout(600);
    await expect(enclos).toHaveAttribute('data-etat', 'attente');
    await expect(enclos.locator('[data-role="pret"]')).toHaveCount(0);
    expect(ramassages(demandes)).toHaveLength(1);
    await capturer(page, info, '7.11-recolte-pendant-glisser');
  });

  test('6.8 ferme : boutique et accueil sans « CRM », classement, série ni notification ; aucun son', async ({ page }, info) => {
    await semer({ besoins: [FACTURES] });
    const etat = nouvelEtat(300);
    await simulerOr(page, serveurFerme(etat));
    etat.uid = await ouvrirVillage(page, async (u) => { await porteMonnaie(u, 300); await semerObjet(etat, u, 'o-champ1', 'champ', 49 * HEURE, 4, 4); await semerObjet(etat, u, 'o-enclos1', 'enclos', 50 * HEURE, 6, 2); });
    await boutonBoutique(page).click();
    await expect(fenetre(page)).toBeVisible();
    const etiquettes = await page.locator('[data-role="village"] [data-role="objet"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')).join(' '));
    for (const texte of [await fenetre(page).innerText(), await page.locator('.page-village').innerText(), etiquettes]) {
      expect(texte).not.toMatch(/\bCRM\b/);
      expect(texte).not.toMatch(/classement|série|notification/i);
    }
    expect(await page.evaluate(() => document.querySelectorAll('audio').length)).toBe(0);
    expect(await page.evaluate(() => [...document.querySelectorAll('[data-role="objet"] [title], [data-role="objet"][title], [role="dialog"] [title]')].length)).toBe(0);
    await capturer(page, info, '6.8-ferme');
  });

  test('téléphone : un toucher sur un enclos prêt ramasse (une demande) ; la pièce et l’objet ne couvrent ni la roue, ni la Mairie, ni « Liste », ni la barre d’or', async ({ page }, info) => {
    test.skip(!estTelephone(page), 'parcours propre au téléphone');
    await semer({ besoins: [FACTURES, ACHATS_B] });
    const etat = nouvelEtat(0);
    const demandes = await simulerOr(page, serveurFerme(etat));
    etat.uid = await ouvrirVillage(page, async (u) => { await porteMonnaie(u, 0); await semerObjet(etat, u, 'o-enclos1', 'enclos', 50 * HEURE, 3, 3); });
    const enclos = objet(page, 'o-enclos1');
    await enclos.scrollIntoViewIfNeeded();
    await page.waitForTimeout(300);
    const boites = [await enclos.locator('[data-role="pret"]').boundingBox(), await enclos.locator('[data-role="prise-objet"]').boundingBox()];
    const autres = [page.getByRole('button', { name: 'Réglages de l’accueil' }), page.locator('[data-batiment-fixe="mairie-reglages"]'), page.locator('.village-bouton-vue'), page.locator('[data-role="or-barre"]')];
    for (const autre of autres) {
      if (!(await autre.count())) continue;
      const b = await autre.first().boundingBox();
      for (const boite of boites) expect(seChevauchent(boite, b)).toBe(false);
    }
    await capturer(page, info, 'telephone-enclos-pret');
    await toucherObjet(page, enclos);
    await expect(or(page)).toHaveText('10 pièces d’or');
    expect(ramassages(demandes)).toEqual([{ action: 'ramasser', objet: 'o-enclos1' }]);
  });

  test('recette : 2 champs (semé, prêt), 2 enclos (vide, prêt), 3 décorations sur un damier 10 x 10 (capture pour Jérôme)', async ({ page }, info) => {
    await semer({ besoins: [FACTURES, ACHATS_B] });
    const etat = nouvelEtat(80);
    etat.parcelles = 1;
    await simulerOr(page, serveurFerme(etat));
    etat.uid = await ouvrirVillage(page, async (u) => {
      await porteMonnaie(u, 80, 1);
      await semerObjet(etat, u, 'o-champ1', 'champ', HEURE, 6, 0);
      await semerObjet(etat, u, 'o-champ2', 'champ', 50 * HEURE, 8, 2);
      await semerObjet(etat, u, 'o-enclos1', 'enclos', HEURE, 2, 7);
      await semerObjet(etat, u, 'o-enclos2', 'enclos', 3 * JOUR, 6, 6);
      for (const [i, modele] of ['arbre', 'fleurs', 'brouette'].entries()) await decoration(u, `o-recette${i}`, modele, 4 + i, 9);
    });
    await expect(page.locator('[data-role="damier"]')).toHaveAttribute('data-colonnes', '10');
    await expect(page.locator('[data-role="village"] [data-role="objet"]')).toHaveCount(7);
    await expect(page.locator('[data-role="village"] [data-role="objet"][data-etat="pret"]')).toHaveCount(2);
    await capturer(page, info, 'recette-ferme');
  });
});
