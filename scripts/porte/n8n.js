// Lecteur n8n de la porte, pour la vérification d'intégrité : « ce workflow appartient-il bien au propriétaire de la clé ? ».
// RÈGLE ABSOLUE : ce fichier ne fait QUE des requêtes GET (lecture seule), comme functions-plateforme/src/n8n.js. Aucune écriture, aucun lancement,
// aucune désactivation de workflow dans n8n, jamais (un test fait échouer la suite si un autre verbe apparaît).
// Il ne garde que le nom et les étiquettes du workflow ; le reste de la réponse (nœuds, identifiants, données) est jeté ici même.
// La clé d'API n'est jamais écrite dans un journal, un message ni une adresse : elle voyage dans un en-tête, uniquement vers n8n.
export const URL_N8N = 'https://n8n.chevalier-ia.fr';
const DELAI_MS = 10_000;
const MOTIF_ID_WORKFLOW = /^[A-Za-z0-9_-]{1,64}$/;

/** Erreur côté n8n. `genre` : 'injoignable' (réseau, délai, 5xx), 'refuse' (clé d'API refusée), 'introuvable' (404), 'reponse' (illisible). */
export class ErreurN8n extends Error {
  constructor(genre, message) {
    super(message);
    this.name = 'ErreurN8n';
    this.genre = genre;
  }
}

export function creerLecteurWorkflows({ cle, url = URL_N8N, fetchImpl = globalThis.fetch, delaiMs = DELAI_MS } = {}) {
  if (!cle) throw new ErreurN8n('refuse', 'clé d\'API n8n absente');
  return {
    /** { id, nom, etiquettes: [noms] } d'un workflow. */
    async lireWorkflow(id) {
      if (typeof id !== 'string' || !MOTIF_ID_WORKFLOW.test(id)) throw new ErreurN8n('introuvable', 'identifiant de workflow invalide');
      let reponse;
      try {
        reponse = await fetchImpl(new URL(`/api/v1/workflows/${encodeURIComponent(id)}`, url), {
          method: 'GET',
          headers: { 'X-N8N-API-KEY': cle, Accept: 'application/json' },
          signal: AbortSignal.timeout(delaiMs),
          redirect: 'error', // jamais de redirection : la clé d'API ne doit aller qu'à n8n
        });
      } catch {
        throw new ErreurN8n('injoignable', 'n8n ne répond pas');
      }
      if (reponse.status === 401 || reponse.status === 403) throw new ErreurN8n('refuse', 'la clé d\'API n8n est refusée');
      if (reponse.status === 404) throw new ErreurN8n('introuvable', 'workflow introuvable');
      if (!reponse.ok) throw new ErreurN8n('injoignable', `n8n a répondu HTTP ${reponse.status}`);
      let corps;
      try { corps = await reponse.json(); } catch { throw new ErreurN8n('reponse', 'réponse de n8n illisible'); }
      if (!corps || typeof corps.name !== 'string' || String(corps.id) !== id) throw new ErreurN8n('reponse', 'réponse de n8n inattendue');
      const etiquettes = Array.isArray(corps.tags) ? corps.tags.map((t) => (typeof t === 'string' ? t : t?.name)).filter((n) => typeof n === 'string') : [];
      return { id, nom: corps.name, etiquettes };
    },
  };
}
