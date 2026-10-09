// Routes OAuth du serveur MCP (RFC 9728, 8414, 7591, 6749 + PKCE) : métadonnées, enregistrement du client, autorisation, jetons.
//   GET  /.well-known/oauth-protected-resource[/mcp]   à qui s'adresser pour se connecter
//   GET  /.well-known/oauth-authorization-server       adresses des routes ci-dessous
//   POST /oauth/register                               enregistrement du client (sans stockage : voir plus bas)
//   GET  /oauth/authorize                              page de connexion Google + consentement
//   POST /oauth/approve                                appelé par cette page, avec le jeton d'identité Google
//   POST /oauth/token                                  échange du code, renouvellement
// Sécurité du client : le `client_id` n'est pas un secret et n'est PAS stocké. La protection repose sur : adresse de retour exactement dans
// la liste (claude.ai / claude.com), PKCE S256 obligatoire, compte Google autorisé revérifié côté serveur, consentement explicite.
import { randomBytes } from 'node:crypto';
import { EMETTEUR, ORIGINES_AUTORISEES, REDIRECTIONS_AUTORISEES, RESSOURCE } from './config.js';
import { ErreurOauth, compteAutorise, creerMagasinOauth } from './magasin.js';
import { ENTETES_PAGE, pageAutorisation, pageErreur } from './page.js';

const ENTETES_JSON = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Pragma: 'no-cache', 'X-Content-Type-Options': 'nosniff' };
const repondre = (res, statut, corps, entetes = {}) => { res.writeHead(statut, { ...ENTETES_JSON, ...entetes }); res.end(JSON.stringify(corps)); };

export const METADONNEES_RESSOURCE = Object.freeze({
  resource: RESSOURCE,
  authorization_servers: [EMETTEUR],
  bearer_methods_supported: ['header'],
});
export const METADONNEES_SERVEUR = Object.freeze({
  issuer: EMETTEUR,
  authorization_endpoint: `${EMETTEUR}/oauth/authorize`,
  token_endpoint: `${EMETTEUR}/oauth/token`,
  registration_endpoint: `${EMETTEUR}/oauth/register`,
  response_types_supported: ['code'],
  response_modes_supported: ['query'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['none'],
  scopes_supported: ['offline_access'],
});

const FORMAT_CLIENT = /^[A-Za-z0-9._:/-]{1,200}$/;
const FORMAT_CHALLENGE = /^[A-Za-z0-9_-]{43,128}$/;
const sameOrigin = (u) => { try { return new URL(u).origin === EMETTEUR; } catch { return false; } };
const objet = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : {});
const texte = (x) => (typeof x === 'string' ? x : undefined);

/** Valide une demande d'autorisation. Renvoie { demande } ou { erreur } (message pour la page, jamais de détail interne). */
export function validerDemande(p) {
  const q = objet(p);
  if (q.response_type !== 'code') return { erreur: 'Type de réponse non pris en charge.' };
  if (!texte(q.client_id) || !FORMAT_CLIENT.test(q.client_id)) return { erreur: 'Client inconnu.' };
  if (!REDIRECTIONS_AUTORISEES.includes(q.redirect_uri)) return { erreur: "Adresse de retour non autorisée : seule l'application Claude peut se connecter." };
  if (q.code_challenge_method !== 'S256' || !texte(q.code_challenge) || !FORMAT_CHALLENGE.test(q.code_challenge)) return { erreur: 'Protection PKCE (S256) obligatoire.' };
  if (q.state !== undefined && (!texte(q.state) || q.state.length > 512)) return { erreur: 'Paramètre « state » invalide.' };
  // `resource` (RFC 8707) : tolérant sur le détail (barre finale), strict sur le site ; il n'y a qu'un seul serveur, le jeton n'en dépend pas.
  if (q.resource !== undefined && !(texte(q.resource) && sameOrigin(q.resource))) return { erreur: 'Ressource inconnue.' };
  return { demande: { client_id: q.client_id, redirect_uri: q.redirect_uri, code_challenge: q.code_challenge, ...(q.state !== undefined ? { state: q.state } : {}), ...(q.resource !== undefined ? { resource: q.resource } : {}) } };
}

const adresseRetour = (demande, params) => {
  const u = new URL(demande.redirect_uri);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  if (demande.state !== undefined) u.searchParams.set('state', demande.state);
  return u.toString();
};

/** Compteur à fenêtre fixe, en mémoire de l'instance : frein grossier contre le martelage des routes qui lisent Firestore. */
function creerFenetre({ max, ms, maintenant }) {
  let debut = 0;
  let n = 0;
  return () => {
    const t = maintenant();
    if (t - debut >= ms) { debut = t; n = 0; }
    n += 1;
    return n <= max;
  };
}

/**
 * `verifierIdToken(jeton)` : { email, emailVerifie, fournisseur } ou lève (jeton d'identité Google invalide) ; injecté (testable).
 * `traiter(req, res, infos)` rend true si la requête était une route OAuth (réponse envoyée), false sinon.
 */
export function creerRouteurOauth({ donnees, verifierIdToken, maintenant = () => Date.now(), limitePostParMinute = 60, horlogeLimite = () => Date.now() }) {
  const magasin = creerMagasinOauth({ donnees, maintenant });
  const autoriseEcriture = creerFenetre({ max: limitePostParMinute, ms: 60_000, maintenant: horlogeLimite });

  async function approuver(req, res, infos) {
    const origine = req.headers.origin;
    if (!ORIGINES_AUTORISEES.includes(origine)) { infos.code = 'oauth_origine'; return repondre(res, 403, { error: 'origine_refusee' }); }
    const corps = objet(req.body);
    // La page n'envoie que la demande déjà validée (sans response_type ni méthode) : S256 est la seule méthode que le serveur accepte et vérifie au jeton.
    const { demande, erreur } = validerDemande({ ...corps, response_type: 'code', code_challenge_method: 'S256' });
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
    if (!identite?.emailVerifie || identite.fournisseur !== 'google.com' || !compteAutorise(identite.email)) {
      infos.code = 'oauth_compte_refuse';
      return repondre(res, 403, { error: 'compte_non_autorise', message: "Ce compte Google n'est pas autorisé." });
    }
    const code = await magasin.creerCode({ email: identite.email.toLowerCase(), clientId: demande.client_id, redirectUri: demande.redirect_uri, challenge: demande.code_challenge });
    infos.code = 'oauth_autorise';
    return repondre(res, 200, { redirect: adresseRetour(demande, { code }) });
  }

  async function jetons(req, res, infos) {
    const p = objet(req.body);
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

  function enregistrer(req, res, infos) {
    const p = objet(req.body);
    const uris = Array.isArray(p.redirect_uris) ? p.redirect_uris : [];
    if (!uris.length || uris.length > 5 || !uris.every((u) => REDIRECTIONS_AUTORISEES.includes(u))) {
      infos.code = 'oauth_enregistrement_refuse';
      return repondre(res, 400, { error: 'invalid_redirect_uri', error_description: "Adresse de retour non autorisée." });
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

  return {
    verifierAcces: magasin.verifierAcces,
    magasin,
    async traiter(req, res, infos = {}) {
      const { pathname, searchParams } = new URL(req.url || '/', 'http://local');
      const chemin = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname;
      const bien = (...methodes) => {
        if (methodes.includes(req.method)) return true;
        infos.code = 'oauth_methode';
        repondre(res, 405, { error: 'methode_refusee' }, { Allow: methodes.join(', ') });
        return false;
      };
      if (chemin === '/.well-known/oauth-protected-resource' || chemin === '/.well-known/oauth-protected-resource/mcp') {
        if (bien('GET')) { infos.code = 'oauth_metadonnees'; repondre(res, 200, METADONNEES_RESSOURCE); }
        return true;
      }
      if (chemin === '/.well-known/oauth-authorization-server' || chemin === '/.well-known/oauth-authorization-server/mcp') {
        if (bien('GET')) { infos.code = 'oauth_metadonnees'; repondre(res, 200, METADONNEES_SERVEUR); }
        return true;
      }
      if (!chemin.startsWith('/oauth/')) return false;
      if (chemin === '/oauth/authorize') {
        if (!bien('GET')) return true;
        const { demande, erreur } = validerDemande(Object.fromEntries(searchParams));
        infos.code = demande ? 'oauth_page' : 'oauth_demande';
        res.writeHead(demande ? 200 : 400, ENTETES_PAGE);
        res.end(demande ? pageAutorisation(demande) : pageErreur(erreur));
        return true;
      }
      const cibles = { '/oauth/register': enregistrer, '/oauth/approve': approuver, '/oauth/token': jetons };
      const cible = cibles[chemin];
      if (!cible) { infos.code = 'oauth_inconnu'; repondre(res, 404, { error: 'introuvable' }); return true; }
      if (!bien('POST')) return true;
      if (!autoriseEcriture()) { infos.code = 'oauth_limite'; repondre(res, 429, { error: 'temporarily_unavailable' }, { 'Retry-After': '30' }); return true; }
      try {
        await cible(req, res, infos);
      } catch {
        infos.code = 'oauth_erreur_interne';
        if (!res.headersSent) repondre(res, 500, { error: 'server_error' });
      }
      return true;
    },
  };
}
