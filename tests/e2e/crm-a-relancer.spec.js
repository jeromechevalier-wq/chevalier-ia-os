// Bloc « À relancer » de l'Accueil (lecture seule + modèles de texte). Un test par critère ; captures dans tests/e2e/captures/crm-a-relancer/ (non versionnées).
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import {
  test, expect, attendreCalme, connecter, creerPersonne, creerAffaire as creerAffaireBrute, creerActivite, ecrireDocument, listerDocuments, estTelephone, JEROME, PROJET, FIRESTORE,
} from './outils.js';

const DOSSIER = 'e2e/captures/crm-a-relancer';
const capture = (page, nom) => page.locator('.section-a-relancer').screenshot({ path: `${DOSSIER}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
const ilYA = (jours) => new Date(Date.now() - jours * 86400000);
const bloc = (page) => page.locator('.section-a-relancer');
const ligne = (page, cle) => page.locator(`.ligne-relance[data-relance="${cle}"]`);

// Une vraie affaire a été créée il y a longtemps : la date de création compte comme dernier mouvement à défaut d'autre.
const creerAffaire = (id, valeurs = {}) => creerAffaireBrute(id, { creeLe: ilYA(40), ...(valeurs.dateEntreeEtape && !valeurs.datesEtapes ? { datesEtapes: { [valeurs.etape || 'premier_contact']: valeurs.dateEntreeEtape } } : {}), ...valeurs });

async function devis(id, valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument(`devis_devis/${id}`, {
    racineId: id, version: 1, numero: null, statut: 'brouillon', affaireId: null, personneId: null, organisationId: null, modeMarge: 'majoration', marge: 25, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, dureeValiditeJours: 90, expireLe: new Date(Date.now() + 60 * 86400000).toISOString().slice(0, 10),
    sections: [{ id: 's1', titre: 'Cuisine', lignes: [{ id: 'l1', libelle: 'Carrelage', quantite: 1, unite: 'u', prixAchat: 80, prixVente: 100 }] }],
    totaux: { ht: 100, tva: 20, ttc: 120 }, creePar: JEROME, modifiePar: JEROME, proprietaire: JEROME, creeLe: ilYA(30), modifieLe: maintenant, ...valeurs,
  });
}

/** Le jeu de base : un devis envoyé (B), une affaire qui dort (A), une personne sans activité (C), plus un cas de chaque exclusion. Tous à 100 €. */
async function jeu() {
  await creerPersonne('p1', { nom: 'Marie Durand', creeLe: ilYA(60) });
  await creerPersonne('p2', { nom: 'Paul Martin', creeLe: ilYA(60) });
  await creerPersonne('p3', { nom: 'Lea Roche', creeLe: ilYA(60) });
  await creerAffaire('a1', { titre: 'Cuisine à refaire', personneId: 'p1', montant: 100, dateEntreeEtape: ilYA(12), datesEtapes: { premier_contact: ilYA(12) } });
  await creerAffaire('a2', { titre: 'Salle de bain', personneId: 'p2', montant: 100, dateEntreeEtape: ilYA(9), datesEtapes: { premier_contact: ilYA(9) } });
  await creerAffaire('a3', { titre: 'Terrasse', personneId: 'p3', montant: 100, dateEntreeEtape: ilYA(1), datesEtapes: { premier_contact: ilYA(1) } });
  await devis('d1', { numero: 'DEV-2026-11-01-001', statut: 'envoye', affaireId: 'a2', personneId: 'p2', finaliseLe: ilYA(10), envoyeLe: ilYA(10) });
}

test.beforeEach(async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
});

test('1 « À relancer » est juste après « À faire » ; les lignes montrent le nom, le motif et l’ancienneté, la plus ancienne d’abord (devis B, affaire A, personne C)', async ({ page }) => {
  await jeu();
  await connecter(page);
  await attendreCalme(page);
  const titres = await page.locator('.page-accueil > .carte-section h2').allTextContents();
  const i = titres.findIndex((t) => t.includes('À relancer'));
  expect(i).toBeGreaterThan(0);
  expect(titres[i - 1]).toContain('À faire');
  const lignes = bloc(page).locator('.ligne-relance');
  // Marie : affaire a1 sans nouvelle depuis 12 jours ; Paul : devis envoyé il y a 10 jours ; Lea : personne sans activité (14 jours ou plus), mais son affaire a3 est récente
  await expect(lignes).toHaveCount(3);
  await expect(lignes.nth(0)).toContainText('Lea Roche');
  await expect(lignes.nth(0)).toContainText('Personne sans activité récente');
  await expect(ligne(page, 'affaire/a1')).toContainText('Cuisine à refaire');
  await expect(ligne(page, 'affaire/a1')).toContainText('Affaire sans nouvelle');
  await expect(ligne(page, 'affaire/a1')).toContainText('il y a 12 jours');
  await expect(ligne(page, 'devis/d1')).toContainText('DEV-2026-11-01-001');
  await expect(ligne(page, 'devis/d1')).toContainText('Devis envoyé, sans réponse');
  await expect(ligne(page, 'devis/d1')).toContainText('il y a 10 jours');
  await expect(ligne(page, 'affaire/a2')).toHaveCount(0); // l'affaire du devis n'apparaît qu'une fois, avec le motif le plus fort
  await expect(ligne(page, 'affaire/a1').locator('a')).toHaveAttribute('href', '#/crm/affaires/a1');
  await expect(bloc(page)).not.toContainText('CRM');
  await capture(page, '1-liste');
});

test('2 cas vide : « Rien à relancer pour l’instant. » ; rien ne dort (affaire récente, activité prévue)', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Marie Durand', creeLe: ilYA(60) });
  await creerAffaire('a1', { titre: 'Cuisine', personneId: 'p1', dateEntreeEtape: ilYA(30) });
  await creerActivite('x1', { affaireId: 'a1', personneId: 'p1', titre: 'Appeler', date: new Date(Date.now() + 3 * 86400000).toISOString().slice(0, 10) });
  await connecter(page);
  await attendreCalme(page);
  await expect(bloc(page)).toContainText('Rien à relancer pour l’instant.');
  await expect(bloc(page).locator('.ligne-relance')).toHaveCount(0);
  await capture(page, '2-vide');
});

test('3 « Brouillon » ouvre un texte modèle prérempli (prénom, vouvoiement, signature), modifiable, avec un bouton « Copier » qui copie le texte modifié', async ({ page }) => {
  await jeu();
  await connecter(page);
  await attendreCalme(page);
  await ligne(page, 'devis/d1').locator('[data-action="brouillon-relance"]').click();
  const zone = page.locator('[data-role="brouillon-relance"]');
  await expect(zone).toBeVisible();
  await expect(zone).toHaveValue(/^Bonjour Paul,/);
  await expect(zone).toHaveValue(/devis que je vous ai envoyé il y a 10 jours/);
  await expect(zone).toHaveValue(/Bien cordialement,\nJérôme$/);
  await zone.fill(`${await zone.inputValue()}\nPS : texte modifié`);
  await page.locator('.dialogue').getByRole('button', { name: 'Copier' }).click();
  await expect(page.locator('.toast')).toContainText('Texte copié');
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('PS : texte modifié');
  await expect(page.locator('.dialogue')).toBeVisible(); // la fenêtre reste ouverte après la copie
  await page.screenshot({ path: `${DOSSIER}/3-brouillon${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
  await page.locator('.dialogue').getByRole('button', { name: 'Fermer' }).first().click();
  await expect(page.locator('.dialogue')).toHaveCount(0);
  expect(await listerDocuments('crm_activites')).toHaveLength(0); // le brouillon n'écrit rien
});

test('4 « J’ai relancé » crée une activité email déjà faite sur l’affaire et la personne, la ligne sort, le journal en garde la trace', async ({ page }) => {
  await jeu();
  await connecter(page);
  await attendreCalme(page);
  await ligne(page, 'affaire/a1').locator('[data-action="ai-relance"]').click();
  await expect(ligne(page, 'affaire/a1')).toHaveCount(0);
  await expect(ligne(page, 'devis/d1')).toHaveCount(1);
  await expect.poll(async () => (await listerDocuments('crm_activites')).length).toBe(1); // l'écran suit l'écriture locale : on attend qu'elle arrive en base
  const activites = await listerDocuments('crm_activites');
  expect(activites[0]).toMatchObject({ type: 'email', fait: true, affaireId: 'a1', personneId: 'p1' });
  expect(activites[0].titre).toContain('Cuisine à refaire');
  await expect.poll(async () => (await listerDocuments('crm_audit')).some((j) => j.outil === 'enregistrerRelance')).toBe(true);
  await capture(page, '4-apres-relance');
});

test('4b « J’ai relancé » sur un devis envoyé : la ligne du devis sort', async ({ page }) => {
  await jeu();
  await connecter(page);
  await attendreCalme(page);
  await ligne(page, 'devis/d1').locator('[data-action="ai-relance"]').click();
  await expect(ligne(page, 'devis/d1')).toHaveCount(0);
  await expect.poll(async () => (await listerDocuments('crm_activites')).length).toBe(1);
  const activites = await listerDocuments('crm_activites');
  expect(activites[0]).toMatchObject({ type: 'email', fait: true, affaireId: 'a2', personneId: 'p2' });
});

test('5 dix lignes visibles, « Voir tout » montre les autres', async ({ page }) => {
  for (let k = 1; k <= 12; k++) await creerAffaire(`a${k}`, { titre: `Affaire ${k}`, dateEntreeEtape: ilYA(7 + k), datesEtapes: { premier_contact: ilYA(7 + k) } });
  await connecter(page);
  await attendreCalme(page);
  await expect(bloc(page).locator('.ligne-relance')).toHaveCount(10);
  await expect(bloc(page).locator('.ligne-relance').first()).toContainText('Affaire 12'); // la plus ancienne d'abord
  await capture(page, '5-dix-lignes');
  await bloc(page).locator('[data-action="voir-tout-relances"]').click();
  await expect(bloc(page).locator('.ligne-relance')).toHaveCount(12);
  await expect(bloc(page).locator('[data-action="voir-tout-relances"]')).toHaveCount(0);
});

test('6 exclus : opposition à la prospection, éléments de test, archivés, gagnées et perdues', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Opposée Un', oppositionProspection: true, creeLe: ilYA(60) });
  await creerPersonne('p2', { nom: 'Test Deux', test: true, creeLe: ilYA(60) });
  await creerAffaire('a1', { titre: 'Affaire opposée', personneId: 'p1', dateEntreeEtape: ilYA(20) });
  await creerAffaire('a2', { titre: 'Affaire de test', test: true, dateEntreeEtape: ilYA(20) });
  await creerAffaire('a3', { titre: 'Affaire archivée', archive: true, dateEntreeEtape: ilYA(20) });
  await creerAffaire('a4', { titre: 'Affaire gagnée', etape: 'gagne', dateEntreeEtape: ilYA(20) });
  await creerAffaire('a5', { titre: 'Affaire perdue', statut: 'perdue', dateEntreeEtape: ilYA(20) });
  await creerAffaire('a6', { titre: 'Affaire visible', dateEntreeEtape: ilYA(20) });
  await devis('d1', { numero: 'DEV-TEST', statut: 'envoye', test: true, finaliseLe: ilYA(20), envoyeLe: ilYA(20) });
  await devis('d2', { numero: 'DEV-ACCEPTE', statut: 'accepte', finaliseLe: ilYA(20), envoyeLe: ilYA(20) });
  await connecter(page);
  await attendreCalme(page);
  await expect(bloc(page).locator('.ligne-relance')).toHaveCount(1);
  await expect(bloc(page).locator('.ligne-relance')).toContainText('Affaire visible');
});

test('7 cas d’erreur : si l’écriture est refusée, un message clair s’affiche et la ligne reste (le bouton se libère)', { annotation: { type: 'erreurs-reseau-attendues', description: 'les règles refusent l’écriture exprès' } }, async ({ page }) => {
  await jeu();
  await connecter(page);
  await attendreCalme(page);
  const regles = (contenu) => fetch(`${FIRESTORE}/emulator/v1/projects/${PROJET}:securityRules`, {
    method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: contenu }] } }),
  });
  try {
    await regles("rules_version = '2'; service cloud.firestore { match /databases/{d}/documents { match /{document=**} { allow read: if true; allow write: if false; } } }");
    await ligne(page, 'affaire/a1').locator('[data-action="ai-relance"]').click();
    await expect(page.locator('.toast-erreur')).toContainText('La relance n’a pas pu être enregistrée');
    await expect(page.locator('.toast-erreur')).toContainText('la ligne reste dans la liste');
    await expect(ligne(page, 'affaire/a1')).toHaveCount(1);
    await expect(ligne(page, 'affaire/a1').locator('[data-action="ai-relance"]')).toBeEnabled();
    await capture(page, '7-erreur');
  } finally {
    await regles(await readFile(fileURLToPath(new URL('../../firestore.rules', import.meta.url)), 'utf8'));
  }
  expect(await listerDocuments('crm_activites')).toHaveLength(0);
});

test('8 liens utiles : LinkedIn (https seulement, nouvel onglet), E-mail (objet prérempli), Appeler ; rien quand la donnée manque ou est refusée', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Marie Durand', linkedin: 'https://www.linkedin.com/in/marie', emails: [{ id: 'e1', valeur: 'marie@exemple.fr', type: 'travail' }], telephones: [{ id: 't1', valeur: '06 12 34 56 78', type: 'travail' }] });
  await creerPersonne('p2', { nom: 'Paul Martin', linkedin: 'https://exemple.fr/in/paul' });
  await creerPersonne('p3', { nom: 'Lea Roche' });
  await creerAffaire('a1', { titre: 'Cuisine', personneId: 'p1', dateEntreeEtape: ilYA(12) });
  await creerAffaire('a2', { titre: 'Bain', personneId: 'p2', dateEntreeEtape: ilYA(12) });
  await creerAffaire('a3', { titre: 'Toit', personneId: 'p3', dateEntreeEtape: ilYA(12) });
  await connecter(page);
  await attendreCalme(page);
  const l1 = ligne(page, 'affaire/a1');
  await expect(l1.locator('[data-action="lien-linkedin"]')).toHaveAttribute('href', 'https://www.linkedin.com/in/marie');
  await expect(l1.locator('[data-action="lien-linkedin"]')).toHaveAttribute('target', '_blank');
  await expect(l1.locator('[data-action="lien-linkedin"]')).toHaveAttribute('rel', 'noopener noreferrer');
  await expect(l1.locator('[data-action="lien-email"]')).toHaveAttribute('href', 'mailto:marie@exemple.fr?subject=Cuisine');
  await expect(l1.locator('[data-action="lien-appeler"]')).toHaveAttribute('href', 'tel:0612345678');
  expect(await l1.locator('.relance-actions a').first().getAttribute('data-action')).toBe('lien-email'); // e-mail d'abord : pas d'échange LinkedIn
  await expect(ligne(page, 'affaire/a2').locator('.relance-actions a')).toHaveCount(0); // adresse LinkedIn refusée : pas de lien
  await expect(ligne(page, 'affaire/a3').locator('.relance-actions a')).toHaveCount(0);
  await expect(ligne(page, 'affaire/a3').locator('[data-action="brouillon-relance"]')).toBeVisible();
  await capture(page, '8-liens');
});
