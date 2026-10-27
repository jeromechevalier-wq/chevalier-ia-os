// Ce que la liste des devis et la fiche d'un devis montrent du PDF : un lien « PDF » (prêt), « PDF en cours de fabrication » (le serveur travaille),
// ou l'avertissement « PDF non rangé » avec un clic pour réessayer. Les règles (quel état) sont dans pdf.js (pur, testé) ; ici : le dessin et le réessai.
// Le navigateur n'écrit jamais le champ `pdf` : le réessai passe par la fonction du serveur `devisPdf` (donnees.js), le devis se met à jour tout seul.
import { h, icone, toast } from '../../os/ui.js';
import { lien as lienRoute } from '../../os/router.js';
import * as D from './donnees.js';
import { etatPdfDevis, routePdf, LIBELLE_PDF_NON_RANGE, LIBELLE_PDF_EN_COURS } from './pdf.js';

const enReessai = new Set(); // identifiants des devis dont le PDF est en cours de relance depuis cet écran

/** Relance la fabrication du PDF (réservé aux devis finalisés dont le PDF n'est pas prêt). `apres` redessine l'écran qui appelle. */
export async function relancerPdf(devis, apres = () => {}) {
  if (enReessai.has(devis.id)) return;
  enReessai.add(devis.id);
  apres();
  try {
    await D.pdfDevis(devis.id);
    toast('PDF prêt');
  } catch (e) {
    console.warn(e);
    toast(e?.message || D.MESSAGE_RESEAU_DEVIS, { type: 'erreur', duree: 8000 });
  } finally {
    enReessai.delete(devis.id);
    apres();
  }
}

/** `null` pour un brouillon. `apres` : redessine l'écran (le bouton passe à « en cours » pendant le réessai). */
export function indicateurPdf(devis, { apres = () => {}, maintenant = Date.now() } = {}) {
  const etat = enReessai.has(devis.id) ? 'en_cours' : etatPdfDevis(devis, maintenant);
  if (etat === 'aucun') return null;
  if (etat === 'pret') {
    return h('a', { class: 'lien-pdf-devis', href: lienRoute(routePdf(devis.id)), dataset: { pdf: 'pret' }, 'aria-label': `Ouvrir le PDF du devis ${devis.numero ?? ''}`.trim(), onclick: (e) => e.stopPropagation() },
      icone('file-text', { taille: 14 }), 'PDF');
  }
  if (etat === 'en_cours') {
    return h('span', { class: 'pdf-en-cours', role: 'status', dataset: { pdf: 'en_cours' } }, h('span', { class: 'rond-chargement', 'aria-hidden': 'true' }), LIBELLE_PDF_EN_COURS);
  }
  return h('button', {
    type: 'button', class: 'bouton-lien pdf-non-range', dataset: { pdf: 'non_range', action: 'reessayer-pdf' },
    title: `${LIBELLE_PDF_NON_RANGE} : cliquer pour réessayer`, 'aria-label': `${LIBELLE_PDF_NON_RANGE} : réessayer`,
    onclick: (e) => { e.stopPropagation(); relancerPdf(devis, apres); },
  }, icone('triangle-alert', { taille: 14 }), LIBELLE_PDF_NON_RANGE);
}
