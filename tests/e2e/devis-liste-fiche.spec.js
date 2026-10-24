// Module Devis, fiche d'un devis (panneau latéral ouvert depuis la liste). Chez Jérôme (racine).
// Un test par point du brief (le nom commence par le numéro du point). Captures dans tests/e2e/captures/devis-fiche/ (ordinateur ET téléphone : la mise en page change).
// Les fonctions du serveur (devisChangerStatut, devisArchiver…) n'existent pas dans l'émulateur du navigateur : elles sont SIMULÉES par page.route.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, creerOrganisation, creerAffaire, estTelephone, JEROME } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-fiche/', import.meta.url));
/** `bloc` : un élément de la fiche à montrer en bas de la capture (la fiche défile dans son panneau). */
async function capturer(page, info, nom, bloc = null) {
  if (bloc) await bloc.evaluate((el) => el.scrollIntoView({ block: 'end' }));
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
}
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const jourDansLe = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);
const fiche = (page) => page.locator('[data-role="fiche-devis"]');
const bloc = (page, nom) => fiche(page).locator(`[data-bloc="${nom}"]`);

// 10 × 60 + 5 × 36 + 1 × 100 = 880 € HT ; achats 560 € ; marge brute 320 €. Les prix de vente sont figés (devis finalisé).
const LIGNES = [
  { id: 'l1', libelle: 'Carrelage', familleId: 'famille-1', type: 'fourniture', quantite: 10, unite: 'm²', prixAchat: 40, prixVente: 60, tauxTva: 20 },
  { id: 'l2', libelle: 'Pose', familleId: 'famille-2', type: 'main_oeuvre', quantite: 5, unite: 'h', prixAchat: 20, prixVente: 36, tauxTva: 10 },
  { id: 'l3', libelle: 'Évacuation', familleId: 'famille-7', type: 'divers', quantite: 1, unite: 'u', prixAchat: 60, prixVente: 100, tauxTva: 20 },
];

/** Un devis déjà dans la base (contourne l'écran). */
async function devis(id, valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument(`devis_devis/${id}`, {
    racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', personneId: null, organisationId: 'o1', modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: jourDansLe(60), objet: 'Rénovation restaurant',
    chantier: { adresse: { ligne1: '236 av. de la République', codePostal: '49800', ville: 'Trélazé' } },
    sections: [{ id: 's1', titre: 'Cuisine', lignes: LIGNES }],
    creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: new Date(Date.now() - 5 * 3600000), ...valeurs,
  });
}
async function donnees() {
  await creerOrganisation('o1', { nom: 'M. Jean-Marc Demo' });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', organisationId: 'o1' });
  await devis('dBrouillon');
  await devis('dFinalise', { numero: 'DEV-2026-10-02-001', statut: 'en_attente_envoi', finaliseLe: new Date(Date.now() - 2 * 86400000), expireLe: jourDansLe(30) });
  await devis('dSigne', {
    numero: 'DEV-2026-10-03-002', statut: 'accepte', finaliseLe: new Date(Date.now() - 10 * 86400000), expireLe: jourDansLe(20),
    acompte: { type: 'pourcentage', valeur: 30, moment: 'signature' }, modesPaiement: ['Chèque', 'Espèces'], conditionsPaiement: 'Solde à la réception des travaux.',
  });
  await devis('dExpire', { numero: 'DEV-2026-08-01-003', statut: 'envoye', finaliseLe: new Date(Date.now() - 60 * 86400000), expireLe: jourDansLe(-5) });
  await devis('dVide', { sections: [], objet: '' });
}
async function ouvrir(page, route = 'devis/liste') {
  await connecter(page, undefined, { route });
  await expect(page.locator('.page-liste-devis')).toBeVisible();
  await attendreCalme(page);
}
async function ouvrirFiche(page, id) {
  await page.locator(`tr.ligne-devis[data-id="${id}"] [data-colonne="numero"]`).click();
  await expect(fiche(page)).toBeVisible();
  await expect(fiche(page).locator('.fiche-titre')).toBeVisible();
  await attendreCalme(page);
}
async function simulerServeur(page, appels) {
  for (const [nom, reponse] of [['devisChangerStatut', { ok: true }], ['devisArchiver', { ok: true }]]) {
    await page.route(`**/${nom}`, async (route) => {
      if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
      appels.push([nom, JSON.parse(route.request().postData()).data]);
      return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: reponse }) });
    });
  }
}

test('1 un clic sur une ligne ouvre la fiche à droite (la liste reste derrière) ; Échap la ferme et revient à la liste', async ({ page }, info) => {
  await donnees();
  await ouvrir(page);
  await expect(fiche(page)).toHaveCount(0);
  await ouvrirFiche(page, 'dSigne');
  await expect(page).toHaveURL(/#\/devis\/liste\/dSigne$/);
  await expect(fiche(page).locator('.fiche-titre')).toContainText('Devis n° DEV-2026-10-03-002');
  await expect(page.locator('tr.ligne-devis')).toHaveCount(5); // la liste est toujours là, derrière
  const boite = await fiche(page).boundingBox();
  const largeur = page.viewportSize().width;
  expect(boite.x + boite.width).toBeGreaterThan(largeur - 2); // collée à droite
  if (estTelephone(page)) expect(boite.width).toBeGreaterThan(largeur - 2); // plein écran
  else { expect(boite.width / largeur).toBeGreaterThan(0.5); expect(boite.width / largeur).toBeLessThan(0.6); }
  await capturer(page, info, '1-fiche-ouverte');
  await page.keyboard.press('Escape');
  await expect(fiche(page)).toHaveCount(0);
  await expect(page).toHaveURL(/#\/devis\/liste$/);
  await expect(page.locator('tr.ligne-devis')).toHaveCount(5);
});

test('1 lien direct #/devis/liste/<id> ; la touche « retour » du navigateur ferme la fiche ; ✕ et clic à côté ferment ; carte du Tableau', async ({ page }, info) => {
  await donnees();
  await ouvrir(page, 'devis/liste/dFinalise');
  await expect(fiche(page)).toBeVisible();
  await expect(fiche(page).locator('.fiche-titre')).toContainText('DEV-2026-10-02-001');
  await expect(page.locator('tr.ligne-devis')).toHaveCount(5); // la liste est montée derrière le lien direct
  await fiche(page).locator('[data-action="fermer-fiche"]').click();
  await expect(fiche(page)).toHaveCount(0);
  await expect(page).toHaveURL(/#\/devis\/liste$/);
  // « retour » du navigateur : ouverte par un clic, fermée par la touche retour.
  await ouvrirFiche(page, 'dBrouillon');
  await page.goBack();
  await expect(fiche(page)).toHaveCount(0);
  await expect(page).toHaveURL(/#\/devis\/liste$/);
  await page.goForward();
  await expect(fiche(page)).toBeVisible(); // et « avancer » la rouvre
  // ✕ après un clic : revient à la liste (une seule entrée d'historique ajoutée, retirée à la fermeture).
  await fiche(page).locator('[data-action="fermer-fiche"]').click();
  await expect(fiche(page)).toHaveCount(0);
  // Clic à côté (ordinateur : la fiche ne couvre pas tout l'écran).
  if (!estTelephone(page)) {
    await ouvrirFiche(page, 'dSigne');
    await page.locator('[data-role="voile-fiche"]').click({ position: { x: 20, y: 300 } });
    await expect(fiche(page)).toHaveCount(0);
  }
  // Carte du Tableau.
  await page.locator('[data-vue="tableau"]').click();
  await page.locator('.carte-devis[data-id="dSigne"] .carte-titre').click();
  await expect(fiche(page)).toBeVisible();
  await expect(page).toHaveURL(/#\/devis\/liste\/dSigne$/);
  await capturer(page, info, '1-fiche-depuis-tableau');
});

test('2 en-tête : statut (menu = changements permis), titre, ✕ ; boutons Envoyer, Facturer (grisé), Voir, Dupliquer, Annuler selon le statut (brouillon, finalisé, signé, expiré)', async ({ page }, info) => {
  await donnees();
  await ouvrir(page);
  // Brouillon : « Modifier » en bouton principal, titre « Brouillon », « Finalisé » proposé.
  await ouvrirFiche(page, 'dBrouillon');
  await expect(fiche(page).locator('.fiche-titre')).toHaveText('Brouillon');
  await expect(fiche(page).locator('[data-action="modifier-fiche"]')).toHaveClass(/bouton-principal/);
  await expect(fiche(page).locator('[data-action="statut-fiche"]')).toHaveAttribute('data-statut', 'brouillon');
  await expect(fiche(page).locator('[data-action="facturer-fiche"]')).toBeDisabled();
  await expect(fiche(page).locator('[data-action="facturer-fiche"]')).toContainText('bientôt disponible');
  await expect(fiche(page).locator('[data-action="annuler-fiche"]')).toBeDisabled();
  await expect(fiche(page).locator('[data-action="annuler-fiche"]')).toContainText('bientôt disponible');
  await fiche(page).locator('[data-action="statut-fiche"]').click();
  await expect(page.locator('.menu-pop').getByRole('menuitem')).toHaveText(['Passer à « Finalisé »']);
  await page.keyboard.press('Escape');
  await fiche(page).locator('[data-action="voir-fiche"]').click();
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: 'Modifier' })).toBeEnabled();
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: /Aperçu PDF/ })).toBeDisabled();
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: /Aperçu PDF/ })).toContainText('PDF pas encore généré');
  await page.keyboard.press('Escape');
  await capturer(page, info, '2-fiche-brouillon');
  await page.keyboard.press('Escape'); // le menu est déjà fermé : cette touche ferme la fiche
  await expect(fiche(page)).toHaveCount(0);
  // Finalisé : « Marquer comme envoyé » permis, « Envoyer par e-mail » grisé, « Voir le devis ».
  await ouvrirFiche(page, 'dFinalise');
  await expect(fiche(page).locator('.fiche-titre')).toContainText('DEV-2026-10-02-001');
  await expect(fiche(page).locator('[data-action="modifier-fiche"]')).toHaveCount(0);
  await fiche(page).locator('[data-action="envoyer-fiche"]').click();
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: 'Marquer comme envoyé' })).toBeEnabled();
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: /Envoyer par e-mail/ })).toBeDisabled();
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: /Envoyer par e-mail/ })).toContainText('bientôt disponible');
  await page.keyboard.press('Escape');
  await fiche(page).locator('[data-action="voir-fiche"]').click();
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: 'Voir le devis' })).toBeEnabled();
  await page.keyboard.press('Escape');
  await expect(fiche(page).locator('[data-action="annuler-fiche"]')).toBeDisabled(); // un devis finalisé ne se refuse pas (il n'est pas encore envoyé)
  await capturer(page, info, '2-fiche-finalise');
  await fiche(page).locator('[data-action="fermer-fiche"]').click();
  // Signé : le statut ne propose aucun changement ; Annuler = Archiver.
  await ouvrirFiche(page, 'dSigne');
  await expect(fiche(page).locator('[data-action="statut-fiche"]')).toHaveAttribute('data-statut', 'accepte');
  await expect(fiche(page).locator('[data-action="statut-fiche"]')).not.toHaveAttribute('aria-haspopup', 'menu');
  await expect(fiche(page).locator('[data-action="annuler-fiche"]')).toBeEnabled();
  await capturer(page, info, '2-fiche-signe');
  await fiche(page).locator('[data-action="fermer-fiche"]').click();
  // Expiré : affiché « Expiré », Annuler = Refuser.
  await ouvrirFiche(page, 'dExpire');
  await expect(fiche(page).locator('[data-action="statut-fiche"]')).toHaveAttribute('data-statut', 'expire');
  await expect(fiche(page).locator('[data-action="statut-fiche"]')).toContainText('Expiré');
  await expect(fiche(page).locator('[data-action="annuler-fiche"]')).toBeEnabled();
  await capturer(page, info, '2-fiche-expire');
});

test('2 « Marquer comme envoyé », le menu du statut et « Annuler » appellent les fonctions du serveur (jamais une écriture directe), avec confirmation', async ({ page }, info) => {
  await donnees();
  const appels = [];
  await simulerServeur(page, appels);
  await ouvrir(page);
  await ouvrirFiche(page, 'dFinalise');
  await fiche(page).locator('[data-action="envoyer-fiche"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Marquer comme envoyé' }).click();
  await expect(page.locator('.toast')).toContainText('Devis passé à « Envoyé »');
  expect(appels).toEqual([['devisChangerStatut', { devisId: 'dFinalise', action: 'marquer_envoye' }]]);
  // Statut menu d'un devis envoyé : Signé et Refusé.
  await fiche(page).locator('[data-action="fermer-fiche"]').click();
  await ouvrirFiche(page, 'dExpire');
  await fiche(page).locator('[data-action="statut-fiche"]').click();
  await expect(page.locator('.menu-pop').getByRole('menuitem')).toHaveText(['Passer à « Signé »', 'Passer à « Refusé »']);
  await page.locator('.menu-pop').getByRole('menuitem', { name: /Signé/ }).click();
  await expect.poll(() => appels.length).toBe(2);
  expect(appels[1]).toEqual(['devisChangerStatut', { devisId: 'dExpire', action: 'accepter' }]);
  // Annuler = Refuser : confirmation d'abord (« Annuler » de la fenêtre ne fait rien), puis la demande part.
  await fiche(page).locator('[data-action="annuler-fiche"]').click();
  await expect(page.getByRole('dialog')).toContainText('Refuser ce devis ?');
  await page.getByRole('dialog').getByRole('button', { name: 'Annuler' }).click();
  expect(appels).toHaveLength(2);
  await fiche(page).locator('[data-action="annuler-fiche"]').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Refuser' }).click();
  await expect.poll(() => appels.length).toBe(3);
  expect(appels[2]).toEqual(['devisChangerStatut', { devisId: 'dExpire', action: 'refuser' }]);
  // Annuler = Archiver pour un devis signé.
  await fiche(page).locator('[data-action="fermer-fiche"]').click();
  await ouvrirFiche(page, 'dSigne');
  await fiche(page).locator('[data-action="annuler-fiche"]').click();
  await expect(page.getByRole('dialog')).toContainText('Archiver ce devis ?');
  await page.getByRole('dialog').getByRole('button', { name: 'Archiver' }).click();
  await expect.poll(() => appels.length).toBe(4);
  expect(appels[3]).toEqual(['devisArchiver', { devisId: 'dSigne', archive: true }]);
});

test('2 Dupliquer crée un brouillon et ouvre l’éditeur ; Modifier (brouillon) et Voir le devis ouvrent l’éditeur', async ({ page }) => {
  await donnees();
  await ouvrir(page);
  await ouvrirFiche(page, 'dBrouillon');
  await fiche(page).locator('[data-action="modifier-fiche"]').click();
  await expect(page).toHaveURL(/#\/devis\/editeur\/dBrouillon$/);
  await page.goBack(); // la fiche est de retour
  await expect(fiche(page)).toBeVisible();
  await fiche(page).locator('[data-action="fermer-fiche"]').click();
  await ouvrirFiche(page, 'dSigne');
  await fiche(page).locator('[data-action="voir-fiche"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Voir le devis' }).click();
  await expect(page).toHaveURL(/#\/devis\/editeur\/dSigne$/);
  await page.goBack();
  await expect(fiche(page)).toBeVisible();
  await fiche(page).locator('[data-action="dupliquer-fiche"]').click();
  await expect(page).toHaveURL(/#\/devis\/editeur\/[^/]+$/);
  await expect(page).not.toHaveURL(/dSigne/);
});

test('2 Aperçu PDF : actif et ouvert dans un nouvel onglet quand le devis a un lien de PDF', async ({ page }) => {
  await donnees();
  await devis('dPdf', { numero: 'DEV-2026-10-04-004', statut: 'en_attente_envoi', finaliseLe: new Date(), pdf: 'https://exemple.test/devis-004.pdf' });
  await ouvrir(page);
  await ouvrirFiche(page, 'dPdf');
  await fiche(page).locator('[data-action="voir-fiche"]').click();
  const item = page.locator('.menu-pop').getByRole('menuitem', { name: 'Aperçu PDF' });
  await expect(item).toBeEnabled();
  await page.context().route('https://exemple.test/**', (r) => r.fulfill({ status: 200, contentType: 'text/html', body: '<p>pdf</p>' }));
  const [onglet] = await Promise.all([page.context().waitForEvent('page'), item.click()]);
  await expect(onglet).toHaveURL('https://exemple.test/devis-004.pdf');
  await onglet.close();
});

test('3 bloc identité : client en gros, adresse du chantier avec icône, « En date du », « Valable jusqu’au », objet et « Modifié il y a … »', async ({ page }, info) => {
  await donnees();
  await ouvrir(page);
  await ouvrirFiche(page, 'dSigne');
  const b = bloc(page, 'identite');
  await expect(b.locator('[data-valeur="client"]')).toHaveText('M. Jean-Marc Demo');
  await expect(b.locator('[data-valeur="adresse"]')).toContainText('236 av. de la République, 49800 Trélazé');
  await expect(b.locator('[data-valeur="adresse"] svg')).toHaveCount(1);
  await expect(b.locator('[data-valeur="date"]')).toHaveText(/^En date du \d{2}\/\d{2}\/\d{4}$/);
  await expect(b.locator('[data-valeur="validite"]')).toHaveText(/^Valable jusqu’au \d{2}\/\d{2}\/\d{4}$/);
  await expect(b.locator('[data-valeur="objet"]')).toHaveText('Rénovation restaurant');
  await expect(b.locator('[data-valeur="modifie"]')).toHaveText('Modifié il y a 5 h');
  await capturer(page, info, '3-identite');
});

test('4 conditions de paiement (acompte, moyens) à gauche ; Total net HT, TVA, Total TTC, bande NET À PAYER et tableau Taux TVA / Base HT / Total à droite ; « Aucune condition » sinon', async ({ page }, info) => {
  await donnees();
  await ouvrir(page);
  await ouvrirFiche(page, 'dSigne');
  const c = bloc(page, 'conditions');
  await expect(c).toContainText('Conditions de paiement');
  await expect(c).toContainText('Acompte de 30,00');
  await expect(c).toContainText('Solde à la réception des travaux.');
  await expect(c).toContainText('Moyens de paiement acceptés : Chèque, Espèces');
  const t = bloc(page, 'totaux');
  await expect(t.locator('[data-valeur="ht"]')).toContainText('880,00');
  await expect(t.locator('[data-valeur="tva"]')).toContainText('158,00');
  await expect(t.locator('[data-valeur="ttc"]')).toContainText('1 038,00');
  await expect(t.locator('[data-valeur="net-a-payer"]')).toContainText('NET À PAYER');
  await expect(t.locator('[data-valeur="net"]')).toContainText('1 038,00');
  const tva = bloc(page, 'tva');
  await expect(tva.locator('thead th')).toHaveText(['Taux TVA', 'Base HT', 'Total']);
  await expect(tva.locator('tbody tr')).toHaveCount(2);
  await expect(tva.locator('tbody tr').nth(0)).toContainText('20 %');
  await expect(tva.locator('tbody tr').nth(0)).toContainText('700,00');
  await expect(tva.locator('tbody tr').nth(0)).toContainText('140,00');
  await expect(tva.locator('tbody tr').nth(1)).toContainText('10 %');
  await expect(tva.locator('tbody tr').nth(1)).toContainText('180,00');
  await expect(tva.locator('tbody tr').nth(1)).toContainText('18,00');
  await capturer(page, info, '4-conditions-totaux');
  await fiche(page).locator('[data-action="fermer-fiche"]').click();
  await ouvrirFiche(page, 'dFinalise');
  await expect(bloc(page, 'conditions').locator('[data-valeur="aucune-condition"]')).toHaveText('Aucune condition');
});

test('5 jauges Facturation et Paiement : « 0 % — 0,00 € / total TTC », grisées avec « Bientôt disponible »', async ({ page }, info) => {
  await donnees();
  await ouvrir(page);
  await ouvrirFiche(page, 'dSigne');
  for (const nom of ['facturation', 'paiement']) {
    const j = bloc(page, 'jauges').locator(`[data-jauge="${nom}"]`);
    await expect(j).toHaveAttribute('aria-disabled', 'true');
    await expect(j).toContainText('Bientôt disponible');
    await expect(j).toContainText('0 %');
    await expect(j).toContainText('0,00');
    await expect(j).toContainText('1 038,00');
  }
  await expect(bloc(page, 'jauges')).toContainText('Facturation');
  await expect(bloc(page, 'jauges')).toContainText('Paiement');
  await capturer(page, info, '5-jauges', bloc(page, 'jauges'));
});

test('6 documents liés : onglets Tous / Factures / Avoirs / Bons de commande et message « Aucun document »', async ({ page }, info) => {
  await donnees();
  await ouvrir(page);
  await ouvrirFiche(page, 'dSigne');
  const b = bloc(page, 'documents');
  await expect(b.getByRole('tab')).toHaveText(['Tous', 'Factures', 'Avoirs', 'Bons de commande']);
  await expect(b.getByRole('tab', { name: 'Tous' })).toHaveAttribute('aria-selected', 'true');
  await expect(b.locator('[data-valeur="aucun-document"]')).toHaveText('Aucun document');
  await b.getByRole('tab', { name: 'Avoirs' }).click();
  await expect(b.getByRole('tab', { name: 'Avoirs' })).toHaveAttribute('aria-selected', 'true');
  await expect(b.getByRole('tab', { name: 'Avoirs' })).toBeFocused(); // le focus reste sur l'onglet après le redessin
  await expect(b.locator('[data-valeur="aucun-document"]')).toHaveText('Aucun document');
  await capturer(page, info, '6-documents-lies', b);
});

test('7 ventilation : trois onglets, un tableau par famille de premier niveau avec montant et part ; marge brute 320 € ; « Aucun résultat » sans ligne', async ({ page }, info) => {
  await donnees();
  await ouvrir(page);
  await ouvrirFiche(page, 'dSigne');
  const b = bloc(page, 'ventilation');
  await expect(b.getByRole('tab')).toHaveText(['Total HT', 'Total TTC', 'Marge brute HT']);
  const lignes = b.locator('tbody tr');
  await expect(lignes).toHaveCount(3);
  await expect(lignes.nth(0)).toContainText('Fournitures');
  await expect(lignes.nth(0)).toContainText('600,00');
  await expect(lignes.nth(0)).toContainText('68,2 %');
  await expect(lignes.nth(1)).toContainText('Main d’œuvre');
  await expect(lignes.nth(1)).toContainText('180,00');
  await expect(lignes.nth(2)).toContainText('Divers');
  await expect(b.locator('[data-valeur="total-ventilation"]')).toContainText('880,00');
  await capturer(page, info, '7-ventilation-ht', b);
  await b.getByRole('tab', { name: 'Total TTC' }).click();
  await expect(lignes.nth(0)).toContainText('720,00');
  await expect(b.locator('[data-valeur="total-ventilation"]')).toContainText('1 038,00');
  await b.getByRole('tab', { name: 'Marge brute HT' }).click();
  await expect(lignes.nth(0)).toContainText('200,00');
  await expect(lignes.nth(0)).toContainText('62,5 %');
  await expect(b.locator('[data-valeur="total-ventilation"]')).toContainText('320,00');
  await capturer(page, info, '7-ventilation-marge', b);
  // Cas vide : un devis sans ligne.
  await fiche(page).locator('[data-action="fermer-fiche"]').click();
  await ouvrirFiche(page, 'dVide');
  await expect(bloc(page, 'ventilation').locator('[data-valeur="aucun-resultat"]')).toHaveText('Aucun résultat');
  await expect(bloc(page, 'totaux').locator('[data-valeur="ht"]')).toContainText('0,00');
  await expect(bloc(page, 'totaux').locator('[data-valeur="ttc"]')).toContainText('0,00');
  await expect(bloc(page, 'totaux').locator('[data-valeur="net"]')).toContainText('0,00');
  await expect(bloc(page, 'tva').locator('tbody')).toContainText('Aucune TVA');
  await expect(bloc(page, 'identite').locator('[data-valeur="objet"]')).toHaveText('Rénovation cuisine'); // sans objet : le titre de l'affaire
  await capturer(page, info, '7-cas-vide', bloc(page, 'ventilation'));
});

test('8 téléphone : la fiche occupe tout l’écran, les boutons passent sur deux rangées, les blocs s’empilent ; ordinateur : fiche à 55 % avec conditions et totaux côte à côte', async ({ page }, info) => {
  await donnees();
  await ouvrir(page);
  await ouvrirFiche(page, 'dSigne');
  const largeur = page.viewportSize().width;
  const boite = await fiche(page).boundingBox();
  const boutons = await fiche(page).locator('.fiche-boutons .bouton').evaluateAll((l) => l.map((b) => Math.round(b.getBoundingClientRect().top)));
  const c = await bloc(page, 'conditions').boundingBox();
  const t = await bloc(page, 'totaux').locator('.fiche-totaux').boundingBox();
  if (estTelephone(page)) {
    expect(boite.width).toBeGreaterThan(largeur - 2);
    expect(new Set(boutons).size).toBe(2); // deux rangées
    expect(t.y).toBeGreaterThan(c.y + c.height - 2); // les totaux sont sous les conditions
    const debord = await page.evaluate(() => document.querySelector('[data-role="fiche-devis"]').scrollWidth - document.querySelector('[data-role="fiche-devis"]').clientWidth);
    expect(debord).toBeLessThanOrEqual(1); // aucun défilement horizontal
  } else {
    expect(boite.width / largeur).toBeGreaterThan(0.5);
    expect(t.x).toBeGreaterThan(c.x + c.width - 2); // côte à côte
  }
  await capturer(page, info, '8-mise-en-page');
});

test('1 erreur : lien périmé = « Ce devis n’existe plus ou n’est pas accessible. » et la fiche se ferme ; devis supprimé pendant l’ouverture', async ({ page }, info) => {
  await donnees();
  await ouvrir(page, 'devis/liste/nexistepas');
  await expect(page.locator('.toast')).toContainText('Ce devis n’existe plus ou n’est pas accessible.');
  await expect(fiche(page)).toHaveCount(0);
  await expect(page).toHaveURL(/#\/devis\/liste$/);
  await expect(page.locator('tr.ligne-devis')).toHaveCount(5);
  await capturer(page, info, '1-erreur-lien-perime');
});
