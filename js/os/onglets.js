// Barre d'onglets d'un module (coque). Le menu de gauche n'a qu'une entrée par module ; les écrans du module se rejoignent par cette barre,
// montrée en tête de chaque écran. Ce sont de vrais liens (adresse #/…, clic droit, signets) ; l'onglet actif porte aria-current="page".
// Rendu repris tel quel du module Maintenance (tableaudebord) : `classeBarre` et `classeOnglet` y gardent ses anciennes classes (td-onglets, td-onglet).
import { h } from './ui.js';
import { lien } from './router.js';

/**
 * @param {{ onglets: {route:string, libelle:string, id?:string}[], actif: string, etiquette: string, classeBarre?: string, classeOnglet?: string }} o
 *  `actif` = route de l'onglet actif ; `etiquette` = nom accessible de la barre (« Écrans de la veille »…).
 */
export function barreOnglets({ onglets, actif, etiquette, classeBarre = '', classeOnglet = '' }) {
  return h('nav', { class: `onglets ${classeBarre}`.trim(), 'aria-label': etiquette },
    ...onglets.map((t) => h('a', {
      class: `onglet ${classeOnglet}`.trim(), href: lien(t.route), dataset: { onglet: t.id ?? t.route.split('/').pop() }, 'aria-current': t.route === actif ? 'page' : null,
    }, t.libelle)));
}
