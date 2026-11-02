// Mode test, PR 1a-1 : le repère `test`, le badge « [TEST] » et les menus « Marquer comme test » (sans interrupteur ni héritage : PR 1a-2).
// Un test par critère (le nom commence par son numéro : 1 absent = réel, 2 badge calculé, 3 marquer / démarquer, 4 renommer, 5 refus, 6 badge dans liste, carte et éditeur de devis).
// Captures dans tests/e2e/captures/mode-test/ (ordinateur ET téléphone).
import { fileURLToPath } from 'node:url';
import {
  test, expect, connecter, attendreCalme, ecrireDocument, lireDocument, creerPersonne, creerOrganisation, creerAffaire, creerProjet, JEROME,
} from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/mode-test/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
const menu = (page) => page.locator('.menu-pop');
const jourDansLe = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

async function devis(id, valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument(`devis_devis/${id}`, {
    racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: null, personneId: null, organisationId: 'o1', modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: jourDansLe(60), objet: 'Rénovation',
    sections: [], creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, ...valeurs,
  });
}
const ouvrirMenuFiche = async (page) => { await page.locator('[data-action="menu-fiche"]').click(); await expect(menu(page)).toBeVisible(); };
const choisir = async (page, nom) => menu(page).getByRole('menuitem', { name: nom, exact: true }).click();
test.beforeEach(async ({ page }) => {
  await page.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
});
const badges = (page) => page.locator('.badge-test:visible');

test('1 test absent ou false : aucun badge nulle part ; une fiche réelle s’affiche comme avant', async ({ page }, info) => {
  await creerAffaire('a-absent', { titre: 'Audit des Lilas', etape: 'rdv_fixe' });
  await creerAffaire('a-faux', { titre: 'Audit des Roses', etape: 'rdv_fixe', test: false });
  await connecter(page, JEROME, { route: 'crm/affaires' });
  await page.locator('.bascule-vue[data-vue="kanban"]').click();
  await expect(page.locator('.carte-affaire')).toHaveCount(2);
  await expect(page.locator('.badge-test')).toHaveCount(0);
  await expect(page.locator('.carte-affaire[data-affaire="a-absent"] .carte-titre')).toHaveText('Audit des Lilas');
  await page.goto('/?emulateurs=1#/crm/affaires/a-faux');
  await expect(page.locator('.fiche-titre input.titre-editable')).toHaveValue('Audit des Roses');
  await expect(page.locator('.badge-test')).toHaveCount(0);
  await ouvrirMenuFiche(page);
  await expect(menu(page).getByRole('menuitem', { name: 'Marquer comme test', exact: true })).toBeVisible(); // false = réel : on propose de marquer
});

test('2 le badge est calculé : « [TEST] » à côté du titre sur la carte, la ligne de liste et la fiche, sans toucher au nom stocké', async ({ page }, info) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas', etape: 'rdv_fixe', test: true });
  await connecter(page, JEROME, { route: 'crm/affaires' });
  await page.locator('.bascule-vue[data-vue="kanban"]').click();
  await expect(page.locator('.carte-affaire[data-affaire="a1"] .badge-test')).toHaveText('[TEST]');
  await capturer(page, info, '2-carte');
  await page.locator('.bascule-vue[data-vue="liste"]').click();
  await expect(page.locator('tr', { hasText: 'Audit des Lilas' }).locator('.badge-test')).toHaveText('[TEST]');
  await capturer(page, info, '2-liste');
  await page.goto('/?emulateurs=1#/crm/affaires/a1');
  await expect(page.locator('.fiche-sous .badge-test')).toHaveText('[TEST]');
  await expect(page.locator('.fiche-titre input.titre-editable')).toHaveValue('Audit des Lilas'); // le badge n'est PAS dans le champ du titre
  await capturer(page, info, '2-fiche');
  expect((await lireDocument('crm_affaires/a1')).titre).toBe('Audit des Lilas');
});

test('3 « Marquer comme test » puis « Ce n’est plus un test » depuis le menu « … » : personne, organisation, affaire, projet', async ({ page }, info) => {
  await creerPersonne('p1', { nom: 'Marie Durand' });
  await creerOrganisation('o1', { nom: 'Durand SARL' });
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await creerProjet('pr1', { titre: 'Chantier des Lilas' });
  const cas = [
    ['crm/personnes/p1', 'crm_personnes/p1', 'nom'], ['crm/organisations/o1', 'crm_organisations/o1', 'nom'],
    ['crm/affaires/a1', 'crm_affaires/a1', 'titre'], ['projets/projets/pr1', 'projets_projets/pr1', 'titre'],
  ];
  await connecter(page, JEROME, { route: cas[0][0] });
  for (const [route, chemin, champNom] of cas) {
    await page.goto(`/?emulateurs=1#/${route}`);
    await attendreCalme(page);
    await expect(badges(page)).toHaveCount(0);
    const nomAvant = (await lireDocument(chemin))[champNom];
    await ouvrirMenuFiche(page);
    const noms = (await menu(page).getByRole('menuitem').allTextContents()).map((t) => t.trim());
    expect(noms.indexOf('Marquer comme test'), `${route} : avant Archiver`).toBeGreaterThan(-1);
    expect(noms.indexOf('Marquer comme test')).toBeLessThan(noms.indexOf('Archiver'));
    if (route.startsWith('crm/affaires')) await capturer(page, info, '3-menu-fiche');
    await choisir(page, 'Marquer comme test');
    await expect(page.locator('.fiche-sous .badge-test')).toHaveText('[TEST]');
    await expect.poll(async () => (await lireDocument(chemin)).test).toBe(true);
    expect((await lireDocument(chemin))[champNom], `${route} : le nom ne change pas`).toBe(nomAvant);
    await ouvrirMenuFiche(page);
    await expect(menu(page).getByRole('menuitem', { name: 'Marquer comme test', exact: true })).toHaveCount(0);
    await choisir(page, 'Ce n’est plus un test');
    await expect(badges(page)).toHaveCount(0);
    await expect.poll(async () => (await lireDocument(chemin)).test).toBe(false); // false = réel, comme absent
  }
});

test('3 menus des listes et des cartes : personnes, organisations, affaires (liste et carte), projets (liste et carte)', async ({ page }, info) => {
  await creerPersonne('p1', { nom: 'Marie Durand' });
  await creerOrganisation('o1', { nom: 'Durand SARL' });
  await creerAffaire('a1', { titre: 'Audit des Lilas', etape: 'rdv_fixe' });
  await creerProjet('pr1', { titre: 'Chantier des Lilas' });
  await connecter(page, JEROME, { route: 'crm/personnes' });
  await page.locator('tr.ligne-liste[data-id="p1"] .col-actions button').click();
  await choisir(page, 'Marquer comme test');
  await expect(page.locator('tr.ligne-liste[data-id="p1"] .badge-test')).toHaveText('[TEST]');
  await page.goto('/?emulateurs=1#/crm/organisations');
  await page.locator('tr.ligne-liste[data-id="o1"] .col-actions button').click();
  await choisir(page, 'Marquer comme test');
  await expect(page.locator('tr.ligne-liste[data-id="o1"] .badge-test')).toHaveText('[TEST]');
  await page.goto('/?emulateurs=1#/crm/affaires');
  await page.locator('.bascule-vue[data-vue="kanban"]').click();
  await page.locator('.carte-affaire[data-affaire="a1"] .carte-menu').click();
  await capturer(page, info, '3-menu-carte');
  await choisir(page, 'Marquer comme test');
  await expect(page.locator('.carte-affaire[data-affaire="a1"] .badge-test')).toHaveText('[TEST]');
  await page.locator('.carte-affaire[data-affaire="a1"] .carte-menu').click();
  await choisir(page, 'Ce n’est plus un test');
  await expect(page.locator('.carte-affaire[data-affaire="a1"] .badge-test')).toHaveCount(0);
  await page.locator('.bascule-vue[data-vue="liste"]').click();
  await page.locator('tr', { hasText: 'Audit des Lilas' }).locator('.col-actions button').click();
  await choisir(page, 'Marquer comme test');
  await expect(page.locator('tr', { hasText: 'Audit des Lilas' }).locator('.badge-test')).toHaveText('[TEST]');
  await page.goto('/?emulateurs=1#/projets/projets');
  await attendreCalme(page);
  const carte = page.locator('.carte-projet[data-projet="pr1"]');
  {
    await carte.locator('.carte-menu').click();
    await choisir(page, 'Marquer comme test');
    await expect(carte.locator('.badge-test')).toHaveText('[TEST]');
  }
  expect((await lireDocument('crm_personnes/p1')).test).toBe(true);
  expect((await lireDocument('crm_organisations/o1')).test).toBe(true);
  expect((await lireDocument('crm_affaires/a1')).test).toBe(true);
});

test('3 brouillon de devis : entrée active dans le menu de la liste ; devis finalisé : entrée grisée « bientôt disponible »', async ({ page }, info) => {
  await creerOrganisation('o1', { nom: 'M. Paul Exemple' });
  await devis('dBrouillon');
  await devis('dFinalise', { numero: 'DEV-2026-10-02-001', statut: 'en_attente_envoi', finaliseLe: new Date(Date.now() - 2 * 86400000) });
  await connecter(page, JEROME, { route: 'devis/liste' });
  await expect(page.locator('.page-liste-devis')).toBeVisible();
  await page.locator('tr.ligne-devis[data-id="dFinalise"] [data-action="menu-devis"]').click();
  const grise = menu(page).getByRole('menuitem', { name: /Marquer comme test \(bientôt disponible\)/ });
  await expect(grise).toBeDisabled();
  await capturer(page, info, '3-devis-finalise-grise');
  await page.keyboard.press('Escape');
  await page.locator('tr.ligne-devis[data-id="dBrouillon"] [data-action="menu-devis"]').click();
  await menu(page).getByRole('menuitem', { name: 'Marquer comme test', exact: true }).click();
  await expect(page.locator('tr.ligne-devis[data-id="dBrouillon"] .badge-test')).toHaveText('[TEST]');
  await expect.poll(async () => (await lireDocument('devis_devis/dBrouillon')).test).toBe(true);
  expect((await lireDocument('devis_devis/dFinalise')).test).toBeUndefined();
  await page.locator('tr.ligne-devis[data-id="dBrouillon"] [data-action="menu-devis"]').click();
  await menu(page).getByRole('menuitem', { name: 'Ce n’est plus un test', exact: true }).click();
  await expect(page.locator('.badge-test')).toHaveCount(0);
  await expect.poll(async () => (await lireDocument('devis_devis/dBrouillon')).test).toBe(false);
});

test('4 renommer une fiche de test ne perd pas `test` et n’écrit jamais « [TEST] » dans le nom', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Marie Durand', test: true });
  await creerAffaire('a1', { titre: 'Audit des Lilas', test: true });
  await connecter(page, JEROME, { route: 'crm/personnes/p1' });
  await expect(page.locator('.fiche-sous .badge-test')).toBeVisible();
  await page.locator('.fiche-titre input.titre-editable').fill('Marie Dupont');
  await page.locator('.fiche-titre input.titre-editable').press('Enter');
  await expect.poll(async () => (await lireDocument('crm_personnes/p1')).nom).toBe('Marie Dupont');
  const p = await lireDocument('crm_personnes/p1');
  expect(p.test).toBe(true);
  expect(JSON.stringify(p)).not.toContain('[TEST]');
  await page.goto('/?emulateurs=1#/crm/affaires/a1');
  await page.locator('.fiche-titre input.titre-editable').fill('Audit des Roses');
  await page.locator('.fiche-titre input.titre-editable').press('Enter');
  await expect.poll(async () => (await lireDocument('crm_affaires/a1')).titre).toBe('Audit des Roses');
  const a = await lireDocument('crm_affaires/a1');
  expect(a.test).toBe(true);
  expect(JSON.stringify(a)).not.toContain('[TEST]');
});

test('5 cas d’erreur : si l’écriture est refusée (lecteur) ou échoue, un message clair s’affiche et rien ne plante', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await connecter(page, JEROME, { route: 'crm/affaires/a1' });
  await attendreCalme(page);
  await page.evaluate(async () => {
    const { entreeMarquerTest } = await import('/js/modules/crm/composants.js');
    await entreeMarquerTest({ test: false }, async () => { throw Object.assign(new Error('refus'), { code: 'permission-denied' }); }).action();
  });
  await expect(page.locator('.toast')).toContainText('Tu n’as pas le droit de modifier cet élément');
  await page.evaluate(async () => {
    const { entreeMarquerTest } = await import('/js/modules/crm/composants.js');
    await entreeMarquerTest({ test: true }, async () => { throw new Error('réseau'); }).action();
  });
  await expect(page.locator('.toast').last()).toContainText('Ça n’a pas abouti');
  expect((await lireDocument('crm_affaires/a1')).test).toBeUndefined();
});

test('6 l’en-tête de l’éditeur de devis montre le badge dès « Marquer comme test » dans son menu, sans recharger', async ({ page }, info) => {
  await creerOrganisation('o1', { nom: 'M. Paul Exemple' });
  await devis('dBrouillon');
  await connecter(page, JEROME, { route: 'devis/editeur/dBrouillon' });
  await expect(page.locator('[data-action="envoyer"]')).toBeVisible();
  await attendreCalme(page);
  await expect(badges(page)).toHaveCount(0);
  await page.locator('[data-action="plus-actions"]').click();
  await menu(page).getByRole('menuitem', { name: 'Marquer comme test', exact: true }).click();
  await expect(page.locator('.entete-devis .badge-test')).toBeVisible();
  await expect(page.locator('.entete-devis .badge-test')).toHaveText('[TEST]');
  await capturer(page, info, '6-editeur-devis');
  await page.locator('[data-action="plus-actions"]').click();
  await menu(page).getByRole('menuitem', { name: 'Ce n’est plus un test', exact: true }).click();
  await expect(page.locator('.entete-devis .badge-test')).toBeHidden();
  expect((await lireDocument('devis_devis/dBrouillon')).test).toBe(false);
});
