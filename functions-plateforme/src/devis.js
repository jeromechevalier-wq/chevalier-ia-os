// Module Devis sur la plateforme clients : les quatre transitions d'un devis (devisFinaliser, devisChangerStatut, devisNouvelleVersion, devisArchiver).
// Séparé de index.js pour pouvoir l'essayer sans Cloud Functions (comme espace.js) : `db` est injecté. Le travail est dans serveur/src/coeur/devis.js
// (copie de functions/src/coeur/devis.js, le MÊME code que chez Jérôme).
//  - le client reçu est une CIBLE à vérifier, jamais une confiance : l'appelant doit avoir clients/<client>/membres/<son e-mail> avec le rôle « editeur »
//    (un lecteur est refusé), et le module « devis » doit être actif sur la fiche du client ;
//  - UN SEUL refus neutre « Action non autorisée. » (espace inexistant, non-membre, lecteur, module inactif) : on ne dit rien de plus ;
//  - tout est écrit sous clients/<client>/ (avecBase) : un autre client est hors d'atteinte ; aucun appel à n8n dans cette version.
import { logger } from 'firebase-functions';
import { creerAccesFirestore, avecBase } from '../serveur/src/coeur/donnees.js';
import { ErreurDevis, OPERATIONS, reponsePublique } from '../serveur/src/coeur/devis.js';
import { Refus } from './appels.js';
import { MOTIF_IDENTIFIANT_CLIENT } from './etiquettes.js';

export const MODULE_DEVIS = 'devis';
const REFUS_NEUTRE = () => new Refus('permission-denied', 'Action non autorisée.');

/** Identité de l'appelant : e-mail vérifié obligatoire, en minuscules. */
function emailDe(auth) {
  const jeton = auth?.token;
  if (!auth?.uid || !jeton || jeton.email_verified !== true || typeof jeton.email !== 'string') throw new Refus('unauthenticated', 'Connexion requise.');
  return jeton.email.toLowerCase();
}

/**
 * Exécute une transition de devis pour le client de la demande. `operation` : finaliser | changerStatut | nouvelleVersion | archiver.
 * Donnée reçue : { client, devisId, action?, archive? }. Rend { ok, ... } (voir coeur/devis.js, reponsePublique) ou lève un Refus.
 * `creerDonnees(client)` : pour les essais (accès en mémoire) ; par défaut, la base du projet cadrée sur clients/<client>.
 */
export async function transitionDevis({ db, auth, donnees, operation, maintenant = Date.now(), creerDonnees = null }) {
  const executer = OPERATIONS[operation];
  if (!executer) throw new Error(`Opération de devis inconnue : ${operation}`);
  const email = emailDe(auth);
  const client = donnees?.client;
  if (typeof client !== 'string' || !MOTIF_IDENTIFIANT_CLIENT.test(client)) throw new Refus('invalid-argument', 'Demande invalide.');
  const membre = await db.doc(`clients/${client}/membres/${email}`).get();
  if (!membre.exists || membre.get('role') !== 'editeur') throw REFUS_NEUTRE();
  const fiche = await db.doc(`clients/${client}`).get();
  if (!fiche.exists || fiche.get('modules')?.[MODULE_DEVIS] !== true) throw REFUS_NEUTRE();
  try {
    const acces = creerDonnees ? creerDonnees(client) : avecBase(creerAccesFirestore({ db }), `clients/${client}`);
    const r = await executer({ donnees: acces, ctx: { acteur: email, via: 'ecran', maintenant: new Date(maintenant) } }, donnees);
    return reponsePublique(r);
  } catch (e) {
    if (e instanceof ErreurDevis) {
      throw new Refus({ demande_invalide: 'invalid-argument', introuvable: 'not-found' }[e.code] ?? 'failed-precondition', e.message);
    }
    logger.error('Devis : erreur inattendue', { operation, nom: e?.name, detail: String(e?.message ?? '').slice(0, 200) });
    throw new Refus('internal', 'Une erreur est survenue.');
  }
}
