// Couche d'accès à la base de l'espace : LE SEUL fichier (avec actions-metier.js) du dossier js/ qui parle au réseau (verrou : tests/supabase-acces.test.js).
// Trois gestes seulement : lire une table ou une vue, appeler une fonction de la base, demander un lien temporaire vers un PDF.
// Tout vient de l'extérieur (injection) : lireConnexion() donne l'adresse, la clé publique et l'espace ; obtenirBadge(forcer) donne le badge Firebase ;
// fetchImpl remplace le réseau dans les tests. Aucune adresse n'est écrite ici.

/** Plafond de lecture : 20 pages de 1 000 lignes. Au-delà, on le DIT (jamais une liste coupée en silence). */
export const TAILLE_PAGE = 1000;
export const PAGES_MAX = 20;

export const MESSAGE_RECONNEXION = 'Reconnecte-toi : ton accès à la base n’est pas à jour. Déconnecte-toi puis reconnecte-toi ; si cela ne suffit pas, ton compte n’a pas encore reçu l’accès.';
export const MESSAGE_MODE_TEST = 'Mode test : aucun appel réseau réel.';

/** Erreur lisible. `code` : « reconnexion », « connexion », « reseau », « refus », « reponse », « adresse », « mode_test ». */
export class ErreurBase extends Error {
  constructor(message, code, statut = null) { super(message); this.name = 'ErreurBase'; this.code = code; this.statut = statut; }
}

/** Contrôle d'une adresse : https obligatoire, vérifié par l'analyse de l'adresse (jamais par un simple test de texte). Renvoie l'objet URL. */
export function adresseHttps(valeur, nom = 'L’adresse') {
  let u;
  try { u = new URL(String(valeur)); } catch { throw new ErreurBase(`${nom} est illisible.`, 'adresse'); }
  if (u.protocol !== 'https:') throw new ErreurBase(`${nom} doit commencer par le protocole sécurisé : refusée.`, 'adresse');
  return u;
}

const NOM_SIMPLE = /^[a-z_][a-z0-9_]*$/;
const OPERATEURS = { eq: 'eq', neq: 'neq', gt: 'gt', gte: 'gte', lt: 'lt', lte: 'lte', in: 'in', is: 'is', ilike: 'ilike', like: 'like' };

function verifierNom(nom, genre) {
  if (typeof nom !== 'string' || !NOM_SIMPLE.test(nom)) throw new ErreurBase(`${genre} « ${String(nom)} » est refusé (lettres minuscules, chiffres et _ seulement).`, 'refus');
  return nom;
}

/** Valeur d'un filtre au format de la base : `in` prend une liste, `is` null/true/false. */
function valeurFiltre(op, v) {
  if (op === 'in') {
    if (!Array.isArray(v)) throw new ErreurBase('Le filtre « in » attend une liste.', 'refus');
    return `(${v.map((x) => `"${String(x).replaceAll('\\', '\\\\').replaceAll('"', '\\"')}"`).join(',')})`;
  }
  if (op === 'is') return v === null ? 'null' : String(Boolean(v));
  return String(v);
}

/** @param {{ lireConnexion: () => object, obtenirBadge: (forcer?: boolean) => Promise<{ jeton: string, claims?: object }>, fetchImpl?: Function, modeEmulateurs?: boolean }} dep */
export function creerClient({ lireConnexion, obtenirBadge, fetchImpl, modeEmulateurs = false }) {
  if (typeof lireConnexion !== 'function' || typeof obtenirBadge !== 'function') throw new Error('creerClient : lireConnexion et obtenirBadge sont obligatoires.');
  // Mode émulateurs : aucun appel réseau réel, sauf si un faux réseau est donné explicitement.
  const reseau = fetchImpl || (modeEmulateurs ? null : (...a) => globalThis.fetch(...a));

  function connexion() {
    const c = lireConnexion(); // lève « Connexion à la base non réglée »
    const base = adresseHttps(c && c.adresseBase, 'L’adresse de la base');
    if (!c.clePublique) throw new ErreurBase('Connexion à la base non réglée : la clé publique manque.', 'connexion');
    return { origine: base.origin, cle: String(c.clePublique) };
  }

  /** Badge valide qui porte la mention d'accès ; sinon un rafraîchissement forcé, puis le message « Reconnecte-toi ». */
  async function badge() {
    let b = await obtenirBadge(false);
    if (!b || !b.jeton || !b.claims || b.claims.role !== 'authenticated') b = await obtenirBadge(true);
    if (!b || !b.jeton || !b.claims || b.claims.role !== 'authenticated') throw new ErreurBase(MESSAGE_RECONNEXION, 'reconnexion');
    return b.jeton;
  }

  /** Un appel à la base. Renvoie { statut, corps, entetes }. 401/403 : « Reconnecte-toi ». */
  async function appel(methode, chemin, { requete, corps, entetes: en = {} } = {}) {
    const { origine, cle } = connexion();
    if (!reseau) throw new ErreurBase(MESSAGE_MODE_TEST, 'mode_test');
    const jeton = await badge();
    const url = new URL(chemin, origine);
    if (url.origin !== origine) throw new ErreurBase('Chemin refusé.', 'refus');
    if (requete) for (const [k, v] of requete) url.searchParams.append(k, v);
    let rep;
    try {
      rep = await reseau(url.toString(), { method: methode, headers: { apikey: cle, Authorization: `Bearer ${jeton}`, Accept: 'application/json', ...(corps === undefined ? {} : { 'Content-Type': 'application/json' }), ...en }, ...(corps === undefined ? {} : { body: JSON.stringify(corps) }) });
    } catch { throw new ErreurBase('Connexion à la base impossible, réessaie.', 'reseau'); }
    if (rep.status === 401 || rep.status === 403) throw new ErreurBase(MESSAGE_RECONNEXION, 'reconnexion', rep.status);
    let contenu = null;
    try { contenu = await rep.json(); } catch { contenu = null; }
    if (!rep.ok) throw new ErreurBase(messageBase(rep.status, contenu), 'refus', rep.status);
    return { statut: rep.status, corps: contenu };
  }

  /** Lit une table ou une vue, page par page. Colonnes NOMMÉES (pas d'étoile). Renvoie { lignes, tronque, message } : `tronque` = vrai si le plafond de 20 pages est atteint (le message le dit). */
  async function lire(table, { colonnes, filtres = [], tri = [], tailleLot = TAILLE_PAGE, pagesMax = PAGES_MAX } = {}) {
    verifierNom(table, 'La table');
    if (!Array.isArray(colonnes) || colonnes.length === 0) throw new ErreurBase('Il faut nommer les colonnes à lire.', 'refus');
    const cols = colonnes.map((c) => verifierNom(c, 'La colonne'));
    const requete = [['select', cols.join(',')]];
    for (const f of filtres) {
      const [col, op, val] = f;
      verifierNom(col, 'La colonne');
      if (!Object.hasOwn(OPERATEURS, op)) throw new ErreurBase(`Le filtre « ${String(op)} » est inconnu.`, 'refus');
      requete.push([col, `${OPERATEURS[op]}.${valeurFiltre(op, val)}`]);
    }
    // Tri : toujours stable (la dernière clé de tri sert à départager) ; la base le demande pour paginer sans doublon.
    const cles = tri.map((t) => (typeof t === 'string' ? { col: t, asc: true } : { col: t.col, asc: t.asc !== false }));
    if (cles.length) requete.push(['order', cles.map((t) => `${verifierNom(t.col, 'La colonne de tri')}.${t.asc ? 'asc' : 'desc'}`).join(',')]);
    const lignes = [];
    let pages = 0;
    let plein = false;
    while (pages < pagesMax) {
      const r = await appel('GET', `/rest/v1/${table}`, { requete: [...requete, ['limit', String(tailleLot)], ['offset', String(pages * tailleLot)]] });
      if (!Array.isArray(r.corps)) throw new ErreurBase('Réponse inattendue de la base.', 'reponse');
      lignes.push(...r.corps);
      pages += 1;
      plein = r.corps.length >= tailleLot;
      if (!plein) break;
    }
    const tronque = plein && pages >= pagesMax;
    return { lignes, tronque, message: tronque ? `Lecture limitée à ${pagesMax} pages de ${tailleLot} lignes : la liste est peut-être incomplète.` : '' };
  }

  /** Appelle une fonction de la base (favoris, ticket…). `args` : objet nommé. */
  async function appeler(fonction, args = {}) {
    verifierNom(fonction, 'La fonction');
    const r = await appel('POST', `/rest/v1/rpc/${fonction}`, { corps: args });
    return r.corps;
  }

  /** Lien temporaire (par défaut 10 minutes) vers un PDF d'un dossier de la base. Renvoie une adresse https. */
  async function lienPdf(dossier, chemin, secondes = 600) {
    verifierNom(dossier, 'Le dossier');
    if (typeof chemin !== 'string' || !chemin || chemin.split('/').some((s) => s === '..' || s === '')) throw new ErreurBase('Chemin du fichier refusé.', 'refus');
    const { origine } = connexion();
    const r = await appel('POST', `/storage/v1/object/sign/${dossier}/${chemin.split('/').map(encodeURIComponent).join('/')}`, { corps: { expiresIn: secondes } });
    const rel = r.corps && (r.corps.signedURL || r.corps.signedUrl);
    if (typeof rel !== 'string') throw new ErreurBase('Réponse inattendue de la base : pas de lien.', 'reponse');
    if (/^[a-z][a-z0-9+.-]*:|^\/\//i.test(rel)) throw new ErreurBase('Lien refusé : il ne vient pas de la base.', 'reponse');
    const url = new URL(rel.startsWith('/storage/') ? rel : `/storage/v1${rel.startsWith('/') ? '' : '/'}${rel}`, origine);
    if (url.origin !== origine) throw new ErreurBase('Lien refusé : il ne vient pas de la base.', 'reponse');
    return url.toString();
  }

  /** Ticket à usage unique (60 s) pour UN appel à n8n : usage = validation | actions | suggestions | ajoutFacture. */
  async function demanderTicket(usage) {
    const t = await appeler('demander_ticket_n8n', { usage });
    const ticket = typeof t === 'string' ? t : t && (t.ticket || t.demander_ticket_n8n);
    if (typeof ticket !== 'string' || !ticket) throw new ErreurBase('La base n’a pas donné de ticket.', 'reponse');
    return ticket;
  }

  /** Test de connexion : lit une seule ligne. Renvoie { ok: true } ou lève une erreur lisible. */
  async function tester(table, colonne) {
    await appel('GET', `/rest/v1/${verifierNom(table, 'La table')}`, { requete: [['select', verifierNom(colonne, 'La colonne')], ['limit', '1']] });
    return { ok: true };
  }

  return { lire, appeler, lienPdf, demanderTicket, tester };
}

function messageBase(statut, corps) {
  const detail = corps && typeof corps === 'object' && typeof corps.message === 'string' ? ` (${corps.message})` : '';
  if (statut >= 500) return 'La base a un souci, réessaie dans un instant.';
  return `La base a refusé la demande${detail}.`;
}
