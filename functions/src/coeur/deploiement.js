// Page « Déploiement » des Réglages (25/10/2026) : ce que le SERVEUR peut contrôler pour un espace (chez Jérôme comme chez un client), sans rien modifier.
// Code commun aux deux projets : functions/ l'utilise tel quel, functions-plateforme/ le reçoit dans serveur/src/coeur/ (copie de scripts/preparer-fonctions.js).
// La réponse ne contient QUE des états fixes (ok / manque / inconnu) et la version du serveur : jamais d'adresse e-mail, de nom de dossier, de chemin de stockage,
// de nom ni de valeur de secret. Chaque contrôle est isolé : s'il plante, il vaut « inconnu » et les autres continuent.

export const ETATS_CONTROLE = Object.freeze(['ok', 'manque', 'inconnu']);

/**
 * Contrôles faits par le serveur, dans l'ordre. `fonctions` : la fonction a répondu ; `membres` : la liste des personnes autorisées est cohérente ;
 * `pdf-stockage` : le stockage où sont rangés les PDF des devis répond ; `pdf-fonctions` : ce serveur connaît les fonctions du PDF des devis (`devisPdf`, `devisPdfLien`, `devisPdfAuto`) ; un déploiement partiel (ex. Eventarc refuse `devisPdfAuto`) n'est PAS détecté : vérifier dans la console Cloud Functions.
 */
export const CONTROLES_SERVEUR = Object.freeze(['fonctions', 'membres', 'pdf-stockage', 'pdf-fonctions']);

const MOTIF_VERSION = /^\d{1,4}\.\d{1,4}\.\d{1,6}$/;

/**
 * Exécute les contrôles `{ id: async () => boolean }` un par un, chacun dans son propre try/catch.
 * Rend `{ id: 'ok' | 'manque' | 'inconnu' }` pour chaque identifiant de CONTROLES_SERVEUR (un contrôle absent vaut « inconnu »).
 */
export async function executerControles(controles = {}) {
  const resultats = {};
  for (const id of CONTROLES_SERVEUR) {
    const controle = controles[id];
    if (typeof controle !== 'function') { resultats[id] = 'inconnu'; continue; }
    try {
      const r = await controle();
      resultats[id] = r === true ? 'ok' : r === false ? 'manque' : 'inconnu';
    } catch {
      resultats[id] = 'inconnu';
    }
  }
  return resultats;
}

/** Réponse publique : la version (seulement si elle a la forme 1.2.3) et les états. Rien d'autre ne sort. */
export function reponseDeploiement({ version, resultats }) {
  const controles = {};
  for (const id of CONTROLES_SERVEUR) controles[id] = ETATS_CONTROLE.includes(resultats?.[id]) ? resultats[id] : 'inconnu';
  return { ok: true, version: typeof version === 'string' && MOTIF_VERSION.test(version) ? version : 'inconnue', controles };
}

/** Lance les contrôles et rend la réponse publique. */
export async function verifierDeploiement({ version, controles }) {
  return reponseDeploiement({ version, resultats: await executerControles(controles) });
}

/**
 * Les personnes autorisées d'un espace client sont-elles bien enregistrées ? Deux listes doivent dire la même chose :
 * `equipe` (copie dans la fiche du client, lue par l'écran) et `membres` (fiches d'appartenance, lues par les règles de la base).
 * Vrai si les deux listes ont les mêmes adresses avec les mêmes rôles (sans tenir compte de la casse) et au moins un éditeur.
 * `equipe` : [{ email, role }] ; `membres` : [{ id (adresse), role }].
 */
export function membresCoherents(equipe, membres) {
  if (!Array.isArray(equipe) || !Array.isArray(membres)) return false;
  const cle = (email, role) => `${String(email ?? '').trim().toLowerCase()}|${role}`;
  const a = equipe.map((m) => cle(m?.email, m?.role)).sort();
  const b = membres.map((m) => cle(m?.id, m?.role)).sort();
  if (!a.length || a.length !== b.length || a.some((x, i) => x !== b[i])) return false;
  return membres.some((m) => m?.role === 'editeur');
}

/**
 * Le stockage des PDF répond-il ? `bucket` : l'objet de firebase-admin. Prouve seulement que le bucket existe et se liste (le préfixe `devis/` n'existe pas tel quel sur la plateforme,
 * où les PDF sont sous `clients/<client>/devis/`). Faux si le stockage n'existe pas (404) ; toute autre erreur (droit refusé, réseau, délai de `delaiMs` dépassé) est relancée :
 * le contrôle vaudra « inconnu » (orange), jamais un faux rouge. Rien n'est écrit, aucun nom de fichier ne sort.
 */
export async function stockageRepond(bucket, { delaiMs = 5000 } = {}) {
  if (!bucket || typeof bucket.getFiles !== 'function') return false;
  let minuteur;
  const delai = new Promise((_, rejeter) => { minuteur = setTimeout(() => rejeter(new Error('Stockage : délai dépassé.')), delaiMs); });
  try {
    await Promise.race([bucket.getFiles({ prefix: 'devis/', maxResults: 1, autoPaginate: false }), delai]);
    return true;
  } catch (e) {
    if (e?.code === 404) return false;
    throw e;
  } finally { clearTimeout(minuteur); }
}
