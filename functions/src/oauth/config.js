// Réglages de la connexion OAuth du serveur MCP (téléphone, claude.ai). Importé par les tests et les contrôles statiques : rien n'est calculé à l'import.
// Principe : le client (Claude) obtient un jeton d'accès en prouvant qu'un compte Google AUTORISÉ a dit « oui » sur l'écran de consentement.
// Les jetons « cia_… » en en-tête (Hermes, ancien branchement de Claude Code) ne changent pas : c'est l'autre porte, qui reste en place.
// Depuis le 28/11/2026, Claude Code sur le Mac peut aussi passer par cette connexion Google (adresse de retour de boucle locale, voir boucle-locale.js).

import { adresseSite, originesSite } from '../securite/maison.js';
import { redirectionBoucleLocale } from './boucle-locale.js';
import { comptesOauthAutorises } from '../securite/reglages-maison.js';

/**
 * Adresse publique : l'émetteur OAuth et la ressource protégée (doit être identique à l'adresse saisie dans Claude, chemin compris).
 * Calculée à partir du projet Google (chantier 0, 25/11/2026) : https://<projet>.web.app, soit pour le CRM de Jérôme exactement l'adresse d'avant (un test le verrouille).
 */
export const emetteur = () => adresseSite();
export const ressource = () => `${emetteur()}/mcp`;
export const urlMetadonneesRessource = () => `${emetteur()}/.well-known/oauth-protected-resource/mcp`;

/**
 * Comptes Google qui peuvent connecter un assistant par l'écran de consentement : la liste comptes_oauth_autorises de la fiche reglages_maison/maison
 * (lue par le serveur seul, cache de 60 s ; fiche illisible = personne). Le compte doit aussi avoir une adresse vérifiée par Google.
 */
export const COMPTES_AUTORISES = comptesOauthAutorises;

/** Décision de Jérôme (09/10/2026) : le téléphone reçoit tous les droits, comme le profil complet (suppression et restauration comprises). */
export const PROFIL_OAUTH = 'complet';

/** Adresses de retour fixes (comparaison exacte) : les applications hébergées de Claude (web, bureau, téléphone). ChatGPT et Claude Code : voir plus bas. */
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
  && (REDIRECTIONS_AUTORISEES.includes(uri) || REDIRECTIONS_CHATGPT_FIXES.includes(uri) || REDIRECTION_CHATGPT.test(uri) || redirectionBoucleLocale(uri));

/**
 * Quel assistant revient à cette adresse : 'chatgpt', 'claude-local' (boucle locale, Claude Code sur l'ordinateur) ou 'claude-ai'.
 * Sert au titre de l'écran de consentement et est noté dans la connexion. Le nom d'acteur, lui, reste claude-ai-<compte> pour Claude Code
 * (acteurDuCompte) : mêmes droits et mêmes plafonds qu'une connexion claude.ai du même compte (décision du 28/11/2026).
 */
export const assistantDeRedirection = (uri) => {
  if (typeof uri === 'string' && uri.startsWith('https://chatgpt.com/')) return 'chatgpt';
  if (redirectionBoucleLocale(uri)) return 'claude-local'; // pas « claude-code » : ancien nom du profil complet (profils-alias.test.js)
  return 'claude-ai';
};

export const DUREES = Object.freeze({
  codeS: 60, // code d'autorisation : une minute, usage unique
  accesS: 3600, // jeton d'accès : une heure
  connexionJours: 30, // « 30 jours glissants » (décision de Jérôme) : chaque renouvellement repousse l'échéance de 30 jours
});

export const COLLECTION_OAUTH = 'mcp_oauth';

/** Origines de navigateur acceptées (la page de connexion tourne sur l'appli). Les clients MCP et OAuth serveur à serveur n'envoient pas d'en-tête Origin. */
export const originesAutorisees = () => originesSite();
