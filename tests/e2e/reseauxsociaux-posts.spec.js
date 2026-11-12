// Module Réseaux sociaux, écran Posts (11/11/2026), chez Jérôme (racine, règles du CRM). Un test par critère du cahier (E1 à E10), nom commençant par son numéro,
// UNE capture chacun dans tests/e2e/captures/reseauxsociaux-posts/ (« -telephone » sur téléphone). Données fictives uniquement ; Buffer est simulé dans le navigateur (aucun serveur réel).
// Le même écran chez un client (Buffer non branché, E9) : tests/e2e/reseauxsociaux-posts-client.spec.js. Les règles pures (colonnes, moyenne, équilibre, contrôles) : tests/reseauxsociaux-posts-logique.test.js.
import { test, expect, connecter, allerA, attendreCalme, listerDocuments, lireDocument, ecrireDocument, estTelephone } from './outils.js';

const CAPTURES = 'e2e/captures/reseauxsociaux-posts';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
// Cet écran n'utilise pas Google : le script de l'API est remplacé par un fichier vide (sans réseau, il ne produit pas d'erreur de console).
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
    const r = typeof reponse === 'function' ? reponse(recues.length) : reponse;
    if (r.erreur) return route.fulfill({ status: 400, headers: CORS, contentType: 'application/json', body: JSON.stringify({ error: { status: 'FAILED_PRECONDITION', message: r.erreur } }) });
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ result: r }) });
  });
  return recues;
}
const reponseBuffer = (posts) => ({ ok: true, lueLe: new Date().toISOString(), canal: { id: 'canal-fictif', nom: 'Canal fictif', service: 'linkedin' }, posts });
const poste = (id, extra) => ({ id, statut: 'publie', statutBuffer: 'sent', texte: `Texte du post ${id}`, prevuLe: null, publieLe: null, lien: null, video: false, image: false, stats: null, statsLuesLe: null, ...extra });
const STATS_1 = { impressions: 1240, portee: 900, reactions: 31, commentaires: 4, tauxEngagement: 2.9 };
/** Trois posts : un brouillon, un programmé, un publié avec ses chiffres. */
const TROIS = () => reponseBuffer([
  poste('brouillon-1', { statut: 'brouillon', statutBuffer: 'draft', texte: 'Un brouillon à terminer' }),
  poste('prog-1', { statut: 'programme', statutBuffer: 'scheduled', prevuLe: '2026-11-17T05:08:00.000Z', texte: 'Un post programmé pour mardi\nDeuxième ligne qui ne se voit pas sur la carte' }),
  poste('pub-1', { publieLe: '2026-11-03T05:08:00.000Z', texte: 'Le post publié', stats: STATS_1, statsLuesLe: '2026-11-04T05:00:00.000Z' }),
]);

async function ouvrirPosts(page, reponse) {
  const recues = await simulerBuffer(page, reponse);
  await connecter(page);
  await page.evaluate(() => { location.hash = '#/reseauxsociaux/posts'; });
  await expect(page.getByRole('heading', { name: 'Posts', level: 1 })).toBeVisible();
  return recues;
}
/** Sur téléphone, la matrice et le contrôle partent repliés : on les déplie pour lire leur contenu. */
async function deplier(page) {
  await expect(page.locator('[data-carte="controle"]')).toBeVisible();
  await attendreCalme(page); // l'écran est redessiné à chaque lot de données de Buffer ou de la base : on agit sur un écran posé
  const fermes = page.locator('[data-carte] .section-bascule[aria-expanded="false"]');
  for (let i = 0; i < 4 && await fermes.count(); i++) await fermes.first().click();
  await expect(fermes).toHaveCount(0);
}
const carte = (page, id) => page.locator(`.carte-post[data-post="${id}"]`);
const fenetre = (page) => page.getByRole('dialog', { name: 'Classer ce post' });
const enregistrer = (page) => fenetre(page).getByRole('button', { name: 'Enregistrer' });
const sansDebordement = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
/** Classe un post par la fenêtre : pilier, format, services (libellés affichés). */
async function classer(page, id, { pilier, format, services = [] }) {
  await carte(page, id).click();
  await expect(fenetre(page)).toBeVisible();
  if (pilier) await fenetre(page).locator('[data-champ="pilier"]').selectOption({ label: pilier });
  if (format) await fenetre(page).locator('[data-champ="format"]').selectOption({ label: format });
  for (const s of services) await fenetre(page).getByLabel(s, { exact: true }).check();
  await enregistrer(page).click();
}

test('E1 Buffer simulé (brouillon, programmé, publié) : trois colonnes « Brouillons », « Programmés », « Publiés » avec une carte chacune et le compteur « 3 posts »', async ({ page }) => {
  await ouvrirPosts(page, TROIS);
  await expect(page.locator('.kanban .colonne h2')).toHaveText(['Brouillons', 'Programmés', 'Publiés']);
  for (const [colonne, id] of [['brouillons', 'brouillon-1'], ['programmes', 'prog-1'], ['publies', 'pub-1']]) {
    await expect(page.locator(`[data-colonne="${colonne}"] .carte-post`)).toHaveCount(1);
    await expect(page.locator(`[data-colonne="${colonne}"] .carte-post[data-post="${id}"]`)).toBeVisible();
    await expect(page.locator(`[data-colonne="${colonne}"] .colonne-totaux`)).toHaveText('1 post');
  }
  await expect(page.locator('.compteur-liste')).toHaveText('3 posts');
  await expect(page.getByRole('navigation', { name: 'Écrans des réseaux sociaux' }).getByRole('link').nth(1)).toHaveAttribute('aria-current', 'page');
  // Un seul bouton jaune : « + Post », qui ouvre Buffer dans un nouvel onglet (jamais d'écriture dans Buffer).
  await expect(page.locator('.page-tete .bouton-principal')).toHaveCount(1);
  const plus = page.locator('[data-action="ouvrir-buffer"]');
  await expect(plus).toHaveText('+ Post');
  await expect(plus).toHaveAttribute('href', 'https://publish.buffer.com');
  await expect(plus).toHaveAttribute('target', '_blank');
  await expect(plus).toHaveAttribute('rel', /noopener/);
  await expect(page.locator('[data-action="actualiser-buffer"]')).toHaveClass(/bouton-secondaire/);
  await capture(page, 'E1-kanban');
});

test('E1 cas vide : aucun post dans Buffer = une phrase pour écrire dans Buffer ; la matrice et le contrôle restent là', async ({ page }) => {
  await ouvrirPosts(page, () => reponseBuffer([]));
  await expect(page.getByText('Aucun post pour le moment. Écris-en un dans Buffer, il apparaîtra ici.')).toBeVisible();
  await expect(page.locator('.kanban')).toHaveCount(0);
  await deplier(page);
  await expect(page.locator('[data-carte="matrice"]')).toContainText('Pas encore de posts publiés ou programmés.');
  await expect(page.locator('[data-carte="matrice"] [data-role="matrice"]')).toHaveCount(0);
  await expect(page.locator('[data-carte="matrice"] [data-role="suggestions"]')).toHaveCount(0);
  await expect(page.locator('[data-carte="controle"]')).toBeVisible();
  await capture(page, 'E1-cas-vide');
});

test('E2 une carte n’est pas déplaçable (draggable absent) ; celle d’un publié montre impressions et réactions ; sans chiffres : « Pas encore de chiffres »', async ({ page }) => {
  await ouvrirPosts(page, () => reponseBuffer([
    poste('pub-1', { publieLe: '2026-11-03T05:08:00.000Z', stats: STATS_1 }),
    poste('pub-2', { publieLe: '2026-10-27T05:08:00.000Z' }),
    poste('prog-1', { statut: 'programme', prevuLe: '2026-11-17T05:08:00.000Z' }),
  ]));
  await expect(page.locator('.carte-post')).toHaveCount(3);
  for (const c of await page.locator('.carte-post').all()) {
    await expect(c).not.toHaveAttribute('draggable', /.*/);
    expect(await c.evaluate((el) => el.draggable)).toBe(false);
  }
  await expect(carte(page, 'pub-1').locator('[data-role="chiffres-post"]')).toHaveText(/^1\s240 impressions · 31 réactions$/);
  await expect(carte(page, 'pub-2').locator('[data-role="chiffres-post"]')).toHaveText('Pas encore de chiffres');
  await expect(carte(page, 'prog-1').locator('[data-role="chiffres-post"]')).toHaveCount(0); // un post pas encore publié n'a pas de chiffres à montrer
  await expect(carte(page, 'prog-1').locator('[data-role="date-post"]')).toHaveText('Mardi 17 nov. 6h08');
  await expect(carte(page, 'pub-1').locator('[data-role="date-post"]')).toHaveText('Publié le 3 novembre 2026');
  await expect(carte(page, 'pub-1').locator('[data-role="pilier-vide"]')).toHaveText('À classer'); // post pas encore classé : pastille grise
  // Glisser une carte dans une autre colonne ne change rien.
  await carte(page, 'prog-1').dragTo(page.locator('[data-colonne="publies"] .colonne-corps'));
  await expect(page.locator('[data-colonne="programmes"] .carte-post[data-post="prog-1"]')).toHaveCount(1);
  await capture(page, 'E2-cartes');
});

test('E3 cliquer une carte, pilier « Cas concrets », format « Vidéo 9:16 », service « Production », enregistrer : le document est écrit, le Journal l’a noté, la carte montre les pastilles ; « Enregistrer » est grisé avant toute modification', async ({ page }) => {
  await ouvrirPosts(page, TROIS);
  await carte(page, 'prog-1').click();
  await expect(fenetre(page)).toBeVisible();
  await expect(fenetre(page).locator('[data-role="post-classe"]')).toHaveText('Un post programmé pour mardi');
  await expect(enregistrer(page)).toBeDisabled();
  await expect(enregistrer(page)).toHaveClass(/bouton-secondaire/);
  await fenetre(page).locator('[data-champ="pilier"]').selectOption({ label: 'Cas concrets' });
  await expect(enregistrer(page)).toBeEnabled();
  await expect(enregistrer(page)).toHaveClass(/bouton-principal/);
  await fenetre(page).locator('[data-champ="pilier"]').selectOption({ label: 'À classer' }); // retour à l'état de départ : grisé de nouveau
  await expect(enregistrer(page)).toBeDisabled();
  await fenetre(page).locator('[data-champ="pilier"]').selectOption({ label: 'Cas concrets' });
  await fenetre(page).locator('[data-champ="format"]').selectOption({ label: 'Vidéo 9:16' });
  await fenetre(page).getByLabel('Production', { exact: true }).check();
  await enregistrer(page).click();
  await expect(fenetre(page)).toHaveCount(0);
  await expect(page.locator('.toast')).toContainText('Classement enregistré');
  const document_ = await lireDocument('reseauxsociaux_posts/prog-1');
  expect(document_).toMatchObject({ pilier: 'cas_concrets', format: 'video', services: ['production'] });
  expect(document_.creeLe).toBeTruthy();
  expect(Object.keys(document_).sort()).toEqual(['creeLe', 'format', 'modifieLe', 'pilier', 'services']); // jamais le texte, la date, le statut ni un chiffre de Buffer
  await expect(carte(page, 'prog-1').locator('[data-role="pilier"]')).toHaveText('Cas concrets');
  await expect(carte(page, 'prog-1').locator('[data-role="format"]')).toHaveText('Vidéo 9:16');
  await attendreCalme(page);
  await allerA(page, 'Journal des modifications');
  await expect(page.locator('.tableau-journal tbody tr').first()).toContainText('Création de 1 classement de post');
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Posts', level: 1 })).toBeVisible();
  await expect(carte(page, 'prog-1')).toBeVisible();
  await capture(page, 'E3-classement');
});

test('E4 reclasser le même post écrit une modification (un seul document, la date de création est gardée)', async ({ page }) => {
  await ouvrirPosts(page, TROIS);
  await classer(page, 'prog-1', { pilier: 'Cas concrets', format: 'Vidéo 9:16', services: ['Production'] });
  await expect(fenetre(page)).toHaveCount(0);
  const premier = await lireDocument('reseauxsociaux_posts/prog-1');
  await classer(page, 'prog-1', { pilier: 'Pédagogie et méthodes' });
  await expect(fenetre(page)).toHaveCount(0);
  await expect(carte(page, 'prog-1').locator('[data-role="pilier"]')).toHaveText('Pédagogie et méthodes');
  const documents = await listerDocuments('reseauxsociaux_posts');
  expect(documents.map((d) => d.id)).toEqual(['prog-1']);
  expect(documents[0]).toMatchObject({ pilier: 'pedagogie', format: 'video', services: ['production'] });
  expect(String(documents[0].creeLe)).toBe(String(premier.creeLe));
  const lignes = (await listerDocuments('crm_audit')).filter((d) => d.collection === 'reseauxsociaux_posts');
  expect(lignes.map((d) => d.action).sort()).toEqual(['creer', 'modifier']);
  await capture(page, 'E4-reclasser');
});

test('E4 une erreur d’écriture laisse la fenêtre ouverte avec un message, rien n’est écrit (identifiant de post refusé : l’écriture réelle ne se simule pas sur l’émulateur)', async ({ page }) => {
  await ouvrirPosts(page, () => reponseBuffer([poste('post invalide/1', { statut: 'brouillon', texte: 'Un post à l’identifiant refusé' })]));
  await carte(page, 'post invalide/1').click();
  await fenetre(page).locator('[data-champ="pilier"]').selectOption({ label: 'Cas concrets' });
  await enregistrer(page).click();
  await expect(fenetre(page).locator('[data-role="erreur-classement"]')).toContainText('Ça n’a pas abouti.');
  await expect(fenetre(page)).toBeVisible();
  await expect(enregistrer(page)).toBeEnabled(); // on peut réessayer
  expect(await listerDocuments('reseauxsociaux_posts')).toEqual([]);
  expect((await listerDocuments('crm_audit')).filter((d) => d.collection === 'reseauxsociaux_posts')).toEqual([]);
  await capture(page, 'E4-erreur');
});

test('E5 vue Statistiques : une ligne par post publié, colonnes triables, moyenne en pied, « — » pour une valeur absente', async ({ page }) => {
  await ecrireDocument('reseauxsociaux_posts/pub-1', { pilier: 'pme', format: 'video', services: [] });
  await ouvrirPosts(page, () => reponseBuffer([
    poste('pub-1', { publieLe: '2026-11-03T05:08:00.000Z', stats: STATS_1 }),
    poste('pub-2', { publieLe: '2026-10-27T05:08:00.000Z', stats: { impressions: 500, portee: null, reactions: 20, commentaires: null, tauxEngagement: null } }),
    poste('pub-3', { publieLe: '2026-10-20T04:08:00.000Z' }),
    poste('prog-1', { statut: 'programme', prevuLe: '2026-11-17T05:08:00.000Z' }), // pas dans le tableau
  ]));
  await page.locator('[data-vue="stats"]').click();
  await expect(page.locator('[data-vue="stats"]')).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('.kanban')).toHaveCount(0);
  await expect(page.locator('.tableau-posts thead th')).toHaveText(['Date', 'Post', 'Pilier', 'Format', 'Impressions', 'Portée', 'Réactions', 'Commentaires', 'Engagement']);
  const lignes = page.locator('.tableau-posts tbody tr');
  await expect(lignes).toHaveCount(3);
  await expect(lignes.locator('xpath=self::*[@data-post="pub-1"]')).toHaveCount(1);
  expect(await lignes.evaluateAll((trs) => trs.map((t) => t.dataset.post))).toEqual(['pub-1', 'pub-2', 'pub-3']); // plus récent d'abord
  const ligne = (id, colonne) => page.locator(`.tableau-posts tr[data-post="${id}"] td[data-colonne="${colonne}"]`);
  await expect(ligne('pub-1', 'impressions')).toHaveText(/^1\s240$/);
  await expect(ligne('pub-1', 'pilier')).toHaveText('Cas concrets');
  await expect(ligne('pub-1', 'format')).toHaveText('Vidéo 9:16');
  await expect(ligne('pub-1', 'tauxEngagement')).toHaveText(/^2,9\s%$/);
  await expect(ligne('pub-2', 'portee')).toHaveText('—'); // valeur absente : jamais un zéro inventé
  await expect(ligne('pub-2', 'pilier')).toHaveText('—');
  await expect(ligne('pub-3', 'impressions')).toHaveText('—');
  // Moyenne : chaque colonne ne compte que les posts qui ont la valeur.
  const moyenne = (colonne) => page.locator(`.tableau-posts tfoot td[data-colonne="${colonne}"]`);
  await expect(page.locator('.tableau-posts tfoot td').first()).toHaveText('Moyenne');
  await expect(moyenne('impressions')).toHaveText('870'); // (1 240 + 500) / 2
  await expect(moyenne('portee')).toHaveText('900');
  await expect(moyenne('reactions')).toHaveText('26'); // (31 + 20) / 2 = 25,5 arrondi à l'unité
  await expect(moyenne('commentaires')).toHaveText('4');
  await expect(moyenne('tauxEngagement')).toHaveText(/^2,9\s%$/);
  await expect(page.locator('[data-role="note-stats"]')).toHaveText('Les chiffres viennent de Buffer et se mettent à jour tout seuls.');
  // Tri : un clic sur « Impressions » (décroissant), un second (croissant, la valeur absente reste à la fin).
  const ordre = () => lignes.evaluateAll((trs) => trs.map((t) => t.dataset.post));
  await page.locator('th[data-colonne="impressions"] .tri').click();
  await expect(page.locator('th[data-colonne="impressions"]')).toHaveAttribute('aria-sort', 'descending');
  expect(await ordre()).toEqual(['pub-1', 'pub-2', 'pub-3']);
  await page.locator('th[data-colonne="impressions"] .tri').click();
  await expect(page.locator('th[data-colonne="impressions"]')).toHaveAttribute('aria-sort', 'ascending');
  expect(await ordre()).toEqual(['pub-2', 'pub-1', 'pub-3']);
  await page.locator('th[data-colonne="date"] .tri').click(); // date : décroissant d'abord
  await page.locator('th[data-colonne="date"] .tri').click();
  expect(await ordre()).toEqual(['pub-3', 'pub-2', 'pub-1']);
  expect(await sansDebordement(page)).toBe(true);
  await capture(page, 'E5-statistiques');
});

test('E5 vue Statistiques sans post publié : une phrase, pas de tableau', async ({ page }) => {
  await ouvrirPosts(page, () => reponseBuffer([poste('prog-1', { statut: 'programme', prevuLe: '2026-11-17T05:08:00.000Z' })]));
  await page.locator('[data-vue="stats"]').click();
  await expect(page.getByText('Aucun post publié pour le moment.')).toBeVisible();
  await expect(page.locator('.tableau-posts')).toHaveCount(0);
});

/** Jeu de la matrice : a, b, c classés des deux côtés (pilier en ANCIEN identifiant : l'écran doit les lire), d non classé, e brouillon (hors compte). */
async function ouvrirMatrice(page) {
  await ecrireDocument('reseauxsociaux_posts/a', { pilier: 'pme', format: 'video', services: [] });
  await ecrireDocument('reseauxsociaux_posts/b', { pilier: 'cas_concrets', format: 'texte', services: [] });
  await ecrireDocument('reseauxsociaux_posts/c', { pilier: 'claude', format: 'image', services: [] });
  await ouvrirPosts(page, () => reponseBuffer([
    poste('a', { publieLe: '2026-11-03T05:08:00.000Z', video: true }), poste('b', { publieLe: '2026-10-27T05:08:00.000Z' }),
    poste('c', { statut: 'programme', prevuLe: '2026-11-17T05:08:00.000Z' }), poste('d', { publieLe: '2026-10-20T04:08:00.000Z' }),
    poste('e', { statut: 'brouillon' }), // un brouillon ne compte pas
  ]));
  await deplier(page);
  return page.locator('[data-carte="matrice"]');
}
const caseM = (carteM, pilier, format) => carteM.locator(`[data-role="pilier-${pilier}"] td[data-format="${format}"]`);
/** Une case ou un total affiche deux lignes : le nombre de posts, puis le pourcentage (ou « % (cible n %) » pour un total de ligne). */
async function verifierCase(td, nombre, part) {
  await expect(td.locator('.rs-case-nombre')).toHaveText(nombre);
  if (part !== null) await expect(td.locator('.rs-case-part')).toHaveText(part);
}

test('E6 matrice pilier × format : une case = nombre de posts et pourcentage, cases à 0 grisées, totaux de ligne face à la cible, totaux de colonne, 50 % de vidéos sous les colonnes vidéo', async ({ page }) => {
  const carteM = await ouvrirMatrice(page);
  await expect(carteM.locator('h2')).toHaveText('Matrice pilier × format');
  await expect(carteM.locator('thead th')).toHaveText(['Pilier', 'Texte', 'Image', 'Carrousel', 'Vidéo 9:16', 'Animation 16:9', 'Total et cible']);
  await expect(carteM.locator('tbody tr th')).toHaveText(['Cas concrets', 'Pédagogie et méthodes', 'Actu IA décryptée', 'Ma démarche et mon offre']);
  await verifierCase(caseM(carteM, 'cas_concrets', 'video'), '1', '33 %'); // 1 post, 33 % des 3 posts classés
  await verifierCase(caseM(carteM, 'cas_concrets', 'texte'), '1', '33 %');
  await verifierCase(caseM(carteM, 'pedagogie', 'image'), '1', '33 %');
  await expect(caseM(carteM, 'cas_concrets', 'video')).not.toHaveClass(/rs-case-zero/);
  await verifierCase(caseM(carteM, 'actu_ia', 'carrousel'), '0', '0 %');
  await expect(caseM(carteM, 'actu_ia', 'carrousel')).toHaveClass(/rs-case-zero/); // un trou : grisé
  // Totaux : lignes face à leur cible (anciens identifiants lus comme les nouveaux), colonnes, cible de vidéos.
  await verifierCase(carteM.locator('[data-role="pilier-cas_concrets"] [data-role="total-ligne"]'), '2', '67 % (cible 25 %)');
  await verifierCase(carteM.locator('[data-role="pilier-pedagogie"] [data-role="total-ligne"]'), '1', '33 % (cible 35 %)');
  await verifierCase(carteM.locator('[data-role="pilier-actu_ia"] [data-role="total-ligne"]'), '0', '0 % (cible 15 %)');
  await verifierCase(carteM.locator('[data-role="pilier-demarche_offre"] [data-role="total-ligne"]'), '0', '0 % (cible 25 %)');
  await verifierCase(carteM.locator('[data-role="total-colonnes"] td[data-format="texte"]'), '1', '33 %');
  await verifierCase(carteM.locator('[data-role="total-colonnes"] td[data-format="video"]'), '1', '33 %');
  await verifierCase(carteM.locator('[data-role="total-general"]'), '3', null);
  await expect(carteM.locator('[data-role="videos"] .rs-cible-video')).toHaveText('33 % de vidéos et d’animations (cible 50 %)');
  await expect(carteM.locator('[data-role="sans-classement"]')).toHaveText('1 sans pilier, 1 sans format');
  await expect(carteM.locator('[data-role="pilier-pme"], [data-role="pilier-claude"], [data-role="pilier-proximite"], [data-role="pilier-offre"]')).toHaveCount(0); // plus que les quatre piliers
  expect(await sansDebordement(page)).toBe(true);
  await capture(page, 'E6-matrice');
});

test('E6 « Prochain post à imaginer » : trois cases pilier × format, calculées sur l’écart de la ligne et de la colonne à leur cible, chacune avec une phrase', async ({ page }) => {
  const carteM = await ouvrirMatrice(page);
  const sug = carteM.locator('[data-role="suggestions"]');
  await expect(sug.locator('.rs-suggestions-titre')).toHaveText('Prochain post à imaginer');
  await expect(sug.locator('[data-role="suggestion"] .rs-ligne-titre')).toHaveText(['Ma démarche et mon offre × Vidéo 9:16', 'Ma démarche et mon offre × Animation 16:9', 'Actu IA décryptée × Vidéo 9:16']);
  await expect(sug.locator('[data-role="suggestion"]').first().locator('.rs-ligne-detail')).toHaveText('Ma démarche et mon offre est à 0 % (cible 25 %), les vidéos à 33 % (cible 50 %) et cette case est encore vide.');
  await expect(sug.locator('[data-role="suggestion"]').first()).toHaveAttribute('data-pilier', 'demarche_offre');
  await capture(page, 'E6-suggestions');
});

test('E6 téléphone : la matrice défile horizontalement dans son propre conteneur, la page ne défile jamais', async ({ page }) => {
  const carteM = await ouvrirMatrice(page);
  const defile = carteM.locator('[data-role="matrice-defile"]');
  await expect(defile).toBeVisible();
  const mesures = await defile.evaluate((el) => ({ contenu: el.scrollWidth, boite: el.clientWidth, overflowX: getComputedStyle(el).overflowX }));
  expect(mesures.overflowX).toBe('auto');
  if (estTelephone(page)) expect(mesures.contenu).toBeGreaterThan(mesures.boite); // la matrice déborde de son conteneur, pas de la page
  expect(await sansDebordement(page)).toBe(true);
  await capture(page, 'E6-matrice-defilement');
});

test('E6 matrice avec les nouveaux identifiants de pilier : les écritures nouvelles se lisent comme les anciennes', async ({ page }) => {
  await ecrireDocument('reseauxsociaux_posts/a', { pilier: 'demarche_offre', format: 'carrousel', services: [] });
  await ecrireDocument('reseauxsociaux_posts/b', { pilier: 'proximite', format: 'carrousel', services: [] });
  await ouvrirPosts(page, () => reponseBuffer([poste('a', { publieLe: '2026-11-03T05:08:00.000Z' }), poste('b', { publieLe: '2026-10-27T05:08:00.000Z' })]));
  await deplier(page);
  await verifierCase(caseM(page.locator('[data-carte="matrice"]'), 'demarche_offre', 'carrousel'), '2', '100 %');
});

test('E6 cas vide : sans post publié ni programmé, la carte le dit et ne montre ni matrice ni suggestion ; avec des posts non classés, la matrice est à zéro et le dit', async ({ page }) => {
  await ouvrirPosts(page, () => reponseBuffer([poste('d', { publieLe: '2026-10-20T04:08:00.000Z' })]));
  await deplier(page);
  const carteM = page.locator('[data-carte="matrice"]');
  await expect(carteM.locator('[data-role="matrice"]')).toBeVisible();
  await expect(carteM.locator('td.rs-case-zero')).toHaveCount(20);
  await expect(carteM.locator('[data-role="sans-classement"]')).toHaveText('1 sans pilier, 1 sans format');
  await expect(carteM.locator('[data-role="suggestion"]')).toHaveCount(3);
  await capture(page, 'E6-matrice-non-classes');
});

test('E7 contrôle éditorial : sans aucun post, chaque créneau du mardi et du jeudi attend un post ; un texte trop long et un post programmé non classé sont signalés', async ({ page }) => {
  await ouvrirPosts(page, () => reponseBuffer([]));
  await deplier(page);
  const vides = page.locator('[data-carte="controle"] [data-controle="a"]');
  expect(await vides.count()).toBeGreaterThanOrEqual(3);
  await expect(vides.first()).toContainText(/^Le créneau du (mardi|jeudi) .+ à 6 h 08 attend un post\.$/);
  await expect(page.locator('[data-carte="controle"] [data-role="tout-en-ordre"]')).toHaveCount(0);
});

test('E7 contrôle éditorial : textes trop longs (b), programmé non classé (c), part de vidéos (d) et piliers loin de leur cible (e) s’affichent en phrases', async ({ page }) => {
  const six = Array.from({ length: 6 }, (_, i) => poste(`u${i}`, { publieLe: `2026-10-0${i + 1}T05:08:00.000Z` }));
  for (const p of six) await ecrireDocument(`reseauxsociaux_posts/${p.id}`, { pilier: 'cas_concrets', format: 'texte', services: [] });
  await ouvrirPosts(page, () => reponseBuffer([
    ...six,
    poste('long-1', { statut: 'programme', prevuLe: '2026-11-17T05:08:00.000Z', texte: 'x'.repeat(3050) }),
    poste('brouillon-long', { statut: 'brouillon', texte: `${'y'.repeat(3000)}z` }),
  ]));
  await deplier(page);
  const points = page.locator('[data-carte="controle"] [data-role="controles"] li');
  await expect(page.locator('[data-carte="controle"] [data-controle="b"]').first()).toContainText(/Ce texte dépasse la limite de LinkedIn de 50 caractères/);
  await expect(page.locator('[data-carte="controle"] [data-controle="b"]').nth(1)).toContainText(/de 1 caractère/);
  await expect(page.locator('[data-carte="controle"] [data-controle="c"]')).toContainText('n’a pas encore de pilier ni de format.');
  await expect(page.locator('[data-carte="controle"] [data-controle="d"]')).toContainText('La part de vidéos est de 0 % sur les 7 derniers posts (objectif 50 %).');
  await expect(page.locator('[data-carte="controle"] [data-controle="e"]').first()).toContainText('Le pilier « Cas concrets » pèse');
  expect(await points.count()).toBeGreaterThanOrEqual(5);
  await capture(page, 'E7-controle');
});

test('E7 aucun contrôle en échec : « Tout est en ordre. »', async ({ page }) => {
  await page.goto('/?emulateurs=1'); // l'application doit être chargée pour calculer les créneaux avec la règle du module
  const creneaux = await page.evaluate(async () => {
    const R = await import('/js/modules/reseauxsociaux/logique.js');
    const L = await import('/js/modules/crm/logique.js');
    return R.creneauxAVenir(new Date(), []).map((c) => L.dateHeureParisVersDate(`${c.date}T${c.heure}`).toISOString());
  });
  const posts = creneaux.map((prevuLe, i) => poste(`p${i}`, { statut: 'programme', statutBuffer: 'scheduled', prevuLe, video: true, texte: `Post programmé ${i}` }));
  expect(posts.length).toBeGreaterThanOrEqual(3);
  const piliers = ['cas_concrets', 'pedagogie', 'demarche_offre', 'cas_concrets', 'actu_ia', 'pedagogie', 'demarche_offre', 'cas_concrets', 'demarche_offre', 'pedagogie']; // répartis selon la cible : avec 6 posts ou plus, un seul pilier ferait s'allumer le point e
  for (const [i, p] of posts.entries()) await ecrireDocument(`reseauxsociaux_posts/${p.id}`, { pilier: piliers[i % piliers.length], format: 'video', services: [] });
  await ouvrirPosts(page, () => reponseBuffer(posts));
  await deplier(page);
  await expect(page.locator('[data-carte="controle"] [data-role="tout-en-ordre"]')).toHaveText('Tout est en ordre.');
  await expect(page.locator('[data-carte="controle"] [data-controle]')).toHaveCount(0);
  await capture(page, 'E7-tout-en-ordre');
});

test('E8 filtres : « Non classés seulement » montre les posts sans classement ; la recherche porte sur le texte ; la pastille se retire', async ({ page }) => {
  await ecrireDocument('reseauxsociaux_posts/a', { pilier: 'cas_concrets', format: 'video', services: ['commercial'] });
  await ecrireDocument('reseauxsociaux_posts/b', { pilier: 'pedagogie', format: 'texte', services: [] });
  await ouvrirPosts(page, () => reponseBuffer([
    poste('a', { publieLe: '2026-11-03T05:08:00.000Z', texte: 'Un devis fait en dix minutes' }), poste('b', { publieLe: '2026-10-27T05:08:00.000Z', texte: 'Claude au quotidien' }),
    poste('c', { publieLe: '2026-10-20T04:08:00.000Z', texte: 'Évènement à Manosque' }), poste('d', { statut: 'brouillon', texte: 'Un autre brouillon' }),
  ]));
  await expect(page.locator('.carte-post')).toHaveCount(4);
  await page.locator('[data-action="filtres"]').click();
  await page.getByRole('dialog', { name: 'Filtres' }).getByLabel('Non classés seulement').check();
  await page.getByRole('dialog', { name: 'Filtres' }).getByRole('button', { name: 'Appliquer' }).click();
  expect(await page.locator('.carte-post').evaluateAll((l) => l.map((c) => c.dataset.post).sort())).toEqual(['c', 'd']);
  await expect(page.locator('.compteur-liste')).toHaveText('2 posts sur 4');
  await expect(page.locator('[data-action="filtres"] .compteur-filtres')).toHaveText('1');
  await capture(page, 'E8-filtres');
  await page.getByRole('button', { name: 'Retirer le filtre : Non classés seulement' }).click();
  await expect(page.locator('.carte-post')).toHaveCount(4);
  // Recherche dans le texte (sans accents ni majuscules).
  await page.getByRole('searchbox', { name: 'Rechercher un post' }).fill('EVENEMENT');
  expect(await page.locator('.carte-post').evaluateAll((l) => l.map((c) => c.dataset.post))).toEqual(['c']);
  await page.getByRole('searchbox', { name: 'Rechercher un post' }).fill('');
  // Filtre par pilier.
  await page.locator('[data-action="filtres"]').click();
  await page.getByRole('dialog', { name: 'Filtres' }).getByLabel('Cas concrets').check();
  await page.getByRole('dialog', { name: 'Filtres' }).getByRole('button', { name: 'Appliquer' }).click();
  expect(await page.locator('.carte-post').evaluateAll((l) => l.map((c) => c.dataset.post))).toEqual(['a']);
});

test('E9 cas d’erreur : Buffer refuse la clé = message du serveur + « Réessayer » ; « Réessayer » relance la lecture et l’écran revient', async ({ page }) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'le faux serveur répond 400 (refus), comme le vrai : le navigateur le note dans sa console' });
  const recues = await ouvrirPosts(page, (n) => (n === 1 ? { erreur: 'La clé Buffer est refusée.' } : TROIS()));
  await expect(page.locator('[data-role="erreur-buffer"]')).toHaveText('La clé Buffer est refusée.');
  await expect(page.locator('.kanban')).toHaveCount(0);
  await expect(page.locator('[data-action="filtres"]')).toBeVisible(); // la barre reste là
  await capture(page, 'E9-erreur-buffer');
  await page.locator('[data-action="reessayer-buffer"]').click();
  await expect(page.locator('.carte-post')).toHaveCount(3);
  await expect(page.locator('[data-role="erreur-buffer"]')).toHaveCount(0);
  expect(recues.length).toBe(2);
});

test('E9 « Actualiser » relit Buffer sans attendre les cinq minutes du cache', async ({ page }) => {
  const recues = await ouvrirPosts(page, (n) => (n === 1 ? TROIS() : reponseBuffer([poste('pub-9', { publieLe: '2026-11-03T05:08:00.000Z' })])));
  await expect(page.locator('.carte-post')).toHaveCount(3);
  expect(recues.length).toBe(1);
  await page.locator('[data-action="actualiser-buffer"]').click();
  await expect(page.locator('.carte-post')).toHaveCount(1);
  expect(recues.length).toBe(2);
});

test('E9 le texte d’un post est affiché comme du texte, jamais comme du HTML', async ({ page }) => {
  await ouvrirPosts(page, () => reponseBuffer([poste('pub-x', { publieLe: '2026-11-03T05:08:00.000Z', texte: '<img src=x onerror="window.__piege=1"><b>gras</b> & <script>window.__piege=2</script>' })]));
  await expect(carte(page, 'pub-x').locator('.carte-titre')).toContainText('<img src=x onerror="window.__piege=1"><b>gras</b> & <script>');
  await expect(page.locator('.carte-post img, .carte-post b, .carte-post script')).toHaveCount(0);
  expect(await page.evaluate(() => window.__piege)).toBeUndefined();
});

test('E10 les trois colonnes défilent horizontalement sur téléphone (scroll-snap, comme les affaires), sans barre horizontale de page ; trois colonnes sur ordinateur', async ({ page }) => {
  await ouvrirPosts(page, TROIS);
  await expect(page.locator('.kanban .colonne')).toHaveCount(3);
  // Sur téléphone, la matrice et le contrôle partent repliés (le Kanban reste à portée de pouce) ; sur ordinateur, dépliés.
  await expect(page.locator('[data-carte] .section-bascule[aria-expanded="true"]')).toHaveCount(estTelephone(page) ? 0 : 2);
  expect(await sansDebordement(page), 'pas de défilement horizontal de la page').toBe(true);
  const mesures = await page.locator('.kanban').evaluate((el) => ({ snap: getComputedStyle(el).scrollSnapType, defile: el.scrollWidth > el.clientWidth, colonne: el.querySelector('.colonne').getBoundingClientRect().width, vue: innerWidth }));
  expect(mesures.snap).toContain('x');
  if (estTelephone(page)) {
    expect(mesures.defile, 'les colonnes dépassent : on les fait défiler').toBe(true);
    expect(mesures.colonne).toBeGreaterThan(mesures.vue * 0.7);
    await page.locator('.kanban').scrollIntoViewIfNeeded();
    await page.locator('.kanban').evaluate((el) => { el.scrollLeft = el.scrollWidth; });
    await expect.poll(() => page.locator('[data-colonne="publies"]').evaluate((el) => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth + 1; })).toBe(true);
  } else {
    expect(mesures.defile).toBe(false); // sur ordinateur les trois colonnes tiennent côte à côte
  }
  await capture(page, 'E10-colonnes');
});
