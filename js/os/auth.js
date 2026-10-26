// Connexion Google et contrôle des comptes autorisés.
import {
  GoogleAuthProvider,
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  onAuthStateChanged,
  signOut,
  signInWithCredential,
} from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { doc, getDoc } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { auth, db, MODE_EMULATEURS } from './firebase.js';
import { COMPTES_AUTORISES } from './firebase-config.js';
import { cheminMembre, lireCompteAvecReprises, MESSAGE_CONNEXION_IMPOSSIBLE, crmOuvertAuxComptes, suiviGenerations } from './membres.js';

export const MESSAGE_REFUS = "Accès refusé : ce compte n'est pas autorisé";

/** Redirection sur téléphone et en appli installée, fenêtre surgissante sur ordinateur. */
export function utiliserRedirection() {
  const installee = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.matchMedia('(max-width: 767px)').matches;
  return installee || mobile;
}

/** Compte autorisé : email vérifié et présent dans la liste. */
export function compteAutorise(user) {
  if (!user || !user.email || user.emailVerified !== true) return null;
  const email = user.email.toLowerCase();
  const profil = COMPTES_AUTORISES[email];
  return profil ? { email, uid: user.uid, ...profil } : null;
}

/**
 * Compte d'un client (plateforme clients) : lit clients/<client>/membres/<e-mail>. Les règles Firestore n'autorisent que la lecture
 * de sa propre fiche. Renvoie { etat: 'ok', compte } | { etat: 'refus' } (fiche absente ou permission refusée)
 * | { etat: 'erreur' } (échec persistant après 3 reprises : on ne déconnecte jamais pour une panne).
 * Ne sert pas au CRM de Jérôme (voir compteAutorise).
 */
export async function compteDuClient(user, client) {
  const test = MODE_EMULATEURS ? window.__chevalierTest : null; // crochets de test (émulateurs seulement)
  return lireCompteAvecReprises({
    user, client,
    attentes: test?.attentesMembre,
    lire: async () => {
      if (test?.echecsMembre > 0) { test.echecsMembre--; throw Object.assign(new Error('échec simulé'), { code: 'unavailable' }); }
      const fiche = await getDoc(doc(db, cheminMembre(client, user.email)));
      return fiche.exists() ? fiche.data() : null;
    },
  });
}

/** Faux sur la plateforme clients (liste vide) : pas de démarrage « CRM de Jérôme », donc jamais de signOut par refus. Test : ?emulateurs=1&sansComptes=1. */
export function crmDisponible() {
  if (MODE_EMULATEURS && new URLSearchParams(location.search).has('sansComptes')) return false;
  return crmOuvertAuxComptes(COMPTES_AUTORISES);
}

function fournisseur() {
  const p = new GoogleAuthProvider();
  p.setCustomParameters({ prompt: 'select_account' });
  return p;
}

const CLE_REDIRECTION = 'chevalier-os.redirection';

export async function connecter() {
  if (utiliserRedirection()) {
    try { sessionStorage.setItem(CLE_REDIRECTION, '1'); } catch { /* stockage indisponible */ }
    await signInWithRedirect(auth, fournisseur());
    return;
  }
  try {
    await signInWithPopup(auth, fournisseur());
  } catch (e) {
    if (e?.code === 'auth/popup-blocked' || e?.code === 'auth/operation-not-supported-in-this-environment') {
      try { sessionStorage.setItem(CLE_REDIRECTION, '1'); } catch { /* stockage indisponible */ }
      await signInWithRedirect(auth, fournisseur());
      return;
    }
    if (e?.code === 'auth/popup-closed-by-user' || e?.code === 'auth/cancelled-popup-request') return;
    throw e;
  }
}

export async function deconnecter() {
  await signOut(auth);
}

/**
 * Surveille le compte connecté. Le rappel reçoit :
 *  { etat: 'connecte', compte } | { etat: 'deconnecte', refus: boolean } | { etat: 'erreur', message, recharger? }
 * Un compte non autorisé est déconnecté immédiatement, avant toute lecture de données.
 * Sans option : CRM de Jérôme (liste fixe, racine). Avec { client } : plateforme clients (appartenance lue dans Firestore).
 */
export function surveillerCompte(rappel, { client = null } = {}) {
  if (!client && !crmDisponible()) return () => {}; // plateforme sans route d'espace : on n'écoute rien et on ne déconnecte personne
  const generations = suiviGenerations();
  let refus = false;
  // Retour d'une connexion par redirection (téléphone, appli installée) : seulement si on en a lancé une.
  let redirectionEnCours = false;
  try { redirectionEnCours = sessionStorage.getItem(CLE_REDIRECTION) === '1'; sessionStorage.removeItem(CLE_REDIRECTION); } catch { /* stockage indisponible */ }
  if (redirectionEnCours) {
    getRedirectResult(auth).catch((e) => {
      if (e?.code && e.code !== 'auth/no-auth-event') rappel({ etat: 'erreur', message: 'La connexion a échoué, réessaie.' });
    });
  }
  return onAuthStateChanged(auth, async (user) => {
    const g = generations.nouvelle();
    const perime = () => generations.perimee(g) || (user && auth.currentUser?.uid !== user.uid); // état changé pendant une attente : on se tait
    if (!user) {
      rappel({ etat: 'deconnecte', refus });
      refus = false;
      return;
    }
    let compte;
    if (client) {
      const lu = await compteDuClient(user, client);
      if (perime()) return;
      if (lu.etat === 'erreur') { rappel({ etat: 'erreur', message: MESSAGE_CONNEXION_IMPOSSIBLE, recharger: true }); return; } // jamais de signOut sur une panne
      compte = lu.compte ?? null;
    } else {
      compte = compteAutorise(user);
    }
    if (!compte) {
      if (perime()) return;
      refus = true;
      await signOut(auth);
      return;
    }
    if (perime()) return;
    rappel({ etat: 'connecte', compte });
  });
}

// Mode test uniquement (localhost avec ?emulateurs=1) : connexion d'un compte Google fictif sur l'émulateur Auth,
// sans passer par la fenêtre Google (qui a besoin d'apis.google.com). N'existe jamais en production.
if (MODE_EMULATEURS) {
  window.__chevalierTest = {
    echecsMembre: 0, // nombre de lectures de la fiche d'appartenance à faire échouer (test de la panne passagère)
    attentesMembre: undefined, // attentes entre reprises (ms), pour accélérer les tests
    connecter(email, emailVerifie = true) {
      const jeton = JSON.stringify({ sub: `test-${email}`, email, email_verified: emailVerifie });
      return signInWithCredential(auth, GoogleAuthProvider.credential(jeton)).then(() => true);
    },
  };
}
