// Fonction appelable `consoleEtat` (depuis la Console) : RÉSERVÉE à Jérôme (exception écrite du 16/11/2026, CLAUDE.md et docs/console.md).
// L'identité est contrôlée à chaque appel, côté serveur : un compte Google vérifié ET dans la liste ci-dessous. Cacher le menu ne suffit pas.
// Jamais le compte du bot, jamais un client, un éditeur, un lecteur ou un assistant : ils reçoivent tous « permission-denied ».
// Phase 0 : la fonction ne lit aucune base ni aucun secret, elle répond seulement { version, serveur, plateforme } (la phase 1 y ajoutera la lecture des espaces).
// Les messages d'erreur sont écrits pour être affichés tels quels ; jamais de détail technique ni de valeur de secret dans une réponse.
import { HttpsError } from 'firebase-functions/v2/https';

export const COMPTES_CONSOLE = Object.freeze(['jerome.chevalier@gmail.com']);

export function creerAppelConsole({ version, comptes = COMPTES_CONSOLE, journal = () => {} }) {
  return async function appel(requete) {
    const jeton = requete.auth?.token;
    if (!jeton) throw new HttpsError('unauthenticated', 'Connexion nécessaire.');
    if (jeton.email_verified !== true || !comptes.includes(String(jeton.email ?? '').toLowerCase())) {
      journal({ action: 'etat', statut: 'refus' });
      throw new HttpsError('permission-denied', 'Ce compte n\'a pas accès à la Console.');
    }
    journal({ action: 'etat', statut: 'ok' });
    return { version, serveur: 'ok', plateforme: 'chevalier-ia-os' };
  };
}

/** Une ligne de journal du serveur : seulement l'action et le statut, jamais d'e-mail ni de valeur. */
export function ligneDeJournalConsole({ action, statut }) {
  return JSON.stringify({ severity: statut === 'ok' ? 'INFO' : 'WARNING', message: `console ${action} ${statut}` });
}
