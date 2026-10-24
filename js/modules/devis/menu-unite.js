// Menu d'unités du Bordereau : une liste déroulante qui MONTRE TOUJOURS toutes les unités proposées (l'ancienne liste de suggestions ne montrait que celles qui
// ressemblaient au texte déjà écrit : avec « u » dans le champ, seules « u » et « jour » apparaissaient), et une dernière entrée « Autre… » pour écrire sa propre unité.
// Aucune règle métier ici : la liste et la longueur maximale viennent de articles.js.
import { h } from '../../os/ui.js';
import { UNITES_PROPOSEES, LIMITES } from './articles.js';

const AUTRE = '__autre__';

/**
 * `valeur` : l'unité actuelle ; `id` : identifiant du menu ; `libelle` : son nom pour les lecteurs d'écran ; `surChoix` : appelée quand on choisit une unité de la liste
 * (pas « Autre… », qui attend le texte). Renvoie un élément `<div>` qui se comporte comme un champ : `.value` (l'unité choisie ou écrite), `.focus()`.
 */
export function menuUnite({ valeur = '', id = null, libelle = 'Unité', champ = 'unite', surChoix = null, verrouille = false } = {}) {
  const actuelle = String(valeur ?? '');
  // Une unité déjà enregistrée qui n'est plus dans la liste (ancienne ou écrite à la main) reste choisie, juste avant « Autre… ».
  const hors = actuelle && !UNITES_PROPOSEES.includes(actuelle) ? [actuelle] : [];
  const liste = h('select', { class: 'champ champ-unite-menu', id, 'aria-label': libelle, dataset: { champ } },
    [...UNITES_PROPOSEES, ...hors].map((u) => h('option', { value: u, selected: u === actuelle }, u)),
    h('option', { value: AUTRE }, 'Autre…'));
  const libre = h('input', { type: 'text', class: 'champ champ-unite-libre', maxlength: LIMITES.unite, autocomplete: 'off', placeholder: 'Ton unité', 'aria-label': `${libelle} (autre)`, dataset: { champ: `${champ}-libre` }, hidden: true });
  // Verrouillé : l'unité vient de l'article du Bordereau (c'est à la création de l'article qu'on la choisit), on la montre sans pouvoir la changer.
  if (verrouille) { liste.disabled = true; liste.title = 'L’unité vient du Bordereau : elle se choisit quand on crée l’article.'; liste.querySelector(`option[value="${AUTRE}"]`)?.remove(); }
  const element = h('div', { class: 'menu-unite' }, liste, libre);
  liste.addEventListener('change', () => {
    const autre = liste.value === AUTRE;
    libre.hidden = !autre;
    if (autre) { libre.focus(); return; }
    if (surChoix) surChoix(element.value);
  });
  Object.defineProperty(element, 'value', {
    // « Autre… » sans rien d'écrit ne change rien : on garde l'unité d'avant.
    get: () => (liste.value === AUTRE ? (libre.value.trim() || actuelle) : liste.value),
    set: (v) => {
      const texte = String(v ?? '');
      if ([...liste.options].some((o) => o.value === texte)) { liste.value = texte; libre.hidden = true; } else { liste.value = AUTRE; libre.hidden = false; libre.value = texte; }
    },
  });
  element.focus = () => (libre.hidden ? liste : libre).focus();
  return element;
}
