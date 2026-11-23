// Règles pures du module Pilotage (sans Firebase ni DOM, testées par Node) : injection des lignes dans une option ECharts, habillage non destructif,
// lecture de la réponse du serveur, plan des onglets et des sections, messages d'erreur. Les formats, seuils et règles sont dans formats.js. L'option reçue du serveur est une DONNÉE : on la copie, on la complète, on la passe à `setOption` ; jamais exécutée.

import { appliquerFormats, resoudreCouleurs } from './formats.js';

export const TITRE_PAGE = 'Tableau de bord';
export const MESSAGE_VIDE = 'Aucun tableau n\'est encore réglé pour cet espace.';
export const MESSAGE_NON_BRANCHE = 'Le tableau de bord n\'est pas encore branché sur cet espace.';
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
  grid: { containLabel: true, left: 8, right: 16, top: 32, bottom: 8 },
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

/** Légende : défilante par défaut (jamais tronquée) et en haut (elle ne recouvre pas les axes), sauf si le réglage choisit un type ou une position. */
function legendesDefilantes(option) {
  if (option.legend === undefined) return option;
  const poser = (l) => ({ ...(l !== null && typeof l === 'object' && !Array.isArray(l) ? l : {}), ...(l?.type ? {} : { type: 'scroll' }), ...(l?.top === undefined && l?.bottom === undefined ? { top: 0 } : {}) });
  return { ...option, legend: Array.isArray(option.legend) ? option.legend.map(poser) : poser(option.legend) };
}

/**
 * Option finale d'une tuile : l'option nettoyée (avant l'injection : les lignes ne sont jamais nettoyées), les couleurs nommées (« @bon »…) résolues, les formats nommés posés,
 * les lignes injectées, l'habillage de base sous l'option du réglage (qui gagne), la légende défilante, l'infobulle en texte.
 * `contexte` = { formats, couleurs } (facultatif : sans lui, ce que faisait la version précédente).
 */
export function optionFinale(option, lignes, { formats, couleurs } = {}) {
  let o = nettoyerOption(option);
  if (couleurs) o = resoudreCouleurs(o, couleurs);
  if (formats) o = appliquerFormats(o, formats);
  return forcerInfobulleTexte(legendesDefilantes(fusionner(BASE_HABILLAGE, injecterLignes(o, lignes))));
}

/**
 * Thème ECharts (couleurs, texte, traits) construit à partir des valeurs LUES dans le CSS : { texte, texte2, trait, traitFort, palette, police, taille }.
 * Fonction pure : le navigateur lit les variables (habillage.js), ce fichier ne fait que les ranger.
 */
export function construireTheme(v) {
  const axe = { axisLine: { lineStyle: { color: v.traitFort } }, axisTick: { lineStyle: { color: v.traitFort } }, axisLabel: { color: v.texte2 }, nameTextStyle: { color: v.texte2 }, splitLine: { lineStyle: { color: v.trait } } };
  const categorie = { ...axe, splitLine: { show: false }, axisLabel: { ...axe.axisLabel, width: 110, overflow: 'truncate', hideOverlap: true } }; // libellés longs raccourcis : l'infobulle donne le texte entier
  return {
    color: v.palette,
    backgroundColor: 'transparent',
    textStyle: { color: v.texte, fontFamily: v.police, fontSize: v.taille },
    title: { textStyle: { color: v.texte } },
    legend: { textStyle: { color: v.texte2 }, pageTextStyle: { color: v.texte2 }, pageIconColor: v.texte2, pageIconInactiveColor: v.traitFort },
    tooltip: { backgroundColor: v.panneau ?? v.fond ?? 'transparent', borderColor: v.traitFort, textStyle: { color: v.texte, fontSize: v.taille }, axisPointer: { lineStyle: { color: v.traitFort }, crossStyle: { color: v.traitFort }, shadowStyle: { color: v.trait } } },
    bar: { itemStyle: { borderRadius: 4 }, label: { color: v.texte, fontSize: v.taille } },
    line: { smooth: false, symbolSize: 6, lineStyle: { width: 2 }, label: { color: v.texte, fontSize: v.taille } },
    pie: { itemStyle: { borderColor: v.fond ?? 'transparent', borderWidth: 2 }, label: { color: v.texte, fontSize: v.taille } },
    categoryAxis: categorie, valueAxis: axe, timeAxis: axe, logAxis: axe,
    markLine: { label: { color: v.texte2, fontSize: v.taille }, lineStyle: { color: v.texte2 } },
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
  if (code === 'permission-denied' || code === 'unauthenticated') return { nonBranche: false, message: 'Ce compte n\'a pas accès au tableau de bord. Reconnecte-toi si besoin.' };
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
export const TYPES = Object.freeze(['graphique', 'chiffre', 'tableau', 'texte', 'phrases', 'arbre']);
export const LARGEURS = Object.freeze(['tiers', 'moitie', 'deux-tiers', 'pleine']);
const LARGEUR_PAR_TYPE = Object.freeze({ graphique: 'moitie', chiffre: 'tiers', tableau: 'pleine', texte: 'pleine', phrases: 'pleine', arbre: 'pleine' });
const listeObjets = (v) => (Array.isArray(v) ? v.filter(estObjet).map(copier) : []);
const listeTextes = (v) => (Array.isArray(v) ? v.filter((x) => typeof x === 'string') : []);
const MOTIF_ID = /^[a-z0-9_-]{1,40}$/; // même forme d'identifiant que le serveur : rien d'autre ne sert à fabriquer une adresse
const idSur = (v) => typeof v === 'string' && MOTIF_ID.test(v);
const lienOnglet = (v) => (estObjet(v) && idSur(v.onglet) ? { onglet: v.onglet } : undefined);

function lireOnglets(brut) {
  return (Array.isArray(brut) ? brut : []).filter((o) => estObjet(o) && idSur(o.id)).map((o) => ({
    id: texte(o.id), titre: texte(o.titre) || texte(o.id), intro: texte(o.intro), tuiles: listeTextes(o.tuiles),
    sections: (Array.isArray(o.sections) ? o.sections : []).filter((x) => estObjet(x) && idSur(x.id)).map((x) => ({ id: texte(x.id), titre: texte(x.titre), intro: texte(x.intro), tuiles: listeTextes(x.tuiles) })),
    ...(Array.isArray(o.filtres) && o.filtres.some(idSur) ? { filtres: o.filtres.filter(idSur) } : {}), // identifiants des filtres que cet onglet affiche (B1)
  }));
}

export const TYPES_FILTRE = Object.freeze(['periode', 'liste', 'intervalle', 'oui_non']);
const valeurListe = (v) => (typeof v === 'string' && v.length <= 200) || (typeof v === 'number' && Number.isFinite(v));
/** Valeur appliquée d'un filtre, telle que le serveur la rend : période { raccourci?, du?, au? }, liste (tableau), intervalle { min?, max? }, oui_non (booléen) ; autre chose = rien. */
function lireApplique(type, v) {
  if (type === 'periode' && estObjet(v)) return { ...(typeof v.raccourci === 'string' ? { raccourci: v.raccourci } : {}), ...(typeof v.du === 'string' ? { du: v.du } : {}), ...(typeof v.au === 'string' ? { au: v.au } : {}) };
  if (type === 'liste' && Array.isArray(v)) return v.filter(valeurListe);
  if (type === 'intervalle' && estObjet(v)) return { ...(Number.isFinite(v.min) ? { min: v.min } : {}), ...(Number.isFinite(v.max) ? { max: v.max } : {}) };
  if (type === 'oui_non' && typeof v === 'boolean') return v;
  return undefined;
}
/** Filtres de l'onglet lu (racine de la réponse) : [{ id, libelle, type, multiple, choix: [{ valeur, libelle }], valeurs?, tronquee, applique? }]. Un filtre de type inconnu est ignoré. */
export function lireFiltres(brut) {
  return (Array.isArray(brut) ? brut : []).filter((f) => estObjet(f) && idSur(f.id) && TYPES_FILTRE.includes(f.type)).map((f) => ({
    id: f.id, libelle: texte(f.libelle) || f.id, type: f.type, multiple: f.multiple === true,
    choix: (Array.isArray(f.choix) ? f.choix : []).filter((c) => estObjet(c) && valeurListe(c.valeur)).map((c) => ({ valeur: c.valeur, libelle: texte(c.libelle) || String(c.valeur) })),
    ...(Array.isArray(f.valeurs) ? { valeurs: f.valeurs.filter(valeurListe) } : {}), tronquee: f.tronquee === true,
    ...(lireApplique(f.type, f.applique) !== undefined ? { applique: lireApplique(f.type, f.applique) } : {}),
  }));
}

/**
 * Réponse du serveur nettoyée : { titre, tuiles, erreurs, onglets, onglet, vide }. Tolère les champs manquants ET l'ANCIEN serveur (ni `type`, ni `onglets`, ni `largeur` : graphique, page unique).
 * Tuile : { id, titre, type, largeur, aide, option, lignes, lignesInvalides, valeur?, seuils?, variation?, colonnes?, parPage?, formats?, texte?, lien?, filtresAppliques?, croisement?, mentionNonFiltre? }.
 * `filtres` (racine, seulement s'il y en a) : voir `lireFiltres`. Une réponse sans filtres est identique à celle d'avant les filtres.
 */
export function lireReponse(r) {
  const d = estObjet(r) ? r : {};
  const tuiles = (Array.isArray(d.tuiles) ? d.tuiles : []).filter(estObjet).map((t, i) => {
    const type = t.type === undefined || t.type === null ? 'graphique' : (TYPES.includes(t.type) ? t.type : 'inconnu');
    const lignesValides = Array.isArray(t.lignes) && t.lignes.every(estObjet);
    return {
      id: texte(t.id) || `tuile-${i + 1}`, titre: texte(t.titre), type,
      largeur: LARGEURS.includes(t.largeur) ? t.largeur : LARGEUR_PAR_TYPE[type] ?? 'pleine', aide: texte(t.aide),
      option: estObjet(t.option) ? t.option : {},
      // Contrat : `lignes` = tableau d'OBJETS. Autre chose n'est pas jeté en silence : la tuile est dite « pas dessinable ».
      lignes: lignesValides ? t.lignes : [], lignesInvalides: t.lignes !== undefined && !lignesValides,
      valeur: estObjet(t.valeur) ? copier(t.valeur) : undefined, seuils: listeObjets(t.seuils), variation: estObjet(t.variation) ? copier(t.variation) : undefined,
      colonnes: type === 'phrases' ? listeTextes(t.colonnes) : listeObjets(t.colonnes), parPage: Number.isInteger(t.parPage) && t.parPage > 0 ? t.parPage : 20, limite: Number.isInteger(t.limite) && t.limite > 0 ? t.limite : null,
      formats: estObjet(t.formats) ? copier(t.formats) : undefined, texte: texte(t.texte), lien: lienOnglet(t.lien),
      ...(Array.isArray(t.reperes) && t.reperes.length ? { reperes: listeObjets(t.reperes) } : {}), // lignes pointillées d'un graphique
      ...(type === 'arbre' ? { niveaux: listeTextes(t.niveaux), racine: texte(t.racine) } : {}), // arbre : un niveau par colonne
      // B1 : filtres qui agissent sur la tuile, filtre réglé par un clic sur le graphique, mention « non filtré par … » (champs absents = comme avant)
      ...(Array.isArray(t.filtresAppliques) && t.filtresAppliques.some(idSur) ? { filtresAppliques: t.filtresAppliques.filter(idSur) } : {}),
      ...(estObjet(t.croisement) && idSur(t.croisement.filtre) ? { croisement: { filtre: t.croisement.filtre } } : {}),
      ...(texte(t.mentionNonFiltre) ? { mentionNonFiltre: texte(t.mentionNonFiltre) } : {}),
    };
  });
  const erreurs = (Array.isArray(d.erreurs) ? d.erreurs : []).filter(estObjet).map((e) => ({ id: texte(e.id), message: texte(e.message) }));
  const filtres = lireFiltres(d.filtres);
  return { titre: texte(d.titre).trim(), tuiles, erreurs, onglets: lireOnglets(d.onglets), onglet: idSur(d.onglet) ? d.onglet : null, ...(filtres.length ? { filtres } : {}), vide: tuiles.length === 0 && erreurs.length === 0 && !(Array.isArray(d.onglets) && d.onglets.length) };
}

/**
 * Cartes à montrer, dans l'ordre : chaque tuile, puis les erreurs. Une erreur dont l'identifiant est celui d'une tuile prend sa place (la tuile n'est pas dessinée) ;
 * le titre d'une erreur sans tuile est son identifiant. Genre : 'erreur' | 'invalide' (lignes qui ne sont pas des objets, type inconnu) | 'vide' (aucune ligne ; jamais pour un texte) | le type de la tuile ('graphique', 'chiffre', 'tableau', 'texte', 'phrases', 'arbre').
 */
export function cartes(reponse) {
  const enErreur = new Set(reponse.erreurs.map((e) => e.id));
  const genre = (t) => {
    if (enErreur.has(t.id)) return 'erreur';
    if (t.lignesInvalides || t.type === 'inconnu') return 'invalide';
    if (t.type !== 'texte' && !t.lignes.length) return 'vide';
    return t.type;
  };
  const liste = reponse.tuiles.map((t) => ({ id: t.id, titre: t.titre || t.id, genre: genre(t), tuile: t }));
  for (const e of reponse.erreurs) if (!reponse.tuiles.some((t) => t.id === e.id)) liste.push({ id: e.id, titre: e.id || 'Tuile', genre: 'erreur', tuile: null });
  return liste;
}

/**
 * Ce que l'écran montre : { onglets, actif, intro, blocs: [{ section: { id, titre, intro } | null, cartes }] }.
 * Sans onglets (ancien serveur ou réglage sans onglets) : une page unique, un seul bloc. Avec onglets : l'onglet lu, ses tuiles directes puis ses sections.
 */
export function plan(reponse) {
  const toutes = cartes(reponse);
  if (!reponse.onglets.length) return { onglets: [], actif: null, intro: '', blocs: toutes.length ? [{ section: null, cartes: toutes }] : [] };
  const parId = new Map(toutes.map((c) => [c.id, c]));
  const actif = reponse.onglets.find((o) => o.id === reponse.onglet) ?? reponse.onglets[0];
  const prendre = (ids) => ids.map((id) => parId.get(id)).filter(Boolean);
  const blocs = [];
  const directes = prendre(actif.tuiles);
  if (directes.length) blocs.push({ section: null, cartes: directes });
  for (const s of actif.sections) { const c = prendre(s.tuiles); if (c.length) blocs.push({ section: { id: s.id, titre: s.titre, intro: s.intro }, cartes: c }); }
  return { onglets: reponse.onglets, actif, intro: actif.intro, blocs };
}

export const titreDePage = (reponse) => reponse?.titre || TITRE_PAGE;
