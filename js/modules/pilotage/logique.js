// Règles pures du module Pilotage (sans Firebase ni DOM, testées par Node) : injection des lignes dans une option ECharts, habillage non destructif,
// lecture de la réponse du serveur et messages d'erreur. L'option reçue du serveur est une DONNÉE : on la copie, on la complète, on la passe à `setOption` ; jamais exécutée.

export const TITRE_PAGE = 'Pilotage';
export const MESSAGE_VIDE = 'Aucun tableau n\'est encore réglé pour cet espace.';
export const MESSAGE_NON_BRANCHE = 'Le Pilotage n\'est pas encore branché sur cet espace.';
export const MESSAGE_TUILE_ERREUR = 'Cette tuile n\'a pas pu être lue.';
export const MESSAGE_TUILE_VIDE = 'Pas encore de données.';
export const MESSAGE_TUILE_INVALIDE = 'Cette tuile n\'a pas pu être dessinée.';
const MESSAGE_LECTURE = 'Ça n\'a pas abouti. Réessaie dans un instant.';

const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Copie profonde d'une valeur JSON (objets, tableaux, scalaires) : jamais de partage avec l'original. */
export function copier(v) {
  if (Array.isArray(v)) return v.map(copier);
  if (estObjet(v)) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, copier(x)]));
  return v;
}

/**
 * Injecte les lignes dans `option.dataset` sans modifier l'option reçue.
 * dataset objet : `source` = lignes ; tableau : le premier jeu reçoit les lignes (les suivants, comme un `transform`, y renvoient par `fromDatasetIndex`) ;
 * absent (ou tableau vide) : `dataset: { source: lignes }`.
 */
export function injecterLignes(option, lignes) {
  const sortie = copier(estObjet(option) ? option : {});
  const source = copier(Array.isArray(lignes) ? lignes : []);
  if (Array.isArray(sortie.dataset) && sortie.dataset.length) {
    sortie.dataset[0] = { ...(estObjet(sortie.dataset[0]) ? sortie.dataset[0] : {}), source };
  } else if (estObjet(sortie.dataset)) {
    sortie.dataset.source = source;
  } else {
    sortie.dataset = { source };
  }
  return sortie;
}

/** Fusion non destructive : `base` ne fournit que les valeurs absentes ; ce que porte `surcharge` gagne (un tableau de la surcharge remplace celui de la base). Rien n'est modifié. */
export function fusionner(base, surcharge) {
  if (surcharge === undefined) return copier(base);
  if (!estObjet(base) || !estObjet(surcharge)) return copier(surcharge);
  const sortie = copier(base);
  for (const [k, v] of Object.entries(surcharge)) sortie[k] = k in sortie ? fusionner(sortie[k], v) : copier(v);
  return sortie;
}

/** L'infobulle ne montre jamais de HTML venu des données : mode texte forcé, à la racine (objet ou tableau d'infobulles). */
export function forcerInfobulleTexte(option) {
  const sortie = copier(option);
  const t = sortie.tooltip;
  if (Array.isArray(t)) sortie.tooltip = t.map((x) => ({ ...(estObjet(x) ? x : {}), renderMode: 'richText' }));
  else sortie.tooltip = { ...(estObjet(t) ? t : {}), renderMode: 'richText' };
  return sortie;
}

/** Valeurs de base de l'habillage : animation courte, infobulle en texte, description pour lecteurs d'écran. */
export const BASE_HABILLAGE = Object.freeze({
  animationDuration: 300,
  animationDurationUpdate: 200,
  tooltip: { renderMode: 'richText', confine: true },
  aria: { enabled: true },
});

const CLES_RETIREES = new Set(['link', 'sublink', 'toolbox']);
const adresseExterne = (v) => typeof v === 'string' && (v.startsWith('image://') || v.includes('://'));
const estImageGraphique = (x) => estObjet(x) && String(x.type).toLowerCase() === 'image';
const contientImage = (x) => estObjet(x) && 'image' in x;
const estCleIcone = (k) => k === 'icon' || k === 'handleIcon' || /Icon$/.test(k);

/**
 * Défense en profondeur sur l'option reçue (avant `setOption`), à appliquer à l'OPTION seule, jamais aux lignes de données : retire, récursivement,
 * les clés `link`, `sublink` et `toolbox` (sauf `axisPointer.link`, légitime), les éléments `graphic` de type image (objet seul ou liste), les `backgroundColor` / `color`
 * qui sont des motifs d'image, les `backgroundColor` / `symbol` qui sont des adresses (`image://…` ou `://`) et toute clé `icon`, `handleIcon` ou `*Icon` valant `image://…`.
 * Ne modifie pas l'entrée.
 */
export function nettoyerOption(option) {
  const nettoyer = (v, dansGraphic, parent) => {
    if (Array.isArray(v)) return v.filter((x) => !(dansGraphic && estImageGraphique(x))).map((x) => nettoyer(x, dansGraphic, parent));
    if (!estObjet(v)) return v;
    const sortie = {};
    for (const [k, x] of Object.entries(v)) {
      if (CLES_RETIREES.has(k) && !(k === 'link' && parent === 'axisPointer')) continue;
      if (k === 'graphic' && estImageGraphique(x)) continue;
      if ((k === 'backgroundColor' || k === 'symbol') && adresseExterne(x)) continue;
      if ((k === 'backgroundColor' || k === 'color') && contientImage(x)) continue;
      if (estCleIcone(k) && typeof x === 'string' && x.startsWith('image://')) continue;
      sortie[k] = k === 'color' && Array.isArray(x) ? x.filter((c) => !contientImage(c)).map((c) => nettoyer(c, dansGraphic, k)) : nettoyer(x, dansGraphic || k === 'graphic', k);
    }
    return sortie;
  };
  return nettoyer(option, false, '');
}

/** Option finale d'une tuile : les lignes injectées, l'option nettoyée (avant l'injection : les lignes ne sont jamais nettoyées), l'habillage de base sous l'option du réglage (qui gagne), l'infobulle en texte. */
export function optionFinale(option, lignes) {
  return forcerInfobulleTexte(fusionner(BASE_HABILLAGE, injecterLignes(nettoyerOption(option), lignes)));
}

/**
 * Thème ECharts (couleurs, texte, traits) construit à partir des valeurs LUES dans le CSS : { texte, texte2, trait, traitFort, palette, police, taille }.
 * Fonction pure : le navigateur lit les variables (habillage.js), ce fichier ne fait que les ranger.
 */
export function construireTheme(v) {
  const axe = { axisLine: { lineStyle: { color: v.traitFort } }, axisTick: { lineStyle: { color: v.traitFort } }, axisLabel: { color: v.texte2 }, nameTextStyle: { color: v.texte2 }, splitLine: { lineStyle: { color: v.trait } } };
  return {
    color: v.palette,
    backgroundColor: 'transparent',
    textStyle: { color: v.texte, fontFamily: v.police, fontSize: v.taille },
    title: { textStyle: { color: v.texte } },
    legend: { textStyle: { color: v.texte2 } },
    categoryAxis: axe, valueAxis: axe, timeAxis: axe, logAxis: axe,
  };
}

/**
 * Nature d'une erreur d'appel au serveur et texte à montrer (jamais de détail technique) : { nonBranche, message }.
 * « Non branché » seulement si la fonction n'existe pas (`not-found`, `unimplemented`, avec ou sans préfixe `functions/`) : une vraie panne (`internal`, `unavailable`,
 * `deadline-exceeded`, coupure réseau) n'est JAMAIS dite « pas encore branché » et propose « Réessayer ».
 */
export function classerErreurAppel(e) {
  const code = String(e?.code ?? '').replace(/^functions\//, '');
  if (code === 'not-found' || code === 'unimplemented') return { nonBranche: true, message: MESSAGE_NON_BRANCHE };
  if (code === 'permission-denied' || code === 'unauthenticated') return { nonBranche: false, message: 'Ce compte n\'a pas accès au Pilotage. Reconnecte-toi si besoin.' };
  return { nonBranche: false, message: MESSAGE_LECTURE };
}

/** Message d'un export refusé ou raté (compte non administrateur : lisible, pas technique). Même règle « non branché » que l'écran. */
export function messageErreurExport(e) {
  const { nonBranche, message } = classerErreurAppel(e);
  if (nonBranche) return MESSAGE_NON_BRANCHE;
  if (String(e?.code ?? '').endsWith('permission-denied')) return 'Seul l\'administrateur de cet espace peut exporter ces données.';
  return message === MESSAGE_LECTURE ? 'L\'export n\'a pas abouti : réessaie dans un instant.' : message;
}

const texte = (v) => (typeof v === 'string' ? v : '');

/** Réponse du serveur nettoyée : { titre, tuiles: [{ id, titre, option, lignes }], erreurs: [{ id, message }], vide }. Tolère les champs manquants. */
export function lireReponse(r) {
  const d = estObjet(r) ? r : {};
  const tuiles = (Array.isArray(d.tuiles) ? d.tuiles : []).filter(estObjet).map((t, i) => ({
    id: texte(t.id) || `tuile-${i + 1}`, titre: texte(t.titre), option: estObjet(t.option) ? t.option : {},
    // Contrat : `lignes` = tableau d'OBJETS. Autre chose n'est pas jeté en silence : la tuile est dite « pas dessinable ».
    lignes: Array.isArray(t.lignes) && t.lignes.every(estObjet) ? t.lignes : [], lignesInvalides: t.lignes !== undefined && !(Array.isArray(t.lignes) && t.lignes.every(estObjet)),
  }));
  const erreurs = (Array.isArray(d.erreurs) ? d.erreurs : []).filter(estObjet).map((e) => ({ id: texte(e.id), message: texte(e.message) }));
  return { titre: texte(d.titre).trim(), tuiles, erreurs, vide: tuiles.length === 0 && erreurs.length === 0 };
}

/**
 * Cartes à montrer, dans l'ordre : chaque tuile, puis les erreurs. Une erreur dont l'identifiant est celui d'une tuile prend sa place (la tuile n'est pas dessinée) ;
 * le titre d'une erreur sans tuile est son identifiant. Genre : 'graphique' | 'vide' | 'invalide' (lignes qui ne sont pas des objets) | 'erreur'.
 */
export function cartes(reponse) {
  const enErreur = new Set(reponse.erreurs.map((e) => e.id));
  const liste = reponse.tuiles.map((t) => ({ id: t.id, titre: t.titre || t.id, genre: enErreur.has(t.id) ? 'erreur' : (t.lignesInvalides ? 'invalide' : (t.lignes.length ? 'graphique' : 'vide')), tuile: t }));
  for (const e of reponse.erreurs) if (!reponse.tuiles.some((t) => t.id === e.id)) liste.push({ id: e.id, titre: e.id || 'Tuile', genre: 'erreur', tuile: null });
  return liste;
}

export const titreDePage = (reponse) => reponse?.titre || TITRE_PAGE;
