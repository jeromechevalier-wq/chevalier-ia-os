// Module Rendez-vous, brief E : la carte « Prêt à passer en vrai ? » (bilan en six cases) et la carte « Solde ClickSend » (trois seuils) de Réglages > Rendez-vous.
// Les fonctions du serveur (rdvEtat, rdvEnvoyer action « solde ») sont simulées dans le navigateur : aucun appel réel, aucun vrai solde. Captures dans tests/e2e/captures/rdv-bilan/.
import { test, expect, connecter, allerA, ouvrirSectionReglages, estTelephone, ecrireDocument, lireDocument } from './outils.js';

const CAPTURES = 'e2e/captures/rdv-bilan';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
const RECHARGE = 'https://dashboard.clicksend.com/portal/billing#add-credit';
const REPONSES = 'https://dashboard.clicksend.com/messaging-settings/sms/inbound-sms';

/** Simule rdvEtat et rdvEnvoyer. `solde` : { branche, solde } ou { erreur: true } (refus du serveur). Rend la liste des demandes de solde reçues. */
async function simulerServeur(page, { branche = true, solde = { branche: true, solde: 25.4, devise: 'EUR' } } = {}) {
  const demandes = [];
  const controle = { etatEnPanne: false };
  Object.defineProperty(demandes, 'controle', { value: controle, enumerable: false });
  await page.route(/cloudfunctions\.net\/rdvEtat$/, (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    if (controle.etatEnPanne) return route.fulfill({ status: 500, headers: CORS, contentType: 'application/json', body: JSON.stringify({ error: { status: 'INTERNAL', message: 'Une erreur est survenue.' } }) });
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ result: { branche, peutConfigurer: true } }) });
  });
  await page.route(/cloudfunctions\.net\/rdvConnexionSms$/, (route) => { // la carte « Connexion SMS » (Jérôme) demande l'état de la connexion dès qu'elle s'affiche
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ result: { enregistre: branche, expediteur: '' } }) });
  });
  await page.route(/cloudfunctions\.net\/rdvEnvoyer$/, (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    demandes.push(JSON.parse(route.request().postData() ?? '{}').data);
    if (solde.erreur) return route.fulfill({ status: 403, headers: CORS, contentType: 'application/json', body: JSON.stringify({ error: { status: 'PERMISSION_DENIED', message: 'Action non autorisée.' } }) });
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ result: solde }) });
  });
  return demandes;
}
const REGLAGES_PRETS = { numerosAlerte: [{ id: 'n1', libelle: 'Mon mobile', numero: '+33600000001', actif: true }], numeroTest: '+33600000002' };
const ouvrir = async (page, nomCarte = 'reglages-rdv-bilan') => {
  await connecter(page); await allerA(page, 'Réglages'); await ouvrirSectionReglages(page, 'Rendez-vous');
  return page.locator(`#${nomCarte}`);
};
const etat = (carte, id) => carte.locator(`[data-role="bilan-${id}"]`);

test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});

test('E3-1 cas vide : sans connexion ClickSend, ni numéro de test ni numéro d’alerte, les cases dépendantes sont rouges (« Enregistre d’abord la connexion ClickSend ») ; le mode test éteint est vert ; aucun SMS, aucune demande de solde', async ({ page }) => {
  const demandes = await simulerServeur(page, { branche: false });
  const carte = await ouvrir(page);
  await expect(carte.locator('li')).toHaveCount(6);
  for (const id of ['connexion', 'adresse', 'solde']) { await expect(etat(carte, id)).toHaveAttribute('data-etat', 'rouge'); await expect(etat(carte, id)).toContainText('Enregistre d’abord la connexion ClickSend'); }
  await expect(etat(carte, 'numero-test')).toHaveAttribute('data-etat', 'rouge');
  await expect(etat(carte, 'alertes')).toHaveAttribute('data-etat', 'rouge');
  await expect(etat(carte, 'mode-test')).toHaveAttribute('data-etat', 'vert');
  await expect(carte.locator('[data-role="bilan-resume"]')).toHaveText('1 sur 6 vérifications au vert.');
  await expect(carte.getByRole('button', { name: 'Actualiser' })).toHaveCount(0); // rien à relire sans connexion
  expect(demandes).toEqual([]);
  await capture(page, 'cas-vide');
});

test('E3-2 tout est vert : connexion, adresse (sans jamais l’afficher), numéro de test, mode test éteint, solde au-dessus du seuil, numéro d’alerte ; « Actualiser » relit le solde', async ({ page }) => {
  const demandes = await simulerServeur(page);
  await connecter(page);
  await ecrireDocument('rdv_parametres/reglages', REGLAGES_PRETS);
  await allerA(page, 'Réglages'); await ouvrirSectionReglages(page, 'Rendez-vous');
  const carte = page.locator('#reglages-rdv-bilan');
  await expect(carte.locator('[data-role="bilan-resume"]')).toContainText('Tout est vert : tu peux passer en vrai.');
  for (const id of ['connexion', 'numero-test', 'mode-test', 'solde', 'alertes']) await expect(etat(carte, id)).toHaveAttribute('data-etat', 'vert');
  await expect(etat(carte, 'adresse')).toHaveAttribute('data-etat', 'gris'); // jamais verte : elle ne vérifie rien de plus que la connexion
  await expect(etat(carte, 'solde')).toContainText('25,40 €');
  await expect(etat(carte, 'adresse')).toContainText('à vérifier chez ClickSend');
  await expect(etat(carte, 'adresse').locator('a')).toHaveAttribute('href', REPONSES);
  await expect(etat(carte, 'adresse').locator('a')).toHaveAttribute('rel', /noopener/);
  expect(await carte.innerHTML()).not.toMatch(/jeton|rdvReponseSms|cloudfunctions/i); // l'adresse des réponses (avec son jeton) n'est jamais écrite dans le bilan
  expect(demandes).toEqual([{ action: 'solde' }]);
  await capture(page, 'tout-vert');
  await carte.getByRole('button', { name: 'Actualiser' }).click();
  await expect.poll(() => demandes.length).toBe(2);
  expect(await lireDocument('rdv_parametres/reglages')).toMatchObject(REGLAGES_PRETS); // le bilan n'a rien enregistré
});

test('E3-3 solde sous le seuil le plus haut : case rouge avec le lien de recharge (nouvel onglet)', async ({ page }) => {
  await simulerServeur(page, { solde: { branche: true, solde: 3.2, devise: 'EUR' } });
  await connecter(page);
  await ecrireDocument('rdv_parametres/reglages', REGLAGES_PRETS);
  await allerA(page, 'Réglages'); await ouvrirSectionReglages(page, 'Rendez-vous');
  const carte = page.locator('#reglages-rdv-bilan');
  await expect(etat(carte, 'solde')).toHaveAttribute('data-etat', 'rouge');
  await expect(etat(carte, 'solde')).toContainText('3,20 €');
  await expect(etat(carte, 'solde')).toContainText('sous ton seuil le plus haut (10 €)');
  await expect(etat(carte, 'solde').locator('a')).toHaveAttribute('href', RECHARGE);
  await expect(etat(carte, 'solde').locator('a')).toHaveAttribute('target', '_blank');
  await capture(page, 'solde-bas');
});

for (const [nom, solde] of [['autre devise ou ClickSend muet', { branche: true, solde: null, devise: '' }], ['refus du serveur', { erreur: true }]]) {
  test(`E3-4 solde indisponible (${nom}) : case grise « indisponible », le reste du bilan reste lisible`, async ({ page }, info) => {
    if (solde.erreur) info.annotations.push({ type: 'erreurs-reseau-attendues', description: 'le refus 403 du serveur est noté par le navigateur' });
    await simulerServeur(page, { solde });
    await connecter(page);
    await ecrireDocument('rdv_parametres/reglages', REGLAGES_PRETS);
    await allerA(page, 'Réglages'); await ouvrirSectionReglages(page, 'Rendez-vous');
    const carte = page.locator('#reglages-rdv-bilan');
    await expect(etat(carte, 'solde')).toHaveAttribute('data-etat', 'gris');
    await expect(etat(carte, 'solde')).toContainText('indisponible pour le moment');
    await expect(etat(carte, 'connexion')).toHaveAttribute('data-etat', 'vert');
    await expect(carte.locator('[data-role="bilan-resume"]')).toHaveText('Rien de rouge, mais 1 vérification impossible pour le moment.');
    await capture(page, solde.erreur ? 'solde-refuse' : 'solde-indisponible');
  });
}

test('E3-5 le mode test de l’appli allumé : case rouge (« les SMS partent vers ton numéro de test », les rendez-vous déjà marqués test le restent)', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('chevalier-os.modeTest', '1'));
  await simulerServeur(page);
  await connecter(page);
  await ecrireDocument('rdv_parametres/reglages', REGLAGES_PRETS);
  await allerA(page, 'Réglages'); await ouvrirSectionReglages(page, 'Rendez-vous');
  const carte = page.locator('#reglages-rdv-bilan');
  await expect(etat(carte, 'mode-test')).toHaveAttribute('data-etat', 'rouge');
  await expect(etat(carte, 'mode-test')).toContainText('envoient leurs SMS vers ton numéro de test');
  await expect(etat(carte, 'mode-test')).toContainText('déjà marqués « test » restent en test');
  await expect(carte.locator('[data-role="bilan-resume"]')).toHaveText('4 sur 5 vérifications au vert.');
  await capture(page, 'mode-test-allume');
});

test('E3-6 un numéro d’alerte coupé ne compte pas ; sans numéro de test : case rouge', async ({ page }) => {
  await simulerServeur(page);
  await connecter(page);
  await ecrireDocument('rdv_parametres/reglages', { numerosAlerte: [{ id: 'n1', libelle: 'Mon mobile', numero: '+33600000001', actif: false }], numeroTest: '' });
  await allerA(page, 'Réglages'); await ouvrirSectionReglages(page, 'Rendez-vous');
  const carte = page.locator('#reglages-rdv-bilan');
  await expect(etat(carte, 'alertes')).toHaveAttribute('data-etat', 'rouge');
  await expect(etat(carte, 'numero-test')).toHaveAttribute('data-etat', 'rouge');
});

test('E2-1 carte « Solde ClickSend » : seuils de départ 10, 5 et 2 ; un changement valide s’enregistre (virgule française comprise)', async ({ page }) => {
  await simulerServeur(page);
  const carte = await ouvrir(page, 'reglages-rdv-solde');
  const champ = (n) => carte.locator(`[data-seuil="${n}"]`);
  await expect(champ(1)).toHaveValue('10'); await expect(champ(2)).toHaveValue('5'); await expect(champ(3)).toHaveValue('2');
  await expect(carte.getByRole('link', { name: 'Recharger mon compte ClickSend' })).toHaveAttribute('href', RECHARGE);
  await carte.scrollIntoViewIfNeeded();
  await carte.screenshot({ path: `${CAPTURES}/seuils${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
  await champ(1).fill('20'); await champ(1).blur();
  await expect.poll(async () => (await lireDocument('rdv_parametres/reglages'))?.seuilsSolde).toEqual([20, 5, 2]);
  await champ(3).fill('2,5'); await champ(3).blur(); // virgule française : 20 > 5 > 2,5, accepté
  await expect.poll(async () => (await lireDocument('rdv_parametres/reglages'))?.seuilsSolde).toEqual([20, 5, 2.5]);
});

test('E2-2 un seuil qui ne diminue pas, trop grand ou illisible est refusé : message, ancienne valeur remise, rien en base', async ({ page }) => {
  await simulerServeur(page);
  const carte = await ouvrir(page, 'reglages-rdv-solde');
  const champ = (n) => carte.locator(`[data-seuil="${n}"]`);
  const depart = { 1: '10', 2: '5', 3: '2' };
  for (const [n, saisie, message] of [[2, '12', 'diminuer'], [3, '1001', 'entre 0 et 1 000'], [1, 'abc', 'entre 0 et 1 000'], [1, '5', 'diminuer']]) {
    await champ(n).fill(saisie); await champ(n).blur();
    await expect(champ(n)).toHaveValue(depart[n]); // l'ancienne valeur revient
    await expect(page.locator('.toast', { hasText: message }).first()).toBeVisible();
  }
  await expect(page.locator('.toast', { hasText: 'change d’abord le dernier seuil' }).first()).toBeVisible(); // l'ordre de saisie est dit
  await expect(champ(1)).toHaveValue('10'); await expect(champ(2)).toHaveValue('5'); await expect(champ(3)).toHaveValue('2');
  expect((await lireDocument('rdv_parametres/reglages'))?.seuilsSolde).toBeUndefined();
});

test('E2-3 le modèle « Alerte : solde ClickSend bas » est réglable avec {solde}, {seuil} et {lien} ; le lien de recharge compte dans l’aperçu ; {client} est refusé', async ({ page }) => {
  await simulerServeur(page);
  const carte = await ouvrir(page, 'reglages-rdv-modeles');
  const modele = carte.locator('[data-modele="alerte-solde-bas"]');
  await expect(modele.locator('.rdv-modele-texte')).toContainText('ClickSend : solde bas, 4,50 EUR (seuil 5 EUR).');
  await expect(modele.locator('.rdv-modele-texte')).toContainText(RECHARGE);
  await expect(modele.locator('.rdv-modele-sanslien')).toContainText('la page de recharge de ClickSend');
  await modele.getByRole('button', { name: 'Modifier' }).click();
  const dialogue = page.getByRole('dialog');
  await expect(dialogue).toContainText('Variables : {solde}, {seuil}, {lien}.');
  await dialogue.getByLabel('Modèle : Alerte : solde ClickSend bas').fill('Solde {solde} pour {client}');
  await dialogue.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.toast').last()).toContainText('Variable inconnue ici : {client}');
  await dialogue.getByLabel('Modèle : Alerte : solde ClickSend bas').fill('Solde {solde} EUR : recharge {lien}');
  await dialogue.getByRole('button', { name: 'Enregistrer' }).click();
  await expect.poll(async () => (await lireDocument('rdv_parametres/reglages'))?.modeles?.['alerte-solde-bas']).toBe('Solde {solde} EUR : recharge {lien}');
});

test('E3-8 « branché ? » en erreur (panne passagère) : les cases connexion, adresse et solde sont GRISES « vérification impossible » (jamais rouges, jamais « l’administrateur doit la saisir ») ; « Actualiser » repose la question', async ({ page }, info) => {
  info.annotations.push({ type: 'erreurs-reseau-attendues', description: 'rdvEtat répond 500 le temps du test' });
  const demandes = await simulerServeur(page);
  demandes.controle.etatEnPanne = true;
  await connecter(page);
  await ecrireDocument('rdv_parametres/reglages', REGLAGES_PRETS);
  await allerA(page, 'Réglages'); await ouvrirSectionReglages(page, 'Rendez-vous');
  const carte = page.locator('#reglages-rdv-bilan');
  for (const id of ['connexion', 'adresse', 'solde']) {
    await expect(etat(carte, id)).toHaveAttribute('data-etat', 'gris');
    await expect(etat(carte, id)).toContainText('Vérification impossible pour le moment');
  }
  await expect(carte).not.toContainText('administrateur');
  await capture(page, 'etat-en-panne');
  demandes.controle.etatEnPanne = false;
  await carte.getByRole('button', { name: 'Actualiser' }).click();
  await expect(etat(carte, 'connexion')).toHaveAttribute('data-etat', 'vert');
  await expect(etat(carte, 'solde')).toHaveAttribute('data-etat', 'vert');
});
