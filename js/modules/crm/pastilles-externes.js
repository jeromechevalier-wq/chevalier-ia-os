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

// Action principale qu'un module propose dans l'en-tête d'une affaire, à côté de « Perdue » (ex. « Créer un devis »). Un fournisseur est `(affaireId) => null | { libelle, icone, action }` ;
// la fiche en fait le bouton jaune tant que l'affaire est en cours (secondaire sinon : un seul jaune par page). Premier fournisseur qui répond gagne ; un fournisseur qui plante est ignoré.
const fournisseursActions = new Set();

export function inscrireActionAffaire(fournisseur) {
  fournisseursActions.add(fournisseur);
  return () => { fournisseursActions.delete(fournisseur); };
}

/** L'action principale proposée par un module pour cette affaire, ou null. Ignorés : sans `libelle` ou sans `action` fonction. */
export function actionDeAffaire(affaireId) {
  for (const f of fournisseursActions) {
    try {
      const a = f(affaireId);
      if (a && typeof a.libelle === 'string' && a.libelle && typeof a.action === 'function') return a;
    } catch (e) { console.warn(e); }
  }
  return null;
}

// Montant qu'un module affiche à la place du montant estimé de l'affaire (ex. le total des devis). Un fournisseur est `(affaireId) => null | { libelle, total, suffixe, detail }`
// (`total` un nombre en euros, `suffixe` ex. « TTC », `detail` des lignes `{ texte, montant }` pour l'infobulle). Premier fournisseur qui répond gagne ; module éteint = rien d'inscrit = le montant estimé.
const fournisseursMontant = new Set();

export function inscrireMontantAffaire(fournisseur) {
  fournisseursMontant.add(fournisseur);
  return () => { fournisseursMontant.delete(fournisseur); };
}

/** Le montant proposé par un module pour cette affaire, ou null. Ignorés : sans `libelle` ou avec un `total` qui n'est pas un nombre fini ; un fournisseur qui plante. */
export function montantDeAffaire(affaireId) {
  for (const f of fournisseursMontant) {
    try {
      const m = f(affaireId);
      if (m && typeof m.libelle === 'string' && m.libelle && Number.isFinite(m.total)) return m;
    } catch (e) { console.warn(e); }
  }
  return null;
}

export function surChangementPastilles(rappel) {
  abonnes.add(rappel);
  return () => { abonnes.delete(rappel); };
}

export function signaler() {
  abonnes.forEach((f) => { try { f(); } catch (e) { console.warn(e); } });
}
