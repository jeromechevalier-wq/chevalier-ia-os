// Module Pilotage : réglage des tableaux (document `pilotage_parametres/reglages`) : validation, option ECharts, visibilité des tuiles. LOGIQUE PURE : ni Firebase, ni réseau, ni Postgres.
// Le réglage décrit des tuiles : { id, titre, vue (vue Postgres `v_…`), tri?, limite?, option (CHAÎNE JSON d'une option ECharts), visiblePour? }.
//  - `option` est gardée en chaîne parce que Firestore refuse les tableaux imbriqués, fréquents dans une option ECharts ; le serveur la parse et la valide, puis rend l'objet.
//  - Aucune requête externe ni HTML venu des données dans une option : les adresses (http, https, image://), `javascript:` et `data:` sont refusés partout dans l'objet.
//  - Les messages d'erreur sont écrits pour être affichés tels quels à Jérôme (ils disent quoi corriger) ; ils ne contiennent jamais de valeur de secret.
// Aucun nom de vue, de colonne, d'adresse ni de client réel dans ce fichier.

export const MOTIF_VUE = /^v_[a-z0-9_]+$/;
export const MOTIF_COLONNE = /^[a-z_][a-z0-9_]*$/;
export const MOTIF_ID = /^[a-z0-9_-]{1,40}$/;
export const MOTIF_GROUPE = /^[a-z0-9_-]{1,40}$/;
export const MOTIF_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
export const LONGUEUR_VUE_MAX = 63; // limite d'un identifiant Postgres
export const OPTION_MAX = 20_000;
export const TUILES_MAX = 20; // par onglet (ou pour la page unique quand il n'y a pas d'onglets)
export const TUILES_TOTAL_MAX = 80; // toutes tuiles du réglage, onglets compris
export const ONGLETS_MAX = 8;
export const SECTIONS_MAX = 8; // par onglet
export const SEUILS_MAX = 8;
export const COLONNES_MAX = 20;
export const REGLES_MAX = 6; // par colonne de tableau
export const PAR_PAGE_DEFAUT = 20;
export const PAR_PAGE_MAX = 100;
export const TEXTE_MAX = 2000;
export const TYPES_TUILE = Object.freeze(['graphique', 'chiffre', 'tableau', 'texte', 'phrases', 'arbre']);
export const REPERES_MAX = 6; // lignes pointillées d'un graphique
export const NIVEAUX_ARBRE_MIN = 2;
export const NIVEAUX_ARBRE_MAX = 4;
export const LARGEURS = Object.freeze(['tiers', 'moitie', 'deux-tiers', 'pleine']);
export const FORMATS = Object.freeze(['euros0', 'euros2', 'euros4', 'euros_abrege', 'pourcent0', 'pourcent1', 'entier', 'jours', 'date', 'date_heure', 'mois_annee']);
export const COULEURS = Object.freeze(['bon', 'attention', 'mauvais', 'neutre']);
export const OPERATEURS = Object.freeze(['>=', '>', '<=', '<', '=']); // liste fermée : jamais testé par verifierChaine (« < » y est interdit)
export const HAUSSES = Object.freeze(['bon', 'mauvais']);
export const CLES_FORMATS_GRAPHIQUE = Object.freeze(['axeY', 'axeX', 'infobulle', 'etiquettes']);
export const GROUPES_MAX = 30;
export const MEMBRES_MAX = 100;
export const LIMITE_DEFAUT = 200;
export const LIMITE_MAX = 500;
export const PROFONDEUR_OPTION_MAX = 12;
export const REGLAGE_MAX = 300_000; // taille du réglage entier, sérialisé
export const FILTRES_MAX = 20; // filtres déclarés dans le réglage
export const TYPES_FILTRE = Object.freeze(['periode', 'liste', 'intervalle', 'oui_non']);
export const RACCOURCIS_PERIODE = Object.freeze(['ce_mois', 'mois_dernier', '3_mois', '6_mois', '12_mois', 'annee', 'tout']);
export const VALEURS_LISTE_MAX = 50; // valeurs reçues pour un filtre « liste » (et choix déclarés)
export const TEXTE_VALEUR_MAX = 200; // longueur d'une valeur de liste
export const LISTE_VALEURS_MAX = 200; // valeurs rendues à l'écran pour un filtre « liste » lu dans une vue
export const CALCULS = Object.freeze({ somme: 'sum', nombre: 'count', moyenne: 'avg', min: 'min', max: 'max' });
export const GROUPER_MAX = 6;
export const MESURES_MAX = 6;
export const ANNEE_MIN = 1900;
export const ANNEE_MAX = 2100;

/** Erreur du module : `code` = code d'erreur d'appel (invalid-argument…), `message` = phrase lisible à afficher telle quelle. */
export class ErreurPilotage extends Error {
  constructor(code, message, raison) {
    super(message);
    this.name = 'ErreurPilotage';
    this.code = code;
    if (raison) this.raison = raison; // précision pour le client (« filtre » : un filtre a été refusé), jamais une valeur reçue
  }
}
const refuser = (message) => { throw new ErreurPilotage('invalid-argument', message); };

// Clés de haut niveau d'une option ECharts acceptées (liste volontairement large : une clé inconnue est presque toujours une faute de frappe).
export const CLES_OPTION = Object.freeze([
  'title', 'legend', 'grid', 'xAxis', 'yAxis', 'polar', 'radiusAxis', 'angleAxis', 'radar', 'dataZoom', 'visualMap', 'tooltip', 'axisPointer',
  'toolbox', 'brush', 'parallel', 'parallelAxis', 'singleAxis', 'timeline', 'calendar', 'dataset', 'aria', 'series', 'color', 'backgroundColor',
  'textStyle', 'animation', 'animationDuration', 'animationEasing', 'animationDurationUpdate', 'animationEasingUpdate', 'animationThreshold',
  'stateAnimation', 'darkMode', 'useUTC', 'media', 'baseOption', 'options', 'blendMode', 'hoverLayerThreshold', 'legendHoverLink', 'transform',
]);
const CLES_INTERDITES = new Set(['__proto__', 'constructor', 'prototype']);
// Aucune requête externe, aucune image tirée d'une adresse, aucun script, aucun HTML : refusé dans toute chaîne de l'option (clés comprises).
// Les caractères de contrôle (tabulation, retour à la ligne…) sont retirés AVANT le test : « java<tab>script: » est refusé comme « javascript: ».
// `data:` n'est refusé qu'en début de chaîne ou après une espace ou un guillemet : « Metadata: » reste permis.
const MOTIFS_INTERDITS = [/http:\/\//i, /https:\/\//i, /image:\/\//i, /javascript:/i, /(^|[\s"'`])data:/i, /^\s*\/\//, /</, /\\/, /url\s*\(/i,
  // un schéma d'adresse quelconque (ftp:, http:/, data:…) collé à son texte, en début de chaîne ou après espace, guillemet ou parenthèse : « Metadata: ventes » (espace après les deux-points) reste permis
  /(^|[\s"'`(])[a-z][a-z0-9+.-]*:\S/i];
const sansControle = (s) => s.replace(/[\u0000-\u001f\u007f-\u009f\u200b-\u200f\u2028\u2029\ufeff]/g, '');

function verifierChaine(brute, chemin, contexte = 'une option de graphique') {
  const s = sansControle(brute);
  if (MOTIFS_INTERDITS.some((m) => m.test(s))) refuser(`${chemin} : ce texte est refusé dans ${contexte} : une adresse web ou un schéma d'adresse collé à son texte (« http:// », « https:// », « ftp:// », « image:// », « javascript: », « data: », ou tout « mot:texte » sans espace après les deux-points), « // » en début de texte, « url( », le signe « < » (HTML) et le signe « \ » (barre oblique inverse) n'ont pas le droit d'y figurer. Retire-le (« Ventes: 100 », avec une espace après les deux-points, est permis).`);
}
function parcourir(valeur, chemin, profondeur, tolerant = false) {
  if (profondeur > PROFONDEUR_OPTION_MAX) refuser(`${chemin} : l'option est imbriquée sur trop de niveaux (${PROFONDEUR_OPTION_MAX} au plus). Simplifie-la.`);
  if (typeof valeur === 'string') {
    verifierChaine(valeur, chemin);
    if (!tolerant && valeur.startsWith('@') && !COULEURS.includes(valeur.slice(1))) refuser(`${chemin} : « ${valeur.slice(0, 20)} » n'est pas une couleur nommée connue (@bon, @attention, @mauvais ou @neutre).`);
  } else if (Array.isArray(valeur)) valeur.forEach((v, i) => parcourir(v, `${chemin}[${i}]`, profondeur + 1, tolerant));
  else if (valeur && typeof valeur === 'object') {
    for (const [k, v] of Object.entries(valeur)) {
      if (CLES_INTERDITES.has(k)) refuser(`${chemin} : la clé « ${k} » est refusée.`);
      verifierChaine(k, chemin);
      parcourir(v, `${chemin}.${k}`, profondeur + 1, tolerant);
    }
  }
}

/**
 * Parse et valide l'option ECharts d'une tuile (chaîne JSON). Rend l'objet. `etiquette` = texte qui situe l'erreur (ex. « Tuile 2 »).
 * Refuse : pas une chaîne, trop longue, JSON invalide, pas un objet, clé de haut niveau inconnue, adresse ou script dans une chaîne, imbrication trop profonde.
 */
export function analyserOption(texte, etiquette = 'Option', { tolerant = false } = {}) {
  if (typeof texte !== 'string' || !texte.trim()) refuser(`${etiquette} : l'option du graphique est vide. Colle une option ECharts au format JSON.`);
  if (texte.length > OPTION_MAX) refuser(`${etiquette} : l'option est trop longue (${OPTION_MAX} caractères au plus).`);
  let objet;
  try { objet = JSON.parse(texte); } catch { refuser(`${etiquette} : l'option n'est pas un JSON valide (vérifie les guillemets et les virgules ; une fonction n'est pas permise).`); }
  if (!objet || typeof objet !== 'object' || Array.isArray(objet)) refuser(`${etiquette} : l'option doit être un objet JSON (entre accolades).`);
  for (const k of Object.keys(objet)) {
    if (CLES_INTERDITES.has(k)) refuser(`${etiquette} : la clé « ${k} » est refusée.`);
    if (!CLES_OPTION.includes(k)) refuser(`${etiquette} : la clé « ${k.slice(0, 40)} » n'est pas une option de graphique connue. Vérifie l'orthographe.`);
  }
  parcourir(objet, etiquette, 0, tolerant);
  return objet;
}

const texteCourt = (v, max) => (typeof v === 'string' ? v.trim() : '').slice(0, max);

function validerGroupes(brut) {
  if (brut === undefined || brut === null) return {};
  if (typeof brut !== 'object' || Array.isArray(brut)) refuser('Les groupes doivent être une liste de noms, chacun avec ses adresses e-mail.');
  const noms = Object.keys(brut);
  if (noms.length > GROUPES_MAX) refuser(`Trop de groupes (${GROUPES_MAX} au plus).`);
  const groupes = {};
  for (const nom of noms) {
    if (CLES_INTERDITES.has(nom)) refuser(`Nom de groupe « ${nom} » refusé : réservé.`);
    if (!MOTIF_GROUPE.test(nom)) refuser(`Nom de groupe « ${nom.slice(0, 40)} » refusé : lettres minuscules sans accent, chiffres, tiret et tiret bas seulement (40 au plus).`);
    const liste = brut[nom];
    if (!Array.isArray(liste)) refuser(`Le groupe « ${nom} » doit être une liste d'adresses e-mail.`);
    if (liste.length > MEMBRES_MAX) refuser(`Le groupe « ${nom} » a trop d'adresses (${MEMBRES_MAX} au plus).`);
    const vus = new Set();
    for (const a of liste) {
      const adresse = typeof a === 'string' ? a.trim().toLowerCase() : '';
      if (adresse.length > 200 || !MOTIF_EMAIL.test(adresse)) refuser(`Le groupe « ${nom} » contient une adresse e-mail invalide.`);
      vus.add(adresse);
    }
    groupes[nom] = [...vus];
  }
  return groupes;
}

const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const CONTEXTE_TEXTE = 'un texte du tableau de bord';

/** Texte libre d'un champ du réglage : longueur bornée, mêmes motifs interdits que l'option (adresse, script, « < »…). Rend le texte rogné, ou undefined s'il est absent. */
function texteSur(valeur, chemin, max, { obligatoire = false } = {}) {
  if (valeur === undefined || valeur === null || (typeof valeur === 'string' && !valeur.trim())) {
    if (obligatoire) refuser(`${chemin} : obligatoire (${max} caractères au plus).`);
    return undefined;
  }
  if (typeof valeur !== 'string') refuser(`${chemin} : doit être un texte.`);
  const t = valeur.trim();
  if (t.length > max) refuser(`${chemin} : trop long (${max} caractères au plus).`);
  for (const ligne of t.split(/\r?\n/)) verifierChaine(ligne, chemin, CONTEXTE_TEXTE); // ligne par ligne : « Note:\nSuite » n'est pas une adresse
  return t;
}
function colonneSure(v, chemin) {
  if (typeof v !== 'string' || !MOTIF_COLONNE.test(v) || v.length > LONGUEUR_VUE_MAX || CLES_INTERDITES.has(v)) refuser(`${chemin} : le nom de colonne doit être en lettres minuscules sans accent, chiffres et tirets bas (il ne commence pas par un chiffre).`);
  return v;
}
function formatSur(v, chemin, { obligatoire = false } = {}) {
  if (v === undefined || v === null) { if (obligatoire) refuser(`${chemin} : le format est obligatoire.`); return undefined; }
  if (typeof v !== 'string' || !FORMATS.includes(v)) refuser(`${chemin} : format inconnu. Formats permis : ${FORMATS.join(', ')}.`);
  return v;
}
function couleurSure(v, chemin) {
  if (typeof v !== 'string' || !COULEURS.includes(v)) refuser(`${chemin} : couleur inconnue. Couleurs permises : ${COULEURS.join(', ')}.`);
  return v;
}
function lienSur(v, chemin) {
  if (v === undefined || v === null) return undefined;
  if (!estObjet(v) || typeof v.onglet !== 'string' || !MOTIF_ID.test(v.onglet)) refuser(`${chemin} : le lien doit être { onglet: "<identifiant d'un onglet>" } (aucune adresse web).`);
  return { onglet: v.onglet };
}
function listeDeColonnes(v, chemin, max) {
  if (!Array.isArray(v) || v.length < 1 || v.length > max) refuser(`${chemin} : « colonnes » doit être une liste de 1 à ${max} éléments.`);
  return v;
}

/** Arbre des coûts : `grouper` donne les niveaux dans l'ordre (2 à 4), `valeur` la mesure sommée ; la première colonne de `grouper` est la racine. Un `tri` est obligatoire (la lecture est limitée). */
function validerArbre(brute, e, tuile) {
  const v = brute.valeur;
  if (!estObjet(v)) refuser(`${e} : « valeur » doit être { colonne, format }.`);
  tuile.valeur = { colonne: colonneSure(v.colonne, `${e} (valeur)`) };
  const f = formatSur(v.format, `${e} (valeur)`);
  if (f) tuile.valeur.format = f;
  if (!Array.isArray(brute.grouper) || brute.grouper.length < NIVEAUX_ARBRE_MIN || brute.grouper.length > NIVEAUX_ARBRE_MAX) refuser(`${e} : un arbre demande « grouper » avec ${NIVEAUX_ARBRE_MIN} à ${NIVEAUX_ARBRE_MAX} colonnes (un niveau par colonne, dans l'ordre).`);
  if (!estObjet(brute.tri)) refuser(`${e} : un arbre demande un « tri » (par exemple sur la mesure, du plus grand au plus petit).`);
  const racine = texteSur(brute.racine, `${e} (racine)`, 60);
  if (racine) tuile.racine = racine;
}

function validerChiffre(brute, e, tuile) {
  const v = brute.valeur;
  if (!estObjet(v)) refuser(`${e} : « valeur » doit être { colonne, format }.`);
  tuile.valeur = { colonne: colonneSure(v.colonne, `${e} (valeur)`) };
  const f = formatSur(v.format, `${e} (valeur)`);
  if (f) tuile.valeur.format = f;
  if (brute.seuils !== undefined && brute.seuils !== null) {
    if (!Array.isArray(brute.seuils) || brute.seuils.length > SEUILS_MAX) refuser(`${e} : « seuils » doit être une liste de ${SEUILS_MAX} éléments au plus.`);
    let precedent = -Infinity;
    tuile.seuils = brute.seuils.map((x, i) => {
      const c = `${e} (seuil ${i + 1})`;
      if (!estObjet(x)) refuser(`${c} : format invalide.`);
      const seuil = { couleur: couleurSure(x.couleur, c) };
      if (x.jusqua !== undefined && x.jusqua !== null) {
        if (typeof x.jusqua !== 'number' || !Number.isFinite(x.jusqua)) refuser(`${c} : « jusqua » doit être un nombre.`);
        if (x.jusqua <= precedent) refuser(`${c} : les seuils se rangent du plus petit « jusqua » au plus grand.`);
        precedent = x.jusqua;
        seuil.jusqua = x.jusqua;
      } else if (i !== brute.seuils.length - 1) refuser(`${c} : seul le dernier seuil peut ne pas avoir de « jusqua ».`);
      const l = texteSur(x.libelle, `${c} (libellé)`, 60);
      if (l) seuil.libelle = l;
      return seuil;
    });
  }
  if (brute.variation !== undefined && brute.variation !== null) {
    const x = brute.variation;
    if (!estObjet(x)) refuser(`${e} : « variation » doit être { colonne, periodeColonne, periodeFormat, hausse }.`);
    if (!HAUSSES.includes(x.hausse)) refuser(`${e} (variation) : « hausse » doit être « bon » ou « mauvais ».`);
    tuile.variation = { colonne: colonneSure(x.colonne, `${e} (variation)`), periodeColonne: colonneSure(x.periodeColonne, `${e} (variation)`), hausse: x.hausse };
    const pf = formatSur(x.periodeFormat, `${e} (variation)`);
    if (pf) tuile.variation.periodeFormat = pf;
  }
  const lien = lienSur(brute.lien, `${e} (lien)`);
  if (lien) tuile.lien = lien;
}

function validerTableau(brute, e, tuile) {
  const colonnes = listeDeColonnes(brute.colonnes, e, COLONNES_MAX);
  tuile.colonnes = colonnes.map((x, i) => {
    const c = `${e} (colonne ${i + 1})`;
    if (!estObjet(x)) refuser(`${c} : format invalide.`);
    const col = { colonne: colonneSure(x.colonne, c) };
    col.titre = texteSur(x.titre, `${c} (titre)`, 60) ?? col.colonne;
    const f = formatSur(x.format, c);
    if (f) col.format = f;
    if (x.regles !== undefined && x.regles !== null) {
      if (!Array.isArray(x.regles) || x.regles.length > REGLES_MAX) refuser(`${c} : « regles » doit être une liste de ${REGLES_MAX} règles au plus.`);
      col.regles = x.regles.map((r, k) => {
        const rc = `${c} (règle ${k + 1})`;
        if (!estObjet(r)) refuser(`${rc} : format invalide.`);
        if (typeof r.si !== 'string' || !OPERATEURS.includes(r.si)) refuser(`${rc} : « si » doit être l'un de : ${OPERATEURS.join(' ')}.`); // liste fermée, jamais verifierChaine (« < » y est interdit)
        let valeur = r.valeur === undefined ? null : r.valeur;
        if (valeur !== null && !(typeof valeur === 'number' && Number.isFinite(valeur))) {
          if (typeof valeur !== 'string') refuser(`${rc} : « valeur » doit être un nombre, un court texte ou null.`);
          valeur = texteSur(valeur, `${rc} (valeur)`, 40) ?? null;
        }
        return { si: r.si, valeur, couleur: couleurSure(r.couleur, rc) };
      });
    }
    const lien = lienSur(x.lien, `${c} (lien)`);
    if (lien) col.lien = lien;
    return col;
  });
  if (brute.parPage !== undefined && brute.parPage !== null && (!Number.isInteger(brute.parPage) || brute.parPage < 1 || brute.parPage > PAR_PAGE_MAX)) refuser(`${e} : « parPage » doit être un entier de 1 à ${PAR_PAGE_MAX}.`);
  tuile.parPage = brute.parPage ?? PAR_PAGE_DEFAUT;
}

function validerPhrases(brute, e, tuile) {
  tuile.colonnes = listeDeColonnes(brute.colonnes, e, 5).map((c, i) => colonneSure(c, `${e} (colonne ${i + 1})`));
}

function validerFormatsGraphique(brut, e, tuile) {
  if (brut === undefined || brut === null) return;
  if (!estObjet(brut)) refuser(`${e} : « formats » doit être { axeY, axeX, infobulle, etiquettes }.`);
  const formats = {};
  for (const [k, v] of Object.entries(brut)) {
    if (!CLES_FORMATS_GRAPHIQUE.includes(k)) refuser(`${e} : « formats.${k.slice(0, 20)} » n'existe pas (permis : ${CLES_FORMATS_GRAPHIQUE.join(', ')}).`);
    formats[k] = formatSur(v, `${e} (formats.${k})`, { obligatoire: true });
  }
  if (Object.keys(formats).length) tuile.formats = formats;
}

/** Repères d'un graphique : lignes pointillées horizontales ou verticales à une valeur donnée (plafond, seuils d'alerte). `[{ valeur, axe?: "x"|"y", libelle?, couleur? }]`. */
function validerReperes(brut, e, tuile) {
  if (brut === undefined || brut === null) return;
  if (!Array.isArray(brut) || brut.length < 1 || brut.length > REPERES_MAX) refuser(`${e} : « reperes » doit être une liste de 1 à ${REPERES_MAX} lignes.`);
  tuile.reperes = brut.map((x, i) => {
    const c = `${e} (repère ${i + 1})`;
    if (!estObjet(x)) refuser(`${c} : format invalide.`);
    if (typeof x.valeur !== 'number' || !Number.isFinite(x.valeur)) refuser(`${c} : « valeur » doit être un nombre.`);
    const r = { valeur: x.valeur };
    if (x.axe !== undefined && x.axe !== null) { if (x.axe !== 'x' && x.axe !== 'y') refuser(`${c} : « axe » doit être « y » (ligne horizontale) ou « x » (ligne verticale).`); r.axe = x.axe; }
    const l = texteSur(x.libelle, `${c} (libellé)`, 40);
    if (l) r.libelle = l;
    if (x.couleur !== undefined && x.couleur !== null) r.couleur = couleurSure(x.couleur, c);
    return r;
  });
}

// Expression PARTAGÉE (validation, service, formats.js du navigateur) : un lien complet « [libellé](#identifiant) ». Un test verrouille l'égalité des deux constantes (ici et dans formats.js).
export const LIEN_TEXTE_SOURCE = '\\[[^\\]\\n]+\\]\\(#[a-z0-9_-]{1,40}\\)';
/** Les adresses internes d'un texte : « [libellé](#onglet) » ; toute autre cible de lien est refusée. Rend la liste des identifiants d'onglets cités. */
export function liensDuTexte(texte, chemin = 'Texte') {
  const ids = [];
  const reste = String(texte).replace(new RegExp(LIEN_TEXTE_SOURCE, 'g'), (m) => { ids.push(m.slice(m.lastIndexOf('(#') + 2, -1)); return ''; });
  if (reste.includes('](')) refuser(`${chemin} : seuls les liens vers un onglet sont permis, écrits [texte](#identifiant-de-l-onglet).`);
  return ids;
}

/** « visiblePour » d'une tuile ou d'un filtre : liste d'adresses e-mail ou de noms de groupes, en minuscules ; undefined s'il est absent. */
function visiblePourSur(v, etiquette) {
  if (v === undefined || v === null) return undefined;
  if (!Array.isArray(v) || v.length > MEMBRES_MAX) refuser(`${etiquette} : « visiblePour » doit être une liste d'adresses e-mail ou de noms de groupes (${MEMBRES_MAX} au plus).`);
  return v.map((x) => {
    const m = typeof x === 'string' ? x.trim().toLowerCase() : '';
    if (!(m.length <= 200 && MOTIF_EMAIL.test(m)) && !MOTIF_GROUPE.test(m)) refuser(`${etiquette} : « visiblePour » contient une valeur qui n'est ni une adresse e-mail ni un nom de groupe.`);
    return m;
  });
}

function validerTuile(brute, rang, ids, tolerant, filtresDeclares = new Map()) {
  const e = `Tuile ${rang + 1}`;
  if (!estObjet(brute)) refuser(`${e} : format invalide.`);
  const id = typeof brute.id === 'string' ? brute.id : '';
  if (!MOTIF_ID.test(id) || CLES_INTERDITES.has(id)) refuser(`${e} : l'identifiant doit faire 1 à 40 caractères : lettres minuscules sans accent, chiffres, tiret et tiret bas.`);
  if (ids.has(id)) refuser(`${e} : l'identifiant « ${id} » est déjà pris par une autre tuile.`);
  ids.add(id);
  const etiquette = `Tuile « ${id} »`;
  const titre = texteCourt(brute.titre, 120);
  if (!titre) refuser(`${etiquette} : le titre est obligatoire (120 caractères au plus).`);
  if (!tolerant) verifierChaine(titre, `${etiquette} (titre)`, CONTEXTE_TEXTE); // à la relecture d'un réglage enregistré, les anciens titres (« Marge:taux ») restent permis
  const type = brute.type === undefined || brute.type === null ? 'graphique' : brute.type;
  if (!TYPES_TUILE.includes(type)) refuser(`${etiquette} : type inconnu. Types permis : ${TYPES_TUILE.join(', ')}.`);
  const tuile = { id, titre, type };
  if (brute.largeur !== undefined && brute.largeur !== null) {
    if (!LARGEURS.includes(brute.largeur)) refuser(`${etiquette} : largeur inconnue. Largeurs permises : ${LARGEURS.join(', ')}.`);
    tuile.largeur = brute.largeur;
  }
  const aide = texteSur(brute.aide, `${etiquette} (aide)`, 300);
  if (aide) tuile.aide = aide;
  if (type === 'texte') {
    if (brute.vue !== undefined && brute.vue !== null) refuser(`${etiquette} : un texte ne lit rien en base : retire « vue ».`);
    if (brute.option !== undefined && brute.option !== null) refuser(`${etiquette} : un texte n'a pas d'option de graphique.`);
    tuile.texte = texteSur(brute.texte, `${etiquette} (texte)`, TEXTE_MAX, { obligatoire: true });
    liensDuTexte(tuile.texte, `${etiquette} (texte)`);
  } else {
    const vue = typeof brute.vue === 'string' ? brute.vue : '';
    if (!MOTIF_VUE.test(vue) || vue.length > LONGUEUR_VUE_MAX) refuser(`${etiquette} : le nom de la vue doit commencer par « v_ » et ne contenir que des lettres minuscules sans accent, des chiffres et des tirets bas.`);
    tuile.vue = vue;
    if (brute.tri !== undefined && brute.tri !== null) {
      const t = brute.tri;
      if (!t || typeof t !== 'object' || Array.isArray(t)) refuser(`${etiquette} : le tri doit être { colonne, sens }.`);
      if (typeof t.colonne !== 'string' || !MOTIF_COLONNE.test(t.colonne) || t.colonne.length > LONGUEUR_VUE_MAX || (!tolerant && CLES_INTERDITES.has(t.colonne))) refuser(`${etiquette} : la colonne de tri doit être en lettres minuscules sans accent, chiffres et tirets bas (elle ne commence pas par un chiffre).`);
      if (t.sens !== 'asc' && t.sens !== 'desc') refuser(`${etiquette} : le sens du tri doit être « asc » ou « desc ».`);
      tuile.tri = { colonne: t.colonne, sens: t.sens };
    }
    if (brute.limite !== undefined && brute.limite !== null) {
      if (!Number.isInteger(brute.limite) || brute.limite < 1 || brute.limite > LIMITE_MAX) refuser(`${etiquette} : la limite doit être un nombre entier de 1 à ${LIMITE_MAX}.`);
      tuile.limite = brute.limite;
    }
    if (type === 'graphique') {
      analyserOption(brute.option, etiquette, { tolerant }); // validée ici ; stockée en chaîne
      tuile.option = brute.option;
      validerFormatsGraphique(brute.formats, etiquette, tuile);
      validerReperes(brute.reperes, etiquette, tuile);
    } else {
      if (brute.option !== undefined && brute.option !== null) refuser(`${etiquette} : ce type de tuile n'a pas d'option de graphique : retire « option ».`);
      if (brute.reperes !== undefined && brute.reperes !== null) refuser(`${etiquette} : « reperes » ne vaut que pour un graphique.`);
      if (type === 'chiffre') validerChiffre(brute, etiquette, tuile);
      else if (type === 'arbre') validerArbre(brute, etiquette, tuile);
      else if (type === 'tableau') validerTableau(brute, etiquette, tuile);
      else validerPhrases(brute, etiquette, tuile);
    }
  }
  const mention = texteSur(brute.mentionNonFiltre, `${etiquette} (mentionNonFiltre)`, 120);
  if (mention) tuile.mentionNonFiltre = mention;
  if (type === 'texte') {
    for (const k of ['filtres', 'croisement', 'grouper', 'mesures']) if (brute[k] !== undefined && brute[k] !== null) refuser(`${etiquette} : un texte ne lit rien en base : retire « ${k} ».`);
  } else {
    validerAgregation(brute, etiquette, tuile);
    validerFiltresDeTuile(brute, etiquette, tuile, filtresDeclares);
  }
  const vp = visiblePourSur(brute.visiblePour, etiquette);
  if (vp) tuile.visiblePour = vp;
  return tuile;
}

// ───────────────────────── Filtres du tableau de bord (B1) ─────────────────────────
const estDateReelle = (t) => {
  if (typeof t !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(t)) return false;
  const [a, m, j] = t.split('-').map(Number);
  if (a < ANNEE_MIN || a > ANNEE_MAX) return false;
  const d = new Date(Date.UTC(a, m - 1, j));
  return d.getUTCFullYear() === a && d.getUTCMonth() === m - 1 && d.getUTCDate() === j;
};
const nombreSur = (v) => typeof v === 'number' && Number.isFinite(v) && Math.abs(v) <= 1e15;
export const valeurDeListeSure = (v) => (typeof v === 'string' && v.length >= 1 && v.length <= TEXTE_VALEUR_MAX && !/[\u0000-\u001f\u007f]/.test(v)) || nombreSur(v);

/**
 * Valide UNE valeur de filtre contre sa déclaration (type, plafonds) : sert au `defaut` du réglage ET à la requête du navigateur.
 * Rend { ok: true, valeur } (forme normalisée : période { raccourci } ou { du, au } ; liste = tableau ; intervalle { min?, max? } ; oui_non = booléen) ou { ok: false }. Ne lève jamais et ne répète jamais la valeur reçue.
 */
export function valeurFiltre(decl, brut) {
  const non = { ok: false };
  if (!decl || typeof decl !== 'object') return non;
  if (decl.type === 'periode') {
    if (!estObjet(brut)) return non;
    const cles = Object.keys(brut);
    if (cles.length === 1 && cles[0] === 'raccourci') return RACCOURCIS_PERIODE.includes(brut.raccourci) ? { ok: true, valeur: { raccourci: brut.raccourci } } : non;
    if (cles.length === 2 && cles.includes('du') && cles.includes('au')) return estDateReelle(brut.du) && estDateReelle(brut.au) && brut.du <= brut.au ? { ok: true, valeur: { du: brut.du, au: brut.au } } : non;
    return non;
  }
  if (decl.type === 'liste') {
    if (!Array.isArray(brut) || brut.length > VALEURS_LISTE_MAX || (!decl.multiple && brut.length > 1)) return non;
    if (!brut.every(valeurDeListeSure)) return non;
    // normalisée (doublons retirés, triée) : « A,B » et « B,A,A » donnent la même clé de cache et le même SQL
    const vus = new Map();
    for (const v of brut) if (!vus.has(String(v))) vus.set(String(v), v);
    return { ok: true, valeur: [...vus.keys()].sort().map((k) => vus.get(k)) };
  }
  if (decl.type === 'intervalle') {
    if (!estObjet(brut) || Object.keys(brut).some((k) => k !== 'min' && k !== 'max')) return non;
    const v = {};
    for (const k of ['min', 'max']) if (brut[k] !== undefined && brut[k] !== null) { if (!nombreSur(brut[k])) return non; v[k] = brut[k]; }
    return v.min !== undefined && v.max !== undefined && v.min > v.max ? non : { ok: true, valeur: v };
  }
  if (decl.type === 'oui_non') return typeof brut === 'boolean' ? { ok: true, valeur: brut } : non;
  return non;
}

function validerFiltres(brut) {
  if (brut === undefined || brut === null) return [];
  if (!Array.isArray(brut)) refuser('Les filtres doivent être une liste.');
  if (brut.length > FILTRES_MAX) refuser(`Trop de filtres (${FILTRES_MAX} au plus).`);
  const ids = new Set();
  return brut.map((f, i) => {
    const c = `Filtre ${i + 1}`;
    if (!estObjet(f)) refuser(`${c} : format invalide.`);
    if (typeof f.id !== 'string' || !MOTIF_ID.test(f.id) || CLES_INTERDITES.has(f.id)) refuser(`${c} : l'identifiant doit faire 1 à 40 caractères : lettres minuscules sans accent, chiffres, tiret et tiret bas.`);
    if (ids.has(f.id)) refuser(`${c} : l'identifiant « ${f.id} » est déjà pris par un autre filtre.`);
    ids.add(f.id);
    const nom = `Filtre « ${f.id} »`;
    if (!TYPES_FILTRE.includes(f.type)) refuser(`${nom} : type inconnu. Types permis : ${TYPES_FILTRE.join(', ')}.`);
    const decl = { id: f.id, libelle: texteSur(f.libelle, `${nom} (libellé)`, 60, { obligatoire: true }), type: f.type };
    if (f.multiple !== undefined && f.multiple !== null) {
      if (typeof f.multiple !== 'boolean') refuser(`${nom} : « multiple » doit être vrai ou faux.`);
      if (f.type !== 'liste') refuser(`${nom} : « multiple » ne vaut que pour une liste.`);
      if (f.multiple) decl.multiple = true;
    }
    const aValeurs = f.valeurs !== undefined && f.valeurs !== null;
    const aChoix = f.choix !== undefined && f.choix !== null;
    if (f.type === 'liste') {
      if (aValeurs === aChoix) refuser(`${nom} : une liste a soit « valeurs » ({ vue, colonne } : les valeurs sont lues dans une vue), soit « choix » (liste fermée), pas les deux ni aucun.`);
      if (aValeurs) {
        if (!estObjet(f.valeurs)) refuser(`${nom} : « valeurs » doit être { vue, colonne }.`);
        const vue = typeof f.valeurs.vue === 'string' ? f.valeurs.vue : '';
        if (!MOTIF_VUE.test(vue) || vue.length > LONGUEUR_VUE_MAX) refuser(`${nom} : le nom de la vue des valeurs doit commencer par « v_ » et ne contenir que des lettres minuscules sans accent, des chiffres et des tirets bas.`);
        decl.valeurs = { vue, colonne: colonneSure(f.valeurs.colonne, `${nom} (valeurs)`) };
      } else {
        if (!Array.isArray(f.choix) || f.choix.length < 1 || f.choix.length > VALEURS_LISTE_MAX) refuser(`${nom} : « choix » doit être une liste de 1 à ${VALEURS_LISTE_MAX} éléments { valeur, libelle }.`);
        decl.choix = f.choix.map((x, k) => {
          const cc = `${nom} (choix ${k + 1})`;
          if (!estObjet(x) || !valeurDeListeSure(x.valeur)) refuser(`${cc} : « valeur » doit être un court texte ou un nombre.`);
          return { valeur: x.valeur, libelle: texteSur(x.libelle, `${cc} (libellé)`, 60, { obligatoire: true }) };
        });
      }
    } else if (aValeurs || aChoix) refuser(`${nom} : « valeurs » et « choix » ne valent que pour une liste.`);
    if (f.defaut !== undefined && f.defaut !== null) {
      const r = valeurFiltre(decl, f.defaut);
      if (!r.ok) refuser(`${nom} : la valeur par défaut ne convient pas à ce type de filtre.`);
      decl.defaut = r.valeur;
    }
    const vp = visiblePourSur(f.visiblePour, nom);
    if (vp) decl.visiblePour = vp;
    return decl;
  });
}

/** Agrégation déclarée : { grouper: [colonnes] (0 à 6), mesures: [{ colonne?, calcul, nom }] (1 à 6) } ; les colonnes lues par la tuile doivent exister dans le résultat (groupe ou nom de mesure). */
function validerAgregation(brute, e, tuile) {
  const aG = brute.grouper !== undefined && brute.grouper !== null;
  const aM = brute.mesures !== undefined && brute.mesures !== null;
  if (!aG && !aM) return;
  if (!aM) refuser(`${e} : « grouper » demande aussi « mesures » (1 à ${MESURES_MAX}).`);
  const grouper = [];
  if (aG) {
    if (!Array.isArray(brute.grouper) || brute.grouper.length > GROUPER_MAX) refuser(`${e} : « grouper » doit être une liste de ${GROUPER_MAX} colonnes au plus.`);
    for (const [i, c] of brute.grouper.entries()) {
      const col = colonneSure(c, `${e} (grouper ${i + 1})`);
      if (grouper.includes(col)) refuser(`${e} : la colonne « ${col} » est écrite deux fois dans « grouper ».`);
      grouper.push(col);
    }
  }
  if (!Array.isArray(brute.mesures) || brute.mesures.length < 1 || brute.mesures.length > MESURES_MAX) refuser(`${e} : « mesures » doit être une liste de 1 à ${MESURES_MAX} mesures.`);
  const noms = [];
  const mesures = brute.mesures.map((m, i) => {
    const c = `${e} (mesure ${i + 1})`;
    if (!estObjet(m)) refuser(`${c} : format invalide.`);
    if (typeof m.calcul !== 'string' || !Object.hasOwn(CALCULS, m.calcul)) refuser(`${c} : « calcul » doit être l'un de : ${Object.keys(CALCULS).join(', ')}.`);
    const nom = colonneSure(m.nom, `${c} (nom)`);
    if (noms.includes(nom)) refuser(`${c} : le nom « ${nom} » est déjà pris par une autre mesure.`);
    if (grouper.includes(nom)) refuser(`${c} : le nom « ${nom} » est déjà celui d'une colonne de « grouper ».`);
    noms.push(nom);
    const mesure = { calcul: m.calcul, nom };
    if (m.colonne !== undefined && m.colonne !== null) mesure.colonne = colonneSure(m.colonne, `${c} (colonne)`);
    else if (m.calcul !== 'nombre') refuser(`${c} : « colonne » est obligatoire (seul « nombre » peut s'en passer : il compte les lignes).`);
    return mesure;
  });
  tuile.grouper = grouper;
  tuile.mesures = mesures;
  const dispo = new Set([...grouper, ...noms]);
  const dans = (col, chemin) => { if (col !== undefined && !dispo.has(col)) refuser(`${e} : ${chemin} « ${col} » n'est ni une colonne de « grouper » ni le nom d'une mesure.`); };
  if (tuile.tri) dans(tuile.tri.colonne, 'la colonne du tri');
  if (tuile.limite !== undefined && !tuile.tri) refuser(`${e} : une limite sur des lignes regroupées demande un « tri » (sinon les lignes gardées seraient au hasard).`);
  if (tuile.type === 'chiffre') {
    if (grouper.length && !tuile.variation && !tuile.tri) refuser(`${e} : un chiffre regroupé sans variation demande un « tri » (sinon la ligne gardée serait au hasard).`);
    dans(tuile.valeur.colonne, 'la colonne de la valeur');
    if (tuile.variation) {
      dans(tuile.variation.colonne, 'la colonne de la variation');
      if (!grouper.includes(tuile.variation.periodeColonne)) refuser(`${e} : la colonne de période de la variation doit être dans « grouper ».`);
    }
  } else if (tuile.type === 'arbre') {
    dans(tuile.valeur.colonne, 'la colonne de la valeur');
    if (!tuile.mesures.some((m) => m.nom === tuile.valeur.colonne)) refuser(`${e} : la colonne de la valeur d'un arbre doit être le nom d'une mesure.`);
    dans(tuile.tri.colonne, 'la colonne du tri');
  } else if (tuile.type === 'tableau') for (const col of tuile.colonnes) dans(col.colonne, 'la colonne');
  else if (tuile.type === 'phrases') for (const col of tuile.colonnes) dans(col, 'la colonne');
}

/** `filtres: { <idFiltre>: { colonne } }` (la colonne de la vue de la tuile que ce filtre contraint) et `croisement: { filtre, colonne }`. */
function validerFiltresDeTuile(brute, e, tuile, declares) {
  if (brute.filtres !== undefined && brute.filtres !== null) {
    if (!estObjet(brute.filtres)) refuser(`${e} : « filtres » doit être { <identifiant du filtre>: { colonne } }.`);
    const f = {};
    for (const [id, x] of Object.entries(brute.filtres)) {
      if (CLES_INTERDITES.has(id) || !MOTIF_ID.test(id) || !declares.has(id)) refuser(`${e} : le filtre « ${id.slice(0, 40)} » n'existe pas dans le réglage.`);
      if (!estObjet(x)) refuser(`${e} (filtre « ${id} »)  : doit être { colonne }.`);
      f[id] = { colonne: colonneSure(x.colonne, `${e} (filtre « ${id} »)`) };
    }
    if (Object.keys(f).length) tuile.filtres = f;
  }
  if (brute.croisement !== undefined && brute.croisement !== null) {
    const x = brute.croisement;
    if (!estObjet(x) || typeof x.filtre !== 'string' || !declares.has(x.filtre)) refuser(`${e} : « croisement » doit être { filtre, colonne } avec un filtre qui existe dans le réglage.`);
    if (declares.get(x.filtre) !== 'liste') refuser(`${e} : le croisement ne vaut que pour un filtre de type liste.`);
    const colonne = colonneSure(x.colonne, `${e} (croisement)`);
    if (tuile.mesures && !tuile.grouper.includes(colonne) && !tuile.mesures.some((m) => m.nom === colonne)) refuser(`${e} (croisement) : la colonne « ${colonne} » n'est ni une colonne de « grouper » ni le nom d'une mesure.`);
    tuile.croisement = { filtre: x.filtre, colonne };
  }
}

/** Onglets : { id, titre, intro?, tuiles: [ids], sections?: [{ id, titre, intro?, tuiles: [ids] }] }. Chaque tuile est placée UNE fois ; au plus TUILES_MAX tuiles par onglet. Pas de sous-onglets : des sections d'un même onglet. */
function validerOnglets(brut, tuiles, filtresDeclares = new Map()) {
  if (brut === undefined || brut === null) return undefined;
  if (!Array.isArray(brut)) refuser('Les onglets doivent être une liste.');
  if (!brut.length) return undefined;
  if (brut.length > ONGLETS_MAX) refuser(`Trop d'onglets (${ONGLETS_MAX} au plus).`);
  const connues = new Set(tuiles.map((t) => t.id));
  const placees = new Set();
  const idsOnglets = new Set();
  const idsSections = new Set();
  const placer = (liste, chemin) => {
    if (liste === undefined || liste === null) return [];
    if (!Array.isArray(liste)) refuser(`${chemin} : « tuiles » doit être une liste d'identifiants de tuiles.`);
    return liste.map((x) => {
      if (typeof x !== 'string' || !connues.has(x)) refuser(`${chemin} : la tuile « ${String(x).slice(0, 40)} » n'existe pas dans le réglage.`);
      if (placees.has(x)) refuser(`${chemin} : la tuile « ${x} » est déjà placée ailleurs (une tuile n'est que dans un onglet, une seule fois).`);
      placees.add(x);
      return x;
    });
  };
  const onglets = brut.map((o, i) => {
    const c = `Onglet ${i + 1}`;
    if (!estObjet(o)) refuser(`${c} : format invalide.`);
    if (typeof o.id !== 'string' || !MOTIF_ID.test(o.id) || CLES_INTERDITES.has(o.id)) refuser(`${c} : l'identifiant doit faire 1 à 40 caractères : lettres minuscules sans accent, chiffres, tiret et tiret bas.`);
    if (idsOnglets.has(o.id)) refuser(`${c} : l'identifiant « ${o.id} » est déjà pris par un autre onglet.`);
    idsOnglets.add(o.id);
    const nom = `Onglet « ${o.id} »`;
    const onglet = { id: o.id, titre: texteSur(o.titre, `${nom} (titre)`, 60, { obligatoire: true }) };
    const intro = texteSur(o.intro, `${nom} (intro)`, 500);
    if (intro) onglet.intro = intro;
    if (o.filtres !== undefined && o.filtres !== null) {
      if (!Array.isArray(o.filtres) || o.filtres.length > FILTRES_MAX) refuser(`${nom} : « filtres » doit être une liste d'identifiants de filtres (${FILTRES_MAX} au plus).`);
      const vus = new Set();
      for (const id of o.filtres) {
        if (typeof id !== 'string' || !filtresDeclares.has(id)) refuser(`${nom} : le filtre « ${String(id).slice(0, 40)} » n'existe pas dans le réglage.`);
        if (vus.has(id)) refuser(`${nom} : le filtre « ${id} » est écrit deux fois.`);
        vus.add(id);
      }
      if (vus.size) onglet.filtres = [...vus];
    }
    onglet.tuiles = placer(o.tuiles, nom);
    if (o.sections !== undefined && o.sections !== null) {
      if (!Array.isArray(o.sections) || o.sections.length > SECTIONS_MAX) refuser(`${nom} : « sections » doit être une liste de ${SECTIONS_MAX} sections au plus.`);
      onglet.sections = o.sections.map((sec, k) => {
        const sc = `${nom} (section ${k + 1})`;
        if (!estObjet(sec)) refuser(`${sc} : format invalide.`);
        if (typeof sec.id !== 'string' || !MOTIF_ID.test(sec.id) || CLES_INTERDITES.has(sec.id)) refuser(`${sc} : l'identifiant doit faire 1 à 40 caractères : lettres minuscules sans accent, chiffres, tiret et tiret bas.`);
        if (idsSections.has(sec.id)) refuser(`${sc} : l'identifiant « ${sec.id} » est déjà pris par une autre section.`);
        idsSections.add(sec.id);
        const section = { id: sec.id, titre: texteSur(sec.titre, `${sc} (titre)`, 80, { obligatoire: true }) };
        const si = texteSur(sec.intro, `${sc} (intro)`, 500);
        if (si) section.intro = si;
        section.tuiles = placer(sec.tuiles, sc);
        return section;
      });
    }
    const total = onglet.tuiles.length + (onglet.sections ?? []).reduce((n, x) => n + x.tuiles.length, 0);
    if (total === 0) refuser(`${nom} : l'onglet est vide (au moins une tuile).`);
    if (total > TUILES_MAX) refuser(`${nom} : trop de tuiles (${TUILES_MAX} au plus par onglet).`);
    return onglet;
  });
  const orphelines = tuiles.filter((t) => !placees.has(t.id));
  if (orphelines.length) refuser(`La tuile « ${orphelines[0].id} » n'est dans aucun onglet : place-la dans un onglet ou retire-la.`);
  return onglets;
}

/** Les liens internes (tuile chiffre, colonne de tableau, texte) doivent viser un onglet qui existe ; sans onglets, aucun lien n'est permis. */
function verifierLiens(tuiles, onglets) {
  const ids = new Set((onglets ?? []).map((o) => o.id));
  const ok = (cible, chemin) => { if (!ids.has(cible)) refuser(`${chemin} : le lien « ${cible} » ne mène à aucun onglet.`); };
  for (const t of tuiles) {
    const c = `Tuile « ${t.id} »`;
    if (t.lien) ok(t.lien.onglet, c);
    for (const col of t.type === 'tableau' ? t.colonnes : []) if (col.lien) ok(col.lien.onglet, c);
    if (t.type === 'texte') for (const cible of liensDuTexte(t.texte, c)) ok(cible, c);
  }
}

/** Le filtre d'un croisement doit être affiché dans l'onglet de sa tuile (le clic sur un graphique n'est jamais le seul moyen : la liste des filtres existe). Sans onglets : tous les filtres sont affichés. */
function verifierCroisements(tuiles, onglets) {
  if (!onglets) return;
  for (const t of tuiles) {
    if (!t.croisement) continue;
    const o = onglets.find((x) => x.tuiles.includes(t.id) || (x.sections ?? []).some((sec) => sec.tuiles.includes(t.id)));
    if (!o || !(o.filtres ?? []).includes(t.croisement.filtre)) refuser(`Tuile « ${t.id} » : le filtre du croisement doit être dans la liste « filtres » de l'onglet de la tuile.`);
  }
}

/** Cohérence onglet / tuiles : une tuile ne déclare que des filtres que son onglet liste (sinon le filtre ne l'atteindrait jamais), et un onglet ne liste que des filtres qu'une de ses tuiles déclare. Sans onglets : rien à vérifier. */
function verifierFiltresDesOnglets(tuiles, onglets) {
  if (!onglets) return;
  for (const o of onglets) {
    const ids = new Set([...o.tuiles, ...(o.sections ?? []).flatMap((x) => x.tuiles)]);
    const siens = tuiles.filter((t) => ids.has(t.id));
    const listes = new Set(o.filtres ?? []);
    for (const t of siens) for (const id of Object.keys(t.filtres ?? {})) if (!listes.has(id)) refuser(`Tuile « ${t.id} » : le filtre « ${id} » n'est pas dans la liste « filtres » de son onglet « ${o.id} ».`);
    for (const id of listes) if (!siens.some((t) => Object.hasOwn(t.filtres ?? {}, id))) refuser(`Onglet « ${o.id} » : le filtre « ${id} » n'est déclaré par aucune de ses tuiles.`);
  }
}

/**
 * Valide un réglage COMPLET reçu (enregistrement ou aperçu) et rend la forme normalisée { groupes, tableau: { titre, tuiles, onglets? } } (sans version ni date : le serveur les pose).
 * Les clés inconnues sont ignorées. Lance `ErreurPilotage('invalid-argument', message)`.
 * `tolerant` (relecture du document DÉJÀ enregistré) : les titres et les `@couleur` ne sont pas filtrés (un ancien réglage valide ne devient jamais « invalide ») ; strict pour l'enregistrement et l'aperçu.
 */
export function validerReglages(brut, { tolerant = false } = {}) {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) refuser('Le réglage est vide ou mal formé.');
  const groupes = validerGroupes(brut.groupes);
  const t = brut.tableau;
  if (!t || typeof t !== 'object' || Array.isArray(t)) refuser('Le tableau manque dans le réglage.');
  const tuilesBrutes = t.tuiles ?? [];
  if (!Array.isArray(tuilesBrutes)) refuser('Les tuiles doivent être une liste.');
  const avecOnglets = Array.isArray(t.onglets) && t.onglets.length > 0;
  const plafond = avecOnglets ? TUILES_TOTAL_MAX : TUILES_MAX;
  if (tuilesBrutes.length > plafond) refuser(`Trop de tuiles (${plafond} au plus${avecOnglets ? `, et ${TUILES_MAX} par onglet` : ''}).`);
  const ids = new Set();
  const filtres = validerFiltres(t.filtres);
  const filtresDeclares = new Map(filtres.map((f) => [f.id, f.type]));
  const tuiles = tuilesBrutes.map((x, i) => validerTuile(x, i, ids, tolerant, filtresDeclares));
  const onglets = validerOnglets(t.onglets, tuiles, filtresDeclares);
  verifierLiens(tuiles, onglets);
  verifierCroisements(tuiles, onglets);
  verifierFiltresDesOnglets(tuiles, onglets);
  const titreTableau = texteCourt(t.titre, 120); // tronqué comme avant, jamais refusé pour sa longueur
  if (!tolerant && titreTableau) verifierChaine(titreTableau, 'Titre du tableau', CONTEXTE_TEXTE);
  const tableau = { titre: titreTableau, tuiles };
  if (filtres.length) tableau.filtres = filtres;
  if (onglets) tableau.onglets = onglets;
  const valide = { groupes, tableau };
  if (JSON.stringify(valide).length > REGLAGE_MAX) refuser(`Le réglage est trop volumineux (${REGLAGE_MAX} caractères au plus, toutes tuiles et tous groupes ensemble). Retire une tuile ou raccourcis une option.`);
  return valide;
}

/** Vrai si l'appelant (e-mail DÉJÀ vérifié par l'appel) voit la tuile. Sans `visiblePour` : tout le monde. Liste vide ou groupe inconnu : personne. */
export function tuileVisible(tuile, groupes, email) {
  if (tuile.visiblePour === undefined || tuile.visiblePour === null) return true;
  const moi = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!moi) return false;
  return tuile.visiblePour.some((entree) => {
    const e = String(entree).trim().toLowerCase();
    if (e.includes('@')) return e === moi;
    const membres = groupes && Object.hasOwn(groupes, e) ? groupes[e] : null;
    return Array.isArray(membres) && membres.some((m) => String(m).trim().toLowerCase() === moi);
  });
}

/**
 * Nombre de lignes lues pour une tuile : un grand chiffre n'en lit que 2 (avec variation) ou 1 ; un tableau, 500 par défaut (le plafond) ; le reste, 200 par défaut ; `limite` du réglage sinon.
 * L'écran reçoit cette limite pour dire « 500 premières lignes » quand elle est atteinte.
 */
export function limiteDe(tuile) {
  if (tuile?.type === 'chiffre') return tuile.variation ? 2 : 1;
  if (tuile?.limite !== undefined && tuile?.limite !== null) return tuile.limite;
  return tuile?.type === 'tableau' || tuile?.type === 'arbre' ? LIMITE_MAX : LIMITE_DEFAUT;
}

const identifiantSur = (c, message) => {
  if (typeof c !== 'string' || !MOTIF_COLONNE.test(c) || c.length > LONGUEUR_VUE_MAX || CLES_INTERDITES.has(c)) throw new ErreurPilotage('invalid-argument', message);
  return `"${c}"`;
};

/**
 * Une clause de filtre -> texte SQL AVEC paramètres `$n` (les valeurs sont poussées dans `valeurs`, jamais écrites dans le texte). Opérateurs en liste fermée :
 * période `"c" >= $1::date and "c" < ($2::date + 1)` (bornes incluses ; la colonne doit être de type `date`) ; liste `"c"::text = any($n::text[])` (liste vide : aucune clause) ; intervalle `>= $n::numeric` / `<= $n::numeric` ; oui_non `= $n`.
 * `clause` = { colonne, type, ... } construit par le service à partir du réglage VALIDÉ ; la colonne est revalidée ici.
 */
function clauseSql(clause, valeurs) {
  const col = identifiantSur(clause?.colonne, 'Filtre invalide.');
  const p = (v) => { valeurs.push(v); return `$${valeurs.length}`; };
  if (clause.type === 'periode') {
    if (!estDateReelle(clause.du) || !estDateReelle(clause.au)) throw new ErreurPilotage('invalid-argument', 'Filtre invalide.', 'filtre');
    const du = p(clause.du);
    const au = p(clause.au);
    return `${col} >= ${du}::date and ${col} < (${au}::date + 1)`;
  }
  if (clause.type === 'liste') {
    if (!Array.isArray(clause.valeurs) || !clause.valeurs.length) return null;
    return `${col}::text = any(${p(clause.valeurs.map(String))}::text[])`; // comparaison en texte : une valeur d'un autre type que la colonne donne zéro ligne, jamais une erreur
  }
  if (clause.type === 'intervalle') {
    const morceaux = [];
    if (clause.min !== undefined) morceaux.push(`${col} >= ${p(clause.min)}::numeric`);
    if (clause.max !== undefined) morceaux.push(`${col} <= ${p(clause.max)}::numeric`);
    return morceaux.length ? morceaux.join(' and ') : null;
  }
  if (clause.type === 'oui_non') return `${col} = ${p(clause.valeur === true)}`;
  throw new ErreurPilotage('invalid-argument', 'Filtre invalide.', 'filtre');
}

/**
 * Requête d'une tuile : { sql, valeurs }.
 *  - tuile simple : `select * from "<vue>" [where <filtres>] [order by "<col>" asc|desc] limit <n>` ;
 *  - tuile AGRÉGÉE (`grouper` / `mesures`) : `select "<g>", sum("<c>") as "<nom>" from "<vue>" [where <filtres>] [group by "<g>"] [order by …] limit <n>` (calculs sum, count, avg, min, max ; `nombre` sans colonne = `count(*)`).
 * Revalide la vue, les colonnes et la limite (défense en profondeur : le texte SQL ne vient que d'ici ; aucune valeur n'y entre, elles sont dans `valeurs`).
 * Sans tri demandé : pas de `order by` (l'ordre des lignes n'est alors pas garanti) ; le réglage doit donc porter un `tri` quand l'ordre compte (courbe dans le temps, classement…).
 * Un grand chiffre AVEC variation : `order by "<periodeColonne>" desc nulls last limit 2` ; SANS variation : `limit 1` en respectant `tri`.
 */
export function construireRequete(tuile, clauses = []) {
  if (typeof tuile?.vue !== 'string' || !MOTIF_VUE.test(tuile.vue) || tuile.vue.length > LONGUEUR_VUE_MAX) throw new ErreurPilotage('invalid-argument', 'Vue invalide.');
  const limite = limiteDe(tuile);
  if (!Number.isInteger(limite) || limite < 1 || limite > LIMITE_MAX) throw new ErreurPilotage('invalid-argument', 'Limite invalide.');
  let ordre = tuile.tri;
  if (tuile.type === 'chiffre' && tuile.variation) ordre = { colonne: tuile.variation.periodeColonne, sens: 'desc' };
  let tri = '';
  if (ordre) {
    const { colonne, sens } = ordre;
    if (typeof colonne !== 'string' || !MOTIF_COLONNE.test(colonne) || colonne.length > LONGUEUR_VUE_MAX || CLES_INTERDITES.has(colonne) || (sens !== 'asc' && sens !== 'desc')) throw new ErreurPilotage('invalid-argument', 'Tri invalide.');
    tri = ` order by "${colonne}" ${sens}${tuile.type === 'chiffre' && tuile.variation ? ' nulls last' : ''}`; // une ligne sans période (un total) ne passe jamais devant les vraies périodes
  }
  const valeurs = [];
  const morceaux = (Array.isArray(clauses) ? clauses : []).map((c) => clauseSql(c, valeurs)).filter(Boolean);
  const ou = morceaux.length ? ` where ${morceaux.join(' and ')}` : '';
  let selection = '*';
  let regroupe = '';
  if (tuile.mesures !== undefined) {
    const grouper = Array.isArray(tuile.grouper) ? tuile.grouper : [];
    const mesures = tuile.mesures;
    if (!Array.isArray(mesures) || mesures.length < 1 || mesures.length > MESURES_MAX || grouper.length > GROUPER_MAX) throw new ErreurPilotage('invalid-argument', 'Agrégation invalide.');
    const g = grouper.map((c) => identifiantSur(c, 'Agrégation invalide.'));
    const m = mesures.map((x) => {
      if (typeof x?.calcul !== 'string' || !Object.hasOwn(CALCULS, x.calcul)) throw new ErreurPilotage('invalid-argument', 'Agrégation invalide.');
      const arg = x.colonne === undefined && x.calcul === 'nombre' ? '*' : identifiantSur(x.colonne, 'Agrégation invalide.');
      return `${CALCULS[x.calcul]}(${arg}) as ${identifiantSur(x.nom, 'Agrégation invalide.')}`;
    });
    selection = [...g, ...m].join(', ');
    if (g.length) regroupe = ` group by ${g.join(', ')}`;
  }
  return { sql: `select ${selection} from "${tuile.vue}"${ou}${regroupe}${tri} limit ${limite}`, valeurs };
}

/** Requête SANS filtre (texte SQL seul). Même sortie qu'avant les filtres pour une tuile simple. */
export function construireSql(tuile) {
  return construireRequete(tuile).sql;
}

/** Valeurs distinctes d'un filtre « liste » lu dans une vue : `select distinct "<col>" from "<vue>" where "<col>" is not null order by 1 limit 201` (201 = « liste tronquée » : le service en rend 200 et le dit). */
export function construireRequeteValeurs(valeurs) {
  if (typeof valeurs?.vue !== 'string' || !MOTIF_VUE.test(valeurs.vue) || valeurs.vue.length > LONGUEUR_VUE_MAX) throw new ErreurPilotage('invalid-argument', 'Vue invalide.');
  const col = identifiantSur(valeurs.colonne, 'Filtre invalide.');
  return `select distinct ${col} from "${valeurs.vue}" where ${col} is not null order by 1 limit ${LISTE_VALEURS_MAX + 1}`;
}
