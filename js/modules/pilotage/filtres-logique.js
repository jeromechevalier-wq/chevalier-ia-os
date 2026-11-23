// Filtres du Tableau de bord, côté écran : règles PURES (sans DOM ni Firebase, testées par Node). Le serveur valide, résout les défauts et rend `applique` ;
// ce fichier ne fait que : ranger les choix de l'utilisateur (forme « requête »), fabriquer la clé `filtres` de la requête, dire ce qui est actif (pastilles),
// traduire un clic sur un graphique en choix de filtre (croisement), et fabriquer le CSV d'un tableau. Les valeurs venues du serveur ne sont jamais du HTML.
import { formater, nombre, estVide } from './formats.js';

export const RACCOURCIS = Object.freeze([
  { valeur: 'ce_mois', libelle: 'Ce mois-ci' }, { valeur: 'mois_dernier', libelle: 'Le mois dernier' }, { valeur: '3_mois', libelle: 'Les 3 derniers mois' },
  { valeur: '6_mois', libelle: 'Les 6 derniers mois' }, { valeur: '12_mois', libelle: 'Les 12 derniers mois' }, { valeur: 'annee', libelle: 'Cette année' }, { valeur: 'tout', libelle: 'Toute la période' },
]);
export const MESSAGE_FILTRES_REINITIALISES = 'Filtres réinitialisés.';
export const MESSAGE_LISTE_TRONQUEE = 'Liste incomplète : seules les premières valeurs sont proposées.';
const estObjet = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const MOTIF_DATE = /^\d{4}-\d{2}-\d{2}$/;
const libelleRaccourci = (r) => RACCOURCIS.find((x) => x.valeur === r)?.libelle ?? '';

/** La valeur « sans filtre » d'un type, dans la forme de la requête : période { raccourci: 'tout' }, liste [], intervalle {}, oui_non null. */
export function valeurNeutre(type) {
  if (type === 'periode') return { raccourci: 'tout' };
  if (type === 'liste') return [];
  if (type === 'intervalle') return {};
  return null;
}

/** Vrai si la valeur (forme requête ou valeur appliquée) ne filtre rien. `undefined` (rien d'appliqué) ne filtre rien non plus. */
export function estNeutre(type, v) {
  if (v === undefined || v === null) return true;
  if (type === 'periode') return !estObjet(v) || (v.du === undefined && (v.raccourci === undefined || v.raccourci === 'tout'));
  if (type === 'liste') return !Array.isArray(v) || v.length === 0;
  if (type === 'intervalle') return !estObjet(v) || (v.min === undefined && v.max === undefined);
  if (type === 'oui_non') return typeof v !== 'boolean';
  return true;
}

/** Valeur appliquée (rendue par le serveur) -> forme de la requête. Une période dont on connaît le raccourci s'envoie par son raccourci (elle suit le calendrier), sinon par ses dates. */
export function versRequete(type, applique) {
  if (estNeutre(type, applique)) return valeurNeutre(type);
  if (type === 'periode') return applique.raccourci !== undefined ? { raccourci: applique.raccourci } : { du: applique.du, au: applique.au };
  if (type === 'liste') return [...applique];
  if (type === 'intervalle') return { ...(applique.min !== undefined ? { min: applique.min } : {}), ...(applique.max !== undefined ? { max: applique.max } : {}) };
  return applique;
}

/** Forme comparable d'une valeur de forme requête (une liste n'a pas d'ordre : le serveur la trie). */
const canon = (type, v) => JSON.stringify(type === 'liste' && Array.isArray(v) ? v.map(String).sort() : v);
const memeValeur = (type, a, b) => canon(type, a) === canon(type, b);

/**
 * La clé `filtres` de la requête, à partir de ce que l'utilisateur a choisi (`memoire` : identifiant -> valeur de forme requête). `undefined` s'il n'y a rien à envoyer :
 * la requête est alors celle d'avant les filtres (le serveur applique les défauts). Une valeur « neutre » mémorisée est envoyée : elle annule un défaut du serveur
 * (liste vide, intervalle vide, `oui_non` à null, période « tout »).
 */
export function requeteFiltres(memoire) {
  const entrees = Object.entries(estObjet(memoire) ? memoire : {});
  return entrees.length ? Object.fromEntries(entrees) : undefined;
}

/** Ce que reçoit `pilotageLire` : `{ onglet?, filtres? }` ; `undefined` quand il n'y a ni l'un ni l'autre. */
export function argumentsDeLecture(onglet, memoire) {
  const filtres = requeteFiltres(memoire);
  return onglet || filtres ? { ...(onglet ? { onglet } : {}), ...(filtres ? { filtres } : {}) } : undefined;
}

/** Retire de la mémoire les filtres que la réponse ne connaît plus (réglage modifié, droits changés). Rend une nouvelle mémoire. */
export function purger(memoire, decls) {
  const ids = new Set(decls.map((d) => d.id));
  return Object.fromEntries(Object.entries(estObjet(memoire) ? memoire : {}).filter(([id]) => ids.has(id)));
}

/**
 * Pose la valeur choisie pour un filtre. `decl.defaut` = la valeur que le serveur applique quand rien n'est envoyé (relevée par l'écran à la première lecture ; absente = aucun défaut).
 * Une valeur égale à ce que le serveur appliquerait sans qu'on la lui dise n'est pas retenue (la clé disparaît de la requête) ; une valeur neutre qui écrase un défaut est retenue (liste vide, « tout »…).
 * Rend une nouvelle mémoire.
 */
export function poser(memoire, decl, valeur) {
  const m = { ...(estObjet(memoire) ? memoire : {}) };
  const neutre = estNeutre(decl.type, valeur);
  const v = neutre ? valeurNeutre(decl.type) : valeur;
  if (memeValeur(decl.type, v, versRequete(decl.type, decl.defaut))) delete m[decl.id];
  else m[decl.id] = v;
  return m;
}

/** Choix de la fenêtre « Filtres » (identifiant -> valeur de forme requête) : seuls les filtres modifiés par rapport à ce qui est appliqué sont retenus. */
export function fusionner(memoire, decls, editions) {
  let m = { ...(estObjet(memoire) ? memoire : {}) };
  for (const d of decls) {
    if (!(d.id in editions)) continue;
    if (memeValeur(d.type, editions[d.id], versRequete(d.type, d.applique))) continue;
    m = poser(m, d, editions[d.id]);
  }
  return m;
}

/** « Tout effacer » : chaque filtre actif passe à sa valeur neutre (la mémoire retient la valeur neutre seulement quand elle écrase un défaut). */
export function toutEffacer(memoire, decls) {
  let m = { ...(estObjet(memoire) ? memoire : {}) };
  for (const d of decls) m = poser(m, d, valeurNeutre(d.type));
  return m;
}

const libelleValeur = (d, v) => (d.choix ?? []).find((c) => String(c.valeur) === String(v))?.libelle ?? String(v);
const dateFr = (iso) => (MOTIF_DATE.test(String(iso)) ? formater('date', iso) : String(iso));
const nombreFr = (n) => formater('', n);

/**
 * Pastilles des filtres ACTIFS (valeur appliquée non neutre), dans l'ordre des filtres : [{ id, cle, valeur, texte }].
 * Une pastille par valeur d'une liste ; `cle` est unique (pour les tests et le focus) ; `valeur` sert à retirer cette seule valeur.
 */
export function pastilles(decls) {
  const sortie = [];
  for (const d of decls) {
    const a = d.applique;
    if (estNeutre(d.type, a)) continue;
    if (d.type === 'periode') {
      const texte = a.raccourci !== undefined ? libelleRaccourci(a.raccourci) || a.raccourci : `du ${dateFr(a.du)} au ${dateFr(a.au)}`;
      sortie.push({ id: d.id, cle: d.id, valeur: null, texte: `${d.libelle} : ${texte}` });
    } else if (d.type === 'liste') {
      for (const v of a) sortie.push({ id: d.id, cle: `${d.id}:${String(v)}`, valeur: v, texte: `${d.libelle} : ${libelleValeur(d, v)}` });
    } else if (d.type === 'intervalle') {
      const texte = a.min !== undefined && a.max !== undefined ? `de ${nombreFr(a.min)} à ${nombreFr(a.max)}` : (a.min !== undefined ? `à partir de ${nombreFr(a.min)}` : `jusqu'à ${nombreFr(a.max)}`);
      sortie.push({ id: d.id, cle: d.id, valeur: null, texte: `${d.libelle} : ${texte}` });
    } else if (d.type === 'oui_non') sortie.push({ id: d.id, cle: d.id, valeur: null, texte: `${d.libelle} : ${a ? 'oui' : 'non'}` });
  }
  return sortie;
}

/** Retire une pastille : la valeur seule pour une liste, tout le filtre sinon. Rend une nouvelle mémoire. */
export function retirerPastille(memoire, decls, p) {
  const d = decls.find((x) => x.id === p.id);
  if (!d) return { ...(estObjet(memoire) ? memoire : {}) };
  if (d.type === 'liste' && p.valeur !== null) return poser(memoire, d, (d.applique ?? []).filter((v) => String(v) !== String(p.valeur)));
  return poser(memoire, d, valeurNeutre(d.type));
}

/** Nombre de filtres actifs (pour la pastille du bouton « Filtres ») : un par filtre, pas un par valeur. */
export const nombreActifs = (decls) => decls.filter((d) => !estNeutre(d.type, d.applique)).length;

// ---------- Croisement : un clic sur un graphique règle un filtre `liste` ----------

/** Une valeur acceptable pour ce filtre `liste` : un texte (200 caractères au plus) ou un nombre fini ; si le filtre a des choix fermés ou une liste complète de valeurs, la valeur doit en faire partie (la forme du choix fait foi). Sinon `undefined`. */
export function valeurDeCroisement(decl, brut) {
  if (!decl || decl.type !== 'liste') return undefined;
  const ok = (typeof brut === 'string' && brut !== '' && brut.length <= 200) || (typeof brut === 'number' && Number.isFinite(brut));
  if (!ok) return undefined;
  const connues = decl.choix?.length ? decl.choix.map((c) => c.valeur) : (decl.valeurs && !decl.tronquee ? decl.valeurs : null);
  if (!connues) return brut;
  return connues.find((v) => String(v) === String(brut));
}

/** Valeur lue dans la donnée de la série que ECharts rend au clic (`params`) : le nom de la barre, de la part ou du point. Jamais autre chose qu'un texte ou un nombre. */
export function lireValeurClic(params) {
  if (!estObjet(params)) return undefined;
  const n = params.name;
  if ((typeof n === 'string' && n !== '') || (typeof n === 'number' && Number.isFinite(n))) return n;
  return undefined;
}

/**
 * Nouveau choix du filtre après un clic sur la valeur `brut` : la valeur n'est pas dans le filtre -> le filtre devient [valeur] ; elle y est -> elle est retirée (second clic).
 * Rend `{ memoire }` (nouvelle mémoire) ou `null` si la valeur ne convient pas à ce filtre (clic ignoré).
 */
export function appliquerCroisement(memoire, decl, brut) {
  const v = valeurDeCroisement(decl, brut);
  if (v === undefined) return null;
  const courant = Array.isArray(decl.applique) ? decl.applique : [];
  const suivant = courant.some((x) => String(x) === String(v)) ? courant.filter((x) => String(x) !== String(v)) : [v];
  return { memoire: poser(memoire, decl, suivant) };
}

/** Rend les séries cliquables (curseur « main ») sur une COPIE de l'option : jamais de fonction, jamais de modification de l'original. */
export function rendreCliquable(option) {
  const sortie = estObjet(option) ? { ...option } : {};
  const poser2 = (s) => (estObjet(s) ? { ...s, cursor: 'pointer' } : s);
  if (Array.isArray(sortie.series)) sortie.series = sortie.series.map(poser2);
  else if (estObjet(sortie.series)) sortie.series = poser2(sortie.series);
  return sortie;
}

// ---------- Export CSV d'un tableau ----------

const DEBUTS_DE_FORMULE = /^[=+\-@\t\r]/;
const NOMBRE_PUR = /^-?\d+([.,]\d+)?$/;
const MOTIF_NOM = /^[a-z0-9_-]{1,40}$/;

/** Texte d'une cellule : vide -> '', booléen -> oui/non, nombre à la française (virgule), le reste tel quel. Jamais d'objet. */
function texteCellule(v) {
  if (estVide(v)) return '';
  if (v === true) return 'oui';
  if (v === false) return 'non';
  if (typeof v === 'number') return Number.isFinite(v) ? String(v).replace('.', ',') : '';
  if (typeof v === 'string') return /^-?\d+\.\d+$/.test(v.trim()) && nombre(v) !== null ? v.trim().replace('.', ',') : v;
  return '';
}

/** Une cellule CSV : neutralise une formule (texte commençant par = + - @ tabulation ou retour : apostrophe devant ; un nombre seul est laissé), puis met entre guillemets si besoin. */
export function celluleCsv(v) {
  let t = texteCellule(v);
  if (DEBUTS_DE_FORMULE.test(t) && !NOMBRE_PUR.test(t)) t = `'${t}`;
  return /[;"\n\r]/.test(t) ? `"${t.replaceAll('"', '""')}"` : t;
}

/** CSV d'un tableau : séparateur point-virgule (Excel en français), BOM UTF-8, fin de ligne CRLF. `colonnes` = [{ colonne, titre }] de la tuile ; `lignes` = les lignes déjà lues. */
export function construireCsv(colonnes, lignes) {
  const cols = (Array.isArray(colonnes) ? colonnes : []).filter((c) => estObjet(c) && typeof c.colonne === 'string');
  const entete = cols.map((c) => celluleCsv(c.titre || c.colonne)).join(';');
  const corps = (Array.isArray(lignes) ? lignes : []).map((l) => cols.map((c) => celluleCsv(estObjet(l) ? l[c.colonne] : '')).join(';'));
  return `﻿${[entete, ...corps].join('\r\n')}\r\n`;
}

/** Nom du fichier : l'identifiant de la tuile (motif sûr du réglage) et la date du jour, jamais une donnée du tableau. */
export function nomFichierCsv(idTuile, date = new Date()) {
  const id = MOTIF_NOM.test(String(idTuile)) ? String(idTuile) : 'tableau';
  const j = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  return `tableau-${id}-${j}.csv`;
}
