// Propriétaire dans le Résumé (nuit du 21/10/2026) : I7. Le menu « Propriétaire » quitte l'en-tête et passe dans le Résumé (affaire, projet)
// ou dans le premier bloc de champs (personne : « Détails » ; organisation : « Résumé »). Un test par fiche (nom commençant par I7), une capture par test
// dans tests/e2e/captures/proprietaire-resume/.
import { test, expect, attendreCalme, connecter, creerAffaire, creerProjet, creerPersonne, creerOrganisation, lireDocument, estTelephone, JEROME, CHARLES } from './outils.js';

const CAPTURES = 'e2e/captures/proprietaire-resume';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
// Ces écrans n'utilisent pas Google : le script de l'API est remplacé par un fichier vide (sans réseau, il ne produit pas d'erreur de console).
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});
async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }

for (const [nomFiche, creer, hash, chemin, bloc] of [
  ['affaire', () => creerAffaire('a1', { titre: 'Audit des Lilas' }), '#/crm/affaires/a1', 'crm_affaires/a1', 'Résumé'],
  ['projet', () => creerProjet('pr1', { titre: 'Refonte du site' }), '#/projets/projets/pr1', 'projets_projets/pr1', 'Résumé'],
  ['personne', () => creerPersonne('p1', { nom: 'Sophie Martin' }), '#/crm/personnes/p1', 'crm_personnes/p1', 'Détails'],
  ['organisation', () => creerOrganisation('o1', { nom: 'Atelier Lumière' }), '#/crm/organisations/o1', 'crm_organisations/o1', 'Résumé'],
]) {
  test(`I7 ${nomFiche} : « Propriétaire » n'est plus dans l'en-tête, c'est un menu modifiable du bloc « ${bloc} » ; le choix s'applique tout de suite`, async ({ page }) => {
    await creer();
    await connecter(page);
    await aller(page, hash);
    // Plus dans l'en-tête.
    await expect(page.locator('.fiche-tete')).not.toContainText('Propriétaire');
    await expect(page.locator('.fiche-tete select[aria-label="Propriétaire"]')).toHaveCount(0);
    // Dans le bloc, sous forme de ligne « Propriétaire » avec un menu déroulant.
    const ligne = page.locator('.fiche-gauche .prop[data-prop="proprietaire"]');
    await expect(ligne).toHaveCount(1);
    await expect(ligne.locator('.prop-libelle')).toHaveText('Propriétaire');
    // Le bloc qui la contient porte le bon titre.
    const titreBloc = await ligne.evaluate((el) => el.closest('section')?.querySelector('h2, h3, .section-titre, summary, button')?.textContent?.trim() ?? '');
    expect(titreBloc).toContain(bloc);
    const menu = ligne.locator('select');
    await expect(menu).toHaveValue(JEROME);
    // Mise à jour immédiate, sans rechargement de la page (la fiche peut se redessiner, le menu doit montrer le nouveau choix).
    await page.evaluate(() => { window.__sansRechargement = true; });
    await menu.selectOption(CHARLES);
    await expect.poll(async () => (await lireDocument(chemin)).proprietaire).toBe(CHARLES);
    await expect(menu).toHaveValue(CHARLES);
    expect(await page.evaluate(() => window.__sansRechargement === true)).toBe(true);
    // Téléphone et ordinateur : la ligne ne déborde pas (ni la ligne, ni la page).
    const depasse = await ligne.evaluate((el) => {
      const r = el.getBoundingClientRect();
      const s = el.querySelector('select').getBoundingClientRect();
      return r.right > window.innerWidth + 0.5 || s.right > window.innerWidth + 0.5 || document.documentElement.scrollWidth > window.innerWidth + 0.5;
    });
    expect(depasse).toBe(false);
    await ligne.scrollIntoViewIfNeeded();
    await capture(page, `I7-${nomFiche}`);
  });
}

test('I7 cas vide : un propriétaire inconnu de la liste est quand même proposé et sélectionné (rien ne casse)', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas', proprietaire: 'ancien.compte@exemple.fr' });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  const menu = page.locator('.prop[data-prop="proprietaire"] select');
  await expect(menu).toHaveValue('ancien.compte@exemple.fr');
  await expect(page.locator('.fiche-tete')).not.toContainText('Propriétaire');
});
