// Fonctions appelables du module Rendez-vous chez Jérôme (projet chevalier-ia-os) :
//  - `rdvEtat()`                                  : { branche: true | false, peutConfigurer }, pour que l'écran grise « Envoyer » tant que l'envoi des SMS n'est pas branché ;
//  - `rdvEnvoyer({ action: 'propositions', rendezVousId })`           : envoie les premières propositions de créneaux ;
//  - `rdvEnvoyer({ action: 'renvoyer', rendezVousId, participantId })` : refait partir le SMS abandonné d'un participant ;
//  - `rdvEnvoyer({ action: 'sms', rendezVousId, type, texte })`       : SMS de pluie ou d'annulation écrit à la main (jamais retardé par la plage d'envoi).
// Même accès que les autres fonctions de devis (compte Google vérifié parmi COMPTES_AUTORISES). Le journal Cloud ne reçoit ni numéro, ni texte, ni identifiant de rendez-vous.
import { HttpsError } from 'firebase-functions/v2/https';
import { COMPTES_AUTORISES } from './veille/appel.js';
import { exigerCompteAutorise } from './devis-appel.js';
import { ESPACE_JEROME } from './coeur/sms-direct.js';
import { estAdministrateur } from '../partage/administrateur.js';
import { etatEnvoi, envoyerPropositions, envoyerSms, renvoyerSms, ErreurRdvEnvoi } from './coeur/rdv-envoi.js';

/** Erreur du service -> erreur d'appel lisible ; une panne inattendue devient une phrase neutre (jamais de détail technique). */
export function enErreurRdv(e) {
  if (e instanceof ErreurRdvEnvoi) return new HttpsError(e.code, e.message, { code: e.code });
  return null;
}

export function creerAppelRdvEtat({ sortie, comptes = COMPTES_AUTORISES }) {
  return async function appel(requete) {
    exigerCompteAutorise(requete, comptes);
    const t = requete.auth?.token;
    // `peutConfigurer` : l'écran montre la saisie de la connexion SMS seulement à Jérôme (le serveur la refuse de toute façon à tout autre compte : rdvConnexionSms).
    return { ...(await etatEnvoi({ sortie, espace: ESPACE_JEROME })), peutConfigurer: estAdministrateur(t?.email, t?.email_verified === true) };
  };
}

export function creerAppelRdvEnvoyer({ donnees, sortie, comptes = COMPTES_AUTORISES, journal = () => {}, maintenant = Date.now }) {
  return async function appel(requete) {
    const debut = maintenant();
    exigerCompteAutorise(requete, comptes);
    const d = requete.data && typeof requete.data === 'object' ? requete.data : {};
    const commun = { donnees: donnees(), ctx: { maintenant: new Date(maintenant()) }, espace: ESPACE_JEROME, sortie, rendezVousId: d.rendezVousId };
    try {
      let r;
      if (d.action === 'propositions') r = await envoyerPropositions(commun);
      else if (d.action === 'renvoyer') r = await renvoyerSms({ ...commun, participantId: d.participantId });
      else if (d.action === 'sms') r = await envoyerSms({ ...commun, type: d.type, texte: d.texte });
      else throw new ErreurRdvEnvoi('invalid-argument', 'Action inconnue.');
      journal({ action: `rdvEnvoyer.${d.action}`, statut: 'ok', dureeMs: maintenant() - debut });
      return r;
    } catch (e) {
      const erreur = enErreurRdv(e);
      if (erreur) { journal({ action: `rdvEnvoyer.${String(d.action).slice(0, 20)}`, statut: 'refus', code: e.code, dureeMs: maintenant() - debut }); throw erreur; }
      journal({ action: 'rdvEnvoyer', statut: 'erreur', code: String(e?.name ?? 'inconnue').slice(0, 30), dureeMs: maintenant() - debut });
      throw new HttpsError('internal', 'Une erreur est survenue. Réessaie.');
    }
  };
}
