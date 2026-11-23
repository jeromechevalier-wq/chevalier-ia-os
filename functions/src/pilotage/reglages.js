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
export const TYPES_TUILE = Object.freeze(['graphique', 'chiffre', 'tableau', 'texte', 'phrases']);
export const LARGEURS = Object.freeze(['tiers', 'moitie', 'deux-tiers', 'pleine']);
export const FORMATS = Object.freeze(['euros0', 'euros2', 'euros_abrege', 'pourcent0', 'pourcent1', 'entier', 'jours', 'date', 'date_heure', 'mois_annee']);
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

/** Erreur du module : `code` = code d'erreur d'appel (invalid-argument…), `message` = phrase lisible à afficher telle quelle. */
export class ErreurPilotage extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ErreurPilotage';
    this.code = code;
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

// Expression PARTAGÉE (validation, service, formats.js du navigateur) : un lien complet « [libellé](#identifiant) ». Un test verrouille l'égalité des deux constantes (ici et dans formats.js).
export const LIEN_TEXTE_SOURCE = '\\[[^\\]\\n]+\\]\\(#[a-z0-9_-]{1,40}\\)';
/** Les adresses internes d'un texte : « [libellé](#onglet) » ; toute autre cible de lien est refusée. Rend la liste des identifiants d'onglets cités. */
export function liensDuTexte(texte, chemin = 'Texte') {
  const ids = [];
  const reste = String(texte).replace(new RegExp(LIEN_TEXTE_SOURCE, 'g'), (m) => { ids.push(m.slice(m.lastIndexOf('(#') + 2, -1)); return ''; });
  if (reste.includes('](')) refuser(`${chemin} : seuls les liens vers un onglet sont permis, écrits [texte](#identifiant-de-l-onglet).`);
  return ids;
}

function validerTuile(brute, rang, ids, tolerant) {
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
    } else {
      if (brute.option !== undefined && brute.option !== null) refuser(`${etiquette} : ce type de tuile n'a pas d'option de graphique : retire « option ».`);
      if (type === 'chiffre') validerChiffre(brute, etiquette, tuile);
      else if (type === 'tableau') validerTableau(brute, etiquette, tuile);
      else validerPhrases(brute, etiquette, tuile);
    }
  }
  if (brute.visiblePour !== undefined && brute.visiblePour !== null) {
    if (!Array.isArray(brute.visiblePour) || brute.visiblePour.length > MEMBRES_MAX) refuser(`${etiquette} : « visiblePour » doit être une liste d'adresses e-mail ou de noms de groupes (${MEMBRES_MAX} au plus).`);
    tuile.visiblePour = brute.visiblePour.map((x) => {
      const v = typeof x === 'string' ? x.trim().toLowerCase() : '';
      if (!(v.length <= 200 && MOTIF_EMAIL.test(v)) && !MOTIF_GROUPE.test(v)) refuser(`${etiquette} : « visiblePour » contient une valeur qui n'est ni une adresse e-mail ni un nom de groupe.`);
      return v;
    });
  }
  return tuile;
}

/** Onglets : { id, titre, intro?, tuiles: [ids], sections?: [{ id, titre, intro?, tuiles: [ids] }] }. Chaque tuile est placée UNE fois ; au plus TUILES_MAX tuiles par onglet. Pas de sous-onglets : des sections d'un même onglet. */
function validerOnglets(brut, tuiles) {
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
  const tuiles = tuilesBrutes.map((x, i) => validerTuile(x, i, ids, tolerant));
  const onglets = validerOnglets(t.onglets, tuiles);
  verifierLiens(tuiles, onglets);
  const titreTableau = texteCourt(t.titre, 120); // tronqué comme avant, jamais refusé pour sa longueur
  if (!tolerant && titreTableau) verifierChaine(titreTableau, 'Titre du tableau', CONTEXTE_TEXTE);
  const tableau = { titre: titreTableau, tuiles };
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
  return tuile?.type === 'tableau' ? LIMITE_MAX : LIMITE_DEFAUT;
}

/**
 * Requête d'une tuile : `select * from "<vue>" [order by "<col>" asc|desc] limit <n>`. Revalide la vue, la colonne et la limite (défense en profondeur : le texte SQL ne vient que d'ici).
 * Sans tri demandé : pas de `order by` (l'ordre des lignes n'est alors pas garanti) ; le réglage doit donc porter un `tri` quand l'ordre compte (courbe dans le temps, classement…).
 * Un grand chiffre AVEC variation : `order by "<periodeColonne>" desc limit 2` (les deux dernières périodes ; l'écran remet dans l'ordre) ; SANS variation : `limit 1` en respectant `tri`.
 */
export function construireSql(tuile) {
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
  return `select * from "${tuile.vue}"${tri} limit ${limite}`;
}
