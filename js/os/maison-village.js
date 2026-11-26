// Accueil « village » d'une maison (26/11/2026). Sans DOM ni Firebase : se teste seul (tests/maison-village.test.js) ; le dessin est posé par js/os/village-ecran.js.
// Le réglage est le champ FACULTATIF `besoins` de reglages_maison/ecran (lu à la connexion par js/os/comptes-maison.js) : une liste de 1 à 3 besoins du client,
// chacun { nom, phrase, batiment, cible } (ex. { nom: 'Factures', phrase: 'Valider mes factures fournisseurs', batiment: 'banque', cible: '#/achatsfactures/liste' }).
//  - un bâtiment = un BESOIN, pas un module : deux besoins peuvent mener au même module (deux vues différentes) ;
//  - champ ABSENT, liste vide ou aucune entrée valable : l'accueil d'avant ne change pas ;
//  - une entrée mal formée est ignorée (avertissement dans la console du navigateur) ; au-delà de 3 entrées valables, seules les 3 premières sont gardées ;
//  - `cible` : seulement une route interne « #/module/vue » (lettres, chiffres, - et _), jamais 'javascript:', 'http', '//' ni rien d'autre ;
//  - `batiment` absent ou inconnu : le bureau. Les textes sont coupés à une longueur raisonnable et posés par textContent (jamais innerHTML).

export const BATIMENTS = Object.freeze(['bureau', 'banque', 'entrepot', 'atelier', 'maison']);
export const BATIMENT_PAR_DEFAUT = 'bureau';
export const BESOINS_MAX = 3;
export const NOM_MAX = 40;
export const PHRASE_MAX = 90;
export const ROUTE_VILLAGE = 'accueil';

const CIBLE = /^#\/[A-Za-z0-9][A-Za-z0-9_-]*(?:\/[A-Za-z0-9_-]+)*$/;

/** Vrai si `cible` est une route interne de l'appli (« #/achatsfactures/liste »). Tout le reste (javascript:, http, //, espaces, ?…) est refusé. */
export function cibleValide(cible) {
  return typeof cible === 'string' && cible.length <= 200 && CIBLE.test(cible);
}

const couper = (texte, max) => (texte.length > max ? `${texte.slice(0, max - 1).trimEnd()}…` : texte);
const texteSimple = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/** Range la valeur brute du champ : { besoins: [{ nom, phrase, batiment, cible }], avertissements }. Liste vide = accueil d'avant. */
export function lireBesoinsMaison(brut) {
  if (brut === undefined || brut === null) return { besoins: [], avertissements: [] };
  if (!Array.isArray(brut)) return { besoins: [], avertissements: ['reglages_maison/ecran : le champ « besoins » doit être une liste ; accueil habituel.'] };
  const besoins = [];
  const avertissements = [];
  brut.forEach((b, i) => {
    const rang = i + 1;
    if (!b || typeof b !== 'object' || Array.isArray(b)) { avertissements.push(`reglages_maison/ecran : besoin n° ${rang} ignoré (ce n’est pas une fiche).`); return; }
    const nom = texteSimple(b.nom);
    if (!nom) { avertissements.push(`reglages_maison/ecran : besoin n° ${rang} ignoré (nom absent).`); return; }
    if (!cibleValide(b.cible)) { avertissements.push(`reglages_maison/ecran : besoin n° ${rang} ignoré (cible refusée : seulement une route « #/… » de l’appli).`); return; }
    if (besoins.length >= BESOINS_MAX) { avertissements.push(`reglages_maison/ecran : besoin n° ${rang} ignoré (${BESOINS_MAX} au plus).`); return; }
    const batiment = BATIMENTS.includes(b.batiment) ? b.batiment : BATIMENT_PAR_DEFAUT;
    if (b.batiment !== undefined && batiment !== b.batiment) avertissements.push(`reglages_maison/ecran : besoin n° ${rang} : bâtiment inconnu, dessiné en « ${BATIMENT_PAR_DEFAUT} ».`);
    besoins.push({ nom: couper(nom, NOM_MAX), phrase: couper(texteSimple(b.phrase), PHRASE_MAX), batiment, cible: b.cible });
  });
  return { besoins, avertissements };
}

/** Coupe une phrase en lignes d'au plus `largeur` caractères (au plus `lignes` lignes, la dernière finit par « … » si le texte déborde). */
export function couperEnLignes(phrase, largeur = 24, lignes = 2) {
  const mots = texteSimple(phrase).split(' ').filter(Boolean);
  const res = [];
  let ligne = '';
  for (const mot of mots) {
    const essai = ligne ? `${ligne} ${mot}` : mot;
    if (essai.length <= largeur || !ligne) { ligne = essai; continue; }
    res.push(ligne);
    ligne = mot;
  }
  if (ligne) res.push(ligne);
  const gardees = res.slice(0, lignes).map((l) => couper(l, largeur));
  if (res.length > lignes) gardees[lignes - 1] = `${couper(gardees[lignes - 1], largeur - 1).replace(/…$/, '')}…`;
  return gardees;
}

// ---------------------------------------------------------------- géométrie isométrique (2:1), en unités de la grille

export const T = 16; // demi-largeur d'une case, en pixels du dessin
/** Point de la grille (gx, gy, hauteur z en pixels) vers l'écran : x vers la droite, y vers le bas. */
export const iso = (gx, gy, z = 0) => [(gx - gy) * T, ((gx + gy) * T) / 2 - z];

const ESPACE_LIGNE = 5.6; // écart entre deux bâtiments posés côte à côte (ordinateur)
const ESPACE_COLONNE = 12; // écart entre deux bâtiments l'un sous l'autre (téléphone)
const DECALAGE_COLONNE = 1.3; // petit zigzag de la colonne du téléphone
// Boîte d'un bâtiment et de son étiquette autour de son centre à l'écran (pixels) : le toit monte jusqu'à -150, l'étiquette descend jusqu'à +106.
export const BOITE_BATIMENT = Object.freeze({ gauche: -100, droite: 100, haut: -150, bas: 106 });
const MARGE = 10;

/**
 * Place `n` bâtiments (1 à 3) : en ligne (ordinateur) ou en colonne (téléphone, `colonne: true`).
 * Rend { places: [{ gx, gy, x, y }], vue: { x, y, largeur, hauteur } } : `vue` est le cadre serré autour des bâtiments et de leurs étiquettes (aucun grand vide).
 */
export function planVillage(n, { colonne = false } = {}) {
  const total = Math.max(1, Math.min(BESOINS_MAX, Math.floor(n) || 1));
  const places = [];
  for (let i = 0; i < total; i++) {
    const k = i - (total - 1) / 2;
    const z = colonne ? (i % 2 ? -DECALAGE_COLONNE : DECALAGE_COLONNE) * (total > 1 ? 1 : 0) : 0;
    const gx = colonne ? k * ESPACE_COLONNE + z : k * ESPACE_LIGNE;
    const gy = colonne ? k * ESPACE_COLONNE - z : -k * ESPACE_LIGNE;
    const [x, y] = iso(gx, gy);
    places.push({ gx, gy, x, y });
  }
  const xs = places.map((p) => p.x);
  const ys = places.map((p) => p.y);
  const x0 = Math.min(...xs) + BOITE_BATIMENT.gauche - MARGE;
  const x1 = Math.max(...xs) + BOITE_BATIMENT.droite + MARGE;
  const y0 = Math.min(...ys) + BOITE_BATIMENT.haut - MARGE;
  const y1 = Math.max(...ys) + BOITE_BATIMENT.bas + MARGE;
  return { places, vue: { x: x0, y: y0, largeur: x1 - x0, hauteur: y1 - y0 } };
}

// ---------------------------------------------------------------- dessins des bâtiments (listes de formes, sans DOM)
// Une forme : { poly: [[x, y], …], fill } ou { cercle: [cx, cy, r], fill } ; coordonnées à l'écran, centre du bâtiment en (0, 0).

const pts = (liste) => liste.map(([gx, gy, z]) => iso(gx, gy, z));
const poly = (liste, fill, extra = {}) => ({ poly: pts(liste), fill, ...extra });

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
const DESSINS = { banque, bureau, entrepot, atelier, maison };

/** Formes d'un bâtiment (centre en 0, 0). Nom inconnu : le bureau. */
export function dessinBatiment(nom) {
  return (DESSINS[nom] || DESSINS[BATIMENT_PAR_DEFAUT])();
}
