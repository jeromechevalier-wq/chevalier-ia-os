// « Ouvrir le PDF » et « Télécharger le PDF » d'un devis, depuis l'éditeur (menu « … »), la liste et l'onglet Devis d'une affaire : on ne quitte jamais l'écran (plus de page « PDF », décision du 27/10/2026).
// Le lien est un lien signé de 5 minutes demandé à `devisPdfLien` (donnees.js) à chaque clic. Les règles (quel état, quels messages) sont dans pdf.js (pur, testé) ; rien n'est écrit par le navigateur.
// Un PDF en cours de fabrication : on le dit et on l'ouvre dès qu'il est prêt ; un PDF à refaire : on relance le serveur puis on l'ouvre. Navigateur qui bloque la fenêtre : bannière avec un vrai lien.
import { h, icone, toast } from '../../os/ui.js';
import * as D from './donnees.js';
import { etatPdfDevis, DELAI_EN_COURS_MS, MESSAGE_PDF_INTROUVABLE, MESSAGE_PDF_EN_COURS, MESSAGE_PDF_PAS_DE_BROUILLON, MESSAGE_PDF_PRET_LIEN } from './pdf.js';
import { afficherAttentePdf } from './pdf-attente.js';

const occupes = new Set();
const attentes = new Set(); // résolveurs des attentes de fin de fabrication en cours
let abandonne = 0; // numéro de « génération » : augmente quand le module s'arrête, les actions en attente sortent sans rien faire // « devis/action » en cours : un second clic ne relance rien
const DUREE_BANNIERE_MS = 60_000;

/** Bannière « Le PDF est prêt » avec un vrai lien (un clic de l'utilisateur n'est jamais bloqué) : le PDF s'ouvre sans quitter le devis. */
function afficherLienPdf(url) {
  document.querySelector('[data-zone="pdf-lien-pret"]')?.remove();
  let minuteur = null;
  const fermer = () => { clearTimeout(minuteur); banniere.remove(); };
  const banniere = h('div', { class: 'pdf-attente pdf-lien-pret', role: 'status', 'aria-live': 'polite', dataset: { zone: 'pdf-lien-pret' } },
    icone('file-text', { taille: 20 }),
    h('span', { class: 'pdf-attente-textes' }, h('span', {}, MESSAGE_PDF_PRET_LIEN)),
    h('a', { class: 'bouton bouton-secondaire', href: url, target: '_blank', rel: 'noopener noreferrer', dataset: { action: 'ouvrir-pdf-lien' }, onclick: () => setTimeout(fermer, 0) }, icone('external-link', { taille: 16 }), 'Ouvrir le PDF'),
    h('button', { type: 'button', class: 'bouton-icone', 'aria-label': 'Fermer', dataset: { action: 'fermer-pdf-lien' }, onclick: fermer }, icone('x', { taille: 16 })));
  document.body.append(banniere);
  minuteur = setTimeout(fermer, DUREE_BANNIERE_MS);
}

function livrer(url, mode, fenetreClic = null) {
  let fenetre = fenetreClic;
  if (mode === 'telecharger') { // le lien est signé « en pièce jointe » : le navigateur enregistre le fichier sans quitter la page
    const a = h('a', { href: url, rel: 'noopener', hidden: true });
    document.body.append(a);
    a.click();
    a.remove();
    return;
  }
  if (fenetre) { try { fenetre.opener = null; } catch { /* sans effet */ } fenetre.location = url; return; } // fenêtre ouverte AU CLIC (avant l'attente réseau) : Safari ne bloque que les ouvertures faites après un « await »
  fenetre = window.open(url, '_blank'); // sans « noopener » : c'est ce qui permet de savoir si le navigateur a bloqué la fenêtre
  if (fenetre) { try { fenetre.opener = null; } catch { /* sans effet */ } } else afficherLienPdf(url);
}

async function lienSigne(devisId, brouillon, mode) {
  const r = await D.pdfLien(devisId, brouillon, mode === 'telecharger' ? { telecharger: true } : {});
  if (typeof r?.url !== 'string' || !/^https:\/\//i.test(r.url)) throw new Error(D.MESSAGE_RESEAU_DEVIS);
  return r.url;
}

/** Attend que le serveur ait fini (le champ `pdf` du devis change), au plus 10 minutes (la durée après laquelle un « en cours » est abandonné). */
function attendreFinDeFabrication(devisId) {
  return new Promise((fini) => {
    let termine = false;
    let arret = null;
    const fin = () => { if (termine) return; termine = true; clearTimeout(minuteur); arret?.(); attentes.delete(fin); fini(); };
    attentes.add(fin);
    const minuteur = setTimeout(fin, DELAI_EN_COURS_MS);
    arret = D.surChangement(() => { if (etatPdfDevis(D.devisParId(devisId)) !== 'en_cours') fin(); });
    if (termine) arret();
  });
}

/** À l'arrêt du module Devis : plus aucune attente, plus aucun appel serveur ni fenêtre ouverte après coup. */
export function annulerAttentesPdf() {
  abandonne += 1;
  for (const fin of [...attentes]) fin();
  occupes.clear();
}

/**
 * `mode` : 'ouvrir' (nouvel onglet) ou 'telecharger' (fichier). `brouillon` : le PDF filigrané d'un brouillon (déjà fabriqué par l'appelant).
 * `ancre` : le bouton cliqué (marqué occupé pendant l'attente). Toute erreur devient un message avec « Réessayer », jamais un écran.
 */
export async function actionPdf(devisId, mode, { brouillon = false, ancre = null } = {}) {
  const cle = `${devisId}/${mode}`;
  if (occupes.has(cle)) return;
  occupes.add(cle);
  const generation = abandonne;
  const annule = () => generation !== abandonne;
  let retirerAttente = null;
  let fenetre = null;
  const attente = () => { retirerAttente ??= afficherAttentePdf({ bouton: ancre }); };
  try {
    if (!brouillon) {
      const d = D.devisParId(devisId);
      if (!d) { toast(MESSAGE_PDF_INTROUVABLE, { type: 'erreur', duree: 8000 }); return; }
      let etat = etatPdfDevis(d);
      if (mode === 'ouvrir' && etat === 'pret') fenetre = window.open('', '_blank'); // synchrone, au clic : Safari bloque les fenêtres ouvertes après une attente réseau (null si bloquée : bannière plus bas)
      if (etat === 'en_cours') { toast(MESSAGE_PDF_EN_COURS, { duree: 6000 }); attente(); await attendreFinDeFabrication(devisId); if (annule()) return; etat = etatPdfDevis(D.devisParId(devisId)); }
      if (etat === 'a_reessayer') { attente(); await D.pdfDevis(devisId); if (annule()) return; }
    }
    let url;
    try {
      url = await lienSigne(devisId, brouillon, mode);
    } catch (e) {
      if (brouillon || String(e?.code ?? '').replace('functions/', '') !== 'failed-precondition') throw e;
      attente(); // le serveur dit « pas encore prêt » : on relance la fabrication une fois
      await D.pdfDevis(devisId);
      url = await lienSigne(devisId, brouillon, mode);
    }
    if (annule()) { fenetre?.close(); return; }
    retirerAttente?.(); retirerAttente = null;
    livrer(url, mode, fenetre);
  } catch (e) {
    try { fenetre?.close(); } catch { /* sans effet */ }
    console.warn(e?.code ?? '', e?.message ?? ''); // jamais l'adresse signée
    const code = String(e?.code ?? '').replace('functions/', '');
    if (code === 'not-found' && brouillon) toast(MESSAGE_PDF_PAS_DE_BROUILLON, { type: 'erreur', duree: 8000 });
    else if (code === 'not-found') toast(MESSAGE_PDF_INTROUVABLE, { type: 'erreur', duree: 8000 });
    else toast(e?.message || D.MESSAGE_RESEAU_DEVIS, { type: 'erreur', duree: 10000, action: { libelle: 'Réessayer', surClic: () => actionPdf(devisId, mode, { brouillon, ancre }) } });
  } finally {
    retirerAttente?.();
    if (!annule()) occupes.delete(cle);
  }
}
