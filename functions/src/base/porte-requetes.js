// Porte de la base (basePorte, 26/11/2026) : la partie PURE. Elle lit une requête au format PostgREST (le dialecte que parlent déjà les écrans Achats
// et les workflows n8n : /rest/v1/<table>?select=…&col=eq.x, /rest/v1/rpc/<fonction>, /storage/v1/object/…) et la traduit en SQL + valeurs.
// Aucun réseau, aucune base ici : tout est testable sans rien (tests/base-porte-requetes.test.js).
// Garde-fous :
//  - SEUL un sous-ensemble est compris : eq neq gt gte lt lte in is like ilike, le préfixe not., order, limit, offset, select de colonnes nommées ;
//    le reste (or=, and=, colonnes calculées, ressources liées, alias, conversions) est REFUSÉ, jamais deviné ;
//  - chaque nom (table, vue, colonne, fonction, argument) passe par ^[a-z_][a-z0-9_]*$ ET doit exister dans le catalogue lu dans la base (droits du rôle) ;
//    un nom n'entre dans le SQL qu'entre guillemets doubles, après ces deux contrôles ;
//  - chaque valeur passe en paramètre ($1, $2…), jamais dans le texte SQL ;
//  - l'espace (app.espace_id) ne vient JAMAIS d'ici : il est posé par porte-base.js depuis la configuration du serveur.

export const NOM_SIMPLE = /^[a-z_][a-z0-9_]*$/;
/** Clés de la requête qui règlent la lecture (jamais un nom de colonne). `or`, `and`, `not` : non compris, donc refusés. */
export const CLES_REGLAGE = Object.freeze(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns']);
export const CLES_REFUSEES = Object.freeze(['or', 'and', 'not']);
export const OPERATEURS = Object.freeze({ eq: '=', neq: '<>', gt: '>', gte: '>=', lt: '<', lte: '<=' });
export const LIMITE_MAX = 1000;
export const OFFSET_MAX = 1_000_000;
export const LIGNES_MAX_ECRITURE = 500;
export const MIME_OBJET = 'application/vnd.pgrst.object+json';

/** Erreur rendue telle quelle à l'appelant (statut HTTP + corps à la forme PostgREST). Le message est écrit ICI, jamais repris de `pg`. */
export class ErreurPorte extends Error {
  constructor(statut, code, message, details = null) {
    super(message);
    this.name = 'ErreurPorte';
    this.statut = statut;
    this.code = code;
    this.details = details;
  }
}

const refus = (code, message) => new ErreurPorte(400, code, message);
const citer = (nom) => (typeof nom === 'string' && NOM_SIMPLE.test(nom) && nom.length <= 63 ? nom : '…');

/** Un nom simple (sinon 400). Le rendu est entre guillemets doubles : sûr parce que le nom ne contient que [a-z0-9_]. */
export function nomSql(nom, genre = 'nom') {
  if (typeof nom !== 'string' || nom.length > 63 || !NOM_SIMPLE.test(nom)) throw refus('nom_refuse', `Le ${genre} est refusé (lettres minuscules, chiffres et _ seulement).`);
  return `"${nom}"`;
}

// ————— Chemins —————

/** Retire le préfixe « /basePorte » (adresse cloudfunctions.net) s'il est présent ; l'adresse Cloud Run directe n'en a pas. */
export function normaliserChemin(chemin) {
  const c = typeof chemin === 'string' && chemin.startsWith('/') ? chemin : '/';
  return c.replace(/^\/baseporte(?=\/|$)/i, '') || '/';
}

/** Un chemin d'objet de stockage (après le dossier) : segments décodés, jamais vides, jamais « . » ni « .. », sans barre oblique inverse ni caractère de contrôle. */
export function cheminObjet(segmentsBruts) {
  if (!Array.isArray(segmentsBruts) || segmentsBruts.length === 0) throw refus('chemin_refuse', 'Chemin du fichier refusé.');
  const segments = segmentsBruts.map((s) => {
    let d;
    try { d = decodeURIComponent(s); } catch { throw refus('chemin_refuse', 'Chemin du fichier refusé.'); }
    // eslint-disable-next-line no-control-regex
    if (!d || d === '.' || d === '..' || /[/\\\u0000-\u001f\u007f]/.test(d)) throw refus('chemin_refuse', 'Chemin du fichier refusé.');
    return d;
  });
  const chemin = segments.join('/');
  if (chemin.length > 512) throw refus('chemin_refuse', 'Chemin du fichier refusé.');
  return chemin;
}

/** Encode un chemin d'objet pour une adresse (segment par segment). */
export const encoderChemin = (chemin) => chemin.split('/').map(encodeURIComponent).join('/');

/**
 * Route d'une requête. `type` : 'auth' (/auth/v1/user), 'rpc', 'table', 'signer' (POST lien), 'lien' (GET avec jeton), 'deposer' (POST d'un fichier), 'inconnu'.
 * Le dossier de stockage est rendu tel quel : porte-base.js n'accepte que les dossiers connus.
 */
export function analyserRoute(methode, cheminBrut) {
  const chemin = normaliserChemin(cheminBrut);
  const morceaux = chemin.split('/').slice(1);
  if (morceaux[0] === 'auth' && morceaux[1] === 'v1') return { type: 'auth' };
  if (morceaux[0] === 'rest' && morceaux[1] === 'v1') {
    if (morceaux[2] === 'rpc' && morceaux.length === 4) return { type: 'rpc', nom: morceaux[3] };
    if (morceaux.length === 3 && morceaux[2]) return { type: 'table', nom: morceaux[2] };
    return { type: 'inconnu' };
  }
  if (morceaux[0] === 'storage' && morceaux[1] === 'v1' && morceaux[2] === 'object') {
    if (morceaux[3] === 'sign' && morceaux.length >= 6) {
      return { type: methode === 'GET' ? 'lien' : 'signer', dossier: morceaux[4], segments: morceaux.slice(5) };
    }
    if (morceaux[3] && morceaux[3] !== 'sign' && morceaux.length >= 5) return { type: 'deposer', dossier: morceaux[3], segments: morceaux.slice(4) };
  }
  return { type: 'inconnu' };
}

// ————— En-têtes —————

/** `Prefer: count=exact, return=representation, resolution=ignore-duplicates` → { count, retour, resolution }. */
export function lirePrefer(entete) {
  const r = { count: null, retour: 'minimal', resolution: null };
  for (const brut of String(entete ?? '').split(',')) {
    const [k, v] = brut.trim().split('=').map((x) => (x ?? '').trim());
    if (k === 'count' && v === 'exact') r.count = 'exact';
    if (k === 'return' && (v === 'representation' || v === 'minimal')) r.retour = v;
    if (k === 'resolution' && (v === 'ignore-duplicates' || v === 'merge-duplicates')) r.resolution = v;
  }
  return r;
}

/** Vrai si l'appelant demande UN objet (Accept PostgREST « objet unique »). */
export const veutObjet = (accept) => String(accept ?? '').toLowerCase().includes(MIME_OBJET);

/** `Content-Range` à la manière de PostgREST : « 0-24/120 », « &#42;/0 » si rien. */
export function contentRange(offset, nombre, total) {
  const t = total === null || total === undefined ? '*' : String(total);
  return nombre > 0 ? `${offset}-${offset + nombre - 1}/${t}` : `*/${t}`;
}

// ————— Valeurs des filtres —————

/** Liste d'un filtre `in` : « (a,b,"c,d") » ; guillemets doubles possibles, avec \" et \\ échappés (format de js/os/supabase.js). */
export function listeIn(texte) {
  const t = String(texte);
  if (!t.startsWith('(') || !t.endsWith(')')) throw refus('filtre_refuse', 'Le filtre « in » attend une liste entre parenthèses.');
  const corps = t.slice(1, -1);
  const sortie = [];
  if (corps === '') return sortie;
  let i = 0;
  while (i <= corps.length) {
    let valeur = '';
    if (corps[i] === '"') {
      i += 1;
      let ferme = false;
      while (i < corps.length) {
        const c = corps[i];
        if (c === '\\' && i + 1 < corps.length) { valeur += corps[i + 1]; i += 2; continue; }
        if (c === '"') { ferme = true; i += 1; break; }
        valeur += c; i += 1;
      }
      if (!ferme) throw refus('filtre_refuse', 'Liste « in » mal fermée.');
      if (i < corps.length && corps[i] !== ',') throw refus('filtre_refuse', 'Liste « in » mal formée.');
    } else {
      const fin = corps.indexOf(',', i);
      valeur = fin === -1 ? corps.slice(i) : corps.slice(i, fin);
      if (valeur.includes('"')) throw refus('filtre_refuse', 'Liste « in » mal formée.');
      i = fin === -1 ? corps.length : fin;
    }
    sortie.push(valeur);
    if (sortie.length > 1000) throw refus('filtre_refuse', 'Liste « in » trop longue.');
    if (i >= corps.length) break;
    i += 1; // la virgule
  }
  return sortie;
}

/**
 * Motif de `like`/`ilike` : `*` est le joker (→ %), `\x` rend x littéral (le navigateur écrit `\*` pour une étoile), `%` et `_` restent des jokers SQL
 * (comme PostgREST). Le motif produit utilise `\` comme caractère d'échappement (celui de Postgres par défaut).
 */
export function motifLike(texte) {
  const t = String(texte);
  let sortie = '';
  for (let i = 0; i < t.length; i += 1) {
    const c = t[i];
    if (c === '\\' && i + 1 < t.length) {
      const suivant = t[i + 1];
      sortie += ['%', '_', '\\'].includes(suivant) ? `\\${suivant}` : suivant;
      i += 1;
    } else if (c === '\\') sortie += '\\\\';
    else if (c === '*') sortie += '%';
    else sortie += c;
  }
  return sortie;
}

/** « [not.]op.valeur » → { neg, op, valeur }. */
export function analyserFiltre(brut) {
  let t = String(brut);
  let neg = false;
  if (t.startsWith('not.')) { neg = true; t = t.slice(4); }
  const point = t.indexOf('.');
  if (point < 1) throw refus('filtre_refuse', 'Filtre mal formé (forme attendue : opérateur.valeur).');
  const op = t.slice(0, point);
  const valeur = t.slice(point + 1);
  if (!Object.hasOwn(OPERATEURS, op) && !['in', 'is', 'like', 'ilike'].includes(op)) throw refus('operateur_inconnu', 'Opérateur de filtre inconnu.');
  if (op === 'is' && !['null', 'true', 'false', 'unknown'].includes(valeur.toLowerCase())) throw refus('filtre_refuse', 'Le filtre « is » attend null, true, false ou unknown.');
  return { neg, op, valeur };
}

// ————— Catalogue —————

/** Requêtes du catalogue, lancées APRÈS `set local role` : elles ne voient que ce que le rôle a le droit de lire ou d'exécuter. */
export const SQL_CATALOGUE_RELATIONS = `select c.relname as relation, a.attname as colonne, format_type(a.atttypid, a.atttypmod) as type
from pg_catalog.pg_class c
join pg_catalog.pg_namespace n on n.oid = c.relnamespace
join pg_catalog.pg_attribute a on a.attrelid = c.oid
where n.nspname = 'public' and c.relkind in ('r', 'v', 'm', 'p', 'f') and a.attnum > 0 and not a.attisdropped
  and has_table_privilege(c.oid, 'SELECT')
order by c.relname, a.attnum`;

export const SQL_CATALOGUE_FONCTIONS = `select p.proname as nom, p.proretset as ensemble, (t.typtype = 'c') as composite, (p.prorettype = 'pg_catalog.void'::pg_catalog.regtype) as vide,
  coalesce(p.proargnames, array[]::text[]) as noms,
  coalesce(p.proargmodes::text[], array[]::text[]) as modes,
  array(select format_type(u.x, null) from unnest(coalesce(p.proallargtypes, p.proargtypes::oid[])) with ordinality as u(x, i) order by u.i) as types
from pg_catalog.pg_proc p
join pg_catalog.pg_namespace n on n.oid = p.pronamespace
join pg_catalog.pg_type t on t.oid = p.prorettype
where n.nspname = 'public' and p.prokind = 'f' and has_function_privilege(p.oid, 'EXECUTE')`;

/** Lignes des deux requêtes → { relations: Map<nom, Map<colonne, type>>, fonctions: Map<nom, [{ args:[{nom,type}], ensemble, composite, vide }]> }. */
export function construireCatalogue(lignesRelations, lignesFonctions) {
  const relations = new Map();
  for (const l of lignesRelations ?? []) {
    if (!NOM_SIMPLE.test(String(l.relation)) || !NOM_SIMPLE.test(String(l.colonne))) continue; // un nom exotique n'est jamais adressable
    if (!relations.has(l.relation)) relations.set(l.relation, new Map());
    relations.get(l.relation).set(l.colonne, String(l.type));
  }
  const fonctions = new Map();
  for (const f of lignesFonctions ?? []) {
    if (!NOM_SIMPLE.test(String(f.nom))) continue;
    const noms = f.noms ?? [];
    const modes = f.modes ?? [];
    const types = f.types ?? [];
    const args = [];
    let utilisable = true;
    types.forEach((type, i) => {
      const mode = modes.length ? modes[i] : 'i';
      if (mode === 'o' || mode === 't') return; // sortie
      if (mode === 'v') { utilisable = false; return; } // variadique : non compris
      const nom = noms[i];
      if (typeof nom !== 'string' || !NOM_SIMPLE.test(nom)) { utilisable = false; return; } // argument sans nom : appel nommé impossible
      args.push({ nom, type: String(type) });
    });
    if (!utilisable) continue;
    if (!fonctions.has(f.nom)) fonctions.set(f.nom, []);
    fonctions.get(f.nom).push({ args, ensemble: f.ensemble === true, composite: f.composite === true, vide: f.vide === true });
  }
  return { relations, fonctions };
}

function colonnesDe(catalogue, nom) {
  nomSql(nom, 'nom de table');
  const cols = catalogue.relations.get(nom);
  if (!cols) throw new ErreurPorte(404, 'relation_inconnue', `Table ou vue inconnue : ${citer(nom)}.`);
  return cols;
}

function colonne(cols, nom, nomRelation) {
  nomSql(nom, 'nom de colonne');
  if (!cols.has(nom)) throw refus('colonne_inconnue', `Colonne inconnue dans ${citer(nomRelation)} : ${citer(nom)}.`);
  return `"${nom}"`;
}

// ————— Conversion des valeurs écrites —————

const estJson = (type) => /^jsonb?$/.test(String(type));
/** Valeur envoyée à `pg` pour une colonne ou un argument du type donné (le JSON est passé en texte ; un tableau Postgres reste un tableau). */
export function valeurParametre(v, type) {
  if (v === undefined || v === null) return null;
  if (estJson(type)) return JSON.stringify(v);
  if (Array.isArray(v)) return String(type).endsWith('[]') ? v : JSON.stringify(v);
  if (typeof v === 'object') return JSON.stringify(v);
  return v;
}

// ————— Lecture —————

/** `select=a,b` → liste de colonnes ; `*` ou absent → toutes les colonnes du catalogue (nommées une à une). */
export function analyserSelect(brut, cols, nomRelation) {
  if (brut === undefined || brut === null || brut === '' || brut === '*') return [...cols.keys()];
  const noms = String(brut).split(',').map((s) => s.trim());
  if (noms.some((n) => n === '*')) throw refus('select_refuse', 'Le select mêle * et des colonnes : refusé.');
  return noms.map((n) => { colonne(cols, n, nomRelation); return n; });
}

function entierBorne(brut, max, nom) {
  const t = String(brut);
  if (!/^\d{1,9}$/.test(t)) throw refus('pagination_refusee', `« ${nom} » doit être un entier positif.`);
  return Math.min(Number(t), max);
}

/**
 * Paires de la requête (tableau [clé, valeur], dans l'ordre) → { colonnes, filtres, tri, limit, offset, onConflict }.
 * Toute clé qui n'est ni un réglage ni une colonne connue est refusée.
 */
export function analyserRequete(paires, catalogue, nomRelation) {
  const cols = colonnesDe(catalogue, nomRelation);
  const r = { colonnes: null, filtres: [], tri: [], limit: LIMITE_MAX, offset: 0, onConflict: null };
  const vus = new Set();
  for (const [cle, valeur] of paires) {
    if (CLES_REGLAGE.includes(cle)) {
      if (vus.has(cle)) throw refus('reglage_double', `Réglage « ${cle} » donné deux fois.`);
      vus.add(cle);
      if (cle === 'select') r.colonnes = analyserSelect(valeur, cols, nomRelation);
      else if (cle === 'limit') r.limit = entierBorne(valeur, LIMITE_MAX, 'limit');
      else if (cle === 'offset') r.offset = entierBorne(valeur, OFFSET_MAX, 'offset');
      else if (cle === 'order') r.tri = analyserOrdre(valeur, cols, nomRelation);
      else if (cle === 'on_conflict') r.onConflict = String(valeur).split(',').map((c) => { colonne(cols, c.trim(), nomRelation); return c.trim(); });
      else if (cle === 'columns') throw refus('reglage_refuse', 'Le réglage « columns » n\'est pas compris.');
      continue;
    }
    if (CLES_REFUSEES.includes(cle)) throw refus('reglage_refuse', `Le réglage « ${cle} » n'est pas compris.`);
    colonne(cols, cle, nomRelation);
    r.filtres.push({ col: cle, ...analyserFiltre(valeur) });
  }
  if (r.colonnes === null) r.colonnes = [...cols.keys()];
  return r;
}

/** `order=a.desc,b.asc.nullslast` → [{ col, sens, nulls }]. */
export function analyserOrdre(brut, cols, nomRelation) {
  return String(brut).split(',').map((morceau) => {
    const parts = morceau.trim().split('.');
    const col = parts.shift();
    colonne(cols, col, nomRelation);
    let sens = 'asc';
    let nulls = null;
    for (const p of parts) {
      if (p === 'asc' || p === 'desc') sens = p;
      else if (p === 'nullsfirst' || p === 'nullslast') nulls = p;
      else throw refus('ordre_refuse', 'Tri mal formé (colonne.asc ou colonne.desc).');
    }
    return { col, sens, nulls };
  });
}

/** Clause WHERE (sans le mot « where ») ; ajoute les valeurs dans `valeurs`. Rend '' s'il n'y a aucun filtre. */
export function clauseWhere(filtres, valeurs) {
  const morceaux = filtres.map(({ col, neg, op, valeur }) => {
    const c = `"${col}"`;
    let expr;
    if (op === 'is') {
      const v = valeur.toLowerCase();
      expr = `${c} is ${neg ? 'not ' : ''}${v}`;
      return expr;
    }
    if (op === 'in') {
      valeurs.push(listeIn(valeur));
      expr = `${c} = any($${valeurs.length})`;
    } else if (op === 'like' || op === 'ilike') {
      valeurs.push(motifLike(valeur));
      expr = `${c}::text ${op} $${valeurs.length}`;
    } else {
      valeurs.push(valeur);
      expr = `${c} ${OPERATEURS[op]} $${valeurs.length}`;
    }
    return neg ? `not (${expr})` : expr;
  });
  return morceaux.join(' and ');
}

const listeCols = (cols) => cols.map((c) => `"${c}"`).join(', ');

/** SELECT d'une lecture. */
export function sqlLecture(nomRelation, a) {
  const valeurs = [];
  const where = clauseWhere(a.filtres, valeurs);
  const ordre = a.tri.length ? ` order by ${a.tri.map((t) => `"${t.col}" ${t.sens}${t.nulls ? ` ${t.nulls === 'nullsfirst' ? 'nulls first' : 'nulls last'}` : ''}`).join(', ')}` : '';
  valeurs.push(a.limit, a.offset);
  const sql = `select ${listeCols(a.colonnes)} from public."${nomRelation}"${where ? ` where ${where}` : ''}${ordre} limit $${valeurs.length - 1} offset $${valeurs.length}`;
  return { sql, valeurs };
}

/** COUNT des mêmes filtres (Prefer: count=exact). */
export function sqlCompte(nomRelation, a) {
  const valeurs = [];
  const where = clauseWhere(a.filtres, valeurs);
  return { sql: `select count(*) as total from public."${nomRelation}"${where ? ` where ${where}` : ''}`, valeurs };
}

// ————— Écritures (n8n seulement : porte-base.js le contrôle) —————

/** INSERT d'UNE ligne (objet) ; `retour` : liste de colonnes à rendre, ou null. */
export function sqlInsertion(nomRelation, ligne, catalogue, retour) {
  const cols = colonnesDe(catalogue, nomRelation);
  if (!ligne || typeof ligne !== 'object' || Array.isArray(ligne)) throw refus('corps_refuse', 'Chaque ligne doit être un objet.');
  const cles = Object.keys(ligne);
  const valeurs = [];
  const noms = cles.map((k) => { colonne(cols, k, nomRelation); valeurs.push(valeurParametre(ligne[k], cols.get(k))); return `"${k}"`; });
  const corps = cles.length ? `(${noms.join(', ')}) values (${valeurs.map((_, i) => `$${i + 1}`).join(', ')})` : 'default values';
  return { sql: `insert into public."${nomRelation}" ${corps}${retour ? ` returning ${listeCols(retour)}` : ''}`, valeurs };
}

/** UPDATE avec les filtres de la requête (au moins un : jamais de mise à jour de toute une table). */
export function sqlMiseAJour(nomRelation, corps, a, catalogue, retour) {
  const cols = colonnesDe(catalogue, nomRelation);
  if (!corps || typeof corps !== 'object' || Array.isArray(corps) || Object.keys(corps).length === 0) throw refus('corps_refuse', 'Le corps doit être un objet non vide.');
  if (!a.filtres.length) throw refus('filtre_obligatoire', 'Une modification sans filtre est refusée.');
  const valeurs = [];
  const sets = Object.keys(corps).map((k) => { colonne(cols, k, nomRelation); valeurs.push(valeurParametre(corps[k], cols.get(k))); return `"${k}" = $${valeurs.length}`; });
  const where = clauseWhere(a.filtres, valeurs);
  return { sql: `update public."${nomRelation}" set ${sets.join(', ')} where ${where}${retour ? ` returning ${listeCols(retour)}` : ''}`, valeurs };
}

// ————— Fonctions (rpc) —————

/**
 * Appel nommé d'une fonction : `select * from public."f"("p_a" => $1::type, …)` (ensemble ou ligne composite) ou `select public."f"(…) as valeur`.
 * Le type de chaque argument vient du catalogue (jamais de la requête). Rend { sql, valeurs, forme: 'ensemble' | 'ligne' | 'valeur' | 'vide' }.
 */
export function sqlRpc(nomFonction, args, catalogue) {
  nomSql(nomFonction, 'nom de fonction');
  const variantes = catalogue.fonctions.get(nomFonction);
  if (!variantes) throw new ErreurPorte(404, 'fonction_inconnue', `Fonction inconnue : ${citer(nomFonction)}.`);
  const corps = args ?? {};
  if (typeof corps !== 'object' || Array.isArray(corps)) throw refus('corps_refuse', 'Les arguments doivent être un objet nommé.');
  const cles = Object.keys(corps);
  for (const k of cles) nomSql(k, 'nom d\'argument');
  const candidates = variantes.filter((v) => cles.every((k) => v.args.some((a) => a.nom === k)));
  if (candidates.length !== 1) throw refus(candidates.length ? 'fonction_ambigue' : 'argument_inconnu', candidates.length ? 'Appel ambigu : plusieurs versions de la fonction conviennent.' : 'Argument inconnu pour cette fonction.');
  const f = candidates[0];
  const valeurs = [];
  const liste = cles.map((k) => {
    const type = f.args.find((a) => a.nom === k).type;
    valeurs.push(valeurParametre(corps[k], type));
    return `"${k}" => $${valeurs.length}::${type}`;
  }).join(', ');
  const appel = `public."${nomFonction}"(${liste})`;
  if (f.ensemble) return { sql: `select * from ${appel}`, valeurs, forme: 'ensemble' };
  if (f.composite) return { sql: `select * from ${appel}`, valeurs, forme: 'ligne' };
  if (f.vide) return { sql: `select ${appel}`, valeurs, forme: 'vide' };
  return { sql: `select ${appel} as valeur`, valeurs, forme: 'valeur' };
}

/** Résultat d'une fonction à la manière de PostgREST : tableau (ensemble), objet (ligne), valeur seule, ou null. */
export function resultatRpc(forme, lignes) {
  if (forme === 'ensemble') return lignes;
  if (forme === 'ligne') return lignes[0] ?? null;
  if (forme === 'vide') return null;
  return lignes[0] ? lignes[0].valeur : null;
}

// ————— Erreurs de la base —————

/**
 * Erreur → { statut, corps } (forme PostgREST : code, message, details, hint). Seul un refus métier (P0001, levé par nos fonctions) garde son message et son
 * détail : les écrans et n8n lisent `details` (ex. « acces_base_refuse »). Tout le reste reçoit un message FIXE (jamais le texte de `pg`, qui peut citer la base).
 */
export function reponseErreur(e) {
  if (e instanceof ErreurPorte) return { statut: e.statut, corps: { code: e.code, message: e.message, details: e.details, hint: null } };
  const code = typeof e?.code === 'string' ? e.code : '';
  if (code === 'P0001') return { statut: 400, corps: { code, message: String(e.message ?? '').slice(0, 500), details: typeof e.detail === 'string' ? e.detail.slice(0, 200) : null, hint: null } };
  if (code === '23505') return { statut: 409, corps: { code, message: 'Doublon refusé par la base.', details: null, hint: null } };
  if (code === '42501') return { statut: 403, corps: { code, message: 'Accès refusé par la base.', details: null, hint: null } };
  if (/^2[23][0-9A-Z]{3}$/.test(code)) return { statut: 400, corps: { code, message: 'Valeur refusée par la base.', details: null, hint: null } };
  return { statut: 500, corps: { code: 'erreur_base', message: 'La base a un souci, réessaie dans un instant.', details: null, hint: null } };
}
