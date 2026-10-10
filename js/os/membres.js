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
