// Bouton d'action de l'en-tête d'une affaire (module Devis) : « Créer un devis » sans devis, « Voir le devis » sinon, jaune tant que l'affaire est en cours, en contour sinon.
// Un seul bouton jaune sur la page : la pastille « Appel » choisie du compositeur n'est plus jaune. Captures dans tests/e2e/captures/devis-action-affaire/.
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, creerOrganisation, creerAffaire, JEROME } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-action-affaire/', import.meta.url));
async function capturer(page, info, nom) {
  await mkdir(DOSSIER, { recursive: true });
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled', fullPage: true });
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
async function ouvrirAffaire(page, id = 'a1') {
  await connecter(page, undefined, { route: `crm/affaires/${id}` });
  await expect(page.locator('.compositeur')).toBeVisible();
  await attendreCalme(page);
}
async function base(statut = 'ouverte') {
  await creerOrganisation('o1', { nom: 'M. Paul Exemple' });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', organisationId: 'o1', statut, ...(statut === 'perdue' ? { raisonPerdue: 'Prix trop élevé' } : {}) });
}
const actions = (page) => page.locator('.fiche-actions');

test('1 sans devis : « Créer un devis » (seul bouton jaune) à côté de « Perdue » ; un clic crée un brouillon sur CETTE affaire et ouvre l’éditeur', async ({ page }, info) => {
  await base();
  await ouvrirAffaire(page);
  const bouton = actions(page).locator('[data-action="action-module"]');
  await expect(bouton).toHaveText('Créer un devis');
  await expect(bouton).toHaveClass(/bouton-principal/);
  await expect(actions(page).locator('[data-action="perdue"]')).toHaveClass(/bouton-secondaire/);
  await expect(page.locator('.bouton-principal:visible')).toHaveCount(1);
  const fond = (sel) => page.locator(sel).first().evaluate((el) => getComputedStyle(el).backgroundColor);
  expect(await fond('.pastille-type.actif')).not.toBe(await fond('[data-action="action-module"]')); // « Appel » choisi dans le compositeur n'est plus jaune
  await capturer(page, info, '1-creer-un-devis');
  await bouton.click();
  await expect(page).toHaveURL(/#\/devis\/editeur\/[^/]+$/);
});

test('2 avec un devis : « Voir le devis » ouvre le plus récent (brouillon : éditeur ; finalisé : visualisation)', async ({ page }, info) => {
  await base();
  await devis('dAncien', { numero: 'DEV-2026-10-02-001', statut: 'en_attente_envoi', creeLe: new Date(Date.now() - 6 * 86400000), dateEmission: '2026-10-02', totaux: { ht: 600, ttc: 720 } });
  await ouvrirAffaire(page);
  const bouton = actions(page).locator('[data-action="action-module"]');
  await expect(bouton).toHaveText('Voir le devis');
  await capturer(page, info, '2-voir-le-devis');
  await bouton.click();
  await expect(page).toHaveURL(/#\/devis\/voir\/dAncien$/);
  await page.goBack();
  await devis('dRecent', { objet: 'Variante' });
  await expect(actions(page).locator('[data-action="action-module"]')).toHaveText('Voir le devis');
  await actions(page).locator('[data-action="action-module"]').click();
  await expect(page).toHaveURL(/#\/devis\/editeur\/dRecent$/);
});

test('3 affaire perdue : « Voir le devis » reste là mais en contour ; « Rouvrir » est le seul jaune', async ({ page }, info) => {
  await base('perdue');
  await devis('dUn', { numero: 'DEV-2026-10-02-001', statut: 'en_attente_envoi', dateEmission: '2026-10-02', totaux: { ht: 600, ttc: 720 } });
  await ouvrirAffaire(page);
  const bouton = actions(page).locator('[data-action="action-module"]');
  await expect(bouton).toHaveText('Voir le devis');
  await expect(bouton).toHaveClass(/bouton-secondaire/);
  await expect(actions(page).locator('[data-action="rouvrir"]')).toHaveClass(/bouton-principal/);
  await expect(page.locator('.bouton-principal:visible')).toHaveCount(1);
  await capturer(page, info, '3-affaire-perdue');
});

test('4 affaire perdue SANS devis : aucun bouton « Créer un devis » (seul « Rouvrir » est jaune)', async ({ page }) => {
  await base('perdue');
  await ouvrirAffaire(page);
  await expect(actions(page).locator('[data-action="rouvrir"]')).toBeVisible();
  await expect(actions(page).locator('[data-action="action-module"]')).toHaveCount(0);
});

test('5 affaire gagnée : « Voir le devis » en contour, « Créer le projet » reste le seul jaune', async ({ page }) => {
  await creerOrganisation('o1', { nom: 'M. Paul Exemple' });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', organisationId: 'o1', etape: 'gagnee', statut: 'gagnee' });
  await devis('dUn', { numero: 'DEV-2026-10-02-001', statut: 'en_attente_envoi', dateEmission: '2026-10-02', totaux: { ht: 600, ttc: 720 } });
  await ouvrirAffaire(page);
  await expect(actions(page).locator('[data-action="action-module"]')).toHaveClass(/bouton-secondaire/);
  await expect(page.locator('.bouton-principal:visible')).toHaveCount(1);
});
