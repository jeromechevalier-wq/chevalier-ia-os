// Outil modifier_lignes_devis : la partie pure (sans accès aux données) = les constantes, le calcul de « changement important » et les manipulations de sections.
// Un SEUL endroit pour les seuils : ni les descriptions d'outils ni les consignes ne les répètent en chiffres.
// Aucune marge, aucun prix d'achat ici : `avant` / `apres` ne portent que le libellé, la quantité et le prix de vente.
import { niveauSection } from '../../partage/devis.js';

/** Nombre d'opérations d'un appel (distinct de MAX_NUMEROS_DITS du résolveur, qui limite les numéros listés dans un message d'erreur). */
export const MAX_OPERATIONS = 30;

/** Ce qui rend un changement « important » (l'assistant doit alors redire la ligne en une phrase). */
export const SEUILS_CHANGEMENT_IMPORTANT = Object.freeze({
  facteurQuantite: 2, // quantité multipliée ou divisée par 2 ou plus
  partPrixVente: 0.2, // prix de vente unitaire qui bouge de 20 % ou plus
  partTotalDevis: 0.2, // total hors taxes du devis qui bouge de 20 % ou plus
});

export const ACTIONS = Object.freeze(['modifier', 'supprimer', 'ajouter', 'ajouterSection', 'renommerSection', 'supprimerSection']);

const bouge = (avant, apres, part) => {
  if (avant === apres) return false;
  if (!(avant > 0)) return apres > 0 || apres < 0; // on part de zéro (ou de rien) : tout écart compte
  return Math.abs(apres - avant) / avant >= part - 1e-9;
};

/** Quantité multipliée ou divisée par `facteurQuantite` ou plus. */
export function quantiteImportante(avant, apres) {
  const { facteurQuantite } = SEUILS_CHANGEMENT_IMPORTANT;
  if (!(avant > 0) || !(apres > 0)) return avant !== apres;
  return apres / avant >= facteurQuantite - 1e-9 || avant / apres >= facteurQuantite - 1e-9;
}

/** `avant` / `apres` : { libelle, quantite, prixVente } (null pour une ligne qui n'existait pas ou qui disparaît). */
export function importanceOperation(action, avant, apres) {
  if (action === 'supprimer' || action === 'supprimerSection') return true;
  if (action !== 'modifier' || !avant || !apres) return false;
  if (quantiteImportante(avant.quantite, apres.quantite)) return true;
  return bouge(avant.prixVente, apres.prixVente, SEUILS_CHANGEMENT_IMPORTANT.partPrixVente);
}

/** Le total hors taxes du devis bouge de 20 % ou plus. */
export const totalImportant = (avantHt, apresHt) => bouge(avantHt, apresHt, SEUILS_CHANGEMENT_IMPORTANT.partTotalDevis);

/** Index de la section qui porte la ligne, et de la ligne dans cette section ; null si elle n'existe plus. */
export function placeDeLigne(sections, ligneId) {
  for (let i = 0; i < sections.length; i += 1) {
    const j = (sections[i].lignes ?? []).findIndex((l) => l.id === ligneId);
    if (j !== -1) return { i, j };
  }
  return null;
}

export const indexDeSection = (sections, sectionId) => sections.findIndex((s) => s.id === sectionId);

/** Une section de niveau 1 est suivie de ses sous-sections (niveau 2) : vrai si la section d'index `i` en a. */
export const aDesSousSections = (sections, i) => i + 1 < sections.length && niveauSection(sections, i) === 1 && niveauSection(sections, i + 1) === 2;

/** Insérer une section de niveau 1 juste après l'index `i` couperait la série des sous-sections qui suivent : refusé. */
export const coupeLesSousSections = (sections, i) => i + 1 < sections.length && niveauSection(sections, i + 1) === 2;
