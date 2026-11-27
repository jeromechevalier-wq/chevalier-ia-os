// Dessins du futur jeu du village (27/11/2026) : enclos à cochons (2 états), champ (4 étapes de pousse) et 5 décorations. Sans DOM : listes de formes
// testées seules (tests/village-jeu-dessins.test.js) et planche de recette dans tests/e2e/village-jeu-dessins.spec.js.
// Même règle de dessin que les bâtiments (docs/village-charte.md : angle 2:1, palette, lumière venue de la gauche, une seule ombre, aplats sans contour noir).
// PAS ENCORE BRANCHÉ : aucun écran de l'appli n'importe ce fichier (ce sera l'étape du jeu).

import { iso, poly, teintes } from './village-batiments.js';
import { formesArbre } from './maison-village.js';

// ---------------------------------------------------------------- petites fonctions de dessin
// Copie de js/os/village-batiments.js (non exporté ; fichier gelé pendant la PR Mairie/Console) : à réunir à l'étape du jeu.
/** Pavé droit : coin arrière (gx, gy), largeur w (le long de gx), profondeur d (le long de gy), posé à z0, haut de h. Faces vues : gauche (gy max), droite (gx max), dessus. */
function boite(gx, gy, w, d, z0, h, c) {
  const z1 = z0 + h;
  return [
    poly([[gx, gy + d, z0], [gx + w, gy + d, z0], [gx + w, gy + d, z1], [gx, gy + d, z1]], c.gauche),
    poly([[gx + w, gy, z0], [gx + w, gy + d, z0], [gx + w, gy + d, z1], [gx + w, gy, z1]], c.droite),
    poly([[gx, gy, z1], [gx + w, gy, z1], [gx + w, gy + d, z1], [gx, gy + d, z1]], c.dessus),
  ];
}
const BOIS = teintes('#93674A');
// Fin de la copie.

const OMBRE = '#3b2412';
const ROSE = '#F2A9A0'; // corps des cochons (couleur nouvelle, autorisée par le brief du 27/11/2026)
const ROSE_FONCE = '#E08A84'; // groin, oreille, pattes, queue
const OEIL = '#2A1A2C';
const TERRE_ENCLOS = '#B49A72';
const BOUE = '#7E5432';
const TERRE_CHAMP = '#9C6B43';
const SILLON = '#7E5432';
const VERT_CLAIR = '#93BF6C';
const VERT = '#6FA24A';
const FEUILLAGE = '#7DAA5A';
const BLE = '#F7C548';
const BLE_REFLET = '#E8C98A';

/** Ombre au sol d'un enclos ou d'un champ : un losange qui déborde un peu vers l'avant (dans l'empreinte 4 x 4). */
const ombreSol = () => poly([[-2, -2, 0], [2.4, -2, 0], [2.4, 2.4, 0], [-2, 2.4, 0]], OMBRE, { opacite: 0.14 });
/** Ombre d'une décoration : une petite ellipse, comme sous un arbre (formesArbre). */
const ombreDeco = (rx = 14, ry = 5, dx = 0, dy = 2) => ({ ellipse: [dx, dy, rx, ry], fill: OMBRE, opacite: 0.14 });

// ---------------------------------------------------------------- enclos à cochons

/** Un cochon rose, rond et tranquille, posé au point (gx, gy) du sol (z0) ; k = grosseur (1 ordinaire, 1,4 bien gras) ; sens = 1 regarde à droite, -1 à gauche. */
function cochon(gx, gy, k, sens = 1, z0 = 2) {
  const [x, y] = iso(gx, gy, z0);
  const rx = 10 * k;
  const ry = 6.5 * k;
  const cy = y - 3 - ry * 0.85; // le ventre descend presque jusqu'au sol : pattes courtes
  const r = 5.2 * (1 + (k - 1) * 0.4);
  const hx = x + sens * rx * 0.85;
  const hy = cy - ry * 0.3;
  return [
    { ellipse: [x, y, rx * 1.05, 3 * k], fill: BOUE, opacite: 0.3 }, // petite ombre (couleur de la terre, pas l'ombre du dessin)
    { ligne: [[x - sens * rx * 0.5, y - 4], [x - sens * rx * 0.5, y]], trait: ROSE_FONCE, epaisseur: 2.6 },
    { ligne: [[x + sens * rx * 0.45, y - 4], [x + sens * rx * 0.45, y]], trait: ROSE_FONCE, epaisseur: 2.6 },
    { ligne: [[x - sens * rx * 0.97, cy - 1], [x - sens * (rx + 3), cy - 4.5]], trait: ROSE_FONCE, epaisseur: 1.6 }, // queue
    { ellipse: [x, cy, rx, ry], fill: ROSE },
    { ellipse: [x - sens * rx * 0.25, cy - ry * 0.45, rx * 0.45, ry * 0.3], fill: '#FFFDF6', opacite: 0.35 }, // reflet sur le dos
    { cercle: [hx, hy, r], fill: ROSE },
    { poly: [[hx - sens * 3.2, hy - r * 0.55], [hx - sens * 1.2, hy - r - 3.5], [hx + sens * 1.4, hy - r * 0.75]], fill: ROSE_FONCE }, // oreille
    { ellipse: [hx + sens * r * 0.85, hy + 1, 2.4, 2], fill: ROSE_FONCE }, // groin
    { cercle: [hx + sens * 1.2, hy - 1.6, 1], fill: OEIL },
  ];
}

const lisse = (a, b, z) => ({ ligne: [iso(a[0], a[1], z), iso(b[0], b[1], z)], trait: '#93674A', epaisseur: 2.2 });
const poteau = (gx, gy) => boite(gx - 0.09, gy - 0.09, 0.18, 0.18, 0, 12, BOIS);

/** L'enclos : sol de terre, clôture en bois, une auge et deux cochons (ordinaires, ou bien gras avec l'auge pleine). */
function enclos(gras) {
  const f = [ombreSol(), ...boite(-2, -2, 4, 4, 0, 2, teintes(TERRE_ENCLOS))];
  const [bx, by] = iso(-1.2, -0.4, 2);
  f.push({ ellipse: [bx, by, 15, 6], fill: BOUE }); // flaque de boue
  // clôture du fond (côtés gy = -2 et gx = -2)
  for (const [gx, gy] of [[-2, -2], [0, -2], [2, -2], [-2, 0], [-2, 2]]) f.push(...poteau(gx, gy));
  for (const z of [5, 10]) f.push(lisse([-2, -2], [2, -2], z), lisse([-2, -2], [-2, 2], z));
  // auge au fond, à droite
  f.push(...boite(0.3, -1.75, 1.5, 0.55, 2, 5, BOIS));
  const [ax, ay] = iso(1.05, -1.475, 7);
  f.push(poly([[0.45, -1.62, 7], [1.65, -1.62, 7], [1.65, -1.33, 7], [0.45, -1.33, 7]], gras ? BLE : '#7A5A3E'));
  if (gras) for (const dx of [-8, 0, 8]) f.push({ cercle: [ax + dx, ay - 1.5 + dx / 8, 2.6], fill: BLE_REFLET }); // auge pleine
  // les cochons, du fond vers l'avant
  if (gras) f.push(...cochon(-1.0, 0.6, 1.4, 1), ...cochon(0.9, -0.2, 1.4, -1));
  else f.push(...cochon(-0.8, 0.5, 1, 1), ...cochon(0.8, -0.1, 1, -1));
  // clôture de devant (côtés gy = 2 et gx = 2)
  for (const z of [5, 10]) f.push(lisse([-2, 2], [2, 2], z), lisse([2, -2], [2, 2], z));
  for (const [gx, gy] of [[0, 2], [2, 0], [2, 2]]) f.push(...poteau(gx, gy));
  return f;
}

// ---------------------------------------------------------------- champ en 4 étapes

const RANGS = [-1.5, -0.75, 0, 0.75, 1.5];
const PLANTS = [-1.5, -1, -0.5, 0, 0.5, 1, 1.5];

/** Le champ : même terre et mêmes sillons, puis les plantes de l'étape (0 semé, 1 qui pousse, 2 mûr, 3 prêt à récolter). */
function champ(etape) {
  const f = [ombreSol(), ...boite(-2, -2, 4, 4, 0, 3, teintes(TERRE_CHAMP))];
  const Z = 3;
  for (const r of RANGS) {
    f.push({ ligne: [iso(-1.75, r, Z), iso(1.75, r, Z)], trait: SILLON, epaisseur: 4 });
    if (etape === 0) {
      for (const g of PLANTS) { const [x, y] = iso(g, r, Z); f.push({ cercle: [x, y - 1.5, 1.4], fill: BLE_REFLET }); }
    } else if (etape === 1) {
      for (const g of PLANTS) {
        const [x, y] = iso(g, r, Z);
        f.push({ ligne: [[x, y], [x, y - 5]], trait: VERT_CLAIR, epaisseur: 1.8 }, { cercle: [x - 1.6, y - 6, 2.2], fill: VERT_CLAIR }, { cercle: [x + 1.6, y - 6.5, 2], fill: VERT_CLAIR });
      }
    } else {
      const mur = etape === 2;
      f.push({ ligne: [iso(-1.7, r, Z + 7), iso(1.7, r, Z + 7)], trait: mur ? VERT : BLE, epaisseur: 10 });
      for (const g of PLANTS) {
        const [x, y] = iso(g, r, Z + 14);
        f.push({ cercle: [x, y, 3.6], fill: mur ? FEUILLAGE : BLE }, { cercle: [x - 1.4, y - 1.2, 1.8], fill: mur ? VERT_CLAIR : BLE_REFLET });
      }
    }
  }
  if (etape === 3) {
    // une botte de paille posée devant, liée par un lien de bois
    f.push(...boite(-0.7, 2.1, 1.1, 0.55, 0, 9, teintes(BLE)));
    f.push({ ligne: [iso(-0.15, 2.65, 0.5), iso(-0.15, 2.65, 8.5)], trait: '#93674A', epaisseur: 1.6 });
  }
  return f;
}

// ---------------------------------------------------------------- décorations (petites : carré de -1 à +1 autour du centre)

function arbre() {
  const f = formesArbre(0, 0, 'rond');
  for (const [x, y] of [[-8, -24], [7, -33], [9, -21]]) f.push({ cercle: [x, y, 2.4], fill: '#E4572E' }); // quelques fruits
  return f;
}

function fleurs() {
  const f = [ombreDeco(18, 6)];
  f.push({ ellipse: [-7, -4, 11, 6.5], fill: VERT }, { ellipse: [8, -3, 10, 6], fill: VERT }, { ellipse: [0, -8, 10, 7], fill: FEUILLAGE });
  f.push({ ellipse: [-4, -11, 5, 3], fill: VERT_CLAIR });
  const couleurs = ['#F7C548', '#FFFDF6', '#9A7FC4', '#E4572E', '#9A7FC4', '#FFFDF6', '#F7C548', '#9A7FC4'];
  const places = [[-12, -6], [-6, -11], [1, -13], [7, -9], [13, -5], [-2, -4], [5, -2], [-9, -1]];
  places.forEach(([x, y], k) => f.push({ cercle: [x, y, 2.7], fill: couleurs[k] }));
  return f;
}

function banc() {
  const f = [ombreDeco(20, 6, 0, 3)];
  // pieds du dossier, planche du dossier, assise, pieds de devant
  for (const gx of [-0.85, 0.7]) f.push(...boite(gx, -0.35, 0.14, 0.14, 0, 15, BOIS));
  f.push(...boite(-0.95, -0.36, 1.85, 0.12, 9, 6, BOIS));
  f.push(...boite(-0.95, -0.22, 1.85, 0.5, 6, 2.5, BOIS));
  for (const gx of [-0.85, 0.7]) f.push(...boite(gx, 0.12, 0.14, 0.14, 0, 6, BOIS));
  return f;
}

function cloture() {
  const f = [ombreDeco(22, 6, 0, 2)];
  for (const gx of [-0.9, 0, 0.9]) f.push(...boite(gx - 0.09, -0.09, 0.18, 0.18, 0, 16, BOIS));
  for (const z of [6, 12]) f.push({ ligne: [iso(-1, 0, z), iso(1, 0, z)], trait: '#93674A', epaisseur: 2.4 });
  return f;
}

function brouette() {
  const f = [ombreDeco(20, 6, 0, 3)];
  // manche du fond, pied, cuve bleue avec du sable, manche de devant, roue
  f.push({ ligne: [iso(-0.4, -0.3, 11), iso(-1.0, -0.3, 8)], trait: '#93674A', epaisseur: 2.4 });
  f.push({ ligne: [iso(-0.25, 0, 6), iso(-0.25, 0, 0)], trait: '#7A5A3E', epaisseur: 2.2 });
  f.push(...boite(-0.45, -0.4, 1.15, 0.8, 6, 8, teintes('#4D86B7')));
  const [sx, sy] = iso(0.125, 0, 14);
  f.push({ ellipse: [sx, sy, 11, 4.5], fill: BLE_REFLET }, { ellipse: [sx - 2, sy - 1.5, 6, 2.5], fill: '#EFD9AE' });
  f.push({ ligne: [iso(-0.4, 0.3, 11), iso(-1.0, 0.3, 8)], trait: '#93674A', epaisseur: 2.4 });
  const [rx, ry] = iso(0.9, 0, 5);
  f.push({ cercle: [rx, ry, 5], fill: '#2E2A27' }, { cercle: [rx, ry, 1.8], fill: '#9E978B' });
  return f;
}

// ---------------------------------------------------------------- catalogue

export const SORTES_JEU = Object.freeze(['enclos', 'champ', 'decoration']);
export const ETAPES_CHAMP = Object.freeze(['champ-seme', 'champ-pousse', 'champ-mur', 'champ-pret']); // dans l'ordre de la pousse
export const ETATS_ENCLOS = Object.freeze(['enclos-cochons', 'enclos-cochons-gras']);
export const DECORATIONS = Object.freeze(['arbre', 'fleurs', 'banc', 'cloture', 'brouette']);

const entree = (nom, sorte, dessin) => Object.freeze({ nom, sorte, dessin });
export const DESSINS_JEU = Object.freeze({
  'enclos-cochons': entree('Enclos à cochons', 'enclos', () => enclos(false)),
  'enclos-cochons-gras': entree('Enclos à cochons bien gras', 'enclos', () => enclos(true)),
  'champ-seme': entree('Champ semé', 'champ', () => champ(0)),
  'champ-pousse': entree('Champ qui pousse', 'champ', () => champ(1)),
  'champ-mur': entree('Champ mûr', 'champ', () => champ(2)),
  'champ-pret': entree('Champ prêt à récolter', 'champ', () => champ(3)),
  arbre: entree('Arbre', 'decoration', arbre),
  fleurs: entree('Massif de fleurs', 'decoration', fleurs),
  banc: entree('Banc', 'decoration', banc),
  cloture: entree('Clôture', 'decoration', cloture),
  brouette: entree('Brouette', 'decoration', brouette),
});
export const IDS_JEU = Object.freeze(Object.keys(DESSINS_JEU));

/** Formes d'un dessin (centre en 0, 0). Identifiant inconnu : liste vide (jamais une propriété héritée : Object.hasOwn). */
export function dessinJeu(id) {
  if (typeof id !== 'string' || !Object.hasOwn(DESSINS_JEU, id)) return [];
  return DESSINS_JEU[id].dessin();
}

// ---------------------------------------------------------------- SVG en texte (mêmes balises et attributs que forme() de js/os/village-ecran.js)

const COULEUR = /^#[0-9A-Fa-f]{6}$/;
function nombre(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) throw new Error('village-jeu-dessins : nombre invalide dans une forme');
  return String(Math.round(n * 10) / 10);
}
function couleur(c) {
  if (c !== 'none' && !(typeof c === 'string' && COULEUR.test(c))) throw new Error('village-jeu-dessins : couleur invalide dans une forme');
  return c;
}
const attrs = (liste) => liste.filter(([, v]) => v !== undefined).map(([k, v]) => `${k}="${v}"`).join(' ');
const opacite = (o) => (o === undefined ? undefined : nombre(o));
const point = (p) => {
  if (!Array.isArray(p) || p.length !== 2) throw new Error('village-jeu-dessins : point invalide dans une forme');
  return p;
};

function baliseSvg(f) {
  if (!f || typeof f !== 'object') throw new Error('village-jeu-dessins : forme invalide');
  if (f.cercle) {
    const [cx, cy, r] = f.cercle;
    return `<circle ${attrs([['cx', nombre(cx)], ['cy', nombre(cy)], ['r', nombre(r)], ['fill', couleur(f.fill)], ['stroke', f.trait === undefined ? undefined : couleur(f.trait)], ['stroke-width', f.trait === undefined ? undefined : '1.5'], ['opacity', opacite(f.opacite)]])}/>`;
  }
  if (f.ellipse) {
    const [cx, cy, rx, ry] = f.ellipse;
    return `<ellipse ${attrs([['cx', nombre(cx)], ['cy', nombre(cy)], ['rx', nombre(rx)], ['ry', nombre(ry)], ['fill', couleur(f.fill)], ['opacity', opacite(f.opacite)]])}/>`;
  }
  if (f.ligne) {
    const [[x1, y1], [x2, y2]] = f.ligne.map(point);
    return `<line ${attrs([['x1', nombre(x1)], ['y1', nombre(y1)], ['x2', nombre(x2)], ['y2', nombre(y2)], ['stroke', couleur(f.trait)], ['stroke-width', nombre(f.epaisseur)], ['stroke-linecap', 'round']])}/>`;
  }
  if (Array.isArray(f.poly)) {
    const pts = f.poly.map((p) => point(p).map(nombre).join(',')).join(' ');
    return `<polygon ${attrs([['points', pts], ['fill', couleur(f.fill)], ['opacity', opacite(f.opacite)]])}/>`;
  }
  throw new Error('village-jeu-dessins : forme inconnue');
}

/** Le dessin en texte SVG autonome (pour une vignette ou un test). Identifiant inconnu : ''. */
export function svgDessinJeu(id) {
  if (typeof id !== 'string' || !Object.hasOwn(DESSINS_JEU, id)) return '';
  const corps = dessinJeu(id).map(baliseSvg).join('');
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-100 -150 200 200" role="img" aria-label="${DESSINS_JEU[id].nom}">${corps}</svg>`;
}

