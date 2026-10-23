// Module Maintenance (id technique « tableaudebord ») dans le navigateur, sur les émulateurs : critères R1 à R10 du brief (R11 et R12 sont dans test:logique).
// Depuis le 23/10/2026 : UN SEUL écran, sans onglets ni sous-onglets « Tout voir / À traiter » (règle de Jérôme). Les tests U1 à U5 portent sur cette structure ;
// les tests R, S6 et S7 gardent leur exigence métier sur la nouvelle structure (blocs par famille, bouton « Filtres », « Historique des saisies » replié).
// Les indicateurs d'essai sont fabriqués ici (jamais lus dans la vraie base). Les captures vont dans tests/e2e/captures/tableaudebord/.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, ecrireDocument, lireDocument, estTelephone, allerA, PROJET, FIRESTORE, jour, JEROME } from './outils.js';

// Ce que fait le vrai serveur (scripts/porte/saisie-tableaudebord.js, testé à part) : Playwright ne charge pas ce fichier, les valeurs sont donc répétées ici.
const RAPPEL = 'Prochaine vérification conseillée dans 100 jours';
const PERIME_APRES_MINUTES = 100 * 24 * 60;
const niveauDeEcheance = (ms, maintenant) => (ms - maintenant < 0 ? 'rouge' : ms - maintenant < 30 * 24 * 3600 * 1000 ? 'orange' : 'vert');

const MIN = 60000;
const JOUR = 24 * 60 * MIN;
const apres = (ms) => new Date(Date.now() + ms);
const avant = (ms) => new Date(Date.now() - ms);
const DOSSIER_CAPTURES = fileURLToPath(new URL('./captures/tableaudebord/', import.meta.url));

/** Capture de l'état obtenu, nommée d'après le critère et le format (ordinateur ou téléphone). */
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER_CAPTURES}${nom}-${info.project.name}.png`, fullPage: true });
}

/** Captures de recette de l'écran unique (au plus 4 : écran complet sur ordinateur et téléphone, filtres ouverts, historique ouvert), dans captures/maintenance-un-ecran/. */
const DOSSIER_RECETTE = fileURLToPath(new URL('./captures/maintenance-un-ecran/', import.meta.url));
async function capturerRecette(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER_RECETTE}${nom}-${info.project.name}.png`, fullPage: true });
}

/** Un indicateur comme la porte l'écrit : tous les champs, les facultatifs absents valent null. */
async function indicateur(id, extra = {}) {
  await ecrireDocument(`tableaudebord_indicateurs/${id}`, {
    tableau: 'technique', famille: 'cles', nom: `Indicateur ${id}`, type: 'etat', niveau: 'vert', message: 'Répond', valeur: null, unite: null, objectif: null,
    echeance: null, releveLe: avant(14 * MIN), perimeApresMinutes: 2 * 24 * 60, methode: 'auto', source: 'essai', procedure: 'Protocole de vérification des clés',
    proprietaire: 'interne', ecritPar: 'github:essai', modifieLe: new Date(), ...extra,
  });
}

/** Jeu d'essai : 3 pannes, 3 à surveiller, 1 relevé trop ancien, 6 OK, dans trois familles. */
async function jeuStandard() {
  await indicateur('github', { nom: 'Jeton de lecture GitHub', message: 'Répond, expire dans 331 jours' });
  await indicateur('google', { nom: 'Autorisations Google', message: 'Acceptées par Google' });
  await indicateur('comptes', { nom: 'Comptes de service (4 clés)', message: 'Les 4 clés répondent' });
  await indicateur('backblaze', { nom: 'Clé d\'application Backblaze', niveau: 'rouge', message: 'Clé refusée par le service' });
  await indicateur('n8n', { nom: 'Clé API de n8n', niveau: 'orange', message: 'Date d\'expiration à vérifier', methode: 'manuel', releveLe: avant(9 * JOUR), perimeApresMinutes: 90 * 24 * 60 });
  await indicateur('perimee', { nom: 'Clé Buffer', niveau: 'vert', message: 'Répond', releveLe: avant(3 * JOUR), perimeApresMinutes: 2 * 24 * 60 });
  await indicateur('rouge-perimee', { nom: 'Clé Notion', niveau: 'rouge', message: 'Refusée', releveLe: avant(10 * JOUR), perimeApresMinutes: 2 * 24 * 60 });
  await indicateur('echeance12', { nom: 'Certificat du site', niveau: 'vert', message: 'Valide', echeance: apres(12 * JOUR), methode: 'semi' });
  await indicateur('echeance-passee', { nom: 'Domaine du site', niveau: 'vert', message: 'Valide', echeance: avant(2 * JOUR), methode: 'manuel' });
  await indicateur('copie-code', { famille: 'sauvegardes', nom: 'Code GitHub vers Backblaze', message: 'Dernière copie il y a 6 h', procedure: 'Carte des sauvegardes' });
  await indicateur('copie-base', { famille: 'sauvegardes', nom: 'Base vers Backblaze', message: 'Dernière copie il y a 3 jours', procedure: 'Carte des sauvegardes' });
  await indicateur('restauration', { famille: 'sauvegardes', nom: 'Essai de restauration', niveau: 'orange', message: 'Dernier essai il y a 34 jours', procedure: 'Carte des sauvegardes' });
  await indicateur('workflows', { famille: 'automatisations', nom: 'Workflows actifs (24)', message: 'Aucun échec depuis 3 jours', procedure: 'Journal des automatisations' });
  await indicateur('veille', { famille: 'automatisations', nom: 'Veille du lundi', message: 'Dernière exécution réussie', procedure: 'Journal des automatisations' });
}
const COMPTES_STANDARD = { rouge: 3, orange: 3, gris: 1, vert: 7 };

async function ouvrir(page, ecran = 'general') {
  await connecter(page, undefined, { route: `tableaudebord/${ecran}` });
  await expect(page.getByRole('heading', { name: 'Maintenance', level: 1 })).toBeVisible();
}
const aller = (page, ecran) => page.evaluate((e) => { location.hash = `#/tableaudebord/${e}`; }, ecran);
// Une ligne d'un bloc de famille (tous les indicateurs) ; `ligneATraiter` = la même ligne dans « À traiter en premier » (en haut de l'écran).
const ligne = (page, id) => page.locator(`.td-famille .td-ligne[data-id="${id}"]`);
const ligneATraiter = (page, id) => page.locator(`[data-liste="a-traiter"] .td-ligne[data-id="${id}"]`);
const niveaux = (page, portee = '.td-famille') => page.locator(`${portee} .td-ligne`).evaluateAll((els) => els.map((e) => e.dataset.niveau));
/** Ouvre la fenêtre commune « Filtres », règle « À traiter seulement » (true/false) et coche ces familles, puis « Appliquer ». */
async function filtrerAvec(page, { traiter = null, familles = [] } = {}) {
  await page.locator('[data-action="filtres"]').click();
  const fenetre = page.getByRole('dialog');
  if (traiter !== null) await fenetre.locator('input[data-cle="traiter"]').setChecked(traiter);
  for (const f of familles) await fenetre.locator(`input[data-cle="familles"][data-valeur="${f}"]`).check();
  await fenetre.getByRole('button', { name: 'Appliquer' }).click();
}
const puces = (page) => page.locator('.td-pastilles .pastille-filtre');
const AUCUN_ONGLET = '.td-onglets, .td-onglet, .td-segment, [aria-label="Tableaux"]';
const SANS_DEBORDEMENT = () => document.documentElement.scrollWidth <= document.documentElement.clientWidth && document.body.scrollWidth <= document.body.clientWidth;
const avecReglesQuiRefusent = async () => {
  const contenu = (await readFile(fileURLToPath(new URL('../../firestore.rules', import.meta.url)), 'utf8'))
    .replace(/(match \/tableaudebord_indicateurs\/\{id\} \{\s*allow read: if )compteAutorise\(\)/, '$1false');
  return chargerRegles(contenu);
};
async function chargerRegles(contenu) {
  const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: contenu }] } }),
  });
  if (!r.ok) throw new Error(`Règles non chargées : ${await r.text()}`);
}
const rendreLesVraiesRegles = async () => chargerRegles(await readFile(fileURLToPath(new URL('../../firestore.rules', import.meta.url)), 'utf8'));

// ---------------------------------------------------------------- R1

test('R1 le menu contient UNE entrée « Maintenance » chez Jérôme ; elle ouvre l\'écran unique (aucun onglet)', async ({ page }, info) => {
  await jeuStandard();
  await connecter(page);
  if (estTelephone(page)) await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  const bloc = page.locator('.menu-groupe[data-bloc="tableaudebord"]');
  await expect(bloc.locator('.menu-groupe-titre')).toHaveCount(0); // PR B : plus de titres de groupes
  await expect(bloc.locator('.menu-entree')).toHaveText(['Maintenance']);
  await capturer(page, info, 'R1-menu');
  await bloc.getByRole('link', { name: 'Maintenance', exact: true }).click();
  await expect(page).toHaveURL(/#\/tableaudebord\/general$/);
  await expect(page.getByRole('heading', { name: 'Maintenance', level: 1 })).toBeVisible();
  await expect(page.locator(AUCUN_ONGLET)).toHaveCount(0);
  await expect(bloc.locator('.menu-entree')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.td-phrase')).toBeVisible();
  // Une adresse inconnue du module revient sur l'arrivée (general) ; technique, finance, stocks et historique sont acceptées (signets) : voir U3.
  await aller(page, 'nimportequoi');
  await expect(page).toHaveURL(/#\/tableaudebord\/general$/);
  await capturer(page, info, 'R1-general');
});

// ---------------------------------------------------------------- R2, R3, R4

test('R2 un « vert » au relevé périmé s\'affiche gris « Relevé trop ancien » ; un « rouge » reste rouge même périmé', { tag: '@sans-telephone' }, async ({ page }, info) => {
  await jeuStandard();
  await ouvrir(page, 'technique');
  await expect(ligne(page, 'perimee')).toHaveAttribute('data-niveau', 'gris');
  await expect(ligne(page, 'perimee').locator('[data-pastille]')).toHaveText('Relevé trop ancien');
  await expect(ligne(page, 'perimee').locator('.td-releve')).toHaveText('relevé il y a 3 j');
  await expect(ligne(page, 'rouge-perimee')).toHaveAttribute('data-niveau', 'rouge');
  await expect(ligne(page, 'rouge-perimee').locator('[data-pastille]')).toHaveText('Panne');
  await expect(ligne(page, 'github')).toHaveAttribute('data-niveau', 'vert');
  await capturer(page, info, 'R2-gris-et-rouge-perime');
});

test('R3 une échéance dans 12 jours affiche « À surveiller » même si le script a écrit « vert » ; une échéance passée affiche « Panne »', { tag: '@sans-telephone' }, async ({ page }, info) => {
  await jeuStandard();
  await ouvrir(page, 'technique');
  await expect(ligne(page, 'echeance12').locator('[data-pastille]')).toHaveText('À surveiller');
  await expect(ligne(page, 'echeance12').locator('.td-echeance')).toHaveText('Échéance dans 12 jours');
  await expect(ligne(page, 'echeance-passee').locator('[data-pastille]')).toHaveText('Panne');
  await expect(ligne(page, 'echeance-passee').locator('.td-echeance')).toHaveText('Échéance dépassée depuis 2 jours');
  await capturer(page, info, 'R3-echeances');
});

test('R4 chaque pastille a une icône ET un mot (aucun élément d\'état sans texte), dans toutes les zones de l\'écran unique ; une mesure sans niveau n\'a pas de pastille', async ({ page }, info) => {
  await jeuStandard();
  await indicateur('mesure-sans-niveau', { tableau: 'technique', famille: 'cles', nom: 'Jours avant renouvellement', type: 'mesure', niveau: null, valeur: 42, unite: 'jours', message: null });
  await ouvrir(page, 'technique');
  // Un seul écran : la phrase d'état, « À traiter en premier » et les blocs par famille portent tous des pastilles (icône ET mot).
  await expect(page.locator('[data-pastille]').first()).toBeVisible();
  const pastilles = await page.locator('[data-pastille]').evaluateAll((els) => els.map((e) => ({ svg: e.querySelectorAll('svg').length, texte: e.textContent.trim(), niveau: e.dataset.pastille })));
  expect(pastilles.length).toBeGreaterThan(8);
  for (const p of pastilles) {
    expect(p.svg, JSON.stringify(p)).toBe(1);
    expect(p.texte.length, JSON.stringify(p)).toBeGreaterThan(1);
  }
  await expect(page.locator('.td-phrase [data-pastille], [data-liste="a-traiter"] [data-pastille]').first()).toBeVisible();
  await capturer(page, info, 'R4-pastilles');
  const mesure = ligne(page, 'mesure-sans-niveau');
  await expect(mesure).toHaveAttribute('data-niveau', 'sans');
  await expect(mesure.locator('[data-pastille]')).toHaveCount(0);
  await expect(mesure.locator('.td-valeur')).toHaveText('42 jours');
});

// ---------------------------------------------------------------- R5

test('R5 blocs par famille (clés d\'abord, puis alphabétique), tri rouge puis orange puis gris puis vert, le filtre « À traiter seulement » (bouton Filtres) masque les verts', async ({ page }, info) => {
  await jeuStandard();
  await ouvrir(page, 'technique');
  await expect(page.locator('.td-famille h2')).toHaveText(['Clés et autorisations', 'Automatisations', 'Sauvegardes']);
  const cles = await niveaux(page, '.td-famille[data-famille="cles"]');
  expect(cles).toEqual(['rouge', 'rouge', 'rouge', 'orange', 'orange', 'gris', 'vert', 'vert', 'vert']);
  // À égalité, ordre alphabétique du nom
  await expect(page.locator('.td-famille[data-famille="cles"] .td-ligne .td-nom').evaluateAll((els) => els.slice(0, 3).map((e) => e.textContent)))
    .resolves.toEqual(['Clé d\'application Backblaze', 'Clé Notion', 'Domaine du site']);
  // Chaque ligne : nom, pastille, message, « relevé il y a … », méthode, procédure en texte simple (pas de lien)
  const l = ligne(page, 'n8n');
  await expect(l.locator('.td-nom')).toHaveText('Clé API de n8n');
  await expect(l.locator('[data-pastille]')).toHaveText('À surveiller');
  await expect(l.locator('.td-message')).toHaveText('Date d\'expiration à vérifier');
  await expect(l.locator('.td-releve')).toHaveText('relevé il y a 9 j');
  await expect(l.locator('.td-methode')).toHaveText('manuel');
  await expect(l.locator('.td-procedure')).toHaveText('Procédure : Protocole de vérification des clés');
  await expect(l.locator('a')).toHaveCount(0);
  await expect(ligne(page, 'echeance12').locator('.td-methode')).toHaveText('semi');
  await expect(ligne(page, 'github').locator('.td-methode')).toHaveText('auto');
  await capturer(page, info, 'R5-tout-voir');
  // Filtre « À traiter seulement » : plus aucun vert, les blocs sans rien à traiter disparaissent
  await filtrerAvec(page, { traiter: true });
  await expect(puces(page)).toHaveText(['À traiter seulement']);
  await expect(page.locator('[data-action="filtres"] .compteur-filtres')).toHaveText('1');
  expect((await niveaux(page)).filter((n) => n === 'vert')).toHaveLength(0);
  expect((await niveaux(page)).length).toBe(7);
  await expect(page.locator('.td-famille h2')).toHaveText(['Clés et autorisations', 'Sauvegardes']);
  // Les compteurs d'un bloc restent ceux de tout le bloc
  await expect(page.locator('.td-famille[data-famille="cles"] [data-compteur="vert"]')).toHaveText('3 OK');
  await capturer(page, info, 'R5-a-traiter');
  await page.getByRole('button', { name: 'Retirer le filtre : À traiter seulement' }).click();
  expect((await niveaux(page)).length).toBe(14);
  await expect(puces(page)).toHaveCount(0);
});

test('R5 les filtres se combinent (À traiter + famille) et chaque liste ne propose que les valeurs possibles', async ({ page }) => {
  await jeuStandard();
  await ouvrir(page, 'technique');
  const casesFamille = () => page.getByRole('dialog').locator('input[data-cle="familles"]').evaluateAll((els) => els.map((e) => e.closest('label').textContent.trim()));
  await page.locator('[data-action="filtres"]').click();
  expect(await casesFamille()).toEqual(['Clés et autorisations', 'Automatisations', 'Sauvegardes']);
  await page.getByRole('dialog').getByRole('button', { name: 'Appliquer' }).click();
  await filtrerAvec(page, { traiter: true });
  await page.locator('[data-action="filtres"]').click();
  expect(await casesFamille()).toEqual(['Clés et autorisations', 'Sauvegardes']); // « Automatisations » n'a rien à traiter : elle n'est plus proposée
  await page.getByRole('dialog').locator('input[data-cle="familles"][data-valeur="sauvegardes"]').check();
  await page.getByRole('dialog').getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('.td-famille .td-ligne')).toHaveCount(1);
  await expect(page.locator('.td-famille .td-ligne .td-nom')).toHaveText('Essai de restauration');
  await expect(puces(page)).toHaveText(['À traiter seulement', 'Sauvegardes']);
  await page.getByRole('button', { name: 'Retirer le filtre : À traiter seulement' }).click();
  await expect(page.locator('.td-famille .td-ligne')).toHaveCount(3); // la famille reste choisie
  await page.getByRole('button', { name: 'Retirer le filtre : Sauvegardes' }).click();
  await expect(page.locator('.td-famille .td-ligne')).toHaveCount(14);
});

// ---------------------------------------------------------------- R6

test('R6 en haut de l\'écran : phrase d\'état, compteurs et liste « À traiter en premier » cohérents avec les blocs par famille', async ({ page }, info) => {
  await jeuStandard();
  await ouvrir(page, 'general');
  await expect(page.locator('.td-famille .td-ligne')).toHaveCount(14); // attend que les indicateurs soient affichés avant de les compter
  const technique = {};
  for (const n of await niveaux(page)) technique[n] = (technique[n] ?? 0) + 1;
  expect(technique).toEqual(COMPTES_STANDARD);
  const idsATraiter = await page.locator('.td-famille .td-ligne:not([data-niveau="vert"])').evaluateAll((els) => els.map((e) => e.dataset.id).sort());
  await expect(page.locator('.td-phrase')).toHaveText('3 pannes à traiter');
  await expect(page.locator('.td-phrase')).toHaveAttribute('data-niveau', 'rouge');
  await expect(page.locator('.td-global [data-compteur="rouge"]')).toHaveText('3 pannes');
  await expect(page.locator('.td-global [data-compteur="orange"]')).toHaveText('3 À surveiller');
  await expect(page.locator('.td-global [data-compteur="gris"]')).toHaveText('1 relevé trop ancien');
  await expect(page.locator('.td-global [data-compteur="vert"]')).toHaveText('7 OK');
  await expect(page.getByRole('heading', { name: 'À traiter en premier' })).toBeVisible();
  const general = await page.locator('[data-liste="a-traiter"] .td-ligne').evaluateAll((els) => els.map((e) => [e.dataset.id, e.dataset.niveau]));
  expect(general.map((x) => x[0]).sort()).toEqual(idsATraiter);
  expect(general.map((x) => x[1])).toEqual(['rouge', 'rouge', 'rouge', 'orange', 'orange', 'orange', 'gris']);
  await expect(page.locator('[data-liste="a-traiter"] .td-ligne').first().locator('.td-nom small')).toHaveText('Clés et autorisations');
  // Objectifs et courbes arrivent à l'étape suivante : rien à leur place
  await expect(page.locator('body')).not.toContainText(/Objectifs|tendance|Rafraîchir|Saisir(?! la (date|valeur))/);
  await capturer(page, info, 'R6-general');
});

test('R6 phrase d\'état : « Une panne à traiter » au singulier, « Tout marche, quelques points à surveiller », « Tout fonctionne », et « Rien à traiter. »', async ({ page }, info) => {
  await indicateur('a', { nom: 'A' });
  await indicateur('b', { nom: 'B', famille: 'sauvegardes' });
  await ouvrir(page, 'general');
  await expect(page.locator('.td-phrase')).toHaveText('Tout fonctionne');
  await expect(page.locator('.td-phrase')).toHaveAttribute('data-niveau', 'vert');
  await expect(page.locator('.td-rien')).toHaveText('Rien à traiter.');
  await capturer(page, info, 'R6-general-tout-fonctionne');
  await indicateur('b', { nom: 'B', famille: 'sauvegardes', niveau: 'orange' });
  await expect(page.locator('.td-phrase')).toHaveText('Tout marche, quelques points à surveiller');
  await indicateur('b', { nom: 'B', famille: 'sauvegardes', niveau: 'rouge' });
  await expect(page.locator('.td-phrase')).toHaveText('Une panne à traiter');
  await capturer(page, info, 'R6-general-une-panne');
});

// ---------------------------------------------------------------- R7

test('R7 Finance et Stocks sont des blocs de famille comme les autres, présents seulement quand un indicateur les porte (aucun onglet)', async ({ page }, info) => {
  await jeuStandard();
  await ouvrir(page, 'general');
  await expect(page.locator(AUCUN_ONGLET)).toHaveCount(0);
  await expect(page.locator('.td-famille h2')).toHaveText(['Clés et autorisations', 'Automatisations', 'Sauvegardes']);
  await capturer(page, info, 'R7-sans-finance-ni-stocks');
  await indicateur('marge', { tableau: 'finance', famille: 'finance', nom: 'Marge du mois', type: 'mesure', niveau: null, valeur: 1240, unite: '€', message: 'Marge brute' });
  await expect(page.locator('.td-famille h2')).toHaveText(['Clés et autorisations', 'Automatisations', 'Finance', 'Sauvegardes']);
  await indicateur('stock-papier', { tableau: 'stocks', famille: 'papier', nom: 'Rames de papier', niveau: 'orange', message: 'Il en reste 4' });
  await expect(page.locator('.td-famille h2')).toHaveText(['Clés et autorisations', 'Automatisations', 'Finance', 'Papier', 'Sauvegardes']);
  await expect(page.locator(AUCUN_ONGLET)).toHaveCount(0);
  await expect(ligne(page, 'marge').locator('.td-valeur')).toHaveText(`${new Intl.NumberFormat('fr-FR').format(1240)} €`);
  await expect(ligne(page, 'marge').locator('[data-pastille]')).toHaveCount(0);
  await expect(ligne(page, 'stock-papier').locator('[data-pastille]')).toHaveText('À surveiller');
  await expect(page.locator('.td-famille .td-ligne')).toHaveCount(16); // tout est sur le même écran
  // Les compteurs du haut comptent tous les indicateurs (14 + 2 = 16, dont une mesure sans pastille)
  await expect(page.locator('.td-global [data-compteur="orange"]')).toHaveText('4 À surveiller');
  await expect(page.locator('.td-global [data-compteur="vert"]')).toHaveText('7 OK');
  await capturer(page, info, 'R7-avec-finance-et-stocks');
});

// ---------------------------------------------------------------- R8

test('R8 vide : aucun indicateur, l\'écran dit pourquoi (Maintenance, et les routes technique et général)', async ({ page }, info) => {
  await ouvrir(page, 'general');
  const MESSAGE = 'Aucun indicateur pour l\'instant. Les relevés arrivent chaque jour, après le premier passage des scripts de surveillance.';
  await expect(page.locator('.td-etat-ecran.td-vide')).toHaveText(MESSAGE);
  await expect(page.locator('.td-phrase')).toHaveCount(0);
  await expect(page.locator('[data-action="filtres"]')).toBeDisabled(); // rien à filtrer
  await expect(page.locator(AUCUN_ONGLET)).toHaveCount(0);
  await capturer(page, info, 'R8-vide');
  await aller(page, 'technique');
  await expect(page.locator('.td-etat-ecran.td-vide')).toHaveText(MESSAGE);
  // Un indicateur arrive : l'écran vide cède la place sans rechargement
  await indicateur('premier');
  await expect(page.locator('.td-etat-ecran')).toHaveCount(0);
  await expect(ligne(page, 'premier')).toBeVisible();
});

test('R8 chargement : « Chargement des indicateurs… » tant que la base n\'a pas répondu, sur l\'écran unique', async ({ page }, info) => {
  // La base « ne répond pas » : on sert le fichier de lecture du module avec une écoute qui ne rappelle jamais l'écran (seul ce fichier est modifié, dans ce test).
  await page.route('**/js/modules/tableaudebord/donnees.js', async (route) => {
    const source = await readFile(fileURLToPath(new URL('../../js/modules/tableaudebord/donnees.js', import.meta.url)), 'utf8');
    expect(source).toContain('desabonnement = onSnapshot(');
    await route.fulfill({ status: 200, contentType: 'text/javascript', body: source.replace('desabonnement = onSnapshot(', 'desabonnement = (() => () => {})(') });
  });
  await jeuStandard();
  await ouvrir(page, 'general');
  for (const ecran of ['general', 'technique']) {
    await aller(page, ecran);
    await expect(page.locator('.td-etat-ecran.td-chargement')).toHaveText('Chargement des indicateurs…');
    await expect(page.locator('.td-etat-ecran.td-chargement')).toHaveAttribute('role', 'status');
    await expect(page.locator('.td-ligne, .td-phrase, .td-erreur')).toHaveCount(0);
    await expect(page.locator('[data-action="filtres"]')).toBeDisabled();
    await expect(page.locator(AUCUN_ONGLET)).toHaveCount(0);
  }
  await capturer(page, info, 'R8-chargement');
});

test('R8 erreur de lecture : message clair et « Réessayer » ; le bouton relit la base', async ({ page }, info) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues' }); // la lecture refusée est notée dans la console du navigateur
  await jeuStandard();
  await avecReglesQuiRefusent();
  try {
    await ouvrir(page, 'general');
    const erreur = page.locator('.td-etat-ecran.td-erreur');
    await expect(erreur).toContainText('Impossible de lire les indicateurs pour le moment.');
    await expect(erreur).toContainText('clique sur « Réessayer »');
    await expect(erreur.getByRole('button', { name: 'Réessayer' })).toBeVisible();
    await expect(page.locator('.td-phrase')).toHaveCount(0);
    await expect(page.locator('[data-action="filtres"]')).toBeDisabled();
    await capturer(page, info, 'R8-erreur');
    // Toujours refusé : « Réessayer » relit, l'erreur revient (le bouton n'invente rien)
    await erreur.getByRole('button', { name: 'Réessayer' }).click();
    await expect(erreur.getByRole('button', { name: 'Réessayer' })).toBeVisible();
    await aller(page, 'technique');
    await expect(erreur).toContainText('Impossible de lire les indicateurs pour le moment.');
    await expect(erreur.getByRole('button', { name: 'Réessayer' })).toBeVisible();
    // La base redevient lisible : « Réessayer » affiche les indicateurs
    await rendreLesVraiesRegles();
    await erreur.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.locator('.td-ligne').first()).toBeVisible();
    await expect(page.locator('.td-erreur')).toHaveCount(0);
    await aller(page, 'general');
    await expect(page.locator('.td-phrase')).toHaveText('3 pannes à traiter');
  } finally {
    await rendreLesVraiesRegles();
  }
});

// ---------------------------------------------------------------- R9

test('R9 mise à jour en direct : un indicateur modifié dans la base change à l\'écran sans recharger', { tag: '@sans-telephone' }, async ({ page }, info) => {
  await indicateur('a', { nom: 'Clé A', message: 'Répond' });
  await indicateur('b', { nom: 'Clé B', message: 'Répond' });
  await ouvrir(page, 'technique');
  await page.evaluate(() => { window.__sansRechargement = true; });
  await expect(ligne(page, 'a')).toHaveAttribute('data-niveau', 'vert');
  await indicateur('a', { nom: 'Clé A', niveau: 'rouge', message: 'Clé refusée à l\'instant' });
  await expect(ligne(page, 'a')).toHaveAttribute('data-niveau', 'rouge');
  await expect(ligne(page, 'a').locator('.td-message')).toHaveText('Clé refusée à l\'instant');
  await expect(ligne(page, 'a')).toBeVisible();
  expect(await niveaux(page)).toEqual(['rouge', 'vert']); // le tri suit
  await indicateur('c', { nom: 'Clé C', message: 'Nouvelle clé' }); // un indicateur nouveau apparaît
  await expect(ligne(page, 'c')).toBeVisible();
  await expect(page.locator('.td-phrase')).toHaveText('Une panne à traiter');
  await indicateur('a', { nom: 'Clé A', niveau: 'vert', message: 'Répond de nouveau' });
  await expect(page.locator('.td-phrase')).toHaveText('Tout fonctionne');
  expect(await page.evaluate(() => window.__sansRechargement)).toBe(true);
  await capturer(page, info, 'R9-direct');
});

test('R9 le « relevé il y a … » et le gris se recalculent chaque minute, sans recharger', { tag: '@sans-telephone' }, async ({ page }, info) => {
  await page.clock.install({ time: new Date() });
  await indicateur('court', { nom: 'Relevé de 30 minutes', releveLe: avant(10 * MIN), perimeApresMinutes: 30 });
  await ouvrir(page, 'technique');
  await expect(ligne(page, 'court')).toHaveAttribute('data-niveau', 'vert');
  await expect(ligne(page, 'court').locator('.td-releve')).toHaveText('relevé il y a 10 min');
  await page.evaluate(() => { window.__sansRechargement = true; });
  await page.clock.fastForward(21 * MIN); // une minute d'horloge de l'écran passe : il se recalcule
  await expect(ligne(page, 'court')).toHaveAttribute('data-niveau', 'gris');
  await expect(ligne(page, 'court').locator('[data-pastille]')).toHaveText('Relevé trop ancien');
  await expect(ligne(page, 'court').locator('.td-releve')).toHaveText('relevé il y a 31 min');
  expect(await page.evaluate(() => window.__sansRechargement)).toBe(true);
  await capturer(page, info, 'R9-minute');
});

// ---------------------------------------------------------------- R10

for (const theme of ['sombre', 'clair']) {
  test(`R10 thème ${theme} : l\'écran unique est lisible, sans défilement horizontal de la page`, async ({ page }, info) => {
    await jeuStandard();
    await indicateur('mesure', { nom: 'Jours avant renouvellement', type: 'mesure', niveau: null, valeur: 42, unite: 'jours', message: null });
    await ouvrir(page, 'general');
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
    await expect(page.locator('.td-phrase')).toBeVisible();
    await expect(page.locator('.td-famille').first()).toBeVisible();
    expect(await page.evaluate(SANS_DEBORDEMENT), 'écran : défilement horizontal').toBe(true);
    // Les couleurs d'état viennent bien de la feuille du module, selon le thème
    const couleurs = await page.evaluate(() => Object.fromEntries(['vert', 'orange', 'rouge', 'gris'].map((n) => [n, getComputedStyle(document.documentElement).getPropertyValue(`--td-${n}`).trim()])));
    expect(couleurs).toEqual(theme === 'sombre'
      ? { vert: '#5fd39a', orange: '#f5a524', rouge: '#f0506e', gris: '#9a98a0' }
      : { vert: '#1d7a4b', orange: '#9a6200', rouge: '#b3123f', gris: '#6b6a70' });
    await capturer(page, info, `R10-ecran-${theme}`);
    await filtrerAvec(page, { traiter: true });
    expect(await page.evaluate(SANS_DEBORDEMENT), 'écran filtré : défilement horizontal').toBe(true);
  });
}

test('R10 aucune écriture : en parcourant les écrans, le navigateur n\'envoie aucune écriture à la base', async ({ page }) => {
  await jeuStandard();
  const ecritures = [];
  page.on('request', (r) => { if (/:commit|\/documents.*(PATCH|POST|DELETE)/.test(r.url()) && r.method() !== 'GET' && /tableaudebord/.test(r.postData() ?? '')) ecritures.push(r.url()); });
  await ouvrir(page, 'general');
  await aller(page, 'technique');
  await filtrerAvec(page, { traiter: true });
  await page.waitForTimeout(500);
  expect(ecritures).toEqual([]);
  // Les seuls boutons du contenu : « Saisir la date » (indicateurs manuels ou semi, jamais « auto »). Aucun n'écrit dans la base : la saisie passe par le serveur.
  // Les filtres sont dans la barre du haut (bouton « Filtres », puces retirables).
  const boutons = await page.evaluate(() => [...document.querySelectorAll('.td-contenu button')].map((b) => b.textContent.trim()));
  expect(boutons.length).toBeGreaterThan(0);
  expect(new Set(boutons)).toEqual(new Set(['Saisir la date']));
});

// ---------------------------------------------------------------- S6 saisie d'une date ou d'une valeur

/**
 * Fonction `tableaudebordSaisir` simulée dans le navigateur (aucun serveur réel), comme `veille` : on note les demandes reçues, puis le simulateur ÉCRIT lui-même l'indicateur
 * dans l'émulateur (ce que ferait le vrai serveur), sinon le niveau ne changerait pas tout seul à l'écran. `mode` : 'ok' | 'refus' | 'panne' | 'lent'.
 */
async function simulerSaisie(page, { mode = 'ok', message = 'Cet indicateur est vérifié automatiquement : il n\'y a rien à saisir.' } = {}) {
  const recues = [];
  const etat = { mode, liberer: null };
  await page.route(/cloudfunctions\.net\/tableaudebordSaisir$/, async (route) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const d = JSON.parse(route.request().postData() ?? '{}').data;
    recues.push(d);
    if (etat.mode === 'lent') await new Promise((ok) => { etat.liberer = ok; });
    if (etat.mode === 'refus') return route.fulfill({ status: 400, headers: cors, contentType: 'application/json', body: JSON.stringify({ error: { status: 'FAILED_PRECONDITION', message } }) });
    if (etat.mode === 'panne') return route.fulfill({ status: 500, headers: cors, contentType: 'application/json', body: JSON.stringify({ error: { status: 'INTERNAL', message: 'Une erreur est survenue. Réessaie.' } }) });
    const maintenant = new Date();
    const existant = await lireDocument(`tableaudebord_indicateurs/${d.indicateurId}`);
    const mesure = d.valeur !== undefined;
    const echeance = mesure ? null : new Date(d.echeance);
    const niveau = mesure ? null : niveauDeEcheance(echeance.getTime(), maintenant.getTime());
    const message2 = `Saisi par ${JEROME}`;
    await ecrireDocument(`tableaudebord_indicateurs/${d.indicateurId}`, {
      ...existant, ...(mesure ? { valeur: d.valeur } : { echeance }), niveau, message: message2, releveLe: maintenant, saisiPar: JEROME, saisiLe: maintenant, perimeApresMinutes: PERIME_APRES_MINUTES,
    });
    await ecrireDocument(`tableaudebord_releves/${d.indicateurId}_${maintenant.toISOString().replace(/[-:.]/g, '')}`, {
      indicateurId: d.indicateurId, releveLe: maintenant, ...(mesure ? { valeur: d.valeur } : { echeance }), niveau, message: message2, saisie: true, saisiPar: JEROME, saisiLe: maintenant,
      avant: mesure ? { valeur: existant?.valeur ?? null } : { echeance: existant?.echeance ?? null }, commentaire: d.commentaire ?? null, proprietaire: 'interne',
    });
    return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ result: { ok: true, niveau, message: message2, rappel: RAPPEL } }) });
  });
  return { recues, etat };
}
const zone = (page, id) => page.locator(`.td-saisie[data-saisie="${id}"]`);
const boutonSaisir = (page, id) => ligne(page, id).locator('[data-saisir]');
async function jeuSaisie() {
  await jeuStandard();
  await indicateur('stock', { tableau: 'stocks', famille: 'stock', nom: 'Bouteilles de Bordeaux', type: 'mesure', niveau: null, valeur: 42, unite: 'bouteilles', message: null, methode: 'manuel', echeance: null });
}

test('S6 « Saisir la date » sur un indicateur manuel ou semi, « Saisir la valeur » sur une mesure, rien sur un indicateur auto (dans les blocs de famille et dans « À traiter en premier »)', async ({ page }, info) => {
  await jeuSaisie();
  await ouvrir(page, 'technique');
  await expect(boutonSaisir(page, 'n8n')).toHaveText('Saisir la date');
  await expect(boutonSaisir(page, 'echeance12')).toHaveText('Saisir la date'); // méthode semi
  await expect(boutonSaisir(page, 'echeance-passee')).toHaveText('Saisir la date');
  for (const auto of ['github', 'google', 'backblaze', 'perimee']) {
    await expect(ligne(page, auto)).toBeVisible();
    await expect(boutonSaisir(page, auto)).toHaveCount(0);
  }
  await capturer(page, info, 'S6-boutons');
  await expect(ligneATraiter(page, 'n8n').locator('[data-saisir]')).toHaveText('Saisir la date'); // aussi dans « À traiter en premier »
  await expect(ligneATraiter(page, 'backblaze').locator('[data-saisir]')).toHaveCount(0);
  await aller(page, 'stocks');
  await expect(boutonSaisir(page, 'stock')).toHaveText('Saisir la valeur');
  await capturer(page, info, 'S6-bouton-valeur-stocks');
});

test('S6 saisir une date : zone sous la ligne, enregistrement, message « Enregistré », niveau changé sans recharger', async ({ page }, info) => {
  await jeuSaisie();
  const srv = await simulerSaisie(page);
  await ouvrir(page, 'technique');
  await expect(ligne(page, 'n8n')).toHaveAttribute('data-niveau', 'orange');
  await page.evaluate(() => { window.__sansRechargement = true; });
  await boutonSaisir(page, 'n8n').click();
  const z = zone(page, 'n8n');
  await expect(z).toBeVisible();
  await expect(z.getByLabel('Nouvelle date d\'échéance')).toBeFocused();
  await expect(z.getByLabel('Note (facultatif)')).toBeVisible();
  await expect(z.getByRole('button', { name: 'Enregistrer' })).toBeVisible();
  await expect(z.getByRole('button', { name: 'Annuler' })).toBeVisible();
  await expect(boutonSaisir(page, 'n8n')).toHaveCount(0); // la zone remplace le bouton
  await expect(ligne(page, 'n8n').locator('.td-saisie')).toHaveCount(1); // la zone est DANS la ligne : pas de fenêtre
  await capturer(page, info, 'S6-zone-ouverte');
  await z.getByLabel('Nouvelle date d\'échéance').fill(jour(200));
  await z.getByLabel('Note (facultatif)').fill('Clé renouvelée dans la console n8n');
  await z.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.td-avis')).toContainText('Enregistré');
  await expect(page.locator('.td-avis')).toContainText('Prochaine vérification conseillée dans 100 jours');
  await expect(page.locator('.td-avis')).toContainText('Clé API de n8n');
  await expect(ligne(page, 'n8n')).toHaveAttribute('data-niveau', 'vert');
  await expect(ligne(page, 'n8n').locator('[data-pastille]')).toHaveText('OK');
  await expect(ligne(page, 'n8n').locator('.td-echeance')).toContainText('Échéance dans');
  await expect(ligne(page, 'n8n').locator('.td-message')).toHaveText(`Saisi par ${JEROME}`);
  await expect(zone(page, 'n8n')).toHaveCount(0);
  await expect(boutonSaisir(page, 'n8n')).toHaveText('Saisir la date');
  expect(srv.recues).toEqual([{ indicateurId: 'n8n', echeance: jour(200), commentaire: 'Clé renouvelée dans la console n8n' }]);
  expect(await page.evaluate(() => window.__sansRechargement)).toBe(true);
  await capturer(page, info, 'S6-enregistre');
});

test('S6 saisir une valeur : le nombre est envoyé et la valeur affichée change sans recharger', async ({ page }, info) => {
  await jeuSaisie();
  const srv = await simulerSaisie(page);
  await ouvrir(page, 'stocks');
  await expect(ligne(page, 'stock').locator('.td-valeur')).toHaveText('42 bouteilles');
  await boutonSaisir(page, 'stock').click();
  const z = zone(page, 'stock');
  await z.getByLabel('Nouvelle valeur').fill('37.5');
  await z.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.td-avis')).toContainText('Enregistré');
  await expect(ligne(page, 'stock').locator('.td-valeur')).toHaveText('37,5 bouteilles');
  expect(srv.recues).toEqual([{ indicateurId: 'stock', valeur: 37.5 }]);
  await capturer(page, info, 'S6-valeur-enregistree');
});

test('S6 depuis « À traiter en premier » : la zone s\'ouvre dans cette liste (une seule à l\'écran), la ligne la quitte une fois saisie mais « Enregistré » reste affiché', async ({ page }) => {
  await jeuSaisie();
  await simulerSaisie(page);
  await ouvrir(page, 'general');
  await ligneATraiter(page, 'n8n').locator('[data-saisir]').click();
  await expect(ligneATraiter(page, 'n8n').locator('.td-saisie')).toHaveCount(1);
  await expect(page.locator('.td-saisie')).toHaveCount(1); // pas de seconde zone dans le bloc de famille
  await expect(boutonSaisir(page, 'n8n')).toHaveCount(0); // le bouton de la même ligne est remplacé aussi dans le bloc de famille
  await zone(page, 'n8n').getByLabel('Nouvelle date d\'échéance').fill(jour(200));
  await zone(page, 'n8n').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(ligneATraiter(page, 'n8n')).toHaveCount(0);
  await expect(ligne(page, 'n8n')).toHaveAttribute('data-niveau', 'vert'); // elle reste dans son bloc de famille
  await expect(page.locator('.td-avis')).toContainText('Enregistré');
});

test('S6 annuler ferme la zone sans rien envoyer ; Échap aussi ; le brouillon n\'est pas gardé', async ({ page }, info) => {
  await jeuSaisie();
  const srv = await simulerSaisie(page);
  await ouvrir(page, 'technique');
  await boutonSaisir(page, 'n8n').click();
  await zone(page, 'n8n').getByLabel('Nouvelle date d\'échéance').fill(jour(50));
  await zone(page, 'n8n').getByLabel('Note (facultatif)').fill('Brouillon');
  await capturer(page, info, 'S6-avant-annulation');
  await zone(page, 'n8n').getByRole('button', { name: 'Annuler' }).click();
  await expect(zone(page, 'n8n')).toHaveCount(0);
  await expect(boutonSaisir(page, 'n8n')).toBeFocused();
  await expect(ligne(page, 'n8n')).toHaveAttribute('data-niveau', 'orange');
  await boutonSaisir(page, 'n8n').click();
  await expect(zone(page, 'n8n').getByLabel('Nouvelle date d\'échéance')).toHaveValue('');
  await page.keyboard.press('Escape');
  await expect(zone(page, 'n8n')).toHaveCount(0);
  expect(srv.recues).toEqual([]);
  await capturer(page, info, 'S6-annule');
});

test('S6 une seule zone ouverte à la fois, et la saisie en cours survit à une mise à jour de la base', async ({ page }) => {
  await jeuSaisie();
  await simulerSaisie(page);
  await ouvrir(page, 'technique');
  await boutonSaisir(page, 'n8n').click();
  await zone(page, 'n8n').getByLabel('Note (facultatif)').fill('à garder');
  await indicateur('github', { nom: 'Jeton de lecture GitHub', message: 'Répond encore', modifieLe: new Date() }); // la base change pendant la saisie
  await expect(ligne(page, 'github').locator('.td-message')).toHaveText('Répond encore');
  await expect(zone(page, 'n8n').getByLabel('Note (facultatif)')).toHaveValue('à garder');
  await boutonSaisir(page, 'echeance12').click();
  await expect(page.locator('.td-saisie')).toHaveCount(1);
  await expect(zone(page, 'echeance12')).toBeVisible();
});

test('S6 erreur du serveur : message clair affiché, la zone reste ouverte avec ce qui est tapé ; puis un nouvel essai réussit', async ({ page }, info) => {
  info.annotations.push({ type: 'erreurs-reseau-attendues', description: 'refus et panne simulés du serveur' });
  await jeuSaisie();
  const srv = await simulerSaisie(page, { mode: 'refus', message: 'Cet indicateur est vérifié automatiquement : il n\'y a rien à saisir.' });
  await ouvrir(page, 'technique');
  await boutonSaisir(page, 'n8n').click();
  const z = zone(page, 'n8n');
  await z.getByLabel('Nouvelle date d\'échéance').fill(jour(50));
  await z.getByLabel('Note (facultatif)').fill('Ma note');
  await z.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(z.getByRole('alert')).toHaveText('Cet indicateur est vérifié automatiquement : il n\'y a rien à saisir.');
  await expect(z).toBeVisible();
  await expect(z.getByLabel('Nouvelle date d\'échéance')).toHaveValue(jour(50));
  await expect(z.getByLabel('Note (facultatif)')).toHaveValue('Ma note');
  await expect(z.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
  await expect(page.locator('.td-avis')).toBeEmpty();
  await capturer(page, info, 'S6-erreur');
  srv.etat.mode = 'panne';
  await z.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(z.getByRole('alert')).toHaveText('Une erreur est survenue. Réessaie.');
  srv.etat.mode = 'ok';
  await z.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.td-avis')).toContainText('Enregistré');
  await expect(ligne(page, 'n8n')).toHaveAttribute('data-niveau', 'vert');
  expect(srv.recues).toHaveLength(3);
});

test('S6 champ vide : « Choisis une date. » ou « Entre un nombre. » sans rien envoyer', async ({ page }) => {
  await jeuSaisie();
  const srv = await simulerSaisie(page);
  await ouvrir(page, 'technique');
  await boutonSaisir(page, 'n8n').click();
  await zone(page, 'n8n').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(zone(page, 'n8n').getByRole('alert')).toHaveText('Choisis une date.');
  await aller(page, 'stocks');
  await boutonSaisir(page, 'stock').click();
  await zone(page, 'stock').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(zone(page, 'stock').getByRole('alert')).toHaveText('Entre un nombre.');
  expect(srv.recues).toEqual([]);
});

test('S6 envoi en cours : « Envoi… », boutons et champs désactivés, un second clic n\'envoie rien de plus', async ({ page }, info) => {
  await jeuSaisie();
  const srv = await simulerSaisie(page, { mode: 'lent' });
  await ouvrir(page, 'technique');
  await boutonSaisir(page, 'n8n').click();
  const z = zone(page, 'n8n');
  await z.getByLabel('Nouvelle date d\'échéance').fill(jour(200));
  await z.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(z.getByRole('button', { name: 'Envoi…' })).toBeDisabled();
  await expect(z.getByRole('button', { name: 'Annuler' })).toBeDisabled();
  await expect(z.getByLabel('Nouvelle date d\'échéance')).toBeDisabled();
  await capturer(page, info, 'S6-envoi');
  await expect.poll(() => srv.recues.length).toBe(1);
  srv.etat.mode = 'ok';
  srv.etat.liberer();
  await expect(page.locator('.td-avis')).toContainText('Enregistré');
  expect(srv.recues).toHaveLength(1);
});

for (const theme of ['sombre', 'clair']) {
  test(`S8 thème ${theme} : zone de saisie ouverte, erreur et confirmation sans défilement horizontal`, async ({ page }, info) => {
    info.annotations.push({ type: 'erreurs-reseau-attendues', description: 'refus simulé du serveur' });
    await jeuSaisie();
    const srv = await simulerSaisie(page, { mode: 'refus', message: 'Cet indicateur ne se saisit pas à la main : un message assez long pour vérifier que le texte passe à la ligne sans déborder de l\'écran du téléphone.' });
    await ouvrir(page, 'technique');
    await page.evaluate((x) => { document.documentElement.dataset.theme = x; }, theme);
    await boutonSaisir(page, 'n8n').click();
    expect(await page.evaluate(SANS_DEBORDEMENT), 'zone ouverte : défilement horizontal').toBe(true);
    await capturer(page, info, `S8-saisie-${theme}`);
    await zone(page, 'n8n').getByLabel('Nouvelle date d\'échéance').fill(jour(50));
    await zone(page, 'n8n').getByRole('button', { name: 'Enregistrer' }).click();
    await expect(zone(page, 'n8n').getByRole('alert')).toBeVisible();
    expect(await page.evaluate(SANS_DEBORDEMENT), 'erreur : défilement horizontal').toBe(true);
    await capturer(page, info, `S8-saisie-erreur-${theme}`);
    srv.etat.mode = 'ok';
    await zone(page, 'n8n').getByRole('button', { name: 'Enregistrer' }).click();
    await expect(page.locator('.td-avis')).toContainText('Enregistré');
    expect(await page.evaluate(SANS_DEBORDEMENT), 'confirmation : défilement horizontal').toBe(true);
    await capturer(page, info, `S8-saisie-enregistre-${theme}`);
  });
}

// ---------------------------------------------------------------- S7 Historique des saisies

const MESSAGE_VIDE_HISTORIQUE = 'Aucune saisie pour l\'instant. Quand tu saisis une date ou une valeur, elle apparaît ici avec ton nom et l\'heure.';
async function saisieHistorique(id, indicateurId, quand, extra = {}) {
  await ecrireDocument(`tableaudebord_releves/${id}`, {
    indicateurId, releveLe: quand, saisiLe: quand, niveau: 'vert', message: `Saisi par ${JEROME}`, saisie: true, saisiPar: JEROME, commentaire: null, proprietaire: 'interne', ...extra,
  });
}
async function jeuHistorique() {
  await jeuSaisie();
  await saisieHistorique('n8n_20261001T080000', 'n8n', avant(16 * JOUR), { echeance: new Date('2027-03-01'), avant: { echeance: new Date('2026-12-01') }, commentaire: 'Première saisie' });
  await saisieHistorique('stock_20261016T153000', 'stock', avant(1 * JOUR), { valeur: 37.5, avant: { valeur: 42 }, niveau: null, saisiPar: 'jeromebot.chevalierbot@gmail.com' });
  await saisieHistorique('n8n_20261010T101500', 'n8n', avant(7 * JOUR), { echeance: new Date('2027-05-01'), avant: { echeance: new Date('2027-03-01') } });
  // Un relevé de script (sans « saisie ») avec un « saisiPar » d'un autre sens : jamais dans l'historique
  await ecrireDocument('tableaudebord_releves/github_20261017T100000', { indicateurId: 'github', releveLe: avant(14 * MIN), niveau: 'vert', saisiPar: 'github:abcd1234', proprietaire: 'interne' });
}

const blocHistorique = (page) => page.locator('details[data-role="historique"]');
const ouvrirHistorique = (page) => blocHistorique(page).locator('summary').click();

test('S7 Historique des saisies : bloc replié en bas de page (fermé par défaut), tri du plus récent au plus ancien, « avant → après » lisible, note, scripts exclus', async ({ page }, info) => {
  await jeuHistorique();
  await ouvrir(page, 'general');
  await expect(page.locator('.td-famille').first()).toBeVisible();
  await expect(blocHistorique(page).locator('summary h2')).toHaveText('Historique des saisies');
  await expect(blocHistorique(page)).not.toHaveAttribute('open', ''); // fermé par défaut
  await expect(page.locator('.td-h-ligne')).toHaveCount(0);
  expect(await page.locator('.td-contenu > *').last().evaluate((el) => el.matches('details[data-role="historique"]'))).toBe(true); // tout en bas
  await ouvrirHistorique(page);
  await expect(page.locator('.td-h-ligne')).toHaveCount(3);
  expect(await page.locator('.td-h-ligne').evaluateAll((els) => els.map((e) => e.dataset.id))).toEqual(['stock_20261016T153000', 'n8n_20261010T101500', 'n8n_20261001T080000']);
  const stock = page.locator('.td-h-ligne[data-id="stock_20261016T153000"]');
  await expect(stock.locator('.td-h-qui')).toHaveText('jeromebot.chevalierbot@gmail.com');
  await expect(stock.locator('.td-h-nom')).toHaveText('Bouteilles de Bordeaux');
  await expect(stock.locator('.td-h-change')).toHaveText('42 bouteilles → 37,5 bouteilles');
  await expect(stock.locator('.td-h-quand')).toHaveText(/^\d{2}\/\d{2}\/\d{4} à \d{2}:\d{2}$/);
  const cle = page.locator('.td-h-ligne[data-id="n8n_20261001T080000"]');
  await expect(cle.locator('.td-h-qui')).toHaveText(JEROME);
  await expect(cle.locator('.td-h-nom')).toHaveText('Clé API de n8n');
  await expect(cle.locator('.td-h-change')).toHaveText('01/12/2026 → 01/03/2027');
  await expect(cle.locator('.td-h-note')).toHaveText('Première saisie');
  await expect(page.locator('.td-h-ligne[data-id="n8n_20261010T101500"] .td-h-note')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('github:abcd1234');
  expect(await page.evaluate(SANS_DEBORDEMENT)).toBe(true);
  await capturerRecette(page, info, '3-historique-ouvert');
  // Un bloc de l'écran seulement : aucune entrée de menu pour l'historique
  if (estTelephone(page)) await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await expect(page.locator('.menu').getByRole('link', { name: 'Historique des saisies' })).toHaveCount(0);
  // On le referme : la liste disparaît ; on le rouvre : elle revient
  await ouvrirHistorique(page);
  await expect(page.locator('.td-h-ligne')).toHaveCount(0);
  await ouvrirHistorique(page);
  await expect(page.locator('.td-h-ligne')).toHaveCount(3);
});

test('S7 une saisie faite à l\'écran apparaît aussitôt dans l\'historique, en tête de liste', async ({ page }) => {
  await jeuHistorique();
  await simulerSaisie(page);
  await ouvrir(page, 'technique');
  await boutonSaisir(page, 'n8n').click();
  await zone(page, 'n8n').getByLabel('Nouvelle date d\'échéance').fill(jour(200));
  await zone(page, 'n8n').getByLabel('Note (facultatif)').fill('Renouvelée');
  await zone(page, 'n8n').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.td-avis')).toContainText('Enregistré');
  await ouvrirHistorique(page);
  await expect(page.locator('.td-h-ligne')).toHaveCount(4);
  const premiere = page.locator('.td-h-ligne').first();
  await expect(premiere.locator('.td-h-nom')).toHaveText('Clé API de n8n');
  await expect(premiere.locator('.td-h-change')).toHaveText(/→ \d{2}\/\d{2}\/\d{4}$/);
  await expect(premiere.locator('.td-h-note')).toHaveText('Renouvelée');
});

test('S7 vide : phrase qui explique, sans liste', async ({ page }, info) => {
  await jeuSaisie();
  await ouvrir(page, 'historique');
  await expect(blocHistorique(page)).toHaveAttribute('open', ''); // la route historique ouvre le bloc
  await expect(blocHistorique(page).locator('.td-etat-ecran.td-vide')).toHaveText(MESSAGE_VIDE_HISTORIQUE);
  await expect(page.locator('.td-h-ligne')).toHaveCount(0);
  await capturer(page, info, 'S7-historique-vide');
});

test('S7 chargement : « Chargement des saisies… » tant que la base n\'a pas répondu', async ({ page }, info) => {
  await page.route('**/js/modules/tableaudebord/donnees.js', async (route) => {
    const source = await readFile(fileURLToPath(new URL('../../js/modules/tableaudebord/donnees.js', import.meta.url)), 'utf8');
    expect(source).toContain('desabonnementHistorique = onSnapshot(');
    await route.fulfill({ status: 200, contentType: 'text/javascript', body: source.replace('desabonnementHistorique = onSnapshot(', 'desabonnementHistorique = (() => () => {})(') });
  });
  await jeuHistorique();
  await ouvrir(page, 'historique');
  await expect(blocHistorique(page).locator('.td-etat-ecran.td-chargement')).toHaveText('Chargement des saisies…');
  await expect(blocHistorique(page).locator('.td-etat-ecran.td-chargement')).toHaveAttribute('role', 'status');
  await expect(page.locator('.td-h-ligne')).toHaveCount(0);
  await capturer(page, info, 'S7-historique-chargement');
});

test('S7 erreur de lecture : message clair et « Réessayer » ; le bouton relit la base', async ({ page }, info) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues' });
  await jeuHistorique();
  const contenu = (await readFile(fileURLToPath(new URL('../../firestore.rules', import.meta.url)), 'utf8'))
    .replace(/(match \/tableaudebord_releves\/\{id\} \{\s*allow read: if )compteAutorise\(\)/, '$1false');
  expect(contenu).not.toEqual(await readFile(fileURLToPath(new URL('../../firestore.rules', import.meta.url)), 'utf8'));
  await chargerRegles(contenu);
  try {
    await ouvrir(page, 'historique');
    const erreur = blocHistorique(page).locator('.td-etat-ecran.td-erreur');
    await expect(erreur).toContainText('Impossible de lire l\'historique des saisies pour le moment.');
    await expect(erreur).toContainText('clique sur « Réessayer »');
    await capturer(page, info, 'S7-historique-erreur');
    await erreur.getByRole('button', { name: 'Réessayer' }).click();
    await expect(erreur.getByRole('button', { name: 'Réessayer' })).toBeVisible(); // toujours refusé : l'erreur revient
    await rendreLesVraiesRegles();
    await erreur.getByRole('button', { name: 'Réessayer' }).click();
    await expect(page.locator('.td-h-ligne')).toHaveCount(3);
    await expect(blocHistorique(page).locator('.td-erreur')).toHaveCount(0);
  } finally {
    await rendreLesVraiesRegles();
  }
});

test('S7 au plus 200 saisies affichées, les plus récentes', async ({ page }) => {
  await jeuSaisie();
  for (let i = 0; i < 205; i += 1) await saisieHistorique(`n8n_${String(i).padStart(4, '0')}`, 'n8n', avant((i + 1) * MIN), { echeance: new Date('2027-05-01'), avant: { echeance: null } });
  await ouvrir(page, 'historique');
  await expect(page.locator('.td-h-ligne')).toHaveCount(200);
  await expect(page.locator('.td-h-ligne').first()).toHaveAttribute('data-id', 'n8n_0000');
  await expect(page.locator('.td-h-ligne').last()).toHaveAttribute('data-id', 'n8n_0199');
});

for (const theme of ['sombre', 'clair']) {
  test(`S8 thème ${theme} : Historique des saisies (bloc ouvert) lisible, sans défilement horizontal`, async ({ page }, info) => {
    await jeuHistorique();
    await ouvrir(page, 'historique');
    await page.evaluate((x) => { document.documentElement.dataset.theme = x; }, theme);
    await expect(page.locator('.td-h-ligne')).toHaveCount(3);
    expect(await page.evaluate(SANS_DEBORDEMENT), 'historique : défilement horizontal').toBe(true);
    await capturer(page, info, `S8-historique-${theme}`);
  });
}

// ---------------------------------------------------------------- U1 à U5 : un seul écran (23/10/2026)

test('U1 un seul écran « Maintenance » : ni barre d\'onglets ni segment « Tout voir / À traiter » ; phrase d\'état, « À traiter en premier », tous les indicateurs par famille, historique replié en bas, dans cet ordre', async ({ page }, info) => {
  await jeuStandard();
  await ouvrir(page, 'general');
  await expect(page.locator('.td-ligne').first()).toBeVisible();
  await expect(page.locator(AUCUN_ONGLET)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Tout voir', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'À traiter', exact: true })).toHaveCount(0);
  await expect(page.locator('.page-tableaudebord select')).toHaveCount(0); // plus de liste de familles dans la page : elle est dans la fenêtre « Filtres »
  const ordre = await page.locator('.td-contenu h2').evaluateAll((els) => els.map((e) => e.textContent));
  expect(ordre).toEqual(['3 pannes à traiter', 'À traiter en premier', 'Tous les indicateurs', 'Clés et autorisations', 'Automatisations', 'Sauvegardes', 'Historique des saisies']);
  await expect(page.locator('.td-famille')).toHaveCount(3);
  // Blocs repliables : on replie une famille, on la rouvre
  const cles = page.locator('.td-famille[data-famille="cles"]');
  await expect(cles).toHaveAttribute('open', '');
  await cles.locator('summary').click();
  await expect(cles).not.toHaveAttribute('open', '');
  await expect(cles.locator('.td-ligne').first()).toBeHidden();
  await cles.locator('summary').click();
  await expect(cles.locator('.td-ligne').first()).toBeVisible();
  await expect(blocHistorique(page)).not.toHaveAttribute('open', '');
  await capturerRecette(page, info, '1-ecran-complet');
});

test('U2 le bouton « Filtres » a deux critères (familles, « À traiter seulement ») ; pastille de compte, puces retirables, « Tout effacer » ; les filtres restent en changeant de route', async ({ page }, info) => {
  await jeuStandard();
  await ouvrir(page, 'general');
  await expect(page.locator('.td-famille')).toHaveCount(3);
  const bouton = page.locator('[data-action="filtres"]');
  await expect(bouton).toHaveText('Filtres');
  await bouton.click();
  const fenetre = page.getByRole('dialog');
  await expect(fenetre.locator('legend')).toHaveText(['Famille']);
  await expect(fenetre.locator('input[data-cle="traiter"]')).toBeVisible();
  await expect(fenetre.getByText('À traiter seulement')).toBeVisible();
  await capturerRecette(page, info, '2-filtres-ouverts');
  await fenetre.locator('input[data-cle="familles"][data-valeur="cles"]').check();
  await fenetre.locator('input[data-cle="familles"][data-valeur="sauvegardes"]').check();
  await fenetre.locator('input[data-cle="traiter"]').check();
  await fenetre.getByRole('button', { name: 'Appliquer' }).click();
  await expect(bouton.locator('.compteur-filtres')).toHaveText('3');
  await expect(puces(page)).toHaveText(['À traiter seulement', 'Clés et autorisations', 'Sauvegardes']);
  await expect(page.locator('.td-famille')).toHaveCount(2); // « et » entre critères, « ou » entre familles
  expect((await niveaux(page)).filter((n) => n === 'vert')).toHaveLength(0);
  await expect(page.locator('.td-phrase')).toHaveText('3 pannes à traiter'); // le haut de l'écran garde la vue d'ensemble
  await aller(page, 'technique'); // changer de route ne remet pas les filtres à zéro
  await expect(puces(page)).toHaveCount(3);
  await page.getByRole('button', { name: 'Retirer le filtre : Sauvegardes' }).click();
  await expect(page.locator('.td-famille')).toHaveCount(1);
  await expect(bouton.locator('.compteur-filtres')).toHaveText('2');
  await page.getByRole('button', { name: 'Tout effacer' }).click();
  await expect(puces(page)).toHaveCount(0);
  await expect(bouton.locator('.compteur-filtres')).toHaveCount(0);
  await expect(page.locator('.td-famille')).toHaveCount(3);
  // Chaque liste ne propose que les valeurs possibles : une famille cochée qui n'a rien à traiter est retirée d'office
  await filtrerAvec(page, { traiter: true, familles: ['automatisations'] });
  await expect(puces(page)).toHaveText(['À traiter seulement']);
  await expect(page.locator('.td-famille')).toHaveCount(2);
});

test('U3 les routes technique, finance, stocks et historique ouvrent le même écran et descendent au bloc concerné (en l\'ouvrant s\'il était replié) ; une route inconnue revient à general', async ({ page }, info) => {
  await jeuStandard();
  await indicateur('marge', { tableau: 'finance', famille: 'finance', nom: 'Marge du mois', type: 'mesure', niveau: null, valeur: 1240, unite: '€', message: 'Marge brute' });
  await indicateur('stock-papier', { tableau: 'stocks', famille: 'papier', nom: 'Rames de papier', niveau: 'orange', message: 'Il en reste 4' });
  const visibleDansLaFenetre = (loc) => loc.evaluate((el) => { const r = el.getBoundingClientRect(); return r.top >= -1 && r.top < window.innerHeight; });
  await ouvrir(page, 'general');
  for (const route of ['technique', 'finance', 'stocks']) {
    await aller(page, route);
    await expect(page).toHaveURL(new RegExp(`#/tableaudebord/${route}$`));
    await expect(page.locator(AUCUN_ONGLET)).toHaveCount(0);
    await expect(page.locator('.td-phrase')).toBeVisible(); // c'est bien le même écran (phrase d'état en haut)
    await expect(page.locator('.td-famille .td-ligne')).toHaveCount(16);
    const bloc = page.locator(`.td-famille[data-tableaux~="${route}"]`).first();
    await expect.poll(() => visibleDansLaFenetre(bloc)).toBe(true);
  }
  // Un bloc replié par l'utilisateur est rouvert par la route qui y mène
  await aller(page, 'general');
  const finance = page.locator('.td-famille[data-famille="finance"]');
  await finance.locator('summary').click();
  await expect(finance).not.toHaveAttribute('open', '');
  await aller(page, 'finance');
  await expect(finance).toHaveAttribute('open', '');
  await expect.poll(() => visibleDansLaFenetre(finance)).toBe(true);
  await capturer(page, info, 'U3-route-finance');
  // Historique : le bloc s'ouvre et on y descend
  await aller(page, 'historique');
  await expect(blocHistorique(page)).toHaveAttribute('open', '');
  await expect.poll(() => visibleDansLaFenetre(blocHistorique(page))).toBe(true);
  await expect(page.locator('.td-phrase')).toHaveCount(1);
  // Route inconnue
  await aller(page, 'nimportequoi');
  await expect(page).toHaveURL(/#\/tableaudebord\/general$/);
});

test('U4 le menu n\'a toujours qu\'une entrée « Maintenance », allumée sur chaque route du module ; la page n\'a pas de barre d\'onglets', async ({ page }) => {
  await jeuStandard();
  await ouvrir(page, 'technique');
  if (estTelephone(page)) await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  const bloc = page.locator('.menu-groupe[data-bloc="tableaudebord"]');
  await expect(bloc.locator('.menu-entree')).toHaveText(['Maintenance']);
  await expect(bloc.locator('.menu-entree')).toHaveAttribute('aria-current', 'page');
  await expect(page.locator(AUCUN_ONGLET)).toHaveCount(0);
});

test('U5 accessibilité : les blocs repliables se manipulent au clavier (Entrée), le bouton « Filtres » est un bouton nommé, les puces ont un nom de retrait', async ({ page }) => {
  await jeuStandard();
  await ouvrir(page, 'general');
  await expect(page.locator('.td-famille').first()).toBeVisible();
  const premier = page.locator('.td-famille').first();
  await premier.locator('summary').focus();
  await page.keyboard.press('Enter');
  await expect(premier).not.toHaveAttribute('open', '');
  await page.keyboard.press('Enter');
  await expect(premier).toHaveAttribute('open', '');
  await expect(page.getByRole('button', { name: 'Filtres' })).toBeVisible();
  await filtrerAvec(page, { traiter: true });
  await expect(page.getByRole('button', { name: 'Retirer le filtre : À traiter seulement' })).toBeVisible();
  await page.getByRole('button', { name: 'Retirer le filtre : À traiter seulement' }).click();
  await expect(page.getByRole('button', { name: 'Filtres' })).toBeFocused(); // le focus revient au bouton après un retrait
});
