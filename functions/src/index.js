// Fonctions Cloud (2e génération, Paris). `mcp` : serveur MCP, joint par https://chevalier-ia-os.web.app/mcp
// (réécriture Hosting). `porte` : porte des workflows n8n, jointe par https://chevalier-ia-os.web.app/porte (réécriture Hosting). L'invocation est publique côté Google : la porte est le jeton « cia_… » (securite/jetons.js) ou la connexion Google (oauth/).
import { onRequest, onCall } from 'firebase-functions/v2/https';
import { defineSecret } from 'firebase-functions/params';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { creerGestionnaire } from './mcp/gestionnaire.js';
import { creerAccesFirestore } from './coeur/donnees.js';
import { creerMagasin } from './securite/jetons.js';
import { creerLimiteur } from './securite/limites.js';
import { lireSecretJetons } from './securite/secret.js';
import { creerRouteurOauth } from './oauth/routeur.js';
import { creerVerificateurIdentite } from './oauth/identite-google.js';
import { creerGestionnairePorteCrm } from './porte.js';
import { creerAdaptateur } from '../partage/porte/adaptateur.js';
import { creerServiceVeille } from './veille/service.js';
import { creerAppelVeille } from './veille/appel.js';

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

// `veille` : appelée par l'appli (boutons « Ajouter » et « Résumer » du module Veille). Le jeton du bouton Résumer vit ici (Secret Manager),
// jamais dans la page. Le secret VEILLE_JETON_RESUMER doit être créé avant le déploiement (docs/veille-ajout-et-resume.md).
const JETON_RESUMER = defineSecret('VEILLE_JETON_RESUMER');
export const veille = onCall(
  { region: 'europe-west9', maxInstances: 3, memory: '256MiB', timeoutSeconds: 60, secrets: [JETON_RESUMER] },
  (requete) => {
    if (!getApps().length) initializeApp();
    const service = creerServiceVeille({ donnees: creerAdaptateur({ db: getFirestore() }), lireJeton: () => JETON_RESUMER.value() });
    return creerAppelVeille({ service, journal: (e) => process.stdout.write(`${JSON.stringify({ severity: 'INFO', message: 'veille', ...e })}\n`) })(requete);
  },
);
