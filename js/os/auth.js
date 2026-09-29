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
import { auth, MODE_EMULATEURS } from './firebase.js';
import { COMPTES_AUTORISES } from './firebase-config.js';

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
 *  { etat: 'connecte', compte } | { etat: 'deconnecte', refus: boolean }
 * Un compte non autorisé est déconnecté immédiatement, avant toute lecture de données.
 */
export function surveillerCompte(rappel) {
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
    if (!user) {
      rappel({ etat: 'deconnecte', refus });
      refus = false;
      return;
    }
    const compte = compteAutorise(user);
    if (!compte) {
      refus = true;
      await signOut(auth);
      return;
    }
    rappel({ etat: 'connecte', compte });
  });
}

// Mode test uniquement (localhost avec ?emulateurs=1) : connexion d'un compte Google fictif sur l'émulateur Auth,
// sans passer par la fenêtre Google (qui a besoin d'apis.google.com). N'existe jamais en production.
if (MODE_EMULATEURS) {
  window.__chevalierTest = {
    connecter(email, emailVerifie = true) {
      const jeton = JSON.stringify({ sub: `test-${email}`, email, email_verified: emailVerifie });
      return signInWithCredential(auth, GoogleAuthProvider.credential(jeton)).then(() => true);
    },
  };
}
