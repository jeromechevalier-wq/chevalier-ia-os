// Lecture du secret MCP_JETONS dans Secret Manager, à l'exécution (pas de liaison au déploiement : aucun rôle
// d'administration des secrets pour le workflow). Le compte d'exécution doit avoir « Accesseur de secrets » sur ce seul secret.
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';

export function lireSecretJetons({ projet = process.env.GCLOUD_PROJECT || 'chevalier-ia-os', nom = 'MCP_JETONS' } = {}) {
  const client = new SecretManagerServiceClient();
  return async () => {
    const [version] = await client.accessSecretVersion({ name: `projects/${projet}/secrets/${nom}/versions/latest` });
    return version.payload.data.toString('utf8');
  };
}
