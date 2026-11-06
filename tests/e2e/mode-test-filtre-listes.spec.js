// Mode test, PR 1c : filtre « Tests » dans la fenêtre « Filtres » des listes (Personnes, Organisations, Affaires, Projets, Devis).
// Un test par point, le nom commence par son numéro. Captures dans tests/e2e/captures/mode-test-filtre-listes/ (ordinateur ET téléphone).
import { fileURLToPath } from 'node:url';
import {
  test, expect, connecter, allerA, creerPersonne, creerOrganisation, creerAffaire, creerProjet, ecrireDocument, lireDocument, attendreCalme,
  ouvrirMenuUtilisateur, JEROME,
} from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/mode-test-filtre-listes/', import.meta.url));
const capturer = (page, info, nom) => page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
const dialogue = (page) => page.getByRole('dialog');
const selectTests = (page) => dialogue(page).locator('select[data-cle="tests"]');
const compteur = (page) => page.locator('[data-action="filtres"] .compteur-filtres');

test.beforeEach(async ({ page }) => {
  await page.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
});

/** Un devis déjà dans la base (modèle : devis-liste.spec.js). */
async function devis(id, valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument(`devis_devis/${id}`, {
    racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: null, personneId: null, organisationId: null, modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10),
    sections: [{ id: 's1', titre: 'Cuisine', lignes: [{ id: 'l1', libelle: 'Carrelage', quantite: 2, unite: 'm²', prixAchat: 50 }] }],
    creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, ...valeurs,
  });
}

/** Jeu commun : une fiche réelle et une fiche de test par liste ; 3 affaires dans « Rendez-vous fixé ». */
async function jeu({ devisAussi = false } = {}) {
  await creerPersonne('pR', { nom: 'Rita Réelle' });
  await creerPersonne('pT', { nom: 'Paul Essai', test: true });
  await creerOrganisation('oR', { nom: 'Société Réelle' });
  await creerOrganisation('oT', { nom: 'Société Essai', test: true });
  await creerAffaire('a1', { titre: 'Audit réel un', etape: 'rdv_fixe', montant: 2000 });
  await creerAffaire('a2', { titre: 'Audit réel deux', etape: 'rdv_fixe', montant: 100 });
  await creerAffaire('aT', { titre: 'Audit essai', etape: 'rdv_fixe', montant: 100, test: true });
  await creerProjet('prR', { titre: 'Chantier réel' });
  await creerProjet('prT', { titre: 'Chantier essai', test: true });
  if (devisAussi) {
    await devis('dR');
    await devis('dT', { test: true });
  }
}

async function poserTests(page, valeur) {
  await page.locator('[data-action="filtres"]').click();
  await selectTests(page).selectOption(valeur);
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(dialogue(page)).toHaveCount(0);
}

test('1 la fenêtre « Filtres » des cinq listes propose le groupe « Tests » (Tout, Sans les tests, Seulement les tests) avec « Tout » choisi ; le Catalogue ne le propose pas', async ({ page }, info) => {
  await jeu({ devisAussi: true });
  await connecter(page);
  for (const libelle of ['Personnes', 'Organisations', 'Affaires', 'Projets']) {
    await allerA(page, libelle);
    await page.locator('[data-action="filtres"]').click();
    await expect(selectTests(page).locator('option')).toHaveText(['Tout', 'Sans les tests', 'Seulement les tests']);
    await expect(selectTests(page)).toHaveValue('inclure');
    if (libelle === 'Affaires') await capturer(page, info, '1-fenetre-affaires');
    await page.keyboard.press('Escape');
    await expect(dialogue(page)).toHaveCount(0);
  }
  await page.goto('/?emulateurs=1#/devis/liste');
  await expect(page.locator('.page-liste-devis')).toBeVisible();
  await page.locator('[data-action="filtres"]').click();
  await expect(selectTests(page).locator('option')).toHaveCount(3);
  await expect(selectTests(page)).toHaveValue('inclure');
  await page.keyboard.press('Escape');
  await page.goto('/?emulateurs=1#/devis/bordereau');
  await expect(page.locator('[data-action="filtres"]')).toBeVisible();
  await page.locator('[data-action="filtres"]').click();
  await expect(dialogue(page)).toBeVisible();
  await expect(selectTests(page)).toHaveCount(0); // le Catalogue a une fenêtre « Filtres » mais pas le groupe « Tests » : pas de repère test
  await page.keyboard.press('Escape');
});

test('2 par défaut tout s’affiche, badge compris, sans pastille de compte, mode test allumé ou éteint', async ({ page }, info) => {
  await jeu();
  await connecter(page);
  await allerA(page, 'Affaires');
  await expect(page.locator('.carte-affaire')).toHaveCount(3);
  await expect(page.locator('.carte-affaire .badge-test')).toHaveCount(1);
  await expect(compteur(page)).toHaveCount(0);
  await capturer(page, info, '2-defaut');
  await ouvrirMenuUtilisateur(page);
  await page.locator('[data-role="mode-test"]').click();
  await expect(page.locator('[data-role="mode-test"]')).toHaveAttribute('aria-checked', 'true');
  await page.keyboard.press('Escape');
  await expect(page.locator('.carte-affaire')).toHaveCount(3);
  await expect(compteur(page)).toHaveCount(0);
});

test('3 « Sans les tests » sur Personnes puis Organisations : seules les lignes réelles, pastille de compte 1, pastille « Sans les tests », la croix remet tout', async ({ page }, info) => {
  await jeu();
  await connecter(page);
  for (const libelle of ['Personnes', 'Organisations']) {
    await allerA(page, libelle);
    await expect(page.locator('tr.ligne-liste')).toHaveCount(2);
    await poserTests(page, 'exclure');
    await expect(page.locator('tr.ligne-liste')).toHaveCount(1);
    await expect(page.locator('.badge-test')).toHaveCount(0);
    await expect(compteur(page)).toHaveText('1');
    await expect(page.locator('.pastille-filtre')).toContainText('Sans les tests');
    if (libelle === 'Personnes') await capturer(page, info, '3-sans-tests-personnes');
    await page.locator('.pastille-retrait').click();
    await expect(page.locator('tr.ligne-liste')).toHaveCount(2);
    await expect(compteur(page)).toHaveCount(0);
  }
});

test('4 « Seulement les tests » sur le Kanban des affaires : seules les cartes [TEST], l’en-tête dit « 1 affaire » sans total réel et « 1 affaire [TEST] · 100 € » ; Liste puis Archives gardent le filtre', async ({ page }, info) => {
  await jeu();
  await connecter(page);
  await allerA(page, 'Affaires');
  const totaux = page.locator('.colonne[data-colonne="rdv_fixe"] .colonne-totaux');
  await expect(totaux).toHaveText('3 affaires · 2 100 €');
  const totauxTests = page.locator('.colonne[data-colonne="rdv_fixe"] .colonne-totaux-tests');
  await expect(totauxTests).toHaveText('1 affaire [TEST] · 100 €');
  await poserTests(page, 'seulement');
  await expect(page.locator('.carte-affaire')).toHaveCount(1);
  await expect(page.locator('.carte-affaire[data-affaire="aT"]')).toContainText('[TEST]');
  await expect(totaux).toHaveText('1 affaire');
  await expect(totauxTests).toHaveText('1 affaire [TEST] · 100 €');
  await capturer(page, info, '4-seulement-kanban');
  await page.locator('.bascule-vue[data-vue="liste"]').click();
  await expect(page.locator('tr.ligne-liste')).toHaveCount(1);
  await expect(page.locator('tr.ligne-liste .badge-test')).toHaveCount(1);
  await page.locator('.bascule-vue[data-vue="archives"]').click();
  await expect(compteur(page)).toHaveText('1');
});

test('5 Projets : « Seulement les tests » filtre, pose la pastille, « Enregistrer ce filtre… » devient possible et le filtre enregistré le restaure après « Tout effacer »', async ({ page }, info) => {
  await jeu();
  await connecter(page);
  await allerA(page, 'Projets');
  await expect(page.locator('.carte-projet')).toHaveCount(2);
  await poserTests(page, 'seulement');
  await expect(page.locator('.carte-projet')).toHaveCount(1);
  await expect(page.locator('.pastille-filtre')).toContainText('Seulement les tests');
  await page.locator('[data-action="filtres-enregistres"]').click();
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: 'Enregistrer ce filtre…' })).toBeEnabled();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Enregistrer ce filtre…' }).click();
  await dialogue(page).getByLabel('Nom du filtre').fill('Mes essais');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect.poll(async () => ((await lireDocument('crm_parametres/filtres'))?.items ?? []).some((f) => f.nom === 'Mes essais' && f.liste === 'projets')).toBe(true);
  await page.locator('[data-action="filtres"]').click();
  await dialogue(page).getByRole('button', { name: 'Tout effacer' }).click();
  await expect(page.locator('.carte-projet')).toHaveCount(2);
  await page.locator('[data-action="filtres-enregistres"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Mes essais' }).click();
  await expect(page.locator('.carte-projet')).toHaveCount(1);
  await expect(page.locator('.pastille-filtre')).toContainText('Seulement les tests');
  await capturer(page, info, '5-projets-enregistre');
});

test('6 Devis : « Sans les tests » en Liste et en Kanban, le compteur dit « 2 devis · 1 affiché », la colonne « Brouillon » dit « 1 devis » (sans montant : le brouillon bouge à chaque frappe), la pastille de compte vaut 1', async ({ page }, info) => {
  await jeu({ devisAussi: true });
  await connecter(page, undefined, { route: 'devis/liste' });
  await expect(page.locator('.page-liste-devis')).toBeVisible();
  await attendreCalme(page);
  await page.locator('.bascule-vue[data-vue="liste"]').click();
  await expect(page.locator('tr.ligne-devis')).toHaveCount(2);
  await poserTests(page, 'exclure');
  await expect(page.locator('tr.ligne-devis')).toHaveCount(1);
  await expect(page.locator('.compteur-liste')).toHaveText('2 devis · 1 affiché');
  await expect(compteur(page)).toHaveText('1');
  await page.locator('.bascule-vue[data-vue="tableau"]').click();
  await expect(page.locator('.colonne[data-colonne="brouillon"] .colonne-totaux')).toHaveText(/^1 devis$/);
  await capturer(page, info, '6-devis');
  await page.locator('.bascule-vue[data-vue="archives"]').click();
  await expect(compteur(page)).toHaveText('1');
});

test('7 les filtres se combinent (ET) : recherche + Étape + Tests ; « Tout effacer » de la fenêtre remet « Tout »', async ({ page }, info) => {
  await jeu();
  await connecter(page);
  await allerA(page, 'Affaires');
  await page.locator('[data-role="recherche-liste"], .barre-filtres input[type="search"], .barre-filtres input').first().fill('Audit');
  await page.locator('[data-action="filtres"]').click();
  await dialogue(page).getByLabel(/Rendez.vous fixé/).check();
  await selectTests(page).selectOption('exclure');
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('.carte-affaire')).toHaveCount(2);
  await expect(compteur(page)).toHaveText('2');
  await expect(page.locator('.pastille-filtre')).toHaveCount(2);
  await capturer(page, info, '7-combinaison');
  await page.locator('[data-action="filtres"]').click();
  await dialogue(page).getByRole('button', { name: 'Tout effacer' }).click();
  await expect(compteur(page)).toHaveCount(0);
  await page.locator('[data-action="filtres"]').click();
  await expect(selectTests(page)).toHaveValue('inclure');
  await page.keyboard.press('Escape');
  await expect(page.locator('.carte-affaire')).toHaveCount(3);
});

test('8 le choix est mémorisé jusqu’au rechargement : Affaires, Personnes, Affaires garde « Sans les tests » ; après rechargement, « Tout »', async ({ page }) => {
  await jeu();
  await connecter(page);
  await allerA(page, 'Affaires');
  await poserTests(page, 'exclure');
  await allerA(page, 'Personnes');
  await allerA(page, 'Affaires');
  await expect(compteur(page)).toHaveText('1');
  await expect(page.locator('.carte-affaire')).toHaveCount(2);
  await page.reload();
  await expect(page.locator('.carte-affaire')).toHaveCount(3);
  await expect(compteur(page)).toHaveCount(0);
});

test('9 cas vide : « Seulement les tests » sans aucun essai affiche « Aucune affaire ne correspond. » (et « Aucun devis ne correspond. » sur Devis)', async ({ page }, info) => {
  await creerAffaire('a1', { titre: 'Audit réel un', etape: 'rdv_fixe' });
  await devis('dR');
  await connecter(page);
  await allerA(page, 'Affaires');
  await page.locator('.bascule-vue[data-vue="liste"]').click();
  await poserTests(page, 'seulement');
  await expect(page.locator('.etat-vide')).toHaveText('Aucune affaire ne correspond.');
  await capturer(page, info, '9-vide');
  await page.goto('/?emulateurs=1#/devis/liste');
  await expect(page.locator('.page-liste-devis')).toBeVisible();
  await attendreCalme(page);
  await page.locator('.bascule-vue[data-vue="liste"]').click();
  await poserTests(page, 'seulement');
  await expect(page.locator('.etat-vide')).toContainText('Aucun devis ne correspond.');
});

test('10 un filtre enregistré d’avant cette PR (sans clé tests) se lit « Tout » ; une valeur inconnue aussi', async ({ page }) => {
  await jeu();
  await ecrireDocument('crm_parametres/filtres', { version: 2, items: [
    { id: 'anc_1', nom: 'Ancien', liste: 'affaires', criteres: { etapes: ['rdv_fixe'] }, ordre: 1 },
    { id: 'bizarre_1', nom: 'Bizarre', liste: 'affaires', criteres: { tests: 'nimporte' }, ordre: 2 },
  ] });
  await connecter(page);
  await allerA(page, 'Affaires');
  await page.locator('[data-action="filtres-enregistres"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Ancien' }).click();
  await expect(page.locator('.carte-affaire')).toHaveCount(3);
  await expect(page.locator('.carte-affaire .badge-test')).toHaveCount(1);
  await page.locator('[data-action="filtres-enregistres"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Bizarre' }).click();
  await expect(compteur(page)).toHaveCount(0);
});

test('11 téléphone et ordinateur : la liste déroulante « Tests » est visible et s’utilise dans la fenêtre', async ({ page }) => {
  await jeu();
  await connecter(page);
  await allerA(page, 'Affaires');
  await page.locator('[data-action="filtres"]').click();
  await expect(selectTests(page)).toBeVisible();
  await selectTests(page).selectOption('seulement');
  await expect(selectTests(page)).toHaveValue('seulement');
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('.carte-affaire')).toHaveCount(1);
});
