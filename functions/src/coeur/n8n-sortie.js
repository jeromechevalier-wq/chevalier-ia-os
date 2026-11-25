// SEUL fichier du dépôt qui a le droit de faire un POST vers n8n (un test le borne : tests/devis-email-sortie.test.js).
// Il sert à une seule action : « Préparer l'e-mail » d'un devis (l'appli demande à n8n de créer un BROUILLON Gmail avec le PDF ; ni l'appli ni n8n n'envoient jamais l'e-mail). Les SMS des rendez-vous ne passent plus par n8n depuis le 14/11/2026 : voir coeur/sms-direct.js.
//
// Ce que ce fichier fait, et seulement cela :
//  - lit l'adresse du webhook et le secret dans Secret Manager, À L'EXÉCUTION (jamais dans le dépôt, jamais dans la page) ;
//  - n'accepte qu'une adresse https du n8n DE LA MAISON (hôte lu dans la fiche reglages_maison/maison, champ n8n_url ; fiche illisible = pas branché), au chemin « /webhook/… », sans identifiant, sans paramètre ;
//  - envoie UN corps JSON fixe { action, espace, devisId, demandeId } : aucune donnée du devis (pas d'adresse e-mail, pas de prix, pas de texte) ;
//  - ne suit aucune redirection, s'arrête au bout de 25 secondes, ne journalise ni l'adresse ni le secret ni la réponse.
// Noms des secrets : N8N_DEVIS_EMAIL_URL et N8N_DEVIS_EMAIL_SECRET chez Jérôme ; chez un client, le nom du client est ajouté après un tiret bas
// (N8N_DEVIS_EMAIL_URL_<client>) : un workflow et un secret par client, jamais partagés.
import { texteDe } from '../securite/reglages-maison.js';

export const ACTION_N8N = 'devis.preparerEmail';
export const ENTETE_SECRET = 'X-Chevalier-Secret';
export const SECRET_URL = 'N8N_DEVIS_EMAIL_URL';
export const SECRET_CLE = 'N8N_DEVIS_EMAIL_SECRET';
const SECRETS = Object.freeze({ devis: [SECRET_URL, SECRET_CLE] });
export const ESPACE_JEROME = 'interne';
export const DELAI_MAX_MS = 25_000;
export const DUREE_CACHE_MS = 60_000;
const MOTIF_CHEMIN = /^\/webhook\/[A-Za-z0-9_-]{1,100}(?:\/[A-Za-z0-9_-]{1,100}){0,3}$/;
const MOTIF_ESPACE = /^[a-z0-9][a-z0-9_-]{0,39}$/;

export const MESSAGE_NON_BRANCHE = 'La préparation de l’e-mail n’est pas encore branchée.';

/** genre : non_branche | refuse | indisponible */
export class ErreurSortieN8n extends Error {
  constructor(genre, message) {
    super(message);
    this.name = 'ErreurSortieN8n';
    this.genre = genre;
  }
}

/** Nom du secret pour un espace : sans suffixe chez Jérôme, « _<client> » chez un client. */
export function nomDuSecret(base, espace) {
  if (typeof espace !== 'string' || !MOTIF_ESPACE.test(espace)) throw new ErreurSortieN8n('non_branche', MESSAGE_NON_BRANCHE);
  return espace === ESPACE_JEROME ? base : `${base}_${espace}`;
}

/** Hôte du n8n de la maison (fiche reglages_maison/maison, champ n8n_url) ; '' si la fiche est illisible ou n'en a pas (rien n'est branché). */
export async function hoteN8nMaison() {
  try {
    const url = await texteDe('n8n_url');
    return url ? new URL(url).hostname : '';
  } catch { return ''; }
}

/** Adresse du webhook contrôlée (hôte = `hote`, celui du n8n de la maison) ; sinon null (on ne dit jamais pourquoi, ni ce qu'elle contenait). */
export function adresseSure(texte, hote) {
  if (typeof hote !== 'string' || !hote) return null;
  let u;
  try { u = new URL(String(texte ?? '').trim()); } catch { return null; }
  if (u.protocol !== 'https:' || u.hostname !== hote || u.port || u.username || u.password || u.search || u.hash) return null;
  return MOTIF_CHEMIN.test(u.pathname) ? u.toString() : null;
}

/**
 * `lireSecret(nom)` : promesse du texte du secret (lève si absent) ; `fetchImpl` : `fetch` (ou un faux n8n dans les essais) ;
 * `hote()` : promesse de l'hôte du n8n accepté (par défaut : celui de la fiche de la maison).
 * Rend { branche(espace), demander(espace, { devisId, demandeId }) }.
 */
export function creerSortieN8n({ lireSecret, fetchImpl = globalThis.fetch, maintenant = Date.now, delaiMs = DELAI_MAX_MS, hote = hoteN8nMaison } = {}) {
  const cache = new Map(); // `${action}:${espace}` -> { expire, config | null }

  async function configuration(espace, action) {
    const cleCache = `${action}:${espace}`;
    const vu = cache.get(cleCache);
    if (vu && vu.expire > maintenant()) return vu.config;
    let config = null;
    try {
      const [secretUrl, secretCle] = SECRETS[action];
      const url = adresseSure(await lireSecret(nomDuSecret(secretUrl, espace)), await hote());
      const secret = String(await lireSecret(nomDuSecret(secretCle, espace)) ?? '').trim();
      if (url && secret && !/[\u0000-\u001f\u007f]/.test(secret) && secret.length <= 500) config = { url, secret };
    } catch { config = null; }
    if (cache.size > 100) cache.clear();
    cache.set(cleCache, { expire: maintenant() + DUREE_CACHE_MS, config });
    return config;
  }

  /** L'UNIQUE endroit qui parle à n8n : `corps` est un texte JSON FIXE construit par l'action (jamais une donnée libre). */
  async function poster(espace, action, corps) {
    const config = await configuration(espace, action);
    if (!config) throw new ErreurSortieN8n('non_branche', MESSAGE_NON_BRANCHE);
    const arret = new AbortController();
    const minuteur = setTimeout(() => arret.abort(), delaiMs);
    let reponse;
    try {
      reponse = await fetchImpl(config.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', [ENTETE_SECRET]: config.secret },
        body: corps,
        redirect: 'error',
        signal: arret.signal,
      });
    } catch {
      throw new ErreurSortieN8n('indisponible', 'n8n ne répond pas.');
    } finally {
      clearTimeout(minuteur);
    }
    if (reponse.status === 401 || reponse.status === 403) throw new ErreurSortieN8n('refuse', 'n8n a refusé la demande.');
    if (!reponse.ok) throw new ErreurSortieN8n('indisponible', 'n8n a répondu une erreur.');
  }

  return {
    /** Vrai si l'adresse ET le secret de « Préparer l'e-mail » existent et sont utilisables. Ne rend jamais leur valeur. */
    async branche(espace) { return (await configuration(espace, 'devis')) !== null; },

    /** Demande à n8n de préparer le brouillon. Réussit si n8n répond « 2xx » ; lève ErreurSortieN8n sinon. */
    async demander(espace, { devisId, demandeId }) {
      await poster(espace, 'devis', JSON.stringify({ action: ACTION_N8N, espace, devisId, demandeId }));
    },
  };
}
