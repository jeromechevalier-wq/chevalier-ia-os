// Menu de TVA du Bordereau : une liste déroulante qui MONTRE TOUJOURS tous les choix, comme le menu d'unités, avec « Autre… » pour écrire un taux libre.
// Aucune règle métier ici : la validation du taux (0 à 100) reste celle de articles.js, qui répond par un message d'erreur.
import { h } from '../../os/ui.js';
import { formaterTaux } from './articles.js';

const AUTRE = '__autre__';
// Les taux proposés, dans l'ordre d'affichage.
export const TAUX_MENU = [20, 10, 5.5, 2.1, 0];
const texteTaux = (t) => String(t).replace('.', ',');

/**
 * `valeur` : le taux actuel (nombre, ou vide = pas de taux propre) ; `tauxDevis` : le taux par défaut du devis, écrit dans le premier choix ;
 * `surChoix` : appelée quand on choisit un taux de la liste (pas « Autre… », qui attend le texte). Renvoie un `<div>` qui se comporte comme un champ :
 * `.value` (« » = taux du devis, sinon le taux écrit avec une virgule), `.focus()`.
 */
export function menuTaux({ valeur = null, tauxDevis = null, id = null, libelle = 'TVA', champ = 'tauxTva', surChoix = null } = {}) {
  const actuelle = valeur === null || valeur === undefined || valeur === '' ? '' : texteTaux(valeur);
  // Un taux déjà enregistré qui n'est pas dans la liste (ex. 7) reste choisi, juste avant « Autre… ».
  const hors = actuelle && !TAUX_MENU.some((t) => texteTaux(t) === actuelle) ? [actuelle] : [];
  const liste = h('select', { class: 'champ champ-taux-menu', id, 'aria-label': libelle, dataset: { champ } },
    h('option', { value: '', selected: actuelle === '' }, tauxDevis === null ? 'Sinon, le taux du devis' : `Sinon, le taux du devis (${formaterTaux(tauxDevis)})`),
    [...TAUX_MENU.map(texteTaux), ...hors].map((t) => h('option', { value: t, selected: t === actuelle }, `${t} %`)),
    h('option', { value: AUTRE }, 'Autre…'));
  const libre = h('input', { type: 'text', class: 'champ champ-taux-libre', inputmode: 'decimal', autocomplete: 'off', placeholder: 'Taux en % (0 à 100)', 'aria-label': `${libelle} (autre)`, dataset: { champ: `${champ}-libre` }, hidden: true });
  const element = h('div', { class: 'menu-unite menu-taux' }, liste, libre);
  liste.addEventListener('change', () => {
    const autre = liste.value === AUTRE;
    libre.hidden = !autre;
    if (autre) { libre.focus(); return; }
    if (surChoix) surChoix(element.value);
  });
  Object.defineProperty(element, 'value', {
    // « Autre… » sans rien d'écrit ne change rien : on garde le taux d'avant.
    get: () => (liste.value === AUTRE ? (libre.value.trim() || actuelle) : liste.value),
    set: (v) => {
      const texte = String(v ?? '');
      if ([...liste.options].some((o) => o.value === texte)) { liste.value = texte; libre.hidden = true; } else { liste.value = AUTRE; libre.hidden = false; libre.value = texte; }
    },
  });
  element.focus = () => (libre.hidden ? liste : libre).focus();
  return element;
}
