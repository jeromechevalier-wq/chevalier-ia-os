// Module Devis, haut de page d'un devis « Finalisé » (statut stocké `en_attente_envoi`, demande de Jérôme du 26/10/2026) :
//   1 : l'ordre est Historique, « Envoyer » (jaune), puis « Devis envoyé » (contour) : on envoie d'abord, puis on marque comme envoyé ;
//       les autres états ne bougent pas (Brouillon : « Finaliser » puis « Envoyer » grisé ; Envoyé : « Devis refusé » puis « Devis signé » tout à droite).
//   2 : « Passer à « Envoyé » » s'appelle désormais « Devis envoyé » ; même serveur, même action `marquer_envoye`, le toast garde le statut « Envoyé ».
//   3 : le menu « … » ne répète jamais un bouton visible du haut de page (un test par état : brouillon, finalisé, envoyé, signé ; règle pure : clesMenuDejaVisibles).
// Captures dans tests/e2e/captures/devis-finalise-ordre-boutons/ (ordinateur et téléphone : l'ordre change aussi sur téléphone).
// Les fonctions du serveur sont SIMULÉES par page.route (comme dans devis-boutons-libelles-infobulle.spec.js).
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, creerOrganisation, creerAffaire, estTelephone, JEROME } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-finalise-ordre-boutons/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
}
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const LIGNES = [{ id: 'l1', libelle: 'Carrelage', familleId: 'famille-1', type: 'fourniture', quantite: 10, unite: 'm²', prixAchat: 40, prixVente: 60, tauxTva: 20 }];
const FINALISE = { numero: 'DEV-2026-10-02-001', statut: 'en_attente_envoi', finaliseLe: new Date(Date.now() - 86400000) };

async function devis(id, valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument(`devis_devis/${id}`, {
    racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', personneId: null, organisationId: 'o1', modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: '2099-12-31', objet: 'Rénovation restaurant', destinataires: ['contact@exemple.fr'],
    sections: [{ id: 's1', titre: 'Cuisine', lignes: LIGNES }],
    creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, ...valeurs,
  });
}
async function donnees() {
  await creerOrganisation('o1', { nom: 'M. Paul Exemple' });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', organisationId: 'o1' });
  await devis('dBrouillon');
  await devis('dFinalise', FINALISE);
  await devis('dEnvoye', { ...FINALISE, numero: 'DEV-2026-10-02-002', statut: 'envoye', envoyeLe: new Date() });
  await devis('dSigne', { ...FINALISE, numero: 'DEV-2026-10-02-003', statut: 'accepte' });
}
async function ouvrir(page, route) {
  await connecter(page, undefined, { route });
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
}
const tete = (page) => page.locator('.page-editeur-devis > .barre-devis .barre-devis-droite');
const x = async (loc) => (await loc.boundingBox()).x;
/** Ordre de lecture : sur téléphone les boutons passent à la ligne (le second est alors plus bas, à gauche) ; il est avant l'autre s'il est sur une ligne plus haute, ou sur la même ligne et plus à gauche. */
const avant = async (a, b) => { const [p, q] = [await a.boundingBox(), await b.boundingBox()]; return q.y > p.y + p.height / 2 || (Math.abs(q.y - p.y) < p.height / 2 && p.x < q.x); };

test('1 finalisé : l’ordre est Historique, « Envoyer » (jaune), puis « Devis envoyé » (contour) ; brouillon et envoyé gardent leur ordre', async ({ page }, info) => {
  await donnees();
  await ouvrir(page, 'devis/voir/dFinalise');
  const envoyer = tete(page).locator('[data-action="envoyer"]');
  const envoye = tete(page).locator('[data-action="passer-envoye"]');
  await expect(envoyer).toHaveClass(/bouton-principal/);
  await expect(envoye).toHaveClass(/bouton-secondaire/);
  await expect(envoye).toBeVisible();
  expect(await avant(envoyer, envoye)).toBe(true);
  // Sur téléphone, « Historique » passe dans le « … » : il n'est comparé que sur ordinateur.
  if (!estTelephone(page)) expect(await x(tete(page).locator('[data-action="historique"]'))).toBeLessThan(await x(envoyer));
  await capturer(page, info, '1-finalise-envoyer-puis-devis-envoye');

  // Brouillon : « Finaliser » (jaune) puis « Envoyer » grisé à sa droite (inchangé).
  await page.evaluate(() => { location.hash = '#/devis/voir/dBrouillon'; });
  await expect(page.locator('.page-editeur-devis[data-devis="dBrouillon"] .fiche-tete')).toBeVisible();
  await attendreCalme(page);
  expect(await avant(tete(page).locator('[data-action="finaliser"]'), tete(page).locator('[data-action="envoyer"]'))).toBe(true);

  // Envoyé : « Devis refusé » (contour) puis « Devis signé » (jaune) tout à droite (inchangé).
  await page.evaluate(() => { location.hash = '#/devis/voir/dEnvoye'; });
  await expect(page.locator('.page-editeur-devis[data-devis="dEnvoye"] .fiche-tete')).toBeVisible();
  await attendreCalme(page);
  expect(await avant(tete(page).locator('[data-action="marquer-refuse"]'), tete(page).locator('[data-action="marquer-signe"]'))).toBe(true);
});

test('1 (éditeur) le même ordre dans l’éditeur d’un devis finalisé : « Envoyer » (jaune) avant « Devis envoyé »', async ({ page }) => {
  await donnees();
  await ouvrir(page, 'devis/editeur/dFinalise');
  const ordre = await page.locator('.page-editeur-devis [data-action="envoyer"], .page-editeur-devis [data-action="passer-envoye"]').evaluateAll((els) => els.map((e) => e.dataset.action));
  expect(ordre).toEqual(['envoyer', 'passer-envoye']);
});

test('2 finalisé : le bouton s’appelle « Devis envoyé » (plus de « Passer à « Envoyé » ») ; un clic appelle le même serveur (marquer_envoye) et le toast garde « Envoyé »', async ({ page }, info) => {
  await donnees();
  const appels = [];
  await page.route('**/devisChangerStatut', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    appels.push(JSON.parse(route.request().postData()).data);
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ok: true } }) });
  });
  await ouvrir(page, 'devis/voir/dFinalise');
  const envoye = tete(page).locator('[data-action="passer-envoye"]');
  await expect(envoye).toHaveText('Devis envoyé');
  await expect(page.locator('.page-editeur-devis').getByText('Passer à', { exact: false })).toHaveCount(0);
  await capturer(page, info, '2-libelle-devis-envoye');
  await envoye.click();
  await expect(page.locator('.toast').filter({ hasText: 'Devis passé à « Envoyé »' })).toBeVisible();
  expect(appels).toEqual([{ devisId: 'dFinalise', action: 'marquer_envoye' }]);
});

/** Ouvre le « … » du haut de page et rend ses entrées (sans Options et Historique, qui n'y sont que sur téléphone). */
async function entreesMenu(page) {
  await page.locator('.page-editeur-devis [data-action="plus-actions"]').click();
  const menu = page.locator('.menu-pop');
  await expect(menu).toBeVisible();
  return (await menu.getByRole('menuitem').allTextContents()).map((t) => t.trim()).filter((t) => !['Options', 'Historique'].includes(t));
}
const PASSAGES = /^Passer à « /;

test('3 brouillon : le « … » ne propose pas « Passer à « Finalisé » » (le bouton est visible) mais garde « Envoyer par e-mail » (« Envoyer » grisé n’ouvre aucun menu) ; PDF, impression et Supprimer restent', async ({ page }, info) => {
  await donnees();
  await ouvrir(page, 'devis/editeur/dBrouillon');
  await expect(page.locator('.page-editeur-devis [data-action="finaliser"]')).toBeVisible();
  await expect(page.locator('.page-editeur-devis [data-action="envoyer"]')).toBeVisible();
  const l = await entreesMenu(page);
  expect(l.filter((t) => PASSAGES.test(t))).toEqual([]);
  expect(l.filter((t) => /^Envoyer/.test(t))).toEqual(['Envoyer par e-mail']); // et jamais « Envoyer à nouveau »
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: 'Envoyer par e-mail' })).toBeEnabled();
  for (const nom of ['Télécharger le PDF', 'Imprimer', 'Dupliquer', 'Supprimer']) expect(l).toContain(nom);
  expect(l).not.toContain('Voir le devis'); // l'onglet « Prévisualisation » le fait déjà (écran unique)
  await capturer(page, info, '3-menu-brouillon');
  await page.keyboard.press('Escape');
});

test('3 finalisé : le « … » ne propose ni « Passer à « Envoyé » » ni « Envoyer à nouveau » (« Envoyer » et « Devis envoyé » sont visibles) ; « Créer une nouvelle version » reste', async ({ page }, info) => {
  await donnees();
  await ouvrir(page, 'devis/voir/dFinalise');
  const l = await entreesMenu(page);
  expect(l.filter((t) => PASSAGES.test(t) || /^Envoyer/.test(t) || t === 'Devis envoyé')).toEqual([]);
  for (const nom of ['Télécharger le PDF', 'Imprimer', 'Créer une nouvelle version', 'Dupliquer', 'Archiver']) expect(l).toContain(nom);
  await capturer(page, info, '3-menu-finalise');
  await page.keyboard.press('Escape');
});

test('3 envoyé : le « … » ne propose ni « Passer à « Signé » » ni « Passer à « Refusé » » (les boutons sont visibles) ; « Envoyer à nouveau » reste (aucun bouton « Envoyer »)', async ({ page }, info) => {
  await donnees();
  await ouvrir(page, 'devis/voir/dEnvoye');
  await expect(tete(page).locator('[data-action="envoyer"]')).toHaveCount(0);
  const l = await entreesMenu(page);
  expect(l.filter((t) => PASSAGES.test(t) || ['Devis signé', 'Devis refusé', 'Envoyer par e-mail'].includes(t))).toEqual([]);
  expect(l).toContain('Envoyer à nouveau');
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: 'Envoyer à nouveau' })).toBeEnabled();
  await capturer(page, info, '3-menu-envoye');
  await page.keyboard.press('Escape');
});

test('3 signé : aucun bouton d’étape, donc rien n’est retiré du « … » à cause d’un bouton ; « Envoyer à nouveau » (grisé) et « Archiver » restent', async ({ page }, info) => {
  await donnees();
  await ouvrir(page, 'devis/voir/dSigne');
  await expect(tete(page).locator('.bouton-principal')).toHaveCount(0);
  const l = await entreesMenu(page);
  for (const nom of ['Télécharger le PDF', 'Imprimer', 'Envoyer à nouveau', 'Dupliquer', 'Archiver']) expect(l).toContain(nom);
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: 'Envoyer à nouveau' })).toBeDisabled();
  await capturer(page, info, '3-menu-signe');
  await page.keyboard.press('Escape');
});
