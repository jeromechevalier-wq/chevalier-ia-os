// Module Devis, le mot du métier dans les écrans (PR 9 du cadrage-devis-fluide.md, 4.3). Un test par point (le nom commence par M1 à M5), une capture ordinateur ET téléphone par point : captures/devis-mot-metier/.
// Les réglages se posent directement en base ; le PDF et l'assistant gardent « ouvrage » (non testé ici : décision écrite dans la PR).
import { fileURLToPath } from 'node:url';
import {
  test, expect, connecter, attendreCalme, allerA, ouvrirSectionReglages, ecrireDocument, lireDocument, creerOrganisation, creerAffaire, JEROME,
} from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/devis-mot-metier/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name === 'telephone' ? 'tel' : 'ordi'}.png`, fullPage: true, animations: 'disabled' });
}
const dialogue = (page) => page.getByRole('dialog');
const champ = (page) => page.locator('#devis-motOuvrage');
const enregistrer = (page) => page.locator('[data-action="enregistrer-reglages-devis"]');

async function article(id, valeurs = {}) {
  const maintenant = new Date();
  await ecrireDocument(`devis_articles/${id}`, {
    code: '', libelle: 'Article test', unite: 'u', prixAchat: 10, tauxTva: null, actif: true, proprietaire: JEROME,
    creeLe: maintenant, modifieLe: maintenant, creePar: JEROME, modifiePar: JEROME, ...valeurs,
  });
}
const poserMot = (motOuvrage, motOuvrageAutre = {}) => ecrireDocument('devis_parametres/reglages', { motOuvrage, motOuvrageAutre });
async function ouvrirBordereau(page) {
  await connecter(page, undefined, { route: 'devis/bordereau' });
  await expect(page.locator('.page-devis')).toBeVisible();
  await attendreCalme(page);
}
async function ouvrirReglagesDevis(page) {
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Devis');
  await expect(page.locator('#reglages-devis')).toBeVisible();
}
async function devisAvecOuvrage() {
  await creerOrganisation('o1', { nom: 'Société Exemple', adresses: [{ id: 'p1', libelle: 'Principale', adresse: '12 rue des Lilas\n75000 Paris', parDefaut: true }], emails: [{ valeur: 'contact@exemple.fr', type: 'travail' }] });
  await creerAffaire('a1', { titre: 'Rénovation', organisationId: 'o1' });
  await article('c1', { libelle: 'Carrelage', unite: 'm²', prixAchat: 50, type: 'fourniture' });
  const maintenant = new Date();
  const lo = { id: 'lo', libelle: 'Cloison', quantite: 1, unite: 'u', prixAchat: 100, marge: 20, type: 'ouvrage', description: '- Carrelage (2 m²)',
    ouvrage: { composants: [{ articleId: 'c1', libelle: 'Carrelage', unite: 'm²', quantite: 2, prixVenteUnitaire: 60, prixAchat: 50 }], prixVenteHT: 120, deboursSecHT: 100 } };
  await ecrireDocument('devis_devis/d1', {
    racineId: 'd1', version: 1, numero: null, statut: 'brouillon', affaireId: 'a1', organisationId: 'o1', personneId: null, modeMarge: 'majoration', marge: 0, tauxTvaDefaut: 20,
    regimeTva: 'assujetti', autoliquidation: false, archive: false, expireLe: '2026-11-23', destinataires: ['contact@exemple.fr'], objet: 'Rénovation', sections: [{ id: 's1', titre: 'Cuisine', lignes: [lo] }],
    adresses: { commanditaire: { texte: '12 rue des Lilas' }, facturation: { texte: '12 rue des Lilas' }, chantier: { texte: '12 rue des Lilas' } },
    creePar: JEROME, proprietaire: JEROME, creeLe: maintenant, modifieLe: maintenant,
  });
}
async function ouvrirEditeur(page) {
  await connecter(page, undefined, { route: 'devis/editeur/d1' });
  await expect(page.locator('.page-editeur-devis[data-devis]')).toBeVisible();
  await attendreCalme(page);
}

test('M1 Réglages : la liste « Mot du métier » propose les cinq mots et « Autre » ; « prestation » s’enregistre sans effacer les autres réglages', async ({ page }, info) => {
  await connecter(page);
  await ouvrirReglagesDevis(page);
  await expect(champ(page)).toHaveValue('ouvrage');
  expect(await champ(page).locator('option').allTextContents()).toEqual(['Ouvrage', 'Ensemble', 'Forfait', 'Prestation', 'Lot', 'Autre']);
  await expect(page.locator('[data-zone="mot-autre"]')).toBeHidden();
  await champ(page).selectOption('prestation');
  await enregistrer(page).click();
  await expect.poll(async () => (await lireDocument('devis_parametres/reglages'))?.motOuvrage).toBe('prestation');
  expect((await lireDocument('devis_parametres/reglages')).motOuvrageAutre).toEqual({});
  await page.locator('#devis-dureeValiditeJours').fill('45');
  await enregistrer(page).click();
  await expect.poll(async () => (await lireDocument('devis_parametres/reglages'))?.dureeValiditeJours).toBe(45);
  expect((await lireDocument('devis_parametres/reglages')).motOuvrage).toBe('prestation'); // le setDoc sans fusion ne l'a pas effacé
  await capturer(page, info, 'M1-reglage-prestation');
});

test('M1 « Autre » : les trois champs apparaissent, une phrase par champ fautif, rien n’est écrit en base ; un mot valide s’enregistre', async ({ page }, info) => {
  await poserMot('ouvrage');
  await connecter(page);
  await ouvrirReglagesDevis(page);
  await champ(page).selectOption('autre');
  await expect(page.locator('[data-zone="mot-autre"]')).toBeVisible();
  await enregistrer(page).click();
  await expect(page.locator('[data-erreur="motOuvrageAutre.singulier"]')).toContainText('Écris le mot au singulier');
  await expect(page.locator('[data-erreur="motOuvrageAutre.pluriel"]')).toContainText('Écris le mot au pluriel');
  await expect(page.locator('[data-erreur="motOuvrageAutre.genre"]')).toContainText('Choisis masculin ou féminin');
  expect((await lireDocument('devis_parametres/reglages')).motOuvrage).toBe('ouvrage'); // la valeur gardée en base
  await capturer(page, info, 'M1-autre-erreurs');
  await page.locator('#devis-motOuvrageAutre\\.singulier').fill('chantier');
  await page.locator('#devis-motOuvrageAutre\\.pluriel').fill('chantiers');
  await page.locator('#devis-motOuvrageAutre\\.genre').selectOption('masculin');
  await enregistrer(page).click();
  await expect.poll(async () => (await lireDocument('devis_parametres/reglages'))?.motOuvrage).toBe('autre');
  expect((await lireDocument('devis_parametres/reglages')).motOuvrageAutre).toEqual({ singulier: 'chantier', pluriel: 'chantiers', genre: 'masculin' });
});

test('M2 Bordereau « prestation » : la fenêtre d’un article de la famille Ouvrages dit « Composants de la prestation » et le cas vide « la prestation se calcule »', async ({ page }, info) => {
  await poserMot('prestation');
  await ouvrirBordereau(page);
  // Le mot se lit à l'ouverture de la fenêtre : si le réglage arrive juste après l'écran (premier envoi en cache), on rouvre la fenêtre.
  await expect(async () => {
    if (!(await dialogue(page).count())) await page.locator('[data-action="nouvel-article"]').click();
    await dialogue(page).locator('#article-familleId').fill('Ouvrages');
    await dialogue(page).getByRole('option', { name: /^Ouvrages$/ }).click();
    try { await expect(dialogue(page).locator('.editeur-ouvrage .etiquette').first()).toHaveText('Composants de la prestation', { timeout: 1500 }); } catch (e) { await dialogue(page).getByRole('button', { name: 'Annuler' }).click(); throw e; }
  }).toPass({ timeout: 20000 });
  await expect(dialogue(page).locator('[data-vide="composants"]')).toContainText('la prestation se calcule');
  await dialogue(page).getByRole('searchbox', { name: 'Ajouter un composant' }).fill('zzz');
  await expect(dialogue(page).locator('.resultats-composants')).toContainText('une prestation ne peut pas en contenir une autre');
  await capturer(page, info, 'M2-composants-prestation');
});

test('M2 Bordereau « prestation » : sortir un article composé de sa famille dit « Une prestation reste dans la famille « Ouvrages » » (nom de famille lu en base)', async ({ page }, info) => {
  await poserMot('prestation');
  await article('o1', { libelle: 'Cloison', type: 'ouvrage', familleId: 'famille-3', prixAchat: null, composants: [{ articleId: 'a1', quantite: 1 }] });
  await article('a1', { libelle: 'BA13', unite: 'm²', prixAchat: 5, type: 'fourniture' });
  await ouvrirBordereau(page);
  const ligne = page.locator('.ligne-article[data-id="o1"]');
  await ligne.locator('[data-champ="familleId"]').click();
  const saisie = ligne.locator('.champ-intelligent input');
  await saisie.fill('plomb');
  await expect(page.getByRole('option', { name: /Fournitures › Plomberie et sanitaire/ })).toBeVisible();
  await saisie.press('ArrowDown');
  await saisie.press('Enter');
  await expect(page.getByText(/Une prestation reste dans la famille « Ouvrages »/)).toBeVisible();
  await capturer(page, info, 'M2-toast-prestation');
});

test('M3 Éditeur « ensemble » : « + Ensemble », menu Insérer, « Cacher les éléments d’ensemble », « Configurer les éléments de l’ensemble » ; la clé technique ne change pas', async ({ page }, info) => {
  await poserMot('ensemble');
  await devisAvecOuvrage();
  await ouvrirEditeur(page);
  await expect(page.locator('[data-action="ajouter-famille-3"]')).toContainText('Ensemble');
  await page.locator('tr[data-id="lo"] [data-champ="libelle"]').click();
  await expect(page.locator('tr[data-id="lo"] [data-action="configurer-ouvrage"]')).toHaveText('Configurer les éléments de l’ensemble');
  await page.locator('tr[data-id="lo"] [data-action="menu-ligne"]').click();
  await page.getByRole('menuitem', { name: 'Insérer en dessous' }).click();
  await expect(page.locator('.menu-devis-ligne [data-menu="inserer-apres-ouvrage"]')).toHaveText('Ensemble');
  await capturer(page, info, 'M3-menu-inserer-ensemble');
  await page.keyboard.press('Escape');
  await page.locator('tr[data-id="lo"] [data-champ="libelle"]').click();
  await page.locator('tr[data-id="lo"] [data-action="configurer-ouvrage"]').click();
  await expect(dialogue(page)).toContainText('Éléments de l’ensemble');
  await dialogue(page).getByRole('button', { name: 'Annuler' }).click();
});

test('M3 Éditeur « ensemble » : le menu Options dit « Cacher les éléments d’ensemble »', async ({ page }, info) => {
  await poserMot('ensemble');
  await devisAvecOuvrage();
  await ouvrirEditeur(page);
  if (info.project.name === 'telephone') { await page.locator('[data-action="plus-actions"]').click(); await page.getByRole('menuitem', { name: 'Options' }).click(); } else await page.locator('[data-action="options"]').click();
  await expect(page.locator('[data-zone="options"]')).toContainText('Cacher les éléments d’ensemble');
  await expect(page.locator('[data-zone="options"]')).toContainText('Afficher les prix des éléments d’ensemble');
  await capturer(page, info, 'M3-options-ensemble');
});

test('M4 Éditeur « prestation » : « éléments de prestation », « éléments de la prestation », accords au féminin', async ({ page }, info) => {
  await poserMot('prestation');
  await devisAvecOuvrage();
  await ouvrirEditeur(page);
  await expect(page.locator('[data-action="ajouter-famille-3"]')).toContainText('Prestation');
  await page.locator('tr[data-id="lo"] [data-champ="libelle"]').click();
  await expect(page.locator('tr[data-id="lo"] [data-action="configurer-ouvrage"]')).toHaveText('Configurer les éléments de la prestation');
  await page.locator('tr[data-id="lo"] [data-action="configurer-ouvrage"]').click();
  await expect(dialogue(page)).toContainText('Éléments de la prestation');
  await expect(dialogue(page).locator('.editeur-ouvrage .etiquette').first()).toHaveText('Composants de la prestation');
  await expect(dialogue(page).getByRole('button', { name: 'Retirer de la prestation : Carrelage' })).toBeVisible();
  await capturer(page, info, 'M4-elements-prestation');
});

test('M4 Mot par défaut : « Ouvrage » partout, comme avant (aucun réglage posé)', async ({ page }, info) => {
  await devisAvecOuvrage();
  await ouvrirEditeur(page);
  await expect(page.locator('[data-action="ajouter-famille-3"]')).toContainText('Ouvrage');
  await page.locator('tr[data-id="lo"] [data-champ="libelle"]').click();
  await expect(page.locator('tr[data-id="lo"] [data-action="configurer-ouvrage"]')).toHaveText('Configurer les éléments de l’ouvrage');
  await capturer(page, info, 'M4-defaut-ouvrage');
});

test('M5 Vocabulaire : la phrase « Le mot « … » se choisit dans Réglages > Devis » suit le mot réglé et le lien ouvre les réglages', async ({ page }, info) => {
  await poserMot('lot');
  await connecter(page, undefined, { route: 'devis/vocabulaire' });
  const note = page.locator('[data-zone="mot-metier"]');
  await expect(note).toContainText('Le mot « lot » (le nom de tes articles composés) se choisit dans Réglages > Devis.');
  await capturer(page, info, 'M5-vocabulaire');
  await note.getByRole('link', { name: 'Réglages > Devis' }).click();
  await expect(page.locator('#reglages-devis')).toBeVisible();
});

// B1 (31/10/2026) : le message après « Enregistrer » dans la fenêtre Composition suit le mot du métier ; le titre « Composition » et le bouton restent.
async function enregistrerUneComposition(page, info, mot, motAutre, attendu, capture) {
  await poserMot(mot, motAutre);
  await article('a1', { libelle: 'BA13', unite: 'm²', prixAchat: 5, type: 'fourniture' });
  await article('o1', { libelle: 'Cloisons', type: 'ouvrage', prixAchat: null, composants: [{ articleId: 'a1', quantite: 1 }] });
  await ouvrirBordereau(page);
  await page.locator('.ligne-article[data-id="o1"] [data-action="composer"]').click();
  await expect(dialogue(page)).toBeVisible();
  await expect(dialogue(page)).toContainText('Composition : Cloisons');
  await dialogue(page).getByRole('button', { name: 'Enregistrer' }).click();
  await expect(dialogue(page)).toBeHidden();
  await expect(page.locator('.toast').last()).toHaveText(attendu);
  await capturer(page, info, capture);
}

test('B1.1 mot « prestation » : le message dit « Prestation enregistrée »', async ({ page }, info) => {
  await enregistrerUneComposition(page, info, 'prestation', {}, 'Prestation enregistrée', 'B1-prestation');
});

test('B1.2 mot « ensemble » : le message dit « Ensemble enregistré »', async ({ page }, info) => {
  await enregistrerUneComposition(page, info, 'ensemble', {}, 'Ensemble enregistré', 'B1-ensemble');
});

test('B1.3 mot par défaut (réglage « ouvrage ») : le message dit « Ouvrage enregistré »', async ({ page }, info) => {
  await enregistrerUneComposition(page, info, 'ouvrage', {}, 'Ouvrage enregistré', 'B1-ouvrage');
});

test('B1.4 mot « Autre » féminin (« réalisation ») : le message dit « Réalisation enregistrée »', async ({ page }, info) => {
  await enregistrerUneComposition(page, info, 'autre', { singulier: 'réalisation', pluriel: 'réalisations', genre: 'feminin' }, 'Réalisation enregistrée', 'B1-realisation');
});
