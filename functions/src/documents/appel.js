// Fonctions appelables des fichiers de l'onglet « Documents » chez Jérôme : `documentDeposer`, `documentLien`, `documentSupprimer`.
// Réservées aux comptes autorisés (comme le module Devis : chez Jérôme il n'y a pas de rôle lecteur/éditeur). Le travail est dans coeur/documents.js, le MÊME code que chez les clients
// (functions-plateforme/src/documents.js, qui contrôle le rôle du membre). Le journal Cloud ne reçoit jamais le nom d'un fichier, son contenu, son identifiant, ni l'adresse de l'appelant.
// Ce fichier n'est PAS copié chez les clients (il porte les comptes autorisés de Jérôme).
import { HttpsError } from 'firebase-functions/v2/https';
import { COMPTES_AUTORISES } from '../veille/appel.js';
import { exigerCompteAutorise } from '../devis-appel.js';
import { operationDeposer, operationLien, operationSupprimer, versErreurAppel } from '../coeur/documents.js';

const CHAMPS_JOURNAL = ['action', 'statut', 'code', 'dureeMs'];
export const MESSAGE_GENERIQUE = 'Une erreur est survenue. Réessayez.';

export function ligneDeJournalDocuments(entree) {
  const ligne = { severity: entree.statut === 'erreur' ? 'ERROR' : 'INFO', message: 'documents' };
  for (const c of CHAMPS_JOURNAL) {
    const v = entree[c];
    if (v === undefined || v === null) continue;
    ligne[c] = typeof v === 'string' ? v.slice(0, 40) : v;
  }
  return JSON.stringify(ligne);
}

const stockageDe = (s) => (typeof s === 'function' ? s() : s) ?? null;

/** `operation` : 'deposer' | 'lien' | 'supprimer'. `donnees()` : accès aux données ; `espace` : '' chez Jérôme ; `stockage` : stockage.js (ou fonction qui le rend, ou null). */
export function creerAppelDocument(operation, { donnees, espace = '', comptes = COMPTES_AUTORISES, stockage, journal = () => {}, maintenant = Date.now }) {
  const faire = { deposer: operationDeposer, lien: operationLien, supprimer: operationSupprimer }[operation];
  if (!faire) throw new Error(`Opération de document inconnue : ${operation}`);
  return async function appel(requete) {
    const debut = maintenant();
    const jeton = exigerCompteAutorise(requete, comptes);
    const ctx = { acteur: String(jeton.email).toLowerCase(), via: 'ecran', maintenant: new Date(maintenant()) };
    try {
      const r = await faire({ donnees: donnees(), stockage: stockageDe(stockage), espace, ctx, demande: requete.data });
      journal({ action: operation, statut: 'ok', dureeMs: maintenant() - debut });
      return r;
    } catch (e) {
      const attendue = versErreurAppel(e);
      if (attendue) {
        journal({ action: operation, statut: attendue.code === 'internal' ? 'erreur' : 'refus', code: attendue.detail, dureeMs: maintenant() - debut });
        throw new HttpsError(attendue.code, attendue.message, { code: attendue.detail });
      }
      journal({ action: operation, statut: 'erreur', code: String(e?.name ?? 'inconnue').slice(0, 30), dureeMs: maintenant() - debut });
      throw new HttpsError('internal', MESSAGE_GENERIQUE);
    }
  };
}
