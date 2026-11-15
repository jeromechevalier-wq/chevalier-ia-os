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
    const r = demande.action === 'etat' ? { result: { enregistre: etatConnexion.enregistre, expediteur: etatConnexion.expediteur } } : demande.action === 'adresse' ? { result: { adresse: etatConnexion.adresse } } : reponse(demande);
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
  const valeurs = await page.evaluate(() => [...document.querySelectorAll('input, textarea')].map((i) => i.value).join('|'));
  expect(valeurs).not.toContain(CLE); // aucun champ de la page ne garde la clé
  expect(await page.content()).not.toContain(CLE);
  expect(demandes.filter((d) => d.action === 'enregistrer')).toEqual([{ action: 'enregistrer', identifiant: 'compte-test', cle: CLE, expediteur: '' }]);
  await expect(carte.locator('[data-role="connexion-etat"]')).toContainText('Connexion enregistrée.');
  await capture(page, 'enregistree');
});

test('connexion : l’identifiant tapé n’est pas perdu quand on affiche l’adresse ; déjà enregistrée, l’adresse des réponses reste cachée jusqu’à « Afficher » ; « Changer l’adresse » demande confirmation puis montre la nouvelle', async ({ page }) => {
  const demandes = await simulerServeur(page, { branche: true, etatConnexion: { enregistre: true, adresse: ADRESSE_1, expediteur: 'Martin' }, reponse: () => ({ result: { ok: true, adresse: ADRESSE_2, adresseChangee: true } }) });
  const carte = await ouvrir(page);
  await expect(carte.locator('[data-role="connexion-etat"]')).toContainText('Connexion enregistrée.');
  await expect(carte.getByLabel('Nom d’expéditeur (facultatif)')).toHaveValue('Martin');
  await carte.getByLabel('Identifiant ClickSend').fill('compte-en-cours');
  await carte.getByLabel('Nom d’expéditeur (facultatif)').fill('Autre');
  await expect(carte.getByLabel('Clé d’API ClickSend')).toHaveAttribute('placeholder', /enregistrée/);
  await expect(carte.locator('[data-role="adresse-reponses"]')).toHaveCount(0);
  expect(demandes.filter((d) => d.action === 'adresse')).toEqual([]); // l’adresse (avec son jeton) n’est demandée qu’au clic
  await carte.getByRole('button', { name: 'Afficher l’adresse des réponses' }).click();
  await expect(carte.locator('[data-role="adresse-reponses"] input')).toHaveValue(ADRESSE_1);
  expect(demandes.filter((d) => d.action === 'adresse')).toEqual([{ action: 'adresse' }]);
  await expect(carte.getByLabel('Identifiant ClickSend')).toHaveValue('compte-en-cours'); // la carte s’est redessinée : ce qui était tapé est resté
  await expect(carte.getByLabel('Nom d’expéditeur (facultatif)')).toHaveValue('Autre');
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
  await expect(carte.getByLabel('Identifiant ClickSend')).toHaveValue('compte-test'); // la saisie n’est pas perdue après un refus
  await expect(carte.getByLabel('Clé d’API ClickSend')).toHaveValue(CLE);
  await capture(page, 'refus');
});

test('A5 aide « Comment configurer ClickSend… » : bloc repliable avec le lien du tableau de bord et les deux règles à désactiver ; l’adresse n’y est écrite que si elle est affichée ; aucun secret', async ({ page }) => {
  await simulerServeur(page, { branche: true, etatConnexion: { enregistre: true, adresse: ADRESSE_1, expediteur: '' } });
  const carte = await ouvrir(page);
  const aide = carte.locator('[data-role="aide-clicksend"]');
  await expect(aide).toHaveCount(1);
  await expect(aide.locator('summary')).toHaveText('Comment configurer ClickSend pour recevoir les réponses et les STOP');
  expect(await aide.evaluate((d) => d.open), 'replié au départ').toBe(false);
  await aide.locator('summary').click();
  await expect(aide).toContainText('Send to messenger');
  await expect(aide).toContainText('SEND_TO_MESSENGER');
  await expect(aide).toContainText('Opt-out contact');
  await expect(aide).toContainText('MOVE_CONTACT');
  await expect(aide.locator('a')).toHaveAttribute('href', 'https://dashboard.clicksend.com/messaging-settings/sms/inbound-sms');
  await expect(aide).toContainText('secret de fait');
  await expect(aide.locator('[data-role="aide-adresse"]')).toHaveCount(0); // adresse pas encore affichée : jamais écrite
  await expect(aide.locator('[data-role="aide-adresse-absente"]')).toBeVisible();
  expect(await aide.textContent()).not.toContain('jeton-de-test');
  await capture(page, 'A5-aide-ouverte');
  await carte.getByRole('button', { name: 'Afficher l’adresse des réponses' }).click();
  await expect(aide.locator('[data-role="aide-adresse"] code')).toHaveText(ADRESSE_1);
  expect(await aide.evaluate((d) => d.open), 'reste ouvert quand la carte se redessine').toBe(true);
  expect(await aide.textContent()).not.toContain(CLE);
  await carte.getByRole('button', { name: 'Cacher l’adresse des réponses' }).click();
  await expect(aide.locator('[data-role="aide-adresse"]')).toHaveCount(0);
});

test('A5b même bloc d’aide pour un compte qui ne configure pas, sans aucune adresse', async ({ page }) => {
  await simulerServeur(page, { peutConfigurer: false, branche: true });
  const carte = await ouvrir(page);
  const aide = carte.locator('[data-role="aide-clicksend"]');
  await aide.locator('summary').click();
  await expect(aide).toContainText('Opt-out contact');
  await expect(aide.locator('[data-role="aide-adresse"]')).toHaveCount(0);
  await expect(aide.locator('[data-role="aide-adresse-absente"]')).toHaveText('L’administrateur de la plateforme te donne cette adresse.'); // pas de bouton « Afficher… » pour ce compte
  await expect(aide).not.toContainText('Afficher l’adresse');
  await expect(carte.getByRole('button', { name: 'Afficher l’adresse des réponses' })).toHaveCount(0);
});
