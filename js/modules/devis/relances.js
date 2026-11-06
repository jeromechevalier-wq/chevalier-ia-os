// Relances à faire (06/11/2026, « Devis seul », suite 1, étape 1) : règle PURE, sans écran ni base.
// Le logiciel n'envoie rien : il montre les devis « Envoyé » restés sans réponse, c'est la personne qui relance par e-mail,
// puis enregistre l'envoi avec l'origine `relance` (une ligne de plus dans `envois`, le statut et `envoyeLe` ne bougent pas).
import { DELAI_RELANCE_DEFAUT, estExpire } from './logique.js';
import { enMs } from './liste.js';

const JOUR_MS = 86_400_000;

/** Millisecondes du dernier contact : la plus récente des dates de `envois[].date` et de `envoyeLe` (null si aucune date lisible). */
export function dernierContact(devis) {
  const dates = [enMs(devis?.envoyeLe), ...(Array.isArray(devis?.envois) ? devis.envois : []).map((e) => enMs(e?.date))].filter((ms) => ms !== null);
  return dates.length ? Math.max(...dates) : null;
}

/** Millisecondes de la dernière ligne d'envoi d'origine `relance` (null s'il n'y en a pas). */
export function derniereRelance(devis) {
  const dates = (Array.isArray(devis?.envois) ? devis.envois : []).filter((e) => e?.origine === 'relance').map((e) => enMs(e?.date)).filter((ms) => ms !== null);
  return dates.length ? Math.max(...dates) : null;
}

/**
 * Devis à relancer : statut « Envoyé », non archivé, non expiré, dernier contact vieux de `delaiJours` jours ou plus
 * (calcul en millisecondes : écart >= delaiJours × 86 400 000). Les devis de test restent dans la liste (c'est une liste d'actions, pas une statistique).
 * Rend [{ devis, dernierContactMs, joursDepuis, derniereRelanceMs }], du contact le plus ancien au plus récent. Une date illisible écarte le devis.
 */
export function devisARelancer(liste, { aujourdhui, maintenant = Date.now(), delaiJours = DELAI_RELANCE_DEFAUT } = {}) {
  const now = typeof maintenant === 'function' ? maintenant() : (enMs(maintenant) ?? Date.now());
  return (Array.isArray(liste) ? liste : [])
    .filter((devis) => devis?.statut === 'envoye' && devis.archive !== true && !estExpire(devis, aujourdhui))
    .map((devis) => ({ devis, dernierContactMs: dernierContact(devis), derniereRelanceMs: derniereRelance(devis) }))
    .filter((r) => r.dernierContactMs !== null && now - r.dernierContactMs >= delaiJours * JOUR_MS)
    .map((r) => ({ ...r, joursDepuis: Math.floor((now - r.dernierContactMs) / JOUR_MS) }))
    .sort((a, b) => a.dernierContactMs - b.dernierContactMs);
}
