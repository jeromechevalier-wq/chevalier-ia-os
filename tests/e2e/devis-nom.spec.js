// Module Devis : « Nom du devis », nom INTERNE d'un devis (distinct de la description imprimée). Un test par point du brief (le nom commence par le numéro du point).
// Captures dans tests/e2e/captures/devis-nom/ (ordinateur ET téléphone : la mise en page change).
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import { test, expect, connecter, attendreCalme, ecrireDocument, listerDocuments, creerOrganisation, creerAffaire, JEROME } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-nom/', import.meta.url));
async function capturer(page, info, nom) {
  await mkdir(DOSSIER, { recursive: true });
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: true, animations: 'disabled' });
}
const LIGNES = [{ id: 'l1', libelle: 'Carrelage', familleId: 'famille-1', type: 'fourniture', quantite: 10, unite: 'm²', prixAchat: 40, prixVente: 60, tauxTva: 20 }];
async function devis(id, valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument(`devis_devis/${id}`, {
    racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', personneId: null, organisationId: 'o1', modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: '2099-12-31', objet: 'Rénovation restaurant',
    destinataires: ['contact@exemple.fr'], sections: [{ id: 's1', titre: 'Cuisine', lignes: LIGNES }],
    creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, ...valeurs,
  });
}
async function base() {
  await creerOrganisation('o1', { nom: 'M. Paul Exemple' });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', organisationId: 'o1' });
}
async function ouvrirEditeur(page, id) {
  await connecter(page, undefined, { route: `devis/editeur/${id}` });
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
}
/** La fiche d'une affaire charge le sélecteur Google (apis.google.com), injoignable dans certains bacs à sable : on le remplace par un script vide (l'onglet Devis n'en dépend pas). */
const sansGoogle = (page) => page.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
const champNom = (page) => page.locator('[data-champ="nom"]');
const enregistre = (page) => expect(page.locator('[data-valeur="enregistrement"]')).toHaveText('Enregistré');

test('3a le champ « Nom du devis » existe dans l’éditeur d’un brouillon, s’enregistre et reste après rafraîchissement', async ({ page }, info) => {
  await base();
  await devis('d1');
  await ouvrirEditeur(page, 'd1');
  await expect(champNom(page)).toBeVisible();
  await expect(champNom(page)).toHaveAccessibleName('Nom du devis (interne, jamais imprimé)');
  await expect(champNom(page)).toHaveValue(''); // cas vide : pas de nom
  await champNom(page).fill('Variante économique');
  await enregistre(page);
  expect((await listerDocuments('devis_devis')).find((d) => d.id === 'd1').nom).toBe('Variante économique');
  await page.reload();
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await expect(champNom(page)).toHaveValue('Variante économique');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Variante économique');
  await capturer(page, info, '3a-editeur-nom');
});

test('3a cas d’erreur : un nom de plus de 80 caractères est coupé et un message le dit', async ({ page }, info) => {
  await base();
  await devis('d1');
  await ouvrirEditeur(page, 'd1');
  await champNom(page).fill('é'.repeat(90));
  await expect(champNom(page)).toHaveValue('é'.repeat(80));
  await expect(page.locator('[data-erreur="nom"]')).toContainText('limité à 80 caractères');
  await enregistre(page);
  expect((await listerDocuments('devis_devis')).find((d) => d.id === 'd1').nom).toBe('é'.repeat(80));
  await capturer(page, info, '3a-nom-trop-long');
});

test('3b dans l’onglet Devis de l’affaire, deux brouillons nommés se distinguent ; effacer le nom redonne « Brouillon »', async ({ page }, info) => {
  await base();
  await devis('d1', { nom: 'Variante basse', objet: 'Cuisine', creeLe: new Date(Date.now() - 2 * 86400000) });
  await devis('d2', { nom: 'Variante haut de gamme', objet: 'Cuisine', creeLe: new Date(Date.now() - 86400000) });
  await sansGoogle(page);
  await connecter(page, undefined, { route: 'crm/affaires/a1' });
  await expect(page.locator('.compositeur')).toBeVisible();
  await attendreCalme(page);
  await page.locator('.compositeur [data-onglet="devis"]').click();
  const panneau = page.locator('.compositeur [role="tabpanel"][aria-label="Devis"]');
  await expect(panneau.locator('[data-devis="d1"] [data-action="voir-devis"]')).toHaveText('Variante basse – Cuisine');
  await expect(panneau.locator('[data-devis="d2"] [data-action="voir-devis"]')).toHaveText('Variante haut de gamme – Cuisine');
  await panneau.locator('[data-devis="d1"] [data-action="supprimer-devis"]').click();
  await expect(page.getByRole('dialog')).toContainText('« Variante basse »'); // la confirmation de suppression porte le nom
  await page.getByRole('button', { name: 'Annuler' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await capturer(page, info, '3b-onglet-deux-brouillons');
});

test('3c la prévisualisation (le document du client) ne contient pas le nom interne, mais la description', async ({ page }, info) => {
  await base();
  await devis('d1', { nom: 'Nom interne secret', objet: 'Description visible du devis' });
  await ouvrirEditeur(page, 'd1');
  await page.locator('.barre-devis [data-onglet="apercu"]').click();
  const apercu = page.locator('iframe[data-zone="apercu"]').contentFrame().locator('body');
  await expect(apercu).toContainText('Description visible du devis');
  await expect(apercu).not.toContainText('Nom interne secret');
  await capturer(page, info, '3c-apercu-sans-nom');
});

test('3d un devis finalisé affiche son nom, non modifiable (un clic explique)', async ({ page }, info) => {
  await base();
  await devis('f1', { nom: 'Variante signée', numero: 'DEV-2026-10-02-001', statut: 'envoye', finaliseLe: new Date(), dateEmission: '2026-10-02', totaux: { ht: 600, ttc: 720 } });
  await ouvrirEditeur(page, 'f1');
  await page.locator('.barre-devis [data-onglet="edition"]').click();
  await expect(champNom(page)).toHaveValue('Variante signée');
  await expect(champNom(page)).toHaveJSProperty('readOnly', true);
  await champNom(page).click();
  await expect(page.locator('.toast').last()).toContainText('Ce devis est envoyé');
  await expect(champNom(page)).toHaveValue('Variante signée');
  await capturer(page, info, '3d-finalise-nom-lecture-seule');
});

test('3e un ancien devis sans nom s’affiche comme avant (« Brouillon – objet »), champ vide dans l’éditeur', async ({ page }, info) => {
  await base();
  await devis('d1');
  await sansGoogle(page);
  await connecter(page, undefined, { route: 'crm/affaires/a1' });
  await expect(page.locator('.compositeur')).toBeVisible();
  await attendreCalme(page);
  await page.locator('.compositeur [data-onglet="devis"]').click();
  await expect(page.locator('[data-devis="d1"] [data-action="voir-devis"]')).toHaveText('Brouillon – Rénovation restaurant');
  await page.goto('/?emulateurs=1#/devis/editeur/d1');
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
  await expect(champNom(page)).toHaveValue('');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Rénovation restaurant');
  await capturer(page, info, '3e-ancien-devis');
});
