// Fonction appelable `rdvConnexionSms` chez Jérôme (projet chevalier-ia-os) : l'écran Réglages > Rendez-vous y demande de ranger la connexion ClickSend dans Secret Manager.
//  - `{ action: 'etat' }`                                              -> { enregistre, adresse, expediteur } (l'adresse des réponses, avec son jeton ; jamais la clé) ;
//  - `{ action: 'enregistrer', identifiant, cle, expediteur?, regenererAdresse? }` -> { ok, adresse, adresseChangee } (clé vérifiée auprès de ClickSend avant d'être rangée) ;
//  - `{ action: 'regenerer' }`                                         -> { ok, adresse, adresseChangee: true }.
// RÉSERVÉ à Jérôme : l'identité de l'appelant (e-mail Google vérifié, js/os/administrateur.js) est contrôlée ICI, à l'exécution ; un autre compte, même autorisé ailleurs (son compte d'assistant), reçoit « Action non autorisée. ».
// Le journal Cloud ne reçoit ni clé, ni identifiant, ni jeton, ni adresse.
import { HttpsError } from 'firebase-functions/v2/https';
import { estAdministrateur } from '../partage/administrateur.js';
import { ErreurConnexionSms, executerConnexion, REFUS_NEUTRE } from './coeur/connexion-sms.js';
import { ESPACE_JEROME } from './coeur/sms-direct.js';

export function creerAppelRdvConnexion({ connexion, journal = () => {}, estAdmin = estAdministrateur, maintenant = Date.now }) {
  return async function appel(requete) {
    const debut = maintenant();
    const auth = requete.auth;
    if (!auth?.token) throw new HttpsError('unauthenticated', 'Connexion requise.');
    if (!estAdmin(auth.token.email, auth.token.email_verified === true)) { journal({ action: 'connexion', statut: 'refus', dureeMs: maintenant() - debut }); throw new HttpsError('permission-denied', REFUS_NEUTRE); }
    const d = requete.data && typeof requete.data === 'object' ? requete.data : {};
    const action = ['etat', 'enregistrer', 'regenerer'].includes(d.action) ? d.action : 'inconnue';
    try {
      const r = await executerConnexion(connexion, ESPACE_JEROME, d);
      journal({ action: `connexion.${action}`, statut: 'ok', dureeMs: maintenant() - debut });
      return r;
    } catch (e) {
      if (e instanceof ErreurConnexionSms || e?.name === 'ErreurConnexionSms') { journal({ action: `connexion.${action}`, statut: 'refus', code: e.code, dureeMs: maintenant() - debut }); throw new HttpsError(e.code, e.message, { code: e.code }); }
      journal({ action: `connexion.${action}`, statut: 'erreur', code: String(e?.name ?? 'inconnue').slice(0, 30), dureeMs: maintenant() - debut });
      throw new HttpsError('internal', 'Une erreur est survenue. Réessaie.');
    }
  };
}
