// Ajouts cohérents (I17, I12, I11) : Montant fantôme de l'affaire, « Factures  + Ajouter », tâche ajoutée depuis une seule ligne.
// Les captures (format ordinateur) vont dans tests/e2e/captures/ajouts-coherents/.
import { fileURLToPath } from 'node:url';
import { test, expect, attendreCalme, connecter, creerAffaire, creerProjet, creerTacheProjet, lireDocument, listerDocuments, jour } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/ajouts-coherents/', import.meta.url));
async function capturer(page, info, nom) {
  if (info.project.name !== 'ordinateur') return;
  await page.screenshot({ path: `${DOSSIER}${nom}.png`, fullPage: true });
}
async function ouvrir(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }

// Dans ce bac à sable, le script de Google est inaccessible : on le remplace par un fichier vide.
test.beforeEach(async ({ page }) => {
  await page.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
});

test('I17 Montant estimé de l’affaire : un tiret « — » gris quand il est vide (jamais de chiffre inventé, rien d’enregistré), saisie au clic, euros une fois rempli', async ({ page }, info) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await connecter(page);
  await ouvrir(page, '#/crm/affaires/a1');
  const zone = page.locator('.fiche-tete .fiche-montant');
  const fantome = zone.locator('.prop-fantome');
  await expect(fantome).toHaveText('—');
  await expect(zone.locator('[data-role="libelle-montant"]')).toHaveText('Montant estimé');
  const gris = await fantome.evaluate((el) => getComputedStyle(el).color);
  const jaune = await page.locator('.prop-vide:not(.prop-fantome)').first().evaluate((el) => getComputedStyle(el).color);
  expect(gris).not.toBe(jaune);
  expect((await lireDocument('crm_affaires/a1')).montant ?? null).toBeNull(); // le fantôme n'est jamais une valeur
  await capturer(page, info, 'I17-montant-tiret');
  // clic puis Échap : rien n'est enregistré et le fantôme reste là
  await fantome.click();
  await page.getByLabel('Montant estimé', { exact: true }).press('Escape');
  await expect(zone.locator('.prop-fantome')).toBeVisible();
  expect((await lireDocument('crm_affaires/a1')).montant ?? null).toBeNull();
  await fantome.click();
  await page.getByLabel('Montant estimé', { exact: true }).fill('1500');
  await page.getByLabel('Montant estimé', { exact: true }).press('Enter');
  await expect.poll(async () => (await lireDocument('crm_affaires/a1')).montant).toBe(1500);
  await expect(zone).toContainText(/1\s?500\s€/);
  await expect(zone.locator('.prop-fantome')).toHaveCount(0);
});

test('I12 Factures : ligne « Factures  + Ajouter », le formulaire n’apparaît qu’après le clic, une facture à la fois ; une erreur garde le formulaire ouvert', async ({ page }, info) => {
  await creerProjet('pr1', { titre: 'Audit Lilas', phase: 'livraison' });
  await connecter(page);
  await ouvrir(page, '#/projets/projets/pr1');
  const section = page.locator('[data-section="projet-factures"]');
  const ligne = section.locator('.prop-ajouter');
  await expect(ligne).toContainText('Factures');
  await expect(ligne.locator('.prop-vide')).toContainText('Ajouter');
  await expect(section.locator('.ligne-ajout-facture')).toBeHidden();
  await expect(section).toContainText('Aucune facture'); // cas vide conservé
  await capturer(page, info, 'I12-factures-ligne-ajouter');
  await ligne.locator('.prop-vide').click();
  await expect(section.locator('.ligne-ajout-facture')).toBeVisible();
  // cas d'erreur : montant vide, le formulaire reste ouvert et rien n'est écrit
  await page.getByLabel('Libellé de la facture').fill('Acompte');
  await page.locator('[data-action="ajouter-facture"]').click();
  await expect(page.locator('.toast-erreur').last()).toBeVisible();
  await expect(section.locator('.ligne-ajout-facture')).toBeVisible();
  expect(((await lireDocument('projets_projets/pr1')).factures ?? [])).toHaveLength(0);
  await page.getByLabel('Montant de la facture en euros').fill('300');
  await page.locator('[data-action="ajouter-facture"]').click();
  await expect(section.locator('.ligne-facture', { hasText: 'Acompte' })).toBeVisible();
  await expect(section.locator('.ligne-ajout-facture')).toBeHidden(); // une à une : le formulaire se referme
  await expect(ligne).toBeVisible();
  await expect(page.locator('.toast')).toHaveCount(0, { timeout: 15000 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await capturer(page, info, 'I12-facture-ajoutee');
});

test('I11 Tâches : une seule ligne « Clique ici pour ajouter un livrable… », qui s’ouvre avec phase, dates rapides et date ; titre seul = phase en cours sans date ; bouton jaune « Enregistrer le livrable » seulement à l’ouverture', async ({ page }, info) => {
  await creerProjet('pr1', { titre: 'Audit des Lilas', phase: 'decouverte' });
  await creerTacheProjet('t0', { titre: 'Déjà là' });
  await connecter(page);
  await ouvrir(page, '#/projets/projets/pr1');
  const section = page.locator('[data-section="projet-taches"]');
  const champ = section.getByLabel('Nouveau livrable');
  await expect(champ).toHaveAttribute('placeholder', 'Clique ici pour ajouter un livrable…');
  await expect(section.getByLabel('Phase du livrable')).toBeHidden();
  await expect(section.locator('[data-date-rapide]').first()).toBeHidden();
  await expect(section.locator('.bouton-principal')).toBeHidden(); // le bouton jaune n'apparaît qu'à l'ouverture de la ligne
  await capturer(page, info, 'I11-tache-ligne-fermee');
  await champ.click();
  await expect(section.getByLabel('Phase du livrable')).toBeVisible();
  await expect(section.getByLabel('Phase du livrable')).toHaveValue('decouverte'); // phase en cours par défaut
  await expect(section.locator('[data-date-rapide]').first()).toBeVisible();
  await expect(section.getByLabel('Date', { exact: true })).toBeVisible();
  await expect(section.locator('[data-action="ajouter-tache"]')).toHaveText('Enregistrer le livrable');
  await expect(section.locator('[data-action="ajouter-tache"]')).toBeDisabled(); // nuit 4 : grisé sans texte, jaune plein dès la première lettre
  await capturer(page, info, 'I11-tache-zone-ouverte');
  // cas d'erreur : titre vide refusé (Entrée)
  await champ.press('Enter');
  await expect(page.locator('.toast', { hasText: 'Le titre est obligatoire.' })).toBeVisible();
  expect(await listerDocuments('projets_taches')).toHaveLength(1);
  // titre seul + Entrée : phase en cours, sans date
  await champ.fill('Appeler le client');
  await expect(section.locator('.bouton-principal')).toHaveText('Enregistrer le livrable'); // N2 : jaune plein une fois du texte saisi
  await champ.press('Enter');
  await expect.poll(async () => (await listerDocuments('projets_taches')).length).toBe(2);
  const tout = async () => (await listerDocuments('projets_taches')).map((d) => d.data ?? d);
  expect((await tout()).find((d) => d.titre === 'Appeler le client')).toMatchObject({ phase: 'decouverte', date: null });
  // avec une date rapide
  await champ.fill('Envoyer le devis');
  await section.locator('[data-date-rapide="demain"]').click();
  await section.locator('[data-action="ajouter-tache"]').click();
  await expect.poll(async () => (await tout()).length).toBe(3);
  expect((await tout()).find((d) => d.titre === 'Envoyer le devis').date).toBe(jour(1));
});

test('I12 Factures : Annuler vide le formulaire (aucun brouillon ni montant rouge qui revient) et le formulaire prend la place de la ligne « + Ajouter »', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Audit Lilas', phase: 'livraison' });
  await connecter(page);
  await ouvrir(page, '#/projets/projets/pr1');
  const section = page.locator('[data-section="projet-factures"]');
  await section.locator('.prop-ajouter .prop-vide').click();
  const yLigne = await section.locator('.ligne-ajout-facture').evaluate((el) => el.getBoundingClientRect().top);
  const yTitre = await section.locator('.section-titre, h2, h3').first().evaluate((el) => el.getBoundingClientRect().bottom);
  expect(yLigne - yTitre).toBeLessThan(120); // juste sous le titre, là où était la ligne
  await page.getByLabel('Libellé de la facture').fill('Brouillon');
  await page.locator('[data-action="ajouter-facture"]').click(); // montant manquant : champ rouge
  await expect(page.getByLabel('Montant de la facture en euros')).toHaveClass(/invalide/);
  await page.locator('[data-action="annuler-ajout-facture"]').click();
  await section.locator('.prop-ajouter .prop-vide').click();
  await expect(page.getByLabel('Libellé de la facture')).toHaveValue('');
  await expect(page.getByLabel('Montant de la facture en euros')).not.toHaveClass(/invalide/);
});

test('I11 Tâches : Échap sur un titre vide remet la date et la phase à zéro', async ({ page }) => {
  await creerProjet('pr1', { titre: 'Audit des Lilas', phase: 'decouverte' });
  await connecter(page);
  await ouvrir(page, '#/projets/projets/pr1');
  const section = page.locator('[data-section="projet-taches"]');
  const champ = section.getByLabel('Nouveau livrable');
  await champ.click();
  await section.locator('[data-date-rapide="demain"]').click();
  await section.getByLabel('Phase du livrable').selectOption('livraison');
  await champ.click();
  await champ.press('Escape');
  await expect(section.getByLabel('Phase du livrable')).toBeHidden();
  await champ.click();
  await expect(section.getByLabel('Date', { exact: true })).toHaveValue('');
  await expect(section.getByLabel('Phase du livrable')).toHaveValue('decouverte');
});
