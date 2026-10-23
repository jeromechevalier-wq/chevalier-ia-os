// Source et Ville (nuit du 22 au 23/10/2026) : L1 à L4 (écran). L5 (serveur MCP) est dans tests/source-ville.test.js.
// Décision de Jérôme : la Source est une liste fixe (Réglages, « Sources ») ; la Ville est un texte libre propre.
// Un test par critère (nom commençant par le numéro) et UNE capture par critère dans tests/e2e/captures/source-ville/.
import { test, expect, attendreCalme, connecter, allerA, creerPersonne, creerOrganisation, creerAffaire, lireDocument, ecrireDocument, estTelephone } from './outils.js';

const CAPTURES = 'e2e/captures/source-ville';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
// Ces écrans n'utilisent pas Google : le script de l'API est remplacé par un fichier vide (sans réseau, il ne produit pas d'erreur de console).
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});
const dialogue = (page) => page.getByRole('dialog');
async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }
async function champDoc(chemin, cle, attendu) {
  await expect.poll(async () => (await lireDocument(chemin))?.[cle], { timeout: 10_000 }).toEqual(attendu);
}
const SOURCES = async () => (await lireDocument('crm_parametres/listes'))?.sources ?? [];

test('L1 fiche personne : la Source se choisit dans la liste des Réglages, sans « Nouvelle valeur » ; une ancienne valeur absente de la liste reste affichée (grisée) et n’est pas perdue', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Marie Durand', source: 'Recommandation de mon cousin Paul' });
  await creerPersonne('p2', { nom: 'Paul Martin' });
  await connecter(page);
  await expect.poll(async () => (await SOURCES()).length).toBeGreaterThan(0);
  const avant = await SOURCES();
  // Fiche sans source : la liste propose exactement les Réglages, rien d'autre, et aucune création.
  await aller(page, '#/crm/personnes/p2');
  const details = page.locator('.section[data-section="personne-details"]');
  await details.locator('.prop', { hasText: 'Source' }).getByRole('button', { name: /Ajouter/ }).click();
  const liste = details.getByLabel('Source', { exact: true });
  await expect(liste.locator('option')).toHaveText(['—', ...avant]);
  await expect(liste.locator('[data-action="creer-valeur"]')).toHaveCount(0);
  await liste.selectOption('LinkedIn');
  await champDoc('crm_personnes/p2', 'source', 'LinkedIn');
  // Fiche avec une ancienne phrase : affichée telle quelle, option grisée « (valeur à changer) », conservée si on referme sans choisir.
  await aller(page, '#/crm/personnes/p1');
  const detailsAncien = page.locator('.section[data-section="personne-details"]');
  const ligne = detailsAncien.locator('.prop', { hasText: 'Source' });
  await expect(ligne).toContainText('Recommandation de mon cousin Paul');
  await ligne.locator('.prop-modifier').click();
  const ancienne = detailsAncien.getByLabel('Source', { exact: true }).locator('option', { hasText: '(valeur à changer)' });
  await expect(ancienne).toHaveText('Recommandation de mon cousin Paul (valeur à changer)');
  await expect(ancienne).toBeDisabled();
  await capture(page, 'L1-valeur-a-changer');
  await page.keyboard.press('Escape');
  await expect(ligne).toContainText('Recommandation de mon cousin Paul');
  await champDoc('crm_personnes/p1', 'source', 'Recommandation de mon cousin Paul');
  // Rien n'a été recopié dans la liste des Réglages (l'ancienne copie automatique est supprimée).
  expect(await SOURCES()).toEqual(avant);
  // Choisir une vraie source remplace l'ancienne phrase.
  await ligne.locator('.prop-modifier').click();
  await detailsAncien.getByLabel('Source', { exact: true }).selectOption('Recommandation');
  await champDoc('crm_personnes/p1', 'source', 'Recommandation');
  expect(await SOURCES()).toEqual(avant);
});

test('L1 clic ailleurs (blur) : une ancienne valeur absente de la liste est conservée ; « flyer » pour « Flyer » n’est pas effacée et devient « Flyer »', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Marie Durand', source: 'Recommandation de mon cousin Paul' });
  await creerPersonne('p2', { nom: 'Paul Martin', source: 'flyer' });
  await connecter(page);
  await expect.poll(async () => (await SOURCES()).includes('Flyer')).toBe(true);
  const avant = await SOURCES();
  for (const [id, valeurFinale] of [['p1', 'Recommandation de mon cousin Paul'], ['p2', 'Flyer']]) {
    await aller(page, `#/crm/personnes/${id}`);
    const details = page.locator('.section[data-section="personne-details"]');
    const ligne = details.locator('.prop', { hasText: 'Source' });
    await ligne.locator('.prop-modifier').click();
    await expect(details.getByLabel('Source', { exact: true })).toBeVisible();
    await details.locator('.prop', { hasText: 'Prénom' }).locator('.prop-libelle').click(); // clic ailleurs : le champ perd le focus
    await expect(details.getByLabel('Source', { exact: true })).toHaveCount(0);
    await expect(ligne).toContainText(valeurFinale);
    await champDoc(`crm_personnes/${id}`, 'source', valeurFinale);
  }
  expect(await SOURCES()).toEqual(avant);
});

test('L1 fiche affaire : même liste fermée ; liste des Réglages vide = la liste dit où en ajouter (cas vide)', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Site de la boulangerie', source: 'Bouche à oreille' });
  await connecter(page);
  await expect.poll(async () => (await SOURCES()).length).toBeGreaterThan(0);
  await aller(page, '#/crm/affaires/a1');
  const details = page.locator('.section[data-section="affaire-details"]');
  const ligne = details.locator('.prop', { hasText: 'Source' });
  await expect(ligne).toContainText('Bouche à oreille');
  await ligne.locator('.prop-modifier').click();
  await expect(details.getByLabel('Source', { exact: true }).locator('option', { hasText: '(valeur à changer)' })).toBeDisabled();
  await expect(details.getByLabel('Source', { exact: true }).locator('option', { hasText: 'Nouvelle valeur' })).toHaveCount(0);
  await page.keyboard.press('Escape');
  // Cas vide : plus aucune source dans les Réglages.
  await ecrireDocument('crm_parametres/listes', { secteurs: [], sources: [] });
  await expect.poll(async () => (await SOURCES()).length).toBe(0);
  await aller(page, '#/crm/affaires/a1');
  await ligne.locator('.prop-modifier').click();
  const options = details.getByLabel('Source', { exact: true }).locator('option');
  await expect(options.last()).toHaveText('Aucune source dans la liste : ajoute-en dans Réglages, Sources.');
  await expect(options.last()).toBeDisabled();
  await capture(page, 'L1-liste-vide');
});

test('L2 le filtre « Source » ne propose que la liste des Réglages (personnes et affaires), jamais une valeur tapée dans une fiche', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Marie Durand', source: 'Recommandation de mon cousin Paul' });
  await creerPersonne('p2', { nom: 'Paul Martin', source: 'Flyer' });
  await creerAffaire('a1', { titre: 'Site de la boulangerie', source: 'Salon du livre' });
  await connecter(page);
  await expect.poll(async () => (await SOURCES()).length).toBeGreaterThan(0);
  const reglages = await SOURCES();
  for (const [ecran, ligneTableau] of [['Personnes', '.tableau-personnes tbody tr'], ['Affaires', null]]) {
    await allerA(page, ecran);
    await page.locator('[data-action="filtres"]').click();
    const cases = dialogue(page).locator('input[data-cle="sources"]');
    await expect(cases).toHaveCount(reglages.length);
    expect(await cases.evaluateAll((l) => l.map((x) => x.dataset.valeur).sort())).toEqual([...reglages].sort());
    await expect(dialogue(page)).not.toContainText('Recommandation de mon cousin Paul');
    await expect(dialogue(page)).not.toContainText('Salon du livre');
    if (ecran === 'Personnes') await capture(page, 'L2-filtre-source');
    await page.keyboard.press('Escape');
    if (ligneTableau) await expect(page.locator(ligneTableau)).toHaveCount(2);
  }
});

test('L3 le filtre « Ville » regroupe « manosque », « Manosque », « Manosque  » (espace en trop) et les accents en UNE case, au libellé le plus fréquent ; la cocher retrouve toutes les variantes', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Alice Un', ville: 'Manosque' });
  await creerPersonne('p2', { nom: 'Bruno Deux', ville: 'Manosque' });
  await creerPersonne('p3', { nom: 'Chloé Trois', ville: 'manosque' });
  await creerPersonne('p4', { nom: 'Denis Quatre', ville: 'Manosque  ' });
  await creerPersonne('p5', { nom: 'Éric Cinq', ville: 'Mànosque' });
  await creerPersonne('p6', { nom: 'Fanny Six', ville: 'Digne' });
  await creerOrganisation('o1', { nom: 'Fleurs', ville: 'MANOSQUE' });
  await creerOrganisation('o2', { nom: 'Pain', ville: 'Digne' });
  await connecter(page);
  await allerA(page, 'Personnes');
  await expect(page.locator('.tableau-personnes tbody tr')).toHaveCount(6);
  await page.locator('[data-action="filtres"]').click();
  const groupe = dialogue(page).locator('fieldset', { hasText: 'Ville' });
  await expect(groupe.locator('label.case')).toHaveText(['Digne', 'Manosque']);
  await capture(page, 'L3-filtre-ville');
  await groupe.locator('input[data-valeur="manosque"]').check();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('.tableau-personnes tbody tr')).toHaveCount(5);
  await expect(page.locator('.tableau-personnes')).not.toContainText('Fanny Six');
  await expect(page.locator('.pastille-filtre')).toHaveText(/Ville : Manosque/);
  // Organisations : « MANOSQUE » est seule de sa forme, la case porte son libellé.
  await allerA(page, 'Organisations');
  await page.locator('[data-action="filtres"]').click();
  const groupeOrgs = dialogue(page).locator('fieldset', { hasText: 'Ville' });
  await expect(groupeOrgs.locator('label.case')).toHaveText(['Digne', 'MANOSQUE']);
  await groupeOrgs.locator('input[data-valeur="manosque"]').check();
  await dialogue(page).getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('tbody tr')).toHaveCount(1);
});

test('L3 un filtre enregistré avec l’ancienne forme « Manosque » marche encore (case cochée, mêmes résultats)', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Alice Un', ville: 'manosque' });
  await creerPersonne('p2', { nom: 'Fanny Six', ville: 'Digne' });
  await connecter(page);
  await allerA(page, 'Personnes');
  await page.evaluate(() => { location.hash = '#/crm/personnes'; });
  await ecrireDocument('crm_parametres/filtres', { version: 2, items: [{ id: 'ancien', nom: 'Anciens de Manosque', liste: 'personnes', criteres: { villes: ['Manosque'] }, ordre: 1 }] });
  // Le menu se construit à l'ouverture avec les filtres déjà reçus : si la mise à jour en direct n'est pas arrivée, on le referme et on le rouvre.
  const entree = page.locator('.menu-pop').getByRole('menuitem', { name: 'Anciens de Manosque' });
  await expect(async () => {
    await page.locator('[data-action="filtres-enregistres"]').click();
    await expect(entree).toBeVisible({ timeout: 2000 });
  }).toPass({ timeout: 20_000 });
  await entree.click();
  await expect(page.locator('.tableau-personnes tbody tr')).toHaveCount(1);
  await expect(page.locator('.tableau-personnes')).toContainText('Alice Un');
  await page.locator('[data-action="filtres"]').click();
  await expect(dialogue(page).locator('input[data-cle="villes"][data-valeur="manosque"]')).toBeChecked();
});

test('L4 en tapant une ville dans une fiche (personne, organisation), l’appli propose les villes déjà utilisées (regroupées), sans forcer le choix', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Alice Un', ville: 'Manosque' });
  await creerPersonne('p2', { nom: 'Bruno Deux', ville: 'manosque ' });
  await creerPersonne('p3', { nom: 'Chloé Trois' });
  await creerOrganisation('o1', { nom: 'Fleurs', ville: 'Digne-les-Bains' });
  await connecter(page);
  await aller(page, '#/crm/personnes/p3');
  const details = page.locator('.section[data-section="personne-details"]');
  await details.locator('.prop', { hasText: 'Ville' }).getByRole('button', { name: /Ajouter/ }).click();
  await details.getByLabel('Ville', { exact: true }).fill('man');
  const propositions = page.locator('.suggestions [role="option"]');
  await expect(propositions).toHaveCount(1); // « Manosque » et « manosque  » ne font qu'une proposition
  await expect(propositions.first()).toContainText('Manosque');
  await capture(page, 'L4-suggestions');
  await details.getByLabel('Ville', { exact: true }).fill('Gap'); // un nouveau nom reste possible
  await details.getByLabel('Ville', { exact: true }).press('Enter');
  await champDoc('crm_personnes/p3', 'ville', 'Gap');
  // Organisation : les villes des personnes et des organisations sont proposées ensemble.
  await creerOrganisation('o2', { nom: 'Pain' });
  await aller(page, '#/crm/organisations/o2');
  const detailsOrg = page.locator('.section[data-section="organisation-details"]');
  await detailsOrg.locator('.prop', { hasText: 'Ville' }).getByRole('button', { name: /Ajouter/ }).click();
  await detailsOrg.getByLabel('Ville', { exact: true }).fill('dig');
  await expect(page.locator('.suggestions [role="option"]')).toHaveText([/Digne-les-Bains/]);
});
