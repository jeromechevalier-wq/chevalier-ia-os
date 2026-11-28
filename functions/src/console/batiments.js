// Lecture des bâtiments pour l'écran de la Console (28/11/2026, phase 2, PR 2) : `consoleBatiments` (Jérôme seul : le contrôle d'identité est dans console/appel.js).
// Lit, sans jamais écrire : le registre privé (base du CRM), les appartements de l'immeuble (collection `clients` : nom et modules actifs) et les relevés
// copiés chaque heure par `consoleReleve` (base du CRM). Une partie illisible donne une partie vide et un motif lisible, jamais une erreur pour tout l'écran.
// Tout est filtré et borné : textes de 80 caractères au plus, 30 appartements, 20 maisons, 10 lignes d'historique par bâtiment.
import { MOTIF_IDENTIFIANT_CLIENT } from '../../partage/automatisations/etiquettes.js';
import { modulesActifsDuClient } from '../../partage/registre.js';
import { validerRegistre, lireRegistreBrut, texteBorne, SOUS_COLLECTION_HISTORIQUE_RELEVES } from './registre.js';
import { refReleve, DELAI_LECTURE_MS } from './releve.js';

export const MAX_APPARTEMENTS = 30;
export const NB_HISTORIQUE_RELEVES = 10;
export const MOTIFS_BATIMENTS = Object.freeze({
  registre: 'registre illisible pour l\'instant',
  immeuble_non_relie: 'immeuble non relié',
  appartements: 'appartements illisibles pour l\'instant',
  releves: 'relevés illisibles pour l\'instant',
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
const texte40 = (v) => (typeof v === 'string' && v.length <= 40 ? v : null);
const entier = (v) => (Number.isInteger(v) ? v : null);
const MOTIFS_RELEVE_CONNUS = ['injoignable', 'sans_tampon'];

/**
 * `promesse`, ou une erreur « délai dépassé » après `delaiMs` (même règle que lireFicheVersion de releve.js : 10 s au plus, minuterie toujours nettoyée).
 * L'appelant transforme l'erreur en partie vide et motif ; rien n'est jamais levé pour tout l'écran.
 */
export async function avecDelai(promesse, delaiMs = DELAI_LECTURE_MS) {
  let minuterie;
  const delai = new Promise((_, rejeter) => { minuterie = setTimeout(() => rejeter(new Error('délai dépassé')), delaiMs); });
  try {
    return await Promise.race([Promise.resolve(promesse), delai]);
  } finally {
    clearTimeout(minuterie);
  }
}

/** Appartements de l'immeuble : { appartements: [{ id, nom, modules }], total } (identifiants triés, ceux qui ne passent pas le motif ignorés). */
export async function lireAppartements(dbApp, max = MAX_APPARTEMENTS) {
  const ids = (await dbApp.collection('clients').listDocuments()).map((r) => r.id).filter((id) => MOTIF_IDENTIFIANT_CLIENT.test(id)).sort();
  const retenus = ids.slice(0, max);
  const fiches = retenus.length ? await dbApp.getAll(...retenus.map((id) => dbApp.doc(`clients/${id}`)), { fieldMask: ['nom', 'modules'] }) : [];
  return {
    total: ids.length,
    appartements: retenus.map((id, i) => {
      const d = fiches[i]?.exists ? (fiches[i].data() ?? {}) : {};
      let modules = [];
      try { modules = modulesActifsDuClient({ modules: d.modules }).actifs.slice(0, 40); } catch { modules = []; }
      return { id, nom: texteBorne(d.nom) ?? id, modules };
    }),
  };
}

/** Le dernier relevé d'un bâtiment et ses 10 dernières lignes d'historique (le plus récent en premier), ou null s'il n'y en a pas. */
export async function lireReleve(dbOs, cle) {
  const ref = refReleve(dbOs, cle);
  const [f, lignes] = await Promise.all([ref.get(), ref.collection(SOUS_COLLECTION_HISTORIQUE_RELEVES).orderBy('le', 'desc').limit(NB_HISTORIQUE_RELEVES).get()]);
  if (!f.exists) return null;
  const d = f.data() ?? {};
  return {
    version: texte40(d.version), structure_code: entier(d.structure_code), structure_base: entier(d.structure_base),
    version_depuis: iso(d.version_depuis), dernier_contact_ok: iso(d.dernier_contact_ok), dernier_essai: iso(d.dernier_essai),
    motif: MOTIFS_RELEVE_CONNUS.includes(d.motif) ? d.motif : null,
    historique: lignes.docs.map((l) => {
      const h = l.data() ?? {};
      return { version: texte40(h.version), de_version: texte40(h.de_version), structure_code: entier(h.structure_code), de_structure: entier(h.de_structure), le: iso(h.le) };
    }),
  };
}

/**
 * Tout ce que l'écran montre. `dbOs` : () => base du CRM ; `dbApp` : async () => base de l'immeuble ou null ; `projetCourant` : identifiant du projet courant ;
 * `projetImmeuble` : projet de l'immeuble lié s'il est connu (une maison ne peut pas pointer vers lui) ; `delaiMs` : délai des lectures des appartements et des relevés (10 s).
 * Rend { os: { projets }, immeuble: { projets, appartements, total_appartements }, maisons: [{ cle, nom, etat, projets }], releves: { [cle]: relevé }, motifs }.
 * Jamais le projet à lire d'une maison dans la réponse.
 */
export async function lireBatimentsConsole({ dbOs, dbApp, projetCourant = null, projetImmeuble = null, delaiMs = DELAI_LECTURE_MS }) {
  const motifs = [];
  let os = null;
  try { os = dbOs(); } catch { os = null; }
  let registre = validerRegistre(null);
  try {
    if (!os) throw new Error('base absente');
    registre = validerRegistre(await lireRegistreBrut(os), { projetCourant, projetImmeuble });
  } catch { motifs.push(MOTIFS_BATIMENTS.registre); }
  motifs.push(...registre.motifs.slice(0, 20));

  let appartements = [];
  let total = 0;
  try {
    const app = await avecDelai(dbApp(), delaiMs);
    if (!app) motifs.push(MOTIFS_BATIMENTS.immeuble_non_relie);
    else ({ appartements, total } = await avecDelai(lireAppartements(app), delaiMs));
  } catch { motifs.push(MOTIFS_BATIMENTS.appartements); appartements = []; total = 0; }

  const maisons = registre.batiments.map((b) => ({ cle: b.cle, nom: b.nom, etat: b.etat, projets: b.projets }));
  const releves = {};
  if (os) {
    try {
      const cles = ['os', 'immeuble', ...maisons.map((m) => m.cle)];
      const lus = await avecDelai(Promise.all(cles.map((cle) => lireReleve(os, cle))), delaiMs);
      cles.forEach((cle, i) => { if (lus[i]) releves[cle] = lus[i]; });
    } catch { motifs.push(MOTIFS_BATIMENTS.releves); }
  }
  return {
    os: { projets: registre.projets_os },
    immeuble: { projets: registre.projets_immeuble, appartements, total_appartements: total },
    maisons, releves, motifs,
  };
}
