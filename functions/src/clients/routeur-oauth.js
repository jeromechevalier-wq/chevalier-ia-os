// Routes OAuth du MCP des clients. Même protocole que le serveur de Jérôme (oauth/routeur.js : PKCE S256, code à usage unique, jetons à empreinte,
// renouvellement avec rotation), mais CHAQUE CLIENT A SES PROPRES ADRESSES : le client est dans le chemin, jamais dans un paramètre.
//   GET  /.well-known/oauth-protected-resource/mcp/<client>    à qui s'adresser pour se connecter (identique pour tout identifiant bien formé : ne dit rien du client)
//   GET  /.well-known/oauth-authorization-server/mcp/<client>  adresses des routes ci-dessous (« serveur d'autorisation » propre au client)
//   POST /oauth/<client>/register                              enregistrement de l'assistant (sans stockage)
//   GET  /oauth/<client>/authorize                             connexion Google + consentement, aux couleurs du client
//   POST /oauth/<client>/approve                               appelé par cette page, avec le jeton d'identité Google
//   POST /oauth/<client>/token                                 échange du code, renouvellement
// Refus neutre : client inconnu, désactivé, module « mcp » éteint, compte d'un autre espace -> mêmes réponses (aucun détail sur ce qui existe).
import { randomBytes } from 'node:crypto';
import { ErreurOauth, creerMagasinOauth } from '../oauth/magasin.js';
import { ENTETES_PAGE, pageErreur } from '../oauth/page.js';
import { adresseRetour, creerFenetre, objet, repondre, texte, validerDemande } from '../oauth/routeur.js';
import {
  FORMAT_CLIENT, ORIGINES_PLATEFORME, EMETTEUR_PLATEFORME, PROFIL_PAR_ROLE, acteurClient, adressesClient, assistantDeRedirection, redirectionAutorisee,
} from './config.js';
import { pageAutorisationClient } from './page.js';
import { MESSAGE_REFUS_ESPACE } from '../../partage/marque.js';

const OPTIONS_DEMANDE = Object.freeze({ redirectionAutorisee, origine: EMETTEUR_PLATEFORME, messageRedirection: "Adresse de retour non autorisée : seuls Claude et ChatGPT peuvent se connecter." });
const MESSAGE_INDISPONIBLE = "Ce lien de connexion n'est pas disponible.";
const motifs = [
  [/^\/\.well-known\/oauth-protected-resource\/mcp\/([^/]+)$/, 'ressource'],
  [/^\/\.well-known\/oauth-authorization-server\/mcp\/([^/]+)$/, 'serveur'],
  [/^\/oauth\/([^/]+)\/(authorize|approve|token|register)$/, 'oauth'],
];

/**
 * `verifierIdToken(jeton)` : { email, emailVerifie, fournisseur } ou lève ; `espaces` : creerEspaces() ; les deux sont injectés (testables).
 * `traiter(req, res, infos)` rend true si la requête était une route OAuth (réponse envoyée), false sinon.
 * `verifierAcces(bearer, client)` : { jeton, acteur, profil, client, role, actifs, actif } si le jeton d'accès est valable POUR CE CLIENT, sinon null.
 */
export function creerRouteurOauthClients({ donnees, verifierIdToken, espaces, maintenant = () => Date.now(), limitePostParMinute = 60, horlogeLimite = () => Date.now() }) {
  const autoriseEcriture = creerFenetre({ max: limitePostParMinute, ms: 60_000, maintenant: horlogeLimite });

  /** Qui a le droit d'ouvrir une connexion à ce client, et avec quel profil : relu à chaque échange, renouvellement et appel. */
  const controle = (client) => async (email, connexion) => {
    const espace = await espaces.charger(client);
    if (!espace) return null;
    const membre = await espaces.membre(client, email);
    if (!membre) return null;
    const assistant = connexion?.assistant === 'chatgpt' ? 'chatgpt' : 'claude-ai';
    const acteur = acteurClient(assistant, email);
    return { jeton: `${client}__${acteur}`, acteur, email: String(email).toLowerCase(), profil: PROFIL_PAR_ROLE[membre.role], client, role: membre.role, actifs: espace.actifs };
  };
  const magasinDe = (client) => creerMagasinOauth({ donnees, maintenant, client, controleCompte: controle(client) });

  async function approuver(client, req, res, infos) {
    const origine = req.headers.origin;
    if (!ORIGINES_PLATEFORME.includes(origine)) { infos.code = 'oauth_origine'; return repondre(res, 403, { error: 'origine_refusee' }); }
    const corps = objet(req.body);
    const { demande, erreur } = validerDemande({ ...corps, response_type: 'code', code_challenge_method: 'S256' }, OPTIONS_DEMANDE);
    if (!demande) { infos.code = 'oauth_demande'; return repondre(res, 400, { error: 'invalid_request', message: erreur }); }
    if (corps.decision === 'deny') { infos.code = 'oauth_refus'; return repondre(res, 200, { redirect: adresseRetour(demande, { error: 'access_denied' }) }); }
    if (corps.decision !== 'allow') { infos.code = 'oauth_demande'; return repondre(res, 400, { error: 'invalid_request' }); }
    let identite;
    try {
      identite = await verifierIdToken(texte(corps.id_token) ?? '');
    } catch {
      infos.code = 'oauth_identite';
      return repondre(res, 401, { error: 'identite_refusee', message: 'Connexion Google non reconnue. Reconnecte-toi.' });
    }
    // Un seul refus pour tout : compte non vérifié, pas Google, client inconnu ou désactivé, module éteint, compte d'un autre espace.
    const email = typeof identite?.email === 'string' ? identite.email.toLowerCase() : '';
    const permis = identite?.emailVerifie === true && identite.fournisseur === 'google.com' && email && (await controle(client)(email, null));
    if (!permis) {
      infos.code = 'oauth_compte_refuse';
      return repondre(res, 403, { error: 'compte_non_autorise', message: MESSAGE_REFUS_ESPACE });
    }
    const code = await magasinDe(client).creerCode({ email, clientId: demande.client_id, redirectUri: demande.redirect_uri, challenge: demande.code_challenge, assistant: assistantDeRedirection(demande.redirect_uri).code });
    infos.code = 'oauth_autorise';
    return repondre(res, 200, { redirect: adresseRetour(demande, { code }) });
  }

  async function jetons(client, req, res, infos) {
    const p = objet(req.body);
    const magasin = magasinDe(client);
    try {
      let r;
      if (p.grant_type === 'authorization_code') {
        r = await magasin.echangerCode({ code: texte(p.code), clientId: texte(p.client_id), redirectUri: texte(p.redirect_uri), verifier: texte(p.code_verifier) });
        infos.code = 'oauth_jeton_emis';
      } else if (p.grant_type === 'refresh_token') {
        r = await magasin.rafraichir({ refreshToken: texte(p.refresh_token), clientId: texte(p.client_id) });
        infos.code = 'oauth_jeton_renouvele';
      } else {
        throw new ErreurOauth('unsupported_grant_type', 'Type de demande non pris en charge.');
      }
      return repondre(res, 200, r);
    } catch (e) {
      if (e instanceof ErreurOauth) { infos.code = `oauth_${e.code}`; return repondre(res, 400, { error: e.code, error_description: e.message }); }
      infos.code = 'oauth_erreur_interne';
      return repondre(res, 500, { error: 'server_error' });
    }
  }

  function enregistrer(client, req, res, infos) {
    const p = objet(req.body);
    const uris = Array.isArray(p.redirect_uris) ? p.redirect_uris : [];
    if (!uris.length || uris.length > 5 || !uris.every(redirectionAutorisee)) {
      infos.code = 'oauth_enregistrement_refuse';
      return repondre(res, 400, { error: 'invalid_redirect_uri', error_description: 'Adresse de retour non autorisée.' });
    }
    if (p.token_endpoint_auth_method !== undefined && p.token_endpoint_auth_method !== 'none') {
      infos.code = 'oauth_enregistrement_refuse';
      return repondre(res, 400, { error: 'invalid_client_metadata', error_description: 'Seul « none » (client public avec PKCE) est accepté.' });
    }
    infos.code = 'oauth_enregistre';
    return repondre(res, 201, {
      client_id: `cli_${randomBytes(18).toString('base64url')}`,
      client_id_issued_at: Math.floor(maintenant() / 1000),
      redirect_uris: uris,
      grant_types: ['authorization_code', 'refresh_token'],
      response_types: ['code'],
      token_endpoint_auth_method: 'none',
      ...(texte(p.client_name) ? { client_name: p.client_name.slice(0, 80) } : {}),
    });
  }

  async function page(client, req, res, infos) {
    const { demande, erreur } = validerDemande(Object.fromEntries(new URL(req.url || '/', 'http://local').searchParams), OPTIONS_DEMANDE);
    const espace = demande ? await espaces.charger(client) : null;
    infos.code = espace ? 'oauth_page' : 'oauth_demande';
    res.writeHead(espace ? 200 : 400, ENTETES_PAGE);
    res.end(espace ? pageAutorisationClient(demande, espace) : pageErreur(demande ? MESSAGE_INDISPONIBLE : erreur));
  }

  return {
    verifierAcces: (bearer, client) => magasinDe(client).verifierAcces(bearer),
    async traiter(req, res, infos = {}) {
      const { pathname } = new URL(req.url || '/', 'http://local');
      const chemin = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
      let trouve = null;
      for (const [motif, genre] of motifs) {
        const m = motif.exec(chemin);
        if (m) { trouve = { genre, client: m[1], action: m[2] }; break; }
      }
      if (!trouve) return false;
      const { genre, client, action } = trouve;
      const bien = (...methodes) => {
        if (methodes.includes(req.method)) return true;
        infos.code = 'oauth_methode';
        repondre(res, 405, { error: 'methode_refusee' }, { Allow: methodes.join(', ') });
        return false;
      };
      if (!FORMAT_CLIENT.test(client)) { infos.code = 'oauth_inconnu'; repondre(res, 404, { error: 'introuvable' }); return true; }
      infos.client = client;
      const adresses = adressesClient(client);
      if (genre === 'ressource') {
        if (bien('GET')) {
          infos.code = 'oauth_metadonnees';
          repondre(res, 200, { resource: adresses.ressource, authorization_servers: [adresses.emetteur], bearer_methods_supported: ['header'] });
        }
        return true;
      }
      if (genre === 'serveur') {
        if (bien('GET')) {
          infos.code = 'oauth_metadonnees';
          repondre(res, 200, {
            issuer: adresses.emetteur,
            authorization_endpoint: adresses.autoriser,
            token_endpoint: adresses.jeton,
            registration_endpoint: adresses.enregistrer,
            response_types_supported: ['code'],
            response_modes_supported: ['query'],
            grant_types_supported: ['authorization_code', 'refresh_token'],
            code_challenge_methods_supported: ['S256'],
            token_endpoint_auth_methods_supported: ['none'],
            scopes_supported: ['offline_access'],
          });
        }
        return true;
      }
      try {
        if (action === 'authorize') {
          if (bien('GET')) await page(client, req, res, infos);
          return true;
        }
        if (!bien('POST')) return true;
        if (!autoriseEcriture()) { infos.code = 'oauth_limite'; repondre(res, 429, { error: 'temporarily_unavailable' }, { 'Retry-After': '30' }); return true; }
        await { register: enregistrer, approve: approuver, token: jetons }[action](client, req, res, infos);
      } catch {
        infos.code = 'oauth_erreur_interne';
        if (!res.headersSent) repondre(res, 500, { error: 'server_error' });
      }
      return true;
    },
  };
}
