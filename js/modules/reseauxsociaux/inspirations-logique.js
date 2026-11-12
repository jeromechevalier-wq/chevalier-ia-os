// Règles pures du volet « Inspirations » du module Réseaux sociaux (12/11/2026) : aucun accès à Firebase ni au DOM, importables par les tests Node.
//  - un profil LinkedIn qui inspire Jérôme (`reseauxsociaux_inspirations`) : nom, adresse, ce qui l'inspire, piliers et formats habituels, ordre ;
//  - un bon post de ce profil (`reseauxsociaux_exemples`) : le LIEN du post et l'ANALYSE écrite par Claude ou Jérôme. JAMAIS le texte du post (droit d'auteur) :
//    la liste des champs est fermée (`normaliserExemple` ne garde que ceux-là), un champ « texte » n'est donc jamais écrit.
// 13/11/2026 : cette table devient celle des SOURCES (profil LinkedIn, site, résumé de veille). Une fiche sans `type` vaut `profil` : les fiches existantes restent valables, sans migration.
// Une adresse de profil ou de post est un lien vers LinkedIn : seul `https` et le domaine linkedin.com (ou lnkd.in pour les liens courts) sont acceptés,
// pour qu'un « javascript: » ou un site étranger ne puisse pas se glisser derrière un bouton.
import * as L from '../crm/logique.js';
import * as R from './logique.js';
import * as I from './idees-logique.js';
const { ErreurClaire } = I;

export const MAX_NOM = 100;
export const MAX_ANALYSE = 500; // caractères au plus par champ de l'analyse (et par « pourquoi » d'un profil)
export const MAX_URL = 500;

/** Les trois types de source. Une fiche sans type (ancienne fiche) est un profil. */
export const TYPES_SOURCE = Object.freeze([
  { id: 'profil', libelle: 'Profil LinkedIn' },
  { id: 'site', libelle: 'Site' },
  { id: 'veille', libelle: 'Résumé de veille' },
]);
export const typeSource = (fiche) => (TYPES_SOURCE.some((t) => t.id === fiche?.type) ? fiche.type : 'profil');
export const libelleTypeSource = (fiche) => TYPES_SOURCE.find((t) => t.id === typeSource(fiche)).libelle;

const texteSimple = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
/** Nombre décimal positif ou nul (moyenne), sinon null : jamais un zéro inventé. */
const nombrePositif = (v) => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
/** Entier positif ou nul (compteur), sinon null. */
const entierPositif = (v) => (Number.isInteger(v) && v >= 0 ? v : null);
const idConnu = (liste, id) => (liste.some((x) => x.id === id) ? id : null);

// ---------------------------------------------------------------- adresses

/**
 * Adresse LinkedIn rangée (https, domaine linkedin.com ou ses sous-domaines, ou lnkd.in) ou null si elle n'est pas acceptable.
 * Sans schéma (« linkedin.com/in/alice-exemple »), https est ajouté ; « http » est remonté en https ; tout autre schéma (javascript:, data:, mailto:) est refusé.
 */
export function normaliserUrlLinkedin(entree) {
  let t = String(entree ?? '').trim();
  if (!t || t.length > MAX_URL || /\s/.test(t)) return null;
  const schema = /^([a-z][a-z0-9+.-]*):/i.exec(t)?.[1];
  if (schema && !schema.includes('.')) { // « javascript: » a un schéma ; « linkedin.com:443 » est un domaine avec un port
    if (!/^https?$/i.test(schema) || !/^https?:\/\//i.test(t)) return null;
    t = t.replace(/^http:\/\//i, 'https://');
  } else if (!/^https:\/\//i.test(t)) {
    t = `https://${t}`;
  }
  let u;
  try { u = new URL(t); } catch { return null; }
  if (u.protocol !== 'https:' || u.username || u.password) return null;
  const h = u.hostname.toLowerCase();
  if (!(h === 'linkedin.com' || h.endsWith('.linkedin.com') || h === 'lnkd.in')) return null;
  return u.href;
}

/** Jour civil « AAAA-MM-JJ » existant, ou null (règle commune avec les sources des idées). */
export const normaliserJour = I.normaliserJour;

// ---------------------------------------------------------------- un profil

const listeConnue = (liste, valeurs) => {
  const demandes = new Set(Array.isArray(valeurs) ? valeurs : []);
  return liste.map((x) => x.id).filter((id) => demandes.has(id));
};

/** Adresse d'une source selon son type : LinkedIn pour un profil, https quelconque pour un site ou un résumé de veille (chaîne vide si refusée ou absente). */
export const normaliserUrlSource = (type, url) => (type === 'profil' ? (normaliserUrlLinkedin(url) ?? '') : I.normaliserUrlWeb(url));

/** Range une source. Pilier (ancien ou nouvel identifiant) et format inconnus sont retirés, dans l'ordre des listes, sans doublon. */
export function normaliserInspiration(valeurs = {}) {
  const piliers = new Set((Array.isArray(valeurs.piliers) ? valeurs.piliers : []).map(R.convertirPilier).filter(Boolean));
  const type = typeSource(valeurs);
  return {
    type,
    nom: texteSimple(valeurs.nom, MAX_NOM),
    url: normaliserUrlSource(type, valeurs.url),
    pourquoi: texteSimple(valeurs.pourquoi, MAX_ANALYSE),
    piliers: R.PILIERS.map((p) => p.id).filter((id) => piliers.has(id)),
    formats: listeConnue(R.FORMATS, valeurs.formats),
    ordre: Number.isFinite(valeurs.ordre) ? valeurs.ordre : 0,
    // Résumé de veille : identifiant du contenu (veille_contenus, résumés faits par n8n) ou nom EXACT du fichier résumé du second cerveau (résumés faits à la main).
    veilleContenuId: type === 'veille' ? texteSimple(valeurs.veilleContenuId, 100) : '',
    resume: type === 'veille' ? texteSimple(valeurs.resume, I.MAX_RESUME) : '',
    traiteLe: normaliserJour(valeurs.traiteLe),
    // Profil : la moyenne de ses posts de plus de deux semaines, relevée par Claude (null tant qu'il n'y a pas de relevé).
    moyenneReactions: type === 'profil' ? nombrePositif(valeurs.moyenneReactions) : null,
    moyenneCommentaires: type === 'profil' ? nombrePositif(valeurs.moyenneCommentaires) : null,
    nombrePostsReleves: type === 'profil' ? entierPositif(valeurs.nombrePostsReleves) : null,
    releveLe: type === 'profil' ? normaliserJour(valeurs.releveLe) : null,
  };
}

/** Phrase d'erreur lisible, ou null si la source peut s'enregistrer. Profil : adresse LinkedIn obligatoire ; site : adresse https obligatoire ; résumé de veille : adresse facultative. */
export function validerInspiration(valeurs = {}) {
  const type = typeSource(valeurs);
  if (valeurs.type !== undefined && valeurs.type !== null && !TYPES_SOURCE.some((t) => t.id === valeurs.type)) return 'Type de source inconnu.';
  if (!texteSimple(valeurs.nom, MAX_NOM + 1)) return type === 'profil' ? 'Donne un nom à ce profil.' : 'Donne un nom à cette source.';
  if (texteSimple(valeurs.nom, MAX_NOM + 1).length > MAX_NOM) return `Le nom doit tenir en ${MAX_NOM} caractères au plus.`;
  if (type === 'profil' && !normaliserUrlLinkedin(valeurs.url)) return 'Colle l’adresse du profil sur LinkedIn (par exemple linkedin.com/in/…).';
  if (type === 'site' && !I.normaliserUrlWeb(valeurs.url)) return 'Colle l’adresse du site (elle commence par https).';
  if (type === 'veille' && String(valeurs.url ?? '').trim() && !I.normaliserUrlWeb(valeurs.url)) return 'L’adresse du résumé doit commencer par https.';
  if (String(valeurs.pourquoi ?? '').replace(/\s+/g, ' ').trim().length > MAX_ANALYSE) return `« Ce qui m’inspire » doit tenir en ${MAX_ANALYSE} caractères au plus.`;
  return null;
}

/** Les profils dans l'ordre choisi (puis par nom, pour que l'ordre reste stable). */
export const trierInspirations = (liste) => [...(liste || [])].sort((a, b) => (a.ordre ?? 0) - (b.ordre ?? 0) || String(a.nom ?? '').localeCompare(String(b.nom ?? ''), 'fr') || String(a.id).localeCompare(String(b.id)));

/** Plan d'écriture d'une source : `existant` = document déjà présent (ou null = création, le profil se met en fin de liste), `ctx.id` = identifiant. */
export function planEnregistrerInspiration(existant, valeurs, ctx = {}) {
  if (typeof ctx.id !== 'string' || !ctx.id) throw new ErreurClaire('Identifiant de profil manquant.');
  const fusion = { ...(existant ? Object.fromEntries(Object.keys(normaliserInspiration({})).map((k) => [k, existant[k]])) : {}), ...valeurs };
  const erreur = validerInspiration(fusion);
  if (erreur) throw new ErreurClaire(erreur);
  if (!existant) {
    const dernier = Math.max(-1, ...(ctx.autres || []).map((p) => (Number.isFinite(p.ordre) ? p.ordre : -1)));
    return { ecritures: [L.ecritureCreer(R.COLLECTION_INSPIRATIONS, ctx.id, normaliserInspiration({ ...fusion, ordre: dernier + 1 }), { horodater: ['creeLe', 'modifieLe'] })] };
  }
  return { ecritures: [L.ecritureModifier(R.COLLECTION_INSPIRATIONS, ctx.id, normaliserInspiration(fusion), { horodater: ['modifieLe'] })] };
}

/**
 * Ranger : monte (`sens` -1) ou descend (+1) un profil d'une place. Les ordres sont renumérotés 0, 1, 2… ; seuls les profils dont l'ordre change sont écrits.
 * En haut de liste (monter) ou en bas (descendre) : aucune écriture.
 */
export function planDeplacerInspiration(liste, id, sens) {
  const ordre = trierInspirations(liste);
  const i = ordre.findIndex((p) => p.id === id);
  const j = i + (sens < 0 ? -1 : 1);
  if (i < 0 || j < 0 || j >= ordre.length) return { ecritures: [] };
  [ordre[i], ordre[j]] = [ordre[j], ordre[i]];
  return { ecritures: ordre.map((p, k) => ({ p, k })).filter(({ p, k }) => p.ordre !== k).map(({ p, k }) => L.ecritureModifier(R.COLLECTION_INSPIRATIONS, p.id, { ordre: k }, { horodater: ['modifieLe'] })) };
}

// ---------------------------------------------------------------- un exemple de post

/** Les champs de l'analyse, en texte libre (500 caractères au plus chacun). */
export const CHAMPS_ANALYSE = Object.freeze([
  { id: 'accroche', libelle: 'Accroche' },
  { id: 'structure', libelle: 'Structure' },
  { id: 'longueur', libelle: 'Longueur' },
  { id: 'pourquoi', libelle: 'Pourquoi ça marche' },
]);

/**
 * Range un exemple. LISTE FERMÉE de champs : le texte du post n'a pas de champ, tout champ en plus (« texte », « contenu »…) est ignoré.
 * `url` = lien du post (adresse LinkedIn acceptable, sinon chaîne vide) ; `date` = jour du post ou null ; format, pilier et service inconnus = null.
 */
export function normaliserExemple(valeurs = {}) {
  return {
    profilId: texteSimple(valeurs.profilId, 100),
    url: normaliserUrlLinkedin(valeurs.url) ?? '',
    date: normaliserJour(valeurs.date),
    accroche: texteSimple(valeurs.accroche, MAX_ANALYSE),
    structure: texteSimple(valeurs.structure, MAX_ANALYSE),
    longueur: texteSimple(valeurs.longueur, MAX_ANALYSE),
    extrait: texteSimple(valeurs.extrait, I.MAX_EXTRAIT),
    format: idConnu(R.FORMATS, valeurs.format),
    pilier: R.convertirPilier(valeurs.pilier),
    service: idConnu(R.SERVICES, valeurs.service),
    pourquoi: texteSimple(valeurs.pourquoi, MAX_ANALYSE),
    // Les chiffres du post au jour du relevé (13/11/2026) : des nombres relevés par Claude, jamais un texte. null = pas relevé.
    reactions: entierPositif(valeurs.reactions),
    commentaires: entierPositif(valeurs.commentaires),
    releveLe: normaliserJour(valeurs.releveLe),
  };
}

/**
 * Écart d'un exemple à la moyenne de son profil : (réactions + commentaires) divisé par (moyenne des réactions + moyenne des commentaires). CALCULÉ à l'affichage, jamais stocké.
 * Rend { rapport, libelle } (« × 2,3 la moyenne ») ou null quand un chiffre manque ou que la moyenne vaut zéro (jamais de division par zéro ni de valeur inventée).
 */
export function ecartALaMoyenne(exemple, profil) {
  const r = entierPositif(exemple?.reactions);
  const c = entierPositif(exemple?.commentaires);
  const mr = nombrePositif(profil?.moyenneReactions);
  const mc = nombrePositif(profil?.moyenneCommentaires);
  if (r === null || c === null || mr === null || mc === null || mr + mc <= 0) return null;
  const rapport = (r + c) / (mr + mc);
  return { rapport, libelle: `× ${new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 1 }).format(rapport)} la moyenne` };
}

/** Phrase d'erreur lisible, ou null si l'exemple peut s'enregistrer. */
export function validerExemple(valeurs = {}) {
  if (!String(valeurs.profilId ?? '').trim()) return 'Cet exemple n’est rattaché à aucun profil.';
  if (!normaliserUrlLinkedin(valeurs.url)) return 'Colle le lien du post sur LinkedIn (seulement le lien : son texte n’est pas copié ici).';
  if (String(valeurs.date ?? '').trim() && !normaliserJour(valeurs.date)) return 'La date du post n’est pas valide.';
  if (String(valeurs.extrait ?? '').replace(/\s+/g, ' ').trim().length > I.MAX_EXTRAIT) return `L’extrait doit tenir en ${I.MAX_EXTRAIT} caractères au plus.`;
  if (String(valeurs.releveLe ?? '').trim() && !normaliserJour(valeurs.releveLe)) return 'La date du relevé n’est pas valide.';
  for (const c of ['reactions', 'commentaires']) {
    if (valeurs[c] !== undefined && valeurs[c] !== null && valeurs[c] !== '' && entierPositif(valeurs[c]) === null) return 'Les réactions et les commentaires sont des nombres entiers, zéro ou plus.';
  }
  for (const c of CHAMPS_ANALYSE) {
    if (String(valeurs[c.id] ?? '').replace(/\s+/g, ' ').trim().length > MAX_ANALYSE) return `« ${c.libelle} » doit tenir en ${MAX_ANALYSE} caractères au plus.`;
  }
  return null;
}

/** Plan d'écriture d'un exemple (`existant` null = création). */
export function planEnregistrerExemple(existant, valeurs, ctx = {}) {
  if (typeof ctx.id !== 'string' || !ctx.id) throw new ErreurClaire('Identifiant d’exemple manquant.');
  const fusion = { ...(existant ? Object.fromEntries(Object.keys(normaliserExemple({})).map((k) => [k, existant[k]])) : {}), ...valeurs };
  const erreur = validerExemple(fusion);
  if (erreur) throw new ErreurClaire(erreur);
  const donnees = normaliserExemple(fusion);
  if (!existant) return { ecritures: [L.ecritureCreer(R.COLLECTION_EXEMPLES, ctx.id, donnees, { horodater: ['creeLe', 'modifieLe'] })] };
  return { ecritures: [L.ecritureModifier(R.COLLECTION_EXEMPLES, ctx.id, donnees, { horodater: ['modifieLe'] })] };
}

/** Les exemples d'un profil, le plus récent d'abord (ceux sans date à la fin). */
export function exemplesDe(exemples, profilId) {
  return (exemples || []).filter((e) => e.profilId === profilId)
    .sort((a, b) => (a.date ? 0 : 1) - (b.date ? 0 : 1) || String(b.date ?? '').localeCompare(String(a.date ?? '')) || String(a.id).localeCompare(String(b.id)));
}
