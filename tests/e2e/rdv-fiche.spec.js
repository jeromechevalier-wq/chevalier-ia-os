// Module Rendez-vous, PR 3 (14/11/2026) : fiche d'un rendez-vous (tableau « qui peut quand », bandeaux, saisie à la place, confirmer, nouvelle série, annuler, pluie, historique en bulles).
// Un test par consigne de Jérôme (5, 6, 7, 8, 13), nom commençant par son numéro, UNE capture chacun dans tests/e2e/captures/rdv-fiche/ (« -telephone » sur téléphone). Données fictives.
import { test, expect, connecter, allerA, listerDocuments, lireDocument, ecrireDocument, estTelephone } from './outils.js';

const CAPTURES = 'e2e/captures/rdv-fiche';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});

const dansJours = (n, h = 10) => { const d = new Date(Date.now() + n * 86400000); d.setUTCHours(h - 1, 0, 0, 0); return d.toISOString(); };
const il = (n, h) => dansJours(n, h);
async function semer(id = 'r1', extra = {}) {
  await ecrireDocument(`rdv_rendezvous/${id}`, {
    client: 'M. Durand', objet: 'Visite avant terrassement', adresse: '12 rue des Lilas\n69000 Lyon', commune: 'Lyon', creneaux: [il(5, 10), il(6, 14), il(7, 9)],
    etat: 'en_attente', creneauChoisi: null, archive: false, tour: 1, relancesFaites: 0, envoiDemandeLe: il(-1, 9), confirmeLe: null, annule: false, ...extra,
  });
}
const part = (id, nom, role, tel, etatReponse = 'attente', creneauxOk = [], reponse = '') => ecrireDocument(`rdv_participants/${id}`, { rendezVousId: 'r1', personneId: null, nom, role, telephone: tel, reponse, etatReponse, creneauxOk });
const sms = (id, sens, numero, texte, extra = {}) => ecrireDocument(`rdv_messages/${id}`, { rendezVousId: 'r1', tour: 1, sens, numero, texte, caracteres: [...texte].length, typeMessage: sens === 'entrant' ? 'reponse' : 'creneaux', ...extra });
const ouvrirFiche = async (page) => { await connecter(page); await allerA(page, 'Rendez-vous'); await page.locator('.carte-rdv').first().click(); await expect(page).toHaveURL(/#\/rdv\/liste\/r1$/); };

test('5 les créneaux sont écrits clairement : « Créneau 1 », « Créneau 2 », « Créneau 3 » avec le jour et l’heure', async ({ page }) => {
  await semer(); await part('p1', 'M. Durand', 'Client', '+33600000001');
  await ouvrirFiche(page);
  const cols = page.locator('table[data-role="qui-peut-quand"] thead th.rdv-col-creneau');
  await expect(cols).toHaveCount(3);
  await expect(cols.nth(0).locator('.rdv-col-numero')).toHaveText('Créneau 1');
  await expect(cols.nth(1).locator('.rdv-col-numero')).toHaveText('Créneau 2');
  await expect(cols.nth(2).locator('.rdv-col-numero')).toHaveText('Créneau 3');
  await expect(cols.nth(0).locator('.rdv-col-date')).toHaveText(/^(lundi|mardi|mercredi|jeudi|vendredi|samedi|dimanche) \d{1,2} \S+ à 10h$/);
  await expect(page.getByRole('heading', { name: /M\. Durand · Lyon/, level: 1 })).toBeVisible();
  await expect(page.locator('[data-role="adresse"]')).toHaveText('12 rue des Lilas\n69000 Lyon');
  await capture(page, '5-creneaux');
});

test('6 grosse coche verte quand il peut, grosse croix rouge quand il ne peut pas, point d’interrogation sans réponse, triangle rouge quand la réponse n’est pas comprise ; légende', async ({ page }) => {
  await semer();
  await part('p1', 'M. Durand', 'Client', '+33600000001', 'comprise', [1, 3], '1 et 3');
  await part('p2', 'Terrassier', 'Terrassier', '+33600000002');
  await part('p3', 'Architecte', 'Architecte', '+33600000003', 'incomprise', [], 'plutôt jeudi');
  await ouvrirFiche(page);
  const cellule = (p, c) => page.locator(`tr[data-participant="${p}"] td[data-creneau="${c}"] [data-symbole]`);
  await expect(cellule('p1', 1)).toHaveAttribute('data-symbole', 'oui');
  await expect(cellule('p1', 2)).toHaveAttribute('data-symbole', 'non');
  await expect(cellule('p1', 3)).toHaveAttribute('data-symbole', 'oui');
  await expect(cellule('p2', 1)).toHaveAttribute('data-symbole', 'inconnu');
  await expect(page.locator('tr[data-participant="p3"] td[data-creneau] [data-symbole]')).toHaveCount(0);
  await expect(page.locator('tr[data-participant="p3"] th [data-symbole="incompris"]')).toHaveCount(1);
  expect((await cellule('p1', 1).boundingBox()).width).toBeGreaterThanOrEqual(30); // « grosse » coche
  await expect(page.locator('[data-role="legende"] li')).toHaveText(['Peut', 'Ne peut pas', 'Pas de réponse', 'Réponse non comprise']);
  await expect(page.locator('tr[data-participant="p1"] [data-role="reponse-exacte"]')).toHaveText('« 1 et 3 »');
  await capture(page, '6-symboles');
});

test('7 un petit « i » à côté du nom donne le numéro de téléphone au survol, avec un lien pour appeler à côté', async ({ page }) => {
  await semer(); await part('p1', 'M. Durand', 'Client', '+33600000001');
  await ouvrirFiche(page);
  const ligne = page.locator('tr[data-participant="p1"]');
  const info = ligne.locator('.bouton-info');
  await expect(info).toHaveCount(1);
  if (!estTelephone(page)) await info.hover(); else await info.click();
  await expect(ligne.locator('.bulle-info')).toHaveText('06 00 00 00 01');
  await expect(ligne.locator('a.lien-tel')).toHaveAttribute('href', 'tel:+33600000001');
  expect(await ligne.locator('a.lien-tel').evaluate((a) => !a.closest('button')), 'le lien est à côté du « i », pas dedans').toBe(true);
  await expect(ligne.locator('.rdv-personne-role')).toHaveText('Client');
  await capture(page, '7-info-telephone');
});

test('8 historique en bulles : ce qu’on envoie à gauche (violet), ce que les autres répondent à droite (gris), texte exact, caractères sous chaque SMS envoyé, contour rouge sur une réponse non comprise', async ({ page }) => {
  await semer();
  await part('p1', 'M. Durand', 'Client', '+33600000001', 'comprise', [1], '1');
  await part('p2', 'Architecte', 'Architecte', '+33600000003', 'incomprise', [], 'plutôt jeudi');
  await sms('m1', 'sortant', '+33600000001', 'Mme Martin : chantier M. Durand, quels créneaux ?\n1 : mar. 17 nov. 10h', { envoyeLe: il(-1, 9) });
  await sms('m2', 'entrant', '+33600000001', '1', { recuLe: il(-1, 10), comprise: true });
  await sms('m3', 'entrant', '+33600000003', 'plutôt jeudi', { recuLe: il(-1, 11), comprise: false });
  await ouvrirFiche(page);
  const bulles = page.locator('[data-role="historique"] .bulle-ligne');
  await expect(bulles).toHaveCount(3);
  await expect(bulles.nth(0)).toHaveAttribute('data-sens', 'sortant');
  await expect(bulles.nth(0).locator('.bulle-texte')).toHaveText('Mme Martin : chantier M. Durand, quels créneaux ?\n1 : mar. 17 nov. 10h');
  await expect(bulles.nth(0).locator('.bulle-caracteres')).toContainText('caractères');
  await expect(bulles.nth(1)).toHaveAttribute('data-sens', 'entrant');
  await expect(bulles.nth(1).locator('.bulle-caracteres')).toHaveCount(0);
  await expect(bulles.nth(2)).toHaveClass(/bulle-incomprise/);
  const g = await bulles.nth(0).locator('.bulle').boundingBox();
  const d = await bulles.nth(1).locator('.bulle').boundingBox();
  expect(g.x, 'envoyé à gauche').toBeLessThan(d.x);
  expect(d.x + d.width, 'reçu à droite').toBeGreaterThan(g.x + g.width);
  expect(await bulles.nth(2).locator('.bulle').evaluate((e) => getComputedStyle(e).borderTopColor)).not.toBe('rgba(0, 0, 0, 0)');
  await expect(bulles.nth(1).locator('.bulle-pied')).toContainText('M. Durand');
  await capture(page, '8-bulles');
});

test('8 sans SMS : une phrase simple remplace l’historique', async ({ page }) => {
  await semer(); await part('p1', 'M. Durand', 'Client', '+33600000001');
  await ouvrirFiche(page);
  await expect(page.locator('[data-role="historique-vide"]')).toContainText('Aucun SMS pour l’instant');
});

test('13 une réponse non comprise : bandeau rouge, SMS d’alerte, relances suspendues ; on saisit la réponse à sa place et le bandeau disparaît', async ({ page }) => {
  await semer();
  await part('p1', 'M. Durand', 'Client', '+33600000001', 'comprise', [1, 2], '1 et 2');
  await part('p2', 'Architecte', 'Architecte', '+33600000003', 'incomprise', [], 'plutôt jeudi');
  await ouvrirFiche(page);
  await expect(page.locator('[data-role="bandeau-incompris"]')).toContainText('Cette personne a répondu quelque chose que le service ne comprend pas. Tu as reçu un SMS : appelle-la ou saisis sa réponse à sa place.');
  await expect(page.locator('tr[data-participant="p2"] [data-role="reponse-exacte"]')).toHaveText('« plutôt jeudi »');
  await capture(page, '13-bandeau-rouge');
  await page.locator('tr[data-participant="p2"] [data-action="saisir-reponse"]').click();
  await expect(page.getByRole('dialog')).toContainText('« plutôt jeudi »');
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer sa réponse' }).click();
  await expect(page.getByRole('dialog').locator('.erreur')).toContainText('Coche au moins un créneau');
  await page.getByRole('checkbox', { name: /Créneau 2/ }).check();
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer sa réponse' }).click();
  await expect(page.locator('[data-role="bandeau-incompris"]')).toHaveCount(0);
  const p2 = await lireDocument('rdv_participants/p2');
  expect(p2).toMatchObject({ etatReponse: 'saisie', creneauxOk: [2], reponse: 'plutôt jeudi' }); // la réponse exacte reçue reste visible
  await expect(page.locator('tr[data-participant="p2"] td[data-creneau="2"] [data-symbole]')).toHaveAttribute('data-symbole', 'oui');
  await expect(page.locator('[data-role="bandeau-creneau"]')).toHaveText('Le créneau 2 convient à tout le monde. Seul toi peux le confirmer.');
  await expect(page.locator('[data-action="confirmer-creneau"]')).toHaveText('Confirmer le créneau 2');
});

test('confirmer : bandeau violet « Pour l’instant… », bouton jaune, un clic confirme (état Confirmés, créneau choisi), la pluie devient possible', async ({ page }) => {
  await semer();
  await part('p1', 'M. Durand', 'Client', '+33600000001', 'comprise', [3], '3');
  await part('p2', 'Terrassier', 'Terrassier', '+33600000002', 'comprise', [3], '3');
  await part('p3', 'Architecte', 'Architecte', '+33600000003');
  await part('p4', 'Géomètre', 'Géomètre', '+33600000004');
  await ouvrirFiche(page);
  await expect(page.locator('[data-role="bandeau-creneau"]')).toHaveText('Pour l’instant, le créneau 3 convient à 2 personnes sur 4. Seul toi peux le confirmer.');
  await expect(page.locator('.rdv-boutons-fiche .bouton-principal')).toHaveCount(1);
  await expect(page.locator('[data-action="prevenir-pluie"]')).toHaveCount(0);
  await capture(page, 'confirmer-bandeau');
  await page.getByRole('button', { name: 'Confirmer le créneau 3' }).click();
  await expect(page.locator('[data-role="bandeau-confirme"]')).toBeVisible();
  const r = await lireDocument('rdv_rendezvous/r1');
  expect(r.etat).toBe('confirme');
  expect(new Date(r.creneauChoisi).getTime()).toBe(new Date((await lireDocument('rdv_rendezvous/r1')).creneaux[2]).getTime());
  expect(r.confirmeLe).toBeTruthy();
  await expect(page.locator('[data-role="etat"]')).toHaveText('Confirmés');
  await expect(page.locator('[data-action="confirmer-creneau"]')).toHaveCount(0);
  await expect(page.locator('[data-action="prevenir-pluie"]')).toBeVisible();
  await page.locator('.lien-retour').click();
  await expect(page.locator('.colonne[data-colonne="confirme"] .carte-rdv')).toHaveCount(1);
});

test('proposer d’autres créneaux : nouvelle série (tour 2), réponses remises à zéro, historique des SMS gardé', async ({ page }) => {
  await semer();
  await part('p1', 'M. Durand', 'Client', '+33600000001', 'comprise', [1], '1');
  await sms('m1', 'sortant', '+33600000001', 'Premier SMS', { envoyeLe: il(-1, 9) });
  await ouvrirFiche(page);
  await page.getByRole('button', { name: 'Proposer d’autres créneaux' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer la nouvelle série' }).click();
  await expect(page.getByRole('dialog').locator('.erreur')).toContainText('au moins un créneau');
  await page.getByLabel('Nouveau créneau 1').fill('2031-04-02T09:30');
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer la nouvelle série' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const r = await lireDocument('rdv_rendezvous/r1');
  expect(r.tour).toBe(2);
  expect(r.creneaux).toHaveLength(1);
  expect(await lireDocument('rdv_participants/p1')).toMatchObject({ etatReponse: 'attente', creneauxOk: [], reponse: '' });
  expect((await listerDocuments('rdv_messages')).map((m) => m.id)).toEqual(['m1']);
  await expect(page.locator('[data-role="historique"] .bulle-ligne')).toHaveCount(1);
  await expect(page.locator('table[data-role="qui-peut-quand"] thead th.rdv-col-creneau')).toHaveCount(1);
  expect((await listerDocuments('crm_audit')).filter((l) => l.collection === 'rdv_participants' || l.collection === 'rdv_rendezvous').length).toBeGreaterThanOrEqual(2);
});

test('annuler et pluie : fenêtre avec texte prérempli MODIFIABLE et compteur ; « Envoyer » grisé (envoi pas branché) ; « Annuler sans prévenir » archive le rendez-vous', async ({ page }) => {
  await semer('r1', { etat: 'confirme', creneauChoisi: il(5, 10), confirmeLe: il(-1, 9) });
  await part('p1', 'M. Durand', 'Client', '+33600000001', 'comprise', [1], '1');
  await ecrireDocument('rdv_parametres/reglages', { nomDansLesSms: 'Mme Martin', roles: ['Client'], numerosAlerte: [], numeroAffiche: '', relances: { delaiHeures: 24, nombre: 3 }, rappel: { actif: true, heure: '19:00' }, plage: { debut: '08:00', fin: '20:30' }, modeles: {} });
  await ouvrirFiche(page);
  await page.getByRole('button', { name: 'Prévenir de la pluie' }).click();
  const champ = page.getByRole('dialog').getByLabel('Texte du SMS');
  await expect(champ).toHaveValue(/^Mme Martin : RDV du .* \(chantier M\. Durand\) annulé à cause de la pluie\./);
  await champ.fill('Pluie demain, RDV reporté.');
  await expect(page.getByRole('dialog').locator('.rdv-compteur-sms')).toHaveText('26 caractères sur 160 · 1 SMS');
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Envoyer' })).toBeDisabled();
  await expect(page.getByRole('dialog').locator('[data-role="envoi-non-branche"]')).toBeVisible();
  await capture(page, 'pluie');
  await page.locator('.dialogue-pied').getByRole('button', { name: 'Fermer' }).click();
  await page.getByRole('button', { name: 'Annuler le rendez-vous' }).click();
  await expect(page.getByRole('dialog').getByLabel('Texte du SMS')).toHaveValue(/est annulé\./);
  await page.getByRole('dialog').getByRole('button', { name: 'Annuler sans prévenir' }).click();
  await expect(page).toHaveURL(/#\/rdv\/archives$/);
  expect(await lireDocument('rdv_rendezvous/r1')).toMatchObject({ annule: true, archive: true });
  expect(await listerDocuments('rdv_messages')).toHaveLength(0); // rien n'est parti
});

test('fiche : un identifiant inconnu donne une phrase simple et un retour à la liste', async ({ page }) => {
  await connecter(page, undefined, { route: 'rdv/liste/inconnu' });
  await expect(page.getByText('Ce rendez-vous n’existe pas ou a été supprimé.')).toBeVisible();
  await page.getByRole('link', { name: 'Retour aux rendez-vous' }).click();
  await expect(page).toHaveURL(/#\/rdv\/liste$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'pas de défilement horizontal').toBe(true);
});
