// Jetons des clients MCP : format, empreinte, lecture du secret, recherche à temps constant, droits par profil.
// Aucune dépendance (seulement node:crypto) : le script outils/creer-jeton.js importe aussi ce fichier.
import { createHash, timingSafeEqual } from 'node:crypto';

/** Profils : lecteur (lecture seule), bibliothecaire (lecture, écriture, pièces jointes, sauvegarde), claude-code (tout). */
export const PROFILS = ['lecteur', 'bibliothecaire', 'claude-code'];

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
 * Entrée valide : { jeton, acteur, profil, empreinte, actif, limites? } ; `limites` (facultatif) règle les plafonds du jeton (voir limites.js).
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
    const ok = e && typeof e === 'object'
      && FORMAT_NOM.test(e.jeton ?? '') && FORMAT_NOM.test(e.acteur ?? '')
      && PROFILS.includes(e.profil) && FORMAT_EMPREINTE.test(e.empreinte ?? '') && typeof e.actif === 'boolean';
    if (ok) entrees.push({ jeton: e.jeton, acteur: e.acteur, profil: e.profil, empreinte: e.empreinte, actif: e.actif, ...(e.limites && typeof e.limites === 'object' ? { limites: e.limites } : {}) });
    else invalides += 1;
  }
  return { entrees, invalides };
}

/**
 * Cherche le jeton présenté parmi les entrées. Toutes les entrées sont comparées (pas de sortie anticipée) et la
 * comparaison est à temps constant. Renvoie l'entrée si le jeton est connu ET actif, sinon null (sans dire pourquoi).
 */
export function trouverJeton(entrees, jeton) {
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
