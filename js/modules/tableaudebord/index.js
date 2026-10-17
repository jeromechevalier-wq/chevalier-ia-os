// Module Tableau de bord (étape 2 : écrans en lecture seule) : état des indicateurs de surveillance (clés, plus tard sauvegardes, finances, stocks).
// Routes : tableaudebord/general, tableaudebord/technique ; tableaudebord/finance et tableaudebord/stocks existent aussi (onglets montrés seulement
// si un indicateur les porte). Présent à la racine et chez les clients qui l'ont activé ; les données se lisent sous le chemin de base de la coque.
import { vider } from '../../os/ui.js';
import { naviguer } from '../../os/router.js';
import * as D from './donnees.js';
import { rendreTableau } from './ecran.js';

const ECRANS = ['general', 'technique', 'finance', 'stocks'];

// Feuille de style propre au module, ajoutée au premier affichage (index.html reste inchangé).
function ajouterFeuille() {
  if (document.querySelector('link[data-tableaudebord]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL('../../../css/tableaudebord.css', import.meta.url).href;
  l.dataset.tableaudebord = '1';
  document.head.append(l);
}

export const actionsRapides = []; // rien à créer depuis l'écran : le tableau de bord se lit

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
  if (!ECRANS.includes(ecran)) {
    naviguer('tableaudebord/general', { remplacer: true });
    return quitter;
  }
  if (montee && ecranMonte === ecran && conteneur.firstChild) return quitter;
  ajouterFeuille();
  quitter();
  vider(conteneur);
  montee = { quitter: rendreTableau(conteneur, ecran) };
  ecranMonte = ecran;
  conteneur.scrollTop = 0;
  return quitter;
}

/** Pas de recherche globale pour ce module. */
export function rechercher() {
  return { groupes: [] };
}
