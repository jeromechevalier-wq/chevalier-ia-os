// Module Devis, écran « Devis » (liste des devis). Chez Jérôme (racine). Captures dans tests/e2e/captures/devis-liste/ (ordinateur et téléphone : la mise en page change).
// Les fonctions du serveur (devisFinaliser, devisChangerStatut…) n'existent pas dans l'émulateur du navigateur : elles sont SIMULÉES par page.route.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, creerOrganisation, creerAffaire, JEROME } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-liste/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: true, animations: 'disabled' });
}
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const jourDansLe = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

/** Un devis déjà dans la base (contourne l'écran). */
async function devis(id, valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument(`devis_devis/${id}`, {
    racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: null, personneId: null, organisationId: null, modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: jourDansLe(60),
    sections: [{ id: 's1', titre: 'Cuisine', lignes: [{ id: 'l1', libelle: 'Carrelage', quantite: 2, unite: 'm²', prixAchat: 50 }] }],
    creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, ...valeurs,
  });
}
async function deuxDevis() {
  await creerOrganisation('o1', { nom: 'Société Exemple' });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', organisationId: 'o1' });
  await devis('d1', {
    numero: 'DEV-2026-10-02-001', statut: 'envoye', affaireId: 'a1', organisationId: 'o1', expireLe: jourDansLe(30), finaliseLe: new Date(Date.now() - 20 * 86400000),
    totaux: { ht: 1000, tva: 200, ttc: 1200 }, creeLe: new Date(Date.now() - 22 * 86400000), modifieLe: new Date(Date.now() - 2 * 86400000),
  });
  await devis('d2', { affaireId: 'a1', organisationId: 'o1', modifieLe: new Date(Date.now() - 5 * 60000) });
}
async function ouvrir(page) {
  await connecter(page, undefined, { route: 'devis/liste' });
  await expect(page.locator('.page-liste-devis')).toBeVisible();
  await attendreCalme(page);
}
const estTel = (info) => info.project.name === 'telephone';
const lignes = (page) => page.locator('tr.ligne-devis');
const cartes = (page) => page.locator('.carte-devis');
async function ouvrirMenuDe(page, id) {
  await page.locator(`[data-id="${id}"] [data-action="menu-devis"]`).click();
  await expect(page.locator('.menu-pop')).toBeVisible();
}

test('E1 la vue Liste montre les deux devis, le plus récemment modifié d’abord, avec client, affaire, totaux et « 1 à 2 sur 2 éléments »', { tag: '@smoke' }, async ({ page }, info) => {
  await deuxDevis();
  await ouvrir(page);
  await expect(page.getByRole('heading', { name: 'Devis', level: 1 })).toBeVisible();
  await expect(lignes(page)).toHaveCount(2);
  await expect(lignes(page).nth(0)).toHaveAttribute('data-id', 'd2'); // modifié il y a 5 min
  await expect(lignes(page).nth(1)).toHaveAttribute('data-id', 'd1');
  await expect(lignes(page).nth(1).locator('[data-colonne="numero"]')).toContainText('DEV-2026-10-02-001');
  await expect(lignes(page).nth(1).locator('[data-colonne="statut"]')).toContainText('Envoyé');
  await expect(lignes(page).nth(0).locator('[data-colonne="statut"]')).toContainText('Brouillon');
  await expect(lignes(page).nth(1).locator('[data-colonne="client"]')).toContainText('Société Exemple');
  await expect(lignes(page).nth(1).locator('[data-colonne="client"]')).toContainText('Rénovation cuisine');
  await expect(lignes(page).nth(1).locator('[data-colonne="modifie"]')).toContainText('il y a 2 j');
  await expect(lignes(page).nth(1).locator('[data-colonne="modifie"]')).toContainText('JC');
  await expect(lignes(page).nth(1).locator('[data-colonne="ht"]')).toContainText('1 000');
  await expect(lignes(page).nth(0).locator('[data-colonne="ht"]')).toContainText('125');
  await expect(lignes(page).nth(0).locator('[data-colonne="ttc"]')).toContainText('150');
  await expect(page.locator('[data-valeur="pagination"]')).toHaveText('1 à 2 sur 2 éléments');
  await expect(page.locator('[data-champ="par-page"]')).toHaveValue('25');
  await expect(page.locator('[data-action="nouveau-devis"]')).toBeEnabled(); // l'éditeur existe
  await expect(page.locator('[data-action="nouveau-devis"]')).not.toContainText('bientôt disponible');
  await capturer(page, info, 'E1-vue-liste');
});

async function tableau4() {
  await deuxDevis();
  await devis('d3', { numero: 'DEV-2026-10-03-002', statut: 'accepte', finaliseLe: new Date(), totaux: { ht: 500, tva: 100, ttc: 600 } });
  await devis('d4', { numero: 'DEV-2026-09-01-003', statut: 'en_attente_envoi', finaliseLe: new Date(Date.now() - 60 * 86400000), expireLe: jourDansLe(-5), totaux: { ht: 80, tva: 16, ttc: 96 } }); // validité dépassée : « Expiré »
  await devis('d5', { numero: 'DEV-2026-10-05-004', statut: 'en_attente_envoi', finaliseLe: new Date(), totaux: { ht: 300, tva: 60, ttc: 360 } });
  await devis('d6', { numero: 'DEV-2026-08-01-005', statut: 'remplace', finaliseLe: new Date(Date.now() - 70 * 86400000), totaux: { ht: 90, tva: 18, ttc: 108 } });
}
async function versTableau(page) {
  await ouvrir(page);
  await page.locator('[data-vue="tableau"]').click();
  await expect(page.locator('.colonne')).not.toHaveCount(0);
}

test('E2 la vue Tableau range chaque devis dans la colonne de son statut, sans glisser-déposer', async ({ page }, info) => {
  await tableau4();
  await versTableau(page);
  await expect(page.locator('[data-colonne="brouillon"] .carte-devis')).toHaveCount(1);
  await expect(page.locator('[data-colonne="envoye"] .carte-devis[data-id="d1"]')).toHaveCount(1);
  await expect(page.locator('[data-colonne="accepte"] .carte-devis')).toHaveAttribute('data-id', 'd3');
  await expect(page.locator('[data-colonne="envoye"] .carte-devis[data-id="d1"]')).toContainText('Société Exemple');
  await expect(page.locator('[data-colonne="envoye"] .carte-devis[data-id="d1"]')).toContainText('Rénovation cuisine');
  await expect(page.locator('[draggable="true"]')).toHaveCount(0);
  await expect(cartes(page)).toHaveCount(4); // d1, d2, d3, d5 : ni l'expiré (d4) ni le remplacé (d6)
  await capturer(page, info, 'E2-vue-tableau');
});

test('1 le Tableau a exactement quatre colonnes : Brouillon, Envoyé, Signé, Refusé', async ({ page }, info) => {
  await tableau4();
  await versTableau(page);
  await expect(page.locator('.colonne')).toHaveCount(4);
  await expect(page.locator('.colonne h2')).toHaveText(['Brouillon', 'Envoyé', 'Signé', 'Refusé']);
  await capturer(page, info, '1-quatre-colonnes');
});

test('2 un devis finalisé apparaît dans Envoyé avec la pastille « Pas encore envoyé » ; un devis envoyé n’en a pas', async ({ page }, info) => {
  await tableau4();
  await versTableau(page);
  const finalise = page.locator('[data-colonne="envoye"] .carte-devis[data-id="d5"]');
  await expect(finalise).toHaveCount(1);
  await expect(finalise.locator('[data-pastille="pas-encore-envoye"]')).toHaveText('Pas encore envoyé');
  await expect(page.locator('[data-colonne="envoye"] .carte-devis[data-id="d1"] [data-pastille="pas-encore-envoye"]')).toHaveCount(0);
  await capturer(page, info, '2-finalise-dans-envoye');
});

test('3 un devis remplacé (ou expiré) n’est plus dans le Tableau mais il est dans Archives', async ({ page }, info) => {
  await tableau4();
  await versTableau(page);
  await expect(page.locator('.carte-devis[data-id="d6"], .carte-devis[data-id="d4"]')).toHaveCount(0);
  await page.locator('[data-vue="archives"]').click();
  await expect(lignes(page)).toHaveCount(2);
  await expect(page.locator('tr.ligne-devis[data-id="d6"] [data-colonne="statut"]')).toContainText('Remplacé');
  await expect(page.locator('tr.ligne-devis[data-id="d4"] [data-colonne="statut"]')).toContainText('Expiré');
  await capturer(page, info, '3-remplace-dans-archives');
});

test('E5 cas vide : sans devis archivé, remplacé ni expiré, Archives dit « Aucun devis archivé. »', async ({ page }) => {
  await deuxDevis();
  await ouvrir(page);
  await page.locator('[data-vue="archives"]').click();
  await expect(page.getByText('Aucun devis archivé.')).toBeVisible();
});

test('4 la dernière colonne du Tableau est entièrement visible sur ordinateur (bord droit dans la fenêtre)', async ({ page }, info) => {
  await tableau4();
  await versTableau(page);
  const { droite, largeur } = await page.evaluate(() => ({ droite: document.querySelector('.colonne:last-child').getBoundingClientRect().right, largeur: window.innerWidth }));
  if (!estTel(info)) expect(droite).toBeLessThanOrEqual(largeur); // sur téléphone, voir le point 6
  await capturer(page, info, '4-derniere-colonne-visible');
});

test('5 le numéro d’une carte reste sur au plus 2 lignes (plus de bouton « Variante » sur la carte)', async ({ page }, info) => {
  await tableau4();
  await versTableau(page);
  const carte = page.locator('.carte-devis[data-id="d1"]');
  await expect(carte.locator('[data-action="modifier-devis"]')).toHaveCount(0);
  const m = await carte.locator('.carte-titre').evaluate((el) => ({ h: el.getBoundingClientRect().height, lh: parseFloat(getComputedStyle(el).lineHeight) || parseFloat(getComputedStyle(el).fontSize) * 1.4 }));
  expect(m.h).toBeLessThanOrEqual(m.lh * 2 + 2);
  await capturer(page, info, '5-carte-version');
});

test('7 la carte du Tableau est simple : HT en bas à gauche, pastille ronde en bas à droite, ni TTC, ni « il y a », ni dates', async ({ page }, info) => {
  await tableau4();
  await versTableau(page);
  const carte = page.locator('.carte-devis[data-id="d1"]');
  await expect(carte.locator('.carte-pied .carte-montant')).toContainText('HT');
  await expect(carte.locator('.carte-pied .pastille-activite')).toHaveCount(1);
  const texte = await carte.innerText();
  expect(texte).not.toMatch(/TTC|il y a|En date du|Valable jusqu/);
  await expect(page.locator('.carte-devis[data-id="d3"] .pastille-activite')).toHaveClass(/rouge/); // signé mais PDF non rangé
  await capturer(page, info, '7-carte-simple');
});

test('6 téléphone : le Tableau garde son défilement horizontal des colonnes', async ({ page }, info) => {
  await tableau4();
  await versTableau(page);
  const r = await page.evaluate(() => { const k = document.querySelector('.tableau-devis-colonnes'); return { defile: k.scrollWidth > k.clientWidth, colonnes: k.querySelectorAll('.colonne').length }; });
  expect(r.colonnes).toBe(4);
  if (estTel(info)) expect(r.defile).toBe(true);
  await capturer(page, info, '6-tableau-telephone');
});

test('E3 le menu « … » : changements de statut par le serveur, entrées « bientôt disponible » grisées, Voir le devis ouvre la visualisation, erreur du serveur dite en clair', { annotation: { type: 'erreurs-reseau-attendues', description: 'le faux serveur répond 400, comme le vrai' } }, async ({ page }, info) => {
  await deuxDevis();
  const appels = [];
  let refuser = false;
  await page.route('**/devisChangerStatut', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    appels.push(JSON.parse(route.request().postData()).data);
    if (refuser) return route.fulfill({ status: 400, headers: cors, body: JSON.stringify({ error: { message: 'Ce devis ne peut plus changer de statut.', status: 'FAILED_PRECONDITION' } }) });
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ok: true } }) });
  });
  await ouvrir(page);
  // Devis envoyé : Signé et Refusé proposés, rien d'autre en statut ; Préparer l’e-mail est permis, Facturer n'existe plus (pas de facturation prévue) ; Dupliquer et la nouvelle version sont actifs (l'éditeur existe).
  await ouvrirMenuDe(page, 'd1');
  const menu = page.locator('.menu-pop');
  await expect(menu.getByRole('menuitem', { name: /Passer à « Signé »/ })).toBeEnabled();
  await expect(menu.getByRole('menuitem', { name: /Passer à « Refusé »/ })).toBeEnabled();
  await expect(menu.getByRole('menuitem', { name: /Passer à « Envoyé »/ })).toHaveCount(0);
  await expect(menu.getByRole('menuitem', { name: /Facturer/ })).toHaveCount(0);
  await expect(menu.getByRole('menuitem', { name: /Préparer l’e-mail/ })).toBeDisabled(); // faux serveur « pas branché » : entrée grisée dès la première ouverture, avec sa phrase
  await expect(menu).toContainText('pas encore branchée');
  for (const nom of [/Dupliquer/, /Créer une nouvelle version/, /Voir le devis/]) await expect(menu.getByRole('menuitem', { name: nom })).toBeEnabled();
  await expect(menu.getByRole('menuitem', { name: /Éditer le devis/ })).toBeEnabled(); // un devis finalisé s'ouvre sur l'Édition, en lecture seule
  await expect(menu.getByRole('menuitem', { name: /Supprimer/ })).toHaveCount(0); // seulement un brouillon
  await capturer(page, info, 'E3-menu-devis-envoye');
  // Signé : la demande part au serveur (jamais une écriture directe).
  await menu.getByRole('menuitem', { name: /Passer à « Signé »/ }).click();
  await expect(page.locator('.toast')).toContainText('Devis passé à « Signé »');
  expect(appels).toEqual([{ devisId: 'd1', action: 'accepter' }]);
  // Le serveur refuse : son message s'affiche en clair.
  refuser = true;
  await ouvrirMenuDe(page, 'd1');
  await page.locator('.menu-pop').getByRole('menuitem', { name: /Passer à « Refusé »/ }).click();
  await expect(page.locator('.toast').last()).toContainText('Ce devis ne peut plus changer de statut.');
  // Brouillon : Supprimer actif, Éditer le devis actif, Finalisé proposé.
  await ouvrirMenuDe(page, 'd2');
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: /Supprimer/ })).toBeEnabled();
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: /Éditer le devis/ })).toBeEnabled();
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: /Passer à « Finalisé »/ })).toBeEnabled();
  await page.keyboard.press('Escape');
  // Voir le devis : la visualisation (lecture seule), plus de fenêtre d'aperçu.
  await ouvrirMenuDe(page, 'd1');
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Voir le devis' }).click();
  await expect(page).toHaveURL(/#\/devis\/voir\/d1$/);
  await expect(page.locator('.page-editeur-devis.devis-lecture-seule')).toBeVisible();
  await capturer(page, info, 'E3-visualisation');
});

test('E4 recherche et filtre de statut ; cas vide « Aucun devis pour l’instant. » ; aucun résultat', async ({ page }, info) => {
  await ouvrir(page);
  await expect(page.locator('.etat-vide')).toContainText('Aucun devis pour l’instant.');
  await expect(page.locator('[data-action="nouveau-devis-vide"]')).toBeEnabled();
  await capturer(page, info, 'E4-cas-vide');
  await deuxDevis();
  await expect(lignes(page)).toHaveCount(2);
  await page.getByRole('searchbox', { name: 'Rechercher un devis' }).fill('cuisine');
  await expect(lignes(page)).toHaveCount(2); // l'affaire des deux devis
  await page.getByRole('searchbox', { name: 'Rechercher un devis' }).fill('DEV-2026-10-02');
  await expect(lignes(page)).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Rechercher un devis' }).fill('zzz');
  await expect(page.locator('.etat-vide')).toContainText('Aucun devis ne correspond.');
  await page.getByRole('searchbox', { name: 'Rechercher un devis' }).fill('');
  await page.locator('[data-action="filtres"]').click();
  await page.getByRole('dialog').locator('input[data-cle="statuts"][data-valeur="brouillon"]').check();
  await page.getByRole('dialog').getByRole('button', { name: 'Appliquer' }).click();
  await expect(lignes(page)).toHaveCount(1);
  await expect(lignes(page).first()).toHaveAttribute('data-id', 'd2');
  await expect(page.locator('[data-action="filtres"]')).toContainText('1');
});

test('O1 un clic sur la ligne d’un brouillon ouvre l’éditeur (devis/editeur/<id>), sans aperçu ni fiche', async ({ page }) => {
  await deuxDevis();
  await ouvrir(page);
  await lignes(page).locator('[data-colonne="numero"]').first().click(); // d2 (brouillon), le plus récent
  await expect(page).toHaveURL(/#\/devis\/editeur\/d2$/);
  await expect(page.locator('[data-role="fiche-devis"]')).toHaveCount(0);
});

test('O2 un clic sur une carte du Tableau ouvre le devis (l’éditeur pour un brouillon)', async ({ page }) => {
  await tableau4();
  await versTableau(page);
  await page.locator('.carte-devis[data-id="d2"] .carte-titre').click();
  await expect(page).toHaveURL(/#\/devis\/editeur\/d2$/);
});

test('O3 les boutons « Modifier » et « Variante » n’existent plus sur les lignes ni sur les cartes ; le menu « … » reste', async ({ page }) => {
  await deuxDevis();
  await ouvrir(page);
  await expect(page.locator('[data-action="modifier-devis"]')).toHaveCount(0);
  await expect(page.locator('tr.ligne-devis [data-action="menu-devis"]')).toHaveCount(2);
  await page.locator('[data-vue="tableau"]').click();
  await expect(page.locator('.colonne')).not.toHaveCount(0);
  await expect(page.locator('[data-action="modifier-devis"]')).toHaveCount(0);
  await expect(page.locator('.carte-devis [data-action="menu-devis"]')).not.toHaveCount(0);
});

test('O4 un devis envoyé s’ouvre en visualisation (lecture seule) : les actions « Créer une nouvelle version » et « Dupliquer » sont dans le « … », à côté d’« Envoyer »', async ({ page }, info) => {
  await deuxDevis();
  await ouvrir(page);
  await lignes(page).locator('[data-colonne="numero"]').nth(1).click(); // d1 (envoyé)
  await expect(page).toHaveURL(/#\/devis\/voir\/d1$/);
  await expect(page.locator('[data-valeur="lecture-seule"]')).toBeVisible();
  await expect(page.locator('[data-action="creer-variante"]')).toHaveCount(0); // plus de bouton direct : tout est dans « … »
  await expect(page.locator('[data-action="fermer-lecture"]')).toHaveCount(0); // plus de bouton « Fermer » : on quitte par la flèche « Devis » en haut à gauche
  await expect(page.locator('[data-action="fermer"]')).toBeVisible();
  await expect(page.locator('[data-action="marquer-signe"]')).toBeVisible(); // devis envoyé : l'étape suivante est « Devis signé » (26/10/2026)
  await page.locator('[data-action="plus-actions"]').click();
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: 'Créer une nouvelle version' })).toBeEnabled();
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: 'Dupliquer' })).toBeEnabled();
  await page.keyboard.press('Escape');
  await capturer(page, info, 'O4-lecture-seule');
});

test('O5 le menu « … » n’a plus « Voir la fiche » : la fiche n’existe plus et son ancienne adresse ouvre la visualisation', async ({ page }) => {
  await deuxDevis();
  await ouvrir(page);
  await ouvrirMenuDe(page, 'd1');
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: 'Voir la fiche' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.evaluate(() => { location.hash = '#/devis/liste/d1'; });
  await expect(page).toHaveURL(/#\/devis\/voir\/d1$/);
  await expect(page.locator('[data-role="fiche-devis"]')).toHaveCount(0);
});

test('S1 « Supprimer » d’un brouillon : confirmation, appel de devisSupprimer ; « Annuler » n’appelle rien ; un devis envoyé n’a pas d’entrée Supprimer', async ({ page }) => {
  const appels = [];
  await page.route('**/devisSupprimer', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    appels.push(JSON.parse(route.request().postData()).data);
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ok: true } }) });
  });
  await deuxDevis();
  await ouvrir(page);
  await ouvrirMenuDe(page, 'd1'); // envoyé
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: /Supprimer/ })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await ouvrirMenuDe(page, 'd2'); // brouillon
  await page.locator('.menu-pop').getByRole('menuitem', { name: /Supprimer/ }).click();
  await expect(page.getByRole('dialog')).toContainText('Supprimer ce brouillon ?');
  await page.getByRole('dialog').getByRole('button', { name: 'Annuler' }).click();
  expect(appels).toHaveLength(0);
  await ouvrirMenuDe(page, 'd2');
  await page.locator('.menu-pop').getByRole('menuitem', { name: /Supprimer/ }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.locator('.toast').last()).toContainText('Brouillon supprimé');
  expect(appels).toEqual([{ devisId: 'd2' }]);
});

test('E6 le filtre Statut : « Expiré » et « Remplacé » absents en vue Tableau, présents en vue Liste', async ({ page }) => {
  await tableau4();
  await ouvrir(page);
  await page.getByRole('button', { name: /Filtres/ }).click();
  await expect(page.getByRole('checkbox', { name: 'Expiré' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Remplacé' })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('[data-vue="tableau"]').click();
  await page.getByRole('button', { name: /Filtres/ }).click();
  await expect(page.getByRole('checkbox', { name: 'Brouillon' })).toBeVisible();
  await expect(page.getByRole('checkbox', { name: 'Expiré' })).toHaveCount(0);
  await expect(page.getByRole('checkbox', { name: 'Remplacé' })).toHaveCount(0);
});
