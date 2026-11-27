// Écran d'accueil « village » d'une maison (26/11/2026) : un terrain isométrique, un bâtiment par besoin, rien d'autre (ni journal, ni carrés).
// Étape 2 de docs/accueil-village.md (27/11/2026) : le terrain est un DAMIER de 8 x 8 cases (js/os/village-damier.js) que CHAQUE utilisateur range :
//  - les besoins arrivent déjà vérifiés (js/os/maison-village.js, 12 au plus) et filtrés sur les modules allumés pour ce compte (js/main.js) ;
//  - le rangement de l'utilisateur (une place, un nom à lui, caché ou non, par maison) est lu UNE fois à l'ouverture (js/os/village-donnees.js) ;
//    sans rangement lu (pas de données, lecture refusée ou en panne) : le village d'office, sans glisser ni double clic ;
//  - une grande maison occupe 2 x 2 cases ; au premier rangement, les maisons prennent les places d'office (D10) ;
//  - gestes (js/os/village-glisser.js) : glisser une maison sur des cases libres (souris ou doigt) ; double clic (ordinateur) ou appui long (téléphone) : ses réglages ;
//  - le décor (arbres, fleurs) n'est posé que sur des cases libres ; il n'est ni cliquable ni atteignable au clavier (aria-hidden).
// Sous chaque bâtiment, une étiquette permanente : le nom seul. Au survol ou au focus clavier, une BULLE (carte blanche avec une petite flèche) : le nom, la phrase,
// la pastille du compteur s'il y en a un (js/os/village-compteurs.js ; « Compte en cours » pendant la lecture, illisible = pas de pastille) et « Cliquez pour entrer ».
// Aucun `title` ni <title> SVG (infobulle grise du navigateur en double avec la bulle) : le nom accessible est l'aria-label du bâtiment. Textes par textContent, jamais innerHTML.
// Ordinateur : un clic (après 280 ms quand le rangement est possible), Entrée ou Espace sur un bâtiment ouvre sa cible (une route interne « #/… »).
// Téléphone (moins de 768 px) : le dessin fait 160 % de la largeur de l'écran et glisse au doigt ; un premier toucher montre la bulle, un second ouvre la cible ;
// un bouton « Liste » montre les mêmes maisons en liste de liens (js/os/village-liste.js).
// Étape 1 de docs/accueil-village.md (27/11/2026) : hors du terrain (HTML, pas dans le SVG), une roue dentée en haut à droite (js/os/village-reglages.js :
// réglages de l'ACCUEIL seulement), et deux îlots fixes dans les coins bas : la Mairie (bas gauche, toujours ; ouvre la page Réglages) et la
// Console (bas droite, seulement si `console` est vrai, c'est-à-dire si la Console est dans les modules de la session : titulaire seul). Un îlot est un vrai lien
// (Tab, Entrée) ; sur téléphone, un seul toucher l'ouvre (nom et sous-titre déjà écrits dessous, pas de bulle). Les îlots n'ont ni data-role="batiment", ni
// data-maison : ils ne comptent pas parmi les besoins, ne se déplacent pas et ne se cachent pas.
import { dessinBatiment, pastilleBulle, ETIQUETTE_Y } from './maison-village.js';
import { lireCompteur } from './village-compteurs.js';
import { BATIMENTS_FIXES, dessinBatimentFixe, iso } from './village-batiments.js';
import { boutonReglagesAccueil, animationsCoupees, fenetreMaison } from './village-reglages.js';
import {
  DAMIER_DEPART, TAILLE_GRANDE, centreBloc, vueVillage, formesDamier, lignesDamier, losangeBloc, decorLibre, occupation, blocLibre, premierBlocLibre,
  lireBatiments, rangerVillage, docDeplacement, docCacher, docRenommer,
} from './village-damier.js';
import { brancherGestes } from './village-glisser.js';
import { listeMaisons, boutonVue, vueChoisie } from './village-liste.js';
import { lien } from './router.js';
import { toast } from './ui.js';
import { texteOr } from './village-jeu-regles.js';
import { dessinPiece } from './village-fete.js';

const NS = 'http://www.w3.org/2000/svg';
const TELEPHONE = '(max-width: 767px)';
// Tailles des étiquettes en unités du dessin (le dessin est agrandi d'environ 1,8 fois sur un écran d'ordinateur 1440 x 900 ; sur un téléphone de 390 px,
// il fait 160 % de la largeur de l'écran, soit environ 0,95 fois).
const ORDI = Object.freeze({ nom: 11.5, hauteur: 19, rx: 7, largeurMax: 140, carNom: 0.62, marge: 14 });
const TEL = Object.freeze({ nom: 15, hauteur: 24, rx: 9, largeurMax: 140, carNom: 0.62, marge: 14 });

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

/** Le besoin tel que l'utilisateur le voit : son nom choisi à la place du nom d'origine. */
const besoinVu = (maison) => ({ ...maison.besoin, nom: maison.nom });

/**
 * Bâtiment (le lien accessible). `ctx` : { telephone, aller, bulle, gestes } ; `place` : { x, y } à l'écran.
 * Ordinateur : clic, Entrée, Espace ouvrent la cible. Téléphone : le premier toucher montre la bulle, le second ouvre la cible (Entrée et Espace ouvrent toujours).
 * Avec le rangement (ctx.gestes), le clic passe par js/os/village-glisser.js (délai, double clic, glisser) : l'écoute du clic ci-dessous ne le reçoit plus.
 */
function batiment(maison, place, ctx) {
  const besoin = besoinVu(maison);
  const g = el('g', { class: 'village-batiment', tabindex: 0, role: 'link', 'data-role': 'batiment', 'data-batiment': besoin.batiment, 'data-cible': besoin.cible, 'data-maison': maison.id, 'data-case': `${maison.c}-${maison.l}` });
  g.setAttribute('aria-label', besoin.phrase ? `${besoin.nom} : ${besoin.phrase}` : besoin.nom); // pas de <title> : il ferait une infobulle grise en plus de la bulle
  g.append(el('ellipse', { class: 'village-halo', cx: r1(place.x), cy: r1(place.y - 40), rx: 96, ry: 84, fill: 'url(#village-halo)' }));
  const lever = el('g', { class: 'village-lever' });
  for (const f of dessinBatiment(besoin.batiment)) lever.append(forme(f, place.x, place.y));
  g.append(lever);
  g.addEventListener('click', () => toucher(maison, ctx));
  g.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    ctx.aller(besoin.cible);
  });
  // Survol et focus : seulement sur ordinateur (sur téléphone, un toucher déclenche aussi le survol et le focus : la bulle y suit les touchers).
  g.addEventListener('mouseenter', () => { if (!ctx.telephone && !ctx.rangementEnCours()) ctx.bulle.montrer(maison); });
  g.addEventListener('mouseleave', () => { if (!ctx.telephone) ctx.bulle.cacher(maison.id); });
  g.addEventListener('focus', () => { if (!ctx.telephone) ctx.bulle.montrer(maison); });
  g.addEventListener('blur', () => { if (!ctx.telephone) ctx.bulle.cacher(maison.id); });
  return g;
}
/** Clic ou toucher : sur téléphone, la bulle d'abord ; sinon (ou si la bulle de ce bâtiment est déjà ouverte) la cible. */
function toucher(maison, ctx) {
  if (ctx.telephone && !ctx.bulle.ouverte(maison.id)) { ctx.bulle.montrer(maison); return; }
  ctx.aller(maison.besoin.cible);
}

/** L'étiquette d'un bâtiment, dessinée après tout le reste (un toit voisin ne la cache jamais). Même effet que le bâtiment ; le lien accessible reste le bâtiment. */
function lienEtiquette(maison, place, b, ctx) {
  const g = el('g', { class: 'village-lien-etiquette', 'aria-hidden': 'true', 'data-role': 'etiquette', 'data-maison': maison.id, 'data-case': `${maison.c}-${maison.l}`, 'data-cible': maison.besoin.cible });
  g.append(etiquette(besoinVu(maison), place.x, place.y + ETIQUETTE_Y, ctx.telephone));
  g.addEventListener('click', () => toucher(maison, ctx));
  g.addEventListener('mouseenter', () => { b.classList.add('survol'); if (!ctx.telephone && !ctx.rangementEnCours()) ctx.bulle.montrer(maison); });
  g.addEventListener('mouseleave', () => { b.classList.remove('survol'); if (!ctx.telephone) ctx.bulle.cacher(maison.id); });
  for (const [ev, oui] of [['mouseenter', true], ['mouseleave', false], ['focus', true], ['blur', false]]) b.addEventListener(ev, () => g.classList.toggle('actif', oui));
  return g;
}

function dessiner(maisons, ctx) {
  const damier = DAMIER_DEPART;
  const vue = vueVillage(damier);
  const svg = el('svg', {
    class: 'village-scene', viewBox: `${r1(vue.x)} ${r1(vue.y)} ${r1(vue.largeur)} ${r1(vue.hauteur)}`, preserveAspectRatio: 'xMidYMid meet',
    role: 'group', 'aria-label': 'Accueil : choisis ce que tu veux faire', 'data-role': 'village', 'data-disposition': ctx.telephone ? 'terrain-telephone' : 'terrain',
  });
  const defs = el('defs');
  const halo = el('radialGradient', { id: 'village-halo', cx: 0.5, cy: 0.5, r: 0.5 });
  halo.append(el('stop', { offset: 0, 'stop-color': '#FFF3B0', 'stop-opacity': 0.95 }), el('stop', { offset: 1, 'stop-color': '#FFF3B0', 'stop-opacity': 0 }));
  defs.append(halo);
  svg.append(defs);

  // 1. Le terrain (tranche et herbe), le quadrillage (visible seulement pendant le rangement), puis la place pavée de chaque maison (à plat).
  const terrain = el('g', { class: 'village-terrain', 'aria-hidden': 'true' });
  for (const f of formesDamier(damier)) terrain.append(forme(f));
  svg.append(terrain);
  const quadrillage = el('g', { class: 'village-damier', 'data-role': 'damier', 'data-colonnes': damier.colonnes, 'data-lignes': damier.lignes, 'aria-hidden': 'true' });
  for (const f of lignesDamier(damier)) quadrillage.append(forme(f));
  svg.append(quadrillage);
  for (const m of maisons) {
    const sol = el('g', { class: 'village-sol', 'aria-hidden': 'true', 'data-maison': m.id });
    sol.append(el('polygon', { points: points(losangeBloc(m.c, m.l, m.taille, damier, 0.35), 0, 0), fill: '#EFD9AE' }));
    svg.append(sol);
  }
  // 2. Ce qui est debout (décor des cases libres et bâtiments), du fond vers l'avant (ordre du peintre).
  const debout = [];
  for (const o of decorLibre(occupation(maisons), damier)) {
    debout.push({ profondeur: o.profondeur, noeud: () => { const g = el('g', { class: 'village-decor', 'data-role': 'decor', 'data-case': o.case, 'aria-hidden': 'true' }); for (const f of o.formes) g.append(forme(f)); return g; } });
  }
  const places = new Map(maisons.map((m) => { const [x, y] = iso(...centreBloc(m.c, m.l, m.taille, damier)); return [m.id, { x, y }]; }));
  const noeuds = new Map(maisons.map((m) => [m.id, batiment(m, places.get(m.id), ctx)]));
  for (const m of maisons) {
    const [gx, gy] = centreBloc(m.c, m.l, m.taille, damier);
    debout.push({ profondeur: gx + gy + 0.01, noeud: () => noeuds.get(m.id) });
  }
  debout.sort((u, v) => u.profondeur - v.profondeur);
  for (const o of debout) svg.append(o.noeud());
  // 3. Les étiquettes, devant tout, dans l'ordre des besoins.
  const calque = el('g', { class: 'village-etiquettes' });
  for (const m of maisons) calque.append(lienEtiquette(m, places.get(m.id), noeuds.get(m.id), ctx));
  svg.append(calque);
  return { svg, noeuds };
}

/**
 * La bulle (HTML, au-dessus du dessin) : nom, phrase, pastille du compteur (si lu), « Cliquez pour entrer » (« Touchez encore pour entrer » sur téléphone).
 * `compteurs` : Map(id de maison → nombre lu) ; absent = lecture en cours, ou pas de compteur ; null = illisible ou trop lent. Le nombre reste connu pour les survols suivants.
 */
function creerBulle(cadre, compteurs) {
  const bulle = document.createElement('div');
  bulle.className = 'village-bulle';
  bulle.dataset.role = 'bulle';
  bulle.setAttribute('aria-hidden', 'true'); // le lien accessible (aria-label) porte déjà le nom et la phrase
  bulle.hidden = true;
  let maison = null;
  let noeuds = new Map();
  let telephone = false;
  function remplir() {
    const b = besoinVu(maison);
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
    const etat = b.compteur ? pastilleBulle(b.compteur, compteurs.get(maison.id)) : null;
    if (etat) {
      const pastille = document.createElement('span');
      pastille.dataset.role = etat.attente ? 'bulle-attente' : 'bulle-pastille';
      pastille.className = etat.attente ? 'village-pastille-attente' : (etat.zero ? 'village-pastille-zero' : '');
      pastille.textContent = etat.texte;
      enfants.push(pastille);
    }
    const aide = document.createElement('small');
    aide.textContent = telephone ? 'Touchez encore pour entrer' : 'Cliquez pour entrer';
    enfants.push(aide);
    bulle.replaceChildren(...enfants);
    bulle.dataset.maison = maison.id;
  }
  function placer() {
    const cible = noeuds.get(maison.id)?.querySelector('.village-lever')?.getBoundingClientRect();
    if (!cible) return;
    const boite = cadre.getBoundingClientRect();
    const demi = bulle.offsetWidth / 2;
    let x = cible.left + cible.width / 2 - boite.left;
    x = Math.max(demi + 6, Math.min(boite.width - demi - 6, x));
    let y = cible.top - boite.top - 6;
    if (y < bulle.offsetHeight + 8) y = bulle.offsetHeight + 8;
    bulle.style.left = `${Math.round(x)}px`;
    bulle.style.top = `${Math.round(y)}px`;
  }
  const ouverte = (id) => maison?.id === id && !bulle.hidden;
  return {
    element: bulle,
    brancher(n, tel) { noeuds = n; telephone = tel; maison = null; bulle.hidden = true; },
    montrer(m) { maison = m; remplir(); bulle.hidden = false; placer(); },
    cacher(id) { if (id === undefined || id === maison?.id) { maison = null; bulle.hidden = true; } },
    ouverte,
    /** Un compteur vient d'être lu : la bulle ouverte sur cette maison se met à jour. */
    rafraichir(id) { if (ouverte(id)) { remplir(); placer(); } },
  };
}

/** Petite vignette d'un bâtiment (roue dentée, vue Liste) : décorative (aria-hidden). */
function vignette(formes) {
  const svg = el('svg', { viewBox: '-100 -150 200 200', 'aria-hidden': 'true', focusable: 'false', class: 'village-vignette' });
  for (const f of formes) svg.append(forme(f));
  return svg;
}

/** Sous-titre court écrit sous le nom d'un îlot. */
const SOUS_TITRE_ILOT = Object.freeze({ 'mairie-reglages': 'Réglages', console: 'Espaces' });

/** Îlot d'un bâtiment fixe (Mairie, Console) : un lien HTML avec un petit dessin (herbe, place pavée, bâtiment), le nom et un sous-titre. */
function ilot(id, route) {
  const fixe = BATIMENTS_FIXES[id];
  const a = document.createElement('a');
  a.className = 'village-ilot';
  a.dataset.role = 'batiment-fixe';
  a.dataset.batimentFixe = id;
  a.href = lien(route);
  a.setAttribute('aria-label', `${fixe.nom} : ${fixe.phrase}`);
  const svg = el('svg', { viewBox: '-90 -100 180 152', 'aria-hidden': 'true', focusable: 'false' });
  svg.append(
    el('polygon', { points: '-80,0 0,40 0,48 -80,8', fill: '#8A6A45' }),
    el('polygon', { points: '0,40 80,0 80,8 0,48', fill: '#6F5436' }),
    el('polygon', { points: '0,-40 80,0 0,40 -80,0', fill: '#A9C46E' }),
    el('polygon', { points: '0,-26 52,0 0,26 -52,0', fill: '#EFD9AE' }),
  );
  const lever = el('g', { class: 'village-lever' });
  for (const f of dessinBatimentFixe(id)) lever.append(forme(f));
  svg.append(lever);
  const nom = document.createElement('span');
  nom.className = 'village-ilot-nom';
  nom.dataset.role = 'batiment-fixe-nom';
  nom.textContent = fixe.nom;
  const sous = document.createElement('small');
  sous.textContent = SOUS_TITRE_ILOT[id];
  a.append(svg, nom, sous);
  return a;
}

/**
 * Monte le village dans `conteneur`. `besoins` : 1 à 12 besoins vérifiés et servis ; `aller(cible)` : ouvre une route (« #/… ») ;
 * `console` : vrai si la Console est dans les modules de la session (titulaire seul) : l'îlot Console est alors posé en bas à droite ;
 * `donnees` : la couche de données du rangement (js/os/village-donnees.js : { lire, enregistrer, retirer }), ou null (village d'office, sans rangement).
 * `or` : { lire, suivre } (js/os/village-or.js : lireOr, surOr), ou null : le compteur de pièces d'or en haut à gauche, posé seulement quand le solde est lu (illisible : rien,
 *   jamais un « 0 » inventé), puis mis à jour après chaque gain.
 * Rend la fonction qui démonte l'écran (arrête l'écoute du format téléphone / ordinateur et les gestes).
 */
export function monterVillage(conteneur, besoins, { aller, console: avecConsole = false, donnees = null, or = null }) {
  const page = document.createElement('section');
  page.className = 'page-village';
  page.dataset.role = 'page-village';
  page.dataset.rangement = 'non';
  page.dataset.vue = 'village';
  const majAnimations = () => { page.dataset.animations = animationsCoupees() ? 'non' : 'oui'; };
  majAnimations();
  const titre = document.createElement('h1');
  titre.className = 'sr-only';
  titre.textContent = 'Accueil';
  const cadre = document.createElement('div');
  cadre.className = 'village-cadre';
  const defile = document.createElement('div');
  defile.className = 'village-defile';
  const phrase = document.createElement('p');
  phrase.className = 'village-phrase';
  phrase.dataset.role = 'village-phrase';
  const bandeau = document.createElement('div');
  bandeau.className = 'village-bandeau';
  bandeau.dataset.role = 'village-bandeau';
  bandeau.setAttribute('role', 'alert');
  const zoneListe = document.createElement('div');
  zoneListe.className = 'village-zone-liste';
  page.append(titre, cadre);
  conteneur.append(page);
  const compteurs = new Map();
  const bulle = creerBulle(cadre, compteurs);
  const media = typeof window.matchMedia === 'function' ? window.matchMedia(TELEPHONE) : null;
  const damier = DAMIER_DEPART;

  // État : `lecture` = 'attente' | 'ok' | 'refus' | 'erreur' | 'sans' (pas de données) ; `batiments` : Map(id → document) ; `rangement` : résultat de rangerVillage.
  let lecture = donnees ? 'attente' : 'sans';
  let batiments = new Map(); // ce que l'écran montre : la base confirmée + les écritures optimistes encore en route
  let confirmes = new Map(); // ce que la base a confirmé (lecture, puis chaque écriture réussie)
  let enRoute = []; // écritures optimistes pas encore confirmées, dans l'ordre : [{ liste }]
  let ignores = new Set(); // documents mal formés, ignorés à la lecture : jamais réécrits d'office (seul un geste sur la maison les remplace)
  let file = Promise.resolve(); // les écritures partent une à une, dans l'ordre des gestes
  let rangement = { maisons: [], cachees: [], sansPlace: [] };
  let monte = true;
  let debrancher = null;
  let premierRendu = true;
  const rangementPossible = () => lecture === 'ok';
  const ranger = () => { rangement = rangerVillage({ besoins, batiments, damier }); };
  const maisonsVisibles = () => (lecture === 'attente' ? [] : rangement.maisons);

  // Une seule lecture par compteur et par affichage du village, lancée dès que la maison est montrée (jamais au survol) ; la bulle ouverte se met à jour quand le nombre arrive.
  const lances = new Set();
  function lancerCompteurs() {
    for (const m of maisonsVisibles()) {
      const b = m.besoin;
      if (!b.compteur || lances.has(m.id)) continue;
      lances.add(m.id);
      lireCompteur(b.compteur).catch(() => null).then((n) => {
        if (!monte) return;
        compteurs.set(m.id, n);
        bulle.rafraichir(m.id);
        if (page.dataset.vue === 'liste') rendre();
      });
    }
  }

  /** Ce que l'écran montre : la base confirmée, puis les écritures optimistes encore en route, dans l'ordre. */
  const recalculer = () => {
    const vue = new Map(confirmes);
    for (const { liste } of enRoute) for (const { id, donnees: d } of liste) vue.set(id, d);
    batiments = vue;
  };

  /**
   * Écrit des maisons (une seule écriture groupée) : `modifs` = [{ id, donnees }]. Les maisons visibles dont la place n'est pas encore enregistrée sont écrites
   * en même temps à leur place (D10 : plus rien ne bouge tout seul ensuite), sauf celles dont le document a été ignoré (mal formé). `optimiste` : l'écran change
   * d'abord, et revient en arrière si l'écriture échoue. Les écritures partent une à une (file) : deux gestes rapprochés ne désaccordent jamais l'écran et la base.
   */
  function appliquer(modifs, { optimiste = false } = {}) {
    if (!rangementPossible()) return Promise.resolve(false);
    const touchees = new Set(modifs.map((m) => m.id));
    const liste = [...modifs];
    for (const m of rangement.maisons) if (!m.enregistree && !touchees.has(m.id) && !ignores.has(m.id)) liste.push({ id: m.id, donnees: docDeplacement(m, m.c, m.l) });
    const envoi = { liste };
    if (optimiste) { enRoute.push(envoi); recalculer(); ranger(); rendre(); }
    // Limite connue : si une écriture échoue alors qu'une autre attend derrière, la base peut garder deux maisons sur la même case (la seconde a été
    // calculée avec la place de la première). Sans danger : rangerVillage replace la seconde d'office à la lecture, et le prochain geste la réécrit.
    const resultat = file.then(() => donnees.enregistrer(liste)).catch(() => false);
    file = resultat;
    return resultat.then((ok) => {
      if (optimiste) enRoute = enRoute.filter((e) => e !== envoi);
      if (ok) for (const { id, donnees: d } of liste) { confirmes.set(id, d); ignores.delete(id); }
      if (!monte) return ok;
      recalculer();
      ranger();
      // succès d'une écriture optimiste : l'écran la montre déjà, pas de redessin (il couperait un glisser en cours)
      if (!(ok && optimiste)) { rendre(); lancerCompteurs(); }
      return ok;
    });
  }

  /** Remet une maison cachée (ou hors du départ) dans le village : à sa place enregistrée si elle est libre, sinon au premier bloc libre. */
  async function montrer(entree) {
    const prises = occupation(rangement.maisons);
    const { c, l } = entree.donnees;
    const place = Number.isInteger(c) && Number.isInteger(l) && blocLibre(prises, c, l, TAILLE_GRANDE, damier) ? { c, l } : premierBlocLibre(prises, TAILLE_GRANDE, damier);
    if (!place) return false;
    return appliquer([{ id: entree.id, donnees: { ...entree.donnees, sorte: 'besoin', cache: false, c: place.c, l: place.l } }]);
  }

  const etatRoue = () => {
    if (!rangementPossible()) return null;
    return {
      cachees: rangement.cachees,
      plein: !premierBlocLibre(occupation(rangement.maisons), TAILLE_GRANDE, damier),
      telephone: Boolean(media?.matches),
      dessin: (nom) => vignette(dessinBatiment(nom)),
      surAfficher: (entree) => montrer(entree),
    };
  };

  function reglagesMaison(maison) {
    bulle.cacher();
    const placee = { ...maison, donnees: docDeplacement(maison, maison.c, maison.l) };
    fenetreMaison(maison, {
      surRenommer: (nom) => appliquer([{ id: maison.id, donnees: docRenommer(placee, nom) }]),
      surCacher: () => appliquer([{ id: maison.id, donnees: docCacher(placee, true) }]),
      surMontrer: () => {
        const entree = rangement.cachees.find((e) => e.id === maison.id);
        return entree ? montrer(entree) : Promise.resolve(true);
      },
    });
  }

  async function deposer(maison, c, l) {
    const ok = await appliquer([{ id: maison.id, donnees: docDeplacement(maison, c, l) }], { optimiste: true });
    if (!ok && monte) toast('Le déplacement n’a pas été enregistré. Réessaie.', { type: 'erreur' });
  }

  // Hors du dessin et gardés à chaque redessin (passage téléphone / ordinateur) : la roue dentée, la Mairie, la Console (titulaire seul).
  const fixes = [boutonReglagesAccueil({ surChangement: majAnimations, maisons: etatRoue }), ilot('mairie-reglages', 'reglages')];
  if (avecConsole) fixes.push(ilot('console', 'console/vue'));
  const routesFixes = [{ id: 'mairie-reglages', route: 'reglages' }, ...(avecConsole ? [{ id: 'console', route: 'console/vue' }] : [])];

  const ctxCommun = { aller, bulle, rangementEnCours: () => page.dataset.rangement === 'oui' };
  const rendre = () => {
    const telephone = Boolean(media?.matches);
    debrancher?.();
    debrancher = null;
    const maisons = maisonsVisibles();
    const ctx = { ...ctxCommun, telephone };
    const { svg, noeuds } = dessiner(maisons, ctx);
    bulle.brancher(noeuds, telephone);
    defile.replaceChildren(svg);
    // phrase d'aide (cas vides) et bandeau (panne de lecture)
    const texte = lecture === 'attente' ? '' : !maisons.length ? 'Affiche tes maisons avec la roue dentée.' : (lecture === 'ok' && !batiments.size ? 'Glisse les maisons pour ranger ton village.' : '');
    phrase.textContent = texte;
    phrase.hidden = !texte;
    if (lecture === 'erreur') {
      const message = document.createElement('span');
      message.textContent = 'Ton rangement n’a pas pu être lu. Réessaie.';
      const reessayer = document.createElement('button');
      reessayer.type = 'button';
      reessayer.className = 'bouton bouton-secondaire';
      reessayer.dataset.role = 'reessayer-village';
      reessayer.textContent = 'Réessayer';
      reessayer.addEventListener('click', () => { lire(); });
      bandeau.replaceChildren(message, reessayer);
      bandeau.hidden = false;
    } else {
      bandeau.replaceChildren();
      bandeau.hidden = true;
    }
    // vue « Liste » (téléphone seulement)
    const vue = telephone ? vueChoisie() : 'village';
    page.dataset.vue = vue;
    const enfants = [defile, bulle.element, ...fixes, ...(compteurOr ? [compteurOr] : []), phrase, bandeau];
    if (telephone) {
      enfants.push(boutonVue(vue, () => rendre()));
      zoneListe.replaceChildren(listeMaisons({ maisons, fixes: routesFixes, compteurs, dessin: (nom) => vignette(dessinBatiment(nom)), dessinFixe: (id) => vignette(dessinBatimentFixe(id)) }));
      zoneListe.hidden = vue !== 'liste';
      enfants.push(zoneListe);
    }
    cadre.replaceChildren(...enfants);
    if (telephone && premierRendu && vue === 'village') defile.scrollLeft = Math.max(0, (defile.scrollWidth - defile.clientWidth) / 2);
    if (lecture !== 'attente') premierRendu = false;
    if (rangementPossible()) {
      debrancher = brancherGestes(svg, {
        maisons, damier, telephone,
        surOuvrir: (m) => toucher(m, ctx),
        surReglages: reglagesMaison,
        surDepose: deposer,
        surDebut: () => { page.dataset.rangement = 'oui'; bulle.cacher(); },
        surFin: () => { page.dataset.rangement = 'non'; },
      });
    }
  };

  async function lire() {
    if (!donnees) { ranger(); rendre(); lancerCompteurs(); return; }
    const r = await donnees.lire();
    if (!monte) return;
    if (r.etat === 'ok') {
      const { parId, avertissements, ignores: malFormes } = lireBatiments(r.docs);
      for (const a of avertissements) console.warn(a);
      confirmes = parId;
      ignores = malFormes;
      lecture = 'ok';
    } else {
      confirmes = new Map();
      ignores = new Set();
      lecture = r.etat === 'refus' ? 'refus' : 'erreur';
    }
    enRoute = [];
    recalculer();
    ranger();
    rendre();
    lancerCompteurs();
  }

  // Compteur de pièces d'or (étape 6a) : hors du dessin, en haut à gauche (jamais sur la roue ni sur les îlots). Posé seulement quand le solde est connu.
  let compteurOr = null;
  let texteCompteur = null;
  const montrerOr = (n) => {
    if (!monte || !Number.isInteger(n)) return;
    if (!compteurOr) {
      compteurOr = document.createElement('div');
      compteurOr.className = 'village-or';
      compteurOr.dataset.role = 'or';
      compteurOr.setAttribute('aria-live', 'polite');
      texteCompteur = document.createElement('span');
      compteurOr.append(dessinPiece(22), texteCompteur);
      page.dataset.or = 'oui';
      if (phrase.parentNode === cadre) cadre.insertBefore(compteurOr, phrase); else cadre.append(compteurOr);
    }
    texteCompteur.textContent = texteOr(n);
  };
  const arretOr = or?.suivre ? or.suivre(montrerOr) : null;

  rendre(); // 1. le terrain tout de suite (vide pendant la lecture)
  lire(); // 2. le rangement, puis les maisons et leurs compteurs
  if (or?.lire) or.lire().then((r) => { if (r?.etat === 'ok') montrerOr(r.or); }).catch(() => {}); // 3. le solde (illisible : pas de compteur)
  // Téléphone : un toucher hors des bâtiments referme la bulle.
  const fermer = (e) => { if (!e.target.closest?.('.village-batiment, .village-lien-etiquette')) bulle.cacher(); };
  cadre.addEventListener('click', fermer);
  media?.addEventListener?.('change', rendre);
  return () => { monte = false; debrancher?.(); arretOr?.(); media?.removeEventListener?.('change', rendre); };
}
