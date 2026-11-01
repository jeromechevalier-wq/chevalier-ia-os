// Module Devis, écran « Vocabulaire » : un mot qui désigne une FAMILLE (PR C6b de docs/cadrage-vocabulaire-cibles.md). Un test par point (le nom commence par C6b.x),
// une capture par état clé dans tests/e2e/captures/devis-vocabulaire-familles/ (le nom de la capture dit le format). Articles, familles et mots INVENTÉS.
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import {
  test, expect, connecter, attendreCalme, ecrireDocument, lireDocument,
} from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-vocabulaire-familles/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name === 'telephone' ? 'tel' : 'ordi'}.png`, fullPage: true, animations: 'disabled' });
}
const dialogue = (page) => page.getByRole('dialog');
const ligne = (page, id) => page.locator(`tr[data-id="${id}"]`);
const entreeMenu = (page, nom) => page.getByRole('menuitem', { name: nom, exact: true });
const menuMot = (page, id) => ligne(page, id).locator('[data-action="menu-mot"]');
const maintenant = new Date();

async function article(id, libelle, extra = {}) {
  await ecrireDocument(`devis_articles/${id}`, {
    code: '', libelle, unite: 'u', prixAchat: 10, tauxTva: null, actif: true, type: 'fourniture', proprietaire: 'jerome.chevalier@gmail.com',
    creeLe: maintenant, modifieLe: maintenant, creePar: 'jerome.chevalier@gmail.com', modifiePar: 'jerome.chevalier@gmail.com', ...extra,
  });
}
async function mot(id, valeurs = {}) {
  const cle = id.replace(/_/g, ' ');
  await ecrireDocument(`devis_vocabulaire/${id}`, {
    cle, expression: cle, articleId: 'p1', articleLibelle: 'Prise simple 16 A', statut: 'active', origine: 'manuelle', confirmations: 0, contradictions: 0, conflit: false, exemples: [],
    validePar: 'humain', valideLe: '2026-10-30', revoirLe: '2027-04-30', creeLe: maintenant, modifieLe: maintenant, ...valeurs,
  });
}
const champMot = (id, lire) => expect.poll(async () => { const d = await lireDocument(`devis_vocabulaire/${id}`); return d ? lire(d) : null; }, { timeout: 8000 });
const motFamille = (id, familleIds, extra = {}) => mot(id, { articleId: '', articleLibelle: '', cibles: familleIds.map((f) => ({ genre: 'famille', id: f, libelle: '' })), ...extra });
/** Trois familles sous « Fournitures » : Prises (3 articles), Rallonges (vide), Anciennes prises (désactivée). */
async function familles() {
  await ecrireDocument('devis_parametres/familles', { liste: [
    { id: 'f-prises', nom: 'Prises', actif: true, parentId: 'famille-1' },
    { id: 'f-vide', nom: 'Rallonges', actif: true, parentId: 'famille-1' },
    { id: 'f-off', nom: 'Anciennes prises', actif: false, parentId: 'famille-1' },
  ] });
}
async function catalogue() {
  await familles();
  await article('p1', 'Prise simple 16 A', { familleId: 'f-prises' });
  await article('p2', 'Prise double 16 A', { familleId: 'f-prises' });
  await article('p3', 'Prise étanche 16 A', { familleId: 'f-prises' });
  await article('i1', 'Interrupteur étanche', { familleId: 'famille-1-8' });
}
async function ouvrir(page) {
  await connecter(page, undefined, { route: 'devis/vocabulaire' });
  await expect(page.locator('.page-vocabulaire')).toBeVisible();
  await attendreCalme(page);
}
const champ = (page) => dialogue(page).getByRole('searchbox', { name: 'Chercher un article du catalogue' });
const puces = (page) => dialogue(page).locator('[data-role="puces"] .puce-choix');
const enteteFamille = (page, id) => dialogue(page).locator(`[data-arbre-famille="${id}"]`);
/** Déplie une famille seulement si elle est fermée (l'arbre s'ouvre tout seul sur l'article déjà choisi : un clic de plus la refermerait). */
async function deplier(page, id) {
  const entete = enteteFamille(page, id);
  if ((await entete.getAttribute('aria-expanded')) === 'false') await entete.click();
}
const choisirFamilleArbre = (page, id) => dialogue(page).locator(`[data-case-famille="${id}"]`);
async function ouvrirCreation(page, expression) {
  await page.locator('[data-action="ajouter-mot"]').click();
  await dialogue(page).getByRole('textbox', { name: 'Expression' }).fill(expression);
}
const enregistrer = (page) => dialogue(page).getByRole('button', { name: 'Enregistrer' });

test('C6b.1 « Ajouter un mot appris » : la case de la famille dans l’arbre met une puce « Famille Fournitures › Prises » ; le mot dit « Famille … (3 articles) » et rien n’est écrit comme article', async ({ page }, info) => {
  await catalogue();
  await ouvrir(page);
  await ouvrirCreation(page, 'prise');
  await deplier(page, 'famille-1');
  await expect(choisirFamilleArbre(page, 'f-prises')).not.toBeChecked();
  await expect(dialogue(page).getByText('Choisir cette famille')).toHaveCount(0); // plus de bouton : la case suffit
  await choisirFamilleArbre(page, 'f-prises').check();
  await expect(puces(page)).toHaveText(['Famille Fournitures › Prises']);
  await expect(dialogue(page).locator('[data-role="article-choisi"]')).toContainText('Famille choisie : Fournitures › Prises');
  await expect(choisirFamilleArbre(page, 'f-prises')).toBeChecked();
  await capturer(page, info, 'C6b-1-choisir-une-famille');
  await enregistrer(page).click();
  await expect(ligne(page, 'prise')).toBeVisible();
  await expect(ligne(page, 'prise').locator('[data-action="cibles"]')).toHaveText('Famille Fournitures › Prises (3 articles)');
  await ligne(page, 'prise').locator('[data-action="cibles"]').click();
  await expect(ligne(page, 'prise').locator('[data-role="cibles"] li')).toHaveText(['Famille Fournitures › Prises (3 articles)']);
  await capturer(page, info, 'C6b-1-famille-dans-la-liste');
  await champMot('prise', (d) => [d.articleId, d.articleLibelle, d.cibles]).toEqual(['', '', [{ genre: 'famille', id: 'f-prises', libelle: 'Fournitures › Prises' }]]);
});

test('C6b.2 la recherche a deux groupes « Familles » et « Articles » ; cocher la famille la choisit ; cocher un article ensuite décoche la famille (un mot désigne des articles OU une famille)', async ({ page }, info) => {
  await catalogue();
  await ouvrir(page);
  await ouvrirCreation(page, 'prise');
  await champ(page).fill('prise');
  await expect(dialogue(page).locator('[data-groupe="familles"]')).toHaveText('Familles');
  await expect(dialogue(page).locator('[data-groupe="articles"]')).toHaveText('Articles');
  await expect(dialogue(page).locator('.resultat-famille[data-famille-id="f-prises"]')).toContainText('Fournitures › Prises');
  await expect(dialogue(page).locator('.resultat-famille[data-famille-id="f-off"]')).toHaveCount(0); // une famille désactivée n'est jamais proposée
  await capturer(page, info, 'C6b-2-recherche-deux-groupes');
  await dialogue(page).locator('.resultat-famille[data-famille-id="f-prises"]').click();
  await champ(page).fill('interrupteur');
  await dialogue(page).locator('.resultat-composant[data-article-id="i1"]').click();
  await expect(puces(page)).toHaveCount(1);
  await expect(puces(page).first()).toContainText('Interrupteur étanche');
  await expect(dialogue(page).locator('[data-role="regle"]')).toHaveText('Tu as choisi un article : la famille cochée a été décochée.');
  await enregistrer(page).click();
  await expect(ligne(page, 'prise')).toContainText('Interrupteur étanche');
  await champMot('prise', (d) => [d.articleId, d.cibles ?? null]).toEqual(['i1', null]);
});

test('C6b.3 avec 8 articles cochés, la case de la famille reste active : la cocher remplace les articles (message), la croix de sa puce la retire', async ({ page }, info) => {
  await catalogue();
  for (let i = 1; i <= 8; i += 1) await article(`n${i}`, `Vis modèle ${i}`);
  await ouvrir(page);
  await ouvrirCreation(page, 'vis');
  for (let i = 1; i <= 8; i += 1) {
    await champ(page).fill(`vis modèle ${i}`);
    await dialogue(page).locator(`.resultat-composant[data-article-id="n${i}"]`).click();
  }
  await expect(puces(page)).toHaveCount(8);
  await champ(page).fill('');
  await deplier(page, 'famille-1');
  const prises = choisirFamilleArbre(page, 'f-prises');
  await expect(prises).not.toHaveAttribute('aria-disabled', 'true'); // le maximum de 8 articles ne concerne pas une famille
  await capturer(page, info, 'C6b-3-huit-articles-puis-famille');
  await prises.check();
  await expect(puces(page)).toHaveCount(1);
  await expect(dialogue(page).locator('[data-role="regle"]')).toContainText('les articles cochés ont été décochés');
  await expect(dialogue(page).locator('[data-role="maximum"]')).toBeHidden();
  await dialogue(page).locator('[data-action="retirer-famille"][data-famille-id="f-prises"]').click();
  await expect(puces(page)).toHaveCount(0);
  await expect(prises).not.toBeChecked();
});

test('C6b.4 pastilles : une famille VIDE = « Famille vide » (le mot reste activable, elle se remplira) ; une famille désactivée = « Aucun article disponible » + « Changer ce que le mot désigne »', async ({ page }, info) => {
  await catalogue();
  await motFamille('rallonge', ['f-vide'], { statut: 'desactivee' });
  await motFamille('ancien', ['f-off'], { statut: 'desactivee' });
  await ouvrir(page);
  await expect(ligne(page, 'rallonge').locator('[data-action="cibles"]')).toHaveText('Famille Fournitures › Rallonges (vide)');
  await expect(ligne(page, 'rallonge').locator('[data-role="famille-vide"]')).toHaveText('Famille vide');
  await expect(ligne(page, 'rallonge').locator('[data-role="aucun-article-disponible"]')).toHaveCount(0);
  await expect(ligne(page, 'ancien').locator('[data-action="cibles"]')).toHaveText('Famille Fournitures › Anciennes prises (désactivée)');
  await expect(ligne(page, 'ancien').locator('[data-role="aucun-article-disponible"]')).toHaveText('Aucun article disponible');
  await expect(ligne(page, 'ancien').locator('[data-action="changer-article"]')).toHaveText('Changer ce que le mot désigne');
  await capturer(page, info, 'C6b-4-pastilles');
  await menuMot(page, 'rallonge').click();
  await expect(entreeMenu(page, 'Activer')).toBeEnabled();
  await entreeMenu(page, 'Activer').click();
  await champMot('rallonge', (d) => d.statut).toBe('active');
  await menuMot(page, 'ancien').click();
  await expect(entreeMenu(page, 'Activer')).toBeDisabled();
  await page.keyboard.press('Escape');
});

test('C6b.5 « Changer ce que le mot désigne » : un mot à une famille s’ouvre avec sa puce ; on y ajoute un article ; un mot à UN article passe à une famille par « Désigner une famille ou plusieurs articles »', async ({ page }, info) => {
  await catalogue();
  await motFamille('prise', ['f-prises']);
  await mot('interrupteur', { articleId: 'i1', articleLibelle: 'Interrupteur étanche' });
  await ouvrir(page);
  await menuMot(page, 'prise').click();
  await entreeMenu(page, 'Changer ce que le mot désigne').click();
  await expect(puces(page)).toHaveText(['Famille Fournitures › Prises']);
  await expect(enregistrer(page)).toHaveAttribute('aria-disabled', 'true'); // rien n'a changé : grisé
  await champ(page).fill('interrupteur');
  await dialogue(page).locator('.resultat-composant[data-article-id="i1"]').click();
  await expect(enregistrer(page)).toHaveAttribute('aria-disabled', 'false');
  await capturer(page, info, 'C6b-5-changer-ce-que-le-mot-designe');
  await expect(dialogue(page).locator('[data-role="regle"]')).toContainText('la famille cochée a été décochée'); // la règle : un article remplace la famille
  await enregistrer(page).click();
  await expect(ligne(page, 'prise')).toContainText('Interrupteur étanche');
  await menuMot(page, 'interrupteur').click();
  await entreeMenu(page, 'Désigner une famille ou plusieurs articles').click();
  await expect(puces(page)).toHaveCount(1);
  await expect(puces(page).first()).toContainText('Interrupteur étanche');
  await dialogue(page).locator('[data-action="retirer-article"][data-article-id="i1"]').click();
  await deplier(page, 'famille-1');
  await choisirFamilleArbre(page, 'f-prises').check();
  await enregistrer(page).click();
  await expect(ligne(page, 'interrupteur').locator('[data-action="cibles"]')).toHaveText('Famille Fournitures › Prises (3 articles)');
  await champMot('interrupteur', (d) => [d.articleId, d.cibles?.map((c) => c.id)]).toEqual(['', ['f-prises']]);
});

test('C6b.6 « Essayer une phrase » dit la famille comprise (« je cherche « etanche » dedans ») et pose UNE question ; « prise » seul (famille sans reste) est proposé, jamais ajouté tout de suite', async ({ page }, info) => {
  await catalogue();
  await motFamille('prise', ['f-prises']);
  await ouvrir(page);
  await page.locator('[data-champ="essai"]').fill('une prise étanche');
  await expect(page.locator('[data-role="essai-portee"]')).toHaveText('Je comprends : « prise » désigne la famille Fournitures › Prises et je cherche « etanche » dedans.');
  await expect(page.locator('[data-role="essai-decision"]')).toContainText('C’est bien « Prise étanche 16 A » ?');
  await capturer(page, info, 'C6b-6-essayer-une-phrase-famille');
  await page.locator('[data-champ="essai"]').fill('prise');
  await expect(page.locator('[data-role="essai-portee"]')).toHaveText('Je comprends : « prise » désigne la famille Fournitures › Prises.');
  await expect(page.locator('[data-role="essai-decision"]')).not.toContainText('Ton IA l’ajouterait tout de suite');
});

test('C6b.7 l’export CSV a la colonne « Famille » (le chemin) à côté de « Article »', async ({ page }) => {
  await catalogue();
  await motFamille('prise', ['f-prises']);
  await mot('interrupteur', { articleId: 'i1', articleLibelle: 'Interrupteur étanche' });
  await ouvrir(page);
  await page.locator('[data-action="menu-vocabulaire"]').click();
  const [telechargement] = await Promise.all([page.waitForEvent('download'), entreeMenu(page, 'Exporter le vocabulaire (CSV)').click()]);
  const lignes = (await readFile(await telechargement.path())).toString('utf8').replace('﻿', '').trim().split('\r\n');
  expect(lignes[0]).toBe('Expression,Article,Famille,Statut,Origine,Confirmations,Dernière utilisation');
  expect(lignes[1]).toContain('interrupteur,Interrupteur étanche,,Actif,Ajouté ici');
  expect(lignes[2]).toContain('prise,,Fournitures › Prises,Actif,Ajouté ici');
});

test('C6b.8 cas vide et cas d’erreur : un catalogue sans article garde les familles choisissables sous « Ton catalogue est vide » ; sans rien choisi, l’écran dit quoi faire et n’écrit rien', async ({ page }, info) => {
  await familles();
  await ouvrir(page);
  await ouvrirCreation(page, 'prise');
  await expect(dialogue(page).locator('[data-vide="catalogue"]')).toContainText('Ton catalogue est vide : crée tes articles dans le catalogue.');
  await deplier(page, 'famille-1');
  await expect(choisirFamilleArbre(page, 'f-vide')).toBeVisible(); // une famille vide se choisit : elle se remplira
  await deplier(page, 'f-vide');
  await expect(dialogue(page).locator('li.arbre-famille.niveau-2:has([data-arbre-famille="f-vide"]) > ul > [data-vide="famille"]')).toContainText('Aucun article dans cette famille.');
  await capturer(page, info, 'C6b-8-catalogue-vide');
  await enregistrer(page).click();
  await expect(dialogue(page).locator('[data-erreur="articleId"]')).toContainText('Choisis l’article du catalogue que ce mot désigne.');
  expect(await lireDocument('devis_vocabulaire/prise')).toBeNull();
  await champ(page).fill('zzzz');
  await expect(dialogue(page)).toContainText('Aucun article ni famille ne correspond.');
  await expect(dialogue(page).locator('[data-role="arbre-catalogue"]')).toBeHidden(); // l'arbre est caché pendant la recherche
  await champ(page).fill('');
  await choisirFamilleArbre(page, 'f-vide').check();
  await enregistrer(page).click();
  await expect(ligne(page, 'prise').locator('[data-role="famille-vide"]')).toHaveText('Famille vide');
  await champMot('prise', (d) => d.cibles?.map((c) => c.id)).toEqual(['f-vide']);
});

test('C6b.9 un mot « famille désactivée + un article » : la fenêtre s’ouvre avec la seule puce vivante et « Enregistrer » est ACTIF (il retire la famille morte), jamais une impasse grisée', async ({ page }) => {
  await catalogue();
  await mot('prise', { articleId: '', articleLibelle: '', cibles: [{ genre: 'famille', id: 'f-off', libelle: '' }, { genre: 'article', id: 'p1', libelle: '' }] });
  await ouvrir(page);
  await menuMot(page, 'prise').click();
  await entreeMenu(page, 'Changer ce que le mot désigne').click();
  await expect(puces(page)).toHaveCount(1);
  await expect(puces(page).first()).toContainText('Prise simple 16 A');
  await expect(enregistrer(page)).toHaveAttribute('aria-disabled', 'false');
  await enregistrer(page).click();
  await champMot('prise', (d) => [d.articleId, d.cibles?.map((c) => c.id)]).toEqual(['p1', []]);
});
