// SEUL fichier du dépôt qui a le droit de faire un POST vers n8n (un test le borne : tests/devis-email-sortie.test.js).
// Il sert à « Préparer l'e-mail » d'un devis : l'appli demande à n8n de créer un BROUILLON Gmail (avec le PDF) ; ni l'appli ni n8n n'envoient jamais l'e-mail.
//
// Ce que ce fichier fait, et seulement cela :
//  - lit l'adresse du webhook et le secret dans Secret Manager, À L'EXÉCUTION (jamais dans le dépôt, jamais dans la page) ;
//  - n'accepte qu'une adresse https de NOTRE n8n (hôte fixe), au chemin « /webhook/… », sans identifiant, sans paramètre ;
//  - envoie UN corps JSON fixe { action, espace, devisId, demandeId } : aucune donnée du devis (pas d'adresse e-mail, pas de prix, pas de texte) ;
//  - ne suit aucune redirection, s'arrête au bout de 25 secondes, ne journalise ni l'adresse ni le secret ni la réponse.
// Noms des secrets : N8N_DEVIS_EMAIL_URL et N8N_DEVIS_EMAIL_SECRET chez Jérôme ; chez un client, le nom du client est ajouté après un tiret bas
// (N8N_DEVIS_EMAIL_URL_<client>) : un workflow et un secret par client, jamais partagés.
export const ACTION_N8N = 'devis.preparerEmail';
export const HOTE_N8N = 'n8n.chevalier-ia.fr';
export const ENTETE_SECRET = 'X-Chevalier-Secret';
export const SECRET_URL = 'N8N_DEVIS_EMAIL_URL';
export const SECRET_CLE = 'N8N_DEVIS_EMAIL_SECRET';
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

/** Adresse du webhook contrôlée ; sinon null (on ne dit jamais pourquoi, ni ce qu'elle contenait). */
export function adresseSure(texte) {
  let u;
  try { u = new URL(String(texte ?? '').trim()); } catch { return null; }
  if (u.protocol !== 'https:' || u.hostname !== HOTE_N8N || u.port || u.username || u.password || u.search || u.hash) return null;
  return MOTIF_CHEMIN.test(u.pathname) ? u.toString() : null;
}

/**
 * `lireSecret(nom)` : promesse du texte du secret (lève si absent) ; `fetchImpl` : `fetch` (ou un faux n8n dans les essais).
 * Rend { branche(espace), demander(espace, { devisId, demandeId }) }.
 */
export function creerSortieN8n({ lireSecret, fetchImpl = globalThis.fetch, maintenant = Date.now } = {}) {
  const cache = new Map(); // espace -> { expire, config | null }

  async function configuration(espace) {
    const vu = cache.get(espace);
    if (vu && vu.expire > maintenant()) return vu.config;
    let config = null;
    try {
      const url = adresseSure(await lireSecret(nomDuSecret(SECRET_URL, espace)));
      const secret = String(await lireSecret(nomDuSecret(SECRET_CLE, espace)) ?? '').trim();
      if (url && secret && !/[\u0000-\u001f\u007f]/.test(secret) && secret.length <= 500) config = { url, secret };
    } catch { config = null; }
    if (cache.size > 100) cache.clear();
    cache.set(espace, { expire: maintenant() + DUREE_CACHE_MS, config });
    return config;
  }

  return {
    /** Vrai si l'adresse ET le secret existent et sont utilisables. Ne rend jamais leur valeur. */
    async branche(espace) { return (await configuration(espace)) !== null; },

    /** Demande à n8n de préparer le brouillon. Réussit si n8n répond « 2xx » ; lève ErreurSortieN8n sinon. */
    async demander(espace, { devisId, demandeId }) {
      const config = await configuration(espace);
      if (!config) throw new ErreurSortieN8n('non_branche', MESSAGE_NON_BRANCHE);
      const arret = new AbortController();
      const minuteur = setTimeout(() => arret.abort(), DELAI_MAX_MS);
      let reponse;
      try {
        reponse = await fetchImpl(config.url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', [ENTETE_SECRET]: config.secret },
          body: JSON.stringify({ action: ACTION_N8N, espace, devisId, demandeId }),
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
    },
  };
}
