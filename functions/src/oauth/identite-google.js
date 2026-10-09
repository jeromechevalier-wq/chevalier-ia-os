// Vérification du jeton d'identité Google (Firebase Auth) présenté par la page de consentement. Le SDK d'administration contrôle la
// signature, l'émetteur, l'audience (notre projet) et l'expiration ; aucun droit particulier n'est nécessaire (certificats publics).
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';

export function creerVerificateurIdentite() {
  return async (jeton) => {
    const app = getApps().find((a) => a.name === '[DEFAULT]') || initializeApp();
    const d = await getAuth(app).verifyIdToken(jeton);
    return { email: d.email, emailVerifie: d.email_verified === true, fournisseur: d.firebase?.sign_in_provider };
  };
}
