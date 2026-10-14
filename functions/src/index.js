// Fonctions Cloud (2e génération, Paris). `mcp` : serveur MCP, joint par https://chevalier-ia-os.web.app/mcp
// (réécriture Hosting). `porte` : porte des workflows n8n, jointe par https://chevalier-ia-os.web.app/porte (réécriture Hosting). L'invocation est publique côté Google : la porte est le jeton « cia_… » (securite/jetons.js) ou la connexion Google (oauth/).
import { onRequest } from 'firebase-functions/v2/https';
import { creerGestionnaire } from './mcp/gestionnaire.js';
import { creerAccesFirestore } from './coeur/donnees.js';
import { creerMagasin } from './securite/jetons.js';
import { creerLimiteur } from './securite/limites.js';
import { lireSecretJetons } from './securite/secret.js';
import { creerRouteurOauth } from './oauth/routeur.js';
import { creerVerificateurIdentite } from './oauth/identite-google.js';
import { creerGestionnairePorteCrm } from './porte.js';

const magasin = creerMagasin({ lire: lireSecretJetons() });
const donnees = creerAccesFirestore();
const limiteur = creerLimiteur({ donnees });
const oauth = creerRouteurOauth({ donnees, verifierIdToken: creerVerificateurIdentite() });

export const mcp = onRequest(
  {
    region: 'europe-west9',
    maxInstances: 3,
    memory: '256MiB',
    timeoutSeconds: 120,
    invoker: 'public',
    cors: false,
    // Compte dédié : seulement « Utilisateur Cloud Datastore » (Firestore) et « Accesseur de secrets » sur MCP_JETONS.
    serviceAccount: 'mcp-serveur@chevalier-ia-os.iam.gserviceaccount.com',
  },
  creerGestionnaire({ magasin, donnees, limiteur, oauth }),
);

export const porte = onRequest(
  {
    region: 'europe-west9',
    maxInstances: 3,
    memory: '256MiB',
    timeoutSeconds: 60,
    invoker: 'public',
    cors: false,
    // Compte dédié : seulement « Utilisateur Cloud Datastore » (Firestore) et « Accesseur de secrets » sur N8N_API_KEY.
    serviceAccount: 'porte-serveur@chevalier-ia-os.iam.gserviceaccount.com',
  },
  creerGestionnairePorteCrm(),
);
