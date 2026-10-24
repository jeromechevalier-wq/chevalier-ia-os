// Module Devis (cadrage-devis.md) : montage et routes. Trois écrans : le Bordereau (articles), la liste des devis et l'éditeur d'un devis.
// Routes : devis/bordereau, devis/liste, devis/liste/<id> (la liste avec la fiche d'un devis ouverte), devis/editeur (nouveau devis : choix de l'affaire), devis/editeur/<id> (non déclarée dans le menu : on y arrive par la liste). Le module lit le CRM (étapes des affaires) : le CRM démarre avant lui (le module Devis dépend de « affaires », pas de « projets »).
import { vider } from '../../os/ui.js';
import { naviguer } from '../../os/router.js';
import * as D from './donnees.js';
import { rendreBordereau } from './bordereau.js';
import { rendreListeDevis } from './liste-ecran.js';
import { rendreEditeurDevis } from './editeur-ecran.js';
import { reglages as reglagesDuModule } from './reglages.js';
import { retenirDevis } from './memoire.js';

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
  liste: (conteneur, segs) => rendreListeDevis(conteneur, segs[1] || null), // devis/liste/<id> : la liste avec la fiche de ce devis ouverte
  editeur: (conteneur, segs) => rendreEditeurDevis(conteneur, segs[1] || null),
  bordereau: (conteneur) => rendreBordereau(conteneur),
};

export function afficher(conteneur, segs) {
  const [vue] = segs;
  if (!VUES[vue]) {
    naviguer('devis/bordereau', { remplacer: true });
    return quitter;
  }
  if (vue === 'editeur') retenirDevis(segs[1]); // le Bordereau propose « Reprendre le devis en cours »
  const cle = vue === 'editeur' ? `editeur/${segs[1] ?? ''}` : vue; // un éditeur par devis
  if (montee?.cle === cle && conteneur.firstChild) { montee.surRoute?.(segs[1] || null); return quitter; } // la liste reste montée : seule la fiche change
  quitter();
  vider(conteneur);
  const arret = VUES[vue](conteneur, segs);
  montee = { cle, quitter: typeof arret === 'function' ? arret : null, surRoute: typeof arret?.surRoute === 'function' ? arret.surRoute : null };
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
