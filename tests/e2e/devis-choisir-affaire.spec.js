// Devis finalisé sans affaire : « Choisir l'affaire » plus tard + filtre « Sans affaire » (PR 2, 08/11/2026).
// Un test par critère (le nom commence par son numéro) ; UNE capture par test : tests/e2e/captures/devis-choisir-affaire/ (ordinateur ET téléphone).
// Le serveur est remplacé par un faux (page.route) : le vrai chemin (transaction, montant, journal) est couvert par tests/devis-serveur.test.js (CA) et devis-montant-affaire.test.js (N15).
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, lireDocument, listerDocuments, creerOrganisation, creerAffaire, JEROME, FIRESTORE, PROJET, URL_APP } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-choisir-affaire/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: true, animations: 'disabled' });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const ALICE = 'alice@exemple.test';
const LIGNES = [{ id: 'l1', libelle: 'Carrelage', familleId: 'famille-1', type: 'fourniture', quantite: 10, unite: 'm²', prixAchat: 40, prixVente: 60, tauxTva: 20 }];

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

/** Un devis déjà dans la base (contourne l'écran). `base` = '' (Jérôme) ou 'clients/<client>/'. */
async function devis(id, valeurs = {}, base = '') {
  const maintenant = new Date();
  await ecrireDocument(`${base}devis_devis/${id}`, {
    racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: null, personneId: null, organisationId: 'o1', modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: '2099-12-31', objet: 'Rénovation', destinataires: ['contact@exemple.fr'],
    sections: [{ id: 's1', titre: 'Cuisine', lignes: LIGNES }], creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant,
    finaliseLe: valeurs.statut ? new Date(Date.now() - 86400000) : undefined, ...valeurs,
  });
}
const FINALISE = (n) => ({ numero: `DEV-2026-11-01-00${n}`, statut: 'en_attente_envoi' });

async function semer() {
  await creerOrganisation('o1', { nom: 'Société Exemple' });
  await creerOrganisation('o2', { nom: 'Autre Société' });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', organisationId: 'o1' });
  await creerAffaire('a2', { titre: 'Extension garage', organisationId: 'o2' });
  await devis('dSans', FINALISE(1));
  await devis('dAvec', { ...FINALISE(2), affaireId: 'a1' });
  await devis('dOrphelin', { ...FINALISE(3), affaireId: 'aZZ' });
  await devis('dBrouillon');
}

/** Faux serveur : écrit l'affaire sur le devis (et ses versions) et répond comme le vrai. `refus` : message de refus du serveur ; `abandon` : serveur injoignable. */
async function fauxServeur(page, { refus = null, abandon = false } = {}) {
  const appels = [];
  await page.route('**/devisChoisirAffaire', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const demande = JSON.parse(route.request().postData()).data;
    appels.push(demande);
    if (abandon) return route.abort();
    if (refus) return route.fulfill({ status: 400, headers: cors, body: JSON.stringify({ error: { message: refus, status: 'FAILED_PRECONDITION' } }) });
    const actuel = await lireDocument(`devis_devis/${demande.devisId}`);
    await ecrireDocument(`devis_devis/${demande.devisId}`, { ...actuel, affaireId: demande.affaireId });
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ok: true, devisId: demande.devisId, affaireId: demande.affaireId, versions: 1 } }) });
  });
  return appels;
}
const lignes = (page) => page.locator('.page-liste-devis :is(tr.ligne-devis, .carte-devis)[data-id]');
const bouton = (page) => page.locator('[data-action="choisir-affaire"]');
const fenetre = (page) => page.getByRole('dialog');
async function voir(page, id) {
  await connecter(page, JEROME, { route: `devis/voir/${id}` });
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await page.locator('.page-editeur-devis .barre-devis [data-onglet="edition"]').click(); // un devis finalisé s'ouvre sur la Prévisualisation ; l'en-tête (client, affaire) est dans l'onglet Édition
  await attendreCalme(page);
}
async function ouvrirChoix(page) {
  await bouton(page).click();
  await expect(fenetre(page)).toContainText('Choisir l’affaire');
}
const propositions = (page) => fenetre(page).locator('.suggestions:not([hidden]) .suggestion');

test('1 liste : Filtres > Affaire « Sans affaire » ne garde que les devis sans affaire (ou dont l’affaire a disparu) ; Filtres vaut 1 ; Tout effacer remet les 4 devis', async ({ page }, info) => {
  await semer();
  await connecter(page, JEROME, { route: 'devis/liste' });
  await expect(lignes(page)).toHaveCount(4);
  await page.getByRole('button', { name: /Filtres/ }).click();
  await page.locator('.voile-dialogue select[data-cle="affaire"]').selectOption('sans');
  await page.locator('.voile-dialogue').getByRole('button', { name: 'Appliquer' }).click();
  await expect(lignes(page)).toHaveCount(3);
  await expect(page.locator('.page-liste-devis [data-id="dAvec"]')).toHaveCount(0);
  for (const id of ['dSans', 'dOrphelin', 'dBrouillon']) await expect(lignes(page).filter({ has: page.locator(`[data-id="${id}"]`) }).or(page.locator(`.page-liste-devis [data-id="${id}"]`)).first()).toBeVisible();
  await expect(page.locator('[data-action="filtres"] .compteur-filtres')).toHaveText('1');
  await expect(page.locator('.page-liste-devis [data-id="dOrphelin"] [data-valeur="sans-affaire"]')).toHaveText('Sans affaire'); // l'affaire disparue s'écrit « Sans affaire »
  await capturer(page, info, '1-filtre-sans-affaire');
  await page.getByRole('button', { name: /Filtres/ }).click();
  await page.locator('.voile-dialogue').getByRole('button', { name: 'Tout effacer' }).click();
  await expect(lignes(page)).toHaveCount(4);
});

test('2 écran d’un devis finalisé sans affaire : le lien « Choisir l’affaire » est là et cliquable (pas grisé) ; absent si le devis a une affaire ou est un brouillon ; aucun champ dans la feuille', async ({ page }, info) => {
  await semer();
  await voir(page, 'dSans');
  await expect(bouton(page)).toBeVisible();
  await expect(bouton(page)).not.toHaveAttribute('data-lecture', 'verrou');
  await expect(bouton(page)).not.toHaveAttribute('aria-disabled', 'true');
  await expect(page.locator('.entete-droite .champ-intelligent')).toHaveCount(0);
  await expect(page.locator('[data-champ="affaire"]')).toHaveValue('');
  await capturer(page, info, '2-bouton-choisir');
  await voir(page, 'dAvec');
  await expect(bouton(page)).toHaveCount(0);
  await connecter(page, JEROME, { route: 'devis/editeur/dBrouillon' });
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await expect(bouton(page)).toHaveCount(0);
});

test('3 le choix : la fenêtre ne propose que les affaires du client ; UN appel au serveur ; « Affaire choisie » ; le nom s’affiche ; le lien disparaît ; la liste ne dit plus « Sans affaire »', async ({ page }, info) => {
  await semer();
  const appels = await fauxServeur(page);
  await voir(page, 'dSans');
  await ouvrirChoix(page);
  const bas = fenetre(page).getByRole('button', { name: 'Choisir l’affaire' });
  await expect(bas).toBeDisabled(); // rien n'est choisi
  await fenetre(page).locator('[data-champ="choisir-affaire"]').click();
  await expect(propositions(page).filter({ hasText: 'Rénovation cuisine' })).toHaveCount(1);
  await expect(propositions(page).filter({ hasText: 'Extension garage' })).toHaveCount(0); // l'affaire d'un autre client
  await capturer(page, info, '3-fenetre-choisir');
  await propositions(page).filter({ hasText: 'Rénovation cuisine' }).click();
  await expect(bas).toBeEnabled();
  await bas.click();
  await expect(page.locator('.toast, [role="status"]').filter({ hasText: 'Affaire choisie' }).first()).toBeVisible();
  expect(appels).toEqual([{ devisId: 'dSans', affaireId: 'a1' }]);
  await expect(page.locator('[data-champ="affaire"]')).toHaveValue(/Rénovation cuisine/);
  await expect(page.locator('[data-valeur="lien-affaire"]')).toBeVisible();
  await expect(bouton(page)).toHaveCount(0);
  expect((await lireDocument('devis_devis/dSans')).affaireId).toBe('a1');
  await page.goto(`${URL_APP}#/devis/liste`);
  await expect(page.locator('.page-liste-devis [data-id="dSans"] [data-valeur="sans-affaire"]')).toHaveCount(0);
});

test('4 cas d’erreur : le serveur refuse → toast rouge avec son message, le devis ne bouge pas ; serveur injoignable → « rien n’a été perdu »', { annotation: { type: 'erreurs-reseau-attendues', description: 'le faux serveur répond 400 puis coupe la connexion' } }, async ({ page }, info) => {
  await semer();
  let appels = await fauxServeur(page, { refus: 'Ce devis a déjà une affaire : un devis finalisé ne change pas d’affaire.' });
  await voir(page, 'dSans');
  await ouvrirChoix(page);
  await fenetre(page).locator('[data-champ="choisir-affaire"]').click();
  await propositions(page).filter({ hasText: 'Rénovation cuisine' }).click();
  await fenetre(page).getByRole('button', { name: 'Choisir l’affaire' }).click();
  const toast = page.locator('.toast, [role="status"], [role="alert"]').filter({ hasText: 'a déjà une affaire' }).first();
  await expect(toast).toBeVisible();
  expect(appels).toHaveLength(1);
  expect((await lireDocument('devis_devis/dSans')).affaireId ?? null).toBeNull();
  await capturer(page, info, '4-erreur');
  await fenetre(page).getByRole('button', { name: 'Annuler' }).click();
  await expect(bouton(page)).toBeVisible();
  // serveur injoignable
  await page.unroute('**/devisChoisirAffaire');
  appels = await fauxServeur(page, { abandon: true });
  await ouvrirChoix(page);
  await fenetre(page).locator('[data-champ="choisir-affaire"]').click();
  await propositions(page).filter({ hasText: 'Rénovation cuisine' }).click();
  await fenetre(page).getByRole('button', { name: 'Choisir l’affaire' }).click();
  await expect(page.locator('.toast, [role="status"], [role="alert"]').filter({ hasText: 'rien n’a été perdu' }).first()).toBeVisible();
  expect((await lireDocument('devis_devis/dSans')).affaireId ?? null).toBeNull();
  await expect(bouton(page)).toBeVisible();
});

test('5 cas vide : un client sans affaire → la fenêtre ne propose que « + Créer l’affaire » ; aucune affaire créée avant le choix de l’étape ; puis une affaire est créée ET rattachée', async ({ page }, info) => {
  await creerOrganisation('o3', { nom: 'Client Neuf' });
  await devis('dVide', { ...FINALISE(5), organisationId: 'o3' });
  const appels = await fauxServeur(page);
  await voir(page, 'dVide');
  await ouvrirChoix(page);
  await fenetre(page).locator('[data-champ="choisir-affaire"]').click();
  await expect(propositions(page)).toHaveText([/\+ Créer l’affaire « Affaire Client Neuf »/]);
  await propositions(page).first().click();
  await expect(fenetre(page)).toContainText('Dans quelle étape ?');
  expect(await listerDocuments('crm_affaires')).toHaveLength(0);
  expect(appels).toHaveLength(0);
  await capturer(page, info, '5-cas-vide-creer');
  await propositions(page).first().click();
  await expect.poll(async () => (await listerDocuments('crm_affaires')).length).toBe(1);
  await expect.poll(() => appels.length).toBe(1);
  const affaire = (await listerDocuments('crm_affaires'))[0];
  expect(appels[0]).toEqual({ devisId: 'dVide', affaireId: affaire.id });
});

test('6 Devis seul (client sans Affaires) : aucun critère « Affaire » dans Filtres, aucun « Choisir l’affaire », aucune mention « Sans affaire »', async ({ page }, info) => {
  await chargerRegles('firestore.plateforme.rules');
  try {
    await ecrireDocument('marques/devisseul', { actif: true, nom: 'Devis Seul', couleur: '#336699', accueil: 'Bienvenue.' });
    await ecrireDocument('clients/devisseul', { modules: { devis: true } });
    await ecrireDocument(`clients/devisseul/membres/${ALICE}`, { role: 'editeur' });
    await ecrireDocument('clients/devisseul/devis_parametres/reglages', { regimeTva: 'assujetti', entreprise: { nom: 'Atelier Exemple', siret: '123 456 789 00012' } });
    await devis('cSans', { ...FINALISE(6), creePar: ALICE, organisationId: null }, 'clients/devisseul/');
    await page.goto('about:blank');
    await page.goto(`${URL_APP}#/espace/devisseul/portail-devis`);
    await page.waitForFunction(() => !!window.__chevalierTest);
    await page.evaluate((e) => window.__chevalierTest.connecter(e, true), ALICE);
    await expect(page.locator('.page-liste-devis')).toBeVisible();
    await expect(lignes(page)).toHaveCount(1);
    await expect(page.locator('[data-valeur="sans-affaire"]')).toHaveCount(0);
    await page.getByRole('button', { name: /Filtres/ }).click();
    await expect(page.locator('.voile-dialogue select[data-cle="aTraiter"]')).toBeVisible(); // la fenêtre est bien ouverte…
    await expect(page.locator('.voile-dialogue select[data-cle="affaire"]')).toHaveCount(0); // …sans critère « Affaire »
    await capturer(page, info, '6-devis-seul');
    await page.keyboard.press('Escape');
    await page.goto(`${URL_APP}#/espace/devisseul/portail-devis/devis/voir/cSans`);
    await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
    await expect(bouton(page)).toHaveCount(0);
    await expect(page.locator('[data-champ="affaire"]')).toHaveCount(0);
  } finally { await chargerRegles('firestore.rules'); }
});

test('7 affaire supprimée (identifiant orphelin) : le champ Affaire est vide (plus « Affaire du devis »), le lien est là ; le choix rattache à l’affaire du client', async ({ page }, info) => {
  await semer();
  const appels = await fauxServeur(page);
  await voir(page, 'dOrphelin');
  await expect(page.locator('[data-champ="affaire"]')).toHaveValue('');
  await expect(bouton(page)).toBeVisible();
  await capturer(page, info, '7-orphelin');
  await ouvrirChoix(page);
  await fenetre(page).locator('[data-champ="choisir-affaire"]').click();
  await propositions(page).filter({ hasText: 'Rénovation cuisine' }).click();
  await fenetre(page).getByRole('button', { name: 'Choisir l’affaire' }).click();
  await expect.poll(() => appels.length).toBe(1);
  expect(appels[0]).toEqual({ devisId: 'dOrphelin', affaireId: 'a1' });
});
