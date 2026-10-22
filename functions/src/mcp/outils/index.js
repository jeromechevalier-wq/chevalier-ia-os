// Registre des outils MCP. Chaque outil déclare les profils autorisés ; le serveur n'expose et n'exécute que ceux du profil
// du jeton (deuxième niveau de protection, après le filtre « tools.include » côté Hermes).
//  lecteur : lecture ; bibliothécaire : + écriture ; claude-code : + suppression et restauration.
import { qui_suis_je } from './identite.js';
import { OUTILS_LECTURE } from './lecture.js';
import { OUTILS_ECRITURE } from './ecriture.js';
import { OUTILS_SUPPRESSION } from './suppression.js';
import { OUTILS_PROPOSITIONS_LECTURE, OUTILS_PROPOSITIONS_ECRITURE } from './propositions.js';

export const OUTILS = [qui_suis_je, ...OUTILS_LECTURE, ...OUTILS_PROPOSITIONS_LECTURE, ...OUTILS_ECRITURE, ...OUTILS_PROPOSITIONS_ECRITURE, ...OUTILS_SUPPRESSION];

/** Écritures qui ne sont pas annulables par restaurer_depuis_audit. */
export const OUTILS_NON_ANNULABLES = Object.freeze(['valider_proposition', 'refuser_proposition']);

export const outilsAutorises = (profil, outils = OUTILS) => outils.filter((o) => o.profils.includes(profil));

/**
 * Annotations MCP (Claude et ChatGPT les lisent pour classer les outils sans les bloquer par défaut) :
 *  - lecture (ouverte au profil lecteur) : readOnlyHint ;
 *  - supprimer_* et restaurer_depuis_audit : destructiveHint ;
 *  - autres écritures : ni lecture seule ni destructrices, jamais idempotentes ;
 *    sauf valider_proposition et refuser_proposition, les décisions de la file « À valider » : elles NE passent PAS par le journal d'audit
 *    (décision atomique dans coeur/propositions.js), donc restaurer_depuis_audit ne les annule pas (OUTILS_NON_ANNULABLES) ; rappelées, elles refusent
 *    (déjà décidée), d'où idempotentHint faux, et elles ne détruisent rien (la proposition reste lisible), d'où destructiveHint faux.
 *    Toutes les autres écritures sont annulables par restaurer_depuis_audit.
 * Aucun outil ne sort du CRM : openWorldHint toujours faux.
 */
export function annotationsDe(outil) {
  const lecture = outil.profils.includes('lecteur');
  const destructif = /^supprimer_/.test(outil.nom) || outil.nom === 'restaurer_depuis_audit';
  return { readOnlyHint: lecture, destructiveHint: !lecture && destructif, idempotentHint: lecture, openWorldHint: false };
}
