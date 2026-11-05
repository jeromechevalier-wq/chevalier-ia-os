// Barre commune des écrans de liste (règle de Jérôme, 05/11/2026, docs/consignes-ui.md) :
// ligne du haut = titre + compteur à gauche, actions à droite ; ligne du bas = recherche avec loupe, Filtres, filtres enregistrés,
// boutons de vue (avec « Archives » dedans), puis le tri. Les écrans reçoivent des ÉLÉMENTS déjà construits : le composant ne connaît ni les critères ni les listes.
import { h, icone } from '../../os/ui.js';

/**
 * Champ de recherche avec loupe. `libelleAria` (nom lu par les lecteurs d'écran) peut différer du `placeholder`.
 * Renvoie { element, champ } : `champ` sert à remettre la valeur à jour (Tout effacer).
 */
export function champRecherche({ placeholder, libelleAria = placeholder, valeur = '', surSaisie }) {
  const champ = h('input', { class: 'champ', type: 'search', 'aria-label': libelleAria, placeholder, autocomplete: 'off', value: valeur, oninput: (e) => surSaisie(e.target.value) });
  return { champ, element: h('div', { class: 'champ-avec-icone' }, icone('search', { taille: 16 }), champ) };
}

/** Ligne du haut : `titre` (chaîne ou élément), `compteur`, `retour` (flèche « ‹ … » avant le titre), `actions` (boutons à droite). */
export function enteteListe({ titre, compteur = null, retour = null, actions = [] }) {
  return h('header', { class: 'page-tete' },
    h('div', {}, retour, typeof titre === 'string' ? h('h1', {}, titre) : titre, compteur),
    actions.length ? h('div', { class: 'page-actions' }, actions) : null);
}

/** Groupe de boutons de vue : `vues` = [[id, libellé, icône]], `courante` = id actif. Même structure que les anciennes bascules (data-vue, aria-pressed). */
export function basculeVues({ vues, courante, surChangement }) {
  return h('div', { class: 'bascule-vues', role: 'group', 'aria-label': 'Vue' }, vues.map(([id, libelle, ic]) => h('button', {
    type: 'button', class: `bascule-vue${courante === id ? ' actif' : ''}`, 'aria-pressed': String(courante === id), dataset: { vue: id },
    onclick: () => surChangement(id),
  }, icone(ic, { taille: 16 }), h('span', {}, libelle))));
}

/**
 * Ligne du bas. `recherche` = options de `champRecherche` ; `elements` = { filtres, signet?, vues?, pastilles? } (éléments DOM) ; `tri` (élément) à droite ; `apres` : éléments en fin de barre.
 * Renvoie { element, champ }. Structure gardée : .barre-affaires > .barre-filtres > .barre-filtres-ligne (+ .pastilles-actives) ; le bouton « Filtres » reste le premier bouton de la ligne.
 */
export function barreListe({ recherche, elements = {}, tri = null, apres = [] }) {
  const { champ, element: boite } = champRecherche(recherche);
  const { filtres, signet = null, vues = null, pastilles = null } = elements;
  const element = h('div', { class: 'barre-affaires' },
    h('div', { class: 'barre-filtres' }, h('div', { class: 'barre-filtres-ligne' }, boite, filtres, signet, vues), pastilles),
    tri, apres);
  return { element, champ };
}
