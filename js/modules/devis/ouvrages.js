// Ouvrages du module Devis : un ouvrage est un article composé d'autres articles du Bordereau (ex. « Cloisons de séparation » = plaque + rail + isolant).
// Logique PURE (aucun accès à Firebase, au réseau ni au navigateur), testée avec node --test. Elle importe logique.js sans le modifier.
//
// Un composant = { articleId, quantite }. Son prix de vente vient de son article : prix d'achat × marge (la marge propre de l'article,
// sinon la marge des réglages du module). Tout se calcule en centimes entiers, arrondi au demi supérieur.
// Déboursé sec = somme des coûts d'achat. Marge brute = prix de vente - déboursé. Taux de marge = marge brute / déboursé.
// Profondeur 1 en v1 : un composant ne peut pas être lui-même un ouvrage.
import { prixVenteUnitaire, versCentimes, versEuros, totalLigne } from './logique.js';

export const TYPE_OUVRAGE = 'ouvrage';
export const MAX_COMPOSANTS = 30;
export const MARGE_PAR_DEFAUT = { marge: 20, modeMarge: 'majoration' };

const estNombre = (v) => typeof v === 'number' && Number.isFinite(v);
/** Au plus 3 décimales (tolérance pour les erreurs de virgule flottante). */
const troisDecimales = (n) => Math.abs(Math.round(n * 1000) - n * 1000) < 1e-6;
const nombreFr = (n) => String(Math.round(n * 1000) / 1000).replace('.', ',');

// ---------------------------------------------------------------- le mot du métier (« ouvrage », « ensemble », « forfait »…)
// Nom de catégorie affiché à l'utilisateur ; l'identifiant technique reste `ouvrage` partout. Liste FERMÉE avec sa grammaire (jamais « cette ensemble »), plus « Autre » validé.
export const MOTS_OUVRAGE = Object.freeze([
  Object.freeze({ id: 'ouvrage', singulier: 'ouvrage', pluriel: 'ouvrages', genre: 'masculin' }),
  Object.freeze({ id: 'ensemble', singulier: 'ensemble', pluriel: 'ensembles', genre: 'masculin' }),
  Object.freeze({ id: 'forfait', singulier: 'forfait', pluriel: 'forfaits', genre: 'masculin' }),
  Object.freeze({ id: 'prestation', singulier: 'prestation', pluriel: 'prestations', genre: 'feminin' }),
  Object.freeze({ id: 'lot', singulier: 'lot', pluriel: 'lots', genre: 'masculin' }),
]);
export const MOT_OUVRAGE_DEFAUT = 'ouvrage';
export const MOT_OUVRAGE_AUTRE = 'autre';
export const LETTRES_MOT_MIN = 2;
export const LETTRES_MOT_MAX = 30;
const GENRES_MOT = Object.freeze(['masculin', 'feminin']);

const genreDe = (g) => {
  const t = typeof g === 'string' ? g.trim().toLowerCase().replace('é', 'e') : '';
  return GENRES_MOT.includes(t) ? t : null;
};
const motValide = (t) => {
  const m = typeof t === 'string' ? t.trim().replace(/\s+/g, ' ') : '';
  return m.length >= LETTRES_MOT_MIN && m.length <= LETTRES_MOT_MAX && /^\p{L}[\p{L} '’-]*\p{L}$/u.test(m) ? m : null;
};

/** Le mot « Autre » saisi : `{ autre, erreurs }` (`autre` : `{ singulier, pluriel, genre }` nettoyé, ou null si invalide ; `erreurs` : une phrase par champ fautif). */
export function validerMotAutre(brut) {
  const b = brut && typeof brut === 'object' ? brut : {};
  const erreurs = {};
  const singulier = motValide(b.singulier);
  const pluriel = motValide(b.pluriel);
  const genre = genreDe(b.genre);
  const regle = `de ${LETTRES_MOT_MIN} à ${LETTRES_MOT_MAX} lettres`;
  if (!singulier) erreurs.singulier = `Écris le mot au singulier (${regle}, exemple : chantier).`;
  if (!pluriel) erreurs.pluriel = `Écris le mot au pluriel (${regle}, exemple : chantiers).`;
  if (!genre) erreurs.genre = 'Choisis masculin ou féminin.';
  return Object.keys(erreurs).length ? { autre: null, erreurs } : { autre: { singulier, pluriel, genre }, erreurs: {} };
}

/** Le choix lu dans les réglages (jamais d'erreur) : `{ motOuvrage, motOuvrageAutre }` ; un choix inconnu, ou « Autre » sans mot valide, retombe sur « ouvrage ». */
export function lireMotOuvrage(brut) {
  const b = brut && typeof brut === 'object' ? brut : {};
  const autre = validerMotAutre(b.motOuvrageAutre).autre;
  const id = b.motOuvrage === MOT_OUVRAGE_AUTRE ? (autre ? MOT_OUVRAGE_AUTRE : MOT_OUVRAGE_DEFAUT) : (MOTS_OUVRAGE.some((m) => m.id === b.motOuvrage) ? b.motOuvrage : MOT_OUVRAGE_DEFAUT);
  return { motOuvrage: id, motOuvrageAutre: autre ?? {} };
}

const VOYELLE = /^[aeiouyhœæ]/iu;
/** `{ singulier, pluriel, genre, un, le, cet, leMot }` du mot du métier : « ensemble » -> un / le / cet, « l’ensemble » ; « prestation » -> une / la / cette, « la prestation ». Fonction pure. */
export function motOuvrage(reglages) {
  const { motOuvrage: id, motOuvrageAutre: autre } = lireMotOuvrage(reglages);
  const m = id === MOT_OUVRAGE_AUTRE ? autre : MOTS_OUVRAGE.find((x) => x.id === id);
  const f = m.genre === 'feminin';
  const elide = VOYELLE.test(m.singulier.normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
  return { singulier: m.singulier, pluriel: m.pluriel, genre: m.genre, un: f ? 'une' : 'un', le: f ? 'la' : 'le', cet: f ? 'cette' : (elide ? 'cet' : 'ce'), leMot: `${elide ? 'l’' : `${f ? 'la' : 'le'} `}${m.singulier}` };
}

/** Cherche un article dans un objet { id: article } ou une Map. */
function trouver(articlesParId, id) {
  if (!articlesParId || typeof id !== 'string') return null;
  const a = articlesParId instanceof Map ? articlesParId.get(id) : articlesParId[id];
  return a && typeof a === 'object' ? a : null;
}

/** Liste d'articles (avec `id`) -> objet { id: article }. */
export function articlesParId(liste) {
  return Object.fromEntries((liste ?? []).filter((a) => a && a.id).map((a) => [a.id, a]));
}

const reglagesMarge = (reglages) => ({
  marge: estNombre(reglages?.marge) ? reglages.marge : MARGE_PAR_DEFAUT.marge,
  modeMarge: reglages?.modeMarge ?? MARGE_PAR_DEFAUT.modeMarge,
});

/** Prix de vente unitaire d'un article du Bordereau (sa marge propre, sinon celle des réglages). Null si impossible. */
export function prixVenteArticle(article, reglages) {
  const r = reglagesMarge(reglages);
  const marge = estNombre(article?.marge) ? article.marge : r.marge;
  return prixVenteUnitaire(article?.prixAchat, marge, r.modeMarge);
}

// ---------------------------------------------------------------- calcul
/**
 * Calcul d'un ouvrage. `reglages` : { marge, modeMarge } du module (20 % en majoration si absent).
 * Un composant inconnu, désactivé ou qui est lui-même un ouvrage est signalé dans `erreurs` et compté 0.
 */
export function calculerOuvrage(ouvrage, articles, reglages) {
  const erreurs = [];
  const composants = [];
  let venteC = 0;
  let achatC = 0;
  for (const c of Array.isArray(ouvrage?.composants) ? ouvrage.composants : []) {
    const article = trouver(articles, c?.articleId);
    const quantite = estNombre(c?.quantite) ? c.quantite : 0;
    const base = { articleId: c?.articleId ?? null, quantite };
    let probleme = null;
    if (!article) probleme = 'article introuvable';
    else if (article.actif === false) probleme = 'article désactivé';
    else if (article.type === TYPE_OUVRAGE) probleme = 'un ouvrage ne peut pas contenir un autre ouvrage';
    const pv = article && !probleme ? prixVenteArticle(article, reglages) : null;
    if (!probleme && (pv === null || !estNombre(article.prixAchat))) probleme = 'prix d’achat ou marge invalide';
    if (probleme) {
      const nom = article?.libelle ? `« ${article.libelle} »` : `(${base.articleId ?? 'sans identifiant'})`;
      erreurs.push(`Composant ${nom} : ${probleme}. Il est compté pour 0 € : retire-le ou remplace-le.`);
      composants.push({
        ...base, libelle: article?.libelle ?? '', unite: article?.unite ?? '', prixVenteUnitaire: 0, prixAchat: 0, totalVenteHT: 0, totalAchat: 0, manquant: true,
      });
      continue;
    }
    const totalVenteC = versCentimes(totalLigne(quantite, pv));
    const totalAchatC = versCentimes(totalLigne(quantite, article.prixAchat));
    venteC += totalVenteC;
    achatC += totalAchatC;
    composants.push({
      ...base, libelle: article.libelle ?? '', unite: article.unite ?? '', prixVenteUnitaire: pv, prixAchat: article.prixAchat,
      totalVenteHT: versEuros(totalVenteC), totalAchat: versEuros(totalAchatC),
    });
  }
  const force = estNombre(ouvrage?.prixVenteForce) && ouvrage.prixVenteForce >= 0 ? ouvrage.prixVenteForce : null;
  const prixC = force === null ? venteC : versCentimes(force);
  const margeC = prixC - achatC;
  return {
    prixVenteHT: versEuros(prixC),
    deboursSecHT: versEuros(achatC),
    margeBruteHT: versEuros(margeC),
    tauxMarge: achatC > 0 ? Math.round((margeC / achatC) * 10000) / 100 : null,
    prixForce: force !== null,
    composants,
    erreurs,
  };
}

// ---------------------------------------------------------------- description et copie figée
/** Description multi-lignes d'une ligne de devis : « - BA13 standard (2 m²) » (quantité du composant × quantité de la ligne). Les composants manquants sont omis. */
export function descriptionOuvrage(calcul, articles, quantiteLigne = 1) {
  const q = estNombre(quantiteLigne) && quantiteLigne > 0 ? quantiteLigne : 1;
  return (calcul?.composants ?? []).filter((c) => !c.manquant).map((c) => {
    const libelle = c.libelle || trouver(articles, c.articleId)?.libelle || '';
    const unite = c.unite || trouver(articles, c.articleId)?.unite || '';
    return `- ${libelle} (${nombreFr(c.quantite * q)}${unite ? ` ${unite}` : ''})`;
  }).join('\n');
}

/** Copie figée d'un ouvrage pour une ligne de devis : plus rien ne change quand l'article ou l'ouvrage du Bordereau change ensuite. */
export function figerOuvragePourLigne(ouvrage, articles, reglages) {
  const calcul = calculerOuvrage(ouvrage, articles, reglages);
  return {
    composants: calcul.composants.filter((c) => !c.manquant).map((c) => ({
      articleId: c.articleId, libelle: c.libelle, unite: c.unite, quantite: c.quantite, prixVenteUnitaire: c.prixVenteUnitaire, prixAchat: c.prixAchat,
    })),
    prixVenteHT: calcul.prixVenteHT,
    deboursSecHT: calcul.deboursSecHT,
    erreurs: calcul.erreurs,
  };
}

// ---------------------------------------------------------------- validation
/**
 * Erreurs (messages français) d'un ouvrage : `ouvrage` = { id?, composants, prixVenteForce? }. Liste vide = valide.
 * `articles` sert à vérifier que chaque composant existe, est actif et n'est pas un ouvrage (profondeur 1).
 */
export function erreursOuvrage(ouvrage, articles) {
  const erreurs = [];
  const liste = ouvrage?.composants;
  if (!Array.isArray(liste) || liste.length === 0) return ['Un ouvrage a besoin d’au moins un composant : ajoute un article.'];
  if (liste.length > MAX_COMPOSANTS) erreurs.push(`Un ouvrage a ${MAX_COMPOSANTS} composants au plus (${liste.length} donnés) : regroupe-en certains dans un autre article.`);
  const vus = new Set();
  liste.forEach((c, i) => {
    const rang = `Composant ${i + 1}`;
    if (!c || typeof c.articleId !== 'string' || !c.articleId) { erreurs.push(`${rang} : choisis un article.`); return; }
    const article = trouver(articles, c.articleId);
    const nom = article?.libelle ? `« ${article.libelle} »` : rang;
    if (ouvrage.id && c.articleId === ouvrage.id) { erreurs.push(`${nom} : un ouvrage ne peut pas se contenir lui-même.`); return; }
    if (vus.has(c.articleId)) erreurs.push(`${nom} : cet article est déjà dans l’ouvrage. Augmente sa quantité au lieu de l’ajouter deux fois.`);
    vus.add(c.articleId);
    if (!estNombre(c.quantite) || c.quantite <= 0) erreurs.push(`${nom} : la quantité doit être un nombre plus grand que 0 (exemple : 2,5).`);
    else if (!troisDecimales(c.quantite)) erreurs.push(`${nom} : la quantité s’écrit avec 3 décimales au plus.`);
    if (!article) erreurs.push(`${rang} : cet article n’existe pas dans le catalogue.`);
    else if (article.type === TYPE_OUVRAGE) erreurs.push(`${nom} : c’est déjà un ouvrage, et un ouvrage ne peut pas en contenir un autre.`);
    else if (article.type === 'texte') erreurs.push(`${nom} : c’est une ligne de texte, sans prix : elle ne peut pas composer un ouvrage.`);
    else if (article.actif === false) erreurs.push(`${nom} : cet article est désactivé. Réactive-le ou retire-le de l’ouvrage.`);
  });
  const f = ouvrage.prixVenteForce;
  if (f !== undefined && f !== null) {
    if (!estNombre(f)) erreurs.push('Le prix de vente forcé doit être un nombre en euros (exemple : 12,50).');
    else if (f < 0) erreurs.push('Le prix de vente forcé ne peut pas être négatif.');
  }
  return erreurs;
}
