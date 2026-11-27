// Module Achats « Chantiers » (24/11/2026, PR 6) : réservé à un seul compte (`seulJerome`, js/os/registre.js). Liste et Kanban des chantiers lus dans la base de l'espace,
// fenêtre d'un chantier (budget, accepté, en attente, part du budget), création, modification, archivage et réouverture (par les actions métier), favoris, export.
// Routes : achatschantiers/liste, et achatschantiers/liste/<id> (ce seul chantier, ouvert depuis une petite maison du village de l'accueil). Les données vivent dans la base de l'espace (pas dans Firebase) : `demarrer` n'écoute rien.
import { naviguer } from '../../os/router.js';
import { rendreEcran } from './ecran.js';
import { reglagesExportChantiers, fichierChantiers } from './export.js';
import { zoneSauvegardesAchats } from '../achatscommun/sauvegarde.js';

// Feuille de style propre au module, ajoutée au premier affichage (index.html reste inchangé).
function ajouterFeuille() {
  if (document.querySelector('link[data-achatschantiers]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL('../../../css/achatschantiers.css', import.meta.url).href;
  l.dataset.achatschantiers = '1';
  document.head.append(l);
}

export const actionsRapides = []; // rien à créer depuis la coque : « + Chantier » est sur l'écran

/** Réglages du module : sa table dans la « Sauvegarde complète des achats » (.zip) et sa propre section d'export, repliée sous « Sauvegardes séparées ». */
export function reglages(page, ctx) {
  reglagesExportChantiers(zoneSauvegardesAchats(page, { module: 'achatschantiers', table: 'Chantiers', fabriquer: () => fichierChantiers() }, ctx));
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
  if (segs[0] !== 'liste') { naviguer('achatschantiers/liste', { remplacer: true }); return quitter; }
  quitter();
  ajouterFeuille();
  montee = rendreEcran(conteneur, { seul: segs[1] ?? null });
  conteneur.scrollTop = 0;
  return quitter;
}

/** Pas de recherche globale pour ce module. */
export function rechercher() {
  return { groupes: [] };
}
