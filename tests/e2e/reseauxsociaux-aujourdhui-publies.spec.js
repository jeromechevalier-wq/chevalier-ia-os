// Écran « Aujourd'hui » du module Réseaux sociaux (13/11/2026) : les 3 derniers posts publiés présentés comme les créneaux (date · heure, pastille « Publié », extrait, chiffres),
// un lien « Voir sur LinkedIn » sur chaque post publié, « Ouvrir dans Buffer » sur un créneau programmé, le pilier et le format en pastilles, « À classer » qui ouvre l'onglet Posts sur le post.
// Données fictives uniquement ; Buffer est simulé dans le navigateur. Captures : tests/e2e/captures/reseauxsociaux-aujourdhui-publies/ (« -telephone » sur téléphone).
import { test, expect, connecter, ecrireDocument, listerDocuments, creerPersonne, estTelephone } from './outils.js';

const CAPTURES = 'e2e/captures/reseauxsociaux-aujourdhui-publies';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
async function simulerBuffer(page, posts) {
  await page.route(/cloudfunctions\.net\/reseauxsociauxBuffer$/, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ result: { ok: true, lueLe: new Date().toISOString(), canal: { id: 'canal-fictif', nom: 'Canal fictif', service: 'linkedin' }, posts } }) });
  });
}
const poste = (id, extra) => ({ id, statut: 'publie', statutBuffer: 'sent', texte: `Texte du post ${id}`, prevuLe: null, publieLe: null, lien: null, video: false, image: false, stats: null, statsLuesLe: null, ...extra });
const LIEN_1 = 'https://www.linkedin.com/feed/update/urn:li:share:7000000000000000001/';
const creneauPrevu = (page) => page.evaluate(async () => {
  const R = await import('/js/modules/reseauxsociaux/logique.js');
  const L = await import('/js/modules/crm/logique.js');
  const c = R.creneauxAVenir(new Date(), [])[0];
  return L.dateHeureParisVersDate(`${c.date}T${c.heure}`).toISOString();
});

test('1 Les 3 derniers posts publiés forment une liste comme les créneaux : date · heure, pastille Publié, extrait, chiffres (— si absents)', async ({ page }) => {
  await simulerBuffer(page, [
    poste('p1', { publieLe: '2026-11-17T05:08:00.000Z', texte: 'Le plus récent', stats: { impressions: 1240, portee: 900, reactions: 31, commentaires: null, tauxEngagement: null } }),
    poste('p2', { publieLe: '2026-11-12T05:08:00.000Z', texte: 'Le deuxième' }),
    poste('p3', { publieLe: '2026-11-10T05:08:00.000Z', texte: 'Le troisième' }),
    poste('p4', { publieLe: '2026-11-05T05:08:00.000Z', texte: 'Le quatrième, absent' }),
  ]);
  await connecter(page);
  await page.evaluate(() => { location.hash = '#/reseauxsociaux/aujourdhui'; });
  const lignes = page.locator('[data-role="derniers-publies"] .rs-ligne');
  await expect(lignes).toHaveCount(3);
  await expect(lignes.nth(0).locator('[data-role="date-publication"]')).toHaveText('mardi 17 novembre · 6 h 08');
  await expect(lignes.nth(0).locator('.pastille-etiquette').first()).toHaveText('Publié');
  await expect(lignes.nth(0).locator('[data-role="dernier-texte"]')).toHaveText('Le plus récent');
  await expect(lignes.nth(0).locator('[data-role="dernier-chiffres"]')).toHaveText(/1\s240 impressions · 31 réactions · — commentaires/);
  await expect(lignes.nth(2)).toContainText('Le troisième');
  await expect(page.locator('[data-carte="dernier-post"]')).not.toContainText('Le quatrième');
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
});

test('2 « Voir sur LinkedIn » ouvre l’adresse externalLink dans un nouvel onglet (noopener) ; sans adresse, pas de lien ; « Ouvrir dans Buffer » sur un créneau programmé', async ({ page }) => {
  await page.goto('/?emulateurs=1');
  const prevuLe = await creneauPrevu(page);
  await simulerBuffer(page, [
    poste('p1', { publieLe: '2026-11-10T05:08:00.000Z', lien: LIEN_1 }),
    poste('p2', { publieLe: '2026-11-05T05:08:00.000Z', lien: null }),
    poste('p3', { publieLe: '2026-11-03T05:08:00.000Z', lien: 'javascript:alert(1)' }),
    poste('prog', { statut: 'programme', statutBuffer: 'scheduled', prevuLe, texte: 'Programmé' }),
  ]);
  await connecter(page);
  await page.evaluate(() => { location.hash = '#/reseauxsociaux/aujourdhui'; });
  const voir = page.locator('[data-action="voir-sur-linkedin"]');
  await expect(voir).toHaveCount(1);
  await expect(voir).toHaveText('Voir sur LinkedIn');
  await expect(voir).toHaveAttribute('href', LIEN_1);
  await expect(voir).toHaveAttribute('target', '_blank');
  await expect(voir).toHaveAttribute('rel', /noopener/);
  const dansBuffer = page.locator('[data-creneau="pris"] [data-action="ouvrir-dans-buffer"]');
  await expect(dansBuffer).toHaveText('Ouvrir dans Buffer');
  await expect(dansBuffer).toHaveAttribute('href', 'https://publish.buffer.com');
  await expect(dansBuffer).toHaveAttribute('target', '_blank');
  await expect(dansBuffer).toHaveAttribute('rel', /noopener/);
  await capture(page, 'liens');
});

test('3 Pilier et format en pastilles sur les posts classés ; « À classer » sur les autres ouvre l’onglet Posts sur la fenêtre de classement de ce post', async ({ page }) => {
  await simulerBuffer(page, [
    poste('classe', { publieLe: '2026-11-17T05:08:00.000Z', texte: 'Un post classé' }),
    poste('vierge', { publieLe: '2026-11-12T05:08:00.000Z', texte: 'Un post sans pilier' }),
  ]);
  await ecrireDocument('reseauxsociaux_posts/classe', { pilier: 'pedagogie', format: 'carrousel', services: [] });
  await connecter(page);
  await page.evaluate(() => { location.hash = '#/reseauxsociaux/aujourdhui'; });
  const classe = page.locator('[data-role="derniers-publies"] [data-post="classe"]');
  await expect(classe.locator('[data-role="pilier"]')).toHaveText('Pédagogie et méthodes');
  await expect(classe.locator('[data-role="format"]')).toHaveText('Carrousel');
  await expect(classe.locator('[data-role="a-classer"]')).toHaveCount(0);
  const vierge = page.locator('[data-role="derniers-publies"] [data-post="vierge"]');
  await expect(vierge.locator('[data-role="a-classer"]')).toHaveText('À classer');
  await capture(page, 'pastilles');
  await vierge.locator('[data-role="a-classer"]').click();
  await expect(page.getByRole('heading', { name: 'Posts', level: 1 })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Classer ce post' })).toBeVisible();
  await expect(page.getByRole('dialog', { name: 'Classer ce post' })).toContainText('Un post sans pilier');
});

test('4 « Imaginer un post pour ce créneau » (créneau vide) ouvre Idées avec une contrainte tirée et la date du créneau rappelée ; aucune donnée créée', async ({ page }) => {
  await simulerBuffer(page, []);
  await connecter(page);
  await page.evaluate(() => { location.hash = '#/reseauxsociaux/aujourdhui'; });
  const premier = page.locator('[data-creneau="vide"]').first();
  const libelle = (await premier.locator('.rs-ligne-titre').textContent()).trim();
  await premier.locator('[data-action="imaginer-post"]').click();
  await expect(page.getByRole('heading', { name: 'Idées', level: 1 })).toBeVisible();
  await expect(page.locator('[data-carte="contrainte"] [data-role="contrainte"]')).toBeVisible();
  await expect(page.locator('[data-role="creneau-demande"]')).toHaveText(`Pour le créneau du ${libelle}`);
  expect(await listerDocuments('reseauxsociaux_idees')).toHaveLength(0);
  await capture(page, 'imaginer');
});

test('5 Rappel glissant : « 21 derniers jours : N posts publiés (objectif 6 à 9…) », pastille selon N, bornes comprises', async ({ page }) => {
  await page.goto('/?emulateurs=1');
  const dates = await page.evaluate(async () => {
    const L = await import('/js/modules/crm/logique.js');
    const aj = L.aujourdhuiParis(new Date());
    const iso = (n) => `${L.ajouterJours(aj, n)}T12:00:00.000Z`;
    return { dedans: [0, -1, -5, -10, -15, -20].map(iso), dehors: iso(-21) };
  });
  // 6 dans la fenêtre (aujourd'hui compris) + 1 il y a 21 jours (exclu) = 6 : vert
  await simulerBuffer(page, [...dates.dedans.map((d, i) => poste(`d${i}`, { publieLe: d })), poste('hors', { publieLe: dates.dehors })]);
  await connecter(page);
  await page.evaluate(() => { location.hash = '#/reseauxsociaux/aujourdhui'; });
  const rythme = page.locator('[data-role="rythme"]');
  await expect(rythme).toContainText('21 derniers jours : 6 posts publiés (objectif 6 à 9, soit 2 à 3 par semaine)');
  await expect(rythme).toHaveAttribute('data-niveau', 'vert');
  await expect(rythme.locator('.pastille-etiquette')).toHaveText('Objectif atteint');
  await capture(page, 'rythme');
});

test('6 Relations à traiter : « Ouvrir son profil LinkedIn » seulement quand l’adresse du profil est déjà dans la fiche', async ({ page }) => {
  await simulerBuffer(page, []);
  await creerPersonne('rel-1', { nom: 'Alice Exemple', source: 'LinkedIn', linkedin: 'https://www.linkedin.com/in/alice-exemple' });
  await creerPersonne('rel-2', { nom: 'Bastien Exemple', source: 'LinkedIn' });
  const jour = (n) => new Date(Date.now() - n * 86400000).toLocaleDateString('en-CA', { timeZone: 'Europe/Paris' });
  for (const id of ['rel-1', 'rel-2']) await ecrireDocument(`crm_activites/a-${id}`, { type: 'linkedin', titre: 'Échange LinkedIn', fait: true, date: jour(10), dateFait: new Date(), personneId: id, sens: 'envoye', voix: 1, auteur: 'jerome@exemple.test' });
  await connecter(page);
  await page.evaluate(() => { location.hash = '#/reseauxsociaux/aujourdhui'; });
  const lignes = page.locator('[data-role="relations"] .rs-ligne');
  await expect(lignes).toHaveCount(2);
  const liens = page.locator('[data-action="ouvrir-profil-relation"]');
  await expect(liens).toHaveCount(1);
  await expect(liens).toHaveAttribute('href', 'https://www.linkedin.com/in/alice-exemple');
  await expect(liens).toHaveAttribute('target', '_blank');
  await expect(liens).toHaveAttribute('rel', /noopener/);
});
