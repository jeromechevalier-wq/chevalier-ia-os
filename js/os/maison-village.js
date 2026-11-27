// Accueil « village » d'une maison (26/11/2026). Sans DOM ni Firebase : se teste seul (tests/maison-village.test.js) ; le dessin est posé par js/os/village-ecran.js.
// Le réglage est le champ FACULTATIF `besoins` de reglages_maison/ecran (lu à la connexion par js/os/comptes-maison.js) : une liste de 1 à 12 besoins du client,
// chacun { nom, phrase, batiment, cible, compteur?, id?, depart? } (ex. { nom: 'Factures', phrase: 'Valider mes factures fournisseurs', batiment: 'banque', cible: '#/achatsfactures/liste', compteur: 'factures_a_valider' }).
//  - `id` (facultatif, 27/11/2026) : identifiant stable du besoin (« factures », lettres minuscules, chiffres et tirets) ; il nomme la maison rangée de chaque utilisateur ;
//  - `depart: false` (facultatif, 27/11/2026) : le besoin n'est pas dans le village de départ, mais chacun peut l'ajouter par la roue dentée ;
//  - `compteur` (facultatif) : un identifiant de la liste fermée COMPTEURS ; le nombre est lu à l'affichage (js/os/village-compteurs.js) et montré dans la bulle du bâtiment ;
//  - un bâtiment = un BESOIN, pas un module : deux besoins peuvent mener au même module (deux vues différentes) ;
//  - champ ABSENT, liste vide ou aucune entrée valable : l'accueil d'avant ne change pas ;
//  - une entrée mal formée est ignorée (avertissement dans la console du navigateur) ; au-delà de 12 entrées valables, seules les 12 premières sont gardées ;
//  - `cible` : seulement une route interne « #/module/vue » (lettres, chiffres, - et _), jamais 'javascript:', 'http', '//' ni rien d'autre ;
//  - `batiment` absent ou inconnu : le bureau. Les textes sont coupés à une longueur raisonnable et posés par textContent (jamais innerHTML).

import { iso, BATIMENTS, BATIMENT_PAR_DEFAUT } from './village-batiments.js';

// Dessins des bâtiments et géométrie isométrique : js/os/village-batiments.js (catalogue), réexportés ici pour les appelants.
export { T, iso, BATIMENTS, BATIMENT_PAR_DEFAUT, dessinBatiment, CATALOGUE } from './village-batiments.js';
export const BESOINS_MAX = 12;
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

/**
 * Ce que la bulle montre pour un compteur selon l'état de sa lecture (26/11/2026, base parfois lente à se réveiller) :
 * `undefined` = lecture en cours : indicateur gris « Compte en cours » ; un nombre valable : la pastille ; `null` ou autre (erreur, délai dépassé) : rien.
 */
export function pastilleBulle(id, n) {
  if (n === undefined) return { attente: true, texte: 'Compte en cours' };
  const texte = textePastille(id, n);
  return texte ? { attente: false, texte, zero: n === 0 } : null;
}

/** Résultat de `lire()` (une fonction qui rend une promesse), ou null s'il n'est pas arrivé au bout de `delai` ms. Une erreur de `lire` remonte telle quelle. */
export async function avecDelai(lire, delai) {
  let minuteur;
  const trop = new Promise((r) => { minuteur = setTimeout(() => r(null), delai); });
  try {
    return await Promise.race([lire(), trop]);
  } finally {
    clearTimeout(minuteur);
  }
}

const ID_BESOIN = /^[a-z0-9][a-z0-9-]{0,39}$/;
const CIBLE = /^#\/[A-Za-z0-9][A-Za-z0-9_-]*(?:\/[A-Za-z0-9_-]+)*$/;

/** Vrai si `cible` est une route interne de l'appli (« #/achatsfactures/liste »). Tout le reste (javascript:, http, //, espaces, ?…) est refusé. */
export function cibleValide(cible) {
  return typeof cible === 'string' && cible.length <= 200 && CIBLE.test(cible);
}

// « Un bâtiment = une application » (27/11/2026, docs/village-charte.md) : module -> route de l'accueil de SON application.
// Un module absent de cette table n'a pas (encore) d'application : son bâtiment ouvre l'écran demandé, comme avant.
export const APPLIS_MODULES = Object.freeze({ achatsfactures: 'achatsfactures/pile' });

/**
 * Route où mène la cible d'un besoin au moment de l'ouvrir : si la cible est le module seul (« #/achatsfactures ») ou sa liste (« #/achatsfactures/liste ») et que
 * ce module a une application, la route de l'application ; sinon la cible telle quelle, sans le « #/ ». Une vue précise (autre écran, fiche) n'est jamais détournée.
 * Les données (reglages_maison/ecran.besoins) ne changent pas : seul l'endroit où l'on arrive change.
 */
export function routeDuBesoin(cible) {
  const route = String(cible ?? '').replace(/^#\/?/, '').replace(/\/+$/, '');
  const [module, vue, ...reste] = route.split('/');
  const appli = Object.prototype.hasOwnProperty.call(APPLIS_MODULES, module) ? APPLIS_MODULES[module] : null;
  return appli && !reste.length && (vue === undefined || vue === 'liste') ? appli : route;
}

const couper = (texte, max) => (texte.length > max ? `${texte.slice(0, max - 1).trimEnd()}…` : texte);
const texteSimple = (v) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : '');

/** Range la valeur brute du champ : { besoins: [{ nom, phrase, batiment, cible, compteur?, id?, depart? }], avertissements }. Liste vide = accueil d'avant. */
export function lireBesoinsMaison(brut) {
  if (brut === undefined || brut === null) return { besoins: [], avertissements: [] };
  if (!Array.isArray(brut)) return { besoins: [], avertissements: ['reglages_maison/ecran : le champ « besoins » doit être une liste ; accueil habituel.'] };
  const besoins = [];
  const avertissements = [];
  const ids = new Set();
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
    if (typeof b.id === 'string' && ID_BESOIN.test(b.id) && !ids.has(b.id)) { besoin.id = b.id; ids.add(b.id); } else if (b.id !== undefined) avertissements.push(`reglages_maison/ecran : besoin n° ${rang} : identifiant mal formé ou en double, ignoré.`);
    if (b.depart === false) besoin.depart = false;
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


// Le village est un DAMIER de 12 x 12 cases au départ rangé par chaque utilisateur (27/11/2026, js/os/village-damier.js) ; ce fichier garde la taille du terrain,
// la boîte d'un bâtiment et le dessin d'un arbre. Le terrain de départ fait 30 x 30 unités de la grille (20 x 20 avec l'ancien damier 8 x 8).
export const DEMI_TERRAIN = 15; // demi-côté du terrain de départ, en unités de la grille (12 cases de 2,5 unités : terrain de 30 x 30)
export const EPAISSEUR_TERRAIN = 12; // tranche de terre visible sous le terrain (pixels du dessin)
// Boîte d'un bâtiment autour de son centre à l'écran (pixels du dessin) : le toit monte jusqu'à -150 ; l'étiquette (le nom) est posée à +ETIQUETTE_Y sous le centre.
export const BOITE_BATIMENT = Object.freeze({ gauche: -100, droite: 100, haut: -150, bas: 50 });
export const ETIQUETTE_Y = 36;
export const ETIQUETTE_HAUTEUR_MAX = 40; // le nom seul (la phrase et le compteur sont dans la bulle)

/** Coins du losange du terrain à l'écran : haut, droite, bas, gauche. */
export function terrainCoins() {
  const D = DEMI_TERRAIN;
  return [iso(-D, -D), iso(D, -D), iso(D, D), iso(-D, D)];
}


// ---------------------------------------------------------------- décor (listes de formes, sans DOM, même dessin à chaque affichage)
// Formes en plus des polygones et cercles : { ligne: [[x1, y1], [x2, y2]], trait, epaisseur } et { ellipse: [cx, cy, rx, ry], fill }.

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
