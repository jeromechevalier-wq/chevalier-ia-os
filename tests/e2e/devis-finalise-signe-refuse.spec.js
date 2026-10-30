// Module Devis, « Finalisé » peut passer à « Devis signé » ET à « Devis refusé » sans avoir été « envoyé » dans l'application (décision de Jérôme, 30/10/2026) :
// le devis a pu être remis en main propre ou envoyé hors de l'application.
//   1 : le menu « … » d'un devis Finalisé propose « Passer à « Devis signé » » et « Passer à « Devis refusé » » ;
//   2 : signé depuis Finalisé : même fenêtre de confirmation que partout, l'envoi est enregistré d'abord (comme « Devis envoyé »), puis le devis passe à signé ;
//   3 : refusé depuis Finalisé : pareil ;
//   4 : cas d'erreur : le devis a été modifié ailleurs entre-temps, le serveur refuse : message clair, rien d'autre n'est appelé ; et si c'est la dernière étape qui échoue, le devis reste « Envoyé » et le message le dit.
// Le serveur (devisChangerStatut, devisEnregistrerEnvoi) est SIMULÉ par page.route. Captures dans tests/e2e/captures/devis-finalise-signe-refuse/ (ordinateur et téléphone).
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, creerOrganisation, creerAffaire, JEROME } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-finalise-signe-refuse/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
}
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const LIGNES = [{ id: 'l1', libelle: 'Carrelage', familleId: 'famille-1', type: 'fourniture', quantite: 10, unite: 'm²', prixAchat: 40, prixVente: 60, tauxTva: 20 }];
const menu = (page) => page.locator('.menu-pop');
const fenetre = (page) => page.getByRole('dialog');

async function devis(valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument('devis_devis/dFinalise', {
    racineId: 'dFinalise', version: 1, numero: 'DEV-2026-10-02-001', statut: 'en_attente_envoi', finaliseLe: new Date(Date.now() - 86400000), affaireId: 'a1', personneId: null, organisationId: 'o1',
    modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20, regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: '2099-12-31', objet: 'Rénovation restaurant',
    destinataires: ['contact@exemple.fr'], sections: [{ id: 's1', titre: 'Cuisine', lignes: LIGNES }],
    creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, ...valeurs,
  });
}
async function donnees() {
  await creerOrganisation('o1', { nom: 'M. Paul Exemple' });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', organisationId: 'o1' });
  await devis();
}
/** Simule le serveur ; `refus` : message renvoyé par devisChangerStatut pour la demande `refus.action` (le devis a été modifié ailleurs). */
async function simulerServeur(page, appels, refus = null) {
  for (const nom of ['devisChangerStatut', 'devisEnregistrerEnvoi']) {
    await page.route(`**/${nom}`, async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      const data = JSON.parse(route.request().postData()).data;
      appels.push([nom, data]);
      if (refus && nom === 'devisChangerStatut' && data.action === refus.action) {
        return route.fulfill({ status: 412, headers: cors, body: JSON.stringify({ error: { status: 'FAILED_PRECONDITION', message: refus.message } }) });
      }
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ok: true } }) });
    });
  }
}
async function ouvrir(page) {
  await connecter(page, undefined, { route: 'devis/voir/dFinalise' });
  await expect(page.locator('.page-editeur-devis[data-devis="dFinalise"]')).toBeVisible();
  await attendreCalme(page);
}
const ouvrirMenu = async (page) => { await page.locator('[data-action="plus-actions"]').click(); await expect(menu(page)).toBeVisible(); };
const entree = (page, nom) => menu(page).getByRole('menuitem', { name: nom });
const PHRASE_SIGNE = 'Le devis passe à « Devis signé ». Tu ne pourras plus créer de nouvelle version. Les autres versions du même numéro, encore en attente ou envoyées, passent à « Devis remplacé ».';
const SEQUENCE = (action) => [
  ['devisChangerStatut', { devisId: 'dFinalise', action: 'marquer_envoye' }],
  ['devisEnregistrerEnvoi', { devisId: 'dFinalise', destinataires: ['contact@exemple.fr'], copie: [] }],
  ['devisChangerStatut', { devisId: 'dFinalise', action }],
];

test('1 le menu « … » d’un devis Finalisé jamais envoyé propose « Passer à « Devis signé » » et « Passer à « Devis refusé » »', async ({ page }, info) => {
  await donnees();
  await ouvrir(page);
  await ouvrirMenu(page);
  await expect(entree(page, 'Créer une nouvelle version')).toHaveCount(1); // possible tant que le devis n'est pas signé
  await expect(entree(page, 'Passer à « Devis signé »')).toBeEnabled();
  await expect(entree(page, 'Passer à « Devis refusé »')).toBeEnabled();
  await capturer(page, info, '1-menu-finalise');
});

test('2 signé depuis Finalisé : fenêtre de confirmation avec la phrase habituelle, envoi enregistré d’abord, puis « Devis signé »', async ({ page }, info) => {
  await donnees();
  const appels = [];
  await simulerServeur(page, appels);
  await ouvrir(page);
  await ouvrirMenu(page);
  await entree(page, 'Passer à « Devis signé »').click();
  await expect(fenetre(page)).toContainText('Marquer ce devis signé ?');
  await expect(fenetre(page)).toContainText(PHRASE_SIGNE);
  await capturer(page, info, '2-confirmation-signe');
  await fenetre(page).getByRole('button', { name: 'Annuler' }).click();
  expect(appels).toEqual([]);
  await ouvrirMenu(page);
  await entree(page, 'Passer à « Devis signé »').click();
  await fenetre(page).getByRole('button', { name: 'Marquer signé' }).click();
  await expect(page.locator('.toast').filter({ hasText: 'Devis passé à « Devis signé »' })).toBeVisible();
  expect(appels).toEqual(SEQUENCE('accepter'));
  // ce que ferait le serveur : le devis est signé, la création d'une nouvelle version n'est plus proposée
  await devis({ statut: 'accepte', envoyeLe: new Date(), accepteLe: new Date() });
  await attendreCalme(page);
  await ouvrirMenu(page);
  await expect(entree(page, 'Créer une nouvelle version')).toHaveCount(0); // création de version bloquée
  await capturer(page, info, '2-signe-sans-nouvelle-version');
});

test('3 refusé depuis Finalisé : fenêtre de confirmation, envoi enregistré d’abord, puis « Devis refusé »', async ({ page }, info) => {
  await donnees();
  const appels = [];
  await simulerServeur(page, appels);
  await ouvrir(page);
  await ouvrirMenu(page);
  await entree(page, 'Passer à « Devis refusé »').click();
  await expect(fenetre(page)).toContainText('Marquer ce devis refusé ?');
  await expect(fenetre(page)).toContainText('Le devis passe à « Devis refusé ». Tu pourras encore créer une nouvelle version.');
  await capturer(page, info, '3-confirmation-refuse');
  await fenetre(page).getByRole('button', { name: 'Marquer refusé' }).click();
  await expect(page.locator('.toast').filter({ hasText: 'Devis passé à « Devis refusé »' })).toBeVisible();
  expect(appels).toEqual(SEQUENCE('refuser'));
});

test('4 cas d’erreur : devis déjà modifié dans un autre onglet, le serveur refuse : message clair, rien d’autre n’est appelé', async ({ page }, info) => {
  info.annotations.push({ type: 'erreurs-reseau-attendues' });
  await donnees();
  const appels = [];
  const message = 'Cette action n\'est pas possible pour un devis « Devis signé ».';
  await simulerServeur(page, appels, { action: 'marquer_envoye', message });
  await ouvrir(page);
  await ouvrirMenu(page);
  await entree(page, 'Passer à « Devis signé »').click();
  await fenetre(page).getByRole('button', { name: 'Marquer signé' }).click();
  await expect(page.locator('.toast').filter({ hasText: message })).toBeVisible();
  expect(appels).toEqual([['devisChangerStatut', { devisId: 'dFinalise', action: 'marquer_envoye' }]]);
  await expect(page).toHaveURL(/#\/devis\/voir\/dFinalise$/);
  await capturer(page, info, '4-erreur-deja-modifie');
});

test('4 cas d’erreur : si la dernière étape échoue, le devis reste « Envoyé » (envoi déjà enregistré) et le message le dit', async ({ page }, info) => {
  info.annotations.push({ type: 'erreurs-reseau-attendues' });
  await donnees();
  const appels = [];
  await simulerServeur(page, appels, { action: 'accepter', message: 'Cette action n\'est pas possible pour un devis « Devis refusé ».' });
  await ouvrir(page);
  await ouvrirMenu(page);
  await entree(page, 'Passer à « Devis signé »').click();
  await fenetre(page).getByRole('button', { name: 'Marquer signé' }).click();
  await expect(page.locator('.toast').filter({ hasText: 'Le devis est resté à « Envoyé »' })).toBeVisible();
  expect(appels).toEqual(SEQUENCE('accepter'));
  await capturer(page, info, '4-erreur-derniere-etape');
});

test('4 course entre onglets : le devis est déjà « Envoyé » ailleurs, « signé » est demandé directement, sans refaire l’envoi', async ({ page }) => {
  await donnees();
  const appels = [];
  await simulerServeur(page, appels);
  await ouvrir(page);
  await ouvrirMenu(page); // le menu est ouvert (entrées « Finalisé »)...
  await devis({ statut: 'envoye', envoyeLe: new Date() }); // ...quand l'autre onglet passe le devis à « Envoyé »
  await entree(page, 'Passer à « Devis signé »').click();
  await fenetre(page).getByRole('button', { name: 'Marquer signé' }).click();
  await expect(page.locator('.toast').filter({ hasText: 'Devis passé à « Devis signé »' })).toBeVisible();
  expect(appels).toEqual([['devisChangerStatut', { devisId: 'dFinalise', action: 'accepter' }]]);
});
