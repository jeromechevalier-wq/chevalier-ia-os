// Module Devis, éditeur : bloc « Conditions de paiement » à plusieurs acomptes (liste, crayon, croix, « Reste à facturer », menu « Ajouter une condition »).
// Un test par point (le nom commence par le numéro), une capture par état : tests/e2e/captures/devis-paiement/ (ordinateur ET téléphone : la mise en page change).
// Devis de ces tests : une ligne à 1 000,00 € HT, TVA 20 % → Total TTC 1 200,00 €.
//  1 cas vide : « Aucun acompte », pas de « Reste à facturer », plus de « Acompte demandé » dans les totaux ;
//  2 le menu « Ajouter une condition » : « Acompte » et « Retenue de garantie » (grisée « bientôt disponible »), pas de prime ;
//  3 ajouter deux acomptes de types différents (% et € HT) : montants TTC, reste à facturer, base de données (acomptes, acompte à null), Enregistrer grisé puis jaune ;
//  4 crayon (modifier) et croix (fenêtre de confirmation, « Retiré · Annuler ») ;
//  5 erreurs : somme au-dessus du TTC, valeur ≤ 0, % > 100, moment libre sans texte → message sous le champ, rien d'enregistré ;
//  6 la Prévisualisation (même document que le PDF) : une phrase par acompte, puis « Reste à facturer » ;
//  7 un devis à l'ancien acompte unique s'affiche comme une ligne, s'imprime comme avant, devient `acomptes` à la première modification (la base n'est pas écrite avant) ;
//  8 devis finalisé : la liste et le reste se voient, tout est grisé et un clic dit que le devis ne se modifie plus ;
//  9 Annuler, Échap et Entrée ; 10 pas de débordement, champs de 16 px, cibles de 44 px, pas de clavier qui s'ouvre tout seul sur téléphone ;
// 11 « Cacher le reste à facturer » (menu Options) masque la ligne sans toucher aux acomptes.
import { fileURLToPath } from 'node:url';
import {
  test, expect, connecter, attendreCalme, ecrireDocument, lireDocument, creerOrganisation, creerAffaire, estTelephone, JEROME,
} from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-paiement/', import.meta.url));
async function capturer(page, info, nom) {
  // Formulaire ouvert : au centre de l'écran (ni la barre du haut ni la barre « NET À PAYER » collée en bas ne le cachent) ; sinon le bloc en haut.
  await page.evaluate(() => { const f = document.querySelector('[data-zone="acompte-formulaire"]'); if (f) f.scrollIntoView({ block: 'center' }); else document.querySelector('[data-zone="paiement"]').scrollIntoView({ block: 'start' }); });
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
}
const bloc = (page) => page.locator('[data-zone="paiement"]');
const total = (page, cle) => page.locator(`[data-total="${cle}"]`);
const champ = (page, cle) => bloc(page).locator(`[data-champ="acompte-${cle}"]`);
const enregistrer = (page) => bloc(page).locator('[data-action="enregistrer-acompte"]');
const erreur = (page) => bloc(page).locator('[data-erreur="acompte"]');
const ligneAcompte = (page, i) => bloc(page).locator(`[data-acompte-ligne="${i}"]`);
const formulaire = (page) => bloc(page).locator('[data-zone="acompte-formulaire"]');

async function devis(id, extra = {}) {
  await creerOrganisation('o1', { nom: 'Société Exemple', emails: [{ valeur: 'contact@exemple.fr', type: 'travail' }] });
  await creerAffaire('a1', { titre: 'Rénovation restaurant', organisationId: 'o1' });
  const maintenant = new Date();
  await ecrireDocument(`devis_devis/${id}`, {
    racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', organisationId: 'o1', personneId: null, modeMarge: 'majoration', marge: 0, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, expireLe: '2026-11-23', destinataires: ['contact@exemple.fr'], objet: 'Rénovation restaurant',
    sections: [{ id: 's1', titre: 'Salle', lignes: [{ id: 'l1', libelle: 'Dépose', quantite: 10, unite: 'm²', prixAchat: 100, marge: 0 }] }],
    notesBasDePage: '', creePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, ...extra,
  });
  return id;
}
async function ouvrir(page, id) {
  await connecter(page, undefined, { route: `devis/editeur/${id}` });
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
}
const sauve = (page) => expect(page.locator('[data-valeur="enregistrement"]')).toHaveText('Enregistré');
const ouvrirMenu = (page) => bloc(page).locator('[data-action="ajouter-condition"]').click();
async function ajouter(page, { valeur, type, moment, texte }) {
  await ouvrirMenu(page);
  await page.getByRole('menuitem', { name: 'Acompte', exact: true }).click();
  await champ(page, 'type').selectOption(type);
  await champ(page, 'valeur').fill(valeur);
  if (moment) await champ(page, 'moment').selectOption(moment);
  if (texte) await champ(page, 'texte').fill(texte);
  await enregistrer(page).click();
}
const A30 = { type: 'pourcentage', valeur: 30, moment: 'signature' };
const A250HT = { type: 'montantHt', valeur: 250, moment: 'debut_travaux' };

test('1 cas vide : « Aucun acompte », pas de ligne « Reste à facturer », plus d’« Acompte demandé » dans les totaux', async ({ page }, info) => {
  await ouvrir(page, await devis('d1'));
  await expect(bloc(page).getByRole('heading', { name: 'Conditions de paiement' })).toBeVisible();
  await expect(bloc(page).locator('[data-vide="acomptes"]')).toHaveText('Aucun acompte');
  await expect(bloc(page).locator('[data-ligne="reste"]')).toBeHidden();
  await expect(bloc(page).locator('[data-action="ajouter-condition"]')).toHaveText('Ajouter une condition');
  await expect(bloc(page).locator('[data-action="ajouter-condition"]')).toBeEnabled();
  await expect(page.locator('[data-zone="total"]')).not.toContainText('Acompte');
  await expect(page.locator('[data-zone="total"]')).not.toContainText('Reste à facturer');
  await expect(page.locator('[data-champ="acompte-type"]')).toHaveCount(0); // aucun formulaire tant qu'on n'a rien demandé : pas de doublon avec les anciens contrôles des totaux
  await expect(total(page, 'ttc')).toHaveText(/^1\s?200,00\s€$/);
  await capturer(page, info, '1-vide');
});

test('2 le menu « Ajouter une condition » : « Acompte » et « Retenue de garantie » (grisée « bientôt disponible »), pas de prime', async ({ page }, info) => {
  await ouvrir(page, await devis('d2'));
  await ouvrirMenu(page);
  const entrees = page.locator('.menu-devis [role="menuitem"]');
  await expect(entrees).toHaveCount(2);
  await expect(entrees.nth(0)).toHaveText('Acompte');
  await expect(entrees.nth(0)).toBeEnabled();
  await expect(entrees.nth(1)).toContainText('Retenue de garantie');
  await expect(entrees.nth(1)).toContainText('bientôt disponible');
  await expect(entrees.nth(1)).toBeDisabled();
  await expect(page.locator('.menu-devis')).not.toContainText(/prime/i);
  await page.screenshot({ path: `${DOSSIER}2-menu-${info.project.name}.png`, animations: 'disabled' });
  await page.getByRole('menuitem', { name: 'Acompte', exact: true }).click();
  await expect(formulaire(page)).toBeVisible();
  await expect(champ(page, 'type').locator('option')).toHaveText(['%', '€ HT', '€ TTC']);
  await expect(champ(page, 'moment').locator('option')).toHaveText(['à la signature', 'au début des travaux', 'à la moitié des travaux', 'Texte libre']);
  for (const nom of ['Valeur', 'Type', 'Moment']) await expect(bloc(page).getByLabel(nom, { exact: true })).toBeVisible();
  await expect(champ(page, 'texte')).toBeHidden();
  await champ(page, 'moment').selectOption('libre');
  await expect(champ(page, 'texte')).toBeVisible();
  await expect(enregistrer(page)).toBeEnabled(); // le moment a changé : Enregistrer s'allume (puis la validation demandera la valeur)
});

test('3 ajouter deux acomptes de types différents : montants TTC, reste à facturer, base de données ; Enregistrer grisé puis jaune', async ({ page }, info) => {
  await ouvrir(page, await devis('d3'));
  await ouvrirMenu(page);
  await page.getByRole('menuitem', { name: 'Acompte', exact: true }).click();
  await expect(enregistrer(page)).toBeDisabled();
  await expect(enregistrer(page)).not.toHaveClass(/bouton-principal/);
  await expect(bloc(page).locator('[data-action="annuler-acompte"]')).toHaveClass(/bouton-secondaire/);
  await champ(page, 'valeur').fill('30');
  await expect(enregistrer(page)).toBeEnabled();
  await expect(enregistrer(page)).toHaveClass(/bouton-principal/);
  await champ(page, 'valeur').fill('');
  await expect(enregistrer(page)).toBeDisabled(); // revenu à l'état de départ : grisé de nouveau
  await champ(page, 'valeur').fill('30');
  await capturer(page, info, '3-formulaire');
  await enregistrer(page).click();
  await expect(formulaire(page)).toHaveCount(0);
  await expect(ligneAcompte(page, 0).locator('[data-valeur="acompte-texte"]')).toHaveText('30 % du total · à la signature');
  await expect(ligneAcompte(page, 0).locator('[data-valeur="acompte-montant"]')).toHaveText(/^360,00\s€$/);
  await expect(total(page, 'reste')).toHaveText(/^840,00\s€$/);
  await ajouter(page, { valeur: '250', type: 'montantHt', moment: 'debut_travaux' });
  await expect(ligneAcompte(page, 1).locator('[data-valeur="acompte-texte"]')).toHaveText(/^250,00\s€ HT · au début des travaux$/);
  await expect(ligneAcompte(page, 1).locator('[data-valeur="acompte-montant"]')).toHaveText(/^300,00\s€$/); // 250 HT × (1 200 TTC / 1 000 HT)
  await expect(total(page, 'reste')).toHaveText(/^540,00\s€$/);
  await expect(bloc(page).locator('[data-ligne="reste"]')).toBeVisible();
  await expect(bloc(page).locator('[data-vide="acomptes"]')).toHaveCount(0);
  await expect(total(page, 'ttc')).toHaveText(/^1\s?200,00\s€$/); // un acompte ne change pas le total
  await sauve(page);
  const doc = await lireDocument('devis_devis/d3');
  expect(doc.acomptes).toEqual([A30, A250HT]);
  expect(doc.acompte).toBeNull(); // null, jamais absent : l'ancien champ est vidé
  await capturer(page, info, '3-liste');
});

test('4 le crayon modifie un acompte, la croix demande confirmation puis propose « Annuler » pendant 8 secondes', async ({ page }, info) => {
  await ouvrir(page, await devis('d4', { acomptes: [A30, A250HT], acompte: null }));
  await expect(bloc(page).locator('.acompte-ligne')).toHaveCount(2);
  // Crayon : le formulaire reprend les valeurs.
  await ligneAcompte(page, 0).locator('[data-action="modifier-acompte"]').click();
  await expect(champ(page, 'valeur')).toHaveValue('30');
  await expect(champ(page, 'type')).toHaveValue('pourcentage');
  await expect(champ(page, 'moment')).toHaveValue('signature');
  await expect(enregistrer(page)).toBeDisabled();
  await champ(page, 'valeur').fill('25');
  await enregistrer(page).click();
  await expect(ligneAcompte(page, 0).locator('[data-valeur="acompte-montant"]')).toHaveText(/^300,00\s€$/);
  await expect(total(page, 'reste')).toHaveText(/^600,00\s€$/);
  await sauve(page);
  expect((await lireDocument('devis_devis/d4')).acomptes[0].valeur).toBe(25);
  // Croix : fenêtre de confirmation (Annuler la garde), puis « Retiré · Annuler ».
  await ligneAcompte(page, 1).locator('[data-action="retirer-acompte"]').click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await capturer(page, info, '4-confirmation');
  await page.getByRole('dialog').getByRole('button', { name: 'Annuler' }).click();
  await expect(bloc(page).locator('.acompte-ligne')).toHaveCount(2); // refusé : rien n'a changé
  await ligneAcompte(page, 1).locator('[data-action="retirer-acompte"]').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Retirer' }).click();
  await expect(bloc(page).locator('.acompte-ligne')).toHaveCount(1);
  await expect(total(page, 'reste')).toHaveText(/^900,00\s€$/);
  const annuler = page.locator('.toast [data-action="toast-action"]');
  await expect(annuler).toHaveText('Annuler');
  await annuler.click();
  await expect(bloc(page).locator('.acompte-ligne')).toHaveCount(2); // remis exactement comme avant
  await expect(ligneAcompte(page, 1).locator('[data-valeur="acompte-montant"]')).toHaveText(/^300,00\s€$/);
  await sauve(page);
  expect((await lireDocument('devis_devis/d4')).acomptes).toEqual([{ ...A30, valeur: 25 }, A250HT]);
  // Retirer le dernier acompte restant ramène au cas vide.
  await ligneAcompte(page, 0).locator('[data-action="retirer-acompte"]').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Retirer' }).click();
  await ligneAcompte(page, 0).locator('[data-action="retirer-acompte"]').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Retirer' }).click();
  await expect(bloc(page).locator('[data-vide="acomptes"]')).toHaveText('Aucun acompte');
  await expect(bloc(page).locator('[data-ligne="reste"]')).toBeHidden();
  await sauve(page);
  expect((await lireDocument('devis_devis/d4')).acomptes).toEqual([]);
});

test('5 erreurs : somme au-dessus du TTC, valeur ≤ 0 ou illisible, % > 100, moment libre sans texte → message sous le champ, rien n’est enregistré', async ({ page }, info) => {
  await ouvrir(page, await devis('d5', { acomptes: [A30], acompte: null }));
  const essayer = async (valeur, type, extra = async () => {}) => {
    await ouvrirMenu(page);
    await page.getByRole('menuitem', { name: 'Acompte', exact: true }).click();
    await champ(page, 'type').selectOption(type);
    await champ(page, 'valeur').fill(valeur);
    await extra();
    await enregistrer(page).click();
  };
  // Somme au-dessus du TTC : 360 + 900 = 1 260 > 1 200.
  await essayer('900', 'montantTtc');
  await expect(erreur(page)).toContainText('La somme des acomptes dépasse le total TTC du devis');
  await expect(champ(page, 'valeur')).toHaveClass(/invalide/);
  await expect(champ(page, 'valeur')).toHaveAttribute('aria-invalid', 'true');
  await expect(champ(page, 'valeur')).toHaveAttribute('aria-describedby', /acompte-nouveau-erreur/);
  await capturer(page, info, '5-erreur-somme');
  await expect(formulaire(page)).toBeVisible(); // le formulaire reste ouvert
  await champ(page, 'valeur').fill('2000');
  await enregistrer(page).click();
  await expect(erreur(page)).toContainText('ne peut pas dépasser le total TTC');
  await champ(page, 'type').selectOption('pourcentage');
  await champ(page, 'valeur').fill('80');
  await enregistrer(page).click();
  await expect(erreur(page)).toContainText('La somme des acomptes dépasse 100 %');
  await champ(page, 'valeur').fill('101');
  await enregistrer(page).click();
  await expect(erreur(page)).toContainText('au plus 100');
  for (const mauvaise of ['0', '-5', 'douze', '']) {
    await champ(page, 'valeur').fill(mauvaise);
    await champ(page, 'moment').selectOption('mi_travaux'); // la saisie a changé : Enregistrer est allumé
    await champ(page, 'moment').selectOption('debut_travaux');
    await enregistrer(page).click();
    await expect(erreur(page)).toBeVisible();
  }
  await expect(erreur(page)).toContainText('doit être un nombre'); // le champ vide
  await champ(page, 'valeur').fill('10');
  await champ(page, 'moment').selectOption('libre');
  await enregistrer(page).click();
  await expect(erreur(page)).toContainText('Écris le moment de l\'acompte');
  await expect(champ(page, 'texte')).toHaveAttribute('aria-describedby', /acompte-nouveau-erreur/);
  await capturer(page, info, '5-erreur-moment-libre');
  await page.waitForTimeout(1200); // plus que le délai d'enregistrement automatique
  expect((await lireDocument('devis_devis/d5')).acomptes).toEqual([A30]); // rien n'a été enregistré
  await expect(bloc(page).locator('.acompte-ligne:not(.acompte-ligne-edition)')).toHaveCount(1);
  // Corriger puis enregistrer marche : 10 % en texte libre.
  await champ(page, 'texte').fill('à la livraison du bois');
  await enregistrer(page).click();
  await expect(formulaire(page)).toHaveCount(0);
  await expect(ligneAcompte(page, 1).locator('[data-valeur="acompte-texte"]')).toHaveText('10 % du total · à la livraison du bois');
  // Modifier le premier acompte pour que la somme dépasse le TTC : l'erreur apparaît sous CE formulaire.
  await ligneAcompte(page, 0).locator('[data-action="modifier-acompte"]').click();
  await champ(page, 'type').selectOption('montantTtc');
  await champ(page, 'valeur').fill('1150');
  await enregistrer(page).click();
  await expect(erreur(page)).toContainText('La somme des acomptes dépasse le total TTC');
});

test('5 bis un acompte enregistré qui ne tient plus dans le TTC (remise ajoutée) a son message sous sa ligne', async ({ page }) => {
  await ouvrir(page, await devis('d5b', { acomptes: [{ type: 'montantTtc', valeur: 900, moment: 'signature' }], acompte: null }));
  await expect(ligneAcompte(page, 0).locator('[data-erreur="acompte-ligne"]')).toBeHidden();
  await page.locator('[data-champ="remise-valeur"]').fill('50'); // TTC 600 : 900 ne tient plus
  const m = ligneAcompte(page, 0).locator('[data-erreur="acompte-ligne"]');
  await expect(m).toBeVisible();
  await expect(m).toContainText('dépasser le total TTC');
  await expect(ligneAcompte(page, 0).locator('[data-valeur="acompte-montant"]')).toHaveText('—');
  await page.locator('[data-champ="remise-valeur"]').fill('');
  await expect(m).toBeHidden();
});

test('4 bis « Retiré · Annuler » ne remet que l’acompte retiré : celui ajouté pendant les 8 secondes reste', async ({ page }) => {
  await ouvrir(page, await devis('d4b', { acomptes: [A30, A250HT], acompte: null }));
  await ligneAcompte(page, 0).locator('[data-action="retirer-acompte"]').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Retirer' }).click();
  await expect(bloc(page).locator('.acompte-ligne')).toHaveCount(1);
  await ajouter(page, { valeur: '10', type: 'pourcentage', moment: 'mi_travaux' });
  await expect(bloc(page).locator('.acompte-ligne')).toHaveCount(2);
  await page.locator('.toast [data-action="toast-action"]').click();
  await expect(bloc(page).locator('.acompte-ligne')).toHaveCount(3);
  await expect(ligneAcompte(page, 0).locator('[data-valeur="acompte-texte"]')).toHaveText('30 % du total · à la signature'); // remis à sa place
  await expect(ligneAcompte(page, 2).locator('[data-valeur="acompte-texte"]')).toContainText('10 % du total');
});

test('6 la Prévisualisation (même document que le PDF) : une phrase par acompte, puis « Reste à facturer »', async ({ page }, info) => {
  await ouvrir(page, await devis('d6', { acomptes: [A30, A250HT, { type: 'montantTtc', valeur: 100, moment: 'libre', texteMoment: 'à la livraison' }], acompte: null }));
  await page.locator('.barre-devis [data-onglet="apercu"]').click();
  const apercu = page.frameLocator('iframe[data-zone="apercu"]');
  const texte = await apercu.locator('body').innerText();
  const plat = texte.replace(/\s+/g, ' ');
  expect(plat).toMatch(/Acompte de 30,00 % à la signature soit 360,00 € TTC/);
  expect(plat).toMatch(/Acompte de 250,00 € HT au début des travaux soit 300,00 € TTC/);
  expect(plat).toMatch(/Acompte de 100,00 € à la livraison/);
  expect(plat).toMatch(/Reste à facturer : 440,00 € TTC/);
  expect(plat.indexOf('Acompte de 30,00')).toBeLessThan(plat.indexOf('Acompte de 250,00'));
  expect(plat.indexOf('Acompte de 250,00')).toBeLessThan(plat.indexOf('Reste à facturer'));
  await page.screenshot({ path: `${DOSSIER}6-apercu-${info.project.name}.png`, animations: 'disabled' });
  // Sans acompte : aucune phrase.
  await page.locator('.barre-devis [data-onglet="edition"]').click();
  for (let i = 0; i < 3; i += 1) {
    await ligneAcompte(page, 0).locator('[data-action="retirer-acompte"]').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Retirer' }).click();
  }
  await expect(bloc(page).locator('[data-vide="acomptes"]')).toBeVisible();
  await page.locator('.barre-devis [data-onglet="apercu"]').click();
  await expect(apercu.locator('body')).toContainText('Rénovation restaurant');
  const vide = (await apercu.locator('body').innerText()).replace(/\s+/g, ' ');
  expect(vide).not.toMatch(/Acompte|Reste à facturer/);
});

test('7 un devis à l’ancien acompte unique : une ligne, imprimé comme avant, la base reste intacte jusqu’à la première modification', async ({ page }, info) => {
  await ouvrir(page, await devis('d7', { acompte: { type: 'montant', valeur: 200, moment: 'debut_travaux' } }));
  await expect(bloc(page).locator('.acompte-ligne')).toHaveCount(1);
  await expect(ligneAcompte(page, 0).locator('[data-valeur="acompte-texte"]')).toHaveText(/^200,00\s€ TTC · au début des travaux$/);
  await expect(ligneAcompte(page, 0).locator('[data-valeur="acompte-montant"]')).toHaveText(/^200,00\s€$/);
  await expect(total(page, 'reste')).toHaveText(/^1\s?000,00\s€$/);
  await capturer(page, info, '7-ancien-acompte');
  await page.waitForTimeout(1200);
  const intact = await lireDocument('devis_devis/d7');
  expect(intact.acompte).toEqual({ type: 'montant', valeur: 200, moment: 'debut_travaux' }); // ouvrir ne réécrit rien
  expect(intact.acomptes).toBeUndefined();
  await expect(page.locator('[data-valeur="enregistrement"]')).toHaveText('Enregistré'); // et l'écran ne se dit pas modifié
  // Un autre document du devis écrit ailleurs (pdf, autre devis) ne déclenche pas de faux « modifié ailleurs » ni d'arrêt de l'enregistrement.
  await ecrireDocument('devis_devis/x7', { ...intact, id: 'x7', racineId: 'x7', objet: 'Un autre devis' });
  await page.waitForTimeout(1500);
  await expect(page.locator('[data-valeur="conflit"]')).toBeHidden();
  await expect(page.locator('[data-valeur="enregistrement"]')).toHaveText('Enregistré');
  await page.locator('.barre-devis [data-onglet="apercu"]').click();
  const plat = (await page.frameLocator('iframe[data-zone="apercu"]').locator('body').innerText()).replace(/\s+/g, ' ');
  expect(plat).toMatch(/Acompte de 200,00 € au début des travaux/); // exactement la phrase d'avant : ni « soit », ni « TTC »
  expect(plat).toMatch(/Reste à facturer : 1\s?000,00 € TTC/);
  await page.locator('.barre-devis [data-onglet="edition"]').click();
  // Première modification : la liste est écrite, l'ancien champ est vidé.
  await ajouter(page, { valeur: '10', type: 'pourcentage', moment: 'mi_travaux' });
  await sauve(page);
  const doc = await lireDocument('devis_devis/d7');
  expect(doc.acomptes).toEqual([{ type: 'montantTtc', valeur: 200, moment: 'debut_travaux' }, { type: 'pourcentage', valeur: 10, moment: 'mi_travaux' }]);
  expect(doc.acompte).toBeNull();
});

test('8 devis finalisé : la liste et le reste se voient, tout est grisé et un clic dit que le devis ne se modifie plus', async ({ page }, info) => {
  await ouvrir(page, await devis('d8', { statut: 'en_attente_envoi', numero: 'DEV-2026-10-02-001', acomptes: [A30, A250HT], acompte: null }));
  await expect(bloc(page).locator('.acompte-ligne')).toHaveCount(2);
  await expect(total(page, 'reste')).toHaveText(/^540,00\s€$/);
  for (const action of ['ajouter-condition']) await expect(bloc(page).locator(`[data-action="${action}"]`)).toHaveAttribute('aria-disabled', 'true');
  for (const action of ['modifier-acompte', 'retirer-acompte']) for (const b of await bloc(page).locator(`[data-action="${action}"]`).all()) await expect(b).toHaveAttribute('aria-disabled', 'true');
  await ligneAcompte(page, 0).locator('[data-action="modifier-acompte"]').click({ force: true });
  await expect(page.getByText(/Ce devis est finalisé : il ne se modifie plus/).first()).toBeVisible();
  await expect(formulaire(page)).toHaveCount(0);
  await bloc(page).locator('[data-action="ajouter-condition"]').click({ force: true });
  await expect(page.locator('.menu-devis')).toHaveCount(0);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await capturer(page, info, '8-finalise');
});

test('9 Annuler et Échap abandonnent la saisie, Entrée enregistre', async ({ page }) => {
  await ouvrir(page, await devis('d9', { acomptes: [A30], acompte: null }));
  await ligneAcompte(page, 0).locator('[data-action="modifier-acompte"]').click();
  await champ(page, 'valeur').fill('99');
  await bloc(page).locator('[data-action="annuler-acompte"]').click();
  await expect(formulaire(page)).toHaveCount(0);
  await expect(ligneAcompte(page, 0).locator('[data-valeur="acompte-texte"]')).toHaveText('30 % du total · à la signature');
  await ligneAcompte(page, 0).locator('[data-action="modifier-acompte"]').click();
  await champ(page, 'valeur').fill('99');
  await champ(page, 'valeur').press('Escape');
  await expect(formulaire(page)).toHaveCount(0);
  await ouvrirMenu(page);
  await page.getByRole('menuitem', { name: 'Acompte', exact: true }).click();
  await champ(page, 'valeur').fill('20');
  await champ(page, 'valeur').press('Enter'); // Entrée enregistre
  await expect(formulaire(page)).toHaveCount(0);
  await expect(ligneAcompte(page, 1).locator('[data-valeur="acompte-montant"]')).toHaveText(/^240,00\s€$/);
  await sauve(page);
  expect((await lireDocument('devis_devis/d9')).acomptes).toEqual([A30, { type: 'pourcentage', valeur: 20, moment: 'signature' }]);
});

test('10 le formulaire tient dans l’écran : pas de défilement horizontal, champs de 16 px au moins, cibles de 44 px sur téléphone, pas de clavier qui s’ouvre tout seul', async ({ page }, info) => {
  await ouvrir(page, await devis('d10', { acomptes: [A30, { type: 'montantHt', valeur: 250, moment: 'libre', texteMoment: 'à la livraison de la dernière palette de carrelage sur le chantier' }], acompte: null }));
  await ligneAcompte(page, 1).locator('[data-action="modifier-acompte"]').click();
  const mesure = await page.evaluate(() => {
    const f = document.querySelector('[data-zone="acompte-formulaire"]');
    const r = f.getBoundingClientRect();
    const champs = [...f.querySelectorAll('input, select')].filter((e) => e.offsetParent !== null).map((e) => ({ h: e.getBoundingClientRect().height, fs: parseFloat(getComputedStyle(e).fontSize) }));
    const boutons = [...f.querySelectorAll('button')].map((e) => e.getBoundingClientRect().height);
    return { debordeHorizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth, droite: r.right, largeur: window.innerWidth, champs, boutons };
  });
  expect(mesure.debordeHorizontal).toBe(false);
  expect(mesure.droite).toBeLessThanOrEqual(mesure.largeur);
  if (estTelephone(page)) {
    for (const c of mesure.champs) { expect(c.h).toBeGreaterThanOrEqual(44); expect(c.fs).toBeGreaterThanOrEqual(16); }
    for (const b of mesure.boutons) expect(b).toBeGreaterThanOrEqual(44);
    await expect(champ(page, 'valeur')).not.toBeFocused(); // téléphone : le clavier ne s'ouvre pas tout seul
  } else await expect(champ(page, 'valeur')).toBeFocused();
  await capturer(page, info, '10-formulaire');
  await bloc(page).locator('[data-action="annuler-acompte"]').click();
  // La liste elle-même (texte long, crayon, croix) tient aussi.
  const liste = await page.evaluate(() => ({
    debordeHorizontal: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    icones: [...document.querySelectorAll('[data-zone="paiement"] .acompte-ligne .bouton-icone')].map((e) => { const r = e.getBoundingClientRect(); return Math.min(r.width, r.height); }),
  }));
  expect(liste.debordeHorizontal).toBe(false);
  if (estTelephone(page)) for (const t of liste.icones) expect(t).toBeGreaterThanOrEqual(44);
  await capturer(page, info, '10-liste');
});

test('11 « Cacher le reste à facturer » (menu Options) masque la ligne du bloc sans toucher aux acomptes', async ({ page }) => {
  await ouvrir(page, await devis('d11', { acomptes: [A30], acompte: null }));
  await expect(bloc(page).locator('[data-ligne="reste"]')).toBeVisible();
  if (estTelephone(page)) {
    await page.locator('[data-action="plus-actions"]').click();
    await page.getByRole('menuitem', { name: 'Options' }).click();
  } else await page.locator('[data-action="options"]').click();
  await page.locator('[data-zone="options"] [data-option="cacherResteAFacturer"]').check();
  await expect(bloc(page).locator('[data-ligne="reste"]')).toBeHidden();
  await expect(ligneAcompte(page, 0)).toBeVisible();
  await sauve(page);
  expect((await lireDocument('devis_devis/d11')).acomptes).toEqual([A30]);
});
