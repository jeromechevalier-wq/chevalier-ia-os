// Fonction appelable `automatisationsDecider` (écran « À valider ») : contrôle qui appelle, puis passe la main à coeur/propositions.js (le même code que les outils MCP).
// Même règle d'accès que `tableaudebordSaisir` : un compte Google vérifié, parmi COMPTES_AUTORISES. L'écran n'écrit JAMAIS lui-même une décision.
// Le journal ne reçoit jamais le contenu d'une proposition (titre, résumé, champs, raison, identifiant) ni l'adresse de l'appelant.
import { HttpsError } from 'firebase-functions/v2/https';
import { COMPTES_AUTORISES } from '../veille/appel.js';
import { decider, ErreurDecision } from '../coeur/propositions.js';

const CHAMPS_JOURNAL = ['action', 'statut', 'code', 'decision', 'dureeMs'];

/** Une ligne de journal : liste blanche de champs, valeurs courtes. */
export function ligneDeJournalDecision(entree) {
  const ligne = { severity: entree.statut === 'erreur' ? 'ERROR' : 'INFO', message: 'automatisationsDecider' };
  for (const c of CHAMPS_JOURNAL) {
    const v = entree[c];
    if (v === undefined || v === null) continue;
    ligne[c] = typeof v === 'string' ? v.slice(0, 40) : v;
  }
  return JSON.stringify(ligne);
}

export function creerAppelDecider({ donnees, comptes = COMPTES_AUTORISES, journal = () => {}, maintenant = Date.now }) {
  return async function appel(requete) {
    const debut = maintenant();
    const jeton = requete.auth?.token;
    if (!jeton) throw new HttpsError('unauthenticated', 'Connexion nécessaire.');
    if (jeton.email_verified !== true || typeof jeton.email !== 'string' || !comptes.includes(jeton.email)) {
      throw new HttpsError('permission-denied', 'Ce compte n\'a pas accès à la file À valider.');
    }
    const demande = requete.data;
    const decision = typeof demande?.decision === 'string' && /^[a-z]{1,10}$/.test(demande.decision) ? demande.decision : undefined;
    try {
      const r = await decider({ donnees, par: jeton.email, canal: 'interface', maintenant: maintenant(), demande });
      journal({ action: 'decider', statut: 'ok', decision: r.decision, dureeMs: maintenant() - debut });
      return { ok: true, etat: r.etat };
    } catch (e) {
      if (e instanceof ErreurDecision) {
        journal({ action: 'decider', statut: 'refus', code: e.code, decision, dureeMs: maintenant() - debut });
        throw new HttpsError(e.code === 'demande_invalide' ? 'invalid-argument' : e.code === 'introuvable' ? 'not-found' : 'failed-precondition', e.message, { code: e.code });
      }
      journal({ action: 'decider', statut: 'erreur', code: String(e?.name ?? 'inconnue').slice(0, 30), decision, dureeMs: maintenant() - debut });
      throw new HttpsError('internal', 'Une erreur est survenue. Réessaie.');
    }
  };
}
