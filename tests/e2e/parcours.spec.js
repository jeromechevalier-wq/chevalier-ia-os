// Tests C : parcours dans le navigateur (Playwright + émulateurs), formats 1440 × 900 et 390 × 844.
import { readFile } from 'node:fs/promises';
import { debrancherGoogle } from './google-simule.js';
import {
  test, expect, connecter, allerA, allerAuxReglagesCrm, choisirDansMenuUtilisateur, basculerThemeParMenu, creerPersonne, creerOrganisation, creerAffaire, creerActivite, lireDocument, listerDocuments, ecrireDocument,
  jour, estTelephone, valeurObjectif, JEROME, CHARLES, ouvrirDocuments, filtrerHistorique,
} from './outils.js';

// Les scénarios de ce fichier sont indépendants (chacun repart d'une base vide) : ils se répartissent sur plusieurs workers.
test.describe.configure({ mode: 'parallel' });

const dialogue = (page) => page.getByRole('dialog');
const suggestions = (page, nom = 'Organisation') => dialogue(page).locator(`ul.suggestions[aria-label="Suggestions : ${nom}"]`);

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

test('C1 connexion avec Jérôme : arrivée sur l’Accueil, 6 objectifs, graphique limité aux mois depuis le début d’activité', { tag: '@smoke' }, async ({ page }) => {
  await connecter(page, JEROME);
  await expect(page).toHaveURL(/#\/crm\/accueil$/);
  await expect(page.getByRole('heading', { name: 'Bonjour Jérôme' })).toBeVisible();
  await expect(page.locator('.grille-objectifs .objectif')).toHaveCount(5);
  for (const libelle of ['Nouveaux contacts', 'Rendez vous tenus', 'Propositions envoyées', "Chiffre d'affaires encaissé", 'Flyers distribués']) {
    await expect(page.locator('.objectif-libelle', { hasText: libelle })).toBeVisible();
  }
  await expect.poll(async () => (await listerDocuments('crm_parametres')).map((d) => d.id).sort()).toEqual(['etapes', 'etiquettes', 'filtres', 'listes', 'modeles_affaire', 'modeles_projet', 'offres', 'phases', 'reglages']);
  await expect.poll(async () => (await listerDocuments('os_kpi')).length).toBe(5);
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
  await expect(page.locator('.menu-compte .avatar-initiale')).toHaveText('C'); // PR B : l'initiale du compte, plus de photo
  await allerA(page, 'Personnes');
  await expect(page.locator('.tableau-personnes')).toContainText('Marie Durand');
});

test('C2 un compte non autorisé : accès refusé, retour à la connexion, aucune donnée affichée', { tag: '@sans-telephone' }, async ({ page }) => {
  await creerPersonne('p1', { nom: 'Secret Défense' });
  await connecter(page, 'intrus@gmail.com', { attendreAccueil: false });
  await expect(page.locator('.message-refus')).toContainText('Accès refusé');
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
  await expect(page.locator('body')).not.toContainText('Secret Défense');
});

// ---------------------------------------------------------------- création minimale

test('C3 créer une personne en ne tapant que le nom : curseur dans « Nom », Entrée enregistre, aucun champ obligatoire de plus', { tag: '@smoke' }, async ({ page }) => {
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
  expect(p).toMatchObject({ prenom: 'Marie', nomFamille: 'Durand', proprietaire: JEROME, archive: false, organisationId: null });
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

// ---------------------------------------------------------------- organisations, affaires, étapes

const LIBELLES_ETAPES = {
  premier_contact: 'Premier contact', rdv_fixe: 'Rendez vous fixé', proposition_envoyee: 'Proposition envoyée',
  gagne: 'Gagné',
};

async function aller(page, hash) {
  await page.evaluate((h) => { location.hash = h; }, hash);
}

/** Change l'étape d'une carte : glisser déposer sur ordinateur, menu « Déplacer vers… » sur téléphone. */
async function deplacer(page, id, etape) {
  const carte = page.locator(`.carte-affaire[data-affaire="${id}"]`);
  await expect(carte).toBeVisible();
  if (estTelephone(page)) {
    await carte.locator('.carte-menu').click();
    await page.locator('.menu-pop').getByRole('menuitem', { name: `Déplacer vers : ${LIBELLES_ETAPES[etape]}` }).click();
  } else {
    // Vrai glisser déposer à la souris. Chromium sans écran ignore parfois un second glisser lancé juste après un
    // premier (la souris n'a pas fini la session précédente) : dans ce cas seulement, on rejoue les mêmes événements
    // (dragstart, dragover, drop, dragend) avec un DataTransfer, ce qui exerce les mêmes gestionnaires de l'appli.
    const avant = (await lireDocument(`crm_affaires/${id}`)).etape;
    await page.mouse.move(700, 700);
    await carte.dragTo(page.locator(`.colonne[data-colonne="${etape}"]`));
    try {
      // Réussi si l'étape a changé, ou si une boîte de dialogue attend une réponse (une boîte attend une réponse).
      await expect.poll(async () => (await lireDocument(`crm_affaires/${id}`)).etape !== avant || (await page.locator('.voile-dialogue').count()) > 0, { timeout: 2500 }).toBe(true);
    } catch {
      await page.evaluate(([affaire, colonne]) => {
        const dt = new DataTransfer();
        const c = document.querySelector(`.carte-affaire[data-affaire="${affaire}"]`);
        const k = document.querySelector(`.colonne[data-colonne="${colonne}"]`);
        c.dispatchEvent(new DragEvent('dragstart', { bubbles: true, dataTransfer: dt }));
        k.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: dt }));
        k.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: dt }));
        c.dispatchEvent(new DragEvent('dragend', { bubbles: true, dataTransfer: dt }));
      }, [id, etape]);
    }
  }
}

// Action suggérée par une étape (réglage, aucune par défaut) : on accepte ou on refuse, jamais créée toute seule.
async function refuserSuggestion(page) {
  await expect(dialogue(page)).toContainText('Action suggérée');
  await dialogue(page).getByRole('button', { name: 'Refuser', exact: true }).last().click();
  await expect(dialogue(page)).toHaveCount(0);
}

async function champDoc(collection, id, cle, attendu) {
  await expect.poll(async () => (await lireDocument(`${collection}/${id}`))?.[cle], { timeout: 10_000 }).toEqual(attendu);
}

test('C6 organisation : la créer, la lier à une personne depuis sa fiche, la retrouver dans la fiche de l’organisation', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Marie Durand' });
  await connecter(page);
  await ouvrirCreation(page, 'organisation');
  await expect(dialogue(page).locator('.obligatoire')).toHaveCount(0);
  await dialogue(page).getByLabel('Nom', { exact: true }).fill('Fleurs de Provence');
  await dialogue(page).getByLabel('Adresse', { exact: true }).fill('3 rue des Lilas');
  await enregistrer(page);
  const org = await attendre(page, 'crm_organisations', (d) => d.nom === 'Fleurs de Provence');
  expect(org).toMatchObject({ adresse: '3 rue des Lilas', archive: false, proprietaire: JEROME });
  await aller(page, '#/crm/personnes/p1');
  await expect(page.locator('.fiche-tete .titre-editable')).toHaveValue('Marie Durand');
  await page.locator('[data-action="ajouter-organisation"]').click();
  const champ = page.locator('.fiche').getByRole('combobox', { name: 'Organisation' });
  await champ.fill('fleu');
  await page.locator('.fiche ul.suggestions[aria-label="Suggestions : Organisation"] .suggestion', { hasText: 'Fleurs de Provence' }).click();
  await champDoc('crm_personnes', 'p1', 'organisationId', org.id);
  await aller(page, `#/crm/organisations/${org.id}`);
  await expect(page.locator('.fiche-tete .titre-editable')).toHaveValue('Fleurs de Provence');
  await expect(page.locator('.ligne-simple[data-personne="p1"]')).toContainText('Marie Durand');
});

test('C7 « + Affaire » depuis la fiche d’une personne : titre prérempli, enregistrer sans rien taper', { tag: '@smoke' }, async ({ page }) => {
  await creerOrganisation('o1', { nom: 'Fleurs de Provence' });
  await creerPersonne('p1', { nom: 'Marie Durand', organisationId: 'o1' });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  await page.locator('.fiche-tete [data-action="nouvelle-affaire"]').click();
  await expect(dialogue(page)).toContainText('Ajouter une affaire');
  await expect(dialogue(page).getByLabel('Titre', { exact: true })).toHaveAttribute('placeholder', 'Fleurs de Provence');
  await enregistrer(page);
  const a = await attendre(page, 'crm_affaires', (d) => d.titre === 'Fleurs de Provence');
  expect(a).toMatchObject({ personneId: 'p1', organisationId: 'o1', etape: 'premier_contact', statut: 'ouverte', priorite: 'tiede', archive: false });
  expect('encaissements' in a, 'plus de champ encaissements (restes de la 2.2 supprimés)').toBe(false);
  await expect(page.locator('.section[data-section="personne-affaires"] .carte-affaire-mini')).toContainText('Fleurs de Provence');
  await allerA(page, 'Affaires');
  await expect(page.locator(`.colonne[data-colonne="premier_contact"] .carte-affaire[data-affaire="${a.id}"]`)).toBeVisible();
});

test('C8 glisser une carte de Premier contact à Rendez vous fixé puis revenir : datesEtapes et événements à jour', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Atelier IA' });
  await connecter(page);
  await allerA(page, 'Affaires');
  await deplacer(page, 'a1', 'rdv_fixe');
  await champDoc('crm_affaires', 'a1', 'etape', 'rdv_fixe');
  const a = await lireDocument('crm_affaires/a1');
  expect(a.statut).toBe('ouverte');
  expect(Object.keys(a.datesEtapes).sort()).toEqual(['premier_contact', 'rdv_fixe']);
  await expect(page.locator('.colonne[data-colonne="rdv_fixe"] .carte-affaire[data-affaire="a1"]')).toBeVisible();
  await deplacer(page, 'a1', 'premier_contact');
  await champDoc('crm_affaires', 'a1', 'etape', 'premier_contact');
  expect(Object.keys((await lireDocument('crm_affaires/a1')).datesEtapes)).toContain('rdv_fixe');
  const evenements = (await listerDocuments('crm_evenements')).filter((e) => e.type === 'etape_changee').map((e) => e.texte).sort();
  expect(evenements).toEqual(['Étape : Premier contact → Rendez vous fixé', 'Étape : Rendez vous fixé → Premier contact']);
});

test('C9 action suggérée par une étape (réglage) : fenêtre accepter / refuser ; refuser ne change rien, accepter crée l’activité', async ({ page }) => {
  // Aucune action par défaut : l'étape « Proposition envoyée » en reçoit une dans les Réglages (ici écrite directement).
  await ecrireDocument('crm_parametres/etapes', { items: [{}, {}, { action: { type: 'tache', titre: 'Relancer la proposition', delaiJours: 3 } }], roleGagnee: 'gagne' });
  await creerAffaire('a1', { titre: 'Première', etape: 'rdv_fixe' });
  await creerAffaire('a2', { titre: 'Seconde', etape: 'rdv_fixe' });
  await connecter(page);
  await allerA(page, 'Affaires');
  await deplacer(page, 'a1', 'proposition_envoyee');
  await expect(dialogue(page)).toContainText('Action suggérée');
  await expect(dialogue(page).getByLabel('Titre de l’activité')).toHaveValue('Relancer la proposition');
  await expect(dialogue(page).getByLabel('Date', { exact: true })).toHaveValue(jour(3));
  await refuserSuggestion(page);
  await champDoc('crm_affaires', 'a1', 'etape', 'proposition_envoyee');
  expect(await listerDocuments('crm_activites')).toHaveLength(0);
  await deplacer(page, 'a2', 'proposition_envoyee');
  await expect(dialogue(page)).toContainText('Action suggérée');
  await dialogue(page).getByRole('button', { name: 'Accepter' }).click();
  const act = await attendre(page, 'crm_activites', (d) => d.affaireId === 'a2');
  expect(act).toMatchObject({ titre: 'Relancer la proposition', type: 'tache', date: jour(3), fait: false });
});

test('C9b aucune action suggérée par défaut : passer à « Proposition envoyée » ou à « Gagné » n’ouvre aucune fenêtre', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Sans règle en dur', etape: 'rdv_fixe' });
  await connecter(page);
  await allerA(page, 'Affaires');
  await deplacer(page, 'a1', 'proposition_envoyee');
  await champDoc('crm_affaires', 'a1', 'etape', 'proposition_envoyee');
  await expect(page.locator('.voile-dialogue')).toHaveCount(0);
  expect(await listerDocuments('crm_activites')).toHaveLength(0);
});

test('C10 Gagné : célébration ; la vente s’arrête là (plus d’étape de facturation, rien n’est encaissé ni archivé)', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Marie Durand' });
  await creerAffaire('a1', { titre: 'Atelier IA', etape: 'proposition_envoyee', montant: 1200, personneId: 'p1', offreId: 'audit' });
  await connecter(page);
  await allerA(page, 'Affaires');
  await expect(page.locator('.colonne[data-colonne]:not([data-colonne="perdue"])')).toHaveCount(4);
  await expect(page.locator('.colonne[data-colonne="facture_envoyee"], .colonne[data-colonne="facture_payee"]')).toHaveCount(0);
  await deplacer(page, 'a1', 'gagne');
  await fermerCelebration(page);
  await expect(page.locator('.voile-dialogue')).toHaveCount(0); // plus de suggestion « Envoyer la facture » : la règle en dur a disparu
  await champDoc('crm_affaires', 'a1', 'statut', 'gagnee');
  const a = await lireDocument('crm_affaires/a1');
  expect(a).toMatchObject({ etape: 'gagne', archive: false });
  // rien n'est encaissé tant qu'aucune facture de projet n'est payée
  await allerA(page, 'Accueil');
  await expect.poll(() => valeurObjectif(page, 'ca_encaisse')).toBe(0);
});

test('C11 Perdue (raison obligatoire), Rouvrir ; plus de pause', async ({ page }) => {
  await creerAffaire('a1', { titre: 'À perdre', etape: 'rdv_fixe' });
  await connecter(page);
  await allerA(page, 'Affaires');
  await page.locator('.carte-affaire[data-affaire="a1"] .carte-menu').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Perdue…' }).click();
  await dialogue(page).getByRole('button', { name: 'Marquer comme perdue' }).click();
  await expect(dialogue(page)).toContainText('La raison est obligatoire.');
  await dialogue(page).getByLabel('Raison', { exact: true }).selectOption('Prix');
  await dialogue(page).getByRole('button', { name: 'Marquer comme perdue' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  await champDoc('crm_affaires', 'a1', 'statut', 'perdue');
  expect(await lireDocument('crm_affaires/a1')).toMatchObject({ etape: 'rdv_fixe', raisonPerdue: 'Prix' });
  // Plus de colonne « Perdues » : l'affaire perdue se retrouve dans la vue Liste, d'où on la rouvre.
  await expect(page.locator('.carte-affaire[data-affaire="a1"]')).toHaveCount(0);
  await page.locator('.bascule-vue[data-vue="liste"]').click();
  const ligne = page.locator('tr.ligne-liste[data-id="a1"]');
  await expect(ligne).toBeVisible();
  await ligne.getByRole('button', { name: /^Actions/ }).click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Rouvrir' }).click();
  await champDoc('crm_affaires', 'a1', 'statut', 'ouverte');
  expect((await lireDocument('crm_affaires/a1')).raisonPerdue).toBe('');
  // Plus de pause (22/10/2026) : le menu d'une carte du kanban ne propose plus « En pause… »
  await page.locator('.bascule-vue[data-vue="kanban"]').click();
  await page.locator('.carte-affaire[data-affaire="a1"] .carte-menu').click();
  await expect(page.locator('.menu-pop').getByRole('menuitem', { name: /pause/i })).toHaveCount(0);
});

// ---------------------------------------------------------------- activités, notes, historique, bloc « À faire »

test('C12 « Fait » sur la dernière activité d’une affaire : elle disparaît du bloc « À faire », entre dans l’historique, la fenêtre « Plus aucune activité prévue » s’ouvre', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Marie Durand' });
  await creerAffaire('af1', { titre: 'Atelier IA', personneId: 'p1' });
  await creerActivite('a1', { titre: 'Appeler Marie', type: 'appel', date: jour(0), personneId: 'p1', affaireId: 'af1' });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  const ligne = page.locator('.points-cles .activite[data-activite="a1"]');
  await expect(ligne).toContainText('Appeler Marie');
  await ligne.getByRole('button', { name: /Marquer comme fait/ }).click();
  await expect(dialogue(page)).toContainText('Plus aucune activité prévue');
  await expect(dialogue(page)).toContainText('plus aucune activité prévue sur cette affaire');
  await dialogue(page).getByRole('button', { name: 'Plus tard' }).click();
  await expect(ligne).toHaveCount(0);
  await champDoc('crm_activites', 'a1', 'fait', true);
  await expect(page.locator('.historique .fil-ligne[data-genre="activite"]')).toContainText('Appeler Marie');
  expect((await listerDocuments('crm_evenements')).some((e) => e.type === 'activite_faite')).toBe(true);
});

test('C12 « Fait » sur la dernière activité d’une affaire : la planifier crée une nouvelle activité', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Marie Durand' });
  await creerAffaire('af1', { titre: 'Atelier IA', personneId: 'p1' });
  await creerActivite('a1', { titre: 'Appeler Marie', type: 'appel', date: jour(0), personneId: 'p1', affaireId: 'af1' });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  await page.locator('.points-cles .activite[data-activite="a1"]').getByRole('button', { name: /Marquer comme fait/ }).click();
  await dialogue(page).locator('[data-date-rapide="1sem"]').click();
  await dialogue(page).getByRole('button', { name: 'Planifier' }).click();
  const suite = await attendre(page, 'crm_activites', (d) => d.id !== 'a1');
  expect(suite).toMatchObject({ titre: 'Relancer', date: jour(7), fait: false, personneId: 'p1', affaireId: 'af1' });
});

test('C12 changer la date d’une activité en la tapant : la fenêtre reste ouverte jusqu’à « Enregistrer »', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Marie Durand' });
  await creerActivite('a1', { titre: 'Appeler Marie', type: 'appel', date: jour(0), personneId: 'p1' });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  await page.locator('.points-cles .activite[data-activite="a1"] .activite-date-modifiable').click();
  await dialogue(page).getByLabel('Date', { exact: true }).fill(jour(5));
  await page.waitForTimeout(1500); // bien plus que l’ancienne attente de 700 ms
  await expect(dialogue(page)).toContainText('Changer la date');
  expect((await listerDocuments('crm_activites')).find((d) => d.id === 'a1').date).toBe(jour(0)); // rien n’est enregistré tant qu’on ne clique pas
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await champDoc('crm_activites', 'a1', 'date', jour(5));
});

test('C12 « Fait » alors qu’il reste une autre activité sur l’affaire, ou sur une simple personne : aucune fenêtre ne s’ouvre', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Marie Durand' });
  await creerAffaire('af1', { titre: 'Atelier IA', personneId: 'p1' });
  await creerActivite('a1', { titre: 'Appeler Marie', type: 'appel', date: jour(0), personneId: 'p1', affaireId: 'af1' });
  await creerActivite('a2', { titre: 'Envoyer le devis', date: jour(3), personneId: 'p1', affaireId: 'af1' });
  await creerActivite('a3', { titre: 'Café avec Marie', date: jour(0), personneId: 'p1' });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  for (const id of ['a1', 'a3']) {
    await page.locator(`.points-cles .activite[data-activite="${id}"]`).getByRole('button', { name: /Marquer comme fait/ }).click();
    await champDoc('crm_activites', id, 'fait', true);
    await expect(dialogue(page)).toHaveCount(0);
  }
});

test('C12 Accueil : le bloc « À faire » regroupe En retard, Aujourd’hui et Sans action prévue', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Marie Durand' });
  await creerAffaire('a1', { titre: 'Atelier IA', personneId: 'p1', etape: 'rdv_fixe' });
  await creerAffaire('a2', { titre: 'Sans suite', etape: 'rdv_fixe' });
  await creerActivite('x1', { titre: 'Envoyer le devis', date: jour(-3), affaireId: 'a1', personneId: 'p1' });
  await creerActivite('x2', { titre: 'Appeler le client', date: jour(0), affaireId: 'a1', personneId: 'p1' });
  await connecter(page);
  await expect(page.locator('.groupe-a-faire[data-groupe="retard"]')).toContainText('Envoyer le devis');
  await expect(page.locator('.groupe-a-faire[data-groupe="aujourdhui"]')).toContainText('Appeler le client');
  await expect(page.locator('.groupe-a-faire[data-groupe="sans-action"]')).toContainText('Sans suite');
  await expect(page.locator('.groupe-a-faire[data-groupe="sans-action"]')).not.toContainText('Atelier IA');
  // « Planifier » sur une affaire sans action
  await page.locator('.groupe-a-faire[data-groupe="sans-action"] [data-action="planifier"]').click();
  await dialogue(page).locator('[data-date-rapide="1sem"]').click();
  await dialogue(page).getByRole('button', { name: 'Planifier' }).click();
  await attendre(page, 'crm_activites', (d) => d.affaireId === 'a2');
  await expect(page.locator('.groupe-a-faire[data-groupe="sans-action"]')).not.toContainText('Sans suite');
  // Tout faire : Charles félicite
  await page.locator('.activite[data-activite="x1"]').getByRole('button', { name: /Marquer comme fait/ }).click(); // x2 reste sur l’affaire : pas de fenêtre
  await champDoc('crm_activites', 'x1', 'fait', true);
  await page.locator('.activite[data-activite="x2"]').getByRole('button', { name: /Marquer comme fait/ }).click(); // dernière : la fenêtre s’ouvre
  await dialogue(page).getByRole('button', { name: 'Plus tard' }).click();
  await expect(page.locator('.zone-a-faire .etat-vide')).toContainText('Charles veille');
});

test('C12 Accueil : chaque tâche montre son rattachement (affaire, personne ou organisation) avec un lien vers la fiche', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Marie Durand' });
  await creerOrganisation('o1', { nom: 'Atelier Soleil' });
  await creerAffaire('a1', { titre: 'Atelier IA', personneId: 'p1', etape: 'rdv_fixe' });
  await creerActivite('x1', { titre: 'Envoyer le devis', date: jour(-1), affaireId: 'a1', personneId: 'p1' });
  await creerActivite('x2', { titre: 'Appeler Marie', date: jour(-1), personneId: 'p1' });
  await creerActivite('x3', { titre: 'Écrire à l’atelier', date: jour(0), organisationId: 'o1' });
  await creerActivite('x4', { titre: 'Penser à autre chose', date: jour(0) });
  await connecter(page);
  const ligne = (id) => page.locator(`.activite[data-activite="${id}"]`);
  await expect(ligne('x1').getByRole('link', { name: 'Atelier IA' })).toBeVisible();
  await expect(ligne('x1').getByRole('link', { name: 'Marie Durand' })).toHaveCount(0);
  await expect(ligne('x2').getByRole('link', { name: 'Marie Durand' })).toBeVisible();
  await expect(ligne('x3').getByRole('link', { name: 'Atelier Soleil' })).toBeVisible();
  await expect(ligne('x4').getByRole('link')).toHaveCount(0);
  await ligne('x2').getByRole('link', { name: 'Marie Durand' }).click();
  await expect(page).toHaveURL(/#\/crm\/personnes\/p1/);
});

test('C12 un rendez vous marqué fait augmente l’objectif « Rendez vous tenus »', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Marie Durand' });
  await creerActivite('r1', { titre: 'Café avec Marie', type: 'rendez_vous', date: jour(0), personneId: 'p1' });
  await connecter(page);
  expect(await valeurObjectif(page, 'rdv_tenus')).toBe(0);
  await aller(page, '#/crm/personnes/p1');
  await page.locator('.points-cles .activite[data-activite="r1"]').getByRole('button', { name: /Marquer comme fait/ }).click();
  await allerA(page, 'Accueil');
  await expect.poll(() => valeurObjectif(page, 'rdv_tenus')).toBe(1);
});

test('C12 activité créée depuis une fiche : type, titre prérempli, boutons de date rapide', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Marie Durand' });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  const panneau = page.locator('.panneau-activite');
  await panneau.getByRole('button', { name: 'Appel', exact: true }).click();
  await panneau.locator('[data-date-rapide="3j"]').click();
  await panneau.getByLabel('Titre de l’activité').fill('Appel'); // nuit 4 : un titre est obligatoire (le bouton est grisé sans texte)
  await panneau.getByRole('button', { name: 'Enregistrer l’activité' }).click();
  const a = await attendre(page, 'crm_activites', (d) => d.personneId === 'p1');
  expect(a).toMatchObject({ type: 'appel', titre: 'Appel', date: jour(3), fait: false });
  await expect(page.locator('.points-cles')).toContainText('Appel');
});

test('C13 notes : ajouter, modifier, supprimer ; une note d’affaire apparaît aussi dans l’historique de la personne et de l’organisation', async ({ page }) => {
  await creerOrganisation('o1', { nom: 'Fleurs de Provence' });
  await creerPersonne('p1', { nom: 'Marie Durand', organisationId: 'o1' });
  await creerAffaire('a1', { titre: 'Atelier IA', personneId: 'p1', organisationId: 'o1' });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  const panneau = page.locator('.panneau-activite');
  await panneau.getByRole('tab', { name: 'Notes' }).click();
  await panneau.getByLabel('Nouvelle note').fill('Rappeler jeudi\navec le devis');
  await panneau.locator('[data-action="ajouter-note"]').click();
  const note = await attendre(page, 'crm_notes', (d) => d.affaireId === 'a1');
  expect(note).toMatchObject({ texte: 'Rappeler jeudi\navec le devis', personneId: 'p1', organisationId: 'o1', auteur: JEROME });
  await expect(panneau.locator('.fil-note')).toContainText('Rappeler jeudi');
  // Modifier
  await panneau.locator('[data-action="modifier-note"]').click();
  await panneau.getByLabel('Modifier la note').fill('Rappeler vendredi');
  await panneau.locator('.fil-note').getByRole('button', { name: 'Enregistrer' }).click();
  await champDoc('crm_notes', note.id, 'texte', 'Rappeler vendredi');
  // Visible aussi côté personne et organisation
  await aller(page, '#/crm/personnes/p1');
  await expect(page.locator('.historique .fil-note')).toContainText('Rappeler vendredi');
  await aller(page, '#/crm/organisations/o1');
  await expect(page.locator('.historique .fil-note')).toContainText('Rappeler vendredi');
  // Supprimer
  await page.locator('[data-action="supprimer-note"]').click();
  await dialogue(page).getByRole('button', { name: 'Supprimer' }).click();
  await expect.poll(async () => (await listerDocuments('crm_notes')).length).toBe(0);
  await expect(page.locator('.historique .fil-note')).toHaveCount(0);
});

test('C14 historique : les cinq filtres', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Marie Durand' });
  await creerActivite('f1', { titre: 'Appel fait', type: 'appel', date: jour(-1), fait: true, dateFait: new Date(), personneId: 'p1' });
  await ecrireDocument('crm_notes/n1', { texte: 'Une note', personneId: 'p1', organisationId: null, affaireId: null, auteur: JEROME, creeLe: new Date(), modifieLe: new Date() });
  await ecrireDocument('crm_evenements/e1', { type: 'affaire_creee', texte: 'Affaire créée : Atelier', personneId: 'p1', organisationId: null, affaireId: null, auteur: JEROME, date: new Date() });
  await ecrireDocument('crm_evenements/e2', { type: 'email_envoye', texte: 'Email envoyé à Marie', personneId: 'p1', organisationId: null, affaireId: null, auteur: JEROME, date: new Date() });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  const lignes = page.locator('.historique .fil-ligne');
  await expect(lignes).toHaveCount(4);
  const filtre = async (id) => filtrerHistorique(page, id);
  await filtre('activites');
  await expect(lignes).toHaveCount(1);
  await filtre('notes');
  await expect(lignes).toHaveCount(1);
  await expect(lignes).toContainText('Une note');
  await filtre('affaires');
  await expect(lignes).toHaveCount(1);
  await expect(lignes).toContainText('Affaire créée');
  await filtre('evenements');
  await expect(lignes).toHaveCount(1); // N3 : l'affaire créée est dans « Affaires », plus dans « Événements »
  await expect(lignes).toContainText('Email envoyé');
  await filtre('tous');
  await expect(lignes).toHaveCount(4);
});

test('C15 objectif flyers : « +10 » met à jour la barre et persiste après rechargement', async ({ page }) => {
  await connecter(page);
  const carte = page.locator('.objectif[data-objectif="flyers"]');
  await carte.getByRole('button', { name: 'Ajouter 10 à Flyers distribués' }).click();
  await expect.poll(() => valeurObjectif(page, 'flyers')).toBe(10);
  await expect(carte.locator('.objectif-pct')).toHaveText('10 %');
  await expect.poll(async () => (await listerDocuments('os_kpi_saisies'))[0]?.valeur).toBe(10);
  await page.reload();
  await expect(page.locator('.objectif[data-objectif="flyers"] .objectif-pct')).toHaveText('10 %');
  const saisies = await listerDocuments('os_kpi_saisies');
  expect(saisies).toHaveLength(1);
  expect(saisies[0].id).toMatch(/^flyers_\d{4}-\d{2}$/);
});

test('C15 les objectifs calculés suivent les nouveaux contacts et les propositions', { tag: '@sans-telephone' }, async ({ page }) => {
  await creerPersonne('p1', { nom: 'Marie Durand' });
  await creerPersonne('p2', { nom: 'Paul Martin' });
  await creerAffaire('a1', { titre: 'Proposée', etape: 'proposition_envoyee', datesEtapes: { proposition_envoyee: new Date() } });
  await connecter(page);
  await expect.poll(() => valeurObjectif(page, 'nouveaux_contacts')).toBe(2);
  await expect.poll(() => valeurObjectif(page, 'propositions_envoyees')).toBe(1);
});

// ---------------------------------------------------------------- recherche, filtres, réglages, export

test('C16 recherche globale : résultats groupés, Entrée ouvre le premier ; raccourcis « / », « n » et Échap sur ordinateur', async ({ page }) => {
  await creerOrganisation('o1', { nom: 'Fleurs de Provence' });
  await creerPersonne('p1', { nom: 'Marie Durand', organisationId: 'o1', emails: [{ valeur: 'marie@fleurs.fr', type: 'travail' }] });
  await creerPersonne('p2', { nom: 'Paul Martin' });
  await creerAffaire('a1', { titre: 'Atelier pour Marie', personneId: 'p1' });
  await connecter(page);
  if (estTelephone(page)) await page.getByRole('button', { name: 'Rechercher' }).click();
  const champ = page.locator('[data-role="recherche-globale"]');
  await champ.fill('mar');
  const liste = page.locator('ul.suggestions[aria-label="Suggestions : Rechercher"]');
  await expect(liste.locator('.suggestion-groupe')).toHaveText(['Personnes', 'Affaires']);
  await expect(liste).toContainText('Marie Durand');
  await expect(liste).toContainText('Paul Martin');
  await expect(liste).toContainText('Atelier pour Marie');
  await champ.fill('provence');
  await expect(liste.locator('.suggestion-groupe').first()).toContainText(/Personnes|Organisations/);
  await champ.fill('marie dur');
  await champ.press('Enter'); // sans flèche : ouvre le premier résultat
  await expect(page).toHaveURL(/#\/crm\/personnes\/p1$/);
  await expect(page.locator('.fiche-tete .titre-editable')).toHaveValue('Marie Durand');
  await expect(champ).toHaveValue('');
  // Choix par clic sur une affaire
  if (estTelephone(page)) await page.getByRole('button', { name: 'Rechercher' }).click();
  await champ.fill('atelier');
  await liste.locator('.suggestion', { hasText: 'Atelier pour Marie' }).click();
  await expect(page).toHaveURL(/#\/crm\/affaires\/a1$/);
});

test('C16 raccourcis clavier : « / » cherche, « n » ouvre « Ajouter une personne », Échap ferme', async ({ page }) => {
  test.skip(estTelephone(page), 'raccourcis clavier : ordinateur');
  await connecter(page);
  await page.keyboard.press('/');
  await expect(page.locator('[data-role="recherche-globale"]')).toBeFocused();
  await page.keyboard.press('Tab');
  await page.locator('body').click({ position: { x: 700, y: 500 } });
  await page.keyboard.press('n');
  await expect(dialogue(page)).toContainText('Ajouter une personne');
  await expect(dialogue(page).getByLabel('Nom', { exact: true })).toBeFocused();
  await page.keyboard.type('nnn'); // « n » dans un champ de texte ne rouvre rien
  await expect(dialogue(page).getByLabel('Nom', { exact: true })).toHaveValue('nnn');
  await page.keyboard.press('Escape');
  await expect(dialogue(page)).toHaveCount(0);
});

test('C16 le bouton « + » propose Personne, Organisation, Affaire et Projet', async ({ page }) => {
  await connecter(page);
  const plus = page.locator(estTelephone(page) ? '.bouton-plus-mobile' : '.bouton-plus:not(.bouton-plus-mobile)');
  await plus.click();
  await expect(page.locator('.menu-pop').getByRole('menuitem')).toHaveText(['Personne', 'Organisation', 'Affaire', 'Projet', 'Devis']);
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Organisation' }).click();
  await expect(dialogue(page)).toContainText('Ajouter une organisation');
  await page.keyboard.press('Escape');
  await plus.click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Affaire' }).click();
  await expect(dialogue(page)).toContainText('Ajouter une affaire');
});

test('C17 filtres : combiner deux filtres, enregistrer, appliquer, renommer et supprimer un filtre enregistré', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Marie Durand', ville: 'Manosque', source: 'Flyer' });
  await creerPersonne('p2', { nom: 'Paul Martin', ville: 'Digne', source: 'Flyer' });
  await creerPersonne('p3', { nom: 'Éric Léon', ville: 'Manosque', source: 'LinkedIn' });
  await connecter(page);
  await allerA(page, 'Personnes');
  await expect(page.locator('.tableau-personnes tbody tr')).toHaveCount(3);
  await page.locator('[data-action="filtres"]').click();
  await dialogue(page).locator('input[data-cle="villes"][data-valeur="manosque"]').check();
  await dialogue(page).locator('input[data-cle="sources"][data-valeur="Flyer"]').check();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('.tableau-personnes tbody tr')).toHaveCount(1);
  await expect(page.locator('.tableau-personnes')).toContainText('Marie Durand');
  await expect(page.locator('.pastille-filtre')).toHaveCount(2);
  // Enregistrer
  await page.locator('[data-action="filtres-enregistres"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Enregistrer ce filtre…' }).click();
  await dialogue(page).getByLabel('Nom du filtre').fill('Prospects de Manosque');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect.poll(async () => ((await lireDocument('crm_parametres/filtres'))?.items ?? []).some((f) => f.nom === 'Prospects de Manosque' && f.liste === 'personnes')).toBe(true);
  // Effacer puis réappliquer le filtre enregistré
  await page.getByRole('button', { name: 'Tout effacer' }).click();
  await expect(page.locator('.tableau-personnes tbody tr')).toHaveCount(3);
  await page.locator('[data-action="filtres-enregistres"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Prospects de Manosque' }).click();
  await expect(page.locator('.tableau-personnes tbody tr')).toHaveCount(1);
  // Réglages : renommer puis supprimer
  await allerAuxReglagesCrm(page);
  const ligne = page.locator('.ligne-reglage', { hasText: 'Prospects de Manosque' });
  await ligne.locator('[data-action="renommer-filtre"]').click();
  await dialogue(page).getByLabel('Nom du filtre').fill('Prospects Manosque');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(page.locator('.ligne-reglage', { hasText: 'Prospects Manosque' })).toBeVisible();
  await page.locator('.ligne-reglage', { hasText: 'Prospects Manosque' }).locator('[data-action="supprimer-filtre"]').click();
  await dialogue(page).getByRole('button', { name: 'Supprimer' }).click();
  await expect(page.locator('.ligne-reglage', { hasText: 'Prospects Manosque' })).toHaveCount(0);
});

test('C17 filtres d’affaires : Chaudes, en retard ; recherche d’une liste insensible aux accents', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Éric Léon' });
  await creerAffaire('a1', { titre: 'Chaude', priorite: 'chaud', personneId: 'p1' });
  await creerAffaire('a2', { titre: 'Tiède' });
  await creerActivite('x1', { titre: 'Relance', date: jour(-2), affaireId: 'a2' });
  await connecter(page);
  await allerA(page, 'Affaires');
  await page.locator('.bascule-vue[data-vue="liste"]').click();
  await expect(page.locator('.tableau-affaires tbody tr')).toHaveCount(2);
  await page.locator('[data-action="filtres-enregistres"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Chaudes' }).click();
  await expect(page.locator('.tableau-affaires tbody tr')).toHaveCount(1);
  await expect(page.locator('.tableau-affaires')).toContainText('Chaude');
  await page.getByRole('button', { name: /Retirer le filtre : Priorité/ }).click();
  await expect(page.locator('.tableau-affaires tbody tr')).toHaveCount(2);
  await page.getByRole('searchbox', { name: 'Rechercher une affaire' }).fill('eric');
  await expect(page.locator('.tableau-affaires tbody tr')).toHaveCount(1);
  await page.getByRole('searchbox', { name: 'Rechercher une affaire' }).fill('');
  await page.locator('[data-action="filtres"]').click();
  await dialogue(page).locator('input[data-cle="enRetard"]').check();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('.tableau-affaires tbody tr')).toHaveCount(1);
  await expect(page.locator('.tableau-affaires')).toContainText('Tiède');
});

test('C18 réglages : étiquette, offre, source ; changer le début d’activité change le graphique', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Payée en octobre', etape: 'gagne', statut: 'gagnee', archive: true, encaissements: [{ date: new Date(), montant: 500, offreId: null }] });
  await connecter(page);
  await allerAuxReglagesCrm(page);
  await page.getByPlaceholder('Nouvelle étiquette').fill('Très motivée');
  await page.getByPlaceholder('Nouvelle étiquette').press('Enter');
  await expect(page.locator('.ligne-reglage[data-etiquette] input[type="text"]').last()).toHaveValue('Très motivée');
  await page.getByPlaceholder('Nom de la nouvelle offre').fill('Atelier IA');
  await page.getByRole('button', { name: 'Ajouter une offre' }).click();
  await expect.poll(async () => ((await lireDocument('crm_parametres/offres'))?.items ?? []).map((o) => o.nom)).toContain('Atelier IA');
  await page.getByPlaceholder('Nouvelle source').fill('Salon du livre');
  await page.getByPlaceholder('Nouvelle source').press('Enter');
  await expect.poll(async () => (await lireDocument('crm_parametres/listes'))?.sources ?? []).toContain('Salon du livre');
  await expect.poll(async () => ((await lireDocument('crm_parametres/etiquettes'))?.items ?? []).map((e) => e.nom)).toContain('Très motivée');
  // Début d'activité
  await page.getByLabel('Mois de début d’activité').fill('2026-12');
  await page.getByLabel('Mois de début d’activité').press('Enter');
  await page.getByLabel('Mois de début d’activité').blur();
  await expect.poll(async () => (await lireDocument('crm_parametres/reglages'))?.debutActivite).toBe('2026-12');
  await allerA(page, 'Accueil');
  const mois = await page.locator('.colonne-ca').evaluateAll((els) => els.map((e) => e.dataset.mois));
  expect(mois.every((m) => m >= '2026-12')).toBe(true);
});

test('C19 export : JSON complet de toutes les collections, contacts .vcf ; le rappel d’export disparaît', async ({ page }) => {
  await creerOrganisation('o1', { nom: 'Fleurs; "de" Provence' });
  await creerPersonne('p1', { nom: 'Marie Durand', organisationId: 'o1' });
  await creerPersonne('p2', { nom: 'Paul Martin' });
  await creerAffaire('a1', { titre: 'Atelier', personneId: 'p1', organisationId: 'o1' });
  await ecrireDocument('crm_notes/n1', { texte: 'Une note', personneId: 'p1', organisationId: 'o1', affaireId: 'a1', auteur: JEROME, creeLe: new Date(), modifieLe: new Date() });
  await connecter(page);
  await expect(page.locator('.rappel-export')).toBeVisible();
  const [telechargement] = await Promise.all([page.waitForEvent('download'), page.locator('.rappel-export [data-action="exporter-tout"]').click()]);
  expect(telechargement.suggestedFilename()).toMatch(/^chevalier-ia-os-\d{4}-\d{2}-\d{2}\.json$/);
  const json = JSON.parse(await readFile(await telechargement.path(), 'utf8'));
  expect(json.version).toBe('2.0.0');
  expect(Object.keys(json.collections).sort()).toEqual(['crm_activites', 'crm_affaires', 'crm_evenements', 'crm_notes', 'crm_organisations', 'crm_parametres', 'crm_personnes', 'devis_articles', 'devis_devis', 'devis_parametres', 'devis_vocabulaire', 'projets_modeles', 'projets_projets', 'projets_taches', 'veille_contenus', 'veille_pages', 'veille_resumes', 'veille_sources']);
  expect(json.collections.crm_personnes.map((p) => p.id).sort()).toEqual(['p1', 'p2']);
  expect(json.collections.crm_notes).toHaveLength(1);
  expect(json.collections.crm_affaires[0].id).toBe('a1');
  await expect(page.locator('.rappel-export')).toHaveCount(0);
  await expect.poll(async () => (await lireDocument('crm_parametres/reglages'))?.dernierExport ?? null).not.toBeNull();
  // Contacts pour le téléphone (.vcf) : tout au premier export, puis plus rien tant que rien ne change
  await allerA(page, 'Personnes');
  const [vcf] = await Promise.all([page.waitForEvent('download'), page.locator('[data-action="exporter-personnes"]').click()]);
  expect(vcf.suggestedFilename()).toMatch(/^chevalier-ia-contacts-\d{4}-\d{2}-\d{2}\.vcf$/);
  const texte = await readFile(await vcf.path(), 'utf8');
  expect((texte.match(/BEGIN:VCARD/g) || [])).toHaveLength(2);
  expect(texte).toContain('ORG:Fleurs\\; "de" Provence');
});

test('C19 le rappel d’export réapparaît quand le dernier export date de plus de 30 jours', async ({ page }) => {
  await ecrireDocument('crm_parametres/reglages', { delaiPaiementJours: 30, debutActivite: '2026-10', dernierExport: new Date(Date.now() - 40 * 86400000) });
  await connecter(page);
  await expect(page.locator('.rappel-export')).toBeVisible();
  await ecrireDocument('crm_parametres/reglages', { delaiPaiementJours: 30, debutActivite: '2026-10', dernierExport: new Date(Date.now() - 5 * 86400000) });
  await expect(page.locator('.rappel-export')).toHaveCount(0);
});

// ---------------------------------------------------------------- opposition, suppression, intégrité

test('C20 opposition à la prospection : boutons email désactivés, badge affiché', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Marie Durand', emails: [{ valeur: 'marie@exemple.fr', type: 'travail' }] });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  await expect(page.locator('a[data-action="ecrire-email"]')).toHaveAttribute('href', 'mailto:marie@exemple.fr');
  await expect(page.locator('[data-action="email-envoye"]')).toBeEnabled();
  await page.locator('input[data-role="opposition"]').check();
  await champDoc('crm_personnes', 'p1', 'oppositionProspection', true);
  await expect(page.locator('button[data-action="ecrire-email"]')).toBeDisabled();
  await expect(page.locator('[data-action="email-envoye"]')).toBeDisabled();
  await expect(page.locator('.fiche-tete .badge-opposition')).toBeVisible();
  await allerA(page, 'Personnes');
  await expect(page.locator('.tableau-personnes .badge-opposition')).toBeVisible();
});

test('C20 « Email envoyé » ajoute un événement à l’historique', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Marie Durand', emails: [{ valeur: 'marie@exemple.fr', type: 'travail' }] });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  await page.locator('[data-action="email-envoye"]').click();
  await attendre(page, 'crm_evenements', (d) => d.type === 'email_envoye' && d.personneId === 'p1');
  await expect(page.locator('.historique')).toContainText('Email envoyé à Marie Durand');
});

test('C20 supprimer définitivement une personne : nom exigé, sort de ses affaires choisi', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Éric Léon' });
  await creerAffaire('a1', { titre: 'À conserver', personneId: 'p1', organisationId: 'o9' });
  await creerActivite('x1', { titre: 'Activité liée à la personne seule', personneId: 'p1' });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  await page.locator('[data-action="menu-fiche"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: /Supprimer définitivement/ }).click();
  await expect(dialogue(page)).toContainText('Ses 1 affaire');
  await dialogue(page).getByRole('button', { name: 'Supprimer' }).click(); // nom non tapé : refusé
  await expect(dialogue(page)).toBeVisible();
  await dialogue(page).getByLabel(/Tape « Éric Léon »/).fill('eric  LEON');
  await dialogue(page).getByRole('button', { name: 'Supprimer' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  await expect.poll(async () => await lireDocument('crm_personnes/p1')).toBeNull();
  const a = await lireDocument('crm_affaires/a1');
  expect(a.personneId).toBeNull(); // « Conserver » : l'affaire reste, rattachée à son organisation seule
  expect(a.organisationId).toBe('o9');
  await expect.poll(async () => (await listerDocuments('crm_activites')).length).toBe(0);
  await expect(page).toHaveURL(/#\/crm\/personnes$/);
});

test('C20 supprimer une personne avec « supprimer aussi ses affaires »', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Éric Léon' });
  await creerAffaire('a1', { titre: 'À supprimer', personneId: 'p1' });
  await creerActivite('x1', { titre: 'Activité de l’affaire', affaireId: 'a1', personneId: 'p1' });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  await page.locator('[data-action="menu-fiche"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: /Supprimer définitivement/ }).click();
  await dialogue(page).getByLabel('Les supprimer aussi, avec leurs activités et notes').check();
  await dialogue(page).getByLabel(/Tape « Éric Léon »/).fill('Éric Léon');
  await dialogue(page).getByRole('button', { name: 'Supprimer' }).click();
  await expect.poll(async () => (await listerDocuments('crm_affaires')).length).toBe(0);
  await expect.poll(async () => (await listerDocuments('crm_activites')).length).toBe(0);
  await expect.poll(async () => (await listerDocuments('crm_personnes')).length).toBe(0);
});

test('C20 supprimer une organisation qui a des personnes est refusé (archivage proposé) ; une organisation vide se supprime', async ({ page }) => {
  await creerOrganisation('o1', { nom: 'Fleurs de Provence' });
  await creerOrganisation('o2', { nom: 'Vide SARL' });
  await creerPersonne('p1', { nom: 'Marie Durand', organisationId: 'o1' });
  await connecter(page);
  await aller(page, '#/crm/organisations/o1');
  await page.locator('[data-action="menu-fiche"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: /Supprimer définitivement/ }).click();
  await expect(dialogue(page)).toContainText('Suppression impossible');
  await expect(dialogue(page)).toContainText('1 personne');
  await dialogue(page).getByRole('button', { name: 'Archiver' }).click();
  await champDoc('crm_organisations', 'o1', 'archive', true);
  expect(await lireDocument('crm_organisations/o1')).not.toBeNull();
  await aller(page, '#/crm/organisations/o2');
  await page.locator('[data-action="menu-fiche"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: /Supprimer définitivement/ }).click();
  await dialogue(page).getByLabel(/Tape « Vide SARL »/).fill('vide sarl');
  await dialogue(page).getByRole('button', { name: 'Supprimer' }).click();
  await expect.poll(async () => await lireDocument('crm_organisations/o2')).toBeNull();
  await expect(page).toHaveURL(/#\/crm\/organisations$/);
});

test('C20 supprimer définitivement une affaire : titre exigé ; annuler conserve l’affaire', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Atelier IA' });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  await page.locator('[data-action="menu-fiche"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: /Supprimer définitivement/ }).click();
  await dialogue(page).getByRole('button', { name: 'Annuler' }).click();
  expect(await lireDocument('crm_affaires/a1')).not.toBeNull();
  await page.locator('[data-action="menu-fiche"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: /Supprimer définitivement/ }).click();
  await dialogue(page).getByLabel(/Tape « Atelier IA »/).fill('atelier ia');
  await dialogue(page).getByRole('button', { name: 'Supprimer' }).click();
  await expect.poll(async () => await lireDocument('crm_affaires/a1')).toBeNull();
});

// ---------------------------------------------------------------- fiches : champs à compléter

test('C21 fiche personne : « + Ajouter » à la demande, enregistrement en quittant le champ, détails et rôles', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Marie Durand' });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  const details = page.locator('.section[data-section="personne-details"]');
  await expect(details.locator('.prop', { hasText: 'Ville' }).locator('.prop-vide')).toBeVisible();
  await details.locator('.prop', { hasText: 'Ville' }).locator('.prop-vide').click();
  await details.getByLabel('Ville', { exact: true }).fill('Manosque');
  await details.getByLabel('Ville', { exact: true }).press('Enter');
  await champDoc('crm_personnes', 'p1', 'ville', 'Manosque');
  await expect(details.locator('.prop', { hasText: 'Ville' })).toContainText('Manosque');
  // Prénom et nom de famille séparés
  await expect(details.locator('.prop', { hasText: 'Prénom' })).toContainText('Marie');
  await expect(details.locator('.prop', { hasText: 'Nom de famille' })).toContainText('Durand');
  await details.locator('.prop', { hasText: 'Prénom' }).locator('.prop-modifier').click();
  await details.getByLabel('Prénom', { exact: true }).fill('Marie-Claire');
  await details.getByLabel('Prénom', { exact: true }).press('Enter');
  await champDoc('crm_personnes', 'p1', 'nom', 'Marie-Claire Durand');
  await expect(page.locator('.fiche-tete .titre-editable')).toHaveValue('Marie-Claire Durand');
  // Titre modifiable en place
  const titre = page.locator('.fiche-tete .titre-editable');
  await titre.fill('Marie Dupont');
  await titre.press('Enter');
  await champDoc('crm_personnes', 'p1', 'nom', 'Marie Dupont');
  expect(await lireDocument('crm_personnes/p1')).toMatchObject({ prenom: 'Marie', nomFamille: 'Dupont' });
});

test('C21 fiche personne : emails et téléphones avec leur type, étiquettes créées à la volée', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Marie Durand' });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  await page.locator('[data-contacts="email"] [data-action="ajouter-contact"]').click();
  await page.getByRole('textbox', { name: 'Nouveau : email' }).fill('Marie@Exemple.fr');
  await page.getByLabel('Type de email').selectOption('perso');
  await page.keyboard.press('Enter');
  await page.locator('[data-contacts="tel"] [data-action="ajouter-contact"]').click();
  await page.getByRole('textbox', { name: 'Nouveau : téléphone' }).fill('06 12 34 56 78');
  await page.keyboard.press('Enter');
  await champDoc('crm_personnes', 'p1', 'emailsNormalises', ['marie@exemple.fr']);
  await expect.poll(async () => (await lireDocument('crm_personnes/p1')).telephones?.length).toBe(1);
  const p = await lireDocument('crm_personnes/p1');
  expect(p.emails).toEqual([{ valeur: 'Marie@Exemple.fr', type: 'perso' }]);
  expect(p.telephones).toEqual([{ valeur: '06 12 34 56 78', type: 'travail' }]);
  await expect(page.locator('.resume')).toContainText('Marie@Exemple.fr');
  await expect(page.locator('.resume')).toContainText('(Perso)');
  // Étiquette créée à la volée depuis la fiche
  await page.locator('.resume').getByRole('button', { name: 'Étiquettes', exact: true }).click();
  await dialogue(page).getByLabel('Nom de la nouvelle étiquette').fill('Très motivée');
  await dialogue(page).getByRole('button', { name: 'Créer', exact: true }).click();
  await dialogue(page).locator('.dialogue-pied').getByRole('button', { name: 'Fermer', exact: true }).click();
  await expect.poll(async () => ((await lireDocument('crm_parametres/etiquettes'))?.items ?? []).map((e) => e.nom)).toContain('Très motivée');
  await expect.poll(async () => (await lireDocument('crm_personnes/p1'))?.etiquettes?.length).toBe(1);
  await expect(page.locator('.resume .pastille-choix')).toContainText('Très motivée');
});

test('C21 fiche affaire : barre des étapes, Gagné par la liste Étape, montant modifiable, documents ; plus d’encaissement manuel', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Marie Durand' });
  await creerAffaire('a1', { titre: 'Atelier IA', personneId: 'p1', etape: 'proposition_envoyee', montant: 900 });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  await expect(page.locator('.barre-etapes-fiche .etape.courante')).toHaveText('Proposition envoyée');
  await expect(page.locator('.fiche-montant')).toContainText('900');
  await page.locator('.fiche-montant .prop-modifier').click();
  await page.getByLabel('Montant', { exact: true }).fill('1500.5');
  await page.getByLabel('Montant', { exact: true }).press('Enter');
  await champDoc('crm_affaires', 'a1', 'montant', 1500.5);
  // Gagnée
  await page.locator('[data-action="choisir-etape"]').selectOption({ label: 'Gagné' }); // J9 : plus de bouton « Gagnée », on passe par la liste « Étape »
  await fermerCelebration(page);
  await expect(page.locator('.barre-etapes-fiche .etape.courante')).toHaveText('Gagné');
  await champDoc('crm_affaires', 'a1', 'statut', 'gagnee');
  // Document
  await ouvrirDocuments(page);
  // Plus de bouton « Ajouter un lien web » : le lien d'essai est écrit directement dans la base, et il reste affiché.
  await expect(page.locator('[data-action="ajouter-lien"]')).toHaveCount(0);
  await ecrireDocument('crm_affaires/a1', { ...(await lireDocument('crm_affaires/a1')), documents: [{ libelle: 'Devis', url: 'https://drive.google.com/devis' }] });
  await expect(page.locator('[data-section="affaire-documents"]').getByRole('link', { name: 'Devis' })).toHaveAttribute('href', 'https://drive.google.com/devis');
  await champDoc('crm_affaires', 'a1', 'documents', [{ libelle: 'Devis', url: 'https://drive.google.com/devis' }]);
  // Plus d'encaissement manuel sur l'affaire (2.2) : l'argent se saisit sur les factures du projet
  await expect(page.locator('[data-action="ajouter-encaissement"]')).toHaveCount(0);
  await expect(page.locator('[data-section="affaire-encaissements"]')).toHaveCount(0);
  // Rouvrir après perdue
  await page.locator('[data-action="perdue"]').click();
  await dialogue(page).getByLabel('Raison', { exact: true }).selectOption('Concurrent');
  await dialogue(page).getByRole('button', { name: 'Marquer comme perdue' }).click();
  await champDoc('crm_affaires', 'a1', 'statut', 'perdue');
  await page.locator('[data-action="rouvrir"]').click();
  await champDoc('crm_affaires', 'a1', 'statut', 'gagnee');
});

// ---------------------------------------------------------------- mise en page, menu, thème, version

test('C22 fiche personne : deux colonnes sur ordinateur, une seule colonne sur téléphone, dans l’ordre prévu', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Marie Durand' });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  // La fiche est redessinée à chaque lot de données qui arrive de Firestore (personne, organisations, paramètres) : on ne mesure donc pas une seule fois
  // un élément qui peut être remplacé à cet instant (boundingBox renvoie alors null), on attend une mesure complète et juste (réessayée jusqu'à la bonne).
  if (estTelephone(page)) {
    // Une seule colonne, dans l'ordre du cahier : Résumé, Activité et Notes, Notes épinglées, À faire, Affaires, Organisation, Détails, Historique
    const mesurerOrdre = () => page.evaluate(() => {
      const blocs = [
        ['résumé', '.section[data-section="personne-resume"]'], ['activité', '.compositeur'], ['à faire', '.points-cles'],
        ['affaires', '.section[data-section="personne-affaires"]'], ['organisation', '.section[data-section="personne-organisation"]'],
        ['détails', '.section[data-section="personne-details"]'], ['historique', '.historique'],
      ];
      const elements = blocs.map(([nom, sel]) => [nom, document.querySelector(sel)]);
      if (elements.some(([, el]) => !el)) return null; // fiche en cours de redessin
      return elements.map(([nom, el]) => { const r = el.getBoundingClientRect(); return { nom, x: Math.round(r.x), y: r.y }; }).sort((a, b) => a.y - b.y);
    });
    await expect.poll(async () => (await mesurerOrdre())?.map((b) => b.nom)).toEqual(['résumé', 'activité', 'à faire', 'affaires', 'organisation', 'détails', 'historique']);
    expect(new Set((await mesurerOrdre()).map((b) => b.x)).size).toBeLessThanOrEqual(2); // même colonne (au pixel près)
  } else {
    const cotesACotes = async () => {
      const gauche = await page.locator('.fiche-gauche').boundingBox();
      const droite = await page.locator('.fiche-droite').boundingBox();
      if (!gauche || !droite) return null; // fiche en cours de redessin
      return droite.x > gauche.x + gauche.width - 2 && Math.abs(droite.y - gauche.y) < 4; // côte à côte, en haut au même niveau
    };
    await expect.poll(cotesACotes).toBe(true);
  }
  for (const section of ['personne-resume', 'personne-details', 'personne-organisation', 'personne-affaires']) {
    await expect(page.locator(`.section[data-section="${section}"]`)).toBeVisible();
  }
  await expect(page.locator('.panneau-activite .onglet')).toHaveText(['Activité', 'Notes']);
  // Section repliable : l'état est mémorisé
  await page.locator('.section[data-section="personne-details"] .section-bascule').click();
  await expect(page.locator('.section[data-section="personne-details"] .section-corps')).toBeHidden();
  await page.reload();
  await expect(page.locator('.section[data-section="personne-details"] .section-corps')).toBeHidden();
});

test('C22 liste des personnes : tableau dense sur ordinateur, cartes sur téléphone ; tri et colonnes au choix', async ({ page }) => {
  await creerOrganisation('o1', { nom: 'Fleurs de Provence' });
  await creerPersonne('p1', { nom: 'Zoé Lemaire', organisationId: 'o1', ville: 'Digne' });
  await creerPersonne('p2', { nom: 'Adam Roux', ville: 'Manosque' });
  await connecter(page);
  await allerA(page, 'Personnes');
  const lignes = page.locator('.tableau-personnes tbody tr');
  await expect(lignes).toHaveCount(2);
  await expect(lignes.first()).toContainText('Adam Roux'); // tri par nom croissant
  if (!estTelephone(page)) {
    await expect(page.locator('.tableau-personnes thead')).toBeVisible();
    await page.locator('.tableau-personnes th button.tri', { hasText: 'Nom' }).click();
    await expect(lignes.first()).toContainText('Zoé Lemaire');
    await page.locator('[data-action="colonnes"]').click();
    await page.locator('.menu-pop').getByRole('menuitem', { name: /Ville/ }).click();
    await expect(page.locator('.tableau-personnes th', { hasText: 'Ville' })).toBeVisible();
    await expect(lignes.first()).toContainText('Digne');
  } else {
    const carte = await lignes.first().evaluate((el) => getComputedStyle(el).display);
    expect(carte).toBe('grid');
  }
  await expect(page.locator('.compteur-liste')).toHaveText('2 contacts');
});

test('C22 Kanban des affaires : colonnes avec total en € et nombre d’affaires ; carte avec organisation, personne, montant, pastille', async ({ page }) => {
  await creerOrganisation('o1', { nom: 'Fleurs de Provence' });
  await creerPersonne('p1', { nom: 'Marie Durand' });
  await creerAffaire('a1', { titre: 'Atelier IA', organisationId: 'o1', personneId: 'p1', montant: 1200, etape: 'rdv_fixe' });
  await creerAffaire('a2', { titre: 'Audit', montant: 800, etape: 'rdv_fixe' });
  await creerActivite('x1', { titre: 'Relance', date: jour(-2), affaireId: 'a1' });
  await connecter(page);
  await allerA(page, 'Affaires');
  const colonne = page.locator('.colonne[data-colonne="rdv_fixe"]');
  await expect(colonne.locator('.colonne-totaux')).toHaveText('2 000 € · 2 affaires');
  const carte = colonne.locator('.carte-affaire[data-affaire="a1"]');
  await expect(carte).toContainText('Fleurs de Provence');
  await expect(carte).toContainText('Marie Durand');
  await expect(carte).toContainText('1 200 €');
  await expect(carte).toContainText('En retard');
  await expect(carte.locator('.pastille-activite.rouge')).toBeVisible();
  await expect(colonne.locator('.carte-affaire[data-affaire="a2"] .pastille-activite.grise')).toBeVisible();
  // Tri par activité suivante : les retards d'abord
  await expect(colonne.locator('.carte-affaire').first()).toHaveAttribute('data-affaire', 'a1');
});

test('C23 menu : replié par défaut, élargi au clic, état conservé ; sur 390 px, panneau par dessus le contenu', async ({ page }) => {
  await connecter(page);
  const menu = page.locator('aside.menu');
  if (estTelephone(page)) {
    const contenuAvant = await page.locator('main.contenu').boundingBox();
    expect(contenuAvant.x).toBe(0);
    expect(contenuAvant.width).toBeGreaterThanOrEqual(389);
    await expect.poll(async () => (await menu.boundingBox()).x).toBeLessThan(-100);
    await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
    await expect.poll(async () => (await menu.boundingBox()).x).toBe(0);
    expect((await page.locator('main.contenu').boundingBox()).x).toBe(0);
    expect(await menu.evaluate((el) => getComputedStyle(el).position)).toBe('fixed');
    await expect(page.locator('.voile-menu')).toBeVisible();
    await menu.getByRole('link', { name: 'Affaires' }).click();
    await expect(page).toHaveURL(/#\/crm\/affaires$/);
    await expect.poll(async () => (await menu.boundingBox()).x).toBeLessThan(-100);
  } else {
    await expect(page.locator('.coquille')).toHaveAttribute('data-menu', 'replie');
    await expect.poll(async () => Math.round((await menu.boundingBox()).width)).toBe(64);
    await expect(menu.locator('.menu-entree[data-chemin="crm/accueil"]')).toHaveAttribute('data-infobulle', 'Accueil');
    await page.getByRole('button', { name: 'Élargir le menu' }).click();
    await expect(page.locator('.coquille')).toHaveAttribute('data-menu', 'elargi');
    await expect.poll(async () => Math.round((await menu.boundingBox()).width)).toBe(240);
    for (const libelle of ['Accueil', 'Personnes', 'Organisations', 'Affaires', 'Projets']) await expect(menu.getByRole('link', { name: libelle, exact: true })).toBeVisible();
    await page.reload();
    await expect(page.locator('.coquille')).toHaveAttribute('data-menu', 'elargi');
    await page.getByRole('button', { name: 'Replier le menu' }).click();
    await page.reload();
    await expect(page.locator('.coquille')).toHaveAttribute('data-menu', 'replie');
  }
});

test('C23 thème : bascule sombre / clair conservée après rechargement', async ({ page }) => {
  await connecter(page);
  const html = page.locator('html');
  await expect(html).toHaveAttribute('data-theme', 'sombre');
  const fondSombre = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  await basculerThemeParMenu(page);
  await expect(html).toHaveAttribute('data-theme', 'clair');
  expect(await page.evaluate(() => getComputedStyle(document.body).backgroundColor)).not.toBe(fondSombre);
  await page.reload();
  await expect(html).toHaveAttribute('data-theme', 'clair');
  await expect(page.locator('.grille-objectifs .objectif')).toHaveCount(5);
});

test('C23 nouvelle version : bandeau au retour sur l’onglet ; hors réseau, bandeau « Hors ligne »', async ({ page, context, erreursConsole }) => {
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
  const inattendues = erreursConsole.filter((e) => !/ERR_INTERNET_DISCONNECTED|ERR_NETWORK_CHANGED|Could not reach Cloud Firestore|WebChannelConnection|net::ERR_/.test(e));
  erreursConsole.length = 0;
  erreursConsole.push(...inattendues);
});

test('C23 aucun défilement horizontal de la page sur les écrans principaux et les fiches, même avec des textes très longs', async ({ page }) => {
  await creerOrganisation('o1', { nom: 'Une organisation au nom particulièrement long pour tester le débordement des cartes et des tableaux' });
  await creerPersonne('p1', { nom: 'Raphaëlle de La Tour-Vieille-Montmorency', organisationId: 'o1', emails: [{ valeur: 'une.adresse.extremement.longue.pour.tester@un-domaine-vraiment-tres-long-exemple.fr', type: 'travail' }], ville: 'Saint-Étienne-de-Tinée-les-Bains' });
  await creerAffaire('a1', { titre: 'Une affaire dont le titre est vraiment très long pour vérifier le comportement', personneId: 'p1', organisationId: 'o1', montant: 12500, priorite: 'chaud', etape: 'rdv_fixe' });
  await ecrireDocument('crm_notes/n1', { texte: 'Unmotextrêmementlongsansespacepourvérifierlecomportementdurendu', personneId: 'p1', organisationId: 'o1', affaireId: 'a1', auteur: JEROME, creeLe: new Date(), modifieLe: new Date() });
  await creerActivite('x1', { titre: 'Envoyer une proposition détaillée avec plusieurs options tarifaires', date: jour(-3), affaireId: 'a1', personneId: 'p1' });
  await connecter(page);
  const sansDebordement = async (nom) => expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth), nom).toBeLessThanOrEqual(0);
  await sansDebordement('accueil');
  for (const [vue, nom] of [['Personnes', 'personnes'], ['Organisations', 'organisations'], ['Affaires', 'affaires'], ['Réglages', 'réglages'], ['Accueil', 'accueil']]) {
    await allerA(page, vue);
    await expect(page.locator('.page')).toBeVisible();
    await sansDebordement(nom);
  }
  await allerA(page, 'Affaires');
  await page.locator('.bascule-vue[data-vue="liste"]').click();
  await sansDebordement('affaires (liste)');
  for (const hash of ['#/crm/personnes/p1', '#/crm/organisations/o1', '#/crm/affaires/a1']) {
    await aller(page, hash);
    await expect(page.locator('.fiche')).toBeVisible();
    await sansDebordement(hash);
  }
  await allerA(page, 'Personnes');
  await page.locator('[data-action="filtres"]').click();
  await expect(dialogue(page)).toBeVisible();
  await sansDebordement('filtres');
  await page.keyboard.press('Escape');
  await expect(dialogue(page)).toHaveCount(0);
  await page.locator('[data-action="nouvelle-personne"]').click();
  await sansDebordement('création');
});

test('C23 navigation : lien direct vers une fiche, route inconnue, déconnexion', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Sophie Lien' });
  await connecter(page, JEROME, { route: 'crm/personnes/p1', attendreAccueil: false });
  await expect(page.locator('.fiche-tete .titre-editable')).toHaveValue('Sophie Lien');
  await aller(page, '#/inconnue');
  await expect(page).toHaveURL(/#\/crm\/accueil$/);
  await aller(page, '#/crm/personnes/inexistante');
  await expect(page.locator('.etat-vide')).toContainText('n’existe plus');
  // Premier lancement : on laisse l'initialisation des réglages et des objectifs se terminer avant de se déconnecter
  await expect.poll(async () => (await listerDocuments('crm_parametres')).length).toBe(9); // listes, offres, étiquettes, filtres, réglages, étapes, phases, modèles d'affaire + le repère des modèles de projet
  await expect.poll(async () => (await listerDocuments('os_kpi')).length).toBe(5);
  await choisirDansMenuUtilisateur(page, 'Se déconnecter');
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
});

// ---------------------------------------------------------------- dossier de travail, ancienne adresse GitHub (chantier « Liens et documents »)

async function fixtureEliot(extra = {}) {
  await creerOrganisation('o1', { nom: 'dépannage Carrel' });
  await creerPersonne('p1', { nom: 'Eliot', organisationId: 'o1' });
  await creerAffaire('a1', { titre: 'création appli devis dépannage', personneId: 'p1', organisationId: 'o1', ...extra });
}

test('C24 plus de champ GitHub ni de « Créer le GitHub » : une ancienne adresse reste visible dans l’onglet « Documents » (lien « GitHub »), se retire sans toucher au reste', async ({ page }) => {
  await fixtureEliot();
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  await ouvrirDocuments(page);
  // Sans adresse : aucune ligne GitHub, aucun champ, aucun bouton, aucun prompt.
  await expect(page.locator('[data-prop="dossier"]')).toBeVisible();
  await expect(page.locator('[data-prop="github"]')).toHaveCount(0);
  await expect(page.locator('[data-champ="github"], [data-action="creer-github"]')).toHaveCount(0);
  await expect(page.getByText('Créer le GitHub')).toHaveCount(0);
  // Avec une ancienne adresse : reprise comme lien « GitHub », donnée intacte.
  await ecrireDocument('crm_affaires/a1', { ...(await lireDocument('crm_affaires/a1')), urlGithub: 'https://github.com/jeromechevalier-wq/eliot-devis-depannage' });
  await aller(page, '#/crm/affaires');
  await aller(page, '#/crm/affaires/a1');
  await ouvrirDocuments(page);
  const liens = page.locator('[data-section="affaire-documents"]');
  await expect(liens).not.toContainText('Liens et documents'); // le titre a disparu ; la ligne s'appelle « Documents »
  await expect(liens.locator('[data-prop="documents"] .prop-libelle')).toContainText('Documents');
  await expect(liens.getByRole('link', { name: 'GitHub' })).toHaveAttribute('href', 'https://github.com/jeromechevalier-wq/eliot-devis-depannage');
  await expect(page.locator('[data-prop="github"]')).toHaveCount(0); // plus de ligne à part dans « Détails »
  expect((await lireDocument('crm_affaires/a1')).urlGithub).toBe('https://github.com/jeromechevalier-wq/eliot-devis-depannage');
  // La retirer est un geste volontaire.
  await liens.getByRole('button', { name: 'Retirer GitHub' }).click();
  await dialogue(page).getByRole('button', { name: 'Retirer' }).click(); // confirmation d'abord
  await champDoc('crm_affaires', 'a1', 'urlGithub', '');
  await expect(liens.getByRole('link', { name: 'GitHub' })).toHaveCount(0);
});

test('C25 dossier de travail d\'une affaire : sans Google, aucun champ ; un ancien lien (serveur, NAS, site) reste affiché et ouvrable ; « Retirer » demande confirmation puis propose « Annuler »', async ({ page, context }) => {
  await debrancherGoogle(context); // Google non branché
  await fixtureEliot({ urlDossier: 'smb://nas/clients/carrel' });
  await creerAffaire('a2', { titre: 'Autre affaire', urlDossier: 'https://exemple.fr/espace/carrel' });
  await creerAffaire('a3', { titre: 'Sans dossier' });
  await connecter(page);
  // Sans dossier et sans Google : aucun champ pour coller une adresse, aucun bouton ; le texte dit que Google Drive n'est pas branché.
  await aller(page, '#/crm/affaires/a3');
  await ouvrirDocuments(page);
  const ligne = page.locator('[data-prop="dossier"]');
  await expect(ligne.locator('.prop-libelle')).toContainText('Dossier de travail');
  await expect(ligne.locator('[data-role="info"]')).toHaveCount(1); // l'explication tient dans une icône « i »
  await expect(page.locator('[data-champ="dossier"], [data-action="enregistrer-dossier"], [data-action="lier-dossier"], [data-action="creer-dossier-ouvrir"]')).toHaveCount(0);
  await expect(ligne.locator('[data-role="google-absent"]')).toContainText('Google Drive n’est pas branché ici');
  await expect(ligne.locator('[data-action="ajouter-dossier"]')).toHaveCount(0);
  // Un ancien dossier de NAS : affiché en texte (un navigateur n'ouvre pas smb://), pas de « Modifier », « Retirer » seulement.
  await aller(page, '#/crm/affaires/a1');
  await ouvrirDocuments(page);
  await expect(ligne).toContainText('smb://nas/clients/carrel');
  await expect(ligne.locator('[data-action="modifier-dossier"]')).toHaveCount(0);
  // Un ancien lien web : « Ouvrir le dossier ».
  await aller(page, '#/crm/affaires/a2');
  await ouvrirDocuments(page);
  await expect(ligne.locator('[data-action="ouvrir-dossier"]')).toHaveAttribute('href', 'https://exemple.fr/espace/carrel');
  // Retirer : confirmation d'abord (annuler ne retire rien), puis « Retiré · Annuler ».
  await ligne.locator('[data-action="retirer-dossier"]').click();
  await expect(dialogue(page)).toContainText('Seul le lien est retiré');
  await dialogue(page).getByRole('button', { name: 'Annuler' }).click();
  expect((await lireDocument('crm_affaires/a2')).urlDossier).toBe('https://exemple.fr/espace/carrel');
  await ligne.locator('[data-action="retirer-dossier"]').click();
  await dialogue(page).getByRole('button', { name: 'Retirer' }).click();
  await champDoc('crm_affaires', 'a2', 'urlDossier', '');
  await page.locator('.toast [data-action="toast-action"]').click();
  await champDoc('crm_affaires', 'a2', 'urlDossier', 'https://exemple.fr/espace/carrel');
  await expect(ligne.locator('[data-action="ouvrir-dossier"]')).toBeVisible();
});

test('C26 réglages : plus de compte GitHub ni de dossier Mac ; la section Google Drive dit que Google n\'est pas encore branché', async ({ page, context }) => {
  await debrancherGoogle(context);
  await fixtureEliot();
  await connecter(page);
  await allerAuxReglagesCrm(page);
  await expect(page.getByLabel('Compte GitHub')).toHaveCount(0);
  await expect(page.getByLabel('Chemin du dossier Projets sur le Mac')).toHaveCount(0);
  const section = page.locator('#reglages-projets');
  await expect(section).toBeVisible(); // l'interrupteur est allumé chez Jérôme
  await expect(section.locator('[data-role="etat-google"]')).toContainText('pas encore branché');
  await expect(page.locator('[data-ligne="boutonsDepot"] [data-action="choisir-dossier-parent"]')).toBeDisabled(); // la zone du dossier parent est sous la case
  await expect(section.locator('[data-action="tester-google"]')).toHaveCount(0); // plus de bouton « Tester la fenêtre Google »
  await expect(page.locator('[data-option="boutonsDepot"]')).toBeChecked();
  await expect(page.locator('[data-ligne="boutonsDepot"]')).toContainText('Créer un dossier dans Google Drive');
});

// ---------------------------------------------------------------- audit des actions de l'écran (04/10/2026)

test('C27 audit de l’écran : créer puis supprimer une personne laisse des lignes dans crm_audit et des copies dans crm_audit_avant, dans le même lot que les données', async ({ page }) => {
  await connecter(page);
  await ouvrirCreation(page, 'personne');
  await dialogue(page).getByLabel('Nom', { exact: true }).fill('Zoé Audit');
  await dialogue(page).getByLabel('Nom', { exact: true }).press('Enter');
  await expect(dialogue(page)).toHaveCount(0);
  const p = await attendre(page, 'crm_personnes', (d) => d.nom === 'Zoé Audit');

  // création : une ligne par document écrit (la personne, son événement), canal « ecran », à mon nom, sans contenu
  await expect.poll(async () => (await listerDocuments('crm_audit')).length).toBe(2);
  const creation = await listerDocuments('crm_audit');
  expect(creation.map((l) => l.action).sort()).toEqual(['creer', 'creer']);
  for (const l of creation) {
    expect(l).toMatchObject({ acteur: JEROME, via: 'ecran', statut: 'succes', outil: 'creerPersonne' });
    expect(l.date).toBeInstanceOf(Date);
  }
  expect(JSON.stringify(creation)).not.toContain('Zoé Audit');
  const ligneP = creation.find((l) => l.collection === 'crm_personnes');
  expect(ligneP.docId).toBe(p.id);
  const copieP = await lireDocument(`crm_audit_avant/${ligneP.id}`);
  expect(copieP.avant).toBeNull();
  expect(copieP.apres.nom).toBe('Zoé Audit');
  expect(copieP.apres.creePar).toBe(JEROME);
  expect(copieP.expireAt.getTime()).toBeGreaterThan(Date.now() + 89 * 86_400_000);

  // suppression : une ligne « supprimer » par document, avec la copie du document supprimé
  await aller(page, `#/crm/personnes/${p.id}`);
  await page.locator('[data-action="menu-fiche"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: /Supprimer définitivement/ }).click();
  await dialogue(page).getByLabel(/Tape « Zoé Audit »/).fill('zoe audit');
  await dialogue(page).getByRole('button', { name: 'Supprimer' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  await expect.poll(async () => await lireDocument(`crm_personnes/${p.id}`)).toBeNull();
  await expect.poll(async () => (await listerDocuments('crm_audit')).filter((l) => l.action === 'supprimer').length).toBeGreaterThanOrEqual(2);
  const suppressions = (await listerDocuments('crm_audit')).filter((l) => l.action === 'supprimer' && l.outil === 'supprimerPersonne');
  const supprP = suppressions.find((l) => l.collection === 'crm_personnes');
  expect(supprP.docId).toBe(p.id);
  const copieSuppr = await lireDocument(`crm_audit_avant/${supprP.id}`);
  expect(copieSuppr.apres).toBeNull();
  expect(copieSuppr.avant).toMatchObject({ nom: 'Zoé Audit' });
});

test('C27 audit de l’écran : une modification de fiche, un changement d’étape et une note laissent chacun leur trace avec la copie avant', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Éric Léon' });
  await creerAffaire('a1', { titre: 'Affaire suivie', personneId: 'p1' });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  await page.locator('[data-action="choisir-etape"]').selectOption('rdv_fixe'); // la bande du haut n'est plus qu'un indicateur
  await expect.poll(async () => (await lireDocument('crm_affaires/a1')).etape).toBe('rdv_fixe');
  await expect.poll(async () => (await listerDocuments('crm_audit')).filter((l) => l.outil === 'changerEtape').length).toBe(2); // l'affaire et son événement
  const ligne = (await listerDocuments('crm_audit')).find((l) => l.outil === 'changerEtape' && l.collection === 'crm_affaires');
  expect(ligne).toMatchObject({ action: 'modifier', docId: 'a1', acteur: JEROME, via: 'ecran' });
  expect(ligne.champsModifies).toEqual(expect.arrayContaining(['etape', 'statut', 'modifieLe', 'modifiePar']));
  const copie = await lireDocument(`crm_audit_avant/${ligne.id}`);
  expect(copie.avant.etape).toBe('premier_contact');
  expect(copie.apres.etape).toBe('rdv_fixe');
  expect(copie.apres.titre).toBe('Affaire suivie'); // champs non modifiés conservés dans la copie « après »
});

// ---------------------------------------------------------------- écran Journal (lecture seule)

test('C28 Journal : ce que je fais dans l’appli y apparaît avec la copie avant / après ; les lignes du serveur MCP aussi, avec filtres ; rien n’y est modifiable', async ({ page }) => {
  // une ligne du serveur (Claude Code), une ligne restée « en cours » (à vérifier) sans copie, posées comme le serveur les écrit
  const il = new Date(Date.now() - 3_600_000);
  await ecrireDocument('crm_audit/mcp1', { operationId: 'opmcp', ordre: 1, acteur: 'claude-code-jerome', jeton: 'claude-code-jerome', via: 'mcp', outil: 'creer_organisation', collection: 'crm_organisations', docId: 'o1', action: 'creer', statut: 'succes', champsModifies: ['nom'], parametresRecus: ['nom'], date: il });
  await ecrireDocument('crm_audit_avant/mcp1', { operationId: 'opmcp', collection: 'crm_organisations', docId: 'o1', avant: null, apres: { nom: 'Orga MCP', ville: 'Lyon' }, expireAt: new Date(Date.now() + 80 * 86_400_000) });
  await ecrireDocument('crm_audit/mcp2', { operationId: 'opbloque', ordre: 1, acteur: 'claude-code-jerome', jeton: 'claude-code-jerome', via: 'mcp', outil: 'supprimer_affaire', collection: 'crm_affaires', docId: 'a9', action: 'supprimer', statut: 'en_cours', champsModifies: [], parametresRecus: [], date: new Date(Date.now() - 7_200_000) });

  await connecter(page);
  // une action faite dans l'appli : créer puis supprimer une personne
  await ouvrirCreation(page, 'personne');
  await dialogue(page).getByLabel('Nom', { exact: true }).fill('Zoé Journal');
  await dialogue(page).getByLabel('Nom', { exact: true }).press('Enter');
  await expect(dialogue(page)).toHaveCount(0);
  const p = await attendre(page, 'crm_personnes', (d) => d.nom === 'Zoé Journal');
  await aller(page, `#/crm/personnes/${p.id}`);
  await page.locator('[data-action="menu-fiche"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: /Supprimer définitivement/ }).click();
  await dialogue(page).getByLabel(/Tape « Zoé Journal »/).fill('zoe journal');
  await dialogue(page).getByRole('button', { name: 'Supprimer' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  await expect.poll(async () => await lireDocument(`crm_personnes/${p.id}`)).toBeNull();
  await expect.poll(async () => (await listerDocuments('crm_audit')).filter((l) => l.outil === 'supprimerPersonne').length).toBeGreaterThanOrEqual(2);
  const nbLignes = (await listerDocuments('crm_audit')).length;

  await allerA(page, 'Journal des modifications');
  await expect(page).toHaveURL(/#\/crm\/journal$/);
  await expect(page.getByRole('heading', { name: 'Journal des modifications' })).toBeVisible();
  const lignes = page.locator('.tableau-journal tbody tr');
  await expect(lignes).toHaveCount(4); // suppression de la personne (avec son événement), sa création, ligne MCP réussie, ligne MCP à vérifier
  await expect(lignes.first()).toContainText(/Suppression de 1 événement, 1 personne/);
  await expect(lignes.first()).toContainText('Jérôme');
  await expect(lignes.first()).toContainText('Appli');
  await expect(page.locator('tr[data-operation="opmcp"]')).toContainText('Création de 1 organisation');
  await expect(page.locator('tr[data-operation="opmcp"]')).toContainText('claude-code-jerome');
  await expect(page.locator('tr[data-operation="opmcp"]')).toContainText('MCP');
  await expect(page.locator('tr[data-operation="opbloque"]')).toContainText('À vérifier');

  // détail d'une suppression faite dans l'appli : la copie « avant » du document supprimé
  await lignes.first().click();
  await expect(dialogue(page)).toContainText('Suppression de 1 événement, 1 personne');
  await expect(dialogue(page).locator('.journal-ligne[data-doc-id="' + p.id + '"] .tableau-differences')).toContainText('Zoé Journal');
  await dialogue(page).getByRole('button', { name: 'Fermer', exact: true }).and(page.locator('.bouton-principal')).click();
  await expect(dialogue(page)).toHaveCount(0);

  // détail d'une ligne du serveur : champ par champ, « avant » vide
  await page.locator('tr[data-operation="opmcp"]').click();
  await expect(dialogue(page).locator('.tableau-differences')).toContainText('Orga MCP');
  await expect(dialogue(page).locator('.tableau-differences')).toContainText('Lyon');
  await dialogue(page).getByRole('button', { name: 'Fermer', exact: true }).and(page.locator('.bouton-principal')).click();

  // ligne sans copie : message clair, pas d'erreur
  await page.locator('tr[data-operation="opbloque"]').click();
  await expect(dialogue(page)).toContainText('Pas de copie');
  await dialogue(page).getByRole('button', { name: 'Fermer', exact: true }).and(page.locator('.bouton-principal')).click();

  // filtres
  await page.locator('[data-action="filtres"]').click();
  await dialogue(page).locator('input[data-cle="canaux"][data-valeur="mcp"]').check();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(lignes).toHaveCount(2);
  await page.locator('[data-action="filtres"]').click();
  await dialogue(page).getByRole('button', { name: 'Tout effacer' }).click();
  await expect(lignes).toHaveCount(4);
  await page.locator('[data-action="filtres"]').click();
  await dialogue(page).locator('input[data-cle="aVerifier"]').check();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(lignes).toHaveCount(1);
  await expect(lignes.first()).toContainText('Suppression de 1 affaire');
  await page.locator('[data-action="filtres"]').click();
  await dialogue(page).getByRole('button', { name: 'Tout effacer' }).click();
  await page.getByLabel('Rechercher dans le journal').fill('lyon-inconnu');
  await expect(page.getByText('Rien à afficher avec ces filtres')).toBeVisible();
  await page.getByLabel('Rechercher dans le journal').fill('Lyon');
  await expect(page.locator('.tableau-journal tbody tr')).toHaveCount(0); // le texte saisi ne cherche pas dans le contenu des documents

  // lecture seule : aucun champ d'édition ni bouton de suppression, et consulter n'écrit rien dans le journal
  await page.getByLabel('Rechercher dans le journal').fill('');
  await expect(page.locator('.page-journal').getByRole('button', { name: /Supprimer|Restaurer|Modifier/ })).toHaveCount(0);
  expect((await listerDocuments('crm_audit')).length).toBe(nbLignes);
});

test('C29 les anciens rôles et dates JTBD sont convertis à l’ouverture en étiquettes ; la vue et l’objectif suivent', async ({ page }) => {
  await ecrireDocument('crm_parametres/etiquettes', { items: [{ id: 'partenaire', nom: 'Partenaire', couleur: '#3fbf7f', ordre: 1 }] });
  await ecrireDocument('crm_parametres/filtres', { version: 2, items: [{ id: 'jtbd_a_faire', nom: 'Interviews JTBD à faire', liste: 'personnes', criteres: { roles: ['interview_jtbd'], jtbd: 'non_faite' }, ordre: 1 }] });
  await ecrireDocument('os_kpi/interviews_jtbd', { id: 'interviews_jtbd', libelle: 'Interviews JTBD réalisées', type: 'calcule', calcul: 'interviews_jtbd', cible: 10, unite: '', couleur: '#e3cdee', ordre: 1, actif: true });
  await creerPersonne('p1', { nom: 'Marie Durand', roles: ['partenaire'] });
  await creerPersonne('p2', { nom: 'Paul Martin', roles: ['interview_jtbd'] });
  await creerPersonne('p3', { nom: 'Éric Léon', roles: ['interview_jtbd'], dateInterviewJtbd: '2026-10-02' });
  await creerPersonne('p4', { nom: 'Zoé Simple' });
  await connecter(page, JEROME, { attendreAccueil: false });
  await expect(page.locator('.coquille')).toBeVisible();
  await champDoc('crm_personnes', 'p1', 'etiquettes', ['partenaire']);
  await champDoc('crm_personnes', 'p2', 'etiquettes', ['a_interviewer_jtbd']);
  await champDoc('crm_personnes', 'p3', 'etiquettes', ['interviewe_jtbd']);
  await champDoc('crm_personnes', 'p4', 'etiquettes', []);
  await champDoc('crm_personnes', 'p2', 'roles', []);
  await champDoc('crm_personnes', 'p3', 'dateInterviewJtbd', null);
  await expect.poll(async () => ((await lireDocument('crm_parametres/etiquettes'))?.items ?? []).map((e) => e.nom).sort()).toEqual(['Interviewé JTBD', 'Partenaire', 'À interviewer JTBD']);
  await expect.poll(async () => ((await lireDocument('crm_parametres/filtres'))?.items ?? [])[0]?.criteres).toEqual({ etiquettes: ['a_interviewer_jtbd'] });
  await champDoc('os_kpi', 'interviews_jtbd', 'type', 'manuel');
  await allerA(page, 'Personnes');
  await page.locator('[data-action="filtres-enregistres"]').click();
  await page.locator('.menu-pop').getByRole('menuitem', { name: 'Interviews JTBD à faire' }).click();
  await expect(page.locator('.tableau-personnes tbody tr')).toHaveCount(1);
  await expect(page.locator('.tableau-personnes')).toContainText('Paul Martin');
});

test('C30 source d’une personne : liste fermée aux Réglages, plus de « Nouvelle valeur », une ancienne valeur reste affichée et ne s’ajoute plus à la liste (L1)', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Marie Durand', source: 'Salon du livre' });
  await creerPersonne('p2', { nom: 'Paul Martin' });
  await connecter(page);
  // La source tapée à la main n'entre plus toute seule dans la liste des Réglages (l'ancienne copie automatique est supprimée).
  await page.waitForTimeout(1500);
  expect(((await lireDocument('crm_parametres/listes'))?.sources ?? [])).not.toContain('Salon du livre');
  await aller(page, '#/crm/personnes/p2');
  const details = page.locator('.section[data-section="personne-details"]');
  await details.locator('.prop', { hasText: 'Source' }).getByRole('button', { name: /Ajouter/ }).click();
  const liste = details.getByLabel('Source', { exact: true });
  await expect(liste.locator('option', { hasText: 'LinkedIn' })).toHaveCount(1);
  await expect(liste.locator('option', { hasText: 'Nouvelle valeur' })).toHaveCount(0);
  await liste.selectOption('LinkedIn');
  await champDoc('crm_personnes', 'p2', 'source', 'LinkedIn');
});
