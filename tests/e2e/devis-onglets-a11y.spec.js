// Devis, accessibilité des onglets « Édition » / « Prévisualisation » de l'éditeur (motif ARIA tabs).
// M3 : tablist, tab (aria-selected, aria-controls, tabindex roving), tabpanel (aria-labelledby), flèches et Début/Fin déplacent la sélection ; aucun changement visuel.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, creerOrganisation, creerAffaire, JEROME } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-onglets-a11y/', import.meta.url));

test('M3 les onglets Édition et Prévisualisation suivent le motif ARIA tabs et se pilotent aux flèches', async ({ page }, info) => {
  await creerOrganisation('o1', { nom: 'M. Paul Exemple' });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', organisationId: 'o1' });
  const maintenant = new Date();
  await ecrireDocument('devis_devis/d1', {
    racineId: 'd1', version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', personneId: null, organisationId: 'o1', modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: '2099-12-31', objet: 'Rénovation restaurant', destinataires: ['contact@exemple.fr'],
    sections: [{ id: 's1', titre: 'Cuisine', lignes: [{ id: 'l1', libelle: 'Carrelage', familleId: 'famille-1', type: 'fourniture', quantite: 10, unite: 'm²', prixAchat: 40, prixVente: 60, tauxTva: 20 }] }],
    creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant,
  });
  await connecter(page, undefined, { route: 'devis/editeur/d1' });
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);

  const liste = page.getByRole('tablist', { name: 'Affichage du devis' });
  const edition = liste.getByRole('tab', { name: /Édition/ });
  const apercu = liste.getByRole('tab', { name: /Prévisualisation/ });
  // Ouvert sur Édition : sélectionné, tabindex 0 ; l'autre à -1 ; chaque onglet pointe son panneau, qui pointe son onglet.
  await expect(edition).toHaveAttribute('aria-selected', 'true');
  await expect(edition).toHaveAttribute('tabindex', '0');
  await expect(apercu).toHaveAttribute('aria-selected', 'false');
  await expect(apercu).toHaveAttribute('tabindex', '-1');
  for (const [onglet, cle] of [[edition, 'edition'], [apercu, 'apercu']]) {
    await expect(onglet).toHaveAttribute('aria-controls', `devis-panneau-${cle}`);
    const panneau = page.locator(`#devis-panneau-${cle}`);
    await expect(panneau).toHaveAttribute('role', 'tabpanel');
    await expect(panneau).toHaveAttribute('aria-labelledby', await onglet.getAttribute('id'));
  }
  await expect(page.locator('#devis-panneau-edition')).toBeVisible();
  await expect(page.locator('#devis-panneau-apercu')).toBeHidden();

  // Flèches : le focus et la sélection se déplacent ensemble, avec retour en boucle.
  await edition.focus();
  await page.keyboard.press('ArrowRight');
  await expect(apercu).toBeFocused();
  await expect(apercu).toHaveAttribute('aria-selected', 'true');
  await expect(apercu).toHaveAttribute('tabindex', '0');
  await expect(edition).toHaveAttribute('tabindex', '-1');
  await expect(page.locator('#devis-panneau-apercu')).toBeVisible();
  await expect(page.locator('#devis-panneau-edition')).toBeHidden();
  await page.screenshot({ path: `${DOSSIER}M3-onglets-${info.project.name}.png`, animations: 'disabled' });
  await page.keyboard.press('ArrowRight');
  await expect(edition).toBeFocused();
  await expect(edition).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('End');
  await expect(apercu).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('Home');
  await expect(edition).toHaveAttribute('aria-selected', 'true');
  await page.keyboard.press('ArrowLeft');
  await expect(apercu).toBeFocused();
});
