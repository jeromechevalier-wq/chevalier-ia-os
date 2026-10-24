// Module Devis, mise en page de l'éditeur (partie 1 : barre d'actions, en-tête, tableau à trois niveaux, boutons d'ajout, bas de page, téléphone).
// Un test par point du brief (le nom commence par le numéro du point), une capture par point : tests/e2e/captures/devis-editeur-mise-en-page/ (ordinateur ET téléphone : la mise en page change).
import { fileURLToPath } from 'node:url';
import {
  test, expect, connecter, attendreCalme, ecrireDocument, listerDocuments, creerOrganisation, creerAffaire, creerPersonne, estTelephone, JEROME,
} from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-editeur-mise-en-page/', import.meta.url));
/** `pleine` : toute la page ; sinon ce qu'on voit à l'écran (pour montrer ce qui reste collé en haut ou en bas). */
async function capturer(page, info, nom, { pleine = true } = {}) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: pleine, animations: 'disabled' });
}
const dialogue = (page) => page.getByRole('dialog');
const lignes = (page) => page.locator('tr.ligne-devis-edition');
const defiler = (page, haut) => page.evaluate((h) => window.scrollTo(0, h ? 0 : document.body.scrollHeight), haut);

async function article(id, valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument(`devis_articles/${id}`, {
    code: '', libelle: 'Article test', unite: 'u', prixAchat: 10, tauxTva: null, actif: true, proprietaire: JEROME,
    creeLe: maintenant, modifieLe: maintenant, creePar: JEROME, modifiePar: JEROME, ...valeurs,
  });
}
async function semer() {
  await creerOrganisation('o1', {
    nom: 'Société Exemple', adresses: [{ id: 'p1', libelle: 'Principale', adresse: '12 rue des Lilas\n75000 Paris', parDefaut: true }], emails: [{ valeur: 'contact@exemple.fr', type: 'travail' }],
  });
  await creerAffaire('a1', { titre: 'Rénovation restaurant', organisationId: 'o1' });
  await article('a1', { libelle: 'Carrelage 60 x 60', unite: 'm²', prixAchat: 50, type: 'fourniture', code: 'CAR60' });
  await article('a2', { libelle: 'Pose du carrelage', unite: 'h', prixAchat: 30, tauxTva: 10, type: 'main_oeuvre' });
}
const ligne = (id, libelle, quantite, prixAchat, extra = {}) => ({ id, libelle, quantite, unite: 'm²', prixAchat, marge: 0, ...extra });
/** Un devis déjà rempli, avec deux niveaux de sections et assez de lignes pour que la page défile (contourne l'écran). */
async function devisLong(id = 'long') {
  const maintenant = new Date();
  const cuisine = Array.from({ length: 12 }, (_, i) => ligne(`k${i}`, `Ligne de la cuisine ${i + 1}`, 1, 100 + i));
  await ecrireDocument(`devis_devis/${id}`, {
    racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', organisationId: 'o1', personneId: null, modeMarge: 'majoration', marge: 0, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, expireLe: '2026-11-23', destinataires: ['contact@exemple.fr'], objet: 'Rénovation restaurant',
    sections: [
      { id: 's1', titre: 'Salle du restaurant', lignes: [] },
      { id: 'ss1', titre: 'Coin bar', niveau: 2, lignes: [ligne('l1', 'Dépose de l’ancienne moquette', 30, 10.75), ligne('l2', 'Cloisons de séparation', 8.75, 11.34, { description: 'BA13 sur ossature métallique' })] },
      { id: 'ss2', titre: 'Salle à l’étage', niveau: 2, lignes: [ligne('l3', 'Pose d’un nouveau revêtement de sol', 30, 62, { tauxTva: 10 }), ligne('l4', 'Application d’un ragréage', 30, 12.33, { tauxTva: 10 })] },
      { id: 's2', titre: 'Cuisine', lignes: cuisine },
    ],
    notesBasDePage: '', creePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant,
  });
  return id;
}
async function ouvrir(page, id) {
  await connecter(page, undefined, { route: `devis/editeur/${id}` });
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
}
async function ouvrirListe(page) {
  await connecter(page, undefined, { route: 'devis/liste' });
  await expect(page.locator('.page-liste-devis')).toBeVisible();
  await attendreCalme(page);
}
/** Un brouillon neuf pour l'affaire d'exemple, créé par l'écran. */
async function nouveauBrouillon(page) {
  await ouvrirListe(page);
  await page.locator('[data-action="nouveau-devis-vide"]').click();
  await page.locator('[data-champ="affaire"]').selectOption('a1');
  await page.locator('[data-action="creer-brouillon"]').click();
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
}
async function ajouterLibre(page) {
  await page.locator('[data-action="autres-ajouts"]').click();
  await page.getByRole('menuitem', { name: 'Ligne libre' }).click();
}
const numeros = (page) => page.locator('.tableau-lignes-devis tbody tr td.c-num').allTextContents();

test('1 la barre d’actions reste en haut quand on défile : titre « Brouillon », onglets Édition et Prévisualisation, Options, Annuler, Enregistrer, Finaliser', async ({ page }, info) => {
  await semer();
  await ouvrir(page, await devisLong());
  const barre = page.locator('.barre-devis');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Brouillon');
  await expect(page.locator('[data-onglet="edition"]')).toHaveText('Édition');
  await expect(page.locator('[data-onglet="apercu"]')).toHaveText('Prévisualisation');
  for (const action of ['annuler', 'enregistrer', 'finaliser']) await expect(page.locator(`.barre-devis [data-action="${action}"]`)).toBeVisible();
  await expect(page.locator('[data-action="finaliser"]')).toHaveClass(/bouton-principal/); // le seul bouton jaune plein de la barre
  // En bas de la page, la barre est toujours à l'écran (collée en haut, sous la barre du téléphone).
  await defiler(page, false);
  await expect(barre).toBeInViewport({ ratio: 1 });
  // Collée en haut de l'écran sur ordinateur (la recherche du haut n'existe plus sur Devis), juste sous la barre du menu (56 px) sur téléphone, et pas cachée derrière elle.
  const haut = (await barre.boundingBox()).y;
  if (estTelephone(page)) { expect(haut).toBeGreaterThanOrEqual(52); expect(haut).toBeLessThanOrEqual(64); } else { expect(haut).toBeLessThanOrEqual(4); }
  const titre = await page.getByRole('heading', { level: 1 }).boundingBox();
  expect(await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('.barre-devis')), { x: titre.x + titre.width / 2, y: titre.y + titre.height / 2 })).toBe(true);
  await capturer(page, info, '1-barre-fixe', { pleine: false });
  // « Options » ouvre les réglages du devis (sur téléphone, dans le bouton « … »).
  await defiler(page, true);
  if (estTelephone(page)) {
    await expect(page.locator('[data-action="options"]')).toBeHidden();
    await page.locator('[data-action="plus-actions"]').click();
    await page.getByRole('menuitem', { name: 'Options' }).click();
  } else {
    await page.locator('[data-action="options"]').click();
  }
  // Options est maintenant un menu à cases à cocher ; ce vieux devis (sans `affichage`) garde l'affichage d'avant : la carte « Marges du devis » reste visible.
  await expect(page.locator('.menu-devis-options')).toBeVisible();
  await expect(page.locator('[data-zone="marges"]')).toBeVisible();
  await expect(page.locator('[data-champ="marge"]')).toBeVisible();
});

test('2 l’en-tête a deux colonnes : dates et « définir » à gauche, affaire puis client à droite ; « Ajouter une description » montre le champ', async ({ page }, info) => {
  await semer();
  await ouvrir(page, await devisLong());
  const gauche = page.locator('.entete-gauche');
  for (const texte of ['Devis n° Brouillon', 'En date du', 'Valable jusqu’au 23/11/2026', 'Début des travaux le définir', 'Durée estimée à définir', 'Date limite de fin de chantier le définir']) {
    await expect(gauche).toContainText(texte);
  }
  // « définir » ouvre la saisie sur place ; en la quittant, la date s'affiche à la place du mot.
  await page.locator('[data-definir="debutTravaux"]').click();
  await page.locator('[data-champ="debutTravaux"]').fill('2026-11-02');
  await page.locator('.titre-document').click(); // on quitte le champ : la date remplace le mot « définir »
  await expect(page.locator('[data-definir="debutTravaux"]')).toHaveText('02/11/2026');
  await page.locator('[data-definir="duree"]').click();
  await page.locator('[data-champ="duree"]').fill('3');
  await page.locator('[data-champ="duree-unite"]').selectOption('semaine');
  await page.locator('[data-champ="duree-unite"]').press('Enter'); // Entrée referme la saisie
  await expect(page.locator('[data-definir="duree"]')).toHaveText('3 semaines');
  // La description (l'objet du devis) est cachée tant qu'on ne la demande pas.
  await expect(page.locator('[data-champ="objet"]')).toHaveValue('Rénovation restaurant'); // ce devis en a déjà une : elle est montrée
  await expect(page.locator('[data-action="description"]')).toContainText('Masquer la description');
  await page.locator('[data-action="description"]').click();
  await expect(page.locator('[data-champ="objet"]')).toBeHidden();
  await expect(page.locator('[data-action="description"]')).toContainText('Ajouter une description');
  await page.locator('[data-action="description"]').click();
  await expect(page.locator('[data-champ="objet"]')).toBeVisible();
  // À droite : l'affaire, puis le client, l'un sous l'autre (côte à côte du texte sur grand écran, empilés sur téléphone).
  const client = await page.locator('[data-champ="client"]').boundingBox();
  const affaire = await page.locator('[data-champ="affaire"]').boundingBox();
  expect(affaire.y).toBeLessThan(client.y); // on choisit d'abord l'affaire, puis le client
  if (!estTelephone(page)) expect((await gauche.boundingBox()).x + 100).toBeLessThan(client.x);
  await expect(page.locator('[data-champ="client"]')).toHaveValue('organisation:o1');
  await expect(page.locator('[data-champ="affaire"]')).toHaveValue('a1');
  await capturer(page, info, '2-entete', { pleine: false });
});

test('3 le tableau a trois niveaux (1, 1.1, 1.1.1) avec sous-totaux, repli et dépli ; cas vide : le message invite à cliquer sur un bouton', async ({ page }, info) => {
  await semer();
  await nouveauBrouillon(page);
  await expect(page.locator('[data-vide="lignes"]')).toContainText('Clique sur un des boutons ci-dessous pour ajouter un élément à ton devis.');
  await page.locator('[data-action="ajouter-section"]').click();
  await page.locator('tr[data-niveau="1"] [data-champ="libelle"]').fill('Salle du restaurant');
  await page.locator('[data-action="ajouter-sous-section"]').click();
  await page.locator('tr[data-niveau="2"] [data-champ="libelle"]').first().fill('Coin bar');
  for (const [libelle, prix] of [['Dépose de la moquette', '100'], ['Cloisons de séparation', '50']]) {
    await ajouterLibre(page);
    await lignes(page).last().locator('[data-champ="libelle"]').fill(libelle);
    await lignes(page).last().locator('[data-champ="prix-vente"]').fill(prix);
    await lignes(page).last().locator('[data-champ="prix-vente"]').press('Tab');
  }
  await page.locator('[data-action="ajouter-sous-section"]').click();
  await page.locator('tr[data-niveau="2"] [data-champ="libelle"]').last().fill('Salle à l’étage');
  await ajouterLibre(page);
  await lignes(page).last().locator('[data-champ="libelle"]').fill('Revêtement de sol');
  await lignes(page).last().locator('[data-champ="prix-vente"]').fill('200');
  await lignes(page).last().locator('[data-champ="prix-vente"]').press('Tab');
  expect(await numeros(page)).toEqual(['1', '1.1', '1.1.1', '1.1.2', '1.2', '1.2.1']);
  // Sous-totaux : la section compte ses sous-sections (150 + 200), chaque sous-section ses lignes.
  const sousTotaux = page.locator('[data-sous-total]');
  await expect(sousTotaux).toHaveText([/^350,00\s€$/, /^150,00\s€$/, /^200,00\s€$/]);
  await capturer(page, info, '3-hierarchie');
  // Replier une sous-section cache ses lignes (son sous-total reste) ; replier la section cache tout ce qu'elle contient ; déplier remet tout.
  await page.locator('tr[data-niveau="2"] [data-action="replier"]').first().click();
  await expect(lignes(page).nth(0)).toBeHidden();
  await expect(lignes(page).nth(1)).toBeHidden();
  await expect(lignes(page).nth(2)).toBeVisible();
  await expect(sousTotaux.nth(1)).toHaveText(/^150,00\s€$/);
  await page.locator('tr[data-niveau="1"] [data-action="replier"]').click();
  await expect(lignes(page).nth(2)).toBeHidden();
  await expect(page.locator('tr[data-niveau="2"]').first()).toBeHidden();
  await expect(sousTotaux.nth(0)).toHaveText(/^350,00\s€$/);
  await capturer(page, info, '3-hierarchie-repliee', { pleine: false });
  await page.locator('tr[data-niveau="1"] [data-action="replier"]').click();
  await page.locator('tr[data-niveau="2"] [data-action="replier"]').first().click();
  await expect(lignes(page).nth(0)).toBeVisible();
  // Enregistré avec `niveau: 2` ; l'aperçu montre les trois niveaux de numéros.
  await expect(page.locator('[data-valeur="enregistrement"]')).toHaveText('Enregistré');
  const stocke = (await listerDocuments('devis_devis'))[0];
  expect(stocke.sections.map((x) => x.niveau ?? 1)).toEqual([1, 2, 2]); // les règles Firestore acceptent le champ `niveau`
  await page.locator('[data-onglet="apercu"]').click();
  const apercu = page.locator('iframe[data-zone="apercu"]').contentFrame().locator('body');
  await expect(apercu).toContainText('Coin bar');
  await expect(apercu).toContainText('1.2.1');
  await expect(apercu).toContainText('Sous-total 1.1');
});

test('3 monter et descendre : une section emporte ses sous-sections, une sous-section reste dans sa section', async ({ page }) => {
  await semer();
  await ouvrir(page, await devisLong());
  const titres = () => page.locator('tr.ligne-section-devis [data-champ="libelle"]').evaluateAll((els) => els.map((e) => e.value));
  expect(await titres()).toEqual(['Salle du restaurant', 'Coin bar', 'Salle à l’étage', 'Cuisine']);
  await page.locator('tr[data-id="ss2"] [data-action="monter"]').click(); // la sous-section passe devant sa sœur
  expect(await titres()).toEqual(['Salle du restaurant', 'Salle à l’étage', 'Coin bar', 'Cuisine']);
  await expect(page.locator('tr[data-id="ss1"] [data-action="descendre"]')).toBeDisabled(); // dernière sous-section : elle reste dans sa section
  await page.locator('tr[data-id="s2"] [data-action="monter"]').click(); // la cuisine passe devant la salle, qui garde ses deux sous-sections
  expect(await titres()).toEqual(['Cuisine', 'Salle du restaurant', 'Salle à l’étage', 'Coin bar']);
  expect(await numeros(page)).toContain('2.1.1');
});

test('4 sous le tableau : « + Fourniture », « + Main d’œuvre », « + Ouvrage » et « … » à gauche, « Section », « Sous-section », « Texte », « Saut de page » à droite ; « + Fourniture » ouvre le Bordereau sur cette famille', async ({ page }, info) => {
  await semer();
  await ouvrir(page, await devisLong());
  const types = page.locator('.ajouts-types .bouton');
  await expect(types).toHaveText(['Fourniture', 'Main d’œuvre', 'Ouvrage', '…']);
  await expect(page.locator('.ajouts-structure .bouton')).toHaveText(['Section', 'Sous-section', 'Texte', 'Saut de page']);
  await expect(page.locator('[data-action="ajouter-saut"]')).toBeDisabled();
  const gauche = await page.locator('[data-action="ajouter-famille-1"]').boundingBox();
  const droite = await page.locator('[data-action="ajouter-section"]').boundingBox();
  if (!estTelephone(page)) {
    expect(gauche.x).toBeLessThan(droite.x);
    expect(Math.abs(gauche.y - droite.y)).toBeLessThan(6); // sur la même rangée
  }
  // « … » : les autres types et la ligne libre.
  await page.locator('[data-action="autres-ajouts"]').click();
  await expect(page.getByRole('menuitem')).toHaveText(['Sous-traitance', 'Matériel', 'Divers', 'Ligne libre']);
  await page.keyboard.press('Escape');
  // « + Fourniture » : la recherche s'ouvre, déjà réglée sur la famille Fournitures (le carrelage, pas la pose).
  await expect(page.locator('[data-zone="recherche"]')).toBeHidden();
  await page.locator('[data-action="ajouter-famille-1"]').click();
  await expect(page.locator('[data-zone="recherche"]')).toBeVisible();
  await expect(page.locator('[data-champ="filtre-famille"]')).toHaveValue('famille-1');
  await expect(page.locator('[data-action="ajouter-article"]')).toHaveCount(1);
  await expect(page.locator('[data-zone="resultats"]')).toContainText('Carrelage 60 x 60');
  await expect(page.locator('[data-zone="resultats"]')).not.toContainText('Pose du carrelage');
  await page.locator('[data-champ="recherche-bordereau"]').scrollIntoViewIfNeeded();
  await capturer(page, info, '4-boutons-ajout', { pleine: false });
  await page.locator('[data-action="ajouter-famille-2"]').click();
  await expect(page.locator('[data-zone="resultats"]')).toContainText('Pose du carrelage');
  // Ajouter l'article crée la ligne avec son unité du Bordereau, choisie dans le menu des unités.
  await page.locator('[data-action="ajouter-article"]').first().click();
  await expect(lignes(page).last().locator('[data-champ="libelle"]')).toHaveValue('Pose du carrelage');
  await expect(lignes(page).last().locator('[data-champ="unite"]')).toHaveValue('h');
});

test('5 le bas de page : conditions de paiement à gauche, totaux et NET À PAYER à droite (collé en bas de l’écran), tableau de TVA, notes de bas de page reprises dans l’aperçu', async ({ page }, info) => {
  await semer();
  await ouvrir(page, await devisLong());
  const bas = page.locator('.bas-devis');
  await expect(bas).toContainText('Conditions de paiement');
  await expect(bas.locator('[data-action="ajouter-condition"]')).toHaveText(/Ajouter une condition \(bientôt\)/);
  await expect(bas.locator('[data-action="ajouter-condition"]')).toBeDisabled();
  await expect(bas).toContainText('Méthodes de paiement acceptées');
  await expect(bas.locator('[data-action="ajouter-texte-libre"]')).toHaveText(/Ajouter texte libre/);
  await expect(bas).toContainText('Gestion des déchets');
  await expect(page.locator('[data-valeur="attestation-tva"]')).toContainText('Attestation du client'); // il y a des lignes à 10 %
  for (const libelle of ['Total net HT', 'TVA', 'Total TTC', 'Remise client', 'Acompte demandé']) await expect(page.locator('[data-zone="total"]')).toContainText(libelle);
  await expect(page.locator('.bandeau-net')).toContainText('NET À PAYER');
  await expect(page.locator('.tableau-tva thead th')).toHaveText(['Taux TVA', 'Base HT', 'Total']);
  await expect(page.locator('.tableau-tva tbody tr')).toHaveCount(2); // 10 % et 20 %
  // NET À PAYER reste collé en bas de l'écran quand on défile au-dessus de lui.
  const net = page.locator('.bandeau-net');
  await defiler(page, true);
  await expect(net).toBeInViewport({ ratio: 1 });
  const taille = page.viewportSize().height;
  const boite = await net.boundingBox();
  expect(boite.y + boite.height).toBeGreaterThan(taille - 4);
  expect(boite.y + boite.height).toBeLessThanOrEqual(taille + 1);
  await capturer(page, info, '5-net-a-payer-colle', { pleine: false });
  // Notes de bas de page : enregistrées, puis reprises dans l'aperçu.
  await defiler(page, false);
  await page.locator('[data-champ="notes"]').fill('(1) Prix valables 30 jours.');
  await expect(page.locator('[data-valeur="enregistrement"]')).toHaveText('Enregistré');
  await expect(page.locator('[data-champ="notes"]')).toHaveAttribute('maxlength', '2000');
  await capturer(page, info, '5-bas-de-page', { pleine: false });
  await page.locator('[data-onglet="apercu"]').click();
  await expect(page.locator('iframe[data-zone="apercu"]').contentFrame().locator('body')).toContainText('(1) Prix valables 30 jours.');
});

test('6 sur téléphone : une carte par ligne (désignation en haut, puis Qté / Unité / Prix / TVA / Total sur deux rangées), sections en bandes pleine largeur ; Options passe dans « … »', async ({ page }, info) => {
  test.skip(!estTelephone(page), 'version téléphone : se joue avec --project=telephone');
  await semer();
  await ouvrir(page, await devisLong());
  const carte = page.locator('tr[data-id="l1"]');
  const boite = async (champ) => (await carte.locator(champ).boundingBox());
  const des = await boite('[data-champ="libelle"]');
  const qte = await boite('[data-champ="quantite"]');
  const uni = await boite('[data-champ="unite"]');
  const pri = await boite('[data-champ="prix-vente"]');
  const tva = await boite('[data-champ="tva"]');
  const tot = await boite('.total-ligne');
  expect(des.y).toBeLessThan(qte.y); // la désignation est au-dessus
  expect(Math.abs(qte.y - uni.y)).toBeLessThan(6); // première rangée : Qté, Unité, Prix
  expect(Math.abs(qte.y - pri.y)).toBeLessThan(6);
  expect(tva.y).toBeGreaterThan(qte.y + 20); // deuxième rangée : TVA, Total
  expect(Math.abs(tva.y - tot.y)).toBeLessThan(30);
  // Une section est une bande pleine largeur.
  const bande = await page.locator('tr[data-id="s1"]').boundingBox();
  const largeur = page.viewportSize().width;
  expect(bande.width).toBeGreaterThan(largeur - 60);
  // La barre garde Annuler, Enregistrer et Finaliser ; Options est dans « … ».
  for (const action of ['annuler', 'enregistrer', 'finaliser']) await expect(page.locator(`.barre-devis [data-action="${action}"]`)).toBeVisible();
  await expect(page.locator('[data-action="options"]')).toBeHidden();
  await expect(page.locator('[data-action="plus-actions"]')).toBeVisible();
  // Rien ne déborde de la largeur de l'écran.
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
  await capturer(page, info, '6-telephone');
});

test('2 la date « En date du » se modifie sur place, s’enregistre et se retrouve dans l’aperçu', async ({ page }) => {
  await semer();
  await ouvrir(page, await devisLong());
  await page.locator('[data-definir="dateEmission"]').click();
  await page.locator('[data-champ="dateEmission"]').fill('2026-12-15');
  await page.locator('.titre-document').click();
  await expect(page.locator('[data-definir="dateEmission"]')).toHaveText('15/12/2026');
  await expect(page.locator('[data-valeur="enregistrement"]')).toHaveText('Enregistré');
  expect((await listerDocuments('devis_devis'))[0].dateEmission).toBe('2026-12-15');
  await page.locator('[data-onglet="apercu"]').click();
  await expect(page.locator('iframe[data-zone="apercu"]').contentFrame().locator('body')).toContainText('15/12/2026');
});

test('2 l’e-mail du destinataire suit le client choisi, sauf s’il a été écrit à la main', async ({ page }) => {
  await semer();
  await creerPersonne('p1', { nom: 'Julie Rubio', emails: [{ valeur: 'julie@exemple.test', type: 'travail' }] });
  await creerAffaire('a1', { titre: 'Rénovation restaurant', organisationId: 'o1', personneId: 'p1' });
  await ouvrir(page, await devisLong());
  const mail = page.locator('[data-champ="destinataire"]');
  await expect(mail).toHaveValue('contact@exemple.fr');
  await page.locator('[data-champ="client"]').selectOption('personne:p1');
  await expect(mail).toHaveValue('julie@exemple.test');
  await page.locator('[data-champ="client"]').selectOption('organisation:o1');
  await expect(mail).toHaveValue('contact@exemple.fr');
  await mail.fill('autre@exemple.test'); // écrit à la main : le choix du client ne l'écrase plus
  await page.locator('[data-champ="client"]').selectOption('personne:p1');
  await expect(mail).toHaveValue('autre@exemple.test');
});

test('4 la marge et la remise du devis se règlent depuis le bouton « Définir un ajustement », sans afficher le calcul des marges', async ({ page }) => {
  await semer();
  await ouvrir(page, await devisLong());
  await page.locator('[data-action="definir-ajustement"]').click();
  await page.getByRole('menuitem', { name: 'Marge du devis' }).click();
  await page.locator('[data-champ="marge-menu"]').fill('25');
  await expect.poll(async () => (await listerDocuments('devis_devis'))[0].marge).toBe(25);
  await page.getByRole('menuitem', { name: 'Remise' }).click();
  await page.locator('[data-champ="remise-valeur-menu"]').fill('10');
  await expect.poll(async () => (await listerDocuments('devis_devis'))[0].remise?.valeur).toBe(10);
});
