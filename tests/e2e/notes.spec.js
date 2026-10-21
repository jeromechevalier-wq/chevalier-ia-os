// Notes : I4 (Modifier sur la note épinglée), I6 (liens cliquables), I14 (notes longues coupées, Développer / Réduire).
// Un test par critère ; une capture par critère dans tests/e2e/captures/notes/ (« -telephone » pour le format téléphone).
import { mkdirSync } from 'node:fs';
import { test, expect, attendreCalme, connecter, creerAffaire, creerProjet, ecrireDocument, lireDocument, JEROME } from './outils.js';

// Les notes n'ont pas besoin de Google : le script des fenêtres Google est remplacé par un fichier vide (pas d'erreur réseau dans la console hors connexion).
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/js/api.js', (route) => route.fulfill({ status: 200, contentType: 'text/javascript', body: '' }));
});

const DOSSIER = new URL('./captures/notes/', import.meta.url).pathname;
mkdirSync(DOSSIER, { recursive: true });
// La capture montre le passage visé : on amène `cible` au milieu de l'écran (sur téléphone la page est longue).
const capture = async (page, nom, cible) => {
  if (cible) await cible.evaluate((el) => el.scrollIntoView({ block: 'center' }));
  await page.screenshot({ path: `${DOSSIER}${nom}${page.viewportSize().width < 768 ? '-telephone' : ''}.png`, animations: 'disabled' });
};

async function note(id, texte, valeurs = {}) {
  await ecrireDocument(`crm_notes/${id}`, { texte, personneId: null, organisationId: null, affaireId: 'a1', auteur: JEROME, creeLe: new Date(), modifieLe: new Date(), ...valeurs });
}
async function ouvrir(page, hash = '#/crm/affaires/a1') { await page.evaluate((h) => { location.hash = h; }, hash); await attendreCalme(page); }
const LONG_COURT = 'Première ligne importante.\nDeuxième ligne.\nTroisième ligne.\nQuatrième ligne cachée au départ.\nCinquième ligne.';
const lignes = (n) => Array.from({ length: n }, (_, i) => `Ligne ${i + 1}`).join('\n');
/** Nombre de lignes visibles d'un paragraphe (hauteur / hauteur d'une ligne). */
const lignesVisibles = (loc) => loc.evaluate((el) => Math.round(el.getBoundingClientRect().height / parseFloat(getComputedStyle(el).lineHeight)));

test('I4 : la note épinglée de l’affaire a un bouton « Modifier » (visible même coupée) qui modifie sur place, sans « Supprimer », croix conservée', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await note('n1', LONG_COURT, { epinglee: true });
  await connecter(page);
  await ouvrir(page);
  const carte = page.locator('.points-cles .note-epinglee');
  const modifier = carte.locator('[data-action="modifier-note-epinglee"]');
  await expect(modifier).toHaveCount(1);
  await expect(modifier).toBeVisible();
  await expect(carte.locator('[data-action="desepingler-note"]')).toHaveCount(1);
  await expect(carte.getByRole('button', { name: /Supprimer/ })).toHaveCount(0);
  // « Modifier » est sous la ligne « date · heure · auteur ».
  const meta = await carte.locator('.fil-meta').boundingBox();
  const bouton = await modifier.boundingBox();
  expect(bouton.y).toBeGreaterThanOrEqual(meta.y + meta.height - 1);
  await capture(page, 'I4-bouton-modifier', carte);
  await modifier.click();
  const hash = await page.evaluate(() => location.hash);
  const zone = carte.getByLabel('Modifier la note');
  await expect(zone).toHaveValue(LONG_COURT);
  await zone.fill('Texte corrigé sur place');
  await capture(page, 'I4-modification', carte);
  await carte.getByRole('button', { name: 'Enregistrer' }).click();
  await expect.poll(async () => (await lireDocument('crm_notes/n1')).texte).toBe('Texte corrigé sur place');
  await expect(carte.locator('.note-texte')).toHaveText('Texte corrigé sur place');
  await expect(carte.getByLabel('Modifier la note')).toHaveCount(0);
  expect(await page.evaluate(() => location.hash)).toBe(hash);
  // Annuler ne change rien.
  await carte.locator('[data-action="modifier-note-epinglee"]').click();
  await carte.getByLabel('Modifier la note').fill('Brouillon abandonné');
  await carte.getByRole('button', { name: 'Annuler' }).click();
  await expect(carte.locator('.note-texte')).toHaveText('Texte corrigé sur place');
  expect((await lireDocument('crm_notes/n1')).texte).toBe('Texte corrigé sur place');
});

test('I4 : même chose sur le projet ; pas de « Modifier » sur une note de l’affaire vue depuis le projet', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await creerProjet('pr1', { titre: 'Projet des Lilas' });
  await note('n1', 'Note du projet', { affaireId: null, projetId: 'pr1', epinglee: true });
  await connecter(page);
  await ouvrir(page, '#/projets/projets/pr1');
  const carte = page.locator('.points-cles .note-epinglee');
  await expect(carte).toContainText('Note du projet');
  await expect(carte.locator('[data-action="modifier-note-epinglee"]')).toBeVisible();
  await expect(carte.getByRole('button', { name: /Supprimer/ })).toHaveCount(0);
  await carte.locator('[data-action="modifier-note-epinglee"]').click();
  await carte.getByLabel('Modifier la note').fill('Note du projet corrigée');
  await carte.getByRole('button', { name: 'Enregistrer' }).click();
  await expect.poll(async () => (await lireDocument('crm_notes/n1')).texte).toBe('Note du projet corrigée');
  await expect(carte.locator('.note-texte')).toHaveText('Note du projet corrigée');
  await capture(page, 'I4-projet', carte);
});

test('I4 cas d’erreur : un texte vide n’est pas enregistré et la note garde son texte', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await note('n1', 'Texte à garder', { epinglee: true });
  await connecter(page);
  await ouvrir(page);
  const carte = page.locator('.points-cles .note-epinglee');
  await carte.locator('[data-action="modifier-note-epinglee"]').click();
  await carte.getByLabel('Modifier la note').fill('   ');
  await carte.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(carte.getByLabel('Modifier la note')).toBeVisible();
  expect((await lireDocument('crm_notes/n1')).texte).toBe('Texte à garder');
});

test('I6 : une adresse dans une note du fil et dans une note épinglée est un lien qui s’ouvre dans un nouvel onglet ; la note enregistrée ne change pas', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  const texte = 'Dossier sur https://exemple.fr/dossier. Aussi www.exemple.org/page, merci.';
  await note('n1', texte);
  await note('n2', 'Épinglée : http://exemple.net/x', { epinglee: true });
  await connecter(page);
  await ouvrir(page);
  const liensFil = page.locator('.fil-note[data-note="n1"] a');
  await expect(liensFil).toHaveCount(2);
  await expect(liensFil.nth(0)).toHaveText('https://exemple.fr/dossier');
  await expect(liensFil.nth(0)).toHaveAttribute('href', 'https://exemple.fr/dossier');
  await expect(liensFil.nth(1)).toHaveText('www.exemple.org/page');
  await expect(liensFil.nth(1)).toHaveAttribute('href', 'https://www.exemple.org/page');
  for (const i of [0, 1]) {
    await expect(liensFil.nth(i)).toHaveAttribute('target', '_blank');
    await expect(liensFil.nth(i)).toHaveAttribute('rel', 'noopener noreferrer');
  }
  // Le texte autour (point, virgule, mots) n'est pas cliquable.
  await expect(page.locator('.fil-note[data-note="n1"] .note-texte')).toHaveText(texte);
  const epinglee = page.locator('.points-cles .note-epinglee a');
  await expect(epinglee).toHaveCount(1);
  await expect(epinglee).toHaveAttribute('href', 'http://exemple.net/x');
  await expect(epinglee).toHaveAttribute('rel', 'noopener noreferrer');
  expect((await lireDocument('crm_notes/n1')).texte).toBe(texte);
  await capture(page, 'I6-liens', page.locator('.points-cles .note-epinglee'));
});

test('I6 : du code saisi dans une note (balise img avec onerror) reste du texte : rien ne s’exécute', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  const piege = '<img src=x onerror="window.__injection=1"> et <script>window.__injection=2</script> https://exemple.fr/<b>x</b>';
  await note('n1', piege);
  await note('n2', piege, { epinglee: true });
  await connecter(page);
  await ouvrir(page);
  await expect(page.locator('.fil-note[data-note="n1"] .note-texte')).toContainText('<img src=x onerror="window.__injection=1">');
  await expect(page.locator('.note-texte img, .note-texte script, .note-texte b')).toHaveCount(0);
  expect(await page.evaluate(() => window.__injection)).toBeUndefined();
  await capture(page, 'I6-injection', page.locator('.fil-note[data-note="n1"]'));
});

test('I14 : une note de 30 lignes est coupée (20 lignes sur ordinateur, 12 sur téléphone) avec « Développer », puis « Réduire »', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  await note('n1', lignes(30));
  await connecter(page);
  await ouvrir(page);
  const limite = page.viewportSize().width < 768 ? 12 : 20;
  const texte = page.locator('.fil-note[data-note="n1"] .note-texte');
  const bouton = page.locator('.fil-note[data-note="n1"] [data-action="developper-note"]');
  await expect(bouton).toBeVisible();
  await expect(bouton).toHaveText('Développer');
  expect(await lignesVisibles(texte)).toBe(limite);
  // Le bouton est sous la dernière ligne visible.
  const t = await texte.boundingBox();
  const b = await bouton.boundingBox();
  expect(b.y).toBeGreaterThanOrEqual(t.y + t.height - 1);
  await capture(page, 'I14-coupee', texte);
  await bouton.click();
  await expect(bouton).toHaveText('Réduire');
  expect(await lignesVisibles(texte)).toBe(30);
  await capture(page, 'I14-developpee', bouton);
  await bouton.click();
  await expect(bouton).toHaveText('Développer');
  expect(await lignesVisibles(texte)).toBe(limite);
});

test('I14 : jusqu’à la limite, pas de bouton ; la note épinglée du haut reste à 3 lignes', async ({ page }) => {
  await creerAffaire('a1', { titre: 'Audit des Lilas' });
  const limite = page.viewportSize().width < 768 ? 12 : 20;
  await note('n1', lignes(limite));
  await note('n2', lignes(2));
  await note('n3', lignes(30), { epinglee: true });
  await connecter(page);
  await ouvrir(page);
  await expect(page.locator('.fil-note[data-note="n1"] .note-texte')).toBeVisible();
  expect(await lignesVisibles(page.locator('.fil-note[data-note="n1"] .note-texte'))).toBe(limite);
  await expect(page.locator('.fil-note[data-note="n1"] [data-action="developper-note"]')).toBeHidden();
  await expect(page.locator('.fil-note[data-note="n2"] [data-action="developper-note"]')).toBeHidden();
  // La note n3 est épinglée : elle est aussi dans le fil (coupée à la limite) et en haut (3 lignes).
  expect(await lignesVisibles(page.locator('.points-cles .note-epinglee .note-texte'))).toBe(3);
  await expect(page.locator('.points-cles .note-epinglee [data-action="developper-note"]')).toHaveCount(0);
  await capture(page, 'I14-limite', page.locator('.fil-note[data-note="n1"]'));
});
