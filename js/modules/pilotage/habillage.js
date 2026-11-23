// Habillage ECharts du Pilotage : le canvas ne lit pas le CSS, donc les couleurs sont relues dans les variables de css/tokens.css à chaque dessin
// (et au changement de thème, voir ecran.js). Les règles pures (fusion, infobulle en texte) sont dans logique.js.
import { construireTheme } from './logique.js';

const variable = (style, nom, secours) => (style.getPropertyValue(nom) || '').trim() || secours;

/** Valeurs de thème lues sur l'élément racine. */
export function lireValeursTheme(racine = document.documentElement) {
  const s = getComputedStyle(racine);
  const taille = parseFloat(variable(s, '--fs-petit', '12')) || 12;
  return {
    texte: variable(s, '--texte', '#ececee'),
    texte2: variable(s, '--texte2', '#b0aeb3'),
    trait: variable(s, '--bordure', '#ffffff1a'),
    traitFort: variable(s, '--bordure-forte', '#ffffff33'),
    palette: [variable(s, '--accent-trait', '#ecbc06'), variable(s, '--violet-clair', '#b98ee0'), variable(s, '--corail', '#fd6455'), variable(s, '--vert', '#3fbf7f'), variable(s, '--gris-lilas', '#b9adc9'), variable(s, '--lilas', '#e3cdee')],
    police: variable(s, '--police-texte', 'sans-serif'),
    taille,
  };
}

/** Textes français de base d'ECharts (mois, jours, description pour lecteurs d'écran). */
export const LANGUE_FR = Object.freeze({
  time: {
    month: ['janvier', 'février', 'mars', 'avril', 'mai', 'juin', 'juillet', 'août', 'septembre', 'octobre', 'novembre', 'décembre'],
    monthAbbr: ['janv.', 'févr.', 'mars', 'avr.', 'mai', 'juin', 'juil.', 'août', 'sept.', 'oct.', 'nov.', 'déc.'],
    dayOfWeek: ['dimanche', 'lundi', 'mardi', 'mercredi', 'jeudi', 'vendredi', 'samedi'],
    dayOfWeekAbbr: ['dim.', 'lun.', 'mar.', 'mer.', 'jeu.', 'ven.', 'sam.'],
  },
  legend: { selector: { all: 'Tout', inverse: 'Inverser' } },
  aria: { general: { withTitle: 'Ceci est un graphique intitulé « {title} »', withoutTitle: 'Ceci est un graphique' } },
});

/** Enregistre le thème et la langue (couleurs relues à chaque appel), puis crée le graphique dans `element`. */
export function creerGraphique(echarts, element) {
  echarts.registerLocale?.('FR', LANGUE_FR);
  echarts.registerTheme('pilotage', construireTheme(lireValeursTheme()));
  return echarts.init(element, 'pilotage', { renderer: 'canvas', locale: 'FR' });
}
