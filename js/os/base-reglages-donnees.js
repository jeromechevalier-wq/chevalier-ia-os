// Données de Réglages > « Connexion à la base » (24/11/2026) : lecture et écriture de `base_parametres/connexion` (Jérôme seul : règles Firestore),
// et appel de la fonction `baseAccorderAcces` (donner ou retirer l'accès d'un compte ; identité de Jérôme contrôlée côté serveur à chaque appel).
// Écriture directe, sans le journal commun : le document ne contient que la clé publique et des adresses, et le journal ne s'efface jamais ;
// l'auteur et la date sont dans le document (`modifiePar`, `modifieLe`). Décision écrite dans la PR.
// Aucune adresse n'est écrite ici : tout vient de ce que Jérôme saisit.
import { doc, getDocFromServer, setDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js';
import { db, app, MODE_EMULATEURS } from './firebase.js';
import { controlerConnexion, definirConnexion, messageErreurAcces } from './base-reglages.js';

const fonctions = () => getFunctions(app, 'europe-west9');
const REFERENCE = ['base_parametres', 'connexion'];

/** Lit les réglages sur le serveur (jamais le cache) et les met en mémoire pour `lireConnexion`. Renvoie les valeurs brutes (ou null si rien n'est enregistré) ; lève une erreur si la lecture échoue. */
export async function chargerConnexion() {
  const fiche = await getDocFromServer(doc(db, ...REFERENCE));
  const brut = fiche.exists() ? fiche.data() : null;
  definirConnexion(brut);
  return brut;
}

/** Enregistre les réglages (contrôlés une dernière fois ici) et les met en mémoire. Lève une Error dont le message est lisible. */
export async function enregistrerConnexion(valeurs, compte) {
  const r = controlerConnexion(valeurs);
  if (!r.ok) throw new Error('Des champs sont à corriger.');
  try {
    await setDoc(doc(db, ...REFERENCE), { ...r.connexion, modifiePar: String(compte?.email ?? ''), modifieLe: serverTimestamp() });
  } catch (e) {
    console.warn('Connexion à la base : enregistrement impossible', e?.code);
    throw new Error('L’enregistrement n’a pas abouti. Vérifie ta connexion internet, puis réessaie : ce que tu as saisi est conservé.');
  }
  definirConnexion(r.connexion);
}

/**
 * Test de la connexion, par défaut. La couche d'accès à la base (js/os/supabase.js) n'est branchée qu'à l'étape suivante : sans elle, le test le dit en clair.
 * L'écran reçoit en pratique un `testerConnexion` injecté ; en mode émulateurs seulement, un crochet de test peut le remplacer (jamais d'appel réseau réel dans les tests).
 */
export async function testerConnexionParDefaut() {
  const crochet = MODE_EMULATEURS ? window.__testerConnexionBase : null;
  if (typeof crochet === 'function') return crochet();
  throw new Error('Le test n’est pas encore branché : la couche d’accès à la base arrive à l’étape suivante.');
}

/** Donne (retirer = false) ou retire l'accès d'un compte à la base. Renvoie la réponse du serveur ; lève une Error au message lisible. */
export async function accorderAcces({ email, espace, retirer = false }) {
  try {
    const r = await httpsCallable(fonctions(), 'baseAccorderAcces')({ email, espace, ...(retirer ? { retirer: true } : {}) });
    return r.data;
  } catch (e) {
    console.warn('Connexion à la base : accès refusé', e?.code);
    throw Object.assign(new Error(messageErreurAcces(e)), { code: e?.code });
  }
}
