// Module Rendez-vous, brief C (15/11/2026) : « Modifier le rendez-vous » (C1) et « Renvoyer le SMS » (C2) sur la fiche. Les fonctions du serveur sont simulées dans le navigateur (aucun SMS, aucun appel réel).
// Un test par point, nom commençant par C1 ou C2, une capture chacun dans tests/e2e/captures/rdv-modifier/ (jamais committée). Données fictives, dates fixes en hiver (Paris = UTC+1).
import { test, expect, connecter, allerA, listerDocuments, lireDocument, ecrireDocument, estTelephone } from './outils.js';

const CAPTURES = 'e2e/captures/rdv-modifier';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
const CRENEAUX = ['2031-02-18T09:00:00.000Z', '2031-02-19T13:00:00.000Z'];

async function simulerServeur(page, { reponseEnvoi = () => ({ result: { ok: true, declenche: true } }) } = {}) {
  const demandes = [];
  await page.route(/cloudfunctions\.net\/rdvEtat$/, (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ result: { branche: true } }) });
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

async function semer(extra = {}) {
  await ecrireDocument('rdv_rendezvous/r1', { client: 'M. Durand', objet: 'Visite avant terrassement', adresse: '12 rue des Lilas\n69000 Lyon', commune: 'Lyon', creneaux: CRENEAUX, etat: 'en_attente', creneauChoisi: null, archive: false, tour: 1, relancesFaites: 0, envoiDemandeLe: null, confirmeLe: null, annule: false, ...extra });
  await ecrireDocument('rdv_participants/p1', { rendezVousId: 'r1', personneId: null, nom: 'M. Durand', role: 'Client', telephone: '+33600000001', reponse: '', etatReponse: 'attente', creneauxOk: [] });
  await ecrireDocument('rdv_participants/p2', { rendezVousId: 'r1', personneId: null, nom: 'Terrassier', role: 'Terrassier', telephone: '+33600000002', reponse: '', etatReponse: 'attente', creneauxOk: [] });
}
const ouvrirFiche = async (page) => { await connecter(page); await allerA(page, 'Rendez-vous'); await page.locator('.carte-rdv').first().click(); await expect(page).toHaveURL(/#\/rdv\/liste\/r1$/); };
const ouvrirMenu = async (page) => page.getByRole('button', { name: 'Actions du rendez-vous' }).click();

test('C1 avant le premier envoi, « Modifier le rendez-vous » change l’objet, l’adresse, les participants (ajout, retrait, numéro) et les créneaux', async ({ page }) => {
  await semer();
  await ouvrirFiche(page);
  await ouvrirMenu(page);
  await page.getByRole('menuitem', { name: 'Modifier le rendez-vous' }).click();
  const fenetre = page.getByRole('dialog');
  await expect(fenetre.getByLabel('Créneau 1')).toHaveValue('2031-02-18T10:00');
  await fenetre.getByLabel('Objet de la visite').fill('Visite du terrain');
  await fenetre.getByLabel('Adresse du rendez-vous').fill('3 impasse du Four\n38000 Grenoble');
  await fenetre.locator('[data-role="participant"]').nth(1).getByLabel('Retirer ce participant').click();
  await fenetre.getByRole('button', { name: 'Ajouter une personne' }).click();
  const nouvelle = fenetre.locator('[data-role="participant"]').nth(1);
  await nouvelle.getByLabel('Nom', { exact: true }).fill('Mme Neuve');
  await nouvelle.getByLabel('Téléphone mobile').fill('06 00 00 00 09');
  await fenetre.locator('[data-role="participant"]').nth(0).getByLabel('Téléphone mobile').fill('06 00 00 00 05');
  await fenetre.getByLabel('Créneau 2').fill('2031-03-04T14:30');
  await capture(page, 'C1-fenetre');
  await fenetre.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect.poll(async () => (await lireDocument('rdv_rendezvous/r1'))?.objet).toBe('Visite du terrain');
  const r = await lireDocument('rdv_rendezvous/r1');
  expect(r.commune).toBe('Grenoble');
  expect(r.creneaux).toHaveLength(2);
  expect(r.creneaux[1]).toBe('2031-03-04T13:30:00.000Z');
  const parts = (await listerDocuments('rdv_participants')).filter((p) => p.rendezVousId === 'r1');
  expect(parts.map((p) => p.nom).sort()).toEqual(['M. Durand', 'Mme Neuve']);
  expect(parts.find((p) => p.nom === 'M. Durand').telephone).toBe('+33600000005');
  expect(parts.find((p) => p.nom === 'Mme Neuve').telephone).toBe('+33600000009');
  await expect(page.locator('tr[data-participant]')).toHaveCount(2);
  await capture(page, 'C1-fiche-apres');
});

test('C1 les règles de la création s’appliquent : un numéro fixe est refusé avec une phrase, rien n’est écrit', async ({ page }) => {
  await semer();
  await ouvrirFiche(page);
  await ouvrirMenu(page);
  await page.getByRole('menuitem', { name: 'Modifier le rendez-vous' }).click();
  const fenetre = page.getByRole('dialog');
  await fenetre.locator('[data-role="participant"]').nth(0).getByLabel('Téléphone mobile').fill('04 72 00 00 00');
  await fenetre.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(fenetre.locator('.erreur')).toContainText('Participant 1');
  await capture(page, 'C1-erreur');
  expect((await lireDocument('rdv_participants/p1')).telephone).toBe('+33600000001');
});

test('C1 après le premier envoi : objet et adresse seulement ; les créneaux renvoient vers « Proposer d’autres créneaux »', async ({ page }) => {
  await semer({ envoiDemandeLe: '2031-01-01T09:00:00.000Z' });
  await ouvrirFiche(page);
  await ouvrirMenu(page);
  await page.getByRole('menuitem', { name: 'Modifier le rendez-vous' }).click();
  const fenetre = page.getByRole('dialog');
  await expect(fenetre.locator('[data-role="modifier-apres-envoi"]')).toContainText('Proposer d’autres créneaux');
  await expect(fenetre.locator('[data-role="participant"]')).toHaveCount(0);
  await expect(fenetre.getByLabel('Créneau 1')).toHaveCount(0);
  await capture(page, 'C1-apres-envoi');
  await fenetre.getByLabel('Objet de la visite').fill('Nouvel objet');
  await fenetre.getByRole('button', { name: 'Enregistrer' }).click();
  await expect.poll(async () => (await lireDocument('rdv_rendezvous/r1'))?.objet).toBe('Nouvel objet');
  expect((await lireDocument('rdv_rendezvous/r1')).creneaux).toEqual(CRENEAUX);
  await ouvrirMenu(page);
  await page.getByRole('menuitem', { name: 'Modifier le rendez-vous' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Proposer d’autres créneaux' }).click();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Enregistrer la nouvelle série' })).toBeVisible();
});

test('C1 l’entrée « Modifier le rendez-vous » est absente d’un rendez-vous archivé, annulé ou confirmé', async ({ page }) => {
  await semer({ archive: true });
  await connecter(page, undefined, { route: 'rdv/liste/r1' });
  await ouvrirMenu(page);
  await expect(page.getByRole('menuitem', { name: 'Désarchiver' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Modifier le rendez-vous' })).toHaveCount(0);
  await capture(page, 'C1-archive');
  await page.keyboard.press('Escape');
  await semer({ annule: true });
  await expect(page.getByRole('button', { name: 'Actions du rendez-vous' })).toHaveCount(0);
  await semer({ etat: 'confirme', creneauChoisi: CRENEAUX[0] });
  await ouvrirMenu(page);
  await expect(page.getByRole('menuitem', { name: 'Modifier le rendez-vous' })).toHaveCount(0);
});

const sms = (id, extra = {}) => ecrireDocument(`rdv_messages/${id}`, { rendezVousId: 'r1', participantId: 'p1', tour: 1, sens: 'sortant', numero: '+33600000001', texte: 'Quel créneau ?', caracteres: 14, typeMessage: 'creneaux', etatEnvoi: 'abandonne', envoyeLe: '2031-01-01T09:00:00.000Z', ...extra });

test('C2 « Renvoyer le SMS » apparaît seulement pour un participant dont un SMS est abandonné ; un clic confirmé envoie l’identifiant du rendez-vous et du participant (jamais le texte ni le numéro)', async ({ page }) => {
  const demandes = await simulerServeur(page);
  await semer({ envoiDemandeLe: '2031-01-01T08:00:00.000Z' });
  await sms('m1');
  await sms('m2', { participantId: 'p2', numero: '+33600000002', etatEnvoi: 'envoye' });
  await ouvrirFiche(page);
  await expect(page.locator('tr[data-participant="p1"] [data-action="renvoyer-sms"]')).toHaveCount(1);
  await expect(page.locator('tr[data-participant="p2"] [data-action="renvoyer-sms"]')).toHaveCount(0);
  await capture(page, 'C2-bouton');
  await page.locator('tr[data-participant="p1"] [data-action="renvoyer-sms"]').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Renvoyer le SMS' }).click();
  await expect.poll(() => demandes.length).toBe(1);
  expect(demandes[0]).toEqual({ action: 'renvoyer', rendezVousId: 'r1', participantId: 'p1' });
});

test('C2 cas d’erreur : le serveur refuse, la phrase du serveur est montrée et le bouton reste disponible', async ({ page }) => {
  await simulerServeur(page, { reponseEnvoi: () => ({ erreur: { status: 'FAILED_PRECONDITION', message: 'Cette personne a répondu STOP : aucun SMS ne lui est envoyé.' } }) });
  await semer({ envoiDemandeLe: '2031-01-01T08:00:00.000Z' });
  await sms('m1');
  await ouvrirFiche(page);
  const bouton = page.locator('tr[data-participant="p1"] [data-action="renvoyer-sms"]');
  await bouton.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Renvoyer le SMS' }).click();
  await expect(page.locator('.toast, [role="status"], [role="alert"]').filter({ hasText: 'STOP' }).first()).toBeVisible();
  await expect(bouton).toBeEnabled();
  await capture(page, 'C2-erreur');
});

test('C2 pas de bouton si le SMS est seulement en échec ou réservé (réessayé tout seul), s’il est déjà renvoyé, ou sur un rendez-vous annulé', async ({ page }) => {
  await simulerServeur(page);
  await semer({ envoiDemandeLe: '2031-01-01T08:00:00.000Z' });
  await sms('m1', { etatEnvoi: 'echec' });
  await sms('m2', { etatEnvoi: 'reserve' });
  await sms('m3', { renvoyeLe: '2031-01-02T09:00:00.000Z' });
  await ouvrirFiche(page);
  await expect(page.locator('[data-action="renvoyer-sms"]')).toHaveCount(0);
  await sms('m3');
  await expect(page.locator('tr[data-participant="p1"] [data-action="renvoyer-sms"]')).toHaveCount(1);
  await semer({ envoiDemandeLe: '2031-01-01T08:00:00.000Z', annule: true, archive: true });
  await expect(page.locator('[data-action="renvoyer-sms"]')).toHaveCount(0);
});
