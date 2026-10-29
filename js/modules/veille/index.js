// Module Veille (étape 1) : ce que la veille a détecté (contenus), ses résumés et les sources suivies, en lecture seule.
// Routes : veille/contenus, veille/sources. Chez Jérôme, les données sont à la racine de la base (veille_sources, veille_contenus, veille_resumes).
import { vider } from '../../os/ui.js';
import { naviguer } from '../../os/router.js';
import * as D from './donnees.js';
import { rendreContenus, rendreSources } from './ecran.js';
import { reglagesExportVeille } from './export.js';

// Feuille de style propre au module, ajoutée au premier affichage (index.html reste inchangé).
function ajouterFeuille() {
  if (document.querySelector('link[data-veille]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL('../../../css/veille.css', import.meta.url).href;
  l.dataset.veille = '1';
  document.head.append(l);
}

export const actionsRapides = []; // rien à créer depuis l'écran : la veille se lit

/** Réglages du module : une seule section, « Sauvegarde » (export des données). */
export function reglages(page) {
  reglagesExportVeille(page);
}

let montee = null;
let ecranMonte = '';

export function demarrer({ compte, cheminBase = '' } = {}) {
  D.demarrer(compte, cheminBase);
}

export function arreter() {
  quitter();
  D.arreter();
}

function quitter() {
  montee?.quitter?.();
  montee = null;
  ecranMonte = '';
}

export function afficher(conteneur, segs) {
  const ecran = segs[0];
  if (ecran !== 'contenus' && ecran !== 'sources') {
    naviguer('veille/contenus', { remplacer: true });
    return quitter;
  }
  if (montee && ecranMonte === ecran && conteneur.firstChild) return quitter;
  ajouterFeuille();
  quitter();
  vider(conteneur);
  montee = { quitter: (ecran === 'contenus' ? rendreContenus : rendreSources)(conteneur) };
  ecranMonte = ecran;
  conteneur.scrollTop = 0;
  return quitter;
}

/** Pas de recherche globale pour ce module. */
export function rechercher() {
  return { groupes: [] };
}
