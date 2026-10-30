// Module Devis, haut de page (brief de Jérôme du 26/10/2026, suite de la PR 306).
//   1 : en état Envoyé, les boutons s'appellent « Devis signé » et « Devis refusé » (même comportement ; les statuts et pastilles gardent « Devis signé » / « Devis refusé »).
//   2 : le bouton « Envoyer » grisé d'un brouillon a une infobulle au survol ET au focus clavier (« Finalise le devis pour pouvoir l’envoyer »), reliée au bouton par aria-describedby.
// Captures dans tests/e2e/captures/devis-boutons-libelles-infobulle/ (ordinateur ; téléphone aussi : la mise en page de l'état Envoyé n'avait pas de capture).
// Les fonctions du serveur sont SIMULÉES par page.route (comme dans devis-entete-bouton-jaune.spec.js).
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, creerOrganisation, creerAffaire, estTelephone, JEROME } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-boutons-libelles-infobulle/', import.meta.url));
/** `aussiTelephone` : les critères 1, 4 et 6 sont aussi photographiés au format téléphone (la mise en page change) ; les autres seulement sur ordinateur. */
async function capturer(page, info, nom, aussiTelephone = false) {
  if (estTelephone(page) && !aussiTelephone) return; // le téléphone n'a pas de survol : pour 2 il est photographié avec le focus
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


test('1 envoyé : les boutons s’appellent « Devis signé » (jaune) et « Devis refusé » (contour) et appellent le même serveur qu’avant ; les toasts gardent les statuts « Devis signé » et « Devis refusé »', async ({ page }, info) => {
  await donnees();
  const appels = [];
  await page.route('**/devisChangerStatut', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    appels.push(JSON.parse(route.request().postData()).data);
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ok: true } }) });
  });
  await ouvrir(page, 'devis/voir/dEnvoye');
  await expect(jaunes(page)).toHaveText('Devis signé');
  const refuse = racine(page).locator('[data-action="marquer-refuse"]');
  await expect(refuse).toHaveText('Devis refusé');
  await expect(racine(page).getByText('Marquer comme', { exact: false })).toHaveCount(0);
  // Le bouton jaune est tout à droite : « Devis refusé » est à sa gauche. Sur téléphone la barre passe à la ligne : « Devis refusé » est alors au-dessus du jaune (il reste avant lui).
  const bRefuse = await refuse.boundingBox();
  const bSigne = await jaunes(page).boundingBox();
  if (estTelephone(page) && bRefuse.y + bRefuse.height <= bSigne.y + 1) expect(bRefuse.y).toBeLessThan(bSigne.y);
  else expect(bRefuse.x).toBeLessThan(bSigne.x);
  await capturer(page, info, '1-envoye-devis-signe-refuse', true);
  await jaunes(page).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Marquer signé' }).click(); // fenêtre de confirmation (27/10/2026)
  await expect(page.locator('.toast').filter({ hasText: 'Devis passé à « Devis signé »' })).toBeVisible();
  await refuse.click();
  await page.getByRole('dialog').getByRole('button', { name: 'Marquer refusé' }).click();
  await expect(page.locator('.toast').filter({ hasText: 'Devis passé à « Devis refusé »' })).toBeVisible();
  expect(appels).toEqual([{ devisId: 'dEnvoye', action: 'accepter' }, { devisId: 'dEnvoye', action: 'refuser' }]);
});

test('2 brouillon : l’infobulle « Finalise le devis pour pouvoir l’envoyer » apparaît sur « Envoyer » grisé au survol et au focus clavier, est reliée au bouton, se masque avec Échap ; le clic donne toujours le message', async ({ page }, info) => {
  await donnees();
  await ouvrir(page, 'devis/editeur/dBrouillon');
  const envoyer = racine(page).locator('[data-action="envoyer"]');
  const bulle = racine(page).locator('[data-role="bulle-envoyer"]');
  await expect(envoyer).toHaveAttribute('aria-disabled', 'true');
  await expect(bulle).toBeHidden();
  const idBulle = await bulle.getAttribute('id');
  await expect(envoyer).toHaveAttribute('aria-describedby', idBulle);
  await expect(bulle).toHaveText(MESSAGE);
  if (!estTelephone(page)) {
    await envoyer.hover({ force: true });
    await expect(bulle).toBeVisible();
    await expect(bulle).toBeInViewport({ ratio: 1 });
    await capturer(page, info, '2-envoyer-grise-infobulle-survol');
    await page.mouse.move(5, 400);
    await expect(bulle).toBeHidden();
  }
  await envoyer.focus();
  await expect(bulle).toBeVisible();
  await expect(bulle).toBeInViewport({ ratio: 1 });
  await capturer(page, info, '2-envoyer-grise-infobulle-focus', true);
  await page.keyboard.press('Escape');
  await expect(bulle).toBeHidden();
  await page.keyboard.press('Enter');
  await expect(page.locator('.toast').filter({ hasText: MESSAGE })).toBeVisible();
});
