// En-tête de la fiche d'affaire (04/11/2026) : un montant estimé vide n'est plus un libellé flottant au-dessus d'un tiret,
// mais un bouton « + Montant estimé » ; le libellé n'apparaît qu'avec un chiffre. Captures : tests/e2e/captures/fiche-affaire-montant-vide/.
import { mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme, creerAffaire, lireDocument } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/fiche-affaire-montant-vide/', import.meta.url));
async function capturer(page, info, nom) {
  await mkdir(DOSSIER, { recursive: true });
  await page.locator('.fiche-tete').screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, animations: 'disabled' });
}
async function ouvrir(page, id = 'a1') {
  await connecter(page, undefined, { route: `crm/affaires/${id}` });
  await expect(page.locator('.fiche-tete')).toBeVisible();
  await attendreCalme(page);
}
const montant = (page) => page.locator('.fiche-tete .fiche-montant');
const libelle = (page) => montant(page).locator('[data-role="libelle-montant"]');

// Dans ce bac à sable, le script de Google est inaccessible : on le remplace par un fichier vide.
test.beforeEach(async ({ page }) => {
  await page.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'application/javascript', body: '' }));
});

test('1 affaire sans montant : bouton « + Montant estimé », ni tiret ni libellé flottant ; clic et saisie de 100 : libellé au-dessus, « 100 € » et crayon', async ({ page }, info) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas', etape: 'proposition_envoyee' });
  await ouvrir(page);
  const bouton = montant(page).locator('.prop-vide');
  await expect(bouton).toHaveText('Montant estimé');
  await expect(bouton).toHaveAttribute('aria-label', 'Ajouter : Montant estimé');
  await expect(libelle(page)).toHaveCount(0);
  await expect(montant(page)).not.toContainText('—');
  await capturer(page, info, '1-vide');
  await bouton.click();
  const champ = page.getByLabel('Montant estimé', { exact: true });
  await champ.fill('100');
  await champ.press('Enter');
  await expect.poll(async () => (await lireDocument('crm_affaires/a1')).montant).toBe(100);
  await expect(libelle(page)).toHaveText('Montant estimé');
  await expect(montant(page)).toContainText(/100\s€/);
  await expect(montant(page).locator('.prop-modifier')).toHaveCount(1);
  await expect(montant(page).locator('.prop-vide')).toHaveCount(0);
});

test('3 montant renseigné : libellé et chiffre inchangés, aucun bouton « + »', async ({ page }, info) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas', etape: 'proposition_envoyee', montant: 100 });
  await ouvrir(page);
  await expect(libelle(page)).toHaveText('Montant estimé');
  await expect(montant(page)).toContainText(/100\s€/);
  await expect(montant(page).locator('.prop-vide')).toHaveCount(0);
  await capturer(page, info, '3-renseigne');
});

test('3 (devis) montant venu d’un devis : « Montant accepté HT » inchangé', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas', etape: 'proposition_envoyee', montantDevisHt: 100, montantDevisNature: 'accepte', montantDevisDetail: [{ numero: 'DEV-2026-10-27-011', version: 1, ht: 100, compte: true }] });
  await ouvrir(page);
  await expect(libelle(page)).toHaveText('Montant accepté HT');
  await expect(montant(page)).toContainText(/100\s€/);
  await expect(montant(page).locator('.prop-vide')).toHaveCount(0);
});

test('4 le bouton « + Montant estimé » est sur la ligne des boutons (ordinateur) ou au-dessus sans marge vide (téléphone)', async ({ page }, info) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas', etape: 'proposition_envoyee' });
  await ouvrir(page);
  const b = await montant(page).locator('.prop-vide').boundingBox();
  const premier = await page.locator('.fiche-actions > *').first().boundingBox();
  if (info.project.name === 'telephone') {
    expect(b.y + b.height).toBeLessThanOrEqual(premier.y + 1);
    expect(b.height).toBeGreaterThanOrEqual(43);
    const zone = await montant(page).boundingBox();
    expect(zone.y + zone.height - premier.y, 'pas de marge vide entre le bouton et les actions').toBeLessThanOrEqual(24);
  } else {
    expect(Math.abs((b.y + b.height / 2) - (premier.y + premier.height / 2))).toBeLessThanOrEqual(2);
    expect(b.x + b.width).toBeLessThanOrEqual(premier.x);
  }
  await capturer(page, info, '4-alignement');
});
