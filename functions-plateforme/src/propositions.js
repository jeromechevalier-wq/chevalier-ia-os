// Fonction appelable `automatisationsDecider` chez les clients (écran « À valider » du module Automatisations : valider, refuser, relancer ou abandonner une proposition).
// Séparé de index.js pour pouvoir l'essayer sans Cloud Functions (comme devis.js) : `db` est injecté. Le travail est dans serveur/src/coeur/propositions.js
// (copie de functions/src/coeur/propositions.js, le MÊME code que chez Jérôme et que les outils MCP).
//  - le client reçu est une CIBLE à vérifier, jamais une confiance : l'appelant doit avoir clients/<client>/membres/<son e-mail> avec le rôle « editeur » (un lecteur est refusé),
//    et le module « automatisations » doit être actif sur la fiche du client (l'ancienne clé `journal: true` compte aussi : moduleActif) ;
//  - UN SEUL refus neutre « Action non autorisée. » (espace inexistant, non-membre, lecteur, module inactif) : on ne dit rien de plus ;
//  - tout est lu et écrit sous clients/<client>/ (avecBase) : l'espace d'un autre client est hors d'atteinte ;
//  - le journal ne reçoit jamais le contenu d'une proposition (titre, résumé, champs, raison, identifiant) ni l'adresse de l'appelant.
import { logger } from 'firebase-functions';
import { creerAccesFirestore, avecBase } from '../serveur/src/coeur/donnees.js';
import { decider, ErreurDecision } from '../serveur/src/coeur/propositions.js';
import { Refus } from './appels.js';
import { MOTIF_IDENTIFIANT_CLIENT, moduleActif } from './etiquettes.js';

const REFUS_NEUTRE = () => new Refus('permission-denied', 'Action non autorisée.');

/**
 * Décide d'une proposition de l'espace `donnees.client`. Donnée reçue : { client, id, decision, champs?, raison? }. Rend { ok: true, etat } ou lève un Refus.
 * Les refus de décision sont ceux de chez Jérôme (mêmes codes, mêmes messages : « Déjà décidée par… »).
 * `creerDonnees(client)` : pour les essais (accès en mémoire) ; par défaut, la base du projet cadrée sur clients/<client>.
 */
export async function deciderClient({ db, auth, donnees, maintenant = Date.now, creerDonnees = null, journal = () => {} }) {
  const debut = maintenant();
  const jeton = auth?.token;
  if (!auth?.uid || !jeton || jeton.email_verified !== true || typeof jeton.email !== 'string') throw new Refus('unauthenticated', 'Connexion requise.');
  const email = jeton.email.toLowerCase();
  const client = donnees?.client;
  if (typeof client !== 'string' || !MOTIF_IDENTIFIANT_CLIENT.test(client)) throw new Refus('invalid-argument', 'Demande invalide.');
  if (client === 'interne') throw REFUS_NEUTRE(); // « interne » est réservé à Jérôme, jamais un espace de client
  const membre = await db.doc(`clients/${client}/membres/${email}`).get();
  if (!membre.exists || membre.get('role') !== 'editeur') throw REFUS_NEUTRE();
  const fiche = await db.doc(`clients/${client}`).get();
  if (!fiche.exists || !moduleActif(fiche.get('modules'))) throw REFUS_NEUTRE();
  const decision = typeof donnees?.decision === 'string' && /^[a-z]{1,10}$/.test(donnees.decision) ? donnees.decision : undefined;
  try {
    const acces = creerDonnees ? creerDonnees(client) : avecBase(creerAccesFirestore({ db }), `clients/${client}`);
    const r = await decider({ donnees: acces, par: email, canal: 'interface', maintenant: maintenant(), demande: donnees });
    journal({ action: 'decider', statut: 'ok', decision: r.decision, dureeMs: maintenant() - debut });
    return { ok: true, etat: r.etat };
  } catch (e) {
    if (e instanceof ErreurDecision) {
      journal({ action: 'decider', statut: 'refus', code: e.code, decision, dureeMs: maintenant() - debut });
      throw new Refus(e.code === 'demande_invalide' ? 'invalid-argument' : e.code === 'introuvable' ? 'not-found' : 'failed-precondition', e.message);
    }
    journal({ action: 'decider', statut: 'erreur', code: String(e?.name ?? 'inconnue').slice(0, 30), decision, dureeMs: maintenant() - debut });
    logger.error('Automatisations : erreur inattendue (décider)', { nom: e?.name });
    throw new Refus('internal', 'Une erreur est survenue.');
  }
}
