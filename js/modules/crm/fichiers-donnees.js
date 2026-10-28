// Données de l'onglet « Documents » (fichiers rangés chez nous, dans Cloud Storage) : la liste des fiches se lit dans Firestore (collection `documents_stockes`, lecture seule pour le navigateur),
// et le dépôt, le lien d'ouverture et la mise à la corbeille passent par les trois fonctions du serveur (documentDeposer, documentLien, documentSupprimer). Le navigateur n'écrit jamais ni la fiche ni le fichier.
// Chez un client, la demande porte le nom de son espace (déduit de la session, vérifié par le serveur : membre, éditeur pour déposer et supprimer).
import { collection, query, where, onSnapshot } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js';
import { db, app } from '../../os/firebase.js';
import * as CRM from './donnees.js';

export const COLLECTION_FICHIERS = 'documents_stockes';
export const MESSAGE_RESEAU_FICHIERS = 'Ça n’a pas abouti. Vérifie ta connexion internet, puis réessaie : rien n’a été perdu.';
const CODES_LISIBLES = ['permission-denied', 'invalid-argument', 'failed-precondition', 'not-found', 'unauthenticated'];
const DELAI_DEPOT_MS = 300_000; // le serveur a 300 s pour un gros fichier

/** Erreur d'appel -> message à afficher (le SDK ajoute « [403] » en fin de message : on l'enlève). */
export function messageDErreurFichier(e) {
  const code = String(e?.code ?? '').replace('functions/', '');
  const message = String(e?.message ?? '').replace(/\s*\[\d{3}\]$/, '').trim();
  return CODES_LISIBLES.includes(code) && message && message !== code ? message : MESSAGE_RESEAU_FICHIERS;
}

const fonctions = () => getFunctions(app, 'europe-west9');
async function appeler(nom, demande, options = {}) {
  const base = CRM.cheminDeBase();
  const client = base ? base.split('/')[1] : undefined;
  try {
    const r = await httpsCallable(fonctions(), nom, options)(client ? { client, ...demande } : demande);
    return r.data;
  } catch (e) {
    console.warn('Documents : appel refusé', nom, e?.code);
    throw Object.assign(new Error(messageDErreurFichier(e)), { code: e?.code });
  }
}

const ms = (d) => (typeof d?.toMillis === 'function' ? d.toMillis() : d instanceof Date ? d.getTime() : typeof d?.seconds === 'number' ? d.seconds * 1000 : 0);

/** Fiches visibles (hors corbeille) d'une affaire ou d'un projet, du plus récent au plus ancien. Une seule condition d'égalité (pas d'index composite). */
export function fichesVisibles(docs, cibleType) {
  return docs.filter((f) => f.cibleType === cibleType && !f.supprimeLe).sort((a, b) => ms(b.creeLe) - ms(a.creeLe));
}

/** Écoute les fichiers d'une fiche. `surDonnees(liste)` à chaque changement ; `surErreur(e)` si la lecture échoue. Rend la fonction qui arrête l'écoute. */
export function ecouterFichiers(cibleType, cibleId, surDonnees, surErreur) {
  const q = query(collection(db, CRM.chemin(COLLECTION_FICHIERS)), where('cibleId', '==', cibleId));
  return onSnapshot(q, (snap) => surDonnees(fichesVisibles(snap.docs.map((d) => ({ ...d.data(), id: d.id })), cibleType)), (e) => { console.warn('Documents : lecture impossible', e?.code); surErreur?.(e); });
}

/** Dépose un fichier : { affaireId | projetId, nom, contenuBase64, typeMime }. Rend { id, nom, taille, typeMime }. */
export const deposerFichier = (cible, { nom, contenuBase64, typeMime }) => appeler('documentDeposer', { ...cible, nom, contenuBase64, typeMime }, { timeout: DELAI_DEPOT_MS });
/** Lien de lecture signé de 5 minutes : { url, expireDans, nom }. */
export const lienFichier = (documentId, { telecharger = false } = {}) => appeler('documentLien', { documentId, ...(telecharger ? { telecharger: true } : {}) });
/** Met le fichier à la corbeille (le journal des modifications peut le restaurer). */
export const supprimerFichier = (documentId) => appeler('documentSupprimer', { documentId });

/** Contenu d'un fichier en base64 (sans l'en-tête « data: »), avec la progression de la lecture (0 à 1). */
export function lireEnBase64(fichier, surProgression = () => {}) {
  return new Promise((resolve, reject) => {
    const lecteur = new FileReader();
    lecteur.onprogress = (e) => { if (e.lengthComputable) surProgression(e.loaded / e.total); };
    lecteur.onerror = () => reject(new Error('Le fichier n’a pas pu être lu.'));
    lecteur.onload = () => {
      const texte = String(lecteur.result ?? '');
      resolve(texte.slice(texte.indexOf(',') + 1));
    };
    lecteur.readAsDataURL(fichier);
  });
}
