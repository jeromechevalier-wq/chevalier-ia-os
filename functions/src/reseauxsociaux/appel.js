// Fonction appelable `reseauxsociauxBuffer` (depuis l'appli) : contrôle qui appelle, valide la demande, puis passe la main au service (lecture seule).
// Même règle d'accès que les règles Firestore et que la veille : un compte Google vérifié, parmi ceux de Jérôme. Les messages d'erreur sont écrits pour être affichés tels quels.
import { HttpsError } from 'firebase-functions/v2/https';
import { ErreurBuffer, LIMITE_DEFAUT } from './service.js';
import { COMPTES_AUTORISES } from '../veille/appel.js';

const ACTIONS = ['lirePosts'];

function exigerCompte(requete, comptes) {
  const jeton = requete.auth?.token;
  if (!jeton) throw new HttpsError('unauthenticated', 'Connexion nécessaire.');
  if (jeton.email_verified !== true || !comptes.includes(jeton.email)) throw new HttpsError('permission-denied', 'Ce compte n\'a pas accès aux réseaux sociaux.');
}

/** Fonction appelable `reseauxsociauxReleverMesures` : le relevé de la semaine, à la main (mêmes contrôles d'accès que la lecture). `relever` = releverMesures déjà branchée. */
export function creerAppelReleve({ relever, comptes = COMPTES_AUTORISES, journal = () => {} }) {
  return async function appel(requete) {
    exigerCompte(requete, comptes);
    const d = requete.data;
    if (d === null || typeof d !== 'object' || Array.isArray(d) || d.action !== 'relever') throw new HttpsError('invalid-argument', 'Demande inconnue.');
    try {
      return await relever();
    } catch (e) {
      if (e instanceof ErreurBuffer) {
        journal({ action: 'relever', statut: 'refus', code: e.code });
        throw new HttpsError('failed-precondition', e.message, { code: e.code });
      }
      journal({ action: 'relever', statut: 'erreur', code: String(e?.name ?? 'inconnue').slice(0, 30) });
      throw new HttpsError('internal', 'Une erreur est survenue.');
    }
  };
}

export function creerAppelBuffer({ service, comptes = COMPTES_AUTORISES, journal = () => {} }) {
  return async function appel(requete) {
    exigerCompte(requete, comptes);
    const d = requete.data;
    if (d === null || typeof d !== 'object' || Array.isArray(d) || !ACTIONS.includes(d.action)) throw new HttpsError('invalid-argument', 'Demande inconnue.');
    const limite = d.limite === undefined ? LIMITE_DEFAUT : d.limite;
    if (!Number.isInteger(limite) || limite < 1 || limite > 100) throw new HttpsError('invalid-argument', 'La limite doit être un nombre entier de 1 à 100.');
    try {
      const resultat = await service.lirePosts({ limite });
      journal({ action: d.action, statut: 'ok' });
      return resultat;
    } catch (e) {
      if (e instanceof ErreurBuffer) {
        journal({ action: d.action, statut: 'refus', code: e.code });
        throw new HttpsError('failed-precondition', e.message, { code: e.code });
      }
      journal({ action: d.action, statut: 'erreur', code: String(e?.name ?? 'inconnue').slice(0, 30) });
      throw new HttpsError('internal', 'Une erreur est survenue.');
    }
  };
}
