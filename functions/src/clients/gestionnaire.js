// Point d'entrée HTTP du MCP des clients : https://chevalier-ia-app.web.app/mcp/<client>.
// Même chaîne que le serveur de Jérôme (origine, méthode, jeton, plafonds, outils du profil, protocole MCP), avec en plus :
//  - le client vient de l'adresse, vérifié contre la connexion (un jeton d'un autre client est refusé comme un jeton inconnu) ;
//  - le profil vient du RÔLE du membre, relu à chaque appel (lecteur -> lecture seule ; éditeur -> + écriture, suppression et restauration) ;
//  - les données vues par les outils sont celles de CE client seulement (avecBase : clients/<client>/…) ;
//  - les outils proposés sont ceux des modules ACTIFS du client (registre des modules) ; module « mcp » éteint = plus rien ne répond ;
//  - les outils de factures n'existent que si l'option du client est allumée (OUTILS_PAR_OPTION), relue à chaque appel.
import { extraireBearer } from '../securite/jetons.js';
import { journaliser } from '../securite/journaux.js';
import { avecBase } from '../coeur/donnees.js';
import { lireConfig } from '../coeur/config.js';
import { OUTILS } from '../mcp/outils/index.js';
import { descriptionAppel, refuser, servirMcp } from '../mcp/gestionnaire.js';
import { FORMAT_CLIENT, ORIGINES_PLATEFORME, adressesClient } from './config.js';
import { MODULES_DECLARES, OUTILS_COMMUNS } from '../../partage/registre.js';
import { cheminBaseClient } from '../../partage/chemins.js';

/** Nom de serveur neutre : le client ne voit pas le nom interne du CRM de Jérôme. */
export const NOM_SERVEUR_CLIENT = 'espace-client';
const MOTIF_LIEN = /^\/mcp\/([^/]+)$/;

/** Outils proposés à un client : les outils communs et ceux des modules actifs (le profil du membre filtre ensuite). */
export function outilsDesModules(actifs, outils = OUTILS) {
  const noms = new Set([...OUTILS_COMMUNS, ...MODULES_DECLARES.filter((m) => actifs.includes(m.id)).flatMap((m) => m.outilsMcp)]);
  return outils.filter((o) => noms.has(o.nom));
}

/** Options de l'espace (réglages du CRM du client) -> outils qui n'existent que si l'option est allumée. Le serveur de Jérôme n'y passe pas. */
export const OUTILS_PAR_OPTION = Object.freeze({
  suiviPaiements: Object.freeze(['ajouter_facture', 'marquer_facture_payee', 'abandonner_facture']),
});

/** Retire les outils dont l'option est éteinte. `options` : configuration.options de l'espace (valeurs neutres si rien n'est réglé). */
export function outilsSelonOptions(outils, options) {
  const retires = new Set(Object.entries(OUTILS_PAR_OPTION).filter(([option]) => options?.[option] !== true).flatMap(([, noms]) => noms));
  return outils.filter((o) => !retires.has(o.nom));
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
    const donneesClient = avecBase(donnees, cheminBaseClient(client));
    // Options de l'espace relues à chaque appel (pas de cache) : une option éteinte retire ses outils de la liste, de qui_suis_je, du journal et de l'exécution.
    let options;
    try {
      options = (await lireConfig(donneesClient, { racine: false })).options;
    } catch {
      infos.code = 'reglages_illisibles';
      return refuser(res, 503, 'indisponible');
    }
    const proposes = outilsSelonOptions(outilsDesModules(jeton.actifs ?? [], outils), options);
    Object.assign(infos, { jeton: jeton.jeton, acteur: jeton.acteur, profil: jeton.profil, role: jeton.role }, descriptionAppel(req.body, proposes));
    return servirMcp({ req, res, infos, jeton, outils: proposes, donnees: donneesClient, limiteur, maintenant, nomServeur: NOM_SERVEUR_CLIENT });
  };
}
