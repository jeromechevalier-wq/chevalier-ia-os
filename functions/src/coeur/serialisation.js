// Met les documents Firestore en valeurs JSON pour les réponses MCP : Timestamp -> texte ISO, le reste inchangé.
import * as L from '../../partage/logique.js';

const estTimestamp = (v) => v && typeof v === 'object' && (typeof v.toDate === 'function' || (typeof v.seconds === 'number' && 'nanoseconds' in v));

export function serialiser(valeur) {
  if (valeur === null || valeur === undefined) return valeur ?? null;
  if (estTimestamp(valeur)) return L.versDate(valeur)?.toISOString() ?? null;
  if (valeur instanceof Date) return isNaN(valeur) ? null : valeur.toISOString();
  if (Array.isArray(valeur)) return valeur.map(serialiser);
  if (typeof valeur === 'object') return Object.fromEntries(Object.entries(valeur).map(([k, v]) => [k, serialiser(v)]));
  return valeur;
}
