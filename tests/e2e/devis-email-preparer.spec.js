// « Préparer l'e-mail » d'un devis : l'UNIQUE entrée e-mail du menu « Envoyer » (depuis le 27/10/2026 : plus de brouillon Gmail créé par le navigateur) ; grisée, avec la raison, si le serveur dit « pas branché » ;
// un clic -> confirmation courte -> la fonction du serveur demande à un workflow n8n de créer un BROUILLON dans le Gmail du compte -> toast ; le résultat se lit dans l'Historique.
// Le serveur est SIMULÉ (page.route sur devisPreparerEmail et devisPreparerEmailEtat) : on vérifie ce que l'appli demande et ce qu'elle affiche, pas n8n ni Gmail.
// Un test par critère (le nom commence par le numéro du critère). Captures dans tests/e2e/captures/devis-email-preparer/ (ordinateur ET téléphone).
// Ces parcours ne sont pas lançables dans le cloud (pas de navigateur) : ils sont écrits pour la suite de la PR sur GitHub.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, lireDocument, creerPersonne, creerAffaire, estTelephone, JEROME } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-email-preparer/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' };
const NUMERO = 'DEV-2026-10-25-001';
const MESSAGE_CONFIRMATION = 'Le brouillon sera créé dans ton Gmail avec le PDF. Rien n’est envoyé.';
const MESSAGE_TOAST = 'Demande envoyée : le brouillon apparaît dans ton Gmail dans quelques instants';
const boite = (page) => page.locator('.dialogue-preparer-email');
const confirmer = (page) => boite(page).locator('[data-action="confirmer-preparer-email"], [data-action="reessayer-preparer-email"]');
const historique = (page) => page.locator('[data-zone="historique"]');

const LIGNES = [{ id: 'l1', libelle: 'Carrelage', familleId: 'famille-1', type: 'fourniture', quantite: 10, unite: 'm²', prixAchat: 40, prixVente: 60, tauxTva: 20 }];
async function semer(id, valeurs = {}) {
  const maintenant = new Date();
  await creerPersonne('p1', { nom: 'Marie Durand' });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', personneId: 'p1' });
  await ecrireDocument(`devis_devis/${id}`, {
    racineId: id, version: 1, numero: NUMERO, statut: 'en_attente_envoi', finaliseLe: maintenant, affaireId: 'a1', personneId: 'p1', organisationId: null,
    modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20, regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: '2026-12-31',
    objet: 'Rénovation restaurant', destinataires: ['marie@exemple.fr'], copie: [], sections: [{ id: 's1', titre: 'Cuisine', lignes: LIGNES }],
    pdf: { statut: 'ok', chemin: 'devis/a1/d.pdf', nom: 'Devis.pdf', tentatives: 1 },
    creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, ...valeurs,
  });
}

/**
 * Faux serveur. `etat.branche` : réponse de devisPreparerEmailEtat (true | false | 'absente' = la fonction n'existe pas). `etat.reponses` : une réponse par appel de devisPreparerEmail
 * ({ ok: true } ou { erreur: 'message' }) ; `etat.delaiMs` : attente avant de répondre (pour voir le bouton grisé). `etat.appels` garde chaque demande reçue.
 * Les fonctions qui ENVOIENT ou changent le statut (devisChangerStatut, devisEnregistrerEnvoi) enregistrent leur appel : « Préparer » ne doit jamais les appeler.
 */
async function simulerServeur(page, etat = {}) {
  etat.appels = [];
  etat.autres = [];
  etat.reponses ??= [{ ok: true }];
  await page.route('**/devisPreparerEmailEtat', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (etat.branche === 'absente') return route.fulfill({ status: 404, headers: cors, body: JSON.stringify({ error: { status: 'NOT_FOUND', message: 'not found' } }) });
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { branche: etat.branche !== false } }) });
  });
  await page.route('**/devisPreparerEmail', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    etat.appels.push(JSON.parse(route.request().postData()).data);
    if (etat.delaiMs) await new Promise((r) => setTimeout(r, etat.delaiMs));
    const r = etat.reponses[Math.min(etat.appels.length - 1, etat.reponses.length - 1)];
    if (r.erreur) return route.fulfill({ status: 412, headers: cors, body: JSON.stringify({ error: { status: 'FAILED_PRECONDITION', message: r.erreur } }) });
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ok: true, demandeId: 'dem_essai' } }) });
  });
  for (const nom of ['devisChangerStatut', 'devisEnregistrerEnvoi']) {
    await page.route(`**/${nom}`, async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      etat.autres.push(nom);
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ok: true } }) });
    });
  }
  return etat;
}
const dejaConnectees = new WeakSet();
/** Ouvre le devis dans l'éditeur. La connexion n'a lieu qu'une fois par page ; les ouvertures suivantes rechargent l'appli (le serveur est donc interrogé de nouveau : « branché ? »). */
async function ouvrirEditeur(page, id) {
  if (dejaConnectees.has(page)) {
    await page.goto(`/?emulateurs=1#/devis/editeur/${id}`);
    await page.reload();
  } else {
    await connecter(page, undefined, { route: `devis/editeur/${id}` });
    dejaConnectees.add(page);
  }
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
}
const ouvrirMenuEnvoyer = async (page) => { await page.locator('[data-action="envoyer"]:visible').first().click(); await expect(page.locator('.menu-pop')).toBeVisible(); };
const entree = (page) => page.locator('.menu-pop').getByRole('menuitem', { name: 'Préparer l’e-mail' });
/** Ouvre le panneau Historique du devis affiché : bouton de la barre sur ordinateur, menu « … » sur téléphone. */
async function ouvrirHistorique(page) {
  if ((page.viewportSize()?.width || 1440) < 768) { await page.locator('[data-action="plus-actions"]').click(); await page.getByRole('menuitem', { name: 'Historique' }).click(); } else await page.locator('[data-action="historique"]').click();
  await expect(historique(page)).toBeVisible();
}

test('1 pas branché : le menu « Envoyer » garde « Préparer l’e-mail », grisée et avec la raison « pas encore branchée » (aussi quand la fonction n’existe pas encore) ; aucune autre entrée e-mail', async ({ page }, info) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'la fonction peut répondre « introuvable » quand rien n’est déployé' });
  for (const branche of [false, 'absente']) {
    await semer('dPas');
    await simulerServeur(page, { branche });
    await ouvrirEditeur(page, 'dPas');
    await ouvrirMenuEnvoyer(page);
    await expect(page.locator('.menu-pop').getByRole('menuitem', { name: 'Envoyer par e-mail' })).toHaveCount(0);
    await expect(page.locator('.menu-pop [role="menuitem"]')).toHaveCount(1);
    await expect.poll(async () => entree(page).isDisabled(), { message: 'grisée dès que le serveur a répondu « pas branché »' }).toBe(true);
    await expect(entree(page)).toHaveAttribute('title', /pas encore branchée/);
    if (branche === false) await capturer(page, info, '1-pas-branche');
    await page.keyboard.press('Escape');
    await page.unroute('**/devisPreparerEmailEtat');
    await page.unroute('**/devisPreparerEmail');
  }
});

test('2 branché : « Préparer l’e-mail » est active et seule dans le menu « Envoyer » (PDF et impression sont dans « … ») ; un clic ouvre la confirmation courte ; « Annuler » ne demande rien', async ({ page }, info) => {
  await semer('dOui');
  const serveur = await simulerServeur(page, { branche: true });
  await ouvrirEditeur(page, 'dOui');
  await ouvrirMenuEnvoyer(page);
  const noms = await page.locator('.menu-pop [role="menuitem"]').allTextContents();
  expect(noms.map((n) => n.trim()), 'le menu Envoyer ne propose que « Préparer l’e-mail »').toEqual(['Préparer l’e-mail']);
  await expect(entree(page)).toBeEnabled();
  if (estTelephone(page)) expect((await entree(page).boundingBox()).height).toBeGreaterThanOrEqual(44);
  await capturer(page, info, '2-menu');
  await entree(page).click();
  await expect(boite(page).getByRole('heading', { name: 'Préparer l’e-mail' })).toBeVisible();
  await expect(boite(page).locator('[data-valeur="confirmation-preparer-email"]')).toHaveText(MESSAGE_CONFIRMATION);
  if (estTelephone(page)) for (const b of await boite(page).locator('.dialogue-pied .bouton').all()) await expect.poll(async () => (await b.boundingBox()).height, { message: 'boutons assez grands au doigt (la fenêtre finit son animation d’ouverture)' }).toBeGreaterThanOrEqual(43.9);
  await capturer(page, info, '2-confirmation');
  await boite(page).locator('[data-action="annuler-preparer-email"]').click();
  await expect(boite(page)).toHaveCount(0);
  expect(serveur.appels).toEqual([]);
});

test('3 confirmer : UN appel { devisId }, bouton grisé pendant l’appel, puis le toast « Demande envoyée… » ; le devis garde son statut et rien n’est marqué « envoyé »', async ({ page }, info) => {
  await semer('dAppel');
  const serveur = await simulerServeur(page, { branche: true, delaiMs: 1200 });
  await ouvrirEditeur(page, 'dAppel');
  await ouvrirMenuEnvoyer(page);
  await entree(page).click();
  await confirmer(page).click();
  await expect(confirmer(page)).toBeDisabled();
  await expect(boite(page).locator('[data-action="annuler-preparer-email"]')).toBeDisabled();
  await expect(boite(page).locator('[data-zone="etat-preparer-email"]')).toBeVisible();
  await capturer(page, info, '3-en-cours');
  await page.keyboard.press('Escape');
  await expect(boite(page), 'Échap ne ferme pas la fenêtre pendant l’appel').toBeVisible();
  await expect(boite(page)).toHaveCount(0, { timeout: 10_000 });
  await expect(page.locator('#toasts')).toContainText(MESSAGE_TOAST);
  expect(serveur.appels).toEqual([{ devisId: 'dAppel' }]);
  expect(serveur.autres, 'ni changement de statut, ni historique d’envoi').toEqual([]);
  expect((await lireDocument('devis_devis/dAppel')).statut).toBe('en_attente_envoi');
  await capturer(page, info, '3-toast');
});

test('4 erreur du serveur : le message reste affiché dans la fenêtre avec « Réessayer » ; le bouton redevient actif ; « Réessayer » repart et réussit', async ({ page }, info) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'le faux serveur répond 412 au premier essai' });
  await semer('dErreur');
  const serveur = await simulerServeur(page, { branche: true, reponses: [{ erreur: 'Une préparation est déjà en cours pour ce devis : patiente quelques instants (3 minutes au plus), puis réessaie.' }, { ok: true }] });
  await ouvrirEditeur(page, 'dErreur');
  await ouvrirMenuEnvoyer(page);
  await entree(page).click();
  await confirmer(page).click();
  const erreur = boite(page).locator('[data-zone="erreur-preparer-email"]');
  await expect(erreur).toContainText('Une préparation est déjà en cours');
  await expect(confirmer(page)).toHaveText('Réessayer');
  await expect(confirmer(page)).toBeEnabled();
  await expect(page.getByText(MESSAGE_TOAST)).toHaveCount(0);
  await capturer(page, info, '4-erreur');
  await confirmer(page).click();
  await expect(boite(page)).toHaveCount(0);
  await expect(page.locator('#toasts')).toContainText(MESSAGE_TOAST);
  expect(serveur.appels).toHaveLength(2);
});

test('5 cas particuliers : un brouillon propose « Finaliser d’abord » ; un devis sans destinataire dit quoi faire ; aucun appel dans les deux cas', async ({ page }, info) => {
  await semer('dBrouillon', { statut: 'brouillon', numero: null, finaliseLe: null, pdf: null });
  let serveur = await simulerServeur(page, { branche: true });
  await ouvrirEditeur(page, 'dBrouillon');
  await expect(page.locator('[data-action="envoyer"]')).toHaveAttribute('aria-disabled', 'true'); // brouillon : « Envoyer » est grisé, l'e-mail se trouve dans « … »
  await page.locator('[data-action="plus-actions"]').click();
  await expect(page.locator('.menu-pop')).toBeVisible();
  await entree(page).click();
  const dlg = page.locator('.dialogue').filter({ hasText: 'Finaliser d’abord' });
  await expect(dlg.locator('[data-valeur="finaliser-d-abord"]')).toContainText('encore un brouillon');
  await expect(boite(page)).toHaveCount(0);
  await capturer(page, info, '5-brouillon');
  expect(serveur.appels).toEqual([]);
  await page.keyboard.press('Escape');
  await page.unroute('**/devisPreparerEmailEtat');
  await page.unroute('**/devisPreparerEmail');
  await semer('dSans', { destinataires: [] });
  serveur = await simulerServeur(page, { branche: true });
  await ouvrirEditeur(page, 'dSans');
  await ouvrirMenuEnvoyer(page);
  await entree(page).click();
  await expect(page.locator('.dialogue [data-valeur="sans-destinataire"]')).toContainText('n’a pas de destinataire');
  await capturer(page, info, '5-sans-destinataire');
  expect(serveur.appels).toEqual([]);
});

test('6 l’Historique du devis : « E-mail préparé dans Gmail le … » une fois que le serveur a écrit emailPrepare ; l’échec est dit sans être un envoi ; rien tant qu’il n’y a rien', async ({ page }, info) => {
  const prepare = (quand, statut) => ({ emailPrepare: { le: new Date(quand), demandeId: 'dem_essai', canal: 'n8n', statut } });
  await simulerServeur(page, { branche: true });
  // rien à montrer
  await semer('dHistoRien');
  await ouvrirEditeur(page, 'dHistoRien');
  await ouvrirHistorique(page);
  await expect(historique(page).locator('[data-valeur="email-prepare"]')).toHaveCount(0);
  await expect(historique(page).locator('[data-valeur="aucun-envoi"]')).toHaveText('Pas encore envoyé');
  // le serveur (n8n, par la porte) a écrit « ok »
  await semer('dHistoOk', prepare('2026-10-25T08:30:00Z', 'ok'));
  await ouvrirEditeur(page, 'dHistoOk');
  await ouvrirHistorique(page);
  await expect(historique(page).locator('[data-valeur="email-prepare"]')).toHaveText('E-mail préparé dans Gmail le 25/10/2026 (09 h 30)');
  await expect(historique(page).locator('[data-valeur="aucun-envoi"]'), 'ce n’est pas un envoi').toHaveText('Pas encore envoyé');
  await capturer(page, info, '6-historique-ok');
  // ... ou « echec »
  await semer('dHistoEchec', prepare('2026-10-25T08:40:00Z', 'echec'));
  await ouvrirEditeur(page, 'dHistoEchec');
  await ouvrirHistorique(page);
  await expect(historique(page).locator('[data-valeur="email-prepare"]')).toHaveText('La préparation de l’e-mail a échoué le 25/10/2026 (09 h 40). Tu peux réessayer.');
  await capturer(page, info, '6-historique-echec');
});
