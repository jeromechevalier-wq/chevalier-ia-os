// PR A « vocabulaire et registre du menu » (18/10/2026), à la racine (chez Jérôme). Un test par point du brief (nom = numéro du point),
// UNE capture par point dans ~/chantiers-crm/captures-menu-A/ (« -tel » pour le format téléphone). Le point 5 (client « affaires seules »)
// est dans menu-vocabulaire-client.spec.js (règles de la plateforme). Les points 4 et 6 n'ont pas d'écran : tests/menu-vocabulaire.test.js.
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { test, expect, connecter, allerAuxReglagesCrm, creerProjet, estTelephone } from './outils.js';

test.describe.configure({ mode: 'parallel' });

const DOSSIER = join(homedir(), 'chantiers-crm', 'captures-menu-A');
async function capture(page, nom) {
  await mkdir(DOSSIER, { recursive: true });
  await page.screenshot({ path: join(DOSSIER, `${nom}${estTelephone(page) ? '-tel' : ''}.png`), animations: 'disabled' });
}
const aller = (page, hash) => page.evaluate((h) => { location.hash = h; }, hash);
async function ouvrirMenu(page) {
  if (estTelephone(page)) { if (!(await page.locator('.coquille.menu-ouvert').count())) await page.getByRole('button', { name: 'Ouvrir le menu' }).click(); return; }
  const elargir = page.getByRole('button', { name: 'Élargir le menu' });
  if (await elargir.count()) await elargir.click(); // ordinateur : le menu élargi montre les titres (pour la capture)
}

test('1 Archives n’est plus dans le menu ; #/projets/archives affiche sa page et le bouton « Archives » de l’écran Projets y mène', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Projet vivant' });
  await creerProjet('pr2', { titre: 'Projet rangé', archive: true, statut: 'termine', phase: 'cloture' });
  await connecter(page);
  await ouvrirMenu(page);
  await expect(page.locator('.menu').getByRole('link', { name: 'Projets', exact: true })).toHaveCount(1);
  await expect(page.locator('.menu').getByRole('link', { name: 'Archives', exact: true })).toHaveCount(0);
  await expect(page.locator('.menu .menu-entree[data-chemin="projets/archives"]')).toHaveCount(0);
  await capture(page, '1-menu-sans-archives');
  // l'adresse directe (signet) marche toujours : sa page, jamais « introuvable »
  await aller(page, '#/projets/archives');
  await expect(page.locator('.bascule-vue[data-vue="archives"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.tableau-projets')).toContainText('Projet rangé');
  await expect(page.getByRole('heading', { name: 'Page introuvable' })).toHaveCount(0);
  // sans entrée « Archives », l'entrée « Projets » reste la page courante
  await expect(page.locator('.menu .menu-entree[data-chemin="projets/projets"]')).toHaveAttribute('aria-current', 'page');
  // et le bouton « Archives » de l'écran Projets y mène
  await aller(page, '#/projets/projets');
  await page.locator('.bascule-vue[data-vue="archives"]').click();
  await expect(page).toHaveURL(/#\/projets\/archives$/);
  await expect(page.locator('.tableau-projets')).toContainText('Projet rangé');
});

test('1 cas vide : sans projet archivé, la page Archives s’affiche quand même (pas d’« introuvable »)', async ({ page }) => {
  await connecter(page);
  await aller(page, '#/projets/archives');
  await expect(page.locator('.bascule-vue[data-vue="archives"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('heading', { name: 'Page introuvable' })).toHaveCount(0);
  await expect(page.locator('.tableau-projets tbody tr')).toHaveCount(0);
});

test('2 le groupe s’appelle « Affaires et projets » dans le menu, les Réglages et « Modules actifs » ; #/reglages/crm ne change pas', async ({ page }) => {
  await connecter(page);
  await ouvrirMenu(page);
  await expect(page.locator('.menu .menu-groupe-titre .menu-texte').first()).toHaveText('Affaires et projets');
  await expect(page.locator('.menu .menu-groupe[data-bloc="crm"]')).toHaveCount(1);
  await capture(page, '2-menu-affaires-et-projets');
  await aller(page, '#/reglages/crm'); // l'adresse du groupe garde son identifiant technique
  await expect(page.locator('.reglages-menu-lien[data-reglage="crm"]')).toHaveText('Affaires et projets');
  await expect(page.locator('.reglages-titre')).toHaveText('Affaires et projets');
  await aller(page, '#/reglages/modules');
  const ligne = page.locator('.reglages-module-ligne[data-module="crm"]');
  await expect(ligne.locator('strong')).toHaveText('Affaires et projets');
  await ligne.scrollIntoViewIfNeeded();
  await capture(page, '2-modules-actifs');
});

test('3 plus de mot « CRM » dans Réglages, dans le menu ni dans la page Journal ; libellés Options, Étapes des affaires, Phases des projets', async ({ page }) => {
  await connecter(page);
  await ouvrirMenu(page);
  await expect(page.locator('.menu')).not.toContainText('CRM');
  await expect(page.locator('.menu').getByRole('link', { name: 'Journal des modifications', exact: true })).toHaveCount(1);
  await allerAuxReglagesCrm(page);
  const corps = page.locator('.reglages-contenu');
  await expect(corps.locator('#reglages-options h2')).toHaveText('Options');
  await expect(corps.locator('#reglages-etapes h2')).toHaveText('Étapes des affaires');
  await expect(corps.locator('#reglages-phases h2')).toHaveText('Phases des projets');
  await expect(page.locator('.page-reglages')).not.toContainText('CRM');
  await expect(page.locator('.page-reglages')).not.toContainText('Étapes de vente');
  await expect(page.locator('.page-reglages')).not.toContainText('Phases de projet ');
  await capture(page, '3-reglages-sans-crm');
  // la page Journal
  await aller(page, '#/crm/journal');
  await expect(page.getByRole('heading', { name: 'Journal des modifications', level: 1 })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('CRM');
});

test('3 un modèle de projet inconnu : le lien de retour dit « Réglages » (cas d’erreur), sans « CRM »', async ({ page }) => {
  await connecter(page);
  await aller(page, '#/projets/modeles/inconnu');
  await expect(page.locator('.page')).toContainText('Ce modèle n’existe plus.');
  await expect(page.getByRole('link', { name: /Réglages/ }).first()).toBeVisible();
  await expect(page.locator('.page')).not.toContainText('CRM');
});

test('5 à la racine tout est allumé : les réglages des projets sont visibles (pas de capture possible du cas « sans projets » ici)', async ({ page }) => {
  await connecter(page);
  await allerAuxReglagesCrm(page);
  await expect(page.locator('#reglages-phases')).toBeVisible();
  await expect(page.locator('[data-option="suiviPaiements"]')).toBeVisible();
  await expect(page.locator('[data-option="clotureBloquee"]')).toBeVisible();
  await expect(page.locator('#reglages-modeles-projets')).toBeVisible();
  await capture(page, '5-racine-tout-visible');
});
