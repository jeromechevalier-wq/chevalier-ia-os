// Pastilles qu'un AUTRE module ajoute sur la carte et la fiche d'une affaire (ex. l'état du devis). Le CRM ne connaît aucun module : il demande à ceux qui se sont inscrits.
// Un module inscrit un fournisseur `(affaireId) => { texte, couleur, statut } | null` quand il démarre et le retire quand il s'arrête : module éteint = rien d'inscrit = aucune pastille.
// Le module appelle `signaler()` quand ses données changent, pour que le Kanban et la fiche se redessinent.
const fournisseurs = new Set();
const abonnes = new Set();

export function inscrirePastilleAffaire(fournisseur) {
  fournisseurs.add(fournisseur);
  return () => { fournisseurs.delete(fournisseur); };
}

/** Les pastilles de l'affaire, dans l'ordre d'inscription (un fournisseur qui plante est ignoré). */
export function pastillesDeAffaire(affaireId) {
  const liste = [];
  for (const f of fournisseurs) {
    try { const p = f(affaireId); if (p?.texte) liste.push(p); } catch (e) { console.warn(e); }
  }
  return liste;
}

export function surChangementPastilles(rappel) {
  abonnes.add(rappel);
  return () => { abonnes.delete(rappel); };
}

export function signaler() {
  abonnes.forEach((f) => { try { f(); } catch (e) { console.warn(e); } });
}
