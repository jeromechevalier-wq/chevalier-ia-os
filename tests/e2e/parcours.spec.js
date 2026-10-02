// Tests C : parcours dans le navigateur (Playwright + émulateurs), formats 1440 × 900 et 390 × 844.
import {
  test, expect, connecter, allerA, creerPersonne, creerOrganisation, creerAffaire, creerActivite, lireDocument, listerDocuments, ecrireDocument,
  jour, estTelephone, valeurObjectif, JEROME, CHARLES,
} from './outils.js';

const dialogue = (page) => page.getByRole('dialog');
const suggestions = (page, nom = 'Organisation') => dialogue(page).locator(`ul.suggestions[aria-label="${nom}"]`);

async function ouvrirCreation(page, quoi) {
  const liste = { personne: ['Personnes', 'nouvelle-personne'], organisation: ['Organisations', 'nouvelle-organisation'], affaire: ['Affaires', 'nouvelle-affaire'] }[quoi];
  await allerA(page, liste[0]);
  await page.locator(`.page-actions [data-action="${liste[1]}"]`).click();
  await expect(dialogue(page)).toBeVisible();
}

async function enregistrer(page) {
  await dialogue(page).getByRole('button', { name: /^(Enregistrer|Créer quand même)$/ }).click();
  await expect(dialogue(page)).toHaveCount(0);
}

async function attendre(page, collection, predicat, delai = 10_000) {
  await expect.poll(async () => (await listerDocuments(collection)).find(predicat) ?? null, { timeout: delai }).not.toBeNull();
  return (await listerDocuments(collection)).find(predicat);
}

async function fermerCelebration(page) {
  const c = page.locator('.celebration');
  await expect(c).toBeVisible();
  await c.click();
  await expect(c).toHaveCount(0);
}

// ---------------------------------------------------------------- connexion

test('C1 connexion avec Jérôme : arrivée sur l’Accueil, 6 objectifs, graphique limité aux mois depuis le début d’activité', async ({ page }) => {
  await connecter(page, JEROME);
  await expect(page).toHaveURL(/#\/crm\/accueil$/);
  await expect(page.getByRole('heading', { name: 'Bonjour Jérôme' })).toBeVisible();
  await expect(page.locator('.grille-objectifs .objectif')).toHaveCount(6);
  for (const libelle of ['Interviews JTBD réalisées', 'Nouveaux contacts', 'Rendez vous tenus', 'Propositions envoyées', "Chiffre d'affaires encaissé", 'Flyers distribués']) {
    await expect(page.locator('.objectif-libelle', { hasText: libelle })).toBeVisible();
  }
  await expect.poll(async () => (await listerDocuments('crm_parametres')).map((d) => d.id).sort()).toEqual(['etiquettes', 'filtres', 'listes', 'offres', 'reglages']);
  await expect.poll(async () => (await listerDocuments('os_objectifs')).length).toBe(6);
  // Graphique : aucun mois avant le début d'activité (octobre 2026), jamais plus de 6 mois
  const mois = await page.locator('.colonne-ca').evaluateAll((els) => els.map((e) => e.dataset.mois));
  expect(mois.length).toBeGreaterThanOrEqual(1);
  expect(mois.length).toBeLessThanOrEqual(6);
  expect(mois.every((m) => m >= '2026-10')).toBe(true);
});

test('C1 connexion avec Charles : mêmes données, nom et avatar de Charles', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Marie Durand' });
  await connecter(page, CHARLES);
  await expect(page.getByRole('heading', { name: 'Bonjour Charles' })).toBeVisible();
  await expect(page.locator('.menu-compte .avatar-charles')).toBeVisible();
  await allerA(page, 'Personnes');
  await expect(page.locator('.tableau-personnes')).toContainText('Marie Durand');
});

test('C2 un compte non autorisé : accès refusé, retour à la connexion, aucune donnée affichée', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Secret Défense' });
  await connecter(page, 'intrus@gmail.com', { attendreAccueil: false });
  await expect(page.locator('.message-refus')).toContainText('Accès refusé');
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Secret Défense');
});

// ---------------------------------------------------------------- création minimale

test('C3 créer une personne en ne tapant que le nom : curseur dans « Nom », Entrée enregistre, aucun champ obligatoire de plus', async ({ page }) => {
  await connecter(page);
  await ouvrirCreation(page, 'personne');
  const nom = dialogue(page).getByLabel('Nom', { exact: true });
  await expect(nom).toBeFocused();
  await expect(dialogue(page).locator('.obligatoire')).toHaveCount(0);
  await expect(dialogue(page)).not.toContainText('obligatoire');
  await expect(dialogue(page)).not.toContainText('*');
  // Champs proposés : Nom, Organisation, Téléphone, Email, Étiquettes
  for (const etiquette of ['Organisation', 'Téléphone', 'Email', 'Étiquettes']) {
    await expect(dialogue(page).locator('.etiquette', { hasText: etiquette })).toBeVisible();
  }
  await nom.fill('Marie Durand');
  await nom.press('Enter');
  await expect(dialogue(page)).toHaveCount(0);
  await expect(page.locator('.toast', { hasText: 'Personne ajoutée' })).toBeVisible();
  await expect(page.locator('.tableau-personnes')).toContainText('Marie Durand');
  const p = await attendre(page, 'crm_personnes', (d) => d.nom === 'Marie Durand');
  expect(p).toMatchObject({ prenom: 'Marie', nomFamille: 'Durand', roles: ['prospect'], proprietaire: JEROME, archive: false, organisationId: null });
});

test('C3 le nom vide est refusé avec un message, rien n’est créé', async ({ page }) => {
  await connecter(page);
  await ouvrirCreation(page, 'personne');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialogue(page).locator('[data-erreur]')).toHaveText('Le nom est obligatoire.');
  expect((await listerDocuments('crm_personnes')).length).toBe(0);
});

test('C4 champ intelligent : deux lettres proposent les organisations qui les contiennent, « Créer » crée à la volée', async ({ page }) => {
  await creerOrganisation('o1', { nom: 'Fleurs de Provence', ville: 'Manosque' });
  await creerOrganisation('o2', { nom: 'Atelier Barbier' });
  await creerOrganisation('o3', { nom: 'Boulangerie Dupain' });
  await creerOrganisation('o4', { nom: 'Garage Marchand' });
  await connecter(page);
  await ouvrirCreation(page, 'personne');
  const champOrg = dialogue(page).getByRole('combobox', { name: 'Organisation' });
  await champOrg.fill('r');
  await expect(suggestions(page)).toBeHidden(); // moins de 2 lettres
  await champOrg.fill('ar');
  const options = suggestions(page).locator('.suggestion:not(.suggestion-creer)');
  await expect(options).toHaveCount(2); // « Atelier Barbier » et « Garage Marchand » contiennent « ar »
  await expect(suggestions(page)).toContainText('Barbier');
  await expect(suggestions(page).locator('strong').first()).toHaveText(/ar/i);
  // Choisir une organisation existante au clic
  await suggestions(page).locator('.suggestion', { hasText: 'Atelier Barbier' }).click();
  await expect(champOrg).toHaveValue('Atelier Barbier');
  // Nom inconnu : « Créer « … » »
  await champOrg.fill('');
  await champOrg.fill('Nouvelle Coop');
  await suggestions(page).locator('.suggestion-creer').click();
  await expect(champOrg).toHaveValue('Nouvelle Coop');
  await expect(dialogue(page)).toBeVisible(); // la fenêtre reste ouverte
  await dialogue(page).getByLabel('Nom', { exact: true }).fill('Léa Martin');
  await enregistrer(page);
  const org = await attendre(page, 'crm_organisations', (d) => d.nom === 'Nouvelle Coop');
  const p = await attendre(page, 'crm_personnes', (d) => d.nom === 'Léa Martin');
  expect(p.organisationId).toBe(org.id);
  await expect(page.locator('.tableau-personnes tr', { hasText: 'Léa Martin' })).toContainText('Nouvelle Coop');
});

test('C4 le champ intelligent se pilote au clavier (flèches, Entrée, Échap)', async ({ page }) => {
  test.skip(estTelephone(page), 'clavier : ordinateur');
  await creerOrganisation('o1', { nom: 'Fleurs de Provence' });
  await creerOrganisation('o2', { nom: 'Fleuriste du Port' });
  await connecter(page);
  await ouvrirCreation(page, 'personne');
  const champOrg = dialogue(page).getByRole('combobox', { name: 'Organisation' });
  await champOrg.fill('fleur');
  await expect(suggestions(page).locator('.suggestion')).toHaveCount(3); // 2 + « Créer »
  await champOrg.press('ArrowDown'); // 1re ligne : « Fleuriste du Port » (classement alphabétique)
  await champOrg.press('ArrowDown'); // 2e ligne : « Fleurs de Provence »
  await champOrg.press('Enter');
  await expect(champOrg).toHaveValue('Fleurs de Provence');
  await champOrg.press('Backspace');
  await champOrg.fill('fleur');
  await champOrg.press('Escape');
  await expect(suggestions(page)).toBeHidden();
  await expect(dialogue(page)).toBeVisible(); // Échap ferme la liste, pas la fenêtre
});

test('C5 doublon : « Cette personne existe déjà » avec lien, « Créer quand même » fonctionne', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Marie Durand', emails: [{ valeur: 'marie@exemple.fr', type: 'travail' }] });
  await connecter(page);
  await ouvrirCreation(page, 'personne');
  await dialogue(page).getByLabel('Nom', { exact: true }).fill('marie  DURAND');
  await expect(dialogue(page).locator('.bandeau-doublon')).toContainText('Cette personne existe déjà');
  await expect(dialogue(page).locator('.bandeau-doublon a')).toHaveAttribute('href', '#/crm/personnes/p1');
  await expect(dialogue(page).getByRole('button', { name: 'Créer quand même' })).toBeVisible();
  await dialogue(page).getByRole('button', { name: 'Créer quand même' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  await expect.poll(async () => (await listerDocuments('crm_personnes')).length).toBe(2);
  // Doublon par email
  await page.locator('.page-actions [data-action="nouvelle-personne"]').click();
  await dialogue(page).getByLabel('Nom', { exact: true }).fill('Quelqu’un d’autre');
  await dialogue(page).getByRole('textbox', { name: 'Email 1' }).fill(' MARIE@exemple.fr ');
  await expect(dialogue(page).locator('.bandeau-doublon')).toBeVisible();
});
