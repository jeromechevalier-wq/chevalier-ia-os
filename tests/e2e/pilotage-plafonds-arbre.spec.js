// Tableau de bord : plafond mensuel (ligne pointillée) et arbre des coûts (à qui, où, module). La réponse de `pilotageLire` est simulée (aucune donnée de production). Données fictives.
// Un test par point (le nom commence par son numéro : P1, P2). Captures dans tests/e2e/captures/pilotage/ (jamais commitées), une par état.
import { fileURLToPath } from 'node:url';
import { test, expect, connecter, attendreCalme } from './outils.js';

const DOSSIER = fileURLToPath(new URL('./captures/pilotage/', import.meta.url));
const capturer = async (page, info, nom) => { await page.waitForTimeout(900); return page.screenshot({ path: `${DOSSIER}${nom}-${info.project.name}.png`, fullPage: true, animations: 'disabled' }); };
const ENTETES = { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': 'POST, OPTIONS' };
const ok = (donnees) => ({ status: 200, headers: ENTETES, contentType: 'application/json', body: JSON.stringify({ result: donnees }) });
async function simulerServeur(page, repondre) {
  await page.route('**/pilotageLire', async (route) => {
    if (route.request().method() === 'OPTIONS') return route.fulfill({ status: 204, headers: ENTETES });
    return route.fulfill(await repondre(route.request().postDataJSON()?.data ?? {}));
  });
}
const sansDefilementHorizontal = (page) => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1);
async function ouvrir(page) { await connecter(page, undefined, { route: 'pilotage/pilotage' }); await attendreCalme(page); }

const OPTION_PLAFONDS = { dataset: { dimensions: ['cle_nom', 'part_normal', 'part_attention', 'part_atteint'] }, tooltip: { trigger: 'axis' }, legend: {}, xAxis: { type: 'category' }, yAxis: { type: 'value', max: 120, axisLabel: { formatter: '{value} %' } },
  series: [{ type: 'bar', stack: 'p', name: 'Normal', encode: { x: 'cle_nom', y: 'part_normal' }, itemStyle: { color: '@bon' } }, { type: 'bar', stack: 'p', name: 'À surveiller (dès 80 %)', encode: { x: 'cle_nom', y: 'part_attention' }, itemStyle: { color: '@attention' } }, { type: 'bar', stack: 'p', name: 'Plafond atteint', encode: { x: 'cle_nom', y: 'part_atteint' }, itemStyle: { color: '@mauvais' } }] };
const REPERES = [{ valeur: 80, libelle: '80 %', couleur: 'attention' }, { valeur: 90, libelle: '90 %', couleur: 'attention' }, { valeur: 100, libelle: 'Plafond mensuel', couleur: 'mauvais' }];
const reponsePlafonds = (lignes) => ({ titre: 'Tableau de bord', onglets: [{ id: 'plafonds', titre: 'Plafonds', tuiles: ['pl'] }], onglet: 'plafonds',
  tuiles: [{ id: 'pl', titre: 'Dépense du mois contre plafond mensuel', type: 'graphique', largeur: 'pleine', option: OPTION_PLAFONDS, reperes: REPERES, lignes }], erreurs: [] });

const LIGNES_ARBRE = [
  { a_qui: 'interne', ou: 'os', module: 'devis', cout: 40 }, { a_qui: 'interne', ou: 'os', module: 'projets', cout: 10 }, { a_qui: 'interne', ou: 'app', module: 'devis', cout: 20 },
  { a_qui: 'client-a', ou: 'plateforme', module: 'devis', cout: 100 }, { a_qui: 'client-a', ou: 'plateforme', module: 'rdv', cout: 5 }, { a_qui: 'client-b', ou: 'app', module: 'rdv', cout: 12.5 },
];
const reponseArbre = (lignes) => ({ titre: 'Tableau de bord', onglets: [{ id: 'arbre', titre: 'Coûts par étiquette', tuiles: ['ar'] }], onglet: 'arbre',
  tuiles: [{ id: 'ar', titre: 'Coûts : à qui, où, module', type: 'arbre', largeur: 'pleine', aide: 'Clique sur un nom pour l\'ouvrir.', valeur: { colonne: 'cout', format: 'euros2' }, niveaux: ['a_qui', 'ou', 'module'], racine: 'Tous les coûts', limite: 500, lignes }], erreurs: [] });

test.describe('Plafond mensuel et arbre des coûts', () => {
  test('P1 une ligne pointillée marque le plafond mensuel, avec les seuils à 80 % et 90 %', async ({ page }, info) => {
    await simulerServeur(page, () => ok(reponsePlafonds([{ cle_nom: 'cle-demo-a', part_normal: 40 }, { cle_nom: 'cle-demo-b', part_attention: 85 }, { cle_nom: 'cle-demo-c', part_attention: 95 }, { cle_nom: 'cle-demo-d', part_atteint: 104 }])));
    await ouvrir(page);
    const lignes = await page.evaluate(async () => {
      const e = await import('/assets/vendor/echarts/echarts.esm.min.js');
      const o = e.getInstanceByDom(document.querySelector('[data-tuile="pl"] .pilotage-graphique')).getOption();
      const m = o.series[0].markLine;
      return { data: m.data.map((d) => ({ y: d.yAxis, type: d.lineStyle?.type, texte: d.label?.formatter })), nb: o.series.length };
    });
    expect(lignes.data).toEqual([{ y: 80, type: 'dashed', texte: '80 %' }, { y: 90, type: 'dashed', texte: '90 %' }, { y: 100, type: 'dashed', texte: 'Plafond mensuel' }]);
    await expect(page.locator('[data-tuile="pl"] canvas')).toBeVisible();
    await capturer(page, info, 'P1-plafond-pointille');
    expect(await sansDefilementHorizontal(page)).toBe(true);
  });

  test('P1 cas vide et cas d\'erreur du graphique de plafonds', async ({ page }, info) => {
    await simulerServeur(page, () => ok(reponsePlafonds([])));
    await ouvrir(page);
    await expect(page.locator('[data-tuile="pl"]')).toContainText('Pas encore de données.');
    await capturer(page, info, 'P1-plafond-vide');
    const r = reponsePlafonds([]);
    r.erreurs = [{ id: 'pl', message: 'x' }];
    await page.unroute('**/pilotageLire');
    await simulerServeur(page, () => ok(r));
    await page.getByRole('button', { name: 'Actualiser' }).click();
    await expect(page.locator('[data-tuile="pl"]')).toContainText('Cette tuile n\'a pas pu être lue.');
    await capturer(page, info, 'P1-plafond-erreur');
  });

  test('P2 l\'arbre : seul « à qui » est ouvert ; un clic sur un nom ouvre ses « où », puis ses modules', async ({ page }, info) => {
    await simulerServeur(page, () => ok(reponseArbre(LIGNES_ARBRE)));
    await ouvrir(page);
    await expect(page.locator('[data-tuile="ar"] canvas')).toBeVisible();
    const noeuds = () => page.evaluate(async () => {
      const e = await import('/assets/vendor/echarts/echarts.esm.min.js');
      const ch = e.getInstanceByDom(document.querySelector('[data-tuile="ar"] .pilotage-graphique'));
      const serie = ch.getModel().getSeriesByIndex(0);
      const donnees = serie.getData();
      const r = ch.getDom().getBoundingClientRect();
      const liste = [];
      donnees.each((i) => { const l = donnees.getItemLayout(i); if (!l || !Number.isFinite(l.x)) return; /* nœud caché (parent fermé) */ const n = donnees.tree.getNodeByDataIndex(i); const el = donnees.getItemGraphicEl(i); const m = el?.getComputedTransform?.(); const px = m ? m[4] : l.x; const py = m ? m[5] : l.y; /* position réelle du rond, dans le cadre du graphique */ liste.push({ nom: n.name, niveau: n.depth, x: r.left + px, y: r.top + py, ouvert: n.isExpand }); });
      return liste;
    });
    let n = await noeuds();
    expect(n.map((x) => x.nom).sort()).toEqual(['Tous les coûts', 'client-a', 'client-b', 'interne'].sort()); // premier niveau seulement
    await capturer(page, info, 'P2-arbre-niveau-1');
    const clic = async (nom) => { const x = (await noeuds()).find((y) => y.nom === nom); await page.mouse.move(x.x, x.y); await page.mouse.down(); await page.mouse.up(); await page.waitForTimeout(700); };
    await clic('interne');
    n = await noeuds();
    expect(n.map((x) => x.nom)).toEqual(expect.arrayContaining(['os', 'app']));
    expect(n.map((x) => x.nom)).not.toContain('devis'); // pas encore les modules
    await capturer(page, info, 'P2-arbre-niveau-2');
    await clic('os');
    n = await noeuds();
    expect(n.map((x) => x.nom)).toEqual(expect.arrayContaining(['devis', 'projets']));
    await capturer(page, info, 'P2-arbre-niveau-3');
    expect(await sansDefilementHorizontal(page)).toBe(true);
  });

  test('P2 cas vide et cas d\'erreur de l\'arbre', async ({ page }, info) => {
    await simulerServeur(page, () => ok(reponseArbre([])));
    await ouvrir(page);
    await expect(page.locator('[data-tuile="ar"]')).toContainText('Pas encore de données.');
    await capturer(page, info, 'P2-arbre-vide');
    const r = reponseArbre([]);
    r.erreurs = [{ id: 'ar', message: 'x' }];
    await page.unroute('**/pilotageLire');
    await simulerServeur(page, () => ok(r));
    await page.getByRole('button', { name: 'Actualiser' }).click();
    await expect(page.locator('[data-tuile="ar"]')).toContainText('Cette tuile n\'a pas pu être lue.');
    await capturer(page, info, 'P2-arbre-erreur');
  });
});
