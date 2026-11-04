// Saisie d'adresses « comme dans Gmail » : la partie PURE (aucun navigateur). Elle découpe ce qu'on tape ou colle en adresses et les ajoute une à une
// en s'arrêtant à la première qui est refusée. Les règles de refus (adresse invalide, doublon, maximum) sont données par l'appelant : la fenêtre « Préparer l'e-mail »
// et l'éditeur du devis ont chacune les leurs. L'écran est dans saisie-adresses.js.

/** Sépare un texte en adresses : virgule, point-virgule, espace ou retour à la ligne ; « Nom <a@b.fr> » donne « a@b.fr ». Les morceaux vides sont ignorés. */
export function decouper(texte) {
  return String(texte ?? '').split(/[\s,;]+/).map((m) => m.replace(/^<+|>+$/g, '').trim()).filter(Boolean);
}

/** Vrai si le texte contient déjà un séparateur au milieu ou à la fin (donc une adresse est terminée). */
export const contientSeparateur = (texte) => /[\s,;]/.test(String(texte ?? '').trim()) || /[\s,;]$/.test(String(texte ?? ''));

/**
 * Ajoute les adresses de `texte` à `liste`. `refuser(adresse, listeCourante)` rend un message ou null.
 * Rend { liste, ajoutees, erreur, reste } : à la première adresse refusée on s'arrête, `reste` est le texte à laisser dans le champ (cette adresse et les suivantes), `erreur` le message.
 */
export function ajouterPlusieurs(liste, texte, refuser) {
  const morceaux = decouper(texte);
  let courante = [...liste];
  const ajoutees = [];
  for (let i = 0; i < morceaux.length; i++) {
    const refus = refuser(morceaux[i], courante);
    if (refus) return { liste: courante, ajoutees, erreur: refus, reste: morceaux.slice(i).join(' ') };
    courante = [...courante, morceaux[i]];
    ajoutees.push(morceaux[i]);
  }
  return { liste: courante, ajoutees, erreur: null, reste: '' };
}

/** Suggestions à proposer : celles qui contiennent la saisie, sans les adresses déjà utilisées (sans tenir compte des majuscules), au plus `max`. */
export function filtrerSuggestions(suggestions, deja = [], max = 6) {
  const vus = new Set(deja.map((a) => String(a).trim().toLowerCase()));
  const sortie = [];
  for (const s of suggestions ?? []) {
    const a = String(s ?? '').trim();
    if (!a || vus.has(a.toLowerCase())) continue;
    vus.add(a.toLowerCase());
    sortie.push(a);
    if (sortie.length >= max) break;
  }
  return sortie;
}
