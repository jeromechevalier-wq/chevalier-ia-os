// Fonction appelable `consoleEtat` (depuis la Console) : RÉSERVÉE à Jérôme (exception écrite du 16/11/2026, CLAUDE.md et docs/console.md).
// L'identité est contrôlée à chaque appel, côté serveur : un compte Google vérifié ET dans comptes_jerome_seul (fiche reglages_maison/maison, lue par le serveur seul). Cacher le menu ne suffit pas.
// Jamais le compte du bot, jamais un client, un éditeur, un lecteur ou un assistant : ils reçoivent tous « permission-denied ».
// Phase 0 : la fonction ne lit aucune base ni aucun secret, elle répond seulement { version, serveur, plateforme } (la phase 1 y ajoutera la lecture des espaces).
// Les messages d'erreur sont écrits pour être affichés tels quels ; jamais de détail technique ni de valeur de secret dans une réponse.
import { HttpsError } from 'firebase-functions/v2/https';
import { comptesJeromeSeul, emailDans } from '../securite/reglages-maison.js';
import { projetCourant } from '../securite/maison.js';

/** Jérôme seul : la liste comptes_jerome_seul de la fiche de la maison (jamais le bot). Un tableau peut être passé pour les essais. */
export const COMPTES_CONSOLE = comptesJeromeSeul;

export function creerAppelConsole({ version, comptes = COMPTES_CONSOLE, journal = () => {} }) {
  return async function appel(requete) {
    const jeton = requete.auth?.token;
    if (!jeton) throw new HttpsError('unauthenticated', 'Connexion nécessaire.');
    if (jeton.email_verified !== true || !(await emailDans(comptes, String(jeton.email ?? ''), 'minuscules'))) {
      journal({ action: 'etat', statut: 'refus' });
      throw new HttpsError('permission-denied', 'Ce compte n\'a pas accès à la Console.');
    }
    journal({ action: 'etat', statut: 'ok' });
    return { version, serveur: 'ok', plateforme: projetCourant() };
  };
}

/** Une ligne de journal du serveur : seulement l'action et le statut, jamais d'e-mail ni de valeur. */
export function ligneDeJournalConsole({ action, statut }) {
  return JSON.stringify({ severity: statut === 'ok' ? 'INFO' : 'WARNING', message: `console ${action} ${statut}` });
}
