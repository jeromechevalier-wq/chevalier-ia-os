// Livrables (K1, K3 côté écran) : dans un projet, ce qu'on appelait « tâche » s'appelle « livrable ». Le mot « Tâche » reste pour le type d'activité.
// K2 (test statique) est dans tests/livrables-vocabulaire.test.js, K3 (serveur MCP) dans tests/ecriture-outils.test.js et tests/mcp.test.js.
// Les captures (format ordinateur) vont dans tests/e2e/captures/livrables/.
import { fileURLToPath } from 'node:url';
import { test, expect, attendreCalme, connecter, creerProjet, creerTacheProjet, creerPersonne, creerActivite, ecrireDocument, lireDocument, listerDocuments, jour } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/livrables/', import.meta.url));
async function capturer(page, info, nom) {
  if (info.project.name !== 'ordinateur') return;
  await page.screenshot({ path: `${DOSSIER}${nom}.png`, fullPage: true });
}
async function ouvrir(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }
const dialogue = (page) => page.getByRole('dialog');

// Dans ce bac à sable, le script de Google est inaccessible : on le remplace par un fichier vide.
test.beforeEach(async ({ page }) => {
  await page.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
});

test('K1a fiche projet : section « Livrables 0/1 », ligne de départ « Clique ici pour ajouter un livrable… », Résumé « 0 / 1 livrable »', async ({ page }, info) => {
  await creerProjet('pr1', { titre: 'Audit des Lilas', phase: 'decouverte' });
  await creerTacheProjet('t1', { titre: 'Interview Carrel', phase: 'decouverte' });
  await connecter(page);
  await ouvrir(page, '#/projets/projets/pr1');
  const section = page.locator('[data-section="projet-taches"]');
  await expect(section.locator('.section-titre, h2, h3').first()).toContainText('Livrables');
  await expect(section.locator('.section-compteur')).toHaveText('0/1');
  await expect(section.locator('.groupe-taches .sous-titre')).toContainText('Découverte');
  await expect(section.locator('.groupe-taches .sous-titre .compteur')).toHaveText('0/1');
  await expect(section.getByLabel('Nouveau livrable')).toHaveAttribute('placeholder', 'Clique ici pour ajouter un livrable…');
  await expect(page.locator('[data-prop="avancement"]')).toContainText('0 / 1 livrable');
  await expect(page.locator('[data-prop="avancement"]')).not.toContainText('livrables'); // pluriel seulement à partir de 2
  await expect(page.locator('.fiche-gauche')).not.toContainText(/tâche/i);
  await capturer(page, info, 'K1-fiche-projet');
});

test('K1b pluriel : « 0 / 2 livrables » dès qu’il y en a deux', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Audit des Lilas' });
  await creerTacheProjet('t1', { titre: 'Interview Carrel' });
  await creerTacheProjet('t2', { titre: 'Rapport', ordre: 2 });
  await connecter(page);
  await ouvrir(page, '#/projets/projets/pr1');
  await expect(page.locator('[data-prop="avancement"]')).toContainText('0 / 2 livrables');
});

test('K1c cas vide : « Aucun livrable pour le moment » dans la section et « Aucun livrable » dans le Résumé', async ({ page }, info) => {
  await creerProjet('pr1', { titre: 'Projet sans livrable' });
  await connecter(page);
  await ouvrir(page, '#/projets/projets/pr1');
  await expect(page.locator('[data-section="projet-taches"]')).toContainText('Aucun livrable pour le moment. Ajoute le premier ci-dessus.');
  await expect(page.locator('[data-prop="avancement"]')).toContainText('Aucun livrable');
  await expect(page.locator('.fiche-gauche')).not.toContainText(/tâche/i);
  await capturer(page, info, 'K1-cas-vide');
});

test('K1d ajout : le livrable apparaît dans sa phase ; cas d’erreur : titre vide refusé, et un échec d’enregistrement dit quoi faire', async ({ page }, info) => {
  await creerProjet('pr1', { titre: 'Audit des Lilas', phase: 'decouverte' });
  await connecter(page);
  await ouvrir(page, '#/projets/projets/pr1');
  const section = page.locator('[data-section="projet-taches"]');
  const champ = section.getByLabel('Nouveau livrable');
  await champ.click();
  await expect(section.locator('[data-action="ajouter-tache"]')).toBeDisabled(); // nuit 4 : grisé sans texte ; Entrée affiche le message
  await champ.press('Enter');
  await expect(page.locator('.toast', { hasText: 'Le titre est obligatoire.' })).toBeVisible();
  await champ.fill('Rapport final');
  await champ.press('Enter');
  await expect(section.locator('.tache[data-tache]')).toHaveCount(1);
  await expect(section.locator('.section-compteur')).toHaveText('0/1');
  await expect.poll(async () => (await listerDocuments('projets_taches')).map((d) => d.titre)).toEqual(['Rapport final']);
  // échec d'enregistrement : le projet disparaît de la mémoire de l'écran pendant la saisie (l'écriture ne peut pas se faire)
  await page.evaluate(async () => { const D = await import('/js/modules/projets/donnees.js'); D.etat.projets = []; });
  await champ.fill('Deuxième livrable');
  await champ.press('Enter');
  const erreur = page.locator('.toast-erreur', { hasText: 'Livrable non ajouté : vérifie ta connexion, puis réessaie' });
  await expect(erreur).toBeVisible();
  await expect(champ).toHaveValue('Deuxième livrable'); // la saisie revient, rien n'est perdu
  expect(await listerDocuments('projets_taches')).toHaveLength(1);
  await capturer(page, info, 'K1-cas-erreur');
});

test('K1e retrait : « Supprimer ce livrable ? », puis « Livrable supprimé » avec « Annuler », qui remet le livrable en place', async ({ page }, info) => {
  await creerProjet('pr1', { titre: 'Refonte site' });
  await creerTacheProjet('t1', { titre: 'Écrire le devis', date: jour(2) });
  await connecter(page);
  await ouvrir(page, '#/projets/projets/pr1');
  const avant = await lireDocument('projets_taches/t1');
  await page.locator('.tache[data-tache="t1"] [data-action="menu-tache"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Supprimer' }).click();
  await expect(dialogue(page)).toContainText('Supprimer ce livrable ?');
  await dialogue(page).getByRole('button', { name: 'Supprimer' }).click();
  const toast = page.locator('.toast', { hasText: 'Livrable supprimé' });
  await expect(toast).toBeVisible();
  await expect(toast.getByRole('button', { name: 'Annuler' })).toBeVisible();
  await capturer(page, info, 'K1-retrait');
  await toast.getByRole('button', { name: 'Annuler' }).click();
  await expect.poll(async () => await lireDocument('projets_taches/t1')).toEqual(avant);
});

test('K1f modifier : « Modifier le livrable », « Titre du livrable », « Confié à » et libellé de la case « Marquer comme fait »', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Refonte site' });
  await creerTacheProjet('t1', { titre: 'Écrire le devis' });
  await connecter(page);
  await ouvrir(page, '#/projets/projets/pr1');
  const ligne = page.locator('.tache[data-tache="t1"]');
  await expect(ligne.getByRole('button', { name: 'Marquer comme fait : Écrire le devis' })).toBeVisible();
  await ligne.locator('[data-action="menu-tache"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Modifier…' }).click();
  await expect(dialogue(page)).toContainText('Modifier le livrable');
  await expect(dialogue(page).getByLabel('Titre du livrable')).toBeVisible();
  await expect(dialogue(page)).not.toContainText(/tâche/i);
});

test('K1g historique : cocher un livrable écrit « Livrable fait : … » dans l’Historique du projet ; l’Accueil l’appelle un livrable', async ({ page }, info) => {
  await creerProjet('pr1', { titre: 'Audit des Lilas' });
  await creerTacheProjet('t1', { titre: 'Interview Carrel' });
  await creerTacheProjet('t2', { titre: 'Relire le devis', ordre: 2, date: jour(-2) });
  await connecter(page);
  // Accueil : la ligne du livrable en retard (bloc « À faire »)
  const retard = page.locator('[data-groupe="retard"]');
  await expect(retard.locator('.tache[data-tache="t2"]')).toContainText('Relire le devis');
  await expect(retard.getByRole('button', { name: 'Marquer comme fait : Relire le devis' })).toBeVisible();
  // fiche : cocher
  await ouvrir(page, '#/projets/projets/pr1');
  await page.locator('.tache[data-tache="t1"] .case-fait').click();
  await expect.poll(async () => (await listerDocuments('crm_evenements')).map((e) => e.texte)).toContain('Livrable fait : Interview Carrel');
  await expect(page.locator('.historique')).toContainText('Livrable fait : Interview Carrel');
  await expect(page.locator('.historique')).not.toContainText(/Tâche faite/);
  await capturer(page, info, 'K1-historique');
});

test('K1h modèle de projet et Réglages : colonne « Livrables », « Livrables du modèle », « Ajouter le livrable type », cas vide et retrait', async ({ page }, info) => {
  await ecrireDocument('crm_parametres/modeles_projet', { depart: true });
  await ecrireDocument('projets_modeles/m1', { nom: 'Audit', offreId: null, actif: true, ordre: 1, taches: [{ id: 'x1', titre: 'Interview', phase: 'decouverte', delaiJours: 3, ordre: 1 }] });
  await ecrireDocument('projets_modeles/m2', { nom: 'Modèle vide', offreId: null, actif: true, ordre: 2, taches: [] });
  await connecter(page);
  await ouvrir(page, '#/reglages/crm');
  await expect(page.locator('.tableau-modeles th', { hasText: 'Livrables' })).toBeVisible();
  await expect(page.locator('.tableau-modeles th', { hasText: 'Tâches' })).toHaveCount(0);
  await expect(page.locator('#reglages-modeles-projets')).toContainText('ses livrables de départ');
  await expect(page.locator('#reglages-modeles-projets')).not.toContainText(/tâche/i);
  await capturer(page, info, 'K1-reglages-modeles');
  // cas vide
  await ouvrir(page, '#/projets/modeles/m2');
  await expect(page.locator('[data-section="modele-taches"]')).toContainText('n’a pas encore de livrable');
  // fiche avec un livrable type
  await ouvrir(page, '#/projets/modeles/m1');
  const section = page.locator('[data-section="modele-taches"]');
  await expect(section.locator('.section-titre, h2, h3').first()).toContainText('Livrables du modèle');
  await expect(section.getByLabel('Nouveau livrable type')).toHaveAttribute('placeholder', 'Ajouter un livrable type…');
  await expect(section.getByRole('button', { name: 'Ajouter le livrable type' })).toBeVisible();
  await expect(page.locator('.fiche-modele')).not.toContainText(/tâche/i);
  await capturer(page, info, 'K1-modele');
  await section.locator('[data-tache-modele="x1"] [data-action="menu-tache-modele"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Supprimer' }).click();
  await expect(dialogue(page)).toContainText('Supprimer ce livrable type ?');
  await dialogue(page).getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.locator('.toast', { hasText: 'Livrable type supprimé' })).toBeVisible();
});

test('K1i le type d’activité garde son nom : la pastille « Tâche » existe encore sur une affaire', async ({ page }) => {
  const { creerAffaire } = await import('./outils.js');
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await creerPersonne('p1', { nom: 'Marie Durand' });
  await creerActivite('x1', { titre: 'Relancer', type: 'tache', affaireId: 'a1' });
  await connecter(page);
  await ouvrir(page, '#/crm/affaires/a1');
  await expect(page.locator('.pastille-type', { hasText: 'Tâche' }).first()).toBeVisible();
});
