// Réglages de la connexion à la base des modules Achats (24/11/2026, décision de Jérôme : modules chez lui seulement pour commencer).
// Ce fichier est PUR (aucun import, aucun réseau, aucune adresse écrite en dur) : il contrôle ce que Jérôme saisit et garde en mémoire la connexion lue dans Firestore
// (`base_parametres/connexion`, voir base-reglages-donnees.js). La couche d'accès (js/os/supabase.js, PR suivante) reçoit `lireConnexion` par injection.
//
// Contrat figé : lireConnexion() -> { adresseBase, clePublique, espace, webhooks: { validation, actions, suggestions, ajoutFacture } }
// ou lève une erreur lisible « Connexion à la base non réglée ». Elle est synchrone : elle lit la mémoire, remplie par `definirConnexion`
// (chargée au démarrage par base-reglages-donnees.js > chargerConnexion).

export const MESSAGE_NON_REGLEE = 'Connexion à la base non réglée';
export const NOMS_WEBHOOKS = Object.freeze(['validation', 'actions', 'suggestions', 'ajoutFacture']);
export const LIBELLES_WEBHOOKS = Object.freeze({
  validation: 'Adresse « validation »',
  actions: 'Adresse « actions »',
  suggestions: 'Adresse « suggestions »',
  ajoutFacture: 'Adresse « ajout de facture »',
});
export const MAX_ADRESSE = 500;
export const MAX_CLE = 2000;
const FORME_ESPACE = /^[a-z0-9-]{1,40}$/;

/** Une adresse est valable si c'est une adresse web en https (jamais http : le badge de Jérôme partirait en clair, ou chez un inconnu). */
export function adresseHttpsValide(valeur) {
  if (typeof valeur !== 'string' || !valeur || valeur !== valeur.trim() || valeur.length > MAX_ADRESSE) return false;
  try {
    const u = new URL(valeur);
    return u.protocol === 'https:' && !!u.hostname && !u.username && !u.password;
  } catch {
    return false;
  }
}

const texte = (v) => (typeof v === 'string' ? v.trim() : '');

/** Valeurs brutes (champs de l'écran ou document Firestore) -> forme normalisée, sans rien inventer. */
export function normaliserConnexion(brut) {
  const w = brut && typeof brut.webhooks === 'object' && brut.webhooks ? brut.webhooks : {};
  return {
    adresseBase: texte(brut?.adresseBase),
    clePublique: texte(brut?.clePublique),
    espace: texte(brut?.espace),
    webhooks: Object.fromEntries(NOMS_WEBHOOKS.map((n) => [n, texte(w[n])])),
  };
}

/**
 * Contrôle avant d'enregistrer ou de tester. Renvoie { ok, erreurs: { <champ>: message }, connexion } ; les champs sont
 * adresseBase, clePublique, espace, webhooks.<nom>. Une adresse d'automatisation peut rester vide (elle sera réglée plus tard) mais, remplie, doit être en https.
 */
export function controlerConnexion(brut) {
  const c = normaliserConnexion(brut);
  const erreurs = {};
  if (!c.adresseBase) erreurs.adresseBase = 'Indique l’adresse de la base.';
  else if (!adresseHttpsValide(c.adresseBase)) erreurs.adresseBase = 'L’adresse doit être une adresse web en https (sans http, sans identifiant ni mot de passe).';
  if (!c.clePublique) erreurs.clePublique = 'Indique la clé publique.';
  else if (/\s/.test(c.clePublique) || c.clePublique.length > MAX_CLE) erreurs.clePublique = 'La clé publique ne doit contenir ni espace ni retour à la ligne.';
  if (!c.espace) erreurs.espace = 'Indique le nom court de l’espace.';
  else if (!FORME_ESPACE.test(c.espace)) erreurs.espace = 'Le nom de l’espace : lettres minuscules, chiffres et tirets seulement (40 caractères au plus).';
  for (const n of NOMS_WEBHOOKS) {
    const v = c.webhooks[n];
    if (v && !adresseHttpsValide(v)) erreurs[`webhooks.${n}`] = 'L’adresse doit être une adresse web en https.';
  }
  return { ok: Object.keys(erreurs).length === 0, erreurs, connexion: c };
}

let enMemoire = null;

/** Pose (ou efface, avec null) la connexion lue dans Firestore. Un document incomplet ou invalide compte comme « non réglée ». */
export function definirConnexion(brut) {
  const r = brut ? controlerConnexion(brut) : null;
  const obligatoires = r && !r.erreurs.adresseBase && !r.erreurs.clePublique && !r.erreurs.espace;
  enMemoire = obligatoires ? r.connexion : null;
  return enMemoire !== null;
}

/** La connexion réglée, ou une erreur lisible. Renvoie une copie : personne ne modifie la mémoire. */
export function lireConnexion() {
  if (!enMemoire) throw new Error(MESSAGE_NON_REGLEE);
  return { ...enMemoire, webhooks: { ...enMemoire.webhooks } };
}

// ---------------------------------------------------------------- donner ou retirer l'accès à un compte (fonction serveur `baseAccorderAcces`)

const FORME_EMAIL = /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/;

/** Contrôle du mini-bloc « Donner l'accès à un compte » : renvoie { ok, erreurs: { email, espace }, demande: { email, espace } }. */
export function controlerDemandeAcces({ email, espace } = {}) {
  const e = texte(email).toLowerCase();
  const s = texte(espace);
  const erreurs = {};
  if (!e) erreurs.email = 'Indique l’adresse du compte.';
  else if (!FORME_EMAIL.test(e) || e.length > 254) erreurs.email = 'Cette adresse e-mail n’est pas valable.';
  if (!s) erreurs.espace = 'Indique le nom court de l’espace.';
  else if (!FORME_ESPACE.test(s)) erreurs.espace = 'Le nom de l’espace : lettres minuscules, chiffres et tirets seulement.';
  return { ok: Object.keys(erreurs).length === 0, erreurs, demande: { email: e, espace: s } };
}

export const MESSAGE_ACCES_DONNE = 'C’est noté : l’effet arrive dans l’heure au plus. La personne doit se reconnecter.';
export const MESSAGE_ACCES_RETIRE = 'C’est noté : le retrait prend effet dans l’heure au plus. La personne doit se reconnecter.';
export const MESSAGE_ACCES_RESEAU = 'Ça n’a pas abouti. Vérifie ta connexion internet, puis réessaie.';
const CODES_LISIBLES = ['permission-denied', 'invalid-argument', 'failed-precondition', 'not-found', 'unauthenticated', 'resource-exhausted'];

/** Erreur d'appel -> message à montrer (le SDK ajoute « [403] » en fin de message : on l'enlève). */
export function messageErreurAcces(e) {
  const code = String(e?.code ?? '').replace('functions/', '');
  const message = String(e?.message ?? '').replace(/\s*\[\d{3}\]$/, '').trim();
  return CODES_LISIBLES.includes(code) && message && message !== code ? message : MESSAGE_ACCES_RESEAU;
}
