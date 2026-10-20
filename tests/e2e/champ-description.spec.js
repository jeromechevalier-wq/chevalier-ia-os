// Champ texte libre des fiches Affaire et Projet (décidé le 19/10/2026) : sans titre, en haut de la colonne de gauche, texte d'invitation grisé qui disparaît au clic.
import { homedir } from 'node:os';
import { join } from 'node:path';
import { mkdirSync } from 'node:fs';
import { test, expect, attendreCalme, connecter, creerAffaire, creerProjet, lireDocument } from './outils.js';

const DOSSIER_CAPTURES = join(homedir(), 'chantiers-crm', 'captures-texte-libre');
mkdirSync(DOSSIER_CAPTURES, { recursive: true });
async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }

const FICHES = [
  { genre: 'affaire', hash: '#/crm/affaires/a1', collection: 'crm_affaires/a1', resume: 'affaire-resume', invitation: 'Cette affaire concerne… (le besoin du client, ce qu’on lui propose, où on en est)' },
  { genre: 'projet', hash: '#/projets/projets/pr1', collection: 'projets_projets/pr1', resume: 'projet-resume', invitation: 'Ce projet concerne… (ce qu’on construit, pour qui, où on en est)' },
];

for (const f of FICHES) {
  test(`TL4 ${f.genre} : champ vide = texte d’invitation grisé, sans titre, au-dessus du Résumé ; il disparaît au clic, revient si on ne tape rien`, async ({ page }, info) => {
    await creerAffaire('a1', { titre: 'Audit des Lilas' });
    await creerProjet('pr1', { titre: 'Refonte site' });
    await connecter(page);
    await aller(page, f.hash);
    const champ = page.locator('[data-champ="description"]');
    await expect(champ).toBeVisible();
    await expect(champ).toHaveAttribute('placeholder', f.invitation);
    await expect(champ).toHaveValue('');
    // Sans titre ni libellé visible : aucun <label> ni titre dans son bloc.
    await expect(page.locator('.description-fiche').locator('label, h1, h2, h3, .prop-libelle')).toHaveCount(0);
    // Tout en haut de la colonne de gauche, au-dessus du Résumé.
    const dessus = await page.evaluate((r) => document.querySelector('[data-champ="description"]').getBoundingClientRect().bottom <= document.querySelector(`[data-section="${r}"]`).getBoundingClientRect().top, f.resume);
    expect(dessus).toBe(true);
    expect(await page.evaluate(() => document.querySelector('.fiche-gauche').firstElementChild.className)).toContain('description-fiche');
    // Hauteur de départ : au moins 4 lignes.
    expect((await champ.boundingBox()).height).toBeGreaterThan(80);
    await page.screenshot({ path: join(DOSSIER_CAPTURES, `${f.genre}-vide-${info.project.name}.png`) });
    // Clic : l'invitation disparaît. Clic ailleurs sans taper : elle revient.
    await champ.click();
    await expect(champ).toHaveAttribute('placeholder', '');
    await page.screenshot({ path: join(DOSSIER_CAPTURES, `${f.genre}-clic-${info.project.name}.png`) });
    await page.locator('.fiche-titre input.titre-editable').click();
    await expect(champ).toHaveAttribute('placeholder', f.invitation);
    expect((await lireDocument(f.collection)).description ?? '').toBe('');
  });

  test(`TL5 ${f.genre} : le texte tapé s’enregistre en quittant le champ, garde ses retours à la ligne, garde une hauteur fixe de 4 lignes (ascenseur au-delà) et se retrouve à la réouverture`, async ({ page }, info) => {
    await creerAffaire('a1', { titre: 'Audit des Lilas' });
    await creerProjet('pr1', { titre: 'Refonte site' });
    await connecter(page);
    await aller(page, f.hash);
    const champ = page.locator('[data-champ="description"]');
    const hauteurVide = (await champ.boundingBox()).height;
    const texte = Array.from({ length: 14 }, (_, i) => `Ligne ${i + 1} : ce dont parle cette fiche.`).join('\n');
    await champ.click();
    await champ.fill(texte);
    expect((await champ.boundingBox()).height).toBe(hauteurVide); // hauteur fixe : il ne grandit pas
    expect(await champ.evaluate((el) => el.scrollHeight > el.clientHeight)).toBe(true); // un ascenseur apparaît
    await page.locator('.fiche-titre input.titre-editable').click(); // quitter le champ
    await expect.poll(async () => (await lireDocument(f.collection)).description).toBe(texte);
    await page.screenshot({ path: join(DOSSIER_CAPTURES, `${f.genre}-rempli-${info.project.name}.png`) });
    await aller(page, '#/crm/accueil');
    await aller(page, f.hash);
    await expect(page.locator('[data-champ="description"]')).toHaveValue(texte);
    expect((await page.locator('[data-champ="description"]').boundingBox()).height).toBe(hauteurVide);
    // Vider le champ : la valeur est effacée et l'invitation revient.
    await page.locator('[data-champ="description"]').click();
    await page.locator('[data-champ="description"]').fill('');
    await page.locator('.fiche-titre input.titre-editable').click();
    await expect.poll(async () => (await lireDocument(f.collection)).description).toBe('');
    await expect(page.locator('[data-champ="description"]')).toHaveAttribute('placeholder', f.invitation);
  });
}

test('TL6 Échap annule la frappe : le texte enregistré revient', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas', description: 'Texte déjà enregistré' });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  const champ = page.locator('[data-champ="description"]');
  await expect(champ).toHaveValue('Texte déjà enregistré');
  await champ.click();
  await champ.fill('Texte abandonné');
  await champ.press('Escape');
  await expect(champ).toHaveValue('Texte déjà enregistré');
  expect((await lireDocument('crm_affaires/a1')).description).toBe('Texte déjà enregistré');
});
