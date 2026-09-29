// Tests C : parcours dans le navigateur (Playwright + émulateurs), formats 1440 × 900 et 390 × 844.
import { readFile } from 'node:fs/promises';
import {
  test, expect, connecter, allerA, creerFiche, lireDocument, listerDocuments, ecrireDocument,
  jour, estTelephone, valeurObjectif, JEROME, CHARLES, URL_APP,
} from './outils.js';

async function ouvrirFiche(page, id) {
  await page.evaluate((h) => { location.hash = h; }, `#/crm/fiche/${id}`);
  await expect(page.locator('.panneau-fiche.ouvert')).toBeVisible();
}

async function fermerFiche(page) {
  await page.getByRole('button', { name: 'Fermer la fiche' }).click();
  await expect(page.locator('.panneau-fiche')).toHaveCount(0);
}

/** Change l'étape d'une carte : glisser déposer sur ordinateur, menu "Déplacer vers…" sur téléphone. */
async function deplacerCarte(page, id, etape) {
  const carte = page.locator(`.carte-kanban[data-fiche="${id}"]`);
  await expect(carte).toBeVisible();
  if (estTelephone(page)) {
    await carte.locator('.bouton-deplacer').click();
    await page.locator(`.menu-deplacer [data-etape="${etape}"]`).click();
  } else {
    await carte.dragTo(page.locator(`.colonne-kanban[data-etape="${etape}"]`));
  }
}

async function champ(page, id, attendu) {
  await expect.poll(async () => (await lireDocument(`crm_prospects/${id}`))?.[attendu[0]], { timeout: 10_000 }).toEqual(attendu[1]);
}

async function fermerCelebration(page) {
  const c = page.locator('.celebration');
  await expect(c).toBeVisible();
  await c.click();
  await expect(c).toHaveCount(0);
}

function compterEnregistrementsCsv(texte) {
  return texte.replace(/^﻿/, '').trimEnd().split(/\r\n(?=(?:[^"]*"[^"]*")*[^"]*$)/).length;
}

// ---------------------------------------------------------------- connexion

test('C1 connexion avec Jérôme : arrivée sur l’Accueil, 6 objectifs affichés', async ({ page }) => {
  await connecter(page, JEROME);
  await expect(page).toHaveURL(/#\/crm\/accueil$/);
  await expect(page.getByRole('heading', { name: 'Bonjour Jérôme' })).toBeVisible();
  await expect(page.locator('.grille-objectifs .objectif')).toHaveCount(6);
  for (const libelle of ['Interviews JTBD réalisées', 'Nouveaux contacts', 'Rendez vous tenus', 'Propositions envoyées', "Chiffre d'affaires encaissé", 'Flyers distribués']) {
    await expect(page.locator('.objectif-libelle', { hasText: libelle })).toBeVisible();
  }
  // Données initialisées au premier lancement
  await expect.poll(async () => (await listerDocuments('crm_parametres')).map((d) => d.id).sort()).toEqual(['filtres', 'listes', 'offres', 'reglages']);
  await expect.poll(async () => (await listerDocuments('os_objectifs')).length).toBe(6);
});

test('C1 connexion avec Charles : mêmes données, nom et avatar de Charles', async ({ page }) => {
  await creerFiche('partagee', { nom: 'Fiche partagée' });
  await connecter(page, CHARLES);
  await expect(page.getByRole('heading', { name: 'Bonjour Charles' })).toBeVisible();
  await expect(page.locator('img.avatar-charles').first()).toHaveAttribute('src', 'assets/charles-portrait.png');
  await allerA(page, 'Liste');
  await expect(page.locator('.ligne-fiche[data-fiche="partagee"]')).toBeVisible();
});

test('C1 le bouton "Se connecter avec Google" lance la connexion Google (fenêtre ou redirection)', async ({ page, context }) => {
  let demandeGoogle = false;
  await context.route(/https:\/\/apis\.google\.com\/.*/, (route) => { demandeGoogle = true; route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }); });
  await page.goto(`${URL_APP}#/crm/accueil`);
  const bouton = page.getByRole('button', { name: 'Se connecter avec Google' });
  await expect(bouton).toBeVisible();
  if (estTelephone(page)) {
    // Téléphone : redirection vers la page de connexion Google (ici, celle de l'émulateur).
    await bouton.click();
    await page.waitForURL(/emulator\/auth\/handler/);
  } else {
    // Ordinateur : fenêtre surgissante (le SDK prépare d'abord la connexion avec apis.google.com).
    const popup = page.waitForEvent('popup', { timeout: 8000 }).then(() => true).catch(() => false);
    await bouton.click();
    await expect.poll(async () => demandeGoogle || (await Promise.race([popup, new Promise((r) => setTimeout(() => r(false), 200))]))).toBe(true);
  }
});

test('C2 connexion avec un compte non autorisé : accès refusé, retour à l’écran de connexion, aucune donnée', async ({ page }) => {
  await creerFiche('secrete', { nom: 'Donnée confidentielle' });
  const requetesFirestore = [];
  page.on('request', (r) => { if (r.url().includes(':8080/')) requetesFirestore.push(r.url()); });
  await connecter(page, 'quelquun.dautre@gmail.com', { attendreAccueil: false });
  await expect(page.getByRole('alert')).toHaveText("Accès refusé : ce compte n'est pas autorisé");
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
  await expect(page.locator('.coquille')).toHaveCount(0);
  await expect(page.getByText('Donnée confidentielle')).toHaveCount(0);
  expect(requetesFirestore).toEqual([]);
  // Déconnexion effective
  expect(await page.evaluate(() => Object.keys(localStorage).concat(Object.keys(sessionStorage)).some((k) => k.startsWith('firebase:authUser')))).toBe(false);
});

test('C2 un compte autorisé dont l’email n’est pas vérifié est refusé', async ({ page }) => {
  await connecter(page, JEROME, { attendreAccueil: false, emailVerifie: false });
  await expect(page.getByRole('alert')).toHaveText("Accès refusé : ce compte n'est pas autorisé");
  await expect(page.locator('.coquille')).toHaveCount(0);
});

// ---------------------------------------------------------------- fiches

test('C3 créer une fiche (champs obligatoires contrôlés), la retrouver dans la Liste, le Kanban et la recherche', async ({ page }) => {
  await connecter(page);
  await allerA(page, 'Liste');
  await page.getByRole('button', { name: 'Nouvelle fiche' }).click();
  await page.getByRole('button', { name: 'Créer la fiche' }).click();
  await expect(page.locator('[data-erreur="nom"]')).toHaveText('Le prénom et le nom sont obligatoires.');
  await expect(page.locator('[data-erreur="source"]')).toHaveText('La source est obligatoire.');
  expect(await listerDocuments('crm_prospects')).toHaveLength(0);

  await page.locator('#creation-nom').fill('Élodie Petit');
  await page.locator('#creation-entreprise').fill('Savons du Luberon');
  await page.locator('#creation-ville').fill('Manosque');
  await page.locator('#creation-source').selectOption('Commerçant local');
  await page.getByRole('button', { name: 'Créer la fiche' }).click();
  await expect(page.locator('.panneau-fiche .fiche-nom')).toHaveText('Élodie Petit');
  const docs = await listerDocuments('crm_prospects');
  expect(docs).toHaveLength(1);
  const f = docs[0];
  expect(f).toMatchObject({ nom: 'Élodie Petit', source: 'Commerçant local', etape: 'premier_contact', priorite: 'tiede', roles: ['prospect'], creePar: JEROME, datePremierContact: jour(0) });
  expect(f.creeLe).toBeInstanceOf(Date);
  await fermerFiche(page);

  const ligne = page.locator(`.ligne-fiche[data-fiche="${f.id}"]`);
  await expect(ligne).toContainText('Élodie Petit');
  const recherche = page.getByRole('searchbox', { name: 'Rechercher' });
  await recherche.fill('elodie');
  await expect(ligne).toBeVisible();
  await recherche.fill('SAVONS luberon');
  await expect(ligne).toBeVisible();
  await recherche.fill('introuvable');
  await expect(ligne).toHaveCount(0);
  await recherche.fill('');

  await allerA(page, 'Kanban');
  await expect(page.locator(`.colonne-kanban[data-etape="premier_contact"] .carte-kanban[data-fiche="${f.id}"]`)).toBeVisible();
  await page.getByRole('searchbox', { name: 'Rechercher' }).fill('élodie');
  await expect(page.locator(`.carte-kanban[data-fiche="${f.id}"]`)).toBeVisible();
});

test('C4 glisser une carte de Premier contact à Rendez vous fixé puis revenir : datesEtapes et historique à jour', async ({ page }) => {
  await creerFiche('c4', { nom: 'Marc Blanc' });
  await connecter(page, JEROME, { route: 'crm/kanban' });
  await deplacerCarte(page, 'c4', 'rdv_fixe');
  await expect(page.locator('.colonne-kanban[data-etape="rdv_fixe"] .carte-kanban[data-fiche="c4"]')).toBeVisible();
  await champ(page, 'c4', ['etape', 'rdv_fixe']);
  const apres1 = await lireDocument('crm_prospects/c4');
  expect(apres1.datesEtapes.rdv_fixe).toBeInstanceOf(Date);
  expect(apres1.historique).toHaveLength(1);
  expect(apres1.historique[0].texte).toBe('Étape : Premier contact → Rendez vous fixé');

  await deplacerCarte(page, 'c4', 'premier_contact');
  await expect(page.locator('.colonne-kanban[data-etape="premier_contact"] .carte-kanban[data-fiche="c4"]')).toBeVisible();
  await champ(page, 'c4', ['etape', 'premier_contact']);
  const apres2 = await lireDocument('crm_prospects/c4');
  expect(apres2.historique).toHaveLength(2);
  expect(apres2.historique[1].texte).toBe('Étape : Rendez vous fixé → Premier contact');
  expect(apres2.datesEtapes.rdv_fixe.getTime()).toBe(apres1.datesEtapes.rdv_fixe.getTime());
  expect(apres2.dateEntreeEtape.getTime()).toBeGreaterThanOrEqual(apres1.dateEntreeEtape.getTime());
});

test('C5 passage en Proposition envoyée : suggestion affichée ; la fermer ne change rien, la valider fixe l’action', async ({ page }) => {
  await creerFiche('c5a', { nom: 'Anne Leroy', etape: 'rdv_fixe' });
  await creerFiche('c5b', { nom: 'Bruno Faure', etape: 'rdv_fixe' });
  await connecter(page, JEROME, { route: 'crm/kanban' });

  await deplacerCarte(page, 'c5a', 'proposition_envoyee');
  const suggestion = page.locator('.suggestion');
  await expect(suggestion).toBeVisible();
  await expect(suggestion.getByLabel('Action suggérée')).toHaveValue('Relancer la proposition');
  await expect(suggestion.getByLabel('Date suggérée')).toHaveValue(jour(3));
  await suggestion.getByRole('button', { name: 'Fermer', exact: true }).click();
  await expect(suggestion).toHaveCount(0);
  await champ(page, 'c5a', ['etape', 'proposition_envoyee']);
  const a = await lireDocument('crm_prospects/c5a');
  expect(a.prochaineAction).toBe('');
  expect(a.dateProchaineAction).toBeNull();

  await deplacerCarte(page, 'c5b', 'proposition_envoyee');
  await expect(suggestion).toBeVisible();
  await suggestion.getByRole('button', { name: 'Valider' }).click();
  await champ(page, 'c5b', ['prochaineAction', 'Relancer la proposition']);
  expect((await lireDocument('crm_prospects/c5b')).dateProchaineAction).toBe(jour(3));
});

test('C6 passage en Gagné : célébration visible, puis fermée au clic', async ({ page }) => {
  await creerFiche('c6', { nom: 'Claire Morel', etape: 'proposition_envoyee' });
  await connecter(page, JEROME, { route: 'crm/kanban' });
  await deplacerCarte(page, 'c6', 'gagne');
  const c = page.locator('.celebration');
  await expect(c).toBeVisible();
  await expect(c).toContainText('Bravo Jérôme !');
  await expect(c.locator('img[src="assets/charles-portrait.png"]')).toBeVisible();
  await c.click();
  await expect(c).toHaveCount(0);
  await champ(page, 'c6', ['etape', 'gagne']);
  await expect(page.locator('.suggestion').getByLabel('Action suggérée')).toHaveValue('Envoyer la facture');
});

test('C7 passage en Facture payée : carte retirée du Kanban, objectif chiffre d’affaires augmenté', async ({ page }) => {
  await creerFiche('c7', { nom: 'David Garcia', etape: 'facture_envoyee', montant: 700, offreId: 'audit' });
  await connecter(page);
  expect(await valeurObjectif(page, 'ca_encaisse')).toBe(0);
  await allerA(page, 'Kanban');
  await deplacerCarte(page, 'c7', 'facture_payee');
  const dialogueEnc = page.getByRole('dialog', { name: 'Facture payée' });
  await expect(dialogueEnc.getByLabel('Montant encaissé')).toHaveValue('700');
  await dialogueEnc.getByRole('button', { name: 'Enregistrer l’encaissement' }).click();
  await expect(page.locator('.celebration-paiement')).toBeVisible();
  await fermerCelebration(page);
  await expect(page.locator('.carte-kanban[data-fiche="c7"]')).toHaveCount(0);
  await expect(page.locator('.colonne-kanban[data-etape="facture_payee"] .payees-nombre')).toHaveText('1 payée ce mois');
  const f = await lireDocument('crm_prospects/c7');
  expect(f.archive).toBe(true);
  expect(f.encaissements).toHaveLength(1);
  expect(f.encaissements[0].montant).toBe(700);
  await allerA(page, 'Accueil');
  await expect.poll(() => valeurObjectif(page, 'ca_encaisse')).toBe(700);
  // La fiche reste dans la Liste (filtre Archivés)
  await allerA(page, 'Liste');
  await page.getByRole('button', { name: 'Filtres' }).click();
  await page.locator('.panneau-filtres').getByRole('button', { name: 'Archivés' }).click();
  await expect(page.locator('.ligne-fiche[data-fiche="c7"]')).toBeVisible();
});

test('C8 bouton "Fait" sur une action du jour : la ligne disparaît, la boîte de prochaine action s’ouvre', async ({ page }) => {
  await creerFiche('c8', { nom: 'Emma Roche', prochaineAction: 'Appeler Emma', dateProchaineAction: jour(0) });
  await connecter(page);
  const ligne = page.locator('[data-groupe="aujourdhui"] .ligne-a-faire[data-fiche="c8"]');
  await expect(ligne).toContainText('Appeler Emma');
  await ligne.getByRole('button', { name: /Fait/ }).click();
  const boite = page.getByRole('dialog', { name: 'Et ensuite ?' });
  await expect(boite).toBeVisible();
  await expect(page.locator('.ligne-a-faire[data-fiche="c8"]').filter({ hasText: 'Appeler Emma' })).toHaveCount(0);
  await expect(page.locator('.charles-content')).toContainText('Tout est fait pour aujourd’hui');
  await champ(page, 'c8', ['prochaineAction', '']);
  const f = await lireDocument('crm_prospects/c8');
  expect(f.historique.at(-1).texte).toBe('Action faite : Appeler Emma');
  await boite.getByRole('textbox', { name: 'Prochaine action', exact: true }).fill('Envoyer le devis');
  await boite.getByRole('button', { name: '+1 semaine' }).click();
  await boite.getByRole('button', { name: 'Enregistrer' }).click();
  await champ(page, 'c8', ['prochaineAction', 'Envoyer le devis']);
  expect((await lireDocument('crm_prospects/c8')).dateProchaineAction).toBe(jour(7));
});

test('C9 cocher "Rendez vous tenu" : objectif rendez vous augmenté', async ({ page }) => {
  await creerFiche('c9', { nom: 'Farid Benali', etape: 'rdv_fixe', dateRdv: `${jour(0)}T10:30` });
  await connecter(page);
  expect(await valeurObjectif(page, 'rdv_tenus')).toBe(0);
  await ouvrirFiche(page, 'c9');
  await page.getByRole('checkbox', { name: 'Rendez vous tenu' }).check();
  await champ(page, 'c9', ['rdvTenu', true]);
  await fermerFiche(page);
  await expect.poll(() => valeurObjectif(page, 'rdv_tenus')).toBe(1);
  const f = await lireDocument('crm_prospects/c9');
  expect(f.dateRdvTenu).toBeInstanceOf(Date);
});

test('C10 objectif flyers : "+10" met à jour la barre et persiste après rechargement', async ({ page }) => {
  await connecter(page);
  const carte = page.locator('.objectif[data-objectif="flyers"]');
  await carte.getByRole('button', { name: 'Ajouter 10 à Flyers distribués' }).click();
  await expect.poll(() => valeurObjectif(page, 'flyers')).toBe(10);
  await expect(carte.locator('.objectif-pct')).toHaveText('10 %');
  await expect.poll(() => carte.locator('.barre-remplie').evaluate((el) => el.style.width)).toBe('10%');
  await carte.getByRole('button', { name: 'Ajouter 1 à Flyers distribués' }).click();
  await expect.poll(() => valeurObjectif(page, 'flyers')).toBe(11);
  await expect.poll(async () => (await listerDocuments('os_objectifs_saisies'))[0]?.valeur).toBe(11);
  await page.reload();
  await expect(page.locator('.objectif[data-objectif="flyers"] .objectif-pct')).toHaveText('11 %');
  expect(await valeurObjectif(page, 'flyers')).toBe(11);
  const saisies = await listerDocuments('os_objectifs_saisies');
  expect(saisies).toHaveLength(1);
  expect(saisies[0].id).toMatch(/^flyers_\d{4}-\d{2}$/);
});

test('C11 notes : texte libre jamais modifié automatiquement ; note rapide ajoutée, copiée dans Notes, supprimée', async ({ page }) => {
  await creerFiche('c11', { nom: 'Gaëlle Simon', email: 'gaelle@exemple.fr', notes: 'Texte libre initial', prochaineAction: 'Rappeler', dateProchaineAction: jour(1) });
  await connecter(page);
  await ouvrirFiche(page, 'c11');
  const panneau = page.locator('.panneau-fiche');
  // Actions automatiques : changement d'étape, email envoyé, action faite, rendez vous tenu
  await panneau.locator('#fiche-etape').selectOption('rdv_fixe');
  await champ(page, 'c11', ['etape', 'rdv_fixe']);
  await panneau.getByRole('button', { name: 'Email envoyé' }).click();
  await panneau.getByRole('checkbox', { name: 'Rendez vous tenu' }).check();
  await panneau.getByRole('button', { name: 'Fait', exact: true }).click();
  await page.getByRole('dialog', { name: 'Et ensuite ?' }).getByRole('button', { name: 'Plus tard' }).click();
  await champ(page, 'c11', ['prochaineAction', '']);
  expect((await lireDocument('crm_prospects/c11')).notes).toBe('Texte libre initial');
  await expect(panneau.locator('[data-champ="notes"]')).toHaveValue('Texte libre initial');

  // Note rapide
  await panneau.getByLabel('Nouvelle note rapide').fill('Rappeler mardi, très motivée');
  await panneau.getByRole('button', { name: 'Ajouter', exact: true }).first().click();
  const note = panneau.locator('.note-rapide', { hasText: 'Rappeler mardi, très motivée' });
  await expect(note).toBeVisible();
  await note.getByRole('button', { name: 'Copier dans Notes' }).click();
  await champ(page, 'c11', ['notes', 'Texte libre initial\n\nRappeler mardi, très motivée']);
  await expect(panneau.locator('[data-champ="notes"]')).toHaveValue('Texte libre initial\n\nRappeler mardi, très motivée');
  await note.getByRole('button', { name: 'Supprimer' }).click();
  await expect(note).toHaveCount(0);
  await expect.poll(async () => (await lireDocument('crm_prospects/c11')).notesRapides.length).toBe(0);
  expect((await lireDocument('crm_prospects/c11')).notes).toBe('Texte libre initial\n\nRappeler mardi, très motivée');
  // Saisie libre dans Notes
  await panneau.locator('[data-champ="notes"]').fill('Compte rendu du rendez vous');
  await panneau.locator('[data-champ="notes"]').blur();
  await champ(page, 'c11', ['notes', 'Compte rendu du rendez vous']);
});

test('C12 filtres enregistrés : créer, renommer, supprimer', async ({ page }) => {
  await creerFiche('c12a', { nom: 'Hugo Chaud', priorite: 'chaud' });
  await creerFiche('c12b', { nom: 'Inès Froide', priorite: 'froid' });
  await connecter(page, JEROME, { route: 'crm/liste' });
  // Les 4 filtres de départ
  for (const nom of ['À relancer cette semaine', 'Chauds', 'Réseau entrepreneuses', 'Interviews JTBD à faire']) {
    await expect(page.locator('.filtres-enregistres').getByRole('button', { name: nom })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Filtres' }).click();
  await page.locator('.panneau-filtres').getByRole('button', { name: 'Froid' }).click();
  await expect(page.locator('.pastille-filtre', { hasText: 'Priorité : Froid' })).toBeVisible();
  await expect(page.locator('.ligne-fiche')).toHaveCount(1);
  await page.getByRole('button', { name: 'Enregistrer ce filtre' }).click();
  const boite = page.getByRole('dialog', { name: 'Enregistrer ce filtre' });
  await boite.getByRole('textbox').fill('Mes froids');
  await boite.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.filtres-enregistres').getByRole('button', { name: 'Mes froids' })).toBeVisible();
  await expect.poll(async () => (await lireDocument('crm_parametres/filtres')).items.map((f) => f.nom)).toContain('Mes froids');
  // Pastille supprimable, puis application du filtre enregistré
  await page.getByRole('button', { name: 'Tout effacer' }).click();
  await expect(page.locator('.ligne-fiche')).toHaveCount(2);
  await page.locator('.filtres-enregistres').getByRole('button', { name: 'Mes froids' }).click();
  await expect(page.locator('.ligne-fiche')).toHaveCount(1);

  await allerA(page, 'Réglages');
  const ligne = page.locator('#reglages-filtres .ligne-reglage', { hasText: 'Mes froids' });
  await ligne.getByRole('button', { name: 'Renommer' }).click();
  const renommer = page.getByRole('dialog', { name: 'Renommer le filtre' });
  await renommer.getByRole('textbox').fill('Prospects froids');
  await renommer.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('#reglages-filtres .ligne-reglage', { hasText: 'Prospects froids' })).toBeVisible();
  await page.locator('#reglages-filtres .ligne-reglage', { hasText: 'Prospects froids' }).getByRole('button', { name: 'Supprimer' }).click();
  await page.getByRole('dialog', { name: 'Supprimer le filtre' }).getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.locator('#reglages-filtres .ligne-reglage', { hasText: 'Prospects froids' })).toHaveCount(0);
  await expect.poll(async () => (await lireDocument('crm_parametres/filtres')).items.map((f) => f.nom)).toEqual(['À relancer cette semaine', 'Chauds', 'Réseau entrepreneuses', 'Interviews JTBD à faire']);
});

test('C13 réglages : ajouter une offre, l’archiver ; elle reste lisible sur une fiche existante', async ({ page }) => {
  await connecter(page, JEROME, { route: 'reglages' });
  await expect(page.getByRole('heading', { name: 'Réglages' })).toBeVisible();
  const section = page.locator('#reglages-offres');
  await expect(section.locator('.ligne-reglage[data-offre="audit"]')).toBeVisible();
  await section.getByPlaceholder('Nom de la nouvelle offre').fill('Atelier IA');
  await section.getByRole('button', { name: 'Ajouter une offre' }).click();
  await expect(section.locator('.ligne-reglage[data-offre="atelier_ia"]')).toBeVisible();
  await expect.poll(async () => (await lireDocument('crm_parametres/offres')).items.map((o) => o.nom)).toEqual(['Audit', 'Accompagnement', 'Atelier IA']);
  await creerFiche('c13', { nom: 'Julie Atelier', offreId: 'atelier_ia', montant: 400 });
  await section.locator('.ligne-reglage[data-offre="atelier_ia"]').getByRole('button', { name: 'Archiver' }).click();
  await expect(section.locator('.ligne-reglage[data-offre="atelier_ia"]')).toContainText('Archivée');
  await expect.poll(async () => (await lireDocument('crm_parametres/offres')).items.find((o) => o.id === 'atelier_ia').actif).toBe(false);
  await ouvrirFiche(page, 'c13');
  const offre = page.locator('#fiche-offre');
  await expect(offre).toHaveValue('atelier_ia');
  await expect(offre.locator('option:checked')).toHaveText('Atelier IA (archivée)');
  // Une offre archivée n'est plus proposée aux autres fiches
  await fermerFiche(page);
  await creerFiche('c13b', { nom: 'Autre fiche' });
  await ouvrirFiche(page, 'c13b');
  await expect(page.locator('#fiche-offre option', { hasText: 'Atelier IA' })).toHaveCount(0);
});

test('C14 export CSV : fichier téléchargé avec le bon nombre de lignes ; le rappel d’export disparaît', async ({ page }) => {
  await creerFiche('e1', { nom: 'Karim Export', notes: 'Ligne 1\nLigne 2; avec "guillemets"' });
  await creerFiche('e2', { nom: 'Léa Export' });
  await creerFiche('e3', { nom: 'Marc Archivé', etape: 'facture_payee', archive: true });
  await connecter(page);
  const rappel = page.locator('.rappel-export');
  await expect(rappel).toContainText('Pense à ta sauvegarde mensuelle');
  const [telechargement] = await Promise.all([page.waitForEvent('download'), rappel.getByRole('button', { name: 'Exporter' }).click()]);
  expect(telechargement.suggestedFilename()).toBe(`chevalier-ia-prospects-${jour(0)}.csv`);
  const contenu = await readFile(await telechargement.path(), 'utf8');
  expect(contenu.charCodeAt(0)).toBe(0xfeff);
  expect(contenu.split('\r\n')[0]).toContain('Prénom et nom;');
  expect(compterEnregistrementsCsv(contenu)).toBe(1 + 3);
  expect(contenu).toContain('"Ligne 1\nLigne 2; avec ""guillemets"""');
  await expect(rappel).toHaveCount(0);
  await expect.poll(async () => (await lireDocument('crm_parametres/reglages')).dernierExport).toBeInstanceOf(Date);
  // Export des fiches filtrées depuis la Liste
  await allerA(page, 'Liste');
  await page.getByRole('searchbox', { name: 'Rechercher' }).fill('léa');
  await expect(page.locator('.ligne-fiche')).toHaveCount(1);
  const [filtre] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Exporter en CSV' }).click()]);
  expect(compterEnregistrementsCsv(await readFile(await filtre.path(), 'utf8'))).toBe(1 + 1);
  // Le rappel reste masqué après rechargement
  await page.reload();
  await allerA(page, 'Accueil');
  await expect(page.locator('.grille-objectifs .objectif')).toHaveCount(6);
  await expect(page.locator('.rappel-export')).toHaveCount(0);
});

test('C14 le rappel d’export réapparaît quand le dernier export date de plus de 30 jours', async ({ page }) => {
  await ecrireDocument('crm_parametres/reglages', { delaiPaiementJours: 30, dernierExport: new Date(Date.now() - 31 * 86400000) });
  await connecter(page);
  await expect(page.locator('.rappel-export')).toBeVisible();
  await ecrireDocument('crm_parametres/reglages', { delaiPaiementJours: 30, dernierExport: new Date(Date.now() - 5 * 86400000) });
  await expect(page.locator('.rappel-export')).toHaveCount(0);
});

test('C15 opposition à la prospection : bouton email désactivé', async ({ page }) => {
  await creerFiche('c15', { nom: 'Nadia Opposée', email: 'nadia@exemple.fr' });
  await connecter(page);
  await ouvrirFiche(page, 'c15');
  const ecrire = page.getByRole('button', { name: 'Écrire un email' });
  await expect(ecrire).toBeEnabled();
  await page.getByLabel('Opposition à la prospection').check();
  await expect(ecrire).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Email envoyé' })).toBeDisabled();
  await champ(page, 'c15', ['oppositionProspection', true]);
  expect((await lireDocument('crm_prospects/c15')).dateOpposition).toBeInstanceOf(Date);
  await fermerFiche(page);
  await allerA(page, 'Kanban');
  await expect(page.locator('.carte-kanban[data-fiche="c15"] .badge-opposition')).toBeVisible();
});

test('C15 sans adresse email, le bouton email est désactivé', async ({ page }) => {
  await creerFiche('c15b', { nom: 'Sans Email' });
  await connecter(page);
  await ouvrirFiche(page, 'c15b');
  await expect(page.getByRole('button', { name: 'Écrire un email' })).toBeDisabled();
});

test('C16 supprimer définitivement : confirmation exigée, fiche disparue', async ({ page }) => {
  await creerFiche('c16', { nom: 'Olivier Supprimé' });
  await creerFiche('c16b', { nom: 'Pauline Gardée' });
  await connecter(page, JEROME, { route: 'crm/liste' });
  await ouvrirFiche(page, 'c16');
  await page.getByRole('button', { name: 'Supprimer définitivement' }).click();
  const boite = page.getByRole('dialog', { name: 'Supprimer définitivement' });
  const confirmer = boite.getByRole('button', { name: 'Supprimer définitivement' });
  await expect(confirmer).toBeDisabled();
  await boite.getByLabel('Nom de la fiche').fill('Olivier');
  await expect(confirmer).toBeDisabled();
  await boite.getByLabel('Nom de la fiche').fill('Olivier Supprimé');
  await expect(confirmer).toBeEnabled();
  await confirmer.click();
  await expect(page.locator('.panneau-fiche')).toHaveCount(0);
  await expect.poll(() => lireDocument('crm_prospects/c16')).toBeNull();
  await expect(page.locator('.ligne-fiche[data-fiche="c16"]')).toHaveCount(0);
  await expect(page.locator('.ligne-fiche[data-fiche="c16b"]')).toBeVisible();
});

test('C16 annuler la suppression conserve la fiche', async ({ page }) => {
  await creerFiche('c16c', { nom: 'Quentin Conservé' });
  await connecter(page);
  await ouvrirFiche(page, 'c16c');
  await page.getByRole('button', { name: 'Supprimer définitivement' }).click();
  await page.getByRole('dialog', { name: 'Supprimer définitivement' }).getByRole('button', { name: 'Annuler' }).click();
  expect(await lireDocument('crm_prospects/c16c')).not.toBeNull();
});

// ---------------------------------------------------------------- coquille

test('C17 menu : replié par défaut, élargi au clic, état conservé ; sur 390 px, panneau par dessus le contenu', async ({ page }) => {
  await connecter(page);
  const menu = page.locator('aside.menu');
  if (estTelephone(page)) {
    const contenuAvant = await page.locator('main.contenu').boundingBox();
    expect(contenuAvant.x).toBe(0);
    expect(contenuAvant.width).toBeGreaterThanOrEqual(389);
    await expect.poll(async () => (await menu.boundingBox()).x).toBeLessThan(-100);
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
    await expect.poll(async () => (await menu.boundingBox()).x).toBe(0);
    const contenu = await page.locator('main.contenu').boundingBox();
    expect(contenu.x).toBe(0); // le contenu n'est pas décalé : le panneau passe par dessus
    expect(await menu.evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
    await expect(page.locator('.voile-menu')).toBeVisible();
    await expect(menu.getByRole('link', { name: 'Kanban' })).toBeVisible();
    await menu.getByRole('link', { name: 'Kanban' }).click();
    await expect(page).toHaveURL(/#\/crm\/kanban$/);
    await expect.poll(async () => (await menu.boundingBox()).x).toBeLessThan(-100);
  } else {
    await expect(page.locator('.coquille')).toHaveAttribute('data-menu', 'replie');
    await expect.poll(async () => Math.round((await menu.boundingBox()).width)).toBe(64);
    await expect(menu.locator('.menu-entree[data-chemin="crm/accueil"]')).toHaveAttribute('data-infobulle', 'Accueil');
    await page.getByRole('button', { name: 'Élargir le menu' }).click();
    await expect(page.locator('.coquille')).toHaveAttribute('data-menu', 'elargi');
    await expect.poll(async () => Math.round((await menu.boundingBox()).width)).toBe(240);
    await expect(menu.getByText('Liste', { exact: true })).toBeVisible();
    await page.reload();
    await expect(page.locator('.coquille')).toHaveAttribute('data-menu', 'elargi');
    await expect.poll(async () => Math.round((await menu.boundingBox()).width)).toBe(240);
    await page.getByRole('button', { name: 'Replier le menu' }).click();
    await expect.poll(async () => Math.round((await menu.boundingBox()).width)).toBe(64);
    await page.reload();
    await expect(page.locator('.coquille')).toHaveAttribute('data-menu', 'replie');
  }
});

test('C18 thème : bascule sombre / clair conservée après rechargement', async ({ page }) => {
  await connecter(page);
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'sombre');
  const fondSombre = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  if (estTelephone(page)) await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await page.locator('.menu').getByRole('button', { name: 'Thème clair' }).click();
  await expect(html).toHaveAttribute('data-theme', 'clair');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(fondSombre);
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'clair');
  await expect(page.locator('.grille-objectifs .objectif')).toHaveCount(6);
  if (estTelephone(page)) await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await page.locator('.menu').getByRole('button', { name: 'Thème sombre' }).click();
  await expect(html).toHaveAttribute('data-theme', 'sombre');
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'sombre');
});

test('C19 nouvelle version : bandeau au retour sur l’onglet ; hors réseau, bandeau "Hors ligne"', async ({ page, context, erreursConsole }) => {
  await connecter(page);
  await expect(page.locator('#bandeau-version')).toHaveCount(0);
  await page.route('**/version.json*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"version": "9.9.9"}' }));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  const bandeau = page.locator('#bandeau-version');
  await expect(bandeau).toContainText('Nouvelle version disponible');
  await expect(bandeau.getByRole('button', { name: 'Recharger' })).toBeVisible();

  await context.setOffline(true);
  await expect(page.locator('#bandeau-hors-ligne')).toContainText('Hors ligne : reconnecte toi pour continuer');
  await context.setOffline(false);
  await expect(page.locator('#bandeau-hors-ligne')).toHaveCount(0);
  // Pendant la coupure, seules les erreurs réseau attendues (connexion Firestore coupée) sont tolérées.
  const inattendues = erreursConsole.filter((e) => !/ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|Could not reach Cloud Firestore|WebChannelConnection|net::ERR_/.test(e));
  erreursConsole.length = 0;
  erreursConsole.push(...inattendues);
});

test('C19 le bouton "Recharger" recharge l’appli', async ({ page }) => {
  await connecter(page);
  await page.route('**/version.json*', (route) => route.fulfill({ status: 200, contentType: 'application/json', body: '{"version": "1.0.1"}' }));
  await page.evaluate(() => { window.__avantRechargement = true; document.dispatchEvent(new Event('visibilitychange')); });
  await page.getByRole('button', { name: 'Recharger' }).click();
  await expect.poll(() => page.evaluate(() => window.__avantRechargement === undefined)).toBe(true);
});

test('C20 aucun défilement horizontal sur les écrans principaux (et aucune erreur de console)', async ({ page }) => {
  await creerFiche('c20', {
    nom: 'Raphaëlle de La Tour-Vieille', entreprise: 'Une entreprise au nom particulièrement long pour tester le débordement', etape: 'rdv_fixe',
    prochaineAction: 'Envoyer une proposition détaillée avec plusieurs options tarifaires', dateProchaineAction: jour(-3), montant: 12500, priorite: 'chaud',
    notesRapides: [{ id: 'n', texte: 'Unmotextrêmementlongsansespacepourvérifierlecomportementdurendu', date: new Date(), auteur: JEROME }],
  });
  await connecter(page);
  const sansDebordement = async () => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
  await sansDebordement();
  for (const vue of ['Kanban', 'Liste', 'Réglages', 'Accueil']) {
    await allerA(page, vue);
    await expect(page.locator('.page')).toBeVisible();
    await sansDebordement();
  }
  await ouvrirFiche(page, 'c20');
  await sansDebordement();
  await page.getByRole('button', { name: 'Filtres' }).count();
  await fermerFiche(page);
  await allerA(page, 'Liste');
  await page.getByRole('button', { name: 'Filtres' }).click();
  await sansDebordement();
});

test('C navigation : lien direct vers une fiche, retour à la vue, route inconnue', async ({ page }) => {
  await creerFiche('nav', { nom: 'Sophie Lien' });
  await connecter(page, JEROME, { route: 'crm/fiche/nav', attendreAccueil: false });
  await expect(page.locator('.panneau-fiche .fiche-nom')).toHaveText('Sophie Lien');
  await fermerFiche(page);
  await expect(page).toHaveURL(/#\/crm\/accueil$/);
  await page.evaluate(() => { location.hash = '#/inconnue'; });
  await expect(page).toHaveURL(/#\/crm\/accueil$/);
});

test('C déconnexion : retour à l’écran de connexion', async ({ page }) => {
  await connecter(page);
  if (estTelephone(page)) await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await page.getByRole('button', { name: 'Se déconnecter' }).click();
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
  await expect(page.locator('.coquille')).toHaveCount(0);
});

test('C Pas maintenant et Perdu : boîtes obligatoires, réveil dans "Aujourd’hui", Nouvelle affaire', async ({ page }) => {
  await creerFiche('pm', { nom: 'Thomas Réveil', etape: 'premier_contact' });
  await creerFiche('pd', { nom: 'Ugo Perdu', etape: 'proposition_envoyee', montant: 900, offreId: 'audit' });
  await creerFiche('rv', { nom: 'Vera Réveillée', etape: 'pas_maintenant', dateReveil: jour(0) });
  await connecter(page);
  await expect(page.locator('[data-groupe="aujourdhui"] .ligne-a-faire[data-fiche="rv"]')).toContainText('Reprendre contact');
  await ouvrirFiche(page, 'pd');
  await page.locator('#fiche-etape').selectOption('perdu');
  const boite = page.getByRole('dialog', { name: 'Passer en Perdu' });
  await boite.getByRole('button', { name: 'Valider' }).click();
  await expect(boite).toBeVisible(); // raison obligatoire
  await boite.getByLabel('Raison').selectOption('Prix');
  await boite.getByRole('button', { name: 'Valider' }).click();
  await champ(page, 'pd', ['raisonPerdu', 'Prix']);
  await page.getByRole('button', { name: 'Nouvelle affaire' }).click();
  await champ(page, 'pd', ['etape', 'premier_contact']);
  const pd = await lireDocument('crm_prospects/pd');
  expect(pd.montant).toBeNull();
  expect(pd.offreId).toBeNull();
  await fermerFiche(page);
  await allerA(page, 'Kanban');
  await deplacerCarte(page, 'pm', 'pas_maintenant');
  const reveil = page.getByRole('dialog', { name: 'Passer en Pas maintenant' });
  await reveil.getByLabel('Date de réveil').fill(jour(30));
  await reveil.getByRole('button', { name: 'Valider' }).click();
  await champ(page, 'pm', ['dateReveil', jour(30)]);
  await expect(page.locator('.colonne-kanban[data-etape="pas_maintenant"] .compteur')).toHaveText('2');
});
