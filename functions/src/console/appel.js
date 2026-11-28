// Fonctions appelables `consoleEtat` et `consoleVersions` (depuis la Console) : RÉSERVÉES à Jérôme (exception écrite du 16/11/2026, CLAUDE.md et docs/console.md).
// L'identité est contrôlée à chaque appel, côté serveur : un compte Google vérifié ET dans comptes_jerome_seul (fiche reglages_maison/maison, lue par le serveur seul). Cacher le menu ne suffit pas.
// Jamais le compte du bot, jamais un client, un éditeur, un lecteur ou un assistant : ils reçoivent tous « permission-denied ».
// `consoleEtat` ne lit aucune base ni aucun secret : elle répond seulement { version, serveur, plateforme }.
// `consoleVersions` (28/11/2026, phase 2) lit la fiche reglages_maison/version de chaque bâtiment (console/versions.js), le même contrôle d'identité d'abord.
// Les messages d'erreur sont écrits pour être affichés tels quels ; jamais de détail technique ni de valeur de secret dans une réponse.
import { HttpsError } from 'firebase-functions/v2/https';
import { comptesJeromeSeul, emailDans } from '../securite/reglages-maison.js';
import { projetCourant } from '../securite/maison.js';

/** Jérôme seul : la liste comptes_jerome_seul de la fiche de la maison (jamais le bot). Un tableau peut être passé pour les essais. */
export const COMPTES_CONSOLE = comptesJeromeSeul;

/** Le contrôle commun à toutes les fonctions de la Console : lève « unauthenticated » ou « permission-denied », sinon ne rend rien. */
export async function verifierAccesConsole(requete, { comptes = COMPTES_CONSOLE, journal = () => {}, action = 'etat' } = {}) {
  const jeton = requete?.auth?.token;
  if (!jeton) throw new HttpsError('unauthenticated', 'Connexion nécessaire.');
  if (jeton.email_verified !== true || !(await emailDans(comptes, String(jeton.email ?? ''), 'minuscules'))) {
    journal({ action, statut: 'refus' });
    throw new HttpsError('permission-denied', 'Ce compte n\'a pas accès à la Console.');
  }
}

export function creerAppelConsole({ version, comptes = COMPTES_CONSOLE, journal = () => {} }) {
  return async function appel(requete) {
    await verifierAccesConsole(requete, { comptes, journal, action: 'etat' });
    journal({ action: 'etat', statut: 'ok' });
    return { version, serveur: 'ok', plateforme: projetCourant() };
  };
}

/**
 * `consoleVersions` : `lireVersions` = async () => { version_reference, batiments } (console/versions.js). Jamais de nom de projet dans la réponse.
 * Une lecture qui échoue est rendue « inconnu » par lireVersions ; une erreur inattendue ici devient un message lisible.
 */
export function creerAppelConsoleVersions({ lireVersions, comptes = COMPTES_CONSOLE, journal = () => {} }) {
  return async function appel(requete) {
    await verifierAccesConsole(requete, { comptes, journal, action: 'versions' });
    try {
      const r = await lireVersions();
      journal({ action: 'versions', statut: 'ok' });
      return r;
    } catch {
      journal({ action: 'versions', statut: 'erreur' });
      throw new HttpsError('internal', 'Les versions ne se lisent pas pour l\'instant.');
    }
  };
}

/** Une ligne de journal du serveur : seulement l'action et le statut, jamais d'e-mail ni de valeur. */
export function ligneDeJournalConsole({ action, statut }) {
  return JSON.stringify({ severity: statut === 'ok' ? 'INFO' : 'WARNING', message: `console ${action} ${statut}` });
}
