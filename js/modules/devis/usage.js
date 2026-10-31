// Compteur d'usage des articles côté écran (cadrage vocabulaire-cibles, 2.9 ; PR C4) : pur, sans accès aux données.
// La collection `devis_usage_articles` (un document par article : { articleId, nombre, derniereUtilisationLe }) est écrite par le serveur seulement ; l'écran la LIT.
import { normaliser } from '../crm/logique.js';

export const COLLECTION_USAGE = 'devis_usage_articles';

/** Critères du menu « Trier par » du catalogue : l'ordre habituel (libellé) et l'utilisation (le plus utilisé d'abord). */
export const CRITERES_TRI = Object.freeze([
  { id: 'libelle', libelle: 'Libellé', sens: 'asc' },
  { id: 'usage', libelle: 'Utilisation', sens: 'desc' },
]);
export const TRI_PAR_DEFAUT = Object.freeze({ critere: 'libelle', sens: 'asc' });

/** `Map articleId -> nombre` (entier positif) d'après les documents du compteur ; un document illisible est ignoré. */
export function usageParArticle(docs) {
  const m = new Map();
  for (const d of docs ?? []) {
    const id = d?.articleId ?? d?.id;
    if (typeof id === 'string' && id && Number.isInteger(d.nombre) && d.nombre > 0) m.set(id, d.nombre);
  }
  return m;
}

/** Nombre d'utilisations d'un article (0 = jamais, ou compteur absent). */
export const nombreUsage = (usages, articleId) => (usages instanceof Map ? usages.get(articleId) : 0) || 0;

/** « Utilisé 3 fois » (« Utilisé 1 fois » au singulier) ou « Jamais utilisé ». */
export const texteUsage = (n) => (n > 0 ? `Utilisé ${n} fois` : 'Jamais utilisé');

const parLibelle = (a, b) => normaliser(a.libelle).localeCompare(normaliser(b.libelle), 'fr') || String(a.id).localeCompare(String(b.id));

/**
 * Tri du catalogue, sans modifier la liste donnée. « libelle » : ordre habituel (alphabétique), `sens` 'desc' l'inverse.
 * « usage » : par nombre d'utilisations ; les jamais-utilisés sont TOUJOURS en dernier, quel que soit le sens, et à nombre égal l'ordre alphabétique décide.
 */
export function trierArticles(lignes, usages, { critere = TRI_PAR_DEFAUT.critere, sens = TRI_PAR_DEFAUT.sens } = {}) {
  const f = sens === 'desc' ? -1 : 1;
  const liste = [...(lignes ?? [])];
  if (critere !== 'usage') return liste.sort((a, b) => f * parLibelle(a, b));
  return liste.sort((a, b) => {
    const na = nombreUsage(usages, a.id);
    const nb = nombreUsage(usages, b.id);
    if (!na && !nb) return parLibelle(a, b);
    if (!na) return 1;
    if (!nb) return -1;
    return (f * (na - nb)) || parLibelle(a, b);
  });
}
