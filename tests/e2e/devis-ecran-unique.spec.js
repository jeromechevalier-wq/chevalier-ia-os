// Module Devis, UN SEUL écran pour toute la vie du devis (décision de Jérôme, 26/10/2026) : onglets « Édition » et « Prévisualisation » toujours là, même feuille.
// Critères (un test chacun, le nom commence par son numéro ; une capture par état dans tests/e2e/captures/devis-ecran-unique/, ordinateur ET téléphone) :
//  1 les deux onglets sont présents quel que soit le statut ;
//  2 « Voir le devis » (liste) ouvre l'onglet Prévisualisation, « Éditer le devis » l'onglet Édition ; un finalisé s'ouvre par défaut sur la Prévisualisation ; un brouillon reste modifiable même ouvert par « Voir » ;
//  3 devis finalisé, onglet Édition : MÊME feuille qu'un brouillon, champs lisibles et copiables mais non modifiables, boutons grisés (jamais retirés), « Marge et ajustement » s'ouvre (réglages visibles, rien ne bouge),
//    message « Ce devis est … : il ne se modifie plus » avec « Créer une nouvelle version » au moindre essai ; le bandeau « Tu regardes ce brouillon… » n'existe plus ;
//  4 Catalogue grisé avec infobulle, Options consultable, Historique inchangé ;
//  5 les anciens liens (devis/voir, devis/fiche) arrivent sur l'écran unique, onglet Prévisualisation ;
//  6 les boutons d'en-tête qui suivent l'étape ne changent pas ; 7 cas vide (introuvable) ; 8 cas d'erreur (le serveur refuse « Créer une nouvelle version »).
// Corrections après la relecture Fable :
//  9 en lecture seule, les listes « Affaire » et « Client » ne changent rien (clavier Alt+↓ puis choix, choix forcé sans clavier) et le message de refus s'affiche ;
// 10 le bandeau du haut suit le statut et ne parle de nouvelle version que si elle est possible ;
// 11 pas de doublon dans le « … » de l'écran : ni « Éditer le devis » ni « Voir le devis » (les onglets font la même chose ; décision de Jérôme du 26/10/2026), Options et Historique seulement quand leurs boutons sont cachés ;
// 12 les dates (« En date du », « Valable jusqu'au », « définir »), les listes et les cases sont grisées comme les autres boutons verrouillés ;
// 13 finaliser un brouillon ouvert par « Voir » : l'écran passe en lecture seule sur place (même adresse, un seul écran).
// La fonction du serveur devisNouvelleVersion n'existe pas dans l'émulateur du navigateur : elle est SIMULÉE par page.route.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, lireDocument, creerOrganisation, creerPersonne, creerAffaire, estTelephone, JEROME } from './outils.js';

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
  // Dans l'écran, ce sont les onglets « Édition » et « Prévisualisation » qui font ce que « Éditer le devis » et « Voir le devis » font depuis la liste (le « … » ne les répète plus).
  await onglet(page, 'edition').click();
  await expect(onglet(page, 'edition')).toHaveAttribute('aria-selected', 'true');
  await expect(racine(page).locator('[data-champ="chantier-adresse"]')).toBeEditable();
  await racine(page).locator('[data-champ="chantier-adresse"]').fill('3 rue Neuve\n75001 Paris'); // un brouillon ouvert par « Voir » se modifie vraiment
  await expect(racine(page).locator('[data-valeur="enregistrement"]')).toHaveAttribute('data-etat', 'enregistre');
  await onglet(page, 'apercu').click();
  await expect(onglet(page, 'apercu')).toHaveAttribute('aria-selected', 'true');
  await expect(racine(page).locator('iframe[data-zone="apercu"]')).toBeVisible();
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

test('3 « Marge et ajustement » s’ouvre en lecture seule : les réglages sont visibles, rien ne se modifie, un essai affiche le message ; le mot suit le statut (envoyé, signé…)', async ({ page }, info) => {
  await donnees();
  await ouvrir(page, 'devis/editeur/dEnvoye');
  const feuille = racine(page).locator('[data-panneau="edition"]');
  await feuille.locator('[data-action="definir-ajustement"]').click();
  const boite = page.locator('.menu-pop.menu-devis-ajustement');
  await expect(boite).toBeVisible();
  await expect(boite.locator('[data-champ="ajust-pourcentage"]')).toBeVisible();
  await expect(boite.locator('[data-champ="ajust-pourcentage"]')).toHaveAttribute('readonly', '');
  await expect(boite.locator('[data-action="retirer-ajustement"]')).toHaveAttribute('aria-disabled', 'true'); // le bouton qui modifierait est grisé
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

test('9 lecture seule : le client et l’affaire sont du texte copiable (jamais une liste qui s’ouvre) ; taper ou cliquer dedans ne change ni le titre, ni le client, ni l’adresse, ni l’e-mail, et le message de refus s’affiche', async ({ page }, info) => {
  await donnees();
  await creerOrganisation('o2', { nom: 'Société Autre', adresse: '5 avenue Test, 75001 Paris', emails: ['autre@exemple.fr'] });
  await creerPersonne('p2', { nom: 'Julie Témoin', emails: [{ valeur: 'julie@exemple.fr', type: 'travail' }], adresse: '8 place Neuve, 44000 Nantes' });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', organisationId: 'o1', personneId: 'p2' });
  await creerAffaire('a2', { titre: 'Extension garage', organisationId: 'o2' });
  await ouvrir(page, 'devis/editeur/dFinalise');
  const feuille = racine(page).locator('[data-panneau="edition"]');
  const affaire = feuille.locator('[data-champ="affaire"]');
  const client = feuille.locator('[data-champ="client"]');
  // Pas de champ intelligent en lecture seule : ni liste, ni croix « Effacer ».
  await expect(feuille.locator('.entete-droite .champ-intelligent')).toHaveCount(0);
  await expect(affaire).toHaveValue('Rénovation cuisine · M. Paul Exemple');
  await expect(client).toHaveValue('M. Paul Exemple');
  const etat = () => page.evaluate(() => ({
    titre: document.querySelector('.titre-barre-devis')?.textContent,
    lienClient: document.querySelector('[data-valeur="lien-client"]')?.getAttribute('href'),
    nomClient: document.querySelector('[data-valeur="lien-client"]')?.textContent,
    lienAffaire: document.querySelector('[data-valeur="lien-affaire"]')?.textContent,
    affaire: document.querySelector('[data-champ="affaire"]').value,
    client: document.querySelector('[data-champ="client"]').value,
    adresse: document.querySelector('[data-champ="chantier-adresse"]').value,
    email: [...document.querySelectorAll('[data-zone="destinataires"] .ligne-destinataire span')].map((e) => e.textContent).join(','),
  }));
  const avant = await etat();
  for (const champ of [affaire, client]) {
    await champ.focus();
    await page.keyboard.type('Ex');
    await expect(page.locator('.toast').last()).toContainText(MESSAGE_REFUS);
    await expect(page.locator('.suggestions:not([hidden])')).toHaveCount(0);
    expect(await etat()).toEqual(avant);
    await page.waitForTimeout(1700);
    await champ.click();
    await expect(page.locator('.toast').last()).toContainText(MESSAGE_REFUS);
    expect(await etat()).toEqual(avant);
    await page.waitForTimeout(1700);
  }
  await capturer(page, info, '9-listes-lecture-seule-refus');
  // Rien n'a été écrit dans le devis.
  await page.waitForTimeout(1200);
  const enregistre = await lireDocument('devis_devis/dFinalise');
  expect(enregistre.affaireId).toBe('a1');
  expect(enregistre.organisationId).toBe('o1');
  expect(enregistre.personneId ?? null).toBe(null);
  expect(enregistre.destinataires).toEqual(['contact@exemple.fr']);
});

test('10 le bandeau du haut suit le statut : « nouvelle version » seulement quand elle est possible (finalisé, envoyé, refusé), jamais pour un devis signé, remplacé ou archivé (signé)', async ({ page }, info) => {
  await donnees();
  const attendus = {
    dFinalise: 'Ce devis est finalisé : pour le corriger, crée une nouvelle version',
    dEnvoye: 'Ce devis est envoyé : pour le corriger, crée une nouvelle version',
    dRefuse: 'Ce devis est refusé : pour le corriger, crée une nouvelle version',
    dSigne: 'Ce devis est signé : il ne se modifie plus.',
    dRemplace: 'Ce devis est remplacé : il ne se modifie plus.',
    dArchive: 'Ce devis est archivé : il ne se modifie plus.',
  };
  for (const [id, texte] of Object.entries(attendus)) {
    await ouvrir(page, `devis/editeur/${id}`);
    const bandeau = racine(page).locator('[data-valeur="lecture-seule"]');
    await expect(bandeau, id).toContainText(texte);
    if (!texte.includes('crée une nouvelle version')) await expect(bandeau, id).not.toContainText('nouvelle version');
    expect((await bandeau.textContent()).split(/[.!?]\s/).filter(Boolean), id).toHaveLength(1); // une seule phrase
    if (id === 'dSigne') await capturer(page, info, '10-bandeau-signe');
  }
  // Brouillon : pas de bandeau.
  await ouvrir(page, 'devis/editeur/dBrouillon');
  await expect(racine(page).locator('[data-valeur="lecture-seule"]')).toHaveCount(0);
});

test('11 pas de doublon dans le « … » de l’écran : ni « Éditer le devis » ni « Voir le devis » (les onglets Édition et Prévisualisation font la même chose), Options et Historique seulement quand leurs boutons sont cachés ; depuis la liste, les deux entrées mènent aux mêmes onglets', async ({ page }, info) => {
  await donnees();
  for (const id of ['dFinalise', 'dBrouillon']) {
    await ouvrir(page, `devis/voir/${id}`);
    for (const nom of ['apercu', 'edition']) {
      await onglet(page, nom).click();
      const menu = await menuPlus(page);
      await expect(menu.getByRole('menuitem', { name: 'Éditer le devis' }), `${id} ${nom}`).toHaveCount(0);
      await expect(menu.getByRole('menuitem', { name: 'Voir le devis' }), `${id} ${nom}`).toHaveCount(0);
      // Options et Historique : dans le menu seulement si leur bouton n'est pas visible (téléphone).
      for (const [libelle, action] of [['Options', 'options'], ['Historique', 'historique']]) {
        const boutonVisible = await racine(page).locator(`.barre-devis [data-action="${action}"]`).isVisible();
        await expect(menu.getByRole('menuitem', { name: libelle, exact: true }), `${id} ${nom} ${libelle}`).toHaveCount(boutonVisible ? 0 : 1);
      }
      if (id === 'dFinalise' && nom === 'apercu') await capturer(page, info, '11-menu-sans-doublon');
      await page.keyboard.press('Escape');
    }
  }
  // Les onglets mènent aux mêmes écrans que les entrées de la liste : « Voir le devis » = onglet Prévisualisation, « Éditer le devis » = onglet Édition.
  const panneaux = async () => ({
    apercu: await onglet(page, 'apercu').getAttribute('aria-selected'),
    edition: await onglet(page, 'edition').getAttribute('aria-selected'),
    feuille: await racine(page).locator('[data-panneau="edition"]').isVisible(),
    document: await racine(page).locator('iframe[data-zone="apercu"]').isVisible(),
  });
  const parListe = {};
  for (const entree of ['Voir le devis', 'Éditer le devis']) {
    await page.evaluate(() => { location.hash = '#/devis/liste'; });
    await expect(page.locator('.page-liste-devis')).toBeVisible();
    await page.locator('[data-id="dFinalise"] [data-action="menu-devis"]:visible').first().click();
    await page.locator('.menu-pop').getByRole('menuitem', { name: entree }).click();
    await expect(racine(page)).toHaveAttribute('data-devis', 'dFinalise');
    await attendreCalme(page);
    parListe[entree] = await panneaux();
  }
  // Depuis l'écran ouvert par « Éditer le devis » : l'onglet Prévisualisation donne ce que donne « Voir le devis », et inversement.
  await onglet(page, 'apercu').click();
  await expect(racine(page).locator('iframe[data-zone="apercu"]')).toBeVisible();
  expect(await panneaux()).toEqual(parListe['Voir le devis']);
  await onglet(page, 'edition').click();
  await expect(racine(page).locator('[data-panneau="edition"]')).toBeVisible();
  expect(await panneaux()).toEqual(parListe['Éditer le devis']);
  expect(parListe['Voir le devis']).toEqual({ apercu: 'true', edition: 'false', feuille: false, document: true });
  expect(parListe['Éditer le devis']).toEqual({ apercu: 'false', edition: 'true', feuille: true, document: false });
});

test('12 lecture seule : les dates (« En date du », « Valable jusqu’au », « définir »), les listes et les cases sont grisées comme les autres boutons verrouillés, jamais retirées ; un clic sur une date affiche le message', async ({ page }, info) => {
  await donnees();
  await ouvrir(page, 'devis/editeur/dFinalise');
  const feuille = racine(page).locator('[data-panneau="edition"]');
  const dates = feuille.locator('.lien-definir');
  const nombre = await dates.count();
  expect(nombre).toBeGreaterThan(0);
  for (let i = 0; i < nombre; i += 1) {
    await expect(dates.nth(i)).toBeVisible();
    await expect(dates.nth(i)).toHaveAttribute('aria-disabled', 'true');
    await expect(dates.nth(i)).toHaveCSS('opacity', '0.45');
  }
  const vide = feuille.locator('.lien-definir', { hasText: 'définir' }).first();
  await expect(vide).toBeVisible(); // une date vide reste là, grisée
  await expect(feuille.locator('[data-champ="remise-type"]')).toHaveCSS('opacity', '0.45');
  for (const champ of ['affaire', 'client']) await expect(feuille.locator(`[data-champ="${champ}"]`), champ).toHaveCSS('opacity', '1'); // en texte net, lisibles et copiables (plus de liste)
  await expect(feuille.locator('[data-champ="chantier-adresse"]')).toHaveCSS('opacity', '1'); // un champ texte reste net (lisible, copiable)
  await vide.click({ force: true });
  await expect(page.locator('.toast').last()).toContainText(MESSAGE_REFUS);
  await expect(feuille.locator('.valeur-saisie:visible')).toHaveCount(0); // le champ de date ne s'ouvre pas
  await capturer(page, info, '12-dates-grisees');
  // Les cases du menu Options : grisées pareil.
  if (estTelephone(page)) { await page.locator('[data-action="plus-actions"]').click(); await page.locator('.menu-pop').getByRole('menuitem', { name: 'Options' }).click(); } else await racine(page).locator('[data-action="options"]').click();
  await expect(page.locator('#options-devis [data-option="afficherMarges"]')).toHaveCSS('opacity', '0.45');
});

test('13 finaliser un brouillon ouvert par « Voir le devis » : l’écran passe en lecture seule sur place (même adresse, un seul écran, bandeau à jour)', { annotation: { type: 'erreurs-reseau-attendues', description: 'le faux serveur répond comme le vrai' } }, async ({ page }) => {
  await donnees();
  await page.route('**/devisFinaliser', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const actuel = await lireDocument('devis_devis/dBrouillon');
    await ecrireDocument('devis_devis/dBrouillon', { ...actuel, statut: 'en_attente_envoi', numero: 'DEV-2026-10-02-099', finaliseLe: new Date() });
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ok: true, devisId: 'dBrouillon', statut: 'en_attente_envoi', numero: 'DEV-2026-10-02-099', nouveauNumero: true } }) });
  });
  await ouvrir(page, 'devis/voir/dBrouillon');
  await racine(page).locator('[data-action="finaliser"]').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Finaliser' }).click();
  await expect(page.locator('.toast').first()).toContainText('Devis finalisé');
  await expect(page).toHaveURL(/#\/devis\/voir\/dBrouillon$/);
  await expect(racine(page)).toHaveClass(/devis-lecture-seule/);
  await expect(page.locator('.page-editeur-devis')).toHaveCount(1);
  await expect(racine(page).locator('[data-valeur="lecture-seule"]')).toContainText('Ce devis est finalisé : pour le corriger, crée une nouvelle version');
  await expect(onglet(page, 'apercu')).toHaveAttribute('aria-selected', 'true');
});

test('14 l’infobulle du Catalogue grisé suit le statut : finalisé propose une nouvelle version, signé dit seulement qu’il ne se modifie plus', async ({ page }) => {
  await donnees();
  await ouvrir(page, 'devis/editeur/dFinalise');
  await expect(racine(page).locator('[data-action="bibliotheque"]')).toHaveAttribute('title', /il est finalisé, crée une nouvelle version pour le corriger/);
  await ouvrir(page, 'devis/editeur/dSigne');
  const titre = await racine(page).locator('[data-action="bibliotheque"]').getAttribute('title');
  expect(titre).toContain('il est signé');
  expect(titre).toContain('il ne se modifie plus');
  expect(titre).not.toMatch(/nouvelle version|finalisé/);
});

test('15 lecture seule : « Masquer la description » replie la zone sans message de refus (ce n’est que regarder)', async ({ page }) => {
  await donnees();
  await ouvrir(page, 'devis/editeur/dFinalise');
  const lien = racine(page).locator('[data-action="description"]');
  await expect(lien).toHaveText(/Masquer la description/);
  await expect(racine(page).locator('[data-champ="objet"]')).toBeVisible();
  await lien.click();
  await expect(racine(page).locator('[data-champ="objet"]')).toBeHidden();
  await expect(lien).toHaveText(/Ajouter une description/);
  await expect(page.locator('.toast')).toHaveCount(0);
});

test('16 finaliser depuis l’éditeur : l’écran qui s’ouvre ensuite sur la Prévisualisation est déjà en lecture seule (jamais un instant modifiable), même si le serveur n’a pas encore renvoyé le devis', async ({ page }) => {
  await donnees();
  await page.route('**/devisFinaliser', async (route) => { // le faux serveur répond sans écrire : la copie locale est tout ce que l'écran connaît
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ok: true, devisId: 'dBrouillon', statut: 'en_attente_envoi', numero: 'DEV-2026-10-02-098', nouveauNumero: true } }) });
  });
  await ouvrir(page, 'devis/editeur/dBrouillon');
  await racine(page).locator('[data-action="finaliser"]').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Finaliser' }).click();
  await expect(page).toHaveURL(/#\/devis\/voir\/dBrouillon$/);
  await expect(racine(page)).toHaveClass(/devis-lecture-seule/);
  await expect(racine(page).locator('[data-valeur="lecture-seule"]')).toContainText('Ce devis est finalisé');
  await page.waitForTimeout(800);
  await expect(racine(page)).toHaveClass(/devis-lecture-seule/);
  await expect(racine(page).locator('[data-champ="objet"]')).toHaveAttribute('readonly', '');
});
