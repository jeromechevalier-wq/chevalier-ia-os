// Catalogue des bâtiments de l'accueil « village » (26/11/2026) : un bâtiment = un BESOIN du client (pas un module). Sans DOM : listes de formes testées seules
// (tests/maison-village.test.js) et posées à l'écran par js/os/village-ecran.js. Tous ont la même empreinte au sol (un carré d'environ 4 x 4 unités de la grille
// au centre d'une parcelle), le même angle isométrique (2:1) et la même lumière (face gauche claire, face droite sombre). Charte et recette : docs/village-charte.md.

export const BATIMENT_PAR_DEFAUT = 'bureau';

// ---------------------------------------------------------------- géométrie isométrique (2:1), en unités de la grille

export const T = 16; // demi-largeur d'une case, en pixels du dessin
/** Point de la grille (gx, gy, hauteur z en pixels) vers l'écran : x vers la droite, y vers le bas. */
export const iso = (gx, gy, z = 0) => [(gx - gy) * T, ((gx + gy) * T) / 2 - z];

// ---------------------------------------------------------------- dessins des bâtiments (listes de formes, sans DOM)
// Une forme : { poly: [[x, y], …], fill }, { cercle: [cx, cy, r], fill, trait? }, { ligne: [[x1, y1], [x2, y2]], trait, epaisseur } ou { ellipse: [cx, cy, rx, ry], fill } ;
// coordonnées à l'écran, centre du bâtiment en (0, 0). Règles de dessin (angle, palette, faces, recette d'un nouveau bâtiment) : docs/village-charte.md.

const pts = (liste) => liste.map(([gx, gy, z]) => iso(gx, gy, z));
export const poly = (liste, fill, extra = {}) => ({ poly: pts(liste), fill, ...extra });

/** Pavé droit : coin arrière (gx, gy), largeur w (le long de gx), profondeur d (le long de gy), posé à z0, haut de h. Faces vues : gauche (gy max), droite (gx max), dessus. */
function boite(gx, gy, w, d, z0, h, c) {
  const z1 = z0 + h;
  return [
    poly([[gx, gy + d, z0], [gx + w, gy + d, z0], [gx + w, gy + d, z1], [gx, gy + d, z1]], c.gauche),
    poly([[gx + w, gy, z0], [gx + w, gy + d, z0], [gx + w, gy + d, z1], [gx + w, gy, z1]], c.droite),
    poly([[gx, gy, z1], [gx + w, gy, z1], [gx + w, gy + d, z1], [gx, gy + d, z1]], c.dessus),
  ];
}
/** Fenêtre (ou porte) sur la face gauche (gy fixe) : de gx a à b, de z c à e. */
const fenetreG = (gy, a, b, c, e, fill) => poly([[a, gy, c], [b, gy, c], [b, gy, e], [a, gy, e]], fill);
/** Fenêtre sur la face droite (gx fixe) : de gy a à b, de z c à e. */
const fenetreD = (gx, a, b, c, e, fill) => poly([[gx, a, c], [gx, b, c], [gx, b, e], [gx, a, e]], fill);
/** Toit à deux pentes, faîte le long de gx, sur la boîte (gx, gy, w, d) à la hauteur z1. */
function toit2(gx, gy, w, d, z1, h, c, debord = 0.25) {
  const m = gy + d / 2;
  const y0 = gy - debord;
  const y1 = gy + d + debord;
  return [
    poly([[gx, y0, z1], [gx + w, y0, z1], [gx + w, m, z1 + h], [gx, m, z1 + h]], c.arriere),
    poly([[gx + w, gy, z1], [gx + w, gy + d, z1], [gx + w, m, z1 + h]], c.pignon),
    poly([[gx, m, z1 + h], [gx + w, m, z1 + h], [gx + w, y1, z1], [gx, y1, z1]], c.avant),
  ];
}
/** Toit en pyramide sur la boîte (gx, gy, w, d). */
function pyramide(gx, gy, w, d, z1, h, c) {
  const s = [gx + w / 2, gy + d / 2, z1 + h];
  return [
    poly([[gx, gy, z1], [gx + w, gy, z1], s], c.arriere),
    poly([[gx, gy, z1], [gx, gy + d, z1], s], c.arriere),
    poly([[gx, gy + d, z1], [gx + w, gy + d, z1], s], c.gauche),
    poly([[gx + w, gy, z1], [gx + w, gy + d, z1], s], c.droite),
  ];
}
const ombre = () => poly([[-2, -2, 0], [2.9, -2, 0], [2.9, 2.6, 0], [-2, 2.6, 0]], '#3b2412', { opacite: 0.14 });

function banque() {
  const f = [ombre(), ...boite(-2, -2, 4, 4, 0, 7, { gauche: '#AC8F68', droite: '#8C7455', dessus: '#CDAE84' })];
  f.push(...boite(-1.7, -1.7, 3.4, 3.4, 7, 50, { gauche: '#D5C8AF', droite: '#ADA38E', dessus: '#F8EAD0' }));
  for (const a of [-1.45, -0.75, 0.15, 0.85]) {
    f.push(fenetreG(1.7, a, a + 0.32, 9, 53, '#FFFDF6'));
    f.push(fenetreD(1.7, a, a + 0.32, 9, 53, '#F3E2BF'));
  }
  f.push(fenetreG(1.7, -0.32, 0.32, 7, 30, '#8A4B2F'));
  f.push(...boite(-1.95, -1.95, 3.9, 3.9, 57, 6, { gauche: '#C6B28B', droite: '#A19071', dessus: '#E8D2A9' }));
  f.push(...pyramide(-1.95, -1.95, 3.9, 3.9, 63, 30, { arriere: '#B5513A', gauche: '#CE5B38', droite: '#9C452A' }));
  const [cx, cy] = iso(-0.9, 1.7, 63);
  f.push({ cercle: [cx, cy - 10, 9], fill: '#F7C548', trait: '#B5762A' });
  return f;
}
function bureau() {
  const f = [ombre(), ...boite(-1.6, -1.6, 3.2, 3.2, 0, 92, { gauche: '#B9CAD8', droite: '#93A8BA', dessus: '#DCE6EE' })];
  for (let r = 0; r < 5; r++) {
    const z = 12 + r * 16;
    for (const a of [-1.3, -0.5, 0.3, 1.0]) {
      f.push(fenetreG(1.6, a, a + 0.5, z, z + 9, r % 2 ? '#6F8FB0' : '#5C7A99'));
      f.push(fenetreD(1.6, a, a + 0.5, z, z + 9, '#4E6985'));
    }
  }
  f.push(fenetreG(1.6, -0.45, 0.45, 0, 10, '#2F4A63'));
  f.push(...boite(-1.6, -1.6, 3.2, 0.25, 92, 5, { gauche: '#A9BBCB', droite: '#8196A8', dessus: '#C9D6E2' }));
  f.push(...boite(-1.6, -1.6, 0.25, 3.2, 92, 5, { gauche: '#A9BBCB', droite: '#8196A8', dessus: '#C9D6E2' }));
  f.push(...boite(-0.6, -0.6, 1.1, 1.1, 92, 10, { gauche: '#C5D2DD', droite: '#9FB1C1', dessus: '#E4ECF2' }));
  f.push(...boite(0.7, -1.2, 0.12, 0.12, 92, 30, { gauche: '#6E5A63', droite: '#4F4047', dessus: '#8A747E' }));
  return f;
}
function entrepot() {
  const f = [ombre(), ...boite(-2, -1.6, 4.4, 3.4, 0, 34, { gauche: '#D2B48C', droite: '#B39370', dessus: '#E9D3B0' })];
  f.push(fenetreG(1.8, -1.2, 0.4, 0, 24, '#8A5A3B'));
  for (let i = 0; i < 4; i++) f.push(fenetreG(1.8, -1.1 + i * 0.4, -1.05 + i * 0.4, 1, 23, '#9E6B47'));
  f.push(fenetreD(2.4, -0.9, 0.9, 20, 28, '#F3E2BF'));
  f.push(...toit2(-2, -1.6, 4.4, 3.4, 34, 26, { arriere: '#5E7F87', pignon: '#B39370', avant: '#7FA0A8' }));
  f.push(...boite(1.1, 2.0, 0.8, 0.8, 0, 13, { gauche: '#BA834E', droite: '#9B6836', dessus: '#D19A61' }));
  f.push(...boite(1.9, 2.0, 0.7, 0.7, 0, 11, { gauche: '#BA834E', droite: '#9B6836', dessus: '#D19A61' }));
  return f;
}
function atelier() {
  const f = [ombre(), ...boite(-1.9, -1.9, 3.8, 3.8, 0, 38, { gauche: '#D98A63', droite: '#B86E4C', dessus: '#E8A07A' })];
  for (const a of [-1.5, -0.4, 0.7]) f.push(fenetreG(1.9, a, a + 0.75, 14, 30, '#FCE7C8'));
  for (const a of [-1.5, -0.2]) f.push(fenetreD(1.9, a, a + 0.9, 14, 30, '#E9CFA9'));
  f.push(fenetreG(1.9, 0.0, 0.6, 0, 22, '#6B3E2A'));
  // Toit en dents de scie : trois pentes qui montent vers l'avant, chacune fermée par une verrière tournée vers nous.
  const L = 3.8 / 3;
  for (let i = 0; i < 3; i++) {
    const b = -1.9 + i * L;
    f.push(poly([[-1.9, b, 38], [1.9, b, 38], [1.9, b + L, 56], [-1.9, b + L, 56]], i % 2 ? '#7E8C8F' : '#93A2A5'));
    f.push(poly([[1.9, b, 38], [1.9, b + L, 38], [1.9, b + L, 56]], '#B86E4C'));
    f.push(poly([[-1.9, b + L, 38], [1.9, b + L, 38], [1.9, b + L, 56], [-1.9, b + L, 56]], '#8FB8C8'));
  }
  f.push(...boite(1.0, -1.6, 0.5, 0.5, 38, 40, { gauche: '#B0603F', droite: '#8E4B31', dessus: '#C9785A' }));
  const [fx, fy] = iso(1.25, -1.35, 84);
  f.push({ cercle: [fx + 4, fy - 4, 6], fill: '#ECE6E0', opacite: 0.85 }, { cercle: [fx + 11, fy - 14, 8], fill: '#ECE6E0', opacite: 0.7 });
  return f;
}
function maison() {
  const f = [ombre(), ...boite(-1.6, -1.6, 3.2, 3.2, 0, 36, { gauche: '#F1E3C8', droite: '#D9C6A3', dessus: '#FBF1DE' })];
  f.push(fenetreG(1.6, -0.25, 0.35, 0, 22, '#8A4B2F'));
  for (const a of [-1.25, 0.75]) {
    f.push(fenetreG(1.6, a, a + 0.45, 14, 26, '#7FA6C2'));
    f.push(fenetreG(1.6, a - 0.15, a, 14, 26, '#9A7FC4'));
    f.push(fenetreG(1.6, a + 0.45, a + 0.6, 14, 26, '#9A7FC4'));
  }
  f.push(fenetreD(1.6, -0.6, 0.0, 14, 26, '#6E93AE'));
  f.push(...toit2(-1.6, -1.6, 3.2, 3.2, 36, 28, { arriere: '#A84A2E', pignon: '#D9C6A3', avant: '#D9603B' }));
  f.push(...boite(0.6, -1.2, 0.45, 0.45, 50, 22, { gauche: '#C9B48F', droite: '#A8946F', dessus: '#E2CFAA' }));
  return f;
}

// ---------------------------------------------------------------- nouveaux bâtiments (maquette validée du 26/11/2026)
// Règle des faces (docs/village-charte.md) : dessus = la couleur claire, face gauche = 86 % de sa lumière, face droite = 70 %.
const assombrir = (hex, k) => `#${[1, 3, 5].map((i) => Math.round(parseInt(hex.slice(i, i + 2), 16) * k).toString(16).padStart(2, '0')).join('').toUpperCase()}`;
/** Les trois teintes d'un volume à partir de sa couleur claire. */
export const teintes = (clair) => ({ dessus: clair, gauche: assombrir(clair, 0.86), droite: assombrir(clair, 0.7) });
const toitTeintes = (clair) => ({ arriere: assombrir(clair, 0.86), pignon: assombrir(clair, 0.7), avant: clair, gauche: clair, droite: assombrir(clair, 0.7) });
const BOIS = teintes('#93674A');
/** Point (gx, gy, z) de la grille vers l'écran, pour poser un cercle ou une ligne. */
const ecran = (gx, gy, z = 0) => iso(gx, gy, z);

function marche() {
  const f = [ombre(), ...boite(-2, -2, 4, 4, 0, 3, teintes('#EADBC3'))];
  // étal de fruits au fond, puis les quatre poteaux
  f.push(...boite(-1.7, -1.7, 3.2, 1.6, 3, 16, teintes('#BA834E')));
  const fruits = ['#F28C28', '#7DB547', '#E4572E', '#F5A33B', '#9BCB5C', '#C7372F'];
  for (let k = 0; k < 6; k++) {
    const [x, y] = ecran(-1.4 + k * 0.5, -1.0, 21);
    f.push({ cercle: [x, y, 4.5], fill: fruits[k] }, { cercle: [x - 6, y - 3, 4.5], fill: fruits[(k + 3) % 6] });
  }
  for (const [gx, gy] of [[-1.9, -1.9], [1.6, -1.9], [-1.9, 1.6], [1.6, 1.6]]) f.push(...boite(gx, gy, 0.3, 0.3, 3, 40, BOIS));
  // auvent rayé rouge et crème
  const z1 = 43;
  const h = 16;
  const m = 0;
  for (let k = 0; k < 8; k++) {
    const a = -2.2 + k * 0.55;
    const b = a + 0.55;
    f.push(poly([[a, -2.3, z1], [b, -2.3, z1], [b, m, z1 + h], [a, m, z1 + h]], k % 2 ? '#C7472A' : '#E9DCC4'));
  }
  f.push(poly([[2.2, -2.3, z1], [2.2, 2.3, z1], [2.2, m, z1 + h]], '#217166'));
  for (let k = 0; k < 8; k++) {
    const a = -2.2 + k * 0.55;
    const b = a + 0.55;
    f.push(poly([[a, m, z1 + h], [b, m, z1 + h], [b, 2.3, z1], [a, 2.3, z1]], k % 2 ? '#E4572E' : '#FFF3DF'));
  }
  // cageots devant
  f.push(...boite(0.4, 2.2, 0.8, 0.6, 0, 9, teintes('#D19A61')), ...boite(1.3, 2.2, 0.8, 0.6, 0, 9, teintes('#D19A61')));
  for (const [gx, c] of [[0.8, '#E4572E'], [1.7, '#7DB547']]) { const [x, y] = ecran(gx, 2.5, 10); f.push({ cercle: [x, y, 4], fill: c }); }
  return f;
}

function poste() {
  const mur = teintes('#FBD778');
  const f = [ombre(), ...boite(-1.9, -1.7, 3.8, 3.4, 0, 40, mur)];
  for (const a of [-1.5, 0.8]) f.push(fenetreG(1.7, a, a + 0.7, 18, 32, '#FFFDF6'));
  f.push(fenetreG(1.7, -0.4, 0.4, 0, 26, '#3A75A8'));
  f.push(fenetreD(1.9, -1.1, 0.9, 16, 32, '#FFFDF6'));
  // enseigne : une enveloppe sur la face droite
  f.push(poly([[1.9, -1.1, 32], [1.9, 0.9, 32], [1.9, -0.1, 24]], '#E4572E'));
  f.push(...toit2(-1.9, -1.7, 3.8, 3.4, 40, 24, toitTeintes('#4D86B7')));
  // boîte aux lettres jaune devant
  f.push(...boite(1.0, 2.0, 0.5, 0.4, 0, 6, BOIS), ...boite(0.95, 1.95, 0.6, 0.5, 6, 10, teintes('#F7C548')));
  return f;
}

function phare() {
  const f = [ombre(), ...boite(-1.8, -1.8, 3.6, 3.6, 0, 16, teintes('#DBD9D3'))];
  f.push(fenetreG(1.8, -1.2, -0.5, 0, 12, '#7A6D63'));
  f.push(...pyramide(-1.8, -1.8, 3.6, 3.6, 16, 8, toitTeintes('#97897F')));
  // tour à bandes rouges et blanches
  for (let k = 0; k < 5; k++) f.push(...boite(-0.8, -0.8, 1.6, 1.6, 18 + k * 14, 14, teintes(k % 2 ? '#FFFDF6' : '#E6643E')));
  // lanterne et faisceaux de lumière
  const [lx, ly] = ecran(0, 0, 96);
  f.push({ poly: [[lx, ly], [lx + 90, ly - 22], [lx + 90, ly + 6]], fill: '#FFD66B', opacite: 0.55 });
  f.push({ poly: [[lx, ly], [lx - 90, ly - 14], [lx - 90, ly + 8]], fill: '#FFD66B', opacite: 0.3 });
  f.push(...boite(-0.6, -0.6, 1.2, 1.2, 88, 12, teintes('#F7C956')));
  f.push(...pyramide(-0.75, -0.75, 1.5, 1.5, 100, 14, toitTeintes('#E6643E')));
  return f;
}

function grue() {
  const acier = teintes('#F3AC50');
  const f = [ombre(), ...boite(-2, -0.2, 2.6, 2.2, 0, 24, teintes('#EBDABF'))];
  for (const a of [-1.7, -0.9, -0.1]) f.push(fenetreG(2.0, a, a + 0.5, 10, 18, '#8FC1DD'));
  f.push(fenetreD(0.6, 0.3, 1.5, 8, 18, '#79A9C4'));
  // mât, flèche, contrepoids et cabine
  f.push(...boite(0.9, -1.6, 0.4, 0.4, 0, 104, acier));
  f.push(...boite(-2.1, -1.55, 4.6, 0.3, 104, 5, acier));
  f.push(...boite(-2.0, -1.65, 0.8, 0.5, 98, 8, teintes('#685446')));
  f.push(...boite(1.3, -1.6, 0.5, 0.5, 96, 9, teintes('#4D86B7')));
  // crochet et palette suspendue
  const [hx, hy] = ecran(2.2, -1.4, 104);
  const [bx, by] = ecran(2.2, -1.4, 60);
  f.push({ ligne: [[hx, hy], [bx, by]], trait: '#5B4636', epaisseur: 1.6 });
  f.push(...boite(1.8, -1.8, 0.8, 0.8, 54, 6, BOIS));
  // tas de sable devant
  f.push(...pyramide(0.8, 1.0, 1.4, 1.2, 0, 10, toitTeintes('#E8C98A')));
  return f;
}

function radio() {
  const f = [ombre(), ...boite(-1.8, -1.6, 3.6, 3.2, 0, 34, teintes('#CD94BE'))];
  for (const a of [-1.4, -0.4, 0.6]) f.push(fenetreG(1.6, a, a + 0.6, 14, 26, '#FFE9C7'));
  f.push(fenetreD(1.8, -1.0, 0.6, 12, 26, '#FFE9C7'));
  f.push(...boite(-1.9, -1.7, 3.8, 3.4, 34, 4, teintes('#8C6181')));
  // antenne et ondes
  f.push(...boite(-0.15, -0.15, 0.3, 0.3, 38, 70, teintes('#6B3A5E')));
  const [ax, ay] = ecran(0, 0, 110);
  f.push({ cercle: [ax, ay, 5], fill: '#E4572E' });
  for (const r of [12, 20, 28]) f.push({ cercle: [ax, ay, r], fill: 'none', trait: '#E4572E', opacite: 0.5 });
  // étoile jaune sur la façade
  const [sx, sy] = ecran(-0.2, 1.6, 30);
  f.push({ cercle: [sx, sy, 5], fill: '#F7C548' });
  return f;
}

function beffroi() {
  const f = [ombre(), ...boite(-1.9, -1.9, 3.8, 3.8, 0, 28, teintes('#DBCDEB'))];
  for (const a of [-1.5, 0.8]) f.push(fenetreG(1.9, a, a + 0.6, 12, 22, '#FFFDF6'));
  f.push(fenetreG(1.9, -0.35, 0.35, 0, 20, '#563B85'));
  f.push(...boite(-1.0, -1.0, 2.0, 2.0, 28, 52, teintes('#BEACD9')));
  // horloge sur la face gauche de la tour
  const [hx, hy] = ecran(0, 1.0, 64);
  f.push({ cercle: [hx, hy, 9], fill: '#FFFDF6', trait: '#563B85' }, { ligne: [[hx, hy], [hx, hy - 6]], trait: '#412D64', epaisseur: 1.6 }, { ligne: [[hx, hy], [hx + 4, hy + 2]], trait: '#412D64', epaisseur: 1.6 });
  f.push(...pyramide(-1.2, -1.2, 2.4, 2.4, 80, 28, toitTeintes('#563B85')));
  // petit graphique en barres devant (le tableau de bord)
  [[1.0, 6, '#F7C548'], [1.5, 10, '#F2A541'], [2.0, 15, '#E4572E']].forEach(([gx, h, c]) => f.push(...boite(gx, 2.1, 0.35, 0.35, 0, h, teintes(c))));
  return f;
}

function clients() {
  const f = [ombre(), ...boite(-1.8, -1.8, 3.6, 3.6, 0, 36, teintes('#F4A593'))];
  f.push(fenetreG(1.8, -1.5, -0.3, 12, 26, '#FFE9C7'));
  f.push(fenetreG(1.8, 0.4, 1.2, 0, 24, '#7A3B4E'));
  f.push(fenetreD(1.8, -1.2, 0.6, 12, 26, '#FFE9C7'));
  // auvent turquoise au-dessus de la vitrine
  f.push(poly([[-1.6, 1.8, 28], [-0.2, 1.8, 28], [-0.2, 2.5, 22], [-1.6, 2.5, 22]], '#2F9E8F'));
  f.push(...boite(-1.9, -1.9, 3.8, 3.8, 36, 4, teintes('#844A5C')));
  // cœur jaune sur le toit
  const [cx, cy] = ecran(0, 0, 52);
  f.push({ cercle: [cx - 4, cy - 3, 5], fill: '#F7C548' }, { cercle: [cx + 4, cy - 3, 5], fill: '#F7C548' }, { poly: [[cx - 9, cy - 1], [cx + 9, cy - 1], [cx, cy + 9]], fill: '#F7C548' });
  return f;
}

function garage() {
  const f = [ombre(), ...boite(-2, -1.8, 4, 3.6, 0, 34, teintes('#B7C9A8'))];
  // grande porte ouverte : l'intérieur sombre, puis le camion de maçon dedans
  f.push(fenetreG(1.8, -1.6, 1.0, 0, 26, '#3F3A36'));
  f.push(poly([[-1.6, 1.8, 26], [1.0, 1.8, 26], [1.0, 1.8, 30], [-1.6, 1.8, 30]], '#8A9A80'));
  // camion : plateau gris avec une bétonnière, cabine orange
  f.push(...boite(-1.4, 0.9, 1.4, 0.8, 3, 6, teintes('#BDB6AA')));
  f.push(...boite(0.05, 0.9, 0.75, 0.8, 3, 13, teintes('#F28C28')));
  f.push(fenetreG(1.7, 0.15, 0.7, 9, 14, '#8FC1DD'));
  const [bx, by] = ecran(-0.7, 1.3, 15);
  f.push({ ellipse: [bx, by, 9, 6], fill: '#D9D4CA' }, { ellipse: [bx + 4, by - 1, 4, 3], fill: '#9E978B' });
  for (const gx of [-1.1, 0.4]) { const [x, y] = ecran(gx, 1.7, 2.5); f.push({ cercle: [x, y, 3.4], fill: '#2E2A27' }); }
  f.push(fenetreD(2.0, -1.4, -0.2, 14, 26, '#DCEFE7'));
  f.push(...boite(-2.1, -1.9, 4.2, 3.8, 34, 4, teintes('#6F8B80')));
  // pneu et clé posés devant
  const [px, py] = ecran(1.7, 2.4, 4);
  f.push({ cercle: [px, py, 6], fill: '#2E2A27' }, { cercle: [px, py, 2.6], fill: '#9E978B' });
  const [kx, ky] = ecran(-1.0, 2.5, 0);
  f.push({ ligne: [[kx - 8, ky - 2], [kx + 6, ky + 3]], trait: '#9E978B', epaisseur: 3 }, { cercle: [kx - 9, ky - 2, 3], fill: '#9E978B' });
  return f;
}

function fontaine() {
  const f = [ombre()];
  const [cx, cy] = ecran(0.3, 0.3, 0);
  f.push({ ellipse: [cx, cy, 52, 26], fill: '#C9B79C' }, { ellipse: [cx, cy - 6, 52, 26], fill: '#E0D2B8' }, { ellipse: [cx, cy - 6, 44, 21], fill: '#8CC7DB' });
  f.push(...boite(0.05, 0.05, 0.5, 0.5, 0, 30, teintes('#E0D2B8')));
  f.push({ ellipse: [cx, cy - 32, 18, 8], fill: '#C9B79C' }, { ellipse: [cx, cy - 34, 15, 6], fill: '#8CC7DB' });
  for (const dx of [-14, -6, 6, 14]) f.push({ ligne: [[cx, cy - 44], [cx + dx * 2, cy - 12 + Math.abs(dx)]], trait: '#8CC7DB', epaisseur: 2.4 });
  f.push({ cercle: [cx, cy - 46, 4], fill: '#BFE3EF' });
  // étoiles des avis, posées au bord du bassin
  for (const dx of [-30, 0, 30]) f.push({ cercle: [cx + dx, cy + 18, 4.5], fill: '#F7C548' });
  return f;
}

function ecole() {
  const f = [ombre(), ...boite(-2, -1.7, 4, 3.4, 0, 34, teintes('#F4C99B'))];
  for (const a of [-1.7, -0.9, 0.9]) f.push(fenetreG(1.7, a, a + 0.55, 14, 26, '#8FC1DD'));
  f.push(fenetreG(1.7, -0.05, 0.55, 0, 22, '#8A4B2F'));
  f.push(fenetreD(2.0, -1.2, 0.8, 14, 26, '#79A9C4'));
  f.push(...toit2(-2, -1.7, 4, 3.4, 34, 22, toitTeintes('#D9603B')));
  // clocheton et cloche
  f.push(...boite(-0.4, -0.4, 0.8, 0.8, 50, 14, teintes('#FFF3DF')));
  f.push(...pyramide(-0.5, -0.5, 1.0, 1.0, 64, 12, toitTeintes('#D9603B')));
  const [cx, cy] = ecran(0, 0.4, 58);
  f.push({ cercle: [cx, cy, 3], fill: '#F7C548' });
  return f;
}

function archives() {
  const f = [ombre(), ...boite(-1.9, -1.8, 3.8, 3.6, 0, 40, teintes('#E8B98A'))];
  // colonnes claires sur la face gauche et grand registre au-dessus de la porte
  for (const a of [-1.6, -0.9, 0.6, 1.3]) f.push(fenetreG(1.8, a, a + 0.25, 0, 34, '#FFF3DD'));
  f.push(fenetreG(1.8, -0.4, 0.3, 0, 22, '#7A4E2E'));
  f.push(fenetreD(1.9, -1.4, 0.9, 12, 30, '#FFF3DD'));
  for (const z of [17, 23]) f.push({ ligne: [ecran(1.9, -1.4, z), ecran(1.9, 0.9, z)], trait: '#C9A77A', epaisseur: 1.6 });
  f.push(...boite(-2.0, -1.9, 4.0, 3.8, 40, 5, teintes('#C9A77A')));
  // pile de dossiers devant
  for (let k = 0; k < 3; k++) f.push(...boite(1.0, 2.0, 0.8, 0.6, k * 3, 3, teintes(k % 2 ? '#FFFDF6' : '#8FC1DD')));
  return f;
}

function mairie() {
  const f = [ombre(), ...boite(-2, -1.8, 4, 3.6, 0, 38, teintes('#9CC3D1'))];
  for (const a of [-1.7, -0.9, 0.7, 1.4]) f.push(fenetreG(1.8, a, a + 0.45, 16, 30, '#FFFDF6'));
  f.push(fenetreG(1.8, -0.3, 0.4, 0, 26, '#2F5D73'));
  f.push(fenetreD(2.0, -1.3, 0.9, 16, 30, '#FFFDF6'));
  f.push(...toit2(-2, -1.8, 4, 3.6, 38, 24, toitTeintes('#2F5D73')));
  // mât et drapeau turquoise
  f.push(...boite(1.4, -1.6, 0.15, 0.15, 50, 40, teintes('#FFFDF6')));
  const [dx, dy] = ecran(1.5, -1.5, 88);
  f.push({ poly: [[dx, dy], [dx + 24, dy + 4], [dx, dy + 12]], fill: '#2F9E8F' });
  return f;
}

/**
 * Le catalogue : un identifiant stable en minuscules par bâtiment. `nom` : ce que c'est ; `besoin` : le besoin typique ; `accessoires` : les détails qui le font reconnaître.
 * Un identifiant inconnu donne le bureau (BATIMENT_PAR_DEFAUT). Pour en ajouter un : docs/village-charte.md (recette pas à pas).
 */
export const CATALOGUE = Object.freeze({
  bureau: Object.freeze({ nom: 'Bureau', besoin: 'Gérer mon entreprise au quotidien', accessoires: 'tour vitrée, antenne', dessin: bureau }),
  banque: Object.freeze({ nom: 'Banque', besoin: 'Valider mes factures fournisseurs', accessoires: 'colonnes, toit rouge, médaille dorée', dessin: banque }),
  marche: Object.freeze({ nom: 'Marché', besoin: 'Payer moins cher mes articles', accessoires: 'auvent rayé, étal de fruits, cageots', dessin: marche }),
  entrepot: Object.freeze({ nom: 'Entrepôt', besoin: 'Ne jamais manquer de matériel', accessoires: 'grande porte en bois, caisses', dessin: entrepot }),
  atelier: Object.freeze({ nom: 'Atelier', besoin: 'Faire un devis qui donne envie', accessoires: 'toit en dents de scie, cheminée qui fume', dessin: atelier }),
  maison: Object.freeze({ nom: 'Maison', besoin: 'Mes papiers personnels', accessoires: 'volets lavande, cheminée', dessin: maison }),
  clients: Object.freeze({ nom: 'Maison des clients', besoin: 'Suivre mes clients et mes ventes', accessoires: 'vitrine, auvent turquoise, cœur jaune', dessin: clients }),
  poste: Object.freeze({ nom: 'Poste', besoin: 'Prévenir mes clients avant de venir', accessoires: 'enveloppe rouge, boîte aux lettres jaune', dessin: poste }),
  radio: Object.freeze({ nom: 'Radio', besoin: 'Me faire connaître', accessoires: 'antenne, ondes rouges', dessin: radio }),
  phare: Object.freeze({ nom: 'Phare', besoin: 'Voir ce qui change dans mon métier', accessoires: 'tour rayée, lanterne, faisceaux', dessin: phare }),
  grue: Object.freeze({ nom: 'Grue (chantier)', besoin: 'Suivre mes chantiers', accessoires: 'grue orange, palette suspendue, tas de sable', dessin: grue }),
  beffroi: Object.freeze({ nom: 'Beffroi', besoin: 'Voir où en est mon entreprise', accessoires: 'horloge, petit graphique en barres', dessin: beffroi }),
  garage: Object.freeze({ nom: 'Garage', besoin: 'Suivre la maintenance de mes véhicules', accessoires: 'porte ouverte, camion de maçon avec bétonnière, pneu et clé', dessin: garage }),
  fontaine: Object.freeze({ nom: 'Fontaine', besoin: 'Savoir ce que pensent mes clients', accessoires: 'bassin, jets d’eau, étoiles', dessin: fontaine }),
  ecole: Object.freeze({ nom: 'École', besoin: 'Apprendre un nouveau savoir-faire', accessoires: 'clocheton, cloche', dessin: ecole }),
  archives: Object.freeze({ nom: 'Archives', besoin: 'Retrouver mes papiers', accessoires: 'colonnes, étagères, pile de dossiers', dessin: archives }),
  mairie: Object.freeze({ nom: 'Maison commune', besoin: 'Organiser mon équipe', accessoires: 'mât et drapeau turquoise', dessin: mairie }),
});
/** Identifiants valables du champ `batiment` (les cinq premiers existent depuis la PR 715). */
export const BATIMENTS = Object.freeze(Object.keys(CATALOGUE));

/** Formes d'un bâtiment (centre en 0, 0). Identifiant inconnu : le bureau. */
export function dessinBatiment(nom) {
  return (Object.hasOwn(CATALOGUE, nom) ? CATALOGUE[nom] : CATALOGUE[BATIMENT_PAR_DEFAUT]).dessin();
}
