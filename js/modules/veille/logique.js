// Module Veille : règles d'affichage (types, états, compteurs, filtres, textes). Aucune dépendance (ni Firebase ni DOM) :
// ce fichier se teste seul (tests/veille-logique.test.js).
// Trois tables (règle de nommage `module_table`) : veille_sources (ce que Jérôme suit), veille_contenus (vidéos, épisodes, articles
// détectés) et veille_resumes (un résumé produit pour un contenu : modèle, coût, qui paie, liens des fichiers).

export const TYPES = ['YouTube', 'Podcast', 'Newsletter'];
export const LIBELLES_ETAT = { nouveau: 'Nouveau', en_cours: 'En cours', resume: 'Résumé', echec: 'Échec' };
export const OPTIONS_ETAT = [
  { valeur: '', libelle: 'Tous les états' }, { valeur: 'nouveau', libelle: 'Nouveaux' }, { valeur: 'en_cours', libelle: 'En cours' },
  { valeur: 'resume', libelle: 'Résumés' }, { valeur: 'echec', libelle: 'Échecs' },
];
export const LIBELLES_PAYEUR = { jerome: 'Moi', client: 'Le client' }; // « jerome » = le propriétaire de la base (mot neutre à l'écran)

const sansAccent = (t) => String(t ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').trim().toLowerCase();

/** Horodatage Firestore, Date ou nombre -> millisecondes (ou null). */
export function enMs(v) {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (v instanceof Date) return v.getTime();
  if (typeof v.toMillis === 'function') return v.toMillis();
  return null;
}

/** Type d'une source ou d'un contenu : YouTube, Podcast ou Newsletter. Un type vide ou inconnu vaut YouTube (comme dans le Google Sheet d'origine). */
export function normaliserType(brut) {
  const t = sansAccent(brut);
  if (t === 'podcast') return 'Podcast';
  if (t === 'newsletter') return 'Newsletter';
  return 'YouTube';
}

/** État d'un contenu : nouveau, en_cours, resume ou echec. Accepte les mots du Google Sheet (« en cours », « résumée », « échec »…). */
export function normaliserEtat(brut) {
  const t = sansAccent(brut).replace(/[\s-]+/g, '_');
  if (t === 'en_cours') return 'en_cours';
  if (t.startsWith('resum')) return 'resume';
  if (t.startsWith('echec') || t.startsWith('erreur')) return 'echec';
  return 'nouveau';
}

/** Un lien n'est cliquable que s'il commence par http:// ou https:// (jamais javascript: ni autre chose). Sinon `null`. */
export function lienSur(url) {
  const t = String(url ?? '').trim();
  return /^https?:\/\/\S+$/i.test(t) ? t : null;
}

/** Date lisible : « 14 oct. » (même année) ou « 14 oct. 2025 ». `null` si inconnue. */
export function dateTexte(v, maintenant = Date.now()) {
  const ms = enMs(v);
  if (ms === null) return null;
  const d = new Date(ms);
  const memeAnnee = d.getFullYear() === new Date(maintenant).getFullYear();
  return d.toLocaleDateString('fr-FR', memeAnnee ? { day: 'numeric', month: 'short' } : { day: 'numeric', month: 'short', year: 'numeric' });
}

/** Coût d'un résumé : « 0,002 $ » (ou « 0,018 € »). `null` si le coût n'est pas connu. */
export function coutTexte(resume) {
  const c = resume?.coutReel;
  if (typeof c !== 'number' || !Number.isFinite(c)) return null;
  const symbole = resume.devise === 'EUR' ? '€' : '$';
  return `${c.toFixed(3).replace('.', ',')} ${symbole}`;
}

/** Résumé le plus récent de chaque contenu : Map contenuId -> résumé. */
export function dernierResumeParContenu(resumes) {
  const m = new Map();
  for (const r of resumes) {
    if (!r.contenuId) continue;
    const deja = m.get(r.contenuId);
    if (!deja || (enMs(r.creeLe) ?? 0) >= (enMs(deja.creeLe) ?? 0)) m.set(r.contenuId, r);
  }
  return m;
}

/** Les quatre compteurs du haut de page. */
export function compteurs(contenus) {
  const c = { nouveau: 0, en_cours: 0, resume: 0, echec: 0 };
  for (const x of contenus) c[normaliserEtat(x.etat)]++;
  return c;
}

/** Date de tri d'un contenu : publication, sinon détection. */
const dateDeTri = (x) => enMs(x.datePublication) ?? enMs(x.detecteLe) ?? 0;

/** Liste filtrée (source, type, état, texte dans le titre) et triée : les plus récents d'abord. */
export function filtrer(contenus, { sourceId = '', type = '', etat = '', texte = '' } = {}) {
  const mot = sansAccent(texte);
  return contenus
    .filter((x) => {
      if (sourceId && x.sourceId !== sourceId) return false;
      if (type && normaliserType(x.type) !== type) return false;
      if (etat && normaliserEtat(x.etat) !== etat) return false;
      if (mot && !sansAccent(x.titre).includes(mot)) return false;
      return true;
    })
    .sort((a, b) => dateDeTri(b) - dateDeTri(a) || String(a.id).localeCompare(String(b.id)));
}

/** Sources pour le filtre : [{ id, nom }], triées par nom. */
export function optionsSources(sources, contenus = []) {
  const m = new Map();
  for (const s of sources) m.set(s.id, String(s.nom || 'Source'));
  for (const x of contenus) if (x.sourceId && !m.has(x.sourceId)) m.set(x.sourceId, String(x.sourceNom || 'Source'));
  return [...m].map(([id, nom]) => ({ id, nom })).sort((a, b) => a.nom.localeCompare(b.nom, 'fr'));
}

/** Nom affiché de la source d'un contenu : celui de la source, sinon celui recopié dans le contenu. */
export function nomSource(contenu, sources) {
  const s = sources.find((x) => x.id === contenu.sourceId);
  return String(s?.nom || contenu.sourceNom || 'Source inconnue');
}

/** Sources triées : actives d'abord, puis par nom. */
export function trierSources(sources) {
  return [...sources].sort((a, b) => Number(b.actif === true) - Number(a.actif === true) || String(a.nom).localeCompare(String(b.nom), 'fr'));
}

/** Nombre de contenus par source : Map sourceId -> nombre. */
export function nombreParSource(contenus) {
  const m = new Map();
  for (const x of contenus) if (x.sourceId) m.set(x.sourceId, (m.get(x.sourceId) ?? 0) + 1);
  return m;
}
