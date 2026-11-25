// Fonction appelable `baseAccorderAcces` : RÉSERVÉE à Jérôme (même règle que la Console, CLAUDE.md du 16/11/2026).
// Elle pose ou retire, pour UN compte à la fois, les deux mentions Firebase qui ouvrent la base d'un espace :
// `role` = « authenticated » et `espace_base` = nom court de l'espace. Les autres mentions du compte ne sont jamais touchées.
// L'identité de l'appelant est contrôlée à chaque appel, côté serveur : cacher le bouton ne suffit pas.
// Jamais en lot, jamais automatique. Aucun secret lu, la réponse ne contient que { ok, effetAu }.
import { HttpsError } from 'firebase-functions/v2/https';
import { comptesJeromeSeul, emailDans } from '../securite/reglages-maison.js';

/** Jérôme seul : la liste comptes_jerome_seul de la fiche de la maison. Un tableau peut être passé pour les essais. */
export const COMPTES_BASE = comptesJeromeSeul;
export const CLE_ROLE = 'role';
export const CLE_ESPACE = 'espace_base';
export const VALEUR_ROLE = 'authenticated';
export const EFFET = 'dans l\'heure au plus';

export const REMARQUE_RETRAIT = 'Le retrait agit à l\'expiration du jeton (1 h au plus) ; il ne désactive pas le compte.';

const ESPACE = /^[a-z0-9-]{1,40}$/;
const EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/** `auth` doit offrir `getUserByEmail(email)` et `setCustomUserClaims(uid, claims)` (firebase-admin/auth, ou un faux dans les tests). */
export function creerAppelAccorderAcces({ auth, comptes = COMPTES_BASE, journal = () => {} }) {
  return async function appel(requete) {
    const jeton = requete.auth?.token;
    if (!jeton) throw new HttpsError('unauthenticated', 'Connexion nécessaire.');
    if (jeton.email_verified !== true || !(await emailDans(comptes, String(jeton.email ?? ''), 'minuscules'))) {
      journal({ action: 'acces', statut: 'refus' });
      throw new HttpsError('permission-denied', 'Ce compte ne peut pas donner l\'accès à la base.');
    }
    const d = requete.data ?? {};
    const email = typeof d.email === 'string' ? d.email.trim().toLowerCase() : '';
    const espace = typeof d.espace === 'string' ? d.espace.trim() : '';
    const retirer = d.retirer === true;
    if (!EMAIL.test(email)) throw new HttpsError('invalid-argument', 'Adresse e-mail invalide.');
    if (!retirer && !ESPACE.test(espace)) throw new HttpsError('invalid-argument', 'Nom d\'espace invalide (lettres minuscules, chiffres et tirets).');

    const action = retirer ? 'retrait' : 'don';
    let compte;
    try {
      compte = await auth.getUserByEmail(email);
    } catch (e) {
      if (e?.code === 'auth/user-not-found') throw new HttpsError('not-found', 'Aucun compte avec cette adresse.');
      journal({ action, statut: 'erreur' });
      throw new HttpsError('internal', 'Lecture du compte impossible.');
    }
    if (!retirer && compte.emailVerified !== true) throw new HttpsError('failed-precondition', 'L\'adresse e-mail de ce compte n\'est pas vérifiée.');

    // Relecture au plus près de l'écriture : on fusionne avec les mentions du moment, pas avec celles lues plus haut.
    let frais;
    try {
      frais = await auth.getUserByEmail(email);
    } catch {
      journal({ action, statut: 'erreur' });
      throw new HttpsError('internal', 'Lecture du compte impossible.');
    }
    const mentions = { ...(frais.customClaims ?? {}) };
    if (retirer) {
      delete mentions[CLE_ROLE];
      delete mentions[CLE_ESPACE];
    } else {
      mentions[CLE_ROLE] = VALEUR_ROLE;
      mentions[CLE_ESPACE] = espace;
    }
    try {
      await auth.setCustomUserClaims(frais.uid, mentions);
    } catch {
      journal({ action, statut: 'erreur' });
      throw new HttpsError('internal', 'Écriture impossible : le compte de service n\'a peut-être pas le droit de modifier les comptes.');
    }
    journal({ action, statut: 'ok', uid: frais.uid, ...(retirer ? {} : { espace }) });
    return retirer ? { ok: true, effetAu: EFFET, remarque: REMARQUE_RETRAIT } : { ok: true, effetAu: EFFET };
  };
}

/** Une ligne de journal du serveur : seulement l'action et le statut, jamais d'e-mail ni de valeur. */
// L'identifiant du compte (uid) et l'espace sont gardés pour la trace ; jamais l'e-mail.
export function ligneDeJournalBase({ action, statut, uid, espace }) {
  return JSON.stringify({ severity: statut === 'ok' ? 'INFO' : 'WARNING', message: `base ${action} ${statut}`, ...(uid ? { uid: String(uid).slice(0, 128) } : {}), ...(espace ? { espace: String(espace).slice(0, 40) } : {}) });
}
