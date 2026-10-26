// Module Devis, UN SEUL écran pour toute la vie du devis (décision de Jérôme, 26/10/2026) : onglets « Édition » et « Prévisualisation » toujours là, même feuille.
// Critères (un test chacun, le nom commence par son numéro ; une capture par état dans tests/e2e/captures/devis-ecran-unique/, ordinateur ET téléphone) :
//  1 les deux onglets sont présents quel que soit le statut ;
//  2 « Voir le devis » ouvre l'onglet Prévisualisation, « Éditer le devis » l'onglet Édition ; un finalisé s'ouvre par défaut sur la Prévisualisation ; un brouillon reste modifiable même ouvert par « Voir » ;
//  3 devis finalisé, onglet Édition : MÊME feuille qu'un brouillon, champs lisibles et copiables mais non modifiables, boutons grisés (jamais retirés), « Définir un ajustement » s'ouvre (réglages visibles, rien ne bouge),
//    message « Ce devis est … : il ne se modifie plus » avec « Créer une nouvelle version » au moindre essai ; le bandeau « Tu regardes ce brouillon… » n'existe plus ;
//  4 Catalogue grisé avec infobulle, Options consultable, Historique inchangé ;
//  5 les anciens liens (devis/voir, devis/fiche) arrivent sur l'écran unique, onglet Prévisualisation ;
//  6 les boutons d'en-tête qui suivent l'étape ne changent pas ; 7 cas vide (introuvable) ; 8 cas d'erreur (le serveur refuse « Créer une nouvelle version »).
// La fonction du serveur devisNouvelleVersion n'existe pas dans l'émulateur du navigateur : elle est SIMULÉE par page.route.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, creerOrganisation, creerAffaire, estTelephone, JEROME } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-ecran-unique/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
}
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const LIGNES = [
  { id: 'l1', libelle: 'Carrelage', familleId: 'famille-1', type: 'fourniture', quantite: 10, unite: 'm²', prixAchat: 40, prixVente: 60, tauxTva: 20 },
  { id: 'l2', libelle: 'Pose', familleId: 'famille-2', type: 'main_oeuvre', quantite: 5, unite: 'h', prixAchat: 20, prixVente: 36, tauxTva: 10 },
];
const STATUTS = {
  dBrouillon: {},
  dFinalise: { numero: 'DEV-2026-10-02-001', statut: 'en_attente_envoi' },
  dEnvoye: { numero: 'DEV-2026-10-02-002', statut: 'envoye' },
  dSigne: { numero: 'DEV-2026-10-02-003', statut: 'accepte' },
  dRefuse: { numero: 'DEV-2026-10-02-004', statut: 'refuse' },
  dRemplace: { numero: 'DEV-2026-10-02-005', statut: 'remplace' },
  dArchive: { numero: 'DEV-2026-10-02-006', statut: 'accepte', archive: true },
};
async function devis(id, valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument(`devis_devis/${id}`, {
    racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', personneId: null, organisationId: 'o1', modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: '2099-12-31', objet: 'Rénovation restaurant', destinataires: ['contact@exemple.fr'],
    chantier: { adresse: { texte: '12 rue des Lilas, 49000 Angers' } }, remise: { type: 'pourcentage', valeur: 5 },
    sections: [{ id: 's1', titre: 'Cuisine', lignes: LIGNES }], notesBasDePage: 'Merci de votre confiance',
    creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, finaliseLe: valeurs.statut ? new Date(Date.now() - 86400000) : undefined, ...valeurs,
  });
}
async function donnees() {
  await creerOrganisation('o1', { nom: 'M. Paul Exemple' });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', organisationId: 'o1' });
  for (const [id, v] of Object.entries(STATUTS)) await devis(id, v);
}
const connectees = new WeakSet(); // une page déjà connectée change d'écran par l'adresse (un second « connecter » ne retrouverait pas le bouton de connexion)
async function ouvrir(page, route) {
  if (connectees.has(page)) await page.evaluate((r) => { location.hash = `#/${r}`; }, route);
  else { await connecter(page, undefined, { route }); connectees.add(page); }
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
}
async function ouvrirListe(page) {
  await connecter(page, undefined, { route: 'devis/liste' });
  connectees.add(page);
  await expect(page.locator('.page-liste-devis')).toBeVisible();
}
const racine = (page) => page.locator('.page-editeur-devis');
const onglet = (page, nom) => racine(page).locator(`.barre-devis [data-onglet="${nom}"]`);
const menuPlus = async (page) => { await page.locator('[data-action="plus-actions"]').click(); await expect(page.locator('.menu-pop')).toBeVisible(); return page.locator('.menu-pop'); };
const MESSAGE_REFUS = /Ce devis est finalisé : il ne se modifie plus\. Crée une nouvelle version pour le corriger/;
/** Les champs de la feuille (data-champ) et les boutons d'action (data-action) : ce qui doit être IDENTIQUE entre un brouillon et un devis finalisé. */
const empreinte = (page) => page.evaluate(() => {
  const feuille = document.querySelector('[data-panneau="edition"]');
  const liste = (sel, cle) => [...feuille.querySelectorAll(sel)].map((e) => e.dataset[cle]).filter((x) => x && x !== 'lecture').sort();
  return { champs: liste('[data-champ]', 'champ'), actions: liste('[data-action]', 'action'), lignes: feuille.querySelectorAll('tr[data-id]').length, titres: [...feuille.querySelectorAll('h3')].map((e) => e.textContent.trim()) };
});

for (const [id, v] of Object.entries(STATUTS)) {
  test(`1 les onglets « Édition » et « Prévisualisation » sont présents quel que soit le statut : ${id}`, async ({ page }, info) => {
    await donnees();
    await ouvrir(page, `devis/voir/${id}`);
    await expect(onglet(page, 'edition')).toBeVisible();
    await expect(onglet(page, 'edition')).toContainText('Édition');
    await expect(onglet(page, 'apercu')).toBeVisible();
    await expect(onglet(page, 'apercu')).toContainText('Prévisualisation');
    await expect(onglet(page, 'apercu')).toHaveAttribute('aria-selected', 'true'); // ouvert par « voir » : sur la Prévisualisation
    await onglet(page, 'edition').click();
    await expect(racine(page).locator('[data-panneau="edition"]')).toBeVisible();
    await expect(racine(page).locator('[data-champ="chantier-adresse"]')).toBeVisible();
    if (id === 'dFinalise' || id === 'dBrouillon') await capturer(page, info, `1-onglets-${id}`);
  });
}

test('2 « Voir le devis » ouvre la Prévisualisation, « Éditer le devis » l’Édition (liste et menu « … » du haut de page) ; un devis finalisé s’ouvre par défaut sur la Prévisualisation', async ({ page }, info) => {
  await donnees();
  await ouvrirListe(page);
  // Depuis la liste : un devis finalisé s'ouvre sur la Prévisualisation ; « Éditer le devis » (même finalisé) sur l'Édition.
  await page.locator('tr.ligne-devis[data-id="dFinalise"] td[data-colonne="client"]:visible, article.carte-devis[data-id="dFinalise"]').first().click();
  await expect(onglet(page, 'apercu')).toHaveAttribute('aria-selected', 'true');
  await page.goBack();
  await page.locator('[data-id="dFinalise"] [data-action="menu-devis"]:visible').first().click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Éditer le devis' }).click();
  await expect(page).toHaveURL(/#\/devis\/editeur\/dFinalise$/);
  await expect(onglet(page, 'edition')).toHaveAttribute('aria-selected', 'true');
  await expect(racine(page)).toHaveClass(/devis-lecture-seule/);
  await page.goBack();
  await page.locator('[data-id="dBrouillon"] [data-action="menu-devis"]:visible').first().click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Voir le devis' }).click();
  await expect(page).toHaveURL(/#\/devis\/voir\/dBrouillon$/);
  await expect(onglet(page, 'apercu')).toHaveAttribute('aria-selected', 'true');
  // Un BROUILLON reste modifiable même ouvert par « Voir le devis » : pas de lecture seule, pas de bandeau.
  await expect(racine(page)).not.toHaveClass(/devis-lecture-seule/);
  await expect(racine(page).locator('[data-valeur="lecture-seule"]')).toHaveCount(0);
  await expect(racine(page)).not.toContainText('Tu regardes ce brouillon');
  await capturer(page, info, '2-brouillon-ouvert-par-voir');
  // Dans le « … » de l'écran, « Éditer le devis » et « Voir le devis » changent d'onglet sans quitter l'écran.
  let menu = await menuPlus(page);
  await menu.getByRole('menuitem', { name: 'Éditer le devis' }).click();
  await expect(onglet(page, 'edition')).toHaveAttribute('aria-selected', 'true');
  await expect(racine(page).locator('[data-champ="chantier-adresse"]')).toBeEditable();
  await racine(page).locator('[data-champ="chantier-adresse"]').fill('3 rue Neuve\n75001 Paris'); // un brouillon ouvert par « Voir » se modifie vraiment
  await expect(racine(page).locator('[data-valeur="enregistrement"]')).toHaveAttribute('data-etat', 'enregistre');
  menu = await menuPlus(page);
  await menu.getByRole('menuitem', { name: 'Voir le devis' }).click();
  await expect(onglet(page, 'apercu')).toHaveAttribute('aria-selected', 'true');
  await expect(page).toHaveURL(/#\/devis\/voir\/dBrouillon$/);
});

test('3 devis finalisé, onglet Édition : la MÊME feuille qu’un brouillon, champs lisibles mais non modifiables, boutons grisés (jamais retirés), message au moindre essai avec « Créer une nouvelle version »', async ({ page }, info) => {
  await donnees();
  await ouvrir(page, 'devis/editeur/dBrouillon');
  const brouillon = await empreinte(page);
  await ouvrir(page, 'devis/editeur/dFinalise');
  await expect(onglet(page, 'edition')).toHaveAttribute('aria-selected', 'true');
  const finalise = await empreinte(page);
  expect(finalise).toEqual(brouillon); // mêmes champs, mêmes boutons, mêmes titres : rien n'est retiré, rien n'est ajouté
  const feuille = racine(page).locator('[data-panneau="edition"]');
  // Le bandeau jaune des brouillons n'existe plus ; la phrase d'un devis finalisé reste, au-dessus de la feuille.
  await expect(racine(page)).not.toContainText('Tu regardes ce brouillon');
  // Lisibles et copiables : readonly (pas disabled), la valeur est là et se sélectionne.
  const adresse = feuille.locator('[data-champ="chantier-adresse"]');
  await expect(adresse).toHaveValue(/12 rue des Lilas/);
  await expect(adresse).toHaveAttribute('readonly', '');
  await expect(adresse).toBeEnabled();
  const ligne = feuille.locator('tr[data-id="l1"]');
  await expect(ligne.locator('[data-champ="libelle"]')).toHaveValue('Carrelage');
  await expect(ligne.locator('[data-champ="quantite"]')).toHaveValue('10');
  await expect(feuille.locator('[data-champ="remise-valeur"]')).toHaveValue('5');
  await expect(feuille.locator('[data-champ="notes"]')).toHaveValue('Merci de votre confiance');
  // Les boutons de modification sont grisés comme le « Envoyer » grisé d'un brouillon (aria-disabled, focusables), jamais retirés.
  for (const action of ['ajouter-section', 'ajouter-sous-section', 'ajouter-texte', 'ajouter-saut', 'ajouter-famille-1', 'menu-ligne']) {
    await expect(feuille.locator(`[data-action="${action}"]`).first(), action).toHaveAttribute('aria-disabled', 'true');
  }
  // Les flèches de déplacement sont toutes grisées (déjà sans effet en première ou dernière ligne, ou grisées par la lecture seule).
  expect(await feuille.locator('.bouton-poignee').evaluateAll((l) => l.every((b) => b.disabled || b.getAttribute('aria-disabled') === 'true'))).toBe(true);
  await expect(racine(page).locator('[data-action="bibliotheque"]')).toHaveAttribute('aria-disabled', 'true');
  await expect(feuille.locator('[data-action="ajouter-section"]')).toHaveCSS('opacity', '0.45');
  // Essai de saisie : rien ne change, un message dit pourquoi.
  await adresse.click();
  await expect(page.locator('.toast')).toContainText(MESSAGE_REFUS);
  await expect(page.locator('.toast [data-action="toast-action"]')).toHaveText('Créer une nouvelle version');
  await capturer(page, info, '3-finalise-edition-lecture-seule-message-clic');
  await page.waitForTimeout(1700);
  await ligne.locator('[data-champ="quantite"]').click();
  await page.keyboard.type('99');
  await expect(ligne.locator('[data-champ="quantite"]')).toHaveValue('10');
  await expect(page.locator('.toast').last()).toContainText('il ne se modifie plus');
  // Essai sur un bouton grisé : même message.
  await page.waitForTimeout(1700);
  await feuille.locator('[data-action="ajouter-section"]').click({ force: true });
  await expect(page.locator('.toast').last()).toContainText('il ne se modifie plus');
  expect((await empreinte(page)).lignes).toBe(brouillon.lignes); // rien n'a été ajouté
  // Essai sur une liste : elle ne s'ouvre pas, la valeur reste.
  await page.waitForTimeout(1700);
  const type = feuille.locator('[data-champ="remise-type"]');
  const avant = await type.inputValue();
  await type.click({ force: true });
  await page.keyboard.press('ArrowDown');
  await expect(type).toHaveValue(avant);
  await expect(page.locator('.toast').last()).toContainText('il ne se modifie plus');
  await page.waitForTimeout(500);
  await expect(racine(page).locator('[data-valeur="enregistrement"]')).toBeHidden(); // rien à enregistrer
  await page.evaluate(() => { document.querySelectorAll('#toasts .toast').forEach((t) => t.remove()); });
  await capturer(page, info, '3-finalise-edition-lecture-seule');
});

test('3 « Définir un ajustement » s’ouvre en lecture seule : les réglages sont visibles, rien ne se modifie, un essai affiche le message ; le mot suit le statut (envoyé, signé…)', async ({ page }, info) => {
  await donnees();
  await ouvrir(page, 'devis/editeur/dEnvoye');
  const feuille = racine(page).locator('[data-panneau="edition"]');
  await feuille.locator('[data-action="definir-ajustement"]').click();
  const boite = page.locator('.menu-pop.menu-devis-ajustement');
  await expect(boite).toBeVisible();
  await expect(boite.locator('[data-champ="ajust-pourcentage"]')).toBeVisible();
  await expect(boite.locator('[data-champ="ajust-pourcentage"]')).toHaveAttribute('readonly', '');
  await expect(boite.locator('[data-action="retirer-ajustement"]')).toHaveAttribute('aria-disabled', 'true'); // le bouton qui modifierait est grisé
  await boite.getByRole('menuitem', { name: 'Remise' }).click();
  await expect(boite.locator('[data-champ="remise-valeur-menu"]')).toHaveValue('5'); // les réglages de la remise sont visibles
  await capturer(page, info, '3-ajustement-ouvert-lecture-seule');
  await boite.locator('[data-champ="ajust-pourcentage"]').click();
  await expect(page.locator('.toast')).toContainText('Ce devis est envoyé : il ne se modifie plus. Crée une nouvelle version pour le corriger');
  await page.waitForTimeout(1700);
  await boite.locator('[data-champ="remise-valeur-menu"]').click();
  await page.keyboard.type('50');
  await expect(boite.locator('[data-champ="remise-valeur-menu"]')).toHaveValue('5');
  await expect(feuille.locator('[data-champ="remise-valeur"]')).toHaveValue('5');
  await page.keyboard.press('Escape');
  // Devis signé : le mot change et il n'y a plus de nouvelle version possible, donc pas de bouton.
  await ouvrir(page, 'devis/editeur/dSigne');
  await racine(page).locator('[data-panneau="edition"] [data-champ="notes"]').click();
  await expect(page.locator('.toast').last()).toContainText('Ce devis est signé : il ne se modifie plus.');
  await expect(page.locator('.toast').last().locator('[data-action="toast-action"]')).toHaveCount(0);
});

test('4 en lecture seule : Catalogue grisé avec une infobulle qui explique pourquoi ; Options se consulte (cases non modifiables) ; Historique s’ouvre comme avant', async ({ page }, info) => {
  await donnees();
  await ouvrir(page, 'devis/editeur/dFinalise');
  const catalogue = racine(page).locator('[data-action="bibliotheque"]');
  await expect(catalogue).toBeVisible();
  await expect(catalogue).toHaveAttribute('aria-disabled', 'true');
  await expect(catalogue).toHaveAttribute('title', /Ajouter un article, c’est modifier le devis/);
  await catalogue.click({ force: true }); // grisé : aria-disabled (Playwright le croit inactif, un vrai clic passe)
  await expect(page.locator('[data-zone="bibliotheque"], #bibliotheque-devis')).toHaveCount(0); // ne s'ouvre pas
  await expect(page.locator('.toast')).toContainText('il ne se modifie plus');
  // Options : consultable.
  if (estTelephone(page)) { await page.locator('[data-action="plus-actions"]').click(); await page.locator('.menu-pop').getByRole('menuitem', { name: 'Options' }).click(); } else await racine(page).locator('[data-action="options"]').click();
  const options = page.locator('#options-devis');
  await expect(options).toBeVisible();
  const caseMarges = options.locator('[data-option="afficherMarges"]');
  const avant = await caseMarges.isChecked();
  await caseMarges.click({ force: true });
  expect(await caseMarges.isChecked()).toBe(avant); // la case ne bascule pas
  await capturer(page, info, '4-options-lecture-seule');
  await options.locator('[data-action="fermer-options"]').click();
  // Historique : inchangé.
  if (estTelephone(page)) { await page.locator('[data-action="plus-actions"]').click(); await page.locator('.menu-pop').getByRole('menuitem', { name: 'Historique' }).click(); } else await racine(page).locator('[data-action="historique"]').click();
  await expect(page.locator('#historique-devis')).toBeVisible();
  await expect(page.locator('#historique-devis [data-bloc="versions"]')).toContainText('Version 1');
  await capturer(page, info, '4-historique');
});

test('5 les anciens liens (devis/voir/<id>, devis/fiche/<id>) arrivent sur l’écran unique, onglet Prévisualisation, sans écran de visualisation séparé', async ({ page }, info) => {
  await donnees();
  for (const route of ['devis/voir/dFinalise', 'devis/fiche/dFinalise']) {
    await ouvrir(page, route);
    await expect(page).toHaveURL(/#\/devis\/voir\/dFinalise$/);
    await expect(onglet(page, 'apercu')).toHaveAttribute('aria-selected', 'true');
    await expect(racine(page).locator('iframe[data-zone="apercu"]')).toBeVisible();
    await expect(onglet(page, 'edition')).toBeVisible();
    await expect(racine(page).locator('[data-action="retour-devis"]')).toHaveCount(0); // plus de variante « visualisation » de l'écran
    await expect(racine(page).locator('[data-action="fermer"]')).toBeVisible();
  }
  await capturer(page, info, '5-ancien-lien-previsualisation');
});

test('6 les boutons d’en-tête qui suivent l’étape ne changent pas (brouillon : Finaliser + Envoyer grisé ; finalisé : Envoyer jaune ; envoyé : Marquer comme signé jaune), dans la même barre sur l’onglet Édition comme sur la Prévisualisation', async ({ page }) => {
  await donnees();
  const attendus = { dBrouillon: ['finaliser', 'envoyer'], dFinalise: ['envoyer', 'passer-envoye'], dEnvoye: ['marquer-signe', 'marquer-refuse'], dSigne: [] };
  for (const [id, boutons] of Object.entries(attendus)) {
    await ouvrir(page, `devis/voir/${id}`);
    for (const nom of ['apercu', 'edition']) {
      await onglet(page, nom).click();
      const barre = racine(page).locator('.barre-devis-droite');
      for (const b of boutons) await expect(barre.locator(`[data-action="${b}"]`), `${id} ${nom} ${b}`).toBeVisible();
      await expect(racine(page).locator('.barre-devis-droite .bouton-principal')).toHaveCount(boutons.length ? 1 : 0);
    }
  }
});

test('7 cas vide : un devis introuvable dit « Ce devis est introuvable » et propose de revenir à la liste, sans onglets ni totaux', async ({ page }, info) => {
  await donnees();
  await connecter(page, undefined, { route: 'devis/voir/nexistepas' });
  await expect(page.locator('[data-etat="introuvable"]')).toContainText('Ce devis est introuvable', { timeout: 10000 });
  await expect(page.locator('[data-onglet]')).toHaveCount(0);
  await expect(page.locator('[data-zone="total"]')).toHaveCount(0);
  await capturer(page, info, '7-introuvable');
  await page.locator('[data-action="retour-liste"]').click();
  await expect(page).toHaveURL(/#\/devis\/liste$/);
});

test('8 cas d’erreur : le serveur refuse « Créer une nouvelle version » depuis le message de refus : un message le dit et l’écran reste ouvert, en lecture seule ; si le serveur accepte, le brouillon suivant s’ouvre', async ({ page }, info) => {
  info.annotations.push({ type: 'erreurs-reseau-attendues' });
  await donnees();
  let accepter = false;
  await page.route('**/devisNouvelleVersion', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    if (!accepter) return route.abort('failed');
    await devis('dV2', { version: 2, racineId: 'dFinalise', numero: 'DEV-2026-10-02-001' }); // ce que ferait le serveur
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ok: true, devisId: 'dV2' } }) });
  });
  await ouvrir(page, 'devis/editeur/dFinalise');
  await racine(page).locator('[data-champ="chantier-adresse"]').click();
  await page.locator('.toast [data-action="toast-action"]').click();
  await expect(page.locator('.toast').last()).toContainText('rien n’a été perdu');
  await expect(page).toHaveURL(/#\/devis\/editeur\/dFinalise$/);
  await expect(racine(page)).toHaveClass(/devis-lecture-seule/);
  await capturer(page, info, '8-erreur-nouvelle-version');
  accepter = true;
  await page.waitForTimeout(1700);
  await racine(page).locator('[data-champ="chantier-adresse"]').click();
  await page.locator('.toast [data-action="toast-action"]').click();
  await expect(page).toHaveURL(/#\/devis\/editeur\/dV2$/);
  await expect(racine(page)).not.toHaveClass(/devis-lecture-seule/);
});

test('Historique : passer d’une version à l’autre reste dans l’écran unique (onglets Édition / Prévisualisation, ouverture sur la Prévisualisation, Édition en lecture seule)', async ({ page }, info) => {
  await donnees();
  await devis('dV1', { numero: 'DEV-2026-10-02-010', statut: 'remplace', version: 1, racineId: 'dV1' });
  await devis('dV2', { numero: 'DEV-2026-10-02-010', statut: 'envoye', version: 2, racineId: 'dV1' });
  await ouvrir(page, 'devis/voir/dV2');
  for (const cible of ['dV1', 'dV2']) {
    if (estTelephone(page)) {
      await page.locator('[data-action="plus-actions"]').click();
      await page.locator('.menu-pop').getByRole('menuitem', { name: 'Historique' }).click();
    } else await racine(page).locator('[data-action="historique"]').click();
    const version = page.locator(`#historique-devis [data-version-id="${cible}"]`);
    await expect(version).toBeVisible();
    if (cible === 'dV1') await capturer(page, info, 'H-historique-versions');
    await version.click();
    await expect(page).toHaveURL(new RegExp(`#/devis/voir/${cible}$`));
    await expect(racine(page)).toHaveAttribute('data-devis', cible);
    await expect(onglet(page, 'edition')).toBeVisible();
    await expect(onglet(page, 'apercu')).toHaveAttribute('aria-selected', 'true');
    await expect(racine(page).locator('[data-action="retour-devis"]')).toHaveCount(0);
    await onglet(page, 'edition').click();
    await expect(racine(page).locator('[data-champ="chantier-adresse"]')).toHaveAttribute('readonly', '');
    await onglet(page, 'apercu').click();
  }
});
