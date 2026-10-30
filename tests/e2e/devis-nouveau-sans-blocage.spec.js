// Nouveau devis : rien ne doit empêcher un artisan de commencer (30/10/2026). Un brouillon existe sans client ni affaire ; le client et l'affaire se retrouvent en tapant quelques lettres ;
// à la finalisation sans affaire, l'écran crée l'affaire (nom du devis ou du client, étape du réglage « Étape des affaires créées depuis un devis »).
// Un test par point (le nom commence par son numéro) ; UNE capture par point : tests/e2e/captures/devis-nouveau-sans-blocage/ (ordinateur ET téléphone).
//  1 scénario (a) : un client « personne » sans organisation, pas d'affaire
//  2 scénario (b) : un client avec organisation ; ses affaires d'abord, « Voir toutes les affaires » sinon
//  3 scénario (c) : l'affaire se retrouve en tapant deux lettres ; elle ne remplace pas un client déjà choisi
//  4 l'entrée « Devis » du menu « + » crée un brouillon sans rien demander
//  5 finaliser sans affaire, étape réglée : l'affaire est créée au nom du client, à l'étape réglée, puis « Finaliser ce devis ? »
//  6 étape non réglée : liste sans présélection, jamais de création sans étape choisie
//  7 aucune étape active : message clair, rien n'est créé
//  8 « Choisir une affaire existante » ferme la fenêtre et met le focus sur le champ Affaire ; le nom du devis passe avant le client
import { fileURLToPath } from 'node:url';
import {
  test, expect, connecter, attendreCalme, listerDocuments, lireDocument, ecrireDocument, creerOrganisation, creerPersonne, creerAffaire, estTelephone, choisirDansChampDevis, JEROME,
} from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-nouveau-sans-blocage/', import.meta.url));
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name === 'telephone' ? 'tel' : 'ordi'}.png`, fullPage: true, animations: 'disabled' });
}
async function semer() {
  await creerOrganisation('o1', { nom: 'Société Exemple', adresses: [{ id: 'ad1', libelle: 'Principale', adresse: '12 rue des Lilas\n75000 Paris', parDefaut: true }], emails: [{ valeur: 'contact@exemple.fr', type: 'travail' }] });
  await creerOrganisation('o2', { nom: 'Atelier Vide' });
  await creerPersonne('p1', { nom: 'Julie Rubio', emails: [{ valeur: 'julie@exemple.test', type: 'travail' }] });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', organisationId: 'o1' });
  await creerAffaire('a2', { titre: 'Extension garage', organisationId: 'o1' });
  await creerAffaire('a3', { titre: 'Salle de bains Rubio', personneId: 'p1' });
  await creerAffaire('a4', { titre: 'Toiture des voisins' });
}
async function nouveauDevis(page) {
  await connecter(page, undefined, { route: 'devis/liste' });
  await expect(page.locator('.page-liste-devis')).toBeVisible();
  await attendreCalme(page);
  await page.locator('[data-action="nouveau-devis-vide"]').click();
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
  return page.url().split('/').pop();
}
const enregistre = (page) => expect(page.locator('[data-valeur="enregistrement"]')).toHaveText('Enregistré');
const dialogue = (page) => page.getByRole('dialog');
const champAffaire = (page) => page.locator('[data-champ="affaire"]');
const champClient = (page) => page.locator('[data-champ="client"]');
const suggestions = (page) => page.locator('.entete-droite .suggestions:not([hidden]) .suggestion');

/** Les appels à la fonction du serveur « finaliser » : on note ce que la base contenait à ce moment-là. */
async function surveillerFinalisation(page, id) {
  const appels = [];
  await page.route('**/devisFinaliser', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const d = await lireDocument(`devis_devis/${id}`);
    appels.push({ affaireId: d?.affaireId ?? null, affaires: (await listerDocuments('crm_affaires')).length });
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: { ok: true, numero: 'DEV-2026-001', statut: 'en_attente_envoi' } }) });
  });
  return appels;
}
async function reglerEtape(etape) {
  const r = (await lireDocument('devis_parametres/reglages')) ?? {};
  await ecrireDocument('devis_parametres/reglages', { ...r, etapeAffaireCreee: etape });
}
const LIGNES = [{ id: 'l1', libelle: 'Carrelage', familleId: 'famille-1', type: 'fourniture', quantite: 10, unite: 'm²', prixAchat: 40, prixVente: 60, tauxTva: 20 }];
/** Un brouillon sans affaire, prêt à finaliser (une ligne, un destinataire) : la seule chose qui manque est l'affaire. */
async function brouillonPret(page, valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument('devis_devis/dPret', {
    racineId: 'dPret', version: 1, numero: null, statut: 'brouillon', affaireId: null, personneId: null, organisationId: null, modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: '2099-12-31', objet: 'Rénovation', destinataires: ['contact@exemple.fr'],
    sections: [{ id: 's1', titre: 'Cuisine', lignes: LIGNES }], creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, ...valeurs,
  });
  await connecter(page, undefined, { route: 'devis/editeur/dPret' });
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
  return 'dPret';
}
const finaliser = (page) => page.locator('.page-editeur-devis[data-devis] .bouton-principal').click();

test('1 scénario (a) : un client « personne » sans organisation se choisit sans affaire ; le devis s’enregistre avec ce client, son adresse et son e-mail, et reste sans affaire', async ({ page }, info) => {
  await semer();
  const id = await nouveauDevis(page);
  await choisirDansChampDevis(page, 'client', 'Jul', 'Julie Rubio');
  await enregistre(page);
  const d = await lireDocument(`devis_devis/${id}`);
  expect(d.personneId).toBe('p1');
  expect(d.organisationId ?? null).toBeNull();
  expect(d.affaireId ?? null).toBeNull();
  await expect(page.locator('[data-champ="destinataire"]')).toHaveValue('julie@exemple.test'); // le client n'a pas besoin d'affaire pour fournir son e-mail
  await expect(champAffaire(page)).toHaveValue('');
  await expect(page.locator('[data-erreur="affaire"]')).toContainText('Facultatif tant que le devis est un brouillon');
  await capturer(page, info, '1-client-personne');
  // Cas d'erreur : une seule lettre ne propose rien (seuil de 2 lettres pour toute l'application) ; la croix « Effacer » retire le client.
  await champClient(page).fill('J');
  await expect(suggestions(page)).toHaveCount(0);
  await champClient(page).fill('Julie Rubio'); // retape le nom en entier : rien n'est choisi tant qu'on ne clique pas
  await page.locator('.entete-droite .suggestion', { hasText: 'Julie Rubio' }).first().click();
  await page.locator('.entete-droite .champ-intelligent-effacer').first().click();
  await enregistre(page);
  expect((await lireDocument(`devis_devis/${id}`)).personneId ?? null).toBeNull();
});

test('2 scénario (b) : un client avec organisation restreint les affaires proposées à les siennes ; sans affaire pour ce client, « Voir toutes les affaires » les montre toutes', async ({ page }, info) => {
  await semer();
  const id = await nouveauDevis(page);
  await choisirDansChampDevis(page, 'client', 'Société', 'Société Exemple');
  await enregistre(page);
  expect((await lireDocument(`devis_devis/${id}`)).organisationId).toBe('o1');
  await champAffaire(page).click();
  await expect(suggestions(page)).toHaveText([/Extension garage/, /Rénovation cuisine/]); // ordre alphabétique; // seulement les affaires de l'organisation (pas Salle de bains Rubio ni Toiture)
  await capturer(page, info, '2-affaires-du-client');
  await page.keyboard.press('Escape');
  // Cas vide : un client sans aucune affaire.
  await champClient(page).fill('Atelier');
  await page.locator('.entete-droite .suggestion', { hasText: 'Atelier Vide' }).first().click();
  await champAffaire(page).click();
  await expect(page.locator('.entete-droite .suggestion-vide')).toContainText('Aucune affaire pour ce client');
  await page.locator('[data-action="toutes-les-affaires"]').click();
  await expect(suggestions(page)).toHaveCount(4);
  await suggestions(page).filter({ hasText: 'Toiture des voisins' }).click();
  await enregistre(page);
  const d = await lireDocument(`devis_devis/${id}`);
  expect(d.affaireId).toBe('a4');
  expect(d.organisationId).toBe('o2'); // le client reste celui qu'on a choisi : l'affaire ne le remplace pas
});

test('3 scénario (c) : on connaît l’affaire, on tape deux lettres et on la retrouve ; le client en est repris seulement s’il était vide', async ({ page }, info) => {
  await semer();
  const id = await nouveauDevis(page);
  await champAffaire(page).fill('R');
  await expect(suggestions(page)).toHaveCount(0); // une lettre : rien
  await expect(page.locator('.entete-droite .suggestion-vide')).toContainText('au moins 2 lettres');
  await champAffaire(page).fill('Ru'); // le client se tape aussi : « Rubio » est dans le nom du client de l'affaire a3
  await expect(suggestions(page)).toHaveText([/Salle de bains Rubio · Julie Rubio/]);
  await suggestions(page).first().click();
  await enregistre(page);
  let d = await lireDocument(`devis_devis/${id}`);
  expect(d.affaireId).toBe('a3');
  expect(d.personneId).toBe('p1'); // client vide : il vient de l'affaire
  await expect(champClient(page)).toHaveValue('Julie Rubio');
  await capturer(page, info, '3-affaire-retrouvee');
  // Une autre affaire ensuite : le client déjà choisi n'est pas remplacé.
  await champAffaire(page).fill('Exten');
  await expect(page.locator('.entete-droite .suggestion-vide')).toContainText('Aucune affaire pour ce client'); // le client choisi restreint la liste à ses affaires
  await page.locator('[data-action="toutes-les-affaires"]').click();
  await suggestions(page).filter({ hasText: 'Extension garage' }).click();
  await enregistre(page);
  d = await lireDocument(`devis_devis/${id}`);
  expect(d.affaireId).toBe('a2');
  expect(d.personneId).toBe('p1');
  expect(d.organisationId ?? null).toBeNull();
  await expect(champClient(page)).toHaveValue('Julie Rubio');
});

test('4 l’entrée « Devis » du menu « + » crée un brouillon sans client ni affaire et ouvre l’éditeur, sans rien demander', async ({ page }, info) => {
  await connecter(page, undefined, { route: 'devis/liste' });
  await attendreCalme(page);
  await page.locator(estTelephone(page) ? '.bouton-plus-mobile' : '.bouton-plus:not(.bouton-plus-mobile)').click();
  await page.getByRole('menuitem', { name: 'Devis', exact: true }).click();
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
  const docs = await listerDocuments('devis_devis');
  expect(docs).toHaveLength(1);
  expect(docs[0].statut).toBe('brouillon');
  expect(docs[0].affaireId ?? null).toBeNull();
  expect(docs[0].organisationId ?? null).toBeNull();
  expect(docs[0].personneId ?? null).toBeNull();
  await expect(page.locator('[data-valeur="manquants"]')).toBeHidden(); // plus aucun « champ à remplir »
  await capturer(page, info, '4-menu-plus');
});

test('5 finaliser sans affaire, étape réglée : l’affaire est créée au nom du client, à l’étape réglée, rattachée au devis AVANT l’appel du serveur, puis « Finaliser ce devis ? » s’ouvre', async ({ page }, info) => {
  await semer();
  await reglerEtape('proposition_envoyee');
  const id = await brouillonPret(page, { organisationId: 'o1' });
  const appels = await surveillerFinalisation(page, id);
  const avant = (await listerDocuments('crm_affaires')).length;
  await finaliser(page);
  await expect(dialogue(page)).toContainText('Ce devis n’a pas encore d’affaire');
  await expect(dialogue(page).locator('[data-champ="nom-affaire-creee"]')).toHaveValue('Société Exemple');
  await expect(dialogue(page).locator('[data-valeur="etape-retenue"]')).toContainText('Proposition envoyée'); // le réglage est valide : la fenêtre n'interroge pas
  await expect(dialogue(page).locator('[data-champ="etape-affaire-creee"]')).toHaveCount(0);
  expect(await listerDocuments('crm_affaires')).toHaveLength(avant); // rien n'est créé tant qu'on n'a pas cliqué
  await capturer(page, info, '5-creer-affaire');
  await dialogue(page).getByRole('button', { name: 'Créer l’affaire' }).click();
  await expect(dialogue(page)).toContainText('Finaliser ce devis ?'); // la fenêtre habituelle, après la création
  const affaires = await listerDocuments('crm_affaires');
  expect(affaires).toHaveLength(avant + 1);
  const nouvelle = affaires.find((a) => a.titre === 'Société Exemple');
  expect(nouvelle).toMatchObject({ etape: 'proposition_envoyee', organisationId: 'o1' });
  expect(appels).toHaveLength(0);
  await dialogue(page).getByRole('button', { name: 'Finaliser' }).click();
  await expect.poll(() => appels.length).toBe(1);
  expect(appels[0].affaireId).toBe(nouvelle.id); // le devis portait déjà l'affaire quand le serveur a été appelé
  expect((await lireDocument(`devis_devis/${id}`)).affaireId).toBeTruthy();
});

test('6 étape non réglée : la fenêtre propose les étapes actives sans présélection ; sans choix, rien n’est créé ; le nom du devis passe avant le client', async ({ page }, info) => {
  await semer();
  const id = await brouillonPret(page, { personneId: 'p1', nom: 'Variante économique' });
  const appels = await surveillerFinalisation(page, id);
  const avant = (await listerDocuments('crm_affaires')).length;
  await finaliser(page);
  await expect(dialogue(page).locator('[data-champ="nom-affaire-creee"]')).toHaveValue('Variante économique');
  const liste = dialogue(page).locator('[data-champ="etape-affaire-creee"]');
  await expect(liste).toHaveValue(''); // pas de présélection : choix obligatoire
  await expect(dialogue(page)).toContainText('Tu peux la fixer une fois pour toutes dans Réglages > Devis');
  expect(await liste.locator('option').allTextContents()).toEqual(['Choisis une étape', 'Premier contact', 'Rendez vous fixé', 'Proposition envoyée', 'Gagné']);
  await capturer(page, info, '6-etape-a-choisir');
  await dialogue(page).getByRole('button', { name: 'Créer l’affaire' }).click();
  await expect(dialogue(page).locator('[data-erreur="creation-affaire"]')).toHaveText('Choisis l’étape de la nouvelle affaire.');
  expect(await listerDocuments('crm_affaires')).toHaveLength(avant); // jamais de création sans étape active choisie
  await liste.selectOption('rdv_fixe');
  await dialogue(page).getByRole('button', { name: 'Créer l’affaire' }).click();
  await expect(dialogue(page)).toContainText('Finaliser ce devis ?');
  const creee = (await listerDocuments('crm_affaires')).find((a) => a.titre === 'Variante économique');
  expect(creee).toMatchObject({ etape: 'rdv_fixe', personneId: 'p1' });
  await dialogue(page).getByRole('button', { name: 'Annuler' }).click();
  expect(appels).toHaveLength(0);
  expect((await lireDocument(`devis_devis/${id}`)).affaireId).toBeTruthy(); // le devis garde son affaire même sans finaliser
  await expect(champAffaire(page)).toHaveValue(/Variante économique/);
});

test('7 aucune étape active : la fenêtre le dit clairement, le bouton « Créer l’affaire » est grisé et rien n’est créé', async ({ page }, info) => {
  await semer();
  const ETAPES = ['premier_contact', 'rdv_fixe', 'proposition_envoyee', 'gagne', 'etape_5', 'etape_6'];
  await ecrireDocument('crm_parametres/etapes', { roleGagnee: 'gagne', items: ETAPES.map((e) => ({ id: e, libelle: e, description: '', couleur: '#888888', actif: false, action: null })) });
  const id = await brouillonPret(page, { personneId: 'p1' });
  const avant = (await listerDocuments('crm_affaires')).length;
  await finaliser(page);
  await expect(dialogue(page).locator('[data-erreur="aucune-etape"]')).toContainText('Crée d’abord une étape dans le pipeline');
  await expect(dialogue(page).getByRole('button', { name: 'Créer l’affaire' })).toBeDisabled();
  await capturer(page, info, '7-aucune-etape');
  await dialogue(page).getByRole('button', { name: 'Annuler' }).click();
  expect(await listerDocuments('crm_affaires')).toHaveLength(avant);
  expect((await lireDocument(`devis_devis/${id}`)).affaireId ?? null).toBeNull();
});

test('8 « Choisir une affaire existante » ferme la fenêtre et met le focus sur le champ Affaire (pas de deuxième liste) ; sans nom ni client, le nom de l’affaire est obligatoire', async ({ page }, info) => {
  await semer();
  await reglerEtape('premier_contact');
  const id = await brouillonPret(page);
  const appels = await surveillerFinalisation(page, id);
  const avant = (await listerDocuments('crm_affaires')).length;
  await finaliser(page);
  // Ni nom de devis ni client : le champ est vide, il faut un nom.
  await expect(dialogue(page).locator('[data-champ="nom-affaire-creee"]')).toHaveValue('');
  await dialogue(page).getByRole('button', { name: 'Créer l’affaire' }).click();
  await expect(dialogue(page).locator('[data-erreur="creation-affaire"]')).toHaveText('Donne un nom à l’affaire.');
  expect(await listerDocuments('crm_affaires')).toHaveLength(avant);
  await capturer(page, info, '8-nom-obligatoire');
  await dialogue(page).getByRole('button', { name: 'Choisir une affaire existante' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  await expect(champAffaire(page)).toBeFocused();
  await champAffaire(page).fill('Toit');
  await suggestions(page).first().click();
  await enregistre(page);
  await finaliser(page);
  await expect(dialogue(page)).toContainText('Finaliser ce devis ?'); // une affaire choisie : plus de fenêtre de création
  await dialogue(page).getByRole('button', { name: 'Finaliser' }).click();
  await expect.poll(() => appels.length).toBe(1);
  expect(await listerDocuments('crm_affaires')).toHaveLength(avant);
});
