// Configuration de l'espace pour le serveur MCP : étapes de vente, phases de projet, options et membres, lues dans crm_parametres.
// C'est LA MÊME configuration que celle de l'écran (partage/logique.js : construireConfig) : une seule règle pour les deux.
// `racine` : true = le CRM de Jérôme (valeurs historiques si les documents n'existent pas encore), false = espace client (jeu neutre).
// Par défaut : racine quand l'accès aux données n'a pas de base (serveur de Jérôme), espace client quand il en a une (avecBase, serveur des clients).
// `membres` : membres assignables d'un espace client (le serveur des clients ne lit pas la fiche `clients/<client>` : liste vide, donc aucun choix de « Confiée à »).
//
// Maison d'un client (26/11/2026, suite de la PR 700 côté écran) : un projet Google « maison » d'un client fait tourner le MÊME code que le CRM de Jérôme
// (données à la racine, sans base). La fiche reglages_maison/ecran y porte `configuration_crm: 'neutre'` : comme l'écran (js/modules/crm/donnees.js, configJerome()),
// le serveur prend alors la configuration NEUTRE (étapes, phases, réglages de départ neutres) et les membres de la maison (personnes de la fiche `ecran`),
// jamais ceux de Jérôme. Champ absent, autre valeur, fiche absente ou illisible : comportement d'avant (configuration de Jérôme), inchangé chez lui.
// La fiche est lue par le même accès aux données (SDK d'administration, racine du projet), avec un cache court par processus ; elle n'est jamais lue avec une base
// (plateforme des clients : la configuration y est déjà neutre, par espace).
import * as L from '../../partage/logique.js';
import { COLLECTIONS as C } from './donnees.js';

export const COLLECTION_REGLAGES_MAISON = 'reglages_maison';
export const DOCUMENT_ECRAN = 'ecran';
export const DUREE_CACHE_ECRAN_MS = 60_000;

const norm = (email) => (typeof email === 'string' ? email.trim().toLowerCase() : '');

/**
 * Lit reglages_maison/ecran et rend `{ neutre, membres }` : `neutre` vrai seulement pour `configuration_crm === 'neutre'` (valeur exacte, comme l'écran) ;
 * `membres` : les personnes de la fiche, sous la forme de l'écran ({ id: e-mail, libelle: nom, email }), entrées mal formées ignorées.
 * Fiche absente ou illisible : `{ neutre: false, membres: [] }` (comportement d'avant).
 */
export function configurationEcran(fiche) {
  if (!fiche || typeof fiche !== 'object' || fiche.configuration_crm !== 'neutre') return { neutre: false, membres: [] };
  const personnes = Array.isArray(fiche.personnes) ? fiche.personnes : [];
  const membres = personnes
    .filter((p) => p && typeof p === 'object' && norm(p.email))
    .map((p) => ({ id: norm(p.email), libelle: typeof p.nom === 'string' && p.nom.trim() ? p.nom.trim() : norm(p.email), email: norm(p.email) }));
  return { neutre: true, membres };
}

// Cache du PROCESSUS (une instance de fonction sert une seule maison, et l'accès sans base est toujours la racine de son projet) : un nouvel objet `donnees`
// est fabriqué à chaque requête (compterLectures du MCP, creerAccesFirestore de la porte), il ne peut donc pas servir de clé (relecture Fable de la PR 704).
// `fiche` : la dernière fiche lue avec succès (« fiche absente » est un succès, fiche null) ; `expire` : fin de sa fraîcheur. UNE lecture sert la configuration ET les modules.
let cache = null;

/** RÉSERVÉ AUX ESSAIS (tests/) : oublie la fiche gardée en mémoire. */
export function viderCacheConfigurationMaison() { cache = null; }

/**
 * La fiche reglages_maison/ecran, cache de 60 s pour tout le processus. Rend `{ fiche, connue: true }` ; erreur de lecture : la DERNIÈRE fiche connue, même expirée,
 * sinon `{ fiche: null, connue: false }`. Une erreur n'est jamais gardée : la lecture est retentée au prochain appel.
 */
async function lireFicheEcran(donnees, maintenant) {
  const t = maintenant();
  if (cache && cache.expire > t) return { fiche: cache.fiche, connue: true };
  let fiche;
  try { fiche = await donnees.document(COLLECTION_REGLAGES_MAISON, DOCUMENT_ECRAN); } catch { return cache ? { fiche: cache.fiche, connue: true } : { fiche: null, connue: false }; }
  cache = { fiche: fiche ?? null, expire: t + DUREE_CACHE_ECRAN_MS };
  return { fiche: cache.fiche, connue: true };
}

/**
 * La maison demande-t-elle la configuration neutre ? Lecture par `donnees` (sans base), cache de 60 s pour tout le processus.
 * Erreur de lecture : la DERNIÈRE valeur connue, même expirée (une maison neutre reste neutre pendant une panne) ; sans valeur connue, comportement d'avant.
 * Une erreur n'est jamais gardée : la lecture est retentée au prochain appel.
 */
export async function lireConfigurationMaison(donnees, { maintenant = Date.now } = {}) {
  if (!donnees || donnees.base) return { neutre: false, membres: [] };
  const { fiche } = await lireFicheEcran(donnees, maintenant);
  return configurationEcran(fiche);
}

/**
 * Le choix « configuration de Jérôme ou neutre » pour cet appel, le même que l'écran : `racine` donné = gardé tel quel ; sinon racine quand il n'y a pas de base,
 * SAUF dans une maison neutre (racine faux, membres = personnes de la maison). Rend `{ racine, membres }`.
 */
export async function choixConfiguration(donnees, { racine, membres = null } = {}) {
  if (typeof racine === 'boolean') return { racine, membres };
  if (donnees.base) return { racine: false, membres };
  const maison = await lireConfigurationMaison(donnees);
  return maison.neutre ? { racine: false, membres: membres ?? maison.membres } : { racine: true, membres };
}

// Modules de la maison pour le serveur MCP (26/11/2026, chantier « Achats par l'assistant ») : la valeur BRUTE du champ `modules` de reglages_maison/ecran,
// lue INDÉPENDAMMENT de `configuration_crm` (une maison « Achats seulement » n'est pas forcément neutre). Même fiche et MÊME cache de 60 s par processus (une seule lecture) :
// trois cas distincts, `absent` (pas de fiche, ou fiche sans le champ : comportement d'avant, tous les outils), `present` (le champ existe, quelle que soit sa valeur)
// et `indisponible` (lecture en échec SANS valeur connue : l'appelant refuse, il ne devine jamais). Sur une erreur de lecture, la dernière valeur connue sert, même expirée.
// Jamais lu avec une base (plateforme des clients) : `absent`.
/** Rend `{ etat: 'absent' | 'present' | 'indisponible', brut }` (brut : la valeur du champ quand il est présent). */
export async function lireModulesEcran(donnees, { maintenant = Date.now } = {}) {
  if (!donnees || donnees.base) return { etat: 'absent', brut: undefined };
  const { fiche, connue } = await lireFicheEcran(donnees, maintenant);
  if (!connue) return { etat: 'indisponible', brut: undefined };
  const brut = fiche && typeof fiche === 'object' ? fiche.modules : undefined;
  return brut === undefined || brut === null ? { etat: 'absent', brut: undefined } : { etat: 'present', brut };
}

export async function lireConfig(donnees, { racine, membres = null } = {}) {
  const choix = await choixConfiguration(donnees, { racine, membres });
  const [etapes, phases, reglages] = await Promise.all(['etapes', 'phases', 'reglages'].map((id) => donnees.document(C.parametres, id)));
  return L.construireConfig({ etapes, phases, reglages: L.reglagesEffectifs(reglages, { racine: choix.racine }) }, choix);
}
