// MCP des clients (module « mcp »), branché sur la base de la plateforme (chevalier-ia-app). Le code du serveur est celui de functions/src/ :
// scripts/preparer-fonctions.js le copie dans functions-plateforme/serveur/ avant chaque déploiement (predeploy de firebase.plateforme.json) et avant les tests.
// Le lien d'un client est https://chevalier-ia-app.web.app/mcp/<client> (réécriture Hosting vers la fonction « mcpclients », voir firebase.plateforme.json).
import { getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getStorage } from 'firebase-admin/storage';
import { creerSortieN8n } from '../serveur/src/coeur/n8n-sortie.js';
import { creerLecteurSecrets } from '../serveur/src/securite/secrets.js';
import { creerStockage } from '../serveur/src/devis/stockage.js';
import { creerAccesFirestore } from '../serveur/src/coeur/donnees.js';
import { creerLimiteur } from '../serveur/src/securite/limites.js';
import { creerEspaces } from '../serveur/src/clients/espaces.js';
import { creerRouteurOauthClients } from '../serveur/src/clients/routeur-oauth.js';
import { creerGestionnaireClients } from '../serveur/src/clients/gestionnaire.js';

const BUCKET = 'chevalier-ia-app.firebasestorage.app'; // même bucket que functions-plateforme/src/index.js

export function creerMcpClients() {
  const donnees = creerAccesFirestore();
  const verifierIdToken = async (jeton) => {
    const app = getApps().find((a) => a.name === '[DEFAULT]') || initializeApp();
    const d = await getAuth(app).verifyIdToken(jeton); // signature, émetteur, audience (chevalier-ia-app) et expiration contrôlés par le SDK
    return { email: d.email, emailVerifie: d.email_verified === true, fournisseur: d.firebase?.sign_in_provider };
  };
  const oauth = creerRouteurOauthClients({ donnees, verifierIdToken, espaces: creerEspaces({ donnees }) });
  // Fichiers de l'onglet « Documents » déposés par un assistant (texte seulement) : le compte du MCP des clients doit avoir « Administrateur des objets » sur clients/ (docs/securite-et-pannes.md) ; sans lui, l'outil répond « droit manquant ».
  const stockage = () => { try { return creerStockage({ bucket: getStorage().bucket(BUCKET) }); } catch { return null; } };
  // Brouillon d'e-mail d'un devis (jamais d'envoi) : un workflow et des secrets PAR CLIENT, lus dans Secret Manager à l'appel (coeur/n8n-sortie.js). Le compte du MCP des clients doit avoir « Accesseur de secrets » sur ces secrets, sinon l'outil répond « pas branché ».
  const sortieEmail = creerSortieN8n({ lireSecret: creerLecteurSecrets({ projet: 'chevalier-ia-app' }) });
  return creerGestionnaireClients({ donnees, oauth, limiteur: creerLimiteur({ donnees }), stockage, sortieEmail });
}
