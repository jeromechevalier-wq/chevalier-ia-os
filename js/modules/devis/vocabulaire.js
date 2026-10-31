// Dictionnaire de vocabulaire du module Devis (voir docs/proposition-dictionnaire-vocabulaire.md, sections 3, 5 et 7) : le MOTEUR de correspondance.
// Logique PURE : aucun accès à Firebase, au réseau ni au navigateur, aucune lecture de la date (elle est donnée par l'appelant), testée avec node --test.
// Une phrase du client (« mets 3 prises doubles à 25 € ») devient une clé (« prise double »), une quantité, un prix de vente, des candidats classés et une décision :
// `utiliser` (ligne ajoutée sans question), `proposer` (une question avec 1 à 3 choix) ou `demander` (question ouverte).
// L'écran (prévisualisation d'une règle) et le serveur (outils de l'assistant) exécutent ce même code. Jamais de prix d'achat ni de marge dans la sortie.
import { normaliser, ajouterMois } from '../crm/logique.js';
import { prixVenteArticle, calculerOuvrage, articlesParId, TYPE_OUVRAGE, motOuvrage } from './ouvrages.js';

// ---------------------------------------------------------------- constantes (TOUS les seuils sont ici, et seulement ici)
export const SEUILS = Object.freeze({
  /** Décision `utiliser` : meilleur score au moins égal à ce seuil ET écart avec le deuxième au moins égal à `ecartUtiliser`. */
  utiliser: 0.85,
  ecartUtiliser: 0.15,
  /** Décision `proposer` à partir de ce score (0,50 exactement = proposer) ; en dessous : `demander`. */
  proposer: 0.50,
  regleActive: 1.00,
  regleAConfirmer: 0.70,
  regleEnConflit: 0.50,
  regleVisee: 0.65, // règle active dont la clé CONTIENT tous les mots de la phrase
  libelleExact: 0.95,
  /** Mots à plusieurs articles (cadrage vocabulaire-cibles, 2.3) : AUCUN de ces scores n'atteint `utiliser` (0,85) : un mot à plusieurs cibles ne donne jamais une ligne ajoutée sans question. */
  contexteUnique: 0.80, // le seul article de la portée qui contient le reste de la phrase
  contextePlusieurs: 0.65, // plusieurs articles de la portée contiennent le reste
  cibleAuChoix: 0.70, // le reste est vide : un des articles choisis par l'humain
  libelleBase: 0.80, // × (mots de la clé ÷ mots du libellé)
  libellePlancher: 0.60,
  proche: 0.90, // facteur appliqué quand un mot n'est présent qu'à une faute de frappe près
  distanceMotCourt: 1, // pour un mot de `longueurFaute1` lettres et plus
  distanceMotLong: 2, // pour un mot de `longueurFaute2` lettres et plus
  longueurFaute1: 5,
  longueurFaute2: 8,
  maxCandidats: 5,
  maxChoixQuestion: 3,
  maxCibles: 8, // cibles par mot (même limite que les règles Firestore)
  separationAPartir: 5, // un groupe de candidats de cette taille ou plus : UNE question de précision au lieu de citer des articles
  motsPrecision: 3, // mots proposés dans une question de précision
  /** Apprentissage (section 7). */
  confirmationsPourActiver: 2,
  longueurMotTropCourt: 3, // une clé d'un seul mot de cette longueur ou moins est « trop générale »
  maxArticlesParCle: 5, // une clé qui correspond à plus d'articles (étape 4) est « trop générale »
  longueurIdMax: 100,
  /** Validation humaine (cadrage devis fluide, garde-fous 1 à 3). */
  contradictionsPourSuggerer: 2, // un mot validé n'est jamais modifié : à la 2e réponse « autre » il reçoit une suggestion
  confirmationsPourRetirerSuggestion: 3, // 3 jours distincts de confirmation de l'article d'origine retirent la suggestion
  moisAvantRevision: 6,
});

/** Mots retirés d'une phrase et d'un libellé (déjà sans accents ni majuscules ; « à » devient « a »). Les restes d'apostrophe (l', qu', n'…) y sont aussi. */
export const MOTS_VIDES = Object.freeze(new Set([
  'le', 'la', 'les', 'un', 'une', 'des', 'du', 'de', 'd', 'a', 'au', 'aux', 'en', 'et', 'ou', 'pour', 'avec', 'sur', 'dans', 'ce', 'cette', 'ces', 'mon', 'ma', 'mes',
  'je', 'il', 'me', 'moi', 'toi', 'veux', 'voudrais', 'faut', 'faudrait', 'mets', 'mettre', 'ajoute', 'ajouter', 'rajoute', 'aussi', 'encore', 'svp', 'stp', 'merci', 'euro', 'euros',
  'l', 'qu', 'n', 's', 'c', 'j', 'm', 't',
]));

/** Lettres qui sont aussi des unités collées à un nombre (« 16 A », « 10 L ») : en fin de phrase elles empêchent de lire ce nombre comme une quantité. */
const UNITES_LETTRES = new Set(['a', 'l']);
const PRIX = /(\d+(?:[.,]\d+)?)\s*(?:euros?|eur|€)(?![a-z])/g;
const DECIMALE = /(\d)[.,](?=\d)/g; // « 2,5 » -> « 2_5 » (un seul mot)
const NOMBRE = /^\d+(?:_\d+)?$/;
const MOT_LETTRES = /^[a-z]+$/;

// ---------------------------------------------------------------- normalisation
function singulier(mot) {
  if (!MOT_LETTRES.test(mot)) return mot;
  if (/(os|as|us|is|ss)$/.test(mot)) return mot; // « gros », « bas », « pays », « vis » : le s fait partie du mot
  if (mot.length >= 4 && (mot.endsWith('s') || mot.endsWith('x'))) return mot.slice(0, -1);
  return mot;
}

/** Mots d'un texte, minuscules sans accents ni ponctuation, la décimale « 2,5 » gardée en un mot (« 2_5 ») le numéro collé par un tiret à un code (« DJ-20 » -> « dj20 ») et l'unité A ou L collée à son nombre (« 20A » -> « 20 a ») aussi. Les mots vides sont gardés (ils servent à repérer la quantité). */
function decouper(texte) {
  const s = normaliser(texte).replace(/×/g, 'x').replace(/œ/g, 'oe').replace(/æ/g, 'ae').replace(/[’']/g, ' ').replace(/([a-z])-(?=\d)/g, '$1').replace(/(\d)([al])(?![a-z0-9])/g, '$1 $2').replace(DECIMALE, '$1_');
  return s.match(/[a-z0-9_]+/g) ?? [];
}

const nombreDe = (mot) => Number(mot.replace('_', '.'));

/** Normalise un texte de catalogue (libellé, code…) : mots sans mots vides, au singulier. Les nombres restent (« 16 »). */
export function motsDe(texte) {
  return decouper(texte).filter((m) => !MOTS_VIDES.has(m)).map(singulier);
}

/**
 * Analyse d'une phrase : `{ cle, mots, quantite, prixVente, quantiteEnFin, prixSansDevise, nombreFin }`.
 * Prix : « 25 € », « 25 euros », « 25 eur » (retiré AVANT les mots vides, qui contiennent « euro »). Quantité (1 par défaut) : un nombre isolé en début OU en fin de phrase
 * (« 3 prises », « prise 2 »), ou « 3x » / « 3 x » en début. Seul le nombre de DÉBUT est sûr : un nombre de FIN peut être un ampérage, une section, un nombre de rangées
 * (`quantiteEnFin: true`), et un nombre après « à » est un prix sans « € » (`prixSansDevise: true`) ; `interpreter` n'en tire jamais mieux que `proposer`. Un nombre au milieu (« tableau 2 rangées ») et les chiffres collés à un mot (« 16b ») restent dans la clé.
 */
export function analyserPhrase(phrase) {
  let texte = normaliser(phrase);
  let prixVente = null;
  texte = texte.replace(PRIX, (_, n) => { if (prixVente === null) prixVente = Number(n.replace(',', '.')); return ' '; });
  const jetons = decouper(texte);
  let quantite = 1;
  let quantiteEnFin = false;
  let prixSansDevise = false;
  let nombreFin = null; // le nombre de fin tel qu'écrit (« 32 »), pour le remettre dans la clé si un libellé le contient
  // Début : on saute les mots vides (« mets 3 prises »), puis « 3 », « 3x » ou « 3 x ».
  let debut = 0;
  while (debut < jetons.length && MOTS_VIDES.has(jetons[debut])) debut += 1;
  let corps = jetons;
  const premier = jetons[debut];
  const fois = premier?.match(/^(\d+(?:_\d+)?)x$/);
  if (premier && NOMBRE.test(premier) && jetons.length - debut > 1 && nombreDe(premier) > 0) {
    quantite = nombreDe(premier);
    corps = jetons.slice(debut + 1);
    if (corps[0] === 'x' && corps.length > 1) corps = corps.slice(1);
  } else if (fois && jetons.length - debut > 1 && nombreDe(fois[1]) > 0) {
    quantite = nombreDe(fois[1]);
    corps = jetons.slice(debut + 1);
  } else {
    // Fin : on saute les mots vides finaux SAUF « a » et « l » (« prise 16 A », « peinture 10 L » : l'ampère et le litre ne font pas du nombre une quantité).
    let fin = jetons.length;
    while (fin > 0 && !UNITES_LETTRES.has(jetons[fin - 1]) && MOTS_VIDES.has(jetons[fin - 1])) fin -= 1;
    const dernier = jetons[fin - 1];
    if (fin - 1 > 0 && dernier && NOMBRE.test(dernier) && nombreDe(dernier) > 0) {
      // « a » devant le nombre = « à » (prix), sauf si ce « a » suit lui-même un nombre : c'est l'ampère (« disjoncteur 20 A 3 » : 3 est une quantité).
      if (jetons[fin - 2] === 'a' && !NOMBRE.test(jetons[fin - 3] ?? '')) {
        // « câble à 25 » : un nombre après « à » est un prix dit sans « € » (jamais une quantité) ; `interpreter` ne va pas plus loin que `proposer`.
        if (prixVente === null) prixVente = nombreDe(dernier);
        corps = jetons.slice(0, fin - 2);
        prixSansDevise = true;
      } else {
        quantite = nombreDe(dernier);
        corps = jetons.slice(0, fin - 1);
        quantiteEnFin = true;
        nombreFin = dernier;
      }
    }
  }
  const mots = corps.filter((m) => !MOTS_VIDES.has(m)).map(singulier);
  return { cle: mots.join(' '), mots, quantite, prixVente, quantiteEnFin, prixSansDevise, nombreFin };
}

/** La clé normalisée d'une expression (« Prises doubles » -> « prise double »). */
export const cleDeExpression = (expression) => analyserPhrase(expression).cle;

/** Identifiant du document d'une règle = la clé, espaces remplacés par « _ », tronquée à 100 caractères. Clé vide : null (refusé). */
export function identifiantDeRegle(cle) {
  const id = String(cle ?? '').trim().replace(/\s+/g, '_').slice(0, SEUILS.longueurIdMax);
  return id && !/^__.*__$/.test(id) ? id : null; // « __x__ » est réservé par Firestore
}

/**
 * Ce que désigne un mot du dictionnaire : `[{ genre: 'article' | 'famille', id, libelle }]`, 8 au plus. `cibles` absent, vide ou mal formé = l'article `articleId` (aucune migration :
 * un mot d'aujourd'hui garde son `articleId` unique). Une cible mal formée est ignorée, jamais d'exception ; plus de 8 cibles valables : les 8 premières.
 */
export function ciblesDe(regle) {
  const valables = (Array.isArray(regle?.cibles) ? regle.cibles : [])
    .filter((c) => c && typeof c === 'object' && (c.genre === 'article' || c.genre === 'famille') && typeof c.id === 'string' && c.id)
    .slice(0, SEUILS.maxCibles)
    .map((c) => ({ genre: c.genre, id: c.id, libelle: typeof c.libelle === 'string' ? c.libelle : '' }));
  if (valables.length) return valables;
  return typeof regle?.articleId === 'string' && regle.articleId ? [{ genre: 'article', id: regle.articleId, libelle: String(regle.articleLibelle ?? '') }] : [];
}

/** Les identifiants d'articles DISTINCTS que désigne un mot (les cibles « famille » viendront avec le contexte de famille : elles sont ignorées ici). */
const articlesDesignes = (regle) => [...new Set(ciblesDe(regle).filter((c) => c.genre === 'article').map((c) => c.id))];

// ---------------------------------------------------------------- mots proches (fautes de frappe)
/** Distance de Damerau-Levenshtein (permutation de deux lettres voisines = 1). */
function distance(a, b) {
  const m = a.length;
  const n = b.length;
  const d = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 0; j <= n; j += 1) d[0][j] = j;
  for (let i = 1; i <= m; i += 1) {
    for (let j = 1; j <= n; j += 1) {
      const cout = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cout);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
    }
  }
  return d[m][n];
}

function sontProches(motCle, motLibelle) {
  if (!MOT_LETTRES.test(motCle) || !MOT_LETTRES.test(motLibelle)) return false;
  const max = motCle.length >= SEUILS.longueurFaute2 ? SEUILS.distanceMotLong : motCle.length >= SEUILS.longueurFaute1 ? SEUILS.distanceMotCourt : 0;
  return max > 0 && distance(motCle, motLibelle) <= max;
}

const arrondi2 = (n) => Math.round(n * 100) / 100;
const actif = (a) => a && a.actif !== false && a.type !== 'texte';

/** Étape 4 : `{ score, proche }` si le libellé contient tous les mots de la clé (à une faute près), sinon null. */
function scoreLibelle(motsCle, motsLibelle) {
  if (!motsCle.length || !motsLibelle.length) return null;
  let proche = false;
  for (const m of motsCle) {
    if (motsLibelle.includes(m)) continue;
    if (motsLibelle.some((l) => sontProches(m, l))) { proche = true; continue; }
    return null;
  }
  let score = Math.max(SEUILS.libellePlancher, SEUILS.libelleBase * (motsCle.length / motsLibelle.length));
  if (proche) score *= SEUILS.proche;
  return { score: arrondi2(score), proche };
}

/** Prix de vente HT unitaire d'un article (réglages : { marge, modeMarge }) ; null si impossible. Jamais d'achat ni de marge dans la sortie. */
function prixVenteHT(article, parId, reglages) {
  const r = { marge: reglages?.marge, modeMarge: reglages?.modeMarge };
  if (article.type === TYPE_OUVRAGE) return calculerOuvrage(article, parId, r).prixVenteHT;
  return prixVenteArticle(article, r);
}

// ---------------------------------------------------------------- validation humaine : suggestion écrite par le serveur
const JOUR_FORMAT = /^\d{4}-\d{2}-\d{2}$/;
/** Valeurs permises de `validePar` (la règle Firestore `vocabulaireRevise` refuse tout autre texte sur le document entier : le serveur n'en écrit jamais d'autre). */
export const VALIDE_PAR = Object.freeze(['humain', 'reponses']);

/**
 * La suggestion d'une règle `{ articleId, articleLibelle, contradictions, le }`, ou null si elle est absente, mal formée (non-objet, sans `le` valide ou sans article)
 * ou déjà traitée (`suggestionTraiteeLe` >= `le`, comparaison de jours « AAAA-MM-JJ »). Le navigateur ne peut pas supprimer `suggestion` : il marque `suggestionTraiteeLe`.
 */
export function suggestionEnAttente(regle) {
  const s = regle?.suggestion;
  if (!s || typeof s !== 'object' || Array.isArray(s)) return null;
  if (typeof s.le !== 'string' || !JOUR_FORMAT.test(s.le) || typeof s.articleId !== 'string' || !s.articleId) return null;
  const traitee = regle.suggestionTraiteeLe;
  if (typeof traitee === 'string' && JOUR_FORMAT.test(traitee) && traitee >= s.le) return null;
  return s;
}

// ---------------------------------------------------------------- étapes 3 et 4
/** Nombre d'utilisations d'un article (devis finalisés) d'après `usages` (Map articleId -> { nombre }) ; absent ou illisible = 0. */
const usageDe = (usages, articleId) => {
  const n = usages instanceof Map ? usages.get(articleId)?.nombre : undefined;
  return Number.isInteger(n) && n > 0 ? n : 0;
};
/**
 * Ordre des candidats : score, puis USAGE (le plus utilisé d'abord, seulement pour départager deux scores égaux : jamais un score ni une décision), puis libellé, puis identifiant.
 * Sans `usages`, l'ordre est exactement celui d'avant le compteur.
 */
const comparateurPar = (usages) => (a, b) => (b.score - a.score)
  || (usageDe(usages, b.articleId) - usageDe(usages, a.articleId))
  || normaliser(a.libelle).localeCompare(normaliser(b.libelle), 'fr')
  || String(a.articleId).localeCompare(String(b.articleId));

const articlesActifsParId = (articles) => new Map((articles ?? []).filter(actif).map((a) => [a.id, a]));
const POURQUOI_CONTEXTE = new Set(['contexte_unique', 'contexte_plusieurs', 'cible_au_choix']);

/** Un MARQUEUR est un mot actif, sans conflit ni suggestion en attente, qui désigne au moins DEUX articles (jamais un mot à un seul article : il garde son rôle d'avant). */
const estMarqueur = (regle) => regle?.cle && regle.statut === 'active' && regle.conflit !== true && suggestionEnAttente(regle) === null && articlesDesignes(regle).length >= 2;

/**
 * Le contexte d'une phrase : les marqueurs qu'elle contient (suite de mots contiguë et dans l'ordre de la clé ; les plus longs d'abord, puis le plus à gauche, sans chevauchement),
 * la PORTÉE (articles actifs désignés : l'union pour un marqueur, l'intersection pour plusieurs ; intersection vide = pas de contexte) et le RESTE (les mots hors marqueurs, dans n'importe quel ordre).
 * `{ marqueurs: [clé], portee: [articleId], reste: [mot], regleId, cibles }` ou null. `parId` : les articles ACTIFS par identifiant.
 */
function contexteDe(mots, regles, parId) {
  if (!mots?.length) return null;
  const trouves = [];
  for (const regle of (regles ?? []).filter(estMarqueur)) {
    const k = regle.cle.split(' ');
    for (let i = 0; i + k.length <= mots.length; i += 1) {
      if (k.every((x, j) => mots[i + j] === x)) { trouves.push({ regle, i, n: k.length }); break; }
    }
  }
  trouves.sort((a, b) => b.n - a.n || a.i - b.i || String(a.regle.cle).localeCompare(String(b.regle.cle)));
  const pris = new Set();
  const gardes = [];
  for (const t of trouves) {
    const place = Array.from({ length: t.n }, (_, j) => t.i + j);
    if (place.some((j) => pris.has(j))) continue;
    place.forEach((j) => pris.add(j));
    gardes.push(t);
  }
  if (!gardes.length) return null;
  const portees = gardes.map((t) => new Set(articlesDesignes(t.regle).filter((id) => parId.has(id))));
  const commun = [...portees[0]].filter((id) => portees.every((p) => p.has(id)));
  if (!commun.length) return null; // aucun article vivant en commun : on retombe sur le moteur d'avant
  const premier = gardes[0].regle;
  return {
    marqueurs: gardes.map((t) => t.regle.cle),
    portee: commun.sort(),
    reste: mots.filter((_, j) => !pris.has(j)),
    regleId: premier.id ?? identifiantDeRegle(premier.cle),
    cibles: gardes.flatMap((t) => ciblesDe(t.regle)),
  };
}

function chercherCandidats(cle, mots, { regles, articles, usages }) {
  const parArticle = new Map();
  const plafonnes = new Set(); // articles d'un mot validé avec suggestion en attente : jamais au-dessus de 0,50, même si leur libellé colle à la phrase
  const garder = (article, score, pourquoi, regleId = null) => {
    const ancien = parArticle.get(article.id);
    if (plafonnes.has(article.id)) { parArticle.set(article.id, { articleId: article.id, article, libelle: article.libelle ?? '', score: SEUILS.regleEnConflit, pourquoi: 'suggestion_en_attente', regleId: ancien?.regleId ?? regleId }); return; }
    if (!ancien || score > ancien.score) parArticle.set(article.id, { articleId: article.id, article, libelle: article.libelle ?? '', score, pourquoi, regleId });
  };
  const actifs = (articles ?? []).filter(actif);
  const parId = new Map(actifs.map((a) => [a.id, a]));
  for (const regle of regles ?? []) {
    // Un mot qui désigne UN article (le cas d'avant, `articleId`) se comporte comme avant ; un mot à plusieurs articles n'a pas d'article unique : il sert de marqueur (contexteDe), jamais seul.
    const cibles = ciblesDe(regle);
    const article = parId.get(cibles.length === 1 && cibles[0].genre === 'article' ? cibles[0].id : undefined);
    if (!regle?.cle || regle.statut === 'desactivee') continue;
    const regleId = regle.id ?? identifiantDeRegle(regle.cle);
    const suggestion = suggestionEnAttente(regle);
    const enConflit = regle.conflit === true || suggestion !== null;
    if (suggestion && regle.cle === cle) {
      // L'article suggéré est proposé à côté de l'article validé : la question offre les deux (le mot validé reste intact, il n'est jamais appliqué seul).
      const suggere = parId.get(suggestion.articleId);
      if (suggere) { plafonnes.add(suggere.id); garder(suggere, SEUILS.regleEnConflit, 'suggestion_en_attente', regleId); }
      if (article) plafonnes.add(article.id);
    }
    if (!article) continue;
    if (regle.cle === cle) {
      if (suggestion) garder(article, SEUILS.regleEnConflit, 'suggestion_en_attente', regleId);
      else if (enConflit) garder(article, SEUILS.regleEnConflit, 'regle_en_conflit', regleId);
      else if (regle.statut === 'a_confirmer') garder(article, SEUILS.regleAConfirmer, 'regle_a_confirmer', regleId);
      else garder(article, SEUILS.regleActive, 'regle_active', regleId);
    } else if (regle.statut === 'active' && !enConflit && mots.length) {
      const motsRegle = regle.cle.split(' ');
      if (mots.every((m) => motsRegle.includes(m))) garder(article, SEUILS.regleVisee, 'regle_partielle', regleId);
    }
  }
  // Contexte (mots à plusieurs articles) : « prise » désigne trois prises, « étanche » est cherché SEULEMENT parmi elles. Aucun score ici n'atteint `utiliser`.
  const contexte = contexteDe(mots, regles, parId);
  if (contexte) {
    const portee = contexte.portee.map((id) => parId.get(id));
    if (!contexte.reste.length) {
      for (const a of portee) garder(a, SEUILS.cibleAuChoix, 'cible_au_choix', contexte.regleId);
    } else {
      const trouves = portee.map((a) => [a, scoreLibelle(contexte.reste, motsDe(a.libelle ?? ''))]).filter(([, s]) => s);
      for (const [a] of trouves) garder(a, trouves.length === 1 ? SEUILS.contexteUnique : SEUILS.contextePlusieurs, trouves.length === 1 ? 'contexte_unique' : 'contexte_plusieurs', contexte.regleId);
    }
  }
  for (const article of actifs) {
    if (!cle) break;
    const identifiants = [article.libelle, article.code, article.reference].map((t) => (t ? motsDe(t).join(' ') : ''));
    if (identifiants.some((i) => i && i === cle)) { garder(article, SEUILS.libelleExact, identifiants[0] === cle ? 'libelle_exact' : 'code_exact'); continue; }
    const s = scoreLibelle(mots, motsDe(article.libelle ?? ''));
    if (s) garder(article, s.score, s.proche ? 'proche' : 'libelle_complet');
  }
  return [...parArticle.values()].sort(comparateurPar(usages));
}

/**
 * Le mot du métier (réglage « motOuvrage ») est un synonyme du type « ouvrage » : « ensemble salle de bain » cherche d'abord parmi les OUVRAGES « salle de bain ».
 * Les candidats de la phrase entière restent là (un article dont le libellé commence par « Ensemble » reste trouvé) ; ceux des ouvrages s'y ajoutent, au meilleur score.
 * Aucune règle du dictionnaire n'est créée pour ce mot. Sans mot dans la phrase, ou sans reste après lui : rien ne change.
 */
function chercherAvecSynonyme(cle, mots, { regles, articles, reglages, usages }) {
  const classes = chercherCandidats(cle, mots, { regles, articles, usages });
  if (!mots.length) return classes; // `reglages` absent (document pas encore écrit) : le mot par défaut s'applique, comme à l'écran
  const m = motOuvrage(reglages);
  for (const forme of [m.singulier, m.pluriel]) {
    const motsForme = motsDe(forme);
    if (!motsForme.length || motsForme.length >= mots.length) continue;
    for (let i = 0; i + motsForme.length <= mots.length; i += 1) {
      if (!motsForme.every((x, k) => mots[i + k] === x)) continue;
      const reste = [...mots.slice(0, i), ...mots.slice(i + motsForme.length)];
      const ouvrages = chercherCandidats(reste.join(' '), reste, { regles: [], articles: (articles ?? []).filter((a) => a?.type === TYPE_OUVRAGE), usages });
      const parId = new Map(classes.map((c) => [c.articleId, c]));
      for (const c of ouvrages) if (!parId.has(c.articleId) || parId.get(c.articleId).score < c.score) parId.set(c.articleId, c);
      return [...parId.values()].sort(comparateurPar(usages));
    }
  }
  return classes;
}

const guillemets = (candidats) => candidats.map((c) => `« ${c.libelle} »`);
const nombreFr = (n) => String(n).replace('.', ',');
/** `devine` : { quantite, prix } à citer dans la question quand ils sont incertains (jamais ajoutés au devis sans que l'utilisateur les ait vus). */
function formulerQuestion(decision, cle, choix, devine = {}, autres = 0) {
  if (decision === 'utiliser') return '';
  if (decision === 'proposer') {
    const l = guillemets(choix);
    const prix = devine.prix != null ? ` à ${nombreFr(devine.prix)} € l’unité` : '';
    if (l.length === 1) return `C’est bien ${devine.quantite != null ? `${nombreFr(devine.quantite)} × ` : ''}${l[0]}${prix} ?`;
    const details = [devine.quantite != null ? `quantité ${nombreFr(devine.quantite)}` : '', prix ? prix.trim() : ''].filter(Boolean).join(', ');
    const reste = autres > 0 ? `, ou ${autres > 1 ? `l’un des ${autres} autres` : 'l’autre'}` : ''; // jamais la liste entière : seulement combien il y en a
    return `Tu veux ${l.slice(0, -1).join(', ')} ou ${l[l.length - 1]}${reste}${details ? ` (${details})` : ''} ?`;
  }
  return cle
    ? `Je ne trouve pas « ${cle} » dans ton catalogue : quel article veux-tu, ou faut-il en créer un ?`
    : 'Je n’ai pas compris quel article ajouter : peux-tu préciser ?';
}

// ---------------------------------------------------------------- question de précision : UNE question qui sépare un groupe de 5 candidats ou plus (sans IA)
const JETON_AFFICHE = /[\p{L}\p{N}]+(?:[.,]\p{N}+)?/gu;
const estNombreAffiche = (j) => /^\d+(?:[.,]\d+)?$/.test(j);
const melangeChiffresLettres = (j) => /\p{N}/u.test(j) && /\p{L}/u.test(j) && !estNombreAffiche(j);
/** Un mot affiché tel que le libellé l'écrit (« étanche »), en minuscules sauf un sigle (« LED »). */
const motAffiche = (j) => (j.length > 1 && j === j.toLocaleUpperCase('fr') && /\p{L}/u.test(j) ? j : j.toLocaleLowerCase('fr'));
const joindre = (l, dernier = 'ou') => (l.length <= 1 ? (l[0] ?? '') : `${l.slice(0, -1).join(', ')} ${dernier} ${l[l.length - 1]}`);

/**
 * La question qui SÉPARE le groupe : les libellés du groupe, sans les mots communs à tous, ni ceux de la phrase du client, ni ceux du marqueur ; chaque mot restant est classé par
 * `min(couverture, n - couverture)` (plus c'est proche de la moitié du groupe, mieux il sépare). On garde les `motsPrecision` meilleurs (départagés par l'usage, puis l'ordre alphabétique),
 * à condition qu'ensemble ils couvrent au moins la moitié du groupe ; sinon null (on revient à « 3 cités + autres »). Un mot est repris tel qu'écrit dans le libellé ; les nombres gardent leur
 * virgule et se disent avec l'unité lue dans le libellé (« 16, 20 ou 32 A ») ; les jetons qui mêlent chiffres et lettres (« 2p », « dj20 ») sont exclus. Un article qui n'a plus aucun mot
 * restant est injoignable par les mots : la question ajoute « ou autre chose ».
 * `{ mots, nombreArticles, autreChose, question }` ou null.
 */
function questionPrecision(groupe, { motsPhrase = [], usages } = {}) {
  const n = groupe.length;
  const exclus = new Set(motsPhrase);
  const parMot = new Map(); // mot normalisé -> { affiche, articles: Set, unite, numerique }
  const sansMotRestant = [];
  const restantsParArticle = groupe.map((c) => {
    const bruts = String(c.libelle ?? '').match(JETON_AFFICHE) ?? [];
    const restants = new Set();
    bruts.forEach((brut, i) => {
      if (melangeChiffresLettres(brut)) return;
      const norme = motsDe(brut)[0];
      if (!norme || exclus.has(norme)) return;
      restants.add(norme);
      if (!parMot.has(norme)) {
        const suivant = bruts[i + 1];
        const unite = estNombreAffiche(brut) && suivant && /^\p{L}{1,3}²?$/u.test(suivant) ? suivant : '';
        parMot.set(norme, { affiche: estNombreAffiche(brut) ? brut : motAffiche(brut), articles: new Set(), unite, numerique: estNombreAffiche(brut), valeur: estNombreAffiche(brut) ? Number(brut.replace(',', '.')) : null });
      }
      parMot.get(norme).articles.add(c.articleId);
    });
    return restants;
  });
  // Un article n'a « aucun mot restant » une fois les mots communs à tous retirés (« Prise 16 A » à côté de « Prise double 16 A » : plus rien à dire).
  const communs = new Set([...parMot.entries()].filter(([, m]) => m.articles.size === n).map(([k]) => k));
  restantsParArticle.forEach((r, i) => { if ([...r].every((k) => communs.has(k))) sansMotRestant.push(groupe[i].articleId); });
  const usageDeMot = (m) => [...m.articles].reduce((s, id) => s + usageDe(usages, id), 0);
  const candidatsMots = [...parMot.entries()]
    .filter(([, m]) => m.articles.size < n)
    .sort(([ka, a], [kb, b]) => (Math.min(b.articles.size, n - b.articles.size) - Math.min(a.articles.size, n - a.articles.size)) || (usageDeMot(b) - usageDeMot(a)) || a.affiche.localeCompare(b.affiche, 'fr') || ka.localeCompare(kb));
  const choisis = candidatsMots.slice(0, SEUILS.motsPrecision).map(([, m]) => m);
  if (!choisis.length) return null;
  const couverts = new Set(choisis.flatMap((m) => [...m.articles]));
  if (couverts.size * 2 < n) return null;
  const nombres = choisis.every((m) => m.numerique);
  const ordre = nombres ? [...choisis].sort((a, b) => a.valeur - b.valeur) : choisis;
  const mots = ordre.map((m) => m.affiche);
  const unites = new Set(ordre.map((m) => m.unite));
  const unite = nombres && unites.size === 1 ? [...unites][0] : '';
  const autreChose = sansMotRestant.length > 0;
  const liste = autreChose ? joindre([...mots, 'autre chose']) : joindre(mots);
  return { mots, nombreArticles: n, autreChose, question: `Il y a ${n} articles qui correspondent : ${liste}${unite ? ` ${unite}` : ''} ?` };
}

/**
 * `interpreter(phrase, { regles, articles, reglages, usages })` (`usages` facultatif : Map articleId -> { nombre }, départage seulement deux scores égaux) -> `{ cle, quantite, prixVente, quantiteIncertaine, prixIncertain, candidats, decision, question }`.
 * `regles` : règles du dictionnaire ({ id?, cle, articleId, statut, conflit }) ; `articles` : le catalogue (un article désactivé n'est jamais candidat) ; `reglages` : { marge, modeMarge }.
 * Un candidat : { articleId, libelle, unite, prixVenteHT, score, pourquoi, regleId }. Au plus 5. Départage stable : score, usage (si fourni), libellé, identifiant.
 */
export function interpreter(phrase, { regles = [], articles = [], reglages, usages } = {}) {
  const analyse = analyserPhrase(phrase);
  const { mots } = analyse;
  let { cle, quantite } = analyse;
  const { prixVente } = analyse;
  let classes = chercherAvecSynonyme(cle, mots, { regles, articles, reglages, usages });
  const prixIncertain = analyse.prixSansDevise;
  let quantiteIncertaine = false;
  if (analyse.quantiteEnFin) {
    // Le nombre de fin (« disjoncteur 32 », « prise double 16 ») est peut-être un mot du libellé : on le remet dans la clé si cela donne un candidat (quantité 1).
    const motsAvecNombre = [...mots, analyse.nombreFin];
    const avecNombre = chercherAvecSynonyme(motsAvecNombre.join(' '), motsAvecNombre, { regles, articles, reglages, usages });
    if (avecNombre[0]?.score >= SEUILS.proposer) { classes = avecNombre; cle = motsAvecNombre.join(' '); quantite = 1; } else quantiteIncertaine = true;
  }
  const motsFinaux = cle === analyse.cle ? mots : [...mots, analyse.nombreFin]; // la clé finale peut avoir repris le nombre de fin
  const contexteFinal = contexteDe(motsFinaux, regles, articlesActifsParId(articles));
  const [premier, second] = classes;
  let decision = 'demander';
  if (premier && premier.score >= SEUILS.proposer) {
    // Un mot validé avec une suggestion en attente sur cette clé n'est jamais appliqué sans question, même si un troisième article colle au libellé.
    const suggestionSurCle = (regles ?? []).some((x) => x?.cle === cle && x.statut !== 'desactivee' && suggestionEnAttente(x) !== null);
    const net = !suggestionSurCle && !quantiteIncertaine && !prixIncertain && premier.score >= SEUILS.utiliser && (!second || premier.score - second.score >= SEUILS.ecartUtiliser - 1e-9);
    decision = net ? 'utiliser' : 'proposer';
  }
  const parId = articlesParId(articles);
  const candidats = classes.slice(0, SEUILS.maxCandidats).map((c) => ({
    articleId: c.articleId, libelle: c.libelle, unite: c.article.unite ?? '', prixVenteHT: prixVenteHT(c.article, parId, reglages), score: c.score, pourquoi: c.pourquoi, regleId: c.regleId,
  }));
  // Le GROUPE : les candidats au plus à `ecartUtiliser` du premier (calculé après la décision `utiliser` : un candidat net n'est jamais noyé par des candidats lointains).
  const groupe = decision === 'proposer' ? classes.filter((c) => c.score >= premier.score - SEUILS.ecartUtiliser - 1e-9 && c.score >= SEUILS.proposer) : [];
  const precision = groupe.length >= SEUILS.separationAPartir ? questionPrecision(groupe, { motsPhrase: [...mots, ...(contexteFinal?.marqueurs ?? []).flatMap((k) => k.split(' '))], usages }) : null;
  const etape = precision ? 'precision' : 'article';
  // Les articles CITÉS sont ceux d'avant (les trois premiers au moins à `proposer`) ; `autres` dit combien d'autres candidats auraient aussi pu convenir. Une question de précision ne cite aucun article.
  // Quand le premier vient du CONTEXTE (mot à plusieurs articles), seul le groupe est cité : « prise étanche » reste un oui/non malgré des libellés à 0,60 plus loin.
  const duContexte = POURQUOI_CONTEXTE.has(premier?.pourquoi);
  const citables = duContexte ? groupe : candidats.filter((c) => c.score >= SEUILS.proposer);
  const choix = precision ? [] : citables.slice(0, SEUILS.maxChoixQuestion);
  const autres = decision === 'proposer' && !precision ? Math.max(0, (duContexte ? groupe : classes.filter((c) => c.score >= SEUILS.proposer)).length - choix.length) : 0;
  const devine = { quantite: quantiteIncertaine ? quantite : null, prix: prixIncertain ? prixVente : null };
  const portee = contexteFinal && classes.some((c) => POURQUOI_CONTEXTE.has(c.pourquoi))
    ? { marqueurs: contexteFinal.marqueurs, cibles: contexteFinal.cibles, nombreArticles: contexteFinal.portee.length, reste: contexteFinal.reste }
    : null;
  return {
    cle, quantite, prixVente, quantiteIncertaine, prixIncertain, candidats, decision, etape, autres, portee,
    precision: precision ? { mots: precision.mots, nombreArticles: precision.nombreArticles, autreChose: precision.autreChose } : null,
    question: precision ? precision.question : formulerQuestion(decision, cle, choix, devine, autres),
  };
}

// ---------------------------------------------------------------- apprentissage (section 7)
/** Une clé est « trop générale » si elle est vide, d'un seul mot de 3 lettres ou moins, ou si elle correspond à plus de 5 articles actifs (étape 4). */
export function cleTropGenerale(cle, articles) {
  const mots = String(cle ?? '').split(' ').filter(Boolean);
  if (!mots.length) return true;
  if (mots.length === 1 && mots[0].length <= SEUILS.longueurMotTropCourt) return true;
  const correspondants = (articles ?? []).filter((a) => actif(a) && scoreLibelle(mots, motsDe(a.libelle ?? '')) !== null);
  return correspondants.length > SEUILS.maxArticlesParCle;
}

// Seul le FORMAT est contrôlé : « 2026-13-45 » passe (accepté, la date vient de l'appelant, jamais d'une saisie de l'utilisateur).
const JOUR = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Nouvelle version de la règle après une réponse du client. `evenement` : { type: 'confirme' } (le client confirme l'article de la règle) ou { type: 'autre', articleId, articleLibelle, immediat? }
 * (il en choisit un autre ; `immediat` : suggestion tout de suite, sans attendre la 2e contradiction). `maintenant` : le jour « AAAA-MM-JJ » (jamais lu ici).
 * Renvoie la RÈGLE mise à jour { …règle, statut, confirmations, contradictions, conflit, derniereConfirmationLe } ; l'entrée n'est pas modifiée.
 * Une confirmation ne compte que si son jour diffère de `derniereConfirmationLe` (deux « oui » le même jour = un seul). Activation : `a_confirmer` -> `active` à 2 confirmations,
 * 0 contradiction, sans conflit, et si la clé n'est pas trop générale (`articles` : le catalogue) ; elle pose `valideLe`, `validePar: 'reponses'` et `revoirLe` (+6 mois). Une règle désactivée ne change pas.
 * Garde-fou 1 : un mot validé (`active`, validé par un humain ou par les réponses) n'est JAMAIS modifié par l'apprentissage : une réponse « autre » ne change que les compteurs, et à la 2e
 * contradiction (ou tout de suite si `immediat`) une `suggestion` est posée ; `conflit` n'est plus écrit. La suggestion disparaît (`null`) après 3 jours distincts de confirmation de l'article d'origine.
 */
export function decisionApprentissage(regle, evenement, maintenant, { articles = [] } = {}) {
  if (!JOUR.test(String(maintenant ?? ''))) throw new TypeError('decisionApprentissage : `maintenant` doit être un jour « AAAA-MM-JJ ».');
  const r = {
    ...regle,
    statut: regle?.statut ?? 'a_confirmer',
    confirmations: regle?.confirmations ?? 0,
    contradictions: regle?.contradictions ?? 0,
    conflit: regle?.conflit === true,
    derniereConfirmationLe: regle?.derniereConfirmationLe ?? null,
  };
  if (r.statut === 'desactivee') return r;
  if (evenement?.type === 'autre') {
    // Une suggestion déjà traitée par l'humain (ou retirée) clôt le cycle : le compteur repart de zéro, sinon une seule contradiction suivante la recréerait.
    if (r.suggestion && typeof r.suggestion === 'object' && suggestionEnAttente(r) === null) { r.contradictions = 0; r.suggestion = null; }
    r.contradictions += 1;
    if (r.statut === 'active' && (evenement.immediat === true || r.contradictions >= SEUILS.contradictionsPourSuggerer) && evenement.articleId) {
      const ancienne = r.suggestion;
      const memeArticle = ancienne?.articleId === evenement.articleId && suggestionEnAttente(r) !== null;
      r.suggestion = {
        articleId: evenement.articleId,
        articleLibelle: String(evenement.articleLibelle ?? ''),
        contradictions: r.contradictions,
        le: memeArticle ? ancienne.le : maintenant,
        ...(memeArticle && ancienne.confirmationsDepuis ? { confirmationsDepuis: ancienne.confirmationsDepuis } : {}),
      };
    }
    return r;
  }
  if (evenement?.type !== 'confirme') return r;
  const jourNouveau = r.derniereConfirmationLe !== maintenant;
  if (jourNouveau) {
    r.confirmations += 1;
    r.derniereConfirmationLe = maintenant;
    if (r.statut === 'active' && suggestionEnAttente(r)) {
      const depuis = (Number(r.suggestion.confirmationsDepuis) || 0) + 1;
      if (depuis >= SEUILS.confirmationsPourRetirerSuggestion) { r.suggestion = null; r.contradictions = 0; } else r.suggestion = { ...r.suggestion, confirmationsDepuis: depuis };
    }
  }
  if (r.statut === 'a_confirmer' && r.confirmations >= SEUILS.confirmationsPourActiver && r.contradictions === 0 && !r.conflit && !cleTropGenerale(r.cle, articles)) {
    r.statut = 'active';
    r.valideLe = maintenant;
    r.validePar = 'reponses';
    r.revoirLe = ajouterMois(maintenant, SEUILS.moisAvantRevision);
  }
  return r;
}
