// Porte de la base (basePorte) : LE SEUL fichier de la porte qui charge `pg` et le connecteur Cloud SQL (`@google-cloud/cloud-sql-connector`), à la demande
// (import dynamique, modèle pilotage/postgres.js ; tests/pilotage-postgres.test.js 3.1 borne la liste des fichiers qui importent `pg`).
// Le connecteur ouvre un tunnel TLS vers l'instance (certificats et autorisation IAM « Client Cloud SQL » gérés par Google) : l'instance n'a AUCUN réseau autorisé.
// Nom de l'instance, base, utilisateur et mot de passe viennent de la configuration (secret lu à l'exécution par porte-base.js) : rien n'est écrit ici.
// Un petit pool (3 connexions au plus par instance de fonction) ; les réglages app.* sont posés DANS chaque transaction (set_config(…, true)) par porte-base.js,
// jamais sur la connexion : une connexion réutilisée ne garde rien du client précédent.
// Les erreurs de `pg` remontent telles quelles à porte-base.js, qui ne rend JAMAIS leur texte à l'appelant (porte-requetes.js, reponseErreur).
import { createHash } from 'node:crypto';
import { creerTypes } from '../pilotage/postgres.js';

export const CONNEXIONS_MAX = 3;
export const DELAI_CONNEXION_MS = 8_000;

/** Connexion impossible (connecteur, réseau, mot de passe) : porte-base.js répond 503, sans détail. */
export class ErreurConnexionBase extends Error {
  constructor(etat) {
    super('Connexion à la base impossible.');
    this.name = 'ErreurConnexionBase';
    if (typeof etat === 'string' && /^[0-9A-Z]{5}$/.test(etat)) this.etat = etat;
  }
}

async function chargerPg() {
  const m = await import('pg');
  return m.default ?? m;
}

async function chargerConnecteur() {
  const m = await import('@google-cloud/cloud-sql-connector');
  return m.Connector ?? m.default?.Connector;
}

const empreinte = (c) => createHash('sha256').update(`${c.instance}\n${c.base}\n${c.utilisateur}\n${c.mot_de_passe}`).digest('hex');

/**
 * Rend `ouvrir(config)` → `{ interroger(sql, valeurs?) -> { rows, rowCount }, liberer(casse) }` (UNE connexion du pool, à libérer par l'appelant).
 * `config` : { instance, base, utilisateur, mot_de_passe } (déjà validée par porte-base.js). Un changement de configuration (rotation du mot de passe) recrée le pool.
 * `pg` et `connecteur` (fonctions asynchrones qui rendent le module `pg` et la classe `Connector`) sont injectables : les tests n'ont besoin d'aucun des deux paquets.
 */
export function creerOuvreurCloudSql({ pg = chargerPg, connecteur = chargerConnecteur, max = CONNEXIONS_MAX, delaiConnexionMs = DELAI_CONNEXION_MS } = {}) {
  let etat = null; // { cle, promesse: Promise<{ pool, connector }> }

  async function creer(config) {
    const pgm = await pg();
    const Connector = await connecteur();
    const connector = new Connector();
    const options = await connector.getOptions({ instanceConnectionName: config.instance, ipType: 'PUBLIC' });
    const pool = new pgm.Pool({
      ...options,
      user: config.utilisateur,
      password: config.mot_de_passe,
      database: config.base,
      max,
      idleTimeoutMillis: 60_000,
      connectionTimeoutMillis: delaiConnexionMs,
      types: creerTypes(pgm.types),
    });
    pool.on('error', () => {}); // une connexion inactive coupée ne doit pas faire tomber la fonction
    return { pool, connector };
  }

  function fermer(ancien) {
    ancien.promesse.then(({ pool, connector }) => { pool.end().catch(() => {}); try { connector.close(); } catch { /* déjà fermé */ } }).catch(() => {});
  }

  return async function ouvrir(config) {
    const cle = empreinte(config);
    if (!etat || etat.cle !== cle) {
      if (etat) fermer(etat);
      etat = { cle, promesse: creer(config) };
    }
    const courant = etat;
    let pool;
    try {
      ({ pool } = await courant.promesse);
    } catch (e) {
      if (etat === courant) etat = null; // un échec n'est jamais gardé : la requête suivante réessaie
      throw new ErreurConnexionBase(e?.code);
    }
    let client;
    try {
      client = await pool.connect();
    } catch (e) {
      throw new ErreurConnexionBase(e?.code);
    }
    let libere = false;
    return {
      interroger: (sql, valeurs) => (valeurs?.length ? client.query(sql, valeurs) : client.query(sql)),
      liberer(casse = false) {
        if (libere) return;
        libere = true;
        client.release(casse ? true : undefined); // casse : la connexion est détruite, jamais rendue au pool
      },
    };
  };
}
