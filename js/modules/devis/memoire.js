// Le devis ouvert en dernier dans l'éditeur pendant cette session, pour que l'écran Bordereau puisse proposer « Reprendre le devis en cours ».
// Rien d'obligatoire : si le navigateur refuse sessionStorage, la mémoire de la page suffit (et sans mémoire, le bouton n'apparaît pas).
const CLE = 'devis.enCours';
let enMemoire = null;

/** Retient l'identifiant du devis ouvert dans l'éditeur (vide = rien à retenir). */
export function retenirDevis(id) {
  if (!id) return;
  enMemoire = String(id);
  try { sessionStorage.setItem(CLE, enMemoire); } catch { /* sessionStorage indisponible : la mémoire de la page suffit */ }
}

/** Oublie le devis retenu (par exemple après sa suppression). */
export function oublierDevis() {
  enMemoire = null;
  try { sessionStorage.removeItem(CLE); } catch { /* rien à faire */ }
}

/** Identifiant du devis ouvert en dernier, ou null. */
export function devisOuvert() {
  if (enMemoire) return enMemoire;
  try { return sessionStorage.getItem(CLE) || null; } catch { return null; }
}
