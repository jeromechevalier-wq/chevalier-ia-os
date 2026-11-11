// Écran « Import » du module Réseaux sociaux : pour l'instant un écran d'attente (l'écran définitif le remplace, sans toucher aux autres fichiers).
import { h } from '../../os/ui.js';
import { enteteListe } from '../crm/barre-liste.js';
import { etatVide } from '../crm/composants.js';
import { ongletsReseauxSociaux } from './commun.js';

/** Filtres mémorisés jusqu'au rechargement de la page : remis à zéro à la déconnexion (rien à remettre à zéro tant que l'écran est vide). */
export function oublierFiltresImport() {}

export function rendreImport(conteneur) {
  conteneur.append(h('div', { class: 'page page-liste page-reseauxsociaux' },
    enteteListe({ titre: 'Import' }), ongletsReseauxSociaux('reseauxsociaux/import'), etatVide('Cet écran arrive bientôt.')));
  return function quitter() {};
}
