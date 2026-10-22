// Types d'activité (nuit du 22 au 23/10/2026) : J8 (le type de départ est « Appel » sur l'affaire ET sur le projet) et J4 (le projet propose aussi « Tâche »).
// Un test par critère (nom commençant par J8 / J4), une capture par critère dans tests/e2e/captures/activites-types/.
import { test, expect, attendreCalme, connecter, creerAffaire, creerProjet, creerTacheProjet, creerPersonne, lireDocument, listerDocuments, estTelephone } from './outils.js';

const CAPTURES = 'e2e/captures/activites-types';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
// Ces écrans n'utilisent pas Google : le script de l'API est remplacé par un fichier vide (sans réseau, il ne produit pas d'erreur de console).
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});
async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }
const groupe = (page) => page.locator('.panneau-activite').getByRole('group', { name: 'Type d’activité' });

test('J8 le type choisi au départ est « Appel » sur la fiche affaire comme sur la fiche projet', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await creerProjet('pr1', { titre: 'Refonte du site' });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  await expect(groupe(page).getByRole('button')).toHaveText(['Appel', 'Rendez vous', 'Email', 'Tâche']);
  await expect(groupe(page).getByRole('button', { name: 'Appel' })).toHaveAttribute('aria-pressed', 'true');
  await expect(groupe(page).getByRole('button', { name: 'Tâche' })).toHaveAttribute('aria-pressed', 'false');
  await expect(groupe(page).locator('.pastille-type.actif')).toHaveText('Appel');
  await capture(page, 'J8-affaire');
  await aller(page, '#/projets/projets/pr1');
  await expect(groupe(page).getByRole('button', { name: 'Appel' })).toHaveAttribute('aria-pressed', 'true');
  await expect(groupe(page).locator('.pastille-type.actif')).toHaveText('Appel');
  await capture(page, 'J8-projet');
});

test('J8 sans choisir de type, l’activité créée sur une affaire est un appel', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  await page.getByLabel('Titre de l’activité').fill('Rappeler le client');
  await page.locator('[data-action="enregistrer-activite"]').click();
  await expect.poll(async () => (await listerDocuments('crm_activites')).map((d) => d.type)).toEqual(['appel']);
});

test('J4 la fiche projet propose les 4 pastilles ; une activité Tâche créée depuis le projet apparaît dans le fil, se termine avec le rond et ne compte pas dans les livrables', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Camille Durand' });
  await creerProjet('pr1', { titre: 'Audit des Lilas', personneId: 'p1' });
  await creerTacheProjet('t1', { titre: 'Maquette', projetId: 'pr1' });
  await connecter(page);
  await aller(page, '#/projets/projets/pr1');
  await expect(groupe(page).getByRole('button')).toHaveText(['Appel', 'Rendez vous', 'Email', 'Tâche']);
  await capture(page, 'J4-pastilles');
  const resume = page.locator('[data-section="projet-resume"]');
  const avant = await resume.locator('[data-prop="avancement"]').textContent();
  const panneau = page.locator('.panneau-activite');
  await panneau.getByRole('button', { name: 'Tâche' }).click();
  await panneau.getByLabel('Titre de l’activité').fill('Envoyer le devis');
  await panneau.locator('[data-action="enregistrer-activite"]').click();
  await expect.poll(async () => (await listerDocuments('crm_activites')).find((d) => d.projetId === 'pr1')).toMatchObject({ type: 'tache', titre: 'Envoyer le devis', projetId: 'pr1', fait: false });
  const ligne = panneau.locator('.points-cles .activite', { hasText: 'Envoyer le devis' });
  await expect(ligne).toBeVisible();
  await expect(ligne.locator('.activite-meta')).not.toBeEmpty(); // la date
  await expect(page.locator('.points-cles')).not.toContainText('Aucune activité à faire');
  // Ni l'avancement ni les compteurs du projet ne changent (les livrables restent ceux de la section dédiée).
  await expect(resume.locator('[data-prop="avancement"]')).toHaveText(avant.trim());
  expect((await listerDocuments('projets_taches')).length).toBe(1);
  await capture(page, 'J4-fil');
  // Le rond termine l'activité.
  await ligne.locator('.case-fait').click();
  await expect.poll(async () => (await listerDocuments('crm_activites')).find((d) => d.projetId === 'pr1').fait).toBe(true);
  await expect(resume.locator('[data-prop="avancement"]')).toHaveText(avant.trim());
  expect((await lireDocument('projets_taches/t1')).fait).toBe(false);
});

test('J4 cas d’erreur : une activité Tâche sans date est refusée avec un message ; sans titre le bouton est grisé (nuit 4 : plus de titre par défaut à la saisie)', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Audit des Lilas' });
  await connecter(page);
  await aller(page, '#/projets/projets/pr1');
  const panneau = page.locator('.panneau-activite');
  await panneau.getByRole('button', { name: 'Tâche' }).click();
  await panneau.getByLabel('Titre de l’activité').click();
  await expect(panneau.locator('[data-action="enregistrer-activite"]')).toBeDisabled(); // sans titre : grisé
  await panneau.getByLabel('Titre de l’activité').fill('Envoyer le devis');
  await panneau.locator('input[type="date"]:visible').fill('');
  await panneau.locator('[data-action="enregistrer-activite"]').click();
  await expect(page.getByText('Choisis une date.')).toBeVisible();
  expect(await listerDocuments('crm_activites')).toHaveLength(0);
  await panneau.locator('input[type="date"]:visible').fill('2026-11-05');
  await panneau.locator('[data-action="enregistrer-activite"]').click();
  await expect.poll(async () => (await listerDocuments('crm_activites'))[0]).toMatchObject({ type: 'tache', titre: 'Envoyer le devis', projetId: 'pr1' });
});
