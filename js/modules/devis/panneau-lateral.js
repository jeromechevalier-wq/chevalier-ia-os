// Panneau collé à droite de l'éditeur et de la visualisation d'un devis (utilisé par « Options » et « Historique ») : le devis se décale à côté (jamais caché),
// la croix ou Échap le ferment, le focus revient au bouton qui l'a ouvert. Un seul panneau de ce type à la fois : l'écran ferme l'autre avant d'ouvrir celui-ci.
import { h, icone } from '../../os/ui.js';

/**
 * `racine` : la page du devis. `options` : { id, titre, nom (aria-label), zone (data-zone), actionFermer (data-action de la croix), nomCroix, contenu: Node,
 * bouton (le bouton qui ouvre : aria-expanded), ancre (qui reprend le focus), surFermeture() }. Rend { fermer, noeud }.
 */
export function ouvrirPanneauLateral(racine, { id, titre, nom, zone, actionFermer, nomCroix, contenu, bouton = null, ancre = null, surFermeture = () => {}, focus = true }) {
  const croix = h('button', { type: 'button', class: 'bouton-icone options-fermer', dataset: { action: actionFermer }, 'aria-label': nomCroix, onclick: () => fermer() }, icone('x', { taille: 18 }));
  const panneau = h('aside', { class: 'options-panneau', id, role: 'complementary', 'aria-label': nom, dataset: { zone } },
    h('header', { class: 'options-tete' }, h('h2', { class: 'options-titre' }, titre), croix),
    h('div', { class: 'options-corps' }, contenu));
  let ferme = false;
  const surTouche = (e) => {
    if (!racine.isConnected) { fermer(); return; }
    if (e.key !== 'Escape' || e.defaultPrevented || document.querySelector('dialog[open], [role="dialog"], .menu-pop')) return;
    e.stopPropagation();
    fermer();
  };
  function fermer({ rendreFocus = true } = {}) {
    if (ferme) return;
    ferme = true;
    document.removeEventListener('keydown', surTouche, true);
    panneau.remove();
    racine.classList.remove('avec-options');
    bouton?.setAttribute('aria-expanded', 'false');
    surFermeture();
    if (rendreFocus && ancre?.isConnected) ancre.focus?.();
  }
  document.addEventListener('keydown', surTouche, true);
  racine.append(panneau);
  racine.classList.add('avec-options');
  bouton?.setAttribute('aria-expanded', 'true');
  // Comme avant pour Options : le premier champ du corps ; à défaut (Historique), la première version cliquable, sinon la croix.
  if (focus) (panneau.querySelector('.options-corps input:not(:disabled), .options-corps select') ?? panneau.querySelector('.options-corps button:not(:disabled)') ?? croix).focus();
  return { fermer, noeud: panneau };
}
