// Module Achats « Fournisseurs » (24/11/2026) : réservé à un seul compte (`seulJerome`, js/os/registre.js), étape « coquille » : l'état de l'accès à la base, aucune donnée métier.
// Route : achatsfournisseurs/liste. Pas de section de Réglages ni d'export des données dans cette étape (à faire avec les données du module).
import { creerCoquille } from '../achatscommun/ecran-etat.js';
import { TITRE, AIDE } from './ecran.js';
import { ETAPES_DEPLOIEMENT_ACHATS } from '../achatscommun/deploiement.js';

/** Page Réglages > Déploiement : la ligne qui dit que les modules Achats n'existent pas chez les clients (une seule ligne pour les cinq modules, portée par celui-ci). */
export function controlesDeploiement() {
  return { etapes: ETAPES_DEPLOIEMENT_ACHATS, verifier: null };
}

const coquille = creerCoquille({ route: 'achatsfournisseurs/liste', titre: TITRE, aide: AIDE });

export const actionsRapides = []; // rien à créer depuis l'écran

export function demarrer() { /* aucune donnée à écouter dans cette étape */ }

export function arreter() {
  coquille.arreter();
}

export function afficher(conteneur, segs) {
  return coquille.afficher(conteneur, segs);
}

/** Pas de recherche globale pour ce module. */
export function rechercher() {
  return { groupes: [] };
}
