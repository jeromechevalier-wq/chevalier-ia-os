// Sélecteur du catalogue (écran Vocabulaire) : l'arbre « famille › sous-famille › articles ». Logique PURE (aucun accès à Firebase ni au navigateur), testée avec node --test.
import { arbreFamilles, familleEffective, cheminFamille } from './familles.js';
import { normaliser } from '../crm/logique.js';

export const MESSAGE_CATALOGUE_VIDE = 'Ton catalogue est vide : crée tes articles dans le catalogue.';
export const MESSAGE_FAMILLE_SANS_ARTICLE = 'Aucun article dans cette famille.';
export const MESSAGE_AUCUN_RESULTAT = 'Aucun article ne correspond.';
export const MESSAGE_AUCUN_RESULTAT_MIXTE = 'Aucun article ni famille ne correspond.';
export const ID_SANS_FAMILLE = 'sans_famille';

const parLibelle = (a, b) => String(a.libelle ?? '').localeCompare(String(b.libelle ?? ''), 'fr') || String(a.id).localeCompare(String(b.id));

/**
 * L'arbre des articles choisissables : `[{ id, nom, niveau, articles, enfants, nombre }]` (premier niveau d'abord, ordre de la liste des familles).
 * `articles` = ceux rangés directement dans la famille (ou la sous-famille) ; `nombre` les compte avec ceux des sous-familles. Une famille désactivée n'apparaît pas :
 * ses articles vont dans « Sans famille » (jamais perdus de vue). `estChoisissable(article)` écarte les articles désactivés et les lignes de texte.
 */
export function arbreCatalogue(articles, familles, estChoisissable = (a) => a?.actif !== false && a?.type !== 'texte') {
  const choisissables = (articles ?? []).filter((a) => a && estChoisissable(a));
  // Une sous-famille dont la famille de premier niveau est désactivée n'est pas dans l'arbre non plus : ses articles vont dans « Sans famille ».
  const parDe = new Map((familles ?? []).map((f) => [f.id, f]));
  const actives = new Set((familles ?? []).filter((f) => f.actif !== false && (!f.parentId || parDe.get(f.parentId)?.actif !== false)).map((f) => f.id));
  const rangeDans = new Map();
  const sans = [];
  for (const a of choisissables) {
    const id = familleEffective(a);
    if (id && actives.has(id)) rangeDans.set(id, [...(rangeDans.get(id) ?? []), a]);
    else sans.push(a);
  }
  const noeud = (f, niveau, enfants = []) => {
    const propres = (rangeDans.get(f.id) ?? []).sort(parLibelle);
    return { id: f.id, nom: f.nom ?? f.id, niveau, articles: propres, enfants, nombre: propres.length + enfants.reduce((n, e) => n + e.nombre, 0) };
  };
  const arbre = arbreFamilles(familles)
    .filter(({ famille }) => famille.actif !== false)
    .map(({ famille, enfants }) => noeud(famille, 1, enfants.filter((e) => e.actif !== false).map((e) => noeud(e, 2))));
  if (sans.length) arbre.push({ id: ID_SANS_FAMILLE, nom: 'Sans famille', niveau: 1, articles: sans.sort(parLibelle), enfants: [], nombre: sans.length });
  return arbre;
}

/** Le chemin à ouvrir pour montrer un article : [famille, sous-famille] (identifiants), ou [] s'il n'est pas dans l'arbre. */
export function cheminDansArbre(arbre, articleId) {
  for (const f of arbre) {
    if (f.articles.some((a) => a.id === articleId)) return [f.id];
    for (const e of f.enfants) if (e.articles.some((a) => a.id === articleId)) return [f.id, e.id];
  }
  return [];
}

/** Une famille qu'on peut viser : elle existe et n'est pas désactivée (comme les familles de `arbreCatalogue`). */
export const familleChoisissable = (f) => Boolean(f) && f.actif !== false;

/**
 * Les familles qui répondent à une recherche (mots sans accents ni casse, tous présents dans le chemin « Fournitures › Carrelage »), 8 au plus, ordre de la liste des familles.
 * Rend `[{ id, nom, chemin }]` ; une famille désactivée n'est jamais proposée.
 */
export function rechercherFamilles(familles, texte, max = 8) {
  const mots = normaliser(texte).split(/\s+/).filter(Boolean);
  if (!mots.length) return [];
  return (familles ?? []).filter(familleChoisissable).map((f) => ({ id: f.id, nom: f.nom ?? f.id, chemin: cheminFamille(familles, f.id) || (f.nom ?? f.id) }))
    .filter((f) => { const cible = normaliser(f.chemin); return mots.every((m) => cible.includes(m)); }).slice(0, max);
}
