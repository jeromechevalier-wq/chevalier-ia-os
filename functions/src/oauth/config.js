// Réglages de la connexion OAuth du serveur MCP (téléphone, claude.ai). Aucune dépendance : importé par les tests et les contrôles statiques.
// Principe : le client (Claude) obtient un jeton d'accès en prouvant qu'un compte Google AUTORISÉ a dit « oui » sur l'écran de consentement.
// Les jetons « cia_… » en en-tête (Hermes, Claude Code) ne changent pas : c'est l'autre porte, qui reste en place.

/** Adresse publique : l'émetteur OAuth et la ressource protégée (doit être identique à l'adresse saisie dans Claude, chemin compris). */
export const EMETTEUR = 'https://chevalier-ia-os.web.app';
export const RESSOURCE = `${EMETTEUR}/mcp`;
export const URL_METADONNEES_RESSOURCE = `${EMETTEUR}/.well-known/oauth-protected-resource/mcp`;

/**
 * Comptes Google autorisés : la MÊME liste que `compteAutorise()` dans firestore.rules (un test compare les deux).
 * Le compte doit aussi avoir une adresse vérifiée par Google.
 */
export const COMPTES_AUTORISES = ['jerome.chevalier@gmail.com', 'jeromebot.chevalierbot@gmail.com'];

/** Décision de Jérôme (09/10/2026) : le téléphone reçoit tous les droits, comme Claude Code (suppression et restauration comprises). */
export const PROFIL_OAUTH = 'claude-code';

/** Seules adresses de retour acceptées (comparaison exacte) : les applications hébergées de Claude (web, bureau, téléphone). */
export const REDIRECTIONS_AUTORISEES = ['https://claude.ai/api/mcp/auth_callback', 'https://claude.com/api/mcp/auth_callback'];

/**
 * ChatGPT (décision de Jérôme, 20/10/2026) : son adresse de retour porte un identifiant propre à chaque connecteur,
 * https://chatgpt.com/connector/oauth/<identifiant> (adresse actuelle d'après la documentation d'OpenAI), plus l'ancienne adresse fixe.
 * Même règle que le serveur des clients (clients/config.js) : hôte et chemin exacts, identifiant en lettres, chiffres, _ et -.
 * Seuls les comptes de COMPTES_AUTORISES peuvent de toute façon valider l'écran de consentement.
 */
export const REDIRECTIONS_CHATGPT_FIXES = ['https://chatgpt.com/connector_platform_oauth_redirect'];
const REDIRECTION_CHATGPT = /^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]{1,100}$/;

export const redirectionAutorisee = (uri) => typeof uri === 'string'
  && (REDIRECTIONS_AUTORISEES.includes(uri) || REDIRECTIONS_CHATGPT_FIXES.includes(uri) || REDIRECTION_CHATGPT.test(uri));

/** Quel assistant revient à cette adresse : sert au nom d'acteur du journal (claude-ai-<compte> ou chatgpt-<compte>). */
export const assistantDeRedirection = (uri) => (typeof uri === 'string' && uri.startsWith('https://chatgpt.com/') ? 'chatgpt' : 'claude-ai');

export const DUREES = Object.freeze({
  codeS: 60, // code d'autorisation : une minute, usage unique
  accesS: 3600, // jeton d'accès : une heure
  connexionJours: 30, // « 30 jours glissants » (décision de Jérôme) : chaque renouvellement repousse l'échéance de 30 jours
});

export const COLLECTION_OAUTH = 'mcp_oauth';

/** Origines de navigateur acceptées (la page de connexion tourne sur l'appli). Les clients MCP et OAuth serveur à serveur n'envoient pas d'en-tête Origin. */
export const ORIGINES_AUTORISEES = ['https://chevalier-ia-os.web.app', 'https://chevalier-ia-os.firebaseapp.com'];
