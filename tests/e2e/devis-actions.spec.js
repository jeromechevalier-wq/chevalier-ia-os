// Module Devis, actions d'un devis : menu « … » de la liste, bouton « … » et panneau « Historique » de l'éditeur et de la visualisation (route devis/voir/<id>). Chez Jérôme (racine).
// Un test par critère (le nom commence par son numéro : 1 menu d'un brouillon, 2 devis finalisé, 3 mêmes actions partout, 4 ancien lien de fiche, 5 panneau Historique, 6 cas vide, 7 cas d'erreur).
// Captures dans tests/e2e/captures/devis-actions/ (ordinateur ET téléphone : la mise en page change).
// Les fonctions du serveur (devisChangerStatut, devisArchiver, devisNouvelleVersion, devisSupprimer…) n'existent pas dans l'émulateur du navigateur : elles sont SIMULÉES par page.route.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, creerOrganisation, creerAffaire, estTelephone, JEROME } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-actions/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
}
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const jourDansLe = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const menu = (page) => page.locator('.menu-pop');
const entree = (page, nom) => menu(page).getByRole('menuitem', { name: nom });

const LIGNES = [
  { id: 'l1', libelle: 'Carrelage', familleId: 'famille-1', type: 'fourniture', quantite: 10, unite: 'm²', prixAchat: 40, prixVente: 60, tauxTva: 20 },
  { id: 'l2', libelle: 'Pose', familleId: 'famille-2', type: 'main_oeuvre', quantite: 5, unite: 'h', prixAchat: 20, prixVente: 36, tauxTva: 10 },
];

/** Un devis déjà dans la base (contourne l'écran). */
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
const SIGNE = { numero: 'DEV-2026-10-03-002', statut: 'accepte', finaliseLe: new Date(Date.now() - 10 * 86400000), expireLe: jourDansLe(20) };
async function donnees() {
  await creerOrganisation('o1', { nom: 'M. Paul Exemple' });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', organisationId: 'o1' });
  await devis('dBrouillon');
  await devis('dFinalise', { numero: 'DEV-2026-10-02-001', statut: 'en_attente_envoi', finaliseLe: new Date(Date.now() - 2 * 86400000), expireLe: jourDansLe(30) });
  await devis('dEnvoye', { numero: 'DEV-2026-10-01-004', statut: 'envoye', finaliseLe: new Date(Date.now() - 5 * 86400000), envoyeLe: new Date(Date.now() - 4 * 86400000),
    envois: [{ date: new Date(Date.now() - 4 * 86400000), destinataires: ['client@exemple.fr'], copie: [] }] });
  await devis('dSigne', SIGNE);
}
async function ouvrir(page, route = 'devis/liste', selecteur = '.page-liste-devis') {
  await connecter(page, undefined, { route });
  await expect(page.locator(selecteur)).toBeVisible();
  await attendreCalme(page);
}
const menuLigne = async (page, id) => { await page.locator(`tr.ligne-devis[data-id="${id}"] [data-action="menu-devis"]`).click(); await expect(menu(page)).toBeVisible(); };
/** Ouvre le menu « … » de l'éditeur ou de la visualisation. */
const menuEcran = async (page) => { await page.locator('[data-action="plus-actions"]').click(); await expect(menu(page)).toBeVisible(); };
/** Les libellés des entrées du menu ouvert (dans l'ordre), sans les entrées de téléphone (Options, Historique) qui n'existent que dans « … » sur petit écran. */
async function libellesMenu(page) {
  const l = (await menu(page).getByRole('menuitem').allTextContents()).map((t) => t.trim());
  return l.filter((t) => !['Options', 'Historique'].includes(t));
}
async function simulerServeur(page, appels, reponses = {}) {
  for (const nom of ['devisChangerStatut', 'devisArchiver', 'devisNouvelleVersion', 'devisSupprimer', 'devisFinaliser']) {
    await page.route(`**/${nom}`, async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      appels.push([nom, JSON.parse(route.request().postData()).data]);
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: reponses[nom] ?? { ok: true } }) });
    });
  }
}
const historique = (page) => page.locator('[data-zone="historique"]');
/** Ouvre le panneau Historique : bouton de la barre sur ordinateur, entrée du menu « … » sur téléphone. */
async function ouvrirHistorique(page) {
  if (estTelephone(page)) { await menuEcran(page); await entree(page, 'Historique').click(); } else await page.locator('[data-action="historique"]').click();
  await expect(historique(page)).toBeVisible();
}

test('1 le menu « … » d’un brouillon propose « Éditer le devis » et « Voir le devis » ; plus de « Voir la fiche », de « Voir » ni de « Modifier : version actuelle »', async ({ page }, info) => {
  await donnees();
  await ouvrir(page);
  await menuLigne(page, 'dBrouillon');
  await expect(entree(page, 'Éditer le devis')).toBeEnabled();
  await expect(entree(page, 'Voir le devis')).toBeEnabled();
  await expect(menu(page).getByRole('menuitem', { name: 'Voir la fiche' })).toHaveCount(0);
  await expect(menu(page).getByRole('menuitem', { name: 'Modifier : version actuelle' })).toHaveCount(0);
  await expect(menu(page).getByRole('menuitem', { name: 'Voir', exact: true })).toHaveCount(0);
  for (const nom of ['Dupliquer', 'Envoyer par e-mail', 'Archiver', 'Supprimer']) await expect(menu(page).getByRole('menuitem', { name: nom })).toBeVisible();
  await expect(entree(page, 'Archiver')).toBeDisabled();
  await expect(menu(page)).toContainText('Seul un devis signé ou refusé peut être archivé.');
  await capturer(page, info, '1-menu-brouillon');
  // « Voir le devis » ouvre la visualisation (lecture seule), « Éditer le devis » l'éditeur.
  await entree(page, 'Voir le devis').click();
  await expect(page).toHaveURL(/#\/devis\/voir\/dBrouillon$/);
  await expect(page.locator('.page-editeur-devis.devis-lecture-seule')).toBeVisible();
  await expect(page.locator('[data-valeur="lecture-seule"]')).toContainText('Éditer le devis');
  await page.goBack();
  await expect(page.locator('.page-liste-devis')).toBeVisible();
  await menuLigne(page, 'dBrouillon');
  await entree(page, 'Éditer le devis').click();
  await expect(page).toHaveURL(/#\/devis\/editeur\/dBrouillon$/);
  await expect(page.locator('.page-editeur-devis.devis-lecture-seule')).toHaveCount(0);
});

test('1 la carte du Tableau a le même menu', async ({ page }) => {
  await donnees();
  await ouvrir(page);
  await page.locator('[data-vue="tableau"]').click();
  await page.locator('article.carte-devis[data-id="dBrouillon"] [data-action="menu-devis"]').click();
  await expect(entree(page, 'Éditer le devis')).toBeEnabled();
  await expect(entree(page, 'Voir le devis')).toBeEnabled();
  await expect(menu(page).getByRole('menuitem', { name: 'Voir la fiche' })).toHaveCount(0);
  await page.keyboard.press('Escape');
});

test('2 un devis finalisé ne s’édite pas : « Éditer le devis » est grisé avec sa phrase, « Créer une nouvelle version » est proposé et ouvre le brouillon suivant', async ({ page }, info) => {
  await donnees();
  const appels = [];
  await simulerServeur(page, appels, { devisNouvelleVersion: { ok: true, devisId: 'dV2' } });
  await ouvrir(page);
  await menuLigne(page, 'dFinalise');
  await expect(entree(page, 'Éditer le devis')).toBeDisabled();
  await expect(menu(page)).toContainText('Ce devis est finalisé : on ne le modifie plus.');
  await expect(entree(page, 'Créer une nouvelle version')).toBeEnabled();
  await capturer(page, info, '2-menu-finalise');
  await devis('dV2', { numero: 'DEV-2026-10-02-001', version: 2, racineId: 'dFinalise' }); // ce que ferait le serveur
  await entree(page, 'Créer une nouvelle version').click();
  expect(appels).toEqual([['devisNouvelleVersion', { devisId: 'dFinalise' }]]);
  await expect(page).toHaveURL(/#\/devis\/editeur\/dV2$/);
  await expect(page.locator('.page-editeur-devis.devis-lecture-seule')).toHaveCount(0);
});

test('2 un devis signé : pas de « Créer une nouvelle version » ; l’adresse d’édition d’un devis finalisé ouvre la visualisation', async ({ page }) => {
  await donnees();
  await ouvrir(page);
  await menuLigne(page, 'dSigne');
  await expect(entree(page, 'Éditer le devis')).toBeDisabled();
  await expect(menu(page).getByRole('menuitem', { name: 'Créer une nouvelle version' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.evaluate(() => { location.hash = '#/devis/editeur/dFinalise'; });
  await expect(page).toHaveURL(/#\/devis\/voir\/dFinalise$/);
  await expect(page.locator('.page-editeur-devis.devis-lecture-seule')).toBeVisible();
  // un clic sur la ligne d'un devis finalisé ouvre aussi la visualisation
  await page.evaluate(() => { location.hash = '#/devis/liste'; });
  await expect(page.locator('.page-liste-devis')).toBeVisible();
  await page.locator('tr.ligne-devis[data-id="dSigne"] td[data-colonne="client"]').click();
  await expect(page).toHaveURL(/#\/devis\/voir\/dSigne$/);
});

test('3 le « … » de l’éditeur et celui de la visualisation proposent les mêmes actions que le menu de la liste (sauf Envoyer et l’écran où l’on est)', async ({ page }, info) => {
  await donnees();
  await ouvrir(page);
  const sansEnvoyer = (l) => l.filter((t) => t !== 'Envoyer par e-mail');
  for (const [id, retire] of [['dBrouillon', ['Éditer le devis']], ['dFinalise', ['Éditer le devis']], ['dEnvoye', ['Éditer le devis']], ['dSigne', ['Éditer le devis']]]) {
    await page.evaluate((h) => { location.hash = h; }, '#/devis/liste');
    await expect(page.locator('.page-liste-devis')).toBeVisible();
    await menuLigne(page, id);
    const liste = await libellesMenu(page);
    await page.keyboard.press('Escape');
    // visualisation : la liste moins « Envoyer par e-mail » et « Voir le devis »
    await page.evaluate((h) => { location.hash = h; }, `#/devis/voir/${id}`);
    await expect(page.locator('.page-editeur-devis.devis-lecture-seule')).toBeVisible();
    await attendreCalme(page);
    await expect(page.locator('[data-action="plus-actions"]')).toBeVisible();
    const box = await page.locator('[data-action="plus-actions"]').boundingBox();
    expect(box.width).toBeGreaterThanOrEqual(44);
    expect(box.height).toBeGreaterThanOrEqual(44);
    await expect(page.locator('[data-action="plus-actions"]')).toHaveAttribute('aria-label', 'Autres actions');
    await menuEcran(page);
    expect(await libellesMenu(page), `visualisation ${id}`).toEqual(sansEnvoyer(liste).filter((t) => t !== 'Voir le devis'));
    if (id === 'dSigne') await capturer(page, info, '3-visualisation-menu');
    await page.keyboard.press('Escape');
    if (id === 'dBrouillon') {
      // éditeur : la liste moins « Envoyer par e-mail » et « Éditer le devis »
      await page.evaluate((h) => { location.hash = h; }, `#/devis/editeur/${id}`);
      await expect(page.locator('[data-action="envoyer"]')).toBeVisible();
      await attendreCalme(page);
      await menuEcran(page);
      expect(await libellesMenu(page), 'éditeur').toEqual(sansEnvoyer(liste).filter((t) => !retire.includes(t)));
      await capturer(page, info, '3-editeur-menu');
      await page.keyboard.press('Escape');
    }
  }
});

test('3 Supprimer depuis l’éditeur : confirmation, puis retour à la liste', async ({ page }) => {
  await donnees();
  const appels = [];
  await simulerServeur(page, appels);
  await ouvrir(page, 'devis/editeur/dBrouillon', '.page-editeur-devis');
  await menuEcran(page);
  await entree(page, 'Supprimer').click();
  await expect(page.getByRole('dialog')).toContainText('Supprimer ce brouillon ?');
  await page.getByRole('button', { name: 'Annuler' }).click();
  expect(appels).toEqual([]);
  await menuEcran(page);
  await entree(page, 'Supprimer').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
  await expect(page).toHaveURL(/#\/devis\/liste$/);
  expect(appels).toEqual([['devisSupprimer', { devisId: 'dBrouillon' }]]);
});

test('3 Archiver depuis la visualisation d’un devis signé appelle la fonction du serveur et laisse l’écran ouvert', async ({ page }) => {
  await donnees();
  const appels = [];
  await simulerServeur(page, appels);
  await ouvrir(page, 'devis/voir/dSigne', '.page-editeur-devis');
  await menuEcran(page);
  await entree(page, 'Archiver').click();
  await expect(page.locator('.toast')).toContainText('Devis archivé');
  expect(appels).toEqual([['devisArchiver', { devisId: 'dSigne', archive: true }]]);
  await expect(page).toHaveURL(/#\/devis\/voir\/dSigne$/);
});

test('4 un ancien lien de fiche (#/devis/fiche/<id> ou #/devis/liste/<id>) ouvre la visualisation du devis, pas un écran blanc', async ({ page }, info) => {
  await donnees();
  await ouvrir(page, 'devis/fiche/dFinalise', '.page-editeur-devis');
  await expect(page).toHaveURL(/#\/devis\/voir\/dFinalise$/);
  await expect(page.locator('.page-editeur-devis.devis-lecture-seule')).toBeVisible();
  await expect(page.locator('[data-role="fiche-devis"]')).toHaveCount(0);
  await capturer(page, info, '4-ancien-lien-fiche');
  await page.evaluate(() => { location.hash = '#/devis/liste/dSigne'; });
  await expect(page).toHaveURL(/#\/devis\/voir\/dSigne$/);
  await expect(page.locator('.page-editeur-devis.devis-lecture-seule')).toBeVisible();
  await page.evaluate(() => { location.hash = '#/devis/fiche'; });
  await expect(page).toHaveURL(/#\/devis\/liste$/);
});

test('5 le panneau « Historique » s’ouvre à droite comme Options : versions cliquables, envois par e-mail, dates ; la croix et Échap le ferment', async ({ page }, info) => {
  await donnees();
  await devis('dV2', { numero: 'DEV-2026-10-01-004', version: 2, racineId: 'dEnvoye' });
  await devis('dEnvoye', { numero: 'DEV-2026-10-01-004', statut: 'envoye', racineId: 'dEnvoye', finaliseLe: new Date(Date.now() - 5 * 86400000), envoyeLe: new Date(Date.now() - 4 * 86400000),
    envois: [{ date: new Date(Date.now() - 4 * 86400000), destinataires: ['client@exemple.fr'], copie: [] }] });
  await ouvrir(page, 'devis/voir/dEnvoye', '.page-editeur-devis');
  await ouvrirHistorique(page);
  await expect(page.locator('.page-editeur-devis')).toHaveClass(/avec-options/);
  await expect(historique(page).locator('.historique-version')).toHaveCount(2);
  await expect(historique(page).locator('.historique-version[aria-current="true"]')).toContainText('Version 1');
  if (!estTelephone(page)) await expect(historique(page).locator('.options-fermer')).not.toBeFocused(); // le focus va sur la première version cliquable, pas sur la croix
  await expect(historique(page).locator('[data-valeur="envois"]')).toContainText('client@exemple.fr');
  await expect(historique(page).locator('[data-valeur="dates"]')).toContainText('Créé le');
  await expect(historique(page).locator('[data-valeur="dates"]')).toContainText('Envoyé le');
  await capturer(page, info, '5-historique');
  // Échap ferme, et le focus revient.
  await page.keyboard.press('Escape');
  await expect(historique(page)).toHaveCount(0);
  await expect(page.locator('.page-editeur-devis')).not.toHaveClass(/avec-options/);
  // La croix ferme aussi.
  await ouvrirHistorique(page);
  await page.locator('[data-action="fermer-historique"]').click();
  await expect(historique(page)).toHaveCount(0);
  // Cliquer sur une autre version passe de l'une à l'autre (visualisation) et ferme le panneau.
  await ouvrirHistorique(page);
  await historique(page).locator('.historique-version', { hasText: 'Version 2' }).click();
  await expect(page).toHaveURL(/#\/devis\/editeur\/dV2$/); // dV2 est un brouillon : comme dans la liste, il s'ouvre en édition
  await expect(historique(page)).toHaveCount(0);
});

test('5 le panneau « Historique » reste ouvert quand les données changent et montre le nouvel envoi', async ({ page }) => {
  await donnees();
  const appels = [];
  await simulerServeur(page, appels);
  await ouvrir(page, 'devis/voir/dFinalise', '.page-editeur-devis');
  await ouvrirHistorique(page);
  await expect(historique(page).locator('[data-valeur="aucun-envoi"]')).toHaveText('Pas encore envoyé');
  await menuEcran(page);
  await entree(page, 'Passer à « Envoyé »').click();
  expect(appels).toEqual([['devisChangerStatut', { devisId: 'dFinalise', action: 'marquer_envoye' }]]);
  // ce que ferait le serveur
  await devis('dFinalise', { numero: 'DEV-2026-10-02-001', statut: 'envoye', finaliseLe: new Date(Date.now() - 2 * 86400000), envoyeLe: new Date(), envois: [{ date: new Date(), destinataires: ['client@exemple.fr'], copie: [] }] });
  await expect(historique(page).locator('[data-bloc="envois"] [data-envoi]')).toHaveCount(1);
  await expect(historique(page)).toBeVisible(); // le panneau ne s'est pas fermé tout seul
});

test('1 ouvrir un devis finalisé par l’adresse de l’éditeur ne laisse qu’un seul écran monté (pas d’écran fantôme)', async ({ page }) => {
  await donnees();
  await ouvrir(page);
  await page.evaluate(() => { location.hash = '#/devis/editeur/dFinalise'; });
  await expect(page).toHaveURL(/#\/devis\/voir\/dFinalise$/);
  await attendreCalme(page);
  await expect(page.locator('.page-editeur-devis')).toHaveCount(1);
  await expect(page.locator('.page-liste-devis')).toHaveCount(0);
  // Une mise à jour des données ne touche que l'écran visible (un écran fantôme encore abonné ferait reconstruire un écran retiré et pourrait ouvrir l'ancienne adresse).
  await devis('dFinalise', { numero: 'DEV-2026-10-02-001', statut: 'envoye', finaliseLe: new Date(Date.now() - 2 * 86400000) });
  await attendreCalme(page);
  await expect(page).toHaveURL(/#\/devis\/voir\/dFinalise$/);
  await expect(page.locator('.page-editeur-devis')).toHaveCount(1);
});

test('3 visualisation d’un BROUILLON : « Télécharger le PDF » demande le PDF brouillon et ouvre son écran (jamais l’écran du PDF final)', async ({ page }) => {
  await donnees();
  const appels = [];
  await page.route('**/devisPdf', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    appels.push(JSON.parse(route.request().postData()).data);
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { statut: 'ok', lien: 'x', nom: 'Brouillon' } }) });
  });
  await ouvrir(page, 'devis/voir/dBrouillon', '.page-editeur-devis');
  await page.locator('[data-action="envoyer"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Télécharger le PDF' }).click();
  await expect(page).toHaveURL(/#\/devis\/pdf\/dBrouillon\/brouillon$/);
  expect(appels).toEqual([{ devisId: 'dBrouillon', brouillon: true }]);
});

test('5 « Historique » dans l’éditeur : exclusif avec Options et Catalogue (un seul panneau à la fois)', async ({ page }) => {
  test.skip(estTelephone(page), 'sur téléphone, Catalogue et Historique occupent tout l’écran : le même test passe par le menu « … »');
  await donnees();
  await ouvrir(page, 'devis/editeur/dBrouillon', '.page-editeur-devis');
  await page.locator('[data-action="historique"]').click();
  await expect(historique(page)).toBeVisible();
  await expect(page.locator('[data-action="historique"]')).toHaveAttribute('aria-expanded', 'true');
  await page.locator('[data-action="options"]').click();
  await expect(historique(page)).toHaveCount(0);
  await expect(page.locator('[data-zone="options"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await page.locator('[data-action="bibliotheque"]').click();
  await expect(page.locator('[data-zone="bibliotheque"]')).toBeVisible();
  await page.locator('[data-action="historique"]').click();
  await expect(page.locator('[data-zone="bibliotheque"]')).toHaveCount(0);
  await expect(historique(page)).toBeVisible();
  await page.locator('[data-action="fermer-historique"]').click();
  await expect(historique(page)).toHaveCount(0);
});

test('5 sur téléphone, « Historique » et « Options » passent dans le « … » de l’éditeur', async ({ page }) => {
  test.skip(!estTelephone(page), 'seulement sur téléphone');
  await donnees();
  await ouvrir(page, 'devis/editeur/dBrouillon', '.page-editeur-devis');
  await expect(page.locator('[data-action="historique"]')).toBeHidden();
  await menuEcran(page);
  await expect(entree(page, 'Options')).toBeVisible();
  await entree(page, 'Historique').click();
  await expect(historique(page)).toBeVisible();
});

test('6 cas vide : un brouillon sans envoi dit « Un brouillon n’a pas encore pu être envoyé. » ; un devis introuvable donne le message habituel et un retour à la liste', async ({ page }, info) => {
  await donnees();
  await ouvrir(page, 'devis/voir/dBrouillon', '.page-editeur-devis');
  await ouvrirHistorique(page);
  await expect(historique(page).locator('[data-valeur="aucun-envoi"]')).toContainText('n’a pas encore pu être envoyé');
  await expect(historique(page).locator('.historique-version')).toHaveCount(1);
  await page.keyboard.press('Escape');
  await page.evaluate(() => { location.hash = '#/devis/voir/nexistepas'; });
  await expect(page.locator('[data-etat="introuvable"]')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('[data-etat="introuvable"]')).toContainText('Ce devis est introuvable');
  await capturer(page, info, '6-introuvable');
  await page.locator('[data-action="retour-liste"]').click();
  await expect(page).toHaveURL(/#\/devis\/liste$/);
});

test('6 un devis finalisé jamais envoyé : « Pas encore envoyé »', async ({ page }) => {
  await donnees();
  await ouvrir(page, 'devis/voir/dFinalise', '.page-editeur-devis');
  await ouvrirHistorique(page);
  await expect(historique(page).locator('[data-valeur="aucun-envoi"]')).toHaveText('Pas encore envoyé');
});

test('7 cas d’erreur : une action refusée par le serveur affiche son message dans un toast et laisse l’écran ouvert', async ({ page }, info) => {
  info.annotations.push({ type: 'erreurs-reseau-attendues' });
  await donnees();
  await page.route('**/devisNouvelleVersion', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    return route.abort('failed');
  });
  await ouvrir(page, 'devis/voir/dFinalise', '.page-editeur-devis');
  await menuEcran(page);
  await entree(page, 'Créer une nouvelle version').click();
  await expect(page.locator('.toast')).toContainText('rien n’a été perdu');
  await expect(page).toHaveURL(/#\/devis\/voir\/dFinalise$/);
  await expect(page.locator('.page-editeur-devis.devis-lecture-seule')).toBeVisible();
  await capturer(page, info, '7-erreur-action');
});

test('7 archiver, cas d’erreur depuis la liste : si le serveur ne répond pas, un message s’affiche et le devis reste où il est', async ({ page }, info) => {
  info.annotations.push({ type: 'erreurs-reseau-attendues' });
  await donnees();
  await page.route('**/devisArchiver', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    return route.abort('failed');
  });
  await ouvrir(page);
  await menuLigne(page, 'dSigne');
  await entree(page, 'Archiver').click();
  await expect(page.locator('.toast')).toContainText('rien n’a été perdu');
  await expect(page.locator('tr.ligne-devis[data-id="dSigne"]')).toBeVisible();
});

test('3 archiver puis désarchiver depuis le menu de la liste (fonction du serveur, jamais une écriture directe)', async ({ page }) => {
  await donnees();
  const appels = [];
  await simulerServeur(page, appels);
  await ouvrir(page);
  await menuLigne(page, 'dSigne');
  await entree(page, 'Archiver').click();
  await expect(page.locator('.toast')).toContainText('Devis archivé');
  expect(appels).toEqual([['devisArchiver', { devisId: 'dSigne', archive: true }]]);
  await devis('dSigne', { ...SIGNE, archive: true }); // ce que ferait le serveur
  await expect(page.locator('tr.ligne-devis[data-id="dSigne"]')).toHaveCount(0);
  await page.locator('[data-vue="archives"]').click();
  await menuLigne(page, 'dSigne');
  await entree(page, 'Désarchiver').click();
  await expect(page.locator('.toast', { hasText: 'Devis sorti des archives' })).toBeVisible();
  expect(appels[1]).toEqual(['devisArchiver', { devisId: 'dSigne', archive: false }]);
});
