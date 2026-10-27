// Fiches affaire et projet cohérentes : bande d'étapes / de phases = simple indicateur (la liste du Résumé change), même ordre des sections, une seule étiquette d'état.
import { test, expect, attendreCalme, connecter, creerAffaire, creerProjet, creerTacheProjet, creerActivite, lireDocument, estTelephone } from './outils.js';

async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }
const dessus = (page, a, b) => page.evaluate(([x, y]) => document.querySelector(`[data-section="${x}"]`).getBoundingClientRect().top < document.querySelector(`[data-section="${y}"]`).getBoundingClientRect().top, [a, b]);

test('F1 la bande des étapes (affaire) et des phases (projet) n\'est plus cliquable ; la liste « Étape » / « Phase » du Résumé change l\'étape ou la phase, identique des deux côtés', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await creerProjet('pr1', { titre: 'Refonte site' });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  await expect(page.locator('.barre-etapes-fiche .etape.courante')).toHaveText('Premier contact');
  await expect(page.locator('.barre-etapes-fiche button')).toHaveCount(0); // plus aucun bouton dans la bande
  await expect(page.locator('.barre-etapes-fiche .etape', { hasText: 'Proposition envoyée' })).toBeVisible(); // la fiche est redessinée quand des données arrivent : on attend qu'elle soit posée
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
  await expect(page.locator('.barre-etapes-fiche .etape', { hasText: 'Livraison' })).toBeVisible();
  await page.locator('.barre-etapes-fiche .etape', { hasText: 'Livraison' }).click({ force: true });
  expect((await lireDocument('projets_projets/pr1')).phase).toBe('lancement');
  await page.locator('[data-section="projet-resume"] [data-action="choisir-phase"]').selectOption('livraison');
  await expect.poll(async () => (await lireDocument('projets_projets/pr1')).phase).toBe('livraison');
  await expect(page.locator('.barre-etapes-fiche .etape.courante')).toHaveText('Livraison');
});

test('F2 même ordre sur les deux fiches : colonne de gauche Résumé, (Tâches : projets), Détails (affaire seulement) ; « Documents » est le troisième onglet à droite, après Activité et Notes, sur les deux', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await creerProjet('pr1', { titre: 'Refonte site' });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  await expect(page.locator('.compositeur [role="tab"]')).toHaveText([/Activité/, /Notes/, /Documents/, /Devis/]); // l'affaire a en plus l'onglet « Devis » du module Devis (la fiche projet n'en a pas)
  await expect(page.locator('[data-section="affaire-details"]')).toBeVisible();
  expect(await dessus(page, 'affaire-resume', 'affaire-details')).toBe(true);
  await aller(page, '#/projets/projets/pr1');
  await expect(page.locator('.compositeur [role="tab"]')).toHaveText([/Activité/, /Notes/, /Documents/]);
  await expect(page.locator('[data-section="projet-taches"]')).toBeVisible();
  expect(await dessus(page, 'projet-resume', 'projet-taches')).toBe(true);
  await expect(page.locator('[data-section="projet-details"]')).toHaveCount(0); // le dossier de travail est passé dans l'onglet Documents : plus de « Détails » sur le projet
  void estTelephone;
});

test('F3 l\'étiquette d\'état n\'apparaît qu\'UNE fois, sous le titre, avec une icône « i » ; plus de ligne « Statut » dans le Résumé de l\'affaire ; raison de la perte sous le titre', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Affaire ouverte' });
  await creerAffaire('a2', { titre: 'Affaire perdue', etape: 'premier_contact', statut: 'perdue', raisonPerdue: 'Prix trop élevé' });
  await creerProjet('pr1', { titre: 'Refonte site' });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  await expect(page.locator('.pastille-statut', { hasText: 'Ouverte' })).toHaveCount(1);
  await expect(page.locator('.fiche-sous [data-role="bulle-info"]')).toHaveText(/en cours/);
  await expect(page.locator('[data-section="affaire-resume"]')).not.toContainText('Statut');
  await aller(page, '#/crm/affaires/a2');
  await expect(page.locator('.pastille-statut', { hasText: 'Perdue' })).toHaveCount(1);
  await expect(page.locator('.fiche-sous')).toContainText('Prix trop élevé');
  await expect(page.locator('.fiche-sous [data-role="bulle-info"]')).toHaveText(/perdue/);
  await aller(page, '#/projets/projets/pr1');
  await expect(page.locator('.fiche-sous .pastille-statut')).toHaveCount(1);
  await expect(page.locator('.fiche-sous .pastille-statut')).toHaveText('Actif');
  await expect(page.locator('.fiche-sous [data-role="bulle-info"]')).toHaveText(/en cours/);
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

test('F5 tâches (projet) et points clés (affaire) : même comportement — un clic sur le texte le modifie sur place, le rond coche pour terminer, le menu « … » ne garde que les actions rares', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Refonte site' });
  await creerTacheProjet('t1', { titre: 'Écrire le devis', projetId: 'pr1' });
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await creerActivite('ac1', { titre: 'Appeler le client', affaireId: 'a1', type: 'appel' });
  await connecter(page);
  // Tâche de projet : clic sur le texte → champ ; Entrée enregistre.
  await aller(page, '#/projets/projets/pr1');
  const tache = page.locator('.tache[data-tache="t1"]');
  await tache.locator('[data-role="titre-tache"]').click();
  await tache.getByLabel('Modifier le texte du livrable').fill('Écrire le devis final');
  await tache.getByLabel('Modifier le texte du livrable').press('Enter');
  await expect.poll(async () => (await lireDocument('projets_taches/t1')).titre).toBe('Écrire le devis final');
  // Échap annule.
  await tache.locator('[data-role="titre-tache"]').click();
  await tache.getByLabel('Modifier le texte du livrable').fill('Autre texte');
  await tache.getByLabel('Modifier le texte du livrable').press('Escape');
  await expect(tache.locator('[data-role="titre-tache"]')).toHaveText('Écrire le devis final');
  expect((await lireDocument('projets_taches/t1')).titre).toBe('Écrire le devis final');
  // Le menu ne garde que les actions rares (réglages, ordre, déplacement, suppression) : pas de modification du texte.
  await tache.locator('[data-action="menu-tache"]').click();
  const entrees = await page.locator('.menu-pop [role="menuitem"]').allInnerTexts();
  expect(entrees[0]).toBe('Modifier…');
  expect(entrees.at(-1)).toBe('Supprimer');
  await page.keyboard.press('Escape');
  // Le rond coche pour terminer.
  await tache.locator('[data-action="faire-tache"]').click();
  await expect.poll(async () => (await lireDocument('projets_taches/t1')).fait).toBe(true);
  // Point clé de l'affaire : même geste.
  await aller(page, '#/crm/affaires/a1');
  const pointCle = page.locator('.activite[data-activite="ac1"]');
  await pointCle.locator('.activite-titre-modifiable').click();
  await pointCle.getByLabel('Modifier le texte de l’activité').fill('Appeler le client demain');
  await pointCle.getByLabel('Modifier le texte de l’activité').press('Enter');
  await expect.poll(async () => (await lireDocument('crm_activites/ac1')).titre).toBe('Appeler le client demain');
  await pointCle.getByRole('button', { name: /Actions/ }).click();
  expect(await page.locator('.menu-pop [role="menuitem"]').allInnerTexts()).toEqual(['Supprimer']);
});
