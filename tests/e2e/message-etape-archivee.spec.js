// Réglages > Affaires et projets : le message qui refuse de désactiver une étape (ou une phase) non vide dit quand des fiches sont archivées.
// Un test par point (nom commençant par le numéro), une capture par point dans tests/e2e/captures/message-etape-archivee/. Ordinateur ET téléphone. Données fictives.
import { test, expect, connecter, allerAuxReglagesCrm, creerAffaire, creerProjet, ecrireDocument, estTelephone } from './outils.js';

const CAPTURES = 'e2e/captures/message-etape-archivee';
const capture = (page, cible, nom) => cible.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });

test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});

/** L'emplacement 5 s'appelle « Devis à faire » et est utilisé. */
async function etapesAvecCinq() {
  const item = (id, libelle, couleur, actif = true) => ({ id, libelle, description: '', couleur, actif, action: null });
  await ecrireDocument('crm_parametres/etapes', {
    items: [item('premier_contact', 'Premier contact', '#b9adc9'), item('rdv_fixe', 'Rendez vous fixé', '#e3cdee'), item('proposition_envoyee', 'Proposition envoyée', '#b98ee0'),
      item('gagne', 'Gagné', '#ecbc06'), item('etape_5', 'Devis à faire', '#8a9bb4'), item('etape_6', 'Étape 6', '#3fbf7f', false)],
    roleGagnee: 'gagne',
  });
}

async function desactiverEtEnregistrer(page, section, emplacement, genre) {
  await allerAuxReglagesCrm(page);
  const sec = page.locator(section);
  await sec.locator(`.emplacement[data-emplacement="${emplacement}"] [data-role="actif"]`).uncheck();
  await sec.locator(`[data-action="enregistrer-${genre}"]`).click();
  return sec.locator(`[data-erreur="${emplacement}"]`);
}

test('1 une affaire archivée dans l’étape 5 : le message dit « (archivée) » et propose de désarchiver ou déplacer', async ({ page }) => {
  await etapesAvecCinq();
  await creerAffaire('a1', { titre: 'Vieille affaire', etape: 'etape_5', archive: true });
  await connecter(page);
  const erreur = await desactiverEtEnregistrer(page, '#reglages-etapes', 'etape_5', 'etape');
  await expect(erreur).toHaveText('Cette étape contient 1 fiche (archivée) : désarchive-la ou déplace-la avant de la désactiver.');
  await capture(page, page.locator('#reglages-etapes'), '1-etape-archivee');
});

test('2 une affaire non archivée dans l’étape 5 : le message d’origine, sans « archivée »', async ({ page }) => {
  await etapesAvecCinq();
  await creerAffaire('a1', { titre: 'Affaire vivante', etape: 'etape_5' });
  await connecter(page);
  const erreur = await desactiverEtEnregistrer(page, '#reglages-etapes', 'etape_5', 'etape');
  await expect(erreur).toHaveText('Cette étape contient 1 fiche : déplace-les avant de la désactiver.');
  await expect(erreur).not.toContainText('archivée');
  await capture(page, page.locator('#reglages-etapes'), '2-etape-non-archivee');
});

test('3 une affaire archivée et une vivante dans l’étape 5 : « 2 fiches (dont 1 archivée) »', async ({ page }) => {
  await etapesAvecCinq();
  await creerAffaire('a1', { titre: 'Vieille affaire', etape: 'etape_5', archive: true });
  await creerAffaire('a2', { titre: 'Affaire vivante', etape: 'etape_5' });
  await connecter(page);
  const erreur = await desactiverEtEnregistrer(page, '#reglages-etapes', 'etape_5', 'etape');
  await expect(erreur).toHaveText('Cette étape contient 2 fiches (dont 1 archivée) : désarchive ou déplace-les avant de la désactiver.');
  await capture(page, page.locator('#reglages-etapes'), '3-etape-mixte');
});

test('4 un projet archivé dans une phase : le message de la phase dit « (archivée) » ; un projet vivant, texte d’origine', async ({ page }) => {
  await creerProjet('p1', { titre: 'Vieux projet', phase: 'decouverte', archive: true });
  await creerProjet('p2', { titre: 'Projet vivant', phase: 'livraison' });
  await connecter(page);
  await allerAuxReglagesCrm(page);
  const sec = page.locator('#reglages-phases');
  await sec.locator('.emplacement[data-emplacement="decouverte"] [data-role="actif"]').uncheck();
  await sec.locator('.emplacement[data-emplacement="livraison"] [data-role="actif"]').uncheck();
  await sec.locator('[data-action="enregistrer-phase"]').click();
  await expect(sec.locator('[data-erreur="decouverte"]')).toHaveText('Cette phase contient 1 fiche (archivée) : désarchive-la ou déplace-la avant de la désactiver.');
  await expect(sec.locator('[data-erreur="livraison"]')).toHaveText('Cette phase contient 1 fiche : déplace-les avant de la désactiver.');
  await capture(page, sec, '4-phase-archivee');
});

test('5 cas vide : une étape sans fiche se désactive sans message d’erreur', async ({ page }) => {
  await etapesAvecCinq();
  await connecter(page);
  const erreur = await desactiverEtEnregistrer(page, '#reglages-etapes', 'etape_5', 'etape');
  await expect(erreur).toHaveText('');
  await expect(page.locator('.toast', { hasText: 'Étapes enregistrées' })).toBeVisible();
});
