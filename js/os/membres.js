// Appartenance par client (chantier 3 de la plateforme clients).
// Un compte appartient à un client s'il existe un document `clients/<client>/membres/<e-mail en minuscules>` avec un rôle.
// Un compte peut appartenir à plusieurs clients (un document par client). Ce fichier n'importe rien (pas de Firebase) : il se teste seul.
// Les règles Firestore (firestore.plateforme.rules) sont la vraie protection ; ce fichier ne sert qu'à l'affichage.
import { cheminBaseClient } from './chemins.js';

/** Rôles de la plateforme (liste minimale) : l'éditeur lit et écrit, le lecteur lit seulement. */
export const ROLES = Object.freeze({
  editeur: { lit: true, ecrit: true },
  lecteur: { lit: true, ecrit: false },
});

export function emailNormalise(email) {
  return typeof email === 'string' ? email.trim().toLowerCase() : '';
}

/** Chemin du document d'appartenance : clients/<client>/membres/<e-mail>. */
export function cheminMembre(client, email) {
  const e = emailNormalise(email);
  if (!e || e.includes('/')) throw new Error(`Adresse e-mail invalide : « ${email} »`);
  return `${cheminBaseClient(client)}/membres/${e}`;
}

/**
 * Compte d'un client : e-mail vérifié ET document d'appartenance avec un rôle connu. Sinon null.
 * `membre` = les données du document d'appartenance (ou null s'il n'existe pas).
 */
export function compteMembre(user, client, membre) {
  if (!user || !user.email || user.emailVerified !== true) return null;
  if (!membre || !Object.hasOwn(ROLES, membre.role)) return null;
  const email = emailNormalise(user.email);
  return { email, uid: user.uid, client, role: membre.role, nom: membre.nom || user.displayName || email, ...ROLES[membre.role] };
}

/** Attentes avant chaque nouvelle tentative de lecture de la fiche d'appartenance (ms). */
export const ATTENTES_LECTURE_MEMBRE = Object.freeze([400, 1200, 2500]);
export const MESSAGE_CONNEXION_IMPOSSIBLE = 'Connexion impossible pour le moment. Vérifie ta connexion internet, puis clique sur Réessayer.';

/** Seul ce code Firestore est un vrai refus ; toute autre erreur (réseau, cache, jeton qui se renouvelle) est transitoire. */
export function erreurDeRefus(e) {
  return e?.code === 'permission-denied';
}

/**
 * Lit la fiche d'appartenance avec reprises. `lire()` renvoie les données de la fiche (ou null si absente) et peut lancer.
 * Résultat : { etat: 'ok', compte } | { etat: 'refus' } (fiche absente, rôle inconnu ou permission-denied)
 *          | { etat: 'erreur' } (échec persistant : l'appelant ne doit PAS déconnecter).
 * `attentes` et `pause` sont injectables pour les tests. Jamais d'e-mail ni de jeton dans les journaux : seulement le code d'erreur.
 */
export async function lireCompteAvecReprises({ user, client, lire, attentes = ATTENTES_LECTURE_MEMBRE, pause = (ms) => new Promise((r) => setTimeout(r, ms)), journal = (...a) => console.warn(...a) }) {
  if (!user || !user.email || user.emailVerified !== true) return { etat: 'refus' };
  for (let essai = 0; ; essai++) {
    try {
      const compte = compteMembre(user, client, await lire());
      return compte ? { etat: 'ok', compte } : { etat: 'refus' };
    } catch (e) {
      journal("Lecture de la fiche d'appartenance impossible :", e?.code || 'inconnu', `(essai ${essai + 1})`);
      if (erreurDeRefus(e)) return { etat: 'refus' };
      if (essai >= attentes.length) return { etat: 'erreur' };
      await pause(attentes[essai]);
    }
  }
}

/**
 * Le démarrage « liste fixe de comptes » (CRM de Jérôme) n'existe que si la liste n'est pas vide. Sur la plateforme clients elle est vide :
 * ouvrir la page sans route d'espace ne doit alors jamais lire ni refuser un compte (un refus déconnecterait tous les onglets).
 */
export function crmOuvertAuxComptes(liste) {
  return !!liste && typeof liste === 'object' && Object.keys(liste).length > 0;
}

/** Compteur de générations : un rappel asynchrone dont la génération a changé (autre état d'auth reçu entre-temps) doit se taire. */
export function suiviGenerations() {
  let courante = 0;
  return { nouvelle: () => ++courante, perimee: (g) => g !== courante };
}
