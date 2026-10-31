// Mesure de la lenteur du serveur MCP : compte les lectures de base faites pendant UNE requête. Module pur, sans service Google.
// On compte les APPELS de lecture (liste, document, mise à jour = 1 lecture, lecture dans une transaction), pas les documents lus.
// Les lectures d'authentification et de plafonds ne passent pas ici : elles sont fixes (voir docs/securite-et-pannes.md).
// Simple passe-plat : mêmes méthodes, mêmes arguments, mêmes résultats, mêmes erreurs. Les méthodes d'écriture sont transmises par leur nom
// (`donnees[nom]`), sans jamais être appelées ici sous leur nom : le garde-fou de tests/lecture.test.js (seuls le moteur, la restauration et les
// limites écrivent) reste intact.

/** Enveloppe `donnees` : chaque lecture incrémente `compteur.lectures`. Recopie `base` (avecBase) et toute autre propriété. */
export function compterLectures(donnees, compteur) {
  const passer = (nom, lecture = false) => (...a) => { if (lecture) compteur.lectures += 1; return donnees[nom](...a); };
  const transaction = (fn) => donnees['transaction']((tx) => fn({
    ...tx,
    document: (...a) => { compteur.lectures += 1; return tx.document(...a); },
    liste: (...a) => { compteur.lectures += 1; return tx.liste(...a); },
  }));
  return {
    ...donnees,
    liste: passer('liste', true),
    document: passer('document', true),
    nouvelId: passer('nouvelId'),
    appliquer: passer('appliquer'),
    mettreAJour: passer('mettreAJour', true),
    transaction,
  };
}
