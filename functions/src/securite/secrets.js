// Lecture d'un secret NOMMÉ dans Secret Manager, à l'exécution (comme securite/secret.js, mais pour plusieurs secrets : N8N_DEVIS_EMAIL_URL, N8N_DEVIS_EMAIL_SECRET…).
// Le compte d'exécution doit avoir « Accesseur de secrets » sur chacun de ces secrets. Un secret absent ou illisible fait lever la promesse : l'appelant le traite comme « pas branché ».
// Aucune valeur n'est journalisée ni gardée ici.
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { projetCourant } from './maison.js';

/** `projet` : celui de la fonction par défaut (lu à l'appel, jamais écrit dans le code) ; projet inconnu = la lecture lève (secret « pas branché »). */
export function creerLecteurSecrets({ projet = null } = {}) {
  let client = null;
  return async (nom) => {
    if (typeof nom !== 'string' || !/^[A-Za-z0-9_-]{1,255}$/.test(nom)) throw new Error('Nom de secret invalide');
    const p = projet ?? projetCourant();
    client ??= new SecretManagerServiceClient();
    const [version] = await client.accessSecretVersion({ name: `projects/${p}/secrets/${nom}/versions/latest` });
    return version.payload.data.toString('utf8');
  };
}
