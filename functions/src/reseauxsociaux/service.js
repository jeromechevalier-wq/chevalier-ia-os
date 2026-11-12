// Lecture des posts LinkedIn dans Buffer, EN LECTURE SEULE (module Réseaux sociaux). Aucune dépendance en dur : le réseau (`fetchImpl`), la clé (`lireCle`)
// et l'horloge sont injectés, pour tout tester avec un faux Buffer. Les requêtes GraphQL sont écrites en dur ci-dessous : aucune ne vient de la demande,
// aucune n'est une écriture (le garde-fou `envoyer` refuse tout ce qui ne commence pas par « { » ou qui contient « mutation »).
// Rien de Buffer n'est copié ailleurs : le texte, les dates et les chiffres sont relus à chaque appel. Aucun identifiant d'organisation ni de canal n'est écrit dans le dépôt.

export const ADRESSE_BUFFER = 'https://api.buffer.com';
export const LIMITE_DEFAUT = 60;
const DELAI_RESEAU_MS = 15_000;
const TEXTE_MAX = 5000;
const STATUTS = Object.freeze({ draft: 'brouillon', scheduled: 'programme', sent: 'publie' });
/** Type de métrique Buffer -> champ de la réponse. */
const METRIQUES = Object.freeze({ impressions: 'impressions', reach: 'portee', reactions: 'reactions', comments: 'commentaires', engagementRate: 'tauxEngagement' });
const IDENTIFIANT = /^[A-Za-z0-9_-]{1,64}$/;
/** Types de métriques Buffer gardés pour le suivi dans le temps (mêmes noms que Buffer). Une métrique absente n'est jamais inventée. */
export const TYPES_MESURES = Object.freeze(['impressions', 'reach', 'reactions', 'comments', 'engagementRate', 'views', 'viewers', 'totalTimeWatched']);
/** Lecture de tous les posts publiés : pages de 100, au plus 50 pages (5 000 posts). Au-delà, on le DIT (tronque), on ne coupe jamais en silence. */
export const TAILLE_PAGE = 100;
export const PAGES_MAX = 50;
const CURSEUR = /^[A-Za-z0-9_=+/.-]{1,512}$/;

/** Erreur « métier » : code stable, message écrit pour être lu par Jérôme (jamais de morceau de réponse Buffer ni de clé). */
export class ErreurBuffer extends Error {
  constructor(code, message) {
    super(message);
    this.name = 'ErreurBuffer';
    this.code = code;
  }
}

const REQUETE_ORGANISATIONS = '{ account { organizations { id } } }';
const requeteCanaux = (organisation) => `{ channels(input:{organizationId:"${organisation}"}) { id name service } }`;
const requetePosts = (organisation, canal, limite) => `{ posts(first:${limite}, input:{organizationId:"${organisation}", filter:{channelIds:["${canal}"]}, sort:[{field:createdAt, direction:desc}]}) { edges { node { id status dueAt sentAt text externalLink assets { __typename } metricsUpdatedAt metrics { type name value unit } } } } }`;

const requetePage = (organisation, canal, apres) => `{ posts(first:${TAILLE_PAGE}${apres ? `, after:"${apres}"` : ''}, input:{organizationId:"${organisation}", filter:{channelIds:["${canal}"]}, sort:[{field:createdAt, direction:desc}]}) { pageInfo { hasNextPage endCursor } edges { node { id status sentAt metricsUpdatedAt metrics { type name value unit } } } } }`;

const dateIso = (v) => {
  if (typeof v !== 'string' || !v) return null;
  const t = Date.parse(v);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
};
const nombreOuNull = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);

/** Un post Buffer -> la forme du contrat (voir le cahier des charges, 2.2). */
export function traduirePost(n) {
  const assets = Array.isArray(n.assets) ? n.assets : [];
  const brut = typeof n.status === 'string' ? n.status : '';
  const mesures = {};
  for (const m of Array.isArray(n.metrics) ? n.metrics : []) {
    if (m && Object.hasOwn(METRIQUES, m.type)) mesures[METRIQUES[m.type]] = nombreOuNull(m.value);
  }
  const aDesChiffres = Object.keys(mesures).length > 0;
  return {
    id: String(n.id),
    statut: STATUTS[brut] ?? 'autre',
    statutBuffer: brut,
    texte: typeof n.text === 'string' ? n.text.slice(0, TEXTE_MAX) : '',
    prevuLe: dateIso(n.dueAt),
    publieLe: dateIso(n.sentAt),
    lien: typeof n.externalLink === 'string' && n.externalLink.startsWith('https://') ? n.externalLink : null,
    video: assets.some((a) => a?.__typename === 'VideoAsset'),
    image: assets.some((a) => a?.__typename === 'ImageAsset'),
    stats: aDesChiffres
      ? { impressions: null, portee: null, reactions: null, commentaires: null, tauxEngagement: null, ...mesures }
      : null,
    statsLuesLe: aDesChiffres ? dateIso(n.metricsUpdatedAt) : null,
  };
}

const cleDeTri = (p) => Date.parse(p.publieLe ?? p.prevuLe ?? '') || 0;

export function creerServiceBuffer({ fetchImpl = fetch, lireCle, maintenant = Date.now }) {
  async function envoyer(requete) {
    if (typeof requete !== 'string' || !requete.startsWith('{') || /mutation/i.test(requete)) throw new Error('Requête refusée : lecture seule.');
    let cle;
    try { cle = await lireCle(); } catch { cle = ''; }
    if (typeof cle !== 'string' || !cle.trim()) throw new ErreurBuffer('buffer_refuse', 'La clé Buffer est refusée.');
    const ctrl = new AbortController();
    const minuteur = setTimeout(() => ctrl.abort(), DELAI_RESEAU_MS);
    let reponse;
    try {
      reponse = await fetchImpl(ADRESSE_BUFFER, {
        method: 'POST',
        headers: { Authorization: `Bearer ${cle.trim()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ query: requete }),
        signal: ctrl.signal,
      });
      if (reponse.status === 401 || reponse.status === 403) throw new ErreurBuffer('buffer_refuse', 'La clé Buffer est refusée.');
      if (!reponse.ok) throw new ErreurBuffer('buffer_indisponible', 'Buffer ne répond pas pour le moment. Réessaie dans un instant.');
      const texte = await reponse.text(); // sous le même délai : une réponse qui n'arrive jamais est coupée
      let corps;
      try { corps = JSON.parse(texte); } catch { throw new ErreurBuffer('reponse_inattendue', 'Buffer a répondu autre chose que prévu.'); }
      if (corps === null || typeof corps !== 'object' || corps.errors || !corps.data) throw new ErreurBuffer('reponse_inattendue', 'Buffer a répondu autre chose que prévu.');
      return corps.data;
    } catch (e) {
      if (e instanceof ErreurBuffer) throw e;
      throw new ErreurBuffer('buffer_indisponible', 'Buffer ne répond pas pour le moment. Réessaie dans un instant.');
    } finally {
      clearTimeout(minuteur);
    }
  }

  const attendu = (ok) => { if (!ok) throw new ErreurBuffer('reponse_inattendue', 'Buffer a répondu autre chose que prévu.'); };

  /** Lit les posts du canal LinkedIn (brouillons, programmés, publiés) avec leurs chiffres. */
  async function lirePosts({ limite = LIMITE_DEFAUT } = {}) {
    const donneesOrg = await envoyer(REQUETE_ORGANISATIONS);
    const organisations = donneesOrg?.account?.organizations;
    attendu(Array.isArray(organisations) && organisations.length > 0 && IDENTIFIANT.test(String(organisations[0]?.id)));
    const organisation = String(organisations[0].id);

    const donneesCanaux = await envoyer(requeteCanaux(organisation));
    attendu(Array.isArray(donneesCanaux?.channels));
    const canal = donneesCanaux.channels.find((c) => c?.service === 'linkedin');
    if (!canal) throw new ErreurBuffer('aucun_canal_linkedin', 'Aucun canal LinkedIn n\'est connecté dans Buffer.');
    attendu(IDENTIFIANT.test(String(canal.id)));

    const donneesPosts = await envoyer(requetePosts(organisation, String(canal.id), limite));
    const aretes = donneesPosts?.posts?.edges;
    attendu(Array.isArray(aretes));
    const posts = aretes.map((a) => a?.node).filter((n) => n && n.id !== undefined && n.id !== null && n.id !== '')
      .map(traduirePost).sort((a, b) => cleDeTri(b) - cleDeTri(a));
    return {
      ok: true,
      lueLe: new Date(maintenant()).toISOString(),
      canal: { id: String(canal.id), nom: typeof canal.name === 'string' ? canal.name : '', service: 'linkedin' },
      posts,
    };
  }

  /** Identifie l'organisation et le canal LinkedIn (deux lectures). */
  async function trouverCanal() {
    const donneesOrg = await envoyer(REQUETE_ORGANISATIONS);
    const organisations = donneesOrg?.account?.organizations;
    attendu(Array.isArray(organisations) && organisations.length > 0 && IDENTIFIANT.test(String(organisations[0]?.id)));
    const organisation = String(organisations[0].id);
    const donneesCanaux = await envoyer(requeteCanaux(organisation));
    attendu(Array.isArray(donneesCanaux?.channels));
    const canal = donneesCanaux.channels.find((c) => c?.service === 'linkedin');
    if (!canal) throw new ErreurBuffer('aucun_canal_linkedin', 'Aucun canal LinkedIn n\'est connecté dans Buffer.');
    attendu(IDENTIFIANT.test(String(canal.id)));
    return { organisation, canal: String(canal.id) };
  }

  /**
   * Lit TOUS les posts publiés (`sent`) du canal LinkedIn, page par page, avec leurs métriques brutes (pour le suivi dans le temps). Lecture seule.
   * Rend { posts: [{ id, publieLe, metricsUpdatedAt, mesures: { <type>: nombre } }], lus, pages, tronque, raisonTronque } :
   *  - `lus` = tous les posts vus (brouillons et programmés compris), `posts` = seulement les publiés ;
   *  - `tronque` vrai si la lecture s'arrête avant la fin (50 pages, curseur inutilisable ou jamais renouvelé, page pleine sans indication de suite) : jamais de coupure silencieuse.
   */
  async function lirePostsPublies() {
    const { organisation, canal } = await trouverCanal();
    const posts = [];
    let lus = 0;
    let pages = 0;
    let curseur = null;
    const vus = new Set();
    let tronque = false;
    let raisonTronque = null;
    for (;;) {
      const donnees = await envoyer(requetePage(organisation, canal, curseur));
      pages += 1;
      const aretes = donnees?.posts?.edges;
      attendu(Array.isArray(aretes));
      for (const a of aretes) {
        const n = a?.node;
        if (!n || n.id === undefined || n.id === null || n.id === '') continue;
        lus += 1;
        if (n.status !== 'sent') continue;
        const mesures = {};
        for (const m of Array.isArray(n.metrics) ? n.metrics : []) {
          if (m && TYPES_MESURES.includes(m.type) && !Object.hasOwn(mesures, m.type) && nombreOuNull(m.value) !== null) mesures[m.type] = m.value;
        }
        posts.push({ id: String(n.id), publieLe: dateIso(n.sentAt), metricsUpdatedAt: dateIso(n.metricsUpdatedAt), mesures });
      }
      const info = donnees.posts.pageInfo;
      if (info?.hasNextPage === true) {
        const suivant = info.endCursor;
        if (typeof suivant !== 'string' || !CURSEUR.test(suivant) || vus.has(suivant)) { tronque = true; raisonTronque = 'curseur_inutilisable'; break; }
        if (pages >= PAGES_MAX) { tronque = true; raisonTronque = 'pages_max'; break; }
        vus.add(suivant);
        curseur = suivant;
        continue;
      }
      if (info?.hasNextPage !== false && aretes.length >= TAILLE_PAGE) { tronque = true; raisonTronque = 'suite_inconnue'; } // page pleine et Buffer ne dit pas s'il y a une suite
      break;
    }
    return { canal, posts, lus, pages, tronque, raisonTronque };
  }

  return { lirePosts, lirePostsPublies };
}
