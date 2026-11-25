// Écran « Chantiers » (module Achats, étape « coquille » du 24/11/2026) : l'état de l'accès à la base, aucune donnée métier encore.
// Le module n'importe que le code commun des Achats et la coque ; il n'exige aucun autre module.
import { rendreEcranEtat } from '../achatscommun/ecran-etat.js';

export const TITRE = 'Chantiers';
export const AIDE = 'Les chantiers de l’espace, lus dans la base.';

export function rendreEcran(conteneur) {
  return rendreEcranEtat(conteneur, { titre: TITRE, aide: AIDE });
}
