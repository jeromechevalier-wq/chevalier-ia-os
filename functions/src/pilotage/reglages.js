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
export const TUILES_MAX = 20;
export const GROUPES_MAX = 30;
export const MEMBRES_MAX = 100;
export const LIMITE_DEFAUT = 200;
export const LIMITE_MAX = 500;
export const PROFONDEUR_OPTION_MAX = 12;

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
// Aucune requête externe, aucune image tirée d'une adresse, aucun script : refusé dans toute chaîne de l'option (clés comprises).
const MOTIFS_INTERDITS = [/http:\/\//i, /https:\/\//i, /image:\/\//i, /javascript:/i, /data:/i];

function verifierChaine(s, chemin) {
  if (MOTIFS_INTERDITS.some((m) => m.test(s))) refuser(`${chemin} : une adresse web, une image externe ou un script (« http:// », « https:// », « image:// », « javascript: », « data: ») est refusé dans une option de graphique. Retire-le.`);
}
function parcourir(valeur, chemin, profondeur) {
  if (profondeur > PROFONDEUR_OPTION_MAX) refuser(`${chemin} : l'option est imbriquée sur trop de niveaux (${PROFONDEUR_OPTION_MAX} au plus). Simplifie-la.`);
  if (typeof valeur === 'string') verifierChaine(valeur, chemin);
  else if (Array.isArray(valeur)) valeur.forEach((v, i) => parcourir(v, `${chemin}[${i}]`, profondeur + 1));
  else if (valeur && typeof valeur === 'object') {
    for (const [k, v] of Object.entries(valeur)) {
      if (CLES_INTERDITES.has(k)) refuser(`${chemin} : la clé « ${k} » est refusée.`);
      verifierChaine(k, chemin);
      parcourir(v, `${chemin}.${k}`, profondeur + 1);
    }
  }
}

/**
 * Parse et valide l'option ECharts d'une tuile (chaîne JSON). Rend l'objet. `etiquette` = texte qui situe l'erreur (ex. « Tuile 2 »).
 * Refuse : pas une chaîne, trop longue, JSON invalide, pas un objet, clé de haut niveau inconnue, adresse ou script dans une chaîne, imbrication trop profonde.
 */
export function analyserOption(texte, etiquette = 'Option') {
  if (typeof texte !== 'string' || !texte.trim()) refuser(`${etiquette} : l'option du graphique est vide. Colle une option ECharts au format JSON.`);
  if (texte.length > OPTION_MAX) refuser(`${etiquette} : l'option est trop longue (${OPTION_MAX} caractères au plus).`);
  let objet;
  try { objet = JSON.parse(texte); } catch { refuser(`${etiquette} : l'option n'est pas un JSON valide (vérifie les guillemets et les virgules ; une fonction n'est pas permise).`); }
  if (!objet || typeof objet !== 'object' || Array.isArray(objet)) refuser(`${etiquette} : l'option doit être un objet JSON (entre accolades).`);
  for (const k of Object.keys(objet)) {
    if (CLES_INTERDITES.has(k)) refuser(`${etiquette} : la clé « ${k} » est refusée.`);
    if (!CLES_OPTION.includes(k)) refuser(`${etiquette} : la clé « ${k.slice(0, 40)} » n'est pas une option de graphique connue. Vérifie l'orthographe.`);
  }
  parcourir(objet, etiquette, 0);
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
    if (!MOTIF_GROUPE.test(nom)) refuser(`Nom de groupe « ${nom.slice(0, 40)} » refusé : lettres minuscules sans accent, chiffres, tiret et tiret bas seulement (40 au plus).`);
    const liste = brut[nom];
    if (!Array.isArray(liste)) refuser(`Le groupe « ${nom} » doit être une liste d'adresses e-mail.`);
    if (liste.length > MEMBRES_MAX) refuser(`Le groupe « ${nom} » a trop d'adresses (${MEMBRES_MAX} au plus).`);
    const vus = new Set();
    for (const a of liste) {
      const adresse = typeof a === 'string' ? a.trim().toLowerCase() : '';
      if (!MOTIF_EMAIL.test(adresse) || adresse.length > 200) refuser(`Le groupe « ${nom} » contient une adresse e-mail invalide.`);
      vus.add(adresse);
    }
    groupes[nom] = [...vus];
  }
  return groupes;
}

function validerTuile(brute, rang, ids) {
  const e = `Tuile ${rang + 1}`;
  if (!brute || typeof brute !== 'object' || Array.isArray(brute)) refuser(`${e} : format invalide.`);
  const id = typeof brute.id === 'string' ? brute.id : '';
  if (!MOTIF_ID.test(id)) refuser(`${e} : l'identifiant doit faire 1 à 40 caractères : lettres minuscules sans accent, chiffres, tiret et tiret bas.`);
  if (ids.has(id)) refuser(`${e} : l'identifiant « ${id} » est déjà pris par une autre tuile.`);
  ids.add(id);
  const etiquette = `Tuile « ${id} »`;
  const titre = texteCourt(brute.titre, 120);
  if (!titre) refuser(`${etiquette} : le titre est obligatoire (120 caractères au plus).`);
  const vue = typeof brute.vue === 'string' ? brute.vue : '';
  if (!MOTIF_VUE.test(vue) || vue.length > LONGUEUR_VUE_MAX) refuser(`${etiquette} : le nom de la vue doit commencer par « v_ » et ne contenir que des lettres minuscules sans accent, des chiffres et des tirets bas.`);
  const tuile = { id, titre, vue };
  if (brute.tri !== undefined && brute.tri !== null) {
    const t = brute.tri;
    if (!t || typeof t !== 'object' || Array.isArray(t)) refuser(`${etiquette} : le tri doit être { colonne, sens }.`);
    if (typeof t.colonne !== 'string' || !MOTIF_COLONNE.test(t.colonne) || t.colonne.length > LONGUEUR_VUE_MAX) refuser(`${etiquette} : la colonne de tri doit être en lettres minuscules sans accent, chiffres et tirets bas (elle ne commence pas par un chiffre).`);
    if (t.sens !== 'asc' && t.sens !== 'desc') refuser(`${etiquette} : le sens du tri doit être « asc » ou « desc ».`);
    tuile.tri = { colonne: t.colonne, sens: t.sens };
  }
  if (brute.limite !== undefined && brute.limite !== null) {
    if (!Number.isInteger(brute.limite) || brute.limite < 1 || brute.limite > LIMITE_MAX) refuser(`${etiquette} : la limite doit être un nombre entier de 1 à ${LIMITE_MAX}.`);
    tuile.limite = brute.limite;
  }
  analyserOption(brute.option, etiquette); // validée ici ; stockée en chaîne
  tuile.option = brute.option;
  if (brute.visiblePour !== undefined && brute.visiblePour !== null) {
    if (!Array.isArray(brute.visiblePour) || brute.visiblePour.length > MEMBRES_MAX) refuser(`${etiquette} : « visiblePour » doit être une liste d'adresses e-mail ou de noms de groupes (${MEMBRES_MAX} au plus).`);
    tuile.visiblePour = brute.visiblePour.map((x) => {
      const v = typeof x === 'string' ? x.trim().toLowerCase() : '';
      if (!(MOTIF_EMAIL.test(v) && v.length <= 200) && !MOTIF_GROUPE.test(v)) refuser(`${etiquette} : « visiblePour » contient une valeur qui n'est ni une adresse e-mail ni un nom de groupe.`);
      return v;
    });
  }
  return tuile;
}

/**
 * Valide un réglage COMPLET reçu (enregistrement ou aperçu) et rend la forme normalisée { groupes, tableau: { titre, tuiles } } (sans version ni date : le serveur les pose).
 * Les clés inconnues sont ignorées. Lance `ErreurPilotage('invalid-argument', message)`.
 */
export function validerReglages(brut) {
  if (!brut || typeof brut !== 'object' || Array.isArray(brut)) refuser('Le réglage est vide ou mal formé.');
  const groupes = validerGroupes(brut.groupes);
  const t = brut.tableau;
  if (!t || typeof t !== 'object' || Array.isArray(t)) refuser('Le tableau manque dans le réglage.');
  const tuilesBrutes = t.tuiles ?? [];
  if (!Array.isArray(tuilesBrutes)) refuser('Les tuiles doivent être une liste.');
  if (tuilesBrutes.length > TUILES_MAX) refuser(`Trop de tuiles (${TUILES_MAX} au plus).`);
  const ids = new Set();
  const tuiles = tuilesBrutes.map((x, i) => validerTuile(x, i, ids));
  return { groupes, tableau: { titre: texteCourt(t.titre, 120), tuiles } };
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
 * Requête d'une tuile : `select * from "<vue>" [order by "<col>" asc|desc] limit <n>`. Revalide la vue, la colonne et la limite (défense en profondeur : le texte SQL ne vient que d'ici).
 * Sans tri demandé : pas de `order by` (l'ordre des lignes n'est alors pas garanti) ; le réglage doit donc porter un `tri` quand l'ordre compte (courbe dans le temps, classement…).
 */
export function construireSql(tuile) {
  if (typeof tuile?.vue !== 'string' || !MOTIF_VUE.test(tuile.vue) || tuile.vue.length > LONGUEUR_VUE_MAX) throw new ErreurPilotage('invalid-argument', 'Vue invalide.');
  const limite = tuile.limite === undefined || tuile.limite === null ? LIMITE_DEFAUT : tuile.limite;
  if (!Number.isInteger(limite) || limite < 1 || limite > LIMITE_MAX) throw new ErreurPilotage('invalid-argument', 'Limite invalide.');
  let tri = '';
  if (tuile.tri) {
    const { colonne, sens } = tuile.tri;
    if (typeof colonne !== 'string' || !MOTIF_COLONNE.test(colonne) || colonne.length > LONGUEUR_VUE_MAX || (sens !== 'asc' && sens !== 'desc')) throw new ErreurPilotage('invalid-argument', 'Tri invalide.');
    tri = ` order by "${colonne}" ${sens}`;
  }
  return `select * from "${tuile.vue}"${tri} limit ${limite}`;
}
