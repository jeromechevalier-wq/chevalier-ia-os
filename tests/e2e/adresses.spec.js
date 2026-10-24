// Fiches Personne et Organisation : la ligne « Adresses » du Résumé (liste d'adresses enregistrées, modifiable sur place).
// Captures (format ordinateur) dans tests/e2e/captures/adresses/.
import { fileURLToPath } from 'node:url';
import { test, expect, attendreCalme, connecter, creerPersonne, creerOrganisation, lireDocument, FIRESTORE, PROJET } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/adresses/', import.meta.url));
async function capturer(page, info, nom) {
  if (info.project.name !== 'ordinateur') return;
  await page.screenshot({ path: `${DOSSIER}${nom}.png`, fullPage: true });
}
async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }
const ligne = (page, section) => page.locator(`[data-section="${section}-resume"] [data-contacts="adresses"]`);
const ajouterAdresse = async (page, section, { libelle = '', adresse, parDefaut = false }) => {
  const l = ligne(page, section);
  await l.locator('[data-action="ajouter-contact"]').click();
  if (libelle) await l.getByRole('textbox', { name: 'Libellé de l’adresse' }).fill(libelle);
  await l.getByRole('textbox', { name: 'Nouvelle adresse' }).fill(adresse);
  if (parDefaut) await l.getByRole('checkbox', { name: 'Adresse par défaut' }).check();
  await page.keyboard.press('Enter');
};

test('D35 une organisation qui n\'a que l\'ancienne adresse et ville affiche une ligne « Principale », sans migration ni écriture', async ({ page }, info) => {
  await creerOrganisation('o1', { nom: 'Boutique Exemple', adresse: '12 rue des Lilas', ville: 'Lyon' });
  await connecter(page);
  await aller(page, '#/crm/organisations/o1');
  const l = ligne(page, 'organisation');
  await expect(l.locator('.prop-libelle')).toHaveText('Adresses');
  await expect(l.locator('.adresse-valeur')).toHaveCount(1);
  await expect(l.locator('.adresse-libelle')).toHaveText('Principale');
  await expect(l.locator('.adresse-texte')).toContainText('12 rue des Lilas');
  await page.waitForTimeout(500);
  const o = await lireDocument('crm_organisations/o1');
  expect(o.adresses).toBeUndefined(); // rien n'a été écrit
  expect([o.adresse, o.ville]).toEqual(['12 rue des Lilas', 'Lyon']);
  await capturer(page, info, 'D35-principale');
});

test('A1 ajouter une adresse à une personne l\'affiche tout de suite et la garde après rechargement (cas vide : « + Ajouter une adresse »)', async ({ page }, info) => {
  await creerPersonne('p1', { nom: 'Alice Test' });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  await expect(ligne(page, 'personne').locator('[data-action="ajouter-contact"]')).toHaveText('Ajouter une adresse');
  await capturer(page, info, 'A1-personne-vide');
  await ajouterAdresse(page, 'personne', { libelle: 'Bureau', adresse: '  3 impasse des Roses \n 06000 Nice ' });
  const l = ligne(page, 'personne');
  await expect(l.locator('.adresse-libelle')).toHaveText('Bureau');
  await expect(l.locator('.adresse-texte')).toHaveText('3 impasse des Roses\n06000 Nice');
  await expect(l.locator('[data-action="ajouter-contact"]')).toHaveText('Ajouter');
  await expect.poll(async () => (await lireDocument('crm_personnes/p1')).adresses?.map((a) => [a.libelle, a.adresse])).toEqual([['Bureau', '3 impasse des Roses\n06000 Nice']]);
  await capturer(page, info, 'A1-personne-une-adresse');
  await page.reload();
  await attendreCalme(page);
  await expect(ligne(page, 'personne').locator('.adresse-texte')).toContainText('3 impasse des Roses');
});

test('A1 même chose sur une organisation, et le libellé par défaut est « Adresse »', async ({ page }, info) => {
  await creerOrganisation('o1', { nom: 'Boutique Exemple' });
  await connecter(page);
  await aller(page, '#/crm/organisations/o1');
  await ajouterAdresse(page, 'organisation', { adresse: '5 rue Basse, 69001 Lyon' });
  const l = ligne(page, 'organisation');
  await expect(l.locator('.adresse-libelle')).toHaveText('Adresse');
  await expect.poll(async () => (await lireDocument('crm_organisations/o1')).adresses?.length).toBe(1);
  await page.reload();
  await attendreCalme(page);
  await expect(ligne(page, 'organisation').locator('.adresse-texte')).toHaveText('5 rue Basse, 69001 Lyon');
  await capturer(page, info, 'A1-organisation');
});

test('A2 une adresse vide ou en doublon n\'enregistre rien et affiche un message qui dit quoi faire ; à 10, « + Ajouter » disparaît', async ({ page }, info) => {
  await creerPersonne('p1', { nom: 'Alice Test', adresses: [{ id: 'x1', libelle: 'Maison', adresse: '5 rue Basse', parDefaut: false }] });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  const l = ligne(page, 'personne');
  await l.locator('[data-action="ajouter-contact"]').click();
  await l.getByRole('textbox', { name: 'Libellé de l’adresse' }).fill('Bureau');
  await page.keyboard.press('Enter');
  await expect(l).toContainText('Écrivez l’adresse');
  await l.getByRole('textbox', { name: 'Nouvelle adresse' }).fill('5 RUE basse');
  await page.keyboard.press('Enter');
  await expect(l).toContainText('Cette adresse est déjà dans la liste');
  await capturer(page, info, 'A2-doublon');
  expect((await lireDocument('crm_personnes/p1')).adresses.length).toBe(1);
  await page.keyboard.press('Escape');
  const dix = Array.from({ length: 10 }, (_, i) => ({ id: `d${i}`, libelle: 'Adresse', adresse: `${i + 1} rue Haute`, parDefaut: false }));
  await creerPersonne('p2', { nom: 'Bob Test', adresses: dix });
  await aller(page, '#/crm/personnes/p2');
  await expect(ligne(page, 'personne').locator('.adresse-valeur')).toHaveCount(10);
  await expect(ligne(page, 'personne').locator('[data-action="ajouter-contact"]')).toHaveCount(0);
});

test('A3 la croix demande confirmation, puis « Retiré · Annuler » 8 s ; Annuler remet seulement l\'adresse retirée', async ({ page }, info) => {
  const deux = [{ id: 'x1', libelle: 'Maison', adresse: '5 rue Basse', parDefaut: false }, { id: 'x2', libelle: 'Bureau', adresse: '7 rue Haute', parDefaut: false }];
  await creerOrganisation('o1', { nom: 'Boutique Exemple', adresses: deux });
  await connecter(page);
  await aller(page, '#/crm/organisations/o1');
  await ligne(page, 'organisation').locator('.adresse-valeur').first().locator('[data-action="retirer-contact"]').click();
  await expect(page.getByRole('dialog')).toContainText('Retirer cette adresse ?');
  await page.getByRole('dialog').getByRole('button', { name: 'Retirer' }).click();
  await expect.poll(async () => (await lireDocument('crm_organisations/o1')).adresses.map((a) => a.id)).toEqual(['x2']);
  const toast = page.locator('.toast', { hasText: 'Retiré' });
  await expect(toast.getByRole('button', { name: 'Annuler' })).toBeVisible();
  await capturer(page, info, 'A3-retire-annuler');
  await ajouterAdresse(page, 'organisation', { libelle: 'Dépôt', adresse: '1 zone industrielle' }); // ajouté après le retrait : ne doit pas être perdu
  await expect.poll(async () => (await lireDocument('crm_organisations/o1')).adresses.length).toBe(2);
  await page.locator('.toast', { hasText: 'Retiré' }).getByRole('button', { name: 'Annuler' }).click();
  await expect.poll(async () => (await lireDocument('crm_organisations/o1')).adresses.map((a) => a.libelle)).toEqual(['Maison', 'Bureau', 'Dépôt']);
});

test('A4 une seule adresse « par défaut » par fiche', async ({ page }, info) => {
  await creerPersonne('p1', { nom: 'Alice Test', adresses: [{ id: 'x1', libelle: 'Maison', adresse: '5 rue Basse', parDefaut: true }] });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  await expect(ligne(page, 'personne').locator('.adresse-par-defaut')).toHaveCount(1);
  await ajouterAdresse(page, 'personne', { libelle: 'Bureau', adresse: '7 rue Haute', parDefaut: true });
  await expect.poll(async () => (await lireDocument('crm_personnes/p1')).adresses.map((a) => a.parDefaut)).toEqual([false, true]);
  await expect(ligne(page, 'personne').locator('.adresse-par-defaut')).toHaveCount(1);
  await expect(ligne(page, 'personne').locator('.adresse-valeur').nth(1).locator('.adresse-par-defaut')).toBeVisible();
  await capturer(page, info, 'A4-une-seule-par-defaut');
});

test('A5 cas d\'erreur : une écriture refusée remet l\'ancienne valeur et affiche un message', async ({ page }, info) => {
  await creerPersonne('p1', { nom: 'Alice Test', adresses: [{ id: 'x1', libelle: 'Maison', adresse: '5 rue Basse', parDefaut: false }] });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  const l = ligne(page, 'personne');
  await l.locator('[data-action="ajouter-contact"]').click();
  await l.getByRole('textbox', { name: 'Nouvelle adresse' }).fill('7 rue Haute');
  // La fiche disparaît de la base pendant la saisie : l'écriture est refusée (la fiche ne se redessine pas tant qu'on est dans le champ).
  await fetch(`${FIRESTORE}/v1/projects/${PROJET}/databases/(default)/documents/crm_personnes/p1`, { method: 'DELETE', headers: { Authorization: 'Bearer owner' } });
  await page.waitForTimeout(1500);
  await page.keyboard.press('Enter');
  await expect(page.locator('.toast', { hasText: 'Enregistrement impossible' })).toBeVisible();
  await expect(ligne(page, 'personne').locator('.adresse-texte')).toHaveText(['5 rue Basse']); // l'ancienne liste est revenue, la nouvelle adresse a disparu
  await capturer(page, info, 'A5-erreur');
});

test('A7 les anciens champs adresse et ville d\'une organisation restent inchangés après toute modification de la liste', async ({ page }) => {
  await creerOrganisation('o1', { nom: 'Boutique Exemple', adresse: '12 rue des Lilas', ville: 'Lyon' });
  await connecter(page);
  await aller(page, '#/crm/organisations/o1');
  await ajouterAdresse(page, 'organisation', { libelle: 'Dépôt', adresse: '1 zone industrielle' });
  await expect.poll(async () => (await lireDocument('crm_organisations/o1')).adresses?.map((a) => a.libelle)).toEqual(['Principale', 'Dépôt']);
  const o = await lireDocument('crm_organisations/o1');
  expect([o.adresse, o.ville]).toEqual(['12 rue des Lilas', 'Lyon']);
  await ligne(page, 'organisation').locator('.adresse-valeur').first().locator('[data-action="retirer-contact"]').click();
  await page.getByRole('dialog').getByRole('button', { name: 'Retirer' }).click();
  await expect.poll(async () => (await lireDocument('crm_organisations/o1')).adresses.length).toBe(1);
  const apres = await lireDocument('crm_organisations/o1');
  expect([apres.adresse, apres.ville]).toEqual(['12 rue des Lilas', 'Lyon']);
});
