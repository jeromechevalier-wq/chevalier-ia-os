// Module Achats « Tableau de bord 2 » (25/11/2026) : réservé à un seul compte (`seulJerome`, js/os/registre.js). Six onglets de graphiques et de tableaux LUS dans la base de l'espace (lecture seule, rien n'est écrit).
// Route : tableauachats/tableau. Aucune donnée dans Firebase. Réglages : une section « Sauvegarde » (export des factures lues).
import { vider } from '../../os/ui.js';
import { naviguer } from '../../os/router.js';
import { rendreEcran } from './ecran.js';
import { reglagesExportTableauAchats } from './export.js';

// Feuille de style propre au module, ajoutée au premier affichage (index.html reste inchangé).
function ajouterFeuille() {
  if (document.querySelector('link[data-tableauachats]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL('../../../css/tableauachats.css', import.meta.url).href;
  l.dataset.tableauachats = '1';
  document.head.append(l);
}

export const actionsRapides = []; // rien à créer depuis l'écran

/** Réglages du module : une seule section, « Sauvegarde » (export des factures lues). */
export function reglages(page) {
  reglagesExportTableauAchats(page);
}

let montee = null;

export function demarrer() { /* aucune donnée à écouter : tout est lu dans la base à l'ouverture de l'écran */ }

export function arreter() {
  quitter();
}

function quitter() {
  montee?.();
  montee = null;
}

export function afficher(conteneur, segs) {
  if (segs[0] !== 'tableau') {
    naviguer('tableauachats/tableau', { remplacer: true });
    return quitter;
  }
  quitter();
  vider(conteneur);
  ajouterFeuille();
  montee = rendreEcran(conteneur);
  conteneur.scrollTop = 0;
  return quitter;
}

/** Pas de recherche globale pour ce module. */
export function rechercher() {
  return { groupes: [] };
}
