// Copie du PDF d'un devis dans le dossier « Devis » du dossier de travail Drive de l'affaire, à l'ouverture de l'écran PDF (#/devis/pdf/<id>).
// Google est SIMULÉ (google-simule.js : jeton, Drive, envoi de fichier) et le stockage du PDF aussi (page.route) : on vérifie ce que l'appli demande à Google et ce qu'elle affiche,
// pas Google lui-même. Un test par critère (le nom commence par le numéro du critère, voir la PR). Captures dans tests/e2e/captures/devis-drive-copie/.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, creerOrganisation, creerAffaire, JEROME } from './outils.js';
import { brancherGoogle, refuserAutorisation } from './google-simule.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-drive-copie/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' };
const URL_PDF = 'https://stockage.exemple.test/devis-essai.pdf';
const DOSSIER_TRAVAIL = 'DOSSIER_TRAVAIL_abcdefghij';
const NOM_ATTENDU = 'Devis DEV-2026-10-25-001 v1 – Rénovation restaurant.pdf';
const zoneDrive = (page) => page.locator('[data-zone="copie-drive"]');
const message = (page) => zoneDrive(page).locator('[data-valeur="message-drive"]');

async function donnees({ urlDossier = `https://drive.google.com/drive/folders/${DOSSIER_TRAVAIL}` } = {}) {
  const maintenant = new Date();
  await creerOrganisation('o1', { nom: 'M. Paul Exemple' });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', organisationId: 'o1', urlDossier });
  await ecrireDocument('devis_devis/dOk', {
    racineId: 'dOk', version: 1, numero: 'DEV-2026-10-25-001', statut: 'en_attente_envoi', finaliseLe: maintenant, affaireId: 'a1', personneId: null, organisationId: 'o1',
    modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20, regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: '2026-12-31',
    objet: 'Rénovation restaurant', destinataires: ['contact@exemple.fr'], sections: [],
    pdf: { statut: 'ok', chemin: 'devis/a1/d.pdf', nom: 'Devis.pdf', tentatives: 1 },
    creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant,
  });
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

test('5 une affaire sans dossier de travail : message clair, pas d’erreur, Google n’est pas sollicité', async ({ page, context }, info) => {
  const drive = await brancherGoogle(context);
  await donnees({ urlDossier: '' });
  await simulerStockage(page);
  await connecter(page, undefined, { route: 'devis/liste' });
  await attendreCalme(page);
  await allerAuPdf(page);
  await expect(message(page)).toHaveText('Cette affaire n’a pas de dossier de travail Drive : le PDF est rangé dans l’affaire seulement.');
  await expect(message(page)).not.toHaveClass(/erreur/);
  await expect(zoneDrive(page).locator('[data-action="reessayer-drive"]')).toHaveCount(0);
  expect(drive.requetes.length + drive.envois.length).toBe(0);
  await capturer(page, info, '5-sans-dossier');
});

test('6 Drive refusé : message clair avec « Réessayer » ; après autorisation, la copie se fait', async ({ page, context }, info) => {
  const drive = await brancherGoogle(context);
  await ouvrir(page, drive);
  await refuserAutorisation(page, true);
  await allerAuPdf(page);
  await expect(message(page)).toContainText('Drive n’est pas connecté ou l’autorisation a été refusée');
  await expect(message(page)).toHaveClass(/erreur/);
  expect(drive.envois).toHaveLength(0);
  await capturer(page, info, '6-drive-refuse');
  await refuserAutorisation(page, false);
  await zoneDrive(page).locator('[data-action="reessayer-drive"]').click();
  await expect(message(page)).toHaveText('PDF copié dans le dossier Devis de l’affaire');
  expect(drive.envois).toHaveLength(1);
});

test('6 Google refuse l’envoi (droits) : le message le dit et « Réessayer » reste proposé', async ({ page, context }) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'le faux Drive répond 403' });
  const drive = await brancherGoogle(context);
  drive.echecEnvoi = 403;
  await ouvrir(page, drive);
  await allerAuPdf(page);
  await expect(message(page)).toContainText('droits insuffisants');
  await expect(zoneDrive(page).locator('[data-action="reessayer-drive"]')).toBeVisible();
});
