// Fenêtre « Ajouter un mot appris » : cases à cocher, chemin complet, fenêtre plus large. Un test par point (le nom commence par le numéro du point), une capture par point
// dans tests/e2e/captures/devis-vocabulaire-cases/ (le nom dit le format : ordi ou tel). Articles, familles et mots INVENTÉS.
import { fileURLToPath } from 'node:url';
import {
  test, expect, connecter, attendreCalme, ecrireDocument,
} from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-vocabulaire-cases/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name === 'telephone' ? 'tel' : 'ordi'}.png`, fullPage: true, animations: 'disabled' });
}
const dialogue = (page) => page.getByRole('dialog');
const maintenant = new Date();
async function article(id, libelle, extra = {}) {
  await ecrireDocument(`devis_articles/${id}`, {
    code: '', libelle, unite: 'u', prixAchat: 100, tauxTva: null, actif: true, type: 'fourniture', proprietaire: 'jerome.chevalier@gmail.com',
    creeLe: maintenant, modifieLe: maintenant, creePar: 'jerome.chevalier@gmail.com', modifiePar: 'jerome.chevalier@gmail.com', ...extra,
  });
}
/** Fournitures › Plomberie (2 articles) et Fournitures › Anciennes (désactivée) ; « Receveur » est rangé dans une famille désactivée, « Joint » n'a aucune famille. */
async function catalogue() {
  await ecrireDocument('devis_parametres/familles', { liste: [
    { id: 'f-plomb', nom: 'Plomberie', actif: true, parentId: 'famille-1' },
    { id: 'f-off', nom: 'Anciennes', actif: false, parentId: 'famille-1' },
  ] });
  await article('r1', 'Exemple – Installation d’un receveur de douche', { familleId: 'f-plomb' });
  await article('r2', 'Exemple – Robinet', { familleId: 'f-plomb' });
  await article('o1', 'Exemple – Ancien siphon', { familleId: 'f-off' });
  await article('j1', 'Exemple – Joint', { familleId: '' , type: 'texte_libre_inconnu' });
}
async function ouvrir(page) {
  await connecter(page, undefined, { route: 'devis/vocabulaire' });
  await expect(page.locator('.page-vocabulaire')).toBeVisible();
  await attendreCalme(page);
  await page.locator('[data-action="ajouter-mot"]').click();
  await expect(dialogue(page)).toBeVisible();
}
const champ = (page) => dialogue(page).getByRole('searchbox', { name: 'Chercher un article du catalogue' });
const puces = (page) => dialogue(page).locator('[data-role="puces"] .puce-choix');
const enteteFamille = (page, id) => dialogue(page).locator(`[data-arbre-famille="${id}"]`);
const caseFamille = (page, id) => dialogue(page).locator(`[data-case-famille="${id}"]`);
const caseArticle = (page, id) => dialogue(page).locator(`[data-case-article="${id}"]`);
async function deplier(page, id) {
  const e = enteteFamille(page, id);
  if ((await e.getAttribute('aria-expanded')) === 'false') await e.click();
}

test('1 cases à cocher : une case à gauche de chaque article, famille et sous-famille ; plus de bouton « Choisir cette famille » ; Espace coche, l’étiquette est lisible', async ({ page }, info) => {
  await catalogue();
  await ouvrir(page);
  await deplier(page, 'famille-1');
  await deplier(page, 'f-plomb');
  await expect(dialogue(page).getByText('Choisir cette famille')).toHaveCount(0);
  await expect(dialogue(page).locator('[data-choisir-famille]')).toHaveCount(0);
  await expect(caseFamille(page, 'famille-1')).toBeVisible(); // famille
  await expect(caseFamille(page, 'f-plomb')).toBeVisible(); // sous-famille
  await expect(caseArticle(page, 'r1')).toBeVisible();
  await expect(caseFamille(page, 'sans_famille')).toHaveCount(0); // « Sans famille » n'a pas de case
  const x = async (l) => (await l.boundingBox()).x;
  expect(await x(caseFamille(page, 'f-plomb'))).toBeLessThan(await x(enteteFamille(page, 'f-plomb')));
  await expect(caseArticle(page, 'r1')).toHaveAttribute('aria-label', 'Choisir l’article « Exemple – Installation d’un receveur de douche »');
  await expect(caseFamille(page, 'f-plomb')).toHaveAttribute('aria-label', 'Choisir la famille « Plomberie »');
  await capturer(page, info, '1-cases-a-cocher');
  await caseArticle(page, 'r1').focus();
  await page.keyboard.press('Space');
  await expect(caseArticle(page, 'r1')).toBeChecked();
  await expect(puces(page)).toHaveCount(1);
  await page.keyboard.press('Space');
  await expect(caseArticle(page, 'r1')).not.toBeChecked();
  await expect(puces(page)).toHaveCount(0);
  await caseArticle(page, 'r1').check();
  await caseArticle(page, 'r2').check();
  await expect(puces(page)).toHaveCount(2);
});

test('2 règle : cocher une famille décoche les articles, cocher un article décoche la famille, avec un message court', async ({ page }, info) => {
  await catalogue();
  await ouvrir(page);
  await deplier(page, 'famille-1');
  await deplier(page, 'f-plomb');
  await caseArticle(page, 'r1').check();
  await caseArticle(page, 'r2').check();
  await expect(dialogue(page).locator('[data-role="regle"]')).toBeHidden();
  await caseFamille(page, 'f-plomb').check();
  await expect(caseArticle(page, 'r1')).not.toBeChecked();
  await expect(caseArticle(page, 'r2')).not.toBeChecked();
  await expect(puces(page)).toHaveCount(1);
  await expect(dialogue(page).locator('[data-role="regle"]')).toHaveText('Tu as choisi une famille : les articles cochés ont été décochés.');
  await capturer(page, info, '2-famille-decoche-les-articles');
  await caseArticle(page, 'r2').check();
  await expect(caseFamille(page, 'f-plomb')).not.toBeChecked();
  await expect(puces(page)).toHaveCount(1);
  await expect(dialogue(page).locator('[data-role="regle"]')).toHaveText('Tu as choisi un article : la famille cochée a été décochée.');
  await caseFamille(page, 'famille-1').check(); // une seule famille à la fois
  await caseFamille(page, 'f-plomb').check();
  await expect(caseFamille(page, 'famille-1')).not.toBeChecked();
  await expect(dialogue(page).locator('[data-role="regle"]')).toHaveText('Un mot désigne une seule famille : l’autre a été décochée.');
  await expect(puces(page)).toHaveCount(1);
});

test('3 chemin complet : sur les puces et sous chaque résultat de recherche ; « Sans famille » pour un article sans famille ou en famille désactivée', async ({ page }, info) => {
  await catalogue();
  await ouvrir(page);
  await champ(page).fill('receveur');
  const resultat = dialogue(page).locator('.resultat-composant:has([data-case-article="r1"])');
  await expect(resultat.locator('[data-role="chemin"]')).toHaveText('Fournitures › Plomberie');
  await capturer(page, info, '3-chemin-dans-la-recherche');
  await resultat.locator('input').click(); // un choix dans la recherche vide le champ : la case disparaît, on ne vérifie pas son état
  await expect(puces(page)).toHaveCount(1);
  await expect(puces(page).first()).toHaveText('Fournitures › Plomberie › Exemple – Installation d’un receveur de douche');
  await champ(page).fill('joint');
  await expect(dialogue(page).locator('.resultat-composant:has([data-case-article="j1"]) [data-role="chemin"]')).toHaveText('Sans famille');
  await champ(page).fill('siphon'); // famille désactivée : rien ne casse
  await expect(dialogue(page).locator('.resultat-composant:has([data-case-article="o1"]) [data-role="chemin"]')).toHaveText('Sans famille');
  await champ(page).fill('plomberie'); // une famille choisie : son chemin
  await dialogue(page).locator('.resultat-famille:has([data-case-famille="f-plomb"]) input').click();
  await expect(puces(page).first()).toHaveText('Famille Fournitures › Plomberie');
  await capturer(page, info, '3-chemin-sur-les-puces');
});

test('4 la fenêtre est plus large sur ordinateur et ne déborde jamais de l’écran (390 px de large sur téléphone)', async ({ page }, info) => {
  await catalogue();
  await ouvrir(page);
  await deplier(page, 'famille-1');
  await deplier(page, 'f-plomb');
  await caseArticle(page, 'r1').check();
  const boite = await dialogue(page).boundingBox();
  const vue = page.viewportSize();
  expect(boite.x).toBeGreaterThanOrEqual(0);
  expect(boite.x + boite.width).toBeLessThanOrEqual(vue.width);
  if (info.project.name === 'telephone') expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(vue.width);
  else expect(boite.width).toBeGreaterThan(680);
  await capturer(page, info, '4-fenetre-large');
});

test('5 cas vide et cas d’erreur : aucun résultat, et le neuvième choix est refusé avec le message du maximum', async ({ page }, info) => {
  await catalogue();
  for (let i = 1; i <= 9; i += 1) await article(`n${i}`, `Exemple – Vis ${i}`, { familleId: 'f-plomb' });
  await ouvrir(page);
  await champ(page).fill('zzzz');
  await expect(dialogue(page)).toContainText('Aucun article ni famille ne correspond.');
  for (let i = 1; i <= 8; i += 1) {
    await champ(page).fill(`vis ${i}`);
    await dialogue(page).locator(`[data-case-article="n${i}"]`).click();
  }
  await expect(puces(page)).toHaveCount(8);
  await champ(page).fill('vis 9');
  await dialogue(page).locator('[data-case-article="n9"]').click({ force: true });
  await expect(dialogue(page).locator('[data-role="maximum"]')).toContainText('8 au plus : retire-en un d’abord.');
  await expect(dialogue(page).locator('[data-case-article="n9"]')).not.toBeChecked();
  await expect(puces(page)).toHaveCount(8);
  await capturer(page, info, '5-huit-au-plus');
});
