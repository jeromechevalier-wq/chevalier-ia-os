// Recette de bout en bout du portail « Devis seul » (client sans Affaires ni Projets), données de démonstration inventées (100 €).
// Un parcours : arrivée, Clients, Catalogue, « + Devis », finalisation, e-mail, envoyé, signé, Relances, Statistiques, export, retour à l'espace complet.
// Le serveur est SIMULÉ (page.route) : devisFinaliser, devisPreparerEmail(Etat), devisEnregistrerEnvoi, devisChangerStatut écrivent dans l'émulateur comme le vrai serveur.
// Captures : tests/e2e/captures/recette-portail/ (01-…, 02-…), ordinateur ET téléphone. Le nom d'un test commence par son numéro de critère (R1 à R4).
import { readFile } from 'node:fs/promises';
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { test, expect, poserDebutEtDuree, ouvrirSectionReglages, ecrireDocument, lireDocument, estTelephone, attendreCalme, PROJET, FIRESTORE, URL_APP } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/recette-portail/', import.meta.url));
const capturer = async (page, info, nom, { pleine = true } = {}) => { mkdirSync(DOSSIER, { recursive: true }); await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: pleine, animations: 'disabled' }); };
const ALICE = 'alice@exemple.test';
const BASE = 'clients/devisseul/';
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS' };
const jourDansLe = (n) => new Date(Date.now() + n * 86400000).toISOString().slice(0, 10);

async function chargerRegles(fichier) {
  const contenu = await readFile(fileURLToPath(new URL(`../../${fichier}`, import.meta.url)), 'utf8');
  const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: fichier, content: contenu }] } }) });
  if (!r.ok) throw new Error(`Règles non chargées (${fichier}) : ${await r.text()}`);
}
const ouvrirMenu = async (page) => { if (estTelephone(page) && !(await page.locator('.coquille.menu-ouvert').count())) await page.getByRole('button', { name: 'Ouvrir le menu' }).click(); };
const cliquerMenu = async (page, chemin) => { await ouvrirMenu(page); await page.locator(`.menu .menu-entree[data-chemin="${chemin}"]`).click(); };
const sansDebordement = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);
const sansIntrouvable = (page) => expect(page.getByRole('heading', { name: 'Page introuvable' })).toHaveCount(0);

test.beforeEach(async ({ page }) => {
  await page.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
});
test.beforeAll(() => chargerRegles('firestore.plateforme.rules'));
test.afterAll(() => chargerRegles('firestore.rules'));
test.beforeEach(async () => {
  await ecrireDocument('marques/devisseul', { actif: true, nom: 'Devis Seul', couleur: '#336699', accueil: 'Bienvenue.' });
  await ecrireDocument('clients/devisseul', { modules: { devis: true } });
  await ecrireDocument(`clients/devisseul/membres/${ALICE}`, { role: 'editeur' });
  await ecrireDocument(`${BASE}devis_parametres/reglages`, { regimeTva: 'assujetti', entreprise: { nom: 'Atelier Exemple', siret: '123 456 789 00012', adresse: { ligne1: '3 rue de l’Atelier', codePostal: '75001', ville: 'Paris' }, assuranceTexte: 'Assurance décennale : Assureur Exemple, contrat numéro : 123, territorialité : France métropolitaine.' } });
});
async function ouvrir(page, reste = 'portail-devis') {
  await page.goto('about:blank');
  await page.goto(`${URL_APP}#/espace/devisseul/${reste}`);
  await page.waitForFunction(() => !!window.__chevalierTest);
  await page.evaluate((e) => window.__chevalierTest.connecter(e, true), ALICE);
  await expect(page.locator('.coquille')).toBeVisible();
  await attendreCalme(page);
}

async function articles() {
  const maintenant = new Date();
  for (const [id, code, libelle, prix] of [['ar1', 'CAR60', 'Carrelage 60 x 60', 50], ['ar2', 'COL25', 'Colle à carrelage', 30]]) {
    await ecrireDocument(`${BASE}devis_articles/${id}`, { code, libelle, unite: 'u', prixAchat: prix, tauxTva: null, actif: true, type: 'fourniture', proprietaire: ALICE, creeLe: maintenant, modifieLe: maintenant, creePar: ALICE, modifiePar: ALICE });
  }
}

const ARTICLES_DEVIS = ['Carrelage', 'Colle'];

/** Faux serveur : écrit dans la base comme le vrai (`etat.appels` : ce que l'appli a demandé). */
async function simulerServeur(page, etat) {
  const ecrire = async (id, plus) => ecrireDocument(`${BASE}devis_devis/${id}`, { ...(await lireDocument(`${BASE}devis_devis/${id}`)), ...plus });
  const repondre = (nom, corps) => page.route(`**/${nom}`, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const donnees = JSON.parse(route.request().postData() ?? '{}').data ?? {};
    etat.appels.push([nom, donnees]);
    return route.fulfill({ status: 200, headers: cors, body: JSON.stringify({ result: await corps(donnees) }) });
  });
  await repondre('devisFinaliser', async (d) => { await ecrire(d.devisId, { statut: 'en_attente_envoi', numero: 'DEV-2026-11-09-001', finaliseLe: new Date(), totaux: { ht: 96, tva: 19.2, ttc: 115.2 } }); return { ok: true, devisId: d.devisId, statut: 'en_attente_envoi', numero: 'DEV-2026-11-09-001', nouveauNumero: true }; });
  await repondre('devisPreparerEmailEtat', async () => ({ branche: false })); // pas de porte n8n : « Préparer l'e-mail » grisé
  await repondre('devisPreparerEmail', async () => ({ ok: true, demandeId: 'dem_essai' }));
  await repondre('devisChangerStatut', async (d) => { const vers = { marquer_envoye: 'envoye', accepter: 'accepte', refuser: 'refuse' }[d.action]; await ecrire(d.devisId, { statut: vers, ...(vers === 'envoye' ? { envoyeLe: new Date(), envois: [{ date: new Date() }] } : {}), ...(vers === 'accepte' ? { accepteLe: new Date() } : {}) }); return { ok: true }; });
  await repondre('devisEnregistrerEnvoi', async (d) => { const avant = await lireDocument(`${BASE}devis_devis/${d.devisId}`); await ecrire(d.devisId, { envois: [...(avant.envois ?? []), { date: new Date(), origine: d.origine ?? 'relance', destinataires: ['marie@exemple.fr'] }] }); return { ok: true }; }); // l'envoi s'ajoute à l'historique ; la date d'envoi du devis ne bouge pas
}
const ilYA = (jours) => new Date(Date.now() - jours * 86400000 - 3600000);
/** Un devis de 100 € HT déjà envoyé il y a 12 jours (à relancer), posé en base pour Relances et Statistiques. */
const devisAncien = () => ecrireDocument(`${BASE}devis_devis/ancien`, {
  racineId: 'ancien', version: 1, numero: 'DEV-2026-10-28-001', statut: 'envoye', affaireId: null, personneId: null, organisationId: null, modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
  regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: jourDansLe(60), objet: 'Salle de bains', destinataires: ['paul@exemple.fr'], copie: [],
  sections: [{ id: 's1', titre: 'Salle de bains', lignes: [{ id: 'l1', libelle: 'Pose de faïence', quantite: 1, unite: 'u', prixAchat: 80, prixVente: 100 }] }],
  totaux: { ht: 100, tva: 20, ttc: 120 }, finaliseLe: ilYA(12), envoyeLe: ilYA(12), envois: [{ date: ilYA(12), destinataires: ['paul@exemple.fr'] }],
  creePar: ALICE, modifiePar: ALICE, proprietaire: ALICE, creeLe: ilYA(12), modifieLe: ilYA(12),
});

/** Ce que Jérôme ne doit jamais voir en Devis seul : le mot « CRM », « essai » pour « test », un élément d'Affaires ou de Projets, un lien qui sort du portail. */
async function auditer(page, nom) {
  const texte = await page.locator('.coquille').innerText();
  expect(texte, `${nom} : mot « CRM »`).not.toMatch(/\bCRM\b/);
  expect(texte, `${nom} : « essai » au lieu de « test »`).not.toMatch(/\bessais?\b/i);
  expect(texte, `${nom} : élément d'Affaires`).not.toMatch(/\+ ?Affaire|Nouvelle affaire|Affaires en cours|Activité|Projets?\b/);
  expect(await page.locator('[data-action="nouvelle-affaire"], [data-action="nouvelle-activite"], [data-action="choisir-affaire"]:visible').count(), `${nom} : bouton d'Affaires`).toBe(0);
  const liens = await page.locator('.coquille a[href^="#/"]:not(:has-text("Espace complet"))').evaluateAll((as) => as.map((a) => a.getAttribute('href')));
  // Les modules écrivent des liens « #/crm/personnes/… » que le routeur ramène sous le portail au clic (router.js, suivreLiensDuPrefixe) : seuls les liens vers Affaires, Projets ou l'accueil complet sont des fuites.
  for (const lien of liens) expect(lien, `${nom} : lien hors du portail`).toMatch(/^#\/(espace\/devisseul\/portail-devis|crm\/(personnes|organisations)|devis\/|reglages)/);
  await sansIntrouvable(page);
  expect(await sansDebordement(page), `${nom} : débordement horizontal`).toBe(true);
}
const surLaPage = (page, regex) => expect(page).toHaveURL(regex);
const carte = (page, id) => page.locator(`.ligne-relance[data-id="${id}"]`);
const confirmerFin = async (page) => { await expect(page.locator('.toast').first()).toBeVisible(); };
async function ouvrirActionsEcran(page, nom) { // sur téléphone certaines actions de la barre sont dans « … »
  const direct = page.getByRole('button', { name: nom, exact: true });
  if (await direct.isVisible().catch(() => false)) return direct;
  await page.locator('[data-action="plus-actions"]').click();
  return page.locator('.menu-pop').getByRole('menuitem', { name: nom });
}

test('R1 le parcours complet : client, devis depuis le catalogue, finalisation, envoi, signature, Relances, Statistiques, export, retour', async ({ page }, info) => {
  const etat = { appels: [] };
  await articles();
  await devisAncien();
  await simulerServeur(page, etat);

  // R1.1 arrivée : la liste des devis (décision du 05/11), avec le devis déjà envoyé ; Kanban/Liste/Archives, « + Devis », pas de « + Affaire »
  await ouvrir(page);
  await expect(page.locator('.page-liste-devis')).toBeVisible();
  await expect(page.locator('tr.ligne-devis[data-id="ancien"]')).toBeVisible();
  await auditer(page, 'arrivée');
  await capturer(page, info, '01-arrivee-liste-devis');

  // R1.2 Clients : créer une fiche Personne
  await cliquerMenu(page, 'crm/personnes');
  await surLaPage(page, /portail-devis\/crm\/personnes$/);
  await expect(page.getByText('Ajoute ton premier client, il suffit de son nom.')).toBeVisible();
  await auditer(page, 'clients vide');
  await capturer(page, info, '02-clients-vide');
  await page.locator('[data-action="nouvelle-personne"]').click();
  await expect(page.getByRole('dialog').getByText('Ajouter un client')).toBeVisible();
  await page.getByRole('dialog').getByRole('textbox', { name: 'Nom' }).fill('Marie Durand');
  await capturer(page, info, '03-clients-creation');
  await page.getByRole('dialog').getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.getByText('Client ajouté')).toBeVisible();
  await expect(page.getByText('Marie Durand').first()).toBeVisible();
  await auditer(page, 'clients');
  await capturer(page, info, '04-clients-liste');

  // R1.3 Catalogue : les articles sont là
  await cliquerMenu(page, 'devis/bordereau');
  await surLaPage(page, /portail-devis\/devis\/bordereau$/);
  await expect(page.getByText('Carrelage 60 x 60')).toBeVisible();
  await auditer(page, 'catalogue');
  await capturer(page, info, '05-catalogue');

  // R1.4 « + Devis » : client, deux lignes du catalogue, début et durée des travaux
  await cliquerMenu(page, 'devis/liste');
  await page.locator('[data-action="nouveau-devis"]').first().click();
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
  await surLaPage(page, /espace\/devisseul\/portail-devis\/devis\/editeur\//);
  await page.locator('[data-champ="client"]').click();
  await page.locator('[data-champ="client"]').fill('Marie');
  await page.locator('.entete-droite .suggestions:not([hidden]) .suggestion', { hasText: 'Marie Durand' }).first().click();
  await page.locator('[data-action="ajouter-famille-1"]').click();
  for (const mot of ARTICLES_DEVIS) {
    await page.locator('[data-champ="recherche-bordereau"]').fill(mot);
    await page.locator('[data-action="ajouter-article"]').first().click();
  }
  await poserDebutEtDuree(page);
  await attendreCalme(page);
  await expect(page.locator('[data-total="ht"]')).toContainText('96');
  await auditer(page, 'éditeur');
  await capturer(page, info, '06-devis-edition', { pleine: false });

  // R1.5 finaliser
  await (await ouvrirActionsEcran(page, 'Finaliser')).click();
  await capturer(page, info, '07-devis-finaliser-confirmation', { pleine: false });
  await page.getByRole('dialog').getByRole('button', { name: 'Finaliser', exact: true }).click();
  await surLaPage(page, /portail-devis\/devis\/voir\//);
  await expect(page.locator('[data-valeur="lecture-seule"]')).toContainText('Ce devis est finalisé');
  await attendreCalme(page);
  await auditer(page, 'devis finalisé');
  await capturer(page, info, '08-devis-finalise');

  // R1.6 « Préparer l'e-mail » : présent dans « Envoyer », grisé tant que l'espace n'est pas branché (message normal)
  await (await ouvrirActionsEcran(page, 'Envoyer')).click();
  const preparer = page.locator('.menu-pop').getByRole('menuitem', { name: /Préparer l’e-mail/ });
  await expect(preparer).toBeVisible();
  await expect(preparer).toBeDisabled();
  await capturer(page, info, '09-devis-envoyer-menu');
  await page.keyboard.press('Escape');

  // R1.7 marquer envoyé, puis signé
  await (await ouvrirActionsEcran(page, 'Devis envoyé')).click();
  await expect.poll(() => etat.appels.filter(([n]) => n === 'devisChangerStatut').length).toBe(1);
  await expect(page.locator('.badge-statut, [data-valeur="statut"]').first()).toContainText(/Envoy/);
  await capturer(page, info, '10-devis-envoye');
  await (await ouvrirActionsEcran(page, 'Devis signé')).click();
  await expect(page.getByRole('dialog')).toContainText('Marquer ce devis signé ?');
  await capturer(page, info, '10b-devis-signe-confirmation');
  await page.getByRole('dialog').getByRole('button', { name: /Marquer signé|Devis signé|Confirmer/ }).click();
  await expect.poll(() => etat.appels.filter(([n]) => n === 'devisChangerStatut').length).toBe(2);
  expect(etat.appels.filter(([n]) => n === 'devisChangerStatut').map(([, d]) => d.action)).toEqual(['marquer_envoye', 'accepter']);
  const relancesAvant = etat.appels.filter(([n]) => n === 'devisEnregistrerEnvoi').length; // « Devis envoyé » note l'envoi dans l'historique (1 appel)
  await expect(page.locator('.badge-statut, [data-valeur="statut"]').first()).toContainText(/sign/i);
  await capturer(page, info, '11-devis-signe');

  // R1.8 la liste : les deux devis, le signé de 96 € HT
  await cliquerMenu(page, 'devis/liste');
  await expect(page.locator('tr.ligne-devis, .carte-devis').first()).toBeVisible();
  await attendreCalme(page);
  await auditer(page, 'liste');
  await capturer(page, info, '12-liste-devis');

  // R1.9 Relances : le devis de 12 jours est à relancer ; « Préparer l'e-mail » grisé, « Relancé » enregistre
  await cliquerMenu(page, 'devis/relances');
  await expect(page.locator('.page-relances')).toBeVisible();
  await expect(carte(page, 'ancien').locator('.pastille-a-traiter')).toContainText(/À relancer · 12 j/);
  await expect(carte(page, 'ancien').locator('[data-action="preparer-email"]')).toBeDisabled();
  await auditer(page, 'relances');
  await capturer(page, info, '13-relances');
  await carte(page, 'ancien').locator('[data-action="relance"]').click();
  await expect(page.locator('.voile-dialogue')).toContainText('Relance envoyée ?');
  await page.locator('.voile-dialogue').getByRole('button', { name: 'Relancé', exact: true }).click();
  await expect.poll(() => etat.appels.filter(([n]) => n === 'devisEnregistrerEnvoi').length).toBe(relancesAvant + 1);
  await expect(page.locator('[data-bloc="deja-relances"] .ligne-relance[data-id="ancien"]')).toBeVisible();
  await capturer(page, info, '14-relances-apres-relance');

  // R1.10 Statistiques : CA signé 96 € HT, 1 signé sur 2 envoyés = 50 %
  await cliquerMenu(page, 'devis/statistiques');
  await expect(page.locator('.page-statistiques')).toBeVisible();
  await expect(page.locator('[data-chiffre="ca-signe"] .chiffre-valeur')).toContainText('96');
  await expect(page.locator('[data-chiffre="signes"] .chiffre-valeur')).toHaveText('1');
  await expect(page.locator('[data-chiffre="taux"] .chiffre-valeur')).toHaveText('50 %');
  await auditer(page, 'statistiques');
  await capturer(page, info, '15-statistiques');

  // R1.11 « Exporter mes données » (Réglages > Devis > Sauvegarde, dans le portail)
  await page.evaluate(() => { location.hash = '#/espace/devisseul/portail-devis/reglages'; });
  await expect(page.getByRole('heading', { name: 'Réglages', level: 1 })).toBeVisible();
  await attendreCalme(page);
  await ouvrirSectionReglages(page, 'Devis'); // Réglages > Modules > Devis
  const bouton = page.locator('[data-action="exporter-devis"]');
  await bouton.scrollIntoViewIfNeeded();
  await capturer(page, info, '16-reglages-export', { pleine: false });
  const [fichier] = await Promise.all([page.waitForEvent('download'), bouton.click()]);
  const contenu = JSON.parse(await readFile(await fichier.path(), 'utf8'));
  expect(JSON.stringify(contenu)).toContain('Marie Durand');
  expect(JSON.stringify(contenu)).toContain('DEV-2026-11-09-001');

  // R1.12 « Espace complet » : revient à l'espace du client, hors portail
  await ouvrirMenu(page);
  await page.locator('.menu').getByRole('link', { name: 'Espace complet' }).click();
  await expect(page).toHaveURL(/#\/espace\/devisseul(\/devis\/liste)?$/);
  await page.waitForLoadState('load'); // changer d'entrée recharge la page
  await expect(page.locator('.coquille')).toBeVisible();
  await expect(page.locator('.menu .menu-entree').first()).toBeVisible();
  await capturer(page, info, '17-espace-complet');
});

test('R2 arrivée et menu : la liste des devis à l\'arrivée, le menu (tiroir sur téléphone) a cinq entrées + « Espace complet »', async ({ page }, info) => {
  await devisAncien();
  await ouvrir(page);
  await expect(page.locator('.page-liste-devis')).toBeVisible();
  await expect(page).toHaveURL(/#\/espace\/devisseul\/portail-devis(\/devis\/liste)?$/);
  await ouvrirMenu(page);
  await expect(page.locator('.menu .menu-entree')).toHaveCount(6);
  await expect(page.locator('.menu [aria-current="page"]')).toHaveAttribute('data-chemin', 'devis/liste');
  await capturer(page, info, '18-menu', { pleine: false });
  if (estTelephone(page)) { await page.keyboard.press('Escape'); await expect(page.locator('.coquille.menu-ouvert')).toHaveCount(0); }
  await auditer(page, 'arrivée');
});
