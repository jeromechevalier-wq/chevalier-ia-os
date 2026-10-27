// Page « Déploiement » des Réglages sur la plateforme clients : la fonction appelable « deploiementVerifier » (même code commun que chez Jérôme : serveur/src/coeur/deploiement.js).
// Accès : un ÉDITEUR de l'espace demandé (clients/<client>/membres/<son e-mail>, rôle « editeur ») ; un refus neutre « Action non autorisée. » pour tout le reste.
// Pas de condition de module : la page existe chez un client sans Devis. Rien n'est écrit ; aucun secret ; la réponse ne contient que des états fixes et la version.
import { verifierDeploiement, membresCoherents, stockageRepond } from '../serveur/src/coeur/deploiement.js';
import { Refus } from './appels.js';
import { MOTIF_IDENTIFIANT_CLIENT } from './etiquettes.js';

const REFUS_NEUTRE = () => new Refus('permission-denied', 'Action non autorisée.');

function emailDe(auth) {
  const jeton = auth?.token;
  if (!auth?.uid || !jeton || jeton.email_verified !== true || typeof jeton.email !== 'string') throw new Refus('unauthenticated', 'Connexion requise.');
  return jeton.email.toLowerCase();
}

/**
 * Donnée reçue : { client }. Rend { ok, version, controles: { fonctions, membres, 'pdf-stockage', 'pdf-fonctions' } } ou lève un Refus.
 * `pdf` : { bucket: () => bucket du stockage des PDF, fonctions: () => vrai si les fonctions du PDF sont déclarées } ; sans lui, les deux lignes PDF valent « inconnu ».
 */
export async function verifierDeploiementClient({ db, auth, donnees, version, pdf = null }) {
  const email = emailDe(auth);
  const client = donnees?.client;
  if (typeof client !== 'string' || !MOTIF_IDENTIFIANT_CLIENT.test(client)) throw new Refus('invalid-argument', 'Demande invalide.');
  const membre = await db.doc(`clients/${client}/membres/${email}`).get();
  if (!membre.exists || membre.get('role') !== 'editeur') throw REFUS_NEUTRE();
  return verifierDeploiement({
    version,
    controles: {
      fonctions: async () => true,
      membres: async () => {
        const [fiche, liste] = await Promise.all([db.doc(`clients/${client}`).get(), db.collection(`clients/${client}/membres`).get()]);
        const equipe = fiche.exists ? fiche.get('equipe') : null;
        return membresCoherents(equipe, liste.docs.map((d) => ({ id: d.id, role: d.get('role') })));
      },
      ...(pdf ? { 'pdf-stockage': async () => stockageRepond(pdf.bucket()), 'pdf-fonctions': async () => pdf.fonctions() === true } : {}),
    },
  });
}
