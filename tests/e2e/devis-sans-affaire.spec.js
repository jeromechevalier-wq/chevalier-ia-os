// Module Devis : créer un devis SANS affaire (28/10/2026). Plus de page « Nouveau devis » : « Nouveau devis » crée le brouillon tout de suite et ouvre l'éditeur, où l'on choisit l'affaire.
// La finalisation, elle, exige l'affaire (même phrase à l'écran, dans la fonction du serveur et dans l'assistant : tests/devis-mcp.test.js SA1-SA2, devis-serveur.test.js SA4, devis-logique.test.js SA3).
// Un test par critère (le nom commence par son numéro) ; UNE capture : tests/e2e/captures/devis-sans-affaire/ (ordinateur ET téléphone).
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, listerDocuments, lireDocument, creerOrganisation, creerAffaire, choisirDansChampDevis } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-sans-affaire/', import.meta.url));
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
async function semer() {
  await creerOrganisation('o1', { nom: 'Société Exemple', emails: [{ valeur: 'contact@exemple.fr', type: 'travail' }] });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', organisationId: 'o1' });
}
async function ouvrirListe(page) {
  await connecter(page, undefined, { route: 'devis/liste' });
  await expect(page.locator('.page-liste-devis')).toBeVisible();
  await attendreCalme(page);
}
const editeur = (page) => page.locator('.page-editeur-devis[data-devis]');
const identifiant = (page) => page.url().split('/').pop();

test('1 « Nouveau devis » (liste vide, aucune affaire dans l’espace) crée le brouillon tout de suite, sans affaire, et ouvre l’éditeur qui invite à choisir l’affaire', async ({ page }, info) => {
  await ouvrirListe(page);
  await page.locator('[data-action="nouveau-devis-vide"]').click();
  await expect(editeur(page)).toBeVisible();
  await expect(page.locator('.page-nouveau-devis')).toHaveCount(0); // plus de page intermédiaire « Nouveau devis » / « Créer le brouillon »
  await expect(page.locator('[data-action="creer-brouillon"]')).toHaveCount(0);
  await expect(page.locator('[data-erreur="affaire"]')).toContainText('Facultatif tant que le devis est un brouillon');
  await expect(page.locator('[data-champ="affaire"]')).not.toHaveClass(/invalide/);
  await page.locator('[data-champ="affaire"]').fill('Ré'); // cas vide : aucune affaire à proposer, la liste le dit
  await expect(page.locator('.entete-droite .suggestion-vide')).toContainText('Aucune affaire ne correspond');
  const docs = await listerDocuments('devis_devis');
  expect(docs).toHaveLength(1);
  expect(docs[0].affaireId ?? null).toBeNull();
  expect(docs[0].statut).toBe('brouillon');
  await page.screenshot({ path: `${DOSSIER}1-devis-sans-affaire-${info.project.name}.png`, fullPage: true, animations: 'disabled' });
});

test('2 depuis la liste (bouton « Nouveau devis » du haut) puis choix de l’affaire dans l’éditeur : elle s’enregistre, le client est repris, et la liste dit « Sans affaire » tant qu’elle manque', async ({ page }) => {
  await semer();
  await ouvrirListe(page);
  await page.locator('[data-action="nouveau-devis-vide"]').click();
  await expect(editeur(page)).toBeVisible();
  const id = identifiant(page);
  await attendreCalme(page);
  // Brouillon sans affaire : il est dans la liste avec la mention « Sans affaire ».
  await page.locator('.lien-retour, [data-action="fermer"]').first().click();
  await expect(page.locator('.page-liste-devis')).toBeVisible();
  await expect(page.locator('[data-valeur="sans-affaire"]').first()).toHaveText('Sans affaire');
  await page.locator(`[data-id="${id}"]`).first().click();
  await expect(editeur(page)).toBeVisible();
  await choisirDansChampDevis(page, 'affaire', 'Réno', 'Rénovation cuisine');
  await expect(page.locator('[data-valeur="enregistrement"]')).toHaveText('Enregistré');
  await expect(page.locator('[data-erreur="affaire"]')).toBeHidden();
  const d = await lireDocument(`devis_devis/${id}`);
  expect(d.affaireId).toBe('a1');
  expect(d.organisationId).toBe('o1');
  await page.locator('.lien-retour, [data-action="fermer"]').first().click();
  await expect(page.locator('.page-liste-devis')).toBeVisible();
  await expect(page.locator('[data-valeur="sans-affaire"]')).toHaveCount(0);
});

test('3 finaliser un devis sans affaire est refusé à l’écran avec la phrase « Choisis l’affaire de ce devis. » : la fonction du serveur n’est pas appelée', async ({ page }) => {
  await semer();
  const appels = [];
  await page.route('**/devisFinaliser', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    appels.push(1);
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ok: true } }) });
  });
  await ouvrirListe(page);
  await page.locator('[data-action="nouveau-devis-vide"]').click();
  await expect(editeur(page)).toBeVisible();
  await attendreCalme(page);
  await editeur(page).locator('.bouton-principal').click();
  await expect(page.getByRole('dialog')).toContainText('Ce devis ne peut pas encore être finalisé');
  await expect(page.getByRole('dialog').locator('li').first()).toHaveText('Choisis l\'affaire de ce devis.');
  await page.getByRole('dialog').getByRole('button', { name: 'Compris' }).click();
  expect(appels).toHaveLength(0);
});

test('4 l’ancienne adresse #/devis/editeur (signet, menu « + » d’avant) crée un seul brouillon sans affaire et ouvre l’éditeur ; recharger la page ne crée rien de plus', async ({ page }) => {
  await connecter(page, undefined, { route: 'devis/editeur' });
  await expect(editeur(page)).toBeVisible();
  await attendreCalme(page);
  expect(await listerDocuments('devis_devis')).toHaveLength(1);
  const id = identifiant(page);
  expect(id).not.toBe('editeur');
  await page.reload();
  await expect(editeur(page)).toBeVisible();
  await attendreCalme(page);
  expect(identifiant(page)).toBe(id);
  expect(await listerDocuments('devis_devis')).toHaveLength(1);
});
