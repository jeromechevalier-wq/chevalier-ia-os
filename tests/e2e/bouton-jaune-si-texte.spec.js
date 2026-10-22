// Q (nuit 4) : un bouton d'enregistrement est grisé tant que son champ texte est vide, jaune dès la première lettre ;
// une activité ne s'enregistre plus sans texte. Captures (format ordinateur) dans tests/e2e/captures/bouton-jaune-si-texte/ : Q1-vide.png / Q1-texte.png, etc.
import { fileURLToPath } from 'node:url';
import { test, expect, attendreCalme, connecter, creerAffaire, creerPersonne, creerProjet, creerActivite, ecrireDocument, lireDocument, listerDocuments } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/bouton-jaune-si-texte/', import.meta.url));
async function capturer(page, info, nom) {
  if (info.project.name !== 'ordinateur') return;
  await page.screenshot({ path: `${DOSSIER}${nom}.png`, fullPage: true });
}
async function ouvrir(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }
const dialogue = (page) => page.getByRole('dialog');

// Dans ce bac à sable, le script de Google est inaccessible : on le remplace par un fichier vide.
test.beforeEach(async ({ page }) => {
  await page.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
});

/** Couleur de fond d'un bouton (la valeur calculée par le navigateur). */
const fond = (bouton) => bouton.evaluate((el) => getComputedStyle(el).backgroundColor);
/** Le jaune des boutons principaux : lu sur un bouton témoin posé un instant dans la page. */
const jaune = (page) => page.evaluate(() => {
  const t = document.createElement('button');
  t.className = 'bouton bouton-principal';
  document.body.append(t);
  const c = getComputedStyle(t).backgroundColor;
  t.remove();
  return c;
});
/** Vérifie l'état « vide » : visible, désactivé, style secondaire, pas jaune. */
async function verifierGrise(page, bouton) {
  await expect(bouton).toBeVisible();
  await expect(bouton).toBeDisabled();
  await expect(bouton).toHaveClass(/bouton-secondaire/);
  await expect(bouton).not.toHaveClass(/bouton-principal/);
  const j = await jaune(page);
  await expect.poll(() => fond(bouton)).not.toBe(j);
}
/** Vérifie l'état « avec texte » : actif, jaune plein. */
async function verifierJaune(page, bouton) {
  await expect(bouton).toBeEnabled();
  await expect(bouton).toHaveClass(/bouton-principal/);
  const j = await jaune(page);
  await expect.poll(() => fond(bouton)).toBe(j); // le fond change en fondu (transition) : on attend la fin
}

test('Q1 livrable : « Enregistrer le livrable » est grisé tant que le titre est vide, jaune dès la première lettre, grisé de nouveau si on efface', async ({ page }, info) => {
  await creerProjet('pr1', { titre: 'Audit des Lilas', phase: 'decouverte' });
  await connecter(page);
  await ouvrir(page, '#/projets/projets/pr1');
  const section = page.locator('[data-section="projet-taches"]');
  const champ = section.getByLabel('Nouveau livrable');
  const bouton = section.locator('[data-action="ajouter-tache"]');
  await champ.click(); // le formulaire replié cache le bouton : on l'ouvre d'abord
  await verifierGrise(page, bouton);
  await capturer(page, info, 'Q1-vide');
  await champ.fill('a');
  await verifierJaune(page, bouton);
  await capturer(page, info, 'Q1-texte');
  await champ.fill('');
  await verifierGrise(page, bouton);
  // cas d'erreur : que des espaces = toujours grisé ; Entrée affiche le message et ne crée rien
  await champ.fill('   ');
  await verifierGrise(page, bouton);
  await champ.press('Enter');
  await expect(page.locator('.toast', { hasText: 'Le titre est obligatoire.' })).toBeVisible();
  expect(await listerDocuments('projets_taches')).toHaveLength(0);
  // après un ajout réussi, le formulaire est vidé : le bouton est grisé (et non cliquable à vide)
  await champ.fill('Rapport final');
  await verifierJaune(page, bouton);
  await bouton.click();
  await expect.poll(async () => (await listerDocuments('projets_taches')).map((d) => d.titre)).toEqual(['Rapport final']);
  await verifierGrise(page, bouton);
});

test('Q1 cas d’erreur : si l’enregistrement du livrable échoue, le texte revient et le bouton redevient jaune', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Audit des Lilas', phase: 'decouverte' });
  await connecter(page);
  await ouvrir(page, '#/projets/projets/pr1');
  const section = page.locator('[data-section="projet-taches"]');
  const champ = section.getByLabel('Nouveau livrable');
  const bouton = section.locator('[data-action="ajouter-tache"]');
  await champ.click();
  await page.evaluate(async () => { const D = await import('/js/modules/projets/donnees.js'); D.etat.projets = []; }); // l'écriture ne peut plus se faire
  await champ.fill('Deuxième livrable');
  await bouton.click();
  await expect(page.locator('.toast-erreur', { hasText: 'Livrable non ajouté' })).toBeVisible();
  await expect(champ).toHaveValue('Deuxième livrable');
  await page.mouse.move(0, 0); // la souris est encore sur le bouton : on l'écarte pour lire le jaune sans survol
  await verifierJaune(page, bouton);
});

for (const [nom, creer, hash] of [
  ['affaire', () => creerAffaire('a1', { titre: 'Audit des Lilas' }), '#/crm/affaires/a1'],
  ['projet', () => creerProjet('pr1', { titre: 'Audit des Lilas' }), '#/projets/projets/pr1'],
]) {
  test(`Q2 activité (${nom}) : « Enregistrer l’activité » est grisé tant que le titre est vide, jaune dès la première lettre, de nouveau grisé après l’ajout`, async ({ page }, info) => {
    await creer();
    await connecter(page);
    await ouvrir(page, hash);
    const panneau = page.locator('.panneau-activite');
    const titre = panneau.getByLabel('Titre de l’activité');
    const bouton = panneau.locator('[data-action="enregistrer-activite"]');
    await titre.click();
    await verifierGrise(page, bouton);
    if (nom === 'affaire') await capturer(page, info, 'Q2-vide');
    await titre.fill('a');
    await verifierJaune(page, bouton);
    if (nom === 'affaire') await capturer(page, info, 'Q2-texte');
    await titre.fill('');
    await verifierGrise(page, bouton);
    await titre.fill('Rappeler le client');
    await bouton.click();
    await expect.poll(async () => (await listerDocuments('crm_activites')).map((d) => d.titre)).toEqual(['Rappeler le client']);
    await titre.click();
    await expect(titre).toHaveValue('');
    await verifierGrise(page, bouton); // vidé après l'ajout : plus cliquable à vide
    // changer de pastille ne remet pas le bouton en jaune tant que le titre est vide
    await panneau.getByRole('button', { name: 'Email' }).click();
    await verifierGrise(page, bouton);
  });
}

test('Q3 note : « Ajouter la note » est grisé tant que la note est vide, jaune dès la première lettre, de nouveau grisé après l’ajout', async ({ page }, info) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await connecter(page);
  await ouvrir(page, '#/crm/affaires/a1');
  const panneau = page.locator('.panneau-activite');
  await panneau.getByRole('tab', { name: 'Notes' }).click();
  const champ = panneau.getByLabel('Nouvelle note');
  const bouton = panneau.locator('[data-action="ajouter-note"]');
  await verifierGrise(page, bouton);
  await capturer(page, info, 'Q3-vide');
  await champ.fill('a');
  await verifierJaune(page, bouton);
  await capturer(page, info, 'Q3-texte');
  await champ.fill(' \n ');
  await verifierGrise(page, bouton); // cas d'erreur : que des espaces
  await champ.fill('Rappeler jeudi');
  await bouton.click();
  await expect.poll(async () => (await listerDocuments('crm_notes')).map((d) => d.texte)).toContain('Rappeler jeudi');
  await expect(champ).toHaveValue('');
  await verifierGrise(page, bouton);
});

test('Q4 une activité ne s’enregistre plus sans texte : bouton grisé, Entrée ne crée rien (message), des espaces seuls sont refusés, « a » est accepté', async ({ page }, info) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await connecter(page);
  await ouvrir(page, '#/crm/affaires/a1');
  const panneau = page.locator('.panneau-activite');
  const titre = panneau.getByLabel('Titre de l’activité');
  const bouton = panneau.locator('[data-action="enregistrer-activite"]');
  await panneau.getByRole('button', { name: 'Appel', exact: true }).click();
  await verifierGrise(page, bouton);
  await titre.press('Enter');
  await expect(page.locator('.toast-erreur', { hasText: 'Écris au moins un mot pour l\'activité.' })).toBeVisible();
  await page.waitForTimeout(600);
  expect(await listerDocuments('crm_activites')).toHaveLength(0);
  await capturer(page, info, 'Q4-vide-entree');
  // cas d'erreur : titre fait d'espaces
  await titre.fill('    ');
  await verifierGrise(page, bouton);
  await titre.press('Enter');
  await page.waitForTimeout(600);
  expect(await listerDocuments('crm_activites')).toHaveLength(0);
  // une lettre suffit
  await titre.fill('a');
  await verifierJaune(page, bouton);
  await titre.press('Enter');
  await expect.poll(async () => (await listerDocuments('crm_activites')).map((d) => ({ type: d.type, titre: d.titre }))).toEqual([{ type: 'appel', titre: 'a' }]);
  await capturer(page, info, 'Q4-cree');
});

test('Q4 fenêtre « Prochaine activité ? » après un Fait : le titre prérempli peut être effacé ; vide, « Planifier » est grisé et rien n’est créé', async ({ page }, info) => {
  await creerPersonne('p1', { nom: 'Marie Durand' });
  await creerActivite('a1', { titre: 'Appeler Marie', type: 'appel', personneId: 'p1' });
  await connecter(page);
  await ouvrir(page, '#/crm/personnes/p1');
  await page.locator('.points-cles .activite[data-activite="a1"]').getByRole('button', { name: /Marquer comme fait/ }).click();
  const planifier = dialogue(page).getByRole('button', { name: 'Planifier' });
  const titre = dialogue(page).getByLabel('Titre de l’activité');
  await expect(titre).toHaveValue('Relancer');
  await verifierJaune(page, planifier);
  await titre.fill('');
  await verifierGrise(page, planifier);
  await capturer(page, info, 'Q4-fenetre-vide');
  await dialogue(page).getByRole('button', { name: 'Tâche' }).click(); // changer de pastille ne le réactive pas
  await verifierGrise(page, planifier);
  await titre.fill('  ');
  await verifierGrise(page, planifier);
  await titre.fill('b');
  await verifierJaune(page, planifier);
  await planifier.click();
  await expect.poll(async () => (await listerDocuments('crm_activites')).filter((d) => d.id !== 'a1').map((d) => d.titre)).toEqual(['b']);
});

test('Q5 modèle de projet : « Ajouter le livrable type » est grisé tant que le titre est vide, jaune dès la première lettre', async ({ page }, info) => {
  await ecrireDocument('crm_parametres/modeles_projet', { depart: true });
  await ecrireDocument('projets_modeles/m1', { nom: 'Audit', offreId: null, actif: true, ordre: 1, taches: [] });
  await connecter(page);
  await ouvrir(page, '#/projets/modeles/m1');
  const section = page.locator('[data-section="modele-taches"]');
  const champ = section.getByLabel('Nouveau livrable type');
  const bouton = section.locator('[data-action="ajouter-tache-modele"]');
  await verifierGrise(page, bouton);
  await capturer(page, info, 'Q5-vide');
  await champ.press('Enter');
  await expect(page.locator('.toast', { hasText: 'Le titre est obligatoire.' })).toBeVisible();
  await champ.fill('a');
  await verifierJaune(page, bouton);
  await capturer(page, info, 'Q5-texte');
  await bouton.click();
  await expect.poll(async () => ((await lireDocument('projets_modeles/m1')).taches || []).map((t) => t.titre)).toEqual(['a']);
  await verifierGrise(page, bouton);
});

test('Q5 fiche projet avec les formulaires livrable et activité ouverts : un seul bouton jaune plein (Terminer) tant que les champs sont vides, un de plus par champ qui a du texte', async ({ page }, info) => {
  await creerProjet('pr1', { titre: 'Audit des Lilas', phase: 'decouverte' });
  await connecter(page);
  await ouvrir(page, '#/projets/projets/pr1');
  const section = page.locator('[data-section="projet-taches"]');
  const panneau = page.locator('.panneau-activite');
  await section.getByLabel('Nouveau livrable').click();
  await panneau.getByLabel('Titre de l’activité').click();
  const jaunes = page.locator('.bouton-principal:not(:disabled):visible');
  await expect(jaunes).toHaveCount(1);
  await expect(jaunes.first()).toHaveAttribute('data-action', 'terminer');
  await capturer(page, info, 'Q5-un-seul-jaune');
  await section.getByLabel('Nouveau livrable').fill('x');
  await expect(jaunes).toHaveCount(2);
  await panneau.getByLabel('Titre de l’activité').fill('y');
  await expect(jaunes).toHaveCount(3);
  await section.getByLabel('Nouveau livrable').fill('');
  await panneau.getByLabel('Titre de l’activité').fill('');
  await expect(jaunes).toHaveCount(1);
});
