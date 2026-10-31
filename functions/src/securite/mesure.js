// Mesure de la lenteur du serveur MCP : compte les lectures de base faites pendant UNE requête. Module pur, sans service Google.
// On compte les APPELS de lecture (liste, document, mise à jour = 1 lecture, lecture dans une transaction), pas les documents lus.
// Les lectures d'authentification et de plafonds ne passent pas ici : elles sont fixes (voir docs/securite-et-pannes.md).
// `dureeAuthMs` n'a pas le même sens chez Jérôme (secret + jetons) et chez les clients (jeton + lecture des réglages de l'espace).
// Simple passe-plat : mêmes méthodes, mêmes arguments, mêmes résultats, mêmes erreurs, aucune écriture propre (autorisé dans tests/lecture.test.js).

/** Enveloppe `donnees` : chaque lecture incrémente `compteur.lectures`. Recopie `base` (avecBase) et toute autre propriété. */
export function compterLectures(donnees, compteur) {
  const transaction = (fn) => donnees.transaction((tx) => fn({
    ...tx,
    document: (...a) => { compteur.lectures += 1; return tx.document(...a); },
    liste: (...a) => { compteur.lectures += 1; return tx.liste(...a); },
  }));
  return {
    ...donnees,
    liste: (...a) => { compteur.lectures += 1; return donnees.liste(...a); },
    document: (...a) => { compteur.lectures += 1; return donnees.document(...a); },
    nouvelId: (...a) => donnees.nouvelId(...a),
    appliquer: (...a) => donnees.appliquer(...a),
    mettreAJour: (...a) => { compteur.lectures += 1; return donnees.mettreAJour(...a); },
    transaction,
  };
}
