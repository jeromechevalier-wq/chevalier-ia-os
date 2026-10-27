// Fonctions Firebase de la plateforme clients (projet chevalier-ia-app, codebase « plateforme »), région de Paris.
// Module Automatisations (workflows n8n, chantier 14). NON déployées par le workflow du CRM ; voir docs/automatisations-n8n.md.
// La clé d'API de n8n est dans Secret Manager (nom : N8N_API_KEY), déposée par Jérôme ; elle n'est lue qu'au moment d'un appel.
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';
import { onCall, onRequest, HttpsError } from 'firebase-functions/v2/https';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { logger } from 'firebase-functions';
import { creerLecteurN8n } from './n8n.js';
import { copieHoraire, rafraichir, renommer, Refus } from './appels.js';
import { creerMcpClients } from './mcp-clients.js';
import { reglerEspace } from './espace.js';
import { transitionDevis, preparerEmailDevis, etatPreparerEmail } from './devis.js';
import { fabriquerPdfClient, lienPdfClient, creerDeclencheurPdfClient } from './devis-pdf.js';
import { verifierDeploiementClient } from './deploiement.js';
import { VERSION_SERVEUR } from '../serveur/src/version.js';
import { creerSortieN8n } from '../serveur/src/coeur/n8n-sortie.js';
import { creerLecteurSecrets } from '../serveur/src/securite/secrets.js';
import { creerStockage } from '../serveur/src/devis/stockage.js';
import { convertirHtmlEnPdf } from '../serveur/src/devis/chromium.js';

if (!getApps().length) initializeApp();
const db = () => getFirestore();
const CLE_N8N = defineSecret('N8N_API_KEY');
const REGION = 'europe-west9';
const BUCKET = 'chevalier-ia-app.firebasestorage.app'; // images des marques (même bucket que storage.plateforme.rules)

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

// MCP des clients : un lien par client (https://chevalier-ia-app.web.app/mcp/<client>), comptes lus dans les membres, profil déduit du rôle.
// Invocation publique côté Google (comme le MCP de Jérôme) : la vraie porte est la connexion Google + la fiche de membre, revérifiées à chaque appel.
// Le nom « mcpclients » est celui du service Cloud Run visé par les réécritures de firebase.plateforme.json. Code : functions/src/clients/ (copié dans serveur/ au déploiement).
// Compte dédié : seulement « Utilisateur Cloud Datastore » (Firestore). À créer AVANT le déploiement (docs/mcp-clients.md), sinon le déploiement échoue.
export const mcpclients = onRequest(
  { region: REGION, maxInstances: 3, memory: '256MiB', timeoutSeconds: 120, invoker: 'public', cors: false, serviceAccount: 'mcp-clients@chevalier-ia-app.iam.gserviceaccount.com' },
  creerMcpClients(),
);

// Mon espace (2.10.0) : un éditeur du client règle lui-même nom, couleur, logo, images, texte d'accueil et membres de son espace (Réglages > Mon espace, Membres et rôles).
// Les règles Firestore et Storage ne changent pas : c'est cette fonction, avec son compte dédié, qui écrit marques/<client> et les membres, après avoir vérifié que l'appelant est éditeur.
// Aucun secret. Compte dédié : « Utilisateur Cloud Datastore » et, sur Storage, « Administrateur des objets » limité aux fichiers marques/. À créer AVANT le déploiement (docs/mon-espace.md), sinon le déploiement échoue.
export const espaceReglages = onCall(
  { region: REGION, timeoutSeconds: 60, memory: '512MiB', maxInstances: 5, serviceAccount: 'espace-reglages@chevalier-ia-app.iam.gserviceaccount.com' },
  async (requete) => {
    try { return await reglerEspace({ db: db(), bucket: getStorage().bucket(BUCKET), nomBucket: BUCKET, auth: requete.auth, donnees: requete.data }); } catch (e) { throw enHttps(e); }
  },
);

// Module Devis (24/10/2026) : les quatre transitions d'un devis se font ICI, jamais depuis le navigateur (les règles Firestore ne laissent écrire qu'un brouillon).
// Le client est une cible vérifiée (éditeur du client, module « devis » actif), pas une confiance. Aucun secret, aucun appel à n8n dans cette version, aucun compte de service nouveau
// (le compte par défaut de la fonction suffit à lire et écrire Firestore). Ces fonctions ne sont déployées que par le workflow MANUEL de la plateforme.
const OPTIONS_DEVIS = { region: REGION, timeoutSeconds: 60, memory: '256MiB', maxInstances: 5 };
const appelDevis = (operation) => onCall(OPTIONS_DEVIS, async (requete) => {
  try { return await transitionDevis({ db: db(), auth: requete.auth, donnees: requete.data, operation }); } catch (e) { throw enHttps(e); }
});
export const devisFinaliser = appelDevis('finaliser');
export const devisChangerStatut = appelDevis('changerStatut');
export const devisNouvelleVersion = appelDevis('nouvelleVersion');
export const devisArchiver = appelDevis('archiver');
export const devisSupprimer = appelDevis('supprimer');
export const devisEnregistrerEnvoi = appelDevis('enregistrerEnvoi'); // historique des envois par e-mail

// Page Réglages > Déploiement (25/10/2026) : contrôles du serveur pour l'espace demandé (éditeurs seulement, sans condition de module). Rien n'est écrit, AUCUN secret déclaré
// (un secret absent ferait échouer le déploiement de toutes les fonctions), aucun compte de service nouveau. Déployée seulement par le workflow MANUEL de la plateforme.
export const deploiementVerifier = onCall({ ...OPTIONS_DEVIS, timeoutSeconds: 30 }, async (requete) => {
  try { return await verifierDeploiementClient({
    db: db(), auth: requete.auth, donnees: requete.data, version: VERSION_SERVEUR,
    // Lignes « PDF » : le stockage répond ; les trois fonctions du PDF sont déclarées dans CE serveur (un serveur plus ancien ne connaît pas ces lignes : elles restent orange jusqu'au déploiement « fonctions »).
    pdf: { bucket: () => getStorage().bucket(BUCKET), fonctions: () => [devisPdf, devisPdfLien, devisPdfAuto].every((f) => f) },
  }); } catch (e) { throw enHttps(e); }
});

// « Préparer l'e-mail » (25/10/2026) : demande au workflow n8n DU CLIENT de créer un brouillon dans le Gmail du compte (PDF joint) ; rien n'est envoyé, ni par l'appli ni par n8n.
// L'adresse du webhook et son secret sont dans Secret Manager, UN couple PAR CLIENT (N8N_DEVIS_EMAIL_URL_<client>, N8N_DEVIS_EMAIL_SECRET_<client>), lus au moment de l'appel : sans eux,
// l'écran du client ne montre pas le bouton (devisPreparerEmailEtat). Le compte de service de la fonction doit avoir « Accesseur de secrets » sur ces secrets (docs/ajouter-un-bouton-workflow.md).
// Déployée seulement par le workflow MANUEL de la plateforme, avec Jérôme ; le résultat revient par la porte du client (devis.lireEmail, devis.noterEmailPrepare).
const sortieN8nDevis = creerSortieN8n({ lireSecret: creerLecteurSecrets({ projet: 'chevalier-ia-app' }) });
export const devisPreparerEmail = onCall(OPTIONS_DEVIS, async (requete) => {
  try { return await preparerEmailDevis({ db: db(), auth: requete.auth, donnees: requete.data, sortie: sortieN8nDevis }); } catch (e) { throw enHttps(e); }
});
export const devisPreparerEmailEtat = onCall(OPTIONS_DEVIS, async (requete) => {
  try { return await etatPreparerEmail({ db: db(), auth: requete.auth, donnees: requete.data, sortie: sortieN8nDevis }); } catch (e) { throw enHttps(e); }
});

// PDF des devis chez les clients : fabriqué PAR LE SERVEUR dès qu'un devis passe de brouillon à finalisé (déclencheur `devisPdfAuto`), jamais par le navigateur. Chromium tourne dans la fonction
// (2 GiB) ; le PDF est rangé dans Cloud Storage sous clients/<client>/devis/… (jamais public) et lu par un lien signé de 5 minutes (`devisPdfLien`, éditeurs ET lecteurs).
// AUCUN secret déclaré (un secret absent ferait échouer le déploiement de toutes les fonctions). Compte de service dédié, à créer AVANT le déploiement (docs/pdf-clients.md) :
// sans lui, le déploiement de TOUTES les fonctions de la plateforme échoue. Déployées seulement par le workflow MANUEL de la plateforme, avec Jérôme.
const COMPTE_PDF = 'devis-pdf@chevalier-ia-app.iam.gserviceaccount.com';
const OPTIONS_PDF = { region: REGION, memory: '2GiB', timeoutSeconds: 120, concurrency: 1, maxInstances: 2, serviceAccount: COMPTE_PDF };
const stockagePdf = () => creerStockage({ bucket: getStorage().bucket(BUCKET) });
const journalPdf = (e) => {
  const ligne = { action: e.action, statut: e.statut, code: e.code, dureeMs: e.dureeMs };
  if (e.statut === 'erreur') logger.error('devisPdf', ligne); else logger.info('devisPdf', ligne);
};
export const devisPdf = onCall(OPTIONS_PDF, async (requete) => {
  try { return await fabriquerPdfClient({ db: db(), auth: requete.auth, donnees: requete.data, convertir: (html, options) => convertirHtmlEnPdf(html, options), stockage: stockagePdf, journal: journalPdf }); } catch (e) { throw enHttps(e); }
});
export const devisPdfLien = onCall({ region: REGION, memory: '256MiB', timeoutSeconds: 60, maxInstances: 5, serviceAccount: COMPTE_PDF }, async (requete) => {
  try { return await lienPdfClient({ db: db(), auth: requete.auth, donnees: requete.data, stockage: stockagePdf, journal: journalPdf }); } catch (e) { throw enHttps(e); }
});
// Déclencheur : ne réagit qu'au passage brouillon -> finalisé (l'écriture de `pdf` ne le relance donc jamais), ne fabrique que si le module « devis » est actif chez ce client, ne lève jamais d'erreur.
export const devisPdfAuto = onDocumentUpdated(
  { document: 'clients/{client}/devis_devis/{devisId}', region: REGION, memory: '2GiB', timeoutSeconds: 540, concurrency: 1, maxInstances: 2, retry: false, serviceAccount: COMPTE_PDF },
  (evenement) => creerDeclencheurPdfClient({ db: db(), convertir: (html, options) => convertirHtmlEnPdf(html, options), stockage: stockagePdf, journal: journalPdf })(evenement),
);
