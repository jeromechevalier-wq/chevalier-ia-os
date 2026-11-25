// Module Achats « Factures » (25/11/2026, PR 8a) : réservé à un seul compte (`seulJerome`, js/os/registre.js). Liste et Kanban des factures lus dans la base de l'espace,
// pastilles de contrôle, archivage et désarchivage (par les actions métier), favoris, export. L'écran « Examiner » une facture arrive à l'étape suivante (PR 8b).
// Route : achatsfactures/liste. Les données vivent dans la base de l'espace (pas dans Firebase) : `demarrer` n'écoute rien.
import { naviguer } from '../../os/router.js';
import { rendreEcran } from './ecran.js';
import { reglagesExportFactures } from './export.js';

// Feuille de style propre au module, ajoutée au premier affichage (index.html reste inchangé).
function ajouterFeuille() {
  if (document.querySelector('link[data-achatsfactures]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL('../../../css/achatsfactures.css', import.meta.url).href;
  l.dataset.achatsfactures = '1';
  document.head.append(l);
}

export const actionsRapides = []; // rien à créer depuis la coque (« + Facture » arrive avec l'étape 8b)

/** Réglages du module : une seule section, « Sauvegarde » (export des données). */
export function reglages(page) {
  reglagesExportFactures(page);
}

let montee = null;

export function demarrer() { /* aucune donnée Firebase à écouter : tout se lit dans la base de l'espace, à l'ouverture de l'écran */ }

function quitter() {
  montee?.();
  montee = null;
}

export function arreter() {
  quitter();
}

export function afficher(conteneur, segs) {
  if (segs[0] !== 'liste') { naviguer('achatsfactures/liste', { remplacer: true }); return quitter; }
  quitter();
  ajouterFeuille();
  montee = rendreEcran(conteneur);
  conteneur.scrollTop = 0;
  return quitter;
}

/** Pas de recherche globale pour ce module. */
export function rechercher() {
  return { groupes: [] };
}
