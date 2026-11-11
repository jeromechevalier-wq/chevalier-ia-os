// Module Réseaux sociaux, squelette (11/11/2026), chez Jérôme (racine, règles du CRM). Un test par critère du cahier (D1, D3, D4, D7, D8), nom commençant par son numéro,
// UNE capture chacun dans tests/e2e/captures/reseauxsociaux-socle/ (« -telephone » sur téléphone). Données fictives uniquement ; Buffer est simulé dans le navigateur (aucun serveur réel).
// Le même module chez un client (D2, catégories, « Buffer non branché ») : tests/e2e/reseauxsociaux-socle-client.spec.js.
import { readFile } from 'node:fs/promises';
import { test, expect, connecter, allerA, ouvrirSectionReglages, attendreCalme, listerDocuments, estTelephone } from './outils.js';

const CAPTURES = 'e2e/captures/reseauxsociaux-socle';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
// Ces écrans n'utilisent pas Google : le script de l'API est remplacé par un fichier vide (sans réseau, il ne produit pas d'erreur de console).
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
/** Fonction `reseauxsociauxBuffer` simulée dans le navigateur : note les demandes reçues et répond ce que répondrait le serveur. */
async function simulerBuffer(page, reponse) {
  const recues = [];
  await page.route(/cloudfunctions\.net\/reseauxsociauxBuffer$/, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    recues.push(JSON.parse(route.request().postData() ?? '{}').data);
    const r = reponse(recues.length);
    if (r.erreur) return route.fulfill({ status: 400, headers: CORS, contentType: 'application/json', body: JSON.stringify({ error: { status: 'FAILED_PRECONDITION', message: r.erreur } }) });
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ result: r }) });
  });
  return recues;
}
const reponseBuffer = (posts) => ({ ok: true, lueLe: new Date().toISOString(), canal: { id: 'canal-fictif', nom: 'Canal fictif', service: 'linkedin' }, posts });
const poste = (id, extra) => ({ id, statut: 'publie', statutBuffer: 'sent', texte: `Texte du post ${id}`, prevuLe: null, publieLe: null, lien: null, video: false, image: false, stats: null, statsLuesLe: null, ...extra });
/** Les créneaux (mardi et jeudi 6h08, heure de Paris) des 14 prochains jours, calculés par la règle du module dans la page (un test ne lit pas js/ directement : hors de son paquet). Avec l'instant de chacun. */
const creneaux = (page) => page.evaluate(async () => {
  const R = await import('/js/modules/reseauxsociaux/logique.js');
  const L = await import('/js/modules/crm/logique.js');
  return R.creneauxAVenir(new Date(), []).map((c) => ({ ...c, instant: L.dateHeureParisVersDate(`${c.date}T${c.heure}`).toISOString() }));
});

const onglets = (page) => page.getByRole('navigation', { name: 'Écrans des réseaux sociaux' }).getByRole('link');
const ouvrirMenuSurTelephone = async (page) => { if (estTelephone(page)) await page.getByRole('button', { name: 'Ouvrir le menu' }).click(); };

test('D1 le menu montre « Réseaux sociaux » entre Veille et Automatisations ; les quatre écrans sont des onglets ; Posts, Relations et Import disent « Cet écran arrive bientôt. »', async ({ page }) => {
  await simulerBuffer(page, () => reponseBuffer([]));
  await connecter(page);
  await ouvrirMenuSurTelephone(page);
  const entrees = await page.locator('.menu .menu-entree').allTextContents();
  const i = entrees.map((t) => t.trim()).indexOf('Réseaux sociaux');
  expect(i).toBeGreaterThan(0);
  expect(entrees[i - 1].trim()).toBe('Veille');
  expect(entrees[i + 1].trim()).toBe('Automatisations');
  await expect(page.locator('.menu .menu-entree[data-chemin="reseauxsociaux/aujourdhui"] .icone')).toHaveCount(1);
  if (estTelephone(page)) await page.keyboard.press('Escape');
  await page.evaluate(() => { location.hash = '#/reseauxsociaux'; }); // la route nue mène à Aujourd'hui
  await expect(page).toHaveURL(/#\/reseauxsociaux\/aujourdhui$/);
  await expect(page.getByRole('heading', { name: 'Aujourd’hui', level: 1 })).toBeVisible();
  await expect(onglets(page)).toHaveText(['Aujourd’hui', 'Posts', 'Relations', 'Import']);
  await expect(onglets(page).nth(0)).toHaveAttribute('aria-current', 'page');
  await capture(page, 'D1-onglets');
  for (const [libelle, route] of [['Posts', 'posts'], ['Relations', 'relations'], ['Import', 'import']]) {
    await onglets(page).filter({ hasText: libelle }).click();
    await expect(page).toHaveURL(new RegExp(`#/reseauxsociaux/${route}$`));
    await expect(page.getByRole('heading', { name: libelle, level: 1 })).toBeVisible();
    await expect(page.getByText('Cet écran arrive bientôt.')).toBeVisible();
  }
  await page.evaluate(() => { location.hash = '#/reseauxsociaux/inconnu'; });
  await expect(page).toHaveURL(/#\/reseauxsociaux\/aujourdhui$/); // route inconnue : retour à Aujourd'hui
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth), 'pas de défilement horizontal').toBe(true);
});

test('D3 Réglages > Réseaux sociaux > Sauvegarde télécharge un JSON contenant les deux tables (vides acceptées) ; bouton secondaire', async ({ page }) => {
  await connecter(page);
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Réseaux sociaux');
  const bouton = page.locator('#reglages-export-reseauxsociaux [data-action="exporter-reseauxsociaux"]');
  await expect(bouton).toHaveText('Exporter mes données');
  await expect(bouton).toHaveClass(/bouton-secondaire/);
  await expect(page.locator('#reglages-export-reseauxsociaux')).not.toContainText(/CRM/);
  await attendreCalme(page);
  const [dl] = await Promise.all([page.waitForEvent('download'), bouton.click()]);
  expect(dl.suggestedFilename()).toMatch(/^chevalier-ia-reseaux-sociaux-\d{4}-\d{2}-\d{2}\.json$/);
  const json = JSON.parse(await readFile(await dl.path(), 'utf8'));
  expect(Object.keys(json.collections).sort()).toEqual(['reseauxsociaux_imports', 'reseauxsociaux_posts']);
  expect(json.collections.reseauxsociaux_posts).toEqual([]);
  expect(json.collections.reseauxsociaux_imports).toEqual([]);
  await expect(page.locator('.toast')).toContainText('Sauvegarde téléchargée');
  await capture(page, 'D3-sauvegarde');
});

test('D4 chargerBuffer : une seule lecture pour deux appels rapprochés (cache de 5 minutes), deux lectures avec force: true', async ({ page }) => {
  const recues = await simulerBuffer(page, () => reponseBuffer([]));
  await connecter(page);
  const appeler = (options) => page.evaluate(async (o) => { const D = await import('/js/modules/reseauxsociaux/donnees.js'); await D.chargerBuffer(o); return D.etat.buffer.lueLe; }, options);
  expect(await appeler({ force: true })).toBeTruthy(); // lecture n° 1 (on part d'un état connu : l'écran d'accueil n'a rien chargé)
  const avant = recues.length;
  await appeler({}); await appeler({}); // cache : aucun appel de plus
  expect(recues.length).toBe(avant);
  await appeler({ force: true }); // lecture forcée
  expect(recues.length).toBe(avant + 1);
  expect(recues.every((r) => r.action === 'lirePosts')).toBe(true);
  // Deux appels en même temps partagent la même lecture.
  await page.evaluate(async () => { const D = await import('/js/modules/reseauxsociaux/donnees.js'); await Promise.all([D.chargerBuffer({ force: true }), D.chargerBuffer({ force: true })]); });
  expect(recues.length).toBe(avant + 2);
  await page.evaluate(() => { location.hash = '#/reseauxsociaux/aujourdhui'; });
  await expect(page.getByRole('heading', { name: 'Aujourd’hui', level: 1 })).toBeVisible();
  await capture(page, 'D4-cache-buffer');
});

test('D7 Aujourd’hui, Buffer simulé avec 1 post programmé : un créneau « Programmé », les autres « Créneau vide » en rouge ; le dernier post publié montre ses chiffres', async ({ page }) => {
  await page.goto('/?emulateurs=1'); // l'application doit être chargée pour calculer les créneaux avec la règle du module
  const liste = await creneaux(page);
  const prevu = liste.length;
  expect(prevu).toBeGreaterThan(2); // quatre créneaux environ sur 14 jours
  const prevuLe = liste[0].instant;
  await simulerBuffer(page, () => reponseBuffer([
    poste('prog-1', { statut: 'programme', statutBuffer: 'scheduled', prevuLe, texte: 'Un post programmé pour la semaine prochaine, avec un texte assez long pour être coupé.' }),
    poste('pub-1', { publieLe: '2026-11-03T05:08:00.000Z', texte: 'Le dernier post publié', stats: { impressions: 1240, portee: 900, reactions: 31, commentaires: 4, tauxEngagement: 2.9 }, statsLuesLe: '2026-11-04T05:00:00.000Z' }),
    poste('pub-0', { publieLe: '2026-10-27T05:08:00.000Z', texte: 'Un post plus ancien', stats: { impressions: 10, portee: 9, reactions: 1, commentaires: 0, tauxEngagement: 1 } }),
  ]));
  await connecter(page);
  await page.evaluate(() => { location.hash = '#/reseauxsociaux/aujourdhui'; });
  const lignes = page.locator('[data-role="creneaux"] .rs-ligne');
  await expect(lignes).toHaveCount(prevu);
  await expect(lignes.locator('xpath=self::*[@data-creneau="pris"]')).toHaveCount(1);
  await expect(page.locator('[data-creneau="pris"]')).toContainText('Programmé : Un post programmé pour la semaine');
  await expect(page.locator('[data-creneau="vide"]')).toHaveCount(prevu - 1);
  await expect(page.locator('[data-creneau="vide"]').first()).toContainText('Créneau vide');
  const couleur = await page.locator('[data-creneau="vide"] .rs-pastille-rouge').first().evaluate((el) => getComputedStyle(el).color);
  expect(couleur).not.toBe(await page.locator('.rs-ligne-titre').first().evaluate((el) => getComputedStyle(el).color)); // la pastille est colorée (rouge du thème), pas le texte courant
  const dernier = page.locator('[data-carte="dernier-post"]');
  await expect(dernier.locator('[data-role="dernier-texte"]')).toHaveText('Le dernier post publié');
  await expect(dernier.locator('[data-role="dernier-chiffres"]')).toHaveText(/1\s240 impressions · 31 réactions/);
  await expect(dernier).toContainText('Publié le 3 novembre 2026');
  // Un seul bouton jaune : « Ouvrir Buffer », dans un nouvel onglet, sans référent.
  const buffer = page.locator('[data-action="ouvrir-buffer"]');
  await expect(page.locator('.bouton-principal')).toHaveCount(1);
  await expect(buffer).toHaveAttribute('href', 'https://publish.buffer.com');
  await expect(buffer).toHaveAttribute('target', '_blank');
  await expect(buffer).toHaveAttribute('rel', /noopener/);
  await capture(page, 'D7-aujourdhui');
});

test('D7 sans chiffres : « Pas encore de chiffres »', async ({ page }) => {
  await simulerBuffer(page, () => reponseBuffer([poste('pub-9', { publieLe: '2026-11-03T05:08:00.000Z', texte: 'Un post sans chiffres' })]));
  await connecter(page);
  await page.evaluate(() => { location.hash = '#/reseauxsociaux/aujourdhui'; });
  await expect(page.locator('[data-role="dernier-texte"]')).toHaveText('Un post sans chiffres');
  await expect(page.locator('[data-role="dernier-chiffres"]')).toHaveText('Pas encore de chiffres');
  await capture(page, 'D7-sans-chiffres');
});

test('D7 cas vide : aucun post, aucune relation, aucun import = une phrase grise par carte, rappel d’import avec son lien (jamais jaune)', async ({ page }) => {
  await simulerBuffer(page, () => reponseBuffer([]));
  await connecter(page);
  await page.evaluate(() => { location.hash = '#/reseauxsociaux/aujourdhui'; });
  await expect(page.locator('[data-carte="dernier-post"] [data-role="phrase-grise"]')).toHaveText('Aucun post publié pour le moment.');
  await expect(page.locator('[data-carte="relations"] [data-role="phrase-grise"]')).toHaveText('Aucune relation à traiter pour le moment.');
  await expect(page.locator('[data-carte="creneaux"] .rs-ligne').first()).toBeVisible(); // les créneaux sont calculés : toujours listés
  await expect(page.locator('[data-carte="creneaux"] [data-creneau="vide"]')).toHaveCount(await page.locator('[data-carte="creneaux"] .rs-ligne').count());
  await expect(page.locator('[data-role="rappel-import"]')).toContainText('Tu n’as pas encore importé tes échanges LinkedIn.');
  await expect(page.locator('[data-role="rappel-import"] [data-action="importer"]')).toHaveAttribute('href', /#\/reseauxsociaux\/import$/);
  await expect(page.locator('[data-role="rappel-import"] .bouton-principal')).toHaveCount(0);
  await capture(page, 'D7-cas-vide');
});

test('D7 cas d’erreur : Buffer refuse la clé = message du serveur + bouton « Réessayer » ; les relations restent là ; « Réessayer » relance la lecture', async ({ page }) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'le faux serveur répond 400 (refus), comme le vrai : le navigateur le note dans sa console' });
  const recues = await simulerBuffer(page, (n) => (n === 1 ? { erreur: 'La clé Buffer est refusée.' } : reponseBuffer([])));
  await connecter(page);
  await page.evaluate(() => { location.hash = '#/reseauxsociaux/aujourdhui'; });
  const creneaux = page.locator('[data-carte="creneaux"]');
  await expect(creneaux.locator('[data-role="erreur-buffer"]')).toHaveText('La clé Buffer est refusée.');
  await expect(page.locator('[data-carte="relations"] h2')).toHaveText('Relations à traiter'); // indépendante de Buffer
  await expect(page.locator('[data-carte="dernier-post"]')).toContainText('s’affichera dès que Buffer répondra');
  await capture(page, 'D7-erreur-buffer');
  await creneaux.locator('[data-action="reessayer-buffer"]').click();
  await expect(creneaux.locator('[data-role="creneaux"] .rs-ligne').first()).toBeVisible();
  await expect(creneaux.locator('[data-role="erreur-buffer"]')).toHaveCount(0);
  expect(recues.length).toBe(2);
});

test('D8 une écriture executer sur reseauxsociaux_posts laisse une ligne du Journal nommée « classement de post »', async ({ page }) => {
  await simulerBuffer(page, () => reponseBuffer([]));
  await connecter(page);
  await page.evaluate(async () => (await import('/js/os/journal-donnees.js')).executer([{ type: 'creer', collection: 'reseauxsociaux_posts', id: 'post-fictif-1', donnees: { pilier: 'pme', format: 'video', services: ['production'] }, horodater: ['creeLe', 'modifieLe'] }], 'essai-reseauxsociaux'));
  const ligne = (await listerDocuments('crm_audit')).find((d) => d.collection === 'reseauxsociaux_posts');
  expect([ligne.action, ligne.docId, ligne.statut]).toEqual(['creer', 'post-fictif-1', 'succes']);
  expect((await listerDocuments('reseauxsociaux_posts')).map((d) => d.id)).toEqual(['post-fictif-1']);
  await allerA(page, 'Journal des modifications');
  await expect(page.locator('.tableau-journal tbody tr').first()).toContainText('Création de 1 classement de post');
  await capture(page, 'D8-journal');
});

test('Catégories : creerCategories ajoute les quatre étiquettes manquantes en un seul lot du Journal, sans toucher aux existantes ; le second appel n’écrit rien', async ({ page }) => {
  await simulerBuffer(page, () => reponseBuffer([]));
  await connecter(page);
  await attendreCalme(page);
  const lire = () => page.evaluate(async () => { const D = await import('/js/modules/reseauxsociaux/donnees.js'); await D.chargerEtiquettes(); return { dispo: D.etat.etiquettesDisponibles, items: D.etat.etiquettes }; });
  const avant = await lire();
  expect(avant.dispo).toBe(true);
  const lignesAvant = (await listerDocuments('crm_audit')).length;
  const r = await page.evaluate(async () => (await import('/js/modules/reseauxsociaux/donnees.js')).creerCategories());
  const apres = await lire();
  expect(apres.items.slice(0, avant.items.length)).toEqual(avant.items); // les étiquettes existantes sont intactes
  const noms = apres.items.map((e) => e.nom);
  for (const nom of ['Cible', 'Relais', 'Hors cible', 'À classer', 'Partenaire']) expect(noms.filter((n) => n === nom).length, nom).toBe(1);
  expect(r.creees.every((n) => ['Cible', 'Relais', 'Hors cible', 'À classer', 'Partenaire'].includes(n))).toBe(true);
  expect(apres.items.find((e) => e.nom === 'Hors cible').id).toBe('hors_cible');
  const lignesEtiquettes = (await listerDocuments('crm_audit')).filter((d) => d.collection === 'crm_parametres' && d.docId === 'etiquettes');
  expect(lignesEtiquettes.length, 'un seul lot, une seule ligne de journal').toBe(r.creees.length ? 1 : 0);
  expect((await listerDocuments('crm_audit')).length - lignesAvant).toBe(r.creees.length ? 1 : 0);
  const second = await page.evaluate(async () => (await import('/js/modules/reseauxsociaux/donnees.js')).creerCategories());
  expect(second.creees).toEqual([]);
  expect((await listerDocuments('crm_audit')).length - lignesAvant, 'le second appel n’écrit rien').toBe(r.creees.length ? 1 : 0);
});
