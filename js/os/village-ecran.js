// Écran d'accueil « village » d'une maison (26/11/2026) : un bâtiment par besoin, vue isométrique serrée sur les bâtiments, rien d'autre (ni journal, ni carrés).
// Les besoins arrivent déjà vérifiés par js/os/maison-village.js (lireBesoinsMaison). Les textes sont posés par textContent, jamais innerHTML.
// Un clic, Entrée ou Espace sur un bâtiment ouvre sa cible (une route interne « #/… »). Téléphone (moins de 768 px) : bâtiments en colonne.
import { planVillage, dessinBatiment, couperEnLignes, iso } from './maison-village.js';

const NS = 'http://www.w3.org/2000/svg';
const TELEPHONE = '(max-width: 767px)';

function el(nom, attrs = {}) {
  const n = document.createElementNS(NS, nom);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, String(v));
  return n;
}
const r1 = (v) => Math.round(v * 10) / 10;
const points = (liste, dx, dy) => liste.map(([x, y]) => `${r1(x + dx)},${r1(y + dy)}`).join(' ');

function forme(f, dx, dy) {
  if (f.cercle) {
    const [cx, cy, r] = f.cercle;
    return el('circle', { cx: r1(cx + dx), cy: r1(cy + dy), r, fill: f.fill, stroke: f.trait, 'stroke-width': f.trait ? 1.5 : undefined, opacity: f.opacite });
  }
  return el('polygon', { points: points(f.poly, dx, dy), fill: f.fill, opacity: f.opacite });
}

/** Décor du sol (prairie, place pavée, chemins, rangs de lavande, arbres derrière) : dessiné avant les bâtiments. */
function decor(svg, places, vue) {
  svg.append(el('rect', { x: vue.x - 2000, y: vue.y - 2000, width: vue.largeur + 4000, height: vue.hauteur + 4000, fill: '#A9C46E' }));
  for (let i = 1; i < places.length; i++) { // chemin entre deux bâtiments voisins
    const a = places[i - 1];
    const b = places[i];
    svg.append(el('line', { x1: r1(a.x), y1: r1(a.y + 8), x2: r1(b.x), y2: r1(b.y + 8), stroke: '#EFD9AE', 'stroke-width': 22, 'stroke-linecap': 'round' }));
  }
  for (const p of places) {
    const coin = (gx, gy) => iso(p.gx + gx, p.gy + gy);
    svg.append(el('polygon', { points: points([coin(-2.8, -2.8), coin(2.8, -2.8), coin(2.8, 2.8), coin(-2.8, 2.8)], 0, 0), fill: '#EFD9AE' }));
    for (let k = 0; k < 4; k++) { // rangs de lavande, à gauche de la place
      const [x0, y0] = coin(-4.2 + k * 0.5, 0.6);
      const [x1, y1] = coin(-4.2 + k * 0.5, 2.0);
      svg.append(el('line', { x1: r1(x0), y1: r1(y0), x2: r1(x1), y2: r1(y1), stroke: '#9A7FC4', 'stroke-width': 5, 'stroke-linecap': 'round' }));
    }
  }
  // Les arbres après tous les sols : la place d'un voisin ne les coupe jamais.
  for (const p of places) {
    for (const [gx, gy, type] of [[-3.4, -4.0, 'cypres'], [-0.6, -4.4, 'rond'], [3.8, -2.6, 'rond']]) arbre(svg, iso(p.gx + gx, p.gy + gy), type);
  }
}
function arbre(svg, [x, y], type) {
  svg.append(el('ellipse', { cx: r1(x), cy: r1(y), rx: 12, ry: 5, fill: '#3b2412', opacity: 0.14 }));
  if (type === 'cypres') {
    svg.append(el('path', { d: `M${r1(x)} ${r1(y - 62)} C ${r1(x + 14)} ${r1(y - 37)} ${r1(x + 10)} ${r1(y - 6)} ${r1(x)} ${r1(y)} C ${r1(x - 10)} ${r1(y - 6)} ${r1(x - 14)} ${r1(y - 37)} ${r1(x)} ${r1(y - 62)} Z`, fill: '#4E7A45' }));
    return;
  }
  svg.append(el('line', { x1: r1(x), y1: r1(y), x2: r1(x), y2: r1(y - 16), stroke: '#7A5A3E', 'stroke-width': 5, 'stroke-linecap': 'round' }));
  svg.append(el('circle', { cx: r1(x), cy: r1(y - 28), r: 16, fill: '#7DAA5A' }));
  svg.append(el('circle', { cx: r1(x - 6), cy: r1(y - 34), r: 7.5, fill: '#93BF6C' }));
}

/** Étiquette sous le bâtiment : le nom en gras, puis la phrase du besoin (deux lignes au plus). */
function etiquette(besoin, x, y) {
  const lignes = besoin.phrase ? couperEnLignes(besoin.phrase, 24, 2) : [];
  const largeur = Math.max(besoin.nom.length * 9.4, ...lignes.map((l) => l.length * 6.9)) + 26;
  const hauteur = 30 + lignes.length * 16;
  const g = el('g', { class: 'village-etiquette' });
  g.append(el('rect', { x: r1(x - largeur / 2), y: r1(y), width: r1(largeur), height: hauteur, rx: 14, fill: '#FFFDF6', stroke: '#3b2412', 'stroke-opacity': 0.14 }));
  const nom = el('text', { x: r1(x), y: r1(y + 21), 'text-anchor': 'middle', 'font-size': 16, 'font-weight': 800, fill: '#2A1A2C' });
  nom.textContent = besoin.nom;
  nom.setAttribute('data-role', 'batiment-nom');
  g.append(nom);
  lignes.forEach((l, i) => {
    const t = el('text', { x: r1(x), y: r1(y + 39 + i * 16), 'text-anchor': 'middle', 'font-size': 12.5, 'font-weight': 600, fill: '#5B4752' });
    t.textContent = l;
    t.setAttribute('data-role', 'batiment-phrase');
    g.append(t);
  });
  return g;
}

function batiment(besoin, place, aller) {
  const g = el('g', { class: 'village-batiment', tabindex: 0, role: 'link', 'data-role': 'batiment', 'data-batiment': besoin.batiment, 'data-cible': besoin.cible });
  g.setAttribute('aria-label', besoin.phrase ? `${besoin.nom} : ${besoin.phrase}` : besoin.nom);
  const titre = el('title');
  titre.textContent = besoin.phrase ? `${besoin.nom} : ${besoin.phrase}` : besoin.nom;
  g.append(titre);
  g.append(el('ellipse', { class: 'village-halo', cx: r1(place.x), cy: r1(place.y - 40), rx: 96, ry: 84, fill: 'url(#village-halo)' }));
  const lever = el('g', { class: 'village-lever' });
  for (const f of dessinBatiment(besoin.batiment)) lever.append(forme(f, place.x, place.y));
  g.append(lever, etiquette(besoin, place.x, place.y + 40));
  g.addEventListener('click', () => aller(besoin.cible));
  g.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    aller(besoin.cible);
  });
  return g;
}

function dessiner(besoins, { colonne, aller }) {
  const { places, vue } = planVillage(besoins.length, { colonne });
  const svg = el('svg', {
    class: 'village-scene', viewBox: `${r1(vue.x)} ${r1(vue.y)} ${r1(vue.largeur)} ${r1(vue.hauteur)}`, preserveAspectRatio: 'xMidYMid meet',
    role: 'group', 'aria-label': 'Accueil : choisis ce que tu veux faire', 'data-role': 'village', 'data-disposition': colonne ? 'colonne' : 'ligne',
  });
  const defs = el('defs');
  const halo = el('radialGradient', { id: 'village-halo', cx: 0.5, cy: 0.5, r: 0.5 });
  halo.append(el('stop', { offset: 0, 'stop-color': '#FFF3B0', 'stop-opacity': 0.95 }), el('stop', { offset: 1, 'stop-color': '#FFF3B0', 'stop-opacity': 0 }));
  defs.append(halo);
  svg.append(defs);
  decor(svg, places, vue);
  // Du fond vers l'avant (ordre du peintre) : le bâtiment le plus « loin » d'abord.
  const ordre = besoins.map((b, i) => ({ b, p: places[i] })).sort((u, v) => (u.p.gx + u.p.gy) - (v.p.gx + v.p.gy));
  for (const { b, p } of ordre) svg.append(batiment(b, p, aller));
  return svg;
}

/**
 * Monte le village dans `conteneur`. `besoins` : 1 à 3 besoins vérifiés ; `aller(cible)` : ouvre une route (« #/… »).
 * Rend la fonction qui démonte l'écran (arrête l'écoute du format téléphone / ordinateur).
 */
export function monterVillage(conteneur, besoins, { aller }) {
  const page = document.createElement('section');
  page.className = 'page-village';
  page.dataset.role = 'page-village';
  const titre = document.createElement('h1');
  titre.className = 'sr-only';
  titre.textContent = 'Accueil';
  const cadre = document.createElement('div');
  cadre.className = 'village-cadre';
  page.append(titre, cadre);
  conteneur.append(page);
  const media = typeof window.matchMedia === 'function' ? window.matchMedia(TELEPHONE) : null;
  const rendre = () => cadre.replaceChildren(dessiner(besoins, { colonne: Boolean(media?.matches), aller }));
  rendre();
  media?.addEventListener?.('change', rendre);
  return () => media?.removeEventListener?.('change', rendre);
}
