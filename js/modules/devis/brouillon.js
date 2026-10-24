// Brouillons de devis côté navigateur (voir docs/cadrage-devis.md §4 et §7) : les PLANS d'écriture, sans accès à Firebase ni au réseau (testés avec node --test).
// Le navigateur n'écrit un devis que tant qu'il est un brouillon (règles Firestore) : créer un brouillon neuf, modifier son contenu. Finaliser, marquer envoyé,
// signer, refuser, créer la version suivante et archiver passent par les fonctions du serveur (donnees.js les appelle).
// Décision prise seul (24/10/2026) : `archive` n'est pas modifiable ici (les règles le permettraient sur un brouillon, mais seul le serveur l'archive).
import { ecritureCreer, ecritureModifier, MARQUES_CREATION, MARQUES_MODIFICATION } from '../crm/logique.js';
import { nouveauDevis } from './logique.js';

export const COLLECTION_DEVIS = 'devis_devis';
/** Champs que le navigateur ne change jamais (le serveur seul les écrit ; les règles Firestore refusent numero, racineId, version, statut et finaliseLe). */
export const CHAMPS_PROTEGES = Object.freeze(['id', 'numero', 'racineId', 'version', 'statut', 'finaliseLe', 'finalisation', 'totaux', 'archive', 'archiveLe', 'creeLe', 'creePar']);
export const MESSAGE_PAS_BROUILLON = 'Ce devis n’est plus un brouillon : pour le corriger, crée la version suivante.';
export const MESSAGE_INTROUVABLE = 'Devis introuvable : recharge la page.';

/** Création d'un brouillon neuf : `{ erreurs, id, devis, ecritures }`. `ctx` : { nouvelId, maintenant, auteur, proprietaire? } ; `reglages` : ceux du module (reglagesDevis). */
export function planCreerBrouillon(valeurs, ctx, reglages = {}) {
  const id = ctx.nouvelId(COLLECTION_DEVIS);
  const { id: _id, ...devis } = nouveauDevis(valeurs ?? {}, { ...ctx, id, nouvelId: undefined }, reglages);
  return { erreurs: {}, id, devis: { ...devis, id }, ecritures: [ecritureCreer(COLLECTION_DEVIS, id, devis, MARQUES_CREATION)] };
}

/** Modification d'un brouillon : `{ erreurs, patch, ecritures }`. Refusée (aucune écriture) si le devis n'est plus un brouillon ou si le patch touche un champ protégé. */
export function planModifierBrouillon(devis, patch) {
  if (!devis) return { erreurs: { general: MESSAGE_INTROUVABLE }, patch: {}, ecritures: [] };
  if (devis.statut !== 'brouillon') return { erreurs: { general: MESSAGE_PAS_BROUILLON }, patch: {}, ecritures: [] };
  const donnes = Object.fromEntries(Object.entries(patch ?? {}).filter(([, v]) => v !== undefined));
  const interdits = Object.keys(donnes).filter((k) => CHAMPS_PROTEGES.includes(k));
  if (interdits.length) return { erreurs: { general: `Ces champs ne se modifient pas ici : ${interdits.join(', ')}.` }, patch: {}, ecritures: [] };
  if (!Object.keys(donnes).length) return { erreurs: {}, patch: {}, ecritures: [] };
  return { erreurs: {}, patch: donnes, ecritures: [ecritureModifier(COLLECTION_DEVIS, devis.id, donnes, MARQUES_MODIFICATION)] };
}
