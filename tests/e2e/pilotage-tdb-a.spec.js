// Tableau de bord, partie A (23/11/2026) : onglets et sections, grands chiffres, tableaux, textes, phrases, formats français, plein écran, graphiques ECharts mieux habillés.
// Aucun émulateur de fonctions : la réponse de `pilotageLire` est simulée (protocole « callable », préparation CORS comprise). Données fictives, 100 € de base.
// Un test par critère (le nom commence par son numéro : A1 à A5). Captures dans tests/e2e/captures/pilotage/ (jamais commitées), une par état, nommée avec le projet.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/pilotage/', import.meta.url));
const capturer = async (page, info, nom) => { await page.waitForTimeout(900); /* fin de l'animation des graphiques */ return page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: true, animations: 'disabled' }); };
const ENTETES = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
const ok = (donnees) => ({ status: 200, headers: ENTETES, contentType: 'application/json', body: JSON.stringify({ result: donnees }) });
const erreurServeur = (status, code, message) => ({ status, headers: ENTETES, contentType: 'application/json', body: JSON.stringify({ error: { status: code, message } }) });
const NBSP = ' ';
const NNBSP = ' ';

/** `repondre(corps, numero)` rend la réponse (ou une promesse) ; renvoie la liste des corps reçus. */
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
const sansDefilementHorizontal = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
const pixelsDessines = (page, id) => page.evaluate((i) => {
  const c = document.querySelector(`[data-tuile="${i}"] canvas`);
  if (!c) return 0;
  const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
  let n = 0;
  for (let k = 3; k < d.length; k += 4) if (d[k] > 0) n += 1;
  return n;
}, id);
const optionDuGraphique = (page, id) => page.evaluate(async (i) => {
  const e = await import('/assets/vendor/echarts/echarts.esm.min.js');
  const o = e.getInstanceByDom(document.querySelector(`[data-tuile="${i}"] .pilotage-graphique`)).getOption();
  return { yFormat: o.yAxis?.[0]?.axisLabel?.formatter?.(60000), xFormat: o.xAxis?.[0]?.axisLabel?.formatter?.('2026-10-01'), infobulle: o.tooltip?.[0]?.valueFormatter?.(100), etiquette: o.series?.[0]?.label?.formatter?.({ value: 1500 }), legende: o.legend?.[0]?.type ?? null };
}, id);
async function ouvrir(page, route = 'pilotage/pilotage') {
  await connecter(page, undefined, { route });
  await attendreCalme(page);
}

// ---------- Réponses fictives ----------
const CHIFFRE_ATTENTE = { id: 'c_attente', type: 'chiffre', titre: 'À décider', largeur: 'tiers', aide: 'Somme des factures qui attendent une décision.', valeur: { colonne: 'total', format: 'euros0' }, seuils: [{ jusqua: 0, couleur: 'bon', libelle: 'Rien n\'attend' }, { couleur: 'attention', libelle: 'Des factures attendent' }], lien: { onglet: 'detail' }, lignes: [{ total: 0 }] };
const CHIFFRE_ACHATS = { id: 'c_achats', type: 'chiffre', titre: 'Achats acceptés, ce mois', largeur: 'tiers', valeur: { colonne: 'montant', format: 'euros_abrege' }, variation: { colonne: 'montant', periodeColonne: 'mois', periodeFormat: 'mois_annee', hausse: 'mauvais' }, lignes: [{ mois: '2026-09-01', montant: 90000 }, { mois: '2026-11-01', montant: 120000 }, { mois: '2026-10-01', montant: 100000 }] };
const CHIFFRE_DELAI = { id: 'c_delai', type: 'chiffre', titre: 'Attente la plus longue', largeur: 'tiers', valeur: { colonne: 'jours', format: 'jours' }, seuils: [{ jusqua: 6, couleur: 'bon' }, { jusqua: 29, couleur: 'attention', libelle: 'À surveiller' }, { couleur: 'mauvais' }], lignes: [{ jours: 12 }] };
const CHIFFRE_ENTIER = { id: 'c_nombre', type: 'chiffre', titre: 'Factures à valider', largeur: 'tiers', valeur: { colonne: 'n', format: 'entier' }, lignes: [{ n: 1234567 }] };
const TEXTE = { id: 'x_point', type: 'texte', titre: 'Pour aller plus loin', texte: '**Le point du jour**\nVoir [le détail](#detail) et *les graphiques*.', lignes: [] };
const PHRASES = { id: 'p_point', type: 'phrases', titre: 'Le point du jour', colonnes: ['a', 'b'], lignes: [{ a: '3 factures à décider : 300 € HT.', b: 'La plus ancienne attend depuis 12 jours.' }, { a: '<img src=x onerror=alert(1)> reste du texte', b: null }] };
const LIGNES_TABLEAU = Array.from({ length: 25 }, (_, i) => ({ nom: `Chantier ${String(i + 1).padStart(2, '0')}`, taux: i === 0 ? 120 : (i === 1 ? 95 : 10 + i * 3), montant: 1000 * (i + 1), date: '2026-11-23', etat: i === 2 ? 'budget non renseigné' : 'ok' }));
const TABLEAU = { id: 't_chantiers', type: 'tableau', titre: 'Chantiers en cours', largeur: 'pleine', parPage: 10, aide: 'Triés par budget consommé.', colonnes: [
  { colonne: 'nom', titre: 'Chantier', lien: { onglet: 'resume' } },
  { colonne: 'taux', titre: 'Budget consommé', format: 'pourcent0', regles: [{ si: '>=', valeur: 100, couleur: 'mauvais' }, { si: '>=', valeur: 90, couleur: 'attention' }, { si: '<', valeur: 90, couleur: 'bon' }] },
  { colonne: 'montant', titre: 'Budget', format: 'euros0' },
  { colonne: 'date', titre: 'Mis à jour', format: 'date' },
  { colonne: 'etat', titre: 'État', regles: [{ si: '=', valeur: 'budget non renseigné', couleur: 'neutre' }] },
], lignes: LIGNES_TABLEAU };

// Exemples de graphiques (les mêmes sont dans docs/pilotage.md). Lignes de données fictives ci-dessous.
const EXEMPLES = {
  pareto: { option: { dataset: { dimensions: ['fournisseur', 'achats', 'cumul'] }, tooltip: { trigger: 'axis' }, legend: {}, xAxis: [{ type: 'value' }, { type: 'value', min: 0, max: 100, position: 'top', axisLabel: { formatter: '{value} %' } }], yAxis: { type: 'category', inverse: true }, series: [{ type: 'bar', name: 'Achats', encode: { x: 'achats', y: 'fournisseur' } }, { type: 'line', name: 'Cumul (%)', xAxisIndex: 1, encode: { x: 'cumul', y: 'fournisseur' }, markLine: { silent: true, symbol: 'none', data: [{ xAxis: 80 }], lineStyle: { type: 'dashed', color: '@attention' }, label: { formatter: '80 %', position: 'insideEndTop' } } }] },
    lignes: [{ fournisseur: 'Fournisseur A (nom très très long pour tester)', achats: 500, cumul: 50 }, { fournisseur: 'Fournisseur B', achats: 300, cumul: 80 }, { fournisseur: 'Fournisseur C', achats: 120, cumul: 92 }, { fournisseur: 'Autres (4)', achats: 80, cumul: 100 }] },
  puce: { option: { dataset: { dimensions: ['chantier', 'consomme'] }, tooltip: { trigger: 'axis' }, xAxis: { type: 'value', max: 120, axisLabel: { formatter: '{value} %' } }, yAxis: { type: 'category', inverse: true }, series: [{ type: 'bar', name: 'Budget consommé', barWidth: 14, encode: { x: 'consomme', y: 'chantier' }, itemStyle: { color: '@neutre' }, markLine: { silent: true, symbol: 'none', data: [{ xAxis: 100 }], lineStyle: { color: '@mauvais', width: 2, type: 'solid' }, label: { formatter: 'Objectif', position: 'start' } } }] },
    lignes: [{ chantier: 'Chantier A', consomme: 70 }, { chantier: 'Chantier B', consomme: 95 }, { chantier: 'Chantier C', consomme: 110 }] },
  empile: { option: { dataset: { dimensions: ['chantier', 'accepte', 'attente'] }, tooltip: { trigger: 'axis' }, legend: {}, xAxis: { type: 'category' }, yAxis: { type: 'value' }, series: [{ type: 'bar', name: 'Accepté', stack: 'total', encode: { x: 'chantier', y: 'accepte' }, itemStyle: { color: '@bon' } }, { type: 'bar', name: 'En attente', stack: 'total', encode: { x: 'chantier', y: 'attente' }, itemStyle: { color: '@attention' } }] },
    lignes: [{ chantier: 'Chantier A', accepte: 100, attente: 30 }, { chantier: 'Chantier B', accepte: 60, attente: 50 }, { chantier: 'Chantier C', accepte: 80, attente: 0 }] },
  courbe: { option: { dataset: { dimensions: ['mois', 'taux'] }, tooltip: { trigger: 'axis' }, xAxis: { type: 'category' }, yAxis: { type: 'value', min: 0 }, series: [{ type: 'line', name: 'Taux de refus', areaStyle: { opacity: 0.15 }, encode: { x: 'mois', y: 'taux' }, itemStyle: { color: '@mauvais' } }] },
    lignes: [{ mois: '2026-08-01', taux: 5 }, { mois: '2026-09-01', taux: 8 }, { mois: '2026-10-01', taux: 4 }, { mois: '2026-11-01', taux: 10 }], formats: { axeX: 'mois_annee', axeY: 'pourcent0', infobulle: 'pourcent1' } },
  anneau: { option: { color: ['@bon', '@mauvais', '@attention'], dataset: { dimensions: ['statut', 'nombre'] }, tooltip: { trigger: 'item' }, legend: {}, series: [{ type: 'pie', radius: ['45%', '70%'], encode: { itemName: 'statut', value: 'nombre' } }] },
    lignes: [{ statut: 'Acceptées', nombre: 80 }, { statut: 'Refusées', nombre: 15 }, { statut: 'À valider', nombre: 5 }] },
};
const graphique = (id, titre, ex, extra = {}) => ({ id, type: 'graphique', titre, largeur: 'moitie', option: ex.option, lignes: ex.lignes, ...(ex.formats ? { formats: ex.formats } : {}), ...extra });

const ONGLETS = [
  { id: 'resume', titre: 'Résumé', intro: 'Ce qui attend une décision, puis les chantiers.', tuiles: ['c_attente', 'c_achats', 'c_delai', 'c_nombre', 'x_point', 'p_point'] },
  { id: 'detail', titre: 'Détail', tuiles: ['t_chantiers'], sections: [{ id: 'graphiques', titre: 'Les graphiques', intro: 'Cinq exemples de réglage.', tuiles: ['g_pareto', 'g_puce', 'g_empile'] }, { id: 'tendances', titre: 'Tendances', tuiles: ['g_courbe', 'g_anneau'] }] },
];
const TUILES_RESUME = [CHIFFRE_ATTENTE, CHIFFRE_ACHATS, CHIFFRE_DELAI, CHIFFRE_ENTIER, TEXTE, PHRASES];
const TUILES_DETAIL = [TABLEAU, graphique('g_pareto', 'Pareto des achats', EXEMPLES.pareto), graphique('g_puce', 'Budget consommé', EXEMPLES.puce), graphique('g_empile', 'Accepté et en attente', EXEMPLES.empile), graphique('g_courbe', 'Taux de refus', EXEMPLES.courbe), graphique('g_anneau', 'Répartition', EXEMPLES.anneau)];
const reponseOnglets = (corps) => {
  const actif = corps.onglet ?? 'resume';
  return { titre: 'Mes chiffres', onglet: actif, onglets: ONGLETS, tuiles: actif === 'detail' ? TUILES_DETAIL : TUILES_RESUME, erreurs: [] };
};

test('A1 onglets : barre de vrais liens, onglet de l\'adresse lu par le serveur seul, clic = nouvelle lecture de cet onglet, intro affichée', async ({ page }, info) => {
  const appels = await simulerServeur(page, (c) => ok(reponseOnglets(c)));
  await ouvrir(page);
  const barre = page.locator('nav.pilotage-onglets');
  await expect(barre.locator('a.onglet')).toHaveText(['Résumé', 'Détail']);
  await expect(barre.locator('a.onglet[aria-current="page"]')).toHaveText('Résumé');
  await expect(barre.locator('a[data-onglet="detail"]')).toHaveAttribute('href', /#\/pilotage\/pilotage\/detail$/);
  await expect(page.locator('[data-role="intro-onglet"]')).toHaveText('Ce qui attend une décision, puis les chantiers.');
  expect(appels).toEqual([{}]); // sans onglet dans l'adresse : le serveur lit le premier
  await capturer(page, info, 'A1-onglets-resume');
  await barre.locator('a[data-onglet="detail"]').click();
  await expect(page.locator('[data-tuile="t_chantiers"]')).toBeVisible();
  await expect(barre.locator('a.onglet[aria-current="page"]')).toHaveText('Détail');
  await expect(page).toHaveURL(/#\/pilotage\/pilotage\/detail$/);
  expect(appels.at(-1)).toEqual({ onglet: 'detail' });
  await expect(page.locator('[data-tuile="c_attente"]')).toHaveCount(0); // l'autre onglet n'est plus à l'écran
  // le rechargement garde l'onglet (il est dans l'adresse)
  await page.reload();
  await expect(page.locator('[data-tuile="t_chantiers"]')).toBeVisible();
  await capturer(page, info, 'A1-onglets-detail');
});

test('A1 sections : titre et intro visibles, pastilles de navigation rapide qui font défiler (jamais d\'onglets dans les onglets)', async ({ page }, info) => {
  await simulerServeur(page, (c) => ok(reponseOnglets(c)));
  await ouvrir(page, 'pilotage/pilotage/detail');
  await expect(page.locator('.pilotage-section-titre')).toHaveText(['Les graphiques', 'Tendances']);
  await expect(page.locator('.pilotage-section .pilotage-intro').first()).toHaveText('Cinq exemples de réglage.');
  const pastilles = page.locator('nav.pilotage-pastilles button');
  await expect(pastilles).toHaveText(['Les graphiques', 'Tendances']);
  await expect(page.locator('[role="tablist"]')).toHaveCount(0);
  const avant = await page.url();
  const haut = () => page.locator('[data-section-bloc="tendances"]').evaluate((e) => e.getBoundingClientRect().top);
  const avantClic = await haut();
  await pastilles.nth(1).click();
  await expect.poll(haut).toBeLessThan(avantClic - 100); // la page a défilé jusqu'à la section (ou aussi loin que le contenu le permet)
  expect(await page.url()).toBe(avant); // aucun changement d'adresse
  await capturer(page, info, 'A1-sections');
});

test('A1 un onglet inconnu dans l\'adresse (retiré du réglage) : l\'écran rouvre le premier onglet, sans erreur', { annotation: { type: 'erreurs-reseau-attendues', description: 'le faux serveur répond « onglet inconnu » (400) au premier appel' } }, async ({ page }) => {
  const appels = await simulerServeur(page, (c) => (c.onglet === 'disparu' ? erreurServeur(400, 'INVALID_ARGUMENT', 'Onglet inconnu.') : ok(reponseOnglets(c))));
  await ouvrir(page, 'pilotage/pilotage/disparu');
  await expect(page.locator('nav.pilotage-onglets a.onglet[aria-current="page"]')).toHaveText('Résumé');
  expect(appels).toEqual([{ onglet: 'disparu' }, {}]);
  await expect(page.locator('[data-etat="erreur"]')).toHaveCount(0);
});

test('A1 un onglet sans tuile reçue et un ancien serveur (ni type ni onglets) : page unique comme avant', async ({ page }) => {
  await simulerServeur(page, () => ok({ titre: 'Ancien', tuiles: [{ id: 'v_a', titre: 'Ventes', option: EXEMPLES.courbe.option, lignes: EXEMPLES.courbe.lignes }], erreurs: [] }));
  await ouvrir(page);
  await expect(page.locator('nav.pilotage-onglets a')).toHaveCount(0);
  await expect(page.locator('[data-tuile="v_a"]')).toHaveAttribute('data-type', 'graphique');
  await expect.poll(() => pixelsDessines(page, 'v_a'), { timeout: 10_000 }).toBeGreaterThan(500);
});

test('A2 grands chiffres : valeur formatée, couleur de seuil et libellé, variation entre les deux dernières périodes (couleur inversée), lien vers un onglet, « i » accessible', async ({ page }, info) => {
  await simulerServeur(page, (c) => ok(reponseOnglets(c)));
  await ouvrir(page);
  const valeur = (id) => page.locator(`[data-tuile="${id}"] [data-role="chiffre-valeur"]`);
  await expect(valeur('c_attente')).toHaveText(`0${NBSP}€`);
  await expect(valeur('c_attente')).toHaveAttribute('data-couleur', 'bon');
  await expect(page.locator('[data-tuile="c_attente"] [data-role="chiffre-libelle"]')).toHaveText('Rien n\'attend');
  await expect(valeur('c_achats')).toHaveText(`120${NBSP}k€`);
  const variation = page.locator('[data-tuile="c_achats"] [data-role="chiffre-variation"]');
  await expect(variation).toContainText(`+20,0${NBSP}%`);
  await expect(variation).toContainText('par rapport à octobre 2026');
  await expect(variation).toContainText(`(100${NBSP}k€)`);
  await expect(variation).toHaveAttribute('data-sens', 'hausse');
  await expect(variation).toHaveAttribute('data-couleur', 'mauvais'); // une hausse de dépense est rouge
  await expect(valeur('c_delai')).toHaveText(`12${NBSP}jours`);
  await expect(valeur('c_delai')).toHaveAttribute('data-couleur', 'attention');
  await expect(valeur('c_nombre')).toHaveText(`1${NNBSP}234${NNBSP}567`);
  await expect(page.locator('[data-tuile="c_attente"] [data-role="chiffre-lien"]')).toHaveAttribute('href', /#\/pilotage\/pilotage\/detail$/);
  const info1 = page.locator('[data-tuile="c_attente"] button[data-role="info"]');
  await expect(info1).toHaveAttribute('aria-label', /Somme des factures qui attendent une décision/);
  await info1.focus();
  await expect(page.locator('[data-tuile="c_attente"] [role="tooltip"]')).toBeVisible();
  await capturer(page, info, 'A2-chiffres');
});

test('A2 cas vide et cas d\'erreur d\'un grand chiffre : « Pas encore de données. » ; valeur absente « — » ; tuile en erreur : message générique', async ({ page }) => {
  await simulerServeur(page, () => ok({ titre: 'T', tuiles: [{ ...CHIFFRE_ATTENTE, lignes: [] }, { ...CHIFFRE_DELAI, lignes: [{ jours: null }] }, { ...CHIFFRE_ACHATS, lignes: [] }], erreurs: [{ id: 'c_achats', message: 'detail technique' }] }));
  await ouvrir(page);
  await expect(page.locator('[data-tuile="c_attente"]')).toContainText('Pas encore de données.');
  await expect(page.locator('[data-tuile="c_delai"] [data-role="chiffre-valeur"]')).toHaveText('—');
  await expect(page.locator('[data-tuile="c_achats"]')).toContainText('Cette tuile n\'a pas pu être lue.');
  await expect(page.locator('body')).not.toContainText('detail technique');
});

test('A2 tableau : formats, couleurs par règles (la première vraie gagne), tri au clic, pagination, compteur « N lignes », lien vers un onglet', async ({ page }, info) => {
  await simulerServeur(page, (c) => ok(reponseOnglets(c)));
  await ouvrir(page, 'pilotage/pilotage/detail');
  const t = page.locator('[data-tuile="t_chantiers"]');
  await expect(t.locator('tbody tr')).toHaveCount(10);
  await expect(t.locator('[data-role="compteur"]')).toHaveText('25 lignes');
  await expect(t.locator('[data-role="page"]')).toHaveText('Page 1 sur 3');
  const premiereLigne = t.locator('tbody tr').first();
  await expect(premiereLigne.locator('td').nth(1)).toHaveText(`120${NBSP}%`);
  await expect(premiereLigne.locator('td').nth(1)).toHaveAttribute('data-couleur', 'mauvais'); // >= 100 gagne sur >= 90
  await expect(t.locator('tbody tr').nth(1).locator('td').nth(1)).toHaveAttribute('data-couleur', 'attention');
  await expect(t.locator('tbody tr').nth(3).locator('td').nth(1)).toHaveAttribute('data-couleur', 'bon');
  await expect(premiereLigne.locator('td').nth(2)).toHaveText(`1${NNBSP}000${NBSP}€`);
  await expect(premiereLigne.locator('td').nth(3)).toHaveText('23/11/2026');
  await expect(t.locator('tbody tr').nth(2).locator('td').nth(4)).toHaveAttribute('data-couleur', 'neutre'); // texte d'état fourni par la vue
  await expect(premiereLigne.locator('td').first().locator('a')).toHaveAttribute('href', /#\/pilotage\/pilotage\/resume$/);
  await capturer(page, info, 'A2-tableau');
  await t.locator('[data-action="page-suivante"]').click();
  await expect(t.locator('[data-role="page"]')).toHaveText('Page 2 sur 3');
  await expect(t.locator('tbody tr').first().locator('td').first()).toHaveText('Chantier 11');
  const telephone = info.project.name === 'telephone'; // les en-têtes sont cachés (fiches) : le tri passe par la liste « Trier par »
  const trier = async (sens) => (telephone ? t.locator('select[data-role="tri-mobile"]').selectOption(`montant:${sens}`) : t.locator('button.pilotage-tri[data-colonne="montant"]').click());
  await trier('asc');
  await expect(t.locator('th[aria-sort="ascending"]')).toHaveCount(1);
  await expect(t.locator('[data-role="page"]')).toHaveText('Page 1 sur 3'); // un tri revient à la première page
  await expect(t.locator('tbody tr').first().locator('td').nth(2)).toHaveText(`1${NNBSP}000${NBSP}€`);
  await trier('desc');
  await expect(t.locator('th[aria-sort="descending"]')).toHaveCount(1);
  await expect(t.locator('tbody tr').first().locator('td').nth(2)).toHaveText(`25${NNBSP}000${NBSP}€`);
  await expect(t.locator('[data-action="page-precedente"]')).toBeDisabled();
});

test('A2 cas vide d\'un tableau (aucune ligne) et d\'une seule ligne (« 1 ligne », pas de pagination)', async ({ page }) => {
  await simulerServeur(page, () => ok({ titre: 'T', tuiles: [{ ...TABLEAU, id: 't_vide', lignes: [] }, { ...TABLEAU, id: 't_un', lignes: [LIGNES_TABLEAU[0]] }], erreurs: [] }));
  await ouvrir(page);
  await expect(page.locator('[data-tuile="t_vide"]')).toContainText('Pas encore de données.');
  await expect(page.locator('[data-tuile="t_un"] [data-role="compteur"]')).toHaveText('1 ligne');
  await expect(page.locator('[data-tuile="t_un"] [data-action="page-suivante"]')).toHaveCount(0);
});

test('A2 texte et phrases : balisage minimal en TEXTE (jamais de HTML), lien vers un onglet, cas vide des phrases', async ({ page }, info) => {
  await simulerServeur(page, (c) => ok(reponseOnglets(c)));
  await ouvrir(page);
  const texte = page.locator('[data-tuile="x_point"] .pilotage-texte');
  await expect(texte.locator('strong')).toHaveText('Le point du jour');
  await expect(texte.locator('em')).toHaveText('les graphiques');
  await expect(texte.locator('br')).toHaveCount(1);
  await expect(texte.locator('a')).toHaveAttribute('href', /#\/pilotage\/pilotage\/detail$/);
  const phrases = page.locator('[data-tuile="p_point"] .pilotage-phrase');
  await expect(phrases).toHaveCount(3); // la valeur nulle n'est pas montrée
  await expect(phrases.first()).toHaveText('3 factures à décider : 300 € HT.');
  await expect(page.locator('[data-tuile="p_point"] img')).toHaveCount(0); // du HTML venu de la base reste du texte
  await expect(phrases.nth(2)).toContainText('<img src=x onerror=alert(1)>');
  await capturer(page, info, 'A2-texte-phrases');
});

test('A2 phrases sans ligne : « Pas encore de données. » ; un texte n\'est jamais « vide »', async ({ page }) => {
  await simulerServeur(page, () => ok({ titre: 'T', tuiles: [{ ...PHRASES, lignes: [] }, TEXTE], erreurs: [] }));
  await ouvrir(page);
  await expect(page.locator('[data-tuile="p_point"]')).toContainText('Pas encore de données.');
  await expect(page.locator('[data-tuile="x_point"] .pilotage-texte')).toBeVisible();
});

test('A3 formats nommés : axes, infobulle et étiquettes d\'un graphique reçoivent les formats français (mois et pourcentage)', async ({ page }, info) => {
  await simulerServeur(page, (c) => ok(reponseOnglets(c)));
  await ouvrir(page, 'pilotage/pilotage/detail');
  await expect.poll(() => pixelsDessines(page, 'g_courbe'), { timeout: 10_000 }).toBeGreaterThan(500);
  const o = await optionDuGraphique(page, 'g_courbe');
  expect(o.yFormat).toBe(`60${NNBSP}000${NBSP}%`);
  expect(o.xFormat).toBe('octobre 2026');
  expect(o.infobulle).toBe(`100,0${NBSP}%`);
  await capturer(page, info, 'A3-formats-courbe');
});

test('A4 plein écran : le bouton passe l\'écran en plein écran, « Quitter le plein écran » et Échap en sortent, désactivé pendant le chargement', async ({ page }, info) => {
  let liberer;
  const portail = new Promise((r) => { liberer = r; });
  await simulerServeur(page, async (c, n) => { if (n === 1) await portail; return ok(reponseOnglets(c)); });
  await connecter(page, undefined, { route: 'pilotage/pilotage' });
  await expect(page.locator('[data-action="plein-ecran"]')).toBeDisabled(); // pendant le chargement
  await expect(page.locator('[data-action="actualiser"]')).toBeDisabled();
  liberer();
  await expect(page.locator('[data-tuile="c_attente"]')).toBeVisible();
  const bouton = page.locator('[data-action="plein-ecran"]');
  await expect(bouton).toBeEnabled();
  await expect(bouton).toHaveText('Plein écran');
  await bouton.click();
  await expect(page.locator('.page-pilotage')).toHaveClass(/pilotage-plein/);
  await expect(bouton).toHaveText('Quitter le plein écran');
  await expect(bouton).toHaveAttribute('aria-pressed', 'true');
  await capturer(page, info, 'A4-plein-ecran');
  await bouton.click();
  await expect(page.locator('.page-pilotage')).not.toHaveClass(/pilotage-plein/);
  await expect(bouton).toHaveText('Plein écran');
  await bouton.click();
  await expect(page.locator('.page-pilotage')).toHaveClass(/pilotage-plein/);
  await page.keyboard.press('Escape');
  await expect(page.locator('.page-pilotage')).not.toHaveClass(/pilotage-plein/);
  await bouton.click();
  await expect(page.locator('.page-pilotage')).toHaveClass(/pilotage-plein/);
  // sortie par le navigateur (fullscreenchange), sans toucher au bouton ni au clavier
  await page.evaluate(() => (document.fullscreenElement ? document.exitFullscreen() : Promise.resolve()));
  const natif = await page.evaluate(() => typeof document.documentElement.requestFullscreen === 'function');
  if (natif) await expect(page.locator('.page-pilotage')).not.toHaveClass(/pilotage-plein/);
});

test('A4 plein écran : repli CSS quand l\'API est absente (Safari iPhone) : plein fenêtre, Échap quitte', async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(Element.prototype, 'requestFullscreen', { value: undefined, configurable: true }); });
  await simulerServeur(page, (c) => ok(reponseOnglets(c)));
  await ouvrir(page);
  await page.locator('[data-action="plein-ecran"]').click();
  const racine = page.locator('.page-pilotage');
  await expect(racine).toHaveClass(/pilotage-plein/);
  const boite = await racine.boundingBox();
  const fenetre = page.viewportSize();
  expect(boite.width).toBeGreaterThanOrEqual(fenetre.width - 1);
  expect(boite.height).toBeGreaterThanOrEqual(fenetre.height - 1);
  await page.keyboard.press('Escape');
  await expect(racine).not.toHaveClass(/pilotage-plein/);
});

for (const [cle, titre] of [['pareto', 'Pareto'], ['puce', 'Barres à puce'], ['empile', 'Barres empilées'], ['courbe', 'Courbe'], ['anneau', 'Anneau sans total au centre']]) {
  test(`A5 ${titre} : l'exemple du réglage est accepté par le validateur du serveur ET dessiné par ECharts (couleurs nommées résolues)`, async ({ page }, info) => {
    const { validerReglages } = await import('../../functions/src/pilotage/reglages.js');
    const ex = EXEMPLES[cle];
    expect(validerReglages({ groupes: {}, tableau: { titre: 'T', tuiles: [{ id: 'g', titre: titre, vue: 'v_exemple_g', option: JSON.stringify(ex.option), ...(ex.formats ? { formats: ex.formats } : {}) }] } })).toBeTruthy();
    await simulerServeur(page, () => ok({ titre: 'T', tuiles: [graphique('g_ex', titre, ex)], erreurs: [] }));
    await ouvrir(page);
    await expect.poll(() => pixelsDessines(page, 'g_ex'), { timeout: 10_000 }).toBeGreaterThan(800);
    await expect(page.locator('[data-tuile="g_ex"] [role="alert"]')).toHaveCount(0);
    await capturer(page, info, `A5-${cle}`);
  });
}

test('A5 habillage : légende défilante, libellé long raccourci (infobulle pour le texte entier), couleur nommée résolue depuis le thème', async ({ page }) => {
  await simulerServeur(page, (c) => ok(reponseOnglets(c)));
  await ouvrir(page, 'pilotage/pilotage/detail');
  await expect.poll(() => pixelsDessines(page, 'g_pareto'), { timeout: 10_000 }).toBeGreaterThan(500);
  const r = await page.evaluate(async () => {
    const e = await import('/assets/vendor/echarts/echarts.esm.min.js');
    const o = e.getInstanceByDom(document.querySelector('[data-tuile="g_pareto"] .pilotage-graphique')).getOption();
    const puce = e.getInstanceByDom(document.querySelector('[data-tuile="g_puce"] .pilotage-graphique')).getOption();
    return { legende: o.legend?.[0]?.type, overflow: o.yAxis?.[0]?.axisLabel?.overflow, couleurObjectif: puce.series?.[0]?.markLine?.lineStyle?.color, ligne80: o.series?.[1]?.markLine?.lineStyle?.color, racine: getComputedStyle(document.documentElement).getPropertyValue('--retard').trim() };
  });
  expect(r.legende).toBe('scroll');
  expect(r.overflow).toBe('truncate'); // sur l'axe des catégories (vertical dans le Pareto horizontal)
  expect(r.couleurObjectif).toBe(r.racine); // « @mauvais » = --retard
  expect(r.ligne80).not.toMatch(/^@/);
});

test('A5 téléphone et ordinateur : la page ne défile pas à l\'horizontale ; 2 grands chiffres par ligne au téléphone ; tableau en fiches au téléphone', async ({ page }, info) => {
  await simulerServeur(page, (c) => ok(reponseOnglets(c)));
  await ouvrir(page);
  expect(await sansDefilementHorizontal(page)).toBe(true);
  const [a, b, c] = await Promise.all(['c_attente', 'c_achats', 'c_delai'].map((i) => page.locator(`[data-tuile="${i}"]`).boundingBox()));
  if (info.project.name === 'telephone') {
    expect(Math.abs(a.y - b.y)).toBeLessThan(2); // deux chiffres sur la même ligne
    expect(c.y).toBeGreaterThan(a.y + a.height - 2); // le troisième passe à la ligne
    expect(a.width).toBeLessThan(260);
  } else {
    expect(Math.abs(a.y - c.y)).toBeLessThan(2); // trois chiffres (tiers) sur la même ligne
  }
  await capturer(page, info, 'A5-chiffres-ecran');
  await page.locator('nav.pilotage-onglets a[data-onglet="detail"]').click();
  await expect(page.locator('[data-tuile="t_chantiers"]')).toBeVisible();
  expect(await sansDefilementHorizontal(page)).toBe(true);
  const tr = page.locator('[data-tuile="t_chantiers"] tbody tr').first();
  const premiereCellule = tr.locator('td').first();
  if (info.project.name === 'telephone') {
    expect(await premiereCellule.evaluate((e) => getComputedStyle(e).display)).toBe('flex'); // une fiche par ligne
    expect(await premiereCellule.evaluate((e) => getComputedStyle(e, '::before').content)).toContain('Chantier');
    await expect(page.locator('[data-tuile="t_chantiers"] [data-role="compteur"]')).toHaveText('25 lignes');
  } else {
    expect(await premiereCellule.evaluate((e) => getComputedStyle(e).display)).toBe('table-cell');
  }
  await expect.poll(() => pixelsDessines(page, 'g_courbe'), { timeout: 10_000 }).toBeGreaterThan(500);
  expect(await sansDefilementHorizontal(page)).toBe(true);
  await capturer(page, info, 'A5-detail-ecran');
});

test('A5 thème : au changement de thème, les graphiques sont redessinés sans nouvel appel au serveur', async ({ page }) => {
  const appels = await simulerServeur(page, (c) => ok(reponseOnglets(c)));
  await ouvrir(page, 'pilotage/pilotage/detail');
  await expect.poll(() => pixelsDessines(page, 'g_courbe'), { timeout: 10_000 }).toBeGreaterThan(500);
  const avant = appels.length;
  await page.evaluate(() => { document.documentElement.dataset.theme = document.documentElement.dataset.theme === 'clair' ? 'sombre' : 'clair'; });
  await expect.poll(() => pixelsDessines(page, 'g_courbe'), { timeout: 10_000 }).toBeGreaterThan(500);
  expect(appels.length).toBe(avant);
});

test('A11 plein écran : un clic sur « Détail » reste en plein écran, la barre d\'onglets reste visible (ordinateur ET téléphone)', async ({ page }, info) => {
  await page.addInitScript(() => { Object.defineProperty(Element.prototype, 'requestFullscreen', { value: undefined, configurable: true }); }); // repli CSS : même chemin partout
  await simulerServeur(page, (c) => ok(reponseOnglets(c)));
  await ouvrir(page);
  await page.locator('[data-action="plein-ecran"]').click();
  const racine = page.locator('.page-pilotage');
  await expect(racine).toHaveClass(/pilotage-plein/);
  const barre = page.locator('nav.pilotage-onglets');
  await expect(barre).toBeVisible();
  expect((await barre.boundingBox()).height).toBeGreaterThan(20);
  await barre.locator('a[data-onglet="detail"]').click();
  await expect(page.locator('[data-tuile="t_chantiers"]')).toBeVisible();
  await expect(page.locator('.page-pilotage')).toHaveClass(/pilotage-plein/);
  await expect(page.locator('nav.pilotage-onglets')).toBeVisible();
  await expect(page.locator('nav.pilotage-onglets a.onglet[aria-current="page"]')).toHaveText('Détail');
  await capturer(page, info, 'A11-plein-ecran-onglet-detail');
});

test('A11 tableau : « N premières lignes » quand la limite est atteinte ; phrases : 50 paragraphes puis « … »', async ({ page }) => {
  const lignes = Array.from({ length: 500 }, (_, i) => ({ nom: `Ligne ${i}`, taux: 50 }));
  const tab = { ...TABLEAU, id: 't_gros', parPage: 10, limite: 500, lignes };
  const phr = { ...PHRASES, id: 'p_beaucoup', lignes: Array.from({ length: 60 }, (_, i) => ({ [PHRASES.colonnes[0]]: `Phrase ${i}` })) };
  await simulerServeur(page, () => ok({ titre: 'T', tuiles: [tab, phr], erreurs: [] }));
  await ouvrir(page);
  await expect(page.locator('[data-tuile="t_gros"]')).toContainText('500 premières lignes');
  await expect(page.locator('[data-tuile="p_beaucoup"] .pilotage-phrase')).toHaveCount(51);
  await expect(page.locator('[data-role="phrases-suite"]')).toHaveText('…');
});
