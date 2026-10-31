// Module Devis : il n'y a plus de page « PDF du devis » (décision de Jérôme du 27/10/2026, « on dirait une page technique qu'on ne devrait jamais voir »).
// Le PDF s'ouvre (nouvel onglet) ou se télécharge depuis le menu « … » du devis, la liste des devis et l'onglet Devis de l'affaire, sans quitter l'écran.
// Un test par point du brief (le nom commence par le numéro du point). Captures dans tests/e2e/captures/devis-sans-page-pdf/ (ordinateur ET téléphone).
// Ce fichier reprend ce que couvrait l'ancien devis-pdf-ecran.spec.js (écran du PDF supprimé) : PDF prêt, en cours, échec, erreur, brouillon, liste, retrait du Drive.
// Les fonctions du serveur (devisPdf, devisPdfLien) n'existent pas dans l'émulateur du navigateur : elles sont SIMULÉES par page.route.
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { test, expect, connecter, attendreCalme, ecrireDocument, lireDocument, creerOrganisation, creerAffaire, ouvrirDocuments, JEROME } from './outils.js';
import { brancherGoogle, choisirDansGoogle, lireGoogle } from './google-simule.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-sans-page-pdf/', import.meta.url));
const DOSSIER_RETRAIT = fileURLToPath(new URL('./captures/devis-retrait-drive/', import.meta.url));
async function capturer(page, info, nom, dossier = DOSSIER) {
  await mkdir(dossier, { recursive: true });
  await page.screenshot({ path: `${dossier}${nom}-${info.project.name}.png`, animations: 'disabled' });
}
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const URL_PDF = 'https://stockage.exemple.test/devis-essai.pdf';
const LIGNES = [{ id: 'l1', libelle: 'Carrelage', familleId: 'famille-1', type: 'fourniture', quantite: 10, unite: 'm²', prixAchat: 40, prixVente: 60, tauxTva: 20 }];
const PDF_OK = { statut: 'ok', chemin: 'devis/a1/d.pdf', nom: 'Devis DEV-2026-10-02-001.pdf', tentatives: 1 };

async function devis(id, valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument(`devis_devis/${id}`, {
    racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', personneId: null, organisationId: 'o1', modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: '2099-12-31', objet: 'Rénovation restaurant',
    destinataires: ['contact@exemple.fr'], sections: [{ id: 's1', titre: 'Cuisine', lignes: LIGNES }],
    creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, ...valeurs,
  });
}
const FINALISE = { numero: 'DEV-2026-10-02-001', statut: 'en_attente_envoi', finaliseLe: new Date(), dateEmission: '2026-10-02', totaux: { ht: 600, ttc: 720 } };
async function donnees() {
  await creerOrganisation('o1', { nom: 'M. Paul Exemple' });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', organisationId: 'o1' });
  await devis('dBrouillon');
  await devis('dOk', { ...FINALISE, pdf: PDF_OK });
  await devis('dEchec', { ...FINALISE, numero: 'DEV-2026-10-02-002', pdf: { statut: 'echec', message: 'Le moteur du PDF ne répond pas.', tentatives: 3 } });
  await devis('dEnCours', { ...FINALISE, numero: 'DEV-2026-10-02-003', pdf: { statut: 'en_cours', demarreLe: new Date(), tentatives: 1 } });
  await devis('dSansPdf', { ...FINALISE, numero: 'DEV-2026-10-02-004' }); // finalisé avant l'arrivée des PDF
}

/**
 * Faux serveur. `reponses` : { pdfLien?: (corps) => { statut, corps }, pdf?: (corps) => { statut, corps }, delaiPdf?: ms }. `appels` reçoit [nom, données, objetEnregistre].
 * Par défaut : devisPdfLien rend un lien signé ; devisPdf passe le PDF à « ok » (comme le serveur) ou, en brouillon, rend { statut: 'ok' }.
 */
async function simulerServeur(page, appels, reponses = {}) {
  await page.context().route('https://stockage.exemple.test/**', (route) => route.fulfill({ status: 200, headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="Devis.pdf"' }, body: '%PDF-1.4' }));
  const repondre = async (route, nom, calcul) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const donneesAppel = JSON.parse(route.request().postData()).data;
    const doc = await lireDocument(`devis_devis/${donneesAppel.devisId}`);
    appels.push([nom, donneesAppel, doc?.objet]);
    const r = await calcul(donneesAppel);
    return route.fulfill({ status: r.statut, headers: cors, body: JSON.stringify(r.corps) });
  };
  await page.route('**/devisPdfLien', (route) => repondre(route, 'devisPdfLien', async (d) => (reponses.pdfLien?.(d)
    ?? (d.devisId === 'dBrouillonSansPdf' ? erreurServeur(404, 'NOT_FOUND', 'Aucun PDF brouillon pour ce devis : crée-le d’abord.')
      : { statut: 200, corps: { result: { url: URL_PDF, expireDans: 300, nom: d.brouillon ? 'Brouillon.pdf' : 'Devis DEV-2026-10-02-001.pdf' } } }))));
  await page.route('**/devisPdf', (route) => repondre(route, 'devisPdf', async (d) => {
    if (reponses.delaiPdf) await new Promise((r) => setTimeout(r, reponses.delaiPdf));
    if (reponses.pdf) return reponses.pdf(d);
    if (!d.brouillon) await ecrirePdf(d.devisId, PDF_OK);
    return { statut: 200, corps: { result: { statut: 'ok', lien: 'x', nom: d.brouillon ? 'Brouillon' : 'Devis' } } };
  }));
}
const erreurServeur = (statut, code, message) => ({ statut, corps: { error: { status: code, message } } });

async function ouvrirEditeur(page, id) {
  await connecter(page, undefined, { route: `devis/editeur/${id}` });
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
}
/** Change de devis dans la même session (connecter() ne se rappelle qu'une fois par test). */
async function allerEditeur(page, id) {
  await page.goto(`/?emulateurs=1#/devis/editeur/${id}`);
  await expect(page.locator(`.page-editeur-devis[data-devis="${id}"]`)).toBeVisible();
  await attendreCalme(page);
}
/** Écrit le champ `pdf` d'un devis comme le serveur, sans toucher au reste du devis. */
async function ecrirePdf(id, pdf) {
  const actuel = await lireDocument(`devis_devis/${id}`);
  await ecrireDocument(`devis_devis/${id}`, { ...actuel, pdf });
}
const ouvrirMenuPlus = (page) => page.locator('[data-action="plus-actions"]').click();
const entree = (page, nom) => page.locator('.menu-pop').getByRole('menuitem', { name: nom });
/** Ouvre le menu qui porte « Télécharger le PDF » et « Imprimer » : celui d'« Envoyer » quand il est actif (devis finalisé), sinon « … » (31/10/2026). */
async function ouvrirMenuPdf(page) {
  const envoyer = page.locator('[data-action="envoyer"]');
  if ((await envoyer.count()) && (await envoyer.getAttribute('aria-disabled')) !== 'true') await envoyer.click();
  else await ouvrirMenuPlus(page);
}
/** Choisit une entrée du menu qui la porte (ordinateur et téléphone). « Ouvrir le PDF » n'existe plus dans l'éditeur : « Imprimer » ouvre le même PDF. */
async function depuisMenu(page, nom) {
  await ouvrirMenuPdf(page);
  await entree(page, nom === 'Ouvrir le PDF' ? 'Imprimer' : nom).click();
}
/** 10h : à aucun moment une page « PDF » n'est affichée, l'adresse reste celle du devis. */
async function aucunePageTechnique(page, adresse) {
  await expect(page.locator('.page-pdf-devis, [data-zone="pdf-devis"]')).toHaveCount(0);
  expect(page.url()).not.toMatch(/devis\/pdf/);
  if (adresse) expect(page.url()).toMatch(adresse);
}
/**
 * Note les ouvertures de fenêtre (window.open) au lieu de lire popup.url() : dans ce bac à sable une fenêtre ouverte n'a pas d'adresse (déjà le cas de l'ancien devis-pdf-ecran.spec.js).
 * À appeler AVANT d'ouvrir la page. `bloque` : le navigateur refuse la fenêtre (window.open rend null).
 */
async function noterOuvertures(page, { bloque = false } = {}) {
  await page.addInitScript((refuse) => { window.__ouvertures = []; window.open = (u) => { if (refuse) { if (u) window.__ouvertures.push(String(u)); return null; } if (u) window.__ouvertures.push(String(u)); return { opener: null, close() {}, set location(v) { window.__ouvertures.push(String(v)); } }; }; }, bloque);
}
const ouvertures = (page) => page.evaluate(() => window.__ouvertures);
const requetesGoogle = (page) => { const l = []; page.on('request', (r) => { if (/apis\.google\.com|accounts\.google\.com|googleapis\.com\/(drive|upload)/.test(r.url())) l.push(r.url()); }); return l; };

// ------------------------------------------------------------------ 10a : le menu « … »

test('10a le PDF d’un devis : brouillon = « Télécharger le PDF » et « Imprimer » dans « … » ; finalisé = dans le menu « Envoyer » ; « Ouvrir le PDF » n’existe plus', async ({ page }, info) => {
  await donnees();
  await simulerServeur(page, []);
  await ouvrirEditeur(page, 'dBrouillon');
  await ouvrirMenuPlus(page);
  for (const nom of ['Télécharger le PDF', 'Imprimer']) await expect(entree(page, nom)).toBeEnabled();
  await expect(entree(page, 'Ouvrir le PDF')).toHaveCount(0);
  await capturer(page, info, '10a-menu-brouillon');
  await page.keyboard.press('Escape');
  await allerEditeur(page, 'dOk');
  await expect(page.locator('[data-valeur="lecture-seule"]')).toBeVisible();
  await page.locator('[data-action="envoyer"]').click();
  for (const nom of ['Télécharger le PDF', 'Imprimer']) await expect(entree(page, nom)).toBeEnabled();
  await expect(entree(page, 'Ouvrir le PDF')).toHaveCount(0);
  await capturer(page, info, '10a-menu-finalise');
  await page.keyboard.press('Escape');
  await ouvrirMenuPlus(page);
  for (const nom of ['Télécharger le PDF', 'Imprimer', 'Ouvrir le PDF']) await expect(entree(page, nom)).toHaveCount(0);
});

// ------------------------------------------------------------------ 10b : PDF prêt

test('10b devis finalisé, PDF prêt : « Ouvrir le PDF » demande un lien signé et l’ouvre dans un nouvel onglet, sans quitter le devis ni parler à Google', async ({ page, context }, info) => {
  const drive = await brancherGoogle(context);
  await donnees();
  const appels = [];
  await simulerServeur(page, appels);
  await noterOuvertures(page);
  const google = requetesGoogle(page);
  await ouvrirEditeur(page, 'dOk');
  await depuisMenu(page, 'Ouvrir le PDF');
  await expect.poll(() => ouvertures(page)).toEqual([URL_PDF]);
  expect(appels.filter(([nom]) => nom === 'devisPdfLien').map(([nom, d]) => [nom, d])).toEqual([['devisPdfLien', { devisId: 'dOk' }]]);
  await aucunePageTechnique(page, /#\/devis\/editeur\/dOk$/);
  await expect(page.locator('[data-zone="pdf-lien-pret"]')).toHaveCount(0); // fenêtre ouverte : pas de bannière
  await page.waitForTimeout(400);
  expect(google, 'aucune requête vers Google').toEqual([]);
  expect((await lireGoogle(page)).autorisations).toHaveLength(0);
  expect(drive.requetes.length + drive.envois.length).toBe(0);
  await capturer(page, info, '10b-pdf-ouvert-on-reste-sur-le-devis');
});

test('10b « Télécharger le PDF » d’un devis finalisé : lien signé « en pièce jointe » (telecharger: true), le fichier s’enregistre sans quitter le devis', async ({ page }, info) => {
  await donnees();
  const appels = [];
  await simulerServeur(page, appels);
  await ouvrirEditeur(page, 'dOk');
  const telechargement = page.waitForEvent('download');
  await depuisMenu(page, 'Télécharger le PDF');
  expect((await telechargement).suggestedFilename()).toBe('Devis.pdf');
  expect(appels.filter((a) => a[0] === 'devisPdfLien').at(-1)[1]).toEqual({ devisId: 'dOk', telecharger: true });
  await aucunePageTechnique(page, /#\/devis\/editeur\/dOk$/);
  await capturer(page, info, '10b-apres-telechargement');
});

test('10b brouillon : « Télécharger le PDF » enregistre d’abord le devis, fabrique le PDF brouillon, dit « PDF brouillon prêt » et télécharge le fichier, sans quitter le devis', async ({ page }, info) => {
  await donnees();
  const appels = [];
  await simulerServeur(page, appels, { delaiPdf: 1200 });
  await ouvrirEditeur(page, 'dBrouillon');
  if (await page.locator('[data-champ="objet"]').isHidden()) await page.locator('[data-action="description"]').click();
  await page.locator('[data-champ="objet"]').fill('Objet modifié juste avant le PDF');
  await expect(page.locator('[data-action="enregistrer-pdf"]')).toHaveCount(0); // un seul chemin
  const telechargement = page.waitForEvent('download');
  await depuisMenu(page, 'Télécharger le PDF');
  await expect(page.locator('.toast').filter({ hasText: 'PDF brouillon prêt' })).toBeVisible();
  await telechargement;
  const noms = appels.map(([nom]) => nom);
  expect(noms).toEqual(['devisPdf', 'devisPdfLien']);
  expect(appels[0][1]).toEqual({ devisId: 'dBrouillon', brouillon: true });
  expect(appels[0][2]).toBe('Objet modifié juste avant le PDF'); // le serveur voit déjà le texte de l'écran
  expect(appels[1][1]).toEqual({ devisId: 'dBrouillon', brouillon: true, telecharger: true });
  await aucunePageTechnique(page, /#\/devis\/editeur\/dBrouillon$/);
  await capturer(page, info, '10b-brouillon-telecharge');
});

test('10b « Imprimer » un brouillon : aucune fenêtre « Finaliser », le devis reste brouillon, le PDF brouillon s’ouvre dans un nouvel onglet', async ({ page }, info) => {
  await donnees();
  const appels = [];
  await simulerServeur(page, appels);
  await noterOuvertures(page);
  await page.route('**/devisFinaliser', async (route) => { appels.push(['devisFinaliser']); return route.abort('failed'); });
  await ouvrirEditeur(page, 'dBrouillon');
  await depuisMenu(page, 'Imprimer');
  await expect.poll(() => ouvertures(page)).toEqual([URL_PDF]);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect(appels.map(([nom]) => nom)).toEqual(['devisPdf', 'devisPdfLien']);
  expect(appels[1][1]).toEqual({ devisId: 'dBrouillon', brouillon: true });
  expect((await lireDocument('devis_devis/dBrouillon')).statut).toBe('brouillon');
  await aucunePageTechnique(page, /#\/devis\/editeur\/dBrouillon$/);
  await capturer(page, info, '10b-imprimer-brouillon');
});

// ------------------------------------------------------------------ 10c : PDF pas prêt, cas d'erreur

test('10c PDF en cours de fabrication : message clair, pastille d’attente, puis le PDF s’ouvre tout seul quand le serveur a fini (aucun appel au lien avant)', async ({ page }, info) => {
  await donnees();
  const appels = [];
  await simulerServeur(page, appels);
  await noterOuvertures(page);
  await ouvrirEditeur(page, 'dEnCours');
  await depuisMenu(page, 'Ouvrir le PDF');
  await expect(page.locator('.toast').filter({ hasText: 'Le PDF est en cours de fabrication' })).toBeVisible();
  await expect(page.locator('[data-zone="pdf-attente"]')).toContainText('Fabrication du PDF…');
  expect(appels).toHaveLength(0); // rien n'est demandé tant que le serveur travaille
  await capturer(page, info, '10c-pdf-en-cours');
  await ecrirePdf('dEnCours', PDF_OK); // le serveur a fini
  await expect.poll(() => ouvertures(page)).toEqual([URL_PDF]);
  expect(appels.map(([nom]) => nom)).toEqual(['devisPdfLien']);
  await expect(page.locator('[data-zone="pdf-attente"]')).toHaveCount(0);
  await aucunePageTechnique(page, /#\/devis\/editeur\/dEnCours$/);
});

test('10c PDF à refaire (échec ou jamais fabriqué) : le serveur est relancé une fois, puis le PDF s’ouvre', async ({ page }) => {
  await donnees();
  const appels = [];
  await simulerServeur(page, appels, { delaiPdf: 600 });
  await noterOuvertures(page);
  await ouvrirEditeur(page, 'dEchec');
  await depuisMenu(page, 'Ouvrir le PDF');
  await expect(page.locator('[data-zone="pdf-attente"]')).toBeVisible();
  await expect.poll(() => ouvertures(page)).toEqual([URL_PDF]);
  expect(appels.map(([nom]) => nom)).toEqual(['devisPdf', 'devisPdfLien']);
});

test('10c erreur du serveur : message lisible avec « Réessayer » (qui relance), la pastille disparaît, jamais de page ; PDF brouillon introuvable : message qui dit quoi faire', async ({ page }, info) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'le faux serveur répond une erreur (404, 500) : le navigateur la note dans sa console' });
  await donnees();
  await devis('dBrouillonSansPdf');
  const appels = [];
  let echec = true;
  await simulerServeur(page, appels, { pdf: (d) => (echec ? erreurServeur(500, 'INTERNAL', 'x') : { statut: 200, corps: { result: { statut: 'ok', lien: 'x', nom: 'Devis' } } }) });
  await noterOuvertures(page);
  await ouvrirEditeur(page, 'dSansPdf');
  await depuisMenu(page, 'Ouvrir le PDF');
  await expect(page.locator('.toast-erreur')).toContainText('Ça n’a pas abouti');
  await expect(page.locator('.toast-erreur [data-action="toast-action"]')).toHaveText('Réessayer');
  await expect(page.locator('[data-zone="pdf-attente"]')).toHaveCount(0);
  await expect(page.locator('[data-action="plus-actions"]')).not.toHaveAttribute('aria-busy', 'true');
  await aucunePageTechnique(page, /#\/devis\/editeur\/dSansPdf$/);
  await capturer(page, info, '10c-erreur-reessayer');
  echec = false;
  await ecrirePdf('dSansPdf', PDF_OK);
  await page.locator('.toast-erreur [data-action="toast-action"]').click();
  await expect.poll(() => ouvertures(page)).toEqual([URL_PDF]);
  // Brouillon : le serveur dit qu'aucun PDF brouillon n'existe (cas d'erreur du lien).
  await allerEditeur(page, 'dBrouillonSansPdf');
  await depuisMenu(page, 'Ouvrir le PDF');
  await expect(page.locator('.toast-erreur').filter({ hasText: 'Aucun PDF brouillon' })).toBeVisible();
  await capturer(page, info, '10c-brouillon-introuvable');
});

// ------------------------------------------------------------------ 10d : fenêtre bloquée par le navigateur

test('10d fenêtre bloquée par le navigateur : une bannière avec un lien « Ouvrir le PDF » cliquable s’affiche, sans quitter le devis ; le clic ouvre le PDF et ferme la bannière', async ({ page }, info) => {
  await donnees();
  await simulerServeur(page, []);
  await noterOuvertures(page, { bloque: true }); // un navigateur qui bloque les fenêtres
  await ouvrirEditeur(page, 'dOk');
  await depuisMenu(page, 'Ouvrir le PDF');
  const banniere = page.locator('[data-zone="pdf-lien-pret"]');
  await expect(banniere).toBeVisible();
  await expect(banniere).toContainText('Le PDF est prêt');
  const lien = banniere.locator('[data-action="ouvrir-pdf-lien"]');
  await expect(lien).toHaveAttribute('href', URL_PDF);
  await expect(lien).toHaveAttribute('target', '_blank');
  await aucunePageTechnique(page, /#\/devis\/editeur\/dOk$/);
  expect(await ouvertures(page)).toEqual([URL_PDF]); // le navigateur a refusé la fenêtre : le lien de la bannière prend le relais
  await capturer(page, info, '10d-fenetre-bloquee-lien');
  const ouverture = page.waitForEvent('popup');
  await lien.click();
  const popup = await ouverture;
  await expect(banniere).toHaveCount(0);
});

// ------------------------------------------------------------------ 10f : anciennes adresses

test('10f une ancienne adresse #/devis/pdf/<id> (signet, e-mail déjà envoyé, lien des Documents d’une affaire) ouvre le devis, jamais « page introuvable » ni une page du PDF', async ({ page }, info) => {
  await donnees();
  await simulerServeur(page, []);
  await connecter(page, undefined, { route: 'devis/pdf/dOk' });
  await expect(page.locator('.page-editeur-devis[data-devis="dOk"]')).toBeVisible();
  await expect(page.locator('[data-valeur="lecture-seule"]')).toBeVisible(); // finalisé : lecture seule
  expect(page.url()).toMatch(/#\/devis\/editeur\/dOk$/);
  await aucunePageTechnique(page);
  await capturer(page, info, '10f-ancienne-adresse-devis-finalise');
  await page.goto('/?emulateurs=1#/devis/pdf/dBrouillon/brouillon');
  await expect(page.locator('.page-editeur-devis[data-devis="dBrouillon"]')).toBeVisible();
  expect(page.url()).toMatch(/#\/devis\/editeur\/dBrouillon$/);
  await page.goBack(); // la redirection remplace l'entrée : « retour » ne reboucle pas sur l'ancienne adresse
  expect(page.url()).not.toMatch(/devis\/pdf/);
  // Cas d'erreur : un devis qui n'existe plus -> l'éditeur dit qu'il est introuvable (même message que pour devis/editeur/<id>).
  await page.goto('/?emulateurs=1#/devis/pdf/inexistant');
  await expect(page.locator('.page-pdf-devis')).toHaveCount(0);
  expect(page.url()).toMatch(/#\/devis\/editeur\/inexistant$/);
  await capturer(page, info, '10f-ancienne-adresse-devis-introuvable');
});

// ------------------------------------------------------------------ 10g : liste des devis et onglet Devis de l'affaire

const ligneDevis = (page, id) => page.locator(`tr.ligne-devis[data-id="${id}"], article.carte-devis[data-id="${id}"]`).first();

test('10g liste des devis : le « PDF » d’un devis prêt est une action qui ouvre le PDF (sans changer d’écran) ; « PDF non rangé » relance ; rien sur un brouillon', async ({ page }, info) => {
  await donnees();
  const appels = [];
  await simulerServeur(page, appels);
  await noterOuvertures(page);
  await connecter(page, undefined, { route: 'devis/liste' });
  await expect(page.locator('.page-liste-devis')).toBeVisible();
  await attendreCalme(page);
  await expect(ligneDevis(page, 'dEchec').locator('[data-pdf="non_range"]')).toHaveAccessibleName('PDF non rangé : réessayer');
  await expect(ligneDevis(page, 'dSansPdf').locator('[data-pdf="non_range"]')).toBeVisible();
  await expect(ligneDevis(page, 'dEnCours').locator('[data-pdf="en_cours"]')).toBeVisible();
  await expect(ligneDevis(page, 'dBrouillon').locator('[data-pdf]')).toHaveCount(0);
  const pdf = ligneDevis(page, 'dOk').locator('[data-pdf="pret"]');
  await expect(pdf).toBeVisible();
  await expect(pdf).not.toHaveAttribute('href', /.+/); // une action, plus un lien vers une page
  await capturer(page, info, '10g-liste-pdf');
  // « PDF non rangé » : clic -> « en cours » (serveur simulé à 1 s) -> « PDF » prêt ; la ligne ne s'ouvre pas.
  await page.unroute('**/devisPdf');
  await page.route('**/devisPdf', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const d = JSON.parse(route.request().postData()).data;
    appels.push(['devisPdf', d]);
    await new Promise((r) => setTimeout(r, 1000));
    await ecrirePdf(d.devisId, PDF_OK);
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { statut: 'ok', lien: 'x', nom: 'Devis' } }) });
  });
  await ligneDevis(page, 'dEchec').locator('[data-pdf="non_range"]').click();
  await expect(ligneDevis(page, 'dEchec').locator('[data-pdf="en_cours"]')).toBeVisible();
  await capturer(page, info, '10g-liste-pdf-en-cours');
  await expect(ligneDevis(page, 'dEchec').locator('[data-pdf="pret"]')).toBeVisible({ timeout: 10000 });
  expect(appels.filter(([nom]) => nom === 'devisPdf')).toEqual([['devisPdf', { devisId: 'dEchec' }]]);
  await expect(page.locator('.page-liste-devis')).toBeVisible();
  await pdf.click();
  await expect.poll(() => ouvertures(page)).toEqual([URL_PDF]);
  await expect(page.locator('.page-liste-devis')).toBeVisible(); // on est resté sur la liste
  expect(page.url()).toMatch(/#\/devis\/liste$/);
  expect(appels.filter(([nom]) => nom === 'devisPdfLien').map(([nom, d]) => [nom, d])).toEqual([['devisPdfLien', { devisId: 'dOk' }]]);
});

test('10g onglet Devis de l’affaire : chaque devis finalisé au PDF prêt a « Ouvrir le PDF » et « Télécharger » ; un brouillon n’en a pas ; erreur du serveur = message avec « Réessayer »', async ({ page }, info) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'le faux serveur répond une erreur 500 : le navigateur la note dans sa console' });
  await donnees();
  const appels = [];
  await simulerServeur(page, appels, { pdfLien: (d) => (d.telecharger ? erreurServeur(500, 'INTERNAL', 'Le serveur a eu un souci. Réessaie.') : undefined) });
  await noterOuvertures(page);
  await connecter(page, undefined, { route: 'crm/affaires/a1' });
  await expect(page.locator('.compositeur')).toBeVisible();
  await attendreCalme(page);
  await page.locator('.compositeur [data-onglet="devis"]').click();
  const panneau = page.locator('.compositeur [role="tabpanel"][aria-label="Devis"]');
  await expect(panneau).toBeVisible();
  const ligne = panneau.locator('[data-devis="dOk"]');
  await expect(ligne.locator('[data-action="ouvrir-pdf"]')).toHaveText('Ouvrir le PDF');
  await expect(ligne.locator('[data-action="telecharger-pdf"]')).toHaveText('Télécharger');
  await expect(panneau.locator('[data-devis="dBrouillon"] [data-pdf]')).toHaveCount(0);
  await expect(panneau.locator('[data-devis="dEchec"] [data-pdf="non_range"]')).toBeVisible();
  await capturer(page, info, '10g-onglet-devis-actions');
  // Ouvrir.
  await ligne.locator('[data-action="ouvrir-pdf"]').click();
  await expect.poll(() => ouvertures(page)).toEqual([URL_PDF]);
  expect(page.url()).toMatch(/#\/crm\/affaires\/a1$/);
  // Télécharger : erreur (cas d'erreur), puis réussite.
  await ligne.locator('[data-action="telecharger-pdf"]').click();
  await expect(page.locator('.toast-erreur')).toContainText('Ça n’a pas abouti');
  await expect(page.locator('.toast-erreur [data-action="toast-action"]')).toHaveText('Réessayer');
  await expect(ligne.locator('[data-action="telecharger-pdf"]')).toBeEnabled();
  await capturer(page, info, '10g-onglet-devis-erreur');
  await page.unroute('**/devisPdfLien');
  await page.route('**/devisPdfLien', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    appels.push(['devisPdfLien', JSON.parse(route.request().postData()).data]);
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { url: URL_PDF, expireDans: 300, nom: 'Devis.pdf' } }) });
  });
  const telechargement = page.waitForEvent('download');
  await ligne.locator('[data-action="telecharger-pdf"]').click();
  expect((await telechargement).suggestedFilename()).toBe('Devis.pdf');
  expect(appels.filter((a) => a[0] === 'devisPdfLien').at(-1)[1]).toEqual({ devisId: 'dOk', telecharger: true });
  await aucunePageTechnique(page, /#\/crm\/affaires\/a1$/);
});

// ------------------------------------------------------------------ retrait de la copie Drive (décision du 27/10/2026, reprise de l'ancien devis-pdf-ecran.spec.js)

const capturerRetrait = (page, info, nom) => capturer(page, info, nom, DOSSIER_RETRAIT);

test('10i créer puis lier un dossier de travail sur une affaire qui a un devis finalisé au PDF prêt : aucune requête Drive de copie, Documents inchangés, aucun toast de copie', async ({ page, context }, info) => {
  const drive = await brancherGoogle(context);
  await creerOrganisation('o1', { nom: 'M. Paul Exemple' });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', organisationId: 'o1', urlDossier: '' });
  await creerAffaire('a2', { titre: 'Terrasse', organisationId: 'o1', urlDossier: '' });
  await devis('dOk', { ...FINALISE, pdf: PDF_OK });
  await devis('dDeux', { ...FINALISE, numero: 'DEV-2026-10-02-002', affaireId: 'a2', pdf: { statut: 'ok', chemin: 'devis/a2/d.pdf', nom: 'Devis DEV-2026-10-02-002.pdf', tentatives: 1 } });
  const requetes = [];
  page.on('request', (r) => { if (/googleapis\.com\/(drive|upload)/.test(r.url())) requetes.push(`${r.method()} ${r.url()}`); });
  await connecter(page, undefined, { route: 'crm/affaires/a1' });
  await attendreCalme(page);
  await ouvrirDocuments(page);
  await page.locator('[data-action="ajouter-dossier"]').click();
  await page.locator('[data-action="creer-dossier-ouvrir"]').click();
  await expect.poll(async () => (await lireDocument('crm_affaires/a1')).urlDossier).toMatch(/^https:\/\/drive\.google\.com\/drive\/folders\//);
  await expect(page.locator('#toasts')).toContainText('créé dans Google Drive');
  await expect(page.locator('#toasts')).not.toContainText(/PDF copié|PDF copiés|Copie/);
  expect(drive.envois, 'aucun fichier envoyé dans Drive').toHaveLength(0);
  expect(requetes.some((u) => /upload/.test(u)), 'aucun envoi').toBe(false);
  expect((await lireDocument('crm_affaires/a1')).documents ?? []).toEqual([]);
  await capturerRetrait(page, info, '2-dossier-cree-rien-copie');
  await page.goto('/?emulateurs=1#/crm/affaires/a2');
  await attendreCalme(page);
  await ouvrirDocuments(page);
  await choisirDansGoogle(page, [{ id: 'DOSSIER_LIE_0123456789', name: 'Dossier lié', url: 'https://drive.google.com/drive/folders/DOSSIER_LIE_0123456789', mimeType: 'application/vnd.google-apps.folder' }]);
  await page.locator('[data-action="ajouter-dossier"]').click();
  await page.locator('[data-action="lier-dossier"]').click();
  await expect.poll(async () => (await lireDocument('crm_affaires/a2')).urlDossier).toBe('https://drive.google.com/drive/folders/DOSSIER_LIE_0123456789');
  await expect(page.locator('#toasts')).toContainText('Dossier lié');
  await page.waitForTimeout(800);
  await expect(page.locator('#toasts')).not.toContainText(/PDF copié|PDF copiés|Copie/);
  expect(drive.envois).toHaveLength(0);
  expect(requetes.filter((u) => /upload/.test(u))).toEqual([]);
  expect((await lireDocument('crm_affaires/a2')).documents ?? []).toEqual([]);
  await capturerRetrait(page, info, '2-dossier-lie-rien-copie');
});
