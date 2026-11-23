// Module Pilotage : le service (le même code sert la fonction `pilotageLire`, `pilotageEnregistrerReglages` et le script d'essai `scripts/pilotage-essai.js`).
// L'AUTHENTIFICATION est faite par l'appel (appel.js) ; ici : qui voit quelle tuile, lecture des vues par UNE connexion, cache court, enregistrement du réglage avec sa ligne de journal.
// Règles du contrat :
//  - une tuile interdite à l'appelant n'est JAMAIS lue dans la base, ni renvoyée, ni mentionnée (pas même son id dans `erreurs`) ;
//  - `erreurs` ne porte que des tuiles visibles, avec une phrase générique : jamais un message de la base ;
//  - une tuile en erreur reste dans `tuiles` avec `lignes: []` (l'écran peut montrer son titre et l'erreur) ;
//  - le nom de vue ne vient QUE du réglage enregistré (ou, en `apercu`, du brouillon de Jérôme) : jamais d'un paramètre libre du navigateur ;
//  - contrat étendu (PR « Tableau de bord A ») : par tuile `type`, `largeur`, `aide` et la config validée du type (valeur, seuils, variation, colonnes, parPage, formats, texte, lien) ;
//    à la racine `onglets` (structure FILTRÉE : ids interdits retirés, sections et onglets vides retirés) et `onglet` (l'onglet lu). `pilotageLire({ onglet })` ne lit que cet onglet ;
//  - pour chiffre, tableau et phrases, seules les colonnes DÉCLARÉES dans le réglage sortent du serveur (filtrage après lecture) ; un texte ne lit rien en base ;
//  - l'aperçu (brouillon de Jérôme) montre toutes les tuiles du brouillon (c'est lui qui règle les droits) et n'utilise pas le cache.
import { analyserOption, construireSql, tuileVisible, validerReglages, ErreurPilotage, MOTIF_ID } from './reglages.js';
import { ErreurPostgres, avecDelai, DELAI_FERMETURE_MS } from './postgres.js';

export const COLLECTION_PILOTAGE = 'pilotage_parametres';
export const DOCUMENT_REGLAGES = 'reglages';
export const DUREE_CACHE_MS = 60_000;
export const BUDGET_LECTURE_MS = 40_000; // la fonction a 60 s : passé ce budget, les tuiles restantes sont en erreur et la réponse part avec ce qui est lu
const CLE_AUDIT = 'crm_audit'; // le journal commun (coeur/donnees.js, C.audit)
export const MESSAGE_TUILE = 'Cette tuile n\'a pas pu être lue.';
const CACHE_MAX = 60;

const enIso = (v) => {
  if (v && typeof v.toDate === 'function') return v.toDate().toISOString();
  if (v instanceof Date) return v.toISOString();
  return typeof v === 'string' ? v : null;
};

/** Une valeur de ligne propre à rendre à l'écran (JSON) : dates en texte, grands entiers en nombres, le reste inconnu en null. */
function nettoyerValeur(v) {
  if (v === null || v === undefined) return null;
  if (typeof v === 'number') return Number.isFinite(v) ? v : null;
  if (typeof v === 'string' || typeof v === 'boolean') return v;
  if (typeof v === 'bigint') return Number(v);
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v.toISOString();
  if (Array.isArray(v)) return v.map(nettoyerValeur);
  if (typeof v === 'object' && Object.getPrototypeOf(v) === Object.prototype) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, nettoyerValeur(x)]));
  return null;
}
export const nettoyerLignes = (lignes) => (Array.isArray(lignes) ? lignes : []).map((l) => Object.fromEntries(Object.entries(l ?? {}).map(([k, v]) => [k, nettoyerValeur(v)])));

/** Le document enregistré tel que l'écran de sauvegarde le reçoit : `option` reste une chaîne, la date est du texte. */
export function documentPublic(doc) {
  const { id, ...reste } = doc;
  void id;
  return { ...reste, modifieLe: enIso(reste.modifieLe) };
}


/** Colonnes que le réglage déclare pour une tuile (null = toutes : graphique, dont l'option choisit ses colonnes). */
export function colonnesDeclarees(t) {
  if (t.type === 'chiffre') return [t.valeur.colonne, t.variation?.colonne, t.variation?.periodeColonne].filter(Boolean);
  if (t.type === 'tableau') return t.colonnes.map((c) => c.colonne);
  if (t.type === 'phrases') return t.colonnes;
  return null;
}
const filtrerColonnes = (t, lignes) => {
  const cols = colonnesDeclarees(t);
  if (!cols) return lignes;
  return lignes.map((l) => Object.fromEntries(cols.filter((c) => c in l).map((c) => [c, l[c]])));
};

/** Identifiants de toutes les tuiles placées dans un onglet (tuiles directes, puis sections). */
export const idsDeOnglet = (o) => new Set([...(o.tuiles ?? []), ...(o.sections ?? []).flatMap((x) => x.tuiles)]);

/** Structure des onglets telle que l'appelant peut la voir : ids de tuiles interdits retirés, section ou onglet sans tuile visible retiré. Rien de ce qui est interdit n'y reste (pas même un titre de section vide). */
export function filtrerOnglets(onglets, idsVisibles) {
  if (!Array.isArray(onglets)) return undefined;
  const sortie = [];
  for (const o of onglets) {
    const sections = (o.sections ?? []).map((x) => ({ ...x, tuiles: x.tuiles.filter((id) => idsVisibles.has(id)) })).filter((x) => x.tuiles.length);
    const tuiles = o.tuiles.filter((id) => idsVisibles.has(id));
    if (!tuiles.length && !sections.length) continue;
    const { sections: _s, ...reste } = o;
    sortie.push({ ...reste, tuiles, ...(sections.length ? { sections } : {}) });
  }
  return sortie;
}

/** Tête d'une tuile renvoyée à l'écran : identité, type, largeur, aide et configuration du type ; un lien vers un onglet invisible est retiré, un lien de texte vers un onglet invisible redevient du texte simple. */
function enteteTuile(t, ongletsVisibles) {
  const ok = (l) => (l && ongletsVisibles?.has(l.onglet) ? l : undefined);
  const e = { id: t.id, titre: t.titre, type: t.type };
  if (t.largeur) e.largeur = t.largeur;
  if (t.aide) e.aide = t.aide;
  if (t.type === 'chiffre') {
    e.valeur = t.valeur;
    if (t.seuils) e.seuils = t.seuils;
    if (t.variation) e.variation = t.variation;
    const l = ok(t.lien);
    if (l) e.lien = l;
  } else if (t.type === 'tableau') {
    e.colonnes = t.colonnes.map(({ lien, ...c }) => (ok(lien) ? { ...c, lien } : c));
    e.parPage = t.parPage;
  } else if (t.type === 'phrases') e.colonnes = t.colonnes;
  else if (t.type === 'graphique' && t.formats) e.formats = t.formats;
  else if (t.type === 'texte') e.texte = t.texte.replace(/\[([^\]]*)\]\(#([a-z0-9_-]+)\)/g, (m, libelle, id) => (ongletsVisibles?.has(id) ? m : libelle));
  return e;
}

/**
 * `donnees` : fonction qui rend l'accès Firestore (creerAccesFirestore) ; `connecter` : `ouvrir()` de postgres.js ; `journalErreur` : (type, etat) pour le journal du serveur (jamais de valeur).
 */
export function creerServicePilotage({ donnees, connecter, maintenant = Date.now, dureeCacheMs = DUREE_CACHE_MS, budgetMs = BUDGET_LECTURE_MS, delaiFermetureMs = DELAI_FERMETURE_MS, journalErreur = () => {} }) {
  const cache = new Map(); // sql -> { jusqua, lignes }

  async function lireReglagesEnregistres({ tolerant = false } = {}) {
    const doc = await donnees().document(COLLECTION_PILOTAGE, DOCUMENT_REGLAGES);
    if (!doc) return null;
    try { return { ...doc, ...validerReglages(doc) }; } catch { if (tolerant) return { ...doc, invalide: true }; throw new ErreurPilotage('failed-precondition', 'Le réglage enregistré est invalide : enregistre-le à nouveau depuis les réglages de Pilotage.'); }
  }

  async function lireTuiles(tuiles, { avecCache, ongletsVisibles }) {
    const erreurs = [];
    let connexion = null; // une seule connexion par appel, ouverte à la première lecture nécessaire
    const obtenir = () => { connexion ??= connecter(); return connexion; };
    const dejaDemandees = new Map(); // sql -> promesse des lignes : une seule requête par SQL identique dans un même appel
    let minuteur;
    const TEMPS = Symbol('budget');
    const fin = new Promise((ok) => { minuteur = setTimeout(() => ok(TEMPS), budgetMs); }); // budget global : après lui, tout ce qui reste est en erreur
    const enErreur = (t, option) => { erreurs.push({ id: t.id, message: MESSAGE_TUILE }); return { ...enteteTuile(t, ongletsVisibles), ...(t.type === 'graphique' ? { option } : {}), lignes: [] }; };
    const lignesDe = (sql) => {
      if (avecCache) {
        const c = cache.get(sql);
        if (c && c.jusqua > maintenant()) return Promise.resolve(c.lignes);
      }
      if (!dejaDemandees.has(sql)) {
        dejaDemandees.set(sql, (async () => {
          const brut = await Promise.race([(async () => (await obtenir()).interroger(sql))(), fin]);
          if (brut === TEMPS) return TEMPS;
          const lignes = nettoyerLignes(brut);
          if (avecCache) {
            if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
            cache.set(sql, { jusqua: maintenant() + dureeCacheMs, lignes });
          }
          return lignes;
        })());
      }
      return dejaDemandees.get(sql);
    };
    const lireUne = async (t) => {
      if (t.type === 'texte') return { ...enteteTuile(t, ongletsVisibles), lignes: [] }; // un texte ne lit jamais la base
      let option;
      let sql;
      try { if (t.type === 'graphique') option = analyserOption(t.option, 'option'); sql = construireSql(t); } catch { return enErreur(t, {}); }
      try {
        const lignes = await lignesDe(sql);
        if (lignes === TEMPS) { journalErreur('budget'); return enErreur(t, option); }
        return { ...enteteTuile(t, ongletsVisibles), ...(t.type === 'graphique' ? { option } : {}), lignes: filtrerColonnes(t, lignes) };
      } catch (e) {
        journalErreur(e instanceof ErreurPostgres ? e.type : 'inconnue', e?.etat);
        return enErreur(t, option);
      }
    };
    try {
      const resultat = await Promise.all(tuiles.map(lireUne));
      return { tuiles: resultat, erreurs };
    } finally {
      clearTimeout(minuteur);
      // fermeture garantie et bornée : même si une lecture a échoué ou si le budget est dépassé ; une connexion en cours d'ouverture est fermée dès qu'elle arrive, sans qu'on l'attende au-delà du délai
      if (connexion) await avecDelai(() => connexion.then((c) => c.fermer(), () => {}), delaiFermetureMs);
    }
  }

  /** `{ email, apercu?, exporter?, onglet? }` : les droits de `apercu` et `exporter` sont contrôlés par l'appel (Jérôme seul). `onglet` = identifiant d'un onglet du réglage (jamais un nom de vue) : seul cet onglet est lu. */
  async function lire({ email, apercu, exporter, onglet } = {}) {
    if (exporter === true) {
      const doc = await lireReglagesEnregistres({ tolerant: true });
      if (!doc) return { reglages: null };
      const { invalide, ...brut } = doc;
      return invalide ? { reglages: documentPublic(brut), invalide: true } : { reglages: documentPublic(brut) };
    }
    let reglages;
    let visibles;
    if (apercu !== undefined && apercu !== null) {
      reglages = validerReglages(apercu);
      visibles = reglages.tableau.tuiles;
    } else {
      reglages = await lireReglagesEnregistres();
      if (!reglages) return { titre: '', tuiles: [], erreurs: [] };
      visibles = reglages.tableau.tuiles.filter((t) => tuileVisible(t, reglages.groupes, email));
    }
    const structure = filtrerOnglets(reglages.tableau.onglets, new Set(visibles.map((t) => t.id)));
    const ongletsVisibles = structure ? new Set(structure.map((o) => o.id)) : null;
    let aLire = visibles;
    let actif;
    if (structure) {
      const demande = onglet === undefined || onglet === null ? undefined : onglet;
      if (demande !== undefined && (typeof demande !== 'string' || !MOTIF_ID.test(demande))) throw new ErreurPilotage('invalid-argument', 'Onglet inconnu.');
      const cible = demande === undefined ? structure[0] : structure.find((o) => o.id === demande); // un onglet absent ou interdit : même réponse, rien ne fuit
      if (demande !== undefined && !cible) throw new ErreurPilotage('invalid-argument', 'Onglet inconnu.');
      if (cible) { const ids = idsDeOnglet(cible); aLire = visibles.filter((t) => ids.has(t.id)); actif = cible.id; } else aLire = [];
    }
    const { tuiles, erreurs } = await lireTuiles(aLire, { avecCache: apercu === undefined || apercu === null, ongletsVisibles });
    return { titre: reglages.tableau.titre ?? '', tuiles, erreurs, ...(structure ? { onglets: structure, onglet: actif ?? null } : {}) };
  }

  /** Enregistre le réglage complet : valide, incrémente `version`, écrit le document ET sa ligne de journal (crm_audit, sans aucune valeur du réglage et sans copie « avant ») dans la même transaction. */
  async function enregistrer({ reglages, acteur, ctx = {} }) {
    const valide = validerReglages(reglages);
    const maintenantDate = new Date(maintenant());
    const acces = donnees();
    const resultat = await acces.transaction(async (tx) => {
      const avant = await tx.document(COLLECTION_PILOTAGE, DOCUMENT_REGLAGES);
      const version = (Number.isInteger(avant?.version) ? avant.version : 0) + 1;
      const apres = { ...valide, version, modifieLe: maintenantDate };
      // Journal SANS aucune valeur du réglage (adresses, groupes, vues, options) et sans copie « avant » : seulement qui, quand, quoi, les versions et le nombre de tuiles.
      // La restauration par l'audit est de toute façon refusée pour cette table (coeur/restaurer.js, COLLECTIONS_RESERVEES_SUPER_ADMINS).
      const operationId = acces.nouvelId(CLE_AUDIT);
      const auditId = acces.nouvelId(CLE_AUDIT);
      const audit = {
        operationId, ordre: 1, date: maintenantDate, acteur, jeton: acteur, via: 'ecran', outil: 'pilotageEnregistrerReglages',
        collection: COLLECTION_PILOTAGE, docId: DOCUMENT_REGLAGES, action: avant ? 'modifier' : 'creer', statut: 'succes', champsModifies: [], parametresRecus: [],
        versionAvant: avant && Number.isInteger(avant.version) ? avant.version : 0, versionApres: version, nombreTuiles: valide.tableau.tuiles.length,
      };
      tx.ecrire([{ type: 'set', collection: COLLECTION_PILOTAGE, id: DOCUMENT_REGLAGES, donnees: apres }, { type: 'set', collection: CLE_AUDIT, id: auditId, donnees: audit }]);
      return { version, tuiles: valide.tableau.tuiles.length };
    });
    return { ok: true, version: resultat.version, tuiles: resultat.tuiles };
  }

  return { lire, enregistrer };
}
