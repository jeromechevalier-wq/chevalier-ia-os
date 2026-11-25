// Réglages > « Connexion à la base » (24/11/2026, modules Achats, PR 2) : un test par critère (le nom commence par son numéro).
//  E1 la section n'existe que pour Jérôme, à la racine ; E2 cas vide ; E3 cas d'erreur (adresse non https : rien n'est écrit) ; E4 enregistrement (tout hôte nouveau ou changé demande confirmation, premier enregistrement compris) ;
//  E5 « Tester la connexion » : essaie les valeurs SAISIES par la vraie couche d'accès (js/os/acces-base.js) avec un faux réseau et un badge simulés (crochet `window.__accesBase`, émulateurs seulement : aucun appel réseau réel) ; E6 « Donner l'accès à un compte » (fonction du serveur simulée) ; E7 pas de défilement horizontal.
// Captures dans tests/e2e/captures/base-reglages/ (non commitées), une par état, nommée avec le projet : ordinateur ou telephone.
// Adresses : construites dans le test (aucune adresse d'exemple n'est écrite dans le code de l'appli).
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, lireDocument, ouvrirSectionReglages, allerA, CHARLES } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/base-reglages/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' });
}
const sansDefilementHorizontal = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const https = (hote, chemin = '') => `${['https', ''].join(':')}//${hote}${chemin}`;
const FICHE = () => ({
  adresseBase: https('base.exemple.test'), clePublique: 'cle-publique-fictive', espace: 'espace-essai',
  webhooks: { validation: https('auto.exemple.test', '/a'), actions: https('auto.exemple.test', '/b'), suggestions: https('auto.exemple.test', '/c'), ajoutFacture: https('auto.exemple.test', '/d') },
});

// La fonction du serveur n'est pas dans l'émulateur de ces parcours : sa réponse est simulée (protocole « callable », préparation CORS comprise) ; les appels reçus sont gardés.
async function simulerAcces(page, { refuser = false } = {}) {
  const appels = [];
  await page.route('**/baseAccorderAcces', (route) => {
    const entetes = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: entetes });
    appels.push(route.request().postDataJSON()?.data);
    if (refuser) return route.fulfill({ status: 403, headers: entetes, contentType: 'application/json', body: JSON.stringify({ error: { status: 'PERMISSION_DENIED', message: 'Ce compte ne peut pas donner cet accès.' } }) });
    return route.fulfill({ status: 200, headers: entetes, contentType: 'application/json', body: JSON.stringify({ result: { ok: true, effetAu: 'dans l\'heure au plus' } }) });
  });
  return appels;
}
async function ouvrirSection(page, email) {
  await connecter(page, email, { route: 'reglages' });
  await attendreCalme(page);
}
const formulaire = (page) => page.locator('[data-role="base-formulaire"]');

test('E1 Jérôme voit « Connexion à la base » dans les réglages ; le compte du bot ne la voit pas et son adresse reste introuvable', async ({ page }) => {
  await ouvrirSection(page);
  await ouvrirSectionReglages(page, 'Connexion à la base');
  await expect(page).toHaveURL(/#\/reglages\/base$/);
  await expect(page.locator('#reglages-base h2')).toHaveText('Connexion à la base');
});

test('E1 le compte du bot : pas d\'entrée dans le menu, et l\'adresse directe le ramène aux réglages', async ({ page }) => {
  await connecter(page, CHARLES, { route: 'reglages/base' });
  await attendreCalme(page);
  await expect(page.locator('.reglages-menu-lien[data-reglage="base"]')).toHaveCount(0);
  await expect(page.locator('#reglages-base')).toHaveCount(0);
  await expect(page).toHaveURL(/#\/reglages$/);
});

test('E2 cas vide : « Connexion à la base non réglée », les champs sont vides, les adresses d\'automatisations aussi', async ({ page }, info) => {
  await connecter(page, undefined, { route: 'reglages/base' });
  await attendreCalme(page);
  await expect(page.locator('[data-role="base-vide"]')).toContainText('Connexion à la base non réglée');
  for (const c of ['adresseBase', 'clePublique', 'espace', 'webhooks.validation', 'webhooks.actions', 'webhooks.suggestions', 'webhooks.ajoutFacture']) await expect(page.locator(`[data-champ="${c}"]`)).toHaveValue('');
  await capturer(page, info, 'E2-vide');
});

test('E3 cas d\'erreur : adresse en http, clé vide, espace en majuscules : les champs sont signalés et RIEN n\'est écrit', async ({ page }, info) => {
  await connecter(page, undefined, { route: 'reglages/base' });
  await attendreCalme(page);
  await page.locator('[data-champ="adresseBase"]').fill('http://base.exemple.test');
  await page.locator('[data-champ="espace"]').fill('Espace');
  await page.locator('[data-champ="webhooks.actions"]').fill('pas une adresse');
  await page.locator('[data-action="enregistrer"]').click();
  await expect(page.locator('[data-erreur-de="base-adresseBase"]')).toContainText('https');
  await expect(page.locator('[data-erreur-de="base-clePublique"]')).toBeVisible();
  await expect(page.locator('[data-erreur-de="base-espace"]')).toBeVisible();
  await expect(page.locator('[data-erreur-de="base-webhooks-actions"]')).toBeVisible();
  await expect(page.locator('[data-role="base-message"]')).toHaveText('Des champs sont à corriger.');
  expect(await lireDocument('base_parametres/connexion')).toBeFalsy();
  await capturer(page, info, 'E3-erreurs');
});

test('E4 enregistrer : le document est écrit (champs, auteur, date), le message le dit, et le recharger remet les mêmes valeurs', async ({ page }, info) => {
  const f = FICHE();
  await connecter(page, undefined, { route: 'reglages/base' });
  await attendreCalme(page);
  await page.locator('[data-champ="adresseBase"]').fill(f.adresseBase);
  await page.locator('[data-champ="clePublique"]').fill(f.clePublique);
  await page.locator('[data-champ="espace"]').fill(f.espace);
  for (const n of Object.keys(f.webhooks)) await page.locator(`[data-champ="webhooks.${n}"]`).fill(f.webhooks[n]);
  await page.locator('[data-action="enregistrer"]').click();
  // Premier enregistrement : la base et les automatisations saisies sont de nouveaux hôtes (le badge et les tickets partent vers eux) : confirmation demandée.
  const premiere = page.getByRole('dialog');
  await expect(premiere).toContainText('base.exemple.test');
  await expect(premiere).toContainText('auto.exemple.test');
  await premiere.getByRole('button', { name: 'Continuer' }).click();
  await expect(page.locator('[data-role="base-message"]')).toHaveText('Réglages enregistrés.');
  await expect.poll(() => lireDocument('base_parametres/connexion'), { timeout: 10_000 }).toBeTruthy();
  const d = await lireDocument('base_parametres/connexion');
  expect(d.adresseBase).toBe(f.adresseBase);
  expect(d.clePublique).toBe(f.clePublique);
  expect(d.espace).toBe(f.espace);
  expect(d.webhooks).toEqual(f.webhooks);
  expect(d.modifiePar).toBe('jerome.chevalier@gmail.com');
  expect(d.modifieLe).toBeTruthy();
  await capturer(page, info, 'E4-enregistre');
  await page.reload();
  await attendreCalme(page);
  await expect(page.locator('[data-champ="adresseBase"]')).toHaveValue(f.adresseBase);
  await expect(page.locator('[data-champ="webhooks.ajoutFacture"]')).toHaveValue(f.webhooks.ajoutFacture);
  await expect(page.locator('[data-role="base-vide"]')).toHaveCount(0);
});

test('E4 un hôte (nom ou port) qui change : la fenêtre montre l\'ancien et le nouvel hôte ; « Annuler » n\'écrit rien, « Continuer » enregistre ; un même hôte (autre chemin) ne demande rien', async ({ page }, info) => {
  const f = FICHE();
  await ecrireDocument('base_parametres/connexion', f);
  await connecter(page, undefined, { route: 'reglages/base' });
  await attendreCalme(page);
  const message = page.locator('[data-role="base-message"]');
  await page.locator('[data-champ="adresseBase"]').fill(https('base.exemple.test', '/autre-chemin'));
  await page.locator('[data-action="enregistrer"]').click();
  await expect(message).toHaveText('Réglages enregistrés.');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('[data-champ="adresseBase"]').fill(https('autre-base.exemple.test'));
  await page.locator('[data-action="enregistrer"]').click();
  const dialogue = page.getByRole('dialog');
  await expect(dialogue).toContainText('base.exemple.test');
  await expect(dialogue).toContainText('autre-base.exemple.test');
  await capturer(page, info, 'E4-hote-change');
  await dialogue.getByRole('button', { name: 'Annuler' }).click();
  expect((await lireDocument('base_parametres/connexion')).adresseBase).toBe(https('base.exemple.test', '/autre-chemin'));
  await page.locator('[data-action="enregistrer"]').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Continuer' }).click();
  await expect.poll(async () => (await lireDocument('base_parametres/connexion')).adresseBase, { timeout: 10_000 }).toBe(https('autre-base.exemple.test'));
});

// Faux réseau et badge simulés (crochet d'émulateurs) : la VRAIE couche d'accès tourne, aucun appel réseau réel. `window.__appelsBase` garde ce qui serait parti.
async function simulerBase(page, { claims = { role: 'authenticated', espace_base: 'espace-essai' } } = {}) {
  await page.addInitScript((c) => {
    window.__appelsBase = [];
    window.__accesBase = {
      jeton: 'jeton-fictif',
      claims: c,
      fetchImpl: async (url, options) => {
        window.__appelsBase.push({ url: String(url), autorisation: options?.headers?.Authorization, methode: options?.method });
        return window.__reponseReseau ? window.__reponseReseau() : new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
      },
    };
  }, claims);
}

test('E5 « Tester la connexion » : la vraie couche d\'accès appelle la base avec le badge ; un refus de la base dit « Reconnecte-toi » ; des champs faux sont refusés avant tout appel', async ({ page }, info) => {
  await ecrireDocument('base_parametres/connexion', FICHE());
  await simulerBase(page);
  await connecter(page, undefined, { route: 'reglages/base' });
  await attendreCalme(page);
  const resultat = page.locator('[data-role="base-test"]');
  await page.locator('[data-action="tester"]').click();
  await expect(resultat).toHaveText('Ça marche : la base répond et ton accès est bon.');
  await expect(resultat).toHaveAttribute('data-etat', 'ok');
  const appels = await page.evaluate(() => window.__appelsBase);
  expect(appels).toHaveLength(1);
  expect(appels[0].url).toBe(https('base.exemple.test', '/rest/v1/rpc/lister_favoris_os'));
  expect(appels[0].autorisation).toBe('Bearer jeton-fictif');
  await capturer(page, info, 'E5-test-ok');
  await page.evaluate(() => { window.__reponseReseau = () => new Response('{}', { status: 403, headers: { 'Content-Type': 'application/json' } }); });
  await page.locator('[data-action="tester"]').click();
  await expect(resultat).toContainText('Reconnecte-toi');
  await expect(resultat).toHaveAttribute('data-etat', 'erreur');
  await capturer(page, info, 'E5-test-erreur');
  await page.locator('[data-champ="adresseBase"]').fill('http://base.exemple.test');
  const avant = (await page.evaluate(() => window.__appelsBase)).length;
  await page.locator('[data-action="tester"]').click();
  await expect(resultat).toContainText('Corrige d’abord');
  expect(await page.evaluate(() => window.__appelsBase.length)).toBe(avant);
});

test('E5 le test essaie les valeurs SAISIES (pas celles déjà enregistrées) : le nouvel hôte demande confirmation, puis l\'appel part vers lui ; rien n\'est enregistré', async ({ page }) => {
  await ecrireDocument('base_parametres/connexion', FICHE());
  await simulerBase(page, { claims: { role: 'authenticated', espace_base: 'autre-espace' } });
  await connecter(page, undefined, { route: 'reglages/base' });
  await attendreCalme(page);
  await page.locator('[data-champ="adresseBase"]').fill(https('autre-base.exemple.test'));
  await page.locator('[data-champ="espace"]').fill('autre-espace'); // le badge simulé porte cet espace : seules les valeurs saisies peuvent réussir
  await page.locator('[data-action="tester"]').click();
  await expect(page.getByRole('dialog')).toContainText('autre-base.exemple.test');
  await page.getByRole('dialog').getByRole('button', { name: 'Continuer' }).click();
  await expect(page.locator('[data-role="base-test"]')).toHaveAttribute('data-etat', 'ok');
  expect((await page.evaluate(() => window.__appelsBase))[0].url).toBe(https('autre-base.exemple.test', '/rest/v1/rpc/lister_favoris_os'));
  const d = await lireDocument('base_parametres/connexion');
  expect(d.adresseBase).toBe(https('base.exemple.test'));
  expect(d.espace).toBe('espace-essai');
});

test('E5 sans crochet de test (mode émulateurs) : aucun appel réseau réel, le bouton le dit en clair', async ({ page }) => {
  await ecrireDocument('base_parametres/connexion', FICHE());
  await connecter(page, undefined, { route: 'reglages/base' });
  await attendreCalme(page);
  await page.locator('[data-action="tester"]').click();
  await expect(page.locator('[data-role="base-test"]')).toContainText('Mode test : aucun appel réseau réel');
  await expect(page.locator('[data-role="base-test"]')).toHaveAttribute('data-etat', 'erreur');
});

test('E5 le badge simulé sans la mention d\'accès donne « Reconnecte-toi », sans aucun appel à la base', async ({ page }) => {
  await ecrireDocument('base_parametres/connexion', FICHE());
  await simulerBase(page, { claims: {} });
  await connecter(page, undefined, { route: 'reglages/base' });
  await attendreCalme(page);
  await page.locator('[data-action="tester"]').click();
  await expect(page.locator('[data-role="base-test"]')).toContainText('Reconnecte-toi');
  expect(await page.evaluate(() => window.__appelsBase.length)).toBe(0);
});

test('E6 « Donner l\'accès à un compte » : le serveur reçoit l\'e-mail et l\'espace, la réponse dit « dans l\'heure au plus » ; « Retirer » demande confirmation', async ({ page }, info) => {
  await ecrireDocument('base_parametres/connexion', FICHE());
  const appels = await simulerAcces(page);
  await connecter(page, undefined, { route: 'reglages/base' });
  await attendreCalme(page);
  await expect(page.locator('[data-champ="acces-espace"]')).toHaveValue('espace-essai'); // pré-rempli avec l'espace réglé
  await page.locator('[data-champ="acces-email"]').fill('Personne@Exemple.test');
  await page.locator('[data-action="donner-acces"]').click();
  const message = page.locator('[data-role="acces-message"]');
  await expect(message).toContainText('dans l’heure au plus');
  await expect(message).toContainText('reconnecter');
  expect(appels).toEqual([{ email: 'personne@exemple.test', espace: 'espace-essai' }]);
  await capturer(page, info, 'E6-acces-donne');
  await page.locator('[data-action="retirer-acces"]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await expect(page.getByRole('dialog')).toContainText('ne pourra plus lire la base');
  await expect(page.getByRole('dialog')).not.toContainText('espace-essai'); // le serveur retire l'accès quel que soit l'espace : la phrase ne doit pas laisser croire le contraire
  await page.getByRole('dialog').getByRole('button', { name: 'Retirer' }).click();
  await expect(message).toContainText('le retrait prend effet dans l’heure au plus');
  expect(appels[1]).toEqual({ email: 'personne@exemple.test', espace: 'espace-essai', retirer: true });
});

test('E6 cas d\'erreur : e-mail faux = rien n\'est envoyé ; refus du serveur = son message, lisible', async ({ page }, info) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'le refus 403 du serveur est simulé' });
  await ecrireDocument('base_parametres/connexion', FICHE());
  const appels = await simulerAcces(page, { refuser: true });
  await connecter(page, undefined, { route: 'reglages/base' });
  await attendreCalme(page);
  await page.locator('[data-champ="acces-email"]').fill('pas-un-email');
  await page.locator('[data-action="donner-acces"]').click();
  await expect(page.locator('[data-erreur-de="base-acces-email"]')).toBeVisible();
  expect(appels).toEqual([]);
  await page.locator('[data-champ="acces-email"]').fill('personne@exemple.test');
  await page.locator('[data-action="donner-acces"]').click();
  await expect(page.locator('[data-role="acces-message"]')).toHaveText('Ce compte ne peut pas donner cet accès.');
  await expect(page.locator('[data-role="acces-message"]')).toHaveAttribute('data-etat', 'erreur');
  await capturer(page, info, 'E6-acces-refuse');
});

test('E7 l\'écran tient sans défilement horizontal de la page (champs et boutons dans la largeur)', async ({ page }) => {
  await ecrireDocument('base_parametres/connexion', { ...FICHE(), adresseBase: https('base.exemple.test', `/${'a'.repeat(200)}`) });
  await connecter(page, undefined, { route: 'reglages/base' });
  await attendreCalme(page);
  expect(await sansDefilementHorizontal(page)).toBe(true);
});
