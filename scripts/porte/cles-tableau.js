// Clés de la porte du TABLEAU DE BORD : l'accès des scripts GitHub (surveillance des clés, des sauvegardes…) pour écrire leurs relevés dans la base.
// Forme : cle-tdb.<propriétaire>.<43 caractères aléatoires>. Même principe que les clés des workflows n8n (cles.js) : la clé n'est JAMAIS enregistrée,
// seulement son empreinte SHA-256 (identifiant du document dans plateforme_cles) ; elle est montrée une seule fois, à sa création.
// Séparation : le préfixe fait partie du texte haché, donc une clé n8n ne peut jamais ouvrir cette porte, ni l'inverse. Le document porte en plus
// `usage: 'tableaudebord'`, vérifié ici : un document sans cet usage (une clé n8n) est refusé.
import { randomBytes } from 'node:crypto';
import { empreinte, FORMAT_PROPRIETAIRE } from './cles.js';

export const PREFIXE_TABLEAU = 'cle-tdb';
export const USAGE_TABLEAU = 'tableaudebord';
const FORMAT_CLE_TABLEAU = /^cle-tdb\.([a-z0-9][a-z0-9_-]{0,39})\.([A-Za-z0-9_-]{43})$/;

/** Fabrique une clé pour un propriétaire. `octets` ne sert qu'aux tests (32 octets = 256 bits). */
export function genererCleTableau(proprietaire, octets = randomBytes(32)) {
  if (typeof proprietaire !== 'string' || !FORMAT_PROPRIETAIRE.test(proprietaire)) throw new Error(`Propriétaire invalide : « ${proprietaire} »`);
  if (octets.length !== 32) throw new Error('Une clé a besoin de 32 octets aléatoires');
  return `${PREFIXE_TABLEAU}.${proprietaire}.${Buffer.from(octets).toString('base64url')}`;
}

/** { proprietaire } si le texte a exactement la forme d'une clé du tableau de bord, sinon null. */
export function analyserCleTableau(texte) {
  if (typeof texte !== 'string') return null;
  const m = FORMAT_CLE_TABLEAU.exec(texte);
  return m ? { proprietaire: m[1] } : null;
}

/** Document à écrire dans plateforme_cles/<empreinte>. Aucune partie de la clé, sauf l'empreinte. */
export function enregistrementTableau(cle, proprietaire, maintenant = new Date()) {
  const e = empreinte(cle);
  return { id: e, donnees: { proprietaire, idCourt: e.slice(0, 8), usage: USAGE_TABLEAU, actif: true, creeLe: maintenant, dernierUsage: null, revoqueLe: null } };
}

/** Même contrat que verifierCle (cles.js) : { ok: true, proprietaire, idCourt, empreinte, dernierUsage } ou { ok: false, raison } (la raison sert au journal seulement). */
export async function verifierCleTableau(cle, lire) {
  const analyse = analyserCleTableau(cle);
  if (!analyse) return { ok: false, raison: 'format' };
  const e = empreinte(cle);
  const doc = await lire(e);
  if (!doc) return { ok: false, raison: 'inconnue' };
  if (doc.actif !== true) return { ok: false, raison: 'revoquee' };
  if (doc.usage !== USAGE_TABLEAU) return { ok: false, raison: 'usage_different' };
  if (doc.proprietaire !== analyse.proprietaire) return { ok: false, raison: 'proprietaire_different' };
  return { ok: true, proprietaire: doc.proprietaire, idCourt: doc.idCourt, empreinte: e, dernierUsage: doc.dernierUsage ?? null };
}
