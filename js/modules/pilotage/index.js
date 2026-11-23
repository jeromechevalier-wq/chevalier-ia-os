// Module Pilotage : des graphiques (Apache ECharts) alimentés par une base de données, décrits par un réglage que Claude modifie à la demande de Jérôme.
// Un seul écran (pilotage/pilotage). Aucune donnée lue ni écrite par le navigateur : tout passe par la fonction `pilotageLire` du serveur (absente chez les clients pour l'instant).
import { vider } from '../../os/ui.js';
import { naviguer } from '../../os/router.js';
import { rendreEcran } from './ecran.js';
import { reglagesExportPilotage } from './export.js';
import { ETAPES_DEPLOIEMENT_PILOTAGE } from './deploiement.js';

// Feuille de style propre au module, ajoutée au premier affichage (index.html reste inchangé).
function ajouterFeuille() {
  if (document.querySelector('link[data-pilotage]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL('../../../css/pilotage.css', import.meta.url).href;
  l.dataset.pilotage = '1';
  document.head.append(l);
}

/** Page Réglages > Déploiement : la ligne qui dit que le Pilotage n'existe pas encore chez les clients. */
export function controlesDeploiement() {
  return { etapes: ETAPES_DEPLOIEMENT_PILOTAGE, verifier: null };
}

export const actionsRapides = []; // rien à créer depuis l'écran : le tableau se lit

/** Réglages du module : une seule section, « Sauvegarde » (export du réglage). */
export function reglages(page) {
  reglagesExportPilotage(page);
}

let montee = null;

export function demarrer() { /* rien à écouter : le navigateur ne lit aucune table de ce module */ }

export function arreter() {
  quitter();
}

function quitter() {
  montee?.();
  montee = null;
}

export function afficher(conteneur, segs) {
  if (segs[0] !== 'pilotage') {
    naviguer('pilotage/pilotage', { remplacer: true });
    return quitter;
  }
  ajouterFeuille();
  quitter();
  vider(conteneur);
  montee = rendreEcran(conteneur);
  conteneur.scrollTop = 0;
  return quitter;
}

/** Pas de recherche globale pour ce module. */
export function rechercher() {
  return { groupes: [] };
}
