// Module Devis, haut de page (retour de Jérôme du 26/10/2026) : le bouton « Options » n'a plus de petite flèche vers le bas, car il ouvre un panneau sur le côté et ne déroule rien vers le bas.
//   1 : le bouton « Options » ne porte aucune icône flèche, et ouvre bien le panneau sur le côté.
//   2 : « Envoyer » (jaune, finalisé) garde sa flèche, car il ouvre un vrai menu qui déroule.
// Capture dans tests/e2e/captures/devis-options-sans-fleche/ (ordinateur ; le bouton « Options » n'existe pas au format téléphone).
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, creerOrganisation, creerAffaire, estTelephone, JEROME } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-options-sans-fleche/', import.meta.url));
const LIGNES = [{ id: 'l1', libelle: 'Carrelage', familleId: 'famille-1', type: 'fourniture', quantite: 10, unite: 'm²', prixAchat: 40, prixVente: 60, tauxTva: 20 }];

async function devis(id, valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument(`devis_devis/${id}`, {
    racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', personneId: null, organisationId: 'o1', modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: '2099-12-31', objet: 'Rénovation restaurant', destinataires: ['contact@exemple.fr'],
    sections: [{ id: 's1', titre: 'Cuisine', lignes: LIGNES }],
    creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, ...valeurs,
  });
}
async function ouvrir(page, route) {
  await creerOrganisation('o1', { nom: 'M. Paul Exemple' });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', organisationId: 'o1' });
  await devis('dBrouillon');
  await devis('dFinalise', { numero: 'DEV-2026-10-02-001', statut: 'en_attente_envoi', finaliseLe: new Date(Date.now() - 86400000) });
  await connecter(page, undefined, { route });
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
}

test('1 le bouton « Options » n’a pas de petite flèche et ouvre toujours le panneau sur le côté', async ({ page }, info) => {
  test.skip(estTelephone(page), 'pas de bouton « Options » au format téléphone');
  await ouvrir(page, 'devis/editeur/dBrouillon');
  const options = page.locator('[data-action="options"]');
  await expect(options).toHaveText('Options');
  await expect(options.locator('svg')).toHaveCount(0);
  await page.screenshot({ path: `${DOSSIER}1-options-sans-fleche-${info.project.name}.png`, animations: 'disabled' });
  await options.click();
  await expect(page.locator('#options-devis')).toBeVisible();
});

test('2 « Envoyer » (finalisé) garde sa flèche : il déroule un vrai menu', async ({ page }) => {
  await ouvrir(page, 'devis/editeur/dFinalise');
  const envoyer = page.locator('[data-action="envoyer"]');
  await expect(envoyer.locator('svg')).toHaveCount(2); // enveloppe + flèche
  await envoyer.click();
  await expect(page.locator('.menu-pop')).toBeVisible();
});
