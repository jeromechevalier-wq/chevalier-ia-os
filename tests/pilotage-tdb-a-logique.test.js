// Tableau de bord, partie A : règles pures du navigateur (formats français, seuils, règles de couleur, variation, texte, tri, pagination, plan des onglets, réponse de l'ancien serveur,
// formats et couleurs d'un graphique) et contrôles statiques des fichiers du module. Sans navigateur ni réseau. Le nom de chaque test commence par le numéro du point du brief.
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { test, describe } from 'node:test';
import { fileURLToPath } from 'node:url';
import * as F from '../js/modules/pilotage/formats.js';
import * as L from '../js/modules/pilotage/logique.js';

const lire = (f) => readFileSync(fileURLToPath(new URL(`../${f}`, import.meta.url)), 'utf8');
const N = ' '; // espace fine insécable (milliers)
const B = ' '; // espace insécable (avant € et %)

describe('A3 formats nommés, rendus par Intl en français', () => {
  test('A3.1 euros : milliers en U+202F, espace insécable U+00A0 avant « € », 0 ou 2 décimales', () => {
    assert.equal(F.formater('euros0', 1234567.4), `1${N}234${N}567${B}€`);
    assert.equal(F.formater('euros0', 100), `100${B}€`);
    assert.equal(F.formater('euros2', 1234.5), `1${N}234,50${B}€`);
    assert.equal(F.formater('euros0', -2500), `-2${N}500${B}€`);
    assert.equal(F.formater('euros0', '10000'), `10${N}000${B}€`); // un « numeric » de Postgres arrive en texte
  });
  test('A3.2 euros abrégé : « 60 k€ » (jamais « 60 k € »), « 1,2 M€ », sous 1000 : euros entiers', () => {
    assert.equal(F.formater('euros_abrege', 60000), `60${B}k€`);
    assert.equal(F.formater('euros_abrege', 1500), `1,5${B}k€`);
    assert.equal(F.formater('euros_abrege', 1_200_000), `1,2${B}M€`);
    assert.equal(F.formater('euros_abrege', 800), `800${B}€`);
    assert.equal(F.formater('euros_abrege', -60000), `-60${B}k€`);
    assert.equal(F.formater('euros_abrege', 999_960), `1${B}M€`);
  });
  test('A3.3 pourcentages, entier, jours (singulier avant 2)', () => {
    assert.equal(F.formater('pourcent0', 95.4), `95${B}%`);
    assert.equal(F.formater('pourcent1', 95.46), `95,5${B}%`);
    assert.equal(F.formater('entier', 12345.6), `12${N}346`);
    assert.equal(F.formater('jours', 1), `1${B}jour`);
    assert.equal(F.formater('jours', 0), `0${B}jour`);
    assert.equal(F.formater('jours', 12), `12${B}jours`);
    assert.equal(F.formater('jours', 1.5), `1,5${B}jour`);
    assert.equal(F.formater('jours', 7.25), `7,3${B}jours`);
  });
  test('A3.4 dates : « AAAA-MM-JJ » sans fuseau reste le même jour ; un instant ISO UTC est mis à l\'heure de Paris, jour/mois/année et 24 h', () => {
    assert.equal(F.formater('date', '2026-11-23'), '23/11/2026');
    assert.equal(F.formater('date', '2026-01-01'), '01/01/2026');
    assert.equal(F.formater('date_heure', '2026-11-23T14:05:00.000Z'), '23/11/2026 15:05'); // hiver : UTC+1
    assert.equal(F.formater('date_heure', '2026-07-23T14:05:00.000Z'), '23/07/2026 16:05'); // été : UTC+2
    assert.equal(F.formater('date', '2026-11-22T23:30:00.000Z'), '23/11/2026'); // minuit passé à Paris
    assert.equal(F.formater('date_heure', '2026-11-23'), '23/11/2026'); // date seule : pas d'heure inventée
    assert.equal(F.formater('mois_annee', '2026-11-01'), 'novembre 2026');
    assert.equal(F.formater('mois_annee', '2026-02'), 'février 2026');
    assert.equal(F.formater('mois_annee', '2026-12-01T00:00:00.000Z'), 'décembre 2026');
    assert.equal(F.formater('date_heure', '2026-11-23 14:05:00'), '23/11/2026 14:05'); // sans fuseau : lu tel quel
  });
  test('A3.5 valeur vide : texte vide ; valeur illisible : rendue telle quelle, jamais d\'exception ; format absent ou inconnu : nombre à la française', () => {
    for (const v of [null, undefined, '', '  ']) assert.equal(F.formater('euros0', v), '');
    assert.equal(F.formater('euros0', 'beaucoup'), 'beaucoup');
    assert.equal(F.formater('date', 'pas une date'), 'pas une date');
    assert.equal(F.formater(undefined, 1234.5), `1${N}234,5`);
    assert.equal(F.formater('inconnu', 'texte'), 'texte');
    assert.equal(F.formater('euros0', 0), `0${B}€`);
    assert.equal(F.formater('euros0', -0.2), `0${B}€`); // jamais « -0 »
  });
  test('A3.6 la liste des formats du navigateur est celle du serveur', async () => {
    const { FORMATS, COULEURS } = await import('../functions/src/pilotage/reglages.js');
    assert.deepEqual([...F.FORMATS], [...FORMATS]);
    assert.deepEqual([...F.COULEURS], [...COULEURS]);
    for (const f of FORMATS) assert.equal(typeof F.formater(f, 1), 'string');
  });
});

describe('A2 seuils, règles et variation', () => {
  const seuils = [{ jusqua: 6, couleur: 'bon' }, { jusqua: 29, couleur: 'attention' }, { couleur: 'mauvais', libelle: 'Trop long' }];
  test('A2.1 seuil : borne incluse, le dernier sans « jusqua » prend le reste ; pas un nombre : aucun seuil', () => {
    assert.equal(F.seuilDe(seuils, 6).couleur, 'bon');
    assert.equal(F.seuilDe(seuils, 7).couleur, 'attention');
    assert.equal(F.seuilDe(seuils, 29).couleur, 'attention');
    assert.equal(F.seuilDe(seuils, 30).libelle, 'Trop long');
    assert.equal(F.seuilDe(seuils, '12').couleur, 'attention');
    assert.equal(F.seuilDe(seuils, null), null);
    assert.equal(F.seuilDe(seuils, 'texte'), null);
    assert.equal(F.seuilDe(undefined, 3), null);
    assert.equal(F.seuilDe([{ jusqua: 0, couleur: 'bon' }, { couleur: 'attention' }], 0).couleur, 'bon');
  });
  test('A2.2 règles de tableau : la PREMIÈRE règle vraie gagne ; opérateurs >= > <= < = ; valeur vide ; texte', () => {
    const regles = [{ si: '>=', valeur: 100, couleur: 'mauvais' }, { si: '>=', valeur: 90, couleur: 'attention' }, { si: '<', valeur: 90, couleur: 'bon' }];
    assert.equal(F.couleurDeRegles(regles, 120), 'mauvais');
    assert.equal(F.couleurDeRegles(regles, 100), 'mauvais');
    assert.equal(F.couleurDeRegles(regles, 95), 'attention');
    assert.equal(F.couleurDeRegles(regles, '89.5'), 'bon');
    assert.equal(F.couleurDeRegles(regles, null), null); // vide : aucune règle numérique ne s'applique
    assert.equal(F.couleurDeRegles([{ si: '>', valeur: 5, couleur: 'bon' }], 5), null);
    assert.equal(F.couleurDeRegles([{ si: '<=', valeur: 5, couleur: 'bon' }], 5), 'bon');
    assert.equal(F.couleurDeRegles([{ si: '=', valeur: 'Refusée', couleur: 'mauvais' }], 'Refusée'), 'mauvais');
    assert.equal(F.couleurDeRegles([{ si: '=', valeur: null, couleur: 'neutre' }], ''), 'neutre'); // « budget non renseigné »
    assert.equal(F.couleurDeRegles([{ si: '=', valeur: null, couleur: 'neutre' }], 0), null);
    assert.equal(F.couleurDeRegles([{ si: '>=', valeur: 1, couleur: '#fff' }], 3), null); // jamais un code de couleur
    assert.equal(F.couleurDeRegles(undefined, 3), null);
  });
  test('A2.3 variation : les DEUX DERNIÈRES périodes (lignes rangées par la colonne de période), pourcentage, sens et couleur selon « hausse »', () => {
    const lignes = [{ mois: '2026-11-01', total: 120 }, { mois: '2026-09-01', total: 90 }, { mois: '2026-10-01', total: 100 }]; // volontairement en désordre
    const bon = F.calculerVariation(lignes, { colonne: 'total', periodeColonne: 'mois', hausse: 'bon' });
    assert.equal(bon.actuelle, 120); assert.equal(bon.precedente, 100); assert.equal(bon.periodePrecedente, '2026-10-01'); assert.equal(Math.round(bon.pourcent), 20);
    assert.equal(bon.sens, 'hausse'); assert.equal(bon.couleur, 'bon');
    const mauvais = F.calculerVariation(lignes, { colonne: 'total', periodeColonne: 'mois', hausse: 'mauvais' });
    assert.equal(mauvais.couleur, 'mauvais'); // couleur INVERSÉE : une hausse de dépense est rouge
    const baisse = F.calculerVariation([{ mois: '1', total: 100 }, { mois: '2', total: 80 }], { colonne: 'total', periodeColonne: 'mois', hausse: 'mauvais' });
    assert.equal(baisse.sens, 'baisse'); assert.equal(baisse.couleur, 'bon');
    assert.equal(F.calculerVariation([{ mois: '1', total: 100 }, { mois: '2', total: 100 }], { colonne: 'total', periodeColonne: 'mois', hausse: 'bon' }).couleur, 'neutre');
  });
  test('A2.4 variation : une seule période, période d\'avant à zéro, valeurs absentes : pas de pourcentage, jamais d\'exception', () => {
    const o = { colonne: 'total', periodeColonne: 'mois', hausse: 'bon' };
    assert.equal(F.calculerVariation([{ mois: '1', total: 5 }], o).pourcent, null);
    assert.equal(F.calculerVariation([{ mois: '1', total: 0 }, { mois: '2', total: 5 }], o).pourcent, null);
    assert.equal(F.calculerVariation([], o).actuelle, null);
    assert.equal(F.calculerVariation(undefined, o).pourcent, null);
    assert.equal(F.calculerVariation([{ mois: '1', total: null }, { mois: '2', total: 5 }], o).pourcent, null);
    assert.equal(F.texteVariation(12.34), `+12,3${B}%`);
    assert.equal(F.texteVariation(-4), `-4,0${B}%`);
  });
  test('A2.5 ligne du chiffre : la plus récente avec une variation, la première sans', () => {
    const lignes = [{ mois: '2026-09-01', total: 1 }, { mois: '2026-11-01', total: 3 }, { mois: '2026-10-01', total: 2 }];
    assert.equal(F.ligneDuChiffre(lignes, { periodeColonne: 'mois' }).total, 3);
    assert.equal(F.ligneDuChiffre(lignes, undefined).total, 1);
    assert.equal(F.ligneDuChiffre([], undefined), null);
  });
  test('A2.6 texte : gras, italique, retour à la ligne et lien interne ; le reste est du texte, jamais du HTML', () => {
    const l = F.analyserTexte('**Gras** et *italique*\nVoir [le détail](#detail) <b>pas du html</b>');
    assert.deepEqual(l[0], [{ texte: 'Gras', gras: true }, { texte: ' et ' }, { texte: 'italique', italique: true }]);
    assert.deepEqual(l[1][1], { texte: 'le détail', onglet: 'detail' });
    assert.ok(l[1].some((s) => s.texte.includes('<b>pas du html</b>'))); // posé tel quel en texte par l'écran
    assert.deepEqual(F.analyserTexte('a * b * c')[0].map((s) => s.texte).join(''), 'a * b * c');
    assert.deepEqual(F.analyserTexte(''), [[]]);
  });
  test('A2.7 tableau : tri (nombres comme des nombres, vides en dernier dans les deux sens, stable) et pagination bornée', () => {
    const lignes = [{ n: 'b', v: 10 }, { n: 'a', v: 2 }, { n: 'c', v: null }, { n: 'd', v: 2 }, { n: 'e', v: '100' }];
    assert.deepEqual(F.trierLignes(lignes, 'v', 'asc').map((x) => x.n), ['a', 'd', 'b', 'e', 'c']);
    assert.deepEqual(F.trierLignes(lignes, 'v', 'desc').map((x) => x.n), ['e', 'b', 'a', 'd', 'c']);
    assert.deepEqual(F.trierLignes(lignes, 'n', 'asc').map((x) => x.n), ['a', 'b', 'c', 'd', 'e']);
    assert.equal(lignes[0].n, 'b'); // l'entrée n'est pas modifiée
    const p = F.pageDe(Array.from({ length: 45 }, (_, i) => i), 3, 20);
    assert.equal(p.lignes.length, 5); assert.equal(p.pages, 3); assert.equal(p.page, 3);
    assert.equal(F.pageDe([1, 2, 3], 9, 20).page, 1);
    assert.equal(F.pageDe([], 1, 20).pages, 1);
  });
});

describe('A1 plan des onglets et sections ; réponse de l\'ancien serveur', () => {
  const rep = () => L.lireReponse({
    titre: 'Mon tableau', onglet: 'b',
    onglets: [{ id: 'a', titre: 'A', tuiles: ['t1'] }, { id: 'b', titre: 'B', intro: 'Intro de B.', tuiles: ['t2'], sections: [{ id: 's1', titre: 'Section 1', intro: 'Intro S1', tuiles: ['t3'] }, { id: 's2', titre: 'Vide', tuiles: ['absente'] }] }],
    tuiles: [{ id: 't2', titre: 'T2', type: 'texte', texte: 'x' }, { id: 't3', titre: 'T3', type: 'chiffre', valeur: { colonne: 'n' }, lignes: [{ n: 1 }] }], erreurs: [],
  });
  test('A1.1 plan : l\'onglet lu, ses tuiles directes puis ses sections (une section sans tuile reçue n\'est pas montrée)', () => {
    const p = L.plan(rep());
    assert.equal(p.actif.id, 'b');
    assert.equal(p.intro, 'Intro de B.');
    assert.deepEqual(p.onglets.map((o) => o.id), ['a', 'b']);
    assert.deepEqual(p.blocs.map((b) => [b.section?.id ?? null, b.cartes.map((c) => c.id)]), [[null, ['t2']], ['s1', ['t3']]]);
    assert.equal(p.blocs[1].section.intro, 'Intro S1');
  });
  test('A1.2 un onglet inconnu dans la réponse retombe sur le premier ; sans onglets : une seule page', () => {
    const r = rep(); r.onglet = 'zzz';
    assert.equal(L.plan(r).actif.id, 'a');
    const sans = L.lireReponse({ titre: 'T', tuiles: [{ id: 'a', titre: 'A', lignes: [{ x: 1 }], option: {} }, { id: 'b', titre: 'B', lignes: [{ x: 1 }], option: {} }], erreurs: [] });
    const p = L.plan(sans);
    assert.deepEqual(p.onglets, []);
    assert.equal(p.actif, null);
    assert.deepEqual(p.blocs.map((b) => b.cartes.map((c) => c.id)), [['a', 'b']]);
    assert.deepEqual(L.plan(L.lireReponse(undefined)).blocs, []);
  });
  test('A1.3 l\'ANCIEN serveur (ni type, ni largeur, ni onglets) : tout est un graphique de largeur « moitié », page unique ; genre « graphique » ou « vide »', () => {
    const r = L.lireReponse({ titre: 'T', tuiles: [{ id: 'a', titre: 'A', option: {}, lignes: [{ x: 1 }] }, { id: 'b', titre: 'B', option: {}, lignes: [] }], erreurs: [] });
    assert.deepEqual(r.tuiles.map((t) => [t.type, t.largeur]), [['graphique', 'moitie'], ['graphique', 'moitie']]);
    assert.deepEqual(L.cartes(r).map((c) => c.genre), ['graphique', 'vide']);
    assert.deepEqual(r.onglets, []);
  });
  test('A2.8 genres : un texte n\'est jamais « vide » ; chiffre, tableau et phrases sans ligne sont « vides » ; un type inconnu est « invalide » ; une erreur prend la place', () => {
    const r = L.lireReponse({ tuiles: [
      { id: 'x', titre: 'X', type: 'texte', texte: 'a' }, { id: 'c', titre: 'C', type: 'chiffre', lignes: [] }, { id: 't', titre: 'T', type: 'tableau', lignes: [{ a: 1 }], colonnes: [{ colonne: 'a' }] },
      { id: 'p', titre: 'P', type: 'phrases', lignes: [], colonnes: ['a'] }, { id: 'q', titre: 'Q', type: 'camembert', lignes: [] }, { id: 'e', titre: 'E', type: 'chiffre', lignes: [{ a: 1 }] }], erreurs: [{ id: 'e', message: 'x' }] });
    assert.deepEqual(L.cartes(r).map((c) => c.genre), ['texte', 'vide', 'tableau', 'vide', 'invalide', 'erreur']);
    assert.deepEqual(r.tuiles[3].colonnes, ['a']);
    assert.equal(r.tuiles[1].largeur, 'tiers');
  });
  test('A1.4 vide : aucun tuile, aucune erreur ET aucun onglet', () => {
    assert.equal(L.lireReponse({ tuiles: [], erreurs: [] }).vide, true);
    assert.equal(L.lireReponse({ tuiles: [], erreurs: [], onglets: [{ id: 'a', titre: 'A', tuiles: [] }] }).vide, false);
  });
});

describe('A5 graphiques : formats, couleurs nommées, habillage', () => {
  const lignes = [{ mois: '2026-10-01', total: 60000 }];
  test('A5.1 formats : axes, infobulle et étiquettes reçoivent des fonctions du CODE de l\'appli ; l\'option reçue n\'est pas modifiée', () => {
    const option = { xAxis: { type: 'category' }, yAxis: { type: 'value' }, tooltip: { trigger: 'axis' }, series: [{ type: 'bar', encode: { x: 'mois', y: 'total' } }] };
    const copie = JSON.stringify(option);
    const f = L.optionFinale(option, lignes, { formats: { axeY: 'euros_abrege', axeX: 'mois_annee', infobulle: 'euros0', etiquettes: 'euros_abrege' } });
    assert.equal(JSON.stringify(option), copie);
    assert.equal(f.yAxis.axisLabel.formatter(60000), `60${B}k€`);
    assert.equal(f.xAxis.axisLabel.formatter('2026-10-01'), 'octobre 2026');
    assert.equal(f.tooltip.valueFormatter(100), `100${B}€`);
    assert.equal(f.series[0].label.formatter({ value: 60000 }), `60${B}k€`);
    assert.equal(f.series[0].label.formatter({ value: { mois: 'x', total: 1500 }, dimensionNames: ['mois', 'total'], encode: { x: [0], y: [1] } }), `1,5${B}k€`);
    assert.equal(f.series[0].label.formatter({ value: ['x', 1500], encode: { x: [0], y: [1] } }), `1,5${B}k€`);
    assert.equal(f.tooltip.renderMode, 'richText'); // l'infobulle reste en texte
  });
  test('A5.2 couleurs nommées : « @bon » devient la couleur du thème ; une autre chaîne n\'est jamais touchée ; sans contexte rien ne change', () => {
    const couleurs = { bon: '#111111', attention: '#222222', mauvais: '#333333', neutre: '#444444' };
    const option = { series: [{ type: 'bar', itemStyle: { color: '@mauvais' }, markLine: { lineStyle: { color: '@neutre' }, data: [{ yAxis: 80, name: '@bon seulement en entier' }] } }] };
    const f = L.optionFinale(option, lignes, { couleurs });
    assert.equal(f.series[0].itemStyle.color, '#333333');
    assert.equal(f.series[0].markLine.lineStyle.color, '#444444');
    assert.equal(f.series[0].markLine.data[0].name, '@bon seulement en entier');
    assert.equal(L.optionFinale(option, lignes).series[0].itemStyle.color, '@mauvais');
  });
  test('A5.3 légende défilante par défaut (jamais tronquée), sauf si le réglage choisit un type', () => {
    assert.equal(L.optionFinale({ legend: {} }, lignes).legend.type, 'scroll');
    assert.equal(L.optionFinale({ legend: { type: 'plain' } }, lignes).legend.type, 'plain');
    assert.equal(L.optionFinale({}, lignes).legend, undefined);
  });
  test('A5.4 le dangereux reste nettoyé : liens, images, toolbox (avant résolution des couleurs et des formats)', () => {
    const f = L.optionFinale({ toolbox: { feature: {} }, backgroundColor: 'image://x', series: [{ type: 'pie', link: 'x', symbol: 'image://y' }], graphic: [{ type: 'image', style: { image: 'x' } }] }, lignes, { couleurs: { bon: '#111' }, formats: { etiquettes: 'euros0' } });
    assert.equal(f.toolbox, undefined);
    assert.equal(f.backgroundColor, undefined);
    assert.equal(f.series[0].link, undefined);
    assert.equal(f.series[0].symbol, undefined);
    assert.deepEqual(f.graphic, []);
  });
  test('A5.5 le thème : libellés de catégorie raccourcis (infobulle pour le texte entier), barres arrondies, infobulle et marque habillées', () => {
    const t = L.construireTheme({ texte: '#fff', texte2: '#ccc', trait: '#111', traitFort: '#222', palette: ['#a'], police: 'x', taille: 12, fond: '#000', panneau: '#333' });
    assert.equal(t.categoryAxis.axisLabel.overflow, 'truncate');
    assert.ok(t.categoryAxis.axisLabel.width > 0);
    assert.equal(t.bar.itemStyle.borderRadius, 4);
    assert.equal(t.tooltip.backgroundColor, '#333');
    assert.equal(t.legend.textStyle.color, '#ccc');
  });
});

describe('A4 plein écran et A9 contrôles statiques', () => {
  test('A4.1 l\'écran écoute fullscreenchange (Échap natif) ET la touche Échap (repli CSS), et retire ses écouteurs à la sortie', () => {
    const t = lire('js/modules/pilotage/ecran.js');
    assert.match(t, /addEventListener\('fullscreenchange'/);
    assert.match(t, /removeEventListener\('fullscreenchange'/);
    assert.match(t, /e\.key === 'Escape'/);
    assert.match(t, /requestFullscreen/);
    assert.match(t, /Quitter le plein écran/);
    assert.match(lire('css/pilotage.css'), /\.pilotage-plein \{[^}]*position: fixed/);
  });
  test('A9.1 aucun fichier du module n\'utilise innerHTML, eval, new Function, ni Firestore ; ECharts n\'est importé que par l\'écran', () => {
    const fichiers = readdirSync(fileURLToPath(new URL('../js/modules/pilotage/', import.meta.url))).filter((f) => f.endsWith('.js'));
    for (const f of ['blocs.js', 'formats.js', 'logique.js', 'ecran.js', 'donnees.js', 'habillage.js', 'index.js']) assert.ok(fichiers.includes(f), f);
    for (const f of fichiers) {
      const t = lire(`js/modules/pilotage/${f}`);
      assert.doesNotMatch(t, /\binnerHTML\b|\beval\s*\(|new Function|firebase-firestore|onSnapshot|getDocs|setDoc|executer\(/, f);
      if (f !== 'ecran.js') assert.doesNotMatch(t, /echarts\.esm|vendor\/echarts/, f);
    }
  });
  test('A9.2 UN seul appel au serveur dans donnees.js (pilotageLire), aucun autre appel de fonction', () => {
    const t = lire('js/modules/pilotage/donnees.js');
    assert.equal((t.match(/httpsCallable\(/g) ?? []).length, 1);
    assert.equal((t.match(/httpsCallable\(fonctions\(\), 'pilotageLire'\)/g) ?? []).length, 1);
  });
  test('A9.3 les liens ne sont jamais fabriqués à partir d\'une valeur de la base : seul le routeur fabrique l\'adresse, d\'après un identifiant d\'onglet du réglage', () => {
    const t = lire('js/modules/pilotage/blocs.js');
    const adresses = [...t.matchAll(/href:\s*([^,}]+)/g)].map((m) => m[1].trim());
    assert.ok(adresses.length >= 3);
    for (const a of adresses) assert.match(a, /^adresseOnglet\(/, a);
    assert.doesNotMatch(t, /ligne\[[^\]]+\][^;]*href|href[^;]*ligne\[/);
  });
  test('A9.4 css : aucune taille de texte ni graisse en dur ; les couleurs nommées viennent du thème', () => {
    const css = lire('css/pilotage.css');
    assert.doesNotMatch(css, /font-size:\s*\d|font-weight:\s*\d/);
    assert.match(css, /\.couleur-bon \{ color: var\(--succes\)/);
    assert.match(css, /\.couleur-mauvais \{ color: var\(--retard\)/);
    assert.match(css, /\.couleur-attention \{ color: var\(--attention\)/);
    assert.match(css, /\.couleur-neutre \{ color: var\(--texte2\)/);
  });
  test('A9.5 la barre d\'onglets est celle de la coque (vrais liens, aria-current), sans role=tablist ; le registre n\'est pas touché', () => {
    const t = lire('js/modules/pilotage/ecran.js');
    assert.match(t, /from '\.\.\/\.\.\/os\/onglets\.js'/);
    assert.doesNotMatch(t + lire('js/modules/pilotage/blocs.js'), /tablist/);
    assert.match(lire('js/modules/pilotage/index.js'), /segs\[1\]/);
  });
});

describe('A10 relecture Fable : formats, ids, expression partagée', () => {
  test('A10.1 booléen oui/non ; jour invalide rendu tel quel ; instant en millisecondes mis en forme', () => {
    assert.equal(F.formater('entier', true), 'oui');
    assert.equal(F.formater('entier', false), 'non');
    assert.equal(F.formater('date', '2026-02-31'), '2026-02-31');
    assert.equal(F.formater('date', 1767225600000), '01/01/2026');
  });
  test('A10.6 grand chiffre avec variation : la ligne sans période (un total) n\'est jamais celle affichée', () => {
    const v = { colonne: 't', periodeColonne: 'm' };
    const lignes = [{ m: null, t: 999 }, { m: '2026-10', t: 10 }];
    assert.equal(F.ligneDuChiffre(lignes, v).t, 10);
    assert.equal(F.calculerVariation(lignes, v).actuelle, 10);
  });
  test('A10.2 grand chiffre sans format : séparateur de milliers français', () => {
    assert.equal(F.formater(undefined, 1234567), `1${N}234${N}567`);
  });
  test('A10.3 variation arrondie à 0 : sans signe ; période précédente à 0 : marquée', () => {
    assert.equal(F.texteVariation(0.04), `0,0${B}%`);
    assert.equal(F.texteVariation(2.5), `+2,5${B}%`);
    assert.equal(F.calculerVariation([{ m: '2026-09-01', t: 0 }, { m: '2026-10-01', t: 10 }], { colonne: 't', periodeColonne: 'm' }).precedenteNulle, true);
  });
  test('A10.4 texte : l\'expression de lien est la MÊME que celle du serveur', async () => {
    const S = await import('../functions/src/pilotage/reglages.js');
    assert.equal(F.LIEN_TEXTE_SOURCE, S.LIEN_TEXTE_SOURCE);
  });
  test('A10.5 ids d\'onglet hors du motif : ignorés par la lecture de la réponse', () => {
    const r = L.lireReponse({ tuiles: [], onglets: [{ id: 'ok', titre: 'A', tuiles: [] }, { id: 'MAUVAIS ID', titre: 'B', tuiles: [] }] });
    assert.deepEqual(r.onglets.map((o) => o.id), ['ok']);
  });
});
