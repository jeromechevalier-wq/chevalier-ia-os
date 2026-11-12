// Relevé hebdomadaire des chiffres des posts LinkedIn (module Réseaux sociaux) : Buffer ne donne que les chiffres d'AUJOURD'HUI et ne garantit pas son historique,
// donc chaque semaine on en prend une photo dans notre table `reseauxsociaux_mesures` (base chevalier-ia-os). Un document par post publié et par semaine ISO (heure de Paris).
// Module sans réseau ni base : Buffer (`service`), Firestore (`donnees`) et l'horloge sont injectés, pour tout tester avec des faux.
// Lecture seule côté Buffer. Côté base : `donnees.ecrire(documents)` REMPLACE le document de la semaine (même identifiant = même document : relancer ne double rien).
import { TYPES_MESURES } from './service.js';

export const COLLECTION_MESURES = 'reseauxsociaux_mesures';
const IDENTIFIANT_POST = /^[A-Za-z0-9_-]{1,64}$/;

const FORMAT_PARIS = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Paris', year: 'numeric', month: 'numeric', day: 'numeric' });

/** Semaine ISO 8601 (lundi au dimanche) du jour CIVIL à Paris de cet instant, au format « AAAA-Sss » (ex. 2026-S46). L'année est celle de la semaine ISO (le 1er janvier peut être en S52/S53 de l'année d'avant). */
export function semaineIsoParis(instant) {
  const d = instant instanceof Date ? instant : new Date(instant);
  if (Number.isNaN(d.getTime())) throw new RangeError('Date invalide.');
  const p = Object.fromEntries(FORMAT_PARIS.formatToParts(d).map((x) => [x.type, Number(x.value)]));
  const jour = new Date(Date.UTC(p.year, p.month - 1, p.day));
  jour.setUTCDate(jour.getUTCDate() + 4 - (jour.getUTCDay() || 7)); // le jeudi de cette semaine donne l'année ISO
  const annee = jour.getUTCFullYear();
  const numero = Math.ceil(((jour.getTime() - Date.UTC(annee, 0, 1)) / 86_400_000 + 1) / 7);
  return `${annee}-S${String(numero).padStart(2, '0')}`;
}

/** Identifiant du document : `<idPostBuffer>_<AAAA-Sss>`. */
export const idMesure = (postId, semaine) => `${postId}_${semaine}`;

/**
 * Le document de la semaine pour un post publié, ou null s'il n'a AUCUN chiffre (rien à photographier). Seules les métriques réellement renvoyées par Buffer sont écrites
 * (jamais de 0 inventé). Les dates sont de vrais objets Date (la base les range en instants).
 */
export function construireMesure(post, { semaine, releveLe }) {
  const mesures = {};
  for (const type of TYPES_MESURES) if (Object.hasOwn(post.mesures ?? {}, type) && Number.isFinite(post.mesures[type])) mesures[type] = post.mesures[type];
  if (Object.keys(mesures).length === 0) return null;
  const doc = { postId: post.id, semaine, releveLe: new Date(releveLe) };
  if (post.metricsUpdatedAt) doc.metricsUpdatedAt = new Date(post.metricsUpdatedAt);
  if (post.publieLe) doc.publieLe = new Date(post.publieLe);
  return { ...doc, ...mesures };
}

/**
 * Lit tous les posts publiés dans Buffer et écrit les mesures de la semaine en cours.
 * Rend le compte rendu complet (jamais de plafond silencieux) : { ok, semaine, releveLe, pages, lus, publies, ecrits, dejaReleves, sansChiffres, ignores, tronque, raisonTronque }.
 * `tronque` vrai = tous les posts n'ont pas pu être lus : le dire à Jérôme ; ce qui a été lu est quand même écrit.
 */
export async function releverMesures({ service, donnees, maintenant = Date.now, journal = () => {}, ecraser = true }) {
  const instant = new Date(maintenant());
  const semaine = semaineIsoParis(instant);
  const lecture = await service.lirePostsPublies();
  const documents = [];
  let sansChiffres = 0;
  let ignores = 0;
  for (const post of lecture.posts) {
    if (!IDENTIFIANT_POST.test(post.id)) { ignores += 1; continue; } // identifiant inattendu : jamais utilisé tel quel comme nom de document
    const doc = construireMesure(post, { semaine, releveLe: instant });
    if (!doc) { sansChiffres += 1; continue; }
    documents.push({ id: idMesure(post.id, semaine), donnees: doc });
  }
  // `ecraser` vrai (relevé planifié) : le document de la semaine est remplacé. Faux (relevé à la main) : un document déjà relevé cette semaine est laissé tel quel et compté.
  let ecrits = 0;
  let dejaReleves = 0;
  if (documents.length > 0) ({ ecrits, ignores: dejaReleves } = await donnees.ecrire(COLLECTION_MESURES, documents, { ecraser }));
  const compte = {
    ok: true, semaine, releveLe: instant.toISOString(), pages: lecture.pages, lus: lecture.lus, publies: lecture.posts.length,
    ecrits, dejaReleves, sansChiffres, ignores, tronque: lecture.tronque, raisonTronque: lecture.raisonTronque,
  };
  journal({ ...compte, statut: lecture.tronque ? 'tronque' : 'ok' });
  return compte;
}
