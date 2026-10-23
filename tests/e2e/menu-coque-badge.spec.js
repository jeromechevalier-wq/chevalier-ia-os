// Pastille rouge « à valider » sur l'entrée « Automatisations » du menu (22/10/2026), dans le navigateur, sur les émulateurs.
// Le module la DÉCLARE (registre.js, champ `badge`) et fournit l'écoute (`ecouterBadge`) ; la coque la rend sans connaître le module (shell.js).
// Un test par point du brief (le nom commence par le numéro) ; 3 captures dans tests/e2e/captures/menu-badge/ ; données fictives (prénom Alex).
//  1 un module sans badge ne change pas · 2 pastille ronde rouge, nombre, « 9+ », invisible à 0, texte alternatif, menu replié, téléphone
//  3 compte en direct, périmées non comptées, lecteur, lecture refusée · 4 nombre dans l'onglet « À valider »
//  5 arrivée au clic (À valider si > 0, sinon Historique ; signet vers l'Historique inchangé) · 6 chez un client sans le module : rien.
// Les tests qui ouvrent l'Historique se connectent comme l'assistant (non administrateur) : l'écran n'appelle alors pas la fonction serveur des clients (comme menu-coque-modules.spec.js).
// Cas vide : aucune proposition = pas de pastille (2a). Cas d'erreur : lecture refusée = pas de pastille, pas de message, menu intact (3d).
import { mkdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, ecrireDocument, estTelephone, JEROME, CHARLES, PROJET, FIRESTORE, URL_APP } from './outils.js';

const ALICE = 'alice@exemple.test';
const LEA = 'lea@exemple.test';
const MIN = 60000;
const JOUR = 24 * 60 * MIN;
const CAPTURES = 'e2e/captures/menu-badge';
async function capture(page, nom) {
  await mkdir(CAPTURES, { recursive: true });
  await page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
}

async function chargerRegles(fichier, retouche = (t) => t) {
  const contenu = retouche(await readFile(fileURLToPath(new URL(`../../${fichier}`, import.meta.url)), 'utf8'));
  const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: fichier, content: contenu }] } }),
  });
  if (!r.ok) throw new Error(`Règles non chargées (${fichier}) : ${await r.text()}`);
}
// Cas d'erreur de lecture : la copie des règles chargée dans l'émulateur refuse la lecture de cette collection (les fichiers du dépôt ne sont pas touchés).
const REFUSER_PROPOSITIONS = (t) => {
  const bloc = "match /automatisations_propositions/{id} {\n      allow read: if compteAutorise();";
  if (!t.includes(bloc)) throw new Error('Bloc automatisations_propositions introuvable dans firestore.rules : adapter ce test.');
  return t.replace(bloc, "match /automatisations_propositions/{id} {\n      allow read: if false;");
};
test.beforeEach(() => chargerRegles('firestore.rules'));
test.afterAll(() => chargerRegles('firestore.rules'));

/** Une proposition fictive complète, telle que la porte l'écrit. */
const proposition = (extra = {}) => ({
  type: 'Nouveau contact', titre: 'Contact reçu par e-mail', resume: 'Une personne a écrit pour demander un rendez-vous.',
  champsProposes: [{ nom: 'Prénom', valeur: 'Alex' }, { nom: 'E-mail', valeur: 'alex@exemple.test' }],
  champsValides: null, lien: null, etat: 'a_valider', creeLe: new Date(Date.now() - 5 * MIN), expireLe: new Date(Date.now() + 25 * JOUR),
  valideePar: null, valideeLe: null, canal: null, refuseePar: null, refuseeLe: null, raison: null, tentatives: 0, derniereErreur: null,
  executions: { proposer: '1201', appliquer: null, refuser: null }, etapes: [], source: 'porte', ...extra,
});
const semer = async (n, prefixe = '', extra = () => ({})) => {
  for (let i = 1; i <= n; i += 1) await ecrireDocument(`${prefixe}automatisations_propositions/p${i}`, proposition({ titre: `Contact ${i}`, ...extra(i) }));
};

const aller = (page, hash) => page.evaluate((h) => { location.hash = h; }, hash);
const menu = (page) => page.locator('.menu');
const entree = (page) => menu(page).locator('.menu-entree[data-prefixe="automatisations"]');
const pastille = (page) => entree(page).locator('[data-role="badge-menu"]');
const nombre = (page) => pastille(page).locator('.menu-badge-nombre');
const ouvrirMenu = async (page) => {
  if (estTelephone(page)) { if (!(await page.locator('.coquille.menu-ouvert').count())) await page.getByRole('button', { name: 'Ouvrir le menu' }).click(); return; }
  const elargir = page.getByRole('button', { name: 'Élargir le menu' });
  if (await elargir.count()) await elargir.click();
};
/** Ouvre l'espace d'un client (comme modules-client.spec.js). */
async function ouvrirChezClient(page, client, email) {
  await page.goto('about:blank');
  await page.goto(`${URL_APP}#/espace/${client}`);
  await page.waitForFunction(() => !!window.__chevalierTest);
  await page.evaluate((e) => window.__chevalierTest.connecter(e, true), email);
  await expect(page.locator('.coquille')).toBeVisible();
}

test('1 un module sans badge ne change pas : Veille, Maintenance et le CRM n\'ont aucune pastille, même avec des propositions à valider', async ({ page }) => {
  await semer(2);
  await connecter(page, JEROME);
  await ouvrirMenu(page);
  await expect(pastille(page)).toBeVisible();
  await expect(menu(page).locator('[data-role="badge-menu"]')).toHaveCount(1); // une seule pastille dans tout le menu
  for (const chemin of ['veille/contenus', 'tableaudebord/general', 'crm/accueil']) await expect(menu(page).locator(`.menu-entree[data-chemin="${chemin}"] [data-role="badge-menu"]`)).toHaveCount(0);
  await expect(menu(page).locator('.menu-entree[data-chemin="veille/contenus"]')).toHaveAttribute('href', /#\/veille\/contenus$/);
});

test('2a cas vide : aucune proposition à valider, la pastille est invisible et l\'entrée n\'a que son nom', async ({ page }) => {
  await ecrireDocument('automatisations_propositions/deja', proposition({ etat: 'refusee' })); // une proposition déjà décidée ne compte pas
  await connecter(page, JEROME);
  await ouvrirMenu(page);
  await expect(entree(page)).toBeVisible();
  await expect(pastille(page)).toBeHidden();
  await expect(pastille(page)).toHaveText('');
  await expect(entree(page)).toHaveAccessibleName('Automatisations');
});

test('2b trois propositions à valider : pastille ronde rouge « 3 » sur « Automatisations », avec le texte « 3 à valider » pour les lecteurs d\'écran', async ({ page }) => {
  await semer(3);
  await connecter(page, JEROME);
  await ouvrirMenu(page);
  await expect(pastille(page)).toBeVisible();
  await expect(nombre(page)).toHaveText('3');
  await expect(pastille(page)).toContainText('3 à valider'); // texte masqué (sr-only), lu par les lecteurs d'écran
  await expect(entree(page)).toHaveAccessibleName('Automatisations 3 à valider');
  const forme = await pastille(page).evaluate((el) => {
    const r = el.getBoundingClientRect();
    const c = getComputedStyle(el);
    const sonde = (variable) => { const s = document.createElement('i'); s.style.color = getComputedStyle(document.documentElement).getPropertyValue(variable); document.body.append(s); const couleur = getComputedStyle(s).color; s.remove(); return couleur; };
    return { h: r.height, l: r.width, rayon: c.borderTopLeftRadius, fond: c.backgroundColor, rouge: sonde('--retard'), jaune: sonde('--accent') };
  });
  expect(forme.rayon).toBe('999px'); // ronde
  expect(forme.l).toBeGreaterThanOrEqual(forme.h);
  expect(forme.fond).toBe(forme.rouge); // la variable de rouge de css/tokens.css
  expect(forme.fond).not.toBe(forme.jaune); // jamais le jaune d'accent
  await capture(page, '1-menu-badge-3');
});

test('2c au-delà de 9 : « 9+ » ; le texte lu reste le vrai nombre', async ({ page }) => {
  await semer(11);
  await connecter(page, JEROME);
  await ouvrirMenu(page);
  await expect(nombre(page)).toHaveText('9+');
  await expect(entree(page)).toHaveAccessibleName('Automatisations 11 à valider');
});

test('2d menu replié (icônes seules) : la pastille reste visible, posée sur l\'icône de l\'entrée', { tag: '@sans-telephone' }, async ({ page }) => {
  await semer(3);
  await connecter(page, JEROME);
  await expect(page.locator('.coquille')).toHaveAttribute('data-menu', 'replie');
  await expect(pastille(page)).toBeVisible();
  await expect(nombre(page)).toHaveText('3');
  const [b, e, i] = await Promise.all([pastille(page).boundingBox(), entree(page).boundingBox(), entree(page).locator('.icone').boundingBox()]);
  expect(b.x).toBeGreaterThanOrEqual(e.x);
  expect(b.x + b.width).toBeLessThanOrEqual(e.x + e.width + 1);
  expect(b.x).toBeLessThan(i.x + i.width); // sur l'icône, pas dans le texte masqué
  await capture(page, '2-menu-replie-badge');
});

test('2e téléphone : la pastille est dans le tiroir du menu', async ({ page }) => {
  test.skip(!estTelephone(page), 'tiroir du menu : format téléphone seulement');
  await semer(2);
  await connecter(page, JEROME);
  await ouvrirMenu(page);
  await expect(pastille(page)).toBeVisible();
  await expect(nombre(page)).toHaveText('2');
});

test('3a une proposition périmée (expireLe passé) et celles déjà décidées ne sont pas comptées', async ({ page }) => {
  await semer(2);
  await ecrireDocument('automatisations_propositions/vieille', proposition({ titre: 'Trop ancienne', expireLe: new Date(Date.now() - JOUR) }));
  await ecrireDocument('automatisations_propositions/validee', proposition({ etat: 'validee' }));
  await connecter(page, JEROME);
  await ouvrirMenu(page);
  await expect(nombre(page)).toHaveText('2');
});

test('3b mise à jour en direct : une proposition qui arrive monte le nombre, une validée ou refusée le baisse, 0 cache la pastille', async ({ page }) => {
  await semer(2);
  await connecter(page, JEROME);
  await ouvrirMenu(page);
  await expect(nombre(page)).toHaveText('2');
  await ecrireDocument('automatisations_propositions/p3', proposition({ titre: 'Contact 3' }));
  await expect(nombre(page)).toHaveText('3');
  await ecrireDocument('automatisations_propositions/p1', proposition({ titre: 'Contact 1', etat: 'validee', valideePar: JEROME, canal: 'interface', valideeLe: new Date() }));
  await expect(nombre(page)).toHaveText('2');
  await ecrireDocument('automatisations_propositions/p2', proposition({ titre: 'Contact 2', etat: 'refusee', refuseePar: JEROME, refuseeLe: new Date() }));
  await ecrireDocument('automatisations_propositions/p3', proposition({ titre: 'Contact 3', etat: 'validee' }));
  await expect(pastille(page)).toBeHidden();
  await expect(entree(page)).toHaveAccessibleName('Automatisations');
});

test('3c un lecteur (rôle lecture seule chez un client) voit la pastille, avec les propositions de son client seulement', async ({ page }) => {
  await chargerRegles('firestore.plateforme.rules');
  await ecrireDocument('marques/plein', { actif: true, nom: 'Maison Pleine', couleur: '#336699', accueil: 'Bienvenue.' });
  await ecrireDocument('clients/plein', { modules: { crm: true, automatisations: true }, equipe: [{ email: ALICE, role: 'editeur' }, { email: LEA, role: 'lecteur' }] });
  await ecrireDocument(`clients/plein/membres/${ALICE}`, { role: 'editeur' });
  await ecrireDocument(`clients/plein/membres/${LEA}`, { role: 'lecteur' });
  await semer(3, 'clients/plein/');
  await semer(1, '', () => ({ titre: 'File de Jérôme' })); // la file de Jérôme n'est jamais comptée chez un client
  await ouvrirChezClient(page, 'plein', LEA);
  await ouvrirMenu(page);
  await expect(nombre(page)).toHaveText('3');
  await expect(entree(page)).toHaveAccessibleName('Automatisations 3 à valider');
});

test('3d cas d\'erreur : si la lecture est refusée, pas de pastille, pas de message, le menu marche', { annotation: { type: 'erreurs-reseau-attendues', description: 'lecture refusée exprès par les règles' } }, async ({ page }) => {
  await chargerRegles('firestore.rules', REFUSER_PROPOSITIONS);
  await semer(3);
  await connecter(page, CHARLES);
  await ouvrirMenu(page);
  await expect(entree(page)).toBeVisible();
  await expect(pastille(page)).toBeHidden();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(menu(page).locator('.menu-entree')).toHaveCount(8);
  await entree(page).click();
  await expect(page).toHaveURL(/#\/automatisations\/historique$/); // pas de nombre : l'Historique
  await expect(page.getByRole('heading', { name: 'Automatisations', level: 1 })).toBeVisible();
});

test('4 le nombre apparaît dans l\'onglet « À valider » (« À valider (3) »), suit en direct, et disparaît à 0', async ({ page }) => {
  await semer(3);
  await connecter(page, CHARLES);
  await aller(page, '#/automatisations/historique');
  const onglets = page.getByRole('navigation', { name: 'Écrans des automatisations' }).locator('.onglet');
  await expect(onglets).toHaveText(['À valider (3)', 'Historique']);
  await expect(onglets.nth(0)).toHaveAccessibleName('À valider (3)');
  await aller(page, '#/automatisations/a-valider');
  await expect(page.getByRole('heading', { name: 'À valider', level: 1 })).toBeVisible();
  await expect(onglets).toHaveText(['À valider (3)', 'Historique']);
  await capture(page, '3-onglet-a-valider-3');
  await ecrireDocument('automatisations_propositions/p1', proposition({ etat: 'refusee' }));
  await expect(onglets.nth(0)).toHaveText('À valider (2)');
  await ecrireDocument('automatisations_propositions/p2', proposition({ etat: 'refusee' }));
  await ecrireDocument('automatisations_propositions/p3', proposition({ etat: 'refusee' }));
  await expect(onglets).toHaveText(['À valider', 'Historique']);
});

test('5a au clic sur « Automatisations » : arrivée sur « À valider » quand il y en a, sur l\'Historique quand il n\'y en a pas', async ({ page }) => {
  await semer(2);
  await connecter(page, CHARLES);
  await ouvrirMenu(page);
  await expect(pastille(page)).toBeVisible();
  await entree(page).click();
  await expect(page).toHaveURL(/#\/automatisations\/a-valider$/);
  await expect(page.getByRole('heading', { name: 'À valider', level: 1 })).toBeVisible();
  await ecrireDocument('automatisations_propositions/p1', proposition({ etat: 'refusee' }));
  await ecrireDocument('automatisations_propositions/p2', proposition({ etat: 'refusee' }));
  await ouvrirMenu(page);
  await expect(pastille(page)).toBeHidden();
  await aller(page, '#/crm/accueil');
  await ouvrirMenu(page);
  await entree(page).click();
  await expect(page).toHaveURL(/#\/automatisations\/historique$/);
  await expect(page.getByRole('heading', { name: 'Automatisations', level: 1 })).toBeVisible();
});

test('5b un signet ou un lien direct vers l\'Historique reste sur l\'Historique, même avec des propositions à valider', async ({ page }) => {
  await semer(3);
  await connecter(page, CHARLES, { route: 'automatisations/historique', attendreAccueil: false });
  await expect(page.locator('.coquille')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Automatisations', level: 1 })).toBeVisible();
  await ouvrirMenu(page);
  await expect(pastille(page)).toBeVisible(); // le nombre est connu, et pourtant aucune redirection
  await expect(page).toHaveURL(/#\/automatisations\/historique$/);
  await expect(page.getByRole('navigation', { name: 'Écrans des automatisations' }).locator('.onglet').nth(1)).toHaveAttribute('aria-current', 'page');
});

test('6 chez un client sans le module : ni entrée, ni pastille, ni lecture des propositions', async ({ page }) => {
  await chargerRegles('firestore.plateforme.rules');
  await ecrireDocument('marques/cabinet', { actif: true, nom: 'Cabinet Martin', couleur: '#336699', accueil: 'Bienvenue.' });
  await ecrireDocument('clients/cabinet', { modules: { affaires: true, projets: false } });
  await ecrireDocument(`clients/cabinet/membres/${ALICE}`, { role: 'editeur' });
  await semer(3, 'clients/cabinet/');
  const lectures = [];
  page.on('request', (r) => { if (/automatisations_propositions/.test(r.url() + (r.postData() ?? ''))) lectures.push(r.url()); });
  await ouvrirChezClient(page, 'cabinet', ALICE);
  await ouvrirMenu(page);
  await expect(menu(page).getByRole('link', { name: /Automatisations/ })).toHaveCount(0);
  await expect(menu(page).locator('[data-role="badge-menu"]')).toHaveCount(0);
  await page.waitForTimeout(800);
  expect(lectures).toEqual([]);
});
