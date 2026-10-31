// PR B (31/10/2026) : la fenêtre « Ce devis ne peut pas encore être finalisé » liste ce que la loi demande (entreprise, assurance sans crochet, client,
// début et durée des travaux, validité à venir). Un test par cas (le nom commence par le numéro du point). Captures : tests/e2e/captures/devis-finalisation-mentions/ (ordinateur ET téléphone).
import { fileURLToPath } from 'node:url';
import { mkdir } from 'node:fs/promises';
import {
  test, expect, connecter, attendreCalme, ecrireDocument, lireDocument, creerOrganisation, creerAffaire, ecrireEntrepriseComplete, CHANTIER_ESSAI, JEROME,
} from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-finalisation-mentions/', import.meta.url));
async function capturer(page, info, nom) {
  await mkdir(DOSSIER, { recursive: true });
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name === 'telephone' ? 'tel' : 'ordi'}.png`, animations: 'disabled' });
}
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const LIGNES = [{ id: 'l1', libelle: 'Carrelage', familleId: 'famille-1', type: 'fourniture', quantite: 10, unite: 'm²', prixAchat: 40, prixVente: 60, tauxTva: 20 }];
async function brouillon(valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument('devis_devis/dTest', {
    racineId: 'dTest', version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', personneId: null, organisationId: 'o1', modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: '2099-12-31', objet: 'Rénovation', destinataires: ['contact@exemple.fr'],
    sections: [{ id: 's1', titre: 'Cuisine', lignes: LIGNES }], creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, ...valeurs,
  });
}
async function ouvrir(page) {
  await creerOrganisation('o1', { nom: 'Société Exemple' });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', organisationId: 'o1' });
  await connecter(page, undefined, { route: 'devis/editeur/dTest' });
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
}
const dialogue = (page) => page.getByRole('dialog');
const finaliser = (page) => page.locator('[data-action="finaliser"]').click();

test('B1 B2 B4 B5 entreprise vide, devis sans dates et validité dépassée : la fenêtre liste tout, rien n’est envoyé au serveur', async ({ page }, info) => {
  const appels = [];
  await page.route('**/devisFinaliser', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    appels.push(1);
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ok: true } }) });
  });
  await brouillon({ expireLe: '2026-01-01' });
  await ouvrir(page);
  await finaliser(page);
  await expect(dialogue(page)).toContainText('Ce devis ne peut pas encore être finalisé');
  await expect(dialogue(page).locator('li')).toHaveText([
    'Complète le nom de l\'entreprise dans Mon entreprise.', 'Complète le numéro SIRET dans Mon entreprise.', 'Complète l\'adresse de l\'entreprise dans Mon entreprise.',
    'Complète l\'assurance dans Mon entreprise : il reste des crochets.', 'Indique la date de début des travaux.', 'Indique la durée estimée des travaux.',
    'La date de validité du devis est déjà dépassée : choisis une date à venir.',
  ]);
  await capturer(page, info, 'B1-B5-liste');
  await dialogue(page).getByRole('button', { name: 'Compris' }).click();
  expect(appels).toEqual([]);
  expect((await lireDocument('devis_devis/dTest')).statut).toBe('brouillon');
});

test('B3 sans client : « Choisis le client de ce devis. » est dans la liste (avec l’entreprise, le chantier et la validité en règle)', async ({ page }, info) => {
  await ecrireEntrepriseComplete();
  await brouillon({ organisationId: null, chantier: CHANTIER_ESSAI });
  await ouvrir(page);
  await finaliser(page);
  await expect(dialogue(page).locator('li')).toHaveText(['Choisis le client de ce devis.']);
  await capturer(page, info, 'B3-client-manquant');
});

test('B0 cas complet : entreprise, client, chantier et validité en règle : la fenêtre de confirmation s’ouvre, sans liste d’erreurs', async ({ page }) => {
  await ecrireEntrepriseComplete();
  await brouillon({ chantier: CHANTIER_ESSAI });
  await ouvrir(page);
  await finaliser(page);
  await expect(dialogue(page)).toContainText('Finaliser ce devis ?');
  await expect(dialogue(page).locator('[data-zone="erreurs-finalisation"]')).toHaveCount(0);
});
