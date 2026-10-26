// Module Devis, PDF dans les écrans : (1) route #/devis/pdf/<id> (et …/brouillon), (2) « Télécharger le PDF » du menu « … » de l'éditeur, (3) « PDF non rangé » / lien « PDF » dans la liste et la fiche.
// Un test par point du brief (le nom commence par le numéro du point). Captures dans tests/e2e/captures/devis-pdf-ecran/ (ordinateur ET téléphone : la mise en page change).
// Les fonctions du serveur (devisPdf, devisPdfLien) n'existent pas dans l'émulateur du navigateur : elles sont SIMULÉES par page.route.
// Le simulateur de devisPdf écrit le champ `pdf` du devis comme le ferait le serveur ; il lit aussi l'objet enregistré pour prouver que l'écran enregistre AVANT de demander le PDF.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, lireDocument, creerOrganisation, creerAffaire, estTelephone, JEROME } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-pdf-ecran/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
}
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const URL_PDF = 'https://stockage.exemple.test/devis-essai.pdf';
const LIGNES = [{ id: 'l1', libelle: 'Carrelage', familleId: 'famille-1', type: 'fourniture', quantite: 10, unite: 'm²', prixAchat: 40, prixVente: 60, tauxTva: 20 }];

async function devis(id, valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument(`devis_devis/${id}`, {
    racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', personneId: null, organisationId: 'o1', modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: '2026-12-31', objet: 'Rénovation restaurant',
    destinataires: ['contact@exemple.fr'], sections: [{ id: 's1', titre: 'Cuisine', lignes: LIGNES }],
    creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, ...valeurs,
  });
}
const FINALISE = { numero: 'DEV-2026-10-02-001', statut: 'en_attente_envoi', finaliseLe: new Date() };
async function donnees() {
  await creerOrganisation('o1', { nom: 'M. Paul Exemple' });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', organisationId: 'o1' });
  await devis('dBrouillon');
  await devis('dOk', { ...FINALISE, pdf: { statut: 'ok', chemin: 'devis/a1/d.pdf', nom: 'Devis DEV-2026-10-02-001.pdf', tentatives: 1 } });
  await devis('dEchec', { ...FINALISE, numero: 'DEV-2026-10-02-002', pdf: { statut: 'echec', message: 'Le moteur du PDF ne répond pas.', tentatives: 3 } });
  await devis('dEnCours', { ...FINALISE, numero: 'DEV-2026-10-02-003', pdf: { statut: 'en_cours', demarreLe: new Date(), tentatives: 1 } });
  await devis('dSansPdf', { ...FINALISE, numero: 'DEV-2026-10-02-004' }); // finalisé avant l'arrivée des PDF
}

/**
 * Faux serveur. `reponses` : { pdfLien?: (corps) => { statut, corps }, pdf?: (corps) => { statut, corps }, delaiPdf?: ms }. `appels` reçoit [nom, données, objetEnregistre].
 * Par défaut : devisPdfLien rend un lien signé ; devisPdf passe le PDF à « ok » (comme le serveur) ou, en brouillon, rend { statut: 'ok' }.
 */
async function simulerServeur(page, appels, reponses = {}) {
  await page.context().route('https://stockage.exemple.test/**', (route) => route.fulfill({ status: 200, contentType: 'text/html', body: '<p>PDF d’essai</p>' }));
  const repondre = async (route, nom, calcul) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const donneesAppel = JSON.parse(route.request().postData()).data;
    const doc = await lireDocument(`devis_devis/${donneesAppel.devisId}`);
    appels.push([nom, donneesAppel, doc?.objet]);
    const r = await calcul(donneesAppel);
    return route.fulfill({ status: r.statut, headers: cors, body: JSON.stringify(r.corps) });
  };
  await page.route('**/devisPdfLien', (route) => repondre(route, 'devisPdfLien', async (d) => (reponses.pdfLien
    ? reponses.pdfLien(d)
    : d.devisId === 'dBrouillonSansPdf' ? erreurServeur(404, 'NOT_FOUND', 'Aucun PDF brouillon pour ce devis : crée-le d’abord.')
    : { statut: 200, corps: { result: { url: URL_PDF, expireDans: 300, nom: d.brouillon ? 'Brouillon.pdf' : 'Devis DEV-2026-10-02-001.pdf' } } })));
  await page.route('**/devisPdf', (route) => repondre(route, 'devisPdf', async (d) => {
    if (reponses.delaiPdf) await new Promise((r) => setTimeout(r, reponses.delaiPdf));
    if (reponses.pdf) return reponses.pdf(d);
    if (!d.brouillon) await ecrireDocument(`devis_devis/${d.devisId}`, { pdf: { statut: 'ok', chemin: 'devis/a1/d.pdf', nom: 'Devis.pdf', tentatives: 1 } });
    return { statut: 200, corps: { result: { statut: 'ok', lien: `https://chevalier-ia-os.web.app/#/devis/pdf/${d.devisId}${d.brouillon ? '/brouillon' : ''}`, nom: d.brouillon ? 'Brouillon' : 'Devis' } } };
  }));
}
const erreurServeur = (statut, code, message) => ({ statut, corps: { error: { status: code, message } } });

async function ouvrirRoute(page, route) {
  await connecter(page, undefined, { route });
  await expect(page.locator('.page-pdf-devis, .page-liste-devis, .page-editeur-devis').first()).toBeVisible();
  await attendreCalme(page);
}
const zone = (page) => page.locator('[data-zone="pdf-devis"]');

// ------------------------------------------------------------------ point 1 : la route

test('1 #/devis/pdf/<id> : demande un lien signé, ouvre le PDF dans un nouvel onglet et garde un lien « Ouvrir le PDF »', async ({ page }, info) => {
  await donnees();
  const appels = [];
  await simulerServeur(page, appels);
  const ouverture = page.waitForEvent('popup');
  await connecter(page, undefined, { route: 'devis/pdf/dOk' });
  const popup = await ouverture;
  expect(popup.url()).toBe(URL_PDF);
  await expect(zone(page)).toHaveAttribute('data-etat', 'pret');
  await expect(zone(page).locator('[data-action="ouvrir-pdf"]')).toHaveAttribute('href', URL_PDF);
  await expect(zone(page).locator('[data-action="ouvrir-pdf"]')).toHaveAttribute('target', '_blank');
  await expect(zone(page).locator('[data-valeur="message-pdf"]')).toContainText('s’ouvre dans un nouvel onglet');
  expect(appels.filter(([nom]) => nom === 'devisPdfLien')).toHaveLength(1);
  expect(appels[0][1]).toEqual({ devisId: 'dOk' });
  await capturer(page, info, '1-pdf-pret');
  await popup.close();
});

test('1 #/devis/pdf/<id>/brouillon : lien du PDF brouillon ; absent -> message clair avec « Ouvrir le devis »', async ({ page }, info) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'le faux serveur répond une erreur (404, 412, 500) : le navigateur la note dans sa console' });
  await donnees();
  const appels = [];
  await simulerServeur(page, appels);
  const ouverture = page.waitForEvent('popup');
  await connecter(page, undefined, { route: 'devis/pdf/dBrouillon/brouillon' });
  const popup = await ouverture;
  expect(popup.url()).toBe(URL_PDF);
  expect(appels[0][1]).toEqual({ devisId: 'dBrouillon', brouillon: true });
  await expect(zone(page).locator('[data-action="retour-apres-pdf"]')).toHaveAttribute('href', /#\/devis\/editeur\/dBrouillon$/);
  await popup.close();
  // Aucun PDF brouillon rangé (devis « dBrouillonSansPdf » : le faux serveur répond « introuvable ») -> on dit quoi faire.
  await devis('dBrouillonSansPdf');
  await page.goto('/?emulateurs=1#/devis/pdf/dBrouillonSansPdf/brouillon');
  await expect(zone(page)).toHaveAttribute('data-etat', 'pas-pret');
  await expect(zone(page).locator('[data-valeur="message-pdf"]')).toContainText('Télécharger le PDF');
  await expect(zone(page).locator('[data-action="ouvrir-editeur"]')).toBeVisible();
  await capturer(page, info, '1-pdf-brouillon-absent');
});

test('4 le bouton de retour ramène à la page d’où l’on vient : le devis (visualisation) ou la liste', async ({ page }, info) => {
  await donnees();
  const appels = [];
  await simulerServeur(page, appels);
  await connecter(page, undefined, { route: 'devis/voir/dOk' });
  let ouverture = page.waitForEvent('popup');
  await page.evaluate(() => { location.hash = '#/devis/pdf/dOk'; });
  let popup = await ouverture;
  const retour = zone(page).locator('[data-action="retour-apres-pdf"]');
  await expect(retour).toHaveAttribute('href', /#\/devis\/voir\/dOk$/);
  await expect(retour).toHaveText('Retour au devis');
  await expect(zone(page).locator('xpath=ancestor::div[contains(@class,"page-pdf-devis")]').locator('[data-action="retour-liste"]')).toHaveAttribute('href', /#\/devis\/voir\/dOk$/); // la flèche en haut ramène au même devis
  await capturer(page, info, '4-retour-au-devis');
  await popup.close();
  await retour.click();
  await expect(page).toHaveURL(/#\/devis\/voir\/dOk$/);
  // Depuis la liste : retour à la liste.
  await page.evaluate(() => { location.hash = '#/devis/liste'; });
  await expect(page).toHaveURL(/#\/devis\/liste$/);
  ouverture = page.waitForEvent('popup');
  await page.evaluate(() => { location.hash = '#/devis/pdf/dOk'; });
  popup = await ouverture;
  await expect(retour).toHaveAttribute('href', /#\/devis\/liste$/);
  await expect(retour).toHaveText('Retour aux devis');
  await expect(page.locator('[data-action="retour-liste"]')).toHaveAttribute('href', /#\/devis\/liste$/);
  await popup.close();
});

test('1 PDF pas prêt (« en cours de fabrication ») et échec : message clair et « Réessayer » (qui relance le serveur puis ouvre le PDF)', async ({ page }, info) => {
  await donnees();
  const appels = [];
  await simulerServeur(page, appels);
  await ouvrirRoute(page, 'devis/pdf/dEnCours');
  await expect(zone(page)).toHaveAttribute('data-etat', 'en-cours');
  await expect(zone(page).locator('[data-valeur="message-pdf"]')).toContainText('en cours de fabrication');
  await expect(zone(page).locator('[data-action="reessayer-pdf"]')).toBeVisible();
  expect(appels).toHaveLength(0); // rien n'est demandé tant que le serveur travaille
  await capturer(page, info, '1-pdf-en-cours');
  // Échec : le message du serveur est montré ; « Réessayer » demande devisPdf (le simulateur range le PDF), puis le lien signé.
  await page.goto('/?emulateurs=1#/devis/pdf/dEchec');
  await expect(zone(page)).toHaveAttribute('data-etat', 'echec');
  await expect(zone(page).locator('[data-valeur="message-pdf"]')).toContainText('Le moteur du PDF ne répond pas.');
  await capturer(page, info, '1-pdf-echec');
  const ouverture = page.waitForEvent('popup');
  await zone(page).locator('[data-action="reessayer-pdf"]').click();
  const popup = await ouverture;
  expect(popup.url()).toBe(URL_PDF);
  expect(appels.map(([nom]) => nom)).toEqual(['devisPdf', 'devisPdfLien']);
  await expect(zone(page)).toHaveAttribute('data-etat', 'pret');
  await popup.close();
});

test('1 erreur du serveur au « Réessayer » : message lisible et nouveau bouton ; devis introuvable : état vide avec retour à la liste', async ({ page }, info) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'le faux serveur répond une erreur (404, 412, 500) : le navigateur la note dans sa console' });
  await donnees();
  const appels = [];
  await simulerServeur(page, appels, { pdf: () => erreurServeur(500, 'INTERNAL', 'Le PDF n’a pas pu être fabriqué. Réessaie dans un instant.') });
  await ouvrirRoute(page, 'devis/pdf/dSansPdf');
  await expect(zone(page)).toHaveAttribute('data-etat', 'pas-pret');
  await zone(page).locator('[data-action="reessayer-pdf"]').click();
  await expect(zone(page)).toHaveAttribute('data-etat', 'echec');
  await expect(zone(page).locator('[data-valeur="message-pdf"]')).toContainText('Ça n’a pas abouti');
  await expect(zone(page).locator('[data-action="reessayer-pdf"]')).toBeVisible();
  await capturer(page, info, '1-pdf-erreur-reessai');
  await page.goto('/?emulateurs=1#/devis/pdf/inexistant');
  await expect(zone(page)).toHaveAttribute('data-etat', 'introuvable');
  await expect(zone(page)).toContainText('Ce devis est introuvable');
  await expect(zone(page).locator('[data-action="retour-liste-introuvable"]')).toBeVisible();
  await capturer(page, info, '1-pdf-introuvable');
});

// ------------------------------------------------------------------ point 2 : « Télécharger le PDF » dans l'éditeur (menu « … »)

async function ouvrirEditeur(page, id) {
  await connecter(page, undefined, { route: `devis/editeur/${id}` });
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
}
/** Le chemin vers le PDF : menu « … » > « Télécharger le PDF » (ordinateur et téléphone). Le bouton « Envoyer » ne sert plus qu'à l'e-mail. */
async function cliquerTelechargerPdf(page) {
  await page.locator('[data-action="plus-actions"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Télécharger le PDF' }).click();
}

test('2 « Télécharger le PDF » (menu « … ») : enregistre d’abord le devis, demande le PDF brouillon au serveur, dit « PDF enregistré dans l’affaire », puis ouvre l’écran du PDF', async ({ page }, info) => {
  await donnees();
  const appels = [];
  await simulerServeur(page, appels, { delaiPdf: 1200 });
  await ouvrirEditeur(page, 'dBrouillon');
  if (await page.locator('[data-champ="objet"]').isHidden()) await page.locator('[data-action="description"]').click();
  await page.locator('[data-champ="objet"]').fill('Objet modifié juste avant le PDF');
  await expect(page.locator('[data-action="enregistrer-pdf"]')).toHaveCount(0); // plus de bouton « Enregistrer PDF » : un seul chemin
  await cliquerTelechargerPdf(page);
  await expect(page).toHaveURL(/#\/devis\/pdf\/dBrouillon\/brouillon$/, { timeout: 10000 });
  await expect(page.locator('.toast').filter({ hasText: 'PDF enregistré dans l’affaire' })).toBeVisible();
  expect(appels.filter((a) => a[0] === 'devisPdf')).toHaveLength(1);
  const appel = appels.find((a) => a[0] === 'devisPdf');
  expect(appel[1]).toEqual({ devisId: 'dBrouillon', brouillon: true });
  expect(appel[2]).toBe('Objet modifié juste avant le PDF'); // le serveur voit déjà le texte de l'écran
  await capturer(page, info, '2-pdf-brouillon-ouvert');
});

test('2 « Télécharger le PDF » : erreur du serveur = message lisible, on reste dans l’éditeur ; un devis finalisé ouvre directement son PDF', async ({ page }, info) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'le faux serveur répond une erreur (404, 412, 500) : le navigateur la note dans sa console' });
  await donnees();
  const appels = [];
  await simulerServeur(page, appels, { pdf: () => erreurServeur(412, 'FAILED_PRECONDITION', 'PDF non configuré : l’espace de stockage des PDF est introuvable.') });
  await ouvrirEditeur(page, 'dBrouillon');
  await cliquerTelechargerPdf(page);
  await expect(page.locator('.toast-erreur').filter({ hasText: 'PDF non configuré' })).toBeVisible();
  await expect(page).toHaveURL(/#\/devis\/editeur\/dBrouillon$/);
  await capturer(page, info, '2-pdf-erreur');
  await page.goto('/?emulateurs=1#/devis/editeur/dOk');
  await expect(page.locator('[data-valeur="lecture-seule"]')).toBeVisible();
  await cliquerTelechargerPdf(page);
  await expect(page).toHaveURL(/#\/devis\/pdf\/dOk$/);
  await capturer(page, info, '2-devis-finalise-ouvre-son-pdf');
});

// ------------------------------------------------------------------ point 3 : la liste (la fiche du devis n'existe plus)

const ligneDevis = (page, id) => page.locator(`tr.ligne-devis[data-id="${id}"], article.carte-devis[data-id="${id}"]`).first();

test('3 liste : « PDF non rangé » (avertissement) pour un finalisé sans PDF prêt ; lien « PDF » quand il est prêt ; rien sur un brouillon', async ({ page }, info) => {
  await donnees();
  const appels = [];
  await simulerServeur(page, appels);
  await connecter(page, undefined, { route: 'devis/liste' });
  await expect(page.locator('.page-liste-devis')).toBeVisible();
  await attendreCalme(page);
  await expect(ligneDevis(page, 'dEchec').locator('[data-pdf="non_range"]')).toHaveAccessibleName('PDF non rangé : réessayer');
  await expect(ligneDevis(page, 'dSansPdf').locator('[data-pdf="non_range"]')).toBeVisible();
  await expect(ligneDevis(page, 'dOk').locator('[data-pdf="pret"]')).toHaveAttribute('href', /#\/devis\/pdf\/dOk$/);
  await expect(ligneDevis(page, 'dEnCours').locator('[data-pdf="en_cours"]')).toBeVisible();
  await expect(ligneDevis(page, 'dBrouillon').locator('[data-pdf]')).toHaveCount(0);
  await capturer(page, info, '3-liste-pdf');
  // Clic sur l'avertissement : état « en cours » pendant l'appel, puis le lien « PDF » (le serveur a rangé le PDF) ; la fiche ne s'ouvre pas.
  await page.unroute('**/devisPdf');
  await page.route('**/devisPdf', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const d = JSON.parse(route.request().postData()).data;
    appels.push(['devisPdf', d]);
    await new Promise((r) => setTimeout(r, 1000));
    await ecrireDocument(`devis_devis/${d.devisId}`, { pdf: { statut: 'ok', chemin: 'devis/a1/d.pdf', nom: 'Devis.pdf', tentatives: 2 } });
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { statut: 'ok', lien: 'x', nom: 'Devis' } }) });
  });
  await ligneDevis(page, 'dEchec').locator('[data-pdf="non_range"]').click();
  await expect(ligneDevis(page, 'dEchec').locator('[data-pdf="en_cours"]')).toBeVisible();
  await capturer(page, info, '3-liste-pdf-en-cours');
  await expect(ligneDevis(page, 'dEchec').locator('[data-pdf="pret"]')).toBeVisible({ timeout: 10000 });
  expect(appels.filter(([nom]) => nom === 'devisPdf')).toEqual([['devisPdf', { devisId: 'dEchec' }]]);
  await expect(page.locator('[data-role="fiche-devis"]')).toHaveCount(0);
});
