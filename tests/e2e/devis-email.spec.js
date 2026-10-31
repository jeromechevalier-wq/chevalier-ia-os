// L'e-mail d'un devis passe UNIQUEMENT par n8n (« Préparer l'e-mail ») depuis le 27/10/2026 : le navigateur ne crée plus de brouillon Gmail et ne demande plus la portée gmail.compose.
// Ici : (1) plus aucune trace de Gmail à l'écran ni sur le réseau, (2) « Devis envoyé » (l'ancien « Marquer comme envoyé ») pose le statut puis note À QUI dans l'historique des envois
// (destinataires et copie du devis), (3) l'historique montre les envois (deux dates pour un renvoi), cas vide compris, (4) un échec de l'historique ne défait pas le statut.
// Les fonctions du serveur (devisChangerStatut, devisEnregistrerEnvoi) sont simulées par page.route et écrivent dans l'émulateur comme le feraient les vraies.
// Un test par critère (le nom commence par le numéro du critère). Captures dans tests/e2e/captures/devis-email/ (ordinateur ET téléphone).
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, lireDocument, creerPersonne, creerAffaire, JEROME } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-email/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' };
const NUMERO = 'DEV-2026-10-25-001';
const fiche = (page) => page.locator('[data-zone="historique"]'); // le panneau « Historique » de la visualisation (la fiche du devis n'existe plus)
/** Ouvre le panneau Historique du devis affiché : bouton de la barre sur ordinateur, menu « … » sur téléphone. */
async function ouvrirHistorique(page) {
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  if ((page.viewportSize()?.width || 1440) < 768) { await page.locator('[data-action="plus-actions"]').click(); await page.getByRole('menuitem', { name: 'Historique' }).click(); } else await page.locator('[data-action="historique"]').click();
  await expect(fiche(page)).toBeVisible();
}

const LIGNES = [{ id: 'l1', libelle: 'Carrelage', familleId: 'famille-1', type: 'fourniture', quantite: 10, unite: 'm²', prixAchat: 40, prixVente: 60, tauxTva: 20 }];
async function semer(id, valeurs = {}) {
  const maintenant = new Date();
  await creerPersonne('p1', { nom: 'Marie Durand' });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', personneId: 'p1' });
  await ecrireDocument(`devis_devis/${id}`, {
    racineId: id, version: 1, numero: NUMERO, statut: 'en_attente_envoi', finaliseLe: maintenant, affaireId: 'a1', personneId: 'p1', organisationId: null,
    modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20, regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: '2026-12-31',
    objet: 'Rénovation restaurant', destinataires: ['marie@exemple.fr'], copie: ['compta@exemple.fr'], sections: [{ id: 's1', titre: 'Cuisine', lignes: LIGNES }],
    pdf: { statut: 'ok', chemin: 'devis/a1/d.pdf', nom: 'Devis.pdf', tentatives: 1 },
    creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, ...valeurs,
  });
}
/** Faux serveur : les deux fonctions de l'historique (elles écrivent dans l'émulateur). `etat.appels` garde l'ordre des appels ; `etat.echecEnvoi` : devisEnregistrerEnvoi répond 500. */
async function simulerServeur(page, id, etat = { appels: [] }) {
  const repondre = (nom, travail) => page.route(`**/${nom}`, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const data = JSON.parse(route.request().postData()).data;
    etat.appels.push([nom, data]);
    if (nom === 'devisEnregistrerEnvoi' && etat.echecEnvoi) return route.fulfill({ status: 500, headers: cors, body: JSON.stringify({ error: { message: 'panne', status: 'INTERNAL' } }) });
    const actuel = await lireDocument(`devis_devis/${id}`);
    await ecrireDocument(`devis_devis/${id}`, travail(actuel, data));
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ok: true, devisId: id, statut: 'envoye' } }) });
  });
  await repondre('devisChangerStatut', (d) => ({ ...d, statut: 'envoye', envoyeLe: new Date() }));
  await repondre('devisEnregistrerEnvoi', (d, data) => ({ ...d, envois: [...(d.envois || []), { date: new Date(), destinataires: data.destinataires, copie: data.copie || [] }] }));
  return etat;
}
/** Note toute requête vers Gmail ou vers la fenêtre d'autorisation Google : il ne doit y en avoir aucune. */
function surveillerGoogle(page) {
  const vues = [];
  page.on('request', (r) => { if (/gmail\.googleapis\.com|mail\.google\.com|accounts\.google\.com\/gsi|\/o\/oauth2\//.test(r.url())) vues.push(r.url()); });
  return vues;
}
async function ouvrirEditeur(page, id) {
  await connecter(page, undefined, { route: `devis/editeur/${id}` });
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
}

test('1 plus de Gmail dans le navigateur : le menu « Envoyer » propose « Préparer l’e-mail », « Télécharger le PDF » et « Imprimer » (aucun envoi Gmail), aucune fenêtre « Envoyer le devis par e-mail », aucune requête vers Gmail ni autorisation Google', async ({ page }, info) => {
  const google = surveillerGoogle(page);
  await semer('dEmail');
  await simulerServeur(page, 'dEmail');
  await ouvrirEditeur(page, 'dEmail');
  await page.locator('[data-action="envoyer"]:visible').first().click();
  const noms = (await page.locator('.menu-pop [role="menuitem"]').allTextContents()).map((n) => n.trim());
  expect(noms).toEqual(['Préparer l’e-mail', 'Télécharger le PDF', 'Imprimer']);
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: /Envoyer par e-mail|Envoyer à nouveau|brouillon Gmail/ })).toHaveCount(0);
  await expect(page.locator('.dialogue-email-devis')).toHaveCount(0);
  await capturer(page, info, '1-menu-envoyer-sans-gmail');
  await page.keyboard.press('Escape');
  await page.locator('[data-action="plus-actions"]').click();
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: /Envoyer par e-mail|Envoyer à nouveau|brouillon Gmail/ })).toHaveCount(0);
  expect(google, 'aucune requête vers Gmail ni vers l’autorisation Google').toEqual([]);
});

test('2 « Devis envoyé » : le statut passe à Envoyé (devisChangerStatut) puis l’envoi est noté avec les destinataires ET la copie du devis (devisEnregistrerEnvoi), et l’historique le montre', async ({ page }, info) => {
  await semer('dEmail');
  const serveur = await simulerServeur(page, 'dEmail');
  await ouvrirEditeur(page, 'dEmail');
  await page.locator('[data-action="passer-envoye"]').click();
  await expect(page.locator('#toasts')).toContainText('Devis passé à « Envoyé »');
  await expect.poll(() => serveur.appels.length).toBe(2);
  expect(serveur.appels).toEqual([
    ['devisChangerStatut', { devisId: 'dEmail', action: 'marquer_envoye' }],
    ['devisEnregistrerEnvoi', { devisId: 'dEmail', destinataires: ['marie@exemple.fr'], copie: ['compta@exemple.fr'] }],
  ]);
  const doc = await lireDocument('devis_devis/dEmail');
  expect([doc.statut, doc.envois.length]).toEqual(['envoye', 1]);
  await page.evaluate(() => { location.hash = '#/devis/voir/dEmail'; });
  await ouvrirHistorique(page);
  await expect(fiche(page).locator('[data-bloc="envois"] [data-envoi]')).toHaveCount(1);
  await expect(fiche(page).locator('[data-bloc="envois"]')).toContainText('à marie@exemple.fr, en copie : compta@exemple.fr');
  await capturer(page, info, '2-historique-un-envoi');
});

test('3 affichage seulement : une base qui contient DEUX envois (semés dans la base, l’écran ne sait plus noter un renvoi) les montre avec leurs deux dates', async ({ page }, info) => {
  const premier = new Date(Date.now() - 5 * 86400000);
  await semer('dEmail', { statut: 'envoye', envoyeLe: premier, envois: [
    { date: premier, destinataires: ['marie@exemple.fr'], copie: [] },
    { date: new Date(), destinataires: ['marie@exemple.fr', 'paul@exemple.fr'], copie: [] },
  ] });
  await connecter(page, undefined, { route: 'devis/voir/dEmail' });
  await ouvrirHistorique(page);
  const lignes = fiche(page).locator('[data-bloc="envois"] [data-envoi]');
  await expect(lignes).toHaveCount(2);
  await expect(lignes.nth(0)).toContainText('à marie@exemple.fr');
  await expect(lignes.nth(1)).toContainText('à marie@exemple.fr, paul@exemple.fr');
  const dates = (await lignes.allTextContents()).map((t) => /Envoyé le (\d{2}\/\d{2}\/\d{4})/.exec(t)[1]);
  expect(new Set(dates).size, 'deux dates différentes').toBe(2);
  await capturer(page, info, '3-historique-deux-envois');
});

test('4 cas vide de l’historique : un devis finalisé jamais envoyé dit « Pas encore envoyé » ; un brouillon dit qu’il n’a pas pu être envoyé', async ({ page }, info) => {
  await semer('dEmail');
  await semer('dBrouillon', { statut: 'brouillon', numero: null, pdf: null });
  await connecter(page, undefined, { route: 'devis/voir/dEmail' });
  await ouvrirHistorique(page);
  await attendreCalme(page);
  await expect(fiche(page).locator('[data-bloc="envois"] [data-valeur="aucun-envoi"]')).toHaveText('Pas encore envoyé');
  await capturer(page, info, '4-historique-jamais-envoye');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { location.hash = '#/devis/voir/dBrouillon'; });
  await ouvrirHistorique(page);
  await expect(fiche(page).locator('[data-bloc="envois"] [data-valeur="aucun-envoi"]')).toContainText('n’a pas encore pu être envoyé');
  await expect(fiche(page).locator('[data-bloc="envois"] [data-envoi]')).toHaveCount(0);
});

test('5 cas d’erreur : si l’historique des envois échoue, le statut « Envoyé » reste posé, un avertissement non bloquant le dit, et la date du premier envoi reste visible (sans adresse)', async ({ page }) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'le faux serveur répond 500 à devisEnregistrerEnvoi' });
  await semer('dEmail');
  const serveur = await simulerServeur(page, 'dEmail', { appels: [], echecEnvoi: true });
  await ouvrirEditeur(page, 'dEmail');
  await page.locator('[data-action="passer-envoye"]').click();
  await expect(page.locator('#toasts')).toContainText('Devis passé à « Envoyé »');
  await expect(page.locator('#toasts')).toContainText('Statut posé ; l’historique des envois n’a pas pu être écrit.');
  await expect.poll(() => serveur.appels.map((a) => a[0])).toEqual(['devisChangerStatut', 'devisEnregistrerEnvoi']);
  const doc = await lireDocument('devis_devis/dEmail');
  expect([doc.statut, doc.envois ?? []]).toEqual(['envoye', []]);
  await page.evaluate(() => { location.hash = '#/devis/voir/dEmail'; });
  await ouvrirHistorique(page);
  await expect(fiche(page).locator('[data-bloc="envois"] [data-envoi]')).toHaveCount(1);
  await expect(fiche(page).locator('[data-bloc="envois"] [data-envoi]')).not.toContainText('à marie@exemple.fr');
});
