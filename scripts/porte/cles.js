// Clés de la « porte » : l'accès que les workflows n8n utilisent pour lire et écrire dans les données d'un module (veille…).
// Une clé par propriétaire (un client, ou « interne » pour les workflows de Jérôme), commune à tous ses modules.
// Forme : cle-n8n.<propriétaire>.<43 caractères aléatoires>   (exemple : cle-n8n.audrey.Xr4…)
//  - le début est une ÉTIQUETTE pour les humains et les outils de détection de secrets ; le droit d'entrer vient de la partie aléatoire,
//    retrouvée par son empreinte (SHA-256) dans la table plateforme_cles. Écrire « cle-n8n.audrey. » devant n'importe quoi n'ouvre rien ;
//  - la clé n'est JAMAIS enregistrée : seulement son empreinte (identifiant du document). Elle est montrée une seule fois, à sa création ;
//  - plusieurs clés actives en même temps par propriétaire (changement de clé sans coupure), 3 au plus ; une clé reste valable jusqu'à sa révocation.
// Ce fichier ne dépend que de node:crypto : il est copié dans functions/partage/ avant les tests et le déploiement (scripts/preparer-fonctions.js)
// et utilisé tel quel par l'outil en ligne de commande.
import { createHash, randomBytes } from 'node:crypto';

export const PREFIXE = 'cle-n8n';
export const TABLE_CLES = 'plateforme_cles';
export const MAX_CLES_ACTIVES = 3;
/** Une clé utilisée depuis moins longtemps que ça est considérée « en service » : la révoquer exige une confirmation. */
export const DELAI_EN_SERVICE_MS = 24 * 3600 * 1000;
/** Le dernier usage n'est réécrit qu'au bout de ce délai (pas une écriture par appel). Précision de la date : 5 minutes. */
export const DELAI_NOTE_USAGE_MS = 5 * 60 * 1000;

/** Propriétaire : même forme qu'un identifiant de client (minuscules, chiffres, tirets, tirets bas ; 40 caractères au plus). */
export const FORMAT_PROPRIETAIRE = /^[a-z0-9][a-z0-9_-]{0,39}$/;
const FORMAT_CLE = /^cle-n8n\.([a-z0-9][a-z0-9_-]{0,39})\.([A-Za-z0-9_-]{43})$/;

export const empreinte = (cle) => createHash('sha256').update(cle, 'utf8').digest('hex');

/** Fabrique une clé pour un propriétaire. `octets` ne sert qu'aux tests (32 octets = 256 bits). */
export function genererCle(proprietaire, octets = randomBytes(32)) {
  if (typeof proprietaire !== 'string' || !FORMAT_PROPRIETAIRE.test(proprietaire)) throw new Error(`Propriétaire invalide : « ${proprietaire} »`);
  if (octets.length !== 32) throw new Error('Une clé a besoin de 32 octets aléatoires');
  return `${PREFIXE}.${proprietaire}.${Buffer.from(octets).toString('base64url')}`;
}

/** { proprietaire } si le texte a exactement la forme d'une clé, sinon null. Aucun texte ne passe « à peu près ». */
export function analyserCle(texte) {
  if (typeof texte !== 'string') return null;
  const m = FORMAT_CLE.exec(texte);
  return m ? { proprietaire: m[1] } : null;
}

/** Valeur de l'en-tête « Authorization: Bearer … », ou null. */
export function extraireBearer(entete) {
  if (typeof entete !== 'string') return null;
  const m = /^Bearer (\S+)$/.exec(entete.trim());
  return m ? m[1] : null;
}

/** Document à écrire dans plateforme_cles/<empreinte> pour une nouvelle clé. Ne contient aucune partie de la clé, sauf l'empreinte. */
export function enregistrementDe(cle, proprietaire, maintenant = new Date()) {
  const e = empreinte(cle);
  return { id: e, donnees: { proprietaire, idCourt: e.slice(0, 8), actif: true, creeLe: maintenant, dernierUsage: null, revoqueLe: null } };
}

/**
 * Vérifie une clé présentée. `lire(empreinte)` renvoie le document de la table (ou null). Renvoie { ok: true, proprietaire, idCourt, empreinte, dernierUsage }
 * ou { ok: false, raison } : la raison sert au journal seulement, l'appelant répond toujours la même chose (« clé refusée »).
 * La recherche se fait par l'empreinte (une lecture directe) : il n'y a aucune comparaison de secrets à chronométrer.
 */
export async function verifierCle(cle, lire) {
  const analyse = analyserCle(cle);
  if (!analyse) return { ok: false, raison: 'format' };
  const e = empreinte(cle);
  const doc = await lire(e);
  if (!doc) return { ok: false, raison: 'inconnue' };
  if (doc.actif !== true) return { ok: false, raison: 'revoquee' };
  if (doc.proprietaire !== analyse.proprietaire) return { ok: false, raison: 'proprietaire_different' }; // étiquette ≠ propriétaire enregistré
  return { ok: true, proprietaire: doc.proprietaire, idCourt: doc.idCourt, empreinte: e, dernierUsage: doc.dernierUsage ?? null };
}

const enMs = (v) => (v == null ? null : typeof v === 'number' ? v : v instanceof Date ? v.getTime() : typeof v.toMillis === 'function' ? v.toMillis() : null);

/** Faut-il réécrire la date de dernier usage ? Oui si elle est absente ou vieille de plus de 5 minutes. */
export function doitNoterUsage(doc, maintenant = Date.now()) {
  const dernier = enMs(doc?.dernierUsage);
  return dernier === null || maintenant - dernier >= DELAI_NOTE_USAGE_MS;
}

/** Une clé active a servi dans les dernières 24 h : la révoquer coupera sans doute des workflows en production. */
export function enService(doc, maintenant = Date.now()) {
  const dernier = enMs(doc?.dernierUsage);
  return doc?.actif === true && dernier !== null && maintenant - dernier < DELAI_EN_SERVICE_MS;
}

/** Peut-on créer une clé de plus pour ce propriétaire ? `docs` = ses clés (actives ou non). */
export function peutCreer(docs) {
  const actives = docs.filter((d) => d.actif === true).length;
  return { ok: actives < MAX_CLES_ACTIVES, actives };
}

/** Ligne lisible pour l'outil : identifiant court, état, création, dernier usage. Jamais la clé. */
export function resumeCle(doc, maintenant = Date.now()) {
  const dernier = enMs(doc.dernierUsage);
  const jours = dernier === null ? null : Math.floor((maintenant - dernier) / 86_400_000);
  const usage = dernier === null ? 'jamais utilisée' : jours === 0 ? 'utilisée aujourd\'hui' : `dernier usage il y a ${jours} jour${jours > 1 ? 's' : ''}`;
  return `${doc.idCourt}  ${doc.actif ? 'active   ' : 'révoquée '} ${usage}${enService(doc, maintenant) ? '  (EN SERVICE)' : ''}${doc.usage === 'tableaudebord' ? '  [tableau de bord]' : ''}`;
}
