// N4 (nuit du 23/10/2026) : le Propriétaire se montre et se modifie comme la Source et la Priorité (valeur en texte + crayon, un clic ouvre la liste, le choix s'enregistre).
// Un test par critère, une capture par test dans tests/e2e/captures/proprietaire-comme-source/.
import { test, expect, attendreCalme, connecter, creerAffaire, creerProjet, creerPersonne, creerOrganisation, lireDocument, estTelephone, JEROME, CHARLES } from './outils.js';

const CAPTURES = 'e2e/captures/proprietaire-comme-source';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
// Ces écrans n'utilisent pas Google : le script de l'API est remplacé par un fichier vide (sans réseau, il ne produit pas d'erreur de console).
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});
async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }

for (const [nomFiche, creer, hash, chemin] of [
  ['affaire', () => creerAffaire('a1', { titre: 'Audit des Lilas' }), '#/crm/affaires/a1', 'crm_affaires/a1'],
  ['projet', () => creerProjet('pr1', { titre: 'Refonte du site' }), '#/projets/projets/pr1', 'projets_projets/pr1'],
  ['personne', () => creerPersonne('p1', { nom: 'Sophie Martin' }), '#/crm/personnes/p1', 'crm_personnes/p1'],
  ['organisation', () => creerOrganisation('o1', { nom: 'Atelier Lumière' }), '#/crm/organisations/o1', 'crm_organisations/o1'],
]) {
  test(`N4 ${nomFiche} : le Propriétaire est un texte avec un crayon (pas de menu natif au repos) ; le choix met à jour la valeur et la base`, async ({ page }) => {
    await creer();
    await connecter(page);
    await aller(page, hash);
    const ligne = page.locator('.fiche-gauche .prop[data-prop="proprietaire"]');
    await expect(ligne).toHaveCount(1);
    await expect(ligne.locator('.prop-libelle')).toHaveText('Propriétaire');
    // Au repos : la valeur en texte et un crayon, aucun menu natif.
    await expect(ligne.locator('select')).toHaveCount(0);
    await expect(ligne.locator('.prop-valeur')).toContainText('Jérôme');
    const crayon = ligne.locator('button.prop-modifier[aria-label="Modifier : Propriétaire"]');
    await expect(crayon).toHaveCount(1);
    // Même composant que la Source / Priorité : même structure de ligne.
    if (nomFiche === 'affaire') {
      const priorite = page.locator('.fiche-gauche .prop', { hasText: 'Priorité' }).first();
      expect(await ligne.evaluate((el) => el.className)).toBe(await priorite.evaluate((el) => el.className));
    }
    // Un clic sur le crayon ouvre la liste (Jérôme, Charles) ; choisir enregistre.
    await crayon.click();
    const menu = ligne.locator('select');
    await expect(menu.locator('option')).toHaveText(['Jérôme', 'Charles']);
    await menu.selectOption(CHARLES);
    await expect.poll(async () => (await lireDocument(chemin)).proprietaire).toBe(CHARLES);
    await expect(ligne.locator('.prop-valeur')).toContainText('Charles');
    await expect(ligne.locator('select')).toHaveCount(0);
    await attendreCalme(page);
    await ligne.scrollIntoViewIfNeeded();
    await capture(page, `N4-${nomFiche}`);
  });
}

test('N4 clavier : Entrée sur le crayon ouvre la liste, Échap l\'annule sans rien écrire, une flèche choisit et enregistre', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  const ligne = page.locator('.prop[data-prop="proprietaire"]');
  const crayon = ligne.locator('.prop-modifier');
  // Échap : rien n'est enregistré.
  await crayon.focus();
  await page.keyboard.press('Enter');
  const menu = ligne.locator('select');
  await expect(menu).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(ligne.locator('select')).toHaveCount(0);
  await expect(ligne.locator('.prop-valeur')).toContainText('Jérôme');
  expect((await lireDocument('crm_affaires/a1')).proprietaire).toBe(JEROME);
  // Entrée : le choix du clavier est enregistré.
  await ligne.locator('.prop-modifier').focus();
  await page.keyboard.press('Enter');
  await expect(ligne.locator('select')).toBeFocused();
  await page.keyboard.press('ArrowDown'); // sur une liste fermée, la flèche choisit et enregistre tout de suite (comme la Source)
  await expect.poll(async () => (await lireDocument('crm_affaires/a1')).proprietaire).toBe(CHARLES);
  await expect(ligne.locator('.prop-valeur')).toContainText('Charles');
  await capture(page, 'N4-clavier');
});

test('N4 téléphone/doigt : le crayon du Propriétaire est visible sans survol et se touche', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  const ligne = page.locator('.prop[data-prop="proprietaire"]');
  const crayon = ligne.locator('.prop-modifier');
  if (estTelephone(page)) await expect(crayon).toHaveCSS('opacity', '1');
  await ligne.scrollIntoViewIfNeeded();
  await crayon.click();
  await expect(ligne.locator('select')).toBeVisible();
  await capture(page, 'N4-doigt');
});

test('N4 cas vide : sans propriétaire la valeur est « — », la liste ne propose pas « — » comme choix', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas', proprietaire: '' });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  const ligne = page.locator('.prop[data-prop="proprietaire"]');
  await expect(ligne.locator('.prop-valeur')).toContainText('—');
  await ligne.locator('.prop-modifier').click();
  const menu = ligne.locator('select');
  await expect(menu.locator('option').first()).toHaveText('—');
  await expect(menu.locator('option').first()).toBeDisabled();
  await menu.selectOption(CHARLES);
  await expect.poll(async () => (await lireDocument('crm_affaires/a1')).proprietaire).toBe(CHARLES);
  await expect(ligne.locator('.prop-valeur')).toContainText('Charles');
  await attendreCalme(page);
  await ligne.scrollIntoViewIfNeeded();
  await capture(page, 'N4-cas-vide');
});

test('N4 cas d\'erreur : l\'enregistrement échoue, le message dit quoi faire et la valeur d\'origine revient', async ({ page }) => {
  await connecter(page);
  // Test du composant dans la page (une écriture Firestore qui échoue n'est pas simulable de façon fiable : hors ligne, le SDK met l'écriture en attente sans la refuser).
  await page.evaluate(async () => {
    const { selectProprietaire } = await import('/js/modules/crm/composants.js');
    const zone = document.createElement('div');
    zone.id = 'essai-proprietaire';
    zone.className = 'proprietes';
    zone.style.cssText = 'position:fixed;top:80px;left:80px;width:420px;z-index:50;background:var(--fond, #1c1c1e);padding:16px';
    zone.append(selectProprietaire({ valeur: 'jerome.chevalier@gmail.com', surChoix: async () => { throw new Error('refus'); } }));
    document.body.append(zone);
  });
  await page.locator('#essai-proprietaire .prop-modifier').click();
  await page.locator('#essai-proprietaire select').selectOption(CHARLES);
  await expect(page.getByText('Enregistrement impossible : vérifie ta connexion, puis choisis de nouveau.')).toBeVisible();
  await expect(page.locator('#essai-proprietaire .prop-valeur')).toContainText('Jérôme');
  await expect(page.locator('#essai-proprietaire select')).toHaveCount(0);
  await capture(page, 'N4-cas-erreur');
});
