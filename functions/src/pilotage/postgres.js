// Module Pilotage : LE SEUL fichier du dépôt qui parle à Postgres (paquet `pg`, chargé à la demande ; un test le borne, modèle coeur/sms-direct.js).
// La connexion (hôte, port, base, utilisateur, mot de passe, certificat racine `ca`) vit dans Secret Manager (JSON), lue À L'EXÉCUTION : un secret absent ne fait jamais échouer un déploiement.
// Garde-fous :
//  - TLS vérifié (`rejectUnauthorized: true` avec le certificat `ca` du secret) ; jamais de repli sans vérification ;
//  - compte en lecture seule qui ne voit que des vues `v_*` (réglé côté base) ; pooler en mode transaction : requêtes simples, jamais de requête préparée nommée ;
//  - `statement_timeout` de 10 s, UNE connexion par appel, fermeture garantie par l'appelant (`fermer`) ;
//  - aucune valeur du secret ni aucun message de `pg` (qui peut citer l'hôte ou l'utilisateur) ne sort d'ici : toute panne devient une `ErreurPostgres` au message fixe.
// `clientPg` est INJECTÉ (`{ Client, types }`, ou une fonction qui le rend) : les tests n'ont pas besoin du vrai paquet.

export const NOM_SECRET_PILOTAGE = 'SUPABASE_INDICATEURS';
export const DELAI_REQUETE_MS = 10_000;
export const DELAI_CONNEXION_MS = 8_000;
export const DELAI_FERMETURE_MS = 2_000; // fermer une connexion ne bloque jamais la réponse plus longtemps

/** Attend `promesse` au plus `ms` ; ne lève jamais (une fermeture qui échoue ou traîne est abandonnée). */
export async function avecDelai(travail, ms) {
  let minuteur;
  try {
    await Promise.race([Promise.resolve().then(travail).catch(() => {}), new Promise((ok) => { minuteur = setTimeout(ok, ms); })]);
  } finally { clearTimeout(minuteur); }
}

/** `type` : 'secret' (introuvable ou illisible) | 'connexion' | 'requete'. Le message est fixe : jamais de détail technique. `etat` = code SQLSTATE à 5 caractères s'il y en a un (pour le journal du serveur). */
export class ErreurPostgres extends Error {
  constructor(type, etat) {
    super('La base n\'a pas pu être lue.');
    this.name = 'ErreurPostgres';
    this.type = type;
    if (typeof etat === 'string' && /^[0-9A-Z]{5}$/.test(etat)) this.etat = etat;
  }
}

/** Lit le JSON du secret. Rend la configuration du client `pg` ; refuse un secret incomplet (certificat compris : pas de connexion sans vérification TLS). */
export function lireConnexion(texte) {
  let c;
  try { c = JSON.parse(texte); } catch { throw new ErreurPostgres('secret'); }
  if (!c || typeof c !== 'object') throw new ErreurPostgres('secret');
  const port = Number(c.port);
  const chaine = (v) => typeof v === 'string' && v.trim() !== '';
  if (!chaine(c.hote) || !Number.isInteger(port) || port < 1 || port > 65535 || !chaine(c.base) || !chaine(c.utilisateur) || !chaine(c.mot_de_passe) || !chaine(c.ca)) throw new ErreurPostgres('secret');
  return { host: c.hote.trim(), port, database: c.base.trim(), user: c.utilisateur.trim(), password: c.mot_de_passe, ca: c.ca };
}

// Types Postgres (OID) : nombres rendus en nombres, dates en chaînes ISO (sinon les axes des graphiques sont faux).
const OID = Object.freeze({ int8: 20, date: 1082, timestamp: 1114, timestamptz: 1184, numeric: 1700 });

/** Convertisseur d'une valeur reçue en texte, pour les types ci-dessus ; `undefined` pour les autres (le convertisseur par défaut de `pg` reste alors en place). */
export function convertirType(oid, texte) {
  if (texte === null || texte === undefined) return null;
  if (oid === OID.numeric || oid === OID.int8) { const n = Number(texte); return Number.isFinite(n) ? n : texte; }
  if (oid === OID.date) return String(texte); // « AAAA-MM-JJ », sans fuseau (le convertisseur par défaut en ferait une date locale)
  if (oid === OID.timestamp) return String(texte).replace(' ', 'T');
  if (oid === OID.timestamptz) { const d = new Date(texte); return Number.isNaN(d.getTime()) ? String(texte) : d.toISOString(); }
  return undefined;
}
const TYPES_CONVERTIS = new Set(Object.values(OID));
/** Objet `types` d'un client `pg` : nos convertisseurs, puis ceux de `pg` pour tout le reste. */
export function creerTypes(typesPg) {
  return {
    getTypeParser(oid, format) {
      if (TYPES_CONVERTIS.has(oid) && (format === undefined || format === 'text')) return (texte) => convertirType(oid, texte);
      return typesPg.getTypeParser(oid, format);
    },
  };
}

async function chargerPg() {
  const m = await import('pg');
  return m.default ?? m;
}

/**
 * Rend `ouvrir()` : lit le secret, ouvre UNE connexion TLS et rend `{ interroger(sql) -> lignes, fermer() }`.
 * Toute panne (secret, réseau, certificat, requête) lève une `ErreurPostgres` sans détail.
 */
export function creerConnecteurPostgres({ lireSecret, clientPg = chargerPg, nomSecret = NOM_SECRET_PILOTAGE, delaiFermetureMs = DELAI_FERMETURE_MS, delaiConnexionMs = DELAI_CONNEXION_MS + 2_000 }) {
  return async function ouvrir() {
    let config;
    try { config = lireConnexion(await lireSecret(nomSecret)); } catch { throw new ErreurPostgres('secret'); }
    let client;
    try {
      const pg = typeof clientPg === 'function' ? await clientPg() : clientPg;
      const { ca, ...reste } = config;
      client = new pg.Client({
        ...reste,
        ssl: { ca, rejectUnauthorized: true },
        statement_timeout: DELAI_REQUETE_MS,
        query_timeout: DELAI_REQUETE_MS + 2_000,
        connectionTimeoutMillis: DELAI_CONNEXION_MS,
        types: creerTypes(pg.types),
      });
      client.on('error', () => {}); // une coupure en cours de route ne doit pas faire tomber la fonction ; l'erreur est rendue par la requête en cours
      let minuteur;
      try {
        // le délai propre de `pg` (connectionTimeoutMillis) peut ne pas jouer si le serveur laisse la connexion ouverte sans répondre : course avec un minuteur
        await Promise.race([client.connect(), new Promise((_, non) => { minuteur = setTimeout(() => non(new Error('délai')), delaiConnexionMs); })]);
      } finally { clearTimeout(minuteur); }
    } catch (e) {
      if (client) await avecDelai(() => client.end(), delaiFermetureMs); // un client à moitié ouvert ne doit pas bloquer l'échec
      throw new ErreurPostgres('connexion', e?.code);
    }
    let ferme = false;
    let file = Promise.resolve(); // une seule requête à la fois sur la connexion (pg 9 refusera d'en empiler) ; les appels restent lancés « en parallèle » par le service
    return {
      interroger(sql) {
        const p = file.then(async () => {
          if (ferme) throw new ErreurPostgres('requete');
          try { return (await client.query(sql)).rows; } catch (e) { throw new ErreurPostgres('requete', e?.code); }
        });
        file = p.catch(() => {});
        return p;
      },
      async fermer() { ferme = true; await avecDelai(() => client.end(), delaiFermetureMs); },
    };
  };
}
