// Petites maisons « vue filtrée » du village (étape 3c de docs/accueil-village.md, étape 4 du cahier, 27/11/2026) : une petite maison (1 x 1 case), collée à une
// grande maison d'un module qui sait filtrer, ouvre l'écran de ce module sur UN élément (un chantier, un projet).
// Sans DOM, sans Firebase, sans aucun module métier : se teste seul (tests/maison-village.test.js). La lecture des éléments est dans village-petites-lecture.js.
//  - Manuelle : un document `petite` (p-…) choisi par l'utilisateur ; elle reste tant que son élément est dans la liste lue (archivé compris).
//  - Automatique : JAMAIS écrite ; calculée à chaque affichage depuis la liste lue (Chantiers : statut « en cours » et non archivé), à côté de la première
//    grande maison visible de ce module. Identifiant `a-<module>-<id de l'élément>` (jamais un identifiant de document).
//  - Sa place n'est jamais enregistrée : elle se recalcule depuis la place de sa grande, sur une des 12 cases qui l'entourent (ordre fixe : les côtés
//    d'abord, l'avant et le fond en dernier). Une petite ne bloque jamais une grande. Sans case voisine libre : seulement dans la vue Liste (téléphone).
import { batimentValable, nomCourt, occupation, dansDamier, DAMIER_DEPART, TAILLE_PETITE } from './village-damier.js';
import { cibleValide } from './maison-village.js';

/** Petites maisons manuelles au plus par utilisateur (P7). */
export const PETITES_MAX = 12;
/** Petites maisons automatiques au plus par grande maison (P7). */
export const AUTO_MAX = 6;

/** Modules qui savent montrer un seul élément : `un` (texte de la bulle), `auto` (petites maisons automatiques). */
export const SOURCES_PETITES = Object.freeze({
  achatschantiers: Object.freeze({ un: 'ce chantier', auto: true }),
  projets: Object.freeze({ un: 'ce projet', auto: false }),
});

const RE_PARENT = /^b-[a-z0-9-]{1,60}$/;

/** Le module d'une cible « #/<module>/… » (même règle que besoinsServis). */
export function moduleDeCible(cible) {
  return String(cible ?? '').replace(/^#\//, '').split('/')[0];
}

/** La source (module, textes) d'une grande maison si c'est un besoin d'un module qui sait filtrer, sinon null. */
export function sourcePour(maison) {
  if (!maison || maison.sorte !== 'besoin') return null;
  const module = moduleDeCible(maison.besoin?.cible);
  return Object.prototype.hasOwnProperty.call(SOURCES_PETITES, module) ? { module, ...SOURCES_PETITES[module] } : null;
}

/**
 * Les 12 cases qui entourent un bloc 2 x 2 dont le coin du fond est (c, l), dans l'ordre fixe de pose : d'abord les deux côtés purs (à gauche et à droite
 * à l'écran), puis les côtés proches, puis l'arrière, puis l'avant ; le fond et l'avant (dans l'axe de la maison) en dernier.
 */
export function casesVoisines(c, l) {
  return [
    [c - 1, l + 2], [c + 2, l - 1],
    [c - 1, l + 1], [c + 1, l - 1], [c + 2, l], [c, l + 2],
    [c - 1, l], [c, l - 1],
    [c + 2, l + 1], [c + 1, l + 2],
    [c - 1, l - 1], [c + 2, l + 2],
  ].map(([x, y]) => ({ c: x, l: y }));
}

/** Document d'une petite maison manuelle, ou null (cible qui n'est pas une route interne, parent qui n'est pas une grande maison de besoin). */
export function docPetite({ parent, nom, cible }) {
  if (typeof parent !== 'string' || !RE_PARENT.test(parent) || !cibleValide(cible)) return null;
  const d = { sorte: 'petite', parent, nom: nomCourt(nom) || 'Petite maison', cible };
  return batimentValable('p-essai', d) ? d : null;
}

/**
 * Range les petites maisons autour des grandes : { petites, sansPlace }.
 *  - `maisons` : les grandes maisons rangées (rangerVillage) ; `batiments` : Map(id → document) lue par lireBatiments ;
 *  - `elements` : Map(module → { etat: 'ok', liste } | { etat: 'erreur' } | undefined (lecture en cours)) ; un élément = { id, nom, sousTitre, cible, automatique, archive } ;
 *  - `modules` : les modules sources allumés pour la session.
 * Une petite = { id, sorte: 'petite', parent, nom, cible, auto, c, l, taille: 1, sousTitre, un, batiment, donnees } (`c`, `l` absents si sans place).
 */
export function rangerPetites({ maisons = [], batiments = new Map(), elements = new Map(), modules = [], damier = DAMIER_DEPART }) {
  const allumes = new Set(modules);
  const grandes = maisons.filter((m) => m.sorte === 'besoin' || m.sorte === 'lien');
  const parId = new Map(grandes.map((m) => [m.id, m]));
  const trouver = (module, cible) => {
    const r = elements.get(module);
    return r?.etat === 'ok' ? r.liste.find((e) => e.cible === cible) ?? null : null;
  };
  // 1. les manuelles montrées : grande visible, module allumé, lecture finie ; lecture réussie = l'élément doit être dans la liste (archivé compris)
  const manuelles = new Map(); // id de la grande → [petites]
  const ciblesManuelles = new Set();
  const docs = [...batiments].filter(([, d]) => d?.sorte === 'petite').sort(([u], [v]) => (u < v ? -1 : u > v ? 1 : 0));
  for (const [id, d] of docs) {
    const grande = parId.get(d.parent);
    const source = sourcePour(grande);
    const module = moduleDeCible(d.cible);
    if (!source || source.module !== module || !allumes.has(module)) continue;
    const lu = elements.get(module);
    if (!lu) continue; // lecture en cours : aucune petite maison
    let element = null;
    if (lu.etat === 'ok') { element = trouver(module, d.cible); if (!element) continue; } // élément disparu : pas montrée, document gardé
    ciblesManuelles.add(d.cible);
    const liste = manuelles.get(grande.id) ?? [];
    liste.push({ id, sorte: 'petite', parent: grande.id, nom: d.nom, cible: d.cible, auto: false, taille: TAILLE_PETITE, sousTitre: element?.sousTitre ?? '', un: source.un, batiment: grande.besoin?.batiment, donnees: d });
    manuelles.set(grande.id, liste);
  }
  // 2. les automatiques : à côté de la PREMIÈRE grande maison visible de chaque module qui en a
  const automatiques = new Map();
  const servis = new Set();
  for (const grande of grandes) {
    const source = sourcePour(grande);
    if (!source?.auto || servis.has(source.module) || !allumes.has(source.module)) continue;
    servis.add(source.module);
    const lu = elements.get(source.module);
    if (lu?.etat !== 'ok') continue;
    const liste = lu.liste.filter((e) => e.automatique && !e.archive && !ciblesManuelles.has(e.cible)).slice(0, AUTO_MAX)
      .map((e) => ({ id: `a-${source.module}-${e.id}`, sorte: 'petite', parent: grande.id, nom: nomCourt(e.nom) || 'Petite maison', cible: e.cible, auto: true, taille: TAILLE_PETITE, sousTitre: e.sousTitre ?? '', un: source.un, batiment: grande.besoin?.batiment, donnees: null }));
    automatiques.set(grande.id, liste);
  }
  // 3. la pose : grandes dans leur ordre, d'abord les manuelles, puis les automatiques ; une petite ne prend jamais une case d'une grande
  const prises = occupation(grandes);
  const petites = [];
  const sansPlace = [];
  for (const grande of grandes) {
    for (const p of [...(manuelles.get(grande.id) ?? []), ...(automatiques.get(grande.id) ?? [])]) {
      const place = casesVoisines(grande.c, grande.l).find(({ c, l }) => dansDamier(c, l, TAILLE_PETITE, damier) && !prises.has(`${c}-${l}`));
      if (!place) { sansPlace.push(p); continue; }
      prises.set(`${place.c}-${place.l}`, p.id);
      petites.push({ ...p, c: place.c, l: place.l });
    }
  }
  return { petites, sansPlace };
}

/** Nombre de petites maisons manuelles réellement rangées (posées ou sans place) : seules elles comptent pour la limite de 12 (une manuelle non montrée ne compte pas). */
export function nombreManuelles(rangement) {
  return [...(rangement?.petites ?? []), ...(rangement?.sansPlace ?? [])].filter((p) => !p.auto).length;
}

/** Vrai si une petite maison manuelle de plus est permise (moins de PETITES_MAX rangées). */
export function peutAjouterPetite(rangement) {
  return nombreManuelles(rangement) < PETITES_MAX;
}
