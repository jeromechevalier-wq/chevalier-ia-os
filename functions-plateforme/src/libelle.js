// Partie PURE du renommage d'un workflow (sans firebase-admin ni logger) : partagée par la plateforme clients (appels.js) et par le serveur de Jérôme
// (functions/src/automatisations/renommer-appel.js, copie générée par scripts/preparer-fonctions.js). Ici : le contrôle du nom et la valeur à écrire.
import { MOTIF_ID_N8N } from './etiquettes.js';

export const LONGUEUR_MAX_LIBELLE = 80;

/** Texte court et propre : sans caractères de contrôle, raccourci. */
export function raccourcir(valeur, max) {
  const t = String(valeur ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
  return t.length > max ? `${t.slice(0, max - 1)}…` : t;
}

/**
 * Contrôle { workflowId, libelle } reçus d'un écran. Renvoie { workflowId, libelle } (nom nettoyé, '' = revenir au nom d'origine)
 * ou { erreur: { code, message } } ; le code suit les codes de Firebase.
 */
export function controlerRenommage(donnees) {
  const { workflowId, libelle } = donnees ?? {};
  if (typeof workflowId !== 'string' || !MOTIF_ID_N8N.test(workflowId)) return { erreur: { code: 'invalid-argument', message: 'Demande invalide.' } };
  if (typeof libelle !== 'string') return { erreur: { code: 'invalid-argument', message: 'Le nom doit être un texte.' } };
  const propre = raccourcir(libelle, 10000);
  if (propre.length > LONGUEUR_MAX_LIBELLE) return { erreur: { code: 'invalid-argument', message: `Le nom est trop long (${LONGUEUR_MAX_LIBELLE} caractères au plus).` } };
  return { workflowId, libelle: propre };
}

/** Le champ à écrire : le nom, ou la suppression du champ (`effacer` = FieldValue.delete(), fourni par l'appelant) quand le nom est vide. */
export const champLibelle = (propre, effacer) => ({ libelle: propre === '' ? effacer : propre });
