// Super admins (décision de Jérôme, 09/11/2026) : les seuls comptes autorisés à utiliser les outils MCP « réservés » (drapeau `reserveAuxSuperAdmins`), chez lui comme dans l'espace d'un client.
// Liste dans la fiche reglages_maison/maison du SERVEUR (champ super_admins, chantier 0 du 25/11/2026), jamais un rôle stocké dans les données d'un espace :
// cette fiche n'est lisible ni modifiable par aucun navigateur (règles Firestore) ; seul le SDK d'administration l'écrit. Fiche illisible = personne (refus).
// Un compte ne compte que s'il peut aussi se connecter au serveur de la maison (comptes_autorises / comptes_oauth_autorises chez Jérôme, membres chez un client).
import { emailDans, superAdmins } from './reglages-maison.js';

export const SUPER_ADMINS = superAdmins;

/** Vrai si `email` (chaîne : l'e-mail VÉRIFIÉ de la connexion, jamais une saisie) est celui d'un super admin ; minuscules et espaces ignorés. Asynchrone (lecture de la fiche, cache de 60 s). */
export const estSuperAdminEmail = async (email, comptes = SUPER_ADMINS) => emailDans(comptes, email, 'normalisee');
