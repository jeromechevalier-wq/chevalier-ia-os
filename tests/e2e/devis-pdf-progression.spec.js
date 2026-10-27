// Module Devis, PDF : retour visuel pendant que le serveur fabrique le PDF (« Télécharger le PDF », « Ouvrir le PDF », « Imprimer » du menu « … » : plus de page « PDF »).
// Un test par point (le nom commence par le numéro). Captures dans tests/e2e/captures/devis-pdf-progression/ (ordinateur ET téléphone).
// Le serveur du PDF est SIMULÉ (page.route) et rendu lent à volonté ; il lit aussi le devis enregistré comme le vrai.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, lireDocument, creerOrganisation, creerAffaire, estTelephone, JEROME } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-pdf-progression/', import.meta.url));
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
/** Écrit le champ `pdf` d'un devis comme le serveur, sans toucher au reste du devis (l'éditeur est ouvert dessus). */
async function ecrirePdf(id, pdf) {
  const actuel = await lireDocument(`devis_devis/${id}`);
  await ecrireDocument(`devis_devis/${id}`, { ...actuel, pdf });
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
  await page.context().route('https://stockage.exemple.test/**', (route) => route.fulfill({ status: 200, headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="Devis.pdf"' }, body: '%PDF-1.4' })); // comme le lien signé « en pièce jointe » : le fichier s'enregistre, la page ne change pas
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
    if (!d.brouillon) await ecrirePdf(d.devisId, { statut: 'ok', chemin: 'devis/a1/d.pdf', nom: 'Devis.pdf', tentatives: 1 });
    return { statut: 200, corps: { result: { statut: 'ok', lien: `https://chevalier-ia-os.web.app/#/devis/pdf/${d.devisId}${d.brouillon ? '/brouillon' : ''}`, nom: d.brouillon ? 'Brouillon' : 'Devis' } } };
  }));
}
const erreurServeur = (statut, code, message) => ({ statut, corps: { error: { status: code, message } } });

async function ouvrirEditeur(page, id) {
  await connecter(page, undefined, { route: `devis/editeur/${id}` });
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
}
const ouvrirMenuPlus = (page) => page.locator('[data-action="plus-actions"]').click();
const entree = (page, nom) => page.locator('.menu-pop').getByRole('menuitem', { name: nom });
const pastille = (page) => page.locator('[data-zone="pdf-attente"]');

test('1 « Télécharger le PDF » : pendant l’attente, une pastille « Fabrication du PDF… » (annoncée, indicateur animé) apparaît et le bouton « … » est occupé ; à la fin elle disparaît', async ({ page }, info) => {
  await donnees();
  const appels = [];
  await simulerServeur(page, appels, { delaiPdf: 3000 });
  await ouvrirEditeur(page, 'dBrouillon');
  await ouvrirMenuPlus(page);
  await entree(page, 'Télécharger le PDF').click();
  await expect(pastille(page)).toBeVisible();
  await expect(pastille(page)).toHaveAttribute('role', 'status');
  await expect(pastille(page)).toContainText('Fabrication du PDF…');
  await expect(pastille(page).locator('.rond-chargement')).toBeVisible();
  await expect(page.locator('[data-action="plus-actions"]')).toHaveAttribute('aria-busy', 'true');
  await capturer(page, info, '1-attente-editeur');
  await expect(pastille(page)).toHaveCount(0, { timeout: 15000 });
  await expect(page).toHaveURL(/#\/devis\/editeur\/dBrouillon$/); // on n'a pas quitté le devis
  expect(appels.map(([nom]) => nom)).toEqual(['devisPdf', 'devisPdfLien']);
});

test('1 « Imprimer » (brouillon) : même pastille pendant l’attente', async ({ page }) => {
  await donnees();
  await simulerServeur(page, [], { delaiPdf: 2500 });
  await ouvrirEditeur(page, 'dBrouillon');
  await ouvrirMenuPlus(page);
  await entree(page, 'Imprimer').click();
  await expect(pastille(page)).toContainText('Fabrication du PDF…');
  await expect(pastille(page)).toHaveCount(0, { timeout: 15000 });
  await expect(page).toHaveURL(/#\/devis\/editeur\/dBrouillon$/);
});

test('2 pendant l’attente, « Télécharger le PDF », « Ouvrir le PDF » et « Imprimer » sont grisés dans le menu : un second clic ne lance pas une deuxième génération', async ({ page }, info) => {
  await donnees();
  const appels = [];
  await simulerServeur(page, appels, { delaiPdf: 3000 });
  await ouvrirEditeur(page, 'dBrouillon');
  await ouvrirMenuPlus(page);
  await entree(page, 'Télécharger le PDF').click();
  await expect(pastille(page)).toBeVisible();
  await ouvrirMenuPlus(page);
  await expect(entree(page, 'Fabrication du PDF…')).toBeDisabled();
  await expect(entree(page, 'Imprimer')).toBeDisabled();
  await expect(entree(page, 'Ouvrir le PDF')).toBeDisabled();
  await capturer(page, info, '2-menu-grise');
  await entree(page, 'Fabrication du PDF…').click({ force: true });
  await expect(pastille(page)).toHaveCount(0, { timeout: 15000 });
  expect(appels.filter((a) => a[0] === 'devisPdf')).toHaveLength(1);
});

test('3 erreur du serveur : message clair, la pastille disparaît, le bouton « … » n’est plus occupé et « Télécharger le PDF » redevient utilisable', async ({ page }, info) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'le faux serveur répond une erreur 500 : le navigateur la note dans sa console' });
  await donnees();
  const appels = [];
  await simulerServeur(page, appels, { delaiPdf: 800, pdf: () => erreurServeur(412, 'FAILED_PRECONDITION', 'PDF non configuré : l’espace de stockage des PDF est introuvable.') });
  await ouvrirEditeur(page, 'dBrouillon');
  await ouvrirMenuPlus(page);
  await entree(page, 'Télécharger le PDF').click();
  await expect(pastille(page)).toBeVisible();
  await expect(page.locator('.toast-erreur').filter({ hasText: 'PDF non configuré' })).toBeVisible();
  await expect(pastille(page)).toHaveCount(0);
  await expect(page.locator('[data-action="plus-actions"]')).not.toHaveAttribute('aria-busy', 'true');
  await capturer(page, info, '3-erreur-editeur');
  await expect(page).toHaveURL(/#\/devis\/editeur\/dBrouillon$/);
  await page.keyboard.press('Escape');
  await ouvrirMenuPlus(page);
  await expect(entree(page, 'Télécharger le PDF')).toBeEnabled();
  await entree(page, 'Télécharger le PDF').click();
  await expect(pastille(page)).toBeVisible();
  await expect.poll(() => appels.filter((a) => a[0] === 'devisPdf').length).toBe(2);
});

test('4 devis finalisé dont le PDF est à refaire : « Ouvrir le PDF » montre « Fabrication du PDF… » (aria-busy), un second clic ne relance rien, puis le PDF s’ouvre ; erreur = message avec « Réessayer »', async ({ page }, info) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'le faux serveur répond une erreur 500 : le navigateur la note dans sa console' });
  await donnees();
  const appels = [];
  let echec = false;
  await simulerServeur(page, appels, { delaiPdf: 2500, pdf: async (d) => {
    if (echec) return erreurServeur(500, 'INTERNAL', 'x');
    await ecrirePdf(d.devisId, { statut: 'ok', chemin: 'devis/a1/d.pdf', nom: 'Devis.pdf', tentatives: 2 });
    return { statut: 200, corps: { result: { statut: 'ok', lien: 'x', nom: 'Devis' } } };
  } });
  await ouvrirEditeur(page, 'dEchec');
  await ouvrirMenuPlus(page);
  const ouverture = page.waitForEvent('popup');
  await entree(page, 'Ouvrir le PDF').click();
  await expect(pastille(page)).toContainText('Fabrication du PDF…');
  await expect(page.locator('[data-action="plus-actions"]')).toHaveAttribute('aria-busy', 'true');
  await expect(pastille(page).locator('.rond-chargement')).toBeVisible();
  await capturer(page, info, '4-ouvrir-pdf-attente');
  await ouvrirMenuPlus(page);
  await entree(page, 'Ouvrir le PDF').click(); // second clic : ignoré
  const popup = await ouverture;
  await popup.close();
  await expect(pastille(page)).toHaveCount(0);
  expect(appels.filter((a) => a[0] === 'devisPdf')).toHaveLength(1);
  // Erreur : message, « Réessayer » dans le message, jamais de page.
  echec = true;
  await ecrirePdf('dSansPdf', { statut: 'echec', message: 'Le moteur du PDF ne répond pas.', tentatives: 3 });
  await page.goto('/?emulateurs=1#/devis/editeur/dSansPdf');
  await expect(page.locator('.page-editeur-devis[data-devis="dSansPdf"]')).toBeVisible();
  await attendreCalme(page);
  await ouvrirMenuPlus(page);
  await entree(page, 'Ouvrir le PDF').click();
  await expect(page.locator('.toast-erreur [data-action="toast-action"]')).toHaveText('Réessayer', { timeout: 15000 });
  await expect(page.locator('[data-action="plus-actions"]')).not.toHaveAttribute('aria-busy', 'true');
  await expect(page).toHaveURL(/#\/devis\/editeur\/dSansPdf$/);
  await capturer(page, info, '4-ouvrir-pdf-erreur');
});
