// Fonctions appelables du module Devis chez Jérôme (projet chevalier-ia-os) : devisFinaliser, devisChangerStatut, devisNouvelleVersion, devisArchiver.
// Même règle d'accès que `automatisationsDecider` : un compte Google vérifié, parmi COMPTES_AUTORISES. Le travail est dans coeur/devis.js (transactions).
// Aucune porte dérobée : pas de clé, pas de paramètre qui contourne le contrôle du compte. Aucun appel à n8n dans cette version.
// Le journal Cloud ne reçoit jamais le contenu d'un devis, ni l'identifiant du devis, ni l'adresse de l'appelant.
import { HttpsError } from 'firebase-functions/v2/https';
import { COMPTES_AUTORISES } from './veille/appel.js';
import { ErreurDevis, OPERATIONS, reponsePublique } from './coeur/devis.js';

const CHAMPS_JOURNAL = ['action', 'statut', 'code', 'dureeMs'];

/** Une ligne de journal : liste blanche de champs, valeurs courtes. */
export function ligneDeJournalDevis(entree) {
  const ligne = { severity: entree.statut === 'erreur' ? 'ERROR' : entree.statut === 'avertissement' ? 'WARNING' : 'INFO', message: 'devis' };
  for (const c of CHAMPS_JOURNAL) {
    const v = entree[c];
    if (v === undefined || v === null) continue;
    ligne[c] = typeof v === 'string' ? v.slice(0, 40) : v;
  }
  return JSON.stringify(ligne);
}

/** Erreur du service -> erreur de l'appel (le message est écrit pour être lu par l'utilisateur). */
export function enErreurAppel(e) {
  if (!(e instanceof ErreurDevis)) return null;
  const code = { demande_invalide: 'invalid-argument', introuvable: 'not-found' }[e.code] ?? 'failed-precondition';
  return new HttpsError(code, e.message, { code: e.code });
}

/** Contrôle de l'appelant (compte Google vérifié, parmi `comptes`) : rend le jeton, ou lève l'erreur d'accès. Partagé par devisPdf. */
export function exigerCompteAutorise(requete, comptes = COMPTES_AUTORISES) {
  const jeton = requete.auth?.token;
  if (!jeton) throw new HttpsError('unauthenticated', 'Connexion nécessaire.');
  if (jeton.email_verified !== true || typeof jeton.email !== 'string' || !comptes.includes(jeton.email)) {
    throw new HttpsError('permission-denied', 'Ce compte n\'a pas accès aux devis.');
  }
  return jeton;
}

/** `stockage` : fonction qui rend le stockage des PDF (ou null) ; sert à retirer le fichier d'un brouillon supprimé. */
export function creerAppelDevis(operation, { donnees, stockage = null, comptes = COMPTES_AUTORISES, journal = () => {}, maintenant = Date.now }) {
  const executer = OPERATIONS[operation];
  if (!executer) throw new Error(`Opération de devis inconnue : ${operation}`);
  return async function appel(requete) {
    const debut = maintenant();
    const jeton = exigerCompteAutorise(requete, comptes);
    const demande = requete.data && typeof requete.data === 'object' ? requete.data : {};
    try {
      const base = { donnees: donnees(), ctx: { acteur: jeton.email.toLowerCase(), via: 'ecran', maintenant: new Date(maintenant()) },
        stockage: stockage ? stockage() : null, avertir: (a) => journal({ action: operation, statut: 'avertissement', code: a.code, dureeMs: maintenant() - debut }) };
      const r = await executer(base, demande);
      journal({ action: operation, statut: r.ok ? 'ok' : 'refus', code: r.ok ? undefined : 'devis_invalide', dureeMs: maintenant() - debut });
      // Un devis qui ne peut pas être finalisé n'est pas une panne : on rend les messages à corriger (rien n'a été écrit).
      return reponsePublique(r);
    } catch (e) {
      const erreur = enErreurAppel(e);
      if (erreur) {
        journal({ action: operation, statut: 'refus', code: e.code, dureeMs: maintenant() - debut });
        throw erreur;
      }
      journal({ action: operation, statut: 'erreur', code: String(e?.name ?? 'inconnue').slice(0, 30), dureeMs: maintenant() - debut });
      throw new HttpsError('internal', 'Une erreur est survenue. Réessaie.');
    }
  };
}
