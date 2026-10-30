// Pastille de statut d'un devis (Brouillon, Finalisé, Envoyé, Devis signé, Devis refusé, Devis remplacé, Expiré) : la MÊME dans la liste et dans l'en-tête de l'éditeur / de la visualisation.
import { h } from '../../os/ui.js';
import * as Li from './liste.js';

/** Met à jour une pastille déjà créée (texte, couleur, statut) : l'en-tête garde son élément et le change quand le devis change. */
export function appliquerPastilleStatut(el, d, aujourdhui) {
  const s = Li.statutAffiche(d, aujourdhui);
  el.className = `pastille-statut statut-devis-${s}`;
  el.style.setProperty('--couleur', Li.COULEURS_STATUT[s] ?? '#8d8993');
  el.dataset.statut = s;
  el.textContent = Li.libelleStatut(s);
  return el;
}

export function pastilleStatutDevis(d, aujourdhui) {
  return appliquerPastilleStatut(h('span', { dataset: { valeur: 'statut' } }), d, aujourdhui);
}
