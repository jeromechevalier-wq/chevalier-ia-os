// Nouveau devis : rien ne doit empêcher un artisan de commencer (30/10/2026). Un brouillon existe sans client ni affaire ; le client et l'affaire se retrouvent en tapant quelques lettres ;
// finaliser sans affaire donne un message et le champ Affaire en rouge ; « + Créer l'affaire » (dans la liste du champ) la crée (nom tapé, du devis ou du client ; étape du réglage « Étape des affaires créées depuis un devis »).
// Un test par point (le nom commence par son numéro) ; UNE capture par point : tests/e2e/captures/devis-nouveau-sans-blocage/ (ordinateur ET téléphone).
//  1 scénario (a) : un client « personne » sans organisation, pas d'affaire
//  2 scénario (b) : un client avec organisation ; seulement ses affaires, un message permanent s'il n'en a pas (jamais d'affaire d'un autre client)
//  3 scénario (c) : l'affaire se retrouve en tapant deux lettres et pose son client ; un client déjà choisi ne reçoit que SES affaires
//  4 l'entrée « Devis » du menu « + » crée un brouillon sans rien demander
//  5 finaliser sans affaire : message + champ rouge ; « + Créer l'affaire » (liste du champ) crée à l'étape réglée, puis « Finaliser ce devis ? »
//  6 étape non réglée : second pas « Dans quelle étape ? » dans la même liste, jamais de création sans étape choisie
//  7 aucune étape active : message clair dans la liste, rien n'est créé
//  8 sans nom ni client : pas de ligne de création sans nom tapé ; une affaire existante lève l'erreur
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
  await expect(champAffaire(page)).toHaveAttribute('placeholder', 'Choisis ou crée une affaire'); // le client a une affaire : la ligne Affaire propose, sans rien imposer
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

test('2 scénario (b) : un client avec organisation restreint les affaires proposées à les siennes ; sans affaire pour ce client, un message permanent et jamais l’affaire d’un autre client', async ({ page }, info) => {
  await semer();
  const id = await nouveauDevis(page);
  await choisirDansChampDevis(page, 'client', 'Société', 'Société Exemple');
  await enregistre(page);
  expect((await lireDocument(`devis_devis/${id}`)).organisationId).toBe('o1');
  await champAffaire(page).click();
  await expect(suggestions(page)).toHaveText([/Extension garage/, /Rénovation cuisine/, /\+ Créer l’affaire « Société Exemple »/]); // ordre alphabétique, puis la création ; seulement les affaires de l'organisation (pas Salle de bains Rubio ni Toiture)
  await capturer(page, info, '2-affaires-du-client');
  await page.keyboard.press('Escape');
  // Cas vide : un client sans aucune affaire.
  await champClient(page).fill('Atelier');
  await page.locator('.entete-droite .suggestion', { hasText: 'Atelier Vide' }).first().click();
  await champAffaire(page).click();
  await expect(suggestions(page)).toHaveText([/\+ Créer l’affaire « Atelier Vide »/]); // aucune affaire à ce client : la liste propose seulement de la créer
  await expect(page.locator('[data-erreur="affaire"]')).toHaveText('Pas d’affaire pour ce client : crée-la avec « + Créer l’affaire » dans cette liste.'); // le message reste affiché quand la liste se ferme
  await expect(page.locator('[data-action="toutes-les-affaires"]')).toHaveCount(0); // plus de « Voir toutes les affaires »
  await champAffaire(page).press('Enter');
  await champAffaire(page).fill('Toit'); // « Toiture des voisins » existe, mais n'est pas à ce client : jamais proposée (seule la création l'est)
  await expect(suggestions(page)).toHaveText([/\+ Créer l’affaire « Toit »/]);
  await enregistre(page);
  const d = await lireDocument(`devis_devis/${id}`);
  expect(d.affaireId ?? null).toBeNull();
  expect(d.organisationId).toBe('o2');
});

test('3 scénario (c) : on connaît l’affaire, on tape deux lettres et on la retrouve ; son client est posé avec elle, et un client déjà choisi ne reçoit que ses affaires', async ({ page }, info) => {
  await semer();
  const id = await nouveauDevis(page);
  await champAffaire(page).fill('R');
  await expect(suggestions(page)).toHaveText([/\+ Créer l’affaire « R »/]); // une lettre : aucune affaire à retrouver, seulement la création au nom tapé
  await champAffaire(page).fill('Ru'); // le client se tape aussi : « Rubio » est dans le nom du client de l'affaire a3
  await expect(suggestions(page)).toHaveText([/Salle de bains Rubio · Julie Rubio/, /\+ Créer l’affaire « Ru »/]);
  await suggestions(page).first().click();
  await enregistre(page);
  let d = await lireDocument(`devis_devis/${id}`);
  expect(d.affaireId).toBe('a3');
  expect(d.personneId).toBe('p1'); // client vide : il vient de l'affaire
  await expect(champClient(page)).toHaveValue('Julie Rubio');
  await capturer(page, info, '3-affaire-retrouvee');
  // Une autre affaire ensuite : le client déjà choisi n'a que SES affaires (la ligne ne propose jamais celle d'un autre client).
  await champAffaire(page).fill('Exten');
  await expect(suggestions(page)).toHaveText([/\+ Créer l’affaire « Exten »/]); // aucune affaire de ce client ne correspond : jamais celle d'un autre
  await expect(page.locator('[data-action="toutes-les-affaires"]')).toHaveCount(0);
  await page.keyboard.press('Escape');
  await champClient(page).click();
  await enregistre(page);
  d = await lireDocument(`devis_devis/${id}`);
  expect(d.affaireId).toBe('a3');
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

const LIGNE_CREER = (nom) => suggestions0().filter({ hasText: `+ Créer l’affaire « ${nom} »` });
function suggestions0() { return pageCourante.locator('.entete-droite .suggestions:not([hidden]) .suggestion'); }
let pageCourante = null;
const MESSAGE_FINALISER = 'Choisis ou crée une affaire pour finaliser ce devis.';

test('5 finaliser sans affaire : pas de fenêtre, le message et le champ Affaire en rouge avec le focus ; « + Créer l’affaire » dans sa liste crée l’affaire au nom du client, à l’étape réglée, la lie au devis, puis « Finaliser ce devis ? » s’ouvre', async ({ page }, info) => {
  pageCourante = page;
  await semer();
  await reglerEtape('proposition_envoyee');
  const id = await brouillonPret(page, { organisationId: 'o1' });
  const appels = await surveillerFinalisation(page, id);
  const avant = (await listerDocuments('crm_affaires')).length;
  await finaliser(page);
  await expect(dialogue(page)).toHaveCount(0); // plus de fenêtre « Ce devis n'a pas encore d'affaire »
  await expect(page.locator('[data-erreur="affaire"]')).toHaveText(MESSAGE_FINALISER);
  await expect(champAffaire(page)).toHaveClass(/invalide/);
  await expect(champAffaire(page)).toBeFocused();
  await capturer(page, info, '5-champ-rouge');
  await champAffaire(page).click(); // la liste s'ouvre au clic
  await expect(LIGNE_CREER('Société Exemple')).toHaveCount(1); // la liste du champ propose de créer l'affaire (nom = le client, faute de nom de devis)
  expect(appels).toHaveLength(0);
  expect(await listerDocuments('crm_affaires')).toHaveLength(avant); // rien n'est créé sans clic
  await capturer(page, info, '5-ligne-creer');
  await LIGNE_CREER('Société Exemple').click();
  await expect.poll(async () => (await listerDocuments('crm_affaires')).length).toBe(avant + 1);
  const nouvelle = (await listerDocuments('crm_affaires')).find((a) => a.titre === 'Société Exemple');
  expect(nouvelle).toMatchObject({ etape: 'proposition_envoyee', organisationId: 'o1' }); // étape du réglage : aucune question
  await enregistre(page);
  expect((await lireDocument(`devis_devis/${id}`)).affaireId).toBe(nouvelle.id);
  await expect(champAffaire(page)).toHaveValue(/Société Exemple/);
  await expect(champAffaire(page)).not.toHaveClass(/invalide/);
  await expect(page.locator('[data-erreur="affaire"]')).toBeHidden();
  await finaliser(page);
  await expect(dialogue(page)).toContainText('Finaliser ce devis ?');
  await dialogue(page).getByRole('button', { name: 'Finaliser' }).click();
  await expect.poll(() => appels.length).toBe(1);
  expect(appels[0].affaireId).toBe(nouvelle.id); // le devis portait déjà l'affaire quand le serveur a été appelé
  expect(await listerDocuments('crm_affaires')).toHaveLength(avant + 1); // une seule affaire créée
});

test('6 étape non réglée : « + Créer l’affaire » ouvre, dans la même liste, « Dans quelle étape ? » (sans fenêtre) ; rien n’est créé tant qu’une étape n’est pas cliquée ; le nom du devis passe avant le client', async ({ page }, info) => {
  pageCourante = page;
  await semer();
  const id = await brouillonPret(page, { personneId: 'p1', nom: 'Variante économique' });
  const avant = (await listerDocuments('crm_affaires')).length;
  await champAffaire(page).click();
  await expect(LIGNE_CREER('Variante économique')).toHaveCount(1);
  await LIGNE_CREER('Variante économique').click();
  await expect(page.locator('.entete-droite .suggestions:not([hidden]) .suggestion-groupe')).toHaveText(['Dans quelle étape ?']);
  expect(await suggestions(page).allTextContents()).toEqual(['Premier contact', 'Rendez vous fixé', 'Proposition envoyée', 'Gagné']);
  await expect(dialogue(page)).toHaveCount(0);
  expect(await listerDocuments('crm_affaires')).toHaveLength(avant); // jamais de création sans étape active choisie
  await capturer(page, info, '6-dans-quelle-etape');
  await page.keyboard.press('Escape');
  expect(await listerDocuments('crm_affaires')).toHaveLength(avant);
  await champAffaire(page).click();
  await LIGNE_CREER('Variante économique').click(); // on recommence : le second pas revient
  await suggestions(page).filter({ hasText: 'Rendez vous fixé' }).click();
  await expect.poll(async () => (await listerDocuments('crm_affaires')).length).toBe(avant + 1);
  const creee = (await listerDocuments('crm_affaires')).find((a) => a.titre === 'Variante économique');
  expect(creee).toMatchObject({ etape: 'rdv_fixe', personneId: 'p1' });
  await expect.poll(async () => (await lireDocument(`devis_devis/${id}`)).affaireId).toBe(creee.id); // l'enregistrement automatique suit (l'indicateur « Enregistré » peut encore dater d'avant)
  await expect(champAffaire(page)).toHaveValue(/Variante économique/);
});

test('7 aucune étape active : la liste le dit clairement (même liste, sans fenêtre) et rien n’est créé', async ({ page }, info) => {
  pageCourante = page;
  await semer();
  const ETAPES = ['premier_contact', 'rdv_fixe', 'proposition_envoyee', 'gagne', 'etape_5', 'etape_6'];
  await ecrireDocument('crm_parametres/etapes', { roleGagnee: 'gagne', items: ETAPES.map((e) => ({ id: e, libelle: e, description: '', couleur: '#888888', actif: false, action: null })) });
  const id = await brouillonPret(page, { personneId: 'p1' });
  const avant = (await listerDocuments('crm_affaires')).length;
  await champAffaire(page).click();
  await LIGNE_CREER('Julie Rubio').click();
  await expect(page.locator('.entete-droite .suggestion-vide')).toContainText('Crée d’abord une étape dans le pipeline');
  await capturer(page, info, '7-aucune-etape');
  expect(await listerDocuments('crm_affaires')).toHaveLength(avant);
  expect((await lireDocument(`devis_devis/${id}`)).affaireId ?? null).toBeNull();
});

test('8 sans nom ni client, la liste ne propose de créer qu’un nom tapé ; finaliser donne le message et le champ rouge ; choisir une affaire existante (« Toit ») lève l’erreur et permet de finaliser', async ({ page }, info) => {
  pageCourante = page;
  await semer();
  await reglerEtape('premier_contact');
  const id = await brouillonPret(page);
  const appels = await surveillerFinalisation(page, id);
  const avant = (await listerDocuments('crm_affaires')).length;
  await finaliser(page);
  await expect(dialogue(page)).toHaveCount(0);
  await expect(page.locator('[data-erreur="affaire"]')).toHaveText(MESSAGE_FINALISER);
  await expect(champAffaire(page)).toBeFocused();
  await champAffaire(page).click();
  await expect(suggestions(page)).toHaveCount(0); // ni nom de devis ni client : pas de ligne « Créer l'affaire » sans nom
  await expect(page.locator('.entete-droite .suggestion-vide')).toContainText('Tape un nom pour créer une affaire');
  await capturer(page, info, '8-sans-nom');
  await champAffaire(page).fill('Chantier Nouveau');
  await expect(LIGNE_CREER('Chantier Nouveau')).toHaveCount(1); // le nom tapé
  expect(await listerDocuments('crm_affaires')).toHaveLength(avant);
  await champAffaire(page).fill('Toit');
  await suggestions(page).filter({ hasText: 'Toiture des voisins' }).click();
  await enregistre(page);
  await expect(champAffaire(page)).not.toHaveClass(/invalide/);
  await finaliser(page);
  await expect(dialogue(page)).toContainText('Finaliser ce devis ?'); // une affaire choisie : on finalise
  await dialogue(page).getByRole('button', { name: 'Finaliser' }).click();
  await expect.poll(() => appels.length).toBe(1);
  expect(await listerDocuments('crm_affaires')).toHaveLength(avant);
});
