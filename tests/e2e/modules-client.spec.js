// Modules actifs par client (chantier 7), sur les émulateurs, avec les RÈGLES DE LA PLATEFORME (chargées le temps de ce fichier,
// puis les règles du CRM remises). Un client voit le menu et les écrans de ses seuls modules actifs, sous clients/<client>/…
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, ecrireDocument, estTelephone, ouvrirSectionReglages, choisirDansMenuUtilisateur, ouvrirMenuUtilisateur, attendreCalme, listerDocuments, CHANTIER_ESSAI, PROJET, FIRESTORE, URL_APP } from './outils.js';

const CRM = '/js/modules/crm/donnees.js';
const CAPTURES = fileURLToPath(new URL('./captures/modules-client/', import.meta.url));
const etatSocle = (page) => page.evaluate(async (m) => {
  const D = await import(m);
  return { ecoutes: D.ecoutesDemarrees(), noyau: D.estNoyau(), pret: { ...D.etat.pret }, personnes: D.etat.personnes.length, base: D.cheminDeBase() };
}, CRM);

const ALICE = 'alice@exemple.test';
const LEA = 'lea@exemple.test';
const BOB = 'bob@exemple.test';

async function chargerRegles(fichier) {
  const contenu = await readFile(fileURLToPath(new URL(`../../${fichier}`, import.meta.url)), 'utf8');
  const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: fichier, content: contenu }] } }),
  });
  if (!r.ok) throw new Error(`Règles non chargées (${fichier}) : ${await r.text()}`);
}

test.beforeAll(() => chargerRegles('firestore.plateforme.rules'));
test.afterAll(() => chargerRegles('firestore.rules'));

function personne(nom) {
  const maintenant = new Date();
  const [prenom, ...reste] = nom.split(' ');
  return {
    nom, prenom, nomFamille: reste.join(' '), organisationId: null, telephones: [], emails: [], emailsNormalises: [], etiquettes: [],
    ville: '', linkedin: '', siteWeb: '', source: '', oppositionProspection: false, dateOpposition: null, archive: false,
    proprietaire: ALICE, creeLe: maintenant, modifieLe: maintenant, creePar: ALICE, modifiePar: ALICE,
  };
}

test.beforeEach(async () => {
  for (const [id, nom] of [['cabinet', 'Cabinet Martin'], ['studio', 'Studio Lune'], ['vide', 'Maison Vide'], ['faux', 'Atelier Faux'], ['plein', 'Maison Pleine'], ['veilleseule', 'Veille Seule'], ['devisseul', 'Devis Seul']]) {
    await ecrireDocument(`marques/${id}`, { actif: true, nom, couleur: '#336699', accueil: 'Bienvenue.' });
  }
  await ecrireDocument('clients/cabinet', { modules: { affaires: true, projets: false } });
  await ecrireDocument('clients/studio', { modules: { affaires: true, projets: true } });
  await ecrireDocument('clients/faux', { modules: { projets: true } }); // projets sans affaires : refusé
  // « plein » : l'interrupteur unique « crm » (allume affaires ET projets) et les autres modules
  await ecrireDocument('clients/plein', { modules: { crm: true, veille: true, automatisations: true, mcp: true }, equipe: [{ email: ALICE, role: 'editeur' }, { email: LEA, role: 'lecteur' }] });
  await ecrireDocument(`clients/plein/membres/${ALICE}`, { role: 'editeur' });
  await ecrireDocument(`clients/plein/membres/${LEA}`, { role: 'lecteur' });
  await ecrireDocument('clients/veilleseule', { modules: { veille: true } });
  await ecrireDocument('clients/veilleseule/membres/' + ALICE, { role: 'editeur' });
  // « devisseul » (PR C1) : le seul module Devis, sans Affaires ; « Mon entreprise » complète et un brouillon prêt à finaliser
  await ecrireDocument('clients/devisseul', { modules: { devis: true } });
  await ecrireDocument('clients/devisseul/membres/' + ALICE, { role: 'editeur' });
  await ecrireDocument('clients/devisseul/devis_parametres/reglages', {
    regimeTva: 'assujetti',
    entreprise: { nom: 'Atelier Exemple', siret: '123 456 789 00012', adresse: { ligne1: '3 rue de l’Atelier', codePostal: '75001', ville: 'Paris' }, assuranceTexte: 'Assurance décennale : Assureur Exemple, contrat numéro : 123, territorialité : France métropolitaine.' },
  });
  await ecrireDocument('clients/devisseul/crm_personnes/pz', personne('Zoé Prête'));
  for (const [id, lignes] of [['dPret', [{ id: 'l1', libelle: 'Carrelage', familleId: 'famille-1', type: 'fourniture', quantite: 1, unite: 'u', prixAchat: 80, prixVente: 100, tauxTva: 20 }]], ['dVide', []]]) {
    const maintenant = new Date();
    await ecrireDocument(`clients/devisseul/devis_devis/${id}`, {
      racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: null, personneId: 'pz', organisationId: null, modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
      regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: '2099-12-31', objet: 'Rénovation', destinataires: ['zoe@exemple.test'],
      sections: [{ id: 's1', titre: 'Cuisine', lignes }], chantier: CHANTIER_ESSAI, creePar: ALICE, modifiePar: ALICE, proprietaire: ALICE, creeLe: maintenant, modifieLe: maintenant,
    });
  }
  // « vide » n'a pas de document clients/vide : aucun module actif
  for (const c of ['cabinet', 'studio', 'vide', 'faux']) await ecrireDocument(`clients/${c}/membres/${ALICE}`, { role: 'editeur' });
  await ecrireDocument(`clients/cabinet/membres/${LEA}`, { role: 'lecteur' });
  await ecrireDocument('clients/studio/membres/' + BOB, { role: 'editeur' });
  await ecrireDocument('clients/cabinet/crm_personnes/p1', personne('Camille Dubois'));
  await ecrireDocument('clients/studio/crm_personnes/p2', personne('Samuel Lefort'));
  await ecrireDocument('crm_personnes/racine1', personne('Racine Secrète')); // CRM de Jérôme : ne doit jamais apparaître chez un client
});

async function ouvrir(page, client, email = ALICE, reste = '') {
  await page.goto('about:blank');
  await page.goto(`${URL_APP}#/espace/${client}${reste ? `/${reste}` : ''}`);
  await page.waitForFunction(() => !!window.__chevalierTest);
  await page.evaluate((e) => window.__chevalierTest.connecter(e, true), email);
}
const menu = (page) => page.locator('.menu');
async function ouvrirMenu(page) {
  if (estTelephone(page)) await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
}

test('R1 un client avec « affaires » seul : menu et écrans du CRM, aucun écran Projets, nom du client', async ({ page }) => {
  await ouvrir(page, 'cabinet');
  await expect(page.locator('.coquille')).toBeVisible();
  await expect(page).toHaveURL(/#\/espace\/cabinet\/crm\/accueil$/);
  await expect(page).toHaveTitle('Cabinet Martin');
  await ouvrirMenu(page);
  for (const lib of ['Accueil', 'Personnes', 'Organisations', 'Affaires']) await expect(menu(page).getByRole('link', { name: lib, exact: true })).toHaveCount(1);
  for (const lib of ['Projets', 'Archives', 'Modèles', 'Journal des modifications', 'Réglages']) await expect(menu(page).getByRole('link', { name: lib, exact: true })).toHaveCount(0);
  // la page Réglages existe aussi chez un client (2.6.0) : elle s'ouvre depuis le menu utilisateur (PR B), comme le Journal et « Connecter mon ChatGPT » s'ils sont allumés
  await ouvrirMenuUtilisateur(page);
  await expect(page.locator('.menu-pop').getByRole('menuitem')).toHaveText(['Réglages', 'Voir le journal des modifications', /Thème/, 'Se déconnecter']);
  await page.keyboard.press('Escape');
  await expect(menu(page)).toContainText('Cabinet Martin');
  await expect(menu(page)).not.toContainText('Chevalier IA');
  await expect(page.locator('.section-objectifs')).toHaveCount(0); // les objectifs de Jérôme n'existent pas chez un client
  // Socle commun (PR B) : la coque l'a démarré, le module Affaires a démarré par-dessus : cinq écouteurs, aucun doublon, pas en mode noyau.
  await expect.poll(async () => (await etatSocle(page)).ecoutes).toEqual(['personnes', 'organisations', 'affaires', 'activites', 'parametres']);
  const e1 = await etatSocle(page);
  expect(e1.noyau).toBe(false);
  expect(e1.base).toBe('clients/cabinet');
});

test('R2 les données sont sous clients/<client> : on voit les personnes du client, jamais celles de la racine ni d\'un autre client', async ({ page }) => {
  await ouvrir(page, 'cabinet');
  await expect(page.locator('.coquille')).toBeVisible();
  await ouvrirMenu(page);
  await menu(page).getByRole('link', { name: 'Personnes', exact: true }).click();
  await expect(page).toHaveURL(/#\/espace\/cabinet\/crm\/personnes$/);
  await expect(page.getByText('Camille Dubois').first()).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Racine Secrète');
  await expect(page.locator('body')).not.toContainText('Samuel Lefort');
  // Un clic sur une fiche reste dans l'espace du client
  await page.getByText('Camille Dubois').first().click();
  await expect(page).toHaveURL(/#\/espace\/cabinet\/crm\/personnes\/p1$/);
});

test('R3 un module non activé est introuvable, même par son adresse directe (avant et après la connexion)', async ({ page }) => {
  await ouvrir(page, 'cabinet', ALICE, 'projets/projets');
  await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
  await expect(page.locator('.liste-projets, .kanban-projets')).toHaveCount(0);
  // changement d'adresse à la main, sans recharger la page
  await page.getByRole('link', { name: "Retour à l'accueil" }).click();
  await expect(page.locator('.coquille')).toBeVisible();
  await page.evaluate(() => { location.hash = '#/espace/cabinet/projets/modeles'; });
  await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
  await page.evaluate(() => { location.hash = '#/espace/cabinet/reglages'; });
  await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible(); // les Réglages existent chez un client (2.6.0)
  await page.evaluate(() => { location.hash = '#/espace/cabinet/n-importe-quoi'; });
  await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
});

test('R4 un client avec « affaires » et « projets » : les deux groupes, et les écrans Projets s\'ouvrent', async ({ page }) => {
  await ouvrir(page, 'studio');
  await expect(page.locator('.coquille')).toBeVisible();
  await ouvrirMenu(page);
  for (const lib of ['Personnes', 'Projets']) await expect(menu(page).getByRole('link', { name: lib, exact: true })).toHaveCount(1);
  await expect(menu(page).getByRole('link', { name: 'Modèles', exact: true })).toHaveCount(0); // « Modèles » est dans les Réglages
  await expect(menu(page).getByRole('link', { name: 'Archives', exact: true })).toHaveCount(0); // Archives n'est plus au menu (PR A) : on y va par le bouton de l'écran Projets
  await menu(page).getByRole('link', { name: 'Projets', exact: true }).click();
  await page.locator('.bascule-vue[data-vue="archives"]').click();
  await expect(page).toHaveURL(/#\/espace\/studio\/projets\/archives$/);
  await expect(page.getByRole('heading', { name: 'Page introuvable' })).toHaveCount(0);
  await expect(page.locator('.coquille')).toContainText('Archives');
  await expect(page.locator('body')).not.toContainText('Camille Dubois');
});

test('R5 « projets » sans « affaires » est refusé : aucun écran, accueil provisoire, rien ne casse', { tag: '@sans-telephone' }, async ({ page }) => {
  await ouvrir(page, 'faux');
  await expect(page.getByText("Aucun écran n'est encore activé dans cet espace.")).toBeVisible();
  await expect(page.locator('.coquille')).toHaveCount(0);
  await page.evaluate(() => { location.hash = '#/espace/faux/projets/projets'; });
  await expect(page.getByText("Aucun écran n'est encore activé dans cet espace.")).toBeVisible();
});

test('R6 un client sans fiche de modules : accueil provisoire actuel (nom, e-mail, rôle, déconnexion)', async ({ page }) => {
  await ouvrir(page, 'vide');
  await expect(page.getByText(`${ALICE} · éditeur`)).toBeVisible();
  await expect(page.getByText("Aucun écran n'est encore activé dans cet espace.")).toBeVisible();
  await expect(page.locator('.coquille')).toHaveCount(0);
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
});

test('R7 un lecteur lit les modules de son client ; un membre d\'un autre client est refusé comme avant', { tag: '@sans-telephone' }, async ({ page }) => {
  await ouvrir(page, 'cabinet', LEA);
  await expect(page.locator('.coquille')).toBeVisible();
  await ouvrirMenu(page);
  await expect(menu(page).getByRole('link', { name: 'Personnes', exact: true })).toHaveCount(1);
  await page.goto('about:blank');
  await ouvrir(page, 'cabinet', BOB); // membre de « studio » seulement
  await expect(page.getByRole('alert')).toHaveText("Ce compte n'a pas accès à cet espace.");
  await expect(page.locator('.coquille')).toHaveCount(0);
});

test('R8 déconnexion depuis le menu : retour à la page de connexion du client, sans fuite d\'écrans', async ({ page }) => {
  await ouvrir(page, 'cabinet');
  await expect(page.locator('.coquille')).toBeVisible();
  await attendreCalme(page); // l'espace finit d'écrire ses réglages de départ avant qu'on se déconnecte (sinon : écriture refusée après la déconnexion)
  await choisirDansMenuUtilisateur(page, 'Se déconnecter');
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
  await expect(page.locator('.coquille')).toHaveCount(0);
  await expect(page.locator('body')).not.toContainText('Camille Dubois');
});

const IDS_CRM = ['reglages-etapes', 'reglages-phases', 'reglages-options', 'reglages-modeles-affaire', 'reglages-offres', 'reglages-secteurs', 'reglages-sources', 'reglages-etiquettes', 'reglages-filtres', 'reglages-debut', 'reglages-export'];

test('R9 menu CRM unique : un seul groupe « CRM », sept entrées dans l\'ordre, chaque adresse d\'avant continue de marcher', async ({ page }) => {
  await ouvrir(page, 'studio');
  await expect(page.locator('.coquille')).toBeVisible();
  await ouvrirMenu(page);
  await expect(menu(page).locator('.menu-groupe-titre')).toHaveCount(0); // plus de titres de groupes (PR B)
  await expect(menu(page).locator('.menu-groupe[data-bloc="crm"] .menu-entree')).toHaveText(['Accueil', 'Personnes', 'Organisations', 'Affaires', 'Projets']);
  for (const [lib, adresse, chemin] of [['Projets', /#\/espace\/studio\/projets\/projets$/, 'projets/projets'], ['Affaires', /#\/espace\/studio\/crm\/affaires$/, 'crm/affaires']]) {
    if (estTelephone(page) && !(await page.locator('.coquille.menu-ouvert').count())) await page.getByRole('button', { name: 'Ouvrir le menu' }).click(); // sur téléphone le menu se referme après chaque clic
    await menu(page).getByRole('link', { name: lib, exact: true }).click();
    await expect(page).toHaveURL(adresse);
    await expect(menu(page).locator(`.menu-entree[data-chemin="${chemin}"]`)).toHaveAttribute('aria-current', 'page');
  }
  // anciennes adresses écrites à la main (signets) : toujours valides
  for (const route of ['crm/accueil', 'crm/personnes', 'crm/journal', 'projets/projets/pr1', 'projets/archives']) {
    await page.evaluate((r) => { location.hash = `#/espace/studio/${r}`; }, route);
    await expect(page.getByRole('heading', { name: 'Page introuvable' })).toHaveCount(0);
    await expect(page.locator('.contenu')).not.toBeEmpty();
  }
});

test('R10 Réglages chez un éditeur : l\'espace d\'abord (Mon espace, Membres, Modules), puis les modules ; les sections du CRM y sont toutes', async ({ page }) => {
  await ouvrir(page, 'plein');
  await expect(page.locator('.coquille')).toBeVisible();
  await choisirDansMenuUtilisateur(page, 'Réglages');
  await expect(page).toHaveURL(/#\/espace\/plein\/reglages$/);
  await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible();
  if (estTelephone(page)) { // sur téléphone le menu de gauche est replié : un bouton qui montre la section ouverte
    await expect(page.locator('.reglages-menu-bouton')).toContainText('Mon espace');
    await expect(page.locator('.reglages-menu-liste')).toBeHidden();
    await page.locator('.reglages-menu-bouton').click();
    await expect(page.locator('.reglages-menu-liste')).toBeVisible();
    await page.locator('.reglages-menu-bouton').click();
  }
  const liens = page.locator('.reglages-menu-lien');
  await expect(liens).toHaveText(['Mon espace', 'Membres et rôles', 'Modules actifs', 'Déploiement', 'Affaires et projets', 'Veille', 'Automatisations', 'Connecter mon ChatGPT']);
  await expect(page.locator('.reglages-menu-titre')).toHaveText(['Espace', 'Modules']);
  // Mon espace (modifiable par un éditeur depuis la 2.8.0 : tests/e2e/mon-espace.spec.js) : le nom et la couleur lus dans la fiche de marque, le thème de l'appareil
  await expect(page.locator('[data-champ="nom"]')).toHaveValue('Maison Pleine');
  await expect(page.locator('body')).not.toContainText(/Chevalier|Jérôme|Charles/); // aucune identité de Jérôme dans les Réglages d'un client
  await expect(page.locator('[data-champ="couleur"]')).toHaveValue('#336699');
  await expect(page.locator('#reglages-theme')).toBeVisible();
  // Membres et rôles
  await ouvrirSectionReglages(page, 'Membres et rôles');
  await expect(page).toHaveURL(/#\/espace\/plein\/reglages\/membres$/);
  await expect(page.locator(`[data-membre="${ALICE}"]`)).toContainText('(toi)');
  await expect(page.locator(`[data-membre="${LEA}"] [data-role="role-membre"]`)).toHaveValue('lecteur');
  await expect(page.locator(`[data-membre="${ALICE}"] [data-role="role-membre"]`)).toHaveValue('editeur');
  // Modules actifs : un seul interrupteur « CRM » (affaires + projets), tous en lecture seule (seul l'administrateur change les modules)
  await ouvrirSectionReglages(page, 'Modules actifs');
  await expect(page.locator('#reglages-modules')).toContainText('Pour changer de module, contacte ton administrateur');
  await expect(page.locator('[data-interrupteur="crm"]')).toBeChecked();
  await expect(page.locator('[data-interrupteur="crm"]')).toBeDisabled();
  await expect(page.locator('[data-interrupteur="mcp"]')).toBeChecked();
  await expect(page.locator('[data-interrupteur="affaires"], [data-interrupteur="projets"]')).toHaveCount(0);
  // CRM : toutes les sections du CRM, plus les modèles de projets (module Projets), mais pas les objectifs de Jérôme
  await ouvrirSectionReglages(page, 'Affaires et projets');
  await expect(page).toHaveURL(/#\/espace\/plein\/reglages\/crm$/);
  for (const id of [...IDS_CRM, 'reglages-modeles-projets']) await expect(page.locator(`#${id}`), id).toBeAttached();
  await expect(page.locator('#reglages-objectifs')).toHaveCount(0);
  await expect(page.locator('#reglages-theme')).toHaveCount(0); // le thème est un réglage de l'espace, plus du CRM
  // un réglage du CRM s'écrit toujours au même endroit (clients/<client>/crm_parametres)
  await page.locator('#reglages-etiquettes').getByPlaceholder('Nouvelle étiquette').fill('Prioritaire');
  await page.locator('#reglages-etiquettes').getByRole('button', { name: 'Ajouter' }).click();
  await expect(page.locator('#reglages-etiquettes [data-etiquette="prioritaire"] input[type="text"]')).toHaveValue('Prioritaire');
  // Veille et Automatisations : leur seule section est la Sauvegarde
  await ouvrirSectionReglages(page, 'Veille');
  await expect(page.locator('#reglages-export-veille')).toBeVisible();
  await expect(page.locator('[data-role="aucun-reglage"]')).toHaveCount(0);
  await ouvrirSectionReglages(page, 'Automatisations');
  await expect(page.locator('#reglages-export-automatisations')).toBeVisible(); // seul réglage : la sauvegarde de ses données
  await ouvrirSectionReglages(page, 'Connecter mon ChatGPT');
  await page.getByRole('link', { name: 'Ouvrir la page Connexion' }).click();
  await expect(page).toHaveURL(/#\/espace\/plein\/mcp\/infos$/);
});

test('R11 Réglages chez un lecteur : pas de sections d\'espace réservées aux éditeurs, réglages du CRM consultables mais grisés', async ({ page }) => {
  await ouvrir(page, 'plein', LEA);
  await expect(page.locator('.coquille')).toBeVisible();
  await page.evaluate(() => { location.hash = '#/espace/plein/reglages'; });
  await expect(page.locator('.reglages-menu-lien')).toHaveText(['Mon espace', 'Affaires et projets', 'Veille', 'Automatisations', 'Connecter mon ChatGPT']);
  await page.evaluate(() => { location.hash = '#/espace/plein/reglages/membres'; }); // réservé aux éditeurs : retour à la page d'arrivée
  await expect(page).toHaveURL(/#\/espace\/plein\/reglages$/);
  await page.evaluate(() => { location.hash = '#/espace/plein/reglages/modules'; });
  await expect(page).toHaveURL(/#\/espace\/plein\/reglages$/);
  await ouvrirSectionReglages(page, 'Affaires et projets');
  await expect(page.locator('.reglages-lecture')).toContainText('lecteur');
  await expect(page.locator('fieldset.reglages-sections')).toHaveAttribute('disabled', '');
  await expect(page.locator('#reglages-etiquettes').getByRole('button', { name: 'Ajouter' })).toBeDisabled();
  await expect(page.locator('#reglages-etapes').getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
});

test('R12 un client sans le module « projets » : le CRM est complet côté Réglages sans les modèles de projets ; un lien de section inconnue revient à la page d\'arrivée', async ({ page }) => {
  await ouvrir(page, 'cabinet');
  await expect(page.locator('.coquille')).toBeVisible();
  await page.evaluate(() => { location.hash = '#/espace/cabinet/reglages/crm'; });
  await expect(page.locator('#reglages-etapes')).toBeAttached();
  await expect(page.locator('#reglages-modeles-projets')).toHaveCount(0);
  await page.evaluate(() => { location.hash = '#/espace/cabinet/reglages/inconnu'; });
  await expect(page).toHaveURL(/#\/espace\/cabinet\/reglages$/);
  await expect(page.locator('.reglages-menu-lien[aria-current="page"]')).toHaveText('Mon espace');
});

test('R13 un client « Veille seul » : le socle commun tourne, invisible (deux écouteurs, mode noyau), aucune entrée Personnes ; la déconnexion l\'arrête', async ({ page }, info) => {
  await ouvrir(page, 'veilleseule');
  await expect(page.locator('.coquille')).toBeVisible();
  await expect(page).toHaveURL(/#\/espace\/veilleseule\/veille\/contenus$/);
  await ouvrirMenu(page);
  await expect(menu(page).getByRole('link', { name: 'Veille', exact: true })).toHaveCount(1);
  for (const lib of ['Accueil', 'Personnes', 'Organisations', 'Affaires', 'Projets', 'Devis']) await expect(menu(page).getByRole('link', { name: lib, exact: true })).toHaveCount(0);
  if (estTelephone(page)) await page.keyboard.press('Escape');
  await expect.poll(async () => (await etatSocle(page)).pret.personnes).toBe(true); // cas vide : prêt avec des listes vides
  const e = await etatSocle(page);
  expect(e.ecoutes).toEqual(['personnes', 'organisations']);
  expect(e.noyau).toBe(true);
  expect(e.pret).toEqual({ personnes: true, organisations: true, affaires: false, activites: false, parametres: false });
  expect(e.personnes).toBe(0);
  expect(e.base).toBe('clients/veilleseule');
  await page.screenshot({ path: `${CAPTURES}13-veille-seul-${info.project.name}.png`, animations: 'disabled' });
  // Invisible : l'adresse directe d'un écran du CRM reste introuvable (le socle n'a pas d'écran)
  await page.evaluate(() => { location.hash = '#/espace/veilleseule/crm/personnes'; });
  await expect(page.getByRole('heading', { name: 'Page introuvable' })).toBeVisible();
  await page.getByRole('link', { name: "Retour à l'accueil" }).click();
  await expect(page.locator('.coquille')).toBeVisible();
  await attendreCalme(page);
  // Déconnexion : fermer() arrête les modules puis le socle
  await choisirDansMenuUtilisateur(page, 'Se déconnecter');
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
  expect((await etatSocle(page)).ecoutes).toEqual([]);
});

const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
/** Intercepte devisFinaliser : note le corps des appels et répond `reponse`. */
async function simulerFinalisation(page, reponse) {
  const appels = [];
  await page.route('**/devisFinaliser', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    appels.push(JSON.parse(route.request().postData() || '{}'));
    return route.fulfill({ status: 200, headers: CORS, body: JSON.stringify({ result: reponse }) });
  });
  return appels;
}

test.describe('R14 Devis seul (sans Affaires ni Projets) : le socle commun porte les fiches, un devis se finalise sans affaire', () => {
  test('R14-1 le client « devisseul » ouvre la coque sur la liste des devis, titre « Devis Seul »', async ({ page }) => {
    await ouvrir(page, 'devisseul');
    await expect(page.locator('.coquille')).toBeVisible();
    await expect(page).toHaveURL(/#\/espace\/devisseul\/devis\/liste$/);
    await expect(page).toHaveTitle('Devis Seul');
  });

  test('R14-2 le menu n\'a qu\'une entrée « Devis » : ni Accueil, ni Personnes, ni Organisations, ni Affaires, ni Projets', async ({ page }) => {
    await ouvrir(page, 'devisseul');
    await expect(page.locator('.coquille')).toBeVisible();
    await ouvrirMenu(page);
    await expect(menu(page).getByRole('link', { name: 'Devis', exact: true })).toHaveCount(1);
    for (const lib of ['Accueil', 'Personnes', 'Organisations', 'Affaires', 'Projets']) await expect(menu(page).getByRole('link', { name: lib, exact: true })).toHaveCount(0);
    if (estTelephone(page)) await page.keyboard.press('Escape');
  });

  test('R14-3 le socle tourne en mode noyau (personnes, organisations) sur le chemin du client ; le module Devis a lu ses collections', async ({ page }) => {
    await ouvrir(page, 'devisseul');
    await expect(page.locator('.page-liste-devis')).toBeVisible();
    await expect.poll(async () => (await etatSocle(page)).pret.personnes).toBe(true);
    await expect.poll(async () => (await etatSocle(page)).pret.organisations).toBe(true);
    const e = await etatSocle(page);
    expect(e.ecoutes).toEqual(['personnes', 'organisations']);
    expect(e.noyau).toBe(true);
    expect(e.base).toBe('clients/devisseul');
    const devis = await page.evaluate(async () => (await import('/js/modules/devis/donnees.js')).estPret());
    expect(devis).toBe(true);
  });

  test('R14-4 cas vide : « Aucun devis pour l\'instant. » ; « Nouveau devis » ouvre l\'éditeur et crée un brouillon sans affaire', async ({ page }) => {
    for (const id of ['dPret', 'dVide']) await fetch(`${FIRESTORE}/v1/projects/${PROJET}/databases/(default)/documents/clients/devisseul/devis_devis/${id}`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
    await ouvrir(page, 'devisseul');
    await expect(page.locator('.page-liste-devis')).toBeVisible();
    await expect(page.locator('.page-liste-devis')).toContainText('Aucun devis pour l’instant.');
    const avant = (await listerDocuments('clients/devisseul/devis_devis')).length;
    expect(avant).toBe(0);
    await page.locator('[data-action="nouveau-devis-vide"], [data-action="nouveau-devis"]').first().click();
    await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
    await attendreCalme(page);
    const apres = await listerDocuments('clients/devisseul/devis_devis');
    expect(apres.length).toBe(avant + 1);
    const nouveau = apres[0];
    expect(nouveau.statut).toBe('brouillon');
    expect(nouveau.affaireId ?? null).toBeNull();
  });

  test('R14-5 « Pour qui est ce devis ? » : créer la personne sur place donne une vraie fiche, choisie, journalisée', async ({ page }) => {
    await ouvrir(page, 'devisseul', ALICE, 'devis/editeur/dVide');
    await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
    await attendreCalme(page);
    const champ = page.locator('[data-champ="client"]');
    await champ.click();
    await champ.fill('Zoé Client');
    const suggestions = page.locator('.entete-droite .suggestions:not([hidden]) .suggestion');
    await expect(suggestions).toHaveText([/Créer la personne « Zoé Client »/, /Créer l’organisation « Zoé Client »/]);
    await suggestions.filter({ hasText: 'Créer la personne' }).click();
    await expect(page.getByRole('dialog')).toContainText('Ajouter une personne');
    await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();
    await expect(champ).toHaveValue('Zoé Client');
    await expect(page.locator('[data-valeur="enregistrement"]')).toHaveText('Enregistré');
    const fiche = (await listerDocuments('clients/devisseul/crm_personnes')).find((p) => p.nom === 'Zoé Client');
    expect(fiche).toBeTruthy();
    const brouillon = (await listerDocuments('clients/devisseul/devis_devis')).find((d) => d.id === 'dVide');
    expect(brouillon.personneId).toBe(fiche.id);
    expect((await listerDocuments('clients/devisseul/crm_audit')).some((l) => l.outil === 'creerPersonne')).toBe(true);
  });

  test('R14-6 finaliser sans affaire : pas de message « Choisis l\'affaire », la fonction du serveur est appelée, le devis reçoit son numéro', async ({ page }, info) => {
    const appels = await simulerFinalisation(page, { ok: true, devisId: 'dPret', statut: 'en_attente_envoi', numero: 'DEV-2026-11-05-001' });
    await ouvrir(page, 'devisseul', ALICE, 'devis/editeur/dPret');
    await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
    await attendreCalme(page);
    await page.locator('.page-editeur-devis[data-devis] .bouton-principal').click();
    await expect(page.getByRole('dialog')).not.toContainText('Ce devis ne peut pas encore être finalisé');
    await expect(page.locator('[data-champ="affaire"]')).not.toHaveClass(/invalide/);
    await expect(page.getByRole('dialog')).toContainText('Finaliser ce devis ?');
    await page.screenshot({ path: `${CAPTURES}14-devis-seul-${info.project.name}.png`, animations: 'disabled' });
    await page.getByRole('dialog').getByRole('button', { name: 'Finaliser', exact: true }).click();
    await expect.poll(() => appels.length).toBe(1);
    expect(appels[0].data.client).toBe('devisseul');
    expect(appels[0].data.devisId).toBe('dPret');
    await expect(page.locator('.toast, [role="status"]').filter({ hasText: 'Devis finalisé : DEV-2026-11-05-001' }).first()).toBeVisible();
  });

  test('R14-7 cas d\'erreur : le serveur refuse (ok: false) : la fenêtre donne les phrases, rien n\'est écrit', async ({ page }) => {
    await simulerFinalisation(page, { ok: false, erreurs: ['Ajoute au moins une ligne au devis avant de le finaliser.'] });
    await ouvrir(page, 'devisseul', ALICE, 'devis/editeur/dVide');
    await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
    await attendreCalme(page);
    await page.locator('.page-editeur-devis[data-devis] .bouton-principal').click();
    const fenetre = page.getByRole('dialog');
    await expect(fenetre).toContainText('Ce devis ne peut pas encore être finalisé');
    await expect(fenetre).toContainText('Ajoute au moins une ligne au devis avant de le finaliser.');
    await fenetre.getByRole('button', { name: 'Compris' }).click();
    const d = (await listerDocuments('clients/devisseul/devis_devis')).find((x) => x.id === 'dVide');
    expect(d.statut).toBe('brouillon');
    expect(d.numero ?? null).toBeNull();
  });

  test('R14-8 aucune erreur console ; la déconnexion arrête le socle', async ({ page }) => {
    await ouvrir(page, 'devisseul');
    await expect(page.locator('.page-liste-devis')).toBeVisible();
    await attendreCalme(page);
    await choisirDansMenuUtilisateur(page, 'Se déconnecter');
    await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
    expect((await etatSocle(page)).ecoutes).toEqual([]);
  });
});
