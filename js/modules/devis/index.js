// Module Devis (cadrage-devis.md) : montage et routes. Deux écrans : le Bordereau (articles) et la liste des devis ; l'éditeur de devis viendra ensuite.
// Routes : devis/bordereau, devis/liste (pas encore dans le menu : registre.js ne la déclare pas). Le module lit le CRM (étapes des affaires) : le CRM démarre avant lui (le module Devis dépend de « affaires », pas de « projets »).
import { vider } from '../../os/ui.js';
import { naviguer } from '../../os/router.js';
import * as D from './donnees.js';
import { rendreBordereau } from './bordereau.js';
import { rendreListeDevis } from './liste-ecran.js';
import { reglages as reglagesDuModule } from './reglages.js';

// Feuille de style propre au module, ajoutée au premier affichage (index.html reste inchangé).
function ajouterFeuille() {
  if (document.querySelector('link[data-devis]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL('../../../css/devis.css', import.meta.url).href;
  l.dataset.devis = '1';
  document.head.append(l);
}

export const actionsRapides = []; // pas de création depuis le bouton « + » pour l'instant

let montee = null; // { cle, quitter }

export function demarrer({ cheminBase = '' } = {}) {
  ajouterFeuille(); // aussi pour la page Réglages, qui montre une section du module
  D.demarrer(cheminBase);
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

const VUES = {
  liste: (conteneur) => rendreListeDevis(conteneur),
  bordereau: (conteneur) => rendreBordereau(conteneur),
};

export function afficher(conteneur, segs) {
  const [vue] = segs;
  if (!VUES[vue]) {
    naviguer('devis/bordereau', { remplacer: true });
    return quitter;
  }
  const cle = vue;
  if (montee?.cle === cle && conteneur.firstChild) return quitter;
  quitter();
  vider(conteneur);
  const arret = VUES[vue](conteneur);
  montee = { cle, quitter: typeof arret === 'function' ? arret : null };
  conteneur.scrollTop = 0;
  window.scrollTo?.(0, 0);
  return quitter;
}

/** Réglages du module (page Réglages > Devis) : une section, déclarée dans registre.js. */
export function reglages(page, ctx = {}) {
  return reglagesDuModule(page, ctx);
}

/** Pas de recherche globale pour ce module. */
export function rechercher() {
  return { groupes: [] };
}
