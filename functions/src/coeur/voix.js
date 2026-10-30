// Ce que l'assistant lit et dit à voix haute (décisions de Jérôme, 30/10/2026) : « hors taxes » en toutes lettres (jamais « HT », « TTC » reste « TTC »),
// et jamais le mode de calcul de la marge (« Calcul artisan » / « Calcul comptable »). Les écrans gardent leurs textes ; seul ce qui part vers l'assistant passe ici.
import * as D from '../../partage/devis.js';

export const MARGE_IMPOSSIBLE = 'Cette marge est impossible : choisis un pourcentage plus petit.';

/** « HT » est mal lu à voix haute : « hors taxes » en toutes lettres. Les noms de champs (`totalHT`) ne changent pas. */
export const ditHorsTaxes = (texte) => String(texte ?? '').replace(/\bHT\b/g, 'hors taxes');

/** Texte renvoyé à l'assistant : « hors taxes », et le message « marge de 100 % » (qui nomme le calcul comptable) devient neutre. */
export const ditPourAssistant = (texte) => ditHorsTaxes(String(texte ?? '').split(D.ERREUR_MARGE_100).join(MARGE_IMPOSSIBLE));

/** Copie d'une valeur sans la clé `modeMarge` (à tout niveau) : le mode de calcul n'est jamais montré à l'assistant. Ne modifie pas l'entrée. */
export function sansModeMarge(valeur) {
  if (Array.isArray(valeur)) return valeur.map(sansModeMarge);
  if (valeur && typeof valeur === 'object' && Object.getPrototypeOf(valeur) === Object.prototype) {
    return Object.fromEntries(Object.entries(valeur).filter(([k]) => k !== 'modeMarge').map(([k, v]) => [k, sansModeMarge(v)]));
  }
  return valeur;
}
