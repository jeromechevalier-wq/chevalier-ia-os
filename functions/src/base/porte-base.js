// Porte de la base (basePorte, 26/11/2026) : la seule entrée vers la base Cloud SQL d'une maison, pour les écrans Achats (navigateur) et pour n8n.
// Décision « porte option A » : le navigateur ne parle jamais à la base, seulement à cette fonction, qui seule a le connecteur Cloud SQL (cloudsql.js).
// Contrôle de l'appelant CÔTÉ SERVEUR, à chaque appel :
//  - navigateur : `Authorization: Bearer <jeton Firebase>` vérifié par le SDK (signature, projet, expiration, révocation), e-mail vérifié,
//    mentions `role` = « authenticated » et `espace_base` = l'espace de CETTE porte (posées par baseAccorderAcces), e-mail dans comptes_autorises
//    de reglages_maison/maison ; il LIT (tables et vues), appelle 3 fonctions seulement, et demande un lien temporaire vers un PDF ; jamais d'écriture directe ;
//  - n8n : en-tête `X-Porte-Cle` comparé en temps constant à la clé du secret BASE_PORTE_N8N ; lit, écrit (POST/PATCH), appelle les fonctions
//    (sauf celles de l'installation), dépose les PDF.
// Chaque requête tourne dans UNE transaction : `begin` → `set local role <rôle de la voie>` → set_config('app.espace_id', …, true) et
// set_config('app.utilisateur', …, true) → travail → `commit`. L'espace vient de la configuration du serveur (secret BASE_PORTE), JAMAIS de la requête.
// La sécurité par ligne de la base reste la 2e barrière (outils/base/REGLES.md).
// Configuration (secret BASE_PORTE, JSON, lu À L'EXÉCUTION : un secret absent ne fait jamais échouer un déploiement, la porte répond alors 503) :
//   { instance, base, utilisateur, mot_de_passe, espace, bucket, cle_liens, origines: [ "https://…" ] }
// Aucune valeur du secret, aucun e-mail et aucun message de `pg` n'est écrit dans le journal du serveur ni rendu à l'appelant.
import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import {
  ErreurPorte, analyserRoute, analyserRequete, sqlLecture, sqlCompte, sqlInsertion, sqlMiseAJour, sqlRpc, resultatRpc, reponseErreur,
  lirePrefer, veutObjet, contentRange, cheminObjet, encoderChemin, construireCatalogue, SQL_CATALOGUE_RELATIONS, SQL_CATALOGUE_FONCTIONS,
  LIGNES_MAX_ECRITURE,
} from './porte-requetes.js';
import { ErreurConnexionBase } from './cloudsql.js';
import { originesSite } from '../securite/maison.js';

const originesDuSite = () => originesSite();

export const NOM_SECRET_PORTE = 'BASE_PORTE';
export const NOM_SECRET_N8N = 'BASE_PORTE_N8N';
export const DUREE_CACHE_CONFIG_MS = 60_000;
export const DUREE_CACHE_CATALOGUE_MS = 300_000;
export const DUREE_LIEN_MAX_S = 600;
export const TAILLE_FICHIER_MAX = 20 * 1024 * 1024;
export const DELAI_REQUETE_MS = 10_000;
/** Une transaction ouverte puis abandonnée (fonction coupée en plein travail) est fermée par la base au bout de 60 s, sans bloquer de verrou plus longtemps. */
export const DELAI_TRANSACTION_INACTIVE_MS = 60_000;

/**
 * Rôle Postgres et identité de chaque voie : écrits ici, jamais lus dans la requête.
 * `assistant` (26/11/2026) : le serveur MCP d'une maison ouvre la base DANS SON PROPRE PROCESSUS (base/assistant-achats.js, par creerAccesBase), avec le rôle du navigateur
 * (lecture, plus la fonction demander_ticket_n8n) : aucune nouvelle entrée publique. L'utilisateur est l'e-mail VÉRIFIÉ de la connexion Google de l'assistant.
 */
export const ROLES = Object.freeze({ navigateur: 'porte', n8n: 'robot_reflets', assistant: 'porte' });
export const UTILISATEUR_N8N = 'n8n';
/** Les seules fonctions de la base que le navigateur peut appeler (relevé des écrans Achats, plan du 26/11/2026). */
export const RPC_NAVIGATEUR = Object.freeze(['lister_favoris_os', 'basculer_favori_os', 'demander_ticket_n8n']);
/**
 * Tables et vues que le NAVIGATEUR peut lire (relecture Fable du 26/11/2026 : sans cette liste, il lisait tout ce que le rôle `porte` voit, par exemple
 * les favoris ou les tickets d'un autre compte). Relevé exact des lectures des écrans (grep de `.lire(` dans les dossiers js/modules/achats… et js/modules/tableauachats/,
 * origin/main du 26/11/2026). Jamais : tickets_n8n, tickets_n8n_demandes, journal_modifications, favoris, favoris_os (verrouillé par un test).
 * Un nouvel écran qui lit une autre table l'ajoute ici, dans la même PR. La voie n8n n'a pas de liste (rôle robot_reflets).
 */
export const LECTURES_NAVIGATEUR = Object.freeze([
  'articles_fournisseur', 'articles_reference', 'chantiers', 'courriels_recus', 'etablissements_fournisseur', 'factures', 'fournisseurs',
  'fournisseurs_a_verifier', 'ibans_confirmes', 'lignes_facture', 'rapprochements_articles', 'suggestions_refusees',
  'v_td_chantiers', 'v_td_factures', 'v_td_fournisseurs_agences', 'v_td_fournisseurs_factures', 'v_td_fournisseurs_fiches',
  'v_td_prix_evolution', 'v_td_prix_lignes', 'v_td_prix_ponts',
]);
/**
 * Tables que l'ASSISTANT (serveur MCP d'une maison) peut lire : sous-ensemble strict de LECTURES_NAVIGATEUR (verrouillé par un test). Jamais : tickets, favoris, journal.
 * Colonnes nommées et tri obligatoire (base/assistant-achats.js) ; aucun outil « requête libre ».
 */
export const LECTURES_ASSISTANT = Object.freeze(['factures', 'chantiers', 'etablissements_fournisseur', 'fournisseurs', 'lignes_facture', 'ibans_confirmes']);
/** La seule fonction de la base que l'assistant appelle : un ticket neuf à usage unique pour UN appel à n8n (toute écriture passe par n8n). */
export const RPC_ASSISTANT = Object.freeze(['demander_ticket_n8n']);
/** Fonctions d'installation de la base : jamais par la porte, même pour n8n. */
export const RPC_INTERDITES_N8N = Object.freeze(['poser_socle', 'poser_reflet']);
/** Dossiers de stockage connus (un seul : les PDF des factures). */
export const DOSSIERS = Object.freeze(['factures']);
export const TYPES_FICHIER = /^(application\/pdf|application\/octet-stream|image\/(png|jpeg|webp|gif|tiff|heic))$/;
export const ENTETES_CORS = 'apikey, authorization, content-type, prefer, accept, range';
export const ENTETES_EXPOSES = 'Content-Range, Content-Length, Accept-Ranges';

// ————— Configuration —————

const ESPACE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const INSTANCE = /^[a-z][a-z0-9-]{4,61}[a-z0-9]:[a-z]+-[a-z]+[0-9]+:[a-z][a-z0-9-]{0,97}$/;
const NOM_PG = /^[a-z_][a-z0-9_]{0,62}$/;
const BUCKET = /^[a-z0-9][a-z0-9._-]{1,220}[a-z0-9]$/;

/** Erreur de configuration : la porte répond 503 « pas branchée ». */
export class ConfigurationAbsente extends Error {
  constructor(raison) { super(raison); this.name = 'ConfigurationAbsente'; }
}

/** Valide le JSON du secret BASE_PORTE. Lève ConfigurationAbsente (sans jamais citer une valeur). */
export function validerConfiguration(texte) {
  let c;
  try { c = JSON.parse(texte); } catch { throw new ConfigurationAbsente('secret illisible'); }
  if (!c || typeof c !== 'object' || Array.isArray(c)) throw new ConfigurationAbsente('secret mal formé');
  const texteNonVide = (v) => typeof v === 'string' && v.trim() !== '';
  if (!texteNonVide(c.instance) || !INSTANCE.test(c.instance)) throw new ConfigurationAbsente('instance mal formée');
  if (!texteNonVide(c.base) || !NOM_PG.test(c.base)) throw new ConfigurationAbsente('base mal formée');
  if (!texteNonVide(c.utilisateur) || !NOM_PG.test(c.utilisateur)) throw new ConfigurationAbsente('utilisateur mal formé');
  if (!texteNonVide(c.mot_de_passe)) throw new ConfigurationAbsente('mot de passe absent');
  if (!texteNonVide(c.espace) || !ESPACE.test(c.espace)) throw new ConfigurationAbsente('espace mal formé');
  if (!texteNonVide(c.bucket) || !BUCKET.test(c.bucket)) throw new ConfigurationAbsente('réserve de fichiers mal formée');
  if (typeof c.cle_liens !== 'string' || c.cle_liens.length < 32) throw new ConfigurationAbsente('clé des liens trop courte');
  const origines = c.origines ?? [];
  if (!Array.isArray(origines)) throw new ConfigurationAbsente('origines mal formées');
  const propres = origines.map((o) => {
    let u;
    try { u = new URL(String(o)); } catch { throw new ConfigurationAbsente('origine mal formée'); }
    if (u.protocol !== 'https:' || u.origin !== String(o).replace(/\/$/, '')) throw new ConfigurationAbsente('origine mal formée (https://hôte attendu)');
    return u.origin;
  });
  return Object.freeze({
    instance: c.instance, base: c.base, utilisateur: c.utilisateur, mot_de_passe: c.mot_de_passe,
    espace: c.espace, bucket: c.bucket, cle_liens: c.cle_liens, origines: Object.freeze(propres),
  });
}

/**
 * Lecteur avec cache court. `lireSecret(nom)` : async → texte. Un ÉCHEC est aussi gardé `dureeMs` (cache négatif, relecture Fable du 26/11/2026) :
 * dans une maison sans base (le secret n'existe pas), la fonction est publique et ne doit pas interroger Secret Manager à chaque requête.
 */
export function creerLecteurConfiguration({ lireSecret, maintenant = Date.now, dureeMs = DUREE_CACHE_CONFIG_MS }) {
  let cache = null; // { valeur } ou { erreur }, avec expire
  return async function lire() {
    const t = maintenant();
    if (cache && cache.expire > t) { if (cache.erreur) throw cache.erreur; return cache.valeur; }
    try {
      let texte;
      try { texte = await lireSecret(NOM_SECRET_PORTE); } catch { throw new ConfigurationAbsente('secret introuvable'); }
      const valeur = validerConfiguration(texte);
      cache = { valeur, expire: t + dureeMs };
      return valeur;
    } catch (e) {
      const erreur = e instanceof ConfigurationAbsente ? e : new ConfigurationAbsente('secret illisible');
      cache = { erreur, expire: t + dureeMs };
      throw erreur;
    }
  };
}

/** Clé de n8n (secret BASE_PORTE_N8N) avec le même cache. Clé absente ou trop courte : lève (n8n est alors refusé). */
export function creerLecteurCleN8n({ lireSecret, maintenant = Date.now, dureeMs = DUREE_CACHE_CONFIG_MS }) {
  let cache = null; // succès ou échec, gardé dureeMs (cache négatif)
  return async function lire() {
    const t = maintenant();
    if (cache && cache.expire > t) { if (cache.erreur) throw cache.erreur; return cache.valeur; }
    let valeur;
    try { valeur = String(await lireSecret(NOM_SECRET_N8N)).trim(); } catch { valeur = ''; }
    if (valeur.length < 32) {
      const erreur = new ConfigurationAbsente('clé n8n absente ou trop courte');
      cache = { erreur, expire: t + dureeMs };
      throw erreur;
    }
    cache = { valeur, expire: t + dureeMs };
    return valeur;
  };
}

// ————— Comparaisons et liens signés —————

/** Égalité en temps constant (les deux côtés sont d'abord réduits à une empreinte de même longueur). */
export function egalTempsConstant(a, b) {
  const ea = createHash('sha256').update(String(a)).digest();
  const eb = createHash('sha256').update(String(b)).digest();
  return timingSafeEqual(ea, eb);
}

const signature = (cle, chemin, expiration) => createHmac('sha256', cle).update(`${chemin}|${expiration}`).digest('base64url');

/** Jeton d'un lien temporaire : « <expiration en secondes>.<HMAC-SHA256(chemin|expiration)> ». */
export function jetonLien(cle, chemin, expiration) {
  return `${expiration}.${signature(cle, chemin, expiration)}`;
}

/** Vrai si le jeton est bien formé, signé pour CE chemin, non expiré et pas trop lointain. `maintenantS` en secondes. */
export function jetonLienValide(cle, chemin, jeton, maintenantS) {
  const m = /^(\d{10})\.([A-Za-z0-9_-]{43})$/.exec(String(jeton ?? ''));
  if (!m) return false;
  const expiration = Number(m[1]);
  if (expiration < maintenantS || expiration > maintenantS + DUREE_LIEN_MAX_S + 60) return false;
  const attendu = Buffer.from(signature(cle, chemin, expiration));
  const recu = Buffer.from(m[2]);
  return attendu.length === recu.length && timingSafeEqual(attendu, recu);
}

// ————— Stockage réel (Cloud Storage, SDK d'administration) —————

/** Adaptateur Cloud Storage : `ecrire(bucket, nom, contenu, { contentType, remplacer })`, `lire(bucket, nom)` → { contenu, contentType } | null. */
export function creerStockageGcs({ obtenir } = {}) {
  const storage = obtenir ?? (async () => {
    const { getApps, initializeApp } = await import('firebase-admin/app');
    const { getStorage } = await import('firebase-admin/storage');
    if (!getApps().length) initializeApp();
    return getStorage();
  });
  return {
    async ecrire(bucket, nom, contenu, { contentType, remplacer }) {
      const fichier = (await storage()).bucket(bucket).file(nom);
      try {
        await fichier.save(contenu, { contentType, resumable: false, ...(remplacer ? {} : { preconditionOpts: { ifGenerationMatch: 0 } }) });
      } catch (e) {
        if (e?.code === 412) throw new ErreurPorte(409, 'Duplicate', 'Le fichier existe déjà.');
        throw e;
      }
    },
    async lire(bucket, nom) {
      const fichier = (await storage()).bucket(bucket).file(nom);
      try {
        const [[meta], [contenu]] = await Promise.all([fichier.getMetadata(), fichier.download()]);
        return { contenu, contentType: meta?.contentType ?? null };
      } catch (e) {
        if (e?.code === 404) return null;
        throw e;
      }
    },
  };
}

// ————— Réponses —————

function envoyerJson(res, statut, corps, entetes = {}) {
  res.status(statut);
  res.set({ 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...entetes });
  res.send(JSON.stringify(corps));
}

function envoyerVide(res, statut, entetes = {}) {
  res.status(statut);
  res.set({ 'Cache-Control': 'no-store', ...entetes });
  res.end();
}

const entete = (req, nom) => {
  const v = typeof req.get === 'function' ? req.get(nom) : req.headers?.[nom.toLowerCase()];
  return typeof v === 'string' ? v : (Array.isArray(v) ? v[0] : undefined);
};

/** Une ligne du journal du serveur : la voie, l'action, le statut, un code ; jamais d'e-mail, de valeur, ni de texte de `pg`. */
export function ligneDeJournalPorte({ voie, action, statut, code, severite }) {
  return JSON.stringify({ severity: severite ?? (statut >= 500 ? 'ERROR' : (statut >= 400 ? 'WARNING' : 'INFO')), message: `basePorte ${voie ?? '-'} ${action ?? '-'} ${statut}`, ...(code ? { code: String(code).slice(0, 40) } : {}) });
}

// ————— Le gestionnaire —————

/**
 * Accès à la base partagé (26/11/2026) : la transaction et le catalogue de la porte, utilisés par le gestionnaire HTTP (basePorte) ET par l'assistant du serveur MCP
 * d'une maison (base/assistant-achats.js), dans son propre processus. Rend `{ dansTransaction(config, appelant, lectureSeule, travail) }` :
 * `appelant` = { voie: 'navigateur' | 'n8n' | 'assistant', utilisateur } ; le rôle vient de ROLES, jamais de la requête ; `travail(cx, catalogue)`.
 */
export function creerAccesBase({ ouvrirConnexion, maintenant = Date.now }) {
  const catalogues = new Map(); // rôle → { valeur, expire }

  async function catalogue(cx, role) {
    const c = catalogues.get(role);
    if (c && c.expire > maintenant()) return c.valeur;
    const relations = await cx.interroger(SQL_CATALOGUE_RELATIONS);
    const fonctions = await cx.interroger(SQL_CATALOGUE_FONCTIONS);
    const valeur = construireCatalogue(relations.rows, fonctions.rows);
    catalogues.set(role, { valeur, expire: maintenant() + DUREE_CACHE_CATALOGUE_MS });
    return valeur;
  }

  /** Une transaction : begin → rôle → espace et utilisateur (locaux à la transaction) → travail → commit ; rollback et connexion détruite si besoin. */
  async function dansTransaction(config, appelant, lectureSeule, travail) {
    const cx = await ouvrirConnexion(config);
    let casse = false;
    try {
      await cx.interroger(lectureSeule ? 'begin read only' : 'begin');
      await cx.interroger(`set local role ${ROLES[appelant.voie]}`); // nom constant (ROLES), jamais lu dans la requête
      await cx.interroger(
        "select set_config('app.espace_id', $1, true), set_config('app.utilisateur', $2, true), set_config('statement_timeout', $3, true), set_config('idle_in_transaction_session_timeout', $4, true)",
        [config.espace, appelant.utilisateur, String(DELAI_REQUETE_MS), String(DELAI_TRANSACTION_INACTIVE_MS)],
      );
      const resultat = await travail(cx, await catalogue(cx, ROLES[appelant.voie]));
      await cx.interroger('commit');
      return resultat;
    } catch (e) {
      try { await cx.interroger('rollback'); } catch { casse = true; }
      throw e;
    } finally {
      cx.liberer(casse);
    }
  }

  return { dansTransaction };
}

/**
 * Fabrique le gestionnaire HTTP `(req, res)`. Tout est injecté :
 *  - lireConfiguration : async → configuration validée (lève ConfigurationAbsente) ;
 *  - lireCleN8n : async → clé de n8n (lève si absente) ;
 *  - verifierJeton(jeton) : async → mentions décodées du jeton Firebase (lève s'il est invalide, expiré ou révoqué) ;
 *  - estCompteAutorise(email) : async → vrai si l'e-mail (minuscules) est dans comptes_autorises de reglages_maison/maison (fiche illisible = faux) ;
 *  - ouvrirConnexion(config) : async → { interroger(sql, valeurs) → { rows, rowCount }, liberer(casse) } ;
 *  - stockage : { ecrire, lire } ; maintenant : horloge (ms) ; journal(evenement).
 */
export function creerGestionnaireBasePorte({ lireConfiguration, lireCleN8n, verifierJeton, estCompteAutorise, ouvrirConnexion, stockage, originesParDefaut = originesDuSite, maintenant = Date.now, journal = () => {} }) {
  const { dansTransaction } = creerAccesBase({ ouvrirConnexion, maintenant });
  let dernierAvisNonBranchee = -Infinity; // « pas branchée » journalisé une fois par période de cache au plus

  /** Qui appelle ? { voie: 'n8n' | 'navigateur', utilisateur }. Lève ErreurPorte 401/403. */
  async function identifier(req, config) {
    const cleFournie = entete(req, 'x-porte-cle');
    if (cleFournie !== undefined) {
      let attendue;
      try { attendue = await lireCleN8n(); } catch { throw new ErreurPorte(401, 'cle_refusee', 'Clé refusée.'); }
      if (!egalTempsConstant(cleFournie, attendue)) throw new ErreurPorte(401, 'cle_refusee', 'Clé refusée.');
      return { voie: 'n8n', utilisateur: UTILISATEUR_N8N };
    }
    const m = /^Bearer\s+(\S+)$/i.exec(entete(req, 'authorization') ?? '');
    if (!m) throw new ErreurPorte(401, 'connexion_necessaire', 'Connexion nécessaire.');
    let mentions;
    try { mentions = await verifierJeton(m[1]); } catch { throw new ErreurPorte(401, 'jeton_refuse', 'Jeton refusé : reconnecte-toi.'); }
    const email = typeof mentions?.email === 'string' ? mentions.email.trim().toLowerCase() : '';
    if (mentions?.email_verified !== true || !email) throw new ErreurPorte(403, 'acces_refuse', 'Accès à la base refusé.', 'acces_base_refuse');
    if (mentions.role !== 'authenticated' || mentions.espace_base !== config.espace) throw new ErreurPorte(403, 'acces_refuse', 'Accès à la base refusé.', 'acces_base_refuse');
    let autorise = false;
    try { autorise = (await estCompteAutorise(email)) === true; } catch { autorise = false; }
    if (!autorise) throw new ErreurPorte(403, 'acces_refuse', 'Accès à la base refusé.', 'acces_base_refuse');
    return { voie: 'navigateur', utilisateur: email };
  }

  /** Ce que chaque voie a le droit de faire (contrôlé AVANT d'ouvrir la base). */
  function autoriser(appelant, route, methode) {
    const nav = appelant.voie === 'navigateur';
    if (route.type === 'table') {
      if (!['GET', 'POST', 'PATCH'].includes(methode)) throw new ErreurPorte(405, 'methode_refusee', 'Méthode refusée.');
      if (nav && methode !== 'GET') throw new ErreurPorte(403, 'ecriture_refusee', 'Écriture directe refusée : passe par l\'action prévue.');
      if (nav && !LECTURES_NAVIGATEUR.includes(route.nom)) throw new ErreurPorte(403, 'lecture_refusee', 'Lecture refusée pour cette table.');
    } else if (route.type === 'rpc') {
      if (methode !== 'POST') throw new ErreurPorte(405, 'methode_refusee', 'Méthode refusée.');
      if (nav && !RPC_NAVIGATEUR.includes(route.nom)) throw new ErreurPorte(403, 'fonction_refusee', 'Fonction refusée.');
      if (!nav && RPC_INTERDITES_N8N.includes(route.nom)) throw new ErreurPorte(403, 'fonction_refusee', 'Fonction refusée.');
    } else if (route.type === 'signer') {
      if (methode !== 'POST') throw new ErreurPorte(405, 'methode_refusee', 'Méthode refusée.');
      if (!nav) throw new ErreurPorte(403, 'lien_refuse', 'Les liens temporaires sont réservés aux écrans.');
    } else if (route.type === 'deposer') {
      if (methode !== 'POST') throw new ErreurPorte(405, 'methode_refusee', 'Méthode refusée.');
      if (nav) throw new ErreurPorte(403, 'ecriture_refusee', 'Dépôt de fichier refusé.');
    }
  }

  function pairesDe(req) {
    const u = new URL(req.originalUrl ?? req.url ?? '/', 'http://porte.invalid');
    return [...u.searchParams.entries()];
  }

  function cheminDe(req) {
    try { return new URL(req.originalUrl ?? req.url ?? '/', 'http://porte.invalid').pathname; } catch { return '/'; }
  }

  async function lireTable(req, res, config, appelant, route) {
    const prefer = lirePrefer(entete(req, 'prefer'));
    const objet = veutObjet(entete(req, 'accept'));
    const paires = pairesDe(req);
    const { lignes, total, offset } = await dansTransaction(config, appelant, true, async (cx, cat) => {
      const a = analyserRequete(paires, cat, route.nom);
      const l = sqlLecture(route.nom, a);
      const r = await cx.interroger(l.sql, l.valeurs);
      let t = null;
      if (prefer.count === 'exact') {
        const c = sqlCompte(route.nom, a);
        t = Number((await cx.interroger(c.sql, c.valeurs)).rows[0]?.total ?? 0);
      }
      return { lignes: r.rows, total: t, offset: a.offset };
    });
    if (objet) {
      if (lignes.length !== 1) return envoyerJson(res, 406, { code: 'PGRST116', message: 'Une seule ligne était attendue.', details: `${lignes.length} lignes`, hint: null });
      return envoyerJson(res, 200, lignes[0], { 'Content-Range': contentRange(offset, 1, total) });
    }
    return envoyerJson(res, 200, lignes, { 'Content-Range': contentRange(offset, lignes.length, total) });
  }

  async function ecrireTable(req, res, config, appelant, route, methode) {
    const prefer = lirePrefer(entete(req, 'prefer'));
    const objet = veutObjet(entete(req, 'accept'));
    const paires = pairesDe(req);
    const corps = req.body;
    const lignes = await dansTransaction(config, appelant, false, async (cx, cat) => {
      const a = analyserRequete(paires, cat, route.nom);
      const selectDonne = paires.some(([k]) => k === 'select');
      const retour = prefer.retour === 'representation' || selectDonne ? a.colonnes : null;
      if (methode === 'PATCH') {
        const m = sqlMiseAJour(route.nom, corps, a, cat, retour);
        return (await cx.interroger(m.sql, m.valeurs)).rows;
      }
      if (prefer.resolution === 'merge-duplicates') throw new ErreurPorte(400, 'resolution_refusee', 'La fusion des doublons n\'est pas comprise.');
      const liste = Array.isArray(corps) ? corps : [corps];
      if (liste.length === 0 || liste.length > LIGNES_MAX_ECRITURE) throw new ErreurPorte(400, 'corps_refuse', `Entre 1 et ${LIGNES_MAX_ECRITURE} lignes par envoi.`);
      const sortie = [];
      for (const ligne of liste) {
        const ins = sqlInsertion(route.nom, ligne, cat, retour);
        // Chaque ligne dans un SAVEPOINT : avec « resolution=ignore-duplicates », un doublon (23505) est ignoré sans annuler les autres lignes
        // (ON CONFLICT est impossible sur la vue factures, qui a un déclencheur INSTEAD OF).
        await cx.interroger('savepoint porte_ligne');
        try {
          const r = await cx.interroger(ins.sql, ins.valeurs);
          await cx.interroger('release savepoint porte_ligne');
          sortie.push(...r.rows);
        } catch (e) {
          if (e?.code === '23505' && prefer.resolution === 'ignore-duplicates') {
            await cx.interroger('rollback to savepoint porte_ligne');
            await cx.interroger('release savepoint porte_ligne');
            continue;
          }
          throw e;
        }
      }
      return sortie;
    });
    const statut = methode === 'POST' ? 201 : (prefer.retour === 'representation' ? 200 : 204);
    if (prefer.retour !== 'representation') return envoyerVide(res, statut);
    if (objet) {
      if (lignes.length !== 1) return envoyerJson(res, 406, { code: 'PGRST116', message: 'Une seule ligne était attendue.', details: `${lignes.length} lignes`, hint: null });
      return envoyerJson(res, statut, lignes[0]);
    }
    return envoyerJson(res, statut, lignes);
  }

  async function appelerFonction(req, res, config, appelant, route) {
    const args = req.body === undefined || req.body === null || req.body === '' ? {} : req.body;
    const valeur = await dansTransaction(config, appelant, false, async (cx, cat) => {
      const r = sqlRpc(route.nom, args, cat);
      return resultatRpc(r.forme, (await cx.interroger(r.sql, r.valeurs)).rows);
    });
    return envoyerJson(res, 200, valeur);
  }

  function signerLien(req, res, config, route) {
    const chemin = cheminObjet(route.segments);
    const demande = Number(req.body?.expiresIn);
    const duree = Number.isFinite(demande) && demande >= 1 ? Math.min(Math.floor(demande), DUREE_LIEN_MAX_S) : DUREE_LIEN_MAX_S;
    const expiration = Math.floor(maintenant() / 1000) + duree;
    // Adresse RELATIVE (même origine que la porte) : js/os/supabase.js refuse toute autre forme.
    const signedURL = `/storage/v1/object/sign/${route.dossier}/${encoderChemin(chemin)}?token=${jetonLien(config.cle_liens, `${route.dossier}/${chemin}`, expiration)}`;
    return envoyerJson(res, 200, { signedURL });
  }

  async function servirLien(req, res, config, route) {
    if (!DOSSIERS.includes(route.dossier)) throw new ErreurPorte(404, 'introuvable', 'Introuvable.');
    const chemin = cheminObjet(route.segments);
    const jeton = new URL(req.originalUrl ?? req.url ?? '/', 'http://porte.invalid').searchParams.get('token');
    if (!jetonLienValide(config.cle_liens, `${route.dossier}/${chemin}`, jeton, Math.floor(maintenant() / 1000))) throw new ErreurPorte(400, 'lien_invalide', 'Lien expiré ou invalide.');
    const fichier = await stockage.lire(config.bucket, `${route.dossier}/${chemin}`);
    if (!fichier) throw new ErreurPorte(404, 'introuvable', 'Fichier introuvable.');
    const type = typeof fichier.contentType === 'string' && TYPES_FICHIER.test(fichier.contentType) ? fichier.contentType : 'application/octet-stream';
    res.status(200);
    res.set({ 'Content-Type': type, 'Content-Disposition': 'inline', 'Cache-Control': 'private, max-age=60', 'X-Content-Type-Options': 'nosniff', 'Accept-Ranges': 'none' });
    res.send(fichier.contenu);
  }

  async function deposer(req, res, config, route) {
    if (!DOSSIERS.includes(route.dossier)) throw new ErreurPorte(404, 'introuvable', 'Dossier inconnu.');
    const chemin = cheminObjet(route.segments);
    const contenu = Buffer.isBuffer(req.rawBody) ? req.rawBody : (Buffer.isBuffer(req.body) ? req.body : null);
    if (!contenu || contenu.length === 0) throw new ErreurPorte(400, 'fichier_vide', 'Fichier vide.');
    if (contenu.length > TAILLE_FICHIER_MAX) throw new ErreurPorte(413, 'fichier_trop_gros', 'Fichier trop gros.');
    const brut = String(entete(req, 'content-type') ?? 'application/octet-stream').split(';')[0].trim().toLowerCase();
    if (!TYPES_FICHIER.test(brut)) throw new ErreurPorte(415, 'type_refuse', 'Type de fichier refusé.');
    const remplacer = String(entete(req, 'x-upsert') ?? '').toLowerCase() === 'true';
    await stockage.ecrire(config.bucket, `${route.dossier}/${chemin}`, contenu, { contentType: brut, remplacer });
    return envoyerJson(res, 200, { Key: `${route.dossier}/${chemin}` });
  }

  return async function gestionnaire(req, res) {
    const methode = String(req.method ?? 'GET').toUpperCase();
    const route = analyserRoute(methode, cheminDe(req));
    let voie = null;
    try {
      const origine = entete(req, 'origin');
      const corsPour = (origines) => {
        const ok = typeof origine === 'string' && origines.includes(origine);
        return { ok, entetes: ok ? { 'Access-Control-Allow-Origin': origine, Vary: 'Origin', 'Access-Control-Expose-Headers': ENTETES_EXPOSES } : { Vary: 'Origin' } };
      };
      let config;
      try { config = await lireConfiguration(); } catch (e) {
        // Sans configuration, les origines connues sont celles du site de la maison (https://<projet>.web.app) : l'écran peut lire le 503 et dire « pas branchée ».
        const t = maintenant();
        if (t - dernierAvisNonBranchee >= DUREE_CACHE_CONFIG_MS) {
          dernierAvisNonBranchee = t;
          journal({ voie, action: route.type, statut: 503, code: e instanceof ConfigurationAbsente ? 'pas_branchee' : 'secret', severite: 'WARNING' });
        }
        let parDefaut = [];
        try { parDefaut = originesParDefaut(); } catch { parDefaut = []; }
        return envoyerJson(res, 503, { code: 'porte_non_branchee', message: 'La base n\'est pas encore branchée.', details: null, hint: null }, corsPour(parDefaut).entetes);
      }

      // CORS : seulement pour les origines de la configuration (le site de la maison) ; jamais « * ».
      const { ok: origineOk, entetes: cors } = corsPour(config.origines);
      if (methode === 'OPTIONS') {
        if (!origineOk) return envoyerVide(res, 403);
        return envoyerVide(res, 204, { ...cors, 'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS', 'Access-Control-Allow-Headers': ENTETES_CORS, 'Access-Control-Max-Age': '600' });
      }
      for (const [k, v] of Object.entries(cors)) res.set(k, v);

      // Les nœuds n8n « Vérifier le JWT Supabase » passent par ici : toujours 401, ils prennent alors la voie du ticket.
      if (route.type === 'auth') throw new ErreurPorte(401, 'non_authentifie', 'Pas de session Supabase derrière la porte.');
      if (route.type === 'inconnu') throw new ErreurPorte(404, 'introuvable', 'Introuvable.');
      if (route.type === 'lien') { voie = 'lien'; return await servirLien(req, res, config, route); }

      const appelant = await identifier(req, config);
      voie = appelant.voie;
      autoriser(appelant, route, methode);
      if (route.type === 'table') return await (methode === 'GET' ? lireTable(req, res, config, appelant, route) : ecrireTable(req, res, config, appelant, route, methode));
      if (route.type === 'rpc') return await appelerFonction(req, res, config, appelant, route);
      if (route.type === 'signer') {
        if (!DOSSIERS.includes(route.dossier)) throw new ErreurPorte(404, 'introuvable', 'Dossier inconnu.');
        return signerLien(req, res, config, route);
      }
      if (route.type === 'deposer') return await deposer(req, res, config, route);
      throw new ErreurPorte(404, 'introuvable', 'Introuvable.');
    } catch (e) {
      if (e instanceof ErreurConnexionBase) {
        journal({ voie, action: route.type, statut: 503, code: e.etat ?? 'connexion' });
        return envoyerJson(res, 503, { code: 'base_injoignable', message: 'La base a un souci, réessaie dans un instant.', details: null, hint: null });
      }
      const { statut, corps } = reponseErreur(e);
      journal({ voie, action: route.type, statut, code: corps.code });
      return envoyerJson(res, statut, corps);
    }
  };
}
