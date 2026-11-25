// Options ECharts des graphiques KPI. Fonctions pures : elles reçoivent les lignes et les couleurs du thème et rendent un objet (une donnée, jamais du code exécuté).
import { formater, nombre } from './formats.js';
import { dateJourFichier } from './filtrage.js';

const base = (c) => ({
  textStyle: { color: c.texte2 }, animationDuration: 300,
  tooltip: { trigger: 'axis', confine: true, textStyle: { color: c.texte }, backgroundColor: c.panneau, borderColor: c.bordure },
})
const axeValeur = (c, f) => ({ type: 'value', axisLabel: { color: c.texte2, formatter: f }, splitLine: { lineStyle: { color: c.bordure } } })
const euros = (v) => formater(v, 'euros_abrege')
const moisCourt = (m) => formater(m, 'mois_court')

export function barresMensuelles(lignes, c) {
  return { ...base(c), grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
    xAxis: { type: 'category', data: lignes.map((l) => moisCourt(l.mois)), axisLabel: { color: c.texte2 }, axisLine: { lineStyle: { color: c.bordure } } },
    yAxis: axeValeur(c, euros),
    series: [{ type: 'bar', name: 'Achats acceptés (€ HT)', data: lignes.map((l) => l.total_ht), itemStyle: { color: c.serie, borderRadius: [3, 3, 0, 0] }, tooltip: { valueFormatter: (v) => formater(v, 'euros0') } }] }
}

/** Budget consommé par chantier : barres horizontales colorées selon le niveau, trait pointillé à 100 %. */
export function budgetsOption(chantiers, c) {
  const l = chantiers.filter((x) => x.budget_renseigne && nombre(x.pct_budget_consomme) !== null).sort((a, b) => (nombre(b.pct_budget_consomme) ?? 0) - (nombre(a.pct_budget_consomme) ?? 0))
  const couleur = (n) => (n === 'depasse' ? c.mauvais : n === 'a_surveiller' ? c.attention : c.neutre)
  return { ...base(c), grid: { left: 8, right: 24, top: 16, bottom: 8, containLabel: true },
    xAxis: { ...axeValeur(c, (v) => `${v} %`), max: Math.max(120, ...l.map((x) => nombre(x.pct_budget_consomme) ?? 0)) },
    yAxis: { type: 'category', inverse: true, data: l.map((x) => x.chantier), axisLabel: { color: c.texte2, width: 130, overflow: 'truncate' } },
    series: [{ type: 'bar', name: 'Budget consommé', barMaxWidth: 16, tooltip: { valueFormatter: (v) => `${v} %` },
      data: l.map((x) => ({ value: x.pct_budget_consomme, itemStyle: { color: couleur(x.niveau), borderRadius: [0, 3, 3, 0] } })),
      markLine: { silent: true, symbol: 'none', data: [{ xAxis: 100 }], lineStyle: { type: 'dashed', color: c.mauvais }, label: { formatter: 'Budget', position: 'insideEndTop', color: c.mauvais } } }] }
}

/** Barres empilées : une série par catégorie (statut, chantier…), un mois par barre. Au-delà de `max` catégories, le reste est regroupé en « Autres ». */
export function empile(lignes, c, o) {
  const mois = [...new Set(lignes.map((l) => l.mois))].sort()
  const tot = new Map (); for (const l of lignes) tot.set(l.cle, (tot.get(l.cle) ?? 0) + l.valeur)
  let cles = [...tot.entries()].sort((a, b) => b[1] - a[1]).map((e) => e[0])
  const garde = o.max ?? 99
  const autres = cles.length > garde ? new Set(cles.slice(garde - 1)) : new Set ()
  if (autres.size) cles = [...cles.slice(0, garde - 1), 'Autres']
  const val = (m, k) => lignes.filter((l) => l.mois === m && (k === 'Autres' && autres.size ? autres.has(l.cle) : l.cle === k)).reduce((t, l) => t + l.valeur, 0)
  return { ...base(c), legend: { top: 0, type: 'scroll', textStyle: { color: c.texte2 } }, grid: { left: 8, right: 16, top: 40, bottom: 8, containLabel: true },
    xAxis: { type: 'category', data: mois.map(moisCourt), axisLabel: { color: c.texte2 }, axisLine: { lineStyle: { color: c.bordure } } }, yAxis: axeValeur(c, o.format),
    series: cles.map((k, i) => ({ type: 'bar', stack: 'total', name: k, data: mois.map((m) => val(m, k)), itemStyle: { color: o.couleurs?.[k] ?? c.palette[i % c.palette.length] }, tooltip: { valueFormatter: o.format } })) }
}

export function ligneTaux(lignes, c) {
  return { ...base(c), grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
    xAxis: { type: 'category', data: lignes.map((l) => moisCourt(l.mois)), axisLabel: { color: c.texte2 }, axisLine: { lineStyle: { color: c.bordure } } },
    yAxis: { ...axeValeur(c, (v) => `${v} %`), min: 0 },
    series: [{ type: 'line', name: 'Taux de refus', data: lignes.map((l) => l.taux_refus_pct), connectNulls: false, symbolSize: 7, lineStyle: { color: c.mauvais }, itemStyle: { color: c.mauvais }, areaStyle: { color: c.mauvais, opacity: 0.12 }, tooltip: { valueFormatter: (v) => (v === null || v === undefined ? 'Aucune décision' : `${v} %`) } }] }
}

export function barresSimples(lignes, c, nomSerie, format) {
  return { ...base(c), grid: { left: 8, right: 16, top: 24, bottom: 8, containLabel: true },
    xAxis: { type: 'category', data: lignes.map((l) => l.nom), axisLabel: { color: c.texte2 }, axisLine: { lineStyle: { color: c.bordure } } }, yAxis: axeValeur(c, format),
    series: [{ type: 'bar', name: nomSerie, data: lignes.map((l) => l.valeur), itemStyle: { color: c.serie, borderRadius: [3, 3, 0, 0] }, label: { show: true, position: 'top', color: c.texte2, formatter: (p) => format(p.value) }, tooltip: { valueFormatter: format } }] }
}

/** Évolution du prix net d'un article en base 100 : le premier prix de la fenêtre vaut 100 %, toutes les courbes partagent ce 100. Axe du temps fixe (la fenêtre, 12 mois par défaut) ; axe vertical en %, au moins de 90 à 110 pour que de petites variations restent petites. L'infobulle donne l'indice et le vrai prix en euros. */
export function prixOption(series, c, unite, fenetre) {
  const tous = series.flatMap((s) => s.points.map((p) => p.indice))
  const bas = Math.min(90, Math.floor((Math.min(...tous, 100) - 2) / 5) * 5), haut = Math.max(110, Math.ceil((Math.max(...tous, 100) + 2) / 5) * 5)
  const temps = (d) => Date.parse(`${d}T00:00:00Z`)
  const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const pc = (v) => `${String(Math.round(v * 10) / 10).replace('.', ',')} %`
  return { ...base(c), tooltip: { trigger: 'item', confine: true, textStyle: { color: c.texte }, backgroundColor: c.panneau, borderColor: c.bordure,
      formatter: (p) => `${esc(p.seriesName)}<br/>${formater(p.data.date, 'date')}<br/><strong>${pc(p.data.value[1])}</strong> · ${formater(p.data.prix, 'prix')}${unite ? ` / ${esc(unite)}` : ''}` },
    legend: series.length > 1 ? { top: 0, type: 'scroll', textStyle: { color: c.texte2 } } : undefined, grid: { left: 8, right: 16, top: series.length > 1 ? 40 : 24, bottom: 8, containLabel: true }, useUTC: true,
    xAxis: { type: 'time', min: temps(fenetre.du), max: temps(fenetre.au), splitNumber: 6, axisLabel: { color: c.texte2, hideOverlap: true, formatter: (v) => formater(dateJourFichier(new Date(v)), 'mois_court') }, axisLine: { lineStyle: { color: c.bordure } }, splitLine: { show: false } },
    yAxis: { ...axeValeur(c, (v) => `${v} %`), min: bas, max: haut },
    series: series.map((s, i) => { const couleur = series.length > 1 ? c.palette[i % c.palette.length] : c.serie
      return { type: 'line', name: s.nom, data: s.points.map((p) => ({ value: [temps(p.date), p.indice], date: p.date, prix: p.prix })), symbolSize: 8, lineStyle: { color: couleur }, itemStyle: { color: couleur },
        markLine: i === 0 ? { silent: true, symbol: 'none', label: { show: false }, lineStyle: { type: 'dashed', color: c.neutre }, data: [{ yAxis: 100 }] } : undefined } }) }
}

/** Barres horizontales (classement) : la plus grosse valeur en haut, les noms longs coupés à `largeurLibelle` pixels (plus étroit sur téléphone, pour laisser de la place aux barres). Deux groupes peuvent porter le même nom : chaque barre garde sa place. */
export function barresHorizontales(lignes, c, nomSerie, format, largeurLibelle = 170) {
  return { ...base(c), tooltip: { ...(base(c).tooltip), axisPointer: { type: 'shadow' } }, grid: { left: 8, right: 72, top: 8, bottom: 8, containLabel: true },
    xAxis: axeValeur(c, format),
    yAxis: { type: 'category', inverse: true, data: lignes.map((l, i) => ({ value: `${i + 1}. ${l.nom}` })), axisLabel: { color: c.texte2, width: largeurLibelle, overflow: 'truncate' } },
    series: [{ type: 'bar', name: nomSerie, barMaxWidth: 18, data: lignes.map((l) => l.valeur), itemStyle: { color: c.serie, borderRadius: [0, 3, 3, 0] }, label: { show: true, position: 'right', color: c.texte2, formatter: (p) => format(p.value) }, tooltip: { valueFormatter: (v) => formater(v, 'euros2') } }] }
}
