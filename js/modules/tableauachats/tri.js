// Module Achats « Tableau de bord 2 » : tri des tableaux. LOGIQUE PURE.
import { nombre } from './formats.js';

/** Premier clic sur une colonne : les colonnes de chiffres (alignées à droite) commencent par les plus gros, les textes de A à Z. */
export const sensInitial = (colonne) => (colonne.droite ? 'desc' : 'asc');

/** Clic sur l'en-tête d'une colonne : même colonne = on inverse le sens ; autre colonne = son sens initial. */
export function triSuivant(tri, colonne) {
  return tri && tri.cle === colonne.cle ? { cle: colonne.cle, sens: tri.sens === 'asc' ? 'desc' : 'asc' } : { cle: colonne.cle, sens: sensInitial(colonne) };
}

const vide = (v) => v === null || v === undefined || v === '';

/** Trie une copie des lignes. Les valeurs vides vont toujours à la fin, quel que soit le sens. Chiffres comparés comme des nombres, textes sans tenir compte des majuscules ni des accents. */
export function trier(lignes, tri) {
  if (!tri) return lignes;
  const m = tri.sens === 'asc' ? 1 : -1;
  return [...lignes].sort((a, b) => {
    const x = a[tri.cle], y = b[tri.cle];
    if (vide(x) && vide(y)) return 0;
    if (vide(x)) return 1;
    if (vide(y)) return -1;
    const nx = nombre(x), ny = nombre(y);
    return (nx !== null && ny !== null && typeof x !== 'string' ? nx - ny : String(x).localeCompare(String(y), 'fr', { numeric: true, sensitivity: 'base' })) * m;
  });
}
