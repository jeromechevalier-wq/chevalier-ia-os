// Fonctions Cloud (2e génération, Paris). `mcp` : serveur MCP, joint par https://chevalier-ia-os.web.app/mcp
// (réécriture Hosting). `porte` : porte des workflows n8n, jointe par https://chevalier-ia-os.web.app/porte (réécriture Hosting). L'invocation est publique côté Google : la porte est le jeton « cia_… » (securite/jetons.js) ou la connexion Google (oauth/).
import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
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
import { copieInterne, administrateur, Refus } from './automatisations/appels.js';
import { creerLecteurN8n } from '../partage/automatisations/n8n.js';

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

// Automatisations (workflows n8n) dans Chevalier IA OS : copie de TES workflows « interne » et vue administrateur de tous les propriétaires.
// INTERRUPTEUR DE MISE EN SERVICE. Toute fusion dans main déploie TOUTES les fonctions de ce dossier (.github/workflows/firebase-hosting.yml) ; si le secret N8N_API_KEY
// ou le compte de service ci-dessous n'existe pas encore dans chevalier-ia-os, le déploiement ÉCHOUE et le CRM n'est plus mis à jour. Tant que cette constante est `false`,
// les deux fonctions ne sont donc pas déclarées (rien n'est déployé, l'écran le dit poliment). Elle passe à `true` dans une petite PR, APRÈS le guide de
// docs/automatisations-n8n.md (partie 11) : secret créé, compte de service créé avec ses trois droits.
export const AUTOMATISATIONS_EN_SERVICE = true;
// Compte dédié : « Utilisateur Cloud Datastore » sur chevalier-ia-os (écrire TES copies), « Accesseur de secrets » sur N8N_API_KEY, et SEULEMENT « Lecteur Cloud Datastore » sur chevalier-ia-app
// (lecture de l'autre base : le compte ne peut pas y écrire, même par erreur).
const COMPTE_AUTOMATISATIONS = 'automatisations-serveur@chevalier-ia-os.iam.gserviceaccount.com';
const dbOs = () => { if (!getApps().length) initializeApp(); return getFirestore(); };
/** Base de Chevalier IA APP : une 2e application nommée, mêmes identifiants du compte de service, en lecture seule (droits IAM). */
const dbApp = () => {
  if (!getApps().length) initializeApp();
  const existante = getApps().find((a) => a.name === 'plateforme');
  return getFirestore(existante ?? initializeApp({ projectId: 'chevalier-ia-app' }, 'plateforme'));
};

const CLE_N8N = AUTOMATISATIONS_EN_SERVICE ? defineSecret('N8N_API_KEY') : null;
const lecteurN8n = () => creerLecteurN8n({ cle: CLE_N8N.value() });

export const automatisationsInterneHoraire = AUTOMATISATIONS_EN_SERVICE ? onSchedule(
  { region: 'europe-west9', schedule: '0 * * * *', timeZone: 'Europe/Paris', secrets: [CLE_N8N], timeoutSeconds: 300, memory: '512MiB', maxInstances: 1, serviceAccount: COMPTE_AUTOMATISATIONS },
  async () => { await copieInterne({ db: dbOs(), dbPlateforme: dbApp(), n8n: lecteurN8n() }); },
) : undefined;

export const automatisationsAdmin = AUTOMATISATIONS_EN_SERVICE ? onCall(
  { region: 'europe-west9', secrets: [CLE_N8N], timeoutSeconds: 120, memory: '256MiB', maxInstances: 3, serviceAccount: COMPTE_AUTOMATISATIONS },
  async (requete) => {
    try {
      return await administrateur({ db: dbOs(), dbPlateforme: dbApp(), n8n: lecteurN8n, auth: requete.auth, donnees: requete.data });
    } catch (e) {
      if (e instanceof Refus) throw new HttpsError(e.code, e.message);
      process.stdout.write(`${JSON.stringify({ severity: 'ERROR', message: 'Journal : erreur inattendue (administrateur)', nom: e?.name })}\n`);
      throw new HttpsError('internal', 'Une erreur est survenue.');
    }
  },
) : undefined;
