// « Préparer l'e-mail » d'un devis : l'UNIQUE entrée e-mail du menu « Envoyer » (depuis le 27/10/2026 : plus de brouillon Gmail créé par le navigateur) ; grisée, avec la raison, si le serveur dit « pas branché » ;
// un clic -> UNE fenêtre à quatre champs préremplis (Destinataires, Copie, Objet, Message ; 01/11/2026) -> la fonction du serveur demande à un workflow n8n de créer un BROUILLON dans le Gmail du compte -> toast ; le résultat se lit dans l'Historique.
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
const confirmer = (page) => boite(page).locator('[data-action="confirmer-preparer-email"]');
const champ = (page, nom) => boite(page).locator(`[data-champ="${nom}-preparer-email"]`);
const erreurChamp = (page, nom) => boite(page).locator(`[data-zone="erreur-${nom}-preparer-email"]`);
const OBJET_ATTENDU = `Devis ${NUMERO} – Rénovation restaurant`;
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

test('1 pas branché : le menu « Envoyer » garde « Préparer l’e-mail » en tête, grisée et avec la raison « pas encore branchée » (aussi quand la fonction n’existe pas encore) ; aucune autre entrée e-mail', async ({ page }, info) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'la fonction peut répondre « introuvable » quand rien n’est déployé' });
  for (const branche of [false, 'absente']) {
    await semer('dPas');
    await simulerServeur(page, { branche });
    await ouvrirEditeur(page, 'dPas');
    await ouvrirMenuEnvoyer(page);
    await expect(page.locator('.menu-pop').getByRole('menuitem', { name: 'Envoyer par e-mail' })).toHaveCount(0);
    await expect(page.locator('.menu-pop [role="menuitem"]')).toHaveText([/Préparer l’e-mail/, /Télécharger le PDF/, /Imprimer/]);
    await expect.poll(async () => entree(page).isDisabled(), { message: 'grisée dès que le serveur a répondu « pas branché »' }).toBe(true);
    await expect(entree(page)).toHaveAttribute('title', /pas encore branchée/);
    await expect(page.locator('.menu-pop [data-zone="menu-texte"]')).toBeVisible(); // la phrase est AFFICHÉE sous l'entrée (téléphone compris : pas d'infobulle au doigt)
    await expect(page.locator('.menu-pop [data-zone="menu-texte"]')).toContainText('pas encore branchée');
    if (branche === false) await capturer(page, info, '1-pas-branche');
    await page.keyboard.press('Escape');
    await page.unroute('**/devisPreparerEmailEtat');
    await page.unroute('**/devisPreparerEmail');
  }
});

test('2 branché : « Préparer l’e-mail » est active et en tête du menu « Envoyer » ; un clic ouvre la fenêtre à quatre champs préremplis (adresses du devis, objet et message standard remplis) ; « Annuler » ne demande rien', async ({ page }, info) => {
  await semer('dOui');
  const serveur = await simulerServeur(page, { branche: true });
  await ouvrirEditeur(page, 'dOui');
  await ouvrirMenuEnvoyer(page);
  const noms = await page.locator('.menu-pop [role="menuitem"]').allTextContents();
  expect(noms.map((n) => n.trim()), 'le menu Envoyer : « Préparer l’e-mail » en tête, puis PDF et impression').toEqual(['Préparer l’e-mail', 'Télécharger le PDF', 'Imprimer']);
  await expect(entree(page)).toBeEnabled();
  if (estTelephone(page)) expect((await entree(page).boundingBox()).height).toBeGreaterThanOrEqual(44);
  await capturer(page, info, '2-menu');
  await entree(page).click();
  await expect(boite(page).getByRole('heading', { name: 'Préparer l’e-mail' })).toBeVisible();
  await expect(boite(page).locator('[data-valeur="confirmation-preparer-email"]')).toHaveText(MESSAGE_CONFIRMATION);
  await expect(boite(page).locator('[data-zone="liste-destinataires"] [data-adresse]')).toHaveText(['marie@exemple.fr']);
  await expect(boite(page).locator('[data-zone="liste-copie"] [data-adresse]')).toHaveCount(0); // copie vide par défaut
  await expect(champ(page, 'objet')).toHaveValue(OBJET_ATTENDU);
  const message = await champ(page, 'message').inputValue();
  expect(message).toBe(`Bonjour Marie Durand,\n\nVeuillez trouver ci-joint notre devis ${NUMERO} – Rénovation restaurant.\n\nIl reste valable pour la durée indiquée sur le document. N’hésitez pas à me contacter pour toute question ou pour l’adapter.\n\nBien cordialement`);
  await expect(confirmer(page)).toHaveText('Préparer le brouillon Gmail');
  await expect(confirmer(page)).toBeEnabled();
  if (estTelephone(page)) { // plein écran, champs l'un sous l'autre
    const vue = page.viewportSize();
    const dlg = await boite(page).boundingBox();
    expect(dlg.width).toBeGreaterThanOrEqual(vue.width - 2);
    const y = async (n) => (await champ(page, n).boundingBox()).y;
    expect(await y('objet')).toBeGreaterThan(await y('destinataires'));
    expect(await y('message')).toBeGreaterThan(await y('objet'));
    for (const b of await boite(page).locator('.dialogue-pied .bouton').all()) await expect.poll(async () => (await b.boundingBox()).height, { message: 'boutons assez grands au doigt' }).toBeGreaterThanOrEqual(44);
  }
  await capturer(page, info, '2-fenetre');
  await boite(page).locator('[data-action="annuler-preparer-email"]').click();
  await expect(boite(page)).toHaveCount(0);
  expect(serveur.appels).toEqual([]);
});

test('3 confirmer sans rien changer : UN appel { devisId } seul (comme avant la fenêtre), bouton grisé pendant l’appel, puis le toast « Demande envoyée… » ; le devis garde son statut et rien n’est marqué « envoyé »', async ({ page }, info) => {
  await semer('dAppel');
  const serveur = await simulerServeur(page, { branche: true, delaiMs: 1200 });
  await ouvrirEditeur(page, 'dAppel');
  await ouvrirMenuEnvoyer(page);
  await entree(page).click();
  await confirmer(page).click();
  await expect(confirmer(page)).toBeDisabled();
  await expect(boite(page).locator('[data-action="annuler-preparer-email"]')).toBeDisabled();
  await expect(champ(page, 'objet')).toBeDisabled();
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

test('4 erreur du serveur : le message reste affiché dans la fenêtre, TOUT le texte saisi reste, le bouton redevient actif ; un second essai repart avec le même texte et réussit', async ({ page }, info) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'le faux serveur répond 412 au premier essai' });
  await semer('dErreur');
  const serveur = await simulerServeur(page, { branche: true, reponses: [{ erreur: 'Une préparation est déjà en cours pour ce devis : patiente quelques instants (3 minutes au plus), puis réessaie.' }, { ok: true }] });
  await ouvrirEditeur(page, 'dErreur');
  await ouvrirMenuEnvoyer(page);
  await entree(page).click();
  await champ(page, 'objet').fill('Mon objet à moi');
  await confirmer(page).click();
  const erreur = boite(page).locator('[data-zone="erreur-preparer-email"]');
  await expect(erreur).toContainText('Une préparation est déjà en cours');
  await expect(champ(page, 'objet')).toHaveValue('Mon objet à moi');
  await expect(confirmer(page)).toBeEnabled();
  await expect(page.getByText(MESSAGE_TOAST)).toHaveCount(0);
  await capturer(page, info, '4-erreur');
  await confirmer(page).click();
  await expect(boite(page)).toHaveCount(0);
  await expect(page.locator('#toasts')).toContainText(MESSAGE_TOAST);
  expect(serveur.appels).toEqual([{ devisId: 'dErreur', objet: 'Mon objet à moi' }, { devisId: 'dErreur', objet: 'Mon objet à moi' }]);
});

test('5 un brouillon propose « Finaliser d’abord » ; aucun appel', async ({ page }, info) => {
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

test('7 modifier les quatre champs : ajouter et retirer un destinataire, ajouter une copie, changer l’objet et le message ; l’appel ne porte que ce qui a changé, et le devis n’est PAS modifié', async ({ page }, info) => {
  await semer('dModif');
  const serveur = await simulerServeur(page, { branche: true });
  await ouvrirEditeur(page, 'dModif');
  await ouvrirMenuEnvoyer(page);
  await entree(page).click();
  await champ(page, 'destinataires').fill('paul@exemple.fr');
  await champ(page, 'destinataires').press('Enter');
  await expect(boite(page).locator('[data-zone="liste-destinataires"] [data-adresse]')).toHaveText(['marie@exemple.fr', 'paul@exemple.fr']);
  await boite(page).getByRole('button', { name: 'Retirer marie@exemple.fr' }).click();
  await expect(boite(page).locator('[data-zone="liste-destinataires"] [data-adresse]')).toHaveText(['paul@exemple.fr']);
  await champ(page, 'copie').fill('compta@exemple.fr');
  await champ(page, 'copie').press('Enter');
  await expect(boite(page).locator('[data-zone="liste-copie"] [data-adresse]')).toHaveText(['compta@exemple.fr']);
  await champ(page, 'objet').fill('Votre devis cuisine');
  await champ(page, 'message').fill('Bonjour Paul,\n\nVoici le devis.');
  await capturer(page, info, '7-modifie');
  await confirmer(page).click();
  await expect(boite(page)).toHaveCount(0);
  expect(serveur.appels).toEqual([{ devisId: 'dModif', destinataires: ['paul@exemple.fr'], copie: ['compta@exemple.fr'], objet: 'Votre devis cuisine', message: 'Bonjour Paul,\n\nVoici le devis.' }]);
  const devis = await lireDocument('devis_devis/dModif');
  expect(devis.destinataires).toEqual(['marie@exemple.fr']);
  expect(devis.copie).toEqual([]);
  expect(serveur.autres).toEqual([]);
});

test('8 cas vide : un devis sans adresse ouvre la fenêtre, le bouton est grisé avec « Ajoute au moins un destinataire » ; il s’active dès qu’une adresse est ajoutée (et une adresse tapée sans Entrée compte)', async ({ page }, info) => {
  await semer('dSans', { destinataires: [] });
  const serveur = await simulerServeur(page, { branche: true });
  await ouvrirEditeur(page, 'dSans');
  await ouvrirMenuEnvoyer(page);
  await entree(page).click();
  await expect(boite(page).locator('[data-zone="aide-destinataires-preparer-email"]')).toHaveText('Ajoute au moins un destinataire');
  await expect(confirmer(page)).toBeDisabled();
  await capturer(page, info, '8-aucun-destinataire');
  await champ(page, 'destinataires').fill('nouveau@exemple.fr');
  await champ(page, 'destinataires').press('Enter');
  await expect(confirmer(page)).toBeEnabled();
  await expect(boite(page).locator('[data-zone="aide-destinataires-preparer-email"]')).toBeHidden();
  await confirmer(page).click();
  await expect(boite(page)).toHaveCount(0);
  expect(serveur.appels).toEqual([{ devisId: 'dSans', destinataires: ['nouveau@exemple.fr'] }]);
  expect((await lireDocument('devis_devis/dSans')).destinataires, 'le devis reste sans destinataire').toEqual([]);
});

test('9 adresse mal écrite : un message court sous le champ, le texte tapé reste, rien n’est ajouté, rien n’est demandé ; doublon et maximum de 10 refusés avec une phrase', async ({ page }, info) => {
  await semer('dMal');
  const serveur = await simulerServeur(page, { branche: true });
  await ouvrirEditeur(page, 'dMal');
  await ouvrirMenuEnvoyer(page);
  await entree(page).click();
  await champ(page, 'destinataires').fill('pas-une-adresse');
  await champ(page, 'destinataires').press('Enter');
  await expect(erreurChamp(page, 'destinataires')).toContainText('n’est pas valide');
  await expect(champ(page, 'destinataires')).toHaveValue('pas-une-adresse');
  await expect(boite(page).locator('[data-zone="liste-destinataires"] [data-adresse]')).toHaveText(['marie@exemple.fr']);
  await capturer(page, info, '9-adresse-mal-ecrite');
  await champ(page, 'destinataires').fill('marie@exemple.fr');
  await champ(page, 'destinataires').press('Enter');
  await expect(erreurChamp(page, 'destinataires')).toContainText('déjà');
  await champ(page, 'destinataires').fill('');
  await expect(erreurChamp(page, 'destinataires')).toBeHidden();
  for (let i = 1; i < 10; i += 1) { await champ(page, 'copie').fill(`copie${i}@exemple.fr`); await champ(page, 'copie').press('Enter'); }
  await expect(boite(page).locator('[data-zone="liste-copie"] [data-adresse]')).toHaveCount(9);
  await champ(page, 'copie').fill('copie10@exemple.fr');
  await champ(page, 'copie').press('Enter');
  await expect(boite(page).locator('[data-zone="maximum-copie"]')).toHaveText('10 adresses : c’est le maximum.');
  await expect(champ(page, 'copie')).toBeHidden();
  await capturer(page, info, '9-maximum');
  expect(serveur.appels).toEqual([]);
});

test('10 Échap ferme la fenêtre sans rien demander et rend le focus au menu ; la fenêtre met le focus dans le premier champ utile', async ({ page }) => {
  await semer('dEchap');
  const serveur = await simulerServeur(page, { branche: true });
  await ouvrirEditeur(page, 'dEchap');
  await ouvrirMenuEnvoyer(page);
  await entree(page).click();
  await expect(champ(page, 'objet')).toBeFocused(); // l'adresse du devis est déjà là : on va droit à l'objet
  await champ(page, 'message').fill('Un texte que je ne veux plus');
  await page.keyboard.press('Escape');
  await expect(boite(page)).toHaveCount(0);
  expect(serveur.appels).toEqual([]);
});
