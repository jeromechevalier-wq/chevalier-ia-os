// Envoyer un devis par e-mail : dialogue (À, Cc, Objet, Message) puis BROUILLON dans le Gmail de l'utilisateur, PDF en pièce jointe ; « Marquer comme envoyé » ; historique des envois de la fiche.
// Google est SIMULÉ (google-simule.js : jeton, Gmail users/me/drafts) et le stockage du PDF aussi (page.route) ; les fonctions du serveur (devisChangerStatut, devisEnregistrerEnvoi) sont simulées
// par page.route et écrivent dans l'émulateur comme le feraient les vraies. On vérifie ce que l'appli demande à Google et ce qu'elle affiche, pas Google lui-même.
// Un test par critère (le nom commence par le numéro du critère, voir la PR). Captures dans tests/e2e/captures/devis-email/ (ordinateur ET téléphone : le dialogue passe en plein écran).
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, lireDocument, creerPersonne, creerAffaire, estTelephone, JEROME } from './outils.js';
import { brancherGoogle, refuserAutorisation, lireGoogle, lireMime } from './google-simule.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-email/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' };
const URL_PDF = 'https://stockage.exemple.test/devis-essai.pdf';
const NUMERO = 'DEV-2026-10-25-001';
const NOM_PDF = `Devis ${NUMERO} v1 – Rénovation restaurant.pdf`;
const boite = (page) => page.locator('.dialogue-email-devis');
const champ = (page, nom) => boite(page).locator(`[data-champ="email-${nom}"]`);
const erreur = (page, nom) => boite(page).locator(`[data-erreur="email-${nom}"]`);
const creer = (page) => boite(page).locator('[data-action="creer-brouillon-gmail"], [data-action="reessayer-gmail"]');
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
/** Faux serveur : lien signé, stockage du PDF, et les deux fonctions de l'envoi (elles écrivent dans l'émulateur). `etat.appels` garde l'ordre des appels. */
async function simulerServeur(page, id, etat = { appels: [] }) {
  await page.route('**/devisPdfLien', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { url: URL_PDF, expireDans: 300, nom: 'Devis.pdf' } }) });
  });
  await page.context().route('https://stockage.exemple.test/**', (route) => route.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'application/pdf' }, body: '%PDF-1.4 faux' }));
  const repondre = (nom, travail) => page.route(`**/${nom}`, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const data = JSON.parse(route.request().postData()).data;
    etat.appels.push([nom, data]);
    const actuel = await lireDocument(`devis_devis/${id}`);
    await ecrireDocument(`devis_devis/${id}`, travail(actuel, data));
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ok: true, devisId: id, statut: 'envoye' } }) });
  });
  await repondre('devisChangerStatut', (d) => ({ ...d, statut: 'envoye', envoyeLe: new Date() }));
  await repondre('devisEnregistrerEnvoi', (d, data) => ({ ...d, envois: [...(d.envois || []), { date: new Date(), destinataires: data.destinataires, copie: data.copie || [] }] }));
  return etat;
}
async function ouvrirEditeur(page, id) {
  await connecter(page, undefined, { route: `devis/editeur/${id}` });
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
}
async function ouvrirDialogue(page) {
  // Devis finalisé : le bouton jaune « Envoyer » ouvre le menu. Brouillon : « Envoyer » est grisé (aria-disabled) ; devis envoyé : plus de bouton « Envoyer » ;
  // dans les deux cas l'e-mail est dans le menu « … » (« Envoyer par e-mail » pour un brouillon, « Envoyer à nouveau » ensuite).
  const envoyer = page.locator('[data-action="envoyer"]:visible').first();
  if ((await envoyer.count()) > 0 && (await envoyer.getAttribute('aria-disabled')) !== 'true') {
    await envoyer.click();
    await page.locator('.menu-pop').getByRole('menuitem', { name: 'Envoyer par e-mail' }).click();
  } else {
    await page.locator('[data-action="plus-actions"]').click();
    await page.locator('.menu-pop').getByRole('menuitem', { name: /^Envoyer (par e-mail|à nouveau)$/ }).click();
  }
}

test('1 le dialogue « Envoyer le devis par e-mail » est prérempli : À et Cc du devis, objet et message par défaut au nom du contact ; Échap le ferme', async ({ page, context }, info) => {
  await brancherGoogle(context);
  await semer('dEmail');
  await simulerServeur(page, 'dEmail');
  await ouvrirEditeur(page, 'dEmail');
  await ouvrirDialogue(page);
  await expect(boite(page).getByRole('heading', { name: 'Envoyer le devis par e-mail' })).toBeVisible();
  await expect(champ(page, 'a')).toHaveValue('marie@exemple.fr');
  await expect(champ(page, 'cc')).toHaveValue('compta@exemple.fr');
  await expect(champ(page, 'objet')).toHaveValue(`Devis ${NUMERO} – Rénovation restaurant`);
  const message = await champ(page, 'message').inputValue();
  expect(message).toMatch(/^Bonjour Marie Durand,\n\nVeuillez trouver ci-joint notre devis DEV-2026-10-25-001 – Rénovation restaurant\.\n\nIl reste valable pour la durée indiquée sur le document\. N’hésitez pas à me contacter pour toute question ou pour l’adapter\.\n\nBien cordialement$/);
  await expect(creer(page)).toHaveText('Créer le brouillon Gmail');
  if (estTelephone(page)) {
    for (const bouton of await boite(page).locator('.dialogue-pied .bouton').all()) expect((await bouton.boundingBox()).height).toBeGreaterThanOrEqual(44);
  }
  await capturer(page, info, '1-dialogue');
  await page.keyboard.press('Escape');
  await expect(boite(page)).toHaveCount(0);
});

test('2 « Créer le brouillon Gmail » crée le brouillon avec le PDF en pièce jointe (portée gmail.compose) et dit « Brouillon créé dans Gmail » ; rien n’est envoyé', async ({ page, context }, info) => {
  const google = await brancherGoogle(context);
  await semer('dEmail');
  const serveur = await simulerServeur(page, 'dEmail');
  await ouvrirEditeur(page, 'dEmail');
  await ouvrirDialogue(page);
  await champ(page, 'cc').fill('compta@exemple.fr, direction@exemple.fr');
  await creer(page).click();
  await expect(boite(page).locator('[data-valeur="message-brouillon"]')).toHaveText('Brouillon créé dans Gmail');
  await expect(page.locator('#toasts')).toContainText('Brouillon créé dans Gmail');
  expect(google.brouillons).toHaveLength(1);
  expect(google.brouillons[0].autorisation).toBe('Bearer ya29.SIMULE');
  const demandes = (await lireGoogle(page)).autorisations;
  expect(demandes.map((a) => a.scope)).toEqual(['https://www.googleapis.com/auth/gmail.compose']);
  expect(demandes[0].indice).toBe(JEROME);
  const mime = lireMime(google.brouillons[0]);
  expect(mime).toMatch(/\r\nTo: marie@exemple\.fr\r\nCc: compta@exemple\.fr, direction@exemple\.fr\r\nSubject: =\?UTF-8\?B\?/);
  expect(mime).toContain(`filename*=UTF-8''${encodeURIComponent(NOM_PDF)}`);
  expect(Buffer.from(/filename\*=[^\r]*\r\nContent-Transfer-Encoding: base64\r\n\r\n([\s\S]*?)\r\n--/.exec(mime)[1].replace(/\r\n/g, ''), 'base64').toString()).toBe('%PDF-1.4 faux');
  await expect(boite(page).locator('[data-action="ouvrir-brouillon-gmail"]')).toHaveAttribute('href', /^https:\/\/mail\.google\.com\/mail\/.*#drafts\?compose=MSG_1_abc$/);
  await expect(creer(page)).toHaveCount(0);
  await expect(boite(page).locator('[data-action="marquer-envoye-email"]')).toHaveText('Marquer comme envoyé');
  expect(serveur.appels, 'créer le brouillon ne change pas le statut').toEqual([]);
  expect((await lireDocument('devis_devis/dEmail')).statut).toBe('en_attente_envoi');
  await capturer(page, info, '2-brouillon-cree');
});

test('3 un devis encore brouillon : « Finaliser d’abord » (rien n’est demandé à Google) ; le bouton ouvre la finalisation', async ({ page, context }, info) => {
  const google = await brancherGoogle(context);
  await semer('dBrouillon', { statut: 'brouillon', numero: null, finaliseLe: null, pdf: null });
  await simulerServeur(page, 'dBrouillon');
  await ouvrirEditeur(page, 'dBrouillon');
  await ouvrirDialogue(page);
  const dlg = page.locator('.dialogue').filter({ hasText: 'Finaliser d’abord' });
  await expect(dlg).toBeVisible();
  await expect(dlg.locator('[data-valeur="finaliser-d-abord"]')).toContainText('encore un brouillon');
  await expect(boite(page)).toHaveCount(0);
  await capturer(page, info, '3-finaliser-d-abord');
  await dlg.getByRole('button', { name: 'Finaliser d’abord' }).click();
  await expect(page.locator('.dialogue').filter({ hasText: /Finaliser ce devis|ne peut pas encore être finalisé/ })).toBeVisible();
  expect(google.brouillons).toHaveLength(0);
  expect((await lireGoogle(page)).autorisations).toHaveLength(0);
});

test('3 PDF en échec : message clair et « Réessayer » ; aucun dialogue d’envoi tant que le PDF n’est pas prêt', async ({ page, context }) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'le faux serveur répond comme le vrai' });
  await brancherGoogle(context);
  await semer('dPdf', { pdf: { statut: 'echec', message: 'Chromium absent', tentatives: 3 } });
  await simulerServeur(page, 'dPdf');
  let relances = 0;
  await page.route('**/devisPdf', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    relances += 1;
    await ecrireDocument('devis_devis/dPdf', { ...(await lireDocument('devis_devis/dPdf')), pdf: { statut: 'ok', chemin: 'devis/a1/d.pdf', nom: 'Devis.pdf', tentatives: 1 } });
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { statut: 'ok' } }) });
  });
  await ouvrirEditeur(page, 'dPdf');
  await ouvrirDialogue(page);
  const dlg = page.locator('.dialogue').filter({ hasText: 'Le PDF n’est pas prêt' });
  await expect(dlg.locator('[data-valeur="pdf-pas-pret"]')).toContainText('La fabrication du PDF a échoué');
  await expect(boite(page)).toHaveCount(0);
  await dlg.getByRole('button', { name: 'Réessayer' }).click();
  await expect(boite(page)).toBeVisible(); // le PDF est refait, l'envoi reprend tout seul
  expect(relances).toBe(1);
});

test('4 sans destinataire : l’adresse est demandée dans le dialogue (validation), rien n’est demandé à Google tant qu’elle manque ou est invalide', async ({ page, context }, info) => {
  const google = await brancherGoogle(context);
  await semer('dSans', { destinataires: [], copie: [] });
  await simulerServeur(page, 'dSans');
  await ouvrirEditeur(page, 'dSans');
  await ouvrirDialogue(page);
  await expect(champ(page, 'a')).toHaveValue('');
  await creer(page).click();
  await expect(erreur(page, 'a')).toHaveText('Écris l’adresse e-mail du destinataire.');
  await capturer(page, info, '4-sans-destinataire');
  await champ(page, 'a').fill('pas-une-adresse');
  await creer(page).click();
  await expect(erreur(page, 'a')).toContainText('n’est pas valide');
  expect(google.brouillons).toHaveLength(0);
  expect((await lireGoogle(page)).autorisations).toHaveLength(0);
  await champ(page, 'a').fill('nouveau@exemple.fr');
  await creer(page).click();
  await expect(boite(page).locator('[data-valeur="message-brouillon"]')).toBeVisible();
  expect(lireMime(google.brouillons[0])).toContain('To: nouveau@exemple.fr');
});

test('5 autorisation Google refusée : message clair et « Réessayer » ; l’API Gmail non activée et le réseau coupé aussi ; jamais d’échec silencieux', async ({ page, context }, info) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'le faux Gmail répond 403 / coupe le réseau' });
  const google = await brancherGoogle(context);
  await semer('dEmail');
  await simulerServeur(page, 'dEmail');
  await ouvrirEditeur(page, 'dEmail');
  await ouvrirDialogue(page);
  const message = boite(page).locator('[data-zone="erreur-email"]');
  // 1. refus dans la fenêtre Google
  await refuserAutorisation(page, true);
  await creer(page).click();
  await expect(message).toContainText('Gmail n’est pas connecté ou l’autorisation a été refusée');
  await expect(creer(page)).toHaveText('Réessayer');
  expect(google.brouillons).toHaveLength(0);
  await capturer(page, info, '5-refus-google');
  // 2. autorisation accordée mais l'API Gmail n'est pas activée dans le projet Google
  await refuserAutorisation(page, false);
  google.echecBrouillon = 403;
  google.corpsEchecBrouillon = { error: { status: 'PERMISSION_DENIED', message: 'Gmail API has not been used in project 1 before or it is disabled.', errors: [{ reason: 'accessNotConfigured' }] } };
  await creer(page).click();
  await expect(message).toContainText('L’API Gmail n’est pas activée');
  await expect(creer(page)).toHaveText('Réessayer');
  // 3. réseau coupé
  google.echecBrouillon = 0;
  google.reseauCoupeBrouillon = true;
  await creer(page).click();
  await expect(message).toContainText('Impossible de joindre Gmail');
  // 4. tout rentre dans l'ordre : « Réessayer » crée le brouillon
  google.reseauCoupeBrouillon = false;
  await creer(page).click();
  await expect(boite(page).locator('[data-valeur="message-brouillon"]')).toHaveText('Brouillon créé dans Gmail');
  expect(google.brouillons).toHaveLength(1);
});

test('6 « Marquer comme envoyé » : le statut passe à Envoyé (devisChangerStatut) puis l’envoi est noté (devisEnregistrerEnvoi), et l’historique le montre', async ({ page, context }, info) => {
  const google = await brancherGoogle(context);
  await semer('dEmail');
  const serveur = await simulerServeur(page, 'dEmail');
  await ouvrirEditeur(page, 'dEmail');
  await ouvrirDialogue(page);
  await creer(page).click();
  await boite(page).locator('[data-action="marquer-envoye-email"]').click();
  await expect(page.locator('#toasts')).toContainText('Devis marqué comme envoyé');
  await expect(boite(page)).toHaveCount(0);
  expect(serveur.appels).toEqual([
    ['devisChangerStatut', { devisId: 'dEmail', action: 'marquer_envoye' }],
    ['devisEnregistrerEnvoi', { devisId: 'dEmail', destinataires: ['marie@exemple.fr'], copie: ['compta@exemple.fr'] }],
  ]);
  expect(google.brouillons).toHaveLength(1);
  const doc = await lireDocument('devis_devis/dEmail');
  expect([doc.statut, doc.envois.length]).toEqual(['envoye', 1]);
  await page.evaluate(() => { location.hash = '#/devis/voir/dEmail'; });
  await ouvrirHistorique(page);
  await expect(fiche(page).locator('[data-bloc="envois"] [data-envoi]')).toHaveCount(1);
  await expect(fiche(page).locator('[data-bloc="envois"]')).toContainText('à marie@exemple.fr, en copie : compta@exemple.fr');
  await capturer(page, info, '6-historique-un-envoi');
});

test('6 renvoi d’un devis déjà envoyé : on garde les DEUX dates dans le panneau Historique ; seul l’historique est écrit (le statut ne change pas)', async ({ page, context }, info) => {
  await brancherGoogle(context);
  const premier = new Date(Date.now() - 5 * 86400000);
  await semer('dEmail', { statut: 'envoye', envoyeLe: premier, envois: [{ date: premier, destinataires: ['marie@exemple.fr'], copie: [] }] });
  const serveur = await simulerServeur(page, 'dEmail');
  await ouvrirEditeur(page, 'dEmail');
  await ouvrirDialogue(page);
  await champ(page, 'a').fill('marie@exemple.fr, paul@exemple.fr');
  await creer(page).click();
  await boite(page).locator('[data-action="marquer-envoye-email"]').click();
  await expect(page.locator('#toasts')).toContainText('Devis marqué comme envoyé');
  expect(serveur.appels.map((a) => a[0])).toEqual(['devisEnregistrerEnvoi']);
  const doc = await lireDocument('devis_devis/dEmail');
  expect(doc.envois).toHaveLength(2);
  expect(doc.envoyeLe.getTime()).toBe(premier.getTime()); // envoyeLe garde la date du premier envoi
  await page.evaluate(() => { location.hash = '#/devis/voir/dEmail'; });
  await ouvrirHistorique(page);
  const lignes = fiche(page).locator('[data-bloc="envois"] [data-envoi]');
  await expect(lignes).toHaveCount(2);
  await expect(lignes.nth(0)).toContainText('à marie@exemple.fr');
  await expect(lignes.nth(1)).toContainText('à marie@exemple.fr, paul@exemple.fr');
  const dates = (await lignes.allTextContents()).map((t) => /Envoyé le (\d{2}\/\d{2}\/\d{4})/.exec(t)[1]);
  expect(new Set(dates).size, 'deux dates différentes').toBe(2);
  await capturer(page, info, '6-historique-deux-envois');
});

test('6 cas vide de l’historique : un devis finalisé jamais envoyé dit « Pas encore envoyé » ; un brouillon dit qu’il n’a pas pu être envoyé ; « Envoyer par e-mail » du bouton Envoyer ouvre le dialogue', async ({ page, context }, info) => {
  await brancherGoogle(context);
  await semer('dEmail');
  await semer('dBrouillon', { statut: 'brouillon', numero: null, pdf: null });
  await simulerServeur(page, 'dEmail');
  await connecter(page, undefined, { route: 'devis/voir/dEmail' });
  await ouvrirHistorique(page);
  await attendreCalme(page);
  await expect(fiche(page).locator('[data-bloc="envois"] [data-valeur="aucun-envoi"]')).toHaveText('Pas encore envoyé');
  await capturer(page, info, '6-historique-jamais-envoye');
  await page.keyboard.press('Escape');
  await page.locator('[data-action="envoyer"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Envoyer par e-mail' }).click();
  await expect(boite(page)).toBeVisible();
  await expect(champ(page, 'a')).toHaveValue('marie@exemple.fr');
  await page.keyboard.press('Escape');
  await page.evaluate(() => { location.hash = '#/devis/voir/dBrouillon'; });
  await ouvrirHistorique(page);
  await expect(fiche(page).locator('[data-bloc="envois"] [data-valeur="aucun-envoi"]')).toContainText('n’a pas encore pu être envoyé');
  await expect(fiche(page).locator('[data-bloc="envois"] [data-envoi]')).toHaveCount(0);
});

test('3 PDF « en cours de fabrication » : message clair, « Réessayer » ne relance pas la fabrication, aucun dialogue d’envoi', async ({ page, context }) => {
  await brancherGoogle(context);
  await semer('dCours', { pdf: { statut: 'en_cours', demarreLe: new Date(), tentatives: 1 } });
  await simulerServeur(page, 'dCours');
  await ouvrirEditeur(page, 'dCours');
  await ouvrirDialogue(page);
  const dlg = page.locator('.dialogue').filter({ hasText: 'Le PDF n’est pas prêt' });
  await expect(dlg.locator('[data-valeur="pdf-pas-pret"]')).toContainText('en cours de fabrication');
  await expect(boite(page)).toHaveCount(0);
});

test('1 pendant la création du brouillon (occupé), Échap, la croix et le clic sur le voile ne ferment pas la boîte ; ils la ferment une fois le travail fini', async ({ page, context }) => {
  const google = await brancherGoogle(context);
  await semer('dEmail');
  await simulerServeur(page, 'dEmail');
  let liberer;
  const attente = new Promise((r) => { liberer = r; });
  await page.context().route('https://gmail.googleapis.com/gmail/v1/users/me/drafts', async (route) => {
    if (route.request().method() === 'POST') await attente; // le faux Gmail ne répond qu'après nos essais de fermeture
    await route.fallback();
  });
  await ouvrirEditeur(page, 'dEmail');
  await ouvrirDialogue(page);
  await creer(page).click();
  await expect(boite(page).locator('[data-zone="etat-email"]')).toBeVisible();
  await page.keyboard.press('Escape');
  await boite(page).getByRole('button', { name: 'Fermer' }).first().click({ force: true });
  await page.mouse.click(2, 2);
  await expect(boite(page)).toBeVisible();
  liberer();
  await expect(boite(page).locator('[data-valeur="message-brouillon"]')).toBeVisible();
  expect(google.brouillons).toHaveLength(1);
  await page.keyboard.press('Escape');
  await expect(boite(page)).toHaveCount(0);
});

test('6 « Réessayer » après un échec de devisEnregistrerEnvoi ne rappelle pas devisChangerStatut (le statut est déjà posé)', async ({ page, context }) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'le faux serveur répond 500 une fois' });
  await brancherGoogle(context);
  await semer('dEmail');
  const serveur = await simulerServeur(page, 'dEmail');
  let echec = true;
  await page.route('**/devisEnregistrerEnvoi', async (route) => {
    if (route.request().method() === 'POST' && echec) {
      echec = false;
      serveur.appels.push(['devisEnregistrerEnvoi', 'échec']);
      return route.fulfill({ status: 500, headers: cors, body: JSON.stringify({ error: { message: 'panne', status: 'INTERNAL' } }) });
    }
    return route.fallback();
  });
  await ouvrirEditeur(page, 'dEmail');
  await ouvrirDialogue(page);
  await creer(page).click();
  await boite(page).locator('[data-action="marquer-envoye-email"]').click();
  await expect(boite(page).locator('[data-action="reessayer-marquer-envoye"]')).toHaveText('Réessayer');
  await boite(page).locator('[data-action="reessayer-marquer-envoye"]').click();
  await expect(page.locator('#toasts')).toContainText('Devis marqué comme envoyé');
  expect(serveur.appels.map((a) => a[0])).toEqual(['devisChangerStatut', 'devisEnregistrerEnvoi', 'devisEnregistrerEnvoi']);
  expect((await lireDocument('devis_devis/dEmail')).envois).toHaveLength(1);
});
