// Onglet « Documents » des fiches affaire et projet : fichiers rangés chez nous (Cloud Storage), déposés par l'écran. Un test par point (le nom commence par le numéro du point).
// Captures dans tests/e2e/captures/documents-stockes/ (ordinateur ET téléphone). Le serveur (documentDeposer, documentLien, documentSupprimer) n'existe pas dans l'émulateur du navigateur :
// il est SIMULÉ par page.route, et il écrit la fiche dans Firestore comme le vrai. Le vrai stockage (Cloud Storage) est impossible ici : rien n'est vérifié avec le vrai système.
import { readFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  test, expect, connecter, attendreCalme, ecrireDocument, lireDocument, listerDocuments, creerAffaire, creerProjet, allerAuxReglagesCrm, JEROME, PROJET, FIRESTORE, URL_APP,
} from './outils.js';
import { brancherGoogle } from './google-simule.js';

// Le navigateur de test n'atteint pas apis.google.com (l'onglet G-Drive le charge à l'avance) : Google est simulé.
test.beforeEach(async ({ context }) => { await brancherGoogle(context); });

const DOSSIER = fileURLToPath(new URL('./captures/documents-stockes/', import.meta.url));
async function capturer(page, info, nom) {
  await mkdir(DOSSIER, { recursive: true });
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled', fullPage: true });
}
const cors = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST, OPTIONS' };
const URL_FICHIER = 'https://stockage.exemple.test/fichier-essai';
const PDF = Buffer.from('%PDF-1.4\n1 0 obj<<>>endobj\n%%EOF');
const IL_Y_A = (heures) => new Date(Date.now() - heures * 3600_000);

/** Une fiche de fichier, comme la écrit le serveur. */
async function fiche(id, valeurs = {}) {
  await ecrireDocument(`documents_stockes/${id}`, {
    cibleType: 'affaire', cibleId: 'a1', nom: 'Plan.pdf', typeMime: 'application/pdf', taille: 2048, chemin: `documents/affaire/a1/00000000-0000-4000-8000-000000000000-${id}.pdf`,
    creeLe: IL_Y_A(2), creePar: JEROME, supprimeLe: null, ...valeurs,
  });
}

/**
 * Faux serveur. `appels` reçoit [nom, données]. `reponses` : { depot?: (corps) => { statut, corps }, delaiDepot?: ms }.
 * Le dépôt écrit la fiche (comme le vrai) ; la suppression y pose `supprimeLe` ; le lien rend une adresse https de stockage simulée.
 */
async function simulerServeur(page, appels, reponses = {}) {
  await page.context().route('https://stockage.exemple.test/**', (route) => route.fulfill({ status: 200, headers: { 'content-type': 'application/pdf' }, body: '%PDF-1.4' }));
  let n = 0;
  const repondre = async (route, nom, calcul) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const donnees = JSON.parse(route.request().postData()).data;
    appels.push([nom, donnees]);
    const r = await calcul(donnees);
    return route.fulfill({ status: r.statut, headers: cors, body: JSON.stringify(r.corps) });
  };
  await page.route('**/documentDeposer', (route) => repondre(route, 'documentDeposer', async (d) => {
    if (reponses.delaiDepot) await new Promise((r) => setTimeout(r, reponses.delaiDepot));
    if (reponses.depot) return reponses.depot(d);
    n += 1;
    const cibleType = d.affaireId ? 'affaire' : 'projet';
    const id = `nouveau-${n}`;
    await fiche(id, { cibleType, cibleId: d.affaireId ?? d.projetId, nom: d.nom, taille: Buffer.from(d.contenuBase64, 'base64').length, creeLe: new Date() });
    return { statut: 200, corps: { result: { id, nom: d.nom, taille: 10, typeMime: 'application/pdf' } } };
  }));
  await page.route('**/documentLien', (route) => repondre(route, 'documentLien', async () => ({ statut: 200, corps: { result: { url: URL_FICHIER, expireDans: 300, nom: 'Plan.pdf' } } })));
  await page.route('**/documentSupprimer', (route) => repondre(route, 'documentSupprimer', async (d) => {
    const actuel = await lireDocument(`documents_stockes/${d.documentId}`);
    await ecrireDocument(`documents_stockes/${d.documentId}`, { ...actuel, supprimeLe: new Date(), supprimePar: JEROME });
    return { statut: 200, corps: { result: { id: d.documentId, nom: actuel.nom } } };
  }));
}
const erreurServeur = (statut, code, message) => ({ statut, corps: { error: { status: code, message } } });

async function ouvrirAffaire(page) {
  await creerAffaire('a1', { titre: 'Rénovation cuisine' });
  await connecter(page);
  await page.goto(`${URL_APP}#/crm/affaires/a1`);
  await expect(page.locator('.compositeur')).toBeVisible();
  await attendreCalme(page);
}
async function ouvrirOnglet(page) {
  const onglet = page.locator('.compositeur [data-onglet="fichiers"]');
  await expect(onglet).toBeVisible();
  if ((await onglet.getAttribute('aria-selected')) !== 'true') await onglet.click();
  const panneau = page.locator('.compositeur [role="tabpanel"][aria-label="Documents"]');
  await expect(panneau).toBeVisible();
  return panneau;
}
const champ = (page) => page.locator('[data-role="champ-fichier"]');
const sansDebordement = (page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1);

test('1 l’onglet « Documents » est sur la fiche d’une affaire ET sur celle d’un projet, après les autres onglets, avec son compteur', async ({ page }, info) => {
  await fiche('f1');
  await fiche('f2', { cibleType: 'projet', cibleId: 'pr1', nom: 'Contrat.pdf' });
  await creerProjet('pr1', { titre: 'Refonte site' });
  await ouvrirAffaire(page);
  const onglets = page.locator('.compositeur [role="tab"]');
  await expect(onglets.last()).toContainText('Documents');
  await expect(page.locator('.compositeur [data-onglet="documents"]')).toContainText('G-Drive'); // l'onglet Google Drive n'est pas touché
  await expect(page.locator('.compositeur [data-onglet="fichiers"] .compteur')).toHaveText('1');
  expect(await sansDebordement(page)).toBe(true);
  const barre = await page.locator('.compositeur [role="tablist"]').evaluate((el) => ({ sw: el.scrollWidth, cw: el.clientWidth }));
  expect(barre.sw).toBeLessThanOrEqual(barre.cw + 1); // téléphone compris : la barre d'onglets ne déborde pas
  await ouvrirOnglet(page);
  await capturer(page, info, '1-onglet-affaire');
  await page.goto(`${URL_APP}#/projets/projets/pr1`);
  await expect(page.locator('.compositeur')).toBeVisible();
  await attendreCalme(page);
  await expect(page.locator('.compositeur [role="tab"]').last()).toContainText('Documents');
  await expect(page.locator('.compositeur [data-onglet="fichiers"] .compteur')).toHaveText('1');
  await ouvrirOnglet(page);
  await expect(page.locator('[data-fichier="f2"]')).toContainText('Contrat.pdf');
  await expect(page.locator('[data-fichier="f1"]')).toHaveCount(0); // les fichiers de l'affaire ne sont pas ceux du projet
  await capturer(page, info, '1-onglet-projet');
});

test('2 déposer un fichier : barre de progression pendant l’envoi, appel du serveur avec le contenu, puis le fichier apparaît dans la liste', async ({ page }, info) => {
  const appels = [];
  await ouvrirAffaire(page);
  await simulerServeur(page, appels, { delaiDepot: 1200 });
  await ouvrirOnglet(page);
  await champ(page).setInputFiles({ name: 'Plan cuisine é.pdf', mimeType: 'application/pdf', buffer: PDF });
  const envoi = page.locator('[data-role="envoi-fichier"]');
  await expect(envoi).toBeVisible();
  await expect(envoi.locator('progress')).toBeVisible();
  await capturer(page, info, '2-envoi-en-cours');
  await expect(page.locator('[data-fichier]')).toHaveCount(1);
  await expect(page.locator('[data-fichier]')).toContainText('Plan cuisine é.pdf');
  await expect(envoi).toHaveCount(0);
  expect(appels).toHaveLength(1);
  expect(appels[0][0]).toBe('documentDeposer');
  expect(appels[0][1]).toMatchObject({ affaireId: 'a1', nom: 'Plan cuisine é.pdf', typeMime: 'application/pdf' });
  expect(Buffer.from(appels[0][1].contenuBase64, 'base64').equals(PDF)).toBe(true);
  expect(appels[0][1].client).toBeUndefined(); // chez Jérôme, aucun espace
  await expect(page.locator('.compositeur [data-onglet="fichiers"] .compteur')).toHaveText('1');
  await capturer(page, info, '2-apres-depot');
});

test('3 la liste va du plus récent au plus ancien et montre l’icône, le nom, la taille, la date et qui a déposé le fichier ; un fichier en corbeille n’y est pas', async ({ page }, info) => {
  await fiche('vieux', { nom: 'Ancien devis.pdf', creeLe: IL_Y_A(72), taille: 1536 });
  await fiche('recent', { nom: 'Photo chantier.png', creeLe: IL_Y_A(1), taille: 3 * 1024 * 1024, creePar: 'charles@exemple.test' });
  await fiche('milieu', { nom: 'Note.txt', creeLe: IL_Y_A(24), taille: 300 });
  await fiche('corbeille', { nom: 'Supprimé.pdf', supprimeLe: IL_Y_A(1) });
  await ouvrirAffaire(page);
  await ouvrirOnglet(page);
  const lignes = page.locator('.ligne-fichier');
  await expect(lignes).toHaveCount(3);
  await expect(lignes.nth(0)).toContainText('Photo chantier.png');
  await expect(lignes.nth(1)).toContainText('Note.txt');
  await expect(lignes.nth(2)).toContainText('Ancien devis.pdf');
  await expect(lignes.nth(0).locator('.fichier-meta')).toContainText('3,0 Mo');
  await expect(lignes.nth(0).locator('.fichier-meta')).toContainText('charles@exemple.test');
  await expect(lignes.nth(2).locator('.fichier-meta')).toContainText('2 Ko');
  await expect(lignes.nth(0).locator('svg').first()).toBeVisible();
  await expect(page.getByText('Supprimé.pdf')).toHaveCount(0);
  await capturer(page, info, '3-liste');
});

test('4 un clic sur le nom ouvre le fichier dans un nouvel onglet par un lien signé demandé au serveur', async ({ page }) => {
  const appels = [];
  await fiche('f1');
  await ouvrirAffaire(page);
  await simulerServeur(page, appels);
  await ouvrirOnglet(page);
  const [popup] = await Promise.all([page.waitForEvent('popup'), page.locator('[data-fichier="f1"] [data-action="ouvrir-fichier"]').click()]);
  expect(popup).toBeTruthy();
  await expect.poll(() => appels.length).toBe(1);
  expect(appels[0]).toEqual(['documentLien', { documentId: 'f1' }]);
});

test('5 retirer un fichier : fenêtre de confirmation ; « Annuler » ne supprime rien ; « Retirer » met le fichier à la corbeille', async ({ page }, info) => {
  const appels = [];
  await fiche('f1');
  await fiche('f2', { nom: 'Autre.pdf', creeLe: IL_Y_A(5) });
  await ouvrirAffaire(page);
  await simulerServeur(page, appels);
  await ouvrirOnglet(page);
  await page.locator('[data-fichier="f1"] [data-action="retirer-fichier"]').click();
  const dialogue = page.getByRole('dialog');
  await expect(dialogue).toContainText('« Plan.pdf » va dans la corbeille');
  await expect(dialogue).toContainText('journal des modifications peut le restaurer');
  await capturer(page, info, '5-confirmation');
  await dialogue.getByRole('button', { name: 'Annuler' }).click();
  await expect(dialogue).toHaveCount(0);
  expect(appels).toHaveLength(0);
  await expect(page.locator('.ligne-fichier')).toHaveCount(2);
  await page.locator('[data-fichier="f1"] [data-action="retirer-fichier"]').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Retirer' }).click();
  await expect(page.locator('.ligne-fichier')).toHaveCount(1);
  await expect(page.locator('[data-fichier="f1"]')).toHaveCount(0);
  expect(appels).toEqual([['documentSupprimer', { documentId: 'f1' }]]);
  expect((await lireDocument('documents_stockes/f1')).supprimeLe).toBeTruthy(); // la fiche reste (corbeille logique) : le journal peut la restaurer
  await capturer(page, info, '5-apres-retrait');
});

test('6 cas vide : « Aucun fichier » avec une phrase d’aide, le bouton d’ajout et la taille maximale', async ({ page }, info) => {
  await ouvrirAffaire(page);
  const panneau = await ouvrirOnglet(page);
  await expect(panneau.locator('[data-role="aucun-fichier"]')).toContainText('Aucun fichier');
  await expect(panneau.locator('[data-role="aucun-fichier"]')).toContainText('visibles de toute l’équipe');
  await expect(panneau.getByRole('button', { name: 'Ajouter un fichier' })).toBeVisible();
  await expect(panneau.locator('[data-role="aide-fichiers"]')).toContainText('Taille maximale : 20 Mo');
  await expect(page.locator('.compositeur [data-onglet="fichiers"] .compteur')).toHaveText('0');
  await capturer(page, info, '6-cas-vide');
});

test('7 erreur de type ou de taille : refusée tout de suite, avec un message clair, sans appel au serveur', async ({ page }, info) => {
  const appels = [];
  await ouvrirAffaire(page);
  await simulerServeur(page, appels);
  await ouvrirOnglet(page);
  await champ(page).setInputFiles({ name: 'virus.exe', mimeType: 'application/x-msdownload', buffer: Buffer.from('MZ') });
  await expect(page.locator('[data-role="erreur-fichier"]')).toContainText('« virus.exe »');
  await expect(page.locator('[data-role="erreur-fichier"]')).toContainText('ne sont pas acceptés');
  await champ(page).setInputFiles({ name: 'page.html', mimeType: 'text/html', buffer: Buffer.from('<p>x</p>') });
  await expect(page.locator('[data-role="erreur-fichier"]')).toContainText('page.html');
  await champ(page).setInputFiles({ name: 'faux.pdf', mimeType: 'text/html', buffer: Buffer.from('x') });
  await expect(page.locator('[data-role="erreur-fichier"]')).toContainText('ne correspond pas');
  await champ(page).setInputFiles({ name: 'gros.pdf', mimeType: 'application/pdf', buffer: Buffer.concat([PDF, Buffer.alloc(21 * 1024 * 1024)]) });
  await expect(page.locator('[data-role="erreur-fichier"]')).toContainText(/envoi direct n.est pas encore disponible/);
  await capturer(page, info, '7-erreur-taille');
  expect(appels).toHaveLength(0);
  await expect(page.locator('.ligne-fichier')).toHaveCount(0);
});

test('8 erreur du serveur (contenu refusé, panne) : le message du serveur est affiché, rien n’apparaît dans la liste', { annotation: { type: 'erreurs-reseau-attendues', description: 'réponses d’erreur simulées' } }, async ({ page }, info) => {
  const appels = [];
  await ouvrirAffaire(page);
  await simulerServeur(page, appels, { depot: () => erreurServeur(400, 'INVALID_ARGUMENT', 'Le contenu du fichier ne correspond pas à son extension .pdf : il est refusé.') });
  await ouvrirOnglet(page);
  await champ(page).setInputFiles({ name: 'Plan.pdf', mimeType: 'application/pdf', buffer: PDF });
  await expect(page.locator('[data-role="erreur-fichier"]')).toContainText('ne correspond pas à son extension');
  await expect(page.locator('[data-role="envoi-fichier"]')).toHaveCount(0);
  await expect(page.locator('.ligne-fichier')).toHaveCount(0);
  await capturer(page, info, '8-erreur-serveur');
});

test('10 un seul bouton jaune sur l’écran : « Ajouter un fichier » est discret, le jaune plein reste à l’action de l’en-tête', async ({ page }) => {
  await fiche('f1');
  await ouvrirAffaire(page);
  const panneau = await ouvrirOnglet(page);
  await expect(panneau.getByRole('button', { name: 'Ajouter un fichier' })).not.toHaveClass(/bouton-principal/);
  const jaunes = await page.locator('.bouton-principal:visible:not([disabled])').count();
  expect(jaunes).toBe(1); // « Créer un devis » de l'en-tête, seul jaune plein
});

test('11 le glisser-déposer d’un fichier sur l’onglet le dépose comme le sélecteur', async ({ page }) => {
  const appels = [];
  await ouvrirAffaire(page);
  await simulerServeur(page, appels);
  const panneau = await ouvrirOnglet(page);
  const cible = page.locator('.fichiers-onglet');
  await expect(cible).toBeVisible();
  await cible.evaluate((el) => {
    const don = new DataTransfer();
    don.items.add(new File(['%PDF-1.4\n%%EOF'], 'Glissé.pdf', { type: 'application/pdf' }));
    el.dispatchEvent(new DragEvent('dragover', { dataTransfer: don, bubbles: true, cancelable: true }));
    el.dispatchEvent(new DragEvent('drop', { dataTransfer: don, bubbles: true, cancelable: true }));
  });
  await expect(panneau.locator('[data-fichier]')).toHaveCount(1);
  expect(appels[0][1].nom).toBe('Glissé.pdf');
});

test.describe('12 réglage « taille maximale d’un fichier »', () => {
  test('12 par défaut 25 Mo (limite appliquée 20 Mo) ; une valeur invalide est refusée avec un message ; une valeur valide est enregistrée et appliquée à l’onglet', async ({ page }, info) => {
    await ouvrirAffaire(page);
    await allerAuxReglagesCrm(page);
    const champTaille = page.locator('[data-role="taille-max-fichier"]');
    await expect(champTaille).toHaveValue('25');
    await expect(page.locator('[data-role="aide-taille-fichier"]')).toContainText('20 Mo');
    for (const mauvais of ['abc', '0', '26', '']) {
      await champTaille.fill(mauvais);
      await champTaille.press('Enter');
      await expect(page.locator('[data-role="erreur-taille-fichier"]')).toBeVisible();
    }
    expect((await lireDocument('crm_parametres/reglages'))?.tailleMaxFichierMo).toBeUndefined(); // lecture avec défaut : rien d'écrit
    await champTaille.fill('1');
    await champTaille.press('Enter');
    await expect(page.locator('[data-role="erreur-taille-fichier"]')).toBeHidden();
    await expect.poll(async () => (await lireDocument('crm_parametres/reglages'))?.tailleMaxFichierMo).toBe(1);
    await capturer(page, info, '12-reglage');
    await page.goto(`${URL_APP}#/crm/affaires/a1`);
    await expect(page.locator('.compositeur')).toBeVisible();
    const panneau = await ouvrirOnglet(page);
    await expect(panneau.locator('[data-role="aide-fichiers"]')).toContainText('Taille maximale : 1 Mo');
    await champ(page).setInputFiles({ name: 'moyen.pdf', mimeType: 'application/pdf', buffer: Buffer.concat([PDF, Buffer.alloc(1.5 * 1024 * 1024)]) });
    await expect(page.locator('[data-role="erreur-fichier"]')).toContainText(/la taille maximale de l.espace est de 1 Mo/);
  });
});

test('13 la sauvegarde (export) de l’espace contient les fiches des fichiers, pas les fichiers', async () => {
  const source = await readFile(fileURLToPath(new URL('../../js/modules/crm/donnees.js', import.meta.url)), 'utf8');
  expect(source).toMatch(/COLLECTIONS_CRM = \[[\s\S]*'documents_stockes'[\s\S]*\];/);
});

// ---------------------------------------------------------------- chez un client : un lecteur voit et ouvre les fichiers, sans bouton d'ajout ni croix
test.describe('9 lecteur d’un espace client', () => {
  const ALICE = 'alice@exemple.test';
  const LEA = 'lea@exemple.test';
  async function chargerRegles(fichier) {
    const contenu = await readFile(fileURLToPath(new URL(`../../${fichier}`, import.meta.url)), 'utf8');
    const r = await fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: fichier, content: contenu }] } }) });
    if (!r.ok) throw new Error(`Règles non chargées (${fichier}) : ${await r.text()}`);
  }
  test.beforeAll(() => chargerRegles('firestore.plateforme.rules'));
  test.afterAll(() => chargerRegles('firestore.rules'));

  async function ouvrir(page, email) {
    const maintenant = new Date();
    await ecrireDocument('marques/studio', { actif: true, nom: 'Studio Lune', couleur: '#336699', accueil: 'Bienvenue.' });
    await ecrireDocument('clients/studio', { modules: { affaires: true }, equipe: [{ email: ALICE, role: 'editeur' }, { email: LEA, role: 'lecteur' }] });
    await ecrireDocument(`clients/studio/membres/${ALICE}`, { role: 'editeur' });
    await ecrireDocument(`clients/studio/membres/${LEA}`, { role: 'lecteur' });
    await ecrireDocument('clients/studio/crm_affaires/a1', { titre: 'Audit du lac', personneId: null, organisationId: null, etape: 'etape_3', statut: 'ouverte', priorite: 'tiede', montant: 1200, offreId: null, dureeJours: null, source: '', besoin: '', dateEntreeEtape: maintenant, datesEtapes: {}, raisonPerdue: '', raisonPerdueDetail: '', dateReveil: null, encaissements: [], documents: [], projetId: null, archive: false, proprietaire: ALICE, creeLe: maintenant, modifieLe: maintenant, creePar: ALICE, modifiePar: ALICE });
    await ecrireDocument('clients/studio/documents_stockes/f1', { cibleType: 'affaire', cibleId: 'a1', nom: 'Cahier des charges.pdf', typeMime: 'application/pdf', taille: 4096, chemin: 'clients/studio/documents/affaire/a1/0-x.pdf', creeLe: maintenant, creePar: ALICE, supprimeLe: null });
    await page.goto('about:blank');
    await page.goto(`${URL_APP}#/espace/studio/crm/affaires/a1`);
    await page.waitForFunction(() => !!window.__chevalierTest);
    await page.evaluate((e) => window.__chevalierTest.connecter(e, true), email);
    await expect(page.locator('.compositeur')).toBeVisible();
    await attendreCalme(page);
  }

  test('9 un lecteur voit et ouvre le fichier, sans bouton « Ajouter un fichier » ni croix ; un éditeur a les deux ; la demande porte le nom de l’espace', async ({ page }, info) => {
    const appels = [];
    await ouvrir(page, LEA);
    await simulerServeur(page, appels);
    const panneau = await ouvrirOnglet(page);
    await expect(panneau.locator('[data-fichier="f1"]')).toContainText('Cahier des charges.pdf');
    await expect(panneau.getByRole('button', { name: 'Ajouter un fichier' })).toHaveCount(0);
    await expect(panneau.locator('[data-action="retirer-fichier"]')).toHaveCount(0);
    await expect(panneau.locator('[data-role="aide-fichiers"]')).toContainText('seul un éditeur peut en ajouter');
    await capturer(page, info, '9-lecteur');
    await Promise.all([page.waitForEvent('popup'), panneau.locator('[data-action="ouvrir-fichier"]').click()]);
    await expect.poll(() => appels.length).toBe(1);
    expect(appels[0][1]).toEqual({ client: 'studio', documentId: 'f1' });
    // un lecteur ne peut pas non plus écrire une fiche à la main (règles Firestore de la plateforme)
    const liste = await listerDocuments('clients/studio/documents_stockes');
    expect(liste).toHaveLength(1);
  });

  test('9 un éditeur du même espace a « Ajouter un fichier » et la croix', async ({ page }) => {
    await ouvrir(page, ALICE);
    const panneau = await ouvrirOnglet(page);
    await expect(panneau.getByRole('button', { name: 'Ajouter un fichier' })).toBeVisible();
    await expect(panneau.locator('[data-action="retirer-fichier"]')).toHaveCount(1);
  });
});
