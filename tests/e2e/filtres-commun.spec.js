// Fenêtre « Filtres » commune (nuit du 22 au 23/10/2026) : J5a (un seul composant pour Personnes, Organisations, Affaires, Projets) et J1 (historique à cases à cocher, « OU », mémorisé jusqu'au rechargement).
// Un test par critère (nom commençant par le numéro) et UNE capture par critère dans tests/e2e/captures/filtres-commun/.
import { test, expect, attendreCalme, connecter, allerA, jour, choisirDansMenuUtilisateur, creerPersonne, creerOrganisation, creerAffaire, creerProjet, creerActivite, ecrireDocument, estTelephone, JEROME } from './outils.js';

const CAPTURES = 'e2e/captures/filtres-commun';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
// Ces écrans n'utilisent pas Google : le script de l'API est remplacé par un fichier vide (sans réseau, il ne produit pas d'erreur de console).
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});
const dialogue = (page) => page.getByRole('dialog');
async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }
const bouton = (page) => page.locator('[data-action="filtres"]');
const compte = (page) => bouton(page).locator('.compteur-filtres');

/** Ouvre la fenêtre, coche deux cases, Appliquer : le nombre de lignes et la pastille de compte sont corrects ; « Tout effacer » remet à zéro. */
async function deuxCasesPuisEffacer(page, { cle, valeurs, lignes, attendu, total, photo }) {
  await expect(lignes).toHaveCount(total);
  await expect(compte(page)).toHaveCount(0);
  await bouton(page).click();
  for (const v of valeurs) await dialogue(page).locator(`input[data-cle="${cle}"][data-valeur="${v}"]`).check();
  if (photo) await capture(page, photo);
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  await expect(lignes).toHaveCount(attendu);
  await expect(compte(page)).toHaveText('2');
  await bouton(page).click();
  await dialogue(page).getByRole('button', { name: 'Tout effacer' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  await expect(lignes).toHaveCount(total);
  await expect(compte(page)).toHaveCount(0);
}

test('J5a Personnes, Organisations, Affaires et Projets : même fenêtre, deux cases cochées, « Appliquer » filtre (OU) et la pastille vaut 2 ; « Tout effacer » remet à zéro', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Alice Un', ville: 'Manosque' });
  await creerPersonne('p2', { nom: 'Bruno Deux', ville: 'Digne' });
  await creerPersonne('p3', { nom: 'Chloé Trois', ville: 'Gap' });
  await creerOrganisation('o1', { nom: 'Atelier Un', ville: 'Manosque' });
  await creerOrganisation('o2', { nom: 'Atelier Deux', ville: 'Digne' });
  await creerOrganisation('o3', { nom: 'Atelier Trois', ville: 'Gap' });
  await creerAffaire('a1', { titre: 'Affaire Un', etape: 'premier_contact' });
  await creerAffaire('a2', { titre: 'Affaire Deux', etape: 'proposition_envoyee' });
  await creerAffaire('a3', { titre: 'Affaire Trois', etape: 'gagne' });
  await creerProjet('pr1', { titre: 'Projet Un', phase: 'lancement' });
  await creerProjet('pr2', { titre: 'Projet Deux', phase: 'livraison' });
  await creerProjet('pr3', { titre: 'Projet Trois', phase: 'decouverte' });
  await connecter(page);
  await allerA(page, 'Personnes');
  await deuxCasesPuisEffacer(page, { cle: 'villes', valeurs: ['manosque', 'digne'], lignes: page.locator('.tableau-personnes tbody tr'), attendu: 2, total: 3 });
  await allerA(page, 'Organisations');
  await deuxCasesPuisEffacer(page, { cle: 'villes', valeurs: ['manosque', 'digne'], lignes: page.locator('.tableau-organisations tbody tr'), attendu: 2, total: 3 });
  await allerA(page, 'Affaires');
  await deuxCasesPuisEffacer(page, { cle: 'etapes', valeurs: ['premier_contact', 'proposition_envoyee'], lignes: page.locator('.carte-affaire'), attendu: 2, total: 3 });
  await allerA(page, 'Projets');
  await deuxCasesPuisEffacer(page, { cle: 'phases', valeurs: ['lancement', 'livraison'], lignes: page.locator('.carte-projet'), attendu: 2, total: 3, photo: 'J5a-projets' });
});

/** Deux fiches personne avec chacune une activité faite, une note et un document joint : de quoi filtrer. */
async function fichesPleines() {
  for (const [id, nom] of [['p1', 'Marie Durand'], ['p2', 'Paul Martin']]) {
    await creerPersonne(id, { nom });
    await creerActivite(`act-${id}`, { personneId: id, titre: `Appeler ${nom}`, fait: true, dateFait: new Date() });
    await ecrireDocument(`crm_notes/n-${id}`, { texte: `Une note de ${nom}`, personneId: id, organisationId: null, affaireId: null, auteur: JEROME, creeLe: new Date(), modifieLe: new Date() });
    await ecrireDocument(`crm_evenements/e-${id}`, { type: 'document', texte: `Document joint : Devis ${nom}`, personneId: id, organisationId: null, affaireId: null, auteur: JEROME, date: new Date() });
  }
}
const lignes = (page) => page.locator('.historique .fil-ligne');
const boutonHistorique = (page) => page.locator('.historique [data-action="filtres"]');
const compteHistorique = (page) => boutonHistorique(page).locator('.compteur-filtres');

test('J1 historique : cocher Notes + Documents montre la note et le document (OU), pastille 2 ; retirer « Notes » ne laisse que Documents ; le filtre suit sur une autre fiche et disparaît au rechargement', async ({ page }) => {
  await fichesPleines();
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  await expect(lignes(page)).toHaveCount(3);
  await boutonHistorique(page).click();
  await dialogue(page).locator('input[data-cle="types"][data-valeur="notes"]').check();
  await dialogue(page).locator('input[data-cle="types"][data-valeur="documents"]').check();
  await expect(lignes(page)).toHaveCount(3); // rien n'est appliqué avant « Appliquer »
  await capture(page, 'J1-fenetre');
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(dialogue(page)).toHaveCount(0);
  await expect(lignes(page)).toHaveCount(2);
  await expect(page.locator('.historique')).toContainText('Une note de Marie Durand');
  await expect(page.locator('.historique')).toContainText('Document joint : Devis Marie Durand');
  await expect(page.locator('.historique')).not.toContainText('Appeler Marie Durand');
  await expect(compteHistorique(page)).toHaveText('2');
  await expect(page.locator('.historique .pastille-filtre')).toHaveText(['Notes', 'Documents']);
  await capture(page, 'J1-filtre-actif');
  await page.getByRole('button', { name: 'Retirer le filtre : Notes' }).click();
  await expect(lignes(page)).toHaveCount(1);
  await expect(lignes(page)).toContainText('Document joint');
  await expect(compteHistorique(page)).toHaveText('1');
  // une autre fiche garde le même filtre
  await aller(page, '#/crm/personnes/p2');
  await expect(lignes(page)).toHaveCount(1);
  await expect(lignes(page)).toContainText('Document joint : Devis Paul Martin');
  await expect(compteHistorique(page)).toHaveText('1');
  // recharger la page remet tout à zéro
  await page.reload();
  await attendreCalme(page);
  await expect(lignes(page)).toHaveCount(3);
  await expect(compteHistorique(page)).toHaveCount(0);
});

test('J1 « Tout effacer » décoche tout (fenêtre et pastilles) ; deux filtres actifs montrent « Tout effacer » sous le titre ; cas vide : « Rien à afficher avec ces filtres. Décoche un filtre. »', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Marie Durand' });
  await ecrireDocument('crm_notes/n1', { texte: 'Seule note', personneId: 'p1', organisationId: null, affaireId: null, auteur: JEROME, creeLe: new Date(), modifieLe: new Date() });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  await expect(lignes(page)).toHaveCount(1);
  await boutonHistorique(page).click();
  await dialogue(page).locator('input[data-cle="types"][data-valeur="documents"]').check();
  await dialogue(page).locator('input[data-cle="types"][data-valeur="activites"]').check();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(lignes(page)).toHaveCount(0);
  await expect(page.locator('.historique')).toContainText('Rien à afficher avec ces filtres. Décoche un filtre.');
  await expect(compteHistorique(page)).toHaveText('2');
  await capture(page, 'J1-vide');
  await page.locator('.historique .pastilles-actives').getByRole('button', { name: 'Tout effacer' }).click();
  await expect(lignes(page)).toHaveCount(1);
  await expect(compteHistorique(page)).toHaveCount(0);
  await boutonHistorique(page).click();
  await dialogue(page).locator('input[data-cle="types"][data-valeur="notes"]').check();
  await dialogue(page).getByRole('button', { name: 'Tout effacer' }).click();
  await expect(lignes(page)).toHaveCount(1);
  await expect(compteHistorique(page)).toHaveCount(0);
  await boutonHistorique(page).click();
  await expect(dialogue(page).locator('input[data-cle="types"]:checked')).toHaveCount(0);
});

test('J1 clavier : après la croix d’une pastille ou « Tout effacer » sous le titre, le focus revient sur le bouton « Filtres »', async ({ page }) => {
  await fichesPleines();
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  await boutonHistorique(page).click();
  for (const v of ['notes', 'documents', 'activites']) await dialogue(page).locator(`input[data-cle="types"][data-valeur="${v}"]`).check();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(lignes(page)).toHaveCount(3);
  await page.getByRole('button', { name: 'Retirer le filtre : Notes' }).focus();
  await page.keyboard.press('Enter');
  await expect(lignes(page)).toHaveCount(2);
  await expect(boutonHistorique(page)).toBeFocused();
  await page.locator('.historique .pastilles-actives').getByRole('button', { name: 'Tout effacer' }).focus();
  await page.keyboard.press('Enter');
  await expect(lignes(page)).toHaveCount(3);
  await expect(boutonHistorique(page)).toBeFocused();
});

test('J1 changement de compte : après déconnexion puis connexion dans le même onglet, le filtre de l’historique est vide', async ({ page }) => {
  await fichesPleines();
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  await boutonHistorique(page).click();
  await dialogue(page).locator('input[data-cle="types"][data-valeur="notes"]').check();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(lignes(page)).toHaveCount(1);
  await choisirDansMenuUtilisateur(page, 'Se déconnecter');
  await expect(page.getByRole('button', { name: 'Se connecter avec Google' })).toBeVisible();
  await page.evaluate((e) => window.__chevalierTest.connecter(e, true), JEROME);
  await expect(page.locator('.coquille')).toBeVisible();
  await aller(page, '#/crm/personnes/p1');
  await expect(lignes(page)).toHaveCount(3);
  await expect(compteHistorique(page)).toHaveCount(0);
});

test('J5a Personnes filtrée par une organisation (sélecteur d’organisations) et Projets filtrés par « En retard », par la fenêtre commune', async ({ page }) => {
  await creerOrganisation('o1', { nom: 'Atelier Un' });
  await creerOrganisation('o2', { nom: 'Atelier Deux' });
  await creerPersonne('p1', { nom: 'Alice Un', organisationId: 'o1' });
  await creerPersonne('p2', { nom: 'Bruno Deux', organisationId: 'o2' });
  await creerPersonne('p3', { nom: 'Chloé Trois' });
  await creerProjet('pr1', { titre: 'Projet à l’heure', phase: 'lancement' });
  await creerProjet('pr2', { titre: 'Projet en retard', phase: 'livraison', dateFin: jour(-3) });
  await connecter(page);
  await allerA(page, 'Personnes');
  await expect(page.locator('.tableau-personnes tbody tr')).toHaveCount(3);
  await bouton(page).click();
  await dialogue(page).getByRole('combobox', { name: 'Organisations' }).fill('Atelier Un');
  await page.locator('.suggestions [role="option"]').first().click();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('.tableau-personnes tbody tr')).toHaveCount(1);
  await expect(page.locator('.tableau-personnes tbody tr')).toContainText('Alice Un');
  await expect(compte(page)).toHaveText('1');
  await bouton(page).click();
  await dialogue(page).getByRole('button', { name: 'Tout effacer' }).click();
  await expect(page.locator('.tableau-personnes tbody tr')).toHaveCount(3);
  await allerA(page, 'Projets');
  await expect(page.locator('.carte-projet')).toHaveCount(2);
  await bouton(page).click();
  await dialogue(page).locator('input[data-cle="enRetard"]').check();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('.carte-projet')).toHaveCount(1);
  await expect(page.locator('.carte-projet[data-projet="pr2"]')).toBeVisible();
  await expect(compte(page)).toHaveText('1');
});

/** C20 : aucune erreur dans la console du navigateur pendant le parcours. */
test.afterEach(async ({ erreursConsole }, info) => {
  if (info.annotations.some((a) => a.type === 'erreurs-reseau-attendues')) return;
  const reelles = erreursConsole.filter((m) => !/status of 409 \(Conflict\).*documents:commit/.test(String(m)));
  expect(reelles, 'Erreurs dans la console du navigateur').toEqual([]);
});
