// Module Devis, haut de page (brief de Jérôme du 26/10/2026) : UN seul bouton jaune, toujours l'étape suivante conseillée ; tout le reste reste dans le menu « … ».
//   Brouillon : « Finaliser » (jaune) + « Envoyer » grisé  |  Finalisé : « Envoyer » (jaune)  |  Envoyé : « Marquer comme signé » (jaune) + « Marquer comme refusé »  |  Signé, refusé, remplacé, archivé : aucun.
// Un test par critère (le nom commence par son numéro) et une capture par critère dans tests/e2e/captures/devis-entete-bouton-jaune/ (ordinateur ; téléphone aussi pour 1, 4 et 6).
// Critères 7 (pied de page du PDF brouillon) et 8 (la règle est une fonction pure) : tests sans navigateur, tests/devis-pdf-fonction.test.js et tests/devis-entete-boutons.test.js.
// Les fonctions du serveur (devisChangerStatut, devisPdf, devisPdfLien, devisFinaliser) n'existent pas dans l'émulateur du navigateur : elles sont SIMULÉES par page.route.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, creerOrganisation, creerAffaire, estTelephone, JEROME } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-entete-bouton-jaune/', import.meta.url));
/** `aussiTelephone` : les critères 1, 4 et 6 sont aussi photographiés au format téléphone (la mise en page change) ; les autres seulement sur ordinateur. */
async function capturer(page, info, nom, aussiTelephone = false) {
  if (estTelephone(page) && !aussiTelephone) return;
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
}
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const URL_PDF = 'https://stockage.exemple.test/devis-essai.pdf';
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
  await devis('dRefuse', { ...FINALISE, numero: 'DEV-2026-10-02-004', statut: 'refuse' });
  await devis('dRemplace', { ...FINALISE, numero: 'DEV-2026-10-02-005', statut: 'remplace' });
  await devis('dArchive', { ...FINALISE, numero: 'DEV-2026-10-02-006', statut: 'accepte', archive: true });
}
async function ouvrir(page, route) {
  await connecter(page, undefined, { route });
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
}
const racine = (page) => page.locator('.page-editeur-devis');
const jaunes = (page) => racine(page).locator('.bouton-principal');
const menuPlus = async (page) => { await page.locator('[data-action="plus-actions"]').click(); await expect(page.locator('.menu-pop')).toBeVisible(); return page.locator('.menu-pop'); };
const MESSAGE = 'Finalise le devis pour pouvoir l’envoyer';

test('1 brouillon : « Finaliser » est le bouton jaune ; « Envoyer » est grisé (aria-disabled) et son clic, au toucher comme à la souris et au clavier, dit « Finalise le devis pour pouvoir l’envoyer » sans ouvrir de menu ; « Finaliser » ouvre la fenêtre habituelle', async ({ page }, info) => {
  await donnees();
  await ouvrir(page, 'devis/editeur/dBrouillon');
  await expect(jaunes(page)).toHaveCount(1);
  await expect(jaunes(page)).toHaveText('Finaliser');
  await expect(jaunes(page)).toHaveAttribute('data-action', 'finaliser');
  const envoyer = racine(page).locator('[data-action="envoyer"]');
  await expect(envoyer).toHaveAttribute('aria-disabled', 'true');
  await expect(envoyer).not.toHaveAttribute('disabled', /.*/); // grisé mais focusable
  await expect(envoyer).toHaveClass(/bouton-secondaire/);
  // « Finaliser » est avant « Envoyer », à la place d'« Envoyer » dans la barre.
  const ordre = await racine(page).locator('.barre-devis-droite [data-action]').evaluateAll((els) => els.map((e) => e.dataset.action));
  expect(ordre.indexOf('historique')).toBeLessThan(ordre.indexOf('finaliser'));
  expect(ordre.indexOf('finaliser')).toBeLessThan(ordre.indexOf('envoyer'));
  // Clic (souris ou doigt : sur téléphone, `click()` passe par le même événement) : le message est VISIBLE, pas une infobulle, et aucun menu ne s'ouvre.
  // (Playwright voit `aria-disabled` comme « pas cliquable » : on force, c'est justement ce que fait un vrai doigt ; sur téléphone, un vrai toucher.)
  if (estTelephone(page)) await envoyer.tap({ force: true }); else await envoyer.click({ force: true });
  const toast = page.locator('.toast').filter({ hasText: MESSAGE });
  await expect(toast).toBeVisible();
  await expect(toast).toBeInViewport();
  await expect(page.locator('.menu-pop')).toHaveCount(0);
  await capturer(page, info, '1-brouillon-finaliser-jaune', true);
  // Clavier : le bouton est atteignable (focus) et Entrée redonne le message.
  await page.locator('.toast').first().waitFor();
  await envoyer.focus();
  await expect(envoyer).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('.toast').filter({ hasText: MESSAGE }).last()).toBeVisible();
  await expect(page.locator('.menu-pop')).toHaveCount(0);
  // « Finaliser » : la fenêtre « Finaliser ce devis ? » comme avant (on annule, rien n'est finalisé).
  await jaunes(page).click();
  await expect(page.getByRole('dialog')).toContainText('Finaliser ce devis ?');
  await page.getByRole('dialog').getByRole('button', { name: 'Annuler' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(jaunes(page)).toHaveText('Finaliser');
});

test('1 (brouillon ouvert par « Voir le devis ») la règle est la même : « Finaliser » jaune, « Envoyer » grisé, et le brouillon reste modifiable', async ({ page }) => {
  await donnees();
  await ouvrir(page, 'devis/voir/dBrouillon');
  await expect(racine(page)).not.toHaveClass(/devis-lecture-seule/);
  await expect(jaunes(page)).toHaveText('Finaliser');
  await expect(racine(page).locator('[data-action="envoyer"]')).toHaveAttribute('aria-disabled', 'true');
});

test('2 finalisé : pas de bouton « Finaliser » ; « Envoyer » est jaune et ouvre un menu qui ne propose que l’e-mail ; « Télécharger le PDF » et « Imprimer » sont dans « … »', async ({ page }, info) => {
  await donnees();
  await ouvrir(page, 'devis/voir/dFinalise');
  await expect(racine(page).locator('[data-action="finaliser"]')).toHaveCount(0);
  await expect(jaunes(page)).toHaveCount(1);
  await expect(jaunes(page)).toHaveAttribute('data-action', 'envoyer');
  await expect(racine(page).locator('[data-action="passer-envoye"]')).toHaveClass(/bouton-secondaire/); // reste visible, en contour
  await jaunes(page).click();
  await expect(page.locator('.menu-pop').getByRole('menuitem')).toHaveText([/Envoyer par e-mail/]);
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: 'Télécharger le PDF' })).toHaveCount(0);
  await capturer(page, info, '2-finalise-envoyer-jaune');
  await page.keyboard.press('Escape');
  const menu = await menuPlus(page);
  await expect(menu.getByRole('menuitem', { name: 'Télécharger le PDF' })).toBeEnabled();
  await expect(menu.getByRole('menuitem', { name: 'Imprimer' })).toBeEnabled();
  await expect(menu.getByRole('menuitem', { name: 'Envoyer à nouveau' })).toBeEnabled();
  await page.keyboard.press('Escape');
});

test('3 envoyé : « Marquer comme signé » (jaune) et « Marquer comme refusé » (visible) font ce que faisaient les entrées « Passer à Signé / Refusé » ; « Envoyer à nouveau » et « Imprimer » sont dans « … »', async ({ page }, info) => {
  await donnees();
  const appels = [];
  await page.route('**/devisChangerStatut', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    appels.push(JSON.parse(route.request().postData()).data);
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ok: true } }) });
  });
  await ouvrir(page, 'devis/voir/dEnvoye');
  await expect(jaunes(page)).toHaveCount(1);
  await expect(jaunes(page)).toHaveText('Marquer comme signé');
  await expect(racine(page).locator('[data-action="marquer-refuse"]')).toBeVisible();
  await expect(racine(page).locator('[data-action="marquer-refuse"]')).toHaveClass(/bouton-secondaire/);
  await expect(racine(page).locator('[data-action="envoyer"]')).toHaveCount(0);
  await capturer(page, info, '3-envoye-signe-refuse');
  const menu = await menuPlus(page);
  await expect(menu.getByRole('menuitem', { name: 'Envoyer à nouveau' })).toBeEnabled();
  await expect(menu.getByRole('menuitem', { name: 'Imprimer' })).toBeEnabled();
  await expect(menu.getByRole('menuitem', { name: /Passer à « (Signé|Refusé) »/ })).toHaveCount(0); // les deux boutons REMPLACENT ces entrées : pas de doublon
  await page.keyboard.press('Escape');
  await jaunes(page).click();
  await expect(page.locator('.toast').filter({ hasText: 'Devis passé à « Signé »' })).toBeVisible();
  await racine(page).locator('[data-action="marquer-refuse"]').click();
  await expect(page.locator('.toast').filter({ hasText: 'Devis passé à « Refusé »' })).toBeVisible();
  expect(appels).toEqual([{ devisId: 'dEnvoye', action: 'accepter' }, { devisId: 'dEnvoye', action: 'refuser' }]);
});

test('4 signé, refusé, remplacé, archivé : aucun bouton jaune ; « … » contient « Imprimer » et « Envoyer à nouveau » (grisé : l’e-mail n’est plus possible pour ces statuts)', async ({ page }, info) => {
  await donnees();
  for (const [i, id] of ['dSigne', 'dRefuse', 'dRemplace', 'dArchive'].entries()) {
    if (i === 0) await ouvrir(page, `devis/voir/${id}`);
    else await page.evaluate((h) => { location.hash = h; }, `#/devis/voir/${id}`);
    await expect(page.locator(`.page-editeur-devis[data-devis="${id}"]`)).toBeVisible();
    await attendreCalme(page);
    await expect(jaunes(page), id).toHaveCount(0);
    await expect(racine(page).locator('[data-action="envoyer"], [data-action="finaliser"], [data-action="marquer-signe"], [data-action="marquer-refuse"], [data-action="passer-envoye"]'), id).toHaveCount(0);
    const menu = await menuPlus(page);
    await expect(menu.getByRole('menuitem', { name: 'Imprimer' }), id).toBeEnabled();
    await expect(menu.getByRole('menuitem', { name: 'Télécharger le PDF' }), id).toBeEnabled();
    await expect(menu.getByRole('menuitem', { name: 'Envoyer à nouveau' }), id).toBeDisabled();
    if (id === 'dSigne') await capturer(page, info, '4-signe-aucun-jaune', true);
    await page.keyboard.press('Escape');
  }
});

test('5 « Imprimer » un brouillon : aucune fenêtre « Finaliser », le devis reste brouillon, l’écran du PDF brouillon s’ouvre', async ({ page }, info) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'le faux serveur répond comme le vrai' });
  await donnees();
  const appels = [];
  await page.context().route('https://stockage.exemple.test/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<p>PDF d’essai</p>' }));
  await page.route('**/devisPdf', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    appels.push(['devisPdf', JSON.parse(route.request().postData()).data]);
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { statut: 'ok', lien: 'x', nom: 'Brouillon' } }) });
  });
  await page.route('**/devisPdfLien', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    appels.push(['devisPdfLien', JSON.parse(route.request().postData()).data]);
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { url: URL_PDF, expireDans: 300, nom: 'Brouillon.pdf' } }) });
  });
  await page.route('**/devisFinaliser', async (route) => { appels.push(['devisFinaliser']); return route.abort('failed'); });
  await ouvrir(page, 'devis/editeur/dBrouillon');
  const menu = await menuPlus(page);
  const ouverture = page.waitForEvent('popup').catch(() => null);
  await menu.getByRole('menuitem', { name: 'Imprimer' }).click();
  await expect(page).toHaveURL(/#\/devis\/pdf\/dBrouillon\/brouillon$/, { timeout: 10000 });
  await expect(page.getByRole('dialog')).toHaveCount(0); // pas de « Finaliser ce devis ? »
  await expect(page.locator('[data-zone="pdf-devis"]')).toBeVisible();
  await capturer(page, info, '5-imprimer-brouillon-ecran-pdf');
  const popup = await ouverture;
  await popup?.close();
  expect(appels.map(([nom]) => nom)).toContain('devisPdf');
  expect(appels.map(([nom]) => nom)).not.toContain('devisFinaliser');
  expect(appels.find(([nom]) => nom === 'devisPdf')[1]).toEqual({ devisId: 'dBrouillon', brouillon: true });
});

test('6 cas vide : un devis introuvable ne montre aucun bouton ; cas d’erreur : si « Finaliser » échoue (affaire manquante), la liste des erreurs s’affiche comme avant et le bouton reste « Finaliser »', async ({ page }, info) => {
  await donnees();
  await devis('dSansAffaire', { affaireId: null, organisationId: null });
  await ouvrir(page, 'devis/editeur/dSansAffaire');
  await jaunes(page).click();
  await page.getByRole('dialog').waitFor();
  await expect(page.getByRole('dialog')).toContainText('Ce devis ne peut pas encore être finalisé');
  await expect(page.getByRole('dialog').locator('li')).toContainText(['Choisis l’affaire du devis.']);
  await capturer(page, info, '6-erreur-finalisation', true);
  await page.getByRole('dialog').getByRole('button', { name: 'Compris' }).click();
  await expect(jaunes(page)).toHaveText('Finaliser');
  await expect(racine(page).locator('[data-action="envoyer"]')).toHaveAttribute('aria-disabled', 'true');
  // Devis introuvable : aucun bouton d'étape, le message habituel.
  await page.evaluate(() => { location.hash = '#/devis/voir/inexistant'; });
  await expect(page.getByText('Ce devis est introuvable')).toBeVisible();
  await expect(page.locator('.page-editeur-devis [data-action="finaliser"], .page-editeur-devis [data-action="envoyer"], .page-editeur-devis .bouton-principal')).toHaveCount(0);
  await capturer(page, info, '6-introuvable', true);
});
