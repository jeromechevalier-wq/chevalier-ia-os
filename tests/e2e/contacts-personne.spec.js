// Fiche personne : Email et Téléphone en lignes « libellé | valeurs », comme l'organisation (plus de crayon d'en-tête ni de fenêtre).
// Plusieurs valeurs, modification et retrait sur place. Captures (format ordinateur) dans tests/e2e/captures/contacts/.
import { fileURLToPath } from 'node:url';
import { test, expect, attendreCalme, connecter, creerPersonne, lireDocument } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/contacts/', import.meta.url));
async function capturer(page, info, nom) {
  if (info.project.name !== 'ordinateur') return;
  await page.screenshot({ path: `${DOSSIER}${nom}.png`, fullPage: true });
}
async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }
const ligne = (page, genre) => page.locator(`[data-section="personne-resume"] [data-contacts="${genre}"]`);

test('1 la fiche personne n\'a plus de crayon d\'en-tête ni de fenêtre « Email et téléphone »', async ({ page }, info) => {
  await creerPersonne('p1', { nom: 'Alice Test' });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  await expect(page.locator('[data-action="modifier-contacts"]')).toHaveCount(0);
  await expect(ligne(page, 'email').locator('.prop-libelle')).toHaveText('Email');
  await expect(ligne(page, 'tel').locator('.prop-libelle')).toHaveText('Téléphone');
  await ligne(page, 'email').locator('[data-action="ajouter-contact"]').click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await capturer(page, info, '1-sans-crayon');
});

test('2 sans email : « + Ajouter », l\'email saisi s\'enregistre, devient un lien mailto avec son type (Travail par défaut)', async ({ page }, info) => {
  await creerPersonne('p1', { nom: 'Alice Test' });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  await ligne(page, 'email').locator('[data-action="ajouter-contact"]').click();
  await ligne(page, 'email').getByRole('textbox', { name: 'Nouveau : email' }).fill('Alice@Exemple.test');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await lireDocument('crm_personnes/p1')).emails).toEqual([{ valeur: 'Alice@Exemple.test', type: 'travail' }]);
  expect((await lireDocument('crm_personnes/p1')).emailsNormalises).toEqual(['alice@exemple.test']);
  await expect(ligne(page, 'email').locator('a')).toHaveAttribute('href', 'mailto:alice@exemple.test');
  await expect(ligne(page, 'email')).toContainText('(Travail)');
  await capturer(page, info, '2-un-email');
});

test('3 avec un email, « + Ajouter » reste visible : un second email s\'affiche sous le premier, avec son type', async ({ page }, info) => {
  await creerPersonne('p1', { nom: 'Alice Test', emails: [{ valeur: 'un@exemple.test', type: 'travail' }] });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  await ligne(page, 'email').locator('[data-action="ajouter-contact"]').click();
  await ligne(page, 'email').getByRole('textbox', { name: 'Nouveau : email' }).fill('deux@exemple.test');
  await ligne(page, 'email').getByLabel('Type de email').selectOption('perso');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await lireDocument('crm_personnes/p1')).emails).toEqual([{ valeur: 'un@exemple.test', type: 'travail' }, { valeur: 'deux@exemple.test', type: 'perso' }]);
  await expect(ligne(page, 'email').locator('.contact-valeur')).toHaveCount(2);
  await expect(ligne(page, 'email').locator('[data-action="ajouter-contact"]')).toBeVisible();
  await capturer(page, info, '3-deux-emails');
});

test('4 téléphone : un premier puis un second numéro, liens tel: sans espaces', async ({ page }, info) => {
  await creerPersonne('p1', { nom: 'Alice Test' });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  await ligne(page, 'tel').locator('[data-action="ajouter-contact"]').click();
  await page.getByRole('textbox', { name: 'Nouveau : téléphone' }).fill('06 12 34 56 78');
  await page.keyboard.press('Enter');
  await expect(ligne(page, 'tel').locator('.contact-valeur')).toHaveCount(1);
  await ligne(page, 'tel').locator('[data-action="ajouter-contact"]').click();
  await page.getByRole('textbox', { name: 'Nouveau : téléphone' }).fill('+33 4 92 00 00 00');
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await lireDocument('crm_personnes/p1')).telephones.map((t) => t.valeur)).toEqual(['06 12 34 56 78', '+33 4 92 00 00 00']);
  await expect(ligne(page, 'tel').locator('a').nth(1)).toHaveAttribute('href', 'tel:+33492000000');
  await capturer(page, info, '4-deux-telephones');
});

test('5 un email se modifie sur place ; Échap annule ; un email invalide affiche le message et n\'enregistre rien ; une valeur vide ou en double n\'enregistre rien', async ({ page }) => {
  await creerPersonne('p1', { nom: 'Alice Test', emails: [{ valeur: 'un@exemple.test', type: 'travail' }, { valeur: 'deux@exemple.test', type: 'perso' }] });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  const premier = ligne(page, 'email').locator('.contact-valeur').first();
  await premier.hover();
  await premier.locator('[data-action="modifier-contact"]').click();
  await ligne(page, 'email').getByRole('textbox', { name: 'Email 1' }).fill('autre@exemple.test');
  await page.keyboard.press('Escape');
  expect((await lireDocument('crm_personnes/p1')).emails[0].valeur).toBe('un@exemple.test');
  await premier.locator('[data-action="modifier-contact"]').click();
  await ligne(page, 'email').getByRole('textbox', { name: 'Email 1' }).fill('pas-un-email');
  await page.keyboard.press('Enter');
  await expect(ligne(page, 'email')).toContainText('Cette adresse email n’est pas valide');
  expect((await lireDocument('crm_personnes/p1')).emails[0].valeur).toBe('un@exemple.test');
  await ligne(page, 'email').getByRole('textbox', { name: 'Email 1' }).fill('Deux@Exemple.test'); // même adresse que la seconde : ignoré
  await page.keyboard.press('Enter');
  expect((await lireDocument('crm_personnes/p1')).emails.map((e) => e.valeur)).toEqual(['un@exemple.test', 'deux@exemple.test']);
  await premier.locator('[data-action="modifier-contact"]').click();
  await ligne(page, 'email').getByRole('textbox', { name: 'Email 1' }).fill('nouveau@exemple.test'); // sortie du champ = enregistre
  await page.keyboard.press('Enter');
  await expect.poll(async () => (await lireDocument('crm_personnes/p1')).emails[0].valeur).toBe('nouveau@exemple.test');
  await expect.poll(async () => (await lireDocument('crm_personnes/p1')).emailsNormalises).toEqual(['nouveau@exemple.test', 'deux@exemple.test']);
});

test('6 retirer un email : confirmation, puis « Retiré · Annuler » qui remet la liste dans la base', async ({ page }, info) => {
  await creerPersonne('p1', { nom: 'Alice Test', emails: [{ valeur: 'un@exemple.test', type: 'travail' }, { valeur: 'deux@exemple.test', type: 'perso' }] });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  const avant = (await lireDocument('crm_personnes/p1')).emails;
  await ligne(page, 'email').locator('.contact-valeur').first().locator('[data-action="retirer-contact"]').click();
  await expect(page.getByRole('dialog')).toContainText('Retirer cette adresse ?');
  await page.getByRole('dialog').getByRole('button', { name: 'Retirer' }).click();
  await expect.poll(async () => (await lireDocument('crm_personnes/p1')).emails.length).toBe(1);
  const toast = page.locator('.toast', { hasText: 'Retiré' });
  await expect(toast.getByRole('button', { name: 'Annuler' })).toBeVisible();
  await capturer(page, info, '6-retire-annuler');
  await toast.getByRole('button', { name: 'Annuler' }).click();
  await expect.poll(async () => (await lireDocument('crm_personnes/p1')).emails).toEqual(avant);
  await expect(ligne(page, 'email').locator('.contact-valeur')).toHaveCount(2);
});

test('7 au dixième email, « + Ajouter » disparaît', async ({ page }) => {
  const emails = Array.from({ length: 10 }, (_, i) => ({ valeur: `e${i}@exemple.test`, type: 'travail' }));
  await creerPersonne('p1', { nom: 'Alice Test', emails });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  await expect(ligne(page, 'email').locator('.contact-valeur')).toHaveCount(10);
  await expect(ligne(page, 'email').locator('[data-action="ajouter-contact"]')).toHaveCount(0);
});

test('9 téléphone : zones de clic de 44 px au moins et pas de défilement horizontal', async ({ page }, info) => {
  test.skip(info.project.name !== 'telephone', 'format téléphone seulement');
  await creerPersonne('p1', { nom: 'Alice Test', emails: [{ valeur: 'un@exemple.test', type: 'travail' }] });
  await connecter(page);
  await aller(page, '#/crm/personnes/p1');
  const boite = async (sel) => page.locator(sel).first().evaluate((el) => { const r = el.getBoundingClientRect(); const a = getComputedStyle(el, '::after'); return { h: Math.max(r.height, parseFloat(a.height) || 0), l: Math.max(r.width, parseFloat(a.width) || 0) }; });
  expect((await boite('[data-contacts="email"] [data-action="retirer-contact"]')).h).toBeGreaterThanOrEqual(44);
  expect((await boite('[data-contacts="email"] [data-action="modifier-contact"]')).h).toBeGreaterThanOrEqual(44);
  expect((await boite('[data-contacts="tel"] [data-action="ajouter-contact"]')).h).toBeGreaterThanOrEqual(44);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});
