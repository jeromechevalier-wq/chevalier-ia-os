// Module Devis, familles d'articles configurables, PR 1 (docs/cadrage-familles-configurables.md, §5) : les sept familles de premier niveau se renomment et se désactivent.
// Un test par critère (le nom commence par 1.1 à 1.9), une capture par critère, ordinateur ET téléphone : tests/e2e/captures/devis-familles-configurables/.
// Les critères purement logiques (1.5 identifiants et types, 1.6 anciens documents, 1.7 assistant) sont dans tests/devis-familles-configurables.test.js et devis-mcp.test.js (K24).
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, lireDocument, creerOrganisation, creerAffaire, JEROME } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-familles-configurables/', import.meta.url));
/** Capture de l'état obtenu : la section des familles seule (la page des réglages est très haute), la vue du navigateur pour une fenêtre, sinon la page entière. */
const capturer = (page, info, nom, cible = null) => {
  const path = `${DOSSIER}${nom}-${info.project.name === 'telephone' ? 'tel' : 'ordi'}.png`;
  if (cible === 'vue') return page.screenshot({ path, animations: 'disabled' });
  if (cible) return cible.screenshot({ path, animations: 'disabled' });
  return page.screenshot({ path, fullPage: true, animations: 'disabled' });
};
const dialogue = (page) => page.getByRole('dialog').last();
const telephone = (info) => info.project.name === 'telephone';

async function article(id, valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument(`devis_articles/${id}`, {
    code: '', libelle: 'Article test', unite: 'u', prixAchat: 10, tauxTva: null, actif: true, proprietaire: JEROME,
    creeLe: maintenant, modifieLe: maintenant, creePar: JEROME, modifiePar: JEROME, ...valeurs,
  });
}
/** Les familles de départ dont on donne seulement les changements (id, nom, actif) : un document comme celui que l'écran écrit. */
const poserFamilles = (changements) => ecrireDocument('devis_parametres/familles', { liste: changements });
async function devisBrouillon() {
  await creerOrganisation('o1', { nom: 'Société Exemple', adresses: [{ id: 'p1', libelle: 'Principale', adresse: '12 rue des Lilas\n75000 Paris', parDefaut: true }], emails: [{ valeur: 'contact@exemple.fr', type: 'travail' }] });
  await creerAffaire('a1', { titre: 'Rénovation', organisationId: 'o1' });
  const maintenant = new Date();
  await ecrireDocument('devis_devis/d1', {
    racineId: 'd1', version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', organisationId: 'o1', personneId: null, modeMarge: 'majoration', marge: 0, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, expireLe: '2026-11-23', destinataires: ['contact@exemple.fr'], objet: 'Rénovation',
    sections: [{ id: 's1', titre: 'Cuisine', lignes: [{ id: 'l1', libelle: 'Pose', quantite: 1, unite: 'u', prixAchat: 100, marge: 20, type: 'main_oeuvre' }] }],
    adresses: { commanditaire: { texte: '12 rue des Lilas' }, facturation: { texte: '12 rue des Lilas' }, chantier: { texte: '12 rue des Lilas' } },
    creePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant,
  });
}
/** Premier appel d'un test : connexion ; les suivants : changement d'adresse dans la même page (les familles écrites par l'écran des réglages arrivent donc par l'écoute en direct, comme pour l'utilisateur). */
const dejaConnectees = new WeakSet();
async function ouvrir(page, route) {
  if (dejaConnectees.has(page)) { await page.evaluate((r) => { location.hash = `#/${r}`; }, route); } else { await connecter(page, undefined, { route }); dejaConnectees.add(page); }
}
async function ouvrirReglagesFamilles(page) {
  await ouvrir(page, 'reglages/devis');
  await expect(page.locator('#reglages-familles')).toBeVisible();
  await attendreCalme(page);
}
async function ouvrirEditeur(page) {
  await ouvrir(page, 'devis/editeur/d1');
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
}
async function ouvrirCatalogue(page) {
  await ouvrir(page, 'devis/bordereau');
  await expect(page.locator('.page-devis')).toBeVisible();
  await attendreCalme(page);
}
const groupe = (page, id) => page.locator(`#reglages-familles [data-groupe="${id}"]`);
const ligneHaute = (page, id) => groupe(page, id).locator(`[data-famille="${id}"][data-niveau="1"]`);
const autresAjouts = async (page) => { await page.locator('[data-action="autres-ajouts"]').click(); };

test('1.1 « Fournitures » se renomme en « Supports » : le nom suit dans le Catalogue (colonne et filtre) et dans l’éditeur du devis (bouton « + » et boîte de recherche)', async ({ page }, info) => {
  await article('a1', { libelle: 'Vis à bois', type: 'fourniture' });
  await devisBrouillon();
  await ouvrirReglagesFamilles(page);
  const champ = ligneHaute(page, 'famille-1').locator('input');
  await expect(champ).toHaveValue('Fournitures');
  await champ.fill('Supports');
  await champ.press('Enter');
  await expect(page.locator('.toast', { hasText: 'Famille renommée' })).toBeVisible();
  await expect.poll(async () => (await lireDocument('devis_parametres/familles'))?.liste.find((f) => f.id === 'famille-1')).toMatchObject({ nom: 'Supports', actif: true });
  await capturer(page, info, '1.1-reglages-renommee', groupe(page, 'famille-1'));
  await ouvrirCatalogue(page);
  await expect(page.locator('.ligne-article[data-id="a1"] [data-champ="familleId"]')).toHaveText('Supports');
  await page.locator('[data-action="filtres"]').click();
  await expect(dialogue(page).locator('label:has([data-cle="familles"][data-valeur="famille-1"])')).toContainText('Supports');
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await ouvrirEditeur(page);
  await expect(page.locator('[data-action="ajouter-famille-1"]')).toContainText('Supports');
  await page.locator('[data-action="ajouter-famille-1"]').click();
  await expect(page.locator('[data-champ="filtre-famille"]')).toHaveValue('famille-1');
  await expect(page.locator('[data-champ="filtre-famille"] option[value="famille-1"]')).toHaveText('Supports');
  await capturer(page, info, '1.1-editeur-supports');
});

test('1.2 « Matériels » se désactive (la confirmation dit combien d’articles y sont) : plus de « Matériel » dans le menu « … » ni « insérer » ; l’article rangé dedans reste au Catalogue avec « désactivée »', async ({ page }, info) => {
  await article('a5', { libelle: 'Bétonnière', type: 'materiel', familleId: 'famille-5-2' });
  await devisBrouillon();
  await ouvrirReglagesFamilles(page);
  await ligneHaute(page, 'famille-5').locator('[data-action="desactiver-famille"]').click();
  await expect(dialogue(page)).toContainText('1 article actif y est rangé : il reste dans ton catalogue');
  await expect(dialogue(page)).toContainText('Les devis déjà faits ne changent pas');
  await capturer(page, info, '1.2-confirmation', 'vue');
  await dialogue(page).getByRole('button', { name: 'Désactiver' }).click();
  await expect(ligneHaute(page, 'famille-5')).toContainText('Désactivée');
  await expect.poll(async () => (await lireDocument('devis_parametres/familles'))?.liste.find((f) => f.id === 'famille-5')).toMatchObject({ actif: false });
  await capturer(page, info, '1.2-reglages-desactivee', groupe(page, 'famille-5'));
  await ouvrirEditeur(page);
  await autresAjouts(page);
  await expect(page.getByRole('menuitem', { name: 'Divers' })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: 'Matériel' })).toHaveCount(0);
  await capturer(page, info, '1.2-editeur-menu', 'vue');
  await page.keyboard.press('Escape');
  await page.locator('[data-action="ajouter-famille-1"]').click(); // la boîte de recherche ne propose ni « Matériels » ni ses sous-familles
  await expect(page.locator('[data-champ="filtre-famille"] option[value="famille-1"]')).toHaveCount(1);
  await expect(page.locator('[data-champ="filtre-famille"] option[value="famille-5"], [data-champ="filtre-famille"] option[value="famille-5-2"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.locator('tr[data-id="l1"] [data-action="menu-ligne"]').click();
  await page.getByRole('menuitem', { name: 'Insérer en dessous' }).click();
  await expect(page.locator('.menu-devis-ligne [data-menu="inserer-apres-divers"]')).toBeVisible();
  await expect(page.locator('.menu-devis-ligne [data-menu="inserer-apres-materiel"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await ouvrirCatalogue(page);
  await expect(page.locator('.ligne-article[data-id="a5"]')).toHaveCount(1); // l'article reste visible
  await expect(page.locator('.ligne-article[data-id="a5"] [data-champ="familleId"]')).toHaveText('Matériels › Outillage');
  await page.locator('[data-action="filtres"]').click();
  const optionMateriels = dialogue(page).locator('label:has([data-cle="familles"][data-valeur="famille-5"])');
  await expect(optionMateriels).toContainText('désactivée');
  await optionMateriels.scrollIntoViewIfNeeded();
  await capturer(page, info, '1.2-catalogue-filtre');
});

test('1.3 on ne peut pas désactiver la dernière famille active : « Il en faut au moins une. » sous la famille, sans fenêtre, rien d’écrit', async ({ page }, info) => {
  const autres = [1, 2, 3, 4, 5, 6].map((i) => ({ id: `famille-${i}`, nom: ['Fournitures', 'Main d’œuvre', 'Ouvrages', 'Sous-traitance', 'Matériels', 'Textes'][i - 1], actif: false }));
  await poserFamilles(autres);
  await ouvrirReglagesFamilles(page);
  await ligneHaute(page, 'famille-7').locator('[data-action="desactiver-famille"]').click();
  await expect(groupe(page, 'famille-7').locator('[data-erreur="famille-famille-7"]')).toHaveText('Il en faut au moins une.');
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(ligneHaute(page, 'famille-7')).not.toContainText('Désactivée');
  expect((await lireDocument('devis_parametres/familles')).liste.find((f) => f.id === 'famille-7')).toBeUndefined(); // rien n'a été écrit
  await capturer(page, info, '1.3-derniere-famille', groupe(page, 'famille-7'));
});

test('1.4 réactiver « Matériels » remet le bouton « Matériel » dans l’éditeur', async ({ page }, info) => {
  await poserFamilles([{ id: 'famille-5', nom: 'Matériels', actif: false }]);
  await devisBrouillon();
  await ouvrirReglagesFamilles(page);
  await expect(ligneHaute(page, 'famille-5')).toContainText('Désactivée');
  await ligneHaute(page, 'famille-5').locator('[data-action="reactiver-famille"]').click();
  await expect(page.locator('.toast', { hasText: '« Matériels » réactivée' })).toBeVisible();
  await expect.poll(async () => (await lireDocument('devis_parametres/familles'))?.liste.find((f) => f.id === 'famille-5')).toMatchObject({ nom: 'Matériels', actif: true });
  await expect(ligneHaute(page, 'famille-5')).not.toContainText('Désactivée');
  await ouvrirEditeur(page);
  await autresAjouts(page);
  await expect(page.getByRole('menuitem', { name: 'Matériel' })).toBeVisible();
  await capturer(page, info, '1.4-editeur-reactivee');
});

test('1.8 une sous-famille sous « Matériels » désactivée est refusée avec « Réactive d’abord « Matériels ». » (message sous la famille, rien d’écrit)', async ({ page }, info) => {
  await poserFamilles([{ id: 'famille-5', nom: 'Matériels', actif: false }]);
  await ouvrirReglagesFamilles(page);
  const g = groupe(page, 'famille-5');
  await g.locator('[data-champ="nouvelle-sous-famille"]').fill('Grues');
  await g.locator('[data-action="ajouter-sous-famille"]').click();
  await expect(g.locator('[data-erreur="famille-famille-5"]')).toHaveText('Réactive d’abord « Matériels ».');
  expect((await lireDocument('devis_parametres/familles')).liste.some((f) => f.nom === 'Grues')).toBe(false);
  await capturer(page, info, '1.8-sous-famille-refusee', groupe(page, 'famille-5'));
});

test('1.9 cas d’erreur : un nom déjà pris au premier niveau est refusé sous la famille et le champ reprend l’ancien nom ; cas vide : une famille sans article le dit dans la confirmation', async ({ page }, info) => {
  await ouvrirReglagesFamilles(page);
  const champ = ligneHaute(page, 'famille-1').locator('input');
  await champ.fill('ouvrages');
  await champ.press('Enter');
  await expect(groupe(page, 'famille-1').locator('[data-erreur="famille-famille-1"]')).toContainText('existe déjà');
  await expect(champ).toHaveValue('Fournitures');
  await capturer(page, info, '1.9-nom-pris', groupe(page, 'famille-1'));
  await ligneHaute(page, 'famille-6').locator('[data-action="desactiver-famille"]').click();
  await expect(dialogue(page)).toContainText('Aucun article actif n’y est rangé.');
  await dialogue(page).getByRole('button', { name: 'Annuler' }).click();
  await expect(ligneHaute(page, 'famille-6')).not.toContainText('Désactivée');
  await capturer(page, info, '1.9-aucun-article', groupe(page, 'famille-6'));
});

test('1.9 cas d’erreur : le bouton « Désactiver » d’une famille sur téléphone et ordinateur reste atteignable et nomme la famille', async ({ page }, info) => {
  await ouvrirReglagesFamilles(page);
  const b = ligneHaute(page, 'famille-3').locator('[data-action="desactiver-famille"]');
  await expect(b).toHaveAttribute('aria-label', 'Désactiver Ouvrages');
  await expect(ligneHaute(page, 'famille-3').locator('input')).toHaveAttribute('aria-label', 'Renommer la famille Ouvrages');
  const boite = await b.boundingBox();
  expect(boite.x + boite.width).toBeLessThanOrEqual(page.viewportSize().width);
  if (telephone(info)) expect(boite.height).toBeGreaterThanOrEqual(30);
  await capturer(page, info, '1.9-boutons', groupe(page, 'famille-3'));
});
