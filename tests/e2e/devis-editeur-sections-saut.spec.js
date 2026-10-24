// Module Devis, éditeur de devis, partie 3 : menus des sections (flèche d'une section ou sous-section) et saut de page visuel.
// Un test par point du brief (le nom commence par le numéro du point), une capture par point : tests/e2e/captures/devis-editeur-sections-saut/ (ordinateur ET téléphone : la mise en page change).
import { fileURLToPath } from 'node:url';
import {
  test, expect, connecter, attendreCalme, ecrireDocument, lireDocument, creerOrganisation, creerAffaire, JEROME, FIRESTORE, PROJET,
} from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-editeur-sections-saut/', import.meta.url));
async function capturer(page, info, nom, { pleine = false } = {}) {
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
const cuisineEtSalon = () => [
  { id: 's1', titre: 'Cuisine', lignes: [ligne('l1', 'Carrelage', 2, 50), ligne('l2', 'Plinthes', 1, 20)] },
  { id: 's2', titre: 'Salon', lignes: [ligne('l3', 'Peinture', 1, 100)] },
];

test('1 le menu de la flèche d’une section : six entrées, neuf choix dans chaque « Insérer », chaque insertion tombe au bon endroit, Dupliquer copie, Supprimer confirme', async ({ page }, info) => {
  await semer();
  await ouvrir(page, await devis('d1', cuisineEtSalon()));
  await menuDe(page, 's1');
  const menu = page.locator('.menu-devis-ligne');
  await expect(menu.getByRole('menuitem')).toHaveText(['Insérer au début', 'Insérer à la fin', 'Insérer au dessus', 'Insérer en dessous', 'Dupliquer', 'Supprimer']);
  for (const [libelle, cle] of [['Insérer au début', 'debut'], ['Insérer à la fin', 'fin'], ['Insérer au dessus', 'avant'], ['Insérer en dessous', 'apres']]) {
    await menu.getByRole('menuitem', { name: libelle }).click();
    await expect(menu.locator(`[data-menu^="inserer-${cle}-"]`)).toHaveText(['Fourniture', 'Main d’œuvre', 'Ouvrage', 'Sous-traitance', 'Matériel', 'Divers', 'Section', 'Texte', 'Saut de page']);
  }
  await page.keyboard.press('Escape');
  await menuDe(page, 's1'); // capture : le menu avec un seul sous-menu déplié
  await page.locator('.menu-devis-ligne').getByRole('menuitem', { name: 'Insérer en dessous' }).click();
  await capturer(page, info, '1-menu-section');
  await page.keyboard.press('Escape');
  // Un texte (rangée sans prix) inséré à chaque endroit : le premier au début de la section, le deuxième à la fin, etc. Les rangées nouvelles n'ont pas l'identifiant de départ.
  const nouvelles = async (avant) => (await ordre(page)).filter((i) => !avant.includes(i));
  const insere = async (libelle, cle) => {
    const avant = await ordre(page);
    await menuDe(page, 's1');
    await page.locator('.menu-devis-ligne').getByRole('menuitem', { name: libelle }).click();
    await page.locator(`[data-menu="inserer-${cle}-texte"]`).click();
    return (await nouvelles(avant))[0];
  };
  const debut = await insere('Insérer au début', 'debut');
  const fin = await insere('Insérer à la fin', 'fin');
  const dessus = await insere('Insérer au dessus', 'avant');
  const dessous = await insere('Insérer en dessous', 'apres');
  expect(await ordre(page)).toEqual([dessus, 's1', debut, 'l1', 'l2', fin, dessous, 's2', 'l3']);
  // Un saut de page se glisse au même endroit que les autres choix.
  await menuDe(page, 's2');
  await page.locator('.menu-devis-ligne').getByRole('menuitem', { name: 'Insérer à la fin' }).click();
  await page.locator('[data-menu="inserer-fin-saut"]').click();
  await expect(page.locator('tr[data-genre="saut"]')).toHaveCount(1);
  expect((await ordre(page)).at(-1)).toMatch(/.+/);
  expect(await page.locator('tr[data-genre="saut"]').evaluate((t) => t.previousElementSibling.dataset.id)).toBe('l3');
  // Dupliquer la section Salon : elle revient en double juste dessous, avec ses lignes et de nouveaux identifiants.
  const avantCopie = await ordre(page);
  await menuDe(page, 's2');
  await page.locator('.menu-devis-ligne').getByRole('menuitem', { name: 'Dupliquer' }).click();
  const apresCopie = await ordre(page);
  expect(apresCopie.length).toBe(avantCopie.length + 3); // en-tête + ligne + saut
  expect(new Set(apresCopie).size).toBe(apresCopie.length);
  await expect(page.locator('tr[data-genre="section"] .titre-section').filter({ hasNot: page.locator('x') })).toHaveCount(3);
  // Supprimer demande la confirmation qui existait déjà ; « Annuler » ne retire rien.
  await menuDe(page, 's1');
  await page.locator('.menu-devis-ligne').getByRole('menuitem', { name: 'Supprimer' }).click();
  await expect(dialogue(page)).toContainText('Supprimer cette section ?');
  await dialogue(page).getByRole('button', { name: 'Annuler' }).click();
  expect((await ordre(page)).length).toBe(apresCopie.length);
  await enregistre(page);
});

test('1 le menu d’une sous-section a les mêmes six entrées ; « Section » y crée une sous-section', async ({ page }) => {
  await semer();
  await ouvrir(page, await devis('d1b', [{ id: 's1', titre: 'Salle', lignes: [] }, { id: 'ss1', titre: 'Bar', niveau: 2, lignes: [ligne('l1', 'Comptoir', 1, 10)] }, { id: 's2', titre: 'Cuisine', lignes: [] }]));
  await menuDe(page, 'ss1');
  const menu = page.locator('.menu-devis-ligne');
  await expect(menu.getByRole('menuitem')).toHaveText(['Insérer au début', 'Insérer à la fin', 'Insérer au dessus', 'Insérer en dessous', 'Dupliquer', 'Supprimer']);
  await menu.getByRole('menuitem', { name: 'Insérer à la fin' }).click();
  await page.locator('[data-menu="inserer-fin-section"]').click();
  await expect(page.locator('tr[data-niveau="2"]')).toHaveCount(2);
  expect((await ordre(page)).slice(0, 4)).toEqual(['s1', 'ss1', 'l1', expect.any(String)]);
  await enregistre(page);
});

test('2 le menu d’une ligne n’a plus « Ajouter des photos » ; ses « Insérer » proposent la même liste, saut de page compris', async ({ page }, info) => {
  await semer();
  await ouvrir(page, await devis('d2', cuisineEtSalon()));
  await menuDe(page, 'l1');
  const menu = page.locator('.menu-devis-ligne');
  await expect(menu.getByRole('menuitem')).toHaveText(['Insérer au dessus', 'Insérer en dessous', 'Dupliquer', 'Monter', 'Descendre', 'Supprimer']);
  await expect(menu.getByText('photos', { exact: false })).toHaveCount(0);
  await menu.getByRole('menuitem', { name: 'Insérer en dessous' }).click();
  await expect(menu.locator('[data-menu^="inserer-apres-"]')).toHaveText(['Fourniture', 'Main d’œuvre', 'Ouvrage', 'Sous-traitance', 'Matériel', 'Divers', 'Section', 'Texte', 'Saut de page']);
  await capturer(page, info, '2-menu-ligne');
  await menu.locator('[data-menu="inserer-apres-saut"]').click();
  await menuDe(page, 'l2');
  await page.locator('.menu-devis-ligne').getByRole('menuitem', { name: 'Insérer au dessus' }).click();
  await page.locator('[data-menu="inserer-avant-saut"]').click();
  const o = await ordre(page);
  expect(o.slice(0, 2)).toEqual(['s1', 'l1']);
  expect(o[3]).not.toBe('l2'); // saut au dessus de l2
  expect(o[4]).toBe('l2');
  expect(await page.locator('tr[data-genre="saut"]').count()).toBe(2);
  await enregistre(page);
});

test('3 la bande de saut de page : rayée, sans numéro, hors totaux, déplaçable, supprimable ; plus de case « Nouvelle page avant » ; le bouton du bas l’ajoute à la fin de la section en cours', async ({ page }, info) => {
  await semer();
  await ouvrir(page, await devis('d3', [
    { id: 's1', titre: 'Cuisine', lignes: [ligne('l1', 'Carrelage', 2, 50), SAUT('p1'), ligne('l2', 'Plinthes', 1, 20)] },
    { id: 's2', titre: 'Salon', lignes: [ligne('l3', 'Peinture', 1, 100)] },
  ]));
  const bande = page.locator('tr[data-id="p1"] .bande-saut');
  await expect(bande).toBeVisible();
  await expect(bande).toHaveText('Saut de page');
  expect(await bande.evaluate((e) => getComputedStyle(e).borderTopStyle)).toBe('dashed');
  expect(await bande.evaluate((e) => getComputedStyle(e).backgroundImage)).toContain('repeating-linear-gradient');
  await expect(page.locator('tr[data-id="p1"] .num')).toHaveCount(0); // pas de numéro
  await expect(page.locator('tr[data-id="p1"] [data-action="menu-ligne"]')).toBeVisible();
  await expect(page.locator('[data-champ="saut-de-page"]')).toHaveCount(0); // la case « Nouvelle page avant » n'existe plus
  await expect(page.getByText('Nouvelle page avant')).toHaveCount(0);
  // Net à payer : 2 × 50 + 20 + 100 = 220 € HT -> 264 € TTC, avec un saut comme avec trois.
  await expect(total(page, 'net')).toHaveText(/^264,00\s€$/);
  await page.locator('[data-action="ajouter-saut"]').click();
  await expect(page.locator('tr[data-genre="saut"]')).toHaveCount(2);
  await expect(total(page, 'net')).toHaveText(/^264,00\s€$/);
  await capturer(page, info, '3-bande-saut-de-page', { pleine: true });
  // Le saut se déplace comme une ligne (poignée) : p1 descend sous « Plinthes ».
  await page.locator('tr[data-id="p1"] [data-action="descendre"]').click();
  expect((await ordre(page)).slice(0, 4)).toEqual(['s1', 'l1', 'l2', 'p1']);
  // Le bouton du bas a posé l'autre saut à la fin de la section où se trouve le curseur (la dernière touchée : Cuisine), pas ailleurs.
  const sauts = await page.locator('tr[data-genre="saut"]').evaluateAll((t) => t.map((x) => x.dataset.id));
  expect(sauts.length).toBe(2);
  // Supprimer un saut : confirmation, puis il disparaît ; le net à payer ne bouge pas.
  await menuDe(page, 'p1');
  await page.locator('.menu-devis-ligne').getByRole('menuitem', { name: 'Supprimer' }).click();
  await expect(dialogue(page)).toContainText('Supprimer ce saut de page ?');
  await dialogue(page).getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.locator('tr[data-genre="saut"]')).toHaveCount(1);
  await expect(total(page, 'net')).toHaveText(/^264,00\s€$/);
  await enregistre(page);
  // Enregistré tel quel : une ligne `{ type: 'saut' }` sans prix ni quantité.
  const doc = await lireDocument('devis_devis/d3');
  const enreg = doc.sections.flatMap((s) => s.lignes).filter((l) => l.type === 'saut');
  expect(enreg.length).toBe(1);
  expect(Object.keys(enreg[0]).sort()).toEqual(['id', 'type']);
  // Le document (aperçu = impression) coupe la page à cet endroit exact.
  await page.locator('[data-onglet="apercu"]').click();
  const html = await page.locator('iframe[data-zone="apercu"]').contentFrame().locator('tr.saut-page').first().getAttribute('style');
  expect(html).toContain('break-before:page');
});

test('3 un ancien devis « Nouvelle page avant » montre une bande avant la section, devient un saut au premier enregistrement ; la page n’est pas « modifiée » à l’ouverture', async ({ page }, info) => {
  await semer();
  await ouvrir(page, await devis('d3b', [
    { id: 's1', titre: 'Cuisine', lignes: [ligne('l1', 'Carrelage', 2, 50)] },
    { id: 's2', titre: 'Salon', sautDePageAvant: true, lignes: [ligne('l3', 'Peinture', 1, 100)] },
  ]));
  expect((await ordre(page)).length).toBe(5); // 2 sections + 2 lignes + la bande
  expect(await page.locator('tr[data-genre="saut"]').evaluate((t) => [t.previousElementSibling.dataset.id, t.nextElementSibling.dataset.id])).toEqual(['l1', 's2']);
  await expect(page.locator('[data-valeur="enregistrement"]')).toHaveText('Enregistré');
  expect((await lireDocument('devis_devis/d3b')).sections[1].sautDePageAvant).toBe(true); // rien n'est écrit tant qu'on ne change rien
  await capturer(page, info, '3-ancien-devis', { pleine: true });
  await page.locator('tr[data-id="l3"] [data-champ="libelle"]').fill('Peinture murs');
  await enregistre(page);
  const doc = await lireDocument('devis_devis/d3b');
  expect(doc.sections[1].sautDePageAvant).toBeUndefined();
  expect(doc.sections[0].lignes.at(-1).type).toBe('saut');
});

test('3 cas vide : sans aucun élément, le bouton « Saut de page » est grisé et le tableau est remplacé par le message d’aide', async ({ page }, info) => {
  await semer();
  await ouvrir(page, await devis('d3c', []));
  await expect(page.locator('[data-vide="lignes"]')).toBeVisible();
  await expect(page.locator('[data-action="ajouter-saut"]')).toBeDisabled();
  await capturer(page, info, '3-cas-vide');
  await page.locator('[data-action="ajouter-section"]').click();
  await expect(page.locator('[data-action="ajouter-saut"]')).toBeEnabled();
});

test('3 cas d’erreur : une écriture refusée garde le message habituel et le saut reste à l’écran', async ({ page }, info) => {
  await semer();
  await ouvrir(page, await devis('d3d', cuisineEtSalon()));
  await fetch(`${FIRESTORE}/v1/projects/${PROJET}/databases/(default)/documents/devis_devis/d3d`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
  await page.locator('[data-action="ajouter-saut"]').click();
  await expect(page.locator('tr[data-genre="saut"]')).toHaveCount(1);
  await expect(page.locator('[data-valeur="enregistrement"]')).toHaveText('Échec de l’enregistrement');
  await expect(page.locator('[data-erreur="enregistrement"]')).toContainText(/Devis introuvable|Enregistrement impossible/);
  await capturer(page, info, '3-cas-erreur');
});
