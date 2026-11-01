// Fonctions appelables « Préparer l'e-mail » chez Jérôme (projet chevalier-ia-os) :
//  - `devisPreparerEmail({ devisId, destinataires?, copie?, objet?, message? })` (les 4 derniers facultatifs : cet envoi seulement, revérifiés par le serveur) : demande à n8n de créer un BROUILLON Gmail (PDF joint) pour un devis finalisé. Réponse : { ok, demandeId } (le travail de n8n est asynchrone :
//    l'écran se met à jour quand le serveur écrit `emailPrepare` sur le devis). Ni l'appli ni n8n n'envoient l'e-mail.
//  - `devisPreparerEmailEtat()` : { branche: true | false }, pour que l'écran masque le bouton tant que ce n'est pas branché. Ne rend jamais l'adresse ni le secret.
// Même accès que les autres fonctions de devis (compte Google vérifié parmi COMPTES_AUTORISES). Le journal Cloud ne reçoit ni le contenu du devis, ni son identifiant, ni l'adresse de l'appelant.
import { HttpsError } from 'firebase-functions/v2/https';
import { COMPTES_AUTORISES } from './veille/appel.js';
import { exigerCompteAutorise, enErreurAppel } from './devis-appel.js';
import { demanderPreparation } from './coeur/devis-email.js';
import { ErreurDevis, detailErreur } from './coeur/devis.js';
import { ESPACE_JEROME } from './coeur/n8n-sortie.js';

export function creerAppelPreparerEmail({ donnees, sortie, comptes = COMPTES_AUTORISES, journal = () => {}, maintenant = Date.now, genererId }) {
  return async function appel(requete) {
    const debut = maintenant();
    const jeton = exigerCompteAutorise(requete, comptes);
    const d = requete.data && typeof requete.data === 'object' ? requete.data : {};
    try {
      const r = await demanderPreparation({
        donnees: donnees(), ctx: { acteur: String(jeton.email).toLowerCase(), via: 'ecran', maintenant: new Date(maintenant()) },
        devisId: d.devisId, espace: ESPACE_JEROME, sortie, saisie: d, ...(genererId ? { genererId } : {}),
      });
      journal({ action: 'preparerEmail', statut: 'ok', dureeMs: maintenant() - debut });
      return { ok: true, demandeId: r.demandeId };
    } catch (e) {
      const erreur = enErreurAppel(e);
      if (erreur) {
        journal({ action: 'preparerEmail', statut: e instanceof ErreurDevis && e.code === 'n8n_indisponible' ? 'erreur' : 'refus', code: e.code, dureeMs: maintenant() - debut });
        throw erreur;
      }
      journal({ action: 'preparerEmail', statut: 'erreur', code: detailErreur(e).code || String(e?.name ?? 'inconnue').slice(0, 30), detail: detailErreur(e).detail, dureeMs: maintenant() - debut });
      throw new HttpsError('internal', 'Une erreur est survenue. Réessaie.');
    }
  };
}

export function creerAppelEtatPreparerEmail({ sortie, comptes = COMPTES_AUTORISES }) {
  return async function appel(requete) {
    exigerCompteAutorise(requete, comptes);
    return { branche: (await sortie.branche(ESPACE_JEROME)) === true };
  };
}
