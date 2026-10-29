// Module Devis dans la barre du haut : le gros « + » propose « Devis » et la grande recherche trouve les devis (demande de Jérôme, 25/10/2026).
// Un test par critère (le nom commence par son numéro). Captures impossibles : session cloud.
// 1 le « + » propose « Devis », crée un brouillon et ouvre l'éditeur ; 2 la recherche trouve un devis par son numéro, son client ou son affaire, et un résultat ouvre l'éditeur ;
// 3 cas vide : moins de 2 lettres, aucun devis, devis archivé ou remplacé -> aucun résultat « Devis », la recherche des autres fiches marche toujours ;
// 4 cas d'erreur : un devis dont l'affaire ou le client a disparu reste trouvable par son numéro, sans casser la barre ;
// 5 module Devis éteint chez un client : ni « Devis » dans le « + », ni résultat de devis.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, listerDocuments, creerOrganisation, creerAffaire, estTelephone, PROJET, FIRESTORE, URL_APP, JEROME } from './outils.js';

async function devis(id, valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument(`devis_devis/${id}`, {
    racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', organisationId: 'o1', personneId: null, modeMarge: 'majoration', marge: 0, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, expireLe: '2026-11-23', destinataires: [], objet: '', sections: [], notesBasDePage: '',
    creePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, ...valeurs,
  });
}
async function semer() {
  await creerOrganisation('o1', { nom: 'Société Exemple' });
  await creerAffaire('a1', { titre: 'Rénovation restaurant', organisationId: 'o1' });
  await devis('d1', { numero: 'DEV-2026-10-24-001', statut: 'envoye' });
}
const plus = (page) => page.locator(estTelephone(page) ? '.bouton-plus-mobile' : '.bouton-plus:not(.bouton-plus-mobile)');
async function champ(page) {
  if (estTelephone(page)) await page.getByRole('button', { name: 'Rechercher' }).click();
  return page.locator('[data-role="recherche-globale"]');
}
const liste = (page) => page.locator('ul.suggestions[aria-label="Suggestions : Rechercher"]');

test('1 le gros « + » propose « Devis », crée un brouillon et ouvre l’éditeur', async ({ page }) => {
  await semer();
  await connecter(page);
  await plus(page).click();
  await expect(page.getByRole('menuitem')).toHaveText(['Personne', 'Organisation', 'Affaire', 'Projet', 'Devis']);
  await page.getByRole('menuitem', { name: 'Devis' }).click();
  await expect(page).toHaveURL(/#\/devis\/editeur\/[^/]+$/);
  const id = page.url().split('/').pop();
  await expect(page.locator(`.page-editeur-devis[data-devis="${id}"]`)).toBeVisible();
  await expect(page.locator('.page-nouveau-devis')).toHaveCount(0); // plus de page intermédiaire « Nouveau devis »
  await expect(page.locator('[data-action="creer-brouillon"]')).toHaveCount(0);
  const docs = await listerDocuments('devis_devis'); // la graine d1 + le brouillon tout juste créé
  expect(docs).toHaveLength(2);
  expect(docs.find((d) => d.id === id)?.statut).toBe('brouillon');
});

test('2 la grande recherche trouve un devis par son numéro, son client ou son affaire ; un résultat ouvre le devis', async ({ page }) => {
  await semer();
  await connecter(page);
  const c = await champ(page);
  for (const saisie of ['rénovation', 'société exe', 'DEV-2026-10-24']) {
    await c.fill(saisie);
    await expect(liste(page).locator('.suggestion-groupe', { hasText: 'Devis' })).toHaveCount(1);
    await expect(liste(page).locator('.suggestion', { hasText: 'DEV-2026-10-24-001' })).toHaveCount(1);
    await expect(liste(page)).toContainText('Société Exemple · Rénovation restaurant');
  }
  await c.press('Enter'); // sans flèche : ouvre le premier résultat
  await expect(page).toHaveURL(/#\/devis\/voir\/d1$/); // le devis de la graine est envoyé : il s'ouvre en visualisation
  await expect(page.locator('.page-editeur-devis[data-devis="d1"]')).toBeVisible();
  await attendreCalme(page);
  // Deux rôles distincts : la barre du haut ouvre un résultat ; les autres fiches restent trouvées dans la même liste.
  await page.evaluate(() => { location.hash = '#/crm/accueil'; });
  const c2 = await champ(page);
  await c2.fill('rénovation');
  await expect(liste(page).locator('.suggestion-groupe')).toHaveText(['Affaires', 'Devis']);
  await liste(page).locator('.suggestion', { hasText: 'DEV-2026-10-24-001' }).click();
  await expect(page).toHaveURL(/#\/devis\/voir\/d1$/);
});

test('3 cas vide : moins de 2 lettres, aucun devis, devis archivé ou remplacé -> aucun résultat « Devis »', async ({ page }) => {
  await creerOrganisation('o1', { nom: 'Société Exemple' });
  await creerAffaire('a1', { titre: 'Rénovation restaurant', organisationId: 'o1' });
  await connecter(page);
  const c = await champ(page);
  await c.fill('rénovation'); // aucun devis : seule l'affaire sort
  await expect(liste(page).locator('.suggestion-groupe')).toHaveText(['Affaires']);
  await devis('d1', { numero: 'DEV-2026-10-24-001', statut: 'envoye' });
  await devis('d2', { numero: 'DEV-2026-10-20-009', statut: 'envoye', archive: true });
  await devis('d3', { numero: 'DEV-2026-10-21-004', statut: 'remplace' });
  await attendreCalme(page);
  await c.fill('d'); // la barre ne cherche qu'à partir de 2 lettres (MIN_LETTRES), comme pour les fiches
  await expect(liste(page).locator('.suggestion')).toHaveCount(0);
  await c.fill('DEV-2026');
  await expect(liste(page).locator('.suggestion')).toHaveCount(1);
  await expect(liste(page)).not.toContainText('DEV-2026-10-20-009');
  await expect(liste(page)).not.toContainText('DEV-2026-10-21-004');
});

test('4 cas d’erreur : un devis dont l’affaire a disparu reste trouvable par son numéro et s’ouvre quand même (visualisation, le devis est envoyé)', async ({ page }) => {
  await devis('d9', { numero: 'DEV-2026-10-22-002', statut: 'envoye', affaireId: 'disparue', organisationId: null });
  await connecter(page);
  const c = await champ(page);
  await c.fill('DEV-2026-10-22');
  await expect(liste(page).locator('.suggestion')).toHaveCount(1);
  await c.press('Enter');
  await expect(page).toHaveURL(/#\/devis\/voir\/d9$/);
  await expect(page.locator('.coquille')).toBeVisible();
});

test.describe('5 module Devis éteint chez un client', () => {
  const ALICE = 'alice@exemple.test';
  const chargerRegles = async (fichier) => {
    const contenu = await readFile(fileURLToPath(new URL(`../../${fichier}`, import.meta.url)), 'utf8');
    const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: fichier, content: contenu }] } }),
    });
    if (!r.ok) throw new Error(`Règles non chargées (${fichier}) : ${await r.text()}`);
  };
  test.beforeAll(() => chargerRegles('firestore.plateforme.rules'));
  test.afterAll(() => chargerRegles('firestore.rules'));

  test('5 sans le module Devis, le « + » n’a pas « Devis » et la recherche ne propose aucun devis ; avec le module, les deux y sont', async ({ page }) => {
    for (const [id, modules] of [['sans', { affaires: true }], ['avec', { affaires: true, devis: true }]]) {
      await ecrireDocument(`marques/${id}`, { actif: true, nom: `Cabinet ${id}`, couleur: '#336699', accueil: 'Bienvenue.' });
      await ecrireDocument(`clients/${id}/membres/${ALICE}`, { role: 'editeur' });
      await ecrireDocument(`clients/${id}`, { modules, equipe: [{ email: ALICE, role: 'editeur' }] });
      await ecrireDocument(`clients/${id}/crm_organisations/o1`, { nom: 'Société Exemple', archive: false });
      await ecrireDocument(`clients/${id}/crm_affaires/a1`, { titre: 'Rénovation restaurant', organisationId: 'o1', archive: false });
      await ecrireDocument(`clients/${id}/devis_devis/d1`, { numero: 'DEV-2026-10-24-001', statut: 'envoye', affaireId: 'a1', organisationId: 'o1', archive: false, racineId: 'd1', version: 1 });
    }
    const ouvrir = async (id) => {
      await page.goto('about:blank');
      await page.goto(`${URL_APP}#/espace/${id}`);
      await page.waitForFunction(() => !!window.__chevalierTest);
      await page.evaluate((e) => window.__chevalierTest.connecter(e, true), ALICE);
      await expect(page.locator('.coquille')).toBeVisible();
    };
    await ouvrir('sans');
    await plus(page).click();
    await expect(page.getByRole('menuitem', { name: 'Devis' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    const c = await champ(page);
    await c.fill('DEV-2026');
    await expect(liste(page).locator('.suggestion')).toHaveCount(0);
    await c.fill('rénovation');
    await expect(liste(page)).not.toContainText('DEV-2026-10-24-001');
    await ouvrir('avec');
    await plus(page).click();
    await expect(page.getByRole('menuitem', { name: 'Devis' })).toBeVisible();
    await page.keyboard.press('Escape');
    const c2 = await champ(page);
    await c2.fill('DEV-2026');
    await expect(liste(page)).toContainText('DEV-2026-10-24-001');
  });
});
