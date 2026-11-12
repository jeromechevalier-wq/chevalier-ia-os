// Module Réseaux sociaux, volet « Idées et inspirations » (12/11/2026), chez Jérôme (racine, règles du CRM). Un test par point du cahier (F1 à F13), nom commençant par son numéro,
// UNE capture chacun dans tests/e2e/captures/reseauxsociaux-idees/ (« -telephone » sur téléphone). Données fictives uniquement ; Buffer est simulé dans le navigateur (aucun serveur réel).
// Les règles pures (passage de témoin, lien { reseau, outil, id }, tirage) : tests/reseauxsociaux-idees-logique.test.js et reseauxsociaux-inspirations-logique.test.js.
import { test, expect, connecter, allerA, attendreCalme, listerDocuments, lireDocument, ecrireDocument, estTelephone } from './outils.js';

const CAPTURES = 'e2e/captures/reseauxsociaux-idees';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
/** Fonction `reseauxsociauxBuffer` simulée dans le navigateur (lecture seule : l'écran Idées n'écrit jamais dans Buffer). */
async function simulerBuffer(page, posts = []) {
  const recues = [];
  await page.route(/cloudfunctions\.net\/reseauxsociauxBuffer$/, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    recues.push(JSON.parse(route.request().postData() ?? '{}').data);
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ result: { ok: true, lueLe: new Date().toISOString(), canal: { id: 'canal-fictif', nom: 'Canal fictif', service: 'linkedin' }, posts } }) });
  });
  return recues;
}
const poste = (id, extra) => ({ id, statut: 'publie', statutBuffer: 'sent', texte: `Texte du post ${id}`, prevuLe: null, publieLe: '2026-11-03T05:08:00.000Z', lien: null, video: false, image: false, stats: null, statsLuesLe: null, ...extra });

async function ouvrir(page, ecran, posts = []) {
  const recues = await simulerBuffer(page, posts);
  await connecter(page);
  await page.evaluate((e) => { location.hash = `#/reseauxsociaux/${e}`; }, ecran);
  await expect(page.getByRole('heading', { name: ecran === 'idees' ? 'Idées' : 'Inspirations', level: 1 })).toBeVisible();
  return recues;
}
const sansDebordement = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
/** Les sources sont repliées : on déplie celle dont on veut lire le contenu (une ligne par source, un clic la déplie). */
const deplier = async (page, id) => { const l = page.locator(`[data-inspiration="${id}"] [data-action="deplier-source"]`); if ((await l.getAttribute('aria-expanded')) !== 'true') await l.click(); };
const fenetre = (page, nom) => page.getByRole('dialog', { name: nom });
const carte = (page, id) => page.locator(`.carte-idee[data-idee="${id}"]`);
const idees = async () => (await listerDocuments('reseauxsociaux_idees'));
const ideeUnique = async () => { const l = await idees(); expect(l).toHaveLength(1); return l[0]; };

/** Remplit la fenêtre « Nouvelle idée » (libellés affichés) et enregistre. */
async function creerIdee(page, { angle, pilier, format, service, sources = [], etat, texte, lien }) {
  await page.locator('[data-action="nouvelle-idee"]').click();
  const f = fenetre(page, 'Nouvelle idée');
  await expect(f).toBeVisible();
  await f.locator('[data-champ="angle"]').fill(angle);
  if (pilier) await f.locator('[data-champ="pilier"]').selectOption({ label: pilier });
  if (format) await f.locator('[data-champ="format"]').selectOption({ label: format });
  if (service) await f.locator('[data-champ="service"]').selectOption({ label: service });
  for (const [k, src] of sources.entries()) {
    await f.locator('[data-action="ajouter-source"]').click();
    const bloc = f.locator(`[data-source="${k}"]`).first();
    await f.locator(`[data-champ="type-${k}"]`).selectOption({ label: src.type });
    for (const cle of ['titre', 'url', 'ancre', 'extrait', 'consulteLe', 'resume']) if (src[cle]) await f.locator(`[data-champ="${cle}-${k}"]`).fill(src[cle]);
    await expect(bloc).toBeVisible();
  }
  if (etat) await f.locator('[data-champ="etat"]').selectOption({ label: etat });
  if (texte) await f.locator('[data-champ="texte"]').fill(texte);
  if (lien) await f.locator('[data-champ="lien"]').fill(lien);
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(f).toHaveCount(0);
}

test('F1 cas vide : aucune idée = une phrase claire et un bouton ; un seul bouton jaune « + Idée » ; l’onglet Idées est actif ; aucune colonne', async ({ page }) => {
  await ouvrir(page, 'idees');
  await expect(page.getByText('Aucune idée pour le moment. Note ta première idée, ou tire une contrainte pour te lancer.')).toBeVisible();
  await expect(page.locator('.kanban')).toHaveCount(0);
  await expect(page.locator('.page-tete .bouton-principal')).toHaveCount(1);
  await expect(page.locator('[data-action="nouvelle-idee"]')).toHaveText('Idée');
  await expect(page.locator('[data-action="tirer-contrainte"]')).toHaveClass(/bouton-secondaire/);
  await expect(page.getByRole('navigation', { name: 'Écrans des réseaux sociaux' }).getByRole('link', { name: 'Idées' })).toHaveAttribute('aria-current', 'page');
  expect(await sansDebordement(page)).toBe(true);
  await capture(page, 'F1-cas-vide');
});

test('F2 créer une idée (angle, pilier, format, service, source « Veille » + résumé) : le document est écrit, le Journal l’a noté, la carte est dans « Idée » avec ses trois étiquettes, sa source et « Pas encore écrit »', async ({ page }) => {
  await ouvrir(page, 'idees');
  await page.locator('[data-action="nouvelle-idee"]').click();
  const f = fenetre(page, 'Nouvelle idée');
  await expect(f.getByRole('button', { name: 'Enregistrer' })).toBeDisabled(); // pas d'angle : grisé
  await expect(f.locator('[data-bloc="texte"]')).toBeHidden(); // la zone de rédaction n'apparaît qu'en « En rédaction »
  await f.getByRole('button', { name: 'Annuler' }).click();
  await creerIdee(page, { angle: 'Pourquoi une facture oubliée coûte cher', pilier: 'Cas concrets', format: 'Carrousel', service: 'Finance', sources: [{ type: 'Veille', resume: '2026-11-10 Résumé fictif de la veille.md', extrait: 'Les mots de la veille', consulteLe: '2026-11-10' }, { type: 'Site', titre: 'Page d’un concurrent', url: 'https://exemple.test/offre#tarifs', ancre: 'Tarifs', extrait: 'Une offre nationale' }] });
  await expect(page.locator('.toast')).toContainText('Idée ajoutée');
  const d = await ideeUnique();
  expect(d).toMatchObject({ angle: 'Pourquoi une facture oubliée coûte cher', pilier: 'cas_concrets', format: 'carrousel', service: 'finance', etat: 'idee', texte: '', lien: null });
  expect(d.sources).toHaveLength(2);
  expect(d.sources[0]).toEqual({ type: 'veille', titre: '', url: '', ancre: '', extrait: 'Les mots de la veille', consulteLe: '2026-11-10', archive: '', resume: '2026-11-10 Résumé fictif de la veille.md', motsCles: '' });
  expect(d.sources[1]).toMatchObject({ type: 'site', titre: 'Page d’un concurrent', url: 'https://exemple.test/offre#tarifs', ancre: 'Tarifs', extrait: 'Une offre nationale' });
  expect(d.creeLe).toBeTruthy();
  expect(Object.keys(d).sort()).toEqual(['angle', 'creeLe', 'etat', 'format', 'id', 'lien', 'modifieLe', 'pilier', 'pisteId', 'service', 'sources', 'texte']);
  const c = page.locator('[data-colonne="idee"]').locator('.carte-idee');
  await expect(c).toHaveCount(1);
  await expect(c.locator('[data-role="pilier"]')).toHaveText('Cas concrets');
  await expect(c.locator('[data-role="format"]')).toHaveText('Carrousel');
  await expect(c.locator('[data-role="service"]')).toHaveText('Finance');
  await expect(c.locator('[data-role="source"]')).toHaveCount(2);
  await expect(c.locator('[data-role="source"]').first()).toContainText('Veille : 2026-11-10 Résumé fictif de la veille.md');
  await expect(c.locator('[data-role="extrait"]').first()).toHaveText('Les mots de la veille');
  await expect(c.locator('[data-role="consulte"]').first()).toContainText('Consultée le');
  const lienSource = c.locator('[data-action="ouvrir-source"]'); // seule la source « site » a une adresse
  await expect(lienSource).toHaveCount(1);
  await expect(lienSource).toHaveText('Site : Page d’un concurrent');
  await expect(lienSource).toHaveAttribute('href', 'https://exemple.test/offre#tarifs');
  await expect(lienSource).toHaveAttribute('target', '_blank');
  await expect(lienSource).toHaveAttribute('rel', /noopener/);
  await expect(c.locator('[data-role="lieu-texte"]')).toHaveText('Pas encore écrit');
  await expect(page.locator('.kanban .colonne h2')).toHaveText(['Idée', 'En rédaction', 'Dans Buffer']); // trois colonnes (quatre au plus)
  await expect(page.locator('.compteur-liste')).toHaveText('1 idée');
  await attendreCalme(page);
  await allerA(page, 'Journal des modifications');
  await expect(page.locator('.tableau-journal tbody tr').first()).toContainText('Création de 1 idée de post');
  await page.goBack();
  await expect(page.getByRole('heading', { name: 'Idées', level: 1 })).toBeVisible();
  expect(await sansDebordement(page)).toBe(true);
  await capture(page, 'F2-idee-creee');
});

test('F3 état « En rédaction » : la zone de rédaction apparaît, le texte s’enregistre dans l’idée, la carte dit « Dans le module » et passe dans la bonne colonne', async ({ page }) => {
  await ouvrir(page, 'idees');
  await creerIdee(page, { angle: 'Trois questions avant d’automatiser', pilier: 'Pédagogie et méthodes', format: 'Texte' });
  const id = (await ideeUnique()).id;
  await carte(page, id).click();
  const f = fenetre(page, 'Modifier cette idée');
  await expect(f.getByRole('button', { name: 'Enregistrer' })).toBeDisabled(); // rien n'a changé
  await f.locator('[data-champ="etat"]').selectOption({ label: 'En rédaction' });
  await expect(f.locator('[data-bloc="texte"]')).toBeVisible();
  await f.locator('[data-champ="texte"]').fill('Première ligne du brouillon\nDeuxième ligne');
  await expect(f.locator('[data-role="compteur-texte"]')).toContainText('/ 3');
  await expect(f.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
  await expect(f.getByRole('button', { name: 'Enregistrer' })).toHaveClass(/bouton-principal/);
  await capture(page, 'F3-redaction');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(f).toHaveCount(0);
  const d = await lireDocument(`reseauxsociaux_idees/${id}`);
  expect(d).toMatchObject({ etat: 'en_redaction', texte: 'Première ligne du brouillon\nDeuxième ligne' });
  await expect(page.locator('[data-colonne="en_redaction"] .carte-idee')).toHaveCount(1);
  await expect(carte(page, id).locator('[data-role="lieu-texte"]')).toHaveText('Dans le module');
  expect(await sansDebordement(page)).toBe(true);
});

test('F4 passage de témoin : « Dans Buffer » avec un texte écrit demande confirmation ; le texte est EFFACÉ du module ; le lien est écrit { reseau: linkedin, outil: buffer, id }', async ({ page }) => {
  await ouvrir(page, 'idees');
  await creerIdee(page, { angle: 'Le cas du dossier perdu', pilier: 'Cas concrets', format: 'Texte', etat: 'En rédaction', texte: 'Un texte écrit dans le module' });
  const id = (await ideeUnique()).id;
  expect((await lireDocument(`reseauxsociaux_idees/${id}`)).texte).toBe('Un texte écrit dans le module');
  await carte(page, id).click();
  const f = fenetre(page, 'Modifier cette idée');
  await f.locator('[data-champ="etat"]').selectOption({ label: 'Dans Buffer' });
  await expect(f.locator('[data-bloc="texte"]')).toBeHidden();
  await expect(f.locator('[data-bloc="lien"]')).toBeVisible();
  await f.locator('[data-champ="lien"]').fill('post-fictif-42');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  const confirmation = fenetre(page, 'Effacer le texte d’ici ?');
  await expect(confirmation).toBeVisible();
  await capture(page, 'F4-confirmation');
  await confirmation.getByRole('button', { name: 'Annuler' }).click(); // refus : rien n'est écrit
  await expect(f).toBeVisible();
  expect((await lireDocument(`reseauxsociaux_idees/${id}`)).texte).toBe('Un texte écrit dans le module');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await fenetre(page, 'Effacer le texte d’ici ?').getByRole('button', { name: 'Passer dans Buffer' }).click();
  await expect(f).toHaveCount(0);
  const d = await lireDocument(`reseauxsociaux_idees/${id}`);
  expect(d.etat).toBe('dans_buffer');
  expect(d.texte).toBe('');
  expect(d.lien).toEqual({ reseau: 'linkedin', outil: 'buffer', id: 'post-fictif-42' });
  expect(Object.keys(d)).not.toContain('identifiantBuffer');
  await expect(page.locator('[data-colonne="dans_buffer"] .carte-idee')).toHaveCount(1);
  await expect(carte(page, id).locator('[data-role="lieu-texte"]')).toHaveText('Dans Buffer');
  await expect(page.locator('[data-colonne="idee"] [data-role="colonne-vide"]')).toHaveCount(1);
  // La copie « avant » du Journal garde l'ancien texte : le module ne perd rien sans trace.
  const lignes = (await listerDocuments('crm_audit')).filter((l) => l.collection === 'reseauxsociaux_idees');
  expect(lignes.map((l) => l.action).sort()).toEqual(['creer', 'modifier']);
  await capture(page, 'F4-dans-buffer');
});

test('F5 abandonner une idée : elle quitte les colonnes, le filtre « Abandonnées seulement » la retrouve, on la reprend en changeant son état', async ({ page }) => {
  await ouvrir(page, 'idees');
  await creerIdee(page, { angle: 'Une idée qui ne mène nulle part', pilier: 'Actu IA décryptée' });
  await creerIdee(page, { angle: 'Une idée à garder', pilier: 'Cas concrets' });
  const toutes = await idees();
  const perdue = toutes.find((d) => d.angle === 'Une idée qui ne mène nulle part');
  await carte(page, perdue.id).click();
  await fenetre(page, 'Modifier cette idée').getByRole('button', { name: 'Abandonner l’idée' }).click();
  await expect(page.locator('.toast', { hasText: 'Idée abandonnée' })).toBeVisible();
  expect((await lireDocument(`reseauxsociaux_idees/${perdue.id}`)).etat).toBe('abandonnee');
  await expect(page.locator('.carte-idee')).toHaveCount(1);
  await expect(carte(page, perdue.id)).toHaveCount(0);
  await page.getByRole('button', { name: /Filtres/ }).click();
  await page.getByRole('dialog').getByLabel('Abandonnées seulement').check();
  await page.getByRole('dialog').getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('.kanban .colonne h2')).toHaveText(['Abandonnées']);
  await expect(carte(page, perdue.id)).toBeVisible();
  await expect(page.locator('.pastille-filtre')).toContainText('Abandonnées seulement');
  await capture(page, 'F5-abandonnees');
  await carte(page, perdue.id).click();
  const f = fenetre(page, 'Modifier cette idée');
  await expect(f.getByRole('button', { name: 'Abandonner l’idée' })).toHaveCount(0); // déjà abandonnée
  await f.locator('[data-champ="etat"]').selectOption({ label: 'Idée' });
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(f).toHaveCount(0);
  expect((await lireDocument(`reseauxsociaux_idees/${perdue.id}`)).etat).toBe('idee');
  await page.locator('.pastille-filtre .pastille-retrait').click();
  await expect(page.locator('.carte-idee')).toHaveCount(2);
});

test('F6 filtres et recherche : un pilier, une source ; la recherche ignore accents et majuscules ; « sur N » dans le compteur', async ({ page }) => {
  await ouvrir(page, 'idees');
  await ecrireDocument('reseauxsociaux_idees/a', { angle: 'Les Factures à relancer', sources: [], pilier: 'cas_concrets', format: 'texte', service: 'finance', etat: 'idee', texte: '', lien: null });
  await ecrireDocument('reseauxsociaux_idees/b', { angle: 'Une veille sur les agents', sources: [{ type: 'veille', titre: '', url: '', ancre: '', extrait: '', consulteLe: null, archive: '', resume: 'veille-agents.md', motsCles: '' }], pilier: 'actu_ia', format: null, service: null, etat: 'idee', texte: '', lien: null });
  await expect(page.locator('.carte-idee')).toHaveCount(2);
  await expect(carte(page, 'b').locator('[data-role="format-vide"]')).toHaveText('Sans format');
  await expect(carte(page, 'b').locator('[data-role="service-vide"]')).toHaveText('Tous services');
  await page.getByRole('searchbox').fill('factures A relancer');
  await expect(page.locator('.carte-idee')).toHaveCount(1);
  await expect(page.locator('.compteur-liste')).toHaveText('1 idée sur 2');
  await page.getByRole('searchbox').fill('');
  await page.getByRole('button', { name: /Filtres/ }).click();
  await page.getByRole('dialog').getByLabel('Veille', { exact: true }).check();
  await page.getByRole('dialog').getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('.carte-idee')).toHaveCount(1);
  await expect(carte(page, 'b')).toBeVisible();
  await capture(page, 'F6-filtres');
});

test('F7 « Tirer une contrainte » : un triplet pilier × format × service (pilier × format venus des suggestions de la matrice), « Créer une idée avec cette contrainte » ouvre la création pré-remplie ; « Tirer à nouveau » relance', async ({ page }) => {
  // Aléa fixé à 0 dans le navigateur : le tirage est prévisible, on le recalcule avec les mêmes fonctions pures.
  await page.addInitScript(() => { Math.random = () => 0; });
  const postsBuffer = [poste('p1'), poste('p2', { publieLe: '2026-11-04T05:08:00.000Z' }), poste('p3', { statut: 'programme', prevuLe: '2026-11-17T05:08:00.000Z', publieLe: null })];
  const classements = [{ id: 'p1', pilier: 'pedagogie', format: 'texte', services: ['finance', 'production'] }, { id: 'p2', pilier: 'pedagogie', format: 'texte', services: ['finance'] }];
  await ouvrir(page, 'idees', postsBuffer);
  for (const c of classements) await ecrireDocument(`reseauxsociaux_posts/${c.id}`, { pilier: c.pilier, format: c.format, services: c.services });
  await ecrireDocument('reseauxsociaux_idees/a', { angle: 'Une idée existante', sources: [], pilier: null, format: null, service: 'commercial', etat: 'idee', texte: '', lien: null });
  await expect(page.locator('.carte-idee')).toHaveCount(1);
  // Le résultat attendu est recalculé avec les mêmes fonctions pures, chargées dans la page (le dépôt n'a pas de package « module » à la racine).
  const attendu = await page.evaluate(async ({ postsBuffer, classements }) => {
    const I = await import('/js/modules/reseauxsociaux/idees-logique.js');
    const P = await import('/js/modules/reseauxsociaux/posts-logique.js');
    const fusion = P.fusionnerPosts(postsBuffer, classements.map((c) => ({ id: c.id, pilier: c.pilier, format: c.format, services: c.services })));
    return I.tirerContrainte(() => 0, { suggestions: P.matrice(fusion).suggestions, classements, idees: [{ etat: 'idee', service: 'commercial' }] });
  }, { postsBuffer, classements });
  expect(attendu.origine).toBe('suggestion');
  await page.locator('[data-action="tirer-contrainte"]').click();
  const bloc = page.locator('[data-carte="contrainte"]');
  await expect(bloc).toBeVisible();
  await expect(bloc.locator('[data-role="contrainte"] .pastille-etiquette')).toHaveCount(3);
  await expect(bloc.locator('[data-role="pilier"]')).toHaveText({ cas_concrets: 'Cas concrets', pedagogie: 'Pédagogie et méthodes', actu_ia: 'Actu IA décryptée', demarche_offre: 'Ma démarche et mon offre' }[attendu.pilier]);
  await expect(bloc.locator('[data-role="format"]')).toHaveText({ texte: 'Texte', image: 'Image', carrousel: 'Carrousel', animation: 'Animation 16:9', video: 'Vidéo 9:16' }[attendu.format]);
  await expect(bloc.locator('[data-role="service"]')).toHaveText({ administratif_rh: 'Administratif et RH', finance: 'Finance', production: 'Production', commercial: 'Commercial', direction: 'Direction' }[attendu.service]);
  await expect(bloc.locator('[data-role="raison-contrainte"]')).toContainText('matrice');
  await expect(page.locator('.page-tete .bouton-principal')).toHaveCount(1); // un seul jaune, même avec la contrainte
  await capture(page, 'F7-contrainte');
  await bloc.locator('[data-action="creer-avec-contrainte"]').click();
  const f = fenetre(page, 'Nouvelle idée');
  await expect(f.locator('[data-champ="pilier"]')).toHaveValue(attendu.pilier);
  await expect(f.locator('[data-champ="format"]')).toHaveValue(attendu.format);
  await expect(f.locator('[data-champ="service"]')).toHaveValue(attendu.service);
  await expect(f.locator('[data-champ="angle"]')).toHaveValue('');
  await f.locator('[data-champ="angle"]').fill('Idée née de la contrainte');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(f).toHaveCount(0);
  const creee = (await idees()).find((d) => d.angle === 'Idée née de la contrainte');
  expect(creee).toMatchObject({ pilier: attendu.pilier, format: attendu.format, service: attendu.service, etat: 'idee' });
  await bloc.locator('[data-action="tirer-encore"]').click();
  await expect(bloc).toBeVisible();
});

test('F7 sans aucun post (Buffer vide) : le tirage porte sur toutes les cases et le dit', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0; });
  await ouvrir(page, 'idees', []);
  await page.locator('[data-action="tirer-contrainte"]').click();
  const bloc = page.locator('[data-carte="contrainte"]');
  await expect(bloc.locator('[data-role="raison-contrainte"]')).toContainText('toutes les cases');
  await expect(bloc.locator('[data-role="pilier"]')).toHaveText('Cas concrets');
  await expect(bloc.locator('[data-role="format"]')).toHaveText('Texte');
  await capture(page, 'F7-sans-posts');
});

test('F8 Inspirations, cas vide : « Ajoute les profils qui t’inspirent. » ; la carte « Inspirations » d’Aujourd’hui dit la même chose et mène à l’écran', async ({ page }) => {
  await ouvrir(page, 'inspirations');
  await expect(page.getByText('Ajoute les profils qui t’inspirent.')).toBeVisible();
  await expect(page.locator('.carte-inspiration')).toHaveCount(0);
  await expect(page.locator('.page-tete .bouton-principal')).toHaveCount(1);
  await expect(page.locator('[data-action="nouvelle-inspiration"]')).toHaveText('Source');
  expect(await sansDebordement(page)).toBe(true);
  await capture(page, 'F8-cas-vide');
  await page.evaluate(() => { location.hash = '#/reseauxsociaux/aujourdhui'; });
  const carteAuj = page.locator('[data-carte="inspirations"]');
  await expect(carteAuj.locator('h2')).toHaveText('Inspirations');
  await expect(carteAuj).toContainText('Ajoute les profils qui t’inspirent.');
  await carteAuj.locator('[data-action="voir-inspirations"]').click();
  await expect(page.getByRole('heading', { name: 'Inspirations', level: 1 })).toBeVisible();
});

test('F9 ajouter un profil : adresse refusée si elle n’est pas LinkedIn ; le profil est écrit ; « Ouvrir LinkedIn » s’ouvre dans un nouvel onglet (noopener) ; la carte d’Aujourd’hui a un bouton par profil', async ({ page }) => {
  await ouvrir(page, 'inspirations');
  await page.locator('[data-action="nouvelle-inspiration"]').click();
  const f = fenetre(page, 'Nouvelle source');
  await expect(f.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  await f.locator('[data-champ="nom"]').fill('Alice Exemple');
  await f.locator('[data-champ="url"]').fill('https://exemple.test/alice');
  await f.locator('[data-champ="pourquoi"]').fill('Des accroches courtes et un chiffre dès la première ligne');
  await f.locator('[data-pilier="cas_concrets"]').check();
  await f.locator('[data-format="carrousel"]').check();
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(f.locator('[data-role="erreur-profil"]')).toContainText('adresse du profil');
  await expect(f).toBeVisible();
  expect(await listerDocuments('reseauxsociaux_inspirations')).toHaveLength(0);
  await f.locator('[data-champ="url"]').fill('linkedin.com/in/alice-exemple');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(f).toHaveCount(0);
  const d = (await listerDocuments('reseauxsociaux_inspirations'))[0];
  expect(d).toMatchObject({ nom: 'Alice Exemple', url: 'https://linkedin.com/in/alice-exemple', piliers: ['cas_concrets'], formats: ['carrousel'], ordre: 0 });
  const c = page.locator('.carte-inspiration');
  await expect(c).toHaveCount(1);
  await expect(c.locator('[data-role="nom-profil"]')).toContainText('Alice Exemple');
  await deplier(page, (await listerDocuments('reseauxsociaux_inspirations'))[0].id);
  await expect(c.locator('[data-role="habitudes"]')).toContainText('Cas concrets');
  const lien = c.locator('[data-action="ouvrir-linkedin"]');
  await expect(lien).toHaveAttribute('href', 'https://linkedin.com/in/alice-exemple');
  await expect(lien).toHaveAttribute('target', '_blank');
  await expect(lien).toHaveAttribute('rel', /noopener/);
  await expect(c.locator('[data-role="exemples-vides"]')).toBeVisible();
  expect(await sansDebordement(page)).toBe(true);
  await capture(page, 'F9-profil');
  await page.evaluate(() => { location.hash = '#/reseauxsociaux/aujourdhui'; });
  const bouton = page.locator('[data-carte="inspirations"] [data-action="ouvrir-profil"]');
  await expect(bouton).toHaveCount(1);
  await expect(bouton).toHaveText('Alice Exemple');
  await expect(bouton).toHaveAttribute('href', 'https://linkedin.com/in/alice-exemple');
  await expect(bouton).toHaveAttribute('target', '_blank');
  await expect(bouton).toHaveAttribute('rel', /noopener/);
  expect(await sansDebordement(page)).toBe(true);
  await capture(page, 'F9-aujourdhui');
});

test('F10 exemples d’un profil : lien + analyse (jamais le texte du post), 500 caractères au plus par champ, lien refusé s’il n’est pas LinkedIn', async ({ page }) => {
  await ecrireDocument('reseauxsociaux_inspirations/p1', { nom: 'Alice Exemple', url: 'https://www.linkedin.com/in/alice-exemple', pourquoi: '', piliers: [], formats: [], ordre: 0 });
  await ouvrir(page, 'inspirations');
  await deplier(page, 'p1');
  await page.locator('[data-inspiration="p1"] [data-action="nouvel-exemple"]').click();
  const f = fenetre(page, 'Nouvel exemple de post');
  await expect(f.getByText('Colle seulement le lien. Le texte du post n’est pas copié ici.')).toBeVisible();
  await expect(f.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  for (const cle of ['accroche', 'structure', 'longueur', 'pourquoi']) await expect(f.locator(`[data-champ="${cle}"]`)).toHaveAttribute('maxlength', '500');
  await expect(f.locator('[data-champ="extrait"]')).toHaveAttribute('maxlength', '400');
  await f.locator('[data-champ="url"]').fill('https://exemple.test/post');
  await f.locator('[data-champ="accroche"]').fill('Une facture oubliée coûte cher');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(f.locator('[data-role="erreur-exemple"]')).toContainText('lien du post');
  expect(await listerDocuments('reseauxsociaux_exemples')).toHaveLength(0);
  await f.locator('[data-champ="url"]').fill('https://www.linkedin.com/posts/alice-exemple_cas-concret-123');
  await f.locator('[data-champ="date"]').fill('2026-11-03');
  await f.locator('[data-champ="extrait"]').fill('Une facture oubliée');
  await f.locator('[data-champ="structure"]').fill('Accroche, histoire, leçon');
  await f.locator('[data-champ="longueur"]').fill('1 200 caractères');
  await f.locator('[data-champ="format"]').selectOption({ label: 'Carrousel' });
  await f.locator('[data-champ="pilier"]').selectOption({ label: 'Cas concrets' });
  await f.locator('[data-champ="service"]').selectOption({ label: 'Finance' });
  await f.locator('[data-champ="pourquoi"]').fill('Un chiffre dès la première ligne');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(f).toHaveCount(0);
  const e = (await listerDocuments('reseauxsociaux_exemples'))[0];
  expect(e).toMatchObject({ profilId: 'p1', url: 'https://www.linkedin.com/posts/alice-exemple_cas-concret-123', date: '2026-11-03', accroche: 'Une facture oubliée coûte cher', format: 'carrousel', pilier: 'cas_concrets', service: 'finance' });
  expect(Object.keys(e).sort()).toEqual(['accroche', 'commentaires', 'creeLe', 'date', 'extrait', 'format', 'id', 'longueur', 'modifieLe', 'pilier', 'pourquoi', 'profilId', 'reactions', 'releveLe', 'service', 'structure', 'url']); // aucun champ pour le texte du post
  const ligne = page.locator('[data-inspiration="p1"] .rs-exemple');
  await expect(ligne).toHaveCount(1);
  await expect(ligne.locator('[data-role="accroche"]')).toHaveText('Une facture oubliée coûte cher');
  await expect(ligne.locator('[data-role="pourquoi"]')).toContainText('Un chiffre dès la première ligne');
  await expect(ligne.locator('[data-role="extrait"]')).toHaveText('Une facture oubliée');
  await expect(ligne.locator('[data-role="date-exemple"]')).toContainText('2026');
  const voir = ligne.locator('[data-action="ouvrir-post"]');
  await expect(voir).toHaveAttribute('target', '_blank');
  await expect(voir).toHaveAttribute('rel', /noopener/);
  await expect(page.locator('[data-inspiration="p1"] h3')).toHaveText('Exemples de posts (1)');
  expect(await sansDebordement(page)).toBe(true);
  await capture(page, 'F10-exemple');
  await ligne.locator('[data-action="modifier-exemple"]').click();
  const g = fenetre(page, 'Modifier cet exemple');
  await g.locator('[data-champ="pourquoi"]').fill('Autre raison');
  await g.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(g).toHaveCount(0);
  expect((await listerDocuments('reseauxsociaux_exemples'))).toHaveLength(1);
  await expect(ligne.locator('[data-role="pourquoi"]')).toContainText('Autre raison');
});

test('F11 ranger les profils : ▲ et ▼ échangent deux profils (l’ordre est écrit), le premier ne monte pas, le dernier ne descend pas', async ({ page }) => {
  await ecrireDocument('reseauxsociaux_inspirations/p1', { nom: 'Alice Exemple', url: 'https://www.linkedin.com/in/alice-exemple', pourquoi: '', piliers: [], formats: [], ordre: 0 });
  await ecrireDocument('reseauxsociaux_inspirations/p2', { nom: 'Bruno Exemple', url: 'https://www.linkedin.com/in/bruno-exemple', pourquoi: '', piliers: [], formats: [], ordre: 1 });
  await ouvrir(page, 'inspirations');
  const noms = () => page.locator('.carte-inspiration [data-role="nom-profil"]').allTextContents();
  expect((await noms()).map((n) => n.trim())).toEqual(['Alice Exemple', 'Bruno Exemple']);
  await expect(page.locator('[data-inspiration="p1"] [data-action="monter-profil"]')).toBeDisabled();
  await expect(page.locator('[data-inspiration="p2"] [data-action="descendre-profil"]')).toBeDisabled();
  await page.locator('[data-inspiration="p2"] [data-action="monter-profil"]').click();
  await expect(page.locator('.carte-inspiration').first()).toHaveAttribute('data-inspiration', 'p2');
  // L'écran montre l'écriture avant que le serveur l'ait confirmée : on attend la valeur au lieu de la lire tout de suite.
  await expect.poll(async () => (await lireDocument('reseauxsociaux_inspirations/p2')).ordre).toBe(0);
  await expect.poll(async () => (await lireDocument('reseauxsociaux_inspirations/p1')).ordre).toBe(1);
  await page.locator('[data-inspiration="p2"] [data-action="descendre-profil"]').click();
  await expect(page.locator('.carte-inspiration').first()).toHaveAttribute('data-inspiration', 'p1');
  await capture(page, 'F11-ranger');
});

test('F12 modifier un profil : « Enregistrer » grisé tant que rien n’a changé ; le nouvel ordre et le nom sont gardés', async ({ page }) => {
  await ecrireDocument('reseauxsociaux_inspirations/p1', { nom: 'Alice Exemple', url: 'https://www.linkedin.com/in/alice-exemple', pourquoi: 'Avant', piliers: [], formats: [], ordre: 3 });
  await ouvrir(page, 'inspirations');
  await deplier(page, 'p1');
  await page.locator('[data-inspiration="p1"] [data-action="modifier-profil"]').click();
  const f = fenetre(page, 'Modifier ce profil');
  await expect(f.getByRole('button', { name: 'Enregistrer' })).toBeDisabled();
  await f.locator('[data-champ="pourquoi"]').fill('Après');
  await expect(f.getByRole('button', { name: 'Enregistrer' })).toBeEnabled();
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(f).toHaveCount(0);
  expect(await lireDocument('reseauxsociaux_inspirations/p1')).toMatchObject({ nom: 'Alice Exemple', pourquoi: 'Après', ordre: 3 });
  await expect(page.locator('[data-inspiration="p1"] [data-role="pourquoi-profil"]')).toHaveText('Après');
});

test('F13 téléphone et ordinateur : les deux écrans ne débordent pas, la fenêtre d’une idée tient dans l’écran', async ({ page }) => {
  await ecrireDocument('reseauxsociaux_idees/a', { angle: 'Une idée avec un angle assez long pour passer à la ligne sur un petit écran de téléphone sans rien déborder', sources: [{ type: 'veille', titre: '', url: 'https://exemple.test/un-chemin-tres-long-sans-espaces-pour-tester-le-debordement', ancre: '', extrait: 'Un extrait assez long pour passer à la ligne sur un petit écran', consulteLe: '2026-11-10', archive: '', resume: 'un-nom-de-fichier-de-resume-tres-long-sans-espaces-pour-tester-le-debordement-2026-11-10.md', motsCles: '' }, { type: 'site', titre: 'Page', url: '', ancre: '', extrait: '', consulteLe: null, archive: '', resume: '', motsCles: '' }], pilier: 'demarche_offre', format: 'animation', service: 'administratif_rh', etat: 'en_redaction', texte: 'Du texte', lien: null });
  await ecrireDocument('reseauxsociaux_inspirations/p1', { nom: 'Alice Exemple-Avec-Un-Nom-Tres-Long-Pour-Tester', url: 'https://www.linkedin.com/in/alice-exemple', pourquoi: 'x'.repeat(300), piliers: ['cas_concrets', 'pedagogie'], formats: ['texte', 'image'], ordre: 0 });
  await ouvrir(page, 'idees');
  await expect(page.locator('.carte-idee')).toHaveCount(1);
  expect(await sansDebordement(page)).toBe(true);
  await carte(page, 'a').locator('.carte-titre').click(); // le centre de la carte porte un lien de source
  const f = fenetre(page, 'Modifier cette idée');
  await expect(f).toBeVisible();
  const boite = await f.boundingBox();
  const vue = page.viewportSize();
  expect(boite.x).toBeGreaterThanOrEqual(0);
  expect(boite.x + boite.width).toBeLessThanOrEqual(vue.width + 1);
  await capture(page, 'F13-fenetre-idee');
  await f.getByRole('button', { name: 'Annuler' }).click();
  await page.evaluate(() => { location.hash = '#/reseauxsociaux/inspirations'; });
  await expect(page.getByRole('heading', { name: 'Inspirations', level: 1 })).toBeVisible();
  await expect(page.locator('.carte-inspiration')).toHaveCount(1);
  await deplier(page, 'p1'); // nom long, 300 caractères de « pourquoi » et pastilles : le contenu déplié ne déborde pas non plus
  expect(await sansDebordement(page)).toBe(true);
  await capture(page, 'F13-inspirations');
});
