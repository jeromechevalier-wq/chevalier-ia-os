// Import du Google Sheet de la veille vers les trois tables du module Veille (veille_sources, veille_contenus, veille_resumes).
// Partie PURE (aucun accès réseau, aucun Firebase) : elle transforme les lignes du Sheet en documents. Elle se teste seule
// (tests/veille-import.test.js). L'écriture est dans importer-sheet.js.
import { normaliserType, normaliserEtat } from '../../js/modules/veille/logique.js';

/** Quand le nom de la chaîne dans l'onglet « Vidéos » n'est pas celui de l'onglet « Chaînes suivies » (noms écrits à la main dans le Sheet). */
export const NOM_DE_SOURCE = Object.freeze({
  'IA et Stratégie': 'IA Strategy',
  'The Diary Of A CEO': 'diary of ceo',
});

const sansAccent = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '');
/** Identifiant de document sûr : minuscules, chiffres et tirets. */
export const slug = (t) => sansAccent(t).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');

const texte = (v) => (typeof v === 'string' ? v.trim() : '');
/** Retire les champs vides : on n'écrit pas de champ pour rien (et Firestore refuse `undefined`). */
const sansVides = (o) => Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined && v !== null && v !== ''));

/** Date d'une cellule du Sheet : « 2026-10-07T16:00:24+00:00 » ou « 2026-10-12 » (jour seul : midi UTC). `null` si illisible. */
export function dateDuSheet(v) {
  const t = texte(v);
  if (!t) return null;
  const d = new Date(/^\d{4}-\d{2}-\d{2}$/.test(t) ? `${t}T12:00:00Z` : t);
  return Number.isNaN(d.getTime()) ? null : d;
}

/** Lignes d'un onglet (première ligne = en-têtes) -> objets { colonne: valeur }. Les cellules absentes en fin de ligne valent ''. */
export function lignesEnObjets(valeurs) {
  const [entetes, ...lignes] = valeurs;
  return lignes.filter((l) => l.some((c) => texte(c) !== '')).map((l) => Object.fromEntries(entetes.map((e, i) => [e, texte(l[i] ?? '')])));
}

/** Identifiant d'une source : l'identifiant de chaîne YouTube s'il y en a un, sinon le nom en minuscules sans accent. */
export function idSource(l) {
  return l.identifiant_chaine_youtube || slug(l.nom);
}

/** Identifiant d'un contenu : celui du Sheet. Une adresse (newsletters) devient son dernier morceau (« the-overhang ») ; jamais de « / » dans un identifiant. */
export function idContenu(videoId) {
  const t = texte(videoId);
  if (/^https?:\/\//i.test(t)) {
    const dernier = new URL(t).pathname.split('/').filter(Boolean).pop() ?? '';
    return slug(dernier);
  }
  return t.replace(/\//g, '_');
}

/**
 * Transforme les deux onglets en documents. Renvoie { sources, contenus, resumes, avertissements } ;
 * chaque élément est { id, data }. Rien d'inventé : le modèle et le coût des anciens résumés ne sont pas dans le Sheet, donc pas écrits.
 * Seul « payeur: jerome » est posé : cette veille est la sienne.
 */
export function transformer(valeursSources, valeursVideos) {
  const avertissements = [];
  const sources = lignesEnObjets(valeursSources).map((l) => ({
    id: idSource(l),
    data: sansVides({
      nom: l.nom, url: l.url_chaine, page: l.page, type: normaliserType(l.type), actif: l.actif.toLowerCase() === 'oui',
      identifiantYoutube: l.identifiant_chaine_youtube, fluxRss: l.flux_rss, note: l.note, origine: 'google-sheet',
    }),
  }));
  const parNom = new Map(sources.map((s) => [s.data.nom, s]));

  const contenus = [];
  const resumes = [];
  const vus = new Set();
  for (const l of lignesEnObjets(valeursVideos)) {
    const id = idContenu(l.video_id);
    if (!id) { avertissements.push(`Ligne sans identifiant : « ${l.titre} »`); continue; }
    if (vus.has(id)) { avertissements.push(`Identifiant en double, ignoré : ${id}`); continue; }
    vus.add(id);
    const source = parNom.get(NOM_DE_SOURCE[l.chaine] ?? l.chaine);
    if (!source) avertissements.push(`Source introuvable pour « ${l.chaine} » (contenu ${id}) : sourceNom seulement`);
    const etat = normaliserEtat(l.statut);
    contenus.push({
      id,
      data: sansVides({
        sourceId: source?.id, sourceNom: source?.data.nom ?? l.chaine, titre: l.titre, url: l.url_video, type: normaliserType(l.type || source?.data.type),
        urlAudio: l.url_audio, etat, etapeEchec: l.etape_echec, datePublication: dateDuSheet(l.date_publication), detecteLe: dateDuSheet(l.ajoutee_le),
        traiteLe: dateDuSheet(l.traite_le), idOrigine: l.video_id, origine: 'google-sheet',
      }),
    });
    if (l.lien_resume_html || l.lien_resume_court || l.lien_transcript) {
      resumes.push({
        id: `r-${id}`,
        data: sansVides({
          contenuId: id, lienHtml: l.lien_resume_html, lienCourt: l.lien_resume_court, lienTranscript: l.lien_transcript,
          creeLe: dateDuSheet(l.traite_le), payeur: 'jerome', origine: 'google-sheet',
        }),
      });
    }
  }
  return { sources, contenus, resumes, avertissements };
}
