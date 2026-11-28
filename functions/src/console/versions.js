// Console, phase 2 (28/11/2026) : lecture des versions des bâtiments, pour `consoleVersions` (Jérôme seul : le contrôle d'identité est dans console/appel.js).
// Chaque bâtiment se tamponne lui-même toutes les heures (coeur/tampon-version.js) dans reglages_maison/version ; ici on LIT seulement, jamais d'écriture.
// Bâtiments lus en PR 1 : le CRM de Jérôme (« os ») et l'immeuble des clients (« immeuble »). Les maisons des clients viendront ensuite.
// Une lecture qui échoue donne « inconnu » avec un motif lisible pour CE bâtiment, jamais une erreur pour tout l'écran. Jamais de nom de projet dans la réponse.
import { COLLECTION_VERSION, DOCUMENT_VERSION, SOUS_COLLECTION_HISTORIQUE } from '../coeur/tampon-version.js';

export const NB_HISTORIQUE = 10;
export const MOTIFS = Object.freeze({
  non_relie: 'immeuble non relié',
  sans_tampon: 'pas encore de tampon',
  illisible: 'lecture impossible pour l\'instant',
});

/** Horodatage Firestore (toDate), Date ou texte : texte ISO, ou null. */
function iso(valeur) {
  if (!valeur) return null;
  try {
    const d = typeof valeur.toDate === 'function' ? valeur.toDate() : valeur instanceof Date ? valeur : new Date(valeur);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  } catch {
    return null;
  }
}
const texte = (v) => (typeof v === 'string' && v.length <= 40 ? v : null);
const entier = (v) => (Number.isInteger(v) ? v : null);

/** États d'un bâtiment, comparés à la version de version.json du serveur qui répond (`reference`). */
export function etatsBatiment({ version, structure_code, structure_base }, reference) {
  const etat_version = !version ? 'inconnu' : version === reference ? 'a_jour' : 'en_retard';
  const etat_structure = structure_base === null || structure_code === null ? 'inconnu' : structure_base === structure_code ? 'a_jour' : 'en_retard';
  return { etat_version, etat_structure };
}

const vide = (cle, motif) => ({
  cle, version: null, depuis: null, vu_le: null, structure_code: null, structure_base: null, etat_version: 'inconnu', etat_structure: 'inconnu', motif, historique: [],
});

/** Lit un bâtiment. `db` : base Firestore (SDK d'administration) ou null (« immeuble non relié »). */
export async function lireBatiment(cle, db, reference) {
  if (!db) return vide(cle, MOTIFS.non_relie);
  try {
    const fiche = db.collection(COLLECTION_VERSION).doc(DOCUMENT_VERSION);
    const [instantane, lignes] = await Promise.all([
      fiche.get(),
      fiche.collection(SOUS_COLLECTION_HISTORIQUE).orderBy('le', 'desc').limit(NB_HISTORIQUE).get(),
    ]);
    if (!instantane.exists) return vide(cle, MOTIFS.sans_tampon);
    const d = instantane.data() ?? {};
    const champs = { version: texte(d.version), structure_code: entier(d.structure_code), structure_base: entier(d.structure_base) };
    return {
      cle,
      ...champs,
      depuis: iso(d.version_depuis),
      vu_le: iso(d.vu_le),
      ...etatsBatiment(champs, reference),
      motif: champs.version ? null : MOTIFS.sans_tampon,
      historique: lignes.docs.map((l) => { const h = l.data() ?? {}; return { version: texte(h.version), de_version: texte(h.de_version), le: iso(h.le) }; }),
    };
  } catch {
    return vide(cle, MOTIFS.illisible);
  }
}

/**
 * Lit tous les bâtiments. `dbOs` : () => base du CRM ; `dbApp` : async () => base de l'immeuble ou null ; `reference` : version de version.json (ou null).
 * Rend { version_reference, batiments: [os, immeuble] }.
 */
export async function lireVersionsBatiments({ dbOs, dbApp, reference }) {
  const base = async (f) => { try { return await f(); } catch { return undefined; } };
  const [os, app] = await Promise.all([base(dbOs), base(dbApp)]);
  const batiments = await Promise.all([
    os === undefined ? vide('os', MOTIFS.illisible) : lireBatiment('os', os, reference),
    app === undefined ? vide('immeuble', MOTIFS.illisible) : lireBatiment('immeuble', app, reference),
  ]);
  return { version_reference: reference ?? null, batiments };
}
