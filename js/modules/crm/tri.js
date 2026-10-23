// Tri uniforme des listes (affaires, projets, personnes, organisations) : un seul état { critere, sens } par écran, que pilotent
// le menu « Trier par », le bouton flèche et le clic sur l'en-tête de colonne. Module pur (aucun accès à l'écran), testé dans tests/tri.test.js.
import { trier, versDate } from './logique.js';

/**
 * Table des critères de chaque écran. `sens` : sens quand on choisit le critère (Montant et Création : le plus grand / le plus récent d'abord).
 * `menu: false` : critère de colonne seulement, proposé dans le menu uniquement tant qu'il est choisi (par un clic sur la colonne).
 */
export const TRIS = {
  affaires: {
    defaut: { critere: 'activite', sens: 'asc' },
    criteres: [
      { id: 'activite', libelle: 'Activité suivante', sens: 'asc' },
      { id: 'montant', libelle: 'Montant', sens: 'desc' },
      { id: 'titre', libelle: 'Titre', sens: 'asc' },
      { id: 'creation', libelle: 'Date de création', sens: 'desc' },
      { id: 'personne', libelle: 'Personne', sens: 'asc', menu: false },
      { id: 'organisation', libelle: 'Organisation', sens: 'asc', menu: false },
      { id: 'etape', libelle: 'Étape', sens: 'asc', menu: false },
      { id: 'priorite', libelle: 'Priorité', sens: 'asc', menu: false },
    ],
  },
  projets: {
    defaut: { critere: 'titre', sens: 'asc' },
    criteres: [
      { id: 'titre', libelle: 'Titre', sens: 'asc' },
      { id: 'creation', libelle: 'Date de création', sens: 'desc' },
      { id: 'debut', libelle: 'Début', sens: 'asc' },
      { id: 'fin', libelle: 'Fin prévue', sens: 'asc' },
      { id: 'personne', libelle: 'Personne', sens: 'asc', menu: false },
      { id: 'organisation', libelle: 'Organisation', sens: 'asc', menu: false },
      { id: 'phase', libelle: 'Phase', sens: 'asc', menu: false },
      { id: 'statut', libelle: 'Statut', sens: 'asc', menu: false },
    ],
  },
  personnes: {
    defaut: { critere: 'nom', sens: 'asc' },
    criteres: [
      { id: 'nom', libelle: 'Nom', sens: 'asc' },
      { id: 'organisation', libelle: 'Organisation', sens: 'asc' },
      { id: 'ville', libelle: 'Ville', sens: 'asc' },
      { id: 'creation', libelle: 'Date de création', sens: 'desc' },
      { id: 'email', libelle: 'Email', sens: 'asc', menu: false },
      { id: 'telephone', libelle: 'Téléphone', sens: 'asc', menu: false },
      { id: 'etiquettes', libelle: 'Étiquettes', sens: 'asc', menu: false },
    ],
  },
  organisations: {
    defaut: { critere: 'nom', sens: 'asc' },
    criteres: [
      { id: 'nom', libelle: 'Nom', sens: 'asc' },
      { id: 'ville', libelle: 'Ville', sens: 'asc' },
      { id: 'secteur', libelle: 'Secteur', sens: 'asc' },
      { id: 'affaires', libelle: 'Affaires en cours', sens: 'desc' },
      { id: 'creation', libelle: 'Date de création', sens: 'desc' },
      { id: 'personnes', libelle: 'Personnes', sens: 'desc', menu: false },
      { id: 'etiquettes', libelle: 'Étiquettes', sens: 'asc', menu: false },
    ],
  },
};

const sensValide = (s) => (s === 'asc' || s === 'desc' ? s : null);
export const critereDe = (ecran, id) => TRIS[ecran]?.criteres.find((c) => c.id === id) || null;
export const triParDefaut = (ecran) => ({ ...TRIS[ecran].defaut });

/** Valide un tri lu quelque part (objet, ou texte JSON) : toute valeur inconnue ou abîmée redonne le tri de départ de l'écran. */
export function validerTri(ecran, brut) {
  let v = brut;
  if (typeof v === 'string') { try { v = JSON.parse(v); } catch { v = null; } }
  const c = v && typeof v === 'object' ? critereDe(ecran, v.critere) : null;
  if (!c) return triParDefaut(ecran);
  return { critere: c.id, sens: sensValide(v.sens) || c.sens };
}

/**
 * Tri mémorisé d'un écran. `lire(cle)` renvoie le texte enregistré ou null (ex. lirePreference). Pour les affaires, l'ancienne clé `tri.kanban`
 * (un simple identifiant de critère) est lue tant que `tri.affaires` n'existe pas : le choix de Jérôme n'est pas perdu.
 */
export function lireTriMemorise(ecran, lire) {
  const actuel = lire(`tri.${ecran}`);
  if (actuel) return validerTri(ecran, actuel);
  if (ecran === 'affaires') {
    const ancien = critereDe('affaires', lire('tri.kanban'));
    if (ancien) return { critere: ancien.id, sens: ancien.sens };
  }
  return triParDefaut(ecran);
}

export const texteTri = (etat) => JSON.stringify({ critere: etat.critere, sens: etat.sens });

/** Choix dans le menu : le critère prend son sens de départ. */
export function triApresChoix(ecran, critere) {
  const c = critereDe(ecran, critere);
  return c ? { critere: c.id, sens: c.sens } : triParDefaut(ecran);
}

/** Clic sur un en-tête de colonne : même colonne = on inverse ; autre colonne = son sens de départ. */
export function triApresClicColonne(ecran, etat, colonne) {
  if (etat.critere === colonne) return inverserSens(etat);
  return triApresChoix(ecran, colonne);
}

export const inverserSens = (etat) => ({ critere: etat.critere, sens: etat.sens === 'asc' ? 'desc' : 'asc' });

/** Options du menu : les critères de menu, plus le critère choisi s'il vient d'une colonne seulement. */
export function optionsMenu(ecran, critereChoisi) {
  return TRIS[ecran].criteres.filter((c) => c.menu !== false || c.id === critereChoisi);
}

/** Clé de tri « Création » : l'instant de création, ou null (fiche ancienne sans date) : null reste toujours à la fin, dans les deux sens. */
export const cleCreation = (fiche) => versDate(fiche?.creeLe)?.getTime() ?? null;

/** Trie `lignes` selon l'état ; `cles` : { <id de critère>: (ligne) => valeur }. Un critère sans clé laisse l'ordre d'origine. */
export function trierSelon(lignes, etat, cles) {
  const cle = cles[etat.critere];
  return cle ? trier(lignes, cle, etat.sens) : [...lignes];
}
