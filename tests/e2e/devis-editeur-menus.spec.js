// Module Devis, éditeur de devis, partie 2 : menus (ligne, Options, ajustement global, Finaliser), panneau Bibliothèque, impression depuis le navigateur.
// Un test par point du brief (le nom commence par le numéro du point), une capture par point : tests/e2e/captures/devis-editeur-menus/ (ordinateur ET téléphone : la mise en page change).
// Les fonctions du serveur (devisFinaliser) n'existent pas dans l'émulateur du navigateur : elles sont SIMULÉES par page.route, comme dans devis-editeur.spec.js.
import { fileURLToPath } from 'node:url';
import {
  test, expect, connecter, attendreCalme, ecrireDocument, lireDocument, listerDocuments, creerOrganisation, creerAffaire, estTelephone, JEROME,
} from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-editeur-menus/', import.meta.url));
/** `pleine` : toute la page ; sinon ce qu'on voit à l'écran (pour montrer un menu ouvert ou un panneau). */
async function capturer(page, info, nom, { pleine = false } = {}) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: pleine, animations: 'disabled' });
}
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const dialogue = (page) => page.getByRole('dialog');
const lignes = (page) => page.locator('tr.ligne-devis-edition');
const total = (page, cle) => page.locator(`[data-total="${cle}"]`);
const textes = (page) => lignes(page).locator('[data-champ="libelle"]').evaluateAll((els) => els.map((e) => e.value));
const SAFARI = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15';

async function article(id, valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument(`devis_articles/${id}`, {
    code: '', libelle: 'Article test', unite: 'u', prixAchat: 10, tauxTva: null, actif: true, proprietaire: JEROME,
    creeLe: maintenant, modifieLe: maintenant, creePar: JEROME, modifiePar: JEROME, ...valeurs,
  });
}
async function semer() {
  await creerOrganisation('o1', {
    nom: 'Société Exemple', adresses: [{ id: 'p1', libelle: 'Principale', adresse: '12 rue des Lilas\n75000 Paris', parDefaut: true }], emails: [{ valeur: 'contact@exemple.fr', type: 'travail' }],
    telephones: [{ valeur: '01 23 45 67 89', type: 'travail' }],
  });
  await creerAffaire('a1', { titre: 'Rénovation restaurant', organisationId: 'o1' });
  await article('a1', { libelle: 'Carrelage 60 x 60', unite: 'm²', prixAchat: 50, type: 'fourniture', code: 'CAR60' }); // vendu 60,00 € (marge des réglages : 20 %)
  await article('a2', { libelle: 'Pose du carrelage', unite: 'h', prixAchat: 30, tauxTva: 10, type: 'main_oeuvre' }); // vendu 36,00 €
}
const ligne = (id, libelle, quantite, prixAchat, extra = {}) => ({ id, libelle, quantite, unite: 'u', prixAchat, marge: 0, ...extra });
async function devis(id, sections, extra = {}) {
  const maintenant = new Date();
  await ecrireDocument(`devis_devis/${id}`, {
    racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', organisationId: 'o1', personneId: null, modeMarge: 'majoration', marge: 0, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, expireLe: '2026-11-23', destinataires: ['contact@exemple.fr'], objet: 'Rénovation restaurant', sections,
    adresses: { commanditaire: { texte: '12 rue des Lilas\n75000 Paris' }, facturation: { texte: '12 rue des Lilas\n75000 Paris' }, chantier: { texte: '12 rue des Lilas\n75000 Paris' } },
    creePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, ...extra,
  });
  return id;
}
async function ouvrir(page, id) {
  await connecter(page, undefined, { route: `devis/editeur/${id}` });
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
}
/** Options : sur ordinateur le bouton de la barre, sur téléphone le bouton « … ». */
async function ouvrirOptions(page) {
  if (estTelephone(page)) {
    await page.locator('[data-action="plus-actions"]').click();
    await page.getByRole('menuitem', { name: 'Options' }).click();
  } else {
    await page.locator('[data-action="options"]').click();
  }
  await expect(page.locator('.menu-devis-options')).toBeVisible();
}
const enregistre = (page) => expect(page.locator('[data-valeur="enregistrement"]')).toHaveText('Enregistré');

test('1 le menu de la ligne : insérer au-dessus et en dessous (sous-menu), plus d’entrée « photos », dupliquer, monter, descendre, supprimer ; le bouton « Configurer les éléments de l’ouvrage » ouvre la composition', async ({ page }, info) => {
  await semer();
  const ouvrage = ligne('lo', 'Cloison', 1, 100, {
    marge: 20, type: 'ouvrage', description: '- Carrelage 60 x 60 (2 m²)',
    ouvrage: { composants: [{ articleId: 'a1', libelle: 'Carrelage 60 x 60', unite: 'm²', quantite: 2, prixVenteUnitaire: 60, prixAchat: 50 }], prixVenteHT: 120, deboursSecHT: 100 },
  });
  await ouvrir(page, await devis('d1', [{ id: 's1', titre: 'Cuisine', lignes: [ligne('l1', 'Carrelage', 2, 50), ouvrage] }], { marge: 20 }));
  await page.locator('tr[data-id="l1"] [data-action="menu-ligne"]').click();
  const menu = page.locator('.menu-devis-ligne');
  await expect(menu).toBeVisible();
  for (const nom of ['Insérer au dessus', 'Insérer en dessous', 'Dupliquer', 'Monter', 'Descendre', 'Supprimer']) await expect(menu.getByRole('menuitem', { name: nom })).toBeVisible();
  await expect(menu.getByRole('menuitem', { name: 'Ajouter des photos' })).toHaveCount(0); // Jérôme : « on peut s’en passer »
  // Le sous-menu « Insérer en dessous » propose les neuf choix ; on l'ouvre pour la capture.
  await menu.getByRole('menuitem', { name: 'Insérer en dessous' }).click();
  for (const nom of ['Fourniture', 'Main d’œuvre', 'Ouvrage', 'Sous-traitance', 'Matériel', 'Divers', 'Section', 'Texte', 'Saut de page']) await expect(menu.locator(`[data-menu^="inserer-apres-"]`).filter({ hasText: nom }).first()).toBeVisible();
  await capturer(page, info, '1-menu-ligne');
  // « Insérer au-dessus » : la nouvelle ligne se place avant la ligne choisie.
  await menu.getByRole('menuitem', { name: 'Insérer au dessus' }).click();
  await menu.locator('[data-menu="inserer-avant-texte"]').click();
  await expect(lignes(page)).toHaveCount(3);
  expect(await textes(page)).toEqual(['', 'Carrelage', 'Cloison']);
  // « Insérer en dessous » : juste après.
  await page.locator('tr[data-id="l1"] [data-action="menu-ligne"]').click();
  await page.getByRole('menuitem', { name: 'Insérer en dessous' }).click();
  await page.locator('[data-menu="inserer-apres-texte"]').click();
  expect(await textes(page)).toEqual(['', 'Carrelage', '', 'Cloison']);
  // Un ouvrage : le bouton apparaît quand on écrit dans sa désignation et ouvre la composition ; changer la quantité d'un élément recalcule le prix (3 × 60 = 180 €).
  await page.locator('tr[data-id="lo"] [data-champ="libelle"]').click();
  const configurer = page.locator('tr[data-id="lo"] [data-action="configurer-ouvrage"]');
  await expect(configurer).toBeVisible();
  await expect(configurer).toHaveText('Configurer les éléments de l’ouvrage');
  await configurer.click();
  await expect(dialogue(page)).toContainText('Éléments de l’ouvrage');
  await capturer(page, info, '1-ouvrage-composition');
  await dialogue(page).locator('[data-champ="quantite-composant"]').fill('3');
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('tr[data-id="lo"] [data-champ="prix-vente"]')).toHaveValue('180,00');
  await expect(page.locator('tr[data-id="lo"] [data-valeur="composition"]')).toContainText('Carrelage 60 x 60 (3 m²)');
  // Supprimer garde la confirmation d'avant.
  await page.locator('tr[data-id="l1"] [data-action="menu-ligne"]').click();
  await page.getByRole('menuitem', { name: 'Supprimer' }).click();
  await expect(dialogue(page)).toContainText('Supprimer cette ligne ?');
  await dialogue(page).getByRole('button', { name: 'Annuler' }).click();
  await enregistre(page);
});

test('2 la Bibliothèque : l’arbre des familles à gauche, les articles à cocher à droite, « Ajouter au devis (N) » les pose à la fin de la section en cours ; le devis reste modifiable ; Échap ferme', async ({ page }, info) => {
  await semer();
  await ouvrir(page, await devis('d2', [{ id: 's1', titre: 'Cuisine', lignes: [ligne('l1', 'Dépose', 1, 10)] }, { id: 's2', titre: 'Salon', lignes: [ligne('l2', 'Peinture', 1, 20)] }]));
  await page.locator('[data-action="bibliotheque"]').click();
  const panneau = page.locator('[data-zone="bibliotheque"]');
  await expect(panneau).toBeVisible();
  await expect(panneau.locator('[data-famille="toutes"]')).toHaveClass(/choisie/);
  await expect(panneau.locator('[data-article-id]')).toHaveCount(2);
  await expect(panneau.locator('[data-zone="fin-resultats"]')).toHaveText('Fin des résultats');
  await expect(panneau.locator('[data-action="ajouter-bibliotheque"]')).toBeDisabled();
  await expect(panneau.locator('[data-action="ajouter-bibliotheque"]')).toHaveText('Ajouter au devis (0)');
  // Une famille : seuls ses articles ; une famille vide : le message du cas vide.
  await panneau.locator('[data-famille="famille-1"]').click();
  await expect(panneau.locator('[data-famille="famille-1"]')).toHaveClass(/choisie/);
  await expect(panneau.locator('[data-article-id]')).toHaveCount(1);
  await expect(panneau.locator('[data-article-id="a1"]')).toBeVisible();
  await panneau.locator('[data-famille="famille-4"]').click();
  await expect(panneau.locator('[data-vide="famille"]')).toHaveText('Aucun article dans cette famille.');
  // La recherche, puis les deux cases cochées.
  await panneau.locator('[data-famille="toutes"]').click();
  await panneau.locator('[data-champ="recherche-bibliotheque"]').fill('zzz');
  await expect(panneau.locator('[data-vide="famille"]')).toHaveText('Aucun article ne correspond.');
  await panneau.locator('[data-champ="recherche-bibliotheque"]').fill('');
  await panneau.locator('[data-article-id="a1"]').check();
  await panneau.locator('[data-article-id="a2"]').check();
  await expect(panneau.locator('[data-action="ajouter-bibliotheque"]')).toHaveText('Ajouter au devis (2)');
  await capturer(page, info, '2-bibliotheque');
  // On clique d'abord dans une ligne de la première section : les articles entrent à la FIN de cette section.
  if (!estTelephone(page)) {
    await page.locator('tr[data-id="l1"] [data-champ="libelle"]').click(); // le devis reste modifiable avec le panneau ouvert
    await panneau.locator('[data-action="ajouter-bibliotheque"]').click();
  } else {
    await panneau.locator('[data-action="ajouter-bibliotheque"]').click(); // sur téléphone le panneau couvre l'écran : section en cours = la dernière
  }
  await expect(panneau.locator('[data-action="ajouter-bibliotheque"]')).toHaveText('Ajouter au devis (0)');
  await expect(lignes(page)).toHaveCount(4);
  expect(await textes(page)).toEqual(estTelephone(page) ? ['Dépose', 'Peinture', 'Carrelage 60 x 60', 'Pose du carrelage'] : ['Dépose', 'Carrelage 60 x 60', 'Pose du carrelage', 'Peinture']);
  await expect(panneau).toBeVisible(); // le panneau reste ouvert pour continuer
  // Échap ferme le panneau sans perdre la saisie.
  await panneau.locator('[data-champ="recherche-bibliotheque"]').press('Escape');
  await expect(panneau).toHaveCount(0);
  await expect(lignes(page)).toHaveCount(4);
  await enregistre(page);
  expect((await lireDocument('devis_devis/d2')).sections.flatMap((s) => s.lignes).length).toBe(4);
  // Cas vide : un Bordereau sans article.
  await page.locator('[data-action="bibliotheque"]').click();
  await expect(page.locator('[data-zone="bibliotheque"]')).toBeVisible();
  if (estTelephone(page)) await page.locator('[data-action="retour-bibliotheque"]').click(); else await page.locator('[data-action="fermer-bibliotheque"]').click();
  await expect(page.locator('[data-zone="bibliotheque"]')).toHaveCount(0);
});

test('2 cas vide : une Bibliothèque sans aucun article le dit et renvoie au Bordereau', async ({ page }) => {
  await creerOrganisation('o1', { nom: 'Société Exemple' });
  await creerAffaire('a1', { titre: 'Rénovation restaurant', organisationId: 'o1' });
  await ouvrir(page, await devis('d2v', []));
  await page.locator('[data-action="bibliotheque"]').click();
  await expect(page.locator('[data-zone="bibliotheque"] [data-vide="bordereau"]')).toContainText('Ton Bordereau est vide');
  await expect(page.locator('[data-zone="bibliotheque"] [data-action="ajouter-bibliotheque"]')).toBeDisabled();
});

test('3 l’ajustement global : trois champs liés (%, €, coefficient), le Net à payer change à l’écran, la colonne devient « Prix U. HT ajusté », rien n’est enregistré si le coefficient est refusé', async ({ page }, info) => {
  await semer();
  await ouvrir(page, await devis('d3', [{ id: 's1', titre: 'Travaux', lignes: [ligne('l1', 'Carrelage', 10, 60), ligne('l2', 'Pose', 5, 36), ligne('l3', 'Forfait', 1, 100)] }]));
  await expect(total(page, 'net')).toHaveText(/^1\s?056,00\s€$/); // 880 € HT + 20 %
  await expect(page.locator('th.col-pri')).toHaveText('Prix U. HT');
  await page.locator('[data-action="definir-ajustement"]').click();
  const menu = page.locator('.menu-devis-ajustement');
  await expect(menu.getByRole('menuitem', { name: 'Ajustement global' })).toBeVisible();
  await expect(menu.locator('.menu-devis-titre')).toHaveText('Poste HT');
  await expect(menu.getByRole('menuitem', { name: 'Remise' })).toBeEnabled();
  for (const nom of ['Compte prorata', 'Poste libre HT']) {
    await expect(menu.getByRole('menuitem', { name: nom })).toBeDisabled();
    await expect(menu.getByRole('menuitem', { name: nom })).toContainText('bientôt disponible');
  }
  // Coefficient 1,10 : 10 × 66 + 5 × 39,60 + 110 = 968 € HT ; les deux autres champs suivent (10 % et 88 €).
  await menu.locator('[data-champ="ajust-coefficient"]').fill('1,10');
  await expect(menu.locator('[data-champ="ajust-pourcentage"]')).toHaveValue('10,00');
  await expect(menu.locator('[data-champ="ajust-montant"]')).toHaveValue('88,00');
  await expect(total(page, 'net')).toHaveText(/^1\s?161,60\s€$/);
  await expect(total(page, 'ht')).toHaveText(/^968,00\s€$/);
  await expect(page.locator('th.col-pri')).toHaveText('Prix U. HT ajusté');
  await expect(page.locator('tr[data-id="l1"] [data-prix-ajuste]')).toContainText('66,00');
  // Le pourcentage recalcule le coefficient et le montant.
  await menu.locator('[data-champ="ajust-pourcentage"]').fill('33');
  await expect(menu.locator('[data-champ="ajust-coefficient"]')).toHaveValue('1,3300');
  await expect(menu.locator('[data-champ="ajust-montant"]')).toHaveValue('290,40');
  await menu.locator('[data-champ="ajust-montant"]').fill('88');
  await expect(menu.locator('[data-champ="ajust-coefficient"]')).toHaveValue('1,1000');
  await capturer(page, info, '3-ajustement');
  // Cas d'erreur : un coefficient à 0 ou illisible est refusé avec un message sous le champ ; le total ne bouge pas.
  await menu.locator('[data-champ="ajust-coefficient"]').fill('0');
  await expect(menu.locator('[data-erreur="ajust-coefficient"]')).toContainText('plus grand que 0');
  await expect(menu.locator('[data-champ="ajust-coefficient"]')).toHaveClass(/invalide/);
  await expect(total(page, 'net')).toHaveText(/^1\s?161,60\s€$/);
  await menu.locator('[data-champ="ajust-coefficient"]').fill('abc');
  await expect(menu.locator('[data-erreur="ajust-coefficient"]')).toContainText('Écris un coefficient');
  await expect(total(page, 'net')).toHaveText(/^1\s?161,60\s€$/);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await enregistre(page);
  expect((await lireDocument('devis_devis/d3')).ajustement).toEqual({ coefficient: 1.1 });
  // Retirer l'ajustement rend les totaux d'avant.
  await page.locator('[data-action="definir-ajustement"]').click();
  await page.locator('.menu-devis-ajustement [data-action="retirer-ajustement"]').click();
  await expect(total(page, 'net')).toHaveText(/^1\s?056,00\s€$/);
  await expect(page.locator('th.col-pri')).toHaveText('Prix U. HT');
});

test('4 le menu Options : trois groupes de cases (Édition, Document, Clients), les choix pas encore prêts sont grisés « bientôt disponible » ; les cases agissent sur l’écran et l’aperçu et sont enregistrées dans le devis', async ({ page }, info) => {
  await semer();
  await ouvrir(page, await devis('d4', [{ id: 's1', titre: 'Cuisine', lignes: [ligne('l1', 'Carrelage', 2, 50, { code: 'CAR60' })] }], { affichage: { afficherMarges: false } }));
  // Un devis neuf (affichage sans marges) ne montre pas le calcul des marges.
  await expect(page.locator('[data-zone="marges"]')).toBeHidden();
  await expect(page.locator('[data-calcul-marge]')).toBeHidden();
  await ouvrirOptions(page);
  const menu = page.locator('.menu-devis-options');
  await expect(menu.locator('.menu-devis-titre')).toHaveText(['Édition', 'Document', 'Clients', 'Import / Export']);
  for (const cle of ['afficherMarges', 'afficherReferences', 'attestationTva', 'autoliquidation', 'cacherDechets', 'cacherTotauxSections', 'cacherQuantiteUnite', 'cacherTva', 'cacherElementsOuvrage', 'afficherPrixElementsOuvrage',
    'afficherTelephone', 'afficherEmail', 'afficherNumeroTva', 'afficherSiren']) await expect(menu.locator(`[data-option="${cle}"]`)).toBeVisible();
  await expect(menu.locator('[data-champ="tva-defaut"]')).toBeVisible();
  // Les choix pas encore prêts : grisés, avec l'information.
  for (const nom of ['Afficher les remises par ligne', 'Afficher les stocks', 'Numérotation personnalisée', 'Date visite préalable', 'Cacher l’annexe photos', 'Cacher le reste à facturer']) {
    const c = menu.locator('label.menu-devis-case').filter({ hasText: nom });
    await expect(c.locator('input')).toBeDisabled();
    await expect(c).toContainText('bientôt disponible');
  }
  for (const nom of ['Importer un devis', 'Exporter des lignes']) {
    await expect(menu.getByRole('menuitem', { name: nom })).toBeDisabled();
    await expect(menu.getByRole('menuitem', { name: nom })).toContainText('bientôt disponible');
  }
  await capturer(page, info, '4-options');
  // Édition : « Afficher le calcul des marges » montre la carte des marges et une ligne « Achat · Marge · Vente » par article ; « Afficher les références » montre le code.
  await menu.locator('[data-option="afficherMarges"]').check();
  await expect(page.locator('[data-zone="marges"]')).toBeVisible();
  await expect(page.locator('tr[data-id="l1"] [data-calcul-marge]')).toContainText('Achat 50,00');
  await menu.locator('[data-option="afficherReferences"]').check();
  await expect(page.locator('tr[data-id="l1"] [data-valeur="reference"]')).toHaveText('Réf. : CAR60');
  // Document : cacher la colonne TVA, les colonnes quantité et unité, les totaux de section.
  await menu.locator('[data-option="cacherTva"]').check();
  await expect(page.locator('th.col-tva')).toHaveCount(0);
  await expect(page.locator('tr[data-id="l1"] [data-champ="tva"]')).toHaveCount(0);
  await menu.locator('[data-option="cacherQuantiteUnite"]').check();
  await expect(page.locator('th.col-qte')).toHaveCount(0);
  await expect(page.locator('th.col-uni')).toHaveCount(0);
  await menu.locator('[data-option="cacherTotauxSections"]').check();
  await expect(page.locator('[data-sous-total]')).toHaveCount(0);
  // Clients : le téléphone du client (01 23 45 67 89) apparaît dans l'aperçu seulement quand la case est cochée.
  await menu.locator('[data-option="afficherTelephone"]').check();
  // Autoliquidation : la TVA passe à 0.
  await menu.locator('[data-option="autoliquidation"]').check();
  await expect(total(page, 'tva')).toHaveText(/^0,00\s€$/);
  await menu.locator('[data-option="autoliquidation"]').uncheck();
  await expect(total(page, 'tva')).toHaveText(/^20,00\s€$/);
  await page.keyboard.press('Escape');
  await expect(menu).toHaveCount(0);
  await page.locator('[data-onglet="apercu"]').click();
  const apercu = page.locator('iframe[data-zone="apercu"]').contentFrame().locator('body');
  await expect(apercu).toContainText('Carrelage');
  await expect(apercu).toContainText('01 23 45 67 89');
  await expect(apercu).not.toContainText('Sous-total');
  await expect(apercu).not.toContainText('Qté');
  await expect(apercu).toContainText('Réf. : CAR60');
  await capturer(page, info, '4-apercu-options', { pleine: true });
  await enregistre(page);
  const affichage = (await lireDocument('devis_devis/d4')).affichage;
  expect(affichage).toMatchObject({ afficherMarges: true, afficherReferences: true, cacherTva: true, cacherQuantiteUnite: true, cacherTotauxSections: true, afficherTelephone: true });
  // Rechargé, le devis garde ses cases.
  await page.reload();
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
  await expect(page.locator('th.col-tva')).toHaveCount(0);
  await expect(page.locator('[data-zone="marges"]')).toBeVisible();
});

test('4 un ancien devis (sans `affichage`) garde l’affichage d’avant : le calcul des marges reste visible', async ({ page }) => {
  await semer();
  await ouvrir(page, await devis('d4b', [{ id: 's1', titre: 'Cuisine', lignes: [ligne('l1', 'Carrelage', 2, 50)] }]));
  await expect(page.locator('[data-zone="marges"]')).toBeVisible();
  await expect(page.locator('tr[data-id="l1"] [data-calcul-marge]')).toContainText('Achat 50,00');
  await expect(page.locator('th.col-tva')).toHaveCount(1);
});

test('5 « Imprimer / Enregistrer en PDF » dans l’aperçu lance l’impression du devis (numéro et total dans le document)', { tag: '@sans-telephone' }, async ({ page }, info) => {
  await semer();
  const id = await devis('d5', [{ id: 's1', titre: 'Cuisine', lignes: [ligne('l1', 'Pose', 2, 100, { prixVente: 100, tauxTva: 20 })] }], { statut: 'en_attente_envoi', numero: 'DEV-2026-10-24-001', finaliseLe: new Date() });
  await ouvrir(page, id);
  const cadre = page.locator('iframe[data-zone="apercu"]');
  await expect(cadre.contentFrame().locator('body')).toContainText('DEV-2026-10-24-001');
  await expect(cadre.contentFrame().locator('body')).toContainText('240,00');
  await expect(cadre).toHaveAttribute('sandbox', 'allow-same-origin allow-modals');
  // La boîte d'impression du système ne s'ouvre pas : on remplace print() de l'aperçu et on compte les appels.
  await page.evaluate(() => { document.querySelector('iframe[data-zone="apercu"]').contentWindow.print = () => { window.__imprime = (window.__imprime || 0) + 1; }; });
  const bouton = page.locator('[data-action="imprimer"]');
  await expect(bouton).toHaveText('Imprimer / Enregistrer en PDF');
  await capturer(page, info, '5-imprimer-apercu');
  await bouton.click();
  expect(await page.evaluate(() => window.__imprime)).toBe(1);
});

test.describe('5 impression avec Safari (onglet à part)', () => {
  test.use({ userAgent: SAFARI });
  test('5 Safari : un clic ouvre un onglet qui contient le numéro et le total du devis, puis lance l’impression', { tag: '@sans-telephone' }, async ({ page, context }) => {
    await context.addInitScript(() => { window.print = () => { window.__imprime = (window.__imprime || 0) + 1; }; });
    await semer();
    const id = await devis('d5s', [{ id: 's1', titre: 'Cuisine', lignes: [ligne('l1', 'Pose', 2, 100, { prixVente: 100, tauxTva: 20 })] }], { statut: 'en_attente_envoi', numero: 'DEV-2026-10-24-002', finaliseLe: new Date() });
    await ouvrir(page, id);
    const [onglet] = await Promise.all([context.waitForEvent('page'), page.locator('[data-action="imprimer"]').click()]);
    await onglet.waitForLoadState();
    await expect(onglet.locator('body')).toContainText('DEV-2026-10-24-002');
    await expect(onglet.locator('body')).toContainText('240,00');
    await expect.poll(() => onglet.evaluate(() => window.__imprime)).toBe(1);
  });
  test('5 cas d’erreur : si le navigateur bloque la fenêtre, un message clair le dit', { tag: '@sans-telephone' }, async ({ page }) => {
    await semer();
    const id = await devis('d5b', [{ id: 's1', titre: 'Cuisine', lignes: [ligne('l1', 'Pose', 2, 100, { prixVente: 100, tauxTva: 20 })] }], { statut: 'en_attente_envoi', numero: 'DEV-2026-10-24-003', finaliseLe: new Date() });
    await ouvrir(page, id);
    await page.evaluate(() => { window.open = () => null; });
    await page.locator('[data-action="imprimer"]').click();
    await expect(page.locator('.toast').last()).toContainText('Autorise les fenêtres pour ce site, puis réessaie.');
  });
  test('5 la fiche du devis (Voir) imprime aussi un devis qui n’a pas de PDF du serveur', { tag: '@sans-telephone' }, async ({ page, context }) => {
    await context.addInitScript(() => { window.print = () => { window.__imprime = (window.__imprime || 0) + 1; }; });
    await semer();
    await devis('d5f', [{ id: 's1', titre: 'Cuisine', lignes: [ligne('l1', 'Pose', 2, 100, { prixVente: 100, tauxTva: 20 })] }], { statut: 'en_attente_envoi', numero: 'DEV-2026-10-24-004', finaliseLe: new Date() });
    await connecter(page, undefined, { route: 'devis/liste/d5f' });
    await page.locator('[data-action="voir-fiche"]').click();
    const [onglet] = await Promise.all([context.waitForEvent('page'), page.getByRole('menuitem', { name: 'Imprimer / Enregistrer en PDF' }).click()]);
    await onglet.waitForLoadState();
    await expect(onglet.locator('body')).toContainText('DEV-2026-10-24-004');
    await expect.poll(() => onglet.evaluate(() => window.__imprime)).toBe(1);
  });
});

test('5 le menu « Finaliser » : Finaliser marche, « et imprimer » finalise puis imprime, « et télécharger » et « et envoyer par e-mail » sont grisés « bientôt disponible »', { annotation: { type: 'erreurs-reseau-attendues', description: 'le faux serveur répond comme le vrai' } }, async ({ page }, info) => {
  await semer();
  const id = await devis('d5c', [{ id: 's1', titre: 'Cuisine', lignes: [ligne('l1', 'Pose', 2, 100)] }]);
  const appels = [];
  await page.route('**/devisFinaliser', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    appels.push(JSON.parse(route.request().postData()).data);
    const actuel = await lireDocument(`devis_devis/${id}`);
    await ecrireDocument(`devis_devis/${id}`, { ...actuel, statut: 'en_attente_envoi', numero: 'DEV-2026-10-24-005', finaliseLe: new Date() });
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ok: true, devisId: id, statut: 'en_attente_envoi', numero: 'DEV-2026-10-24-005', nouveauNumero: true } }) });
  });
  // La boîte d'impression du système ne s'ouvre pas : print() est remplacé (dans la page et dans l'aperçu) par un compteur.
  await page.addInitScript(() => {
    window.__imprime = 0;
    new MutationObserver(() => {
      document.querySelectorAll('iframe[data-zone="apercu"]').forEach((f) => {
        if (f.__stub) return;
        f.__stub = true;
        f.addEventListener('load', () => { f.contentWindow.print = () => { window.__imprime += 1; }; });
      });
    }).observe(document, { childList: true, subtree: true });
  });
  await ouvrir(page, id);
  await page.locator('[data-action="envoyer"]').click();
  const menu = page.locator('.menu-pop');
  await expect(menu.getByRole('menuitem')).toHaveText([/Envoyer par e-mail/, /Télécharger/, 'Imprimer']);
  for (const nom of ['Envoyer par e-mail', 'Télécharger']) {
    await expect(menu.getByRole('menuitem', { name: nom })).toBeDisabled();
    await expect(menu.getByRole('menuitem', { name: nom })).toContainText('bientôt disponible');
  }
  await capturer(page, info, '5-menu-finaliser');
  await menu.getByRole('menuitem', { name: 'Imprimer' }).click();
  await dialogue(page).getByRole('button', { name: 'Finaliser' }).click();
  await expect(page.locator('.toast').first()).toContainText('Devis finalisé');
  expect(appels).toEqual([{ devisId: id }]);
  await expect(page.getByRole('heading', { level: 1 })).toContainText('DEV-2026-10-24-005');
  await expect(page.locator('iframe[data-zone="apercu"]').contentFrame().locator('body')).toContainText('DEV-2026-10-24-005');
  // « Finaliser et imprimer » a lancé l'impression de l'aperçu (une seule fois).
  await expect.poll(() => page.evaluate(() => window.__imprime)).toBe(1);
});

test('7 téléphone : les menus s’ouvrent en feuille collée en bas de l’écran et la Bibliothèque couvre l’écran avec un bouton retour', async ({ page }, info) => {
  test.skip(!estTelephone(page), 'ce scénario ne concerne que le format téléphone');
  await semer();
  await ouvrir(page, await devis('d7', [{ id: 's1', titre: 'Cuisine', lignes: [ligne('l1', 'Carrelage', 2, 50)] }]));
  await page.locator('tr[data-id="l1"] [data-action="menu-ligne"]').click();
  const hauteur = page.viewportSize().height;
  let boite = await page.locator('.menu-devis-ligne').boundingBox();
  expect(Math.round(boite.y + boite.height)).toBeGreaterThanOrEqual(hauteur - 2); // collée au bas de l'écran
  expect(boite.x).toBeLessThanOrEqual(1);
  expect(Math.round(boite.width)).toBeGreaterThanOrEqual(page.viewportSize().width - 2);
  await page.keyboard.press('Escape');
  await page.locator('[data-action="bibliotheque"]').click();
  boite = await page.locator('[data-zone="bibliotheque"]').boundingBox();
  expect(Math.round(boite.width)).toBeGreaterThanOrEqual(page.viewportSize().width - 2);
  expect(Math.round(boite.height)).toBeGreaterThanOrEqual(hauteur - 2);
  await expect(page.locator('[data-action="retour-bibliotheque"]')).toBeVisible();
  await capturer(page, info, '7-bibliotheque-plein-ecran');
  await page.locator('[data-action="retour-bibliotheque"]').click();
  await expect(page.locator('[data-zone="bibliotheque"]')).toHaveCount(0);
  expect((await listerDocuments('devis_devis')).length).toBe(1);
});

test('2 le bouton « Catalogue » d’une ligne libre ouvre la Bibliothèque et l’article choisi prend la place de cette ligne', async ({ page }) => {
  await semer();
  await ouvrir(page, await devis('d9', [{ id: 's1', titre: 'Cuisine', lignes: [ligne('l1', 'Texte à remplacer', 1, 10), ligne('l2', 'Autre ligne', 1, 20)] }]));
  const bouton = page.locator('tr[data-id="l1"] [data-action="catalogue-ligne"]');
  await page.locator('tr[data-id="l1"]').hover(); // sur ordinateur le bouton n'apparaît qu'au survol de la ligne (il ne gêne pas la désignation)
  await expect(bouton).toBeVisible();
  await bouton.click();
  const panneau = page.locator('[data-zone="bibliotheque"]');
  await expect(panneau).toBeVisible();
  await panneau.locator('input[aria-label="Choisir Carrelage 60 x 60"]').check();
  await panneau.locator('[data-action="ajouter-bibliotheque"]').click();
  await expect(lignes(page)).toHaveCount(2); // remplacée, pas ajoutée
  await expect(page.locator('tr[data-id="l1"] [data-champ="libelle"]')).toHaveValue('Carrelage 60 x 60');
  await expect(page.locator('tr[data-id="l1"] [data-action="catalogue-ligne"]')).toHaveCount(0); // la ligne vient maintenant d'un article
  await expect(page.locator('tr[data-id="l2"] [data-champ="libelle"]')).toHaveValue('Autre ligne');
});

test('2 l’unité d’une ligne venue d’un article est verrouillée (elle se choisit à la création de l’article) ; celle d’une ligne libre se choisit dans la liste', async ({ page }) => {
  await semer();
  await ouvrir(page, await devis('d10', [{ id: 's1', titre: 'Cuisine', lignes: [ligne('l1', 'Colle à carrelage', 1, 10, { articleId: 'a1' }), ligne('l2', 'Ligne libre', 1, 20)] }]));
  await expect(page.locator('tr[data-id="l1"] select[data-champ="unite"]')).toBeDisabled();
  await expect(page.locator('tr[data-id="l1"] select[data-champ="unite"]')).toHaveValue('u');
  await expect(page.locator('tr[data-id="l2"] select[data-champ="unite"]')).toBeEnabled();
});

test('5 la croix en haut à droite ferme le devis (retour à la liste) ; « Finaliser » n’existe plus, remplacé par « Envoyer »', async ({ page }) => {
  await semer();
  await ouvrir(page, await devis('d11', [{ id: 's1', titre: 'Cuisine', lignes: [ligne('l1', 'Carrelage', 2, 50)] }]));
  await expect(page.locator('[data-action="finaliser"]')).toHaveCount(0);
  await expect(page.locator('[data-action="envoyer"]')).toContainText('Envoyer');
  await page.locator('[data-action="fermer"]').click();
  await expect(page).toHaveURL(/#\/devis\/liste/);
});
