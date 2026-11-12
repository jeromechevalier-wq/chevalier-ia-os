// Règles pures de l'écran « Posts » du module Réseaux sociaux (aucune dépendance à Firebase ni au DOM : importables par les tests Node).
// Les posts viennent de Buffer (texte, statut, dates, chiffres : toujours lus, jamais copiés) ; le module ne garde que le classement de chaque post
// (pilier, format, services ; clé = identifiant Buffer). Ici : fusion des deux, colonnes, filtres, tableau des statistiques, matrice pilier × format et contrôle éditorial
// (source : fiche « Ligne éditoriale LinkedIn Chevalier IA » du second cerveau). Les jours et les heures se calculent à Paris (heure d'été et d'hiver).
import * as L from '../crm/logique.js';
import * as R from './logique.js';

/** Part de vidéos visée sur l'ensemble des posts (décision de Jérôme du 10/10/2026). */
export const PART_VIDEO_CIBLE = 50;
/** Le contrôle « vidéos » regarde les derniers posts publiés et programmés. */
export const NB_POSTS_VIDEO = 8;
/** Un pilier est jugé « loin de sa cible » à plus de 15 points d'écart. */
export const ECART_PILIER_MAX = 15;
/** Décision prise seul : en dessous de 5 posts classés, la part d'un pilier ne veut rien dire (un seul post = 100 %) : le contrôle des piliers se tait. */
export const MIN_POSTS_CLASSES = 5;

const instantDate = (v) => L.versDate(v)?.getTime() ?? null;
/** Instant qui range un post : publié = date de publication, sinon date prévue ; null si Buffer n'en donne pas. */
export const instantPost = (p) => instantDate(p?.statut === 'publie' ? p.publieLe : (p?.prevuLe ?? p?.publieLe));

/** Texte sur une ligne, pour les cartes et les tableaux : première ligne non vide, coupée à `n` caractères. */
export function debutPost(texte, n = 80) {
  const ligne = String(texte ?? '').split(/\r?\n/).map((l) => l.trim()).find(Boolean) ?? '';
  return R.debutTexte(ligne, n);
}

/** Longueur d'un texte telle que LinkedIn la compte : en caractères (un emoji compte pour un). */
export const longueurTexte = (texte) => Array.from(String(texte ?? '')).length;

// ---------------------------------------------------------------- fusion Buffer + classements

/**
 * Pose sur chaque post de Buffer son classement : `classement` = { pilier, format, services } (valeurs inconnues rangées) et `classe` = un document de classement existe.
 * `classements` = les documents de reseauxsociaux_posts ({ id, pilier, format, services }). Un post sans document = « pas encore classé ». Les posts sans identifiant sont ignorés.
 */
export function fusionnerPosts(postsBuffer, classements) {
  const parId = new Map((classements || []).map((c) => [c.id, c]));
  return (postsBuffer || []).filter((p) => p && typeof p.id === 'string' && p.id).map((p) => {
    const c = parId.get(p.id) ?? null;
    return { ...p, classe: !!c, classement: R.normaliserClassement(c ?? {}) };
  });
}

/** Un post est une vidéo s'il porte un fichier vidéo dans Buffer, ou s'il est classé « Vidéo 9:16 » ou « Animation 16:9 » (décision prise seul : une animation se publie comme une vidéo). */
export const estVideo = (p) => p?.video === true || ['video', 'animation'].includes(p?.classement?.format);

// ---------------------------------------------------------------- filtres

export const criteresVides = () => ({ recherche: '', piliers: [], formats: [], services: [], nonClasses: false });

/** Filtres combinés : « ou » dans un groupe, « et » entre groupes ; rien de coché = tout. La recherche porte sur le texte du post (sans tenir compte des accents ni des majuscules). */
export function filtrerPosts(posts, criteres = {}) {
  const c = { ...criteresVides(), ...criteres };
  const mot = L.normaliser(c.recherche || '').trim();
  return (posts || []).filter((p) => {
    if (mot && !L.normaliser(p.texte || '').includes(mot)) return false;
    if (c.piliers.length && !c.piliers.includes(p.classement?.pilier)) return false;
    if (c.formats.length && !c.formats.includes(p.classement?.format)) return false;
    if (c.services.length && !(p.classement?.services || []).some((s) => c.services.includes(s))) return false;
    if (c.nonClasses && p.classe) return false;
    return true;
  });
}

/** Nombre de filtres posés (la recherche n'en est pas un : elle a son propre champ). */
export const nombreFiltres = (criteres = {}) => {
  const c = { ...criteresVides(), ...criteres };
  return c.piliers.length + c.formats.length + c.services.length + (c.nonClasses ? 1 : 0);
};

// ---------------------------------------------------------------- colonnes du Kanban

// Nulls (pas de date) toujours à la fin, dans les deux sens.
const comparer = (a, b, sens) => {
  const x = instantPost(a); const y = instantPost(b);
  if (x === null && y === null) return 0;
  if (x === null) return 1;
  if (y === null) return -1;
  return sens === 'asc' ? x - y : y - x;
};

/**
 * Les trois colonnes : Brouillons, Programmés, Publiés (les posts d'un autre statut sont comptés à part dans `autres`).
 * `sens` 'desc' (départ) = ordre naturel de chaque colonne : brouillons et publiés du plus récent au plus ancien, programmés du plus proche au plus lointain ; 'asc' inverse les trois.
 */
export function colonnesPosts(posts, sens = 'desc') {
  const trier = (liste, naturel) => [...liste].sort((a, b) => comparer(a, b, sens === 'asc' ? (naturel === 'asc' ? 'desc' : 'asc') : naturel));
  const de = (statut) => (posts || []).filter((p) => p.statut === statut);
  return {
    brouillons: trier(de('brouillon'), 'desc'),
    programmes: trier(de('programme'), 'asc'),
    publies: trier(de('publie'), 'desc'),
    autres: (posts || []).filter((p) => !['brouillon', 'programme', 'publie'].includes(p.statut)).length,
  };
}

// ---------------------------------------------------------------- tableau des statistiques

export const COLONNES_STATS = Object.freeze([
  { id: 'date', libelle: 'Date', numerique: false },
  { id: 'texte', libelle: 'Post', numerique: false },
  { id: 'pilier', libelle: 'Pilier', numerique: false },
  { id: 'format', libelle: 'Format', numerique: false },
  { id: 'impressions', libelle: 'Impressions', numerique: true },
  { id: 'portee', libelle: 'Portée', numerique: true },
  { id: 'reactions', libelle: 'Réactions', numerique: true },
  { id: 'commentaires', libelle: 'Commentaires', numerique: true },
  { id: 'tauxEngagement', libelle: 'Engagement', numerique: true },
]);
const NUMERIQUES = COLONNES_STATS.filter((c) => c.numerique).map((c) => c.id);

const nombreOuNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/**
 * Tableau des posts PUBLIÉS : une ligne par post (valeur absente = null, jamais un zéro inventé) et la moyenne de chaque colonne de chiffres.
 * La moyenne d'une colonne ne compte que les posts qui ont cette valeur ; null si aucun n'en a. Lignes du plus récent au plus ancien.
 */
export function statistiques(posts) {
  const lignes = (posts || []).filter((p) => p.statut === 'publie').sort((a, b) => comparer(a, b, 'desc')).map((p) => ({
    id: p.id, publieLe: p.publieLe ?? null, texte: p.texte ?? '', pilier: p.classement?.pilier ?? null, format: p.classement?.format ?? null,
    ...Object.fromEntries(NUMERIQUES.map((cle) => [cle, nombreOuNull(p.stats?.[cle])])),
  }));
  const moyenne = Object.fromEntries(NUMERIQUES.map((cle) => {
    const valeurs = lignes.map((l) => l[cle]).filter((v) => v !== null);
    return [cle, valeurs.length ? valeurs.reduce((s, v) => s + v, 0) / valeurs.length : null];
  }));
  return { lignes, moyenne };
}

/** Trie les lignes du tableau selon une colonne ; les valeurs absentes restent à la fin dans les deux sens. */
export function trierStatistiques(lignes, colonne, sens = 'desc') {
  const valeur = (l) => {
    if (colonne === 'date') return instantDate(l.publieLe);
    if (colonne === 'texte') return L.normaliser(debutPost(l.texte, 80));
    if (colonne === 'pilier') return l.pilier ? R.PILIERS.findIndex((p) => p.id === l.pilier) : null;
    if (colonne === 'format') return l.format ? R.FORMATS.findIndex((f) => f.id === l.format) : null;
    return l[colonne] ?? null;
  };
  const m = sens === 'asc' ? 1 : -1;
  return [...lignes].sort((a, b) => {
    const x = valeur(a); const y = valeur(b);
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return (typeof x === 'string' ? x.localeCompare(y, 'fr') : x - y) * m;
  });
}

/** Taux d'engagement : un chiffre après la virgule et le signe %, « — » s'il manque (l'unité de Buffer, en pour cent, reste à confirmer sur de vraies données). */
export function formaterTaux(v) {
  return typeof v === 'number' && Number.isFinite(v) ? `${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(v)} %` : '—';
}

/** Nombre entier au format français pour une moyenne (arrondie à l'unité), « — » s'il manque. */
export const formaterMoyenne = (v) => R.formaterNombre(typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : null);

// ---------------------------------------------------------------- matrice pilier × format

/** Colonnes de la matrice, dans l'ordre de lecture voulu (les formats vidéo sont côte à côte à la fin). */
export const FORMATS_MATRICE = Object.freeze(['texte', 'image', 'carrousel', 'video', 'animation']);
/** Les formats qui comptent pour la cible de vidéos (une animation se publie comme une vidéo). */
export const FORMATS_VIDEO = Object.freeze(['video', 'animation']);
export const NB_SUGGESTIONS = 3;

const pourcent = (n, total) => (total ? Math.round((n * 100) / total) : 0);

/**
 * Matrice pilier × format sur les posts publiés et programmés. Une case ne compte que les posts classés des DEUX côtés (pilier ET format) ;
 * les autres sont comptés à part (`sansPilier`, `sansFormat`), jamais dans une case. Les parts (arrondies à l'unité) sont des parts des posts de la matrice (`classes`).
 * Cibles : uniquement sur le total de chaque ligne (cible du pilier) et sur les colonnes vidéo + animation (50 %), jamais par case.
 * `suggestions` : les cases les plus utiles à remplir (voir `suggererCases`).
 */
export function matrice(posts) {
  const retenus = (posts || []).filter((p) => p.statut === 'publie' || p.statut === 'programme');
  const rangees = retenus.filter((p) => p.classement?.pilier && p.classement?.format && FORMATS_MATRICE.includes(p.classement.format));
  const classes = rangees.length;
  const formats = FORMATS_MATRICE.map((id) => R.FORMATS.find((f) => f.id === id));
  const nombreCase = (pilier, format) => rangees.filter((p) => p.classement.pilier === pilier && p.classement.format === format).length;
  const lignes = R.PILIERS.map((pilier) => {
    const cases = formats.map((f) => { const nombre = nombreCase(pilier.id, f.id); return { format: f.id, nombre, part: pourcent(nombre, classes) }; });
    const nombre = cases.reduce((t, c) => t + c.nombre, 0);
    return { id: pilier.id, libelle: pilier.libelle, cible: pilier.cible, cases, nombre, part: pourcent(nombre, classes) };
  });
  const colonnes = formats.map((f) => { const nombre = rangees.filter((p) => p.classement.format === f.id).length; return { id: f.id, libelle: f.libelle, nombre, part: pourcent(nombre, classes) }; });
  const nbVideo = colonnes.filter((c) => FORMATS_VIDEO.includes(c.id)).reduce((t, c) => t + c.nombre, 0);
  const sortie = {
    total: retenus.length,
    classes,
    sansPilier: retenus.filter((p) => !p.classement?.pilier).length,
    sansFormat: retenus.filter((p) => !p.classement?.format).length,
    lignes,
    colonnes,
    video: { formats: [...FORMATS_VIDEO], nombre: nbVideo, part: pourcent(nbVideo, classes), cible: PART_VIDEO_CIBLE },
  };
  return { ...sortie, suggestions: suggererCases(sortie) };
}

/**
 * Les 3 cases (pilier × format) les plus utiles à remplir : on additionne l'écart de la ligne à sa cible (points, positif quand le pilier est en retard)
 * et l'écart de la colonne à sa cible (vidéo et animation se partagent les 50 % de vidéos ; les trois autres formats se partagent les 50 % restants).
 * À score égal, la case la moins remplie passe d'abord, puis l'ordre de lecture (lignes puis colonnes). Matrice sans aucun post : liste vide.
 */
export function suggererCases(m) {
  if (!m?.total) return [];
  const classes = m.classes;
  const partVideo = classes ? (m.video.nombre * 100) / classes : 0;
  const ecartColonne = (id) => (FORMATS_VIDEO.includes(id) ? (m.video.cible - partVideo) / FORMATS_VIDEO.length : (partVideo - m.video.cible) / (FORMATS_MATRICE.length - FORMATS_VIDEO.length));
  const candidats = [];
  m.lignes.forEach((l, i) => {
    const partLigne = classes ? (l.nombre * 100) / classes : 0;
    m.colonnes.forEach((c, j) => {
      const nombre = l.cases[j].nombre;
      candidats.push({ ordre: i * 100 + j, pilier: l.id, format: c.id, nombre, score: (l.cible - partLigne) + ecartColonne(c.id), partLigne: Math.round(partLigne), cibleLigne: l.cible, libellePilier: l.libelle, libelleFormat: c.libelle });
    });
  });
  candidats.sort((a, b) => b.score - a.score || a.nombre - b.nombre || a.ordre - b.ordre);
  return candidats.slice(0, NB_SUGGESTIONS).map((c) => {
    const partV = Math.round(partVideo);
    const raison = `${c.libellePilier} est à ${c.partLigne} % (cible ${c.cibleLigne} %)`
      + (FORMATS_VIDEO.includes(c.format) ? `, les vidéos à ${partV} % (cible ${m.video.cible} %)` : '')
      + (c.nombre === 0 ? ' et cette case est encore vide.' : '.');
    return { pilier: c.pilier, format: c.format, titre: `${c.libellePilier} × ${c.libelleFormat}`, phrase: raison, nombre: c.nombre };
  });
}

// ---------------------------------------------------------------- contrôle éditorial

/** « 06:08 » -> « 6 h 08 ». */
const heureLisible = (heure) => heure.replace(/^0/, '').replace(':', ' h ');

/**
 * Le contrôle éditorial : une liste de phrases positives, une par point à regarder ; liste vide = « Tout est en ordre ».
 * `posts` = les posts de Buffer, `classements` = les documents de reseauxsociaux_posts. Chaque phrase : { code, texte, postId? }, code = a à e.
 *  a. un créneau (mardi ou jeudi, 21 prochains jours) sans post programmé ;
 *  b. un texte programmé ou en brouillon au-dessus de 3 000 caractères ;
 *  c. un post programmé sans pilier ou sans format ;
 *  d. moins de 50 % de vidéos sur les 8 derniers posts publiés et programmés ;
 *  e. un pilier à plus de 15 points de sa cible (à partir de 5 posts classés).
 */
export function controlesEditoriaux(posts, classements, maintenant = new Date()) {
  const tous = fusionnerPosts(posts, classements);
  const sortie = [];
  // a. créneaux vides
  for (const c of R.creneauxAVenir(maintenant, tous).filter((x) => !x.post)) {
    sortie.push({ code: 'a', texte: `Le créneau du ${R.libelleJour(c.date)} à ${heureLisible(c.heure)} attend un post.` });
  }
  // b. textes trop longs
  for (const p of tous.filter((x) => (x.statut === 'programme' || x.statut === 'brouillon') && longueurTexte(x.texte) > R.LIMITE_LINKEDIN)) {
    const trop = longueurTexte(p.texte) - R.LIMITE_LINKEDIN;
    sortie.push({ code: 'b', postId: p.id, texte: `Ce texte dépasse la limite de LinkedIn de ${R.formaterNombre(trop)} caractère${trop > 1 ? 's' : ''} : « ${debutPost(p.texte, 40)} »` });
  }
  // c. programmés non classés
  for (const p of tous.filter((x) => x.statut === 'programme' && (!x.classement.pilier || !x.classement.format))) {
    const manque = !p.classement.pilier && !p.classement.format ? 'pilier ni de format' : !p.classement.pilier ? 'pilier' : 'format';
    sortie.push({ code: 'c', postId: p.id, texte: `Le post programmé « ${debutPost(p.texte, 40)} » n’a pas encore de ${manque}.` });
  }
  // d. part de vidéos des derniers posts
  const derniers = tous.filter((p) => p.statut === 'publie' || p.statut === 'programme').sort((a, b) => comparer(a, b, 'desc')).slice(0, NB_POSTS_VIDEO);
  if (derniers.length && (derniers.filter(estVideo).length * 100) / derniers.length < PART_VIDEO_CIBLE) {
    const part = Math.round((derniers.filter(estVideo).length * 100) / derniers.length);
    sortie.push({ code: 'd', texte: `La part de vidéos est de ${part} % sur les ${derniers.length} derniers posts (objectif ${PART_VIDEO_CIBLE} %).` });
  }
  // e. piliers loin de leur cible
  const eq = matrice(tous);
  if (eq.classes >= MIN_POSTS_CLASSES) {
    for (const p of eq.lignes.filter((x) => Math.abs((x.nombre * 100) / eq.classes - x.cible) > ECART_PILIER_MAX)) {
      sortie.push({ code: 'e', texte: `Le pilier « ${p.libelle} » pèse ${p.part} % des posts classés (cible ${p.cible} %).` });
    }
  }
  return sortie;
}

// ---------------------------------------------------------------- dates de carte

const partsDateHeure = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit', hourCycle: 'h23', timeZone: L.FUSEAU });
const majuscule = (t) => (t ? t[0].toUpperCase() + t.slice(1) : t);

/** « Mardi 17 nov. 6h08 » (heure de Paris) ; chaîne vide si la date manque. */
export function libelleDatePrevue(dateLike) {
  const d = L.versDate(dateLike);
  if (!d) return '';
  const p = Object.fromEntries(partsDateHeure.formatToParts(d).map((x) => [x.type, x.value]));
  return `${majuscule(p.weekday)} ${p.day} ${p.month} ${p.hour}h${p.minute}`;
}

/** Ligne de date d'une carte : « Mardi 17 nov. 6h08 » (programmé), « Publié le 3 novembre 2026 » (publié), « Sans date » sinon. */
export function libelleDateCarte(p) {
  if (p?.statut === 'publie') return p.publieLe ? `Publié le ${R.libelleDate(p.publieLe)}` : 'Publié';
  return libelleDatePrevue(p?.prevuLe) || 'Sans date prévue';
}

/** « 1 240 impressions · 31 réactions », ou « Pas encore de chiffres » quand Buffer n'a rien donné (stats nul). */
export function libelleChiffres(stats) {
  if (!stats) return 'Pas encore de chiffres';
  return `${R.formaterNombre(stats.impressions)} impressions · ${R.formaterNombre(stats.reactions)} réactions`;
}

/** Classement modifié ? (pour griser « Enregistrer » tant que rien n'a changé). */
export function classementModifie(avant, apres) {
  const a = R.normaliserClassement(avant ?? {}); const b = R.normaliserClassement(apres ?? {});
  return a.pilier !== b.pilier || a.format !== b.format || a.services.join('|') !== b.services.join('|');
}
