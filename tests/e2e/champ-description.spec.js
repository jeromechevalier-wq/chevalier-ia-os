// Ancien champ texte libre des fiches Affaire et Projet (19/10/2026), supprimé par I5 (21/10/2026) : la note épinglée de départ le remplace.
// TL4 à TL6 sont adaptés : ils vérifient sur cette note ce qu'ils vérifiaient sur le champ (invitation grisée, enregistrement en quittant, Échap).
import { test, expect, attendreCalme, connecter, creerAffaire, creerProjet, ecrireDocument, lireDocument, JEROME } from './outils.js';

// Ce bac à sable n'a pas accès à apis.google.com : le script est remplacé par un fichier vide (sinon « erreur console » sans rapport avec le test).
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});
async function aller(page, hash) { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }
const noteVide = (id, liens) => ecrireDocument(`crm_notes/${id}`, { texte: '', epinglee: true, personneId: null, organisationId: null, affaireId: null, auteur: JEROME, creeLe: new Date(), modifieLe: new Date(), ...liens });

const FICHES = [
  { genre: 'affaire', hash: '#/crm/affaires/a1', liens: { affaireId: 'a1' }, invitation: 'Cette affaire concerne… (le besoin du client, ce qu’on lui propose, où on en est)' },
  { genre: 'projet', hash: '#/projets/projets/pr1', liens: { projetId: 'pr1' }, invitation: 'Ce projet concerne… (ce qu’on construit, pour qui, où on en est)' },
];

for (const f of FICHES) {
  test(`TL4 (I5) ${f.genre} : plus de champ description ; la note épinglée vide montre l’invitation grisée, qui disparaît au clic et revient si on ne tape rien`, async ({ page }) => {
    await creerAffaire('a1', { titre: 'Audit des Lilas' });
    await creerProjet('pr1', { titre: 'Refonte site' });
    await noteVide('n1', f.liens);
    await connecter(page);
    await aller(page, f.hash);
    await expect(page.locator('[data-champ="description"], .description-fiche')).toHaveCount(0);
    const champ = page.locator('.notes-epinglees-zone [data-champ="note-depart"]');
    await expect(champ).toBeVisible();
    await expect(champ).toHaveAttribute('placeholder', f.invitation);
    await expect(champ).toHaveValue('');
    await champ.click();
    await expect(champ).toHaveAttribute('placeholder', '');
    await page.locator('.fiche-titre input.titre-editable').click();
    await expect(champ).toHaveAttribute('placeholder', f.invitation);
    expect((await lireDocument('crm_notes/n1')).texte).toBe('');
  });

  test(`TL5 (I5) ${f.genre} : le texte tapé dans la note s’enregistre en quittant le champ, garde ses retours à la ligne et se retrouve à la réouverture`, async ({ page }) => {
    await creerAffaire('a1', { titre: 'Audit des Lilas' });
    await creerProjet('pr1', { titre: 'Refonte site' });
    await noteVide('n1', f.liens);
    await connecter(page);
    await aller(page, f.hash);
    const texte = 'Ligne 1 : ce dont parle cette fiche.\nLigne 2 : où on en est.';
    const champ = page.locator('.notes-epinglees-zone [data-champ="note-depart"]');
    await champ.click();
    await champ.fill(texte);
    await page.locator('.fiche-titre input.titre-editable').click();
    await expect.poll(async () => (await lireDocument('crm_notes/n1')).texte).toBe(texte);
    await aller(page, '#/crm/accueil');
    await aller(page, f.hash);
    await expect(page.locator('.notes-epinglees-zone .note-epinglee .note-texte')).toHaveText(texte);
    await expect(page.locator('.notes-epinglees-zone [data-champ="note-depart"]')).toHaveCount(0);
  });
}

test('TL6 (I5) Échap annule la frappe dans la note vide : rien n’est enregistré, l’invitation revient', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await noteVide('n1', { affaireId: 'a1' });
  await connecter(page);
  await aller(page, '#/crm/affaires/a1');
  const champ = page.locator('.notes-epinglees-zone [data-champ="note-depart"]');
  await champ.click();
  await champ.fill('Texte abandonné');
  await champ.press('Escape');
  await expect(champ).toHaveValue('');
  await expect(champ).toHaveAttribute('placeholder', 'Cette affaire concerne… (le besoin du client, ce qu’on lui propose, où on en est)');
  await page.waitForTimeout(300);
  expect((await lireDocument('crm_notes/n1')).texte).toBe('');
});
