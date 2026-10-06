// Module Projets (version 2.1) : montage, routes, actions rapides et recherche globale.
// Routes : projets/projets[/id]. Le module lit les données du CRM (personnes, organisations, affaires) : le CRM démarre avant lui.
import { vider } from '../../os/ui.js';
import { naviguer } from '../../os/router.js';
import * as D from './donnees.js';
import * as CRM from '../crm/donnees.js';
import * as L from '../crm/logique.js';
import { rendreProjets, ouvrirCreationProjet } from './projets.js';
import { rendreFicheProjet } from './fiche-projet.js';

const VUES = {
  projets: (conteneur, id) => (id ? rendreFicheProjet(conteneur, id) : rendreProjets(conteneur)),
};

/** Entrées du bouton "+" de la barre supérieure. */
export const actionsRapides = [
  { id: 'projet', libelle: 'Projet', icone: 'folder-kanban', action: () => ouvrirCreationProjet() },
];

let montee = null; // { cle, quitter }

export function demarrer() {
  D.demarrer();
}

export function arreter() {
  quitter();
  D.arreter();
}

function quitter() {
  montee?.quitter?.();
  montee = null;
  document.querySelector('.menu-pop')?.remove();
}

export function afficher(conteneur, segs) {
  const [vue, id] = segs;
  if (!VUES[vue]) {
    naviguer('projets/projets', { remplacer: true });
    return quitter;
  }
  const cle = `${vue}/${id || ''}`;
  if (montee?.cle === cle && conteneur.firstChild) return quitter;
  quitter();
  vider(conteneur);
  const arret = VUES[vue](conteneur, id);
  montee = { cle, quitter: typeof arret === 'function' ? arret : null };
  conteneur.scrollTop = 0;
  window.scrollTo?.(0, 0);
  return quitter;
}

// ---------------------------------------------------------------- recherche globale

/** Résultats groupés pour la recherche de la barre supérieure : { groupes: [{ titre, resultats }] }. */
export function rechercher(saisie) {
  const projets = D.etat.projets.filter((p) => !p.archive).map((p) => {
    const pers = CRM.personne(p.personneId);
    const org = CRM.organisation(p.organisationId);
    return { id: p.id, libelle: p.titre, sousTitre: [org?.nom, pers?.nom].filter(Boolean).join(' · '), extra: [org?.nom, pers?.nom].filter(Boolean), chemin: `projets/projets/${p.id}` };
  });
  const resultats = L.rechercherSuggestions(saisie, projets, {}).resultats;
  return { groupes: resultats.length ? [{ titre: 'Projets', resultats }] : [] };
}
