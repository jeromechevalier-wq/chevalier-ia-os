// Fonctions Firebase de la plateforme clients (projet chevalier-ia-app, codebase « plateforme »), région de Paris.
// Module Automatisations (workflows n8n, chantier 14). NON déployées par le workflow du CRM ; voir docs/automatisations-n8n.md.
// La clé d'API de n8n est dans Secret Manager (nom : N8N_API_KEY), déposée par Jérôme ; elle n'est lue qu'au moment d'un appel.
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { creerLecteurN8n } from './n8n.js';
import { copieHoraire, rafraichir, renommer, Refus } from './appels.js';

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
export const automatisationsCopieHoraire = onSchedule(
  { region: REGION, schedule: '0 * * * *', timeZone: 'Europe/Paris', secrets: [CLE_N8N], timeoutSeconds: 300, memory: '512MiB', maxInstances: 1 },
  async () => { await copieHoraire({ db: db(), n8n: lecteur() }); },
);

// Bouton « Rafraîchir » et mise à jour automatique de l'écran : le client est déduit de l'identité, jamais d'un paramètre.
export const automatisationsRafraichir = onCall(
  { region: REGION, secrets: [CLE_N8N], timeoutSeconds: 120, memory: '256MiB', maxInstances: 5 },
  async (requete) => {
    try { return await rafraichir({ db: db(), n8n: lecteur(), auth: requete.auth }); } catch (e) { throw enHttps(e); }
  },
);

// Renommer l'affichage d'un workflow (éditeurs du client seulement). Ne touche pas à n8n : pas de secret nécessaire.
export const automatisationsRenommer = onCall(
  { region: REGION, timeoutSeconds: 30, memory: '256MiB', maxInstances: 5 },
  async (requete) => {
    try { return await renommer({ db: db(), auth: requete.auth, donnees: requete.data }); } catch (e) { throw enHttps(e); }
  },
);
