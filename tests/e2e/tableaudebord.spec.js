// Module Tableau de bord (écrans en lecture seule) dans le navigateur, sur les émulateurs : critères R1 à R10 du brief (R11 et R12 sont dans test:logique).
// Les indicateurs d'essai sont fabriqués ici (jamais lus dans la vraie base). Les captures vont dans tests/e2e/captures/tableaudebord/.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, ecrireDocument, estTelephone, allerA, PROJET, FIRESTORE } from './outils.js';

const MIN = 60000;
const JOUR = 24 * 60 * MIN;
const apres = (ms) => new Date(Date.now() + ms);
const avant = (ms) => new Date(Date.now() - ms);
const DOSSIER_CAPTURES = fileURLToPath(new URL('./captures/tableaudebord/', import.meta.url));

/** Capture de l'état obtenu, nommée d'après le critère et le format (ordinateur ou téléphone). */
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER_CAPTURES}${nom}-${info.project.name}.png`, fullPage: true });
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
  await expect(page.getByRole('heading', { name: 'Tableau de bord', level: 1 })).toBeVisible();
}
const aller = (page, ecran) => page.evaluate((e) => { location.hash = `#/tableaudebord/${e}`; }, ecran);
const ligne = (page, id) => page.locator(`.td-ligne[data-id="${id}"]`);
const niveaux = (page, portee = '.td-contenu') => page.locator(`${portee} .td-ligne`).evaluateAll((els) => els.map((e) => e.dataset.niveau));
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

test('R1 le menu contient le bloc « Tableau de bord » chez Jérôme, et sa première entrée « Général » ouvre l\'écran Général', async ({ page }, info) => {
  await jeuStandard();
  await connecter(page);
  if (estTelephone(page)) await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  const bloc = page.locator('.menu-groupe[data-bloc="tableaudebord"]');
  await expect(bloc.locator('.menu-groupe-titre')).toHaveText('Tableau de bord');
  await expect(bloc.locator('.menu-entree')).toHaveText(['Général', 'Technique']);
  await capturer(page, info, 'R1-menu');
  await bloc.getByRole('link', { name: 'Général', exact: true }).click();
  await expect(page).toHaveURL(/#\/tableaudebord\/general$/);
  await expect(page.getByRole('heading', { name: 'Tableau de bord', level: 1 })).toBeVisible();
  await expect(page.locator('.td-onglet[aria-current="page"]')).toHaveText('Général');
  await expect(page.locator('.td-phrase')).toBeVisible();
  // Une adresse inconnue du module revient sur Général ; les onglets Finance et Stocks sont acceptés même absents du menu.
  await aller(page, 'nimportequoi');
  await expect(page).toHaveURL(/#\/tableaudebord\/general$/);
  await capturer(page, info, 'R1-general');
});

// ---------------------------------------------------------------- R2, R3, R4

test('R2 un « vert » au relevé périmé s\'affiche gris « Relevé trop ancien » ; un « rouge » reste rouge même périmé', async ({ page }, info) => {
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

test('R3 une échéance dans 12 jours affiche « À surveiller » même si le script a écrit « vert » ; une échéance passée affiche « Panne »', async ({ page }, info) => {
  await jeuStandard();
  await ouvrir(page, 'technique');
  await expect(ligne(page, 'echeance12').locator('[data-pastille]')).toHaveText('À surveiller');
  await expect(ligne(page, 'echeance12').locator('.td-echeance')).toHaveText('Échéance dans 12 jours');
  await expect(ligne(page, 'echeance-passee').locator('[data-pastille]')).toHaveText('Panne');
  await expect(ligne(page, 'echeance-passee').locator('.td-echeance')).toHaveText('Échéance dépassée depuis 2 jours');
  await capturer(page, info, 'R3-echeances');
});

test('R4 chaque pastille a une icône ET un mot (aucun élément d\'état sans texte), sur Général comme sur Technique ; une mesure sans niveau n\'a pas de pastille', async ({ page }, info) => {
  await jeuStandard();
  await indicateur('mesure-sans-niveau', { tableau: 'technique', famille: 'cles', nom: 'Jours avant renouvellement', type: 'mesure', niveau: null, valeur: 42, unite: 'jours', message: null });
  await ouvrir(page, 'technique');
  for (const ecran of ['technique', 'general']) {
    await aller(page, ecran);
    await expect(page.locator('[data-pastille]').first()).toBeVisible();
    const pastilles = await page.locator('[data-pastille]').evaluateAll((els) => els.map((e) => ({ svg: e.querySelectorAll('svg').length, texte: e.textContent.trim(), niveau: e.dataset.pastille })));
    expect(pastilles.length).toBeGreaterThan(8);
    for (const p of pastilles) {
      expect(p.svg, JSON.stringify(p)).toBe(1);
      expect(p.texte.length, JSON.stringify(p)).toBeGreaterThan(1);
    }
    await capturer(page, info, `R4-pastilles-${ecran}`);
  }
  await aller(page, 'technique');
  const mesure = ligne(page, 'mesure-sans-niveau');
  await expect(mesure).toHaveAttribute('data-niveau', 'sans');
  await expect(mesure.locator('[data-pastille]')).toHaveCount(0);
  await expect(mesure.locator('.td-valeur')).toHaveText('42 jours');
});

// ---------------------------------------------------------------- R5

test('R5 Technique : blocs par famille (clés d\'abord, puis alphabétique), tri rouge puis orange puis gris puis vert, filtre « À traiter » masque les verts', async ({ page }, info) => {
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
  await capturer(page, info, 'R5-technique-tout-voir');
  // Filtre « À traiter » : plus aucun vert, les blocs sans rien à traiter disparaissent
  await page.getByRole('button', { name: 'À traiter', exact: true }).click();
  await expect(page.getByRole('button', { name: 'À traiter', exact: true })).toHaveAttribute('aria-pressed', 'true');
  expect((await niveaux(page)).filter((n) => n === 'vert')).toHaveLength(0);
  expect((await niveaux(page)).length).toBe(7);
  await expect(page.locator('.td-famille h2')).toHaveText(['Clés et autorisations', 'Sauvegardes']);
  // Les compteurs d'un bloc restent ceux de tout le bloc
  await expect(page.locator('.td-famille[data-famille="cles"] [data-compteur="vert"]')).toHaveText('3 OK');
  await capturer(page, info, 'R5-technique-a-traiter');
  await page.getByRole('button', { name: 'Tout voir', exact: true }).click();
  expect((await niveaux(page)).length).toBe(14);
});

test('R5 les filtres se combinent (À traiter + famille) et chaque liste ne propose que les valeurs possibles', async ({ page }) => {
  await jeuStandard();
  await ouvrir(page, 'technique');
  const famille = page.getByLabel('Filtrer par famille');
  await expect(famille.locator('option')).toHaveText(['Toutes les familles', 'Clés et autorisations', 'Automatisations', 'Sauvegardes']);
  await page.getByRole('button', { name: 'À traiter', exact: true }).click();
  await expect(famille.locator('option')).toHaveText(['Toutes les familles', 'Clés et autorisations', 'Sauvegardes'], { useInnerText: true }); // « Automatisations » n'a rien à traiter
  await famille.selectOption('sauvegardes');
  await expect(page.locator('.td-ligne')).toHaveCount(1);
  await expect(page.locator('.td-ligne .td-nom')).toHaveText('Essai de restauration');
  await page.getByRole('button', { name: 'Tout voir', exact: true }).click();
  await expect(page.locator('.td-ligne')).toHaveCount(3); // la famille reste choisie
  await famille.selectOption('');
  await expect(page.locator('.td-ligne')).toHaveCount(14);
});

// ---------------------------------------------------------------- R6

test('R6 Général : phrase d\'état, compteurs et liste « À traiter en premier » cohérents avec Technique', async ({ page }, info) => {
  await jeuStandard();
  await ouvrir(page, 'technique');
  const technique = {};
  for (const n of await niveaux(page)) technique[n] = (technique[n] ?? 0) + 1;
  expect(technique).toEqual(COMPTES_STANDARD);
  const idsATraiter = await page.locator('.td-ligne:not([data-niveau="vert"])').evaluateAll((els) => els.map((e) => e.dataset.id).sort());
  await aller(page, 'general');
  await expect(page.locator('.td-phrase')).toHaveText('3 pannes à traiter');
  await expect(page.locator('.td-phrase')).toHaveAttribute('data-niveau', 'rouge');
  await expect(page.locator('[data-compteur="rouge"]')).toHaveText('3 pannes');
  await expect(page.locator('[data-compteur="orange"]')).toHaveText('3 À surveiller');
  await expect(page.locator('[data-compteur="gris"]')).toHaveText('1 relevé trop ancien');
  await expect(page.locator('[data-compteur="vert"]')).toHaveText('7 OK');
  await expect(page.getByRole('heading', { name: 'À traiter en premier' })).toBeVisible();
  const general = await page.locator('[data-liste="a-traiter"] .td-ligne').evaluateAll((els) => els.map((e) => [e.dataset.id, e.dataset.niveau]));
  expect(general.map((x) => x[0]).sort()).toEqual(idsATraiter);
  expect(general.map((x) => x[1])).toEqual(['rouge', 'rouge', 'rouge', 'orange', 'orange', 'orange', 'gris']);
  await expect(page.locator('[data-liste="a-traiter"] .td-ligne').first().locator('.td-nom small')).toHaveText('Clés et autorisations');
  // Objectifs et courbes arrivent à l'étape suivante : rien à leur place
  await expect(page.locator('body')).not.toContainText(/Objectifs|tendance|Rafraîchir|Saisir/);
  await capturer(page, info, 'R6-general');
});

test('R6 Général : « Une panne à traiter » au singulier, « Tout marche, quelques points à surveiller », « Tout fonctionne », et « Rien à traiter. »', async ({ page }, info) => {
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

test('R7 les onglets Finance et Stocks sont absents quand aucun indicateur ne les porte, présents sinon (et la page s\'ouvre)', async ({ page }, info) => {
  await jeuStandard();
  await ouvrir(page, 'general');
  await expect(page.locator('.td-onglet')).toHaveText(['Général', 'Technique']);
  await capturer(page, info, 'R7-onglets-sans-finance-ni-stocks');
  await indicateur('marge', { tableau: 'finance', famille: 'finance', nom: 'Marge du mois', type: 'mesure', niveau: null, valeur: 1240, unite: '€', message: 'Marge brute' });
  await expect(page.locator('.td-onglet')).toHaveText(['Général', 'Technique', 'Finance']);
  await indicateur('stock-papier', { tableau: 'stocks', famille: 'papier', nom: 'Rames de papier', niveau: 'orange', message: 'Il en reste 4' });
  await expect(page.locator('.td-onglet')).toHaveText(['Général', 'Technique', 'Finance', 'Stocks']);
  await page.locator('.td-onglet', { hasText: 'Finance' }).click();
  await expect(page).toHaveURL(/#\/tableaudebord\/finance$/);
  await expect(page.locator('.td-onglet[aria-current="page"]')).toHaveText('Finance');
  await expect(ligne(page, 'marge').locator('.td-valeur')).toHaveText(`${new Intl.NumberFormat('fr-FR').format(1240)} €`);
  await expect(ligne(page, 'marge').locator('[data-pastille]')).toHaveCount(0);
  await expect(page.locator('.td-ligne')).toHaveCount(1); // chaque tableau ne montre que ses indicateurs
  await capturer(page, info, 'R7-onglets-avec-finance-et-stocks');
  await page.locator('.td-onglet', { hasText: 'Stocks' }).click();
  await expect(ligne(page, 'stock-papier').locator('[data-pastille]')).toHaveText('À surveiller');
  // Général compte tous les tableaux confondus (14 + 2 = 16 indicateurs, dont une mesure sans pastille)
  await page.locator('.td-onglet', { hasText: 'Général' }).click();
  await expect(page.locator('[data-compteur="orange"]')).toHaveText('4 À surveiller');
  await expect(page.locator('[data-compteur="vert"]')).toHaveText('7 OK');
});

// ---------------------------------------------------------------- R8

test('R8 vide : aucun indicateur, Général et Technique disent pourquoi', async ({ page }, info) => {
  await ouvrir(page, 'general');
  const MESSAGE = 'Aucun indicateur pour l\'instant. Les relevés arrivent chaque jour, après le premier passage des scripts de surveillance.';
  await expect(page.locator('.td-etat-ecran.td-vide')).toHaveText(MESSAGE);
  await expect(page.locator('.td-phrase')).toHaveCount(0);
  await capturer(page, info, 'R8-vide-general');
  await aller(page, 'technique');
  await expect(page.locator('.td-etat-ecran.td-vide')).toHaveText(MESSAGE);
  await expect(page.locator('.td-onglet')).toHaveText(['Général', 'Technique']);
  await capturer(page, info, 'R8-vide-technique');
  // Un indicateur arrive : l'écran vide cède la place sans rechargement
  await indicateur('premier');
  await expect(page.locator('.td-etat-ecran')).toHaveCount(0);
  await expect(ligne(page, 'premier')).toBeVisible();
});

test('R8 chargement : « Chargement des indicateurs… » tant que la base n\'a pas répondu, sur Général et sur Technique', async ({ page, context }, info) => {
  await jeuStandard();
  await ouvrir(page, 'general');
  for (const ecran of ['general', 'technique']) {
    await aller(page, ecran);
    await expect(page.locator('.td-ligne').first()).toBeVisible();
    await context.setOffline(true); // plus de réponse possible : l'écran reste en chargement
    const texte = await page.evaluate(async () => {
      const D = await import('/js/modules/tableaudebord/donnees.js');
      D.reessayer();
      return document.querySelector('.td-contenu').innerText;
    });
    expect(texte).toContain('Chargement des indicateurs…');
    await expect(page.locator('.td-etat-ecran.td-chargement')).toHaveText('Chargement des indicateurs…');
    await capturer(page, info, `R8-chargement-${ecran}`);
    await context.setOffline(false);
    await expect(page.locator('.td-ligne').first()).toBeVisible({ timeout: 20_000 }); // la connexion revient : les indicateurs s'affichent
  }
});

test('R8 erreur de lecture : message clair et « Réessayer » sur Général et sur Technique ; le bouton relit la base', async ({ page }, info) => {
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
    await capturer(page, info, 'R8-erreur-general');
    // Toujours refusé : « Réessayer » relit, l'erreur revient (le bouton n'invente rien)
    await erreur.getByRole('button', { name: 'Réessayer' }).click();
    await expect(erreur.getByRole('button', { name: 'Réessayer' })).toBeVisible();
    await aller(page, 'technique');
    await expect(erreur).toContainText('Impossible de lire les indicateurs pour le moment.');
    await expect(erreur.getByRole('button', { name: 'Réessayer' })).toBeVisible();
    await capturer(page, info, 'R8-erreur-technique');
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

test('R9 mise à jour en direct : un indicateur modifié dans la base change à l\'écran sans recharger', async ({ page }, info) => {
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
  await aller(page, 'general');
  await expect(page.locator('.td-phrase')).toHaveText('Une panne à traiter');
  await indicateur('a', { nom: 'Clé A', niveau: 'vert', message: 'Répond de nouveau' });
  await expect(page.locator('.td-phrase')).toHaveText('Tout fonctionne');
  expect(await page.evaluate(() => window.__sansRechargement)).toBe(true);
  await capturer(page, info, 'R9-direct');
});

test('R9 le « relevé il y a … » et le gris se recalculent chaque minute, sans recharger', async ({ page }, info) => {
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
  test(`R10 thème ${theme} : Général et Technique lisibles, sans défilement horizontal de la page`, async ({ page }, info) => {
    await jeuStandard();
    await indicateur('mesure', { nom: 'Jours avant renouvellement', type: 'mesure', niveau: null, valeur: 42, unite: 'jours', message: null });
    await ouvrir(page, 'general');
    await page.evaluate((t) => { document.documentElement.dataset.theme = t; }, theme);
    await expect(page.locator('.td-phrase')).toBeVisible();
    expect(await page.evaluate(SANS_DEBORDEMENT), 'Général : défilement horizontal').toBe(true);
    await capturer(page, info, `R10-general-${theme}`);
    await aller(page, 'technique');
    await expect(page.locator('.td-famille').first()).toBeVisible();
    expect(await page.evaluate(SANS_DEBORDEMENT), 'Technique : défilement horizontal').toBe(true);
    // Les couleurs d'état viennent bien de la feuille du module, selon le thème
    const couleurs = await page.evaluate(() => Object.fromEntries(['vert', 'orange', 'rouge', 'gris'].map((n) => [n, getComputedStyle(document.documentElement).getPropertyValue(`--td-${n}`).trim()])));
    expect(couleurs).toEqual(theme === 'sombre'
      ? { vert: '#5fd39a', orange: '#f5a524', rouge: '#f0506e', gris: '#9a98a0' }
      : { vert: '#1d7a4b', orange: '#9a6200', rouge: '#b3123f', gris: '#6b6a70' });
    await capturer(page, info, `R10-technique-${theme}`);
    await page.getByRole('button', { name: 'À traiter', exact: true }).click();
    expect(await page.evaluate(SANS_DEBORDEMENT), 'Technique filtrée : défilement horizontal').toBe(true);
  });
}

test('R10 aucune écriture : en parcourant les écrans, le navigateur n\'envoie aucune écriture à la base', async ({ page }) => {
  await jeuStandard();
  const ecritures = [];
  page.on('request', (r) => { if (/:commit|\/documents.*(PATCH|POST|DELETE)/.test(r.url()) && r.method() !== 'GET' && /tableaudebord/.test(r.postData() ?? '')) ecritures.push(r.url()); });
  await ouvrir(page, 'general');
  await aller(page, 'technique');
  await page.getByRole('button', { name: 'À traiter', exact: true }).click();
  await page.waitForTimeout(500);
  expect(ecritures).toEqual([]);
  expect(await page.evaluate(() => [...document.querySelectorAll('.td-contenu button')].map((b) => b.textContent.trim()))).toEqual(['Tout voir', 'À traiter']);
});
