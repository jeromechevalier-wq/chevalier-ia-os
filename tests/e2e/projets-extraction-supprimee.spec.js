// Suppression de l'« Extraction de valeur » (décision de Jérôme, 18/10/2026). Un test par point du brief (X1 à X7), UNE capture par point,
// enregistrée dans ~/chantiers-crm/captures-suppression-extraction/ (« -tel » pour le format téléphone).
// X6 (l'outil MCP `extraire_valeur_projet`) n'a pas d'écran : il est testé dans tests/mcp-clients.test.js et tests/ecriture-outils.test.js.
import { mkdir } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';
import {
  test, expect, connecter, allerA, allerAuxReglagesCrm, creerPersonne, creerOrganisation, creerAffaire, creerProjet, lireDocument, listerDocuments, estTelephone,
} from './outils.js';

test.describe.configure({ mode: 'parallel' });

const DOSSIER_CAPTURES = join(homedir(), 'chantiers-crm', 'captures-suppression-extraction');
const dialogue = (page) => page.getByRole('dialog');

async function capture(page, point) {
  await mkdir(DOSSIER_CAPTURES, { recursive: true });
  await page.screenshot({ path: join(DOSSIER_CAPTURES, `${point}${estTelephone(page) ? '-tel' : ''}.png`), animations: 'disabled' });
}
async function aller(page, hash) {
  await page.evaluate((h) => { location.hash = h; }, hash);
}
async function attendre(collection, predicat) {
  await expect.poll(async () => (await listerDocuments(collection)).find(predicat) ?? null, { timeout: 10_000 }).not.toBeNull();
  return (await listerDocuments(collection)).find(predicat);
}
/** Une ancienne extraction, telle qu'elle existe déjà dans les données (créée avant le 18/10/2026). */
const ANCIENNE = { titre: 'Extraction : Audit des Lilas', nature: 'extraction', affaireId: 'a1', projetSourceId: 'pr9', modeleId: 'extraction', raisonPerdue: 'Prix', raisonPerdueDetail: 'Trop cher', phase: 'decouverte' };

test('X1 Réglages du CRM : l’interrupteur « Extraction de valeur » n’existe plus', async ({ page }) => {
  await connecter(page);
  await allerAuxReglagesCrm(page);
  await expect(page.locator('[data-option="suiviPaiements"]')).toBeVisible(); // les autres interrupteurs sont toujours là
  await expect(page.locator('[data-option="extractionValeur"]')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('Extraction de valeur');
  await page.locator('[data-option="suiviPaiements"]').scrollIntoViewIfNeeded();
  await capture(page, 'X1');
});

test('X2 une affaire perdue ou gagnée sans projet ne crée aucun projet d’extraction : ni message, ni bloc', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas', etape: 'proposition_envoyee', offreId: 'audit' });
  await creerAffaire('a2', { titre: 'Atelier Martin', etape: 'proposition_envoyee' });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  await page.locator('.fiche-actions [data-action="perdue"]').click();
  await dialogue(page).getByLabel('Raison', { exact: true }).selectOption('Prix');
  await dialogue(page).getByRole('button', { name: 'Marquer comme perdue' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  await expect.poll(async () => (await lireDocument('crm_affaires/a1'))?.statut).toBe('perdue');
  await expect(page.locator('.toast', { hasText: 'Affaire marquée comme perdue' })).toBeVisible();
  await expect(page.locator('.toast', { hasText: 'extraction' })).toHaveCount(0);
  await expect(page.locator('[data-bloc="extraction"]')).toHaveCount(0);
  // affaire gagnée sans projet : seuls « Créer le projet » et « Lier un projet » sont proposés
  await aller(page, '#/crm/affaires/a2');
  await page.locator('[data-action="choisir-etape"]').selectOption('gagne'); // J9 : par la liste « Étape » du Résumé
  await expect(page.locator('.celebration')).toBeVisible();
  await page.locator('.celebration').click();
  await expect.poll(async () => (await lireDocument('crm_affaires/a2'))?.statut).toBe('gagnee');
  await expect(page.locator('[data-section="affaire-projet"] [data-action="creer-projet"]')).toBeVisible();
  await expect(page.locator('[data-bloc="extraction"]')).toHaveCount(0);
  await page.waitForTimeout(800);
  expect(await listerDocuments('projets_projets')).toHaveLength(0);
  expect(await listerDocuments('projets_taches')).toHaveLength(0);
  await capture(page, 'X2');
});

test('X3 les modèles de départ sont Audit et Accompagnement : plus de modèle « Extraction » ni de colonne « Nature »', async ({ page }) => {
  await connecter(page);
  await expect.poll(async () => (await listerDocuments('projets_modeles')).length, { timeout: 15_000 }).toBe(2);
  expect((await listerDocuments('projets_modeles')).map((m) => m.id).sort()).toEqual(['accompagnement', 'audit']);
  await aller(page, '#/reglages/crm');
  await expect(page.locator('.tableau-modeles .ligne-liste')).toHaveCount(2);
  await expect(page.locator('.tableau-modeles')).not.toContainText('Extraction');
  await expect(page.locator('.tableau-modeles th', { hasText: 'Nature' })).toHaveCount(0);
  await page.locator('#reglages-modeles-projets').scrollIntoViewIfNeeded();
  await capture(page, 'X3');
});

test('X4 écrans Projets : plus de badge « Extraction », plus de filtre « Nature », plus de bouton « Extraire la valeur »', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Audit Carrel', phase: 'lancement' });
  await creerProjet('ex1', { ...ANCIENNE, affaireId: null, titre: 'Extraction : Ancien chantier' });
  await connecter(page);
  await allerA(page, 'Projets');
  await expect(page.locator('.carte-projet')).toHaveCount(2); // l'ancienne extraction est toujours là, comme un projet ordinaire
  await expect(page.locator('.badge-nature')).toHaveCount(0);
  await expect(page.locator('.carte-projet[data-projet="ex1"]')).not.toContainText('· Extraction');
  await page.locator('[data-action="filtres"]').click();
  await expect(dialogue(page).getByText('Nature', { exact: true })).toHaveCount(0);
  await expect(dialogue(page).getByLabel('Extraction de valeur')).toHaveCount(0);
  await capture(page, 'X4-filtres');
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await aller(page, '#/projets/projets/pr1');
  await expect(page.locator('.fiche')).toBeVisible();
  await expect(page.locator('.fiche-actions [data-action="extraire"]')).toHaveCount(0);
  await expect(page.locator('[data-prop="extraction"]')).toHaveCount(0);
  await expect(page.locator('.fiche')).not.toContainText('Extraire la valeur');
  await capture(page, 'X4');
});

test('X5 terminer un projet : le message est « Projet terminé ! », jamais « Extraction terminée ! », même pour une ancienne extraction', async ({ page }) => {
  await creerProjet('ex1', { ...ANCIENNE, affaireId: null, projetSourceId: 'pr9' });
  await connecter(page);
  await aller(page, '#/projets/projets/ex1');
  await expect(page.locator('.titre-editable')).toHaveValue('Extraction : Audit des Lilas');
  await page.locator('.fiche-actions [data-action="terminer"]').click();
  await expect(page.locator('.celebration-cloture')).toBeVisible();
  await expect(page.locator('.celebration-cloture')).toContainText('Projet terminé !');
  await expect(page.locator('.celebration-cloture')).not.toContainText('Extraction terminée');
  await capture(page, 'X5');
  await page.locator('.celebration').click();
  await expect(page.locator('.celebration')).toHaveCount(0);
  await expect(page.locator('.toast', { hasText: 'Projet terminé' })).toBeVisible();
  await expect(page.locator('.toast', { hasText: 'extraction' })).toHaveCount(0);
  await expect.poll(async () => (await lireDocument('projets_projets/ex1'))?.statut).toBe('termine');
  expect(await listerDocuments('projets_projets')).toHaveLength(1); // aucun nouveau projet
});

test('X7 une ancienne extraction (nature « extraction », avec source et affaire) reste lisible et se comporte comme un projet ordinaire, sans écriture ni erreur', async ({ page }) => {
  const erreurs = [];
  page.on('pageerror', (e) => erreurs.push(e.message));
  await creerOrganisation('o1', { nom: 'Atelier des Lilas' });
  await creerPersonne('p1', { nom: 'Camille Durand', organisationId: 'o1' });
  await creerAffaire('a1', { titre: 'Audit des Lilas', personneId: 'p1', organisationId: 'o1', etape: 'rdv_fixe', statut: 'perdue' });
  await creerProjet('pr9', { titre: 'Projet source', personneId: 'p1', organisationId: 'o1', statut: 'termine', archive: true });
  await creerProjet('ex1', { ...ANCIENNE, personneId: 'p1', organisationId: 'o1' });
  const avant = await lireDocument('projets_projets/ex1');
  await connecter(page);
  // dans la liste des projets et sur la fiche de la personne, comme un projet ordinaire
  await allerA(page, 'Projets');
  await expect(page.locator('.carte-projet[data-projet="ex1"]')).toContainText('Extraction : Audit des Lilas');
  await aller(page, '#/crm/personnes/p1');
  await expect(page.locator('[data-section="personne-projets"] .carte-projet-mini', { hasText: 'Extraction : Audit des Lilas' })).toBeVisible();
  // sa fiche s'ouvre : titre, affaire d'origine, phase ; on change la phase comme pour tout projet
  await aller(page, '#/projets/projets/ex1');
  await expect(page.locator('.titre-editable')).toHaveValue('Extraction : Audit des Lilas');
  await expect(page.locator('[data-prop="affaire"]')).toContainText('Audit des Lilas');
  await expect(page.locator('.fiche-sous .badge-nature')).toHaveCount(0);
  await expect(page.locator('[data-prop="source"], [data-prop="raison-perte"]')).toHaveCount(0);
  await page.locator('[data-action="choisir-phase"]').selectOption('livraison');
  await expect.poll(async () => (await lireDocument('projets_projets/ex1'))?.phase).toBe('livraison');
  // les anciens champs n'ont pas bougé (aucune migration)
  const apres = await lireDocument('projets_projets/ex1');
  expect([apres.nature, apres.projetSourceId, apres.affaireId, apres.modeleId, apres.raisonPerdue]).toEqual([avant.nature, avant.projetSourceId, avant.affaireId, avant.modeleId, avant.raisonPerdue]);
  // supprimer le projet source ne touche pas à l'ancienne extraction
  await aller(page, '#/projets/projets/pr9');
  await page.locator('[data-action="menu-fiche"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: /Supprimer définitivement/ }).click();
  await dialogue(page).getByLabel(/Tape « Projet source »/).fill('Projet source');
  await dialogue(page).getByRole('button', { name: 'Supprimer' }).click();
  await expect.poll(async () => await lireDocument('projets_projets/pr9')).toBeNull();
  await page.waitForTimeout(600);
  expect((await lireDocument('projets_projets/ex1')).projetSourceId).toBe('pr9');
  await aller(page, '#/projets/projets/ex1');
  await expect(page.locator('.fiche')).toBeVisible();
  await capture(page, 'X7');
  expect(erreurs).toEqual([]);
});
