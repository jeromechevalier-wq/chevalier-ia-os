// Magasin des autorisations OAuth (collection Firestore `mcp_oauth`, fermée à l'appli par les règles : seul le serveur y accède).
// On ne garde JAMAIS un jeton en clair : seulement son empreinte SHA-256 (comme MCP_JETONS). Quatre sortes de documents :
//   code_<empreinte>       code d'autorisation (60 s, usage unique) ;
//   acces_<empreinte>      jeton d'accès (1 h) ;
//   refresh_<empreinte>    jeton de renouvellement (usage unique : chaque renouvellement en donne un neuf) ;
//   connexion_<id>         la connexion d'un client : compte Google, échéance glissante, drapeau `revoque`.
// Couper une connexion = mettre `revoque: true` ou supprimer son document `connexion_…` (dans la console Firestore) : agit tout de suite.
import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { COLLECTION_OAUTH as COL, COMPTES_AUTORISES, DUREES, PROFIL_OAUTH } from './config.js';

export const FORMATS = Object.freeze({
  code: /^cia_c_[A-Za-z0-9_-]{43}$/,
  acces: /^cia_a_[A-Za-z0-9_-]{43}$/,
  refresh: /^cia_r_[A-Za-z0-9_-]{43}$/,
});

/** Erreur OAuth rendue au client (RFC 6749 : `invalid_grant`, `invalid_request`…). Le détail ne dit jamais POURQUOI un jeton est refusé. */
export class ErreurOauth extends Error {
  constructor(code, description) {
    super(description || code);
    this.name = 'ErreurOauth';
    this.code = code;
  }
}

const sha = (texte) => createHash('sha256').update(texte, 'utf8').digest('hex');
const nouveauJeton = (prefixe) => `${prefixe}${randomBytes(32).toString('base64url')}`;
const egal = (a, b) => {
  const x = Buffer.from(String(a), 'utf8');
  const y = Buffer.from(String(b), 'utf8');
  return x.length === y.length && timingSafeEqual(x, y);
};

/** Nom d'acteur d'une connexion OAuth : « claude-ai- » + partie locale de l'adresse (lettres, chiffres, tirets). */
export function acteurDuCompte(email) {
  const local = String(email).toLowerCase().split('@')[0].replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 30);
  return `claude-ai-${local || 'compte'}`;
}

export const compteAutorise = (email) => typeof email === 'string' && COMPTES_AUTORISES.includes(email.toLowerCase());

/** Vérification PKCE S256 : base64url(SHA-256(verifier)) doit valoir le `code_challenge` donné à l'autorisation. */
export const pkceValide = (verifier, challenge) => typeof verifier === 'string' && /^[A-Za-z0-9._~-]{43,128}$/.test(verifier)
  && egal(createHash('sha256').update(verifier, 'utf8').digest('base64url'), challenge);

export function creerMagasinOauth({ donnees, maintenant = () => Date.now() }) {
  const ecrire = (ecritures) => donnees.appliquer(ecritures);
  const set = (id, doc) => ({ type: 'set', collection: COL, id, donnees: doc });

  /** Marque un document « utilisé » d'un seul coup (lecture-écriture atomique) et dit dans quel état il était. */
  const consommer = (id) => donnees.mettreAJour(COL, id, (cur) => {
    if (!cur) return { ecrire: false, etat: 'inconnu' };
    if (cur.utilise) return { ecrire: false, etat: 'rejoue', connexionId: cur.connexionId ?? null };
    if (cur.expireLe < maintenant()) return { ecrire: false, etat: 'expire' };
    return { ecrire: true, donnees: { ...cur, utilise: true }, etat: 'ok', doc: cur };
  });

  async function revoquer(connexionId) {
    if (!connexionId) return;
    await donnees.mettreAJour(COL, `connexion_${connexionId}`, (cur) => (cur ? { ecrire: true, donnees: { ...cur, revoque: true } } : { ecrire: false }));
  }

  /** Émet un jeton d'accès et un jeton de renouvellement pour la connexion ; renvoie leurs documents et les valeurs en clair. */
  function emettre(connexionId, email, clientId) {
    const t = maintenant();
    const acces = nouveauJeton('cia_a_');
    const refresh = nouveauJeton('cia_r_');
    return {
      acces, refresh,
      docs: [
        set(`acces_${sha(acces)}`, { connexionId, email, clientId, expireLe: t + DUREES.accesS * 1000 }),
        set(`refresh_${sha(refresh)}`, { connexionId, email, clientId, expireLe: t + DUREES.connexionJours * 86_400_000, utilise: false }),
      ],
      hashAcces: sha(acces), hashRefresh: sha(refresh),
    };
  }
  const reponse = (e) => ({ access_token: e.acces, token_type: 'Bearer', expires_in: DUREES.accesS, refresh_token: e.refresh });

  return {
    /** Crée un code d'autorisation pour un compte déjà vérifié. Renvoie le code en clair (jamais gardé). */
    async creerCode({ email, clientId, redirectUri, challenge }) {
      const code = nouveauJeton('cia_c_');
      await ecrire([set(`code_${sha(code)}`, { email, clientId, redirectUri, challenge, expireLe: maintenant() + DUREES.codeS * 1000, utilise: false, connexionId: null })]);
      return code;
    },

    /** Échange un code (+ preuve PKCE) contre les jetons. Lève ErreurOauth('invalid_grant') pour toute raison de refus. */
    async echangerCode({ code, clientId, redirectUri, verifier }) {
      const refuse = new ErreurOauth('invalid_grant', 'Code invalide ou expiré.');
      if (typeof code !== 'string' || !FORMATS.code.test(code)) throw refuse;
      const id = `code_${sha(code)}`;
      const r = await consommer(id);
      if (r.etat === 'rejoue') { await revoquer(r.connexionId); throw refuse; } // code rejoué : on coupe la connexion qu'il a ouverte
      if (r.etat !== 'ok') throw refuse;
      const c = r.doc;
      if (!egal(c.clientId, clientId ?? '') || !egal(c.redirectUri, redirectUri ?? '') || !pkceValide(verifier, c.challenge) || !compteAutorise(c.email)) throw refuse;
      const connexionId = randomBytes(16).toString('hex');
      const e = emettre(connexionId, c.email, c.clientId);
      const t = maintenant();
      await ecrire([
        set(`connexion_${connexionId}`, {
          email: c.email, clientId: c.clientId, creeLe: t, expireLe: t + DUREES.connexionJours * 86_400_000, revoque: false,
          refreshActuel: e.hashRefresh, refreshPrecedent: null, accesActuel: e.hashAcces, accesPrecedent: null,
        }),
        ...e.docs,
        { type: 'update', collection: COL, id: id, donnees: { connexionId } },
      ]);
      return reponse(e);
    },

    /** Renouvelle : l'ancien jeton de renouvellement est consommé, un neuf est rendu (rotation). Un ancien jeton rejoué coupe la connexion. */
    async rafraichir({ refreshToken, clientId }) {
      const refuse = new ErreurOauth('invalid_grant', 'Jeton de renouvellement invalide ou expiré.');
      if (typeof refreshToken !== 'string' || !FORMATS.refresh.test(refreshToken)) throw refuse;
      const r = await consommer(`refresh_${sha(refreshToken)}`);
      if (r.etat === 'rejoue') { await revoquer(r.connexionId); throw refuse; }
      if (r.etat !== 'ok') throw refuse;
      const connexion = await donnees.document(COL, `connexion_${r.doc.connexionId}`);
      const t = maintenant();
      if (!connexion || connexion.revoque || connexion.expireLe < t || !compteAutorise(connexion.email)) throw refuse;
      if (clientId !== undefined && clientId !== null && !egal(connexion.clientId, clientId)) throw refuse;
      const e = emettre(r.doc.connexionId, connexion.email, connexion.clientId);
      const anciens = [connexion.refreshPrecedent && `refresh_${connexion.refreshPrecedent}`, connexion.accesPrecedent && `acces_${connexion.accesPrecedent}`].filter(Boolean);
      await ecrire([
        ...e.docs,
        ...anciens.map((id) => ({ type: 'delete', collection: COL, id })), // ménage : on ne garde qu'une génération d'avance
        {
          type: 'update', collection: COL, id: `connexion_${r.doc.connexionId}`,
          donnees: { refreshPrecedent: connexion.refreshActuel, refreshActuel: e.hashRefresh, accesPrecedent: connexion.accesActuel, accesActuel: e.hashAcces, expireLe: t + DUREES.connexionJours * 86_400_000, renouvelleLe: t },
        },
      ]);
      return reponse(e);
    },

    /**
     * Jeton d'accès présenté sur /mcp : renvoie { jeton, acteur, profil } si valide, sinon null (sans dire pourquoi).
     * Une panne Firestore remonte en exception (le serveur répond 503, pas 401 : le client ne doit pas croire son jeton mauvais).
     */
    async verifierAcces(bearer) {
      if (typeof bearer !== 'string' || !FORMATS.acces.test(bearer)) return null;
      const acces = await donnees.document(COL, `acces_${sha(bearer)}`);
      const t = maintenant();
      if (!acces || acces.expireLe < t) return null;
      const connexion = await donnees.document(COL, `connexion_${acces.connexionId}`);
      if (!connexion || connexion.revoque || connexion.expireLe < t || !compteAutorise(connexion.email)) return null;
      const acteur = acteurDuCompte(connexion.email);
      return { jeton: acteur, acteur, profil: PROFIL_OAUTH, actif: true };
    },

    revoquer,
  };
}
