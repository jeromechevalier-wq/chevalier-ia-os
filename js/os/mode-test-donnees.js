// Réglages > Mes tests (mode test, PR 4) : le SEUL fichier de la coque qui appelle la fonction « modeTestSupprimer ».
// Aucune écriture Firestore depuis le navigateur : l'aperçu et la suppression passent par la fonction du serveur (chez Jérôme et chez chaque client).
import { getFunctions, httpsCallable } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js';
import { app } from './firebase.js';

const fonctions = () => getFunctions(app, 'europe-west9');
const CODES_LISIBLES = ['permission-denied', 'invalid-argument', 'failed-precondition', 'not-found', 'unauthenticated'];
export const MESSAGE_RESEAU_TESTS = 'Ça n’a pas abouti. Vérifie ta connexion internet, puis réessaie : rien n’a été perdu.';

/** Erreur d'appel -> message à afficher (le SDK ajoute « [403] » en fin de message : on l'enlève). */
export const MESSAGE_RESEAU_SUPPRESSION = 'Ça n’a pas abouti. Actualise la liste pour voir ce qui reste (une partie a pu être supprimée), puis réessaie.';
export function messageDErreurTests(e, { suppression = false } = {}) {
  const code = String(e?.code ?? '').replace('functions/', '');
  const message = String(e?.message ?? '').replace(/\s*\[\d{3}\]$/, '').trim();
  return CODES_LISIBLES.includes(code) && message && message !== code ? message : suppression ? MESSAGE_RESEAU_SUPPRESSION : MESSAGE_RESEAU_TESTS; // « rien n'a été perdu » seulement pour la lecture : après un appel de suppression, une partie a pu partir
}

/**
 * `apercu: true` : la liste de ce qui serait supprimé. `apercu: false` + `empreinte` (celle de l'aperçu affiché) : la suppression.
 * Rend `tests` : { total, comptes, noms, relies, nonRestaurables, empreinte, rien? } ou { supprime: true, total, … }. Lève l'erreur de l'appel.
 */
export async function appelerSuppressionTests(ctx, { apercu, empreinte }) {
  const demande = { apercu: apercu !== false, ...(empreinte ? { empreinte } : {}), ...(ctx?.chezClient && ctx?.client ? { client: ctx.client } : {}) };
  const r = await httpsCallable(fonctions(), 'modeTestSupprimer')(demande);
  const tests = r?.data?.tests;
  if (!tests || typeof tests !== 'object') throw new Error('réponse inattendue');
  return tests;
}
