// Fonction appelable `tableaudebordSaisir` (depuis l'écran Tableau de bord) : contrôle qui appelle, puis passe la main à la logique partagée
// (functions/partage/porte/saisie-tableaudebord.js, copie de scripts/porte/) qui contrôle, écrit en un lot et journalise. L'écran n'écrit JAMAIS lui-même dans la base.
// Même règle d'accès que `veille` : un compte Google vérifié, parmi COMPTES_AUTORISES (liste unique : veille/appel.js). Dans le CRM de Jérôme seulement pour l'instant
// (propriétaire « interne », données à la racine) ; le paramètre `base` est prévu pour le rôle éditeur d'un client, mais rien n'est déployé pour la plateforme.
import { HttpsError } from 'firebase-functions/v2/https';
import { COMPTES_AUTORISES } from './veille/appel.js';
import { saisir, ErreurSaisie } from '../partage/porte/saisie-tableaudebord.js';

const CHAMPS_JOURNAL = ['action', 'statut', 'code', 'indicateurId', 'dureeMs'];

/** Une ligne de journal : liste blanche de champs, valeurs courtes. Jamais la valeur saisie, la date saisie, la note ni l'adresse de l'appelant. */
export function ligneDeJournalSaisie(entree) {
  const ligne = { severity: entree.statut === 'erreur' ? 'ERROR' : 'INFO', message: 'tableaudebordSaisir' };
  for (const c of CHAMPS_JOURNAL) {
    const v = entree[c];
    if (v === undefined || v === null) continue;
    ligne[c] = typeof v === 'string' ? v.slice(0, 80) : v;
  }
  return JSON.stringify(ligne);
}

export function creerAppelSaisie({ donnees, comptes = COMPTES_AUTORISES, journal = () => {}, maintenant = Date.now, base = '', proprietaire = 'interne' }) {
  return async function appel(requete) {
    const debut = maintenant();
    const jeton = requete.auth?.token;
    if (!jeton) throw new HttpsError('unauthenticated', 'Connexion nécessaire.');
    if (jeton.email_verified !== true || !comptes.includes(jeton.email)) throw new HttpsError('permission-denied', 'Ce compte n\'a pas accès à la maintenance.');
    const d = requete.data;
    // L'identifiant n'est journalisé que s'il a la forme d'un identifiant d'indicateur (jamais un texte quelconque collé par erreur).
    const indicateurId = typeof d?.indicateurId === 'string' && /^[a-z0-9][a-z0-9_-]{0,79}$/.test(d.indicateurId) ? d.indicateurId : undefined;
    try {
      const r = await saisir({ donnees, maintenant, auteur: jeton.email, demande: d, base, proprietaire });
      journal({ action: 'saisir', statut: 'ok', indicateurId, dureeMs: maintenant() - debut });
      return { ok: true, niveau: r.niveau, message: r.message, rappel: r.rappel };
    } catch (e) {
      if (e instanceof ErreurSaisie) {
        journal({ action: 'saisir', statut: 'refus', code: e.code, indicateurId, dureeMs: maintenant() - debut });
        throw new HttpsError('failed-precondition', e.message, { code: e.code });
      }
      journal({ action: 'saisir', statut: 'erreur', code: String(e?.name ?? 'inconnue').slice(0, 30), indicateurId, dureeMs: maintenant() - debut });
      throw new HttpsError('internal', 'Une erreur est survenue. Réessaie.');
    }
  };
}
