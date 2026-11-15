// Module Rendez-vous, PR 3 (14/11/2026) : fiche d'un rendez-vous (tableau « qui peut quand », bandeaux, saisie à la place, confirmer, nouvelle série, annuler, pluie, historique en bulles).
// Un test par consigne de Jérôme (5, 6, 7, 8, 13), nom commençant par son numéro, UNE capture chacun dans tests/e2e/captures/rdv-fiche/ (« -telephone » sur téléphone). Données fictives.
import { test, expect, connecter, allerA, listerDocuments, lireDocument, ecrireDocument, estTelephone } from './outils.js';

const CAPTURES = 'e2e/captures/rdv-fiche';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
  // La fonction du serveur qui dit si l'envoi des SMS est branché : ici « pas branché » (l'envoi réel est essayé dans rdv-envoi.spec.js). Aucun appel réseau réel.
  await context.route(/cloudfunctions\.net\/rdvEtat$/, (route) => {
    const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ result: { branche: false } }) });
  });
});

/**
 * Lit des styles calculés en UN SEUL appel au navigateur. La fiche se redessine en entier à chaque notification de données (la réponse simulée de rdvEtat en déclenche une) :
 * deux lectures séparées peuvent viser un nœud détaché (style vide). Une lecture atomique dans un `expect.poll` réessaie jusqu'à ce que la fiche soit posée.
 * `selecteurs` : sélecteurs CSS (le premier élément de chacun) ; rend la valeur de `propriete` pour chacun (null si l'élément est absent).
 */
const stylesDe = (page, selecteurs, propriete) => page.evaluate(([sels, prop]) => sels.map((sel) => { const e = document.querySelector(sel); return e ? getComputedStyle(e)[prop] : null; }), [selecteurs, propriete]);
const TABLE = 'table[data-role="qui-peut-quand"]';
const TRANSPARENT = 'rgba(0, 0, 0, 0)';

const dansJours = (n, h = 10) => { const d = new Date(Date.now() + n * 86400000); d.setUTCHours(h - 1, 0, 0, 0); return d.toISOString(); };
// Créneaux à dates FIXES en hiver (Paris = UTC+1) : le test ne dépend plus de la saison où il tourne. 10h, 14h et 9h heure de Paris.
const CRENEAUX = ['2031-02-18T09:00:00.000Z', '2031-02-19T13:00:00.000Z', '2031-02-20T08:00:00.000Z'];
const il = (n, h) => (n === 5 && h === 10 ? CRENEAUX[0] : n === 6 && h === 14 ? CRENEAUX[1] : n === 7 && h === 9 ? CRENEAUX[2] : dansJours(n, h));
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
  await expect(page.locator('[data-role="legende"] li')).toHaveText(['Peut', 'Ne peut pas', 'Pas de réponse', 'Réponse non comprise', 'Désinscrit (STOP)']);
  await expect(page.locator('tr[data-participant="p1"] [data-role="reponse-exacte"]')).toHaveText('« 1 et 3 »');
  await capture(page, '6-symboles');
});

test('D1-1 un participant désinscrit s’affiche « Désinscrit (STOP) » (jamais « réponse non comprise ») et ne bloque pas les autres ; la carte le dit aussi', async ({ page }) => {
  await semer();
  await part('p1', 'M. Durand', 'Client', '+33600000001', 'comprise', [1, 3], '1 et 3');
  await ecrireDocument('rdv_participants/p2', { rendezVousId: 'r1', personneId: null, nom: 'Terrassier', role: 'Terrassier', telephone: '+33600000002', reponse: 'STOP', etatReponse: 'incomprise', creneauxOk: [], desinscrit: true });
  await ouvrirFiche(page);
  const ligne = page.locator('tr[data-participant="p2"]');
  await expect(ligne.locator('th [data-symbole="desinscrit"]')).toHaveCount(1);
  await expect(ligne.locator('th [data-symbole="incompris"]')).toHaveCount(0);
  await expect(ligne.locator('[data-role="desinscrit-texte"]')).toHaveText('Désinscrit (STOP) : ne reçoit plus de SMS');
  await expect(ligne.locator('td[data-creneau] [data-symbole]')).toHaveCount(0);
  await expect(ligne.locator('[data-action="saisir-reponse"]')).toHaveCount(0);
  await expect(page.locator('[data-role="bandeau-incompris"]')).toHaveCount(0);
  await expect(page.locator('[data-role="bandeau-desinscrit"]')).toContainText('a répondu STOP');
  // Le seul participant qui compte a répondu : le rendez-vous n'attend plus personne (créneaux 1 et 3 communs).
  await expect(page.locator('[data-role="bandeau-creneau"]')).toBeVisible();
  await expect(page.locator('[data-role="legende"] li')).toHaveCount(5);
  await capture(page, 'D1-1-desinscrit');
  await page.goBack();
  await expect(page.locator('.carte-rdv').first()).not.toContainText('non comprise');
  await expect(page.locator('.carte-rdv').first()).toContainText('créneaux communs'); // le STOP de p2 ne bloque pas : p1 est la seule à attendre
});

test('A2 « Qui peut quand » est une grille : pastilles de couleur, créneaux communs en évidence, réponse et « Corriger » alignés (et pas de défilement de la page sur téléphone)', async ({ page }) => {
  await semer();
  await part('p1', 'M. Durand', 'Client', '+33600000001', 'comprise', [1, 3], '1 et 3');
  await part('p2', 'Terrassier', 'Terrassier', '+33600000002', 'comprise', [1, 3], '1 et 3');
  await ouvrirFiche(page);
  const table = page.locator('table[data-role="qui-peut-quand"]');
  await expect(table).toBeVisible();
  await expect.poll(async () => (await stylesDe(page, [TABLE], 'display'))[0], { message: 'reste une vraie table, aussi sur téléphone' }).toBe('table');
  // créneaux communs (1 et 3) : en-tête marqué, étiquette « Pour tous », colonne colorée ; le 2 n'est pas mis en évidence
  const communs = table.locator('thead th.rdv-col-commun');
  await expect(communs).toHaveCount(2);
  await expect(communs.nth(0)).toHaveAttribute('data-creneau', '1');
  await expect(communs.nth(1)).toHaveAttribute('data-creneau', '3');
  await expect(communs.locator('.rdv-col-etiquette')).toHaveText(['Pour tous', 'Pour tous']);
  await expect(table.locator('thead th[data-creneau="2"] .rdv-col-etiquette')).toHaveCount(0);
  await expect(table.locator('col.rdv-col-commun')).toHaveCount(2);
  await expect.poll(async () => { const [commun, normal] = await stylesDe(page, [`${TABLE} thead th[data-creneau="1"]`, `${TABLE} thead th[data-creneau="2"]`], 'backgroundColor'); return commun !== null && normal !== null && commun !== normal; }, { message: 'l’en-tête d’un créneau commun a un autre fond que les autres' }).toBe(true);
  await expect.poll(async () => { const [col] = await stylesDe(page, [`${TABLE} col.rdv-col-commun`], 'backgroundColor'); return col !== null && col !== TRANSPARENT; }, { message: 'la colonne commune est colorée' }).toBe(true);
  // pastilles de couleur : coche (verte) et croix (rouge) ont un fond, pas le même
  await expect.poll(async () => {
    const [oui, non] = await stylesDe(page, [`${TABLE} tr[data-participant="p1"] td[data-creneau="1"] [data-symbole]`, `${TABLE} tr[data-participant="p1"] td[data-creneau="2"] [data-symbole]`], 'backgroundColor');
    return oui !== null && non !== null && oui !== TRANSPARENT && non !== TRANSPARENT && oui !== non;
  }, { message: 'pastille verte et pastille rouge : deux fonds colorés différents' }).toBe(true);
  // réponse exacte et « Corriger » : même bord gauche, l'un sous l'autre
  const ligne = table.locator('tr[data-participant="p1"]');
  await expect.poll(() => page.evaluate((t) => { // une seule lecture des deux positions
    const texte = document.querySelector(`${t} tr[data-participant="p1"] [data-role="reponse-exacte"]`)?.getBoundingClientRect();
    const bouton = document.querySelector(`${t} tr[data-participant="p1"] [data-action="saisir-reponse"]`)?.getBoundingClientRect();
    return texte && bouton ? { decalage: Math.abs(texte.x - bouton.x) <= 1, dessous: bouton.y > texte.y } : null;
  }, TABLE), { message: 'réponse et « Corriger » alignés à gauche, l’un sous l’autre' }).toEqual({ decalage: true, dessous: true });
  await expect(ligne.locator('[data-action="saisir-reponse"]')).toHaveText('Corriger');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'pas de défilement horizontal de la page').toBe(true);
  await capture(page, 'A2-grille');
});

test('A2b cas partiel : sans créneau commun, aucune colonne n’est mise en évidence', async ({ page }) => {
  await semer();
  await part('p1', 'M. Durand', 'Client', '+33600000001', 'comprise', [1], '1');
  await part('p2', 'Terrassier', 'Terrassier', '+33600000002');
  await ouvrirFiche(page);
  await expect(page.locator('table[data-role="qui-peut-quand"] .rdv-col-commun')).toHaveCount(0);
});

test('A3 plusieurs créneaux conviennent à tous : le bandeau les cite, le bouton ouvre un choix, rien n’est coché d’office et rien n’est confirmé sans choix', async ({ page }) => {
  await semer();
  await part('p1', 'M. Durand', 'Client', '+33600000001', 'comprise', [1, 2], '1 et 2');
  await part('p2', 'Terrassier', 'Terrassier', '+33600000002', 'comprise', [1, 2], '1 et 2');
  await ouvrirFiche(page);
  await expect(page.locator('[data-role="bandeau-creneau"]')).toHaveText('Les créneaux 1 et 2 conviennent à tout le monde. Seul toi peux en confirmer un.');
  const bouton = page.locator('[data-action="confirmer-creneau"]');
  await expect(bouton).toHaveText('Confirmer un créneau…');
  await expect(bouton).toBeEnabled();
  await expect(page.locator('.rdv-boutons-fiche .bouton-principal')).toHaveCount(1);
  await bouton.click();
  const fenetre = page.getByRole('dialog');
  await expect(fenetre.getByRole('radio')).toHaveCount(2);
  await expect(fenetre.getByRole('radio', { checked: true })).toHaveCount(0); // aucun choix d'office
  await capture(page, 'A3-choix');
  await fenetre.getByRole('button', { name: 'Confirmer ce créneau' }).click(); // cas d'erreur : rien de choisi
  await expect(fenetre.locator('.erreur')).toContainText('Choisis un créneau');
  await expect(fenetre).toBeVisible();
  expect((await lireDocument('rdv_rendezvous/r1')).etat).toBe('en_attente');
  await fenetre.getByRole('button', { name: 'Annuler' }).click();
  expect((await lireDocument('rdv_rendezvous/r1')).etat).toBe('en_attente'); // un clic par erreur ne confirme rien
  await bouton.click();
  await page.getByRole('dialog').getByRole('radio').nth(1).check();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmer ce créneau' }).click();
  await expect.poll(async () => (await lireDocument('rdv_rendezvous/r1'))?.etat).toBe('confirme');
  const r = await lireDocument('rdv_rendezvous/r1');
  expect(new Date(r.creneauChoisi).getTime()).toBe(new Date(r.creneaux[1]).getTime());
  await expect(page.locator('[data-role="bandeau-confirme"]')).toBeVisible();
});

test('A3b un créneau commun déjà passé est écarté : seuls les créneaux à venir sont cités et proposés', async ({ page }) => {
  await semer('r1', { creneaux: [dansJours(-2), CRENEAUX[1], CRENEAUX[2]] });
  await part('p1', 'M. Durand', 'Client', '+33600000001', 'comprise', [1, 2, 3], '1, 2 et 3');
  await part('p2', 'Terrassier', 'Terrassier', '+33600000002', 'comprise', [1, 2, 3], '1, 2 et 3');
  await ouvrirFiche(page);
  await expect(page.locator('[data-role="bandeau-creneau"]')).toHaveText('Les créneaux 2 et 3 conviennent à tout le monde. Seul toi peux en confirmer un.');
  await page.locator('[data-action="confirmer-creneau"]').click();
  await expect(page.getByRole('dialog').getByRole('radio')).toHaveCount(2);
});

test('A4b la pastille TEST est sur la fiche d’un rendez-vous de test (à côté du titre, jamais dans le nom) et absente d’un rendez-vous réel', async ({ page }) => {
  await semer('r1', { test: true }); await part('p1', 'M. Durand', 'Client', '+33600000001');
  await ouvrirFiche(page);
  await expect(page.locator('h1 .badge-test')).toHaveText('[TEST]');
  expect((await lireDocument('rdv_rendezvous/r1')).client).toBe('M. Durand');
  await capture(page, 'A4-fiche-test');
  await ecrireDocument('rdv_rendezvous/r1', { ...(await lireDocument('rdv_rendezvous/r1')), test: false });
  await expect(page.locator('h1 .badge-test')).toHaveCount(0);
});

test('A3c le rendez-vous change pendant que la fenêtre de choix est ouverte : « Le créneau a changé, choisis à nouveau. » et rien n’est écrit', async ({ page }) => {
  await semer();
  await part('p1', 'M. Durand', 'Client', '+33600000001', 'comprise', [1, 2], '1 et 2');
  await part('p2', 'Terrassier', 'Terrassier', '+33600000002', 'comprise', [1, 2], '1 et 2');
  await ouvrirFiche(page);
  await page.locator('[data-action="confirmer-creneau"]').click();
  const fenetre = page.getByRole('dialog');
  await fenetre.getByRole('radio').nth(1).check();
  const avant = await lireDocument('rdv_rendezvous/r1');
  await ecrireDocument('rdv_rendezvous/r1', { ...avant, creneaux: [avant.creneaux[0], '2031-03-05T13:00:00.000Z', avant.creneaux[2]] }); // la date du créneau 2 change ailleurs
  await expect(page.locator('table[data-role="qui-peut-quand"] thead th[data-creneau="2"] .rdv-col-date')).toContainText('5 mars'); // la fiche a bien pris le changement avant le clic
  await fenetre.getByRole('button', { name: 'Confirmer ce créneau' }).click();
  await expect(page.locator('.toast-erreur')).toContainText('Le créneau a changé, choisis à nouveau.');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const apres = await lireDocument('rdv_rendezvous/r1');
  expect(apres.etat).toBe('en_attente');
  expect(apres.creneauChoisi).toBeFalsy();
  await capture(page, 'A3c-creneau-change');
});

test('A3d le rendez-vous est confirmé ailleurs pendant que la fenêtre de choix est ouverte : « Ce rendez-vous a changé : rien n’a été enregistré. », aucun créneau n’est écrit par cette fenêtre', async ({ page }) => {
  await semer();
  await part('p1', 'M. Durand', 'Client', '+33600000001', 'comprise', [1, 2], '1 et 2');
  await part('p2', 'Terrassier', 'Terrassier', '+33600000002', 'comprise', [1, 2], '1 et 2');
  await ouvrirFiche(page);
  await page.locator('[data-action="confirmer-creneau"]').click();
  const fenetre = page.getByRole('dialog');
  await fenetre.getByRole('radio').nth(0).check();
  const avant = await lireDocument('rdv_rendezvous/r1');
  await ecrireDocument('rdv_rendezvous/r1', { ...avant, etat: 'confirme', creneauChoisi: avant.creneaux[1], confirmeLe: '2031-01-01T09:00:00.000Z' }); // confirmé ailleurs, sur le créneau 2
  await expect(page.locator('[data-role="bandeau-confirme"]')).toBeVisible(); // la fiche a pris le changement avant le clic
  await fenetre.getByRole('button', { name: 'Confirmer ce créneau' }).click();
  await expect(page.locator('.toast-erreur')).toContainText('Ce rendez-vous a changé : rien n’a été enregistré.');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const apres = await lireDocument('rdv_rendezvous/r1');
  expect(new Date(apres.creneauChoisi).getTime()).toBe(new Date(avant.creneaux[1]).getTime()); // le créneau confirmé ailleurs n'a pas été remplacé par le 1
});

test('A3e un seul créneau proposé : la date change pendant que la fenêtre est ouverte, « Le créneau a changé, choisis à nouveau. », rien n’est écrit, et la fenêtre rouverte montre la nouvelle date', async ({ page }) => {
  await semer();
  await part('p1', 'M. Durand', 'Client', '+33600000001', 'comprise', [3], '3');
  await part('p2', 'Terrassier', 'Terrassier', '+33600000002');
  await ouvrirFiche(page);
  await page.getByRole('button', { name: 'Confirmer le créneau 3' }).click();
  await expect(page.getByRole('dialog')).toContainText('Confirmer le créneau 3 ?');
  const avant = await lireDocument('rdv_rendezvous/r1');
  await ecrireDocument('rdv_rendezvous/r1', { ...avant, creneaux: [avant.creneaux[0], avant.creneaux[1], '2031-03-07T09:00:00.000Z'] });
  await expect(page.locator('table[data-role="qui-peut-quand"] thead th[data-creneau="3"] .rdv-col-date')).toContainText('7 mars'); // la fiche a pris le changement avant le clic
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmer le créneau 3' }).click();
  await expect(page.locator('.toast-erreur')).toContainText('Le créneau a changé, choisis à nouveau.');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  const apres = await lireDocument('rdv_rendezvous/r1');
  expect(apres.etat).toBe('en_attente');
  expect(apres.creneauChoisi).toBeFalsy();
  await page.getByRole('button', { name: 'Confirmer le créneau 3' }).click(); // la fenêtre rouverte repart de l'état d'aujourd'hui
  await expect(page.getByRole('dialog')).toContainText('7 mars');
});

const REGLAGES = { nomDansLesSms: 'Mme Martin', roles: ['Client'], numerosAlerte: [], numeroAffiche: '', relances: { delaiHeures: 24, nombre: 3 }, rappel: { actif: true, heure: '19:00' }, plage: { debut: '08:00', fin: '20:30' }, modeles: {}, prixSms: 0.1, tarifsAu: '1er novembre 2026' };
/** Un participant qui a répondu STOP : sa réponse est dans l'historique ; le serveur range son numéro dans la liste `desinscrits` (la seule que lisent l'envoi et l'écran, `stop(...)`). */
const partStop = (id, nom, tel) => ecrireDocument(`rdv_participants/${id}`, { rendezVousId: 'r1', personneId: null, nom, role: 'Client', telephone: tel, reponse: 'STOP', etatReponse: 'incomprise', creneauxOk: [] });
const stop = (...numeros) => ecrireDocument('rdv_parametres/desinscrits', { numeros });

test('A6 sous le bouton « Confirmer… », une phrase toujours visible dit ce qui partira : le nombre de personnes (vrais participants joignables), le rappel de la veille, les STOP', async ({ page }) => {
  await ecrireDocument('rdv_parametres/reglages', REGLAGES);
  await semer();
  await part('p1', 'M. Durand', 'Client', '+33600000001', 'comprise', [3], '3');
  await part('p2', 'Terrassier', 'Terrassier', '+33600000002');
  await partStop('p3', 'Architecte', '+33600000003');
  await stop('+33600000003');
  await ouvrirFiche(page);
  const phrase = page.locator('[data-role="avant-confirmer"]');
  await expect(phrase).toHaveText('En confirmant : 2 personnes reçoivent un SMS de confirmation tout de suite, puis un rappel la veille à 19h. Les numéros désinscrits (STOP) ne reçoivent rien.');
  await expect.poll(async () => { // la fiche se redessine à chaque lot de données : on mesure une fois posée
    const b = await page.locator('[data-action="confirmer-creneau"]').boundingBox();
    const f = await phrase.boundingBox();
    return b && f ? f.y > b.y : false;
  }, { message: 'la phrase est SOUS le bouton' }).toBe(true);
  await capture(page, 'A6-phrase');
  // la phrase suit les réglages : rappel coupé = plus de rappel promis
  await ecrireDocument('rdv_parametres/reglages', { ...REGLAGES, rappel: { actif: false, heure: '19:00' } });
  await expect(phrase).toHaveText('En confirmant : 2 personnes reçoivent un SMS de confirmation tout de suite. Les numéros désinscrits (STOP) ne reçoivent rien.');
});

test('A6b la fenêtre « Confirmer le créneau N ? » liste chaque personne (numéro masqué, ce qu’elle reçoit), montre le vrai SMS de confirmation, le nombre de SMS et le coût estimé', async ({ page }) => {
  await ecrireDocument('rdv_parametres/reglages', REGLAGES);
  await stop('+33600000002', '+33600000003'); // le serveur tient la liste des numéros qui ont répondu STOP
  await semer();
  await part('p1', 'M. Durand', 'Client', '+33600000001', 'comprise', [3], '3');
  await part('p2', 'Terrassier', 'Terrassier', '+33600000002');
  await partStop('p3', 'Architecte', '+33600000003');
  await part('p4', 'Sans numéro', 'Client', '');
  await ouvrirFiche(page);
  await page.getByRole('button', { name: 'Confirmer le créneau 3' }).click();
  const fenetre = page.getByRole('dialog');
  const bloc = fenetre.locator('[data-role="prevision"]');
  await expect(bloc.locator('li[data-participant="p1"]')).toContainText('06 •• •• •• 01');
  await expect(bloc.locator('li[data-participant="p1"]')).toContainText('SMS de confirmation maintenant, rappel le');
  await expect(bloc.locator('li[data-participant="p2"]')).toContainText('ne recevra rien : désinscrit (STOP)'); // STOP lu dans la liste du serveur
  await expect(bloc.locator('li[data-participant="p3"]')).toContainText('ne recevra rien : désinscrit (STOP)'); // aussi dans la liste du serveur
  await expect(bloc.locator('li[data-participant="p4"]')).toContainText('ne recevra rien : pas de téléphone');
  await expect(bloc.locator('[data-role="apercu-confirmation"] pre')).toContainText('RDV confirmé : M. Durand, ');
  await expect(bloc.locator('[data-role="apercu-confirmation"] pre')).toContainText('STOP');
  await expect(bloc.locator('[data-role="cout-sms"]')).toContainText('2 SMS facturés au total (1 de confirmation + 1 de rappel) · ≈');
  await expect(bloc.locator('[data-role="cout-sms"]')).toContainText('estimation basée sur les tarifs ClickSend au 1er novembre 2026');
  const texte = await fenetre.textContent();
  expect(texte, 'jamais un numéro en clair').not.toMatch(/06 00 00 00 0\d|\+336000000/);
  await expect(fenetre).toContainText('Il convient à 1 personne sur 4. Une fois confirmé, tout le monde sera prévenu par SMS.');
  await capture(page, 'A6b-fenetre');
  await fenetre.getByRole('button', { name: 'Annuler' }).click();
  expect((await lireDocument('rdv_rendezvous/r1')).etat).toBe('en_attente');
});

test('A6c personne de joignable : « Aucun SMS ne partira » dans la phrase et dans la fenêtre ; le bouton reste actif et la confirmation marche', async ({ page }) => {
  await ecrireDocument('rdv_parametres/reglages', REGLAGES);
  await semer();
  await partStop('p1', 'M. Durand', '+33600000001');
  await stop('+33600000001');
  await part('p2', 'Sans numéro', 'Client', '', 'comprise', [3], '3');
  await ouvrirFiche(page);
  await expect(page.locator('[data-role="avant-confirmer"]')).toHaveText('Aucun SMS ne partira : aucun participant n’a de numéro joignable.');
  const bouton = page.locator('[data-action="confirmer-creneau"]');
  await expect(bouton).toBeEnabled();
  await bouton.click();
  await expect(page.getByRole('dialog').locator('[data-role="aucun-sms"]')).toContainText('Aucun SMS ne partira');
  await expect(page.getByRole('dialog').locator('[data-role="apercu-confirmation"]')).toHaveCount(0);
  await capture(page, 'A6c-aucun-sms');
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmer le créneau 3' }).click();
  await expect.poll(async () => (await lireDocument('rdv_rendezvous/r1'))?.etat).toBe('confirme');
});

test('A6d rendez-vous de test : la phrase et la fenêtre disent que le SMS part vers le numéro de test (masqué), pas vers les participants ; sans numéro de test : aucun SMS', async ({ page }) => {
  await ecrireDocument('rdv_parametres/reglages', { ...REGLAGES, numeroTest: '+33600000009' });
  await semer('r1', { test: true });
  await part('p1', 'M. Durand', 'Client', '+33600000001', 'comprise', [3], '3');
  await part('p2', 'Terrassier', 'Terrassier', '+33600000002');
  await ouvrirFiche(page);
  await expect(page.locator('[data-role="avant-confirmer"]')).toHaveText('Rendez-vous de test : le SMS de confirmation part seulement vers le numéro de test (06 •• •• •• 09), jamais vers les participants.');
  await page.locator('[data-action="confirmer-creneau"]').click();
  const bloc = page.getByRole('dialog').locator('[data-role="prevision"]');
  await expect(bloc.locator('[data-role="note-test"]')).toContainText('les SMS partent vers le numéro de test (06 •• •• •• 09), pas vers les participants');
  await expect(bloc.locator('li[data-participant="p1"]')).toContainText('vers le numéro de test (06 •• •• •• 09)');
  await capture(page, 'A6d-test');
  await page.getByRole('dialog').getByRole('button', { name: 'Annuler' }).click();
  await ecrireDocument('rdv_parametres/reglages', REGLAGES); // plus de numéro de test
  await expect(page.locator('[data-role="avant-confirmer"]')).toHaveText('Rendez-vous de test : aucun SMS ne partira (le numéro des SMS de test n’est pas réglé).');
});

test('A6f le total est en SMS facturés (segments) : une adresse longue fait plus de SMS que de messages, avec le détail confirmation / rappel', async ({ page }) => {
  await ecrireDocument('rdv_parametres/reglages', REGLAGES);
  await semer('r1', { adresse: `${'12 rue des Lilas '.repeat(9).trim()}\n69000 Lyon` });
  await part('p1', 'M. Durand', 'Client', '+33600000001', 'comprise', [3], '3');
  await ouvrirFiche(page);
  await page.getByRole('button', { name: 'Confirmer le créneau 3' }).click();
  const cout = page.getByRole('dialog').locator('[data-role="cout-sms"]');
  await expect(page.getByRole('dialog').locator('[data-role="apercu-confirmation"] .aide').first()).toContainText('· 2 SMS par personne'); // l'adresse longue fait passer la confirmation à 2 SMS
  const texte = (await cout.textContent()) ?? '';
  const m = /^(\d+) SMS facturés au total \((\d+) de confirmation \+ (\d+) de rappel\)/.exec(texte);
  expect(m, `le coût doit annoncer la confirmation ET le rappel ; texte reçu : « ${texte} »`).not.toBeNull();
  const [, total, conf, rappel] = m;
  expect(Number(total), 'une personne, deux messages, mais plus de deux SMS facturés').toBeGreaterThan(2);
  expect(Number(total)).toBe(Number(conf) + Number(rappel));
  expect(Number(conf), 'la confirmation compte ses 2 SMS').toBe(2);
});

test('A6g rendez-vous de test : un participant sans téléphone reçoit le SMS au numéro de test (comme le serveur) ; sans numéro de test, il ne reçoit rien', async ({ page }) => {
  await ecrireDocument('rdv_parametres/reglages', { ...REGLAGES, numeroTest: '+33600000009' });
  await semer('r1', { test: true });
  await part('p1', 'M. Durand', 'Client', '+33600000001', 'comprise', [3], '3');
  await part('p2', 'Sans numéro', 'Client', '', 'comprise', [3], '3');
  await ouvrirFiche(page);
  await page.locator('[data-action="confirmer-creneau"]').click();
  const bloc = page.getByRole('dialog').locator('[data-role="prevision"]');
  const ligne = bloc.locator('li[data-participant="p2"]');
  await expect(ligne).toHaveAttribute('data-statut', 'recoit');
  await expect(ligne).toContainText('SMS de confirmation maintenant vers le numéro de test (06 •• •• •• 09), rappel le');
  await expect(ligne.locator('.rdv-prevision-tel')).toHaveCount(0); // aucun numéro à montrer pour lui
  await expect(bloc.locator('[data-role="cout-sms"]')).toContainText('4 SMS facturés au total (2 de confirmation + 2 de rappel)');
  await capture(page, 'A6g-test-sans-telephone');
  await page.getByRole('dialog').getByRole('button', { name: 'Annuler' }).click();
  await ecrireDocument('rdv_parametres/reglages', REGLAGES); // plus de numéro de test
  await expect(page.locator('[data-role="avant-confirmer"]')).toHaveText('Rendez-vous de test : aucun SMS ne partira (le numéro des SMS de test n’est pas réglé).');
  await page.locator('[data-action="confirmer-creneau"]').click();
  await expect(page.getByRole('dialog').locator('li[data-participant="p2"]')).toHaveAttribute('data-statut', 'test-sans-numero');
  await expect(page.getByRole('dialog').locator('li[data-participant="p2"]')).toContainText('ne recevra rien : le numéro des SMS de test n’est pas réglé');
});

test('A6e plusieurs créneaux communs : la fenêtre de choix montre ce qui partira pour le créneau choisi (rappel de SA veille) et rien tant qu’aucun n’est choisi', async ({ page }) => {
  await ecrireDocument('rdv_parametres/reglages', REGLAGES);
  await semer();
  await part('p1', 'M. Durand', 'Client', '+33600000001', 'comprise', [1, 2], '1 et 2');
  await part('p2', 'Terrassier', 'Terrassier', '+33600000002', 'comprise', [1, 2], '1 et 2');
  await ouvrirFiche(page);
  await expect(page.locator('[data-role="avant-confirmer"]')).toContainText('En confirmant : 2 personnes reçoivent un SMS de confirmation tout de suite, puis un rappel la veille à 19h.');
  await page.locator('[data-action="confirmer-creneau"]').click();
  const fenetre = page.getByRole('dialog');
  await expect(fenetre.locator('[data-role="zone-prevision"]')).toContainText('Choisis un créneau : tu verras ici ce qui partira par SMS.');
  await expect(fenetre.locator('[data-role="prevision"]')).toHaveCount(0);
  await fenetre.getByRole('radio').nth(0).check();
  await expect(fenetre.locator('[data-role="prevision"] li[data-participant="p1"]')).toContainText('rappel le');
  await expect(fenetre.locator('[data-role="apercu-confirmation"] pre')).toContainText('mar. 18 févr.');
  await fenetre.getByRole('radio').nth(1).check();
  await expect(fenetre.locator('[data-role="apercu-confirmation"] pre')).toContainText('mer. 19 févr.');
  await capture(page, 'A6e-choix');
});

test('A3f un seul créneau proposé : une réponse arrive pendant la fenêtre et change le créneau proposé : « Le créneau a changé, choisis à nouveau. », rien n’est écrit', async ({ page }) => {
  await ecrireDocument('rdv_parametres/reglages', REGLAGES);
  await semer();
  await part('p1', 'M. Durand', 'Client', '+33600000001', 'comprise', [3], '3');
  await part('p2', 'Terrassier', 'Terrassier', '+33600000002');
  await ouvrirFiche(page);
  await page.getByRole('button', { name: 'Confirmer le créneau 3' }).click();
  await expect(page.getByRole('dialog')).toContainText('Confirmer le créneau 3 ?');
  await part('p2', 'Terrassier', 'Terrassier', '+33600000002', 'comprise', [1], '1'); // le créneau 1 convient autant que le 3, et il est plus tôt
  await expect(page.locator('[data-action="confirmer-creneau"]')).toHaveText('Confirmer le créneau 1'); // la fiche a pris le changement avant le clic
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmer le créneau 3' }).click();
  await expect(page.locator('.toast-erreur')).toContainText('Le créneau a changé, choisis à nouveau.');
  expect((await lireDocument('rdv_rendezvous/r1')).etat).toBe('en_attente');
});

test('A2c une ligne « non comprise » garde son fond rouge sous le nom, et l’en-tête « Participant » est opaque', async ({ page }) => {
  await semer();
  await part('p1', 'M. Durand', 'Client', '+33600000001', 'comprise', [1], '1');
  await part('p2', 'Architecte', 'Architecte', '+33600000003', 'incomprise', [], 'plutôt jeudi');
  await ouvrirFiche(page);
  const table = page.locator('table[data-role="qui-peut-quand"]');
  const telephone = estTelephone(page);
  await expect.poll(() => page.evaluate(([t, tel]) => {
    const lire = (sel, prop) => { const e = document.querySelector(`${t} ${sel}`); return e ? getComputedStyle(e)[prop] : null; };
    const rien = 'rgba(0, 0, 0, 0)';
    const trait = (sel) => lire(sel, 'borderLeftWidth');
    const commun = trait('thead th.rdv-col-creneau') !== null && trait('thead th.rdv-col-creneau') === trait('tbody td.rdv-cellule');
    if (tel) { // sur téléphone le nom est collant (opaque) : il doit quand même montrer le fond rouge de sa ligne (un calque posé sur le fond opaque)
      const nomRouge = lire('tr[data-participant="p2"] th', 'backgroundImage');
      return { nomOpaque: lire('tr[data-participant="p2"] th', 'backgroundColor') !== rien && lire('tr[data-participant="p2"] th', 'backgroundColor') !== null, calqueRouge: nomRouge !== null && nomRouge !== 'none', calqueAbsentAilleurs: lire('tr[data-participant="p1"] th', 'backgroundImage') === 'none', enteteOpaque: lire('thead th:first-child', 'backgroundColor') !== rien && lire('thead th:first-child', 'backgroundColor') !== null, traitContinu: commun };
    }
    const rouge = lire('tr[data-participant="p2"]', 'backgroundColor'); // ordinateur : le fond rouge est sur la ligne
    return { ligneRouge: rouge !== null && rouge !== lire('tr[data-participant="p1"]', 'backgroundColor'), traitContinu: commun };
  }, [TABLE, telephone]), { message: 'ligne non comprise : fond rouge visible, en-tête opaque, trait vertical continu' })
    .toEqual(telephone ? { nomOpaque: true, calqueRouge: true, calqueAbsentAilleurs: true, enteteOpaque: true, traitContinu: true } : { ligneRouge: true, traitContinu: true });
  await capture(page, 'A2c-ligne-non-comprise');
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
  await expect.poll(async () => lireDocument('rdv_participants/p2')).toMatchObject({ etatReponse: 'saisie', creneauxOk: [2], reponse: 'plutôt jeudi' }); // la réponse exacte reçue reste visible
  await expect(page.locator('tr[data-participant="p2"] td[data-creneau="2"] [data-symbole]')).toHaveAttribute('data-symbole', 'oui');
  await expect(page.locator('[data-role="bandeau-creneau"]')).toHaveText('Le créneau 2 convient à tout le monde. Seul toi peux le confirmer.');
  await expect(page.locator('[data-action="confirmer-creneau"]')).toHaveText('Confirmer le créneau 2');
  await expect.poll(async () => (await lireDocument('rdv_rendezvous/r1'))?.etat).toBe('a_valider'); // la colonne de la carte suit
  await expect(page.locator('[data-role="etat"]')).toHaveText('À valider');
  await expect(page.locator('tr[data-participant="p2"] [data-role="saisie-par-toi"]')).toHaveText('Coché par toi');
  await expect(page.locator('tr[data-participant="p2"] [data-action="saisir-reponse"]')).toHaveText('Corriger'); // une erreur de coche se corrige
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
  await expect(page.getByRole('dialog')).toContainText('Il convient à 2 personnes sur 4. Une fois confirmé, tout le monde sera prévenu par SMS.');
  await capture(page, 'confirmer-fenetre');
  await page.getByRole('dialog').getByRole('button', { name: 'Annuler' }).click();
  expect((await lireDocument('rdv_rendezvous/r1')).etat).toBe('en_attente'); // un clic par erreur ne confirme rien
  await page.getByRole('button', { name: 'Confirmer le créneau 3' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Confirmer le créneau 3' }).click();
  await expect(page.locator('[data-role="bandeau-confirme"]')).toBeVisible();
  await expect.poll(async () => (await lireDocument('rdv_rendezvous/r1'))?.etat).toBe('confirme');
  const r = await lireDocument('rdv_rendezvous/r1');
  expect(r.etat).toBe('confirme');
  expect(new Date(r.creneauChoisi).getTime()).toBe(new Date((await lireDocument('rdv_rendezvous/r1')).creneaux[2]).getTime());
  expect(r.confirmeLe).toBeTruthy();
  await expect(page.locator('[data-role="etat"]')).toHaveText('Confirmé');
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
  await expect.poll(async () => (await lireDocument('rdv_rendezvous/r1'))?.tour).toBe(2);
  const r = await lireDocument('rdv_rendezvous/r1');
  expect(r.tour).toBe(2);
  expect(r.creneaux).toHaveLength(1);
  await expect.poll(async () => lireDocument('rdv_participants/p1')).toMatchObject({ etatReponse: 'attente', creneauxOk: [], reponse: '' });
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
  await expect(champ).toHaveValue(/^Mme Martin : RDV du .* \(M\. Durand\) annulé à cause de la pluie\./);
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
  await expect.poll(async () => lireDocument('rdv_rendezvous/r1')).toMatchObject({ annule: true, archive: true });
  expect(await listerDocuments('rdv_messages')).toHaveLength(0); // rien n'est parti
});

test('fiche : un identifiant inconnu donne une phrase simple et un retour à la liste', async ({ page }) => {
  await connecter(page, undefined, { route: 'rdv/liste/inconnu' });
  await expect(page.getByText('Ce rendez-vous n’existe pas ou a été supprimé.')).toBeVisible();
  await page.getByRole('link', { name: 'Retour aux rendez-vous' }).click();
  await expect(page).toHaveURL(/#\/rdv\/liste$/);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'pas de défilement horizontal').toBe(true);
});
