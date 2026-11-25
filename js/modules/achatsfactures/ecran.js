// Écran « Factures » (module Achats, étape « coquille » du 24/11/2026) : l'état de l'accès à la base, aucune donnée métier encore.
// Le module n'importe que le code commun des Achats et la coque ; il n'exige aucun autre module.
import { rendreEcranEtat } from '../achatscommun/ecran-etat.js';

export const TITRE = 'Factures';
export const AIDE = 'Les factures de l’espace, lues dans la base.';

export function rendreEcran(conteneur) {
  return rendreEcranEtat(conteneur, { titre: TITRE, aide: AIDE });
}
