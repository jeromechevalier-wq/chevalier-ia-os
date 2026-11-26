// Module Achats « Factures » (25/11/2026, PR 8a et 8b) : réservé à un seul compte (`seulJerome`, js/os/registre.js). Liste et Kanban des factures lus dans la base de l'espace,
// pastilles de contrôle, archivage et désarchivage (par les actions métier), favoris, export, « + Facture », et la page « Examiner » d'une facture (PDF, contrôles, décision).
// Routes : achatsfactures/liste, achatsfactures/examiner/<id> et achatsfactures/pile (« Valider à la suite » : une facture à valider après l'autre, pile.js). Les données vivent dans la base de l'espace (pas dans Firebase) : `demarrer` n'écoute rien.
import { naviguer } from '../../os/router.js';
import { rendreEcran } from './ecran.js';
import { rendreExaminer } from './examiner.js';
import { rendrePile } from './pile.js';
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

export const actionsRapides = []; // rien à créer depuis la coque (« + Facture » est dans la barre de la liste)

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
  const examiner = segs[0] === 'examiner' && !!segs[1];
  const pile = segs[0] === 'pile';
  if (segs[0] !== 'liste' && !examiner && !pile) { naviguer('achatsfactures/liste', { remplacer: true }); return quitter; }
  quitter();
  ajouterFeuille();
  montee = examiner ? rendreExaminer(conteneur, decodeURIComponent(segs[1])) : pile ? rendrePile(conteneur) : rendreEcran(conteneur);
  conteneur.scrollTop = 0;
  return quitter;
}

/** Pas de recherche globale pour ce module. */
export function rechercher() {
  return { groupes: [] };
}
