// Journal commun dans la coque (11/11/2026) : `executer` et l'écran Journal ont quitté le module Affaires. Chez Jérôme (racine).
// Un test par critère (A1 à A5, nom commençant par le numéro), UNE capture par critère dans tests/e2e/captures/journal-coque/ (« -telephone » sur téléphone).
// Le même écran chez un client sans Affaires : tests/e2e/journal-coque-client.spec.js (règles de la plateforme chargées le temps du fichier).
import { test, expect, attendreCalme, connecter, allerA, choisirDansMenuUtilisateur, listerDocuments, estTelephone, JEROME } from './outils.js';

const CAPTURES = 'e2e/captures/journal-coque';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
// Ces écrans n'utilisent pas Google : le script de l'API est remplacé par un fichier vide (sans réseau, il ne produit pas d'erreur de console).
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});
const dialogue = (page) => page.getByRole('dialog');
const lignes = (page) => page.locator('.tableau-journal tbody tr');
/** Appelle une fonction exportée par un fichier de l'appli (celle que les écrans appellent). */
const appeler = (page, module, fonction, ...args) => page.evaluate(async ([m, f, a]) => (await import(m))[f](...a), [module, fonction, args]);
async function attendre(collection, predicat) {
  await expect.poll(async () => (await listerDocuments(collection)).find(predicat) ?? null, { timeout: 10_000 }).not.toBeNull();
  return (await listerDocuments(collection)).find(predicat);
}

test('A1 créer une personne par l’écran écrit, d’un seul lot, la fiche + une ligne crm_audit + sa copie crm_audit_avant (mêmes champs qu’avant le déplacement)', async ({ page }) => {
  await connecter(page);
  await allerA(page, 'Personnes');
  await page.locator('.page-actions [data-action="nouvelle-personne"]').click();
  await expect(dialogue(page)).toBeVisible();
  await dialogue(page).getByLabel('Nom', { exact: true }).fill('Alice Exemple');
  await dialogue(page).getByLabel('Nom', { exact: true }).press('Enter');
  await expect(dialogue(page)).toHaveCount(0);
  const personne = await attendre('crm_personnes', (d) => d.nom === 'Alice Exemple');
  const ligne = await attendre('crm_audit', (d) => d.docId === personne.id);
  expect([ligne.collection, ligne.action, ligne.via, ligne.jeton, ligne.statut, ligne.acteur]).toEqual(['crm_personnes', 'creer', 'ecran', 'ecran', 'succes', JEROME]);
  expect(ligne.operationId).toBeTruthy();
  expect(ligne.champsModifies).toContain('nom');
  const copie = (await listerDocuments('crm_audit_avant')).find((d) => d.id === ligne.id); // même identifiant que la ligne
  expect(copie, 'la copie avant/après existe, au même identifiant').toBeTruthy();
  expect(copie.avant).toBeNull();
  expect(copie.apres.nom).toBe('Alice Exemple');
  await allerA(page, 'Journal des modifications');
  await expect(lignes(page)).toHaveCount(1);
  await expect(lignes(page).first()).toContainText('Création de 1 personne');
  await capture(page, 'A1-journal-apres-creation');
});

test('A2 un plan de plus de 130 actions s’écrit en plusieurs lots ; si le lot suivant échoue, le Journal garde la ligne « Échec » et l’erreur dit que c’est à moitié fait', async ({ page }) => {
  await connecter(page);
  // 130 créations valides (un lot), puis une modification d'un document qui n'existe pas : le 2e lot est refusé, le 1er est déjà écrit.
  const ecritures = Array.from({ length: 130 }, (_, i) => ({ type: 'creer', collection: 'crm_notes', id: `note-lot-${i}`, donnees: { texte: `Note ${i}` } }));
  ecritures.push({ type: 'modifier', collection: 'crm_notes', id: 'note-absente', patch: { texte: 'Impossible' } });
  const message = await page.evaluate(async (e) => {
    try { await (await import('/js/os/journal-donnees.js')).executer(e, 'essai-lots'); return 'aucune erreur'; } catch (err) { return err.message; }
  }, ecritures);
  expect(message).toContain('130 éléments sur 131 ont été traités');
  expect((await listerDocuments('crm_notes')).length, 'le premier lot est bien écrit').toBe(130);
  const echec = await attendre('crm_audit', (d) => d.action === 'echec');
  expect([echec.statut, echec.via, echec.outil]).toEqual(['echec', 'ecran', 'essai-lots']);
  expect(echec.erreur).toContain('130 éléments sur 131');
  expect((await listerDocuments('crm_audit')).filter((d) => d.action === 'creer' && d.operationId === echec.operationId).length, 'le lot réussi a laissé ses 130 lignes, de la même opération').toBe(130);
  await allerA(page, 'Journal des modifications');
  await expect(lignes(page).filter({ hasText: 'Échec' })).toHaveCount(1);
  await capture(page, 'A2-journal-echec');
});

test('A3 #/crm/journal affiche le même écran qu’avant (barre commune, filtres, détail avant/après) ; journal vide = le texte habituel', async ({ page }) => {
  await connecter(page, JEROME, { route: 'crm/journal' });
  await expect(page.getByRole('heading', { name: 'Journal des modifications', level: 1 })).toBeVisible();
  await expect(page.getByText('Le journal est vide : rien n’a encore été écrit.')).toBeVisible();
  await expect(page.locator('[data-action="filtres"]')).toHaveCount(1);
  await expect(page.getByLabel('Rechercher dans le journal')).toBeVisible();
  await expect(page.getByLabel('Depuis le')).toBeVisible();
  await appeler(page, '/js/modules/crm/donnees.js', 'creerPersonne', { nom: 'Bruno Exemple' });
  await page.locator('[data-action="actualiser-journal"]').click();
  await expect(lignes(page)).toHaveCount(1);
  await expect(page.getByText(/Tout le journal est chargé \(\d+ lignes?\)\./)).toBeVisible();
  await lignes(page).first().click();
  await expect(dialogue(page)).toBeVisible();
  await expect(dialogue(page).locator('.tableau-differences').first()).toBeVisible(); // la copie avant / après se lit depuis la coque
  await expect(dialogue(page).locator('.diff-apres', { hasText: 'Bruno Exemple' }).first()).toBeVisible();
  await capture(page, 'A3-journal-crm-detail');
});

test('A4 #/journal affiche l’écran de la coque ; l’entrée « Voir le journal des modifications » du menu compte y mène', async ({ page }) => {
  await connecter(page);
  await appeler(page, '/js/modules/crm/donnees.js', 'creerPersonne', { nom: 'Chloé Exemple' });
  await choisirDansMenuUtilisateur(page, 'Voir le journal des modifications');
  await expect(page).toHaveURL(/#\/journal$/);
  await expect(page.getByRole('heading', { name: 'Journal des modifications', level: 1 })).toBeVisible();
  await expect(lignes(page)).toHaveCount(1);
  if (estTelephone(page)) await expect(page.locator('.coquille.menu-ouvert')).toHaveCount(0);
  // l'adresse directe (signet) marche aussi après un rechargement complet
  await page.reload();
  await page.waitForFunction(() => !!window.__chevalierTest);
  await expect(page.getByRole('heading', { name: 'Journal des modifications', level: 1 })).toBeVisible();
  await capture(page, 'A4-journal-coque');
});

test('A5 js/modules/crm/journal.js n’existe plus ; à la déconnexion les filtres du Journal sont oubliés (oublierFiltresJournal)', async ({ page }) => {
  expect((await page.request.get('/js/modules/crm/journal.js')).status(), 'l’ancien fichier n’est plus servi').not.toBe(200);
  expect((await page.request.get('/js/os/journal.js')).status()).toBe(200);
  await connecter(page, JEROME, { route: 'journal' });
  await appeler(page, '/js/modules/crm/donnees.js', 'creerPersonne', { nom: 'Denis Exemple' });
  await page.locator('[data-action="actualiser-journal"]').click();
  await expect(lignes(page)).toHaveCount(1);
  await page.locator('[data-action="filtres"]').click();
  await dialogue(page).locator('input[data-cle="canaux"][data-valeur="mcp"]').check();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('[data-action="filtres"] .compteur-filtres')).toHaveText('1');
  await choisirDansMenuUtilisateur(page, 'Se déconnecter');
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
  await page.evaluate((e) => window.__chevalierTest.connecter(e, true), JEROME);
  await expect(page.locator('.coquille')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Journal des modifications', level: 1 })).toBeVisible();
  await attendreCalme(page);
  await expect(page.locator('[data-action="filtres"] .compteur-filtres')).toHaveCount(0); // filtre oublié
  await capture(page, 'A5-filtres-oublies');
});
