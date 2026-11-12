// Module Réseaux sociaux, écran Inspirations en liste dense (13/11/2026), chez Jérôme (racine, règles du CRM). Un test par point du brief (G1 à G6), nom commençant par son numéro,
// UNE capture chacun dans tests/e2e/captures/reseauxsociaux-inspirations-dense/ (« -telephone » sur téléphone ; jamais commitée). Données fictives uniquement ; Buffer est simulé (aucun serveur réel).
// Les anciens parcours de l'écran (profils, exemples, rangement) restent dans reseauxsociaux-idees.spec.js (F8 à F13).
import { test, expect, connecter, listerDocuments, lireDocument, ecrireDocument, estTelephone } from './outils.js';

const CAPTURES = 'e2e/captures/reseauxsociaux-inspirations-dense';
const capture = (page, nom) => page.screenshot({ path: `${CAPTURES}/${nom}${estTelephone(page) ? '-telephone' : ''}.png`, animations: 'disabled' });
test.beforeEach(async ({ context }) => {
  await context.route('https://apis.google.com/**', (route) => route.fulfill({ status: 200, body: '', headers: { 'Content-Type': 'text/javascript' } }));
});

const CORS = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
async function simulerBuffer(page) {
  await page.route(/cloudfunctions\.net\/reseauxsociauxBuffer$/, async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: CORS });
    return route.fulfill({ status: 200, headers: CORS, contentType: 'application/json', body: JSON.stringify({ result: { ok: true, lueLe: new Date().toISOString(), canal: { id: 'canal-fictif', nom: 'Canal fictif', service: 'linkedin' }, posts: [] } }) });
  });
}
async function ouvrir(page) {
  await simulerBuffer(page);
  await connecter(page);
  await page.evaluate(() => { location.hash = '#/reseauxsociaux/inspirations'; });
  await expect(page.getByRole('heading', { name: 'Inspirations', level: 1 })).toBeVisible();
}
const sansDebordement = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth);
const fenetre = (page, nom) => page.getByRole('dialog', { name: nom });
const ligne = (page, id) => page.locator(`[data-inspiration="${id}"]`);
const deplier = async (page, id) => { const l = ligne(page, id).locator('[data-action="deplier-source"]'); if ((await l.getAttribute('aria-expanded')) !== 'true') await l.click(); };
const pistes = () => listerDocuments('reseauxsociaux_pistes');
const sansHorodatage = (d) => Object.keys(d).filter((k) => !['id', 'creeLe', 'modifieLe'].includes(k)).sort();
const CHAMPS_PISTE = ['accroche', 'ancre', 'angle', 'auteur', 'brouillon', 'etat', 'exempleId', 'format', 'ideeId', 'lot', 'note', 'pilier', 'piliers', 'service', 'sourceId', 'sourceTitre', 'sourceType', 'url', 'visuel'];

test('G1 de bout en bout : ajouter une source, copier le prompt, coller une réponse, aperçu avec un doublon décoché, créer, retenir une piste, compteurs ; idée « Dans Buffer » = postée', async ({ page }) => {
  await ouvrir(page);
  // 1. « + Source » (site) : un seul bouton jaune, un type à choisir
  await expect(page.locator('.page-tete .bouton-principal')).toHaveCount(1);
  await page.locator('[data-action="nouvelle-inspiration"]').click();
  const nouvelle = fenetre(page, 'Nouvelle source');
  await nouvelle.locator('[data-champ="type"]').selectOption({ label: 'Site' });
  await expect(nouvelle.locator('[data-bloc="resume"]')).toBeHidden();
  await nouvelle.locator('[data-champ="nom"]').fill('Site Exemple');
  await nouvelle.locator('[data-champ="url"]').fill('https://site-exemple.test');
  await nouvelle.locator('[data-champ="pourquoi"]').fill('Des cas concrets');
  await nouvelle.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(nouvelle).toHaveCount(0);
  const s = (await listerDocuments('reseauxsociaux_inspirations'))[0];
  expect(s).toMatchObject({ type: 'site', nom: 'Site Exemple', url: 'https://site-exemple.test/' });
  await expect(ligne(page, s.id).locator('[data-role="compteurs-source"]')).toHaveText('0 piste · 0 retenue · 0 postée');
  // 2. une piste à la main (sert de doublon plus bas)
  await deplier(page, s.id);
  await ligne(page, s.id).locator('[data-action="tirer-idees"]').click();
  const f = fenetre(page, 'En tirer des idées');
  await expect(f.locator('[data-role="source-nom"]')).toHaveText('Source : Site Exemple');
  await f.locator('[data-champ="angle"]').fill('Une facture oubliée coûte cher');
  await f.locator('[data-champ="pilier"]').selectOption({ label: 'Cas concrets' });
  await f.locator('[data-action="ajouter-piste"]').click();
  await expect(f.locator('[data-role="piste-ajoutee"]')).toContainText('1 piste ajoutée');
  expect(await pistes()).toHaveLength(1);
  expect((await pistes())[0]).toMatchObject({ sourceId: s.id, sourceTitre: 'Site Exemple', sourceType: 'site', auteur: 'utilisateur', etat: 'nouvelle', pilier: 'cas_concrets' });
  // 3. le prompt : lu dans la zone de texte (jamais dans le presse-papiers), avec la source, le stock et le modèle de réponse
  await f.locator('[data-vue="claude"]').click();
  const prompt = await f.locator('[data-role="prompt"]').inputValue();
  expect(prompt).toContain('Site Exemple');
  expect(prompt).toContain('https://site-exemple.test');
  expect(prompt).toContain('Une facture oubliée coûte cher'); // la piste déjà en stock
  expect(prompt).toContain('pistes-v1');
  expect(prompt).toContain('- cas_concrets : Cas concrets');
  expect(prompt).toMatch(/pour .+ à partir de cette source/); // aucun nom en dur : celui du compte connecté, « moi » s'il n'en a pas
  await expect(f.locator('[data-role="prompt"]')).toHaveAttribute('readonly', '');
  await f.locator('[data-action="copier-prompt"]').click();
  await expect(f.locator('[data-role="copie-statut"]')).toHaveText(/Prompt copié|Copie impossible, sélectionne le texte/);
  // 4. la réponse collée (entourée d'un bloc de code, un champ « texte » en trop, un doublon, un pilier inconnu)
  const idSource = /"sourceId": "([^"]*)"/.exec(prompt)[1];
  expect(idSource).toBe(s.id);
  const reponse = `Voici mes pistes :\n\`\`\`json\n${JSON.stringify({ format: 'pistes-v1', sourceId: idSource, pistes: [
    { angle: 'Une FACTURE oubliée coûte cher !', note: 'déjà là' },
    { angle: 'Deuxième angle', note: 'Pourquoi', ancre: 'Page tarifs', url: 'https://site-exemple.test/tarifs', pilier: 'cas_concrets', format: 'carrousel', texte: 'TEXTE RECOPIÉ DE LA SOURCE' },
    { angle: 'Troisième angle', pilier: 'inconnu' },
  ] }, null, 2)}\n\`\`\``;
  await f.locator('[data-champ="reponse"]').fill(reponse);
  await f.locator('[data-action="lire-reponse"]').click();
  const lignes = f.locator('[data-role="ligne-apercu"]');
  await expect(lignes).toHaveCount(3);
  await expect(f.locator('[data-role="resume-apercu"]')).toContainText('3 pistes lues · 1 champ ignoré');
  await expect(lignes.nth(0).locator('input[type="checkbox"]')).not.toBeChecked(); // le doublon est décoché
  await expect(lignes.nth(0).locator('[data-role="remarque-apercu"]')).toContainText('déjà en stock');
  await expect(lignes.nth(1).locator('input[type="checkbox"]')).toBeChecked();
  await expect(lignes.nth(2).locator('[data-role="remarque-apercu"]')).toContainText('pilier à choisir');
  await expect(f.locator('[data-action="creer-pistes"]')).toHaveText('Créer 2 pistes');
  expect(await pistes()).toHaveLength(1); // RIEN n'est écrit avant « Créer »
  await capture(page, 'G1-apercu');
  await f.locator('[data-action="creer-pistes"]').click();
  await expect(f).toHaveCount(0);
  const toutes = await pistes();
  expect(toutes).toHaveLength(3);
  for (const d of toutes) expect(sansHorodatage(d)).toEqual(CHAMPS_PISTE); // liste fermée : ni texte, ni contenu, ni extrait
  expect(JSON.stringify(toutes)).not.toContain('TEXTE RECOPIÉ');
  const deux = toutes.find((d) => d.angle === 'Deuxième angle');
  expect(deux).toMatchObject({ auteur: 'claude', etat: 'nouvelle', pilier: 'cas_concrets', format: 'carrousel', ancre: 'Page tarifs', url: 'https://site-exemple.test/tarifs', sourceId: s.id });
  expect(deux.lot).toMatch(/^\d{4}-\d{2}-\d{2}-collage$/);
  expect(toutes.find((d) => d.angle === 'Troisième angle').pilier).toBeNull();
  expect((await lireDocument(`reseauxsociaux_inspirations/${s.id}`)).traiteLe).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  // 5. la liste : une ligne par piste, couleur = pilier, marque = état, compteurs
  await expect(ligne(page, s.id).locator('[data-role="compteurs-source"]')).toHaveText('3 pistes · 0 retenue · 0 postée');
  await deplier(page, s.id);
  const rangs = ligne(page, s.id).locator('.rs-piste');
  await expect(rangs).toHaveCount(3);
  const rang2 = ligne(page, s.id).locator(`[data-piste="${deux.id}"]`);
  await expect(rang2.locator('[data-role="pastille-pilier"]')).toHaveAttribute('data-pilier', 'cas_concrets');
  await expect(rang2.locator('[data-role="etat-piste"]')).toHaveAttribute('data-etat', 'stock');
  await expect(rang2.locator('[data-role="format-piste"]')).toHaveText('Carrousel');
  // 6. « En faire une idée » : l'idée est préremplie (la source = la piste), la piste est retenue
  await rang2.locator('[data-action="faire-idee"]').click();
  await expect(rang2.locator('[data-role="etat-piste"]')).toHaveAttribute('data-etat', 'retenue');
  await expect.poll(async () => (await listerDocuments('reseauxsociaux_idees')).length).toBe(1);
  const idee = (await listerDocuments('reseauxsociaux_idees'))[0];
  expect(idee).toMatchObject({ angle: 'Deuxième angle', pilier: 'cas_concrets', format: 'carrousel', etat: 'idee', pisteId: deux.id });
  expect(idee.sources[0]).toMatchObject({ type: 'site', titre: 'Site Exemple', url: 'https://site-exemple.test/tarifs', ancre: 'Page tarifs' });
  expect(idee.sources[0].extrait || '').toBe(''); // jamais d'extrait venu d'une piste
  expect(await lireDocument(`reseauxsociaux_pistes/${deux.id}`)).toMatchObject({ etat: 'retenue', ideeId: idee.id });
  await expect(ligne(page, s.id).locator('[data-role="compteurs-source"]')).toHaveText('3 pistes · 1 retenue · 0 postée');
  await expect(rang2.locator('[data-action="faire-idee"]')).toHaveCount(0);
  // 7. l'idée passe « Dans Buffer » : la piste est comptée postée (aucun appel à Buffer) ; si l'idée revient en arrière, le compteur redescend
  await ecrireDocument(`reseauxsociaux_idees/${idee.id}`, { ...(await lireDocument(`reseauxsociaux_idees/${idee.id}`)), etat: 'dans_buffer', texte: '' });
  await expect(ligne(page, s.id).locator('[data-role="compteurs-source"]')).toHaveText('3 pistes · 1 retenue · 1 postée');
  await expect(rang2.locator('[data-role="etat-piste"]')).toHaveAttribute('data-etat', 'postee');
  expect(await sansDebordement(page)).toBe(true);
  await capture(page, 'G1-liste');
  await ecrireDocument(`reseauxsociaux_idees/${idee.id}`, { ...(await lireDocument(`reseauxsociaux_idees/${idee.id}`)), etat: 'en_redaction' });
  await expect(ligne(page, s.id).locator('[data-role="compteurs-source"]')).toHaveText('3 pistes · 1 retenue · 0 postée');
});

test('G2 réponse mal formée : un message clair, aucun aperçu, AUCUNE écriture (texte sans JSON, mauvais format, autre source, trop long) ; un champ « sourceId: null » est accepté', async ({ page }) => {
  await ecrireDocument('reseauxsociaux_inspirations/s1', { type: 'site', nom: 'Site Exemple', url: 'https://site-exemple.test/', pourquoi: '', piliers: [], formats: [], ordre: 0 });
  await ouvrir(page);
  await deplier(page, 's1');
  await ligne(page, 's1').locator('[data-action="tirer-idees"]').click();
  const f = fenetre(page, 'En tirer des idées');
  await f.locator('[data-vue="claude"]').click();
  await expect(f.locator('[data-action="lire-reponse"]')).toBeDisabled(); // zone vide
  const lire = async (texte) => { await f.locator('[data-champ="reponse"]').fill(texte); await f.locator('[data-action="lire-reponse"]').click(); };
  const illisible = 'Je n’arrive pas à lire cette réponse. Copie tout le bloc entre accolades.';
  await lire('Désolé, je ne peux pas.');
  await expect(f.locator('[data-role="erreur-reponse"]')).toHaveText(illisible);
  await lire('{ ceci n’est pas du JSON }');
  await expect(f.locator('[data-role="erreur-reponse"]')).toHaveText(illisible);
  await lire(JSON.stringify({ format: 'autre', pistes: [{ angle: 'A' }] }));
  await expect(f.locator('[data-role="erreur-reponse"]')).toHaveText(illisible);
  await lire(JSON.stringify({ format: 'pistes-v1', sourceId: 'autre', pistes: [{ angle: 'A' }] }));
  await expect(f.locator('[data-role="erreur-reponse"]')).toHaveText('Cette réponse est pour une autre source.');
  await lire(`{"format":"pistes-v1","pistes":[{"angle":"${'x'.repeat(60001)}"}]}`);
  await expect(f.locator('[data-role="erreur-reponse"]')).toHaveText('Réponse trop longue.');
  await expect(f.locator('[data-role="apercu"]')).toBeEmpty();
  await expect(f.locator('[data-action="creer-pistes"]')).toBeHidden();
  expect(await pistes()).toHaveLength(0);
  await capture(page, 'G2-reponse-illisible');
  await lire(JSON.stringify({ format: 'pistes-v1', sourceId: null, pistes: [{ angle: 'Seulement un angle' }, { angle: '' }, { angle: 'y'.repeat(201) }] }));
  await expect(f.locator('[data-role="erreur-reponse"]')).toHaveText('');
  await expect(f.locator('[data-role="ligne-apercu"]')).toHaveCount(3);
  await expect(f.locator('[data-role="refus-apercu"]').first()).toContainText('angle vide');
  await expect(f.locator('[data-role="refus-apercu"]').nth(1)).toContainText('angle trop long');
  await expect(f.locator('[data-action="creer-pistes"]')).toHaveText('Créer 1 piste');
  expect(await pistes()).toHaveLength(0);
});

test('G3 résumés de veille : un contenu « résumé » de la Veille apparaît tout seul comme source (rien d’écrit), la fiche n’est créée qu’au premier lot ; « nouveau » n’apparaît pas', async ({ page }) => {
  await ecrireDocument('veille_contenus/c1', { titre: 'Résumé - Épisode fictif', etat: 'resume' });
  await ecrireDocument('veille_contenus/c2', { titre: 'Pas encore résumé', etat: 'nouveau' });
  await ouvrir(page);
  await expect(page.locator('.carte-inspiration')).toHaveCount(1);
  const l = ligne(page, 'veille-c1');
  await expect(l.locator('[data-role="nom-profil"]')).toHaveText('Résumé - Épisode fictif');
  await expect(l.locator('[data-role="compteurs-source"]')).toHaveText('0 piste · 0 retenue · 0 postée');
  expect(await listerDocuments('reseauxsociaux_inspirations')).toHaveLength(0);
  await deplier(page, 'veille-c1');
  await l.locator('[data-action="tirer-idees"]').click();
  const f = fenetre(page, 'En tirer des idées');
  await f.locator('[data-vue="claude"]').click();
  const prompt = await f.locator('[data-role="prompt"]').inputValue();
  expect(prompt).toContain('Titre du résumé : Résumé - Épisode fictif');
  expect(prompt).toContain('"sourceId": "veille-c1"');
  await f.locator('[data-vue="main"]').click();
  await f.locator('[data-champ="angle"]').fill('Une idée tirée du résumé');
  await f.locator('[data-champ="angle"]').press('Enter');
  await expect(f.locator('[data-role="piste-ajoutee"]')).toContainText('1 piste ajoutée');
  const fiche = await lireDocument('reseauxsociaux_inspirations/veille-c1');
  expect(fiche).toMatchObject({ type: 'veille', nom: 'Résumé - Épisode fictif', veilleContenuId: 'c1' });
  await f.locator('[data-champ="angle"]').fill('Une seconde idée');
  await f.locator('[data-action="ajouter-piste"]').click();
  await expect(f.locator('[data-role="piste-ajoutee"]')).toContainText('2 pistes ajoutées');
  expect(await listerDocuments('reseauxsociaux_inspirations')).toHaveLength(1); // la fiche n'est créée qu'une fois
  await f.getByRole('button', { name: 'Fermer', exact: true }).last().click();
  await expect(page.locator('.carte-inspiration')).toHaveCount(1); // jamais deux lignes pour le même résumé
  await expect(l.locator('[data-role="compteurs-source"]')).toHaveText('2 pistes · 0 retenue · 0 postée');
  expect(await sansDebordement(page)).toBe(true);
  await capture(page, 'G3-veille');
});

test('G4 vue « Toutes les pistes », recherche et filtres : à plat avec le nom de la source ; « Écarter » ne supprime rien (la piste reste, barrée, retrouvable par l’état « Écartée »)', async ({ page }) => {
  await ecrireDocument('reseauxsociaux_inspirations/s1', { type: 'site', nom: 'Site Exemple', url: 'https://site-exemple.test/', pourquoi: '', piliers: [], formats: [], ordre: 0 });
  await ecrireDocument('reseauxsociaux_inspirations/s2', { type: 'profil', nom: 'Alice Exemple', url: 'https://www.linkedin.com/in/alice-exemple', pourquoi: '', piliers: [], formats: [], ordre: 1 });
  const base = { sourceTitre: '', sourceType: 'site', note: '', ancre: '', url: '', exempleId: null, service: null, etat: 'nouvelle', ideeId: null, lot: '2026-11-13-collage', auteur: 'claude' };
  await ecrireDocument('reseauxsociaux_pistes/a', { ...base, sourceId: 's1', angle: 'Premier angle du site', pilier: 'pedagogie', format: 'texte' });
  await ecrireDocument('reseauxsociaux_pistes/b', { ...base, sourceId: 's1', angle: 'Second angle du site', pilier: 'cas_concrets', format: 'carrousel' });
  await ecrireDocument('reseauxsociaux_pistes/c', { ...base, sourceId: 's2', sourceType: 'profil', angle: 'Un angle venu du profil', pilier: 'cas_concrets', format: 'carrousel' });
  await ouvrir(page);
  await expect(page.locator('.page-inspirations .compteur-liste')).toHaveText('2 sources · 3 pistes');
  await page.locator('[data-vue="plat"]').click();
  await expect(page.locator('.rs-piste')).toHaveCount(3);
  await expect(page.locator('[data-piste="c"] [data-role="source-piste"]')).toHaveText('Alice Exemple');
  await page.getByRole('searchbox', { name: /Rechercher une source/ }).fill('profil');
  await expect(page.locator('.rs-piste')).toHaveCount(1);
  await page.getByRole('searchbox', { name: /Rechercher une source/ }).fill('zzz');
  await expect(page.locator('[data-role="aucun-resultat"]')).toBeVisible();
  await page.getByRole('searchbox', { name: /Rechercher une source/ }).fill('');
  // « Écarter » : un état de plus, rien ne s'efface
  await page.locator('[data-piste="a"] [data-action="ecarter-piste"]').click();
  await expect(page.locator('[data-piste="a"]')).toHaveAttribute('data-etat', 'ecartee');
  expect((await lireDocument('reseauxsociaux_pistes/a')).etat).toBe('ecartee');
  expect(await pistes()).toHaveLength(3);
  // filtre « État : Écartée » (fenêtre Filtres commune)
  await page.getByRole('button', { name: /Filtres/ }).click();
  const filtres = page.getByRole('dialog', { name: 'Filtres' });
  await filtres.locator('input[data-cle="etats"][data-valeur="ecartee"]').check();
  await filtres.getByRole('button', { name: 'Appliquer' }).click();
  await expect(page.locator('.rs-piste')).toHaveCount(1);
  await expect(page.locator('[data-piste="a"]')).toBeVisible();
  await capture(page, 'G4-filtre-ecartee');
  await page.locator('[data-piste="a"] [data-action="remettre-piste"]').click();
  await expect(page.locator('.rs-piste')).toHaveCount(0);
  expect((await lireDocument('reseauxsociaux_pistes/a')).etat).toBe('nouvelle');
  expect(await sansDebordement(page)).toBe(true);
});

test('G5 exemples d’un profil : une ligne avec date, réactions, commentaires, « × N la moyenne » (calculé) et la date du relevé ; jamais le texte du post', async ({ page }) => {
  await ecrireDocument('reseauxsociaux_inspirations/p1', { type: 'profil', nom: 'Alice Exemple', url: 'https://www.linkedin.com/in/alice-exemple', pourquoi: '', piliers: [], formats: [], ordre: 0, moyenneReactions: 100, moyenneCommentaires: 10, nombrePostsReleves: 8, releveLe: '2026-11-10' });
  await ecrireDocument('reseauxsociaux_exemples/e1', { profilId: 'p1', url: 'https://www.linkedin.com/posts/alice-exemple_a-1', date: '2026-10-20', accroche: 'Une accroche', structure: '', longueur: '', extrait: '', format: 'carrousel', pilier: 'cas_concrets', service: null, pourquoi: 'Un chiffre', reactions: 330, commentaires: 33, releveLe: '2026-11-10' });
  await ouvrir(page);
  await deplier(page, 'p1');
  const e = ligne(page, 'p1').locator('[data-exemple="e1"]');
  await expect(e.locator('[data-role="chiffres-exemple"]')).toContainText('330 réactions');
  await expect(e.locator('[data-role="chiffres-exemple"]')).toContainText('33 commentaires');
  await expect(e.locator('[data-role="chiffres-exemple"]')).toContainText('× 3,3 la moyenne');
  await expect(e.locator('[data-role="releve-exemple"]')).toContainText('2026');
  await expect(e.locator('[data-action="ouvrir-post"]')).toHaveAttribute('rel', /noopener/);
  // saisir les chiffres à l'écran : nombres entiers seulement
  await e.locator('[data-action="modifier-exemple"]').click();
  const f = fenetre(page, 'Modifier cet exemple');
  await f.locator('[data-champ="reactions"]').fill('400');
  await f.getByRole('button', { name: 'Enregistrer' }).click();
  await expect(f).toHaveCount(0);
  expect((await lireDocument('reseauxsociaux_exemples/e1'))).toMatchObject({ reactions: 400, commentaires: 33, releveLe: '2026-11-10' });
  await expect(e.locator('[data-role="chiffres-exemple"]')).toContainText('× 3,9 la moyenne');
  expect(await sansDebordement(page)).toBe(true);
  await capture(page, 'G5-exemples');
});

test('G6 un profil : le prompt reprend les analyses de ses exemples (jamais le texte d’un post) et l’écran des sources garde une carte vide claire (« Ajoute les profils qui t’inspirent. »)', async ({ page }) => {
  await ecrireDocument('reseauxsociaux_inspirations/p1', { type: 'profil', nom: 'Alice Exemple', url: 'https://www.linkedin.com/in/alice-exemple', pourquoi: '', piliers: [], formats: [], ordre: 0 });
  await ecrireDocument('reseauxsociaux_exemples/e1', { profilId: 'p1', url: 'https://www.linkedin.com/posts/alice-exemple_a-1', date: '2026-10-20', accroche: 'Accroche analysée', structure: 'Histoire puis leçon', longueur: '', extrait: 'EXTRAIT SAISI PAR JÉRÔME', format: null, pilier: null, service: null, pourquoi: 'Parce que' });
  await ouvrir(page);
  await deplier(page, 'p1');
  await ligne(page, 'p1').locator('[data-action="tirer-idees"]').click();
  const f = fenetre(page, 'En tirer des idées');
  await f.locator('[data-vue="claude"]').click();
  const prompt = await f.locator('[data-role="prompt"]').inputValue();
  expect(prompt).toContain('Accroche : Accroche analysée');
  expect(prompt).toContain('Structure : Histoire puis leçon');
  expect(prompt).not.toContain('EXTRAIT SAISI'); // jamais le texte d'un post, même saisi
  expect(await sansDebordement(page)).toBe(true);
  await capture(page, 'G6-prompt-profil');
});
