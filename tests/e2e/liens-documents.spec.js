// Chantier « Liens et documents » : fenêtre standard de Google (Picker), « Créer le répertoire » par l'API Google Drive, liens libres.
// Google est SIMULÉ (voir google-simule.js) : on vérifie ce que l'appli demande à Google et ce qu'elle enregistre, pas Google lui-même.
import { test, expect, connecter, allerAuxReglagesCrm, creerProjet, creerAffaire, lireDocument, ecrireDocument, estTelephone, JEROME } from './outils.js';
import { debrancherGoogle, brancherGoogle, lireGoogle, choisirDansGoogle, refuserAutorisation, ID_CLIENT, PARENT } from './google-simule.js';

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
  test('L1 aucun bouton Google sur la fiche projet ; « Créer le répertoire » attend le branchement et le dit', async ({ page, context }) => {
    await debrancherGoogle(context);
    await creerProjet('pr1', { titre: 'Refonte site' });
    await connecter(page);
    await aller(page, FICHE);
    await expect(page.locator('[data-section="projet-documents"]')).toContainText('Liens et documents');
    await expect(page.locator('[data-action="ajouter-document-google"]')).toHaveCount(0);
    await expect(page.locator('[data-action="creer-dossier"]')).toHaveCount(0);
    await expect(page.locator('[data-role="google-absent"]')).toContainText('Google Drive sera branché');
    await expect(page.locator('[data-action="ajouter-lien"]')).toBeVisible(); // « Ajouter un lien web » est toujours là
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
    expect(g.pickers[0]).toMatchObject({ token: 'ya29.SIMULE', cle: CLE_CRM, appId: '96526036520', langue: 'fr', titre: 'Choisir un dossier' });
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

  /** Choisit un document dans la (fausse) fenêtre Google puis valide le petit formulaire en place (nom prérempli, note facultative). */
  async function ajouterDocumentGoogle(page, { nom = null, note = null } = {}) {
    await page.locator('[data-action="ajouter-document-google"]').click();
    const form = page.locator('[data-role="form-lien"][data-mode="document"]');
    await expect(form).toBeVisible();
    if (nom !== null) await form.getByLabel('Nom du document').fill(nom);
    if (note !== null) await form.getByLabel('Note (facultative)').fill(note);
    await form.locator('[data-action="valider-lien"]').click();
  }

  test('L6 « Ajouter un document » : fenêtre Google, « Mon Drive » libre depuis la racine et « Importer » dans le dossier de travail ; nom prérempli et note dans un petit formulaire', async ({ page }) => {
    await creerProjet('pr1', { titre: 'Refonte', urlDossier: 'https://drive.google.com/drive/folders/1AbC_dEf-1234567' });
    await connecter(page);
    await aller(page, FICHE);
    await choisirDansGoogle(page, [unDocument('F1', 'Devis signé.pdf', 'https://drive.google.com/file/d/F1/view?usp=drive_web')]);
    await page.locator('[data-action="ajouter-document-google"]').click();
    // Le nom du fichier Google est proposé, modifiable ; rien n'est enregistré avant « Ajouter ».
    const form = page.locator('[data-role="form-lien"][data-mode="document"]');
    await expect(form.getByLabel('Nom du document')).toHaveValue('Devis signé.pdf');
    expect((await lireDocument('projets_projets/pr1')).documents).toEqual([]);
    await form.getByLabel('Nom du document').fill('Devis Chantal');
    await form.getByLabel('Note (facultative)').fill('envoyé au client');
    await form.locator('[data-action="valider-lien"]').click();
    await champDoc('projets_projets', 'pr1', 'documents', [{ libelle: 'Devis Chantal', url: 'https://drive.google.com/file/d/F1/view?usp=drive_web', note: 'envoyé au client' }]);
    await expect(page.locator('[data-section="projet-documents"] .lien-note')).toHaveText('envoyé au client');
    await expect(dialogue(page)).toHaveCount(0); // le projet a déjà son dossier : aucune question
    const g = await lireGoogle(page);
    expect(g.pickers).toHaveLength(1);
    expect(g.pickers[0]).toMatchObject({ token: 'ya29.SIMULE', cle: CLE_CRM, appId: '96526036520', langue: 'fr', titre: 'Ajouter un document' });
    // Aucune vue n'impose un dossier sauf « Importer » : « Mon Drive » part de la racine et se parcourt librement.
    expect(g.pickers[0].views).toEqual([{ type: 'DocsView', viewId: 'all', parent: 'root', dossiers: true }, { type: 'DocsUploadView', parent: '1AbC_dEf-1234567' }]);
    expect(drive.requetes).toHaveLength(0); // rien à créer
    // Un même lien choisi deux fois n'est pas ajouté deux fois ; fermer la fenêtre n'ajoute rien.
    await page.locator('[data-action="ajouter-document-google"]').click();
    await page.locator('[data-role="form-lien"] [data-action="valider-lien"]').click();
    await expect(page.locator('.toast').last()).toContainText('déjà dans la liste');
    await page.locator('[data-role="form-lien"] [data-action="annuler-lien"]').click();
    expect((await lireDocument('projets_projets/pr1')).documents).toHaveLength(1);
    await choisirDansGoogle(page, 'annule');
    await page.locator('[data-action="ajouter-document-google"]').click();
    await expect.poll(async () => (await lireGoogle(page)).pickers.length).toBe(3);
    await expect(page.locator('[data-role="form-lien"]')).toHaveCount(0);
    // Un « document » dont l'adresse n'est pas celle de Google est écarté.
    await choisirDansGoogle(page, [unDocument('X', 'Piège', 'javascript:alert(1)')]);
    await page.locator('[data-action="ajouter-document-google"]').click();
    await expect.poll(async () => (await lireGoogle(page)).pickers.length).toBe(4);
    await expect(page.locator('[data-role="form-lien"]')).toHaveCount(0);
    expect((await lireDocument('projets_projets/pr1')).documents).toHaveLength(1);
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
    await page.locator('[data-role="form-lien"] [data-action="valider-lien"]').click();
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
    await page.locator('[data-role="form-lien"] [data-action="valider-lien"]').click();
    await champDoc('projets_projets', 'pr1', 'documents', [
      { libelle: 'Maquette.pdf', url: 'https://drive.google.com/file/d/F1/view' }, { libelle: 'Scan.jpg', url: 'https://drive.google.com/file/d/F2/view' },
    ]);
    const derniere = (await lireGoogle(page)).pickers.at(-1);
    expect(derniere.views).toEqual([{ type: 'DocsView', viewId: 'all', parent: 'root', dossiers: true }, { type: 'DocsUploadView', parent: 'DOSSIER_1_abcdefghij' }]);
  });

  test('L8 dossier de travail sur un serveur ou un NAS : « Ajouter un document » propose « Mon Drive » seulement (pas d\'import) et ne crée rien', async ({ page }) => {
    await creerProjet('pr1', { titre: 'Refonte', urlDossier: 'smb://nas/clients/carrel' });
    await connecter(page);
    await aller(page, FICHE);
    await choisirDansGoogle(page, [unDocument('F1', 'Devis.pdf', 'https://drive.google.com/file/d/F1/view')]);
    await ajouterDocumentGoogle(page);
    await champDoc('projets_projets', 'pr1', 'documents', [{ libelle: 'Devis.pdf', url: 'https://drive.google.com/file/d/F1/view' }]);
    await expect(dialogue(page)).toHaveCount(0);
    expect((await lireGoogle(page)).pickers[0].views).toEqual([{ type: 'DocsView', viewId: 'all', parent: 'root', dossiers: true }]); // dossier hors Drive : racine de Mon Drive, pas d'import
    expect(drive.requetes).toHaveLength(0);
    expect((await lireDocument('projets_projets/pr1')).urlDossier).toBe('smb://nas/clients/carrel');
  });

  test('L10 fiche AFFAIRE : « Liens et documents » comme sur le projet (deux boutons, Google, dossier créé au besoin) ; documents existants intacts', async ({ page }) => {
    await creerAffaire('a1', { titre: 'Audit des Lilas', documents: [{ libelle: 'Ancien devis', url: 'https://exemple.fr/ancien' }] });
    await connecter(page);
    await reglerDrive();
    await aller(page, '#/crm/affaires/a1');
    const section = page.locator('[data-section="affaire-documents"]');
    await expect(section).toContainText('Liens et documents');
    await expect(section.locator('[data-action="ajouter-document-google"]')).toHaveText('Ajouter un document');
    await expect(section.locator('[data-action="ajouter-lien"]')).toHaveText('Ajouter un lien web');
    await expect(page.getByLabel('Adresse du document (lien Google Drive)')).toHaveCount(0); // l'ancien formulaire a disparu
    await expect(section.getByRole('link', { name: 'Ancien devis' })).toBeVisible();
    // Sans dossier de travail : on propose de le créer ; la fenêtre s'ouvre ensuite avec « Importer » dans ce dossier.
    await choisirDansGoogle(page, [unDocument('F1', 'Portrait Chantal.jpg', 'https://drive.google.com/file/d/F1/view', 'image/jpeg')]);
    await section.locator('[data-action="ajouter-document-google"]').click();
    await dialogue(page).getByRole('button', { name: 'Créer le dossier' }).click();
    await champDoc('crm_affaires', 'a1', 'urlDossier', dossierDrive(1));
    expect(drive.requetes.map((r) => r.corps.name)).toEqual(['Audit des Lilas', 'Contrat', 'Livrables']);
    await section.getByLabel('Note (facultative)').fill('envoyé au client');
    await section.locator('[data-action="valider-lien"]').click();
    await champDoc('crm_affaires', 'a1', 'documents', [
      { libelle: 'Ancien devis', url: 'https://exemple.fr/ancien' },
      { libelle: 'Portrait Chantal.jpg', url: 'https://drive.google.com/file/d/F1/view', note: 'envoyé au client' },
    ]);
    const g = await lireGoogle(page);
    expect(g.pickers.at(-1).views).toEqual([{ type: 'DocsView', viewId: 'all', parent: 'root', dossiers: true }, { type: 'DocsUploadView', parent: 'DOSSIER_1_abcdefghij' }]);
  });

  test('L11 « Ajouter un lien web » : petit formulaire en place (lien, nom facultatif, note) ; sans nom, le nom du site ; modifier nom et note après coup ; annuler', async ({ page }) => {
    await creerProjet('pr1', { titre: 'Refonte' });
    await connecter(page);
    await aller(page, FICHE);
    const section = page.locator('[data-section="projet-documents"]');
    // Plus de champ permanent sous la liste : le formulaire s'ouvre au clic, s'annule sans rien écrire.
    await expect(section.getByLabel('Lien web', { exact: true })).toHaveCount(0);
    await section.locator('[data-action="ajouter-lien"]').click();
    await section.getByLabel('Lien web', { exact: true }).fill('https://www.exemple.fr/devis');
    await section.locator('[data-action="annuler-lien"]').click();
    await expect(section.getByLabel('Lien web', { exact: true })).toHaveCount(0);
    expect((await lireDocument('projets_projets/pr1')).documents).toEqual([]);
    // Sans nom : le nom du site.
    await section.locator('[data-action="ajouter-lien"]').click();
    await section.getByLabel('Lien web', { exact: true }).fill('https://www.exemple.fr/devis');
    await section.getByLabel('Lien web', { exact: true }).press('Enter');
    await champDoc('projets_projets', 'pr1', 'documents', [{ libelle: 'exemple.fr', url: 'https://www.exemple.fr/devis' }]);
    await expect(section.getByRole('link', { name: 'exemple.fr' })).toHaveAttribute('href', 'https://www.exemple.fr/devis');
    // Modifier nom et note (crayon), l'étoile et le lien sont gardés.
    await section.getByRole('button', { name: 'Mettre exemple.fr en favori' }).click();
    await champDoc('projets_projets', 'pr1', 'documents', [{ libelle: 'exemple.fr', url: 'https://www.exemple.fr/devis', favori: true }]);
    await section.getByRole('button', { name: 'Modifier exemple.fr' }).click();
    await section.getByLabel('Nom de exemple.fr').fill('Devis Carrel');
    await section.getByLabel('Note de exemple.fr').fill('à relancer jeudi');
    await section.locator('[data-action="enregistrer-lien"]').click();
    await champDoc('projets_projets', 'pr1', 'documents', [{ libelle: 'Devis Carrel', url: 'https://www.exemple.fr/devis', note: 'à relancer jeudi', favori: true }]);
    await expect(section.locator('.lien-note')).toHaveText('à relancer jeudi');
    // Effacer la note et le nom : retour au nom du site, champ note supprimé.
    await section.getByRole('button', { name: 'Modifier Devis Carrel' }).click();
    await section.getByLabel('Nom de Devis Carrel').fill('');
    await section.getByLabel('Note de Devis Carrel').fill('');
    await section.getByLabel('Note de Devis Carrel').press('Enter');
    await champDoc('projets_projets', 'pr1', 'documents', [{ libelle: 'exemple.fr', url: 'https://www.exemple.fr/devis', favori: true }]);
    // Un texte qui n'est pas un lien est refusé, le formulaire reste ouvert.
    await section.locator('[data-action="ajouter-lien"]').click();
    await section.getByLabel('Lien web', { exact: true }).fill('pas un lien');
    await section.locator('[data-action="valider-lien"]').click();
    await expect(page.locator('.toast-erreur').last()).toContainText('http');
    await expect(section.locator('[data-role="form-lien"]')).toBeVisible();
    expect((await lireDocument('projets_projets/pr1')).documents).toHaveLength(1);
  });

  test('L12 cadrage : « Dossier Drive parent » aligné sur une ligne (nom long tronqué), deux boutons côte à côte, aucun défilement horizontal', async ({ page }) => {
    await creerProjet('pr1', { titre: 'Refonte' });
    await connecter(page);
    await regler({ dossierParentDrive: { id: PARENT, nom: 'Un dossier parent au nom vraiment très très long pour vérifier la troncature avec des points de suspension' }, sousDossiersDrive: [] });
    await allerAuxReglagesCrm(page);
    const ligne = page.locator('.ligne-parent-drive');
    await expect(ligne).toBeVisible();
    const centre = async (sel) => { const b = await ligne.locator(sel).boundingBox(); return b.y + b.height / 2; };
    const [libelle, nom, bouton] = [await centre('.ligne-parent-libelle'), await centre('.valeur-parent'), await centre('[data-action="choisir-dossier-parent"]')];
    expect(Math.abs(libelle - nom)).toBeLessThan(3);
    if (!estTelephone(page)) expect(Math.abs(bouton - nom)).toBeLessThan(3); // sur téléphone, la ligne passe proprement à la ligne (libellé et nom restent alignés)
    const tronque = await ligne.locator('.valeur-parent').evaluate((el) => el.scrollWidth > el.clientWidth && getComputedStyle(el).textOverflow === 'ellipsis');
    expect(tronque).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    // Fiche : deux boutons côte à côte (même ligne) sur ordinateur, sans défilement horizontal aussi sur téléphone.
    await aller(page, FICHE);
    const section = page.locator('[data-section="projet-documents"]');
    const b1 = await section.locator('[data-action="ajouter-document-google"]').boundingBox();
    const b2 = await section.locator('[data-action="ajouter-lien"]').boundingBox();
    expect(Math.abs((b1.y + b1.height / 2) - (b2.y + b2.height / 2))).toBeLessThan(3);
    await section.locator('[data-action="ajouter-lien"]').click();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
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

  test('L16 « Copier dans le dossier de travail » : case décochée par défaut ; cochée, le fichier est copié (files.copy) et le lien pointe vers la COPIE ; échec : lien d\'origine gardé', async ({ page }) => {
    const DOSSIER = '1AbC_dEf-1234567';
    await creerProjet('pr1', { titre: 'Refonte', urlDossier: `https://drive.google.com/drive/folders/${DOSSIER}` });
    await connecter(page);
    await aller(page, FICHE);
    const form = page.locator('[data-role="form-lien"][data-mode="document"]');
    const caseCopie = form.locator('[data-champ="copier"]');
    // Par défaut : décochée, le lien d'origine est enregistré, aucune copie.
    await choisirDansGoogle(page, [{ ...unDocument('FICHIER_AAAAAAAAAA', 'Devis.pdf', 'https://drive.google.com/file/d/FICHIER_AAAAAAAAAA/view'), parentId: 'AUTRE_DOSSIER_123' }]);
    await page.locator('[data-action="ajouter-document-google"]').click();
    await expect(caseCopie).toBeVisible();
    await expect(caseCopie).not.toBeChecked();
    await form.locator('[data-action="valider-lien"]').click();
    await champDoc('projets_projets', 'pr1', 'documents', [{ libelle: 'Devis.pdf', url: 'https://drive.google.com/file/d/FICHIER_AAAAAAAAAA/view' }]);
    expect(drive.copies).toHaveLength(0);
    // Cochée : copie dans le dossier de travail, lien vers la copie (l'original n'est pas enregistré).
    await choisirDansGoogle(page, [{ ...unDocument('FICHIER_BBBBBBBBBB', 'Scan.jpg', 'https://drive.google.com/file/d/FICHIER_BBBBBBBBBB/view', 'image/jpeg'), parentId: 'AUTRE_DOSSIER_123' }]);
    await page.locator('[data-action="ajouter-document-google"]').click();
    await caseCopie.check();
    await form.getByLabel('Note (facultative)').fill('copie du client');
    await form.locator('[data-action="valider-lien"]').click();
    await champDoc('projets_projets', 'pr1', 'documents', [
      { libelle: 'Devis.pdf', url: 'https://drive.google.com/file/d/FICHIER_AAAAAAAAAA/view' },
      { libelle: 'Scan.jpg', url: 'https://drive.google.com/file/d/COPIE_1_abcdefghij/view', note: 'copie du client' },
    ]);
    expect(drive.copies).toHaveLength(1);
    expect(drive.copies[0].url).toContain('/files/FICHIER_BBBBBBBBBB/copy');
    expect(drive.copies[0].autorisation).toBe('Bearer ya29.SIMULE');
    expect(drive.copies[0].corps).toEqual({ parents: [DOSSIER], name: 'Scan.jpg' });
    // Échec de la copie : message simple, le lien d'origine est gardé.
    drive.echecCopie = 404;
    await choisirDansGoogle(page, [{ ...unDocument('FICHIER_CCCCCCCCCC', 'Plan.pdf', 'https://drive.google.com/file/d/FICHIER_CCCCCCCCCC/view'), parentId: 'AUTRE_DOSSIER_123' }]);
    await page.locator('[data-action="ajouter-document-google"]').click();
    await caseCopie.check();
    await form.locator('[data-action="valider-lien"]').click();
    await expect(page.locator('.toast-erreur').last()).toContainText('le lien d’origine est gardé');
    await champDoc('projets_projets', 'pr1', 'documents', [
      { libelle: 'Devis.pdf', url: 'https://drive.google.com/file/d/FICHIER_AAAAAAAAAA/view' },
      { libelle: 'Scan.jpg', url: 'https://drive.google.com/file/d/COPIE_1_abcdefghij/view', note: 'copie du client' },
      { libelle: 'Plan.pdf', url: 'https://drive.google.com/file/d/FICHIER_CCCCCCCCCC/view' },
    ]);
  });

  test('L17 pas de case « Copier » pour un fichier déjà dans le dossier de travail (Importer), ni pour un dossier de serveur ou de NAS ; sur une affaire, le libellé le dit', async ({ page }) => {
    const DOSSIER = '1AbC_dEf-1234567';
    await creerProjet('pr1', { titre: 'Avec dossier Drive', urlDossier: `https://drive.google.com/drive/folders/${DOSSIER}` });
    await creerProjet('pr2', { titre: 'Avec NAS', urlDossier: 'smb://nas/clients/carrel' });
    await creerAffaire('a1', { titre: 'Affaire', urlDossier: `https://drive.google.com/drive/folders/${DOSSIER}` });
    await connecter(page);
    const form = page.locator('[data-role="form-lien"][data-mode="document"]');
    // Déposé par « Importer » : il est déjà dans le dossier de travail.
    await aller(page, FICHE);
    await choisirDansGoogle(page, [{ ...unDocument('FICHIER_DDDDDDDDDD', 'Importé.pdf', 'https://drive.google.com/file/d/FICHIER_DDDDDDDDDD/view'), parentId: DOSSIER }]);
    await page.locator('[data-action="ajouter-document-google"]').click();
    await expect(form).toBeVisible();
    await expect(form.locator('[data-champ="copier"]')).toHaveCount(0);
    await form.locator('[data-action="annuler-lien"]').click();
    // Dossier de travail hors Drive : pas de case.
    await aller(page, '#/projets/projets/pr2');
    await choisirDansGoogle(page, [{ ...unDocument('FICHIER_EEEEEEEEEE', 'Autre.pdf', 'https://drive.google.com/file/d/FICHIER_EEEEEEEEEE/view'), parentId: 'AUTRE_DOSSIER_123' }]);
    await page.locator('[data-action="ajouter-document-google"]').click();
    await expect(form).toBeVisible();
    await expect(form.locator('[data-champ="copier"]')).toHaveCount(0);
    await form.locator('[data-action="annuler-lien"]').click();
    // Affaire avec un dossier Drive : la case parle de l'affaire.
    await aller(page, '#/crm/affaires/a1');
    await page.locator('[data-action="ajouter-document-google"]').click();
    await expect(form.locator('label.case')).toContainText('Copier dans le dossier de travail de l’affaire');
    // Un lien web n'a jamais cette case.
    await form.locator('[data-action="annuler-lien"]').click();
    await page.locator('[data-action="ajouter-lien"]').click();
    await expect(page.locator('[data-champ="copier"]')).toHaveCount(0);
  });
});
