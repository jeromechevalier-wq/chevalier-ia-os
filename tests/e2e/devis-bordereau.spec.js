// Module Devis, premier écran : le Bordereau (articles) et les réglages du module. Chez Jérôme (racine) ; le parcours d'un client est dans devis-bordereau-client.spec.js.
// Un test par critère du brief (le nom commence par B1 à B10), une capture par point visible dans tests/e2e/captures/bordereau/ (format ordinateur).
import { fileURLToPath } from 'node:url';
import {
  test, expect, connecter, allerA, allerAuxReglagesCrm, ouvrirSectionReglages, attendreCalme, estTelephone, ecrireDocument, lireDocument, listerDocuments,
} from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/bordereau/', import.meta.url));
async function capturer(page, info, nom) {
  if (info.project.name !== 'ordinateur') return;
  await page.screenshot({ path: `${DOSSIER}${nom}.png`, fullPage: true, animations: 'disabled' });
}
/** La mise en page change sur téléphone (les lignes deviennent des cartes) : une capture de plus, seulement dans ce format. */
async function capturerTelephone(page, info, nom) {
  if (info.project.name !== 'telephone') return;
  await page.screenshot({ path: `${DOSSIER}${nom}-tel.png`, fullPage: true, animations: 'disabled' });
}
const dialogue = (page) => page.getByRole('dialog');
const aller = async (page, hash) => { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); };

/** Un article déjà dans la base (contourne l'écran). */
async function article(id, valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument(`devis_articles/${id}`, {
    code: '', libelle: 'Article test', unite: 'u', prixAchat: 10, tauxTva: null, actif: true, proprietaire: 'jerome.chevalier@gmail.com',
    creeLe: maintenant, modifieLe: maintenant, creePar: 'jerome.chevalier@gmail.com', modifiePar: 'jerome.chevalier@gmail.com', ...valeurs,
  });
}
async function ouvrirBordereau(page) {
  await connecter(page, undefined, { route: 'devis/bordereau' });
  await expect(page.locator('.page-devis')).toBeVisible();
  await attendreCalme(page);
}
const ligne = (page, libelle) => page.locator('.ligne-article', { hasText: libelle });
/** Une ligne par son identifiant : le texte d'une cellule en cours de modification n'est plus dans la ligne. */
const ligneId = (page, id) => page.locator(`.ligne-article[data-id="${id}"]`);
async function ouvrirReglagesDevis(page) {
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Devis');
  await expect(page.locator('#reglages-devis')).toBeVisible();
}

test('B1 le module Devis apparaît au menu (après Projets) et ouvre la liste puis le Bordereau, chez Jérôme', { tag: '@smoke' }, async ({ page }, info) => {
  await connecter(page);
  if (estTelephone(page)) await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  else { const elargir = page.getByRole('button', { name: 'Élargir le menu' }); if (await elargir.count()) await elargir.click(); }
  await expect(page.locator('.menu .menu-entree')).toHaveText(['Accueil', 'Personnes', 'Organisations', 'Affaires', 'Projets', 'Devis', 'Veille', 'Automatisations', 'Maintenance']);
  if (estTelephone(page)) await page.keyboard.press('Escape');
  await allerA(page, 'Devis');
  await expect(page).toHaveURL(/#\/devis\/liste$/);
  await expect(page.getByRole('heading', { name: 'Devis', level: 1 })).toBeVisible();
  await page.locator('[data-action="ouvrir-bordereau"]').click();
  await expect(page).toHaveURL(/#\/devis\/bordereau$/);
  await expect(page.getByRole('heading', { name: 'Bordereau de prix unitaires', level: 1 })).toBeVisible();
  if (estTelephone(page)) await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await expect(page.locator('.menu .menu-entree[aria-current="page"]')).toHaveText('Devis');
  if (estTelephone(page)) await page.keyboard.press('Escape');
  await capturer(page, info, 'B1-menu-devis');
});

test('B2 créer un article l\'affiche tout de suite et il reste après rechargement ; un libellé vide est refusé avec un message', { tag: '@smoke' }, async ({ page }, info) => {
  await ouvrirBordereau(page);
  await page.locator('[data-action="nouvel-article"]').click();
  await expect(dialogue(page)).toContainText('Ajouter un article');
  const enregistrer = dialogue(page).getByRole('button', { name: 'Enregistrer' });
  await expect(enregistrer).toBeDisabled(); // grisé tant que le libellé est vide
  await expect(dialogue(page).getByRole('textbox', { name: 'Libellé' })).toBeFocused();
  await page.keyboard.press('Enter'); // Entrée avec un libellé vide : le message dit quoi faire
  await expect(dialogue(page).locator('[data-erreur="libelle"]')).toContainText('Le libellé est obligatoire');
  expect(await listerDocuments('devis_articles')).toHaveLength(0);
  await capturer(page, info, 'B2-libelle-vide');
  await dialogue(page).getByRole('textbox', { name: 'Libellé' }).fill('Carrelage 60 x 60');
  await expect(enregistrer).toBeEnabled();
  await dialogue(page).locator('#article-unite').fill('m²'); // champ avec liste d'unités proposées : rôle « combobox »
  await dialogue(page).getByRole('textbox', { name: /Prix d’achat/ }).fill('12,5');
  await enregistrer.click();
  await expect(dialogue(page)).toHaveCount(0);
  const l = ligne(page, 'Carrelage 60 x 60');
  await expect(l).toBeVisible();
  await expect(l.locator('[data-colonne="prixAchat"]')).toHaveText('12,50 €');
  await expect(l.locator('[data-colonne="unite"]')).toHaveText('m²');
  await expect.poll(async () => (await listerDocuments('devis_articles'))[0]?.prixAchat).toBe(12.5);
  const doc = (await listerDocuments('devis_articles'))[0];
  expect([doc.libelle, doc.unite, doc.actif, doc.code, doc.tauxTva]).toEqual(['Carrelage 60 x 60', 'm²', true, '', null]);
  await capturer(page, info, 'B2-article-cree');
  await capturerTelephone(page, info, 'B2-article-cree');
  await page.reload();
  await expect(ligne(page, 'Carrelage 60 x 60')).toBeVisible();
  // la trace est dans le journal des modifications, comme pour les autres modules
  const audit = (await listerDocuments('crm_audit')).filter((a) => a.collection === 'devis_articles');
  expect(audit.map((a) => [a.action, a.outil])).toEqual([['creer', 'creerArticle']]);
});

test('B3 un code déjà utilisé par un article actif est refusé avec un message qui dit quoi faire', async ({ page }, info) => {
  await article('a1', { libelle: 'Carrelage', code: 'CAR-1' });
  await ouvrirBordereau(page);
  await page.locator('[data-action="nouvel-article"]').click();
  await dialogue(page).getByRole('textbox', { name: 'Libellé' }).fill('Autre carrelage');
  await dialogue(page).getByRole('textbox', { name: /Prix d’achat/ }).fill('9');
  await dialogue(page).getByRole('textbox', { name: /Code/ }).fill('car-1');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  const erreur = dialogue(page).locator('[data-erreur="code"]');
  await expect(erreur).toContainText('déjà utilisé par l’article actif « Carrelage »');
  await expect(erreur).toContainText('Choisis un autre code, ou désactive');
  await expect(dialogue(page)).toBeVisible(); // la fenêtre reste ouverte, rien n'est écrit
  expect(await listerDocuments('devis_articles')).toHaveLength(1);
  await capturer(page, info, 'B3-code-deja-utilise');
  await dialogue(page).getByRole('textbox', { name: /Code/ }).fill('CAR-2');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(ligne(page, 'Autre carrelage')).toBeVisible();
  expect(await listerDocuments('devis_articles')).toHaveLength(2);
});

test('B4 désactiver sort l\'article de la liste par défaut ; le filtre « désactivés » le montre ; Réactiver le remet', async ({ page }, info) => {
  await article('a1', { libelle: 'Carrelage' });
  await article('a2', { libelle: 'Peinture' });
  await ouvrirBordereau(page);
  await ligne(page, 'Carrelage').locator('[data-action="desactiver"]').click();
  await expect(dialogue(page)).toContainText('Désactiver cet article ?');
  await expect(dialogue(page)).toContainText('Un article ne se supprime jamais : il se désactive');
  await dialogue(page).getByRole('button', { name: 'Désactiver' }).click();
  await expect(page.locator('.toast')).toContainText('Article désactivé');
  await expect(page.locator('.toast [data-action="toast-action"]')).toHaveText('Annuler');
  await expect(ligne(page, 'Carrelage')).toHaveCount(0);
  await expect(ligne(page, 'Peinture')).toBeVisible();
  await expect.poll(async () => (await lireDocument('devis_articles/a1')).actif).toBe(false);
  expect(await listerDocuments('devis_articles')).toHaveLength(2); // jamais supprimé
  await capturer(page, info, 'B4-desactive-sorti-de-la-liste');
  await page.locator('[data-action="filtres"]').click();
  await dialogue(page).getByRole('checkbox', { name: 'Désactivés seulement' }).check();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(ligne(page, 'Carrelage')).toBeVisible();
  await expect(ligne(page, 'Peinture')).toHaveCount(0);
  await expect(ligne(page, 'Carrelage')).toContainText('Désactivé');
  await capturer(page, info, 'B4-filtre-desactives');
  await ligne(page, 'Carrelage').locator('[data-action="reactiver"]').click();
  await expect(page.locator('.toast').last()).toContainText('Article réactivé');
  await expect.poll(async () => (await lireDocument('devis_articles/a1')).actif).toBe(true);
  await expect(page.locator('.etat-vide')).toContainText('Aucun article désactivé');
  await page.locator('[data-action="filtres"]').click();
  await dialogue(page).getByRole('button', { name: 'Tout effacer' }).click();
  await expect(ligne(page, 'Carrelage')).toBeVisible();
  await expect(ligne(page, 'Peinture')).toBeVisible();
});

test('B4 « Annuler » pendant 8 secondes remet l\'article désactivé', async ({ page }) => {
  await article('a1', { libelle: 'Carrelage' });
  await ouvrirBordereau(page);
  await ligne(page, 'Carrelage').locator('[data-action="desactiver"]').click();
  await dialogue(page).getByRole('button', { name: 'Désactiver' }).click();
  await expect(ligne(page, 'Carrelage')).toHaveCount(0);
  await page.locator('.toast [data-action="toast-action"]').click();
  await expect(ligne(page, 'Carrelage')).toBeVisible();
  await expect.poll(async () => (await lireDocument('devis_articles/a1')).actif).toBe(true);
});

test('B5 modifier sur place un prix d\'achat (virgule française acceptée) l\'enregistre en euros ; un prix invalide reste dans le champ avec un message', { tag: '@smoke' }, async ({ page }, info) => {
  await article('a1', { libelle: 'Carrelage', prixAchat: 10 });
  await ouvrirBordereau(page);
  const cellule = ligneId(page, 'a1').locator('[data-colonne="prixAchat"]');
  await expect(cellule).toHaveText('10,00 €');
  await cellule.locator('button').click();
  const champ = cellule.locator('input');
  await expect(champ).toHaveValue('10,00');
  await champ.fill('douze');
  await champ.press('Enter');
  await expect(cellule.locator('[data-erreur="prixAchat"]')).toContainText('doit être un nombre en euros');
  await capturer(page, info, 'B5-prix-invalide');
  await capturerTelephone(page, info, 'B5-prix-invalide');
  await champ.fill('12,75');
  await champ.press('Enter');
  await expect(cellule).toHaveText('12,75 €');
  await expect.poll(async () => (await lireDocument('devis_articles/a1')).prixAchat).toBe(12.75);
  await capturer(page, info, 'B5-prix-modifie');
  // Échap annule sans écrire
  await cellule.locator('button').click();
  await cellule.locator('input').fill('99');
  await cellule.locator('input').press('Escape');
  await expect(cellule).toHaveText('12,75 €');
  expect((await lireDocument('devis_articles/a1')).prixAchat).toBe(12.75);
  // le libellé se modifie aussi sur place ; vide, il est refusé
  const libelle = ligneId(page, 'a1').locator('[data-colonne="libelle"]');
  await libelle.locator('button').click();
  await libelle.locator('input').fill('');
  await libelle.locator('input').press('Enter');
  await expect(libelle.locator('[data-erreur="libelle"]')).toContainText('Le libellé est obligatoire');
  await libelle.locator('input').fill('Carrelage grès');
  await libelle.locator('input').press('Enter');
  await expect(ligne(page, 'Carrelage grès')).toBeVisible();
  const audit = (await listerDocuments('crm_audit')).filter((a) => a.collection === 'devis_articles');
  expect(audit.map((a) => a.outil).sort()).toEqual(['majArticle', 'majArticle']);
});

test('B6 le titre de l\'écran suit le nom de bordereau choisi dans les réglages', async ({ page }, info) => {
  await connecter(page);
  await ouvrirReglagesDevis(page);
  await page.locator('#devis-nomBordereau').selectOption('Catalogue');
  await page.locator('[data-action="enregistrer-reglages-devis"]').click();
  await expect(page.locator('.toast')).toContainText('Réglages des devis enregistrés');
  await expect.poll(async () => (await lireDocument('devis_parametres/reglages'))?.nomBordereau).toBe('Catalogue');
  await allerA(page, 'Devis');
  await page.locator('[data-action="ouvrir-bordereau"]').click();
  await expect(page.getByRole('heading', { name: 'Catalogue', level: 1 })).toBeVisible();
  await capturer(page, info, 'B6-titre-catalogue');
  await ecrireDocument('devis_parametres/reglages', { nomBordereau: 'Grille tarifaire' });
  await expect(page.getByRole('heading', { name: 'Grille tarifaire', level: 1 })).toBeVisible(); // en direct, sans recharger
});

test('B7 les réglages (mode de marge, régime de TVA, durée, étapes) s\'enregistrent et se relisent ; une marge sur prix de vente de 100 % ou plus est refusée avec un message', async ({ page }, info) => {
  await connecter(page);
  await ouvrirReglagesDevis(page);
  const enregistrer = page.locator('[data-action="enregistrer-reglages-devis"]');
  await expect(enregistrer).toBeDisabled(); // rien à enregistrer
  await expect(page.locator('#devis-nomBordereau')).toHaveValue('Bordereau de prix unitaires');
  await expect(page.locator('#devis-marge')).toHaveValue('20');
  await expect(page.locator('#devis-dureeValiditeJours')).toHaveValue('90');
  await capturer(page, info, 'B7-reglages-par-defaut');
  await page.locator('#devis-modeMarge').selectOption('marge_vente');
  await page.locator('#devis-marge').fill('100');
  await expect(enregistrer).toBeEnabled();
  await enregistrer.click();
  await expect(page.locator('[data-erreur="marge"]')).toContainText('La marge sur le prix de vente doit être inférieure à 100 %.');
  expect(await lireDocument('devis_parametres/reglages')).toBeNull();
  await capturer(page, info, 'B7-marge-100-refusee');
  await page.locator('#devis-marge').fill('25,5');
  await page.locator('#devis-regimeTva').selectOption('franchise');
  await page.locator('#devis-dureeValiditeJours').fill('60');
  await page.locator('#devis-etapeAFaire').selectOption({ label: 'Rendez vous fixé' });
  await page.locator('#devis-etapeEnvoye').selectOption({ label: 'Proposition envoyée' });
  await page.locator('#devis-mentionEmetteur').fill('Une mention');
  await page.locator('[data-champ="tauxProposes"] input[data-taux="5.5"]').uncheck();
  await enregistrer.click();
  await expect(page.locator('.toast', { hasText: 'Réglages des devis enregistrés' })).toBeVisible();
  await expect(page.locator('[data-erreur="marge"]')).toHaveText('');
  await expect(enregistrer).toBeDisabled();
  const r = await lireDocument('devis_parametres/reglages');
  expect(r).toMatchObject({ modeMarge: 'marge_vente', marge: 25.5, regimeTva: 'franchise', dureeValiditeJours: 60, etapeAFaire: 'rdv_fixe', etapeEnvoye: 'proposition_envoyee', mentionEmetteur: 'Une mention', tauxProposes: [20, 10], tauxTvaDefaut: 20 });
  await page.reload();
  await attendreCalme(page);
  await expect(page.locator('#reglages-devis')).toBeVisible();
  await expect(page.locator('#devis-modeMarge')).toHaveValue('marge_vente');
  await expect(page.locator('#devis-marge')).toHaveValue('25,5');
  await expect(page.locator('#devis-regimeTva')).toHaveValue('franchise');
  await expect(page.locator('#devis-dureeValiditeJours')).toHaveValue('60');
  await expect(page.locator('#devis-etapeAFaire')).toHaveValue('rdv_fixe');
  await expect(page.locator('#devis-etapeEnvoye')).toHaveValue('proposition_envoyee');
  await expect(page.locator('#devis-mentionEmetteur')).toHaveValue('Une mention');
  await capturer(page, info, 'B7-reglages-relus');
  // mêmes étapes pour « à faire » et « envoyé » : refusé
  await page.locator('#devis-etapeEnvoye').selectOption({ label: 'Rendez vous fixé' });
  await enregistrer.click();
  await expect(page.locator('[data-erreur="etapeEnvoye"]')).toContainText('différente');
  // « Annuler les changements » remet les réglages enregistrés (et libère la page : sans brouillon, on la quitte sans question)
  await page.locator('[data-action="annuler-reglages-devis"]').click();
  await expect(page.locator('#devis-etapeEnvoye')).toHaveValue('proposition_envoyee');
  await expect(page.locator('[data-erreur="etapeEnvoye"]')).toHaveText('');
  await expect(enregistrer).toBeDisabled();
  // le réglage « Google Drive : dossiers de projets » du CRM n'est pas touché
  await allerAuxReglagesCrm(page);
  await expect(page.locator('#reglages-projets')).toBeVisible();
});

test('B10 cas vide du bordereau : une phrase qui explique et un bouton « + Article » ; recherche sans résultat', async ({ page }, info) => {
  await ouvrirBordereau(page);
  await expect(page.locator('.etat-vide')).toContainText('Aucun article. Un article est une ligne de ton bordereau de prix');
  const vide = page.locator('.etat-vide [data-action="nouvel-article-vide"]');
  await expect(vide).toHaveText('Article');
  await expect(page.locator('.page-devis .bouton-principal')).toHaveCount(1); // un seul bouton jaune par écran
  await capturer(page, info, 'B10-cas-vide');
  await capturerTelephone(page, info, 'B10-cas-vide');
  await vide.click();
  await expect(dialogue(page)).toContainText('Ajouter un article');
  await page.keyboard.press('Escape');
  await article('a1', { libelle: 'Carrelage' });
  await page.getByRole('searchbox', { name: 'Rechercher un article' }).fill('zzz');
  await expect(page.locator('.etat-vide')).toContainText('Aucun article ne correspond.');
  await page.getByRole('searchbox', { name: 'Rechercher un article' }).fill('carre');
  await expect(ligne(page, 'Carrelage')).toBeVisible();
});
