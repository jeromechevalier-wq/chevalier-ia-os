// Codes de confirmation des suppressions MCP : un APERÇU de ce qui serait supprimé rend un code ; la suppression réelle exige ce code.
//  - à usage unique : lu puis effacé avant la suppression ; un nouvel aperçu du même objet remplace l'ancien ;
//  - de courte durée (DUREE_CODE_MS) ;
//  - lié à l'empreinte de l'aperçu : si ce qui serait supprimé a changé depuis (fiche ajoutée au fil, autre cascade), le code ne vaut plus ;
//  - lié au jeton, à l'outil et à la fiche visée : le code d'un autre jeton, d'un autre outil ou d'une autre fiche est refusé.
// Le code est stocké dans l'espace de données de l'appelant (chez un client : clients/<client>/mcp_codes), jamais journalisé.
// Une trace de code n'est pas une donnée du CRM : elle n'est pas dans l'audit ; seule la suppression qui suit l'est.
import { createHash, randomBytes } from 'node:crypto';
import { COLLECTIONS as C } from '../coeur/donnees.js';
import { sansId } from '../coeur/canonique.js';

export const DUREE_CODE_MS = 5 * 60_000;
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // sans I, O, 0, 1 : faciles à recopier
const LONGUEUR = 8;

const cle = (jeton, outil, cibleId) => createHash('sha256').update(`${jeton}|${outil}|${cibleId}`).digest('hex').slice(0, 40);
const normaliser = (code) => String(code ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const afficher = (brut) => `${brut.slice(0, 4)}-${brut.slice(4)}`;

/** Empreinte de ce que l'aperçu annonce (liste triée des documents supprimés et détachés). */
export const empreinteApercu = (elements) => createHash('sha256').update([...elements].sort().join('\n')).digest('hex');

/** Émet un code pour (jeton, outil, fiche) et le range ; remplace un éventuel code précédent. Rend { code, valideMinutes }. */
export async function emettreCode({ donnees, jeton, outil, cibleId, empreinte, maintenant }) {
  const brut = Array.from(randomBytes(LONGUEUR), (o) => ALPHABET[o % ALPHABET.length]).join('');
  await donnees.appliquer([{ type: 'set', collection: C.codes, id: cle(jeton, outil, cibleId), donnees: { code: brut, empreinte, valideJusqua: maintenant.getTime() + DUREE_CODE_MS } }]);
  return { code: afficher(brut), valideMinutes: Math.round(DUREE_CODE_MS / 60_000) };
}

/**
 * Vérifie ET consomme le code. Rend 'ok' | 'absent' (jamais demandé, déjà utilisé, ou autre jeton/outil/fiche) | 'mauvais' | 'expire' | 'change'.
 * Un code faux ou périmé est effacé aussi : il faut un nouvel aperçu (pas d'essais répétés).
 */
export async function consommerCode({ donnees, jeton, outil, cibleId, code, empreinte, maintenant }) {
  const id = cle(jeton, outil, cibleId);
  const trouve = await donnees.document(C.codes, id);
  if (!trouve) return 'absent';
  const avant = sansId(trouve);
  try {
    await donnees.appliquer([{ type: 'delete', collection: C.codes, id }], { attendus: [{ collection: C.codes, id, avant }] });
  } catch {
    return 'absent'; // consommé entre-temps par un autre appel : un seul des deux passe
  }
  if (maintenant.getTime() > avant.valideJusqua) return 'expire';
  if (normaliser(code) !== avant.code) return 'mauvais';
  if (empreinte !== avant.empreinte) return 'change';
  return 'ok';
}
