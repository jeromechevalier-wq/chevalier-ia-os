// Données de « Mon espace » (2.8.0) : lecture de la fiche de marque et des membres, et l'appel à la fonction serveur « espaceReglages ».
// L'écran n'ÉCRIT RIEN dans Firestore (les règles l'interdisent) : tout passe par la fonction, qui revérifie que l'appelant est éditeur.
// Les messages de refus du serveur sont écrits pour être lus tels quels ; une panne réseau ou une erreur inattendue reçoit un message générique qui dit quoi faire.
import { doc, collection, getDocFromServer, getDocsFromServer } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js';
import { db, app } from './firebase.js';
import { normaliserMarque } from './marque.js';

const fonctions = () => getFunctions(app, 'europe-west9');
const CODES_LISIBLES = ['permission-denied', 'invalid-argument', 'failed-precondition', 'resource-exhausted', 'already-exists', 'not-found', 'unauthenticated'];

export const MESSAGE_RESEAU = 'Ça n’a pas abouti. Vérifie ta connexion internet, puis réessaie : ce que tu as écrit est conservé.';

/** Marque lue sur le serveur (jamais le cache) : { nom, couleur, accueil, logo, images: [adresses] } ; lève une erreur si la lecture échoue. */
export async function lireMarqueEspace(client) {
  const fiche = await getDocFromServer(doc(db, 'marques', client));
  const m = fiche.exists() ? normaliserMarque(fiche.data()) : null;
  if (!m) throw new Error('Fiche de marque introuvable');
  return { nom: m.nom, couleur: m.couleur, accueil: m.accueil, logo: m.logo, images: m.images.map((i) => i.url) };
}

/** Membres de l'espace [{ email, role, nom }] triés par adresse (lecture réservée aux membres par les règles) ; lève une erreur si la lecture échoue. */
export async function lireMembresEspace(client) {
  const liste = await getDocsFromServer(collection(db, 'clients', client, 'membres'));
  return liste.docs.map((d) => ({ email: d.id, role: d.data().role, nom: typeof d.data().nom === 'string' ? d.data().nom : '' }))
    .filter((m) => m.role === 'editeur' || m.role === 'lecteur')
    .sort((a, b) => a.email.localeCompare(b.email, 'fr'));
}

/** Erreur d'appel -> message à afficher. Le SDK Firebase ajoute « [403] » (le statut HTTP) à la fin du message du serveur : on l'enlève. */
export function messageDErreur(e) {
  const code = String(e?.code ?? '').replace('functions/', '');
  const message = String(e?.message ?? '').replace(/\s*\[\d{3}\]$/, '').trim();
  return CODES_LISIBLES.includes(code) && message && message !== code ? message : MESSAGE_RESEAU;
}

/** Appelle la fonction serveur : renvoie ses données, ou lève une Error dont le message est celui à montrer. */
export async function appelerEspace(client, action, donnees = {}) {
  try {
    const r = await httpsCallable(fonctions(), 'espaceReglages')({ client, action, ...donnees });
    return r.data;
  } catch (e) {
    console.warn('Mon espace : appel refusé', e?.code);
    throw Object.assign(new Error(messageDErreur(e)), { code: e?.code });
  }
}
