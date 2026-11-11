// Éléments d'écran partagés par les quatre écrans du module (Aujourd'hui, Posts, Relations, Import) : barre d'onglets, chargement, lien vers Buffer.
import { h, icone } from '../../os/ui.js';
import { barreOnglets } from '../../os/onglets.js';
import { ongletsDuModule } from '../../os/registre.js';
import { URL_BUFFER } from './logique.js';

/** Barre d'onglets du module : le menu n'a qu'une entrée « Réseaux sociaux », les écrans se rejoignent par cette barre. `actif` = route de l'écran affiché. */
export const ongletsReseauxSociaux = (actif) => barreOnglets({ onglets: ongletsDuModule('reseauxsociaux'), actif, etiquette: 'Écrans des réseaux sociaux' });

/** Rond de chargement (même rendu que la Veille). */
export const chargement = () => h('div', { class: 'chargement', role: 'status' }, h('span', { class: 'rond-chargement' }), h('span', { class: 'sr-only' }, 'Chargement'));

/** Lien vers Buffer, dans un nouvel onglet : Buffer reste le lieu où l'on écrit les posts. `principal` = le bouton jaune de la page. */
export function lienBuffer({ libelle = 'Ouvrir Buffer', principal = true } = {}) {
  return h('a', { class: `bouton ${principal ? 'bouton-principal' : 'bouton-secondaire'}`, href: URL_BUFFER, target: '_blank', rel: 'noopener noreferrer', dataset: { action: 'ouvrir-buffer' } },
    icone('external-link', { taille: 16 }), libelle);
}
