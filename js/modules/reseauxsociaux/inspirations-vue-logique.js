// Règles pures de l'écran « Inspirations » en liste dense (13/11/2026) : aucune dépendance à Firebase ni au DOM, importables par les tests Node.
// Sources (réelles + résumés de veille venus de `veille_contenus`, affichés tout seuls), filtres, regroupement des pistes par source, vue à plat, textes des compteurs.
// Rien ici n'écrit : l'écran lit, filtre et affiche. Les compteurs viennent de pistes-logique.js (calculés, jamais stockés).
import * as L from '../crm/logique.js';
import * as N from './inspirations-logique.js';
import * as P from './pistes-logique.js';

/** Les états d'une piste tels que l'écran les distingue (voir `etatAffichePiste`) : la marque affichée et le filtre « État ». */
export const ETATS_AFFICHES = Object.freeze([
  { id: 'stock', libelle: 'En stock' },
  { id: 'retenue', libelle: 'Retenue' },
  { id: 'redaction', libelle: 'En rédaction' },
  { id: 'postee', libelle: 'Postée' },
  { id: 'ecartee', libelle: 'Écartée' },
]);
export const libelleEtatAffiche = (id) => ETATS_AFFICHES.find((e) => e.id === id)?.libelle ?? '';

const sansAccent = (t) => L.normaliser(t);
const pluriel = (n, un, plusieurs) => `${new Intl.NumberFormat('fr-FR').format(n)} ${n > 1 ? plusieurs : un}`;

/** Coupe un texte à `max` caractères réels (jamais au milieu d'un emoji) et ajoute « … » s'il a été coupé. */
export function couper(texte, max) {
  const lettres = Array.from(String(texte ?? '').replace(/\s+/g, ' ').trim());
  return lettres.length > max ? `${lettres.slice(0, Math.max(1, max - 1)).join('').trimEnd()}…` : lettres.join('');
}

/** Un contenu de la Veille est un « résumé » quand son état commence par « resum » (le mot du Google Sheet d'origine ou de n8n, avec ou sans accent). */
const estResume = (contenu) => /^resum/.test(sansAccent(contenu?.etat).replace(/[\s-]+/g, '_'));

/**
 * Les sources affichées : les fiches réelles (dans l'ordre choisi), puis un résumé de veille par contenu de `veille_contenus` à l'état « résumé » qui n'a pas encore de fiche
 * (identifiant prévisible `veille-<id du contenu>` ; la fiche n'est créée qu'au premier lot de pistes déposé, voir `planAjouterPistes` avec `sourceExiste: false`).
 * Une source virtuelle porte `virtuelle: true`. Sans module Veille, `contenus` est vide : la liste est simplement sans résumés.
 */
export function sourcesAffichees(inspirations, contenus = []) {
  const reelles = N.trierInspirations(inspirations).map((s) => ({ ...s, type: N.typeSource(s), virtuelle: false }));
  const deja = new Set();
  for (const s of reelles) { deja.add(s.id); if (s.veilleContenuId) deja.add(P.idSourceVeille(s.veilleContenuId)); }
  const virtuelles = (contenus || []).filter((c) => c?.id && estResume(c) && !deja.has(P.idSourceVeille(c.id)))
    .map((c) => ({ id: P.idSourceVeille(c.id), type: 'veille', nom: String(c.titre ?? '').replace(/\s+/g, ' ').trim().slice(0, N.MAX_NOM) || 'Résumé sans titre', url: '', pourquoi: '', piliers: [], formats: [], resume: '', veilleContenuId: String(c.id), traiteLe: null, ordre: Number.MAX_SAFE_INTEGER, virtuelle: true }))
    .sort((a, b) => a.nom.localeCompare(b.nom, 'fr') || a.id.localeCompare(b.id));
  return [...reelles, ...virtuelles];
}

export const criteresInspirations = () => ({ recherche: '', types: [], piliers: [], formats: [], etats: [], sansPiste: false });

/** Nombre de filtres actifs (la recherche est dans la barre, elle ne compte pas) : sert au chiffre du bouton « Filtres ». */
export const nombreFiltresInspirations = (c = {}) => (c.types?.length ?? 0) + (c.piliers?.length ?? 0) + (c.formats?.length ?? 0) + (c.etats?.length ?? 0) + (c.sansPiste ? 1 : 0);

const dateCreation = (p) => L.versDate(p?.creeLe)?.getTime() ?? 0;
/** Les pistes d'une source, la plus récente d'abord (puis par angle, pour un ordre stable). */
export const pistesDeSource = (pistes, sourceId) => (pistes || []).filter((p) => p?.sourceId === sourceId)
  .sort((a, b) => dateCreation(b) - dateCreation(a) || String(a.angle ?? '').localeCompare(String(b.angle ?? ''), 'fr') || String(a.id).localeCompare(String(b.id)));

const contient = (texte, mot) => sansAccent(texte).includes(mot);

/**
 * Filtre les sources et leurs pistes. Rend [{ source, pistes (celles qui passent), total (toutes celles de la source), compteurs }] dans l'ordre des sources.
 *  - type de source : la source doit avoir l'un des types cochés ;
 *  - « sans piste » : seulement les sources qui n'ont aucune piste ;
 *  - pilier, format, état : seules les pistes qui correspondent restent ; une source sans piste restante disparaît ;
 *  - recherche : le mot est cherché dans le nom de la source (toutes ses pistes restent) ou dans l'angle et la note d'une piste (seules celles-là restent).
 */
export function filtrerSources(sources, pistes, idees, criteres = criteresInspirations()) {
  const mot = sansAccent(criteres.recherche).trim();
  const filtrePiste = !!(criteres.piliers?.length || criteres.formats?.length || criteres.etats?.length);
  const passe = (p) => (!criteres.piliers?.length || criteres.piliers.includes(p.pilier))
    && (!criteres.formats?.length || criteres.formats.includes(p.format))
    && (!criteres.etats?.length || criteres.etats.includes(P.etatAffichePiste(p, idees)));
  const sortie = [];
  for (const source of sources) {
    if (criteres.types?.length && !criteres.types.includes(source.type)) continue;
    const toutes = pistesDeSource(pistes, source.id);
    if (criteres.sansPiste && toutes.length) continue;
    let gardees = toutes.filter(passe);
    if (mot) {
      const parNom = contient(source.nom, mot);
      if (!parNom) gardees = gardees.filter((p) => contient(p.angle, mot) || contient(p.note, mot));
      if (!parNom && !gardees.length) continue;
    }
    if (filtrePiste && !criteres.sansPiste && !gardees.length) continue;
    sortie.push({ source, pistes: gardees, total: toutes.length, compteurs: P.compteursSource(source.id, pistes, idees) });
  }
  return sortie;
}

/** La vue « Toutes les pistes » : une liste à plat, la plus récente d'abord, chaque piste avec sa source. */
export function pistesAPlat(lignes) {
  return lignes.flatMap((l) => l.pistes.map((piste) => ({ piste, source: l.source })))
    .sort((a, b) => dateCreation(b.piste) - dateCreation(a.piste) || String(a.piste.angle ?? '').localeCompare(String(b.piste.angle ?? ''), 'fr') || String(a.piste.id).localeCompare(String(b.piste.id)));
}

/** « 12 pistes · 4 retenues · 3 postées » (zéro compris : « 0 piste »). */
export const libelleCompteurs = (c) => `${pluriel(c.pistes, 'piste', 'pistes')} · ${pluriel(c.retenues, 'retenue', 'retenues')} · ${pluriel(c.postees, 'postée', 'postées')}`;

/** Le jour d'aujourd'hui à Paris (AAAA-MM-JJ), pour l'étiquette d'un lot (« 2026-11-13-collage ») et la date de traitement. */
export const jourDuLot = (maintenant = new Date()) => L.aujourdhuiParis(maintenant);
export const etiquetteLot = (voie, maintenant = new Date()) => `${jourDuLot(maintenant)}-${voie}`;

/** Une ligne d'exemple de profil : « 1 200 réactions · 45 commentaires · × 2,3 la moyenne · relevé le 3 novembre 2026 » (les chiffres absents ne sont pas écrits). */
export function chiffresExemple(exemple, profil) {
  const parties = [];
  if (Number.isInteger(exemple?.reactions)) parties.push(pluriel(exemple.reactions, 'réaction', 'réactions'));
  if (Number.isInteger(exemple?.commentaires)) parties.push(pluriel(exemple.commentaires, 'commentaire', 'commentaires'));
  const ecart = N.ecartALaMoyenne(exemple, profil);
  if (ecart) parties.push(ecart.libelle);
  return parties.join(' · ');
}
