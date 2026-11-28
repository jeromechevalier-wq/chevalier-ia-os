// Module Console (phase 0, 16/11/2026 ; versions des bâtiments, phase 2, 28/11/2026) : accès réservé à Jérôme, Filet de sécurité, sélecteur de plateforme, versions. Un test par critère (le nom commence par son numéro).
// Captures dans tests/e2e/captures/console/ (une par état, nommée avec le projet : bureau ou téléphone).
import { fileURLToPath } from 'node:url';
import { readFile } from 'node:fs/promises';
import { test, expect, connecter, allerA, attendreCalme, ecrireDocument, lireDocument, listerDocuments, ouvrirSectionReglages, CHARLES } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/console/', import.meta.url));
async function capturer(page, info, nom) {
  await page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: false, animations: 'disabled' });
}
// Pas d'émulateur de fonctions dans ces parcours : la réponse de `consoleEtat` est simulée (protocole « callable »), préparation CORS comprise.
async function simulerServeur(page, { refuser = false } = {}) {
  await page.route('**/consoleEtat', (route) => {
    const entetes = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: entetes });
    if (refuser) return route.fulfill({ status: 403, headers: entetes, contentType: 'application/json', body: JSON.stringify({ error: { status: 'PERMISSION_DENIED', message: 'x' } }) });
    return route.fulfill({ status: 200, headers: entetes, contentType: 'application/json', body: JSON.stringify({ result: { version: '9.9.9', serveur: 'ok', plateforme: 'chevalier-ia-os' } }) });
  });
}
// Versions des bâtiments (phase 2, 28/11/2026) : réponse simulée de `consoleVersions`. Par défaut (beforeEach) le cas plein ; un test peut la remplacer (la dernière route posée gagne).
const VERSIONS_PLEINES = {
  version_reference: '2.59.0',
  batiments: [
    { cle: 'os', version: '2.59.0', depuis: '2026-11-28T09:00:00.000Z', vu_le: '2026-11-28T10:00:00.000Z', structure_code: 1, structure_base: null, etat_version: 'a_jour', etat_structure: 'inconnu', motif: null,
      historique: [{ version: '2.59.0', de_version: '2.58.0', le: '2026-11-28T09:00:00.000Z' }, { version: '2.58.0', de_version: null, le: '2026-11-20T09:00:00.000Z' }] },
    { cle: 'immeuble', version: '2.58.0', depuis: '2026-11-20T09:00:00.000Z', vu_le: '2026-11-28T10:00:00.000Z', structure_code: 1, structure_base: null, etat_version: 'en_retard', etat_structure: 'inconnu', motif: null,
      historique: [{ version: '2.58.0', de_version: null, le: '2026-11-20T09:00:00.000Z' }] },
  ],
};
const VERSIONS_VIDES = {
  version_reference: '2.59.0',
  batiments: [
    { cle: 'os', version: null, depuis: null, vu_le: null, structure_code: null, structure_base: null, etat_version: 'inconnu', etat_structure: 'inconnu', motif: 'pas encore de tampon', historique: [] },
    { cle: 'immeuble', version: null, depuis: null, vu_le: null, structure_code: null, structure_base: null, etat_version: 'inconnu', etat_structure: 'inconnu', motif: 'immeuble non relié', historique: [] },
  ],
};
async function simulerVersions(page, { reponse = VERSIONS_PLEINES, enPanne = false } = {}) {
  await page.route('**/consoleVersions', (route) => {
    const entetes = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: entetes });
    if (enPanne) return route.fulfill({ status: 500, headers: entetes, contentType: 'application/json', body: JSON.stringify({ error: { status: 'INTERNAL', message: 'x' } }) });
    return route.fulfill({ status: 200, headers: entetes, contentType: 'application/json', body: JSON.stringify({ result: reponse }) });
  });
}
// Registre des bâtiments (phase 2, PR 2, 28/11/2026) : réponse simulée de `consoleBatiments`. Par défaut (beforeEach) la réponse VIDE : 0 appartement, registre vide,
// donc le schéma figé reste tel quel (A1 exige « Appartement 1 » et « Maison client 1 »). Le cas plein, le clic et le détail : seulement dans les tests R11 à R14.
// Noms inventés génériques (dépôt public).
const BATIMENTS_VIDES = { os: { projets: [] }, immeuble: { projets: [], appartements: [], total_appartements: 0 }, maisons: [], releves: {}, motifs: [] };
const BATIMENTS_PLEINS = {
  os: { projets: [{ role: 'Firebase', libelle: 'projet-essai-os' }] },
  immeuble: {
    projets: [{ role: 'Firebase', libelle: 'projet-essai-app' }],
    appartements: [
      { id: 'essai-a', nom: 'Espace essai A', modules: ['veille', 'devis'] },
      { id: 'essai-b', nom: 'Espace essai B avec un nom vraiment très long pour voir la coupe', modules: [] },
      { id: 'essai-c', nom: 'Espace essai C', modules: ['veille'] },
      { id: 'essai-d', nom: 'Espace essai D', modules: [] },
      { id: 'essai-e', nom: 'Espace essai E', modules: [] },
    ],
    total_appartements: 5,
  },
  maisons: [
    { cle: 'maison-a', nom: 'Maison essai A', etat: 'en_construction', projets: [{ role: 'Firebase', libelle: 'projet-essai-1' }, { role: 'Cloud SQL', libelle: 'Base essai' }] },
    { cle: 'maison-b', nom: 'Maison essai B', etat: 'a_venir', projets: [] },
  ],
  releves: {
    os: { version: '2.59.0', structure_code: 1, structure_base: null, version_depuis: '2026-11-28T09:00:00.000Z', dernier_contact_ok: '2026-11-28T10:15:00.000Z', dernier_essai: '2026-11-28T10:15:00.000Z', motif: null,
      historique: [{ version: '2.59.0', de_version: '2.58.0', structure_code: 1, de_structure: 1, le: '2026-11-28T09:15:00.000Z' }, { version: '2.58.0', de_version: null, structure_code: 1, de_structure: null, le: '2026-11-20T09:15:00.000Z' }] },
    immeuble: { version: '2.58.0', structure_code: 1, structure_base: null, version_depuis: '2026-11-20T09:00:00.000Z', dernier_contact_ok: '2026-11-28T10:15:00.000Z', dernier_essai: '2026-11-28T10:15:00.000Z', motif: null,
      historique: [{ version: '2.58.0', de_version: null, structure_code: 1, de_structure: null, le: '2026-11-20T09:15:00.000Z' }] },
    'maison-a': { version: null, structure_code: null, structure_base: null, version_depuis: null, dernier_contact_ok: null, dernier_essai: '2026-11-28T10:15:00.000Z', motif: 'injoignable', historique: [] },
  },
  motifs: [],
};
async function simulerBatiments(page, { reponse = BATIMENTS_VIDES, enPanne = false } = {}) {
  await page.route('**/consoleBatiments', (route) => {
    const entetes = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: entetes });
    if (enPanne) return route.fulfill({ status: 500, headers: entetes, contentType: 'application/json', body: JSON.stringify({ error: { status: 'INTERNAL', message: 'x' } }) });
    return route.fulfill({ status: 200, headers: entetes, contentType: 'application/json', body: JSON.stringify({ result: reponse }) });
  });
}
test.beforeEach(async ({ page }) => { await simulerVersions(page); await simulerBatiments(page); });

const sansDefilementHorizontal = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

test('C4 le menu « Console » est visible pour Jérôme et mène au filet', async ({ page }) => {
  await simulerServeur(page);
  await connecter(page);
  await allerA(page, 'Console');
  await expect(page.locator('h1')).toHaveText('Console');
  await expect(page.locator('.onglets').getByRole('link', { name: 'Filet de sécurité' })).toBeVisible();
});

test('C4 le compte du bot ne voit pas le menu « Console » et l\'adresse du filet reste introuvable', async ({ page }) => {
  await connecter(page, CHARLES, { route: 'console/filet' });
  await attendreCalme(page);
  await expect(page.locator('.menu').getByRole('link', { name: 'Console', exact: true })).toHaveCount(0);
  await expect(page.locator('h1', { hasText: 'Filet de sécurité' })).toHaveCount(0);
});

test('C5 le filet liste toutes les vérifications ; une ligne jamais faite est « Jamais fait », une ligne datée est « À jour »', async ({ page }, info) => {
  await ecrireDocument('console_filet/budget', { verifieLe: new Date(), note: 'Alerte à 50 %' });
  await connecter(page, undefined, { route: 'console/filet' });
  await attendreCalme(page);
  await expect(page.locator('section[data-ligne]')).toHaveCount(7);
  await expect(page.locator('section[data-ligne="budget"]')).toContainText('À jour');
  await expect(page.locator('section[data-ligne="budget"]')).toContainText('Vérifié aujourd\'hui');
  await expect(page.locator('section[data-ligne="restauration"]')).toContainText('Jamais fait');
  await expect(page.locator('section[data-ligne="restauration"]')).toHaveAttribute('data-etat', 'jamais');
  await capturer(page, info, 'C5-filet');
});

test('C5 « Vérifié aujourd\'hui » date la ligne, la passe à jour et laisse une trace dans le journal', async ({ page }) => {
  await connecter(page, undefined, { route: 'console/filet' });
  await attendreCalme(page);
  await page.locator('section[data-ligne="restauration"] [data-action="verifier"]').click();
  await expect(page.locator('section[data-ligne="restauration"]')).toHaveAttribute('data-etat', 'ok');
  await expect.poll(() => lireDocument('console_filet/restauration'), { timeout: 10_000 }).toBeTruthy(); // l'écran se met à jour avant la fin de l'écriture : on attend le document
  await expect.poll(async () => (await listerDocuments('crm_audit')).some((d) => d.collection === 'console_filet' && d.docId === 'restauration' && d.outil === 'consoleVerifierLigne'), { timeout: 10_000 }).toBe(true); // la trace du journal
});

test('C6 cas vide : sans aucune fiche, l\'écran dit « Aucune vérification enregistrée » et propose chaque ligne', async ({ page }, info) => {
  await connecter(page, undefined, { route: 'console/filet' });
  await attendreCalme(page);
  await expect(page.locator('[data-vide]')).toHaveText('Aucune vérification enregistrée.');
  await expect(page.locator('section[data-ligne]')).toHaveCount(7);
  await capturer(page, info, 'C6-vide');
});

test('C8 le sélecteur de plateforme met la plateforme dans l\'adresse et garde « Toutes les plateformes » en premier', async ({ page }, info) => {
  await simulerServeur(page);
  await connecter(page, undefined, { route: 'console/vue' });
  await attendreCalme(page);
  const options = page.locator('select[data-action="plateforme"] option');
  await expect(options.first()).toHaveText('Toutes les plateformes');
  await page.locator('select[data-action="plateforme"]').selectOption('clients');
  await expect(page).toHaveURL(/#\/console\/vue\/clients$/);
  await expect(page.locator('select[data-action="plateforme"]')).toHaveValue('clients');
  await capturer(page, info, 'C8-selecteur');
});

test('C10 les deux écrans tiennent sans défilement horizontal de la page', async ({ page }) => {
  await simulerServeur(page);
  await connecter(page, undefined, { route: 'console/vue' });
  await attendreCalme(page);
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await page.goto('/?emulateurs=1#/console/filet');
  await attendreCalme(page);
  expect(await sansDefilementHorizontal(page)).toBe(true);
});

test('C5 une 2e vérification MODIFIE la fiche (le journal garde l\'ancienne date) et ne supprime pas la note', async ({ page }) => {
  await ecrireDocument('console_filet/budget', { verifieLe: new Date(Date.now() - 100 * 86_400_000), note: 'Alerte à 50 %' });
  await connecter(page, undefined, { route: 'console/filet' });
  await attendreCalme(page);
  await expect(page.locator('section[data-ligne="budget"]')).toHaveAttribute('data-etat', 'ancien');
  await page.locator('section[data-ligne="budget"] [data-action="verifier"]').click();
  await expect(page.locator('section[data-ligne="budget"]')).toHaveAttribute('data-etat', 'ok');
  await expect.poll(async () => (await listerDocuments('crm_audit')).some((d) => d.collection === 'console_filet' && d.docId === 'budget' && d.action === 'modifier'), { timeout: 10_000 }).toBe(true);
  expect((await lireDocument('console_filet/budget')).note).toBe('Alerte à 50 %');
});

test('C9 le bouton « Exporter mes données » (Réglages > Console) télécharge un JSON des vérifications du filet', async ({ page }) => {
  await ecrireDocument('console_filet/budget', { verifieLe: new Date(), note: 'Alerte à 50 %' });
  await simulerServeur(page);
  await connecter(page);
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Console');
  const bouton = page.locator('#reglages-export-console [data-action="exporter-console"]');
  await expect(bouton).toHaveText('Exporter mes données');
  const [dl] = await Promise.all([page.waitForEvent('download'), bouton.click()]);
  expect(dl.suggestedFilename()).toMatch(/^chevalier-ia-console-\d{4}-\d{2}-\d{2}\.json$/);
  const json = JSON.parse(await readFile(await dl.path(), 'utf8'));
  expect(Object.keys(json.collections)).toEqual(['console_filet', 'console_versions', 'console_registre', 'console_releves']); // R10 : registre et relevés (ici vides)
  expect(json.collections.console_registre.map((b) => b.cle)).toEqual(['os', 'immeuble']);
  expect(json.collections.console_versions.map((b) => [b.cle, b.version])).toEqual([['os', '2.59.0'], ['immeuble', '2.58.0']]); // V14 : les versions des bâtiments
  expect(json.collections.console_filet.map((f) => f.id)).toEqual(['budget']);
});

test('F7 export plein (réponse pleine simulée) : seulement ce que l\'écran montre, jamais le projet à lire ni l\'identifiant d\'un appartement', async ({ page }) => {
  // Réponse pleine « trop bavarde » : un projet à lire et des champs en plus dans un relevé ; l'export doit les laisser de côté (relecture Fable de la PR 771).
  const bavard = structuredClone(BATIMENTS_PLEINS);
  bavard.maisons[0].lecture_projet = 'projet-essai-1';
  bavard.releves.os.lecture_projet = 'projet-essai-os';
  bavard.releves.os.champ_inconnu = 'x';
  bavard.releves.os.historique[0].lecture_projet = 'projet-essai-os';
  await simulerServeur(page);
  await simulerBatiments(page, { reponse: bavard });
  await connecter(page);
  await allerA(page, 'Réglages');
  await ouvrirSectionReglages(page, 'Console');
  const bouton = page.locator('#reglages-export-console [data-action="exporter-console"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), bouton.click()]);
  const texte = await readFile(await dl.path(), 'utf8');
  const json = JSON.parse(texte);
  const registre = json.collections.console_registre;
  expect(registre.map((b) => b.cle)).toEqual(['os', 'immeuble', 'maison-a', 'maison-b']);
  const immeuble = registre[1];
  expect(Object.keys(immeuble)).toEqual(['cle', 'projets', 'appartements', 'total_appartements']);
  expect(immeuble.appartements).toHaveLength(5);
  for (const a of immeuble.appartements) expect(Object.keys(a)).toEqual(['nom', 'modules']);
  expect(immeuble.appartements[0]).toEqual({ nom: 'Espace essai A', modules: ['veille', 'devis'] });
  for (const m of registre.slice(2)) expect(Object.keys(m)).toEqual(['cle', 'nom', 'etat', 'projets']);
  const releves = json.collections.console_releves;
  expect(releves.map((r) => r.cle)).toEqual(['os', 'immeuble', 'maison-a']);
  for (const r of releves) {
    expect(Object.keys(r)).toEqual(['cle', 'version', 'version_depuis', 'structure_code', 'dernier_contact_ok', 'dernier_essai', 'motif', 'historique']);
    for (const l of r.historique) expect(Object.keys(l)).toEqual(['version', 'de_version', 'structure_code', 'de_structure', 'le']);
  }
  expect(releves[0].version).toBe('2.59.0');
  expect(releves[2].motif).toBe('injoignable');
  expect(texte).not.toContain('lecture_projet');
  expect(texte).not.toContain('champ_inconnu');
  const batiments = JSON.stringify([registre, releves]); // le filet (autre partie du fichier) garde ses propres identifiants
  expect(batiments).not.toContain('"id"');
  expect(batiments).not.toContain('"essai-a"'); // l'identifiant d'un appartement n'est pas exporté
});

test('A1 Vue d\'ensemble : le schéma d\'architecture s\'affiche', async ({ page }, info) => {
  await simulerServeur(page);
  await connecter(page, undefined, { route: 'console/vue' });
  await attendreCalme(page);
  const bloc = page.locator('[data-bloc="architecture"]');
  await expect(bloc).toBeVisible();
  const dessin = bloc.locator('svg[role="img"]:visible');
  await expect(dessin).toHaveCount(1); // un seul des deux dessins (large ou étroit) est montré
  expect((await dessin.getAttribute('aria-label')).trim().length).toBeGreaterThan(20);
  for (const t of ['Chevalier IA OS', 'Chevalier IA App', 'Appartement 1', 'Maison client 1', 'n8n']) await expect(bloc).toContainText(t);
  // Textes du dessin visible lisibles : 12 px rendus au moins (téléphone 390 px compris), et la page ne défile pas en largeur.
  const lisible = async () => {
    const d = bloc.locator('svg[role="img"]:visible');
    await expect(d).toHaveCount(1);
    const plusPetit = await d.evaluate((svg) => Math.min(...[...svg.querySelectorAll('text')].map((t) => parseFloat(t.getAttribute('font-size')) * svg.getScreenCTM().a)));
    expect(plusPetit).toBeGreaterThanOrEqual(12);
    expect(await sansDefilementHorizontal(page)).toBe(true);
  };
  await lisible();
  await bloc.scrollIntoViewIfNeeded();
  await capturer(page, info, 'A1-schema');
  // Fenêtre de 800 px avec le menu latéral : la bascule suit la largeur de la section (@container), pas celle de la fenêtre.
  await page.setViewportSize({ width: 800, height: 900 });
  await lisible();
});

test('A2 Le schéma ne dépend pas des données', async ({ page }) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'le faux serveur de la Console refuse exprès (erreur 403)' });
  await simulerServeur(page, { refuser: true });
  await connecter(page, undefined, { route: 'console/vue' });
  await attendreCalme(page);
  // Données de la Console en erreur (comme une lecture refusée par la base) : l'écran est redessiné en changeant de plateforme.
  await page.evaluate(async () => { const D = await import('/js/modules/console/donnees.js'); D.etat.pret = true; D.etat.erreur = true; });
  await page.locator('select[data-action="plateforme"]').selectOption('clients');
  await expect(page.locator('.console-zone [data-action="reessayer"]')).toBeVisible();
  await expect(page.locator('.console-zone')).toContainText('Les données de la Console ne se chargent pas.');
  await expect(page.locator('.page > [data-bloc="architecture"]')).toBeVisible();
  await expect(page.locator('.page > [data-bloc="architecture"] svg[role="img"]:visible')).toHaveCount(1);
  await expect(page.locator('.console-zone [data-bloc="architecture"]')).toHaveCount(0);
});

test('V10 Vue d\'ensemble : le bloc « Versions » sous le schéma montre une ligne par bâtiment et déplie l\'historique', async ({ page }, info) => {
  await simulerServeur(page);
  await connecter(page, undefined, { route: 'console/vue' });
  await attendreCalme(page);
  const bloc = page.locator('.page > [data-bloc="versions"]');
  await expect(bloc).toBeVisible();
  expect(await page.evaluate(() => { const s = document.querySelector('.page > [data-bloc="architecture"]'); return s?.nextElementSibling?.dataset.bloc; })).toBe('versions'); // juste sous le schéma
  await expect(bloc.locator('[data-batiment]')).toHaveCount(2);
  const os = bloc.locator('[data-batiment="os"]');
  await expect(os.locator('h3')).toHaveText('Chevalier IA OS');
  await expect(os).toContainText('2.59.0 depuis le 28/11/2026');
  await expect(os).toContainText('Version : à jour');
  await expect(os).toContainText('Structure : inconnue');
  await expect(os.locator('[data-vu-le]')).toHaveText('vu le 28/11/2026 à 11:00');
  const immeuble = bloc.locator('[data-batiment="immeuble"]');
  await expect(immeuble.locator('h3')).toHaveText('Chevalier IA App');
  await expect(immeuble).toContainText('Version : en retard');
  await expect(os.locator('li').first()).toBeHidden();
  await os.getByText('Historique', { exact: true }).click();
  await expect(os.locator('li')).toHaveCount(2);
  await expect(os.locator('li').first()).toHaveText('2.59.0 (avant : 2.58.0), le 28/11/2026 à 10:00');
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await bloc.scrollIntoViewIfNeeded();
  await capturer(page, info, 'V10-versions');
});

test('V11 cas vide : un bâtiment sans tampon dit « Version inconnue… », l\'immeuble non relié montre seulement son motif', async ({ page }, info) => {
  await simulerServeur(page);
  await simulerVersions(page, { reponse: VERSIONS_VIDES });
  await connecter(page, undefined, { route: 'console/vue' });
  await attendreCalme(page);
  const bloc = page.locator('[data-bloc="versions"]');
  await expect(bloc.locator('[data-batiment] [data-vide]')).toHaveCount(1);
  await expect(bloc.locator('[data-batiment="os"] [data-vide]')).toHaveText('Version inconnue : ce bâtiment n\'a pas encore été remis en ligne avec le tampon.');
  await expect(bloc.locator('[data-batiment="os"] [data-motif]')).toHaveCount(0);
  await expect(bloc.locator('[data-batiment="immeuble"] [data-motif]')).toHaveText('Motif : immeuble non relié.');
  await expect(bloc.locator('[data-batiment="immeuble"] [data-vide]')).toHaveCount(0);
  await expect(bloc.locator('[data-batiment="os"]')).toContainText('Version : inconnue');
  await bloc.scrollIntoViewIfNeeded();
  await capturer(page, info, 'V11-versions-vide');
});

test('V12 cas d\'erreur : message lisible, « Réessayer » relit les versions ; le reste de l\'écran reste là', async ({ page }, info) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'le faux serveur des versions répond en erreur (500) exprès' });
  await simulerServeur(page);
  await simulerVersions(page, { enPanne: true });
  await connecter(page, undefined, { route: 'console/vue' });
  await attendreCalme(page);
  const bloc = page.locator('[data-bloc="versions"]');
  await expect(bloc.locator('[data-erreur="versions"]')).toContainText('Les versions ne se lisent pas pour l\'instant.');
  await expect(page.locator('.page > [data-bloc="architecture"]')).toBeVisible();
  await bloc.scrollIntoViewIfNeeded();
  await capturer(page, info, 'V12-versions-erreur');
  await simulerVersions(page); // le serveur répond de nouveau
  await bloc.locator('[data-action="reessayer-versions"]').click();
  await expect(bloc.locator('[data-batiment]')).toHaveCount(2);
  await expect(bloc.locator('[data-erreur="versions"]')).toHaveCount(0);
});

// Textes du dessin visible lisibles (12 px rendus au moins) et page sans défilement horizontal.
async function schemaLisible(page) {
  const d = page.locator('[data-bloc="architecture"] svg[role="img"]:visible');
  await expect(d).toHaveCount(1);
  const plusPetit = await d.evaluate((svg) => Math.min(...[...svg.querySelectorAll('text')].map((t) => parseFloat(t.getAttribute('font-size')) * svg.getScreenCTM().a)));
  expect(plusPetit).toBeGreaterThanOrEqual(12);
  expect(await sansDefilementHorizontal(page)).toBe(true);
}

test('R11 registre plein : l\'immeuble montre tous les appartements (identifiants) et « À venir » ; les maisons du registre remplacent « Maison client 1 »', async ({ page }, info) => {
  await simulerServeur(page);
  await simulerBatiments(page, { reponse: BATIMENTS_PLEINS });
  await connecter(page, undefined, { route: 'console/vue' });
  await attendreCalme(page);
  const bloc = page.locator('.page > [data-bloc="architecture"]');
  const dessin = bloc.locator('svg[role="img"]:visible');
  await expect(dessin).toContainText('essai-a');
  for (const t of ['essai-b', 'essai-c', 'essai-d', 'essai-e', 'À venir', 'Maison essai A', 'Maison essai B', 'Maison à venir', 'Chevalier IA OS', 'Chevalier IA App']) await expect(dessin).toContainText(t);
  await expect(dessin).not.toContainText('Maison client 1');
  await expect(dessin).not.toContainText('autres');
  await expect(dessin).not.toContainText('Espace essai'); // les noms d'affichage ne sont plus dans le dessin (AR7)
  expect((await dessin.getAttribute('aria-label')).trim().length).toBeGreaterThan(20); // le dessin garde role="img" et son libellé
  expect(await page.evaluate(() => document.querySelector('.page > [data-bloc="architecture"]')?.nextElementSibling?.dataset.bloc)).toBe('versions');
  await schemaLisible(page);
  await expect(bloc.locator('[data-registre-vide]')).toHaveCount(0);
  await bloc.scrollIntoViewIfNeeded();
  await capturer(page, info, 'R11-registre-plein');
});

test('F8 deux appartements : les étages partent du bas (le premier touche le sol), « À venir » reste en haut', async ({ page }, info) => {
  const deux = structuredClone(BATIMENTS_PLEINS);
  deux.immeuble.appartements = [deux.immeuble.appartements[0], { id: 'essai-c', nom: 'Espace essai C', modules: [] }];
  deux.immeuble.total_appartements = 2;
  await simulerServeur(page);
  await simulerBatiments(page, { reponse: deux });
  await connecter(page, undefined, { route: 'console/vue' });
  await attendreCalme(page);
  const bloc = page.locator('.page > [data-bloc="architecture"]');
  const dessin = bloc.locator('svg[role="img"]:visible');
  await expect(dessin).toContainText('essai-c');
  // Places des étages de l'immeuble : le mur (140 de large) et ses fenêtres d'étage (124 de large), avec le texte de chacune.
  const places = await dessin.evaluate((svg) => {
    const mur = [...svg.querySelectorAll('rect.console-schema-mur')].find((r) => r.getAttribute('width') === '140');
    const sol = Number(mur.getAttribute('y')) + Number(mur.getAttribute('height'));
    const etages = [...svg.querySelectorAll('rect.console-schema-fenetre')].filter((r) => r.getAttribute('width') === '124')
      .map((r) => ({ haut: Number(r.getAttribute('y')), bas: Number(r.getAttribute('y')) + Number(r.getAttribute('height')), texte: r.parentNode.querySelector('text')?.textContent }))
      .sort((a, b) => a.haut - b.haut);
    return { sol, haut: Number(mur.getAttribute('y')), etages };
  });
  expect(places.etages.map((e) => e.texte)).toEqual(['À venir', 'essai-c', 'essai-a']);
  expect(places.etages[0].haut).toBe(places.haut + 8); // « À venir » en haut, comme le schéma figé
  expect(places.etages[2].bas).toBe(places.sol - 7); // le premier appartement touche le sol (même marge que le schéma figé)
  expect(places.etages[2].haut - places.etages[1].haut).toBe(33); // les deux appartements se suivent, sans trou
  await schemaLisible(page);
  await bloc.scrollIntoViewIfNeeded();
  await capturer(page, info, 'F8-deux-appartements');
});

test('R12 un vrai bouton par bâtiment et par appartement ouvre le détail (clic et touche Entrée) ; « Fermer » le referme', async ({ page }, info) => {
  await simulerServeur(page);
  await simulerBatiments(page, { reponse: BATIMENTS_PLEINS });
  await connecter(page, undefined, { route: 'console/vue' });
  await attendreCalme(page);
  const bloc = page.locator('[data-bloc="batiments"]');
  const boutons = bloc.locator('button[data-action="ouvrir-batiment"]');
  await expect(boutons).toHaveCount(2 + 5 + 2);
  await expect(boutons.first()).toHaveAccessibleName('Chevalier IA OS');
  const detail = bloc.locator('.console-detail');
  await expect(detail).toBeHidden();
  // Une maison : nom, état, projets, motif « injoignable », historique vide.
  await bloc.getByRole('button', { name: 'Maison essai A' }).click();
  await expect(detail).toBeVisible();
  await expect(detail.locator('h3')).toHaveText('Maison essai A');
  await expect(detail).toContainText('État : en construction');
  await expect(detail.locator('[data-champ="projets"] li')).toHaveText(['Firebase : projet-essai-1', 'Cloud SQL : Base essai']);
  await expect(detail.locator('[data-champ="releve"] [data-motif]')).toHaveText('Motif : injoignable (droit de lecture absent ou bâtiment hors ligne).');
  await expect(detail).toContainText('Dernier essai le 28/11/2026 à 11:15');
  await expect(bloc.getByRole('button', { name: 'Maison essai A' })).toHaveAttribute('aria-expanded', 'true');
  await detail.scrollIntoViewIfNeeded();
  await capturer(page, info, 'R12-detail-maison');
  await detail.locator('[data-action="fermer-detail"]').click();
  await expect(detail).toBeHidden();
  await expect(bloc.getByRole('button', { name: 'Maison essai A' })).toBeFocused();
  // Un appartement, au clavier : la version et l'historique de l'immeuble, et ses modules actifs.
  await expect(bloc.getByRole('button', { name: 'essai-a', exact: true })).toHaveAttribute('title', 'Espace essai A'); // identifiant affiché, nom en infobulle (AR7)
  await bloc.getByRole('button', { name: 'essai-a', exact: true }).focus();
  await page.keyboard.press('Enter');
  await expect(detail.locator('h3')).toHaveText('Espace essai A');
  await expect(detail.locator('[data-champ="modules"] li')).toHaveText(['Veille', 'Devis']);
  await expect(detail).toContainText('Version : 2.58.0, depuis le 20/11/2026');
  await expect(detail).toContainText('Vu le 28/11/2026 à 11:15 (dernier contact)');
  await expect(detail.locator('[data-champ="historique"] li')).toHaveText(['2.58.0 (premier tampon), le 20/11/2026 à 10:15']);
  // Le CRM : deux lignes d'historique.
  await bloc.getByRole('button', { name: 'Chevalier IA OS' }).click();
  await expect(detail.locator('h3')).toHaveText('Chevalier IA OS');
  await expect(detail.locator('[data-champ="historique"] li')).toHaveCount(2);
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await detail.scrollIntoViewIfNeeded();
  await capturer(page, info, 'R12-detail-crm');
});

test('R13 cas vide : le schéma figé reste tel quel et l\'écran dit « Registre vide… » ; les boutons du CRM et de l\'immeuble restent', async ({ page }, info) => {
  await simulerServeur(page);
  await connecter(page, undefined, { route: 'console/vue' });
  await attendreCalme(page);
  const bloc = page.locator('.page > [data-bloc="architecture"]');
  for (const t of ['Appartement 1', 'Maison client 1']) await expect(bloc.locator('svg[role="img"]:visible')).toContainText(t);
  await expect(bloc.locator('[data-registre-vide]')).toHaveText('Registre vide : les maisons s\'afficheront quand la fiche privée sera remplie.');
  await expect(bloc.locator('button[data-action="ouvrir-batiment"]')).toHaveCount(2);
  await bloc.getByRole('button', { name: 'Chevalier IA App' }).click();
  await expect(bloc.locator('.console-detail [data-champ="releve"] [data-vide]')).toHaveText('Aucun relevé pour l\'instant : la copie se fait toutes les heures.');
  await expect(bloc.locator('.console-detail [data-champ="projets"]')).toContainText('Aucun projet noté dans le registre.');
  await bloc.locator('[data-bloc="batiments"]').scrollIntoViewIfNeeded();
  await capturer(page, info, 'R13-registre-vide');
});

test('R14 cas d\'erreur : message lisible et « Réessayer » ; le schéma figé et les versions restent là', async ({ page }, info) => {
  test.info().annotations.push({ type: 'erreurs-reseau-attendues', description: 'le faux serveur des bâtiments répond en erreur (500) exprès' });
  await simulerServeur(page);
  await simulerBatiments(page, { enPanne: true });
  await connecter(page, undefined, { route: 'console/vue' });
  await attendreCalme(page);
  const bloc = page.locator('[data-bloc="batiments"]');
  await expect(bloc.locator('[data-erreur="batiments"]')).toContainText('Les bâtiments ne se lisent pas pour l\'instant.');
  await expect(page.locator('.page > [data-bloc="architecture"] svg[role="img"]:visible')).toContainText('Maison client 1');
  await expect(page.locator('.page > [data-bloc="versions"]')).toBeVisible();
  await bloc.scrollIntoViewIfNeeded();
  await capturer(page, info, 'R14-batiments-erreur');
  await simulerBatiments(page, { reponse: BATIMENTS_PLEINS }); // le serveur répond de nouveau
  await bloc.locator('[data-action="reessayer-batiments"]').click();
  await expect(bloc.locator('button[data-action="ouvrir-batiment"]')).toHaveCount(9);
  await expect(page.locator('.page > [data-bloc="architecture"] svg[role="img"]:visible')).toContainText('Maison essai A');
});

// Retouche du schéma « Architecture » (28/11/2026) : textes AR1, AR3, AR4 ; projet Google sous chaque bâtiment (AR5) ; immeuble rehaussé avec 12 appartements (AR6) ;
// identifiants d'espace dans le dessin et sur les boutons, nom d'affichage en infobulle (AR7). Noms inventés génériques (dépôt public).
test('AR1 AR3 AR4 AR5 AR6 AR7 schéma : textes revus, projet Google sous chaque bâtiment, tous les appartements par identifiant', async ({ page }, info) => {
  const douze = structuredClone(BATIMENTS_PLEINS);
  douze.immeuble.appartements = Array.from({ length: 12 }, (_, i) => ({ id: `essai-${String.fromCharCode(97 + i)}`, nom: `Espace essai ${i + 1}`, modules: [] }));
  douze.immeuble.total_appartements = 12;
  await simulerServeur(page);
  await simulerBatiments(page, { reponse: douze });
  await connecter(page, undefined, { route: 'console/vue' });
  await attendreCalme(page);
  const bloc = page.locator('.page > [data-bloc="architecture"]');
  const dessin = bloc.locator('svg[role="img"]:visible');
  await expect(dessin).toContainText('essai-l');
  for (const t of ['Firestore', 'tes données', 'et tes réglages', 'Cloud SQL', 'les données', 'n8n : automatisations', 'sur VPS Hostinger', 'projet-essai-os', 'projet-essai-app', 'projet-essai-1']) {
    await expect(dessin).toContainText(t);
  }
  await expect(dessin).not.toContainText('serveur à part');
  await expect(dessin).not.toContainText('factures');
  // Les 12 appartements + « À venir » tiennent dans l'immeuble, sans chevauchement, et le dessin ne se recouvre pas (sol sous le dernier étage).
  const g = await dessin.evaluate((svg) => {
    const mur = [...svg.querySelectorAll('rect.console-schema-mur')].find((r) => r.getAttribute('width') === '140');
    const etages = [...svg.querySelectorAll('rect.console-schema-fenetre')].filter((r) => r.getAttribute('width') === '124')
      .map((r) => ({ haut: Number(r.getAttribute('y')), bas: Number(r.getAttribute('y')) + Number(r.getAttribute('height')) })).sort((a, b) => a.haut - b.haut);
    return { haut: Number(mur.getAttribute('y')), bas: Number(mur.getAttribute('y')) + Number(mur.getAttribute('height')), etages };
  });
  expect(g.etages).toHaveLength(13);
  expect(g.etages[0].haut).toBeGreaterThanOrEqual(g.haut);
  expect(g.etages.at(-1).bas).toBeLessThanOrEqual(g.bas);
  for (let i = 1; i < g.etages.length; i++) expect(g.etages[i].haut).toBeGreaterThanOrEqual(g.etages[i - 1].bas);
  const boutons = bloc.locator('button[data-action="ouvrir-batiment"]');
  await expect(boutons).toHaveCount(2 + 12 + 2);
  await expect(bloc.getByRole('button', { name: 'essai-a', exact: true })).toHaveAttribute('title', 'Espace essai 1');
  await expect(bloc.locator('[data-bloc="batiments"]')).not.toContainText('Espace essai');
  await schemaLisible(page);
  await bloc.scrollIntoViewIfNeeded();
  await page.screenshot({ path: `${DOSSIER}AR-schema-${info.project.name}.png`, fullPage: true, animations: 'disabled' });
});

// Deuxième retouche (28/11/2026) : nuage Cloud SQL commun grisé au-dessus des deux premiers bâtiments (AR8), Firestore de l'immeuble (AR9),
// 2e nuage Firestore de la maison client (AR10), sans chevauchement en ordinateur comme en téléphone (les deux dessins sont vérifiés).
test('AR8 AR9 AR10 nuages : Cloud SQL commun à venir, Firestore de l\'immeuble, Firestore de la maison client, sans chevauchement', async ({ page }, info) => {
  await simulerServeur(page);
  await connecter(page, undefined, { route: 'console/vue' });
  await attendreCalme(page);
  const bloc = page.locator('.page > [data-bloc="architecture"]');
  const dessin = bloc.locator('svg[role="img"]:visible');
  for (const t of ['Cloud SQL — à venir', 'les données à venir', 'les données', 'et les réglages', 'les réglages']) await expect(dessin).toContainText(t);
  await expect(dessin).not.toContainText('tiroir');
  // Le dessin visible : le large en ordinateur, puis l'étroit (800 px avec le menu latéral, comme A1 ; le format téléphone passe par la suite de nuit) (getBBox ne mesure qu'un dessin affiché).
  for (const [largeur, classe] of [[null, 'console-schema-large'], [800, 'console-schema-etroit']]) {
    if (largeur) await page.setViewportSize({ width: largeur, height: 900 });
    await expect(page.locator(`[data-bloc="architecture"] svg.${classe}`)).toBeVisible();
    const g = await page.locator(`[data-bloc="architecture"] svg.${classe}`).evaluate((svg) => {
      const boite = (n) => { const b = n.getBBox(); return { x: b.x, y: b.y, d: b.x + b.width, b: b.y + b.height }; };
      const nuages = [...svg.querySelectorAll('path.console-schema-nuage')].map((n) => ({ commun: n.classList.contains('console-schema-nuage-commun'), ...boite(n) }));
      const commun = nuages.find((n) => n.commun);
      const autres = nuages.filter((n) => !n.commun);
      const croise = (a, b) => a.x < b.d - 1 && b.x < a.d - 1 && a.y < b.b - 1 && b.y < a.b - 1;
      const chevauchements = autres.flatMap((a, i) => autres.slice(i + 1).filter((b) => croise(a, b)).map(() => 1)).length + autres.filter((a) => croise(a, commun)).length;
      const grise = commun && svg.querySelector('path.console-schema-nuage-commun').parentNode.classList.contains('console-schema-avenir');
      return { nb: nuages.length, chevauchements, grise, largeurCommun: commun.d - commun.x };
    });
    expect(g.nb).toBe(6); // commun + 4 bâtiments + 2e nuage de la maison client
    expect(g.chevauchements).toBe(0);
    expect(g.grise).toBe(true);
    expect(g.largeurCommun).toBeGreaterThan(300); // couvre les deux premiers bâtiments
    await schemaLisible(page);
    await bloc.scrollIntoViewIfNeeded();
    await page.screenshot({ path: `${DOSSIER}AR8-nuages-${largeur ? 'etroit' : 'large'}-${info.project.name}.png`, fullPage: true, animations: 'disabled' });
  }
});
