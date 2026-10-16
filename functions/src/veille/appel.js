// Fonction appelable `veille` (depuis l'appli) : contrôle qui appelle, puis passe la main au service. Même règle d'accès que les règles Firestore
// (compteAutorise) : un compte Google vérifié, parmi ceux de Jérôme. Les messages d'erreur sont écrits pour être affichés tels quels.
import { HttpsError } from 'firebase-functions/v2/https';
import { ErreurVeille } from './service.js';

export const COMPTES_AUTORISES = Object.freeze(['jerome.chevalier@gmail.com', 'jeromebot.chevalierbot@gmail.com']);
const ACTIONS = ['ajouterLien', 'resumer'];

export function creerAppelVeille({ service, comptes = COMPTES_AUTORISES, journal = () => {} }) {
  return async function appel(requete) {
    const jeton = requete.auth?.token;
    if (!jeton) throw new HttpsError('unauthenticated', 'Connexion nécessaire.');
    if (jeton.email_verified !== true || !comptes.includes(jeton.email)) throw new HttpsError('permission-denied', 'Ce compte n\'a pas accès à la veille.');
    const d = requete.data;
    if (d === null || typeof d !== 'object' || Array.isArray(d) || !ACTIONS.includes(d.action)) throw new HttpsError('invalid-argument', 'Demande inconnue.');
    try {
      let resultat;
      if (d.action === 'ajouterLien') {
        if (typeof d.url !== 'string' || d.url.length > 2000) throw new ErreurVeille('lien_non_reconnu', 'Ce lien n\'est ni un épisode ni une chaîne YouTube.');
        resultat = await service.ajouterLien({ url: d.url, lancerResume: d.lancerResume === true, auteur: jeton.email });
      } else {
        resultat = await service.resumer({ contenuId: d.contenuId });
      }
      journal({ action: d.action, statut: 'ok' });
      return resultat;
    } catch (e) {
      if (e instanceof ErreurVeille) {
        journal({ action: d.action, statut: 'refus', code: e.code });
        throw new HttpsError('failed-precondition', e.message, { code: e.code });
      }
      journal({ action: d.action, statut: 'erreur', code: String(e?.name ?? 'inconnue').slice(0, 30) });
      throw new HttpsError('internal', 'Une erreur est survenue.');
    }
  };
}
