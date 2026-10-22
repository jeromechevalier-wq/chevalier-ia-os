// Plus de pause (décision de Jérôme, 22/10/2026) : « supprimer simplement et purement la fonctionnalité en pause », pour les affaires ET les projets.
// P1 fiche affaire, P2 filtre Statut des affaires, P3 Accueil, P4 projets, P5 serveur MCP, P6 donnée ancienne tolérée.
// Les captures vont dans tests/e2e/captures/sans-pause/ (aucune donnée réelle).
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  test, expect, attendreCalme, connecter, allerA, creerAffaire, creerProjet, creerActivite, creerPersonne, lireDocument, estTelephone, jour,
} from './outils.js';

const CAPTURES = 'e2e/captures/sans-pause';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
const RACINE = fileURLToPath(new URL('../../', import.meta.url));
const dialogue = (page) => page.getByRole('dialog');
async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }

// Dans ce bac à sable, le script de Google est inaccessible : on le remplace par un fichier vide.
test.beforeEach(async ({ page }) => {
  await page.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
});

test('P1 fiche affaire : le menu « … » n’a plus « En pause » ; aucun bouton ni boîte « Date de réveil »', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas', etape: 'rdv_fixe' });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  await expect(page.locator('.fiche-titre')).toBeVisible();
  const actions = page.locator('.fiche-tete .fiche-actions');
  await expect(actions.getByRole('button', { name: 'Perdue' })).toBeVisible();
  await expect(actions.getByRole('button', { name: /pause/i })).toHaveCount(0);
  await expect(page.locator('[data-action="en-pause"]')).toHaveCount(0);
  await actions.getByRole('button', { name: 'Plus d’actions' }).click();
  const menu = page.locator('.menu-pop');
  await expect(menu.getByRole('menuitem')).toHaveText(['Archiver', 'Supprimer définitivement…']);
  await expect(menu.getByRole('menuitem', { name: /pause/i })).toHaveCount(0);
  await expect(page.getByText('Date de réveil')).toHaveCount(0);
  await expect(page.getByLabel('Date de réveil')).toHaveCount(0);
  await capture(page, 'P1-fiche-affaire');
  // le menu d'une carte du kanban n'a pas non plus de pause
  await page.keyboard.press('Escape');
  await aller(page, '#/crm/affaires');
  await page.locator('.bascule-vue[data-vue="kanban"]').click();
  await page.locator('.carte-affaire[data-affaire="a1"] .carte-menu').click();
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: /pause/i })).toHaveCount(0);
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: 'Perdue…' })).toBeVisible();
});

test('P2 liste des affaires : le filtre « Statut » ne propose plus « En pause » (ouverte, gagnée, perdue)', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Affaire ouverte', etape: 'rdv_fixe' });
  await creerAffaire('a2', { titre: 'Affaire perdue', etape: 'rdv_fixe', statut: 'perdue', raisonPerdue: 'Prix' });
  await connecter(page);
  await aller(page, '#/crm/affaires');
  await page.locator('.bascule-vue[data-vue="liste"]').click();
  await expect(page.locator('tr.ligne-liste[data-id="a2"]')).toContainText('Perdue');
  await page.locator('[data-action="filtres"]').click();
  const fenetre = dialogue(page);
  await expect(fenetre.getByLabel('Ouverte', { exact: true })).toBeVisible();
  await expect(fenetre.getByLabel('Gagnée', { exact: true })).toBeVisible();
  await expect(fenetre.getByLabel('Perdue', { exact: true })).toBeVisible();
  await expect(fenetre.getByLabel(/pause/i)).toHaveCount(0);
  await expect(fenetre.getByText(/pause/i)).toHaveCount(0);
  await expect(fenetre.locator('input[data-cle="statuts"]')).toHaveCount(3);
  await capture(page, 'P2-filtre-statut');
  await fenetre.getByLabel('Perdue', { exact: true }).check();
  await fenetre.getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('tr.ligne-liste')).toHaveCount(1);
  await expect(page.locator('tr.ligne-liste[data-id="a2"]')).toBeVisible();
});

test('P3 Accueil : plus de bloc « Reprendre contact », même avec une ancienne affaire dont la date de réveil est passée', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Marie Durand' });
  await creerAffaire('a1', { titre: 'Ancienne affaire', etape: 'rdv_fixe', statut: 'en_pause', dateReveil: jour(-2), personneId: 'p1' });
  await creerActivite('x1', { titre: 'Appeler Marie', type: 'appel', date: jour(0), personneId: 'p1', affaireId: 'a1' });
  await connecter(page);
  const jourJ = page.locator('[data-groupe="aujourdhui"]');
  await expect(jourJ.locator('.compteur')).toHaveText('1'); // l'activité du jour de l'ancienne affaire compte (elle est ouverte), et rien d'autre
  await expect(jourJ).toContainText('Appeler Marie');
  await expect(page.locator('[data-reveil]')).toHaveCount(0);
  await expect(page.getByText('Reprendre contact')).toHaveCount(0);
  await expect(page.locator('.points-cles, .section-a-faire').first()).toBeVisible();
  await page.locator('.section-a-faire').scrollIntoViewIfNeeded();
  await page.locator('.section-a-faire').screenshot({ path: `${CAPTURES}/P3-accueil-points-cles${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
});

test('P3 Accueil : cas vide inchangé (une personne, aucune relance)', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Marie Durand' });
  await connecter(page);
  await expect(page.locator('.section-a-faire')).toContainText('Aucune relance aujourd’hui');
  await expect(page.getByText('Reprendre contact')).toHaveCount(0);
});

test('P4 projets : plus de « En pause » (bouton de la fiche, menu, filtre de statut, badge)', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Audit Carrel', phase: 'lancement' });
  await creerProjet('pr2', { titre: 'Revue Lilas', phase: 'livraison', statut: 'termine' });
  await connecter(page);
  // fiche
  await aller(page, '#/projets/projets/pr1');
  await expect(page.locator('.fiche-titre')).toBeVisible();
  const actions = page.locator('.fiche-tete .fiche-actions');
  await expect(actions.getByRole('button', { name: 'Terminer' })).toBeVisible();
  await expect(actions.getByRole('button', { name: /pause|reprendre/i })).toHaveCount(0);
  await expect(page.locator('[data-action="en-pause"], [data-action="reprendre"]')).toHaveCount(0);
  await expect(page.locator('.fiche-sous .pastille-statut')).toHaveText('Actif');
  await actions.getByRole('button', { name: 'Plus d’actions' }).click();
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: /pause|reprendre/i })).toHaveCount(0);
  await capture(page, 'P4-fiche-projet');
  await page.keyboard.press('Escape');
  // liste : menu d'une carte et filtre de statut
  await allerA(page, 'Projets');
  await expect(page.locator('.carte-projet')).toHaveCount(2);
  await expect(page.locator('.carte-projet .badge-pause')).toHaveCount(0);
  await page.locator('.carte-projet[data-projet="pr1"] .carte-menu').click();
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: 'Terminer' })).toBeVisible();
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: /pause|reprendre/i })).toHaveCount(0);
  await page.keyboard.press('Escape');
  await page.locator('[data-action="filtres"]').click();
  const fenetre = dialogue(page);
  await expect(fenetre.getByLabel('Actif', { exact: true })).toBeVisible();
  await expect(fenetre.getByLabel('Terminé', { exact: true })).toBeVisible();
  await expect(fenetre.getByLabel(/pause/i)).toHaveCount(0);
  await expect(fenetre.locator('input[data-cle="statuts"]')).toHaveCount(2);
  await capture(page, 'P4-filtre-projets');
});

test('P5 serveur MCP : les trois outils de pause n’existent plus (functions/ et copie de la plateforme clients) ; rouvrir_affaire reste', async ({ page }) => {
  const noms = async (fichier) => [...(await readFile(`${RACINE}${fichier}`, 'utf8')).matchAll(/outil\('([a-z_]+)'/g)].map((m) => m[1]);
  const jerome = await noms('functions/src/mcp/outils/ecriture.js');
  const plateforme = await noms('functions-plateforme/serveur/src/mcp/outils/ecriture.js');
  for (const liste of [jerome, plateforme]) {
    expect(liste).toContain('rouvrir_affaire');
    expect(liste).toContain('rouvrir_projet');
    for (const n of ['mettre_en_pause', 'mettre_projet_en_pause', 'reprendre_projet']) expect(liste).not.toContain(n);
  }
  expect(plateforme).toEqual(jerome); // la copie est identique : rien à ajouter ni à retirer
  // Aucun écran ne montre cette liste : la capture est un tableau des outils d'écriture relevés dans le code, rendu dans le navigateur.
  await page.goto('about:blank');
  await page.setContent(`<!doctype html><meta charset="utf-8"><body style="font:16px system-ui;margin:24px"><h1 style="font-size:20px">Outils d’écriture du serveur MCP (${jerome.length})</h1>
    <p>Plus de <s>mettre_en_pause</s>, <s>mettre_projet_en_pause</s>, <s>reprendre_projet</s> : relevé dans functions/ et dans la copie de la plateforme clients.</p>
    <ul style="columns:3">${jerome.map((n) => `<li>${n}${n === 'rouvrir_affaire' ? ' (rouvre une affaire perdue)' : ''}</li>`).join('')}</ul></body>`);
  await expect(page.getByText('rouvrir_affaire (rouvre une affaire perdue)')).toBeVisible();
  await capture(page, 'P5-outils-mcp');
});

test('P6 donnée ancienne : une affaire « en_pause » avec une date de réveil s’affiche comme ouverte, sans erreur, et s’ouvre, se modifie, passe perdue', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Ancienne affaire', etape: 'rdv_fixe', statut: 'en_pause', dateReveil: jour(20) });
  await connecter(page);
  // kanban : la carte est là, dans sa colonne, comptée
  await aller(page, '#/crm/affaires');
  await page.locator('.bascule-vue[data-vue="kanban"]').click();
  await expect(page.locator('.colonne[data-colonne="rdv_fixe"] .carte-affaire[data-affaire="a1"]')).toBeVisible();
  await expect(page.locator('.compteur-liste')).toHaveText('1 affaire');
  // liste : même ligne que pour une affaire ouverte, filtre « Ouverte » la trouve
  await page.locator('.bascule-vue[data-vue="liste"]').click();
  await expect(page.locator('tr.ligne-liste[data-id="a1"]')).not.toContainText(/pause/i);
  await page.locator('[data-action="filtres"]').click();
  await dialogue(page).getByLabel('Ouverte', { exact: true }).check();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('tr.ligne-liste[data-id="a1"]')).toBeVisible();
  // fiche : pastille « Ouverte », rien sur une date de réveil
  await page.locator('tr.ligne-liste[data-id="a1"] a.cellule-nom').click();
  await expect(page.locator('.fiche-titre')).toBeVisible();
  await expect(page.locator('.fiche-sous .pastille-statut')).toHaveText('Ouverte');
  await expect(page.locator('.fiche-tete')).not.toContainText(/jusqu|réveil|pause/i);
  await expect(page.locator('.fiche-tete .fiche-actions').getByRole('button', { name: 'Perdue' })).toBeVisible();
  await capture(page, 'P6-ancienne-affaire');
  // modifier : le titre s'enregistre
  const titre = page.locator('.fiche-titre input.titre-editable');
  await titre.fill('Ancienne affaire reprise');
  await titre.press('Enter');
  await expect.poll(async () => (await lireDocument('crm_affaires/a1'))?.titre).toBe('Ancienne affaire reprise');
  // changer d'étape : le statut redevient normal et l'ancienne date de réveil est effacée
  await page.locator('[data-action="choisir-etape"]').selectOption('proposition_envoyee');
  await expect.poll(async () => (await lireDocument('crm_affaires/a1'))?.etape).toBe('proposition_envoyee');
  const apresEtape = await lireDocument('crm_affaires/a1');
  expect(apresEtape.statut).toBe('ouverte');
  expect(apresEtape.dateReveil ?? null).toBe(null);
});

test('P6 donnée ancienne : une affaire « en_pause » peut passer perdue, puis se rouvrir', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Ancienne affaire', etape: 'rdv_fixe', statut: 'en_pause', dateReveil: jour(20) });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  await page.locator('.fiche-tete .fiche-actions').getByRole('button', { name: 'Perdue' }).click();
  await dialogue(page).getByLabel('Raison', { exact: true }).selectOption('Prix');
  await dialogue(page).getByRole('button', { name: 'Marquer comme perdue' }).click();
  await expect.poll(async () => (await lireDocument('crm_affaires/a1'))?.statut).toBe('perdue');
  expect((await lireDocument('crm_affaires/a1')).dateReveil ?? null).toBe(null);
  await expect(page.locator('.fiche-sous .pastille-statut')).toHaveText('Perdue');
  await page.locator('.fiche-actions [data-action="rouvrir"]').click();
  await expect.poll(async () => (await lireDocument('crm_affaires/a1'))?.statut).toBe('ouverte');
});

test('P6 donnée ancienne : un projet « en_pause » s’affiche comme actif et peut être terminé', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Ancien projet', phase: 'livraison', statut: 'en_pause' });
  await connecter(page);
  await allerA(page, 'Projets');
  await expect(page.locator('.carte-projet[data-projet="pr1"]')).toBeVisible();
  await expect(page.locator('.carte-projet[data-projet="pr1"] .badge-pause')).toHaveCount(0);
  await aller(page, '#/projets/projets/pr1');
  await expect(page.locator('.fiche-sous .pastille-statut')).toHaveText('Actif');
  await expect(page.locator('.fiche-tete .fiche-actions').getByRole('button', { name: 'Terminer' })).toBeVisible();
});
