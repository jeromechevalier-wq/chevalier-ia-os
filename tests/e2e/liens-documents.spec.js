// Chantier « Liens et documents » : fenêtre standard de Google (Picker), « Créer le répertoire » par l'API Google Drive, liens libres.
// Google est SIMULÉ (voir google-simule.js) : on vérifie ce que l'appli demande à Google et ce qu'elle enregistre, pas Google lui-même.
import { test, expect, connecter, allerAuxReglagesCrm, creerProjet, lireDocument, ecrireDocument, JEROME } from './outils.js';
import { brancherGoogle, lireGoogle, choisirDansGoogle, refuserAutorisation, ID_CLIENT, PARENT } from './google-simule.js';

const dialogue = (page) => page.getByRole('dialog');
const CLE_CRM = 'AIzaSyAa04eaHNaBJwGAUwMrDampugAn1aralXc';
const FICHE = '#/projets/projets/pr1';
const dossierDrive = (n) => `https://drive.google.com/drive/folders/DOSSIER_${n}_abcdefghij`;

async function aller(page, hash) {
  await page.evaluate((h) => { location.hash = h; }, hash);
}
async function champDoc(collection, id, cle, attendu) {
  await expect.poll(async () => (await lireDocument(`${collection}/${id}`))?.[cle], { timeout: 10_000 }).toEqual(attendu);
}
/** Réglages du CRM : on attend que l'écran ait créé le document, puis on y ajoute nos champs sans toucher au reste. */
async function regler(patch) {
  await expect.poll(async () => (await lireDocument('crm_parametres/reglages')) !== null, { timeout: 10_000 }).toBe(true);
  await ecrireDocument('crm_parametres/reglages', { ...(await lireDocument('crm_parametres/reglages')), ...patch });
}
const reglerDrive = () => regler({ dossierParentDrive: { id: PARENT, nom: 'Clients 2026' }, sousDossiersDrive: ['Contrat', 'Livrables'] });
const unDocument = (id, nom, url, type = 'application/pdf') => ({ id, name: nom, url, mimeType: type });

test.describe('Google non branché (identifiant client vide, comme dans le dépôt)', () => {
  test('L1 aucun bouton Google sur la fiche projet ; « Créer le répertoire » attend le branchement et le dit', async ({ page }) => {
    await creerProjet('pr1', { titre: 'Refonte site' });
    await connecter(page);
    await aller(page, FICHE);
    await expect(page.locator('[data-section="projet-documents"]')).toContainText('Liens et documents');
    await expect(page.locator('[data-action="ajouter-document-google"]')).toHaveCount(0);
    await expect(page.locator('[data-action="creer-dossier"]')).toHaveCount(0);
    await expect(page.locator('[data-role="google-absent"]')).toContainText('Google Drive sera branché');
    await expect(page.locator('[data-action="ajouter-document"]')).toBeVisible(); // le formulaire de liens reste
    await expect(page.locator('script[src*="apis.google.com"]')).toHaveCount(0); // aucun script Google chargé inutilement
  });
});

test.describe('Google branché (simulé)', () => {
  let drive;
  test.beforeEach(async ({ context }) => { drive = await brancherGoogle(context); });

  test('L2 réglages : dossier parent choisi dans la fenêtre Google, sous-dossiers (ajout, ordre, retrait), essai de la fenêtre', async ({ page }) => {
    await connecter(page);
    await allerAuxReglagesCrm(page);
    const section = page.locator('#reglages-projets');
    await expect(section.locator('[data-role="etat-google"]')).toHaveText('Google Drive est branché.');
    await expect(section.locator('[data-role="dossier-parent"]')).toHaveText('Racine de Mon Drive');
    // Choisir le dossier parent : la fenêtre standard, vue « dossiers », un seul choix, autorisation drive.file au nom de Jérôme.
    await choisirDansGoogle(page, [unDocument(PARENT, 'Clients 2026', `https://drive.google.com/drive/folders/${PARENT}`, 'application/vnd.google-apps.folder')]);
    await section.locator('[data-action="choisir-dossier-parent"]').click();
    await champDoc('crm_parametres', 'reglages', 'dossierParentDrive', { id: PARENT, nom: 'Clients 2026' });
    await expect(section.locator('[data-role="dossier-parent"]')).toHaveText('Clients 2026');
    const g = await lireGoogle(page);
    expect(g.autorisations).toEqual([{ clientId: ID_CLIENT, scope: 'https://www.googleapis.com/auth/drive.file', indice: JEROME }]);
    expect(g.pickers).toHaveLength(1);
    expect(g.pickers[0]).toMatchObject({ token: 'ya29.SIMULE', cle: CLE_CRM, appId: '96526036520', langue: 'fr' });
    // Vue « DOCS » qui part de la racine de Mon Drive et se parcourt dossier par dossier (la vue « folders » montrerait à plat tous les dossiers du Drive).
    expect(g.pickers[0].views).toEqual([{ type: 'DocsView', viewId: 'all', parent: 'root', dossiers: true, choixDossier: true, mime: 'application/vnd.google-apps.folder' }]);
    expect(g.pickers[0].features).toEqual([]);
    // Fermer la fenêtre sans choisir : rien ne change.
    await choisirDansGoogle(page, 'annule');
    await section.locator('[data-action="choisir-dossier-parent"]').click();
    await expect.poll(async () => (await lireGoogle(page)).pickers.length).toBe(2);
    expect((await lireDocument('crm_parametres/reglages')).dossierParentDrive).toEqual({ id: PARENT, nom: 'Clients 2026' });
    // Sous-dossiers : ajout, doublon ignoré, ordre, retrait.
    const champAjout = section.getByLabel('Nouveau sous-dossier (ex. Contrat, Livrables)');
    const ajouter = async (nom) => { await champAjout.fill(nom); await section.getByRole('button', { name: 'Ajouter' }).last().click(); await expect(champAjout).toHaveValue(''); };
    await ajouter('Contrat');
    await champDoc('crm_parametres', 'reglages', 'sousDossiersDrive', ['Contrat']);
    await ajouter('Livrables');
    await champDoc('crm_parametres', 'reglages', 'sousDossiersDrive', ['Contrat', 'Livrables']);
    await ajouter('contrat');
    await ajouter('Échanges');
    await champDoc('crm_parametres', 'reglages', 'sousDossiersDrive', ['Contrat', 'Livrables', 'Échanges']);
    await section.locator('[data-sous-dossier="Échanges"]').getByRole('button', { name: 'Monter' }).click();
    await champDoc('crm_parametres', 'reglages', 'sousDossiersDrive', ['Contrat', 'Échanges', 'Livrables']);
    await section.locator('[data-sous-dossier="Échanges"]').getByRole('button', { name: 'Retirer Échanges' }).click();
    await champDoc('crm_parametres', 'reglages', 'sousDossiersDrive', ['Contrat', 'Livrables']);
    // Renommer
    await section.getByLabel('Renommer le sous-dossier Livrables').fill('Livrables finaux');
    await section.getByLabel('Renommer le sous-dossier Livrables').blur();
    await champDoc('crm_parametres', 'reglages', 'sousDossiersDrive', ['Contrat', 'Livrables finaux']);
    // Essai de la fenêtre : le lien reçu s'affiche, rien n'est enregistré ; vues « Mon Drive » seulement (pas d'import sans dossier).
    await choisirDansGoogle(page, [unDocument('F1', 'Devis.pdf', 'https://drive.google.com/file/d/F1/view')]);
    await section.locator('[data-action="tester-google"]').click();
    await expect(section.locator('[data-role="essai-google"] a')).toHaveAttribute('href', 'https://drive.google.com/file/d/F1/view');
    await expect(section.locator('[data-role="essai-google"]')).toContainText('Devis.pdf');
    const derniere = (await lireGoogle(page)).pickers.at(-1);
    expect(derniere.views).toEqual([{ type: 'DocsView', viewId: 'all', parent: 'root', dossiers: true }]); // sans dossier de travail : racine de Mon Drive, pas d'import
    // Retirer le parent : retour à la racine de Mon Drive.
    await section.locator('[data-action="retirer-dossier-parent"]').click();
    await champDoc('crm_parametres', 'reglages', 'dossierParentDrive', null);
    await expect(section.locator('[data-role="dossier-parent"]')).toHaveText('Racine de Mon Drive');
    expect(drive.requetes).toHaveLength(0); // les réglages ne créent rien dans Drive
  });

  test('L3 « Créer le répertoire » : le dossier du projet puis ses sous-dossiers dans Drive, le lien est enregistré comme dossier de travail', async ({ page }) => {
    await creerProjet('pr1', { titre: 'Refonte site Carrel' });
    await connecter(page);
    await reglerDrive();
    await aller(page, FICHE);
    const nom = page.locator('[data-champ="nom-dossier"]');
    await expect(nom).toHaveValue('Refonte site Carrel'); // le nom du projet est proposé, sans convention imposée
    // Nom vide : refusé avant toute requête.
    await nom.fill('  ');
    await page.locator('[data-action="creer-dossier"]').click();
    await expect(page.locator('.toast-erreur').last()).toContainText('nom');
    expect(drive.requetes).toHaveLength(0);
    await nom.fill('Carrel 2026 – Site');
    await page.locator('[data-action="creer-dossier"]').click();
    await champDoc('projets_projets', 'pr1', 'urlDossier', dossierDrive(1));
    expect(drive.requetes.map((r) => r.corps)).toEqual([
      { name: 'Carrel 2026 – Site', mimeType: 'application/vnd.google-apps.folder', parents: [PARENT] },
      { name: 'Contrat', mimeType: 'application/vnd.google-apps.folder', parents: ['DOSSIER_1_abcdefghij'] },
      { name: 'Livrables', mimeType: 'application/vnd.google-apps.folder', parents: ['DOSSIER_1_abcdefghij'] },
    ]);
    expect(new Set(drive.requetes.map((r) => r.autorisation))).toEqual(new Set(['Bearer ya29.SIMULE']));
    await expect(page.locator('.toast').last()).toContainText('« Carrel 2026 – Site » créé dans Google Drive');
    await expect(page.locator('[data-prop="dossier"] a.prop-lien')).toHaveAttribute('href', dossierDrive(1));
    await expect(page.locator('[data-action="creer-dossier"]')).toHaveCount(0);
    expect((await lireGoogle(page)).autorisations).toHaveLength(1);
  });

  test('L4 « Créer le répertoire » sans dossier parent ni sous-dossier : créé à la racine de Mon Drive ; l\'autorisation n\'est demandée qu\'une fois', async ({ page }) => {
    await creerProjet('pr1', { titre: 'Un' });
    await creerProjet('pr2', { titre: 'Deux' });
    await connecter(page);
    await aller(page, FICHE);
    await page.locator('[data-action="creer-dossier"]').click();
    await champDoc('projets_projets', 'pr1', 'urlDossier', dossierDrive(1));
    expect(drive.requetes.map((r) => r.corps)).toEqual([{ name: 'Un', mimeType: 'application/vnd.google-apps.folder' }]);
    await aller(page, '#/projets/projets/pr2');
    await page.locator('[data-action="creer-dossier"]').click();
    await champDoc('projets_projets', 'pr2', 'urlDossier', dossierDrive(2));
    expect((await lireGoogle(page)).autorisations).toHaveLength(1);
  });

  test('L5 « Créer le répertoire » : autorisation refusée, Google qui refuse, sous-dossier manquant ; rien d\'enregistré à tort', async ({ page }) => {
    test.info().annotations.push({ type: 'erreurs-reseau-attendues' }); // le faux Google répond 403 puis 500 : le navigateur le note dans sa console
    await creerProjet('pr1', { titre: 'Refonte' });
    await connecter(page);
    await reglerDrive();
    await aller(page, FICHE);
    // Autorisation refusée dans la fenêtre Google : message simple, aucune requête, le bouton reste utilisable.
    await refuserAutorisation(page);
    await page.locator('[data-action="creer-dossier"]').click();
    await expect(page.locator('.toast').last()).toContainText('Autorisation refusée');
    expect(drive.requetes).toHaveLength(0);
    await expect(page.locator('[data-action="creer-dossier"]')).toBeEnabled();
    await refuserAutorisation(page, false);
    // Google refuse le dossier principal : message, rien d'enregistré, aucun sous-dossier tenté.
    drive.echecs.Refonte = 403;
    await page.locator('[data-action="creer-dossier"]').click();
    await expect(page.locator('.toast-erreur').last()).toContainText('droits');
    expect((await lireDocument('projets_projets/pr1')).urlDossier).toBe('');
    expect(drive.requetes).toHaveLength(1);
    await expect(page.locator('[data-action="creer-dossier"]')).toBeEnabled();
    // Un sous-dossier manque : le dossier existe et son lien est enregistré, le message nomme ce qui manque.
    delete drive.echecs.Refonte;
    drive.echecs.Livrables = 500;
    await page.locator('[data-action="creer-dossier"]').click();
    await champDoc('projets_projets', 'pr1', 'urlDossier', dossierDrive(1));
    await expect(page.locator('.toast-erreur').last()).toContainText('Livrables');
  });

  test('L6 « Ajouter un document » : fenêtre Google avec « Mon Drive » et « Importer » dans le dossier de travail Drive du projet ; les liens choisis entrent dans la liste', async ({ page }) => {
    await creerProjet('pr1', { titre: 'Refonte', urlDossier: 'https://drive.google.com/drive/folders/1AbC_dEf-1234567' });
    await connecter(page);
    await aller(page, FICHE);
    await choisirDansGoogle(page, [
      unDocument('F1', 'Devis signé.pdf', 'https://drive.google.com/file/d/F1/view?usp=drive_web'),
      unDocument('F2', 'Cahier des charges', 'https://docs.google.com/document/d/F2/edit?usp=drive_web', 'application/vnd.google-apps.document'),
    ]);
    await page.locator('[data-action="ajouter-document-google"]').click();
    await champDoc('projets_projets', 'pr1', 'documents', [
      { libelle: 'Devis signé.pdf', url: 'https://drive.google.com/file/d/F1/view?usp=drive_web' },
      { libelle: 'Cahier des charges', url: 'https://docs.google.com/document/d/F2/edit?usp=drive_web' },
    ]);
    await expect(page.locator('[data-section="projet-documents"]')).toContainText('Cahier des charges');
    await expect(dialogue(page)).toHaveCount(0); // le projet a déjà son dossier : aucune question
    const g = await lireGoogle(page);
    expect(g.pickers).toHaveLength(1);
    expect(g.pickers[0]).toMatchObject({ token: 'ya29.SIMULE', cle: CLE_CRM, appId: '96526036520', langue: 'fr', features: ['multiselectEnabled'] });
    expect(g.pickers[0].views).toEqual([{ type: 'DocsView', viewId: 'all', parent: '1AbC_dEf-1234567', dossiers: true }, { type: 'DocsUploadView', parent: '1AbC_dEf-1234567' }]); // « Mon Drive » démarre dans le dossier de travail
    expect(drive.requetes).toHaveLength(0); // rien à créer
    // Un même lien choisi deux fois n'est pas ajouté deux fois ; fermer la fenêtre n'ajoute rien.
    await page.locator('[data-action="ajouter-document-google"]').click();
    await expect.poll(async () => (await lireGoogle(page)).pickers.length).toBe(2);
    expect((await lireDocument('projets_projets/pr1')).documents).toHaveLength(2);
    await choisirDansGoogle(page, 'annule');
    await page.locator('[data-action="ajouter-document-google"]').click();
    await expect.poll(async () => (await lireGoogle(page)).pickers.length).toBe(3);
    expect((await lireDocument('projets_projets/pr1')).documents).toHaveLength(2);
    // Un « document » dont l'adresse n'est pas celle de Google est écarté.
    await choisirDansGoogle(page, [unDocument('X', 'Piège', 'javascript:alert(1)')]);
    await page.locator('[data-action="ajouter-document-google"]').click();
    await expect.poll(async () => (await lireGoogle(page)).pickers.length).toBe(4);
    expect((await lireDocument('projets_projets/pr1')).documents).toHaveLength(2);
  });

  test('L7 « Ajouter un document » sans dossier de travail : on propose de le créer (envoi dans ce dossier) ou de parcourir seulement', async ({ page }) => {
    await creerProjet('pr1', { titre: 'Refonte site Carrel' });
    await connecter(page);
    await reglerDrive();
    await aller(page, FICHE);
    // « Parcourir seulement » : ni dossier créé, ni onglet « Importer ».
    await choisirDansGoogle(page, [unDocument('F1', 'Maquette.pdf', 'https://drive.google.com/file/d/F1/view')]);
    await page.locator('[data-action="ajouter-document-google"]').click();
    await expect(dialogue(page)).toContainText('pas encore de dossier de travail');
    await dialogue(page).getByRole('button', { name: 'Parcourir seulement' }).click();
    await champDoc('projets_projets', 'pr1', 'documents', [{ libelle: 'Maquette.pdf', url: 'https://drive.google.com/file/d/F1/view' }]);
    expect(drive.requetes).toHaveLength(0);
    expect((await lireDocument('projets_projets/pr1')).urlDossier).toBe('');
    expect((await lireGoogle(page)).pickers[0].views).toEqual([{ type: 'DocsView', viewId: 'all', parent: 'root', dossiers: true }]); // racine de Mon Drive, pas d'onglet « Importer »
    // Fermer la question : rien ne se passe.
    await page.locator('[data-action="ajouter-document-google"]').click();
    await dialogue(page).getByRole('button', { name: 'Fermer' }).click();
    expect((await lireGoogle(page)).pickers).toHaveLength(1);
    // « Créer le dossier » : dossier du projet + sous-dossiers dans le parent, lien enregistré, puis la fenêtre avec « Importer » dans CE dossier.
    await choisirDansGoogle(page, [unDocument('F2', 'Scan.jpg', 'https://drive.google.com/file/d/F2/view', 'image/jpeg')]);
    await page.locator('[data-action="ajouter-document-google"]').click();
    await dialogue(page).getByRole('button', { name: 'Créer le dossier' }).click();
    await champDoc('projets_projets', 'pr1', 'urlDossier', dossierDrive(1));
    expect(drive.requetes.map((r) => r.corps.name)).toEqual(['Refonte site Carrel', 'Contrat', 'Livrables']);
    expect(drive.requetes[0].corps.parents).toEqual([PARENT]);
    await champDoc('projets_projets', 'pr1', 'documents', [
      { libelle: 'Maquette.pdf', url: 'https://drive.google.com/file/d/F1/view' }, { libelle: 'Scan.jpg', url: 'https://drive.google.com/file/d/F2/view' },
    ]);
    const derniere = (await lireGoogle(page)).pickers.at(-1);
    expect(derniere.views).toEqual([{ type: 'DocsView', viewId: 'all', parent: 'DOSSIER_1_abcdefghij', dossiers: true }, { type: 'DocsUploadView', parent: 'DOSSIER_1_abcdefghij' }]);
  });

  test('L8 dossier de travail sur un serveur ou un NAS : « Ajouter un document » propose « Mon Drive » seulement (pas d\'import) et ne crée rien', async ({ page }) => {
    await creerProjet('pr1', { titre: 'Refonte', urlDossier: 'smb://nas/clients/carrel' });
    await connecter(page);
    await aller(page, FICHE);
    await choisirDansGoogle(page, [unDocument('F1', 'Devis.pdf', 'https://drive.google.com/file/d/F1/view')]);
    await page.locator('[data-action="ajouter-document-google"]').click();
    await champDoc('projets_projets', 'pr1', 'documents', [{ libelle: 'Devis.pdf', url: 'https://drive.google.com/file/d/F1/view' }]);
    await expect(dialogue(page)).toHaveCount(0);
    expect((await lireGoogle(page)).pickers[0].views).toEqual([{ type: 'DocsView', viewId: 'all', parent: 'root', dossiers: true }]); // dossier hors Drive : racine de Mon Drive, pas d'import
    expect(drive.requetes).toHaveLength(0);
    expect((await lireDocument('projets_projets/pr1')).urlDossier).toBe('smb://nas/clients/carrel');
  });

  test('L9 liens libres : un ancien dépôt GitHub est repris dans la liste (libellé « GitHub »), sans perte ; étoile et retrait', async ({ page }) => {
    await creerProjet('pr1', { titre: 'Refonte', urlGithub: 'https://github.com/jeromechevalier-wq/client-carrel', documents: [{ libelle: 'Devis', url: 'https://exemple.fr/devis' }] });
    await connecter(page);
    await aller(page, FICHE);
    const liste = page.locator('[data-section="projet-documents"]');
    await expect(liste.locator('a')).toHaveText(['Devis', 'GitHub']);
    await expect(liste.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/jeromechevalier-wq/client-carrel');
    await expect(page.getByText('Créer le GitHub')).toHaveCount(0);
    expect((await lireDocument('projets_projets/pr1')).urlGithub).toBe('https://github.com/jeromechevalier-wq/client-carrel'); // rien n'a été réécrit
    // L'étoile range le lien dans la liste des documents (en favori) et vide l'ancien champ : même lien, même libellé.
    await liste.locator('li', { hasText: 'GitHub' }).getByRole('button', { name: /favori/i }).click();
    await champDoc('projets_projets', 'pr1', 'urlGithub', '');
    await champDoc('projets_projets', 'pr1', 'documents', [{ libelle: 'Devis', url: 'https://exemple.fr/devis' }, { libelle: 'GitHub', url: 'https://github.com/jeromechevalier-wq/client-carrel', favori: true }]);
    await expect(liste.locator('a')).toHaveText(['Devis', 'GitHub']);
    // Retrait d'un lien
    await liste.getByRole('button', { name: 'Retirer Devis' }).click();
    await champDoc('projets_projets', 'pr1', 'documents', [{ libelle: 'GitHub', url: 'https://github.com/jeromechevalier-wq/client-carrel', favori: true }]);
  });
});
