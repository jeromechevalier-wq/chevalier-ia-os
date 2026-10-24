// Bordereau du module Devis (voir docs/cadrage-devis.md, §3 et §8) : les articles (table `devis_articles`) et les réglages du module
// (document `devis_parametres/reglages`). Logique PURE : aucun accès à Firebase, au réseau ni au navigateur, testée avec node --test.
// L'écran, le serveur MCP (outils `lister_articles`, `creer_article`…) et les tests exécutent ces mêmes plans : une règle ne s'écrit qu'ici.
//
// Unités : le prix d'achat est en EUROS (nombre, 2 décimales au plus). Un article ne se supprime jamais : il se désactive.
//
// Décisions prises seul (nuit du 24/10/2026) :
// - Les réglages du module vivent dans la collection `devis_parametres` (document `reglages`), comme le cadrage (§4) le prévoit ; ils sont
//   écrits par l'écran sans passer par le journal des modifications (comme les paramètres du CRM).
// - Marge par défaut : 20 %. Taux de TVA proposés : 20, 10 et 5,5 (au moins un), défaut 20.
// - Le code d'un article est facultatif ; l'unicité se compare sans accents ni casse, parmi les articles ACTIFS seulement.
//   Réactiver un article dont le code est pris par un article actif est refusé avec un message qui dit quoi faire.
// - Plus de 2 décimales dans un prix : refusé (message) plutôt qu'arrondi en silence.
import {
  ecritureCreer, ecritureModifier, MARQUES_CREATION, MARQUES_MODIFICATION, normaliser, normaliserNom, nettoyerEspaces,
} from '../crm/logique.js';
import {
  MODES_MARGE, REGIMES_TVA, TAUX_TVA_DEFAUT, DUREE_VALIDITE_DEFAUT, coefficientDeMarge,
} from './logique.js';
import { TYPE_OUVRAGE, erreursOuvrage, articlesParId, calculerOuvrage } from './ouvrages.js';

// ---------------------------------------------------------------- constantes
export const COLLECTION_ARTICLES = 'devis_articles';
export const COLLECTION_PARAMETRES = 'devis_parametres';
export const ID_REGLAGES = 'reglages';
/** Unités proposées dans la liste (le texte libre reste permis). */
export const UNITES_PROPOSEES = ['u', 'm', 'm²', 'm³', 'ml', 'h', 'jour', 'km', 'forfait', 'kg'];
export const UNITE_DEFAUT = 'u';
/** Noms que l'utilisateur peut donner au bordereau (réglage du module). */
export const NOMS_BORDEREAU = ['Bordereau de prix unitaires', 'Grille tarifaire', 'Catalogue'];
export const NOM_BORDEREAU_DEFAUT = NOMS_BORDEREAU[0];
export const MARGE_DEFAUT = 20;
export const TAUX_TVA_DEFAUT_REGLAGE = TAUX_TVA_DEFAUT[0];
export const LIMITES = { libelle: 200, code: 40, unite: 20, prixMax: 10_000_000, mention: 500, jours: 3650 };
export const MESSAGE_DESACTIVER = 'Un article ne se supprime jamais : il se désactive. Les devis déjà faits ne changent pas, et tu pourras le réactiver quand tu veux.';
/** Types d'article (facultatif : un article sans type est « non classé »). Un ouvrage est composé d'autres articles (voir ouvrages.js). */
export const TYPES_ARTICLE = [
  { id: 'fourniture', libelle: 'Fourniture' },
  { id: 'main_oeuvre', libelle: 'Main d’œuvre' },
  { id: TYPE_OUVRAGE, libelle: 'Ouvrage' },
  { id: 'sous_traitance', libelle: 'Sous-traitance' },
  { id: 'materiel', libelle: 'Matériel' },
  { id: 'divers', libelle: 'Divers' },
];
export const libelleType = (type) => TYPES_ARTICLE.find((t) => t.id === type)?.libelle ?? '';
export const FILTRES_ACTIF = [
  { id: 'actifs', libelle: 'Actifs' },
  { id: 'desactives', libelle: 'Désactivés' },
  { id: 'tous', libelle: 'Tous' },
];

const estNombre = (v) => typeof v === 'number' && Number.isFinite(v);
const texte = (v) => nettoyerEspaces(v);

// ---------------------------------------------------------------- nombres saisis par l'humain
/**
 * Nombre saisi (virgule française acceptée, espaces et « € » ignorés) -> nombre, ou null si ce n'est pas un nombre.
 * Une chaîne vide donne null. Pas de séparateur de milliers (« 1 234,50 » marche : les espaces sont retirés).
 */
export function lireNombre(saisie) {
  if (estNombre(saisie)) return saisie;
  if (typeof saisie !== 'string') return null;
  const t = saisie.replace(/[\s  ]/g, '').replace(/(€|eur|euros?)$/i, '').replace('%', '');
  if (!/^[-+]?\d+([.,]\d+)?$/.test(t)) return null;
  const n = Number(t.replace(',', '.'));
  return Number.isFinite(n) ? n : null;
}

/** Prix d'achat en euros, ou `{ erreur }`. Positif ou nul, 2 décimales au plus. */
export function lirePrixAchat(saisie) {
  const n = lireNombre(saisie);
  if (n === null) return { prix: null, erreur: 'Le prix d’achat doit être un nombre en euros (exemple : 12,50).' };
  if (n < 0) return { prix: null, erreur: 'Le prix d’achat ne peut pas être négatif.' };
  if (n > LIMITES.prixMax) return { prix: null, erreur: 'Ce prix d’achat est trop grand : vérifie le nombre de zéros.' };
  if (Math.abs(Math.round(n * 100) - n * 100) > 1e-6) return { prix: null, erreur: 'Le prix d’achat s’écrit avec 2 décimales au plus (exemple : 12,50).' };
  return { prix: Math.round(n * 100) / 100, erreur: null };
}

/** Affichage français d'un prix : 12,5 -> « 12,50 € ». */
export const formaterPrix = (prix) => (estNombre(prix) ? `${prix.toFixed(2).replace('.', ',')} €` : '');
/** Valeur d'un champ de saisie : 12,5 -> « 12,50 ». */
export const prixPourSaisie = (prix) => (estNombre(prix) ? prix.toFixed(2).replace('.', ',') : '');
/** Taux de TVA affiché : 5.5 -> « 5,5 % ». */
export const formaterTaux = (taux) => (estNombre(taux) ? `${String(taux).replace('.', ',')} %` : '');

// ---------------------------------------------------------------- articles
const cleCode = (code) => normaliserNom(code);

/** Article actif qui utilise ce code (hors `sauf` : l'article qu'on est en train de modifier), ou null. */
export function articleDuCode(articles, code, sauf = null) {
  const cle = cleCode(code);
  if (!cle) return null;
  return (articles ?? []).find((a) => a.id !== sauf && a.actif !== false && cleCode(a.code) === cle) ?? null;
}

/** Valeurs d'un article, nettoyées : `{ valeurs, erreurs }` (erreurs : clé du champ -> message qui dit quoi faire). `courant` : l'article modifié (ses champs complètent la saisie). */
export function validerArticle(saisie, { articles = [], courant = null } = {}) {
  const erreurs = {};
  const base = { ...(courant ?? {}), ...saisie };
  const libelle = texte(base.libelle);
  if (!libelle) erreurs.libelle = 'Le libellé est obligatoire : écris le nom de l’article (exemple : Carrelage 60 x 60).';
  else if (libelle.length > LIMITES.libelle) erreurs.libelle = `Le libellé est trop long (${LIMITES.libelle} caractères au plus).`;
  const unite = texte(base.unite) || (courant ? '' : UNITE_DEFAUT);
  if (!unite) erreurs.unite = 'Choisis une unité (exemple : m², h, forfait).';
  else if (unite.length > LIMITES.unite) erreurs.unite = `L’unité est trop longue (${LIMITES.unite} caractères au plus).`;
  // Type (facultatif) : absent = non classé.
  let type = null;
  if (base.type !== undefined && base.type !== null && base.type !== '') {
    if (TYPES_ARTICLE.some((t) => t.id === base.type)) type = base.type;
    else erreurs.type = `Le type « ${String(base.type)} » n’existe pas. Choisis parmi : ${TYPES_ARTICLE.map((t) => t.libelle).join(', ')}.`;
  }
  const estOuvrage = type === TYPE_OUVRAGE;
  const brutPrix = base.prixAchat;
  let prixAchat = null;
  const prixVide = brutPrix === undefined || brutPrix === null || (typeof brutPrix === 'string' && !brutPrix.trim());
  if (estOuvrage) {
    // Un ouvrage n'a pas de prix d'achat propre : il se calcule à partir de ses composants.
    if (!prixVide && 'prixAchat' in saisie) erreurs.prixAchat = 'Un ouvrage n’a pas de prix d’achat : il se calcule à partir de ses composants.';
  } else if (prixVide) erreurs.prixAchat = 'Indique le prix d’achat en euros (exemple : 12,50).';
  else {
    const r = lirePrixAchat(brutPrix);
    if (r.erreur) erreurs.prixAchat = r.erreur;
    else prixAchat = r.prix;
  }
  // Composants et prix de vente forcé : seulement pour un ouvrage.
  let composants = null;
  let prixVenteForce = null;
  const aDesComposants = Array.isArray(base.composants) && base.composants.length > 0;
  const aUnForce = base.prixVenteForce !== undefined && base.prixVenteForce !== null && !(typeof base.prixVenteForce === 'string' && !base.prixVenteForce.trim());
  if (estOuvrage) {
    if (aUnForce) {
      const f = lireNombre(base.prixVenteForce);
      if (f === null) erreurs.prixVenteForce = 'Le prix de vente forcé doit être un nombre en euros (exemple : 12,50).';
      else if (f < 0) erreurs.prixVenteForce = 'Le prix de vente forcé ne peut pas être négatif.';
      else if (f > LIMITES.prixMax) erreurs.prixVenteForce = 'Ce prix est trop grand : vérifie le nombre de zéros.';
      else if (Math.abs(Math.round(f * 100) - f * 100) > 1e-6) erreurs.prixVenteForce = 'Le prix de vente forcé s’écrit avec 2 décimales au plus (exemple : 12,50).';
      else prixVenteForce = Math.round(f * 100) / 100;
    }
    const problemes = erreursOuvrage({ id: courant?.id, composants: base.composants, prixVenteForce: prixVenteForce ?? undefined }, articlesParId(articles));
    if (problemes.length) erreurs.composants = problemes.join(' ');
    else composants = base.composants.map((c) => ({ articleId: c.articleId, quantite: c.quantite }));
  } else {
    if (aDesComposants) erreurs.composants = 'Seul un article de type « Ouvrage » peut avoir des composants.';
    if (aUnForce) erreurs.prixVenteForce = 'Seul un ouvrage peut avoir un prix de vente forcé.';
  }
  // Marge propre à l'article (facultative, en %, dans le mode de marge des réglages) : sinon la marge des réglages s'applique.
  let marge = null;
  if (base.marge !== undefined && base.marge !== null && !(typeof base.marge === 'string' && !base.marge.trim())) {
    const m = lireNombre(base.marge);
    if (m === null || m < 0 || m > 1000) erreurs.marge = 'La marge de l’article est un pourcentage entre 0 et 1000 (exemple : 25), ou vide pour garder la marge des réglages.';
    else marge = m;
  }
  const code = texte(base.code);
  if (code.length > LIMITES.code) erreurs.code = `Le code est trop long (${LIMITES.code} caractères au plus).`;
  else if (code) {
    const pris = articleDuCode(articles, code, courant?.id ?? null);
    if (pris && base.actif !== false) erreurs.code = `Le code « ${code} » est déjà utilisé par l’article actif « ${pris.libelle} ». Choisis un autre code, ou désactive d’abord cet article.`;
  }
  let tauxTva = null;
  if (base.tauxTva !== undefined && base.tauxTva !== null && !(typeof base.tauxTva === 'string' && !base.tauxTva.trim())) {
    const t = lireNombre(base.tauxTva);
    if (t === null || t < 0 || t > 100) erreurs.tauxTva = 'Le taux de TVA doit être un nombre entre 0 et 100 (exemple : 20).';
    else tauxTva = t;
  }
  return { valeurs: { libelle, unite, prixAchat, code, tauxTva, type, composants, prixVenteForce, marge }, erreurs };
}

/** Document d'un article neuf. L'id, la date et l'auteur viennent de `ctx` (déterministe). */
export function nouvelArticle(valeurs, ctx = {}) {
  return {
    code: valeurs.code ?? '',
    libelle: valeurs.libelle,
    unite: valeurs.unite,
    prixAchat: valeurs.prixAchat,
    tauxTva: valeurs.tauxTva ?? null,
    // Les champs du type, des composants et de la marge ne sont écrits que s'ils servent : les articles existants ne changent pas de forme.
    ...(valeurs.type ? { type: valeurs.type } : {}),
    ...(valeurs.composants ? { composants: valeurs.composants } : {}),
    ...(valeurs.prixVenteForce !== null && valeurs.prixVenteForce !== undefined ? { prixVenteForce: valeurs.prixVenteForce } : {}),
    ...(valeurs.marge !== null && valeurs.marge !== undefined ? { marge: valeurs.marge } : {}),
    actif: true,
    proprietaire: ctx.proprietaire ?? ctx.auteur ?? '',
  };
}

/** Création : `{ erreurs, id, ecritures }`. `articles` : le bordereau actuel (pour l'unicité du code). */
export function planCreerArticle(saisie, ctx, { articles = [] } = {}) {
  const { valeurs, erreurs } = validerArticle(saisie, { articles });
  if (Object.keys(erreurs).length) return { erreurs, id: null, ecritures: [] };
  const id = ctx.nouvelId(COLLECTION_ARTICLES);
  return { erreurs: {}, id, libelle: valeurs.libelle, ecritures: [ecritureCreer(COLLECTION_ARTICLES, id, nouvelArticle(valeurs, ctx), MARQUES_CREATION)] };
}

/** Champs que `planMajArticle` accepte (jamais l'état actif/désactivé : voir planActiverArticle). */
export const CHAMPS_MODIFIABLES = ['libelle', 'unite', 'prixAchat', 'code', 'tauxTva', 'type', 'composants', 'prixVenteForce', 'marge'];

/** Modification de champs (seuls les champs donnés changent) : `{ erreurs, patch, ecritures }`. */
export function planMajArticle(id, patch, { articles = [] } = {}) {
  const courant = (articles ?? []).find((a) => a.id === id);
  if (!courant) return { erreurs: { general: 'Article introuvable : recharge la page.' }, patch: {}, ecritures: [] };
  const donnes = Object.fromEntries(Object.entries(patch ?? {}).filter(([k]) => CHAMPS_MODIFIABLES.includes(k)));
  if (!Object.keys(donnes).length) return { erreurs: {}, patch: {}, ecritures: [] };
  // Si l'article quitte le type « ouvrage », ses composants et son prix forcé s'effacent (ils ne comptent plus dans la validation).
  const quitteOuvrage = 'type' in donnes && donnes.type !== TYPE_OUVRAGE;
  const { composants: _c, prixVenteForce: _f, ...sansOuvrage } = courant;
  const { valeurs, erreurs } = validerArticle(donnes, { articles, courant: { ...(quitteOuvrage ? sansOuvrage : courant), id } });
  // Seules les erreurs des champs touchés bloquent (un ancien article sans prix ne bloque pas la correction de son libellé).
  const bloquantes = Object.fromEntries(Object.entries(erreurs).filter(([k]) => k in donnes || ('type' in donnes && (k === 'composants' || k === 'prixVenteForce'))));
  if (Object.keys(bloquantes).length) return { erreurs: bloquantes, patch: {}, ecritures: [] };
  const net = {};
  const pareil = (a, b) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  for (const k of Object.keys(donnes)) {
    if (!pareil(courant[k] ?? (k === 'code' ? '' : null), valeurs[k])) net[k] = valeurs[k];
  }
  // Changer de type garde les champs cohérents : un ouvrage n'a pas de prix d'achat, un autre type n'a ni composants ni prix forcé.
  if ('type' in donnes) {
    if (valeurs.type === TYPE_OUVRAGE) {
      const dansUnOuvrage = (articles ?? []).find((a) => a.type === TYPE_OUVRAGE && (a.composants ?? []).some((c) => c.articleId === id));
      if (dansUnOuvrage) return { erreurs: { type: `Cet article est un composant de l’ouvrage « ${dansUnOuvrage.libelle} » : un ouvrage ne peut pas en contenir un autre. Retire-le d’abord de cet ouvrage.` }, patch: {}, ecritures: [] };
      if (courant.prixAchat !== null && courant.prixAchat !== undefined) net.prixAchat = null;
    } else {
      if (courant.composants) net.composants = null;
      if (courant.prixVenteForce !== null && courant.prixVenteForce !== undefined) net.prixVenteForce = null;
      if (courant.type === TYPE_OUVRAGE && !('prixAchat' in donnes)) {
        return { erreurs: { prixAchat: 'Indique le prix d’achat en euros (exemple : 12,50) : cet article n’est plus un ouvrage.' }, patch: {}, ecritures: [] };
      }
    }
  }
  return { erreurs: {}, patch: net, ecritures: Object.keys(net).length ? [ecritureModifier(COLLECTION_ARTICLES, id, net, MARQUES_MODIFICATION)] : [] };
}

/** Désactive (actif = false) ou réactive (actif = true) un article. Réactiver est refusé si son code est pris par un article actif. */
export function planActiverArticle(id, actif, { articles = [] } = {}) {
  const courant = (articles ?? []).find((a) => a.id === id);
  if (!courant) return { erreurs: { general: 'Article introuvable : recharge la page.' }, patch: {}, ecritures: [] };
  if ((courant.actif !== false) === actif) return { erreurs: {}, patch: {}, ecritures: [] };
  if (actif && texte(courant.code)) {
    const pris = articleDuCode(articles, courant.code, id);
    if (pris) return { erreurs: { code: `Le code « ${texte(courant.code)} » est maintenant utilisé par l’article actif « ${pris.libelle} ». Change d’abord le code de l’un des deux articles.` }, patch: {}, ecritures: [] };
  }
  return { erreurs: {}, patch: { actif }, ecritures: [ecritureModifier(COLLECTION_ARTICLES, id, { actif }, MARQUES_MODIFICATION)] };
}

/** Pour plus tard : un article « utilisé » par un devis demandera une confirmation de plus. Pour l'instant, aucun devis n'existe : jamais utilisé. */
export const articleUtilise = () => false;

/** Les articles tels qu'on les montre : un ouvrage porte son calcul (prix de vente, déboursé sec, marge) ; `toutes` : tout le Bordereau (les composants y sont cherchés). */
export function avecCalculOuvrage(articles, toutes, reglages) {
  const parId = articlesParId(toutes ?? articles);
  const r = reglagesDevis(reglages);
  return (articles ?? []).map((a) => (a.type === TYPE_OUVRAGE ? { ...a, calcul: calculerOuvrage(a, parId, { marge: r.marge, modeMarge: r.modeMarge }) } : a));
}

// ---------------------------------------------------------------- recherche, filtre, tri
/** Articles filtrés (recherche dans le code et le libellé, sans accents ni casse ; `statut` : actifs | desactives | tous), triés par libellé. */
export function filtrerArticles(articles, { recherche = '', statut = 'actifs', type = '' } = {}) {
  const mots = normaliser(recherche).split(/\s+/).filter(Boolean);
  const gardes = (articles ?? []).filter((a) => {
    if (statut === 'actifs' && a.actif === false) return false;
    if (statut === 'desactives' && a.actif !== false) return false;
    if (type === 'non_classe' ? !!a.type : (type && a.type !== type)) return false;
    if (!mots.length) return true;
    const cible = normaliser(`${a.code ?? ''} ${a.libelle ?? ''}`);
    return mots.every((m) => cible.includes(m));
  });
  return gardes.sort((a, b) => normaliser(a.libelle).localeCompare(normaliser(b.libelle), 'fr') || String(a.id).localeCompare(String(b.id)));
}

// ---------------------------------------------------------------- réglages du module
export const REGLAGES_DEVIS_DEFAUT = Object.freeze({
  nomBordereau: NOM_BORDEREAU_DEFAUT,
  modeMarge: 'majoration',
  marge: MARGE_DEFAUT,
  regimeTva: 'assujetti',
  tauxProposes: [...TAUX_TVA_DEFAUT],
  tauxTvaDefaut: TAUX_TVA_DEFAUT_REGLAGE,
  dureeValiditeJours: DUREE_VALIDITE_DEFAUT,
  etapeAFaire: '',
  etapeEnvoye: '',
  mentionEmetteur: '',
});
const CLES_REGLAGES = Object.keys(REGLAGES_DEVIS_DEFAUT);

/** Réglages lus dans la base (document absent ou illisible = valeurs par défaut) : toujours un objet complet et valide. */
export function reglagesDevis(brut) {
  const b = brut && typeof brut === 'object' ? brut : {};
  const d = REGLAGES_DEVIS_DEFAUT;
  const taux = Array.isArray(b.tauxProposes) ? b.tauxProposes.filter((t) => TAUX_TVA_DEFAUT.includes(t)) : [];
  const proposes = taux.length ? TAUX_TVA_DEFAUT.filter((t) => taux.includes(t)) : [...d.tauxProposes];
  return {
    nomBordereau: NOMS_BORDEREAU.includes(b.nomBordereau) ? b.nomBordereau : d.nomBordereau,
    modeMarge: MODES_MARGE.some((m) => m.id === b.modeMarge) ? b.modeMarge : d.modeMarge,
    marge: estNombre(b.marge) && !(b.modeMarge === 'marge_vente' && b.marge >= 100) ? b.marge : d.marge,
    regimeTva: REGIMES_TVA.some((r) => r.id === b.regimeTva) ? b.regimeTva : d.regimeTva,
    tauxProposes: proposes,
    tauxTvaDefaut: proposes.includes(b.tauxTvaDefaut) ? b.tauxTvaDefaut : proposes[0],
    dureeValiditeJours: Number.isInteger(b.dureeValiditeJours) && b.dureeValiditeJours > 0 ? b.dureeValiditeJours : d.dureeValiditeJours,
    etapeAFaire: typeof b.etapeAFaire === 'string' ? b.etapeAFaire : '',
    etapeEnvoye: typeof b.etapeEnvoye === 'string' ? b.etapeEnvoye : '',
    mentionEmetteur: typeof b.mentionEmetteur === 'string' ? b.mentionEmetteur : '',
  };
}

/** Titre de l'écran du bordereau = le nom choisi dans les réglages. */
export const titreBordereau = (reglages) => reglagesDevis(reglages).nomBordereau;

/**
 * Contrôle des réglages saisis (`saisie` complète ou partielle, complétée par `actuels`) : `{ reglages, erreurs }`.
 * `etapesIds` : identifiants des étapes de l'espace (celles du pipeline des affaires) ; une étape inconnue est refusée.
 */
export function validerReglagesDevis(saisie, { actuels = REGLAGES_DEVIS_DEFAUT, etapesIds = [] } = {}) {
  const erreurs = {};
  const s = { ...reglagesDevis(actuels), ...(saisie ?? {}) };
  if (!NOMS_BORDEREAU.includes(s.nomBordereau)) erreurs.nomBordereau = `Choisis un nom parmi : ${NOMS_BORDEREAU.join(', ')}.`;
  if (!MODES_MARGE.some((m) => m.id === s.modeMarge)) erreurs.modeMarge = 'Choisis le mode de marge.';
  const marge = lireNombre(s.marge);
  if (marge === null) erreurs.marge = 'La marge doit être un nombre en pourcentage (exemple : 20).';
  else if (!erreurs.modeMarge) {
    const { erreur } = coefficientDeMarge(marge, s.modeMarge);
    if (erreur) erreurs.marge = `${erreur} Choisis un pourcentage plus petit (exemple : 30), ou le mode « ${MODES_MARGE[0].libelle} ».`;
  }
  if (!REGIMES_TVA.some((r) => r.id === s.regimeTva)) erreurs.regimeTva = 'Choisis le régime de TVA.';
  const proposes = Array.isArray(s.tauxProposes) ? s.tauxProposes.filter((t) => TAUX_TVA_DEFAUT.includes(t)) : [];
  if (!proposes.length) erreurs.tauxProposes = 'Garde au moins un taux de TVA proposé.';
  const tauxDefaut = lireNombre(s.tauxTvaDefaut);
  if (proposes.length && !proposes.includes(tauxDefaut)) erreurs.tauxTvaDefaut = 'Le taux par défaut doit être l’un des taux proposés.';
  const jours = lireNombre(s.dureeValiditeJours);
  if (jours === null || !Number.isInteger(jours) || jours < 1 || jours > LIMITES.jours) erreurs.dureeValiditeJours = `La durée de validité est un nombre entier de jours, entre 1 et ${LIMITES.jours} (exemple : 90).`;
  for (const [cle, libelle] of [['etapeAFaire', 'à faire'], ['etapeEnvoye', 'envoyé']]) {
    if (s[cle] && !etapesIds.includes(s[cle])) erreurs[cle] = `L’étape « devis ${libelle} » n’existe plus dans tes étapes : choisis-en une autre, ou aucune.`;
  }
  if (!erreurs.etapeAFaire && !erreurs.etapeEnvoye && s.etapeAFaire && s.etapeAFaire === s.etapeEnvoye) {
    erreurs.etapeEnvoye = 'L’étape « devis envoyé » doit être différente de l’étape « devis à faire ».';
  }
  const mention = typeof s.mentionEmetteur === 'string' ? s.mentionEmetteur.trim() : '';
  if (mention.length > LIMITES.mention) erreurs.mentionEmetteur = `La mention est trop longue (${LIMITES.mention} caractères au plus).`;
  if (Object.keys(erreurs).length) return { reglages: null, erreurs };
  return {
    reglages: {
      nomBordereau: s.nomBordereau,
      modeMarge: s.modeMarge,
      marge,
      regimeTva: s.regimeTva,
      tauxProposes: TAUX_TVA_DEFAUT.filter((t) => proposes.includes(t)),
      tauxTvaDefaut: tauxDefaut,
      dureeValiditeJours: jours,
      etapeAFaire: s.etapeAFaire || '',
      etapeEnvoye: s.etapeEnvoye || '',
      mentionEmetteur: mention,
    },
    erreurs: {},
  };
}

/** Les clés des réglages (pour les tests et l'écran). */
export const CLES_REGLAGES_DEVIS = Object.freeze([...CLES_REGLAGES]);
