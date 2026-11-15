// Module Rendez-vous, PR 4 : l'écran demande au SERVEUR de faire partir les SMS. Les fonctions du serveur (rdvEtat, rdvEnvoyer) sont simulées dans le navigateur : aucun appel réel,
// aucun SMS, ni n8n ni ClickSend. On vérifie ce que l'écran envoie (action, identifiants, texte) et ce qu'il montre selon la réponse. Captures dans tests/e2e/captures/rdv-envoi/.
import { test, expect, connecter, allerA, listerDocuments, ecrireDocument, estTelephone } from './outils.js';

const CAPTURES = 'e2e/captures/rdv-envoi';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };

/** Simule rdvEtat et rdvEnvoyer. `reponseEnvoi(demande)` rend { result } ou { erreur: { status, message } }. Rend la liste des demandes reçues. */
async function simulerServeur(page, { branche = true, reponseEnvoi = () => ({ result: { ok: true, declenche: true } }) } = {}) {
  const demandes = [];
  await page.route(/cloudfunctions\.net\/rdvEtat$/, (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ result: { branche } }) });
  });
  await page.route(/cloudfunctions\.net\/rdvEnvoyer$/, (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const demande = JSON.parse(route.request().postData() ?? '{}').data;
    demandes.push(demande);
    const r = reponseEnvoi(demande);
    if (r.erreur) return route.fulfill({ status: 400, headers: CORS, contentType: 'application/json', body: JSON.stringify({ error: { status: r.erreur.status, message: r.erreur.message } }) });
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(r) });
  });
  return demandes;
}
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});

const CRENEAUX = ['2031-02-18T09:00:00.000Z', '2031-02-19T13:00:00.000Z'];
async function semer(extra = {}) {
  await ecrireDocument('rdv_rendezvous/r1', { client: 'M. Durand', objet: '', adresse: '12 rue des Lilas', commune: 'Lyon', creneaux: CRENEAUX, etat: 'en_attente', creneauChoisi: null, archive: false, tour: 1, relancesFaites: 0, envoiDemandeLe: null, confirmeLe: null, annule: false, ...extra });
  await ecrireDocument('rdv_participants/p1', { rendezVousId: 'r1', personneId: null, nom: 'M. Durand', role: 'Client', telephone: '+33600000001', reponse: '', etatReponse: 'attente', creneauxOk: [] });
}
const ouvrirFiche = async (page) => { await connecter(page); await allerA(page, 'Rendez-vous'); await page.locator('.carte-rdv').first().click(); await expect(page).toHaveURL(/#\/rdv\/liste\/r1$/); };

test('création : « Envoyer les propositions » est actif quand le serveur dit que c’est branché ; un clic enregistre puis demande l’envoi (identifiant seulement)', async ({ page }) => {
  const demandes = await simulerServeur(page, { branche: true });
  await connecter(page);
  await allerA(page, 'Rendez-vous');
  await page.getByRole('button', { name: 'Rendez-vous', exact: true }).click();
  const envoyer = page.getByRole('button', { name: 'Envoyer les propositions' });
  await expect(envoyer).toBeEnabled();
  await expect(envoyer).toHaveClass(/bouton-principal/);
  await expect(page.locator('[data-role="envoi-non-branche"]')).toBeHidden();
  const ligne = page.locator('[data-role="participant"]').first();
  await ligne.getByPlaceholder('Nom (contact existant ou nouveau)').fill('Mme Neuve');
  await ligne.getByLabel('Téléphone mobile').fill('06 00 00 00 09');
  await page.getByLabel('Créneau 1').fill('2031-03-17T10:00');
  await capture(page, 'creation-envoyer-actif');
  await envoyer.click();
  await expect(page).toHaveURL(/#\/rdv\/liste\/.+/);
  const [rdv] = await listerDocuments('rdv_rendezvous');
  expect(demandes).toEqual([{ action: 'propositions', rendezVousId: rdv.id }]);
  await expect(page.locator('.toast')).toContainText('Propositions envoyées');
});

test('création : si le serveur refuse l’envoi, le rendez-vous est quand même enregistré et le message du serveur est montré (rien n’est perdu)', { annotation: { type: 'erreurs-reseau-attendues', description: 'Le serveur simulé répond 400 : le navigateur le note dans sa console, ce n’est pas une erreur de l’appli.' } }, async ({ page }) => {
  const demandes = await simulerServeur(page, { branche: true, reponseEnvoi: () => ({ erreur: { status: 'FAILED_PRECONDITION', message: 'Ce créneau est déjà passé.' } }) });
  await connecter(page);
  await allerA(page, 'Rendez-vous');
  await page.getByRole('button', { name: 'Rendez-vous', exact: true }).click();
  const ligne = page.locator('[data-role="participant"]').first();
  await ligne.getByPlaceholder('Nom (contact existant ou nouveau)').fill('Mme Neuve');
  await ligne.getByLabel('Téléphone mobile').fill('06 00 00 00 09');
  await page.getByLabel('Créneau 1').fill('2031-03-17T10:00');
  await page.getByRole('button', { name: 'Envoyer les propositions' }).click();
  await expect(page).toHaveURL(/#\/rdv\/liste\/.+/);
  await expect(page.locator('.toast-erreur')).toContainText('Rendez-vous enregistré, mais l’envoi n’a pas pu partir : Ce créneau est déjà passé.');
  expect(await listerDocuments('rdv_rendezvous')).toHaveLength(1);
  expect(demandes).toHaveLength(1);
});

test('création : serveur injoignable ou pas branché : « Envoyer » reste grisé avec sa phrase, « Enregistrer sans envoyer » marche', async ({ page }) => {
  await simulerServeur(page, { branche: false });
  await connecter(page);
  await allerA(page, 'Rendez-vous');
  await page.getByRole('button', { name: 'Rendez-vous', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Envoyer les propositions' })).toBeDisabled();
  await expect(page.locator('[data-role="envoi-non-branche"]')).toBeVisible();
  await capture(page, 'creation-envoyer-grise');
});

test('fiche : un rendez-vous pas encore envoyé propose « Envoyer les propositions » (le seul bouton jaune, pas de « Confirmer ») ; un clic demande l’envoi', async ({ page }) => {
  const demandes = await simulerServeur(page, { branche: true });
  await semer();
  await ouvrirFiche(page);
  const envoyer = page.locator('[data-action="envoyer-propositions"]');
  await expect(envoyer).toBeEnabled();
  await expect(page.locator('[data-action="confirmer-creneau"]')).toHaveCount(0);
  await expect(page.locator('.rdv-boutons-fiche .bouton-principal')).toHaveCount(1);
  await capture(page, 'fiche-non-envoye');
  await envoyer.click();
  await expect.poll(() => demandes.length).toBe(1);
  expect(demandes[0]).toEqual({ action: 'propositions', rendezVousId: 'r1' });
});

test('fiche : pas branché, le bouton est grisé avec sa phrase', async ({ page }) => {
  await simulerServeur(page, { branche: false });
  await semer();
  await ouvrirFiche(page);
  await expect(page.locator('[data-action="envoyer-propositions"]')).toBeDisabled();
  await expect(page.locator('[data-role="envoi-non-branche"]')).toBeVisible();
});

test('pluie : « Envoyer » est actif quand c’est branché ; il envoie le texte MODIFIÉ à tous, puis la fenêtre se ferme', async ({ page }) => {
  const demandes = await simulerServeur(page, { branche: true, reponseEnvoi: () => ({ result: { ok: true, nombre: 1, declenche: true, caracteres: 26, segments: 1 } }) });
  await semer({ etat: 'confirme', creneauChoisi: CRENEAUX[0], confirmeLe: '2031-01-01T09:00:00.000Z', envoiDemandeLe: '2031-01-01T08:00:00.000Z' });
  await ouvrirFiche(page);
  await page.getByRole('button', { name: 'Prévenir de la pluie' }).click();
  const dialogue = page.getByRole('dialog');
  await expect(dialogue.getByRole('button', { name: 'Envoyer' })).toBeEnabled();
  await expect(dialogue.locator('[data-role="envoi-non-branche"]')).toBeHidden();
  await dialogue.getByLabel('Texte du SMS').fill('Pluie demain, RDV reporté.');
  await capture(page, 'pluie-envoyer-actif');
  await dialogue.getByRole('button', { name: 'Envoyer' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(demandes).toEqual([{ action: 'sms', rendezVousId: 'r1', type: 'pluie', texte: 'Pluie demain, RDV reporté.' }]);
  await expect(page.locator('.toast')).toContainText('SMS en cours d’envoi');
});

test('pluie : le serveur refuse (texte invalide) : la fenêtre reste ouverte avec le message, rien ne part', { annotation: { type: 'erreurs-reseau-attendues', description: 'Le serveur simulé répond 400 : le navigateur le note dans sa console, ce n’est pas une erreur de l’appli.' } }, async ({ page }) => {
  await simulerServeur(page, { branche: true, reponseEnvoi: () => ({ erreur: { status: 'INVALID_ARGUMENT', message: 'Ce SMS est trop long (3 SMS au plus).' } }) });
  await semer({ etat: 'confirme', creneauChoisi: CRENEAUX[0], confirmeLe: '2031-01-01T09:00:00.000Z', envoiDemandeLe: '2031-01-01T08:00:00.000Z' });
  await ouvrirFiche(page);
  await page.getByRole('button', { name: 'Prévenir de la pluie' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Envoyer' }).click();
  await expect(page.getByRole('dialog').locator('.erreur')).toContainText('Ce SMS est trop long (3 SMS au plus).');
  await expect(page.getByRole('dialog')).toBeVisible();
});

test('annulation avec SMS : le serveur est appelé avec le type « annulation » et la fiche renvoie vers les Archives', async ({ page }) => {
  const demandes = await simulerServeur(page, { branche: true });
  await semer({ envoiDemandeLe: '2031-01-01T08:00:00.000Z' });
  await ouvrirFiche(page);
  await page.getByRole('button', { name: 'Annuler le rendez-vous' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Envoyer' }).click();
  await expect(page).toHaveURL(/#\/rdv\/archives$/);
  expect(demandes).toHaveLength(1);
  expect(demandes[0]).toMatchObject({ action: 'sms', rendezVousId: 'r1', type: 'annulation' });
});

test('D2-3b pluie quand un participant est désinscrit : la phrase dit qu’une personne n’a rien reçu', async ({ page }) => {
  await simulerServeur(page, { branche: true, reponseEnvoi: () => ({ result: { ok: true, nombre: 1, nombreBloques: 1, declenche: true, caracteres: 26, segments: 1 } }) });
  await semer({ etat: 'confirme', creneauChoisi: CRENEAUX[0], confirmeLe: '2031-01-01T09:00:00.000Z', envoiDemandeLe: '2031-01-01T08:00:00.000Z' });
  await ouvrirFiche(page);
  await page.getByRole('button', { name: 'Prévenir de la pluie' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Envoyer' }).click();
  await expect(page.locator('.toast')).toContainText('1 personne désinscrite (STOP) n’a rien reçu');
  await capture(page, 'D2-3b-pluie-un-bloque');
});

test('D2-3b annulation quand tous sont désinscrits : « Aucun SMS n’est parti », le rendez-vous est annulé quand même (retour aux Archives)', async ({ page }) => {
  await simulerServeur(page, { branche: true, reponseEnvoi: () => ({ result: { ok: true, nombre: 0, nombreBloques: 1, declenche: false, caracteres: 30, segments: 1 } }) });
  await semer({ envoiDemandeLe: '2031-01-01T08:00:00.000Z' });
  await ouvrirFiche(page);
  await page.getByRole('button', { name: 'Annuler le rendez-vous' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Envoyer' }).click();
  await expect(page).toHaveURL(/#\/rdv\/archives$/);
  await expect(page.locator('.toast')).toContainText('Rendez-vous annulé. Aucun SMS n’est parti');
});

test('D2-3c « Envoyer les propositions » avec un désinscrit : le message dit « 1 personne désinscrite (STOP) n’a rien reçu »', async ({ page }) => {
  await simulerServeur(page, { branche: true });
  await semer();
  await ecrireDocument('rdv_participants/p2', { rendezVousId: 'r1', personneId: null, nom: 'Terrassier', role: 'Terrassier', telephone: '+33600000002', reponse: 'STOP', etatReponse: 'incomprise', creneauxOk: [], desinscrit: true });
  await ecrireDocument('rdv_parametres/desinscrits', { numeros: ['+33600000002'] });
  await ouvrirFiche(page);
  await page.locator('[data-action="envoyer-propositions"]').click();
  await expect(page.locator('.toast')).toContainText('Propositions envoyées. 1 personne désinscrite (STOP) n’a rien reçu.');
  await capture(page, 'D2-3c-propositions-un-bloque');
});
