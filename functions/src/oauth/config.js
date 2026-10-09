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

export const DUREES = Object.freeze({
  codeS: 60, // code d'autorisation : une minute, usage unique
  accesS: 3600, // jeton d'accès : une heure
  connexionJours: 30, // « 30 jours glissants » (décision de Jérôme) : chaque renouvellement repousse l'échéance de 30 jours
});

export const COLLECTION_OAUTH = 'mcp_oauth';

/** Origines de navigateur acceptées (la page de connexion tourne sur l'appli). Les clients MCP et OAuth serveur à serveur n'envoient pas d'en-tête Origin. */
export const ORIGINES_AUTORISEES = ['https://chevalier-ia-os.web.app', 'https://chevalier-ia-os.firebaseapp.com'];
