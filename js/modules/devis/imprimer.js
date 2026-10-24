// Imprimer un devis / l'enregistrer en PDF depuis le navigateur (SANS serveur) : solution PROVISOIRE en attendant le PDF du serveur.
// Limites connues : pas d'empreinte du PDF, pas de rangement dans Drive, pas de « Page n / N », et le rendu dépend de la case « En-têtes et pieds de page » du navigateur (à décocher).
// Sur iPhone, l'impression propose AirPrint ; « Enregistrer en PDF » se fait en pinçant l'aperçu.
// Deux méthodes : (1) imprimer l'aperçu (un <iframe sandbox="allow-same-origin allow-modals">) ; (2) pour Safari, qui imprimerait la page parente à la place de l'iframe,
// ouvrir le document seul dans un onglet (Blob) et y lancer l'impression. L'onglet DOIT être ouvert directement dans le clic, sans `await` avant (sinon le navigateur le bloque).
import { vueClient, affichageDe } from './logique.js';
import { devisHtml } from './document.js';

export const MESSAGE_FENETRE_BLOQUEE = 'Autorise les fenêtres pour ce site, puis réessaie.';
export const MESSAGE_IMPRESSION_IMPOSSIBLE = 'L’impression n’a pas pu démarrer. Réessaie, ou utilise le menu du navigateur (Fichier, puis Imprimer).';

/** Safari (Mac, iPhone, iPad) a besoin de la méthode « onglet » : son impression d'un iframe imprime la page de l'application. */
export function aBesoinOngletPourImprimer(agent = '') {
  const a = String(agent);
  if (/iPhone|iPad|iPod/.test(a)) return true; // tous les navigateurs de l'iPhone sont bâtis sur Safari
  return /Safari/.test(a) && !/Chrome|Chromium|CriOS|FxiOS|Edg|Android/.test(a);
}

/**
 * HTML du devis tel que le client le voit (aperçu, impression). `contexte` : { clientNom, client: { telephone, email, numeroTva, siren }, emetteur }.
 * Les cases du menu « Options » du devis (`devis.affichage`) s'appliquent. Un devis en brouillon porte le filigrane « BROUILLON ».
 */
export function htmlDuDevis(devis, { clientNom = null, client = null, emetteur = undefined } = {}) {
  const vue = vueClient(devis, { clientNom, client: client ?? undefined });
  return devisHtml(vue, { brouillon: devis?.statut === 'brouillon', affichage: affichageDe(devis), ...(emetteur ? { emetteur } : {}) });
}

/**
 * Lance l'impression. À appeler DIRECTEMENT dans le gestionnaire d'un clic (pas après un `await`).
 * `iframe` : l'aperçu déjà affiché (méthode 1) ; `html` : le document complet (méthode 2, Safari). Rend { ok, methode, erreur }.
 * `autoriserOnglet: false` : n'ouvre jamais d'onglet (appel hors d'un clic, après une finalisation).
 */
export function imprimerDevis({ iframe = null, html = '', agent = globalThis.navigator?.userAgent ?? '', ouvrir = (url) => globalThis.open(url, '_blank'), autoriserOnglet = true } = {}) {
  const parOnglet = aBesoinOngletPourImprimer(agent);
  if (!parOnglet && iframe?.contentWindow) {
    try {
      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      return { ok: true, methode: 'iframe', erreur: null };
    } catch (e) {
      console.warn(e);
    }
  }
  if (!html || !autoriserOnglet) return { ok: false, methode: null, erreur: autoriserOnglet ? MESSAGE_IMPRESSION_IMPOSSIBLE : null };
  const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
  const fenetre = ouvrir(url);
  if (!fenetre) { URL.revokeObjectURL(url); return { ok: false, methode: 'onglet', erreur: MESSAGE_FENETRE_BLOQUEE }; }
  // L'impression part quand l'onglet a fini de charger le document.
  fenetre.addEventListener('load', () => { try { fenetre.focus(); fenetre.print(); } catch (e) { console.warn(e); } });
  setTimeout(() => URL.revokeObjectURL(url), 120000)?.unref?.(); // (Node seulement : ne retient pas le processus de test)
  return { ok: true, methode: 'onglet', erreur: null };
}
