// Module Automatisations (chantier 14, anciennement « journal » ; ne pas confondre avec l'écran « Journal » du CRM) : historique des exécutions
// des workflows n8n, en lecture seule (automatisations/historique), et file « À valider » des propositions des workflows (automatisations/a-valider). Présent chez Jérôme (racine) et chez les clients qui l'ont activé.
import { vider } from '../../os/ui.js';
import { naviguer } from '../../os/router.js';
import * as D from './donnees.js';
import { rendreHistorique } from './ecran.js';
import { rendreAValider } from './a-valider.js';

// Feuille de style propre au module, ajoutée au premier affichage (index.html du CRM reste inchangé).
function ajouterFeuille() {
  if (document.querySelector('link[data-automatisations]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL('../../../css/automatisations.css', import.meta.url).href;
  l.dataset.automatisations = '1';
  document.head.append(l);
}

export const actionsRapides = []; // rien à créer depuis l'écran : l'historique se lit

let montee = null;

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
}

export function afficher(conteneur, segs) {
  const ecran = segs[0] === 'a-valider' ? 'a-valider' : segs[0] === 'historique' ? 'historique' : null;
  if (!ecran) {
    naviguer('automatisations/historique', { remplacer: true });
    return quitter;
  }
  if (montee && montee.ecran === ecran && conteneur.firstChild) return quitter;
  ajouterFeuille();
  quitter();
  vider(conteneur);
  montee = { ecran, quitter: (ecran === 'a-valider' ? rendreAValider : rendreHistorique)(conteneur) };
  conteneur.scrollTop = 0;
  return quitter;
}

/** Pas de recherche globale pour ce module. */
export function rechercher() {
  return { groupes: [] };
}
