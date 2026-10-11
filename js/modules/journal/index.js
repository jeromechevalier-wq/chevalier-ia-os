// Module Journal d'activité (chantier 14) : historique des exécutions des workflows n8n du client, en lecture seule.
// Route : journal/historique. Réservé aux clients de la plateforme (le CRM de Jérôme ne le monte pas : registre.js, chezJerome: false).
import { vider } from '../../os/ui.js';
import { naviguer } from '../../os/router.js';
import * as D from './donnees.js';
import { rendreHistorique } from './ecran.js';

// Feuille de style propre au module, ajoutée au premier affichage (index.html du CRM reste inchangé).
function ajouterFeuille() {
  if (document.querySelector('link[data-journal]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL('../../../css/journal.css', import.meta.url).href;
  l.dataset.journal = '1';
  document.head.append(l);
}

export const actionsRapides = []; // rien à créer depuis l'écran : le journal se lit

let montee = null;

export function demarrer({ compte, cheminBase = '' } = {}) {
  if (!cheminBase) throw new Error('Le module Journal n’existe que chez un client (clients/<client>)');
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
  if (segs[0] !== 'historique') {
    naviguer('journal/historique', { remplacer: true });
    return quitter;
  }
  if (montee && conteneur.firstChild) return quitter;
  ajouterFeuille();
  quitter();
  vider(conteneur);
  montee = { quitter: rendreHistorique(conteneur) };
  conteneur.scrollTop = 0;
  return quitter;
}

/** Pas de recherche globale pour ce module. */
export function rechercher() {
  return { groupes: [] };
}
