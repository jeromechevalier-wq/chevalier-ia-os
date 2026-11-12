// Règles pures de l'écran « Relations » du module Réseaux sociaux : quelles personnes y figurent, dans quelle colonne, avec quel badge, et comment on les filtre.
// Aucune dépendance à Firebase ni au DOM (importable par les tests Node). Aucune donnée n'est copiée : tout se calcule à partir des personnes, des étiquettes
// et des activités « linkedin » du CRM ; la colonne et le badge viennent de `etapeRelation` (logique.js du module), la seule table de règles.
import * as L from '../crm/logique.js';
import { CATEGORIES, etapeRelation } from './logique.js';

/** Les quatre colonnes de l'écran (quatre au plus, règle d'interface). La couleur est une variable de css/tokens.css. */
export const COLONNES_RELATIONS = Object.freeze([
  { id: 'a_ecrire', libelle: 'À écrire', couleur: 'var(--texte2)' },
  { id: 'en_attente', libelle: 'En attente', couleur: 'var(--attention)' },
  { id: 'en_echange', libelle: 'En échange', couleur: 'var(--succes)' },
  { id: 'rendez_vous', libelle: 'Rendez-vous', couleur: 'var(--accent)' },
]);

/** Valeur du filtre « Catégorie » pour les personnes qui n'ont aucune des catégories. */
export const SANS_CATEGORIE = '_sans';

export const CRITERES_RELATIONS_VIDES = Object.freeze({ recherche: '', categories: [], aRelancer: false, aRepondre: false, tests: 'exclure' });

/** Critères complets à partir d'un morceau (valeurs inconnues ou mal formées remplacées par le défaut). */
export function criteresRelations(c = {}) {
  return {
    recherche: typeof c.recherche === 'string' ? c.recherche : '',
    categories: Array.isArray(c.categories) ? c.categories.filter((x) => typeof x === 'string') : [],
    aRelancer: c.aRelancer === true,
    aRepondre: c.aRepondre === true,
    // Un réglage inconnu reprend le départ de cet écran (« sans les tests »), pas celui des listes du CRM (« tout »).
    tests: L.OPTIONS_FILTRE_TESTS.some((o) => o.valeur === c.tests) ? c.tests : CRITERES_RELATIONS_VIDES.tests,
  };
}

/** Nombre de filtres posés (la recherche ne compte pas : elle a son propre champ). Les tests comptent s'ils ne sont pas au réglage de départ. */
export function nombreFiltres(c) {
  const k = criteresRelations(c);
  return k.categories.length + (k.aRelancer ? 1 : 0) + (k.aRepondre ? 1 : 0) + (k.tests !== CRITERES_RELATIONS_VIDES.tests ? 1 : 0);
}

const IDS_CATEGORIES = CATEGORIES.map((c) => c.id);

/** Les identifiants de catégorie (étiquettes du CRM) que porte une personne, dans l'ordre de CATEGORIES. */
export const categoriesDe = (personne) => IDS_CATEGORIES.filter((id) => (personne?.etiquettes || []).includes(id));

/** Vrai si la source de la personne est « LinkedIn » (casse et accents sans importance). */
export const sourceLinkedin = (personne) => L.normaliser(personne?.source) === 'linkedin';

/** Regroupe les activités par personne (celles qui n'ont pas de personne sont ignorées). */
export function activitesParPersonne(activites) {
  const m = new Map();
  for (const a of activites || []) {
    if (!a?.personneId) continue;
    if (!m.has(a.personneId)) m.set(a.personneId, []);
    m.get(a.personneId).push(a);
  }
  return m;
}

/**
 * Les personnes qui figurent à l'écran : non archivées, et qui ont une catégorie OU la source « LinkedIn » OU au moins une activité « linkedin ».
 * Un rendez-vous seul ne suffit pas à faire entrer quelqu'un (il ne fait que le déplacer de colonne quand la personne est déjà là).
 * Les personnes de test sont gardées ici : c'est le filtre « Tests » (`filtrerRelations`) qui les écarte.
 */
export function personnesConcernees(personnes, activites) {
  const parPersonne = activitesParPersonne(activites);
  return (personnes || []).filter((p) => p && !p.archive && (
    categoriesDe(p).length > 0 || sourceLinkedin(p) || (parPersonne.get(p.id) || []).some((a) => a.type === 'linkedin')));
}

/** Jour (AAAA-MM-JJ, Paris) du dernier échange LinkedIn FAIT d'une personne, ou null. Sert à afficher « dernier échange » (le calcul de relance, lui, est dans `etapeRelation`). */
export function dernierEchange(activitesDeLaPersonne) {
  const jours = (activitesDeLaPersonne || []).filter((a) => a.type === 'linkedin' && a.fait === true)
    .map((a) => (typeof a.date === 'string' && /^\d{4}-\d{2}-\d{2}/.test(a.date) ? a.date.slice(0, 10) : (L.jourParis(a.date) ?? L.jourParis(a.dateFait)))).filter(Boolean).sort();
  return jours.at(-1) ?? null;
}

/**
 * Toutes les relations affichables : [{ personne, etape, badge, jours, dernier, categories }].
 * `etape`, `badge` et `jours` viennent de `etapeRelation` (logique.js du module). Le tri : les cartes à badge d'abord (« À répondre » avant « À relancer »),
 * puis les plus anciens échanges, puis l'ordre alphabétique.
 */
export function construireRelations(personnes, activites, maintenant = new Date()) {
  const parPersonne = activitesParPersonne(activites);
  return personnesConcernees(personnes, activites).map((personne) => {
    const siennes = parPersonne.get(personne.id) || [];
    return { personne, ...etapeRelation(personne, siennes, maintenant), dernier: dernierEchange(siennes), categories: categoriesDe(personne) };
  }).sort(comparerRelations);
}

const RANG_BADGE = { repondre: 0, relancer: 1 };
function comparerRelations(a, b) {
  const ra = RANG_BADGE[a.badge] ?? 2; const rb = RANG_BADGE[b.badge] ?? 2;
  return ra - rb || (b.jours ?? -1) - (a.jours ?? -1) || L.normaliserNom(a.personne.nom).localeCompare(L.normaliserNom(b.personne.nom), 'fr');
}

/**
 * Applique la recherche (nom ou organisation), les catégories, « À relancer seulement », « À répondre seulement » et le filtre « Tests ».
 * `nomOrganisation(personne)` rend le nom de l'organisation de la personne (ou '').
 * Les filtres se combinent (ET). Cocher « À relancer » et « À répondre » ensemble garde les deux sortes de badges (OU entre ces deux cases).
 */
export function filtrerRelations(relations, criteres, nomOrganisation = () => '') {
  const c = criteresRelations(criteres);
  const mot = L.normaliser(c.recherche);
  return (relations || []).filter((r) => {
    if (!L.testsCorrespond(c.tests, r.personne)) return false;
    if (mot && !L.normaliser(r.personne.nom).includes(mot) && !L.normaliser(nomOrganisation(r.personne)).includes(mot)) return false;
    if (c.categories.length && !c.categories.some((id) => (id === SANS_CATEGORIE ? r.categories.length === 0 : r.categories.includes(id)))) return false;
    if (c.aRelancer || c.aRepondre) {
      const garde = (c.aRelancer && r.badge === 'relancer') || (c.aRepondre && r.badge === 'repondre');
      if (!garde) return false;
    }
    return true;
  });
}

/** Les relations rangées par colonne : { a_ecrire: [...], en_attente: [...], en_echange: [...], rendez_vous: [...] } (l'ordre de chaque colonne est celui de la liste reçue). */
export function grouperParColonne(relations) {
  const sortie = Object.fromEntries(COLONNES_RELATIONS.map((c) => [c.id, []]));
  for (const r of relations || []) sortie[r.etape]?.push(r);
  return sortie;
}

/** « 3 relations » / « 1 relation » / « Aucune relation ». */
export const texteCompteRelations = (n) => (n === 0 ? 'Aucune relation' : `${n} ${n > 1 ? 'relations' : 'relation'}`);

/** Les noms de catégories à créer : celles de CATEGORIES absentes des étiquettes (comparaison par nom normalisé, comme `categoriesManquantes`). */
export function nomsCategoriesManquantes(etiquettes) {
  return CATEGORIES.filter((c) => !(etiquettes || []).some((e) => L.normaliserNom(e.nom) === L.normaliserNom(c.nom))).map((c) => c.nom);
}

const formateurDate = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
/** « 3 nov. 2026 » pour un jour civil AAAA-MM-JJ ; chaîne vide sans date. */
export function libelleJourCourt(jour) {
  if (!jour) return '';
  const [a, m, j] = String(jour).split('-').map(Number);
  return formateurDate.format(new Date(Date.UTC(a, m - 1, j, 12)));
}
