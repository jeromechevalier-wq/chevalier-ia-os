// Lecture du secret MCP_JETONS dans Secret Manager, à l'exécution (pas de liaison au déploiement : aucun rôle
// d'administration des secrets pour le workflow). Le compte d'exécution doit avoir « Accesseur de secrets » sur ce seul secret.
import { SecretManagerServiceClient } from '@google-cloud/secret-manager';
import { projetCourant } from './maison.js';

/** `projet` : celui de la fonction par défaut (lu à l'appel, jamais écrit dans le code) ; projet inconnu = la lecture lève (aucun jeton accepté). */
export function lireSecretJetons({ projet = null, nom = 'MCP_JETONS' } = {}) {
  let client = null;
  return async () => {
    const p = projet ?? projetCourant();
    client ??= new SecretManagerServiceClient();
    const [version] = await client.accessSecretVersion({ name: `projects/${p}/secrets/${nom}/versions/latest` });
    return version.payload.data.toString('utf8');
  };
}
