// Écran « À valider » du module Automatisations (file des propositions déposées par les workflows n8n), dans le navigateur, sur les émulateurs.
// Un test par critère d'acceptation (nom commençant par le numéro du point : 1 à 8), plus des cas limites (9 à 14) ; une capture par critère dans tests/e2e/captures/a-valider/.
// La fonction appelable `automatisationsDecider` n'existe pas dans l'émulateur du navigateur : elle est SIMULÉE par page.route('**/automatisationsDecider', …),
// comme les autres fonctions du module. Le faux serveur applique la VRAIE logique (js/modules/automatisations/propositions.js : valider, refuser, relancer)
// puis écrit le résultat dans l'émulateur Firestore, exactement comme le ferait la fonction : l'écran le voit arriver par l'écoute en direct.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, ecrireDocument, lireDocument, estTelephone, JEROME, PROJET, FIRESTORE, URL_APP } from './outils.js';

// La logique pure (aucun import) est chargée depuis son texte : le dossier js/ n'a pas de package.json « module », Playwright ne peut pas l'importer par son chemin.
const P = await import(`data:text/javascript;base64,${(await readFile(fileURLToPath(new URL('../../js/modules/automatisations/propositions.js', import.meta.url)))).toString('base64')}`);

const ALICE = 'alice@exemple.test';
const MIN = 60000;
const JOUR = 24 * 60 * MIN;
const il_y_a = (ms) => new Date(Date.now() - ms);
const CAPTURES = 'e2e/captures/a-valider';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/json' };

async function chargerRegles(fichier, retouche = (t) => t) {
  const contenu = retouche(await readFile(fileURLToPath(new URL(`../../${fichier}`, import.meta.url)), 'utf8'));
  const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: fichier, content: contenu }] } }),
  });
  if (!r.ok) throw new Error(`Règles non chargées (${fichier}) : ${await r.text()}`);
}
// Cas d'erreur de lecture : la copie des règles chargée dans l'émulateur refuse la lecture de cette collection au compte (les fichiers du dépôt ne sont pas touchés).
const REFUSER_PROPOSITIONS = (t) => {
  const bloc = "match /automatisations_propositions/{id} {\n      allow read: if compteAutorise();";
  if (!t.includes(bloc)) throw new Error('Bloc automatisations_propositions introuvable dans firestore.rules : adapter ce test.');
  return t.replace(bloc, "match /automatisations_propositions/{id} {\n      allow read: if false;");
};
test.beforeEach(() => chargerRegles('firestore.rules'));
test.afterAll(() => chargerRegles('firestore.rules'));

/** Une proposition complète, telle que la porte l'écrit. */
const proposition = (extra = {}) => ({
  type: 'Nouveau contact', titre: 'Contact reçu par e-mail', resume: 'Une personne a écrit pour demander un rendez-vous.',
  champsProposes: [{ nom: 'Prénom', valeur: 'Alex' }, { nom: 'E-mail', valeur: 'alex@exemple.test' }],
  champsValides: null, lien: null, etat: 'a_valider', creeLe: il_y_a(5 * MIN), expireLe: new Date(Date.now() + 25 * JOUR),
  valideePar: null, valideeLe: null, canal: null, refuseePar: null, refuseeLe: null, raison: null, tentatives: 0, derniereErreur: null,
  executions: { proposer: '1201', appliquer: null, refuser: null }, etapes: [], source: 'porte', ...extra,
});

let appels;
/** Simule la fonction automatisationsDecider. `base` : '' (chez Jérôme) ou 'clients/<client>/'. `refus` : message d'erreur à renvoyer au lieu de décider. */
async function brancherDecider(page, { base = '', refus = null } = {}) {
  appels = [];
  await page.route('**/automatisationsDecider', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const d = JSON.parse(route.request().postData()).data;
    appels.push(d);
    const erreur = (message) => route.fulfill({ status: 400, headers: cors, body: JSON.stringify({ error: { message, status: 'FAILED_PRECONDITION' } }) });
    if (refus) return erreur(refus);
    const chemin = `${base}automatisations_propositions/${d.id}`;
    const doc = await lireDocument(chemin);
    if (!doc) return erreur('Proposition inconnue.');
    const transition = { valider: P.valider, refuser: P.refuser, relancer: P.relancer }[d.decision];
    const r = transition(doc, { par: JEROME, canal: 'interface', champs: d.champs, raison: d.raison, maintenant: new Date() });
    if (!r.ok) return erreur(r.message);
    await ecrireDocument(chemin, r.proposition);
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ok: true, etat: r.proposition.etat } }) });
  });
}

async function ouvrirChezJerome(page) {
  await connecter(page, JEROME);
  await page.evaluate(() => { location.hash = '#/automatisations/a-valider'; });
  await expect(page.getByRole('heading', { name: 'À valider', level: 1 })).toBeVisible();
}
const carte = (page, id) => page.locator(`.prop-carte[data-id="${id}"]`);
const zoneAValider = (page) => page.locator('[data-zone="a-valider"]');
const zoneRecentes = (page) => page.locator('[data-zone="recentes"]');
const sansDefilementHorizontal = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test('1 une proposition à valider apparaît sans recharger la page', async ({ page }) => {
  await brancherDecider(page);
  await ouvrirChezJerome(page);
  await expect(zoneAValider(page).locator('[data-vide="a-valider"]')).toBeVisible();
  await ecrireDocument('automatisations_propositions/p1', proposition());
  await expect(carte(page, 'p1')).toBeVisible();
  const c = carte(page, 'p1');
  await expect(c.locator('.prop-type')).toHaveText('Nouveau contact');
  await expect(c.locator('.prop-titre')).toHaveText('Contact reçu par e-mail');
  await expect(c.locator('.prop-resume')).toContainText('rendez-vous');
  await expect(c.locator('.prop-champs')).toContainText('Prénom');
  await expect(c.locator('.prop-champs')).toContainText('alex@exemple.test');
  await expect(c.locator('.autom-pastille')).toHaveText('À valider');
  await expect(c.locator('.prop-age')).toContainText('il y a');
  await expect(zoneAValider(page).locator('[data-vide]')).toHaveCount(0);
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capture(page, '1-apparait-en-direct');
});

test('2 « Valider » fait passer la proposition dans « Traitements récents » avec la frise à « Validé »', async ({ page }) => {
  await brancherDecider(page);
  await ecrireDocument('automatisations_propositions/p1', proposition());
  await ouvrirChezJerome(page);
  await expect(carte(page, 'p1')).toBeVisible();
  await carte(page, 'p1').getByRole('button', { name: 'Valider', exact: true }).click();
  await expect(zoneRecentes(page).locator('.prop-carte[data-id="p1"]')).toBeVisible();
  await expect(zoneAValider(page).locator('.prop-carte')).toHaveCount(0);
  await expect(zoneAValider(page).locator('[data-vide="a-valider"]')).toHaveText('Rien à valider pour l’instant.');
  const frise = carte(page, 'p1').locator('.prop-frise');
  await expect(frise.locator('[data-cle="decision"]')).toHaveText('Validé');
  await expect(frise.locator('[data-cle="decision"]')).toHaveAttribute('data-etat', 'fait');
  await expect(frise.locator('[data-cle="application"]')).toHaveAttribute('data-etat', 'en_cours');
  await expect(carte(page, 'p1').locator('.autom-pastille')).toHaveText('Validée');
  await expect(carte(page, 'p1')).toContainText('proposée n° 1201');
  expect(appels).toEqual([{ id: 'p1', decision: 'valider' }]);
  expect((await lireDocument('automatisations_propositions/p1')).valideePar).toBe(JEROME);
  await capture(page, '2-validee');
});

test('3 « Refuser » avec une raison : la proposition passe en refusée et la raison est envoyée', async ({ page }) => {
  await brancherDecider(page);
  await ecrireDocument('automatisations_propositions/p1', proposition());
  await ouvrirChezJerome(page);
  await carte(page, 'p1').getByRole('button', { name: 'Refuser', exact: true }).click();
  await carte(page, 'p1').locator('[data-champ="raison"]').fill('Doublon d’un contact existant');
  await capture(page, '3-refus-raison');
  await carte(page, 'p1').getByRole('button', { name: 'Confirmer le refus' }).click();
  await expect(zoneRecentes(page).locator('.prop-carte[data-id="p1"]')).toBeVisible();
  await expect(carte(page, 'p1').locator('.autom-pastille')).toHaveText('Refusée');
  await expect(carte(page, 'p1').locator('.prop-frise [data-cle="decision"]')).toHaveText('Refusé');
  await expect(carte(page, 'p1').locator('.prop-frise [data-cle="application"]')).toHaveAttribute('data-etat', 'ignoree');
  expect(appels).toEqual([{ id: 'p1', decision: 'refuser', raison: 'Doublon d’un contact existant' }]);
  expect((await lireDocument('automatisations_propositions/p1')).raison).toBe('Doublon d’un contact existant');
  await capture(page, '3-refusee');
});

test('4 « Corriger » puis valider enregistre les champs corrigés (champsValides) sans toucher champsProposes', async ({ page }) => {
  await brancherDecider(page);
  await ecrireDocument('automatisations_propositions/p1', proposition());
  await ouvrirChezJerome(page);
  await carte(page, 'p1').getByRole('button', { name: 'Corriger', exact: true }).click();
  const champ = carte(page, 'p1').locator('[data-champ="Prénom"]');
  await expect(champ).toHaveValue('Alex');
  await champ.fill('Alexandre');
  await capture(page, '4-correction');
  await carte(page, 'p1').getByRole('button', { name: 'Valider avec ces corrections' }).click();
  await expect(zoneRecentes(page).locator('.prop-carte[data-id="p1"]')).toBeVisible();
  expect(appels).toEqual([{ id: 'p1', decision: 'valider', champs: [{ nom: 'Prénom', valeur: 'Alexandre' }, { nom: 'E-mail', valeur: 'alex@exemple.test' }] }]);
  const doc = await lireDocument('automatisations_propositions/p1');
  expect(doc.champsValides).toEqual([{ nom: 'Prénom', valeur: 'Alexandre' }, { nom: 'E-mail', valeur: 'alex@exemple.test' }]);
  expect(doc.champsProposes).toEqual([{ nom: 'Prénom', valeur: 'Alex' }, { nom: 'E-mail', valeur: 'alex@exemple.test' }]);
  await expect(carte(page, 'p1').locator('.prop-champs')).toContainText('Alexandre');
  await expect(carte(page, 'p1')).toContainText('Valeurs corrigées avant la validation.');
  await capture(page, '4-corrigee');
});

test('5 un texte piégé (balise HTML) est affiché tel quel et rien n’est exécuté', async ({ page }) => {
  await brancherDecider(page);
  const piege = '<img src=x onerror="window.__pirate=1">';
  await ecrireDocument('automatisations_propositions/p1', proposition({
    type: '<b>type</b>', titre: piege, resume: `Résumé ${piege}`, champsProposes: [{ nom: '<i>nom</i>', valeur: piege }], lien: 'javascript:window.__pirate=2',
  }));
  await ouvrirChezJerome(page);
  await expect(carte(page, 'p1').locator('.prop-titre')).toHaveText(piege);
  await expect(carte(page, 'p1').locator('.prop-type')).toHaveText('<b>type</b>');
  await expect(carte(page, 'p1').locator('.prop-resume')).toHaveText(`Résumé ${piege}`);
  await expect(carte(page, 'p1').locator('.prop-champs dd')).toHaveText(piege);
  await expect(carte(page, 'p1').locator('img, .prop-type b, .prop-champs i')).toHaveCount(0);
  // Un lien qui n'est pas en https n'est jamais cliquable : il reste du texte.
  await expect(carte(page, 'p1').locator('.prop-lien a')).toHaveCount(0);
  await page.waitForTimeout(300);
  expect(await page.evaluate(() => window.__pirate)).toBeUndefined();
  await capture(page, '5-texte-piege');
});

test('6 cas vide : « Rien à valider pour l’instant. » et aucun traitement récent', async ({ page }) => {
  await brancherDecider(page);
  await ouvrirChezJerome(page);
  await expect(zoneAValider(page).locator('[data-vide="a-valider"]')).toHaveText('Rien à valider pour l’instant.');
  await expect(zoneRecentes(page).locator('[data-vide="recentes"]')).toHaveText('Aucun traitement récent pour l’instant.');
  await expect(page.locator('.autom-bandeau')).toBeHidden();
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capture(page, '6-vide');
});

test('7 « Déjà décidée par … » : le message du serveur s’affiche tel quel sous la carte et rien ne disparaît', { annotation: { type: 'erreurs-reseau-attendues', description: 'le faux serveur répond 400, comme le vrai' } }, async ({ page }) => {
  const message = 'Déjà décidée par jerome.chevalier@gmail.com à 10:15.';
  await brancherDecider(page, { refus: message });
  await ecrireDocument('automatisations_propositions/p1', proposition());
  await ouvrirChezJerome(page);
  await carte(page, 'p1').getByRole('button', { name: 'Valider', exact: true }).click();
  await expect(carte(page, 'p1').locator('[data-message="decision"]')).toHaveText(message);
  await expect(zoneAValider(page).locator('.prop-carte[data-id="p1"]')).toBeVisible();
  await expect(carte(page, 'p1').getByRole('button', { name: 'Valider', exact: true })).toBeEnabled();
  await capture(page, '7-deja-decidee');
});

test('8 le même écran existe dans un espace client (menu, route, données du client)', async ({ page }) => {
  await chargerRegles('firestore.plateforme.rules'); // les règles de la plateforme laissent déjà les membres lire toute collection de leur client
  await brancherDecider(page, { base: 'clients/cabinet/' });
  await ecrireDocument('marques/cabinet', { actif: true, nom: 'Cabinet Martin', couleur: '#336699', accueil: 'Bienvenue.' });
  await ecrireDocument('clients/cabinet', { modules: { automatisations: true } });
  await ecrireDocument(`clients/cabinet/membres/${ALICE}`, { role: 'editeur' });
  await ecrireDocument('clients/cabinet/automatisations_propositions/c1', proposition({ titre: 'Proposition du cabinet' }));
  // La proposition de Jérôme (racine) ne doit jamais apparaître chez le client.
  await ecrireDocument('automatisations_propositions/r1', proposition({ titre: 'Proposition de la racine' }));
  await page.goto('about:blank');
  await page.goto(`${URL_APP}#/espace/cabinet/automatisations/a-valider`);
  await page.waitForFunction(() => !!window.__chevalierTest);
  await page.evaluate((e) => window.__chevalierTest.connecter(e, true), ALICE);
  await expect(page.locator('.coquille')).toBeVisible();
  await expect(page).toHaveURL(/#\/espace\/cabinet\/automatisations\/a-valider$/);
  await expect(page.getByRole('heading', { name: 'À valider', level: 1 })).toBeVisible();
  await expect(carte(page, 'c1').locator('.prop-titre')).toHaveText('Proposition du cabinet');
  await expect(page.locator('.prop-carte')).toHaveCount(1);
  if (!estTelephone(page)) await expect(page.locator('.menu').getByRole('link', { name: 'À valider', exact: true })).toBeVisible();
  await carte(page, 'c1').getByRole('button', { name: 'Valider', exact: true }).click();
  await expect(zoneRecentes(page).locator('.prop-carte[data-id="c1"]')).toBeVisible();
  expect((await lireDocument('clients/cabinet/automatisations_propositions/c1')).etat).toBe('validee');
  await capture(page, '8-espace-client');
});

test('9 une proposition en échec montre la dernière erreur et « Relancer » la remet en validée', async ({ page }) => {
  await brancherDecider(page);
  await ecrireDocument('automatisations_propositions/e1', proposition({
    etat: 'echec', champsValides: [{ nom: 'Prénom', valeur: 'Alex' }, { nom: 'E-mail', valeur: 'alex@exemple.test' }], valideePar: JEROME, valideeLe: il_y_a(20 * MIN), canal: 'interface',
    tentatives: 3, derniereErreur: 'Le service ne répond pas',
  }));
  await ouvrirChezJerome(page);
  await expect(zoneRecentes(page).locator('.prop-carte[data-id="e1"]')).toBeVisible();
  await expect(carte(page, 'e1').locator('.autom-erreur')).toContainText('Le service ne répond pas');
  await expect(carte(page, 'e1').locator('.prop-frise [data-cle="application"]')).toHaveAttribute('data-etat', 'echec');
  await capture(page, '9-echec');
  await carte(page, 'e1').getByRole('button', { name: 'Relancer' }).click();
  await expect(carte(page, 'e1').locator('.autom-pastille')).toHaveText('Validée');
  await expect(carte(page, 'e1').getByRole('button', { name: 'Relancer' })).toHaveCount(0);
  expect(appels).toEqual([{ id: 'e1', decision: 'relancer' }]);
  expect((await lireDocument('automatisations_propositions/e1')).tentatives).toBe(0);
});

test('10 validée depuis plus de 30 minutes sans être appliquée : une alerte calculée à l’écran (rien n’est écrit)', async ({ page }) => {
  await brancherDecider(page);
  await ecrireDocument('automatisations_propositions/v1', proposition({ etat: 'validee', valideePar: JEROME, valideeLe: il_y_a(45 * MIN), canal: 'interface', champsValides: [{ nom: 'Prénom', valeur: 'Alex' }] }));
  await ecrireDocument('automatisations_propositions/v2', proposition({ etat: 'validee', valideePar: JEROME, valideeLe: il_y_a(10 * MIN), canal: 'interface' }));
  // Relancée il y a 5 minutes : le compte repart de la relance, pas de la validation d'origine.
  await ecrireDocument('automatisations_propositions/v3', proposition({ etat: 'validee', valideePar: JEROME, valideeLe: il_y_a(90 * MIN), relanceeLe: il_y_a(5 * MIN), canal: 'interface' }));
  await ouvrirChezJerome(page);
  await expect(zoneRecentes(page).locator('.prop-carte')).toHaveCount(3);
  await expect(carte(page, 'v1').locator('[data-alerte="non-appliquee"]')).toContainText('pas appliquée depuis plus de 30 minutes');
  await expect(carte(page, 'v2').locator('[data-alerte]')).toHaveCount(0);
  await expect(carte(page, 'v3').locator('[data-alerte]')).toHaveCount(0);
  expect((await lireDocument('automatisations_propositions/v1')).etat).toBe('validee');
  await capture(page, '10-non-appliquee');
});

test('11 un lien en https est cliquable (nouvel onglet), un lien http reste du texte', async ({ page }) => {
  await brancherDecider(page);
  await ecrireDocument('automatisations_propositions/l1', proposition({ lien: 'https://exemple.test/fiche/1' }));
  await ecrireDocument('automatisations_propositions/l2', proposition({ lien: 'http://exemple.test/fiche/2', creeLe: il_y_a(4 * MIN) }));
  await ouvrirChezJerome(page);
  const a = carte(page, 'l1').locator('.prop-lien a');
  await expect(a).toHaveAttribute('href', 'https://exemple.test/fiche/1');
  await expect(a).toHaveAttribute('target', '_blank');
  await expect(a).toHaveAttribute('rel', /noopener/);
  await expect(carte(page, 'l2').locator('.prop-lien a')).toHaveCount(0);
  await expect(carte(page, 'l2').locator('.prop-lien')).toContainText('http://exemple.test/fiche/2');
});

test('12 une proposition périmée ne peut plus être validée, seulement refusée ; les non périmées passent devant', async ({ page }) => {
  await brancherDecider(page);
  await ecrireDocument('automatisations_propositions/vieille', proposition({ titre: 'Trop ancienne', creeLe: il_y_a(40 * JOUR), expireLe: il_y_a(10 * JOUR) }));
  await ecrireDocument('automatisations_propositions/neuve', proposition({ titre: 'Récente', creeLe: il_y_a(MIN) }));
  await ouvrirChezJerome(page);
  await expect(zoneAValider(page).locator('.prop-carte')).toHaveCount(2);
  await expect(zoneAValider(page).locator('.prop-carte').first()).toHaveAttribute('data-id', 'neuve');
  await expect(carte(page, 'vieille').locator('.autom-pastille')).toHaveText('Périmée');
  await expect(carte(page, 'vieille').getByRole('button', { name: 'Valider' })).toHaveCount(0);
  await expect(carte(page, 'vieille').getByRole('button', { name: 'Corriger' })).toHaveCount(0);
  await expect(carte(page, 'vieille').getByRole('button', { name: 'Refuser', exact: true })).toBeVisible();
  // Un seul bouton jaune sur l'écran : « Valider » de la première proposition possible.
  await expect(page.locator('.page-a-valider .bouton-principal')).toHaveCount(1);
  await expect(carte(page, 'neuve').locator('.bouton-principal')).toHaveText('Valider');
});

test('13 cas d’erreur : si les propositions ne peuvent pas être lues, l’écran le dit clairement', { annotation: { type: 'erreurs-reseau-attendues', description: 'lecture refusée exprès par les règles' } }, async ({ page }) => {
  await chargerRegles('firestore.rules', REFUSER_PROPOSITIONS);
  await brancherDecider(page);
  await ecrireDocument('automatisations_propositions/p1', proposition());
  await ouvrirChezJerome(page);
  await expect(page.locator('.autom-bandeau')).toContainText('Impossible de lire les propositions pour le moment');
  await expect(page.locator('.prop-carte')).toHaveCount(0);
  await capture(page, '13-erreur-lecture');
});

test('14 une décision que le serveur n’a pas pu joindre affiche un message qui dit quoi faire, la carte reste', { annotation: { type: 'erreurs-reseau-attendues', description: 'la requête est coupée exprès' } }, async ({ page }) => {
  await brancherDecider(page);
  await page.unroute('**/automatisationsDecider');
  await page.route('**/automatisationsDecider', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    return route.abort('failed');
  });
  await ecrireDocument('automatisations_propositions/p1', proposition());
  await ouvrirChezJerome(page);
  await carte(page, 'p1').getByRole('button', { name: 'Valider', exact: true }).click();
  await expect(carte(page, 'p1').locator('[data-message="decision"]')).toContainText('Rien n’a été changé : réessaie dans un instant.');
  await expect(zoneAValider(page).locator('.prop-carte[data-id="p1"]')).toBeVisible();
  expect((await lireDocument('automatisations_propositions/p1')).etat).toBe('a_valider');
});
