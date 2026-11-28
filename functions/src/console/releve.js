// Relevé horaire de la Console (28/11/2026, phase 2, PR 2) : copie, dans la base du CRM de Jérôme, de la version tamponnée de chaque bâtiment.
// Appelé UNIQUEMENT par la fonction planifiée `consoleReleve` (functions/src/index.js), jamais au chargement du module.
// Bâtiments relevés : le CRM (« os »), l'immeuble (« immeuble ») et chaque maison du registre qui a un projet à lire (`lecture_projet`).
// Pour chacun : lecture de reglages_maison/version DANS le bâtiment (lecture seule, 10 s au plus, toutes en même temps), puis écriture
// dans la base du CRM SEULEMENT : reglages_maison/registre_console/releves/{cle} { version, structure_code, structure_base, version_depuis, dernier_contact_ok, dernier_essai, motif }
// et, si la version ou la structure a changé depuis le relevé précédent (ou au premier relevé), une ligne dans .../releves/{cle}/historique
// { version, de_version, structure_code, de_structure, le }. Jamais de suppression. Exception écrite à « lecture seule d'abord » (docs/console.md) : n'écrit que dans la base de Jérôme.
// Un bâtiment illisible (droit absent, hors ligne, délai dépassé) : seulement dernier_essai et motif « injoignable » ; dernier_contact_ok ne bouge pas ; aucune erreur.
// Déployé aussi dans les maisons (même dossier functions/) : sans immeuble relié (dbApp() rend null), la fonction sort SANS RIEN ÉCRIRE.
// Journal : une ligne, des nombres seulement ; jamais une clé de maison, un nom, un projet ni le message d'une erreur (il peut contenir un identifiant de projet).
import { COLLECTION_VERSION, DOCUMENT_VERSION } from '../coeur/tampon-version.js';
import { COLLECTION_REGISTRE, DOCUMENT_REGISTRE, SOUS_COLLECTION_RELEVES, SOUS_COLLECTION_HISTORIQUE_RELEVES, validerRegistre, lireRegistreBrut } from './registre.js';

export const DELAI_LECTURE_MS = 10_000;
export const MOTIFS_RELEVE = Object.freeze({ injoignable: 'injoignable', sans_tampon: 'sans_tampon' });

const texte40 = (v) => (typeof v === 'string' && v.length >= 1 && v.length <= 40 ? v : null);
const entier = (v) => (Number.isInteger(v) ? v : null);
/** Un horodatage Firestore (objet avec toDate) est recopié tel quel ; tout le reste devient null. */
const horodatageOuNull = (v) => (v && typeof v.toDate === 'function' ? v : null);

/** Une ligne de journal : statut et nombres, jamais de nom. */
export function ligneDeJournalReleve({ statut, batiments, injoignables, nom }) {
  return JSON.stringify({
    severity: statut === 'erreur' ? 'WARNING' : 'INFO', message: `console releve ${statut}`,
    ...(Number.isInteger(batiments) ? { batiments } : {}), ...(Number.isInteger(injoignables) ? { injoignables } : {}), ...(nom ? { nom } : {}),
  });
}

/**
 * Lit reglages_maison/version d'un bâtiment, `delaiMs` au plus. `ouvrir` : () => base (peut lever).
 * Rend { ok: true, fiche: données | null } ou { ok: false } (illisible ou trop lent) ; ne lève jamais.
 */
export async function lireFicheVersion(ouvrir, delaiMs = DELAI_LECTURE_MS) {
  let minuterie;
  try {
    const lecture = (async () => {
      const db = await ouvrir();
      if (!db) throw new Error('base absente');
      const f = await db.collection(COLLECTION_VERSION).doc(DOCUMENT_VERSION).get();
      return { ok: true, fiche: f.exists ? (f.data() ?? null) : null };
    })();
    const delai = new Promise((resoudre) => { minuterie = setTimeout(() => resoudre({ ok: false }), delaiMs); });
    return await Promise.race([lecture.catch(() => ({ ok: false })), delai]);
  } catch {
    return { ok: false };
  } finally {
    clearTimeout(minuterie);
  }
}

/** Référence du relevé d'un bâtiment dans la base du CRM. */
export const refReleve = (dbOs, cle) => dbOs.collection(COLLECTION_REGISTRE).doc(DOCUMENT_REGISTRE).collection(SOUS_COLLECTION_RELEVES).doc(cle);

/**
 * Écrit le relevé d'UN bâtiment dans la base du CRM (transaction). `lecture` : résultat de lireFicheVersion.
 * Rend 'injoignable', 'sans_tampon', 'change' (fiche et historique) ou 'vu' (fiche seulement).
 */
export async function ecrireReleve({ dbOs, cle, lecture, horodatage }) {
  const ref = refReleve(dbOs, cle);
  return dbOs.runTransaction(async (tx) => {
    const instantane = await tx.get(ref);
    const avant = instantane.exists ? (instantane.data() ?? {}) : null;
    if (!lecture?.ok) {
      tx.set(ref, { dernier_essai: horodatage(), motif: MOTIFS_RELEVE.injoignable }, { merge: true });
      return 'injoignable';
    }
    const f = lecture.fiche;
    const version = texte40(f?.version);
    if (!version) {
      tx.set(ref, { dernier_essai: horodatage(), dernier_contact_ok: horodatage(), motif: MOTIFS_RELEVE.sans_tampon }, { merge: true });
      return 'sans_tampon';
    }
    const structure_code = entier(f.structure_code);
    tx.set(ref, {
      version, structure_code, structure_base: entier(f.structure_base), version_depuis: horodatageOuNull(f.version_depuis),
      dernier_contact_ok: horodatage(), dernier_essai: horodatage(), motif: null,
    }, { merge: true });
    const deVersion = typeof avant?.version === 'string' ? avant.version : null;
    const deStructure = Number.isInteger(avant?.structure_code) ? avant.structure_code : null;
    if (deVersion === version && deStructure === structure_code) return 'vu';
    tx.set(ref.collection(SOUS_COLLECTION_HISTORIQUE_RELEVES).doc(), { version, de_version: deVersion, structure_code, de_structure: deStructure, le: horodatage() });
    return 'change';
  });
}

/**
 * Le relevé complet. `dbOs` : () => base du CRM ; `dbApp` : async () => base de l'immeuble ou null ; `ouvrirBase` : (projet) => base d'une maison (application nommée) ;
 * `projetCourant` : identifiant du projet courant (une maison ne peut pas pointer vers lui) ; `projetImmeuble` : projet de l'immeuble lié s'il est connu (idem) ;
 * `horodatage` : () => horodatage serveur.
 * Rend { statut: 'sans_immeuble' | 'ok' | 'erreur', resultats: { [cle]: résultat } } ('erreur' aussi quand une écriture a échoué, comme le journal) ; ne lève jamais.
 */
export async function releverBatiments({ dbOs, dbApp, ouvrirBase, projetCourant = null, projetImmeuble = null, horodatage, delaiMs = DELAI_LECTURE_MS, journal = () => {} }) {
  const noter = (e) => { try { journal(e); } catch { /* le journal ne fait jamais échouer le relevé */ } };
  try {
    const app = await dbApp();
    if (!app) { noter({ statut: 'sans_immeuble' }); return { statut: 'sans_immeuble', resultats: {} }; }
    const os = dbOs();
    let registre = validerRegistre(null);
    try { registre = validerRegistre(await lireRegistreBrut(os), { projetCourant, projetImmeuble }); } catch { /* registre illisible : seulement le CRM et l'immeuble */ }
    const cibles = [['os', () => os], ['immeuble', () => app],
      ...registre.batiments.filter((b) => b.lecture_projet).map((b) => [b.cle, () => ouvrirBase(b.lecture_projet)])];
    const lectures = await Promise.all(cibles.map(async ([cle, ouvrir]) => [cle, await lireFicheVersion(ouvrir, delaiMs)]));
    const resultats = {};
    for (const [cle, lecture] of lectures) {
      try { resultats[cle] = await ecrireReleve({ dbOs: os, cle, lecture, horodatage }); } catch { resultats[cle] = 'erreur'; }
    }
    const valeurs = Object.values(resultats);
    // Même statut dans le journal et dans la valeur rendue : « erreur » dès qu'une écriture a échoué (relecture Fable de la PR 771).
    const statut = valeurs.includes('erreur') ? 'erreur' : 'ok';
    noter({ statut, batiments: valeurs.length, injoignables: valeurs.filter((v) => v === 'injoignable').length });
    return { statut, resultats };
  } catch (e) {
    noter({ statut: 'erreur', nom: String(e?.name ?? 'Error').slice(0, 40) });
    return { statut: 'erreur', resultats: {} };
  }
}
