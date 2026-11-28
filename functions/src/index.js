// Fonctions Cloud (2e génération, Paris). `mcp` : serveur MCP, joint par https://<projet>.web.app/mcp
// (réécriture Hosting). `porte` : porte des workflows n8n, jointe par https://<projet>.web.app/porte (réécriture Hosting).
// Chantier 0 (25/11/2026) : aucun nom de projet ni compte dans ce fichier. Le projet vient de Google (GCLOUD_PROJECT, securite/maison.js) ; les comptes de service se calculent
// avec compteDeService (projet courant, posé par firebase-tools à la découverte) ; comptes, adresse de n8n et projet lié sont dans la fiche reglages_maison/maison (securite/reglages-maison.js). L'invocation est publique côté Google : la porte est le jeton « cia_… » (securite/jetons.js) ou la connexion Google (oauth/).
import { onRequest, onCall, HttpsError } from 'firebase-functions/v2/https';
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { defineSecret } from 'firebase-functions/params';
import { getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue, Timestamp } from 'firebase-admin/firestore';
import { creerGestionnaire, baseLienMaison } from './mcp/gestionnaire.js';
import { OUTILS_ACHATS } from './mcp/outils/achats.js';
import { adresseFonction, adresseSite, compteDeService, projetCourant } from './securite/maison.js';
import { texteDe, comptesAutorises, emailDans } from './securite/reglages-maison.js';
import { creerAccesFirestore } from './coeur/donnees.js';
import { creerMagasin } from './securite/jetons.js';
import { creerLimiteur } from './securite/limites.js';
import { lireSecretJetons } from './securite/secret.js';
import { creerRouteurOauth } from './oauth/routeur.js';
import { creerVerificateurIdentite } from './oauth/identite-google.js';
import { creerGestionnairePorteCrm } from './porte.js';
import { creerGestionnaireTableauCrm } from './tableaudebord.js';
import { creerAppelAccorderAcces, ligneDeJournalBase } from './base/acces-appel.js';
import { creerGestionnaireBasePorte, creerLecteurConfiguration, creerLecteurCleN8n, creerStockageGcs, ligneDeJournalPorte } from './base/porte-base.js';
import { creerOuvreurCloudSql } from './base/cloudsql.js';
import { creerAssistantAchats } from './base/assistant-achats.js';
import { getAuth } from 'firebase-admin/auth';
import { creerAppelSaisie, ligneDeJournalSaisie } from './tableaudebord-saisie.js';
import { creerAppelDecider, ligneDeJournalDecision } from './automatisations/decider-appel.js';
import { creerAppelRenommer, ligneDeJournalRenommer } from './automatisations/renommer-appel.js';
import { creerAdaptateur } from '../partage/porte/adaptateur.js';
import { creerServiceVeille } from './veille/service.js';
import { creerAppelVeille } from './veille/appel.js';
import { creerServiceBuffer } from './reseauxsociaux/service.js';
import { creerAppelBuffer, creerAppelReleve } from './reseauxsociaux/appel.js';
import { releverMesures } from './reseauxsociaux/mesures.js';
import { creerAppelDevis, ligneDeJournalDevis } from './devis-appel.js';
import { creerAppelVillage, ligneDeJournalVillage } from './village-appel.js';
import { creerVillageOr } from './coeur/village-or.js';
import { creerVerificateurAchat } from './base/village-achats.js';
import { onDocumentUpdated } from 'firebase-functions/v2/firestore';
import { creerAppelDevisPdf, creerAppelDevisPdfLien, ligneDeJournalDevisPdf } from './devis/pdf-appel.js';
import { creerDeclencheurPdf } from './devis/pdf-declencheur.js';
import { creerAppelDocument, ligneDeJournalDocuments } from './documents/appel.js';
import { creerGestionnaireDepot } from './coeur/depot-lien.js';
import { stockageDuProjet, bucketDuProjet } from './devis/stockage-projet.js';
import { creerSortieN8n } from './coeur/n8n-sortie.js';
import { creerAppelPreparerEmail, creerAppelEtatPreparerEmail } from './devis-email-appel.js';
import { creerAppelRdvEtat, creerAppelRdvEnvoyer } from './rdv-appel.js';
import { creerSmsDirect, creerGestionnaireReponses, verifierConnexion } from './coeur/sms-direct.js';
import { creerConnexionSms } from './coeur/connexion-sms.js';
import { creerEcrivainSecrets } from './securite/ecrire-secret.js';
import { creerAppelRdvConnexion } from './rdv-connexion-appel.js';
import { creerLecteurSecrets } from './securite/secrets.js';
import { convertirHtmlEnPdf } from './devis/chromium.js';
import { copieInterne, administrateur, Refus } from './automatisations/appels.js';
import { creerLecteurN8n } from '../partage/automatisations/n8n.js';
import { creerAppelDeploiement, ligneDeJournalDeploiement } from './deploiement-appel.js';
import { VERSION_SERVEUR } from './version.js';
import { creerAppelConsole, creerAppelConsoleVersions, creerAppelConsoleBatiments, ligneDeJournalConsole } from './console/appel.js';
import { lireVersionsBatiments } from './console/versions.js';
import { lireBatimentsConsole } from './console/batiments.js';
import { releverBatiments, ligneDeJournalReleve } from './console/releve.js';
import { tamponnerVersion, versionApplication } from './coeur/tampon-version.js';
import { creerAppelPilotageLire, creerAppelPilotageEnregistrer, ligneDeJournalPilotage } from './pilotage/appel.js';
import { creerServicePilotage } from './pilotage/service.js';
import { creerAssistantPilotage } from './pilotage/assistant.js';
import { creerConnecteurPostgres } from './pilotage/postgres.js';

const magasin = creerMagasin({ lire: lireSecretJetons() });
const donnees = creerAccesFirestore();
const limiteur = creerLimiteur({ donnees });
const oauth = creerRouteurOauth({ donnees, verifierIdToken: creerVerificateurIdentite() });

// Sortie vers n8n (adresse et secret lus dans Secret Manager à l'appel, jamais liés au déploiement) : l'écran ET l'assistant (MCP) ne font que demander un BROUILLON d'e-mail.
const sortieN8nDevis = creerSortieN8n({ lireSecret: creerLecteurSecrets() });

export const mcp = onRequest(
  {
    region: 'europe-west9',
    maxInstances: 3,
    memory: '256MiB',
    timeoutSeconds: 120,
    invoker: 'public',
    cors: false,
    // Compte dédié : « Utilisateur Cloud Datastore » (Firestore), « Accesseur de secrets » sur MCP_JETONS et sur les deux secrets du brouillon d'e-mail (N8N_DEVIS_EMAIL_*), « Créateur d'objets Storage » (dépôt de texte) ; « Lecteur des objets Storage » et « Créateur de jetons du compte de service » sur lui-même sont À DONNER pour le lien signé du PDF officiel (docs/securite-et-pannes.md, section 12), sans quoi l'outil rend seulement le lien du devis. Tableau de bord (outils lister_tableau_de_bord et lire_tableau_de_bord, lecture seule, super admin seulement) : « Accesseur de secrets » sur SUPABASE_INDICATEURS est À DONNER à ce compte par Jérôme (docs/securite-et-pannes.md), sans quoi toutes les tuiles répondent « n'a pas pu être lue ».
    serviceAccount: compteDeService('mcp-serveur'),
  },
  // Outils Achats : proposés seulement dans une maison dont reglages_maison/ecran liste « achatsfactures » (sans ce champ, chez Jérôme, rien ne change).
  creerGestionnaire({ magasin, donnees, limiteur, oauth, stockage: stockageDuProjet, sortieEmail: sortieN8nDevis, pilotage: () => assistantPilotage, achats: () => assistantAchats, outilsAchats: OUTILS_ACHATS, lienDepot: true }), // `assistantPilotage` et `assistantAchats` sont définis plus bas : fonctions paresseuses, sinon ReferenceError au démarrage
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
    serviceAccount: compteDeService('porte-serveur'),
  },
  creerGestionnairePorteCrm(),
);

// `tableaudebord` : porte des scripts GitHub (surveillance des clés, des sauvegardes) qui écrivent leurs relevés dans la base, jointe par
// https://chevalier-ia-os.web.app/tableau-de-bord (réécriture Hosting). Clé « cle-tdb.interne.… » (outil scripts/cles.js, --usage tableaudebord). Même compte que la porte :
// aucun droit de plus, et aucun secret lu.
export const tableaudebord = onRequest(
  {
    region: 'europe-west9',
    maxInstances: 3,
    memory: '256MiB',
    timeoutSeconds: 60,
    invoker: 'public',
    cors: false,
    serviceAccount: compteDeService('porte-serveur'),
  },
  creerGestionnaireTableauCrm(),
);

// `tableaudebordSaisir` : appelée par l'écran Tableau de bord (saisir une date d'échéance ou une valeur). Contrôle l'appelant (mêmes comptes que `veille`), puis écrit
// l'indicateur ET la ligne d'historique en un seul lot. Même région et mêmes limites que `veille` ; même compte de service que la porte (il a déjà les droits Firestore, aucun secret lu).
export const tableaudebordSaisir = onCall(
  { region: 'europe-west9', maxInstances: 3, memory: '256MiB', timeoutSeconds: 60, serviceAccount: compteDeService('porte-serveur') },
  (requete) => {
    if (!getApps().length) initializeApp();
    return creerAppelSaisie({ donnees: creerAdaptateur({ db: getFirestore() }), journal: (e) => process.stdout.write(`${ligneDeJournalSaisie(e)}\n`) })(requete);
  },
);

// `consoleEtat` : appelée par la Console (module réservé à Jérôme, exception du 16/11/2026). Contrôle l'identité à chaque appel (un seul compte) ; phase 0 : ne lit aucune base ni aucun secret.
// Absente de la plateforme (RESERVEES_JEROME). Compte de service de la porte pour l'instant : un compte dédié en lecture seule prendra le relais en phase 1, avec l'autorisation de
// déploiement à lui donner en même temps.
export const consoleEtat = onCall(
  { region: 'europe-west9', maxInstances: 2, memory: '256MiB', timeoutSeconds: 30, serviceAccount: compteDeService('porte-serveur') },
  (requete) => creerAppelConsole({ version: VERSION_SERVEUR, journal: (e) => process.stdout.write(`${ligneDeJournalConsole(e)}\n`) })(requete),
);

// `tamponVersion` (28/11/2026, Console phase 2) : toutes les heures, le bâtiment note sa version (version.json) et le numéro de structure de ses données dans reglages_maison/version
// (coeur/tampon-version.js, même code dans l'immeuble). Seul déclenchement : cette fonction planifiée, jamais au chargement. Compte de service de la porte, comme `consoleEtat`.
export const tamponVersion = onSchedule(
  { region: 'europe-west9', schedule: '0 * * * *', timeZone: 'Europe/Paris', timeoutSeconds: 60, memory: '256MiB', maxInstances: 1, serviceAccount: compteDeService('porte-serveur') },
  async () => {
    if (!getApps().length) initializeApp();
    await tamponnerVersion({ db: getFirestore(), horodatage: () => FieldValue.serverTimestamp() });
  },
);

// `baseAccorderAcces` : appelée par Réglages > Connexion à la base (Jérôme seul). Pose ou retire, pour UN compte, les deux mentions Firebase (`role`, `espace_base`) qui ouvrent la base d'un espace.
// Absente de la plateforme (RESERVEES_JEROME). Compte de service DÉDIÉ `base-acces` (accord de Jérôme du 25/11/2026) : un rôle sur mesure avec seulement
// `firebaseauth.users.get` et `firebaseauth.users.update`, rien d'autre (le journal ne passe que par la sortie standard). `porte-serveur` n'a pas ce droit et ne le reçoit pas.
export const baseAccorderAcces = onCall(
  { region: 'europe-west9', maxInstances: 2, memory: '256MiB', timeoutSeconds: 30, serviceAccount: compteDeService('base-acces') },
  (requete) => {
    if (!getApps().length) initializeApp();
    return creerAppelAccorderAcces({ auth: getAuth(), journal: (e) => process.stdout.write(`${ligneDeJournalBase(e)}\n`) })(requete);
  },
);

// `basePorte` (26/11/2026, décision « porte option A ») : la seule entrée vers la base Cloud SQL de la maison, pour les écrans Achats et pour n8n, au format PostgREST
// (functions/src/base/porte-requetes.js). Navigateur : jeton Firebase vérifié (révocation comprise) + mentions role/espace_base + comptes_autorises de reglages_maison/maison,
// lecture seule et 3 fonctions ; n8n : en-tête X-Porte-Cle (secret BASE_PORTE_N8N) comparé en temps constant. L'espace vient du secret BASE_PORTE, jamais de la requête.
// Secrets lus À L'EXÉCUTION (jamais defineSecret) : dans une maison sans Cloud SQL (le CRM de Jérôme aujourd'hui), la fonction se déploie et répond 503, inerte.
// Compte `porte-serveur` (déjà présent dans chaque maison : rien de nouveau à créer pour que le déploiement passe). Pour servir vraiment, il lui faut, dans la maison qui a la base :
// « Client Cloud SQL », « Accesseur de secrets » sur BASE_PORTE et BASE_PORTE_N8N, « Administrateur des objets Storage » sur la réserve des factures, et le droit de lire les comptes
// Firebase (révocation du jeton). Absente de la plateforme (RESERVEES_JEROME, .github/A-FAIRE.md). Le seul fichier qui charge le connecteur et `pg` : base/cloudsql.js.
const lecteurSecretsPorte = creerLecteurSecrets();
export const basePorte = onRequest(
  {
    region: 'europe-west9',
    maxInstances: 3,
    memory: '256MiB',
    timeoutSeconds: 120,
    invoker: 'public',
    cors: false, // CORS géré par la porte elle-même : seulement les origines du secret, jamais « * »
    serviceAccount: compteDeService('porte-serveur'),
  },
  creerGestionnaireBasePorte({
    lireConfiguration: creerLecteurConfiguration({ lireSecret: lecteurSecretsPorte }),
    lireCleN8n: creerLecteurCleN8n({ lireSecret: lecteurSecretsPorte }),
    verifierJeton: (jeton) => { if (!getApps().length) initializeApp(); return getAuth().verifyIdToken(jeton, true); },
    estCompteAutorise: (email) => emailDans(comptesAutorises, email, 'minuscules'),
    ouvrirConnexion: creerOuvreurCloudSql(),
    stockage: creerStockageGcs(),
    journal: (e) => process.stdout.write(`${ligneDeJournalPorte(e)}\n`),
  }),
);

// Service des achats d'une maison pour l'assistant (outils MCP *_facture_achat, et dépôt d'une facture par lien d'envoi) : il ouvre lui-même la base (rôle `porte`, voie interne,
// même configuration que la porte ci-dessus) et passe par n8n pour toute écriture (ticket neuf, webhooks de base_parametres/connexion sur l'hôte de n8n_url). Inerte sans base
// (« pas branchée »). Droits du compte `mcp-serveur` À DONNER dans la maison qui a la base : « Client Cloud SQL » et « Accesseur de secrets » sur le secret de configuration de la porte.
// Le compte du dépôt (`depotdocument`) a déjà ces droits (même compte que la porte). Aucune valeur n'est écrite dans les journaux (action, statut, code seulement).
const assistantAchats = creerAssistantAchats({
  lireConfiguration: creerLecteurConfiguration({ lireSecret: lecteurSecretsPorte }),
  ouvrirConnexion: creerOuvreurCloudSql(),
  estCompteAutorise: (email) => emailDans(comptesAutorises, email, 'minuscules'),
  lireConnexion: async () => {
    if (!getApps().length) initializeApp();
    const doc = await getFirestore().collection('base_parametres').doc('connexion').get();
    return doc.exists ? doc.data() : null;
  },
  lireAdresseN8n: () => texteDe('n8n_url'),
  journal: (e) => process.stdout.write(`${JSON.stringify({ evenement: 'achats_assistant', action: e?.action, statut: e?.statut, code: e?.code })}\n`),
});

// `automatisationsDecider` : appelée par l'écran « À valider » du module Automatisations (valider, refuser ou relancer une proposition). Contrôle l'appelant (mêmes comptes que `veille`),
// puis décide en une lecture-modification-écriture atomique (functions/src/coeur/propositions.js, le même code que les outils MCP). Même région, mêmes limites et même compte
// de service que `tableaudebordSaisir` : aucun droit de plus, aucun secret lu, rien de nouveau à créer avant le déploiement.
export const automatisationsDecider = onCall(
  { region: 'europe-west9', maxInstances: 3, memory: '256MiB', timeoutSeconds: 60, serviceAccount: compteDeService('porte-serveur') },
  (requete) => {
    if (!getApps().length) initializeApp();
    return creerAppelDecider({ donnees: creerAccesFirestore(), journal: (e) => process.stdout.write(`${ligneDeJournalDecision(e)}\n`) })(requete);
  },
);

// `automatisationsRenommer` : icône « Renommer » du module Automatisations chez Jérôme (même nom que la fonction de la plateforme, même code de contrôle du nom : partage/automatisations/libelle.js).
// Écrit le seul champ « libelle » d'un document de la collection racine `workflows` ; contrôle de l'appelant comme `automatisationsDecider` ; mêmes région, limites et compte de service ; aucun secret, n8n n'est pas appelé.
export const automatisationsRenommer = onCall(
  { region: 'europe-west9', maxInstances: 3, memory: '256MiB', timeoutSeconds: 60, serviceAccount: compteDeService('porte-serveur') },
  (requete) => {
    if (!getApps().length) initializeApp();
    return creerAppelRenommer({ db: () => getFirestore(), effacer: FieldValue.delete(), journal: (e) => process.stdout.write(`${ligneDeJournalRenommer(e)}\n`) })(requete);
  },
);

// Module Devis (24/10/2026) : les quatre transitions d'un devis se font ICI, jamais depuis le navigateur (les règles Firestore ne laissent écrire qu'un brouillon).
// Contrôle de l'appelant comme `automatisationsDecider` ; mêmes région, limites et compte de service ; aucun secret, aucun appel à n8n dans cette version.
const OPTIONS_DEVIS = { region: 'europe-west9', maxInstances: 3, memory: '256MiB', timeoutSeconds: 60, serviceAccount: compteDeService('porte-serveur') };
const appelDevis = (operation) => onCall(OPTIONS_DEVIS, (requete) => {
  if (!getApps().length) initializeApp();
  return creerAppelDevis(operation, { donnees: () => creerAccesFirestore(), journal: (e) => process.stdout.write(`${ligneDeJournalDevis(e)}\n`) })(requete);
});
export const devisFinaliser = appelDevis('finaliser');
export const devisChangerStatut = appelDevis('changerStatut');
export const devisNouvelleVersion = appelDevis('nouvelleVersion');
export const devisArchiver = appelDevis('archiver');
export const devisSupprimer = appelDevis('supprimer');
export const devisEnregistrerEnvoi = appelDevis('enregistrerEnvoi'); // historique des envois par e-mail (le brouillon Gmail est créé par le navigateur, avec le Google de l'utilisateur)
export const devisModifierDestinataires = appelDevis('modifierDestinataires'); // destinataire et copie d'un devis finalisé ou envoyé (rien d'autre ne change)
export const devisChoisirAffaire = appelDevis('choisirAffaire'); // choisir l'affaire d'un devis finalisé qui n'en a pas (toutes les versions, montant recalculé, restaurable)
export const modeTestSupprimer = appelDevis('supprimerTests'); // Réglages > Mes tests : aperçu puis suppression de tous les éléments de test (mode test, PR 4)
export const devisMarquerTest = appelDevis('marquerTest'); // marquer ou démarquer comme test un devis finalisé (mode test, PR 3) ; un TEST- finalisé reste un test

// Or du village (27/11/2026) : gains vérifiés par le serveur (facture d'achat acceptée, facture de projet payée, devis signé), jamais écrits par le navigateur.
// Même compte de service que les devis (`porte-serveur`) ; la base des achats est lue en LECTURE SEULE quand la maison en a une (secret de la porte lu à l'exécution, jamais defineSecret) :
// sans base, la fonction se déploie et marche pour les deux autres sources. Dans une maison qui a la base, `porte-serveur` a déjà « Client Cloud SQL » et l'accès au secret de la porte (voir basePorte).
const verifierAchatVillage = creerVerificateurAchat({ lireConfiguration: creerLecteurConfiguration({ lireSecret: lecteurSecretsPorte }), ouvrirConnexion: creerOuvreurCloudSql() });
export const villageOr = onCall(OPTIONS_DEVIS, (requete) => {
  if (!getApps().length) initializeApp();
  return creerAppelVillage({
    service: (email) => creerVillageOr({ db: getFirestore(), verifierAchat: (id) => verifierAchatVillage(id, email), horodatage: (ms) => Timestamp.fromMillis(ms) }),
    journal: (e) => process.stdout.write(`${ligneDeJournalVillage(e)}\n`),
  })(requete);
});

// « Préparer l'e-mail » (25/10/2026) : la fonction demande à un workflow n8n de créer un BROUILLON dans le Gmail du compte (PDF joint) ; ni l'appli ni n8n n'envoient jamais l'e-mail.
// L'adresse du webhook et son secret sont lus dans Secret Manager au moment de l'appel (N8N_DEVIS_EMAIL_URL, N8N_DEVIS_EMAIL_SECRET), jamais liés au déploiement : s'ils manquent,
// la fonction répond « pas encore branchée » et l'écran masque le bouton (devisPreparerEmailEtat). Le compte de service doit avoir « Accesseur de secrets » sur ces deux secrets (docs/ajouter-un-bouton-workflow.md).
// Le seul fichier qui fait le POST vers n8n est coeur/n8n-sortie.js (un test le borne). Le résultat revient par la porte (devis.lireEmail, devis.noterEmailPrepare).
export const devisPreparerEmail = onCall(OPTIONS_DEVIS, (requete) => {
  if (!getApps().length) initializeApp();
  return creerAppelPreparerEmail({ donnees: () => creerAccesFirestore(), sortie: sortieN8nDevis, journal: (e) => process.stdout.write(`${ligneDeJournalDevis(e)}\n`) })(requete);
});
export const devisPreparerEmailEtat = onCall(OPTIONS_DEVIS, (requete) => {
  if (!getApps().length) initializeApp();
  return creerAppelEtatPreparerEmail({ sortie: sortieN8nDevis })(requete);
});

// Module Rendez-vous (14/11/2026) : les SMS partent DIRECTEMENT par l'API de ClickSend (coeur/sms-direct.js), sans n8n. La connexion (identifiant, clé, jeton de l'adresse de réponse) est dans Secret Manager
// (CLICKSEND_RDV), lue à l'exécution : absente, « Envoyer » reste grisé (rdvEtat). Le compte de service doit avoir « Accesseur de secrets » sur ce secret.
const smsDirect = creerSmsDirect({
  lireSecret: creerLecteurSecrets(),
  donneesDe: () => { if (!getApps().length) initializeApp(); return { base: '', donnees: creerAdaptateur({ db: getFirestore() }) }; },
  baseLien: baseLienMaison, // (calculé à l'appel) lien du rendez-vous dans les alertes « un créneau convient à tous » / « aucun créneau commun » (jamais de secret dedans)
});
const journalRdv = (e) => process.stdout.write(`${JSON.stringify({ fonction: 'rdv', ...e })}\n`);
export const rdvEtat = onCall(OPTIONS_DEVIS, (requete) => {
  if (!getApps().length) initializeApp();
  return creerAppelRdvEtat({ sortie: smsDirect })(requete);
});
export const rdvEnvoyer = onCall({ ...OPTIONS_DEVIS, timeoutSeconds: 120 }, (requete) => {
  if (!getApps().length) initializeApp();
  return creerAppelRdvEnvoyer({ donnees: () => creerAccesFirestore(), sortie: smsDirect, journal: journalRdv })(requete);
});
// Saisie de la connexion ClickSend depuis Réglages > Rendez-vous : RÉSERVÉE à Jérôme (identité contrôlée à l'exécution). La clé est vérifiée auprès de ClickSend puis rangée dans Secret Manager (CLICKSEND_RDV) ;
// elle n'est jamais rendue ni journalisée. Le compte de service doit pouvoir ajouter une version de secret (docs/rdv-sms-clicksend.md).
const connexionSms = creerConnexionSms({
  lireSecret: creerLecteurSecrets(),
  ecrireSecret: creerEcrivainSecrets(),
  verifier: verifierConnexion,
  adresseDe: (espace, jeton) => `${adresseFonction('rdvReponseSms')}/${jeton}`,
});
export const rdvConnexionSms = onCall(OPTIONS_DEVIS, (requete) => {
  if (!getApps().length) initializeApp();
  return creerAppelRdvConnexion({ connexion: connexionSms, journal: journalRdv })(requete);
});
// Module Pilotage (étape 1, 23/11/2026, d'abord chez Jérôme seulement : RESERVEES_JEROME) : tableaux de bord lus dans le Postgres du client. La connexion (hôte, base, utilisateur, mot de passe, certificat) est dans
// Secret Manager (SUPABASE_INDICATEURS, JSON), lue à l'exécution et jamais liée au déploiement : absente, les tuiles répondent « n'a pas pu être lue ». Le compte de service doit avoir « Accesseur de secrets » sur ce secret.
// Le seul fichier qui parle à Postgres est pilotage/postgres.js (un test le borne). Le réglage (pilotage_parametres/reglages) n'est lu et écrit que par le serveur (règles Firestore : tout refusé).
const journalPilotage = (e) => process.stdout.write(`${ligneDeJournalPilotage(e)}\n`);
const servicePilotage = creerServicePilotage({
  donnees: () => { if (!getApps().length) initializeApp(); return creerAccesFirestore(); },
  connecter: creerConnecteurPostgres({ lireSecret: creerLecteurSecrets() }),
  journalErreur: (type, etat) => journalPilotage({ action: 'lecture', statut: 'erreur', type, etat }),
});
// Les outils MCP du Tableau de bord (lecture seule, super admin) lisent ce MÊME service ; `mcp` a son propre cache de 60 s (par processus) : un écart de 60 s au plus avec l'écran est normal.
const assistantPilotage = creerAssistantPilotage({ service: servicePilotage });
const OPTIONS_PILOTAGE = { ...OPTIONS_DEVIS, maxInstances: 2 };
export const pilotageLire = onCall(OPTIONS_PILOTAGE, (requete) => {
  if (!getApps().length) initializeApp();
  return creerAppelPilotageLire({ service: servicePilotage, journal: journalPilotage })(requete);
});
export const pilotageEnregistrerReglages = onCall(OPTIONS_PILOTAGE, (requete) => {
  if (!getApps().length) initializeApp();
  return creerAppelPilotageEnregistrer({ service: servicePilotage, journal: journalPilotage })(requete);
});
// Filet : toutes les 15 minutes, envoie les SMS dus (relances, rappel de la veille, confirmation…) même si personne n'a cliqué. Rien à faire si la connexion n'est pas branchée.
export const rdvEnvoiPlanifie = onSchedule(
  { region: 'europe-west9', schedule: '*/15 * * * *', timeZone: 'Europe/Paris', timeoutSeconds: 300, memory: '256MiB', maxInstances: 1, serviceAccount: OPTIONS_DEVIS.serviceAccount },
  async () => {
    const bilan = await smsDirect.tirer('interne', { budgetMs: 200_000, avecSolde: true }); // la fonction dure 300 s : le budget laisse de la marge (jamais coupée en plein envoi)
    if (bilan.branche) journalRdv({ action: 'planifie', statut: bilan.arret ? 'arret' : 'ok', arret: bilan.arret, envoyes: bilan.envoyes, echecs: bilan.echecs, incertains: bilan.incertains, restants: bilan.restants, alertesSolde: bilan.alertesSolde ?? 0 });
  },
);
// Réponses par SMS : ClickSend appelle cette adresse (POST) avec le jeton secret en dernier morceau du chemin. Invocation publique côté Google ; la vraie porte est le jeton (sinon 404, sans rien dire).
export const rdvReponseSms = onRequest(
  { region: 'europe-west9', invoker: 'public', maxInstances: 3, memory: '256MiB', timeoutSeconds: 60, serviceAccount: OPTIONS_DEVIS.serviceAccount },
  creerGestionnaireReponses({ sms: smsDirect, espaceFixe: 'interne', journal: journalRdv }),
);

// PDF d'un devis (25/10/2026) : fabriqué PAR LE SERVEUR dès qu'un devis passe de brouillon à finalisé (déclencheur Firestore `devisPdfAuto`), jamais par le navigateur.
// Chromium est lancé dans la fonction (2 GiB de mémoire, un navigateur par appel) ; le PDF est rangé dans Cloud Storage du projet (devis/<affaire>/<devis>/…, jamais public),
// et l'état est noté sur le devis (`pdf.statut` : en_cours, ok, echec). Rien à configurer : ni dossier, ni variable.
// Le même code est copié dans functions-plateforme/serveur/ pour l'autre projet (la plateforme) et déclaré dans functions-plateforme/src/index.js : là-bas, un déclencheur par espace.
const baseLienDevis = () => adresseSite(); // calculée à l'appel (le projet n'est connu qu'à l'exécution)
const stockageDevis = stockageDuProjet;
const OPTIONS_PDF = { ...OPTIONS_DEVIS, memory: '2GiB', timeoutSeconds: 120, concurrency: 1, maxInstances: 2 };
const limiteurPdf = creerLimiteur({ donnees: null }); // seul `requete` (compteur en mémoire) sert ici, jamais `reserver` ; créé une seule fois : un compteur par compte, partagé par tous les appels de cette instance
const journalPdf = (e) => process.stdout.write(`${ligneDeJournalDevisPdf(e)}\n`);

// Réessai à la demande (icône d'avertissement, rattrapage des devis déjà finalisés) ou PDF « brouillon » filigrané : `devisPdf({ devisId, brouillon? })`.
export const devisPdf = onCall(OPTIONS_PDF, (requete) => {
  if (!getApps().length) initializeApp();
  return creerAppelDevisPdf({ donnees: () => creerAccesFirestore(), baseLien: baseLienDevis(), stockage: stockageDevis, journal: journalPdf, limiteur: limiteurPdf })(requete);
});
// Lien de lecture signé de 5 minutes : c'est ce que l'application appelle quand on clique sur le document « DEV-… v1 – Objet.pdf » de l'affaire.
export const devisPdfLien = onCall(OPTIONS_DEVIS, (requete) => {
  if (!getApps().length) initializeApp();
  return creerAppelDevisPdfLien({ donnees: () => creerAccesFirestore(), stockage: stockageDevis, journal: journalPdf })(requete);
});
// Déclencheur : ne réagit qu'au passage brouillon -> finalisé (l'écriture de `pdf` ne le relance donc jamais) et ne lève jamais d'erreur (pas de rejeu).
export const devisPdfAuto = onDocumentUpdated(
  { document: 'devis_devis/{devisId}', region: 'europe-west9', memory: '2GiB', timeoutSeconds: 540, concurrency: 1, maxInstances: 2, retry: false, serviceAccount: compteDeService('porte-serveur') },
  (evenement) => {
    if (!getApps().length) initializeApp();
    return creerDeclencheurPdf({
      donnees: () => creerAccesFirestore(), baseLien: baseLienDevis(), stockage: stockageDevis, journal: journalPdf,
      convertir: (html, options) => convertirHtmlEnPdf(html, options),
    })(evenement);
  },
);

// Onglet « Documents » (28/10/2026) : fichiers déposés dans une affaire ou un projet, rangés dans Cloud Storage du projet (documents/<affaire|projet>/<id>/…, jamais publics) avec une fiche
// `documents_stockes` écrite par le serveur seulement. Aucune règle Storage ne change (le navigateur n'y accède jamais : le dépôt et la lecture passent par ces fonctions, la lecture par un lien
// signé de 5 minutes). Même compte de service que les PDF. Le dépôt reçoit le fichier en base64 (corps d'appel ~32 Mo au plus : 20 Mo de fichier) : il lui faut plus de mémoire et de temps que les devis.
const OPTIONS_DOCUMENT_DEPOT = { ...OPTIONS_DEVIS, memory: '1GiB', timeoutSeconds: 300, concurrency: 2, maxInstances: 2 };
const journalDocuments = (e) => process.stdout.write(`${ligneDeJournalDocuments(e)}\n`);
const appelDocument = (operation, options) => onCall(options, (requete) => {
  if (!getApps().length) initializeApp();
  return creerAppelDocument(operation, { donnees: () => creerAccesFirestore(), stockage: stockageDevis, journal: journalDocuments })(requete);
});
export const documentDeposer = appelDocument('deposer', OPTIONS_DOCUMENT_DEPOT);
export const documentLien = appelDocument('lien', OPTIONS_DEVIS);
export const documentRenommer = appelDocument('renommer', OPTIONS_DEVIS);
export const documentSupprimer = appelDocument('supprimer', OPTIONS_DEVIS);
// Lien d'envoi temporaire (17/11/2026) : l'assistant demande un lien (outil MCP `demander_lien_depot`), le fichier arrive ICI (adresse /depot/<lien> du site, réécrite par firebase.json vers ce service ; le nom du
// service est le nom de la fonction en minuscules). Invocation publique côté Google : la vraie porte est le lien (256 bits, 10 minutes, un seul usage, une seule fiche) ; sans lien valable, rien n'est dit.
// Même compte et mêmes contrôles que `documentDeposer` ; le contenu et le lien ne sont jamais écrits dans les journaux. Absent des espaces de la plateforme pour l'instant (tests/ecarts-fonctions.test.js).
let gestionnaireDepot = null;
export const depotdocument = onRequest(
  { ...OPTIONS_DOCUMENT_DEPOT, invoker: 'public', cors: false },
  (req, res) => {
    if (!getApps().length) initializeApp();
    gestionnaireDepot ??= creerGestionnaireDepot({
      donnees: () => creerAccesFirestore(), stockage: stockageDevis, journal: (e) => process.stdout.write(`${JSON.stringify({ evenement: 'depot_lien', ...e })}\n`),
      deposerAchat: (demande) => assistantAchats.deposerFacture(demande), // lien d'une facture d'achat (outil ajouter_facture_achat)
    });
    return gestionnaireDepot(req, res);
  },
);

// `deploiementVerifier` (25/10/2026) : contrôles du serveur pour la page Réglages > Déploiement (« les fonctions répondent », « les personnes autorisées »).
// Mêmes comptes que les devis ; même région, limites et compte de service ; AUCUN secret déclaré (un secret absent ferait échouer tout le déploiement), rien n'est écrit.
export const deploiementVerifier = onCall({ ...OPTIONS_DEVIS, timeoutSeconds: 30 }, (requete) => creerAppelDeploiement({
  version: VERSION_SERVEUR, journal: (e) => process.stdout.write(`${ligneDeJournalDeploiement(e)}\n`),
  // Lignes « PDF » de la page : le stockage répond ; les trois fonctions du PDF sont déclarées dans CE serveur (un serveur plus ancien ne connaît pas ces lignes : elles restent orange).
  pdf: { bucket: bucketDuProjet, fonctions: () => [devisPdf, devisPdfLien, devisPdfAuto].every((f) => f) },
})(requete));

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

// `reseauxsociauxBuffer` : lecture SEULE des posts LinkedIn dans Buffer (module Réseaux sociaux), réservée aux comptes de Jérôme. La clé vit dans Secret Manager
// (BUFFER_API_KEY, déjà créé : un secret absent ferait échouer tout le déploiement), jamais dans la page. Aucune écriture dans Buffer, aucune dans Firestore.
const CLE_BUFFER = defineSecret('BUFFER_API_KEY');
export const reseauxsociauxBuffer = onCall(
  { region: 'europe-west9', maxInstances: 3, memory: '256MiB', timeoutSeconds: 60, secrets: [CLE_BUFFER] },
  (requete) => {
    const service = creerServiceBuffer({ lireCle: () => CLE_BUFFER.value() });
    return creerAppelBuffer({ service, journal: (e) => process.stdout.write(`${JSON.stringify({ severity: 'INFO', message: 'reseauxsociauxBuffer', ...e })}\n`) })(requete);
  },
);

// Relevé des chiffres des posts (module Réseaux sociaux) : Buffer ne donne que les chiffres d'aujourd'hui, donc on en garde une photo par post et par semaine dans la table
// `reseauxsociaux_mesures` (créée à la première écriture). Même clé BUFFER_API_KEY que ci-dessus (lecture SEULE dans Buffer ; la seule écriture est dans notre base).
// Deux portes pour la même logique : `reseauxsociauxMesuresHebdo` (planifiée, chaque lundi 06:00 à Paris) et `reseauxsociauxReleverMesures` (bouton / appel à la main, mêmes comptes que la lecture).
// Les écritures vont DIRECTEMENT dans Firestore, sans le moteur d'audit du CRM (`crm_audit`, réservé aux données du CRM et à leur restauration) : ce sont des relevés automatiques, un par post et par semaine,
// qu'on ne « restaure » jamais ; la trace est la ligne de journal Cloud (nombre lu, écrit, tronqué). Même identifiant = même document : relancer ne double rien.
const journalMesures = (e) => process.stdout.write(`${JSON.stringify({ severity: e.statut === 'ok' ? 'INFO' : 'WARNING', message: 'reseauxsociauxMesures', ...e })}\n`);
const releverMaintenant = ({ ecraser }) => {
  if (!getApps().length) initializeApp();
  const db = getFirestore();
  const donnees = {
    // Lots de 400 documents (limite Firestore : 500). ecraser : `set` sans fusion remplace le document de la semaine. Sinon : on lit d'abord ce qui existe, on ne crée que le reste (`create`).
    async ecrire(collection, documents, options) {
      let ecrits = 0;
      let ignores = 0;
      for (let i = 0; i < documents.length; i += 400) {
        const tranche = documents.slice(i, i + 400);
        const refs = tranche.map((d) => db.collection(collection).doc(d.id));
        const existants = options.ecraser ? [] : await db.getAll(...refs);
        const lot = db.batch();
        tranche.forEach((d, k) => {
          if (options.ecraser) { lot.set(refs[k], d.donnees); ecrits += 1; } else if (existants[k].exists) ignores += 1; else { lot.create(refs[k], d.donnees); ecrits += 1; }
        });
        await lot.commit();
      }
      return { ecrits, ignores };
    },
  };
  return releverMesures({ service: creerServiceBuffer({ lireCle: () => CLE_BUFFER.value() }), donnees, journal: journalMesures, ecraser });
};
// 540 s = maximum d'une fonction planifiée ; une lecture de 50 pages de 100 posts tient largement dedans (quelques secondes par page).
export const reseauxsociauxMesuresHebdo = onSchedule(
  { region: 'europe-west9', schedule: '0 6 * * 1', timeZone: 'Europe/Paris', secrets: [CLE_BUFFER], timeoutSeconds: 540, memory: '256MiB', maxInstances: 1, retryCount: 3 }, // relance possible : l'écriture est idempotente (même semaine = même document)
  async () => {
    try {
      await releverMaintenant({ ecraser: true });
    } catch (e) {
      process.stdout.write(`${JSON.stringify({ severity: 'ERROR', message: 'reseauxsociauxMesures : relevé hebdomadaire en échec', nom: e?.name, code: e?.code })}\n`);
      throw e; // le lancement apparaît en échec dans Cloud Scheduler
    }
  },
);
export const reseauxsociauxReleverMesures = onCall(
  { region: 'europe-west9', maxInstances: 1, memory: '256MiB', timeoutSeconds: 540, secrets: [CLE_BUFFER] },
  (requete) => creerAppelReleve({ relever: () => releverMaintenant({ ecraser: false }), journal: (e) => process.stdout.write(`${JSON.stringify({ severity: 'INFO', message: 'reseauxsociauxReleverMesures', ...e })}\n`) })(requete),
);

// Automatisations (workflows n8n) dans Chevalier IA OS : copie de TES workflows « interne » et vue administrateur de tous les propriétaires.
// INTERRUPTEUR DE MISE EN SERVICE. Toute fusion dans main déploie TOUTES les fonctions de ce dossier (.github/workflows/firebase-hosting.yml) ; si le secret N8N_API_KEY
// ou le compte de service ci-dessous n'existe pas encore dans chevalier-ia-os, le déploiement ÉCHOUE et le CRM n'est plus mis à jour. Tant que cette constante est `false`,
// les deux fonctions ne sont donc pas déclarées (rien n'est déployé, l'écran le dit poliment). Elle passe à `true` dans une petite PR, APRÈS le guide de
// docs/automatisations-n8n.md (partie 11) : secret créé, compte de service créé avec ses trois droits.
export const AUTOMATISATIONS_EN_SERVICE = true;
// Compte dédié : « Utilisateur Cloud Datastore » sur le projet du CRM (écrire TES copies), « Accesseur de secrets » sur N8N_API_KEY, et SEULEMENT « Lecteur Cloud Datastore » sur le projet lié
// (champ projet_plateforme_lie de la fiche reglages_maison/maison : lecture de l'autre base, le compte ne peut pas y écrire, même par erreur).
const COMPTE_AUTOMATISATIONS = compteDeService('automatisations-serveur'); // adresse complète dans le projet courant (securite/maison.js)
const dbOs = () => { if (!getApps().length) initializeApp(); return getFirestore(); };
/**
 * Base du projet lié (la plateforme) : une 2e application nommée, mêmes identifiants du compte de service, en lecture seule (droits IAM).
 * Le projet est lu dans la fiche de la maison (projet_plateforme_lie) ; vide ou fiche illisible : null (la vue administrateur le dit, rien n'est lu ailleurs).
 */
const dbApp = async () => {
  if (!getApps().length) initializeApp();
  let projet = '';
  try { projet = await texteDe('projet_plateforme_lie'); } catch { projet = ''; }
  if (!projet) return null;
  const existante = getApps().find((a) => a.name === `plateforme-${projet}`);
  return getFirestore(existante ?? initializeApp({ projectId: projet }, `plateforme-${projet}`));
};

// `consoleVersions` (28/11/2026, Console phase 2) : lit la version tamponnée du CRM et de l'immeuble (console/versions.js). Jérôme seul, même contrôle d'identité que `consoleEtat`.
// Absente de la plateforme (RESERVEES_JEROME). Tourne avec le compte des automatisations, seul compte qui lit l'immeuble aujourd'hui ; à remplacer par un compte dédié en lecture seule plus tard.
const DEMARRAGE_INSTANCE = Date.now(); // heure de démarrage de cette instance : un CRM « en retard » tamponné avant elle attend son prochain tampon (moins d'une heure)
export const consoleVersions = onCall(
  { region: 'europe-west9', maxInstances: 2, memory: '256MiB', timeoutSeconds: 30, serviceAccount: COMPTE_AUTOMATISATIONS },
  (requete) => creerAppelConsoleVersions({
    lireVersions: () => lireVersionsBatiments({ dbOs, dbApp, reference: versionApplication(), demarrage: DEMARRAGE_INSTANCE }),
    journal: (e) => process.stdout.write(`${ligneDeJournalConsole(e)}\n`),
  })(requete),
);

// Base d'une maison du registre (projet Google à lire, `lecture_projet`) : une application nommée, mêmes identifiants du compte de service, réutilisée si elle existe déjà.
// La lecture n'aboutit que si Jérôme a donné au compte le droit de lecture sur ce projet ; sinon le relevé note « injoignable », sans erreur.
const ouvrirBaseMaison = (projet) => {
  if (!getApps().length) initializeApp();
  const nom = `plateforme-${projet}`;
  return getFirestore(getApps().find((a) => a.name === nom) ?? initializeApp({ projectId: projet }, nom));
};
const projetOuNull = () => { try { return projetCourant(); } catch { return null; } };
// Projet de l'immeuble lié (même champ que dbApp) : une maison du registre ne peut pas pointer vers lui (console/registre.js). Illisible : null.
const projetImmeubleOuNull = async () => { try { return (await texteDe('projet_plateforme_lie')) || null; } catch { return null; } };

// `consoleBatiments` (28/11/2026, Console phase 2, PR 2) : le registre privé (maisons), les appartements de l'immeuble et les relevés copiés chez Jérôme (console/batiments.js).
// Jérôme seul, même contrôle d'identité que `consoleEtat`. Absente de l'immeuble (RESERVEES_JEROME). Compte des automatisations, seul lecteur de l'immeuble aujourd'hui.
export const consoleBatiments = onCall(
  { region: 'europe-west9', maxInstances: 2, memory: '256MiB', timeoutSeconds: 30, serviceAccount: COMPTE_AUTOMATISATIONS },
  (requete) => creerAppelConsoleBatiments({
    lireBatiments: async () => lireBatimentsConsole({ dbOs, dbApp, projetCourant: projetOuNull(), projetImmeuble: await projetImmeubleOuNull() }),
    journal: (e) => process.stdout.write(`${ligneDeJournalConsole(e)}\n`),
  })(requete),
);

// `consoleReleve` (28/11/2026, Console phase 2, PR 2) : toutes les heures (au quart, après les tampons de l'heure pile), copie dans la base de Jérôme la version tamponnée
// du CRM, de l'immeuble et de chaque maison du registre (console/releve.js). N'écrit QUE dans la base de Jérôme ; jamais au chargement du module.
// Déployée aussi dans les maisons (même dossier) : sans immeuble relié, elle sort sans rien écrire. Absente de l'immeuble (RESERVEES_JEROME).
export const consoleReleve = onSchedule(
  { region: 'europe-west9', schedule: '15 * * * *', timeZone: 'Europe/Paris', timeoutSeconds: 120, memory: '256MiB', maxInstances: 1, serviceAccount: COMPTE_AUTOMATISATIONS },
  async () => {
    await releverBatiments({
      dbOs, dbApp, ouvrirBase: ouvrirBaseMaison, projetCourant: projetOuNull(), projetImmeuble: await projetImmeubleOuNull(), horodatage: () => FieldValue.serverTimestamp(),
      journal: (e) => process.stdout.write(`${ligneDeJournalReleve(e)}\n`),
    });
  },
);

const CLE_N8N = AUTOMATISATIONS_EN_SERVICE ? defineSecret('N8N_API_KEY') : null;
const lecteurN8n = () => creerLecteurN8n({ cle: CLE_N8N.value(), url: () => texteDe('n8n_url') }); // adresse du n8n : fiche de la maison

export const automatisationsInterneHoraire = AUTOMATISATIONS_EN_SERVICE ? onSchedule(
  { region: 'europe-west9', schedule: '0 * * * *', timeZone: 'Europe/Paris', secrets: [CLE_N8N], timeoutSeconds: 300, memory: '512MiB', maxInstances: 1, serviceAccount: COMPTE_AUTOMATISATIONS },
  async () => { await copieInterne({ db: dbOs(), dbPlateforme: await dbApp(), n8n: lecteurN8n() }); },
) : undefined;

export const automatisationsAdmin = AUTOMATISATIONS_EN_SERVICE ? onCall(
  { region: 'europe-west9', secrets: [CLE_N8N], timeoutSeconds: 120, memory: '256MiB', maxInstances: 3, serviceAccount: COMPTE_AUTOMATISATIONS },
  async (requete) => {
    try {
      return await administrateur({ db: dbOs(), dbPlateforme: await dbApp(), n8n: lecteurN8n, auth: requete.auth, donnees: requete.data });
    } catch (e) {
      if (e instanceof Refus) throw new HttpsError(e.code, e.message);
      process.stdout.write(`${JSON.stringify({ severity: 'ERROR', message: 'Journal : erreur inattendue (administrateur)', nom: e?.name })}\n`);
      throw new HttpsError('internal', 'Une erreur est survenue.');
    }
  },
) : undefined;
