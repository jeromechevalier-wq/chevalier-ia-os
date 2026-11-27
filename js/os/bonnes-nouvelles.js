// Bonnes nouvelles des modules (27/11/2026, or du village) : un module annonce « facture validée », « facture payée » ou « devis signé » APRÈS la réussite, et c'est tout.
// Il ne connaît ni le village ni l'or (le jeu est à part : js/os/village-or.js écoute à chaque session, hors portail devis, même jeu éteint ou accueil classique : l'or se compte alors en silence). Aucun import ; n'échoue jamais.

/** Annonce une bonne nouvelle : `source` ('facture-validee' | 'facture-payee' | 'devis-signe') et ce qui la désigne ({ id, projetId }). Ne lève jamais. */
export function annoncer(source, detail = {}) {
  try { window.dispatchEvent(new CustomEvent('bonne-nouvelle', { detail: { source, ...detail } })); } catch { /* rien : une annonce perdue ne gêne jamais le module */ }
}

/** Écoute les bonnes nouvelles : `fn(detail)` ; rend la fonction qui arrête l'écoute. */
export function ecouter(fn) {
  const recevoir = (e) => { try { fn(e.detail ?? {}); } catch { /* rien */ } };
  window.addEventListener('bonne-nouvelle', recevoir);
  return () => window.removeEventListener('bonne-nouvelle', recevoir);
}
