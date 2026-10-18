// Réglages du MCP des clients (plateforme clients, projet Firebase « chevalier-ia-app »). Aucune dépendance : importé par les tests et les contrôles statiques.
// Un lien par client : https://chevalier-ia-app.web.app/mcp/<client>. Le client est lu DANS L'ADRESSE (jamais dans un paramètre envoyé par l'assistant),
// puis écrit dans la connexion OAuth ; chaque appel est revérifié contre sa fiche (membre, module « mcp » allumé, client actif).
// Le serveur MCP de Jérôme (functions/src/oauth/config.js, base chevalier-ia-os) n'est pas concerné.

export const EMETTEUR_PLATEFORME = 'https://chevalier-ia-app.web.app';
export const ORIGINES_PLATEFORME = ['https://chevalier-ia-app.web.app', 'https://chevalier-ia-app.firebaseapp.com'];

/** Configuration Firebase WEB de la plateforme (publique par nature) : la MÊME que scripts/projets/plateforme.json (un test les compare). */
export const CONFIG_FIREBASE_PLATEFORME = Object.freeze({
  apiKey: 'AIzaSyBozQGcRbt3sOUr3K2pygTUFdCZKcvxTtI',
  authDomain: 'chevalier-ia-app.web.app',
  projectId: 'chevalier-ia-app',
  appId: '1:192468914925:web:4f459f0606689e22c572e4',
});

/** Identifiant de client : le même format que partout (js/os/marque.js), en MINUSCULES seulement. Une majuscule dans le lien = lien inconnu. */
export const FORMAT_CLIENT = /^[a-z0-9][a-z0-9_-]{0,39}$/;

/** Module qui allume le MCP chez un client (js/os/registre.js). */
export const MODULE_MCP = 'mcp';

/**
 * Profil du serveur déduit du rôle du membre (décision de Jérôme, 17/10/2026) : lecteur = consultation seule ; éditeur = consultation, modification,
 * suppression et restauration (profil 'claude-code' = écriture + supprimer_* + restaurer_depuis_audit, rien d'autre). La liste blanche des outils reste
 * js/os/registre.js (outilsMcp). Suppressions journalisées et restaurables (restaurer_depuis_audit) ; plafond de 20 suppressions par jour.
 */
export const PROFIL_PAR_ROLE = Object.freeze({ lecteur: 'lecteur', editeur: 'claude-code' });

/**
 * Adresses de retour acceptées (comparaison exacte, sauf ChatGPT dont l'adresse porte un identifiant propre à chaque connecteur) :
 *  - Claude (web, bureau, téléphone) : les deux adresses du serveur de Jérôme ;
 *  - ChatGPT : https://chatgpt.com/connector/oauth/<identifiant> (adresse actuelle d'après la documentation d'OpenAI, relevée le 16/10/2026) et l'ancienne
 *    adresse fixe, encore valable pour les connecteurs déjà publiés. NON essayé avec un vrai ChatGPT.
 */
export const REDIRECTIONS_CLAUDE = Object.freeze(['https://claude.ai/api/mcp/auth_callback', 'https://claude.com/api/mcp/auth_callback']);
export const REDIRECTIONS_CHATGPT_FIXES = Object.freeze(['https://chatgpt.com/connector_platform_oauth_redirect']);
const REDIRECTION_CHATGPT = /^https:\/\/chatgpt\.com\/connector\/oauth\/[A-Za-z0-9_-]{1,100}$/;

export const redirectionAutorisee = (uri) => typeof uri === 'string'
  && (REDIRECTIONS_CLAUDE.includes(uri) || REDIRECTIONS_CHATGPT_FIXES.includes(uri) || REDIRECTION_CHATGPT.test(uri));

/** Quel assistant revient à cette adresse : sert au nom d'acteur (claude-ai-<compte>, chatgpt-<compte>) et au texte de l'écran. */
export function assistantDeRedirection(uri) {
  if (typeof uri === 'string' && uri.startsWith('https://chatgpt.com/')) return { code: 'chatgpt', nom: 'ChatGPT' };
  return { code: 'claude-ai', nom: 'Claude' };
}

/** Nom d'acteur dans le journal et l'audit : « <assistant>-<partie locale de l'e-mail> ». */
export function acteurClient(assistant, email) {
  const local = String(email).toLowerCase().split('@')[0].replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  return `${assistant === 'chatgpt' ? 'chatgpt' : 'claude-ai'}-${local || 'compte'}`;
}

/** Toutes les adresses d'un client. Le client est supposé valide (FORMAT_CLIENT). */
export function adressesClient(client, emetteur = EMETTEUR_PLATEFORME) {
  const ressource = `${emetteur}/mcp/${client}`;
  return {
    ressource,
    metadonneesRessource: `${emetteur}/.well-known/oauth-protected-resource/mcp/${client}`,
    metadonneesServeur: `${emetteur}/.well-known/oauth-authorization-server/mcp/${client}`,
    emetteur: ressource, // chaque client a son propre « serveur d'autorisation » (même adresse que sa ressource) : le client est dans toutes les adresses
    autoriser: `${emetteur}/oauth/${client}/authorize`,
    jeton: `${emetteur}/oauth/${client}/token`,
    enregistrer: `${emetteur}/oauth/${client}/register`,
    approuver: `/oauth/${client}/approve`,
  };
}
