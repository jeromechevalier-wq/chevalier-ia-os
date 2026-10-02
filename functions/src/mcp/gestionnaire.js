// Point d'entrée HTTP du serveur MCP : origine, méthode, jeton, puis protocole MCP « Streamable HTTP » sans session
// (chaque appel est indépendant). Ne dépend d'aucun service Google : le magasin de jetons est injecté (testable).
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { extraireBearer, trouverJeton } from '../securite/jetons.js';
import { journaliser } from '../securite/journaux.js';
import { OUTILS, outilsAutorises } from './outils/index.js';

// Les clients MCP (Hermes, Claude Code) n'envoient pas d'en-tête Origin. Un navigateur, si : on n'accepte que l'appli.
export const ORIGINES_AUTORISEES = ['https://chevalier-ia-os.web.app', 'https://chevalier-ia-os.firebaseapp.com'];

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

export function creerGestionnaire({ magasin, outils = OUTILS, journal = journaliser, maintenant = () => Date.now() }) {
  return async function gestionnaire(req, res) {
    const debut = maintenant();
    const infos = {};
    res.on('finish', () => journal({ ...infos, dureeMs: maintenant() - debut, statut: res.statusCode }));

    const origine = req.headers.origin;
    if (origine !== undefined && !ORIGINES_AUTORISEES.includes(origine)) { infos.code = 'origine'; return refuser(res, 403, 'origine_refusee'); }
    if (req.method !== 'POST') { infos.code = 'methode'; return refuser(res, 405, 'methode_refusee', { Allow: 'POST' }); }

    let entrees;
    try {
      ({ entrees } = await magasin.entrees());
    } catch {
      infos.code = 'secret_illisible';
      return refuser(res, 503, 'indisponible');
    }
    const jeton = trouverJeton(entrees, extraireBearer(req.headers.authorization));
    if (!jeton) { infos.code = 'jeton'; return refuser(res, 401, 'non_autorise', { 'WWW-Authenticate': 'Bearer' }); }
    Object.assign(infos, { jeton: jeton.jeton, acteur: jeton.acteur, profil: jeton.profil }, descriptionAppel(req.body, outils));

    const permis = outilsAutorises(jeton.profil, outils);
    const serveur = new McpServer({ name: 'chevalier-ia-os', version: '0.1.0' });
    for (const outil of permis) {
      serveur.registerTool(outil.nom, { description: outil.description, ...(outil.schema ? { inputSchema: outil.schema } : {}) }, async (args) => {
        const resultat = await outil.executer({ acteur: jeton.acteur, profil: jeton.profil, jeton: jeton.jeton, outilsAutorises: permis.map((o) => o.nom), args });
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
