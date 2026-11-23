// Arbre des coûts : les lignes plates de la vue (une colonne par niveau + une valeur) deviennent une hiérarchie (racine -> niveau 1 -> niveau 2 -> …), dessinée par la série « tree » d'ECharts.
// Au départ seul le premier niveau est ouvert : un clic sur un nœud ouvre ses enfants (ECharts : expandAndCollapse). PAS de vue inverse (décision de Jérôme). Fonctions pures, testées par Node ; rien n'est exécuté depuis les données.
import { formater, estVide } from './formats.js';
import { copier } from './logique.js';

export const ENFANTS_MAX = 30; // au-delà, le reste est regroupé en « Autres (n) » (jamais perdu : la somme reste juste)
export const VIDE = '(vide)';
const nombre = (v) => { const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v; return typeof n === 'number' && Number.isFinite(n) ? n : 0; };

/** Construit la hiérarchie : [{ name, value, children? }], la valeur d'un nœud = somme de ses descendants ; enfants rangés du plus cher au moins cher ; au plus `ENFANTS_MAX` par nœud. */
export function construireArbre(lignes, niveaux, colonneValeur, { enfantsMax = ENFANTS_MAX } = {}) {
  const cles = Array.isArray(niveaux) ? niveaux.filter((n) => typeof n === 'string') : [];
  const racine = { children: new Map(), value: 0 };
  for (const l of Array.isArray(lignes) ? lignes : []) {
    if (l === null || typeof l !== 'object') continue;
    const v = nombre(l[colonneValeur]);
    let noeud = racine;
    noeud.value += v;
    for (const cle of cles) {
      const nom = estVide(l[cle]) ? VIDE : String(l[cle]);
      if (!noeud.children.has(nom)) noeud.children.set(nom, { children: new Map(), value: 0 });
      noeud = noeud.children.get(nom);
      noeud.value += v;
    }
  }
  const convertir = (n, nom) => {
    let enfants = [...n.children.entries()].map(([k, x]) => convertir(x, k)).sort((a, b) => b.value - a.value || a.name.localeCompare(b.name, 'fr'));
    if (enfants.length > enfantsMax) {
      const reste = enfants.slice(enfantsMax - 1);
      enfants = [...enfants.slice(0, enfantsMax - 1), { name: `Autres (${reste.length})`, value: reste.reduce((s, x) => s + x.value, 0) }];
    }
    return { name: nom, value: n.value, ...(enfants.length ? { children: enfants } : {}) };
  };
  return { total: racine.value, racines: convertir(racine, '').children ?? [] };
}

/** Option ECharts d'un arbre. `tuile` : { valeur: { colonne, format }, niveaux: [colonnes], racine?, lignes, titre }. Les textes (nom + valeur formatée) sont fabriqués ici, avec du TEXTE : jamais de HTML. */
export function optionArbre(tuile, { couleurs = {} } = {}) {
  const colonne = tuile.valeur?.colonne;
  const format = tuile.valeur?.format;
  const { total, racines } = construireArbre(tuile.lignes, tuile.niveaux, colonne);
  const texte = (v) => formater(format, v) || String(v);
  const annoter = (n) => ({ ...n, texteValeur: texte(n.value), ...(n.children ? { children: n.children.map(annoter) } : {}) });
  const donnees = [{ name: tuile.racine || 'Total', label: { position: 'top', verticalAlign: 'bottom', align: 'left', distance: 8 }, value: total, texteValeur: texte(total), ...(racines.length ? { children: racines.map(annoter) } : {}) }];
  return copier({
    tooltip: { trigger: 'item', triggerOn: 'mousemove', renderMode: 'richText', confine: true, formatter: (p) => `${p.data?.name ?? ''} : ${p.data?.texteValeur ?? ''}` },
    series: [{
      type: 'tree', data: donnees, orient: 'LR', layout: 'orthogonal', top: '10%', bottom: '4%', left: '6%', right: '30%',
      symbol: 'circle', symbolSize: 9, edgeShape: 'curve', initialTreeDepth: 1, expandAndCollapse: true, animationDuration: 300, animationDurationUpdate: 200,
      lineStyle: { color: couleurOu(couleurs, 'neutre'), width: 1.2, curveness: 0.5 },
      itemStyle: { color: couleurOu(couleurs, 'neutre'), borderColor: couleurOu(couleurs, 'neutre') },
      label: { position: 'left', verticalAlign: 'middle', align: 'right', textBorderWidth: 0, formatter: (p) => `${p.data?.name ?? ''} · ${p.data?.texteValeur ?? ''}` },
      leaves: { label: { position: 'right', verticalAlign: 'middle', align: 'left', textBorderWidth: 0 } },
    }],
  });
}
const couleurOu = (couleurs, nom) => (typeof couleurs?.[nom] === 'string' ? couleurs[nom] : undefined);
