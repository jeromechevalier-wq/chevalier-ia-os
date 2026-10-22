// UN test permanent par règle de docs/consignes-ui.md. Le nom du test reprend les mots de Jérôme ; le test se déroule comme un utilisateur (vrais clics, états visibles),
// sur l'affaire ET le projet quand la règle vaut pour les deux, aux formats ordinateur et téléphone (les deux projets Playwright).
// Règles sans test ici (et pourquoi) : voir le bas du fichier et docs/google-drive.md.
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, expect, attendreCalme, connecter, allerAuxReglagesCrm, creerProjet, creerAffaire, creerTacheProjet, creerActivite, lireDocument, jour , ouvrirDocumentsSiPresent } from './outils.js';
import { brancherGoogle, lireGoogle, choisirDansGoogle, PARENT } from './google-simule.js';

const dialogue = (page) => page.getByRole('dialog');
async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); await ouvrirDocumentsSiPresent(page); } // ces tests parlent des documents : l'onglet « Documents » est ouvert d'office
async function champDoc(collection, id, cle, attendu) { await expect.poll(async () => (await lireDocument(`${collection}/${id}`))?.[cle], { timeout: 10_000 }).toEqual(attendu); }
const DOSSIER = '1AbC_dEf-1234567';
const URL_DOSSIER = `https://drive.google.com/drive/folders/${DOSSIER}`;
const FICHES = [
  { nom: 'projet', hash: '#/projets/projets/pr1', collection: 'projets_projets', id: 'pr1', section: 'projet-documents', details: 'projet-details', creer: (extra = {}) => creerProjet('pr1', { titre: 'Refonte site', ...extra }) },
  { nom: 'affaire', hash: '#/crm/affaires/a1', collection: 'crm_affaires', id: 'a1', section: 'affaire-documents', details: 'affaire-details', creer: (extra = {}) => creerAffaire('a1', { titre: 'Audit des Lilas', ...extra }) },
];
const fichierDrive = (id, nom, parents, type = 'application/pdf') => ({ id, name: nom, url: `https://drive.google.com/file/d/${id}/view`, mimeType: type, parents });

for (const f of FICHES) {
  test(`Affaire et projet fonctionnent pareil : sur ${f.nom}, l'onglet « Documents » a le « Dossier de travail » puis la ligne « Documents  + Ajouter » (plus de titre « Liens et documents », plus de bouton « Ajouter un lien web »), et « + Ajouter » du dossier propose les deux mêmes choix`, async ({ page, context }) => {
    await brancherGoogle(context);
    await f.creer();
    await connecter(page);
    await aller(page, f.hash);
    const liens = page.locator(`[data-section="${f.section}"]`);
    await expect(liens).not.toContainText('Liens et documents');
    await expect(page.locator('.compositeur [data-onglet="documents"]')).toHaveAttribute('aria-selected', 'true');
    await expect(page.locator('.section', { hasText: 'Liens et documents' })).toHaveCount(0); // plus de section dans la colonne de gauche
    await expect(liens.locator('[data-action="ajouter-lien"]')).toHaveCount(0);
    await expect(liens.getByText('Ajouter un lien web')).toHaveCount(0);
    await expect(liens.locator('[data-prop="documents"] .prop-libelle')).toContainText('Documents');
    await expect(liens.locator('[data-prop="documents"] [data-action="ajouter-document-google"]')).toHaveText('Ajouter');
    // Le dossier de travail est AU-DESSUS de la ligne « Documents ».
    await expect.poll(async () => {
      const d = await liens.locator('[data-prop="dossier"]').boundingBox();
      const t = await liens.locator('[data-prop="documents"]').boundingBox();
      return d && t ? d.y < t.y : null;
    }).toBe(true);
    await expect(page.locator('[data-prop="dossier"] .prop-libelle')).toContainText('Dossier de travail');
    await expect(page.locator('[data-prop="dossier"] [data-action="creer-dossier-ouvrir"]')).toHaveCount(0); // les choix n'apparaissent qu'après « + Ajouter »
    await page.locator('[data-prop="dossier"] [data-action="ajouter-dossier"]').click();
    await expect(page.locator('[data-prop="dossier"] .boutons-liens button')).toHaveText(['Créer un dossier dans Google Drive', 'Lier un dossier Google Drive existant']);
  });

  test(`Une liste déroulante change l'étape ou la phase ; la bande en haut est un simple indicateur : sur ${f.nom}, je clique sur la bande, rien ne change ; je choisis dans la liste, ça change`, async ({ page }) => {
    await f.creer();
    await connecter(page);
    await aller(page, f.hash);
    const bande = page.locator('.barre-etapes-fiche');
    await expect(bande.locator('button')).toHaveCount(0);
    const liste = page.locator(f.nom === 'projet' ? '[data-action="choisir-phase"]' : '[data-action="choisir-etape"]');
    const avant = await liste.inputValue();
    const autre = bande.locator('.etape:not(.courante)').last();
    await autre.click({ force: true });
    expect((await lireDocument(`${f.collection}/${f.id}`))[f.nom === 'projet' ? 'phase' : 'etape']).toBe(avant);
    const options = await liste.locator('option').evaluateAll((o) => o.map((x) => x.value));
    const cible = options.find((v) => v !== avant);
    await liste.selectOption(cible);
    await champDoc(f.collection, f.id, f.nom === 'projet' ? 'phase' : 'etape', cible);
    await expect(bande.locator('.etape.courante')).not.toHaveText(/^$/);
  });

  test(`Quand je retire un lien sur ${f.nom}, une fenêtre me demande confirmation, puis un message « Annuler » reste affiché 8 secondes et me le rend`, async ({ page }) => {
    await f.creer({ documents: [{ libelle: 'Devis', url: 'https://exemple.fr/devis' }] });
    await connecter(page);
    await aller(page, f.hash);
    await page.locator(`[data-section="${f.section}"]`).getByRole('button', { name: 'Retirer Devis' }).click();
    await expect(dialogue(page)).toBeVisible();
    await dialogue(page).getByRole('button', { name: 'Retirer' }).click();
    await champDoc(f.collection, f.id, 'documents', []);
    const annuler = page.locator('.toast [data-action="toast-action"]');
    await expect(annuler).toHaveText('Annuler');
    await annuler.click();
    await champDoc(f.collection, f.id, 'documents', [{ libelle: 'Devis', url: 'https://exemple.fr/devis' }]);
  });

  test(`Pas de bouton « Modifier » quand « Retirer » puis recréer suffit : le dossier de travail de ${f.nom} n'a que « Ouvrir » et « Retirer »`, async ({ page, context }) => {
    await brancherGoogle(context);
    await f.creer({ urlDossier: URL_DOSSIER });
    await connecter(page);
    await aller(page, f.hash);
    const ligne = page.locator('[data-prop="dossier"]');
    await expect(ligne.getByRole('button', { name: /Modifier/ })).toHaveCount(0);
    await expect(ligne.locator('[data-action="ouvrir-dossier"]')).toBeVisible();
    await expect(ligne.locator('[data-action="retirer-dossier"]')).toBeVisible();
    await expect(page.locator('[data-champ="dossier"]')).toHaveCount(0); // pas de champ pour coller une adresse
  });

  test(`Une adresse hors Google Drive ne se met pas dans le dossier de travail : sur ${f.nom}, le dossier n'a pas de champ d'adresse, il n'y a plus de bouton « Ajouter un lien web » (les adresses passent par les notes), et un lien web déjà enregistré reste affiché`, async ({ page, context }) => {
    await brancherGoogle(context);
    await f.creer({ documents: [{ libelle: 'Espace client', url: 'https://exemple.fr/espace/client' }] });
    await connecter(page);
    await aller(page, f.hash);
    await expect(page.locator('[data-prop="dossier"] input')).toHaveCount(0);
    await page.locator('[data-prop="dossier"] [data-action="ajouter-dossier"]').click();
    await expect(page.locator('[data-prop="dossier"] input')).toHaveCount(0);
    await expect(page.locator(`[data-section="${f.section}"] [data-action="ajouter-lien"]`)).toHaveCount(0);
    await expect(page.locator(`[data-section="${f.section}"]`).getByRole('link', { name: 'Espace client' })).toHaveAttribute('href', 'https://exemple.fr/espace/client');
  });

  test(`Message d'erreur clair, et https:// ajouté tout seul : sur ${f.nom}, plus de saisie d'adresse dans l'onglet « Documents » (la règle se vérifie dans les notes et dans la logique) ; un document ne peut venir que de la fenêtre Google, donc d'une adresse valide`, async ({ page, context }) => {
    await brancherGoogle(context);
    await f.creer({ urlDossier: URL_DOSSIER });
    await connecter(page);
    await aller(page, f.hash);
    const section = page.locator(`[data-section="${f.section}"]`);
    await expect(section.getByLabel('Lien web', { exact: true })).toHaveCount(0);
    await expect(section.locator('input[type="url"]')).toHaveCount(0);
    // la règle « https:// ajouté tout seul » reste dans la logique partagée (chargée dans la page)
    const r = await page.evaluate(async () => { const L = await import('/js/modules/crm/logique.js'); return [L.normaliserLienWeb('monsite.fr'), L.normaliserLienWeb('http:www.monsite.fr'), L.ajouterDocument({}, '', 'bonjour').erreurs.url]; });
    expect(r).toEqual(['https://monsite.fr', 'http://www.monsite.fr', 'L\'adresse doit commencer par http:// ou https://']);
  });

  test(`Nom et note facultatifs : sur ${f.nom}, je choisis un fichier dans Google, je garde le nom proposé, j'écris une note, je retrouve le document avec la note en petit et sa date d'ajout`, async ({ page, context }) => {
    const drive = await brancherGoogle(context);
    await f.creer({ urlDossier: URL_DOSSIER });
    await connecter(page);
    await aller(page, f.hash);
    drive.fichiers.FICHIER_NOTE_001 = { parents: [DOSSIER] };
    await choisirDansGoogle(page, [fichierDrive('FICHIER_NOTE_001', 'Portrait Chantal.pdf')]);
    const section = page.locator(`[data-section="${f.section}"]`);
    await section.locator('[data-action="ajouter-document-google"]').click();
    await section.getByLabel('Note (facultative)').fill('envoyé au client');
    await section.locator('[data-action="valider-lien"]').click();
    await expect(section.getByRole('link', { name: 'Portrait Chantal.pdf' })).toBeVisible();
    await expect(section.locator('.lien-note')).toHaveText('envoyé au client');
    await expect(section.locator('[data-role="date-ajout"]')).toContainText(/Ajouté le \d{2}\/\d{2}\/\d{4} \d{2}:\d{2}/);
  });

  test(`Sans dossier de travail, « Ajouter un document » affiche seulement un message avec « Fermer » : sur ${f.nom}, jamais de création ni de fenêtre qui s'ouvre et se ferme`, async ({ page, context }) => {
    const drive = await brancherGoogle(context);
    await f.creer();
    await connecter(page);
    await aller(page, f.hash);
    await page.locator(`[data-section="${f.section}"] [data-action="ajouter-document-google"]`).click();
    await expect(dialogue(page)).toContainText('on ne peut pas y ajouter de document');
    await expect(dialogue(page).locator('.dialogue-pied button')).toHaveText('Fermer');
    await dialogue(page).locator('.dialogue-pied button').click();
    expect(drive.requetes).toHaveLength(0);
    expect((await lireGoogle(page)).pickers).toHaveLength(0);
  });

  test(`Case « Copier dans le dossier de travail » cochée par défaut pour un fichier de Drive : sur ${f.nom}, je choisis un fichier de mon Drive, la case est cochée, je valide, le lien pointe vers la copie`, async ({ page, context }) => {
    const drive = await brancherGoogle(context);
    await f.creer({ urlDossier: URL_DOSSIER });
    await connecter(page);
    await aller(page, f.hash);
    drive.fichiers.FICHIER_DRIVE_001 = { parents: ['AUTRE_DOSSIER_123'] };
    await choisirDansGoogle(page, [fichierDrive('FICHIER_DRIVE_001', 'Devis.pdf')]);
    await page.locator(`[data-section="${f.section}"] [data-action="ajouter-document-google"]`).click();
    await expect(page.locator('[data-champ="copier"]')).toBeChecked();
    await expect(page.locator('[data-champ="copier"]')).toBeEnabled();
    await page.locator('[data-action="valider-lien"]').click();
    await champDoc(f.collection, f.id, 'documents', [{ libelle: 'Devis.pdf', url: 'https://drive.google.com/file/d/COPIE_1_abcdefghij/view', ajouteLe: expect.any(String) }]);
    expect(drive.copies[0].corps.parents).toEqual([DOSSIER]);
  });

  test(`Quand je décoche « Copier » pour un fichier importé de mon ordinateur… je ne peux pas : sur ${f.nom}, la case est grisée et cochée avec le message grisé, mon clic ne la décoche pas, le fichier n'est pas copié`, async ({ page, context }) => {
    const drive = await brancherGoogle(context);
    await f.creer({ urlDossier: URL_DOSSIER });
    await connecter(page);
    await aller(page, f.hash);
    drive.fichiers.FICHIER_IMPORT_01 = { parents: [DOSSIER], createdTime: new Date().toISOString() }; // créé à l'instant, dans le dossier de travail : c'est un import
    await choisirDansGoogle(page, [fichierDrive('FICHIER_IMPORT_01', '1.png', undefined, 'image/png')]);
    await page.locator(`[data-section="${f.section}"] [data-action="ajouter-document-google"]`).click();
    const importe = page.locator('[data-role="case-importe"]');
    await expect(importe).toContainText('Le fichier est envoyé dans le dossier de travail');
    const caseCopie = importe.locator('input');
    await expect(caseCopie).toBeChecked();
    await expect(caseCopie).toBeDisabled();
    await importe.click({ force: true }); // un vrai clic de souris sur la case ou son texte (Playwright la juge « désactivée », d'où force) : rien ne change
    await expect(caseCopie).toBeChecked();
    await page.locator('[data-action="valider-lien"]').click();
    await champDoc(f.collection, f.id, 'documents', [{ libelle: '1.png', url: 'https://drive.google.com/file/d/FICHIER_IMPORT_01/view', ajouteLe: expect.any(String) }]);
    expect(drive.copies).toHaveLength(0);
  });

  test(`L'icône « i » explique ; elle marche au survol, au clavier et au toucher : sur ${f.nom}, à côté de « Documents » et du « Dossier de travail »`, async ({ page, context }, info) => {
    await brancherGoogle(context);
    await f.creer();
    await connecter(page);
    await aller(page, f.hash);
    for (const icone of [page.locator(`[data-section="${f.section}"] [data-prop="documents"] [data-role="info"]`), page.locator('[data-prop="dossier"] [data-role="info"]')]) {
      const bulle = icone.locator('[data-role="bulle-info"]');
      await expect(bulle).toBeHidden();
      await icone.focus(); // clavier
      await expect(bulle).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(bulle).toBeHidden();
      await icone.dispatchEvent('click'); // toucher
      await expect(bulle).toBeVisible();
      await page.locator('.titre-editable').click();
      await expect(bulle).toBeHidden();
      if (info.project.name === 'ordinateur') { // survol à la souris
        await icone.hover();
        await expect(bulle).toBeVisible();
        await page.mouse.move(2, 2);
        await expect(bulle).toBeHidden();
      }
    }
  });
}

test('Tâche, activité et point clé fonctionnent pareil : sur le projet, je clique sur le texte et je le modifie sur place, je clique sur la date et je la change, le rond termine, le menu « … » ne garde que les actions rares', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Refonte site' });
  await creerTacheProjet('t1', { titre: 'Écrire le devis', projetId: 'pr1', date: jour(-1) });
  await creerActivite('ac1', { titre: 'Appeler le client', projetId: 'pr1', type: 'appel', date: jour(-1) });
  await connecter(page);
  await aller(page, '#/projets/projets/pr1');
  for (const [ligne, collection, id, titreSel, champTexte, nouveau] of [
    [page.locator('.tache[data-tache="t1"]'), 'projets_taches', 't1', '[data-role="titre-tache"]', 'Modifier le texte du livrable', 'Écrire le devis final'],
    [page.locator('.activite[data-activite="ac1"]'), 'crm_activites', 'ac1', '.activite-titre-modifiable', 'Modifier le texte de l’activité', 'Appeler le client demain'],
  ]) {
    await ligne.locator(titreSel).click(); // clic sur le texte = modifier sur place
    await expect(ligne.getByLabel(champTexte)).toBeFocused(); // le champ est bien posé et actif avant de taper
    await ligne.getByLabel(champTexte).fill(nouveau);
    await ligne.getByLabel(champTexte).press('Enter');
    await champDoc(collection, id, 'titre', nouveau);
    await ligne.locator('.activite-date-modifiable').click(); // clic sur la date = changer la date
    await expect(dialogue(page)).toContainText('Changer la date');
    await dialogue(page).locator('[data-date-rapide="demain"]').click();
    await champDoc(collection, id, 'date', jour(1));
  }
  // Le menu « … » : actions rares seulement.
  await page.locator('.tache[data-tache="t1"] [data-action="menu-tache"]').click();
  const entreesTache = await page.locator('.menu-pop [role="menuitem"]').allInnerTexts();
  expect(entreesTache).not.toContain('Terminer');
  expect(entreesTache.at(-1)).toBe('Supprimer');
  await page.keyboard.press('Escape');
  await page.locator('.activite[data-activite="ac1"]').getByRole('button', { name: /Actions/ }).click();
  expect(await page.locator('.menu-pop [role="menuitem"]').allInnerTexts()).toEqual(['Supprimer']);
  await page.keyboard.press('Escape');
  // Le rond termine.
  await page.locator('.tache[data-tache="t1"] [data-action="faire-tache"]').click();
  await champDoc('projets_taches', 't1', 'fait', true);
});

test('Tâche, activité et point clé fonctionnent pareil : sur l\'affaire, le point clé se modifie au clic sur le texte et sur la date, le rond le termine, le menu « … » n\'a que « Supprimer »', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await creerActivite('ac1', { titre: 'Appeler le client', affaireId: 'a1', type: 'appel', date: jour(-1) });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  const ligne = page.locator('.activite[data-activite="ac1"]');
  await ligne.locator('.activite-titre-modifiable').click();
  await expect(ligne.getByLabel('Modifier le texte de l’activité')).toBeFocused();
  await ligne.getByLabel('Modifier le texte de l’activité').fill('Appeler le client demain');
  await ligne.getByLabel('Modifier le texte de l’activité').press('Enter');
  await champDoc('crm_activites', 'ac1', 'titre', 'Appeler le client demain');
  await ligne.locator('.activite-date-modifiable').click();
  await dialogue(page).locator('[data-date-rapide="3j"]').click();
  await champDoc('crm_activites', 'ac1', 'date', jour(3));
  await ligne.getByRole('button', { name: /Actions/ }).click();
  expect(await page.locator('.menu-pop [role="menuitem"]').allInnerTexts()).toEqual(['Supprimer']);
  await page.keyboard.press('Escape');
  await ligne.locator('.case-fait').click();
  await expect.poll(async () => (await lireDocument('crm_activites/ac1')).fait).toBe(true);
});

test('Quand je retire le dossier parent, une sous-dossier, une étiquette ou un filtre dans les Réglages, je confirme, puis je peux annuler', async ({ page }) => {
  await connecter(page);
  await expect.poll(async () => (await lireDocument('crm_parametres/reglages')) !== null).toBe(true);
  const { ecrireDocument } = await import('./outils.js');
  await ecrireDocument('crm_parametres/reglages', { ...(await lireDocument('crm_parametres/reglages')), dossierParentDrive: { id: PARENT, nom: 'Clients 2026' }, sousDossiersDrive: ['Contrat'] });
  await allerAuxReglagesCrm(page);
  await page.locator('[data-action="retirer-dossier-parent"]').click();
  await expect(dialogue(page)).toBeVisible();
  await dialogue(page).getByRole('button', { name: 'Retirer' }).click();
  await champDoc('crm_parametres', 'reglages', 'dossierParentDrive', null);
  await page.locator('.toast [data-action="toast-action"]').last().click();
  await champDoc('crm_parametres', 'reglages', 'dossierParentDrive', { id: PARENT, nom: 'Clients 2026' });
});

test('On dit « dossier », jamais « répertoire » : je parcours l\'affaire, le projet, les Réglages et je ne lis jamais « répertoire » ; le code de l\'appli non plus', async ({ page, context }) => {
  await brancherGoogle(context);
  await creerProjet('pr1', { titre: 'Refonte site' });
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await connecter(page);
  for (const hash of ['#/crm/affaires/a1', '#/projets/projets/pr1']) {
    await aller(page, hash);
    await expect(page.locator('[data-prop="dossier"]')).toBeVisible();
    expect((await page.locator('body').innerText()) + (await page.locator('[data-role="bulle-info"]').allTextContents()).join(' ')).not.toMatch(/répertoire/i);
  }
  await allerAuxReglagesCrm(page);
  await expect(page.locator('#reglages-projets')).toBeVisible();
  expect((await page.locator('body').innerText()).toLowerCase()).not.toContain('répertoire');
  // Le code des écrans (chaînes affichées) ne contient pas le mot non plus.
  const racine = fileURLToPath(new URL('../../js/', import.meta.url));
  const fichiers = []; const parcourir = (d) => { for (const n of readdirSync(d)) { const c = join(d, n); statSync(c).isDirectory() ? parcourir(c) : c.endsWith('.js') && fichiers.push(c); } };
  parcourir(racine);
  expect(fichiers.filter((c) => /répertoire/i.test(readFileSync(c, 'utf8')))).toEqual([]);
});

/*
 * Règles de docs/consignes-ui.md SANS test permanent ici (dites clairement, pas masquées) :
 * - « Les filtres se combinent toujours ; chaque liste ne propose que les valeurs possibles » : relève de l'écran Automatisations (tests automatisations-logique, 2.7.3) ; non rejoué ici.
 * - « Un mot = une seule chose (deux compteurs n'ont jamais le même nom) » : relecture humaine, pas de test automatique fiable.
 * - « Cas vide, cas d'erreur et chargement de chaque écran sont décrits et testés » : règle de méthode (recette), couverte écran par écran dans les tests de chaque écran.
 * - « Les compteurs qui changent chaque seconde ont des chiffres de largeur fixe » : `tabular-nums` est posé sur les compteurs existants (objectifs, dates de cartes, automatisations) ; pas de test de rendu ajouté ici.
 */
