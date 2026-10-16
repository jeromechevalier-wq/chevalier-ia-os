// Fonctions Firebase de la plateforme clients (projet chevalier-ia-app, codebase « plateforme »), région de Paris.
// Journal d'activité des workflows n8n (chantier 14). NON déployées par le workflow du CRM ; voir docs/journal-activite-workflows.md.
// La clé d'API de n8n est dans Secret Manager (nom : N8N_API_KEY), déposée par Jérôme ; elle n'est lue qu'au moment d'un appel.
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { creerLecteurN8n } from './n8n.js';
import { copieHoraire, rafraichir, renommer, Refus } from './appels.js';
import { creerMcpClients } from './mcp-clients.js';

if (!getApps().length) initializeApp();
const db = () => getFirestore();
const CLE_N8N = defineSecret('N8N_API_KEY');
const REGION = 'europe-west9';

const lecteur = () => creerLecteurN8n({ cle: CLE_N8N.value() });

/** Traduit un refus interne en erreur Firebase (le message est écrit pour être lu par l'utilisateur). */
function enHttps(e) {
  if (e instanceof Refus) return new HttpsError(e.code, e.message);
  logger.error('Journal : erreur inattendue', { nom: e?.name, detail: e?.message });
  return new HttpsError('internal', 'Une erreur est survenue.');
}

// Toutes les heures (heure de Paris).
export const journalCopieHoraire = onSchedule(
  { region: REGION, schedule: '0 * * * *', timeZone: 'Europe/Paris', secrets: [CLE_N8N], timeoutSeconds: 300, memory: '512MiB', maxInstances: 1 },
  async () => { await copieHoraire({ db: db(), n8n: lecteur() }); },
);

// Bouton « Rafraîchir » et mise à jour automatique de l'écran : le client est déduit de l'identité, jamais d'un paramètre.
export const journalRafraichir = onCall(
  { region: REGION, secrets: [CLE_N8N], timeoutSeconds: 120, memory: '256MiB', maxInstances: 5 },
  async (requete) => {
    try { return await rafraichir({ db: db(), n8n: lecteur(), auth: requete.auth }); } catch (e) { throw enHttps(e); }
  },
);

// Renommer l'affichage d'un workflow (éditeurs du client seulement). Ne touche pas à n8n : pas de secret nécessaire.
export const journalRenommer = onCall(
  { region: REGION, timeoutSeconds: 30, memory: '256MiB', maxInstances: 5 },
  async (requete) => {
    try { return await renommer({ db: db(), auth: requete.auth, donnees: requete.data }); } catch (e) { throw enHttps(e); }
  },
);

// MCP des clients : un lien par client (https://chevalier-ia-app.web.app/mcp/<client>), comptes lus dans les membres, profil déduit du rôle.
// Invocation publique côté Google (comme le MCP de Jérôme) : la vraie porte est la connexion Google + la fiche de membre, revérifiées à chaque appel.
// Le nom « mcpclients » est celui du service Cloud Run visé par les réécritures de firebase.plateforme.json. Code : functions/src/clients/ (copié dans serveur/ au déploiement).
// Compte dédié : seulement « Utilisateur Cloud Datastore » (Firestore). À créer AVANT le déploiement (docs/mcp-clients.md), sinon le déploiement échoue.
export const mcpclients = onRequest(
  { region: REGION, maxInstances: 3, memory: '256MiB', timeoutSeconds: 120, invoker: 'public', cors: false, serviceAccount: 'mcp-clients@chevalier-ia-app.iam.gserviceaccount.com' },
  creerMcpClients(),
);
