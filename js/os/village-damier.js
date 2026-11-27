// Damier du village de l'accueil (étape 2 de docs/accueil-village.md, 27/11/2026) : chaque utilisateur range SON village sur un damier de cases.
// Sans DOM ni Firebase : se teste seul (tests/maison-village.test.js). Les données sont lues et écrites par js/os/village-donnees.js, le dessin est posé par
// js/os/village-ecran.js, les gestes (glisser, double clic, appui long) par js/os/village-glisser.js.
//  - Damier de départ : 12 x 12 cases (8 x 8 jusqu'au 27/11/2026) ; une case = 2,5 unités de la grille (terrain de départ : 30 x 30 unités). Une grande maison = 2 x 2 cases.
//  - Une case (c, l) : `c` le long de gx, `l` le long de gy ; la case (0, 0) est le coin du fond du terrain.
//  - Un document par maison rangée : village_utilisateurs/{uid}/batiments/{id} ; trois sortes (`besoin`, `lien`, `petite`), chacune avec ses champs.
//    `lireBatiments` rejoue EXACTEMENT les contrôles de firestore.rules (mêmes expressions, mêmes bornes) : un document mal formé est ignoré.
//  - Rangement d'office (D10) : jusqu'à 4 maisons, les 4 places d'avant (haut, gauche, droite, bas) ; au-delà, des blocs serrés dans un ordre fixe.
//  - Objets achetés (étape 6b : décorations ; champ et enclos à l'étape 7) : documents `o-…` créés par le serveur, qui se déplacent seulement. Ils ont leur liste
//    à part (`objets` de rangerVillage) : `maisons` reste « les bâtiments avec un besoin » (compteurs, bulle, liste, roue n'ont pas à les connaître).
// N'importe rien d'un module métier (js/modules/…).
import { iso, T, BATIMENTS, BATIMENT_PAR_DEFAUT } from './village-batiments.js';
import { MODELES_DECORATION, TAILLES, TAILLE_MAISON, COTE_DEPART } from './village-jeu-regles.js';
import { formesArbre, BOITE_BATIMENT, ETIQUETTE_Y, ETIQUETTE_HAUTEUR_MAX, EPAISSEUR_TERRAIN } from './maison-village.js';

export const CASE = 2.5;
/** Damier de départ : une seule source, COTE_DEPART de la règle partagée (12 x 12). */
export const DAMIER_DEPART = Object.freeze({ colonnes: COTE_DEPART, lignes: COTE_DEPART });
export const TAILLE_GRANDE = 2;
export const TAILLE_PETITE = 1;
export const COORD_MAX = 23;
/** Liens externes au plus par utilisateur (étape 3b, décision L1). */
export const LIENS_MAX = 6;

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
  petite: ['sorte', 'parent', 'nom', 'cible', 'cachee', 'modifieLe'], // 3c-bis : cachee (true seulement)
});
// Après l'hôte : les caractères visibles de l'ASCII, sauf " ' < > ` \ (ils servent à casser un attribut ou un texte) et [ ] (le validateur des règles
// les refuse dans une classe, même échappés) ; liste écrite caractère par caractère, la même que dans firestore.rules.
export const RE_URL_LIEN = /^https:\/\/[A-Za-z0-9.-]+(:[0-9]{1,5})?([/?#][-!#$%&()*+,./0-9:;=?@A-Z^_a-z{|}~]*)?$/;
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
  return nomValable(d) && typeof d.parent === 'string' && RE_PARENT.test(d.parent) && typeof d.cible === 'string' && d.cible.length <= 200 && RE_CIBLE.test(d.cible)
    && (!a(d, 'cachee') || d.cachee === true);
}

// ---------------------------------------------------------------- liens externes (étape 3b, 27/11/2026)

const PROTOCOLE = /^([a-z][a-z0-9+.-]*):/i;
// Caractères refusés par RE_URL_LIEN que le navigateur laisse tels quels dans le chemin : ils sont encodés (même adresse pour le site).
const A_ENCODER = /['"<>`\\[\]]/g;

/**
 * Contrôle d'une adresse saisie pour un lien externe : { ok: true, url } ou { ok: false, message }. « monsite.fr » reçoit https:// tout seul ;
 * tout autre protocole que https (http, javascript, data, ftp…) est refusé ; pas d'identifiants ; un hôte avec un point ; 300 caractères au plus ;
 * puis la même expression que les règles (RE_URL_LIEN).
 */
export function adresseExterne(saisie) {
  const brut = typeof saisie === 'string' ? saisie.trim() : '';
  if (!brut) return { ok: false, message: 'Écris l’adresse du site.' };
  const proto = brut.match(PROTOCOLE);
  // « monsite.fr:8080 » n'a pas de protocole (un point avant les deux-points) ; « javascript: », « http: » en ont un.
  const texte = proto && !proto[1].includes('.') ? brut : `https://${brut.replace(/^\/+/, '')}`;
  let url;
  try { url = new URL(texte); } catch { return { ok: false, message: 'Cette adresse n’est pas valable. Exemple : monsite.fr' }; }
  if (url.protocol !== 'https:') return { ok: false, message: 'L’adresse doit commencer par https://' };
  if (url.username || url.password) return { ok: false, message: 'L’adresse ne doit contenir ni nom d’utilisateur ni mot de passe.' };
  if (!/^[a-z0-9-]+(\.[a-z0-9-]+)+$/i.test(url.hostname)) return { ok: false, message: 'Cette adresse n’est pas valable. Exemple : monsite.fr' };
  const href = url.origin + url.href.slice(url.origin.length).replace(A_ENCODER, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, '0')}`);
  if (href.length > 300) return { ok: false, message: 'L’adresse est trop longue (300 caractères au plus).' };
  if (!RE_URL_LIEN.test(href)) return { ok: false, message: 'Cette adresse n’est pas valable. Exemple : monsite.fr' };
  return { ok: true, url: href };
}

// ---------------------------------------------------------------- objets achetés (étape 6b, 27/11/2026 ; mêmes contrôles que villageObjetDeplace des règles)

const RE_OBJET = /^o-[a-z0-9-]{1,60}$/;
const CHAMPS_OBJET = Object.freeze(['sorte', 'modele', 'c', 'l', 'acheteLe', 'depuis']);
/** Vrai pour une sorte d'objet du jeu (décoration, champ, enclos). */
export const estSorteJeu = (sorte) => typeof sorte === 'string' && Object.hasOwn(TAILLES, sorte);
const dateValable = (d, k) => !a(d, k) || (d[k] instanceof Date) || (d[k] !== null && typeof d[k] === 'object' && typeof d[k].toMillis === 'function');

/** Vrai si le document `donnees` d'identifiant `id` est un objet acheté bien formé (sans `modifieLe`) : place obligatoire, modèle connu pour une décoration. */
export function objetValable(id, donnees) {
  const d = donnees;
  if (!d || typeof d !== 'object' || Array.isArray(d) || typeof id !== 'string' || !RE_OBJET.test(id)) return false;
  if (!estSorteJeu(d.sorte) || !Object.keys(d).every((k) => CHAMPS_OBJET.includes(k))) return false;
  if (!placeValable(d, true)) return false;
  if (d.sorte === 'decoration' ? !MODELES_DECORATION.includes(d.modele) : a(d, 'modele')) return false;
  return dateValable(d, 'acheteLe') && dateValable(d, 'depuis');
}

/**
 * Le plus petit damier (côté pair, de 12 à 24) qui contient toutes les places enregistrées (`batiments` : Map(id → données) ou liste de données) : maisons 2 x 2,
 * objets selon leur taille. Sert quand les parcelles ne sont pas connues (portefeuille illisible) : aucune maison rangée plus loin n'est reclassée d'office.
 */
export function damierPourPlaces(batiments) {
  const docs = batiments instanceof Map ? [...batiments.values()] : Array.isArray(batiments) ? batiments : [];
  let besoin = DAMIER_DEPART.colonnes;
  for (const d of docs) {
    if (!d || !Number.isInteger(d.c) || !Number.isInteger(d.l)) continue;
    const taille = d.sorte === 'besoin' || d.sorte === 'lien' ? TAILLE_MAISON : estSorteJeu(d.sorte) ? TAILLES[d.sorte] : 0;
    if (taille) besoin = Math.max(besoin, d.c + taille, d.l + taille);
  }
  const cote = Math.min(COORD_MAX + 1, besoin + (besoin % 2));
  return { colonnes: cote, lignes: cote };
}

/**
 * Range les documents lus (`[{ id, ...donnees }]`) : { parId: Map(id → données sans `modifieLe`), avertissements, ignores: Set(id) } ; un document mal formé est
 * ignoré, et son identifiant noté : l'écran ne le réécrit jamais d'office.
 */
export function lireBatiments(docs) {
  const parId = new Map();
  const avertissements = [];
  const ignores = new Set();
  for (const brut of Array.isArray(docs) ? docs : []) {
    if (!brut || typeof brut !== 'object') continue;
    const { id, modifieLe, ...donnees } = brut;
    if (!batimentValable(id, donnees) && !objetValable(id, donnees)) { avertissements.push(`village : la maison « ${String(id).slice(0, 70)} » est mal rangée, elle est ignorée.`); if (typeof id === 'string') ignores.add(id); continue; }
    parId.set(id, donnees);
  }
  return { parId, avertissements, ignores };
}

// ---------------------------------------------------------------- rangement

// Places d'office jusqu'à 9 maisons : dessinées pour l'ancien damier 8 x 8 (cases 0 à 7), décalées de +2 en c et en l (27/11/2026) pour rester au centre du
// damier 12 x 12, entourées d'une marge de 2 cases (de 10 à 12 maisons : PLACES_SEIZE, plus bas). Le décalage est FIXE (le même quel que soit le damier) : une maison non enregistrée ne change pas de case à chaque parcelle.
/** Places d'office jusqu'à 4 maisons : haut (au fond), gauche, droite, bas (devant). */
const PLACES_QUATRE = Object.freeze([[3, 3], [3, 7], [7, 3], [7, 7]]);
/**
 * Places d'office de 5 à 9 maisons : parmi les 9 blocs espacés (2, 5, 8), toujours une case libre entre deux maisons. Une maison en cache une autre à
 * l'écran quand elles sont dans la même colonne d'écran (même c - l) à un bloc d'écart : on l'évite tant que c'est possible.
 *  - 5 maisons : un zigzag au milieu (5 colonnes différentes) ;
 *  - 6 à 9 : les 4 coins, une maison par colonne (fond gauche, avant droite), puis les deux autres, le centre en dernier.
 */
const PLACES_CINQ = Object.freeze([[2, 8], [8, 2], [5, 5], [2, 5], [5, 2]]);
const PLACES_NEUF = Object.freeze([
  [2, 8], [8, 2], [2, 2], [8, 8], [2, 5], [8, 5],
  [5, 2], [5, 8], [5, 5],
]);
/**
 * Places d'office de 10 à 12 maisons : les 16 blocs espacés (0, 3, 6, 9) du damier 12 x 12, toujours une case libre entre deux maisons (27/11/2026 : les
 * 16 blocs pairs serrés d'avant faisaient se chevaucher les noms, agrandis pour l'ordinateur ; ces places-là vont jusqu'au bord du damier).
 * La couronne d'abord, le centre en dernier : avec 12 maisons, le centre reste vide et presque aucune maison n'en cache une autre de sa colonne d'écran
 * (coins, milieux des bords, puis les quatre qui partagent une colonne, puis le centre).
 */
const PLACES_SEIZE = Object.freeze([
  [0, 0], [9, 0], [0, 9], [9, 9],
  [0, 3], [3, 0], [6, 9], [9, 6],
  [6, 0], [0, 6], [9, 3], [3, 9],
  [3, 3], [3, 6], [6, 3], [6, 6],
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

/** Premier bloc libre : d'abord les places espacées, puis les blocs pairs (ordre fixe), puis toutes les cases, rang par rang. null si le damier est plein. */
export function premierBlocLibre(occupees, taille, damier = DAMIER_DEPART, saufId = null) {
  const essais = taille === TAILLE_GRANDE ? [...PLACES_NEUF, ...PLACES_SEIZE] : [];
  for (let l = 0; l < damier.lignes; l++) for (let c = 0; c < damier.colonnes; c++) essais.push([c, l]);
  for (const [c, l] of essais) if (blocLibre(occupees, c, l, taille, damier, saufId)) return { c, l };
  return null;
}

/**
 * 6b : la case proposée pour une décoration achetée : la case libre la plus « devant » (plus grand c + l, puis la plus proche du milieu, puis la plus à gauche).
 * Le premier bloc libre du haut tombait souvent derrière une maison, où l'objet acheté était caché et impossible à saisir (Décision prise seul, 27/11/2026).
 */
export function caseLibreDevant(occupees, damier = DAMIER_DEPART, taille = 1) {
  let meilleure = null;
  for (let l = 0; l <= damier.lignes - taille; l++) for (let c = 0; c <= damier.colonnes - taille; c++) {
    if (!blocLibre(occupees, c, l, taille, damier)) continue;
    const rang = [c + l, -Math.abs(c - l), -c];
    if (!meilleure || rang[0] > meilleure.rang[0] || (rang[0] === meilleure.rang[0] && (rang[1] > meilleure.rang[1] || (rang[1] === meilleure.rang[1] && rang[2] > meilleure.rang[2])))) meilleure = { c, l, rang };
  }
  return meilleure ? { c: meilleure.c, l: meilleure.l } : null;
}

/**
 * Range le village : { maisons, cachees, sansPlace, objets, objetsSansPlace } (6b : les objets achetés, à part).
 *  - `besoins` : les besoins de la maison (déjà filtrés) ; `batiments` : Map(id → données) lue par `lireBatiments` ;
 *  - une maison = { id, sorte: 'besoin', cle, besoin, nom, c, l, taille: 2, enregistree, donnees } (`donnees` : le document enregistré, ou {}) ;
 *  - `cachees` = besoins non visibles { id, cle, besoin, donnees, raison: 'cache' | 'depart' } ; `sansPlace` = visibles mais sans bloc libre.
 *  - les liens externes (documents `lien` de `batiments`, étape 3b) : { id, sorte: 'lien', besoin: { nom, batiment }, nom, url, invalide, c, l, taille: 2, … },
 *    après les besoins, dans l'ordre de leurs identifiants (l'heure de création) ; `invalide` : l'adresse ne passe plus `adresseExterne` (jamais ouverte).
 */
export function rangerVillage({ besoins, batiments = new Map(), damier = DAMIER_DEPART }) {
  // 6b : les objets achetés. `objets` = { id, sorte, modele, c, l, taille, enregistree, deplaceAffiche, donnees } ; un objet en conflit ou hors du damier est
  // montré au premier bloc libre de sa taille, À L'AFFICHAGE SEULEMENT (deplaceAffiche : jamais écrit d'office) ; sans place du tout : objetsSansPlace.
  const objets = [];
  const objetsSansPlace = [];
  const docsObjets = [...batiments].filter(([, d]) => estSorteJeu(d?.sorte)).sort(([u], [v]) => (u < v ? -1 : 1));
  const poserObjet = (id, d, c, l, enregistree) => {
    objets.push({ id, sorte: d.sorte, modele: d.modele, c, l, taille: TAILLES[d.sorte], enregistree, deplaceAffiche: !enregistree, donnees: d });
  };
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
    prises = occupation([...maisons, ...objets]);
    placees.add(e.id);
  };
  // 1. les places enregistrées (dans le damier, sans chevauchement ; en cas de conflit, la suivante est rangée d'office)
  for (const e of visibles) {
    const { c, l } = e.donnees;
    if (Number.isInteger(c) && Number.isInteger(l) && blocLibre(prises, c, l, TAILLE_GRANDE, damier)) poser(e, c, l, true);
  }
  // 1 bis. les liens externes à leur place enregistrée (sinon, plus bas, au premier bloc libre)
  const liens = [...batiments].filter(([, d]) => d?.sorte === 'lien').sort(([u], [v]) => (u < v ? -1 : 1)).map(([id, d]) => ({ id, donnees: d }));
  const poserLien = (e, c, l, enregistree) => {
    maisons.push({
      id: e.id, sorte: 'lien', besoin: { nom: e.donnees.nom, batiment: batimentConnu(e.donnees.batiment) }, nom: e.donnees.nom, url: e.donnees.url,
      invalide: !adresseExterne(e.donnees.url).ok, c, l, taille: TAILLE_GRANDE, enregistree, donnees: e.donnees,
    });
    prises = occupation([...maisons, ...objets]);
    placees.add(e.id);
  };
  for (const e of liens) if (blocLibre(prises, e.donnees.c, e.donnees.l, TAILLE_GRANDE, damier)) poserLien(e, e.donnees.c, e.donnees.l, true);
  // 1 ter. les objets à leur place enregistrée (avant les maisons rangées d'office)
  const objetsEnAttente = [];
  for (const [id, d] of docsObjets) {
    if (blocLibre(prises, d.c, d.l, TAILLES[d.sorte], damier)) { poserObjet(id, d, d.c, d.l, true); prises = occupation([...maisons, ...objets]); } else objetsEnAttente.push([id, d]);
  }
  // 2. les autres, dans l'ordre des besoins : la place d'office de leur rang si elle est libre, sinon le premier bloc libre
  const sansPlace = [];
  const n = visibles.length;
  const ordre = n <= 4 ? PLACES_QUATRE : n === 5 ? PLACES_CINQ : n <= PLACES_NEUF.length ? PLACES_NEUF : PLACES_SEIZE;
  visibles.forEach((e, rang) => {
    if (placees.has(e.id)) return;
    const office = ordre[rang];
    if (office && blocLibre(prises, office[0], office[1], TAILLE_GRANDE, damier)) { poser(e, office[0], office[1], false); return; }
    const libre = premierBlocLibre(prises, TAILLE_GRANDE, damier);
    if (libre) poser(e, libre.c, libre.l, false);
    else sansPlace.push(e);
  });
  for (const e of liens) {
    if (placees.has(e.id)) continue;
    const libre = premierBlocLibre(prises, TAILLE_GRANDE, damier);
    if (libre) poserLien(e, libre.c, libre.l, false);
    else sansPlace.push(e);
  }
  // 3. les objets en conflit ou hors du damier : au premier bloc libre de leur taille, à l'affichage seulement
  for (const [id, d] of objetsEnAttente) {
    const libre = premierBlocLibre(prises, TAILLES[d.sorte], damier);
    if (libre) { poserObjet(id, d, libre.c, libre.l, false); prises = occupation([...maisons, ...objets]); } else objetsSansPlace.push({ id, sorte: d.sorte, modele: d.modele, donnees: d });
  }
  const rang = new Map([...visibles, ...liens].map((e, i) => [e.id, i]));
  maisons.sort((u, v) => rang.get(u.id) - rang.get(v.id));
  return { maisons, cachees, sansPlace, objets, objetsSansPlace };
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
// Damier 12 x 12 (27/11/2026) : sur les bords et dans les coins (cases 0, 1, 10, 11), hors des places d'office (cases 2 à 9), sauf les fleurs en (9, 3) :
// prises par la 2e maison d'office à partir de 6 maisons, elles montrent qu'un village plus rempli a moins de décor (test V19).
const DECOR = Object.freeze([
  [0, 0, 'cypres'], [4, 0, 'rond'], [11, 1, 'fleurs'], [0, 4, 'rond'], [11, 5, 'cypres'], [9, 3, 'fleurs'],
  [3, 11, 'cypres'], [11, 11, 'rond'], [8, 10, 'fleurs'], [1, 7, 'fleurs'], [10, 0, 'rond'], [0, 11, 'rond'],
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

/** Nom nettoyé (espaces) et coupé selon le contrat de nomValable et des règles (.length <= 40, en unités UTF-16), jamais au milieu d'un emoji. */
export function nomCourt(nom) {
  const propre = typeof nom === 'string' ? nom.replace(/\s+/g, ' ').trim() : '';
  let court = '';
  for (const car of propre) { if ((court + car).length > 40) break; court += car; }
  return court;
}

/** Document d'une maison renommée ; nom vide ou égal au nom du besoin : le champ `nom` disparaît (le nom d'origine revient). */
export function docRenommer(maison, nom) {
  const d = garder(maison);
  const court = nomCourt(nom);
  if (!court || court === maison.besoin?.nom) delete d.nom;
  else d.nom = court;
  return d;
}

/**
 * Document d'un lien externe (étape 3b) : { sorte: 'lien', nom, url, batiment, c, l }. `url` doit déjà sortir de `adresseExterne` ; un bâtiment inconnu
 * devient le bureau. Rend null si le nom est vide ou l'adresse refusée.
 */
export function docLien({ nom, url, batiment, c, l }) {
  const court = nomCourt(nom);
  const adresse = adresseExterne(url);
  if (!court || !adresse.ok) return null;
  return { sorte: 'lien', nom: court, url: adresse.url, batiment: batimentConnu(batiment), c, l };
}

/** Dessin d'un bâtiment du catalogue (bureau si inconnu) : réexporté pour les petites vignettes de la roue et de la liste. */
export const batimentConnu = (nom) => (BATIMENTS.includes(nom) ? nom : BATIMENT_PAR_DEFAUT);
