// Lignes pointillées d'un graphique (plafond, seuils d'alerte) : le réglage donne `reperes: [{ valeur, axe?, libelle?, couleur? }]`, l'écran les ajoute à la PREMIÈRE série sous forme de `markLine` pointillée.
// Fonction pure : l'option reçue n'est pas modifiée. `axe: "y"` (défaut) = ligne HORIZONTALE à cette valeur de l'axe vertical ; `axe: "x"` = ligne verticale (graphique en barres couchées).
// Les couleurs sont des noms (« @attention »…) résolus ensuite par `resoudreCouleurs`.
import { copier } from './logique.js';

export const COULEURS_REPERES = Object.freeze(['bon', 'attention', 'mauvais', 'neutre']);

export function appliquerReperes(option, reperes) {
  const sortie = copier(option !== null && typeof option === 'object' && !Array.isArray(option) ? option : {});
  const liste = (Array.isArray(reperes) ? reperes : []).filter((r) => r !== null && typeof r === 'object' && Number.isFinite(r.valeur));
  if (!liste.length) return sortie;
  const series = Array.isArray(sortie.series) ? sortie.series : (sortie.series && typeof sortie.series === 'object' ? [sortie.series] : []);
  if (!series.length) return sortie;
  const premiere = series[0];
  const donnees = liste.map((r) => {
    const cle = r.axe === 'x' ? 'xAxis' : 'yAxis';
    const couleur = COULEURS_REPERES.includes(r.couleur) ? `@${r.couleur}` : '@neutre';
    const libelle = typeof r.libelle === 'string' ? r.libelle : '';
    return { [cle]: r.valeur, name: libelle, lineStyle: { type: 'dashed', width: 1.5, color: couleur }, label: { show: !!libelle, formatter: libelle, position: 'insideEndTop', color: couleur } };
  });
  const avant = premiere.markLine && typeof premiere.markLine === 'object' ? premiere.markLine : {};
  premiere.markLine = { ...avant, silent: true, symbol: 'none', animation: false, data: [...(Array.isArray(avant.data) ? avant.data : []), ...donnees] };
  // Sans `max` fixé par le réglage, l'axe est étiré jusqu'au plus grand repère : la ligne de plafond ne disparaît pas quand toutes les barres sont plus basses.
  for (const cle of ['xAxis', 'yAxis']) {
    const haut = Math.max(...liste.filter((r) => (r.axe === 'x' ? 'xAxis' : 'yAxis') === cle).map((r) => r.valeur));
    if (!Number.isFinite(haut)) continue;
    const axes = Array.isArray(sortie[cle]) ? sortie[cle] : (sortie[cle] && typeof sortie[cle] === 'object' ? [sortie[cle]] : []);
    const axe = axes.find((a) => a && typeof a === 'object' && a.type !== 'category' && a.type !== 'time' && a.type !== 'log');
    if (axe && axe.max === undefined) axe.max = (v) => Math.max(v.max, haut);
  }
  sortie.series = series; // un objet seul devient une liste à une série
  return sortie;
}
