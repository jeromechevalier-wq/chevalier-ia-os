// Module Pilotage : le service (le même code sert la fonction `pilotageLire`, `pilotageEnregistrerReglages` et le script d'essai `scripts/pilotage-essai.js`).
// L'AUTHENTIFICATION est faite par l'appel (appel.js) ; ici : qui voit quelle tuile, lecture des vues par UNE connexion, cache court, enregistrement du réglage avec sa ligne de journal.
// Règles du contrat :
//  - une tuile interdite à l'appelant n'est JAMAIS lue dans la base, ni renvoyée, ni mentionnée (pas même son id dans `erreurs`) ;
//  - `erreurs` ne porte que des tuiles visibles, avec une phrase générique : jamais un message de la base ;
//  - une tuile en erreur reste dans `tuiles` avec `lignes: []` (l'écran peut montrer son titre et l'erreur) ;
//  - le nom de vue ne vient QUE du réglage enregistré (ou, en `apercu`, du brouillon de Jérôme) : jamais d'un paramètre libre du navigateur ;
//  - l'aperçu (brouillon de Jérôme) montre toutes les tuiles du brouillon (c'est lui qui règle les droits) et n'utilise pas le cache.
import { journal as ligneDeJournal } from '../coeur/devis.js';
import { analyserOption, construireSql, tuileVisible, validerReglages, ErreurPilotage } from './reglages.js';
import { ErreurPostgres } from './postgres.js';

export const COLLECTION_PILOTAGE = 'pilotage_parametres';
export const DOCUMENT_REGLAGES = 'reglages';
export const DUREE_CACHE_MS = 60_000;
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

/**
 * `donnees` : fonction qui rend l'accès Firestore (creerAccesFirestore) ; `connecter` : `ouvrir()` de postgres.js ; `journalErreur` : (type, etat) pour le journal du serveur (jamais de valeur).
 */
export function creerServicePilotage({ donnees, connecter, maintenant = Date.now, dureeCacheMs = DUREE_CACHE_MS, journalErreur = () => {} }) {
  const cache = new Map(); // sql -> { jusqua, lignes }

  async function lireReglagesEnregistres() {
    const doc = await donnees().document(COLLECTION_PILOTAGE, DOCUMENT_REGLAGES);
    if (!doc) return null;
    try { return { ...doc, ...validerReglages(doc) }; } catch { throw new ErreurPilotage('failed-precondition', 'Le réglage enregistré est invalide : enregistre-le à nouveau depuis les réglages de Pilotage.'); }
  }

  async function lireTuiles(tuiles, { avecCache }) {
    const erreurs = [];
    let connexion = null; // une seule connexion par appel, ouverte à la première lecture nécessaire
    const obtenir = () => { connexion ??= connecter(); return connexion; };
    const lireUne = async (t) => {
      let option;
      let sql;
      try { option = analyserOption(t.option, 'option'); sql = construireSql(t); } catch { erreurs.push({ id: t.id, message: MESSAGE_TUILE }); return { id: t.id, titre: t.titre, option: {}, lignes: [] }; }
      if (avecCache) {
        const c = cache.get(sql);
        if (c && c.jusqua > maintenant()) return { id: t.id, titre: t.titre, option, lignes: c.lignes };
      }
      try {
        const lignes = nettoyerLignes(await (await obtenir()).interroger(sql));
        if (avecCache) {
          if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
          cache.set(sql, { jusqua: maintenant() + dureeCacheMs, lignes });
        }
        return { id: t.id, titre: t.titre, option, lignes };
      } catch (e) {
        journalErreur(e instanceof ErreurPostgres ? e.type : 'inconnue', e?.etat);
        erreurs.push({ id: t.id, message: MESSAGE_TUILE });
        return { id: t.id, titre: t.titre, option, lignes: [] };
      }
    };
    try {
      const resultat = await Promise.all(tuiles.map(lireUne));
      return { tuiles: resultat, erreurs };
    } finally {
      // fermeture garantie, même si une lecture a échoué ; une connexion qui n'a pas pu s'ouvrir n'a rien à fermer
      if (connexion) { try { await (await connexion).fermer(); } catch { /* connexion jamais ouverte */ } }
    }
  }

  /** `{ email, apercu?, exporter? }` : les droits de `apercu` et `exporter` sont contrôlés par l'appel (Jérôme seul). */
  async function lire({ email, apercu, exporter } = {}) {
    if (exporter === true) {
      const doc = await lireReglagesEnregistres();
      return { reglages: doc ? documentPublic(doc) : null };
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
    const { tuiles, erreurs } = await lireTuiles(visibles, { avecCache: apercu === undefined || apercu === null });
    return { titre: reglages.tableau.titre ?? '', tuiles, erreurs };
  }

  /** Enregistre le réglage complet : valide, incrémente `version`, écrit le document ET sa ligne de journal (crm_audit + copie avant/après) dans la même transaction. */
  async function enregistrer({ reglages, acteur, ctx = {} }) {
    const valide = validerReglages(reglages);
    const maintenantDate = new Date(maintenant());
    const acces = donnees();
    const resultat = await acces.transaction(async (tx) => {
      const avant = await tx.document(COLLECTION_PILOTAGE, DOCUMENT_REGLAGES);
      const version = (Number.isInteger(avant?.version) ? avant.version : 0) + 1;
      const apres = { ...valide, version, modifieLe: maintenantDate };
      const { ecritures } = ligneDeJournal({
        donnees: acces, ctx: { acteur, via: 'ecran', maintenant: maintenantDate, ...ctx }, outil: 'pilotageEnregistrerReglages', parametres: {},
        changements: [{ collection: COLLECTION_PILOTAGE, id: DOCUMENT_REGLAGES, action: avant ? 'modifier' : 'creer', avant: avant ?? {}, apres, champs: ['groupes', 'tableau', 'version', 'modifieLe'] }],
      });
      tx.ecrire([{ type: 'set', collection: COLLECTION_PILOTAGE, id: DOCUMENT_REGLAGES, donnees: apres }, ...ecritures]);
      return { version, tuiles: valide.tableau.tuiles.length };
    });
    return { ok: true, version: resultat.version, tuiles: resultat.tuiles };
  }

  return { lire, enregistrer };
}
