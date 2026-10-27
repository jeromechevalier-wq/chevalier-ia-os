// Menus de l'éditeur de devis : une petite fenêtre flottante (sur téléphone : une feuille collée en bas de l'écran) qui contient des entrées, des sous-menus
// qui se déplient sur place, des cases à cocher et des champs. Aucune règle métier ici : l'écran passe ce qu'il faut afficher et reçoit les clics.
// Une entrée pas encore prête est GRISÉE avec « bientôt disponible » (règle de docs/consignes-ui.md), jamais cachée.
import { h, icone } from '../../os/ui.js';

export const BIENTOT = 'bientôt disponible';
const LARGEUR_TELEPHONE = 700;
/** Un dataset sans valeur nulle (h() écrirait « null » sinon). */
export const donnees = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== null && v !== undefined));

/**
 * Ouvre une fenêtre flottante sous `ancre`. `construire(fermer)` rend le contenu (un nœud). Se ferme au clic extérieur, à Échap, ou par `fermer()` ;
 * le focus revient alors à `ancre`. Un seul menu à la fois. Rend la fonction de fermeture.
 */
export function ouvrirFenetreMenu(ancre, construire, { classe = '', nom = 'Menu', role = 'menu' } = {}) {
  document.querySelector('.menu-pop')?.remove();
  const menu = h('div', { class: `menu-pop menu-devis ${classe}`.trim(), role, 'aria-label': nom });
  let ferme = false;
  const fermer = () => {
    if (ferme) return;
    ferme = true;
    menu.remove();
    document.removeEventListener('pointerdown', surClicExterieur, true);
    document.removeEventListener('keydown', surTouche, true);
    ancre.setAttribute?.('aria-expanded', 'false');
    if (ancre.isConnected) ancre.focus?.();
  };
  function surClicExterieur(e) { if (!menu.contains(e.target) && !ancre.contains(e.target)) fermer(); }
  function surTouche(e) {
    if (e.key === 'Escape') { e.stopPropagation(); fermer(); return; }
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    if (/^(input|textarea|select)$/i.test(document.activeElement?.tagName ?? '')) return; // dans un champ, les flèches restent au champ
    e.preventDefault();
    const liste = [...menu.querySelectorAll('button:not(:disabled), input[type="checkbox"]:not(:disabled)')].filter((el) => el.offsetParent !== null); // pas les entrées d'un sous-menu replié
    const i = liste.indexOf(document.activeElement);
    liste[(i + (e.key === 'ArrowDown' ? 1 : -1) + liste.length) % liste.length]?.focus();
  }
  menu.append(construire(fermer));
  document.body.append(menu);
  if (window.innerWidth > LARGEUR_TELEPHONE) {
    const r = ancre.getBoundingClientRect();
    const l = menu.offsetWidth;
    const haut = Math.max(8, Math.min(r.bottom + 6, window.innerHeight - menu.offsetHeight - 8));
    menu.style.top = `${haut}px`;
    menu.style.maxHeight = `${window.innerHeight - haut - 8}px`; // un sous-menu qui se déplie ensuite fait défiler le menu au lieu de sortir de l'écran
    menu.style.left = `${Math.max(8, Math.min(r.right - l, window.innerWidth - l - 8))}px`;
  }
  ancre.setAttribute?.('aria-expanded', 'true');
  document.addEventListener('pointerdown', surClicExterieur, true);
  document.addEventListener('keydown', surTouche, true);
  (menu.querySelector('[data-focus-initial]') ?? menu.querySelector('button:not(:disabled), input:not(:disabled), select:not(:disabled)'))?.focus();
  return fermer;
}

/**
 * Contenu d'un menu. `entrees` : liste de
 *  - { libelle, icone?, action, danger?, desactive?, bientot? } : une entrée (`bientot: true` la grise avec « bientôt disponible») ;
 *  - { libelle, sous: [entrées] } : un sous-menu qui se déplie sur place ;
 *  - { titre } : un petit titre de groupe ; { separateur: true } ; { noeud } : un nœud déjà fabriqué (champ, liste…).
 * `fermer` : appelée après le choix d'une entrée (sauf `reste: true`, qui laisse le menu ouvert).
 */
export function contenuMenu(entrees, fermer) {
  const colonne = h('div', { class: 'menu-devis-liste' });
  for (const e of entrees) colonne.append(...elementsDe(e, fermer));
  return colonne;
}

function elementsDe(e, fermer) {
  if (e.separateur) return [h('div', { class: 'menu-pop-separateur', role: 'separator' })];
  if (e.texte !== undefined) return [h('div', { class: 'menu-pop-texte', role: 'presentation', dataset: { zone: 'menu-texte' } }, e.texte)]; // phrase d'explication d'une entrée grisée
  if (e.titre !== undefined) return [h('div', { class: 'menu-devis-titre', role: 'presentation' }, e.titre)];
  if (e.noeud) return [e.noeud];
  if (e.sous) {
    const sous = h('div', { class: 'menu-devis-sous', hidden: true }, contenuMenu(e.sous, fermer));
    const bouton = h('button', { type: 'button', role: 'menuitem', class: 'menu-pop-entree menu-devis-parent', 'aria-haspopup': 'menu', 'aria-expanded': 'false', dataset: donnees({ menu: e.cle }),
      onclick: () => { const ouvert = sous.hidden; sous.hidden = !ouvert; bouton.setAttribute('aria-expanded', String(ouvert)); } },
    e.icone ? icone(e.icone, { taille: 16 }) : null, h('span', { class: 'menu-devis-libelle' }, e.libelle), icone('chevron-right', { taille: 14, classe: 'menu-devis-fleche' }));
    return [bouton, sous];
  }
  const grise = Boolean(e.desactive || e.bientot);
  return [h('button', {
    type: 'button', role: 'menuitem', class: `menu-pop-entree${e.danger ? ' danger' : ''}`, disabled: grise, title: e.bientot ? `Ce choix est ${BIENTOT}.` : (e.titreInfo ?? null),
    dataset: donnees({ menu: e.cle, bientot: e.bientot ? 'oui' : null }),
    onclick: () => { if (!e.reste) fermer(); e.action?.(); },
  }, e.icone ? icone(e.icone, { taille: 16 }) : null, h('span', { class: 'menu-devis-libelle' }, e.libelle), e.bientot ? h('span', { class: 'menu-devis-bientot' }, BIENTOT) : null)];
}

/**
 * Une case à cocher du menu Options. `bientot` : grisée avec « bientôt disponible ». `info` : petite explication à droite (ex. « automatique »).
 * `surChangement(coche)` est appelée à chaque clic ; le menu reste ouvert.
 */
export function caseMenu({ libelle, cle, coche = false, bientot = false, desactive = false, info = null, surChangement = () => {} }) {
  const grise = bientot || desactive;
  const boite = h('input', { type: 'checkbox', checked: coche, disabled: grise, dataset: donnees({ option: cle }),
    onchange: (ev) => surChangement(ev.target.checked) });
  return h('label', { class: `menu-devis-case${grise ? ' grisee' : ''}`, title: bientot ? `Ce choix est ${BIENTOT}.` : null, dataset: donnees({ bientot: bientot ? 'oui' : null }) },
    boite, h('span', { class: 'menu-devis-libelle' }, libelle), bientot ? h('span', { class: 'menu-devis-bientot' }, BIENTOT) : (info ? h('span', { class: 'menu-devis-bientot' }, info) : null));
}
