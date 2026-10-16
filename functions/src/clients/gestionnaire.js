// Point d'entrée HTTP du MCP des clients : https://chevalier-ia-app.web.app/mcp/<client>.
// Même chaîne que le serveur de Jérôme (origine, méthode, jeton, plafonds, outils du profil, protocole MCP), avec en plus :
//  - le client vient de l'adresse, vérifié contre la connexion (un jeton d'un autre client est refusé comme un jeton inconnu) ;
//  - le profil vient du RÔLE du membre, relu à chaque appel (lecteur -> lecture seule ; éditeur -> + écriture ; jamais de suppression ni de restauration) ;
//  - les données vues par les outils sont celles de CE client seulement (avecBase : clients/<client>/…) ;
//  - les outils proposés sont ceux des modules ACTIFS du client (registre des modules) ; module « mcp » éteint = plus rien ne répond.
import { extraireBearer } from '../securite/jetons.js';
import { journaliser } from '../securite/journaux.js';
import { avecBase } from '../coeur/donnees.js';
import { OUTILS } from '../mcp/outils/index.js';
import { descriptionAppel, refuser, servirMcp } from '../mcp/gestionnaire.js';
import { FORMAT_CLIENT, ORIGINES_PLATEFORME, adressesClient } from './config.js';
import { MODULES_DECLARES, OUTILS_COMMUNS } from '../../partage/registre.js';
import { cheminBaseClient } from '../../partage/chemins.js';

const MOTIF_LIEN = /^\/mcp\/([^/]+)$/;

/** Outils proposés à un client : les outils communs et ceux des modules actifs (le profil du membre filtre ensuite). */
export function outilsDesModules(actifs, outils = OUTILS) {
  const noms = new Set([...OUTILS_COMMUNS, ...MODULES_DECLARES.filter((m) => actifs.includes(m.id)).flatMap((m) => m.outilsMcp)]);
  return outils.filter((o) => noms.has(o.nom));
}

/** `oauth` : creerRouteurOauthClients(). `limiteur` : plafonds par jeton (securite/limites.js, sur la base brute : clé « <client>__<acteur> »). */
export function creerGestionnaireClients({ donnees, oauth, limiteur = null, outils = OUTILS, journal = journaliser, maintenant = () => Date.now() }) {
  return async function gestionnaire(req, res) {
    const debut = maintenant();
    const infos = {};
    res.on('finish', () => journal({ ...infos, dureeMs: maintenant() - debut, statut: res.statusCode }));

    const origine = req.headers.origin;
    if (origine !== undefined && !ORIGINES_PLATEFORME.includes(origine)) { infos.code = 'origine'; return refuser(res, 403, 'origine_refusee'); }
    if (await oauth.traiter(req, res, infos)) return;
    const { pathname } = new URL(req.url || '/', 'http://local');
    const lien = MOTIF_LIEN.exec(pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname);
    // Lien inconnu ou mal formé (majuscules, caractères spéciaux, autre chemin) : même refus que pour n'importe quel jeton mauvais.
    if (!lien || !FORMAT_CLIENT.test(lien[1])) { infos.code = 'lien'; return refuser(res, 401, 'non_autorise', { 'WWW-Authenticate': 'Bearer' }); }
    const client = lien[1];
    infos.client = client;
    if (req.method !== 'POST') { infos.code = 'methode'; return refuser(res, 405, 'methode_refusee', { Allow: 'POST' }); }

    let jeton;
    try {
      jeton = await oauth.verifierAcces(extraireBearer(req.headers.authorization), client);
    } catch {
      infos.code = 'oauth_illisible';
      return refuser(res, 503, 'indisponible');
    }
    if (!jeton) {
      infos.code = 'jeton';
      return refuser(res, 401, 'non_autorise', { 'WWW-Authenticate': `Bearer resource_metadata="${adressesClient(client).metadonneesRessource}"` });
    }
    const proposes = outilsDesModules(jeton.actifs ?? [], outils);
    Object.assign(infos, { jeton: jeton.jeton, acteur: jeton.acteur, profil: jeton.profil, role: jeton.role }, descriptionAppel(req.body, proposes));
    return servirMcp({ req, res, infos, jeton, outils: proposes, donnees: avecBase(donnees, cheminBaseClient(client)), limiteur, maintenant });
  };
}
