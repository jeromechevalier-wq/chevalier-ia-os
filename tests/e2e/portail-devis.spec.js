// Portail devis seul, étape 1 : adresse #/portail-devis (chez Jérôme) et #/espace/<client>/portail-devis (chez un client), « À traiter » dans la liste des devis.
// Le nom d'un test commence par le numéro du critère (5 à 10 et 13 à 18 ici ; 1 à 4, 11 et 12 : tests/portail-devis.test.js). Captures dans tests/e2e/captures/portail-devis/.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, listerDocuments, connecter, ecrireDocument, estTelephone, attendreCalme, ouvrirMenuUtilisateur, CHANTIER_ESSAI, JEROME, PROJET, FIRESTORE, URL_APP } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/portail-devis/', import.meta.url));
const DOSSIER_RETOUCHES = fileURLToPath(new URL('./captures/a-traiter-retouches/', import.meta.url));
const capturerRetouche = (page, info, nom) => page.screenshot({ path: `${DOSSIER_RETOUCHES}${nom}-${info.project.name}.png`, fullPage: true, animations: 'disabled' });
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: true, animations: 'disabled' });
const ALICE = 'alice@exemple.test';
const jourDansLe = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const ilYA = (jours) => new Date(Date.now() - jours * 86400000 - 3600000);

// Dans ce bac à sable, le script de Google est inaccessible : on le remplace par un fichier vide.
test.beforeEach(async ({ page }) => {
  await page.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
});

async function chargerRegles(fichier) {
  const contenu = await readFile(fileURLToPath(new URL(`../../${fichier}`, import.meta.url)), 'utf8');
  const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: fichier, content: contenu }] } }),
  });
  if (!r.ok) throw new Error(`Règles non chargées (${fichier}) : ${await r.text()}`);
}

/** Un devis déjà dans la base (contourne l'écran), `base` = '' (Jérôme) ou 'clients/<client>/'. */
async function devis(id, valeurs = {}, base = '') {
  const maintenant = new Date();
  await ecrireDocument(`${base}devis_devis/${id}`, {
    racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: null, personneId: null, organisationId: null, modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: jourDansLe(60),
    sections: [{ id: 's1', titre: 'Cuisine', lignes: [{ id: 'l1', libelle: 'Carrelage', quantite: 1, unite: 'u', prixAchat: 80, prixVente: 100 }] }],
    totaux: { ht: 100, tva: 20, ttc: 120 }, creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, ...valeurs,
  });
}
/** Le jeu du critère 13 (100 € chacun). */
async function jeuATraiter(base = '') {
  await devis('d1', { numero: 'DEV-2026-10-01-001', statut: 'envoye', finaliseLe: ilYA(12), envoyeLe: ilYA(12), envois: [{ date: ilYA(12) }], modifieLe: ilYA(3) }, base);
  await devis('d2', { numero: 'DEV-2026-10-01-002', statut: 'en_attente_envoi', finaliseLe: ilYA(8), modifieLe: ilYA(4) }, base);
  await devis('d3', { numero: 'DEV-2026-10-01-003', statut: 'en_attente_envoi', finaliseLe: ilYA(2), modifieLe: ilYA(2) }, base);
  await devis('d4', { modifieLe: ilYA(1) }, base);
  await devis('d5', { numero: 'DEV-2026-10-01-005', statut: 'envoye', finaliseLe: ilYA(12), envoyeLe: ilYA(12), envois: [{ date: ilYA(12) }], test: true, modifieLe: ilYA(5) }, base);
}
const ouvrirMenu = async (page) => { if (estTelephone(page) && !(await page.locator('.coquille.menu-ouvert').count())) await page.getByRole('button', { name: 'Ouvrir le menu' }).click(); };
const entreesMenu = (page) => page.locator('.menu .menu-entree').allInnerTexts().then((t) => t.map((x) => x.trim()));
const lignes = (page) => page.locator('tr.ligne-devis');
async function ouvrirPortail(page, route = 'portail-devis') {
  await connecter(page, JEROME, { route });
  await expect(page.locator('.page-liste-devis')).toBeVisible();
  await attendreCalme(page);
}

test.describe('chez Jérôme', () => {
  test('5 #/portail-devis ouvre la liste des devis dans la coque, titre inchangé, bouton jaune « + Devis »', { tag: '@smoke' }, async ({ page }, info) => {
    await ouvrirPortail(page);
    await expect(page).toHaveURL(/#\/portail-devis\/devis\/liste$/);
    await expect(page).toHaveTitle('Chevalier IA OS');
    await expect(page.getByRole('heading', { name: 'Devis', level: 1 })).toBeVisible();
    await expect(page.locator('[data-action="nouveau-devis"]')).toBeVisible();
    await expect(page.locator('[data-action="nouveau-devis"]')).toHaveClass(/bouton-principal/);
    await capturer(page, info, '5-ouverture');
  });

  test('6 le menu du portail : Devis + Espace complet ; menu utilisateur réduit ; le « + » ne propose que Devis', async ({ page }, info) => {
    await ouvrirPortail(page);
    await ouvrirMenu(page);
    expect(await entreesMenu(page)).toEqual(['Devis', 'Espace complet']);
    await expect(page.locator('[data-role="retour-espace"] svg :is(path, rect, circle, line)').first()).toBeAttached(); // icône réellement dessinée
    for (const lib of ['Accueil', 'Personnes', 'Organisations', 'Affaires', 'Projets', 'Veille', 'Automatisations', 'Maintenance']) await expect(page.locator('.menu').getByRole('link', { name: lib, exact: true })).toHaveCount(0);
    await capturer(page, info, '6-menu');
    await ouvrirMenuUtilisateur(page);
    await expect(page.locator('.menu-pop').getByRole('menuitem')).toHaveText(['Réglages', /Thème (clair|sombre)/, 'Se déconnecter']);
    await expect(page.locator('.menu-pop').getByRole('menuitemcheckbox')).toHaveText(['Mode test']);
    await page.keyboard.press('Escape');
    if (estTelephone(page)) { await page.keyboard.press('Escape'); await expect(page.locator('.coquille.menu-ouvert')).toHaveCount(0); }
    await page.locator('[data-role="bouton-plus"], .bouton-plus-mobile').filter({ visible: true }).first().click();
    await expect(page.locator('.menu-pop').getByRole('menuitem')).toHaveText(['Devis']);
    await page.keyboard.press('Escape');
  });

  test('7 les adresses restent sous #/portail-devis ; le brouillon créé est sans affaire et se retrouve dans #/devis/liste', async ({ page }) => {
    await ouvrirPortail(page);
    await page.locator('[data-action="ouvrir-bordereau"]').click();
    await expect(page).toHaveURL(/#\/portail-devis\/devis\/bordereau$/);
    await page.locator('[data-action="retour-devis"]').click();
    await expect(page).toHaveURL(/#\/portail-devis\/devis\/liste$/);
    await page.locator('[data-action="nouveau-devis"]').click();
    await expect(page).toHaveURL(/#\/portail-devis\/devis\/editeur\/[^/]+$/);
    const id = page.url().split('/').pop();
    await expect.poll(async () => { const d = (await listerDocuments('devis_devis')).find((x) => x.id === id); return d ? (d.affaireId ?? 'sans-affaire') : 'absent'; }).toBe('sans-affaire'); // brouillon enregistré, sans affaire
    await page.goto(`${URL_APP}#/devis/liste`);
    await expect(page.locator('.page-liste-devis')).toBeVisible();
    await expect(page.locator(`tr.ligne-devis[data-id="${id}"], .carte-devis[data-id="${id}"]`)).toBeVisible();
  });

  test('8 « Espace complet » mène à #/devis/liste hors du portail : page rechargée, menu complet', async ({ page }) => {
    await ouvrirPortail(page);
    await ouvrirMenu(page);
    await page.locator('[data-role="retour-espace"]').click();
    await expect(page).toHaveURL(/#\/devis\/liste$/);
    await expect(page.locator('.page-liste-devis')).toBeVisible();
    await ouvrirMenu(page);
    await expect.poll(() => entreesMenu(page).then((t) => t.length).catch(() => 0)).toBe(9);
  });

  test('9 un module hors portail : « Page introuvable » avec « Retour à l\'accueil » et « Ouvrir dans l\'espace complet » ; les Réglages s\'ouvrent dans le portail', async ({ page }, info) => {
    await ouvrirPortail(page);
    await page.evaluate(() => { location.hash = '#/portail-devis/crm/affaires'; });
    await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
    await expect(page.locator('[data-action="retour-accueil"]')).toHaveAttribute('href', '#/portail-devis/devis/liste');
    await expect(page.locator('[data-action="ouvrir-espace-complet"]')).toHaveAttribute('href', '#/crm/affaires');
    await expect(page.locator('[data-action="ouvrir-espace-complet"] svg :is(path, rect, circle, line)').first()).toBeAttached(); // icône réellement dessinée
    await capturer(page, info, '9-introuvable');
    await page.locator('[data-action="retour-accueil"]').click();
    await expect(page).toHaveURL(/#\/portail-devis\/devis\/liste$/);
    await page.evaluate(() => { location.hash = '#/portail-devis/crm/affaires'; });
    await page.locator('[data-action="ouvrir-espace-complet"]').click();
    await expect(page).toHaveURL(/#\/crm\/affaires$/); // hors portail : page rechargée, menu complet
    await ouvrirMenu(page);
    await expect.poll(() => entreesMenu(page).then((t) => t.length).catch(() => 0)).toBe(9); // page rechargée, menu complet
    await page.evaluate(() => { location.hash = '#/portail-devis/reglages'; });
    await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible();
    await expect(page).toHaveURL(/#\/portail-devis\/reglages$/);
    await page.evaluate(() => { location.hash = '#/portail-devis'; });
    await expect(page).toHaveURL(/#\/portail-devis\/devis\/liste$/);
  });
});

test.describe('« À traiter » dans la liste', () => {
  test('13 avec 100 € : le bouton affiche 2, « À relancer · 12 j » et « Jamais envoyé · 8 j » ; rien sur les autres ; le compteur dit 5 devis', async ({ page }, info) => {
    await jeuATraiter();
    await ouvrirPortail(page, 'devis/liste');
    await expect(page.locator('.compteur-liste')).toContainText('5 devis');
    await expect(page.locator('[data-action="a-traiter"]')).toBeVisible();
    await expect(page.locator('[data-action="a-traiter"] .pastille-a-traiter')).toHaveText('2');
    await expect(page.locator('[data-action="a-traiter"]')).toHaveAttribute('aria-label', 'À traiter : 2 devis');
    await expect(page.locator('tr[data-id="d1"] [data-a-traiter="a_relancer"]')).toHaveText('À relancer · 12 j');
    await expect(page.locator('tr[data-id="d2"] [data-a-traiter="jamais_envoye"]')).toHaveText('Jamais envoyé · 8 j');
    for (const id of ['d3', 'd4', 'd5']) await expect(page.locator(`tr[data-id="${id}"] [data-a-traiter]`)).toHaveCount(0);
    await expect(page.locator('tr[data-id="d5"]')).toContainText('TEST'); // le badge test reste, mais d5 n'entre jamais dans « À traiter »
    await capturer(page, info, '13-liste');
  });

  test('1 une seule pastille : d2 (jamais envoyé depuis 8 j) n’a que « Jamais envoyé · 8 j » en Liste et en Kanban ; d3 (2 j) garde « Pas encore envoyé »', async ({ page }, info) => {
    await jeuATraiter();
    await ouvrirPortail(page, 'devis/liste');
    await expect(page.locator('tr[data-id="d2"] [data-a-traiter="jamais_envoye"]')).toHaveText('Jamais envoyé · 8 j');
    await expect(page.locator('tr[data-id="d2"]')).not.toContainText('Pas encore envoyé');
    await capturerRetouche(page, info, '1-liste');
    await page.getByRole('button', { name: 'Kanban' }).click();
    await expect(page.locator('.carte-devis[data-id="d2"] [data-a-traiter="jamais_envoye"]')).toHaveText('Jamais envoyé · 8 j');
    await expect(page.locator('.carte-devis[data-id="d2"]')).not.toContainText('Pas encore envoyé');
    await expect(page.locator('.carte-devis[data-id="d3"] [data-pastille="pas-encore-envoye"]')).toHaveText('Pas encore envoyé');
    await expect(page.locator('.carte-devis[data-id="d1"] [data-a-traiter="a_relancer"]')).toHaveText('À relancer · 12 j');
    await expect(page.locator('.carte-devis[data-id="d1"] [data-pastille="pas-encore-envoye"]')).toHaveCount(0);
    await capturerRetouche(page, info, '1-kanban');
  });

  const PHRASE_VIDE = 'Un devis de test n’est jamais « à traiter » : choisis « Sans les tests » ou « Tout » pour voir les devis à traiter.';
  async function poserFiltres(page, { aTraiter, tests }) {
    await page.getByRole('button', { name: /Filtres/ }).click();
    const fenetre = page.locator('.voile-dialogue');
    if (aTraiter) await fenetre.locator('select[data-cle="aTraiter"]').selectOption(aTraiter);
    if (tests) await fenetre.locator('select[data-cle="tests"]').selectOption(tests);
    await fenetre.getByRole('button', { name: 'Appliquer' }).click();
  }

  test('2 « Seulement les tests » + « Seulement à traiter » : la liste est vide et dit la phrase qui explique pourquoi', async ({ page }, info) => {
    await jeuATraiter();
    await ouvrirPortail(page, 'devis/liste');
    await poserFiltres(page, { aTraiter: 'seulement', tests: 'seulement' });
    await expect(lignes(page)).toHaveCount(0);
    await expect(page.locator('.etat-vide')).toHaveText(PHRASE_VIDE);
    await capturerRetouche(page, info, '2-phrase-vide');
  });

  test('2b la phrase n’apparaît pas hors de ce cas (autre filtre Tests, ou liste non vide) ; le cas vide général est inchangé', async ({ page }) => {
    await jeuATraiter();
    await ouvrirPortail(page, 'devis/liste');
    await poserFiltres(page, { aTraiter: 'seulement', tests: 'exclure' });
    await expect(lignes(page)).toHaveCount(2);
    await expect(page.getByText(PHRASE_VIDE)).toHaveCount(0);
    await poserFiltres(page, { aTraiter: 'tout', tests: 'seulement' });
    await expect(lignes(page)).toHaveCount(1); // d5, le seul devis test
    await expect(page.getByText(PHRASE_VIDE)).toHaveCount(0);
    await poserFiltres(page, { aTraiter: 'tout', tests: 'inclure' });
    await page.getByRole('button', { name: /Filtres/ }).click();
    await page.locator('.voile-dialogue').getByRole('checkbox', { name: 'Devis refusé', exact: true }).check();
    await page.locator('.voile-dialogue').getByRole('button', { name: 'Appliquer' }).click();
    await expect(page.locator('.etat-vide')).toHaveText('Aucun devis ne correspond.'); // vide sans « tests + à traiter » : phrase habituelle
  });

  test('14 le clic sur « À traiter » garde d1 et d2 ; Filtres vaut 1 ; Tout effacer remet tout ; combiné avec Statut', async ({ page }, info) => {
    await jeuATraiter();
    await ouvrirPortail(page, 'devis/liste');
    await page.locator('[data-action="a-traiter"]').click();
    await expect(lignes(page)).toHaveCount(2);
    await expect(page.locator('[data-id="d1"]')).toBeVisible();
    await expect(page.locator('[data-id="d2"]')).toBeVisible();
    await expect(page.locator('[data-action="filtres"] .compteur-filtres')).toHaveText('1');
    await capturer(page, info, '14-a-traiter');
    await page.getByRole('button', { name: /Filtres/ }).click();
    const fenetre = page.locator('.voile-dialogue');
    await expect(fenetre).toContainText('À traiter');
    await expect(fenetre.locator('select[data-cle="aTraiter"]')).toHaveValue('seulement');
    await fenetre.getByRole('button', { name: 'Tout effacer' }).click(); // « Tout effacer » applique et ferme la fenêtre
    await expect(fenetre).toHaveCount(0);
    await expect(lignes(page)).toHaveCount(5);
    // combiné : À traiter + Envoyé = d1 seul
    await page.getByRole('button', { name: /Filtres/ }).click();
    await page.locator('.voile-dialogue').getByRole('checkbox', { name: 'Envoyé', exact: true }).check();
    await page.locator('.voile-dialogue select[data-cle="aTraiter"]').selectOption('seulement');
    await page.locator('.voile-dialogue').getByRole('button', { name: 'Appliquer' }).click();
    await expect(lignes(page)).toHaveCount(1);
    await expect(page.locator('[data-id="d1"]')).toBeVisible();
  });

  test('14b le bouton « À traiter » suit le critère (aria-pressed) et un second clic remet « Tout » ; entrer en Archives remet « Tout »', async ({ page }) => {
    await jeuATraiter();
    await ouvrirPortail(page, 'devis/liste');
    const bouton = page.locator('[data-action="a-traiter"]');
    await expect(bouton).toHaveAttribute('aria-pressed', 'false');
    await bouton.click();
    await expect(bouton).toHaveAttribute('aria-pressed', 'true');
    await expect(lignes(page)).toHaveCount(2);
    await bouton.click();
    await expect(bouton).toHaveAttribute('aria-pressed', 'false');
    await expect(lignes(page)).toHaveCount(5);
    await bouton.click();
    await page.getByRole('button', { name: 'Archives' }).click();
    await page.getByRole('button', { name: 'Liste' }).click();
    await expect(bouton).toHaveAttribute('aria-pressed', 'false'); // le critère n'a pas suivi en Archives
    await expect(lignes(page)).toHaveCount(5);
    await page.getByRole('button', { name: 'Archives' }).click();
    await page.getByRole('button', { name: /Filtres/ }).click();
    await expect(page.locator('.voile-dialogue select[data-cle="aTraiter"]')).toHaveCount(0); // pas de critère « À traiter » en Archives
  });

  test('15 Kanban : mêmes pastilles, d2 n’a que « Jamais envoyé · 8 j » et d3 (finalisé il y a 2 j) garde « Pas encore envoyé » ; en Archives, rien et le bouton est caché', async ({ page }, info) => {
    await jeuATraiter();
    await ouvrirPortail(page, 'devis/liste');
    await page.getByRole('button', { name: 'Kanban' }).click();
    await expect(page.locator('.carte-devis[data-id="d1"] [data-a-traiter="a_relancer"]')).toHaveText('À relancer · 12 j');
    await expect(page.locator('.carte-devis[data-id="d2"] [data-a-traiter="jamais_envoye"]')).toHaveText('Jamais envoyé · 8 j');
    await expect(page.locator('.carte-devis[data-id="d2"] [data-pastille="pas-encore-envoye"]')).toHaveCount(0);
    await expect(page.locator('.carte-devis[data-id="d3"] [data-pastille="pas-encore-envoye"]')).toBeVisible();
    await expect(page.locator('.carte-devis[data-id="d3"] [data-a-traiter]')).toHaveCount(0);
    await capturer(page, info, '15-kanban');
    await page.getByRole('button', { name: 'Archives' }).click();
    await expect(page.locator('[data-action="a-traiter"]')).toBeHidden();
    await expect(page.locator('[data-a-traiter]')).toHaveCount(0);
  });

  test('16 cas vide : aucun devis, pas de bouton « À traiter » ; devis présents mais rien à traiter : aucun bouton, aucune pastille', async ({ page }) => {
    await ouvrirPortail(page, 'devis/liste');
    await expect(page.getByText('Aucun devis pour l’instant.')).toBeVisible();
    await expect(page.locator('[data-action="nouveau-devis-vide"]')).toBeVisible();
    await expect(page.locator('[data-action="a-traiter"]')).toBeHidden();
    await devis('x1', { numero: 'DEV-2026-11-01-001', statut: 'en_attente_envoi', finaliseLe: ilYA(2) });
    await devis('x2', { statut: 'envoye', numero: 'DEV-2026-11-01-002', envoyeLe: ilYA(3), finaliseLe: ilYA(3), envois: [{ date: ilYA(3) }] });
    await expect(lignes(page)).toHaveCount(2);
    await expect(page.locator('[data-action="a-traiter"]')).toBeHidden();
    await expect(page.locator('[data-a-traiter]')).toHaveCount(0);
  });

  test('17 cas d\'erreur : lecture refusée, la liste précédente reste avec la phrase existante, sans bouton « À traiter » fantôme ; sans réglage lisible le défaut 10 s\'applique', async ({ page }, info) => {
    await jeuATraiter();
    await ouvrirPortail(page, 'devis/liste');
    await expect(page.locator('[data-action="a-traiter"]')).toBeVisible();
    const forcer = (vider) => page.evaluate(async (v) => {
      const D = await import('/js/modules/devis/donnees.js');
      D.etat.erreurLectureDevis = true; D.etat.reglages = {}; // pas de délai lisible : le défaut (10 jours) s'applique
      if (v) D.etat.devis = [];
    }, vider);
    const redessiner = async () => { const r = page.getByLabel('Rechercher un devis'); await r.fill('zz'); await r.fill(''); };
    await forcer(false);
    await redessiner();
    await expect(page.locator('[data-erreur="lecture"]')).toContainText('La liste des devis n’a pas pu être mise à jour');
    await expect(lignes(page)).toHaveCount(5); // la liste précédente reste
    await expect(page.locator('[data-action="a-traiter"] .pastille-a-traiter')).toHaveText('2'); // défaut 10 jours : d1 (12 j) et d2 (8 j, 7 j sans envoi)
    await capturer(page, info, '17-erreur');
    await forcer(true);
    await redessiner();
    await expect(page.locator('[data-action="a-traiter"]')).toBeHidden(); // liste vidée : pas de bouton fantôme
    await expect(page.locator('.page-liste-devis')).toBeVisible();
  });

  test('18 téléphone : zone de clic du bouton ≥ 44 px, pas de débordement, Échap referme le tiroir, aucune erreur console', async ({ page }, info) => {
    test.skip(!estTelephone(page), 'format téléphone seulement');
    await jeuATraiter();
    await ouvrirPortail(page);
    const boite = await page.locator('[data-action="a-traiter"]').boundingBox();
    expect(boite.height).toBeGreaterThanOrEqual(44);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
    await expect(page.locator('.coquille.menu-ouvert')).toHaveCount(1);
    await page.keyboard.press('Escape');
    await expect(page.locator('.coquille.menu-ouvert')).toHaveCount(0);
    await capturer(page, info, '18-telephone');
  });
});

test.describe('chez un client (règles de la plateforme)', () => {
  test.beforeAll(() => chargerRegles('firestore.plateforme.rules'));
  test.afterAll(() => chargerRegles('firestore.rules'));
  test.beforeEach(async () => {
    for (const [id, nom] of [['devisseul', 'Devis Seul'], ['cabinet', 'Cabinet Martin']]) await ecrireDocument(`marques/${id}`, { actif: true, nom, couleur: '#336699', accueil: 'Bienvenue.' });
    await ecrireDocument('clients/devisseul', { modules: { devis: true } });
    await ecrireDocument('clients/cabinet', { modules: { affaires: true } });
    for (const c of ['devisseul', 'cabinet']) await ecrireDocument(`clients/${c}/membres/${ALICE}`, { role: 'editeur' });
    await ecrireDocument('clients/cabinet/crm_personnes/pc', { nom: 'Camille Secrète', prenom: 'Camille', nomFamille: 'Secrète', telephones: [], emails: [], emailsNormalises: [], etiquettes: [], archive: false, proprietaire: ALICE, creeLe: new Date(), modifieLe: new Date(), creePar: ALICE, modifiePar: ALICE });
    await ecrireDocument('clients/devisseul/devis_parametres/reglages', { regimeTva: 'assujetti', entreprise: { nom: 'Atelier Exemple', siret: '123 456 789 00012', adresse: { ligne1: '3 rue de l’Atelier', codePostal: '75001', ville: 'Paris' } } });
  });
  async function ouvrirClient(page, client, reste = '') {
    await page.goto('about:blank');
    await page.goto(`${URL_APP}#/espace/${client}${reste ? `/${reste}` : ''}`);
    await page.waitForFunction(() => !!window.__chevalierTest);
    await page.evaluate((e) => window.__chevalierTest.connecter(e, true), ALICE);
    await expect(page.locator('.coquille')).toBeVisible();
  }

  test('10 client Devis seul : portail sur la liste, menu Devis + Espace complet, « + » complet ; module hors portail introuvable ; sans Devis introuvable ; l\'arrivée par défaut ne change pas', async ({ page }, info) => {
    await devis('c1', { numero: 'DEV-2026-10-01-009', statut: 'envoye', finaliseLe: ilYA(12), envoyeLe: ilYA(12), envois: [{ date: ilYA(12) }], creePar: ALICE }, 'clients/devisseul/');
    await ouvrirClient(page, 'devisseul', 'portail-devis');
    await expect(page).toHaveURL(/#\/espace\/devisseul\/portail-devis\/devis\/liste$/);
    await expect(page).toHaveTitle('Devis Seul');
    await ouvrirMenu(page);
    expect(await entreesMenu(page)).toEqual(['Devis', 'Espace complet']);
    await expect(page.locator('[data-role="retour-espace"]')).toHaveAttribute('href', '#/espace/devisseul/devis/liste');
    await expect(page.locator('[data-action="a-traiter"] .pastille-a-traiter')).toHaveText('1');
    await capturer(page, info, '10-client');
    await page.keyboard.press('Escape');
    await page.evaluate(() => { location.hash = '#/espace/devisseul/portail-devis/crm/affaires'; });
    await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
    await expect(page.locator('[data-action="retour-accueil"]')).toHaveAttribute('href', '#/espace/devisseul/portail-devis/devis/liste');
    await expect(page.locator('[data-action="ouvrir-espace-complet"]')).toHaveCount(0); // Affaires n'est pas actif chez ce client : rien à ouvrir dans l'espace complet
    await page.evaluate(() => { location.hash = '#/espace/devisseul'; });
    await expect(page).toHaveURL(/#\/espace\/devisseul\/devis\/liste$/); // l'arrivée par défaut reste la liste, hors portail
    // Espace complet : hors portail, page rechargée
    await page.goto('about:blank');
    await ouvrirClient(page, 'devisseul', 'portail-devis');
    await ouvrirMenu(page);
    await page.locator('[data-role="retour-espace"]').click();
    await expect(page).toHaveURL(/#\/espace\/devisseul\/devis\/liste$/);
    await expect(page.locator('.page-liste-devis')).toBeVisible();
  });

  test('10b client sans Devis : « Page introuvable » sur son portail, aucune donnée', async ({ page }) => {
    await ouvrirClient(page, 'cabinet', 'portail-devis');
    await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
    await expect(page.locator('.menu .menu-entree')).toHaveCount(0);
    await expect(page.locator('body')).not.toContainText('Camille Secrète');
    // pas de cul-de-sac : le retour mène à l'espace du client, hors portail
    await expect(page.locator('[data-action="retour-accueil"]')).toHaveAttribute('href', '#/espace/cabinet');
    await expect(page.locator('[data-action="retour-accueil"]')).toHaveAttribute('data-hors-prefixe', '');
    await page.locator('[data-action="retour-accueil"]').click();
    await expect(page).toHaveURL(/#\/espace\/cabinet\/crm\/accueil$/);
    await expect(page.locator('.coquille')).toBeVisible();
  });

  test('10c client Devis + Affaires : une adresse d\'Affaires dans le portail propose « Ouvrir dans l\'espace complet »', async ({ page }) => {
    await ecrireDocument('clients/duo', { modules: { affaires: true, devis: true } });
    await ecrireDocument('marques/duo', { actif: true, nom: 'Duo', couleur: '#336699', accueil: 'Bienvenue.' });
    await ecrireDocument(`clients/duo/membres/${ALICE}`, { role: 'editeur' });
    await ouvrirClient(page, 'duo', 'portail-devis/crm/affaires');
    await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
    await expect(page.locator('[data-action="ouvrir-espace-complet"]')).toHaveAttribute('href', '#/espace/duo/crm/affaires');
    await expect(page.locator('[data-action="retour-accueil"]')).toHaveAttribute('href', '#/espace/duo/portail-devis/devis/liste');
  });
});
