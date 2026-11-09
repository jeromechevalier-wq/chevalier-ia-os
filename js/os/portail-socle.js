// Écrans du socle commun (fiches Personnes et Organisations) servis DANS le portail devis seul, même quand le module Affaires n'est pas actif (09/11/2026).
// Le menu les appelle « Clients » (js/os/portail.js) ; ce sont les mêmes écrans que Personnes et Organisations : le socle est démarré par la coque avant les modules.
// Aucune donnée nouvelle, aucun droit : les règles Firestore décident, comme avant.
import { rendrePersonnes } from '../modules/crm/personnes.js';
import { rendreOrganisations } from '../modules/crm/organisations.js';
import { rendreFichePersonne } from '../modules/crm/fiche-personne.js';
import { rendreFicheOrganisation } from '../modules/crm/fiche-organisation.js';

const RENDUS = {
  personnes: (conteneur, id) => (id ? rendreFichePersonne(conteneur, id, { clients: true }) : rendrePersonnes(conteneur, { clients: true })), // dans le portail, l'écran s'appelle « Clients »
  organisations: (conteneur, id) => (id ? rendreFicheOrganisation(conteneur, id) : rendreOrganisations(conteneur)),
};

/** Dessine l'écran du socle ({ vue, id } de ecranSocleDeRoute) ; rend la fonction d'arrêt de l'écran, ou null. */
export function monterEcranSocle(conteneur, { vue, id }) {
  const arret = RENDUS[vue](conteneur, id);
  return typeof arret === 'function' ? arret : null;
}
