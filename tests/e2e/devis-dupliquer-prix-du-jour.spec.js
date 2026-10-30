// « Dupliquer aux prix du jour » (menu « … » de la liste et de l'éditeur des devis). Chez Jérôme (racine).
// Un test par point du brief (le nom commence par son numéro) : 1 l'entrée est dans le menu à côté de « Dupliquer », 2 liste : les prix du jour, les lignes disparues signalées, l'original intact,
// 3 éditeur : même entrée, copie de l'écran, 4 cas vide « Rien à recalculer », 5 devis finalisé (lecture seule).
// Cas d'erreur (écriture du contenu refusée) : même code que « Dupliquer » (dupliquerDevis) ; l'émulateur ne sait pas refuser une seule écriture, il n'est pas rejoué ici.
// Captures dans tests/e2e/captures/devis-dupliquer-prix-du-jour/ (ordinateur ET téléphone).
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, creerOrganisation, creerAffaire, JEROME } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-dupliquer-prix-du-jour/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
}
const menu = (page) => page.locator('.menu-pop');
const entree = (page, nom, exact = true) => menu(page).getByRole('menuitem', { name: nom, exact });
const maintenant = new Date();

async function article(id, valeurs = {}) {
  await ecrireDocument(`devis_articles/${id}`, {
    code: '', libelle: 'Article test', unite: 'u', prixAchat: 10, tauxTva: null, actif: true, proprietaire: JEROME,
    creeLe: maintenant, modifieLe: maintenant, creePar: JEROME, modifiePar: JEROME, ...valeurs,
  });
}
async function devis(id, valeurs = {}) {
  await ecrireDocument(`devis_devis/${id}`, {
    racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', personneId: null, organisationId: 'o1', modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: '2027-12-31', objet: 'Rénovation restaurant', destinataires: [],
    sections: [{ id: 's1', titre: 'Cuisine', lignes: [
      { id: 'l1', articleId: 'carrelage', libelle: 'Carrelage ancien', unite: 'm²', quantite: 4, prixAchat: 40, marge: 10, tauxTva: 20 },
      { id: 'l2', articleId: 'plinthe', libelle: 'Plinthe chêne', unite: 'ml', quantite: 3, prixAchat: 8, marge: 0, tauxTva: 20 },
      { id: 'l3', articleId: 'efface', libelle: 'Transport', unite: 'u', quantite: 1, prixAchat: 50, marge: 0, tauxTva: 20 },
    ] }],
    creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: new Date(Date.now() - 5 * 3600000), ...valeurs,
  });
}
async function donnees(valeursDevis = {}) {
  await creerOrganisation('o1', { nom: 'M. Paul Exemple' });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', organisationId: 'o1' });
  await article('carrelage', { libelle: 'Carrelage 2026', unite: 'm²', prixAchat: 60, marge: 30, tauxTva: 10 });
  await article('plinthe', { libelle: 'Plinthe chêne', unite: 'ml', prixAchat: 9, actif: false });
  await devis('d1', valeursDevis);
}
async function ouvrirListe(page) {
  await connecter(page, undefined, { route: 'devis/liste' });
  await expect(page.locator('.page-liste-devis')).toBeVisible();
  await attendreCalme(page);
}
const menuLigne = async (page, id) => { await page.locator(`tr.ligne-devis[data-id="${id}"] [data-action="menu-devis"]`).click(); await expect(menu(page)).toBeVisible(); };
const lignes = (page) => page.locator('tr.ligne-devis-edition');

test('1 le menu « … » de la liste propose « Dupliquer aux prix du jour » juste après « Dupliquer » (qui reste là)', async ({ page }, info) => {
  await donnees();
  await ouvrirListe(page);
  await menuLigne(page, 'd1');
  const libelles = (await menu(page).getByRole('menuitem').allTextContents()).map((t) => t.trim());
  const i = libelles.indexOf('Dupliquer');
  expect(i).toBeGreaterThan(-1);
  expect(libelles[i + 1]).toBe('Dupliquer aux prix du jour');
  await expect(entree(page, 'Dupliquer aux prix du jour')).toBeEnabled();
  await capturer(page, info, '1-menu-liste');
});

test('2 depuis la liste : un nouveau brouillon aux prix du jour (libellé, prix, TVA, quantité gardée), les lignes disparues gardées et listées avec leur numéro, l’original intact', async ({ page }, info) => {
  await donnees();
  await ouvrirListe(page);
  await menuLigne(page, 'd1');
  await entree(page, 'Dupliquer aux prix du jour').click();
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  const copie = page.url().split('/').pop();
  expect(copie).not.toBe('d1');
  await expect(lignes(page)).toHaveCount(3);
  const ligne = (n) => lignes(page).nth(n);
  await expect(ligne(0).locator('[data-champ="libelle"]')).toHaveValue('Carrelage 2026');
  await expect(ligne(0).locator('[data-champ="quantite"]')).toHaveValue('4');
  await expect(ligne(0).locator('[data-champ="prix-vente"]')).toHaveValue('78,00'); // 60 € d'achat + 30 % de marge d'article
  // Désactivé et supprimé du catalogue : gardés avec l'ancien prix.
  await expect(ligne(1).locator('[data-champ="libelle"]')).toHaveValue('Plinthe chêne');
  await expect(ligne(1).locator('[data-champ="prix-vente"]')).toHaveValue('8,00'); // l'ancien prix (8 € d'achat, marge 0), pas les 9 € du jour
  await expect(ligne(2).locator('[data-champ="libelle"]')).toHaveValue('Transport');
  const message = page.locator('.toast').last();
  await expect(message).toContainText('2 lignes n’existent plus dans le catalogue : 1.2 Plinthe chêne, 1.3 Transport');
  await expect(message).toContainText('gardent leur ancien prix, à vérifier');
  await expect(message).toContainText('ne sont pas repris');
  await capturer(page, info, '2-aux-prix-du-jour');
  // L'original n'a pas bougé.
  await page.goBack();
  await expect(page.locator('.page-liste-devis')).toBeVisible();
  await menuLigne(page, 'd1');
  await entree(page, 'Éditer le devis').click();
  await expect(page.locator('.page-editeur-devis[data-devis="d1"]')).toBeVisible();
  await expect(lignes(page).first().locator('[data-champ="libelle"]')).toHaveValue('Carrelage ancien');
});

test('3 depuis l’éditeur : même entrée, et elle copie ce qui est à l’écran (modification non enregistrée comprise)', async ({ page }, info) => {
  await donnees();
  await connecter(page, undefined, { route: 'devis/editeur/d1' });
  await expect(page.locator('.page-editeur-devis[data-devis="d1"]')).toBeVisible();
  await attendreCalme(page);
  await lignes(page).first().locator('[data-champ="quantite"]').fill('9');
  await page.locator('[data-action="plus-actions"]').click();
  await expect(menu(page)).toBeVisible();
  await expect(entree(page, 'Dupliquer aux prix du jour')).toBeEnabled();
  await capturer(page, info, '3-menu-editeur');
  await entree(page, 'Dupliquer aux prix du jour').click();
  await expect(page.locator('.page-editeur-devis[data-devis]:not([data-devis="d1"])')).toBeVisible();
  await expect(lignes(page).first().locator('[data-champ="quantite"]')).toHaveValue('9');
  await expect(lignes(page).first().locator('[data-champ="libelle"]')).toHaveValue('Carrelage 2026');
  await expect(page.locator('.toast').last()).toContainText('n’existent plus dans le catalogue');
});

test('4 cas vide : un devis sans ligne donne un brouillon vide et le message « Rien à recalculer »', async ({ page }, info) => {
  await donnees({ sections: [] });
  await ouvrirListe(page);
  await menuLigne(page, 'd1');
  await entree(page, 'Dupliquer aux prix du jour').click();
  await expect(page.locator('.page-editeur-devis[data-devis]:not([data-devis="d1"])')).toBeVisible();
  await expect(lignes(page)).toHaveCount(0);
  await expect(page.locator('.toast').last()).toContainText('Rien à recalculer');
  await capturer(page, info, '4-cas-vide');
});

test('5 un devis envoyé (lecture seule) se duplique aussi aux prix du jour : le nouveau brouillon est modifiable et sans numéro', async ({ page }, info) => {
  await donnees({ numero: 'DEV-2026-10-01-004', statut: 'envoye', finaliseLe: new Date(Date.now() - 5 * 86400000), envoyeLe: new Date(Date.now() - 4 * 86400000) });
  await ouvrirListe(page);
  await menuLigne(page, 'd1');
  await expect(entree(page, 'Dupliquer aux prix du jour')).toBeEnabled();
  await capturer(page, info, '5-menu-devis-envoye');
  await entree(page, 'Dupliquer aux prix du jour').click();
  await expect(page.locator('.page-editeur-devis[data-devis]:not([data-devis="d1"])')).toBeVisible();
  await expect(page.locator('[data-valeur="numero-devis"]')).toContainText('Brouillon');
  await expect(page.locator('.page-editeur-devis.devis-lecture-seule')).toHaveCount(0);
  await expect(lignes(page).first().locator('[data-champ="libelle"]')).toHaveValue('Carrelage 2026');
});
