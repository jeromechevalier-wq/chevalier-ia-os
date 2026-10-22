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
    pageDisponible: true, lienHtml: 'https://exemple.test/resume.html', lienCourt: 'https://exemple.test/court.html', lienTranscript: 'javascript:alert(2)', creeLe: il_y_a(2900 * MIN),
  });
  await ecrireDocument('veille_pages/r1', { html: '<!DOCTYPE html><html><head><title>R</title></head><body><h1 id="titre-resume">Un joli résumé</h1><script>document.title="PIRATE"</script><a href="https://exemple.test/lien">Un lien</a></body></html>' });
}

// Fonction `veille` du serveur simulée dans le navigateur (aucun serveur réel) : on note les demandes reçues et on répond ce que le serveur répondrait.
async function simulerFonction(page, reponses) {
  const recues = [];
  await page.route(/cloudfunctions\.net\/veille$/, async (route) => {
    const cors = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: cors });
    const demande = JSON.parse(route.request().postData() ?? '{}').data;
    recues.push(demande);
    const r = reponses(demande);
    if (r.erreur) return route.fulfill({ status: 400, headers: cors, contentType: 'application/json', body: JSON.stringify({ error: { status: 'FAILED_PRECONDITION', message: r.erreur } }) });
    return route.fulfill({ status: 200, headers: cors, contentType: 'application/json', body: JSON.stringify({ result: r }) });
  });
  return recues;
}

test('Veille : contenus, filtres, liens sûrs, coût visible chez Jérôme, sources', async ({ page, erreursConsole }, info) => {
  await donnees();
  await connecter(page);
  await page.evaluate(() => { location.hash = '#/veille/contenus'; });
  await expect(page.locator('.veille-ligne')).toHaveCount(4);
  await page.screenshot({ path: `test-results/veille-contenus-${info.project.name}.png`, fullPage: true }); // avant d'ouvrir le menu (sur téléphone il masque l'écran)
  // Menu : UNE entrée « Veille » (allumée) ; Contenus et Sources sont des onglets de la page.
  if (estTelephone(page)) await page.getByRole('button', { name: 'Ouvrir le menu' }).click();
  await expect(page.locator('.menu').getByRole('link', { name: 'Veille', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.locator('.menu').getByRole('link', { name: 'Contenus', exact: true })).toHaveCount(0);
  await expect(page.locator('.menu').getByRole('link', { name: 'Sources', exact: true })).toHaveCount(0);
  if (estTelephone(page)) await page.keyboard.press('Escape');
  // Compteurs (un contenu dans chaque état) et ordre : le plus récent d'abord.
  await expect(page.locator('.veille-resume')).toContainText('1 nouveau');
  await expect(page.locator('.veille-resume')).toContainText('1 en cours');
  await expect(page.locator('.veille-resume')).toContainText('1 résumé');
  await expect(page.locator('.veille-resume')).toContainText('1 échec');
  await expect(page.locator('.veille-ligne').first()).toHaveAttribute('data-id', 'c4');
  // Résumé : liens http(s) cliquables, lien javascript: jamais rendu en lien ; modèle, coût et payeur visibles chez Jérôme.
  const c1 = page.locator('.veille-ligne[data-id="c1"]');
  await expect(c1.getByRole('link', { name: 'Ouvrir dans Drive' })).toHaveAttribute('href', 'https://exemple.test/resume.html');
  await expect(c1.getByRole('link', { name: 'Texte intégral' })).toHaveCount(0);
  await expect(c1).toContainText('deepseek/deepseek-v4-pro');
  await expect(c1).toContainText('0,002 $');
  await expect(c1).toContainText('Payé par : Moi');
  // Bouton Résumer : un vrai bouton, seulement sur un contenu « nouveau » (c2) ou « en échec » (c3) ; absent d'un contenu déjà résumé ou en cours. Plus aucun lien n8n dans la page.
  const c2 = page.locator('.veille-ligne[data-id="c2"]');
  await expect(c2.getByRole('button', { name: 'Résumer', exact: true })).toBeVisible();
  await expect(c1.getByRole('button', { name: 'Résumer', exact: true })).toHaveCount(0);
  await expect(page.locator('.veille-ligne[data-id="c4"] [data-action="resumer"]')).toHaveCount(0);
  await expect(page.locator('.veille-ligne[data-id="c3"]').getByRole('button', { name: 'Réessayer le résumé' })).toBeVisible();
  expect(await page.locator('a[href*="n8n"], a[href*="token="]').count()).toBe(0);
  // Échec : étape affichée, titre non cliquable (adresse dangereuse refusée).
  const c3 = page.locator('.veille-ligne[data-id="c3"]');
  await expect(c3).toContainText('Étape en échec : Transcription');
  await expect(c3.locator('a.veille-titre')).toHaveCount(0);
  // Filtres.
  // Filtres : bouton commun « Filtres » (fenêtre à cases à cocher) ; chaque essai se termine par « Tout effacer ».
  const unFiltre = async (cle, valeur, attendu) => {
    await page.locator('[data-action="filtres"]').click();
    await page.getByRole('dialog').locator(`input[data-cle="${cle}"][data-valeur="${valeur}"]`).check();
    await page.getByRole('dialog').getByRole('button', { name: 'Appliquer' }).click();
    await expect(page.locator('.veille-ligne')).toHaveCount(attendu);
    await page.locator('[data-action="filtres"]').click();
    await page.getByRole('dialog').getByRole('button', { name: 'Tout effacer' }).click();
    await expect(page.locator('.veille-ligne')).toHaveCount(4);
  };
  await unFiltre('etats', 'echec', 1);
  await unFiltre('sources', 's-pme', 2);
  await unFiltre('types', 'YouTube', 2);
  await page.getByLabel('Chercher dans les titres').fill('NOUVEAU');
  await expect(page.locator('.veille-ligne')).toHaveCount(1);
  await page.screenshot({ path: `test-results/veille-contenus-filtre-${info.project.name}.png` });
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

test('Veille : bouton Résumer (appelle le serveur), ajout d\'un épisode et d\'une chaîne, lecture d\'un résumé dans l\'appli', async ({ page, erreursConsole }, info) => {
  await donnees();
  const recues = await simulerFonction(page, (d) => {
    if (d.action === 'resumer') return d.contenuId === 'c3' ? { erreur: 'Le service de résumé ne répond pas. Réessayer dans un instant.' } : { lance: true, message: 'Résumé lancé. Il apparaît ici dans quelques minutes.' };
    if (d.url.includes('/@')) return { genre: 'chaine', crees: 5, existants: 0, sourceNom: 'Veritasium', sourceNouvelle: true };
    return { genre: 'video', crees: 1, existants: 0, titre: 'Mon épisode', sourceNom: 'Ajouts manuels', ...(d.lancerResume ? { resume: { lance: true, message: 'Résumé lancé. Il apparaît ici dans quelques minutes.' } } : {}) };
  });
  await connecter(page);
  await page.evaluate(() => { location.hash = '#/veille/contenus'; });
  await expect(page.locator('.veille-ligne')).toHaveCount(4);

  // Résumer : la demande part au serveur avec l'identifiant du contenu ; un refus du serveur s'affiche tel quel et le bouton redevient cliquable.
  await page.locator('.veille-ligne[data-id="c2"]').getByRole('button', { name: 'Résumer', exact: true }).click();
  await expect(page.locator('.toast')).toContainText('Résumé lancé');
  expect(recues.at(-1)).toEqual({ action: 'resumer', contenuId: 'c2' });
  const reessayer = page.locator('.veille-ligne[data-id="c3"]').getByRole('button', { name: 'Réessayer le résumé' });
  await reessayer.click();
  await expect(page.locator('.toast-erreur')).toContainText('ne répond pas');
  await expect(reessayer).toBeEnabled();

  // Ajout : les boutons suivent ce que le lien désigne.
  const champ = page.getByLabel('Lien YouTube à ajouter');
  await expect(page.locator('.veille-ajout [data-action]')).toHaveCount(0);
  await champ.fill('bonjour');
  await expect(page.locator('.veille-ajout')).toContainText('ni un épisode ni une chaîne');
  await expect(page.locator('.veille-ajout [data-action]')).toHaveCount(0);
  await champ.fill('https://youtu.be/dQw4w9WgXcQ');
  await expect(page.locator('.veille-ajout').getByRole('button')).toHaveText(['Ajouter', 'Ajouter et résumer']);
  await page.screenshot({ path: `test-results/veille-ajout-episode-${info.project.name}.png` });
  await page.locator('.veille-ajout').getByRole('button', { name: 'Ajouter et résumer' }).click();
  await expect(page.locator('.toast').last()).toContainText('Épisode ajouté : Mon épisode. Résumé lancé');
  expect(recues.at(-1)).toEqual({ action: 'ajouterLien', url: 'https://youtu.be/dQw4w9WgXcQ', lancerResume: true });
  await expect(champ).toHaveValue('');
  await champ.fill('https://www.youtube.com/@veritasium');
  await expect(page.locator('.veille-ajout').getByRole('button')).toHaveText(['Suivre la chaîne']);
  await page.locator('.veille-ajout').getByRole('button', { name: 'Suivre la chaîne' }).click();
  await expect(page.locator('.toast').last()).toContainText('Chaîne suivie : Veritasium, 5 épisodes ajoutés.');
  expect(recues.at(-1)).toEqual({ action: 'ajouterLien', url: 'https://www.youtube.com/@veritasium', lancerResume: false });

  // Lecture d'un résumé dans l'appli : cadre isolé (aucun script exécuté), lien vers Drive gardé en secours.
  const c1 = page.locator('.veille-ligne[data-id="c1"]');
  await expect(c1.getByRole('link', { name: 'Ouvrir dans Drive' })).toHaveAttribute('href', 'https://exemple.test/resume.html');
  await c1.getByRole('button', { name: 'Lire le résumé' }).click();
  const cadre = page.locator('iframe.veille-cadre');
  await expect(cadre).toBeVisible();
  await expect(cadre).toHaveAttribute('sandbox', 'allow-popups allow-popups-to-escape-sandbox');
  await expect(page.frameLocator('iframe.veille-cadre').locator('#titre-resume')).toHaveText('Un joli résumé');
  await expect(page.frameLocator('iframe.veille-cadre').locator('a')).toHaveAttribute('href', 'https://exemple.test/lien');
  expect(await cadre.evaluate((f) => f.contentDocument?.title)).not.toBe('PIRATE'); // le script de la page n'a pas tourné
  await page.screenshot({ path: `test-results/veille-lecture-resume-${info.project.name}.png` });
  await page.keyboard.press('Escape');
  await expect(cadre).toHaveCount(0);
  // Deux messages attendus : le refus simulé du serveur (400) et le blocage du script de la page de résumé par le cadre isolé (c'est la preuve qu'il tient).
  info.annotations.push({ type: 'erreurs-reseau-attendues', description: 'refus simulé du serveur, script bloqué par le cadre isolé' });
  expect(erreursConsole.filter((e) => !/status of 400|Blocked script execution/.test(e))).toEqual([]);
  expect(erreursConsole.some((e) => /Blocked script execution/.test(e))).toBe(true);
});
