// Point d'entrée HTTP du serveur MCP : origine, méthode, jeton, puis protocole MCP « Streamable HTTP » sans session
// (chaque appel est indépendant). Ne dépend d'aucun service Google : le magasin de jetons est injecté (testable).
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { extraireBearer, trouverJeton } from '../securite/jetons.js';
import { journaliser } from '../securite/journaux.js';
import { compterLectures } from '../securite/mesure.js';
import { ErreurLimite, limitesDuJeton } from '../securite/limites.js';
import { executerEcritures, ErreurEcriture } from '../coeur/ecriture.js';
import { restaurerOperation } from '../coeur/restaurer.js';
import { ESPACE_JEROME } from '../coeur/n8n-sortie.js';

/** Adresse du site de la maison (liens vers l'écran) : https://<projet>.web.app, calculée à la demande (chantier 0). */
export const baseLienMaison = () => adresseSite();
import { OUTILS, outilsAutorises, annotationsDe } from './outils/index.js';
import { varianteDuProfil } from './outils/variantes-assistant-devis.js';
import { VERSION_SERVEUR } from '../version.js';
import { originesAutorisees, urlMetadonneesRessource } from '../oauth/config.js';
import { estSuperAdminEmail } from '../securite/super-admins.js';
import { adresseSite } from '../securite/maison.js';
import { lireModulesEcran } from '../coeur/config.js';
import { outilsDeLaMaison } from './outils-maison.js';

// Les clients MCP (Hermes, Claude Code) n'envoient pas d'en-tête Origin. Un navigateur, si : on n'accepte que l'appli (origines calculées à partir du projet).
export const ORIGINES_AUTORISEES = originesAutorisees;

export const refuser = (res, statut, erreur, entetes = {}) => {
  res.writeHead(statut, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...entetes });
  res.end(JSON.stringify({ error: erreur }));
};

/** Nom de l'outil appelé, seulement s'il figure au registre (jamais une valeur fournie par le client). */
export function descriptionAppel(corps, outils) {
  const message = Array.isArray(corps) ? corps[0] : corps;
  const methodeMcp = typeof message?.method === 'string' && /^[a-z/_]{1,40}$/.test(message.method) ? message.method : undefined;
  const nom = message?.params?.name;
  const outil = methodeMcp === 'tools/call' ? (outils.some((o) => o.nom === nom) ? nom : 'inconnu') : undefined;
  return { methodeMcp, outil };
}

// Une instance Cloud Run = un processus : la première requête qu'il reçoit a payé le démarrage à froid. Cas « chaud » = champ absent.
/** Un suivi par gestionnaire : `noter(infos)` ajoute `froid` et `demarrageMs` (âge du processus) à la première requête seulement. Ne casse jamais l'appel. */
export function creerSuiviDemarrage() {
  let premiere = true;
  return (infos) => {
    if (!premiere) return;
    premiere = false;
    try { infos.froid = true; infos.demarrageMs = Math.round(process.uptime() * 1000); } catch { /* mesure seulement */ }
  };
}

/** Durée propre de l'outil et lectures, notées seulement pour un appel d'outil (tools/call). */
function noterOutil(infos, compteur, duree) {
  try { infos.dureeOutilMs = Math.round(duree); infos.lectures = compteur.lectures; } catch { /* mesure seulement */ }
}

/** Nom du serveur affiché par Claude et ChatGPT : celui de Jérôme ; les espaces clients en reçoivent un neutre (clients/gestionnaire.js). */
export const NOM_SERVEUR_CRM = 'chevalier-ia-os';

/** Documents supprimés par des opérations d'écriture : c'est l'unité des plafonds de suppression. */
export const compterSuppressions = (operations) => (operations ?? []).filter((op) => op.type === 'supprimer' || (op.type === 'remplacer' && !op.donnees)).length;

/** Une erreur d'écriture rendue au client : message clair, avec l'opération à retrouver dans lire_audit. */
function messageEcriture(e) {
  const op = e.details?.operationId;
  return op && !e.message.includes(op) ? `${e.message} (opération ${op})` : e.message;
}

/**
 * `limiteur` : plafonds par jeton (securite/limites.js). Sans limiteur, aucun plafond : seuls les tests l'omettent (un contrôle statique
 * vérifie que index.js en fournit un).
 * `oauth` (oauth/routeur.js) : seconde porte, la connexion Google de claude.ai et du téléphone ; sans lui, seuls les jetons « cia_… » entrent.
 * `stockage` : le stockage des fichiers déposés (stockage.js, ou fonction qui le rend) ; sans lui, les outils de dépôt répondent « stockage introuvable ».
 * `pilotage` : l'assistant du Tableau de bord (pilotage/assistant.js, ou fonction qui le rend, car il est défini après le serveur dans index.js) pour les outils lister_tableau_de_bord et lire_tableau_de_bord ; sans lui (espaces clients), ils répondent « pas branché ». Lecture seule, super admin seulement.
 * `sortieEmail` : la sortie vers n8n (coeur/n8n-sortie.js, ou fonction qui la rend) pour préparer un BROUILLON d'e-mail ; sans elle, l'outil répond « pas branché ». Rien n'envoie jamais l'e-mail.
 * `outilsAchats` (26/11/2026) : catalogue À PART des outils Achats (mcp/outils/achats.js), proposé seulement dans une maison dont reglages_maison/ecran liste `achatsfactures`
 *   (mcp/outils-maison.js) ; `achats` : le service qui parle à la base de la maison (base/assistant-achats.js, ou fonction qui le rend : il est défini après le serveur dans index.js),
 *   lu par `contexte.achats()` ; sans lui, les outils Achats répondent « pas branché ».
 * Tri par module (26/11/2026) : sans champ `modules` dans reglages_maison/ecran, `outils` est proposé tel quel (comportement d'avant) ; avec le champ, seulement les outils des modules listés.
 * Fiche illisible sans valeur connue : 503 (jamais « tous les outils » par défaut dans une maison qu'on n'a pas pu lire).
 */
/**
 * Une erreur d'outil dont le message est écrit par nous (classes maison `Erreur…`, erreurs d'écriture marquées `lisible`, `throw new Error('…')` simples
 * sans code technique) reste lisible par l'assistant. Les autres (Firestore, réseau, TypeError…) sont rendues générales.
 */
export function erreurLisible(e) {
  if (!(e instanceof Error)) return false;
  if (e.lisible === true || /^Erreur[A-Z]/.test(e.name)) return true;
  return e.name === 'Error' && e.code === undefined && e.errno === undefined && e.syscall === undefined;
}

export function creerGestionnaire({ magasin, donnees, limiteur = null, oauth = null, stockage = null, sortieEmail = null, pilotage = null, achats = null, baseLien = null, lienDepot = false, outils = OUTILS, outilsAchats = [], journal = journaliser, maintenant = () => Date.now() }) {
  const noterDemarrage = creerSuiviDemarrage();
  return async function gestionnaire(req, res) {
    const debut = maintenant();
    const infos = {};
    noterDemarrage(infos);
    res.on('finish', () => journal({ ...infos, dureeMs: maintenant() - debut, statut: res.statusCode }));

    const origine = req.headers.origin;
    if (origine !== undefined && !ORIGINES_AUTORISEES().includes(origine)) { infos.code = 'origine'; return refuser(res, 403, 'origine_refusee'); }
    if (oauth && await oauth.traiter(req, res, infos)) return; // routes OAuth (métadonnées, autorisation, jetons) : traitées à part
    if (req.method !== 'POST') { infos.code = 'methode'; return refuser(res, 405, 'methode_refusee', { Allow: 'POST' }); }

    let entrees;
    try {
      ({ entrees } = await magasin.entrees());
    } catch {
      infos.code = 'secret_illisible';
      return refuser(res, 503, 'indisponible');
    }
    const bearer = extraireBearer(req.headers.authorization);
    let jeton = trouverJeton(entrees, bearer);
    if (!jeton && oauth) {
      try {
        jeton = await oauth.verifierAcces(bearer);
      } catch {
        infos.code = 'oauth_illisible';
        return refuser(res, 503, 'indisponible');
      }
    }
    // 401 : même réponse pour tout refus ; l'en-tête dit à claude.ai où se connecter (RFC 9728).
    if (!jeton) { infos.code = 'jeton'; return refuser(res, 401, 'non_autorise', { 'WWW-Authenticate': oauth ? `Bearer resource_metadata="${urlMetadonneesRessource()}"` : 'Bearer' }); }
    // Outils de CETTE maison (modules de reglages_maison/ecran, cache de 60 s) : lus après l'authentification, jamais pour un appel refusé.
    const reglage = await lireModulesEcran(donnees);
    if (reglage.etat === 'indisponible') { infos.code = 'modules_illisibles'; return refuser(res, 503, 'indisponible'); }
    const outilsMaison = outilsDeLaMaison({ outils, outilsAchats, reglage });
    Object.assign(infos, { jeton: jeton.jeton, acteur: jeton.acteur, profil: jeton.profil }, descriptionAppel(req.body, outilsMaison));
    infos.dureeAuthMs = maintenant() - debut;

    return servirMcp({ req, res, infos, jeton, outils: outilsMaison, donnees, limiteur, maintenant, stockage, sortieEmail, pilotage, achats, baseLien, lienDepot });
  };
}

/**
 * Sert un appel MCP déjà authentifié : plafonds du jeton, outils permis par son profil, écritures journalisées, protocole « Streamable HTTP ».
 * Partagé par le serveur de Jérôme (creerGestionnaire) et par celui des clients (clients/gestionnaire.js). `jeton.jeton` est la clé des plafonds ;
 * `donnees` est ce que les outils voient (chez un client : l'espace du client seulement, voir avecBase) ; `outils` est déjà limité aux modules actifs.
 */
/**
 * Super admin (décision de Jérôme, 09/11/2026) : la CONNEXION porte l'e-mail vérifié d'un compte de SUPER_ADMINS (securite/super-admins.js, liste du serveur), sur le serveur de Jérôme comme dans l'espace d'un client.
 * Cet e-mail vient de l'identité Google vérifiée à la connexion OAuth (jamais d'une saisie ni d'une donnée du client) ; un jeton statique (agent-devis, assistant-devis, lecture, ecriture, claude-code) n'en a pas : refusé.
 * Le profil ne compte pas : un éditeur client ou un assistant OAuth d'un client a le profil `complet` sans être super admin.
 */
export const estSuperAdmin = async ({ jeton }, comptes) => estSuperAdminEmail(jeton?.email, comptes);

export async function servirMcp({ req, res, infos, jeton, outils, donnees, limiteur, maintenant, nomServeur = NOM_SERVEUR_CRM, stockage = null, sortieEmail = null, pilotage = null, achats = null, baseLien = null, lienDepot = false }) {
  baseLien ??= baseLienMaison(); // sans adresse donnée (serveur de Jérôme) : le site de la maison, calculé à partir du projet
  const limites = limitesDuJeton(jeton);
  // Mesure : lectures de base faites par CETTE requête (hors authentification et plafonds). Aucune erreur de mesure ne casse l'appel.
  const compteur = { lectures: 0 };
  let donneesComptees = donnees;
  try { donneesComptees = compterLectures(donnees, compteur); } catch { /* mesure seulement */ }
  try {
    limiteur?.requete(jeton.jeton, limites);
  } catch (e) {
    if (!(e instanceof ErreurLimite)) throw e;
    infos.code = 'limite_requetes';
    return refuser(res, 429, 'limite_depassee', { 'Retry-After': String(e.reessayerDansS) });
  }

  // Les outils marqués `reserveAuxSuperAdmins` n'existent (liste, qui_suis_je, exécution) que pour un super admin (identité vérifiée), quel que soit le profil.
  const superAdmin = await estSuperAdmin({ jeton });
  const permis = outilsAutorises(jeton.profil, outils).filter((o) => !o.reserveAuxSuperAdmins || superAdmin);
  const serveur = new McpServer({ name: nomServeur, version: VERSION_SERVEUR });
  // Contexte d'écriture de CET appel : acteur du jeton, canal « mcp », heure du serveur. Les plafonds d'écriture sont réservés ici, juste avant d'écrire.
  const ctxEcriture = { acteur: jeton.acteur, jeton: jeton.jeton, via: 'mcp', maintenant: new Date(maintenant()) };
  // `suppressions` : nombre de suppressions à compter dans le plafond du jour, quand il diffère de celui des opérations (un fichier mis en corbeille est une modification qui compte comme une suppression).
  const ecrire = async ({ operations, parametres, outil, suppressions }) => {
    await limiteur?.reserver(jeton.jeton, limites, { suppressions: suppressions ?? compterSuppressions(operations) });
    try {
      const r = await executerEcritures({ donnees: donneesComptees, ctx: ctxEcriture, outil, parametres, operations });
      if (r.operationId) infos.operationId = r.operationId;
      return r;
    } catch (e) {
      if (e instanceof ErreurEcriture) {
        if (e.details?.operationId) infos.operationId = e.details.operationId;
        infos.code = e.code;
        throw Object.assign(new Error(messageEcriture(e)), { lisible: true });
      }
      throw e;
    }
  };
  const restaurer = async ({ operationId, apercu, forcer, outil }) => {
    try {
      const r = await restaurerOperation({
        donnees: donneesComptees, ctx: ctxEcriture, operationId, apercu, forcer, outil, superAdmin,
        reserver: (operations) => limiteur?.reserver(jeton.jeton, limites, { suppressions: compterSuppressions(operations) }),
      });
      if (r.operationRestauration) infos.operationId = r.operationRestauration;
      return r;
    } catch (e) {
      if (e instanceof ErreurEcriture) { infos.code = e.code; throw Object.assign(new Error(messageEcriture(e)), { lisible: true }); }
      throw e;
    }
  };
  for (const outil of permis) {
    // Ce que le profil VOIT (description, schéma annoncé et validé) : la variante allégée pour assistant-devis, l'outil lui-même pour tous les autres. L'exécution reste celle de l'outil d'origine.
    const annonce = varianteDuProfil(outil, jeton.profil);
    serveur.registerTool(outil.nom, { description: annonce.description, annotations: annotationsDe(outil), ...(outil.meta ? { _meta: outil.meta } : {}), ...(annonce.schema ? { inputSchema: annonce.stricte ? z.strictObject(annonce.schema) : annonce.schema } : {}) }, async (argsRecus) => {
      // Variante à schéma souple : tout champ non annoncé est retiré avant l'exécution (comme le faisait le schéma d'origine).
      const args = annonce.champsAcceptes ? Object.fromEntries(Object.entries(argsRecus ?? {}).filter(([c]) => annonce.champsAcceptes.includes(c))) : argsRecus;
      const contexte = {
        acteur: jeton.acteur, email: jeton.email, profil: jeton.profil, superAdmin, actifs: jeton.actifs ?? null, jeton: jeton.jeton, outilsAutorises: permis.map((o) => o.nom), nomServeur, args, donnees: donneesComptees, maintenant: ctxEcriture.maintenant,
        ecrire: (demande) => ecrire({ ...demande, outil: outil.nom }),
        restaurer,
        // Stockage des fichiers (onglet « Documents ») : fonction qui rend le stockage, ou null s'il est introuvable. `espace` : '' chez Jérôme, 'clients/<client>/' chez un client.
        stockage: () => (typeof stockage === 'function' ? stockage() : stockage) ?? null,
        // Lien d'envoi temporaire (17/11/2026) : adresse de base de la page d'envoi, ou null là où le serveur n'en publie pas (les espaces clients, pour l'instant).
        lienDepot: lienDepot ? `${baseLien}/depot` : null,
        espace: donnees.base ? `${donnees.base}/` : '',
        // « Préparer le brouillon d'e-mail » (n8n, coeur/n8n-sortie.js) : fonction qui rend la sortie, ou null si elle n'est pas branchée. `espaceN8n` : 'interne' chez Jérôme, l'identifiant du client sinon (un workflow et des secrets par client).
        sortieEmail: () => (typeof sortieEmail === 'function' ? sortieEmail() : sortieEmail) ?? null,
        // Tableau de bord (Pilotage) : l'assistant qui lit le service de l'écran, ou null là où il n'est pas branché (les espaces clients). Réservé aux super admins par les outils eux-mêmes.
        pilotage: () => (typeof pilotage === 'function' ? pilotage() : pilotage) ?? null,
        // Achats d'une maison (base de la maison, par la bibliothèque de la porte) : le service, ou null là où il n'est pas branché (chez Jérôme sans réglage, les espaces clients).
        achats: () => (typeof achats === 'function' ? achats() : achats) ?? null,
        baseLien, // adresse de l'application (liens rendus à l'assistant : jamais de secret, jamais de lien signé)
        espaceN8n: donnees.base ? donnees.base.split('/')[1] : ESPACE_JEROME,
        noterOperation: (operationId) => { if (operationId) infos.operationId = operationId; },
        reserverEcriture: (suppressions = 0) => limiteur?.reserver(jeton.jeton, limites, { suppressions }),
        suppressionsRestantes: () => (limiteur ? limiteur.suppressionsRestantes(jeton.jeton, limites) : Infinity),
      };
      let resultat;
      const debutOutil = maintenant();
      try {
        resultat = await outil.executer(contexte);
        noterOutil(infos, compteur, maintenant() - debutOutil);
      } catch (e) {
        noterOutil(infos, compteur, maintenant() - debutOutil);
        if (e instanceof ErreurLimite) infos.code = e.limite;
        else if (e?.name === 'ErreurMetier') infos.code = e.code;
        if (erreurLisible(e)) throw e;
        // Erreur interne (Firestore, réseau, bug) : le détail va dans le journal du serveur, l'assistant ne reçoit qu'un message général.
        const heure = new Date(maintenant()).toISOString();
        infos.code ??= 'erreur_outil';
        process.stderr.write(`${JSON.stringify({ severity: 'ERROR', action: 'outil_erreur', outil: outil.nom, nom: String(e?.name ?? typeof e).slice(0, 80), code: e?.code === undefined ? undefined : String(e.code).slice(0, 80), message: String(e?.message ?? e).slice(0, 300) })}\n`);
        throw new Error(`Erreur interne pendant « ${outil.nom} » (${heure}). Réessaie dans un instant ; si cela continue, préviens l'administrateur.`);
      }
      return { content: [{ type: 'text', text: JSON.stringify(resultat) }], structuredContent: resultat };
    });
  }
  const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
  res.on('close', () => { transport.close(); serveur.close(); });
  try {
    await serveur.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch {
    infos.code = 'erreur_interne';
    if (!res.headersSent) refuser(res, 500, 'erreur_interne');
  }
}
