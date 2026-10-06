// Tests C : écran Projets (étape 2 : Kanban par phase, liste, fiche), formats 1440 × 900 et 390 × 844.
import {
  test, expect, connecter, allerA, creerPersonne, creerOrganisation, creerAffaire, creerProjet, lireDocument, listerDocuments, ecrireDocument,
  jour, estTelephone, JEROME,
} from './outils.js';

const dialogue = (page) => page.getByRole('dialog');
const LIBELLES = { lancement: 'Lancement', decouverte: 'Découverte', livraison: 'Livraison', cloture: 'Clôture' };

async function aller(page, hash) {
  await page.evaluate((h) => { location.hash = h; }, hash);
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

test('C29 menu « Projets » et bouton « + » : un projet se crée en ne tapant que le titre, au bon endroit, avec sa trace dans le journal', async ({ page }) => {
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
  expect(p).toMatchObject({ phase: 'lancement', statut: 'actif', nature: 'livraison', affaireId: null, archive: false, proprietaire: JEROME, dateDebut: jour(0) });
  await expect(page.locator(`.colonne[data-colonne="lancement"] .carte-projet[data-projet="${p.id}"]`)).toContainText('Site chevalier-ia.fr');
  for (const ph of ['decouverte', 'livraison', 'cloture']) await expect(page.locator(`.colonne[data-colonne="${ph}"] .carte-projet`)).toHaveCount(0);
  // fil et journal : l'événement « Projet créé » et les lignes d'audit (projet + événement, même lot)
  const ev = await attendre('crm_evenements', (e) => e.type === 'projet_cree');
  expect(ev).toMatchObject({ projetId: p.id, texte: 'Projet créé : Site chevalier-ia.fr' });
  await expect.poll(async () => (await listerDocuments('crm_audit')).filter((l) => l.outil === 'creerProjet').length).toBe(2);
  const lignes = (await listerDocuments('crm_audit')).filter((l) => l.outil === 'creerProjet');
  expect(lignes.map((l) => l.collection).sort()).toEqual(['crm_evenements', 'projets_projets']);
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
  await page.locator('.barre-etapes-fiche [data-phase="livraison"]').click();
  await champDoc('projets_projets', 'pr1', 'phase', 'livraison');
  await expect(page.locator('.barre-etapes-fiche .etape.courante')).toHaveText('Livraison');
  // pause et reprise
  await page.locator('.fiche-actions [data-action="en-pause"]').click();
  await champDoc('projets_projets', 'pr1', 'statut', 'en_pause');
  await expect(page.locator('.fiche-sous .pastille-statut')).toHaveText('En pause');
  await page.locator('.fiche-actions [data-action="reprendre"]').click();
  await champDoc('projets_projets', 'pr1', 'statut', 'actif');
  // terminer : Clôture, Terminé, archivé
  await page.locator('.fiche-actions [data-action="terminer"]').click();
  await champDoc('projets_projets', 'pr1', 'statut', 'termine');
  const fini = await lireDocument('projets_projets/pr1');
  expect(fini).toMatchObject({ phase: 'cloture', archive: true });
  await expect(page.locator('.barre-etapes-fiche .etape.courante')).toHaveText('Clôture');
  await expect(page.locator('.fiche-sous .badge-archive')).toBeVisible();
  await allerA(page, 'Projets');
  await expect(page.locator('.carte-projet')).toHaveCount(0);
  await page.locator('.bascule-vue[data-vue="archives"]').click();
  await expect(page.locator('.tableau-projets')).toContainText('Audit Carrel');
  await page.locator('.tableau-projets a', { hasText: 'Audit Carrel' }).click();
  // rouvrir
  await page.locator('.fiche-actions [data-action="rouvrir"]').click();
  await champDoc('projets_projets', 'pr1', 'statut', 'actif');
  expect((await lireDocument('projets_projets/pr1')).archive).toBe(false);
  const types = (await listerDocuments('crm_evenements')).map((e) => e.type).sort();
  expect(types).toEqual(['phase_changee', 'projet_en_pause', 'projet_repris', 'projet_rouvert', 'projet_termine']);
});

test('C29 fiche : titre, dates (la fin ne précède pas le début), adresse GitHub, documents', async ({ page }) => {
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
  // adresse GitHub : proposée, enregistrée seulement quand on la valide, adresse invalide refusée
  await page.locator('[data-champ="github"]').fill('https://exemple.fr/pas-github');
  await page.locator('[data-action="enregistrer-github"]').click();
  await expect(page.locator('.toast', { hasText: 'https://github.com/' })).toBeVisible();
  expect((await lireDocument('projets_projets/pr1')).urlGithub).toBe('');
  await page.locator('[data-champ="github"]').fill('https://github.com/jeromechevalier-wq/client-carrel');
  await page.locator('[data-action="enregistrer-github"]').click();
  await champDoc('projets_projets', 'pr1', 'urlGithub', 'https://github.com/jeromechevalier-wq/client-carrel');
  // documents
  await page.getByLabel('Libellé du document').fill('Devis signé');
  await page.getByLabel('Adresse du document (lien Google Drive)').fill('https://drive.google.com/file/d/abc/view');
  await page.locator('[data-action="ajouter-document"]').click();
  await expect.poll(async () => (await lireDocument('projets_projets/pr1')).documents).toEqual([{ libelle: 'Devis signé', url: 'https://drive.google.com/file/d/abc/view' }]);
  await expect(page.locator('[data-section="projet-documents"]')).toContainText('Devis signé');
});

test('C29 notes d’un projet : seulement Notes et historique ; la note est aussi dans l’historique de la personne, de l’organisation et de l’affaire', async ({ page }) => {
  await creerOrganisation('o1', { nom: 'Atelier des Lilas' });
  await creerPersonne('p1', { nom: 'Camille Durand', organisationId: 'o1' });
  await creerAffaire('a1', { titre: 'Audit des Lilas', personneId: 'p1', organisationId: 'o1', etape: 'gagne' });
  await creerProjet('pr1', { titre: 'Audit des Lilas', affaireId: 'a1', personneId: 'p1', organisationId: 'o1' });
  await connecter(page);
  await aller(page, '#/projets/projets/pr1');
  const panneau = page.locator('.panneau-activite');
  await expect(panneau.getByRole('tab')).toHaveCount(1);
  await expect(panneau.getByRole('tab', { name: 'Notes' })).toHaveAttribute('aria-selected', 'true');
  await expect(panneau.locator('.points-cles')).toHaveCount(0);
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
  await creerProjet('pr3', { titre: 'Extraction Carrel', phase: 'decouverte', nature: 'extraction', statut: 'en_pause' });
  await creerProjet('pr4', { titre: 'Ancien chantier', phase: 'cloture', statut: 'termine', archive: true });
  await connecter(page);
  await allerA(page, 'Projets');
  await expect(page.locator('.compteur-liste')).toHaveText('3 projets');
  await expect(page.locator('.carte-projet[data-projet="pr3"] .badge-nature')).toHaveText('Extraction');
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
  await dialogue(page).getByLabel('Extraction de valeur').check();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('.carte-projet')).toHaveCount(1);
  await expect(page.locator('.pastille-filtre')).toContainText('Nature : Extraction de valeur');
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
  await expect(page.locator('.tableau-projets .ligne-liste').first()).toContainText('Extraction Carrel');
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
  await creerProjet('pr3', { titre: 'Extraction Carrel', phase: 'decouverte', nature: 'extraction' });
  await connecter(page);
  await allerA(page, 'Projets');
  await expect(page.locator('.carte-projet')).toHaveCount(3);
  // rien à enregistrer tant qu'aucun filtre n'est posé
  await page.locator('[data-action="filtres-enregistres"]').click();
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: 'Enregistrer ce filtre…' })).toBeDisabled();
  await page.keyboard.press('Escape');
  // poser deux filtres puis les enregistrer
  await page.locator('[data-action="filtres"]').click();
  await dialogue(page).getByLabel('Extraction de valeur').check();
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
  await dialogue(page).getByLabel('Nom du filtre').fill('Extractions à explorer');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect.poll(async () => ((await lireDocument('crm_parametres/filtres'))?.items ?? []).some((f) => f.nom === 'Extractions à explorer' && f.liste === 'projets')).toBe(true);
  // un nom déjà pris est refusé
  await page.locator('[data-action="filtres-enregistres"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Enregistrer ce filtre…' }).click();
  await dialogue(page).getByLabel('Nom du filtre').fill('extractions à explorer');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.toast', { hasText: 'Un filtre porte déjà ce nom.' })).toBeVisible();
  expect(((await lireDocument('crm_parametres/filtres')).items).filter((f) => f.liste === 'projets')).toHaveLength(1);
  // effacer puis réappliquer
  await page.getByRole('button', { name: 'Tout effacer' }).click();
  await expect(page.locator('.carte-projet')).toHaveCount(3);
  await page.locator('[data-action="filtres-enregistres"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Extractions à explorer' }).click();
  await expect(page.locator('.carte-projet')).toHaveCount(1);
  await expect(page.locator('.carte-projet[data-projet="pr3"]')).toBeVisible();
  await expect(page.locator('.pastille-filtre')).toHaveCount(2);
  // les filtres du CRM ne sont pas proposés ici, et celui-ci n'est pas proposé dans les Affaires
  await page.locator('[data-action="filtres-enregistres"]').click();
  await expect(page.locator('.menu-pop').getByRole('menuitem')).toHaveText(['Extractions à explorer', 'Enregistrer ce filtre…']);
  await page.keyboard.press('Escape');
  await allerA(page, 'Affaires');
  await page.locator('[data-action="filtres-enregistres"]').click();
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: 'Extractions à explorer' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  // Réglages : renommer puis supprimer
  await allerA(page, 'Réglages');
  const ligne = page.locator('.ligne-reglage', { hasText: 'Extractions à explorer' });
  await expect(ligne).toContainText('Projets');
  await ligne.locator('[data-action="renommer-filtre"]').click();
  await dialogue(page).getByLabel('Nom du filtre').fill('Extractions');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.ligne-reglage', { hasText: 'Extractions' })).toContainText('Projets');
  await page.locator('.ligne-reglage', { hasText: 'Extractions' }).locator('[data-action="supprimer-filtre"]').click();
  await dialogue(page).getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.locator('.ligne-reglage', { hasText: 'Extractions' })).toHaveCount(0);
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
