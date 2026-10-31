// Écran « Vocabulaire » du module Devis (docs/proposition-dictionnaire-vocabulaire.md, section 8) : la logique PURE (aucun accès à Firebase ni au navigateur).
// Plans d'écriture (créer un mot, changer son statut, son article, sa note), filtres, tri, phrase d'état et export CSV. L'écran dessine, donnees.js exécute les plans.
// Le navigateur n'écrit JAMAIS les compteurs (confirmations, contradictions), l'origine, l'expression ni les exemples d'un mot existant, et ne supprime jamais : un mot se désactive.
// Les règles Firestore imposent la même liste (bloc `devis_vocabulaire`, PR 4 puis PR 424) : la validation humaine (valideLe, validePar, revoirLe, suggestionTraiteeLe) s'y ajoute ;
// `suggestion` n'y est JAMAIS : seul le serveur l'écrit, le navigateur la marque « traitée » avec `suggestionTraiteeLe` (test E11).
import { ecritureCreer, ecritureModifier, MARQUES_CREATION, MARQUES_MODIFICATION, normaliser, nettoyerEspaces, ajouterMois } from '../crm/logique.js';
import { cleDeExpression, identifiantDeRegle, cleTropGenerale, suggestionEnAttente, ciblesDe, SEUILS } from './vocabulaire.js';

export const COLLECTION_VOCABULAIRE = 'devis_vocabulaire';
/** Nom de l'action dans le Journal des modifications. */
export const OUTIL_VOCABULAIRE = 'vocabulaire';
/** Les seuls champs qu'un navigateur change sur un mot qui existe (avec les marques de modification). */
export const CHAMPS_MODIFIABLES = Object.freeze(['statut', 'articleId', 'articleLibelle', 'note', 'conflit', 'valideLe', 'validePar', 'revoirLe', 'suggestionTraiteeLe', 'cibles']);
export const MAX_EXPRESSION = 120;
export const MAX_NOTE = 300;

export const STATUTS = Object.freeze([
  { id: 'active', libelle: 'Actif', couleur: '#6ddba0' },
  { id: 'a_confirmer', libelle: 'À confirmer', couleur: '#f0b429' },
  { id: 'desactivee', libelle: 'Désactivé', couleur: '#8d8993' },
]);
export const ORIGINES = Object.freeze([
  { id: 'manuelle', libelle: 'Ajouté ici' },
  { id: 'apprise_question', libelle: 'Appris (question)' },
  { id: 'apprise_correction', libelle: 'Appris (correction)' },
]);
export const libelleStatut = (statut) => STATUTS.find((s) => s.id === statut)?.libelle ?? String(statut ?? '');
export const libelleOrigine = (origine) => ORIGINES.find((o) => o.id === origine)?.libelle ?? String(origine ?? '');

export const MESSAGE_NON_ENREGISTRABLE = 'Cette expression ne peut pas être enregistrée : écris au moins un mot.';
export const MESSAGE_ARTICLE_INTROUVABLE = 'Cet article n’existe plus ou est désactivé : choisis un article du catalogue.';
export const MESSAGE_LISTE_INDISPONIBLE = 'La liste des mots appris n’est pas à jour : rien n’a été enregistré. Vérifie ta connexion, appuie sur « Réessayer », puis recommence.';
export const MESSAGE_MOT_INTROUVABLE = 'Ce mot est introuvable : recharge la page.';

/** Un article qu'on peut viser : actif, et pas une ligne de texte libre. */
export const articleChoisissable = (a) => Boolean(a) && a.actif !== false && a.type !== 'texte';

export const MAX_CIBLES = SEUILS.maxCibles;
export const MESSAGE_TROP_DE_CIBLES = `Un mot désigne ${MAX_CIBLES} articles au plus : retires-en un d’abord.`;
export const MESSAGE_CIBLES_INDISPONIBLES = 'Aucun des articles de ce mot n’est disponible : change d’abord ce qu’il désigne.';

/**
 * Ce que désigne un mot : `{ articles: [{ id, libelle, vivant }], nombre, multiple, mort }`. `articles` : le catalogue. Un mot sans `cibles` désigne son `articleId` (le cas d'avant) ;
 * `vivant` = l'article existe, est actif et n'est pas un texte libre ; `mort` = AUCUN article vivant (les familles viendront plus tard : ignorées ici).
 */
export function designation(regle, articles = []) {
  const liste = ciblesDe(regle).filter((c) => c.genre === 'article').map((c) => {
    const a = (articles ?? []).find((x) => x.id === c.id);
    return { id: c.id, libelle: a?.libelle ?? c.libelle ?? '', vivant: articleChoisissable(a) };
  });
  return { articles: liste, nombre: liste.length, multiple: liste.length > 1, mort: !liste.some((c) => c.vivant) };
}

const nombre = (n) => (Number.isFinite(n) ? n : 0);
/** Un mot en attente d'une décision de Jérôme : deux articles pour la même expression, ou une suggestion du serveur pas encore traitée (jamais pour un mot désactivé). */
export const estATrancher = (regle) => (regle?.conflit === true || suggestionEnAttente(regle) !== null) && regle?.statut !== 'desactivee';

export const VALIDATIONS = Object.freeze({
  humain: { id: 'humain', libelle: 'Validé par toi' },
  reponses: { id: 'reponses', libelle: 'Validé par tes réponses' },
  a_valider: { id: 'a_valider', libelle: 'À valider' },
});
/**
 * Qui a validé ce mot : `{ id, libelle }`, ou null pour un mot désactivé. Un mot « à confirmer » est « à valider » (même s'il garde un `validePar` d'avant son réexamen).
 * Un mot actif est « validé par toi » s'il a une date de validation et `validePar: 'humain'` ; sinon « validé par tes réponses » (mot appris, ou ancien mot sans champ de validation).
 */
export function validationDe(regle) {
  if (regle?.statut === 'a_confirmer') return VALIDATIONS.a_valider;
  if (regle?.statut !== 'active') return null;
  if (regle.origine === 'manuelle' && !regle.validePar) return VALIDATIONS.humain; // ancien mot ajouté à la main, avant la validation humaine
  return regle.validePar === 'humain' && regle.valideLe ? VALIDATIONS.humain : VALIDATIONS.reponses;
}

/** Une décision de Jérôme à l'écran (activer un mot, choisir son article) le valide : valideLe, validePar 'humain', revoirLe +6 mois. Un mot déjà validé par lui garde sa date ; sans jour du contexte, rien. */
function validerParHumain(courant, aujourdhui) {
  if (!aujourdhui || (courant.validePar === 'humain' && courant.valideLe)) return {};
  return { valideLe: aujourdhui, validePar: 'humain', revoirLe: ajouterMois(aujourdhui, 6) };
}

/** Le jour à écrire dans `suggestionTraiteeLe` quand une suggestion attend (jamais avant son jour `le`, sinon elle resterait en attente) ; {} sinon. */
function traiterSuggestion(courant, aujourdhui) {
  const s = suggestionEnAttente(courant);
  if (!s || !aujourdhui) return {};
  return { suggestionTraiteeLe: aujourdhui > s.le ? aujourdhui : s.le };
}

// ---------------------------------------------------------------- plans d'écriture

/**
 * Création manuelle : `{ erreurs, id, cle, existante, ecritures }`. L'identifiant du document est celui du moteur (la clé normalisée, espaces remplacés par « _ ») ;
 * « creer » écrase en silence un identifiant déjà présent : si le mot existe déjà (même identifiant, donc aussi une clé longue tronquée de la même façon), rien n'est écrit,
 * `existante` donne le mot à modifier. `regles` : les mots déjà lus ; `articles` : le catalogue.
 */
export function planCreerMot(saisie, ctx, { regles = [], articles = [] } = {}) {
  const expression = nettoyerEspaces(String(saisie?.expression ?? '')).slice(0, MAX_EXPRESSION);
  const cle = cleDeExpression(expression);
  const id = identifiantDeRegle(cle);
  const erreurs = {};
  if (!expression || !id) erreurs.expression = MESSAGE_NON_ENREGISTRABLE;
  // Un article (`articleId`, comme avant) ou plusieurs au choix (`articleIds`, 8 au plus) : un seul = `articleId` ; plusieurs = `cibles`, SANS article (les règles Firestore le garantissent).
  const demandes = [...new Set(Array.isArray(saisie?.articleIds) ? saisie.articleIds : (saisie?.articleId ? [saisie.articleId] : []))];
  const choisis = demandes.map((x) => (articles ?? []).find((a) => a.id === x));
  if (demandes.length > MAX_CIBLES) erreurs.articleId = MESSAGE_TROP_DE_CIBLES;
  else if (!choisis.length || !choisis.every(articleChoisissable)) erreurs.articleId = MESSAGE_ARTICLE_INTROUVABLE;
  const existante = id ? ((regles ?? []).find((r) => (r.id ?? identifiantDeRegle(r.cle)) === id) ?? null) : null;
  if (existante && !erreurs.expression) erreurs.expression = 'Ce mot existe déjà : modifie-le plutôt que de le doubler.';
  if (Object.keys(erreurs).length) return { erreurs, id, cle, existante, ecritures: [] };
  const donnees = {
    cle, expression, ...designe(choisis), statut: 'active', origine: 'manuelle',
    confirmations: 0, contradictions: 0, conflit: false, exemples: [],
  };
  // Un mot ajouté à la main est validé tout de suite par Jérôme ; à revoir dans 6 mois. Sans jour du contexte, aucun champ de validation (jamais de `new Date` ici).
  if (ctx?.aujourdhui) Object.assign(donnees, { valideLe: ctx.aujourdhui, validePar: 'humain', revoirLe: ajouterMois(ctx.aujourdhui, 6) });
  return { erreurs: {}, id, cle, existante: null, ecritures: [ecritureCreer(COLLECTION_VOCABULAIRE, id, donnees, MARQUES_CREATION)] };
}

/** Les champs qui disent ce que désigne un mot : un article = `articleId` (sans `cibles`) ; plusieurs = `cibles` et AUCUN article. Libellés copiés (120 caractères au plus, comme les règles). */
function designe(articles) {
  if (articles.length === 1) return { articleId: articles[0].id, articleLibelle: articles[0].libelle ?? '' };
  return { articleId: '', articleLibelle: '', cibles: articles.map((a) => ({ genre: 'article', id: a.id, libelle: String(a.libelle ?? '').slice(0, 120) })) };
}

const mot = (id, regles) => (regles ?? []).find((r) => r.id === id) ?? null;
const sansEcriture = (erreurs) => ({ erreurs, patch: {}, ecritures: [] });
function planPatch(id, patch) {
  const net = Object.fromEntries(Object.entries(patch).filter(([k]) => CHAMPS_MODIFIABLES.includes(k)));
  return { erreurs: {}, patch: net, ecritures: Object.keys(net).length ? [ecritureModifier(COLLECTION_VOCABULAIRE, id, net, MARQUES_MODIFICATION)] : [] };
}

/**
 * Activer (`active`) ou désactiver (`desactivee`) un mot : `{ erreurs, patch, ecritures }`. Activer un mot « à confirmer » ou « trop général » le FORCE (le moteur ne revérifie pas à l'usage) ;
 * activer un mot en conflit lève le conflit (Jérôme a tranché). Un mot dont l'article est désactivé ne s'active pas : il faut d'abord changer l'article.
 * `restaurer: true` (« Annuler » après une désactivation) remet l'état d'avant, `a_confirmer` compris, sans revérifier l'article.
 */
export function planChangerStatut(id, statut, { regles = [], articles = [], restaurer = false, aujourdhui = '' } = {}) {
  const courant = mot(id, regles);
  if (!courant) return sansEcriture({ general: MESSAGE_MOT_INTROUVABLE });
  if (statut !== 'active' && statut !== 'desactivee' && !(restaurer && statut === 'a_confirmer')) return sansEcriture({ general: 'Statut inconnu.' });
  if (statut === 'active' && !restaurer) {
    const d = designation(courant, articles);
    if (d.mort) return sansEcriture({ general: d.multiple ? MESSAGE_CIBLES_INDISPONIBLES : 'L’article de ce mot est désactivé : change d’abord l’article.' });
  }
  const patch = {};
  if (courant.statut !== statut) patch.statut = statut;
  if (statut === 'active' && !restaurer) {
    if (courant.conflit === true) patch.conflit = false;
    // Activer, ou « Garder cet article » : Jérôme décide, le mot est validé par lui. Un mot désactivé qui se réactive n'a pas montré sa suggestion : elle reste en attente.
    if (courant.statut !== statut || estATrancher(courant)) Object.assign(patch, validerParHumain(courant, aujourdhui)); // le même statut sans rien à trancher n'écrit rien
    Object.assign(patch, courant.statut === 'desactivee' ? {} : traiterSuggestion(courant, aujourdhui));
  }
  return planPatch(id, patch);
}

/**
 * Changer ce que désigne un mot : `{ erreurs, patch, ecritures }`. `articleIds` : 1 à 8 articles. Un seul = `articleId` (et `cibles` vidée si le mot en avait : jamais un mot à double sens) ;
 * plusieurs = `cibles` et `articleId` vide. Choisir ce que désigne un mot en conflit le tranche (conflit levé). Les mêmes articles ne changent rien (sauf un libellé renommé depuis).
 */
export function planChangerCibles(id, articleIds, { regles = [], articles = [], aujourdhui = '' } = {}) {
  const courant = mot(id, regles);
  if (!courant) return sansEcriture({ general: MESSAGE_MOT_INTROUVABLE });
  const demandes = [...new Set(articleIds ?? [])];
  if (demandes.length > MAX_CIBLES) return sansEcriture({ articleId: MESSAGE_TROP_DE_CIBLES });
  const choisis = demandes.map((x) => (articles ?? []).find((a) => a.id === x));
  if (!choisis.length || !choisis.every(articleChoisissable)) return sansEcriture({ articleId: MESSAGE_ARTICLE_INTROUVABLE });
  const patch = {};
  const voulu = designe(choisis);
  const avaitDesCibles = Array.isArray(courant.cibles) && courant.cibles.length > 0;
  if ((courant.articleId ?? '') !== voulu.articleId) patch.articleId = voulu.articleId;
  if ((courant.articleLibelle ?? '') !== voulu.articleLibelle) patch.articleLibelle = voulu.articleLibelle; // le libellé d'un article renommé depuis : la copie suit
  const memesCibles = (a, b) => a.length === b.length && a.every((c, i) => c?.genre === b[i].genre && c?.id === b[i].id && c?.libelle === b[i].libelle);
  if (voulu.cibles) { if (!memesCibles(Array.isArray(courant.cibles) ? courant.cibles : [], voulu.cibles)) patch.cibles = voulu.cibles; } else if (avaitDesCibles) patch.cibles = [];
  if (courant.conflit === true) patch.conflit = false;
  Object.assign(patch, validerParHumain(courant, aujourdhui), courant.statut === 'desactivee' ? {} : traiterSuggestion(courant, aujourdhui));
  return planPatch(id, patch);
}

/** Changer l'article d'un mot (un seul) : `{ erreurs, patch, ecritures }`. Même plan que `planChangerCibles` avec un seul article. */
export const planChangerArticle = (id, articleId, options) => planChangerCibles(id, [articleId], options);

/** La note d'un mot (≤ 300 caractères, vide = effacée) : `{ erreurs, patch, ecritures }`. */
export function planNote(id, note, { regles = [] } = {}) {
  const courant = mot(id, regles);
  if (!courant) return sansEcriture({ general: MESSAGE_MOT_INTROUVABLE });
  const texte = String(note ?? '').replace(/\r\n?/g, '\n').trim();
  if (texte.length > MAX_NOTE) return sansEcriture({ note: `La note est trop longue (${MAX_NOTE} caractères au plus).` });
  return planPatch(id, texte === String(courant.note ?? '') ? {} : { note: texte });
}

// ---------------------------------------------------------------- affichage : filtres, tri, phrase d'état
const pluriel = (n, un, plusieurs) => `${n} ${n > 1 ? plusieurs : un}`;

/** « 42 mots appris actifs · 7 à confirmer · 2 à trancher » (les parties à zéro sont omises, sauf si tout est à zéro). */
export function phraseEtat(regles) {
  const liste = regles ?? [];
  const actifs = liste.filter((r) => r.statut === 'active' && !estATrancher(r)).length;
  const aConfirmer = liste.filter((r) => r.statut === 'a_confirmer' && !estATrancher(r)).length;
  const aTrancher = liste.filter(estATrancher).length;
  const parties = [pluriel(actifs, 'mot appris actif', 'mots appris actifs')];
  if (aConfirmer) parties.push(`${aConfirmer} à confirmer`);
  if (aTrancher) parties.push(`${aTrancher} à trancher`);
  return parties.join(' · ');
}

export const CRITERES_VOCABULAIRE_VIDES = Object.freeze({ statuts: [], origines: [], aTrancher: false, tropGeneral: false });

/** Nombre de cases cochées (pastille du bouton « Filtres »). */
export const nombreFiltres = (c) => (c.statuts?.length ?? 0) + (c.origines?.length ?? 0) + (c.aTrancher ? 1 : 0) + (c.tropGeneral ? 1 : 0);

/**
 * Mémorise `cleTropGenerale` (coûteux : il parcourt le catalogue) pour une version donnée du catalogue ; la mémoire est jetée quand le catalogue change.
 * Renvoie une fonction `(regle) => booléen`.
 */
export function tropGeneralMemoire(articles) {
  const memoire = new Map();
  return (regle) => {
    const cle = regle?.cle ?? '';
    if (!memoire.has(cle)) memoire.set(cle, cleTropGenerale(cle, articles));
    return memoire.get(cle);
  };
}

/**
 * Filtre : `criteres` = { statuts, origines, aTrancher, tropGeneral } + `recherche` (mots cherchés sans accents ni casse dans l'expression, la clé, l'article, la note et les exemples).
 * Les cases d'un même groupe se combinent par « ou », les groupes par « et ». `tropGeneral` : fonction `(regle) => booléen` (voir tropGeneralMemoire).
 */
export function filtrerMots(regles, criteres = {}, recherche = '', tropGeneral = () => false) {
  const mots = normaliser(recherche).split(/\s+/).filter(Boolean);
  return (regles ?? []).filter((r) => {
    if (criteres.statuts?.length && !criteres.statuts.includes(r.statut)) return false;
    if (criteres.origines?.length && !criteres.origines.includes(r.origine)) return false;
    if (criteres.aTrancher && !estATrancher(r)) return false;
    if (criteres.tropGeneral && !tropGeneral(r)) return false;
    if (!mots.length) return true;
    const cible = normaliser([r.expression, r.cle, r.articleLibelle, ...ciblesDe(r).map((c) => c.libelle), r.note, ...(r.exemples ?? [])].join(' '));
    return mots.every((m) => cible.includes(m));
  });
}

export const CRITERES_TRI = Object.freeze([
  { id: 'utilisation', libelle: 'Dernière utilisation', sens: 'desc' },
  { id: 'a_trancher', libelle: 'À trancher d’abord', sens: 'asc' },
  { id: 'expression', libelle: 'Expression', sens: 'asc' },
]);
export const TRI_PAR_DEFAUT = Object.freeze({ critere: 'utilisation', sens: 'desc' });

/** Rang « à trancher » : conflits, puis mots à confirmer, puis actifs, puis désactivés. */
const rang = (r) => (estATrancher(r) ? 0 : r.statut === 'a_confirmer' ? 1 : r.statut === 'active' ? 2 : 3);
const parExpression = (a, b) => normaliser(a.expression ?? a.cle ?? '').localeCompare(normaliser(b.expression ?? b.cle ?? ''), 'fr') || String(a.id).localeCompare(String(b.id));
// `derniereUtilisationLe` est un TEXTE « AAAA-MM-JJ » (absent sur un mot ajouté à la main) : « jamais utilisé » est toujours en dernier, quel que soit le sens.
const jour = (r) => (/^\d{4}-\d{2}-\d{2}/.test(String(r.derniereUtilisationLe ?? '')) ? String(r.derniereUtilisationLe).slice(0, 10) : '');

/** Tri sans modifier la liste donnée. `sens` : 'asc' ou 'desc' ; le critère « utilisation » en 'desc' = le plus récent d'abord. */
export function trierMots(regles, { critere = TRI_PAR_DEFAUT.critere, sens = TRI_PAR_DEFAUT.sens } = {}) {
  const f = sens === 'desc' ? -1 : 1;
  const liste = [...(regles ?? [])];
  if (critere === 'expression') return liste.sort((a, b) => f * parExpression(a, b));
  if (critere === 'a_trancher') {
    return liste.sort((a, b) => (f * (rang(a) - rang(b))) || (jour(b).localeCompare(jour(a))) || parExpression(a, b));
  }
  return liste.sort((a, b) => {
    const ja = jour(a);
    const jb = jour(b);
    if (!ja && !jb) return parExpression(a, b);
    if (!ja) return 1;
    if (!jb) return -1;
    return (f * ja.localeCompare(jb)) || parExpression(a, b);
  });
}

/** « 28/10/2026 », ou « Jamais » quand le mot n'a jamais servi (ajouté à la main, ou pas encore utilisé). */
export function jourAffiche(regle) {
  const j = jour(regle);
  if (!j) return 'Jamais';
  const [a, m, d] = j.split('-');
  return `${d}/${m}/${a}`;
}

/** « 3 confirmations », « 1 confirmation · 1 contradiction ». */
export function compteursAffiches(regle) {
  const c = nombre(regle?.confirmations);
  const x = nombre(regle?.contradictions);
  return `${pluriel(c, 'confirmation', 'confirmations')}${x ? ` · ${pluriel(x, 'contradiction', 'contradictions')}` : ''}`;
}

// ---------------------------------------------------------------- export CSV
export const ENTETE_CSV = Object.freeze(['Expression', 'Article', 'Statut', 'Origine', 'Confirmations', 'Dernière utilisation']);

/**
 * Une cellule CSV : entourée de guillemets (doublés à l'intérieur) si elle contient une virgule, un guillemet ou un retour à la ligne.
 * Une expression vient d'une phrase de client : si elle commence par = + - @ (tableur : formule), une apostrophe est ajoutée devant pour qu'elle reste du texte.
 */
export function cellule(valeur) {
  let t = String(valeur ?? '');
  if (/^[=+\-@\t\r]/.test(t)) t = `'${t}`;
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

/** « Prise simple / Prise double » : les articles désignés (un mot à plusieurs articles), sinon le libellé copié de son article. */
const libelleDesigne = (r) => {
  const liste = ciblesDe(r).filter((c) => c.genre === 'article').map((c) => c.libelle).filter(Boolean);
  return liste.length ? liste.join(' / ') : (r.articleLibelle ?? '');
};

/** Le fichier CSV complet : séparateur virgule, fins de ligne \r\n, BOM UTF-8 en tête (Excel et Numbers lisent alors les accents). */
export function construireCsv(regles) {
  const lignes = [ENTETE_CSV, ...trierMots(regles, { critere: 'expression', sens: 'asc' }).map((r) => [
    r.expression ?? r.cle ?? '', libelleDesigne(r), libelleStatut(r.statut), libelleOrigine(r.origine), nombre(r.confirmations), jour(r),
  ])];
  return `\uFEFF${lignes.map((l) => l.map(cellule).join(',')).join('\r\n')}\r\n`;
}
