// Module Devis, visualisation et en-tête (route devis/voir/<id> et devis/editeur/<id>). Chez Jérôme (racine).
// Un test par critère (le nom commence par son numéro) : 1 la visualisation montre le document seul (aucun cadre de totaux), 2 l'en-tête est celui des fiches Affaires et Projets
// (retour, titre, pastille de statut, client et affaire, boutons à droite, pas de montant), 3 l'éditeur d'un brouillon garde ses totaux avec le même en-tête, 4 cas vide, 5 cas d'erreur.
// Captures dans tests/e2e/captures/devis-visualisation/ (ordinateur ET téléphone : la mise en page change).
// La fonction du serveur devisNouvelleVersion n'existe pas dans l'émulateur du navigateur : elle est SIMULÉE par page.route.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, creerOrganisation, creerAffaire, estTelephone, JEROME } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-visualisation/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
}
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const jourDansLe = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const LIGNES = [
  { id: 'l1', libelle: 'Carrelage', familleId: 'famille-1', type: 'fourniture', quantite: 10, unite: 'm²', prixAchat: 40, prixVente: 60, tauxTva: 20 },
  { id: 'l2', libelle: 'Pose', familleId: 'famille-2', type: 'main_oeuvre', quantite: 5, unite: 'h', prixAchat: 20, prixVente: 36, tauxTva: 10 },
];

async function devis(id, valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument(`devis_devis/${id}`, {
    racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', personneId: null, organisationId: 'o1', modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: jourDansLe(60), objet: 'Rénovation restaurant',
    chantier: { adresse: { ligne1: '12 rue des Lilas', codePostal: '49000', ville: 'Angers' } },
    sections: [{ id: 's1', titre: 'Cuisine', lignes: LIGNES }],
    creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: new Date(Date.now() - 5 * 3600000), ...valeurs,
  });
}
async function donnees() {
  await creerOrganisation('o1', { nom: 'M. Paul Exemple' });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', organisationId: 'o1' });
  await devis('dBrouillon');
  await devis('dFinalise', { numero: 'DEV-2026-10-02-001', statut: 'en_attente_envoi', finaliseLe: new Date(Date.now() - 2 * 86400000), expireLe: jourDansLe(30) });
  await devis('dSigne', { numero: 'DEV-2026-10-03-002', version: 2, statut: 'accepte', finaliseLe: new Date(Date.now() - 10 * 86400000), expireLe: jourDansLe(20) });
}
async function ouvrir(page, route, selecteur = '.page-editeur-devis') {
  await connecter(page, undefined, { route });
  await expect(page.locator(selecteur)).toBeVisible();
  await attendreCalme(page);
}
const entete = (page) => page.locator('.page-editeur-devis > .fiche-tete');

async function verifierDocumentSeul(page) {
  const racine = page.locator('.page-editeur-devis');
  await expect(racine.locator('iframe[data-zone="apercu"]')).toBeVisible();
  // Écran unique : l'onglet Édition existe mais reste caché tant qu'on regarde la Prévisualisation (totaux, remise, acompte et « Net à payer » n'y sont pas visibles).
  for (const cache of ['.editeur-edition', '.panneau-total', '.bandeau-net', '[data-champ="remise-type"]', '[data-action="definir-ajustement"]']) await expect(racine.locator(cache), cache).toBeHidden();
  // Le document prend la largeur utile de la page.
  const [cadre, zone] = await Promise.all([racine.locator('iframe[data-zone="apercu"]').boundingBox(), racine.boundingBox()]);
  expect(cadre.width).toBeGreaterThan(zone.width * 0.9);
  await expect(page.locator('iframe[data-zone="apercu"]').contentFrame().locator('body')).toContainText('Carrelage');
}

test('1 la visualisation d’un devis finalisé montre seulement le document, en grand : aucun cadre de totaux, de remise, d’acompte ni de « Net à payer » autour', async ({ page }, info) => {
  await donnees();
  await ouvrir(page, 'devis/voir/dFinalise');
  await verifierDocumentSeul(page);
  await capturer(page, info, '1-visualisation-document-seul');
});

test('1 (brouillon) la visualisation d’un brouillon montre aussi le document seul', async ({ page }) => {
  await donnees();
  await ouvrir(page, 'devis/voir/dBrouillon');
  await verifierDocumentSeul(page);
});

test('1b le bandeau de la visualisation tient en une phrase et dit « nouvelle version » (jamais « variante »)', async ({ page }) => {
  await donnees();
  await ouvrir(page, 'devis/voir/dFinalise');
  const bandeau = page.locator('[data-valeur="lecture-seule"]');
  await expect(bandeau).toContainText('crée une nouvelle version');
  expect((await bandeau.textContent()).split(/[.!?]\s/).filter(Boolean)).toHaveLength(1);
  await expect(page.locator('.page-editeur-devis')).not.toContainText(/variante/i);
  await expect(page.locator('[data-action="creer-variante"]')).toHaveCount(0);
});

test('2 l’en-tête de la visualisation est celui des fiches : « < Devis », titre « Devis <numéro> · v<version> », pastille de statut, client et affaire ; Historique, Envoyer et « … » à droite ; pas de montant', async ({ page }, info) => {
  await donnees();
  await ouvrir(page, 'devis/voir/dSigne');
  const tete = entete(page);
  await expect(tete).toBeVisible();
  await expect(tete.locator('[data-action="fermer"]')).toContainText('Devis');
  await expect(tete.getByRole('heading', { level: 1 })).toHaveText('Devis DEV-2026-10-03-002 · v2');
  const pastille = tete.locator('.fiche-sous .pastille-statut');
  await expect(pastille).toHaveText('Signé'); // les mêmes mots que la liste des devis
  await expect(pastille).toHaveAttribute('data-statut', 'accepte');
  await expect(tete.locator('[data-valeur="lien-client"]')).toContainText('M. Paul Exemple');
  await expect(tete.locator('[data-valeur="lien-affaire"]')).toContainText('Rénovation cuisine');
  // À droite : « … » partout, et AUCUN bouton d'étape pour un devis signé ; Historique sur ordinateur (sur téléphone il passe dans le « … »).
  const droite = page.locator('.barre-devis-droite');
  await expect(droite.locator('[data-action="envoyer"], [data-action="finaliser"], [data-action="marquer-signe"]')).toHaveCount(0);
  await expect(droite.locator('[data-action="plus-actions"]')).toBeVisible();
  if (estTelephone(page)) await expect(droite.locator('[data-action="historique"]')).toBeHidden();
  else await expect(droite.locator('[data-action="historique"]')).toBeVisible();
  // Pas de montant, pas de petit « i », pas de gros bouton jaune « nouvelle version » (elle est dans le « … »).
  await expect(tete.locator('.fiche-montant-devis, [data-valeur="total-entete"]')).toHaveCount(0);
  await expect(tete).not.toContainText('€');
  await expect(tete.locator('.bouton-info')).toHaveCount(0);
  await expect(page.locator('.page-editeur-devis .bouton-principal')).toHaveCount(0); // signé : aucun bouton jaune (voir devis-entete-bouton-jaune.spec.js)
  // Le « … » s'ouvre ; un devis signé n'a pas de nouvelle version (règle du module).
  await droite.locator('[data-action="plus-actions"]').click();
  await expect(page.locator('.menu-pop')).toBeVisible();
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: 'Créer une nouvelle version' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await capturer(page, info, '2-entete-visualisation');
});

test('2c le « … » d’un devis finalisé non signé propose « Créer une nouvelle version »', async ({ page }) => {
  await donnees();
  await ouvrir(page, 'devis/voir/dFinalise');
  await page.locator('.barre-devis [data-action="plus-actions"]').click();
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: 'Créer une nouvelle version' })).toBeVisible();
  await page.keyboard.press('Escape');
});

test('2b la pastille de l’en-tête a les mêmes mots et la même couleur que celle de la liste des devis', async ({ page }) => {
  await donnees();
  await devis('dExpire', { numero: 'DEV-2026-09-01-003', statut: 'envoye', finaliseLe: new Date(Date.now() - 60 * 86400000), envoyeLe: new Date(Date.now() - 59 * 86400000), expireLe: jourDansLe(-5) });
  await ouvrir(page, 'devis/liste', '.page-liste-devis');
  const liste = page.locator('[data-id="dFinalise"] .pastille-statut:visible').first();
  await expect(liste).toBeVisible();
  const [texteListe, couleurListe] = await Promise.all([liste.textContent(), liste.evaluate((el) => getComputedStyle(el).getPropertyValue('--couleur'))]);
  await page.evaluate(() => { location.hash = '#/devis/voir/dFinalise'; });
  const tete = page.locator('.page-editeur-devis > .fiche-tete .pastille-statut');
  await expect(tete).toBeVisible();
  expect((await tete.textContent()).trim()).toBe(texteListe.trim());
  expect(await tete.evaluate((el) => getComputedStyle(el).getPropertyValue('--couleur'))).toBe(couleurListe);
});

test('3 l’éditeur d’un brouillon est intact (totaux, remise, acompte, Net à payer, Catalogue, onglets) avec le même en-tête : retour, titre = objet, pastille « Brouillon », client et affaire, sans montant en haut', async ({ page }, info) => {
  await donnees();
  await ouvrir(page, 'devis/editeur/dBrouillon');
  const racine = page.locator('.page-editeur-devis');
  await expect(racine).not.toHaveClass(/devis-lecture-seule/);
  const tete = entete(page);
  await expect(tete.locator('[data-action="fermer"]')).toContainText('Devis');
  await expect(tete.getByRole('heading', { level: 1 })).toHaveText('Rénovation restaurant'); // le titre d'un brouillon est l'objet du devis (« Nouveau devis » s'il n'y en a pas)
  await expect(tete.locator('.fiche-sous .pastille-statut')).toHaveText('Brouillon'); // « Brouillon » n'apparaît qu'une fois
  await expect(tete.locator('[data-valeur="lien-client"]')).toContainText('M. Paul Exemple');
  await expect(tete.locator('[data-valeur="lien-affaire"]')).toContainText('Rénovation cuisine');
  await expect(tete.locator('[data-valeur="enregistrement"]')).toBeVisible(); // l'indicateur d'enregistrement reste
  await expect(tete.locator('.fiche-montant-devis, [data-valeur="total-entete"]')).toHaveCount(0); // le total est dans la page (et NET À PAYER reste visible en bas)
  await expect(tete).not.toContainText('€');
  // L'édition est intacte.
  for (const action of ['bibliotheque', 'envoyer']) await expect(page.locator(`.barre-devis [data-action="${action}"]`)).toBeVisible();
  await expect(page.locator('.barre-devis [data-onglet="edition"]')).toBeVisible();
  await expect(racine.locator('[data-zone="total"]')).toContainText('Total TTC');
  await expect(racine.locator('[data-champ="remise-type"]')).toBeEnabled();
  await expect(racine.locator('[data-champ="acompte-type"]')).toBeEnabled();
  await expect(racine.locator('.bandeau-net')).toContainText('NET À PAYER');
  await expect(racine.locator('[data-valeur="lecture-seule"]')).toHaveCount(0);
  await capturer(page, info, '3-editeur-brouillon');
});

test('4 cas vide : un devis introuvable (visualisation) dit « Ce devis est introuvable » et propose de revenir à la liste, sans en-tête ni totaux', async ({ page }, info) => {
  await donnees();
  await ouvrir(page, 'devis/voir/nexistepas');
  await expect(page.locator('[data-etat="introuvable"]')).toContainText('Ce devis est introuvable', { timeout: 10000 });
  await expect(page.locator('[data-zone="total"]')).toHaveCount(0);
  await expect(page.locator('[data-action="retour-liste"]')).toBeVisible();
  await capturer(page, info, '4-introuvable');
  await page.locator('[data-action="retour-liste"]').click();
  await expect(page).toHaveURL(/#\/devis\/liste$/);
});

test('5 cas d’erreur : si le serveur refuse « Créer une nouvelle version », un message le dit (toast) et la visualisation reste ouverte, toujours sans totaux', async ({ page }, info) => {
  info.annotations.push({ type: 'erreurs-reseau-attendues' });
  await donnees();
  await page.route('**/devisNouvelleVersion', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    return route.abort('failed');
  });
  await ouvrir(page, 'devis/voir/dFinalise');
  await page.locator('[data-action="plus-actions"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Créer une nouvelle version' }).click();
  await expect(page.locator('.toast')).toContainText('rien n’a été perdu');
  await expect(page).toHaveURL(/#\/devis\/voir\/dFinalise$/);
  await expect(page.locator('.page-editeur-devis.devis-lecture-seule')).toBeVisible();
  await expect(page.locator('[data-zone="total"]')).toBeHidden();
  await capturer(page, info, '5-erreur-nouvelle-version');
});

test('6 « Passer à « Envoyé » » : bouton à contour à côté d’« Envoyer » (jaune) pour un devis finalisé ; un clic passe le statut à Envoyé, la pastille change et le bouton disparaît ; absent pour un devis envoyé, signé ou un brouillon', async ({ page }, info) => {
  await donnees();
  await devis('dEnvoye', { numero: 'DEV-2026-10-01-004', statut: 'envoye', finaliseLe: new Date(Date.now() - 5 * 86400000), envoyeLe: new Date(Date.now() - 4 * 86400000) });
  const appels = [];
  await page.route('**/devisChangerStatut', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    appels.push(JSON.parse(route.request().postData()).data);
    // Le serveur simulé fait le changement (l'écriture remplace tout le document : on le réécrit en entier).
    await devis('dFinalise', { numero: 'DEV-2026-10-02-001', statut: 'envoye', finaliseLe: new Date(Date.now() - 2 * 86400000), envoyeLe: new Date(), expireLe: jourDansLe(30) });
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ok: true } }) });
  });
  await ouvrir(page, 'devis/voir/dFinalise');
  const droite = page.locator('.page-editeur-devis > .barre-devis .barre-devis-droite');
  const passer = droite.locator('[data-action="passer-envoye"]');
  await expect(passer).toHaveText('Passer à « Envoyé »');
  await expect(passer).toHaveClass(/bouton-secondaire/); // 26/10/2026 : le jaune est « Envoyer » (l'étape suivante conseillée) ; « Passer à « Envoyé » » reste visible, en contour
  await expect(passer).toBeVisible(); // aussi sur téléphone : jamais caché dans le « … »
  await expect(droite.locator('[data-action="envoyer"]')).toHaveClass(/bouton-principal/);
  await droite.locator('[data-action="plus-actions"]').click();
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: /Passer à « Envoyé »/ })).toHaveCount(0); // pas de doublon dans le « … »
  await page.keyboard.press('Escape');
  await capturer(page, info, '6-passer-envoye');
  await passer.click();
  await expect(page.locator('.page-editeur-devis > .fiche-tete .fiche-sous .pastille-statut')).toHaveText('Envoyé');
  await expect(passer).toHaveCount(0);
  expect(appels).toHaveLength(1);
  expect(appels[0]).toMatchObject({ devisId: 'dFinalise', action: 'marquer_envoye' });
  await expect(droite.locator('[data-action="marquer-signe"]')).toHaveClass(/bouton-principal/); // devis envoyé : l'étape suivante est « Marquer comme signé »
  await expect(droite.locator('[data-action="envoyer"]')).toHaveCount(0);
  for (const id of ['dEnvoye', 'dSigne', 'dBrouillon']) {
    await page.evaluate((h) => { location.hash = h; }, `#/devis/voir/${id}`);
    await expect(page.locator(`.page-editeur-devis[data-devis="${id}"] .fiche-tete`)).toBeVisible();
    await expect(page.locator('[data-action="passer-envoye"]')).toHaveCount(0);
  }
});

test('6b cas d’erreur : si le serveur refuse « Passer à « Envoyé » », un message le dit (toast), le statut ne change pas et le bouton reste', async ({ page }, info) => {
  info.annotations.push({ type: 'erreurs-reseau-attendues' });
  await donnees();
  await page.route('**/devisChangerStatut', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    return route.abort('failed');
  });
  await ouvrir(page, 'devis/voir/dFinalise');
  await page.locator('[data-action="passer-envoye"]').click();
  await expect(page.locator('.toast')).toContainText('rien n’a été perdu');
  await expect(page.locator('.page-editeur-devis > .fiche-tete .fiche-sous .pastille-statut')).toHaveText('Finalisé');
  await expect(page.locator('[data-action="passer-envoye"]')).toBeVisible();
  await capturer(page, info, '6b-erreur-passer-envoye');
});

test('2c un devis envoyé dont la date de validité est passée affiche « Expiré » dans l’en-tête, comme dans la liste', async ({ page }) => {
  await donnees();
  await devis('dExpire', { numero: 'DEV-2026-09-01-003', statut: 'envoye', finaliseLe: new Date(Date.now() - 60 * 86400000), envoyeLe: new Date(Date.now() - 59 * 86400000), expireLe: jourDansLe(-5) });
  await ouvrir(page, 'devis/liste', '.page-liste-devis');
  await expect(page.locator('[data-id="dExpire"] .pastille-statut:visible').first()).toHaveText('Expiré');
  await page.evaluate(() => { location.hash = '#/devis/voir/dExpire'; });
  await expect(page.locator('.page-editeur-devis > .fiche-tete .fiche-sous .pastille-statut')).toHaveText('Expiré');
});

test('6c un double clic sur « Passer à « Envoyé » » ne fait qu’un seul appel au serveur (bouton grisé pendant l’appel)', async ({ page }) => {
  await donnees();
  const appels = [];
  await page.route('**/devisChangerStatut', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    appels.push(1);
    await new Promise((r) => setTimeout(r, 800));
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ok: true } }) });
  });
  await ouvrir(page, 'devis/voir/dFinalise');
  const passer = page.locator('[data-action="passer-envoye"]');
  await passer.dblclick();
  await expect(passer).toBeDisabled();
  await expect(passer).toHaveAttribute('aria-busy', 'true');
  await expect(page.locator('.toast')).toContainText('Envoyé');
  expect(appels).toHaveLength(1);
});
