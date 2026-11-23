// Tableau de bord, partie B2 (23/11/2026) : l'ÉCRAN des filtres (barre, fenêtre, pastilles, mémoire par onglet, croisement par clic, filtre refusé, mention, export CSV, format euros4).
// Aucun émulateur de fonctions : la réponse de `pilotageLire` est simulée (protocole « callable », préparation CORS comprise), avec un faux serveur qui applique les défauts et filtre les lignes. Données fictives.
// Un test par critère (le nom commence par son numéro : B2.1 à B2.10). Captures dans tests/e2e/captures/pilotage/ (jamais commitées), une par point, nommée avec le projet.
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/pilotage/', import.meta.url));
const capturer = async (page, info, nom) => { await page.waitForTimeout(900); return page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: true, animations: 'disabled' }); };
const ENTETES = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
const ok = (donnees) => ({ status: 200, headers: ENTETES, contentType: 'application/json', body: JSON.stringify({ result: donnees }) });
const refuseFiltre = () => ({ status: 400, headers: ENTETES, contentType: 'application/json', body: JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'Filtre invalide.', details: { code: 'invalid-argument', raison: 'filtre' } } }) });
const refuseOnglet = () => ({ status: 400, headers: ENTETES, contentType: 'application/json', body: JSON.stringify({ error: { status: 'INVALID_ARGUMENT', message: 'Onglet inconnu.' } }) });
const NNBSP = ' ';
const NBSP = ' ';

async function simulerServeur(page, repondre) {
  const appels = [];
  await page.route('**/pilotageLire', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: ENTETES });
    const corps = route.request().postDataJSON()?.data ?? {};
    appels.push(corps);
    return route.fulfill(await repondre(corps, appels.length));
  });
  return appels;
}
async function ouvrir(page, route = 'pilotage/pilotage') {
  await connecter(page, undefined, { route });
  await attendreCalme(page);
}
const sansDefilementHorizontal = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);

// ---------- Faux serveur : défauts, filtres, lignes ----------
const LIEUX = ['Nord', 'Sud', 'Est'];
const VENTES = { Nord: 300, Sud: 200, Est: 100 };
const OPTION_VENTES = { dataset: { dimensions: ['lieu', 'ventes'] }, tooltip: { trigger: 'axis' }, xAxis: { type: 'category' }, yAxis: { type: 'value' }, series: [{ type: 'bar', name: 'Ventes', encode: { x: 'lieu', y: 'ventes' }, barWidth: 60 }] };
const LIGNES = [{ nom: 'Chantier A', lieu: 'Nord', montant: 1500.5, alerte: false }, { nom: '=SOMME(1;2)', lieu: 'Sud', montant: -20, alerte: true }, { nom: 'Chantier "C"; suite', lieu: 'Est', montant: 300, alerte: false }];
const IDS_SUIVI = ['periode', 'lieu', 'etat', 'montant', 'alerte'];
const IDS_AUTRE = ['periode'];
const ONGLETS = [{ id: 'suivi', titre: 'Suivi', tuiles: ['ventes', 'liste', 'budget', 'cout'], filtres: IDS_SUIVI }, { id: 'autre', titre: 'Autre', tuiles: ['autre_nombre'], filtres: IDS_AUTRE }];

function appliquePeriode(v) {
  if (!v) return { raccourci: '12_mois', du: '2025-11-23', au: '2026-11-23' };
  if (v.raccourci === 'tout') return { raccourci: 'tout' };
  if (v.raccourci) return { raccourci: v.raccourci, du: '2026-11-01', au: '2026-11-30' };
  return { du: v.du, au: v.au };
}
/** Un serveur de poche : refuse un filtre hors de l'onglet lu (comme le vrai), applique le défaut de la période, filtre les lignes par lieu / alerte / montant. */
function serveur(corps, { sansFiltres = false, tronquee = false, extra = {} } = {}) {
  const onglet = corps.onglet ?? 'suivi';
  if (!ONGLETS.some((o) => o.id === onglet)) return refuseOnglet();
  const ids = onglet === 'suivi' ? IDS_SUIVI : IDS_AUTRE;
  const f = corps.filtres ?? {};
  if (Object.keys(f).some((k) => !ids.includes(k))) return refuseFiltre();
  const periode = appliquePeriode(f.periode);
  const lieux = Array.isArray(f.lieu) && f.lieu.length ? f.lieu : null;
  const alerte = f.alerte === true || f.alerte === false ? f.alerte : null;
  const montant = f.montant && Object.keys(f.montant).length ? f.montant : null;
  const lignes = LIGNES.filter((l) => (!lieux || lieux.includes(l.lieu)) && (alerte === null || l.alerte === alerte) && (!montant || ((montant.min === undefined || l.montant >= montant.min) && (montant.max === undefined || l.montant <= montant.max))));
  const decls = [
    { id: 'periode', libelle: 'Période', type: 'periode', applique: periode },
    { id: 'lieu', libelle: 'Lieu', type: 'liste', multiple: true, valeurs: LIEUX, ...(tronquee ? { tronquee: true } : {}), ...(lieux ? { applique: lieux } : {}) },
    { id: 'etat', libelle: 'État', type: 'liste', choix: [{ valeur: 'ouvert', libelle: 'Ouvert' }, { valeur: 'clos', libelle: 'Clos' }], ...(Array.isArray(f.etat) && f.etat.length ? { applique: f.etat } : {}) },
    { id: 'montant', libelle: 'Montant', type: 'intervalle', ...(montant ? { applique: montant } : {}) },
    { id: 'alerte', libelle: 'Avec alerte', type: 'oui_non', ...(alerte !== null ? { applique: alerte } : {}) },
  ].filter((d) => ids.includes(d.id));
  const tuilesSuivi = [
    { id: 'ventes', type: 'graphique', titre: 'Ventes par lieu', largeur: 'moitie', option: OPTION_VENTES, lignes: LIEUX.filter((l) => !lieux || lieux.includes(l)).map((l) => ({ lieu: l, ventes: VENTES[l] })), filtresAppliques: ['periode', 'lieu'], croisement: { filtre: 'lieu' } },
    { id: 'liste', type: 'tableau', titre: 'Chantiers', largeur: 'pleine', parPage: 10, colonnes: [{ colonne: 'nom', titre: 'Chantier' }, { colonne: 'lieu', titre: 'Lieu' }, { colonne: 'montant', titre: 'Montant', format: 'euros2' }, { colonne: 'alerte', titre: 'Alerte' }], lignes, filtresAppliques: ['periode', 'lieu', 'montant', 'alerte'] },
    { id: 'budget', type: 'chiffre', titre: 'Budget total', largeur: 'tiers', valeur: { colonne: 'total', format: 'euros0' }, lignes: [{ total: 100000 }], mentionNonFiltre: 'Non filtré par la période.' },
    { id: 'cout', type: 'chiffre', titre: 'Coût d\'une réponse', largeur: 'tiers', valeur: { colonne: 'cout', format: 'euros4' }, lignes: [{ cout: 0.0009 }] },
  ];
  const tuilesAutre = [{ id: 'autre_nombre', type: 'chiffre', titre: 'Un autre chiffre', largeur: 'tiers', valeur: { colonne: 'n', format: 'entier' }, lignes: [{ n: 42 }], filtresAppliques: ['periode'] }];
  return ok({ titre: 'Mes chiffres', onglets: ONGLETS, onglet, tuiles: onglet === 'suivi' ? tuilesSuivi : tuilesAutre, erreurs: [], ...(sansFiltres ? {} : { filtres: decls }), ...extra });
}

async function ouvrirFenetre(page) {
  await page.locator('button[data-action="filtres"]').click();
  const f = page.locator('.dialogue-filtres');
  await expect(f).toBeVisible();
  return f;
}
const appliquer = (page) => page.locator('.dialogue-filtres button[data-valeur="appliquer"]').click();
const textesPastilles = (page) => page.locator('.pilotage-filtre-pastille').evaluateAll((els) => els.map((e) => e.textContent.trim()));
async function ouvrirPastilles(page, info) { // téléphone : les pastilles sont dans un panneau repliable
  if (info.project.name === 'telephone') { const b = page.locator('[data-action="replier-filtres"]'); if (await b.isVisible() && (await b.getAttribute('aria-expanded')) === 'false') await b.click(); }
}
const pointDeBarre = (page, id, categorie) => page.evaluate(async ({ i, c }) => {
  const e = await import('/assets/vendor/echarts/echarts.esm.min.js');
  const el = document.querySelector(`[data-tuile="${i}"] .pilotage-graphique`);
  const inst = e.getInstanceByDom(el);
  const [x, y] = inst.convertToPixel({ seriesIndex: 0 }, [c, 50]);
  const r = el.getBoundingClientRect();
  return { x: r.left + x, y: r.top + y };
}, { i: id, c: categorie });

test('B2.1 la barre de filtres sous les onglets : bouton « Filtres », fenêtre (période, liste à cocher avec recherche, intervalle, oui / non), « Appliquer » relit l\'onglet', async ({ page }, info) => {
  const appels = await simulerServeur(page, (c) => serveur(c));
  await ouvrir(page);
  await expect(page.locator('.pilotage-filtres')).toBeVisible();
  await expect(page.locator('button[data-action="filtres"]')).toBeVisible();
  expect(appels).toEqual([{}]); // sans choix : la requête d'avant les filtres
  const f = await ouvrirFenetre(page);
  await expect(f.locator('select[data-role="raccourci"]')).toHaveValue('12_mois'); // la valeur APPLIQUÉE (défaut du serveur) est celle qu'on voit
  await expect(f.locator('input[data-filtre="lieu"][type="checkbox"]')).toHaveCount(3);
  await expect(f.locator('input[data-role="min"]')).toBeVisible();
  await expect(f.locator('select[data-role="oui-non"]')).toHaveValue('');
  await capturer(page, info, 'B2.1-fenetre');
  await f.locator('input[data-filtre="lieu"][data-i="0"]').check(); // Nord
  await f.locator('input[data-filtre="lieu"][data-i="1"]').check(); // Sud
  await f.locator('select[data-role="oui-non"]').selectOption('non');
  await f.locator('input[data-role="min"]').fill('100');
  await appliquer(page);
  await expect(page.locator('.dialogue-filtres')).toHaveCount(0);
  await expect.poll(() => appels.length).toBe(2); // un seul appel à l'application
  expect(appels[1]).toEqual({ filtres: { lieu: ['Nord', 'Sud'], alerte: false, montant: { min: 100 } } }); // la période n'a pas été touchée : elle n'est pas envoyée
  await expect(page.locator('[data-tuile="liste"] tbody tr')).toHaveCount(1);
  await expect(page.locator('button[data-action="filtres"] .compteur-filtres')).toHaveText('4'); // période (défaut) + lieu + alerte + montant
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, 'B2.1-barre');
});

test('B2.1 la recherche de la liste à cocher, la liste tronquée signalée, une plage de dates incohérente refusée dans la fenêtre', async ({ page }) => {
  const appels = await simulerServeur(page, (c) => serveur(c, { tronquee: true }));
  await ouvrir(page);
  const f = await ouvrirFenetre(page);
  await expect(f.locator('[data-role="liste-tronquee"]')).toBeVisible();
  await f.locator('select[data-role="raccourci"]').selectOption('plage');
  await f.locator('input[data-role="du"]').fill('2026-05-10');
  await f.locator('input[data-role="au"]').fill('2026-05-01');
  await appliquer(page);
  await expect(f.locator('[data-role="erreur-filtres"]')).toContainText('avant la seconde'); // la fenêtre reste ouverte
  expect(appels).toEqual([{}]);
  await f.locator('input[data-role="au"]').fill('2026-05-31');
  await appliquer(page);
  await expect.poll(() => appels.length).toBe(2);
  expect(appels[1]).toEqual({ filtres: { periode: { du: '2026-05-10', au: '2026-05-31' } } });
});

test('B2.2 sans filtre : requête sans clé `filtres` ; « Tout » s\'envoie explicitement ; la valeur appliquée est affichée', async ({ page }, info) => {
  const appels = await simulerServeur(page, (c) => serveur(c));
  await ouvrir(page);
  expect(appels).toEqual([{}]);
  await ouvrirPastilles(page, info);
  expect(await textesPastilles(page)).toEqual(['Période : Les 12 derniers mois']); // le défaut du serveur, résolu et affiché
  const f = await ouvrirFenetre(page);
  await f.locator('select[data-role="raccourci"]').selectOption('tout');
  await appliquer(page);
  await expect.poll(() => appels.length).toBe(2);
  expect(appels[1]).toEqual({ filtres: { periode: { raccourci: 'tout' } } });
  await expect(page.locator('.pilotage-filtre-pastille')).toHaveCount(0);
  await expect(page.locator('button[data-action="filtres"] .compteur-filtres')).toHaveCount(0);
  await capturer(page, info, 'B2.2-tout');
});

test('B2.3 mémoire par onglet, en mémoire du module : le choix revient en revenant sur l\'onglet, un autre onglet ne le reçoit pas, rien dans le navigateur', async ({ page }, info) => {
  const appels = await simulerServeur(page, (c) => serveur(c));
  await ouvrir(page);
  const f = await ouvrirFenetre(page);
  await f.locator('input[data-filtre="lieu"][data-i="2"]').check(); // Est
  await appliquer(page);
  await expect.poll(() => appels.length).toBe(2);
  await page.locator('nav.pilotage-onglets a[data-onglet="autre"]').click();
  await expect(page.locator('[data-tuile="autre_nombre"]')).toBeVisible();
  expect(appels.at(-1)).toEqual({ onglet: 'autre' }); // l'autre onglet ne reçoit pas le filtre « lieu » (le vrai serveur le refuserait)
  await page.locator('nav.pilotage-onglets a[data-onglet="suivi"]').click();
  await expect(page.locator('[data-tuile="ventes"]')).toBeVisible();
  expect(appels.at(-1)).toEqual({ onglet: 'suivi', filtres: { lieu: ['Est'] } });
  await ouvrirPastilles(page, info);
  expect(await textesPastilles(page)).toContain('Lieu : Est');
  const stockage = await page.evaluate(() => Object.keys(sessionStorage).concat(Object.keys(localStorage)).filter((k) => /pilotage|filtre/i.test(k)));
  expect(stockage).toEqual([]);
  expect(page.url()).not.toMatch(/filtre|Est/);
  await capturer(page, info, 'B2.3-memoire');
});

test('B2.4 pastilles : une par valeur d\'une liste, croix = retire cette valeur, « Effacer tout » retire tout et relit une fois', async ({ page }, info) => {
  const appels = await simulerServeur(page, (c) => serveur(c));
  await ouvrir(page);
  const f = await ouvrirFenetre(page);
  await f.locator('input[data-filtre="lieu"][data-i="0"]').check();
  await f.locator('input[data-filtre="lieu"][data-i="1"]').check();
  await f.locator('select[data-role="oui-non"]').selectOption('oui');
  await appliquer(page);
  await expect.poll(() => appels.length).toBe(2);
  await expect(page.locator('.pilotage-filtre-pastille')).toHaveCount(4);
  await ouvrirPastilles(page, info);
  expect(await textesPastilles(page)).toEqual(['Période : Les 12 derniers mois', 'Lieu : Nord', 'Lieu : Sud', 'Avec alerte : oui']);
  await capturer(page, info, 'B2.4-pastilles');
  await page.locator('.pilotage-filtre-pastille[data-cle="lieu:Nord"] button').click();
  await expect.poll(() => appels.length).toBe(3);
  expect(appels[2]).toEqual({ filtres: { lieu: ['Sud'], alerte: true } });
  await ouvrirPastilles(page, info);
  await page.locator('[data-action="effacer-filtres"]').click();
  await expect.poll(() => appels.length).toBe(4);
  expect(appels[3]).toEqual({ filtres: { periode: { raccourci: 'tout' } } }); // la période a un défaut : « tout » est explicite ; les autres filtres ne sont plus envoyés
  await expect(page.locator('.pilotage-filtre-pastille')).toHaveCount(0);
});

test('B2.5 croisement : un clic sur une barre règle le filtre « lieu » (valeur de la série), un second clic le retire ; le curseur est une main ; la fenêtre reste un autre moyen', async ({ page }, info) => {
  const appels = await simulerServeur(page, (c) => serveur(c));
  await ouvrir(page);
  await expect.poll(() => page.locator('[data-tuile="ventes"] canvas').count()).toBeGreaterThan(0);
  await expect(page.locator('[data-tuile="ventes"] .pilotage-graphique')).toHaveAttribute('data-croisement', 'lieu');
  await page.waitForTimeout(900);
  const p = await pointDeBarre(page, 'ventes', 'Sud');
  await page.mouse.move(p.x, p.y + 20);
  expect(await page.evaluate(() => getComputedStyle(document.querySelector('[data-tuile="ventes"] .pilotage-graphique')).cursor)).toBe('pointer');
  await page.mouse.click(p.x, p.y + 20);
  await expect.poll(() => appels.length).toBe(2);
  expect(appels[1]).toEqual({ filtres: { lieu: ['Sud'] } });
  await expect(page.locator('[data-tuile="liste"] tbody tr')).toHaveCount(1);
  await ouvrirPastilles(page, info);
  expect(await textesPastilles(page)).toContain('Lieu : Sud');
  await capturer(page, info, 'B2.5-croisement');
  await page.waitForTimeout(900);
  const q = await pointDeBarre(page, 'ventes', 'Sud');
  await page.mouse.click(q.x, q.y + 20);
  await expect.poll(() => appels.length).toBe(3);
  expect(appels[2]).toEqual({}); // second clic : la valeur est retirée, plus aucun filtre à envoyer (la période reste à son défaut)
});

test('B2.6 filtre refusé par le serveur : mémoire de l\'onglet vidée, UNE relecture, message discret ; un onglet inconnu n\'est pas pris pour un filtre', { annotation: { type: 'erreurs-reseau-attendues', description: 'le faux serveur répond « Filtre invalide. » (400) une fois, puis « Onglet inconnu. »' } }, async ({ page }) => {
  let refuse = true;
  const appels = await simulerServeur(page, (c) => {
    if (c.onglet === 'disparu') return refuseOnglet();
    if (c.filtres?.lieu && refuse) { refuse = false; return refuseFiltre(); }
    return serveur(c);
  });
  await ouvrir(page);
  const f = await ouvrirFenetre(page);
  await f.locator('input[data-filtre="lieu"][data-i="0"]').check();
  await appliquer(page);
  await expect(page.locator('[data-role="note-filtres"]')).toHaveText('Filtres réinitialisés.');
  expect(appels).toEqual([{}, { filtres: { lieu: ['Nord'] } }, {}]); // refusé, puis relu une seule fois SANS filtre
  await expect(page.locator('[data-tuile="ventes"]')).toBeVisible();
  await expect(page.locator('[data-etat="erreur"]')).toHaveCount(0);
  // un onglet périmé dans l'adresse : l'écran rouvre le premier (comportement de la partie A), sans message de filtres
  await page.evaluate(() => { location.hash = '#/pilotage/pilotage/disparu'; });
  await expect.poll(() => appels.some((c) => c.onglet === 'disparu')).toBe(true);
  await expect(page.locator('[data-tuile="ventes"]')).toBeVisible();
  await expect(page.locator('[data-role="note-filtres"]')).toBeHidden();
});

test('B2.7 mention « non filtré par… » discrète dans la carte, repère « Filtrée » sur les tuiles qu\'un filtre actif touche', async ({ page }, info) => {
  await simulerServeur(page, (c) => serveur(c));
  await ouvrir(page);
  await expect(page.locator('[data-tuile="budget"] [data-role="mention-non-filtre"]')).toHaveText('Non filtré par la période.');
  await expect(page.locator('[data-tuile="ventes"]')).toHaveAttribute('data-filtree', '1'); // la période (défaut) est active
  await expect(page.locator('[data-tuile="budget"]')).not.toHaveAttribute('data-filtree', '1');
  await expect(page.locator('[data-tuile="ventes"] [data-role="repere-filtre"]')).toHaveCount(1);
  await capturer(page, info, 'B2.7-mention');
});

test('B2.8 export CSV du tableau : point-virgule, BOM UTF-8, guillemets, formule neutralisée, lignes déjà filtrées', async ({ page }, info) => {
  await simulerServeur(page, (c) => serveur(c));
  await ouvrir(page);
  const bouton = page.locator('[data-tuile="liste"] [data-action="exporter-csv"]');
  await expect(bouton).toHaveText('Exporter en CSV');
  const [telechargement] = await Promise.all([page.waitForEvent('download'), bouton.click()]);
  expect(telechargement.suggestedFilename()).toMatch(/^tableau-liste-\d{4}-\d{2}-\d{2}\.csv$/);
  const contenu = await readFile(await telechargement.path(), 'utf8');
  expect(contenu.charCodeAt(0)).toBe(0xFEFF);
  expect(contenu.slice(1)).toBe(['Chantier;Lieu;Montant;Alerte', 'Chantier A;Nord;1500,5;non', '"\'=SOMME(1;2)";Sud;-20;oui', '"Chantier ""C""; suite";Est;300;non', ''].join('\r\n'));
  // filtré : seules les lignes lues (une fois le filtre posé) sont exportées
  const f = await ouvrirFenetre(page);
  await f.locator('select[data-role="oui-non"]').selectOption('oui');
  await appliquer(page);
  await expect(page.locator('[data-tuile="liste"] tbody tr')).toHaveCount(1);
  const [t2] = await Promise.all([page.waitForEvent('download'), page.locator('[data-tuile="liste"] [data-action="exporter-csv"]').click()]);
  expect((await readFile(await t2.path(), 'utf8')).split('\r\n').length).toBe(3); // en-tête + une ligne + fin de ligne
  await capturer(page, info, 'B2.8-csv');
});

test('B2.9 le format euros4 affiche les petits coûts : 0,0009 €', async ({ page }, info) => {
  await simulerServeur(page, (c) => serveur(c));
  await ouvrir(page);
  await expect(page.locator('[data-tuile="cout"] [data-role="chiffre-valeur"]')).toHaveText(`0,0009${NBSP}€`);
  await capturer(page, info, 'B2.9-euros4');
});

test('B2.10 états : aucun filtre déclaré = écran identique à avant (pas de barre) ; chargement, erreur et vide ; le panneau des pastilles se replie sur téléphone', async ({ page }, info) => {
  // aucun filtre déclaré
  await simulerServeur(page, (c) => serveur(c, { sansFiltres: true }));
  await ouvrir(page);
  await expect(page.locator('.pilotage-filtres')).toBeHidden();
  await expect(page.locator('[data-tuile="ventes"]')).toBeVisible();
  // un serveur lent : l'état de chargement est visible, la barre reste utilisable
  await page.unrouteAll({ behavior: 'ignoreErrors' });
  await simulerServeur(page, async (c, n) => { if (n > 1) await new Promise((r) => setTimeout(r, 700)); return serveur(c); });
  await page.reload();
  await expect(page.locator('[data-tuile="ventes"]')).toBeVisible({ timeout: 15_000 });
  const f = await ouvrirFenetre(page);
  await f.locator('input[data-filtre="lieu"][data-i="0"]').check();
  await appliquer(page);
  await expect(page.locator('.chargement-bloc')).toBeVisible();
  await expect(page.locator('[data-tuile="ventes"]')).toBeVisible();
  // panneau repliable (téléphone)
  if (info.project.name === 'telephone') {
    const bascule = page.locator('[data-action="replier-filtres"]');
    await expect(bascule).toBeVisible();
    await expect(page.locator('[data-role="filtres-actifs"]')).toBeHidden();
    await bascule.click();
    await expect(page.locator('[data-role="filtres-actifs"]')).toBeVisible();
    expect(await sansDefilementHorizontal(page)).toBe(true);
  } else await expect(page.locator('[data-action="replier-filtres"]')).toBeHidden();
  await capturer(page, info, 'B2.10-etats');
});

test('B2.10 erreur du serveur : la barre disparaît avec l\'écran d\'erreur et « Réessayer » relit', { annotation: { type: 'erreurs-reseau-attendues', description: 'le faux serveur répond 500 au deuxième appel' } }, async ({ page }, info) => {
  const appels = await simulerServeur(page, (c, n) => (n === 2 ? { status: 500, headers: ENTETES, contentType: 'application/json', body: JSON.stringify({ error: { status: 'INTERNAL', message: 'panne' } }) } : serveur(c)));
  await ouvrir(page);
  const f = await ouvrirFenetre(page);
  await f.locator('input[data-filtre="lieu"][data-i="1"]').check();
  await appliquer(page);
  await expect(page.locator('[data-etat="erreur"]')).toBeVisible();
  await expect(page.locator('.pilotage-filtres')).toBeHidden();
  await capturer(page, info, 'B2.10-erreur');
  await page.locator('[data-action="reessayer"]').first().click();
  await expect(page.locator('[data-tuile="ventes"]')).toBeVisible();
  expect(appels.at(-1)).toEqual({ filtres: { lieu: ['Sud'] } }); // le choix de l'utilisateur est gardé après une panne
});
