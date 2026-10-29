// Fonction appelable `automatisationsRenommer` chez Jérôme (icône « Renommer » du module Automatisations) : même geste que chez les clients, sur TA base (collection racine `workflows`).
// Même règle d'accès que `automatisationsDecider` : un compte Google vérifié, parmi COMPTES_AUTORISES. Le contrôle du nom est le même code que chez les clients
// (functions-plateforme/src/libelle.js, copié dans partage/ par scripts/preparer-fonctions.js). Seul le champ « libelle » est écrit ; n8n n'est jamais touché ; un nom vide revient au nom d'origine.
// L'écran n'écrit JAMAIS lui-même ce champ. Le journal ne reçoit ni le nom saisi, ni l'identifiant du workflow, ni l'adresse de l'appelant.
import { HttpsError } from 'firebase-functions/v2/https';
import { COMPTES_AUTORISES } from '../veille/appel.js';
import { controlerRenommage, champLibelle } from '../../partage/automatisations/libelle.js';

const CHAMPS_JOURNAL = ['action', 'statut', 'code', 'dureeMs'];

/** Une ligne de journal : liste blanche de champs, valeurs courtes. */
export function ligneDeJournalRenommer(entree) {
  const ligne = { severity: entree.statut === 'erreur' ? 'ERROR' : 'INFO', message: 'automatisationsRenommer' };
  for (const c of CHAMPS_JOURNAL) {
    const v = entree[c];
    if (v === undefined || v === null) continue;
    ligne[c] = typeof v === 'string' ? v.slice(0, 40) : v;
  }
  return JSON.stringify(ligne);
}

/** `db` : la base Firestore de Jérôme (ou son double de test) ; `effacer` : la valeur qui retire un champ (FieldValue.delete()). */
export function creerAppelRenommer({ db, effacer, comptes = COMPTES_AUTORISES, journal = () => {}, maintenant = Date.now }) {
  return async function appel(requete) {
    const debut = maintenant();
    const jeton = requete.auth?.token;
    if (!jeton) throw new HttpsError('unauthenticated', 'Connexion nécessaire.');
    if (jeton.email_verified !== true || typeof jeton.email !== 'string' || !comptes.includes(jeton.email)) {
      throw new HttpsError('permission-denied', 'Action non autorisée.');
    }
    const controle = controlerRenommage(requete.data);
    if (controle.erreur) {
      journal({ action: 'renommer', statut: 'refus', code: controle.erreur.code, dureeMs: maintenant() - debut });
      throw new HttpsError(controle.erreur.code, controle.erreur.message);
    }
    try {
      const ref = db().doc(`workflows/${controle.workflowId}`);
      if (!(await ref.get()).exists) {
        journal({ action: 'renommer', statut: 'refus', code: 'not-found', dureeMs: maintenant() - debut });
        throw new HttpsError('not-found', 'Cette automatisation est introuvable.');
      }
      await ref.update(champLibelle(controle.libelle, effacer));
      journal({ action: 'renommer', statut: 'ok', dureeMs: maintenant() - debut });
      return { ok: true, libelle: controle.libelle };
    } catch (e) {
      if (e instanceof HttpsError) throw e;
      journal({ action: 'renommer', statut: 'erreur', code: String(e?.name ?? 'inconnue').slice(0, 30), dureeMs: maintenant() - debut });
      throw new HttpsError('internal', 'Une erreur est survenue. Réessaie.');
    }
  };
}
