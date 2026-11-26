// Écran d'accueil « village » d'une maison (26/11/2026) : un terrain isométrique de 4 parcelles (losange 2 x 2), un bâtiment par besoin, rien d'autre (ni journal, ni carrés).
// Les besoins (1 à 4) arrivent déjà vérifiés par js/os/maison-village.js (lireBesoinsMaison) et occupent les parcelles dans l'ordre fixe haut, gauche, droite, bas ;
// les parcelles libres sont décorées (lavande, bosquet, potager) et ne sont ni cliquables ni atteignables au clavier (aria-hidden). Textes posés par textContent, jamais innerHTML.
// Sous chaque bâtiment, une étiquette permanente : le nom seul. Au survol ou au focus clavier, une BULLE (carte blanche avec une petite flèche) : le nom, la phrase,
// la pastille du compteur s'il y en a un (js/os/village-compteurs.js ; illisible = pas de pastille) et « Cliquez pour entrer ».
// Ordinateur : un clic, Entrée ou Espace sur un bâtiment ouvre sa cible (une route interne « #/… »).
// Téléphone (moins de 768 px) : le même terrain réduit à la largeur de l'écran ; un premier toucher montre la bulle, un second toucher ouvre la cible.
import { planVillage, dessinBatiment, decorParcelle, formesTerrain, textePastille, ETIQUETTE_Y } from './maison-village.js';
import { lireCompteur } from './village-compteurs.js';

const NS = 'http://www.w3.org/2000/svg';
const TELEPHONE = '(max-width: 767px)';
// Tailles des étiquettes en unités du dessin (le dessin est agrandi d'environ 2 fois sur un écran d'ordinateur 1440 x 900, réduit à 0,6 fois sur un téléphone de 390 px).
const ORDI = Object.freeze({ nom: 11.5, hauteur: 19, rx: 7, largeurMax: 150, carNom: 0.62, marge: 14 });
const TEL = Object.freeze({ nom: 24, hauteur: 36, rx: 12, largeurMax: 200, carNom: 0.62, marge: 22 });

function el(nom, attrs = {}) {
  const n = document.createElementNS(NS, nom);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) n.setAttribute(k, String(v));
  return n;
}
const r1 = (v) => Math.round(v * 10) / 10;
const points = (liste, dx, dy) => liste.map(([x, y]) => `${r1(x + dx)},${r1(y + dy)}`).join(' ');

function forme(f, dx = 0, dy = 0) {
  if (f.cercle) {
    const [cx, cy, r] = f.cercle;
    return el('circle', { cx: r1(cx + dx), cy: r1(cy + dy), r, fill: f.fill, stroke: f.trait, 'stroke-width': f.trait ? 1.5 : undefined, opacity: f.opacite });
  }
  if (f.ellipse) {
    const [cx, cy, rx, ry] = f.ellipse;
    return el('ellipse', { cx: r1(cx + dx), cy: r1(cy + dy), rx, ry, fill: f.fill, opacity: f.opacite });
  }
  if (f.ligne) {
    const [[x1, y1], [x2, y2]] = f.ligne;
    return el('line', { x1: r1(x1 + dx), y1: r1(y1 + dy), x2: r1(x2 + dx), y2: r1(y2 + dy), stroke: f.trait, 'stroke-width': f.epaisseur, 'stroke-linecap': 'round' });
  }
  return el('polygon', { points: points(f.poly, dx, dy), fill: f.fill, opacity: f.opacite });
}

/** Une ligne d'étiquette : resserrée (textLength) seulement si elle dépasse la largeur permise. */
function texte(contenu, attrs, largeurEstimee, largeurMax) {
  const t = el('text', { 'text-anchor': 'middle', ...attrs });
  if (largeurEstimee > largeurMax) { t.setAttribute('textLength', r1(largeurMax)); t.setAttribute('lengthAdjust', 'spacingAndGlyphs'); }
  t.textContent = contenu;
  return t;
}

/** Étiquette permanente sous le bâtiment : le nom seul (la phrase et le compteur sont dans la bulle). */
function etiquette(besoin, x, y, telephone) {
  const t = telephone ? TEL : ORDI;
  const g = el('g', { class: 'village-etiquette' });
  const largeurNom = besoin.nom.length * t.nom * t.carNom;
  const largeur = Math.min(largeurNom, t.largeurMax) + t.marge;
  g.append(el('rect', { x: r1(x - largeur / 2), y: r1(y), width: r1(largeur), height: t.hauteur, rx: t.rx, fill: '#FFFDF6', stroke: '#3b2412', 'stroke-opacity': 0.18, 'stroke-width': telephone ? 1 : 0.6 }));
  g.append(texte(besoin.nom, { x: r1(x), y: r1(y + t.hauteur * 0.69), 'font-size': t.nom, 'font-weight': 800, fill: '#2A1A2C', 'data-role': 'batiment-nom' }, largeurNom, t.largeurMax));
  return g;
}

/**
 * Bâtiment (le lien accessible). `ctx` : { telephone, aller, bulle } ; `i` : rang du besoin.
 * Ordinateur : clic, Entrée, Espace ouvrent la cible. Téléphone : le premier toucher montre la bulle, le second ouvre la cible (Entrée et Espace ouvrent toujours).
 */
function batiment(besoin, place, i, ctx) {
  const g = el('g', { class: 'village-batiment', tabindex: 0, role: 'link', 'data-role': 'batiment', 'data-batiment': besoin.batiment, 'data-cible': besoin.cible, 'data-parcelle': place.nom });
  g.setAttribute('aria-label', besoin.phrase ? `${besoin.nom} : ${besoin.phrase}` : besoin.nom);
  const titre = el('title');
  titre.textContent = besoin.phrase ? `${besoin.nom} : ${besoin.phrase}` : besoin.nom;
  g.append(titre);
  g.append(el('ellipse', { class: 'village-halo', cx: r1(place.x), cy: r1(place.y - 40), rx: 96, ry: 84, fill: 'url(#village-halo)' }));
  const lever = el('g', { class: 'village-lever' });
  for (const f of dessinBatiment(besoin.batiment)) lever.append(forme(f, place.x, place.y));
  g.append(lever);
  g.addEventListener('click', () => toucher(i, besoin, ctx));
  g.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    ctx.aller(besoin.cible);
  });
  // Survol et focus : seulement sur ordinateur (sur téléphone, un toucher déclenche aussi le survol et le focus : la bulle y suit les touchers).
  g.addEventListener('mouseenter', () => { if (!ctx.telephone) ctx.bulle.montrer(i); });
  g.addEventListener('mouseleave', () => { if (!ctx.telephone) ctx.bulle.cacher(i); });
  g.addEventListener('focus', () => { if (!ctx.telephone) ctx.bulle.montrer(i); });
  g.addEventListener('blur', () => { if (!ctx.telephone) ctx.bulle.cacher(i); });
  return g;
}
/** Clic ou toucher : sur téléphone, la bulle d'abord ; sinon (ou si la bulle de ce bâtiment est déjà ouverte) la cible. */
function toucher(i, besoin, ctx) {
  if (ctx.telephone && !ctx.bulle.ouverte(i)) { ctx.bulle.montrer(i); return; }
  ctx.aller(besoin.cible);
}

/** L'étiquette d'un bâtiment, dessinée après tout le reste (un toit voisin ne la cache jamais). Même effet que le bâtiment ; le lien accessible reste le bâtiment. */
function lienEtiquette(besoin, place, i, b, ctx) {
  const g = el('g', { class: 'village-lien-etiquette', 'aria-hidden': 'true', 'data-role': 'etiquette', 'data-parcelle': place.nom, 'data-cible': besoin.cible });
  g.append(etiquette(besoin, place.x, place.y + ETIQUETTE_Y, ctx.telephone));
  g.addEventListener('click', () => toucher(i, besoin, ctx));
  g.addEventListener('mouseenter', () => { b.classList.add('survol'); if (!ctx.telephone) ctx.bulle.montrer(i); });
  g.addEventListener('mouseleave', () => { b.classList.remove('survol'); if (!ctx.telephone) ctx.bulle.cacher(i); });
  for (const [ev, oui] of [['mouseenter', true], ['mouseleave', false], ['focus', true], ['blur', false]]) b.addEventListener(ev, () => g.classList.toggle('actif', oui));
  return g;
}

function dessiner(besoins, ctx) {
  const { parcelles, vue } = planVillage(besoins.length);
  const svg = el('svg', {
    class: 'village-scene', viewBox: `${r1(vue.x)} ${r1(vue.y)} ${r1(vue.largeur)} ${r1(vue.hauteur)}`, preserveAspectRatio: 'xMidYMid meet',
    role: 'group', 'aria-label': 'Accueil : choisis ce que tu veux faire', 'data-role': 'village', 'data-disposition': ctx.telephone ? 'terrain-telephone' : 'terrain',
  });
  const defs = el('defs');
  const halo = el('radialGradient', { id: 'village-halo', cx: 0.5, cy: 0.5, r: 0.5 });
  halo.append(el('stop', { offset: 0, 'stop-color': '#FFF3B0', 'stop-opacity': 0.95 }), el('stop', { offset: 1, 'stop-color': '#FFF3B0', 'stop-opacity': 0 }));
  defs.append(halo);
  svg.append(defs);

  // 1. Le terrain et ses sentiers en croix, puis le sol de chaque parcelle (à plat).
  const terrain = el('g', { class: 'village-terrain', 'aria-hidden': 'true' });
  for (const f of formesTerrain()) terrain.append(forme(f));
  svg.append(terrain);
  const decors = parcelles.map((p) => ({ p, d: decorParcelle(p) }));
  for (const { p, d } of decors) {
    const g = el('g', { class: 'village-parcelle', 'data-role': 'parcelle', 'data-parcelle': p.nom, 'data-occupee': p.occupee ? 'oui' : 'non', 'aria-hidden': 'true' });
    if (!p.occupee) g.setAttribute('data-decor', p.decor);
    for (const f of d.sol) g.append(forme(f));
    svg.append(g);
  }
  // 2. Ce qui est debout (arbres et bâtiments), du fond vers l'avant (ordre du peintre).
  const debout = [];
  for (const { p, d } of decors) {
    for (const o of d.objets) {
      debout.push({ profondeur: o.profondeur, noeud: () => { const g = el('g', { class: 'village-decor', 'aria-hidden': 'true', 'data-parcelle': p.nom }); for (const f of o.formes) g.append(forme(f)); return g; } });
    }
  }
  const occupees = parcelles.filter((p) => p.occupee);
  const noeuds = occupees.map((p, i) => batiment(besoins[i], p, i, ctx));
  occupees.forEach((p, i) => debout.push({ profondeur: p.gx + p.gy + 0.01, noeud: () => noeuds[i] }));
  debout.sort((u, v) => u.profondeur - v.profondeur);
  for (const o of debout) svg.append(o.noeud());
  // 3. Les étiquettes, devant tout, dans l'ordre des parcelles.
  const calque = el('g', { class: 'village-etiquettes' });
  occupees.forEach((p, i) => calque.append(lienEtiquette(besoins[i], p, i, noeuds[i], ctx)));
  svg.append(calque);
  return { svg, noeuds };
}

/**
 * La bulle (HTML, au-dessus du dessin) : nom, phrase, pastille du compteur (si lu), « Cliquez pour entrer » (« Touchez encore pour entrer » sur téléphone).
 * `compteurs[i]` : nombre lu pour le besoin i (undefined = pas encore lu ou pas de compteur ; null = illisible).
 */
function creerBulle(cadre, besoins, compteurs) {
  const bulle = document.createElement('div');
  bulle.className = 'village-bulle';
  bulle.dataset.role = 'bulle';
  bulle.setAttribute('aria-hidden', 'true'); // le lien accessible (aria-label) porte déjà le nom et la phrase
  bulle.hidden = true;
  let rang = null;
  let noeuds = [];
  let telephone = false;
  function remplir() {
    const b = besoins[rang];
    const nom = document.createElement('b');
    nom.dataset.role = 'bulle-nom';
    nom.textContent = b.nom;
    const enfants = [nom];
    if (b.phrase) {
      const phrase = document.createElement('em');
      phrase.dataset.role = 'bulle-phrase';
      phrase.textContent = b.phrase;
      enfants.push(phrase);
    }
    const texte = b.compteur ? textePastille(b.compteur, compteurs[rang]) : null;
    if (texte) {
      const pastille = document.createElement('span');
      pastille.dataset.role = 'bulle-pastille';
      pastille.className = compteurs[rang] === 0 ? 'village-pastille-zero' : '';
      pastille.textContent = texte;
      enfants.push(pastille);
    }
    const aide = document.createElement('small');
    aide.textContent = telephone ? 'Touchez encore pour entrer' : 'Cliquez pour entrer';
    enfants.push(aide);
    bulle.replaceChildren(...enfants);
    bulle.dataset.parcelle = noeuds[rang].getAttribute('data-parcelle');
  }
  function placer() {
    const cible = noeuds[rang].querySelector('.village-lever').getBoundingClientRect();
    const boite = cadre.getBoundingClientRect();
    const demi = bulle.offsetWidth / 2;
    let x = cible.left + cible.width / 2 - boite.left;
    x = Math.max(demi + 6, Math.min(boite.width - demi - 6, x));
    let y = cible.top - boite.top - 6;
    if (y < bulle.offsetHeight + 8) y = bulle.offsetHeight + 8;
    bulle.style.left = `${Math.round(x)}px`;
    bulle.style.top = `${Math.round(y)}px`;
  }
  return {
    element: bulle,
    brancher(n, tel) { noeuds = n; telephone = tel; rang = null; bulle.hidden = true; },
    montrer(i) { rang = i; remplir(); bulle.hidden = false; placer(); },
    cacher(i) { if (i === undefined || i === rang) { rang = null; bulle.hidden = true; } },
    ouverte: (i) => rang === i && !bulle.hidden,
    /** Un compteur vient d'être lu : la bulle ouverte sur ce besoin se met à jour. */
    rafraichir(i) { if (rang === i && !bulle.hidden) { remplir(); placer(); } },
  };
}

/**
 * Monte le village dans `conteneur`. `besoins` : 1 à 4 besoins vérifiés ; `aller(cible)` : ouvre une route (« #/… »).
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
  const compteurs = besoins.map(() => undefined);
  const bulle = creerBulle(cadre, besoins, compteurs);
  const media = typeof window.matchMedia === 'function' ? window.matchMedia(TELEPHONE) : null;
  const rendre = () => {
    const telephone = Boolean(media?.matches);
    const { svg, noeuds } = dessiner(besoins, { telephone, aller, bulle });
    bulle.brancher(noeuds, telephone);
    cadre.replaceChildren(svg, bulle.element);
  };
  rendre();
  // Téléphone : un toucher hors des bâtiments referme la bulle.
  const fermer = (e) => { if (!e.target.closest?.('.village-batiment, .village-lien-etiquette')) bulle.cacher(); };
  cadre.addEventListener('click', fermer);
  let monte = true;
  besoins.forEach((b, i) => {
    if (!b.compteur) return;
    lireCompteur(b.compteur).catch(() => null).then((n) => {
      if (!monte) return;
      compteurs[i] = n;
      bulle.rafraichir(i);
    });
  });
  media?.addEventListener?.('change', rendre);
  return () => { monte = false; media?.removeEventListener?.('change', rendre); };
}
