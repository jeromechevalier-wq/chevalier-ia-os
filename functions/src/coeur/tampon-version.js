// Tampon de version d'un bâtiment (28/11/2026, Console phase 2). Code commun : tourne chez Jérôme (functions/) ET dans l'immeuble des clients (copie functions-plateforme/serveur/).
// Appelé UNIQUEMENT par la fonction planifiée `tamponVersion` (toutes les heures) ; jamais au chargement du module (les tests et le déploiement chargent index.js).
// Fiche reglages_maison/version : { version, version_depuis, structure_code, vu_le } (+ structure_base, écrit plus tard par le script de migration, JAMAIS par ce tampon).
// Changement de version ou de structure : une transaction met la fiche à jour ET ajoute une ligne { version, de_version, le } dans reglages_maison/version/historique.
// Sinon : seulement vu_le. Aucune autre fiche touchée. Une erreur est avalée et notée en une ligne de journal (jamais d'e-mail ni de valeur).
// Ce fichier n'importe ni firebase-functions ni firebase-admin : la base et l'horodatage sont reçus.
import { readFileSync } from 'node:fs';
import { STRUCTURE_DONNEES } from './structure-donnees.js';

export const COLLECTION_VERSION = 'reglages_maison';
export const DOCUMENT_VERSION = 'version';
export const SOUS_COLLECTION_HISTORIQUE = 'historique';

/**
 * La vraie version de l'appli : version.json, copié par scripts/preparer-fonctions.js dans functions/partage/ (et functions-plateforme/serveur/partage/).
 * Lue à l'appel (jamais au chargement) ; illisible : null (le tampon n'écrit rien).
 */
export function versionApplication(url = new URL('../../partage/version.json', import.meta.url)) {
  try {
    const v = JSON.parse(readFileSync(url, 'utf8'))?.version;
    return typeof v === 'string' && /^\d+\.\d+\.\d+$/.test(v) ? v : null;
  } catch {
    return null;
  }
}

/** Une ligne de journal : seulement le statut (et le nom d'une erreur), jamais d'e-mail ni de valeur. */
export function ligneDeJournalTampon({ statut, nom }) {
  return JSON.stringify({ severity: statut === 'erreur' ? 'WARNING' : 'INFO', message: `tampon de version ${statut}`, ...(nom ? { nom } : {}) });
}
const journalParDefaut = (e) => process.stdout.write(`${ligneDeJournalTampon(e)}\n`);

/**
 * Tamponne la version du bâtiment. `db` : base Firestore (SDK d'administration) ; `horodatage` : () => horodatage serveur (FieldValue.serverTimestamp() en vrai).
 * Rend 'change' (fiche et historique écrits), 'vu' (seulement vu_le) ou 'erreur' (rien d'écrit, une ligne de journal). Ne lève jamais.
 */
export async function tamponnerVersion({ db, horodatage, version = versionApplication(), structure = STRUCTURE_DONNEES, journal = journalParDefaut }) {
  try {
    if (!version) throw new Error('version.json illisible');
    if (typeof horodatage !== 'function') throw new Error('horodatage manquant');
    const fiche = db.collection(COLLECTION_VERSION).doc(DOCUMENT_VERSION);
    const resultat = await db.runTransaction(async (tx) => {
      const instantane = await tx.get(fiche);
      const avant = instantane.exists ? instantane.data() : null;
      if (avant && avant.version === version && avant.structure_code === structure) {
        tx.update(fiche, { vu_le: horodatage() });
        return 'vu';
      }
      const nouvelleVersion = avant?.version !== version;
      // merge : structure_base (écrit par le script de migration) est gardé tel quel. version_depuis ne bouge que si la version change.
      tx.set(fiche, { version, structure_code: structure, vu_le: horodatage(), ...(nouvelleVersion || !avant?.version_depuis ? { version_depuis: horodatage() } : {}) }, { merge: true });
      tx.set(fiche.collection(SOUS_COLLECTION_HISTORIQUE).doc(), { version, de_version: typeof avant?.version === 'string' ? avant.version : null, le: horodatage() });
      return 'change';
    });
    if (resultat === 'change') journal({ statut: 'change' });
    return resultat;
  } catch (e) {
    try { journal({ statut: 'erreur', nom: String(e?.name ?? 'Error').slice(0, 40) }); } catch { /* le journal ne fait jamais échouer le tampon */ }
    return 'erreur';
  }
}
