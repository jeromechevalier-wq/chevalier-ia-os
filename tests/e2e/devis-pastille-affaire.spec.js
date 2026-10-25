// Pastille « Devis : … » sur la carte d'affaire (Kanban) et la fiche de l'affaire. Chez Jérôme (racine). Captures : impossibles en session cloud.
import { test, expect, connecter, attendreCalme, ecrireDocument, creerAffaire, JEROME } from './outils.js';

const JOUR = 86400000;
async function devis(id, valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument(`devis_devis/${id}`, {
    racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: null, personneId: null, organisationId: null, modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: new Date(Date.now() + 60 * JOUR).toISOString().slice(0, 10),
    sections: [{ id: 's1', titre: 'Cuisine', lignes: [{ id: 'l1', libelle: 'Carrelage', quantite: 2, unite: 'm²', prixAchat: 50 }] }],
    creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, ...valeurs,
  });
}
async function ouvrirKanban(page) {
  await connecter(page, undefined, { route: 'crm/affaires' });
  await attendreCalme(page);
}
const pastille = (page, id) => page.locator(`.carte-affaire[data-affaire="${id}"] .pastille-externe`);

test('1 la carte d’une affaire dont le devis est un brouillon montre « Devis : Brouillon »', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Cuisine Martin' });
  await devis('d1', { affaireId: 'a1' });
  await ouvrirKanban(page);
  await expect(pastille(page, 'a1')).toHaveText('Devis : Brouillon');
});

test('2 le devis envoyé il y a 3 jours donne « Devis : Envoyé il y a 3 jours » sur la carte et sur la fiche', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Cuisine Martin' });
  await devis('d1', { affaireId: 'a1', statut: 'envoye', numero: 'DEV-1', finaliseLe: new Date(Date.now() - 5 * JOUR), envoyeLe: new Date(Date.now() - 3 * JOUR - 3600000), creeLe: new Date(Date.now() - 6 * JOUR) });
  await ouvrirKanban(page);
  await expect(pastille(page, 'a1')).toHaveText('Devis : Envoyé il y a 3 jours');
  await page.locator('.carte-affaire[data-affaire="a1"]').click();
  await expect(page.locator('.fiche-tete .pastille-externe')).toHaveText('Devis : Envoyé il y a 3 jours');
});

test('3 on montre le devis le plus récent : une version remplacée est ignorée', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Cuisine Martin' });
  await devis('d1', { affaireId: 'a1', statut: 'remplace', numero: 'DEV-1', creeLe: new Date(Date.now() - 9 * JOUR) });
  await devis('d2', { affaireId: 'a1', version: 2, racineId: 'd1', creeLe: new Date(Date.now() - 1 * JOUR) });
  await ouvrirKanban(page);
  await expect(pastille(page, 'a1')).toHaveCount(1);
  await expect(pastille(page, 'a1')).toHaveText('Devis : Brouillon');
});

test('4 cas vide : une affaire sans devis n’a pas de pastille, ni sur la carte ni sur la fiche', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Cuisine Martin' });
  await creerAffaire('a2', { titre: 'Salle de bain Durand' });
  await devis('d1', { affaireId: 'a1' });
  await ouvrirKanban(page);
  await expect(pastille(page, 'a1')).toHaveCount(1);
  await expect(page.locator('.carte-affaire[data-affaire="a2"]')).toBeVisible();
  await expect(pastille(page, 'a2')).toHaveCount(0);
  await page.locator('.carte-affaire[data-affaire="a2"]').click();
  await expect(page.locator('.fiche-tete')).toBeVisible();
  await expect(page.locator('.fiche-tete .pastille-externe')).toHaveCount(0);
});
