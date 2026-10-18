// Critère M23 de « Mon espace modifiable » (2.10.0) : le CRM de Jérôme (racine, règles du CRM) ne change pas. Capture dans ~/chantiers-crm/captures-mon-espace/.
// (Dans un fichier à part : les autres critères tournent avec les règles de la plateforme, celui-ci avec celles du CRM.)
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { test, expect, connecter, allerA, ouvrirSectionReglages, estTelephone, JEROME } from './outils.js';
import { brancherServeurEspace } from './espace-faux-serveur.js';


test('M23 les pages de Jérôme (racine, #/reglages) ne changent pas : Mon espace reste en lecture seule, aucun formulaire, aucun appel à la fonction', async ({ page }) => {
  const serveur = await brancherServeurEspace(page);
  await connecter(page, JEROME);
  await allerA(page, 'Réglages');
  await expect(page).toHaveURL(/#\/reglages$/);
  await expect(page.locator('.reglages-menu-lien')).toHaveText(['Mon espace', 'Modules actifs', 'Affaires et projets', 'Veille', 'Automatisations', 'Tableau de bord']);
  await expect(page.locator('[data-info="nom"]')).toContainText('Chevalier IA OS');
  await expect(page.locator('#reglages-identite')).toContainText('L’identité de cet espace est celle de la coque de l’application : elle ne se règle pas ici.');
  await expect(page.locator('[data-role="mon-espace"], [data-champ], [data-role="fichier-logo"]')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Enregistrer' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Choisir un logo' })).toHaveCount(0);
  await expect(page).toHaveTitle('Chevalier IA OS');
  await mkdir(join(homedir(), 'chantiers-crm', 'captures-mon-espace'), { recursive: true });
  await page.screenshot({ path: join(homedir(), 'chantiers-crm', 'captures-mon-espace', `M23${estTelephone(page) ? '-tel' : ''}.png`), fullPage: true }); // la page « Mon espace » de Jérôme, en lecture seule
  await ouvrirSectionReglages(page, 'Modules actifs');
  await expect(page.locator('#reglages-modules')).not.toContainText('contacte ton administrateur');
  await expect(page.locator('[data-interrupteur="crm"]')).toBeChecked();
  expect(serveur.appels).toEqual([]);
});
