// MCP des clients (module « mcp »), branché sur la base de la plateforme (chevalier-ia-app). Le code du serveur est celui de functions/src/ :
// scripts/preparer-fonctions.js le copie dans functions-plateforme/serveur/ avant chaque déploiement (predeploy de firebase.plateforme.json) et avant les tests.
// Le lien d'un client est https://chevalier-ia-app.web.app/mcp/<client> (réécriture Hosting vers la fonction « mcpclients », voir firebase.plateforme.json).
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { creerAccesFirestore } from '../serveur/src/coeur/donnees.js';
import { creerLimiteur } from '../serveur/src/securite/limites.js';
import { creerEspaces } from '../serveur/src/clients/espaces.js';
import { creerRouteurOauthClients } from '../serveur/src/clients/routeur-oauth.js';
import { creerGestionnaireClients } from '../serveur/src/clients/gestionnaire.js';

export function creerMcpClients() {
  const donnees = creerAccesFirestore();
  const verifierIdToken = async (jeton) => {
    const app = getApps().find((a) => a.name === '[DEFAULT]') || initializeApp();
    const d = await getAuth(app).verifyIdToken(jeton); // signature, émetteur, audience (chevalier-ia-app) et expiration contrôlés par le SDK
    return { email: d.email, emailVerifie: d.email_verified === true, fournisseur: d.firebase?.sign_in_provider };
  };
  const oauth = creerRouteurOauthClients({ donnees, verifierIdToken, espaces: creerEspaces({ donnees }) });
  return creerGestionnaireClients({ donnees, oauth, limiteur: creerLimiteur({ donnees }) });
}
