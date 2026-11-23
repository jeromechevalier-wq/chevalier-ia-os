// Fonctions appelables du module Pilotage chez Jérôme (projet chevalier-ia-os) :
//  - `pilotageLire({ apercu?, exporter?, onglet?, filtres? })` : { titre, tuiles: [{ id, titre, type, largeur?, aide?, …config du type, option?, lignes }], erreurs: [{ id, message }], onglets?, onglet? } pour l'écran (voir docs/pilotage.md). Compte autorisé de la racine (Jérôme, son compte d'assistant) ;
//                                                    `apercu` (brouillon de réglage) et `exporter` (le document enregistré) sont RÉSERVÉS à Jérôme (permission-denied sinon) ;
//  - `pilotageEnregistrerReglages({ reglages })`   : RÉSERVÉ à Jérôme (identité contrôlée ICI, à l'exécution, par js/os/administrateur.js) ; valide, incrémente la version, écrit et journalise.
// Le filtre « qui voit quelle tuile » est appliqué par le service, côté serveur. Le journal Cloud ne reçoit ni adresse, ni nom de vue, ni ligne de données, ni valeur du secret.
import { HttpsError } from 'firebase-functions/v2/https';
import { COMPTES_AUTORISES } from '../veille/appel.js';
import { estAdministrateur } from '../../partage/administrateur.js';
import { ErreurPilotage } from './reglages.js';

const REFUS_ADMIN = 'Cette action est réservée à l\'administrateur.';

/** Erreur du module -> erreur d'appel lisible ; null si ce n'en est pas une (une panne inattendue devient une phrase neutre, sans détail). */
export function enErreurPilotage(e) {
  if (e instanceof ErreurPilotage || e?.name === 'ErreurPilotage') return new HttpsError(e.code, e.message, { code: e.code, ...(e.raison ? { raison: e.raison } : {}) }); // `raison: 'filtre'` : un filtre a été refusé (jamais sa valeur)
  return null;
}

function exigerAdministrateur(requete, estAdmin) {
  const jeton = requete.auth?.token;
  if (!jeton) throw new HttpsError('unauthenticated', 'Connexion nécessaire.');
  if (!estAdmin(jeton.email, jeton.email_verified === true)) throw new HttpsError('permission-denied', REFUS_ADMIN);
  return jeton;
}

export function creerAppelPilotageLire({ service, comptes = COMPTES_AUTORISES, estAdmin = estAdministrateur, journal = () => {}, maintenant = Date.now }) {
  return async function appel(requete) {
    const debut = maintenant();
    const jeton = requete.auth?.token;
    if (!jeton) throw new HttpsError('unauthenticated', 'Connexion nécessaire.');
    if (jeton.email_verified !== true || typeof jeton.email !== 'string' || !comptes.includes(jeton.email)) {
      journal({ action: 'lire', statut: 'refus', dureeMs: maintenant() - debut }); // jamais l'adresse
      throw new HttpsError('permission-denied', 'Ce compte n\'a pas accès au Pilotage.');
    }
    const d = requete.data && typeof requete.data === 'object' && !Array.isArray(requete.data) ? requete.data : {};
    const demandeApercu = d.apercu !== undefined && d.apercu !== null;
    const demandeExport = d.exporter === true;
    if ((demandeApercu || demandeExport) && !estAdmin(jeton.email, jeton.email_verified === true)) {
      journal({ action: demandeExport ? 'exporter' : 'apercu', statut: 'refus', dureeMs: maintenant() - debut });
      throw new HttpsError('permission-denied', REFUS_ADMIN);
    }
    const action = demandeExport ? 'exporter' : demandeApercu ? 'apercu' : 'lire';
    try {
      // Seuls `apercu`, `exporter`, `onglet` et `filtres` sont transmis ; `onglet` est un identifiant d'onglet et `filtres` des VALEURS de filtres déclarés, tous deux vérifiés par le service contre le réglage : un nom de vue ou de colonne passé librement par le navigateur n'est jamais lu.
      const r = await service.lire({ email: jeton.email, apercu: demandeApercu ? d.apercu : undefined, exporter: demandeExport, onglet: d.onglet, filtres: d.filtres });
      journal({ action, statut: 'ok', dureeMs: maintenant() - debut, tuiles: r.tuiles?.length, erreurs: r.erreurs?.length });
      return r;
    } catch (e) {
      const erreur = enErreurPilotage(e);
      if (erreur) { journal({ action, statut: 'refus', code: e.code, dureeMs: maintenant() - debut }); throw erreur; }
      journal({ action, statut: 'erreur', code: String(e?.name ?? 'inconnue').slice(0, 30), dureeMs: maintenant() - debut });
      throw new HttpsError('internal', 'Une erreur est survenue. Réessaie.');
    }
  };
}

export function creerAppelPilotageEnregistrer({ service, estAdmin = estAdministrateur, journal = () => {}, maintenant = Date.now }) {
  return async function appel(requete) {
    const debut = maintenant();
    let jeton;
    try { jeton = exigerAdministrateur(requete, estAdmin); } catch (e) { journal({ action: 'enregistrer', statut: 'refus', dureeMs: maintenant() - debut }); throw e; }
    const d = requete.data && typeof requete.data === 'object' && !Array.isArray(requete.data) ? requete.data : {};
    try {
      const r = await service.enregistrer({ reglages: d.reglages, acteur: String(jeton.email).trim().toLowerCase() });
      journal({ action: 'enregistrer', statut: 'ok', dureeMs: maintenant() - debut, tuiles: r.tuiles });
      return r;
    } catch (e) {
      const erreur = enErreurPilotage(e);
      if (erreur) { journal({ action: 'enregistrer', statut: 'refus', code: e.code, dureeMs: maintenant() - debut }); throw erreur; }
      journal({ action: 'enregistrer', statut: 'erreur', code: String(e?.name ?? 'inconnue').slice(0, 30), dureeMs: maintenant() - debut });
      throw new HttpsError('internal', 'Une erreur est survenue. Réessaie.');
    }
  };
}

/** Une ligne de journal du serveur : liste blanche de champs, valeurs courtes, jamais d'adresse ni de donnée. */
export function ligneDeJournalPilotage({ action, statut, code, dureeMs, tuiles, erreurs, type, etat }) {
  const court = (v) => (v === undefined ? undefined : String(v).slice(0, 30));
  return JSON.stringify({ severity: statut === 'ok' ? 'INFO' : 'WARNING', message: `pilotage ${court(action)} ${court(statut)}`, code: court(code), dureeMs, tuiles, erreurs, type: court(type), etat: court(etat) });
}
