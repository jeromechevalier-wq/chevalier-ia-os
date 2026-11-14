// Module Rendez-vous, PR B : la carte « Connexion SMS (ClickSend) » de Réglages. Les fonctions du serveur (rdvEtat, rdvConnexionSms) sont simulées dans le navigateur : aucun appel réel, aucune vraie clé.
// On vérifie ce que l'écran envoie, ce qu'il montre selon la réponse, et que la clé ne reste JAMAIS dans la page. Captures dans tests/e2e/captures/rdv-connexion/.
import { test, expect, connecter, allerA, ouvrirSectionReglages, estTelephone } from './outils.js';

const CAPTURES = 'e2e/captures/rdv-connexion';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
const CLE = 'cle-de-test-pas-un-vrai-secret';
const ADRESSE_1 = 'https://exemple.test/rdv/jeton-de-test-un';
const ADRESSE_2 = 'https://exemple.test/rdv/jeton-de-test-deux';

/** Simule rdvEtat et rdvConnexionSms. `reponse(demande)` rend { result } ou { erreur: { status, message } }. Rend la liste des demandes de connexion reçues. */
async function simulerServeur(page, { branche = false, peutConfigurer = true, etatConnexion = { enregistre: false, adresse: null, expediteur: '' }, reponse = () => ({ result: { ok: true, adresse: ADRESSE_1, adresseChangee: true } }) } = {}) {
  const demandes = [];
  await page.route(/cloudfunctions\.net\/rdvEtat$/, (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ result: { branche, peutConfigurer } }) });
  });
  await page.route(/cloudfunctions\.net\/rdvConnexionSms$/, (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    const demande = JSON.parse(route.request().postData() ?? '{}').data;
    demandes.push(demande);
    const r = demande.action === 'etat' ? { result: etatConnexion } : reponse(demande);
    if (r.erreur) return route.fulfill({ status: 400, headers: CORS, contentType: 'application/json', body: JSON.stringify({ error: { status: r.erreur.status, message: r.erreur.message } }) });
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify(r) });
  });
  return demandes;
}
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});
const ouvrir = async (page) => { await connecter(page); await allerA(page, 'Réglages'); await ouvrirSectionReglages(page, 'Rendez-vous'); return page.locator('#reglages-rdv-connexion'); };

test('connexion : un compte qui ne peut pas configurer (pas Jérôme) voit seulement l’état, sans champ de saisie', async ({ page }) => {
  await simulerServeur(page, { peutConfigurer: false, branche: false });
  const carte = await ouvrir(page);
  await expect(carte.locator('[data-role="connexion-etat"]')).toContainText('pas encore branché');
  await expect(carte.getByLabel('Clé d’API ClickSend')).toHaveCount(0);
  await expect(carte.getByRole('button', { name: 'Enregistrer la connexion' })).toHaveCount(0);
  await capture(page, 'non-jerome');
});

test('connexion : Jérôme enregistre l’identifiant et la clé ; la demande part au serveur, la clé est effacée de la page, l’adresse des réponses est montrée avec un bouton pour la copier', async ({ page }) => {
  const demandes = await simulerServeur(page);
  const carte = await ouvrir(page);
  await expect(carte.locator('[data-role="connexion-etat"]')).toContainText('Pas encore enregistrée');
  await carte.getByLabel('Identifiant ClickSend').fill('compte-test');
  await carte.getByLabel('Clé d’API ClickSend').fill(CLE);
  await expect(carte.getByLabel('Clé d’API ClickSend')).toHaveAttribute('type', 'password');
  await capture(page, 'saisie');
  await carte.getByRole('button', { name: 'Enregistrer la connexion' }).click();
  await expect(page.locator('.toast')).toContainText('Connexion enregistrée');
  await expect(carte.locator('[data-role="adresse-reponses"] input')).toHaveValue(ADRESSE_1);
  await expect(carte.getByRole('button', { name: 'Copier l’adresse' })).toBeVisible();
  await expect(carte.getByLabel('Clé d’API ClickSend')).toHaveValue('');
  await expect(carte.getByLabel('Identifiant ClickSend')).toHaveValue('');
  expect(await page.content()).not.toContain(CLE);
  expect(demandes.filter((d) => d.action === 'enregistrer')).toEqual([{ action: 'enregistrer', identifiant: 'compte-test', cle: CLE, expediteur: '' }]);
  await expect(carte.locator('[data-role="connexion-etat"]')).toContainText('Connexion enregistrée.');
  await capture(page, 'enregistree');
});

test('connexion : déjà enregistrée, l’adresse des réponses reste cachée jusqu’à « Afficher » ; « Changer l’adresse » demande confirmation puis montre la nouvelle', async ({ page }) => {
  const demandes = await simulerServeur(page, { branche: true, etatConnexion: { enregistre: true, adresse: ADRESSE_1, expediteur: 'Martin' }, reponse: () => ({ result: { ok: true, adresse: ADRESSE_2, adresseChangee: true } }) });
  const carte = await ouvrir(page);
  await expect(carte.locator('[data-role="connexion-etat"]')).toContainText('Connexion enregistrée.');
  await expect(carte.getByLabel('Nom d’expéditeur (facultatif)')).toHaveValue('Martin');
  await expect(carte.getByLabel('Clé d’API ClickSend')).toHaveAttribute('placeholder', /enregistrée/);
  await expect(carte.locator('[data-role="adresse-reponses"]')).toHaveCount(0);
  await carte.getByRole('button', { name: 'Afficher l’adresse des réponses' }).click();
  await expect(carte.locator('[data-role="adresse-reponses"] input')).toHaveValue(ADRESSE_1);
  await carte.getByRole('button', { name: 'Cacher l’adresse des réponses' }).click();
  await expect(carte.locator('[data-role="adresse-reponses"]')).toHaveCount(0);
  await carte.getByRole('button', { name: 'Changer l’adresse des réponses' }).click();
  await page.getByRole('button', { name: 'Annuler' }).click();
  expect(demandes.filter((d) => d.action === 'regenerer')).toEqual([]);
  await carte.getByRole('button', { name: 'Changer l’adresse des réponses' }).click();
  await page.getByRole('button', { name: 'Changer l’adresse', exact: true }).click();
  await expect(carte.locator('[data-role="adresse-reponses"] input')).toHaveValue(ADRESSE_2);
  expect(demandes.filter((d) => d.action === 'regenerer')).toEqual([{ action: 'regenerer' }]);
  await capture(page, 'adresse-changee');
});

test('connexion : ClickSend refuse la clé, ou le serveur refuse : le message du serveur est montré, la clé n’est pas perdue de vue, rien n’est enregistré', { annotation: { type: 'erreurs-reseau-attendues', description: 'Le serveur simulé répond par une erreur 400.' } }, async ({ page }) => {
  await simulerServeur(page, { reponse: () => ({ erreur: { status: 'FAILED_PRECONDITION', message: 'ClickSend refuse cet identifiant ou cette clé. Rien n’a été enregistré.' } }) });
  const carte = await ouvrir(page);
  await carte.getByLabel('Identifiant ClickSend').fill('compte-test');
  await carte.getByLabel('Clé d’API ClickSend').fill(CLE);
  await carte.getByRole('button', { name: 'Enregistrer la connexion' }).click();
  await expect(page.locator('.toast')).toContainText('ClickSend refuse cet identifiant ou cette clé');
  await expect(carte.locator('[data-role="adresse-reponses"]')).toHaveCount(0);
  await expect(carte.locator('[data-role="connexion-etat"]')).toContainText('Pas encore enregistrée');
  await expect(carte.getByRole('button', { name: 'Enregistrer la connexion' })).toBeEnabled();
  await capture(page, 'refus');
});
