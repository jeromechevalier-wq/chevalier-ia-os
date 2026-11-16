// Module Console (phase 0) : outil d'exploitation, RÉSERVÉ à Jérôme (CLAUDE.md, docs/console.md). Routes : console/vue, console/filet.
// Chez Jérôme, les données sont à la racine de la base (console_filet). Le module n'est monté que pour son compte (js/main.js) ; le serveur recontrôle l'identité.
import { vider } from '../../os/ui.js';
import { naviguer } from '../../os/router.js';
import * as D from './donnees.js';
import { rendreVue, rendreFilet } from './ecran.js';
import { reglagesExportConsole } from './export.js';

export const actionsRapides = []; // rien à créer depuis l'écran

/** Réglages du module : une seule section, « Sauvegarde » (export des données). */
export function reglages(page) {
  reglagesExportConsole(page);
}

let montee = null;

export function demarrer({ compte, cheminBase = '' } = {}) {
  D.demarrer(compte, cheminBase);
}

export function arreter() {
  quitter();
  D.arreter();
}

function quitter() {
  montee?.();
  montee = null;
}

export function afficher(conteneur, segs) {
  const ecran = segs[0];
  if (ecran !== 'vue' && ecran !== 'filet') {
    naviguer('console/vue', { remplacer: true });
    return quitter;
  }
  quitter();
  vider(conteneur);
  montee = (ecran === 'vue' ? rendreVue : rendreFilet)(conteneur, segs.slice(1));
  conteneur.scrollTop = 0;
  return quitter;
}

/** Pas de recherche globale pour ce module. */
export function rechercher() {
  return { groupes: [] };
}
