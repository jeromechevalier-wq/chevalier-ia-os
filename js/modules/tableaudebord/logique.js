// Logique pure du module Tableau de bord : niveau d'état affiché, tri, regroupement par famille, textes « il y a … ».
// Ce fichier n'importe rien (ni Firebase, ni navigateur) : il se teste seul (tests/tableaudebord-logique.test.js).
// Toutes les dates sont des MILLISECONDES (donnees.js convertit les Timestamps) et `maintenant` est toujours passé en paramètre.

export const MINUTE = 60000;
export const JOUR = 24 * 60 * MINUTE;
/** Une échéance à moins de 30 jours passe en « À surveiller » ; dépassée, elle passe en « Panne ». */
export const DELAI_ECHEANCE = 30 * JOUR;

/** Niveaux affichés, du plus grave au moins grave (c'est aussi l'ordre du tri). */
export const NIVEAUX = ['rouge', 'orange', 'gris', 'vert'];
export const LIBELLES = { vert: 'OK', orange: 'À surveiller', rouge: 'Panne', gris: 'Relevé trop ancien' };
export const LIBELLES_METHODE = { auto: 'auto', semi: 'semi', manuel: 'manuel' };
export const AIDE_METHODE = {
  auto: 'Vérifié tout seul par un script.',
  semi: 'Vérifié en partie par un script, en partie à la main.',
  manuel: 'Date saisie à la main.',
};

/** Tableaux connus, dans l'ordre des onglets. Général et Technique existent toujours ; Finance et Stocks seulement s'ils portent un indicateur. */
export const TABLEAUX = [
  { id: 'general', libelle: 'Général', toujours: true },
  { id: 'technique', libelle: 'Technique', toujours: true },
  { id: 'finance', libelle: 'Finance', toujours: false },
  { id: 'stocks', libelle: 'Stocks', toujours: false },
];

export const FAMILLES = { cles: 'Clés et autorisations', sauvegardes: 'Sauvegardes', automatisations: 'Automatisations' };
const FAMILLE_EN_TETE = 'cles';

const GRAVITE = { vert: 1, orange: 2, rouge: 3 };
const estNombre = (v) => typeof v === 'number' && Number.isFinite(v);
const niveauValide = (n) => (n === 'vert' || n === 'orange' || n === 'rouge' ? n : null);

/** Niveau tiré de l'échéance seule : null (loin), 'orange' (moins de 30 jours), 'rouge' (dépassée). */
export function niveauDeEcheance(echeanceMs, maintenant) {
  if (!estNombre(echeanceMs)) return null;
  const reste = echeanceMs - maintenant;
  if (reste < 0) return 'rouge';
  if (reste < DELAI_ECHEANCE) return 'orange';
  return null;
}

/** Le relevé est-il plus vieux que la durée de validité de l'indicateur ? Sans date de relevé ou sans durée : jamais « trop ancien ». */
export function releveTropAncien(releveMs, perimeApresMinutes, maintenant) {
  if (!estNombre(releveMs) || !estNombre(perimeApresMinutes)) return false;
  return maintenant > releveMs + perimeApresMinutes * MINUTE;
}

/**
 * Niveau affiché d'un indicateur : 'rouge' | 'orange' | 'gris' | 'vert' | null (null = pas de pastille d'état).
 * 1. le plus grave entre le niveau écrit par le script et celui de l'échéance (l'échéance vaut aussi pour une mesure) ;
 * 2. si le relevé est trop ancien et que le résultat n'est pas rouge : gris (le silence n'est jamais vert) ;
 * Une mesure sans niveau ni échéance proche n'a pas de pastille (valeur et unité seulement), même périmée.
 */
export function niveauEffectif(indicateur, maintenant) {
  const ecrit = niveauValide(indicateur?.niveau);
  const echeance = niveauDeEcheance(indicateur?.echeanceMs, maintenant);
  let niveau = ecrit;
  if (echeance && (!niveau || GRAVITE[echeance] > GRAVITE[niveau])) niveau = echeance;
  if (!niveau) return null;
  if (niveau !== 'rouge' && releveTropAncien(indicateur?.releveMs, indicateur?.perimeApresMinutes, maintenant)) return 'gris';
  return niveau;
}

/** Rang pour le tri : rouge, orange, gris, vert, puis sans pastille. */
export function rangNiveau(niveau) {
  const i = NIVEAUX.indexOf(niveau);
  return i === -1 ? NIVEAUX.length : i;
}

const comparerNoms = (a, b) => String(a ?? '').localeCompare(String(b ?? ''), 'fr', { sensitivity: 'base' });

/** Tri d'une liste d'indicateurs : rouge, orange, gris, vert, sans pastille ; à égalité, ordre alphabétique du nom. Ne modifie pas la liste reçue. */
export function trier(indicateurs, maintenant) {
  return indicateurs
    .map((i) => ({ i, rang: rangNiveau(niveauEffectif(i, maintenant)) }))
    .sort((a, b) => a.rang - b.rang || comparerNoms(a.i.nom, b.i.nom))
    .map((x) => x.i);
}

/** Nombre d'indicateurs par niveau affiché : { rouge, orange, gris, vert, sans }. */
export function compter(indicateurs, maintenant) {
  const c = { rouge: 0, orange: 0, gris: 0, vert: 0, sans: 0 };
  for (const i of indicateurs) {
    const n = niveauEffectif(i, maintenant);
    c[n ?? 'sans'] += 1;
  }
  return c;
}

/** Un niveau demande-t-il une action (rouge, orange ou gris) ? Vert et « sans pastille » : non. */
export const aTraiter = (niveau) => niveau === 'rouge' || niveau === 'orange' || niveau === 'gris';

/** Indicateurs à traiter, du plus grave au moins grave. */
export function listeATraiter(indicateurs, maintenant) {
  return trier(indicateurs, maintenant).filter((i) => aTraiter(niveauEffectif(i, maintenant)));
}

/** Phrase d'état global (écran Général). Aucun indicateur : chaîne vide (l'écran montre alors son état vide). */
export function phraseGlobale(compteurs) {
  const total = compteurs.rouge + compteurs.orange + compteurs.gris + compteurs.vert + (compteurs.sans ?? 0);
  if (total === 0) return '';
  if (compteurs.rouge === 1) return 'Une panne à traiter';
  if (compteurs.rouge > 1) return `${compteurs.rouge} pannes à traiter`;
  if (compteurs.orange > 0 || compteurs.gris > 0) return 'Tout marche, quelques points à surveiller';
  return 'Tout fonctionne';
}

/** Niveau de la phrase globale (pour sa couleur et son icône) : le plus grave présent, « vert » si tout va bien. */
export function niveauGlobal(compteurs) {
  if (compteurs.rouge > 0) return 'rouge';
  if (compteurs.orange > 0 || compteurs.gris > 0) return 'orange';
  return 'vert';
}

/** Mot affiché pour un compteur : « 1 panne », « 2 pannes », « 3 à surveiller », « 1 relevé trop ancien », « 4 OK ». */
export function libelleCompteur(niveau, n) {
  if (niveau === 'rouge') return `${n} ${n > 1 ? 'pannes' : 'panne'}`;
  if (niveau === 'gris') return `${n} ${n > 1 ? 'relevés trop anciens' : 'relevé trop ancien'}`;
  return `${n} ${LIBELLES[niveau]}`;
}

/** « il y a 5 min », « il y a 3 h », « il y a 2 j » ; moins d'une minute : « à l'instant » ; date inconnue : « date inconnue ». */
export function depuis(ms, maintenant) {
  if (!estNombre(ms)) return 'date inconnue';
  const minutes = Math.floor((maintenant - ms) / MINUTE);
  if (minutes < 1) return 'à l’instant';
  if (minutes < 60) return `il y a ${minutes} min`;
  const heures = Math.floor(minutes / 60);
  if (heures < 24) return `il y a ${heures} h`;
  return `il y a ${Math.floor(heures / 24)} j`;
}

/** Texte de l'échéance : « Échéance dans 12 jours », « Échéance dépassée depuis 3 jours » ; sans échéance : chaîne vide. */
export function texteEcheance(echeanceMs, maintenant) {
  if (!estNombre(echeanceMs)) return '';
  const reste = echeanceMs - maintenant;
  if (reste >= 0) {
    const jours = Math.ceil(reste / JOUR);
    return jours <= 1 ? 'Échéance dans moins de 24 h' : `Échéance dans ${jours} jours`;
  }
  const jours = Math.floor(-reste / JOUR);
  if (jours < 1) return 'Échéance dépassée depuis moins de 24 h';
  return `Échéance dépassée depuis ${jours} ${jours > 1 ? 'jours' : 'jour'}`;
}

/** Identifiant HTML sûr d'une famille (elle vient de la base) : tout caractère hors lettres, chiffres et tiret devient « - » ; sans famille : « autres ». */
export function idFamille(famille) {
  return `td-f-${String(famille || 'autres').replace(/[^a-z0-9-]/gi, '-')}`;
}

/** Nom affiché d'une famille : le nom connu, sinon le code avec une majuscule ; sans famille : « Autres ». */
export function nomFamille(famille) {
  if (!famille) return 'Autres';
  if (FAMILLES[famille]) return FAMILLES[famille];
  const t = String(famille);
  return t.charAt(0).toUpperCase() + t.slice(1);
}

/**
 * Regroupe par famille : [{ famille, titre, indicateurs (triés), compteurs }]. Ordre des blocs : « cles » d'abord, puis les autres par ordre
 * alphabétique du titre affiché. `indicateurs` : la liste à montrer ; `ensemble` (facultatif) : la liste complète de la famille, pour les compteurs
 * quand un filtre masque des lignes.
 */
export function regrouperParFamille(indicateurs, maintenant, ensemble = indicateurs) {
  const codes = [...new Set(indicateurs.map((i) => i.famille || ''))];
  codes.sort((a, b) => {
    if (a === FAMILLE_EN_TETE && b !== FAMILLE_EN_TETE) return -1;
    if (b === FAMILLE_EN_TETE && a !== FAMILLE_EN_TETE) return 1;
    return comparerNoms(nomFamille(a), nomFamille(b));
  });
  return codes.map((code) => ({
    famille: code,
    titre: nomFamille(code),
    indicateurs: trier(indicateurs.filter((i) => (i.famille || '') === code), maintenant),
    compteurs: compter(ensemble.filter((i) => (i.famille || '') === code), maintenant),
  }));
}

/** Onglets à montrer : Général et Technique toujours ; Finance et Stocks seulement si au moins un indicateur porte ce tableau. */
export function ongletsVisibles(indicateurs) {
  const presents = new Set(indicateurs.map((i) => i.tableau));
  return TABLEAUX.filter((t) => t.toujours || presents.has(t.id));
}

/** Indicateurs d'un tableau (technique, finance, stocks). Le Général regarde tous les tableaux : voir `tous`. */
export const duTableau = (indicateurs, tableau) => indicateurs.filter((i) => i.tableau === tableau);

/** Filtre « Tout voir / À traiter » combiné avec le filtre de famille ('' = toutes). */
export function filtrer(indicateurs, { traiter = false, famille = '' } = {}, maintenant) {
  return indicateurs.filter((i) => (!traiter || aTraiter(niveauEffectif(i, maintenant))) && (!famille || (i.famille || '') === famille));
}

/** Familles que le filtre « À traiter » laisse possibles (pour ne proposer que des valeurs utiles) : [{ valeur, libelle }] dans l'ordre des blocs. */
export function famillesPossibles(indicateurs, { traiter = false } = {}, maintenant) {
  const restants = filtrer(indicateurs, { traiter }, maintenant);
  return regrouperParFamille(restants, maintenant).map((g) => ({ valeur: g.famille, libelle: g.titre }));
}

/** Valeur d'une mesure pour l'affichage : « 1 240 € », « 12 jours » ; sans valeur : chaîne vide. */
export function texteValeur(valeur, unite) {
  if (valeur === null || valeur === undefined || valeur === '') return '';
  const nombre = typeof valeur === 'number' && Number.isFinite(valeur) ? new Intl.NumberFormat('fr-FR').format(valeur) : String(valeur);
  return unite ? `${nombre} ${unite}` : nombre;
}

/** Un indicateur se saisit à la main seulement s'il est « manuel » ou « semi » : un « auto » est vérifié par un script, il n'a pas de bouton. */
export const peutSaisir = (indicateur) => indicateur?.methode === 'manuel' || indicateur?.methode === 'semi';

/** Texte du bouton de saisie : une date pour un état, une valeur pour une mesure. */
export const libelleSaisie = (indicateur) => (indicateur?.type === 'mesure' ? 'Saisir la valeur' : 'Saisir la date');
