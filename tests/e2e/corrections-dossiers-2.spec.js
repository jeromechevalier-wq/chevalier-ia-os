// Corrections 2.7.5 : un test (ou plusieurs) par point, dont le nom commence par le numéro du point.
//  P1 tâches : mêmes gestes que les activités (clic sur la date) ; P2 « Supprimé · Annuler » 8 s pour chaque retrait réversible ;
//  P3 « Ajouter un document » sans dossier de travail : un message, rien d'autre ; P4 libellé « Dossier de travail de cette fiche » ;
//  P5 fichier importé : case grisée et cochée (reconnu par Drive).
import { test, expect, connecter, allerAuxReglagesCrm, creerProjet, creerAffaire, creerPersonne, creerOrganisation, creerTacheProjet, creerActivite, lireDocument, ecrireDocument, jour, JEROME } from './outils.js';
import { brancherGoogle, lireGoogle, choisirDansGoogle, PARENT } from './google-simule.js';

const dialogue = (page) => page.getByRole('dialog');
async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); }
async function champDoc(collection, id, cle, attendu) {
  await expect.poll(async () => (await lireDocument(`${collection}/${id}`))?.[cle], { timeout: 10_000 }).toEqual(attendu);
}
const unDocument = (id, nom, url, type = 'application/pdf') => ({ id, name: nom, url, mimeType: type });
const DOSSIER = '1AbC_dEf-1234567';
const URL_DOSSIER = `https://drive.google.com/drive/folders/${DOSSIER}`;
/** Après une suppression confirmée : le message « … · Annuler » est là, un clic le défait. */
async function annulerLeRetrait(page) {
  const action = page.locator('.toast [data-action="toast-action"]').last();
  await expect(action).toBeVisible();
  await expect(action).toHaveText('Annuler');
  await action.click();
}
async function confirmer(page, libelle) { await dialogue(page).getByRole('button', { name: libelle }).click(); }

test('P1 une tâche se traite comme une activité : un clic sur la date (ou sur « En retard ») ouvre la même fenêtre pour la changer ; une tâche sans date peut en recevoir une, ou la perdre', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Refonte site' });
  await creerTacheProjet('t1', { titre: 'Tâche sans date', projetId: 'pr1', ordre: 1 });
  await creerTacheProjet('t2', { titre: 'Tâche en retard', projetId: 'pr1', ordre: 2, date: jour(-2) });
  await creerActivite('ac1', { titre: 'Appel en retard', projetId: 'pr1', type: 'appel', date: jour(-2) });
  await connecter(page);
  await aller(page, '#/projets/projets/pr1');
  // Activité : un clic sur la date ouvre « Changer la date » (date, heure, raccourcis).
  const activite = page.locator('.activite[data-activite="ac1"]');
  await activite.locator('.activite-date-modifiable').click();
  await expect(dialogue(page)).toContainText('Changer la date');
  await expect(dialogue(page).getByLabel('Heure (facultatif)')).toBeVisible();
  await expect(dialogue(page).locator('[data-date-rapide]')).toHaveCount(4);
  await dialogue(page).locator('[data-date-rapide="demain"]').click();
  await champDoc('crm_activites', 'ac1', 'date', jour(1));
  // Tâche en retard : un clic sur la date ouvre EXACTEMENT la même fenêtre.
  const retard = page.locator('.tache[data-tache="t2"]');
  await retard.locator('[data-action="date-tache"]').click();
  await expect(dialogue(page)).toContainText('Changer la date');
  await expect(dialogue(page).getByLabel('Heure (facultatif)')).toBeVisible();
  await expect(dialogue(page).locator('[data-date-rapide]')).toHaveCount(4);
  await dialogue(page).locator('[data-date-rapide="3j"]').click();
  await champDoc('projets_taches', 't2', 'date', jour(3));
  // Le badge « En retard » ouvre aussi la fenêtre (même chose que sur une activité).
  await creerTacheProjet('t3', { titre: 'Autre retard', projetId: 'pr1', ordre: 3, date: jour(-5) });
  await expect(page.locator('.tache[data-tache="t3"] [data-action="badge-date-tache"]')).toHaveText('En retard');
  await page.locator('.tache[data-tache="t3"] [data-action="badge-date-tache"]').click();
  await expect(dialogue(page)).toContainText('Changer la date');
  await dialogue(page).locator('[data-date-rapide="1sem"]').click();
  await champDoc('projets_taches', 't3', 'date', jour(7));
  // Tâche sans date : « Sans date » est cliquable et donne une date ; « Sans date » dans la fenêtre l'efface (ce que les activités n'ont pas : elles ont toujours une date).
  const sans = page.locator('.tache[data-tache="t1"]');
  await expect(sans.locator('[data-action="date-tache"]')).toHaveText('Sans date');
  await sans.locator('[data-action="date-tache"]').click();
  await dialogue(page).locator('[data-date-rapide="demain"]').click();
  await champDoc('projets_taches', 't1', 'date', jour(1));
  await sans.locator('[data-action="date-tache"]').click();
  await dialogue(page).locator('[data-action="effacer-date"]').click();
  await champDoc('projets_taches', 't1', 'date', null);
  await expect(sans.locator('[data-action="date-tache"]')).toHaveText('Sans date');
});

test('P1 (suite) mêmes modifications possibles : texte au clic, date au clic, rond pour terminer ; seule la tâche se déplace de phase et se confie à quelqu\'un (menu « Modifier… »), seule l\'activité a un type', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Refonte site' });
  await creerTacheProjet('t1', { titre: 'Une tâche', projetId: 'pr1' });
  await creerActivite('ac1', { titre: 'Une activité', projetId: 'pr1', type: 'appel' });
  await connecter(page);
  await aller(page, '#/projets/projets/pr1');
  const tache = page.locator('.tache[data-tache="t1"]');
  const activite = page.locator('.activite[data-activite="ac1"]');
  for (const [ligne, titre] of [[tache, '[data-role="titre-tache"]'], [activite, '.activite-titre-modifiable']]) {
    await expect(ligne.locator(titre)).toHaveAttribute('role', 'button');
    await expect(ligne.locator('.activite-date-modifiable')).toHaveAttribute('role', 'button');
    await expect(ligne.locator('.case-fait')).toHaveCount(1);
    await expect(ligne.locator('[aria-label^="Actions"]')).toHaveCount(1);
  }
  await tache.locator('[aria-label^="Actions"]').click();
  expect(await page.locator('.menu-pop [role="menuitem"]').allInnerTexts()).toEqual(expect.arrayContaining(['Modifier…', 'Monter', 'Descendre', 'Supprimer']));
  await page.keyboard.press('Escape');
});

test('P2 « Supprimé · Annuler » : une TÂCHE supprimée revient à l\'identique pendant 8 secondes', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Refonte site' });
  await creerTacheProjet('t1', { titre: 'Écrire le devis', projetId: 'pr1', date: jour(2) });
  await connecter(page);
  await aller(page, '#/projets/projets/pr1');
  const avant = await lireDocument('projets_taches/t1');
  await page.locator('.tache[data-tache="t1"] [data-action="menu-tache"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Supprimer' }).click();
  await expect(dialogue(page)).toContainText('Supprimer cette tâche');
  await dialogue(page).getByRole('button', { name: 'Annuler' }).click(); // d'abord la confirmation : annuler ne supprime rien
  expect(await lireDocument('projets_taches/t1')).not.toBeNull();
  await page.locator('.tache[data-tache="t1"] [data-action="menu-tache"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Supprimer' }).click();
  await confirmer(page, 'Supprimer');
  await expect.poll(async () => await lireDocument('projets_taches/t1')).toBeNull();
  await expect(page.locator('.toast', { hasText: 'Tâche supprimée' })).toBeVisible();
  await annulerLeRetrait(page);
  await expect.poll(async () => await lireDocument('projets_taches/t1')).toEqual(avant);
  await expect(page.locator('.tache[data-tache="t1"]')).toBeVisible();
});

test('P2 « Supprimé · Annuler » : une ACTIVITÉ (point clé) et une NOTE supprimées reviennent à l\'identique', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await creerActivite('ac1', { titre: 'Appeler le client', affaireId: 'a1', type: 'appel' });
  await ecrireDocument('crm_notes/n1', { texte: 'Une note importante', personneId: null, organisationId: null, affaireId: 'a1', auteur: JEROME, creeLe: new Date(Date.now() - 60_000), modifieLe: new Date() });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  const avantActivite = await lireDocument('crm_activites/ac1');
  await page.locator('.activite[data-activite="ac1"]').getByRole('button', { name: /Actions/ }).click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Supprimer' }).click();
  await expect(dialogue(page)).toContainText('Supprimer cette activité');
  await confirmer(page, 'Supprimer');
  await expect.poll(async () => await lireDocument('crm_activites/ac1')).toBeNull();
  await expect(page.locator('.toast', { hasText: 'Activité supprimée' })).toBeVisible();
  await annulerLeRetrait(page);
  await expect.poll(async () => await lireDocument('crm_activites/ac1')).toEqual(avantActivite);
  await expect(page.locator('.activite[data-activite="ac1"]')).toBeVisible();
  // Note
  const avantNote = await lireDocument('crm_notes/n1');
  await page.getByRole('tab', { name: 'Notes' }).click().catch(() => {});
  await page.locator('[data-action="supprimer-note"]').first().click();
  await confirmer(page, 'Supprimer');
  await expect.poll(async () => await lireDocument('crm_notes/n1')).toBeNull();
  await annulerLeRetrait(page);
  await expect.poll(async () => await lireDocument('crm_notes/n1')).toEqual(avantNote);
});

test('P2 « Retiré · Annuler » : un lien, le dossier de travail, une organisation détachée', async ({ page, context }) => {
  await brancherGoogle(context);
  await creerOrganisation('o1', { nom: 'Atelier Lune' });
  await creerPersonne('p1', { nom: 'Camille Dubois', organisationId: 'o1' });
  await creerProjet('pr1', { titre: 'Refonte site', urlDossier: URL_DOSSIER, documents: [{ libelle: 'Devis', url: 'https://exemple.fr/devis' }] });
  await connecter(page);
  await aller(page, '#/projets/projets/pr1');
  // Lien
  await page.locator('[data-section="projet-documents"]').getByRole('button', { name: 'Retirer Devis' }).click();
  await confirmer(page, 'Retirer');
  await champDoc('projets_projets', 'pr1', 'documents', []);
  await annulerLeRetrait(page);
  await champDoc('projets_projets', 'pr1', 'documents', [{ libelle: 'Devis', url: 'https://exemple.fr/devis' }]);
  // Dossier de travail
  await page.locator('[data-prop="dossier"] [data-action="retirer-dossier"]').click();
  await confirmer(page, 'Retirer');
  await champDoc('projets_projets', 'pr1', 'urlDossier', '');
  await annulerLeRetrait(page);
  await champDoc('projets_projets', 'pr1', 'urlDossier', URL_DOSSIER);
  // Organisation d'une personne
  await aller(page, '#/crm/personnes/p1');
  await page.locator('[data-action="detacher-organisation"]').click();
  await expect(dialogue(page)).toContainText('Détacher l’organisation');
  await confirmer(page, 'Détacher');
  await expect.poll(async () => (await lireDocument('crm_personnes/p1')).organisationId).toBeNull();
  await annulerLeRetrait(page);
  await expect.poll(async () => (await lireDocument('crm_personnes/p1')).organisationId).toBe('o1');
});

test('P2 « Retiré · Annuler » dans les Réglages : dossier parent, sous-dossier, valeur de liste, étiquette, filtre enregistré, modèle d\'affaire', async ({ page }) => {
  await ecrireDocument('crm_parametres/filtres', { items: [{ id: 'f1', nom: 'Mon filtre', liste: 'affaires', criteres: [] }], version: 2 });
  await ecrireDocument('crm_parametres/modeles_affaire', { items: [{ id: 'm1', nom: 'Modèle A', offreId: null, etape: null, priorite: 'tiede', montant: null, besoin: '', activites: [], actif: true, ordre: 1 }] });
  await connecter(page);
  await expect.poll(async () => (await lireDocument('crm_parametres/reglages')) !== null).toBe(true);
  await ecrireDocument('crm_parametres/reglages', { ...(await lireDocument('crm_parametres/reglages')), dossierParentDrive: { id: PARENT, nom: 'Clients 2026' }, sousDossiersDrive: ['Contrat', 'Livrables'] });
  await allerAuxReglagesCrm(page);
  const lire = async (cle) => (await lireDocument('crm_parametres/reglages'))[cle];
  // Dossier parent
  await page.locator('[data-action="retirer-dossier-parent"]').click();
  await confirmer(page, 'Retirer');
  await expect.poll(() => lire('dossierParentDrive')).toBeNull();
  await annulerLeRetrait(page);
  await expect.poll(() => lire('dossierParentDrive')).toEqual({ id: PARENT, nom: 'Clients 2026' });
  // Sous-dossier
  await page.locator('[data-sous-dossier="Contrat"]').getByRole('button', { name: 'Retirer Contrat' }).click();
  await confirmer(page, 'Retirer');
  await expect.poll(() => lire('sousDossiersDrive')).toEqual(['Livrables']);
  await annulerLeRetrait(page);
  await expect.poll(() => lire('sousDossiersDrive')).toEqual(['Contrat', 'Livrables']);
  // Valeur de liste (secteurs)
  const secteurs = (await lireDocument('crm_parametres/listes')).secteurs;
  await page.getByRole('button', { name: `Retirer ${secteurs[0]}`, exact: true }).first().click();
  await confirmer(page, 'Retirer');
  await expect.poll(async () => (await lireDocument('crm_parametres/listes')).secteurs).toEqual(secteurs.slice(1));
  await annulerLeRetrait(page);
  await expect.poll(async () => (await lireDocument('crm_parametres/listes')).secteurs).toEqual(secteurs);
  // Étiquette
  const etiquettes = (await lireDocument('crm_parametres/etiquettes')).items;
  await page.getByRole('button', { name: `Retirer ${etiquettes[0].nom}`, exact: true }).click();
  await confirmer(page, 'Retirer');
  await expect.poll(async () => (await lireDocument('crm_parametres/etiquettes')).items.length).toBe(etiquettes.length - 1);
  await annulerLeRetrait(page);
  await expect.poll(async () => (await lireDocument('crm_parametres/etiquettes')).items.length).toBe(etiquettes.length);
  // Filtre enregistré
  await page.locator('[data-filtre="f1"] [data-action="supprimer-filtre"]').click();
  await confirmer(page, 'Supprimer');
  await expect.poll(async () => (await lireDocument('crm_parametres/filtres')).items).toEqual([]);
  await annulerLeRetrait(page);
  await expect.poll(async () => (await lireDocument('crm_parametres/filtres')).items.map((f) => f.id)).toEqual(['f1']);
  // Modèle d'affaire
  await page.locator('[data-action="supprimer-modele-affaire"]').click();
  await confirmer(page, 'Supprimer');
  await expect.poll(async () => (await lireDocument('crm_parametres/modeles_affaire')).items).toEqual([]);
  await annulerLeRetrait(page);
  await expect.poll(async () => (await lireDocument('crm_parametres/modeles_affaire')).items.map((m) => m.id)).toEqual(['m1']);
});

test('P2 le message « Annuler » disparaît après 8 secondes (durée vérifiée dans le code et à l\'écran)', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Refonte', documents: [{ libelle: 'Devis', url: 'https://exemple.fr/devis' }] });
  await connecter(page);
  await aller(page, '#/projets/projets/pr1');
  await page.locator('[data-section="projet-documents"]').getByRole('button', { name: 'Retirer Devis' }).click();
  await confirmer(page, 'Retirer');
  const action = page.locator('.toast [data-action="toast-action"]');
  await expect(action).toBeVisible();
  const debut = Date.now();
  await page.waitForTimeout(6500);
  await expect(action).toBeVisible(); // encore là après 6,5 s
  await expect(action).toHaveCount(0, { timeout: 4000 }); // disparu peu après 8 s
  expect(Date.now() - debut).toBeGreaterThan(7500);
});

for (const [libelle, hash, collection, id, creer] of [
  ['projet', '#/projets/projets/pr1', 'projets_projets', 'pr1', () => creerProjet('pr1', { titre: 'Refonte site' })],
  ['affaire', '#/crm/affaires/a1', 'crm_affaires', 'a1', () => creerAffaire('a1', { titre: 'Audit des Lilas' })],
]) {
  test(`P3 ${libelle} sans dossier de travail : « Ajouter un document » affiche UN message d'information avec le seul bouton « Fermer » ; rien n'est créé, aucune fenêtre Google`, async ({ page, context }) => {
    const drive = await brancherGoogle(context);
    await creer();
    await connecter(page);
    await aller(page, hash);
    await page.locator('[data-action="ajouter-document-google"]').click();
    await expect(dialogue(page)).toContainText('Cette fiche n’a pas de dossier de travail : on ne peut pas y ajouter de document. Crée ou relie d’abord le dossier de travail de cette fiche (bloc Détails).');
    const boutons = dialogue(page).locator('.dialogue-pied button');
    await expect(boutons).toHaveCount(1);
    await expect(boutons).toHaveText('Fermer');
    await boutons.click();
    await expect(dialogue(page)).toHaveCount(0);
    expect(drive.requetes).toHaveLength(0); // aucun dossier créé
    expect((await lireGoogle(page)).pickers).toHaveLength(0); // aucune fenêtre Google
    expect((await lireGoogle(page)).autorisations).toHaveLength(0);
    expect((await lireDocument(`${collection}/${id}`)).urlDossier || '').toBe('');
    await expect(page.locator('[data-role="form-lien"]')).toHaveCount(0);
  });

  test(`P4 ${libelle} : le libellé est « Dossier de travail de cette fiche »`, async ({ page }) => {
    await creer();
    await connecter(page);
    await aller(page, hash);
    await expect(page.locator('[data-prop="dossier"] .prop-libelle')).toContainText('Dossier de travail de cette fiche');
    await expect(page.locator('[data-prop="dossier"] [data-role="info"]')).toHaveAttribute('aria-label', /Dossier de travail de cette fiche/);
  });
}

test('P5 un fichier IMPORTÉ depuis l\'ordinateur est reconnu (Drive dit qu\'il est dans le dossier de travail) : case GRISÉE et COCHÉE, message gris, impossible de la décocher, aucune copie', async ({ page, context }) => {
  const drive = await brancherGoogle(context);
  await creerProjet('pr1', { titre: 'Refonte site', urlDossier: URL_DOSSIER });
  await connecter(page);
  await aller(page, '#/projets/projets/pr1');
  // Le fichier renvoyé par la fenêtre Google ne dit RIEN de son dossier (pas de parentId) : c'est Drive (files.get) qui le dit.
  drive.fichiers.FICHIER_IMPORT_01 = { parents: [DOSSIER] };
  await choisirDansGoogle(page, [unDocument('FICHIER_IMPORT_01', '1.png', 'https://drive.google.com/file/d/FICHIER_IMPORT_01/view', 'image/png')]);
  await page.locator('[data-action="ajouter-document-google"]').click();
  const importe = page.locator('[data-role="case-importe"]');
  await expect(importe).toBeVisible();
  await expect(importe).toContainText('Le fichier est envoyé dans le dossier de travail');
  const caseCopie = importe.locator('input');
  await expect(caseCopie).toBeChecked();
  await expect(caseCopie).toBeDisabled();
  await expect(caseCopie.evaluate((el) => getComputedStyle(el.closest('label')).opacity)).resolves.toBe('0.6'); // grisée à l'écran
  await caseCopie.click({ force: true }).catch(() => {}); // même forcé, une case désactivée ne change pas
  await expect(caseCopie).toBeChecked();
  expect(drive.lectures).toContain('FICHIER_IMPORT_01');
  await page.locator('[data-role="form-lien"] [data-action="valider-lien"]').click();
  await champDoc('projets_projets', 'pr1', 'documents', [{ libelle: '1.png', url: 'https://drive.google.com/file/d/FICHIER_IMPORT_01/view' }]);
  expect(drive.copies).toHaveLength(0); // le fichier est déjà dans le dossier : pas de copie
  // Un fichier choisi dans « Google Drive » (ailleurs) : case active et cochée par défaut, qu'on peut décocher.
  drive.fichiers.FICHIER_AUTRE_001 = { parents: ['AUTRE_DOSSIER_123'] };
  await choisirDansGoogle(page, [unDocument('FICHIER_AUTRE_001', 'Ailleurs.pdf', 'https://drive.google.com/file/d/FICHIER_AUTRE_001/view')]);
  await page.locator('[data-action="ajouter-document-google"]').click();
  await expect(page.locator('[data-role="case-importe"]')).toHaveCount(0);
  const active = page.locator('[data-champ="copier"]');
  await expect(active).toBeEnabled();
  await expect(active).toBeChecked();
  await active.uncheck();
  await expect(active).not.toBeChecked();
});

test('P5 (secours) si Drive ne répond pas à files.get, le dossier d\'origine donné par la fenêtre Google sert à reconnaître l\'import', async ({ page, context }) => {
  const drive = await brancherGoogle(context);
  await creerProjet('pr1', { titre: 'Refonte site', urlDossier: URL_DOSSIER });
  await connecter(page);
  await aller(page, '#/projets/projets/pr1');
  await context.route('https://www.googleapis.com/drive/v3/files/FICHIER_SECOURS_01?**', (route) => route.fulfill({ status: 500, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: '{}' }));
  test.info().annotations.push({ type: 'erreurs-reseau-attendues' });
  await choisirDansGoogle(page, [{ ...unDocument('FICHIER_SECOURS_01', 'Secours.png', 'https://drive.google.com/file/d/FICHIER_SECOURS_01/view', 'image/png'), parentId: DOSSIER }]);
  await page.locator('[data-action="ajouter-document-google"]').click();
  await expect(page.locator('[data-role="case-importe"] input')).toBeDisabled();
  expect(drive.copies).toHaveLength(0);
});
