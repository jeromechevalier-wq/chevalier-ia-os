// SEUL fichier du dépôt qui a le droit de faire un POST vers n8n (un test le borne : tests/devis-email-sortie.test.js).
// Il sert à deux actions seulement : « Préparer l'e-mail » d'un devis, et « tirer maintenant » les SMS des rendez-vous (module Rendez-vous, ajouté le 14/11/2026 ; corps { action, espace, rendezVousId }, rien d'autre : l'envoi réel passe par la porte, rdv.aEnvoyer). Pour l'e-mail : l'appli demande à n8n de créer un BROUILLON Gmail (avec le PDF) ; ni l'appli ni n8n n'envoient jamais l'e-mail.
//
// Ce que ce fichier fait, et seulement cela :
//  - lit l'adresse du webhook et le secret dans Secret Manager, À L'EXÉCUTION (jamais dans le dépôt, jamais dans la page) ;
//  - n'accepte qu'une adresse https de NOTRE n8n (hôte fixe), au chemin « /webhook/… », sans identifiant, sans paramètre ;
//  - envoie UN corps JSON fixe { action, espace, devisId, demandeId } : aucune donnée du devis (pas d'adresse e-mail, pas de prix, pas de texte) ;
//  - ne suit aucune redirection, s'arrête au bout de 25 secondes, ne journalise ni l'adresse ni le secret ni la réponse.
// Noms des secrets : N8N_DEVIS_EMAIL_URL et N8N_DEVIS_EMAIL_SECRET chez Jérôme ; chez un client, le nom du client est ajouté après un tiret bas
// (N8N_DEVIS_EMAIL_URL_<client>) : un workflow et un secret par client, jamais partagés.
export const ACTION_N8N = 'devis.preparerEmail';
export const ACTION_N8N_RDV = 'rdv.tirerMaintenant';
export const HOTE_N8N = 'n8n.chevalier-ia.fr';
export const ENTETE_SECRET = 'X-Chevalier-Secret';
export const SECRET_URL = 'N8N_DEVIS_EMAIL_URL';
export const SECRET_CLE = 'N8N_DEVIS_EMAIL_SECRET';
export const SECRET_RDV_URL = 'N8N_RDV_URL';
export const SECRET_RDV_CLE = 'N8N_RDV_SECRET';
const SECRETS = Object.freeze({ devis: [SECRET_URL, SECRET_CLE], rdv: [SECRET_RDV_URL, SECRET_RDV_CLE] });
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
export function creerSortieN8n({ lireSecret, fetchImpl = globalThis.fetch, maintenant = Date.now, delaiMs = DELAI_MAX_MS } = {}) {
  const cache = new Map(); // `${action}:${espace}` -> { expire, config | null }

  async function configuration(espace, action) {
    const cleCache = `${action}:${espace}`;
    const vu = cache.get(cleCache);
    if (vu && vu.expire > maintenant()) return vu.config;
    let config = null;
    try {
      const [secretUrl, secretCle] = SECRETS[action];
      const url = adresseSure(await lireSecret(nomDuSecret(secretUrl, espace)));
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
    /** Même chose pour les SMS des rendez-vous (secrets N8N_RDV_URL et N8N_RDV_SECRET). */
    async brancheRdv(espace) { return (await configuration(espace, 'rdv')) !== null; },

    /** Demande à n8n de préparer le brouillon. Réussit si n8n répond « 2xx » ; lève ErreurSortieN8n sinon. */
    async demander(espace, { devisId, demandeId }) {
      await poster(espace, 'devis', JSON.stringify({ action: ACTION_N8N, espace, devisId, demandeId }));
    },

    /** Dit à n8n « tire maintenant » : le workflow appelle la porte (rdv.aEnvoyer) pour récupérer les SMS dus. Seul l'identifiant du rendez-vous voyage. */
    async tirerRdv(espace, { rendezVousId }) {
      await poster(espace, 'rdv', JSON.stringify({ action: ACTION_N8N_RDV, espace, rendezVousId }));
    },
  };
}
