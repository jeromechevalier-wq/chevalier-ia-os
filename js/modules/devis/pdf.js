// PDF d'un devis : règles pures (aucun accès au navigateur ni aux données), testées seules.
// Le serveur fabrique le PDF quand le devis passe de brouillon à finalisé et écrit seul le champ `pdf` du devis :
//   pdf = { statut: 'en_cours' | 'ok' | 'echec', tentatives, demarreLe?, chemin?, nom?, message?, ... }
// `pdfAReessayer` est la MÊME règle que `functions/src/coeur/devis.js` (le serveur n'a pas accès à ce dossier ; le test statique les compare).

/** Un « en cours » plus vieux que cela est considéré comme abandonné (même durée que le serveur : DELAI_EN_COURS_MS). */
export const DELAI_EN_COURS_MS = 10 * 60_000;

/** Un devis finalisé dont le PDF n'est pas prêt : l'écran montre l'avertissement « PDF non rangé » et le bouton « Réessayer ». */
export const pdfAReessayer = (devis) => !!devis && devis.statut !== 'brouillon' && devis.pdf?.statut !== 'ok';

const enMillis = (t) => {
  if (!t) return null;
  if (typeof t.toMillis === 'function') return t.toMillis();
  if (typeof t.seconds === 'number') return t.seconds * 1000;
  const ms = t instanceof Date ? t.getTime() : new Date(t).getTime();
  return Number.isFinite(ms) ? ms : null;
};

/**
 * Ce que l'écran montre pour le PDF d'un devis : 'aucun' (brouillon), 'pret' (pdf.statut ok),
 * 'en_cours' (le serveur y travaille depuis moins de 10 minutes) ou 'a_reessayer' (non rangé : échec, jamais fait, ou « en cours » abandonné).
 */
export function etatPdfDevis(devis, maintenant = Date.now()) {
  if (!devis || devis.statut === 'brouillon') return 'aucun';
  if (!pdfAReessayer(devis)) return 'pret';
  if (devis.pdf?.statut === 'en_cours') {
    const debut = enMillis(devis.pdf.demarreLe);
    if (debut !== null && Math.abs(maintenant - debut) < DELAI_EN_COURS_MS) return 'en_cours'; // comme le serveur : sans date de départ, le « en cours » est abandonné
  }
  return 'a_reessayer';
}

export const LIBELLE_PDF_NON_RANGE = 'PDF non rangé';
export const LIBELLE_PDF_EN_COURS = 'PDF en cours de fabrication';
export const MESSAGE_PDF_RANGE_AFFAIRE = 'PDF enregistré dans l’affaire';
export const MESSAGE_PDF_RANGE_SANS_AFFAIRE = 'PDF enregistré avec le devis. Ce devis n’a pas d’affaire : choisis-en une pour que le PDF apparaisse dans ses Documents.';

/** Adresse (sans « # ») de l'écran qui ouvre le PDF d'un devis. */
export const routePdf = (devisId, brouillon = false) => `devis/pdf/${encodeURIComponent(devisId)}${brouillon ? '/brouillon' : ''}`;

/**
 * Où ramène le bouton de retour de l'écran du PDF : à la page du devis d'où l'on vient (éditeur ou visualisation), à la liste si l'on vient de la liste,
 * sinon (rechargement, pastille d'une autre page) au devis lui-même : son éditeur (brouillon) ou sa visualisation. `origine` : route (sans « # ») de la dernière page du module.
 */
export function cibleRetourPdf({ devisId, brouillon = false, origine = '' } = {}) {
  const id = encodeURIComponent(devisId ?? '');
  const lieDevis = [`devis/editeur/${id}`, `devis/voir/${id}`];
  if (lieDevis.includes(origine)) return { route: origine, libelle: 'Retour au devis' };
  if (origine === 'devis/liste') return { route: 'devis/liste', libelle: 'Retour aux devis' };
  return { route: brouillon ? lieDevis[0] : lieDevis[1], libelle: 'Retour au devis' };
}

let origineMemorisee = '';
/** Retient la dernière page du module Devis qui n'est pas un écran de PDF (appelée par le routeur du module). */
export const memoriserOrigine = (route) => { origineMemorisee = String(route ?? ''); };
export const origineRetour = () => origineMemorisee;

/** Message affiché après « Télécharger le PDF » : l'affaire garde un document seulement si le devis en a une. */
export const messageApresEnregistrement = (devis) => (devis?.affaireId ? MESSAGE_PDF_RANGE_AFFAIRE : MESSAGE_PDF_RANGE_SANS_AFFAIRE);
