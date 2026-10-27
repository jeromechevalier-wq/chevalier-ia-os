// Copie du PDF d'un devis dans le dossier « Devis » du dossier de travail Drive de l'affaire, à l'ouverture de l'écran PDF (#/devis/pdf/<id>).
// Google est SIMULÉ (google-simule.js : jeton, Drive, envoi de fichier) et le stockage du PDF aussi (page.route) : on vérifie ce que l'appli demande à Google et ce qu'elle affiche,
// pas Google lui-même. Un test par critère (le nom commence par le numéro du critère, voir la PR). Captures dans tests/e2e/captures/devis-drive-copie/.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, lireDocument, listerDocuments, ouvrirDocuments, creerOrganisation, creerAffaire, JEROME } from './outils.js';
import { brancherGoogle, debrancherGoogle, refuserAutorisation, choisirDansGoogle, lireGoogle } from './google-simule.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-drive-copie/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' };
const URL_PDF = 'https://stockage.exemple.test/devis-essai.pdf';
const DOSSIER_TRAVAIL = 'DOSSIER_TRAVAIL_abcdefghij';
const NOM_ATTENDU = 'Devis DEV-2026-10-25-001 v1 – Rénovation restaurant.pdf';
const NOM_DEUX = 'Devis DEV-2026-10-25-002 v1 – Terrasse.pdf';
const zoneDrive = (page) => page.locator('[data-zone="copie-drive"]');
const boutonCopier = (page) => zoneDrive(page).locator('[data-action="copier-drive"]');
/** Au premier affichage il n'y a pas de jeton Google en mémoire : la copie attend un vrai clic sur « Copier dans Drive ». */
const copierParClic = async (page) => { await expect(boutonCopier(page)).toBeVisible(); await boutonCopier(page).click(); };
const boutonCreer = (page) => zoneDrive(page).locator('[data-action="creer-dossier-et-copier"]');
const message = (page) => zoneDrive(page).locator('[data-valeur="message-drive"]');

async function donnees({ urlDossier = `https://drive.google.com/drive/folders/${DOSSIER_TRAVAIL}`, autres = false } = {}) {
  const maintenant = new Date();
  await creerOrganisation('o1', { nom: 'M. Paul Exemple' });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', organisationId: 'o1', urlDossier });
  await ecrireDocument('devis_devis/dOk', {
    racineId: 'dOk', version: 1, numero: 'DEV-2026-10-25-001', statut: 'en_attente_envoi', finaliseLe: maintenant, affaireId: 'a1', personneId: null, organisationId: 'o1',
    modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20, regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: '2026-12-31',
    objet: 'Rénovation restaurant', destinataires: ['contact@exemple.fr'], sections: [],
    pdf: { statut: 'ok', chemin: 'devis/a1/d.pdf', nom: NOM_ATTENDU, tentatives: 1 },
    creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant,
  });
  if (!autres) return;
  // Un second devis finalisé (PDF prêt), un brouillon de la même affaire, et un devis d'une autre affaire : seuls dOk et dDeux sont copiés.
  const base = (surcharge) => ({
    racineId: 'x', version: 1, numero: 'DEV-2026-10-25-002', statut: 'envoye', finaliseLe: maintenant, affaireId: 'a1', personneId: null, organisationId: 'o1', modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: '2026-12-31', objet: 'Terrasse', destinataires: ['contact@exemple.fr'], sections: [],
    pdf: { statut: 'ok', chemin: 'devis/a1/e.pdf', nom: NOM_DEUX, tentatives: 1 }, creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, ...surcharge,
  });
  await ecrireDocument('devis_devis/dDeux', base({ racineId: 'dDeux' }));
  await ecrireDocument('devis_devis/dBrouillon', base({ racineId: 'dBrouillon', numero: null, statut: 'brouillon', pdf: null }));
  await creerAffaire('a2', { titre: 'Autre affaire', organisationId: 'o1' });
  await ecrireDocument('devis_devis/dAutre', base({ racineId: 'dAutre', numero: 'DEV-2026-10-25-003', affaireId: 'a2', objet: 'Ailleurs' }));
}
/** Faux serveur : lien signé et stockage du PDF (avec l'autorisation de lecture depuis le navigateur). */
async function simulerStockage(page) {
  await page.route('**/devisPdfLien', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { url: URL_PDF, expireDans: 300, nom: 'Devis DEV-2026-10-25-001.pdf' } }) });
  });
  await page.context().route('https://stockage.exemple.test/**', (route) => route.fulfill({ status: 200, headers: { ...cors, 'Content-Type': 'application/pdf' }, body: '%PDF-1.4 faux' }));
}
async function ouvrir(page, drive) {
  await donnees();
  await simulerStockage(page);
  await connecter(page, undefined, { route: 'devis/liste' });
  await attendreCalme(page);
  return drive;
}
const allerAuPdf = async (page) => { await page.evaluate(() => { location.hash = '#/devis/pdf/dOk'; }); await expect(page.locator('.page-pdf-devis')).toBeVisible(); };

test('3 le PDF finalisé est copié dans le sous-dossier « Devis » du dossier de travail, avec le bon nom, et un message le dit', async ({ page, context }, info) => {
  const drive = await brancherGoogle(context);
  await ouvrir(page, drive);
  await allerAuPdf(page);
  await copierParClic(page);
  await expect(message(page)).toHaveText('PDF copié dans le dossier Devis de l’affaire');
  await expect(page.locator('#toasts')).toContainText('PDF copié dans le dossier Devis de l’affaire');
  expect(drive.requetes.map((r) => [r.corps.name, r.corps.parents])).toEqual([['Devis', [DOSSIER_TRAVAIL]]]);
  expect(drive.envois).toHaveLength(1);
  expect(drive.envois[0].nom).toBe(NOM_ATTENDU);
  expect(drive.envois[0].parents).toEqual([drive.dossiers[0].id]);
  expect(drive.envois[0].autorisation).toBe('Bearer ya29.SIMULE');
  expect(drive.envois[0].contientPdf).toBe(true);
  await expect(zoneDrive(page).locator('[data-action="ouvrir-copie-drive"]')).toBeVisible();
  await capturer(page, info, '3-pdf-copie');
});

test('4 le même PDF ouvert une seconde fois n’est pas recopié (aucun doublon dans Drive)', async ({ page, context }, info) => {
  const drive = await brancherGoogle(context);
  await ouvrir(page, drive);
  await allerAuPdf(page);
  await copierParClic(page);
  await expect(message(page)).toHaveText('PDF copié dans le dossier Devis de l’affaire');
  await page.evaluate(() => { location.hash = '#/devis/liste'; });
  await attendreCalme(page);
  await allerAuPdf(page);
  await expect(message(page)).toHaveText('Ce PDF est déjà dans le dossier Devis de l’affaire.');
  expect(drive.envois).toHaveLength(1);
  // « Copier de nouveau » retrouve le fichier dans Drive : toujours un seul exemplaire.
  await zoneDrive(page).locator('[data-action="recopier-drive"]').click();
  await expect(message(page)).toHaveText('Ce PDF est déjà dans le dossier Devis de l’affaire.');
  expect(drive.envois).toHaveLength(1);
  await capturer(page, info, '4-pdf-deja-copie');
});

test('5 une affaire sans dossier de travail : message clair, bouton « Créer le dossier … et y copier le PDF » (en contour), pas d’erreur, Google n’est pas sollicité', async ({ page, context }, info) => {
  const drive = await brancherGoogle(context);
  await donnees({ urlDossier: '' });
  await simulerStockage(page);
  await connecter(page, undefined, { route: 'devis/liste' });
  await attendreCalme(page);
  await allerAuPdf(page);
  await expect(message(page)).toHaveText('Cette affaire n’a pas encore de dossier de travail.');
  await expect(message(page)).not.toHaveClass(/erreur/);
  await expect(boutonCreer(page)).toHaveText('Créer le dossier « Rénovation cuisine » et y copier le PDF');
  await expect(boutonCreer(page)).toHaveClass(/bouton-secondaire/); // un seul bouton jaune : « Ouvrir le PDF »
  await expect(page.locator('[data-action="ouvrir-pdf"]')).toHaveClass(/bouton-principal/);
  await expect(zoneDrive(page).locator('[data-action="reessayer-drive"]')).toHaveCount(0);
  expect(drive.requetes.length + drive.envois.length).toBe(0);
  await capturer(page, info, '5-sans-dossier');
});

test('6 Drive refusé : message clair avec « Réessayer » ; après autorisation, la copie se fait', async ({ page, context }, info) => {
  const drive = await brancherGoogle(context);
  await ouvrir(page, drive);
  await refuserAutorisation(page, true);
  await allerAuPdf(page);
  await copierParClic(page);
  await expect(message(page)).toContainText('Drive n’est pas connecté ou l’autorisation a été refusée');
  await expect(message(page)).toHaveClass(/erreur/);
  expect(drive.envois).toHaveLength(0);
  await capturer(page, info, '6-drive-refuse');
  await refuserAutorisation(page, false);
  await zoneDrive(page).locator('[data-action="reessayer-drive"]').click();
  await expect(message(page)).toHaveText('PDF copié dans le dossier Devis de l’affaire');
  expect(drive.envois).toHaveLength(1);
});

test('6 Google refuse l’envoi du fichier (droits) : le message le dit et « Réessayer » reste proposé', async ({ page, context }) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'le faux Drive répond 403' });
  const drive = await brancherGoogle(context);
  drive.echecEnvoi = 403;
  await ouvrir(page, drive);
  await allerAuPdf(page);
  await copierParClic(page);
  await expect(message(page)).toContainText('droits insuffisants');
  await expect(zoneDrive(page).locator('[data-action="reessayer-drive"]')).toBeVisible();
});

test('A sans jeton Google en mémoire : message neutre et bouton « Copier dans Drive », aucune fenêtre d’autorisation ouverte toute seule ; le clic lance la copie', async ({ page, context }, info) => {
  const drive = await brancherGoogle(context);
  await ouvrir(page, drive);
  await allerAuPdf(page);
  await expect(message(page)).toHaveText('Pour copier ce PDF dans Drive, appuie sur « Copier dans Drive ».');
  await expect(message(page)).not.toHaveClass(/erreur/);
  await expect(boutonCopier(page)).toHaveClass(/bouton-secondaire/); // un seul bouton jaune : « Ouvrir le PDF »
  expect((await lireGoogle(page)).autorisations).toHaveLength(0); // pas de fenêtre d'autorisation sans clic
  expect(drive.requetes.length + drive.envois.length).toBe(0);
  await capturer(page, info, 'A-sans-jeton-bouton-copier');
  await boutonCopier(page).click();
  await expect(message(page)).toHaveText('PDF copié dans le dossier Devis de l’affaire');
  expect((await lireGoogle(page)).autorisations).toHaveLength(1);
  expect(drive.envois).toHaveLength(1);
});

const lienPdf = (id) => new RegExp(`/#/devis/pdf/${id}$`);

test('1 un clic crée le dossier (nom = titre de l’affaire), enregistre son lien, et copie les PDF de tous les devis finalisés de l’affaire', async ({ page, context }, info) => {
  const drive = await brancherGoogle(context);
  await donnees({ urlDossier: '', autres: true });
  await simulerStockage(page);
  await connecter(page, undefined, { route: 'devis/liste' });
  await attendreCalme(page);
  await allerAuPdf(page);
  await boutonCreer(page).click();
  await expect(message(page)).toHaveText('2 PDF copiés dans le dossier.');
  await expect(message(page)).not.toHaveClass(/erreur/);
  await expect(zoneDrive(page).locator('[data-action="ouvrir-dossier-cree"]')).toBeVisible();
  const noms = drive.requetes.map((r) => r.corps.name);
  expect(noms).toContain('Rénovation cuisine'); // le dossier de l'affaire, nommé comme elle
  expect(noms.filter((n) => n === 'Devis')).toHaveLength(1); // un seul sous-dossier « Devis »
  expect(drive.envois.map((e) => e.nom).sort()).toEqual([NOM_ATTENDU, NOM_DEUX].sort()); // ni le brouillon ni le devis d'une autre affaire
  expect(drive.envois.every((e) => e.contientPdf)).toBe(true);
  expect((await lireDocument('crm_affaires/a1')).urlDossier).toMatch(/^https:\/\/drive\.google\.com\/drive\/folders\/DOSSIER_\d+_/);
  await capturer(page, info, '1-dossier-cree-pdf-copies');
  // 3 : les liens stables des deux PDF sont dans les Documents de l'affaire, une seule fois chacun ; « Document joint » pour chacun dans le fil (logique existante).
  await expect.poll(async () => ((await lireDocument('crm_affaires/a1')).documents || []).length).toBe(2);
  const docs = (await lireDocument('crm_affaires/a1')).documents;
  expect(docs.some((d) => lienPdf('dOk').test(d.url) && d.libelle === NOM_ATTENDU)).toBe(true);
  expect(docs.some((d) => lienPdf('dDeux').test(d.url) && d.libelle === NOM_DEUX)).toBe(true);
  expect(docs.every((d) => d.url.startsWith('https://chevalier-ia-os.web.app/#/devis/pdf/'))).toBe(true); // l'adresse du serveur, pas celle du site de test
  await expect.poll(async () => (await listerDocuments('crm_evenements')).filter((e) => e.type === 'document' && e.affaireId === 'a1').map((e) => e.texte).sort())
    .toEqual([`Document joint : ${NOM_ATTENDU}`, `Document joint : ${NOM_DEUX}`].sort());
  // Rouvrir l'écran du PDF : le dossier existe, rien n'est recopié.
  await page.evaluate(() => { location.hash = '#/devis/liste'; });
  await attendreCalme(page);
  await allerAuPdf(page);
  await expect(boutonCreer(page)).toHaveCount(0);
  expect(drive.envois).toHaveLength(2);
});

test('2 lier un dossier existant depuis la fiche de l’affaire copie aussi les PDF des devis finalisés', async ({ page, context }, info) => {
  const drive = await brancherGoogle(context);
  await donnees({ urlDossier: '', autres: true });
  await simulerStockage(page);
  await connecter(page, undefined, { route: 'crm/affaires/a1' });
  await attendreCalme(page);
  await ouvrirDocuments(page);
  await choisirDansGoogle(page, [{ id: 'DOSSIER_LIE_0123456789', name: 'Dossier lié', url: 'https://drive.google.com/drive/folders/DOSSIER_LIE_0123456789', mimeType: 'application/vnd.google-apps.folder' }]);
  await page.locator('[data-action="ajouter-dossier"]').click();
  await page.locator('[data-action="lier-dossier"]').click();
  await expect(page.locator('#toasts')).toContainText('2 PDF copiés dans le dossier.');
  expect(drive.envois.map((e) => e.nom).sort()).toEqual([NOM_ATTENDU, NOM_DEUX].sort());
  const sous = drive.dossiers.find((d) => d.name === 'Devis');
  expect(sous.parents).toEqual(['DOSSIER_LIE_0123456789']);
  expect(drive.envois.every((e) => e.parents[0] === sous.id)).toBe(true);
  await expect.poll(async () => ((await lireDocument('crm_affaires/a1')).documents || []).length).toBe(2);
  await capturer(page, info, '2-dossier-lie-pdf-copies');
});

test('2 PDF illisible depuis le stockage : « 0 sur 2 copiés : réessaie », le dossier reste créé, rien n’est silencieux', async ({ page, context }, info) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'la lecture du PDF depuis le stockage est refusée' });
  const drive = await brancherGoogle(context);
  await donnees({ urlDossier: '', autres: true });
  await simulerStockage(page);
  await page.context().route('https://stockage.exemple.test/**', (route) => route.abort('failed'));
  await connecter(page, undefined, { route: 'devis/liste' });
  await attendreCalme(page);
  await allerAuPdf(page);
  await boutonCreer(page).click();
  await expect(message(page)).toContainText('0 sur 2 copiés : réessaie.');
  await expect(message(page)).toHaveClass(/erreur/);
  await expect(zoneDrive(page).locator('[data-action="reessayer-drive"]')).toBeVisible();
  expect(drive.envois).toHaveLength(0);
  expect((await lireDocument('crm_affaires/a1')).urlDossier).toMatch(/folders\/DOSSIER_/); // le dossier existe bien
  await capturer(page, info, '2-echec-partiel');
});

test('5 autorisation Google refusée : message clair, aucun dossier créé, « Réessayer » ; après accord, le dossier est créé', async ({ page, context }, info) => {
  const drive = await brancherGoogle(context);
  await donnees({ urlDossier: '' });
  await simulerStockage(page);
  await connecter(page, undefined, { route: 'devis/liste' });
  await attendreCalme(page);
  await refuserAutorisation(page, true);
  await allerAuPdf(page);
  await boutonCreer(page).click();
  await expect(message(page)).toContainText('l’autorisation a été refusée');
  await expect(message(page)).toHaveClass(/erreur/);
  expect(drive.requetes).toHaveLength(0);
  expect((await lireDocument('crm_affaires/a1')).urlDossier).toBe('');
  await capturer(page, info, '5-creation-refusee');
  await refuserAutorisation(page, false);
  await zoneDrive(page).locator('[data-action="reessayer-creation"]').click();
  await expect(message(page)).toHaveText('1 PDF copié dans le dossier.');
});

test('5 un dossier de ce nom existe déjà : le message le dit et propose d’ouvrir l’affaire pour lier le dossier existant (pas de doublon)', async ({ page, context }, info) => {
  const drive = await brancherGoogle(context);
  await donnees({ urlDossier: '' });
  await simulerStockage(page);
  await connecter(page, undefined, { route: 'devis/liste' });
  await attendreCalme(page);
  await allerAuPdf(page);
  await boutonCreer(page).click();
  await expect(message(page)).toHaveText('1 PDF copié dans le dossier.');
  // Le lien de l'affaire est retiré, mais le dossier de même nom est toujours dans Drive.
  const avant = drive.requetes.length;
  await ecrireDocument('crm_affaires/a1', { ...(await lireDocument('crm_affaires/a1')), urlDossier: '' });
  await page.evaluate(() => { location.hash = '#/devis/liste'; });
  await attendreCalme(page);
  await allerAuPdf(page);
  await boutonCreer(page).click();
  await expect(message(page)).toContainText('Un dossier de ce nom existe déjà');
  await expect(message(page)).toHaveClass(/erreur/);
  await expect(zoneDrive(page).locator('[data-action="ouvrir-affaire-lier"]')).toHaveAttribute('href', '#/crm/affaires/a1');
  expect(drive.requetes.length).toBe(avant);
  expect(drive.dossiers.filter((d) => d.name === 'Rénovation cuisine')).toHaveLength(1);
  await capturer(page, info, '5-dossier-existe-deja');
});

test('5 option « Créer un dossier dans Google Drive » éteinte : aucun bouton de création, message neutre', async ({ page, context }, info) => {
  const drive = await brancherGoogle(context);
  await donnees({ urlDossier: '' });
  await ecrireDocument('crm_parametres/reglages', { boutonsDepot: false });
  await simulerStockage(page);
  await connecter(page, undefined, { route: 'devis/liste' });
  await attendreCalme(page);
  await allerAuPdf(page);
  await expect(message(page)).toHaveText('Cette affaire n’a pas de dossier de travail : le PDF est gardé avec le devis.');
  await expect(boutonCreer(page)).toHaveCount(0);
  expect(drive.requetes.length + drive.envois.length).toBe(0);
  await capturer(page, info, '5-creation-desactivee');
});

test('5 Google non branché : aucun bouton, message neutre ; devis sans affaire : rien à proposer', async ({ page, context }) => {
  await debrancherGoogle(context);
  await donnees({ urlDossier: '' });
  await ecrireDocument('devis_devis/dSans', { ...(await lireDocument('devis_devis/dOk')), racineId: 'dSans', affaireId: null, numero: 'DEV-2026-10-25-009' });
  await simulerStockage(page);
  await connecter(page, undefined, { route: 'devis/liste' });
  await attendreCalme(page);
  await allerAuPdf(page);
  await expect(message(page)).toHaveText('Cette affaire n’a pas de dossier de travail : le PDF est gardé avec le devis.');
  await expect(boutonCreer(page)).toHaveCount(0);
  await page.evaluate(() => { location.hash = '#/devis/pdf/dSans'; });
  await expect(message(page)).toHaveText('Ce devis n’a pas d’affaire : le PDF est rangé avec le devis seulement.');
  await expect(boutonCreer(page)).toHaveCount(0);
});
