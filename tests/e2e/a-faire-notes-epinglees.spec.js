// Colonne de droite des fiches : le bloc « Points clés » devient « À faire » (activités seulement) et les notes épinglées ont leur propre section « Notes épinglées ».
// Captures (données fictives) dans tests/e2e/captures/a-faire-notes-epinglees/.
import {
  test, expect, attendreCalme, connecter, creerAffaire, creerProjet, creerActivite, ecrireDocument, lireDocument, estTelephone, jour, JEROME,
} from './outils.js';

const CAPTURES = 'e2e/captures/a-faire-notes-epinglees';
const capture = (page, nom, cible = page) => cible.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
// Sous 1024 px, .panneau-activite est en display: contents (pas de cadre à capturer) : on prend la grille de la fiche.
const cadreActivite = (page) => page.locator(estTelephone(page) ? '.fiche-grille' : '.panneau-activite');
async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }
async function note(id, texte, valeurs = {}) {
  await ecrireDocument(`crm_notes/${id}`, { texte, personneId: null, organisationId: null, affaireId: null, auteur: JEROME, creeLe: new Date(), modifieLe: new Date(), ...valeurs });
}

test.beforeEach(async ({ page }) => {
  await page.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
});

test('1 la fiche projet a un bloc « À faire » (plus de « Points clés ») avec ses activités, sous la section « Notes épinglées » qui contient la note épinglée', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Refonte du site' });
  await creerActivite('a1', { titre: 'Envoyer le devis', projetId: 'pr1', date: jour(1) });
  await note('n1', 'Le client veut une maquette avant vendredi.', { projetId: 'pr1', epinglee: true });
  await connecter(page);
  await aller(page, '#/projets/projets/pr1');
  await expect(page.locator('.notes-epinglees-zone h3')).toHaveText('Notes épinglées');
  await expect(page.locator('.points-cles h3')).toHaveText('À faire');
  await expect(page.locator('.fiche')).not.toContainText('Points clés');
  await expect(page.locator('.notes-epinglees-zone .note-epinglee')).toContainText('Le client veut une maquette');
  await expect(page.locator('.points-cles .note-epinglee')).toHaveCount(0);
  await expect(page.locator('.points-cles .activite')).toContainText('Envoyer le devis');
  const haut = await page.locator('.notes-epinglees-zone').boundingBox();
  const bas = await page.locator('.points-cles').boundingBox();
  expect(haut.y).toBeLessThan(bas.y); // « Notes épinglées » au-dessus de « À faire »
  await capture(page, '1-fiche-projet-avec-note', cadreActivite(page));
});

test('2 sans note épinglée : pas de section « Notes épinglées » (ni titre vide, ni bouton « Développer tout »), mais « À faire » est là, même vide', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await note('n1', 'Une note ordinaire', { affaireId: 'a1' });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  await expect(page.locator('.notes-epinglees-zone')).toBeHidden();
  await expect(page.locator('.notes-epinglees-zone')).toBeEmpty();
  await expect(page.getByRole('heading', { name: 'Notes épinglées' })).toHaveCount(0);
  await expect(page.locator('[data-action="developper-tout"]')).toHaveCount(0);
  await expect(page.locator('.points-cles h3')).toHaveText('À faire');
  await expect(page.locator('.points-cles')).toBeVisible();
  await expect(page.locator('.points-cles')).toContainText('Aucune activité à faire.');
  await capture(page, '2-fiche-affaire-sans-note-epinglee', cadreActivite(page));
});

test('3 la note épinglée garde Modifier (sur place), Désépingler et Développer tout ; la section disparaît quand on désépingle ; l’onglet Notes garde toutes les notes', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await note('n1', 'Première ligne.\nDeuxième.\nTroisième.\nQuatrième.\nCinquième.', { affaireId: 'a1', epinglee: true });
  await note('n2', 'Autre note du fil', { affaireId: 'a1' });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  const zone = page.locator('.notes-epinglees-zone');
  await expect(zone.locator('[data-action="developper-tout"]')).toHaveText('Développer tout');
  await zone.locator('[data-action="developper-tout"]').click();
  await expect(zone.locator('[data-action="developper-tout"]')).toHaveText('Réduire tout');
  await zone.locator('[data-action="modifier-note-epinglee"]').click();
  await zone.locator('textarea').fill('Texte corrigé sur place');
  await zone.getByRole('button', { name: 'Enregistrer' }).click();
  await expect.poll(async () => (await lireDocument('crm_notes/n1')).texte).toBe('Texte corrigé sur place');
  // L'onglet « Notes » : toutes les notes, avec Épingler / Désépingler.
  await expect(page.locator('.historique .fil-note')).toHaveCount(2);
  await expect(page.locator('.fil-note[data-note="n1"] [data-action="desepingler-note"]')).toBeVisible();
  await expect(page.locator('.fil-note[data-note="n2"] [data-action="epingler-note"]')).toBeVisible();
  await zone.locator('[data-action="desepingler-note"]').click();
  await expect.poll(async () => (await lireDocument('crm_notes/n1')).epinglee).toBe(false);
  await expect(zone).toBeHidden();
  await expect(page.locator('.points-cles h3')).toHaveText('À faire');
});

test('4 une note de départ vide fait apparaître la section « Notes épinglées » avec son champ ; une fois supprimée, la section disparaît', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await note('nv1', '', { affaireId: 'a1', epinglee: true });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  await expect(page.locator('.notes-epinglees-zone h3')).toHaveText('Notes épinglées');
  await expect(page.locator('.notes-epinglees-zone [data-champ="note-depart"]')).toBeVisible();
  await expect(page.locator('.notes-epinglees-zone [data-action="developper-tout"]')).toHaveCount(0);
  await page.locator('.notes-epinglees-zone [data-action="supprimer-note-vide"]').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Supprimer' }).click();
  await expect.poll(async () => lireDocument('crm_notes/nv1')).toBeNull();
  await expect(page.locator('.notes-epinglees-zone')).toBeHidden();
  await expect(page.locator('.points-cles h3')).toHaveText('À faire');
});

test('5 Accueil : le bloc s’appelle « À faire » et plus « Points clés »', async ({ page }) => {
  await creerActivite('x1', { titre: 'Relancer le devis', date: jour(0) });
  await connecter(page);
  const bloc = page.locator('.section-a-faire');
  await expect(bloc.locator('h2')).toHaveText('À faire');
  await expect(page.locator('body')).not.toContainText('Points clés');
  await expect(bloc).toContainText('Relancer le devis');
  await capture(page, '5-accueil-a-faire', bloc);
});
