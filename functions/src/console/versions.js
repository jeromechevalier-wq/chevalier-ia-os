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

/** Au-delà de ce retard, un tampon horaire est considéré comme arrêté (3 heures). */
export const TAMPON_MUET_MS = 3 * 3_600_000;

/** « 28/11/2026 à 10:00 », à l'heure de Paris. */
export function dateLisible(isoTexte) {
  const d = new Date(isoTexte);
  const jour = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);
  const heure = new Intl.DateTimeFormat('fr-FR', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit' }).format(d);
  return `${jour} à ${heure}`;
}

/**
 * États d'un bâtiment, comparés à la version de version.json du serveur qui répond (`reference`).
 * - version ou référence absente : 'inconnu' ;
 * - `vu_le` vieux de plus de 3 heures (`maintenant`) : 'inconnu', motif « le tampon ne répond plus depuis le … » ;
 * - bâtiment courant (`courant`, le CRM) en retard alors que son dernier tampon est antérieur au démarrage de l'instance qui répond (`demarrage`) :
 *   'en_attente' (une fusion vient d'être déployée, le prochain tampon horaire arrive dans moins d'une heure).
 * Rend { etat_version, etat_structure, motif } (motif null si rien à dire).
 */
export function etatsBatiment({ version, structure_code, structure_base, vu_le }, reference, { maintenant = Date.now(), demarrage = null, courant = false } = {}) {
  const etat_structure = structure_base == null || structure_code == null ? 'inconnu' : structure_base === structure_code ? 'a_jour' : 'en_retard';
  const vu = vu_le ? Date.parse(vu_le) : NaN;
  if (!version || !reference) return { etat_version: 'inconnu', etat_structure, motif: null };
  if (Number.isFinite(vu) && maintenant - vu > TAMPON_MUET_MS) return { etat_version: 'inconnu', etat_structure, motif: `le tampon ne répond plus depuis le ${dateLisible(vu_le)}` };
  if (version === reference) return { etat_version: 'a_jour', etat_structure, motif: null };
  if (courant && Number.isFinite(vu) && Number.isFinite(demarrage) && vu < demarrage) return { etat_version: 'en_attente', etat_structure, motif: null };
  return { etat_version: 'en_retard', etat_structure, motif: null };
}

const vide = (cle, motif) => ({
  cle, version: null, depuis: null, vu_le: null, structure_code: null, structure_base: null, etat_version: 'inconnu', etat_structure: 'inconnu', motif, historique: [],
});

/**
 * Lit un bâtiment. `db` : base Firestore (SDK d'administration) ou null (« immeuble non relié »).
 * `options` : { maintenant, demarrage, courant } (voir etatsBatiment).
 */
export async function lireBatiment(cle, db, reference, options = {}) {
  if (!db) return vide(cle, MOTIFS.non_relie);
  try {
    const fiche = db.collection(COLLECTION_VERSION).doc(DOCUMENT_VERSION);
    const [instantane, lignes] = await Promise.all([
      fiche.get(),
      fiche.collection(SOUS_COLLECTION_HISTORIQUE).orderBy('le', 'desc').limit(NB_HISTORIQUE).get(),
    ]);
    if (!instantane.exists) return vide(cle, MOTIFS.sans_tampon);
    const d = instantane.data() ?? {};
    const champs = { version: texte(d.version), structure_code: entier(d.structure_code), structure_base: entier(d.structure_base), vu_le: iso(d.vu_le) };
    const etats = etatsBatiment(champs, reference, options);
    return {
      cle,
      ...champs,
      depuis: iso(d.version_depuis),
      etat_version: etats.etat_version,
      etat_structure: etats.etat_structure,
      motif: champs.version ? etats.motif : MOTIFS.sans_tampon,
      historique: lignes.docs.map((l) => {
        const h = l.data() ?? {};
        return { version: texte(h.version), de_version: texte(h.de_version), structure_code: entier(h.structure_code), de_structure: entier(h.de_structure), le: iso(h.le) };
      }),
    };
  } catch {
    return vide(cle, MOTIFS.illisible);
  }
}

/**
 * Lit tous les bâtiments. `dbOs` : () => base du CRM ; `dbApp` : async () => base de l'immeuble ou null ; `reference` : version de version.json (ou null).
 * `maintenant` : heure de la lecture ; `demarrage` : heure de démarrage de l'instance qui répond (le CRM est le bâtiment courant).
 * Rend { version_reference, batiments: [os, immeuble] }.
 */
export async function lireVersionsBatiments({ dbOs, dbApp, reference, maintenant = Date.now(), demarrage = null }) {
  const base = async (f) => { try { return await f(); } catch { return undefined; } };
  const [os, app] = await Promise.all([base(dbOs), base(dbApp)]);
  const batiments = await Promise.all([
    os === undefined ? vide('os', MOTIFS.illisible) : lireBatiment('os', os, reference, { maintenant, demarrage, courant: true }),
    app === undefined ? vide('immeuble', MOTIFS.illisible) : lireBatiment('immeuble', app, reference, { maintenant }),
  ]);
  return { version_reference: reference ?? null, batiments };
}
