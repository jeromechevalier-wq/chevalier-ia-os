// Étiquettes à cocher (nuit du 23/10/2026) : N5. À la place du champ texte « Ajouter des étiquettes », les étiquettes choisies sont des pastilles et un bouton
// « Étiquettes » ouvre la liste de TOUTES les étiquettes à cocher, avec « + Nouvelle étiquette » en bas. Un test par critère (nom commençant par N5),
// une capture par critère dans tests/e2e/captures/etiquettes-a-cocher/. Ordinateur ET téléphone.
import { test, expect, attendreCalme, connecter, allerA, creerPersonne, creerOrganisation, ecrireDocument, lireDocument, listerDocuments, estTelephone } from './outils.js';

const CAPTURES = 'e2e/captures/etiquettes-a-cocher';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
// Ces écrans n'utilisent pas Google : le script de l'API est remplacé par un fichier vide (sans réseau, il ne produit pas d'erreur de console).
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});

const PALETTE = ['#b98ee0', '#fd6455', '#ecbc06', '#3fbf7f', '#8a9bb4', '#e3cdee'];
const ETIQUETTES = [
  { id: 'partenaire', nom: 'Partenaire', couleur: PALETTE[0], ordre: 1 },
  { id: 'client', nom: 'Client', couleur: PALETTE[1], ordre: 2 },
  { id: 'a_relancer', nom: 'À relancer', couleur: PALETTE[3], ordre: 3 },
];

/** Pose les étiquettes des Réglages (et les autres paramètres de départ, pour qu'aucune valeur par défaut ne s'ajoute). */
async function poserEtiquettes(items) {
  await ecrireDocument('crm_parametres/etiquettes', { items });
  await ecrireDocument('crm_parametres/listes', { secteurs: [], sources: [] });
  await ecrireDocument('crm_parametres/filtres', { version: 2, items: [] });
}
async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }
const fenetre = (page) => page.getByRole('dialog', { name: 'Étiquettes', exact: true });
const fermer = (page) => fenetre(page).locator('.dialogue-pied').getByRole('button', { name: 'Fermer', exact: true });
const boutonEtiquettes =(page) => page.locator('.resume').getByRole('button', { name: 'Étiquettes', exact: true });
const etiquettesDe = async (chemin) => (await lireDocument(chemin))?.etiquettes ?? [];
const reglages = async () => (await lireDocument('crm_parametres/etiquettes'))?.items ?? [];

test('N5 la fenêtre liste les étiquettes à cocher, dans l\'ordre des Réglages, et chaque case s\'enregistre toute seule', async ({ page }) => {
  await poserEtiquettes(ETIQUETTES);
  await creerPersonne('p1', { nom: 'Sophie Martin', etiquettes: ['partenaire'] });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  // Plus de champ texte à suggestions : une pastille et un bouton.
  await expect(page.locator('.resume').getByRole('combobox', { name: 'Étiquettes' })).toHaveCount(0);
  await expect(page.locator('.resume .pastille-choix')).toHaveText(['Partenaire']);
  await boutonEtiquettes(page).click();
  await expect(fenetre(page)).toBeVisible();
  const lignes = fenetre(page).locator('.ligne-etiquette');
  await expect(lignes).toHaveText(['Partenaire', 'Client', 'À relancer']);
  await expect(lignes.nth(0).locator('input')).toBeChecked();
  await expect(lignes.nth(1).locator('input')).not.toBeChecked();
  await expect(lignes.nth(1).locator('.puce-couleur')).toBeVisible();
  if (estTelephone(page)) for (let i = 0; i < 3; i++) await expect.poll(async () => (await lignes.nth(i).boundingBox()).height).toBeGreaterThanOrEqual(44); // (attend la fin de l'animation d'ouverture)
  await capture(page, 'N5-liste');
  // Cocher : enregistré tout de suite, sans fermer la fenêtre.
  await lignes.nth(1).locator('input').check();
  await expect.poll(() => etiquettesDe('crm_personnes/p1')).toEqual(['partenaire', 'client']);
  // Décocher aussi.
  await lignes.nth(0).locator('input').uncheck();
  await expect.poll(() => etiquettesDe('crm_personnes/p1')).toEqual(['client']);
  await fermer(page).click();
  await expect(fenetre(page)).toHaveCount(0);
  await expect(page.locator('.resume .pastille-choix')).toHaveText(['Client']);
  // La croix de la pastille retire l'étiquette de la fiche, sans la supprimer des Réglages.
  await page.getByRole('button', { name: 'Retirer Client', exact: true }).click();
  await expect.poll(() => etiquettesDe('crm_personnes/p1')).toEqual([]);
  await expect(page.locator('.resume .pastille-choix')).toHaveCount(0);
  expect((await reglages()).map((e) => e.nom)).toEqual(['Partenaire', 'Client', 'À relancer']);
});

test('N5 on en crée une : couleur automatique, ordre = dernier + 1, déjà cochée sur la fiche', async ({ page }) => {
  await poserEtiquettes(ETIQUETTES);
  await creerOrganisation('o1', { nom: 'Atelier Lumière' });
  await connecter(page);
  await aller(page, '#/crm/organisations/o1');
  await boutonEtiquettes(page).click();
  const nom = fenetre(page).getByLabel('Nom de la nouvelle étiquette');
  const creer = fenetre(page).getByRole('button', { name: 'Créer', exact: true });
  await expect(creer).toBeDisabled(); // nom vide : bouton grisé
  await nom.fill('Très motivée');
  await expect(creer).toBeEnabled();
  await creer.click();
  // Palette : PALETTE[2] est la première couleur pas encore utilisée par les trois étiquettes de départ.
  await expect.poll(async () => (await reglages()).map((e) => e.nom)).toEqual(['Partenaire', 'Client', 'À relancer', 'Très motivée']);
  const nouvelle = (await reglages()).at(-1);
  expect(nouvelle).toMatchObject({ id: 'tres_motivee', couleur: PALETTE[2], ordre: 4 });
  await expect.poll(() => etiquettesDe('crm_organisations/o1')).toEqual(['tres_motivee']);
  const ligne = fenetre(page).locator('.ligne-etiquette', { hasText: 'Très motivée' });
  await expect(ligne.locator('input')).toBeChecked();
  await expect(nom).toHaveValue('');
  await capture(page, 'N5-creation');
  await fermer(page).click();
  await expect(page.locator('.resume .pastille-choix')).toHaveText(['Très motivée']);
});

test('N5 doublon refusé : « Cette étiquette existe déjà. », rien n\'est créé ni coché', async ({ page }) => {
  await poserEtiquettes(ETIQUETTES);
  await creerPersonne('p1', { nom: 'Sophie Martin' });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  await boutonEtiquettes(page).click();
  await fenetre(page).getByLabel('Nom de la nouvelle étiquette').fill('  a RELANCER ');
  await fenetre(page).getByRole('button', { name: 'Créer', exact: true }).click();
  await expect(fenetre(page).locator('.erreur')).toHaveText('Cette étiquette existe déjà.');
  await capture(page, 'N5-doublon');
  expect((await reglages()).length).toBe(3);
  expect(await etiquettesDe('crm_personnes/p1')).toEqual([]);
  await expect(fenetre(page).locator('.ligne-etiquette input:checked')).toHaveCount(0);
  // Le message disparaît dès qu'on retape.
  await fenetre(page).getByLabel('Nom de la nouvelle étiquette').fill('À relancer 2');
  await expect(fenetre(page).locator('.erreur')).toHaveText('');
});

test('N5 cas vide : sans étiquette dans les Réglages, la fenêtre ne montre que « + Nouvelle étiquette » et le texte « Aucune étiquette pour le moment. »', async ({ page }) => {
  await poserEtiquettes([]);
  await creerPersonne('p1', { nom: 'Sophie Martin' });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  await expect(page.locator('.resume .pastille-choix')).toHaveCount(0);
  await boutonEtiquettes(page).click();
  await expect(fenetre(page)).toContainText('Aucune étiquette pour le moment.');
  await expect(fenetre(page).locator('.ligne-etiquette')).toHaveCount(0);
  await expect(fenetre(page)).toContainText('+ Nouvelle étiquette');
  await capture(page, 'N5-vide');
  // La première étiquette créée prend la première couleur de la palette.
  await fenetre(page).getByLabel('Nom de la nouvelle étiquette').fill('Premier contact');
  await fenetre(page).getByRole('button', { name: 'Créer', exact: true }).click();
  await expect.poll(async () => (await reglages()).at(0)).toMatchObject({ id: 'premier_contact', couleur: PALETTE[0], ordre: 1 });
  await expect(fenetre(page)).not.toContainText('Aucune étiquette pour le moment.');
  await expect.poll(() => etiquettesDe('crm_personnes/p1')).toEqual(['premier_contact']);
});

test('N5 cas d\'erreur : si l\'enregistrement ou la création échoue, un message dit quoi faire et rien n\'est coché', async ({ page }) => {
  await poserEtiquettes(ETIQUETTES);
  await creerPersonne('p1', { nom: 'Sophie Martin' });
  await connecter(page);
  // Test du composant dans la page (une écriture Firestore qui échoue n'est pas simulable de façon fiable : hors ligne, le SDK met l'écriture en attente sans la refuser).
  await page.evaluate(async () => {
    const { selecteurEtiquettes } = await import('/js/modules/crm/composants.js');
    const zone = document.createElement('div');
    zone.id = 'essai-etiquettes';
    zone.className = 'resume';
    zone.style.cssText = 'position:fixed;top:80px;left:16px;width:360px;z-index:5;background:var(--fond, #1c1c1e);padding:16px';
    zone.append(selecteurEtiquettes({ valeurIds: ['partenaire'], surChoix: async () => { throw new Error('refus'); }, creer: async () => { throw new Error('refus'); } }).element);
    document.body.append(zone);
  });
  await page.locator('#essai-etiquettes').getByRole('button', { name: 'Étiquettes', exact: true }).click();
  // Création qui échoue.
  await fenetre(page).getByLabel('Nom de la nouvelle étiquette').fill('Nouvelle');
  await fenetre(page).getByRole('button', { name: 'Créer', exact: true }).click();
  await expect(fenetre(page).locator('.erreur')).toHaveText('Étiquette non créée : vérifie ta connexion, puis réessaie.');
  await expect(fenetre(page).locator('.ligne-etiquette', { hasText: 'Nouvelle' })).toHaveCount(0);
  expect((await reglages()).length).toBe(3);
  // Enregistrement qui échoue : la case revient à son état, un message l'explique.
  const client = fenetre(page).locator('.ligne-etiquette', { hasText: 'Client' }).locator('input');
  await client.click();
  await expect(page.locator('.toast', { hasText: 'Étiquette non enregistrée : vérifie ta connexion, puis réessaie.' })).toBeVisible();
  await expect(client).not.toBeChecked();
  await expect(fenetre(page).locator('.ligne-etiquette', { hasText: 'Partenaire' }).locator('input')).toBeChecked();
  await capture(page, 'N5-erreur');
});

test('N5 clavier : le focus reste piégé dans la fenêtre, Entrée dans le champ nom crée, Échap ferme', async ({ page }) => {
  await poserEtiquettes(ETIQUETTES);
  await creerPersonne('p1', { nom: 'Sophie Martin' });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  await boutonEtiquettes(page).focus();
  await page.keyboard.press('Enter');
  await expect(fenetre(page)).toBeVisible();
  const dansLaFenetre = () => page.evaluate(() => !!document.activeElement?.closest('[role="dialog"]'));
  // Tab dans tous les sens : le focus ne sort jamais.
  for (let i = 0; i < 12; i++) { await page.keyboard.press('Tab'); expect(await dansLaFenetre()).toBe(true); }
  for (let i = 0; i < 12; i++) { await page.keyboard.press('Shift+Tab'); expect(await dansLaFenetre()).toBe(true); }
  // Espace coche la case qui a le focus.
  await fenetre(page).locator('.ligne-etiquette input').first().focus();
  await page.keyboard.press('Space');
  await expect.poll(() => etiquettesDe('crm_personnes/p1')).toEqual(['partenaire']);
  // Entrée dans le champ nom crée l'étiquette et la coche.
  await fenetre(page).getByLabel('Nom de la nouvelle étiquette').fill('Au clavier');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await reglages()).map((e) => e.id)).toContain('au_clavier');
  await expect.poll(() => etiquettesDe('crm_personnes/p1')).toEqual(['partenaire', 'au_clavier']);
  await expect(fenetre(page).getByLabel('Nom de la nouvelle étiquette')).toBeFocused();
  await capture(page, 'N5-clavier');
  // Échap ferme, et le focus revient sur le bouton « Étiquettes ».
  await page.keyboard.press('Escape');
  await expect(fenetre(page)).toHaveCount(0);
  await expect(boutonEtiquettes(page)).toBeFocused();
});

test('N5 le formulaire de création d\'une personne utilise la même fenêtre : les étiquettes cochées sont enregistrées avec la fiche', async ({ page }) => {
  await poserEtiquettes(ETIQUETTES);
  await connecter(page);
  await allerA(page, 'Personnes');
  await page.locator('.page-actions [data-action="nouvelle-personne"]').click();
  const creation = page.getByRole('dialog', { name: 'Ajouter une personne' }).first();
  await expect(creation.locator('.etiquette', { hasText: 'Étiquettes' })).toBeVisible();
  await creation.getByLabel('Nom', { exact: true }).fill('Marie Durand');
  await creation.getByRole('button', { name: 'Étiquettes', exact: true }).click();
  await fenetre(page).locator('.ligne-etiquette', { hasText: 'Client' }).locator('input').check();
  await fermer(page).click();
  await expect(creation.locator('.pastille-choix')).toHaveText(['Client']);
  await creation.getByRole('button', { name: /^Enregistrer$/ }).click();
  await expect.poll(async () => (await lireDocumentParNom('crm_personnes', 'Marie Durand'))?.etiquettes).toEqual(['client']);
});

async function lireDocumentParNom(collection, nom) {
  return (await listerDocuments(collection)).find((d) => d.nom === nom);
}
