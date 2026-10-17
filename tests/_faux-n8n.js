// FAUX n8n pour les essais du chantier 14 : un petit serveur local qui imite l'API publique de n8n (workflows, étiquettes, exécutions).
// Aucun appel réel à n8n.chevalier-ia.fr. Il enregistre CHAQUE requête reçue (verbe, chemin, paramètres) pour prouver que le code ne fait que lire.
// Les données simulées contiennent volontairement du CONTENU personnel et un faux secret, pour vérifier qu'ils ne finissent jamais dans Firebase.
import { createServer } from 'node:http';

export const CLE_ESSAI = 'cle-essai-n8n-0000'; // fausse clé, valable seulement pour ce faux serveur
export const CONTENU_SECRET = 'CONTENU-PERSONNEL-camille.dubois@exemple.test';
export const SECRET_DANS_WORKFLOW = 'SECRET-DE-CONNEXION-ne-doit-jamais-sortir';

export function creerFauxN8n() {
  const etat = {
    workflows: [], // { id, name, active, tags: [noms], cles: [noms de credentials utilisés par les nœuds] }
    executions: [], // { id, workflowId, status, mode, startedAt, stoppedAt, retryOf, erreur: { message, etape } }
    requetes: [],
    panne: false, // true : le serveur répond 503
    coupe: false, // true : la connexion est coupée net
    latenceMs: 0,
    taillePage: 100,
  };

  /** Ce qu'envoie le vrai n8n pour un workflow : la définition COMPLÈTE (nœuds, réglages), étiquettes comprises. */
  const workflowComplet = (w) => ({
    id: w.id, name: w.name, active: w.active, isArchived: false,
    tags: w.tags.map((t, i) => ({ id: `t${i}`, name: t })),
    nodes: [{ name: 'Lire Presences', type: 'n8n-nodes-base.httpRequest', parameters: { authentication: SECRET_DANS_WORKFLOW, url: 'https://exemple.test' },
      // Comme le vrai n8n : le NOM du credential (et son identifiant), jamais sa valeur.
      credentials: Object.fromEntries((w.cles ?? []).map((nom, i) => [`httpHeaderAuth${i}`, { id: `cred${i}`, name: nom }])) }],
    settings: { saveManualExecutions: true }, staticData: { secret: SECRET_DANS_WORKFLOW },
  });
  const executionResume = (e) => ({
    id: e.id, workflowId: e.workflowId, status: e.status, finished: e.status === 'success', mode: e.mode ?? 'webhook',
    startedAt: e.startedAt, stoppedAt: e.stoppedAt ?? null, retryOf: e.retryOf ?? null, retrySuccessId: null, waitTill: null,
    customData: { client: CONTENU_SECRET },
  });
  const executionDetail = (e) => ({
    ...executionResume(e),
    data: {
      resultData: {
        error: e.erreur ? { message: e.erreur.message, node: { name: e.erreur.etape, parameters: { secret: SECRET_DANS_WORKFLOW } } } : undefined,
        lastNodeExecuted: e.erreur?.etape,
        runData: { 'Lire Presences': [{ data: { main: [[{ json: { email: CONTENU_SECRET, note: CONTENU_SECRET } }]] } }] },
      },
    },
  });

  const serveur = createServer(async (req, res) => {
    const adresse = new URL(req.url, 'http://faux');
    etat.requetes.push({ verbe: req.method, chemin: adresse.pathname, params: Object.fromEntries(adresse.searchParams), cle: req.headers['x-n8n-api-key'] });
    if (etat.latenceMs) await new Promise((r) => setTimeout(r, etat.latenceMs));
    if (etat.coupe) { req.socket.destroy(); return; }
    const repondre = (code, corps) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(corps)); };
    if (etat.panne) return repondre(503, { message: 'indisponible' });
    if (req.headers['x-n8n-api-key'] !== CLE_ESSAI) return repondre(401, { message: 'unauthorized' });
    if (req.method !== 'GET') return repondre(405, { message: 'method not allowed' }); // le vrai n8n accepterait POST/DELETE : ici on les refuse ET on les a notés
    const p = adresse.searchParams;
    const page = (liste, transformer) => {
      const debut = p.get('cursor') ? Number(p.get('cursor')) : 0;
      const taille = Math.min(Number(p.get('limit') || etat.taillePage), etat.taillePage);
      const morceau = liste.slice(debut, debut + taille);
      return { data: morceau.map(transformer), nextCursor: debut + taille < liste.length ? String(debut + taille) : null };
    };
    if (adresse.pathname === '/api/v1/workflows') {
      let liste = etat.workflows;
      if (p.get('tags')) { const noms = p.get('tags').split(','); liste = liste.filter((w) => w.tags.some((t) => noms.includes(t))); }
      return repondre(200, page(liste, workflowComplet));
    }
    if (adresse.pathname === '/api/v1/executions') {
      let liste = etat.executions;
      if (p.get('workflowId')) liste = liste.filter((e) => e.workflowId === p.get('workflowId'));
      liste = [...liste].sort((a, b) => Number(b.id) - Number(a.id)); // la plus récente d'abord, comme n8n
      return repondre(200, page(liste, p.get('includeData') === 'true' ? executionDetail : executionResume));
    }
    const m = adresse.pathname.match(/^\/api\/v1\/executions\/([^/]+)$/);
    if (m) {
      const e = etat.executions.find((x) => x.id === m[1]);
      if (!e) return repondre(404, { message: 'not found' });
      return repondre(200, p.get('includeData') === 'true' ? executionDetail(e) : executionResume(e));
    }
    return repondre(404, { message: 'not found' });
  });

  return {
    etat,
    verbes: () => [...new Set(etat.requetes.map((r) => r.verbe))],
    vider: () => { etat.requetes.length = 0; },
    async demarrer() {
      await new Promise((ok) => serveur.listen(0, '127.0.0.1', ok));
      return `http://127.0.0.1:${serveur.address().port}`;
    },
    arreter: () => new Promise((ok) => { serveur.closeAllConnections?.(); serveur.close(ok); }),
  };
}
