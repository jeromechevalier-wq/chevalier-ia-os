// Module Devis, écran « Vocabulaire » (docs/proposition-dictionnaire-vocabulaire.md, section 8) : les mots appris par l'assistant, chez Jérôme (racine).
// Un test par point (le nom commence par E1 à E11), une capture par état clé dans tests/e2e/captures/devis-vocabulaire/ (ordinateur ; téléphone en plus quand la mise en page change).
// Mots, articles et phrases INVENTÉS. Les écritures refusées (E10) sont simulées en envoyant les écritures vers une collection que les règles interdisent (devis_compteurs) : aucun code de l'appli n'est changé.
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import {
  test, expect, connecter, attendreCalme, estTelephone, ecrireDocument, lireDocument, listerDocuments,
} from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-vocabulaire/', import.meta.url));
async function capturer(page, info, nom) {
  if (info.project.name !== 'ordinateur') return;
  await page.screenshot({ path: `${DOSSIER}${nom}.png`, fullPage: true, animations: 'disabled' });
}
/** La mise en page change sur téléphone (les lignes deviennent des cartes) : une capture de plus, seulement dans ce format. */
async function capturerTelephone(page, info, nom) {
  if (info.project.name !== 'telephone') return;
  await page.screenshot({ path: `${DOSSIER}${nom}-tel.png`, fullPage: true, animations: 'disabled' });
}
const dialogue = (page) => page.getByRole('dialog');
const ligne = (page, id) => page.locator(`tr[data-id="${id}"]`);
const menuDe = (page, id) => ligne(page, id).locator('[data-action="menu-mot"]');
const maintenant = new Date();

async function article(id, valeurs = {}) {
  await ecrireDocument(`devis_articles/${id}`, {
    code: '', libelle: 'Article test', unite: 'u', prixAchat: 10, tauxTva: null, actif: true, proprietaire: 'jerome.chevalier@gmail.com',
    creeLe: maintenant, modifieLe: maintenant, creePar: 'jerome.chevalier@gmail.com', modifiePar: 'jerome.chevalier@gmail.com', ...valeurs,
  });
}
async function mot(id, valeurs = {}) {
  const cle = id.replace(/_/g, ' ');
  await ecrireDocument(`devis_vocabulaire/${id}`, {
    cle, expression: cle, articleId: 'a02', articleLibelle: 'Prise double 16 A', statut: 'active', origine: 'apprise_question', confirmations: 2, contradictions: 0, conflit: false, exemples: [],
    creeLe: maintenant, modifieLe: maintenant, ...valeurs,
  });
}
/** Un petit catalogue et quatre mots : un actif utilisé, un en conflit, un à confirmer jamais utilisé, un désactivé. */
async function jeuDEssai() {
  await article('a02', { libelle: 'Prise double 16 A', prixAchat: 4 });
  await article('a04', { libelle: 'Tableau électrique 2 rangées', prixAchat: 100 });
  await article('a05', { libelle: 'Tableau électrique 4 rangées', prixAchat: 180 });
  await article('a08', { libelle: 'Gaine ICTA 20 mm', prixAchat: 0.5, unite: 'm' });
  await mot('prise_double', { articleId: 'a02', articleLibelle: 'Prise double 16 A', confirmations: 3, exemples: ['mets 3 prises doubles dans la cuisine', 'une prise double de plus'], derniereUtilisationLe: '2026-10-20' });
  await mot('tableau', { articleId: 'a04', articleLibelle: 'Tableau électrique 2 rangées', origine: 'apprise_correction', confirmations: 2, contradictions: 1, conflit: true, derniereUtilisationLe: '2026-10-25' });
  await mot('gaine', { articleId: 'a08', articleLibelle: 'Gaine ICTA 20 mm', statut: 'a_confirmer', confirmations: 1, exemples: ['de la gaine pour le garage'] });
  await mot('rj', { cle: 'rj', expression: 'RJ', articleId: 'a02', articleLibelle: 'Prise double 16 A', statut: 'desactivee', origine: 'manuelle', confirmations: 0, derniereUtilisationLe: '2026-09-01' });
}
async function ouvrir(page, route = 'devis/vocabulaire') {
  await connecter(page, undefined, { route });
  await expect(page.locator('.page-vocabulaire')).toBeVisible();
  await attendreCalme(page);
}
const ordre = (page) => page.locator('tr.ligne-mot').evaluateAll((trs) => trs.map((t) => t.dataset.id));
const entreeMenu = (page, nom) => page.getByRole('menuitem', { name: nom, exact: true });

test('E1 la liste des devis a un bouton « Vocabulaire » ; il ouvre l’écran (même barre du haut, entrée Devis allumée) et la flèche « ‹ Devis » ramène à la liste', { tag: '@smoke' }, async ({ page }, info) => {
  await connecter(page, undefined, { route: 'devis/liste' });
  await expect(page.getByRole('heading', { name: 'Devis', level: 1 })).toBeVisible();
  await page.locator('[data-action="ouvrir-vocabulaire"]').click();
  await expect(page).toHaveURL(/#\/devis\/vocabulaire$/);
  await expect(page.getByRole('heading', { name: 'Vocabulaire', level: 1 })).toBeVisible();
  await expect(page.locator('.page-vocabulaire')).toBeVisible();
  if (estTelephone(page)) await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await expect(page.locator('.menu .menu-entree[aria-current="page"]')).toHaveText('Devis');
  if (estTelephone(page)) await page.keyboard.press('Escape');
  await capturer(page, info, 'E1-acces-vocabulaire');
  await page.locator('[data-action="retour-devis"]').click();
  await expect(page).toHaveURL(/#\/devis\/liste$/);
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Vocabulaire', level: 1 })).toBeVisible();
  await page.goto('/?emulateurs=1#/devis/bordereau'); // le Catalogue reste là, rien n'a changé pour lui
  await expect(page.getByRole('heading', { name: 'Catalogue', level: 1 })).toBeVisible();
});

test('E2 la phrase d’état compte actifs, à confirmer et à trancher ; recherche, filtres et tri se combinent', async ({ page }, info) => {
  await jeuDEssai();
  await ouvrir(page);
  await expect(page.locator('[data-role="phrase-etat"]')).toHaveText('1 mot appris actif · 1 à confirmer · 1 à trancher');
  expect(await ordre(page)).toEqual(['tableau', 'prise_double', 'rj', 'gaine']); // dernière utilisation, « jamais utilisé » en dernier
  await expect(page.locator('.champ-tri')).toHaveValue('utilisation');
  // recherche : sans accents, dans l'article
  await page.getByRole('searchbox', { name: 'Rechercher un mot appris' }).fill('ELECTRIQUE');
  expect(await ordre(page)).toEqual(['tableau']);
  await expect(page.locator('[data-role="phrase-etat"]')).toContainText('1 affiché');
  await page.getByRole('searchbox', { name: 'Rechercher un mot appris' }).fill('');
  // filtres
  await page.locator('[data-action="filtres"]').click();
  await expect(dialogue(page).getByRole('checkbox', { name: 'À trancher seulement' })).toBeVisible();
  await expect(dialogue(page).getByRole('checkbox', { name: 'Mot trop général' })).toBeVisible();
  await expect(dialogue(page).getByRole('checkbox', { name: 'À confirmer' })).toBeVisible();
  await expect(dialogue(page).getByRole('checkbox', { name: 'Appris (correction)' })).toBeVisible();
  await capturer(page, info, 'E2-fenetre-filtres');
  await dialogue(page).getByRole('checkbox', { name: 'À confirmer' }).check();
  await dialogue(page).getByRole('checkbox', { name: 'Actif' }).check();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  expect(await ordre(page)).toEqual(['tableau', 'prise_double', 'gaine']); // « ou » dans un groupe
  await expect(page.locator('[data-action="filtres"] .compteur-filtres')).toHaveText('2');
  await page.locator('[data-action="filtres"]').click();
  await dialogue(page).getByRole('checkbox', { name: 'À trancher seulement' }).check();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  expect(await ordre(page)).toEqual(['tableau']); // « et » entre groupes
  await capturer(page, info, 'E2-filtre-a-trancher');
  await page.locator('[data-action="filtres"]').click();
  await dialogue(page).getByRole('button', { name: 'Tout effacer' }).click();
  expect(await ordre(page)).toEqual(['tableau', 'prise_double', 'rj', 'gaine']);
  // tri : « À trancher d'abord » met le conflit puis les mots à confirmer en tête
  await page.locator('.champ-tri').selectOption('a_trancher');
  expect(await ordre(page)).toEqual(['tableau', 'gaine', 'prise_double', 'rj']);
  await page.locator('[data-action="inverser-tri"]').click();
  expect(await ordre(page)).toEqual(['rj', 'prise_double', 'gaine', 'tableau']);
});

test('E3 chaque mot montre son expression, son article (lien vers le catalogue), son origine, ses compteurs, sa dernière utilisation, ses exemples et son statut', async ({ page }, info) => {
  await jeuDEssai();
  await ouvrir(page);
  const l = ligne(page, 'prise_double');
  await expect(l.locator('[data-colonne="mot"]')).toContainText('prise double');
  await expect(l.locator('[data-colonne="article"] a')).toHaveText('Prise double 16 A');
  await expect(l.locator('[data-colonne="article"] a')).toHaveAttribute('href', '#/devis/bordereau');
  await expect(l.locator('[data-colonne="origine"]')).toHaveText('Appris (question)');
  await expect(l.locator('[data-colonne="confirmations"]')).toHaveText('3 confirmations');
  await expect(l.locator('[data-colonne="utilisation"]')).toHaveText('20/10/2026');
  await expect(l.locator('[data-role="statut"]')).toHaveText('Actif');
  await expect(ligne(page, 'tableau').locator('[data-colonne="confirmations"]')).toHaveText('2 confirmations · 1 contradiction');
  await expect(ligne(page, 'tableau').locator('[data-role="a-trancher"]')).toHaveText('À trancher');
  await expect(ligne(page, 'gaine').locator('[data-colonne="utilisation"]')).toHaveText('Jamais');
  await expect(ligne(page, 'gaine').locator('[data-role="statut"]')).toHaveText('À confirmer');
  await expect(ligne(page, 'rj').locator('[data-role="statut"]')).toHaveText('Désactivé');
  // les phrases d'exemple se développent au clic
  await expect(l.locator('[data-role="exemples"]')).toHaveCount(0);
  await l.locator('[data-action="exemples"]').click();
  await expect(l.locator('[data-role="exemples"] li')).toHaveText(['mets 3 prises doubles dans la cuisine', 'une prise double de plus']);
  await expect(l.locator('[data-action="exemples"]')).toHaveAttribute('aria-expanded', 'true');
  // jamais jaune : le jaune est réservé à l'action principale ; ces liens ont la couleur du texte de la ligne
  const couleurTexte = await l.locator('[data-colonne="origine"]').evaluate((e) => getComputedStyle(e).color);
  await expect(l.locator('[data-action="exemples"]')).toHaveCSS('color', couleurTexte);
  const jaune = await page.locator('[data-action="ajouter-mot"]').evaluate((e) => getComputedStyle(e).color);
  expect(await l.locator('[data-colonne="article"] a').evaluate((e) => getComputedStyle(e).textDecorationColor)).not.toBe(jaune);
  await capturer(page, info, 'E3-liste');
  await capturerTelephone(page, info, 'E3-liste');
  if (estTelephone(page)) {
    const boite = await menuDe(page, 'prise_double').boundingBox();
    expect(boite.width).toBeGreaterThanOrEqual(44);
    expect(boite.height).toBeGreaterThanOrEqual(44);
  }
  await l.locator('[data-action="exemples"]').click();
  await expect(l.locator('[data-role="exemples"]')).toHaveCount(0);
});

test('E4 Désactiver demande confirmation (« Ce mot ne sera plus proposé à ton assistant. »), laisse « Retiré · Annuler » 8 secondes, et Annuler remet le statut d’avant', async ({ page }, info) => {
  await jeuDEssai();
  await ouvrir(page);
  await menuDe(page, 'gaine').click();
  await expect(entreeMenu(page, 'Désactiver')).toBeVisible();
  await entreeMenu(page, 'Désactiver').click();
  await expect(dialogue(page)).toContainText('Désactiver ce mot ?');
  await expect(dialogue(page)).toContainText('Ce mot ne sera plus proposé à ton assistant.');
  await expect(dialogue(page).getByRole('button', { name: 'Annuler' })).toBeVisible();
  await capturer(page, info, 'E4-confirmation');
  await dialogue(page).getByRole('button', { name: 'Désactiver' }).click();
  await expect(page.locator('.toast')).toContainText('Mot retiré');
  await expect(page.locator('.toast [data-action="toast-action"]')).toHaveText('Annuler');
  await expect(ligne(page, 'gaine').locator('[data-role="statut"]')).toHaveText('Désactivé');
  await expect.poll(async () => (await lireDocument('devis_vocabulaire/gaine')).statut).toBe('desactivee');
  expect(await listerDocuments('devis_vocabulaire')).toHaveLength(4); // jamais supprimé
  const doc = await lireDocument('devis_vocabulaire/gaine');
  expect([doc.confirmations, doc.contradictions, doc.origine]).toEqual([1, 0, 'apprise_question']); // les compteurs ne bougent pas
  await capturer(page, info, 'E4-retire-annuler');
  await page.locator('.toast [data-action="toast-action"]').click();
  await expect(ligne(page, 'gaine').locator('[data-role="statut"]')).toHaveText('À confirmer'); // le statut d'avant, pas « Actif »
  await expect.poll(async () => (await lireDocument('devis_vocabulaire/gaine')).statut).toBe('a_confirmer');
  const audit = (await listerDocuments('crm_audit')).filter((a) => a.collection === 'devis_vocabulaire');
  expect(audit.map((a) => a.outil)).toEqual(['vocabulaire', 'vocabulaire']);
});

test('E5 Changer l’article ouvre une recherche dans le catalogue ; le choix met à jour l’article du mot sans toucher à ses compteurs', async ({ page }, info) => {
  await jeuDEssai();
  await ouvrir(page);
  await menuDe(page, 'tableau').click();
  await entreeMenu(page, 'Changer l’article').click();
  await expect(dialogue(page)).toContainText('Changer l’article');
  const enregistrer = dialogue(page).getByRole('button', { name: 'Enregistrer' });
  await expect(enregistrer).toHaveAttribute('aria-disabled', 'true'); // rien de nouveau choisi
  await dialogue(page).getByRole('searchbox', { name: 'Chercher un article du catalogue' }).fill('4 rangees');
  await expect(dialogue(page).locator('[data-article-id]')).toHaveCount(1);
  await capturer(page, info, 'E5-changer-article');
  await dialogue(page).locator('[data-article-id="a05"]').click();
  await expect(dialogue(page).locator('[data-role="article-choisi"]')).toContainText('Tableau électrique 4 rangées');
  await expect(enregistrer).toHaveAttribute('aria-disabled', 'false');
  await enregistrer.click();
  await expect(dialogue(page)).toHaveCount(0);
  await expect(ligne(page, 'tableau').locator('[data-colonne="article"] a')).toHaveText('Tableau électrique 4 rangées');
  const doc = await lireDocument('devis_vocabulaire/tableau');
  expect([doc.articleId, doc.articleLibelle, doc.conflit, doc.confirmations, doc.contradictions]).toEqual(['a05', 'Tableau électrique 4 rangées', false, 2, 1]); // choisir l'article tranche le conflit
  await expect(ligne(page, 'tableau').locator('[data-role="a-trancher"]')).toHaveCount(0);
});

test('E6 « Mot appris  + Ajouter » : Enregistrer reste grisé tant que l’expression est vide, la clé normalisée s’affiche, un mot qui existe déjà est à modifier et non à doubler', async ({ page }, info) => {
  await jeuDEssai();
  await ouvrir(page);
  await expect(page.locator('.page-vocabulaire .bouton-principal')).toHaveCount(0); // sur l'écran, « + Ajouter » est un texte jaune : le seul bouton jaune est celui du formulaire
  await page.locator('[data-action="ajouter-mot"]').click();
  await expect(dialogue(page)).toContainText('Ajouter un mot appris');
  const enregistrer = dialogue(page).getByRole('button', { name: 'Enregistrer' });
  await expect(enregistrer).toHaveAttribute('aria-disabled', 'true');
  await expect(dialogue(page).locator('.bouton-principal')).toHaveCount(0); // grisé = pas jaune
  await enregistrer.click({ force: true }); // un clic sur un bouton grisé (aria-disabled) ne ferme rien et dit quoi faire
  await expect(dialogue(page)).toBeVisible();
  await expect(dialogue(page).locator('[data-erreur="expression"]')).toContainText('Écris le mot');
  expect(await listerDocuments('devis_vocabulaire')).toHaveLength(4);
  await dialogue(page).getByRole('textbox', { name: 'Expression' }).fill('Gaines  annelées');
  await expect(enregistrer).toHaveAttribute('aria-disabled', 'false'); // jaune dès le premier caractère
  await expect(dialogue(page).locator('.bouton-principal')).toHaveCount(1);
  await expect(dialogue(page).locator('[data-role="cle"]')).toContainText('« gaine annelee »');
  await enregistrer.click(); // pas d'article choisi : le bouton est jaune, le message dit quoi faire
  await expect(dialogue(page).locator('[data-erreur="articleId"]')).toContainText('Choisis l’article');
  await dialogue(page).getByRole('searchbox', { name: 'Chercher un article du catalogue' }).fill('gaine');
  await capturer(page, info, 'E6-formulaire');
  await dialogue(page).locator('[data-article-id="a08"]').click();
  await enregistrer.click();
  await expect(dialogue(page)).toHaveCount(0);
  await expect(page.locator('.toast')).toContainText('Mot ajouté');
  const doc = await lireDocument('devis_vocabulaire/gaine_annelee');
  expect(doc).toMatchObject({ cle: 'gaine annelee', expression: 'Gaines annelées', articleId: 'a08', articleLibelle: 'Gaine ICTA 20 mm', statut: 'active', origine: 'manuelle', confirmations: 0, contradictions: 0, conflit: false });
  expect(doc.exemples).toEqual([]);
  await expect(ligne(page, 'gaine_annelee').locator('[data-colonne="origine"]')).toHaveText('Ajouté ici');
  await expect(ligne(page, 'gaine_annelee').locator('[data-colonne="utilisation"]')).toHaveText('Jamais');
  const audit = (await listerDocuments('crm_audit')).filter((a) => a.collection === 'devis_vocabulaire');
  expect(audit.map((a) => [a.action, a.outil])).toEqual([['creer', 'vocabulaire']]);
  // un mot qui existe déjà (même clé) : message, pas d'écrasement, « Modifier ce mot » ouvre le choix de l'article
  await page.locator('[data-action="ajouter-mot"]').click();
  await dialogue(page).getByRole('textbox', { name: 'Expression' }).fill('Prises doubles');
  await expect(dialogue(page).locator('[data-erreur="expression"]')).toContainText('Ce mot existe déjà');
  await expect(dialogue(page).getByRole('button', { name: 'Enregistrer' })).toHaveAttribute('aria-disabled', 'true');
  await capturer(page, info, 'E6-mot-existant');
  await dialogue(page).locator('[data-action="modifier-existant"]').click();
  await expect(dialogue(page)).toContainText('Changer l’article');
  await expect(dialogue(page)).toContainText('prise double');
  await page.keyboard.press('Escape');
  expect((await lireDocument('devis_vocabulaire/prise_double')).confirmations).toBe(3); // rien n'a été écrasé
  await capturerTelephone(page, info, 'E6-liste-apres-ajout');
});

test('E7 « Essayer une phrase » montre la décision de l’assistant avec le vrai moteur et n’écrit rien', async ({ page }, info) => {
  await jeuDEssai();
  await ouvrir(page);
  await expect(page.locator('.bloc-essai [data-role="info"]')).toHaveAttribute('aria-label', /Montre ce que ton assistant comprendrait/);
  const champ = page.getByRole('textbox', { name: 'Essayer une phrase' });
  await champ.fill('mets 3 prises doubles');
  await expect(page.locator('[data-role="essai-cle"]')).toContainText('« prise double »');
  await expect(page.locator('[data-role="essai-decision"]')).toContainText('l’ajouterait tout de suite');
  await expect(page.locator('[data-role="essai-decision"]')).toContainText('3 × « Prise double 16 A »');
  await capturer(page, info, 'E7-essai-utiliser');
  await champ.fill('un truc bizarre');
  await expect(page.locator('[data-role="essai-decision"]')).toContainText('demanderait');
  await champ.fill('gaine');
  await expect(page.locator('[data-role="essai-decision"]')).toContainText('poserait la question');
  await champ.fill('');
  await expect(page.locator('[data-role="essai-resultat"]')).toBeEmpty();
  await attendreCalme(page);
  expect(await listerDocuments('crm_audit')).toHaveLength(0); // rien d'enregistré
  expect((await lireDocument('devis_vocabulaire/gaine')).confirmations).toBe(1);
});

test('E8 « Exporter le vocabulaire (CSV) » télécharge un fichier lisible par un tableur (virgules, guillemets, accents, retours à la ligne)', async ({ page }, info) => {
  await article('a02', { libelle: 'Prise double, 16 A' });
  await mot('prise_double', { expression: 'prise "double"', articleLibelle: 'Prise double, 16 A', confirmations: 3, derniereUtilisationLe: '2026-10-20' });
  await mot('cable', { expression: '=cable\nrigide', origine: 'manuelle', confirmations: 0 });
  await ouvrir(page);
  await page.locator('[data-action="menu-vocabulaire"]').click();
  await capturer(page, info, 'E8-menu-export');
  const [telechargement] = await Promise.all([page.waitForEvent('download'), entreeMenu(page, 'Exporter le vocabulaire (CSV)').click()]);
  expect(telechargement.suggestedFilename()).toMatch(/^chevalier-ia-vocabulaire-\d{4}-\d{2}-\d{2}\.csv$/);
  const octets = await readFile(await telechargement.path());
  expect([...octets.subarray(0, 3)]).toEqual([0xEF, 0xBB, 0xBF]); // BOM UTF-8
  expect(octets.toString('utf8')).toBe('﻿Expression,Article,Statut,Origine,Confirmations,Dernière utilisation\r\n'
    + '"\'=cable\nrigide","Prise double, 16 A",Actif,Ajouté ici,0,\r\n'
    + '"prise ""double""","Prise double, 16 A",Actif,Appris (question),3,2026-10-20\r\n');
  await expect(page.locator('.toast')).toContainText('Fichier téléchargé');
});

test('E9 cas vide : la phrase qui explique et « + Ajouter » ; filtre sans résultat : « Tout effacer » ; l’export est grisé sans mot', async ({ page }, info) => {
  await ouvrir(page);
  await expect(page.locator('.etat-vide')).toHaveText('Aucun mot appris pour l’instant. Les mots apparaissent quand ton assistant te pose une question, ou ajoute-en un ici.');
  await expect(page.locator('[data-action="ajouter-mot"]')).toBeVisible();
  await expect(page.locator('[data-role="phrase-etat"]')).toHaveText('0 mot appris actif');
  await page.locator('[data-action="menu-vocabulaire"]').click();
  await expect(entreeMenu(page, 'Exporter le vocabulaire (CSV)')).toBeDisabled();
  await page.keyboard.press('Escape');
  await capturer(page, info, 'E9-vide');
  await capturerTelephone(page, info, 'E9-vide');
  await mot('prise_double');
  await article('a02', { libelle: 'Prise double 16 A' });
  await expect(ligne(page, 'prise_double')).toBeVisible();
  await page.getByRole('searchbox', { name: 'Rechercher un mot appris' }).fill('zzzz');
  await expect(page.locator('.etat-vide')).toContainText('Aucun mot ne correspond à ces filtres.');
  await capturer(page, info, 'E9-filtre-sans-resultat');
  await page.locator('[data-action="tout-effacer"]').click();
  await expect(ligne(page, 'prise_double')).toBeVisible();
  await expect(page.getByRole('searchbox', { name: 'Rechercher un mot appris' })).toHaveValue('');
});

test('E10 article désactivé : pastille grise et « Changer l’article » visible (le menu ne le répète pas, « Activer » est grisé)', async ({ page }, info) => {
  await article('a02', { libelle: 'Prise double 16 A', actif: false });
  await article('a08', { libelle: 'Gaine ICTA 20 mm' });
  await mot('prise_double', { statut: 'desactivee' });
  await ouvrir(page);
  const l = ligne(page, 'prise_double');
  await expect(l.locator('[data-role="article-desactive"]')).toHaveText('Article désactivé');
  expect(await l.locator('[data-action="changer-article"]').evaluate((e) => getComputedStyle(e).color)).not.toBe(await page.locator('[data-action="ajouter-mot"]').evaluate((e) => getComputedStyle(e).color));
  await capturer(page, info, 'E10-article-desactive');
  await capturerTelephone(page, info, 'E10-article-desactive');
  await menuDe(page, 'prise_double').click();
  await expect(entreeMenu(page, 'Changer l’article')).toHaveCount(0);
  await expect(entreeMenu(page, 'Activer')).toBeDisabled();
  await page.keyboard.press('Escape');
  await l.locator('[data-action="changer-article"]').click();
  await dialogue(page).getByRole('searchbox', { name: 'Chercher un article du catalogue' }).fill('gaine');
  await dialogue(page).locator('[data-article-id="a08"]').click();
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(l.locator('[data-role="article-desactive"]')).toHaveCount(0);
  await expect(l.locator('[data-colonne="article"] a')).toHaveText('Gaine ICTA 20 mm');
});

test('E10 lecture impossible : le message dit quoi faire, « Réessayer » relit, personne n’est déconnecté', { tag: '@sans-telephone' }, async ({ page }, info) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues' }); // le SDK note dans la console une lecture refusée par les règles
  await jeuDEssai();
  // La lecture part vers une collection que les règles interdisent (devis_compteurs) tant que le drapeau est posé.
  await page.route('**/js/modules/devis/vocabulaire-plans.js*', async (route) => {
    const reponse = await route.fetch();
    const corps = (await reponse.text()).replace("export const COLLECTION_VOCABULAIRE = 'devis_vocabulaire';", "export const COLLECTION_VOCABULAIRE = globalThis.__lectureVers || 'devis_vocabulaire';");
    await route.fulfill({ response: reponse, body: corps });
  });
  await page.addInitScript(() => { window.__lectureVers = 'devis_compteurs'; });
  await ouvrir(page);
  await expect(page.locator('[data-erreur="lecture"]')).toContainText('La liste des mots appris n’a pas pu être mise à jour');
  await expect(page.locator('[data-erreur="lecture"]')).toContainText('Réessayer');
  await expect(page.locator('.coquille')).toBeVisible(); // pas de déconnexion
  await capturer(page, info, 'E10-lecture-impossible');
  // Liste en erreur : ajouter un mot est refusé (un mot existant resterait invisible et serait écrasé), rien n'est écrit.
  await page.locator('[data-action="ajouter-mot"]').click();
  await dialogue(page).getByRole('textbox', { name: 'Expression' }).fill('prises doubles');
  await dialogue(page).getByRole('searchbox', { name: 'Chercher un article du catalogue' }).fill('prise');
  await dialogue(page).locator('[data-article-id="a02"]').click();
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialogue(page).locator('[data-erreur="general"]')).toContainText('n’est pas à jour');
  expect((await lireDocument('devis_vocabulaire/prise_double')).confirmations).toBe(3);
  await page.keyboard.press('Escape');
  // « Réessayer » relance la lecture (ici la collection reste interdite : le message et le bouton restent, sans déconnexion).
  await page.locator('[data-action="reessayer"]').click();
  await expect(page.locator('[data-erreur="lecture"]')).toBeVisible();
  await expect(page.locator('[data-action="reessayer"]')).toBeVisible();
  await expect(page.locator('.coquille')).toBeVisible();
});

test('E10 écriture refusée : le message est sous la ligne, la valeur réelle reste affichée, rien n’est écrit', async ({ page }, info) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues' }); // le SDK note dans la console une écriture refusée par les règles
  await jeuDEssai();
  // Les écritures de modification partent vers une collection interdite (devis_compteurs) quand le drapeau est posé : les règles les refusent.
  await page.route('**/js/modules/devis/vocabulaire-plans.js*', async (route) => {
    const reponse = await route.fetch();
    const corps = (await reponse.text()).replace('ecritureModifier(COLLECTION_VOCABULAIRE,', 'ecritureModifier((globalThis.__ecritureVers || COLLECTION_VOCABULAIRE),');
    await route.fulfill({ response: reponse, body: corps });
  });
  await ouvrir(page);
  await page.evaluate(() => { window.__ecritureVers = 'devis_compteurs'; });
  await menuDe(page, 'gaine').click();
  await entreeMenu(page, 'Activer').click();
  await expect(ligne(page, 'gaine').locator('[data-erreur="ligne"]')).toContainText('Enregistrement impossible');
  await expect(ligne(page, 'gaine').locator('[data-role="statut"]')).toHaveText('À confirmer'); // la valeur réelle
  expect((await lireDocument('devis_vocabulaire/gaine')).statut).toBe('a_confirmer');
  await capturer(page, info, 'E10-ecriture-refusee');
  await capturerTelephone(page, info, 'E10-ecriture-refusee');
  // le message disparaît à l'action suivante qui réussit
  await page.evaluate(() => { window.__ecritureVers = null; });
  await menuDe(page, 'gaine').click();
  await entreeMenu(page, 'Activer').click();
  await expect(ligne(page, 'gaine').locator('[data-role="statut"]')).toHaveText('Actif');
  await expect(ligne(page, 'gaine').locator('[data-erreur="ligne"]')).toHaveCount(0);
});

test('E11 Activer force un mot à confirmer, « Garder cet article » tranche un conflit, la note s’affiche sous le mot ; le menu n’affiche que ce qui change quelque chose', async ({ page }, info) => {
  await jeuDEssai();
  await ouvrir(page);
  await menuDe(page, 'gaine').click();
  await expect(entreeMenu(page, 'Activer')).toBeVisible();
  await expect(entreeMenu(page, 'Désactiver')).toBeVisible();
  await expect(entreeMenu(page, 'Ajouter une note')).toBeVisible();
  await page.keyboard.press('Escape');
  await menuDe(page, 'prise_double').click();
  await expect(entreeMenu(page, 'Activer')).toHaveCount(0); // déjà actif : pas d'entrée qui ne ferait rien
  await page.keyboard.press('Escape');
  await menuDe(page, 'rj').click();
  await expect(entreeMenu(page, 'Désactiver')).toHaveCount(0);
  await page.keyboard.press('Escape');
  // forcer
  await menuDe(page, 'gaine').click();
  await entreeMenu(page, 'Activer').click();
  await expect(ligne(page, 'gaine').locator('[data-role="statut"]')).toHaveText('Actif');
  // L'écran affiche « Actif » avant que l'écriture arrive à la base : on attend le document, on ne le lit pas une fois.
  await expect.poll(async () => (await lireDocument('devis_vocabulaire/gaine')).statut).toBe('active');
  const gaine = await lireDocument('devis_vocabulaire/gaine');
  expect([gaine.statut, gaine.confirmations, gaine.contradictions, gaine.origine]).toEqual(['active', 1, 0, 'apprise_question']);
  // trancher
  await menuDe(page, 'tableau').click();
  await entreeMenu(page, 'Garder cet article').click();
  await expect(ligne(page, 'tableau').locator('[data-role="a-trancher"]')).toHaveCount(0);
  await expect.poll(async () => (await lireDocument('devis_vocabulaire/tableau')).conflit).toBe(false);
  await expect(page.locator('[data-role="phrase-etat"]')).toHaveText('3 mots appris actifs');
  // note
  await menuDe(page, 'tableau').click();
  await entreeMenu(page, 'Ajouter une note').click();
  await dialogue(page).getByRole('textbox', { name: 'Note' }).fill('Le client dit « tableau » pour le 2 rangées.');
  await capturer(page, info, 'E11-note');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(ligne(page, 'tableau').locator('[data-role="note"]')).toHaveText('Le client dit « tableau » pour le 2 rangées.');
  await menuDe(page, 'tableau').click();
  await expect(entreeMenu(page, 'Modifier la note')).toBeVisible();
  await page.keyboard.press('Escape');
  await capturer(page, info, 'E11-liste-apres-revue');
  await capturerTelephone(page, info, 'E11-liste-apres-revue');
});

// ---------------------------------------------------------------- PR 7b : validation humaine (captures dans devis-vocabulaire-validation/, ordinateur ET téléphone)
const DOSSIER_VALIDATION = fileURLToPath(new URL('./captures/devis-vocabulaire-validation/', import.meta.url));
async function capturerValidation(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER_VALIDATION}${nom}-${info.project.name === 'telephone' ? 'tel' : 'ordi'}.png`, fullPage: true, animations: 'disabled' });
}
const JOUR = /^\d{4}-\d{2}-\d{2}$/;
/** Un mot actif validé à la main, avec une suggestion du serveur (article « Tableau 4 rangées ») pas encore traitée. */
async function motAvecSuggestion(id = 'tableau_s', valeurs = {}) {
  await mot(id, {
    articleId: 'a04', articleLibelle: 'Tableau électrique 2 rangées', validePar: 'humain', valideLe: '2026-09-01', revoirLe: '2027-03-01',
    suggestion: { articleId: 'a05', articleLibelle: 'Tableau électrique 4 rangées', contradictions: 3, le: '2026-10-28' }, ...valeurs,
  });
}

test('7b-1 un mot validé à la main avec une suggestion du serveur est « À trancher » ; « Garder cet article » marque la suggestion traitée sans toucher à la validation', async ({ page }, info) => {
  await jeuDEssai();
  await motAvecSuggestion();
  await ouvrir(page);
  await expect(ligne(page, 'tableau_s').locator('[data-role="a-trancher"]')).toBeVisible();
  await expect(ligne(page, 'tableau_s').locator('[data-role="validation"]')).toHaveText('Validé par toi');
  await capturerValidation(page, info, '7b-1-a-trancher');
  await menuDe(page, 'tableau_s').click();
  await entreeMenu(page, 'Garder cet article').click();
  await expect(ligne(page, 'tableau_s').locator('[data-role="a-trancher"]')).toHaveCount(0);
  const doc = await lireDocument('devis_vocabulaire/tableau_s');
  expect(doc.suggestionTraiteeLe).toMatch(JOUR);
  expect(doc.suggestionTraiteeLe >= '2026-10-28').toBe(true);
  expect([doc.validePar, doc.valideLe, doc.articleId, doc.suggestion.articleId]).toEqual(['humain', '2026-09-01', 'a04', 'a05']); // la suggestion reste (serveur seul), la validation aussi
  await capturerValidation(page, info, '7b-1-gardee');
});

test('7b-2 « Changer l’article » sur un mot à suggestion marque la suggestion traitée : la pastille « À trancher » disparaît', async ({ page }, info) => {
  await jeuDEssai();
  await motAvecSuggestion();
  await ouvrir(page);
  await menuDe(page, 'tableau_s').click();
  await entreeMenu(page, 'Changer l’article').click();
  await dialogue(page).getByRole('searchbox', { name: 'Chercher un article du catalogue' }).fill('4 rangees');
  await dialogue(page).locator('[data-article-id="a05"]').click();
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  await expect(ligne(page, 'tableau_s').locator('[data-role="a-trancher"]')).toHaveCount(0);
  const doc = await lireDocument('devis_vocabulaire/tableau_s');
  expect([doc.articleId, doc.conflit]).toEqual(['a05', false]);
  expect(doc.suggestionTraiteeLe).toMatch(JOUR);
  await capturerValidation(page, info, '7b-2-article-change');
});

test('7b-3 un mot ajouté à la main est validé tout de suite (validé par toi, à revoir dans 6 mois) ; cas vide : un ancien mot sans champ de validation se lit « Validé par tes réponses »', async ({ page }, info) => {
  await jeuDEssai();
  await ouvrir(page);
  await page.locator('[data-action="ajouter-mot"]').click();
  await dialogue(page).getByRole('textbox', { name: 'Expression' }).fill('Gaines annelées');
  await dialogue(page).getByRole('searchbox', { name: 'Chercher un article du catalogue' }).fill('gaine');
  await dialogue(page).locator('[data-article-id="a08"]').click();
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  const doc = await lireDocument('devis_vocabulaire/gaine_annelee');
  expect(doc.validePar).toBe('humain');
  expect(doc.valideLe).toMatch(JOUR);
  expect(doc.revoirLe).toMatch(JOUR);
  expect(doc.revoirLe > doc.valideLe).toBe(true);
  expect('suggestion' in doc || 'suggestionTraiteeLe' in doc).toBe(false);
  await expect(ligne(page, 'gaine_annelee').locator('[data-role="validation"]')).toHaveText('Validé par toi');
  await expect(ligne(page, 'prise_double').locator('[data-role="validation"]')).toHaveText('Validé par tes réponses'); // mot sans champ de validation
  await expect(ligne(page, 'gaine').locator('[data-role="validation"]')).toHaveCount(0); // « à confirmer » : la pastille de statut suffit
  await capturerValidation(page, info, '7b-3-mot-valide');
});
