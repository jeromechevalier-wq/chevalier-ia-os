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

// Onglets qu'un module ajoute sur la fiche d'une affaire, après Activité / Notes / Documents (ex. « Devis »). Même principe : le CRM ne connaît aucun module.
// Un fournisseur est `(affaireId) => null | { id, libelle, icone, element, compteur }` : `id` mot court unique, `icone` un nom du jeu d'icônes,
// `element` le contenu déjà construit, `compteur` un nombre (pastille) ou null/undefined (pas de pastille). Le module appelle `signaler()` pour redessiner.
const fournisseursOnglets = new Set();
const IDS_ONGLETS_RESERVES = ['activite', 'notes', 'documents'];

export function inscrireOngletAffaire(fournisseur) {
  fournisseursOnglets.add(fournisseur);
  return () => { fournisseursOnglets.delete(fournisseur); };
}

/** Les onglets de l'affaire, dans l'ordre d'inscription. Ignorés : fournisseur qui plante, `null`, sans `id` ou `libelle`, `element` qui n'est pas un nœud, `id` déjà pris. */
export function ongletsDeAffaire(affaireId) {
  const liste = [];
  const pris = new Set(IDS_ONGLETS_RESERVES);
  for (const f of fournisseursOnglets) {
    try {
      const o = f(affaireId);
      if (!o || typeof o.id !== 'string' || !o.id || /\s/.test(o.id) || !o.libelle || typeof o.element?.nodeType !== 'number' || pris.has(o.id)) continue;
      pris.add(o.id);
      liste.push(o);
    } catch (e) { console.warn(e); }
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
