// Point d'entrée HTTP du serveur MCP : origine, méthode, jeton, puis protocole MCP « Streamable HTTP » sans session
// (chaque appel est indépendant). Ne dépend d'aucun service Google : le magasin de jetons est injecté (testable).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { extraireBearer, trouverJeton } from '../securite/jetons.js';
import { journaliser } from '../securite/journaux.js';
import { ErreurLimite, limitesDuJeton } from '../securite/limites.js';
import { executerEcritures, ErreurEcriture } from '../coeur/ecriture.js';
import { restaurerOperation } from '../coeur/restaurer.js';
import { OUTILS, outilsAutorises } from './outils/index.js';
import { VERSION_SERVEUR } from '../version.js';
import { ORIGINES_AUTORISEES as ORIGINES, URL_METADONNEES_RESSOURCE } from '../oauth/config.js';

// Les clients MCP (Hermes, Claude Code) n'envoient pas d'en-tête Origin. Un navigateur, si : on n'accepte que l'appli.
export const ORIGINES_AUTORISEES = ORIGINES;

const refuser = (res, statut, erreur, entetes = {}) => {
  res.writeHead(statut, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store', ...entetes });
  res.end(JSON.stringify({ error: erreur }));
};

/** Nom de l'outil appelé, seulement s'il figure au registre (jamais une valeur fournie par le client). */
function descriptionAppel(corps, outils) {
  const message = Array.isArray(corps) ? corps[0] : corps;
  const methodeMcp = typeof message?.method === 'string' && /^[a-z/_]{1,40}$/.test(message.method) ? message.method : undefined;
  const nom = message?.params?.name;
  const outil = methodeMcp === 'tools/call' ? (outils.some((o) => o.nom === nom) ? nom : 'inconnu') : undefined;
  return { methodeMcp, outil };
}

/** Une erreur d'écriture rendue au client : message clair, avec l'opération à retrouver dans lire_audit. */
function messageEcriture(e) {
  const op = e.details?.operationId;
  return op && !e.message.includes(op) ? `${e.message} (opération ${op})` : e.message;
}

/**
 * `limiteur` : plafonds par jeton (securite/limites.js). Sans limiteur, aucun plafond : seuls les tests l'omettent (un contrôle statique
 * vérifie que index.js en fournit un).
 * `oauth` (oauth/routeur.js) : seconde porte, la connexion Google de claude.ai et du téléphone ; sans lui, seuls les jetons « cia_… » entrent.
 */
export function creerGestionnaire({ magasin, donnees, limiteur = null, oauth = null, outils = OUTILS, journal = journaliser, maintenant = () => Date.now() }) {
  return async function gestionnaire(req, res) {
    const debut = maintenant();
    const infos = {};
    res.on('finish', () => journal({ ...infos, dureeMs: maintenant() - debut, statut: res.statusCode }));

    const origine = req.headers.origin;
    if (origine !== undefined && !ORIGINES_AUTORISEES.includes(origine)) { infos.code = 'origine'; return refuser(res, 403, 'origine_refusee'); }
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
    if (!jeton) { infos.code = 'jeton'; return refuser(res, 401, 'non_autorise', { 'WWW-Authenticate': oauth ? `Bearer resource_metadata="${URL_METADONNEES_RESSOURCE}"` : 'Bearer' }); }
    Object.assign(infos, { jeton: jeton.jeton, acteur: jeton.acteur, profil: jeton.profil }, descriptionAppel(req.body, outils));

    const limites = limitesDuJeton(jeton);
    try {
      limiteur?.requete(jeton.jeton, limites);
    } catch (e) {
      if (!(e instanceof ErreurLimite)) throw e;
      infos.code = 'limite_requetes';
      return refuser(res, 429, 'limite_depassee', { 'Retry-After': String(e.reessayerDansS) });
    }

    const permis = outilsAutorises(jeton.profil, outils);
    const serveur = new McpServer({ name: 'chevalier-ia-os', version: VERSION_SERVEUR });
    // Contexte d'écriture de CET appel : acteur du jeton, canal « mcp », heure du serveur. Les plafonds d'écriture sont réservés ici, juste avant d'écrire.
    const ctxEcriture = { acteur: jeton.acteur, jeton: jeton.jeton, via: 'mcp', maintenant: new Date(maintenant()) };
    const ecrire = async ({ operations, parametres, suppression = false, outil }) => {
      await limiteur?.reserver(jeton.jeton, limites, { suppression });
      try {
        const r = await executerEcritures({ donnees, ctx: ctxEcriture, outil, parametres, operations });
        if (r.operationId) infos.operationId = r.operationId;
        return r;
      } catch (e) {
        if (e instanceof ErreurEcriture) {
          if (e.details?.operationId) infos.operationId = e.details.operationId;
          infos.code = e.code;
          throw new Error(messageEcriture(e));
        }
        throw e;
      }
    };
    const restaurer = async ({ operationId, apercu, forcer }) => {
      if (!apercu) await limiteur?.reserver(jeton.jeton, limites, { suppression: false });
      try {
        const r = await restaurerOperation({ donnees, ctx: ctxEcriture, operationId, apercu, forcer });
        if (r.operationRestauration) infos.operationId = r.operationRestauration;
        return r;
      } catch (e) {
        if (e instanceof ErreurEcriture) { infos.code = e.code; throw new Error(messageEcriture(e)); }
        throw e;
      }
    };
    for (const outil of permis) {
      serveur.registerTool(outil.nom, { description: outil.description, ...(outil.schema ? { inputSchema: outil.schema } : {}) }, async (args) => {
        const contexte = {
          acteur: jeton.acteur, profil: jeton.profil, jeton: jeton.jeton, outilsAutorises: permis.map((o) => o.nom), args, donnees, maintenant: ctxEcriture.maintenant,
          ecrire: (demande) => ecrire({ ...demande, outil: outil.nom }),
          restaurer,
        };
        let resultat;
        try {
          resultat = await outil.executer(contexte);
        } catch (e) {
          if (e instanceof ErreurLimite) infos.code = e.limite;
          else if (e?.name === 'ErreurMetier') infos.code = e.code;
          throw e;
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
  };
}
