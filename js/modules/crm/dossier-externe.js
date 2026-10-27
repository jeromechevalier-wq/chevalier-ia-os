// Ce qu'un AUTRE module fait quand une affaire reçoit son dossier de travail (créé ou lié). Le CRM ne connaît aucun module : il appelle ceux qui se sont inscrits.
// Un module inscrit `async ({ affaireId, urlDossier }) => { texte, type } | null` quand il démarre et le retire quand il s'arrête : module éteint = rien d'inscrit = rien ne se passe.
// Exemple : le module Devis copie dans le dossier les PDF des devis déjà finalisés de l'affaire.
const crochets = new Set();

export function inscrireApresDossierAffaire(crochet) {
  crochets.add(crochet);
  return () => { crochets.delete(crochet); };
}

/** Appelle chaque module inscrit (l'un après l'autre). Rend les comptes rendus `{ texte, type: 'info' | 'erreur' }` ; un module qui plante donne un compte rendu d'erreur, jamais un silence. */
export async function lancerApresDossierAffaire({ affaireId, urlDossier }) {
  const rapports = [];
  for (const c of [...crochets]) {
    try {
      const r = await c({ affaireId, urlDossier });
      if (r?.texte) rapports.push(r);
    } catch (e) {
      console.warn(e);
      rapports.push({ texte: 'Le dossier est prêt, mais la copie des PDF des devis n’a pas pu être faite. Ouvre le PDF d’un devis pour réessayer.', type: 'erreur' });
    }
  }
  return rapports;
}
