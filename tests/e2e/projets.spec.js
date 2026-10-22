import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
// Tests C : écran Projets (étape 2 : Kanban par phase, liste, fiche), formats 1440 × 900 et 390 × 844.
import {
  test, expect, connecter, allerA, allerAuxReglagesCrm, creerPersonne, creerOrganisation, creerAffaire, creerProjet, creerTacheProjet, creerActivite, lireDocument, listerDocuments, ecrireDocument,
  jour, estTelephone, valeurObjectif, JEROME, ouvrirDocuments,
} from './outils.js';

// Les scénarios de ce fichier sont indépendants (chacun repart d'une base vide) : ils se répartissent sur plusieurs workers.
test.describe.configure({ mode: 'parallel' });

const dialogue = (page) => page.getByRole('dialog');
const LIBELLES = { lancement: 'Lancement', decouverte: 'Découverte', livraison: 'Livraison', cloture: 'Clôture' };

async function aller(page, hash) {
  await page.evaluate((h) => { location.hash = h; }, hash);
}

/** Termine le projet depuis sa fiche : la célébration de clôture apparaît, on la ferme. */
async function terminerDepuisFiche(page) {
  await page.locator('.fiche-actions [data-action="terminer"]').click();
  await expect(page.locator('.celebration-cloture')).toBeVisible();
  await page.locator('.celebration').click();
  await expect(page.locator('.celebration')).toHaveCount(0);
}

async function champDoc(collection, id, cle, attendu) {
  await expect.poll(async () => (await lireDocument(`${collection}/${id}`))?.[cle], { timeout: 10_000 }).toEqual(attendu);
}

async function attendre(collection, predicat) {
  await expect.poll(async () => (await listerDocuments(collection)).find(predicat) ?? null, { timeout: 10_000 }).not.toBeNull();
  return (await listerDocuments(collection)).find(predicat);
}

/** Change la phase d'une carte : glisser déposer sur ordinateur, menu « Déplacer vers… » sur téléphone. */
async function deplacer(page, id, phase) {
  const carte = page.locator(`.carte-projet[data-projet="${id}"]`);
  await expect(carte).toBeVisible();
  if (estTelephone(page)) {
    await carte.locator('.carte-menu').click();
    await page.locator('.menu-pop').getByRole('menuitem', { name: `Déplacer vers : ${LIBELLES[phase]}` }).click();
    return;
  }
  const avant = (await lireDocument(`projets_projets/${id}`)).phase;
  await page.mouse.move(700, 700);
  await carte.dragTo(page.locator(`.colonne[data-colonne="${phase}"]`));
  try {
    await expect.poll(async () => (await lireDocument(`projets_projets/${id}`)).phase !== avant, { timeout: 2500 }).toBe(true);
  } catch {
    // Chromium sans écran ignore parfois un second glisser : mêmes événements rejoués avec un DataTransfer (mêmes gestionnaires).
    await page.evaluate(([projet, colonne]) => {
      const dt = new DataTransfer();
      const c = document.querySelector(`.carte-projet[data-projet="${projet}"]`);
      const k = document.querySelector(`.colonne[data-colonne="${colonne}"]`);
      c.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
      k.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
      k.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
      c.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
    }, [id, phase]);
  }
}

test('C29 menu « Projets » et bouton « + » : un projet se crée en ne tapant que le titre, au bon endroit, avec sa trace dans le journal', { tag: '@smoke' }, async ({ page }) => {
  await connecter(page);
  await allerA(page, 'Projets');
  await expect(page).toHaveURL(/#\/projets\/projets$/);
  await expect(page.getByRole('heading', { name: 'Projets', level: 1 })).toBeVisible();
  await expect(page.locator('.etat-vide')).toContainText('Ajoute ton premier projet');
  // le bouton « + » de la barre propose aussi « Projet »
  const plus = page.locator(estTelephone(page) ? '.bouton-plus-mobile' : '.bouton-plus:not(.bouton-plus-mobile)');
  await plus.click();
  await expect(page.locator('.menu-pop').getByRole('menuitem')).toHaveText(['Personne', 'Organisation', 'Affaire', 'Projet']);
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Projet' }).click();
  await expect(dialogue(page)).toContainText('Ajouter un projet');
  // le titre est le seul champ obligatoire
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialogue(page).getByRole('alert')).toContainText('Le titre est obligatoire.');
  expect(await listerDocuments('projets_projets')).toHaveLength(0);
  await dialogue(page).getByLabel('Titre', { exact: true }).fill('Site chevalier-ia.fr');
  await dialogue(page).getByLabel('Titre', { exact: true }).press('Enter');
  await expect(dialogue(page)).toHaveCount(0);
  const p = await attendre('projets_projets', (d) => d.titre === 'Site chevalier-ia.fr');
  expect(p).toMatchObject({ phase: 'lancement', statut: 'actif', affaireId: null, archive: false, proprietaire: JEROME, dateDebut: jour(0) });
  await expect(page.locator(`.colonne[data-colonne="lancement"] .carte-projet[data-projet="${p.id}"]`)).toContainText('Site chevalier-ia.fr');
  for (const ph of ['decouverte', 'livraison', 'cloture']) await expect(page.locator(`.colonne[data-colonne="${ph}"] .carte-projet`)).toHaveCount(0);
  // fil et journal : l'événement « Projet créé » et les lignes d'audit (projet + événement + note épinglée de départ (I5), même lot)
  const ev = await attendre('crm_evenements', (e) => e.type === 'projet_cree');
  expect(ev).toMatchObject({ projetId: p.id, texte: 'Projet créé : Site chevalier-ia.fr' });
  await expect.poll(async () => (await listerDocuments('crm_audit')).filter((l) => l.outil === 'creerProjet').length).toBe(3);
  const lignes = (await listerDocuments('crm_audit')).filter((l) => l.outil === 'creerProjet');
  expect(lignes.map((l) => l.collection).sort()).toEqual(['crm_evenements', 'crm_notes', 'projets_projets']);
  const copie = await lireDocument(`crm_audit_avant/${lignes.find((l) => l.collection === 'projets_projets').id}`);
  expect(copie.apres.titre).toBe('Site chevalier-ia.fr');
});

test('C29 la création reprend la personne et l’organisation choisies, une personne tapée est créée', async ({ page }) => {
  await creerOrganisation('o1', { nom: 'Atelier des Lilas' });
  await creerPersonne('p1', { nom: 'Camille Durand', organisationId: 'o1' });
  await connecter(page);
  await allerA(page, 'Projets');
  await page.locator('.page-actions [data-action="nouveau-projet"]').click();
  await dialogue(page).getByLabel('Titre', { exact: true }).fill('Audit des Lilas');
  await dialogue(page).getByLabel('Personne', { exact: true }).fill('Camille');
  await dialogue(page).locator('ul.suggestions[aria-label="Suggestions : Personne"] .suggestion').first().click();
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  const p = await attendre('projets_projets', (d) => d.titre === 'Audit des Lilas');
  expect(p).toMatchObject({ personneId: 'p1', organisationId: 'o1', affaireId: null });
  await expect(page.locator(`.carte-projet[data-projet="${p.id}"]`)).toContainText('Atelier des Lilas');
  await expect(page.locator(`.carte-projet[data-projet="${p.id}"]`)).toContainText('Camille Durand');
});

test('C29 glisser un projet de Lancement à Découverte puis revenir : phase, dates d’entrée et événements à jour', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Audit Carrel' });
  await connecter(page);
  await allerA(page, 'Projets');
  await deplacer(page, 'pr1', 'decouverte');
  await champDoc('projets_projets', 'pr1', 'phase', 'decouverte');
  const p = await lireDocument('projets_projets/pr1');
  expect(p.statut).toBe('actif');
  expect(Object.keys(p.datesPhases).sort()).toEqual(['decouverte', 'lancement']);
  await expect(page.locator('.colonne[data-colonne="decouverte"] .carte-projet[data-projet="pr1"]')).toBeVisible();
  await expect(page.locator('.colonne[data-colonne="decouverte"] .colonne-totaux')).toHaveText('1 projet');
  await deplacer(page, 'pr1', 'lancement');
  await champDoc('projets_projets', 'pr1', 'phase', 'lancement');
  const textes = (await listerDocuments('crm_evenements')).filter((e) => e.type === 'phase_changee').map((e) => e.texte).sort();
  expect(textes).toEqual(['Phase : Découverte → Lancement', 'Phase : Lancement → Découverte']);
  expect((await listerDocuments('crm_evenements')).every((e) => e.projetId === 'pr1')).toBe(true);
});

test('C29 fiche : la barre des phases change la phase ; En pause, Reprendre, Terminer (archivé, hors du tableau) et Rouvrir', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Audit Carrel' });
  await connecter(page);
  await aller(page, '#/projets/projets/pr1');
  await expect(page.locator('.fiche')).toBeVisible();
  await expect(page.locator('.titre-editable')).toHaveValue('Audit Carrel');
  await expect(page.locator('.barre-etapes-fiche .etape.courante')).toHaveText('Lancement');
  await page.locator('[data-action="choisir-phase"]').selectOption('livraison'); // la bande du haut n'est plus qu'un indicateur
  await champDoc('projets_projets', 'pr1', 'phase', 'livraison');
  await expect(page.locator('.barre-etapes-fiche .etape.courante')).toHaveText('Livraison');
  // pause et reprise
  await page.locator('.fiche-actions [data-action="en-pause"]').click();
  await champDoc('projets_projets', 'pr1', 'statut', 'en_pause');
  await expect(page.locator('.fiche-sous .pastille-statut')).toHaveText('En pause');
  await page.locator('.fiche-actions [data-action="reprendre"]').click();
  await champDoc('projets_projets', 'pr1', 'statut', 'actif');
  // terminer : Clôture, Terminé, archivé
  await terminerDepuisFiche(page);
  await champDoc('projets_projets', 'pr1', 'statut', 'termine');
  const fini = await lireDocument('projets_projets/pr1');
  expect(fini).toMatchObject({ phase: 'cloture', archive: true });
  await expect(page.locator('.barre-etapes-fiche .etape.courante')).toHaveText('Clôture');
  await expect(page.locator('.fiche-sous .badge-archive')).toBeVisible();
  await allerA(page, 'Projets');
  // Le tableau ne montre que les projets actifs : le projet terminé n'y est plus, et sa fin ne crée plus aucun projet (extraction supprimée le 18/10/2026).
  // On attend d'abord le projet terminé dans les Archives (preuve que la liste a reçu Firestore) avant de vérifier que le tableau est vide.
  await page.locator('.bascule-vue[data-vue="archives"]').click();
  await expect(page.locator('.tableau-projets')).toContainText('Audit Carrel');
  expect((await listerDocuments('projets_projets')).map((d) => d.titre)).toEqual(['Audit Carrel']);
  await page.locator('.bascule-vue[data-vue="kanban"]').click();
  await expect(page.locator('.carte-projet')).toHaveCount(0);
  await page.locator('.bascule-vue[data-vue="archives"]').click();
  await page.locator('.tableau-projets a', { hasText: 'Audit Carrel' }).click();
  // rouvrir
  await page.locator('.fiche-actions [data-action="rouvrir"]').click();
  await champDoc('projets_projets', 'pr1', 'statut', 'actif');
  expect((await lireDocument('projets_projets/pr1')).archive).toBe(false);
  const types = (await listerDocuments('crm_evenements')).map((e) => e.type).sort();
  expect(types).toEqual(['phase_changee', 'projet_en_pause', 'projet_repris', 'projet_rouvert', 'projet_termine']); // aucun « projet_cree » : la fin du projet ne crée plus d'extraction
});

test('C29 fiche : titre, dates (la fin ne précède pas le début), dossier de travail, liens et documents', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Audit Carrel', dateDebut: '2026-10-10' });
  await connecter(page);
  await aller(page, '#/projets/projets/pr1');
  await page.locator('.titre-editable').fill('Audit Carrel complet');
  await page.locator('.titre-editable').press('Enter');
  await champDoc('projets_projets', 'pr1', 'titre', 'Audit Carrel complet');
  // fin avant le début : refusée avec un message, rien n'est enregistré
  await page.getByRole('button', { name: 'Ajouter : Fin prévue' }).click();
  await page.getByLabel('Fin prévue', { exact: true }).fill('2026-10-01');
  await page.getByLabel('Fin prévue', { exact: true }).press('Enter');
  await expect(page.locator('.toast')).toContainText('La fin ne peut pas précéder le début.');
  expect((await lireDocument('projets_projets/pr1')).dateFin).toBeNull();
  await expect(page.getByRole('button', { name: 'Ajouter : Fin prévue' })).toBeVisible();
  await page.getByRole('button', { name: 'Ajouter : Fin prévue' }).click();
  await page.getByLabel('Fin prévue', { exact: true }).fill('2026-11-30');
  await page.getByLabel('Fin prévue', { exact: true }).press('Enter');
  await champDoc('projets_projets', 'pr1', 'dateFin', '2026-11-30');
  // Détails : le dossier de travail accepte n'importe quel lien ; plus de champ GitHub ni de « Créer le GitHub »
  await expect(page.locator('[data-champ="github"], [data-action="creer-github"]')).toHaveCount(0);
  await expect(page.locator('[data-champ="dossier"]')).toHaveCount(0); // plus de champ pour coller une adresse : une adresse web va dans une note
  // Documents : la ligne « Documents  + Ajouter » ; plus de bouton « Ajouter un lien web » (les adresses passent par les notes), un lien déjà enregistré reste affiché avec sa note.
  await ecrireDocument('projets_projets/pr1', { ...(await lireDocument('projets_projets/pr1')), documents: [{ libelle: 'Devis signé', url: 'https://drive.google.com/file/d/abc/view', note: 'envoyé au client' }] });
  await ouvrirDocuments(page);
  await expect(page.locator('[data-section="projet-documents"]')).not.toContainText('Liens et documents');
  await expect(page.locator('[data-section="projet-documents"] [data-prop="documents"] .prop-libelle')).toContainText('Documents');
  await expect(page.locator('[data-action="ajouter-lien"]')).toHaveCount(0);
  await expect(page.locator('[data-section="projet-documents"]')).toContainText('Devis signé');
  await expect(page.locator('[data-section="projet-documents"] .lien-note')).toHaveText('envoyé au client');
  await expect(page.locator('[data-section="projet-documents"] [data-role="date-ajout"]')).toHaveCount(0); // un ancien document sans date n'en affiche pas
});

test('Favoris : l’étoile d’un document d’affaire ou de projet le met sur l’accueil ; l’étoile de l’accueil le retire', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas', etape: 'gagne', documents: [{ libelle: 'Suivi veille', url: 'https://claude.ai/artifact/suivi' }] });
  await creerProjet('pr1', { titre: 'Chantier Lilas', affaireId: 'a1', documents: [{ libelle: 'Planning', url: 'https://claude.ai/artifact/planning' }] });
  await connecter(page);
  await expect(page.locator('.section-favoris')).toContainText('Aucun favori');
  // étoile sur le document de l'affaire
  await aller(page, '#/crm/affaires/a1');
  await ouvrirDocuments(page);
  await page.getByRole('button', { name: 'Mettre Suivi veille en favori' }).click();
  await champDoc('crm_affaires', 'a1', 'documents', [{ libelle: 'Suivi veille', url: 'https://claude.ai/artifact/suivi', favori: true }]);
  await expect(page.getByRole('button', { name: 'Retirer Suivi veille des favoris' })).toHaveAttribute('aria-pressed', 'true');
  // le Journal le dit en clair
  await allerA(page, 'Journal des modifications');
  await page.locator('.tableau-journal tbody tr').first().click();
  await expect(dialogue(page)).toContainText('Favori ajouté : Suivi veille');
  await dialogue(page).getByText('Fermer', { exact: true }).click();
  await expect(dialogue(page)).toHaveCount(0);
  // étoile sur le document du projet
  await aller(page, '#/projets/projets/pr1');
  await ouvrirDocuments(page);
  await page.getByRole('button', { name: 'Mettre Planning en favori' }).click();
  await champDoc('projets_projets', 'pr1', 'documents', [{ libelle: 'Planning', url: 'https://claude.ai/artifact/planning', favori: true }]);
  // les deux sont sur l'accueil, par ordre alphabétique, avec un lien vers le document
  await aller(page, '#/crm/accueil');
  await expect(page.locator('.section-favoris li')).toHaveCount(2);
  await expect(page.locator('.section-favoris li a').first()).toHaveText('Planning');
  await expect(page.locator('.section-favoris li a[href="https://claude.ai/artifact/suivi"]')).toHaveText('Suivi veille');
  // retirer l'étoile depuis l'accueil
  await page.locator('.section-favoris').getByRole('button', { name: 'Retirer Planning des favoris' }).click();
  await expect.poll(async () => (await lireDocument('projets_projets/pr1')).documents).toEqual([{ libelle: 'Planning', url: 'https://claude.ai/artifact/planning' }]);
  // le favori retiré reste affiché (grisé) pour pouvoir être remis d'un clic
  await expect(page.locator('.section-favoris li')).toHaveCount(2);
  await expect(page.locator('.section-favoris li.favori-retire a[href="https://claude.ai/artifact/planning"]')).toHaveText('Planning');
  await page.locator('.section-favoris').getByRole('button', { name: 'Mettre Planning en favori' }).click();
  await expect.poll(async () => (await lireDocument('projets_projets/pr1')).documents).toEqual([{ libelle: 'Planning', url: 'https://claude.ai/artifact/planning', favori: true }]);
  await expect(page.locator('.section-favoris li.favori-retire')).toHaveCount(0);
  // en quittant l'accueil puis en y revenant, un favori retiré a bien disparu
  await page.locator('.section-favoris').getByRole('button', { name: 'Retirer Planning des favoris' }).click();
  await expect.poll(async () => (await lireDocument('projets_projets/pr1')).documents).toEqual([{ libelle: 'Planning', url: 'https://claude.ai/artifact/planning' }]);
  await aller(page, '#/crm/affaires');
  await aller(page, '#/crm/accueil');
  await expect(page.locator('.section-favoris li')).toHaveCount(1);
});

test('C29 fiche projet : phase modifiable depuis le Résumé (sans ligne Statut) ; appel, rendez vous et email rattachés au projet (avec la pastille Tâche, J4)', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Camille Durand' });
  await creerProjet('pr1', { titre: 'Audit des Lilas', personneId: 'p1' });
  await connecter(page);
  await aller(page, '#/projets/projets/pr1');
  const resume = page.locator('[data-section="projet-resume"]');
  await expect(resume).not.toContainText('Statut');
  await resume.locator('[data-action="choisir-phase"]').selectOption('decouverte');
  await champDoc('projets_projets', 'pr1', 'phase', 'decouverte');
  await expect(page.locator('.barre-etapes-fiche .etape.courante')).toHaveText('Découverte');
  const panneau = page.locator('.panneau-activite');
  await expect(panneau.getByRole('group', { name: 'Type d’activité' }).getByRole('button')).toHaveText(['Appel', 'Rendez vous', 'Email', 'Tâche']);
  await panneau.getByRole('button', { name: 'Rendez vous' }).click();
  await panneau.getByLabel('Titre de l’activité').fill('Point de lancement');
  await panneau.locator('[data-action="enregistrer-activite"]').click();
  const activite = await attendre('crm_activites', (d) => d.projetId === 'pr1');
  expect(activite).toMatchObject({ type: 'rendez_vous', titre: 'Point de lancement', personneId: 'p1', projetId: 'pr1', fait: false });
  await expect(panneau.locator('.points-cles')).toContainText('Point de lancement');
});

test('C29 notes d’un projet : onglets Activité et Notes ; la note est aussi dans l’historique de la personne, de l’organisation et de l’affaire', async ({ page }) => {
  await creerOrganisation('o1', { nom: 'Atelier des Lilas' });
  await creerPersonne('p1', { nom: 'Camille Durand', organisationId: 'o1' });
  await creerAffaire('a1', { titre: 'Audit des Lilas', personneId: 'p1', organisationId: 'o1', etape: 'gagne' });
  await creerProjet('pr1', { titre: 'Audit des Lilas', affaireId: 'a1', personneId: 'p1', organisationId: 'o1' });
  await connecter(page);
  await aller(page, '#/projets/projets/pr1');
  const panneau = page.locator('.panneau-activite');
  await expect(panneau.getByRole('tab')).toHaveCount(3); // Activité, Notes, Documents
  await expect(panneau.getByRole('tab', { name: 'Activité' })).toHaveAttribute('aria-selected', 'true');
  await panneau.getByRole('tab', { name: 'Notes' }).click();
  await expect(panneau.getByRole('tab', { name: 'Notes' })).toHaveAttribute('aria-selected', 'true');
  await expect(panneau).not.toContainText('null');
  await expect(page.locator('.fiche-sous')).toContainText('Camille Durand');
  await expect(page.locator('[data-section="projet-resume"]')).toContainText('Audit des Lilas');
  await panneau.getByLabel('Nouvelle note').fill('Interview prévue jeudi');
  await panneau.locator('[data-action="ajouter-note"]').click();
  const note = await attendre('crm_notes', (d) => d.projetId === 'pr1');
  expect(note).toMatchObject({ texte: 'Interview prévue jeudi', personneId: 'p1', organisationId: 'o1', affaireId: 'a1', projetId: 'pr1', auteur: JEROME });
  await expect(panneau.locator('.fil-note')).toContainText('Interview prévue jeudi');
  for (const hash of ['#/crm/personnes/p1', '#/crm/organisations/o1', '#/crm/affaires/a1']) {
    await aller(page, hash);
    await expect(page.locator('.historique .fil-note')).toContainText('Interview prévue jeudi');
  }
});

test('C29 supprimer un projet : titre exigé ; ses notes et événements partent, l’affaire reste et perd son lien ; supprimer une affaire garde son projet', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Camille Durand' });
  await creerAffaire('a1', { titre: 'Atelier IA', personneId: 'p1', etape: 'gagne', projetId: 'pr1' });
  await creerProjet('pr1', { titre: 'Atelier IA', affaireId: 'a1', personneId: 'p1' });
  await creerAffaire('a2', { titre: 'Site vitrine', personneId: 'p1', etape: 'gagne', projetId: 'pr2' });
  await creerProjet('pr2', { titre: 'Site vitrine', affaireId: 'a2', personneId: 'p1' });
  await ecrireDocument('crm_notes/n1', { texte: 'Note du projet', personneId: 'p1', organisationId: null, affaireId: 'a1', projetId: 'pr1', auteur: JEROME, creeLe: new Date(), modifieLe: new Date() });
  await ecrireDocument('crm_evenements/ev2', { type: 'projet_cree', texte: 'Projet créé : Site vitrine', personneId: 'p1', organisationId: null, affaireId: 'a2', projetId: 'pr2', auteur: JEROME, date: new Date() });
  await connecter(page);
  // projet : annuler conserve, le bon titre supprime
  await aller(page, '#/projets/projets/pr1');
  await page.locator('[data-action="menu-fiche"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: /Supprimer définitivement/ }).click();
  await dialogue(page).getByRole('button', { name: 'Annuler' }).click();
  expect(await lireDocument('projets_projets/pr1')).not.toBeNull();
  await page.locator('[data-action="menu-fiche"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: /Supprimer définitivement/ }).click();
  await dialogue(page).getByLabel(/Tape « Atelier IA »/).fill('mauvais titre');
  await dialogue(page).getByRole('button', { name: 'Supprimer' }).click();
  await expect(dialogue(page)).toBeVisible();
  expect(await lireDocument('projets_projets/pr1')).not.toBeNull();
  await dialogue(page).getByLabel(/Tape « Atelier IA »/).fill('atelier ia');
  await dialogue(page).getByRole('button', { name: 'Supprimer' }).click();
  await expect.poll(async () => await lireDocument('projets_projets/pr1')).toBeNull();
  await expect(page).toHaveURL(/#\/projets\/projets$/);
  expect(await lireDocument('crm_notes/n1')).toBeNull();
  expect(await lireDocument('crm_affaires/a1')).not.toBeNull();
  await champDoc('crm_affaires', 'a1', 'projetId', null);
  // affaire : sa suppression ne supprime pas son projet, seul le lien est vidé ; le fil du projet reste
  await aller(page, '#/crm/affaires/a2');
  await page.locator('[data-action="menu-fiche"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: /Supprimer définitivement/ }).click();
  await dialogue(page).getByLabel(/Tape « Site vitrine »/).fill('Site vitrine');
  await dialogue(page).getByRole('button', { name: 'Supprimer' }).click();
  await expect.poll(async () => await lireDocument('crm_affaires/a2')).toBeNull();
  await champDoc('projets_projets', 'pr2', 'affaireId', null);
  expect(await lireDocument('projets_projets/pr2')).toMatchObject({ titre: 'Site vitrine', personneId: 'p1', affaireId: null });
  expect(await lireDocument('crm_evenements/ev2')).toMatchObject({ projetId: 'pr2', affaireId: null, personneId: 'p1' });
});

test('C29 liste, filtres, recherche et recherche globale', async ({ page }) => {
  await creerOrganisation('o1', { nom: 'Atelier des Lilas' });
  await creerPersonne('p1', { nom: 'Élodie Martin' });
  await creerProjet('pr1', { titre: 'Audit Carrel', phase: 'lancement', organisationId: 'o1' });
  await creerProjet('pr2', { titre: 'Accompagnement Martin', phase: 'livraison', personneId: 'p1', dateFin: jour(-3) });
  await creerProjet('pr3', { titre: 'Revue Carrel', phase: 'decouverte', statut: 'en_pause' });
  await creerProjet('pr4', { titre: 'Ancien chantier', phase: 'cloture', statut: 'termine', archive: true });
  await connecter(page);
  await allerA(page, 'Projets');
  await expect(page.locator('.compteur-liste')).toHaveText('3 projets');
  await expect(page.locator('.carte-projet .badge-nature')).toHaveCount(0); // plus de badge « Extraction »
  await expect(page.locator('.carte-projet[data-projet="pr3"] .badge-pause')).toHaveText('En pause');
  await expect(page.locator('.carte-projet[data-projet="pr2"] .badge-retard')).toBeVisible();
  // recherche : par titre, par personne (sans accent), par organisation
  const recherche = page.getByLabel('Rechercher un projet');
  await recherche.fill('carrel');
  await expect(page.locator('.carte-projet')).toHaveCount(2);
  await recherche.fill('elodie');
  await expect(page.locator('.carte-projet')).toHaveCount(1);
  await recherche.fill('lilas');
  await expect(page.locator('.carte-projet[data-projet="pr1"]')).toBeVisible();
  await recherche.fill('');
  // filtres : une pastille par filtre, retirable
  await page.locator('[data-action="filtres"]').click();
  await expect(dialogue(page).getByText('Nature', { exact: true })).toHaveCount(0); // plus de filtre « Nature »
  await dialogue(page).getByLabel('En pause').check();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('.carte-projet')).toHaveCount(1);
  await expect(page.locator('.pastille-filtre')).toContainText('Statut : En pause');
  await page.getByRole('button', { name: /Retirer le filtre/ }).click();
  await expect(page.locator('.carte-projet')).toHaveCount(3);
  await page.locator('[data-action="filtres"]').click();
  await dialogue(page).getByLabel('En retard').check();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('.carte-projet')).toHaveCount(1);
  await expect(page.locator('.carte-projet[data-projet="pr2"]')).toBeVisible();
  await page.locator('[data-action="filtres"]').click();
  await dialogue(page).getByRole('button', { name: 'Tout effacer' }).click();
  await expect(page.locator('.carte-projet')).toHaveCount(3);
  // liste : tableau sur ordinateur, cartes sur téléphone ; tri par titre
  await page.locator('.bascule-vue[data-vue="liste"]').click();
  await expect(page.locator('.tableau-projets .ligne-liste')).toHaveCount(3);
  await expect(page.locator('.tableau-projets .ligne-liste').first()).toContainText('Accompagnement Martin');
  await page.locator('.tableau-projets th button', { hasText: 'Titre' }).click();
  await expect(page.locator('.tableau-projets .ligne-liste').first()).toContainText('Revue Carrel');
  await page.locator('.tableau-projets .ligne-liste', { hasText: 'Audit Carrel' }).locator('a.cellule-nom').click();
  await expect(page).toHaveURL(/#\/projets\/projets\/pr1$/);
  // recherche globale : groupe « Projets », les projets archivés n'y sont pas
  const globale = estTelephone(page) ? page.getByRole('button', { name: 'Rechercher' }) : null;
  if (globale) await globale.click();
  await page.locator('[data-role="recherche-globale"]').fill('carrel');
  const globaleListe = page.locator('.recherche-globale .suggestions');
  await expect(globaleListe).toContainText('Projets');
  await expect(globaleListe.locator('.suggestion')).toHaveCount(2);
  await page.locator('[data-role="recherche-globale"]').fill('ancien chantier');
  await expect(globaleListe.locator('.suggestion')).toHaveCount(0);
});

test('C29 filtres enregistrés : enregistrer, effacer puis réappliquer, renommer et supprimer dans les Réglages ; ils ne paraissent pas dans les Affaires', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Audit Carrel', phase: 'lancement' });
  await creerProjet('pr2', { titre: 'Accompagnement Martin', phase: 'livraison', dateFin: jour(-3) });
  await creerProjet('pr3', { titre: 'Revue Carrel', phase: 'decouverte', statut: 'en_pause' });
  await connecter(page);
  await allerA(page, 'Projets');
  await expect(page.locator('.carte-projet')).toHaveCount(3);
  // rien à enregistrer tant qu'aucun filtre n'est posé
  await page.locator('[data-action="filtres-enregistres"]').click();
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: 'Enregistrer ce filtre…' })).toBeDisabled();
  await page.keyboard.press('Escape');
  // poser deux filtres puis les enregistrer
  await page.locator('[data-action="filtres"]').click();
  await dialogue(page).getByLabel('En pause').check();
  await dialogue(page).getByLabel('Découverte').check();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('.carte-projet')).toHaveCount(1);
  await page.locator('[data-action="filtres-enregistres"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Enregistrer ce filtre…' }).click();
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  expect((await lireDocument('crm_parametres/filtres')).items.filter((f) => f.liste === 'projets')).toHaveLength(0);
  await page.locator('[data-action="filtres-enregistres"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Enregistrer ce filtre…' }).click();
  await dialogue(page).getByLabel('Nom du filtre').fill('Revues en pause');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect.poll(async () => ((await lireDocument('crm_parametres/filtres'))?.items ?? []).some((f) => f.nom === 'Revues en pause' && f.liste === 'projets')).toBe(true);
  // un nom déjà pris est refusé
  await page.locator('[data-action="filtres-enregistres"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Enregistrer ce filtre…' }).click();
  await dialogue(page).getByLabel('Nom du filtre').fill('revues en pause');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.toast', { hasText: 'Un filtre porte déjà ce nom.' })).toBeVisible();
  expect(((await lireDocument('crm_parametres/filtres')).items).filter((f) => f.liste === 'projets')).toHaveLength(1);
  // effacer puis réappliquer
  await page.getByRole('button', { name: 'Tout effacer' }).click();
  await expect(page.locator('.carte-projet')).toHaveCount(3);
  await page.locator('[data-action="filtres-enregistres"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Revues en pause' }).click();
  await expect(page.locator('.carte-projet')).toHaveCount(1);
  await expect(page.locator('.carte-projet[data-projet="pr3"]')).toBeVisible();
  await expect(page.locator('.pastille-filtre')).toHaveCount(2);
  // les filtres du CRM ne sont pas proposés ici, et celui-ci n'est pas proposé dans les Affaires
  await page.locator('[data-action="filtres-enregistres"]').click();
  await expect(page.locator('.menu-pop').getByRole('menuitem')).toHaveText(['Revues en pause', 'Enregistrer ce filtre…']);
  await page.keyboard.press('Escape');
  await allerA(page, 'Affaires');
  await page.locator('[data-action="filtres-enregistres"]').click();
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: 'Revues en pause' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  // Réglages : renommer puis supprimer
  await allerAuxReglagesCrm(page);
  const ligne = page.locator('.ligne-reglage', { hasText: 'Revues en pause' });
  await expect(ligne).toContainText('Projets');
  await ligne.locator('[data-action="renommer-filtre"]').click();
  await dialogue(page).getByLabel('Nom du filtre').fill('Revues');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.ligne-reglage', { hasText: 'Revues' })).toContainText('Projets');
  await page.locator('.ligne-reglage', { hasText: 'Revues' }).locator('[data-action="supprimer-filtre"]').click();
  await dialogue(page).getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.locator('.ligne-reglage', { hasText: 'Revues' })).toHaveCount(0);
});

test('C29 aucun défilement horizontal de la page Projets, de sa liste et d’une fiche, même avec des textes très longs', async ({ page }) => {
  await creerOrganisation('o1', { nom: 'Une organisation au nom particulièrement long pour tester le débordement des cartes et des tableaux' });
  await creerPersonne('p1', { nom: 'Raphaëlle de La Tour-Vieille-Montmorency', organisationId: 'o1' });
  await creerProjet('pr1', { titre: 'Un projet dont le titre est vraiment très long pour vérifier le comportement de la carte', personneId: 'p1', organisationId: 'o1', dateFin: jour(40), urlGithub: 'https://github.com/jeromechevalier-wq/un-depot-au-nom-vraiment-tres-long-pour-le-test' });
  await ecrireDocument('crm_notes/n1', { texte: 'Unmotextrêmementlongsansespacepourvérifierlecomportementdurendu', personneId: 'p1', organisationId: 'o1', affaireId: null, projetId: 'pr1', auteur: JEROME, creeLe: new Date(), modifieLe: new Date() });
  await connecter(page);
  const sansDebordement = async (nom) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), nom).toBeLessThanOrEqual(0);
  await allerA(page, 'Projets');
  await expect(page.locator('.carte-projet')).toBeVisible();
  await sansDebordement('kanban');
  await page.locator('.bascule-vue[data-vue="liste"]').click();
  await expect(page.locator('.tableau-projets')).toBeVisible();
  await sansDebordement('liste');
  await aller(page, '#/projets/projets/pr1');
  await expect(page.locator('.fiche')).toBeVisible();
  await sansDebordement('fiche');
  await allerA(page, 'Projets');
  await page.locator('[data-action="nouveau-projet"]').click();
  await expect(dialogue(page)).toBeVisible();
  await sansDebordement('création');
});

test('C29 un projet introuvable : message, lien de retour ; route inconnue du module : retour à la liste', async ({ page }) => {
  await connecter(page, JEROME, { route: 'projets/projets/inexistant' });
  await expect(page.locator('.etat-vide')).toContainText('Ce projet n’existe plus.');
  await page.locator('.lien-retour').click();
  await expect(page).toHaveURL(/#\/projets\/projets$/);
  await aller(page, '#/projets/autre');
  await expect(page).toHaveURL(/#\/projets\/projets$/);
});

// ---------------------------------------------------------------- étape 3 : affaire gagnée → créer ou lier un projet

test('C30 fiche affaire : « Créer le projet » seulement pour une affaire gagnée ; le projet reprend l’affaire, les deux sont liés', async ({ page }) => {
  await creerOrganisation('o1', { nom: 'Atelier des Lilas' });
  await creerPersonne('p1', { nom: 'Camille Durand', organisationId: 'o1' });
  await creerAffaire('a0', { titre: 'Pas encore gagnée', personneId: 'p1', organisationId: 'o1', etape: 'rdv_fixe' });
  await creerAffaire('a1', { titre: 'Audit des Lilas', personneId: 'p1', organisationId: 'o1', etape: 'gagne', montant: 1200, urlGithub: 'https://github.com/jeromechevalier-wq/client-lilas' });
  await connecter(page);
  // une affaire qui n'est pas gagnée n'a pas de section Projet
  await aller(page, '#/crm/affaires/a0');
  await expect(page.locator('.fiche')).toBeVisible();
  await expect(page.locator('[data-section="affaire-projet"]')).toHaveCount(0);
  // affaire gagnée : deux choix, et elle peut rester sans projet
  await aller(page, '#/crm/affaires/a1');
  const section = page.locator('[data-section="affaire-projet"]');
  await expect(section.locator('[data-action="creer-projet"]')).toBeVisible();
  await expect(section.locator('[data-action="lier-projet"]')).toBeVisible();
  await expect(section).toContainText('Elle peut aussi rester sans projet');
  await section.locator('[data-action="creer-projet"]').click();
  await expect(dialogue(page).getByLabel('Titre', { exact: true })).toHaveValue('Audit des Lilas');
  await expect(dialogue(page).getByLabel('Modèle')).toHaveValue('', 'sans offre, aucun modèle n’est proposé d’office');
  await dialogue(page).getByRole('button', { name: 'Créer le projet' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  const p = await attendre('projets_projets', (d) => d.affaireId === 'a1');
  expect(p).toMatchObject({
    titre: 'Audit des Lilas', personneId: 'p1', organisationId: 'o1', phase: 'lancement', statut: 'actif',
    urlGithub: 'https://github.com/jeromechevalier-wq/client-lilas',
  });
  await champDoc('crm_affaires', 'a1', 'projetId', p.id);
  await expect(page.locator('.toast', { hasText: 'Projet créé' })).toBeVisible();
  // la section montre maintenant le projet, plus les boutons ; une seule création possible
  await expect(section.locator('.carte-projet-mini')).toContainText('Audit des Lilas');
  await expect(section.locator('[data-action="creer-projet"]')).toHaveCount(0);
  expect(await listerDocuments('projets_projets')).toHaveLength(1);
  // le projet est dans l'historique de l'affaire, et la fiche du projet renvoie à l'affaire
  const ev = await attendre('crm_evenements', (e) => e.type === 'projet_cree');
  expect(ev).toMatchObject({ projetId: p.id, affaireId: 'a1' });
  await section.locator('.carte-projet-mini').click();
  await expect(page).toHaveURL(new RegExp(`#/projets/projets/${p.id}$`));
  await expect(page.locator('[data-prop="affaire"]')).toContainText('Audit des Lilas');
  await expect(page.locator(`.colonne[data-colonne="lancement"] .carte-projet`)).toHaveCount(0); // (la fiche est ouverte, pas le tableau)
  // audit : projet, affaire, événement et note épinglée de départ (I5) écrits dans le même lot
  await expect.poll(async () => (await listerDocuments('crm_audit')).filter((l) => l.outil === 'creerProjetDepuisAffaire').length).toBe(4);
  const lignes = (await listerDocuments('crm_audit')).filter((l) => l.outil === 'creerProjetDepuisAffaire');
  expect(new Set(lignes.map((l) => l.operationId)).size).toBe(1);
  expect(lignes.map((l) => l.collection).sort()).toEqual(['crm_affaires', 'crm_evenements', 'crm_notes', 'projets_projets']);
});

test('C30 « Lier un projet » : seuls les projets sans affaire sont proposés ; le projet garde ses informations et reprend ce qui lui manque', async ({ page }) => {
  await creerOrganisation('o1', { nom: 'Atelier des Lilas' });
  await creerPersonne('p1', { nom: 'Camille Durand', organisationId: 'o1' });
  await creerPersonne('p2', { nom: 'Paul Martin' });
  await creerAffaire('a1', { titre: 'Audit des Lilas', personneId: 'p1', organisationId: 'o1', etape: 'gagne' });
  await creerAffaire('a2', { titre: 'Autre affaire', personneId: 'p1', organisationId: 'o1', etape: 'gagne', projetId: 'pr9' });
  await connecter(page);
  // aucun projet à lier : message, rien ne s'ouvre
  await aller(page, '#/crm/affaires/a1');
  await page.locator('[data-section="affaire-projet"] [data-action="lier-projet"]').click();
  await expect(page.locator('.toast', { hasText: 'Aucun projet sans affaire à lier' })).toBeVisible();
  await expect(dialogue(page)).toHaveCount(0);
  await creerProjet('pr1', { titre: 'Chantier libre', personneId: 'p2' });
  await creerProjet('pr2', { titre: 'Ancien chantier', archive: true });
  await creerProjet('pr9', { titre: 'Déjà pris', affaireId: 'a2' });
  await page.locator('[data-section="affaire-projet"] [data-action="lier-projet"]').click();
  await expect(dialogue(page).getByLabel('Projet à lier').locator('option')).toHaveText(['Chantier libre']);
  await dialogue(page).getByRole('button', { name: 'Lier', exact: true }).click();
  await expect(dialogue(page)).toHaveCount(0);
  await champDoc('projets_projets', 'pr1', 'affaireId', 'a1');
  expect(await lireDocument('projets_projets/pr1')).toMatchObject({ personneId: 'p2', organisationId: 'o1', affaireId: 'a1', titre: 'Chantier libre' });
  await champDoc('crm_affaires', 'a1', 'projetId', 'pr1');
  await expect(page.locator('[data-section="affaire-projet"] .carte-projet-mini')).toContainText('Chantier libre');
  const ev = await attendre('crm_evenements', (e) => e.type === 'projet_lie');
  expect(ev).toMatchObject({ projetId: 'pr1', affaireId: 'a1', texte: 'Projet lié à l’affaire : Audit des Lilas' });
});

test('C30 détacher : depuis l’affaire ou depuis le projet, rien n’est supprimé, le lien disparaît des deux côtés', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas', etape: 'gagne', projetId: 'pr1' });
  await creerProjet('pr1', { titre: 'Audit des Lilas', affaireId: 'a1' });
  await creerAffaire('a2', { titre: 'Site vitrine', etape: 'gagne', projetId: 'pr2' });
  await creerProjet('pr2', { titre: 'Site vitrine', affaireId: 'a2' });
  await connecter(page);
  // depuis l'affaire : annuler ne change rien
  await aller(page, '#/crm/affaires/a1');
  await page.locator('[data-action="detacher-projet"]').click();
  await dialogue(page).getByRole('button', { name: 'Annuler' }).click();
  expect((await lireDocument('projets_projets/pr1')).affaireId).toBe('a1');
  await page.locator('[data-action="detacher-projet"]').click();
  await dialogue(page).getByRole('button', { name: 'Détacher' }).click();
  await champDoc('projets_projets', 'pr1', 'affaireId', null);
  await champDoc('crm_affaires', 'a1', 'projetId', null);
  await expect(page.locator('[data-section="affaire-projet"] [data-action="creer-projet"]')).toBeVisible();
  // depuis le projet
  await aller(page, '#/projets/projets/pr2');
  await page.locator('[data-action="detacher-affaire"]').click();
  await dialogue(page).getByRole('button', { name: 'Détacher' }).click();
  await champDoc('projets_projets', 'pr2', 'affaireId', null);
  await champDoc('crm_affaires', 'a2', 'projetId', null);
  await expect(page.locator('[data-prop="affaire"]')).toHaveCount(0); // plus de ligne « Aucune affaire liée » : elle n'apparaît que s'il y a une affaire d'origine
  expect(await lireDocument('projets_projets/pr1')).not.toBeNull();
  expect(await lireDocument('crm_affaires/a2')).not.toBeNull();
  expect((await listerDocuments('crm_evenements')).filter((e) => e.type === 'projet_delie')).toHaveLength(2);
});

test('C30 le projet montre les documents et les notes de son affaire, sans les déplacer ni les rendre modifiables', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas', etape: 'gagne', projetId: 'pr1', documents: [{ libelle: 'Devis signé', url: 'https://drive.google.com/file/d/devis/view' }] });
  await creerProjet('pr1', { titre: 'Audit des Lilas', affaireId: 'a1', documents: [{ libelle: 'Rapport', url: 'https://drive.google.com/file/d/rapport/view' }] });
  await ecrireDocument('crm_notes/n1', { texte: 'Note écrite sur l’affaire', personneId: null, organisationId: null, affaireId: 'a1', auteur: JEROME, creeLe: new Date(Date.now() - 60_000), modifieLe: new Date() });
  await ecrireDocument('crm_notes/n2', { texte: 'Note écrite sur le projet', personneId: null, organisationId: null, affaireId: 'a1', projetId: 'pr1', auteur: JEROME, creeLe: new Date(), modifieLe: new Date() });
  await connecter(page);
  await aller(page, '#/projets/projets/pr1');
  await ouvrirDocuments(page);
  // documents : ceux du projet (modifiables) et, à part, ceux de l'affaire (lecture seule)
  const docsProjet = page.locator('[data-section="projet-documents"]');
  await expect(docsProjet).toContainText('Rapport');
  await expect(docsProjet.locator('.liste-liens')).not.toContainText('Devis signé'); // la liste du projet ; ceux de l'affaire sont à part, plus bas
  const docsAffaire = page.locator('[data-section="projet-documents-affaire"]');
  await expect(docsAffaire).toContainText('Devis signé');
  await expect(docsAffaire.getByRole('link', { name: 'Devis signé' })).toHaveAttribute('href', 'https://drive.google.com/file/d/devis/view');
  await expect(docsAffaire.getByRole('button', { name: /Retirer|Ajouter/ })).toHaveCount(0); // seul le bouton qui replie la section existe
  // notes : les deux sont dans l'historique du projet ; seule celle du projet se modifie
  const notes = page.locator('.historique .fil-note');
  await expect(notes).toHaveCount(2);
  await expect(notes.filter({ hasText: 'Note écrite sur l’affaire' })).toContainText('note de l’affaire');
  await expect(notes.filter({ hasText: 'Note écrite sur l’affaire' }).locator('[data-action="modifier-note"]')).toHaveCount(0);
  await expect(notes.filter({ hasText: 'Note écrite sur l’affaire' }).locator('[data-action="supprimer-note"]')).toHaveCount(0);
  await expect(notes.filter({ hasText: 'Note écrite sur le projet' }).locator('[data-action="modifier-note"]')).toHaveCount(1);
  // rien n'a été déplacé : l'affaire garde ses documents et sa note
  expect((await lireDocument('crm_affaires/a1')).documents).toHaveLength(1);
  expect((await lireDocument('crm_notes/n1')).projetId).toBeUndefined();
  // une affaire détachée n'est plus montrée dans le projet
  await page.locator('[data-action="detacher-affaire"]').click();
  await dialogue(page).getByRole('button', { name: 'Détacher' }).click();
  await expect(docsAffaire).toHaveCount(0);
  await expect(notes.filter({ hasText: 'Note écrite sur l’affaire' })).toHaveCount(0);
  await expect(notes.filter({ hasText: 'Note écrite sur le projet' })).toHaveCount(1);
  if (estTelephone(page)) {
    // une seule colonne : le résumé en premier, puis les documents, puis les détails
    const ordre = await page.evaluate(() => ['projet-resume', 'projet-documents', 'projet-details'].map((s) => document.querySelector(`[data-section="${s}"]`).getBoundingClientRect().top));
    expect(ordre[0]).toBeLessThan(ordre[1]);
    expect(ordre[1]).toBeLessThan(ordre[2]);
  }
});

test('C30 fiches personne et organisation : leurs projets en cartes, la section n’existe que s’il y en a', async ({ page }) => {
  await creerOrganisation('o1', { nom: 'Atelier des Lilas' });
  await creerOrganisation('o2', { nom: 'Sans projet' });
  await creerPersonne('p1', { nom: 'Camille Durand', organisationId: 'o1' });
  await creerPersonne('p2', { nom: 'Paul Martin' });
  await creerProjet('pr1', { titre: 'Audit des Lilas', personneId: 'p1', organisationId: 'o1', phase: 'livraison' });
  await creerProjet('pr2', { titre: 'Revue Lilas', personneId: 'p1', organisationId: 'o1', statut: 'en_pause' });
  await creerProjet('pr3', { titre: 'Projet d’un autre', personneId: 'p2' });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  const section = page.locator('[data-section="personne-projets"]');
  await expect(section.locator('.carte-projet-mini')).toHaveCount(2);
  await expect(section).toContainText('Audit des Lilas');
  await expect(section.locator('.carte-projet-mini', { hasText: 'Revue Lilas' })).toContainText('En pause');
  await expect(section.locator('.carte-projet-mini', { hasText: 'Audit des Lilas' })).toContainText('Livraison');
  await section.locator('.carte-projet-mini', { hasText: 'Audit des Lilas' }).click();
  await expect(page).toHaveURL(/#\/projets\/projets\/pr1$/);
  await aller(page, '#/crm/organisations/o1');
  await expect(page.locator('[data-section="organisation-projets"] .carte-projet-mini')).toHaveCount(2);
  await aller(page, '#/crm/organisations/o2');
  await expect(page.locator('.fiche')).toBeVisible();
  await expect(page.locator('[data-section="organisation-projets"]')).toHaveCount(0);
  // un projet créé après coup apparaît sans recharger
  await aller(page, '#/crm/personnes/p2');
  await expect(page.locator('[data-section="personne-projets"] .carte-projet-mini')).toHaveCount(1);
  await creerProjet('pr4', { titre: 'Nouveau chantier', personneId: 'p2' });
  await expect(page.locator('[data-section="personne-projets"] .carte-projet-mini')).toHaveCount(2);
});

// ---------------------------------------------------------------- étape 4 : tâches des projets

test('C31 fiche projet : ajouter des tâches (titre seul, ou avec phase et date rapide), classées par phase, avec le compteur et l’avancement', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Audit des Lilas', phase: 'decouverte' });
  await connecter(page);
  await aller(page, '#/projets/projets/pr1');
  const section = page.locator('[data-section="projet-taches"]');
  await expect(section).toContainText('Aucune tâche pour le moment');
  await expect(page.locator('[data-prop="avancement"]')).toContainText('Aucune tâche');
  // une seule ligne « Clique ici… » tant qu'on n'y a pas cliqué ; titre vide : refusé
  await expect(section.locator('[data-action="ajouter-tache"]')).toBeHidden();
  await section.getByLabel('Nouvelle tâche').click();
  await section.locator('[data-action="ajouter-tache"]').click();
  await expect(page.locator('.toast', { hasText: 'Le titre est obligatoire.' })).toBeVisible();
  expect(await listerDocuments('projets_taches')).toHaveLength(0);
  // titre seul (Entrée) : dans la phase du projet, à Jérôme, sans date
  await section.getByLabel('Nouvelle tâche').fill('Interview Carrel');
  await section.getByLabel('Nouvelle tâche').press('Enter');
  const t1 = await attendre('projets_taches', (d) => d.titre === 'Interview Carrel');
  expect(t1).toMatchObject({ projetId: 'pr1', phase: 'decouverte', ordre: 1, date: null, fait: false, assigneA: 'jerome', auteur: JEROME });
  // autre phase et date rapide « Demain »
  await section.getByLabel('Nouvelle tâche').fill('Rédiger le rapport');
  await section.getByLabel('Phase de la tâche').selectOption('livraison');
  await section.locator('[data-date-rapide="demain"]').click();
  await section.locator('[data-action="ajouter-tache"]').click();
  const t2 = await attendre('projets_taches', (d) => d.titre === 'Rédiger le rapport');
  expect(t2).toMatchObject({ phase: 'livraison', ordre: 1, date: jour(1) });
  // une deuxième tâche dans la même phase passe après la première
  await section.getByLabel('Nouvelle tâche').fill('Débriefing');
  await section.getByLabel('Phase de la tâche').selectOption('livraison');
  await section.locator('[data-action="ajouter-tache"]').click();
  expect((await attendre('projets_taches', (d) => d.titre === 'Débriefing')).ordre).toBe(2);
  // groupes par phase, dans l'ordre des phases
  await expect(section.locator('.groupe-taches')).toHaveCount(2);
  await expect(section.locator('.groupe-taches').nth(0)).toHaveAttribute('data-phase', 'decouverte');
  await expect(section.locator('.groupe-taches[data-phase="livraison"] .tache')).toHaveText([/Rédiger le rapport/, /Débriefing/]);
  await expect(section.locator('.groupe-taches[data-phase="livraison"] .compteur')).toHaveText('0/2');
  await expect(page.locator('[data-prop="avancement"]')).toContainText('0 / 3 tâches');
  await expect(section.locator('.section-compteur')).toHaveText('0/3');
  // audit : la création laisse sa trace
  expect((await listerDocuments('crm_audit')).filter((l) => l.outil === 'creerTache' && l.collection === 'projets_taches')).toHaveLength(3);
});

test('C31 cocher une tâche : fait, date, événement dans l’historique du projet, avancement et cercle sur la carte ; décocher la remet à faire', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Audit des Lilas' });
  await creerTacheProjet('t1', { titre: 'Interview Carrel' });
  await creerTacheProjet('t2', { titre: 'Rapport', ordre: 2 });
  await connecter(page);
  await aller(page, '#/projets/projets/pr1');
  const ligne = page.locator('.tache[data-tache="t1"]');
  await ligne.locator('.case-fait').click();
  await champDoc('projets_taches', 't1', 'fait', true);
  expect((await lireDocument('projets_taches/t1')).dateFait).toBeInstanceOf(Date);
  await expect(ligne).toHaveClass(/tache-faite/);
  await expect(ligne.locator('.case-fait')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('[data-prop="avancement"] .anneau-progression')).toHaveAttribute('data-faites', '1');
  await expect(page.locator('[data-prop="avancement"]')).toContainText('1 / 2 tâches');
  const ev = await attendre('crm_evenements', (e) => e.type === 'tache_faite');
  expect(ev).toMatchObject({ projetId: 'pr1', texte: 'Tâche faite : Interview Carrel' });
  await expect(page.locator('.historique')).toContainText('Tâche faite : Interview Carrel');
  // le Kanban montre le cercle d'avancement
  await allerA(page, 'Projets');
  const anneau = page.locator('.carte-projet[data-projet="pr1"] .anneau-progression');
  await expect(anneau).toHaveAttribute('data-faites', '1');
  await expect(anneau).toHaveAttribute('data-total', '2');
  await expect(anneau).toHaveAttribute('aria-label', '1 tâche faite sur 2');
  // décocher
  await aller(page, '#/projets/projets/pr1');
  await page.locator('.tache[data-tache="t1"] .case-fait').click();
  await champDoc('projets_taches', 't1', 'fait', false);
  expect((await lireDocument('projets_taches/t1')).dateFait).toBeNull();
  await expect(page.locator('[data-prop="avancement"]')).toContainText('0 / 2 tâches');
});

test('C31 le cercle d’avancement n’existe que s’il y a des tâches ; modifier une tâche : titre, date, heure, personne ; « Sans date »', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Audit des Lilas' });
  await creerProjet('pr2', { titre: 'Projet sans tâche' });
  await creerTacheProjet('t1', { titre: 'Interview Carrel', date: jour(2), heure: '09:30' });
  await connecter(page);
  await allerA(page, 'Projets');
  await expect(page.locator('.carte-projet[data-projet="pr1"] .anneau-progression')).toHaveCount(1);
  await expect(page.locator('.carte-projet[data-projet="pr2"]')).toBeVisible();
  await expect(page.locator('.carte-projet[data-projet="pr2"] .anneau-progression')).toHaveCount(0);
  await aller(page, '#/projets/projets/pr1');
  const ligne = page.locator('.tache[data-tache="t1"]');
  await expect(ligne).toContainText('9 h 30');
  await ligne.locator('[data-action="menu-tache"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Modifier…' }).click();
  await dialogue(page).getByLabel('Titre de la tâche').fill('Interview Carrel et Martin');
  await dialogue(page).getByLabel('Confiée à').selectOption('charles');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  expect(await lireDocument('projets_taches/t1')).toMatchObject({ titre: 'Interview Carrel et Martin', assigneA: 'charles', date: jour(2), heure: '09:30' });
  await expect(ligne).toContainText('Charles');
  // titre vide : message dans la fenêtre, rien n'est écrit
  await ligne.locator('[data-action="menu-tache"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Modifier…' }).click();
  await dialogue(page).getByLabel('Titre de la tâche').fill('   ');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialogue(page).getByRole('alert')).toContainText('Le titre est obligatoire.');
  await dialogue(page).getByRole('button', { name: 'Annuler' }).click();
  // sans date : date et heure effacées
  await ligne.locator('[data-action="menu-tache"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Modifier…' }).click();
  await dialogue(page).locator('[data-action="effacer-date"]').click();
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await champDoc('projets_taches', 't1', 'date', null);
  expect((await lireDocument('projets_taches/t1')).heure).toBe('');
});

test('C31 monter, descendre, changer de phase, supprimer une tâche', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Audit des Lilas' });
  await creerTacheProjet('a', { titre: 'Première', ordre: 1 });
  await creerTacheProjet('b', { titre: 'Deuxième', ordre: 2 });
  await creerTacheProjet('c', { titre: 'Troisième', ordre: 3 });
  await connecter(page);
  await aller(page, '#/projets/projets/pr1');
  const ordre = () => page.locator('[data-section="projet-taches"] .groupe-taches[data-phase="lancement"] .tache .tache-titre');
  await expect(ordre()).toHaveText(['Première', 'Deuxième', 'Troisième']);
  const menu = async (id, entree) => {
    await page.locator(`.tache[data-tache="${id}"] [data-action="menu-tache"]`).click();
    await page.locator('.menu-pop').getByRole('menuitem', { name: entree, exact: true }).click();
  };
  await menu('c', 'Monter');
  await expect(ordre()).toHaveText(['Première', 'Troisième', 'Deuxième']);
  await menu('a', 'Descendre');
  await expect(ordre()).toHaveText(['Troisième', 'Première', 'Deuxième']);
  expect([(await lireDocument('projets_taches/c')).ordre, (await lireDocument('projets_taches/a')).ordre, (await lireDocument('projets_taches/b')).ordre]).toEqual([1, 2, 3]);
  // la première de la liste ne se monte pas, la dernière ne se descend pas
  await page.locator('.tache[data-tache="c"] [data-action="menu-tache"]').click();
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: 'Monter', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  await page.locator('.tache[data-tache="b"] [data-action="menu-tache"]').click();
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: 'Descendre', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  // changer de phase : à la fin de la nouvelle phase
  await menu('a', 'Déplacer vers : Livraison');
  await champDoc('projets_taches', 'a', 'phase', 'livraison');
  await expect(page.locator('.groupe-taches[data-phase="livraison"] .tache')).toHaveCount(1);
  await expect(ordre()).toHaveText(['Troisième', 'Deuxième']);
  // supprimer : annuler garde, confirmer supprime
  await page.locator('.tache[data-tache="b"] [data-action="menu-tache"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Supprimer' }).click();
  await dialogue(page).getByRole('button', { name: 'Annuler' }).click();
  expect(await lireDocument('projets_taches/b')).not.toBeNull();
  await menu('b', 'Supprimer');
  await dialogue(page).getByRole('button', { name: 'Supprimer' }).click();
  await expect.poll(async () => await lireDocument('projets_taches/b')).toBeNull();
});

test('C31 Accueil : les tâches de projet en retard et du jour sont dans les Points clés avec leur projet, mêlées aux activités ; « Fait » les coche', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Audit des Lilas' });
  await creerProjet('pr2', { titre: 'Chantier en pause', statut: 'en_pause' });
  await creerProjet('pr3', { titre: 'Projet rangé', archive: true, statut: 'termine' });
  await creerTacheProjet('retard', { titre: 'Relire le devis', date: jour(-3) });
  await creerTacheProjet('jour', { titre: 'Appeler Carrel', date: jour(0), heure: '14:00' });
  await creerTacheProjet('futur', { titre: 'Dans une semaine', date: jour(7) });
  await creerTacheProjet('sans', { titre: 'Sans date' });
  await creerTacheProjet('faite', { titre: 'Déjà faite', date: jour(-1), fait: true });
  await creerTacheProjet('pause', { titre: 'Tâche d’un projet en pause', projetId: 'pr2', date: jour(-1) });
  await creerTacheProjet('rangee', { titre: 'Tâche d’un projet rangé', projetId: 'pr3', date: jour(-1) });
  await creerPersonne('p1', { nom: 'Marie Durand' });
  await creerActivite('x1', { titre: 'Activité du matin', date: jour(0), heure: '08:00', personneId: 'p1' });
  await connecter(page);
  const retard = page.locator('[data-groupe="retard"]');
  await expect(retard.locator('.compteur')).toHaveText('1');
  await expect(retard.locator('.tache[data-tache="retard"]')).toContainText('Relire le devis');
  await expect(retard.locator('.tache[data-tache="retard"] .badge-etat')).toHaveText('En retard');
  await expect(retard.locator('.tache[data-tache="retard"] a')).toHaveText('Audit des Lilas');
  await expect(retard.locator('.tache[data-tache="retard"] a')).toHaveAttribute('href', '#/projets/projets/pr1');
  const jourJ = page.locator('[data-groupe="aujourdhui"]');
  await expect(jourJ.locator('.compteur')).toHaveText('2');
  await expect(jourJ.locator('.activite')).toHaveText([/Activité du matin/, /Appeler Carrel/]); // mêlées par heure
  for (const absente of ['Dans une semaine', 'Sans date', 'Déjà faite', 'Tâche d’un projet en pause', 'Tâche d’un projet rangé']) {
    await expect(page.locator('.section-a-faire')).not.toContainText(absente);
  }
  // « Fait » depuis l'Accueil
  await jourJ.locator('.tache[data-tache="jour"] [data-action="faire-tache"]').click();
  await champDoc('projets_taches', 'jour', 'fait', true);
  await expect(jourJ.locator('.compteur')).toHaveText('1');
  await expect(jourJ.locator('.tache')).toHaveCount(0);
  await retard.locator('.tache[data-tache="retard"] [data-action="faire-tache"]').click();
  await champDoc('projets_taches', 'retard', 'fait', true);
  await expect(retard).toHaveCount(0);
  expect((await listerDocuments('crm_evenements')).filter((e) => e.type === 'tache_faite')).toHaveLength(2);
});

test('C31 le retard d’une tâche rend le projet « en retard » : badge, pastille rouge, filtre ; une tâche faite ou à venir non', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Projet en retard' });
  await creerProjet('pr2', { titre: 'Projet à l’heure' });
  await creerTacheProjet('t1', { titre: 'En retard', projetId: 'pr1', date: jour(-2) });
  await creerTacheProjet('t2', { titre: 'À venir', projetId: 'pr2', date: jour(3) });
  await creerTacheProjet('t3', { titre: 'Faite', projetId: 'pr2', date: jour(-5), fait: true, ordre: 2 });
  await connecter(page);
  await allerA(page, 'Projets');
  await expect(page.locator('.carte-projet[data-projet="pr1"] .badge-retard')).toBeVisible();
  await expect(page.locator('.carte-projet[data-projet="pr1"] .pastille-activite.rouge')).toBeVisible();
  await expect(page.locator('.carte-projet[data-projet="pr2"] .badge-retard')).toHaveCount(0);
  await expect(page.locator('.carte-projet[data-projet="pr2"] .pastille-activite.verte')).toBeVisible();
  await page.locator('[data-action="filtres"]').click();
  await dialogue(page).getByLabel('En retard').check();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('.carte-projet')).toHaveCount(1);
  await expect(page.locator('.carte-projet[data-projet="pr1"]')).toBeVisible();
});

test('C31 supprimer un projet supprime ses tâches et pas celles des autres', async ({ page }) => {
  await creerProjet('pr1', { titre: 'À supprimer' });
  await creerProjet('pr2', { titre: 'À garder' });
  await creerTacheProjet('t1', { titre: 'Tâche 1', projetId: 'pr1' });
  await creerTacheProjet('t2', { titre: 'Tâche 2', projetId: 'pr1', ordre: 2 });
  await creerTacheProjet('t3', { titre: 'Tâche 3', projetId: 'pr2' });
  await connecter(page);
  await aller(page, '#/projets/projets/pr1');
  await page.locator('[data-action="menu-fiche"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: /Supprimer définitivement/ }).click();
  await dialogue(page).getByLabel(/Tape « À supprimer »/).fill('à supprimer');
  await dialogue(page).getByRole('button', { name: 'Supprimer' }).click();
  await expect.poll(async () => (await listerDocuments('projets_taches')).map((t) => t.id)).toEqual(['t3']);
  expect(await lireDocument('projets_projets/pr1')).toBeNull();
  expect(await lireDocument('projets_projets/pr2')).not.toBeNull();
});

test('C31 aucun défilement horizontal de la fiche projet avec des tâches aux titres très longs', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Projet' });
  await creerTacheProjet('t1', { titre: 'Une tâche dont le titre est vraiment très long pour vérifier le comportement de la ligne et de son menu', date: jour(-1), assigneA: 'charles' });
  await creerTacheProjet('t2', { titre: 'Untitretrèslongsansespacepourvérifierlecomportementdelaligneetdesonmenudactions', ordre: 2, phase: 'livraison' });
  await connecter(page);
  await aller(page, '#/projets/projets/pr1');
  await expect(page.locator('.tache')).toHaveCount(2);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await allerA(page, 'Projets');
  await expect(page.locator('.carte-projet')).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
});

// ---------------------------------------------------------------- étape 5 : modèles de projet

async function attendreModeles(n = 2) {
  await expect.poll(async () => (await listerDocuments('projets_modeles')).length, { timeout: 15_000 }).toBe(n);
}

test('C32 premier lancement : les modèles Audit et Accompagnement sont créés une seule fois, avec le contenu de Jérôme', { tag: '@sans-telephone' }, async ({ page }) => {
  await connecter(page);
  await attendreModeles();
  const modeles = Object.fromEntries((await listerDocuments('projets_modeles')).map((m) => [m.id, m]));
  expect(Object.keys(modeles).sort()).toEqual(['accompagnement', 'audit']);
  expect(modeles.audit).toMatchObject({ nom: 'Audit', offreId: 'audit', actif: true });
  expect(modeles.audit.taches.map((t) => t.titre)).toEqual(['Interview', 'Créer le rapport', 'Débriefing avec le client']);
  expect(modeles.accompagnement.taches.map((t) => t.titre)).toEqual(['Rendez-vous de lancement']);
  expect(await lireDocument('crm_parametres/modeles_projet')).toEqual({ depart: true });
  // la création de départ n'est pas une action de Jérôme : aucune ligne de journal
  expect((await listerDocuments('crm_audit')).filter((l) => l.collection === 'projets_modeles')).toHaveLength(0);
  // un rechargement ne les recrée pas ; ce que Jérôme modifie ou supprime reste tel quel
  await ecrireDocument('projets_modeles/audit', { ...modeles.audit, nom: 'Audit modifié' });
  await page.reload();
  await expect(page.locator('.coquille')).toBeVisible();
  await page.waitForTimeout(1500);
  expect((await listerDocuments('projets_modeles')).length).toBe(2);
  expect((await lireDocument('projets_modeles/audit')).nom).toBe('Audit modifié');
});

test('C32 Modèles de projets (dans les Réglages, plus dans le menu) : la liste, un nouveau modèle, sa fiche (paramètres, activation), suppression', async ({ page }) => {
  await connecter(page);
  await attendreModeles();
  await expect(page.getByRole('link', { name: 'Modèles', exact: true })).toHaveCount(0);
  await aller(page, '#/reglages/crm');
  await expect(page.locator('#reglages-modeles-projets')).toBeVisible();
  await expect(page.locator('.tableau-modeles .ligne-liste')).toHaveCount(2);
  await expect(page.locator('.tableau-modeles th', { hasText: 'Nature' })).toHaveCount(0); // plus de colonne « Nature »
  await expect(page.locator('.tableau-modeles .ligne-liste[data-id="audit"]')).toContainText('Audit');
  await expect(page.locator('.tableau-modeles .ligne-liste[data-id="audit"]')).toContainText('3');
  // nouveau modèle : le nom suffit, on arrive sur sa fiche
  await page.locator('[data-action="nouveau-modele"]').click();
  await dialogue(page).getByLabel('Nom du modèle').fill('Site vitrine');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page).toHaveURL(/#\/projets\/modeles\/.+/);
  const m = await attendre('projets_modeles', (d) => d.nom === 'Site vitrine');
  expect(m).toMatchObject({ offreId: null, taches: [], actif: true, ordre: 3 });
  await expect(page.locator('.titre-editable')).toHaveValue('Site vitrine');
  await expect(page.locator('[data-section="modele-taches"]')).toContainText('n’a pas encore de tâche');
  // renommer, offre, désactiver
  await page.locator('.titre-editable').fill('Site vitrine pro');
  await page.locator('.titre-editable').press('Enter');
  await champDoc('projets_modeles', m.id, 'nom', 'Site vitrine pro');
  await page.getByRole('button', { name: 'Ajouter : Offre' }).click();
  await page.getByLabel('Offre', { exact: true }).selectOption('accompagnement');
  await champDoc('projets_modeles', m.id, 'offreId', 'accompagnement');
  await page.locator('[data-action="basculer-actif"]').click();
  await champDoc('projets_modeles', m.id, 'actif', false);
  await expect(page.locator('.fiche-sous .badge-pause')).toHaveText('Inactif');
  await page.locator('[data-action="basculer-actif"]').click();
  await champDoc('projets_modeles', m.id, 'actif', true);
  // suppression : annuler garde, confirmer supprime et revient à la liste
  await page.locator('[data-action="menu-fiche"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: /Supprimer définitivement/ }).click();
  await dialogue(page).getByRole('button', { name: 'Annuler' }).click();
  expect(await lireDocument(`projets_modeles/${m.id}`)).not.toBeNull();
  await page.locator('[data-action="menu-fiche"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: /Supprimer définitivement/ }).click();
  await dialogue(page).getByRole('button', { name: 'Supprimer' }).click();
  await expect.poll(async () => await lireDocument(`projets_modeles/${m.id}`)).toBeNull();
  await expect(page).toHaveURL(/#\/reglages\/crm$/); // la suppression ramène aux Réglages
});

test('C32 fiche d’un modèle : tâches types par phase, délai, modifier, monter, descendre, changer de phase, supprimer', async ({ page }) => {
  await connecter(page);
  await attendreModeles();
  await aller(page, '#/projets/modeles/audit');
  const section = page.locator('[data-section="modele-taches"]');
  await expect(section.locator('.groupe-taches')).toHaveCount(2);
  await expect(section.locator('.groupe-taches[data-phase="livraison"] .tache-titre')).toHaveText(['Créer le rapport', 'Débriefing avec le client']);
  await expect(section.locator('[data-tache-modele="audit-interview"]')).toContainText('Sans date');
  // ajouter : titre obligatoire, délai invalide refusé
  await section.locator('[data-action="ajouter-tache-modele"]').click();
  await expect(page.locator('.toast', { hasText: 'Le titre est obligatoire.' })).toBeVisible();
  await section.getByLabel('Nouvelle tâche type').fill('Envoyer la facture');
  await section.getByLabel('Phase de la tâche type').selectOption('cloture');
  await section.getByLabel('Délai en jours (vide = sans date)').fill('5');
  await section.locator('[data-action="ajouter-tache-modele"]').click();
  await expect.poll(async () => (await lireDocument('projets_modeles/audit')).taches.length).toBe(4);
  const ajoutee = (await lireDocument('projets_modeles/audit')).taches.find((t) => t.titre === 'Envoyer la facture');
  expect(ajoutee).toMatchObject({ phase: 'cloture', delaiJours: 5, ordre: 1 });
  await expect(section.locator('.groupe-taches[data-phase="cloture"]')).toContainText('J + 5');
  // modifier : titre et délai ; délai invalide refusé dans la fenêtre
  const menu = async (id, entree) => {
    await page.locator(`[data-tache-modele="${id}"] [data-action="menu-tache-modele"]`).click();
    await page.locator('.menu-pop').getByRole('menuitem', { name: entree, exact: true }).click();
  };
  await menu('audit-interview', 'Modifier…');
  await expect(dialogue(page).getByLabel('Titre de la tâche type')).toBeFocused(); // la fenêtre a fini de s'ouvrir (son champ de départ a le curseur)
  await dialogue(page).getByLabel('Délai en jours après le début').fill('-3');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialogue(page).getByRole('alert')).toContainText('nombre de jours');
  await dialogue(page).getByLabel('Délai en jours après le début').fill('0');
  await dialogue(page).getByLabel('Titre de la tâche type').fill('Interview du client');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  await expect.poll(async () => (await lireDocument('projets_modeles/audit')).taches.find((t) => t.id === 'audit-interview').titre).toBe('Interview du client');
  expect((await lireDocument('projets_modeles/audit')).taches.find((t) => t.id === 'audit-interview').delaiJours).toBe(0);
  await expect(section.locator('[data-tache-modele="audit-interview"]')).toContainText('Le jour du début');
  // monter, descendre
  await menu('audit-debriefing', 'Monter');
  await expect(section.locator('.groupe-taches[data-phase="livraison"] .tache-titre')).toHaveText(['Débriefing avec le client', 'Créer le rapport']);
  await page.locator('[data-tache-modele="audit-debriefing"] [data-action="menu-tache-modele"]').click();
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: 'Monter', exact: true })).toBeDisabled();
  await page.keyboard.press('Escape');
  // changer de phase puis supprimer
  await menu('audit-rapport', 'Déplacer vers : Clôture');
  await expect.poll(async () => (await lireDocument('projets_modeles/audit')).taches.find((t) => t.id === 'audit-rapport').phase).toBe('cloture');
  await menu('audit-rapport', 'Supprimer');
  await dialogue(page).getByRole('button', { name: 'Supprimer' }).click();
  await expect.poll(async () => (await lireDocument('projets_modeles/audit')).taches.map((t) => t.id).sort()).toHaveLength(3);
  expect((await lireDocument('projets_modeles/audit')).taches.map((t) => t.id)).toEqual(expect.arrayContaining(['audit-debriefing', 'audit-interview']));
  // chaque changement laisse sa trace dans le journal
  expect((await listerDocuments('crm_audit')).filter((l) => l.collection === 'projets_modeles' && l.docId === 'audit').length).toBe(5); // ajout, modification, déplacement vers le haut, changement de phase, suppression
});

test('C32 « + Projet » avec un modèle : le projet reçoit ses tâches, dates = début + délai ; sans modèle, il démarre vide', async ({ page }) => {
  await connecter(page);
  await attendreModeles();
  await allerA(page, 'Projets');
  await page.locator('.page-actions [data-action="nouveau-projet"]').click();
  await expect(dialogue(page).getByLabel('Modèle')).toHaveValue('');
  await expect(dialogue(page).getByLabel('Modèle').locator('option')).toHaveText(['Aucun modèle (projet vide)', 'Audit', 'Accompagnement']);
  await dialogue(page).getByLabel('Titre', { exact: true }).fill('Audit Carrel');
  await dialogue(page).getByLabel('Modèle').selectOption('audit');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  const p = await attendre('projets_projets', (d) => d.titre === 'Audit Carrel');
  expect(p).toMatchObject({ modeleId: 'audit', phase: 'lancement' });
  await expect.poll(async () => (await listerDocuments('projets_taches')).filter((t) => t.projetId === p.id).length).toBe(3);
  const taches = (await listerDocuments('projets_taches')).filter((t) => t.projetId === p.id);
  expect(taches.map((t) => [t.titre, t.phase, t.ordre, t.date, t.fait]).sort()).toEqual([
    ['Créer le rapport', 'livraison', 1, null, false], ['Débriefing avec le client', 'livraison', 2, null, false], ['Interview', 'decouverte', 1, null, false],
  ].sort());
  // la carte a son cercle d'avancement, la fiche montre le modèle
  await expect(page.locator(`.carte-projet[data-projet="${p.id}"] .anneau-progression`)).toHaveAttribute('data-total', '3');
  await aller(page, `#/projets/projets/${p.id}`);
  await expect(page.locator('[data-prop="modele"] a')).toHaveText('Audit');
  await expect(page.locator('[data-section="projet-taches"] .tache')).toHaveCount(3);
  await page.locator('[data-prop="modele"] a').click();
  await expect(page).toHaveURL(/#\/projets\/modeles\/audit$/);
  // sans modèle : un projet vide
  await allerA(page, 'Projets');
  await page.locator('.page-actions [data-action="nouveau-projet"]').click();
  await dialogue(page).getByLabel('Titre', { exact: true }).fill('Chantier interne');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  const v = await attendre('projets_projets', (d) => d.titre === 'Chantier interne');
  expect(v.modeleId).toBeNull();
  await page.waitForTimeout(500);
  expect((await listerDocuments('projets_taches')).filter((t) => t.projetId === v.id)).toHaveLength(0);
  // les tâches du modèle sont dans l'Accueil le jour dit : ici rien aujourd'hui, mais dans 7 jours elles y seront (dates vérifiées plus haut)
});

test('C32 « Créer le projet » d’une affaire gagnée : le modèle de son offre est préselectionné ; on peut en changer ou n’en prendre aucun', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas', etape: 'gagne', offreId: 'audit' });
  await creerAffaire('a2', { titre: 'Accompagnement Martin', etape: 'gagne', offreId: 'accompagnement' });
  await creerAffaire('a3', { titre: 'Audit sans modèle', etape: 'gagne', offreId: 'audit' });
  await connecter(page);
  await attendreModeles();
  // offre Audit : modèle Audit proposé d'office
  await aller(page, '#/crm/affaires/a1');
  await page.locator('[data-section="affaire-projet"] [data-action="creer-projet"]').click();
  await expect(dialogue(page).getByLabel('Modèle')).toHaveValue('audit');
  await dialogue(page).getByRole('button', { name: 'Créer le projet' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  const p1 = await attendre('projets_projets', (d) => d.affaireId === 'a1');
  expect(p1).toMatchObject({ modeleId: 'audit', offreId: 'audit', titre: 'Audit des Lilas' });
  await expect.poll(async () => (await listerDocuments('projets_taches')).filter((t) => t.projetId === p1.id).length).toBe(3);
  await champDoc('crm_affaires', 'a1', 'projetId', p1.id);
  // offre Accompagnement : un seul rendez-vous de lancement, titre modifiable
  await aller(page, '#/crm/affaires/a2');
  await page.locator('[data-section="affaire-projet"] [data-action="creer-projet"]').click();
  await expect(dialogue(page).getByLabel('Modèle')).toHaveValue('accompagnement');
  await dialogue(page).getByLabel('Titre', { exact: true }).fill('Suivi Martin');
  await dialogue(page).getByRole('button', { name: 'Créer le projet' }).click();
  const p2 = await attendre('projets_projets', (d) => d.affaireId === 'a2');
  expect(p2).toMatchObject({ titre: 'Suivi Martin', modeleId: 'accompagnement' });
  await expect.poll(async () => (await listerDocuments('projets_taches')).filter((t) => t.projetId === p2.id).map((t) => t.titre)).toEqual(['Rendez-vous de lancement']);
  // « Aucun modèle » : projet vide ; titre vide refusé dans la fenêtre
  await aller(page, '#/crm/affaires/a3');
  await page.locator('[data-section="affaire-projet"] [data-action="creer-projet"]').click();
  await dialogue(page).getByLabel('Modèle').selectOption('');
  await dialogue(page).getByLabel('Titre', { exact: true }).fill('  ');
  await dialogue(page).getByRole('button', { name: 'Créer le projet' }).click();
  await expect(dialogue(page).getByRole('alert')).toContainText('Le titre est obligatoire.');
  await dialogue(page).getByLabel('Titre', { exact: true }).fill('Audit sans modèle');
  await dialogue(page).getByRole('button', { name: 'Créer le projet' }).click();
  const p3 = await attendre('projets_projets', (d) => d.affaireId === 'a3');
  expect(p3.modeleId).toBeNull();
  await page.waitForTimeout(500);
  expect((await listerDocuments('projets_taches')).filter((t) => t.projetId === p3.id)).toHaveLength(0);
});

test('C32 un modèle inactif n’est plus proposé ; supprimer un modèle ne touche pas aux projets déjà créés', async ({ page }) => {
  await connecter(page);
  await attendreModeles();
  await aller(page, '#/projets/modeles/audit');
  await page.locator('[data-action="basculer-actif"]').click();
  await champDoc('projets_modeles', 'audit', 'actif', false);
  await allerA(page, 'Projets');
  await page.locator('.page-actions [data-action="nouveau-projet"]').click();
  await expect(dialogue(page).getByLabel('Modèle').locator('option')).toHaveText(['Aucun modèle (projet vide)', 'Accompagnement']);
  await dialogue(page).getByLabel('Titre', { exact: true }).fill('Accompagnement Leroy');
  await dialogue(page).getByLabel('Modèle').selectOption('accompagnement');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  const p = await attendre('projets_projets', (d) => d.titre === 'Accompagnement Leroy');
  await expect.poll(async () => (await listerDocuments('projets_taches')).filter((t) => t.projetId === p.id).length).toBe(1);
  // suppression du modèle : le projet garde ses tâches, la fiche dit « Modèle supprimé »
  await aller(page, '#/projets/modeles/accompagnement');
  await page.locator('[data-action="menu-fiche"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: /Supprimer définitivement/ }).click();
  await dialogue(page).getByRole('button', { name: 'Supprimer' }).click();
  await expect.poll(async () => await lireDocument('projets_modeles/accompagnement')).toBeNull();
  await expect(page).toHaveURL(/#\/reglages\/crm$/); // l'appli revient aux Réglages après la suppression
  expect((await listerDocuments('projets_taches')).filter((t) => t.projetId === p.id)).toHaveLength(1);
  await aller(page, `#/projets/projets/${p.id}`);
  await expect(page.locator('[data-prop="modele"]')).toContainText('Modèle supprimé');
  await expect(page.locator('[data-section="projet-taches"] .tache')).toHaveCount(1);
  await page.waitForTimeout(1200);
  expect((await listerDocuments('projets_modeles')).map((m) => m.id).sort()).toEqual(['audit'], 'un modèle supprimé n’est pas recréé');
});

test('C32 aucun défilement horizontal de l’écran Modèles et d’une fiche de modèle, même avec des textes très longs', async ({ page }) => {
  await connecter(page);
  await attendreModeles();
  await ecrireDocument('projets_modeles/audit', {
    nom: 'Un modèle au nom vraiment très long pour vérifier le comportement des tableaux et des cartes sur petit écran', offreId: 'audit', nature: 'livraison', actif: true, ordre: 1,
    taches: [{ id: 't1', titre: 'Untitretrèslongsansespacepourvérifierlecomportementdelaligneetdesonmenudactionspourlestâchestypes', phase: 'decouverte', delaiJours: 3, ordre: 1 }],
  });
  const sansDebordement = async (nom) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), nom).toBeLessThanOrEqual(0);
  await aller(page, '#/reglages/crm');
  await expect(page.locator('.tableau-modeles')).toBeVisible();
  await sansDebordement('liste des modèles (Réglages)');
  await aller(page, '#/projets/modeles/audit');
  await expect(page.locator('[data-tache-modele="t1"]')).toBeVisible();
  await sansDebordement('fiche d’un modèle');
});

test('C31 enchaîner les tâches au clavier : la tâche ajoutée apparaît tout de suite, sans quitter le champ, et la suivante peut se taper pendant ce temps', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Audit des Lilas' });
  await creerTacheProjet('t0', { titre: 'Déjà là' });
  await connecter(page);
  await aller(page, '#/projets/projets/pr1');
  const section = page.locator('[data-section="projet-taches"]');
  const champ = section.getByLabel('Nouvelle tâche');
  await champ.fill('Première');
  await champ.press('Enter');
  await expect(champ).toHaveValue('');
  await expect(champ).toBeFocused();
  await expect(section.locator('.tache-titre')).toHaveText(['Déjà là', 'Première']); // sans avoir quitté le champ
  await champ.fill('Deuxième');
  await champ.press('Enter');
  await champ.fill('Troisième en cours de frappe');
  await expect(section.locator('.tache-titre')).toHaveText(['Déjà là', 'Première', 'Deuxième']);
  await expect(champ).toHaveValue('Troisième en cours de frappe'); // ce qui est tapé n'est jamais effacé par le rafraîchissement
  await expect(section.locator('.section-compteur')).toHaveText('0/3');
  await expect.poll(async () => (await listerDocuments('projets_taches')).length).toBe(3);
});

test('C32 enchaîner les tâches types au clavier : elles apparaissent tout de suite, le champ reste prêt', async ({ page }) => {
  await connecter(page);
  await attendreModeles();
  await aller(page, '#/projets/modeles/accompagnement');
  const section = page.locator('[data-section="modele-taches"]');
  const champ = section.getByLabel('Nouvelle tâche type');
  await champ.fill('Point mensuel');
  await champ.press('Enter');
  await expect(champ).toHaveValue('');
  await expect(section.locator('.tache-titre')).toHaveText(['Rendez-vous de lancement', 'Point mensuel']);
  await champ.fill('Bilan');
  await champ.press('Enter');
  await expect(section.locator('.tache-titre')).toHaveText(['Rendez-vous de lancement', 'Point mensuel', 'Bilan']);
  await expect(section.locator('.section-compteur')).toHaveText('3');
});

test('C35 bouton « Archives » de l’écran Projets (plus d’entrée de menu) : les projets terminés ou archivés y sont ; la bascule revient au Kanban ; Kanban et Liste restent mémorisés', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Projet vivant' });
  await creerProjet('pr2', { titre: 'Projet rangé', archive: true, statut: 'termine', phase: 'cloture' });
  await connecter(page);
  await allerA(page, 'Projets');
  await page.locator('.bascule-vue[data-vue="archives"]').click();
  await expect(page).toHaveURL(/#\/projets\/archives$/);
  await expect(page.locator('.tableau-projets')).toContainText('Projet rangé');
  await expect(page.locator('.tableau-projets')).not.toContainText('Projet vivant');
  await expect(page.locator('.bascule-vue[data-vue="archives"]')).toHaveAttribute('aria-pressed', 'true');
  // la bascule ramène au tableau de bord des projets vivants
  await page.locator('.bascule-vue[data-vue="kanban"]').click();
  await expect(page).toHaveURL(/#\/projets\/projets$/);
  await expect(page.locator('.carte-projet[data-projet="pr1"]')).toBeVisible();
  await expect(page.locator('.carte-projet[data-projet="pr2"]')).toHaveCount(0);
  // la liste est mémorisée, pas les archives : Projets rouvre la liste
  await page.locator('.bascule-vue[data-vue="liste"]').click();
  await page.locator('.bascule-vue[data-vue="archives"]').click();
  await expect(page).toHaveURL(/#\/projets\/archives$/);
  await allerA(page, 'Projets');
  await expect(page.locator('.bascule-vue[data-vue="liste"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.tableau-projets')).toContainText('Projet vivant');
  await expect(page.locator('.tableau-projets')).not.toContainText('Projet rangé');
});

// ---------------------------------------------------------------- factures (2.2)

/** Ferme les célébrations qui se suivent (paiement, puis clôture…), dans l'ordre où elles s'affichent. */
async function fermerCelebrations(page, classes) {
  for (const classe of classes) {
    await expect(page.locator(`.celebration.${classe}`)).toBeVisible();
    await page.locator(`.celebration.${classe}`).click();
    await expect(page.locator(`.celebration.${classe}`)).toHaveCount(0); // la suivante de la file peut déjà s'afficher
  }
  await expect(page.locator('.celebration')).toHaveCount(0);
}

async function ajouterFacture(page, libelle, montant, envoi = '') {
  await page.locator('[data-action="ouvrir-ajout-facture"]').click(); // « Factures  + Ajouter » ouvre le formulaire
  await page.getByLabel('Libellé de la facture').fill(libelle);
  await page.getByLabel('Montant de la facture en euros').fill(String(montant));
  if (envoi) await page.getByLabel('Date d’envoi de la facture').fill(envoi);
  await page.locator('[data-action="ajouter-facture"]').click();
  await expect(page.locator('.ligne-facture', { hasText: libelle })).toBeVisible();
}

test('C36 factures 30 % + 30 % + 40 % : trois lignes, des paiements successifs, l’objectif « encaissé » suit ; la clôture attend le solde', { tag: '@smoke' }, async ({ page }) => {
  await creerProjet('pr1', { titre: 'Audit Lilas', phase: 'livraison' });
  await connecter(page);
  await attendreModeles();
  await aller(page, '#/projets/projets/pr1');
  const section = page.locator('[data-section="projet-factures"]');
  await expect(section).toContainText('Aucune facture');
  await ajouterFacture(page, 'Acompte 30 %', 300, jour(-3));
  await ajouterFacture(page, 'En cours 30 %', 300);
  await ajouterFacture(page, 'Solde 40 %', 400);
  await expect(section.locator('[data-role="totaux-factures"]')).toContainText('Facturé 1 000 € · payé 0 € · reste à payer 1 000 €');
  // l'écran montre la facture avant que le serveur ait fini d'écrire : on attend l'écriture (sinon la lecture arrive parfois trop tôt)
  await expect.poll(async () => ((await lireDocument('projets_projets/pr1')).factures || []).map((f) => [f.libelle, f.montant, f.statut]))
    .toEqual([['Acompte 30 %', 300, 'a_payer'], ['En cours 30 %', 300, 'a_payer'], ['Solde 40 %', 400, 'a_payer']]);
  // l'acompte est payé : le chiffre d'affaires encaissé du mois le compte, avec sa célébration
  await section.locator('.ligne-facture', { hasText: 'Acompte 30 %' }).locator('[data-action="payer-facture"]').click();
  await dialogue(page).getByRole('button', { name: 'Encaisser' }).click();
  await fermerCelebrations(page, ['celebration-paiement']);
  await expect(section.locator('[data-role="totaux-factures"]')).toContainText('payé 300 € · reste à payer 700 €');
  await expect(section.locator('.ligne-facture', { hasText: 'Acompte 30 %' })).toHaveAttribute('data-statut', 'payee');
  await allerA(page, 'Accueil');
  await expect.poll(() => valeurObjectif(page, 'ca_encaisse')).toBe(300);
  await aller(page, '#/projets/projets/pr1');
  // deuxième paiement : une facture se paie en entier (la fenêtre n'a plus de champ « Montant reçu »)
  await section.locator('.ligne-facture', { hasText: 'En cours 30 %' }).locator('[data-action="payer-facture"]').click();
  await expect(dialogue(page).getByLabel('Date du paiement')).toBeFocused(); // l'autofocus du dialogue arrive en dernier : on attend avant de continuer
  await expect(dialogue(page).getByLabel('Montant reçu en euros')).toHaveCount(0);
  await dialogue(page).getByRole('button', { name: 'Encaisser' }).click();
  await fermerCelebrations(page, ['celebration-paiement']);
  await expect(section.locator('[data-role="totaux-factures"]')).toContainText('payé 600 € · reste à payer 400 €');
  // le solde n'est pas payé : « Terminer » est bloqué, avec les deux sorties
  await page.locator('.fiche-actions [data-action="terminer"]').click();
  await expect(dialogue(page)).toContainText('Clôture bloquée');
  await expect(dialogue(page)).toContainText('Solde 40 % : 400 €');
  await expect(dialogue(page).getByRole('button', { name: 'Clôturer avec impayé…' })).toBeVisible();
  expect((await lireDocument('projets_projets/pr1')).statut).toBe('actif');
  // sortie 1 : marquer le solde payé, la clôture reprend toute seule
  await dialogue(page).locator('[data-action="sortie-payer"]').click();
  await dialogue(page).getByRole('button', { name: 'Encaisser' }).click();
  await fermerCelebrations(page, ['celebration-paiement', 'celebration-cloture']);
  await champDoc('projets_projets', 'pr1', 'statut', 'termine');
  const fini = await lireDocument('projets_projets/pr1');
  expect(fini.factures.map((f) => f.statut)).toEqual(['payee', 'payee', 'payee']);
  expect(fini.factures.map((f) => f.montant)).toEqual([300, 300, 400]);
  await expect(page.locator('[data-role="impaye"]')).toHaveCount(0);
  const types = (await listerDocuments('crm_evenements')).map((e) => e.type);
  expect(types.filter((t) => t === 'encaissement')).toHaveLength(3);
});

// ---------------------------------------------------------------- Factures : règles de relecture (C41, 2.15.3)
const CAPTURES_FACTURES = join(homedir(), 'chantiers-crm', 'captures-factures-2-15-3');
const capturerFacture = (page, nom) => page.screenshot({ path: join(CAPTURES_FACTURES, `${nom}${estTelephone(page) ? '-tel' : ''}.png`), animations: 'disabled' });

test('C41.1 une facture se paie en entier : « Marquer payée » n’a plus de champ montant et dit la somme attendue', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Audit Lilas', phase: 'livraison', factures: [
    { id: 'f1', libelle: 'Solde', montant: 700, dateEnvoi: jour(-5), datePaiement: null, statut: 'a_payer' },
  ] });
  await connecter(page);
  await attendreModeles();
  await aller(page, '#/projets/projets/pr1');
  await page.locator('.ligne-facture', { hasText: 'Solde' }).locator('[data-action="payer-facture"]').click();
  await expect(dialogue(page).getByLabel('Date du paiement')).toBeFocused();
  await expect(dialogue(page).getByLabel('Montant reçu en euros')).toHaveCount(0);
  await expect(dialogue(page)).toContainText('Une facture se paie en entier');
  await expect(dialogue(page)).toContainText('700');
  await capturerFacture(page, 'C41-1-paiement-en-entier');
  await dialogue(page).getByRole('button', { name: 'Encaisser' }).click();
  await fermerCelebrations(page, ['celebration-paiement']);
  expect((await lireDocument('projets_projets/pr1')).factures[0]).toMatchObject({ statut: 'payee', montant: 700 });
});

test('C41.2 projet terminé : « Remettre à payer » et « Ajouter » une facture à payer sont refusés (« rouvre-le d’abord ») ; après « Rouvrir », ils passent', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Audit Carrel', phase: 'cloture', statut: 'termine', archive: true, factures: [
    { id: 'f1', libelle: 'Solde', montant: 400, dateEnvoi: jour(-9), datePaiement: jour(-2), statut: 'payee' },
  ] });
  await connecter(page);
  await attendreModeles();
  await aller(page, '#/projets/projets/pr1');
  const ligne = page.locator('.ligne-facture', { hasText: 'Solde' });
  await ligne.locator('[data-action="menu-facture"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Remettre à payer' }).click();
  await expect(page.locator('.toast-erreur').last()).toContainText('Ce projet est terminé : rouvre-le d’abord.');
  await capturerFacture(page, 'C41-2-projet-termine-refus');
  expect((await lireDocument('projets_projets/pr1')).factures[0].statut).toBe('payee');
  await page.locator('[data-action="ouvrir-ajout-facture"]').click();
  await page.getByLabel('Libellé de la facture').fill('Complément');
  await page.getByLabel('Montant de la facture en euros').fill('100');
  await page.locator('[data-action="ajouter-facture"]').click();
  await expect(page.locator('.toast-erreur').last()).toContainText('rouvre-le d’abord');
  expect((await lireDocument('projets_projets/pr1')).factures).toHaveLength(1);
  // après « Rouvrir », le même geste passe
  await page.locator('.fiche-actions [data-action="rouvrir"]').click();
  await champDoc('projets_projets', 'pr1', 'statut', 'actif');
  await ligne.locator('[data-action="menu-facture"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Remettre à payer' }).click();
  await expect.poll(async () => (await lireDocument('projets_projets/pr1')).factures[0].statut, { timeout: 10_000 }).toBe('a_payer');
});

test('C41.3 une facture payée garde sa date de paiement : la vider est refusé avec un message, rien n’est changé', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Audit Lilas', phase: 'livraison', factures: [
    { id: 'f1', libelle: 'Acompte', montant: 300, dateEnvoi: jour(-9), datePaiement: jour(-2), statut: 'payee' },
  ] });
  await connecter(page);
  await attendreModeles();
  await aller(page, '#/projets/projets/pr1');
  await page.locator('.ligne-facture', { hasText: 'Acompte' }).locator('[data-action="menu-facture"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Modifier…' }).click();
  await dialogue(page).getByLabel('Date du paiement').fill('');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialogue(page)).toContainText('Une facture payée garde sa date de paiement');
  await capturerFacture(page, 'C41-3-date-paiement-obligatoire');
  expect((await lireDocument('projets_projets/pr1')).factures[0].datePaiement).toBe(jour(-2));
});

test('C36 clôturer avec impayé : raison obligatoire, la facture est abandonnée, pastille « Impayé » ; on peut rouvrir si le client finit par payer', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Accompagnement Dupont', phase: 'livraison', factures: [
    { id: 'f1', libelle: 'Acompte', montant: 500, dateEnvoi: jour(-30), datePaiement: jour(-25), statut: 'payee' },
    { id: 'f2', libelle: 'Solde', montant: 700, dateEnvoi: jour(-5), datePaiement: null, statut: 'a_payer' },
  ] });
  await connecter(page);
  await attendreModeles();
  await aller(page, '#/projets/projets/pr1');
  await page.locator('.fiche-actions [data-action="terminer"]').click();
  await dialogue(page).getByRole('button', { name: 'Clôturer avec impayé…' }).click();
  // la raison est obligatoire
  await dialogue(page).getByRole('button', { name: 'Abandonner' }).click();
  await expect(dialogue(page)).toContainText('Dis en quelques mots pourquoi');
  await dialogue(page).getByLabel('Raison', { exact: true }).fill('Client injoignable');
  await dialogue(page).getByRole('button', { name: 'Abandonner' }).click();
  await fermerCelebrations(page, ['celebration-cloture']);
  await champDoc('projets_projets', 'pr1', 'statut', 'termine');
  const fini = await lireDocument('projets_projets/pr1');
  expect(fini.factures.map((f) => f.statut)).toEqual(['payee', 'abandonnee']);
  expect(fini.factures[1]).toMatchObject({ raison: 'Client injoignable' });
  await expect(page.locator('.fiche-sous [data-role="impaye"]')).toHaveText('Impayé');
  await expect(page.locator('[data-section="projet-factures"] [data-role="totaux-factures"]')).toContainText('abandonné 700 €');
  expect((await listerDocuments('crm_evenements')).some((e) => e.type === 'facture_abandonnee' && e.projetId === 'pr1')).toBe(true);
  // l'impayé ne compte pas dans l'encaissé, la facture payée si (payée il y a 25 jours : hors du mois courant sauf début de mois, on ne contrôle que l'abandon)
  await page.locator('.fiche-actions [data-action="rouvrir"]').click();
  await champDoc('projets_projets', 'pr1', 'statut', 'actif');
  // le client finit par payer : on remet la facture à payer, on l'encaisse, la clôture passe
  await page.locator('.ligne-facture', { hasText: 'Solde' }).locator('[data-action="menu-facture"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Remettre à payer' }).click();
  await expect(page.locator('.ligne-facture', { hasText: 'Solde' })).toHaveAttribute('data-statut', 'a_payer');
  await page.locator('.ligne-facture', { hasText: 'Solde' }).locator('[data-action="payer-facture"]').click();
  await dialogue(page).getByRole('button', { name: 'Encaisser' }).click();
  await fermerCelebrations(page, ['celebration-paiement']);
  await expect(page.locator('[data-role="impaye"]')).toHaveCount(0);
  await page.locator('.fiche-actions [data-action="terminer"]').click();
  await fermerCelebrations(page, ['celebration-cloture']);
  await champDoc('projets_projets', 'pr1', 'statut', 'termine');
  expect((await lireDocument('projets_projets/pr1')).factures.map((f) => f.statut)).toEqual(['payee', 'payee']);
});

test('C36 déplacer une carte vers la Clôture avec une facture à payer : refusé avec les deux sorties ; Annuler laisse la phase ; les Archives montrent la pastille Impayé', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Projet en attente de paiement', phase: 'livraison', factures: [{ id: 'f1', libelle: 'Solde', montant: 400, dateEnvoi: jour(-2), datePaiement: null, statut: 'a_payer' }] });
  await creerProjet('pr2', { titre: 'Projet clos avec impayé', phase: 'cloture', statut: 'termine', archive: true, factures: [{ id: 'f9', libelle: 'Solde', montant: 100, dateEnvoi: jour(-40), datePaiement: null, statut: 'abandonnee', raison: 'Faillite' }] });
  await connecter(page);
  await attendreModeles();
  await allerA(page, 'Projets');
  const carte = page.locator('.carte-projet[data-projet="pr1"]');
  await carte.locator('.carte-menu').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Déplacer vers : Clôture' }).click();
  await expect(dialogue(page)).toContainText('Clôture bloquée');
  await dialogue(page).getByRole('button', { name: 'Annuler' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  await page.waitForTimeout(400);
  expect((await lireDocument('projets_projets/pr1')).phase).toBe('livraison');
  await allerA(page, 'Projets');
  await page.locator('.bascule-vue[data-vue="archives"]').click();
  await expect(page.locator('.tableau-projets')).toContainText('Projet clos avec impayé');
  await expect(page.locator('.tableau-projets [data-role="impaye"]')).toHaveText('Impayé');
});

// ---------------------------------------------------------------- configuration du CRM (ménage du 16/10/2026)

test('C37 Réglages : les restes de la 2.2 ont disparu (migration, délai de paiement, encaissements de la fiche affaire)', { tag: '@sans-telephone' }, async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit payé', etape: 'gagne', statut: 'gagnee', montant: 800, encaissements: [{ date: new Date(), montant: 800, offreId: null }] });
  await connecter(page);
  await attendreModeles();
  await aller(page, '#/reglages/crm');
  await expect(page.locator('#reglages-etapes')).toBeVisible();
  await expect(page.locator('#reglages-migration, #reglages-delai')).toHaveCount(0);
  await expect(page.getByText('Délai de paiement')).toHaveCount(0);
  await aller(page, '#/crm/affaires/a1');
  await expect(page.locator('[data-section="affaire-encaissements"]')).toHaveCount(0);
});

test('C38 Réglages : étapes de vente configurables — renommer, expliquer (icône « i »), désactiver seulement si vide, activer un emplacement', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Dans Rendez vous', etape: 'rdv_fixe' });
  await connecter(page);
  await attendreModeles();
  await aller(page, '#/reglages/crm');
  const sec = page.locator('#reglages-etapes');
  await expect(sec.locator('.emplacement')).toHaveCount(6);
  const ligne = (id) => sec.locator(`.emplacement[data-emplacement="${id}"]`);
  // désactiver une étape qui contient une affaire : refusé, rien n'est écrit
  await ligne('rdv_fixe').locator('[data-role="actif"]').uncheck();
  await sec.locator('[data-action="enregistrer-etape"]').click();
  await expect(sec.locator('[data-erreur="rdv_fixe"]')).toContainText('contient 1 fiche');
  await ligne('rdv_fixe').locator('[data-role="actif"]').check();
  // renommer + décrire la première étape, activer la cinquième
  await ligne('premier_contact').getByLabel('Nom de l’emplacement 1').fill('Premier échange');
  await ligne('premier_contact').getByLabel('Description de l’emplacement 1').fill('Le prospect vient de nous écrire.');
  await ligne('etape_5').locator('[data-role="actif"]').check();
  await ligne('etape_5').getByLabel('Nom de l’emplacement 5').fill('En négociation');
  await sec.locator('[data-action="enregistrer-etape"]').click();
  await expect(page.locator('.toast', { hasText: 'Étapes enregistrées' })).toBeVisible();
  await expect.poll(async () => (await lireDocument('crm_parametres/etapes'))?.items?.[0]?.libelle).toBe('Premier échange');
  const doc = await lireDocument('crm_parametres/etapes');
  expect(doc.roleGagnee).toBe('gagne');
  expect(doc.items.map((e) => e.id)).toEqual(['premier_contact', 'rdv_fixe', 'proposition_envoyee', 'gagne', 'etape_5', 'etape_6']);
  expect(doc.items[4]).toMatchObject({ libelle: 'En négociation', actif: true });
  // Kanban : toutes les étapes actives, même vides ; le nouveau nom suit
  await allerA(page, 'Affaires');
  await expect(page.locator('.kanban > .colonne')).toHaveCount(5);
  await expect(page.locator('.colonne[data-colonne="premier_contact"] h2')).toHaveText('Premier échange');
  await expect(page.locator('.colonne[data-colonne="etape_5"] .carte-affaire')).toHaveCount(0);
  // fiche affaire : la barre des étapes porte l'icône « i » de l'étape décrite
  await aller(page, '#/crm/affaires/a1');
  await expect(page.locator('.barre-etapes-fiche [data-role="info"]')).toHaveCount(1);
  await expect(page.locator('.barre-etapes-fiche [data-role="bulle-info"]')).toHaveText('Le prospect vient de nous écrire.');
});

// ---------------------------------------------------------------- Boutons Enregistrer des Réglages (consignes-ui.md, 2026-10-18)
const JAUNE_ENREGISTRER = 'rgb(236, 188, 6)';
const DOSSIER_CAPTURES = join(homedir(), 'chantiers-crm', 'captures-reglages-enregistrer');
async function capturer(page, cible, nom, theme) {
  await page.evaluate((t) => document.documentElement.setAttribute('data-theme', t), theme);
  await page.waitForTimeout(300);
  await cible.screenshot({ path: join(DOSSIER_CAPTURES, `${nom}-${theme}${estTelephone(page) ? '-tel' : ''}.png`), animations: 'disabled' });
}
const fond = (loc) => loc.evaluate((el) => getComputedStyle(el).backgroundColor);

for (const genre of ['etape', 'phase']) {
  test(`1 Réglages ${genre === 'etape' ? 'étapes de vente' : 'phases de projet'} : Enregistrer et Annuler sont grisés sans modification, jaunes dès qu'on change quelque chose, grisés de nouveau après l'enregistrement`, async ({ page }) => {
    await connecter(page);
    await allerAuxReglagesCrm(page);
    const sec = page.locator(genre === 'etape' ? '#reglages-etapes' : '#reglages-phases');
    const enregistrer = sec.locator(`[data-action="enregistrer-${genre}"]`);
    const annuler = sec.locator(`[data-action="annuler-${genre}"]`);
    await expect(enregistrer).toBeDisabled();
    await expect(annuler).toBeDisabled();
    for (const t of ['clair', 'sombre']) await capturer(page, sec.locator('.ligne-boutons'), `1-${genre}-grise`, t);
    const nom = sec.getByLabel('Nom de l’emplacement 1');
    const ancien = await nom.inputValue();
    await nom.fill(`${ancien} bis`);
    await expect(enregistrer).toBeEnabled();
    await expect(annuler).toBeEnabled();
    await expect.poll(() => fond(enregistrer)).toBe(JAUNE_ENREGISTRER);
    for (const t of ['clair', 'sombre']) await capturer(page, sec.locator('.ligne-boutons'), `1-${genre}-jaune`, t);
    // on remet la valeur d'origine : plus rien à enregistrer, donc grisé
    await nom.fill(ancien);
    await expect(enregistrer).toBeDisabled();
    await nom.fill(`${ancien} bis`);
    await enregistrer.click();
    await expect(page.locator('.toast', { hasText: genre === 'etape' ? 'Étapes enregistrées' : 'Phases enregistrées' })).toBeVisible();
    await expect(enregistrer).toBeDisabled();
    await expect(annuler).toBeDisabled();
    // « Annuler les changements » ramène le brouillon et regrise
    await nom.fill('Autre nom');
    await annuler.click();
    await expect(nom).toHaveValue(`${ancien} bis`);
    await expect(enregistrer).toBeDisabled();
  });
}

test('1 Réglages cas d’erreur : un enregistrement refusé laisse Enregistrer jaune et affiche le message d’erreur existant', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Dans Rendez vous', etape: 'rdv_fixe' });
  await connecter(page);
  await allerAuxReglagesCrm(page);
  const sec = page.locator('#reglages-etapes');
  await sec.locator('.emplacement[data-emplacement="rdv_fixe"] [data-role="actif"]').uncheck();
  const enregistrer = sec.locator('[data-action="enregistrer-etape"]');
  await enregistrer.click();
  await expect(sec.locator('[data-erreur="rdv_fixe"]')).toContainText('contient 1 fiche');
  await expect(enregistrer).toBeEnabled();
  await page.mouse.move(0, 0); // sort du survol (le jaune de survol est plus clair)
  await expect.poll(() => fond(enregistrer)).toBe(JAUNE_ENREGISTRER);
  await capturer(page, sec, '1-erreur-refus', 'clair');
});

test('2 Réglages : la carte « Options » dit sous son titre « Chaque case s’enregistre toute seule. »', async ({ page }) => {
  await connecter(page);
  await allerAuxReglagesCrm(page);
  const sec = page.locator('#reglages-options');
  await expect(sec.locator('h2 + p[data-role="aide-auto-enregistrement"]')).toHaveText('Chaque case s’enregistre toute seule.');
  for (const t of ['clair', 'sombre']) await capturer(page, sec, '2-options-aide', t);
});

test('3 Réglages : quitter la page avec un brouillon non enregistré demande confirmation ; sans modification, on part sans question', async ({ page }) => {
  await connecter(page);
  await allerAuxReglagesCrm(page);
  const sec = page.locator('#reglages-etapes');
  // rien de modifié : aucune fenêtre
  await aller(page, '#/crm/personnes');
  await expect(dialogue(page)).toHaveCount(0);
  await expect(page).toHaveURL(/#\/crm\/personnes$/);
  await allerAuxReglagesCrm(page);
  await sec.getByLabel('Nom de l’emplacement 1').fill('Brouillon');
  await aller(page, '#/crm/personnes');
  await expect(dialogue(page)).toContainText('Quitter sans enregistrer ?');
  await capturer(page, dialogue(page), '3-confirmation-sortie', 'clair');
  await expect(page).toHaveURL(/#\/reglages\/crm$/);
  await dialogue(page).getByRole('button', { name: 'Annuler' }).click(); // on reste, le brouillon est intact
  await expect(sec.getByLabel('Nom de l’emplacement 1')).toHaveValue('Brouillon');
  await aller(page, '#/crm/personnes');
  await dialogue(page).getByRole('button', { name: 'Quitter sans enregistrer' }).click();
  await expect(page).toHaveURL(/#\/crm\/personnes$/);
  await allerAuxReglagesCrm(page);
  await expect(page.locator('#reglages-etapes').getByLabel('Nom de l’emplacement 1')).not.toHaveValue('Brouillon');
});

test('4 La règle « Enregistrer grisé / jaune, cases qui s’enregistrent toutes seules » est écrite dans docs/consignes-ui.md', async () => {
  const texte = readFileSync(join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'docs', 'consignes-ui.md'), 'utf8');
  expect(texte).toContain('grisé tant qu\'il n\'y a rien à enregistrer et jaune dès qu\'une modification est faite');
  expect(texte).toContain('s\'enregistrent toutes seules');
});

test('C39 Réglages : options du CRM — suivi des paiements, dossier Drive : éteindre cache les écrans associés', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Audit des Lilas' });
  await connecter(page);
  await attendreModeles();
  await aller(page, '#/projets/projets/pr1');
  await expect(page.locator('[data-section="projet-factures"]')).toHaveCount(1);
  await aller(page, '#/reglages/crm');
  const option = (cle) => page.locator(`[data-option="${cle}"]`);
  await expect(option('suiviPaiements')).toBeChecked();
  await option('suiviPaiements').uncheck();
  await expect.poll(async () => (await lireDocument('crm_parametres/reglages'))?.suiviPaiements).toBe(false);
  await expect(option('clotureBloquee')).toBeDisabled(); // sans suivi des paiements, la règle n'a plus d'objet
  await aller(page, '#/projets/projets/pr1');
  await expect(page.locator('[data-section="projet-factures"]')).toHaveCount(0);
  // « Créer un dossier dans Google Drive » : éteint, plus de section de réglages Drive ni de bouton ; le dossier de travail reste un lien libre
  await aller(page, '#/reglages/crm');
  await expect(page.locator('#reglages-projets')).toBeVisible();
  await expect(page.locator('[data-ligne="boutonsDepot"] [data-role="zone-dossier-parent"]')).toBeVisible();
  await option('boutonsDepot').uncheck();
  await expect(page.locator('#reglages-projets')).toBeHidden();
  await expect(page.locator('[data-role="zone-dossier-parent"]')).toHaveCount(0); // la zone du dossier parent disparaît avec la case
  await aller(page, '#/projets/projets/pr1');
  await ouvrirDocuments(page);
  await expect(page.locator('[data-prop="github"], [data-action="creer-dossier-ouvrir"]')).toHaveCount(0);
  await expect(page.locator('[data-prop="dossier"]')).toBeVisible();
});

test('C40 Réglages : objectifs — chaque indicateur calculé explique son calcul ; on ajoute le chiffre d’affaires signé', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Signée', etape: 'gagne', statut: 'gagnee', montant: 1200, datesEtapes: { gagne: new Date() } });
  await connecter(page);
  await attendreModeles();
  await aller(page, '#/reglages/crm');
  const sec = page.locator('#reglages-objectifs');
  await expect(sec.locator('[data-role="explication"]').first()).toBeVisible();
  await expect(sec.locator('.ligne-objectif[data-objectif="ca_encaisse"] [data-role="explication"]')).toContainText('marquées payées');
  await sec.getByLabel('Indicateur calculé à ajouter').selectOption('ca_signe');
  await expect(sec.locator('[data-role="explication-ajout"]')).toContainText('vente gagnée');
  await sec.locator('[data-action="ajouter-calcule"]').click();
  await expect.poll(async () => (await listerDocuments('os_objectifs')).some((o) => o.calcul === 'ca_signe')).toBe(true);
  const objectif = (await listerDocuments('os_objectifs')).find((o) => o.calcul === 'ca_signe');
  await allerA(page, 'Accueil');
  await expect.poll(() => valeurObjectif(page, objectif.id)).toBe(1200);
});
