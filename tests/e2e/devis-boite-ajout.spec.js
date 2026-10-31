// Module Devis, éditeur de devis : la boîte « Ajouter une ligne » reste dans le tableau du devis et ne se ferme qu'avec « Fermer » (demande de Jérôme du 31/10/2026).
// Un test par point du brief (le nom commence par le numéro du point), une capture par point : tests/e2e/captures/devis-boite-ajout/ (ordinateur ET téléphone : la mise en page change).
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  test, expect, connecter, attendreCalme, ecrireDocument, lireDocument, creerOrganisation, creerAffaire, JEROME, FIRESTORE, PROJET,
} from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-boite-ajout/', import.meta.url));
async function capturer(page, info, nom, { pleine = false } = {}) {
  mkdirSync(DOSSIER, { recursive: true });
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: pleine, animations: 'disabled' });
}
const dialogue = (page) => page.getByRole('dialog');
const total = (page, cle) => page.locator(`[data-total="${cle}"]`);
const rangees = (page) => page.locator('.tableau-lignes-devis tbody tr[data-id]');
/** L'ordre des rangées à l'écran (identifiants). */
const ordre = (page) => rangees(page).evaluateAll((trs) => trs.map((t) => t.dataset.id));
const enregistre = (page) => expect(page.locator('[data-valeur="enregistrement"]')).toHaveText('Enregistré');
const menuDe = (page, id) => page.locator(`tr[data-id="${id}"] [data-action="menu-ligne"]`).click();
const SAUT = (id) => ({ id, type: 'saut' });

async function semer() {
  await creerOrganisation('o1', {
    nom: 'Société Exemple', adresses: [{ id: 'p1', libelle: 'Principale', adresse: '12 rue des Lilas\n75000 Paris', parDefaut: true }], emails: [{ valeur: 'contact@exemple.fr', type: 'travail' }],
  });
  await creerAffaire('a1', { titre: 'Rénovation restaurant', organisationId: 'o1' });
}
const ligne = (id, libelle, quantite, prixAchat, extra = {}) => ({ id, libelle, quantite, unite: 'u', prixAchat, marge: 0, ...extra });
async function devis(id, sections, extra = {}) {
  const maintenant = new Date();
  await ecrireDocument(`devis_devis/${id}`, {
    racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', organisationId: 'o1', personneId: null, modeMarge: 'majoration', marge: 0, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, expireLe: '2026-11-23', destinataires: ['contact@exemple.fr'], objet: 'Rénovation restaurant', sections,
    adresses: { commanditaire: { texte: '12 rue des Lilas\n75000 Paris' }, facturation: { texte: '12 rue des Lilas\n75000 Paris' }, chantier: { texte: '12 rue des Lilas\n75000 Paris' } },
    creePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, ...extra,
  });
  return id;
}
async function ouvrir(page, id) {
  await connecter(page, undefined, { route: `devis/editeur/${id}` });
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
}

const boiteLigne = (page) => page.locator('tr[data-zone="recherche-en-ligne"]');
const boite = (page) => page.locator('[data-zone="recherche"]');
/** Les genres / identifiants des rangées du tableau, la boîte comprise (« boite »). */
const suite = (page) => page.locator('.tableau-lignes-devis tbody tr').evaluateAll((trs) => trs.map((t) => (t.dataset.zone ? 'boite' : t.dataset.id)));
async function articles() {
  const maintenant = new Date();
  for (const [id, code, libelle] of [['ar1', 'CAR60', 'Carrelage 60 x 60'], ['ar2', 'COL25', 'Colle à carrelage']]) {
    await ecrireDocument(`devis_articles/${id}`, { code, libelle, unite: 'u', prixAchat: 50, tauxTva: null, actif: true, type: 'fourniture', proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, creePar: JEROME, modifiePar: JEROME });
  }
}
const quatre = () => [{ id: 's1', titre: 'Cuisine', lignes: [ligne('m1', 'Ligne 1', 1, 10), ligne('m2', 'Ligne 2', 1, 10), ligne('m3', 'Ligne 3', 1, 10), ligne('m4', 'Ligne 4', 1, 10)] }];
const ajouterArticleBoite = async (page, mot) => {
  await page.locator('[data-champ="recherche-bordereau"]').fill(mot);
  await page.locator('[data-action="ajouter-article"]').first().click();
};

test('1 « + Fourniture » ouvre la boîte DANS le tableau, après la dernière ligne du devis, filtre réglé, curseur dans la recherche ; plus sous la barre de boutons', async ({ page }, info) => {
  await semer();
  await ouvrir(page, await devis('b1', [...quatre(), { id: 's2', titre: 'Salon', lignes: [ligne('m5', 'Ligne 5', 1, 10)] }]));
  await expect(boite(page)).toBeHidden();
  await page.locator('[data-action="ajouter-famille-1"]').click();
  await expect(boiteLigne(page)).toBeVisible();
  expect((await suite(page)).at(-1)).toBe('boite'); // fin du devis, pas fin d'une section
  await expect(page.locator('[data-champ="filtre-famille"]')).toHaveValue('famille-1');
  expect(await page.evaluate(() => document.activeElement?.dataset?.champ)).toBe('recherche-bordereau');
  expect(await boite(page).evaluate((e) => e.closest('table') !== null && !e.closest('[data-zone="ajouts"]'))).toBe(true);
  await capturer(page, info, '1-boite-dans-le-tableau');
});

test('2 la boîte ne se ferme que par « Fermer » : ni après un article, ni après un Texte ; « Fermer » garde le texte et rend le focus au bouton du bas ; Échap vide seulement le champ', async ({ page }, info) => {
  await semer(); await articles();
  await ouvrir(page, await devis('b2', quatre()));
  await page.locator('[data-action="ajouter-famille-1"]').click();
  await page.locator('[data-champ="filtre-famille"]').selectOption('');
  await ajouterArticleBoite(page, 'carrelage');
  await expect(boite(page)).toBeVisible();
  await page.locator('[data-action="recherche-ajouter-texte"]').click();
  await expect(boite(page)).toBeVisible();
  await expect(page.locator('tr[data-genre="texte"]')).toHaveCount(1);
  const o = await suite(page);
  expect(o.at(-1)).toBe('boite');
  expect(o.length).toBe(4 + 1 + 1 + 1 + 1); // section, 4 lignes, article, texte, boîte
  await page.locator('[data-champ="recherche-bordereau"]').fill('colle');
  await page.locator('[data-action="fermer-recherche"]').click();
  await expect(boite(page)).toBeHidden();
  await expect(boiteLigne(page)).toHaveCount(0);
  expect(await page.evaluate(() => document.activeElement?.dataset?.action)).toBe('ajouter-famille-1');
  await page.locator('[data-action="ajouter-famille-2"]').click();
  await expect(page.locator('[data-champ="recherche-bordereau"]')).toHaveValue('colle'); // le texte tapé est resté
  await capturer(page, info, '2-boite-fermer');
});

test('3 après l’ajout d’un article : la ligne arrive au bout du devis, la boîte reste ouverte dessous avec son texte et son filtre ; le curseur est dans la quantité de la nouvelle ligne', async ({ page }, info) => {
  await semer(); await articles();
  await ouvrir(page, await devis('b3', quatre()));
  await page.locator('[data-action="ajouter-famille-1"]').click();
  await page.locator('[data-champ="filtre-famille"]').selectOption('');
  await ajouterArticleBoite(page, 'carrelage');
  const o = await suite(page);
  expect(o.length).toBe(7);
  expect(o.at(-1)).toBe('boite');
  await expect(page.locator('[data-champ="recherche-bordereau"]')).toHaveValue('carrelage');
  await expect(page.locator('[data-champ="filtre-famille"]')).toHaveValue('');
  expect(await page.evaluate(() => document.activeElement?.dataset?.champ)).toBe('quantite');
  await capturer(page, info, '3-apres-article');
});

test('4 boîte ouverte sous la ligne 2 par le menu d’une ligne, puis « + Main d’œuvre » : elle se déplace en fin de devis avec le filtre du bouton, jamais deux boîtes', async ({ page }, info) => {
  await semer(); await articles();
  await ouvrir(page, await devis('b4', quatre()));
  await menuDe(page, 'm2');
  await page.getByRole('menuitem', { name: 'Insérer en dessous' }).click();
  await page.locator('.menu-devis-ligne').getByRole('menuitem', { name: 'Fourniture' }).click();
  expect(await suite(page)).toEqual(['s1', 'm1', 'm2', 'boite', 'm3', 'm4']);
  await page.locator('[data-action="ajouter-famille-2"]').click();
  expect(await suite(page)).toEqual(['s1', 'm1', 'm2', 'm3', 'm4', 'boite']);
  await expect(page.locator('[data-zone="recherche"]')).toHaveCount(1);
  await expect(page.locator('[data-champ="filtre-famille"]')).toHaveValue('famille-2');
  await capturer(page, info, '4-boite-deplacee');
});

test('5 Section, Texte et Saut de page du bas : toujours à la fin du devis, curseur dans le titre, boîte ouverte dessous ; le Saut de page du bas reste à la fin de la section en cours', async ({ page }, info) => {
  await semer();
  await ouvrir(page, await devis('b5', [...quatre(), { id: 's2', titre: 'Salon', lignes: [ligne('m5', 'Ligne 5', 1, 10)] }]));
  await page.locator('tr[data-id="m2"] [data-champ="libelle"]').focus(); // la section en cours est « Cuisine »
  await page.locator('[data-action="ajouter-section"]').click();
  await expect(boite(page)).toBeVisible();
  const o = await suite(page);
  expect(o.at(-1)).toBe('boite');
  expect(await page.locator('tr[data-niveau="1"]').count()).toBe(3);
  expect(await page.evaluate(() => document.activeElement?.dataset?.champ)).toBe('libelle');
  expect(await page.evaluate(() => document.activeElement.closest('tr').dataset.genre)).toBe('section'); // le focus reste dans le titre
  await capturer(page, info, '5-section-du-bas');
  await page.locator('[data-action="ajouter-saut"]').click();
  const apres = await suite(page);
  expect(apres.at(-1)).toBe('boite');
  await expect(page.locator('tr[data-genre="saut"]')).toHaveCount(1);
  expect(await page.locator('tr[data-genre="saut"]').evaluate((e) => e.previousElementSibling.dataset.genre)).toBe('section'); // fin de la section en cours : la nouvelle section vide, où est le curseur, alors que la boîte reste tout en bas
  // Boutons DE la boîte, en mode « en ligne », sous une section : « Ligne choisie, nouvel élément, boîte ».
  await menuDe(page, 'm1');
  await page.getByRole('menuitem', { name: 'Insérer en dessous' }).click();
  await page.locator('.menu-devis-ligne').getByRole('menuitem', { name: 'Fourniture' }).click();
  await page.locator('[data-action="recherche-ajouter-section"]').click();
  const enLigne = await boiteLigne(page).evaluate((e) => [e.previousElementSibling.dataset.genre, e.previousElementSibling.dataset.niveau]);
  expect(enLigne).toEqual(['section', '1']);
  await expect(boite(page)).toBeVisible();
});

test('5 cas du saut dans la boîte : posé à la fin du devis (pas à la fin de la section en cours) ; grisé quand le devis est vide', async ({ page }, info) => {
  await semer();
  await ouvrir(page, await devis('b5b', [...quatre(), { id: 's2', titre: 'Salon', lignes: [ligne('m5', 'Ligne 5', 1, 10)] }]));
  await page.locator('tr[data-id="m2"] [data-champ="libelle"]').focus();
  await page.locator('[data-action="ajouter-famille-1"]').click();
  await page.locator('[data-action="recherche-ajouter-saut"]').click();
  expect(await page.locator('tr[data-genre="saut"]').evaluate((e) => e.previousElementSibling.dataset.id)).toBe('m5');
  expect((await suite(page)).at(-1)).toBe('boite');
  await expect(boite(page)).toBeVisible();
  expect(await page.evaluate(() => document.activeElement?.dataset?.action)).toBe('recherche-ajouter-saut'); // le focus reste sur le bouton de la boîte
});

test('6 devis vide : la boîte ouverte est dans le tableau, le message d’aide reste jusqu’à la première ligne, la boîte reste ouverte ; le saut de la boîte est grisé', async ({ page }, info) => {
  await semer(); await articles();
  await ouvrir(page, await devis('b6', []));
  await expect(page.locator('.zone-lignes-devis')).toBeHidden();
  await page.locator('[data-action="ajouter-famille-1"]').click();
  await expect(boiteLigne(page)).toBeVisible();
  await expect(page.locator('[data-vide="lignes"]')).toBeVisible();
  await expect(page.locator('[data-action="recherche-ajouter-saut"]')).toBeDisabled();
  await capturer(page, info, '6-devis-vide-boite-ouverte');
  await page.locator('[data-champ="filtre-famille"]').selectOption('');
  await ajouterArticleBoite(page, 'carrelage');
  await expect(page.locator('[data-vide="lignes"]')).toBeHidden();
  await expect(boite(page)).toBeVisible();
  await expect(page.locator('[data-action="recherche-ajouter-saut"]')).toBeEnabled();
  await page.locator('[data-action="fermer-recherche"]').click();
  await expect(boite(page)).toBeHidden();
  await expect(page.locator('[data-vide="lignes"]')).toBeHidden();
});

test('7 « Ligne libre » du menu « … » : à la fin du devis sans ouvrir la boîte ; si elle est ouverte sous une ligne, la ligne libre va dessous et la boîte reste ouverte', async ({ page }, info) => {
  await semer();
  await ouvrir(page, await devis('b7', quatre()));
  await page.locator('[data-action="autres-ajouts"]').click();
  await page.getByRole('menuitem', { name: 'Ligne libre' }).click();
  await expect(boite(page)).toBeHidden();
  expect((await suite(page)).length).toBe(6);
  await menuDe(page, 'm3');
  await page.getByRole('menuitem', { name: 'Insérer en dessous' }).click();
  await page.locator('.menu-devis-ligne').getByRole('menuitem', { name: 'Fourniture' }).click();
  await page.locator('[data-action="autres-ajouts"]').click();
  await page.getByRole('menuitem', { name: 'Ligne libre' }).click();
  const o = await suite(page);
  expect(o.indexOf('boite')).toBe(o.indexOf('m3') + 2);
  await expect(boite(page)).toBeVisible();
});

test('9 la boîte ouverte garde la largeur de l’écran (rien ne déborde) et sa cellule couvre toutes les colonnes, même quand Options en cache', async ({ page }, info) => {
  await semer();
  await ouvrir(page, await devis('b9', quatre()));
  await page.locator('[data-action="ajouter-famille-1"]').click();
  await expect(boiteLigne(page)).toBeVisible();
  const colonnes = await page.locator('.tableau-lignes-devis thead th').count();
  expect(await boiteLigne(page).locator('td').getAttribute('colspan')).toBe(String(colonnes));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await capturer(page, info, '9-boite-largeur');
});
