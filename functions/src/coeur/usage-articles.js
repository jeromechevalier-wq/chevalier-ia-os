// Compteur d'usage des articles (cadrage vocabulaire-cibles, section 2.9, 30/10/2026) : pour chaque article, le nombre de devis FINALISÉS où il apparaît et la date de la dernière finalisation.
// Collection `devis_usage_articles` (un document par article : { articleId, nombre, derniereUtilisationLe }), écrite par le SERVEUR seulement (règles Firestore : lecture par les membres, aucune écriture navigateur).
//
// Règles de comptage :
// - Un article compte UNE fois par devis (deux lignes du même article = 1), d'après `articleId` de la ligne : jamais les composants d'un ouvrage (ce que l'utilisateur a demandé).
// - Jamais pour un brouillon. Un même numéro de devis ne compte qu'une fois : une version suivante ne compte que la DIFFÉRENCE avec la version non brouillon la plus récente de la même racine,
//   quel que soit son statut (+1 article nouveau, -1 article retiré, 0 article resté). `remplaces` ne suffit pas (une nouvelle version peut partir d'un devis refusé).
// - Un devis refusé ou archivé reste compté (décision de Jérôme, 30/10/2026).
// - Un article RESTÉ garde son nombre mais prend la date de la nouvelle finalisation. Jamais négatif. Pas de ligne de journal par article (le devis finalisé a la sienne, et le compteur se recalcule depuis les devis).
import { COLLECTIONS as C } from './donnees.js';

export const idValable = (id) => typeof id === 'string' && id.length > 0 && id.length <= 200 && !id.includes('/') && id !== '.' && id !== '..';

/** Les articles DISTINCTS d'un devis, d'après l'`articleId` de chaque ligne (sauts de page et lignes libres exclus ; les composants d'un ouvrage ne comptent pas). */
export function articlesDuDevis(devis) {
  const ids = new Set();
  for (const section of devis?.sections ?? []) {
    for (const ligne of section?.lignes ?? []) {
      if (ligne?.type === 'saut') continue; // saut de page (partage/devis.js : estSaut)
      if (idValable(ligne?.articleId)) ids.add(ligne.articleId);
    }
  }
  return ids;
}

/** La version non brouillon la plus récente de la même racine, avant `devis` (quel que soit son statut), ou null. */
export function versionDeReference(devis, versions) {
  const precedentes = (versions ?? []).filter((v) => v.id !== devis.id && v.statut !== 'brouillon' && (v.version ?? 1) < (devis.version ?? 1));
  return precedentes.reduce((meilleure, v) => (!meilleure || (v.version ?? 1) > (meilleure.version ?? 1) ? v : meilleure), null);
}

/** Ce que la finalisation de `devis` change : `{ ajoutes: [articleId], retires: [articleId] }` (les articles restés ne changent rien). */
export function differenceUsage(devis, reference) {
  const apres = articlesDuDevis(devis);
  const avant = reference ? articlesDuDevis(reference) : new Set();
  return { ajoutes: [...apres].filter((id) => !avant.has(id)).sort(), retires: [...avant].filter((id) => !apres.has(id)).sort() };
}

/**
 * Les écritures du compteur pour une finalisation, À APPELER DANS LA TRANSACTION de `finaliser` (les lectures se font ici, AVANT l'écriture unique de la transaction).
 * Chaque document est lu puis écrit en entier avec `set` (jamais `update` : un document absent serait en erreur). Rend la liste d'écritures `{ type: 'set', … }`.
 */
export async function ecrituresUsage(tx, { devis, versions, maintenant }) {
  const reference = versionDeReference(devis, versions);
  const { ajoutes, retires } = differenceUsage(devis, reference);
  // Les articles RESTÉS gardent leur nombre mais prennent la date de cette finalisation (c'est la dernière finalisation qui les contient, comme le recalcul le calcule).
  const avant = reference ? articlesDuDevis(reference) : new Set();
  const restes = [...articlesDuDevis(devis)].filter((id) => avant.has(id)).sort();
  const ids = [...ajoutes, ...retires, ...restes];
  if (!ids.length) return [];
  const courants = await Promise.all(ids.map((id) => tx.document(C.devisUsageArticles, id)));
  const nombreDe = (i) => (Number.isInteger(courants[i]?.nombre) && courants[i].nombre > 0 ? courants[i].nombre : 0);
  const ecritures = [];
  ids.forEach((id, i) => {
    let donnees;
    if (i < ajoutes.length) donnees = { articleId: id, nombre: nombreDe(i) + 1, derniereUtilisationLe: maintenant };
    else if (i < ajoutes.length + retires.length) donnees = { articleId: id, nombre: Math.max(0, nombreDe(i) - 1), derniereUtilisationLe: courants[i]?.derniereUtilisationLe ?? null }; // un retrait ne change pas la date
    else if (courants[i]) donnees = { articleId: id, nombre: nombreDe(i), derniereUtilisationLe: maintenant }; // article resté : seulement la date (rien si le compteur n'existe pas encore : le recalcul le crée)
    if (donnees) ecritures.push({ type: 'set', collection: C.devisUsageArticles, id, donnees });
  });
  return ecritures;
}

const enDate = (v) => (v && typeof v.toDate === 'function' ? v.toDate() : v instanceof Date ? v : null);

/**
 * Ce que donnerait le compteur d'après les devis EXISTANTS : par racine, la version non brouillon de plus haut numéro de version (même résultat que les finalisations successives).
 * Rend un `Map articleId -> { nombre, derniereUtilisationLe }` (la date = la dernière finalisation parmi les devis comptés qui contiennent l'article).
 */
// Le recalcul lui-même (`recalculerUsageArticles`) est dans devis.js, avec les autres transactions.
export function usageDepuisLesDevis(devis) {
  const parRacine = new Map();
  for (const d of devis ?? []) {
    if (d?.statut === 'brouillon' || !d?.id) continue;
    const racine = d.racineId ?? d.id;
    const courante = parRacine.get(racine);
    if (!courante || (d.version ?? 1) > (courante.version ?? 1)) parRacine.set(racine, d);
  }
  const usage = new Map();
  for (const d of parRacine.values()) {
    const date = enDate(d.finaliseLe);
    for (const id of articlesDuDevis(d)) {
      const u = usage.get(id) ?? { nombre: 0, derniereUtilisationLe: null };
      u.nombre += 1;
      if (date && (!u.derniereUtilisationLe || date > u.derniereUtilisationLe)) u.derniereUtilisationLe = date;
      usage.set(id, u);
    }
  }
  return usage;
}
