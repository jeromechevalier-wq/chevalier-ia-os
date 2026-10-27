// Onglet « Devis » de la fiche d'une affaire. Un test par point du brief (le nom commence par le numéro du point). Captures dans tests/e2e/captures/devis-onglet-affaire/ (ordinateur ET téléphone).
// Les fonctions du serveur (devisPdfLien, devisPdf) n'existent pas dans l'émulateur du navigateur : elles sont SIMULÉES par page.route.
// Le vrai stockage (lien signé « attachment » de Firebase Storage) est impossible ici : l'adresse https est simulée avec l'en-tête content-disposition: attachment.
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, ecrireDocument, lireDocument, listerDocuments, creerOrganisation, creerAffaire, estTelephone, PROJET, FIRESTORE, URL_APP, JEROME } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-onglet-affaire/', import.meta.url));
async function capturer(page, info, nom) {
  await mkdir(DOSSIER, { recursive: true });
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled', fullPage: true }); // page entière : sur téléphone, la liste des devis est sous le résumé
}
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const URL_PDF = 'https://fichiers.test/devis.pdf';
const LIGNES = [{ id: 'l1', libelle: 'Carrelage', familleId: 'famille-1', type: 'fourniture', quantite: 10, unite: 'm²', prixAchat: 40, prixVente: 60, tauxTva: 20 }];
const IL_Y_A = (jours) => new Date(Date.now() - jours * 86400000);

async function devis(id, valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument(`devis_devis/${id}`, {
    racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', personneId: null, organisationId: 'o1', modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: '2099-12-31', objet: 'Rénovation restaurant',
    destinataires: ['contact@exemple.fr'], sections: [{ id: 's1', titre: 'Cuisine', lignes: LIGNES }],
    creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant, ...valeurs,
  });
}
const FINALISE = { numero: 'DEV-2026-10-02-001', statut: 'en_attente_envoi', finaliseLe: IL_Y_A(5), dateEmission: '2026-10-02', totaux: { ht: 600, ttc: 720 } };
const PDF_OK = { statut: 'ok', chemin: 'devis/a1/d.pdf', nom: 'Devis DEV-2026-10-02-001.pdf', tentatives: 1 };

async function base() {
  await creerOrganisation('o1', { nom: 'M. Paul Exemple' });
  await creerAffaire('a1', { titre: 'Rénovation cuisine', organisationId: 'o1' });
  await creerAffaire('a2', { titre: 'Autre chantier', organisationId: 'o1' });
}
async function donneesDeuxDevis() {
  await base();
  await devis('dBrouillon', { objet: 'Cuisine, variante basse', creeLe: IL_Y_A(1) });
  await devis('dOk', { ...FINALISE, objet: 'Cuisine complète', creeLe: IL_Y_A(6), pdf: PDF_OK });
}

/** Faux serveur. `reponses.pdfLien(corps)` -> { statut, corps } ; par défaut un lien https. `appels` reçoit [nom, données]. */
async function simulerServeur(page, appels, reponses = {}) {
  await page.context().route(`${new URL(URL_PDF).origin}/**`, (route) => route.fulfill({ status: 200, headers: { 'content-type': 'application/pdf', 'content-disposition': 'attachment; filename="Devis.pdf"' }, body: '%PDF-1.4' }));
  const repondre = async (route, nom, calcul) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const donneesAppel = JSON.parse(route.request().postData()).data;
    appels.push([nom, donneesAppel]);
    const r = await calcul(donneesAppel);
    return route.fulfill({ status: r.statut, headers: cors, body: JSON.stringify(r.corps) });
  };
  await page.route('**/devisPdfLien', (route) => repondre(route, 'devisPdfLien', async (d) => (reponses.pdfLien?.(d) ?? { statut: 200, corps: { result: { url: URL_PDF, expireDans: 300, nom: 'Devis.pdf' } } })));
  await page.route('**/devisPdf', (route) => repondre(route, 'devisPdf', async (d) => {
    await ecrireDocument(`devis_devis/${d.devisId}`, { pdf: PDF_OK });
    return { statut: 200, corps: { result: { statut: 'ok', lien: `https://chevalier-ia-os.web.app/#/devis/pdf/${d.devisId}`, nom: 'Devis' } } };
  }));
}
const erreurServeur = (statut, code, message) => ({ statut, corps: { error: { status: code, message } } });

async function ouvrirAffaire(page, id = 'a1') {
  await connecter(page, undefined, { route: `crm/affaires/${id}` });
  await expect(page.locator('.compositeur')).toBeVisible();
  await attendreCalme(page);
}
async function ouvrirOnglet(page) {
  const onglet = page.locator('.compositeur [data-onglet="devis"]');
  await expect(onglet).toBeVisible();
  if ((await onglet.getAttribute('aria-selected')) !== 'true') await onglet.click();
  const panneau = page.locator('.compositeur [role="tabpanel"][aria-label="Devis"]');
  await expect(panneau).toBeVisible();
  return panneau;
}
const sansDebordement = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

// ------------------------------------------------------------------ point 1 : module éteint = pas d'onglet

test.describe('1 module éteint', () => {
  async function chargerRegles(fichier) {
    const contenu = await readFile(fileURLToPath(new URL(`../../${fichier}`, import.meta.url)), 'utf8');
    const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: fichier, content: contenu }] } }) });
    if (!r.ok) throw new Error(`Règles non chargées (${fichier}) : ${await r.text()}`);
  }
  test.beforeAll(() => chargerRegles('firestore.plateforme.rules'));
  test.afterAll(() => chargerRegles('firestore.rules'));

  test('1 chez un client dont le module Devis est éteint, la fiche d’une affaire n’a pas d’onglet « Devis »', async ({ page }, info) => {
    const ALICE = 'alice@exemple.test';
    const maintenant = new Date();
    const b = { proprietaire: ALICE, creeLe: maintenant, modifieLe: maintenant, creePar: ALICE, modifiePar: ALICE };
    await ecrireDocument('marques/studio', { actif: true, nom: 'Studio Lune', couleur: '#336699', accueil: 'Bienvenue.' });
    await ecrireDocument('clients/studio', { modules: { affaires: true }, equipe: [{ email: ALICE, role: 'editeur' }] });
    await ecrireDocument(`clients/studio/membres/${ALICE}`, { role: 'editeur' });
    await ecrireDocument('clients/studio/crm_affaires/a1', { titre: 'Audit du lac', personneId: null, organisationId: null, etape: 'etape_3', statut: 'ouverte', priorite: 'tiede', montant: 1200, offreId: null, dureeJours: null, source: '', besoin: '', dateEntreeEtape: maintenant, datesEtapes: {}, raisonPerdue: '', raisonPerdueDetail: '', dateReveil: null, encaissements: [], documents: [], projetId: null, archive: false, ...b });
    await page.goto('about:blank');
    await page.goto(`${URL_APP}#/espace/studio/crm/affaires/a1`);
    await page.waitForFunction(() => !!window.__chevalierTest);
    await page.evaluate((e) => window.__chevalierTest.connecter(e, true), ALICE);
    await expect(page.locator('.compositeur')).toBeVisible();
    await attendreCalme(page);
    await expect(page.locator('.compositeur [role="tab"]')).toHaveText([/Activité/, /Notes/, /Documents/]);
    await expect(page.locator('[data-onglet="devis"]')).toHaveCount(0);
    await capturer(page, info, '1-module-eteint');
  });
});

// ------------------------------------------------------------------ point 2 : le contenu

test('2 module actif : onglet « Devis » en dernier avec le compteur 2, devis du plus récent au plus ancien, statut, total TTC, date, nom cliquable et aucun bouton', async ({ page }, info) => {
  await donneesDeuxDevis();
  await ouvrirAffaire(page);
  await expect(page.locator('.compositeur [role="tab"]')).toHaveText([/Activité/, /Notes/, /Documents/, /Devis/]);
  await expect(page.locator('.compositeur [data-onglet="devis"] .compteur')).toHaveText('2');
  const panneau = await ouvrirOnglet(page);
  const lignes = panneau.locator('[data-liste="devis-affaire"] > li');
  await expect(lignes).toHaveCount(2);
  const brouillon = lignes.nth(0);
  const finalise = lignes.nth(1);
  await expect(brouillon).toHaveAttribute('data-devis', 'dBrouillon');
  await expect(brouillon.locator('[data-action="voir-devis"]')).toHaveText(/^Brouillon – Cuisine, variante basse$/);
  await expect(brouillon.locator('[data-valeur="statut"]')).toHaveText('Brouillon');
  await expect(brouillon.locator('[data-valeur="ttc"]')).toHaveText(/\d.*€ TTC/);
  await expect(finalise).toHaveAttribute('data-devis', 'dOk');
  await expect(finalise.locator('[data-action="voir-devis"]')).toHaveText(/^DEV-2026-10-02-001/);
  await expect(finalise.locator('[data-valeur="statut"]')).not.toHaveText('Brouillon');
  await expect(finalise.locator('[data-valeur="ttc"]')).toHaveText(/^720,00\s*€ TTC$/);
  await expect(finalise.locator('[data-valeur="date"]')).toHaveText('02/10/2026');
  await expect(finalise.locator('[data-pdf]')).toHaveCount(0); // PDF prêt : rien à signaler, le PDF s'ouvre depuis le devis
  await expect(finalise.getByRole('link', { name: 'Voir le devis DEV-2026-10-02-001' })).toBeVisible();
  await expect(panneau.locator('.ligne-lien a.bouton, .ligne-lien button')).toHaveCount(0); // comme l'onglet Documents : un nom cliquable, pas de boutons
  await expect(page.locator('.bouton-principal:visible')).toHaveCount(1); // un seul bouton jaune : « Créer un devis » / « Voir le devis » de l'en-tête (« + Ajouter » est un texte jaune)
  await capturer(page, info, '2-onglet-devis');
});

// ------------------------------------------------------------------ points 3 et 4 : cas vide et chargement

test('3 cas vide : « Aucun devis pour cette affaire. » et la ligne « Devis + Ajouter », compteur 0', async ({ page }, info) => {
  await base();
  await ouvrirAffaire(page);
  await expect(page.locator('.compositeur [data-onglet="devis"] .compteur')).toHaveText('0');
  const panneau = await ouvrirOnglet(page);
  await expect(panneau.locator('[data-role="aucun-devis"]')).toHaveText('Aucun devis pour cette affaire.');
  await expect(panneau.locator('[data-action="ajouter-devis"]')).toHaveAccessibleName('Ajouter un devis');
  await capturer(page, info, '3-cas-vide');
});

test('4 chargement : « Chargement des devis… » sans compteur, puis l’erreur de lecture au-dessus des lignes déjà connues', async ({ page }, info) => {
  await donneesDeuxDevis();
  await ouvrirAffaire(page);
  const panneau = await ouvrirOnglet(page);
  await expect(panneau.locator('[data-liste="devis-affaire"] > li')).toHaveCount(2);
  const forcer = (pret, erreur) => page.evaluate(async ([p, e]) => {
    const D = await import('/js/modules/devis/donnees.js');
    const { signaler } = await import('/js/modules/crm/pastilles-externes.js');
    D.etat.devisPrets = p; D.etat.erreurLectureDevis = e; signaler();
  }, [pret, erreur]);
  await forcer(false, false); // les devis ne sont pas encore lus
  await expect(panneau.locator('[data-etat="chargement"]')).toHaveText('Chargement des devis…');
  await expect(page.locator('.compositeur [data-onglet="devis"] .compteur')).toHaveCount(0);
  await expect(panneau.locator('[data-liste="devis-affaire"]')).toHaveCount(0);
  await capturer(page, info, '4-chargement');
  await forcer(true, true); // lecture en erreur : les lignes connues restent
  await expect(panneau.locator('[data-erreur="lecture-devis"]')).toHaveText('Les devis n’ont pas pu être chargés. Recharge la page.');
  await expect(panneau.locator('[data-liste="devis-affaire"] > li')).toHaveCount(2);
  await capturer(page, info, '4-erreur-lecture');
});

// ------------------------------------------------------------------ point 5 : état du PDF

test('5 PDF en cours de fabrication, puis PDF non rangé avec réessai', async ({ page }, info) => {
  await base();
  await devis('dEnCours', { ...FINALISE, numero: 'DEV-2026-10-02-003', creeLe: IL_Y_A(1), pdf: { statut: 'en_cours', demarreLe: new Date(), tentatives: 1 } });
  await devis('dEchec', { ...FINALISE, numero: 'DEV-2026-10-02-002', creeLe: IL_Y_A(2), pdf: { statut: 'echec', message: 'Le moteur du PDF ne répond pas.', tentatives: 3 } });
  const appels = [];
  await simulerServeur(page, appels);
  await ouvrirAffaire(page);
  const panneau = await ouvrirOnglet(page);
  await expect(panneau.locator('[data-devis="dEnCours"] [data-pdf="en_cours"]')).toHaveText('PDF en cours de fabrication');
  const echec = panneau.locator('[data-devis="dEchec"] [data-pdf="non_range"]');
  await expect(echec).toContainText('PDF non rangé');
  await capturer(page, info, '5-pdf-en-cours-et-non-range');
  await echec.click();
  await expect.poll(() => appels.filter((a) => a[0] === 'devisPdf').length).toBe(1);
  await expect(panneau.locator('[data-devis="dEchec"] [data-pdf]')).toHaveCount(0); // le serveur (simulé) a rangé le PDF : plus d'avertissement
});

// ------------------------------------------------------------------ point 6 : Ouvrir le PDF

test('6 le nom du devis est un lien : brouillon vers l’éditeur, devis finalisé vers sa visualisation', async ({ page }) => {
  await donneesDeuxDevis();
  await simulerServeur(page, []);
  await ouvrirAffaire(page);
  const panneau = await ouvrirOnglet(page);
  await expect(panneau.locator('[data-devis="dOk"] [data-action="voir-devis"]')).toHaveAttribute('href', /#\/devis\/voir\/dOk$/);
  await expect(panneau.locator('[data-devis="dBrouillon"] [data-action="voir-devis"]')).toHaveAttribute('href', /#\/devis\/editeur\/dBrouillon$/);
  await panneau.locator('[data-devis="dOk"] [data-action="voir-devis"]').click();
  await expect(page).toHaveURL(/#\/devis\/voir\/dOk$/);
});

// ------------------------------------------------------------------ points 7 et 8 : Télécharger (sur l'écran du PDF)

test('7 sur l’écran du PDF, « Télécharger » demande un lien signé en pièce jointe (telecharger: true) et enregistre le fichier sans quitter la page', async ({ page }, info) => {
  await donneesDeuxDevis();
  const appels = [];
  await simulerServeur(page, appels);
  await ouvrirAffaire(page);
  await page.goto('/?emulateurs=1#/devis/pdf/dOk');
  const bouton = page.locator('[data-action="telecharger-pdf"]');
  await expect(bouton).toBeVisible();
  const adresseAvant = page.url();
  const telechargement = page.waitForEvent('download');
  await bouton.click();
  const fichier = await telechargement;
  expect(fichier.suggestedFilename()).toBe('Devis.pdf');
  expect(appels.filter((a) => a[0] === 'devisPdfLien').at(-1)).toEqual(['devisPdfLien', { devisId: 'dOk', telecharger: true }]);
  expect(page.url()).toBe(adresseAvant);
  await expect(bouton).toBeEnabled();
  await capturer(page, info, '7-apres-telechargement');
});

test('8 échec de « Télécharger » : message d’erreur et bouton de nouveau actif', async ({ page }, info) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues' });
  await donneesDeuxDevis();
  const appels = [];
  await simulerServeur(page, appels, {
    pdfLien: (d) => (d.telecharger ? erreurServeur(500, 'INTERNAL', 'Le serveur a eu un souci. Réessaie.') : undefined),
  });
  await ouvrirAffaire(page);
  await page.goto('/?emulateurs=1#/devis/pdf/dOk');
  const bouton = page.locator('[data-action="telecharger-pdf"]');
  await bouton.click();
  await expect(page.locator('.toast-erreur')).toContainText('Ça n’a pas abouti');
  await expect(bouton).toBeEnabled();
  await capturer(page, info, '8-erreur-telechargement');
});

// ------------------------------------------------------------------ point 9 : quels devis

test('9 un devis d’une AUTRE affaire n’apparaît pas, un archivé non plus, un « Remplacé » oui', async ({ page }, info) => {
  await base();
  await devis('dActuel', { ...FINALISE, numero: 'DEV-2026-10-02-002', version: 2, statut: 'envoye', creeLe: IL_Y_A(1), pdf: PDF_OK });
  await devis('dRemplace', { ...FINALISE, numero: 'DEV-2026-10-02-002', version: 1, statut: 'remplace', creeLe: IL_Y_A(8), pdf: PDF_OK });
  await devis('dArchive', { ...FINALISE, numero: 'DEV-2026-09-01-001', archive: true, creeLe: IL_Y_A(40), pdf: PDF_OK });
  await devis('dAutre', { ...FINALISE, numero: 'DEV-2026-10-03-001', affaireId: 'a2', creeLe: IL_Y_A(2), pdf: PDF_OK });
  await ouvrirAffaire(page);
  const panneau = await ouvrirOnglet(page);
  await expect(panneau.locator('[data-liste="devis-affaire"] > li')).toHaveCount(2);
  await expect(panneau.locator('[data-devis="dActuel"] [data-action="voir-devis"]')).toHaveText(/^DEV-2026-10-02-002 v2/);
  await expect(panneau.locator('[data-devis="dRemplace"] [data-valeur="statut"]')).toHaveText('Remplacé');
  await expect(panneau.locator('[data-devis="dArchive"], [data-devis="dAutre"]')).toHaveCount(0);
  await expect(page.locator('.compositeur [data-onglet="devis"] .compteur')).toHaveText('2');
  await capturer(page, info, '9-remplace-montre');
  await page.evaluate(() => { location.hash = '#/crm/affaires/a2'; }); // l'autre affaire a son propre élément et son propre compteur
  await attendreCalme(page);
  await expect(page.locator('.compositeur [data-onglet="devis"] .compteur')).toHaveText('1');
});

// ------------------------------------------------------------------ point 10 : + Ajouter

test('10 « Devis + Ajouter » crée un brouillon sur CETTE affaire (client repris) et ouvre l’éditeur', async ({ page }, info) => {
  await base();
  await ouvrirAffaire(page);
  const panneau = await ouvrirOnglet(page);
  await panneau.locator('[data-action="ajouter-devis"]').click();
  await expect(page).toHaveURL(/#\/devis\/editeur\/[^/]+$/);
  await expect(page.locator('.page-editeur-devis')).toBeVisible();
  const crees = await listerDocuments('devis_devis');
  expect(crees).toHaveLength(1);
  expect(crees[0]).toMatchObject({ affaireId: 'a1', organisationId: 'o1', statut: 'brouillon' });
  expect(page.url()).toContain(crees[0].id);
  await capturer(page, info, '10-editeur-ouvert');
});

// ------------------------------------------------------------------ points 11 et 12 : téléphone et aucune suppression

test('11 chaque ligne tient sans débordement horizontal, les quatre onglets sont visibles, les cibles font au moins 44 px sur téléphone', async ({ page }, info) => {
  await donneesDeuxDevis();
  await devis('dLong', { ...FINALISE, numero: 'DEV-2026-10-02-009', objet: 'Rénovation complète de la cuisine et de la salle de restauration, avec reprise des réseaux', creeLe: IL_Y_A(3), pdf: { statut: 'echec', tentatives: 3 } });
  await ouvrirAffaire(page);
  const panneau = await ouvrirOnglet(page);
  await expect(panneau.locator('[data-liste="devis-affaire"] > li')).toHaveCount(3);
  expect(await sansDebordement(page)).toBe(true);
  const barre = await page.locator('.compositeur .onglets').boundingBox();
  const onglet = await page.locator('.compositeur [data-onglet="devis"]').boundingBox();
  expect(onglet.x + onglet.width).toBeLessThanOrEqual(barre.x + barre.width + 1); // « Devis » est visible dans la barre, sans la faire défiler
  const [contenu, visible] = await page.locator('.compositeur .onglets').evaluate((el) => [el.scrollWidth, el.clientWidth]);
  expect(contenu, `la barre d’onglets déborde (contenu ${contenu} px, visible ${visible} px)`).toBeLessThanOrEqual(visible + 1);
  await page.locator('.compositeur .onglets').scrollIntoViewIfNeeded();
  const zone = await panneau.boundingBox();
  for (const b of await panneau.locator('.ligne-lien .pdf-non-range, [data-action="ajouter-devis"]').all()) {
    const m = await b.boundingBox();
    expect(m.x + m.width).toBeLessThanOrEqual(zone.x + zone.width + 1);
    if (estTelephone(page)) expect(m.height).toBeGreaterThanOrEqual(43.5);
  }
  for (const champ of await page.locator('.compositeur input, .compositeur textarea').all()) {
    if (await champ.isVisible()) expect(Number.parseFloat(await champ.evaluate((el) => getComputedStyle(el).fontSize))).toBeGreaterThanOrEqual(estTelephone(page) ? 16 : 0);
  }
  await capturer(page, info, '11-lignes-et-onglets');
});

test('12 aucune action de suppression dans l’onglet : ni bouton, ni menu', async ({ page }) => {
  await donneesDeuxDevis();
  await ouvrirAffaire(page);
  const panneau = await ouvrirOnglet(page);
  await expect(panneau.getByRole('button', { name: /supprim|retirer|archiv|corbeille/i })).toHaveCount(0);
  await expect(panneau.getByRole('link', { name: /supprim|retirer|archiv|corbeille/i })).toHaveCount(0);
  await expect(panneau.locator('[aria-haspopup="menu"], .bouton-icone')).toHaveCount(0);
  await expect(panneau.locator('.ligne-lien a.bouton, .ligne-lien button')).toHaveCount(0);
});
