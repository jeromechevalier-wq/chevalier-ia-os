// Accueil « village », étape 3c (étape 4 du cahier, 27/11/2026) : les petites maisons « vue filtrée » (js/os/village-petites.js, village-petites-lecture.js,
// village-ecran.js, village-glisser.js, village-reglages.js, village-liste.js) et l'adresse d'un seul chantier (#/achatschantiers/liste/<id>).
// Un test par critère (4.1 à 4.6, le nom commence par son numéro), une capture par critère dans tests/e2e/captures/maison-village-petites/ (nommée avec le projet).
// La base des chantiers est un faux réseau posé par le crochet de test `window.__accesBase` (émulateurs seulement), comme tests/e2e/achatschantiers.spec.js.
// La connexion à la base est réservée au titulaire (JEROME) : ces parcours se font avec son compte. Données neutres, adresses en exemple.test.
// Logique sans navigateur : fin de tests/maison-village.test.js.
// 3c-bis (27/11/2026) : tests 3cb.* (projets automatiques, cacher et remontrer une automatique, plus de plafond par personne, corrections de la relecture Fable).
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, ecrireDocument, listerDocuments, estTelephone, creerProjet, JEROME, PROJET, FIRESTORE, ECRAN_PARCOURS } from './outils.js';
import { semerFicheEmulateur } from '../_fiche-emulateur.js';

const DOSSIER = fileURLToPath(new URL('./captures/maison-village-petites/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' });
const HOTE = new URL(FIRESTORE).host;
const ACHATS = ['achatsfactures', 'tableauachats', 'achatschantiers', 'achatsfournisseurs', 'achatsarticles'];
const FACTURES = { nom: 'Factures', phrase: 'Valider mes factures fournisseurs', batiment: 'banque', cible: '#/achatsfactures/liste' };
const CHANTIERS = { nom: 'Chantiers', phrase: 'Suivre les dépenses de mes chantiers', batiment: 'grue', cible: '#/achatschantiers/liste' };
const PROJETS = { nom: 'Projets', phrase: 'Suivre mes projets', batiment: 'atelier', cible: '#/projets/projets' };
const PARENT = 'b-achatschantiers-liste';
const semer = (champs) => semerFicheEmulateur({ projet: PROJET, hote: HOTE, document: 'ecran', fiche: { ...ECRAN_PARCOURS, configuration_crm: 'neutre', modules: ACHATS, ...champs } });

const https = (hote, chemin = '') => `${['https', ''].join(':')}//${hote}${chemin}`;
const FICHE = () => ({ adresseBase: https('base.exemple.test'), clePublique: 'cle-publique-fictive', espace: 'espace-essai', webhooks: { actions: https('hooks.exemple.test', '/actions') } });
const CHANTIERS_ESSAI = [
  { id: 'c1', nom: 'Maison A', code: 'CH-0001', client: null, statut: 'en_cours', archive: false, adresse: null, budget_ht: 0, date_debut: null, date_fin_prevue: null, date_fin_reelle: null },
  { id: 'c2', nom: 'Atelier B', code: 'CH-0002', client: null, statut: 'en_preparation', archive: false, adresse: null, budget_ht: 0, date_debut: null, date_fin_prevue: null, date_fin_reelle: null },
  { id: 'c3', nom: 'Hangar C', code: 'CH-0003', client: null, statut: 'termine', archive: false, adresse: null, budget_ht: 0, date_debut: null, date_fin_prevue: null, date_fin_reelle: null },
];

/** Faux réseau réduit (tests/e2e/achatschantiers.spec.js) posé AVANT le chargement : chantiers, chiffres, favoris. Les appels sont gardés dans window.__appels. */
async function poserFauxReseau(page, options = {}) {
  await page.addInitScript(({ chantiers, lectureEnPanne, retenir }) => {
    const faux = { chantiers: structuredClone(chantiers), lectureEnPanne, retenir };
    window.__faux = faux;
    window.__appels = [];
    const rep = (corps, statut = 200, entetes = {}) => new Response(JSON.stringify(corps), { status: statut, headers: { 'Content-Type': 'application/json', ...entetes } });
    const fetchImpl = async (url, init = {}) => {
      const u = new URL(url);
      window.__appels.push({ methode: init.method, chemin: u.pathname });
      if (u.pathname === '/rest/v1/chantiers') {
        // 3c-bis : `retenir` garde la réponse jusqu'à window.__faux.ouvrir() (le test compte les attentes)
        if (faux.retenir) { faux.attentes = (faux.attentes ?? 0) + 1; await (faux.porte ??= new Promise((r) => { faux.ouvrir = r; })); }
        if (faux.lectureEnPanne) return rep({ message: 'panne' }, 500);
        return rep(faux.chantiers, 200, { 'Content-Range': `0-${Math.max(0, faux.chantiers.length - 1)}/${faux.chantiers.length}` });
      }
      if (u.pathname === '/rest/v1/v_td_chantiers') return rep([], 200, { 'Content-Range': '0-0/0' });
      if (u.pathname === '/rest/v1/rpc/lister_favoris_os') return rep([]);
      return rep({ message: 'inconnu' }, 404);
    };
    window.__accesBase = { fetchImpl, jeton: 'jeton-fictif', claims: { role: 'authenticated', espace_base: 'espace-essai' } };
  }, { chantiers: CHANTIERS_ESSAI, lectureEnPanne: false, retenir: false, ...options });
}

/** Prépare la maison (besoins, modules), la connexion à la base et le faux réseau ; connexion sur Réglages, `avant(uid)`, puis le village. */
async function ouvrirApres(page, { besoins = [FACTURES, CHANTIERS], modules = ACHATS, reseau = {}, avant = async () => {} } = {}) {
  await semer({ besoins, modules });
  await ecrireDocument('base_parametres/connexion', FICHE());
  await poserFauxReseau(page, reseau);
  await connecter(page, JEROME, { attendreAccueil: false, route: 'reglages' });
  await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible();
  const uid = await page.evaluate(async () => (await import(new URL('js/os/firebase.js', document.baseURI).href)).auth.currentUser.uid);
  await avant(uid);
  await page.evaluate(() => { location.hash = '#/accueil'; });
  await expect(page.locator('[data-role="village"]')).toBeVisible();
  return uid;
}
/** Fin des lectures des petites maisons (signal posé par l'écran : plus aucune lecture ni redessin en attente). */
const lues = (page) => expect(page.locator('[data-role="page-village"]')).toHaveAttribute('data-petites-lues', 'oui');
const semerPetite = (uid, id, cible, nom = 'Petite', parent = PARENT) => ecrireDocument(`village_utilisateurs/${uid}/batiments/${id}`, { sorte: 'petite', parent, nom, cible });
const docsPetites = async (uid) => (await listerDocuments(`village_utilisateurs/${uid}/batiments`)).filter((d) => d.id.startsWith('p-'));
const maison = (page, nom) => page.locator(`[data-role="village"] [data-role="batiment"][aria-label^="${nom} :"]`);
const petites = (page) => page.locator('[data-role="village"] [data-role="petite-maison"]');
const petite = (page, nom) => page.locator(`[data-role="village"] [data-role="petite-maison"][aria-label^="${nom} :"]`);
const bulle = (page) => page.locator('[data-role="bulle"]');
const fenetreMaison = (page) => page.getByRole('dialog', { name: 'Réglages de la maison' });
const fenetreChoix = (page) => page.getByRole('dialog', { name: 'Ajouter une petite maison' });
const fenetrePetite = (page) => page.getByRole('dialog', { name: 'Réglages de la petite maison' });

/** Point de l'écran (px) du centre d'un bloc du damier, relevé de `dz` unités du dessin. */
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
const caseDe = async (loc) => (await loc.getAttribute('data-case')).split('-').map(Number);
async function pointMaison(page, nom) {
  const [c, l] = await caseDe(maison(page, nom));
  return pointBloc(page, c, l, 2, 24);
}
async function pointPetite(loc) {
  const [c, l] = await caseDe(loc);
  return pointBloc(loc.page(), c, l, 1, 14);
}
/** Les 12 cases voisines d'une grande (mêmes que js/os/village-petites.js). */
const voisines = (c, l) => [[c - 1, l + 2], [c + 2, l - 1], [c - 1, l + 1], [c + 1, l - 1], [c + 2, l], [c, l + 2], [c - 1, l], [c, l - 1], [c + 2, l + 1], [c + 1, l + 2], [c - 1, l - 1], [c + 2, l + 2]].map(([x, y]) => `${x}-${y}`);
/** Téléphone : le dessin défile ; on amène la maison au milieu avant de la toucher. */
const centrer = (loc) => loc.evaluate((e) => e.scrollIntoView({ block: 'center', inline: 'center' }));

async function glisser(page, nom, vers, { relacher = true } = {}) {
  const depart = await pointMaison(page, nom);
  const arrivee = await pointBloc(page, vers.c, vers.l, 2, 24);
  await page.mouse.move(depart.x, depart.y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) await page.mouse.move(depart.x + ((arrivee.x - depart.x) * i) / 8, depart.y + ((arrivee.y - depart.y) * i) / 8);
  if (relacher) await page.mouse.up();
}
async function glisserAuDoigt(page, depart, arrivee, { pas = 10 } = {}) {
  const cdp = await page.context().newCDPSession(page);
  const point = (p) => [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: point(depart) });
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
/** Fenêtre d'une grande maison : double clic (ordinateur) ou appui long (téléphone). */
async function ouvrirFenetreMaison(page, nom) {
  if (estTelephone(page)) { await centrer(maison(page, nom)); await appuiLong(page, await pointMaison(page, nom)); } else {
    const p = await pointMaison(page, nom);
    await page.mouse.dblclick(p.x, p.y);
  }
  await expect(fenetreMaison(page)).toBeVisible();
}
/** Ouvre une petite maison : un clic (ordinateur) ; deux touchers (téléphone : la bulle d'abord). */
async function ouvrirPetite(page, loc) {
  if (estTelephone(page)) await centrer(loc);
  const p = await pointPetite(loc);
  await page.mouse.click(p.x, p.y);
  if (estTelephone(page)) {
    await expect(bulle(page)).toBeVisible();
    await page.mouse.click(p.x, p.y);
  }
}
/** Fenêtre d'une petite maison : double clic (ordinateur) ou appui long (téléphone). */
async function ouvrirFenetrePetite(page, loc) {
  if (estTelephone(page)) { await centrer(loc); await appuiLong(page, await pointPetite(loc)); } else { const p = await pointPetite(loc); await page.mouse.dblclick(p.x, p.y); }
  await expect(fenetrePetite(page)).toBeVisible();
}
/** Un point de l'herbe (3c-bis) : le centre d'une case du damier, visible, sous lequel il n'y a ni maison, ni îlot, ni bouton. */
async function pointHerbe(page) {
  return page.evaluate(async () => {
    const { centreBloc } = await import(new URL('js/os/village-damier.js', document.baseURI).href);
    const { iso } = await import(new URL('js/os/village-batiments.js', document.baseURI).href);
    const svg = document.querySelector('[data-role="village"]');
    for (let c = 0; c < 12; c++) {
      for (let l = 0; l < 12; l++) {
        const [x, y] = iso(...centreBloc(c, l, 1));
        const p = new DOMPoint(x, y).matrixTransform(svg.getScreenCTM());
        if (p.x < 20 || p.y < 20 || p.x > innerWidth - 20 || p.y > innerHeight - 20) continue;
        const sous = document.elementFromPoint(p.x, p.y);
        if (sous && svg.contains(sous) && !sous.closest('[data-maison], a, button')) return { x: p.x, y: p.y };
      }
    }
    return null;
  });
}
/** Le point à `part` (0 à 1) entre le centre de la case d'une petite maison et le coin gauche de sa case (au sol). */
async function pointVersCoinGauche(loc, part) {
  const [c, l] = await caseDe(loc);
  return loc.page().evaluate(async ([c0, l0, k]) => {
    const { losangeBloc } = await import(new URL('js/os/village-damier.js', document.baseURI).href);
    const svg = document.querySelector('[data-role="village"]');
    const coins = losangeBloc(c0, l0, 1);
    const cx = coins.reduce((s, [x]) => s + x, 0) / 4;
    const cy = coins.reduce((s, [, y]) => s + y, 0) / 4;
    const [gx, gy] = coins.reduce((a, b) => (b[0] < a[0] ? b : a));
    const p = new DOMPoint(cx + (gx - cx) * k, cy + (gy - cy) * k).matrixTransform(svg.getScreenCTM());
    return { x: p.x, y: p.y };
  }, [c, l, part]);
}
/** La maison (data-maison) sous un point de l'écran, lueurs sautées (comme groupeSous de js/os/village-glisser.js). */
const maisonAuPoint = (page, p) => page.evaluate(({ x, y }) => {
  for (const e of document.elementsFromPoint(x, y)) {
    if (e.closest('.village-halo')) continue;
    return e.closest('[data-maison]')?.dataset.maison ?? null;
  }
  return null;
}, p);
/** Touchers bruts (CDP) : appui, déplacements, relâché. */
async function doigt(page, points, { attente = 0 } = {}) {
  const cdp = await page.context().newCDPSession(page);
  const pt = (p) => [{ x: Math.round(p.x), y: Math.round(p.y), id: 1 }];
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pt(points[0]) });
  for (const p of points.slice(1)) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pt(p) }); await page.waitForTimeout(16); }
  if (attente) await page.waitForTimeout(attente);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await cdp.detach();
}
/** Attend que la lecture des chantiers soit retenue par le faux réseau (option `retenir`), puis la lâche avec `lacher`. */
const attendreRetenue = (page) => expect.poll(() => page.evaluate(() => window.__faux.attentes ?? 0)).toBe(1);
const lacher = (page) => page.evaluate(() => window.__faux.ouvrir());

/** Ajoute une petite maison par la fenêtre de la grande « Chantiers ». */
async function ajouterPetite(page, nom) {
  await ouvrirFenetreMaison(page, 'Chantiers');
  await fenetreMaison(page).getByRole('button', { name: 'Ajouter une petite maison' }).click();
  await expect(fenetreChoix(page)).toBeVisible();
  await fenetreChoix(page).getByRole('button', { name: new RegExp(nom) }).click();
  await expect(fenetreChoix(page)).toHaveCount(0);
}
/** Les erreurs de la page (console et exceptions), relevées pendant le test. */
function relever(page) {
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error') erreurs.push(m.text()); });
  return erreurs;
}

test.describe('accueil village : petites maisons « vue filtrée »', () => {
  test('4.1 « Ajouter une petite maison » : le choix d’un chantier pose une petite maison collée à sa grande, enregistrée, qui tient après rechargement', async ({ page }, info) => {
    const uid = await ouvrirApres(page);
    await expect(petites(page)).toHaveCount(1); // l'automatique de « Maison A » (en cours)
    await ajouterPetite(page, 'Atelier B');
    const nouvelle = page.locator(`[data-role="petite-maison"][data-auto="non"][data-parent="${PARENT}"]`);
    await expect(nouvelle).toHaveCount(1);
    await expect(nouvelle).toHaveAttribute('aria-label', 'Atelier B : CH-0002 · En préparation');
    const [c, l] = await caseDe(maison(page, 'Chantiers'));
    expect(voisines(c, l)).toContain(await nouvelle.getAttribute('data-case'));
    await expect.poll(async () => (await docsPetites(uid)).length).toBe(1); // C3 : seuls les documents p-… comptent (les grandes s'écrivent aussi, D10)
    const [d] = await docsPetites(uid);
    expect({ sorte: d.sorte, parent: d.parent, nom: d.nom, cible: d.cible }).toEqual({ sorte: 'petite', parent: PARENT, nom: 'Atelier B', cible: '#/achatschantiers/liste/c2' });
    await capturer(page, info, '4.1-petite-maison-ajoutee');
    await page.reload();
    await expect(page.locator('[data-role="petite-maison"][data-auto="non"]')).toHaveCount(1);
    await expect(page.locator('[data-role="petite-maison"][data-auto="non"]')).toHaveAttribute('data-case', await nouvelle.getAttribute('data-case'));
    // le même chantier ne s'ajoute pas deux fois : grisé, « Déjà dans ton village »
    await ouvrirFenetreMaison(page, 'Chantiers');
    await fenetreMaison(page).getByRole('button', { name: 'Ajouter une petite maison' }).click();
    const ligne = fenetreChoix(page).getByRole('button', { name: /Atelier B/ });
    await expect(ligne).toBeDisabled();
    await expect(ligne).toContainText('Déjà dans ton village');
    await expect(fenetreChoix(page).getByRole('button', { name: /Hangar C/ })).toBeEnabled();
    await expect(fenetreChoix(page)).toContainText('Choisis le chantier à suivre d’un clic dans ton village.');
    await capturer(page, info, '4.1-choix-deja-dans-le-village');
    // la fenêtre d'une maison sans module qui filtre n'a pas le bouton
    await page.keyboard.press('Escape');
    await expect(fenetreChoix(page)).toHaveCount(0);
    await ouvrirFenetreMaison(page, 'Factures');
    await expect(fenetreMaison(page).getByRole('button', { name: 'Ajouter une petite maison' })).toHaveCount(0);
  });

  test('4.2 un clic sur la petite maison ouvre ce chantier seul ; la croix de la pastille rend tous les chantiers', async ({ page }, info) => {
    await ouvrirApres(page, { avant: (uid) => semerPetite(uid, 'p-essai-1', '#/achatschantiers/liste/c2', 'Atelier B') });
    await expect(petite(page, 'Atelier B')).toBeVisible();
    await ouvrirPetite(page, petite(page, 'Atelier B'));
    await expect(page).toHaveURL(/#\/achatschantiers\/liste\/c2$/);
    await expect(page.getByRole('heading', { name: 'Chantiers', level: 1 })).toBeVisible();
    await expect(page.locator('[data-chantier]')).toHaveCount(1);
    await expect(page.locator('[data-chantier="c2"]')).toBeVisible();
    const pastille = page.locator('[data-role="pastille-chantier-seul"]');
    await expect(pastille).toContainText('Chantier : Atelier B');
    await capturer(page, info, '4.2-ce-chantier-seulement');
    await pastille.getByRole('button', { name: 'Voir tous les chantiers' }).click();
    await expect(page).toHaveURL(/#\/achatschantiers\/liste$/);
    await expect(page.locator('[data-chantier]')).toHaveCount(3);
    await expect(pastille).toHaveCount(0);
  });

  test('4.2 projets : une petite maison manuelle ouvre la fiche du projet', async ({ page }, info) => {
    const modules = [...ACHATS, 'affaires', 'projets'];
    await creerProjet('pr1', { titre: 'Projet essai' });
    await ouvrirApres(page, { besoins: [FACTURES, PROJETS], modules, avant: (uid) => semerPetite(uid, 'p-essai-2', '#/projets/projets/pr1', 'Projet essai', 'b-projets-projets') });
    await expect(petite(page, 'Projet essai')).toBeVisible();
    await expect(page.locator('[data-role="petite-maison"][data-auto="oui"]')).toHaveCount(0); // la manuelle du même projet remplace son automatique (3c-bis)
    await capturer(page, info, '4.2-projets-petite-maison');
    await ouvrirPetite(page, petite(page, 'Projet essai'));
    await expect(page).toHaveURL(/#\/projets\/projets\/pr1$/);
    await expect(page.getByRole('textbox', { name: 'Titre' }).filter({ visible: true }).first()).toHaveValue('Projet essai'); // la fiche du projet (son titre se modifie sur place)
    await capturer(page, info, '4.2-projets-fiche');
  });

  test('4.2 adresse d’un chantier inconnu : un état vide calme et « Voir tous les chantiers », sans erreur', async ({ page }, info) => {
    const erreurs = relever(page);
    await ouvrirApres(page);
    await page.evaluate(() => { location.hash = '#/achatschantiers/liste/zz'; });
    await expect(page.locator('[data-role="chantier-absent"]')).toContainText('Ce chantier n’est plus dans la liste.');
    await capturer(page, info, '4.2-chantier-inconnu');
    await page.locator('[data-role="chantier-absent"]').getByRole('link', { name: 'Voir tous les chantiers' }).click();
    await expect(page).toHaveURL(/#\/achatschantiers\/liste$/);
    await expect(page.locator('[data-chantier]')).toHaveCount(3);
    expect(erreurs).toEqual([]);
  });

  test('4.3 glisser la grande maison : ses petites la suivent, puis se recalculent autour de sa nouvelle place ; rien n’est réécrit', async ({ page }, info) => {
    const uid = await ouvrirApres(page, { avant: (u) => semerPetite(u, 'p-essai-3', '#/achatschantiers/liste/c2', 'Atelier B') });
    await expect(petites(page)).toHaveCount(2); // la manuelle (Atelier B) et l'automatique (Maison A)
    const avant = (await docsPetites(uid))[0].modifieLe;
    if (estTelephone(page)) {
      await centrer(maison(page, 'Chantiers'));
      await glisserAuDoigt(page, await pointMaison(page, 'Chantiers'), await pointBloc(page, 6, 6, 2, 24));
    } else {
      await glisser(page, 'Chantiers', { c: 6, l: 6 }, { relacher: false });
      for (const p of await petites(page).all()) expect(await p.getAttribute('transform')).toMatch(/^translate\(/);
      await capturer(page, info, '4.3-petites-pendant-le-glisser');
      await page.mouse.up();
    }
    await expect(maison(page, 'Chantiers')).toHaveAttribute('data-case', '6-6'); // damier 12 x 12 (27/11/2026) : places d'office décalées de 2, la case libre visée passe de 4-4 à 6-6
    const autour = voisines(6, 6);
    await expect.poll(async () => (await petites(page).evaluateAll((els) => els.map((e) => e.dataset.case))).every((k) => autour.includes(k))).toBe(true);
    await capturer(page, info, '4.3-petites-apres-le-depot');
    await expect.poll(async () => (await listerDocuments(`village_utilisateurs/${uid}/batiments`)).find((d) => d.id === PARENT)?.c).toBe(6);
    await page.reload();
    await expect(petites(page)).toHaveCount(2);
    for (const k of await petites(page).evaluateAll((els) => els.map((e) => e.dataset.case))) expect(autour).toContain(k);
    const docs = await docsPetites(uid);
    expect(docs).toHaveLength(1);
    expect(JSON.stringify(docs[0].modifieLe)).toBe(JSON.stringify(avant)); // la petite n'est jamais réécrite : sa place se recalcule
  });

  test('4.4 un chantier en cours a sa petite maison automatique à côté de « Chantiers », sans rien écrire ; sa bulle le dit ; sa fenêtre n’a que « Cacher du village »', async ({ page }, info) => {
    const uid = await ouvrirApres(page);
    const auto = page.locator('[data-role="petite-maison"][data-auto="oui"]');
    await expect(auto).toHaveCount(1);
    await expect(auto).toHaveAttribute('aria-label', 'Maison A : CH-0001 · En cours');
    await expect(auto).toHaveAttribute('data-parent', PARENT);
    const [c, l] = await caseDe(maison(page, 'Chantiers'));
    expect(voisines(c, l)).toContain(await auto.getAttribute('data-case'));
    expect(await docsPetites(uid)).toEqual([]);
    if (estTelephone(page)) {
      await centrer(auto);
      const p = await pointPetite(auto);
      await page.mouse.click(p.x, p.y);
      await expect(bulle(page)).toContainText('Touche encore pour voir ce chantier seulement');
    } else {
      const p = await pointPetite(auto);
      await page.mouse.move(p.x, p.y);
      await expect(bulle(page)).toContainText('Clique pour voir ce chantier seulement');
    }
    await expect(bulle(page)).toContainText('Maison A');
    await expect(bulle(page)).toContainText(estTelephone(page) ? 'Appui long pour la cacher' : 'Double clic pour la cacher'); // 3c-bis (S8)
    await capturer(page, info, '4.4-petite-automatique');
    // 3c-bis : la fenêtre d'une automatique n'a que « Cacher du village » (aucun champ Nom)
    await ouvrirFenetrePetite(page, auto);
    await expect(fenetrePetite(page).getByRole('button', { name: 'Cacher du village' })).toBeVisible();
    await expect(fenetrePetite(page).getByRole('textbox', { name: 'Nom' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(fenetrePetite(page)).toHaveCount(0);
    expect(await docsPetites(uid)).toEqual([]);
  });

  test('4.4 six petites maisons autour d’une grande : rien ne se recouvre, ni l’étiquette ni la roue', async ({ page }, info) => {
    const huit = Array.from({ length: 8 }, (_, i) => ({ ...CHANTIERS_ESSAI[0], id: `e${i}`, nom: `Essai ${i + 1}`, code: `CH-10${i}` }));
    await ouvrirApres(page, { reseau: { chantiers: huit } });
    await expect(petites(page)).toHaveCount(6);
    await lues(page);
    const etiquette = await page.locator('[data-role="etiquette"][data-maison="b-achatschantiers-liste"]').boundingBox();
    expect(etiquette).not.toBeNull();
    await capturer(page, info, '4.4-six-petites-maisons');
    // relecture Fable B1 : les lueurs se recouvrent ; CHAQUE petite se clique (ou se touche) à son point et ouvre SON chantier
    const ids = await petites(page).evaluateAll((els) => els.map((e) => e.dataset.maison));
    expect(ids).toHaveLength(6);
    for (const id of ids) {
      const loc = page.locator(`[data-role="petite-maison"][data-maison="${id}"]`);
      const cible = await loc.getAttribute('data-cible');
      const nom = (await loc.getAttribute('aria-label')).split(' : ')[0];
      if (estTelephone(page)) await centrer(loc);
      const p = await pointPetite(loc);
      if (estTelephone(page)) {
        await page.mouse.click(p.x, p.y); // premier toucher : la bulle de CETTE petite
        await expect(bulle(page)).toContainText(nom);
      } else {
        await page.mouse.move(p.x, p.y); // survol : la bulle de CETTE petite
        await expect(bulle(page)).toContainText(nom);
      }
      await page.mouse.click(p.x, p.y);
      await expect.poll(() => page.evaluate(() => location.hash)).toBe(cible); // …/liste/<son id>
      await page.evaluate(() => { location.hash = '#/accueil'; });
      await expect(petites(page)).toHaveCount(6);
      await lues(page);
    }
  });

  test('4.4 la grande maison se clique et se glisse près d’une petite de devant (les lueurs ne prennent pas le pointeur)', async ({ page }, info) => {
    const huit = Array.from({ length: 8 }, (_, i) => ({ ...CHANTIERS_ESSAI[0], id: `e${i}`, nom: `Essai ${i + 1}`, code: `CH-10${i}` }));
    await ouvrirApres(page, { reseau: { chantiers: huit } });
    await expect(petites(page)).toHaveCount(6);
    await lues(page);
    const [c, l] = await caseDe(maison(page, 'Chantiers'));
    if (estTelephone(page)) await centrer(maison(page, 'Chantiers'));
    // le bas du corps de la grande, au-dessus de ses petites de devant
    const bas = await pointBloc(page, c, l, 2, 8);
    const sous = await page.evaluate(({ x, y }) => document.elementFromPoint(x, y)?.closest('[data-maison]')?.dataset.maison ?? null, bas);
    expect(sous).toBe(PARENT);
    await page.mouse.click(bas.x, bas.y);
    if (estTelephone(page)) {
      await expect(bulle(page)).toContainText('Chantiers');
      await page.mouse.click(bas.x, bas.y);
    }
    await expect(page).toHaveURL(/#\/achatschantiers\/liste$/);
    await page.evaluate(() => { location.hash = '#/accueil'; });
    await expect(petites(page)).toHaveCount(6);
    await lues(page);
    if (estTelephone(page)) await centrer(maison(page, 'Chantiers'));
    const depart = await pointBloc(page, c, l, 2, 8);
    const arrivee = await pointBloc(page, 6, 6, 2, 8);
    if (estTelephone(page)) await glisserAuDoigt(page, depart, arrivee);
    else {
      await page.mouse.move(depart.x, depart.y);
      await page.mouse.down();
      for (let i = 1; i <= 8; i++) await page.mouse.move(depart.x + ((arrivee.x - depart.x) * i) / 8, depart.y + ((arrivee.y - depart.y) * i) / 8);
      await page.mouse.up();
    }
    await expect(maison(page, 'Chantiers')).toHaveAttribute('data-case', '6-6');
    await capturer(page, info, '4.4-grande-glissee-pres-des-petites');
  });

  test('3cb.3 plus de plafond par personne : 12 au plus autour d’une grande (la 13e est refusée faute de place) ; une 13e sous une autre grande est acceptée', async ({ page }, info) => {
    const treize = Array.from({ length: 13 }, (_, i) => ({ ...CHANTIERS_ESSAI[1], id: `j${i}`, nom: `Lot ${i + 1}`, code: `CH-2${String(i).padStart(2, '0')}` }));
    await creerProjet('pr1', { titre: 'Projet essai' });
    const uid = await ouvrirApres(page, {
      besoins: [FACTURES, CHANTIERS, PROJETS], modules: [...ACHATS, 'affaires', 'projets'],
      reseau: { chantiers: treize },
      avant: async (u) => { for (let i = 0; i < 12; i++) await semerPetite(u, `p-lot-${String(i).padStart(2, '0')}`, `#/achatschantiers/liste/j${i}`, `Lot ${i + 1}`); },
    });
    await lues(page);
    await ouvrirFenetreMaison(page, 'Chantiers');
    await fenetreMaison(page).getByRole('button', { name: 'Ajouter une petite maison' }).click();
    await fenetreChoix(page).getByRole('button', { name: /Lot 13/ }).click();
    await expect(fenetreChoix(page).locator('[data-role="erreur-petite"]')).toHaveText('Plus de place autour de cette maison : déplace-la ou retire une petite maison.');
    expect(await docsPetites(uid)).toHaveLength(12);
    await page.keyboard.press('Escape');
    await expect(fenetreChoix(page)).toHaveCount(0);
    // sous « Projets » : acceptée (plus de plafond de 12 par personne)
    await ouvrirFenetreMaison(page, 'Projets');
    await fenetreMaison(page).getByRole('button', { name: 'Ajouter une petite maison' }).click();
    await fenetreChoix(page).getByRole('button', { name: /Projet essai/ }).click();
    await expect(fenetreChoix(page)).toHaveCount(0);
    await expect.poll(async () => (await docsPetites(uid)).length).toBe(13);
    await expect(page.locator('[data-role="petite-maison"][data-auto="non"][data-parent="b-projets-projets"]')).toHaveCount(1);
    await capturer(page, info, '3cb.3-treizieme');
  });

  test('4.5 un chantier terminé perd sa petite maison automatique ; la manuelle reste', async ({ page }, info) => {
    await ouvrirApres(page, { avant: (uid) => semerPetite(uid, 'p-essai-5', '#/achatschantiers/liste/c1', 'Maison A') });
    await expect(page.locator('[data-role="petite-maison"][data-auto="non"]')).toHaveCount(1);
    await expect(page.locator('[data-role="petite-maison"][data-auto="oui"]')).toHaveCount(0); // pas de doublon manuelle / automatique
    await page.evaluate(() => { window.__faux.chantiers.find((c) => c.id === 'c1').statut = 'termine'; location.hash = '#/reglages'; });
    await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible();
    await page.evaluate(() => { location.hash = '#/accueil'; });
    await expect(page.locator('[data-role="village"]')).toBeVisible();
    await expect(page.locator('[data-role="petite-maison"][data-auto="non"]')).toHaveCount(1);
    await expect(page.locator('[data-role="petite-maison"][data-auto="oui"]')).toHaveCount(0);
    await expect(petite(page, 'Maison A')).toHaveAttribute('aria-label', 'Maison A : CH-0001 · Terminé');
    await capturer(page, info, '4.5-manuelle-gardee');
  });

  test('4.5 variante : l’automatique seule disparaît quand son chantier est terminé', async ({ page }) => {
    await ouvrirApres(page);
    await expect(page.locator('[data-role="petite-maison"][data-auto="oui"]')).toHaveCount(1);
    await page.evaluate(() => { window.__faux.chantiers.find((c) => c.id === 'c1').statut = 'termine'; location.hash = '#/reglages'; });
    await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible();
    await page.evaluate(() => { location.hash = '#/accueil'; });
    await expect(maison(page, 'Chantiers')).toBeVisible();
    await lues(page);
    await expect(petites(page)).toHaveCount(0);
  });

  test('4.6 l’élément d’une petite maison a disparu : elle n’est pas montrée, sans message ni erreur, et son document reste', async ({ page }, info) => {
    const erreurs = relever(page);
    const uid = await ouvrirApres(page, { avant: (u) => semerPetite(u, 'p-essai-6', '#/achatschantiers/liste/c9', 'Disparu') });
    await expect(page.locator('[data-role="petite-maison"][data-auto="oui"]')).toHaveCount(1); // la lecture est arrivée
    await expect(page.locator('[data-role="petite-maison"][data-auto="non"]')).toHaveCount(0);
    await expect(page.locator('[data-role="village-bandeau"]')).toBeHidden();
    await expect(page.locator('.toast')).toHaveCount(0);
    expect((await docsPetites(uid)).map((d) => d.id)).toEqual(['p-essai-6']);
    expect(erreurs).toEqual([]);
    await capturer(page, info, '4.6-element-disparu');
  });

  test('pannes lecture des chantiers en panne : aucune automatique, les manuelles restent, aucun message', async ({ page }, info) => {
    await ouvrirApres(page, {
      avant: async (uid) => {
        await semerPetite(uid, 'p-essai-7', '#/achatschantiers/liste/c2', 'Atelier B');
        await page.evaluate(() => { window.__chevalierTest.pannesPetites = { lecture: 1 }; });
      },
    });
    await expect(page.locator('[data-role="petite-maison"][data-auto="non"]')).toHaveCount(1);
    await lues(page);
    await expect(page.locator('[data-role="petite-maison"][data-auto="oui"]')).toHaveCount(0);
    await expect(page.locator('[data-role="village-bandeau"]')).toBeHidden();
    await capturer(page, info, 'pannes-lecture-en-panne');
  });

  test('pannes la base des chantiers répond en erreur : même chose ; la fenêtre de choix propose « Réessayer »', async ({ page }, info) => {
    await ouvrirApres(page, { reseau: { lectureEnPanne: true }, avant: (uid) => semerPetite(uid, 'p-essai-8', '#/achatschantiers/liste/c2', 'Atelier B') });
    await expect(page.locator('[data-role="petite-maison"][data-auto="non"]')).toHaveCount(1);
    await expect(page.locator('[data-role="petite-maison"][data-auto="oui"]')).toHaveCount(0);
    await ouvrirFenetreMaison(page, 'Chantiers');
    await fenetreMaison(page).getByRole('button', { name: 'Ajouter une petite maison' }).click();
    await expect(fenetreChoix(page)).toContainText('Les chantiers n’ont pas pu être lus. Réessaie.');
    await expect(fenetreChoix(page).getByRole('button', { name: 'Réessayer' })).toBeVisible();
    await capturer(page, info, 'pannes-choix-reessayer');
  });

  test('module seul sans maison Chantiers : aucune lecture des chantiers, aucune petite maison', async ({ page }) => {
    await ouvrirApres(page, { besoins: [FACTURES] });
    await expect(maison(page, 'Factures')).toBeVisible();
    await lues(page);
    await expect(petites(page)).toHaveCount(0);
    expect((await page.evaluate(() => window.__appels)).filter((a) => a.chemin === '/rest/v1/chantiers')).toEqual([]);
  });

  test('module seul : maison Chantiers dans les besoins mais module Chantiers éteint : aucune lecture, aucune petite maison', async ({ page }) => {
    await ouvrirApres(page, { besoins: [FACTURES, CHANTIERS], modules: ACHATS.filter((m) => m !== 'achatschantiers') });
    await expect(maison(page, 'Factures')).toBeVisible();
    await lues(page);
    await expect(petites(page)).toHaveCount(0);
    expect((await page.evaluate(() => window.__appels)).filter((a) => a.chemin === '/rest/v1/chantiers')).toEqual([]);
  });

  test('4.1 13 réglages d’une petite maison : renommer, retirer (confirmation), puis « Annuler » la remet', async ({ page }, info) => {
    const uid = await ouvrirApres(page, { avant: (u) => semerPetite(u, 'p-essai-9', '#/achatschantiers/liste/c2', 'Atelier B') });
    const loc = page.locator('[data-role="petite-maison"][data-auto="non"]');
    await expect(loc).toHaveCount(1);
    if (estTelephone(page)) { await centrer(loc); await appuiLong(page, await pointPetite(loc)); } else { const p = await pointPetite(loc); await page.mouse.dblclick(p.x, p.y); }
    await expect(fenetrePetite(page)).toBeVisible();
    await capturer(page, info, '4.1-fenetre-petite-maison');
    await fenetrePetite(page).getByRole('textbox', { name: 'Nom' }).fill('Mon atelier');
    await fenetrePetite(page).getByRole('button', { name: 'Enregistrer' }).click();
    await expect(fenetrePetite(page)).toHaveCount(0);
    await expect(petite(page, 'Mon atelier')).toHaveCount(1);
    await expect.poll(async () => (await docsPetites(uid))[0]?.nom).toBe('Mon atelier');
    // nom vide : le nom du chantier revient
    if (estTelephone(page)) { await centrer(loc); await appuiLong(page, await pointPetite(loc)); } else { const p = await pointPetite(loc); await page.mouse.dblclick(p.x, p.y); }
    await fenetrePetite(page).getByRole('textbox', { name: 'Nom' }).fill('');
    await fenetrePetite(page).getByRole('button', { name: 'Enregistrer' }).click();
    await expect.poll(async () => (await docsPetites(uid))[0]?.nom).toBe('Atelier B');
    // retirer, puis annuler
    if (estTelephone(page)) { await centrer(loc); await appuiLong(page, await pointPetite(loc)); } else { const p = await pointPetite(loc); await page.mouse.dblclick(p.x, p.y); }
    await fenetrePetite(page).getByRole('button', { name: 'Retirer du village' }).click();
    await page.getByRole('dialog', { name: 'Retirer cette petite maison ?' }).getByRole('button', { name: 'Retirer' }).click();
    await expect(loc).toHaveCount(0);
    await expect.poll(async () => (await docsPetites(uid)).length).toBe(0);
    await page.locator('[data-action="toast-action"]').filter({ hasText: 'Annuler' }).click();
    await expect(loc).toHaveCount(1);
    await expect.poll(async () => (await docsPetites(uid)).map((d) => d.id)).toEqual(['p-essai-9']);
  });

  test('2.12 aucun « CRM » dans le village, la fenêtre de choix ni la fenêtre d’une petite maison', async ({ page }, info) => {
    await ouvrirApres(page, { avant: (uid) => semerPetite(uid, 'p-essai-10', '#/achatschantiers/liste/c2', 'Atelier B') });
    await expect(petites(page)).toHaveCount(2);
    await expect(page.locator('[data-role="page-village"]')).not.toContainText('CRM');
    await ouvrirFenetreMaison(page, 'Chantiers');
    await fenetreMaison(page).getByRole('button', { name: 'Ajouter une petite maison' }).click();
    await expect(fenetreChoix(page).getByRole('button', { name: /Hangar C/ })).toBeVisible();
    await expect(fenetreChoix(page)).not.toContainText('CRM');
    await page.keyboard.press('Escape');
    const loc = page.locator('[data-role="petite-maison"][data-auto="non"]');
    if (estTelephone(page)) { await centrer(loc); await appuiLong(page, await pointPetite(loc)); } else { const p = await pointPetite(loc); await page.mouse.dblclick(p.x, p.y); }
    await expect(fenetrePetite(page)).not.toContainText('CRM');
    await page.keyboard.press('Escape');
    if (estTelephone(page)) {
      await page.locator('[data-role="vue-liste"]').click();
      const liste = page.locator('[data-role="liste-petite"]');
      await expect(liste).toHaveCount(2);
      await expect(page.locator('[data-role="liste-maisons"]')).not.toContainText('CRM');
      await capturer(page, info, '2.12-liste-avec-petites');
      await page.locator('[data-role="vue-liste"]').click(); // l'appareil garde le choix : on revient au village
    }
  });

  // ---------------------------------------------------------------- 3c-bis (27/11/2026)
  const HUIT = Array.from({ length: 8 }, (_, i) => ({ ...CHANTIERS_ESSAI[0], id: `e${i}`, nom: `Essai ${i + 1}`, code: `CH-10${i}` }));

  test('3cb.1 un projet actif a sa petite maison automatique à côté de « Projets », sans rien écrire ; elle part quand le projet est terminé', async ({ page }, info) => {
    await creerProjet('pr1', { titre: 'Projet essai' });
    await creerProjet('pr2', { titre: 'Projet fini', statut: 'termine', archive: true });
    const uid = await ouvrirApres(page, { besoins: [FACTURES, PROJETS], modules: [...ACHATS, 'affaires', 'projets'] });
    const auto = page.locator('[data-role="petite-maison"][data-auto="oui"]');
    await expect(auto).toHaveCount(1);
    await expect(auto).toHaveAttribute('aria-label', 'Projet essai : Actif');
    await expect(auto).toHaveAttribute('data-parent', 'b-projets-projets');
    const [c, l] = await caseDe(maison(page, 'Projets'));
    expect(voisines(c, l)).toContain(await auto.getAttribute('data-case'));
    await lues(page);
    expect(await docsPetites(uid)).toEqual([]);
    await capturer(page, info, '3cb.1-projet-automatique');
    await ouvrirPetite(page, auto);
    await expect(page).toHaveURL(/#\/projets\/projets\/pr1$/);
    await creerProjet('pr1', { titre: 'Projet essai', statut: 'termine', archive: true });
    await expect(async () => { // l'état des projets en mémoire peut être encore l'ancien : on refait l'aller-retour (relecture Fable R6)
      await page.evaluate(() => { location.hash = '#/reglages'; });
      await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible();
      await page.evaluate(() => { location.hash = '#/accueil'; });
      await expect(maison(page, 'Projets')).toBeVisible();
      await lues(page);
      await expect(petites(page)).toHaveCount(0, { timeout: 1000 });
    }).toPass({ timeout: 15000 });
  });

  test('3cb.2 cacher une petite maison automatique (fenêtre, confirmation, « Annuler ») ; la 7e apparaît ; la roue la liste et « Remontrer » la remet', async ({ page }, info) => {
    const uid = await ouvrirApres(page, { reseau: { chantiers: HUIT } });
    await expect(petites(page)).toHaveCount(6);
    await lues(page);
    await ouvrirFenetrePetite(page, petite(page, 'Essai 1'));
    await expect(fenetrePetite(page).getByRole('button', { name: 'Cacher du village' })).toBeVisible();
    await expect(fenetrePetite(page).getByRole('textbox', { name: 'Nom' })).toHaveCount(0);
    await expect(fenetrePetite(page)).toContainText('Elle vient toute seule : ce chantier est en cours.');
    await capturer(page, info, '3cb.2-fenetre');
    await fenetrePetite(page).getByRole('button', { name: 'Cacher du village' }).click();
    const confirmation = page.getByRole('dialog', { name: 'Cacher cette petite maison ?' });
    await expect(confirmation).toContainText('La petite maison « Essai 1 » quitte ton village. Tu peux la remontrer avec la roue dentée.');
    await confirmation.getByRole('button', { name: 'Cacher' }).click();
    await expect(page.locator('.toast').filter({ hasText: 'Petite maison cachée' })).toBeVisible();
    await expect(petite(page, 'Essai 1')).toHaveCount(0);
    await expect(petite(page, 'Essai 7')).toHaveCount(1);
    await expect(petites(page)).toHaveCount(6);
    await expect.poll(async () => (await docsPetites(uid)).map((d) => ({ cachee: d.cachee, cible: d.cible }))).toEqual([{ cachee: true, cible: '#/achatschantiers/liste/e0' }]);
    await page.reload();
    await expect(maison(page, 'Chantiers')).toBeVisible();
    await lues(page);
    await expect(petites(page)).toHaveCount(6);
    await expect(petite(page, 'Essai 1')).toHaveCount(0);
    // la roue : « Petites maisons cachées »
    await page.locator('[data-role="reglages-accueil"]').click();
    const roue = page.getByRole('dialog', { name: 'Réglages de l’accueil' });
    const bloc = roue.locator('[data-role="petites-cachees"]');
    await expect(bloc).toContainText('Petites maisons cachées');
    await expect(bloc).toContainText('Essai 1');
    await bloc.scrollIntoViewIfNeeded();
    await capturer(page, info, '3cb.2-roue');
    const remontrer = bloc.getByRole('button', { name: 'Remontrer Essai 1' });
    const boite = await remontrer.boundingBox();
    if (estTelephone(page)) expect(boite.height).toBeGreaterThanOrEqual(44);
    await remontrer.click();
    await expect(roue.locator('[data-role="petites-cachees"]')).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(roue).toHaveCount(0);
    await expect(petite(page, 'Essai 1')).toHaveCount(1);
    await expect.poll(async () => (await docsPetites(uid)).length).toBe(0);
    // seconde passe : cacher, puis « Annuler » du toast
    await lues(page);
    await ouvrirFenetrePetite(page, petite(page, 'Essai 1'));
    await fenetrePetite(page).getByRole('button', { name: 'Cacher du village' }).click();
    await page.getByRole('dialog', { name: 'Cacher cette petite maison ?' }).getByRole('button', { name: 'Cacher' }).click();
    await expect(petite(page, 'Essai 1')).toHaveCount(0);
    await expect.poll(async () => (await docsPetites(uid)).length).toBe(1);
    await page.locator('.toast').filter({ hasText: 'Petite maison cachée' }).last().locator('[data-action="toast-action"]').click();
    await expect(petite(page, 'Essai 1')).toHaveCount(1);
    await expect.poll(async () => (await docsPetites(uid)).length).toBe(0);
  });

  test('3cb.2 erreurs 50 petites maisons cachées au plus : la 51e est refusée avec sa phrase, rien n’est écrit', async ({ page }) => {
    const uid = await ouvrirApres(page, {
      avant: async (u) => {
        for (let i = 0; i < 50; i++) {
          await ecrireDocument(`village_utilisateurs/${u}/batiments/p-cache-${String(i).padStart(2, '0')}`, { sorte: 'petite', parent: PARENT, nom: `Ancien ${i + 1}`, cible: `#/achatschantiers/liste/x${i}`, cachee: true });
        }
      },
    });
    const auto = page.locator('[data-role="petite-maison"][data-auto="oui"]');
    await expect(auto).toHaveCount(1);
    await lues(page);
    await ouvrirFenetrePetite(page, auto);
    await fenetrePetite(page).getByRole('button', { name: 'Cacher du village' }).click();
    await page.getByRole('dialog', { name: 'Cacher cette petite maison ?' }).getByRole('button', { name: 'Cacher' }).click();
    await expect(fenetrePetite(page).locator('[data-role="erreur-petite-maison"]')).toHaveText('50 petites maisons cachées au plus : remontre-en une avec la roue dentée.');
    expect(await docsPetites(uid)).toHaveLength(50);
    await expect(auto).toHaveCount(1);
  });

  test('3cb.4a le bord de la case d’une petite maison la prend (prise transparente, pas une lueur)', async ({ page }, info) => {
    await ouvrirApres(page);
    const auto = page.locator('[data-role="petite-maison"][data-auto="oui"]');
    await expect(auto).toHaveCount(1);
    await lues(page);
    if (estTelephone(page)) await centrer(auto);
    const id = await auto.getAttribute('data-maison');
    const p = await pointVersCoinGauche(auto, 0.9);
    expect(await maisonAuPoint(page, p)).toBe(id);
    await expect(auto.locator('[data-role="prise-petite"]')).toHaveAttribute('fill', 'transparent');
    await capturer(page, info, '3cb.4a-bord-de-case');
    await page.mouse.click(p.x, p.y);
    if (estTelephone(page)) {
      await expect(bulle(page)).toHaveAttribute('data-maison', id);
      await page.mouse.click(p.x, p.y);
    }
    await expect(page).toHaveURL(/#\/achatschantiers\/liste\/c1$/);
  });

  test('3cb.4b une petite maison bougée puis ramenée et relâchée n’ouvre rien et ne bouge pas', async ({ page }) => {
    await ouvrirApres(page);
    const auto = page.locator('[data-role="petite-maison"][data-auto="oui"]');
    await expect(auto).toHaveCount(1);
    await lues(page);
    if (estTelephone(page)) await centrer(auto);
    const avant = await auto.getAttribute('data-case');
    const p = await pointPetite(auto);
    if (estTelephone(page)) {
      // preuve par l'ordinateur pour le geste tenu ; ici : ni navigation, ni fenêtre, ni déplacement (vrai doigt non vérifié)
      await doigt(page, [p, { x: p.x + 5, y: p.y }, { x: p.x + 10, y: p.y }, { x: p.x + 15, y: p.y }, p], { attente: 800 });
    } else {
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      await page.mouse.move(p.x + 15, p.y, { steps: 3 });
      await page.mouse.move(p.x, p.y);
      await page.waitForTimeout(800);
      // appui tenu après le seuil : rien ne s'est ouvert ; la preuve discriminante vient au relâché (avant 3c-bis, son clic ouvrait le chantier)
      expect(await page.evaluate(() => location.hash)).toBe('#/accueil');
      await page.mouse.up();
    }
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => location.hash)).toBe('#/accueil');
    await expect(auto).toHaveAttribute('data-case', avant);
    await expect(page.locator('[data-role="cible-rangement"]')).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test('3cb.4c téléphone : des petites maisons arrivées sous une bulle ouverte apparaissent quand la bulle se ferme ; ordinateur : tout de suite', async ({ page }, info) => {
    await ouvrirApres(page, { reseau: { retenir: true } });
    await expect(maison(page, 'Factures')).toBeVisible();
    await attendreRetenue(page);
    if (estTelephone(page)) {
      await centrer(maison(page, 'Factures'));
      const p = await pointMaison(page, 'Factures');
      await page.mouse.click(p.x, p.y);
      await expect(bulle(page)).toBeVisible();
      await lacher(page);
      await page.waitForTimeout(1000);
      await expect(petites(page)).toHaveCount(0);
      await expect(bulle(page)).toBeVisible();
      await expect(page.locator('[data-role="page-village"]')).toHaveAttribute('data-petites-lues', 'non');
      const herbe = await pointHerbe(page);
      expect(herbe).not.toBeNull();
      await page.mouse.click(herbe.x, herbe.y);
      await expect(bulle(page)).toBeHidden();
    } else {
      const p = await pointMaison(page, 'Factures');
      await page.mouse.move(p.x, p.y);
      await expect(bulle(page)).toBeVisible();
      await lacher(page);
    }
    await expect(page.locator('[data-role="petite-maison"][data-auto="oui"]')).toHaveCount(1, { timeout: 2000 });
    await lues(page);
    await capturer(page, info, '3cb.4c-apres-bulle');
  });

  test('3cb.4d une petite maison relâchée hors du dessin termine son geste : la grande se glisse ensuite', async ({ page }) => {
    await ouvrirApres(page);
    const auto = page.locator('[data-role="petite-maison"][data-auto="oui"]');
    await expect(auto).toHaveCount(1);
    await lues(page);
    const roue = await page.locator('[data-role="reglages-accueil"]').boundingBox();
    const versRoue = { x: roue.x + roue.width / 2, y: roue.y + roue.height / 2 };
    if (estTelephone(page)) {
      await centrer(auto);
      await glisserAuDoigt(page, await pointPetite(auto), versRoue); // preuve par l'ordinateur ; vrai doigt non vérifié
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await centrer(maison(page, 'Chantiers'));
      await glisserAuDoigt(page, await pointMaison(page, 'Chantiers'), await pointBloc(page, 6, 6, 2, 24));
    } else {
      const p = await pointPetite(auto);
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      await page.mouse.move(versRoue.x, versRoue.y, { steps: 8 });
      await page.mouse.up();
      await expect(page.getByRole('dialog')).toHaveCount(0);
      await glisser(page, 'Chantiers', { c: 6, l: 6 });
    }
    await expect(maison(page, 'Chantiers')).toHaveAttribute('data-case', '6-6');
  });

  test('3cb.4e C1 un clic sur une grande pendant que les petites maisons arrivent ouvre bien sa page, sans erreur', async ({ page }) => {
    const erreurs = relever(page);
    await ouvrirApres(page, { reseau: { retenir: true } });
    await expect(maison(page, 'Chantiers')).toBeVisible();
    await attendreRetenue(page);
    if (estTelephone(page)) await centrer(maison(page, 'Chantiers'));
    const p = await pointMaison(page, 'Chantiers');
    await page.mouse.click(p.x, p.y);
    await lacher(page);
    if (estTelephone(page)) {
      await expect(bulle(page)).toContainText('Chantiers');
      await page.mouse.click(p.x, p.y);
    }
    await expect(page).toHaveURL(/#\/achatschantiers\/liste$/);
    expect(erreurs).toEqual([]);
  });

  test('3cb.4e C2 glisser une petite maison ne l’ouvre pas et ne la déplace pas', async ({ page }) => {
    await ouvrirApres(page);
    const auto = page.locator('[data-role="petite-maison"][data-auto="oui"]');
    await expect(auto).toHaveCount(1);
    await lues(page);
    if (estTelephone(page)) await centrer(auto);
    const avant = await auto.getAttribute('data-case');
    const p = await pointPetite(auto);
    if (estTelephone(page)) await glisserAuDoigt(page, p, { x: p.x + 60, y: p.y }, { pas: 8 });
    else {
      await page.mouse.move(p.x, p.y);
      await page.mouse.down();
      await page.mouse.move(p.x + 60, p.y, { steps: 8 });
      await page.mouse.up();
    }
    await page.waitForTimeout(500);
    expect(await page.evaluate(() => location.hash)).toBe('#/accueil');
    await expect(auto).toHaveAttribute('data-case', avant);
    await expect(page.locator('[data-role="page-village"]')).toHaveAttribute('data-rangement', 'non');
  });

  test('3cb.4e C3 la fenêtre de choix réutilise la lecture en cours : une seule lecture des chantiers', async ({ page }) => {
    await ouvrirApres(page, { reseau: { retenir: true } });
    await expect(maison(page, 'Chantiers')).toBeVisible();
    await attendreRetenue(page);
    await ouvrirFenetreMaison(page, 'Chantiers');
    await fenetreMaison(page).getByRole('button', { name: 'Ajouter une petite maison' }).click();
    await expect(fenetreChoix(page)).toContainText('Lecture en cours…');
    await lacher(page);
    await expect(fenetreChoix(page).getByRole('button', { name: /Atelier B/ })).toBeVisible();
    expect((await page.evaluate(() => window.__appels)).filter((a) => a.chemin === '/rest/v1/chantiers')).toHaveLength(1);
  });
});
