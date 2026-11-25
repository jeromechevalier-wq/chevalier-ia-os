// Identité de la « maison » (le projet Google où tourne ce code), lue auprès de Google, jamais écrite dans le code (chantier 0, 25/11/2026).
// Le même code tourne dans le CRM de Jérôme, dans la plateforme des clients et, demain, dans le projet d'un client : le nom du projet vient de
// `process.env.GCLOUD_PROJECT`, posé par Google sur chaque fonction et par firebase-tools pendant le déploiement (lecture du code, découverte des fonctions).
// Tout est calculé À LA DEMANDE (fonctions, jamais de constante à l'import) : les tests importent ces fichiers sans projet.
// Ce qui ne se déduit pas du projet (comptes, adresse de n8n…) est dans la fiche Firestore reglages_maison/maison (reglages-maison.js).

/** Région de toutes les fonctions (Paris). Une constante : elle ne dépend pas de la maison. */
export const REGION = 'europe-west9';

/** Nom du projet Google courant. Lève une erreur claire s'il est inconnu (jamais de projet par défaut). */
export function projetCourant() {
  const projet = process.env.GCLOUD_PROJECT;
  if (typeof projet !== 'string' || !/^[a-z][a-z0-9-]{4,61}[a-z0-9]$/.test(projet)) {
    throw new Error('Projet Google inconnu (GCLOUD_PROJECT absent ou invalide) : refus.');
  }
  return projet;
}

/** Adresse publique du site de la maison (Firebase Hosting) : https://<projet>.web.app. */
export const adresseSite = (projet = projetCourant()) => `https://${projet}.web.app`;

/** Origines de navigateur du site : les deux domaines fournis par Firebase Hosting. */
export const originesSite = (projet = projetCourant()) => [`https://${projet}.web.app`, `https://${projet}.firebaseapp.com`];

/** Adresse directe d'une fonction HTTP de 2e génération déclarée dans cette région. */
export const adresseFonction = (nom, projet = projetCourant()) => `https://${REGION}-${projet}.cloudfunctions.net/${nom}`;

/**
 * Réserve de fichiers (Cloud Storage) par défaut du projet : celle que Google donne dans FIREBASE_CONFIG (posée sur chaque fonction),
 * sinon `<projet>.firebasestorage.app` (nom des réserves créées depuis 2024, celui qu'utilisait le code avant le chantier 0).
 */
export function reserveParDefaut() {
  try {
    const c = JSON.parse(process.env.FIREBASE_CONFIG || '{}');
    if (typeof c.storageBucket === 'string' && c.storageBucket) return c.storageBucket;
  } catch { /* configuration illisible : nom calculé ci-dessous */ }
  return `${projetCourant()}.firebasestorage.app`;
}

/**
 * Adresse complète d'un compte de service du projet courant : `<nom>@<projet>.iam.gserviceaccount.com`. À utiliser pour tout `serviceAccount:` des fonctions.
 * Le raccourci « nom@ » NE SUFFIT PAS : firebase-tools ne le complète que pour les invocateurs, pas pour l'accès aux secrets ni pour Cloud Scheduler
 * (relecture Fable du 25/11/2026). GCLOUD_PROJECT est posé par firebase-tools pendant la découverte des fonctions (lib/deploy/functions/prepare.js) ;
 * sans projet (chargement hors Google), on rend « nom@ » au lieu de lever, pour que le chargement du fichier ne casse jamais.
 */
export const compteDeService = (nom) => (process.env.GCLOUD_PROJECT ? `${nom}@${process.env.GCLOUD_PROJECT}.iam.gserviceaccount.com` : `${nom}@`);
