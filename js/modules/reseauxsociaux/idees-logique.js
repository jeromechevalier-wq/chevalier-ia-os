// Règles pures du volet « Idées » du module Réseaux sociaux (12/11/2026) : aucune dépendance à Firebase ni au DOM, importables par les tests Node.
//
// PRINCIPE DU « PASSAGE DE TÉMOIN » : le texte d'un post n'a qu'UN propriétaire à chaque moment.
//  - Phase d'écriture : le texte vit dans l'idée (champ `texte`, seulement tant que l'idée n'est pas passée dans Buffer).
//  - Quand l'idée passe à l'état « dans_buffer », Buffer devient propriétaire et le module EFFACE sa copie (`normaliserIdee` force `texte` à vide).
//  - Après, le texte se LIT dans Buffer, jamais copié ici.
// Le lien idée -> post s'enregistre sous la forme { reseau, outil, id } (jamais un champ « identifiantBuffer » en dur), pour accueillir d'autres réseaux.
// Cette version n'écrit rien dans Buffer (la poussée d'une idée dans Buffer viendra en v2, dans le fichier qui parle déjà à Buffer) : l'état « dans_buffer » se pose à la main.
import * as L from '../crm/logique.js';
import * as R from './logique.js';

export const MAX_ANGLE = 200;
export const MAX_RESUME = 200;
export const MAX_TITRE_SOURCE = 200;
export const MAX_EXTRAIT = 400; // caractères au plus pour les mots de la source (idées et exemples d'inspirateurs)
export const MAX_SOURCES = 10;
export const MAX_ID_LIEN = 200;

/** Les quatre états d'une idée. Les abandonnées ne sont pas une colonne : on les retrouve par un filtre. */
export const ETATS_IDEE = Object.freeze([
  { id: 'idee', libelle: 'Idée' },
  { id: 'en_redaction', libelle: 'En rédaction' },
  { id: 'dans_buffer', libelle: 'Dans Buffer' },
  { id: 'abandonnee', libelle: 'Abandonnée' },
]);
/** Les colonnes du Kanban (quatre au plus). */
export const COLONNES_IDEES = Object.freeze(['idee', 'en_redaction', 'dans_buffer']);

/** D'où vient l'idée : un résumé de la veille, une page de site, un profil d'inspiration, ou une idée libre. Une idée peut avoir PLUSIEURS sources (aucune limite utile, dix au plus). */
export const SOURCES_IDEE = Object.freeze([
  { id: 'veille', libelle: 'Veille' },
  { id: 'site', libelle: 'Site' },
  { id: 'inspiration', libelle: 'Inspiration' },
  { id: 'libre', libelle: 'Idée libre' },
]);

/** Erreur dont le message est écrit pour l'utilisateur : l'écran l'affiche telle quelle (toute autre erreur devient le message général d'échec). */
export class ErreurClaire extends Error {}

const libelleDe = (liste, id) => liste.find((x) => x.id === id)?.libelle ?? null;
export const libelleEtatIdee = (id) => libelleDe(ETATS_IDEE, id);
export const libelleSource = (id) => libelleDe(SOURCES_IDEE, id);

const texteSimple = (v, max) => String(v ?? '').replace(/\s+/g, ' ').trim().slice(0, max);
const idConnu = (liste, id) => (liste.some((x) => x.id === id) ? id : null);

// ---------------------------------------------------------------- lien idée -> post

/** Le lien vers le post d'une idée : { reseau, outil, id } ou null. Aucun nom de réseau ou d'outil écrit en dur ailleurs. */
export function normaliserLien(lien) {
  if (!lien || typeof lien !== 'object') return null;
  const reseau = texteSimple(lien.reseau, 40).toLowerCase();
  const outil = texteSimple(lien.outil, 40).toLowerCase();
  const id = texteSimple(lien.id, MAX_ID_LIEN);
  return reseau && outil && id ? { reseau, outil, id } : null;
}
/** Lien vers un post de LinkedIn programmé par Buffer (la valeur par défaut de la v1). */
export const creerLien = ({ reseau = 'linkedin', outil = 'buffer', id } = {}) => normaliserLien({ reseau, outil, id });

// ---------------------------------------------------------------- une idée

/**
 * Adresse web rangée (https seulement, sans identifiant ni mot de passe dans l'adresse) ou chaîne vide. Une adresse de source est un lien qui s'ouvre dans un nouvel onglet :
 * « javascript: », « data: » et « http: » sont refusés (sans schéma, https est ajouté). L'ancre « #section » d'une page est gardée.
 */
export function normaliserUrlWeb(entree) {
  let t = String(entree ?? '').trim();
  if (!t || t.length > 600 || /\s/.test(t)) return '';
  const schema = /^([a-z][a-z0-9+.-]*):/i.exec(t)?.[1];
  if (schema && !schema.includes('.')) { if (!/^https:\/\//i.test(t)) return ''; } else if (!/^https:\/\//i.test(t)) t = `https://${t}`;
  let u;
  try { u = new URL(t); } catch { return ''; }
  if (u.protocol !== 'https:' || u.username || u.password || !u.hostname.includes('.')) return '';
  return u.href;
}

/** Jour civil « AAAA-MM-JJ » existant, ou null. */
export function normaliserJour(v) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(v ?? '').trim());
  if (!m) return null;
  const d = new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
  return d.getUTCFullYear() === +m[1] && d.getUTCMonth() === +m[2] - 1 && d.getUTCDate() === +m[3] ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

/**
 * Une source rangée : { type, titre, url, ancre, extrait, consulteLe, archive, resume, motsCles }. `url` (facultative) pointe la page d'origine, avec l'ancre de la section si le site en a ;
 * `ancre` = nom de la section ou de la page, en texte ; `extrait` = les mots de la source (facultatif, 400 caractères au plus, collés par l'utilisateur) ; `consulteLe` = jour de consultation
 * (un site change) ; `archive` = adresse facultative d'une copie archivée ; `resume` = pour la veille, nom EXACT du fichier résumé du second cerveau en texte simple, `motsCles` pour retrouver le passage dans le transcript.
 */
export function normaliserSourceUnique(source) {
  const type = idConnu(SOURCES_IDEE, source?.type) ?? 'libre';
  return {
    type,
    titre: texteSimple(source?.titre, MAX_TITRE_SOURCE),
    url: normaliserUrlWeb(source?.url),
    ancre: texteSimple(source?.ancre, MAX_TITRE_SOURCE),
    extrait: texteSimple(source?.extrait, MAX_EXTRAIT),
    consulteLe: normaliserJour(source?.consulteLe),
    archive: normaliserUrlWeb(source?.archive),
    resume: type === 'veille' ? texteSimple(source?.resume, MAX_RESUME) : '',
    motsCles: type === 'veille' ? texteSimple(source?.motsCles, MAX_RESUME) : '',
  };
}
/** Une source sans aucun contenu (type seul) n'est pas gardée. */
const sourceVide = (s) => !(s.titre || s.url || s.ancre || s.extrait || s.resume || s.motsCles || s.archive);
/** Les sources d'une idée, rangées : tableau (zéro, une ou plusieurs), les sources vides retirées, dix au plus. */
export const normaliserSources = (liste) => (Array.isArray(liste) ? liste : []).map(normaliserSourceUnique).filter((s) => !sourceVide(s)).slice(0, MAX_SOURCES);
/** Phrase d'erreur sur une source (texte trop long, adresse refusée), ou null. */
export function validerSources(liste) {
  for (const s of Array.isArray(liste) ? liste : []) {
    if (String(s?.extrait ?? '').replace(/\s+/g, ' ').trim().length > MAX_EXTRAIT) return `L’extrait d’une source doit tenir en ${MAX_EXTRAIT} caractères au plus.`;
    if (String(s?.url ?? '').trim() && !normaliserUrlWeb(s.url)) return 'L’adresse d’une source doit commencer par https:// et pointer vers un site.';
    if (String(s?.archive ?? '').trim() && !normaliserUrlWeb(s.archive)) return 'L’adresse de la copie archivée doit commencer par https (lien sécurisé).';
    if (String(s?.consulteLe ?? '').trim() && !normaliserJour(s.consulteLe)) return 'La date de consultation d’une source n’est pas valide.';
  }
  return null;
}

/** Texte de rédaction : fins de ligne normalisées, rien d'autre n'est touché (les retours à la ligne comptent pour LinkedIn). */
const texteRedaction = (v) => String(v ?? '').replace(/\r\n?/g, '\n');

/**
 * Range une idée telle qu'elle s'écrit dans la table. RÈGLE DU PASSAGE DE TÉMOIN : à l'état « dans_buffer », `texte` est TOUJOURS vide.
 * Pilier (ancien ou nouvel identifiant), format et service inconnus deviennent null. Décision prise seule : le texte déjà écrit est gardé dans les trois autres états
 * (une idée remise à « Idée » ou abandonnée ne perd pas son brouillon) ; seul le passage dans Buffer l'efface.
 */
export function normaliserIdee(valeurs = {}) {
  const etat = idConnu(ETATS_IDEE, valeurs.etat) ?? 'idee';
  return {
    angle: texteSimple(valeurs.angle, MAX_ANGLE),
    sources: normaliserSources(valeurs.sources),
    pilier: R.convertirPilier(valeurs.pilier),
    format: idConnu(R.FORMATS, valeurs.format),
    service: idConnu(R.SERVICES, valeurs.service),
    etat,
    texte: etat === 'dans_buffer' ? '' : texteRedaction(valeurs.texte),
    lien: normaliserLien(valeurs.lien),
  };
}

/** Phrase d'erreur lisible, ou null si l'idée peut s'enregistrer. */
export function validerIdee(valeurs = {}) {
  const angle = String(valeurs.angle ?? '').replace(/\s+/g, ' ').trim();
  if (!angle) return 'Donne un angle à cette idée.';
  if (angle.length > MAX_ANGLE) return `L’angle doit tenir en ${MAX_ANGLE} caractères au plus.`;
  const erreurSources = validerSources(valeurs.sources);
  if (erreurSources) return erreurSources;
  const etat = idConnu(ETATS_IDEE, valeurs.etat) ?? 'idee';
  if (etat !== 'dans_buffer' && Array.from(texteRedaction(valeurs.texte)).length > R.LIMITE_LINKEDIN) return `Le texte dépasse la limite de LinkedIn (${R.formaterNombre(R.LIMITE_LINKEDIN)} caractères).`;
  return null;
}

/** Les champs d'une idée existante, prêts à être refusionnés avec des changements. */
const champsIdee = (existante) => ({ angle: existante?.angle, sources: existante?.sources, pilier: existante?.pilier, format: existante?.format, service: existante?.service, etat: existante?.etat, texte: existante?.texte, lien: existante?.lien });

/**
 * Plan d'écriture d'une idée : `existante` = document déjà présent (ou null = création), `valeurs` = les champs à poser (le reste vient de l'existante), `ctx.id` = identifiant du document.
 * Rend `{ ecritures }` pour `executer` (journal commun). Lève une Error au message lisible si l'idée n'est pas valide.
 */
export function planEnregistrerIdee(existante, valeurs, ctx = {}) {
  if (typeof ctx.id !== 'string' || !ctx.id) throw new ErreurClaire('Identifiant d’idée manquant.');
  const fusion = { ...champsIdee(existante), ...valeurs };
  const erreur = validerIdee(fusion);
  if (erreur) throw new ErreurClaire(erreur);
  const donnees = normaliserIdee(fusion);
  if (!existante) return { ecritures: [L.ecritureCreer(R.COLLECTION_IDEES, ctx.id, donnees, { horodater: ['creeLe', 'modifieLe'] })] };
  return { ecritures: [L.ecritureModifier(R.COLLECTION_IDEES, ctx.id, donnees, { horodater: ['modifieLe'] })] };
}

/** Change l'état d'une idée (à la main). `options.lien` = le lien vers le post quand on le connaît. Passer à « dans_buffer » efface le texte du module (voir normaliserIdee). */
export function planChangerEtatIdee(existante, etat, ctx = {}, options = {}) {
  if (!existante) throw new ErreurClaire('Cette idée n’existe plus.');
  if (!idConnu(ETATS_IDEE, etat)) throw new ErreurClaire('État inconnu.');
  return planEnregistrerIdee(existante, { etat, ...(options.lien !== undefined ? { lien: options.lien } : {}) }, ctx);
}

/** Passer cette idée dans Buffer effacerait un texte déjà écrit : l'écran demande d'abord confirmation. */
export const effaceraLeTexte = (existante, nouvelEtat) => nouvelEtat === 'dans_buffer' && existante?.etat !== 'dans_buffer' && String(existante?.texte ?? '').trim() !== '';

/** Où se trouve le texte du post : { lieu: 'aucun' | 'module' | 'buffer', libelle }. */
export function ouEstLeTexte(idee) {
  if (idee?.etat === 'dans_buffer') return { lieu: 'buffer', libelle: 'Dans Buffer' };
  if (String(idee?.texte ?? '').trim()) return { lieu: 'module', libelle: 'Dans le module' };
  return { lieu: 'aucun', libelle: 'Pas encore écrit' };
}

/** Une source en une ligne : « Veille : titre ou fichier », « Site : titre », « Inspiration », « Idée libre ». */
export function libelleSourceIdee(source) {
  const s = normaliserSourceUnique(source);
  const nom = s.titre || s.resume;
  return nom ? `${libelleSource(s.type)} : ${nom}` : libelleSource(s.type);
}
/** Les types de source d'une idée ; sans source, « libre ». */
export const typesSources = (idee) => { const l = normaliserSources(idee?.sources); return l.length ? [...new Set(l.map((s) => s.type))] : ['libre']; };

// ---------------------------------------------------------------- filtres et colonnes

export const criteresIdees = () => ({ recherche: '', piliers: [], formats: [], services: [], sources: [], abandonnees: false });

/** Filtres combinés (« ou » dans un groupe, « et » entre groupes ; rien de coché = tout). `abandonnees` change la vue : les abandonnées seules, au lieu des trois colonnes. */
export function filtrerIdees(idees, criteres = {}) {
  const c = { ...criteresIdees(), ...criteres };
  const mot = L.normaliser(c.recherche || '').trim();
  return (idees || []).filter((i) => {
    if ((i.etat === 'abandonnee') !== !!c.abandonnees) return false;
    if (mot && !L.normaliser(`${i.angle || ''} ${normaliserSources(i.sources).map((x) => `${x.titre} ${x.resume} ${x.extrait}`).join(' ')}`).includes(mot)) return false;
    if (c.piliers.length && !c.piliers.includes(R.convertirPilier(i.pilier))) return false;
    if (c.formats.length && !c.formats.includes(i.format)) return false;
    if (c.services.length && !c.services.includes(i.service)) return false;
    if (c.sources.length && !typesSources(i).some((t) => c.sources.includes(t))) return false;
    return true;
  });
}

/** Nombre de filtres posés (la recherche a son champ ; « Abandonnées » compte comme un filtre). */
export const nombreFiltresIdees = (criteres = {}) => {
  const c = { ...criteresIdees(), ...criteres };
  return c.piliers.length + c.formats.length + c.services.length + c.sources.length + (c.abandonnees ? 1 : 0);
};

const instant = (i) => L.versDate(i?.modifieLe)?.getTime() ?? 0;

/** Colonnes du Kanban, la plus récemment modifiée en haut. `abandonnees` : une seule colonne « Abandonnées ». */
export function colonnesIdees(idees, { abandonnees = false } = {}) {
  const trier = (liste) => [...liste].sort((a, b) => instant(b) - instant(a) || String(a.id).localeCompare(String(b.id)));
  if (abandonnees) return { abandonnee: trier((idees || []).filter((i) => i.etat === 'abandonnee')) };
  return Object.fromEntries(COLONNES_IDEES.map((etat) => [etat, trier((idees || []).filter((i) => i.etat === etat))]));
}

// ---------------------------------------------------------------- tirage d'une contrainte (pilier × format × service)

/** Combien de fois chaque service est déjà utilisé : dans les posts classés (`classements` = documents de reseauxsociaux_posts) et dans les idées non abandonnées. */
export function compterServices(classements, idees) {
  const compte = Object.fromEntries(R.SERVICES.map((s) => [s.id, 0]));
  for (const c of classements || []) for (const s of new Set(Array.isArray(c?.services) ? c.services : [])) if (Object.hasOwn(compte, s)) compte[s]++;
  for (const i of idees || []) if (i?.etat !== 'abandonnee' && Object.hasOwn(compte, i?.service)) compte[i.service]++;
  return compte;
}

/** Poids de tirage de chaque service : le moins utilisé pèse le plus (écart au plus utilisé + 1, donc jamais zéro : tous restent possibles). */
export function poidsServices(compte) {
  const plusGrand = Math.max(0, ...R.SERVICES.map((s) => compte?.[s.id] ?? 0));
  return R.SERVICES.map((s) => ({ id: s.id, poids: plusGrand - (compte?.[s.id] ?? 0) + 1 }));
}

/** Tire dans une liste pondérée avec un nombre de [0, 1) : le premier élément dont le cumul dépasse le point. */
function tirerPondere(elements, nombre) {
  const total = elements.reduce((t, e) => t + e.poids, 0);
  let point = Math.min(Math.max(nombre, 0), 0.999999999) * total;
  for (const e of elements) { if (point < e.poids) return e; point -= e.poids; }
  return elements.at(-1);
}

const toutesLesCases = () => R.PILIERS.flatMap((p) => R.FORMATS.map((f) => ({ pilier: p.id, format: f.id })));

/**
 * Tire une contrainte pilier × format × service. `aleatoire` = la source d'aléatoire (une fonction qui rend un nombre de [0, 1), `Math.random` à l'écran, une suite fixe dans les tests).
 * Appels dans l'ordre : 1) le choix de la case pilier × format, 2) le choix du service.
 *  - pilier × format : parmi les cases suggérées par la matrice (`suggestions`, voir posts-logique.js) ; sans suggestion (aucun post connu), parmi toutes les cases (`origine: 'toutes'`).
 *  - service : tirage pondéré, les services les moins utilisés dans les posts classés et les idées passent plus souvent.
 * Rend { pilier, format, service, origine: 'suggestion' | 'toutes' }.
 */
export function tirerContrainte(aleatoire, { suggestions = [], classements = [], idees = [] } = {}) {
  if (typeof aleatoire !== 'function') throw new Error('Il faut une source d’aléatoire.');
  const cases = (suggestions || []).filter((s) => R.PILIERS.some((p) => p.id === s?.pilier) && R.FORMATS.some((f) => f.id === s?.format));
  const origine = cases.length ? 'suggestion' : 'toutes';
  const liste = cases.length ? cases : toutesLesCases();
  const choix = liste[Math.min(liste.length - 1, Math.floor(Math.min(Math.max(aleatoire(), 0), 0.999999999) * liste.length))];
  const service = tirerPondere(poidsServices(compterServices(classements, idees)), aleatoire());
  return { pilier: choix.pilier, format: choix.format, service: service.id, origine };
}

/** « Cas concrets × Vidéo 9:16 × Production ». */
export const libelleContrainte = (c) => [R.libellePilier(c?.pilier), R.libelleFormat(c?.format), R.libelleService(c?.service)].filter(Boolean).join(' × ');
