// Module Achats « Fournisseurs » (24/11/2026) : réservé à un seul compte (`seulJerome`, js/os/registre.js). Les fournisseurs et leurs IBAN sont LUS dans la base de l'espace ;
// confirmer ou révoquer un IBAN passe par les actions métier (ticket à usage unique). Route : achatsfournisseurs/liste. Aucune donnée dans Firebase.
import { vider } from '../../os/ui.js';
import { naviguer } from '../../os/router.js';
import { rendreEcran } from './ecran.js';
import { reglagesExportFournisseurs, fichierFournisseurs } from './export.js';
import { zoneSauvegardesAchats } from '../achatscommun/sauvegarde.js';
import { ETAPES_DEPLOIEMENT_ACHATS } from '../achatscommun/deploiement.js';

// Feuille de style propre au module, ajoutée au premier affichage (index.html reste inchangé).
function ajouterFeuille() {
  if (document.querySelector('link[data-achatsfournisseurs]')) return;
  const l = document.createElement('link');
  l.rel = 'stylesheet';
  l.href = new URL('../../../css/achatsfournisseurs.css', import.meta.url).href;
  l.dataset.achatsfournisseurs = '1';
  document.head.append(l);
}

/** Page Réglages > Déploiement : la ligne qui dit que les modules Achats n'existent pas chez les clients (une seule ligne pour les cinq modules, portée par celui-ci). */
export function controlesDeploiement() {
  return { etapes: ETAPES_DEPLOIEMENT_ACHATS, verifier: null };
}

export const actionsRapides = []; // rien à créer depuis l'écran : les fournisseurs naissent des factures lues

/** Réglages du module : sa table dans la « Sauvegarde complète des achats » (.zip) et sa propre section d'export, repliée sous « Sauvegardes séparées ». */
export function reglages(page, ctx) {
  reglagesExportFournisseurs(zoneSauvegardesAchats(page, { module: 'achatsfournisseurs', table: 'Fournisseurs', fabriquer: () => fichierFournisseurs() }, ctx));
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
  if (segs[0] !== 'liste') {
    naviguer('achatsfournisseurs/liste', { remplacer: true });
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
