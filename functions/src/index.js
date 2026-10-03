// Fonctions Cloud (2e génération, Paris). `mcp` : serveur MCP, joint par https://chevalier-ia-os.web.app/mcp
// (réécriture Hosting). L'invocation est publique côté Google : la porte est le jeton (voir securite/jetons.js).
import { onRequest } from 'firebase-functions/v2/https';
import { creerGestionnaire } from './mcp/gestionnaire.js';
import { creerAccesFirestore } from './coeur/donnees.js';
import { creerMagasin } from './securite/jetons.js';
import { lireSecretJetons } from './securite/secret.js';

const magasin = creerMagasin({ lire: lireSecretJetons() });
const donnees = creerAccesFirestore();

export const mcp = onRequest(
  { region: 'europe-west9', maxInstances: 3, memory: '256MiB', timeoutSeconds: 120, invoker: 'public', cors: false },
  creerGestionnaire({ magasin, donnees }),
);
