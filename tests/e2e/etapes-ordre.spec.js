// Monter / descendre une étape ou une phase (Réglages > Affaires et projets). Un test par point du brief (nom commençant par le numéro),
// une capture par point dans tests/e2e/captures/etapes-ordre/. Ordinateur ET téléphone. Données fictives.
// L'ordre est enregistré avec les réglages (crm_parametres/etapes et /phases) : les fiches gardent leur identifiant d'emplacement et suivent leur étape.
import { test, expect, connecter, allerAuxReglagesCrm, allerA, creerAffaire, lireDocument, ecrireDocument, estTelephone, attendreCalme } from './outils.js';

const CAPTURES = 'e2e/captures/etapes-ordre';
const capture = (page, cible, nom) => cible.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });

test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});

const ETAPES_DEPART = ['Premier contact', 'Rendez vous fixé', 'Proposition envoyée', 'Gagné', 'Devis à faire', 'Étape 6'];
const PHASES_DEPART = ['Lancement', 'Découverte', 'Livraison', 'Clôture', 'Phase 5', 'Phase 6'];

/** L'emplacement 5 s'appelle « Devis à faire » et est utilisé ; le reste est l'espace de départ de Jérôme. */
async function preparerEtapes() {
  const item = (id, libelle, couleur, actif = true) => ({ id, libelle, description: '', couleur, actif, action: null });
  await ecrireDocument('crm_parametres/etapes', {
    items: [item('premier_contact', 'Premier contact', '#b9adc9'), item('rdv_fixe', 'Rendez vous fixé', '#e3cdee'), item('proposition_envoyee', 'Proposition envoyée', '#b98ee0'),
      item('gagne', 'Gagné', '#ecbc06'), item('etape_5', 'Devis à faire', '#8a9bb4'), item('etape_6', 'Étape 6', '#3fbf7f', false)],
    roleGagnee: 'gagne',
  });
}

async function ouvrir(page, { etapes = true } = {}) {
  if (etapes) await preparerEtapes();
  if (!estTelephone(page)) await page.setViewportSize({ width: 1280, height: 900 });
  await connecter(page);
  await allerAuxReglagesCrm(page);
}

const noms = (page, id) => page.locator(`#${id} .emplacement input[type=text][aria-label^="Nom de"]`);
const lesNoms = (page, id) => noms(page, id).evaluateAll((els) => els.map((e) => e.value));
const ligne = (page, id, emplacement) => page.locator(`#${id} [data-emplacement="${emplacement}"]`);
const monter = (page, id, emplacement) => ligne(page, id, emplacement).locator('[data-role="monter"]').click();
const descendre = (page, id, emplacement) => ligne(page, id, emplacement).locator('[data-role="descendre"]').click();

async function enregistrer(page, genre) {
  await page.locator(`[data-action="enregistrer-${genre}"]`).click();
  await expect(page.locator('.toast').filter({ hasText: genre === 'etape' ? 'Étapes enregistrées' : 'Phases enregistrées' })).toBeVisible();
}

test('1 Monter « Devis à faire » (emplacement 5) en position 3 : l’ordre affiché change et la ligne emporte son nom', async ({ page }) => {
  await ouvrir(page);
  await expect.poll(() => lesNoms(page, 'reglages-etapes')).toEqual(ETAPES_DEPART);
  await monter(page, 'reglages-etapes', 'etape_5');
  await monter(page, 'reglages-etapes', 'etape_5');
  await expect.poll(() => lesNoms(page, 'reglages-etapes')).toEqual(['Premier contact', 'Rendez vous fixé', 'Devis à faire', 'Proposition envoyée', 'Gagné', 'Étape 6']);
  // les boutons portent le nom de l'étape et la case « Vente gagnée » suit « Gagné »
  await expect(ligne(page, 'reglages-etapes', 'etape_5').getByRole('button', { name: 'Monter l’étape Devis à faire' })).toBeVisible();
  await expect(ligne(page, 'reglages-etapes', 'gagne').locator('[data-role="role"]')).toBeChecked();
  // le brouillon est modifié : Enregistrer et Annuler s'allument
  await expect(page.locator('[data-action="enregistrer-etape"]')).toBeEnabled();
  await capture(page, page.locator('#reglages-etapes'), '1-devis-en-position-3');
});

test('2 Après Enregistrer et rechargement de la page, l’ordre est conservé', async ({ page }) => {
  await ouvrir(page);
  await monter(page, 'reglages-etapes', 'etape_5');
  await monter(page, 'reglages-etapes', 'etape_5');
  await enregistrer(page, 'etape');
  const stocke = await lireDocument('crm_parametres/etapes');
  expect(stocke.items.map((e) => e.id)).toEqual(['premier_contact', 'rdv_fixe', 'etape_5', 'proposition_envoyee', 'gagne', 'etape_6']);
  await page.reload();
  await expect.poll(() => lesNoms(page, 'reglages-etapes')).toEqual(['Premier contact', 'Rendez vous fixé', 'Devis à faire', 'Proposition envoyée', 'Gagné', 'Étape 6']);
  await expect(page.locator('[data-action="enregistrer-etape"]')).toBeDisabled();
  await capture(page, page.locator('#reglages-etapes'), '2-ordre-conserve-apres-rechargement');
});

test('3 Le kanban des affaires affiche les colonnes dans le nouvel ordre', async ({ page }) => {
  await creerAffaire('a-un', { titre: 'Affaire d\u2019essai', etape: 'premier_contact' }); // un kanban sans aucune affaire affiche un message vide, pas de colonnes
  await ouvrir(page);
  await monter(page, 'reglages-etapes', 'etape_5');
  await monter(page, 'reglages-etapes', 'etape_5');
  await enregistrer(page, 'etape');
  await allerA(page, 'Affaires');
  const colonnes = page.locator('.kanban .colonne');
  await expect(colonnes).toHaveCount(5);
  expect(await colonnes.evaluateAll((els) => els.map((e) => e.dataset.colonne))).toEqual(['premier_contact', 'rdv_fixe', 'etape_5', 'proposition_envoyee', 'gagne']);
  await expect(colonnes.nth(2)).toHaveAttribute('aria-label', 'Devis à faire');
  await capture(page, page.locator('.kanban'), '3-kanban-nouvel-ordre');
});

test('4 Une fiche reste dans la même étape (même nom, même identifiant enregistré) après le déplacement', async ({ page }) => {
  await creerAffaire('a-devis', { titre: 'Boulangerie du coin', etape: 'etape_5' });
  await ouvrir(page);
  await monter(page, 'reglages-etapes', 'etape_5');
  await monter(page, 'reglages-etapes', 'etape_5');
  await expect(ligne(page, 'reglages-etapes', 'etape_5')).toContainText('1 fiche');
  await enregistrer(page, 'etape');
  await allerA(page, 'Affaires');
  await expect(page.locator('.colonne[data-colonne="etape_5"]')).toHaveAttribute('aria-label', 'Devis à faire');
  await expect(page.locator('.colonne[data-colonne="etape_5"]').getByText('Boulangerie du coin')).toBeVisible();
  expect((await lireDocument('crm_affaires/a-devis')).etape).toBe('etape_5'); // la fiche n'a pas été réécrite
  await capture(page, page.locator('.kanban'), '4-fiche-dans-la-meme-etape');
});

test('5 Première ligne : ▲ désactivé ; dernière ligne : ▼ désactivé (une étape non utilisée se déplace aussi)', async ({ page }) => {
  await ouvrir(page);
  const sec = page.locator('#reglages-etapes');
  await expect(sec.locator('.emplacement').first().locator('[data-role="monter"]')).toBeDisabled();
  await expect(sec.locator('.emplacement').first().locator('[data-role="descendre"]')).toBeEnabled();
  await expect(sec.locator('.emplacement').last().locator('[data-role="descendre"]')).toBeDisabled();
  await expect(sec.locator('.emplacement').last().locator('[data-role="monter"]')).toBeEnabled();
  // « Étape 6 » n'est pas utilisée : elle monte quand même
  await expect(ligne(page, 'reglages-etapes', 'etape_6').locator('[data-role="actif"]')).not.toBeChecked();
  await monter(page, 'reglages-etapes', 'etape_6');
  await expect.poll(() => lesNoms(page, 'reglages-etapes')).toEqual(['Premier contact', 'Rendez vous fixé', 'Proposition envoyée', 'Gagné', 'Étape 6', 'Devis à faire']);
  await expect(sec.locator('.emplacement').last().locator('[data-role="descendre"]')).toBeDisabled();
  // zone de toucher de 44 px sur téléphone (pseudo-élément invisible, règle commune des boutons-icônes)
  if (estTelephone(page)) {
    const zone = await sec.locator('[data-role="monter"]').nth(1).evaluate((el) => { const s = getComputedStyle(el, '::after'); return [s.width, s.height]; });
    expect(zone).toEqual(['44px', '44px']);
  }
  await capture(page, sec, '5-bords-desactives');
});

test('6 Mêmes boutons pour les phases des projets : bords désactivés, déplacement, enregistrement et rechargement', async ({ page }) => {
  await ouvrir(page, { etapes: false });
  const sec = page.locator('#reglages-phases');
  await expect.poll(() => lesNoms(page, 'reglages-phases')).toEqual(PHASES_DEPART);
  await expect(sec.locator('.emplacement').first().locator('[data-role="monter"]')).toBeDisabled();
  await expect(sec.locator('.emplacement').last().locator('[data-role="descendre"]')).toBeDisabled();
  await expect(ligne(page, 'reglages-phases', 'cloture').getByRole('button', { name: 'Monter la phase Clôture' })).toBeVisible();
  await monter(page, 'reglages-phases', 'cloture');
  await expect.poll(() => lesNoms(page, 'reglages-phases')).toEqual(['Lancement', 'Découverte', 'Clôture', 'Livraison', 'Phase 5', 'Phase 6']);
  await expect(ligne(page, 'reglages-phases', 'cloture').locator('[data-role="role"]')).toBeChecked(); // le rôle « clôture » suit la phase
  await capture(page, sec, '6-phases-deplacees');
  await enregistrer(page, 'phase');
  expect((await lireDocument('crm_parametres/phases')).items.map((e) => e.id)).toEqual(['lancement', 'decouverte', 'cloture', 'livraison', 'phase_5', 'phase_6']);
  await page.reload();
  await expect.poll(() => lesNoms(page, 'reglages-phases')).toEqual(['Lancement', 'Découverte', 'Clôture', 'Livraison', 'Phase 5', 'Phase 6']);
});

test('7 « Annuler les changements » remet l’ordre d’origine', async ({ page }) => {
  await ouvrir(page);
  await monter(page, 'reglages-etapes', 'etape_5');
  await descendre(page, 'reglages-etapes', 'premier_contact');
  await expect.poll(() => lesNoms(page, 'reglages-etapes')).not.toEqual(ETAPES_DEPART);
  await page.locator('[data-action="annuler-etape"]').click();
  await expect.poll(() => lesNoms(page, 'reglages-etapes')).toEqual(ETAPES_DEPART);
  await expect(page.locator('[data-action="enregistrer-etape"]')).toBeDisabled();
  await expect(page.locator('[data-action="annuler-etape"]')).toBeDisabled();
  // et un aller-retour (monter puis redescendre) vaut « rien à enregistrer »
  await monter(page, 'reglages-etapes', 'etape_5');
  await descendre(page, 'reglages-etapes', 'etape_5');
  await expect(page.locator('[data-action="enregistrer-etape"]')).toBeDisabled();
  await attendreCalme(page);
  await capture(page, page.locator('#reglages-etapes'), '7-annule-ordre-origine');
});
