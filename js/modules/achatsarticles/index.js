// Module Achats « Articles » : relier les articles des fournisseurs à ses articles internes (rapprochements, coefficients, suggestions de l'IA).
// Réservé à un seul compte (`seulJerome`, js/os/registre.js). Route : achatsarticles/liste. Lecture par js/os/acces-base.js (donnees.js), écritures par les actions métier (actions.js).
// Réglages > Achats > « Sauvegarde » : export de tous les articles (règle du 27/10/2026). Aucun autre module n'est importé (seuls le code commun des Achats et la barre de liste commune).
import { naviguer } from '../../os/router.js';
import { rendreEcran } from './ecran.js';
import { lireDonnees } from './donnees.js';
import { reglagesExportArticles, fichierArticles } from './export.js';
import { zoneSauvegardesAchats } from '../achatscommun/sauvegarde.js';

// Feuille de style propre au module, ajoutée au premier affichage (index.html reste inchangé).
function ajouterFeuille() {
  if (document.querySelector('link[data-achatsarticles]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL('../../../css/achatsarticles.css', import.meta.url).href;
  l.dataset.achatsarticles = '1';
  document.head.append(l);
}

export const actionsRapides = []; // rien à créer depuis l'écran : les articles viennent des factures

/** Réglages du module : sa table dans la « Sauvegarde complète des achats » (.zip) et sa propre section d'export, repliée sous « Sauvegardes séparées ». */
export function reglages(page, ctx) {
  reglagesExportArticles(zoneSauvegardesAchats(page, { module: 'achatsarticles', table: 'Articles', fabriquer: () => fichierArticles({ lire: () => lireDonnees() }) }, ctx), { lire: () => lireDonnees() });
}

let montee = null;
const quitter = () => { montee?.(); montee = null; };

export function demarrer() { /* aucune donnée à écouter : tout est lu dans la base à l'ouverture de l'écran */ }

export function arreter() {
  quitter();
}

export function afficher(conteneur, segs) {
  if (segs[0] !== 'liste') { naviguer('achatsarticles/liste', { remplacer: true }); return quitter; }
  ajouterFeuille();
  quitter();
  montee = rendreEcran(conteneur);
  conteneur.scrollTop = 0;
  return quitter;
}

/** Pas de recherche globale pour ce module. */
export function rechercher() {
  return { groupes: [] };
}
