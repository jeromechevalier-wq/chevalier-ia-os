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
import { auth, db, MODE_EMULATEURS, CROCHETS_TEST } from './firebase.js';
import { cheminMembre, lireCompteAvecReprises, MESSAGE_CONNEXION_IMPOSSIBLE, suiviGenerations } from './membres.js';
import { lirePublic, lireEcran, crmOuvert, definirModeCrm, viderComptesMaison, MESSAGE_ECRAN_ABSENT } from './comptes-maison.js';
import { retenirPublic } from './identite-maison.js';

export const MESSAGE_REFUS = "Accès refusé : ce compte n'est pas autorisé";

/** Redirection sur téléphone et en appli installée, fenêtre surgissante sur ordinateur. */
export function utiliserRedirection() {
  const installee = window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone === true;
  const mobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || window.matchMedia('(max-width: 767px)').matches;
  return installee || mobile;
}

// Chantier 0 (26/11/2026) : aucun compte n'est écrit dans le code. Le CRM lit reglages_maison/public avant la connexion (le CRM existe-t-il ici ?) et
// reglages_maison/ecran après (comptes, noms, portraits), voir js/os/comptes-maison.js. Les règles Firestore restent la vraie protection.
const DOC_PUBLIC = ['reglages_maison', 'public'];
const DOC_ECRAN = ['reglages_maison', 'ecran'];
const lireDocument = (chemin) => async () => {
  const fiche = await getDoc(doc(db, ...chemin));
  return fiche.exists() ? fiche.data() : null;
};

/**
 * Compte du CRM : e-mail vérifié, lecture de reglages_maison/ecran permise par les règles (compte de la fiche serveur) et présent dans ses personnes.
 * Rend { etat: 'ok', compte: { email, uid, nom, avatar } } | { etat: 'refus' } | { etat: 'absent' } | { etat: 'erreur' } (voir lireEcran).
 */
export async function compteAutorise(user) {
  const test = MODE_EMULATEURS ? window.__chevalierTest : null; // crochets de test (émulateurs seulement)
  return lireEcran({
    user,
    attentes: test?.attentesMembre,
    lire: async () => {
      if (test?.echecsEcran > 0) { test.echecsEcran--; throw Object.assign(new Error('échec simulé'), { code: 'unavailable' }); }
      return lireDocument(DOC_ECRAN)();
    },
  });
}

/**
 * Démarrage du CRM, avant toute connexion : lit reglages_maison/public. Rend { etat: 'crm' | 'plateforme' | 'absent' | 'erreur' } (voir lirePublic).
 * Test : ?emulateurs=1&sansComptes=1 simule la plateforme (aucune lecture).
 */
export async function preparerCrm() {
  if (MODE_EMULATEURS && new URLSearchParams(location.search).has('sansComptes')) { definirModeCrm(false); return { etat: 'plateforme' }; }
  const test = MODE_EMULATEURS ? CROCHETS_TEST : null; // crochet posé avant le chargement (addInitScript, lu par firebase.js) : panne simulée de la lecture
  let echecs = Number(test?.echecsPublic) || 0;
  return lirePublic({
    attentes: test?.attentesPublic,
    lire: async () => {
      if (echecs > 0) { echecs--; throw Object.assign(new Error('échec simulé'), { code: 'unavailable' }); }
      const donnees = await lireDocument(DOC_PUBLIC)();
      retenirPublic(donnees); // nom_espace / connexion_neutre (facultatifs) : identité d'une maison de client, absente chez Jérôme
      return donnees;
    },
  });
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

/** Faux sur la plateforme clients (reglages_maison/public illisible) ou tant que preparerCrm() n'a pas lu le document : jamais de signOut par refus. */
export function crmDisponible() {
  if (MODE_EMULATEURS && new URLSearchParams(location.search).has('sansComptes')) return false;
  return crmOuvert();
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
 * Sans option : CRM de Jérôme (reglages_maison/ecran, racine). Avec { client } : plateforme clients (appartenance lue dans Firestore).
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
      if (!client) viderComptesMaison();
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
      const lu = await compteAutorise(user);
      if (perime()) return;
      if (lu.etat === 'erreur') { rappel({ etat: 'erreur', message: MESSAGE_CONNEXION_IMPOSSIBLE, recharger: true }); return; } // panne : jamais de signOut
      if (lu.etat === 'absent') { rappel({ etat: 'erreur', message: MESSAGE_ECRAN_ABSENT, recharger: true }); return; } // fiche manquante : message clair, sans signOut
      compte = lu.compte ?? null;
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
    echecsEcran: 0, // idem pour reglages_maison/ecran (CRM)
    attentesMembre: undefined, // attentes entre reprises (ms), pour accélérer les tests
    connecter(email, emailVerifie = true) {
      const jeton = JSON.stringify({ sub: `test-${email}`, email, email_verified: emailVerifie });
      return signInWithCredential(auth, GoogleAuthProvider.credential(jeton)).then(() => true);
    },
  };
}
