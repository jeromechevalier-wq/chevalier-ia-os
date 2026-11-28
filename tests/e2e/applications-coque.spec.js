// Chantier « applications dans la coque » (27/11/2026) : dans la maison d'un client, un bâtiment = une application. Un test par critère (le nom commence par son numéro).
//  1 le besoin du village ouvre l'application du module (Factures : la pile), et la maison de l'appli ramène au village ;
//  2 dans l'appli, la roue dentée n'ouvre que les réglages de CETTE appli (aucun autre module, aucun réglage de l'espace) ;
//  3 Réglages > Modules actifs dans une maison : le compte client voit ses seuls modules allumés ; le titulaire voit tout le catalogue avec le vrai état ; chez Jérôme : inchangé ;
//  4 Réglages > Mon espace dans une maison : le titulaire enregistre le nom et le logo, qui s'affichent en haut à gauche et sur la page de connexion ;
//    depuis le 27/11/2026 (accord de Jérôme), les autres comptes du client aussi : tests/e2e/maison-nom-logo-comptes.spec.js.
// Captures dans tests/e2e/captures/applications-coque/, nommées avec le projet (ordinateur ou telephone). Données d'exemple neutres, aucun réseau réel.
// Comptes des parcours (outils.js) : JEROME est le titulaire ; CHARLES est un autre compte autorisé (ici : le compte du client). Logique : tests/applications-coque.test.js.
// Le bâtiment est ouvert au clavier (Entrée) et l'arrivée est attendue par son adresse : le test ne dépend ni du nombre de parcelles ni du délai d'un clic.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, ecrireDocument, estTelephone, JEROME, CHARLES, PROJET, FIRESTORE, URL_APP, ECRAN_PARCOURS, villageParDefaut } from './outils.js';
import { semerFicheEmulateur } from '../_fiche-emulateur.js';

// Depuis le 28/11/2026 l'accueil par défaut est le menu classique : ces parcours du village remettent le village par défaut (crochet de test, docs/accueil-village.md).
test.beforeEach(async ({ page }) => { await villageParDefaut(page); });

const DOSSIER = fileURLToPath(new URL('./captures/applications-coque/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' });
const HOTE = new URL(FIRESTORE).host;
const ACHATS = ['achatsfactures', 'tableauachats', 'achatschantiers', 'achatsfournisseurs', 'achatsarticles'];
const NOM = 'Menuiserie Exemple';
const FACTURES = { nom: 'Factures', phrase: 'Valider mes factures fournisseurs', batiment: 'banque', cible: '#/achatsfactures/liste' };
const semer = (document, fiche) => semerFicheEmulateur({ projet: PROJET, hote: HOTE, document, fiche });
/** Maison d'un client : nom dans `public`, configuration neutre, les 5 modules Achats allumés (et, si demandé, un village). */
async function semerMaison({ besoins, modules = ACHATS, publicPlus = {} } = {}) {
  await semer('public', { mode_crm: true, nom_espace: NOM, ...publicPlus });
  await semer('ecran', { ...ECRAN_PARCOURS, configuration_crm: 'neutre', ...(modules ? { modules } : {}), ...(besoins ? { besoins } : {}) });
}
const https = (hote, chemin = '') => `${['https', ''].join(':')}//${hote}${chemin}`;
/** Base de l'espace : faux réseau qui répond des listes vides (l'appli montre son cas vide, jamais une erreur de connexion). */
async function poserBaseVide(page) {
  await ecrireDocument('base_parametres/connexion', { adresseBase: https('base.exemple.test'), clePublique: 'cle-publique-fictive', espace: 'espace-essai', webhooks: { actions: https('hooks.exemple.test', '/actions') } });
  await page.addInitScript(() => {
    const fetchImpl = async () => new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json', 'Content-Range': '*/0' } });
    window.__accesBase = { fetchImpl, jeton: 'jeton-fictif', claims: { role: 'authenticated', espace_base: 'espace-essai' } };
  });
}
async function ouvrir(page, email, route) {
  await connecter(page, email, { attendreAccueil: false, route });
  await expect(page.locator('.coquille')).toBeVisible();
}
const taper = (page, route) => page.evaluate((r) => { location.hash = `#/${r}`; }, route);
const sansDefilementHorizontal = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const lignesModules = (page) => page.locator('.reglages-module-ligne').evaluateAll((els) => els.map((e) => [e.dataset.module, e.querySelector('.badge').textContent.trim()]));
/** Un petit PNG carré (16 x 16, une couleur), fabriqué dans le navigateur : aucune image dans le dépôt. */
const pngFictif = async (page, couleur = '#c2410c') => Buffer.from(await page.evaluate((c) => {
  const toile = document.createElement('canvas'); toile.width = 16; toile.height = 16;
  const d = toile.getContext('2d'); d.fillStyle = c; d.fillRect(0, 0, 16, 16);
  return toile.toDataURL('image/png').split(',')[1];
}, couleur), 'base64');

test('1 un bâtiment = une application : le besoin « Factures » (cible : la liste du module) ouvre l’application Factures ; sa maison ramène au village', async ({ page }, info) => {
  await semerMaison({ besoins: [FACTURES] });
  await poserBaseVide(page);
  await ouvrir(page, CHARLES, '');
  const batiment = page.locator('[data-role="village"] [data-role="batiment"][data-cible="#/achatsfactures/liste"]');
  await expect(batiment).toBeVisible(); // la donnée n'a pas changé : la cible écrite reste la liste
  await capturer(page, info, '1-village-avant');
  await batiment.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/achatsfactures\/pile$/); // … mais on arrive dans l'application
  await expect(page.locator('[data-role="appli-factures"][data-vue="pile"]')).toBeVisible();
  const entete = page.locator('[data-role="appli-entete"]');
  await expect(entete.locator('[data-action="vers-pile"]')).toHaveText('Factures');
  await expect(page.locator('.coquille .menu')).toBeHidden(); // dans l'appli : ni menu de la coque ni barre du haut
  await expect(page.locator('.coquille .barre-haut')).toBeHidden();
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, '1-application-factures');
  await entete.locator('[data-action="accueil"]').click(); // « maison › Factures » : la maison ramène au village
  await expect(page).toHaveURL(/#\/accueil$/);
  await expect(page.locator('[data-role="village"]')).toBeVisible();
});

test('1 un besoin qui vise une vue précise, ou un module sans application, arrive où il le demande (rien n’est détourné)', async ({ page }) => {
  await semerMaison({ besoins: [{ ...FACTURES, cible: '#/achatsfactures/tableau' }, { nom: 'Chantiers', phrase: 'Suivre mes chantiers', batiment: 'grue', cible: '#/achatschantiers/liste' }] });
  await poserBaseVide(page);
  await ouvrir(page, CHARLES, '');
  await page.locator('[data-role="batiment"][data-cible="#/achatsfactures/tableau"]').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/achatsfactures\/tableau$/);
  await taper(page, 'accueil');
  await page.locator('[data-role="batiment"][data-cible="#/achatschantiers/liste"]').focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/#\/achatschantiers\/liste$/);
});

test('2 dans l’application Factures, la roue dentée ouvre les réglages de cette appli seulement : aucun autre module, aucun réglage de l’espace', async ({ page }, info) => {
  await semerMaison({ besoins: [FACTURES] });
  await poserBaseVide(page);
  await ouvrir(page, CHARLES, 'achatsfactures/pile');
  await expect(page.locator('[data-role="appli-factures"][data-vue="pile"]')).toBeVisible();
  await page.locator('[data-role="appli-entete"] [data-action="reglages-factures"]').click();
  await expect(page).toHaveURL(/#\/achatsfactures\/reglages$/);
  const reglages = page.locator('[data-role="reglages-factures"]');
  await expect(reglages.getByRole('heading', { name: 'Réglages des factures', level: 1 })).toBeVisible();
  // Une seule section, celle des factures ; rien des quatre autres modules allumés dans la maison, rien de l'espace (Mon espace, Modules actifs…).
  const sections = await page.locator('#contenu .carte-section').evaluateAll((els) => els.map((e) => e.id));
  expect(sections).toEqual(['reglages-export-achatsfactures']);
  await expect(page.locator('#contenu .reglages-menu, #contenu .reglages-menu-lien, #contenu .page-reglages')).toHaveCount(0);
  const texte = await page.locator('#contenu').innerText();
  for (const autre of ['Fournisseurs', 'Chantiers', 'Articles', 'Tableau de bord 2', 'Modules actifs', 'Mon espace', 'Connexion à la base']) expect(texte, autre).not.toContain(autre);
  await expect(page.locator('.coquille .menu')).toBeHidden();
  await expect(page.locator('.coquille .barre-haut')).toBeHidden();
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, '2-roue-dentee-reglages-des-factures');
});

test('3 maison d’un client, compte client : « Modules actifs » ne montre que les modules allumés de la maison, avec leur vrai état', async ({ page }, info) => {
  await semerMaison();
  await ouvrir(page, CHARLES, 'reglages/modules');
  await expect(page.locator('[data-reglages="espace:modules"]')).toBeVisible();
  expect(await lignesModules(page)).toEqual([['achats', 'Allumé']]); // les 5 modules Achats : une ligne ; rien du reste du catalogue
  await expect(page.locator('.reglages-module-ligne[data-module="achats"]')).toContainText('Factures');
  await expect(page.locator('.reglages-module-ligne[data-module="achats"] input[role="switch"]')).toBeChecked();
  await expect(page.locator('[data-role="modules-allumes"]')).toHaveText('Les modules allumés dans cet espace.');
  await expect(page.locator('[data-role="modules-administrateur"]')).toBeVisible();
  await expect(page.locator('#contenu')).not.toContainText('Éteint');
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, '3-client-modules-allumes');
});

test('3 maison où Factures seule est allumée (bloc Achats en partie) : le compte client lit « Achats : Factures », sans les modules éteints ni « une partie seulement »', async ({ page }, info) => {
  await semerMaison({ modules: ['achatsfactures'] });
  await ouvrir(page, CHARLES, 'reglages/modules');
  expect(await lignesModules(page)).toEqual([['achats', 'Allumé']]);
  const ligne = page.locator('.reglages-module-ligne[data-module="achats"]');
  await expect(ligne.locator('[data-role="modules-du-bloc"]')).toHaveText('Factures');
  for (const absent of ['Fournisseurs', 'Chantiers', 'Articles', 'Tableau de bord 2', 'une partie seulement']) await expect(ligne).not.toContainText(absent);
  await capturer(page, info, '3-client-bloc-partiel');
});

test('3 maison d’un client, titulaire : tout le catalogue, « Allumé » pour les modules de la maison et « Éteint » pour les autres', async ({ page }, info) => {
  await semerMaison();
  await ouvrir(page, JEROME, 'reglages/modules');
  await expect(page.locator('[data-role="modules-catalogue"]')).toBeVisible();
  const lignes = await lignesModules(page);
  expect(lignes.length).toBeGreaterThan(5);
  expect(lignes.filter(([, etat]) => etat === 'Allumé').map(([id]) => id)).toEqual(['achats']);
  expect(lignes.find(([id]) => id === 'crm')).toEqual(['crm', 'Éteint']);
  expect(lignes.map(([id]) => id)).not.toContain('console');
  await capturer(page, info, '3-titulaire-catalogue');
});

test('3 maison sans aucun module allumé (cas vide) : le compte client lit « Aucun module n’est allumé »', async ({ page }, info) => {
  await semerMaison({ modules: [] });
  await ouvrir(page, CHARLES, 'reglages/modules');
  await expect(page.locator('[data-role="modules-aucun"]')).toHaveText('Aucun module n’est allumé dans cet espace pour l’instant.');
  await expect(page.locator('.reglages-module-ligne')).toHaveCount(0);
  await capturer(page, info, '3-client-aucun-module');
});

test('3 chez Jérôme (pas une maison de client) : « Modules actifs » inchangé', async ({ page }) => {
  await ouvrir(page, JEROME, 'reglages/modules'); // fiches des parcours : ni nom_espace, ni configuration neutre, ni réglage `modules`
  await expect(page.locator('[data-reglages="espace:modules"]')).toBeVisible();
  await expect(page.locator('#reglages-modules > .aide').first()).toHaveText('Ici tous les modules sont allumés : cet espace n’a pas d’interrupteur par module.');
  const lignes = await lignesModules(page);
  expect(lignes.length).toBeGreaterThan(5);
  expect(lignes.every(([, etat]) => etat === 'Allumé')).toBe(true);
  expect(lignes.map(([id]) => id)).not.toContain('achats');
  await expect(page.locator('[data-role="modules-catalogue"], [data-role="modules-allumes"]')).toHaveCount(0);
});

test('4 Mon espace d’une maison, titulaire : le nom et le logo s’enregistrent, s’affichent tout de suite en haut à gauche, puis sur la page de connexion', async ({ page }, info) => {
  await semerMaison();
  await ouvrir(page, JEROME, 'reglages');
  const section = page.locator('[data-role="mon-espace-maison"]');
  await expect(section).toBeVisible();
  await expect(section.locator('[data-champ="nom"]')).toHaveValue(NOM);
  await expect(section.locator('[data-role="pas-de-logo"]')).toBeVisible(); // cas vide : pas encore de logo
  await section.locator('[data-champ="nom"]').fill('  Menuiserie   04 ');
  await section.locator('[data-role="fichier-logo"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: await pngFictif(page) });
  await expect(section.locator('[data-role="logo-image"]')).toBeVisible();
  await expect(section.locator('[data-role="logo-apercu"]')).toContainText('Enregistrer');
  await section.locator('[data-action="enregistrer"]').click();
  await expect(section.locator('[data-role="message-enregistrement"]')).toContainText('Enregistré');
  await expect(section.locator('[data-champ="nom"]')).toHaveValue('Menuiserie 04');
  // En haut à gauche : le logo à gauche du nom (menu sur ordinateur, barre du haut sur téléphone), sans recharger la page.
  const marque = page.locator(estTelephone(page) ? '.barre-haut-marque' : '.menu-marque-nom');
  await expect(marque).toContainText('Menuiserie 04');
  const logo = marque.locator('img');
  await expect(logo).toHaveAttribute('src', /^data:image\/png;base64,/);
  if (!estTelephone(page) && (await page.locator('.coquille').getAttribute('data-menu')) === 'replie') await page.locator('[data-role="bascule-menu"]').click(); // menu replié : on le déplie pour voir le nom à côté du logo
  await expect(logo).toBeVisible();
  const [boiteLogo, boiteNom] = [await logo.boundingBox(), await marque.locator('span', { hasText: 'Menuiserie 04' }).last().boundingBox()];
  expect(boiteLogo.x).toBeLessThan(boiteNom.x); // le logo à gauche du nom
  await expect(page).toHaveTitle('Menuiserie 04');
  await expect(page.locator('.page-tete-reglages .etiquette')).toHaveText('Menuiserie 04');
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, '4-mon-espace-enregistre');
  // Après un rechargement : ce qui est enregistré revient, et la page de connexion montre le logo à gauche du nom.
  await page.reload();
  await expect(page.locator('.coquille')).toBeVisible();
  await expect(page.locator(estTelephone(page) ? '.barre-haut-marque' : '.menu-marque-nom').locator('img')).toHaveAttribute('src', /^data:image\/png;base64,/);
  await page.context().clearCookies();
  await page.evaluate(() => indexedDB.databases().then((bases) => Promise.all(bases.map((b) => new Promise((r) => { const d = indexedDB.deleteDatabase(b.name); d.onsuccess = d.onerror = d.onblocked = r; })))));
  await page.goto('about:blank');
  await page.goto(`${URL_APP}#/reglages`);
  const connexion = page.locator('.connexion[data-connexion="neutre"]');
  await expect(connexion.getByRole('heading', { level: 1 })).toHaveText('Menuiserie 04');
  const logoConnexion = connexion.locator('[data-role="logo-maison"]');
  await expect(logoConnexion).toBeVisible();
  const [bl, bt] = [await logoConnexion.boundingBox(), await connexion.getByRole('heading', { level: 1 }).boundingBox()];
  expect(bl.x).toBeLessThan(bt.x); // le logo à gauche du nom
  await capturer(page, info, '4-connexion-avec-logo');
});

test('4 Mon espace d’une maison, titulaire : fichier refusé (trop lourd, mauvais type) et nom vide = message clair, rien n’est enregistré ; « Retirer » enlève le logo', async ({ page }, info) => {
  await semerMaison();
  await ouvrir(page, JEROME, 'reglages');
  const section = page.locator('[data-role="mon-espace-maison"]');
  const fichier = section.locator('[data-role="fichier-logo"]');
  const lourd = Buffer.concat([await pngFictif(page), Buffer.alloc(101 * 1000)]);
  await fichier.setInputFiles({ name: 'gros.png', mimeType: 'image/png', buffer: lourd });
  await expect(section.locator('[data-role="message-logo"]')).toContainText('100 Ko au plus');
  await fichier.setInputFiles({ name: 'faux.png', mimeType: 'image/png', buffer: Buffer.from('GIF89a pas une image acceptée') });
  await expect(section.locator('[data-role="message-logo"]')).toContainText('ni un PNG, ni un JPG, ni un SVG');
  await expect(section.locator('[data-role="logo-image"]')).toHaveCount(0);
  await section.locator('[data-champ="nom"]').fill('   ');
  await section.locator('[data-action="enregistrer"]').click();
  await expect(section.locator('[data-role="erreur-nom"]')).toContainText('Écris un nom');
  await capturer(page, info, '4-erreurs');
  // Un SVG est accepté ; puis « Retirer » et « Enregistrer » : le logo par défaut revient.
  await section.locator('[data-champ="nom"]').fill(NOM);
  await fichier.setInputFiles({ name: 'logo.svg', mimeType: 'image/svg+xml', buffer: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#0f766e"/></svg>') });
  await section.locator('[data-action="enregistrer"]').click();
  await expect(section.locator('[data-role="message-enregistrement"]')).toContainText('Enregistré');
  const marque = page.locator(estTelephone(page) ? '.barre-haut-marque' : '.menu-marque-nom');
  await expect(marque.locator('img[src^="data:image/svg+xml;base64,"]')).toHaveCount(1);
  await section.locator('[data-action="retirer-logo"]').click();
  await section.locator('[data-action="enregistrer"]').click();
  await expect(section.locator('[data-role="pas-de-logo"]')).toBeVisible();
  await expect(marque.locator('img[src^="data:"]')).toHaveCount(0);
});

// Nom et logo changés par les AUTRES comptes de la maison (27/11/2026, accord de Jérôme) et journal : tests/e2e/maison-nom-logo-comptes.spec.js.
test('4 chez Jérôme (pas une maison de client) : Mon espace reste en lecture seule, sans formulaire', async ({ page }) => {
  await ouvrir(page, JEROME, 'reglages');
  await expect(page.locator('#reglages-identite')).toBeVisible();
  await expect(page.locator('[data-role="mon-espace-maison"]')).toHaveCount(0);
});
