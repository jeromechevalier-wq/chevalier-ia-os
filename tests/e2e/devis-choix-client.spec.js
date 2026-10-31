// Éditeur de devis : « Pour qui est ce devis ? » (30/10/2026) : UN champ de recherche (personnes, organisations, affaires, comme la grande barre), puis la ligne Affaire du client.
// Un test par critère (le nom commence par son numéro) ; UNE capture par critère : tests/e2e/captures/devis-choix-client/ (ordinateur ET téléphone).
//  1 champ unique : personnes, puis organisations, puis affaires, dans cet ordre
//  2 personne seule → client
//  3 personne d'une organisation → question, organisation par défaut, un clic bascule
//  4 organisation → affaires de l'organisation ET de ses personnes, liste « à l'attention de »
//  5 affaire → client + à l'attention de
//  6 client sans affaire → message permanent, jamais d'affaire d'un autre client ; finaliser = message + champ rouge ; « + Créer l'affaire » dans la liste crée et lie (6b : second pas « Dans quelle étape ? »)
//  7 changement de client avec une affaire d'un autre client → affaire vidée + message
//  8 rien trouvé → les deux lignes de création (rien n'est créé sans clic)
//  9 la croix efface le client ET l'affaire
// 10 lecture seule : deux champs texte + « à l'attention de »
import { fileURLToPath } from 'node:url';
import {
  test, expect, connecter, attendreCalme, listerDocuments, lireDocument, ecrireDocument, creerOrganisation, creerPersonne, creerAffaire, JEROME,
} from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-choix-client/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name === 'telephone' ? 'tel' : 'ordi'}.png`, fullPage: true, animations: 'disabled' });
}
async function semer() {
  await creerOrganisation('o1', { nom: 'Dupont Bâtiment', adresses: [{ id: 'ad1', libelle: 'Principale', adresse: '12 rue des Lilas\n75000 Paris', parDefaut: true }], emails: [{ valeur: 'contact@dupont.test', type: 'travail' }] });
  await creerOrganisation('o2', { nom: 'Atelier Vide' });
  await creerOrganisation('o3', { nom: 'Nouveau Client' });
  await creerPersonne('p1', { nom: 'Julie Dupont', organisationId: 'o1', emails: [{ valeur: 'julie@dupont.test', type: 'travail' }] });
  await creerPersonne('p2', { nom: 'Paul Martin', organisationId: 'o1' });
  await creerPersonne('p3', { nom: 'Alain Dupont', emails: [{ valeur: 'alain@exemple.test', type: 'travail' }] });
  await creerAffaire('a1', { titre: 'Cuisine Dupont', organisationId: 'o1', personneId: 'p1' });
  await creerAffaire('a2', { titre: 'Garage', organisationId: 'o1' });
  await creerAffaire('a3', { titre: 'Terrasse Alain', personneId: 'p3' });
  await creerAffaire('a4', { titre: 'Toiture voisins', organisationId: 'o2' });
  await creerAffaire('a5', { titre: 'Salle de bains Julie', personneId: 'p1' });
  await creerAffaire('a6', { titre: 'Ancienne cuisine', organisationId: 'o1', personneId: 'p1', archive: true });
}
const LIGNES = [{ id: 'l1', libelle: 'Carrelage', familleId: 'famille-1', type: 'fourniture', quantite: 10, unite: 'm²', prixAchat: 40, prixVente: 60, tauxTva: 20 }];
async function brouillon(page, valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument('devis_devis/dTest', {
    racineId: 'dTest', version: 1, numero: null, statut: 'brouillon', affaireId: null, personneId: null, organisationId: null, modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: '2099-12-31', objet: 'Rénovation', destinataires: [],
    sections: [{ id: 's1', titre: 'Cuisine', lignes: LIGNES }], creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, ...valeurs,
  });
  await connecter(page, undefined, { route: 'devis/editeur/dTest' });
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
}
const enregistre = (page) => expect(page.locator('[data-valeur="enregistrement"]')).toHaveText('Enregistré');
const champClient = (page) => page.locator('[data-champ="client"]');
const champAffaire = (page) => page.locator('[data-champ="affaire"]');
const suggestions = (page) => page.locator('.entete-droite .suggestions:not([hidden]) .suggestion');
const lire = () => lireDocument('devis_devis/dTest');
/** `texte` : une chaîne, ou une expression régulière quand le nom d'une fiche est aussi le sous-titre d'une autre (ex. une personne de l'organisation). */
async function choisir(page, saisie, texte = saisie) {
  await champClient(page).click();
  await champClient(page).fill(saisie);
  await page.locator('.entete-droite .suggestions:not([hidden]) .suggestion', { hasText: texte }).first().click();
}

test('1 champ unique : les résultats arrivent par groupes, Personnes puis Organisations puis Affaires, avec le sous-titre de la grande barre', async ({ page }, info) => {
  await semer();
  await brouillon(page);
  await expect(page.getByText('Pour qui est ce devis ?', { exact: true })).toBeVisible();
  await expect(page.locator('[data-champ="client"]')).toHaveCount(1); // un seul champ pour le client
  await champClient(page).click();
  await champClient(page).fill('Dupont');
  await expect(page.locator('.entete-droite .suggestions:not([hidden]) .suggestion-groupe')).toHaveText(['Personnes', 'Organisations', 'Affaires']);
  const textes = await suggestions(page).allTextContents();
  const place = (re) => textes.findIndex((t) => re.test(t));
  expect(place(/^Alain Dupont/)).toBeGreaterThanOrEqual(0);
  expect(place(/^Julie Dupont/)).toBeGreaterThanOrEqual(0);
  expect(Math.max(place(/^Alain Dupont/), place(/^Julie Dupont/))).toBeLessThan(place(/^Dupont Bâtiment/)); // les personnes d'abord
  expect(place(/^Dupont Bâtiment/)).toBeLessThan(place(/^Cuisine Dupont/)); // puis les organisations, puis les affaires
  expect(textes[place(/^Cuisine Dupont/)]).toContain('Dupont Bâtiment · Julie Dupont'); // sous-titre de l'affaire : organisation · personne
  await capturer(page, info, '1-champ-unique');
  // Cas vide : une seule lettre ne propose rien.
  await champClient(page).fill('D');
  await expect(suggestions(page)).toHaveCount(0);
});

test('2 personne seule : elle devient le client, avec son adresse et son e-mail, sans question', async ({ page }, info) => {
  await semer();
  await brouillon(page);
  await choisir(page, 'Alain', 'Alain Dupont');
  await enregistre(page);
  const d = await lire();
  expect(d.personneId).toBe('p3');
  expect(d.organisationId ?? null).toBeNull();
  await expect(champClient(page)).toHaveValue('Alain Dupont');
  await expect(page.locator('[data-champ="destinataire"]')).toHaveValue('alain@exemple.test');
  await expect(page.locator('[data-zone="question-client"]')).toHaveCount(0);
  await capturer(page, info, '2-personne-seule');
});

test('3 personne d’une organisation : la question « Ce devis est pour » (organisation par défaut), un clic bascule sur la personne seule et revient', async ({ page }, info) => {
  await semer();
  await brouillon(page);
  await choisir(page, 'Julie', 'Julie Dupont');
  const question = page.locator('[data-zone="question-client"]');
  await expect(question).toContainText('Ce devis est pour :');
  await expect(question).toContainText('l’organisation Dupont Bâtiment, à l’attention de Julie Dupont');
  await expect(question).toContainText('Julie Dupont seule');
  await expect(question.locator('[data-choix="organisation"]')).toBeChecked(); // l'organisation par défaut
  await enregistre(page);
  let d = await lire();
  expect(d).toMatchObject({ organisationId: 'o1', personneId: 'p1' });
  await expect(champClient(page)).toHaveValue('Dupont Bâtiment');
  await expect(page.locator('[data-champ="destinataire"]')).toHaveValue('julie@dupont.test'); // l'e-mail de la personne « à l'attention de » l'emporte
  await capturer(page, info, '3-question-organisation');
  await question.locator('[data-choix="personne"]').check();
  await enregistre(page);
  await expect(page.locator('[data-champ="destinataire"]')).toHaveValue('julie@dupont.test'); // « seule » : l'e-mail de la personne
  d = await lire();
  expect(d.organisationId ?? null).toBeNull();
  expect(d.personneId).toBe('p1');
  await expect(champClient(page)).toHaveValue('Julie Dupont');
  await question.locator('[data-choix="organisation"]').check();
  await enregistre(page);
  expect(await lire()).toMatchObject({ organisationId: 'o1', personneId: 'p1' });
});

test('4 organisation : adresse de la fiche, affaires de l’organisation ET de ses personnes, liste facultative « à l’attention de »', async ({ page }, info) => {
  await semer();
  await brouillon(page);
  await choisir(page, 'Dupont B', /^Dupont Bâtiment/);
  await enregistre(page);
  expect(await lire()).toMatchObject({ organisationId: 'o1' });
  expect((await lire()).personneId ?? null).toBeNull();
  await expect(page.locator('[data-champ="chantier-adresse"]')).toHaveValue(/12 rue des Lilas/);
  await expect(page.locator('[data-champ="destinataire"]')).toHaveValue('contact@dupont.test');
  await champAffaire(page).click(); // sans lettre : les affaires du client
  await expect(suggestions(page)).toHaveText([/Cuisine Dupont/, /Garage/, /Salle de bains Julie/, /\+ Créer l’affaire « Affaire Dupont Bâtiment »/]); // celle de la personne Julie (de l'organisation) en fait partie, pas Toiture ni Terrasse
  await capturer(page, info, '4-affaires-organisation');
  await page.keyboard.press('Escape');
  const attention = page.locator('[data-champ="attention"]');
  expect(await attention.locator('option').allTextContents()).toEqual(['Personne (facultatif)', 'Julie Dupont', 'Paul Martin']);
  await attention.selectOption('p2'); // Paul n'a pas d'e-mail : le destinataire reste celui de l'organisation
  await enregistre(page);
  expect(await lire()).toMatchObject({ organisationId: 'o1', personneId: 'p2' });
  await expect(page.locator('[data-champ="destinataire"]')).toHaveValue('contact@dupont.test');
  await attention.selectOption('p1');
  await expect(page.locator('[data-champ="destinataire"]')).toHaveValue('julie@dupont.test');
  await attention.selectOption('');
  await enregistre(page);
  expect((await lire()).personneId ?? null).toBeNull();
  await expect(page.locator('[data-champ="destinataire"]')).toHaveValue('contact@dupont.test');
});

test('5 affaire : l’affaire et le client se remplissent ensemble, la personne de l’affaire est « à l’attention de »', async ({ page }, info) => {
  await semer();
  await brouillon(page);
  await choisir(page, 'Cuisine', 'Cuisine Dupont');
  await enregistre(page);
  expect(await lire()).toMatchObject({ affaireId: 'a1', organisationId: 'o1', personneId: 'p1' });
  await expect(champClient(page)).toHaveValue('Dupont Bâtiment');
  await expect(page.locator('[data-champ="attention"]')).toHaveValue('p1');
  await expect(champAffaire(page)).toHaveValue('Cuisine Dupont · Dupont Bâtiment');
  await expect(page.locator('[data-erreur="affaire"]')).toBeHidden();
  await capturer(page, info, '5-affaire-et-client');
  // Une affaire de personne seule : client = la personne, pas d'organisation.
  await champClient(page).click();
  await champClient(page).fill('Terrasse');
  await page.locator('.entete-droite .suggestions:not([hidden]) .suggestion', { hasText: 'Terrasse Alain' }).first().click();
  await enregistre(page);
  const d = await lire();
  expect(d).toMatchObject({ affaireId: 'a3', personneId: 'p3' });
  expect(d.organisationId ?? null).toBeNull();
});

test('6 client sans affaire : message permanent, jamais l’affaire d’un autre client ; finaliser donne le message et le champ rouge ; « + Créer l’affaire » dans la liste crée et lie', async ({ page }, info) => {
  await semer();
  await brouillon(page, { destinataires: ['contact@exemple.fr'] });
  await choisir(page, 'Nouveau', 'Nouveau Client');
  await expect(page.locator('[data-erreur="affaire"]')).toHaveText('Pas d’affaire pour ce client : crée-la avec « + Créer l’affaire » dans cette liste.');
  await expect(page.locator('[data-action="toutes-les-affaires"]')).toHaveCount(0);
  await champAffaire(page).click();
  await expect(suggestions(page)).toHaveText([/\+ Créer l’affaire « Affaire Nouveau Client »/]); // aucune affaire à proposer, seulement la création
  await champAffaire(page).fill('Garage'); // « Garage » existe, mais chez un autre client : jamais proposée
  await expect(suggestions(page)).toHaveText([/\+ Créer l’affaire « Garage »/]);
  await champAffaire(page).fill('');
  await page.keyboard.press('Escape');
  await capturer(page, info, '6-client-sans-affaire');
  await page.locator('.page-editeur-devis[data-devis] .bouton-principal').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('[data-erreur="affaire"]')).toHaveText('Choisis ou crée une affaire pour finaliser ce devis.');
  await expect(champAffaire(page)).toHaveClass(/invalide/);
  await expect(champAffaire(page)).toBeFocused();
  await expect(page.locator('[data-champ="destinataire"]')).toHaveValue('contact@exemple.fr'); // l'e-mail écrit à la main n'est pas écrasé par le choix du client
  await capturer(page, info, '6-champ-rouge');
  await champAffaire(page).click();
  await capturer(page, info, '6-ligne-creer');
  const avant = (await listerDocuments('crm_affaires')).length;
  await champAffaire(page).fill('');
  await suggestions(page).filter({ hasText: 'Créer l’affaire « Affaire Nouveau Client »' }).click();
  await suggestions(page).filter({ hasText: 'Premier contact' }).click(); // l'étape n'est pas réglée : second pas (voir le test 6b)
  await expect.poll(async () => (await listerDocuments('crm_affaires')).length).toBe(avant + 1);
  const creee = (await listerDocuments('crm_affaires')).find((a) => a.titre === 'Affaire Nouveau Client');
  expect(creee).toMatchObject({ organisationId: 'o3' });
  await enregistre(page);
  expect((await lire()).affaireId).toBe(creee.id);
  await expect(champAffaire(page)).not.toHaveClass(/invalide/);
});

test('6b second pas : sans réglage d’étape, « + Créer l’affaire » demande « Dans quelle étape ? » dans la même liste, sans fenêtre, et ne crée rien avant le clic sur une étape', async ({ page }, info) => {
  await semer();
  await brouillon(page);
  await choisir(page, 'Nouveau', 'Nouveau Client');
  const avant = (await listerDocuments('crm_affaires')).length;
  await champAffaire(page).click();
  await suggestions(page).filter({ hasText: 'Créer l’affaire' }).click();
  await expect(page.locator('.entete-droite .suggestions:not([hidden]) .suggestion-groupe')).toHaveText(['Dans quelle étape ?']);
  await expect(page.getByRole('dialog')).toHaveCount(0);
  expect((await listerDocuments('crm_affaires')).length).toBe(avant);
  await capturer(page, info, '6b-dans-quelle-etape');
  await champAffaire(page).fill('Chantier Z'); // taper abandonne le second pas : la liste redevient celle des affaires et de la création, au nom tapé
  await expect(suggestions(page)).toHaveText([/\+ Créer l’affaire « Chantier Z »/]);
  await suggestions(page).first().click();
  await suggestions(page).filter({ hasText: 'Premier contact' }).click();
  await expect.poll(async () => (await listerDocuments('crm_affaires')).length).toBe(avant + 1);
  expect((await listerDocuments('crm_affaires')).find((a) => a.titre === 'Chantier Z')).toMatchObject({ etape: 'premier_contact', organisationId: 'o3' }); // au nom tapé, jamais sans nom
});

test('7 changement de client alors qu’une affaire d’un autre client est choisie : l’affaire se vide et un message le dit', async ({ page }, info) => {
  await semer();
  await brouillon(page, { organisationId: 'o1', personneId: 'p1', affaireId: 'a1' });
  await expect(champAffaire(page)).toHaveValue('Cuisine Dupont · Dupont Bâtiment');
  await choisir(page, 'Atelier', 'Atelier Vide');
  await enregistre(page);
  const d = await lire();
  expect(d.organisationId).toBe('o2');
  expect(d.affaireId ?? null).toBeNull();
  await expect(champAffaire(page)).toHaveValue('');
  await expect(page.locator('[data-info="affaire-videe"]')).toContainText('L’affaire « Cuisine Dupont » a été retirée du devis : elle n’est pas celle de ce client.');
  await capturer(page, info, '7-affaire-videe');
  // Cas contraire : un autre client qui a aussi cette affaire (la personne de l'organisation) la garde.
  await choisir(page, 'Dupont B', /^Dupont Bâtiment/);
  await champAffaire(page).click();
  await suggestions(page).filter({ hasText: 'Garage' }).click();
  await choisir(page, 'Julie', 'Julie Dupont'); // même organisation : l'affaire reste
  await enregistre(page);
  expect((await lire()).affaireId).toBe('a2');
});

test('7b une affaire archivée du même client reste sur le devis quand on rechoisit ce client (sans message d’affaire retirée)', async ({ page }) => {
  await semer();
  await brouillon(page, { organisationId: 'o1', personneId: 'p1', affaireId: 'a6' });
  await choisir(page, 'Julie', 'Julie Dupont');
  await enregistre(page);
  expect((await lire()).affaireId).toBe('a6');
  await expect(page.locator('[data-info="affaire-videe"]')).toBeHidden();
});

test('8 rien trouvé : deux lignes « Créer la personne » et « Créer l’organisation », rien n’est créé sans clic ; le clic ouvre la fenêtre habituelle et la fiche créée devient le client', async ({ page }, info) => {
  await semer();
  await brouillon(page);
  const avant = { p: (await listerDocuments('crm_personnes')).length, o: (await listerDocuments('crm_organisations')).length };
  await champClient(page).click();
  await champClient(page).fill('Zéphir Nouveau');
  await expect(suggestions(page)).toHaveText([/Créer la personne « Zéphir Nouveau »/, /Créer l’organisation « Zéphir Nouveau »/]);
  await capturer(page, info, '8-rien-trouve');
  expect((await listerDocuments('crm_personnes')).length).toBe(avant.p); // rien n'est créé sans clic
  expect((await listerDocuments('crm_organisations')).length).toBe(avant.o);
  await suggestions(page).filter({ hasText: 'Créer l’organisation' }).click();
  const fenetre = page.getByRole('dialog');
  await expect(fenetre).toContainText('Ajouter une organisation');
  await expect(fenetre.locator('#creation-org-nom')).toHaveValue('Zéphir Nouveau');
  await fenetre.getByRole('button', { name: 'Annuler' }).click(); // cas d'erreur : annulé, rien n'est créé et le champ remontre le client enregistré (aucun)
  await expect(champClient(page)).toHaveValue('');
  expect((await listerDocuments('crm_organisations')).length).toBe(avant.o);
  await champClient(page).fill('Zéphir Nouveau');
  await suggestions(page).filter({ hasText: 'Créer la personne' }).click();
  await expect(page.getByRole('dialog')).toContainText('Ajouter une personne');
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(champClient(page)).toHaveValue('Zéphir Nouveau');
  await enregistre(page);
  const creee = (await listerDocuments('crm_personnes')).find((p) => p.nom === 'Zéphir Nouveau');
  expect(creee).toBeTruthy();
  expect((await lire()).personneId).toBe(creee.id);
});

test('9 la croix du champ efface le client ET l’affaire ; la croix de la ligne Affaire n’efface que l’affaire', async ({ page }, info) => {
  await semer();
  await brouillon(page, { organisationId: 'o1', personneId: 'p1', affaireId: 'a1', destinataires: ['julie@dupont.test'] });
  await page.locator('.entete-droite .champ-intelligent-effacer').nth(1).click(); // la croix de la ligne Affaire
  await enregistre(page);
  let d = await lire();
  expect(d.affaireId ?? null).toBeNull();
  expect(d).toMatchObject({ organisationId: 'o1', personneId: 'p1' });
  await champAffaire(page).click();
  await suggestions(page).filter({ hasText: 'Cuisine Dupont' }).click();
  await page.locator('.entete-droite .champ-intelligent-effacer').first().click(); // la croix du champ unique
  await enregistre(page);
  d = await lire();
  expect(d.affaireId ?? null).toBeNull();
  expect(d.organisationId ?? null).toBeNull();
  expect(d.personneId ?? null).toBeNull();
  await expect(champClient(page)).toHaveValue('');
  await expect(champAffaire(page)).toHaveValue('');
  await expect(page.locator('[data-erreur="affaire"]')).toContainText('Facultatif tant que le devis est un brouillon'); // sans client : le sens d'avant
  await capturer(page, info, '9-croix-efface-tout');
});

test('10 lecture seule : deux champs texte « client » et « affaire » et la ligne « à l’attention de » quand elle existe', async ({ page }, info) => {
  await semer();
  await brouillon(page, { organisationId: 'o1', personneId: 'p1', affaireId: 'a1', numero: 'DEV-2026-10-30-001', statut: 'en_attente_envoi', finaliseLe: new Date(Date.now() - 86400000) });
  await expect(page.locator('.page-editeur-devis[data-devis] .entete-droite .champ-intelligent')).toHaveCount(0);
  await expect(champClient(page)).toHaveValue('Dupont Bâtiment');
  await expect(page.locator('[data-champ="attention"]')).toHaveValue('Julie Dupont');
  await expect(champAffaire(page)).toHaveValue('Cuisine Dupont · Dupont Bâtiment');
  await expect(page.locator('[data-zone="question-client"]')).toHaveCount(0);
  await capturer(page, info, '10-lecture-seule');
});
