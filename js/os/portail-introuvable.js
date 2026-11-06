// Bloc « Page introuvable » du portail devis seul : le MÊME aux deux entrées (chez Jérôme, js/main.js ; chez un client, js/os/espace-modules.js).
// Deux liens : « Retour à l'accueil » (accueil du portail, ou espace complet quand le portail est vide) et, si l'écran demandé existe dans l'espace complet,
// « Ouvrir dans l'espace complet » (même route sans le préfixe du portail). Les deux liens marqués data-hors-prefixe quand ils sortent du portail.
import { h, icone } from './ui.js';

export function blocIntrouvablePortail({ retourHref, retourHorsPortail = false, completHref = null }) {
  const lienRetour = h('a', { class: 'bouton bouton-principal', href: retourHref, dataset: { action: 'retour-accueil', ...(retourHorsPortail ? { horsPrefixe: '' } : {}) } }, icone('house', { taille: 16 }), "Retour à l'accueil");
  const lienComplet = completHref
    ? h('a', { class: 'bouton bouton-secondaire', href: completHref, dataset: { action: 'ouvrir-espace-complet', horsPrefixe: '' } }, icone('layout-dashboard', { taille: 16 }), "Ouvrir dans l'espace complet")
    : null;
  return h('div', { class: 'page-introuvable' },
    h('h1', {}, 'Page introuvable'),
    h('p', { class: 'aide' }, "Cette page n'existe pas dans le portail devis."),
    h('div', { class: 'actions-introuvable' }, lienRetour, lienComplet));
}
