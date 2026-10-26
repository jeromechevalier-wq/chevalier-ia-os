// Retour visuel pendant que le serveur fabrique le PDF (« Télécharger le PDF », « Imprimer » dans l'éditeur).
// Le serveur ne donne pas d'étapes : on montre donc un indicateur animé et un texte, jamais un faux pourcentage.
// Une pastille discrète (role="status", annoncée aux lecteurs d'écran) reste en bas de l'écran tant que le serveur travaille ; le bouton « … » passe à aria-busy.
import { h } from '../../os/ui.js';

export const LIBELLE_PDF_FABRICATION = 'Fabrication du PDF…';
export const DETAIL_PDF_FABRICATION = 'Cela peut prendre quelques secondes, surtout la première fois.';

/** Affiche la pastille d'attente ; rend la fonction qui l'enlève. `bouton` : le bouton « … » (marqué occupé). */
export function afficherAttentePdf({ bouton = null, racine = document.body } = {}) {
  const pastille = h('div', { class: 'pdf-attente', role: 'status', 'aria-live': 'polite', dataset: { zone: 'pdf-attente' } },
    h('span', { class: 'rond-chargement', 'aria-hidden': 'true' }),
    h('span', { class: 'pdf-attente-textes' }, h('strong', {}, LIBELLE_PDF_FABRICATION), h('span', { class: 'texte-discret' }, DETAIL_PDF_FABRICATION)));
  racine.append(pastille);
  if (bouton) { bouton.setAttribute('aria-busy', 'true'); bouton.dataset.occupe = '1'; }
  return () => {
    pastille.remove();
    if (bouton) { bouton.removeAttribute('aria-busy'); delete bouton.dataset.occupe; }
  };
}
