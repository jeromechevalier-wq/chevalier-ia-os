// Super admins (décision de Jérôme, 09/11/2026) : les seuls comptes autorisés à utiliser les outils MCP « réservés » (drapeau `reserveAuxSuperAdmins`), chez lui comme dans l'espace d'un client.
// Liste dans la configuration du SERVEUR, jamais un rôle stocké en base : un rôle dans les données d'un espace client pourrait être attribué depuis cet espace.
// Ajouter un super admin = une ligne ici + PR relue + déploiement. Un rôle stocké en base viendra plus tard, après conception (qui l'attribue, journal).
// Un compte ne compte que s'il est aussi dans COMPTES_AUTORISES (sinon il ne peut pas se connecter au serveur de Jérôme).
export const SUPER_ADMINS = Object.freeze(['jerome.chevalier@gmail.com', 'jeromebot.chevalierbot@gmail.com']);

/** Vrai si `email` (chaîne : l'e-mail VÉRIFIÉ de la connexion, jamais une saisie) est celui d'un super admin ; minuscules et espaces ignorés. */
export const estSuperAdminEmail = (email) => typeof email === 'string' && SUPER_ADMINS.includes(email.trim().toLowerCase());
