// D'où l'on vient quand on ouvre un devis, pour que la flèche « Retour » de l'éditeur ramène à la même page (fiche d'une affaire, MÊME onglet) et non toujours à la liste des devis.
// La route précédente vient du routeur (routePrecedente). On ne la retient que si elle est HORS du module Devis : passer de l'éditeur à la visualisation, ou ajouter un ouvrage, ne change donc pas l'origine.
// Mémoire de la page seulement : un rechargement ou une ouverture directe par adresse = origine inconnue = retour à la liste des devis.
import { routePrecedente, naviguer, lien } from '../../os/router.js';
import { ongletOuvertDeAffaire, demanderOngletAffaire } from '../crm/activites.js';

export const ROUTE_LISTE = 'devis/liste';
let origine = null; // { route, affaireId?, onglet? }

const dansDevis = (route) => route === 'devis' || route.startsWith('devis/');

/** Pure : l'origine à retenir pour une route précédente, ou null. `ongletDe(affaireId)` : l'onglet ouvert sur cette fiche. */
export function origineDepuis(route, ongletDe = () => 'activite') {
  if (!route || dansDevis(route)) return null;
  const m = /^crm\/affaires\/([^/]+)$/.exec(route);
  if (!m) return { route };
  const affaireId = m[1];
  return { route, affaireId, onglet: ongletDe(affaireId) };
}

/** À appeler à chaque affichage d'un écran du module : `ecran` = 'editeur' | 'voir' | 'liste' | 'bordereau'. */
export function noterArrivee(ecran) {
  if (ecran !== 'editeur' && ecran !== 'voir') { origine = null; return; } // la liste et le Bordereau sont leur propre origine
  const avant = routePrecedente();
  if (dansDevis(avant)) return; // éditeur <-> visualisation : l'origine reste celle d'avant
  origine = origineDepuis(avant, ongletOuvertDeAffaire);
}

/** Où la flèche « Retour » mène : la route d'origine, ou la liste des devis. */
export function routeRetour() { return origine?.route ?? ROUTE_LISTE; }

/** Adresse (#/…) de la flèche « Retour », préfixe du client compris. */
export function lienRetour() { return lien(routeRetour()); }

/** Suit la flèche « Retour » : rouvre la fiche de l'affaire sur le même onglet, ou la liste des devis. */
export function retourner() {
  if (origine?.affaireId && origine.onglet) demanderOngletAffaire(origine.affaireId, origine.onglet);
  naviguer(routeRetour());
}

/** Oublie l'origine (arrêt du module). */
export function oublierOrigine() { origine = null; }
