// Damier du village de l'accueil (étape 2 de docs/accueil-village.md, 27/11/2026) : chaque utilisateur range SON village sur un damier de cases.
// Sans DOM ni Firebase : se teste seul (tests/maison-village.test.js). Les données sont lues et écrites par js/os/village-donnees.js, le dessin est posé par
// js/os/village-ecran.js, les gestes (glisser, double clic, appui long) par js/os/village-glisser.js.
//  - Damier de départ : 8 x 8 cases ; une case = 2,5 unités de la grille (le terrain garde sa taille : 20 x 20 unités). Une grande maison = 2 x 2 cases.
//  - Une case (c, l) : `c` le long de gx, `l` le long de gy ; la case (0, 0) est le coin du fond du terrain.
//  - Un document par maison rangée : village_utilisateurs/{uid}/batiments/{id} ; trois sortes (`besoin`, `lien`, `petite`), chacune avec ses champs.
//    `lireBatiments` rejoue EXACTEMENT les contrôles de firestore.rules (mêmes expressions, mêmes bornes) : un document mal formé est ignoré.
//  - Rangement d'office (D10) : jusqu'à 4 maisons, les 4 places d'avant (haut, gauche, droite, bas) ; au-delà, des blocs serrés dans un ordre fixe.
// N'importe rien d'un module métier (js/modules/…).
import { iso, T, BATIMENTS, BATIMENT_PAR_DEFAUT } from './village-batiments.js';
import { formesArbre, BOITE_BATIMENT, ETIQUETTE_Y, ETIQUETTE_HAUTEUR_MAX, EPAISSEUR_TERRAIN } from './maison-village.js';

export const CASE = 2.5;
export const DAMIER_DEPART = Object.freeze({ colonnes: 8, lignes: 8 });
export const TAILLE_GRANDE = 2;
export const TAILLE_PETITE = 1;
export const COORD_MAX = 23;

// ---------------------------------------------------------------- géométrie

const origine = (damier) => [-(damier.colonnes * CASE) / 2, -(damier.lignes * CASE) / 2];

/** Centre [gx, gy] du bloc de `taille` x `taille` cases dont le coin du fond est la case (c, l). */
export function centreBloc(c, l, taille, damier = DAMIER_DEPART) {
  const [gx0, gy0] = origine(damier);
  return [gx0 + (c + taille / 2) * CASE, gy0 + (l + taille / 2) * CASE];
}

/** Inverse de `iso` à z = 0 : point de l'écran (unités du dessin) vers la grille. */
export function ecranVersGrille(x, y) {
  return [x / (2 * T) + y / T, y / T - x / (2 * T)];
}

/** Le bloc dont le centre est le plus près du point (gx, gy) de la grille (peut sortir du damier). */
export function blocSousPoint(gx, gy, taille, damier = DAMIER_DEPART) {
  const [gx0, gy0] = origine(damier);
  return { c: Math.round((gx - gx0) / CASE - taille / 2), l: Math.round((gy - gy0) / CASE - taille / 2) };
}

/** Vrai si tout le bloc est dans le damier. */
export function dansDamier(c, l, taille, damier = DAMIER_DEPART) {
  return Number.isInteger(c) && Number.isInteger(l) && c >= 0 && l >= 0 && c + taille <= damier.colonnes && l + taille <= damier.lignes;
}

/** Les cases du bloc, sous la forme « c-l ». */
export function casesDuBloc(c, l, taille) {
  const res = [];
  for (let i = 0; i < taille; i++) for (let j = 0; j < taille; j++) res.push(`${c + i}-${l + j}`);
  return res;
}

// ---------------------------------------------------------------- besoins

const ID_BESOIN = /^[a-z0-9][a-z0-9-]{0,39}$/;
const CLE_MAX = 55; // l'identifiant du document (« b-<clé> », suffixe compris) reste sous les 60 caractères permis par les règles

/** Une clé stable par besoin, dans l'ordre de la liste (D4) : son `id` s'il est valable, sinon sa cible simplifiée ; « -2 », « -3 »… pour les doublons. */
export function clesBesoins(besoins) {
  const prises = new Set();
  return besoins.map((b) => {
    let base = typeof b?.id === 'string' && ID_BESOIN.test(b.id) ? b.id : String(b?.cible ?? '').replace(/^#\//, '').toLowerCase().replace(/[^a-z0-9]/g, '-');
    base = base.replace(/^-+|-+$/g, '').slice(0, CLE_MAX).replace(/-+$/, '') || 'besoin';
    let cle = base;
    for (let n = 2; prises.has(cle); n++) cle = `${base}-${n}`;
    prises.add(cle);
    return cle;
  });
}

/** Les besoins dont le premier morceau de la cible (« #/<prefixe>/… ») est dans `prefixes` (modules allumés pour ce compte, critère 2.9). */
export function besoinsServis(besoins, prefixes) {
  const permis = new Set(prefixes);
  return besoins.filter((b) => permis.has(String(b.cible ?? '').replace(/^#\//, '').split('/')[0]));
}

// ---------------------------------------------------------------- lecture défensive (mêmes contrôles que firestore.rules)

const RE_ID = Object.freeze({ besoin: /^b-[a-z0-9-]{1,60}$/, lien: /^l-[a-z0-9-]{1,60}$/, petite: /^p-[a-z0-9-]{1,60}$/ });
const CHAMPS = Object.freeze({
  besoin: ['sorte', 'c', 'l', 'cache', 'nom', 'modifieLe'],
  lien: ['sorte', 'nom', 'url', 'batiment', 'c', 'l', 'modifieLe'],
  petite: ['sorte', 'parent', 'nom', 'cible', 'modifieLe'],
});
export const RE_URL_LIEN = /^https:\/\/[A-Za-z0-9.-]+(:[0-9]{1,5})?([/?#][!-~]*)?$/;
const RE_BATIMENT = /^[a-z][a-z-]{0,29}$/;
const RE_PARENT = /^b-[a-z0-9-]{1,60}$/;
const RE_CIBLE = /^#\/[A-Za-z0-9][A-Za-z0-9_-]*(\/[A-Za-z0-9_-]+)*$/;

const caseValable = (v) => Number.isInteger(v) && v >= 0 && v <= COORD_MAX;
const a = (d, k) => Object.prototype.hasOwnProperty.call(d, k);
function placeValable(d, obligatoire) {
  if (a(d, 'c') && a(d, 'l')) return caseValable(d.c) && caseValable(d.l);
  return !obligatoire && !a(d, 'c') && !a(d, 'l');
}
const nomValable = (d) => typeof d.nom === 'string' && d.nom.length >= 1 && d.nom.length <= 40;

/** Vrai si le document `donnees` d'identifiant `id` passerait les règles (sans le champ `modifieLe`, posé par le serveur). */
export function batimentValable(id, donnees) {
  const d = donnees;
  if (!d || typeof d !== 'object' || Array.isArray(d) || typeof id !== 'string') return false;
  const s = d.sorte;
  if (!Object.prototype.hasOwnProperty.call(CHAMPS, s) || !RE_ID[s].test(id)) return false;
  if (!Object.keys(d).every((k) => CHAMPS[s].includes(k))) return false;
  if (s === 'besoin') return placeValable(d, false) && (!a(d, 'cache') || typeof d.cache === 'boolean') && (!a(d, 'nom') || nomValable(d));
  if (s === 'lien') {
    return nomValable(d) && placeValable(d, true) && typeof d.url === 'string' && d.url.length <= 300 && RE_URL_LIEN.test(d.url)
      && typeof d.batiment === 'string' && RE_BATIMENT.test(d.batiment);
  }
  return nomValable(d) && typeof d.parent === 'string' && RE_PARENT.test(d.parent) && typeof d.cible === 'string' && d.cible.length <= 200 && RE_CIBLE.test(d.cible);
}

/** Range les documents lus (`[{ id, ...donnees }]`) : { parId: Map(id → données sans `modifieLe`), avertissements } ; un document mal formé est ignoré. */
export function lireBatiments(docs) {
  const parId = new Map();
  const avertissements = [];
  for (const brut of Array.isArray(docs) ? docs : []) {
    if (!brut || typeof brut !== 'object') continue;
    const { id, modifieLe, ...donnees } = brut;
    if (!batimentValable(id, donnees)) { avertissements.push(`village : la maison « ${String(id).slice(0, 70)} » est mal rangée, elle est ignorée.`); continue; }
    parId.set(id, donnees);
  }
  return { parId, avertissements };
}

// ---------------------------------------------------------------- rangement

/** Places d'office jusqu'à 4 maisons : haut (au fond), gauche, droite, bas (devant) ; ce sont les 4 places d'avant le damier. */
const PLACES_QUATRE = Object.freeze([[1, 1], [1, 5], [5, 1], [5, 5]]);
/** Places d'office à partir de 5 maisons : les 16 blocs pairs, d'abord les 4 du centre, puis la couronne (milieux des bords, puis les coins). */
const PLACES_SEIZE = Object.freeze([
  [2, 2], [2, 4], [4, 2], [4, 4],
  [0, 2], [2, 0], [4, 6], [6, 4], [0, 4], [4, 0], [2, 6], [6, 2],
  [0, 0], [6, 0], [0, 6], [6, 6],
]);

/** Ensemble des cases prises (« c-l ») par une liste de maisons `{ id, c, l, taille }`. */
export function occupation(maisons) {
  const prises = new Map();
  for (const m of maisons) for (const k of casesDuBloc(m.c, m.l, m.taille)) prises.set(k, m.id);
  return prises;
}

/** Vrai si le bloc (c, l, taille) est dans le damier et qu'aucune de ses cases n'est prise (sauf par la maison `saufId`). */
export function blocLibre(occupees, c, l, taille, damier = DAMIER_DEPART, saufId = null) {
  if (!dansDamier(c, l, taille, damier)) return false;
  return casesDuBloc(c, l, taille).every((k) => !occupees.has(k) || occupees.get(k) === saufId);
}

/** Premier bloc libre : d'abord les places d'office (ordre fixe), puis toutes les cases, rang par rang. null si le damier est plein. */
export function premierBlocLibre(occupees, taille, damier = DAMIER_DEPART, saufId = null) {
  const essais = taille === TAILLE_GRANDE ? [...PLACES_SEIZE] : [];
  for (let l = 0; l < damier.lignes; l++) for (let c = 0; c < damier.colonnes; c++) essais.push([c, l]);
  for (const [c, l] of essais) if (blocLibre(occupees, c, l, taille, damier, saufId)) return { c, l };
  return null;
}

/**
 * Range le village : { maisons, cachees, sansPlace }.
 *  - `besoins` : les besoins de la maison (déjà filtrés) ; `batiments` : Map(id → données) lue par `lireBatiments` ;
 *  - une maison = { id, sorte: 'besoin', cle, besoin, nom, c, l, taille: 2, enregistree, donnees } (`donnees` : le document enregistré, ou {}) ;
 *  - `cachees` = besoins non visibles { id, cle, besoin, donnees, raison: 'cache' | 'depart' } ; `sansPlace` = visibles mais sans bloc libre.
 */
export function rangerVillage({ besoins, batiments = new Map(), damier = DAMIER_DEPART }) {
  const cles = clesBesoins(besoins);
  const visibles = [];
  const cachees = [];
  besoins.forEach((besoin, i) => {
    const id = `b-${cles[i]}`;
    const donnees = batiments.get(id) || {};
    const visible = donnees.cache === false || (donnees.cache === undefined && besoin.depart !== false);
    const entree = { id, cle: cles[i], besoin, donnees };
    if (visible) visibles.push(entree);
    else cachees.push({ ...entree, raison: donnees.cache === true ? 'cache' : 'depart' });
  });
  const maisons = [];
  const placees = new Set();
  let prises = new Map();
  const poser = (e, c, l, enregistree) => {
    maisons.push({ id: e.id, sorte: 'besoin', cle: e.cle, besoin: e.besoin, nom: e.donnees.nom || e.besoin.nom, c, l, taille: TAILLE_GRANDE, enregistree, donnees: e.donnees });
    prises = occupation(maisons);
    placees.add(e.id);
  };
  // 1. les places enregistrées (dans le damier, sans chevauchement ; en cas de conflit, la suivante est rangée d'office)
  for (const e of visibles) {
    const { c, l } = e.donnees;
    if (Number.isInteger(c) && Number.isInteger(l) && blocLibre(prises, c, l, TAILLE_GRANDE, damier)) poser(e, c, l, true);
  }
  // 2. les autres, dans l'ordre des besoins : la place d'office de leur rang si elle est libre, sinon le premier bloc libre
  const sansPlace = [];
  const ordre = visibles.length <= 4 ? PLACES_QUATRE : PLACES_SEIZE;
  visibles.forEach((e, rang) => {
    if (placees.has(e.id)) return;
    const office = ordre[rang];
    if (office && blocLibre(prises, office[0], office[1], TAILLE_GRANDE, damier)) { poser(e, office[0], office[1], false); return; }
    const libre = premierBlocLibre(prises, TAILLE_GRANDE, damier);
    if (libre) poser(e, libre.c, libre.l, false);
    else sansPlace.push(e);
  });
  const rang = new Map(visibles.map((e, i) => [e.id, i]));
  maisons.sort((u, v) => rang.get(u.id) - rang.get(v.id));
  return { maisons, cachees, sansPlace };
}

// ---------------------------------------------------------------- vue, terrain et décor (listes de formes, sans DOM, même dessin à chaque affichage)

const MARGE = 8;
const HERBE = '#A9C46E';

/** Coins du terrain du damier à l'écran : haut, droite, bas, gauche. */
export function coinsDamier(damier = DAMIER_DEPART) {
  const [gx0, gy0] = origine(damier);
  const [gx1, gy1] = [-gx0, -gy0];
  return [iso(gx0, gy0), iso(gx1, gy0), iso(gx1, gy1), iso(gx0, gy1)];
}

/**
 * Cadre du dessin : le losange du terrain, la hauteur d'un toit posé au fond, les étiquettes de devant, la tranche de terre, 8 px de marge.
 * Ne dépend PAS du nombre de maisons : le village ne saute pas quand on en ajoute une.
 */
export function vueVillage(damier = DAMIER_DEPART) {
  const coins = coinsDamier(damier);
  const fond = iso(...centreBloc(0, 0, TAILLE_GRANDE, damier));
  const devant = iso(...centreBloc(damier.colonnes - TAILLE_GRANDE, damier.lignes - TAILLE_GRANDE, TAILLE_GRANDE, damier));
  const x0 = Math.min(...coins.map((c) => c[0])) - MARGE;
  const x1 = Math.max(...coins.map((c) => c[0])) + MARGE;
  const y0 = Math.min(coins[0][1], fond[1] + BOITE_BATIMENT.haut) - MARGE;
  const y1 = Math.max(coins[2][1] + EPAISSEUR_TERRAIN, devant[1] + ETIQUETTE_Y + ETIQUETTE_HAUTEUR_MAX) + MARGE;
  return { x: x0, y: y0, largeur: x1 - x0, hauteur: y1 - y0 };
}

/** Le terrain : la tranche de terre et l'herbe (plus de sentiers en croix : le damier est libre). */
export function formesDamier(damier = DAMIER_DEPART) {
  const E = EPAISSEUR_TERRAIN;
  const [haut, droite, bas, gauche] = coinsDamier(damier);
  const sous = ([x, y]) => [x, y + E];
  return [
    { poly: [gauche, bas, sous(bas), sous(gauche)], fill: '#8A6A45' },
    { poly: [bas, droite, sous(droite), sous(bas)], fill: '#6F5436' },
    { poly: [haut, droite, bas, gauche], fill: HERBE },
  ];
}

/** Le quadrillage (montré seulement pendant le rangement) : une ligne par bord de case. */
export function lignesDamier(damier = DAMIER_DEPART) {
  const [gx0, gy0] = origine(damier);
  const lignes = [];
  for (let c = 0; c <= damier.colonnes; c++) lignes.push({ ligne: [iso(gx0 + c * CASE, gy0), iso(gx0 + c * CASE, -gy0)], trait: '#FFFDF6', epaisseur: 1.2 });
  for (let l = 0; l <= damier.lignes; l++) lignes.push({ ligne: [iso(gx0, gy0 + l * CASE), iso(-gx0, gy0 + l * CASE)], trait: '#FFFDF6', epaisseur: 1.2 });
  return lignes;
}

/** Losange d'un bloc à plat (sol), réduit de `retrait` unités de chaque côté. */
export function losangeBloc(c, l, taille, damier = DAMIER_DEPART, retrait = 0) {
  const [gx, gy] = centreBloc(c, l, taille, damier);
  const d = (taille * CASE) / 2 - retrait;
  return [iso(gx - d, gy - d), iso(gx + d, gy - d), iso(gx + d, gy + d), iso(gx - d, gy + d)];
}

// Décor des cases libres : une liste FIXE d'emplacements d'une case (arbres ronds, cyprès, fleurs du pré), chacun dessiné seulement si sa case est libre.
const DECOR = Object.freeze([
  [0, 0, 'cypres'], [3, 0, 'rond'], [7, 1, 'fleurs'], [0, 3, 'rond'], [7, 4, 'cypres'], [4, 3, 'fleurs'],
  [2, 7, 'cypres'], [7, 7, 'rond'], [5, 6, 'fleurs'], [1, 5, 'fleurs'], [6, 0, 'rond'], [0, 7, 'rond'],
]);

/** Objets du décor `{ profondeur, formes }` posés sur les cases libres (même dessin à chaque appel). */
export function decorLibre(occupees, damier = DAMIER_DEPART) {
  const objets = [];
  for (const [c, l, type] of DECOR) {
    if (!dansDamier(c, l, 1, damier) || occupees.has(`${c}-${l}`)) continue;
    const [gx, gy] = centreBloc(c, l, 1, damier);
    const [x, y] = iso(gx, gy);
    if (type === 'fleurs') {
      const formes = [];
      for (const [dx, dy, coul] of [[-9, -2, '#F7C548'], [4, -5, '#FFFDF6'], [10, 3, '#F7C548'], [-3, 5, '#E4572E'], [-12, 6, '#FFFDF6']]) formes.push({ cercle: [x + dx, y + dy, 2.6], fill: coul });
      objets.push({ profondeur: gx + gy, formes, case: `${c}-${l}` });
    } else {
      objets.push({ profondeur: gx + gy, formes: formesArbre(x, y, type), case: `${c}-${l}` });
    }
  }
  return objets;
}

// ---------------------------------------------------------------- fabriques d'écriture (le document ENTIER, sans `modifieLe` : la couche de données l'ajoute)

const garder = (maison) => ({ ...(maison.donnees || {}), sorte: maison.sorte || 'besoin' });

/** Document d'une maison déplacée en (c, l). */
export function docDeplacement(maison, c, l) {
  return { ...garder(maison), c, l };
}

/** Document d'une maison cachée (`cache` vrai) ou montrée (`cache` faux) ; sa place est gardée. */
export function docCacher(maison, cache) {
  return { ...garder(maison), cache: Boolean(cache) };
}

/** Document d'une maison renommée ; nom vide ou égal au nom du besoin : le champ `nom` disparaît (le nom d'origine revient). */
export function docRenommer(maison, nom) {
  const d = garder(maison);
  const propre = typeof nom === 'string' ? nom.replace(/\s+/g, ' ').trim().slice(0, 40) : '';
  if (!propre || propre === maison.besoin?.nom) delete d.nom;
  else d.nom = propre;
  return d;
}

/** Dessin d'un bâtiment du catalogue (bureau si inconnu) : réexporté pour les petites vignettes de la roue et de la liste. */
export const batimentConnu = (nom) => (BATIMENTS.includes(nom) ? nom : BATIMENT_PAR_DEFAUT);
