// Jetons des clients MCP : format, empreinte, lecture du secret, recherche à temps constant, droits par profil.
// Aucune dépendance sauf node:crypto et clients/config.js (lui-même sans dépendance) : le script outils/creer-jeton.js importe aussi ce fichier.
import { createHash, timingSafeEqual } from 'node:crypto';
import { FORMAT_CLIENT } from '../clients/config.js'; // fichier sans dépendance

/** Profils permis à un jeton fixe LIÉ À UN CLIENT (secret MCP_JETONS_CLIENTS) : lecture, la liste blanche du bot de devis (agent-devis) ou celle du bot qui modifie aussi un devis existant (assistant-devis). Jamais ecriture, complet ni suppression. */
export const PROFILS_JETON_CLIENT = Object.freeze(['lecture', 'agent-devis', 'assistant-devis']);
/** Préfixes réservés aux acteurs des connexions OAuth (acteurClient) : un jeton de client ne peut pas les porter (même clé de plafonds « <client>__<acteur> »). */
export const PREFIXES_RESERVES_OAUTH = Object.freeze(['claude-ai-', 'chatgpt-']);

/** Profils : lecture (lecture seule), ecriture (lire, créer, modifier ; jamais supprimer, restaurer ni finaliser), agent-devis (liste blanche : créer le client et le devis, finaliser avec aperçu + code, préparer l'e-mail), assistant-devis (les 21 outils d'agent-devis + modifier les lignes d'un brouillon, annuler la dernière modification, créer une nouvelle version), complet (tout). */
export const PROFILS = ['lecture', 'ecriture', 'agent-devis', 'assistant-devis', 'complet'];
/** Anciens noms, valables pour toujours : les jetons déjà déclarés dans MCP_JETONS ne sont jamais à réécrire. */
export const ALIAS_PROFILS = Object.freeze({ lecteur: 'lecture', bibliothecaire: 'ecriture', 'claude-code': 'complet' });
/** Nom canonique d'un profil (nouveau nom ou ancien alias), ou null si inconnu. Seul point d'entrée des alias. */
export function profilCanonique(nom) {
  if (typeof nom !== 'string') return null;
  if (PROFILS.includes(nom)) return nom;
  return Object.hasOwn(ALIAS_PROFILS, nom) ? ALIAS_PROFILS[nom] : null;
}

/** « cia_ » suivi de 256 bits en base64url (43 caractères). */
export const FORMAT_JETON = /^cia_[A-Za-z0-9_-]{43}$/;
const FORMAT_NOM = /^[a-z0-9][a-z0-9-]{1,40}$/;
const FORMAT_EMPREINTE = /^[0-9a-f]{64}$/;

export const empreinte = (jeton) => createHash('sha256').update(jeton, 'utf8').digest('hex');

/** Valeur de l'en-tête « Authorization: Bearer … », ou null. */
export function extraireBearer(entete) {
  if (typeof entete !== 'string') return null;
  const m = /^Bearer ([^\s]+)$/.exec(entete.trim());
  return m ? m[1] : null;
}

/**
 * Lit le contenu du secret MCP_JETONS : un tableau JSON, ou une entrée JSON par ligne.
 * Une entrée mal formée est ignorée (le jeton correspondant est donc refusé) et comptée dans `invalides`.
 * Entrée valide : { jeton, acteur, profil, empreinte, actif, limites?, client? } ; `limites` (facultatif) règle les plafonds du jeton (voir limites.js).
 * `client` (facultatif) lie le jeton à UN client de la plateforme (MCP_JETONS_CLIENTS) : il doit avoir le format d'un client, un profil de
 * PROFILS_JETON_CLIENT et un nom hors des préfixes OAuth, sinon la ligne est invalide (ignorée). Le serveur de Jérôme ignore toute entrée qui a un `client`.
 */
export function analyserSecret(texte) {
  const entrees = [];
  let invalides = 0;
  let brutes;
  try {
    const t = JSON.parse(texte);
    brutes = Array.isArray(t) ? t : [t];
  } catch {
    brutes = String(texte).split('\n').map((l) => l.trim()).filter(Boolean).map((l) => { try { return JSON.parse(l); } catch { return null; } });
  }
  for (const e of brutes) {
    const profil = e && typeof e === 'object' ? profilCanonique(e.profil) : null;
    const ok = e && typeof e === 'object'
      && FORMAT_NOM.test(e.jeton ?? '') && FORMAT_NOM.test(e.acteur ?? '')
      && profil !== null && FORMAT_EMPREINTE.test(e.empreinte ?? '') && typeof e.actif === 'boolean';
    const liaisonOk = !ok || e.client === undefined || (typeof e.client === 'string' && FORMAT_CLIENT.test(e.client) && PROFILS_JETON_CLIENT.includes(profil)
      && ![e.jeton, e.acteur].some((n) => PREFIXES_RESERVES_OAUTH.some((p) => n.startsWith(p))));
    if (ok && liaisonOk) entrees.push({ jeton: e.jeton, acteur: e.acteur, profil, empreinte: e.empreinte, actif: e.actif, ...(e.limites && typeof e.limites === 'object' ? { limites: e.limites } : {}), ...(e.client !== undefined ? { client: e.client } : {}) });
    else invalides += 1;
  }
  return { entrees, invalides };
}

/**
 * Cherche le jeton présenté parmi les entrées. Toutes les entrées sont comparées (pas de sortie anticipée) et la
 * comparaison est à temps constant. Renvoie l'entrée si le jeton est connu ET actif, sinon null (sans dire pourquoi).
 */
export function trouverJeton(entrees, jeton) {
  return chercher(entrees.filter((e) => e.client === undefined), jeton); // une entrée liée à un client n'ouvre JAMAIS le serveur de Jérôme
}

/** Pareil pour le MCP d'un client : seules les entrées liées à CE client (et à un profil permis) comptent. */
export function trouverJetonClient(entrees, jeton, client) {
  if (typeof client !== 'string' || !FORMAT_CLIENT.test(client)) return null;
  return chercher(entrees.filter((e) => e.client === client && PROFILS_JETON_CLIENT.includes(e.profil)), jeton);
}

function chercher(entrees, jeton) {
  if (typeof jeton !== 'string' || !FORMAT_JETON.test(jeton)) return null;
  const presente = Buffer.from(empreinte(jeton), 'hex');
  let trouve = null;
  for (const e of entrees) {
    const egal = timingSafeEqual(presente, Buffer.from(e.empreinte, 'hex'));
    if (egal && e.actif) trouve = e;
  }
  return trouve;
}

/**
 * Magasin des entrées avec cache de 60 s : une révocation (actif: false, ou version du secret désactivée) agit en moins
 * d'une minute sans redéploiement. `lire` renvoie le texte du secret ; en cas d'échec on ne sert JAMAIS une copie périmée.
 */
export function creerMagasin({ lire, maintenant = () => Date.now(), dureeCacheMs = 60_000 }) {
  let cache = null;
  return {
    async entrees() {
      if (cache && maintenant() - cache.le < dureeCacheMs) return cache.donnees;
      const texte = await lire();
      const donnees = analyserSecret(texte);
      cache = { le: maintenant(), donnees };
      return donnees;
    },
  };
}
