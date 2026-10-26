// Module Devis, éditeur de devis (route devis/editeur). Chez Jérôme (racine). Captures dans tests/e2e/captures/devis-editeur/ (ordinateur ET téléphone : la mise en page change).
// Les fonctions du serveur (devisFinaliser, devisNouvelleVersion) n'existent pas dans l'émulateur du navigateur : elles sont SIMULÉES par page.route, comme dans devis-liste.spec.js.
import { fileURLToPath } from 'node:url';
import {
  test, expect, connecter, attendreCalme, allerA, ecrireDocument, lireDocument, listerDocuments, creerOrganisation, creerAffaire, JEROME, FIRESTORE, PROJET,
} from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-editeur/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: true, animations: 'disabled' });
}
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const dialogue = (page) => page.getByRole('dialog');
const lignes = (page) => page.locator('tr.ligne-devis-edition');

async function article(id, valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument(`devis_articles/${id}`, {
    code: '', libelle: 'Article test', unite: 'u', prixAchat: 10, tauxTva: null, actif: true, proprietaire: JEROME,
    creeLe: maintenant, modifieLe: maintenant, creePar: JEROME, modifiePar: JEROME, ...valeurs,
  });
}
/** Une organisation avec adresse et e-mail, une affaire à son nom, et deux articles du Bordereau (marge des réglages : 20 % en majoration). */
async function semer() {
  await creerOrganisation('o1', {
    nom: 'Société Exemple', adresses: [{ id: 'p1', libelle: 'Principale', adresse: '12 rue des Lilas\n75000 Paris', parDefaut: true }], emails: [{ valeur: 'contact@exemple.fr', type: 'travail' }],
  });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', organisationId: 'o1' });
  await article('a1', { libelle: 'Carrelage 60 x 60', unite: 'm²', prixAchat: 50, type: 'fourniture', code: 'CAR60' }); // vendu 60,00 €
  await article('a2', { libelle: 'Pose du carrelage', unite: 'h', prixAchat: 30, tauxTva: 10, type: 'main_oeuvre' }); // vendu 36,00 €, TVA 10 %
}
async function ouvrirListe(page) {
  await connecter(page, undefined, { route: 'devis/liste' });
  await expect(page.locator('.page-liste-devis')).toBeVisible();
  await attendreCalme(page);
}
/** Crée un brouillon pour l'affaire d'exemple par l'écran et rend son identifiant. */
async function nouveauBrouillon(page) {
  await ouvrirListe(page);
  await page.locator('[data-action="nouveau-devis-vide"]').click();
  await page.locator('[data-champ="affaire"]').selectOption('a1');
  await page.locator('[data-action="creer-brouillon"]').click();
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
  return page.url().split('/').pop();
}
const enregistre = (page) => expect(page.locator('[data-valeur="enregistrement"]')).toHaveText('Enregistré');
const total = (page, cle) => page.locator(`[data-total="${cle}"]`);
/** Ligne libre : « … » sous le tableau, puis « Ligne libre ». */
async function ajouterLibre(page) {
  await page.locator('[data-action="autres-ajouts"]').click();
  await page.getByRole('menuitem', { name: 'Ligne libre' }).click();
}
/** Une valeur du haut du devis (« définir ») s'écrit sur place : on clique le lien, le champ apparaît. */
const definir = (page, nom) => page.locator(`[data-definir="${nom}"]`).click();
/** Le champ « objet » se montre avec « Ajouter une description ». */
async function ouvrirDescription(page) {
  if (await page.locator('[data-champ="objet"]').isHidden()) await page.locator('[data-action="description"]').click();
}
async function chercherEtAjouter(page, mot, quantite) {
  if (await page.locator('[data-zone="recherche"]').isHidden()) { await page.locator('[data-action="ajouter-famille-1"]').click(); await page.locator('[data-champ="filtre-famille"]').selectOption(''); }
  await page.getByRole('searchbox', { name: 'Rechercher dans le catalogue' }).fill(mot);
  await page.locator('[data-action="ajouter-article"]').first().click();
  await page.locator('tr.ligne-devis-edition').last().locator('[data-champ="quantite"]').fill(quantite);
}
const textes = (page) => lignes(page).locator('[data-champ="libelle"]').evaluateAll((els) => els.map((e) => e.value));

test('C1 « + E-mail en copie » : ajouter une adresse (Entrée), refuser une adresse invalide, retirer par la croix ; l’adresse reste après rechargement', async ({ page }, info) => {
  await semer();
  const id = await nouveauBrouillon(page);
  const bloc = page.locator('[data-zone="copie"]');
  await expect(bloc.locator('[data-action="ajouter-copie"]')).toHaveText('E-mail en copie');
  await expect(bloc.locator('.ligne-copie')).toHaveCount(0); // cas vide : seulement le bouton jaune
  await bloc.locator('[data-action="ajouter-copie"]').click();
  await bloc.locator('[data-champ="copie"]').fill('pas-un-email');
  await bloc.locator('[data-champ="copie"]').press('Enter');
  await expect(bloc.locator('[data-erreur="copie"]')).toContainText('Cette adresse email n’est pas valide');
  await bloc.locator('[data-champ="copie"]').fill('Compta@Exemple.fr');
  await bloc.locator('[data-champ="copie"]').press('Enter');
  await expect(bloc.locator('.ligne-copie')).toHaveText(['Compta@Exemple.fr']);
  await bloc.locator('[data-action="ajouter-copie"]').click();
  await bloc.locator('[data-champ="copie"]').fill('compta@exemple.fr'); // déjà présente (sans tenir compte des majuscules) : rien n'est ajouté
  await bloc.locator('[data-champ="copie"]').press('Enter');
  await expect(bloc.locator('.ligne-copie')).toHaveCount(1);
  await capturer(page, info, 'C1-email-en-copie');
  await enregistre(page);
  await page.reload();
  await expect(page.locator('[data-zone="copie"] .ligne-copie')).toHaveText(['Compta@Exemple.fr']);
  await page.locator('[data-zone="copie"] [data-action="retirer-copie"]').click();
  await expect(page.locator('[data-zone="copie"] .ligne-copie')).toHaveCount(0);
});

test('C2 une adresse déjà en copie ne peut pas être le destinataire : message clair, rien d’enregistré, l’adresse enregistrée revient en quittant le champ', async ({ page }, info) => {
  await semer();
  await nouveauBrouillon(page);
  const bloc = page.locator('[data-zone="copie"]');
  await bloc.locator('[data-action="ajouter-copie"]').click();
  await bloc.locator('[data-champ="copie"]').fill('compta@exemple.fr');
  await bloc.locator('[data-champ="copie"]').press('Enter');
  await expect(bloc.locator('.ligne-copie')).toHaveCount(1);
  const destinataire = page.locator('[data-champ="destinataire"]');
  await destinataire.fill('Compta@exemple.fr');
  await expect(page.locator('[data-erreur="destinataire"]')).toContainText('déjà en copie');
  await capturer(page, info, 'C2-doublon-destinataire');
  await destinataire.fill('autre@exemple.fr'); // une autre adresse : le message disparaît
  await expect(page.locator('[data-erreur="destinataire"]')).toBeHidden();
  await destinataire.fill('compta@exemple.fr');
  await destinataire.blur();
  await expect(destinataire).toHaveValue('autre@exemple.fr'); // la dernière adresse valable revient
});

test('C3 devis en lecture seule : la zone « En copie » est la même qu’en édition (adresse lisible, « + E-mail en copie » grisé, croix grisées), avec ou sans adresse en copie', async ({ page }, info) => {
  await semer();
  await ouvrirListe(page);
  const base = {
    racineId: 'x', version: 1, numero: 'DEV-2026-10-02-001', statut: 'envoye', affaireId: 'a1', organisationId: 'o1', personneId: null, modeMarge: 'majoration', marge: 20, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, expireLe: '2027-01-01', destinataires: ['contact@exemple.fr'],
    sections: [{ id: 's1', titre: 'Cuisine', lignes: [{ id: 'l1', libelle: 'Carrelage', quantite: 2, unite: 'm²', prixAchat: 50, prixVente: 60, tauxTva: 20 }] }],
    creePar: JEROME, proprietaire: JEROME, creeLe: new Date(), modifieLe: new Date(),
  };
  await ecrireDocument('devis_devis/sanscopie', { ...base, racineId: 'sanscopie' });
  await ecrireDocument('devis_devis/aveccopie', { ...base, racineId: 'aveccopie', numero: 'DEV-2026-10-02-002', copie: ['compta@exemple.fr'] });
  await page.goto('/?emulateurs=1#/devis/editeur/sanscopie');
  await expect(page.locator('[data-valeur="lecture-seule"]')).toBeVisible();
  await expect(page.locator('[data-zone="copie"]')).toBeVisible();
  await expect(page.locator('[data-zone="copie"] [data-action="ajouter-copie"]')).toHaveAttribute('aria-disabled', 'true');
  await capturer(page, info, 'C3-lecture-seule-sans-copie');
  await page.goto('/?emulateurs=1#/devis/editeur/aveccopie');
  await page.reload(); // un simple changement d'adresse garde l'écran du devis précédent : on repart d'une page neuve
  await expect(page.locator('[data-valeur="lecture-seule"]')).toBeVisible();
  await expect(page.locator('[data-zone="copie"] .ligne-copie')).toHaveText(['compta@exemple.fr']);
  await expect(page.locator('[data-zone="copie"] [data-action="retirer-copie"]')).toHaveAttribute('aria-disabled', 'true');
});

test('C5 la croix d’une adresse en copie retire bien l’adresse même si on est en train d’en saisir une autre', async ({ page }, info) => {
  await semer();
  await nouveauBrouillon(page);
  const bloc = page.locator('[data-zone="copie"]');
  await bloc.locator('[data-action="ajouter-copie"]').click();
  await bloc.locator('[data-champ="copie"]').fill('a@exemple.fr');
  await bloc.locator('[data-champ="copie"]').press('Enter');
  await bloc.locator('[data-action="ajouter-copie"]').click();
  await bloc.locator('[data-champ="copie"]').fill('b@exemple.fr');
  await bloc.locator('[data-champ="copie"]').press('Enter');
  await expect(bloc.locator('.ligne-copie')).toHaveText(['a@exemple.fr', 'b@exemple.fr']);
  await bloc.locator('[data-action="ajouter-copie"]').click();
  await bloc.locator('[data-champ="copie"]').fill('c@exemple.fr'); // saisie en cours, champ actif
  await capturer(page, info, 'C5-croix-pendant-saisie');
  await bloc.locator('[data-action="retirer-copie"]').first().click(); // un vrai clic : le champ perd le focus, la croix doit répondre quand même
  await expect(bloc.locator('.ligne-copie')).toHaveText(['b@exemple.fr']); // a est retirée
  await expect(bloc.locator('[data-champ="copie"]')).toHaveValue('c@exemple.fr'); // la saisie en cours n'est pas perdue
  await bloc.locator('[data-champ="copie"]').press('Enter');
  await expect(bloc.locator('.ligne-copie')).toHaveText(['b@exemple.fr', 'c@exemple.fr']);
});

test('C6 la visualisation d’un devis finalisé n’a plus de boutons « Créer une variante » ni « Dupliquer » : ils sont dans le « … » (44 px) à côté d’« Envoyer »', async ({ page }, info) => {
  await semer();
  await ouvrirListe(page);
  await ecrireDocument('devis_devis/fige', {
    racineId: 'fige', version: 1, numero: 'DEV-2026-10-02-001', statut: 'envoye', affaireId: 'a1', organisationId: 'o1', personneId: null, modeMarge: 'majoration', marge: 20, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, expireLe: '2027-01-01', destinataires: ['contact@exemple.fr'],
    sections: [{ id: 's1', titre: 'Cuisine', lignes: [{ id: 'l1', libelle: 'Carrelage', quantite: 2, unite: 'm²', prixAchat: 50, prixVente: 60, tauxTva: 20 }] }],
    creePar: JEROME, proprietaire: JEROME, creeLe: new Date(), modifieLe: new Date(),
  });
  await page.goto('/?emulateurs=1#/devis/voir/fige'); // l'écran unique, sur la Prévisualisation
  await expect(page.locator('.page-editeur-devis.devis-lecture-seule')).toBeVisible();
  await expect(page.locator('[data-action="creer-variante"]')).toHaveCount(0);
  await expect(page.locator('[data-action="dupliquer"]')).toHaveCount(0);
  const plus = page.locator('[data-action="plus-actions"]');
  await expect(plus).toBeVisible();
  const boite = await plus.boundingBox();
  expect(boite.width).toBeGreaterThanOrEqual(44);
  expect(boite.height).toBeGreaterThanOrEqual(44);
  await plus.click();
  await expect(page.getByRole('menuitem', { name: 'Créer une nouvelle version' })).toBeEnabled();
  await expect(page.getByRole('menuitem', { name: 'Dupliquer' })).toBeEnabled();
  await capturer(page, info, 'C6-menu-autres-actions');
  await page.keyboard.press('Escape');
});

test('ED1 créer un devis pour une affaire, ajouter deux articles du Bordereau, une ligne libre et une section, une remise : le total se calcule en direct et reste après rechargement', { tag: '@smoke' }, async ({ page }, info) => {
  await semer();
  const id = await nouveauBrouillon(page);
  // Cas vide : aucune ligne, invitation claire ; le numéro n'est pas encore attribué ; le client et son adresse viennent de l'affaire.
  await expect(page.locator('[data-vide="lignes"]')).toContainText('Clique sur un des boutons ci-dessous pour ajouter un élément à ton devis.');
  await expect(page.locator('[data-valeur="numero-devis"]')).toContainText('Brouillon'); // le numéro DEV-… n'est attribué qu'à la finalisation
  await expect(page.locator('[data-champ="affaire"]')).toHaveValue('a1');
  await expect(page.locator('[data-champ="client"]')).toHaveValue('organisation:o1');
  await expect(page.locator('[data-champ="chantier-adresse"]')).toHaveValue('12 rue des Lilas\n75000 Paris');
  await expect(page.locator('[data-champ="destinataire"]')).toHaveValue('contact@exemple.fr');
  await expect(page.locator('[data-avertissement="aucuneLigne"]')).toContainText('aucune ligne');
  await capturer(page, info, 'ED1-cas-vide');
  // Dates du chantier.
  await definir(page, 'debutTravaux');
  await page.locator('[data-champ="debutTravaux"]').fill('2026-11-02');
  await definir(page, 'duree');
  await page.locator('[data-champ="duree"]').fill('3');
  await page.locator('[data-champ="duree-unite"]').selectOption('semaine');
  await definir(page, 'finChantierAu');
  await page.locator('[data-champ="finChantierAu"]').fill('2026-11-27');
  await ouvrirDescription(page);
  await page.locator('[data-champ="objet"]').fill('Rénovation de la cuisine');
  // Section, puis deux articles du Bordereau (recherche par libellé et par code), puis une ligne libre.
  await page.locator('[data-action="ajouter-section"]').click();
  await page.locator('tr.ligne-section-devis [data-champ="libelle"]').fill('Cuisine');
  await chercherEtAjouter(page, 'Carrelage', '10');
  await chercherEtAjouter(page, 'Pose', '5');
  await page.getByRole('searchbox', { name: 'Rechercher dans le catalogue' }).fill('CAR60');
  await expect(page.locator('[data-action="ajouter-article"]')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Rechercher dans le catalogue' }).fill('zzz');
  await expect(page.locator('[data-vide="resultats"]')).toContainText('Aucun article ne correspond');
  await ajouterLibre(page);
  const libre = lignes(page).last();
  await libre.locator('[data-champ="libelle"]').fill('Forfait déplacement');
  await libre.locator('[data-champ="prix-vente"]').fill('100');
  await libre.locator('[data-champ="prix-vente"]').press('Tab');
  await expect(lignes(page)).toHaveCount(3);
  // Totaux de ligne : 10 × 60 = 600 ; 5 × 36 = 180 ; 1 × 100 = 100.
  await expect(lignes(page).nth(0).locator('[data-champ="prix-vente"]')).toHaveValue('60,00');
  await expect(lignes(page).nth(0).locator('.total-ligne')).toHaveText(/^600,00\s€$/);
  await expect(lignes(page).nth(1).locator('[data-champ="prix-vente"]')).toHaveValue('36,00');
  await expect(lignes(page).nth(1).locator('.total-ligne')).toHaveText(/^180,00\s€$/);
  await expect(lignes(page).nth(2).locator('.total-ligne')).toHaveText(/^100,00\s€$/);
  await expect(page.locator('[data-sous-total]').first()).toHaveText(/^880,00\s€$/);
  await expect(page.locator('[data-avertissement]')).toHaveCount(0);
  // Remise de 10 % : 880,00 - 88,00 = 792,00 HT ; TVA 126,00 (20 %) + 16,20 (10 %) = 142,20 ; TTC 934,20.
  await page.locator('[data-champ="remise-valeur"]').fill('10');
  await expect(total(page, 'brut')).toHaveText(/^880,00\s€$/);
  await expect(total(page, 'remise')).toHaveText(/88,00\s€$/);
  await expect(total(page, 'ht')).toHaveText(/^792,00\s€$/);
  await expect(total(page, 'tva-20')).toHaveText(/^126,00\s€$/);
  await expect(total(page, 'tva-10')).toHaveText(/^16,20\s€$/);
  await expect(total(page, 'ttc')).toHaveText(/^934,20\s€$/);
  await expect(total(page, 'net')).toHaveText(/^934,20\s€$/);
  // Acompte de 30 % à la signature : 280,26 ; reste 653,94.
  await page.locator('[data-champ="acompte-type"]').selectOption('pourcentage');
  await page.locator('[data-champ="acompte-valeur"]').fill('30');
  await expect(total(page, 'acompte')).toHaveText(/^280,26\s€$/);
  await expect(total(page, 'reste')).toHaveText(/^653,94\s€$/);
  await capturer(page, info, 'ED1-devis-rempli');
  // Enregistrement automatique, puis rechargement : tout est là.
  await enregistre(page);
  const stocke = (await listerDocuments('devis_devis')).find((d) => d.id === id);
  expect(stocke.sections).toHaveLength(1);
  expect(stocke.sections[0].lignes.map((l) => l.libelle)).toEqual(['Carrelage 60 x 60', 'Pose du carrelage', 'Forfait déplacement']);
  expect(stocke.remise).toEqual({ type: 'pourcentage', valeur: 10 });
  expect(stocke.chantier.debutTravaux).toBe('2026-11-02');
  expect(stocke.numero).toBeNull();
  await page.reload();
  await expect(page.locator('tr.ligne-devis-edition')).toHaveCount(3);
  await attendreCalme(page);
  await expect(total(page, 'ttc')).toHaveText(/^934,20\s€$/);
  await expect(page.locator('[data-champ="remise-valeur"]')).toHaveValue('10');
  await expect(page.locator('[data-champ="objet"]')).toHaveValue('Rénovation de la cuisine');
  await expect(await textes(page)).toEqual(['Carrelage 60 x 60', 'Pose du carrelage', 'Forfait déplacement']);
});

test('ED2 l’aperçu montre le devis comme le client le verra ; ordre des lignes : flèches, insertion au-dessous, copie, suppression avec « Annuler »', async ({ page }, info) => {
  await semer();
  await nouveauBrouillon(page);
  await chercherEtAjouter(page, 'Carrelage', '2');
  await chercherEtAjouter(page, 'Pose', '3');
  await ajouterLibre(page);
  await lignes(page).last().locator('[data-champ="libelle"]').fill('Divers');
  // Flèches : la ligne 1 descend ; la première ligne n'a pas de flèche « monter » active.
  await expect(lignes(page).nth(0).locator('[data-action="monter"]')).toBeDisabled();
  await lignes(page).nth(0).locator('[data-action="descendre"]').click();
  expect(await textes(page)).toEqual(['Pose du carrelage', 'Carrelage 60 x 60', 'Divers']);
  await expect(lignes(page).last().locator('[data-action="descendre"]')).toBeDisabled();
  // Insérer une ligne libre au-dessous de la première, dupliquer la dernière.
  await lignes(page).nth(0).locator('[data-action="menu-ligne"]').click();
  await page.getByRole('menuitem', { name: 'Insérer en dessous' }).click();
  await page.getByRole('menuitem', { name: 'Texte', exact: true }).click();
  await expect(lignes(page)).toHaveCount(4);
  await lignes(page).nth(3).locator('[data-action="menu-ligne"]').click();
  await page.getByRole('menuitem', { name: 'Dupliquer' }).click();
  await expect(lignes(page)).toHaveCount(5);
  expect(await textes(page)).toEqual(['Pose du carrelage', '', 'Carrelage 60 x 60', 'Divers', 'Divers']);
  // Supprimer la ligne vide : confirmation, puis « Annuler » dans les 8 secondes la remet.
  await lignes(page).nth(1).locator('[data-action="menu-ligne"]').click();
  await page.getByRole('menuitem', { name: 'Supprimer' }).click();
  await dialogue(page).getByRole('button', { name: 'Supprimer' }).click();
  await expect(lignes(page)).toHaveCount(4);
  await page.locator('[data-action="toast-action"]').click();
  await expect(lignes(page)).toHaveCount(5);
  await lignes(page).nth(1).locator('[data-action="menu-ligne"]').click();
  await page.getByRole('menuitem', { name: 'Supprimer' }).click();
  await dialogue(page).getByRole('button', { name: 'Supprimer' }).click();
  await expect(lignes(page)).toHaveCount(4);
  // Aperçu : le même document que le PDF, avec le client et les montants (2 × 60 + 3 × 36 = 228,00 HT).
  await page.locator('[data-onglet="apercu"]').click();
  const apercu = page.locator('iframe[data-zone="apercu"]').contentFrame().locator('body');
  await expect(apercu).toContainText('Société Exemple');
  await expect(apercu).toContainText('Carrelage 60 x 60');
  await expect(apercu).toContainText('228,00');
  await expect(apercu).toContainText('BROUILLON');
  await capturer(page, info, 'ED2-apercu');
  await page.locator('[data-onglet="edition"]').click();
  await expect(lignes(page)).toHaveCount(4);
});

test('ED3 finaliser : les erreurs de finalisation sont listées dans une fenêtre ; le serveur finalise, le devis passe en lecture seule avec « Créer une nouvelle version » dans le « … »', { annotation: { type: 'erreurs-reseau-attendues', description: 'le faux serveur répond comme le vrai' } }, async ({ page }, info) => {
  await semer();
  const id = await nouveauBrouillon(page);
  const appels = [];
  await page.route('**/devisFinaliser', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    appels.push(JSON.parse(route.request().postData()).data);
    const actuel = await lireDocument(`devis_devis/${id}`);
    await ecrireDocument(`devis_devis/${id}`, { ...actuel, statut: 'en_attente_envoi', numero: 'DEV-2026-10-24-001', finaliseLe: new Date() });
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ok: true, devisId: id, statut: 'en_attente_envoi', numero: 'DEV-2026-10-24-001', nouveauNumero: true } }) });
  });
  // Un devis vide : la fenêtre liste ce qu'il faut corriger, rien n'est envoyé au serveur. Pas d'adresse e-mail obligatoire (on peut imprimer et remettre le devis en main propre).
  await page.locator('[data-champ="destinataire"]').fill('');
  await page.locator('[data-action="finaliser"]').click(); // le bouton jaune d'un brouillon (26/10/2026) : « Imprimer » ne finalise plus
  await expect(dialogue(page)).toContainText('Ce devis ne peut pas encore être finalisé');
  await expect(dialogue(page).locator('li')).toHaveText(['Ajoute au moins une ligne au devis avant de le finaliser.']);
  await capturer(page, info, 'ED3-erreurs-finalisation');
  await dialogue(page).getByRole('button', { name: 'Compris' }).click();
  expect(appels).toEqual([]);
  // On corrige : destinataire, une ligne ; un avertissement non bloquant (quantité vide) est dit dans la fenêtre de confirmation.
  await page.locator('[data-champ="destinataire"]').fill('contact@exemple.fr');
  await ajouterLibre(page);
  await lignes(page).last().locator('[data-champ="libelle"]').fill('Forfait');
  await lignes(page).last().locator('[data-champ="prix-vente"]').fill('250');
  await lignes(page).last().locator('[data-champ="prix-vente"]').press('Tab');
  await lignes(page).last().locator('[data-champ="quantite"]').fill('');
  await expect(page.locator('[data-zone="total"] [data-avertissement="sansQuantite"]')).toBeVisible();
  await expect(page.locator('[data-zone="total"] [data-avertissement="totalZero"]')).toBeVisible();
  await lignes(page).last().locator('[data-champ="quantite"]').fill('2');
  await expect(page.locator('[data-avertissement]')).toHaveCount(0);
  await expect(total(page, 'ht')).toHaveText(/^500,00\s€$/);
  await page.locator('[data-action="finaliser"]').click();
  await expect(dialogue(page)).toContainText('Finaliser ce devis ?');
  await dialogue(page).getByRole('button', { name: 'Finaliser' }).click();
  await expect(page.locator('.toast')).toContainText('Devis finalisé');
  expect(appels).toEqual([{ devisId: id }]);
  await expect(page).toHaveURL(new RegExp(`#/devis/voir/${id}$`)); // un devis finalisé se regarde en visualisation
  // Lecture seule : numéro affiché, aperçu, invitation à créer une nouvelle version, « Envoyer » (jaune, e-mail) mais plus de champs.
  await expect(page.locator('[data-valeur="lecture-seule"]')).toContainText('crée une nouvelle version');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('DEV-2026-10-24-001');
  await page.locator('[data-action="plus-actions"]').click();
  await expect(page.getByRole('menuitem', { name: 'Créer une nouvelle version' })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-action="envoyer"]')).toBeVisible();
  await expect(page.locator('[data-champ="libelle"]').first()).toHaveAttribute('readonly', ''); // l'Édition existe encore mais ne se modifie plus
  await expect(page.locator('iframe[data-zone="apercu"]').contentFrame().locator('body')).toContainText('DEV-2026-10-24-001');
  await expect(page.locator('[data-zone="total"]')).toBeHidden(); // sur la Prévisualisation seul le document est vu : le total est dans l'aperçu, pas dans un cadre à part
  await expect(page.locator('iframe[data-zone="apercu"]').contentFrame().locator('body')).toContainText('600,00');
  await capturer(page, info, 'ED3-lecture-seule');
});

test('ED4 cas d’erreur : devis introuvable, devis déjà finalisé en lecture seule, écriture refusée dite en clair, quitter avec des changements (Rester, puis Enregistrer et quitter)', { annotation: { type: 'erreurs-reseau-attendues', description: 'une écriture sur un devis disparu est refusée, comme en vrai' } }, async ({ page }, info) => {
  await semer();
  await ouvrirListe(page);
  // Devis introuvable.
  await page.goto('/?emulateurs=1#/devis/editeur/inconnu');
  await expect(page.locator('.page-editeur-devis[data-etat="introuvable"]')).toContainText('Ce devis est introuvable');
  await expect(page.locator('[data-action="retour-liste"]')).toBeVisible();
  await capturer(page, info, 'ED4-introuvable');
  // Devis envoyé : lecture seule.
  await ecrireDocument('devis_devis/fige', {
    racineId: 'fige', version: 1, numero: 'DEV-2026-10-02-001', statut: 'envoye', affaireId: 'a1', organisationId: 'o1', personneId: null, modeMarge: 'majoration', marge: 20, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, expireLe: '2027-01-01', destinataires: ['contact@exemple.fr'],
    sections: [{ id: 's1', titre: 'Cuisine', lignes: [{ id: 'l1', libelle: 'Carrelage', quantite: 2, unite: 'm²', prixAchat: 50, prixVente: 60, tauxTva: 20 }] }],
    creePar: JEROME, proprietaire: JEROME, creeLe: new Date(), modifieLe: new Date(),
  });
  await page.goto('/?emulateurs=1#/devis/editeur/fige');
  await expect(page).toHaveURL(/#\/devis\/editeur\/fige$/);
  await expect(page.locator('[data-valeur="lecture-seule"]')).toBeVisible();
  await expect(page.locator('[data-action="plus-actions"]')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('DEV-2026-10-02-001');
  // Un brouillon dont l'écriture est refusée (document disparu) : le message le dit et l'indicateur passe en erreur.
  await ecrireDocument('devis_devis/brouillon', {
    racineId: 'brouillon', version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', organisationId: 'o1', personneId: null, modeMarge: 'majoration', marge: 20, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, expireLe: '2027-01-01', destinataires: [], sections: [], creePar: JEROME, proprietaire: JEROME, creeLe: new Date(), modifieLe: new Date(),
  });
  await page.goto('/?emulateurs=1#/devis/editeur/brouillon');
  await expect(page.locator('[data-action="description"]')).toBeVisible();
  await ouvrirDescription(page);
  await expect(page.locator('[data-champ="objet"]')).toBeVisible();
  await attendreCalme(page);
  await fetch(`${FIRESTORE}/v1/projects/${PROJET}/databases/(default)/documents/devis_devis/brouillon`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
  await page.locator('[data-champ="objet"]').fill('Cuisine');
  await expect(page.locator('[data-valeur="enregistrement"]')).toHaveText('Échec de l’enregistrement');
  await expect(page.locator('[data-erreur="enregistrement"]')).toContainText(/Devis introuvable|Enregistrement impossible/);
  await expect(page.locator('[data-action="reessayer-enregistrement"]')).toBeVisible(); // le lien « Réessayer » prend la place du bouton Enregistrer
  await capturer(page, info, 'ED4-ecriture-refusee');
  // Quitter avec un changement non enregistré : « Rester » garde la page et le texte ; « Enregistrer et quitter » (écriture refusée) reste sur le devis.
  await page.evaluate(() => { location.hash = '#/devis/liste'; });
  await expect(dialogue(page)).toContainText('Quitter sans enregistrer ?');
  for (const nom of ['Rester', 'Quitter', 'Enregistrer et quitter']) await expect(dialogue(page).getByRole('button', { name: nom, exact: true })).toBeVisible();
  await capturer(page, info, 'ED4-quitter');
  await dialogue(page).getByRole('button', { name: 'Rester' }).click();
  await expect(page.locator('[data-champ="objet"]')).toHaveValue('Cuisine');
  await page.evaluate(() => { location.hash = '#/devis/liste'; });
  await dialogue(page).getByRole('button', { name: 'Enregistrer et quitter' }).click();
  await expect(page.locator('.toast').last()).toContainText('L’enregistrement a échoué');
  await expect(page.locator('[data-champ="objet"]')).toBeVisible();
  // « Quitter » sans enregistrer : on arrive sur la liste.
  await page.evaluate(() => { location.hash = '#/devis/liste'; });
  await dialogue(page).getByRole('button', { name: 'Quitter', exact: true }).click();
  await expect(page.locator('.page-liste-devis')).toBeVisible();
});

test('ED5 enregistrer et quitter : le changement tapé juste avant de quitter est écrit', async ({ page }) => {
  await semer();
  const id = await nouveauBrouillon(page);
  // Saisie et changement de page dans le même instant : aucun enregistrement automatique n'a eu le temps de partir.
  await page.evaluate(() => {
    const champ = document.querySelector('[data-champ="objet"]');
    champ.value = 'Salle de bains';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    location.hash = '#/devis/liste';
  });
  await expect(dialogue(page)).toContainText('Quitter sans enregistrer ?');
  await dialogue(page).getByRole('button', { name: 'Enregistrer et quitter' }).click();
  await expect(page.locator('.page-liste-devis')).toBeVisible();
  expect((await lireDocument(`devis_devis/${id}`)).objet).toBe('Salle de bains');
});

test('ED6 depuis la liste : Nouveau devis, Modifier ouvre l’éditeur, Dupliquer copie le contenu, une nouvelle version vient du serveur ; le cas sans affaire est expliqué', { annotation: { type: 'erreurs-reseau-attendues', description: 'le faux serveur répond comme le vrai' } }, async ({ page }, info) => {
  // Sans affaire : message qui dit quoi faire.
  await ouvrirListe(page);
  await page.locator('[data-action="nouveau-devis-vide"]').click();
  await expect(page.locator('.etat-vide')).toContainText('Aucune affaire pour l’instant');
  await capturer(page, info, 'ED6-sans-affaire');
  // Avec une affaire : choisir l'affaire est obligatoire (champ en rouge, message).
  await semer();
  await expect(page.locator('[data-champ="affaire"]')).toBeVisible();
  await page.locator('[data-action="creer-brouillon"]').click();
  await expect(page.locator('[data-erreur="creation"]')).toContainText('Choisis l’affaire');
  await expect(page.locator('[data-champ="affaire"]')).toHaveClass(/invalide/);
  // Deux devis : un brouillon avec une ligne, un devis envoyé.
  const maintenant = new Date();
  const base = { version: 1, affaireId: 'a1', organisationId: 'o1', personneId: null, modeMarge: 'majoration', marge: 20, tauxTvaDefaut: 20, regimeTva: 'assujetti', autoliquidation: false, archive: false, expireLe: '2027-01-01', destinataires: ['contact@exemple.fr'], creePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant };
  const sections = [{ id: 's1', titre: 'Cuisine', lignes: [{ id: 'l1', libelle: 'Carrelage', quantite: 2, unite: 'm²', prixAchat: 50 }] }];
  await ecrireDocument('devis_devis/b1', { ...base, racineId: 'b1', numero: null, statut: 'brouillon', sections, remise: { type: 'pourcentage', valeur: 10 } });
  await ecrireDocument('devis_devis/e1', { ...base, racineId: 'e1', numero: 'DEV-2026-10-02-001', statut: 'envoye', sections, totaux: { ht: 120, tva: 24, ttc: 144 }, finaliseLe: maintenant });
  await ecrireDocument('devis_devis/v2', { ...base, racineId: 'e1', version: 2, numero: 'DEV-2026-10-02-001', statut: 'brouillon', sections });
  await page.route('**/devisNouvelleVersion', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ok: true, devisId: 'v2', statut: 'brouillon', numero: 'DEV-2026-10-02-001' } }) });
  });
  await page.evaluate(() => { location.hash = '#/devis/liste'; });
  await expect(page.locator('.page-liste-devis')).toBeVisible();
  await attendreCalme(page);
  const menu = async (id) => { await page.locator(`[data-id="${id}"] [data-action="menu-devis"]`).click(); await expect(page.locator('.menu-pop')).toBeVisible(); };
  // Éditer le devis (brouillon) : l'éditeur s'ouvre sur ce devis.
  await menu('b1');
  await page.getByRole('menuitem', { name: 'Éditer le devis' }).click();
  await expect(page.locator('.page-editeur-devis[data-devis="b1"]')).toBeVisible();
  await expect(page.locator('[data-champ="remise-valeur"]')).toHaveValue('10');
  await expect(total(page, 'ht')).toHaveText(/^108,00\s€$/); // 2 × 60 = 120, moins 10 %
  // Dupliquer : un nouveau brouillon avec le même contenu, sans numéro.
  await page.goBack();
  await expect(page.locator('.page-liste-devis')).toBeVisible();
  await menu('b1');
  await page.getByRole('menuitem', { name: 'Dupliquer' }).click();
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  const copie = page.url().split('/').pop();
  expect(copie).not.toBe('b1');
  await expect(page.locator('[data-champ="remise-valeur"]')).toHaveValue('10');
  await expect(lignes(page)).toHaveCount(1);
  await expect(page.locator('[data-valeur="numero-devis"]')).toContainText('Brouillon');
  await expect(total(page, 'ht')).toHaveText(/^108,00\s€$/);
  // Nouvelle version d'un devis envoyé : la fonction du serveur répond, l'éditeur ouvre la version 2.
  await page.evaluate(() => { location.hash = '#/devis/liste'; });
  await expect(page.locator('.page-liste-devis')).toBeVisible();
  await menu('e1');
  await page.getByRole('menuitem', { name: 'Créer une nouvelle version' }).click();
  await expect(page.locator('.page-editeur-devis[data-devis="v2"]')).toBeVisible();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('v2');
  await capturer(page, info, 'ED6-nouvelle-version');
});

test('ED7 devis modifié ailleurs : un bandeau le dit, rien n’est écrasé ni enregistré ; « Recharger » reprend la dernière version', async ({ page }, info) => {
  await semer();
  const id = await nouveauBrouillon(page);
  await ouvrirDescription(page);
  await page.locator('[data-champ="objet"]').fill('Version A');
  await enregistre(page);
  // Une autre session change l'objet.
  const actuel = await lireDocument(`devis_devis/${id}`);
  await ecrireDocument(`devis_devis/${id}`, { ...actuel, objet: 'Version B', modifieLe: new Date() });
  await expect(page.locator('[data-valeur="conflit"]')).toContainText('modifié ailleurs');
  await expect(page.locator('[data-champ="objet"]')).toHaveValue('Version A'); // rien n'est écrasé à l'écran
  await page.locator('[data-champ="objet"]').fill('Version C');
  await page.waitForTimeout(1500); // plus long que l'enregistrement automatique : rien ne part
  expect((await lireDocument(`devis_devis/${id}`)).objet).toBe('Version B');
  await capturer(page, info, 'ED7-modifie-ailleurs');
  await page.locator('[data-action="recharger"]').click();
  await expect(page.locator('[data-champ="objet"]')).toHaveValue('Version B');
  await expect(page.locator('[data-valeur="conflit"]')).toBeHidden();
});

test('ED8 quitter l’éditeur par le menu de gauche (« Affaires ») avec un changement non enregistré ouvre la fenêtre de sortie ; « Annuler » de la barre fait de même', async ({ page }) => {
  await semer();
  await nouveauBrouillon(page);
  await ouvrirDescription(page);
  // Le changement part dans le même instant que le clic : aucun enregistrement automatique n'a eu le temps de se faire.
  await page.evaluate(() => {
    const champ = document.querySelector('[data-champ="objet"]');
    champ.value = 'Terrasse';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await allerA(page, 'Affaires');
  await expect(dialogue(page)).toContainText('Quitter sans enregistrer ?');
  await dialogue(page).getByRole('button', { name: 'Rester' }).click();
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await expect(page.locator('[data-champ="objet"]')).toHaveValue('Terrasse');
  // Même fenêtre avec la flèche « ‹ Devis » (tant que le changement n'est pas enregistré).
  await page.evaluate(() => {
    const champ = document.querySelector('[data-champ="objet"]');
    champ.value = 'Terrasse couverte';
    champ.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector('[data-action="fermer"]').click();
  });
  await expect(dialogue(page)).toContainText('Quitter sans enregistrer ?');
  await dialogue(page).getByRole('button', { name: 'Enregistrer et quitter' }).click();
  await expect(page.locator('.page-liste-devis')).toBeVisible();
});

test('ED9 « Mon entreprise » : l’aperçu du devis affiche le bloc entreprise des réglages ; sans réglage, le bloc est absent (cas vide) ; le réglage modifié ailleurs met l’aperçu à jour', async ({ page }, info) => {
  await semer();
  await nouveauBrouillon(page);
  await chercherEtAjouter(page, 'Carrelage', '2');
  // Cas vide : aucun réglage « Mon entreprise », l'aperçu n'a pas de bloc entreprise.
  await page.locator('[data-onglet="apercu"]').click();
  const apercu = page.locator('iframe[data-zone="apercu"]').contentFrame();
  await expect(apercu.locator('body')).toContainText('Société Exemple');
  await expect(apercu.locator('.emetteur')).toHaveText('');
  // Les réglages arrivent en direct : l'aperçu ouvert se met à jour sans rechargement.
  await ecrireDocument('devis_parametres/reglages', { entreprise: {
    nom: 'Atelier Exemple', forme: 'SARL', siret: '123 456 789 00012', adresse: { ligne1: '1 rue des Lilas', codePostal: '75001', ville: 'Paris' }, telephone: '01 02 03 04 05', couleur: '#1f6feb',
  } });
  const bloc = page.locator('iframe[data-zone="apercu"]').contentFrame().locator('.emetteur');
  await expect(bloc).toContainText('Atelier Exemple');
  await expect(bloc).toContainText('SIRET 123 456 789 00012');
  await expect(bloc).toContainText('1 rue des Lilas');
  await expect(bloc).toContainText('75001 Paris');
  await expect(bloc).toContainText('01 02 03 04 05');
  await capturer(page, info, 'ED9-apercu-entreprise');
  // La même donnée sert à l'impression (document complet).
  const html = await page.evaluate(() => document.querySelector('iframe[data-zone="apercu"]').srcdoc);
  expect(html).toContain('Atelier Exemple');
  expect(html).toContain('--accent: #1f6feb');
});
