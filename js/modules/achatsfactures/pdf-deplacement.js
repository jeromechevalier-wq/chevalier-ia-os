// Déplacement de la feuille du PDF à la souris ou au doigt (fonctions pures, testées) : « carte » que l'on fait glisser. Portée de l'appli BTP (lib/pdf-deplacement.ts), PR 8b.

const borne = (v, max) => Math.min(Math.max(0, max), Math.max(0, v));

/** Nouvelle position de défilement : on suit le pointeur à l'envers (la feuille suit la main), bornée entre 0 et le maximum possible dans chaque direction. */
export function positionApresGlissement(debut, pointeur, max) {
  return {
    gauche: borne(debut.gauche - (pointeur.x - debut.x), max.x),
    haut: borne(debut.haut - (pointeur.y - debut.y), max.y),
  };
}

export const ZOOM_MIN = 0.5;
export const ZOOM_MAX = 3;
export const ZOOM_DOUBLE_CLIC = 2;

/** Zoom après un double-clic : de la taille d'ajustement (100 %) vers 200 % ; déjà zoomé : retour à 100 %. */
export const zoomApresDoubleClic = (zoom) => (zoom > 1.001 ? 1 : ZOOM_DOUBLE_CLIC);

/** Marge à gauche : la feuille est centrée quand elle est plus étroite que la zone (zoom sous 100 %). */
const margeGauche = (g, zoom) => Math.max(0, (g.vue - g.largeur * zoom) / 2);

/**
 * Défilement à donner après un changement de zoom pour que le point visé reste sous le curseur.
 * `point` : position du curseur dans la zone visible (en pixels, depuis son coin haut gauche). `g` (facultatif) : { largeur, hauteurPage, vue, ecart } = largeur et hauteur d'une page au zoom 100 %,
 * largeur visible de la zone, espace fixe entre deux pages. Tient compte de la marge de centrage et de l'espace entre pages. Borné par `max` (défilement maximal du nouveau contenu).
 */
export function defilementApresZoom(avant, point, zoomApres, max, g) {
  if (!g) {
    const rapport = zoomApres / avant.zoom;
    return { gauche: borne((avant.gauche + point.x) * rapport - point.x, max.x), haut: borne((avant.haut + point.y) * rapport - point.y, max.y) };
  }
  const largeurAvant = g.largeur * avant.zoom, largeurApres = g.largeur * zoomApres;
  const x = avant.gauche + point.x - margeGauche(g, avant.zoom);
  const fx = largeurAvant > 0 ? x / largeurAvant : 0;
  const gauche = fx * largeurApres + margeGauche(g, zoomApres) - point.x;
  const hAvant = g.hauteurPage * avant.zoom, hApres = g.hauteurPage * zoomApres;
  const y = avant.haut + point.y;
  const periode = hAvant + g.ecart;
  const k = periode > 0 ? Math.floor(y / periode) : 0;
  const reste = y - k * periode;
  const yApres = k * (hApres + g.ecart) + (reste <= hAvant ? (hAvant > 0 ? reste / hAvant : 0) * hApres : hApres + (reste - hAvant));
  return { gauche: borne(gauche, max.x), haut: borne(yApres - point.y, max.y) };
}

/** Deux appuis du doigt ou du stylet assez proches dans le temps et l'espace comptent comme un double-appui (la souris a son propre double-clic). */
export const estDoubleAppui = (a, b) => !!a && b.t - a.t < 350 && Math.hypot(b.x - a.x, b.y - a.y) < 30;
