// Module Devis, écran « Vocabulaire » : un mot qui désigne PLUSIEURS articles au choix (PR C5b de docs/cadrage-vocabulaire-cibles.md). Un test par point (le nom commence par C5b.x),
// une capture par état clé dans tests/e2e/captures/devis-vocabulaire-cibles/ (le nom de la capture dit le format). Articles et mots INVENTÉS. Les familles viennent avec la PR suivante (C6b).
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import {
  test, expect, connecter, attendreCalme, ecrireDocument, lireDocument,
} from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-vocabulaire-cibles/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name === 'telephone' ? 'tel' : 'ordi'}.png`, fullPage: true, animations: 'disabled' });
}
const dialogue = (page) => page.getByRole('dialog');
const ligne = (page, id) => page.locator(`tr[data-id="${id}"]`);
const entreeMenu = (page, nom) => page.getByRole('menuitem', { name: nom, exact: true });
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
/** Lit un champ du mot dans la base en réessayant : l'écran montre le résultat avant que l'écriture soit finie. */
const champMot = (id, lire) => expect.poll(async () => { const d = await lireDocument(`devis_vocabulaire/${id}`); return d ? lire(d) : null; }, { timeout: 8000 });
const cibles = (...ids) => ids.map((id) => ({ genre: 'article', id, libelle: '' }));
/** Un mot « prise » qui désigne trois prises (sans article). */
const motMultiple = (extra = {}) => mot('prise', { articleId: '', articleLibelle: '', cibles: cibles('p1', 'p2', 'p3'), ...extra });
async function catalogue() {
  await article('p1', 'Prise simple 16 A');
  await article('p2', 'Prise double 16 A');
  await article('p3', 'Prise étanche 16 A');
  await article('i1', 'Interrupteur étanche');
}
async function ouvrir(page) {
  await connecter(page, undefined, { route: 'devis/vocabulaire' });
  await expect(page.locator('.page-vocabulaire')).toBeVisible();
  await attendreCalme(page);
}
const champ = (page) => dialogue(page).getByRole('searchbox', { name: 'Chercher un article du catalogue' });
/** Choisit un article dans la fenêtre par la recherche (un clic sur le résultat). */
async function choisir(page, recherche, id) {
  await champ(page).fill(recherche);
  await dialogue(page).locator(`.resultat-composant[data-article-id="${id}"]`).click();
}
const puces = (page) => dialogue(page).locator('[data-role="puces"] .puce-choix');

test('C5b.1 « Ajouter un mot appris » : on choisit PLUSIEURS articles (des puces), le mot s’affiche « 3 articles au choix », se déplie en liste ; rien n’est écrit comme article unique', async ({ page }, info) => {
  await catalogue();
  await ouvrir(page);
  await page.locator('[data-action="ajouter-mot"]').click();
  await dialogue(page).getByRole('textbox', { name: 'Expression' }).fill('prise');
  await choisir(page, 'prise simple', 'p1');
  await choisir(page, 'prise double', 'p2');
  await choisir(page, 'prise étanche', 'p3');
  await expect(puces(page)).toHaveCount(3);
  await expect(dialogue(page).locator('[data-role="article-choisi"]')).toContainText('3 articles au choix');
  await capturer(page, info, 'C5b-1-creation-plusieurs-articles');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(ligne(page, 'prise')).toBeVisible();
  await expect(ligne(page, 'prise').locator('td[data-colonne="article"] [data-action="cibles"]')).toHaveText('3 articles au choix');
  await ligne(page, 'prise').locator('[data-action="cibles"]').click();
  await expect(ligne(page, 'prise').locator('[data-role="cibles"] li')).toHaveText(['Prise simple 16 A', 'Prise double 16 A', 'Prise étanche 16 A']);
  await capturer(page, info, 'C5b-1-liste-depliee');
  await champMot('prise', (d) => [d.articleId, d.cibles?.map((c) => c.id), d.validePar]).toEqual(['', ['p1', 'p2', 'p3'], 'humain']);
});

test('C5b.2 un seul article choisi = un mot ordinaire (« articleId », aucune « cibles ») ; sans article, un message qui dit quoi faire et rien n’est écrit', async ({ page }) => {
  await catalogue();
  await ouvrir(page);
  await page.locator('[data-action="ajouter-mot"]').click();
  await dialogue(page).getByRole('textbox', { name: 'Expression' }).fill('prise');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialogue(page).locator('[data-erreur="articleId"]')).toContainText('Choisis l’article du catalogue que ce mot désigne.'); // cas d'erreur
  expect(await lireDocument('devis_vocabulaire/prise')).toBeNull();
  await choisir(page, 'prise double', 'p2');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(ligne(page, 'prise')).toBeVisible();
  await expect(ligne(page, 'prise').locator('td[data-colonne="article"]')).toContainText('Prise double 16 A');
  await expect(ligne(page, 'prise').locator('[data-action="cibles"]')).toHaveCount(0);
  await champMot('prise', (d) => [d.articleId, d.cibles]).toEqual(['p2', undefined]);
});

test('C5b.3 8 articles au plus : le neuvième est refusé avec « 8 au plus : retire-en un d’abord. » (jamais un bouton désactivé), une puce se retire d’une croix et libère la place', async ({ page }, info) => {
  for (let i = 1; i <= 9; i += 1) await article(`n${i}`, `Vis modèle ${i}`);
  await ouvrir(page);
  await page.locator('[data-action="ajouter-mot"]').click();
  for (let i = 1; i <= 8; i += 1) await choisir(page, `vis modèle ${i}`, `n${i}`);
  await expect(puces(page)).toHaveCount(8);
  await champ(page).fill('vis modèle 9');
  const neuvieme = dialogue(page).locator('.resultat-composant[data-article-id="n9"]');
  await expect(neuvieme).toHaveAttribute('aria-disabled', 'true');
  await expect(neuvieme).toHaveJSProperty('disabled', false); // aria-disabled, jamais `disabled` : atteignable au clavier
  await neuvieme.click({ force: true }); // un clic réel sur un bouton aria-disabled : le message s'affiche
  await expect(dialogue(page).locator('[data-role="maximum"]')).toContainText('8 au plus : retire-en un d’abord.');
  await expect(puces(page)).toHaveCount(8);
  await expect(neuvieme).toHaveAttribute('aria-pressed', 'false'); // le clic sur le neuvième n'a rien choisi
  await capturer(page, info, 'C5b-3-huit-au-plus');
  await dialogue(page).locator('[data-action="retirer-article"][data-article-id="n1"]').click();
  await expect(puces(page)).toHaveCount(7);
  await expect(dialogue(page).locator('[data-role="maximum"]')).toBeHidden();
  await champ(page).fill('vis modèle 9');
  await dialogue(page).locator('.resultat-composant[data-article-id="n9"]').click();
  await expect(puces(page)).toHaveCount(8);
});

test('C5b.4 « Changer ce que le mot désigne » (menu « … ») : les articles actuels sont déjà choisis, on en retire un, le mot passe à « 2 articles au choix » ; revenir à un seul article vide les « cibles »', async ({ page }, info) => {
  await catalogue();
  await motMultiple();
  await ouvrir(page);
  await expect(entreeMenuOuvrir(page, 'prise')).toBeVisible();
  await entreeMenuOuvrir(page, 'prise').click();
  await expect(entreeMenu(page, 'Changer l’article')).toHaveCount(0);
  await entreeMenu(page, 'Changer ce que le mot désigne').click();
  await expect(dialogue(page)).toContainText('Changer ce que le mot désigne');
  await expect(puces(page)).toHaveCount(3);
  const enregistrer = dialogue(page).getByRole('button', { name: 'Enregistrer' });
  await expect(enregistrer).toHaveAttribute('aria-disabled', 'true'); // rien n'a changé : grisé
  await dialogue(page).locator('[data-action="retirer-article"][data-article-id="p2"]').click();
  await expect(enregistrer).toHaveAttribute('aria-disabled', 'false');
  await capturer(page, info, 'C5b-4-changer-ce-que-le-mot-designe');
  await enregistrer.click();
  await expect(ligne(page, 'prise').locator('[data-action="cibles"]')).toHaveText('2 articles au choix');
  await champMot('prise', (d) => d.cibles?.map((c) => c.id)).toEqual(['p1', 'p3']);
  // retour à un seul article
  await entreeMenuOuvrir(page, 'prise').click();
  await entreeMenu(page, 'Changer ce que le mot désigne').click();
  await dialogue(page).locator('[data-action="retirer-article"][data-article-id="p3"]').click();
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(ligne(page, 'prise').locator('td[data-colonne="article"]')).toContainText('Prise simple 16 A');
  await champMot('prise', (d) => [d.articleId, d.cibles]).toEqual(['p1', []]);
});
const entreeMenuOuvrir = (page, id) => ligne(page, id).locator('[data-action="menu-mot"]');

test('C5b.5 un mot à UN article propose « Changer l’article » (on remplace) et « Désigner une famille ou plusieurs articles » (on ajoute ; libellé élargi par C6b) ; le second le fait passer à « 2 articles au choix »', async ({ page }) => {
  await catalogue();
  await mot('prise');
  await ouvrir(page);
  await entreeMenuOuvrir(page, 'prise').click();
  await expect(entreeMenu(page, 'Changer l’article')).toBeVisible();
  await entreeMenu(page, 'Désigner une famille ou plusieurs articles').click();
  await expect(puces(page)).toHaveCount(1); // l'article actuel est déjà choisi
  await choisir(page, 'prise double', 'p2');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(ligne(page, 'prise').locator('[data-action="cibles"]')).toHaveText('2 articles au choix');
  await champMot('prise', (d) => [d.articleId, d.cibles?.map((c) => c.id)]).toEqual(['', ['p1', 'p2']]);
});

test('C5b.6 aucun article disponible : tous les articles du mot désactivés = pastille grise « Aucun article disponible » + « Changer ce que le mot désigne » ; « Activer » est grisé avec une phrase qui dit quoi faire', async ({ page }, info) => {
  await article('p1', 'Prise simple 16 A', { actif: false });
  await article('p2', 'Prise double 16 A', { actif: false });
  await motMultiple({ cibles: cibles('p1', 'p2'), statut: 'desactivee' });
  await ouvrir(page);
  await expect(ligne(page, 'prise').locator('[data-role="aucun-article-disponible"]')).toHaveText('Aucun article disponible');
  await expect(ligne(page, 'prise').locator('[data-action="changer-article"]')).toHaveText('Changer ce que le mot désigne');
  await entreeMenuOuvrir(page, 'prise').click();
  await expect(entreeMenu(page, 'Activer')).toBeDisabled();
  await expect(entreeMenu(page, 'Activer')).toHaveAttribute('title', /change d’abord ce qu’il désigne/);
  await expect(entreeMenu(page, 'Changer ce que le mot désigne')).toHaveCount(0); // le bouton visible fait la même chose : pas de doublon
  await page.keyboard.press('Escape');
  await capturer(page, info, 'C5b-6-aucun-article-disponible');
});

test('C5b.7 un article désactivé parmi d’autres reste dans la liste dépliée, grisé « (désactivé) » ; le mot reste actif tant qu’un article est vivant', async ({ page }) => {
  await catalogue();
  await article('p2', 'Prise double 16 A', { actif: false });
  await motMultiple();
  await ouvrir(page);
  await expect(ligne(page, 'prise').locator('[data-role="aucun-article-disponible"]')).toHaveCount(0);
  await ligne(page, 'prise').locator('[data-action="cibles"]').click();
  await expect(ligne(page, 'prise').locator('[data-role="cibles"] li').nth(1)).toContainText('Prise double 16 A (désactivé)');
});

test('C5b.8 « Essayer une phrase » : « prise étanche » dit ce que l’assistant comprend (« prise » désigne 3 articles au choix, je cherche « etanche » parmi eux) et pose UNE question à un seul choix ; l’usage départage deux articles à égalité', async ({ page }, info) => {
  await catalogue();
  await motMultiple();
  await ouvrir(page);
  await page.locator('[data-champ="essai"]').fill('une prise étanche');
  await expect(page.locator('[data-role="essai-portee"]')).toContainText('« prise » désigne 3 articles au choix et je cherche « etanche » parmi eux.');
  await expect(page.locator('[data-role="essai-decision"]')).toContainText('C’est bien « Prise étanche 16 A » ?');
  await capturer(page, info, 'C5b-8-essayer-une-phrase');
  await page.locator('[data-champ="essai"]').fill('prise');
  await expect(page.locator('[data-role="essai-decision"]')).toContainText('Prise double 16 A'); // sans usage : l'ordre alphabétique
  await ecrireDocument('devis_usage_articles/p3', { articleId: 'p3', nombre: 7, derniereUtilisationLe: maintenant }); // l'usage départage : la prise étanche, la plus utilisée, passe devant
  await expect(page.locator('[data-role="essai-decision"]')).toContainText(/Tu veux « Prise étanche 16 A »/);
});

test('C5b.9 « Essayer une phrase » : un mot qui désigne beaucoup d’articles proches = UNE question de précision, jamais la liste', async ({ page }, info) => {
  const types = ['simple', 'double', 'étanche', 'triple', 'murale', 'saillie'];
  for (const [i, t] of types.entries()) await article(`q${i}`, `Prise ${t} 16 A`);
  await mot('prise', { articleId: '', articleLibelle: '', cibles: cibles(...types.map((_, i) => `q${i}`)) });
  await ouvrir(page);
  await page.locator('[data-champ="essai"]').fill('prise');
  await expect(page.locator('[data-role="essai-decision"]')).toContainText('Il y a 6 articles qui correspondent : ');
  await expect(page.locator('[data-role="essai-decision"]')).not.toContainText('«');
  await capturer(page, info, 'C5b-9-question-de-precision');
});

test('C5b.10 l’export CSV met les articles d’un mot à plusieurs articles dans la colonne « Article », séparés par « / »', async ({ page }) => {
  await catalogue();
  await motMultiple();
  await ouvrir(page);
  await page.locator('[data-action="menu-vocabulaire"]').click();
  const [telechargement] = await Promise.all([page.waitForEvent('download'), entreeMenu(page, 'Exporter le vocabulaire (CSV)').click()]);
  const texte = (await readFile(await telechargement.path())).toString('utf8');
  expect(texte).toContain('prise,Prise simple 16 A / Prise double 16 A / Prise étanche 16 A,,Actif,Ajouté ici'); // colonne « Famille » (C6b) vide ici
});

test('C5b.11 cas vide : un catalogue vide dans la fenêtre dit « Ton catalogue est vide » avec le lien, et rien ne s’enregistre', async ({ page }) => {
  await ouvrir(page);
  await page.locator('[data-action="ajouter-mot"]').click();
  await expect(dialogue(page).locator('[data-vide="catalogue"]')).toContainText('Ton catalogue est vide');
  await expect(dialogue(page).locator('[data-role="article-choisi"]')).toContainText('Rien de choisi.'); // C6b : la fenêtre de création est en mode mixte (articles ET familles)
  await expect(puces(page)).toHaveCount(0);
});

test('C5b.12 « Ajouter un mot appris » avec un mot qui existe déjà et désigne 3 articles : « Modifier ce mot » ouvre la fenêtre AVEC ses 3 puces (jamais remplacé en silence par un seul article)', async ({ page }) => {
  await catalogue();
  await motMultiple();
  await ouvrir(page);
  await page.locator('[data-action="ajouter-mot"]').click();
  await dialogue(page).getByRole('textbox', { name: 'Expression' }).fill('prise');
  await dialogue(page).locator('[data-action="modifier-existant"]').click();
  await expect(dialogue(page)).toContainText('Changer ce que le mot désigne');
  await expect(puces(page)).toHaveCount(3);
});

test('C6a.1 « Essayer une phrase » comprend un mot qui désigne une FAMILLE (même moteur que le serveur) : « prise étanche » trouve la prise étanche dans la famille « Prises », et « tableau » (deux familles) demande de quelle famille on parle', async ({ page }, info) => {
  await ecrireDocument('devis_parametres/familles', { liste: [{ id: 'f-prises', nom: 'Prises', actif: true, parentId: 'famille-1' }, { id: 'f-tab-elec', nom: 'Tableaux électriques', actif: true, parentId: 'famille-1' }, { id: 'f-tab-com', nom: 'Tableaux de communication', actif: true, parentId: 'famille-1' }] });
  await article('p1', 'Prise simple 16 A', { familleId: 'f-prises' });
  await article('p3', 'Prise étanche 16 A', { familleId: 'f-prises' });
  await article('t1', 'Tableau électrique 2 rangées', { familleId: 'f-tab-elec' });
  await article('c1', 'Tableau de communication 6 prises', { familleId: 'f-tab-com' });
  const famille = (id, liste) => mot(id, { articleId: '', articleLibelle: '', cibles: liste.map((f) => ({ genre: 'famille', id: f, libelle: '' })) });
  await famille('prise', ['f-prises']);
  await famille('tableau', ['f-tab-elec', 'f-tab-com']);
  await ouvrir(page);
  await page.locator('[data-champ="essai"]').fill('une prise étanche');
  await expect(page.locator('[data-role="essai-portee"]')).toContainText('« prise » désigne la famille Fournitures › Prises et je cherche « etanche » dedans.'); // C6b : le texte dit « famille » (avant : « 2 articles au choix … parmi eux »)
  await expect(page.locator('[data-role="essai-decision"]')).toContainText('C’est bien « Prise étanche 16 A » ?');
  await page.locator('[data-champ="essai"]').fill('un tableau');
  await expect(page.locator('[data-role="essai-decision"]')).toContainText('Tu parles de « Fournitures › Tableaux électriques » ou de « Fournitures › Tableaux de communication » ?');
  await capturer(page, info, 'C6a-1-question-de-famille');
});
