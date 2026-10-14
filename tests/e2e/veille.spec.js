// Module Veille (étape 1), dans le navigateur, sur les émulateurs et avec les règles du CRM de Jérôme (base 1) : écrans Contenus et Sources en lecture.
// Les trois tables n'existent qu'à la première écriture : ce test les crée dans l'émulateur avec des données fictives.
import { test, expect, connecter, ecrireDocument, estTelephone } from './outils.js';

const MIN = 60000;
const il_y_a = (ms) => new Date(Date.now() - ms);

async function donnees() {
  await ecrireDocument('veille_sources/s-alpha', { nom: 'Chaîne Alpha', url: 'https://exemple.test/alpha', type: 'YouTube', actif: true, note: 'Chaîne de test.' });
  await ecrireDocument('veille_sources/s-pme', { nom: 'Podcast PME', url: 'https://exemple.test/pme', fluxRss: 'https://exemple.test/pme.xml', type: 'Podcast', actif: true });
  await ecrireDocument('veille_sources/s-vieux', { nom: 'Ancienne newsletter', url: 'https://exemple.test/vieux', type: 'Newsletter', actif: false });
  await ecrireDocument('veille_contenus/c1', { sourceId: 's-alpha', sourceNom: 'Chaîne Alpha', titre: 'Une vidéo résumée', url: 'https://exemple.test/v1', type: 'YouTube', etat: 'resume', datePublication: il_y_a(3000 * MIN) });
  await ecrireDocument('veille_contenus/c2', { sourceId: 's-pme', sourceNom: 'Podcast PME', titre: 'Un épisode nouveau', url: 'https://exemple.test/e2', type: 'Podcast', etat: 'nouveau', datePublication: il_y_a(1000 * MIN) });
  await ecrireDocument('veille_contenus/c3', { sourceId: 's-pme', sourceNom: 'Podcast PME', titre: 'Un épisode en échec', url: 'javascript:alert(1)', type: 'Podcast', etat: 'echec', etapeEchec: 'Transcription', datePublication: il_y_a(2000 * MIN) });
  await ecrireDocument('veille_contenus/c4', { sourceId: 's-alpha', sourceNom: 'Chaîne Alpha', titre: 'Une vidéo en cours', url: 'https://exemple.test/v4', type: 'YouTube', etat: 'en_cours', datePublication: il_y_a(500 * MIN) });
  await ecrireDocument('veille_resumes/r1', {
    contenuId: 'c1', modele: 'deepseek/deepseek-v4-pro', coutReel: 0.002, devise: 'USD', payeur: 'jerome', cleIa: 'openrouter-jerome',
    lienHtml: 'https://exemple.test/resume.html', lienCourt: 'https://exemple.test/court.html', lienTranscript: 'javascript:alert(2)', creeLe: il_y_a(2900 * MIN),
  });
}

test('Veille : contenus, filtres, liens sûrs, coût visible chez Jérôme, sources', async ({ page, erreursConsole }, info) => {
  await donnees();
  await connecter(page);
  await page.evaluate(() => { location.hash = '#/veille/contenus'; });
  await expect(page.locator('.veille-ligne')).toHaveCount(4);
  // Menu : un groupe « Veille » avec ses deux écrans.
  if (estTelephone(page)) await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await expect(page.locator('.menu').getByRole('link', { name: 'Contenus', exact: true })).toBeVisible();
  await expect(page.locator('.menu').getByRole('link', { name: 'Sources', exact: true })).toBeVisible();
  if (estTelephone(page)) await page.keyboard.press('Escape');
  // Compteurs (un contenu dans chaque état) et ordre : le plus récent d'abord.
  await expect(page.locator('.veille-resume')).toContainText('1 nouveau');
  await expect(page.locator('.veille-resume')).toContainText('1 en cours');
  await expect(page.locator('.veille-resume')).toContainText('1 résumé');
  await expect(page.locator('.veille-resume')).toContainText('1 échec');
  await expect(page.locator('.veille-ligne').first()).toHaveAttribute('data-id', 'c4');
  // Résumé : liens http(s) cliquables, lien javascript: jamais rendu en lien ; modèle, coût et payeur visibles chez Jérôme.
  const c1 = page.locator('.veille-ligne[data-id="c1"]');
  await expect(c1.getByRole('link', { name: 'Résumé complet' })).toHaveAttribute('href', 'https://exemple.test/resume.html');
  await expect(c1.getByRole('link', { name: 'Texte intégral' })).toHaveCount(0);
  await expect(c1).toContainText('deepseek/deepseek-v4-pro');
  await expect(c1).toContainText('0,002 $');
  await expect(c1).toContainText('Payé par : Moi');
  // Échec : étape affichée, titre non cliquable (adresse dangereuse refusée).
  const c3 = page.locator('.veille-ligne[data-id="c3"]');
  await expect(c3).toContainText('Étape en échec : Transcription');
  await expect(c3.locator('a.veille-titre')).toHaveCount(0);
  // Filtres.
  await page.getByLabel('Filtrer par état').selectOption('echec');
  await expect(page.locator('.veille-ligne')).toHaveCount(1);
  await page.getByLabel('Filtrer par état').selectOption('');
  await page.getByLabel('Filtrer par source').selectOption('s-pme');
  await expect(page.locator('.veille-ligne')).toHaveCount(2);
  await page.getByLabel('Filtrer par source').selectOption('');
  await page.getByLabel('Filtrer par type').selectOption('YouTube');
  await expect(page.locator('.veille-ligne')).toHaveCount(2);
  await page.getByLabel('Filtrer par type').selectOption('');
  await page.getByLabel('Chercher dans les titres').fill('NOUVEAU');
  await expect(page.locator('.veille-ligne')).toHaveCount(1);
  await page.screenshot({ path: `test-results/veille-contenus-${info.project.name}.png` });
  // Sources : actives d'abord, nombre de contenus, état.
  await page.evaluate(() => { location.hash = '#/veille/sources'; });
  await expect(page.locator('.veille-ligne')).toHaveCount(3);
  await expect(page.locator('.veille-ligne').first()).toHaveAttribute('data-actif', 'oui');
  await expect(page.locator('.veille-ligne').last()).toHaveAttribute('data-id', 's-vieux');
  await expect(page.locator('.veille-ligne[data-id="s-pme"]')).toContainText('2 contenus');
  await expect(page.locator('.veille-ligne[data-id="s-vieux"]')).toContainText('En pause');
  await page.screenshot({ path: `test-results/veille-sources-${info.project.name}.png` });
  expect(erreursConsole).toEqual([]);
});

test('Veille : sans aucune donnée, des messages clairs (les tables n\'existent pas encore)', async ({ page, erreursConsole }) => {
  await connecter(page);
  await page.evaluate(() => { location.hash = '#/veille/contenus'; });
  await expect(page.locator('.veille-vide')).toContainText('Aucun contenu pour le moment');
  await page.evaluate(() => { location.hash = '#/veille/sources'; });
  await expect(page.locator('.veille-vide')).toContainText('Aucune source pour le moment');
  expect(erreursConsole).toEqual([]);
});
