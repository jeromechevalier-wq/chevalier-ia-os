// Lecture de l'API publique de n8n. RÈGLE ABSOLUE : ce fichier ne fait QUE des requêtes GET (lecture seule). Aucune écriture,
// aucune suppression, aucun lancement de workflow dans n8n, jamais. Un test (tests/automatisations-statique.test.js) fait échouer la suite
// si un autre verbe HTTP apparaît dans le code, et un faux n8n enregistre chaque verbe reçu pendant les essais.
//
// Ce que ce fichier garde de n8n : seulement ce que l'écran Automatisations affiche (identifiants, noms, états, dates, noms d'étiquettes).
// Le contenu des données, la définition des workflows et les réglages sensibles sont lus au passage puis JETÉS ici même.
// La clé d'API n'est jamais écrite dans un journal, un message d'erreur ni une adresse : elle voyage dans un en-tête.

export const URL_N8N = 'https://n8n.chevalier-ia.fr';
const DELAI_MS = 20000; // au-delà, n8n est considéré comme injoignable
const PAGES_MAX = 50; // garde-fou : jamais de boucle sans fin

/** Erreur côté n8n. `genre` : 'injoignable' (réseau, délai, 5xx), 'refuse' (clé refusée, 401/403), 'introuvable' (404), 'reponse' (réponse illisible). */
export class ErreurN8n extends Error {
  constructor(genre, message) {
    super(message);
    this.name = 'ErreurN8n';
    this.genre = genre;
  }
}

const MESSAGES = {
  injoignable: 'n8n ne répond pas',
  refuse: 'la clé d\'accès à n8n est refusée',
  introuvable: 'élément introuvable dans n8n',
  reponse: 'réponse de n8n illisible',
};

/** États connus de n8n, repris tels quels. « crashed » devient « error » (un plantage est une erreur pour le client). */
const ETATS = new Set(['new', 'running', 'waiting', 'success', 'error', 'canceled', 'unknown']);
export function normaliserEtat(brut) {
  const e = typeof brut === 'string' ? brut.toLowerCase() : '';
  if (e === 'crashed') return 'error';
  return ETATS.has(e) ? e : 'unknown';
}

const texte = (v) => (typeof v === 'string' || typeof v === 'number' ? String(v) : null);
const date = (v) => {
  const d = typeof v === 'string' ? new Date(v) : null;
  return d && !Number.isNaN(d.getTime()) ? d : null;
};

/**
 * Crée le lecteur n8n. `cle` : la clé d'API (jamais affichée). `url` : toujours l'adresse de n8n ci-dessus en production
 * (un autre serveur ne sert qu'aux essais, avec un faux n8n). `fetchImpl` : remplaçable pour les essais.
 */
export function creerLecteurN8n({ cle, url = URL_N8N, fetchImpl = globalThis.fetch, delaiMs = DELAI_MS } = {}) {
  if (!cle) throw new ErreurN8n('refuse', MESSAGES.refuse);

  /** Unique point de sortie vers n8n : un GET, rien d'autre. */
  async function lire(chemin, params = {}) {
    const adresse = new URL(`/api/v1${chemin}`, url);
    for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null) adresse.searchParams.set(k, String(v));
    let reponse;
    try {
      reponse = await fetchImpl(adresse, {
        method: 'GET',
        headers: { 'X-N8N-API-KEY': cle, Accept: 'application/json' },
        signal: AbortSignal.timeout(delaiMs),
        redirect: 'error', // jamais de redirection : la clé ne doit aller qu'à n8n
      });
    } catch {
      throw new ErreurN8n('injoignable', MESSAGES.injoignable);
    }
    if (reponse.status === 401 || reponse.status === 403) throw new ErreurN8n('refuse', `${MESSAGES.refuse} (HTTP ${reponse.status})`);
    if (reponse.status === 404) throw new ErreurN8n('introuvable', MESSAGES.introuvable);
    if (!reponse.ok) throw new ErreurN8n('injoignable', `${MESSAGES.injoignable} (HTTP ${reponse.status})`);
    try {
      return await reponse.json();
    } catch {
      throw new ErreurN8n('reponse', MESSAGES.reponse);
    }
  }

  /** Parcourt les pages d'une liste (curseur). `traiter(page)` renvoie `false` pour s'arrêter. */
  async function parcourir(chemin, params, traiter) {
    let curseur;
    for (let i = 0; i < PAGES_MAX; i++) {
      const corps = await lire(chemin, { ...params, limit: 100, cursor: curseur });
      const data = Array.isArray(corps?.data) ? corps.data : null;
      if (!data) throw new ErreurN8n('reponse', MESSAGES.reponse);
      if (traiter(data) === false) return;
      curseur = corps.nextCursor;
      if (!curseur) return;
    }
  }

  return {
    /**
     * Workflows avec leurs étiquettes : [{ id, name, active, tags: [noms] }]. `etiquette` (facultatif) ne demande à n8n que les workflows
     * portant cette étiquette. La réponse de n8n contient la définition complète de chaque workflow : on n'en garde RIEN d'autre que ces quatre champs.
     */
    async workflows({ etiquette } = {}) {
      const liste = [];
      await parcourir('/workflows', { tags: etiquette, excludePinnedData: true }, (page) => {
        for (const w of page) {
          const tags = Array.isArray(w?.tags) ? w.tags.map((t) => texte(t?.name)).filter(Boolean) : [];
          liste.push({ id: texte(w?.id), name: texte(w?.name) ?? '', active: w?.active === true, tags });
        }
      });
      return liste.filter((w) => w.id);
    },

    /**
     * Exécutions d'un workflow, de la plus récente à la plus ancienne, jusqu'à rencontrer `apresId` (déjà copiée) ou `max` exécutions.
     * Renvoie { executions, tronque }. Aucune donnée de contenu n'est demandée à n8n (pas de includeData).
     */
    async executionsDuWorkflow(workflowId, { apresId = null, max = 200 } = {}) {
      const executions = [];
      let tronque = false;
      await parcourir('/executions', { workflowId, includeData: false }, (page) => {
        for (const e of page) {
          if (apresId !== null && Number(e?.id) <= Number(apresId)) return false;
          if (executions.length >= max) { tronque = true; return false; }
          executions.push(resumer(e));
        }
        return true;
      });
      return { executions, tronque };
    },

    /** Une exécution (sans contenu). Lève ErreurN8n('introuvable') si n8n l'a déjà effacée. */
    async execution(id) {
      return resumer(await lire(`/executions/${encodeURIComponent(id)}`, { includeData: false }));
    },

    /**
     * Cause d'une erreur : { message, etape } lus dans le détail de l'exécution (includeData), puis TOUT LE RESTE est jeté.
     * Renvoie null si n8n n'a rien de lisible. Les textes sont raccourcis par l'appelant.
     */
    async causeErreur(id) {
      const corps = await lire(`/executions/${encodeURIComponent(id)}`, { includeData: true });
      let donnees = corps?.data;
      if (typeof donnees === 'string') {
        try { donnees = JSON.parse(donnees); } catch { donnees = null; }
      }
      const resultat = donnees && typeof donnees === 'object' ? donnees.resultData : null;
      const erreur = resultat?.error;
      const message = texte(erreur?.message) ?? texte(erreur?.description);
      const etape = texte(erreur?.node?.name) ?? texte(erreur?.node) ?? texte(resultat?.lastNodeExecuted);
      return message || etape ? { message: message ?? '', etape: etape ?? '' } : null;
    },
  };
}

/** Garde d'une exécution seulement les champs de suivi (liste blanche). */
function resumer(e) {
  return {
    id: texte(e?.id),
    workflowId: texte(e?.workflowId),
    status: normaliserEtat(e?.status ?? (e?.finished === true ? 'success' : undefined)),
    mode: texte(e?.mode),
    startedAt: date(e?.startedAt),
    stoppedAt: date(e?.stoppedAt),
    retryOf: texte(e?.retryOf),
  };
}
