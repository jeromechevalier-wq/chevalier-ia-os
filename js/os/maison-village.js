// Accueil « village » d'une maison (26/11/2026). Sans DOM ni Firebase : se teste seul (tests/maison-village.test.js) ; le dessin est posé par js/os/village-ecran.js.
// Le réglage est le champ FACULTATIF `besoins` de reglages_maison/ecran (lu à la connexion par js/os/comptes-maison.js) : une liste de 1 à 4 besoins du client,
// chacun { nom, phrase, batiment, cible, compteur? } (ex. { nom: 'Factures', phrase: 'Valider mes factures fournisseurs', batiment: 'banque', cible: '#/achatsfactures/liste', compteur: 'factures_a_valider' }).
//  - `compteur` (facultatif) : un identifiant de la liste fermée COMPTEURS ; le nombre est lu à l'affichage (js/os/village-compteurs.js) et montré dans la bulle du bâtiment ;
//  - un bâtiment = un BESOIN, pas un module : deux besoins peuvent mener au même module (deux vues différentes) ;
//  - champ ABSENT, liste vide ou aucune entrée valable : l'accueil d'avant ne change pas ;
//  - une entrée mal formée est ignorée (avertissement dans la console du navigateur) ; au-delà de 4 entrées valables, seules les 4 premières sont gardées ;
//  - `cible` : seulement une route interne « #/module/vue » (lettres, chiffres, - et _), jamais 'javascript:', 'http', '//' ni rien d'autre ;
//  - `batiment` absent ou inconnu : le bureau. Les textes sont coupés à une longueur raisonnable et posés par textContent (jamais innerHTML).

import { iso, poly, BATIMENTS, BATIMENT_PAR_DEFAUT } from './village-batiments.js';

// Dessins des bâtiments et géométrie isométrique : js/os/village-batiments.js (catalogue), réexportés ici pour les appelants.
export { T, iso, BATIMENTS, BATIMENT_PAR_DEFAUT, dessinBatiment, CATALOGUE } from './village-batiments.js';
export const BESOINS_MAX = 4;
export const NOM_MAX = 40;
export const PHRASE_MAX = 90;
export const ROUTE_VILLAGE = 'accueil';
/** Compteurs connus (liste fermée) : un autre identifiant est ignoré (avertissement), le besoin reste sans compteur. */
export const COMPTEURS = Object.freeze(['factures_a_valider']);

/** Texte de la pastille de la bulle : « 12 à valider », « Rien à valider » ; null (compteur illisible) = pas de pastille, jamais « 0 » inventé. */
export function textePastille(id, n) {
  if (!Number.isInteger(n) || n < 0) return null;
  if (id === 'factures_a_valider') return n === 0 ? 'Rien à valider' : `${n} à valider`;
  return String(n);
}

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
    const besoin = { nom: couper(nom, NOM_MAX), phrase: couper(texteSimple(b.phrase), PHRASE_MAX), batiment, cible: b.cible };
    if (COMPTEURS.includes(b.compteur)) besoin.compteur = b.compteur;
    else if (b.compteur !== undefined) avertissements.push(`reglages_maison/ecran : besoin n° ${rang} : compteur inconnu, ignoré.`);
    besoins.push(besoin);
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


// Le village est TOUJOURS un terrain de 4 parcelles (losange 2 x 2, 26/11/2026 au soir) : les besoins prennent les parcelles dans l'ordre fixe
// haut, gauche, droite, bas ; chaque bâtiment a la même taille quel que soit le nombre de besoins (1 besoin = un quart du terrain) ;
// les parcelles libres reçoivent un décor (lavande, bosquet, potager), jamais cliquable. Des sentiers en croix séparent les 4 parcelles.
export const DEMI_PARCELLE = 4.5; // demi-côté d'une parcelle, en unités de la grille
export const DEMI_SENTIER = 0.5; // demi-largeur du sentier entre deux parcelles
export const DEMI_TERRAIN = DEMI_PARCELLE * 2 + DEMI_SENTIER * 2; // demi-côté du terrain entier
export const EPAISSEUR_TERRAIN = 12; // tranche de terre visible sous le terrain (pixels du dessin)
const C = DEMI_PARCELLE + DEMI_SENTIER; // distance du centre du terrain au centre d'une parcelle
/** Les 4 parcelles, dans l'ordre où les besoins les occupent : haut (au fond), gauche, droite, bas (devant). */
export const PARCELLES = Object.freeze([
  Object.freeze({ nom: 'haut', gx: -C, gy: -C }),
  Object.freeze({ nom: 'gauche', gx: -C, gy: C }),
  Object.freeze({ nom: 'droite', gx: C, gy: -C }),
  Object.freeze({ nom: 'bas', gx: C, gy: C }),
]);
/** Décors des parcelles libres, dans l'ordre : la 1re parcelle libre a de la lavande, la 2e un bosquet, la 3e un potager (même dessin à chaque affichage). */
export const DECORS = Object.freeze(['lavande', 'bosquet', 'potager']);
// Boîte d'un bâtiment autour de son centre à l'écran (pixels du dessin) : le toit monte jusqu'à -150 ; l'étiquette (le nom) est posée à +ETIQUETTE_Y sous le centre.
export const BOITE_BATIMENT = Object.freeze({ gauche: -100, droite: 100, haut: -150, bas: 50 });
export const ETIQUETTE_Y = 36;
export const ETIQUETTE_HAUTEUR_MAX = 40; // le nom seul (la phrase et le compteur sont dans la bulle)
const MARGE = 8;

/**
 * Plan du village pour `n` besoins (1 à 4, ramené dans ces bornes) : toujours les 4 parcelles du terrain.
 * Rend { parcelles: [{ rang, nom, gx, gy, x, y, occupee, decor }], places: [les n parcelles occupées], vue: { x, y, largeur, hauteur } } :
 * `vue` est le cadre serré autour du losange, des toits et des étiquettes (aucun grand vide autour).
 */
export function planVillage(n) {
  const total = Math.max(1, Math.min(BESOINS_MAX, Math.floor(n) || 1));
  let libre = 0;
  const parcelles = PARCELLES.map((p, rang) => {
    const [x, y] = iso(p.gx, p.gy);
    const occupee = rang < total;
    return { rang, nom: p.nom, gx: p.gx, gy: p.gy, x, y, occupee, decor: occupee ? null : DECORS[libre++ % DECORS.length] };
  });
  const places = parcelles.filter((p) => p.occupee);
  const coins = terrainCoins();
  const x0 = Math.min(...coins.map((c) => c[0])) - MARGE;
  const x1 = Math.max(...coins.map((c) => c[0])) + MARGE;
  const y0 = Math.min(coins[0][1], ...places.map((p) => p.y + BOITE_BATIMENT.haut)) - MARGE;
  const y1 = Math.max(coins[2][1] + EPAISSEUR_TERRAIN, ...places.map((p) => p.y + ETIQUETTE_Y + ETIQUETTE_HAUTEUR_MAX)) + MARGE;
  return { parcelles, places, vue: { x: x0, y: y0, largeur: x1 - x0, hauteur: y1 - y0 } };
}

/** Coins du losange du terrain à l'écran : haut, droite, bas, gauche. */
export function terrainCoins() {
  const D = DEMI_TERRAIN;
  return [iso(-D, -D), iso(D, -D), iso(D, D), iso(-D, D)];
}


// ---------------------------------------------------------------- terrain et décor (listes de formes, sans DOM, même dessin à chaque affichage)
// Formes en plus des polygones et cercles : { ligne: [[x1, y1], [x2, y2]], trait, epaisseur } et { ellipse: [cx, cy, rx, ry], fill }.
// `sol` : formes posées à plat (dessinées d'abord) ; `objets` : choses debout ({ profondeur, formes }), dessinées du fond vers l'avant avec les bâtiments.

const HERBE = '#A9C46E';
const SENTIER = '#EFD9AE';
const LAVANDE = '#9A7FC4';

/** Un arbre posé au point (x, y) de l'écran : « rond » (feuillu) ou « cypres ». */
export function formesArbre(x, y, type = 'rond') {
  const f = [{ ellipse: [x, y, 12, 5], fill: '#3b2412', opacite: 0.14 }];
  if (type === 'cypres') {
    const profil = [[0, -62], [7, -50], [11, -32], [9, -14], [4, -3], [0, 0], [-4, -3], [-9, -14], [-11, -32], [-7, -50]];
    f.push({ poly: profil.map(([dx, dy]) => [x + dx, y + dy]), fill: '#4E7A45' });
    return f;
  }
  f.push({ ligne: [[x, y], [x, y - 16]], trait: '#7A5A3E', epaisseur: 5 });
  f.push({ cercle: [x, y - 28, 16], fill: '#7DAA5A' }, { cercle: [x - 6, y - 34, 7.5], fill: '#93BF6C' });
  return f;
}

/** Le terrain entier : la tranche de terre, l'herbe, puis les sentiers en croix entre les 4 parcelles. */
export function formesTerrain() {
  const D = DEMI_TERRAIN;
  const S = DEMI_SENTIER;
  const E = EPAISSEUR_TERRAIN;
  const [haut, droite, bas, gauche] = terrainCoins();
  const sous = ([x, y]) => [x, y + E];
  return [
    { poly: [gauche, bas, sous(bas), sous(gauche)], fill: '#8A6A45' },
    { poly: [bas, droite, sous(droite), sous(bas)], fill: '#6F5436' },
    { poly: [haut, droite, bas, gauche], fill: HERBE },
    poly([[-S, -D, 0], [S, -D, 0], [S, D, 0], [-S, D, 0]], SENTIER),
    poly([[-D, -S, 0], [D, -S, 0], [D, S, 0], [-D, S, 0]], SENTIER),
  ];
}

const BOSQUET = Object.freeze([[-2.6, -2.8, 'rond'], [0.9, -3.0, 'cypres'], [3.0, -1.0, 'rond'], [-3.1, 0.6, 'cypres'], [0.0, 0.0, 'rond'], [-1.0, 3.0, 'rond'], [2.4, 2.4, 'cypres']]);

/** Sol et objets d'une parcelle du plan (voir planVillage) : place pavée et deux arbres si un bâtiment l'occupe, sinon son décor. */
export function decorParcelle(parcelle) {
  const { gx, gy } = parcelle;
  const ici = (dx, dy, z = 0) => iso(gx + dx, gy + dy, z);
  const losange = (d, fill, extra) => ({ poly: [ici(-d, -d), ici(d, -d), ici(d, d), ici(-d, d)], fill, ...extra });
  const arbreEn = (dx, dy, type) => ({ profondeur: gx + dx + gy + dy, formes: formesArbre(...ici(dx, dy), type) });
  const sol = [];
  const objets = [];
  if (parcelle.occupee) {
    // sentier de la place vers le centre du terrain, puis la place pavée
    const vers = [-Math.sign(gx), -Math.sign(gy)];
    sol.push({ ligne: [ici(0, 0), ici(vers[0] * C, vers[1] * C)], trait: SENTIER, epaisseur: 18 });
    sol.push(losange(2.9, SENTIER));
    objets.push(arbreEn(-3.7, 3.3, 'cypres'), arbreEn(3.6, -3.5, 'rond'));
    return { sol, objets };
  }
  if (parcelle.decor === 'lavande') {
    sol.push(losange(4, '#B49A72'));
    for (let r = -3.5; r <= 3.51; r += 0.875) {
      const [a, b] = [ici(-3.6, r), ici(3.6, r)];
      sol.push({ ligne: [a, b], trait: LAVANDE, epaisseur: 7 });
      sol.push({ ligne: [[a[0], a[1] - 2.5], [b[0], b[1] - 2.5]], trait: '#B9A3E0', epaisseur: 3 });
    }
    objets.push(arbreEn(-4.0, -4.0, 'cypres'));
  } else if (parcelle.decor === 'potager') {
    sol.push(losange(3.7, '#9C6B43'));
    for (let c = -3.0; c <= 3.01; c += 1.2) {
      sol.push({ ligne: [ici(c, -3.2), ici(c, 3.2)], trait: '#7E5432', epaisseur: 5 });
      for (let k = -2.8; k <= 2.81; k += 0.8) {
        const [x, y] = ici(c, k);
        const tomate = Math.round((c + 3) / 1.2) % 2 === 1;
        sol.push({ cercle: [x, y - 3, tomate ? 3.4 : 4.6], fill: tomate ? '#E0703A' : '#6FA24A' });
      }
    }
    objets.push(arbreEn(-4.0, 3.9, 'rond'));
  } else {
    for (const [dx, dy, type] of BOSQUET) objets.push(arbreEn(dx, dy, type));
    for (const [dx, dy] of [[-1.6, 1.4], [1.8, 0.4], [-0.4, -1.8]]) {
      const [x, y] = ici(dx, dy);
      sol.push({ cercle: [x, y, 2.6], fill: '#F7C548' }, { cercle: [x + 7, y + 3, 2.2], fill: '#FFFDF6' });
    }
  }
  return { sol, objets };
}
