// Chantier « Liens et documents » : fenêtre standard de Google (Picker), « Créer un dossier dans Google Drive » par l'API Google Drive, liens libres.
// Google est SIMULÉ (voir google-simule.js) : on vérifie ce que l'appli demande à Google et ce qu'elle enregistre, pas Google lui-même.
import { test, expect, attendreCalme, connecter, allerAuxReglagesCrm, creerProjet, creerAffaire, lireDocument, ecrireDocument, estTelephone, JEROME } from './outils.js';
import { debrancherGoogle, brancherGoogle, lireGoogle, choisirDansGoogle, refuserAutorisation, ID_CLIENT, PARENT } from './google-simule.js';

const dialogue = (page) => page.getByRole('dialog');
const CLE_CRM = 'AIzaSyAa04eaHNaBJwGAUwMrDampugAn1aralXc';
const FICHE = '#/projets/projets/pr1';
const dossierDrive = (n) => `https://drive.google.com/drive/folders/DOSSIER_${n}_abcdefghij`;

async function aller(page, hash) {
  await page.evaluate((h) => { location.hash = h; }, hash);
  await attendreCalme(page);
}
async function champDoc(collection, id, cle, attendu) {
  await expect.poll(async () => (await lireDocument(`${collection}/${id}`))?.[cle], { timeout: 10_000 }).toEqual(attendu);
}
/** Réglages du CRM : on attend que l'écran ait créé le document, puis on y ajoute nos champs sans toucher au reste. */
async function regler(patch) {
  await expect.poll(async () => (await lireDocument('crm_parametres/reglages')) !== null, { timeout: 10_000 }).toBe(true);
  await ecrireDocument('crm_parametres/reglages', { ...(await lireDocument('crm_parametres/reglages')), ...patch });
}
/**
 * Règle le dossier parent et les sous-dossiers, puis ATTEND que l'écran les ait reçus (sinon un clic rapide créerait le dossier sans eux : course entre l'écriture
 * dans la base et l'arrivée de la donnée dans la page).
 */
const reglerDrive = async (page) => {
  await regler({ dossierParentDrive: { id: PARENT, nom: 'Clients 2026' }, sousDossiersDrive: ['Contrat', 'Livrables'] });
  await expect.poll(() => page.evaluate(async () => (await import('/js/modules/crm/donnees.js')).etat.reglages.sousDossiersDrive?.length ?? 0), { timeout: 10_000 }).toBe(2);
};
const unDocument = (id, nom, url, type = 'application/pdf') => ({ id, name: nom, url, mimeType: type });

test.describe('Google non branché (identifiant client vide, comme dans le dépôt)', () => {
  test('L1 aucun bouton Google sur la fiche projet ; « Créer un dossier dans Google Drive » attend le branchement et le dit', async ({ page, context }) => {
    await debrancherGoogle(context);
    await creerProjet('pr1', { titre: 'Refonte site' });
    await connecter(page);
    await aller(page, FICHE);
    await expect(page.locator('[data-section="projet-documents"]')).toContainText('Liens et documents');
    await expect(page.locator('[data-action="ajouter-document-google"]')).toHaveCount(0);
    await expect(page.locator('[data-action="creer-dossier-ouvrir"]')).toHaveCount(0); // « Créer un dossier dans Google Drive » attend le branchement de Google
    await expect(page.locator('[data-action="lier-dossier"]')).toHaveCount(0); // « Lier un dossier Google Drive existant » aussi : il passe par la fenêtre Google
    await expect(page.locator('[data-role="google-absent"]')).toContainText('Google Drive n’est pas branché');
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
    await expect(section.locator('[data-role="dossier-parent"]')).toHaveText('Créé tout seul au premier dossier');
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
    await dialogue(page).getByRole('button', { name: 'Retirer' }).click(); // confirmation d'abord
    await champDoc('crm_parametres', 'reglages', 'sousDossiersDrive', ['Contrat', 'Livrables']);
    // Renommer
    await section.getByLabel('Renommer le sous-dossier Livrables').fill('Livrables finaux');
    await section.getByLabel('Renommer le sous-dossier Livrables').blur();
    await champDoc('crm_parametres', 'reglages', 'sousDossiersDrive', ['Contrat', 'Livrables finaux']);
    await expect(section.locator('[data-action="tester-google"]')).toHaveCount(0); // plus de bouton « Tester la fenêtre Google » (inutile pour un client)
    // Retirer le parent : l'appli en recréera un toute seule au prochain dossier.
    await section.locator('[data-action="retirer-dossier-parent"]').click();
    await expect(dialogue(page)).toContainText('Retirer le dossier parent');
    await dialogue(page).getByRole('button', { name: 'Annuler' }).click(); // la confirmation d'abord : annuler ne retire rien
    expect((await lireDocument('crm_parametres/reglages')).dossierParentDrive).toEqual({ id: PARENT, nom: 'Clients 2026' });
    await section.locator('[data-action="retirer-dossier-parent"]').click();
    await dialogue(page).getByRole('button', { name: 'Retirer' }).click();
    await champDoc('crm_parametres', 'reglages', 'dossierParentDrive', null);
    await page.locator('.toast [data-action="toast-action"]').last().click(); // « Retiré · Annuler » : on remet
    await champDoc('crm_parametres', 'reglages', 'dossierParentDrive', { id: PARENT, nom: 'Clients 2026' });
    await section.locator('[data-action="retirer-dossier-parent"]').click();
    await dialogue(page).getByRole('button', { name: 'Retirer' }).click();
    await champDoc('crm_parametres', 'reglages', 'dossierParentDrive', null);
    await expect(section.locator('[data-role="dossier-parent"]')).toHaveText('Créé tout seul au premier dossier');
    expect(drive.requetes).toHaveLength(0); // les réglages ne créent rien dans Drive
  });

  test('L3 « Créer un dossier dans Google Drive » : le dossier du projet puis ses sous-dossiers dans Drive, le lien est enregistré comme dossier de travail', async ({ page }) => {
    await creerProjet('pr1', { titre: 'Refonte site Carrel' });
    await connecter(page);
    await reglerDrive(page);
    await aller(page, FICHE);
    await page.locator('[data-action="creer-dossier-ouvrir"]').click();
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
    expect((await lireDocument('crm_parametres/reglages')).dossierParentDrive).toEqual({ id: PARENT, nom: 'Clients 2026' }); // le parent CHOISI est conservé tel quel (pas de parent automatique)
    await expect(page.locator('.toast').last()).toContainText('« Carrel 2026 – Site » créé dans Google Drive');
    await expect(page.locator('[data-prop="dossier"] a.prop-lien')).toHaveAttribute('href', dossierDrive(1));
    await expect(page.locator('[data-action="creer-dossier"], [data-action="creer-dossier-ouvrir"]')).toHaveCount(0);
    await expect(page.locator('[data-action="ouvrir-dossier"]')).toBeVisible();
    expect((await lireGoogle(page)).autorisations).toHaveLength(1);
  });

  test('L4 « Créer un dossier dans Google Drive » sans dossier parent ni sous-dossier : l\'appli crée toute seule « Chevalier IA OS » puis y range le dossier ; l\'autorisation n\'est demandée qu\'une fois', async ({ page }) => {
    await creerProjet('pr1', { titre: 'Un' });
    await creerProjet('pr2', { titre: 'Deux' });
    await connecter(page);
    await aller(page, FICHE);
    await page.locator('[data-action="creer-dossier-ouvrir"]').click();
    await page.locator('[data-action="creer-dossier"]').click();
    // Premier besoin, aucun parent choisi : « Chevalier IA OS » est créé dans Mon Drive, puis le dossier du projet DEDANS.
    await champDoc('projets_projets', 'pr1', 'urlDossier', dossierDrive(2));
    expect(drive.requetes.map((r) => r.corps)).toEqual([
      { name: 'Chevalier IA OS', mimeType: 'application/vnd.google-apps.folder' },
      { name: 'Un', mimeType: 'application/vnd.google-apps.folder', parents: ['DOSSIER_1_abcdefghij'] },
    ]);
    await champDoc('crm_parametres', 'reglages', 'dossierParentDrive', { id: 'DOSSIER_1_abcdefghij', nom: 'Chevalier IA OS', auto: true }); // enregistré comme si on l'avait choisi
    await expect(page.locator('.toast', { hasText: 'rangé dans « Chevalier IA OS »' })).toBeVisible();
    // Deuxième besoin : le même parent est réutilisé (il n'est créé qu'UNE fois).
    await aller(page, '#/projets/projets/pr2');
    await page.locator('[data-action="creer-dossier-ouvrir"]').click();
    await page.locator('[data-action="creer-dossier"]').click();
    await champDoc('projets_projets', 'pr2', 'urlDossier', dossierDrive(3));
    expect(drive.requetes.map((r) => r.corps.name)).toEqual(['Chevalier IA OS', 'Un', 'Deux']);
    expect(drive.requetes[2].corps.parents).toEqual(['DOSSIER_1_abcdefghij']);
    expect((await lireGoogle(page)).autorisations).toHaveLength(1);
  });

  test('L5 « Créer un dossier dans Google Drive » : autorisation refusée, Google qui refuse, sous-dossier manquant ; rien d\'enregistré à tort', async ({ page }) => {
    test.info().annotations.push({ type: 'erreurs-reseau-attendues' }); // le faux Google répond 403 puis 500 : le navigateur le note dans sa console
    await creerProjet('pr1', { titre: 'Refonte' });
    await connecter(page);
    await reglerDrive(page);
    await aller(page, FICHE);
    // Autorisation refusée dans la fenêtre Google : message simple, aucune requête, le bouton reste utilisable.
    await refuserAutorisation(page);
    await page.locator('[data-action="creer-dossier-ouvrir"]').click();
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

  test('L7 « Ajouter un document » sans dossier de travail : un message d\'information, aucune création ni fenêtre Google (détail : P3)', async ({ page }) => {
    await creerProjet('pr1', { titre: 'Refonte site Carrel' });
    await connecter(page);
    await reglerDrive(page);
    await aller(page, FICHE);
    await page.locator('[data-action="ajouter-document-google"]').click();
    await expect(dialogue(page)).toContainText('n’a pas de dossier de travail');
    await expect(dialogue(page).getByRole('button', { name: 'Parcourir seulement' })).toHaveCount(0);
    await expect(dialogue(page).getByRole('button', { name: 'Créer le dossier' })).toHaveCount(0);
    await dialogue(page).getByRole('button', { name: 'Fermer' }).last().click();
    expect(drive.requetes).toHaveLength(0);
    expect((await lireGoogle(page)).pickers).toHaveLength(0);
    // Le dossier se crée dans le bloc « Dossier de travail » ; ensuite « Ajouter un document » ouvre la fenêtre avec « Importer » dans CE dossier.
    await page.locator('[data-action="creer-dossier-ouvrir"]').click();
    await page.locator('[data-action="creer-dossier"]').click();
    await champDoc('projets_projets', 'pr1', 'urlDossier', dossierDrive(1));
    expect(drive.requetes.map((r) => r.corps.name)).toEqual(['Refonte site Carrel', 'Contrat', 'Livrables']);
    expect(drive.requetes[0].corps.parents).toEqual([PARENT]);
    await choisirDansGoogle(page, [unDocument('FICHIER_AAAAAAAAAA', 'Maquette.pdf', 'https://drive.google.com/file/d/FICHIER_AAAAAAAAAA/view')]);
    await page.locator('[data-action="ajouter-document-google"]').click();
    await expect(page.locator('[data-champ="copier"]')).toBeChecked(); // cochée par défaut
    await page.locator('[data-role="form-lien"] [data-action="valider-lien"]').click();
    await champDoc('projets_projets', 'pr1', 'documents', [{ libelle: 'Maquette.pdf', url: 'https://drive.google.com/file/d/COPIE_1_abcdefghij/view' }]);
    expect(drive.copies[0].corps.parents).toEqual(['DOSSIER_1_abcdefghij']);
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
    await reglerDrive(page);
    await aller(page, '#/crm/affaires/a1');
    const section = page.locator('[data-section="affaire-documents"]');
    await expect(section).toContainText('Liens et documents');
    await expect(section.locator('[data-action="ajouter-document-google"]')).toHaveText('Ajouter un document');
    await expect(section.locator('[data-action="ajouter-lien"]')).toHaveText('Ajouter un lien web');
    await expect(page.getByLabel('Adresse du document (lien Google Drive)')).toHaveCount(0); // l'ancien formulaire a disparu
    await expect(section.getByRole('link', { name: 'Ancien devis' })).toBeVisible();
    // Avec le dossier créé dans le bloc « Dossier de travail » : la fenêtre s'ouvre avec « Importer » dans ce dossier ; la copie est cochée par défaut.
    await page.locator('[data-action="creer-dossier-ouvrir"]').click();
    await page.locator('[data-action="creer-dossier"]').click();
    await champDoc('crm_affaires', 'a1', 'urlDossier', dossierDrive(1));
    expect(drive.requetes.map((r) => r.corps.name)).toEqual(['Audit des Lilas', 'Contrat', 'Livrables']);
    await choisirDansGoogle(page, [unDocument('FICHIER_AAAAAAAAAA', 'Portrait Chantal.jpg', 'https://drive.google.com/file/d/FICHIER_AAAAAAAAAA/view', 'image/jpeg')]);
    await expect(page.locator('[data-action="ouvrir-dossier"]')).toBeVisible(); // la fiche est redessinée avec le dossier : on clique ensuite
    await section.locator('[data-action="ajouter-document-google"]').click();
    await expect(section.locator('[data-champ="copier"]')).toBeChecked();
    await section.getByLabel('Note (facultative)').fill('envoyé au client');
    await section.locator('[data-action="valider-lien"]').click();
    await champDoc('crm_affaires', 'a1', 'documents', [
      { libelle: 'Ancien devis', url: 'https://exemple.fr/ancien' },
      { libelle: 'Portrait Chantal.jpg', url: 'https://drive.google.com/file/d/COPIE_1_abcdefghij/view', note: 'envoyé au client' },
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
    await expect(dialogue(page)).toContainText('Retirer ce lien');
    await dialogue(page).getByRole('button', { name: 'Annuler' }).click(); // confirmation d'abord : annuler ne retire rien
    expect((await lireDocument('projets_projets/pr1')).documents).toHaveLength(2);
    await liste.getByRole('button', { name: 'Retirer Devis' }).click();
    await dialogue(page).getByRole('button', { name: 'Retirer' }).click();
    await champDoc('projets_projets', 'pr1', 'documents', [{ libelle: 'GitHub', url: 'https://github.com/jeromechevalier-wq/client-carrel', favori: true }]);
    await expect(page.locator('.toast', { hasText: '« Devis » retiré' })).toBeVisible();
    await page.locator('.toast [data-action="toast-action"]').last().click(); // « Retiré · Annuler » : le lien revient à sa place
    await champDoc('projets_projets', 'pr1', 'documents', [{ libelle: 'Devis', url: 'https://exemple.fr/devis' }, { libelle: 'GitHub', url: 'https://github.com/jeromechevalier-wq/client-carrel', favori: true }]);
  });

  test('L13 « Début d\'activité » : le champ est assez large pour montrer le mois ET l\'année', async ({ page }) => {
    await connecter(page);
    await allerAuxReglagesCrm(page);
    const champ = page.getByLabel('Mois de début d’activité');
    await expect(champ).toBeVisible();
    expect((await champ.boundingBox()).width).toBeGreaterThanOrEqual(200); // 110 px coupait l'année (« octobre » seul)
    await expect(champ).toHaveValue(/^\d{4}-\d{2}$/);
  });

  test('L14 « Dossier de travail » identique sur la fiche affaire et la fiche projet : deux boutons, formulaire en place, création dans Drive, puis Ouvrir / Retirer (confirmation et annulation) ; plus de « Modifier » ni de champ d\'adresse', async ({ page }) => {
    await creerAffaire('a1', { titre: 'Audit des Lilas' });
    await creerProjet('pr1', { titre: 'Refonte site' });
    await connecter(page);
    await reglerDrive(page);
    for (const [hash, collection, id, titre, numero] of [['#/crm/affaires/a1', 'crm_affaires', 'a1', 'Audit des Lilas', 1], ['#/projets/projets/pr1', 'projets_projets', 'pr1', 'Refonte site', 2]]) {
      await aller(page, hash);
      const ligne = page.locator('[data-prop="dossier"]');
      await expect(ligne.locator('.prop-libelle')).toContainText('Dossier de travail');
      await expect(ligne.locator('[data-role="info"]')).toHaveCount(1);
      await expect(ligne.locator('.boutons-liens button')).toHaveText(['Créer un dossier dans Google Drive', 'Lier un dossier Google Drive existant']);
      await expect(page.locator('[data-champ="nom-dossier"], [data-champ="dossier"]')).toHaveCount(0); // pas de champs empilés avant le clic
      // « Créer un dossier dans Google Drive » : nom prérempli (celui de la fiche), modifiable ; crée le dossier et les sous-dossiers des Réglages.
      await ligne.locator('[data-action="creer-dossier-ouvrir"]').click();
      await expect(page.locator('[data-champ="nom-dossier"]')).toHaveValue(titre);
      await ligne.locator('[data-action="annuler-dossier"]').click();
      await expect(ligne.locator('[data-action="lier-dossier"]')).toBeVisible();
      await ligne.locator('[data-action="creer-dossier-ouvrir"]').click();
      await ligne.locator('[data-action="creer-dossier"]').click();
      await champDoc(collection, id, 'urlDossier', dossierDrive(numero === 1 ? 1 : 4));
      expect(drive.requetes.slice(-3).map((r) => r.corps.name)).toEqual([titre, 'Contrat', 'Livrables']);
      await expect(ligne.locator('[data-action="ouvrir-dossier"]')).toHaveAttribute('href', dossierDrive(numero === 1 ? 1 : 4));
      await expect(ligne.locator('[data-action="modifier-dossier"]')).toHaveCount(0); // plus de « Modifier » : pour changer, on retire puis on recrée ou on relie
      await expect(ligne.locator('[data-action="retirer-dossier"]')).toHaveCount(1);
      await expect(ligne.locator('[data-action="creer-dossier-ouvrir"]')).toHaveCount(0);
      await ligne.locator('[data-action="retirer-dossier"]').click();
      await dialogue(page).getByRole('button', { name: 'Annuler' }).click(); // confirmation d'abord
      expect((await lireDocument(`${collection}/${id}`)).urlDossier).toBe(dossierDrive(numero === 1 ? 1 : 4));
      await ligne.locator('[data-action="retirer-dossier"]').click();
      await dialogue(page).getByRole('button', { name: 'Retirer' }).click();
      await champDoc(collection, id, 'urlDossier', '');
    }
  });

  test('L15 un dossier déjà utilisé par un AUTRE projet : avertissement simple, non bloquant ; pas d\'avertissement pour le projet de l\'affaire elle-même', async ({ page }) => {
    const D1 = 'https://drive.google.com/drive/folders/1AbC_dEf-1234567';
    await creerProjet('pr1', { titre: 'Refonte site', urlDossier: D1 });
    await creerProjet('pr2', { titre: 'Deuxième projet' });
    await creerAffaire('a1', { titre: 'Affaire du site', projetId: 'pr1' });
    await creerAffaire('a2', { titre: 'Autre affaire' });
    await connecter(page);
    const lier = async (hash, collection, id) => {
      await aller(page, hash);
      await choisirDansGoogle(page, [unDocument('1AbC_dEf-1234567', 'Dossier partagé', D1, 'application/vnd.google-apps.folder')]);
      await page.locator('[data-action="lier-dossier"]').click();
      await champDoc(collection, id, 'urlDossier', D1); // enregistré malgré l'avertissement
    };
    await lier('#/projets/projets/pr2', 'projets_projets', 'pr2');
    await expect(page.locator('.toast', { hasText: 'Ce dossier sert déjà au projet « Refonte site »' })).toBeVisible();
    // L'affaire a1 est celle du projet pr1 : le dossier de pr1 ne la concerne pas ; seul pr2 (autre projet) est signalé.
    await lier('#/crm/affaires/a1', 'crm_affaires', 'a1');
    await expect(page.locator('.toast', { hasText: 'Ce dossier sert déjà au projet « Deuxième projet »' })).toBeVisible();
    await expect(page.locator('.toast', { hasText: 'Refonte site' })).toHaveCount(0);
    await lier('#/crm/affaires/a2', 'crm_affaires', 'a2');
    await expect(page.locator('.toast', { hasText: 'Ce dossier sert déjà au projet' }).first()).toBeVisible();
  });

  test('L16 « Copier dans le dossier de travail » : case COCHÉE par défaut → files.copy et lien vers la COPIE ; décochée → lien seul ; échec → lien d\'origine gardé', async ({ page }) => {
    test.info().annotations.push({ type: 'erreurs-reseau-attendues' }); // le faux Google répond 404 à la copie : le navigateur le note dans sa console
    const DOSSIER = '1AbC_dEf-1234567';
    await creerProjet('pr1', { titre: 'Refonte', urlDossier: `https://drive.google.com/drive/folders/${DOSSIER}` });
    await connecter(page);
    await aller(page, FICHE);
    const form = page.locator('[data-role="form-lien"][data-mode="document"]');
    const caseCopie = form.locator('[data-champ="copier"]');
    const choisir = (id, nom, type = 'application/pdf') => choisirDansGoogle(page, [{ ...unDocument(id, nom, `https://drive.google.com/file/d/${id}/view`, type), parentId: 'AUTRE_DOSSIER_123' }]);
    // Par défaut : cochée → copie dans le dossier de travail, le lien enregistré est celui de la copie.
    await choisir('FICHIER_AAAAAAAAAA', 'Devis.pdf');
    await page.locator('[data-action="ajouter-document-google"]').click();
    await expect(caseCopie).toBeVisible();
    await expect(caseCopie).toBeChecked();
    await form.locator('[data-action="valider-lien"]').click();
    await champDoc('projets_projets', 'pr1', 'documents', [{ libelle: 'Devis.pdf', url: 'https://drive.google.com/file/d/COPIE_1_abcdefghij/view' }]);
    expect(drive.copies).toHaveLength(1);
    expect(drive.copies[0].url).toContain('/files/FICHIER_AAAAAAAAAA/copy');
    expect(drive.copies[0].autorisation).toBe('Bearer ya29.SIMULE');
    expect(drive.copies[0].corps).toEqual({ parents: [DOSSIER], name: 'Devis.pdf' });
    // Décochée par l'utilisateur : lien seul, l'original, aucune copie de plus.
    await choisir('FICHIER_BBBBBBBBBB', 'Scan.jpg', 'image/jpeg');
    await page.locator('[data-action="ajouter-document-google"]').click();
    await expect(caseCopie).toBeChecked();
    await caseCopie.uncheck();
    await form.getByLabel('Note (facultative)').fill('lien seul');
    await form.locator('[data-action="valider-lien"]').click();
    await champDoc('projets_projets', 'pr1', 'documents', [
      { libelle: 'Devis.pdf', url: 'https://drive.google.com/file/d/COPIE_1_abcdefghij/view' },
      { libelle: 'Scan.jpg', url: 'https://drive.google.com/file/d/FICHIER_BBBBBBBBBB/view', note: 'lien seul' },
    ]);
    expect(drive.copies).toHaveLength(1);
    // Échec de la copie : message simple, le lien d'origine est gardé.
    drive.echecCopie = 404;
    await choisir('FICHIER_CCCCCCCCCC', 'Plan.pdf');
    await page.locator('[data-action="ajouter-document-google"]').click();
    await expect(caseCopie).toBeChecked();
    await form.locator('[data-action="valider-lien"]').click();
    await expect(page.locator('.toast-erreur').last()).toContainText('le lien d’origine est gardé');
    await champDoc('projets_projets', 'pr1', 'documents', [
      { libelle: 'Devis.pdf', url: 'https://drive.google.com/file/d/COPIE_1_abcdefghij/view' },
      { libelle: 'Scan.jpg', url: 'https://drive.google.com/file/d/FICHIER_BBBBBBBBBB/view', note: 'lien seul' },
      { libelle: 'Plan.pdf', url: 'https://drive.google.com/file/d/FICHIER_CCCCCCCCCC/view' },
    ]);
  });

  test('L17 « Importer » : case affichée GRISÉE et cochée avec « Le fichier est envoyé dans le dossier de travail » ; aucune case pour un dossier de serveur ou de NAS ; sur une affaire le libellé le dit ; jamais pour un lien web', async ({ page }) => {
    const DOSSIER = '1AbC_dEf-1234567';
    await creerProjet('pr1', { titre: 'Avec dossier Drive', urlDossier: `https://drive.google.com/drive/folders/${DOSSIER}` });
    await creerProjet('pr2', { titre: 'Avec NAS', urlDossier: 'smb://nas/clients/carrel' });
    await creerAffaire('a1', { titre: 'Affaire', urlDossier: `https://drive.google.com/drive/folders/${DOSSIER}` });
    await connecter(page);
    const form = page.locator('[data-role="form-lien"][data-mode="document"]');
    // Déposé par « Importer » : Drive dit qu'il est dans le dossier de travail → case grisée, cochée, message gris, aucune copie.
    drive.fichiers.FICHIER_DDDDDDDDDD = { parents: [DOSSIER], createdTime: new Date().toISOString() };
    await aller(page, FICHE);
    await choisirDansGoogle(page, [{ ...unDocument('FICHIER_DDDDDDDDDD', 'Importé.pdf', 'https://drive.google.com/file/d/FICHIER_DDDDDDDDDD/view'), parentId: DOSSIER }]);
    await page.locator('[data-action="ajouter-document-google"]').click();
    await expect(form.locator('[data-role="case-importe"]')).toContainText('Le fichier est envoyé dans le dossier de travail');
    await expect(form.locator('[data-role="case-importe"] input')).toBeDisabled();
    await expect(form.locator('[data-role="case-importe"] input')).toBeChecked();
    await form.locator('[data-action="valider-lien"]').click();
    await champDoc('projets_projets', 'pr1', 'documents', [{ libelle: 'Importé.pdf', url: 'https://drive.google.com/file/d/FICHIER_DDDDDDDDDD/view' }]);
    expect(drive.copies).toHaveLength(0);
    // Dossier de travail hors Drive : pas de case (comportement inchangé).
    await aller(page, '#/projets/projets/pr2');
    await choisirDansGoogle(page, [{ ...unDocument('FICHIER_EEEEEEEEEE', 'Autre.pdf', 'https://drive.google.com/file/d/FICHIER_EEEEEEEEEE/view'), parentId: 'AUTRE_DOSSIER_123' }]);
    await page.locator('[data-action="ajouter-document-google"]').click();
    await expect(form).toBeVisible();
    await expect(form.locator('[data-champ="copier"]')).toHaveCount(0);
    await form.locator('[data-action="annuler-lien"]').click();
    // Affaire avec un dossier Drive : la case parle de l'affaire.
    await aller(page, '#/crm/affaires/a1');
    await choisirDansGoogle(page, [{ ...unDocument('FICHIER_FFFFFFFFFF', 'Pièce.pdf', 'https://drive.google.com/file/d/FICHIER_FFFFFFFFFF/view'), parentId: 'AUTRE_DOSSIER_123' }]);
    await page.locator('[data-action="ajouter-document-google"]').click();
    await expect(form.locator('label.case')).toContainText('Copier dans le dossier de travail de l’affaire');
    await form.locator('[data-action="annuler-lien"]').click();
    // Un lien web n'a jamais cette case.
    await page.locator('[data-action="ajouter-lien"]').click();
    await expect(page.locator('[data-champ="copier"]')).toHaveCount(0);
  });

  test('L18 créer un dossier dont le nom existe déjà (créé par l\'appli) : message clair, rien de créé ; « Lier un dossier Google Drive existant » en repart', async ({ page }) => {
    await creerProjet('pr1', { titre: 'Refonte' });
    await creerProjet('pr2', { titre: 'Refonte' });
    await connecter(page);
    await aller(page, FICHE);
    await page.locator('[data-action="creer-dossier-ouvrir"]').click();
    await page.locator('[data-action="creer-dossier"]').click();
    await champDoc('projets_projets', 'pr1', 'urlDossier', dossierDrive(2));
    expect(drive.recherches.at(-1)).toEqual({ nom: 'Refonte', parent: 'DOSSIER_1_abcdefghij' }); // l'appli cherche d'abord un dossier de ce nom, dans le parent (ici celui qu'elle a créé toute seule)
    const avant = drive.requetes.length;
    await aller(page, '#/projets/projets/pr2');
    await page.locator('[data-action="creer-dossier-ouvrir"]').click();
    await page.locator('[data-action="creer-dossier"]').click();
    await expect(page.locator('.toast-erreur').last()).toContainText('Un dossier de ce nom existe déjà. Utilise « Lier un dossier Google Drive existant ».');
    expect(drive.requetes).toHaveLength(avant); // aucun doublon créé
    expect((await lireDocument('projets_projets/pr2')).urlDossier).toBe('');
    await expect(page.locator('[data-action="creer-dossier"]')).toBeEnabled();
    // Un autre nom passe.
    await page.locator('[data-champ="nom-dossier"]').fill('Refonte 2');
    await page.locator('[data-action="creer-dossier"]').click();
    await champDoc('projets_projets', 'pr2', 'urlDossier', dossierDrive(3));
  });

  test('L19 liens web : « www.monsite.fr » et « monsite.fr » reçoivent https:// ; « http:www.monsite.fr » devient http://www.monsite.fr ; un texte refusé donne un message clair', async ({ page }) => {
    await creerProjet('pr1', { titre: 'Refonte' });
    await connecter(page);
    await aller(page, FICHE);
    const section = page.locator('[data-section="projet-documents"]');
    const ajouter = async (saisie) => {
      await section.locator('[data-action="ajouter-lien"]').click();
      await section.getByLabel('Lien web', { exact: true }).fill(saisie);
      await section.locator('[data-action="valider-lien"]').click();
    };
    await ajouter('www.monsite.fr');
    await ajouter('autresite.fr/page');
    await ajouter('http:www.troisieme.fr');
    await champDoc('projets_projets', 'pr1', 'documents', [
      { libelle: 'monsite.fr', url: 'https://www.monsite.fr' }, { libelle: 'autresite.fr', url: 'https://autresite.fr/page' }, { libelle: 'troisieme.fr', url: 'http://www.troisieme.fr' },
    ]);
    await ajouter('pas une adresse');
    await expect(page.locator('.toast-erreur').last()).toHaveText('L\'adresse doit commencer par http:// ou https://');
    expect((await lireDocument('projets_projets/pr1')).documents).toHaveLength(3);
  });

  test('L20 icônes « i » : la bulle s\'affiche au survol, au clavier (focus) et au toucher ; une icône « i » est à côté de « Liens et documents »', async ({ page }) => {
    await creerProjet('pr1', { titre: 'Refonte' });
    await connecter(page);
    await aller(page, FICHE);
    const info = page.locator('[data-section="projet-documents"] .section-tete [data-role="info"]');
    await expect(info).toHaveCount(1);
    const bulle = info.locator('[data-role="bulle-info"]');
    await page.waitForTimeout(1500); // l'écran se redessine quand Firestore renvoie la fiche (voir docs/acceleration-tests-mesures.md) : on attend qu'il soit stable
    await expect(bulle).toBeHidden();
    await expect(bulle).toContainText('copie le fichier dans le dossier de travail'.replace('copie le fichier', 'le copie'));
    // Clavier : le focus affiche la bulle, Échap la ferme.
    await expect(async () => { await info.focus(); await expect(bulle).toBeVisible({ timeout: 2000 }); }).toPass({ timeout: 15_000 });
    await page.keyboard.press('Escape');
    await expect(bulle).toBeHidden();
    // Toucher / clic : affiche, un second clic ferme.
    // (reprise possible : si l'écran se redessine entre-temps, le bouton est remplacé et le clic doit être refait)
    await expect(async () => {
      await info.dispatchEvent('click');
      await expect(bulle).toBeVisible({ timeout: 2000 });
      // Dans l'écran, jamais coupée.
      const b = await bulle.boundingBox();
      const largeurEcran = await page.evaluate(() => window.innerWidth);
      expect(b.x).toBeGreaterThanOrEqual(0);
      expect(b.x + b.width).toBeLessThanOrEqual(largeurEcran);
    }).toPass({ timeout: 15_000 });
    await page.locator('.titre-editable').click(); // ailleurs : elle se ferme
    await expect(bulle).toBeHidden();
    // Survol (souris, ordinateur seulement) : même bulle, même texte, aussi pour l'icône du Dossier de travail.
    if (!estTelephone(page)) {
      const infoDossier = page.locator('[data-prop="dossier"] [data-role="info"]');
      await infoDossier.hover();
      await expect(infoDossier.locator('[data-role="bulle-info"]')).toBeVisible();
      await page.mouse.move(5, 5);
      await expect(infoDossier.locator('[data-role="bulle-info"]')).toBeHidden();
    }
  });

  test('P6 le dossier parent créé tout seul est recréé, avec un message, s\'il a été supprimé dans Drive ; un parent choisi par l\'utilisateur est conservé', async ({ page }) => {
    await creerProjet('pr1', { titre: 'Un' });
    await creerProjet('pr2', { titre: 'Deux' });
    await connecter(page);
    await aller(page, FICHE);
    await page.locator('[data-action="creer-dossier-ouvrir"]').click();
    await page.locator('[data-action="creer-dossier"]').click();
    await champDoc('crm_parametres', 'reglages', 'dossierParentDrive', { id: 'DOSSIER_1_abcdefghij', nom: 'Chevalier IA OS', auto: true });
    // L'utilisateur supprime « Chevalier IA OS » dans son Drive : au prochain dossier, il est recréé et l'appli le dit.
    drive.supprimes.add('DOSSIER_1_abcdefghij');
    await aller(page, '#/projets/projets/pr2');
    await page.locator('[data-action="creer-dossier-ouvrir"]').click();
    await page.locator('[data-action="creer-dossier"]').click();
    await champDoc('crm_parametres', 'reglages', 'dossierParentDrive', { id: 'DOSSIER_3_abcdefghij', nom: 'Chevalier IA OS', auto: true });
    await expect(page.locator('.toast', { hasText: 'avait été supprimé de ton Drive : il a été recréé' })).toBeVisible();
    expect(drive.requetes.map((r) => r.corps.name)).toEqual(['Chevalier IA OS', 'Un', 'Chevalier IA OS', 'Deux']);
    expect(drive.requetes[3].corps.parents).toEqual(['DOSSIER_3_abcdefghij']);
    await champDoc('projets_projets', 'pr2', 'urlDossier', dossierDrive(4));
    await page.waitForTimeout(350);
    await page.screenshot({ path: `${process.env.HOME}/chantiers-crm/captures-corrections-dossiers-2/P6-parent-recree${page.viewportSize().width < 768 ? '-telephone' : ''}.png`, animations: 'disabled' });
  });
});
