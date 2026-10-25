// Lecture d'un secret NOMMÉ dans Secret Manager, à l'exécution (comme securite/secret.js, mais pour plusieurs secrets : N8N_DEVIS_EMAIL_URL, N8N_DEVIS_EMAIL_SECRET…).
// Le compte d'exécution doit avoir « Accesseur de secrets » sur chacun de ces secrets. Un secret absent ou illisible fait lever la promesse : l'appelant le traite comme « pas branché ».
// Aucune valeur n'est journalisée ni gardée ici.
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

export function creerLecteurSecrets({ projet = process.env.GCLOUD_PROJECT || 'chevalier-ia-os' } = {}) {
  let client = null;
  return async (nom) => {
    if (typeof nom !== 'string' || !/^[A-Za-z0-9_-]{1,255}$/.test(nom)) throw new Error('Nom de secret invalide');
    client ??= new SecretManagerServiceClient();
    const [version] = await client.accessSecretVersion({ name: `projects/${projet}/secrets/${nom}/versions/latest` });
    return version.payload.data.toString('utf8');
  };
}
