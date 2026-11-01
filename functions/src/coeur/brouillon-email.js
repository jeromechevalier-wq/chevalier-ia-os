// Préparation d'un BROUILLON d'e-mail, générique (décision de Jérôme, 29/10/2026) : la source dit quoi préparer, n8n parle au fournisseur de messagerie.
// Cette fonction ne peut rien envoyer : elle ne fait que demander à n8n de créer un brouillon (coeur/n8n-sortie.js, corps fixe sans contenu). Aucune portée d'envoi nulle part (test).
// Par défaut, le destinataire, l'objet et le texte sont calculés PAR LE SERVEUR depuis l'objet d'origine (un devis aujourd'hui) ; la pièce jointe, toujours.
// Depuis le 01/11/2026 l'utilisateur peut les corriger pour un envoi (fenêtre de l'écran, ou l'assistant APRÈS les avoir montrés à l'utilisateur) : le serveur revalide, nettoie et mémorise
// le tout de son côté. La pièce jointe n'est jamais choisie par l'assistant, et rien ne s'envoie : c'est un brouillon.
// Une nouvelle source (facture, autre) = une ligne dans SOURCES_EMAIL, avec ses propres contrôles et sa porte pour n8n.
import { demanderPreparation } from './devis-email.js';

/** Source -> façon de demander le brouillon. `demander` rend { demandeId } ; lève ErreurDevis (ou équivalent) si l'objet n'est pas prêt. */
export const SOURCES_EMAIL = Object.freeze({
  devis: Object.freeze({ demander: ({ donnees, ctx, id, espace, sortie, saisie }) => demanderPreparation({ donnees, ctx, devisId: id, espace, sortie, saisie }) }),
});
export const TYPES_SOURCE_EMAIL = Object.freeze(Object.keys(SOURCES_EMAIL));

/** `source` : { type, id } de l'objet d'origine. `saisie` (facultative) : { destinataires, copie, objet, message } pour CET envoi, revérifiée par le serveur. Rend { ok: true, demandeId }. */
export async function preparerBrouillonEmail({ donnees, ctx, source, espace, sortie, saisie = null }) {
  const regle = Object.hasOwn(SOURCES_EMAIL, source?.type) ? SOURCES_EMAIL[source.type] : null;
  if (!regle) throw new Error(`Type de source inconnu : ${TYPES_SOURCE_EMAIL.join(', ')} attendu.`);
  return regle.demander({ donnees, ctx, id: source.id, espace, sortie, saisie });
}
