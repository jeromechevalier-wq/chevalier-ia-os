// Portail devis seul, étape 2a : écran « Relances » (à relancer, déjà relancés, à relancer bientôt), menu du portail, « Préparer l'e-mail » (fenêtre standard) et « Relancé ».
// Le serveur est SIMULÉ (page.route sur devisPreparerEmail, devisPreparerEmailEtat, devisEnregistrerEnvoi) : on vérifie ce que l'appli demande et ce qu'elle affiche.
// Le nom d'un test commence par le numéro du critère (19 à 28). Captures dans tests/e2e/captures/portail-devis/ (ordinateur ET téléphone).
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, ecrireDocument, estTelephone, attendreCalme, JEROME, PROJET, FIRESTORE, URL_APP } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/portail-devis/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: true, animations: 'disabled' });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' };
const ALICE = 'alice@exemple.test';
const jourDansLe = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const ilYA = (jours) => new Date(Date.now() - jours * 86400000 - 3600000);

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

const VALEURS = (id, valeurs) => ({
  racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: null, personneId: null, organisationId: null, modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
  regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: jourDansLe(60), objet: 'Rénovation cuisine', destinataires: ['marie@exemple.fr'], copie: [],
  sections: [{ id: 's1', titre: 'Cuisine', lignes: [{ id: 'l1', libelle: 'Carrelage', quantite: 1, unite: 'u', prixAchat: 80, prixVente: 100 }] }],
  totaux: { ht: 100, tva: 20, ttc: 120 }, pdf: { statut: 'ok', chemin: `devis/${id}/d.pdf`, nom: 'Devis.pdf', tentatives: 1 },
  creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: new Date(), modifieLe: new Date(), ...valeurs,
});
const devis = (id, valeurs = {}, base = '') => ecrireDocument(`${base}devis_devis/${id}`, VALEURS(id, valeurs));
const envoye = (id, numero, jours, plus = {}) => devis(id, { numero, statut: 'envoye', finaliseLe: ilYA(jours), envoyeLe: ilYA(jours), envois: [{ date: ilYA(jours), destinataires: ['marie@exemple.fr'] }], ...plus });
/** Le jeu de 100 € : un à relancer (12 j), un relancé (3 j), un à venir (4 j), un jamais envoyé (8 j), un test (12 j). */
async function jeu(base = '') {
  await devis('r12', { numero: 'DEV-2026-10-01-001', statut: 'envoye', finaliseLe: ilYA(12), envoyeLe: ilYA(12), envois: [{ date: ilYA(12) }] }, base);
  await devis('rel3', { numero: 'DEV-2026-10-01-002', statut: 'envoye', finaliseLe: ilYA(12), envoyeLe: ilYA(12), envois: [{ date: ilYA(12) }, { date: ilYA(3), origine: 'relance', destinataires: ['marie@exemple.fr'] }] }, base);
  await devis('v4', { numero: 'DEV-2026-10-01-003', statut: 'envoye', finaliseLe: ilYA(4), envoyeLe: ilYA(4), envois: [{ date: ilYA(4) }] }, base);
  await devis('j8', { numero: 'DEV-2026-10-01-004', statut: 'en_attente_envoi', finaliseLe: ilYA(8) }, base);
  await devis('t12', { numero: 'DEV-2026-10-01-005', statut: 'envoye', finaliseLe: ilYA(12), envoyeLe: ilYA(12), envois: [{ date: ilYA(12) }], test: true }, base);
}
const ouvrirMenu = async (page) => { if (estTelephone(page) && !(await page.locator('.coquille.menu-ouvert').count())) await page.getByRole('button', { name: 'Ouvrir le menu' }).click(); };
const entreesMenu = (page) => page.locator('.menu .menu-entree').allInnerTexts().then((t) => t.map((x) => x.trim()));
const ligne = (page, id) => page.locator(`.ligne-relance[data-id="${id}"]`);
const bloc = (page, id) => page.locator(`[data-bloc="${id}"]`);
const sansDebordement = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

/** Faux serveur. `etat.appels` : devisEnregistrerEnvoi reçus ; `etat.refus` : message de refus ; `etat.ecrire(appel)` : écrit la ligne dans la base (comme le vrai serveur). */
async function simulerServeur(page, etat = {}) {
  etat.appels = []; etat.email = [];
  await page.route('**/devisPreparerEmailEtat', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { branche: true } }) });
  });
  await page.route('**/devisPreparerEmail', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    etat.email.push(JSON.parse(route.request().postData()).data);
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ok: true, demandeId: 'dem_essai' } }) });
  });
  await page.route('**/devisEnregistrerEnvoi', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const donnees = JSON.parse(route.request().postData()).data;
    etat.appels.push(donnees);
    if (etat.delaiMs) await new Promise((r) => setTimeout(r, etat.delaiMs));
    if (etat.refus) return route.fulfill({ status: 400, headers: cors, body: JSON.stringify({ error: { message: etat.refus, status: 'FAILED_PRECONDITION' } }) });
    await etat.ecrire?.(donnees);
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ok: true } }) });
  });
  return etat;
}
async function ouvrirRelances(page, route = 'portail-devis/devis/relances') {
  await connecter(page, JEROME, { route });
  await expect(page.locator('.page-relances')).toBeVisible();
  await attendreCalme(page);
}

test.describe('chez Jérôme', () => {
  test('19 le menu du portail a trois entrées, « Relances » seule allumée sur son écran, « Devis » seule sur la liste ; chez Jérôme (espace complet) pas d\'entrée Relances', async ({ page }, info) => {
    await jeu();
    await ouvrirRelances(page);
    await ouvrirMenu(page);
    expect(await entreesMenu(page)).toEqual(['Devis', 'Relances', 'Espace complet']);
    await expect(page.locator('.menu [aria-current="page"]')).toHaveCount(1);
    await expect(page.locator('.menu [aria-current="page"]')).toHaveText(/Relances/);
    await expect(page.locator('.menu .menu-entree[data-chemin="devis/relances"] svg :is(path, circle, line, polyline)').first()).toBeAttached(); // icône réellement dessinée
    await capturer(page, info, '19-menu-relances');
    await page.keyboard.press('Escape');
    await page.locator('.menu .menu-entree[data-chemin="devis/liste"]').click({ force: true });
    await expect(page.locator('.page-liste-devis')).toBeVisible();
    await ouvrirMenu(page);
    await expect(page.locator('.menu [aria-current="page"]')).toHaveCount(1);
    await expect(page.locator('.menu [aria-current="page"]')).toHaveText(/Devis/);
    await page.keyboard.press('Escape');
    // Espace complet de Jérôme : le menu complet ne change pas.
    await page.evaluate(() => { location.hash = '#/devis/liste'; });
    await expect(page.locator('.page-liste-devis')).toBeVisible();
    await ouvrirMenu(page);
    await expect(page.locator('.menu').getByRole('link', { name: 'Relances', exact: true })).toHaveCount(0);
    await page.keyboard.press('Escape');
  });

  test('21 l\'écran : un devis de 100 € envoyé il y a 12 j dans « À relancer » avec pastille et boutons, un relancé, un à venir, un jamais envoyé à part, aucun test', async ({ page }, info) => {
    await jeu();
    await simulerServeur(page);
    await ouvrirRelances(page);
    await expect(page.getByRole('heading', { name: 'Relances', level: 1 })).toBeVisible();
    await expect(page.locator('.page-relances input[type="search"]')).toHaveCount(0);
    await expect(page.locator('[data-action="nouveau-devis"]')).toHaveCount(0);
    const r12 = ligne(page, 'r12');
    await expect(bloc(page, 'a-relancer')).toContainText('À relancer');
    await expect(bloc(page, 'a-relancer').locator('.ligne-relance')).toHaveCount(1);
    await expect(r12).toContainText('DEV-2026-10-01-001');
    await expect(r12).toContainText('HT');
    await expect(r12.locator('.pastille-a-traiter')).toContainText(/À relancer · 12 j/);
    await expect(r12.locator('[data-action="preparer-email"]')).toBeEnabled();
    await expect(r12.locator('[data-action="relance"]')).toBeEnabled();
    await expect(bloc(page, 'deja-relances')).toContainText('Déjà relancés');
    await expect(ligne(page, 'rel3')).toContainText(/Relancé le \d\d\/\d\d\/\d{4} · 1re relance · à relancer de nouveau dans 7 j/);
    await expect(bloc(page, 'a-venir')).toContainText('À relancer bientôt');
    await expect(ligne(page, 'v4')).toContainText(/Envoyé le \d\d\/\d\d\/\d{4} · à relancer dans 6 j/);
    await expect(bloc(page, 'jamais-envoyes')).toContainText('Jamais envoyés');
    await expect(ligne(page, 'j8').locator('[data-action="relance"]')).toHaveCount(0);
    await expect(page.locator('.ligne-relance')).toHaveCount(4); // le devis de test n'est dans aucun groupe
    await expect(ligne(page, 't12')).toHaveCount(0);
    await capturer(page, info, '21-ecran-relances');
    // Un clic sur la ligne ouvre le devis.
    await r12.locator('.relance-principal').click();
    await expect(page).toHaveURL(/#\/portail-devis\/devis\/voir\/r12$/);
  });

  test('22 « Préparer l\'e-mail » depuis Relances ouvre la fenêtre (texte de relance) et ne marque rien comme relancé', async ({ page }, info) => {
    await jeu();
    const etat = await simulerServeur(page);
    await ouvrirRelances(page);
    await ligne(page, 'r12').locator('[data-action="preparer-email"]').click();
    const boite = page.locator('.dialogue-preparer-email');
    await expect(boite).toBeVisible();
    await expect(boite.locator('[data-champ="destinataire-preparer-email"]')).toBeVisible();
    await capturer(page, info, '22-preparer-email');
    await boite.locator('[data-action="confirmer-preparer-email"]').click();
    await expect.poll(() => etat.email.length).toBe(1);
    expect(etat.email[0].devisId).toBe('r12');
    expect(etat.appels).toHaveLength(0); // « Préparer » n'enregistre aucune relance
  });

  test('23 « Relancé » : confirmation, appel avec origine « relance », la ligne passe de « À relancer » à « Déjà relancés »', async ({ page }, info) => {
    await jeu();
    const etat = await simulerServeur(page, { ecrire: async (a) => devis(a.devisId, { numero: 'DEV-2026-10-01-001', statut: 'envoye', finaliseLe: ilYA(12), envoyeLe: ilYA(12), envois: [{ date: ilYA(12) }, { date: new Date(), origine: 'relance', destinataires: a.destinataires }] }) });
    await ouvrirRelances(page);
    await ligne(page, 'r12').locator('[data-action="relance"]').click();
    const fenetre = page.locator('.voile-dialogue');
    await expect(fenetre).toContainText('Relance envoyée ?');
    await expect(fenetre).toContainText('Le devis sort de « À relancer » pendant 10 jours. Tu retrouveras cette relance dans l’Historique du devis.');
    await capturer(page, info, '23-confirmation');
    await fenetre.getByRole('button', { name: 'Annuler' }).click();
    expect(etat.appels).toHaveLength(0);
    await ligne(page, 'r12').locator('[data-action="relance"]').click();
    await page.locator('.voile-dialogue').getByRole('button', { name: 'Relancé', exact: true }).click();
    await expect.poll(() => etat.appels.length).toBe(1);
    expect(etat.appels[0]).toMatchObject({ devisId: 'r12', origine: 'relance', destinataires: ['marie@exemple.fr'] });
    await expect(bloc(page, 'deja-relances').locator('.ligne-relance[data-id="r12"]')).toBeVisible();
    await expect(ligne(page, 'r12')).toContainText(/1re relance/);
    await expect(bloc(page, 'a-relancer')).toHaveCount(0); // plus rien à relancer
    await capturer(page, info, '23-apres-relance');
  });

  test('23b deux clics rapides sur « Relancé » (réponse lente du serveur) : UN SEUL appel, le bouton est grisé pendant l\'appel', async ({ page }) => {
    await jeu();
    const etat = await simulerServeur(page, { delaiMs: 1500, ecrire: async (a) => devis(a.devisId, { numero: 'DEV-2026-10-01-001', statut: 'envoye', finaliseLe: ilYA(12), envoyeLe: ilYA(12), envois: [{ date: ilYA(12) }, { date: new Date(), origine: 'relance', destinataires: a.destinataires }] }) });
    await ouvrirRelances(page);
    const bouton = ligne(page, 'r12').locator('[data-action="relance"]');
    await bouton.click();
    await page.locator('.voile-dialogue').getByRole('button', { name: 'Relancé', exact: true }).click();
    await expect(bouton).toBeDisabled();
    await bouton.click({ force: true });
    await expect.poll(() => etat.appels.length).toBe(1);
    await expect(bloc(page, 'deja-relances').locator('.ligne-relance[data-id="r12"]')).toBeVisible();
    expect(etat.appels).toHaveLength(1);
    await expect(ligne(page, 'r12')).toContainText('1re relance'); // jamais « 2e relance »
  });

  test('24 pas de « Relancé » sur un « jamais envoyé » ; « Relancé » grisé (avec la raison) sans destinataire', async ({ page }, info) => {
    await devis('j9', { numero: 'DEV-2026-10-01-009', statut: 'en_attente_envoi', finaliseLe: ilYA(9) });
    await envoye('sd', 'DEV-2026-10-01-010', 12, { destinataires: [] });
    await simulerServeur(page);
    await ouvrirRelances(page);
    await expect(ligne(page, 'j9').locator('[data-action="relance"]')).toHaveCount(0);
    await expect(ligne(page, 'j9').locator('[data-action="preparer-email"]')).toBeVisible();
    await expect(ligne(page, 'j9').locator('.pastille-a-traiter')).toContainText(/Jamais envoyé · 9 j/);
    await expect(ligne(page, 'sd').locator('[data-action="relance"]')).toBeDisabled();
    await expect(ligne(page, 'sd').locator('[data-action="relance"]')).toHaveAttribute('title', 'Ajoute un destinataire au devis');
    await capturer(page, info, '24-jamais-envoye-et-sans-destinataire');
  });

  test('25 cas vide : « Aucun devis à relancer. » quand les trois groupes sont vides (un test seul ne compte pas)', async ({ page }, info) => {
    await envoye('seulTest', 'DEV-2026-10-01-011', 12, { test: true });
    await ouvrirRelances(page);
    await expect(page.locator('.etat-vide')).toContainText('Aucun devis à relancer.');
    await expect(page.locator('.ligne-relance')).toHaveCount(0);
    await capturer(page, info, '25-vide');
  });

  test('26 cas d\'erreur : « Relancé » refusé par le serveur -> message du serveur, la ligne reste à relancer', { annotation: { type: 'erreurs-reseau-attendues', description: 'le faux serveur répond 400, comme le vrai' } }, async ({ page }, info) => {
    await jeu();
    const etat = await simulerServeur(page, { refus: 'L’historique des envois est plein.' });
    await ouvrirRelances(page);
    await ligne(page, 'r12').locator('[data-action="relance"]').click();
    await page.locator('.voile-dialogue').getByRole('button', { name: 'Relancé', exact: true }).click();
    await expect.poll(() => etat.appels.length).toBe(1);
    await expect(page.locator('.toast, [role="status"]').filter({ hasText: 'L’historique des envois est plein.' }).first()).toBeVisible();
    await expect(bloc(page, 'a-relancer').locator('[data-id="r12"]')).toBeVisible();
    await capturer(page, info, '26-refus');
  });

  test('27 téléphone : boutons de 44 px au moins, lignes empilées, pas de défilement horizontal', async ({ page }, info) => {
    test.skip(!estTelephone(page), 'format téléphone seulement');
    await jeu();
    await simulerServeur(page);
    await ouvrirRelances(page);
    for (const sel of ['[data-action="preparer-email"]', '[data-action="relance"]']) {
      const b = await ligne(page, 'r12').locator(sel).boundingBox();
      expect(b.height).toBeGreaterThanOrEqual(44);
    }
    expect(await sansDebordement(page)).toBe(true);
    await capturer(page, info, '27-telephone');
  });
});

test.describe('chez un client (règles de la plateforme)', () => {
  test.beforeAll(() => chargerRegles('firestore.plateforme.rules'));
  test.afterAll(() => chargerRegles('firestore.rules'));
  test('28 chez un client Devis seul : menu à trois entrées, écran Relances fonctionnel', async ({ page }, info) => {
    await ecrireDocument('marques/devisseul', { actif: true, nom: 'Devis Seul', couleur: '#336699', accueil: 'Bienvenue.' });
    await ecrireDocument('clients/devisseul', { modules: { devis: true } });
    await ecrireDocument(`clients/devisseul/membres/${ALICE}`, { role: 'editeur' });
    await ecrireDocument('clients/devisseul/devis_parametres/reglages', { regimeTva: 'assujetti', entreprise: { nom: 'Atelier Exemple', siret: '123 456 789 00012', adresse: { ligne1: '3 rue de l’Atelier', codePostal: '75001', ville: 'Paris' } } });
    await jeu('clients/devisseul/');
    await page.goto(`${URL_APP}#/espace/devisseul/portail-devis/devis/relances`);
    await page.waitForFunction(() => !!window.__chevalierTest);
    await page.evaluate((e) => window.__chevalierTest.connecter(e, true), ALICE);
    await expect(page.locator('.page-relances')).toBeVisible();
    await attendreCalme(page);
    await ouvrirMenu(page);
    expect(await entreesMenu(page)).toEqual(['Devis', 'Relances', 'Espace complet']);
    await expect(page.locator('.menu [aria-current="page"]')).toHaveText(/Relances/);
    await page.keyboard.press('Escape');
    await expect(bloc(page, 'a-relancer').locator('.ligne-relance')).toHaveCount(1);
    await expect(ligne(page, 'rel3')).toContainText('1re relance');
    await capturer(page, info, '28-client');
  });
});
