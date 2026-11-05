// Mode test, PR 1b : un élément de test n'entre dans AUCUN chiffre (Accueil, objectifs, graphique, total du Kanban) mais reste visible avec « [TEST] ; la recherche du haut le trouve par le mot « test ».
// Un test par point, le nom commence par son numéro : 2 affaires par étape, 3 objectif, 4 graphique du CA, 5 Kanban des affaires, 7 recherche.
// Captures dans tests/e2e/captures/mode-test-statistiques/ (ordinateur ET téléphone).
import { fileURLToPath } from 'node:url';
import {
  test, expect, connecter, allerA, valeurObjectif, creerPersonne, creerAffaire, creerProjet, estTelephone, jour,
} from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/mode-test-statistiques/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });

test.beforeEach(async ({ page }) => {
  await page.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
});

test('2 affaires par étape : une affaire de test dans « Rendez-vous fixé » ne fait pas bouger la barre', async ({ page }, info) => {
  await creerAffaire('aR', { titre: 'Audit réel', etape: 'rdv_fixe' });
  await creerAffaire('aT', { titre: 'Audit essai', etape: 'rdv_fixe', test: true });
  await connecter(page);
  await expect(page.locator('.stats-etapes li[data-etape="rdv_fixe"] .barre-nombre')).toHaveText('1');
  await capturer(page, info, '2-accueil-etapes');
});

test('3 objectif « Nouveaux contacts » : une personne de test ce mois-ci ne compte pas, une personne réelle compte', async ({ page }, info) => {
  await creerPersonne('pT', { nom: 'Paul Essai', test: true });
  await connecter(page);
  await expect(page.locator('.objectif[data-objectif="nouveaux_contacts"]')).toBeVisible();
  expect(await valeurObjectif(page, 'nouveaux_contacts')).toBe(0);
  await creerPersonne('pR', { nom: 'Rita Réelle' });
  await expect.poll(() => valeurObjectif(page, 'nouveaux_contacts')).toBe(1);
  await capturer(page, info, '3-objectif');
});

test('4 graphique « Chiffre d’affaires encaissé » : une facture payée de 100 € sur un projet de test ne remplit pas la colonne ; sur un projet réel : 100 €', async ({ page }, info) => {
  const mois = jour(0).slice(0, 7);
  const facture = { id: 'f1', statut: 'payee', montant: 100, dateEnvoi: jour(0), datePaiement: jour(0), numero: 'F1' };
  await creerProjet('prT', { titre: 'Chantier essai', test: true, factures: [facture] });
  await connecter(page);
  const colonne = page.locator(`.colonne-ca[data-mois="${mois}"]`);
  await expect(colonne).toBeVisible();
  // Signal de chargement AVANT le négatif : le projet de test est bien dans l'état de l'écran (sinon l'absence de « 100 » pourrait être vraie à vide).
  await expect.poll(() => page.evaluate(async () => (await import('/js/modules/projets/donnees.js')).etat.projets.length)).toBe(1);
  await expect(colonne).toBeVisible();
  await expect(colonne.locator('.colonne-valeur')).not.toContainText('100');
  await creerProjet('prR', { titre: 'Chantier réel', factures: [{ ...facture, id: 'f2' }] });
  await expect(colonne.locator('.colonne-valeur')).toContainText('100');
  await capturer(page, info, '4-graphique-ca');
});

test('5 Kanban des affaires : le montant exclut l’essai, le nombre compte les cartes affichées (la carte [TEST] reste visible)', async ({ page }, info) => {
  await creerAffaire('aR', { titre: 'Audit réel', etape: 'rdv_fixe', montant: 2000 });
  await creerAffaire('aT', { titre: 'Audit essai', etape: 'rdv_fixe', montant: 100, test: true });
  await connecter(page);
  await allerA(page, 'Affaires');
  const colonne = page.locator('.colonne[data-colonne="rdv_fixe"]');
  await expect(colonne.locator('.colonne-totaux')).toHaveText('2 000 € · 2 affaires');
  await expect(colonne.locator('.carte-affaire[data-affaire="aT"]')).toContainText('[TEST]');
  await capturer(page, info, '5-kanban-affaires');
});

test('7 recherche du haut : « test » ramène les essais avec « [TEST] » devant le nom, pas les fiches réelles', async ({ page }, info) => {
  await creerPersonne('pT', { nom: 'Paul Essai', test: true });
  await creerPersonne('pR', { nom: 'Rita Réelle' });
  await creerAffaire('aT', { titre: 'Audit essai', test: true });
  await creerAffaire('aR', { titre: 'Audit réel' });
  await connecter(page);
  if (estTelephone(page)) await page.locator('[data-role="ouvrir-recherche"]').click();
  await page.locator('[data-role="recherche-globale"]').fill('test');
  const liste = page.locator('ul.suggestions[aria-label="Suggestions : Rechercher"]');
  await expect(liste.locator('.suggestion', { hasText: '[TEST] Paul Essai' })).toHaveCount(1);
  await expect(liste.locator('.suggestion', { hasText: '[TEST] Audit essai' })).toHaveCount(1);
  await expect(liste).not.toContainText('Rita Réelle');
  await expect(liste).not.toContainText('Audit réel');
  await capturer(page, info, '7-recherche-test');
});
