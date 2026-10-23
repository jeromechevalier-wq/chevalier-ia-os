// Barre d'onglets d'un module (coque). Le menu de gauche n'a qu'une entrée par module ; les écrans du module se rejoignent par cette barre,
// montrée en tête de chaque écran. Ce sont de vrais liens (adresse #/…, clic droit, signets) ; l'onglet actif porte aria-current="page".
// Rendu repris tel quel du module Maintenance (tableaudebord) : `classeBarre` et `classeOnglet` y gardent ses anciennes classes (td-onglets, td-onglet).
// Pastille facultative : un onglet peut porter `badge` (nombre, affiché « (3) » ; « (9+) » au-delà de 9 ; rien à 0). Avec `module`, l'onglet que le registre désigne
// (champ `badge.ecran`) suit EN DIRECT le nombre annoncé par la coque (js/os/badges.js).
import { h } from './ui.js';
import { lien } from './router.js';
import { badgeDuModule } from './registre.js';
import { badgeDe, surBadge, texteBadge, nombreValide, phraseBadge } from './badges.js';

/**
 * @param {{ onglets: {route:string, libelle:string, id?:string, badge?:number}[], actif: string, etiquette: string, classeBarre?: string, classeOnglet?: string, module?: string }} o
 *  `actif` = route de l'onglet actif ; `etiquette` = nom accessible de la barre (« Écrans de la veille »…) ; `module` = identifiant du module (pastille en direct).
 */
export function barreOnglets({ onglets, actif, etiquette, classeBarre = '', classeOnglet = '', module = null }) {
  const declare = module ? badgeDuModule(module) : null;
  const pastilles = []; // [{ el, route }] : les pastilles qui suivent le registre
  const fabriquer = (t) => {
    const lienOnglet = h('a', {
      class: `onglet ${classeOnglet}`.trim(), href: lien(t.route), dataset: { onglet: t.id ?? t.route.split('/').pop() }, 'aria-current': t.route === actif ? 'page' : null,
    }, t.libelle);
    const suit = declare && t.route === declare.ecran;
    if (suit || t.badge !== undefined) {
      const el = h('span', { class: 'onglet-badge', dataset: { role: 'badge-onglet' } });
      lienOnglet.append(el);
      const poser = (n) => {
        el.textContent = n > 0 ? ` (${texteBadge(n)})` : '';
        if (n > 0 && suit) el.title = phraseBadge(n, declare.texte);
        else el.removeAttribute('title');
      };
      poser(suit ? badgeDe(module) : nombreValide(t.badge));
      if (suit) pastilles.push({ poser });
    }
    return lienOnglet;
  };
  const barre = h('nav', { class: `onglets ${classeBarre}`.trim(), 'aria-label': etiquette }, ...onglets.map(fabriquer));
  if (pastilles.length) {
    const arret = surBadge((id) => {
      if (id !== module) return;
      if (!barre.isConnected) { arret(); return; } // la page a changé : plus personne ne regarde cette barre
      for (const p of pastilles) p.poser(badgeDe(module));
    });
  }
  return barre;
}
