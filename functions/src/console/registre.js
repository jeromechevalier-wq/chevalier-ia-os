// Registre privé de la Console (28/11/2026, phase 2, PR 2) : la liste des bâtiments de Jérôme (maisons des clients), rangée dans la fiche
// reglages_maison/registre_console de la base du CRM de Jérôme. Fermée aux navigateurs (firestore.rules : reglages_maison ne se lit ni ne s'écrit, sauf deux fiches) ;
// lue par le serveur seul (`consoleBatiments`, `consoleReleve`) et écrite par le script scripts/console-registre.js (essai à blanc par défaut).
// Ce fichier n'importe RIEN (ni firebase-admin, ni firebase-functions) : le script du Mac l'importe tel quel pour valider le fichier privé avant de l'écrire.
// Dépôt public : aucun nom, aucun projet ici ; les vraies valeurs n'existent que dans la base. Un motif ne contient jamais une valeur lue (seulement un rang et une raison).

export const COLLECTION_REGISTRE = 'reglages_maison';
export const DOCUMENT_REGISTRE = 'registre_console';
export const SOUS_COLLECTION_RELEVES = 'releves';
export const SOUS_COLLECTION_HISTORIQUE_RELEVES = 'historique';

export const MOTIF_CLE = /^[a-z0-9-]{1,40}$/;
/** Même règle que scripts/donner-or-village.js (identifiant d'un projet Google) : verrouillé par un test. */
export const MOTIF_PROJET = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;
export const CLES_RESERVEES = Object.freeze(['os', 'immeuble']);
export const ETATS_BATIMENT = Object.freeze(['en_service', 'en_construction', 'a_venir']);
export const MAX_BATIMENTS = 20;
export const MAX_PROJETS = 10;
export const MAX_TEXTE = 80;
export const MAX_ROLE = 40;

/** Texte de 1 à `max` caractères (espaces autour retirés), sinon null. */
export function texteBorne(v, max = MAX_TEXTE) {
  if (typeof v !== 'string') return null;
  const t = v.trim();
  return t.length >= 1 && t.length <= max ? t : null;
}

const estObjet = (v) => Boolean(v) && typeof v === 'object' && !Array.isArray(v);

/** Liste de projets { role, libelle } ; une entrée invalide est ignorée avec un motif. Absente : liste vide. */
function validerProjets(liste, ou, motifs) {
  if (liste === undefined || liste === null) return [];
  if (!Array.isArray(liste)) { motifs.push(`${ou} : projets ignorés (ce n'est pas une liste)`); return []; }
  const r = [];
  liste.forEach((p, i) => {
    if (r.length >= MAX_PROJETS) { motifs.push(`${ou} : projet ${i + 1} ignoré (au-delà de ${MAX_PROJETS})`); return; }
    const role = estObjet(p) ? texteBorne(p.role, MAX_ROLE) : null;
    const libelle = estObjet(p) ? texteBorne(p.libelle) : null;
    if (!role || !libelle) { motifs.push(`${ou} : projet ${i + 1} ignoré (rôle ou libellé invalide)`); return; }
    r.push({ role, libelle });
  });
  return r;
}

/**
 * Valide la fiche du registre. `brut` : contenu de la fiche (ou null si elle n'existe pas : registre vide, cas normal).
 * `projetCourant` : identifiant du projet qui fait tourner le serveur (une maison ne peut pas pointer vers lui).
 * Rend { batiments: [{ cle, nom, genre, etat, projets, lecture_projet }], projets_os, projets_immeuble, motifs } ; ne lève jamais.
 */
export function validerRegistre(brut, { projetCourant = null } = {}) {
  const motifs = [];
  const vide = { batiments: [], projets_os: [], projets_immeuble: [], motifs };
  if (brut === undefined || brut === null) return vide;
  if (!estObjet(brut)) { motifs.push('registre ignoré (ce n\'est pas une fiche)'); return vide; }
  const projets_os = validerProjets(brut.projets_os, 'Chevalier IA OS', motifs);
  const projets_immeuble = validerProjets(brut.projets_immeuble, 'immeuble', motifs);
  const batiments = [];
  const vues = new Set();
  const liste = brut.batiments === undefined ? [] : brut.batiments;
  if (!Array.isArray(liste)) motifs.push('bâtiments ignorés (ce n\'est pas une liste)');
  (Array.isArray(liste) ? liste : []).forEach((b, i) => {
    const ou = `bâtiment ${i + 1}`;
    if (batiments.length >= MAX_BATIMENTS) { motifs.push(`${ou} ignoré (au-delà de ${MAX_BATIMENTS})`); return; }
    if (!estObjet(b)) { motifs.push(`${ou} ignoré (forme invalide)`); return; }
    if (typeof b.cle !== 'string' || !MOTIF_CLE.test(b.cle)) { motifs.push(`${ou} ignoré (clé invalide)`); return; }
    if (CLES_RESERVEES.includes(b.cle)) { motifs.push(`${ou} ignoré (clé réservée)`); return; }
    if (vues.has(b.cle)) { motifs.push(`${ou} ignoré (clé en double)`); return; }
    const nom = texteBorne(b.nom);
    if (!nom) { motifs.push(`${ou} ignoré (nom invalide)`); return; }
    if (b.genre !== 'maison') { motifs.push(`${ou} ignoré (genre invalide)`); return; }
    if (!ETATS_BATIMENT.includes(b.etat)) { motifs.push(`${ou} ignoré (état invalide)`); return; }
    let lecture_projet = null;
    if (b.lecture_projet !== undefined && b.lecture_projet !== null && b.lecture_projet !== '') {
      if (typeof b.lecture_projet !== 'string' || !MOTIF_PROJET.test(b.lecture_projet)) { motifs.push(`${ou} ignoré (projet à lire invalide)`); return; }
      if (projetCourant && b.lecture_projet === projetCourant) { motifs.push(`${ou} ignoré (le projet à lire est celui de Chevalier IA OS)`); return; }
      lecture_projet = b.lecture_projet;
    }
    vues.add(b.cle);
    batiments.push({ cle: b.cle, nom, genre: 'maison', etat: b.etat, projets: validerProjets(b.projets, ou, motifs), lecture_projet });
  });
  return { batiments, projets_os, projets_immeuble, motifs };
}

/** Lit la fiche brute du registre dans la base du CRM (SDK d'administration) : son contenu, ou null si elle n'existe pas. */
export async function lireRegistreBrut(db) {
  const f = await db.collection(COLLECTION_REGISTRE).doc(DOCUMENT_REGISTRE).get();
  return f.exists ? (f.data() ?? null) : null;
}
