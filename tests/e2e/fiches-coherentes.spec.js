// Fiches affaire et projet cohérentes : bande d'étapes / de phases = simple indicateur (la liste du Résumé change), même ordre des sections, une seule étiquette d'état.
import { test, expect, connecter, creerAffaire, creerProjet, lireDocument, estTelephone } from './outils.js';

async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); }
const dessus = (page, a, b) => page.evaluate(([x, y]) => document.querySelector(`[data-section="${x}"]`).getBoundingClientRect().top < document.querySelector(`[data-section="${y}"]`).getBoundingClientRect().top, [a, b]);

test('F1 la bande des étapes (affaire) et des phases (projet) n\'est plus cliquable ; la liste « Étape » / « Phase » du Résumé change l\'étape ou la phase, identique des deux côtés', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await creerProjet('pr1', { titre: 'Refonte site' });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  await expect(page.locator('.barre-etapes-fiche .etape.courante')).toHaveText('Premier contact');
  await expect(page.locator('.barre-etapes-fiche button')).toHaveCount(0); // plus aucun bouton dans la bande
  await page.locator('.barre-etapes-fiche .etape', { hasText: 'Proposition envoyée' }).click({ force: true });
  expect((await lireDocument('crm_affaires/a1')).etape).toBe('premier_contact'); // un clic sur la bande ne change rien
  const resumeAffaire = page.locator('[data-section="affaire-resume"]');
  await expect(resumeAffaire.locator('[data-prop="etape"] .prop-libelle')).toHaveText('Étape');
  await resumeAffaire.locator('[data-action="choisir-etape"]').selectOption('proposition_envoyee');
  await expect.poll(async () => (await lireDocument('crm_affaires/a1')).etape).toBe('proposition_envoyee');
  await expect(page.locator('.barre-etapes-fiche .etape.courante')).toHaveText('Proposition envoyée');
  await expect(resumeAffaire.locator('[data-action="choisir-etape"]')).toHaveValue('proposition_envoyee');
  await aller(page, '#/projets/projets/pr1');
  await expect(page.locator('.barre-etapes-fiche button')).toHaveCount(0);
  await page.locator('.barre-etapes-fiche .etape', { hasText: 'Livraison' }).click({ force: true });
  expect((await lireDocument('projets_projets/pr1')).phase).toBe('lancement');
  await page.locator('[data-section="projet-resume"] [data-action="choisir-phase"]').selectOption('livraison');
  await expect.poll(async () => (await lireDocument('projets_projets/pr1')).phase).toBe('livraison');
  await expect(page.locator('.barre-etapes-fiche .etape.courante')).toHaveText('Livraison');
});

test('F2 même ordre des sections sur les deux fiches : Résumé, (Tâches, Factures : projets), Liens et documents, puis Détails', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await creerProjet('pr1', { titre: 'Refonte site' });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  await expect(page.locator('[data-section="affaire-documents"]')).toBeVisible();
  expect(await dessus(page, 'affaire-resume', 'affaire-documents')).toBe(true);
  expect(await dessus(page, 'affaire-documents', 'affaire-details')).toBe(true);
  await aller(page, '#/projets/projets/pr1');
  await expect(page.locator('[data-section="projet-documents"]')).toBeVisible();
  expect(await dessus(page, 'projet-resume', 'projet-taches')).toBe(true);
  expect(await dessus(page, 'projet-taches', 'projet-documents')).toBe(true);
  expect(await dessus(page, 'projet-documents', 'projet-details')).toBe(true);
  void estTelephone;
});

test('F3 l\'étiquette d\'état n\'apparaît qu\'UNE fois, sous le titre, avec une icône « i » ; plus de ligne « Statut » dans le Résumé de l\'affaire ; raison de la perte sous le titre', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Affaire ouverte' });
  await creerAffaire('a2', { titre: 'Affaire perdue', etape: 'premier_contact', statut: 'perdue', raisonPerdue: 'Prix trop élevé' });
  await creerProjet('pr1', { titre: 'Refonte site' });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  await expect(page.locator('.pastille-statut', { hasText: 'Ouverte' })).toHaveCount(1);
  await expect(page.locator('.fiche-sous [data-role="info"]')).toHaveAttribute('title', /en cours/);
  await expect(page.locator('[data-section="affaire-resume"]')).not.toContainText('Statut');
  await aller(page, '#/crm/affaires/a2');
  await expect(page.locator('.pastille-statut', { hasText: 'Perdue' })).toHaveCount(1);
  await expect(page.locator('.fiche-sous')).toContainText('Prix trop élevé');
  await expect(page.locator('.fiche-sous [data-role="info"]')).toHaveAttribute('title', /perdue/);
  await aller(page, '#/projets/projets/pr1');
  await expect(page.locator('.fiche-sous .pastille-statut')).toHaveCount(1);
  await expect(page.locator('.fiche-sous .pastille-statut')).toHaveText('Actif');
  await expect(page.locator('.fiche-sous [data-role="info"]')).toHaveAttribute('title', /en cours/);
});

test('F4 fiche projet : la ligne « Affaire d\'origine » n\'apparaît que s\'il y a une affaire', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas', etape: 'gagne', projetId: 'pr2' });
  await creerProjet('pr1', { titre: 'Chantier interne' });
  await creerProjet('pr2', { titre: 'Audit des Lilas', affaireId: 'a1' });
  await connecter(page);
  await aller(page, '#/projets/projets/pr1');
  await expect(page.locator('[data-section="projet-resume"]')).toBeVisible();
  await expect(page.locator('[data-prop="affaire"]')).toHaveCount(0);
  await aller(page, '#/projets/projets/pr2');
  await expect(page.locator('[data-prop="affaire"] .prop-libelle')).toHaveText('Affaire d’origine');
  await expect(page.locator('[data-prop="affaire"]')).toContainText('Audit des Lilas');
});
