// Tri uniforme (nuit du 23/10/2026) : le même menu « Trier par » + bouton flèche sur Affaires, Projets, Personnes et Organisations.
// Un test par critère du brief (nom commençant par le numéro), une capture par critère dans tests/e2e/captures/tri-uniforme/. Ordinateur ET téléphone.
import { test, expect, attendreCalme, connecter, allerA, creerPersonne, creerOrganisation, creerAffaire, creerProjet, estTelephone } from './outils.js';

const CAPTURES = 'e2e/captures/tri-uniforme';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
// Ces écrans n'utilisent pas Google : le script de l'API est remplacé par un fichier vide (sans réseau, il ne produit pas d'erreur de console).
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});

const menuTri = (page) => page.getByRole('combobox', { name: 'Trier par', exact: true });
const fleche = (page) => page.locator('[data-action="inverser-tri"]');
const optionsDuMenu = (page) => page.locator('select[aria-label="Trier par"] option');
const bascule = (page, vue) => page.locator(`.bascule-vue[data-vue="${vue}"]`);
const cle = (nom) => `chevalier-os.${nom}`;
const preference = (page, nom) => page.evaluate((k) => localStorage.getItem(k), cle(nom));
const poserPreference = (page, nom, valeur) => page.evaluate(([k, v]) => localStorage.setItem(k, v), [cle(nom), valeur]);
async function recharger(page) { await page.reload(); await attendreCalme(page); }

/** Sur téléphone, ni la page ni le menu ne dépassent la largeur de l'écran. */
async function verifierSansDebordement(page) {
  const largeur = page.viewportSize().width;
  const { page: l, menuDroite, flecheDroite } = await page.evaluate(() => ({
    page: document.documentElement.scrollWidth,
    menuDroite: document.querySelector('select[aria-label="Trier par"]').getBoundingClientRect().right,
    flecheDroite: document.querySelector('[data-action="inverser-tri"]').getBoundingClientRect().right,
  }));
  expect(l).toBeLessThanOrEqual(largeur);
  expect(menuDroite).toBeLessThanOrEqual(largeur);
  expect(flecheDroite).toBeLessThanOrEqual(largeur);
}

const DATE = (m) => new Date(`2026-0${m}-10T10:00:00Z`);

async function projetsDeTest() {
  await creerProjet('pr1', { titre: 'Beta', creeLe: DATE(1), dateFin: '2026-12-01' });
  await creerProjet('pr2', { titre: 'Alpha', creeLe: DATE(3), dateFin: '2026-06-01' });
  await creerProjet('pr3', { titre: 'Gamma', creeLe: DATE(2), dateFin: null });
  await creerProjet('pr4', { titre: 'Émile', creeLe: null, dateFin: null });
}
const titresKanbanProjets = (page) => page.locator('.colonne[data-colonne="lancement"] .carte-titre');
const titresListe = (page) => page.locator('tbody tr .cellule-nom > span:not(.avatar-initiales):not(.badge-opposition)');

async function affairesDeTest() {
  await creerAffaire('a1', { titre: 'Delta', montant: 500, creeLe: DATE(1) });
  await creerAffaire('a2', { titre: 'Alpha', montant: 1500, creeLe: DATE(2) });
  await creerAffaire('a3', { titre: 'Charlie', montant: null, creeLe: DATE(3) });
}
const titresKanbanAffaires = (page) => page.locator('.colonne[data-colonne="premier_contact"] .carte-titre');

test('1 Projets : le menu « Trier par » existe en Kanban ET en Liste ; le Kanban trie à l\'intérieur de chaque colonne', async ({ page }) => {
  await projetsDeTest();
  await connecter(page);
  await allerA(page, 'Projets');
  await expect(menuTri(page)).toBeVisible();
  await expect(optionsDuMenu(page)).toHaveText(['Trier par : Titre', 'Trier par : Création', 'Trier par : Début', 'Trier par : Fin prévue']);
  await expect(menuTri(page)).toHaveValue('titre');
  // Départ inchangé : titre croissant, sans tenir compte des accents (Émile entre Beta et Gamma).
  await expect(titresKanbanProjets(page)).toHaveText(['Alpha', 'Beta', 'Émile', 'Gamma']);
  await menuTri(page).selectOption('creation');
  await expect(titresKanbanProjets(page)).toHaveText(['Alpha', 'Gamma', 'Beta', 'Émile']); // récent d'abord, sans date à la fin
  await fleche(page).click();
  await expect(titresKanbanProjets(page)).toHaveText(['Beta', 'Gamma', 'Alpha', 'Émile']); // ancien d'abord, sans date toujours à la fin
  await menuTri(page).selectOption('fin');
  await expect(titresKanbanProjets(page).first()).toHaveText('Alpha');
  await capture(page, '1-projets-kanban');
  // Même menu, même état en Liste.
  await bascule(page, 'liste').click();
  await expect(menuTri(page)).toBeVisible();
  await expect(menuTri(page)).toHaveValue('fin');
  await expect(titresListe(page).nth(0)).toHaveText('Alpha');
  await expect(titresListe(page).nth(1)).toHaveText('Beta');
  await menuTri(page).selectOption('titre');
  await expect(titresListe(page)).toHaveText(['Alpha', 'Beta', 'Émile', 'Gamma']);
  // Le clic d'une colonne qui n'est pas dans le menu (Phase) est affiché dans le menu.
  if (!estTelephone(page)) {
    await page.locator('.tableau-projets th button.tri', { hasText: 'Phase' }).click();
    await expect(menuTri(page)).toHaveValue('phase');
    await expect(page.locator('.tableau-projets th[aria-sort="ascending"]')).toContainText('Phase');
  }
  await capture(page, '1-projets-liste');
  if (estTelephone(page)) await verifierSansDebordement(page);
});

test('2 Affaires : le menu « Trier par » est aussi en Liste et en Archives, avec un seul état pour le menu, la flèche et la colonne', async ({ page }) => {
  await affairesDeTest();
  await creerAffaire('a4', { titre: 'Zeta archivée', montant: 10, archive: true, creeLe: DATE(4) });
  await connecter(page);
  await allerA(page, 'Affaires');
  await expect(menuTri(page)).toBeVisible();
  await expect(menuTri(page)).toHaveValue('activite'); // départ inchangé
  await expect(optionsDuMenu(page)).toHaveText(['Trier par : Activité suivante', 'Trier par : Montant', 'Trier par : Titre', 'Trier par : Création']);
  // Kanban : le sens s'applique aussi (Montant : le plus gros d'abord, sans montant à la fin).
  await menuTri(page).selectOption('montant');
  await expect(titresKanbanAffaires(page)).toHaveText(['Alpha', 'Delta', 'Charlie']);
  await fleche(page).click();
  await expect(titresKanbanAffaires(page)).toHaveText(['Delta', 'Alpha', 'Charlie']);
  await fleche(page).click();
  // Liste : le même menu, le même état.
  await bascule(page, 'liste').click();
  await expect(menuTri(page)).toBeVisible();
  await expect(menuTri(page)).toHaveValue('montant');
  await expect(titresListe(page)).toHaveText(['Alpha', 'Delta', 'Charlie']);
  await menuTri(page).selectOption('titre');
  await expect(titresListe(page)).toHaveText(['Alpha', 'Charlie', 'Delta']);
  if (!estTelephone(page)) {
    // Le clic de colonne met le menu à jour (un seul état) ; la colonne Étape n'est pas dans le menu mais s'y affiche.
    await page.locator('.tableau-affaires th button.tri', { hasText: 'Montant' }).click();
    await expect(menuTri(page)).toHaveValue('montant');
    await expect(titresListe(page)).toHaveText(['Alpha', 'Delta', 'Charlie']);
    await page.locator('.tableau-affaires th button.tri', { hasText: 'Étape' }).click();
    await expect(menuTri(page)).toHaveValue('etape');
    await expect(menuTri(page).locator('option:checked')).toHaveText('Trier par : Étape');
  }
  await menuTri(page).selectOption('titre');
  await capture(page, '2-affaires-liste');
  // Archives : le menu est là aussi, le même tri.
  await bascule(page, 'archives').click();
  await expect(menuTri(page)).toBeVisible();
  await expect(menuTri(page)).toHaveValue('titre');
  await expect(titresListe(page)).toHaveText(['Zeta archivée']);
  // Retour au Kanban : toujours le même état.
  await bascule(page, 'kanban').click();
  await expect(menuTri(page)).toHaveValue('titre');
  await expect(titresKanbanAffaires(page)).toHaveText(['Alpha', 'Charlie', 'Delta']);
  if (estTelephone(page)) await verifierSansDebordement(page);
});

test('3 Personnes : menu « Trier par » (Nom, Organisation, Ville, Création) lié à la colonne, sens visible', async ({ page }) => {
  await creerOrganisation('o1', { nom: 'Fleurs de Provence' });
  await creerPersonne('p1', { nom: 'Zoé Lemaire', organisationId: 'o1', ville: 'Digne', creeLe: DATE(1) });
  await creerPersonne('p2', { nom: 'Adam Roux', ville: 'Manosque', creeLe: DATE(3) });
  await creerPersonne('p3', { nom: 'Élodie Blanc', ville: 'Apt', creeLe: DATE(2) });
  await creerPersonne('p4', { nom: 'Sans Date', ville: '', creeLe: null });
  await connecter(page);
  await allerA(page, 'Personnes');
  const noms = page.locator('.tableau-personnes tbody tr .cellule-nom > span:not(.avatar-initiales):not(.badge-opposition)');
  await expect(menuTri(page)).toBeVisible();
  await expect(optionsDuMenu(page)).toHaveText(['Trier par : Nom', 'Trier par : Organisation', 'Trier par : Ville', 'Trier par : Création']);
  await expect(menuTri(page)).toHaveValue('nom');
  await expect(noms).toHaveText(['Adam Roux', 'Élodie Blanc', 'Sans Date', 'Zoé Lemaire']); // départ inchangé, accents ignorés
  await expect(fleche(page)).toHaveAttribute('data-sens', 'asc');
  await expect(fleche(page)).toHaveAccessibleName(/croissant/);
  await menuTri(page).selectOption('ville');
  await expect(noms).toHaveText(['Élodie Blanc', 'Zoé Lemaire', 'Adam Roux', 'Sans Date']); // ville vide à la fin
  await menuTri(page).selectOption('creation');
  await expect(noms).toHaveText(['Adam Roux', 'Élodie Blanc', 'Zoé Lemaire', 'Sans Date']); // récent d'abord, sans date à la fin
  await expect(fleche(page)).toHaveAttribute('data-sens', 'desc');
  await fleche(page).click();
  await expect(noms).toHaveText(['Zoé Lemaire', 'Élodie Blanc', 'Adam Roux', 'Sans Date']);
  await expect(fleche(page)).toHaveAttribute('data-sens', 'asc');
  await expect(fleche(page)).toHaveAccessibleName(/croissant/);
  await menuTri(page).selectOption('nom');
  // Sur téléphone, les en-têtes sont une rangée de pastilles qui défile : le clic de colonne et le menu restent un seul état.
  await page.locator('.tableau-personnes th button.tri', { hasText: 'Nom' }).click();
  await expect(menuTri(page)).toHaveValue('nom');
  await expect(fleche(page)).toHaveAttribute('data-sens', 'desc');
  await expect(page.locator('.tableau-personnes th[aria-sort="descending"]')).toContainText('Nom');
  await expect(noms).toHaveText(['Zoé Lemaire', 'Sans Date', 'Élodie Blanc', 'Adam Roux']);
  await page.locator('.tableau-personnes th button.tri', { hasText: 'Organisation' }).click();
  await expect(menuTri(page)).toHaveValue('organisation');
  await expect(noms.first()).toHaveText('Zoé Lemaire'); // la seule personne avec une organisation, les autres à la fin
  await page.locator('.tableau-personnes th button.tri', { hasText: 'Nom' }).click();
  await fleche(page).click();
  if (estTelephone(page)) await verifierSansDebordement(page);
  await capture(page, '3-personnes');
});

test('4 Organisations : menu « Trier par » (Nom, Ville, Secteur, Affaires en cours, Création) lié à la colonne', async ({ page }) => {
  await creerOrganisation('o1', { nom: 'Bio Sud', ville: 'Apt', secteur: 'Agro', creeLe: DATE(1) });
  await creerOrganisation('o2', { nom: 'Atelier Nord', ville: 'Digne', secteur: 'Art', creeLe: DATE(3) });
  await creerOrganisation('o3', { nom: 'Zèbre SA', ville: '', secteur: '', creeLe: null });
  await creerAffaire('a1', { titre: 'A1', organisationId: 'o1' });
  await creerAffaire('a2', { titre: 'A2', organisationId: 'o1' });
  await creerAffaire('a3', { titre: 'A3', organisationId: 'o2' });
  await connecter(page);
  await allerA(page, 'Organisations');
  const noms = page.locator('.tableau-organisations tbody tr .cellule-nom > span:not(.avatar-initiales):not(.badge-opposition)');
  await expect(menuTri(page)).toBeVisible();
  await expect(optionsDuMenu(page)).toHaveText(['Trier par : Nom', 'Trier par : Ville', 'Trier par : Secteur', 'Trier par : Affaires en cours', 'Trier par : Création']);
  await expect(noms).toHaveText(['Atelier Nord', 'Bio Sud', 'Zèbre SA']); // départ inchangé
  await menuTri(page).selectOption('affaires');
  await expect(noms).toHaveText(['Bio Sud', 'Atelier Nord', 'Zèbre SA']); // le plus d'affaires en cours d'abord
  await fleche(page).click();
  await expect(noms).toHaveText(['Zèbre SA', 'Atelier Nord', 'Bio Sud']);
  await menuTri(page).selectOption('secteur');
  await expect(noms).toHaveText(['Bio Sud', 'Atelier Nord', 'Zèbre SA']); // secteur vide à la fin
  await menuTri(page).selectOption('ville');
  await expect(noms).toHaveText(['Bio Sud', 'Atelier Nord', 'Zèbre SA']);
  await menuTri(page).selectOption('creation');
  await expect(noms).toHaveText(['Atelier Nord', 'Bio Sud', 'Zèbre SA']); // récent d'abord, sans date à la fin
  await page.locator('.tableau-organisations th button.tri', { hasText: 'Affaires en cours' }).click();
  await expect(menuTri(page)).toHaveValue('affaires');
  await expect(noms).toHaveText(['Bio Sud', 'Atelier Nord', 'Zèbre SA']);
  await expect(page.locator('.tableau-organisations th[aria-sort="descending"]')).toContainText('Affaires en cours');
  if (estTelephone(page)) await verifierSansDebordement(page);
  await capture(page, '4-organisations');
});

test('5 Le choix de tri est mémorisé par écran, relu après rechargement, et l\'ancien choix des affaires est repris', async ({ page }) => {
  await projetsDeTest();
  await affairesDeTest();
  await creerOrganisation('o1', { nom: 'Bio Sud' });
  await creerOrganisation('o2', { nom: 'Atelier Nord' });
  await creerPersonne('p1', { nom: 'Zoé Lemaire' });
  await creerPersonne('p2', { nom: 'Adam Roux' });
  await connecter(page);
  // Ancienne préférence des affaires (Kanban seulement) : reprise sans perte, sans réécrire l'ancienne clé.
  await poserPreference(page, 'tri.kanban', 'montant');
  await recharger(page);
  await allerA(page, 'Affaires');
  await expect(menuTri(page)).toHaveValue('montant');
  await expect(titresKanbanAffaires(page)).toHaveText(['Alpha', 'Delta', 'Charlie']);
  await menuTri(page).selectOption('titre');
  expect(JSON.parse(await preference(page, 'tri.affaires'))).toEqual({ critere: 'titre', sens: 'asc' });
  expect(await preference(page, 'tri.kanban')).toBe('montant');
  // Un sens inversé est mémorisé aussi.
  await fleche(page).click();
  expect(JSON.parse(await preference(page, 'tri.affaires'))).toEqual({ critere: 'titre', sens: 'desc' });
  await allerA(page, 'Projets');
  await menuTri(page).selectOption('creation');
  await allerA(page, 'Personnes');
  await menuTri(page).selectOption('ville');
  await allerA(page, 'Organisations');
  await menuTri(page).selectOption('affaires');
  // Clés distinctes par écran.
  expect(JSON.parse(await preference(page, 'tri.projets'))).toEqual({ critere: 'creation', sens: 'desc' });
  expect(JSON.parse(await preference(page, 'tri.personnes'))).toEqual({ critere: 'ville', sens: 'asc' });
  expect(JSON.parse(await preference(page, 'tri.organisations'))).toEqual({ critere: 'affaires', sens: 'desc' });
  // Après rechargement, chaque écran retrouve son tri.
  await recharger(page);
  await allerA(page, 'Affaires');
  await expect(menuTri(page)).toHaveValue('titre');
  await expect(fleche(page)).toHaveAttribute('data-sens', 'desc');
  await expect(titresKanbanAffaires(page)).toHaveText(['Delta', 'Charlie', 'Alpha']);
  await allerA(page, 'Projets');
  await expect(menuTri(page)).toHaveValue('creation');
  await expect(titresKanbanProjets(page)).toHaveText(['Alpha', 'Gamma', 'Beta', 'Émile']);
  await allerA(page, 'Personnes');
  await expect(menuTri(page)).toHaveValue('ville');
  await allerA(page, 'Organisations');
  await expect(menuTri(page)).toHaveValue('affaires');
  await capture(page, '5-memorise');
  // Valeur abîmée : retour au tri de départ de l'écran, sans erreur.
  await poserPreference(page, 'tri.projets', '{pas du json');
  await poserPreference(page, 'tri.personnes', JSON.stringify({ critere: 'inconnu', sens: 'asc' }));
  await recharger(page);
  await allerA(page, 'Projets');
  await expect(menuTri(page)).toHaveValue('titre');
  await expect(titresKanbanProjets(page)).toHaveText(['Alpha', 'Beta', 'Émile', 'Gamma']);
  await allerA(page, 'Personnes');
  await expect(menuTri(page)).toHaveValue('nom');
});

test('6 Le même menu partout : un seul composant, libellés « Trier par : <critère> », et sans données le menu est présent et inoffensif', async ({ page }) => {
  await connecter(page);
  for (const [ecran, tableau] of [['Affaires', null], ['Projets', null], ['Personnes', '.tableau-personnes'], ['Organisations', '.tableau-organisations']]) {
    await allerA(page, ecran);
    await expect(page.locator('.selecteur-tri')).toHaveCount(1);
    await expect(menuTri(page)).toBeVisible();
    const textes = await optionsDuMenu(page).allTextContents();
    expect(textes.length).toBeGreaterThanOrEqual(4);
    for (const t of textes) expect(t).toMatch(/^Trier par : \S/);
    await expect(fleche(page)).toBeVisible();
    // Liste vide : on change de critère et de sens sans erreur, rien d'affiché à trier.
    const erreurs = [];
    page.on('pageerror', (e) => erreurs.push(e.message));
    await menuTri(page).selectOption({ index: 1 });
    await fleche(page).click();
    await expect(menuTri(page)).toBeVisible();
    if (tableau) await expect(page.locator(tableau)).toHaveCount(0);
    expect(erreurs).toEqual([]);
    if (estTelephone(page)) await verifierSansDebordement(page);
  }
  // Le mot CRM n'est jamais écrit dans le menu.
  await expect(page.locator('.selecteur-tri')).not.toContainText(/crm/i);
  await capture(page, '6-liste-vide');
});
